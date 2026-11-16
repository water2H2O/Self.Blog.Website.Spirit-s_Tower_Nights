/**
 * 一条消息的渲染。
 *
 * 内容块按上游到达顺序原样排，但**工具调用会合并成一个可折叠分组**：
 * 深度思考搜索一轮可能打开十几个网页，如果每条都占一行，回答正文会被
 * 挤到看不见。折叠后的摘要行形如「搜索 3 次 · 打开网页 12 个 · 页内查找 2 次」，
 * 展开才看明细。
 */

import Markdown from './Markdown.tsx';
import { mergeAdjacentText } from './merge.ts';
import type {
	ChatMessage,
	ServerToolUse,
	TextBlock,
	WebFetchResultBlock,
	WebSearchResultBlock,
} from './types.ts';
import { costOf, fmtCost } from './cost.ts';

function hostOf(url?: string | null): string {
	if (!url) return '';
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

type ToolEntry = {
	use?: ServerToolUse;
	search?: WebSearchResultBlock;
	fetch?: WebFetchResultBlock;
};

/** 把连续的「调用 + 结果」块并成一组，其余内容块保持原位 */
function groupContent(blocks: ChatMessage['content']): (ChatMessage['content'][number] | ToolEntry[])[] {
	const out: (ChatMessage['content'][number] | ToolEntry[])[] = [];
	let group: ToolEntry[] | null = null;

	const flush = () => {
		if (group && group.length > 0) out.push(group);
		group = null;
	};

	for (const block of blocks) {
		if (block.type === 'server_tool_use') {
			if (!group) group = [];
			group.push({ use: block });
			continue;
		}
		if (block.type === 'web_search_tool_result' || block.type === 'web_fetch_tool_result') {
			if (!group) group = [];
			const target = group.find((entry) => entry.use && entry.use.id === block.tool_use_id && !entry.search && !entry.fetch);
			if (target) {
				if (block.type === 'web_search_tool_result') target.search = block;
				else target.fetch = block;
			} else {
				group.push(block.type === 'web_search_tool_result' ? { search: block } : { fetch: block });
			}
			continue;
		}
		flush();
		out.push(block);
	}
	flush();
	return out;
}

function summarize(group: ToolEntry[]): string {
	let search = 0;
	let imageSearch = 0;
	let open = 0;
	let read = 0;
	let find = 0;
	for (const entry of group) {
		const action = entry.use?.input?.action;
		if (action === 'search') {
			if (entry.use?.kind === 'image_search' || entry.use?.kind === 'deep_image_search') imageSearch += 1;
			else search += 1;
		} else if (action === 'open_page') open += 1;
		else if (action === 'read_link') read += 1;
		else if (action === 'find_in_page') find += 1;
	}
	const parts: string[] = [];
	if (search > 0) parts.push(`搜索 ${search} 次`);
	if (imageSearch > 0) parts.push(`图片搜索 ${imageSearch} 次`);
	if (open > 0) parts.push(`打开网页 ${open} 个`);
	if (read > 0) parts.push(`阅读链接 ${read} 个`);
	if (find > 0) parts.push(`页内查找 ${find} 次`);
	return parts.length > 0 ? parts.join(' · ') : '工具调用';
}

const FETCH_ERRORS: Record<string, string> = {
	url_not_accessible: '无法读取这个链接',
	url_not_allowed: '这个链接不允许读取，或未通过内容审核',
	unavailable: '读取失败，稍后再试',
};

function SearchResults({ block }: { block: WebSearchResultBlock }) {
	const items = Array.isArray(block.content) ? block.content : [];
	if (items.length === 0) return <p className="ac-tool-empty">没有搜到结果</p>;
	return (
		<ul className="ac-res-list">
			{items.map((item, index) => {
				if (item.error_code) return <li key={index}>搜索失败（{item.error_code}）</li>;
				return (
					<li key={item.url ?? index}>
						<a href={item.url} target="_blank" rel="noreferrer noopener" title={item.snippet ?? undefined}>
							<span className="ac-res-site">{item.site_name || hostOf(item.url)}</span>
							{item.title ?? item.url ?? '未命名结果'}
						</a>
					</li>
				);
			})}
		</ul>
	);
}

function ToolGroup({ group, streaming }: { group: ToolEntry[]; streaming: boolean }) {
	return (
		<details className="ac-tools" open={streaming ? true : undefined}>
			<summary>
				<span className="ac-tools-summary">{summarize(group)}</span>
			</summary>
			<div className="ac-tools-body">
				{group.map((entry, index) => {
					const use = entry.use;
					const action = use?.input?.action;
					const kind =
						action === 'search'
							? use?.kind && /image/.test(use.kind)
								? '图片'
								: '搜索'
							: action === 'open_page'
								? '打开'
								: action === 'find_in_page'
									? '查找'
									: action === 'read_link'
										? '阅读'
										: '工具';

					const fetched = entry.fetch?.content;
					const fetchedTitle =
						fetched && fetched.type === 'web_fetch_result' ? (fetched.content?.title ?? '') : '';
					const fetchedUrl = fetched && fetched.type === 'web_fetch_result' ? fetched.url : use?.input?.url;
					const fetchError = fetched && fetched.type === 'web_fetch_tool_result_error' ? fetched.error_code : '';

					return (
						<div className="ac-tool-item" key={`${use?.id ?? 'r'}-${index}`}>
							<span className="ac-tool-kind">{kind}</span>
							<span className="ac-tool-text">
								{action === 'search' && (
									<>
										{(use?.input?.queries ?? []).join(' · ') || '按图搜索'}
										{entry.search && <span className="ac-tool-count"> · {entry.search.content?.length ?? 0} 条结果</span>}
									</>
								)}
								{action === 'open_page' && (
									<a href={fetchedUrl} target="_blank" rel="noreferrer noopener">
										{hostOf(fetchedUrl)}
										{fetchedTitle ? ` · ${fetchedTitle}` : ''}
									</a>
								)}
								{action === 'read_link' && (
									<a href={fetchedUrl} target="_blank" rel="noreferrer noopener">
										{hostOf(fetchedUrl)}
										{fetchedTitle ? ` · ${fetchedTitle}` : ''}
									</a>
								)}
								{action === 'find_in_page' && <>{(use?.input?.pattern ?? '').slice(0, 80)}</>}
								{fetchError && <span className="ac-tool-count"> · {FETCH_ERRORS[fetchError] ?? fetchError}</span>}
							</span>
						</div>
					);
				})}

				{group.map((entry, index) => (entry.search ? <SearchResults block={entry.search} key={`r-${index}`} /> : null))}
			</div>
		</details>
	);
}

function cleanTitle(citation: { title: string | null; url: string }): string {
	const raw = (citation.title || hostOf(citation.url) || citation.url).replace(/\s+/g, ' ').trim();
	// 上游的 title 有时自带「1. 」这种编号，和列表序号叠在一起会变成「1. 1. …」
	return raw.replace(/^\d+[.、)]\s*/, '');
}

/** 整条消息的来源汇总：去重、折叠，只在末尾出现一次 */
function Sources({ citations }: { citations: TextBlock['citations'] }) {
	if (!citations || citations.length === 0) return null;
	const seen = new Set<string>();
	const unique = citations.filter((citation) => {
		if (!citation.url || seen.has(citation.url)) return false;
		seen.add(citation.url);
		return true;
	});
	if (unique.length === 0) return null;

	return (
		<details className="ac-sources">
			<summary>来源 · {unique.length} 条</summary>
			<ol>
				{unique.map((citation) => (
					<li key={citation.url}>
						<a href={citation.url} target="_blank" rel="noreferrer noopener" title={citation.title ?? citation.url}>
							{cleanTitle(citation)}
						</a>
					</li>
				))}
			</ol>
		</details>
	);
}

export default function MessageView({
	message,
	onRegenerate,
	showCost = true,
}: {
	message: ChatMessage;
	onRegenerate?: (message: ChatMessage) => void;
	/** 自定义接口的计价未知，隐藏人民币估算 */
	showCost?: boolean;
}) {
	if (message.role === 'user') {
		const text = message.content
			.filter((block): block is TextBlock => block.type === 'text')
			.map((block) => block.text)
			.join('\n');
		return (
			<div className="ac-row ac-row-user">
				<div className="ac-user-bubble">
					{message.attachments && message.attachments.length > 0 && (
						<div className="ac-attach-list">
							{message.attachments.map((attachment) => (
								<span className="ac-attach" key={attachment.fileId}>
									{attachment.kind === 'image' ? '图片' : '文档'} · {attachment.name}
								</span>
							))}
						</div>
					)}
					{text && <div className="ac-user-text">{text}</div>}
				</div>
			</div>
		);
	}

	const refused = message.stopReason === 'refusal';
	const truncated = message.stopReason === 'max_tokens';
	const hasContent = message.content.length > 0;
	// 引用会把正文切成多个块，先合并再分组，否则表格会被劈成两半
	const items = groupContent(mergeAdjacentText(message.content));
	// 来源统一在末尾汇总一次，不再每段回答后面挂一坨
	const allCitations = message.content
		.filter((block): block is TextBlock => block.type === 'text')
		.flatMap((block) => block.citations ?? []);

	return (
		<div className="ac-row">
			<div className="ac-answer">
				{items.map((item, index) => {
					if (Array.isArray(item)) {
						return <ToolGroup group={item} streaming={Boolean(message.streaming)} key={`tools-${index}`} />;
					}
					if (item.type === 'thinking') {
						return (
							<details className="ac-think" key={index} open={Boolean(message.streaming)}>
								<summary>思考过程</summary>
								<div className="ac-think-body">{item.thinking}</div>
							</details>
						);
					}
					if (item.type === 'text') {
						return (
							<div className="ac-block-text" key={index}>
								<Markdown text={item.text} />
							</div>
						);
					}
					return null;
				})}

				{message.streaming && <span className="ac-caret" aria-label="正在生成" />}
				{!message.streaming && <Sources citations={allCitations} />}
				{!message.streaming && !hasContent && !message.error && <p className="ac-tool-empty">（空回答）</p>}
				{refused && <p className="ac-refusal">这次请求被内容审核拒答了。</p>}
				{truncated && <p className="ac-truncated">输出达到长度上限，回答被截断。</p>}
				{message.error && <p className="ac-error">{message.error}</p>}

				{message.usage && !message.streaming && (
					<div className="ac-meta-line">
						<span>
							输入 {(message.usage.input + message.usage.cacheHit).toLocaleString()}（命中{' '}
							{message.usage.cacheHit.toLocaleString()}）· 输出 {message.usage.output.toLocaleString()}
						</span>
						{message.usage.searches + message.usage.fetches + message.usage.imageSearches > 0 && (
							<span>
								· 搜索 {message.usage.searches} / 抓取 {message.usage.fetches}
								{message.usage.imageSearches > 0 ? ` / 图片 ${message.usage.imageSearches}` : ''}
							</span>
						)}
						{showCost && <span className="ac-cost">≈ {fmtCost(costOf(message.usage))}</span>}
						{onRegenerate && (
							<button className="ac-text-btn" type="button" onClick={() => onRegenerate(message)}>
								重新生成
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

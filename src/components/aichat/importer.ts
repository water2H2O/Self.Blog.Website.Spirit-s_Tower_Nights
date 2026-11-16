/**
 * 导入官方导出（`deepseek_data-*.zip` 里的 `chat_sessions/*.json`）。
 *
 * 这个模块只做「解析 + 转换」，不碰 DOM、不读文件——文件读取和写库由调用方负责，
 * 所以它能直接用 Node 跑真实样本做回归测试。
 *
 * 四条刻意的取舍：
 *   1. 只导入**文字**。附件在导出里只有路径、没有 DeepSeek 的 file_id，
 *      硬塞进 content 会让后续请求 400，所以只把文件名记成 attachments 展示用。
 *   2. 每个会话按 `current_message_id` 回溯出一条主链（干净、能接着聊）；
 *      若存在分叉（编辑过提问 / 重新生成过），**额外生成一个「含全部分支」的副本**，
 *      把树里所有消息按 id 顺序再存一份，保证一条都不丢。
 *   3. 会话按 id 去重：重复导入同一个包不会产生副本。
 *   4. 时间取 `inserted_at` / `updated_at`，缺失时退回消息时间。
 *
 * 字段结构见 docs/aichat-official-export.md。
 */

import type { Attachment, ChatMessage, ContentBlock, Session } from './types.ts';

export type ImportSummary = {
	/** 当前主链导入的会话数 */
	sessions: number;
	/** 因为分叉额外生成的「含全部分支」会话数 */
	archives: number;
	/** 跳过的会话数（id 已存在 / 没有可用消息） */
	skipped: number;
	/** 导入的消息条数（只算主链） */
	messages: number;
	/** 不在主链上的消息条数（已通过 archives 保留） */
	droppedBranches: number;
	/** 只记了文件名、没有导入原件的附件数 */
	droppedFiles: number;
};

type RawFile = { id?: string; file_name?: string; is_image?: boolean };
type RawFragment = {
	type?: string;
	content?: string;
	files?: RawFile[];
};
type RawMessage = {
	id?: number;
	parent_id?: number | null;
	role?: string;
	fragments?: RawFragment[];
	inserted_at?: string;
	status?: string;
};
type RawSession = {
	id?: string;
	title?: string;
	inserted_at?: string;
	updated_at?: string;
	current_message_id?: number;
	messages?: RawMessage[];
};

function ms(iso: string | undefined, fallback: number): number {
	if (!iso) return fallback;
	const value = Date.parse(iso);
	return Number.isFinite(value) ? value : fallback;
}

function textOf(fragment: RawFragment): string {
	return typeof fragment.content === 'string' ? fragment.content : '';
}

function toMessage(raw: RawMessage): { message: ChatMessage | null; files: number } {
	if (!raw || typeof raw.id !== 'number') return { message: null, files: 0 };
	const role = raw.role === 'ASSISTANT' ? 'assistant' : 'user';
	const content: ContentBlock[] = [];
	const attachments: Attachment[] = [];
	let files = 0;

	for (const fragment of raw.fragments ?? []) {
		switch (fragment.type) {
			case 'REQUEST':
			case 'RESPONSE':
			case 'TEMPLATE_RESPONSE':
				if (textOf(fragment)) content.push({ type: 'text', text: textOf(fragment) });
				break;
			case 'THINK':
				if (textOf(fragment)) content.push({ type: 'thinking', thinking: textOf(fragment) });
				break;
			case 'CONTENT_RISK':
				content.push({ type: 'text', text: '（这次回复被内容审核拦截）' });
				break;
			case 'FILE':
				for (const file of fragment.files ?? []) {
					files += 1;
					attachments.push({
						// 导出里没有可用的 file_id；用路径式假 id 只作展示占位
						fileId: `export:${file.id ?? file.file_name ?? files}`,
						name: file.file_name ?? '附件',
						kind: file.is_image ? 'image' : 'document',
					});
				}
				break;
			default:
				break;
		}
	}

	if (content.length === 0) return { message: null, files };

	const message: ChatMessage = {
		id: `import-${raw.id}-${Math.random().toString(36).slice(2, 8)}`,
		role,
		content,
		createdAt: ms(raw.inserted_at, Date.now()),
	};
	if (role === 'user' && attachments.length > 0) message.attachments = attachments;
	if (raw.status && raw.status !== 'FINISHED') {
		message.stopReason = raw.status === 'TIMEOUT' ? 'max_tokens' : null;
	}
	return { message, files };
}

export function parseSession(raw: unknown): {
	session: Session | null;
	archive: Session | null;
	summary: Pick<ImportSummary, 'messages' | 'droppedBranches' | 'droppedFiles'>;
} {
	const empty = { messages: 0, droppedBranches: 0, droppedFiles: 0 };
	const data = raw as RawSession | null;
	if (!data || typeof data.id !== 'string' || !Array.isArray(data.messages)) {
		return { session: null, archive: null, summary: empty };
	}

	// 沿 current_message_id 回溯主链（parent_id 指向上一条）
	const byId = new Map<number, RawMessage>();
	for (const message of data.messages) {
		if (message && typeof message.id === 'number') byId.set(message.id, message);
	}
	if (byId.size === 0) return { session: null, archive: null, summary: empty };

	const tail =
		typeof data.current_message_id === 'number' && byId.has(data.current_message_id)
			? data.current_message_id
			: Math.max(...byId.keys());

	const chain: RawMessage[] = [];
	const seen = new Set<number>();
	let cursor: number | null | undefined = tail;
	while (typeof cursor === 'number' && byId.has(cursor) && !seen.has(cursor)) {
		const message = byId.get(cursor);
		if (!message) break;
		seen.add(cursor);
		chain.push(message);
		cursor = message.parent_id ?? null;
	}
	chain.reverse();

	const messages: ChatMessage[] = [];
	for (const item of chain) {
		const converted = toMessage(item);
		if (converted.message) messages.push(converted.message);
	}

	// 附件只记文件名；按 file id 去重后再统计（主链和副本会重复扫同一批消息）
	const fileIds = new Set<string>();
	for (const item of data.messages) {
		for (const fragment of item.fragments ?? []) {
			if (fragment.type !== 'FILE') continue;
			for (const file of fragment.files ?? []) {
				fileIds.add(file.id ?? file.file_name ?? String(fileIds.size));
			}
		}
	}
	const files = fileIds.size;
	if (messages.length === 0) {
		return { session: null, archive: null, summary: { ...empty, droppedFiles: files } };
	}

	const now = Date.now();
	const title = (data.title || '未命名对话').trim();
	const session: Session = {
		id: data.id,
		title,
		createdAt: ms(data.inserted_at, messages[0]?.createdAt ?? now),
		updatedAt: ms(data.updated_at, messages[messages.length - 1]?.createdAt ?? now),
		messages,
	};

	const droppedBranches = Math.max(0, data.messages.length - chain.length);

	// 有分叉就再存一份「全部分支」：按 id 升序（即创建顺序）把所有消息铺开，
	// 这样被编辑/重生成掉的内容也不会丢。
	let archive: Session | null = null;
	if (droppedBranches > 0) {
		const all: ChatMessage[] = [];
		const sorted = [...data.messages].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
		for (const item of sorted) {
			const converted = toMessage(item);
			if (converted.message) all.push(converted.message);
		}
		if (all.length > messages.length) {
			archive = {
				id: `${data.id}#all`,
				title: `${title}（全部分支 ${all.length} 条）`,
				createdAt: session.createdAt,
				updatedAt: session.updatedAt,
				messages: all,
			};
		}
	}

	return {
		session,
		archive,
		summary: { messages: messages.length, droppedBranches, droppedFiles: files },
	};
}

/** 从一批「文件名 + 文本」里收集会话；已有的 id 直接跳过 */
export function collectSessions(
	files: { name: string; text: string }[],
	existingIds: Set<string>,
): { sessions: Session[]; summary: ImportSummary } {
	const summary: ImportSummary = {
		sessions: 0,
		archives: 0,
		skipped: 0,
		messages: 0,
		droppedBranches: 0,
		droppedFiles: 0,
	};
	const sessions: Session[] = [];
	// 同一批里也可能有重复文件，所以本地再维护一份已见 id
	const seen = new Set(existingIds);

	for (const file of files) {
		if (!file.name.toLowerCase().endsWith('.json')) continue;
		// 索引/用户信息/清单不是会话，跳过
		if (/^(manifest|user|chat_session_index)\.json$/i.test(file.name)) continue;

		let raw: unknown;
		try {
			raw = JSON.parse(file.text);
		} catch {
			continue;
		}

		const parsed = parseSession(raw);
		summary.droppedBranches += parsed.summary.droppedBranches;
		summary.droppedFiles += parsed.summary.droppedFiles;

		if (!parsed.session) {
			summary.skipped += 1;
			continue;
		}
		if (seen.has(parsed.session.id)) {
			summary.skipped += 1;
			continue;
		}

		sessions.push(parsed.session);
		seen.add(parsed.session.id);
		summary.sessions += 1;
		summary.messages += parsed.summary.messages;

		if (parsed.archive && !seen.has(parsed.archive.id)) {
			sessions.push(parsed.archive);
			seen.add(parsed.archive.id);
			summary.archives += 1;
		}
	}

	return { sessions, summary };
}

/**
 * 「用自己的 API」——可以存多个，对话里随时切换。
 *
 * 每个 provider 是一条扁平记录：官方 Key 只需要 apiKey，自定义接口多
 * baseUrl / protocol / model 三项。存成数组 + 一个 activeId，切换只改
 * activeId，不改历史。
 *
 * 服务端那条路（worker/aichat.mjs）会把请求收窄成白名单再转发；浏览器直连时
 * 没有中间人，这些约束必须由前端自己再做一遍 —— 否则一个手滑的 max_tokens
 * 就能把用户自己的额度刷掉。这里的常量和 worker/aichat.mjs 是同一套规则。
 */

import type { ChatOptions } from './types.ts';

export const MODEL = 'deepseek-flash';
export const MAX_TOKENS_CEILING = 8192;
export const MAX_TOKENS_DEFAULT = 4096;
export const FILES_BETA = 'files-api-2025-04-14';

export type Protocol = 'anthropic' | 'openai';

export type Provider = {
	id: string;
	kind: 'deepseek' | 'custom';
	/** 显示名，会出现在顶栏的下拉里 */
	label: string;
	apiKey: string;
	/** 仅自定义接口：例如 https://api.example.com 或 …/v1 */
	baseUrl?: string;
	protocol?: Protocol;
	/** 仅自定义接口 */
	model?: string;
};

export type ProviderState = { list: Provider[]; activeId: string | null };

const STORAGE = 'aichat:providers';
const LEGACY_PROVIDER = 'aichat:provider';
const LEGACY_KEY = 'aichat:key';

export function newProviderId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	return `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ---------------------------------------------------------------- 存储

function normalize(raw: unknown): Provider | null {
	const value = raw as Partial<Provider> | null;
	if (!value || typeof value !== 'object' || !value.apiKey) return null;
	if (value.kind === 'custom') {
		if (!value.baseUrl || !value.model) return null;
		return {
			id: value.id ?? newProviderId(),
			kind: 'custom',
			label: value.label || value.model,
			apiKey: value.apiKey,
			baseUrl: value.baseUrl,
			protocol: value.protocol === 'anthropic' ? 'anthropic' : 'openai',
			model: value.model,
		};
	}
	return {
		id: value.id ?? newProviderId(),
		kind: 'deepseek',
		label: value.label || '官方 API',
		apiKey: value.apiKey,
	};
}

export function loadProviderState(): ProviderState {
	try {
		const raw = localStorage.getItem(STORAGE);
		if (raw) {
			const parsed = JSON.parse(raw) as { list?: unknown[]; activeId?: string | null };
			const list = (parsed?.list ?? []).map(normalize).filter((item): item is Provider => Boolean(item));
			const activeId = list.some((item) => item.id === parsed?.activeId) ? (parsed.activeId as string) : (list[0]?.id ?? null);
			return { list, activeId };
		}

		// 旧版本只存了一个 provider / 一个 key，平滑迁移
		const legacyRaw = localStorage.getItem(LEGACY_PROVIDER);
		const legacyKey = localStorage.getItem(LEGACY_KEY);
		const migrated = normalize(legacyRaw ? JSON.parse(legacyRaw) : legacyKey ? { kind: 'deepseek', apiKey: legacyKey } : null);
		if (migrated) return { list: [migrated], activeId: migrated.id };
	} catch {
		/* 隐私模式下读不到，当作没配置 */
	}
	return { list: [], activeId: null };
}

export function saveProviderState(state: ProviderState): void {
	try {
		localStorage.setItem(STORAGE, JSON.stringify(state));
		localStorage.removeItem(LEGACY_PROVIDER);
		localStorage.removeItem(LEGACY_KEY);
	} catch {
		/* 只影响记忆，不影响本次使用 */
	}
}

/** 只露头尾，界面上不显示完整 key（截图/共享屏幕时会泄漏） */
export function maskKey(key: string): string {
	if (key.length <= 12) return '已保存';
	return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export function providerLabel(provider: Provider | null): string {
	if (!provider) return '站点额度';
	if (provider.kind === 'deepseek') return provider.label || '官方 API';
	return provider.label || provider.model || '自定义 API';
}

export function providerSubtitle(provider: Provider): string {
	if (provider.kind === 'deepseek') return `官方 API · ${maskKey(provider.apiKey)}`;
	return `${provider.protocol === 'anthropic' ? 'Anthropic' : 'OpenAI'} · ${provider.model ?? ''} · ${maskKey(provider.apiKey)}`;
}

export function isOfficial(provider: Provider | null): boolean {
	return Boolean(provider && provider.kind === 'deepseek');
}

/** 联网/读链接/文件上传都依赖 DeepSeek 的服务端工具，自定义接口没有 */
export function supportsServerTools(provider: Provider | null): boolean {
	return isOfficial(provider);
}

// ---------------------------------------------------------------- 请求

export type WireMessage = { role: string; content: unknown };

export function hasFileBlocks(messages: WireMessage[]): boolean {
	return messages.some(
		(message) =>
			Array.isArray(message.content) &&
			message.content.some(
				(block: any) =>
					(block?.type === 'image' || block?.type === 'document') && block?.source?.type === 'file',
			),
	);
}

function trimBase(url: string): string {
	return url.trim().replace(/\/+$/, '');
}

function customBase(provider: Provider): string {
	return trimBase(provider.baseUrl ?? '');
}

export function endpointOf(provider: Provider): string {
	if (provider.kind === 'deepseek') return 'https://api.deepseek.com/anthropic/v1/messages';
	const base = customBase(provider);
	if (provider.protocol === 'openai') {
		return base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
	}
	return base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;
}

export function filesEndpointOf(): string {
	return 'https://api.deepseek.com/anthropic/v1/files';
}

export function headersOf(provider: Provider, messages: WireMessage[]): Record<string, string> {
	if (provider.kind === 'custom' && provider.protocol === 'openai') {
		return {
			'content-type': 'application/json',
			authorization: `Bearer ${provider.apiKey}`,
		};
	}
	return {
		'content-type': 'application/json',
		'x-api-key': provider.apiKey,
		'anthropic-version': '2023-06-01',
		...(provider.kind === 'deepseek' && hasFileBlocks(messages) ? { 'anthropic-beta': FILES_BETA } : {}),
	};
}

export function bodyOf(provider: Provider, messages: WireMessage[], options: ChatOptions): unknown {
	const model = provider.kind === 'deepseek' ? MODEL : (provider.model ?? MODEL);

	if (provider.kind === 'custom' && provider.protocol === 'openai') {
		return {
			model,
			messages: toOpenAIMessages(messages),
			stream: true,
			stream_options: { include_usage: true },
			max_tokens: MAX_TOKENS_DEFAULT,
		};
	}

	const tools: { type: string; name: string }[] = [];
	if (provider.kind === 'deepseek') {
		if (options.webSearch) tools.push({ type: 'deepseek_web_search', name: 'deepseek_web_search' });
		if (options.readUrl) tools.push({ type: 'deepseek_read_url', name: 'deepseek_read_url' });
	}

	return {
		model,
		messages,
		stream: true,
		max_tokens: MAX_TOKENS_DEFAULT,
		thinking: { type: options.thinking ? 'enabled' : 'disabled' },
		// KV 缓存按 user_id 隔离：固定值才能让多轮持续命中（命中价是未命中的 1/50）
		metadata: { user_id: 'owner' },
		...(tools.length > 0 ? { tools } : {}),
		title: { enabled: true },
	};
}

function textOf(content: unknown): string {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';
	return content
		.map((block: any) => (block?.type === 'text' ? String(block.text ?? '') : ''))
		.filter(Boolean)
		.join('\n');
}

/**
 * OpenAI 协议没有 latest_reminder 这种角色，也没有 file 块。
 * 这里把元信息折成用户消息开头的一行，文件和工具块直接丢弃 ——
 * 界面上已经在自定义模式下关掉了相关入口，走到这里只是兜底。
 */
export function toOpenAIMessages(messages: WireMessage[]): { role: string; content: string }[] {
	const out: { role: string; content: string }[] = [];
	let reminder = '';
	for (const message of messages) {
		if (message.role === 'latest_reminder') {
			reminder = String(message.content ?? '');
			continue;
		}
		let text = textOf(message.content);
		if (message.role === 'user' && reminder) {
			text = `（当前时间与语言环境：${reminder}）\n\n${text}`;
			reminder = '';
		}
		if (!text.trim()) continue;
		out.push({ role: message.role, content: text });
	}
	return out;
}

/** 把上游的状态码翻译成人话，别把裸 JSON 丢给用户 */
export function describeUpstreamError(status: number, detail?: string): string {
	if (status === 401) return 'Key 无效或已失效（401），检查是不是复制漏了字符';
	if (status === 402) return '账户余额不足（402），去平台充值';
	if (status === 429) return '被限流了（429），等一会儿再试';
	if (status === 400 && detail && /Content Exists Risk/i.test(detail)) return '输入被内容审核拦截了（400）';
	if (status === 413) return '文件或请求体过大（413）';
	return `上游返回 ${status}${detail ? `：${detail.slice(0, 200)}` : ''}`;
}

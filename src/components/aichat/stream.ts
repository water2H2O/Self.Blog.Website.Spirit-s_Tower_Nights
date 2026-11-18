/**
 * SSE 状态机（纯函数，不碰 DOM）。
 *
 * 单独拆出来的原因：流式解析是整个前端最容易出微妙 bug 的地方（内容块按
 * index 到达、引用是增量事件、工具块一次性下发），而它完全可以脱离浏览器
 * 测。tools/aichat-stream-test.mjs 就是直接 import 这个文件跑的。
 *
 * 只依赖 import type，所以 Node 的类型擦除可以直接执行它。
 */

import type { ChatMessage, Citation, ContentBlock, TextBlock, ThinkingBlock, Usage } from './types.ts';

type WireMessage = { role: string; content: unknown };

function emptyUsage(): Usage {
	return { input: 0, output: 0, cacheHit: 0, searches: 0, fetches: 0, imageSearches: 0 };
}

function readUsage(payload: any, fallback: Usage): Usage {
	const u = payload ?? {};
	const tool = u.server_tool_use ?? {};
	return {
		input: u.input_tokens ?? fallback.input,
		output: u.output_tokens ?? fallback.output,
		cacheHit: u.cache_read_input_tokens ?? fallback.cacheHit,
		thinkingTokens: u.output_tokens_details?.thinking_tokens ?? fallback.thinkingTokens,
		searches: tool.tool_search ?? fallback.searches,
		fetches: tool.tool_fetch ?? fallback.fetches,
		imageSearches: tool.tool_image_search ?? fallback.imageSearches,
	};
}

export interface Assembler {
	usage: Usage;
	title?: string;
	stopReason: string | null;
	error?: string;
	done: boolean;
	/** 喂一段原始 SSE 文本，返回这一批里有没有产生新内容 */
	push(chunk: string): boolean;
	/** 当前内容块的紧凑副本 */
	collect(): ContentBlock[];
}

export class StreamAssembler implements Assembler {
	private buffer = '';
	private blocks: (ContentBlock | undefined)[] = [];

	usage: Usage = emptyUsage();
	title?: string;
	stopReason: string | null = null;
	error?: string;
	done = false;

	/** 喂一段原始 SSE 文本，返回这一批里有没有产生新内容 */
	push(chunk: string): boolean {
		this.buffer = (this.buffer + chunk).replace(/\r\n/g, '\n');
		let changed = false;
		let cut = this.buffer.indexOf('\n\n');
		while (cut >= 0) {
			const raw = this.buffer.slice(0, cut);
			this.buffer = this.buffer.slice(cut + 2);
			if (this.handleEvent(raw)) changed = true;
			cut = this.buffer.indexOf('\n\n');
		}
		return changed;
	}

	/** 当前内容块的紧凑副本（上游可能用稀疏 index） */
	collect(): ContentBlock[] {
		return this.blocks.filter((block): block is ContentBlock => Boolean(block));
	}

	private handleEvent(raw: string): boolean {
		const trimmed = raw.trim();
		if (!trimmed || trimmed.startsWith(':')) return false; // : keep-alive

		const dataLines: string[] = [];
		for (const line of raw.split('\n')) {
			if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
		}
		if (dataLines.length === 0) return false;

		let payload: any;
		try {
			payload = JSON.parse(dataLines.join('\n'));
		} catch {
			return false;
		}

		switch (payload?.type) {
			case 'message_start': {
				this.usage = readUsage(payload.message?.usage, this.usage);
				return true;
			}
			case 'content_block_start': {
				const index = Number(payload.index ?? 0);
				const block = payload.content_block ?? {};
				let next: ContentBlock;
				if (block.type === 'thinking') {
					next = { type: 'thinking', thinking: block.thinking ?? '' } satisfies ThinkingBlock;
				} else if (block.type === 'text') {
					next = { type: 'text', text: block.text ?? '', citations: block.citations ?? [] } satisfies TextBlock;
				} else {
					next = { ...block } as ContentBlock;
				}
				this.blocks[index] = next;
				return true;
			}
			case 'content_block_delta': {
				const index = Number(payload.index ?? 0);
				const target = this.blocks[index];
				if (!target) return false;
				const delta = payload.delta ?? {};
				if (delta.type === 'thinking_delta' && target.type === 'thinking') {
					target.thinking += delta.thinking ?? '';
					return true;
				}
				if (delta.type === 'text_delta' && target.type === 'text') {
					target.text += delta.text ?? '';
					return true;
				}
				if (delta.type === 'citations_delta' && target.type === 'text') {
					if (delta.citation) {
						target.citations = [...(target.citations ?? []), delta.citation as Citation];
						return true;
					}
				}
				return false; // signature_delta 之类，不展示也用不到
			}
			case 'message_delta': {
				this.usage = readUsage(payload.usage, this.usage);
				if (typeof payload.delta?.title === 'string') this.title = payload.delta.title;
				if (payload.delta?.stop_reason) this.stopReason = payload.delta.stop_reason;
				return true;
			}
			case 'message_stop': {
				this.done = true;
				return true;
			}
			case 'error': {
				this.error = payload.error?.message ?? '上游返回错误';
				return true;
			}
			default:
				return false;
		}
	}
}

/**
 * OpenAI Chat Completions 协议的流式拼装。
 *
 * 自定义接口大概率是这套格式：`data: {"choices":[{"delta":{"content":"…"}}]}`，
 * 最后一行 `data: [DONE]`。它是扁平的增量流，没有内容块、没有引用、没有工具，
 * 所以这里只需要拼出「思考 + 正文」两种块，其余能力在界面上直接关掉。
 *
 * 兼容两种思考字段：`reasoning_content`（DeepSeek/多数国内中转）与
 * `reasoning`（部分服务商）。
 */
export class OpenAIStreamAssembler implements Assembler {
	private buffer = '';
	private thinking: ThinkingBlock | null = null;
	private text: TextBlock | null = null;

	usage: Usage = emptyUsage();
	stopReason: string | null = null;
	error?: string;
	done = false;

	push(chunk: string): boolean {
		this.buffer = (this.buffer + chunk).replace(/\r\n/g, '\n');
		let changed = false;
		let cut = this.buffer.indexOf('\n\n');
		while (cut >= 0) {
			const raw = this.buffer.slice(0, cut);
			this.buffer = this.buffer.slice(cut + 2);
			if (this.handleEvent(raw)) changed = true;
			cut = this.buffer.indexOf('\n\n');
		}
		return changed;
	}

	collect(): ContentBlock[] {
		const out: ContentBlock[] = [];
		if (this.thinking && this.thinking.thinking) out.push(this.thinking);
		if (this.text && this.text.text) out.push(this.text);
		return out;
	}

	private handleEvent(raw: string): boolean {
		const trimmed = raw.trim();
		if (!trimmed || trimmed.startsWith(':')) return false;

		const data = trimmed
			.split('\n')
			.filter((line) => line.startsWith('data:'))
			.map((line) => line.slice(5).trim())
			.join('\n');
		if (!data) return false;
		if (data === '[DONE]') {
			this.done = true;
			return true;
		}

		let payload: any;
		try {
			payload = JSON.parse(data);
		} catch {
			return false;
		}

		if (payload?.error) {
			this.error = payload.error.message ?? '上游返回错误';
			return true;
		}

		if (payload?.usage) {
			this.usage = {
				input: payload.usage.prompt_tokens ?? this.usage.input,
				output: payload.usage.completion_tokens ?? this.usage.output,
				cacheHit: payload.usage.prompt_tokens_details?.cached_tokens ?? this.usage.cacheHit,
				searches: 0,
				fetches: 0,
				imageSearches: 0,
			};
		}

		const choice = payload?.choices?.[0];
		if (!choice) return Boolean(payload?.usage);

		const delta = choice.delta ?? {};
		const reasoning = delta.reasoning_content ?? delta.reasoning;
		let changed = false;

		if (typeof reasoning === 'string' && reasoning) {
			if (!this.thinking) this.thinking = { type: 'thinking', thinking: '' };
			this.thinking.thinking += reasoning;
			changed = true;
		}
		if (typeof delta.content === 'string' && delta.content) {
			if (!this.text) this.text = { type: 'text', text: '' };
			this.text.text += delta.content;
			changed = true;
		}
		if (choice.finish_reason) {
			this.stopReason =
				choice.finish_reason === 'length'
					? 'max_tokens'
					: choice.finish_reason === 'content_filter'
						? 'refusal'
						: 'end_turn';
			changed = true;
		}
		return changed;
	}
}

/**
 * 把界面上的消息折成上游要的 messages。
 *
 * 三条规则：
 *   1. user 消息前面带上它自己的 latest_reminder，并且历史里的也要回传 ——
 *      不回传的话每轮前缀都不一样，KV 缓存全落空。
 *   2. assistant 的 thinking 块不回传（上一轮的思考不进上下文），
 *      其余块原样回传，包括 web_fetch_tool_result 的 signature。
 *   3. 空回答跳过，避免把半截消息拼进上下文。
 */
export function toApiMessages(messages: ChatMessage[], summary?: string): WireMessage[] {
	const out: WireMessage[] = [];
	const trimmed = summary?.trim();
	let prefixPending = trimmed ? `【此前对话的压缩摘要】\n${trimmed}\n\n` : '';

	// 摘要挂在第一条 user 消息正文前面，保持「latest_reminder → user」的顺序不变
	const withPrefix = (content: unknown): unknown => {
		if (!prefixPending) return content;
		const prefix = prefixPending;
		prefixPending = '';
		if (Array.isArray(content)) return [{ type: 'text', text: prefix }, ...content];
		return `${prefix}${String(content ?? '')}`;
	};

	for (const message of messages) {
		if (message.role === 'user') {
			if (message.reminder) out.push({ role: 'latest_reminder', content: message.reminder });
			out.push({ role: 'user', content: withPrefix(message.content) });
			continue;
		}
		const content = message.content.filter((block) => block.type !== 'thinking');
		const hasText = content.some((block) => block.type === 'text' && (block as TextBlock).text.trim().length > 0);
		const hasTool = content.some((block) => block.type === 'server_tool_use' || block.type === 'web_fetch_tool_result');
		if (!hasText && !hasTool) continue;
		out.push({ role: 'assistant', content });
	}

	if (prefixPending) out.push({ role: 'user', content: prefixPending });
	return out;
}

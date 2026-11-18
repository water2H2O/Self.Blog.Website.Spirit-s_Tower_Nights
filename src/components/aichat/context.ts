/**
 * 上下文估算与压缩规划（纯函数，能脱离浏览器单测）。
 *
 * 压缩思路（类似 /compact）：会话太长时，把较早的一段对话交给模型总结成
 * 摘要，之后只发「摘要 + 最近若干条」。原始消息仍留在 Session.messages 里，
 * 界面可继续翻看，只是不再占用每轮请求的上下文。
 */

import type { ChatMessage, Session } from './types.ts';

/** 中文字符大致 1 token/字，英文约 3.5 字符/token，取个保守近似。 */
export function estimateTokens(text: string): number {
	let cjk = 0;
	let other = 0;
	for (const ch of text) {
		if (/[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) cjk += 1;
		else other += 1;
	}
	return Math.ceil(cjk * 1.1 + other / 3.5);
}

/** 只取会真正发给模型的正文；思考块和历史工具块都不回传 */
export function messageText(message: ChatMessage): string {
	return message.content
		.map((block) => (block.type === 'text' ? block.text : ''))
		.filter(Boolean)
		.join('\n');
}

/** 估算一条会话「下一轮实际要发出去」的 token 数（含摘要） */
export function estimateContextTokens(session: Session | null): number {
	if (!session) return 0;
	const from = session.compactedBefore ?? 0;
	let total = session.summary ? estimateTokens(session.summary) : 0;
	for (const message of session.messages.slice(from)) {
		total += estimateTokens(messageText(message)) + 6;
		for (const block of message.content) {
			if (block.type === 'server_tool_use') total += 30;
			else if (block.type === 'web_search_tool_result' || block.type === 'web_fetch_tool_result') total += 80;
		}
	}
	return total;
}

/** 压缩时保留的尾部消息条数（从 user 消息开始对齐） */
export const KEEP_TAIL = 8;

export type CompactionPlan = { cut: number; transcript: string };

/**
 * 规划一次压缩：保留最后 KEEP_TAIL 条，并向前对齐到 user 消息，
 * 前面那一段拼成待总结的文本。已经压过的话，把旧摘要一起带上递归压缩。
 */
export function planCompaction(session: Session | null, keepTail = KEEP_TAIL): CompactionPlan | null {
	if (!session) return null;
	const from = session.compactedBefore ?? 0;
	const pending = session.messages.length - from;
	if (pending <= keepTail + 2) return null;

	let cut = session.messages.length - keepTail;
	while (cut > from && session.messages[cut]?.role !== 'user') cut -= 1;
	if (cut <= from) return null;

	const parts: string[] = [];
	if (session.summary) parts.push(`【已有摘要】\n${session.summary}`);
	for (const message of session.messages.slice(from, cut)) {
		const text = messageText(message).trim();
		if (text) parts.push(`${message.role === 'user' ? '用户' : '助手'}：${text}`);
	}
	if (parts.length === 0) return null;

	return { cut, transcript: parts.join('\n\n') };
}

/** 给模型看的压缩指令：要事实、要未决问题，不要寒暄和过程 */
export function summaryPrompt(transcript: string, title: string): string {
	return [
		'你在压缩一段对话，压缩结果会作为后续对话的上下文继续使用。',
		'请输出中文摘要，要求：',
		'1. 保留用户的目标、约束、偏好，以及已经确认的事实与结论；',
		'2. 保留仍未解决的问题、待办与下一步计划；',
		'3. 保留关键人名、文件名、链接、变量名等标识（代码只留要点，不要大段粘贴）；',
		'4. 不要寒暄、不要复述对话过程，用简洁条目；',
		'5. 总长控制在 600 字以内。',
		'',
		`会话标题：${title}`,
		'',
		'对话记录：',
		transcript,
	].join('\n');
}

export function formatTokens(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
	return String(value);
}

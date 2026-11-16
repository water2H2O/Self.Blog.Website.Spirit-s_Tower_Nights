/**
 * 把相邻的正文块合并成一个。
 *
 * 为什么需要：上游在正文里插入引用时，会**把同一个 text 块截断成两个**
 * （文档原话：「一个 text 块带上引用后，之后的正文会另起一个新的 text 块」）。
 * 如果这段正文正好是 Markdown 表格，表格就会被从中间劈开：
 * 前一块渲染出表头 + 半行，后一块只剩一堆裸的 `|`。页面上看起来就是
 * 「表格只画了一半，剩下的散成段落」。
 *
 * 合并是安全的：我们本来就把引用渲染成末尾的来源列表，不依赖块内位置。
 */

import type { ContentBlock, TextBlock } from './types.ts';

export function mergeAdjacentText(blocks: ContentBlock[]): ContentBlock[] {
	const out: ContentBlock[] = [];
	for (const block of blocks) {
		const last = out.length > 0 ? out[out.length - 1] : null;
		if (block.type === 'text' && last && last.type === 'text') {
			const merged: TextBlock = {
				type: 'text',
				text: last.text + block.text,
				citations: [...(last.citations ?? []), ...(block.citations ?? [])],
			};
			out[out.length - 1] = merged;
			continue;
		}
		out.push(block);
	}
	return out;
}

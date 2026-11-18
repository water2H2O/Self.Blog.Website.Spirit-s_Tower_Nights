/**
 * 聊天区滚动策略（纯函数，方便单测）。
 *
 * 三个场景：
 *   1. 切换会话（重新进入某条聊天记录）—— 总是跳到底部；
 *   2. 新消息开始生成、还没产出正文 —— 跟随，让用户看到开头；
 *   3. 正文已经开始输出 —— 停止跟随，避免用户正在读上半段时被不断拽下去。
 */
export function shouldStickToBottom(input: { switched: boolean; streaming: boolean; hasText: boolean }): boolean {
	if (input.switched) return true;
	if (!input.streaming) return true;
	return !input.hasText;
}

/**
 * 上下文估算与压缩规划的回归测试。
 *
 *   node tools/aichat-context-test.mjs
 */

import assert from 'node:assert/strict';

import {
	estimateContextTokens,
	estimateTokens,
	formatTokens,
	planCompaction,
	summaryPrompt,
} from '../src/components/aichat/context.ts';
import { toApiMessages } from '../src/components/aichat/stream.ts';

const msg = (id, role, text, extra = {}) => ({
	id,
	role,
	content: [{ type: 'text', text }],
	createdAt: 1,
	...extra,
});

// --- token 估算 ---
assert.ok(estimateTokens('你好世界') >= 4, '中文按接近 1 字 1 token 估算');
assert.ok(estimateTokens('hello world this is a test') < 12, '英文按字符折算更省');
assert.equal(formatTokens(1234), '1.2k');
assert.equal(formatTokens(120000), '120.0k');
assert.equal(formatTokens(1_200_000), '1.2M');

// --- 会话估算：跳过已压缩的前缀，但计入摘要 ---
const session = {
	id: 's',
	title: '测试',
	createdAt: 1,
	updatedAt: 1,
	compactedBefore: 2,
	summary: '甲'.repeat(100),
	messages: [msg('a', 'user', '乙'.repeat(500)), msg('b', 'assistant', '丙'.repeat(500)), msg('c', 'user', '丁'.repeat(100)), msg('d', 'assistant', '戊'.repeat(100))],
};
const tokens = estimateContextTokens(session);
assert.ok(tokens > 100 && tokens < 800, '只统计摘要 + compactedBefore 之后的消息');

// --- 压缩规划 ---
assert.equal(planCompaction({ ...session, compactedBefore: 0, summary: undefined, messages: [msg('a', 'user', 'x')] }), null, '太短不压缩');

const long = {
	id: 's2',
	title: '长对话',
	createdAt: 1,
	updatedAt: 1,
	messages: Array.from({ length: 20 }, (_, i) => msg(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `第 ${i} 条内容`)),
};
const plan = planCompaction(long);
assert.ok(plan, '长对话应可压缩');
assert.ok(plan.cut > 0 && plan.cut < long.messages.length);
assert.equal(long.messages[plan.cut].role, 'user', '切点必须对齐到 user 消息');
assert.ok(plan.transcript.includes('用户：') && plan.transcript.includes('助手：'));
assert.ok(plan.transcript.includes('第 0 条内容'), '被压缩的旧消息要进摘要材料');
assert.ok(!plan.transcript.includes(`第 ${plan.cut} 条内容`), '保留的尾部不进摘要');

// 二次压缩要带上旧摘要
const again = planCompaction({ ...long, summary: '旧摘要内容', compactedBefore: 2 });
assert.ok(again && again.transcript.includes('【已有摘要】') && again.transcript.includes('旧摘要内容'));

// --- 提示词 ---
const prompt = summaryPrompt('用户：你好\n助手：在', '会话标题A');
assert.ok(prompt.includes('会话标题A') && prompt.includes('用户：你好') && prompt.includes('600 字以内'));

// --- 摘要注入到第一条 user 消息 ---
const wire = toApiMessages(
	[
		{ ...msg('u', 'user', '新问题'), reminder: '2026-11-18,星期二,中国,Web,中文' },
		{ ...msg('a', 'assistant', '上一轮回答') },
	],
	'甲'.repeat(50),
);
assert.equal(wire[0].role, 'latest_reminder');
assert.equal(wire[1].role, 'user');
assert.ok(Array.isArray(wire[1].content), '内容仍是块数组');
assert.ok(wire[1].content[0].text.startsWith('【此前对话的压缩摘要】'));
assert.ok(wire[1].content[0].text.includes('甲'.repeat(10)));
assert.equal(wire[1].content[1].text, '新问题', '原问题不能被吃掉');

console.log('context.test: 全部通过');

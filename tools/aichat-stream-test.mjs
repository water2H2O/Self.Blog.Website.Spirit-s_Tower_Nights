/**
 * SSE 解析器的单元测试（不需要浏览器，也不需要 key）。
 *
 *   node tools/aichat-stream-test.mjs
 *
 * 直接 import 前端的 stream.ts —— Node 24 会原生擦除类型。
 * 这里覆盖三件最容易出错的事：内容块按 index 组装、引用是增量事件、
 * 历史回传时 thinking 必须被剔除而 signature 必须保留。
 */

import assert from 'node:assert/strict';

import { OpenAIStreamAssembler, StreamAssembler, toApiMessages } from '../src/components/aichat/stream.ts';
import { toOpenAIMessages } from '../src/components/aichat/request.ts';

const events = [
	['message_start', { type: 'message_start', message: { usage: { input_tokens: 100, cache_read_input_tokens: 20 } } }],
	['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }],
	['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '想一下' } }],
	['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } }],
	['content_block_stop', { type: 'content_block_stop', index: 0 }],
	[
		'content_block_start',
		{
			type: 'content_block_start',
			index: 1,
			content_block: { type: 'server_tool_use', id: 't1', name: 'deepseek_web_search', input: { action: 'search', queries: ['a', 'b'] }, kind: 'search' },
		},
	],
	[
		'content_block_start',
		{
			type: 'content_block_start',
			index: 2,
			content_block: {
				type: 'web_search_tool_result',
				tool_use_id: 't1',
				kind: 'search',
				content: [{ type: 'web_search_result', title: '标题', url: 'https://example.com', snippet: '摘要' }],
			},
		},
	],
	['content_block_start', { type: 'content_block_start', index: 3, content_block: { type: 'text', text: '' } }],
	['content_block_delta', { type: 'content_block_delta', index: 3, delta: { type: 'text_delta', text: '你好，' } }],
	['content_block_delta', { type: 'content_block_delta', index: 3, delta: { type: 'text_delta', text: '世界' } }],
	[
		'content_block_delta',
		{
			type: 'content_block_delta',
			index: 3,
			delta: { type: 'citations_delta', citation: { type: 'web_search_result_location', url: 'https://example.com', title: '标题', cited_text: '你好，世界' } },
		},
	],
	['content_block_stop', { type: 'content_block_stop', index: 3 }],
	[
		'message_delta',
		{
			type: 'message_delta',
			delta: { stop_reason: 'end_turn', title: '一个标题' },
			usage: { input_tokens: 300, cache_read_input_tokens: 900, output_tokens: 50, server_tool_use: { tool_search: 2, tool_fetch: 1 } },
		},
	],
	['message_stop', { type: 'message_stop' }],
];

const wire = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const full = wire.join('') + ': keep-alive\n\n';

// 故意在任意字节位置切块，模拟真实网络分片（含把一个事件切成两半）
const assembler = new StreamAssembler();
for (let i = 0; i < full.length; i += 7) {
	assembler.push(full.slice(i, i + 7));
}

const blocks = assembler.collect();
assert.equal(blocks.length, 4, '四个内容块：thinking / 工具调用 / 搜索结果 / 正文');

assert.equal(blocks[0].type, 'thinking');
assert.equal(blocks[0].thinking, '想一下');

assert.equal(blocks[1].type, 'server_tool_use');
assert.deepEqual(blocks[1].input.queries, ['a', 'b']);

assert.equal(blocks[2].type, 'web_search_tool_result');
assert.equal(blocks[2].content[0].url, 'https://example.com');

assert.equal(blocks[3].type, 'text');
assert.equal(blocks[3].text, '你好，世界');
assert.equal(blocks[3].citations.length, 1, '引用是 citations_delta 增量的');

assert.equal(assembler.title, '一个标题');
assert.equal(assembler.stopReason, 'end_turn');
assert.equal(assembler.usage.input, 300, '最终用量以 message_delta 为准');
assert.equal(assembler.usage.cacheHit, 900);
assert.equal(assembler.usage.searches, 2);
assert.equal(assembler.usage.fetches, 1);
assert.equal(assembler.done, true);

// ---------------------------------------------------------------- 历史回传

const history = [
	{ id: 'u1', role: 'user', content: [{ type: 'text', text: '第一问' }], reminder: '2026-11-16,星期一,中国,Web,中文', createdAt: 1 },
	{ id: 'a1', role: 'assistant', content: blocks, createdAt: 2 },
	{
		id: 'u2',
		role: 'user',
		content: [{ type: 'document', source: { type: 'file', file_id: 'file-api-1' } }, { type: 'text', text: '第二问' }],
		reminder: '2026-11-16,星期一,中国,Web,中文',
		createdAt: 3,
	},
];

const sent = toApiMessages(history);
assert.equal(sent[0].role, 'latest_reminder');
assert.equal(sent[1].role, 'user');
assert.equal(sent[2].role, 'assistant');
assert.ok(
	!sent[2].content.some((block) => block.type === 'thinking'),
	'assistant 的 thinking 不能回传',
);
assert.equal(sent[2].content[0].type, 'server_tool_use');
assert.equal(sent[4].content[0].type, 'document');
assert.equal(sent[4].content[0].source.file_id, 'file-api-1');

// signature 必须原样保留（阅读链接的网页正文就藏在里面）
const withSignature = [
	{
		id: 'a2',
		role: 'assistant',
		content: [{ type: 'web_fetch_tool_result', tool_use_id: 'r1', content: { type: 'web_fetch_result', url: 'https://example.com', content: { type: 'document' } }, kind: 'read_link', signature: 'abc123' }],
		createdAt: 4,
	},
];
const kept = toApiMessages(withSignature);
assert.equal(kept[0].content[0].signature, 'abc123', 'signature 必须保留');

// 空回答不该拼进上下文
assert.equal(toApiMessages([{ id: 'a3', role: 'assistant', content: [], createdAt: 5 }]).length, 0);

console.log('stream.test: 全部通过');

// ---------------------------------------------------------------- OpenAI 协议

const openai = new OpenAIStreamAssembler();
const sse = [
	'data: {"choices":[{"delta":{"reasoning_content":"先想一下"}}]}\n\n',
	'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
	'data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"prompt_tokens_details":{"cached_tokens":4}}}\n\n',
	'data: [DONE]\n\n',
];
// 同样故意切碎
for (let i = 0; i < sse.join('').length; i += 11) {
	openai.push(sse.join('').slice(i, i + 11));
}
const ob = openai.collect();
assert.equal(ob.length, 2, '思考 + 正文两块');
assert.equal(ob[0].type, 'thinking');
assert.equal(ob[0].thinking, '先想一下');
assert.equal(ob[1].type, 'text');
assert.equal(ob[1].text, '你好');
assert.equal(openai.stopReason, 'end_turn');
assert.equal(openai.done, true);
assert.equal(openai.usage.input, 10);
assert.equal(openai.usage.output, 5);
assert.equal(openai.usage.cacheHit, 4);

// OpenAI 协议下 latest_reminder 折进 user 消息，file 块被丢弃
const openaiWire = toApiMessages([
	{ id: 'u', role: 'user', content: [{ type: 'text', text: '在吗' }], reminder: '2026-11-17,星期二,中国,Web,中文', createdAt: 1 },
]);
const mapped = toOpenAIMessages(openaiWire);
assert.equal(mapped.length, 1);
assert.equal(mapped[0].role, 'user');
assert.ok(mapped[0].content.startsWith('（当前时间与语言环境：'), '元信息折进用户消息');
assert.ok(mapped[0].content.endsWith('在吗'));

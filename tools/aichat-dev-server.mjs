/**
 * 本地开发用的 /api/aichat/* 服务器（Node 适配层）。
 *
 * 为什么需要它：`astro dev` 只跑静态页，不跑 Worker；而线上那条 SSE 转发
 * 逻辑故意写成纯 Web 标准（worker/aichat.mjs），所以这里只做「Node 的
 * req/res ↔ 标准 Request/Response」的转换，业务代码一行都不重复。
 *
 * 用法：
 *   1) 复制 .dev.vars.example 为 .dev.vars，填 DEEPSEEK_API_KEY / AICHAT_PASS / AICHAT_SECRET
 *   2) dev.cmd aichat                            # 默认 127.0.0.1:8787
 *   3) 另开终端 dev.cmd dev                       # Astro :4321，已把 /api/aichat 代理到这里
 *
 * 没有 key 也想看界面：AICHAT_MOCK=1，会返回一段假的 SSE（思考块、搜索卡片、
 * 引用、标题、用量都有），走的是和真实回答完全一样的解析路径。
 * 这个分支只存在于本地工具里，线上代码没有它。
 */

import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleAichat, checkSession } from '../worker/aichat.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.AICHAT_DEV_PORT ?? 8787);
const HOST = '127.0.0.1';

// ---------------------------------------------------------------- .dev.vars

function loadDevVars() {
	const file = resolve(ROOT, '.dev.vars');
	const env = {};
	if (!existsSync(file)) return env;
	for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq < 0) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		env[key] = value;
	}
	return env;
}

const env = { ...loadDevVars() };
const MOCK = process.env.AICHAT_MOCK === '1' || env.AICHAT_MOCK === '1';

// ---------------------------------------------------------------- 假上游

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const MOCK_ANSWER = `这是**本地假上游**的流式回答，用来验证解析路径。

链路顺序：思考块 → 搜索调用 → 搜索结果 → 再思考 → 带引用的正文。

- 公式测试：$E = mc^2$
- 行内代码：\`const x = 1\`

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$

\`\`\`js
const answer = 42;
console.log(answer);
\`\`\`

| 字段 | 含义 |
| --- | --- |
| 输入 | 未命中缓存的 tokens |
| 命中 | 命中 KV 缓存的 tokens |

接上真 key 之后，这里就是 \`deepseek-flash\` 的回答。`;

function mockEvents() {
	const events = [];
	const push = (event, data) => events.push(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

	push('message_start', {
		type: 'message_start',
		message: { id: 'msg_mock', type: 'message', role: 'assistant', model: 'deepseek-flash', content: [], usage: { input_tokens: 340, cache_read_input_tokens: 0, output_tokens: 0 } },
	});

	push('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } });
	for (const piece of ['先确认一下这是本地假上游：', '不走网络，也不花钱。', '下面会顺序展示各种内容块。']) {
		push('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: piece } });
	}
	push('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'mock-signature' } });
	push('content_block_stop', { type: 'content_block_stop', index: 0 });

	push('content_block_start', {
		type: 'content_block_start',
		index: 1,
		content_block: {
			type: 'server_tool_use',
			id: 'srvtoolu_mock_1',
			name: 'deepseek_web_search',
			input: { action: 'search', queries: ['DeepSeek 网页端 限额', 'API 上下文长度'] },
			caller: { type: 'direct' },
			kind: 'search',
		},
	});
	push('content_block_stop', { type: 'content_block_stop', index: 1 });

	push('content_block_start', {
		type: 'content_block_start',
		index: 2,
		content_block: {
			type: 'web_search_tool_result',
			tool_use_id: 'srvtoolu_mock_1',
			kind: 'search',
			content: [
				{
					type: 'web_search_result',
					title: 'DeepSeek 对 App 与网页版推出限额使用措施',
					url: 'https://example.com/news/aichat-quota',
					snippet: '单次输入上限约 4 万字，存续超过 7 天且无活跃交互的长对话不再支持接续。',
					site_name: 'Example News',
					page_age: '2026-11-16T03:00:00+00:00',
				},
				{
					type: 'web_search_result',
					title: '模型 & 价格',
					url: 'https://example.com/docs/pricing',
					snippet: 'deepseek-flash：上下文 1M，最大输出 384K。',
					site_name: 'Example Docs',
				},
			],
		},
	});
	push('content_block_stop', { type: 'content_block_stop', index: 2 });

	push('content_block_start', { type: 'content_block_start', index: 3, content_block: { type: 'thinking', thinking: '' } });
	push('content_block_delta', { type: 'content_block_delta', index: 3, delta: { type: 'thinking_delta', thinking: '搜索页里提到了价目表，引用它。' } });
	push('content_block_stop', { type: 'content_block_stop', index: 3 });

	push('content_block_start', { type: 'content_block_start', index: 4, content_block: { type: 'text', text: '' } });
	const head = '这是**本地假上游**的流式回答';
	for (const piece of head.match(/.{1,6}/gs) ?? []) {
		push('content_block_delta', { type: 'content_block_delta', index: 4, delta: { type: 'text_delta', text: piece } });
	}
	push('content_block_delta', {
		type: 'content_block_delta',
		index: 4,
		delta: {
			type: 'citations_delta',
			citation: {
				type: 'web_search_result_location',
				url: 'https://example.com/news/aichat-quota',
				title: 'DeepSeek 对 App 与网页版推出限额使用措施',
				cited_text: head,
			},
		},
	});
	push('content_block_stop', { type: 'content_block_stop', index: 4 });

	push('content_block_start', { type: 'content_block_start', index: 5, content_block: { type: 'text', text: '' } });
	const rest = MOCK_ANSWER.slice(head.length);
	for (const piece of rest.match(/[\s\S]{1,8}/g) ?? []) {
		push('content_block_delta', { type: 'content_block_delta', index: 5, delta: { type: 'text_delta', text: piece } });
	}
	push('content_block_stop', { type: 'content_block_stop', index: 5 });

	push('message_delta', {
		type: 'message_delta',
		delta: { stop_reason: 'end_turn', title: '本地假上游演示' },
		usage: {
			input_tokens: 520,
			cache_read_input_tokens: 1500,
			output_tokens: 240,
			output_tokens_details: { thinking_tokens: 80 },
			server_tool_use: { tool_search: 2, tool_fetch: 1, tool_image_search: 0 },
		},
	});
	push('message_stop', { type: 'message_stop' });

	return events;
}

function mockStream() {
	const encoder = new TextEncoder();
	const events = mockEvents();
	return new ReadableStream({
		async start(controller) {
			for (const chunk of events) {
				controller.enqueue(encoder.encode(chunk));
				await sleep(18);
			}
			controller.close();
		},
	});
}

// ---------------------------------------------------------------- 适配层

function nodeRequestToWeb(req, res) {
	const url = `http://${req.headers.host ?? `${HOST}:${PORT}`}${req.url}`;
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (typeof value === 'string') headers.set(key, value);
		else if (Array.isArray(value)) headers.set(key, value.join(', '));
	}
	const controller = new AbortController();
	const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
	const body = hasBody ? Readable.toWeb(req) : undefined;
	// 浏览器关页面 / 点停止时把信号一路传到上游 fetch。
	// 必须盯 res 而不是 req：Node 里 req 的 close 在请求体正常读完时也会触发，
	// 那样会在回答刚开始时就 abort，表现为「每次都被截断」。
	res.on('close', () => {
		if (!res.writableEnded) controller.abort();
	});
	return new Request(url, {
		method: req.method,
		headers,
		body,
		signal: controller.signal,
		duplex: hasBody ? 'half' : undefined,
	});
}

async function writeWebResponse(res, response) {
	const headers = {};
	for (const [key, value] of response.headers) {
		if (key.toLowerCase() === 'set-cookie') continue;
		headers[key] = value;
	}
	const cookies = response.headers.getSetCookie?.() ?? [];
	if (cookies.length > 0) headers['set-cookie'] = cookies;
	res.writeHead(response.status, headers);
	if (!response.body) {
		res.end();
		return;
	}
	const stream = Readable.fromWeb(response.body);
	stream.on('error', () => res.destroy());
	stream.pipe(res);
}

const jsonResponse = (data, status = 200) =>
	new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const server = createServer(async (req, res) => {
	try {
		const request = nodeRequestToWeb(req, res);
		const { pathname } = new URL(request.url);
		// 每条请求打一行：调页面时能一眼看出水合有没有跑（有没有打到 /session）
		console.log(`[aichat] ${request.method} ${pathname}`);

		if (MOCK && pathname === '/api/aichat/chat' && request.method === 'POST') {
			if (!(await checkSession(request, env))) return writeWebResponse(res, jsonResponse({ error: 'unauthorized' }, 401));
			await request.text().catch(() => '');
			return writeWebResponse(
				res,
				new Response(mockStream(), {
					headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform' },
				}),
			);
		}

		if (MOCK && pathname === '/api/aichat/files' && request.method === 'POST') {
			if (!(await checkSession(request, env))) return writeWebResponse(res, jsonResponse({ error: 'unauthorized' }, 401));
			const bytes = Number(request.headers.get('content-length') ?? 0);
			await request.arrayBuffer().catch(() => null);
			return writeWebResponse(
				res,
				jsonResponse({
					id: `file-api-mock-${Date.now().toString(36)}`,
					type: 'file',
					size_bytes: bytes,
					filename: 'mock-upload',
					mime_type: request.headers.get('content-type') ?? '',
				}),
			);
		}

		// 本地用文件模拟 R2：线上是 env.SYNC 桶，本地是 .dev-sync.json（已在 .gitignore）
		if (pathname === '/api/aichat/sync') {
			if (!(await checkSession(request, env))) {
				return writeWebResponse(res, jsonResponse({ error: 'unauthorized' }, 401));
			}
			const file = resolve(ROOT, '.dev-sync.json');
			if (request.method === 'GET') {
				const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { sessions: [], savedAt: null };
				return writeWebResponse(res, jsonResponse(data));
			}
			if (request.method === 'PUT') {
				const text = await request.text();
				let payload;
				try {
					payload = JSON.parse(text);
				} catch {
					return writeWebResponse(res, jsonResponse({ error: 'bad_request', message: '不是合法 JSON' }, 400));
				}
				const savedAt = new Date().toISOString();
				const body = JSON.stringify({ version: 1, savedAt, sessions: payload.sessions ?? [] });
				writeFileSync(file, body, 'utf8');
				return writeWebResponse(res, jsonResponse({ ok: true, bytes: body.length, savedAt }));
			}
			return writeWebResponse(res, jsonResponse({ error: 'method_not_allowed' }, 405));
		}

		const response = await handleAichat(request, env);
		await writeWebResponse(res, response);
	} catch (error) {
		if (!res.headersSent) {
			res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
		}
		res.end(JSON.stringify({ error: 'dev_server_error', message: String(error?.message ?? error) }));
		console.error('[aichat]', error);
	}
});

server.listen(PORT, HOST, () => {
	const missing = ['DEEPSEEK_API_KEY', 'AICHAT_PASS', 'AICHAT_SECRET'].filter((key) => !env[key]);
	console.log(`[aichat] http://${HOST}:${PORT}  ${MOCK ? '(MOCK：返回假流，不调上游)' : ''}`);
	if (missing.length > 0 && !MOCK) console.log(`[aichat] .dev.vars 缺少：${missing.join(', ')}`);
});

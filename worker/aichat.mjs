/**
 * /api/aichat/* —— 自建聊天前端的服务端。
 *
 * 只做四件事，不做第五件：
 *   1. 口令登录，下发一枚 HMAC 签名的 HttpOnly cookie；
 *   2. 把前端的 messages 收窄成一份白名单请求体（模型、上限、user_id 都由这里决定，
 *      前端说了不算）；
 *   3. 把上游 SSE 逐字节转发回去 —— 绝不 JSON.parse 再重组，深度思考那种长回答
 *      在 Worker 里逐块解析会把 CPU 时长烧光，而且会弄坏 thinking 的 signature；
 *   4. 上游出错时把状态码翻译成前端能看懂的话，同时不泄漏 key。
 *
 * 这个文件刻意只依赖 Web 标准（Request / Response / fetch / crypto.subtle），
 * 因此同一份代码既能跑在 Worker 里，也能被 tools/aichat-dev-server.mjs
 * 用 Node 直接调用 —— 本地和线上是同一套逻辑，不会漂。
 *
 * 需要的环境变量（线上是 `wrangler secret put`，本地写在 .dev.vars）：
 *   DEEPSEEK_API_KEY  上游密钥
 *   AICHAT_PASS       登录口令
 *   AICHAT_SECRET     给 cookie 签名的随机串（>=32 字节）
 */

const UPSTREAM = 'https://api.deepseek.com/anthropic/v1/messages';
const UPSTREAM_FILES = 'https://api.deepseek.com/anthropic/v1/files';
const FILES_BETA = 'files-api-2025-04-14';
const COOKIE_NAME = 'aichat_session';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 天

/** 模型不让前端选：全家桶工具只有 flash 支持，pro 连图像理解都没有 */
const MODEL = 'deepseek-flash';

/** max_tokens 由服务端封顶，防止一次手滑把余额刷光 */
const MAX_TOKENS_CEILING = 8192;
const MAX_TOKENS_DEFAULT = 4096;

/** 允许前端开启的服务端工具；其余一律丢掉 */
const ALLOWED_TOOLS = new Set(['deepseek_web_search', 'deepseek_read_url']);

/** 请求体护栏：消息条数与总字符数 */
const MAX_MESSAGES = 400;
const MAX_BODY_CHARS = 2_000_000;

/** 上传护栏：与上游单文件上限对齐（文档 100 MiB） */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** KV 缓存按 user_id 隔离，固定值才能让多轮对话持续命中（命中价是未命中的 1/50） */
const STABLE_USER_ID = 'owner';

const encoder = new TextEncoder();

// ---------------------------------------------------------------- 小工具

function json(data, status = 200, extraHeaders) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store',
			...extraHeaders,
		},
	});
}

function b64url(bytes) {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, data) {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
	return b64url(new Uint8Array(sig));
}

/** 定长比较，避免按字符提前 return 泄漏口令长度 */
function safeEqual(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

function readCookie(request, name) {
	const raw = request.headers.get('cookie');
	if (!raw) return null;
	for (const part of raw.split(';')) {
		const eq = part.indexOf('=');
		if (eq < 0) continue;
		if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
	}
	return null;
}

function cookieAttrs(request) {
	// 线上是 https，本地 dev 是 http —— Secure 只能在 https 下加，否则浏览器直接丢掉
	return new URL(request.url).protocol === 'https:' ? 'HttpOnly; Secure; SameSite=Lax; Path=/' : 'HttpOnly; SameSite=Lax; Path=/';
}

// ---------------------------------------------------------------- 会话

export async function issueSession(request, env, password) {
	const missing = [
		!env.AICHAT_SECRET ? 'AICHAT_SECRET' : null,
		!env.AICHAT_PASS ? 'AICHAT_PASS' : null,
	].filter(Boolean);
	if (missing.length > 0) {
		return json({ error: 'config', message: `服务端未配置：${missing.join('、')}` }, 503);
	}
	if (!safeEqual(String(password ?? ''), env.AICHAT_PASS)) {
		// 不给「口令错」之外的任何提示，也不区分「没配」
		return json({ error: 'bad_password', message: '口令不对' }, 401);
	}
	const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
	// 把口令也拌进签名：以后改 AICHAT_PASS，已经发出去的 cookie 会立刻失效，
	// 而不是继续有效到 30 天过期。
	const sig = await hmac(env.AICHAT_SECRET, `${exp}:${env.AICHAT_PASS}`);
	const value = `v1.${exp}.${sig}`;
	return json(
		{ ok: true, exp },
		200,
		{ 'set-cookie': `${COOKIE_NAME}=${value}; Max-Age=${SESSION_TTL}; ${cookieAttrs(request)}` },
	);
}

export async function checkSession(request, env) {
	if (!env.AICHAT_SECRET || !env.AICHAT_PASS) return false;
	const token = readCookie(request, COOKIE_NAME);
	if (!token) return false;
	const parts = token.split('.');
	if (parts.length !== 3 || parts[0] !== 'v1') return false;
	const exp = Number(parts[1]);
	if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return false;
	const expect = await hmac(env.AICHAT_SECRET, `${exp}:${env.AICHAT_PASS}`);
	return safeEqual(parts[2], expect);
}

// ---------------------------------------------------------------- 请求体收窄

function sanitizeMessages(raw) {
	if (!Array.isArray(raw) || raw.length === 0) return null;
	if (raw.length > MAX_MESSAGES) return null;
	const out = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') return null;
		const role = item.role;
		// Anthropic 协议里 tool_result 挂在 user 的 content 数组里，不额外校验 content 结构
		if (role !== 'user' && role !== 'assistant' && role !== 'latest_reminder') return null;
		const content = item.content;
		if (typeof content !== 'string' && !Array.isArray(content)) return null;
		out.push({ role, content });
	}
	return out;
}

function buildUpstreamBody(input, messages) {
	const tools = Array.isArray(input.tools)
		? input.tools.filter((tool) => tool && ALLOWED_TOOLS.has(tool.name ?? tool.type))
		: [];

	const requested = Number(input.max_tokens);
	const maxTokens = Number.isFinite(requested)
		? Math.min(Math.max(Math.trunc(requested), 256), MAX_TOKENS_CEILING)
		: MAX_TOKENS_DEFAULT;

	const body = {
		model: MODEL,
		messages,
		stream: true,
		max_tokens: maxTokens,
		thinking: input.thinking?.type === 'disabled' ? { type: 'disabled' } : { type: 'enabled' },
		// 缓存命中靠的就是这个稳定 id，前端传什么都覆盖掉
		metadata: { user_id: STABLE_USER_ID },
	};
	if (typeof input.system === 'string' && input.system.length < 20000) body.system = input.system;
	if (tools.length > 0) body.tools = tools;
	if (input.safety_check?.level) body.safety_check = { level: input.safety_check.level };
	if (input.title?.enabled === true) body.title = { enabled: true };
	return body;
}

// ---------------------------------------------------------------- 聊天代理

async function handleChat(request, env) {
	if (!env.DEEPSEEK_API_KEY) {
		return json({ error: 'config', message: '服务端未配置 DEEPSEEK_API_KEY' }, 503);
	}
	if (!(await checkSession(request, env))) {
		return json({ error: 'unauthorized', message: '登录已过期，请重新登录' }, 401);
	}

	const raw = await request.text();
	if (raw.length > MAX_BODY_CHARS) return json({ error: 'too_large', message: '对话上下文过长' }, 413);

	let input;
	try {
		input = JSON.parse(raw);
	} catch {
		return json({ error: 'bad_request', message: '请求体不是 JSON' }, 400);
	}

	const messages = sanitizeMessages(input?.messages);
	if (!messages) return json({ error: 'bad_request', message: 'messages 不合法' }, 400);

	const body = buildUpstreamBody(input, messages);

	// 浏览器断开（关标签页/点停止）时把上游一起掐掉，否则它还在烧 token
	const controller = new AbortController();
	const abort = () => controller.abort();
	request.signal?.addEventListener?.('abort', abort);

	function hasFileBlocks(items) {
		return items.some(
			(message) =>
				Array.isArray(message.content) &&
				message.content.some(
					(block) =>
						(block?.type === 'image' || block?.type === 'document') &&
						(block?.source?.type === 'file' || block?.source?.type === 'text'),
				),
		);
	}

	let upstream;
	try {
		upstream = await fetch(UPSTREAM, {
			method: 'POST',
			signal: controller.signal,
			headers: {
				'content-type': 'application/json',
				'x-api-key': env.DEEPSEEK_API_KEY,
				'anthropic-version': '2023-06-01',
				// 引用 Files API 上传的文件时，Messages 端点要求带这个 beta 头
				...(hasFileBlocks(messages) ? { 'anthropic-beta': FILES_BETA } : {}),
			},
			body: JSON.stringify(body),
		});
	} catch (error) {
		request.signal?.removeEventListener?.('abort', abort);
		if (controller.signal.aborted) return json({ error: 'aborted' }, 499);
		return json({ error: 'upstream_unreachable', message: String(error?.message ?? error) }, 502);
	}

	if (!upstream.ok) {
		request.signal?.removeEventListener?.('abort', abort);
		const detail = (await upstream.text().catch(() => '')).slice(0, 600);
		const status = upstream.status === 429 ? 429 : upstream.status === 401 ? 502 : 502;
		const message =
			upstream.status === 401
				? '上游拒绝了服务端密钥（401），检查 DEEPSEEK_API_KEY'
				: upstream.status === 402
					? '账户余额不足（402）'
					: upstream.status === 429
						? '上游限流（429），稍后再试'
						: `上游返回 ${upstream.status}`;
		return json({ error: 'upstream_error', status: upstream.status, message, detail }, status);
	}

	const headers = new Headers({
		'content-type': upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
		// no-transform + 显式 no-store：中间任何一层都不许攒包或缓存
		'cache-control': 'no-store, no-transform',
		'x-accel-buffering': 'no',
	});
	return new Response(upstream.body, { status: 200, headers });
}

// ---------------------------------------------------------------- 文件上传

/**
 * POST /api/aichat/files —— multipart 直通上游 Files API。
 *
 * 只做三件事：验会话、限大小、把 body 原样转过去。这里刻意不读表单内容：
 * 文档解析期间上游可能几十秒不返回，Worker 里把整个 multipart 读进内存
 * 既慢又可能撞上内存上限，流式转发最省事。
 */
async function handleUpload(request, env) {
	if (!env.DEEPSEEK_API_KEY) {
		return json({ error: 'config', message: '服务端未配置 DEEPSEEK_API_KEY' }, 503);
	}
	if (!(await checkSession(request, env))) {
		return json({ error: 'unauthorized', message: '登录已过期，请重新登录' }, 401);
	}

	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.startsWith('multipart/form-data')) {
		return json({ error: 'bad_request', message: '需要 multipart/form-data' }, 400);
	}

	const declared = Number(request.headers.get('content-length') ?? 0);
	if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
		return json({ error: 'too_large', message: '文件超过 100 MiB' }, 413);
	}

	let upstream;
	try {
		const init = {
			method: 'POST',
			headers: {
				'x-api-key': env.DEEPSEEK_API_KEY,
				'content-type': contentType,
				'anthropic-beta': FILES_BETA,
			},
			body: request.body,
		};
		// Node 的 fetch 要求显式声明流式请求体（duplex: 'half'）；Worker 里没有这个
		// 概念，就不带 —— 免得依赖「Worker 会忽略未知字段」这种没写进文档的行为。
		if (typeof process !== 'undefined' && process?.versions?.node) init.duplex = 'half';
		upstream = await fetch(UPSTREAM_FILES, init);
	} catch (error) {
		return json({ error: 'upstream_unreachable', message: String(error?.message ?? error) }, 502);
	}

	const text = await upstream.text().catch(() => '');
	if (upstream.status === 401) {
		return json({ error: 'upstream_auth', message: '上游拒绝了服务端密钥（401），检查 DEEPSEEK_API_KEY' }, 502);
	}

	let message;
	if (!upstream.ok) {
		try {
			message = JSON.parse(text)?.error?.message;
		} catch {
			/* 上游不一定回 JSON */
		}
	}
	const body = upstream.ok ? text : JSON.stringify({ error: 'upstream_error', status: upstream.status, message: message ?? `上传失败（${upstream.status}）` });

	return new Response(body, {
		status: upstream.status,
		headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
	});
}

// ---------------------------------------------------------------- 同步

/**
 * /api/aichat/sync —— 站点额度的「云端快照」。
 *
 * 只有一个用户，所以存一个对象就够了：`sync/owner.json`，内容是
 *   { version: 1, savedAt, sessions: Session[] }
 *
 * 为什么是 R2 而不是 KV：文本快照现在 ~28 MB（官方导出 549 个会话），
 * KV 单值上限 25 MiB 会卡住，D1 单行也有大小限制；R2 是对象存储，正好。
 *
 * 只给「站点口令」这条线用：BYOK 模式本来就不经过服务器，也不该有服务端数据。
 */
const SYNC_KEY = 'sync/owner.json';
const SYNC_MAX_BYTES = 64 * 1024 * 1024;

async function handleSync(request, env) {
	if (!(await checkSession(request, env))) {
		return json({ error: 'unauthorized', message: '登录已过期，请重新登录' }, 401);
	}
	if (!env.SYNC) {
		return json({ error: 'config', message: '服务端未配置同步存储（缺 R2 绑定 SYNC）' }, 503);
	}

	if (request.method === 'GET') {
		const object = await env.SYNC.get(SYNC_KEY);
		if (!object) return json({ sessions: [], savedAt: null });
		const text = await object.text();
		return new Response(text, {
			status: 200,
			headers: {
				'content-type': 'application/json; charset=utf-8',
				'cache-control': 'no-store',
				'x-synced-at': object.customMetadata?.savedAt ?? '',
			},
		});
	}

	if (request.method === 'PUT') {
		const text = await request.text();
		if (text.length > SYNC_MAX_BYTES) {
			return json({ error: 'too_large', message: '快照超过 64 MB' }, 413);
		}
		let payload;
		try {
			payload = JSON.parse(text);
		} catch {
			return json({ error: 'bad_request', message: '不是合法 JSON' }, 400);
		}
		if (!Array.isArray(payload?.sessions)) {
			return json({ error: 'bad_request', message: '缺少 sessions 数组' }, 400);
		}
		const savedAt = new Date().toISOString();
		const body = JSON.stringify({ version: 1, savedAt, sessions: payload.sessions });
		await env.SYNC.put(SYNC_KEY, body, {
			httpMetadata: { contentType: 'application/json; charset=utf-8' },
			customMetadata: { savedAt },
		});
		return json({ ok: true, bytes: body.length, savedAt });
	}

	return json({ error: 'method_not_allowed' }, 405);
}

// ---------------------------------------------------------------- 路由

export async function handleAichat(request, env) {
	const { pathname } = new URL(request.url);
	const method = request.method;

	if (pathname === '/api/aichat/session' && method === 'GET') {
		return json({ authed: await checkSession(request, env), model: MODEL });
	}

	// 只报「有没有配」，不报值。部署后用它一眼看出是 secret 没挂上还是别的问题。
	// keys 用来排查名字拼错 / 带空格这种面板上看不出来的问题。
	if (pathname === '/api/aichat/config' && method === 'GET') {
		let keys = [];
		try {
			keys = Object.keys(env).sort();
		} catch {
			keys = [];
		}
		return json({
			hasApiKey: Boolean(env.DEEPSEEK_API_KEY),
			hasPass: Boolean(env.AICHAT_PASS),
			hasSecret: Boolean(env.AICHAT_SECRET),
			hasBucket: Boolean(env.SYNC),
			keys,
		});
	}

	if (pathname === '/api/aichat/login' && method === 'POST') {
		let password = '';
		try {
			password = (await request.json())?.password ?? '';
		} catch {
			return json({ error: 'bad_request' }, 400);
		}
		return issueSession(request, env, password);
	}

	if (pathname === '/api/aichat/logout' && method === 'POST') {
		return json({ ok: true }, 200, {
			'set-cookie': `${COOKIE_NAME}=; Max-Age=0; ${cookieAttrs(request)}`,
		});
	}

	if (pathname === '/api/aichat/chat') {
		if (method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
		return handleChat(request, env);
	}

	if (pathname === '/api/aichat/files') {
		if (method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
		return handleUpload(request, env);
	}

	if (pathname === '/api/aichat/sync') {
		return handleSync(request, env);
	}

	return json({ error: 'not_found' }, 404);
}

export const __internals = { sanitizeMessages, buildUpstreamBody, MODEL };

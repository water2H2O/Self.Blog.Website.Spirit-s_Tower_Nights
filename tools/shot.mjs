/**
 * 无依赖截图工具：走 Chrome DevTools Protocol。
 *
 * 本站首屏有个「水水使用协议」弹层（sessionStorage 没写过就弹），
 * 直接截图只会拍到它，所以这个脚本先执行一段预处理（默认点掉那个弹层），
 * 再等页面稳下来截图。
 *
 * 用法：
 *   node tools/shot.mjs <url> <输出.png> [宽] [高] [--full] [--eval "js"] [--wait 1200]
 *
 * 例：
 *   node tools/shot.mjs http://127.0.0.1:4322/worldview/lore/ shot.png 1600 1800
 *   node tools/shot.mjs http://127.0.0.1:4322/worldview/lore/ full.png 1200 900 --full
 *
 * 需要本机有 Chrome。只用于开发时核对排版，不进构建流程。
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { findBrowser, tempDir, BROWSER_HINT } from './find-chrome.mjs';

const argv = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (let i = 0; i < argv.length; i += 1) {
	if (argv[i].startsWith('--')) {
		const [name, inline] = argv[i].slice(2).split('=');
		if (inline !== undefined) flags.set(name, inline);
		else if (['full'].includes(name)) flags.set(name, true);
		else flags.set(name, argv[++i]);
	} else positional.push(argv[i]);
}

const [url, out, width = '1600', height = '1000'] = positional;
if (!url || !out) {
	console.error('用法：node tools/shot.mjs <url> <输出.png> [宽] [高] [--full] [--eval "js"] [--wait 1200]');
	process.exit(2);
}

const fullPage = flags.has('full');
const waitMs = Number(flags.get('wait') ?? 1200);
const extraEval = flags.get('eval') ?? '';
const port = Number(flags.get('port') ?? 9333 + Math.floor(Math.random() * 200));

const chrome = findBrowser();
if (!chrome) {
	console.error(BROWSER_HINT);
	process.exit(2);
}

const profile = tempDir('dsh-shot');
const child = spawn(
	chrome,
	[
		'--headless=new',
		'--disable-gpu',
		'--hide-scrollbars',
		'--no-first-run',
		'--no-default-browser-check',
		`--remote-debugging-port=${port}`,
		`--user-data-dir=${profile}`,
		`--window-size=${width},${height}`,
		'about:blank',
	],
	{ stdio: 'ignore' },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 等 /json/version 起来 */
let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i += 1) {
	try {
		const res = await fetch(`http://127.0.0.1:${port}/json/version`);
		wsUrl = (await res.json()).webSocketDebuggerUrl;
	} catch {
		await sleep(250);
	}
}
if (!wsUrl) {
	child.kill();
	console.error('Chrome 没起来');
	process.exit(1);
}

const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
	ws.addEventListener('open', resolve, { once: true });
	ws.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (event) => {
	const msg = JSON.parse(event.data);
	if (msg.id && pending.has(msg.id)) {
		const { resolve, reject } = pending.get(msg.id);
		pending.delete(msg.id);
		if (msg.error) reject(new Error(msg.error.message));
		else resolve(msg.result);
	}
});
const send = (method, params = {}, sessionId) =>
	new Promise((resolve, reject) => {
		const id = nextId++;
		pending.set(id, { resolve, reject });
		ws.send(JSON.stringify({ id, method, params, sessionId }));
	});

/** 开一个标签页，挂上 session 后所有命令都带 sessionId */
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const call = (method, params) => send(method, params, sessionId);

await call('Page.enable');
await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride', {
	width: Number(width),
	height: Number(height),
	deviceScaleFactor: 1,
	mobile: false,
});

await call('Page.navigate', { url });
await sleep(waitMs);

/** 预处理：点掉使用协议弹层（点不到就算了，静默跳过） */
await call('Runtime.evaluate', {
	expression: `(() => {
		const gate = document.getElementById('entry-gate');
		if (!gate) return 'no gate';
		const yes = document.getElementById('gate-yes');
		if (yes) yes.click();          // 走正规途径：写 sessionStorage 并关闭
		gate.remove();                 // 兜底：万一脚本没跑起来，直接把弹层拆掉
		document.body.style.overflow = 'auto';
		return gate.hidden ? 'was hidden' : 'dismissed';
	})()`,
	returnByValue: true,
});

/**
 * --overflow：找出把文档撑宽的元素（横向滚动条的元凶）。
 * 只看矩形右边界超过视口的元素，按右边界排序，最多报 12 个。
 */
if (flags.has('overflow')) {
	const { result } = await call('Runtime.evaluate', {
		returnByValue: true,
		expression: `JSON.stringify((() => {
			const limit = innerWidth;
			const out = [];
			for (const el of document.querySelectorAll('body *')) {
				const r = el.getBoundingClientRect();
				if (r.width === 0 && r.height === 0) continue;
				if (r.right > limit + 1 || r.left < -1) {
					const cs = getComputedStyle(el);
					out.push({
						tag: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : ''),
						left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
						pos: cs.position, ws: cs.whiteSpace, depth: (() => { let d = 0, p = el; while ((p = p.parentElement)) d++; return d; })(),
					});
				}
			}
			out.sort((a, b) => b.right - a.right);
			return { 视口: limit, 文档宽: document.documentElement.scrollWidth, 越界元素: out.slice(0, 12) };
		})())`,
	});
	const data = JSON.parse(result.value);
	console.log(`视口 ${data.视口} / 文档宽 ${data.文档宽}`);
	for (const el of data.越界元素) {
		console.log(
			`  ${'  '.repeat(Math.max(0, el.depth - 2))}${el.tag}  x${el.left}→${el.right} w${el.width} ${el.pos}${el.ws === 'nowrap' ? ' nowrap' : ''}`,
		);
	}
}

/**
 * --widths：在若干档视口宽度上量同一页，输出一张表 ——
 * 横向溢出 / 主线宽 / 卡片宽 / 卡片列数 / 类目栏形态。
 * 「改了版式有没有在某档宽度崩掉」用这个一次看完。
 */
if (flags.has('widths')) {
	const list = String(flags.get('widths'))
		.split(',')
		.map((n) => Number(n.trim()))
		.filter((n) => n > 0);
	const rows = [];
	for (const vw of list) {
		await call('Emulation.setDeviceMetricsOverride', {
			width: vw,
			height: 900,
			deviceScaleFactor: 1,
			mobile: false,
		});
		await sleep(350);
		const { result } = await call('Runtime.evaluate', {
			returnByValue: true,
			expression: `JSON.stringify((() => {
				const r = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect() : null; };
				const cards = [...document.querySelectorAll('article.card')];
				const tops = [...new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top)))];
				const first = r('article.card');
				return {
					视口: innerWidth,
					文档宽: document.documentElement.scrollWidth,
					主线宽: r('main') ? Math.round(r('main').width) : 0,
					卡片宽: first ? Math.round(first.width) : 0,
					列数: cards.length ? cards.filter((c) => Math.round(c.getBoundingClientRect().top) === tops[0]).length : 0,
					类目栏: (() => { const c = document.querySelector('.cats'); return c ? getComputedStyle(c).position : '无'; })(),
					目录侧栏: (() => { const n = document.querySelector('.wv-toc'); return n && getComputedStyle(n).position === 'fixed' && n.getBoundingClientRect().width > 0 ? 'fixed' : '收起'; })(),
				};
			})())`,
		});
		rows.push(JSON.parse(result.value));
	}
	const head = ['视口', '文档宽', '横向溢出', '主线宽', '卡片宽', '列数', '类目栏', '目录侧栏'];
	const body = rows.map((row) => [
		`${row.视口}`,
		`${row.文档宽}`,
		row.文档宽 > row.视口 ? '✗ 溢出' : 'ok',
		`${row.主线宽}`,
		`${row.卡片宽}`,
		`${row.列数}`,
		row.类目栏,
		row.目录侧栏,
	]);
	const widths = head.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
	const line = (cells) => cells.map((c, i) => c + ' '.repeat(widths[i] - c.length + 2)).join('');
	console.log(line(head));
	console.log(widths.map((w) => '-'.repeat(w + 1)).join(' '));
	for (const row of body) console.log(line(row));
	const broken = body.filter((row) => row[2] !== 'ok');
	console.log(broken.length === 0 ? '\n✓ 各档宽度都没有横向溢出' : `\n✗ ${broken.length} 档出现横向溢出`);
}

if (extraEval) {
	const probe = await call('Runtime.evaluate', { expression: extraEval, returnByValue: true });
	console.log(`probe: ${probe.result?.value ?? probe.result?.description ?? '(无返回值)'}`);
}

/**
 * --measure：把几个关键盒子的宽度/位置量回来。
 * 排版问题（横向溢出、被截断）光看截图不好判断，量一遍最省事。
 */
if (flags.has('measure')) {
	const { result } = await call('Runtime.evaluate', {
		returnByValue: true,
		expression: `JSON.stringify((() => {
			const box = (sel) => {
				const el = document.querySelector(sel);
				if (!el) return sel + ': 无';
				const r = el.getBoundingClientRect();
				const cs = getComputedStyle(el);
				return sel + ': x' + Math.round(r.left) + '-' + Math.round(r.right)
					+ ' w' + Math.round(r.width) + ' 内容' + el.scrollWidth
					+ ' pos=' + cs.position + (cs.position === 'sticky' ? ' top=' + cs.top : '')
					+ ' 列=' + cs.gridTemplateColumns.split(' ').length;
			};
			return {
				视口: innerWidth + 'x' + innerHeight,
				文档宽: document.documentElement.scrollWidth,
				横向溢出: document.documentElement.scrollWidth > innerWidth,
				盒子: ['header', 'nav.main', '.brand', '.internal-links', 'main', '.wv-toc', '.layout', '.cats', '.grid', 'article.card'].map(box),
				卡片数: document.querySelectorAll('article.card').length,
				类目数: document.querySelectorAll('.cats a[data-cat]').length,
				高亮类目: (document.querySelector('.cats a.active') || {}).dataset?.cat ?? '（无）',
			};
		})())`,
	});
	const data = JSON.parse(result.value);
	for (const [key, value] of Object.entries(data)) {
		if (Array.isArray(value)) {
			console.log(`${key}:`);
			for (const line of value) console.log(`  ${line}`);
		} else console.log(`${key}: ${value}`);
	}
}
await sleep(Number(flags.get('settle') ?? 600));

const shot = await call('Page.captureScreenshot', {
	format: 'png',
	captureBeyondViewport: Boolean(fullPage),
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(shot.data, 'base64'));

// 顺手把控制台里的报错带回来 —— 页面脚本炸了的话这里能看见
const { result } = await call('Runtime.evaluate', {
	expression: `JSON.stringify({ title: document.title, errors: window.__shotErrors ?? [], height: document.documentElement.scrollHeight })`,
	returnByValue: true,
});
console.log(`written ${out}`);
console.log(result.value);

ws.close();
child.kill();
process.exit(0);

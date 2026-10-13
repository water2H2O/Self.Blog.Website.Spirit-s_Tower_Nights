/**
 * 横向溢出定位：把文档里所有「右边界超过视口」的元素列出来。
 *
 * 用法：node tools/check-overflow.mjs <url> [宽] [--after "js"]
 *   例：node tools/check-overflow.mjs http://127.0.0.1:4322/draw/ 390
 *       node tools/check-overflow.mjs http://127.0.0.1:4322/draw/ 390 --after "document.getElementById('draw').click()"
 *
 * 说明：只看几何（getBoundingClientRect），不受 transform 之外的样式影响；
 * 定位不到任何越界元素却仍有横向滚动时，会提示可能是 fixed/sticky 或滚动条造成。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const url = argv[0];
const width = Number(argv[1] ?? 390);
const afterIdx = argv.indexOf('--after');
const after = afterIdx >= 0 ? argv[afterIdx + 1] : '';
if (!url) {
	console.error('用法：node tools/check-overflow.mjs <url> [宽] [--after "js"]');
	process.exit(2);
}

const CHROME = [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));
if (!CHROME) {
	console.error('找不到 Chrome');
	process.exit(2);
}

const port = 9700 + Math.floor(Math.random() * 200);
const child = spawn(
	CHROME,
	[
		'--headless=new',
		'--disable-gpu',
		'--hide-scrollbars',
		'--no-first-run',
		`--remote-debugging-port=${port}`,
		`--user-data-dir=${process.env.TEMP ?? '.'}\\dsh-ovf-${port}`,
		'about:blank',
	],
	{ stdio: 'ignore' },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i += 1) {
	try {
		wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
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
await new Promise((res, rej) => {
	ws.addEventListener('open', res, { once: true });
	ws.addEventListener('error', rej, { once: true });
});
let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (e) => {
	const m = JSON.parse(e.data);
	if (m.id && pending.has(m.id)) {
		const { resolve, reject } = pending.get(m.id);
		pending.delete(m.id);
		m.error ? reject(new Error(m.error.message)) : resolve(m.result);
	}
});
const send = (method, params = {}, sessionId) =>
	new Promise((resolve, reject) => {
		const id = nextId++;
		pending.set(id, { resolve, reject });
		ws.send(JSON.stringify({ id, method, params, sessionId }));
	});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const call = (m, p) => send(m, p, sessionId);
await call('Page.enable');
await call('Runtime.enable');
await call('Emulation.setDeviceMetricsOverride', {
	width,
	height: 844,
	deviceScaleFactor: 1,
	mobile: width < 700,
});
await call('Page.navigate', { url });
await sleep(1800);

const prelude = `(() => {
	const gate = document.getElementById('entry-gate');
	if (gate) { const y = document.getElementById('gate-yes'); if (y) y.click(); gate.remove(); }
	return true;
})()`;
await call('Runtime.evaluate', { expression: prelude, returnByValue: true });
if (after) await call('Runtime.evaluate', { expression: after, returnByValue: true });
await sleep(2500);

const { result } = await call('Runtime.evaluate', {
	returnByValue: true,
	expression: `JSON.stringify((() => {
		const vw = innerWidth;
		const describe = (el) => {
			const r = el.getBoundingClientRect();
			const cs = getComputedStyle(el);
			return {
				sel: el.tagName.toLowerCase()
					+ (el.id ? '#' + el.id : '')
					+ (typeof el.className === 'string' && el.className.trim()
						? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
						: ''),
				left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
				pos: cs.position, transform: cs.transform === 'none' ? '' : cs.transform,
			};
		};
		const out = [];
		const inScroller = (el) => {
			// 祖先里有横向可滚动的容器时，元素「越界」是那个容器自己的设计
			// （例如本卷章节的横滑条），不算页面被撑宽 —— 文档滚动宽那行才是判据。
			for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
				const cs = getComputedStyle(p);
				if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return true;
			}
			return false;
		};
		for (const el of document.querySelectorAll('body *')) {
			const r = el.getBoundingClientRect();
			if (r.width === 0 && r.height === 0) continue;
			if (r.right > vw + 0.5 || r.left < -0.5) {
				if (inScroller(el)) continue;
				out.push(describe(el));
			}
		}
		out.sort((a, b) => b.right - a.right);
		return {
			视口: vw,
			文档滚动宽: document.documentElement.scrollWidth,
			body滚动宽: document.body.scrollWidth,
			越界: out.slice(0, 15),
		};
	})())`,
});

const data = JSON.parse(result.value);
console.log(`视口 ${data.视口} ／ 文档滚动宽 ${data.文档滚动宽} ／ body ${data.body滚动宽}`);
if (data.越界.length === 0) {
	console.log('✓ 没有元素越界（若仍有横向滚动条，多半是 fixed 元素或滚动条本身）');
} else {
	console.log(`✗ ${data.越界.length} 个元素越界：`);
	for (const el of data.越界) {
		console.log(
			`  ${el.sel}  x${el.left}→${el.right} w${el.w} ${el.pos}${el.transform ? ' transform=' + el.transform : ''}`,
		);
	}
}
ws.close();
child.kill();
process.exit(0);

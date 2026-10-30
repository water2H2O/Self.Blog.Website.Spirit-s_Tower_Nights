/**
 * 抽签页版式体检：把关键块的位置与高度量出来，可指定视口宽度。
 *
 * 手机版最容易出问题的地方是「卡面立绘把整屏吃满，名字要滚很远才看得到」，
 * 所以这里重点量：卡面 / 立绘 / 名字 / 档案 / 签纸 / 历史，各自占多高、
 * 摇完之后要滚多远才看得到名字。
 *
 * 用法：node tools/check-draw-layout.mjs [宽度…]
 *   例：node tools/check-draw-layout.mjs 390 430 860 1200
 *   需要先起本地静态服务（见 README 的自检一节），默认读 http://127.0.0.1:4322
 */
import { spawn } from 'node:child_process';
import { findBrowser, tempDir, BROWSER_HINT } from './find-chrome.mjs';

const BASE = process.env.DRAW_URL ?? 'http://127.0.0.1:4322/draw/';
const widths = process.argv.slice(2).map(Number).filter((n) => n > 0);
const list = widths.length > 0 ? widths : [390, 430, 768, 860, 1100, 1500];

const CHROME = findBrowser();
if (!CHROME) {
	console.error(BROWSER_HINT);
	process.exit(2);
}

const port = 9500 + Math.floor(Math.random() * 300);
const child = spawn(
	CHROME,
	[
		'--headless=new',
		'--disable-gpu',
		'--hide-scrollbars',
		'--no-first-run',
		`--remote-debugging-port=${port}`,
		`--user-data-dir=${tempDir('dsh-drawcheck')}`,
		'about:blank',
	],
	{ stdio: 'ignore' },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i += 1) {
	try {
		wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json())
			.webSocketDebuggerUrl;
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
const call = (method, params) => send(method, params, sessionId);
await call('Page.enable');
await call('Runtime.enable');

const MEASURE = `JSON.stringify((() => {
	const box = (sel) => {
		const el = document.querySelector(sel);
		if (!el || getComputedStyle(el).display === 'none') return null;
		const r = el.getBoundingClientRect();
		return { top: Math.round(r.top + scrollY), h: Math.round(r.height), w: Math.round(r.width) };
	};
	return {
		视口宽: innerWidth,
		文档宽: document.documentElement.scrollWidth,
		文档高: document.documentElement.scrollHeight,
		卡面: box('#card3d'),
		立绘: box('#reveal .art'),
		卡上名字: box('#cap-name'),
		档案: box('#detail'),
		档案标题: box('#d-name'),
		摇签按钮: box('#draw'),
		签纸: box('#slip'),
		历史: box('#history'),
	};
})())`;

const rows = [];
for (const width of list) {
	await call('Emulation.setDeviceMetricsOverride', {
		width,
		height: 844,
		deviceScaleFactor: 1,
		mobile: width < 700,
	});
	await call('Page.navigate', { url: BASE });
	await sleep(1600);
	// 点掉使用协议，再摇一支
	await call('Runtime.evaluate', {
		expression: `(() => {
			const gate = document.getElementById('entry-gate');
			if (gate) { const y = document.getElementById('gate-yes'); if (y) y.click(); gate.remove(); }
			const b = document.getElementById('draw');
			if (b) b.click();
			return true;
		})()`,
		returnByValue: true,
	});
	await sleep(2600);
	const { result } = await call('Runtime.evaluate', { expression: MEASURE, returnByValue: true });
	const m = JSON.parse(result.value);
	rows.push({ width, m });
}

const fmt = (b) => (b ? `${b.h}` : '—');
const head = ['视口', '文档宽', '溢出', '卡面高', '立绘高', '卡上名字', '档案高', '按钮', '签纸高', '历史'];
console.log(head.map((h, i) => h.padEnd([6, 6, 4, 7, 6, 8, 6, 5, 6, 5][i])).join(''));
console.log('-'.repeat(74));
for (const { width, m } of rows) {
	const cells = [
		`${width}`,
		`${m.文档宽}`,
		m.文档宽 > width + 1 ? '✗' : 'ok',
		fmt(m.卡面),
		fmt(m.立绘),
		fmt(m.卡上名字),
		fmt(m.档案),
		fmt(m.摇签按钮),
		fmt(m.签纸),
		fmt(m.历史),
	];
	console.log(cells.map((c, i) => c.padEnd([6, 6, 4, 7, 6, 8, 6, 5, 6, 5][i])).join(''));
}

console.log('\n备注：手机上希望「卡面 + 卡上名字」整体不高于一屏（约 700px），');
console.log('      名字不该需要滚动才看得到。');
ws.close();
child.kill();
process.exit(0);

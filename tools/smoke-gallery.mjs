/** 本地浏览器回归（需 Chrome）：node tools/smoke-gallery.mjs http://127.0.0.1:4321 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { findBrowser, BROWSER_HINT } from './find-chrome.mjs';

const base = new URL(process.argv[2] || 'http://127.0.0.1:4321');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), '此回归工具只访问本地预览');
assert.equal((await fetch(new URL('/worldview/gallery/', base))).status, 200, '先启动 pnpm preview');
const browser = findBrowser();
assert.ok(browser, BROWSER_HINT);
const tempRoot = realpathSync(tmpdir());
const profile = mkdtempSync(join(tempRoot, 'tower-gallery-smoke-'));
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let ws;
let closeBrowser;
let id = 0;
const pending = new Map();
const requests = [];
const errors = [];
try {
	let stderr = '';
	const wsUrl = await new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`Chrome 启动超时：${stderr}`)), 15000);
		child.once('error', reject);
		child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exited ${code}: ${stderr}`)); });
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
			const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
			if (match) { clearTimeout(timer); resolve(match[1]); }
		});
	});
	ws = new WebSocket(wsUrl);
	await once(ws, 'open');
	ws.addEventListener('message', ({ data }) => {
		const msg = JSON.parse(data);
		if (msg.id && pending.has(msg.id)) {
			const { resolve, reject, timer } = pending.get(msg.id);
			clearTimeout(timer);
			pending.delete(msg.id);
			if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
		}
		if (msg.method === 'Network.requestWillBeSent' && new URL(msg.params.request.url).pathname.startsWith('/gallery/')) requests.push({ url: msg.params.request.url, loaderId: msg.params.loaderId });
		if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
	});
	const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
		const next = ++id;
		const timer = setTimeout(() => { pending.delete(next); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
		pending.set(next, { resolve, reject, timer });
		ws.send(JSON.stringify({ id: next, method, params, sessionId }));
	});
	closeBrowser = () => send('Browser.close');
	const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
	const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
	const call = (method, params) => send(method, params, sessionId);
	const evaluate = async (expression) => {
		const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
		assert.ok(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
		return response.result.value;
	};
	const waitFor = async (expression) => {
		for (let attempt = 0; attempt < 100; attempt++) {
			if (await evaluate(expression)) return;
			await delay(50);
		}
		throw new Error(`页面条件超时：${expression}`);
	};
	await call('Page.enable');
	await call('Runtime.enable');
	await call('Network.enable');
	await call('Network.setCacheDisabled', { cacheDisabled: true });
	const visible = () => evaluate(`Array.from(document.querySelectorAll('.wall .tile:not(.hidden)')).map(t => ({url:t.href, ownership:t.dataset.ownership, hasImage:!!t.querySelector('img'), dimensions:[t.querySelector('img')?.width,t.querySelector('img')?.height]}))`);
	for (const [path, width, expected] of [
		['/worldview/gallery/', 1440, 60], ['/worldview/gallery/', 390, 30],
		['/worldview/gallery/', 320, 30], ['/worldview/characters/miaomiao/', 390, 30],
		['/project/oc/', 1440, null],
	]) {
		requests.length = 0;
		await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
		const navigation = await call('Page.navigate', { url: new URL(path, base).href });
		await waitFor(`!!document.querySelector('.wall.ready')`);
		await evaluate(`document.querySelector('#gate-yes')?.click();document.querySelector('#entry-gate')?.remove();document.body.style.overflow='auto';true`);
		const list = await visible();
		if (expected) assert.equal(list.length, expected, `${path} at ${width}px`);
		assert.ok(list.every((t) => t.hasImage && t.dimensions.every((d) => d > 0)), '入选图挂载且有尺寸');
		assert.equal(await evaluate(`document.querySelectorAll('.wall .tile.hidden img').length`), 0, '初次未抽中的图不挂载');
		const urls = new Set(list.map((t) => t.url));
		// 非画墙资源（如角色页的指针）不参与此断言。
		const currentRequests = requests.filter((r) => r.loaderId === navigation.loaderId).map((r) => r.url);
		if (path !== '/worldview/characters/miaomiao/') assert.ok(currentRequests.every((u) => urls.has(u)), `未抽中的画作不能产生网络请求：${currentRequests.filter((u) => !urls.has(u)).join(', ')}`);
		assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), `没有横向溢出：${width}`);
		const selected = await evaluate(`(()=>{const a=document.querySelector('.tile:not(.hidden)');a.focus();return a.href})()`);
		await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
		await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
		await waitFor(`!!document.querySelector('dialog[open]')`);
		await waitFor(`(()=>{const img=document.querySelector('dialog[open] img');return img?.complete && img.naturalWidth>0})()`);
		assert.equal(await evaluate(`document.querySelector('dialog[open] img').src`), selected, '灯箱仍打开同一原图');
		assert.ok(await evaluate(`document.querySelector('dialog[open]').contains(document.activeElement)`), '焦点在模态灯箱中');
		await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
		await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
		await waitFor(`!document.querySelector('dialog[open]')`);
		assert.equal(await evaluate(`document.activeElement.href`), selected, '关闭大图后焦点回到画作');
		if (path === '/worldview/gallery/') {
			await evaluate(`document.querySelector('[data-filter="原创"]').click();true`);
			assert.ok((await visible()).every((t) => t.ownership === '原创'), '归属筛选正确');
			assert.ok(await evaluate(`document.querySelector('[data-filter="原创"]').getAttribute('aria-pressed')==='true'`));
			// 图片加载、地址栏收缩式的仅高度变化不能再摇一次图。
			const before = JSON.stringify(await evaluate(`Array.from(document.querySelectorAll('.tile:not(.hidden)')).map(t=>[t.href,t.style.transform])`));
			await call('Emulation.setDeviceMetricsOverride', { width, height: 700, deviceScaleFactor: 1, mobile: false });
			await delay(180);
			assert.equal(JSON.stringify(await evaluate(`Array.from(document.querySelectorAll('.tile:not(.hidden)')).map(t=>[t.href,t.style.transform])`)), before, '仅高度变化不重排/重抽');
		}
		console.log(`Browser passed: ${path} ${width}px; ${list.length} selected; original URLs, filter/layout, Enter/Escape/focus verified.`);
	}
	await call('Emulation.setScriptExecutionDisabled', { value: true });
	await call('Page.navigate', { url: new URL('/worldview/gallery/', base).href });
	await waitFor(`document.readyState==='complete'`);
	assert.ok(await evaluate(`Array.from(document.querySelectorAll('noscript a')).length>100`), '禁用JS仍有原图入口');
	assert.equal(await evaluate(`document.querySelectorAll('.wall img').length`), 0, '禁用JS不下载模板内图片');
	console.log('Browser passed: JavaScript disabled original-link fallback.');
	assert.deepEqual(errors, [], '无浏览器未处理异常');
} finally {
	// 让整个浏览器正常退出，而不是只杀主进程留下仍在写 profile 的子进程。
	if (closeBrowser && child.exitCode === null && child.signalCode === null) {
		await closeBrowser().catch(() => {});
	}
	ws?.close();
	if (child.exitCode === null && child.signalCode === null) {
		await Promise.race([once(child, 'exit'), delay(3000)]);
		if (child.exitCode === null && child.signalCode === null) {
			const exited = once(child, 'exit');
			child.kill();
			await exited;
		}
	}
	// 仅删除刚由 mkdtemp 创建、且真实路径仍位于系统临时目录的独立配置目录。
	const resolved = realpathSync(profile);
	assert.equal(dirname(resolved), tempRoot);
	assert.ok(basename(resolved).startsWith('tower-gallery-smoke-'));
	rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

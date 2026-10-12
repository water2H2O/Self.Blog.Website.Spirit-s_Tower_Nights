/**
 * 抽签页脚本的冒烟测试。
 *
 * 为什么要这一支：抽签的全部交互都在浏览器里跑，构建通过 ≠ 点得动。
 * 之前就踩过一次 —— 脚本无条件 getElementById('cap-limit')，而标记里那个 span
 * 是按条件渲染的，结果 getElementById 返回 null，`null.hidden = …` 抛 TypeError，
 * 整段脚本停在那儿，按钮永远停在 disabled，页面上就是「点了动不了」。
 *
 * 这里把 dist 里的抽签页 HTML 抠出来，接一个很小的假 DOM，按真实顺序跑一遍：
 *   1. 两个内联脚本（入场协议 + 抽签）能不能跑完不抛错
 *   2. 脚本引用的每个 id，标记里是不是都存在（就是上面那个 bug 的形态）
 *   3. 点一下「摇一支签」，整条动画链（左移 → 摇晃 → 翻牌 → 签纸）能不能走完
 *   4. 走完之后按钮有没有解锁、卡面是不是真的换成了另一个角色
 *
 * 用法：node tools/smoke-draw.mjs [dist/draw/index.html]
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const file = process.argv[2] ?? 'dist/draw/index.html';
const html = fs.readFileSync(file, 'utf8');

const problems = [];
const note = (msg) => problems.push(msg);

/* ---------- 一个够用的假 DOM ---------- */

class El {
	constructor(tag, id = '') {
		this.tagName = (tag || 'div').toUpperCase();
		this.id = id;
		this.children = [];
		this.attributes = {};
		this.dataset = {};
		this.style = {
			setProperty(name, value) {
				this[name] = value;
			},
		};
		this._text = '';
		this._classes = new Set();
		this._listeners = {};
		this.hidden = false;
		this.disabled = false;
		this.offsetWidth = 1;
		this.classList = {
			add: (...names) => names.forEach((n) => this._classes.add(n)),
			remove: (...names) => names.forEach((n) => this._classes.delete(n)),
			contains: (n) => this._classes.has(n),
			toggle: (n, on) => (on ? this._classes.add(n) : this._classes.delete(n)),
		};
	}
	get textContent() {
		return this._text;
	}
	set textContent(value) {
		this._text = String(value);
		this.children = [];
	}
	get innerHTML() {
		return '';
	}
	set innerHTML(value) {
		this.children = [];
		this._text = String(value);
	}
	append(...nodes) {
		this.children.push(...nodes);
	}
	appendChild(node) {
		this.children.push(node);
		return node;
	}
	setAttribute(name, value) {
		this.attributes[name] = String(value);
	}
	getAttribute(name) {
		return this.attributes[name] ?? null;
	}
	addEventListener(type, fn) {
		(this._listeners[type] ??= []).push(fn);
	}
	dispatch(type, event = {}) {
		for (const fn of this._listeners[type] ?? []) fn({ target: this, preventDefault() {}, ...event });
	}
	/* 递归找出所有后代里带某个 class 的 */
	findByClass(name, out = []) {
		if (this._classes.has(name)) out.push(this);
		for (const child of this.children) child.findByClass?.(name, out);
		return out;
	}
}

const elements = new Map();
const getEl = (id) => elements.get(id) ?? null;

/* 标记里出现的 id 全部建出来（模拟真实页面里存在这些节点） */
const declaredIds = new Set();
for (const m of html.matchAll(/id="([^"]+)"/g)) declaredIds.add(m[1]);
for (const id of declaredIds) elements.set(id, new El('div', id));

/* draw-data 里是内嵌 JSON，脚本要读它的 textContent */
const dataMatch = html.match(/<script type="application\/json" id="draw-data"[^>]*>([\s\S]*?)<\/script>/);
if (!dataMatch) {
	console.error('✗ 找不到 id="draw-data" 的内嵌数据');
	process.exit(1);
}
getEl('draw-data').textContent = dataMatch[1];

const warnings = [];
const errors = [];

const sandbox = {
	document: {
		getElementById: (id) => getEl(id),
		createElement: (tag) => new El(tag),
		addEventListener: () => {},
		querySelector: () => null,
		querySelectorAll: () => [],
		body: new El('body'),
	},
	window: {
		setTimeout: (fn, ms) => setTimeout(fn, ms),
		clearTimeout: (t) => clearTimeout(t),
		addEventListener: () => {},
		matchMedia: () => ({ matches: false, addEventListener: () => {} }),
		location: { pathname: '/draw/', href: 'https://example.test/draw/' },
		localStorage: { getItem: () => null, setItem: () => {} },
	},
	localStorage: { getItem: () => null, setItem: () => {} },
	sessionStorage: { getItem: () => null, setItem: () => {} },
	console: {
		log: () => {},
		info: () => {},
		warn: (...a) => warnings.push(a.join(' ')),
		error: (...a) => errors.push(a.map(String).join(' ')),
		debug: () => {},
	},
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: (t) => clearTimeout(t),
	requestAnimationFrame: (fn) => setTimeout(fn, 16),
	/* 入场协议那段脚本会探测 /agree-probe.txt、读 performance entries，
	   还会读 window.innerWidth —— 都给个空壳，免得它把测试进程带崩 */
	fetch: () => Promise.reject(new Error('smoke test: no network')),
	performance: { getEntriesByType: () => [] },
	innerWidth: 1280,
	innerHeight: 900,
	/* 不要往沙箱里塞 JSON / Math / Set / Promise 这些内建对象：
	   vm 的上下文自带一套，外面塞进去的会让两个 realm 的内建互相打架
	   （曾经就因为这样，脚本里的箭头函数莫名其妙变成「不是函数」）。 */
};

/* ---------- 跑内联脚本 ---------- */

const inline = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (inline.length === 0) note('页面里没有内联脚本，可能构建产物变了');

/* 脚本里被 getElementById 抓的 id —— 少一个就会在真实浏览器里抛 TypeError */
const wanted = new Set();
for (const src of inline) {
	for (const m of src.matchAll(/getElementById\(`([^`]+)`\)/g)) wanted.add(m[1]);
}
for (const id of wanted) {
	if (!declaredIds.has(id)) note(`脚本引用了 id="${id}"，但标记里没有这个节点（会导致 null.xxx 抛错）`);
}

const context = vm.createContext(sandbox);
const running = new Set();
inline.forEach((src, index) => {
	const name = `第 ${index + 1} 段`;
	try {
		/* 贴一个探针在尾巴上：这段脚本跑完之后，它起的异步尾巴如果拒绝，
		   就能知道是哪一段留下的 —— 只是记账用，脚本本身一个字没改。 */
		running.add(name);
		const probed = `${src}\n;globalThis.__done=(globalThis.__done||[]);globalThis.__done.push(${JSON.stringify(name)});`;
		new vm.Script(probed, { filename: `inline-${index}.js` }).runInContext(context, { timeout: 4000 });
	} catch (error) {
		note(`${name}内联脚本抛错：${error.message}`);
	}
});

/* 入场协议那段脚本自己会起一个 async IIFE，跑完可能在这里冒一个拒绝出来。
   那是它自己的收尾，不代表抽签坏了 —— 记一条参考，不判失败。
   （真要让整段脚本挂掉的是上面那种同步抛错，例如 null.xxx。） */
process.on('unhandledRejection', (reason) => {
	const done = context.__done ?? [];
	const who = running.size > 0 ? [...running].pop() : '未知';
	warnings.push(
		`${who}脚本的异步尾巴拒绝了（同步部分已跑完：${done.join('、') || '无'}）：${reason && reason.message ? reason.message : String(reason)}`,
	);
});

/* ---------- 点一下「摇一支签」 ---------- */

const drawBtn = getEl('draw');
const pair = getEl('pair');
const card3d = getEl('card3d');
const slip = getEl('slip');
const capName = getEl('cap-name');
const dName = getEl('d-name');
const capLimit = getEl('cap-limit');
const dLimit = getEl('d-limit');

const before = capName.textContent;
if (typeof drawBtn.dispatch !== 'function') note('假的 DOM 有问题');

drawBtn.dispatch('click');

await new Promise((resolve) => setTimeout(resolve, 2000));

/* ---------- 断言 ---------- */

if (errors.length) note(`运行期 console.error：${errors.join(' | ')}`);
if (!pair._classes.has('drawn')) note('点击后 pair 没有拿到 drawn（卡牌没有左移让位）');
if (!card3d._classes.has('open')) note('点击后卡牌没有翻开（动画链断在半路）');
if (!slip._classes.has('show')) note('点击后签纸没有显示（运势没出来）');
if (drawBtn.disabled) note('点击后按钮仍是 disabled —— 这就是「点了动不了」');
if (drawBtn.textContent !== '再摇一支') note(`按钮文案没有变成「再摇一支」，实际是「${drawBtn.textContent}」`);
if (capName.textContent === before) note('抽到的还是原来那一位（没换人）');
if (dName.textContent !== capName.textContent) note('右侧档案的名字和卡面不一致');

/* 「限定」角标要跟抽到的这一位对得上：限定的显示、不限定的藏着 */
const pool = JSON.parse(dataMatch[1]).pool;
const drawn = pool.find((item) => item.name === capName.textContent);
if (!drawn) {
	note(`卡面上的「${capName.textContent}」不在池子数据里`);
} else {
	if (capLimit.hidden === Boolean(drawn.limited)) {
		note(`「限定」角标与数据不符：${drawn.name} limited=${Boolean(drawn.limited)}，但角标 hidden=${capLimit.hidden}`);
	}
	if (dLimit.hidden !== capLimit.hidden) note('卡面与右侧档案的「限定」角标状态不一致');
}

/* ---------- 输出 ---------- */

console.log(`抽签页冒烟测试：${path.resolve(file)}`);
console.log(`  内联脚本 ${inline.length} 段；脚本引用的 id 共 ${wanted.size} 个`);
console.log(`  摇签后：按钮=「${drawBtn.textContent}」 disabled=${drawBtn.disabled} drawn=${pair._classes.has('drawn')} open=${card3d._classes.has('open')} slip=${slip._classes.has('show')}`);
console.log(`  卡面：${before} → ${capName.textContent}（限定角标 hidden=${capLimit.hidden}）`);
if (warnings.length) for (const w of warnings) console.log(`  · 参考：${w}`);
if (problems.length) {
	console.log(`\n✗ 有 ${problems.length} 处不对：`);
	for (const p of problems) console.log(`   · ${p}`);
	process.exit(1);
}
console.log('\n✓ 全部通过');

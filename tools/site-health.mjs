/**
 * 全站健康检查：死链、缺资源、内容缺口。
 *
 * 为什么需要它：站上有 160 个页面、173 张图池图、140 个内容条目，
 * 手工点不完。改完内容跑一遍，能立刻看出有没有链接指空、图片漏进产物、
 * 或者哪个角色少了该有的字段。
 *
 * 用法：
 *   node tools/site-health.mjs            # 只查产物（要先生成 dist）
 *   node tools/site-health.mjs --content  # 连带内容缺口一起报（角色字段、教材进度）
 *
 * 判定说明：站内路径要先做 **URL 解码**再比对 —— 中文文件名在 href 里是
 * percent-encoded 的，不解码会把好链接误报成死链（踩过）。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const WITH_CONTENT = process.argv.includes('--content');

if (!fs.existsSync(DIST)) {
	console.error('没有 dist —— 先 pnpm run build');
	process.exit(2);
}

/** 递归列出文件 */
function walk(dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		return entry.isDirectory() ? walk(full) : [full];
	});
}

const pages = walk(DIST).filter((f) => f.endsWith('.html'));
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

/** 站内引用 → dist 里的实际路径（先解码百分号转义） */
function resolveRef(href) {
	const clean = decodeURIComponent(href.split('#')[0].split('?')[0]);
	if (!clean || !clean.startsWith('/')) return null;
	return path.join(DIST, clean.replace(/^\//, '').replace(/\//g, path.sep));
}

function refExists(href) {
	const target = resolveRef(href);
	if (!target) return true;
	if (fs.existsSync(target) && fs.statSync(target).isFile()) return true;
	if (fs.existsSync(path.join(target, 'index.html'))) return true;
	return false;
}

/** 站内引用 → 那一页真正的 html 文件（目录则取 index.html） */
function targetFile(href) {
	const target = resolveRef(href);
	if (!target) return null;
	if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
	const indexed = path.join(target, 'index.html');
	return fs.existsSync(indexed) ? indexed : null;
}

/**
 * 这些路径不在 dist 里 —— 由 worker/index.mjs 在运行时接管（比如 /teapot 要返 418）。
 * 静态检查看不到它们，所以单独列出来，别当成死链。
 */
const WORKER_ROUTES = new Set(['/teapot', '/teapot/']);

// ---------------------------------------------------------------- 1) 死链
const deadLinks = new Map();
const missingAssets = new Map();
for (const page of pages) {
	const html = fs.readFileSync(page, 'utf8');
	for (const match of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
		const ref = match[1];
		if (ref.startsWith('//')) continue;
		if (WORKER_ROUTES.has(ref)) continue;
		if (refExists(ref)) continue;
		const bucket = /\.(?:webp|png|jpe?g|gif|svg|mp3|ogg|zip|ico)$/i.test(ref) ? missingAssets : deadLinks;
		if (!bucket.has(ref)) bucket.set(ref, []);
		bucket.get(ref).push(rel(page));
	}
}

// ------------------------------------------- 2) 页面结构：404 / 标题 / 锚点 / canonical
const structural = [];

/** dist/404.html 是 wrangler.jsonc 里 not_found_handling 的兜底页，缺了访客只会看到默认错误页 */
if (!fs.existsSync(path.join(DIST, '404.html'))) {
	structural.push('缺 dist/404.html —— wrangler.jsonc 的 not_found_handling 会退化成默认错误页');
}

/** 读一页并收齐它的 id（查锚点用）；同一页只读一次 */
const pageCache = new Map();
const readPage = (file) => {
	if (!pageCache.has(file)) {
		const html = fs.readFileSync(file, 'utf8');
		pageCache.set(file, {
			html,
			ids: new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])),
		});
	}
	return pageCache.get(file);
};

const pageUrl = (file) => '/' + rel(file).replace(/^dist\//, '').replace(/index\.html$/, '');
const seenTitles = new Map();

for (const page of pages) {
	// 404.html 是兜底页，地址与 canonical 都不是「一页」的概念，跳过
	if (rel(page).endsWith('404.html')) continue;

	const { html } = readPage(page);
	const url = pageUrl(page);
	const where = url.replace(/\/$/, '') || '/';

	const title = (html.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1]?.trim() ?? '';
	if (!seenTitles.has(title)) seenTitles.set(title, []);
	seenTitles.get(title).push(where);

	const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) ?? [])[1];
	// Astro 的静态兼容跳转应以目标页为 canonical，而不是旧地址。
	const redirect = html.match(/<meta http-equiv="refresh" content="\d+;url=(\/[^"\s]*)"/i)?.[1];
	const expected = redirect
		? new URL(redirect, 'https://water2h2o.com').href
		: `https://water2h2o.com${where === '/' ? '/' : `${where}/`}`;
	if (redirect && !refExists(redirect)) structural.push(`${where}: 跳转目标不存在 → ${redirect}`);
	if (!canonical) structural.push(`${where}: 没有 canonical`);
	else if (canonical !== expected) structural.push(`${where}: canonical 指向 ${canonical}，应为 ${expected}`);

	// 页内锚点：href="/x/#y" 里的 y 必须在目标页里真的存在（死链由上一段负责）
	for (const m of html.matchAll(/href="(\/[^"#]*)#([^"]+)"/g)) {
		const [, href, anchor] = m;
		const file = targetFile(href);
		if (!file) continue;
		if (!readPage(file).ids.has(anchor)) structural.push(`${where}: 锚点指空 → ${href}#${anchor}`);
	}
}

for (const [title, where] of seenTitles) {
	if (!title || where.length < 2) continue;
	structural.push(`标题重复：「${title}」→ ${where.join('、')}`);
}

// ---------------------------------------------------------------- 3) 内容缺口
let contentReport = '';
if (WITH_CONTENT) {
	const readFront = (file) => {
		const text = fs.readFileSync(file, 'utf8').slice(0, 6000);
		const match = text.match(/^---\n([\s\S]*?)\n---/);
		return match ? match[1] : '';
	};
	const field = (front, key) => {
		const match = front.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
		return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
	};
	const list = (front, key) => {
		const match = front.match(new RegExp(`^${key}:\\s*\\[(.*?)\\]`, 'ms'));
		return match ? match[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [];
	};
	const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : []);

	const gaps = [];
	const charactersDir = path.join(ROOT, 'src/content/characters');
	for (const file of files(charactersDir)) {
		const front = readFront(path.join(charactersDir, file));
		const name = field(front, 'name');
		if (!field(front, 'portrait')) gaps.push(`${name}：没有立绘`);
		if (!field(front, 'race')) gaps.push(`${name}：没写种族`);
		if (list(front, 'tags').length === 0) gaps.push(`${name}：没有标签`);
	}
	for (const coll of ['races', 'lore']) {
		const dir = path.join(ROOT, 'src/content', coll);
		for (const file of files(dir)) {
			const front = readFront(path.join(dir, file));
			if (!field(front, 'cover')) gaps.push(`${field(front, 'title') || field(front, 'name')}（${coll}）：没有配图`);
		}
		if (files(dir).length > 0) gaps.push(`（以上「${coll} 没有配图」是整类现象，共 ${files(dir).length} 条）`);
	}

	// 图池里有人名、站上却没档案
	const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/gallery-meta.json'), 'utf8'));
	const known = new Set();
	for (const coll of ['characters', 'draw']) {
		for (const file of files(path.join(ROOT, 'src/content', coll))) {
			known.add(field(readFront(path.join(ROOT, 'src/content', coll, file)), 'name'));
		}
	}
	const byCharacter = new Map();
	for (const item of Object.values(meta.items ?? meta)) {
		const key = item.character || '（未标注）';
		byCharacter.set(key, (byCharacter.get(key) ?? 0) + 1);
	}
	const strangers = [...byCharacter.entries()].filter(([name]) => !known.has(name) && name !== '（未标注）');
	const untagged = byCharacter.get('（未标注）') ?? 0;

	contentReport = [
		'',
		'=== 内容缺口 ===',
		...gaps.map((g) => `  · ${g}`),
		strangers.length > 0
			? `  · 图池里有人名、站上没档案：${strangers.map(([n, c]) => `${n}(${c})`).join('、')}`
			: '',
		untagged > 0 ? `  · 图池里完全没有角色标注：${untagged} 张` : '',
	]
		.filter(Boolean)
		.join('\n');
}

// ---------------------------------------------------------------- 输出
console.log(`=== 全站健康检查（${pages.length} 个页面）===`);

console.log('\n站内死链：');
if (deadLinks.size === 0) console.log('  ✓ 没有');
else for (const [ref, from] of deadLinks) console.log(`  ✗ ${ref}\n      出现在：${[...new Set(from)].slice(0, 3).join('、')}`);

console.log('\n页面引用但产物里没有的资源：');
if (missingAssets.size === 0) console.log('  ✓ 没有');
else for (const [ref, from] of missingAssets) console.log(`  ✗ ${ref}\n      被引用于：${[...new Set(from)].slice(0, 3).join('、')}`);

console.log('\n页面结构（404 / 标题 / 锚点 / canonical）：');
if (structural.length === 0) console.log('  ✓ 没有');
else for (const item of structural) console.log(`  ✗ ${item}`);

if (contentReport) console.log(contentReport);

const failed = deadLinks.size > 0 || missingAssets.size > 0 || structural.length > 0;
console.log(failed ? '\n✗ 有问题（见上）' : '\n✓ 链接、资源与页面结构都没有问题');
process.exit(failed ? 1 : 0);

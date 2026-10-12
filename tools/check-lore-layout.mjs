/**
 * 设定页与侧栏目录的产物自检。
 *
 * web_fetch 会把标签剥干净，看不出锚点、分组、条数这些结构，
 * 所以直接读 dist 里的 HTML 来验：
 *   1. 索引页的类目栏链接 ↔ 分节 id 一一对得上（锚点没写错）
 *   2. 每条设定都落在它自己那一类的分节里，标题上的条数与实际卡片数一致
 *   3. 侧栏「设定」目录按类目分了组，组头指向索引页锚点，组内条目数一致
 *   4. 全站再没有 /worldview/lore/factions/ 的链接（子页已撤）
 *
 * 注意：Astro 会给本站元素挂 `data-astro-cid-xxxx` 作用域属性，
 * 所以匹配标签时不能假定 class 后面紧跟 `>`。下面统一用 tag() 生成宽松模式。
 *
 * 用法：node tools/check-lore-layout.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const LORE = join(DIST, 'worldview', 'lore');
const problems = [];
const notes = [];

const read = (file) => readFileSync(file, 'utf8');
/** 宽松标签匹配：<tag … class="…" …>，属性顺序随便（Astro 的 scope 属性也在里面） */
const openTag = (tag, cls) => new RegExp(`<${tag}\\b[^>]*\\bclass="${cls}"[^>]*>`);

// ---------- 1 + 2：索引页 ----------
const indexHtml = read(join(LORE, 'index.html'));

const navCats = [...indexHtml.matchAll(/data-cat="([^"]+)"/g)].map((m) => m[1]);
const sections = [...indexHtml.matchAll(/<section[^>]*\bid="lore-([^"]+)"/g)].map((m) => m[1]);

if (navCats.length === 0) problems.push('索引页的类目栏里一个类目都没有');
if (navCats.length !== sections.length) {
	problems.push(`类目栏 ${navCats.length} 个、分节 ${sections.length} 个，对不上`);
}
for (const cat of navCats) {
	if (!sections.includes(cat)) problems.push(`类目栏有「${cat}」，但页面上没有对应的分节`);
}
for (const cat of sections) {
	if (!navCats.includes(cat)) problems.push(`页面上有「${cat}」分节，但类目栏里没有`);
}

/** 每个分节的起止位置，后面切片用 */
const at = (cat) => indexHtml.indexOf(`id="lore-${cat}"`);
const boundsOf = (cat) => {
	const start = at(cat);
	const next = sections
		.map(at)
		.filter((pos) => pos > start)
		.sort((a, b) => a - b)[0];
	return [start, next ?? indexHtml.length];
};

const cardCount = (slice) => (slice.match(/<article\b[^>]*\bclass="card"/g) ?? []).length;

const sectionItems = {};
for (const cat of sections) {
	const [start, end] = boundsOf(cat);
	const slice = indexHtml.slice(start, end);
	sectionItems[cat] = cardCount(slice);

	const badge = slice.match(/<span[^>]*\bclass="n"[^>]*>(\d+) 条<\/span>/);
	if (!badge) problems.push(`「${cat}」分节的标题上没有条数`);
	else if (Number(badge[1]) !== sectionItems[cat]) {
		problems.push(`「${cat}」标题写 ${badge[1]} 条，实际排出 ${sectionItems[cat]} 张卡`);
	}
	// 一句释义是这次优化新加的，缺了就是没渲染出来
	if (!openTag('p', 'note').test(slice)) problems.push(`「${cat}」缺一句释义`);
}

const total = Object.values(sectionItems).reduce((sum, n) => sum + n, 0);
notes.push(
	`索引页：${sections.length} 类 / ${total} 条 —— ${sections.map((c) => `${c}${sectionItems[c]}`).join('、')}`,
);

// 类目栏上的数字
for (const cat of navCats) {
	const link = indexHtml.match(
		new RegExp(`<a\\b[^>]*\\bdata-cat="${cat}"[^>]*>[\\s\\S]*?</a>`),
	);
	if (!link) {
		problems.push(`类目栏「${cat}」这一项没解析出来`);
		continue;
	}
	const badge = link[0].match(/<span[^>]*\bclass="n"[^>]*>(\d+)<\/span>/);
	if (!badge) problems.push(`类目栏「${cat}」旁边没有条数`);
	else if (Number(badge[1]) !== sectionItems[cat]) {
		problems.push(`类目栏「${cat}」写 ${badge[1]}，分节里是 ${sectionItems[cat]}`);
	}
}

// ---------- 3：侧栏目录 ----------
const detail = read(join(LORE, 'cataclysm', 'index.html'));
const subList = detail.match(new RegExp(`${openTag('ul', 'sub-list').source}([\\s\\S]*?)</ul>`));
if (!subList) problems.push('设定详情页的侧栏里没有展开的二级目录');
else {
	const body = subList[1];
	const groups = [...body.matchAll(/<li[^>]*\bclass="group"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => {
		const link = m[1].match(/<a\b[^>]*>([\s\S]*?)<\/a>/);
		const href = link?.[0].match(/href="([^"]+)"/)?.[1];
		const count = link?.[0].match(/<span[^>]*\bclass="count"[^>]*>(\d+)<\/span>/)?.[1];
		const label = link?.[1]
			.replace(/<span[^>]*\bclass="count"[^>]*>[\s\S]*?<\/span>/, '')
			.replace(/<[^>]+>/g, '')
			.trim();
		return { label, href, count: count === undefined ? NaN : Number(count) };
	});
	if (groups.length !== sections.length) {
		problems.push(`侧栏分了 ${groups.length} 组，索引页有 ${sections.length} 类`);
	}
	const nested = (body.match(/<li[^>]*\bclass="nested"/g) ?? []).length;
	if (nested !== total) problems.push(`侧栏组内共 ${nested} 条，索引页共 ${total} 条`);
	for (const group of groups) {
		if (!group.label) problems.push(`侧栏有个组头没解析出类目名`);
		else if (!sections.includes(group.label)) {
			problems.push(`侧栏组头「${group.label}」不是索引页里的类目`);
		}
		const want = `/worldview/lore/#lore-${group.label}`;
		if (group.href !== want) problems.push(`侧栏组头「${group.label}」指向 ${group.href}，应当是 ${want}`);
		if (!(group.count >= 0)) problems.push(`侧栏组头「${group.label}」没有条数`);
		else if (group.count !== sectionItems[group.label]) {
			problems.push(`侧栏「${group.label}」写 ${group.count} 条，索引页是 ${sectionItems[group.label]}`);
		}
	}
	notes.push(
		`侧栏：${groups.length} 组 / ${nested} 条 —— ${groups.map((g) => `${g.label}${g.count}`).join('、')}`,
	);
}

// ---------- 4：势力子页的残留 ----------
const walk = (dir) =>
	readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		return statSync(full).isDirectory() ? walk(full) : [full];
	});
const leftovers = walk(DIST).filter((file) => {
	if (!file.endsWith('.html')) return false;
	// 只看真的链接（href）；改动记录里提到旧地址是历史，不算残留
	return /href="[^"]*lore\/factions/.test(read(file));
});
if (leftovers.length > 0) {
	problems.push(
		`还有 ${leftovers.length} 个页面链到已撤掉的势力子页：${leftovers
			.map((f) => relative(DIST, f))
			.slice(0, 5)
			.join('、')}`,
	);
}
if (readdirSync(LORE).includes('factions')) {
	problems.push('dist 里还留着 /worldview/lore/factions/ 目录');
}

// ---------- 结果 ----------
for (const note of notes) console.log(`· ${note}`);
if (problems.length > 0) {
	console.error('\n✗ 有问题：');
	for (const problem of problems) console.error(`  - ${problem}`);
	process.exit(1);
}
console.log('\n✓ 设定页与侧栏目录自检通过');

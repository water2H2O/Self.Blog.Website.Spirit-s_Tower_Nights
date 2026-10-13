/**
 * 全站粗体体检：源文里写了几处 `**粗体**`，页面上就该渲染出几处 <strong>。
 *
 * 为什么需要它：闭合的 `**` 后面直接紧跟中文（或开口 `**` 前面是中文）时，
 * Sätteri 不把这段当粗体，而是把两个星号原样印在页面上 ——
 * 页面上看着是「**这里本该是粗体**」，作者在编辑器里却看不出任何异常。
 * 正文文字一个字都没错，所以逐字校验发现不了，只能这样数。
 *
 * 判定细则：
 *   - 单个 `*`（本站有些文件用它标随注）不算，只认连续两个及以上
 *   - 行内代码（`…`）与围栏代码块里的星号不算
 *   - 页面上剩下的成对星号 = 漏渲染的；单个数量的星号是随注，忽略
 *
 * 用法：node tools/check-bold.mjs
 *   先 `pnpm run build`，它读 dist 与 src/content 对照。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const CONTENT = 'src/content';

/** 集合目录 → dist 里的网址前缀 */
const COLLECTIONS = {
	blog: ['blog'],
	races: ['worldview', 'races'],
	characters: ['worldview', 'characters'],
	lore: ['worldview', 'lore'],
	stories: ['worldview', 'stories'],
	// 教材挂在故事下面：/worldview/stories/textbook/<章>/
	textbook: ['worldview', 'stories', 'textbook'],
	music: ['worldview', 'music'],
	eden: ['project', 'eden'],
	draw: ['draw', 'entry'],
};

const walk = (dir) =>
	readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		return statSync(full).isDirectory() ? walk(full) : [full];
	});

/** 去掉正文里的行内代码与围栏代码块（那里的星号不是强调语法） */
const stripCode = (body) =>
	body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

const problems = [];
const skipped = [];
const odd = [];
let pages = 0;
let bolds = 0;

for (const [collection, prefix] of Object.entries(COLLECTIONS)) {
	const base = join(CONTENT, collection);
	if (!existsSync(base)) continue;
	for (const file of walk(base)) {
		if (!file.endsWith('.md') && !file.endsWith('.mdx')) continue;
		const id = relative(base, file).replace(/\.mdx?$/, '');
		const htmlPath = join(DIST, ...prefix, id, 'index.html');
		if (!existsSync(htmlPath)) {
			skipped.push(`${collection}/${id}（没有产物页面，可能是 draft）`);
			continue;
		}

		const src = stripCode(readFileSync(file, 'utf8'));
		const html = readFileSync(htmlPath, 'utf8');
		pages += 1;

		const marks = (src.match(/\*\*/g) ?? []).length;
		const pairs = Math.floor(marks / 2);
		const strongs = (html.match(/<strong>/g) ?? []).length;
		bolds += pairs;

		// 星号落单（奇数个 `**`）：源文里多打了一个，页面上会原样印出两个星号。
		// 这跟「粗体没渲染出来」是两回事，分开报，也不让后面的配对算错。
		if (marks % 2 !== 0) {
			odd.push({
				source: relative(process.cwd(), file),
				page: `${collection}/${id}`,
				samples: (html.match(/[^<>]{0,26}\*{2,}[^*<>]{0,26}/g) ?? [])
					.map((s) => s.trim())
					.slice(0, 3),
			});
			continue;
		}

		// 页面上剩下的成对星号才算漏渲染：单个星号是有意写的随注
		const runs = html.match(/\*{2,}/g) ?? [];
		const literalPairs = runs.length - Math.max(0, pairs - strongs);
		if (pairs === strongs && literalPairs <= 0) continue;

		const samples = (html.match(/[^<>]{0,26}\*{2,}[^*<>]{0,26}/g) ?? [])
			.map((s) => s.trim())
			.slice(0, 4);
		problems.push({
			page: `${collection}/${id}`,
			source: relative(process.cwd(), file),
			写的: pairs,
			渲染出: strongs,
			残留: literalPairs,
			samples,
		});
	}
}

console.log(`· 扫了 ${pages} 个页面，源文里共 ${bolds} 处粗体`);
if (skipped.length > 0) console.log(`· 跳过 ${skipped.length} 个无产物的文件（draft）`);

// 落单的星号：报出来，但不当作粗体渲染失败
if (odd.length > 0) {
	console.log(`\n· ${odd.length} 个文件有落单的 \`**\`（源文里多打了一个，页面上会印出两个星号）：`);
	for (const o of odd) {
		console.log(`  ${o.source}（${o.page}）`);
		for (const s of o.samples) console.log(`    → ${s}`);
	}
	console.log('  这是正文里的笔误，删掉那两个星号即可 —— 要不要动由作者定。');
}

if (problems.length === 0) {
	console.log('\n✓ 全站粗体都渲染出来了');
	process.exit(0);
}

console.error(`\n✗ ${problems.length} 个页面的粗体没渲染出来：`);
for (const p of problems) {
	console.error(`\n  ${p.page}（${p.source}）`);
	console.error(`    源文 ${p.写的} 处 / 渲染出 ${p.渲染出} 处 / 页面上残留成对星号 ${p.残留} 处`);
	for (const s of p.samples) console.error(`    → ${s}`);
}
console.error(
	'\n改法：在开口 `**` 前面、或闭合 `**` 后面**补一个空格**（页面上不可见），' +
		'正文一个字都不用动。',
);
process.exit(1);

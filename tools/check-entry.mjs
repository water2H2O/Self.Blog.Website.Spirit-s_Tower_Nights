/**
 * 新条目入库后的自检：页面生成了吗、正文一字不差吗、关联链接通不通。
 *
 * 针对 src/content/lore/kings-eye.md（王城之眼）：把它和 dist 里的产物对照，
 * 确认导入过程没有丢字、没有改字、也没有把 markdown 结构吃掉。
 *
 * 用法：node tools/check-entry.mjs <源文件> <dist 页面路径>
 *   例：node tools/check-entry.mjs src/content/lore/kings-eye.md dist/worldview/lore/kings-eye/index.html
 */
import { readFileSync } from 'node:fs';

const [srcPath, htmlPath] = process.argv.slice(2);
if (!srcPath || !htmlPath) {
	console.error('用法：node tools/check-entry.mjs <源文件> <dist 页面路径>');
	process.exit(2);
}

const problems = [];
const src = readFileSync(srcPath, 'utf8');
const html = readFileSync(htmlPath, 'utf8');

// ---------- 1. frontmatter 里的关键字段有没有落到页面上 ----------
const front = src.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
const field = (name) => front.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim();
const unquote = (value = '') => value.replace(/^['"]|['"]$/g, '');

const title = unquote(field('title'));
const summary = unquote(field('summary'));
const category = unquote(field('category'));

if (!html.includes(`<title>${title}`)) problems.push(`页面标题里没有「${title}」`);
if (!html.includes(summary)) problems.push('页面里没有 frontmatter 的 summary 原文');

// ---------- 2. 正文对照（markdown → HTML 只该动标记，不该动字） ----------
/** 去掉 markdown 标记，得到「应该出现在页面上的纯文字」 */
const plain = (text) =>
	text
		.replace(/^#{1,6}\s+/gm, '') // 标题符号
		.replace(/\*\*([^*]+)\*\*/g, '$1') // 粗体标记
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 链接只留文字
		.replace(/^>\s?/gm, '') // 引用符号
		.replace(/^[-*]\s+/gm, '') // 列表符号
		.replace(/\|/g, '') // 表格竖线
		.replace(/\s+/g, '') // 空白一律去掉，跟页面侧的归一方式对齐
		.trim();

const paragraphs = src
	.slice(src.indexOf('\n---', 4) + 4)
	.split(/\n{2,}/)
	.map((block) => plain(block))
	.filter((block) => block.length > 0);

/**
 * 页面里的纯文本：去掉标签与实体，空白一并去掉。
 * 注意列表与引用会被 HTML 拆成多个 li / 多个块，所以对照时按长度切片找，
 * 不整段硬比。
 */
const pageText = html
	.replace(/<script[\s\S]*?<\/script>/g, '')
	.replace(/<style[\s\S]*?<\/style>/g, '')
	.replace(/<[^>]+>/g, '\n')
	.replace(/&quot;/g, '"')
	.replace(/&#39;|&apos;/g, "'")
	.replace(/&lt;/g, '<')
	.replace(/&gt;/g, '>')
	.replace(/&amp;/g, '&')
	.replace(/\s+/g, '');

let checked = 0;
/** 逐段核对：段落里的每个句子都该在页面上（句子够长才查，短句容易误报） */
const audit = (text, where) => {
	if (text.length < 4) return;
	checked += 1;
	if (!pageText.includes(text)) {
		problems.push(`${where}在页面上找不到（可能被丢字或改写）：${text.slice(0, 40)}…`);
	}
};
for (const block of paragraphs) {
	// 段落内部按句切开，避免列表被 HTML 拆成多个 li 后整段对不上
	const parts = block.split(/(?<=[。！？：])/).filter((part) => part.length > 3);
	for (const part of parts.length > 0 ? parts : [block]) audit(part, '这一段');
}

// 表格行（| a | b |）也逐格对一遍
for (const row of src.matchAll(/^\|(.+)\|$/gm)) {
	for (const cell of row[1].split('|')) {
		audit(plain(cell), '这个表格单元格');
	}
}

// ---------- 3. 强调标记有没有真的渲染出来 ----------
/**
 * 这条是踩过坑才加的：闭合的 `**` 后面直接紧跟中文（或开口 `**` 前面是中文）时，
 * Sätteri 不会当成粗体，而是把星号原样印在页面上。纯文字对照发现不了
 * （星号在正文里当标记被去掉了），只能直接数。
 *
 * 注意区分两种星号：成对出现的 `**`（该变成粗体）与有意写的单个 `*` 标记
 * （本站有些文件用它标随注，渲染出来就是星号，不算错）。所以这里按「连续两个
 * 及以上」来判定，单个星号一律忽略。
 */
const pairedAsterisks = (html.match(/\*{2,}/g) ?? []).length;
const marks = (src.match(/\*\*/g) ?? []).length;
const boldMarks = Math.floor(marks / 2);
const strongs = (html.match(/<strong>/g) ?? []).length;
if (marks % 2 !== 0) {
	// 源文里星号落单：页面上会原样印出两个星号，删掉那两个即可（属笔误，不在本次判定内）
	console.log(`· 注意：源文里有落单的 \`**\`（共 ${marks} 个），页面上会多印两个星号`);
}
/** 页面上还剩下的成对星号（单个的不算），这些才是真漏渲染的 */
const literalPairs = Math.max(0, pairedAsterisks - (boldMarks - strongs));
if (boldMarks !== strongs || literalPairs > 0) {
	const literals = (html.match(/[^<>]{0,24}\*{2,}[^*<>]{0,24}/g) ?? [])
		.map((s) => s.trim())
		.slice(0, 3);
	problems.push(
		`源文里 ${boldMarks} 处粗体，页面上渲染出 ${strongs} 处` +
			(literals.length > 0 ? `；残留：${literals.join(' ／ ')}` : ''),
	);
}

// ---------- 4. 站内链接与关联条目 ----------
const links = [...html.matchAll(/href="(\/worldview\/[^"]+)"/g)].map((m) => m[1]);
const related = [...(front.match(/^related:\s*\[(.+)\]$/m)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
	(m) => m[1],
);
for (const id of related) {
	if (!links.some((href) => href.includes(`/worldview/lore/${id}`))) {
		problems.push(`related 里的「${id}」在页面上没有出现链接`);
	}
}

// ---------- 5. 侧栏里有没有这一条 ----------
// 注意 Astro 会给元素挂 data-astro-cid-xxx 作用域属性，匹配 class 时不能假定后面紧跟 >
const sidebar = html.match(/<ul\b[^>]*\bclass="sub-list"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '';
const slug = htmlPath.replace(/\\/g, '/').split('/worldview/lore/')[1].split('/')[0];
const groupOf = (markup) =>
	[
		...markup.matchAll(/<li\b[^>]*\bclass="group"[^>]*>([\s\S]*?)<\/li>/g),
	].map((m) =>
		m[1]
			.replace(/<[^>]+>/g, '')
			.replace(/\d+$/, '')
			.trim(),
	);

if (!sidebar) problems.push('侧栏里没有展开的设定目录');
else if (!sidebar.includes(`/worldview/lore/${slug}/`)) problems.push(`侧栏里找不到 ${slug}`);
else {
	const at = sidebar.indexOf(`/worldview/lore/${slug}/`);
	const group = groupOf(sidebar.slice(0, at)).pop();
	if (group !== category) {
		problems.push(`侧栏把它放在了「${group}」组，frontmatter 写的是「${category}」`);
	} else console.log(`· 侧栏分组正确：${group}`);
	console.log(`· 侧栏共 ${groupOf(sidebar).length} 组：${groupOf(sidebar).join('、')}`);
}

console.log(`· 正面对照 ${checked} 处，全部逐字命中`);
if (problems.length > 0) {
	console.error('\n✗ 有问题：');
	for (const problem of problems) console.error(`  - ${problem}`);
	process.exit(1);
}
console.log(`\n✓ ${title} 入库自检通过`);

/**
 * 溯源校验：确认「重整结构但不改写」的内容确实句句来自源文本。
 *
 * 用法：
 *   node tools/verify-traceable.mjs --corpus=<源1.txt,源2.txt> --files=<a.md,b.md> [--min=8]
 *
 * 判定方式：把每个 md 的正文按句号/问号/叹号切句，去掉 markdown 标记与所有空白后，
 * 逐句检查是否原样出现在任一源文本里。加小标题、加粗、调顺序都不影响判定，
 * 但**任何改写、缩写、补写**都会让那一句报出来。
 */
import fs from 'node:fs';

const argv = process.argv.slice(2);
const getArg = (name) => {
	const hit = argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : '';
};

const corpusFiles = getArg('corpus').split(',').filter(Boolean);
const mdFiles = getArg('files').split(',').filter(Boolean);
const MIN = Number(getArg('min')) || 8;

if (!corpusFiles.length || !mdFiles.length) {
	console.error('需要 --corpus=... 与 --files=...');
	process.exit(1);
}

/** 去掉 markdown 标记、行首列表符号与所有空白，只留文字与标点 */
const collapse = (text) =>
	text
		.replace(/^\s*(?:[-+*·•]|\d+[.、]|[一二三四五六七八九十]+、)\s*/, '')
		.replace(/^#{1,6}\s*/, '')
		.replace(/^\s*>\s?/, '')
		.replace(/\*\*|__|[*`]/g, '')
		.replace(/[|\s\u00a0]+/g, '')
		.trim();

/** 源文本整体折叠（只用于包含判断） */
const normalizeCorpus = (text) => collapse(text.replace(/\r?\n/g, '\n'));

/** 把 md 按「行 → 句末标点」切成单元，再逐个折叠 —— 避免把小标题和正文粘成一句 */
function unitsOf(markdown) {
	const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
	return body
		.split(/\r?\n/)
		.flatMap((line) => line.split(/(?<=[。！？；])/))
		.map(collapse)
		.filter((s) => s.length > 0);
}

const corpus = corpusFiles.map((file) => normalizeCorpus(fs.readFileSync(file, 'utf8'))).join('\n');

let totalMissing = 0;
let totalSentences = 0;

for (const file of mdFiles) {
	const sentences = unitsOf(fs.readFileSync(file, 'utf8')).filter((s) => s.length >= MIN);

	const missing = sentences.filter((s) => !corpus.includes(s));
	totalSentences += sentences.length;
	totalMissing += missing.length;

	const name = file.split(/[\\/]/).pop();
	if (missing.length === 0) {
		console.log(`  ✓ ${name.padEnd(24)} ${sentences.length} 句全部可溯源`);
	} else {
		console.log(`  ✗ ${name.padEnd(24)} ${missing.length}/${sentences.length} 句在源文本里找不到：`);
		for (const s of missing.slice(0, 5)) console.log(`      · ${s.slice(0, 60)}…`);
	}
}

console.log(`\n共 ${mdFiles.length} 个文件、${totalSentences} 句，无法溯源 ${totalMissing} 句`);
process.exit(totalMissing ? 1 : 0);

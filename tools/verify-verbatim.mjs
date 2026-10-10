/**
 * 逐字校验：把导入的 markdown 正文和源文本对照，确认没有被改写、漏段或润色。
 *
 * 用法：
 *   node tools/verify-verbatim.mjs --map=<映射.json>
 *
 * 映射格式（数组）：
 *   [{ "md": "src/content/races/angel.md", "src": "D:/.../docs-text/races/xx.txt" }]
 *
 * 判定方式：把源文本按空行切段、去掉 markdown 标记与所有空白后，
 * 逐段检查是否原样出现在 md 正文里。任何改写都会让该段匹配失败。
 * 段落级“缺失”= 漏抄或改写；md 里多出来的内容只作提示（允许补充小标题）。
 */
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const mapArg = argv.find((a) => a.startsWith('--map='));
if (!mapArg) {
	console.error('需要 --map=<映射.json>');
	process.exit(1);
}

const mapping = JSON.parse(fs.readFileSync(mapArg.slice(6), 'utf8'));
const strip = (text) =>
	text
		.replace(/^#{1,6}\s*/gm, '')
		.replace(/^\|[\s|:-]+\|$/gm, '')
		.replace(/[|\s\u00a0]+/g, '')
		.trim();

let failures = 0;
let checked = 0;

for (const pair of mapping) {
	if (!fs.existsSync(pair.md)) {
		console.log(`\n✗ 缺少文件 ${pair.md}`);
		failures += 1;
		continue;
	}
	if (!fs.existsSync(pair.src)) {
		console.log(`\n✗ 缺少源文本 ${pair.src}`);
		failures += 1;
		continue;
	}

	const mdRaw = fs.readFileSync(pair.md, 'utf8');
	const body = mdRaw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
	const mdNorm = strip(body);

	const srcRaw = fs.readFileSync(pair.src, 'utf8');
	const paragraphs = srcRaw
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter((p) => p !== '');

	const missing = [];
	for (const para of paragraphs) {
		const need = strip(para);
		if (need.length < 2) continue; // 跳过纯符号行
		if (!mdNorm.includes(need)) missing.push(para.replace(/\s+/g, ' ').slice(0, 50));
	}

	checked += 1;
	const name = path.basename(pair.md);
	if (missing.length === 0) {
		console.log(`  ✓ ${name.padEnd(30)} ${paragraphs.length} 段全部逐字一致（正文 ${body.length} 字符）`);
	} else {
		failures += 1;
		console.log(`  ✗ ${name.padEnd(30)} ${missing.length}/${paragraphs.length} 段对不上：`);
		for (const item of missing.slice(0, 6)) console.log(`      · ${item}…`);
	}
}

console.log(`\n检查 ${checked} 个文件，${failures} 个有问题`);
process.exit(failures ? 1 : 0);

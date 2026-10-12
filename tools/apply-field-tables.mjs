/**
 * 把四个集合正文里「标签：值」连排的段落改写成 markdown 表格。
 *
 * 用法：
 *   node tools/apply-field-tables.mjs --dry     只看会改哪些文件
 *   node tools/apply-field-tables.mjs           实际写入
 *
 * 为什么改源文件而不是运行时改写：
 *   内容层的正文是延迟渲染的 —— 渲染时直接读磁盘上的 md 文件。
 *   试过在 loader 里改 store：改 body 到不了渲染结果，顺手改 digest 还会让
 *   整篇正文渲染成空白（渲染层读 entry.rendered.html，digest 一变就找不到
 *   对应的渲染模块）。所以最稳的做法是让源文件本身就是表格。
 *
 * 只动排版，不动文字：合并出来的行就是原来的标签和值。
 */

import fs from 'node:fs';
import path from 'node:path';
import { mergeFieldTables } from './field-tables.mjs';

const ROOT = process.cwd();
const DIRS = ['characters', 'races', 'lore', 'eden'];
const dry = process.argv.includes('--dry');

/** 拆出 frontmatter，只处理正文 */
function split(raw) {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { front: '', body: raw };
	return { front: raw.slice(0, match[0].length), body: raw.slice(match[0].length) };
}

/**
 * 校验：把表格语法剥掉之后，文字必须和原来完全一致。
 *
 * 剥掉的东西：表头占位行、`| --- |` 分隔行、竖线、空白，以及「标签：值」里
 * 那个起分隔作用的冒号（它变成了单元格边界）。除此之外一个字都不该变。
 */
function stripTableSyntax(text) {
	return text
		.split('\n')
		.filter((line) => !/^\s*\|[\s|:-]*\|\s*$/.test(line)) // 表头占位行与分隔行
		.join('\n')
		.replace(/[|：:]/g, '')
		.replace(/\s+/g, '');
}

let files = 0;
let changed = 0;

for (const dir of DIRS) {
	const base = path.join(ROOT, 'src', 'content', dir);
	if (!fs.existsSync(base)) continue;

	for (const name of fs.readdirSync(base).filter((f) => f.endsWith('.md'))) {
		const file = path.join(base, name);
		const raw = fs.readFileSync(file, 'utf8');
		const { front, body } = split(raw);
		const next = mergeFieldTables(body);
		files += 1;
		if (next === body) continue;

		const tables = (next.match(/\n\| --- \| --- \|/g) ?? []).length;

		// 文字必须一字不动
		const beforeText = stripTableSyntax(body);
		const afterText = stripTableSyntax(next);
		if (beforeText !== afterText) {
			console.error(`  ✗ ${dir}/${name} 文字对不上，已跳过（这不该发生，请检查）`);
			console.error(`      原 ${beforeText.length} 字符 / 新 ${afterText.length} 字符`);
			const at = [...beforeText].findIndex((ch, i) => ch !== afterText[i]);
			console.error(`      首个差异在第 ${at} 个字符：…${beforeText.slice(Math.max(0, at - 20), at + 20)}…`);
			process.exitCode = 1;
			continue;
		}

		console.log(`  ✓ ${dir}/${name}  ${tables} 张表，文字校验通过`);
		changed += 1;
		if (!dry) fs.writeFileSync(file, front + next, 'utf8');
	}
}

console.log(`\n共 ${files} 份档案，${changed} 份改成表格${dry ? '（dry-run，未写入）' : ''}`);

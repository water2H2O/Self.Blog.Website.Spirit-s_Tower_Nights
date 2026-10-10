/**
 * 按正文里的名字出现，把「故事 ↔ 角色」关联起来，写进故事的 characters 字段。
 *
 * 用法：node tools/link-story-characters.mjs [--dry-run]
 *
 * 注意两处歧义：
 *   - 铃月：正文里的「铃月镇 / 铃月村」是地名，必须排除，否则会把地点当成角色
 *   - 莉莉安娜·萨拉姆博：正文里一律简称「莉莉安娜」，用全名会漏掉一大半
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const dryRun = process.argv.includes('--dry-run');

/** 角色 id → 正文里的匹配词（第一个是显示用的主名） */
const MATCHERS = {
	miaomiao: ['淼渺', '水水'],
	salan: ['飒岚'],
	baicha: ['白茶'],
	yingqi: ['应祈'],
	'fengxi-lingyue': ['铃月'],
	'liliana-salambo': ['莉莉安娜'],
	viola: ['薇奥拉'],
	weilan: ['蔚蓝'],
	'ink-bai': ['墨白'],
	'aurelith-prismwing': ['Aurelith', '奥瑞利斯'],
};

/** 命中之后还要排除的写法（前面是名字，后面跟这些字就是别的词） */
const EXCLUDE_AFTER = {
	'fengxi-lingyue': ['镇', '村'],
};

function hits(body, name, excludes = []) {
	let idx = body.indexOf(name);
	while (idx !== -1) {
		const after = body.slice(idx + name.length, idx + name.length + 1);
		if (!excludes.includes(after)) return true;
		idx = body.indexOf(name, idx + 1);
	}
	return false;
}

const storyDir = path.join(ROOT, 'src/content/stories');
const files = fs.readdirSync(storyDir).filter((f) => f.endsWith('.md')).sort();

let touched = 0;
const report = [];

for (const file of files) {
	const full = path.join(storyDir, file);
	const text = fs.readFileSync(full, 'utf8');
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) continue;
	const front = match[1];
	const body = text.slice(match[0].length);

	const found = [];
	for (const [id, names] of Object.entries(MATCHERS)) {
		const hit = names.some((name) => hits(body, name, EXCLUDE_AFTER[id] ?? []));
		if (hit) found.push(id);
	}

	const current = front.match(/^characters:\s*(.*)$/m)?.[1] ?? '[]';
	const merged = new Set([...found, ...(current.match(/'([^']+)'/g) ?? []).map((s) => s.replace(/'/g, ''))]);
	const list = [...merged];
	const line = `characters: [${list.map((id) => `'${id}'`).join(', ')}]`;

	if (line === `characters: ${current}`) continue;

	touched += 1;
	report.push({ file: file.replace('.md', ''), before: current, after: list.join(', ') });

	if (!dryRun) {
		const next = /^characters:.*$/m.test(front)
			? front.replace(/^characters:.*$/m, line)
			: front.replace(/^(act:.*)$/m, `$1\n${line}`);
		fs.writeFileSync(full, text.replace(match[0], `---\n${next}\n---`), 'utf8');
	}
}

console.log(`${dryRun ? '（dry-run）' : ''}会更新 ${touched} 话\n`);
for (const r of report) {
	console.log(`  ${r.file.padEnd(26)} ${r.before.padEnd(14)} → ${r.after}`);
}

// 汇总每位角色出现在多少话
const tally = {};
for (const r of report) {
	for (const id of r.after.split(', ')) {
		if (id) tally[id] = (tally[id] ?? 0) + 1;
	}
}
console.log('\n每位角色的出场话数：');
console.log(
	Object.entries(tally)
		.sort((a, b) => b[1] - a[1])
		.map(([id, n]) => `${id} ${n}`)
		.join(' / '),
);

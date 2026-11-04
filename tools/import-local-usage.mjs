#!/usr/bin/env node
/**
 * 把「中转站没有导出之后」的本地记录补进 token-usage.json。
 *
 * 背景：2026-11-02 起像素星空（中转站）停止服务，拿不到它自己的用量导出；
 * 但 DSH 在本机留了逐次记录 `~/.dsh/.dshw-usage.json`（{ts, day, model, tokens, cost}）。
 * 这份记录和中转站导出口径不同，不能混进 daily/series，否则那条线就没法解释了：
 *
 *   · 次数是「回合」，不是 HTTP 请求数；
 *   · token 只覆盖一部分（实测 gpt-6.1-sol 约为导出值的 40%）；
 *   · cost 是本地估算，与实付接近但不相等（实测 0.86~0.93）。
 *
 * 所以单独写到 `localRelay` 字段，页面上按「本地记录（不完整）」单独展示，
 * 不参与合计、占比和图表。
 *
 * 用法：node tools/import-local-usage.mjs [--check]
 *   --check  只报告会写入什么，不改文件
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'token-usage.json');
const LOCAL = path.join(os.homedir(), '.dsh', '.dshw-usage.json');
const CHECK = process.argv.includes('--check');

const isRelay = (model) => !/^deepseek/i.test(model ?? '');
const fmt = (n) => (n >= 1e8 ? (n / 1e8).toFixed(2) + ' 亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + ' 万' : String(Math.round(n)));

const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));

/** 中转站导出覆盖到的日子：那天 parts 里还有「中转站 · …」。
 * 按「天」判断而不是只取最后一天 —— 中间断档（比如 11-02 缺导出、11-03 又有了）时，
 * 断档那天仍然需要本地记录补。 */
const coveredDays = new Set(
	(data.daily ?? [])
		.filter((day) => Object.entries(day.parts ?? {}).some(([label, v]) => label.startsWith('中转站') && v > 0))
		.map((day) => day.date),
);
const lastRelayDay = [...coveredDays].sort().at(-1);
if (!lastRelayDay) {
	console.log('数据里没有中转站记录，跳过');
	process.exit(0);
}

if (!fs.existsSync(LOCAL)) {
	console.log(`找不到本地记录：${LOCAL}`);
	process.exit(0);
}

const events = JSON.parse(fs.readFileSync(LOCAL, 'utf8')).events ?? [];
const agg = new Map();
for (const e of events) {
	if (!e.day || coveredDays.has(e.day)) continue;
	if (!isRelay(e.model)) continue;
	const key = `${e.day}|${e.model}`;
	const cur = agg.get(key) ?? { date: e.day, model: e.model, requests: 0, tokens: 0, cost: 0 };
	cur.requests += 1;
	cur.tokens += e.tokens ?? 0;
	cur.cost += e.cost ?? 0;
	agg.set(key, cur);
}

const days = [...agg.values()]
	.filter((row) => row.requests > 0)
	.map((row) => ({ ...row, cost: Number(row.cost.toFixed(2)) }))
	.sort((a, b) => a.date.localeCompare(b.date) || a.model.localeCompare(b.model));

if (days.length === 0) {
	if ('localRelay' in data) {
		delete data.localRelay;
		if (!CHECK) fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
		console.log('没有新的本地记录，已移除 localRelay');
	} else {
		console.log('没有新的本地记录');
	}
	process.exit(0);
}

const payload = {
	source: '本机 DSH 记录（~/.dsh/.dshw-usage.json）',
	note:
		'中转站停止导出后的补充记录。次数按「回合」计，token 只覆盖一部分（约为中转站导出值的 40%~90%），' +
		'cost 是本地估算；因此不参与上面的合计、占比与图表。',
	after: lastRelayDay,
	days,
};

console.log(`中转站导出止于 ${lastRelayDay}；本地记录补出 ${days.length} 条：`);
for (const row of days) {
	console.log(`  ${row.date}  ${row.model.padEnd(16)} ${String(row.requests).padStart(3)} 次 · ${fmt(row.tokens).padStart(8)} · ¥${row.cost.toFixed(2)}`);
}

if (CHECK) {
	console.log('\n--check：没有写文件');
	process.exit(0);
}
data.localRelay = payload;
fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
console.log('\n已写入 src/data/token-usage.json 的 localRelay');

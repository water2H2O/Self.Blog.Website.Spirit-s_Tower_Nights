/**
 * 从**本机 DSH 会话日志**里统计 token 用量，写成 src/data/token-usage.json。
 *
 * 为什么这么做：DeepSeek 平台侧的用量接口要登录态，静态站不能带着凭据去请求；
 * 而 DSH 的会话文件里本来就记着每次请求的 usage —— 于是改成「读本地日志 → 提交 JSON」，
 * 全程不需要 token、不需要 API key、不联网。
 *
 * 代价（要记住）：这里统计的是**这台机器上经 DSH 产生的用量**，
 * 不等于账号在平台上的全部用量（浏览器里直接调 API、别的客户端都算不到）。
 *
 * 用法：
 *   node tools/collect-local-usage.mjs                  # 扫描 ~/.dsh/sessions
 *   node tools/collect-local-usage.mjs --days=120       # 只留最近 N 天
 *   node tools/collect-local-usage.mjs --sessions=<目录> # 换一个会话目录
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, 'src', 'data', 'token-usage.json');

const argOf = (name, fallback) => {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3) : fallback;
};
const SESSIONS = argOf('sessions', path.join(os.homedir(), '.dsh', 'sessions'));
const DAYS = Number.parseInt(argOf('days', '90'), 10) || 90;

/** 会话文件是一串独立的 zstd 帧拼起来的，Node 的流式解压不认多帧，按魔数切开逐帧解 */
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
function readFrames(file) {
	let buf;
	try {
		buf = fs.readFileSync(file);
	} catch {
		return '';
	}
	const offsets = [];
	let idx = buf.indexOf(MAGIC);
	while (idx !== -1) {
		offsets.push(idx);
		idx = buf.indexOf(MAGIC, idx + 4);
	}
	let text = '';
	for (let i = 0; i < offsets.length; i += 1) {
		const start = offsets[i];
		const end = i + 1 < offsets.length ? offsets[i + 1] : buf.length;
		try {
			text += zlib.zstdDecompressSync(buf.subarray(start, end)).toString('utf8');
		} catch {
			/* 坏帧直接跳过：宁可少算一天，也不要整轮失败 */
		}
	}
	return text;
}

function findSessionFiles(dir) {
	const out = [];
	const walk = (d) => {
		let entries;
		try {
			entries = fs.readdirSync(d, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			const full = path.join(d, e.name);
			if (e.isDirectory()) walk(full);
			else if (e.name.endsWith('.jsonl.zstd')) out.push(full);
		}
	};
	walk(dir);
	return out;
}

/** 北京时间（UTC+8）的日期字符串 —— 和站上「今日」的口径一致 */
const dateOf = (ms) => {
	const d = new Date(ms + 8 * 3600 * 1000);
	return d.toISOString().slice(0, 10);
};

const files = findSessionFiles(SESSIONS);
if (files.length === 0) {
	console.error(`没找到会话文件：${SESSIONS}`);
	process.exit(2);
}

const byDate = new Map();
let records = 0;
let skipped = 0;
const cutoff = Date.now() - DAYS * 86400000;

for (const file of files) {
	const text = readFrames(file);
	if (!text) continue;
	for (const line of text.split('\n')) {
		if (!line.trim()) continue;
		let obj;
		try {
			obj = JSON.parse(line);
		} catch {
			continue;
		}
		// 只要 assistant/message 上的 data.usage；
		// data.stream[...].chunk.usage 是同一份数据的流式副本，重复计数会翻倍
		if (obj.type !== 'assistant/message') continue;
		const usage = obj.data?.usage;
		const time = obj.time;
		if (!usage || !time) continue;
		if (time < cutoff) {
			skipped += 1;
			continue;
		}
		// 口径：**全部烧掉的 token = 输入 + 输出 + 缓存命中**。
		// 缓存那头占了九成九，但作者要的是「看着热闹」，所以一起算进主数字；
		// cacheRead 仍然单独记一份，图上的「其中缓存」用它。
		const input = Number(usage.inputTokens ?? 0);
		const output = Number(usage.outputTokens ?? 0);
		const cacheRead = Number(usage.cacheReadTokens ?? 0);
		const fresh = input + output;
		const tokens = fresh + cacheRead;
		if (!Number.isFinite(tokens) || tokens <= 0) continue;
		const date = dateOf(time);
		const hour = new Date(time + 8 * 3600 * 1000).getUTCHours();
		const day = byDate.get(date) ?? {
			date,
			tokens: 0,
			input: 0,
			output: 0,
			cacheRead: 0,
			requests: 0,
			cost: 0,
			/** 按小时的 token 小计，用来算日内 OHLC（单次请求波动太大，直接用会全是针） */
			hours: new Map(),
		};
		day.tokens += tokens;
		day.input += input;
		day.output += output;
		day.cacheRead += cacheRead;
		day.requests += 1;
		day.hours.set(hour, (day.hours.get(hour) ?? 0) + tokens);
		byDate.set(date, day);
		records += 1;
	}
}

/** 把按小时的小计折成当天 OHLC：开 / 收取首末小时，高 / 低取最大与最小的小时 */
const daily = [...byDate.values()]
	.sort((a, b) => a.date.localeCompare(b.date))
	.map((day) => {
		const values = [...day.hours.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
		return {
			date: day.date,
			tokens: day.tokens,
			input: day.input,
			output: day.output,
			cacheRead: day.cacheRead,
			requests: day.requests,
			cost: day.cost,
			hours: values.length,
			open: values[0],
			close: values[values.length - 1],
			high: Math.max(...values),
			low: Math.min(...values),
		};
	});
const totals = daily.reduce(
	(acc, day) => {
		acc.tokens += day.tokens;
		acc.input += day.input;
		acc.output += day.output;
		acc.cacheRead += day.cacheRead;
		acc.requests += day.requests;
		return acc;
	},
	{ tokens: 0, input: 0, output: 0, cacheRead: 0, requests: 0 },
);

const payload = {
	fetchedAt: new Date().toISOString(),
	source: 'local:DshSessions',
	note: '本机 DSH 会话日志统计；tokens = 输入 + 输出 + 缓存命中（其中缓存单列在 cacheRead）',
	months: [...new Set(daily.map((d) => d.date.slice(0, 7)))],
	totals: {
		tokens: totals.tokens,
		input: totals.input,
		output: totals.output,
		cacheRead: totals.cacheRead,
		requests: totals.requests,
		cost: 0,
	},
	models: [],
	daily,
};

fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(
	`扫了 ${files.length} 个会话文件、${records} 条请求` +
		`（早于 ${DAYS} 天的 ${skipped} 条已跳过）\n` +
		`写到 ${path.relative(ROOT, OUT)}：${daily.length} 天 · ` +
		`${totals.tokens.toLocaleString('en-US')} tokens · ${totals.requests.toLocaleString('en-US')} 次请求`,
);
if (daily.length) {
	console.log(`区间：${daily[0].date} → ${daily.at(-1).date}`);
}

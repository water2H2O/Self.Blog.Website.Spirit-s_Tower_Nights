/**
 * 抓 DeepSeek 开放平台的用量，写成 src/data/token-usage.json，供首页画 K 线图。
 *
 * 两条路，选一条：
 *
 *   A. 读「页面上导出的压缩包」（**不需要 token，推荐**）
 *      登录 platform.deepseek.com/usage → 点「导出」并选好日期范围 → 下载到一个 zip
 *      node tools/fetch-token-usage.mjs --zip="C:\Users\你\Downloads\usage_data_xxx.zip"
 *      也支持已经解开的目录：--dir="...\解压后的目录"
 *
 *   B. 直接调接口（要登录态 userToken）
 *      浏览器控制台 localStorage.getItem("userToken") → 存进 tools/.deepseek-user-token
 *      或设环境变量 DEEPSEEK_USER_TOKEN，然后 node tools/fetch-token-usage.mjs --months=3
 *
 * 为什么要在本地跑：平台的用量接口是**登录态的私有接口**，公开 API 只有 /user/balance
 * （余额，不含用量）。静态站不能也不该带着登录凭据去请求，所以走「本地取 → 提交 JSON →
 * 构建时读」，和站上 src/data/github.json 是同一种做法。
 *
 * 安全：
 *   · token 只从上面两个地方读，**永远不写进仓库**（.deepseek-user-token 已 gitignore）
 *   · 导出的 CSV 里有明文 api_key —— 本脚本按**列名**取数（只读 time / model / type / amount / cost），
 *     不会打印、也不会写进产物
 *   · 产物 JSON 只有按天的 tokens / 请求数 / 花费
 *
 * 口径（和 tools/collect-local-usage.mjs 一致，两个来源才可比）：
 *   tokens = 输入（cache miss）+ 输出；缓存命中（cache hit）单列成 cacheRead，不进主数字。
 *
 * 关于两类导出文件的差异（都兼容）：
 *   · 页面按日期段导出的：列名含 start_time_iso / end_time_iso，**按小时**——能算出真的日内 OHLC
 *   · 早期月度导出的：列名含 utc_date，只有按天合计——OHLC 退化成平蜡烛
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, 'src', 'data', 'token-usage.json');
const TOKEN_FILE = path.join(ROOT, 'tools', '.deepseek-user-token');
const API = 'https://platform.deepseek.com/api/v0/usage/export';

const argOf = (name) => {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.slice(name.length + 3).replace(/^["']|["']$/g, '') : '';
};

/** 极简 CSV 行切分：处理双引号包裹与 "" 转义 */
function splitCsvLine(line) {
	const out = [];
	let cur = '';
	let quoted = false;
	for (let i = 0; i < line.length; i += 1) {
		const ch = line[i];
		if (quoted) {
			if (ch === '"' && line[i + 1] === '"') {
				cur += '"';
				i += 1;
			} else if (ch === '"') quoted = false;
			else cur += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ',') {
			out.push(cur);
			cur = '';
		} else cur += ch;
	}
	out.push(cur);
	return out;
}

/** 按**列名**解析：两种导出的列顺序不一样，用下标会读错 */
function parseCsv(text) {
	const lines = text.trim().split('\n').filter((l) => l.trim());
	if (lines.length < 2) return { header: [], rows: [] };
	const header = splitCsvLine(lines[0]).map((h) => h.trim().replace(/^\uFEFF/, ''));
	const rows = lines.slice(1).map((line) => {
		const cells = splitCsvLine(line);
		const row = {};
		header.forEach((name, index) => {
			row[name] = cells[index];
		});
		return row;
	});
	return { header, rows };
}

/** 时间桶：小时级导出取 start_time_iso 的日期与小时；月度导出只有 utc_date */
function bucketOf(row) {
	const iso = row.start_time_iso ?? row.utc_date ?? '';
	if (!iso) return null;
	const date = iso.slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const hour = row.start_time_iso
		? Number.parseInt(row.start_time_iso.slice(11, 13), 10)
		: null;
	return { date, hour: Number.isFinite(hour) ? hour : null };
}

const TYPE_MISS = 'input_cache_miss_tokens';
const TYPE_HIT = 'input_cache_hit_tokens';
const TYPE_OUT = 'output_tokens';
const TYPE_REQ = 'request_count';

const byDate = new Map();
const byModel = new Map();

function dayOf(date) {
	if (!byDate.has(date)) {
		byDate.set(date, {
			date,
			tokens: 0,
			input: 0,
			output: 0,
			cacheRead: 0,
			requests: 0,
			cost: 0,
			hours: new Map(),
		});
	}
	return byDate.get(date);
}

function ingestAmount(text) {
	for (const row of parseCsv(text).rows) {
		const bucket = bucketOf(row);
		if (!bucket) continue;
		const type = (row.type ?? '').trim();
		const amount = Number.parseInt(row.amount ?? '0', 10) || 0;
		const day = dayOf(bucket.date);
		let counted = 0;
		if (type === TYPE_REQ) {
			day.requests += amount;
		} else if (type === TYPE_MISS) {
			day.input += amount;
			day.tokens += amount;
			counted = amount;
		} else if (type === TYPE_OUT) {
			day.output += amount;
			day.tokens += amount;
			counted = amount;
		} else if (type === TYPE_HIT) {
			day.cacheRead += amount;
		} else {
			continue;
		}
		if (type !== TYPE_REQ && bucket.hour !== null) {
			day.hours.set(bucket.hour, (day.hours.get(bucket.hour) ?? 0) + counted);
		}
		if (counted > 0) {
			const model = (row.model ?? '未知').trim();
			byModel.set(model, (byModel.get(model) ?? 0) + counted);
		}
	}
}

function ingestCost(text) {
	for (const row of parseCsv(text).rows) {
		const bucket = bucketOf(row);
		if (!bucket) continue;
		dayOf(bucket.date).cost += Number.parseFloat(row.cost ?? '0') || 0;
	}
}

const CSV_RE = /^(amount|cost)-(.+)\.csv$/i;

function collectFrom(dir) {
	return fs
		.readdirSync(dir)
		.filter((f) => CSV_RE.test(f))
		.map((f) => ({
			kind: f.match(CSV_RE)[1].toLowerCase(),
			label: f.match(CSV_RE)[2],
			text: fs.readFileSync(path.join(dir, f), 'utf8'),
		}));
}

function collectFromZip(zipPath) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsu-'));
	try {
		execFileSync('tar', ['-xf', zipPath, '-C', dir], { stdio: 'ignore' });
		return collectFrom(dir);
	} catch (e) {
		throw new Error(`解压失败：${zipPath}\n  ${e.message}`);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

async function collectFromApi(token, months) {
	const now = new Date();
	const out = [];
	for (let back = months - 1; back >= 0; back -= 1) {
		const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
		const year = d.getUTCFullYear();
		const month = d.getUTCMonth() + 1;
		process.stdout.write(`  拉取 ${year}-${String(month).padStart(2, '0')} … `);
		const url = `${API}?month=${month}&year=${year}`;
		const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
		if (!res.ok) throw new Error(`${year}-${month} 导出失败：HTTP ${res.status}`);
		const buf = Buffer.from(await res.arrayBuffer());
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsu-'));
		const zip = path.join(dir, 'export.zip');
		fs.writeFileSync(zip, buf);
		try {
			execFileSync('tar', ['-xf', zip, '-C', dir], { stdio: 'ignore' });
			out.push(...collectFrom(dir));
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
		console.log('ok');
	}
	return out;
}

function readToken() {
	const env = process.env.DEEPSEEK_USER_TOKEN?.trim();
	if (env) return normalize(env);
	if (fs.existsSync(TOKEN_FILE)) return normalize(fs.readFileSync(TOKEN_FILE, 'utf8').trim());
	return '';
}

function normalize(raw) {
	if (!raw) return '';
	if (raw.startsWith('{')) {
		try {
			const parsed = JSON.parse(raw);
			return String(parsed.value ?? parsed.token ?? '');
		} catch {
			/* 不是 JSON 就当裸 token */
		}
	}
	return raw.replace(/^Bearer\s+/i, '');
}

function writeOut(labels, source) {
	// 有小时桶就按小时算 OHLC；只有按天合计时退化成平蜡烛
	const daily = [...byDate.values()]
		.sort((a, b) => a.date.localeCompare(b.date))
		.map((day) => {
			const values = [...day.hours.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
			const base = values.length ? values : [day.tokens];
			return {
				date: day.date,
				tokens: day.tokens,
				input: day.input,
				output: day.output,
				cacheRead: day.cacheRead,
				requests: day.requests,
				cost: Number(day.cost.toFixed(6)),
				hours: values.length,
				open: base[0],
				close: base[base.length - 1],
				high: Math.max(...base),
				low: Math.min(...base),
			};
		});

	const totals = daily.reduce(
		(acc, day) => {
			acc.tokens += day.tokens;
			acc.input += day.input;
			acc.output += day.output;
			acc.cacheRead += day.cacheRead;
			acc.requests += day.requests;
			acc.cost += day.cost;
			return acc;
		},
		{ tokens: 0, input: 0, output: 0, cacheRead: 0, requests: 0, cost: 0 },
	);

	const models = [...byModel.entries()]
		.map(([model, tokens]) => ({ model, tokens }))
		.sort((a, b) => b.tokens - a.tokens)
		.slice(0, 6);

	const payload = {
		fetchedAt: new Date().toISOString(),
		source,
		note: '平台用量导出；tokens = 输入(cache miss) + 输出，缓存命中单列',
		months: labels,
		totals: {
			tokens: totals.tokens,
			input: totals.input,
			output: totals.output,
			cacheRead: totals.cacheRead,
			requests: totals.requests,
			cost: Number(totals.cost.toFixed(4)),
		},
		models,
		daily,
	};

	fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
	console.log(
		`\n写好了：${path.relative(ROOT, OUT)}\n` +
			`  ${daily.length} 天（${daily[0]?.date ?? '—'} → ${daily.at(-1)?.date ?? '—'}）· ` +
			`${totals.tokens.toLocaleString('en-US')} tokens · ${totals.requests.toLocaleString('en-US')} 次请求 · ` +
			`¥${totals.cost.toFixed(2)}\n` +
			`  缓存命中 ${totals.cacheRead.toLocaleString('en-US')}（单列，不计入主数字）`,
	);
	if (daily.length < 14) {
		console.log(`\n⚠ 只有 ${daily.length} 天数据 —— 建议把导出范围改到最近一个月，K 线才有东西看。`);
	}
}

async function main() {
	const zipPath = argOf('zip');
	const dirPath = argOf('dir');

	let pairs;
	let labels;
	let source;

	if (zipPath || dirPath) {
		if (zipPath && !fs.existsSync(zipPath)) {
			console.error(`找不到文件：${zipPath}`);
			process.exit(2);
		}
		if (dirPath && !fs.existsSync(dirPath)) {
			console.error(`找不到目录：${dirPath}`);
			process.exit(2);
		}
		console.log(`读本地导出：${zipPath || dirPath}`);
		pairs = zipPath ? collectFromZip(zipPath) : collectFrom(dirPath);
		labels = [...new Set(pairs.map((p) => p.label))];
		source = 'platform.deepseek.com/usage（页面导出）';
	} else {
		const monthsArg = process.argv.find((a) => a.startsWith('--months='));
		const months = Math.max(1, Math.min(12, Number.parseInt(monthsArg?.split('=')[1] ?? '3', 10) || 3));
		const token = readToken();
		if (!token) {
			console.error(
				'缺少凭据。两条路选一条：\n' +
					'  A) 在 platform.deepseek.com/usage 点「导出」，然后 --zip=<下载到的 zip>（不需要 token）\n' +
					'  B) 把 userToken 存到 tools/.deepseek-user-token，或设 DEEPSEEK_USER_TOKEN，再 --months=3',
			);
			process.exit(2);
		}
		pairs = await collectFromApi(token, months);
		labels = [`最近 ${months} 个月`];
		source = 'platform.deepseek.com/api/v0/usage/export';
	}

	if (!pairs || pairs.length === 0) {
		console.error('包里没找到 amount-*.csv / cost-*.csv —— 确认导的是用量表，不是别的文件');
		process.exit(2);
	}

	for (const pair of pairs) {
		if (pair.kind === 'amount') ingestAmount(pair.text);
		else ingestCost(pair.text);
	}

	writeOut(labels, source);
}

await main();

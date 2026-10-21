/**
 * 抓 DeepSeek 开放平台的用量，写成 src/data/token-usage.json，供首页画 K 线图。
 *
 * 两条路，选一条：
 *
 *   A. 读「页面上导出的压缩包」（**不需要 token，推荐**）
 *      登录 platform.deepseek.com/usage → 点右上角「导出」→ 下载到一个 zip
 *      node tools/fetch-token-usage.mjs --zip="C:\Users\你\Downloads\usage.zip"
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
 *   · 导出的 CSV 第 5 列是明文 api_key —— 本脚本按下标取列，不会打印或保存它
 *   · 产物 JSON 只有按天的 tokens / 请求数 / 花费，没有任何 key
 *
 * 口径（和 tools/collect-local-usage.mjs 保持一致，两个来源的数字才可比）：
 *   tokens = 输入（cache miss）+ 输出；缓存命中（cache hit）单列成 cacheRead，不进主数字。
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

/** 从「浏览器里 localStorage 的结果」或裸 token 里取出真正的 bearer */
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
			/* 不是 JSON 就当成裸 token */
		}
	}
	return raw.replace(/^Bearer\s+/i, '');
}

/** 极简 CSV 行切分：处理双引号包裹与 "" 转义（够应付这两张表） */
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
			} else if (ch === '"') {
				quoted = false;
			} else {
				cur += ch;
			}
		} else if (ch === '"') {
			quoted = true;
		} else if (ch === ',') {
			out.push(cur);
			cur = '';
		} else {
			cur += ch;
		}
	}
	out.push(cur);
	return out;
}

const AMOUNT_TYPES = {
	MISS: 'input_cache_miss_tokens',
	HIT: 'input_cache_hit_tokens',
	OUT: 'output_tokens',
};

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
		});
	}
	return byDate.get(date);
}

/** amount.csv：user_id, utc_date, model, api_key_name, api_key(敏感), type, price, amount */
function parseAmount(text) {
	for (const line of text.trim().split('\n').slice(1)) {
		if (!line) continue;
		const p = splitCsvLine(line);
		const date = p[1];
		const model = p[2] ?? '未知';
		const type = p[5];
		const amount = Number.parseInt(p[7], 10) || 0;
		if (!date) continue;
		const day = dayOf(date);
		if (type === 'request_count') day.requests += amount;
		else if (type === AMOUNT_TYPES.MISS) {
			day.input += amount;
			day.tokens += amount;
		} else if (type === AMOUNT_TYPES.OUT) {
			day.output += amount;
			day.tokens += amount;
		} else if (type === AMOUNT_TYPES.HIT) {
			day.cacheRead += amount;
		} else {
			continue;
		}
		if (type !== 'request_count') {
			byModel.set(model, (byModel.get(model) ?? 0) + amount);
		}
	}
}

/** cost.csv：user_id, utc_date, model, wallet_type, cost, currency */
function parseCost(text) {
	for (const line of text.trim().split('\n').slice(1)) {
		if (!line) continue;
		const p = splitCsvLine(line);
		const date = p[1];
		const cost = Number.parseFloat(p[4]) || 0;
		if (!date) continue;
		dayOf(date).cost += cost;
	}
}

/** 解出 zip 里的两张表（用系统自带的 bsdtar，不引依赖） */
function readZip(zipPath) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsu-'));
	try {
		execFileSync('tar', ['-xf', zipPath, '-C', dir], { stdio: 'ignore' });
	} catch (e) {
		fs.rmSync(dir, { recursive: true, force: true });
		throw new Error(`解压失败：${zipPath}\n  ${e.message}`);
	}
	const files = fs.readdirSync(dir).filter((f) => f.endsWith('.csv'));
	const pairs = [];
	for (const file of files) {
		const m = file.match(/^(amount|cost)-(\d{4})-(\d{1,2})\.csv$/i);
		if (!m) continue;
		pairs.push({ kind: m[1].toLowerCase(), month: `${m[2]}-${String(Number(m[3])).padStart(2, '0')}`, text: fs.readFileSync(path.join(dir, file), 'utf8') });
	}
	fs.rmSync(dir, { recursive: true, force: true });
	return pairs;
}

/** 也接受已经解开的目录 */
function readDir(dirPath) {
	return fs
		.readdirSync(dirPath)
		.filter((f) => /^(amount|cost)-\d{4}-\d{1,2}\.csv$/i.test(f))
		.map((f) => {
			const m = f.match(/^(amount|cost)-(\d{4})-(\d{1,2})\.csv$/i);
			return {
				kind: m[1].toLowerCase(),
				month: `${m[2]}-${String(Number(m[3])).padStart(2, '0')}`,
				text: fs.readFileSync(path.join(dirPath, f), 'utf8'),
			};
		});
}

/** 某个月的导出包（走接口时用） */
async function fetchMonth(token, year, month) {
	const url = `${API}?month=${month}&year=${year}`;
	const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) throw new Error(`${year}-${month} 导出失败：HTTP ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsu-'));
	const zip = path.join(dir, 'export.zip');
	fs.writeFileSync(zip, buf);
	try {
		execFileSync('tar', ['-xf', zip, '-C', dir], { stdio: 'ignore' });
		const read = (name) => {
			const file = path.join(dir, name);
			return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
		};
		return {
			amount: read(`amount-${year}-${month}.csv`),
			cost: read(`cost-${year}-${month}.csv`),
		};
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

function writeOut(months, source) {
	// 月度 CSV 只有按天的合计，没有日内分布 —— OHLC 退化成「平蜡烛」（开=高=低=收）
	const daily = [...byDate.values()]
		.sort((a, b) => a.date.localeCompare(b.date))
		.map((day) => ({
			...day,
			open: day.tokens,
			close: day.tokens,
			high: day.tokens,
			low: day.tokens,
		}));

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
		note: '平台用量导出；tokens = 输入(cache miss) + 输出，不含缓存命中',
		months,
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
			`  ${daily.length} 天 · ${totals.tokens.toLocaleString('en-US')} tokens · ` +
			`${totals.requests.toLocaleString('en-US')} 次请求 · ¥${totals.cost.toFixed(2)}\n` +
			`  其中缓存命中 ${totals.cacheRead.toLocaleString('en-US')}（单列，不计入）`,
	);
}

async function main() {
	const zipPath = argOf('zip');
	const dirPath = argOf('dir');

	// A. 读本地导出包
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
		const pairs = zipPath ? readZip(zipPath) : readDir(dirPath);
		if (pairs.length === 0) {
			console.error('包里没找到 amount-*.csv / cost-*.csv —— 确认导的是用量表，不是别的文件');
			process.exit(2);
		}
		const months = [...new Set(pairs.map((p) => p.month))].sort();
		for (const pair of pairs) {
			if (pair.kind === 'amount') parseAmount(pair.text);
			else parseCost(pair.text);
		}
		writeOut(months, 'platform.deepseek.com/usage（页面导出）');
		return;
	}

	// B. 走接口
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

	const now = new Date();
	const fetched = [];
	for (let back = months - 1; back >= 0; back -= 1) {
		const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
		const year = d.getUTCFullYear();
		const month = d.getUTCMonth() + 1;
		process.stdout.write(`  拉取 ${year}-${String(month).padStart(2, '0')} … `);
		const { amount, cost } = await fetchMonth(token, year, month);
		parseAmount(amount);
		parseCost(cost);
		fetched.push(`${year}-${String(month).padStart(2, '0')}`);
		console.log('ok');
	}
	writeOut(fetched, 'platform.deepseek.com/api/v0/usage/export');
}

await main();

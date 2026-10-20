/**
 * 抓 DeepSeek 开放平台的用量，写成 src/data/token-usage.json，供首页画 K 线图。
 *
 * 为什么必须在本地跑：
 *   平台侧的用量接口（platform.deepseek.com/api/v0/usage/export）是**登录态的私有接口**，
 *   要浏览器里的 userToken；公开 API 只有 /user/balance（余额，不含用量）。
 *   静态站不能也不该带着登录凭据去请求，所以走「本地抓 → 提交 JSON → 构建时读」这条路，
 *   和站上 src/data/github.json 是同一种做法。
 *
 * 用法：
 *   1) 浏览器登录 https://platform.deepseek.com ，控制台执行：
 *        localStorage.getItem("userToken")
 *      把结果（形如 {"value":"xxx",...}）原样存到 tools/.deepseek-user-token，
 *      或者设环境变量 DEEPSEEK_USER_TOKEN。
 *   2) node tools/fetch-token-usage.mjs            # 默认抓最近 3 个月
 *      node tools/fetch-token-usage.mjs --months=6
 *
 * 安全：
 *   · token 只从上面两个地方读，**永远不写进仓库**（.deepseek-user-token 已 gitignore）
 *   · 导出的 CSV 里第 5 列是明文 api_key —— 本脚本按下标取列，不会打印或保存它
 *   · 产物 JSON 只有按天的 token / 请求数 / 花费，没有任何 key
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, 'src', 'data', 'token-usage.json');
const TOKEN_FILE = path.join(ROOT, 'tools', '.deepseek-user-token');
const API = 'https://platform.deepseek.com/api/v0/usage/export';

/** 从「浏览器里 localStorage 的结果」或裸 token 里取出真正的 bearer */
function readToken() {
	const env = process.env.DEEPSEEK_USER_TOKEN?.trim();
	if (env) return normalize(env);
	if (fs.existsSync(TOKEN_FILE)) return normalize(fs.readFileSync(TOKEN_FILE, 'utf8').trim());
	console.error('缺少凭据：请设 DEEPSEEK_USER_TOKEN，或把 token 存到 tools/.deepseek-user-token');
	process.exit(2);
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

const TOKEN_TYPES = new Set(['input_cache_hit_tokens', 'input_cache_miss_tokens', 'output_tokens']);

/** 下载某个月的导出包，解出两张 CSV 的文本 */
async function fetchMonth(token, year, month) {
	const url = `${API}?month=${month}&year=${year}`;
	const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) {
		throw new Error(`${year}-${month} 导出失败：HTTP ${res.status}`);
	}
	const buf = Buffer.from(await res.arrayBuffer());
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsu-'));
	const zip = path.join(dir, 'export.zip');
	fs.writeFileSync(zip, buf);
	// Windows 10+ 自带的 bsdtar 能直接解 zip；不引入额外依赖
	execFileSync('tar', ['-xf', zip, '-C', dir], { stdio: 'ignore' });
	const read = (name) => {
		const file = path.join(dir, name);
		return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
	};
	const result = {
		amount: read(`amount-${year}-${month}.csv`),
		cost: read(`cost-${year}-${month}.csv`),
	};
	fs.rmSync(dir, { recursive: true, force: true });
	return result;
}

/** amount.csv：user_id, utc_date, model, api_key_name, api_key(敏感), type, price, amount */
function parseAmount(text, byDate, byModel) {
	for (const line of text.trim().split('\n').slice(1)) {
		if (!line) continue;
		const p = splitCsvLine(line);
		const date = p[1];
		const model = p[2] ?? '未知';
		const type = p[5];
		const amount = Number.parseInt(p[7], 10) || 0;
		if (!date) continue;
		const day = byDate.get(date) ?? { date, tokens: 0, requests: 0, cost: 0 };
		if (type === 'request_count') day.requests += amount;
		else if (TOKEN_TYPES.has(type)) day.tokens += amount;
		byDate.set(date, day);
		if (TOKEN_TYPES.has(type)) {
			byModel.set(model, (byModel.get(model) ?? 0) + amount);
		}
	}
}

/** cost.csv：user_id, utc_date, model, wallet_type, cost, currency */
function parseCost(text, byDate) {
	for (const line of text.trim().split('\n').slice(1)) {
		if (!line) continue;
		const p = splitCsvLine(line);
		const date = p[1];
		const cost = Number.parseFloat(p[4]) || 0;
		if (!date) continue;
		const day = byDate.get(date) ?? { date, tokens: 0, requests: 0, cost: 0 };
		day.cost += cost;
		byDate.set(date, day);
	}
}

async function main() {
	const monthsArg = process.argv.find((a) => a.startsWith('--months='));
	const months = Math.max(1, Math.min(12, Number.parseInt(monthsArg?.split('=')[1] ?? '3', 10) || 3));
	const token = readToken();
	if (!token) {
		console.error('token 是空的，检查一下存的格式');
		process.exit(2);
	}

	const now = new Date();
	const byDate = new Map();
	const byModel = new Map();
	const fetched = [];

	for (let back = months - 1; back >= 0; back -= 1) {
		const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
		const year = d.getUTCFullYear();
		const month = d.getUTCMonth() + 1;
		process.stdout.write(`  拉取 ${year}-${String(month).padStart(2, '0')} … `);
		const { amount, cost } = await fetchMonth(token, year, month);
		parseAmount(amount, byDate, byModel);
		parseCost(cost, byDate);
		fetched.push(`${year}-${String(month).padStart(2, '0')}`);
		console.log('ok');
	}

	const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
	const totals = daily.reduce(
		(acc, day) => {
			acc.tokens += day.tokens;
			acc.requests += day.requests;
			acc.cost += day.cost;
			return acc;
		},
		{ tokens: 0, requests: 0, cost: 0 },
	);

	const models = [...byModel.entries()]
		.map(([model, tokens]) => ({ model, tokens }))
		.sort((a, b) => b.tokens - a.tokens)
		.slice(0, 6);

	const payload = {
		fetchedAt: new Date().toISOString(),
		source: 'platform.deepseek.com/api/v0/usage/export',
		months: fetched,
		totals: {
			tokens: totals.tokens,
			requests: totals.requests,
			cost: Number(totals.cost.toFixed(4)),
		},
		models,
		daily,
	};

	fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
	console.log(
		`\n写好了：${path.relative(ROOT, OUT)}\n` +
			`  ${daily.length} 天 · 合计 ${totals.tokens.toLocaleString('en-US')} tokens · ` +
			`${totals.requests.toLocaleString('en-US')} 次请求 · ¥${totals.cost.toFixed(2)}`,
	);
}

await main();

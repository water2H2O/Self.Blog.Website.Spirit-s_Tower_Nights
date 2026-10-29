#!/usr/bin/env node
/**
 * 一键刷新 token 数据。
 *
 * 平时每次更新都要手打一长串 `--zip=` / `--relay=`，还容易漏文件。这个脚本自己去导出目录
 * 把文件找齐、按「后覆盖前」的次序排好，再交给 fetch-token-usage.mjs 合并：
 *
 *   node tools/refresh-usage.mjs            只更新 src/data/token-usage.json，并打印变化
 *   node tools/refresh-usage.mjs --dry      只列出会用到哪些文件，不动数据
 *   node tools/refresh-usage.mjs --build    另外跑一次构建 + site-health
 *   node tools/refresh-usage.mjs --all      再往下：提交、拉取、推送，并等线上更新
 *   node tools/refresh-usage.mjs --dir=D:\某目录
 *
 * 排序规则（很重要）：
 *   · 平台导出 usage_data_<起>_<止>.zip —— 按「止」升序，同「止」按「起」升序。
 *     后一份按天覆盖前一份，所以覆盖范围最新、最全的那份排在最后。
 *   · 中转站导出 usage_<起>_to_<止>.csv —— 按「起」升序；重叠的行由脚本内部按时间戳去重。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'token-usage.json');
const FETCH = path.join(ROOT, 'tools', 'fetch-token-usage.mjs');
const HEALTH = path.join(ROOT, 'tools', 'site-health.mjs');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
	const hit = argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split('=').slice(1).join('=') : fallback;
};

const DIR = value('dir', path.join(os.homedir(), 'Downloads'));
const DRY = flag('dry');
const DO_BUILD = flag('build') || flag('all');
const DO_PUBLISH = flag('all');

/** 文件名里那两段日期；认不出就返回 null，这种文件直接跳过 */
/** 浏览器重复下载会加「 (1)」后缀，这里一并认掉 */
const ZIP_RE = /^usage_data_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})(?:\s*\(\d+\))?\.zip$/i;
const RELAY_RE = /^usage_(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})(?:\s*\(\d+\))?\.csv$/i;

function scan() {
	if (!fs.existsSync(DIR)) {
		console.error(`找不到导出目录：${DIR}\n用 --dir=<目录> 指定。`);
		process.exit(2);
	}
	const zips = [];
	const relays = [];
	const ignored = [];
	for (const name of fs.readdirSync(DIR)) {
		const full = path.join(DIR, name);
		if (!fs.statSync(full).isFile()) continue;
		let m = ZIP_RE.exec(name);
		if (m) {
			zips.push({ file: full, name, start: m[1], end: m[2], mtime: fs.statSync(full).mtimeMs });
			continue;
		}
		m = RELAY_RE.exec(name);
		if (m) {
			relays.push({ file: full, name, start: m[1], end: m[2], mtime: fs.statSync(full).mtimeMs });
			continue;
		}
		if (/^usage/i.test(name)) ignored.push(name);
	}
	zips.sort((a, b) => a.end.localeCompare(b.end) || a.start.localeCompare(b.start) || a.mtime - b.mtime);
	relays.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.mtime - b.mtime);
	return { zips, relays, ignored };
}

function run(cmd, args, opts = {}) {
	return execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
}

function node(args, opts = {}) {
	return run(process.execPath, args, opts);
}

function readJson() {
	try {
		return JSON.parse(fs.readFileSync(OUT, 'utf8'));
	} catch {
		return null;
	}
}

const fmt = (n) =>
	n >= 1e8 ? `${(n / 1e8).toFixed(2)} 亿` : n >= 1e4 ? `${(n / 1e4).toFixed(1)} 万` : String(n);

/** 站点上显示的是「最后一个有数据的月」的口径，这里用同一套算法，方便比对线上 */
function monthStats(data) {
	const days = (data?.daily ?? []).filter((d) => d.tokens > 0);
	if (days.length === 0) return null;
	const month = days.at(-1).date.slice(0, 7);
	const inMonth = days.filter((d) => d.date.startsWith(month));
	return {
		month,
		tokens: inMonth.reduce((a, d) => a + d.tokens, 0),
		cost: inMonth.reduce((a, d) => a + (d.cost ?? 0), 0),
	};
}

function describe(data) {
	if (!data) return '（还没有数据）';
	const s = monthStats(data);
	const span = data.daily?.length
		? `${data.daily[0].date} → ${data.daily.at(-1).date}`
		: '—';
	return `${data.daily?.length ?? 0} 天（${span}）· ${fmt(data.totals?.tokens ?? 0)} · ¥${(data.totals?.cost ?? 0).toFixed(2)}` +
		(s ? `\n    其中 ${s.month}：${fmt(s.tokens)} / ¥${s.cost.toFixed(2)}` : '');
}

function seriesDiff(before, after) {
	const map = new Map();
	for (const s of before?.series ?? []) map.set(s.label, { ...s });
	const rows = [];
	for (const s of after?.series ?? []) {
		const old = map.get(s.label);
		map.delete(s.label);
		const delta = s.tokens - (old?.tokens ?? 0);
		rows.push({ label: s.label, tokens: s.tokens, delta, cost: s.cost ?? 0, share: s.share ?? 0, isNew: !old });
	}
	for (const [label, s] of map) rows.push({ label, tokens: 0, delta: -s.tokens, cost: 0, share: 0, isNew: false });
	return rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** 等线上出现这个月的数字，最多 6 分钟 */
async function waitLive(expected) {
	if (!expected) return true;
	const want = `${fmt(expected.tokens)} tokens`;
	const url = 'https://water2h2o.com/';
	for (let i = 1; i <= 24; i++) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
			const text = await res.text();
			const hit = text.includes(want) && text.includes(`¥${expected.cost.toFixed(2)}`);
			console.log(`  第 ${i} 次：${hit ? '已更新' : '还是旧版'}（等 ${want}）`);
			if (hit) return true;
		} catch (err) {
			console.log(`  第 ${i} 次：请求失败 ${err?.message ?? err}`);
		}
		await new Promise((r) => setTimeout(r, 15000));
	}
	return false;
}

const { zips, relays, ignored } = scan();
if (ignored.length) console.log(`跳过不认识的文件：${ignored.join('、')}`);
if (zips.length === 0) {
	console.error(`在 ${DIR} 里没找到 usage_data_<起>_<止>.zip。`);
	process.exit(2);
}
console.log(`平台导出 ${zips.length} 份（按时间先后覆盖）：`);
for (const z of zips) console.log(`  ${z.start} → ${z.end}  ${z.name}`);
console.log(`中转站导出 ${relays.length} 份：`);
for (const r of relays) console.log(`  ${r.start} → ${r.end}  ${r.name}`);

if (DRY) {
	console.log('\n--dry：只列文件，没有改动任何数据。');
	process.exit(0);
}

const before = readJson();
console.log(`\n刷新前：${describe(before)}`);

/**
 * 先剔掉解不开的 zip：导出目录里常有几个月前导坏的文件（tar 直接报 "not a tar archive"），
 * 一个坏文件不该让整次刷新失败。解压失败的文件只警告，其余照常合并。
 *
 * Windows 上必须用系统自带的 bsdtar（C:\Windows\System32\tar.exe）：它能读 zip，
 * 而 PATH 上先命中的 GNU tar 会把 `C:/…` 当成「远程主机 C」，直接报 resolve 失败。
 */
const TAR = process.platform === 'win32' && fs.existsSync('C:/Windows/System32/tar.exe')
	? 'C:/Windows/System32/tar.exe'
	: 'tar';
const nativePath = (p) => (process.platform === 'win32' ? p.replace(/\//g, '\\') : p);

function usableZip(file) {
	try {
		execFileSync(TAR, ['-tf', nativePath(file)], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

const goodZips = [];
for (const z of zips) {
	if (usableZip(z.file)) goodZips.push(z);
	else console.warn(`  ⚠ 跳过打不开的压缩包：${z.name}（删掉或重新导一份就行）`);
}
if (goodZips.length === 0) {
	console.error('没有可用的平台导出，放弃刷新。');
	process.exit(2);
}

const args = [FETCH, ...goodZips.map((z) => `--zip=${z.file}`), ...relays.map((r) => `--relay=${r.file}`)];
node(args);

const after = readJson();
console.log(`\n刷新后：${describe(after)}`);
const rows = seriesDiff(before, after).filter((r) => r.delta !== 0);
if (rows.length) {
	console.log('\n各系列变化：');
	for (const r of rows) {
		const sign = r.delta > 0 ? '+' : '';
		console.log(
			`  ${r.label.padEnd(26)} ${fmt(r.tokens).padStart(9)}  ${sign}${fmt(r.delta).padStart(9)}` +
				`${r.isNew ? '  ← 新系列' : ''}`,
		);
	}
} else {
	console.log('\n数据没有变化（导出目录里没有更新的内容）。');
}

if (DO_BUILD) {
	console.log('\n构建：');
	run('cmd', ['/c', 'dev.cmd', 'build']);
	console.log('\n页面检查：');
	node([HEALTH]);
}

if (DO_PUBLISH) {
	const changed = execFileSync('git', ['status', '--porcelain', '--', 'src/data/token-usage.json'], {
		cwd: ROOT,
		encoding: 'utf8',
	}).trim();
	if (!changed) {
		console.log('\n数据没变，不需要提交。');
	} else {
		const s = monthStats(after);
		const msg =
			`chore: 刷新 token 数据（${after.daily[0].date} → ${after.daily.at(-1).date}）\n\n` +
			`- 一键脚本 tools/refresh-usage.mjs 合并 ${zips.length} 份平台导出 + ${relays.length} 份中转站导出\n` +
			`- 合计 ${after.daily.length} 天 · ${fmt(after.totals.tokens)} · ¥${after.totals.cost.toFixed(2)}` +
			(s ? `\n- ${s.month}：${fmt(s.tokens)} / ¥${s.cost.toFixed(2)}` : '');
		console.log('\n提交并推送：');
		run('git', ['add', 'src/data/token-usage.json']);
		run('git', ['commit', '-m', msg]);
		run('git', ['pull', '--rebase', '--quiet']);
		run('git', ['push', '--quiet']);
		const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
		console.log(`  已推送 ${head}，等线上更新…`);
		const ok = await waitLive(monthStats(after));
		if (!ok) {
			console.error('  等了 6 分钟线上还是旧数字，去 Cloudflare 看构建日志。');
			process.exit(1);
		}
	}
}

console.log('\n完成。');

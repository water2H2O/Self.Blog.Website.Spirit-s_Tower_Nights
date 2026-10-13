/**
 * 刷新「GitHub 动态」：抓数据 + 体检。抓完自己跑一次构建可加 --build。
 *
 * 定时更新交给 GitHub Actions（.github/workflows/refresh-github.yml，每天一次）；
 * 这一支是给本机用的 —— 想在本地立刻刷一次、或改完抓取逻辑验证一下时跑它。
 *
 * 用法：
 *   node tools/refresh-github.mjs            # 只抓数据（不构建）
 *   node tools/refresh-github.mjs --build    # 抓完再跑一次 pnpm build
 *
 * 抓完会把变化打印出来（热力图覆盖区间、总次数、仓库列表的增删改），
 * 这样不看 diff 也知道这次刷了什么。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'src/data/github.json');
const WANT_BUILD = process.argv.includes('--build');

/** 读上一次的数据，用来对比 */
const readOld = () => {
	try {
		return JSON.parse(fs.readFileSync(DATA, 'utf8'));
	} catch {
		return null;
	}
};

const old = readOld();
const oldRaw = old ? JSON.stringify(old) : '';

console.log('=== 1) 抓取 ===');
execFileSync(process.execPath, [path.join(ROOT, 'tools/fetch-github.mjs')], {
	stdio: 'inherit',
});

const now = JSON.parse(fs.readFileSync(DATA, 'utf8'));

console.log('\n=== 2) 变化 ===');
if (!old) {
	console.log('  之前没有缓存，这次是首次抓取。');
} else {
	const a = old.contributions ?? {};
	const b = now.contributions ?? {};
	console.log(`  热力图区间：${a.from} ~ ${a.to}  →  ${b.from} ~ ${b.to}`);
	console.log(`  总贡献次数：${a.total}  →  ${b.total}${b.total !== a.total ? `（${b.total - a.total >= 0 ? '+' : ''}${b.total - a.total}）` : '（没变）'}`);
	console.log(`  周数：${(a.weeks ?? []).length}  →  ${(b.weeks ?? []).length}`);
	// 哪几天新亮了：逐天比等级
	const flat = (c) => (c.weeks ?? []).join('');
	const oa = flat(a);
	const ob = flat(b);
	const cells = (s, from) =>
		[...s].map((level, i) => {
			const date = new Date(`${from}T00:00:00Z`);
			date.setUTCDate(date.getUTCDate() + i);
			return { date: date.toISOString().slice(0, 10), level };
		});
	const byDate = new Map(cells(ob, b.from).map((c) => [c.date, c.level]));
	const changed = cells(oa, a.from).filter((c) => byDate.has(c.date) && byDate.get(c.date) !== c.level);
	if (changed.length) {
		console.log('  等级变了的日期：');
		for (const c of changed) console.log(`    ${c.date}  ${c.level} → ${byDate.get(c.date)}`);
	} else {
		console.log('  等级变了的日期：无');
	}
	if (oa.length !== ob.length) console.log(`  （格子总数 ${oa.length} → ${ob.length}）`);

	const nameOf = (list) => new Set((list ?? []).map((r) => r.name));
	const before = nameOf(old.repos);
	const after = nameOf(now.repos);
	const added = [...after].filter((n) => !before.has(n));
	const removed = [...before].filter((n) => !after.has(n));
	if (added.length) console.log(`  新增仓库：${added.join('、')}`);
	if (removed.length) console.log(`  不再出现：${removed.join('、')}`);
	if (JSON.stringify(old) === oldRaw && oldRaw === JSON.stringify(now)) {
		console.log('  （缓存内容与上次完全一致）');
	}
}

console.log('\n=== 3) 体检 ===');
const c = now.contributions ?? {};
const weeks = Array.isArray(c.weeks) ? c.weeks : [];
const problems = [];
if (!/^\d{4}-\d{2}-\d{2}$/.test(c.from ?? '')) problems.push('from 不是日期');
if (!/^\d{4}-\d{2}-\d{2}$/.test(c.to ?? '')) problems.push('to 不是日期');
if (weeks.length < 50) problems.push(`周数只有 ${weeks.length}，像是没抓全`);
if (weeks.some((w) => !/^[0-4]{7}$/.test(w))) problems.push('有格子不是 7 位 0-4');
if (!Number.isFinite(c.total)) problems.push('total 不是数字');
if ((now.repos?.length ?? 0) === 0) problems.push('一个仓库都没抓到');
if (problems.length) {
	console.error('  ✗ ' + problems.join('；'));
	process.exitCode = 1;
} else {
	console.log(`  ✓ ${c.from} ~ ${c.to}，共 ${c.total} 次，${weeks.length} 周；仓库 ${now.repos.length} 个`);
}

if (WANT_BUILD) {
	console.log('\n=== 4) 构建 ===');
	execFileSync('pnpm', ['run', 'build'], { stdio: 'inherit', cwd: ROOT, shell: true });
} else if (process.exitCode !== 1) {
	console.log('\n想顺手构建一次：node tools/refresh-github.mjs --build');
}

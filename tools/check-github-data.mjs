/**
 * 体检 src/data/github.json：抓来的数据是否完整、格式是否对。
 *
 * 为什么单独一支：定时刷新（.github/workflows/refresh-github.yml）在提交前要过这一关 ——
 * 万一 GitHub 改了页面结构、抓取抓到半截，宁可让那次 Action 失败，
 * 也不要把残缺的热力图提交上去（提交了 Cloudflare 会直接部署）。
 *
 * 用法：node tools/check-github-data.mjs
 *   退出码 0 = 通过；1 = 有问题（问题清单打到 stderr）
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const FILE = path.join(process.cwd(), 'src/data/github.json');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 一年 53 周左右；少于这个数多半是没抓全 */
const MIN_WEEKS = 50;

let data;
try {
	data = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (error) {
	console.error(`读不出 ${path.relative(process.cwd(), FILE)}：${error.message}`);
	process.exit(1);
}

const contributions = data.contributions ?? {};
const weeks = Array.isArray(contributions.weeks) ? contributions.weeks : [];
const repos = Array.isArray(data.repos) ? data.repos : [];

const problems = [];
if (!DATE_RE.test(contributions.from ?? '')) problems.push('contributions.from 不是 YYYY-MM-DD');
if (!DATE_RE.test(contributions.to ?? '')) problems.push('contributions.to 不是 YYYY-MM-DD');
if (weeks.length < MIN_WEEKS) problems.push(`只有 ${weeks.length} 周（少于 ${MIN_WEEKS}，像是没抓全）`);
if (weeks.some((week) => !/^[0-4]{7}$/.test(week))) problems.push('有格子不是 7 位 0–4 的字符串');
if (weeks.length > 0 && weeks.every((week) => week === '0000000')) {
	problems.push('整张热力图全是 0，不像正常数据');
}
if (!Number.isFinite(contributions.total) || contributions.total < 0) {
	problems.push('contributions.total 不是非负数字');
}
if (!data.fetchedAt || Number.isNaN(Date.parse(data.fetchedAt))) problems.push('fetchedAt 不是时间');
if (repos.length === 0) problems.push('一个仓库都没抓到');
if (repos.some((repo) => !repo.name || !repo.url)) problems.push('有仓库缺少 name 或 url');

if (problems.length > 0) {
	console.error('✗ GitHub 数据体检未通过：');
	for (const problem of problems) console.error(`  · ${problem}`);
	process.exit(1);
}

const cells = weeks.join('').length;
console.log('✓ GitHub 数据体检通过');
console.log(
	`  ${contributions.from} ~ ${contributions.to}，共 ${contributions.total} 次，${weeks.length} 周 / ${cells} 格；仓库 ${repos.length} 个`,
);
console.log(`  抓取时间 ${data.fetchedAt}`);

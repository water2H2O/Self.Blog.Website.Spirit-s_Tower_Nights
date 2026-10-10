/**
 * 抓 GitHub 的公开数据，缓存进 src/data/github.json。
 *
 * 为什么缓存而不是构建时实时抓：
 *   构建不依赖网络，离线/接口抽风也能出站；想更新就跑一次这个脚本。
 *
 * 用法：node tools/fetch-github.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const USER = 'water2H2O';
const OUT = path.join(process.cwd(), 'src/data/github.json');
const API = 'https://api.github.com';

/** GitHub 要求带 UA，否则 403 */
const HEADERS = {
	Accept: 'application/vnd.github+json',
	'User-Agent': `${USER}-site-build`,
};

async function get(url) {
	const res = await fetch(url, { headers: HEADERS });
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} —— ${url}`);
	return res.json();
}

console.log(`抓取 ${USER} 的公开数据…`);
const user = await get(`${API}/users/${USER}`);
const repos = await get(`${API}/users/${USER}/repos?per_page=100&sort=pushed`);

const mine = repos
	.filter((repo) => !repo.fork)
	.map((repo) => ({
		name: repo.name,
		description: repo.description ?? '',
		language: repo.language ?? '',
		url: repo.html_url,
		stars: repo.stargazers_count,
		/** 最后一次推送（GitHub 的 pushed_at 是 UTC） */
		pushedAt: repo.pushed_at,
		createdAt: repo.created_at,
		/** 仓库体积（KB），用来粗略看出「这是个正经项目还是个玩具」 */
		sizeKb: repo.size,
		/** 没写过代码的空仓库 */
		empty: repo.size === 0,
	}))
	.sort((a, b) => new Date(b.pushedAt) - new Date(a.pushedAt));

const data = {
	fetchedAt: new Date().toISOString(),
	user: {
		login: user.login,
		name: user.name ?? '',
		url: user.html_url,
		avatar: user.avatar_url,
		publicRepos: user.public_repos,
		followers: user.followers,
		createdAt: user.created_at,
	},
	repos: mine,
};

fs.writeFileSync(OUT, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

console.log(`\n✓ 写入 ${path.relative(process.cwd(), OUT)}`);
console.log(`  账号：${data.user.login}，公开仓库 ${data.user.publicRepos} 个，关注者 ${data.user.followers}`);
console.log('\n  仓库（按最后推送排序）：');
for (const repo of mine) {
	console.log(
		`    ${repo.name.padEnd(58)} ${(repo.language || '—').padEnd(11)} ${repo.pushedAt.slice(0, 10)}  ${repo.sizeKb} KB${repo.empty ? '（空仓库）' : ''}`,
	);
}

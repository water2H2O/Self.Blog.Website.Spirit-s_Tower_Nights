/**
 * 构建收尾：把「不是内容集合条目」的页面补进 /search-index.json。
 *
 * search-index.json.ts 只遍历内容集合（设定、角色、故事……），首页、关于、token、
 * 各栏目列表页、企划页这些手写的 .astro 页面不在任何集合里，原来搜不到。
 * 这里在 astro:build:done 时扫一遍 dist 里的 HTML：凡是索引里还没有的页面，
 * 取 <title> / description / <main> 的正文，按同样的字段格式追加进去。
 *
 * 好处是以后新加的独立页面不用再登记，构建一次就自动进索引。
 * 已在集合里的条目保持原样（markdown 拍平的正文更干净），这里不会重复收录。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinyin } from 'pinyin-pro';

/** 不进索引：搜索页自己、404 */
const SKIP = new Set(['/search/', '/404/']);
/** 标题里的站名后缀，去掉后结果列表更干净 */
const TITLE_SUFFIX = /\s*·\s*(水水的小站|个人站点)\s*$/;
/** 正文上限：列表页会把所有条目名都带进来，截一下免得索引膨胀 */
const MAX_TEXT = 6000;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', middot: '·' };
function decode(text) {
	return text
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
		.replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function textOf(html) {
	return decode(
		html
			.replace(/<script[\s\S]*?<\/script>/gi, ' ')
			.replace(/<style[\s\S]*?<\/style>/gi, ' ')
			.replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
			.replace(/<template[\s\S]*?<\/template>/gi, ' ')
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<\/(p|li|h[1-6]|div|section|tr)>/gi, '\n')
			.replace(/<[^>]+>/g, ' '),
	)
		.replace(/[ \t\u00a0]+/g, ' ')
		// 「不 · 郑 重 申 明」这种字间加空格的排版：去掉汉字之间的空格，不然搜「郑重申明」对不上
		.replace(/(?<=[\u4e00-\u9fff]) (?=[\u4e00-\u9fff])/g, '')
		.replace(/\s*\n\s*/g, '\n')
		.replace(/\n{2,}/g, '\n')
		.trim();
}

const spell = (text, first) =>
	pinyin(text, { toneType: 'none', type: 'array', ...(first ? { pattern: 'first' } : {}) })
		.join('')
		.toLowerCase()
		.replace(/[^a-z]/g, '');

function pageUrls(dist) {
	const urls = [];
	(function walk(dir) {
		for (const name of fs.readdirSync(dir)) {
			if (name.startsWith('_') || name.startsWith('.')) continue;
			const full = path.join(dir, name);
			if (fs.statSync(full).isDirectory()) walk(full);
			else if (name === 'index.html') {
				const rel = path.relative(dist, dir).split(path.sep).join('/');
				urls.push(rel ? `/${rel}/` : '/');
			}
		}
	})(dist);
	return urls.sort();
}

export default function searchPages() {
	return {
		name: 'search-pages',
		hooks: {
			'astro:build:done': ({ dir, logger }) => {
				const dist = fileURLToPath(dir);
				const indexFile = path.join(dist, 'search-index.json');
				if (!fs.existsSync(indexFile)) {
					logger.warn('没找到 search-index.json，跳过页面补录');
					return;
				}
				const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
				const known = new Set(index.items.map((item) => item.url));
				let added = 0;

				for (const url of pageUrls(dist)) {
					if (known.has(url) || SKIP.has(url)) continue;
					const html = fs.readFileSync(path.join(dist, url, 'index.html'), 'utf8');
					// 跳转页（/about/friends/ 这类）只有一个 meta refresh，没有内容
					if (/<meta[^>]+http-equiv=["']?refresh/i.test(html)) continue;

					const rawTitle = decode((html.match(/<title>([^<]*)<\/title>/i) ?? [])[1] ?? '').trim();
					const h1 = textOf((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? [])[1] ?? '');
					const title = rawTitle.replace(TITLE_SUFFIX, '') || h1 || url;
					const summary = decode(
						(html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) ?? [])[1] ?? '',
					).trim();
					const main = (html.match(/<main[\s\S]*?<\/main>/i) ?? [''])[0];
					const text = textOf(main).slice(0, MAX_TEXT);
					const spoken = [title, h1].filter(Boolean).join(' ');

					index.items.push({
						title,
						summary,
						tags: [],
						category: '页面',
						url,
						text,
						py: spell(spoken, false),
						ini: spell(spoken, true),
					});
					added += 1;
				}

				index.count = index.items.length;
				fs.writeFileSync(indexFile, JSON.stringify(index));
				logger.info(`搜索索引补录 ${added} 个独立页面，共 ${index.count} 条`);
			},
		},
	};
}

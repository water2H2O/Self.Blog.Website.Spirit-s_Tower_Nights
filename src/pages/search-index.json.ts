/**
 * /search-index.json —— 构建时把全站条目拍平成一份可搜的 JSON。
 *
 * 做的是「子串检索」这条路（交接单里的 C1）：不装 Pagefind，中文直接按字面匹配，
 * 免得 CJK 分词把「晶脉」「瘴素」这种双字专名切碎。
 *
 * 体积：全部正文去掉 markdown 之后约 1.3 MB，gzip 后 400 KB 上下，
 * 只在 /search/ 页面首次输入时才请求，不进首页。
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { blogCodes } from '../lib/blog-code';

/** 一个集合对应一个栏目：分类名、路由前缀、正文取哪个字段当摘要 */
type Source = {
	collection: string;
	category: string;
	href: (id: string) => string;
};

/** markdown 拍成纯文本：给检索和摘要用，不需要保留结构 */
function plain(md: string): string {
	return md
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/:::[a-z-]+[^\n]*/gi, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/^#{1,6}\s*/gm, ' ')
		.replace(/^\s*[-*+]\s+/gm, ' ')
		.replace(/^\s*\d+\.\s+/gm, ' ')
		.replace(/[*_`>|]/g, ' ')
		.replace(/[ \t]+/g, ' ')
		.replace(/\s*\n\s*/g, '\n')
		.replace(/\n{2,}/g, '\n')
		.trim();
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

export const GET: APIRoute = async () => {
	const sources: Source[] = [
		{ collection: 'lore', category: '设定', href: (id) => `/worldview/lore/${id}/` },
		{ collection: 'races', category: '种族', href: (id) => `/worldview/races/${id}/` },
		{ collection: 'characters', category: '角色', href: (id) => `/worldview/characters/${id}/` },
		{ collection: 'stories', category: '故事', href: (id) => `/worldview/stories/${id}/` },
		{ collection: 'textbook', category: '教材', href: (id) => `/worldview/stories/textbook/${id}/` },
		{ collection: 'music', category: '回响', href: (id) => `/worldview/music/${id}/` },
		{ collection: 'eden', category: '伊甸园', href: (id) => `/project/eden/${id}/` },
		{ collection: 'draw', category: '画', href: (id) => `/draw/entry/${id}/` },
	];

	const blogEntries = (await getCollection('blog')).filter((entry) => !entry.data.draft);
	const codes = blogCodes(blogEntries.map((entry) => entry.id));
	sources.push({ collection: 'blog', category: '随笔', href: (id) => `/blog/${codes.get(id) ?? id}/` });

	type Item = { title: string; summary: string; tags: string[]; category: string; url: string; text: string };
	const items: Item[] = [];

	for (const source of sources) {
		// 集合名是运行时的，这里松一下类型；字段按各集合的 schema 取，缺了就当空
		const entries = (await getCollection(source.collection as never)) as unknown as {
			id: string;
			data: Record<string, unknown>;
			body?: string;
		}[];
		for (const entry of entries) {
			const data = entry.data ?? {};
			if (data.draft === true) continue; // 草稿不上站，也不该被搜到
			// 各集合的标题字段不统一：多数是 title，种族 / 角色 / 画 用的是 name
			const title = asText(data.title) || asText(data.name) || entry.id;
			const summary = asText(data.summary) || asText(data.description);
			const tags = Array.isArray(data.tags) ? (data.tags as unknown[]).map(String) : [];
			const text = plain(entry.body ?? '');
			items.push({
				title,
				summary,
				tags,
				category: source.category,
				url: source.href(entry.id),
				text,
			});
		}
	}

	items.sort((a, b) => a.category.localeCompare(b.category, 'zh') || a.title.localeCompare(b.title, 'zh'));

	return new Response(
		JSON.stringify({
			generatedAt: new Date().toISOString(),
			count: items.length,
			items,
		}),
		{ headers: { 'Content-Type': 'application/json; charset=utf-8' } },
	);
};

/**
 * 博客语义短地址：frontmatter 的 urlSlug 是唯一来源。
 * 用 1–2 个主题英文词（小写、连字符），2–24 个字符；发布后不随标题/文件名变动。
 * 缺失、非法、重名或占用历史跳转地址时直接阻止构建，不能静默回退成另一条 URL。
 */
import { blogRedirects } from '../../tools/blog-redirects.mjs';

export const BLOG_SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)?$/;
export const BLOG_SLUG_MIN = 2;
export const BLOG_SLUG_MAX = 24;

export function blogSlugs(posts: { id: string; data: { urlSlug: string } }[]): Map<string, string> {
	const used = new Set<string>();
	const out = new Map<string, string>();
	for (const post of posts) {
		const slug = post.data.urlSlug;
		if (typeof slug !== 'string' || slug.length < BLOG_SLUG_MIN || slug.length > BLOG_SLUG_MAX || !BLOG_SLUG_PATTERN.test(slug)) {
			throw new Error(`博客 ${post.id} 需要有效的 urlSlug：2–24 个字符，1–2 个小写英文/数字词，以字母开头，用连字符连接。`);
		}
		if (slug === 'index' || `/blog/${slug}/` in blogRedirects) {
			throw new Error(`博客 ${post.id} 的 urlSlug "${slug}" 占用了保留地址或旧跳转地址。`);
		}
		if (used.has(slug)) throw new Error(`博客 urlSlug 重复：${slug}`);
		used.add(slug);
		out.set(post.id, slug);
	}
	return out;
}

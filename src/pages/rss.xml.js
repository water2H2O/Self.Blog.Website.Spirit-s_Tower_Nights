import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { blogSlugs } from '../lib/blog-slug';

export async function GET(context) {
	const posts = await getCollection('blog');
	// 草稿不上站，也不该进 RSS：按 slug 计算时仍一并校验，避免隐藏稿掩盖重名。
	const slugs = blogSlugs(posts);
	const published = posts.filter((post) => !post.data.draft);
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: published.map((post) => ({
			...post.data,
			link: `/blog/${slugs.get(post.id) ?? post.id}/`,
		})),
	});
}

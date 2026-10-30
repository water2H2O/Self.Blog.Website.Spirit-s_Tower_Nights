import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { blogSlugs } from '../lib/blog-slug';

export async function GET(context) {
	const posts = await getCollection('blog');
	const slugs = blogSlugs(posts);
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: posts.map((post) => ({
			...post.data,
			link: `/blog/${slugs.get(post.id) ?? post.id}/`,
		})),
	});
}

import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { blogCodes } from '../lib/blog-code';

export async function GET(context) {
	const posts = await getCollection('blog');
	const codes = blogCodes(posts.map((post) => post.id));
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: posts.map((post) => ({
			...post.data,
			link: `/blog/${codes.get(post.id) ?? post.id}/`,
		})),
	});
}

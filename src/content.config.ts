import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** 主题色统一校验成 #rrggbb，写错会在构建时直接报错而不是悄悄失效 */
const themeColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, '需要 #rrggbb 形式的颜色，例如 #7c5cff');

/** 剧透分级：none 不提示 / mild 轻微 / heavy 重要 */
const spoilerLevel = z.enum(['none', 'mild', 'heavy']).default('none');

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			/** draft: true 的文章不会出现在列表里，也不会生成页面 */
			draft: z.boolean().default(false),
		}),
});

const characters = defineCollection({
	loader: glob({ base: './src/content/characters', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			/** 显示名，可以是「名 · 称号」 */
			name: z.string(),
			/** 别名/称呼，列表页与详情页都会展示 */
			aliases: z.array(z.string()).default([]),
			/** 一句话简介：列表卡片、SEO 描述都用它，建议 40 字以内 */
			summary: z.string(),
			role: z.string().optional(),
			affiliation: z.string().optional(),
			pronouns: z.string().optional(),
			age: z.string().optional(),
			themeColor: themeColor.default('#7c5cff'),
			/** 立绘/头像，放 src/assets 下即可自动优化；不填会显示名字首字 */
			portrait: z.optional(image()),
			tags: z.array(z.string()).default([]),
			/** 关联的设定条目，写文件名（不含 .md） */
			lore: z.array(reference('lore')).default([]),
			spoiler: spoilerLevel,
			draft: z.boolean().default(false),
			/** 越小越靠前 */
			order: z.number().default(100),
			updatedDate: z.coerce.date().optional(),
		}),
});

const lore = defineCollection({
	loader: glob({ base: './src/content/lore', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			summary: z.string(),
			category: z
				.enum(['地理', '种族', '体系', '组织', '历史', '器物', '概念'])
				.default('概念'),
			cover: z.optional(image()),
			themeColor: themeColor.default('#0ea5e9'),
			tags: z.array(z.string()).default([]),
			/** 关联角色，写文件名（不含 .md） */
			characters: z.array(reference('characters')).default([]),
			/** 关联的其他设定条目 */
			related: z.array(reference('lore')).default([]),
			spoiler: spoilerLevel,
			draft: z.boolean().default(false),
			order: z.number().default(100),
			updatedDate: z.coerce.date().optional(),
		}),
});

export const collections = { blog, characters, lore };

import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** 主题色统一校验成 #rrggbb */
const themeColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, '需要 #rrggbb 形式的颜色，例如 #AFFFFF');

/** 剧透分级：none 不提示 / mild 轻微 / heavy 重要 */
const spoilerLevel = z.enum(['none', 'mild', 'heavy']).default('none');

/**
 * 正典档位 —— 吃书防线。
 * locked：钉死的设定，写作时绝不能违背（世界观正文里的世界规则、大灾变真相、
 *         瘴素、魔法分级、精灵线真相、各种族灾后状态）
 * open  ：可以继续扩展、细化的部分
 * draft ：还没定，随时会改
 */
const canonLevel = z.enum(['locked', 'open', 'draft']).default('open');

const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			/** draft: true 的文章不会出现在列表里，也不会生成页面 */
			draft: z.boolean().default(false),
		}),
});

/** 种族：创作流程的第一步，也是世界观冲突的源头 */
const races = defineCollection({
	loader: glob({ base: './src/content/races', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			name: z.string(),
			/** 称号，写作 [旧时代的遗民] 这种方括号里的部分 */
			epithet: z.string().optional(),
			aliases: z.array(z.string()).default([]),
			summary: z.string(),
			themeColor: themeColor.default('#AFFFFF'),
			cover: z.optional(image()),
			/** 灾变后对瘴素的耐受性 */
			miasmaTolerance: z.string().optional(),
			/** 人口与分布 */
			population: z.string().optional(),
			habitat: z.string().optional(),
			/** 核心矛盾，种族档案里天然就有这一节 */
			conflicts: z.array(z.string()).default([]),
			tags: z.array(z.string()).default([]),
			canon: canonLevel,
			spoiler: spoilerLevel,
			draft: z.boolean().default(false),
			order: z.number().default(100),
			updatedDate: z.coerce.date().optional(),
		}),
});

/** 角色档案。种族是必填引用 —— 呼应用户“先定种族”的创作流程 */
const characters = defineCollection({
	loader: glob({ base: './src/content/characters', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			name: z.string(),
			race: reference('races'),
			aliases: z.array(z.string()).default([]),
			/** 称号 / 他称 */
			title: z.string().optional(),
			summary: z.string(),
			pronouns: z.string().optional(),
			height: z.string().optional(),
			age: z.string().optional(),
			/** 代表色，默认就是淼渺的 #AFFFFF */
			themeColor: themeColor.default('#AFFFFF'),
			portrait: z.optional(image()),
			tags: z.array(z.string()).default([]),
			/** 人际关系：指向其他角色 */
			relations: z
				.array(z.object({ to: reference('characters'), note: z.string() }))
				.default([]),
			lore: z.array(reference('lore')).default([]),
			canon: canonLevel,
			spoiler: spoilerLevel,
			draft: z.boolean().default(false),
			order: z.number().default(100),
			updatedDate: z.coerce.date().optional(),
		}),
});

/** 设定条目：世界规则、瘴素、神器、魔法分级、势力…… */
const lore = defineCollection({
	loader: glob({ base: './src/content/lore', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			summary: z.string(),
			category: z
				.enum(['世界规则', '瘴素', '神器', '魔法体系', '势力', '地理', '历史', '概念'])
				.default('概念'),
			cover: z.optional(image()),
			themeColor: themeColor.default('#6FE3EC'),
			tags: z.array(z.string()).default([]),
			characters: z.array(reference('characters')).default([]),
			races: z.array(reference('races')).default([]),
			related: z.array(reference('lore')).default([]),
			canon: canonLevel,
			spoiler: spoilerLevel,
			draft: z.boolean().default(false),
			order: z.number().default(100),
			updatedDate: z.coerce.date().optional(),
		}),
});

/** 故事：幕 → 篇 → 话 */
const stories = defineCollection({
	loader: glob({ base: './src/content/stories', pattern: '**/*.{md,mdx}' }),
	schema: () =>
		z.object({
			title: z.string(),
			/** 所属幕，例如 第一幕：囚笼与飞翔 */
			act: z.string(),
			/** 所属篇，例如 囚鸟篇 */
			arc: z.string(),
			/** 话号，例如 2-3 / 2-ed / sp-1，同时决定篇内排序 */
			code: z.string(),
			summary: z.string().optional(),
			characters: z.array(reference('characters')).default([]),
			races: z.array(reference('races')).default([]),
			/** 幕后故事：废稿、群友创作等，不上正文列表 */
			status: z.enum(['published', 'draft']).default('published'),
			spoiler: spoilerLevel,
			order: z.number().default(100),
			pubDate: z.coerce.date().optional(),
			updatedDate: z.coerce.date().optional(),
		}),
});

/** 画廊：一张图一条记录（批量导入由 tools/import-art.mjs 生成） */
const gallery = defineCollection({
	loader: glob({ base: './src/content/gallery', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			image: image(),
			kind: z
				.enum(['立绘', '插画', '曲绘', '头像', '设计稿', '表情包', '周边'])
				.default('插画'),
			characters: z.array(reference('characters')).default([]),
			/** 合作画师（非本人作品时必填） */
			artist: z.string().optional(),
			tags: z.array(z.string()).default([]),
			note: z.string().optional(),
			/** 周边类：下载地址（例如鼠标指针主题包） */
			download: z.string().optional(),
			themeColor: themeColor.default('#AFFFFF'),
			spoiler: spoilerLevel,
			draft: z.boolean().default(false),
			order: z.number().default(100),
			updatedDate: z.coerce.date().optional(),
		}),
});

/** 音乐：与曲师合作的原创曲。音频待做成 ogg + m4a 双格式后再填 */
const music = defineCollection({
	loader: glob({ base: './src/content/music', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			/** 企划编号，例如 4 */
			number: z.number(),
			/** 曲师 */
			artist: z.string(),
			/** 曲师的主页 / 社交账号；填写后曲师名会变成链接 */
			artistUrl: z.string().url().optional(),
			/** 曲绘画师 */
			illustrator: z.string().optional(),
			/** 画师主页（可选） */
			illustratorUrl: z.string().url().optional(),
			/** 视频 / 动态制作署名（部分曲目另有专人） */
			videoCredit: z.string().optional(),
			cover: z.optional(image()),
			/** 站内音频（MP3，全平台通用，含 Safari/iOS）。以 / 开头即指向 public/ 下的文件 */
			audio: z.string().optional(),
			/** 可选备用格式（例如体积约小 30% 的 ogg/opus），会作为第二个 source 输出 */
			audioAlt: z.string().optional(),
			/** 备用格式的 MIME，例如 audio/ogg */
			audioAltType: z.string().optional(),
			/** PV 外链（B 站等），视频本体不进仓库 */
			pvUrl: z.string().url().optional(),
			duration: z.string().optional(),
			characters: z.array(reference('characters')).default([]),
			races: z.array(reference('races')).default([]),
			note: z.string().optional(),
			themeColor: themeColor.default('#AFFFFF'),
			draft: z.boolean().default(false),
			order: z.number().default(100),
		}),
});

export const collections = { blog, races, characters, lore, stories, gallery, music };

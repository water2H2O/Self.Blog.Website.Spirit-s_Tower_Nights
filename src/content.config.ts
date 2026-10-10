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
			/** 种族引用。档案里没写明种族（或不属于 13 支主要种族）时留空 */
			race: reference('races').optional(),
			/** 归属：原创（本家）还是联动（别人家的 OC） */
			ownership: z.enum(['原创', '联动']).default('原创'),
			/** 联动角色的设主 */
			owner: z.string().optional(),
			/** 设主的主页 / 社交账号（填了以后设主名可点击） */
			ownerUrl: z.string().url().optional(),
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
			/**
			 * 作者。主线正文都是作者本人写的，所以默认「水水」；
			 * 别传里 x / y 是浅羽写的，x-3 是合作，支线前两章是墨白写的。
			 */
			author: z.string().default('水水'),
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

/** 音乐：与曲师合作的原创曲。音频为 MP3（全平台通用），另有可选 audioAlt */
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

/**
 * 企划（附属目录）：我参与的其他世界观。
 * 「伊甸园」是一个群创末日世界观，这里只收我写的那些稿件。
 * 内容以该企划的 wiki 为准，这里相当于自己的存档。
 */
const eden = defineCollection({
	loader: glob({ base: './src/content/eden', pattern: '**/*.{md,mdx}' }),
	schema: () =>
		z.object({
			title: z.string(),
			category: z.enum(['基础', '现象', '矿物', '物种', '个体', '阵营', '其他']).default('其他'),
			summary: z.string().optional(),
			/** 原稿文件名，方便和归档对照 */
			source: z.string().optional(),
			/** 撰稿人；企划公开的基础设定统一写「企划资料」 */
			by: z.string().default('water2H2O'),
			/**
			 * 正文的展示方式：
			 *   prose    —— 普通排版（默认）
			 *   levels   —— 按「危险等级阶梯」排版（见 src/lib/eden.ts）
			 *   creature —— 按「生物档案」排版：危险等级徽章 + 字段行 + 小节
			 */
			display: z.enum(['prose', 'levels', 'creature']).default('prose'),
			/** 危险等级，原文写法照录（7级 / III级 / 0）；页面按它配色 */
			danger: z.string().optional(),
			draft: z.boolean().default(false),
			order: z.number().default(100),
		}),
});

export const collections = { blog, races, characters, lore, stories, music, eden };

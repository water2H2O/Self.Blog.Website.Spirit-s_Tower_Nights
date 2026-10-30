import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * 角色 / 种族 / 设定 / 伊甸园四个集合的正文里常有「姓名：…／种族：…」这种
 * 连排字段，tools/apply-field-tables.mjs 会把它们写成 markdown 表格。
 * 这里不做运行时改写：内容层的正文是延迟渲染的（渲染时直接读磁盘上的 md），
 * 在 loader 里改 store 到不了渲染结果，改 digest 还会让整篇正文渲染成空白。
 */

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
			/** 1–2 个主题词构成的稳定语义地址，与文件名/标题解耦。 */
			urlSlug: z.string().min(2).max(24).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)?$/),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			/** draft: true 的文章不会出现在列表里，也不会生成页面 */
			draft: z.boolean().default(false),
		}),
});

/** 可下载的数字资源（例如角色专属的鼠标指针包） */
const characterResource = z.object({
	/** 资源名，例如「鼠标指针套装」 */
	label: z.string(),
	/** 下载链接（放在 public/downloads 下的文件，或以 / 开头的站内路径） */
	href: z.string(),
	/** 一句话说明 */
	note: z.string().default(''),
	/** 文件体积，例如「353 KB」 */
	size: z.string().default(''),
	/** 预览图（放在 public 下的路径） */
	preview: z.string().default(''),
});

/**
 * 跨企划指路：同一个角色在别的企划里也有一份档案时，两边互相指一下。
 * 例：《水塔夜谈》的蔚蓝移植自「伊甸园」的同名条目。
 */
const crossLink = z.object({
	/** 对方的标题，例如「伊甸园 · 晶体生物：“蔚蓝”」 */
	label: z.string(),
	/** 站内路径 */
	href: z.string(),
	/** 说明这层关系与以哪份为准 */
	note: z.string().default(''),
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
			/**
			 * 设定图：带部件标注、色板的那种设定稿。
			 * 和 portrait 分开存 —— 立绘做封面与列表缩略图，设定图排在封面下面当参考。
			 */
			sheet: z.optional(image()),
			/**
			 * 是否进「抽签」的签筒。
			 * 默认 false（自己的 OC 一般不放进去），朋友家的孩子与想放进去的角色手动标 true。
			 */
			drawable: z.boolean().default(false),
			/**
			 * 抽签限定：只在这一期限定里露面，卡片与签筒上会带「限定」角标。
			 * 与 drawable 无关 —— draw 目录里的条目也可以标。
			 */
			limited: z.boolean().default(false),
			/**
			 * 角色不打标签。
			 * 作者的口径是「不给 OC 打标签」——标签体系已从角色与签筒里撤掉；
			 * 设定（lore）与种族（races）仍保留 tags，那是分类用途，不是给角色贴标签。
			 */
			/** 人际关系：指向其他角色 */
			relations: z
				.array(z.object({ to: reference('characters'), note: z.string() }))
				.default([]),
			lore: z.array(reference('lore')).default([]),
			/** 可下载的数字资源（鼠标指针包之类），会显示在角色页画作上方 */
			resources: z.array(characterResource).default([]),
			/** 跨企划指路：同一角色在别的企划里的档案 */
			crossLinks: z.array(crossLink).default([]),
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
			category: z.enum(['世界规则', '势力', '地域', '历史', '神器', '魔法体系']),
			cover: z.optional(image()),
			/* 与 global.css 的 --accent 保持一致 */
			themeColor: themeColor.default('#7FE9F0'),
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

/**
 * 教材：《T6 魔法指令集导论》（白塔学院第一学年课程总览）。
 *
 * 与「故事」分开存 —— 它是世界观里的**书**，不是叙事正文：
 * 一篇一个文件，粒度到章（章内的节用小标题排在正文里）。
 * 正文由 tools/import-textbook-docx.py 从作者的 docx 逐字导入，
 * 书的目录结构（含还没写的章）另见 src/lib/handbook.ts。
 */
const textbook = defineCollection({
	loader: glob({ base: './src/content/textbook', pattern: '**/*.{md,mdx}' }),
	schema: () =>
		z.object({
			title: z.string(),
			/** 所属卷，例如 第二卷　基础元素导论；序篇没有卷 */
			volume: z.string().optional(),
			volumeNo: z.number().optional(),
			/** 这一章的提要（目录里显示；留空就只显示章名） */
			summary: z.string().optional(),
			/** 学习目标（目录与页首会摘出来显示） */
			goals: z.array(z.string()).default([]),
			/** 还没写完的章不上站 */
			draft: z.boolean().default(false),
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
			/**
			 * 关联的故事篇（篇号前缀，例如 act1-birdcage-2）。
			 * 「篇」不是独立条目，所以这里存话 id 去掉话号后的前缀 ——
			 * 与故事目录页对应篇标题上的锚点同名，链接形如
			 * /worldview/stories/#act1-birdcage-2。
			 */
			storyArcs: z.array(z.string()).default([]),
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
			/** 跨企划指路：这个条目在别处也有对应的角色档案 */
			crossLinks: z.array(crossLink).default([]),
			draft: z.boolean().default(false),
			order: z.number().default(100),
		}),
});

/**
 * 签筒：只出现在「抽签」这一块的条目。
 *
 * 和 characters 分开存 —— 这里放的是**不进世界观档案**的角色与设定：
 * 客串的、玩梗的、还没想好归到哪一支种族的，都可以先扔进来，
 * 它们只会出现在 /draw/ 与签筒里，不会跑到角色列表和总览上。
 *
 * 字段刻意和 characters 对齐（name / summary / owner / portrait / tags…），
 * 这样抽签页与签筒页能把两个来源揉成同一个列表处理。
 */
const draw = defineCollection({
	// 目录里的写作说明用 .txt（见 src/content/draw/README.txt）：
	// glob 会把任何 .md 当成内容条目，缺字段就会让构建失败，
	// 而 pattern 只接受单个字符串（传数组会被拼成一个模式，结果什么都匹配不到）。
	loader: glob({ base: './src/content/draw', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			name: z.string(),
			/** 卡片上的小标签：角色 / 设定 / 其他 */
			kind: z.enum(['角色', '设定', '其他']).default('角色'),
			summary: z.string(),
			/** 称号 / 他称 */
			title: z.string().optional(),
			/** 原创（自己的）还是联动（朋友家的） */
			ownership: z.enum(['原创', '联动']).default('原创'),
			/** 联动条目的设主 */
			owner: z.string().optional(),
			ownerUrl: z.string().url().optional(),
			themeColor: themeColor.default('#AFFFFF'),
			portrait: z.optional(image()),
			aliases: z.array(z.string()).default([]),
			height: z.string().optional(),
			age: z.string().optional(),
			pronouns: z.string().optional(),
			/* 与 characters 一致：签筒条目也不打标签 */
			/** 抽签限定：卡片与签筒上会带「限定」角标 */
			limited: z.boolean().default(false),
			canon: canonLevel,
			spoiler: spoilerLevel,
			draft: z.boolean().default(false),
			order: z.number().default(100),
		}),
});

export const collections = { blog, races, characters, lore, stories, textbook, music, eden, draw };

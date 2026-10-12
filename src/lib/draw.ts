import { getCollection, getEntry } from 'astro:content';
import galleryMeta from '../data/gallery-meta.json';
import { SITE_AUTHOR } from '../consts';

/**
 * 抽签与签筒共用的池子，来自两个地方：
 *
 *   1. characters 集合里标了 `drawable: true` 的角色 —— 正式入档的
 *   2. draw 目录（src/content/draw/）里的全部条目 —— 只在这个区域出现的
 *
 * 两边字段拼成同一个形状，页面就不用管来源了。
 */
export interface DrawItem {
	id: string;
	name: string;
	/** 卡片上的小标签：角色 / 设定 / 其他 */
	kind: string;
	title: string;
	race: string;
	owner: string;
	ownerUrl: string;
	summary: string;
	color: string;
	href: string;
	art: string;
	aliases: string[];
	height: string;
	age: string;
	pronouns: string;
	tags: string[];
	arts: number;
	/** 抽签限定：卡片与签筒上带「限定」角标 */
	limited: boolean;
}

const gallery = (galleryMeta as { items?: Record<string, { character?: string }> }).items ?? {};
const artCount = (name: string) =>
	Object.values(gallery).filter((item) => item.character === name).length;

export async function drawPool(): Promise<DrawItem[]> {
	const fromCharacters = await getCollection(
		'characters',
		({ data }) => !data.draft && data.drawable,
	);

	const characters: DrawItem[] = await Promise.all(
		fromCharacters.map(async (entry) => {
			const race = entry.data.race ? await getEntry(entry.data.race) : null;
			return {
				id: entry.id,
				name: entry.data.name,
				kind: '角色',
				title: entry.data.title ?? '',
				race: race?.data.name ?? '',
				owner: entry.data.owner || SITE_AUTHOR,
				ownerUrl: entry.data.ownerUrl ?? '',
				summary: entry.data.summary,
				color: entry.data.themeColor,
				href: `/worldview/characters/${entry.id}/`,
				art: entry.data.portrait?.src ?? '',
				aliases: entry.data.aliases ?? [],
				height: entry.data.height ?? '',
				age: entry.data.age ?? '',
				pronouns: entry.data.pronouns ?? '',
				tags: entry.data.tags ?? [],
				arts: artCount(entry.data.name),
				limited: entry.data.limited,
			};
		}),
	);

	const fromDraw = await getCollection('draw', ({ data }) => !data.draft);
	const extras: DrawItem[] = fromDraw.map((entry) => ({
		id: entry.id,
		name: entry.data.name,
		kind: entry.data.kind,
		title: entry.data.title ?? '',
		race: '',
		owner: entry.data.owner || SITE_AUTHOR,
		ownerUrl: entry.data.ownerUrl ?? '',
		summary: entry.data.summary,
		color: entry.data.themeColor,
		href: `/draw/entry/${entry.id}/`,
		art: entry.data.portrait?.src ?? '',
		aliases: entry.data.aliases ?? [],
		height: entry.data.height ?? '',
		age: entry.data.age ?? '',
		pronouns: entry.data.pronouns ?? '',
		tags: entry.data.tags ?? [],
		arts: artCount(entry.data.name),
		limited: entry.data.limited,
	}));

	// 正式入档的排在前面，签筒目录里的跟在后面；各自按 order 排
	const byOrder = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
	return [...characters.sort(byOrder), ...extras.sort(byOrder)];
}

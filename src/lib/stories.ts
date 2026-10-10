import { getCollection, type CollectionEntry } from 'astro:content';

/**
 * 幕的先后顺序。新增幕时在这里补一个前缀即可。
 * 「别传」放在最后 —— 收录 x / y / z 三篇非主线，以及支线《穿行时间的猫》。
 */
const ACT_ORDER = ['第一幕', '第二幕', '第三幕', '第四幕', '第五幕', '别传'];

export type Episode = CollectionEntry<'stories'>;

function actIndex(act: string): number {
	const found = ACT_ORDER.findIndex((prefix) => act.startsWith(prefix));
	return found === -1 ? 99 : found;
}

/**
 * 阅读顺序：先按幕，再按 order（手动指定），最后按话号自然排序。
 * 话号形如 1-1 / 2-ed / x-1 / sp-1，自然排序能正确处理其中的数字。
 */
export function sortEpisodes(list: Episode[]): Episode[] {
	return [...list].sort((a, b) => {
		const byAct = actIndex(a.data.act) - actIndex(b.data.act);
		if (byAct !== 0) return byAct;
		if (a.data.order !== b.data.order) return a.data.order - b.data.order;
		return a.data.code.localeCompare(b.data.code, 'en', { numeric: true });
	});
}

/** 按 幕 → 篇 分组，保留传入的阅读顺序 */
export function groupByArc(list: Episode[]) {
	const acts: { act: string; arcs: { arc: string; episodes: Episode[] }[] }[] = [];
	for (const episode of list) {
		let act = acts.find((item) => item.act === episode.data.act);
		if (!act) {
			act = { act: episode.data.act, arcs: [] };
			acts.push(act);
		}
		let arc = act.arcs.find((item) => item.arc === episode.data.arc);
		if (!arc) {
			arc = { arc: episode.data.arc, episodes: [] };
			act.arcs.push(arc);
		}
		arc.episodes.push(episode);
	}
	return acts;
}

/** 已发布的话，按阅读顺序排好 */
export async function publishedEpisodes(): Promise<Episode[]> {
	return sortEpisodes(await getCollection('stories', ({ data }) => data.status === 'published'));
}

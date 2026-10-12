/**
 * 设定（lore）的类目表，全站共用一份 ——
 * 设定索引页、势力子页、侧栏都从这里取，免得三处各写一遍顺序。
 *
 * 顺序就是页面上从上到下的顺序；`FACTION_CATEGORY` 那一类另有自己的子页
 * （/worldview/lore/factions/），侧栏里也会单独展开成一小组。
 */
export const LORE_CATEGORIES = [
	'世界规则',
	'瘴素',
	'神器',
	'魔法体系',
	'势力',
	'历史',
	'概念',
] as const;

export type LoreCategory = (typeof LORE_CATEGORIES)[number];

/** 有独立子页的那一类：势力 */
export const FACTION_CATEGORY: LoreCategory = '势力';

/** 势力子页的网址（也是侧栏里那个分组的跳转目标） */
export const FACTION_BASE = '/worldview/lore/factions';

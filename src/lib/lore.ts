/**
 * 设定（lore）的类目表，全站共用一份 ——
 * 设定索引页与侧栏目录都从这里取，免得两处各写一遍顺序与释义。
 *
 * 每个类目带一句释义（note）：索引页里做「这一类装什么」的说明，
 * 侧栏里做链接的 title，鼠标停上去能看到同样一句。
 *
 * 加一类只要改这里 + content.config.ts 里的枚举，其余页面自动跟上。
 */
export const LORE_CATEGORIES = [
	'世界规则',
	'势力',
	'地域',
	'历史',
	'神器',
	'魔法体系',
] as const;

export type LoreCategory = (typeof LORE_CATEGORIES)[number];

/** 每一类装什么：一句话，索引页的类目栏与侧栏都显示这句 */
export const LORE_CATEGORY_NOTES: Record<LoreCategory, string> = {
	世界规则: '世界怎么运转的：灾变、元素衰变、命运三神与时间环。动它等于动摇地基。',
	势力: '谁在统治、谁在争：国家、组织、联合体。',
	地域: '地图上的实体：结界、浮岛城邦、边境与要冲。',
	历史: '事情是怎么走到今天的：纪元与转折、旧账与遗留问题。',
	神器: '元素本源凝结的物件，以及围绕它们的争夺。',
	魔法体系: '力量怎么被分级、调用与传授。',
};

/** 类目在索引页里的锚点，例如 /worldview/lore/#lore-历史 */
export function loreAnchor(category: LoreCategory | string): string {
	return `lore-${category}`;
}

/** 走索引页的类目链接（侧栏、势力这类跨页指路都用它） */
export function loreCategoryHref(category: LoreCategory | string): string {
	return `/worldview/lore/#${loreAnchor(category)}`;
}

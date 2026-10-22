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
	世界规则: '从元素衰变到命运三神与时间环，了解这个世界如何运转。',
	势力: '国家与组织各有立场，也各有想要守住的东西。',
	地域: '走近封闭的结界、云上的城邦与边境聚落。',
	历史: '那些改变世界的往事，以及它们留下的影响。',
	神器: '元素本源的结晶，以及围绕它们发生的故事。',
	魔法体系: '魔法如何施展，又如何被理解、分级与传授。',
};

/** 类目在索引页里的锚点，例如 /worldview/lore/#lore-历史 */
export function loreAnchor(category: LoreCategory | string): string {
	return `lore-${category}`;
}

/** 走索引页的类目链接（侧栏、势力这类跨页指路都用它） */
export function loreCategoryHref(category: LoreCategory | string): string {
	return `/worldview/lore/#${loreAnchor(category)}`;
}

/**
 * 把 usage 折算成人民币。
 *
 * 价格来自官方价目表（deepseek-flash，每百万 tokens）：
 *   缓存命中 0.04 / 未命中 2 / 输出 8  （高峰价，空闲时段一律半价）
 *   搜索、抓取 5 元每千次；文件解析 1.5 元每千页
 *
 * 高峰时段是北京时间周一至周五 9:00–12:00、14:00–18:00（不含法定节假日，
 * 但节假日表变来变去，这里只在界面上标注「按工作日估算」，不假装精确）。
 */

import type { Usage } from './types.ts';

const PEAK = { hit: 0.04, miss: 2, out: 8 };
const SEARCH_EACH = 0.005;
const FETCH_EACH = 0.005;
const PAGE_EACH = 0.0015;

type BeijingClock = { weekday: number; minutes: number };

function beijingClock(date: Date): BeijingClock {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Shanghai',
		hourCycle: 'h23',
		weekday: 'short',
		hour: '2-digit',
		minute: '2-digit',
	}).formatToParts(date);
	const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
	const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
	return {
		weekday: weekdayMap[get('weekday')] ?? 0,
		minutes: Number(get('hour')) * 60 + Number(get('minute')),
	};
}

export function isPeak(date = new Date()): boolean {
	const { weekday, minutes } = beijingClock(date);
	if (weekday === 0 || weekday === 6) return false;
	return (minutes >= 9 * 60 && minutes < 12 * 60) || (minutes >= 14 * 60 && minutes < 18 * 60);
}

export function priceMode(date = new Date()): '高峰' | '空闲' {
	return isPeak(date) ? '高峰' : '空闲';
}

/** 一次请求的费用（元）。pages 只在不走 Files API 的解析里用得到，这里留口子。 */
export function costOf(usage: Usage, options: { pages?: number; at?: Date } = {}): number {
	const factor = isPeak(options.at ?? new Date()) ? 1 : 0.5;
	const tokens = (usage.input * PEAK.miss + usage.cacheHit * PEAK.hit + usage.output * PEAK.out) / 1_000_000;
	const tools =
		usage.searches * SEARCH_EACH + usage.fetches * FETCH_EACH + usage.imageSearches * SEARCH_EACH;
	return tokens * factor + tools + (options.pages ?? 0) * PAGE_EACH;
}

export function fmtCost(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return '¥0';
	if (value >= 1) return `¥${value.toFixed(2)}`;
	if (value >= 0.01) return `¥${value.toFixed(3)}`;
	return `¥${value.toFixed(4)}`;
}

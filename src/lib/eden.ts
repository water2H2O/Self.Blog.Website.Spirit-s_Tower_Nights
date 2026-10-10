/**
 * 「变异体常态危险等级」的正文解析。
 *
 * 原文是一份 docx：前言几段、然后 1~10 级各一段描述 + 一句引言，最后是注。
 * 这里只按结构切开，**不改动任何字符**，好在页面上按等级阶梯排版。
 */
export interface ThreatLevel {
	n: number;
	text: string;
	quote?: string;
}

export interface ThreatDoc {
	preamble: string[];
	levels: ThreatLevel[];
	notes: string[];
}

/** 等级段的开头：原文里「危险程度1：」「危险层次4：」两种写法都有 */
const LEVEL_RE = /^危险(?:程度|层次|等级)\s*(\d+)\s*[：:]\s*([\s\S]*)$/;

export function parseThreatLevels(body: string): ThreatDoc {
	const paragraphs = body
		.trim()
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter(Boolean);

	const preamble: string[] = [];
	const levels: ThreatLevel[] = [];
	const notes: string[] = [];
	let mode: 'pre' | 'level' | 'note' = 'pre';

	for (const paragraph of paragraphs) {
		const hit = paragraph.match(LEVEL_RE);
		if (hit) {
			levels.push({ n: Number(hit[1]), text: hit[2].trim() });
			mode = 'level';
			continue;
		}

		// 等级后面紧跟的那句引言（以引号开头）
		if (mode === 'level' && levels.length > 0 && /^["“]/.test(paragraph) && !levels[levels.length - 1].quote) {
			levels[levels.length - 1].quote = paragraph;
			continue;
		}

		if (/^注[：:]/.test(paragraph)) {
			notes.push(paragraph.replace(/^注[：:]\s*/, ''));
			mode = 'note';
			continue;
		}

		if (mode === 'pre') preamble.push(paragraph);
		else notes.push(paragraph);
	}

	return { preamble, levels, notes };
}

/**
 * 等级配色：1 级偏青，10 级偏红，一眼看出危险到什么程度。
 * 越危险饱和度越高、越亮（光晕也更强），所以高等级看着更「烫」。
 */
export function levelColor(n: number): { h: number; s: number; l: number } {
	const t = (Math.min(Math.max(n, 1), 10) - 1) / 9; // 0 → 1
	return {
		h: Math.round(190 - t * 190), // 青 190° → 红 0°
		s: Math.round(68 + t * 30), // 68% → 98%
		l: Math.round(72 - t * 5), // 72% → 67%
	};
}

/** 只取色相时用（分档标签） */
export function levelHue(n: number): number {
	return levelColor(n).h;
}

/** 等级分档的说明文字（来自原文的「注」） */
export const LEVEL_BANDS = [
	{ label: '常规威胁', range: '1–3', n: 2 },
	{ label: '高端主要威胁', range: '5–7', n: 6 },
	{ label: '仅能制衡', range: '8–10', n: 9 },
];

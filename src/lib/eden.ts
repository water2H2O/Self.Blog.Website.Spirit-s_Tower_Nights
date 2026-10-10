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

/** 罗马数字（晶虹原稿写的是 III级），只用到 1~10 */
const ROMAN: Record<string, number> = {
	I: 1,
	II: 2,
	III: 3,
	IV: 4,
	V: 5,
	VI: 6,
	VII: 7,
	VIII: 8,
	IX: 9,
	X: 10,
};

/**
 * 把危险等级的文字解析成数字，好决定配色。
 * 支持「7级 / 7 / III级 / 0」这几种写法；0 表示无害，返回 0。
 */
export function dangerNumber(label: string): number | null {
	const text = label.trim();
	const arabic = text.match(/\d+/);
	if (arabic) return Number(arabic[0]);
	const roman = text.toUpperCase().match(/\b(I|II|III|IV|V|VI|VII|VIII|IX|X)\b/);
	if (roman) return ROMAN[roman[1]] ?? null;
	return null;
}

/**
 * 危险等级 0～10 的配色。0 是无害，用中性偏冷的青色；1→10 由青转红。
 */
export function dangerColor(n: number | null): { h: number; s: number; l: number } {
	if (n === null) return { h: 210, s: 12, l: 60 };
	if (n <= 0) return { h: 205, s: 55, l: 78 };
	return levelColor(n);
}

/* ------------------------------------------------------------------ *
 * 「晶体生物 / 物种」档案的正文解析
 *
 * 原稿是一行一行的：危险等级、若干「标签：内容」行、独立的小节名
 * （外观 / 核心技能 / 行为习性…）、以及成段的描述。docx 里这些行是
 * 软换行，转成 markdown 后会被并成一大段，所以这里按行还原结构。
 * 同样不改动任何字符。
 * ------------------------------------------------------------------ */

export type CreatureBlock =
	| { type: 'epigraph'; text: string }
	| { type: 'level'; label: string }
	| { type: 'heading'; text: string }
	| { type: 'field'; label: string; value: string }
	| { type: 'prose'; lines: string[] }
	| { type: 'divider' };

/** 「标签：内容」——标签不超过 10 个字 */
const FIELD_RE = /^([^：:]{1,10})[：:]\s*(.+)$/;
/** 独立小节名：整行就是一个词，或「武器设定：」这种以冒号收尾的短行 */
const HEADING_RE = /^([^：:]{1,12})[：:]?$/;
/** 危险等级行 */
const LEVEL_RE_CREATURE = /^危险(?:等级|程度|层次)\s*[：:]\s*(.*)$/;

export function parseCreatureDoc(body: string, title?: string): CreatureBlock[] {
	const rawLines = body.replace(/\r\n/g, '\n').split('\n');
	const blocks: CreatureBlock[] = [];
	let buffer: string[] = [];

	const flush = () => {
		if (buffer.length > 0) {
			blocks.push({ type: 'prose', lines: [...buffer] });
			buffer = [];
		}
	};

	for (let i = 0; i < rawLines.length; i += 1) {
		const line = rawLines[i].trim();

		if (line === '') {
			flush();
			continue;
		}

		// 首行如果就是标题，跳过（frontmatter 里已经有了）
		if (i === 0 && title && (line === title || line.replace(/^#+\s*/, '') === title)) continue;

		if (/^-{3,}$/.test(line)) {
			flush();
			blocks.push({ type: 'divider' });
			continue;
		}

		// 题记：原稿里是「## ——衰败文明听见星空胎动……」
		const epigraph = line.match(/^#{0,3}\s*——\s*(.+)$/);
		if (epigraph) {
			flush();
			blocks.push({ type: 'epigraph', text: epigraph[1].trim() });
			continue;
		}

		const level = line.match(LEVEL_RE_CREATURE);
		if (level) {
			flush();
			const label = level[1].trim();
			if (label) blocks.push({ type: 'level', label });
			continue;
		}

		const field = line.match(FIELD_RE);
		if (field) {
			flush();
			blocks.push({ type: 'field', label: field[1].trim(), value: field[2].trim() });
			continue;
		}

		const heading = line.match(HEADING_RE);
		if (heading) {
			flush();
			blocks.push({ type: 'heading', text: heading[1].trim() });
			continue;
		}

		buffer.push(line);
	}

	flush();
	return blocks;
}

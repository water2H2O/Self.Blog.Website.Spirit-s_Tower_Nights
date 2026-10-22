/**
 * 《T6 魔法指令集导论》的结构表 —— 教材目录的唯一来源。
 *
 * 目录与正文分开维护：序篇、24 章、结语及附录 A–E 均在
 * `src/content/textbook/` 中有对应文件，篇目标题与经验册修订稿一致。
 *
 * 体例：卷一 = 基础元素导论 / 卷二 = 魔法时序导论 / 卷三 = 法术状态空间导论
 * （正典 T6 的三门科目）。每卷内部统一走「本篇要义 → 起环境 → 下指令 →
 * 灌魔力 → 闭环」，卷末的闭环章即学习阶梯。
 *
 * 加一章：在这里补一条（拿到 slug），再往 src/content/textbook/ 放同名 md。
 * 当前章节正文从作者的经验册修订稿 Markdown 逐字导入。
 */

/** 这本书自己的版头信息（与 docx 封面一致） */
export const HANDBOOK = {
	title: 'T6 魔法指令集导论',
	subtitle: '白塔学院 第一学年课程总览（节本）',
	editor: '白塔学院 基础课程组',
	edition: '第三版（院议审定）',
	audience: '初入塔的学徒 · 跨级旁听者',
	notice: '内部教学材料 · 请勿外传',
	/** 页面上给读者的一句定位（不是书里的原文） */
	blurb:
		'T6 是「魔法指令集」，也是一切法术的基石。这份白塔学院的第一学年课程总览，带新学徒了解要学什么、从哪里开始，以及哪些内容留待以后。它是一份学习路标，完整的课程还在讲堂与练习场上。',
} as const;

/** 一篇（序篇 / 章 / 结语 / 附录） */
export interface HandbookPiece {
	/** 网址最后一段；与 src/content/textbook/<slug>.md 同名 */
	slug: string;
	/** 书里的标题，全角空格照原稿 */
	title: string;
	/** 目录里显示的一行提要 */
	summary?: string;
	/** 由 HANDBOOK_PIECES 补上：所属卷 */
	volume?: string;
	volumeNo?: number;
}

/** 一卷 */
export interface HandbookVolume {
	/** 卷号；0 表示序篇/结语这类不在卷内的部分 */
	no: number;
	title: string;
	/** 这一卷装什么（页面上的说明，不是书里的原文） */
	note?: string;
	pieces: HandbookPiece[];
}

/**
 * 全书结构。
 *
 * 序篇、第一至五卷 1–24 章、全书结语与附录均已有正文。
 */
export const HANDBOOK_VOLUMES: HandbookVolume[] = [
	{
		no: 0,
		title: '序篇',
		pieces: [{ slug: 'preface', title: '编者的话' }],
	},
	{
		no: 1,
		title: '总论：法则、魔力与施法者',
		note: '从法则、魔力与施法者的关系开始，为后面的学习打好基础。',
		pieces: [
			{ slug: 'ch-01', title: '第一章　先看看手边有什么' },
			{ slug: 'ch-02', title: '第二章　把一次施法说清楚' },
			{ slug: 'ch-03', title: '第三章　会停下来，也会留下记录' },
			{ slug: 'ch-04', title: '第四章　七种元素，怎样写进六轴表' },
		],
	},
	{
		no: 2,
		title: '基础元素导论',
		note: '正典 T6 三门科目的第一门：元素粒子。全书的例子都从这里长出来。',
		pieces: [
			{ slug: 'ch-05', title: '第五章　先问这片场地够不够用' },
			{ slug: 'ch-06', title: '第六章　让元素申明有头有尾' },
			{ slug: 'ch-07', title: '第七章　抵消以后，账还在' },
			{ slug: 'ch-08', title: '第八章　三次观察，该怎样读' },
		],
	},
	{
		no: 3,
		title: '魔法时序导论',
		note: '第二门：什么时候开始、持续多久、怎么收场。学徒最容易忽略的一门。',
		pieces: [
			{ slug: 'ch-09', title: '第九章　这件事应该什么时候发生' },
			{ slug: 'ch-10', title: '第十章　先把起点对齐' },
			{ slug: 'ch-11', title: '第十一章　等一等，与留一会儿' },
			{ slug: 'ch-12', title: '第十二章　接得上，也退得出来' },
			{ slug: 'ch-13', title: '第十三章　把一段时间记成几件事' },
		],
	},
	{
		no: 4,
		title: '法术状态空间导论',
		note: '第三门课：读懂法术与环境的状态，学会让法术在合适的时候停下来。',
		pieces: [
			{ slug: 'ch-14', title: '第十四章　状态：眼前一样，过程未必一样' },
			{ slug: 'ch-15', title: '第十五章　起环境：先读清状态场' },
			{ slug: 'ch-16', title: '第十六章　下指令：条件要接到哪一步' },
			{ slug: 'ch-17', title: '第十七章　反馈变了以后，怎样收场' },
			{ slug: 'ch-18', title: '第十八章　把状态课读成一个闭环' },
		],
	},
	{
		no: 5,
		title: '综合：从指令集到第一个法术',
		note: '将三门课连起来，尝试构建第一个法术。',
		pieces: [
			{ slug: 'ch-19', title: '第十九章　把两段申明接起来' },
			{ slug: 'ch-20', title: '第二十章　从一个愿望，找到最小的法术' },
			{ slug: 'ch-21', title: '第二十一章　把两个模型放在一起看' },
			{ slug: 'ch-22', title: '第二十二章　没按预想发生，先查哪一处' },
			{ slug: 'ch-23', title: '第二十三章　让一份记录从头到尾对得上' },
			{ slug: 'ch-24', title: '第二十四章　下一步：T4与T5的分岔' },
		],
	},
	{
		no: 6,
		title: '全书结语',
		pieces: [{ slug: 'afterword', title: '结语　三门课其实是一件事' }],
	},
	{
		no: 7,
		title: '附录',
		note: '术语、符号与申明速查、故障核查、常见误解及后续学习方向。',
		pieces: [
			{ slug: 'appendix-a', title: '附录A　忘了这个词时，来这里找' },
			{ slug: 'appendix-b', title: '附录B　符号与申明速查' },
			{ slug: 'appendix-c', title: '附录C　出了岔子，先查哪一头' },
			{ slug: 'appendix-d', title: '附录D　几句容易想岔的话' },
			{ slug: 'appendix-e', title: '附录E　下一步，带着哪个问题走' },
		],
	},
];

/** 目录里列出的全部篇目，按阅读顺序 */
export const HANDBOOK_PIECES: HandbookPiece[] = HANDBOOK_VOLUMES.flatMap((volume) =>
	volume.pieces.map((piece) => ({
		...piece,
		volume: volume.title,
		volumeNo: volume.no,
	})),
);

/** 阅读顺序：序篇 → 第 1–24 章 → 结语 → 附录 */
export function handbookOrder(slug: string): number {
	if (slug === 'preface') return 0;
	const chapter = slug.match(/^ch-(\d+)$/);
	if (chapter) return Number(chapter[1]);
	if (slug === 'afterword') return 100;
	const appendix = slug.match(/^appendix-([a-z])$/);
	if (appendix) return 200 + appendix[1].charCodeAt(0) - 97;
	return 999;
}

/** 教材的网址前缀 */
export const HANDBOOK_BASE = '/worldview/stories/textbook';

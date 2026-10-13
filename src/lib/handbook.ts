/**
 * 《T6 魔法指令集导论》的结构表 —— 教材目录的唯一来源。
 *
 * 为什么单独放一份：书是**先定目录、再逐章写**的。已经写完的章在
 * `src/content/textbook/` 里有文件；还没写的（第五卷 19–24 章、附录 A–E）
 * 只存在于这里，标记为待写。这样目录一次到位，写完一章只要多一个文件。
 *
 * 体例：卷一 = 基础元素导论 / 卷二 = 魔法时序导论 / 卷三 = 法术状态空间导论
 * （正典 T6 的三门科目）。每卷内部统一走「本篇要义 → 起环境 → 下指令 →
 * 灌魔力 → 闭环」，卷末的闭环章即学习阶梯。
 *
 * 加一章：在这里补一条（拿到 slug），再往 src/content/textbook/ 放同名 md。
 * 章节正文由 tools/import-textbook-docx.py 从作者的 docx 导入。
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
		'正典把 T6 定成「魔法指令集」——一切法术的基石。这本册子是白塔学院发给新学徒的第一学年总览：先教什么、按什么顺序教、哪些部分先别碰。它不是教材本身，真正的课程在讲堂与练习场上。',
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
 * 已经写完的（序篇 + 第一至四卷 1–18 章 + 全书结语）在 content/textbook 里有文件；
 * 第五卷与附录标了 pending —— 目录里照旧列出来，读者能看到这本书的全貌。
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
		note: '这一卷只有三章，却是往后所有内容的落脚处。读慢一点。',
		pieces: [
			{ slug: 'ch-01', title: '第一章　魔法是什么' },
			{ slug: 'ch-02', title: '第二章　施法三步骤' },
			{ slug: 'ch-03', title: '第三章　学徒的第一课：安全与代价' },
			{ slug: 'ch-04', title: '第四章　这门课教什么' },
		],
	},
	{
		no: 2,
		title: '基础元素导论',
		note: '正典 T6 三门科目的第一门：元素粒子。全书的例子都从这里长出来。',
		pieces: [
			{ slug: 'ch-05', title: '第五章　起环境：元素场' },
			{ slug: 'ch-06', title: '第六章　下指令：元素申明' },
			{ slug: 'ch-07', title: '第七章　灌魔力：元素注入' },
			{ slug: 'ch-08', title: '第八章　闭环：把元素课读完' },
		],
	},
	{
		no: 3,
		title: '魔法时序导论',
		note: '第二门：什么时候开始、持续多久、怎么收场。学徒最容易忽略的一门。',
		pieces: [
			{ slug: 'ch-09', title: '第九章　这门课教什么' },
			{ slug: 'ch-10', title: '第十章　起环境：时序场' },
			{ slug: 'ch-11', title: '第十一章　下指令：时序申明' },
			{ slug: 'ch-12', title: '第十二章　灌魔力：时序注入' },
			{ slug: 'ch-13', title: '第十三章　闭环：把时序课读完' },
		],
	},
	{
		no: 4,
		title: '法术状态空间导论',
		note: '第三门：法术与环境各自处在什么状态，怎么读、怎么让它自己停下来。',
		pieces: [
			{ slug: 'ch-14', title: '第十四章　这门课教什么' },
			{ slug: 'ch-15', title: '第十五章　起环境：状态场' },
			{ slug: 'ch-16', title: '第十六章　下指令：状态申明' },
			{ slug: 'ch-17', title: '第十七章　灌魔力：状态注入' },
			{ slug: 'ch-18', title: '第十八章　闭环：把状态课读完' },
		],
	},
	{
		no: 5,
		title: '综合：从指令集到第一个法术',
		note: '把三门课合起来用一遍 —— 这一卷还没写。',
		pieces: [
			{ slug: 'ch-19', title: '第十九章　复合申明与逻辑结构' },
			{ slug: 'ch-20', title: '第二十章　从零构建一个法术' },
			{ slug: 'ch-21', title: '第二十一章　经典 T6 法术范式' },
			{ slug: 'ch-22', title: '第二十二章　错误诊断与调试' },
			{ slug: 'ch-23', title: '第二十三章　标杆：一个够得着的例子' },
			{ slug: 'ch-24', title: '第二十四章　从 T6 到下一步：T4 与 T5 的分岔' },
		],
	},
	{
		no: 6,
		title: '全书结语',
		pieces: [{ slug: 'afterword', title: '三门课其实是一件事' }],
	},
	{
		no: 7,
		title: '附录',
		note: '术语表、语法速查、错误代码索引、练习答案 —— 都还没写。',
		pieces: [
			{ slug: 'appendix-a', title: '附录 A　术语表' },
			{ slug: 'appendix-b', title: '附录 B　申明语法速查表' },
			{ slug: 'appendix-c', title: '附录 C　常见错误代码与诊断' },
			{ slug: 'appendix-d', title: '附录 D　练习参考答案与常见错误分析' },
			{ slug: 'appendix-e', title: '附录 E　推荐阅读与进阶方向' },
		],
	},
];

/** 目录里列出的全部篇目（含待写），按阅读顺序 */
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

/**
 * 把 assets-staging 里压缩好的图片全部摊平进 public/gallery/，并生成标注清单。
 *
 * 用法：
 *   node tools/build-gallery-pool.mjs            # 构建图池 + 更新清单
 *   node tools/build-gallery-pool.mjs --dry-run  # 只看会做什么
 *
 * 清单 src/data/gallery-meta.json 是画廊的「标注文件」：
 *   ownership  原创 | 联动 | 其他   —— 联动会在页面上标出设主
 *   owner      设主（联动角色填）
 *   kind       设定 | 插画 | 曲绘 | 表情包 | 指针 | 同人 | 资料 | 标志
 *   title      可选，显示在灯箱里
 * 重新运行时只补充新文件与尺寸，**不会覆盖你手改过的字段**。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(ROOT, 'assets-staging');
const OUT = path.join(ROOT, 'public', 'gallery');
const META = path.join(ROOT, 'src', 'data', 'gallery-meta.json');

const dryRun = process.argv.includes('--dry-run');

/** 角色 → 归属。改这里就能调整原创 / 联动。 */
const CHARACTERS = {
	淼渺: { ownership: '原创' },
	飒岚: { ownership: '原创' },
	蔚蓝: { ownership: '原创' },
	// 目录名是她的真名「戴薇娜」，图池里统一归到角色「薇奥拉」名下
	戴薇娜: { ownership: '原创', as: '薇奥拉' },
	墨白: { ownership: '联动', owner: '' },
	应祈: { ownership: '联动', owner: '' },
	白茶: { ownership: '联动', owner: '' },
	风汐铃月: { ownership: '联动', owner: '风汐铃月' },
	莉莉安娜: { ownership: '联动', owner: '' },
	'Aurelith PrismWing': { ownership: '联动', owner: '' },
	// 朋友的角色，只进签筒与图池，不进世界观档案；角色名与设主同名
	天涯: { ownership: '联动', owner: '天涯' },
	// 源图名与角色名不一致的：芳基胺那张企划图的原名是「苯胺」。
	// `as` 表示「文件名里叫这个，但条目要归到那个角色」，不写的话会冒出一个站上不存在的名字。
	苯胺: { ownership: '联动', owner: '芳基胺', as: '芳基胺' },
};

/**
 * staging 目录名 → 图池里的角色名与归属。
 *
 * `[醉酒的星辰]戴薇娜` 这个目录装的是**薇奥拉**（戴薇娜是她的真名）。
 * 目录名不改，但两件事要分开：
 *   · `as` 是**归属**：这 7 张图算在角色「薇奥拉」名下（图池里另外几张也是这么归的）
 *   · 文件名前缀仍用目录名「戴薇娜__…」，与既有文件名保持一致（否则整批文件会改名、
 *     自检会报一堆「磁盘上有、清单里没有」）
 */
const CHARACTER_ALIASES = {
	戴薇娜: { as: '薇奥拉', ownership: '原创' },
};

/** 非角色目录 → 分类 */
const CATEGORIES = {
	'回响之殿（音乐作品）': { kind: '曲绘', ownership: '其他' },
	'平行时空（同人&群友创作）': { kind: '同人', ownership: '其他' },
	'讯息（重要的和通信邮件记录）': { kind: '资料', ownership: '其他' },
};

/**
 * 「水塔 OC 补完计划」的成品：文件名即角色名。
 * 这批整批算作「企划」—— 和「原创 / 联动」同一维度的互斥分类，不是附加标签。
 */
const PROJECT_DIR = '【企划】水塔OC补完计划';
const PROJECT_OWNERSHIP = '企划';

/**
 * 明确不放进图池的文件（按路径片段匹配）。
 *
 * 第二组是 2026-10-14 核对出来的**内容重复副本**：同一个文件被放在多个来源目录里，
 * 图池里会变成一张图挂好几个名字。每个都保留了带角色归属的那一份（写在注释里），
 * 只排除其余副本 —— 不排除的话，每次重建图池它们都会再冒出来。
 */
const EXCLUDE = [
	'淼渺_女仆',
	// 与「[元素精灵]淼渺/插画-Halv合作曲绘.webp」同一文件
	'回响之殿（音乐作品）/[#4]Halv - Snowflower.webp',
	'讯息（重要的和通信邮件记录）/和RT的合作提供的资料/插画-Halv合作曲绘.webp',
	// 与「[元素精灵]淼渺/实习药剂师.webp」同一文件
	'讯息（重要的和通信邮件记录）/和Halv先生的合作/【参考文献】キャラクター画像.webp',
	// 与「[元素精灵]淼渺/插画-魔法药剂师.webp」同一文件
	'讯息（重要的和通信邮件记录）/和RT的合作提供的资料/插画-魔法药剂师.webp',
	// 作者口径「8 可以删了」：同一画面的 PV 封面版，保留 [回响之殿]/[#7] 的正图
	'回响之殿（音乐作品）/pv/[OC世界观音乐企划#7]梅干茶漬け-Dabbling-封面.webp',
];

/**
 * 水印瓦片：斜排的浅色 sample，浅底深底都看得见。
 * 与 tools/watermark-samples.mjs 用的是同一款，风格保持一致。
 */
const TILE = 460;
const watermarkTile = Buffer.from(
	`<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE * 0.62}">
		<text x="50%" y="60%"
			font-family="Arial, Helvetica, sans-serif"
			font-size="44" font-weight="700" letter-spacing="3"
			text-anchor="middle"
			fill="rgba(255,255,255,0.40)"
			stroke="rgba(24,30,42,0.32)" stroke-width="1.4"
			transform="rotate(-28 ${TILE / 2} ${TILE * 0.31})">sample</text>
	</svg>`,
);

/**
 * 这张图要不要打水印。
 *
 * 口径（作者 2026-10-14）：**别人的立绘要打水印**。
 * 关键不是「角色是谁的」，而是「画是谁的」——所以按来源目录判定：
 *   · 企划（别的设主交给本站收录的成品）→ 打
 *   · 平行时空（同人 & 群友创作）        → 打
 *   · 表情包                            → 不打（小图、转发用）
 *   · 其余：联动角色的图打，自己原创角色的图不打
 */
function needsWatermark(info, fileName, top) {
	if (info.kind === '表情包') return false;
	if (top === '【企划】水塔OC补完计划' || top === '平行时空（同人&群友创作）') return true;
	if (info.ownership === '联动' || info.ownership === '企划') return true;
	if (fileName.startsWith('企划-')) return true;
	return false;
}

/**
 * 作者口径：逐图指定归属、标题、画面里的人。
 *
 * 为什么要写在这里而不是改清单：图池是**每次重建都从 staging 重算元数据**的，
 * 手改清单会在下次重建时被覆盖。写进脚本才是持久的。
 * key 用「staging 相对路径」（正斜杠），值里：
 *   character / ownership / owner —— 覆盖推断结果
 *   title                        —— 相册里显示的标题
 *   characters                   —— 画面里都有谁（双人图靠它同时出现在多个角色页）
 */
const AUTHOR_NOTES = {
	'平行时空（同人&群友创作）/浅水的六岁生日合照图.webp': {
		character: '檐下汐',
		owner: '浅水 ShallowAqua',
		title: '大合照',
		characters: ['檐下汐'],
	},
	'芸芸众生（人物档案）/[名为薛定谔的猫]墨白/ink_bai表情包/水水支付_04.webp': {
		character: '墨白',
		characters: ['墨白'],
	},
	'芸芸众生（人物档案）/[元素精灵]淼渺/表情包/2025年12月26日表情包/表情包2/贴贴_17.webp': {
		character: '淼渺',
		characters: ['淼渺', '飒岚'],
	},
	'芸芸众生（人物档案）/[元素精灵]淼渺/表情包/2026年10月-与天涯联动/与天涯_13.webp': {
		characters: ['淼渺', '天涯'],
	},
	'芸芸众生（人物档案）/[元素精灵]淼渺/表情包/2026年10月-与天涯联动/与天涯_14.webp': {
		characters: ['淼渺', '天涯'],
	},
	'芸芸众生（人物档案）/[元素精灵]淼渺/表情包/2026年10月-与天涯联动/与天涯_15.webp': {
		characters: ['淼渺', '天涯'],
	},
	'芸芸众生（人物档案）/[元素精灵]淼渺/表情包/2026年10月-与天涯联动/与天涯_16_1.webp': {
		characters: ['淼渺', '天涯'],
	},
	'芸芸众生（人物档案）/[元素精灵]淼渺/表情包/2026年10月-与天涯联动/与天涯_16_2.webp': {
		characters: ['淼渺', '天涯'],
	},
	'回响之殿（音乐作品）/[#1]Lum1n0u2-Late Glow, Twin Trails_.webp': {
		character: '淼渺',
		characters: ['淼渺', '飒岚'],
	},
	'回响之殿（音乐作品）/[#2]ああああ-アドベンチャー・パレード.webp': {
		character: '淼渺',
		characters: ['淼渺', '飒岚'],
	},
	'回响之殿（音乐作品）/[#3]Kyakii-OBLIVION.webp': {
		character: '风汐铃月',
		characters: ['风汐铃月'],
	},
	'回响之殿（音乐作品）/[#5]CS4W - Subjugator.webp': {
		character: '淼渺',
		characters: ['淼渺'],
	},
	'回响之殿（音乐作品）/[#6]米虾Fomiki-Ventus Murorum.webp': {
		character: '淼渺',
		characters: ['淼渺', '白茶', '应祈'],
	},
	'回响之殿（音乐作品）/[#7]Dabbling-梅干茶漬け.webp': {
		character: '飒岚',
		characters: ['飒岚'],
	},
	'讯息（重要的和通信邮件记录）/和RT的合作提供的资料/131-魔药双人.webp': {
		character: '墨白',
		characters: ['墨白'],
	},
	'芸芸众生（人物档案）/[元素精灵]淼渺/多人插-和鸟姐姐一起玩水花.webp': {
		character: '淼渺',
		characters: ['淼渺', '小凤'],
		title: '和小凤一起玩水花',
	},
	'芸芸众生（人物档案）/[元素精灵]淼渺/双人贴贴-灌药（淼渺×月月）.webp': {
		characters: ['淼渺', '风汐铃月'],
	},
	'芸芸众生（人物档案）/[元素精灵]淼渺/双人贴贴-拍立得（水水×白茶）.webp': {
		characters: ['淼渺', '白茶'],
	},
};

/** 从路径推断角色与分类 */
function classify(relPath) {
	const parts = relPath.split(path.sep);
	const top = parts[0];

	if (parts.length === 1) return { character: '', kind: '标志', ownership: '其他' };

	if (top === PROJECT_DIR) {
		// 文件名就是角色名，去掉「_汉服」「_带ui」这类后缀后去对照表里找
		const base = path.basename(relPath, '.webp');
		const name = base.split(/[_-]/)[0].trim();
		const hit = Object.keys(CHARACTERS).find((key) => name.includes(key) || key.includes(name));
		return {
			// `as` 优先：源图名与角色名不一致时用条目里的名字（苯胺 → 芳基胺）
			character: hit ? (CHARACTERS[hit].as ?? hit) : name,
			kind: '设定',
			ownership: hit ? (CHARACTERS[hit].ownership ?? PROJECT_OWNERSHIP) : PROJECT_OWNERSHIP,
			owner: hit ? (CHARACTERS[hit].owner ?? '') : '',
		};
	}

	if (top === '芸芸众生（人物档案）') {
		const folder = parts[1] ?? '';
		const raw = folder.replace(/^\[[^\]]+\]/, '').replace(/（.*?）$/, '').trim();
		// 用包含匹配，兼容「莉莉安娜•萨拉姆博」这类带姓氏的全名
		const hit = Object.keys(CHARACTERS).find((key) => raw.includes(key));
		// 目录名与角色名不同的（戴薇娜 → 薇奥拉），按别名表归到同一个角色
		const alias = Object.entries(CHARACTER_ALIASES).find(([dir]) => raw.includes(dir));
		const info = hit ? CHARACTERS[hit] : alias ? alias[1] : { ownership: '其他' };
		const rest = parts.slice(2).join('/');
		let kind = '设定';
		if (/表情包/.test(relPath)) kind = '表情包';
		else if (/指针/.test(relPath)) kind = '指针';
		else if (/插画|多人插|贴贴|赠送立绘/.test(rest)) kind = '插画';
		else if (/曲绘|专辑封面/.test(rest)) kind = '曲绘';
		return {
			// 归属名：优先 `as`（戴薇娜 → 薇奥拉），否则用命中的键
			character: hit ? (CHARACTERS[hit].as ?? hit) : alias ? alias[1].as : raw,
			// 文件名前缀：仍用命中的那个名字，保持既有文件名不变
			// （用归属名当前缀会让「戴薇娜__img_3955」整批改名，自检会报一堆孤儿）
			prefix: hit ?? (alias ? alias[0] : raw),
			kind,
			ownership: info.ownership ?? '其他',
			owner: info.owner ?? '',
		};
	}

	const cat = CATEGORIES[top] ?? { kind: '其他', ownership: '其他' };
	return { character: '', kind: cat.kind, ownership: cat.ownership };
}

/** 生成摊平后的文件名：角色__原文件名，重名自动加序号 */
function makeName(relPath, character) {
	const parts = relPath.split(path.sep);
	const base = path.basename(relPath, '.webp');
	// 「企划」那批直接叫 企划-原名，一眼能认出来源
	if (parts[0] === PROJECT_DIR) {
		return `企划-${base.replace(/#/g, 'No.').replace(/[&,，、]+/g, '-').replace(/\s+/g, '-')}`;
	}
	const prefix = character || (parts.length > 1 ? parts[0].replace(/（.*?）$/, '') : '水塔夜谈');
	// 纯数字或过短的文件名补上父目录，避免一堆 “1”“2”
	const needContext = /^\d+$/.test(base) || base.length <= 4;
	// 角色目录下的文件从第 3 段开始取（跳过「芸芸众生（人物档案）/角色」）
	const skip = relPath.startsWith('芸芸众生（人物档案）') ? 2 : 1;
	const tail = needContext
		? parts
				.slice(skip)
				.join('-')
				.replace(/\.webp$/i, '')
		: base;
	// 文件名会直接进 URL，这里只保留「中文 + 字母数字 + - _ + 全角括号」，
	// 其余一律替换：实测 & , # 空格 在静态服务器上会导致 404
	const safe = tail
		.replace(/#/g, 'No.')
		.replace(/[&,，、]+/g, '-')
		.replace(/\s+/g, '-')
		.replace(/[\\/:*?"<>|'!+\[\]]/g, '_')
		.replace(/-{2,}/g, '-')
		.replace(/_{2,}/g, '_')
		.replace(/^[-_]+|[-_]+$/g, '');
	return `${prefix}__${safe}`.slice(0, 120);
}

const files = [];
(function walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full);
		else if (/\.webp$/i.test(entry.name)) files.push(path.relative(SRC, full));
	}
})(SRC);

files.sort();

const used = new Map();
const items = {};
let copied = 0;
let skipped = 0;
let watermarked = 0;

if (!dryRun) fs.mkdirSync(OUT, { recursive: true });

for (const rel of files) {
	// path.relative 在 Windows 上给的是反斜杠，而排名单按仓库习惯写成正斜杠，
	// 统一成正斜杠再比对（否则排除静默失效，副本会一批批重建出来）
	const relPosix = rel.split(path.sep).join('/');
	if (EXCLUDE.some((needle) => relPosix.includes(needle))) {
		console.log(`  （跳过，已在排除名单里）${relPosix}`);
		skipped += 1;
		continue;
	}
	const info = classify(rel);
	// 文件名前缀用 info.prefix（没有就退回归属名）：戴薇娜目录的图归到薇奥拉名下，
	// 但文件名仍叫「戴薇娜__…」，与既有文件保持一致
	let name = makeName(rel, info.prefix ?? info.character);
	const seen = used.get(name) ?? 0;
	used.set(name, seen + 1);
	if (seen > 0) name = `${name}-${seen + 1}`;
	const fileName = `${name}.webp`;

	const src = path.join(SRC, rel);
	const dst = path.join(OUT, fileName);

	/**
	 * 别人的立绘要打水印。
	 *
	 * 口径（作者 2026-10-14）：
	 *   · 联动角色的图、别的设主交给本站收录的图 → 打
	 *   · 自己原创角色的图（淼渺、飒岚、薇奥拉、蔚蓝）→ 不打
	 *   · 表情包不打（本来就是小图、转发用的）
	 *
	 * 为什么在这里做而不是像以前那样烧进 staging：
	 * 图池是**从 staging 重建**的 —— 烧在 staging 上等于改源文件，不可逆；
	 * 在这里生成则每次重建都会重新烧一遍，源文件保持干净，规则改了也能重来。
	 */
	const marked = needsWatermark(info, fileName, relPosix.split('/')[0]);
	if (!dryRun) {
		if (marked) {
			const meta = await sharp(src).metadata();
			await sharp(src)
				.composite([{ input: watermarkTile, tile: true, blend: 'over' }])
				.webp({ quality: 88, effort: 4 })
				.toFile(dst);
			watermarked += 1;
		} else {
			fs.copyFileSync(src, dst);
		}
		copied += 1;
	}

	items[fileName] = {
		character: info.character,
		ownership: info.ownership,
		owner: info.owner ?? '',
		kind: info.kind,
		title: '',
		source: relPosix,
		...(marked ? { watermark: 'sample' } : {}),
	};

	// 作者逐图的口径最优先：覆盖归属 / 标题 / 画面里的人
	const note = AUTHOR_NOTES[relPosix];
	if (note) {
		Object.assign(items[fileName], note);
		// 归属角色被改过时，文件名前缀也跟着走（否则清单名与实际归属对不上）
		if (note.character && note.character !== info.character) {
			// 保持既有文件名：只在条目里换归属，不改磁盘文件名
		}
	}
}

// 读现有清单，保留人工标注过的字段，只补新文件与尺寸
let previous = { items: {} };
if (fs.existsSync(META)) {
	try {
		previous = JSON.parse(fs.readFileSync(META, 'utf8'));
	} catch {
		console.warn('现有清单解析失败，将重新生成');
	}
}

for (const [name, item] of Object.entries(items)) {
	const old = previous.items?.[name];
	if (!old) continue;
	/**
	 * 保留人工改过的字段（清单里手写的归属不该被重建冲掉），但**作者口径优先** ——
	 * AUTHOR_NOTES 里明确写了的字段以脚本为准，否则改了脚本却看不出变化。
	 */
	const forced = new Set(Object.keys(AUTHOR_NOTES[item.source] ?? {}));
	for (const key of ['ownership', 'owner', 'kind', 'title', 'character', 'characters']) {
		if (forced.has(key)) continue;
		const value = old[key];
		if (typeof value === 'string' && value !== '') item[key] = value;
		else if (Array.isArray(value) && value.length > 0) item[key] = value;
	}
}

const removed = Object.keys(previous.items ?? {}).filter((name) => !(name in items));
skipped = removed.length;

const renamed = {};
const withSize = {};
for (const [name, item] of Object.entries(items)) {
	const full = path.join(OUT, name);
	if (!dryRun) {
		try {
			const meta = await sharp(full).metadata();
			withSize[name] = { ...item, w: meta.width ?? 0, h: meta.height ?? 0 };
		} catch {
			withSize[name] = item;
		}
	} else {
		withSize[name] = item;
	}
}

const byOwnership = {};
const byKind = {};
for (const item of Object.values(withSize)) {
	byOwnership[item.ownership] = (byOwnership[item.ownership] ?? 0) + 1;
	byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
}

if (!dryRun) {
	fs.mkdirSync(path.dirname(META), { recursive: true });
	fs.writeFileSync(
		META,
		`${JSON.stringify(
			{
				note: '画廊标注文件。ownership: 原创|联动|其他（联动会在页面标出设主，填 owner）；kind 为分类；title 可选。重新运行 tools/build-gallery-pool.mjs 只补新文件与尺寸，不会覆盖这里手改的值。',
				updated: new Date().toISOString().slice(0, 10),
				count: Object.keys(withSize).length,
				items: withSize,
			},
			null,
			2,
		)}\n`,
		'utf8',
	);
}

console.log(`${dryRun ? '（dry-run）' : ''}图池：${Object.keys(withSize).length} 张`);console.log(`职责分配：${Object.entries(byOwnership).map(([k, v]) => `${k} ${v}`).join(' / ')}`);
console.log(`分类：${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(' / ')}`);
if (removed.length) console.log(`清单中已不存在的图（${removed.length}）：${removed.slice(0, 5).join(', ')}${removed.length > 5 ? ' …' : ''}`);
console.log(`\n输出目录：${path.relative(ROOT, OUT)}`);
console.log(`标注清单：${path.relative(ROOT, META)}`);
if (!dryRun) console.log(`已打水印：${watermarked} 张（别人的立绘）`);

// 收尾自检：磁盘上的图必须和清单条目一一对应，否则画廊会静默少图
if (!dryRun) {
	const onDisk = new Set(fs.readdirSync(OUT).filter((f) => /\.webp$/i.test(f)));
	const inMeta = Object.keys(withSize);
	const missingOnDisk = inMeta.filter((name) => !onDisk.has(name));
	const staleInMeta = [...onDisk].filter((name) => !withSize[name]);
	if (missingOnDisk.length || staleInMeta.length) {
		console.log('\n⚠ 自检未通过：');
		if (missingOnDisk.length) console.log(`  清单里有、磁盘上没有（${missingOnDisk.length}）：${missingOnDisk.slice(0, 5).join(', ')}`);
		if (staleInMeta.length) console.log(`  磁盘上有、清单里没有（${staleInMeta.length}）：${staleInMeta.slice(0, 5).join(', ')}`);
	} else {
		console.log(`\n自检通过：磁盘 ${onDisk.size} 张 = 清单 ${inMeta.length} 条`);
	}
}
if (dryRun) console.log('\n示例文件名：');
if (dryRun) for (const name of Object.keys(withSize).slice(0, 12)) console.log(`  ${name}`);

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
	戴薇娜: { ownership: '原创' },
	蔚蓝: { ownership: '原创' },
	墨白: { ownership: '联动', owner: '' },
	应祈: { ownership: '联动', owner: '' },
	白茶: { ownership: '联动', owner: '' },
	风汐铃月: { ownership: '联动', owner: '风汐铃月' },
	莉莉安娜: { ownership: '联动', owner: '' },
	'Aurelith PrismWing': { ownership: '联动', owner: '' },
};

/** 非角色目录 → 分类 */
const CATEGORIES = {
	'回响之殿（音乐作品）': { kind: '曲绘', ownership: '其他' },
	'平行时空（同人&群友创作）': { kind: '同人', ownership: '其他' },
	'讯息（重要的和通信邮件记录）': { kind: '资料', ownership: '其他' },
};

/** 从路径推断角色与分类 */
function classify(relPath) {
	const parts = relPath.split(path.sep);
	const top = parts[0];

	if (parts.length === 1) return { character: '', kind: '标志', ownership: '其他' };

	if (top === '芸芸众生（人物档案）') {
		const folder = parts[1] ?? '';
		const raw = folder.replace(/^\[[^\]]+\]/, '').replace(/（.*?）$/, '').trim();
		// 用包含匹配，兼容「莉莉安娜•萨拉姆博」这类带姓氏的全名
		const hit = Object.keys(CHARACTERS).find((key) => raw.includes(key));
		const name = hit ?? raw;
		const info = hit ? CHARACTERS[hit] : { ownership: '其他' };
		const rest = parts.slice(2).join('/');
		let kind = '设定';
		if (/表情包/.test(relPath)) kind = '表情包';
		else if (/指针/.test(relPath)) kind = '指针';
		else if (/插画|多人插|贴贴|赠送立绘/.test(rest)) kind = '插画';
		else if (/曲绘|专辑封面/.test(rest)) kind = '曲绘';
		return { character: name, kind, ownership: info.ownership ?? '其他', owner: info.owner ?? '' };
	}

	const cat = CATEGORIES[top] ?? { kind: '其他', ownership: '其他' };
	return { character: '', kind: cat.kind, ownership: cat.ownership };
}

/** 生成摊平后的文件名：角色__原文件名，重名自动加序号 */
function makeName(relPath, character) {
	const parts = relPath.split(path.sep);
	const base = path.basename(relPath, '.webp');
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

if (!dryRun) fs.mkdirSync(OUT, { recursive: true });

for (const rel of files) {
	const info = classify(rel);
	let name = makeName(rel, info.character);
	const seen = used.get(name) ?? 0;
	used.set(name, seen + 1);
	if (seen > 0) name = `${name}-${seen + 1}`;
	const fileName = `${name}.webp`;

	const src = path.join(SRC, rel);
	const dst = path.join(OUT, fileName);

	if (!dryRun) {
		fs.copyFileSync(src, dst);
		copied += 1;
	}

	items[fileName] = {
		character: info.character,
		ownership: info.ownership,
		owner: info.owner ?? '',
		kind: info.kind,
		title: '',
		source: rel.split(path.sep).join('/'),
	};
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
	// 保留人工改过的分类字段；尺寸等生成字段稍后覆盖
	for (const key of ['ownership', 'owner', 'kind', 'title', 'character']) {
		if (typeof old[key] === 'string') item[key] = old[key];
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

console.log(`${dryRun ? '（dry-run）' : ''}图池：${Object.keys(withSize).length} 张`);
console.log(`职责分配：${Object.entries(byOwnership).map(([k, v]) => `${k} ${v}`).join(' / ')}`);
console.log(`分类：${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(' / ')}`);
if (removed.length) console.log(`清单中已不存在的图（${removed.length}）：${removed.slice(0, 5).join(', ')}${removed.length > 5 ? ' …' : ''}`);
console.log(`\n输出目录：${path.relative(ROOT, OUT)}`);
console.log(`标注清单：${path.relative(ROOT, META)}`);
if (dryRun) console.log('\n示例文件名：');
if (dryRun) for (const name of Object.keys(withSize).slice(0, 12)) console.log(`  ${name}`);

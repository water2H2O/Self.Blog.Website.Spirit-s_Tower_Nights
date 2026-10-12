/**
 * 小图标素材：从表情包里挑透明底的抠图，生成一组 64×64 的 PNG。
 *
 * 筛选逻辑（自动化，不靠肉眼一张张挑）：
 *   1) 必须是表情包、且带 alpha 通道
 *   2) 四个角都得是透明的 —— 这样才是「抠图」，而不是带背景的整图
 *   3) 主体占画面的比例要够大（trim 之后不剩多少空白）
 * 处理：trim 掉四周空白 → 居中放进 64×64 的透明画布
 *
 * 用法：node tools/build-favicon-set.mjs
 * 输出：public/favicon-oc/*.png，同时写入 src/data/favicon-set.json（给页面随机取用）
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const POOL = path.join(ROOT, 'public/gallery');
const OUT = path.join(ROOT, 'public/favicon-oc');
const LIST = path.join(ROOT, 'src/data/favicon-set.json');

const SIZE = 64;

/**
 * 轮换池的归属规则：只放本站作者自己的角色（淼渺）。
 * 别人家的角色不进标签页图标 —— 作者要求，墨白（黑猫）那批表情包不要出现。
 * 按角色名匹配，不按构图，所以双人贴贴只要属于淼渺就照收。
 */
const EXCLUDE_CHARACTERS = ['墨白'];

/**
 * 不走透明抠图流程、直接方形裁切的素材。
 * 这张是带背景的联合贴贴（和 11 合作的双人构图），四角本来就不透明，
 * 走常规筛选会被挡掉，所以单独指定裁切区域 —— 取下半部中间那块，
 * 正好框住两个人的脸。
 */
const DIRECT = [
	{
		file: '淼渺__表情包-和11的联合贴贴.webp',
		// 1600x1067 → 取 1000x1000，横向居中、贴着下边缘
		extract: { left: 300, top: 67, width: 1000, height: 1000 },
	},
];

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/gallery-meta.json'), 'utf8')).items;

/** 角上这一小块的平均透明度，用来判断是不是抠图 */
async function cornerAlpha(file) {
	const { data, info } = await sharp(file)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const { width, height, channels } = info;
	const box = Math.max(2, Math.round(Math.min(width, height) * 0.04));
	const corners = [
		[0, 0],
		[width - box, 0],
		[0, height - box],
		[width - box, height - box],
	];
	let sum = 0;
	let count = 0;
	for (const [ox, oy] of corners) {
		for (let y = oy; y < oy + box; y += 1) {
			for (let x = ox; x < ox + box; x += 1) {
				sum += data[(y * width + x) * channels + 3];
				count += 1;
			}
		}
	}
	return sum / count / 255;
}

fs.mkdirSync(OUT, { recursive: true });
for (const old of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, old));

const skippedEarly = [];

const candidates = Object.entries(meta)
	.filter(([, info]) => info.kind === '表情包')
	.map(([file, info]) => ({ file, character: info.character, full: path.join(POOL, file) }))
	.filter((item) => fs.existsSync(item.full))
	.filter((item) => {
		const hit = EXCLUDE_CHARACTERS.find((name) => (item.character ?? '') === name);
		if (hit) skippedEarly.push({ ...item, why: `按角色排除（${hit}）` });
		return !hit;
	});

const picked = [];
const skipped = [...skippedEarly];

for (const item of candidates) {
	// 直接裁切的素材不走透明抠图那一套
	if (DIRECT.some((direct) => direct.file === item.file)) continue;

	const image = sharp(item.full);
	const info = await image.metadata();
	if (!info.hasAlpha) {
		skipped.push({ ...item, why: '没有 alpha 通道' });
		continue;
	}

	const corner = await cornerAlpha(item.full);
	if (corner > 0.15) {
		skipped.push({ ...item, why: `四角不透明（${(corner * 100).toFixed(0)}%）—— 大概率带背景` });
		continue;
	}

	picked.push({ ...item, corner });
}

console.log(
	`表情包 ${candidates.length} 张 → 透明抠图 ${picked.length} 张 + 指定裁切 ${DIRECT.length} 张，跳过 ${skipped.length} 张\n`,
);

const list = [];
let index = 0;
for (const item of picked) {
	index += 1;
	const name = `${String(index).padStart(2, '0')}-${path.basename(item.file, '.webp').replace(/^[^_]+__/, '')}.png`;
	const dest = path.join(OUT, name);

	const trimmed = await sharp(item.full)
		.trim({ threshold: 12 })
		.resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png({ compressionLevel: 9 })
		.toFile(dest);

	list.push({
		src: `/favicon-oc/${name}`,
		character: item.character,
		from: item.file,
		w: trimmed.width,
		h: trimmed.height,
	});
	console.log(`  ✓ ${name.padEnd(34)} ${String(trimmed.width)}×${trimmed.height}  ${Math.round(trimmed.size / 1024)} KB`);
}

// 指定裁切的：直接方切，不需要透明
for (const direct of DIRECT) {
	const full = path.join(POOL, direct.file);
	if (!fs.existsSync(full)) {
		console.log(`  ✗ 指定裁切的素材不存在：${direct.file}`);
		continue;
	}
	index += 1;
	const name = `${String(index).padStart(2, '0')}-${path.basename(direct.file, '.webp').replace(/^[^_]+__/, '')}.png`;
	const dest = path.join(OUT, name);
	const out = await sharp(full)
		.extract(direct.extract)
		.resize(SIZE, SIZE, { fit: 'cover' })
		.png({ compressionLevel: 9 })
		.toFile(dest);

	list.push({
		src: `/favicon-oc/${name}`,
		character: meta[direct.file]?.character ?? '',
		from: direct.file,
		w: out.width,
		h: out.height,
	});
	console.log(`  ✓ ${name.padEnd(34)} ${out.width}×${out.height}  ${Math.round(out.size / 1024)} KB（指定裁切）`);
}

fs.writeFileSync(LIST, `${JSON.stringify({ size: SIZE, items: list }, null, 2)}\n`, 'utf8');

console.log(`\n✓ 输出 ${list.length} 个图标到 public/favicon-oc/`);
console.log(`✓ 清单写入 ${path.relative(ROOT, LIST)}`);

if (skipped.length > 0) {
	console.log('\n被跳过的（前 12 条）：');
	for (const s of skipped.slice(0, 12)) console.log(`  · ${s.file.padEnd(44)} ${s.why}`);
}

/**
 * 从原始 logo 生成站点品牌资源（favicon / iOS 图标 / 社交分享图）。
 *
 * 用法：node tools/build-brand-assets.mjs
 *
 * 源图是 3072×3072 的 PNG（大量留白），内容区（trim 后）在 (662, 1191) 起、1958×527。
 * - 站点图标用「水」字：实测缩到 32px 仍清晰，猫脸会糊，整条字标完全不可读
 * - iOS 图标与分享图用完整字标
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PUBLIC = path.join(ROOT, 'public');

const SRC = process.argv[2] ?? 'C:/Users/water2H2O/Desktop/oc相关/【原创&本家】水塔夜谈/世界观logo.png';

/** 站点深色底 */
const BG = { r: 13, g: 27, b: 38, alpha: 1 };

/** 原图 3072 坐标系里的切片 */
const CROPS = {
	glyph: { left: 820, top: 1215, width: 345, height: 460 }, // 「水」
	wordmark: { left: 662, top: 1191, width: 1958, height: 527 }, // 完整字标
};

if (!fs.existsSync(SRC)) {
	console.error(`找不到源 logo：${SRC}\n（可用参数指定路径：node tools/build-brand-assets.mjs <logo.png>）`);
	process.exit(1);
}

/** 把切片居中放进指定尺寸的方形/矩形画布 */
async function compose(crop, width, height, options = {}) {
	const { pad = 0.86, background = BG } = options;
	const piece = await sharp(SRC).extract(crop).toBuffer();
	const scale = Math.min((width * pad) / crop.width, (height * pad) / crop.height);
	const targetW = Math.round(crop.width * scale);
	const targetH = Math.round(crop.height * scale);
	const resized = await sharp(piece).resize(targetW, targetH, { fit: 'fill' }).toBuffer();
	return sharp({ create: { width, height, channels: 4, background } })
		.composite([{ input: resized, left: Math.round((width - targetW) / 2), top: Math.round((height - targetH) / 2) }])
		.png()
		.toBuffer();
}

/** 把 PNG 包成单张 ICO（Vista 起 ICO 允许直接内嵌 PNG） */
function pngToIco(png, size) {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0); // reserved
	header.writeUInt16LE(1, 2); // type: icon
	header.writeUInt16LE(1, 4); // count

	const entry = Buffer.alloc(16);
	entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
	entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
	entry.writeUInt8(0, 2); // palette
	entry.writeUInt8(0, 3); // reserved
	entry.writeUInt16LE(1, 4); // planes
	entry.writeUInt16LE(32, 6); // bpp
	entry.writeUInt32LE(png.length, 8); // size
	entry.writeUInt32LE(22, 12); // offset

	return Buffer.concat([header, entry, png]);
}

const glyph128 = await compose(CROPS.glyph, 128, 128);
fs.writeFileSync(path.join(PUBLIC, 'favicon.png'), glyph128);
console.log(`favicon.png            128x128  ${(glyph128.length / 1024).toFixed(1)} KB`);

const glyph64 = await compose(CROPS.glyph, 64, 64);
const ico = pngToIco(glyph64, 64);
fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), ico);
console.log(`favicon.ico            64x64    ${(ico.length / 1024).toFixed(1)} KB`);

const apple = await compose(CROPS.glyph, 180, 180);
fs.writeFileSync(path.join(PUBLIC, 'apple-touch-icon.png'), apple);
console.log(`apple-touch-icon.png   180x180  ${(apple.length / 1024).toFixed(1)} KB`);

const og = await compose(CROPS.wordmark, 1200, 630, { pad: 0.78 });
fs.writeFileSync(path.join(PUBLIC, 'og-default.png'), og);
console.log(`og-default.png         1200x630 ${(og.length / 1024).toFixed(1)} KB`);

// 旧的模板 favicon（Astro 官方 logo）不再需要
const legacy = path.join(PUBLIC, 'favicon.svg');
if (fs.existsSync(legacy)) {
	fs.rmSync(legacy);
	console.log('已删除模板遗留的 favicon.svg（Astro 官方 logo）');
}

/**
 * 图池「发白」自检：找出几乎没有暗部的图。
 *
 * 背景（2026-10-31）：有几张图画廊里明显泛白，原因是成图被半透明白色盖过一层
 * —— 最暗值被抬得很高、暗部占比接近 0。正常插画即使配色很浅，线稿也会有接近黑的像素。
 * 这类问题不会报错，只会「悄悄变丑」，所以单独查一遍。
 *
 * 用法：
 *   node tools/check-pale-images.mjs            # 只警告，退出码 0（可以放心挂 CI）
 *   node tools/check-pale-images.mjs --strict   # 有可疑图就退出码 1
 *
 * 判据（采样到 600px 宽，太小的采样会把细线稿平均没）：
 *   最暗亮度 > 55，且「亮度 < 64」的像素不足 0.5%。
 *   实测：修复前 101~102 / 0%；修复后 24~41 / 0~3.6%；正常插画 0 / 39%。
 *
 * 还原公式（若确认是白色淡化）：成图 = 原图 × a + 255 × (1 − a)，
 *   a ≈ (255 − 最暗) / 255，用 sharp().linear(1/a, -255(1−a)/a) 反推。
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'public/gallery';
const STRICT = process.argv.includes('--strict');
const SAMPLE_WIDTH = 600;
const MIN_DARK = 55;
const DARK_PCT_LIMIT = 0.5;

sharp.concurrency(2);

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.webp')).sort();
const suspicious = [];

for (const file of files) {
	const abs = path.join(DIR, file);
	const { data, info } = await sharp(abs).resize({ width: SAMPLE_WIDTH }).raw().toBuffer({ resolveWithObject: true });
	let min = 255;
	let dark = 0;
	let n = 0;
	for (let i = 0; i < data.length; i += info.channels) {
		const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
		if (lum < min) min = lum;
		if (lum < 64) dark += 1;
		n += 1;
	}
	const darkPct = (dark / n) * 100;
	if (min > MIN_DARK && darkPct < DARK_PCT_LIMIT) {
		suspicious.push({ file, min, darkPct, gain: (255 / (255 - min)).toFixed(2) });
	}
}

console.log(`图池：${files.length} 张，可疑（几乎没有暗部）${suspicious.length} 张`);
for (const s of suspicious) {
	console.log(
		`  ${s.file.padEnd(38)} 最暗 ${String(s.min).padStart(3)}  暗部 ${s.darkPct.toFixed(2)}%  可按 gain ${s.gain} 还原`,
	);
}
if (suspicious.length > 0) {
	console.log('\n这些图可能是被半透明白色淡化过（或本来就是极浅的用色）—— 逐张看一眼再决定要不要还原。');
}

process.exit(STRICT && suspicious.length > 0 ? 1 : 0);

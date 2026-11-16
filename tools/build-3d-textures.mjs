/**
 * 把 4K 的 color.png 与 Opacity.png 合成一张 2048 的 RGBA 贴图（网页只吃一张）。
 *
 *   node tools/build-3d-textures.mjs <原始素材目录> [输出目录]
 *
 * 用仓库里已装的 sharp；glb 里只放这一张，颜色和透明度都在 alpha 通道里。
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require(path.join(process.cwd(), 'node_modules', 'sharp'));

const SRC = process.argv[2] ?? '.';
const OUT = process.argv[3] ?? SRC;
const SIZE = 2048;

const rgb = await sharp(path.join(SRC, 'color.png'))
	.removeAlpha()
	.resize(SIZE, SIZE, { fit: 'fill' })
	.raw()
	.toBuffer();
const alpha = await sharp(path.join(SRC, 'Opacity.png'))
	.greyscale()
	.resize(SIZE, SIZE, { fit: 'fill' })
	.extractChannel(0)
	.raw()
	.toBuffer();

const merged = await sharp(rgb, { raw: { width: SIZE, height: SIZE, channels: 3 } })
	.joinChannel(alpha, { raw: { width: SIZE, height: SIZE, channels: 1 } })
	.png()
	.toBuffer();

const file = path.join(OUT, `merged-${SIZE}.png`);
fs.writeFileSync(file, merged);
console.log(`${file}  ${(merged.length / 1048576).toFixed(2)} MB`);

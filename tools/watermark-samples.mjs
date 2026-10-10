/**
 * 「水塔 OC 补完计划」的成品图处理：
 *   1) 把新图压缩成 WebP 放进 assets-staging/
 *   2) 把 staging 里的企划图统一烧上 sample 水印，输出到 public/gallery/企划-*.webp
 *
 * 幂等：每次都从**未加水印的 staging 源**重新生成，重复跑不会叠水印。
 *
 * 用法：node tools/watermark-samples.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const STAGING = path.join(ROOT, 'assets-staging', '【企划】水塔OC补完计划');
const GALLERY = path.join(ROOT, 'public', 'gallery');
/** 桌面上原始的成品文件夹（只用来取新增的原图） */
const SOURCE = 'C:/Users/water2H2O/Desktop/oc相关/【已归档】【企划】水塔OC补完计划/成品';

/** 不收录的素材 */
const EXCLUDE = ['淼渺_女仆'];

/** 源文件名 → 角色名：画师交付时有些图只写了序号 */
const RENAME = {
	11: '缪伊伊',
};

/** 水印：平铺的斜排 sample，浅色填充 + 深色描边，浅底深底都看得见 */
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

const bytes = (n) => `${(n / 1024).toFixed(0)} KB`;

/** 1) 把源文件夹里还没进 staging 的图压缩进来 */
async function compressNew() {
	if (!fs.existsSync(SOURCE)) {
		console.log('（跳过压缩：桌面源文件夹不可访问）');
		return;
	}
	const sources = fs
		.readdirSync(SOURCE)
		.filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
		.filter((f) => !EXCLUDE.some((bad) => f.includes(bad)));

	for (const file of sources) {
		const base = path.basename(file, path.extname(file));
		const name = RENAME[base] ?? base;
		const dest = path.join(STAGING, `${name}.webp`);
		if (fs.existsSync(dest)) continue;
		const from = path.join(SOURCE, file);
		const before = fs.statSync(from).size;
		await sharp(from)
			.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
			.webp({ quality: 82, effort: 4 })
			.toFile(dest);
		console.log(`  ＋ ${file} → ${name}.webp   ${bytes(before)} → ${bytes(fs.statSync(dest).size)}`);
	}
}

/** 2) staging → public/gallery，顺带烧 sample 水印 */
async function publishWithWatermark() {
	const files = fs.readdirSync(STAGING).filter((f) => f.endsWith('.webp'));
	let count = 0;
	let total = 0;
	for (const file of files.sort()) {
		const from = path.join(STAGING, file);
		const dest = path.join(GALLERY, `企划-${file}`);
		const meta = await sharp(from).metadata();
		await sharp(from)
			.composite([{ input: watermarkTile, tile: true, blend: 'over' }])
			.webp({ quality: 88, effort: 4 })
			.toFile(dest);
		const size = fs.statSync(dest).size;
		total += size;
		count += 1;
		console.log(
			`  ✓ 企划-${file.padEnd(24)} ${String(meta.width).padStart(4)}×${String(meta.height).padEnd(5)} ${bytes(size)}`,
		);
	}
	console.log(`\n共 ${count} 张，合计 ${(total / 1024 / 1024).toFixed(2)} MB`);
}

console.log('=== 1) 压缩新图 ===');
await compressNew();
console.log('\n=== 2) 发布并烧 sample 水印 ===');
await publishWithWatermark();

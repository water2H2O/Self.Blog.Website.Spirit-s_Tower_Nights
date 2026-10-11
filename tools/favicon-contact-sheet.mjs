// 把图标池拼成一张联系表，方便一次看清哪些是双人图
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'public/favicon-oc');
/** 格子边长，可传参：node tools/favicon-contact-sheet.mjs 170 */
const CELL = Number(process.argv[2]) || 96;
const COLS = 8;
const OUT = path.join(ROOT, '..', '.dsh-cache', 'oc', `favicon-sheet-${CELL}.png`);

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
const rows = Math.ceil(files.length / COLS);

const composites = [];
for (let i = 0; i < files.length; i += 1) {
	const col = i % COLS;
	const row = Math.floor(i / COLS);
	const icon = await sharp(path.join(DIR, files[i]))
		.resize(CELL - 22, CELL - 22, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toBuffer();
	const label = Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}">
			<text x="6" y="14" font-family="monospace" font-size="13" fill="#0a6">${String(i + 1).padStart(2, '0')}</text>
		</svg>`,
	);
	composites.push({ input: icon, left: col * CELL + 11, top: row * CELL + 18 });
	composites.push({ input: label, left: col * CELL, top: row * CELL });
}

await sharp({
	create: {
		width: COLS * CELL,
		height: rows * CELL,
		channels: 4,
		background: { r: 244, g: 246, b: 248, alpha: 1 },
	},
})
	.composite(composites)
	.png()
	.toFile(OUT);

console.log(`联系表：${OUT}`);
console.log(`${files.length} 个图标，${COLS} 列 × ${rows} 行，编号与文件对应：\n`);
files.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2, '0')}  ${f}`));

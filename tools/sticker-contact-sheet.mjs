// 把表情包/头像/资料类的小图拼成联系表，找那只「几笔构成的啥子猫」
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const POOL = path.join(ROOT, 'public/gallery');
const OUT = path.join(ROOT, '..', '.dsh-cache', 'oc', 'sticker-sheet.png');
const CELL = Number(process.argv[2]) || 140;
const COLS = 8;

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/gallery-meta.json'), 'utf8')).items;
const WANT = new Set(['表情包', '资料', '标志', '同人']);

const files = Object.entries(meta)
	.filter(([, info]) => WANT.has(info.kind))
	.map(([file]) => file)
	.filter((file) => fs.existsSync(path.join(POOL, file)))
	.sort();

const rows = Math.ceil(files.length / COLS);
const composites = [];
for (let i = 0; i < files.length; i += 1) {
	const col = i % COLS;
	const row = Math.floor(i / COLS);
	const icon = await sharp(path.join(POOL, files[i]))
		.resize(CELL - 26, CELL - 26, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.flatten({ background: { r: 246, g: 248, b: 250 } })
		.png()
		.toBuffer();
	composites.push({ input: icon, left: col * CELL + 13, top: row * CELL + 24 });
	composites.push({
		input: Buffer.from(
			`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}"><text x="6" y="18" font-family="monospace" font-size="15" fill="#0a6">${String(i + 1).padStart(2, '0')}</text></svg>`,
		),
		left: col * CELL,
		top: row * CELL,
	});
}

await sharp({
	create: { width: COLS * CELL, height: rows * CELL, channels: 3, background: { r: 246, g: 248, b: 250 } },
})
	.composite(composites)
	.png()
	.toFile(OUT);

console.log(`联系表：${OUT}（${COLS * CELL}×${rows * CELL}）\n`);
files.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2, '0')}  ${f}`));

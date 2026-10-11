// 列出表情包：尺寸 + 是否带透明通道，挑适合当 favicon 的
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const POOL = path.join(ROOT, 'public/gallery');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/gallery-meta.json'), 'utf8')).items;

const rows = [];
for (const [file, info] of Object.entries(meta)) {
	if (info.kind !== '表情包') continue;
	const full = path.join(POOL, file);
	if (!fs.existsSync(full)) continue;
	const m = await sharp(full).metadata();
	rows.push({
		file,
		character: info.character,
		w: m.width,
		h: m.height,
		alpha: Boolean(m.hasAlpha),
		kb: Math.round(fs.statSync(full).size / 1024),
	});
}

rows.sort((a, b) => a.character.localeCompare(b.character, 'zh') || a.file.localeCompare(b.file));

console.log(`表情包共 ${rows.length} 张\n`);
const byChar = {};
for (const r of rows) {
	byChar[r.character] = byChar[r.character] ?? { total: 0, alpha: 0 };
	byChar[r.character].total += 1;
	if (r.alpha) byChar[r.character].alpha += 1;
}
console.log('按角色统计（透明底 / 总数）：');
for (const [c, v] of Object.entries(byChar)) console.log(`  ${c.padEnd(18)} ${v.alpha} / ${v.total}`);

console.log('\n带透明通道的表情包（前 40 张）：');
for (const r of rows.filter((r) => r.alpha).slice(0, 40)) {
	console.log(`  ${String(r.w).padStart(4)}x${String(r.h).padEnd(5)} ${String(r.kb).padStart(4)} KB  ${r.file}`);
}

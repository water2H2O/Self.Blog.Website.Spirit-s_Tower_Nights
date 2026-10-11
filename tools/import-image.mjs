/**
 * 把档案夹里的新图压进图池并登记。
 *
 * 用法：node tools/import-image.mjs --src=<图片路径> --name=<池内文件名> --char=<角色> --kind=<分类> [--owner=xx]
 * 例：node tools/import-image.mjs --src="C:/.../d69e.png" --name="淼渺__插画-女仆装.webp" --char=淼渺 --kind=插画
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const POOL = path.join(ROOT, 'public', 'gallery');
const META = path.join(ROOT, 'src/data/gallery-meta.json');

const args = {};
for (const a of process.argv.slice(2)) {
	const [k, ...rest] = a.replace(/^--/, '').split('=');
	args[k] = rest.join('=');
}

if (!args.src || !args.name) {
	console.error('缺少 --src 或 --name');
	process.exit(1);
}
if (!args.name.endsWith('.webp')) args.name += '.webp';

const dest = path.join(POOL, args.name);
const before = fs.statSync(args.src).size;

await sharp(args.src)
	.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
	.webp({ quality: 82, effort: 4 })
	.toFile(dest);

const dim = await sharp(dest).metadata();
const size = fs.statSync(dest).size;

const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
meta.items[args.name] = {
	character: args.char ?? '',
	ownership: args.ownership ?? '原创',
	owner: args.owner ?? '',
	kind: args.kind ?? '插画',
	title: args.title ?? '',
	w: dim.width,
	h: dim.height,
};
fs.writeFileSync(META, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

console.log(`✓ ${args.name}`);
console.log(`  压缩：${(before / 1024 / 1024).toFixed(2)} MB → ${(size / 1024).toFixed(0)} KB`);
console.log(`  尺寸：${dim.width}×${dim.height}`);
console.log(`  标注：角色=${args.char} 归属=${meta.items[args.name].ownership} 分类=${meta.items[args.name].kind}`);
console.log(`\n图池现有 ${Object.keys(meta.items).length} 张`);

/**
 * 「水塔 OC 补完计划」成品图的标注同步。
 *
 * 把 public/gallery/企划-*.webp 逐个登记进 src/data/gallery-meta.json：
 * ownership 统一为「企划」，尺寸按实际文件刷新，已有的 character / title 手改值保留。
 *
 * 用法：node tools/sync-project-images.mjs
 * 注意：新增图之后要先跑 tools/watermark-samples.mjs（压缩 + 烧 sample 水印），再跑这个。
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const META = path.join(ROOT, 'src/data/gallery-meta.json');
const GALLERY = path.join(ROOT, 'public', 'gallery');

const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
const files = fs.readdirSync(GALLERY).filter((f) => f.startsWith('企划-') && f.endsWith('.webp')).sort();

let added = 0;
for (const file of files) {
	const info = meta.items[file] ?? {};
	if (!meta.items[file]) added += 1;
	const dim = await sharp(path.join(GALLERY, file)).metadata();
	meta.items[file] = {
		character: info.character ?? path.basename(file, '.webp').replace(/^企划-/, ''),
		ownership: '企划',
		owner: info.owner ?? '',
		kind: info.kind ?? '设定',
		title: info.title ?? '',
		w: dim.width,
		h: dim.height,
	};
	console.log(
		`  ${file.padEnd(26)} ${String(dim.width).padStart(4)}×${String(dim.height).padEnd(5)} 角色=${meta.items[file].character}`,
	);
}

// 顺手清掉已经被删掉的图
let removed = 0;
for (const file of Object.keys(meta.items)) {
	if (file.startsWith('企划-') && !files.includes(file)) {
		delete meta.items[file];
		removed += 1;
	}
}

fs.writeFileSync(META, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

const tally = {};
for (const item of Object.values(meta.items)) tally[item.ownership] = (tally[item.ownership] ?? 0) + 1;
console.log(
	`\n企划图 ${files.length} 张（新增登记 ${added}，移除失效 ${removed}）\n图池共 ${Object.keys(meta.items).length} 张：${Object.entries(
		tally,
	)
		.map(([k, v]) => `${k} ${v}`)
		.join(' / ')}`,
);

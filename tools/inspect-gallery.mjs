// 排查：Aurelith 的图有哪几张、指针类里有什么、名字带猫/狐的
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const POOL = path.join(ROOT, 'public/gallery');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/gallery-meta.json'), 'utf8')).items;

const rows = Object.entries(meta).map(([file, info]) => ({ file, ...info }));
const show = (title, list) => {
	console.log(`\n=== ${title}（${list.length}）===`);
	for (const r of list) {
		console.log(
			`  [${String(r.kind).padEnd(4)}] ${String(r.ownership).padEnd(4)} ${String(r.character).padEnd(20)} ${r.w}x${r.h}  ${r.file}`,
		);
	}
};

show('角色是 Aurelith PrismWing 的', rows.filter((r) => r.character === 'Aurelith PrismWing'));
show('分类是「指针」的', rows.filter((r) => r.kind === '指针'));
show('文件名或角色名含 猫/狐/喵/咪', rows.filter((r) => /猫|狐|喵|咪/.test(`${r.file}${r.character}`)));

console.log('\n=== 图池里所有 kind 取值 ===');
const kinds = {};
for (const r of rows) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
for (const [k, v] of Object.entries(kinds)) console.log(`  ${k.padEnd(8)} ${v}`);

console.log('\n=== public/gallery 里存在但清单里没有的图（未被登记）===');
for (const f of fs.readdirSync(POOL).filter((f) => f.endsWith('.webp'))) {
	if (!meta[f]) console.log(`  ${f}`);
}

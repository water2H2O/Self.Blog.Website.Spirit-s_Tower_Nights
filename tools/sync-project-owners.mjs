/**
 * 补齐「企划」图里联动角色的设主。
 * 设主以角色条目为准（characters 集合的 owner 字段），只在图池里为空时填。
 * 另外补上画师交付时只写序号的那张（缪伊伊，设主与角色同名）。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const META = path.join(ROOT, 'src/data/gallery-meta.json');
const CHARS = path.join(ROOT, 'src/content/characters');

/** 角色名 → 设主（从角色条目读） */
const owners = new Map();
for (const file of fs.readdirSync(CHARS).filter((f) => f.endsWith('.md'))) {
	const fm = fs.readFileSync(path.join(CHARS, file), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
	const get = (k) => (fm.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1] ?? '').replace(/^['"]|['"]$/g, '');
	if (get('ownership') === '联动' && get('owner')) owners.set(get('name'), get('owner'));
}

/**
 * 不在世界观里的企划角色，设主单独记（据作者说明）。
 * 除香菇外，其余几位的设主名与角色同名。
 */
const EXTRA_OWNERS = {
	缪伊伊: '缪伊伊',
	北音: '北音',
	温雪: '温雪',
	苯胺: '苯胺',
	霜霖星: '霜霖星',
	香菇: '白血尘',
	鹤戾: '鹤戾',
};

const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
let filled = 0;

for (const [file, item] of Object.entries(meta.items)) {
	if (item.ownership !== '企划') continue;
	const known = owners.get(item.character) ?? EXTRA_OWNERS[item.character];
	if (!known) continue;
	if (item.owner === known) continue;
	console.log(`  ${file.padEnd(26)} ${item.character.padEnd(18)} 设主 → ${known}${item.owner ? `（原为 ${item.owner}）` : ''}`);
	item.owner = known;
	filled += 1;
}

fs.writeFileSync(META, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
console.log(`\n补了 ${filled} 条设主`);

console.log('\n企划 14 张的最终标注：');
for (const [file, item] of Object.entries(meta.items).sort()) {
	if (item.ownership !== '企划') continue;
	console.log(`  ${file.padEnd(26)} 角色 ${item.character.padEnd(18)} 设主 ${item.owner || '（未知）'}`);
}

/** 构建后检查：画廊只在抽中时挂载图片，仍指向字节不变的原图。 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
	e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const meta = JSON.parse(readFileSync('src/data/gallery-meta.json', 'utf8')).items;
const attr = (s, name) => s.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
let walls = 0;
let images = 0;
const checked = new Set();
for (const file of walk('dist').filter((f) => f.endsWith('.html'))) {
	const html = readFileSync(file, 'utf8');
	if (!html.includes('class="wall-wrap"')) continue;
	walls++;
	checked.add(file.replaceAll('\\', '/'));
	assert.match(html, /<noscript>[\s\S]*?<a href="\/gallery\//, `${file}: no-JS 原图入口`);
	assert.match(html, /<dialog\b[^>]*class="lightbox"[^>]*aria-label=/, `${file}: 有名称的原生灯箱`);
	assert.doesNotMatch(html, /<img[^>]*\bsrc=""/, `${file}: 不发空 src 请求`);
	const tiles = [...html.matchAll(/<a\b([^>]*\bclass="tile hidden"[^>]*)>([\s\S]*?)<\/a>/g)];
	assert.ok(tiles.length, `${file}: 有原图链接`);
	for (const [, anchor, inner] of tiles) {
		const template = inner.match(/<template\b[^>]*>([\s\S]*?)<\/template>/);
		assert.ok(template, `${file}: 抽样前图片必须在惰性模板中`);
		assert.doesNotMatch(inner.replace(template[0], ''), /<img\b/, `${file}: 不提前挂载图片`);
		const img = template[1].match(/<img\b[^>]*>/)?.[0];
		assert.ok(img, `${file}: 模板包含图片`);
		const url = attr(img, 'src');
		assert.equal(url, attr(anchor, 'href'), `${file}: 缩略展示与另存/灯箱共用原图`);
		assert.equal(url, attr(anchor, 'data-url'), `${file}: 灯箱仍指向原图`);
		assert.match(url, /^\/gallery\/[^?]+\.webp$/, `${file}: 不改地址/不加缩图变换`);
		const filename = decodeURIComponent(url.slice('/gallery/'.length));
		const info = meta[filename];
		assert.ok(info, `${file}: 有尺寸标注 ${filename}`);
		assert.equal(Number(attr(img, 'width')), info.w, `${filename}: 原始宽度`);
		assert.equal(Number(attr(img, 'height')), info.h, `${filename}: 原始高度`);
		assert.equal(attr(img, 'loading'), 'lazy');
		assert.equal(attr(img, 'decoding'), 'async');
		assert.doesNotMatch(img, /\bsrcset=/, `${file}: 不切换为降质变体`);
		images++;
	}
}
assert.ok(checked.has('dist/worldview/gallery/index.html'), '覆盖画廊页');
assert.ok(checked.has('dist/project/oc/index.html'), '覆盖补完计划页');
assert.ok([...checked].some((file) => file.startsWith('dist/worldview/characters/')), '覆盖角色页');
let originals = 0;
for (const file of readdirSync('public/gallery').filter((f) => f.endsWith('.webp'))) {
	assert.equal(digest(readFileSync(join('public/gallery', file))), digest(readFileSync(join('dist/gallery', file))), `${file}: 构建不得改写画作字节`);
	originals++;
}
console.log(`Gallery loading passed: ${walls} pages / ${images} inert image templates; ${originals} originals copied byte-for-byte; dimensions, original links, no-JS fallback and dialog verified.`);

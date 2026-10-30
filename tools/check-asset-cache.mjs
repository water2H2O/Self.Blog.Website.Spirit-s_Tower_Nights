/** 构建后检查静态缓存边界，避免给固定网址套上不可失效的长缓存。 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync('public/_headers', 'utf8');
assert.equal(readFileSync('dist/_headers', 'utf8'), source, '_headers 必须进入部署产物');
const rules = [];
for (const raw of source.split(/\r?\n/)) {
	if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
	if (!/^\s/.test(raw)) rules.push({ path: raw.trim(), headers: {} });
	else {
		const [, key, value] = raw.match(/^\s+([^:]+):\s*(.+)$/) ?? [];
		assert.ok(key && rules.length, `非法 header 行：${raw}`);
		rules.at(-1).headers[key.toLowerCase()] = value;
	}
}
const cache = (path) => rules.filter((r) => {
	const escaped = r.path.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
	return new RegExp(`^${escaped}$`).test(path);
}).map((r) => r.headers['cache-control']).filter(Boolean).join(', ');
const immutable = 'public, max-age=31536000, immutable';
const revalidate = 'public, max-age=0, must-revalidate';
assert.equal(cache('/_astro/Header.example.css'), immutable);
assert.equal(cache('/_astro/fonts/example.woff'), immutable);
for (const path of ['/gallery/更新画作.webp', '/audio/song.mp3', '/search-index.json', '/agree-probe.txt']) {
	assert.equal(cache(path), revalidate, `${path}: 固定地址必须验证新版本`);
}
for (const path of ['/', '/blog/log/', '/404.html', '/teapot/', '/favicon.png', '/downloads/example.zip']) {
	assert.equal(cache(path), '', `${path}: 不覆盖 HTML、Worker 和固定地址默认缓存`);
}
assert.deepEqual(rules.filter((r) => /immutable/.test(r.headers['cache-control'] ?? '')).map((r) => r.path), ['/_astro/*']);
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const assets = walk('dist/_astro');
assert.ok(assets.length);
for (const file of assets) {
	const filename = file.split(/[\\/]/).at(-1);
	assert.ok(/\.[a-zA-Z0-9_-]{8,}(?:_[a-zA-Z0-9_-]+)?\.[a-z0-9]+$/.test(filename) || /^[a-f0-9]{16}\.woff2?$/.test(filename), `${file}: 长缓存只接受哈希命名产物`);
}
console.log(`Asset cache passed: ${assets.length} fingerprinted assets eligible for immutable caching; fixed URLs revalidate; deployment _headers preserved.`);

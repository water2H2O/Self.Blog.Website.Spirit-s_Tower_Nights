import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blogSlugs } from '../src/lib/blog-slug.ts';
import { blogRedirects } from './blog-redirects.mjs';

// Node 24 can load the shared TypeScript validator directly. Run after dev.cmd build.
const post = (id, urlSlug) => ({ id, data: { urlSlug } });
assert.equal(blogSlugs([post('file-name', 'topic')]).get('file-name'), 'topic');
assert.equal(blogSlugs([post('renamed-file', 'topic')]).get('renamed-file'), 'topic');
assert.throws(() => blogSlugs([post('one', 'topic'), post('two', 'topic')]), /重复/);
for (const slug of [undefined, '', 'a', 'Upper', 'two--words', 'three-word-title', '-topic', 'topic-', '../topic', '中文', '123', 'x'.repeat(25), 'index', 'coflxh']) {
  assert.throws(() => blogSlugs([post('bad', slug)]), undefined, `Reject ${slug}`);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const read = path => readFileSync(join(dist, path), 'utf8');
const list = read('blog/index.html');
const rss = read('rss.xml');
const search = JSON.parse(read('search-index.json')).items;
const sitemap = read('sitemap-0.xml');
const about = read('about/index.html');
const expected = {
  'a-fish-rearranges-the-about-page': 'about-page',
  'ai-dont-write-scripts': 'scripts',
  birthday2026: 'birthday',
  'dsh-431-cookie-grave': 'cookies',
  'image-api-two-traps': 'image-api',
  'model-probe-quizzes': 'models',
  'site-changelog': 'log',
  'thinking-slider-compatibility': 'thinking',
};
let articles = 0;
for (const name of readdirSync(join(root, 'src/content/blog')).filter(name => /\.mdx?$/.test(name))) {
  const source = readFileSync(join(root, 'src/content/blog', name), 'utf8');
  const fm = source.split('---')[1];
  if (/^draft:\s*true\s*$/m.test(fm)) continue;
  const id = name.replace(/\.mdx?$/, '');
  const slug = fm.match(/^urlSlug:\s*['"]?([^'"\r\n]+)/m)?.[1].trim();
  assert.ok(slug, `${name} needs urlSlug`);
  if (expected[id]) assert.equal(slug, expected[id], 'Published semantic URL stays stable');
  const path = `/blog/${slug}/`;
  const url = `https://water2h2o.com${path}`;
  const html = read(`blog/${slug}/index.html`);
  const canonical = html.match(/<link\b[^>]*rel="canonical"[^>]*>/)?.[0];
  assert.ok(canonical?.includes(url), `Canonical ${url}`);
  assert.ok(html.includes(`文章id: ${id}`), 'Displayed source ID unchanged');
  assert.ok(list.includes(`href="${path}"`), 'List uses semantic URL');
  assert.ok(rss.includes(url) || rss.includes(path), 'RSS uses semantic URL');
  assert.ok(search.some(item => item.url === path), 'Search uses semantic URL');
  assert.ok(sitemap.includes(`<loc>${url}</loc>`), 'Sitemap uses semantic URL');
  articles++;
}
assert.ok(articles >= Object.keys(expected).length);
assert.ok(about.includes('href="/blog/log/"'), 'About points to semantic changelog URL');
for (const [from, to] of Object.entries(blogRedirects)) {
  const [path, hash] = to.split('#');
  const target = read(`${path.replace(/^\//, '')}index.html`);
  if (hash) assert.ok(target.includes(`id="${hash}"`), `Existing section ${to}`);
  assert.ok(!blogRedirects[path], `No redirect chain: ${from}`);
  const fallback = read(`${from.replace(/^\//, '')}index.html`);
  assert.match(fallback, /http-equiv="refresh"/i, `Preview redirect ${from}`);
  assert.ok(fallback.includes(to), `Preview target ${from}`);
  assert.ok(!sitemap.includes(`<loc>https://water2h2o.com${from}</loc>`), `Legacy URL excluded from sitemap: ${from}`);
  assert.ok(!list.includes(`href="${from}"`), `No stale list link: ${from}`);
  assert.ok(!search.some(item => item.url === from), `No stale search URL: ${from}`);
}
assert.equal(read('_redirects'), readFileSync(join(root, 'public/_redirects'), 'utf8'));
const cloudflareRules = read('_redirects').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => line.split(/\s+/));
assert.ok(cloudflareRules.every(rule => rule.length === 3 && rule[2] === '301'), 'All legacy rules are HTTP 301');
assert.deepEqual(Object.fromEntries(cloudflareRules.map(([from, to]) => [from, to])), blogRedirects, 'Cloudflare and preview redirects match');
console.log(`Blog routes passed: ${articles} semantic URLs; canonical/list/RSS/search/sitemap/about consistent; ${Object.keys(blogRedirects).length} legacy redirects and anchors valid; invalid and duplicate slugs rejected.`);

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run after dev.cmd build. Check every rendered article, excluding index/redirect pages.
const root = fileURLToPath(new URL('../', import.meta.url));
const sourceDir = join(root, 'src/content/blog');
const outputDir = join(root, 'dist/blog');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});
const sources = new Map(walk(sourceDir).filter(path => /\.mdx?$/.test(path)).map(path => [basename(path), path]));
const seen = new Set();
let explicitUpdates = 0;
let fallbackDates = 0;
for (const path of walk(outputDir).filter(path => path.endsWith('.html'))) {
  const html = readFileSync(path, 'utf8');
  const header = html.match(/<div\b[^>]*class="title"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  if (!header) continue;
  assert.match(header, /^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*<h2\b[^>]*class="date"[^>]*>最后更新于\s*<time\b[^>]*>[\s\S]*?<\/time><\/h2>\s*<p\b[^>]*class="article-id"[^>]*>文章id: [^<]+<\/p>\s*$/, path);
  assert.equal((header.match(/<time\b/g) ?? []).length, 1, `One header date: ${path}`);
  const articleId = header.match(/class="article-id"[^>]*>文章id: ([^<]+)<\/p>/)[1];
  const name = [...sources.keys()].find(name => name.replace(/\.mdx?$/i, '') === articleId);
  assert.ok(name, `ID derived from source basename: ${articleId}`);
  assert.ok(sources.has(name), `Real source filename: ${name}`);
  assert.ok(!seen.has(name), `One canonical article per source: ${name}`);
  seen.add(name);
  const frontmatter = readFileSync(sources.get(name), 'utf8').split('---')[1];
  const dateField = (field) => frontmatter.match(new RegExp(`^${field}:\\s*['\"]?([^'\"\\r\\n]+)`, 'm'))?.[1].trim();
  const updated = dateField('updatedDate');
  const expected = new Date(updated ?? dateField('pubDate')).toISOString();
  assert.equal(header.match(/datetime="([^"]+)"/)[1], expected, `Correct latest/fallback date: ${name}`);
  if (updated) explicitUpdates++; else fallbackDates++;
}
assert.ok(seen.size > 0, 'Build articles before running this check');
for (const [name, path] of sources) {
  const frontmatter = readFileSync(path, 'utf8').split('---')[1];
  if (!/^draft:\s*true\s*$/m.test(frontmatter)) assert.ok(seen.has(name), `Published article checked: ${name}`);
}
const index = readFileSync(join(outputDir, 'index.html'), 'utf8');
const birthdayCard = index.match(/<a\b[^>]*href="\/blog\/[^"/]+\/"[^>]*>\s*(<img\b[^>]*blog-birthday-2026[^>]*>)/)?.[1];
assert.ok(birthdayCard, 'Birthday list cover rendered');
assert.match(birthdayCard, /width="720"/);
assert.match(birthdayCard, /height="480"/); // 3:2 leaves enough room for the hat and chin.
const list = index.match(/<section\b[^>]*>\s*<ul\b[^>]*>([\s\S]*?)<\/ul>/)?.[1];
assert.ok(list, 'Blog list exists');
const cards = [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(match => match[1]);
assert.equal(cards.length, seen.size, 'Every published article listed once');
assert.match(cards[0], /站点改动记录<\/h4>/, 'Changelog is the cover card');
assert.match(cards[0], /blog-site-changelog/, 'Changelog uses its dedicated new illustration');
const changelogDate = readFileSync(sources.get('site-changelog.md'), 'utf8').match(/^updatedDate:\s*['"]?([^'"\r\n]+)/m)?.[1].trim();
assert.equal(cards[0].match(/datetime="([^"]+)"/)[1], new Date(changelogDate).toISOString(), 'Cover date reflects last update');
const remainingDates = cards.slice(1).map(card => new Date(card.match(/datetime="([^"]+)"/)[1]).valueOf());
assert.ok(remainingDates.every((date, i) => i === 0 || remainingDates[i - 1] >= date), 'Other articles stay newest first');
console.log(`Blog headers passed: ${seen.size} articles, ${explicitUpdates} updated dates, ${fallbackDates} publication fallbacks; header, birthday crop, pinned changelog cover and date ordering verified.`);

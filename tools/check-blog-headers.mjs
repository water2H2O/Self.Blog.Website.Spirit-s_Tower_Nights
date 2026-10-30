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
  assert.match(header, /^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*<p\b[^>]*class="date"[^>]*>最后更新于\s*<time\b[^>]*>[\s\S]*?<\/time><\/p>\s*<p\b[^>]*class="source-filename"[^>]*>[^<]+<\/p>\s*<hr\b/, path);
  assert.equal((header.match(/<time\b/g) ?? []).length, 1, `One header date: ${path}`);
  const name = header.match(/class="source-filename"[^>]*>([^<]+)<\/p>/)[1];
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
console.log(`Blog headers passed: ${seen.size} articles, ${explicitUpdates} updated dates, ${fallbackDates} publication fallbacks; title/date/source filename order verified.`);

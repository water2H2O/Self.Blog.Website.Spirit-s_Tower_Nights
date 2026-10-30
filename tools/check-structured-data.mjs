import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { BILIBILI_URL, GITHUB_URL, SITE_AUTHOR, SITE_DESCRIPTION, SITE_TITLE, X_URL } from '../src/consts.ts';
import { BLOG_SLUG_PATTERN, BLOG_SLUG_MIN, BLOG_SLUG_MAX } from '../src/lib/blog-slug.ts';

// Run after pnpm build (Node >=22.23.4 per .node-version). No files or network requests are written.
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const readSource = path => readFileSync(join(root, path), 'utf8');
const readOutput = path => readFileSync(join(dist, path), 'utf8');
const site = readSource('astro.config.mjs').match(/\bsite:\s*['"]([^'"]+)['"]/)?.[1];
assert.ok(site, 'Read the canonical site origin from Astro config');
const absolute = path => new URL(path, site).href;
const personId = absolute('/#person');
const aboutURL = absolute('/about/');
const decode = text => text.replace(/&(?:amp|quot|apos|lt|gt|#39|#(\d+)|#x([a-f\d]+));/gi, (entity, dec, hex) => {
  if (dec || hex) return String.fromCodePoint(parseInt(dec ?? hex, hex ? 16 : 10));
  return { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>' }[entity.toLowerCase()];
});
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(([, key, , value]) => [key, decode(value)]));
const meta = (html, name) => {
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => attrs(match[0])).filter(tag => tag.property === name || tag.name === name);
  assert.equal(tags.length, 1, `One ${name} meta tag`);
  return tags[0].content;
};
const canonical = html => {
  const tags = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => attrs(match[0])).filter(tag => tag.rel === 'canonical');
  assert.equal(tags.length, 1, 'One canonical link');
  return tags[0].href;
};
const jsonLd = (html, label) => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(match => attrs(match[1]).type === 'application/ld+json');
  assert.equal(scripts.length, 1, `${label}: exactly one JSON-LD script`);
  assert.ok(html.indexOf(scripts[0][0]) < html.indexOf('</head>'), `${label}: JSON-LD stays in head`);
  assert.ok(!scripts[0][2].includes('<'), `${label}: no raw < in JSON-LD`);
  const data = JSON.parse(scripts[0][2]);
  assert.equal(data['@context'], 'https://schema.org', label);
  return data;
};
const safeURL = (value, label, local = true) => {
  assert.equal(typeof value, 'string', label);
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', label);
  assert.equal(url.username + url.password + url.search, '', label);
  if (local) assert.equal(url.origin, new URL(site).origin, label);
  return url;
};
const noInventedClaims = data => {
  for (const [key, value] of Object.entries(data)) {
    assert.ok(!['potentialAction', 'email', 'telephone', 'contactPoint', 'address'].includes(key), `Do not invent ${key}`);
    if (key === '@type') assert.notEqual(value, 'SearchAction');
    if (value && typeof value === 'object') noInventedClaims(value);
  }
};
const identity = person => {
  assert.equal(person['@type'], 'Person');
  assert.equal(person['@id'], personId);
  assert.equal(person.name, SITE_AUTHOR);
  assert.equal(person.url, aboutURL);
};

// Exercise the actual BaseHead serializer with hostile content, without editing any content files.
const headSource = readSource('src/components/BaseHead.astro');
const serializer = headSource.match(/^const serializedStructuredData = (.+);$/m)?.[1];
assert.ok(serializer, 'BaseHead exposes its single serialization expression');
assert.match(headSource, /<script\b[^>]*type="application\/ld\+json"[^>]*is:inline[^>]*set:html=\{serializedStructuredData\}/);
const hostile = { headline: '</script><script>alert("x")</script><!-- & <tag> 中文 \u2028 \u2029', nested: { text: 'a < b' } };
const serialized = runInNewContext(serializer, { structuredData: hostile });
assert.ok(!serialized.includes('<'), 'Serializer escapes every raw <');
assert.ok(serialized.includes('\\u003c/script>'), 'Closing script sequence is escaped');
assert.deepEqual(JSON.parse(serialized), hostile, 'Escaping preserves the exact JSON values');
assert.equal(runInNewContext(serializer, { structuredData: undefined }), undefined, 'No empty JSON-LD on ordinary pages');

const home = readOutput('index.html');
assert.equal(canonical(home), absolute('/'));
assert.equal(meta(home, 'og:url'), canonical(home));
assert.equal(meta(home, 'og:type'), 'website');
const homeData = jsonLd(home, 'home');
noInventedClaims(homeData);
assert.equal(homeData['@graph'].length, 2, 'Only the verified WebSite and Person entities');
const website = homeData['@graph'].find(item => item['@type'] === 'WebSite');
const person = homeData['@graph'].find(item => item['@type'] === 'Person');
assert.ok(website && person);
assert.equal(website['@id'], absolute('/#website'));
assert.equal(website.url, canonical(home));
assert.equal(website.name, SITE_TITLE);
assert.equal(website.description, SITE_DESCRIPTION);
assert.equal(website.inLanguage, 'zh-CN');
assert.deepEqual(website.publisher, { '@id': personId });
identity(person);
assert.deepEqual(person.sameAs, [GITHUB_URL, BILIBILI_URL, X_URL]);
for (const url of person.sameAs) safeURL(url, 'Verified social profile', false);

const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});
const field = (fm, name) => {
  const value = fm.match(new RegExp(`^${name}:\\s*(.*?)\\s*$`, 'm'))?.[1];
  if (value === undefined) return undefined;
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  return value;
};
let articles = 0;
let covers = 0;
let publicationFallbacks = 0;
let omittedAuthors = 0;
const seen = new Set();
for (const source of walk(join(root, 'src/content/blog')).filter(path => /\.mdx?$/.test(path))) {
  const fm = readFileSync(source, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  assert.ok(fm, source);
  if (field(fm, 'draft') === 'true') continue;
  const slug = field(fm, 'urlSlug');
  assert.ok(slug && slug.length >= BLOG_SLUG_MIN && slug.length <= BLOG_SLUG_MAX && BLOG_SLUG_PATTERN.test(slug), `Valid semantic slug: ${source}`);
  assert.ok(!seen.has(slug), `One article per semantic URL: ${slug}`);
  seen.add(slug);
  const html = readOutput(`blog/${slug}/index.html`);
  const url = absolute(`/blog/${slug}/`);
  assert.equal(canonical(html), url, slug);
  assert.equal(meta(html, 'og:url'), url, slug);
  assert.equal(meta(html, 'og:type'), 'article', slug);
  safeURL(url, `Canonical ${slug}`);
  const data = jsonLd(html, slug);
  noInventedClaims(data);
  assert.equal(data['@type'], 'BlogPosting', slug);
  assert.equal(data['@id'], `${url}#blogposting`, slug);
  assert.equal(data.url, url, slug);
  assert.equal(data.mainEntityOfPage, url, slug);
  assert.equal(data.headline, field(fm, 'title'), slug);
  assert.equal(data.description, field(fm, 'description'), slug);
  assert.equal(data.inLanguage, 'zh-CN', slug);
  identity(data.publisher);
  // The about-page essay explicitly credits GPT-6.1-sol in its source. Do not label a model as Person.
  if (basename(source) === 'a-fish-rearranges-the-about-page.md') {
    assert.ok(!Object.hasOwn(data, 'author'), 'AI-written essay does not claim a human byline');
    omittedAuthors++;
  } else {
    identity(data.author);
  }
  const published = new Date(field(fm, 'pubDate')).toISOString();
  const updated = field(fm, 'updatedDate');
  const modified = new Date(updated ?? field(fm, 'pubDate')).toISOString();
  assert.equal(data.datePublished, published, `${slug}: original publication date`);
  assert.equal(data.dateModified, modified, `${slug}: explicit update or publication fallback`);
  assert.ok(Date.parse(modified) >= Date.parse(published), `${slug}: update does not precede publication`);
  if (!updated) publicationFallbacks++;
  const cover = field(fm, 'heroImage');
  if (cover) {
    const imageURL = safeURL(data.image, `${slug}: absolute cover`);
    assert.equal(data.image, meta(html, 'og:image'), `${slug}: share and structured cover agree`);
    const stem = basename(cover).replace(/\.[^.]+$/, '');
    assert.ok(decodeURIComponent(imageURL.pathname).includes(stem), `${slug}: real source cover, not default`);
    const imagePath = resolve(dist, `.${decodeURIComponent(imageURL.pathname)}`);
    assert.ok(imagePath.startsWith(`${dist}${sep}`) && existsSync(imagePath), `${slug}: built cover exists`);
    covers++;
  } else {
    assert.ok(!Object.hasOwn(data, 'image'), `${slug}: do not invent an article cover`);
    assert.equal(meta(html, 'og:image'), absolute('/og-default.png'), `${slug}: generic share image stays a fallback`);
  }
  articles++;
}
assert.ok(articles >= 8, 'Check every current published essay (currently eight)');
assert.equal(omittedAuthors, 1, 'Known AI-written essay special case covered');
assert.ok(publicationFallbacks > 0, 'Publication-date fallback covered');
assert.ok(covers > 0 && covers < articles, 'Both cover/no-cover cases covered');
const index = readOutput('blog/index.html');
assert.equal(meta(index, 'og:type'), 'website', 'Blog index is not an article');
assert.ok(!/type="application\/ld\+json"/.test(index), 'No article JSON-LD leaks into the index');
console.log(`Structured data passed: homepage WebSite/Person; all ${articles} essays; ${covers} real covers, ${publicationFallbacks} date fallbacks, ${omittedAuthors} explicit author omission; canonical URLs, dates, OG types and hostile-script escaping verified.`);

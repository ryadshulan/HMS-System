const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
const robots = fs.readFileSync(path.join(rootDir, 'public', 'robots.txt'), 'utf8');
const sitemap = fs.readFileSync(path.join(rootDir, 'public', 'sitemap.xml'), 'utf8');
const llms = fs.readFileSync(path.join(rootDir, 'public', 'llms.txt'), 'utf8');

assert.match(indexHtml, /<link rel="canonical" href="https:\/\/hmstar\.net\/">/);
assert.match(indexHtml, /<meta property="og:url" content="https:\/\/hmstar\.net\/">/);
assert.match(indexHtml, /شحن من الصين إلى اليمن/);
assert.match(indexHtml, /"@type": "WebSite"/);
assert.match(indexHtml, /"@type": \["Organization", "LocalBusiness"\]/);
assert.match(robots, /Sitemap: https:\/\/hmstar\.net\/sitemap\.xml/);
assert.match(sitemap, /<loc>https:\/\/hmstar\.net\/<\/loc>/);
assert.match(llms, /https:\/\/hmstar\.net\//);
assert.doesNotMatch(indexHtml, /hms-system-8u0x\.onrender\.com/);
assert.doesNotMatch(robots, /hms-system-8u0x\.onrender\.com/);
assert.doesNotMatch(sitemap, /hms-system-8u0x\.onrender\.com/);

const jsonLdMatch = indexHtml.match(
  /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/
);
assert.ok(jsonLdMatch, 'Structured data block is missing.');
assert.doesNotThrow(() => JSON.parse(jsonLdMatch[1]));

console.log('SEO unit test passed.');

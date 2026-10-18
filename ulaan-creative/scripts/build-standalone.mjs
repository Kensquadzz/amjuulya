// Builds ulaan-creative.html: a single self-contained snapshot of the public homepage
// (CSS, JS and mascot inlined) rendered from the published CMS content when DATABASE_URL
// is set, otherwise from the built-in defaults. Usage: `npm run build:html`.
// The contact form needs the deployed /api/contact endpoint, so in this offline file it
// reports that nothing was sent. Fonts load from Google Fonts.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './load-env.mjs';
import { renderHome } from '../lib/render.js';
import { DEFAULT_CONTENT } from '../lib/defaults.js';
import { dbConfigured, closePool } from '../lib/db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, 'public', p), 'utf8');

let data = { content: structuredClone(DEFAULT_CONTENT), projects: [], influencers: [] };
if (dbConfigured()) {
  const c = await import('../lib/content.js');
  data = { content: await c.getPublishedContent(), projects: await c.getPublishedProjects(), influencers: await c.getPublishedInfluencers() };
  await closePool();
}

let html = renderHome({ ...data, site: process.env.SITE_URL || 'https://ulaancreative.mn', nonce: 'standalone' });
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`build-standalone: not found → ${from.slice(0, 60)}`);
  html = html.split(from).join(to);
};
swap('<link rel="stylesheet" href="/assets/css/styles.css">', `<style>\n${read('assets/css/styles.css')}\n</style>`);
html = html.replace(/<script src="\/assets\/vendor\/[^"]+" defer><\/script>\n?/g, '');
const vendor = ['gsap.min.js', 'ScrollTrigger.min.js', 'lenis.min.js'].map((f) => read(`assets/vendor/${f}`)).join('\n');
swap('<script src="/assets/js/main.js" defer></script>', `<script>\n${vendor}\n</script>\n<script>\n${read('assets/js/main.js')}\n</script>`);
swap('href="/assets/img/favicon.svg"', `href="data:image/svg+xml;base64,${Buffer.from(read('assets/img/favicon.svg')).toString('base64')}"`);

const out = path.join(root, 'ulaan-creative.html');
writeFileSync(out, html);
console.log(`Wrote ${path.relative(process.cwd(), out)} (${Math.round(html.length / 1024)} KB)`);

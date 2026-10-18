// Builds ulaan-creative.html: a single self-contained snapshot of the public homepage
// (CSS, JS and mascot inlined) rendered from the published CMS content when DATABASE_URL
// is set, otherwise from the built-in defaults. Usage: `npm run build:html`.
// The contact form needs the deployed /api/contact endpoint, so in this offline file it
// reports that nothing was sent. Fonts are self-hosted and inlined.
// `npm run build:html -- --demo` writes ulaan-creative-influencers-demo.html instead: the same page
// with clearly labelled DEMO creators (no photos, no real people) to preview the influencer browser.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './load-env.mjs';
import { renderHome } from '../lib/render.js';
import { DEFAULT_CONTENT } from '../lib/defaults.js';
import { dbConfigured, closePool } from '../lib/db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, 'public', p), 'utf8');

const demo = process.argv.includes('--demo');
let data = { content: structuredClone(DEFAULT_CONTENT), projects: [], influencers: [], influencerCategories: [] };
if (demo) {
  const cats = ['Lifestyle & Fashion', 'Fitness & Dance', 'Food & Travel', 'Tech & Education', 'Entertainment', 'Business & Expert', 'Other'].map((name, i) => ({ id: `demo-cat-${i}`, name }));
  const plan = [[0], [0, 1], [1], [2], [2, 0], [3], [4], [4, 1], [5], []];
  const followers = [8500, 23000, 47000, 72000, 150000, 610000, 12000, 330000, 95000, null];
  data.influencerCategories = cats;
  data.influencers = plan.map((cs, i) => ({
    id: `demo-${i + 1}`, name: `DEMO Creator ${String(i + 1).padStart(2, '0')}`, photo: null, categories: cs.map((k) => cats[k]),
    instagram: 'https://instagram.com/', tiktok: i % 2 ? 'https://www.tiktok.com/' : '', youtube: '', facebook: '',
    followers: followers[i], engagement: '', featured: i === 4, bio: 'DEMO өгөгдөл — бодит influencer биш. Тоонууд зөвхөн дизайныг шалгах зориулалттай.',
  }));
} else if (dbConfigured()) {
  const c = await import('../lib/content.js');
  data = { content: await c.getPublishedContent(), projects: await c.getPublishedProjects(), influencers: await c.getPublishedInfluencers(), influencerCategories: await c.getInfluencerCategories() };
  await closePool();
}

let html = renderHome({ ...data, site: process.env.SITE_URL || 'https://ulaancreative.mn', nonce: 'standalone', preview: demo ? 'DEMO — жишээ өгөгдөл, бодит хүн биш' : undefined });
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`build-standalone: not found → ${from.slice(0, 60)}`);
  html = html.split(from).join(to);
};
swap('<link rel="stylesheet" href="/assets/css/styles.css">', `<style>\n${read('assets/css/styles.css')}\n</style>`);
html = html.replace(/<script src="\/assets\/vendor\/[^"]+" defer><\/script>\n?/g, '');
const vendor = ['gsap.min.js', 'ScrollTrigger.min.js', 'lenis.min.js'].map((f) => read(`assets/vendor/${f}`)).join('\n');
swap('<script src="/assets/js/main.js" defer></script>', `<script>\n${vendor}\n</script>\n<script>\n${read('assets/js/main.js')}\n</script>`);
const dataUri = (p, mime) => `data:${mime};base64,${readFileSync(path.join(root, 'public', p)).toString('base64')}`;
// fonts: inline the woff2 files referenced by fonts.css
const fontsCss = read('assets/css/fonts.css').replace(/url\(\/assets\/fonts\/([^)]+)\)/g, (_, f) => `url(${dataUri(`assets/fonts/${f}`, 'font/woff2')})`);
swap('<link rel="stylesheet" href="/assets/css/fonts.css">', `<style>\n${fontsCss}\n</style>`);
html = html.replace(/<link rel="preload" href="\/assets\/fonts\/[^"]+" as="font"[^>]*>\n?/g, '');
swap('href="/assets/img/favicon-32.png"', `href="${dataUri('assets/img/favicon-32.png', 'image/png')}"`);
html = html.split('/assets/img/ulaan-bomb-sm.webp').join(dataUri('assets/img/ulaan-bomb-sm.webp', 'image/webp'));
html = html.split('/assets/img/ulaan-bomb.webp').join(dataUri('assets/img/ulaan-bomb.webp', 'image/webp'));
for (const v of ['light', 'on-red', 'dark']) html = html.split(`/assets/img/ulaan-logo-${v}.webp`).join(dataUri(`assets/img/ulaan-logo-${v}.webp`, 'image/webp'));

const out = path.join(root, demo ? 'ulaan-creative-influencers-demo.html' : 'ulaan-creative.html');
writeFileSync(out, html);
console.log(`Wrote ${path.relative(process.cwd(), out)} (${Math.round(html.length / 1024)} KB)`);

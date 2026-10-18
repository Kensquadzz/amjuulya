// Builds ulaan-creative.html: one self-contained file (CSS, JS, images inlined)
// that opens with a double-click. Usage: `npm run build:html`.
// Note: the contact form needs the Vercel /api/contact endpoint, so in the
// standalone file it reports that nothing was sent. Fonts load from Google Fonts.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const dataUri = (p, mime) => `data:${mime};base64,${readFileSync(path.join(root, p)).toString('base64')}`;

let html = read('index.html');
const vendor = ['gsap.min.js', 'ScrollTrigger.min.js', 'lenis.min.js'].map((f) => read(`assets/vendor/${f}`)).join('\n');
const mascot = dataUri('assets/img/mascot.webp', 'image/webp');
const mascotSm = dataUri('assets/img/mascot-sm.webp', 'image/webp');

const replace = (from, to) => {
  if (!html.includes(from)) throw new Error(`build-standalone: not found → ${from.slice(0, 60)}`);
  html = html.split(from).join(to);
};

html = html.replace(/<link rel="preload" as="image"[^>]*>\n/, '');
html = html.replace(/<script src="\/assets\/vendor\/[^"]+" defer><\/script>\n/g, '');
replace('<link rel="canonical" href="/">\n', '');
replace('<link rel="stylesheet" href="/assets/css/styles.css">', `<style>\n${read('assets/css/styles.css')}\n</style>`);
replace('<script src="/assets/js/main.js" defer></script>', `<script>\n${vendor}\n</script>\n<script>\n${read('assets/js/main.js')}\n</script>`);
replace('srcset="/assets/img/mascot-sm.webp 305w, /assets/img/mascot.webp 609w"\n           sizes="(max-width: 760px) 110vw, 60vw"\n           ', '');
replace('/assets/img/mascot.webp', mascot);
replace('href="/assets/img/favicon.svg"', `href="${dataUri('assets/img/favicon.svg', 'image/svg+xml')}"`);
replace('href="/assets/img/apple-touch-icon.png"', `href="${dataUri('assets/img/apple-touch-icon.png', 'image/png')}"`);
if (html.includes('/assets/img/mascot-sm.webp')) replace('/assets/img/mascot-sm.webp', mascotSm);

const out = path.join(root, 'ulaan-creative.html');
writeFileSync(out, html);
console.log(`Wrote ${path.relative(process.cwd(), out)} (${Math.round(html.length / 1024)} KB)`);

// Render template frames to PNG for visual review.
// Usage: node tests/render-frames.mjs <templateId> <out.png> <t1,t2,...> [placeholders=1]
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const [id, out, times, ph = '1'] = process.argv.slice(2);
const server = await createServer({ server: { port: 5195 }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5195/tests/harness.html');
const data = await p.evaluate(async ({ id, times, ph }) => {
  await import('/src/fonts.css');
  const { Renderer } = await import('/src/engine/renderer.ts');
  const { TEMPLATES, projectFromTemplate } = await import('/src/engine/templates.ts');
  const { cssFont } = await import('/src/engine/text.ts');
  const proj = projectFromTemplate(TEMPLATES.find((t) => t.id === id), '9:16');
  await Promise.all(proj.layers.filter((l) => l.type === 'text').map((l) => document.fonts.load(cssFont(l, 64), l.text)));
  const c = document.createElement('canvas');
  const r = new Renderer(c, { preserveDrawingBuffer: true });
  r.placeholders = ph === '1';
  r.setSize(360, 640);
  const ts = times.split(',').map(Number);
  const strip = document.createElement('canvas');
  strip.width = 360 * ts.length; strip.height = 640;
  const sx = strip.getContext('2d');
  for (let i = 0; i < ts.length; i++) { r.render(proj, ts[i]); sx.drawImage(c, i * 360, 0); }
  return strip.toDataURL('image/png');
}, { id, times, ph });
writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
await b.close(); await server.close();

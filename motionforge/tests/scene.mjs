// Contact sheet of a Three.js cinematic scene across its film.
// Usage: node tests/scene.mjs <sceneId> <out.png> [w] [h] [n] [paramsJSON]
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const [id, out, w = '270', h = '480', n = '7', params = '{}'] = process.argv.slice(2);
const server = await createServer({ server: { port: 5190 }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/404/.test(m.text())) errors.push(m.text()); });
await p.goto('http://localhost:5190/tests/harness.html');
const r = await p.evaluate(async ({ id, w, h, n, params }) => {
  await import('/src/fonts.css');
  const { Renderer } = await import('/src/engine/renderer.ts');
  const { makeScene3D, newProject } = await import('/src/engine/project.ts');
  const c = document.createElement('canvas');
  const rr = new Renderer(c, { preserveDrawingBuffer: true });
  rr.setSize(w, h);
  const l = makeScene3D(10, id, { params: JSON.parse(params) });
  const proj = newProject('s', { duration: 10, layers: [l] });
  await rr.prepareTextures(proj);
  const strip = document.createElement('canvas');
  strip.width = w * n; strip.height = h;
  const sx = strip.getContext('2d');
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { rr.render(proj, i / (n - 1) * 10); sx.drawImage(c, i * w, 0); }
  return { url: strip.toDataURL('image/png'), ms: (performance.now() - t0) / n };
}, { id, w: +w, h: +h, n: +n, params });
writeFileSync(out, Buffer.from(r.url.split(',')[1], 'base64'));
console.log(`${id}: ${r.ms.toFixed(0)} ms/frame (software GL)`, errors.length ? 'errors ' + JSON.stringify(errors.slice(0, 5)) : '');
await b.close(); await server.close();

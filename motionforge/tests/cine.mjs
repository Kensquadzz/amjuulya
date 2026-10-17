// Contact sheet of cinematic 3D shaders across a film: node tests/cine.mjs <shaderId[,..]> <out.png> [w] [h] [n]
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const [ids, out, w = '270', h = '480', n = '8', aspect = ''] = process.argv.slice(2);
const server = await createServer({ server: { port: 5194 }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.text()); });
await p.goto('http://localhost:5194/tests/harness.html');
const r = await p.evaluate(async ({ ids, w, h, n }) => {
  await import('/src/fonts.css');
  const { Renderer } = await import('/src/engine/renderer.ts');
  const { makeShader, newProject } = await import('/src/engine/project.ts');
  const c = document.createElement('canvas');
  const r = new Renderer(c, { preserveDrawingBuffer: true });
  r.setSize(w, h);
  const strip = document.createElement('canvas');
  const list = ids.split(',');
  strip.width = w * n; strip.height = h * list.length;
  const sx = strip.getContext('2d');
  const errs = [];
  for (let row = 0; row < list.length; row++) {
    const l = makeShader(10, list[row]);
    const proj = newProject('t', { duration: 10, layers: [l] });
    await r.prepareTextures(proj);
    const res = r.installShader(l.id, l.source);
    if (!res.ok) errs.push(list[row] + ': ' + res.errors.map((e) => `${e.line}: ${e.message}`).join(' | '));
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { r.render(proj, (i + 0.5) / n * 10); sx.drawImage(c, i * w, row * h); }
    errs.push(`${list[row]} ${((performance.now() - t0) / n).toFixed(0)} ms/frame`);
  }
  return { url: strip.toDataURL('image/png'), errs };
}, { ids, w: +w, h: +h, n: +n });
writeFileSync(out, Buffer.from(r.url.split(',')[1], 'base64'));
console.log(r.errs.join('\n'));
await b.close(); await server.close();

// Render-quality check: renders the same frames at 1080p and native 4K with
// the export renderer and writes PNGs for tests/quality.py to measure.
// Usage: node tests/quality.mjs <outDir>
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = process.argv[2] ?? 'test-results/quality';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5196 }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5196/tests/harness.html');
const CASES = [
  { id: 'neon-promo', t: 4.9, name: 'search' },  // white text + neon capsule + search icon
  { id: 'neon-promo', t: 8.5, name: 'icons' },   // glass icon tiles
  { id: 'neon-promo', t: 10.2, name: 'arrow' },  // big arrow tile
];
const shots = await p.evaluate(async (CASES) => {
  await import('/src/fonts.css');
  const { Renderer } = await import('/src/engine/renderer.ts');
  const { TEMPLATES, projectFromTemplate } = await import('/src/engine/templates.ts');
  const { cssFont } = await import('/src/engine/text.ts');
  const res = [];
  for (const scale of [1, 2]) {
    const c = document.createElement('canvas');
    const r = new Renderer(c, { preserveDrawingBuffer: true });
    const W = 1080 * scale, H = 1920 * scale;
    r.setSize(W, H);
    const gl = c.getContext('webgl2');
    for (const k of CASES) {
      const proj = projectFromTemplate(TEMPLATES.find((t) => t.id === k.id), '9:16');
      await Promise.all(proj.layers.filter((l) => l.type === 'text').map((l) => document.fonts.load(cssFont(l, 64), l.text)));
      await document.fonts.ready;
      r.render(proj, k.t, { density: 1 });
      res.push({ name: `${k.name}-${W}x${H}`, url: c.toDataURL('image/png'), buf: [gl.drawingBufferWidth, gl.drawingBufferHeight], canvas: [c.width, c.height] });
    }
    r.destroy();
  }
  return res;
}, CASES);
// real exports through the encoder (VP9 here: this Chromium has no H.264 encoder)
const vids = await p.evaluate(async () => {
  const { exportVideo } = await import('/src/engine/exporter.ts');
  const { TEMPLATES, projectFromTemplate } = await import('/src/engine/templates.ts');
  const out = [];
  for (const scale of [1, 2]) {
    const proj = projectFromTemplate(TEMPLATES.find((t) => t.id === 'neon-promo'), '9:16');
    const caps = (await import('/src/engine/exporter.ts')).detectCapabilities;
    const codec = (await caps()).webcodecs.find((c) => c.codec === 'avc') ? 'avc' : 'vp9';
    const r = await exportVideo(proj, { method: 'webcodecs', codec, scale, fps: 30, duration: 5, quality: 'high' }, () => {}, new AbortController().signal);
    const buf = new Uint8Array(await r.blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    out.push({ name: r.filename, b64: btoa(bin), reported: [r.width, r.height], verified: r.verified, warnings: r.warnings ?? [] });
  }
  return out;
});
for (const v of vids) {
  writeFileSync(`${out}/${v.name}`, Buffer.from(v.b64, 'base64'));
  console.log('export', v.name, 'reported', v.reported.join('x'), 'read back', v.verified?.join('x'), 'warnings', JSON.stringify(v.warnings));
}
for (const s of shots) {
  writeFileSync(`${out}/${s.name}.png`, Buffer.from(s.url.split(',')[1], 'base64'));
  console.log(s.name, 'canvas', s.canvas.join('x'), 'drawingBuffer', s.buf.join('x'));
}
await b.close(); await server.close();

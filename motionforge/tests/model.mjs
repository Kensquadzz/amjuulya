// 3D model layers: built-in models across a film plus a real GLB (made with
// Three's GLTFExporter, with an animation clip) — contact sheet + checks.
// Usage: node tests/model.mjs <out.png>
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const out = process.argv[2] ?? 'test-results/model.png';
const server = await createServer({ server: { port: 5193 }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
await p.goto('http://localhost:5193/tests/harness.html');
const r = await p.evaluate(async () => {
  const { makeTestGLB } = await import('/tests/model-helpers.ts');
  const { Renderer } = await import('/src/engine/renderer.ts');
  const { makeModel, makeBackground, newProject } = await import('/src/engine/project.ts');
  const src = await makeTestGLB();

  const W = 216, H = 384, N = 5;
  const c = document.createElement('canvas');
  const rr = new Renderer(c, { preserveDrawingBuffer: true });
  rr.setSize(W, H);
  const strip = document.createElement('canvas');
  const rows = [['phone'], ['can'], ['knot'], ['sphere'], ['cube'], ['glb']];
  strip.width = W * N; strip.height = H * rows.length;
  const sx = strip.getContext('2d');
  const info = [];
  const bounce = [];
  for (let row = 0; row < rows.length; row++) {
    const prim = rows[row][0];
    const m = makeModel(6, prim === 'glb' ? { src, fileName: 'test.glb', spin: 0, float: 0, clip: 0 } : { primitive: prim });
    m.tracks = { orbit: [{ id: 'a', t: 0, v: -40, ease: 'easeInOutCubic' }, { id: 'b', t: 6, v: 60, ease: 'linear' }] };
    const proj = newProject('m', { duration: 6, layers: [makeBackground(6, { mode: 'linear', colorA: '#202432', colorB: '#0b0c10' }), m] });
    await rr.prepareTextures(proj);
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N * 6;
      rr.render(proj, t);
      sx.drawImage(c, i * W, row * H);
    }
    if (prim === 'glb') {
      info.push(rr.modelInfo(m));
      // the clip moves the knot up at t=1 and back at t=2 (deterministic seeks)
      for (const t of [0, 1, 2, 1]) {
        rr.render(proj, t);
        const g = c.getContext('webgl2');
        const px = new Uint8Array(W * H * 4);
        g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, px);
        let sy = 0, n = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 4; if (px[k + 1] > 120 && px[k + 2] > 120 && px[k] < 90) { sy += y; n++; } }
        bounce.push(n ? +(sy / n).toFixed(1) : null);
      }
    }
  }
  return { url: strip.toDataURL('image/png'), info, bounce };
});
writeFileSync(out, Buffer.from(r.url.split(',')[1], 'base64'));
console.log('glb info', JSON.stringify(r.info));
console.log('glb cyan centroid row (GL y up) at t=0,1,2,1:', JSON.stringify(r.bounce));
const [a0, a1, a2, a3] = r.bounce;
console.log(r.info[0]?.clips?.[0] === 'bounce' ? 'PASS  GLB loads with its animation clip' : 'FAIL  GLB clip');
console.log(a1 > a0 + 5 && Math.abs(a2 - a0) < 2 && Math.abs(a3 - a1) < 2 ? 'PASS  clip plays at exact, repeatable times' : 'FAIL  clip timing');
console.log('errors', JSON.stringify(errors));
await b.close(); await server.close();

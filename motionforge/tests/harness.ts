// Browser-side engine checks, driven by tests/e2e.mjs through Playwright.
import { Renderer } from '../src/engine/renderer';
import { SHADERS } from '../src/engine/shaders/library';
import { sampleProject, TEMPLATES, projectFromTemplate } from '../src/engine/templates';
import { makeText, makeShader, makeShape, makeBackground, newProject } from '../src/engine/project';
import { exportVideo, detectCapabilities } from '../src/engine/exporter';

function sig(canvas: HTMLCanvasElement) {
  // read back via a 2D copy so it works for WebGL canvases
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d')!;
  x.drawImage(canvas, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data;
  let sum = 0, nonBlack = 0;
  for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; sum += v; if (v > 30) nonBlack++; }
  return { mean: sum / (64 * 64 * 3), nonBlack, data: d };
}
const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

(window as any).runChecks = async () => {
  const out: Record<string, unknown> = {};
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const r = new Renderer(canvas, { preserveDrawingBuffer: true });
  r.setSize(270, 480);
  out.webgl2 = r.hasWebGL;

  // 1. every built-in shader compiles
  out.shaders = SHADERS.map((s) => { const c = r.testCompile(s.source); return { id: s.id, ok: c.ok, err: c.errors[0]?.message }; });

  // 2. bad shader reports a line number and keeps the last good program
  const bad = SHADERS[0].source.replace('vec3 col = u_bg;', 'vec3 col = u_bgXX;');
  const p = newProject('t', { duration: 4, aspect: '9:16' });
  const sl = makeShader(4, 'glowGridRed');
  p.layers = [sl];
  r.render(p, 1);
  const good = sig(canvas);
  const res = r.installShader(sl.id, bad);
  r.render(p, 1);
  const after = sig(canvas);
  const expectedLine = bad.split('\n').findIndex((l) => l.includes('u_bgXX')) + 1;
  out.badShader = { ok: res.ok, line: res.errors[0]?.line, expectedLine, msg: res.errors[0]?.message, stillRenders: diff(good.data, after.data) < 1 && good.mean > 2 };

  // 3. text animates: frames differ over time, final frame stable
  const tp = newProject('text', { duration: 4, aspect: '9:16', background: '#000000' });
  tp.layers = [makeText(4, { text: 'HELLO', fontSize: 200, anim: { preset: 'smooth', delay: 0, duration: 1, stagger: 0.1 } as any })];
  await document.fonts.load('600 64px Inter').catch(() => {});
  r.render(tp, 0); const f0 = sig(canvas);
  r.render(tp, 0.5); const f05 = sig(canvas);
  r.render(tp, 3); const f3 = sig(canvas);
  r.render(tp, 3.5); const f35 = sig(canvas);
  out.text = { t0: f0.nonBlack, t05: f05.nonBlack, t3: f3.nonBlack, settledStable: diff(f3.data, f35.data) < 0.01 };

  // 4. keyframed position moves the text
  const kp = newProject('kf', { duration: 2, aspect: '1:1' });
  r.setSize(256, 256);
  kp.layers = [makeText(2, { text: 'X', fontSize: 200, anim: { preset: 'none' } as any, tracks: { x: [{ id: 'a', t: 0, v: 0.2, ease: 'linear' }, { id: 'b', t: 2, v: 0.8, ease: 'linear' }] } })];
  const centroid = () => { const s = sig(canvas).data; let sx = 0, n = 0; for (let i = 0; i < s.length; i += 4) if (s[i] > 128) { sx += (i / 4) % 64; n++; } return n ? sx / n / 64 : -1; };
  r.render(kp, 0); const c0 = centroid();
  r.render(kp, 1); const c1 = centroid();
  r.render(kp, 2); const c2 = centroid();
  out.keyframes = { c0, c1, c2 };

  // 4b. track matte: a rect mask on the left half reveals only that half of a white layer
  const mp = newProject('mask', { duration: 2, aspect: '1:1', background: '#000000' });
  mp.layers = [
    makeShape(2, { mask: 'alpha', x: 0.25, y: 0.5, w: 540, h: 1080, shape: 'rect', fillOn: true, strokeWidth: 0 }),
    makeBackground(2, { colorA: '#ffffff' }),
  ];
  r.render(mp, 1);
  const md = sig(canvas).data;
  const px = (x: number, y: number) => md[(y * 64 + x) * 4];
  mp.layers[0] = { ...mp.layers[0], mask: 'inverted' } as any;
  r.render(mp, 1);
  const mi = sig(canvas).data;
  out.mask = { leftInside: px(10, 32), rightOutside: px(54, 32), invertedLeft: mi[(32 * 64 + 10) * 4], invertedRight: mi[(32 * 64 + 54) * 4] };

  // 5. determinism: same time renders identically
  r.setSize(270, 480);
  const sp = sampleProject();
  r.render(sp, 2.3); const d1 = sig(canvas);
  r.render(sp, 5.1);
  r.render(sp, 2.3); const d2 = sig(canvas);
  out.deterministic = diff(d1.data, d2.data);

  // 6. all templates render something at t=3
  out.templates = TEMPLATES.map((t) => { const pr = projectFromTemplate(t, '9:16'); r.render(pr, 3); const s = sig(canvas); return { id: t.id, mean: +s.mean.toFixed(1), nonBlack: s.nonBlack }; });
  r.destroy();

  // 7. export
  out.caps = await detectCapabilities(540, 960);
  const caps = out.caps as Awaited<ReturnType<typeof detectCapabilities>>;
  const short = { ...sampleProject(), duration: 1.5 };
  const ac = new AbortController();
  const results: unknown[] = [];
  if (caps.webcodecs.length) {
    const e = await exportVideo(short, { method: 'webcodecs', codec: caps.webcodecs[0].codec, scale: 0.5, fps: 30, duration: 1.5, quality: 'medium' }, () => {}, ac.signal);
    results.push({ method: e.method, file: e.filename, size: e.blob.size, type: e.mimeType, frames: e.frames, ms: Math.round(e.elapsedMs), playable: await playable(e.blob) });
  }
  if (caps.mediarecorder.length) {
    const e = await exportVideo(short, { method: 'mediarecorder', mimeType: caps.mediarecorder[0].mimeType, scale: 0.5, fps: 30, duration: 1.5, quality: 'medium' }, () => {}, ac.signal);
    results.push({ method: e.method, file: e.filename, size: e.blob.size, type: e.mimeType, dropped: e.droppedFrames, playable: await playable(e.blob) });
  }
  out.exports = results;
  return out;
};

async function playable(blob: Blob) {
  const v = document.createElement('video');
  v.muted = true;
  v.src = URL.createObjectURL(blob);
  return await new Promise((res) => {
    v.onloadedmetadata = () => res({ w: v.videoWidth, h: v.videoHeight, duration: v.duration });
    v.onerror = () => res({ error: v.error?.code });
    setTimeout(() => res('timeout'), 5000);
  });
}

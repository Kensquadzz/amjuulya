// Art-directed film renderer in the browser: renders a storyboard frame by
// frame and checks what is actually drawn —
//  * text audit: every visible string inside the Reel safe area, not tiny, not
//    overlapping other text, not drawn twice in one frame
//  * the copy of every scene is really drawn while that scene is on screen
//  * motion: no stretch of half a second without movement, transitions are not blank
//  * fonts: the display and interface fonts are loaded for Mongolian Cyrillic
// Usage: node tests/film.mjs [storyboard.json] [outDir]
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
const [sbFile, out] = process.argv.slice(2);
const server = await createServer({ server: { port: 5188 }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost:5188/tests/harness.html');
const results = [];
const check = (n, ok, info = '') => { const l = `${ok ? 'PASS' : 'FAIL'}  ${n}${info ? '  — ' + info : ''}`; results.push(l); console.error(l); };
const ext = sbFile ? JSON.parse(readFileSync(sbFile, 'utf8')) : null;
const r = await p.evaluate(async ({ ext, sheet }) => {
  await import('/src/fonts.css');
  const { Renderer } = await import('/src/engine/renderer.ts');
  const { buildFilmProject } = await import('/src/engine/film/project.ts');
  const { DEMO_STORYBOARD } = await import('/src/engine/film/demo.ts');
  const { sceneStrings } = await import('/src/engine/film/plan.ts');
  const { FILM_AUDIT } = await import('/src/engine/scenes3d/film.ts');
  const sb = ext ?? DEMO_STORYBOARD;
  const { project } = buildFilmProject(sb, { images: [], music: false });
  project.audio = [];
  const W = 270, H = 480, c = document.createElement('canvas'), rr = new Renderer(c, { preserveDrawingBuffer: true });
  rr.setSize(W, H);
  await rr.prepareTextures(project);
  const fams = [...new Set([sb.fonts?.display ?? 'Montserrat', sb.fonts?.ui ?? 'Inter'])];
  for (const fm of fams) await document.fonts.load(`600 80px "${fm}"`, 'Өө Үү ₮');
  const fonts = fams.map((fm) => `600 80px "${fm}"`).map((f) => ({ f, ok: document.fonts.check(f, 'Өө Үү ₮') }));
  const x2 = c.getContext('2d') ?? null; void x2;
  const probe = document.createElement('canvas'); probe.width = W; probe.height = H; const px = probe.getContext('2d', { willReadFrequently: true });
  const frameAt = (t) => { rr.render(project, t); px.drawImage(c, 0, 0); return px.getImageData(0, 0, W, H).data; };
  const diff = (a, b2) => { let s = 0; for (let i = 0; i < a.length; i += 16) s += Math.abs(a[i] - b2[i]) + Math.abs(a[i + 1] - b2[i + 1]) + Math.abs(a[i + 2] - b2[i + 2]); return s / (a.length / 16) / 3; };
  // motion: frames every 1/15 s
  const dt = 1 / 15, motion = [];
  let prev = frameAt(0);
  for (let t = dt; t < sb.duration; t += dt) { const cur = frameAt(t); motion.push([+t.toFixed(3), diff(prev, cur)]); prev = cur; }
  // audit: every 0.25 s
  const audit = [];
  for (let t = 0.1; t < sb.duration; t += 0.25) { FILM_AUDIT.on = true; rr.render(project, t); FILM_AUDIT.on = false; audit.push({ t, items: FILM_AUDIT.items.map((a) => ({ ...a })) }); }
  // per scene: copy drawn somewhere between its middle and its end
  const scenes = sb.scenes.map((s) => {
    // runs drawn in one frame are joined in drawing order (a highlighted word is its own run)
    const want = sceneStrings(s), frames = [], squash = (x) => x.replace(/[\s«»"“”.,!?;:/]/g, '');
    for (let t = s.start + 0.5; t < s.end - 0.02; t += 0.1) { FILM_AUDIT.on = true; rr.render(project, t); FILM_AUDIT.on = false; frames.push(squash(FILM_AUDIT.items.map((a) => a.s).join(''))); }
    return { id: s.id, missing: want.filter((w) => !frames.some((f) => f.includes(squash(w)))) };
  });
  // transitions: frames in the middle of each transition are not blank
  const trans = sb.scenes.filter((s) => s.enter && s.enter !== 'cut').map((s) => { const d = frameAt(s.start + 0.2); let lo = 255, hi = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return { id: s.id, enter: s.enter, contrast: hi - lo }; });
  let url = '';
  if (sheet) { const st = document.createElement('canvas'), n = sb.scenes.length; st.width = W * n; st.height = H; const sx = st.getContext('2d'); sb.scenes.forEach((s, i) => { rr.render(project, s.start + (s.end - s.start) * 0.7); sx.drawImage(c, i * W, 0); }); url = st.toDataURL('image/jpeg', 0.85); }
  return { fonts, motion, audit, scenes, trans, url, duration: sb.duration };
}, { ext, sheet: !!out });
r.fonts.forEach((f) => check(`font loaded for Mongolian: ${f.f}`, f.ok));
// motion
let still = 0, worst = 0, at = 0;
for (const [t, d] of r.motion) { if (d < 0.02) { still += 1 / 15; if (still > worst) { worst = still; at = t; } } else still = 0; }
check('no frozen stretch longer than 0.5 s', worst <= 0.5, `longest still ${worst.toFixed(2)} s at ${at.toFixed(2)} s`);
// text audit (the second column of list rows, e.g. a file type, may repeat: it is metadata, not copy)
const sbUsed = ext ?? null;
const rowMeta = new Set(['Word', 'Excel']);
if (sbUsed) for (const sc of sbUsed.scenes) for (const l of String(sc.copy.items ?? '').split('\n')) { const m = l.split('|')[1]; if (m) rowMeta.add(m.trim()); }
const issues = [];
for (const fr of r.audit) {
  const it = fr.items;
  for (const a of it) {
    if (a.x0 < 40 || a.x1 > 1040 || a.y0 < 220 || a.y1 > 1580) issues.push(`${fr.t.toFixed(2)}s outside safe area: "${a.s}"`);
    if (a.px < 28) issues.push(`${fr.t.toFixed(2)}s too small (${a.px.toFixed(0)}px): "${a.s}"`);
  }
  for (let i = 0; i < it.length; i++) for (let j = i + 1; j < it.length; j++) {
    const A = it[i], B = it[j], ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
    if (ox > 6 && oy > 6 && !A.s.includes(B.s) && !B.s.includes(A.s)) issues.push(`${fr.t.toFixed(2)}s overlap: "${A.s}" × "${B.s}"`);
  }
  const count = {};
  it.forEach((a) => { count[a.s] = (count[a.s] ?? 0) + 1; });
  // a file type under several list rows is metadata, not duplicated copy
  for (const [s, n] of Object.entries(count)) if (n > 1 && !rowMeta.has(s)) issues.push(`${fr.t.toFixed(2)}s drawn ${n}×: "${s}"`);
}
check('text audit: safe area, size, overlap, duplicates', issues.length === 0, issues.slice(0, 6).join(' | ') || `${r.audit.length} frames`);
const miss = r.scenes.filter((s) => s.missing.length);
check('every scene draws its copy', miss.length === 0, miss.map((s) => `${s.id}: ${s.missing.join(', ')}`).join(' | '));
const flat = r.trans.filter((x) => x.contrast < 60);
check('transitions are not blank', flat.length === 0, r.trans.map((x) => `${x.id}/${x.enter}:${x.contrast}`).join(' '));
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
if (out && r.url) writeFileSync(`${out}/film-scenes.jpg`, Buffer.from(r.url.split(',')[1], 'base64'));
console.log(results.join('\n'));
await b.close(); await server.close();
if (results.some((x) => x.startsWith('FAIL'))) process.exit(1);

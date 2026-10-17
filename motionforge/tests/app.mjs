// End-to-end touch test of the real app at iPhone size, with assertions.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const shots = process.argv[2] || 'test-results';
const server = await createServer({ server: { port: 5197 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
// these checks drive the classic (tabbed) workspace; tests/cap.mjs covers the simple editor
await page.addInitScript(() => { try { localStorage.setItem('mf.view', 'classic'); } catch {} });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404|Outdated Optimize/.test(m.text())) errors.push(m.text()); });
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'My Preset' : undefined));
const results = [];
const check = (name, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const canvasStats = () => ev(() => {
  const src = document.querySelector('.stage canvas');
  // the preview canvas does not preserve its buffer: render and read in the same task
  const { store, engine } = window.__motionforge;
  engine.renderer.render(store.state.project, engine.time, { density: 1 });
  const c = document.createElement('canvas'); c.width = 48; c.height = 48;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0, 48, 48);
  const d = x.getImageData(0, 0, 48, 48).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  return { mean: s / (48 * 48 * 3), w: src.width, h: src.height, hash: Array.from(d.filter((_, i) => i % 97 === 0)).join(',') };
});
const tab = (n) => page.getByRole('tab', { name: new RegExp(n) }).tap();
const wait = (ms) => page.waitForTimeout(ms);

process.on('exit', () => { console.log(results.join('\n')); console.log('errors:', JSON.stringify(errors)); });
await page.goto('http://localhost:5197/');
await page.waitForFunction(() => window.__motionforge);
await wait(1500);
const S = () => ev(() => { const s = window.__motionforge.store.state; return { layers: s.project.layers.map((l) => ({ id: l.id, name: l.name, type: l.type, tracks: Object.fromEntries(Object.entries(l.tracks).map(([k, v]) => [k, v.length])), text: l.text, x: l.x, source: l.source?.length })), sel: s.selectedLayerId, aspect: s.project.aspect, name: s.project.name, dirty: s.dirty }; });

// 1 default project loads with layers
let st = await S();
check('sample project loads', st.layers.length === 6, `${st.layers.length} layers`);

// 2 play advances the clock and frames change
const a = await canvasStats();
await page.getByRole('button', { name: 'Play' }).tap();
await wait(2500);
const t1 = await ev(() => window.__motionforge.engine.time);
const b = await canvasStats();
check('playback advances time', t1 > 1, `t=${t1.toFixed(2)}`);
check('playback changes frames', a.hash !== b.hash && b.mean > a.mean, `mean ${a.mean.toFixed(1)} → ${b.mean.toFixed(1)}`);
await page.getByRole('button', { name: 'Pause' }).tap();

// 3 scrub with the range slider
await ev(() => { const r = document.querySelector('.scrub'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, '2.5'); r.dispatchEvent(new Event('input', { bubbles: true })); });
await wait(300);
const t2 = await ev(() => window.__motionforge.engine.time);
check('scrubber seeks', Math.abs(t2 - 2.5) < 0.05, `t=${t2}`);
await page.screenshot({ path: `${shots}/app-2.5s.png` });

// 4 select the Title layer and edit text → preview changes
await tab('Layers');
await page.locator('.layer-list .lname').filter({ has: page.locator('.nm', { hasText: /^Title$/ }) }).tap();
await tab('Inspect');
const before = await canvasStats();
await page.locator('textarea.text-input').fill('HELLO IPHONE');
await wait(500);
const after = await canvasStats();
st = await S();
check('text edit updates project', st.layers.find((l) => l.name === 'Title').text === 'HELLO IPHONE');
check('text edit updates preview immediately', before.hash !== after.hash);

// 5 keyframes from inspector: ◆ at 2.5s, move playhead, change value → 2 keys
await ev(() => window.__motionforge.engine.player.seek(1));
await wait(200);
const kfBtns = page.locator('.prop', { hasText: 'Position X' }).locator('.kf-btn');
await kfBtns.tap();
await ev(() => window.__motionforge.engine.player.seek(3));
await wait(200);
const num = page.locator('.prop', { hasText: 'Position X' }).locator('input.num');
await num.tap(); await num.fill('70'); await num.press('Enter');
await wait(300);
st = await S();
const title = st.layers.find((l) => l.name === 'Title');
check('keyframes added via inspector', title.tracks.x === 2, JSON.stringify(title.tracks));
const xAt = (t) => ev((t) => { const { store, engine } = window.__motionforge; engine.player.seek(t); const l = store.state.project.layers.find((l) => l.name === 'Title'); return l; }, t);
const v = await ev(() => { const { store } = window.__motionforge; const k = store.state.project.layers.find((l) => l.name === 'Title').tracks.x; return k.map((q) => [q.t, q.v]); });
check('keyframe values/times correct', Math.abs(v[0][0] - 1) < 0.02 && Math.abs(v[1][0] - 3) < 0.02 && Math.abs(v[1][1] - 0.7) < 1e-6, JSON.stringify(v));

// 6 timeline: expand, tap keyframe, change easing, drag keyframe
await tab('Timeline');
await wait(300);
const row = page.locator('.tl-layer').filter({ has: page.locator('.tl-label .nm', { hasText: /^Title$/ }) });
await row.locator('button.exp').tap();
await wait(200);
const kf = row.locator('button.kf').nth(1);
await kf.tap();
await wait(200);
const editorVisible = await page.locator('.kf-editor').isVisible();
check('tapping a keyframe opens the keyframe editor', editorVisible);
await page.locator('.kf-editor select').selectOption('easeOutBack');
const box = await kf.boundingBox();
// drag with touch-like pointer: playwright mouse produces pointer events
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 6 });
await page.mouse.up();
await wait(200);
const v2 = await ev(() => window.__motionforge.store.state.project.layers.find((l) => l.name === 'Title').tracks.x.map((q) => [q.t, q.ease]));
check('keyframe easing edited', v2.some((q) => q[1] === 'easeOutBack'), JSON.stringify(v2));
check('keyframe dragged later in time', v2[1][0] > 3.1, JSON.stringify(v2));
await page.screenshot({ path: `${shots}/app-timeline.png` });

// 7 timeline layer bar trim
const bar = row.locator('.tl-bar').first();
const bb = await bar.boundingBox();
const endBefore = await ev(() => window.__motionforge.store.state.project.layers.find((l) => l.name === 'Title').end);
await page.mouse.move(bb.x + bb.width - 3, bb.y + bb.height / 2);
await page.mouse.down();
await page.mouse.move(bb.x + bb.width - 3 - 30, bb.y + bb.height / 2, { steps: 5 });
await page.mouse.up();
const endAfter = await ev(() => window.__motionforge.store.state.project.layers.find((l) => l.name === 'Title').end);
check('layer out-point trimmed by dragging handle', endAfter < endBefore - 0.2, `${endBefore} → ${endAfter}`);

// 8 undo / redo
await page.getByRole('button', { name: 'Undo' }).tap();
const endUndo = await ev(() => window.__motionforge.store.state.project.layers.find((l) => l.name === 'Title').end);
check('undo restores', Math.abs(endUndo - endBefore) < 1e-6, `${endUndo}`);
await page.getByRole('button', { name: 'Redo' }).tap();
const endRedo = await ev(() => window.__motionforge.store.state.project.layers.find((l) => l.name === 'Title').end);
check('redo re-applies', Math.abs(endRedo - endAfter) < 1e-6);

// 9 shader editor: error with line number, last good kept, then fix
await tab('Layers');
await page.locator('.layer-list .lname', { hasText: 'Glow grid' }).tap();
await tab('Code');
await page.waitForSelector('.cm-content');
await ev(() => window.__motionforge.engine.player.seek(3));
await wait(300);
const goodFrame = await canvasStats();
await page.locator('.cm-content').tap();
// replace whole doc via CM view (typing a full shader on a phone is impractical in a test)
await ev(() => {
  const view = document.querySelector('.cm-editor').cmView?.view;
});
await page.keyboard.press('Control+End');
await page.keyboard.type('\nfloat broken = ;\n');
await page.getByRole('button', { name: '▶ Compile' }).tap();
await wait(400);
const errText = await page.locator('.errors').innerText().catch(() => '');
check('shader syntax error shown with line number', /Line \d+/.test(errText), errText.split('\n')[0]);
const badFrame = await canvasStats();
check('last working shader keeps rendering', badFrame.mean > 1 && Math.abs(badFrame.mean - goodFrame.mean) < 3, `${goodFrame.mean.toFixed(1)} vs ${badFrame.mean.toFixed(1)}`);
await page.getByRole('button', { name: 'Restore working' }).tap();
await wait(400);
const status = await page.locator('.status').innerText();
check('restore last working shader', /Compiled/.test(status), status);

// 10 custom shader from blank, uniform control appears
await page.screenshot({ path: `${shots}/app-code.png` });
await tab('Layers');
await page.getByRole('button', { name: '＋ Custom GLSL' }).tap();
await tab('Code');
await page.waitForSelector('.cm-content');
await page.locator('.cm-content').tap();
await page.keyboard.press('Control+End');
await page.keyboard.type('\n// added\n');
await page.getByRole('button', { name: '▶ Compile' }).tap();
await wait(300);
check('custom shader compiles', /Compiled/.test(await page.locator('.status').innerText()));
check('uniform controls generated', (await page.locator('.prop', { hasText: 'Intensity' }).count()) > 0);

// 11 aspect switching keeps layers
const layerCount = (await S()).layers.length;
await page.locator('select[aria-label="Aspect ratio"]').selectOption('16:9');
await wait(500);
const c169 = await canvasStats();
st = await S();
check('aspect switch 16:9', st.aspect === '16:9' && c169.w > c169.h && st.layers.length === layerCount, `${c169.w}x${c169.h}`);
await page.screenshot({ path: `${shots}/app-16x9.png` });
await page.locator('select[aria-label="Aspect ratio"]').selectOption('9:16');

// 12 templates apply
await tab('Presets');
await page.locator('.tpl-main', { hasText: 'Red Glow Grid' }).tap();
await page.getByRole('button', { name: /Use this template/ }).tap();
await wait(800);
st = await S();
check('template applies', st.name === 'Red Glow Grid' && st.layers.length === 3);
await page.locator('.chip', { hasText: 'All' }).first().tap();
await page.screenshot({ path: `${shots}/app-template.png` });
await page.getByRole('button', { name: 'Save current as preset' }).tap();
await wait(400);
check('save as custom preset', (await page.locator('.tpl-main', { hasText: 'My Preset' }).count()) === 1);

// 12b audio: add a sound effect from the picker; it shows in the list and on the timeline
await tab('Audio');
await page.getByRole('button', { name: '＋ Add sound effect' }).tap();
await page.getByRole('button', { name: 'Add Whoosh', exact: true }).tap();
await wait(600);
await page.getByRole('button', { name: 'Close' }).tap();
st = await ev(() => (window.__motionforge.store.state.project.audio || []).map((c) => c.assetId));
check('sound effect added to project', st.includes('sfx:whoosh'), JSON.stringify(st));
await tab('Timeline');
check('audio track shown on the timeline', (await page.locator('.tl-audio').count()) === 1);

// 12c image layer with automatic background removal
// (needs a local photo at tests/statue.jpg — not committed; the check is skipped without it)
const { existsSync } = await import('node:fs');
if (existsSync('tests/statue.jpg')) {
await tab('Layers');
await page.locator('.add-row label.file-btn', { hasText: 'Image' }).locator('input').setInputFiles('tests/statue.jpg');
await page.waitForFunction(() => { const l = window.__motionforge.store.state.project.layers.find((x) => x.type === 'image'); return l && l.srcOriginal; }, null, { timeout: 120000 }).catch(() => {});
const img = await ev(() => { const l = window.__motionforge.store.state.project.layers.find((x) => x.type === 'image'); return l ? { cut: !!l.srcOriginal, png: l.src.startsWith('data:image/png') } : null; });
check('picked image gets its background removed automatically', !!img && img.cut && img.png, JSON.stringify(img));
} else results.push('SKIP  background removal (no tests/statue.jpg)');

// 13 save + reload restores project
await page.getByRole('button', { name: 'Save project' }).tap();
await wait(500);
await page.reload();
await page.waitForFunction(() => window.__motionforge);
await wait(800);
st = await S();
check('project persisted across reload (IndexedDB)', st.name === 'Red Glow Grid' && st.layers.length >= 3, st.name + ' ' + st.layers.length);
const audioAfter = await ev(() => (window.__motionforge.store.state.project.audio || []).length);
check('audio clips persisted across reload', audioAfter === 1);

// 14 projects sheet: list contains saved projects
await page.locator('.proj-name').tap();
await wait(500);
const n = await page.locator('.sheet .layer-list li').count();
check('projects list', n >= 1, `${n} saved`);
await page.screenshot({ path: `${shots}/app-projects.png` });
await page.getByRole('button', { name: 'Close' }).tap();

// 15 export via UI (540p, 1s)
await page.getByRole('button', { name: 'Export' }).tap();
await page.waitForSelector('.export-form');
await page.locator('.export-form .prop', { hasText: 'Resolution' }).locator('select').selectOption({ index: 2 });
await ev(() => { const r = document.querySelector('.export-form input[type=range]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, '1'); r.dispatchEvent(new Event('input', { bubbles: true })); });
await page.screenshot({ path: `${shots}/app-export.png` });
await page.locator('.export-form button.primary').tap();
await page.waitForSelector('.export-result, .notice.error', { timeout: 120000 });
const resText = await page.locator('.sheet-body').innerText();
check('export produces a file', /\.(webm|mp4)/.test(resText) && !/Export failed/.test(resText), resText.split('\n').slice(0, 2).join(' | '));
const dur = await ev(() => new Promise((r) => { const v = document.querySelector('.result-video'); if (!v) return r(-1); if (v.readyState >= 1) return r(v.duration); v.onloadedmetadata = () => r(v.duration); setTimeout(() => r(-2), 5000); }));
check('exported video is playable', dur > 0.9, `duration ${dur}`);
await page.screenshot({ path: `${shots}/app-export-done.png` });

await browser.close(); await server.close();

// End-to-end: Three.js model layers in the simple editor — add a built-in
// model, camera move, upload a real GLB with an animation, export.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const shots = process.argv[2];
const server = await createServer({ server: { port: 5188 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404|Outdated Optimize/.test(m.text())) errors.push(m.text()); });
page.on('dialog', (d) => d.accept());
const results = [];
const check = (n, ok, info = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${info ? '  — ' + info : ''}`);
process.on('exit', () => { console.log(results.join('\n')); console.log('errors:', JSON.stringify(errors)); });
const S = () => page.evaluate(() => window.__motionforge.store.state);
const tool = (label) => page.locator('.cap-tool', { hasText: label }).first().tap();
const shot = (n) => shots && page.screenshot({ path: `${shots}/${n}.png` });
await page.goto('http://localhost:5188/');
await page.waitForFunction(() => window.__motionforge);
await page.locator('.new-project').tap();
await page.locator('.ratio', { hasText: '9:16' }).tap();
await page.waitForTimeout(500);

// built-in model
await tool('3D');
await page.locator('.anim-item', { hasText: 'Лааз' }).tap();
await page.waitForTimeout(500);
let st = await S();
let m = st.project.layers.find((l) => l.type === 'model3d');
check('built-in 3D model added and selected', m && m.primitive === 'can' && st.selectedLayerId === m.id);
check('orbit reveal keyframes written', m.tracks.orbit?.length === 2 && m.tracks.distance?.length === 2);
check('model tools shown', await page.locator('.cap-tool', { hasText: 'Камер' }).isVisible());
await page.evaluate(() => window.__motionforge.engine.player.seek(3));
await page.waitForTimeout(4000);
// count red can pixels in a screenshot of the preview canvas
const png = (await page.locator('.stage canvas').screenshot()).toString('base64');
const lit = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const px = x.getImageData(0, 0, c.width, c.height).data;
  let red = 0; for (let i = 0; i < px.length; i += 4) if (px[i] > 150 && px[i + 1] < 90) red++;
  return red / (c.width * c.height);
}, png);
check('the can renders in the preview', lit > 0.01, `${(lit * 100).toFixed(1)}% red pixels`);
await shot('t1-can');

// camera preset + light
await tool('Камер');
await page.locator('.chip', { hasText: 'Ойртох' }).tap();
st = await S();
m = st.project.layers.find((l) => l.type === 'model3d');
check('push-in camera move', m.tracks.distance?.[0].v === 1.9 && !m.tracks.orbit);
await page.locator('.done-btn').tap();
await tool('Гэрэл');
await page.locator('.seg button', { hasText: 'Шөнийн неон' }).tap();
await page.locator('.done-btn').tap();
check('night environment', (await S()).project.layers.find((l) => l.type === 'model3d').env === 'night');

// upload a real GLB with an animation clip
const b64 = await page.evaluate(async () => (await (await import('/tests/model-helpers.ts')).makeTestGLB()).split(',')[1]);
await tool('Модель');
await page.locator('.tool-sheet input[type=file]').first().setInputFiles({ name: 'knot.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from(b64, 'base64') });
await page.waitForTimeout(4000);
st = await S();
m = st.project.layers.find((l) => l.type === 'model3d');
check('GLB upload replaces the model', m.src.startsWith('data:model/gltf-binary') && m.fileName === 'knot.glb');
const opts = await page.locator('.tool-sheet select option').allInnerTexts();
check('GLB animation clips listed', opts.includes('bounce'), opts.join(','));
await shot('t2-glb');
await page.locator('.done-btn').tap();

// export with the model
await page.locator('.cap-top .export-btn').tap();
await page.waitForSelector('.export-form');
await page.evaluate(() => { const r = document.querySelector('.export-form input[type=range]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, '1'); r.dispatchEvent(new Event('input', { bubbles: true })); });
await page.locator('.export-form .prop', { hasText: 'Resolution' }).locator('select').selectOption({ index: 2 });
await page.locator('.export-form button.primary').tap();
await page.waitForSelector('.export-result, .notice.error', { timeout: 300000 });
const res = await page.locator('.sheet-body').innerText();
check('export with a 3D model works and is verified', /\.(webm|mp4|mov)/.test(res) && /verified/.test(res), res.split('\n')[0]);
await page.locator('.sheet .close, [aria-label=Close]').first().tap().catch(() => {});

// the Three.js template
await page.getByRole('button', { name: 'Нүүр' }).tap();
await page.locator('.chip', { hasText: 'Cinematic 3D' }).first().tap();
await page.locator('.tpl-main', { hasText: 'Your 3D Model' }).tap();
await page.waitForTimeout(4000);
await shot('t3-template');
await page.getByRole('button', { name: /Use this template/ }).tap();
await page.waitForTimeout(1000);
st = await S();
check('Three.js template opens', st.project.templateId === 'three-model' && st.project.layers.some((l) => l.type === 'model3d'));
await browser.close(); await server.close();

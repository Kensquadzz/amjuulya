// End-to-end: browse the cinematic library, preview at 16:9 / 10 s, use it,
// edit the 3D brand text from the simple editor and export.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const shots = process.argv[2];
const server = await createServer({ server: { port: 5189 }, logLevel: 'error' });
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
const shot = (n) => shots && page.screenshot({ path: `${shots}/${n}.png` });
await page.goto('http://localhost:5189/');
await page.waitForFunction(() => window.__motionforge);
await page.waitForTimeout(800);

await page.locator('.chip', { hasText: 'Cinematic 3D' }).first().tap();
await page.waitForTimeout(400);
const cards = await page.locator('.tpl-main b').allInnerTexts();
check('library lists 12 cinematic films + the Three.js model film', cards.length === 13, cards.join(' | '));
await page.waitForTimeout(6000);
await shot('c1-library');

// search + favourite
await page.locator('.tpl-search').fill('perfume');
check('search filters', (await page.locator('.tpl-main b').allInnerTexts()).join() === 'Luxury Perfume Commercial');
await page.locator('.tpl-fav').first().tap();
await page.locator('.tpl-search').fill('');
await page.locator('.chip', { hasText: '★' }).tap();
check('favourites', (await page.locator('.tpl-main b').allInnerTexts()).join() === 'Luxury Perfume Commercial');
await page.locator('.chip', { hasText: 'Cinematic 3D' }).first().tap();

// preview at 16:9 / 10 s
await page.locator('.tpl-main', { hasText: 'Chrome Logo Reveal' }).tap();
await page.waitForTimeout(800);
await page.locator('.tpl-opts .seg button', { hasText: '16:9' }).tap();
await page.locator('.tpl-opts .seg button', { hasText: '20s' }).tap();
await page.waitForTimeout(3000);
await shot('c2-preview');
await page.getByRole('button', { name: /Use this template/ }).tap();
await page.waitForTimeout(1500);
let st = await S();
check('used at 16:9 and 20 s', st.project.aspect === '16:9' && st.project.duration === 20, `${st.project.aspect} ${st.project.duration}s`);
const world = st.project.layers.find((l) => l.type === 'scene3d');
check('3D world spans the film', world && world.start === 0 && world.end === 20);

// select the 3D layer on the timeline and edit its brand text
await page.locator('.cap-bar', { hasText: 'Chrome logo stage' }).dispatchEvent('click');
await page.waitForTimeout(300);
await page.locator('.cap-tool', { hasText: 'Тохируулах' }).first().tap();
await page.waitForTimeout(500);
const ta = page.locator('.glyph-prop textarea').first();
check('3D text control shown', await ta.isVisible());
await ta.fill('ALTAN');
await page.waitForTimeout(2500);
st = await S();
const w2 = st.project.layers.find((l) => l.type === 'scene3d');
check('3D text edit lands in the project', w2.params.text === 'ALTAN', w2.params.text);
await page.evaluate(() => window.__motionforge.engine.player.seek(16));
await page.waitForTimeout(3000);
await shot('c3-adjust');
await page.locator('.done-btn').tap();

// export a short clip with the custom 3D text
await page.locator('.cap-top .export-btn').tap();
await page.waitForSelector('.export-form');
await page.evaluate(() => { const r = document.querySelector('.export-form input[type=range]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, '1'); r.dispatchEvent(new Event('input', { bubbles: true })); });
await page.locator('.export-form .prop', { hasText: 'Resolution' }).locator('select').selectOption({ index: 2 });
await page.locator('.export-form button.primary').tap();
await page.waitForSelector('.export-result, .notice.error', { timeout: 300000 });
const res = await page.locator('.sheet-body').innerText();
check('export of a cinematic film works', /\.(webm|mp4|mov)/.test(res) && !/failed/i.test(res), res.split('\n')[0]);
check('export size verified from the file', /verified/.test(res));
await browser.close(); await server.close();

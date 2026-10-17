// End-to-end test of the simple (CapCut-style) editor at iPhone size.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5184 }, logLevel: 'error' });
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
const ev = (fn, a) => page.evaluate(fn, a);
const S = () => ev(() => window.__motionforge.store.state);
const tool = (label) => page.locator('.cap-tool', { hasText: label }).first().tap();
const wait = (ms) => page.waitForTimeout(ms);

await page.goto('http://localhost:5184/');
await page.waitForFunction(() => window.__motionforge);
await wait(800);
check('home screen shows (Mongolian by default)', await page.getByText('Шинэ төсөл').isVisible());

// new project 9:16
await page.locator('.new-project').tap();
await page.locator('.ratio', { hasText: '9:16' }).tap();
await wait(600);
let st = await S();
check('new empty project opens in the editor', st.project.layers.length === 0 && (await page.locator('.cap-tools').isVisible()));

// add text → edit sheet opens with the text selected
await tool('Текст');
await wait(400);
await page.locator('.cap-text').fill('Сайн уу');
await page.locator('.done-btn').tap();
st = await S();
const text = st.project.layers.find((l) => l.type === 'text');
check('add text + type Mongolian text', text?.text === 'Сайн уу', text?.text);
check('context toolbar for text', await page.locator('.cap-tool', { hasText: 'Фонт' }).isVisible());

// font + animation
await tool('Фонт');
await page.locator('.font-item', { hasText: 'Playfair' }).tap();
await page.locator('.done-btn').tap();
await tool('Анимэйшн');
await page.locator('.anim-item', { hasText: 'Үсэг үсгээр' }).tap();
await page.locator('.done-btn').tap();
st = await S();
const t2 = st.project.layers.find((l) => l.type === 'text');
check('font and animation applied', t2.fontFamily === 'Playfair Display' && t2.anim.preset === 'typePop', `${t2.fontFamily} / ${t2.anim.preset}`);

// tap empty preview deselects, tap on the text selects again, drag moves it
await ev(() => window.__motionforge.engine.player.pause());
await ev(() => window.__motionforge.engine.player.seek(2.5));
await wait(300);
const box = await page.locator('.stage canvas').boundingBox();
await page.touchscreen.tap(box.x + 10, box.y + 10);
await wait(200);
check('tap empty area deselects', (await S()).selectedLayerId === null);
await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
await wait(300);
check('tap on text selects it', (await S()).selectedLayerId === t2.id);
check('selection frame shown', await page.locator('.sel-frame').isVisible());
const x0 = (await S()).project.layers.find((l) => l.id === t2.id).x;
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 });
await page.mouse.up();
const x1 = (await S()).project.layers.find((l) => l.id === t2.id).x;
check('drag on preview moves the selected text', x1 > x0 + 0.1, `${x0} → ${x1.toFixed(3)}`);

// split + delete + undo
await ev(() => window.__motionforge.engine.player.seek(1.5));
await tool('Хуваах');
st = await S();
check('split at playhead makes two text layers', st.project.layers.filter((l) => l.type === 'text').length === 2);
await tool('Устгах');
check('delete removes the selected part', (await S()).project.layers.filter((l) => l.type === 'text').length === 1);
await page.getByRole('button', { name: 'Буцаах' }).tap();
check('undo brings it back', (await S()).project.layers.filter((l) => l.type === 'text').length === 2);

// sticker
await tool('Буцах');
await tool('Стикер');
await wait(600);
await page.locator('.sticker').first().tap();
await wait(300);
st = await S();
check('sticker added and selected', st.project.layers.some((l) => l.type === 'shape' && l.shape === 'glassTile') && st.selectedLayerId);
await tool('Анимэйшн');
await page.locator('.anim-item', { hasText: 'Үсрэх' }).tap();
await page.locator('.done-btn').tap();
st = await S();
const tile = st.project.layers.find((l) => l.shape === 'glassTile');
const tile0 = tile;
check('in-animation writes keyframes', !!tile.tracks.scale?.length && !!tile.tracks.opacity?.length, Object.keys(tile.tracks).join(','));

// timeline: a finger scroll must move the clock and must not be overwritten
await ev(() => window.__motionforge.engine.player.seek(0.5));
await wait(200);
const scrub = await ev(async () => {
  const el = document.querySelector('.cap-scroll');
  el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [] }));
  const from = el.scrollLeft;
  const out = [];
  for (let i = 1; i <= 6; i++) {
    el.scrollLeft = from + i * 20;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    out.push([el.scrollLeft, window.__motionforge.engine.time]);
  }
  el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] }));
  return { from, out };
});
const lastS = scrub.out.at(-1);
check('finger scroll scrubs the playhead (no snap-back)', lastS[0] >= scrub.from + 110 && lastS[1] > 0.5 + 1.4, JSON.stringify(lastS));
const w0 = await page.locator('.cap-bar.sel').evaluate((e) => e.getBoundingClientRect().width);
await page.getByRole('button', { name: 'Томруулах' }).first().tap();
await wait(250);
const w1 = await page.locator('.cap-bar.sel').evaluate((e) => e.getBoundingClientRect().width);
check('timeline zoom in', w1 > w0 * 1.3, `${w0.toFixed(0)} → ${w1.toFixed(0)}`);
await page.getByRole('button', { name: 'Timeline томруулах' }).tap();
check('timeline expands', await page.locator('.cap-timeline.big').isVisible());
await page.getByRole('button', { name: 'Timeline багасгах' }).tap();

// keyframes from the position sheet: key all, move the clock, change x → a 2-key animation
await ev((t) => window.__motionforge.engine.player.seek(t), tile0.start + 0.2);
await tool('Байрлал');
await page.locator('.kf-nav .chip').tap();
await ev((t) => window.__motionforge.engine.player.seek(t), tile0.start + 1.5);
await wait(200);
await page.locator('.tool-sheet .prop', { hasText: 'Хэвтээ' }).locator('input.num').fill('20');
await page.locator('.tool-sheet .prop', { hasText: 'Хэвтээ' }).locator('input.num').press('Enter');
await page.locator('.done-btn').tap();
st = await S();
const tk = st.project.layers.find((l) => l.id === tile0.id);
check('keyframe workflow animates x', tk.tracks.x?.length >= 2 && Math.abs(tk.tracks.x.at(-1).v - 0.2) < 1e-6, JSON.stringify(tk.tracks.x?.map((k) => [k.t.toFixed(2), k.v])));
check('keyframe diamonds on the selected bar', (await page.locator('.cap-bar.sel .cap-kf').count()) >= 2);

// lock: locked layers can't be dragged on the preview
await tool('Түгжих');
st = await S();
check('lock layer', st.project.layers.find((l) => l.id === tile0.id).locked === true);
await tool('Тайлах');

// audio: add sound effect + background music
await tool('Буцах');
await tool('Дуу');
await page.getByRole('button', { name: '＋ Add sound effect' }).tap();
await page.getByRole('button', { name: 'Add Whoosh', exact: true }).tap();
await wait(400);
await page.getByRole('button', { name: 'Close' }).tap();
await page.getByRole('button', { name: 'Built-in music…' }).tap();
await page.getByRole('button', { name: /^Add Lo-fi beat/ }).tap();
await wait(400);
await page.getByRole('button', { name: 'Close' }).tap();
await page.locator('.done-btn').tap();
st = await S();
check('sound effect + background music added', (st.project.audio || []).length === 2, (st.project.audio || []).map((c) => c.name).join(', '));
check('audio lanes on the timeline', (await page.locator('.cap-bar.bar-audio').count()) === 2);

// tap an audio clip → audio tools
await page.locator('.cap-bar.bar-audio').first().dispatchEvent('click');
await wait(200);
check('audio clip selected shows its tools', await page.locator('.cap-tool', { hasText: 'Дууны хэмжээ' }).isVisible());

// ratio
await tool('Буцах');
await tool('Харьцаа');
await page.locator('.ratio', { hasText: '1:1' }).tap();
await page.locator('.done-btn').tap();
check('ratio switch', (await S()).project.aspect === '1:1');

// templates from the editor + English switch on home
await tool('Загвар');
await page.locator('.tpl-main', { hasText: 'Bold Statement' }).tap();
await wait(1200);
await page.getByRole('button', { name: /Use this template/ }).tap();
await wait(600);
check('template from the editor', (await S()).project.name === 'Bold Statement');
await page.getByRole('button', { name: 'Нүүр' }).tap();
await page.locator('.seg.lang button', { hasText: 'EN' }).tap();
check('language switch to English', await page.getByText('New project').isVisible());
await page.locator('.continue').tap();
check('continue editing returns to the editor', await page.locator('.cap-tool', { hasText: 'Text' }).isVisible());

// export from the top button
await page.locator('.cap-top .export-btn').tap();
await page.waitForSelector('.export-form');
await page.locator('.export-form .prop', { hasText: 'Resolution' }).locator('select').selectOption({ index: 2 });
await ev(() => { const r = document.querySelector('.export-form input[type=range]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, '1'); r.dispatchEvent(new Event('input', { bubbles: true })); });
await page.locator('.export-form button.primary').tap();
await page.waitForSelector('.export-result, .notice.error', { timeout: 120000 });
const res = await page.locator('.sheet-body').innerText();
check('export works from the simple editor', /\.(webm|mp4|mov)/.test(res) && !/failed/i.test(res), res.split('\n')[0]);

await browser.close(); await server.close();

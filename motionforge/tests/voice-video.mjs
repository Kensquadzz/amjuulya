// Voice-over -> video in the browser: a synthetic narration (16 / 45 / 90 s)
// becomes a project of the same length with a distinct shot per phrase; frames
// across the whole film (incl. after 16 s) are rendered into a contact sheet.
// Usage: node tests/voice-video.mjs [outDir]
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const server = await createServer({ server: { port: 5191 }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost:5191/tests/harness.html');
const results = [];
const check = (n, ok, info = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${info ? '  — ' + info : ''}`);
const SCRIPT = ['Та оффист ажилладаг уу, эсвэл хувиараа бизнес эрхэлдэг үү?', 'Энэ багц танд их хэрэг болно.', 'Өргөдөл, албан бичиг, гэрээ, тушаал, хүний нөөцийн маягт', 'Тэр болгоныг шинээр бичихийн оронд', 'бэлэн загвараа аваад шууд ашиглаарай.', 'Зуу гаруй баримт бичгийн загвар нэг дор', 'Word, Excel дээр шууд засварлах боломжтой', 'Харин одоо Master Pack-ийг танилцуулъя', '40,000 төгрөгийн оронд 30,000 төгрөгөөр', 'Дэлгэрэнгүй мэдээлэл авах бол «1» гэж коммент бичээрэй.'];
for (const [dur, n] of [[16, 5], [45, 10], [90, 10]]) {
  const r = await p.evaluate(async ({ dur, n, script, sheet }) => {
    await import('/src/fonts.css');
    const { buildVoiceProject } = await import('/src/engine/voiceVideo.ts');
    const { Renderer } = await import('/src/engine/renderer.ts');
    // narration: n phrases of band-limited noise with pauses
    const sr = 22050, buf = new AudioBuffer({ length: dur * sr, sampleRate: sr, numberOfChannels: 1 }), d = buf.getChannelData(0);
    const slot = (dur - 1.2) / n;
    for (let k = 0; k < n; k++) { const a = 0.6 + k * slot, e = a + slot * 0.82; for (let i = Math.round(a * sr); i < Math.round(e * sr); i++) d[i] = (Math.random() * 2 - 1) * 0.3 * (0.5 + 0.5 * Math.sin(i / 900)); }
    const res = buildVoiceProject({ voice: { assetId: 'asset:test', name: 'test', duration: buf.duration, buffer: buf }, script: script.slice(0, n).join('\n'), brand: 'HR OFFICE MASTER PACK', accent: '#2f5bff', images: [], outro: 0.6, aspect: '9:16', subtitles: true, music: false });
    const proj = { ...res.project, audio: [] }; // the synthetic voice is not in storage; picture only
    const c = document.createElement('canvas');
    const rr = new Renderer(c, { preserveDrawingBuffer: true });
    rr.setSize(180, 320);
    await rr.prepareTextures(proj);
    const times = [];
    for (let t = 0.5; t < res.duration; t += res.duration / 14) times.push(+t.toFixed(2));
    const strip = document.createElement('canvas'); strip.width = 180 * times.length; strip.height = 320;
    const sx = strip.getContext('2d');
    const sig = [];
    for (let i = 0; i < times.length; i++) {
      rr.render(proj, times[i]); sx.drawImage(c, i * 180, 0);
      const px = sx.getImageData(i * 180 + 20, 40, 140, 160).data; let s = 0; for (let k = 0; k < px.length; k += 16) s += px[k] + 2 * px[k + 1] + 3 * px[k + 2]; sig.push(s);
    }
    const shots = proj.layers.filter((l) => l.type === 'scene3d').map((l) => ({ shot: l.params.shot, start: l.start, end: l.end }));
    return { duration: res.duration, speech: res.speech.length, issues: res.issues, shots, times, sig, url: sheet ? strip.toDataURL('image/png') : '' };
  }, { dur, n, script: SCRIPT, sheet: !!out });
  check(`${dur} s voice -> ${r.duration} s video`, Math.abs(r.duration - (dur + 0.6)) < 0.05);
  check(`${dur} s: ${r.speech} phrases detected`, r.speech === n, String(r.speech));
  check(`${dur} s: no storyboard errors`, !r.issues.some((i) => i.level === 'error'), JSON.stringify(r.issues));
  check(`${dur} s: shots cover the film`, r.shots[0].start === 0 && Math.abs(r.shots[r.shots.length - 1].end - r.duration) < 0.01 && r.shots.every((s, i) => i === 0 || s.start <= r.shots[i - 1].end));
  check(`${dur} s: no shot twice in a row`, r.shots.every((s, i) => i === 0 || s.shot !== r.shots[i - 1].shot), r.shots.map((s) => s.shot).join(' '));
  // after the old 16 s cutoff the picture keeps changing (not frozen, not blank)
  const late = r.sig.filter((_, i) => r.times[i] > 16);
  if (late.length > 2) check(`${dur} s: picture develops after 16 s`, new Set(late.map((v) => Math.round(v / 5000))).size >= Math.min(4, late.length - 1), `${late.length} frames`);
  if (out && r.url) writeFileSync(`${out}/voice-${dur}s.png`, Buffer.from(r.url.split(',')[1], 'base64'));
}
// the real UI: Home -> Voice-over -> Video with a 45 s WAV, then export
{
  const sr = 16000, dur = 45, n = 10, len = sr * dur, wav = Buffer.alloc(44 + len * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + len * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(len * 2, 40);
  const slot = (dur - 1.2) / n;
  for (let k = 0; k < n; k++) { const a = 0.6 + k * slot, e = a + slot * 0.82; for (let i = Math.round(a * sr); i < Math.round(e * sr); i++) wav.writeInt16LE(Math.round(Math.sin(i * 0.07) * Math.sin(i / 700) * 9000), 44 + i * 2); }
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('ui: ' + e.message));
  await page.goto('http://localhost:5191/');
  await page.waitForFunction(() => window.__motionforge);
  await page.locator('.voice-video').tap();
  await page.locator('.vv input[type=file]').first().setInputFiles({ name: 'voice-45s.wav', mimeType: 'audio/wav', buffer: wav });
  await page.waitForSelector('.vv .primary-file:has-text("0:45")', { timeout: 30000 });
  await page.locator('.vv-script').fill(SCRIPT.join('\n'));
  await page.locator('.vv .prop', { hasText: 'Брэнд' }).locator('input').fill('HR OFFICE MASTER PACK');
  await page.getByRole('button', { name: 'Storyboard гаргах' }).tap();
  const items = await page.locator('.vv-plan li').count();
  check('UI: storyboard lists every phrase', items === 10, String(items));
  await page.locator('.vv button.primary', { hasText: 'Видео үүсгэх' }).tap();
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => { const p = window.__motionforge.store.state.project; return { d: p.duration, shots: p.layers.filter((l) => l.type === 'scene3d').length, subs: p.layers.filter((l) => l.type === 'text').length, voice: p.audio.find((a) => a.assetId.startsWith('asset:'))?.duration }; });
  check('UI: project follows the voice', Math.abs(st.d - 45.6) < 0.05 && Math.abs(st.voice - 45) < 0.05, JSON.stringify(st));
  check('UI: shots and subtitles created', st.shots === 10 && st.subs >= 10, JSON.stringify(st));
  await page.locator('.cap-top .export-btn').tap();
  await page.waitForSelector('.export-form');
  await page.locator('.export-form .prop', { hasText: 'Resolution' }).locator('select').selectOption({ index: 3 });
  const full = await page.evaluate(() => document.querySelector('.export-form input[type=range]').max);
  check('UI: export offers the full 45.6 s', Math.abs(+full - 45.6) < 0.05, full);
  await page.evaluate(() => { const r = document.querySelector('.export-form input[type=range]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, '45.6'); r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('.export-form button.primary').tap();
  await page.waitForSelector('.export-result, .notice.error', { timeout: 900000 });
  const res = await page.locator('.sheet-body').innerText();
  check('UI: full-length export with the voice', /✓ verified/.test(res) && /136[78] frames/.test(res) && /Sound: included/.test(res), res.split('\n').slice(0, 3).join(' | '));
  await ctx.close();
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(results.join('\n'));
await b.close(); await server.close();
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);

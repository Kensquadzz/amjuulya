// Screenshot the app at iPhone size. Usage: node tests/shots.mjs <outdir>
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
const out = process.argv[2] || 'test-results';
const server = await createServer({ server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
await page.goto('http://localhost:5198/');
await page.waitForSelector('canvas');
await page.waitForTimeout(2500);
for (const tab of ['Timeline', 'Inspect', 'Layers', 'Presets', 'Code']) {
  await page.getByRole('tab', { name: new RegExp(tab) }).tap();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${tab.toLowerCase()}.png` });
}
console.log(JSON.stringify(errors));
await browser.close(); await server.close();

// Runs browser checks in headless Chromium. Usage: npm run test:e2e
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const target = process.argv[2] || 'harness';
if (target === 'harness') {
  await page.goto('http://localhost:5199/tests/harness.html');
  await page.waitForFunction(() => typeof window.runChecks === 'function');
  const res = await page.evaluate(() => window.runChecks());
  console.log(JSON.stringify(res, null, 1));
}
if (errors.length) console.log('PAGE ERRORS:', errors);
await browser.close();
await server.close();

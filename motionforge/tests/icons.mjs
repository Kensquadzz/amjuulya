// Rasterize public/icon.svg to the PNG sizes iOS needs.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const s of [180, 512]) {
  const page = await browser.newPage({ viewport: { width: s, height: s } });
  await page.setContent(`<style>html,body{margin:0}</style>${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}`);
  await page.screenshot({ path: new URL(`../public/icon-${s}.png`, import.meta.url).pathname, omitBackground: true });
  await page.close();
}
await browser.close();

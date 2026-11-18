// Renders assets/icon.svg to the PNG sizes the manifest uses. Run: node scripts/render-icons.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const svg = readFileSync('assets/icon.svg', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await page.screenshot({ path: `public/icon/${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons written to public/icon/');

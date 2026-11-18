// Design review screenshots of extension pages. Usage:
//   node tests/e2e/shots.mjs [outDir] [route ...]       e.g. node tests/e2e/shots.mjs /tmp/shots mychannel reports/health
// Env: LANG_UI=fa|en (default fa), THEME=dark|light (default dark), WIDTH (default 1440), PAGE=workspace|sidepanel|popup.
// Seeds a few local records so screens are not all empty. No network: YouTube URLs are served from fixtures.
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const EXT = resolve(process.env.EXT_DIR ?? '.output/chrome-mv3');
const EXE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const [outDir = '/tmp/tubex-shots', ...routes] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const width = Number(process.env.WIDTH ?? 1440);
const page = process.env.PAGE ?? 'workspace';

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tubex-shots-')), {
  executablePath: EXE,
  headless: true,
  viewport: { width, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const fixture = readFileSync('tests/fixtures/youtube-watch.html', 'utf8');
await ctx.route('https://www.youtube.com/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture }));
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
const p = await ctx.newPage();
await p.goto(`chrome-extension://${id}/workspace.html`);
await p.evaluate(
  async ({ lang, theme }) => {
    await chrome.storage.local.set({ prefs: { uiLanguage: lang, theme, pageAdapterEnabled: true } });
  },
  { lang: process.env.LANG_UI ?? 'fa', theme: process.env.THEME ?? 'dark' },
);
for (const route of routes.length ? routes : ['mychannel']) {
  const url = page === 'workspace' ? `chrome-extension://${id}/workspace.html#${route}` : `chrome-extension://${id}/${page}.html`;
  await p.goto('about:blank');
  await p.goto(url);
  await p.waitForTimeout(800);
  const file = join(outDir, `${page}-${route.replaceAll('/', '_')}-${process.env.LANG_UI ?? 'fa'}-${process.env.THEME ?? 'dark'}-${width}.png`);
  await p.screenshot({ path: file, fullPage: process.env.FULL === '1' });
  console.log(file);
}
await ctx.close();

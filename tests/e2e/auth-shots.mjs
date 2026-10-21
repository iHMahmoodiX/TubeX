// Design review screenshots for sign-in renewal, reconnect, bulk sign-in notice and backups (0.5.1). Usage:
//   npm run build && node tests/e2e/auth-shots.mjs [outDir]
// Env: LANG_UI=fa|en (default fa), THEME=dark|light (default dark). No network; nothing signs in for real.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const EXT = resolve(process.env.EXT_DIR ?? '.output/chrome-mv3');
const EXE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const [outDir = '/tmp/tubex-auth-shots'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const lang = process.env.LANG_UI ?? 'fa';
const theme = process.env.THEME ?? 'dark';
const A = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const B = 'UCbbbbbbbbbbbbbbbbbbbbbb';

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tubex-auth-')), {
  executablePath: EXE,
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
const p = await ctx.newPage();
const shot = async (name) => {
  const file = join(outDir, `auth-${name}-${lang}-${theme}.png`);
  await p.screenshot({ path: file });
  console.log(file);
};
const scrollTo = async (sel) => {
  await p.locator(sel).first().scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
};

await p.goto(`chrome-extension://${id}/workspace.html`);
// Signed out first: bulk opened from Studio with a selection.
await p.evaluate(async ({ lang, theme }) => chrome.storage.local.set({ prefs: { uiLanguage: lang, theme, pageAdapterEnabled: true } }), { lang, theme });
await p.goto(`chrome-extension://${id}/workspace.html#bulk/ids=dQw4w9WgXcQ`);
await p.waitForTimeout(800);
await shot('bulk-signed-out');

// Two channels, the Brand one needs a reconnect; an API key saved without the host permission.
await p.evaluate(
  async ({ A, B }) => {
    await chrome.storage.local.set({
      google: {
        channels: [
          { channelId: A, title: 'Hossein', handle: '@hossein', connectedAt: '2026-10-01', sub: '1' },
          { channelId: B, title: 'Figma Farsi', handle: '@figmafa', connectedAt: '2026-10-01', sub: '2' },
        ],
        activeChannelId: B,
      },
      integrations: { youtube: { apiKey: 'demo-key-not-real', region: 'US', language: 'fa', dailyUnitCap: 8000 } },
    });
    await chrome.storage.session.set({ authBootDone: true, googleAuthStatus: { [B]: { reconnect: true, at: new Date().toISOString() } } });
  },
  { A, B },
);
await p.goto('about:blank');
await p.goto(`chrome-extension://${id}/workspace.html#settings`);
await p.waitForTimeout(800);
await scrollTo('[data-testid="google-settings"]');
await shot('settings-google');
await scrollTo('[data-testid="yt-settings"] >> text=/Allow access|اجازهٔ دسترسی/');
await shot('settings-youtube');
await scrollTo('[data-testid="update-note"]');
await shot('settings-data');

// Import an older (format 1) backup with a few skipped records.
const legacy = {
  app: 'tubex',
  format: 1,
  exportedAt: '2026-09-01T10:00:00.000Z',
  appVersion: '0.2.0',
  data: {
    ideas: [{ id: 'i1', text: 'ایده' }, { id: 'i2', text: '' }, { id: 'i1', text: 'dup' }],
    drafts: [{ id: 'd1', title: 'عنوان', tags: 'a, b' }],
    watchlist: [{ id: 'w1', channelId: 'bad' }],
  },
};
const file = join(mkdtempSync(join(tmpdir(), 'tubex-bk-')), 'old.json');
writeFileSync(file, JSON.stringify(legacy));
await p.locator('input[type=file]').setInputFiles(file);
await p.waitForTimeout(400);
await scrollTo('[data-testid="import-collections"]');
await shot('import-preview');

await p.goto(`chrome-extension://${id}/workspace.html#bulk`);
await p.waitForTimeout(800);
await shot('bulk-reconnect');
await ctx.close();

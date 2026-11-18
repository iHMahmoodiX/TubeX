// Design review screenshots of bulk find & replace, with a real run of the background job against a mocked
// YouTube Data API (videos.list / videos.update in memory). Usage:
//   npm run build && node tests/e2e/bulk-shots.mjs [outDir]
// Env: LANG_UI=fa|en (default fa), THEME=dark|light (default dark), WIDTH (default 1100).
// No network: www.googleapis.com is answered from the in-memory fake below. A temporary copy of the build gets
// the googleapis host permission (as after the owner allows it); the real build is not changed.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const SRC = resolve(process.env.EXT_DIR ?? '.output/chrome-mv3');
const EXE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const [outDir = '/tmp/tubex-bulk-shots'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const width = Number(process.env.WIDTH ?? 1100);
const lang = process.env.LANG_UI ?? 'fa';
const theme = process.env.THEME ?? 'dark';

const EXT = mkdtempSync(join(tmpdir(), 'tubex-ext-'));
cpSync(SRC, EXT, { recursive: true });
const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://www.googleapis.com/*'])];
writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(manifest));

const OWN = 'UCownownownownownownown1';
const day = 86_400_000;
const ago = (d) => new Date(Date.now() - d * day).toISOString();
const OLD = 'لینک‌های ما:\nاینستاگرام: instagram.com/figmafa\nتلگرام: t.me/figmafa_old\nسایت: https://old-academy.ir/courses';
const intro = (t) => `در این ویدیو ${t} را قدم به قدم یاد می‌گیریم.\nفصل‌ها:\n00:00 مقدمه\n01:20 شروع کار\n05:40 جمع‌بندی\n\nاگر سؤالی داشتید در کامنت‌ها بپرسید.`;
const TITLES = [
  'آموزش Auto Layout در فیگما',
  'ساخت دیزاین سیستم از صفر',
  'Figma Variables in 10 minutes',
  'پروتوتایپ پیشرفته در فیگما',
  'رنگ‌بندی رابط کاربری',
  'تایپوگرافی فارسی در وب',
  'نکته سریع: کامپوننت‌ها',
  'آموزش Dev Mode',
  'مصاحبه با یک طراح محصول',
  'دوره جامع UI قسمت ۱',
  'دوره جامع UI قسمت ۲',
  'ویدیوی بدون لینک',
];
const videos = {};
TITLES.forEach((title, i) => {
  const id = `vid${String(i).padStart(8, '0')}`;
  let links = OLD;
  if (i === 2) links = OLD.replace(/\n/g, '  \r\n').replace('سایت: ', 'سایت:    '); // Windows line ends, extra spaces
  if (i === 4) links = OLD.replace(/ی/g, 'ي').replace(/ک/g, 'ك'); // Arabic letters
  if (i === 6) links = `${OLD}\nیوتیوب دوم: youtube.com/@figmafa2`;
  let description = i === 11 ? intro(title) : `${intro(title)}\n\n${links}`;
  if (i === 9) {
    // Close to the 5,000-byte limit: the longer new block would break it, so this video is skipped.
    let pad = '';
    while (Buffer.byteLength(`${intro(title)}\n\n${pad}\n\n${OLD}`) < 4960) pad += 'توضیح بیشتر. ';
    description = `${intro(title)}\n\n${pad}\n\n${OLD}`;
  }
  videos[id] = {
    snippet: { title, description, tags: ['فیگما', 'آموزش', 'UI'], categoryId: '27', defaultLanguage: 'fa', defaultAudioLanguage: 'fa', channelId: OWN, channelTitle: 'Figma Farsi', publishedAt: ago(5 + i * 23), thumbnails: {} },
    statistics: { viewCount: String(900 + i * 431) },
    contentDetails: { duration: i === 6 ? 'PT48S' : `PT${8 + i}M${i * 3}S` },
    status: { privacyStatus: i === 8 ? 'unlisted' : i === 10 ? 'private' : 'public' },
    localizations: i === 1 ? { en: { title: 'Design system', description: 'x' } } : undefined,
  };
});
const ids = Object.keys(videos);

function api(method, url, body) {
  const u = new URL(url);
  const res = u.pathname.split('/').pop();
  if (method === 'PUT' && res === 'videos') {
    const b = JSON.parse(body);
    videos[b.id].snippet = { ...videos[b.id].snippet, ...b.snippet };
    return { id: b.id, snippet: videos[b.id].snippet };
  }
  if (res === 'videos')
    return { items: (u.searchParams.get('id') ?? '').split(',').filter((id) => videos[id]).map((id) => ({ id, ...structuredClone(videos[id]) })) };
  if (res === 'playlistItems') return { items: ids.map((videoId) => ({ contentDetails: { videoId } })) };
  if (res === 'playlists') return { items: [{ id: 'PL1', snippet: { title: 'دوره جامع UI', publishedAt: ago(100) }, contentDetails: { itemCount: 2 }, status: { privacyStatus: 'public' } }] };
  return { items: [] };
}

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tubex-bulk-')), {
  executablePath: EXE,
  headless: true,
  viewport: { width, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await ctx.route('https://www.googleapis.com/**', async (r) => {
  const req = r.request();
  await new Promise((ok) => setTimeout(ok, 60));
  r.fulfill({ contentType: 'application/json', body: JSON.stringify(api(req.method(), req.url(), req.postData())) });
});
// Thumbnails: a flat grey PNG.
const THUMB = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#3a3a3a"/><rect x="24" y="120" width="180" height="20" rx="4" fill="#6a6a6a"/></svg>';
await ctx.route('https://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: THUMB }));
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
const p = await ctx.newPage();
const shot = async (name, full = false) => {
  const file = join(outDir, `bulk-${name}-${lang}-${theme}-${width}.png`);
  await p.waitForTimeout(250);
  await p.screenshot({ path: file, fullPage: full });
  console.log(file);
};
const to = async (sel) => {
  await p.locator(sel).first().scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, -12));
  await p.waitForTimeout(250);
};

await p.goto(`chrome-extension://${extId}/workspace.html`);
await p.evaluate(
  async ({ OWN, lang, theme }) => {
    await chrome.storage.local.set({
      prefs: { uiLanguage: lang, theme, pageAdapterEnabled: true },
      google: { channels: [{ channelId: OWN, title: 'Figma Farsi', handle: '@figmafa', uploadsPlaylistId: 'UUownownownownownownown1', connectedAt: '2026-10-01', sub: '1' }], activeChannelId: OWN },
      integrations: { youtube: { apiKey: '', region: 'US', language: 'fa', dailyUnitCap: 1400 } },
    });
    await chrome.storage.session.set({ authBootDone: true, googleTokens: { [OWN]: { accessToken: 'tok', expiresAt: Date.now() + 3600_000, scopes: [] } } });
  },
  { OWN, lang, theme },
);
await p.goto('about:blank');
await p.goto(`chrome-extension://${extId}/workspace.html#bulk`);
await p.getByTestId('bulk-find').waitFor();
await p.waitForTimeout(800);
await shot('1-find');

// Paste the old link block and the new one.
await p.getByTestId('bulk-find').fill(OLD);
await p.getByTestId('bulk-replace').fill('لینک‌های ما:\nاینستاگرام: instagram.com/figmafa\nکانال تلگرام: t.me/figmafa\nسایت و دوره‌ها: https://figmafa.academy/courses\nیوتیوب انگلیسی: youtube.com/@figmafa_en');
await p.getByTestId('bulk-preview').waitFor();
await p.waitForTimeout(500);
await to('[data-testid="bulk-preview"]');
await shot('2-preview');
await p.locator('.fr-skipped summary').click();
await to('.fr-skipped');
await shot('3-skipped');
await to('[data-testid="bulk-run"]');
await shot('4-run');

// Regex mode with an error, then valid.
await p.getByRole('button', { name: lang === 'fa' ? 'عبارت باقاعده (Regex)' : 'Regular expression' }).click();
await p.getByTestId('bulk-find').fill('t\\.me/(\\w+');
await to('[data-testid="bulk-find"]');
await shot('5-regex-error');
await p.getByTestId('bulk-find').fill(OLD);
await p.getByRole('button', { name: lang === 'fa' ? 'عبارت باقاعده (Regex)' : 'Regular expression' }).click();

// Run for real: cap 1400 units leaves room for some videos today; the rest waits for the reset.
await p.evaluate(async () => chrome.storage.local.set({ usage: { month: '', ytDay: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()), ytUnits: 1100 } }));
await to('[data-testid="bulk-run"]');
await p.getByTestId('bulk-run-all').click();
await p.waitForTimeout(200);
await shot('6-confirm');
await p.locator('[data-testid="bulk-run"] .notice-warning .btn-primary').click();
await p.locator('.fr-job[data-status="waiting"]').waitFor({ timeout: 30_000 });
await p.waitForTimeout(800);
await to('[data-testid="bulk-jobs"]');
await shot('7-job-waiting');
await p.locator('.fr-res[data-state="written"] .fr-expand').first().click();
await shot('8-job-detail');

// Raise the cap to 10,000 and continue now: the rest is written.
await p.evaluate(async () => {
  const { integrations } = await chrome.storage.local.get('integrations');
  await chrome.storage.local.set({ integrations: { ...integrations, youtube: { ...integrations.youtube, dailyUnitCap: 10000 } } });
});
await p.locator('.fr-job[data-status="waiting"] .btn-primary').first().click();
await p.locator('.fr-job[data-status="done"]').first().waitFor({ timeout: 30_000 });
await p.waitForTimeout(600);
await to('[data-testid="bulk-jobs"]');
await shot('9-job-done');

// A video edited by hand after the change, then undo all: it is flagged, not overwritten.
const edited = ids[0];
videos[edited].snippet.description += '\nویرایش دستی بعد از TubeX';
await p.locator('.fr-job[data-status="done"]').first().locator('.btn').filter({ hasText: lang === 'fa' ? 'بازگردانی' : 'Undo' }).first().click();
await p.locator('.fr-job .notice-warning .btn-primary').first().click();
await p.waitForTimeout(500);
await p.locator('.fr-job[data-status="done"]').first().waitFor({ timeout: 30_000 });
await p.locator('.fr-job').first().locator('.chip').filter({ hasText: lang === 'fa' ? 'ویرایش‌شده' : 'Edited since' }).click();
await p.locator('.fr-res[data-state="conflict"] .fr-expand').first().click();
await to('[data-testid="bulk-jobs"]');
await shot('10-undo-conflict');
const stillEdited = videos[edited].snippet.description.includes('ویرایش دستی');
console.log(`conflict kept: ${stillEdited}; restored others: ${ids.filter((id) => id !== edited && videos[id].snippet.description.includes('old-academy')).length}`);

// Narrow width.
await p.setViewportSize({ width: 420, height: 900 });
await p.goto(`chrome-extension://${extId}/workspace.html#bulk`);
await p.getByTestId('bulk-find').waitFor();
await p.getByTestId('bulk-find').fill('instagram.com/figmafa');
await p.getByTestId('bulk-replace').fill('instagram.com/figma.farsi');
await p.getByTestId('bulk-preview').waitFor();
await to('[data-testid="bulk-preview"]');
const file = join(outDir, `bulk-11-narrow-${lang}-${theme}-420.png`);
await p.screenshot({ path: file });
console.log(file);
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(`horizontal overflow at 420px: ${overflow}px`);
await ctx.close();

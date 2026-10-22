// Design review screenshots of the tag tools at Studio's Tags field (#4) on a synthetic Studio editor. Usage:
//   npm run build && node tests/e2e/tagTools-shots.mjs [outDir] [scenario ...]
// Scenarios: field ranks pop sort import recommended translate switcher card
// Env: LANG_UI=fa|en (default fa), THEME=dark|light|both (default dark), WIDTH (default 1440).
// No network: studio.youtube.com is served from the inline fixture below, the YouTube Data and Analytics APIs from
// canned JSON, thumbnails from generated SVGs. A temporary copy of the build gets the googleapis host permissions
// (normally granted at runtime by the owner); a fake OAuth token sits in session storage. The real build is unchanged.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const SRC = resolve(process.env.EXT_DIR ?? '.output/chrome-mv3');
const EXE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const [outDir = '/tmp/tubex-tagtools-shots', ...asked] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const width = Number(process.env.WIDTH ?? 1440);
const lang = process.env.LANG_UI ?? 'fa';
const themes = process.env.THEME === 'both' ? ['dark', 'light'] : [process.env.THEME ?? 'dark'];

const EXT = mkdtempSync(join(tmpdir(), 'tubex-ext-'));
cpSync(SRC, EXT, { recursive: true });
const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://www.googleapis.com/*', 'https://youtubeanalytics.googleapis.com/*'])];
writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(manifest));

// ---------------------------------------------------------------- fixture (Inferred Studio layout)
const ME = 'dQw4w9WgXcQ';
const TAGS = ['حسین محمودی', 'Hossein Mahmoodi', 'LearnUIX', 'آموزش Adobe XD', 'طراحی رابط کاربری', 'آموزش UI UX', 'چیدمان در طراحی', 'ابزار Alignment در ایکس دی', 'آموزش ادوبی ایکس دی', 'طراحی محصول', 'یادگیری UI', 'دیزاین حرفه ای', 'فاصله گذاری در طراحی', 'ابزار Distribute'];
const chips = TAGS.map((t) => `<ytcp-chip><span id="chip-text">${t}</span><tp-yt-iron-icon id="delete-icon">✕</tp-yt-iron-icon></ytcp-chip>`).join('');
const FIXTURE = `<!doctype html>
<html dark lang="en"><head><meta charset="utf-8"><title>Video details - YouTube Studio</title>
<style>
html { background: #f9f9f9; color: #0d0d0d; font: 14px Roboto, Arial, sans-serif; } html[dark] { background: #282828; color: #fff; }
body { margin: 0; background: inherit; }
ytcp-video-metadata-editor { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 24px; max-width: 1180px; margin: 0 auto; padding: 24px; }
h1 { font-size: 28px; margin: 0 0 16px; }
.box { display: block; border: 1px solid #606060; border-radius: 4px; padding: 8px 12px; margin-bottom: 16px; }
.box label { font-size: 12px; color: #aaa; display: block; }
#textbox { outline: none; min-height: 24px; white-space: pre-wrap; }
#description-textarea #textbox { min-height: 90px; }
.section-title { font-size: 16px; font-weight: 500; margin: 16px 0 4px; } .section-desc { font-size: 13px; color: #aaa; margin: 0 0 8px; }
#tags-container { display: block; }
ytcp-free-text-chip-bar { display: block; border: 1px solid #909090; border-radius: 4px; padding: 8px; }
ytcp-chip { display: inline-flex; align-items: center; gap: 6px; background: #3f3f3f; border-radius: 16px; padding: 4px 10px; margin: 3px; direction: rtl; }
html:not([dark]) ytcp-chip { background: #e5e5e5; }
#delete-icon { cursor: pointer; font-size: 12px; opacity: .8; }
#text-input { background: transparent; border: 0; color: inherit; min-width: 120px; }
.help { display: flex; justify-content: space-between; font-size: 12px; color: #aaa; margin-top: 4px; }
.preview { aspect-ratio: 16/9; background: #000; border-radius: 4px; margin-bottom: 16px; }
</style></head>
<body><ytcp-app>
<ytcp-video-metadata-editor>
  <div>
    <h1>Video details</h1>
    <ytcp-video-metadata-editor-basics>
      <ytcp-video-title><ytcp-social-suggestions-textbox id="title-textarea" class="box"><label>Title (required)</label><div id="textbox" contenteditable="true" role="textbox">دوره جامع Adobe XD | چیدمان و تراز کردن اشیا (قسمت ۶)</div></ytcp-social-suggestions-textbox></ytcp-video-title>
      <ytcp-video-description><ytcp-social-suggestions-textbox id="description-textarea" class="box"><label>Description</label><div id="textbox" contenteditable="true" role="textbox">در این قسمت ابزارهای Alignment و Distribute را یاد می‌گیریم.<br>0:00 مقدمه<br>1:10 تراز کردن</div></ytcp-social-suggestions-textbox></ytcp-video-description>
    </ytcp-video-metadata-editor-basics>
    <ytcp-video-metadata-editor-advanced>
      <div class="section-title">Tags</div>
      <p class="section-desc">Tags can be useful if content in your video is commonly misspelled. Otherwise, tags play a minimal role in helping viewers find your video.</p>
      <ytcp-form-input-container id="tags-container">
        <ytcp-free-text-chip-bar><div id="chip-bar">${chips}<input id="text-input" aria-label="Tags"></div></ytcp-free-text-chip-bar>
        <div class="help"><span>Enter a comma after each tag</span><span>0/500</span></div>
      </ytcp-form-input-container>
      <div class="section-title">Language and captions</div>
      <div class="box"><label>Video language</label>Persian</div>
    </ytcp-video-metadata-editor-advanced>
  </div>
  <ytcp-video-metadata-editor-sidepanel><div class="preview"></div><div class="box"><label>Video link</label>https://youtu.be/${ME}</div></ytcp-video-metadata-editor-sidepanel>
</ytcp-video-metadata-editor>
</ytcp-app>
<script>
// Minimal chip-bar behaviour: delete icons remove chips; Enter turns typed comma-separated text into chips.
document.addEventListener('click', (e) => { if (e.target.id === 'delete-icon') e.target.closest('ytcp-chip').remove(); });
document.addEventListener('keydown', (e) => {
  const i = e.target; if (e.key !== 'Enter' || i.id !== 'text-input') return;
  for (const t of i.value.split(',').map((x) => x.trim()).filter(Boolean)) {
    const c = document.createElement('ytcp-chip'); c.innerHTML = '<span id="chip-text"></span><tp-yt-iron-icon id="delete-icon">✕</tp-yt-iron-icon>';
    c.querySelector('#chip-text').textContent = t; i.before(c);
  }
  i.value = '';
});
</script></body></html>`;

// ---------------------------------------------------------------- mock APIs
const OWN = 'UCownownownownownownown1';
const OTHER = 'UCabcdefghijklmnopqrstuv';
const day = 86_400_000;
const ago = (d) => new Date(Date.now() - d * day).toISOString();
const POOL_TAGS = ['آموزش Adobe XD', 'ادوبی ایکس دی', 'طراحی UI', 'آموزش فیگما', 'UI UX', 'طراحی رابط کاربری', 'adobe xd tutorial', 'xd alignment', 'طراحی اپلیکیشن', 'اصول دیزاین', 'دیزاین سیستم', 'وایرفریم', 'پروتوتایپ', 'آموزش رایگان UI', 'learn adobe xd', 'ui design', 'auto layout'];
const vid = (id, i, own = false) => ({
  id,
  snippet: { title: own ? `دوره جامع Adobe XD — قسمت ${i + 1}` : `Video ${i}`, description: '', channelId: own ? OWN : OTHER, channelTitle: own ? 'Hossein Studio' : 'Sample', publishedAt: ago(5 + i * 9), tags: POOL_TAGS.filter((_, k) => (k + i) % 3 !== 0).slice(0, 10), thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } } },
  statistics: { viewCount: String(5000 + i * 7300), likeCount: '300', commentCount: '20' },
  contentDetails: { duration: 'PT9M' },
  status: { privacyStatus: i === 1 ? 'unlisted' : i === 6 ? 'private' : 'public' },
});
const OWN_IDS = Array.from({ length: 14 }, (_, i) => (i === 3 ? ME : `own${String(i).padStart(8, '0')}`));
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.codePointAt(0)) >>> 0, 7);
function api(url) {
  const u = new URL(url);
  const res = u.pathname.split('/').pop();
  if (u.hostname === 'youtubeanalytics.googleapis.com') {
    const rows = [['آموزش adobe xd', 820, 4100], ['ادوبی ایکس دی', 410, 2000], ['طراحی ui', 180, 700], ['adobe xd tutorial', 95, 300], ['آموزش فیگما', 60, 240]];
    return { columnHeaders: [{ name: 'insightTrafficSourceDetail' }, { name: 'views' }, { name: 'estimatedMinutesWatched' }], rows };
  }
  if (res === 'videos') return { items: (u.searchParams.get('id') ?? '').split(',').filter(Boolean).map((id) => vid(id, OWN_IDS.includes(id) ? OWN_IDS.indexOf(id) : hash(id) % 20, OWN_IDS.includes(id))) };
  if (res === 'channels') return { items: [{ id: u.searchParams.get('id')?.split(',')[0] ?? OWN, snippet: { title: 'Hossein Studio', customUrl: '@hossein', description: '', publishedAt: ago(2000) }, statistics: { subscriberCount: '52400', viewCount: '8420000', videoCount: '214' }, contentDetails: { relatedPlaylists: { uploads: 'UU' + OWN.slice(2) } } }] };
  if (res === 'playlistItems') return { items: OWN_IDS.map((videoId) => ({ contentDetails: { videoId } })) };
  if (res === 'search') {
    const q = u.searchParams.get('q') ?? '';
    const n = Number(u.searchParams.get('maxResults') ?? 25);
    const ids = Array.from({ length: n }, (_, i) => `s${String(hash(q) % 1000).padStart(4, '0')}${String(i).padStart(6, '0')}`);
    const h = hash(q) % 5;
    if (h !== 0) ids.splice(Math.min(n - 1, (hash(q) % 4) * 6 + (h === 1 ? 0 : 2)), 0, ME); // our video somewhere, or absent
    return { items: ids.slice(0, n).map((videoId) => ({ id: { videoId }, snippet: { title: 'Result', channelId: OTHER, channelTitle: 'Sample', publishedAt: ago(30) } })) };
  }
  return { items: [] };
}
const THUMB = (id) => `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#${(hash(id) & 0xffffff).toString(16).padStart(6, '0')}"/><stop offset="1" stop-color="#d946ef"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><text x="16" y="160" font-family="Arial" font-size="36" font-weight="700" fill="#fff">XD</text></svg>`;

// ---------------------------------------------------------------- scenarios
const SCENES = ['field', 'ranks', 'pop', 'sort', 'import', 'recommended', 'translate', 'switcher', 'card'];
const names = asked.length ? asked : SCENES;

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tubex-tt-')), {
  executablePath: EXE,
  headless: true,
  viewport: { width, height: 1000 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await ctx.route('https://studio.youtube.com/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: FIXTURE }));
await ctx.route('https://www.googleapis.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(api(r.request().url())) }));
await ctx.route('https://youtubeanalytics.googleapis.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(api(r.request().url())) }));
await ctx.route('https://i.ytimg.com/**', (r) => r.fulfill({ contentType: 'image/svg+xml', body: THUMB(r.request().url()) }));
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
const setup = await ctx.newPage();
await setup.goto(`chrome-extension://${id}/workspace.html`);
await setup.waitForTimeout(800);
await setup.evaluate(
  async ({ lang, OWN }) => {
    await chrome.storage.local.set({
      prefs: { uiLanguage: lang, theme: 'dark', pageAdapterEnabled: true },
      integrations: { youtube: { apiKey: 'TEST-KEY', region: 'IR', language: 'fa', dailyUnitCap: 100000 }, ai: { enabled: true, baseUrl: 'http://localhost:11434/v1', model: 'qwen3:8b', apiKey: '', monthlyRequestCap: 1000 } },
      google: { channels: [{ channelId: OWN, title: 'Hossein Studio', handle: '@hossein', uploadsPlaylistId: 'UU' + OWN.slice(2), connectedAt: new Date().toISOString() }], activeChannelId: OWN },
      'inpage.tt.switcherOpen': false,
    });
    await chrome.storage.session.set({ googleTokens: { [OWN]: { accessToken: 'TEST-TOKEN', expiresAt: Date.now() + 3600_000 } } });
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('tubex');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const now = new Date().toISOString();
    await new Promise((res, rej) => {
      const tx = db.transaction('templates', 'readwrite');
      tx.objectStore('templates').put({ id: 't1', createdAt: now, updatedAt: now, rev: 0, name: lang === 'fa' ? 'تگ‌های دوره XD' : 'XD course tags', description: '', tags: ['آموزش Adobe XD', 'LearnUIX', 'دوره رایگان XD', 'ادوبی ایکس دی'] });
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  },
  { lang, OWN },
);
await setup.close();

const p = await ctx.newPage();
p.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
p.on('pageerror', (e) => console.error('[pageerror]', e.message));
const tools = () => p.locator('tubex-tag-tools').first();
const shot = async (name, theme, clip) => {
  const file = join(outDir, `tt-${name}-${lang}-${theme}-${width}.png`);
  await p.screenshot({ path: file, fullPage: true, clip });
  console.log(file);
};

for (const theme of themes) {
  for (const name of names) {
    await p.goto('about:blank');
    await p.goto(`https://studio.youtube.com/video/${ME}/edit`);
    if (theme === 'light') await p.evaluate(() => document.documentElement.removeAttribute('dark'));
    try {
      await p.waitForSelector('tubex-tag-tools', { timeout: 8000, state: 'attached' });
    } catch {
      console.error(`${name}: tubex-tag-tools did not appear`);
      continue;
    }
    await p.waitForTimeout(1200);
    try {
      if (name === 'ranks' || name === 'pop') {
        await tools().getByRole('button', { name: lang === 'fa' ? 'نمایش رتبه‌ها' : 'Show rankings' }).click();
        await p.waitForTimeout(600);
        await tools().locator('.tx-confirm button').first().click();
        await p.waitForSelector('tubex-tag-badge', { state: 'attached', timeout: 15000 });
        await p.waitForTimeout(1500);
      }
      if (name === 'pop') {
        await p.locator('ytcp-chip #chip-text').nth(3).dblclick();
        await p.waitForTimeout(800);
        const pop = p.locator('tubex-tag-pop').first();
        const confirm = pop.locator('.tx-confirm button');
        if (await confirm.count()) await confirm.first().dispatchEvent('click');
        await p.waitForTimeout(1500);
      }
      if (name === 'sort') await tools().locator('.tt-tool').nth(1).click();
      if (name === 'import') await tools().locator('.tt-tool').nth(2).click();
      if (name === 'translate') await tools().locator('.tt-tool').nth(3).click();
      if (name === 'recommended') {
        const btn = tools().locator('.tt-sources button').first();
        await btn.click();
        await p.waitForTimeout(400);
        await tools().locator('.tt-rec .tx-confirm button').first().click();
        await p.waitForTimeout(2000);
        await tools().locator('.tt-rec [role="radio"]').nth(2).click();
      }
      if (name === 'switcher') {
        await p.locator('tubex-video-switcher').first().locator('.tt-sw-tab').click();
        await p.waitForTimeout(2000);
      }
      await p.waitForTimeout(700);
    } catch (e) {
      console.error(`${name}: ${e.message.split('\n')[0]}`);
    }
    if (name === 'switcher' || name === 'pop') await shot(name, theme);
    else if (name === 'card') await shot(name, theme, undefined);
    else {
      const box = await p.locator('#tags-container').boundingBox();
      const under = await tools().boundingBox();
      const top = Math.max(0, (box?.y ?? 0) - 90);
      const bottom = (under?.y ?? 0) + (under?.height ?? 600) + 16;
      await shot(name, theme, { x: Math.max(0, (box?.x ?? 0) - 24), y: top, width: Math.min(width, (box?.width ?? 800) + 48), height: Math.max(200, bottom - top) });
    }
  }
}
await ctx.close();

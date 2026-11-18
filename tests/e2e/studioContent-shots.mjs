// Design review screenshots of the Studio Content page tools (#2, #3) on synthetic Studio fixtures. Usage:
//   npm run build && node tests/e2e/studioContent-shots.mjs [outDir] [scenario ...]
// Scenarios: menu selection related kids kids-confirm edit coppa, and the #8 placement scenes live-* (see SCENES). Env: LANG_UI=fa|en (default fa), THEME=dark|light, WIDTH.
// No network: studio.youtube.com is served from tests/fixtures/studioContent-*.html and the YouTube Data API from
// canned JSON below. A temporary copy of the build gets the googleapis host permission; the real build is not changed.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const SRC = resolve(process.env.EXT_DIR ?? '.output/chrome-mv3');
const EXE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const [outDir = '/tmp/tubex-sc-shots', ...asked] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const width = Number(process.env.WIDTH ?? 1440);
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
const VIDEOS = {
  aaaaaaaaaa1: { title: 'سرویس جدید XpertAI، خیلی کاربردی', dur: 'PT33S', kids: { madeForKids: false, selfDeclaredMadeForKids: false } },
  bbbbbbbbbb2: { title: 'انتخاب سریع با چوب جادو در فتوشاپ', dur: 'PT1M5S', kids: { madeForKids: true } },
  cccccccccc3: { title: 'آموزش دقیق کردن دورگیری در فتوشاپ - Refine Edge', dur: 'PT1M4S', kids: { madeForKids: false, selfDeclaredMadeForKids: false } },
  dddddddddd4: { title: 'دوره جامع Adobe XD - قسمت ۷', dur: 'PT11M34S', kids: { madeForKids: false, selfDeclaredMadeForKids: false } },
  eeeeeeeeee5: { title: 'تجربه مهسا از دوره UI Design Plus', dur: 'PT3M8S', kids: {} },
  ffffffffff6: { title: 'Figma auto layout in 10 minutes', dur: 'PT10M2S', kids: { madeForKids: true, selfDeclaredMadeForKids: false } },
};
const ids = Object.keys(VIDEOS);
const video = (id, i) => {
  const v = VIDEOS[id];
  return v && { id, snippet: { title: v.title, description: '', channelId: OWN, channelTitle: 'Hossein', publishedAt: ago(3 + i * 9), tags: [], thumbnails: {} }, statistics: { viewCount: String(200 + i * 77) }, contentDetails: { duration: v.dur }, status: { privacyStatus: 'public', ...v.kids } };
};
function api(url) {
  const u = new URL(url);
  const res = u.pathname.split('/').pop();
  if (res === 'videos') return { items: (u.searchParams.get('id') ?? '').split(',').map((id) => video(id, ids.indexOf(id))).filter(Boolean) };
  if (res === 'playlistItems') return { items: ids.map((videoId) => ({ contentDetails: { videoId } })) };
  return { items: [] };
}

const CONTENT = 'https://studio.youtube.com/channel/UCownownownownownownown1/videos/short?filter=%5B%5D';
const LIVE = 'https://studio.youtube.com/channel/UCownownownownownownown1/videos/upload';
const SCENES = {
  menu: { url: CONTENT, fixture: 'studioContent-shorts.html', host: 'tubex-sc-tools', clicks: [['tubex-sc-tools', '.sc-tools-btn']] },
  selection: { url: CONTENT, fixture: 'studioContent-shorts.html', host: 'tubex-sc-select', clicks: [['tubex-sc-select', '.sc-sel-btn']] },
  related: { url: CONTENT, fixture: 'studioContent-shorts.html', host: 'tubex-sc-select', clicks: [['tubex-sc-select', '.sc-sel-btn'], ['tubex-sc-layer', '[role="menuitem"] >> nth=0'], ['tubex-sc-layer', '.sc-pick >> nth=1']] },
  kids: { url: CONTENT, fixture: 'studioContent-shorts.html', host: 'tubex-sc-select', clicks: [['tubex-sc-select', '.sc-sel-btn'], ['tubex-sc-layer', '[role="menuitem"] >> nth=2']] },
  'kids-confirm': { url: CONTENT, fixture: 'studioContent-shorts.html', host: 'tubex-sc-select', clicks: [['tubex-sc-select', '.sc-sel-btn'], ['tubex-sc-layer', '[role="menuitem"] >> nth=2'], ['tubex-sc-layer', '.sc-sheet .btn-primary']] },
  edit: { url: 'https://studio.youtube.com/video/bbbbbbbbbb2/edit', fixture: 'studioContent-edit.html', host: 'tubex-sc-related', queue: true },
  // #8 placement checks on a fixture that reproduces Studio's scroll/transform containers. `measure` prints the
  // geometry (button vs menu) and fails loudly when the menu is not directly under its button and fully on screen.
  'live-menu': { url: `${LIVE}?sel=0`, fixture: 'studioContent-live.html', host: 'tubex-sc-tools', clicks: [['tubex-sc-tools', '.sc-tools-btn']], measure: 'tubex-sc-tools' },
  'live-menu-rtl': { url: `${LIVE}?sel=0&dir=rtl`, fixture: 'studioContent-live.html', host: 'tubex-sc-tools', clicks: [['tubex-sc-tools', '.sc-tools-btn']], measure: 'tubex-sc-tools' },
  'live-scrolled': { url: `${LIVE}?sel=0`, fixture: 'studioContent-live.html', host: 'tubex-sc-tools', scroll: 60, clicks: [['tubex-sc-tools', '.sc-tools-btn']], measure: 'tubex-sc-tools' },
  'live-nosel': { url: `${LIVE}?sel=0`, fixture: 'studioContent-live.html', host: 'tubex-sc-tools', expectNo: 'tubex-sc-select' },
  'live-sel': { url: LIVE, fixture: 'studioContent-live.html', host: 'tubex-sc-select', clicks: [['tubex-sc-select', '.sc-sel-btn']], measure: 'tubex-sc-select' },
  'live-kids': { url: LIVE, fixture: 'studioContent-live.html', host: 'tubex-sc-select', clicks: [['tubex-sc-select', '.sc-sel-btn'], ['tubex-sc-layer', '[role="menuitem"] >> nth=2']] },
  coppa: { workspace: `kids/${encodeURIComponent('ids=aaaaaaaaaa1,bbbbbbbbbb2&tab=shorts')}` },
};
const names = asked.length ? asked : Object.keys(SCENES);

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tubex-sc-')), {
  executablePath: EXE,
  headless: true,
  viewport: { width, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let fixtureFor = SCENES.menu.fixture;
const route = (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: readFileSync(`tests/fixtures/${fixtureFor}`, 'utf8') });
await ctx.route('https://studio.youtube.com/**', route);
await ctx.route('https://i.ytimg.com/**', (r) => r.fulfill({ status: 404, body: '' }));
await ctx.route('https://www.googleapis.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(api(r.request().url())) }));
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
const setup = await ctx.newPage();
await setup.goto(`chrome-extension://${id}/workspace.html`);
await setup.waitForTimeout(800);
await setup.evaluate(
  async ({ lang, theme, OWN }) => {
    await chrome.storage.local.set({
      prefs: { uiLanguage: lang, theme, pageAdapterEnabled: true },
      integrations: { youtube: { apiKey: 'TEST-KEY', region: 'US', language: 'fa', dailyUnitCap: 8000 }, ai: { enabled: false, baseUrl: '', model: '', apiKey: '', monthlyRequestCap: 1000 } },
      google: { channels: [{ channelId: OWN, title: 'Hossein Studio', handle: '@hossein', uploadsPlaylistId: 'UU' + OWN.slice(2), connectedAt: new Date().toISOString() }], activeChannelId: OWN },
    });
    await chrome.storage.session.set({ googleTokens: { [OWN]: { accessToken: 'tok', expiresAt: Date.now() + 3600_000, scopes: [] } } });
  },
  { lang, theme, OWN },
);

let failures = 0;
const p = await ctx.newPage();
p.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
for (const name of names) {
  const s = SCENES[name];
  if (!s) {
    console.error(`unknown scenario ${name}`);
    continue;
  }
  const file = join(outDir, `sc-${name}-${lang}-${theme}-${width}.png`);
  if (s.workspace) {
    await setup.evaluate(async ({ OWN }) => chrome.storage.session.set({ googleTokens: { [OWN]: { accessToken: 'tok', expiresAt: Date.now() + 3600_000, scopes: [] } } }), { OWN });
    await setup.goto(`chrome-extension://${id}/workspace.html#${s.workspace}`);
    await setup.setViewportSize({ width, height: 900 });
    await setup.waitForTimeout(2500);
    await setup.screenshot({ path: file, fullPage: process.env.FULL === '1' });
    console.log(file);
    continue;
  }
  await setup.evaluate(
    async ({ queue, OWN }) => {
      // The background may reset session storage after install; set the mocked token before each scene.
      await chrome.storage.session.set({ googleTokens: { [OWN]: { accessToken: 'tok', expiresAt: Date.now() + 3600_000, scopes: [] } } });
      if (queue)
        await chrome.storage.local.set({
          'inpage.sc.relatedQueue': { mode: 'add', target: { id: 'ffffffffff6', title: 'Figma auto layout in 10 minutes' }, items: [{ id: 'aaaaaaaaaa1', title: 'a' }, { id: 'bbbbbbbbbb2', title: 'b' }], index: 1, done: ['aaaaaaaaaa1'], startedAt: new Date().toISOString() },
        });
      else await chrome.storage.local.remove('inpage.sc.relatedQueue');
    },
    { queue: !!s.queue, OWN },
  );
  fixtureFor = s.fixture;
  await p.goto('about:blank');
  await p.goto(s.url);
  if (theme === 'light') await p.evaluate(() => document.documentElement.removeAttribute('dark'));
  try {
    await p.waitForSelector(s.host, { timeout: 8000, state: 'attached' });
  } catch {
    console.error(`${name}: island ${s.host} did not appear`);
    continue;
  }
  await p.waitForTimeout(1200);
  if (s.expectNo) {
    const n = await p.locator(s.expectNo).count();
    console.log(`${name}: ${s.expectNo} count = ${n}${n ? '  <-- FAIL: should not be mounted' : '  ok'}`);
    if (n) failures++;
  }
  for (const [host, sel] of s.clicks ?? []) {
    try {
      await p.locator(host).first().locator(sel).first().click({ timeout: 5000 });
    } catch (e) {
      console.error(`${name}: could not click ${host} ${sel}: ${e.message.split('\n')[0]}`);
    }
    await p.waitForTimeout(900);
  }
  // Scroll Studio's own scroll box while the menu is open: the menu must follow its button.
  if (s.scroll) {
    const top = await p.evaluate((y) => {
      const m = document.querySelector('#main');
      m?.scrollBy(0, y);
      return m?.scrollTop;
    }, s.scroll);
    console.log(`${name}: #main scrollTop = ${top}`);
    await p.waitForTimeout(300);
  }
  if (s.measure) {
    const g = await p.evaluate((hostName) => {
      const host = document.querySelector(hostName);
      const b = host?.shadowRoot?.querySelector('button[aria-haspopup]')?.getBoundingClientRect();
      const m = document.querySelector('tubex-sc-layer')?.shadowRoot?.querySelector('[role="menu"]')?.getBoundingClientRect();
      const tabs = [...document.querySelectorAll('tp-yt-paper-tab')];
      const last = tabs.at(-1)?.getBoundingClientRect();
      const r = (x) => x && { top: Math.round(x.top), bottom: Math.round(x.bottom), left: Math.round(x.left), right: Math.round(x.right) };
      return { button: r(b), menu: r(m), lastTab: r(last), hostParent: host?.parentElement?.id || host?.parentElement?.tagName, vw: innerWidth, vh: innerHeight };
    }, s.measure);
    const { button: b, menu: m, vw, vh } = g;
    const ok = !!b && !!m && m.top >= b.bottom && m.top - b.bottom <= 12 && m.left >= 0 && m.right <= vw && m.bottom <= vh && m.right > b.left && m.left < b.right;
    console.log(`${name}: ${JSON.stringify(g)} ${ok ? 'ok' : '<-- FAIL: menu not directly under its button / not fully visible'}`);
    if (!ok) failures++;
  }
  await p.screenshot({ path: file, fullPage: process.env.FULL === '1' });
  console.log(file);
}
await ctx.close();
if (failures) {
  console.error(`${failures} placement check(s) failed`);
  process.exitCode = 1;
}

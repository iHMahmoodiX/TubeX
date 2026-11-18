// Design review screenshots of the channel page (#5): Channelytics section and Channel Insights, on the synthetic
// channel fixture with mocked YouTube Data/Analytics APIs and seeded snapshots. Usage:
//   npm run build && node tests/e2e/channelInsights-shots.mjs [outDir] [scenario ...]
// Scenarios: strip channelytics own intro channel niche topics
// Env: LANG_UI=fa|en (default fa), THEME=dark|light|both (default dark), WIDTH (default 1280).
// Like inpage-shots.mjs, a temporary copy of the build gets the googleapis host permissions (normally granted at runtime).
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const SRC = resolve(process.env.EXT_DIR ?? '.output/chrome-mv3');
const EXE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const [outDir = '/tmp/tubex-ci-shots', ...asked] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const width = Number(process.env.WIDTH ?? 1280);
const lang = process.env.LANG_UI ?? 'fa';
const themes = process.env.THEME === 'both' ? ['dark', 'light'] : [process.env.THEME ?? 'dark'];

const EXT = mkdtempSync(join(tmpdir(), 'tubex-ext-'));
cpSync(SRC, EXT, { recursive: true });
const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://www.googleapis.com/*', 'https://youtubeanalytics.googleapis.com/*'])];
writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(manifest));

// ---------------------------------------------------------------- mock data
const OWN = 'UCownownownownownownown1';
const OTHER = 'UCabcdefghijklmnopqrstuv';
const N1 = 'UCnicheone0000000000000a';
const N2 = 'UCnichetwo0000000000000b';
const N3 = 'UCnichethree00000000000c';
const DAY = 86_400_000;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();
const NAMES = { [OWN]: 'Hossein Studio', [OTHER]: 'Sample Channel', [N1]: 'طراحی با سارا', [N2]: 'Design Lab', [N3]: 'UX Daily' };
const TOPICS = [
  ['آموزش فیگما', ['figma', 'آموزش فیگما', 'ui design']],
  ['طراحی رابط کاربری', ['ui design', 'طراحی رابط کاربری']],
  ['Figma auto layout', ['figma', 'auto layout']],
  ['UX research interview', ['ux research', 'ux']],
  ['پورتفولیو طراحی', ['portfolio', 'پورتفولیو']],
  ['Design system tokens', ['design system', 'tokens']],
  ['Photoshop retouch', ['photoshop']],
];
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const VIDEOS = {};
const UPLOADS = {};
for (const [ci, ch] of [OWN, OTHER, N1, N2, N3].entries()) {
  const ids = [];
  let d = 0.6 + ci * 0.3;
  for (let i = 0; i < 50; i++) {
    const id = `c${ci}x${String(i).padStart(8, '0')}`;
    const [title, tags] = TOPICS[(i * (ci + 2) + ci) % TOPICS.length];
    const short = i % 5 === 2 ? 'PT45S' : i % 9 === 4 ? 'PT2M30S' : `PT${8 + (i % 12)}M${i % 60}S`;
    const base = short === 'PT45S' ? 9000 : 3000;
    const views = Math.round(base * Math.exp((rnd() - 0.5) * 2.2) * (i === 6 ? 9 : i === 13 ? 0.15 : 1));
    VIDEOS[id] = { title: `${title} ${lang === 'fa' ? 'قسمت' : 'part'} ${i + 1}`, tags, channelId: ch, channelTitle: NAMES[ch], publishedAt: ago(d), views, likes: Math.round(views * (0.03 + rnd() * 0.04)), comments: Math.round(views * 0.004), duration: short };
    ids.push(id);
    d += 1 + Math.floor(rnd() * 4);
  }
  UPLOADS[`UU${ch.slice(2)}`] = ids;
}
const video = (id) => {
  const v = VIDEOS[id];
  if (!v) return null;
  return {
    id,
    snippet: { title: v.title, description: '', channelId: v.channelId, channelTitle: v.channelTitle, publishedAt: v.publishedAt, tags: v.tags, thumbnails: {} },
    statistics: { viewCount: String(v.views), likeCount: String(v.likes), commentCount: String(v.comments) },
    contentDetails: { duration: v.duration },
  };
};
const channel = (id) => ({
  id,
  snippet: { title: NAMES[id] ?? 'Channel', customUrl: '@x', description: '', publishedAt: ago(2000), thumbnails: {} },
  statistics: { subscriberCount: id === OWN ? '19200' : '52400', viewCount: id === OWN ? '825300' : '8420000', videoCount: id === OWN ? '406' : '214' },
  contentDetails: { relatedPlaylists: { uploads: 'UU' + id.slice(2) } },
  brandingSettings: { channel: { keywords: '"آموزش UI" "آموزش UX" "UI Design" "UX Design" "آموزش فیگما" Figma "Adobe XD" "طراحی رابط کاربری" AsteriXarts "Hossein Mahmoodi"' } },
});
function api(url) {
  const u = new URL(url);
  if (u.hostname === 'youtubeanalytics.googleapis.com') {
    if (u.searchParams.get('dimensions') === 'day') {
      const rows = [];
      for (let i = 29; i >= 0; i--) rows.push([new Date(Date.now() - i * DAY).toISOString().slice(0, 10), Math.round(220 + 160 * Math.sin(i / 2.5) + (i % 7 === 3 ? 260 : 0) + rnd() * 80)]);
      return { columnHeaders: [{ name: 'day' }, { name: 'views' }], rows };
    }
    return { columnHeaders: [{ name: 'views' }, { name: 'subscribersGained' }, { name: 'subscribersLost' }], rows: [[8310, 240, 31]] };
  }
  const res = u.pathname.split('/').pop();
  if (res === 'videos') return { items: (u.searchParams.get('id') ?? '').split(',').map(video).filter(Boolean) };
  if (res === 'channels') return { items: (u.searchParams.get('id') ?? OTHER).split(',').map(channel) };
  if (res === 'playlistItems') return { items: (UPLOADS[u.searchParams.get('playlistId')] ?? []).map((videoId) => ({ contentDetails: { videoId } })) };
  return { items: [] };
}

const SCENES = {
  strip: { url: `https://www.youtube.com/channel/${OTHER}`, store: { 'inpage.ci.strip.stats': false, 'inpage.ci.strip.insights': false } },
  channelytics: { url: `https://www.youtube.com/channel/${OTHER}`, store: { 'inpage.ci.strip.stats': true, 'inpage.ci.strip.insights': false } },
  own: { url: `https://www.youtube.com/channel/${OWN}`, store: { 'inpage.ci.strip.stats': true, 'inpage.ci.strip.insights': false } },
  intro: { url: `https://www.youtube.com/channel/${OTHER}`, store: { 'inpage.ci.strip.stats': false, 'inpage.ci.strip.insights': true, 'inpage.ci.introSeen': false, 'inpage.ci.view': 'channel' } },
  channel: { url: `https://www.youtube.com/channel/${OTHER}`, store: { 'inpage.ci.strip.stats': false, 'inpage.ci.strip.insights': true, 'inpage.ci.introSeen': true, 'inpage.ci.view': 'channel' } },
  niche: { url: `https://www.youtube.com/channel/${OTHER}`, store: { 'inpage.ci.strip.stats': false, 'inpage.ci.strip.insights': true, 'inpage.ci.introSeen': true, 'inpage.ci.view': 'niche' } },
  topics: { url: `https://www.youtube.com/channel/${OTHER}`, store: { 'inpage.ci.strip.stats': false, 'inpage.ci.strip.insights': true, 'inpage.ci.introSeen': true, 'inpage.ci.view': 'topics' }, topics: true },
};
const names = asked.length ? asked : Object.keys(SCENES);

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tubex-ci-')), {
  executablePath: EXE,
  headless: true,
  viewport: { width, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const fixture = readFileSync('tests/fixtures/inpage-channel.html', 'utf8');
await ctx.route('https://www.youtube.com/**', (r) => {
  const own = r.request().url().includes(OWN);
  r.fulfill({ contentType: 'text/html; charset=utf-8', body: own ? fixture.replaceAll('Sample Channel', NAMES[OWN]).replaceAll(OTHER, OWN) : fixture });
});
await ctx.route('https://www.googleapis.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(api(r.request().url())) }));
await ctx.route('https://youtubeanalytics.googleapis.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(api(r.request().url())) }));
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
const setup = await ctx.newPage();
await setup.goto(`chrome-extension://${id}/workspace.html`);
await setup.waitForTimeout(800);
await setup.evaluate(
  async ({ lang, OWN, OTHER, niche, names }) => {
    await chrome.storage.local.set({
      prefs: { uiLanguage: lang, theme: 'dark', pageAdapterEnabled: true },
      integrations: { youtube: { apiKey: 'TEST-KEY', region: 'US', language: 'fa', dailyUnitCap: 8000 }, ai: { enabled: true, baseUrl: 'http://localhost:11434/v1', model: 'qwen3:8b', apiKey: '', monthlyRequestCap: 1000 } },
      google: { channels: [{ channelId: OWN, title: names[OWN], handle: '@hossein', uploadsPlaylistId: 'UU' + OWN.slice(2), connectedAt: new Date().toISOString() }], activeChannelId: OWN },
    });
    await chrome.storage.session.set({ googleTokens: { [OWN]: { accessToken: 'TEST', expiresAt: Date.now() + 3600_000 } } });
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('tubex');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const put = (store, rec) =>
      new Promise((res, rej) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(rec);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    const now = Date.now();
    const iso = (d) => new Date(now - d * 86_400_000).toISOString();
    for (const [i, cid] of niche.entries()) await put('watchlist', { id: `w${i}`, createdAt: iso(40), updatedAt: iso(40), rev: 0, channelId: cid, title: names[cid], handle: '', notes: '', seenVideoIds: [] });
    // Daily snapshots: niche channels for 30 days, the viewed channel for 18 days (so its span shows as "18 days").
    const growthPerDay = { [OTHER]: 0.012, [niche[0]]: 0.004, [niche[1]]: 0.009, [niche[2]]: 0.002, [OWN]: 0.006 };
    const days = { [OTHER]: 18, [niche[0]]: 30, [niche[1]]: 30, [niche[2]]: 12, [OWN]: 30 };
    for (const cid of Object.keys(days)) {
      for (let d = days[cid]; d >= 1; d--) {
        const at = iso(d);
        const [subs, views] = cid === OWN ? [19200, 825300] : [52400, 8420000];
        await put('snapshots', { id: `${cid === OTHER ? 'ci' : 'niche'}:${cid}:${at.slice(0, 10)}`, ref: `${cid === OTHER ? 'ci' : 'niche'}:${cid}`, at, data: { title: names[cid], subscribers: Math.round(subs * (1 - growthPerDay[cid] * 0.6 * d)), views: Math.round(views * (1 - growthPerDay[cid] * d)), videoCount: 214 - Math.floor(d / 4) } });
      }
    }
  },
  { lang, OWN, OTHER, niche: [N1, N2, N3], names: NAMES },
);

const p = await ctx.newPage();
p.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
for (const theme of themes) {
  for (const name of names) {
    const s = SCENES[name];
    if (!s) {
      console.error(`unknown scenario ${name}`);
      continue;
    }
    await setup.evaluate((store) => chrome.storage.local.set(store), s.store);
    await p.goto('about:blank');
    await p.goto(s.url);
    if (theme === 'light') await p.evaluate(() => document.documentElement.removeAttribute('dark'));
    try {
      await p.waitForSelector('tubex-channel', { timeout: 8000, state: 'attached' });
    } catch {
      console.error(`${name}: island did not appear`);
      continue;
    }
    await p.waitForTimeout(2500);
    const host = p.locator('tubex-channel').first();
    if (s.topics) {
      const load = host.locator('.ci-load .btn-primary');
      if (await load.count()) {
        await load.first().click();
        await p.waitForTimeout(2000);
      }
      const first = host.locator('.ci-topic-btn');
      if (await first.count()) {
        await first.first().click();
        await p.waitForTimeout(400);
      }
    }
    const file = join(outDir, `ci-${name}-${lang}-${theme}-${width}.png`);
    await host.screenshot({ path: file });
    console.log(file);
  }
}
await ctx.close();

// Shared setup for tests/e2e/launchers-*.mjs: loads a copy of the built extension in Chromium, serves synthetic
// YouTube/Studio pages (the inpage-* fixtures, with a right column and a Studio top bar added in memory) and a
// canned YouTube Data API. No network. Same approach as tests/e2e/inpage-shots.mjs.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const SRC = resolve(process.env.EXT_DIR ?? '.output/chrome-mv3');
const EXE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export const OWN = 'UCownownownownownownown1';
export const OTHER = 'UCabcdefghijklmnopqrstuv';
const day = 86_400_000;
const ago = (d) => new Date(Date.now() - d * day).toISOString();

const TAGS = ['آموزش فیگما', 'figma tutorial', 'figma', 'figma for beginners', 'ui design', 'ux design', 'dev mode', 'design tools', 'video editing', 'figma 2026', 'learn figma', 'طراحی رابط کاربری', 'دوره فیگما', 'رایگان'];
const VIDEOS = {
  dQw4w9WgXcQ: {
    title: 'How to edit videos in Figma — full beginner tutorial',
    description: 'Figma video editing, step by step for beginners.\nEverything you need to start.\n\n0:00 Intro\n0:45 Frames\n3:10 Export\n\n#figma #design',
    tags: TAGS,
    channelId: OTHER, channelTitle: 'Sample Channel', publishedAt: ago(96), views: 25900, likes: 464, comments: 43, duration: 'PT19M26S', maxres: true, caption: 'true',
  },
};
for (let i = 0; i < 10; i++) VIDEOS[`up${String(i).padStart(9, '0')}`] = { title: `Upload ${i}`, tags: [], channelId: OTHER, channelTitle: 'Sample Channel', publishedAt: ago(3 + i * 6), views: 9000 + i * 3500, likes: 300, comments: 20, duration: 'PT8M' };
const video = (id) => {
  const v = VIDEOS[id];
  if (!v) return null;
  return {
    id,
    snippet: { title: v.title, description: v.description ?? '', channelId: v.channelId, channelTitle: v.channelTitle, publishedAt: v.publishedAt, tags: v.tags, thumbnails: v.maxres ? { default: {}, maxres: { url: 'x' } } : { default: {} } },
    statistics: { viewCount: String(v.views), likeCount: String(v.likes), commentCount: String(v.comments) },
    contentDetails: { duration: v.duration, caption: v.caption ?? 'false', definition: 'hd' },
  };
};
const channel = (id) => ({
  id,
  snippet: { title: id === OWN ? 'Hossein Studio' : 'Sample Channel', customUrl: id === OWN ? '@hossein' : '@sample-channel', description: '', publishedAt: ago(2000) },
  statistics: { subscriberCount: '19200', viewCount: '825000', videoCount: '455' },
  contentDetails: { relatedPlaylists: { uploads: 'UU' + id.slice(2) } },
});
function api(url) {
  const u = new URL(url);
  const res = u.pathname.split('/').pop();
  if (res === 'videos') return { items: (u.searchParams.get('id') ?? '').split(',').map(video).filter(Boolean) };
  if (res === 'channels') return { items: [channel(u.searchParams.get('id') ?? OTHER)] };
  if (res === 'playlistItems') return { items: Object.keys(VIDEOS).filter((k) => k.startsWith('up')).map((videoId) => ({ contentDetails: { videoId } })) };
  if (res === 'search') return { items: ['up000000001', 'dQw4w9WgXcQ'].map((videoId) => ({ id: { videoId } })) };
  return { items: [] };
}

// ---------------------------------------------------------------- pages

const read = (name) => readFileSync(`tests/fixtures/${name}`, 'utf8');
const RELATED = Array.from({ length: 12 }, (_, i) => `<ytd-compact-video-renderer><div class="th"></div><div><b>Recommended video ${i + 1}</b><br><small>Some channel · ${i + 2}K views</small></div></ytd-compact-video-renderer>`).join('');

/** Watch page with a right column (#secondary > #secondary-inner > #related), like the 2026 two-column layout. */
export function watchPage() {
  return read('inpage-watch.html')
    .replace('ytd-watch-flexy { display: block; max-width: 1280px;', 'ytd-watch-flexy { display: flex; gap: 24px; max-width: 1700px;')
    .replace('</style>', `#primary { flex: 1; min-width: 0; } #secondary { width: 402px; flex: none; } ytd-compact-video-renderer { display: flex; gap: 8px; margin-bottom: 8px; font-size: 13px; } .th { width: 168px; height: 94px; border-radius: 8px; background: #333; flex: none; }</style>`)
    .replace('</ytd-watch-flexy>', `<div id="secondary"><div id="secondary-inner"><div id="related">${RELATED}</div></div></div></ytd-watch-flexy>`);
}
export const channelPage = () => read('inpage-channel.html');

const STUDIO_HEADER = `<ytcp-header style="display:flex;align-items:center;justify-content:space-between;height:64px;padding:0 24px;border-bottom:1px solid #3e3e3e">
  <div><b>▶ Studio</b></div>
  <div style="flex:1;max-width:720px;margin:0 24px"><input placeholder="Search across your channel" style="width:100%;height:40px;border-radius:20px;border:1px solid #555;background:transparent;color:inherit;padding:0 16px"></div>
  <div id="right-section" style="display:flex;align-items:center;gap:12px">
    <ytcp-icon-button id="help-button" aria-label="Help" style="width:40px;height:40px;display:grid;place-items:center">?</ytcp-icon-button>
    <ytcp-icon-button id="notifications" aria-label="Notifications" style="width:40px;height:40px;display:grid;place-items:center">🔔</ytcp-icon-button>
    <span style="width:32px;height:32px;border-radius:50%;background:#c66;display:inline-block"></span>
  </div>
</ytcp-header>`;
export const studioEditorPage = () => read('inpage-studio-editor.html').replace('<ytcp-app>', `<ytcp-app>${STUDIO_HEADER}`);
export const studioContentPage = () =>
  `<!doctype html><html dark lang="en"><head><meta charset="utf-8"><title>Channel content - YouTube Studio</title><style>html{background:#1f1f1f;color:#fff;font:14px Roboto,Arial,sans-serif}body{margin:0}main{padding:24px 32px}tr td{padding:12px;border-bottom:1px solid #333}</style></head><body><ytcp-app>${STUDIO_HEADER}<main><h1>Channel content</h1><table>${Array.from({ length: 8 }, (_, i) => `<tr><td><input type="checkbox"></td><td>Video ${i + 1}</td><td>Public</td></tr>`).join('')}</table></main></ytcp-app></body></html>`;

// ---------------------------------------------------------------- browser

/**
 * Starts Chromium with a copy of the build (plus the googleapis host permission, normally granted at runtime) and
 * TubeX settings. `inpage` is prefs.inpage (switches). Returns { ctx, setPage, open }.
 */
export async function start({ lang = 'fa', width = 1440, height = 900, inpage = {}, extra = {} } = {}) {
  const EXT = mkdtempSync(join(tmpdir(), 'tubex-ext-'));
  cpSync(SRC, EXT, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://www.googleapis.com/*'])];
  writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(manifest));

  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tubex-launch-')), {
    executablePath: EXE,
    headless: true,
    viewport: { width, height },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  let html = watchPage();
  const route = (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
  await ctx.route('https://www.youtube.com/**', route);
  await ctx.route('https://studio.youtube.com/**', route);
  await ctx.route('https://www.googleapis.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(api(r.request().url())) }));
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  const setup = await ctx.newPage();
  await setup.goto(`chrome-extension://${id}/workspace.html`);
  await setup.waitForTimeout(800);
  await setup.evaluate(
    async ({ lang, OWN, inpage, extra }) => {
      await chrome.storage.local.set({
        prefs: { uiLanguage: lang, theme: 'dark', pageAdapterEnabled: true, inpage },
        integrations: { youtube: { apiKey: 'TEST-KEY', region: 'US', language: 'fa', dailyUnitCap: 8000 }, ai: { enabled: false, baseUrl: '', model: '', apiKey: '', monthlyRequestCap: 1000 } },
        google: { channels: [{ channelId: OWN, title: 'Hossein Studio', handle: '@hossein', uploadsPlaylistId: 'UU' + OWN.slice(2), connectedAt: new Date().toISOString() }], activeChannelId: OWN },
        ...extra,
      });
      const now = new Date().toISOString();
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
      await put('alerts', { id: 'a1', at: now, kind: 'competitor', title: 'New upload: Sample Channel', body: 'Figma auto layout in 10 minutes', read: false });
      await put('alerts', { id: 'a2', at: now, kind: 'rank', title: 'Rank moved', body: 'figma tutorial: #9 → #4', read: false });
    },
    { lang, OWN, inpage, extra },
  );
  await setup.close();
  return {
    ctx,
    extId: id,
    setPage: (h) => {
      html = h;
    },
  };
}

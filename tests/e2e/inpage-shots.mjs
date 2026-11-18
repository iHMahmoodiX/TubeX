// Design review screenshots of TubeX's in-page islands on synthetic YouTube/Studio fixtures. Usage:
//   npm run build && node tests/e2e/inpage-shots.mjs [outDir] [scenario ...]
// Scenarios: watch watch-tags watch-seo watch-actions search channel masthead studio-editor studio-upload studio-comments
// Env: LANG_UI=fa|en (default fa), THEME=dark|light (default dark; both when THEME=both), WIDTH (default 1280).
// No network: youtube.com/studio.youtube.com are served from tests/fixtures/inpage-*.html and the YouTube Data API
// from canned JSON below. A temporary copy of the build gets the googleapis host permission (normally granted at
// runtime by the owner) so the background can call the mocked API; the real build is not changed.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const SRC = resolve(process.env.EXT_DIR ?? '.output/chrome-mv3');
const EXE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const [outDir = '/tmp/tubex-inpage-shots', ...asked] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const width = Number(process.env.WIDTH ?? 1280);
const lang = process.env.LANG_UI ?? 'fa';
const themes = process.env.THEME === 'both' ? ['dark', 'light'] : [process.env.THEME ?? 'dark'];

const EXT = mkdtempSync(join(tmpdir(), 'tubex-ext-'));
cpSync(SRC, EXT, { recursive: true });
const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://www.googleapis.com/*'])];
writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(manifest));

// ---------------------------------------------------------------- mock YouTube Data API
const OWN = 'UCownownownownownownown1';
const OTHER = 'UCabcdefghijklmnopqrstuv';
const day = 86_400_000;
const ago = (d) => new Date(Date.now() - d * day).toISOString();
const VIDEOS = {
  dQw4w9WgXcQ: {
    title: 'How to edit videos in Figma — full beginner tutorial',
    description: 'Figma video editing, step by step for beginners.\nEverything you need to start.\n\n0:00 Intro\n0:45 Frames\n3:10 Export\n\n#figma #design',
    tags: ['figma tutorial', 'figma', 'figma for beginners', 'ui design', 'design tools', 'video editing', 'figma 2026', 'learn figma'],
    channelId: OWN, channelTitle: 'Hossein Studio', publishedAt: ago(96), views: 128400, likes: 5120, comments: 412, duration: 'PT12M41S',
  },
  aaaaaaaaaa1: { title: 'Figma tutorial for beginners 2026', tags: Array.from({ length: 14 }, (_, i) => `tag ${i}`), channelId: OTHER, channelTitle: 'Sample Channel', publishedAt: ago(380), views: 1_240_000, likes: 40000, comments: 1200, duration: 'PT25M2S' },
  bbbbbbbbbb2: { title: 'Auto layout in 10 minutes', tags: ['auto layout', 'figma'], channelId: OWN, channelTitle: 'Hossein Studio', publishedAt: ago(21), views: 48_000, likes: 2100, comments: 90, duration: 'PT10M' },
  cccccccccc3: { title: 'Figma shortcut', tags: [], channelId: OTHER, channelTitle: 'Sample Channel', publishedAt: ago(2), views: 300_000, likes: 21000, comments: 300, duration: 'PT45S' },
};
for (let i = 0; i < 10; i++) VIDEOS[`up${String(i).padStart(9, '0')}`] = { title: `Upload ${i}`, tags: [], channelId: OTHER, channelTitle: 'Sample Channel', publishedAt: ago(3 + i * 6), views: 20000 + i * 3500, likes: 900, comments: 40, duration: 'PT8M' };
const video = (id) => {
  const v = VIDEOS[id];
  if (!v) return null;
  return {
    id,
    snippet: { title: v.title, description: v.description ?? '', channelId: v.channelId, channelTitle: v.channelTitle, publishedAt: v.publishedAt, tags: v.tags, thumbnails: {} },
    statistics: { viewCount: String(v.views), likeCount: String(v.likes), commentCount: String(v.comments) },
    contentDetails: { duration: v.duration },
  };
};
const channel = (id) => ({
  id,
  snippet: { title: id === OWN ? 'Hossein Studio' : 'Sample Channel', customUrl: id === OWN ? '@hossein' : '@sample-channel', description: '', publishedAt: ago(2000) },
  statistics: { subscriberCount: '52400', viewCount: '8420000', videoCount: '214' },
  contentDetails: { relatedPlaylists: { uploads: 'UU' + id.slice(2) } },
});
function api(url) {
  const u = new URL(url);
  const res = u.pathname.split('/').pop();
  if (res === 'videos') return { items: (u.searchParams.get('id') ?? '').split(',').map(video).filter(Boolean) };
  if (res === 'channels') return { items: [channel(u.searchParams.get('id') ?? OTHER)] };
  if (res === 'playlistItems') return { items: Object.keys(VIDEOS).filter((k) => k.startsWith('up')).map((videoId) => ({ contentDetails: { videoId } })) };
  if (res === 'search') return { items: ['aaaaaaaaaa1', 'bbbbbbbbbb2'].map((videoId) => ({ id: { videoId } })) };
  if (res === 'commentThreads') return { items: [] };
  return { items: [] };
}

// ---------------------------------------------------------------- scenarios
const SCENES = {
  watch: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', fixture: 'inpage-watch.html', host: 'tubex-watch' },
  'watch-overview': { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', fixture: 'inpage-watch.html', host: 'tubex-watch', tab: 0 },
  'watch-tags': { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', fixture: 'inpage-watch.html', host: 'tubex-watch', tab: 1 },
  'watch-seo': { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', fixture: 'inpage-watch.html', host: 'tubex-watch', tab: 2 },
  'watch-actions': { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', fixture: 'inpage-watch.html', host: 'tubex-watch', tab: 3 },
  search: { url: 'https://www.youtube.com/results?search_query=figma+tutorial', fixture: 'inpage-search.html', host: 'tubex-search' },
  channel: { url: 'https://www.youtube.com/@sample-channel', fixture: 'inpage-channel.html', host: 'tubex-channel' },
  masthead: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', fixture: 'inpage-watch.html', host: 'tubex-masthead', click: '.tx-round' },
  'studio-editor': { url: 'https://studio.youtube.com/video/dQw4w9WgXcQ/edit', fixture: 'inpage-studio-editor.html', host: 'tubex-studio-editor' },
  'studio-upload': { url: 'https://studio.youtube.com/channel/UCownownownownownownown1/videos/upload', fixture: 'inpage-studio-upload.html', host: 'tubex-studio-upload' },
  'studio-comments': { url: 'https://studio.youtube.com/channel/UCownownownownownownown1/comments/inbox', fixture: 'inpage-studio-comments.html', host: 'tubex-reply', comments: true },
};
const names = asked.length ? asked : ['watch', 'watch-overview', 'watch-tags', 'watch-seo', 'watch-actions', 'search', 'channel', 'masthead', 'studio-editor', 'studio-upload', 'studio-comments'];

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tubex-inpage-')), {
  executablePath: EXE,
  headless: true,
  viewport: { width, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let fixtureFor = 'inpage-watch.html';
const route = (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: readFileSync(`tests/fixtures/${fixtureFor}`, 'utf8') });
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
  async ({ lang, OWN }) => {
    await chrome.storage.local.set({
      prefs: { uiLanguage: lang, theme: 'dark', pageAdapterEnabled: true },
      integrations: { youtube: { apiKey: 'TEST-KEY', region: 'US', language: 'fa', dailyUnitCap: 8000 }, ai: { enabled: true, baseUrl: 'http://localhost:11434/v1', model: 'qwen3:8b', apiKey: '', monthlyRequestCap: 1000 } },
      google: { channels: [{ channelId: OWN, title: 'Hossein Studio', handle: '@hossein', uploadsPlaylistId: 'UU' + OWN.slice(2), connectedAt: new Date().toISOString() }], activeChannelId: OWN },
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
    const base = (id) => ({ id, createdAt: now, updatedAt: now, rev: 0 });
    await put('templates', { ...base('t1'), name: lang === 'fa' ? 'پایان ویدیوهای آموزشی' : 'Tutorial footer', description: lang === 'fa' ? '🔔 برای ویدیوهای بیشتر مشترک شوید\nاینستاگرام: @hossein' : '🔔 Subscribe for more tutorials\nInstagram: @hossein', tags: ['figma', 'ui design', 'آموزش فیگما'] });
    await put('replies', { ...base('r1'), name: lang === 'fa' ? 'تشکر' : 'Thanks', text: lang === 'fa' ? '{name} عزیز، ممنون از لطفت! 🙏' : 'Thanks a lot {name}! 🙏' });
    await put('replies', { ...base('r2'), name: lang === 'fa' ? 'قسمت بعد' : 'Next part', text: lang === 'fa' ? 'سلام {name}، قسمت دوم همین هفته منتشر می‌شود.' : 'Hi {name}, part two comes out this week.' });
    await put('alerts', { id: 'a1', at: now, kind: 'competitor', title: 'New upload', body: 'Sample Channel uploaded', read: false });
    await put('alerts', { id: 'a2', at: now, kind: 'rank', title: 'Rank moved', body: 'figma tutorial #4', read: false });
  },
  { lang, OWN },
);
await setup.close();

const p = await ctx.newPage();
p.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
for (const theme of themes) {
  for (const name of names) {
    const s = SCENES[name];
    if (!s) {
      console.error(`unknown scenario ${name}`);
      continue;
    }
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
    await p.waitForTimeout(1500);
    const shadow = (sel) => p.locator(s.host).first().locator(sel);
    if (s.tab !== undefined) {
      if ((await shadow('.tx-toggle').getAttribute('aria-expanded')) !== 'true') await shadow('.tx-toggle').click();
      await shadow('[role="tab"]').nth(s.tab).click();
      await p.waitForTimeout(700);
    }
    if (s.click) {
      await shadow(s.click).click();
      await p.waitForTimeout(500);
    }
    if (s.comments) {
      await p.locator('tubex-reply').first().locator('button').click();
      await p.waitForTimeout(800);
    }
    const file = join(outDir, `inpage-${name}-${lang}-${theme}-${width}.png`);
    await p.screenshot({ path: file, fullPage: process.env.FULL === '1' });
    console.log(file);
  }
}
await ctx.close();

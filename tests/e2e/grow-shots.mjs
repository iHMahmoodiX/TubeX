// Design review screenshots of the Improve queue (#10/#15), A/B assistant (#12/#13), Research → Idea → Draft
// (#14), Outliers (#11) and Aparat package (#17) on a mocked signed-in channel. Usage:
//   npm run build && node tests/e2e/grow-shots.mjs [outDir] [route…]
// Env: LANG_UI=fa|en (default fa), THEME=dark|light (default dark), WIDTH (default 1200).
// No network: Google APIs are answered from the fakes below; a temporary copy of the build gets their host permission.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const SRC = resolve(process.env.EXT_DIR ?? '.output/chrome-mv3');
const EXE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const [outDir = '/tmp/tubex-grow-shots', ...asked] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const width = Number(process.env.WIDTH ?? 1200);
const lang = process.env.LANG_UI ?? 'fa';
const theme = process.env.THEME ?? 'dark';

const EXT = mkdtempSync(join(tmpdir(), 'tubex-ext-'));
cpSync(SRC, EXT, { recursive: true });
const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://www.googleapis.com/*', 'https://youtubeanalytics.googleapis.com/*', 'https://generativelanguage.googleapis.com/*'])];
writeFileSync(join(EXT, 'manifest.json'), JSON.stringify(manifest));

const OWN = 'UCownownownownownownown1';
const day = 86_400_000;
const ago = (d) => new Date(Date.now() - d * day).toISOString();
const TITLES = ['آموزش Auto Layout در فیگما', 'ساخت دیزاین سیستم از صفر', 'Figma Variables in 10 minutes', 'پروتوتایپ پیشرفته در فیگما', 'رنگ‌بندی رابط کاربری', 'تایپوگرافی فارسی در وب', 'نکته', 'آموزش Dev Mode'];
const AGES = [20, 40, 400, 90, 300, 60, 30, 15];
const VIEWS28 = [3200, 900, 2400, 400, 2600, 1100, 700, 1500];
const RET = [38, 55, 41, 62, 40, 39, 30, 42];
const desc = 'در این ویدیو قدم به قدم یاد می‌گیریم که چطور طراحی کنیم.\nفصل‌ها:\n00:00 مقدمه\n01:20 شروع\n05:40 جمع‌بندی\nhttps://figmafa.ir';
const vids = TITLES.map((title, i) => ({
  id: `vid${String(i).padStart(8, '0')}`,
  snippet: { title, description: i === 6 ? '' : desc, tags: i === 6 ? [] : ['فیگما', 'آموزش فیگما', 'figma', 'ui design', 'طراحی رابط کاربری'], publishedAt: ago(AGES[i]), channelId: OWN, channelTitle: 'Figma Farsi', thumbnails: { medium: { url: `https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg` } } },
  statistics: { viewCount: String(VIEWS28[i] * 5), likeCount: '100', commentCount: '10' },
  contentDetails: { duration: 'PT10M', caption: 'true' },
  status: { privacyStatus: 'public' },
}));

function api(url) {
  const u = new URL(url);
  if (u.hostname === 'youtubeanalytics.googleapis.com') {
    const dims = u.searchParams.get('dimensions');
    if (dims === 'video')
      return { columnHeaders: [{ name: 'video' }, { name: 'views' }, { name: 'averageViewPercentage' }], rows: vids.map((v, i) => [v.id, VIEWS28[i], RET[i]]) };
    return { columnHeaders: [], rows: [] };
  }
  const path = u.pathname.split('/').pop();
  if (path === 'playlistItems') return { items: vids.map((v) => ({ contentDetails: { videoId: v.id } })) };
  if (path === 'videos') {
    const ids = (u.searchParams.get('id') ?? '').split(',');
    const others = ids.filter((x) => x.startsWith('oth')).map((x, i) => ({ id: x, snippet: { title: ['آموزش فیگما برای مبتدی‌ها', 'Figma auto layout tutorial', 'ده ترفند فیگما', 'Design systems in Figma', 'طراحی اپ موبایل', 'UI design 2026'][i % 6], channelId: `UC${'x'.repeat(22)}`, channelTitle: ['Design Pro', 'UX Lab', 'طراحان', 'Figma Hub', 'اپ‌ساز', 'Pixel'][i % 6], publishedAt: ago(5 + i * 3), thumbnails: { medium: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' } } }, statistics: { viewCount: String(i === 2 ? 90000 : 5000 * (i + 1)) }, contentDetails: { duration: 'PT8M' } }));
    return { items: [...vids.filter((v) => ids.includes(v.id)), ...others] };
  }
  if (path === 'channels') return { items: [{ id: OWN, snippet: { title: 'Figma Farsi' }, statistics: { subscriberCount: '12000', viewCount: '900000', videoCount: '8' }, contentDetails: { relatedPlaylists: { uploads: 'UU' + OWN.slice(2) } } }] };
  if (path === 'search')
    return { items: ['a', 'b', 'c', 'd', 'e', 'f'].map((x, i) => ({ id: { videoId: `oth${x}0000000` }, snippet: { title: ['آموزش فیگما برای مبتدی‌ها', 'Figma auto layout tutorial', 'ده ترفند فیگما', 'Design systems in Figma', 'طراحی اپ موبایل', 'UI design 2026'][i], channelId: `UC${x.repeat(22)}`, channelTitle: ['Design Pro', 'UX Lab', 'طراحان', 'Figma Hub', 'اپ‌ساز', 'Pixel'][i], publishedAt: ago(5 + i * 3), thumbnails: { medium: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' } } } })) };
  return { items: [] };
}

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tubex-grow-')), {
  executablePath: EXE,
  headless: true,
  viewport: { width, height: 1000 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const img = readFileSync(resolve('public/icon/128.png'));
await ctx.route('https://i.ytimg.com/**', (r) => r.fulfill({ contentType: 'image/png', body: img }));
await ctx.route('https://www.googleapis.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(api(r.request().url())) }));
await ctx.route('https://youtubeanalytics.googleapis.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(api(r.request().url())) }));
const AI_APARAT = { title: 'آموزش Auto Layout فیگما از صفر تا حرفه‌ای', description: 'در این ویدیو Auto Layout فیگما را قدم‌به‌قدم یاد می‌گیرید و طراحی ریسپانسیو می‌سازید.\n\nفصل‌ها:\n00:00 مقدمه\n01:20 شروع\n05:40 جمع‌بندی\n\nhttps://figmafa.ir\nکانال ما را در آپارات دنبال کنید.', tags: ['آموزش فیگما', 'اتولیوت فیگما', 'figma', 'طراحی رابط کاربری', 'آموزش ui'], category: 'آموزشی', why: 'عنوان با عبارت جست‌وجوی فارسی شروع می‌شود و لینک‌های یوتیوب حذف شدند.' };
const AI_BLOG = { title: 'آموزش Auto Layout در فیگما؛ راهنمای کاربردی', slug: 'figma-auto-layout-guide', metaDescription: 'آموزش Auto Layout در فیگما: فعال کردن، تنظیم فاصله و پدینگ، ریسپانسیو کردن کامپوننت‌ها و اشتباهات رایج، همراه با ویدیوی آموزشی کامل.', focusKeyword: 'Auto Layout در فیگما', excerpt: 'Auto Layout را در فیگما قدم‌به‌قدم یاد بگیرید.', category: 'فیگما', tags: ['فیگما', 'Auto Layout', 'آموزش UI'], intro: ['طراحی دکمه‌ها و کارت‌هایی که با تغییر متن به‌هم می‌ریزند، وقت زیادی می‌گیرد.', 'Auto Layout در فیگما این مشکل را حل می‌کند.'], sections: [{ heading: 'Auto Layout در فیگما چیست؟', summary: 'قابلیتی برای چیدمان خودکار لایه‌ها.', paragraphs: ['با Auto Layout فاصله‌ها و اندازه‌ها خودکار تنظیم می‌شوند.'] }, { heading: 'چگونه Auto Layout را فعال کنیم؟', summary: 'با Shift+A.', paragraphs: ['لایه‌ها را انتخاب کنید.'], steps: ['لایه‌ها را انتخاب کنید', 'Shift+A را بزنید', 'فاصله را تنظیم کنید'] }, { heading: 'اشتباهات رایج', paragraphs: ['استفادهٔ نادرست از Fixed.'], bullets: ['Fixed به‌جای Hug', 'پدینگ ناهماهنگ'] }], faq: [{ q: 'Auto Layout در نسخهٔ رایگان هست؟', a: 'بله، در همهٔ پلن‌ها هست.' }], checklist: ['Hug برای متن', 'فاصلهٔ یکسان'], ctaText: 'برای یادگیری کامل، دورهٔ UI Design Plus را ببینید.' };
await ctx.route('https://generativelanguage.googleapis.com/**', (r) => {
  const body = r.request().postData() ?? '';
  const out = body.includes('Aparat (the Iranian') ? AI_APARAT : AI_BLOG;
  r.fulfill({ contentType: 'application/json', body: JSON.stringify({ model: 'gemini-3.5-flash-lite', choices: [{ message: { role: 'assistant', content: JSON.stringify(out) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }) });
});
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
const p = await ctx.newPage();
p.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
await p.goto(`chrome-extension://${id}/workspace.html`);
await p.waitForTimeout(800);
await p.evaluate(
  async ({ lang, theme, OWN }) => {
    await chrome.storage.local.set({
      prefs: { uiLanguage: lang, theme, pageAdapterEnabled: true, aparatEnabled: true },
      integrations: { youtube: { apiKey: '', region: 'US', language: 'fa', dailyUnitCap: 8000, dailySearchCap: 100 }, ai: { enabled: true, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', apiKey: 'k', monthlyRequestCap: 1000 } },
      google: { channels: [{ channelId: OWN, title: 'Figma Farsi', handle: '@figmafa', uploadsPlaylistId: 'UU' + OWN.slice(2), connectedAt: '2026-10-01', sub: '1' }], activeChannelId: OWN },
    });
    await chrome.storage.session.set({ authBootDone: true, googleTokens: { [OWN]: { accessToken: 'tok', expiresAt: Date.now() + 3600_000, scopes: [] } } });
  },
  { lang, theme, OWN },
);

const routes = asked.length ? asked : ['optimize', 'optimize-open', 'experiments-new', 'research-idea', 'settings-ai'];
for (const r of routes) {
  if (r === 'optimize-open') {
    await p.goto(`chrome-extension://${id}/workspace.html#optimize`);
    await p.waitForTimeout(2500);
    await p.locator('[data-testid="opt-card"]').first().getByRole('button', { name: /گزارش|Log/ }).click();
    await p.waitForTimeout(500);
  } else if (r === 'experiments-new') {
    await p.goto(`chrome-extension://${id}/workspace.html#experiments/new:vid00000000`);
    await p.waitForTimeout(3000);
  } else if (r === 'experiments-ctx' || r === 'experiments-handoff') {
    await p.goto(`chrome-extension://${id}/workspace.html#experiments/new:vid00000000`);
    await p.waitForTimeout(3000);
    const sel = r === 'experiments-ctx' ? '[data-testid="context-preview"]' : '#ab-h';
    await p.locator(sel).scrollIntoViewIfNeeded();
    if (r === 'experiments-ctx') {
      await p.locator(sel).getByRole('button', { name: /نتایج واقعی|real results/ }).click();
      await p.locator(sel).getByRole('button', { name: /بارگیری|Load results/ }).click();
      await p.waitForTimeout(1500);
    }
  } else if (r === 'draft-flow') {
    await p.goto(`chrome-extension://${id}/workspace.html#research/${encodeURIComponent('آموزش فیگما')}`);
    await p.waitForTimeout(3000);
    await p.locator('[data-testid="flow-draft"]').first().click();
    await p.waitForTimeout(1500);
    await p.locator('[data-testid="draft-flow"] details').first().evaluate((d) => (d.open = true));
  } else if (r === 'aparat') {
    await p.goto(`chrome-extension://${id}/workspace.html#research/${encodeURIComponent('آموزش فیگما')}`);
    await p.waitForTimeout(3000);
    await p.locator('[data-testid="flow-draft"]').first().click();
    await p.waitForTimeout(1500);
    await p.locator('textarea').nth(1).fill('در این ویدیو Auto Layout را یاد می‌گیریم.\nسابسکرایب: https://www.youtube.com/@figmafa');
    await p.locator('[data-testid="aparat-prepare"]').click();
    await p.waitForTimeout(500);
    await p.locator('[data-testid="aparat-panel"]').scrollIntoViewIfNeeded();
  } else if (r === 'aparat-page' || r === 'aparat-open') {
    await p.goto(`chrome-extension://${id}/workspace.html#aparat`);
    await p.waitForTimeout(2500);
    if (r === 'aparat-open') {
      await p.locator('[data-testid="aparat-row-open"]').first().click();
      await p.waitForTimeout(2000);
      await p.locator('[data-testid="aparat-ai-run"]').click();
      await p.waitForTimeout(1500);
      await p.locator('[data-testid="aparat-ai"]').scrollIntoViewIfNeeded();
    }
  } else if (r === 'blog-page' || r === 'aparat-auto' || r === 'blog-auto') {
    await p.goto(`chrome-extension://${id}/workspace.html#${r.startsWith('blog') ? 'blog' : 'aparat'}`);
    await p.waitForTimeout(2500);
    if (r !== 'blog-page') {
      await p.locator('[data-testid="auto-pick-all"]').check();
      await p.locator('[data-testid="auto-run-selected"]').click();
      await p.waitForTimeout(4000);
    }
  } else if (r === 'settings-blog' || r === 'settings-aparat') {
    await p.goto(`chrome-extension://${id}/workspace.html#settings/set-${r.slice(9)}`);
    await p.waitForTimeout(2000);
  } else if (r === 'blog-open') {
    await p.goto(`chrome-extension://${id}/workspace.html#blog`);
    await p.waitForTimeout(2500);
    await p.locator('[data-testid="blog-row-open"]').first().click();
    await p.waitForTimeout(2000);
    await p.locator('[data-testid="blog-panel"] input').first().fill('https://example.com/blog');
    await p.locator('[data-testid="blog-ai-run"]').click();
    await p.waitForTimeout(2000);
    await p.locator('[data-testid="blog-preview"]').evaluate((d) => (d.open = true));
    await p.locator('[data-testid="blog-preview"]').scrollIntoViewIfNeeded();
  } else if (r === 'outliers') {
    await p.goto(`chrome-extension://${id}/workspace.html#research`);
    await p.waitForTimeout(1500);
    await p.getByRole('tab', { name: /استثنایی|Outliers/ }).click();
    await p.locator('[data-testid="outliers"] input').fill('آموزش فیگما');
    await p.locator('[data-testid="outl-run"]').click();
    await p.waitForTimeout(2000);
  } else if (r === 'settings-ai') {
    await p.goto(`chrome-extension://${id}/workspace.html#settings`);
    await p.waitForTimeout(1500);
    await p.locator('[data-testid="ai-settings"]').scrollIntoViewIfNeeded();
  } else {
    await p.goto(`chrome-extension://${id}/workspace.html#${r}`);
    await p.waitForTimeout(2500);
  }
  const file = join(outDir, `grow-${r}-${lang}-${theme}-${width}.png`);
  await p.screenshot({ path: file, fullPage: true });
  console.log(file);
}
await ctx.close();

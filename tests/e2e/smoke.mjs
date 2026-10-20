// Real unpacked-extension smoke test in Chromium. Run `npm run build` first, then `npm run e2e`.
// YouTube pages are served from local synthetic fixtures through request routing, so this proves the
// extension's behaviour on YouTube URLs, not compatibility with today's live YouTube DOM.
// Env: CHROMIUM_PATH (browser binary), HEADED=1 to watch, CDP_PORT (default 9333).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const EXT = resolve('.output/chrome-mv3');
const ART = resolve('tests/e2e/artifacts');
const PORT = Number(process.env.CDP_PORT ?? 9333);
const EXE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const VIDEO_1 = 'dQw4w9WgXcQ';
const VIDEO_2 = 'abcdefghijk';
mkdirSync(ART, { recursive: true });

const fixture = readFileSync('tests/fixtures/youtube-watch.html', 'utf8');
const second = fixture.replaceAll(VIDEO_1, VIDEO_2).replaceAll('آموزش فیگما برای مبتدی‌ها', 'Second video title');
const simple = (title) => `<!doctype html><html><head><title>${title}</title></head><body><p>${title}</p></body></html>`;

const results = [];
let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (e) {
    failed++;
    results.push(`FAIL ${name}: ${e instanceof Error ? e.message.split('\n')[0] : e}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Minimal CDP client for the side panel, which Playwright does not expose as a Page. */
async function attachToUrl(fragment) {
  for (let i = 0; i < 50; i++) {
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    const t = targets.find((x) => x.url.includes(fragment));
    if (t) {
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
      let n = 0;
      const pending = new Map();
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      };
      const send = (method, params = {}) =>
        new Promise((r) => {
          const id = ++n;
          pending.set(id, r);
          ws.send(JSON.stringify({ id, method, params }));
        });
      const evaluate = async (expression) => {
        const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
        if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description ?? 'evaluate failed');
        return res.result?.result?.value;
      };
      const waitFor = async (expression, label, timeout = 5000) => {
        const end = Date.now() + timeout;
        let last;
        while (Date.now() < end) {
          last = await evaluate(expression);
          if (last) return last;
          await new Promise((r) => setTimeout(r, 100));
        }
        throw new Error(`timed out waiting for ${label} (last: ${JSON.stringify(last)})`);
      };
      const type = async (selectorExpr, text) => {
        await evaluate(`(${selectorExpr}).focus()`);
        await send('Input.insertText', { text });
      };
      return { send, evaluate, waitFor, type, close: () => ws.close() };
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no target matching ${fragment}`);
}

// Helpers evaluated inside the side panel.
const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim() === ${JSON.stringify(text)})`;
const byLabel = (text) => `document.getElementById([...document.querySelectorAll('label')].find(l => l.textContent.trim() === ${JSON.stringify(text)})?.htmlFor)`;

async function launch(userDir) {
  const ctx = await chromium.launchPersistentContext(userDir, {
    executablePath: EXE,
    headless: !process.env.HEADED,
    acceptDownloads: true,
    viewport: { width: 1280, height: 860 },
    args: [`--remote-debugging-port=${PORT}`, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  await ctx.route('https://www.youtube.com/**', (route) => {
    const url = route.request().url();
    if (url.includes(`v=${VIDEO_1}`)) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture });
    if (url.includes(`v=${VIDEO_2}`)) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: second });
    if (url.includes('/results')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: simple('طراحی رابط - YouTube') });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: simple('YouTube') });
  });
  await ctx.route('https://example.com/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: simple('Example') }));
  const p = ctx.pages()[0] ?? (await ctx.newPage());
  await p.goto('chrome://extensions');
  const id = await p.evaluate(
    () => document.querySelector('extensions-manager').shadowRoot.querySelector('extensions-item-list').shadowRoot.querySelector('extensions-item')?.id,
  );
  assert(id, 'extension not loaded');
  return { ctx, id, blank: p };
}

const userDir = mkdtempSync(join(tmpdir(), 'tubex-e2e-'));
let { ctx, id, blank } = await launch(userDir);
const ext = (path) => `chrome-extension://${id}/${path}`;
let ws, yt, sp, ytBefore;

await step('workspace opens in Persian RTL by default and creates a local channel profile', async () => {
  ws = await ctx.newPage();
  await ws.goto(ext('workspace.html#channels'));
  await ws.waitForSelector('h1');
  assert((await ws.getAttribute('html', 'dir')) === 'rtl', 'not rtl');
  assert((await ws.getAttribute('html', 'lang')) === 'fa', 'not fa');
  await ws.getByRole('button', { name: 'پروفایل کانال جدید' }).click();
  await ws.getByLabel('نام', { exact: true }).fill('کانال طراحی');
  await ws.getByLabel(/هندل/).fill('@design-sample');
  await ws.getByRole('button', { name: 'ذخیره', exact: true }).click();
  await ws.getByText('کانال فعال', { exact: true }).first().waitFor();
  assert(await ws.getByText('وصل نیست').first().isVisible(), 'unconnected badge missing');
  await ws.screenshot({ path: join(ART, 'workspace-channels-fa-light.png'), fullPage: true });
});

await step('YouTube watch page loads; content script injects nothing', async () => {
  yt = await ctx.newPage();
  await yt.goto(`https://www.youtube.com/watch?v=${VIDEO_1}`);
  ytBefore = await yt.evaluate(() => document.documentElement.outerHTML);
});

await step('side panel opens from the popup and detects the video from the page', async () => {
  const pop = await ctx.newPage();
  await pop.goto(ext('popup.html'));
  await pop.getByRole('button', { name: 'باز کردن پنل کناری' }).click();
  sp = await attachToUrl('/sidepanel.html');
  await yt.bringToFront();
  await sp.waitFor(`document.querySelector('[data-testid=context-card]')?.dataset.kind === 'watch'`, 'watch context');
  const title = await sp.waitFor(`document.querySelector('[data-testid=context-title]')?.textContent`, 'title');
  assert(title === 'آموزش فیگما برای مبتدی‌ها', `title was ${title}`);
  assert(await sp.evaluate(`document.body.textContent.includes('Sample Channel')`), 'channel name missing');
  assert(await sp.evaluate(`document.body.textContent.includes('از خود صفحه')`), 'origin should be page DOM');
});

await step('capture saves a source-linked idea in one click', async () => {
  await sp.evaluate(`${byText('button', 'ذخیرهٔ ایده')}.click()`);
  await sp.waitFor(`document.body.textContent.includes('ایده ذخیره شد')`, 'saved toast');
  const href = await sp.waitFor(`document.querySelector('.list-item a[href*="watch"]')?.href`, 'idea source link');
  assert(href === `https://www.youtube.com/watch?v=${VIDEO_1}`, `source was ${href}`);
});

await step('start a draft from the idea, edit Persian metadata, autosave', async () => {
  await sp.evaluate(`${byText('button', 'شروع پیش‌نویس')}.click()`);
  const title = await sp.waitFor(`${byLabel('عنوان')}?.value`, 'draft title');
  assert(title === 'آموزش فیگما برای مبتدی‌ها', `draft title ${title}`);
  await sp.type(byLabel('توضیحات'), 'در این ویدیو با فیگما آشنا می‌شویم.\n#طراحی #فیگما');
  await sp.type(byLabel('برچسب‌ها'), 'فیگما, طراحی رابط، Figma');
  await sp.type(byLabel('کلیدواژهٔ اصلی'), 'فیگما');
  await sp.waitFor(`document.body.textContent.includes('ذخیره شد ·')`, 'saved status');
  await sp.evaluate(`${byText('button', 'باز کردن')}.click()`);
  await sp.waitFor(`document.querySelector('.yt-hashtags')?.textContent.includes('#طراحی')`, 'preview hashtags');
  assert(await sp.evaluate(`document.body.textContent.includes('امتیاز رتبه‌بندی')`), 'checklist disclaimer missing');
});

await step('language and theme switch instantly across open pages', async () => {
  await ws.goto(ext('workspace.html#settings'));
  await ws.getByLabel('زبان رابط').selectOption('en');
  await sp.waitFor(`document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr'`, 'panel switched to en');
  assert(await sp.evaluate(`document.body.textContent.includes('Current page')`), 'panel text not English');
  await ws.getByLabel('Theme').selectOption('dark');
  await sp.waitFor(`document.documentElement.dataset.theme === 'dark'`, 'panel dark');
  await ws.screenshot({ path: join(ART, 'workspace-settings-en-dark.png'), fullPage: true });
  await ws.getByLabel('Interface language').selectOption('fa');
  await ws.getByLabel('پوسته').selectOption('system');
  await sp.waitFor(`document.documentElement.lang === 'fa'`, 'panel back to fa');
});

await step('navigating to another video keeps the draft and its own source', async () => {
  await yt.goto(`https://www.youtube.com/watch?v=${VIDEO_2}`);
  await sp.waitFor(`document.querySelector('[data-testid=context-title]')?.textContent === 'Second video title'`, 'second video context');
  assert(await sp.evaluate(`${byLabel('عنوان')}?.value === 'آموزش فیگما برای مبتدی‌ها'`), 'draft was reassigned');
  assert(await sp.evaluate(`document.body.textContent.includes('صفحهٔ باز با منبع این پیش‌نویس فرق دارد')`), 'context-differs notice missing');
});

await step('unsupported page shows a safe fallback; local work still available', async () => {
  await yt.goto('https://example.com/');
  await sp.waitFor(`document.querySelector('[data-testid=context-card]')?.dataset.kind === 'unsupported'`, 'unsupported context');
  const linkDisabled = await sp.evaluate(`[...document.querySelectorAll('input[type=checkbox]')].find(c => c.closest('label')?.textContent.includes('پیوند به این صفحه'))?.disabled`);
  assert(linkDisabled === true, 'link checkbox should be disabled');
  assert(await sp.evaluate(`!!${byLabel('عنوان')}`), 'draft editor missing');
});

await step('content script left the YouTube page DOM unchanged', async () => {
  await yt.goto(`https://www.youtube.com/watch?v=${VIDEO_1}`);
  const after = await yt.evaluate(() => document.documentElement.outerHTML);
  assert(after === ytBefore, 'YouTube DOM changed');
});

await step('side panel layout at 320px has no horizontal overflow (light and dark)', async () => {
  const tab = await ctx.newPage();
  await tab.setViewportSize({ width: 320, height: 900 });
  await tab.goto(ext('sidepanel.html'));
  await tab.waitForSelector('[data-testid=context-card]');
  await tab.waitForTimeout(300);
  const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 0, `overflow ${overflow}px`);
  await tab.screenshot({ path: join(ART, 'sidepanel-320-fa-light.png'), fullPage: true });
  await tab.emulateMedia({ colorScheme: 'dark' });
  await tab.waitForTimeout(200);
  await tab.screenshot({ path: join(ART, 'sidepanel-320-fa-dark.png'), fullPage: true });
  await tab.close();
});

await step('workspace is keyboard reachable and fits 320px', async () => {
  await ws.goto('about:blank');
  await ws.goto(ext('workspace.html#drafts'));
  await ws.waitForSelector('h1');
  await ws.keyboard.press('Tab');
  const first = await ws.evaluate(() => document.activeElement?.textContent);
  assert(first === 'ایده‌ها', `first focus was ${first}`);
  await ws.getByRole('link', { name: 'قالب‌ها' }).press('Enter');
  await ws.waitForFunction(() => document.activeElement?.tagName === 'H1' && document.activeElement.textContent === 'قالب‌ها');
  await ws.getByRole('link', { name: 'پیش‌نویس‌ها' }).click();
  await ws.setViewportSize({ width: 320, height: 860 });
  await ws.getByText('آموزش فیگما برای مبتدی‌ها').first().click();
  await ws.waitForSelector('.yt-preview');
  const overflow = await ws.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 0, `overflow ${overflow}px`);
  await ws.screenshot({ path: join(ART, 'workspace-draft-320-fa.png'), fullPage: true });
  await ws.setViewportSize({ width: 1280, height: 860 });
  await ws.screenshot({ path: join(ART, 'workspace-draft-wide-fa.png'), fullPage: true });
});

let backupPath;
await step('export backup downloads every record', async () => {
  await ws.goto(ext('workspace.html#settings'));
  const [download] = await Promise.all([ws.waitForEvent('download'), ws.getByRole('button', { name: 'خروجی پشتیبان' }).click()]);
  backupPath = join(userDir, 'backup.json');
  await download.saveAs(backupPath);
  const b = JSON.parse(readFileSync(backupPath, 'utf8'));
  assert(b.app === 'tubex' && b.format === 1, 'bad header');
  assert(b.data.profiles.length === 1 && b.data.ideas.length === 1 && b.data.drafts.length === 1, 'record counts');
  assert(b.data.drafts[0].description.includes('#فیگما'), 'draft text missing from backup');
});

await step('invalid and unsafe imports are rejected safely; valid import merges', async () => {
  const input = ws.getByLabel('انتخاب فایل پشتیبان');
  const bad = join(userDir, 'bad.json');
  writeFileSync(bad, '{not json');
  await input.setInputFiles(bad);
  await ws.getByText('این فایل JSON معتبر نیست.').waitFor();

  const b = JSON.parse(readFileSync(backupPath, 'utf8'));
  b.data.ideas.push({ ...b.data.ideas[0], id: 'evil', source: { ...b.data.ideas[0].source, url: 'javascript:alert(1)' } });
  const mixed = join(userDir, 'mixed.json');
  writeFileSync(mixed, JSON.stringify(b));
  await input.setInputFiles(mixed);
  await ws.getByText(/رکورد معتبر پیدا شد/).waitFor();
  const text = await ws.getByText(/رکورد معتبر پیدا شد/).textContent();
  assert(text.includes('۱ رکورد نامعتبر'), `preview: ${text}`);
  await ws.getByRole('button', { name: 'ادغام (نسخهٔ جدیدتر می‌ماند)' }).click();
  await ws.getByText(/ورود انجام شد/).waitFor();
  await ws.getByRole('button', { name: 'بازگردانی آخرین ورود' }).waitFor();
});

await step('unsaved edit typed just before the browser quits survives restart', async () => {
  await sp.type(byLabel('توضیحات'), ' پایان');
  // Close immediately, inside the autosave debounce window.
  sp.close();
  await ctx.close();
  ({ ctx, id, blank } = await launch(userDir));
  ws = await ctx.newPage();
  await ws.goto(ext('workspace.html#drafts'));
  await ws.getByText('آموزش فیگما برای مبتدی‌ها').first().click();
  const desc = await ws.getByLabel('توضیحات').inputValue();
  assert(desc.endsWith(' پایان'), `description after restart: ${JSON.stringify(desc.slice(-30))}`);
  await ws.getByText('ذخیره شد ·').waitFor();
  const ideas = await ws.evaluate(async () => {
    const req = indexedDB.open('tubex');
    const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    return new Promise((r) => {
      const g = db.transaction('ideas').objectStore('ideas').count();
      g.onsuccess = () => r(g.result);
    });
  });
  assert(ideas === 1, `ideas after restart: ${ideas}`);
});

await ctx.close();
rmSync(userDir, { recursive: true, force: true });
console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} smoke steps passed. Screenshots: ${ART}`);
process.exit(failed ? 1 : 0);

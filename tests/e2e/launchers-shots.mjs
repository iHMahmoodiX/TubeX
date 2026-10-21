// Design review screenshots of the launchers, the TubeX drawer and Videolytics on synthetic pages. Usage:
//   npm run build && node tests/e2e/launchers-shots.mjs [outDir] [scenario ...]
// Env: LANG_UI=fa|en (default fa), THEME=dark|light (default dark), WIDTH (default 1440).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { channelPage, start, studioContentPage, studioEditorPage, watchPage } from './launchers-lib.mjs';

const [outDir = '/tmp/tubex-launchers-shots', ...asked] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const lang = process.env.LANG_UI ?? 'fa';
const theme = process.env.THEME ?? 'dark';
const width = Number(process.env.WIDTH ?? 1440);

const W = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const SCENES = {
  'vl-watch': { url: W, page: watchPage, host: 'tubex-videolytics' },
  'vl-compare': { url: W, page: watchPage, host: 'tubex-videolytics', steps: [['tubex-videolytics', '.tx-vl-pill[aria-pressed]']] },
  'vl-ranks': { url: W, page: watchPage, host: 'tubex-videolytics', steps: [['tubex-videolytics', '.tx-vl-load'], ['tubex-videolytics', '.tx-confirm .btn-primary, .tx-confirm button'], ['tubex-videolytics', '.tx-vl-textbtn >> nth=1']] },
  'vl-tools': { url: W, page: watchPage, host: 'tubex-videolytics', steps: [['tubex-videolytics', '.tx-vl-pill[aria-haspopup]']] },
  'bar-compact': { url: W, page: watchPage, host: 'tubex-watch', steps: [['tubex-videolytics', '.tx-vl-score']], scroll: 'tubex-watch' },
  'drawer-watch': { url: W, page: watchPage, host: 'tubex-launcher', steps: [['tubex-launcher', '.tx-ln-edge']] },
  'drawer-tools': { url: W, page: watchPage, host: 'tubex-launcher', steps: [['tubex-launcher', '.tx-ln-edge'], ['tubex-launcher', '#tx-ln-tab-tools']] },
  'drawer-alerts': { url: W, page: watchPage, host: 'tubex-launcher', steps: [['tubex-launcher', '.tx-ln-edge'], ['tubex-launcher', '#tx-ln-tab-alerts']] },
  'drawer-settings': { url: W, page: watchPage, host: 'tubex-launcher', steps: [['tubex-launcher', '.tx-ln-edge'], ['tubex-launcher', '#tx-ln-tab-settings']] },
  'drawer-channel': { url: 'https://www.youtube.com/@sample-channel', page: channelPage, host: 'tubex-launcher', steps: [['tubex-launcher', '.tx-ln-edge']] },
  'mast-menu': { url: W, page: watchPage, host: 'tubex-masthead', steps: [['tubex-masthead', '.tx-ln-mastbtn']] },
  'studio-mast': { url: 'https://studio.youtube.com/video/dQw4w9WgXcQ/edit', page: studioEditorPage, host: 'tubex-studio-masthead', steps: [['tubex-studio-masthead', '.tx-ln-mastbtn']] },
  'studio-drawer': { url: `https://studio.youtube.com/channel/UCownownownownownownown1/videos/upload`, page: studioContentPage, host: 'tubex-launcher', steps: [['tubex-launcher', '.tx-ln-edge']] },
  'studio-edge': { url: `https://studio.youtube.com/channel/UCownownownownownownown1/videos/upload`, page: studioContentPage, host: 'tubex-launcher' },
};
const names = asked.length ? asked : Object.keys(SCENES);

const { ctx, setPage } = await start({ lang, width });
const p = await ctx.newPage();
p.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
p.on('pageerror', (e) => console.error('[pageerror]', e.message));
for (const name of names) {
  const s = SCENES[name];
  if (!s) {
    console.error(`unknown scenario ${name}`);
    continue;
  }
  setPage(s.page());
  await p.goto('about:blank');
  // Each scenario starts with the drawer closed.
  await p.goto(s.url);
  await p.evaluate(() => 0);
  if (theme === 'light') await p.evaluate(() => document.documentElement.removeAttribute('dark'));
  try {
    await p.waitForSelector(s.host, { timeout: 8000, state: 'attached' });
  } catch {
    console.error(`${name}: island ${s.host} did not appear`);
    continue;
  }
  await p.waitForTimeout(1500);
  for (const [host, sel] of s.steps ?? []) {
    try {
      await p.locator(host).first().locator(sel).first().click({ timeout: 4000 });
    } catch (e) {
      console.error(`${name}: could not click ${host} ${sel}: ${e.message.split('\n')[0]}`);
    }
    await p.waitForTimeout(900);
  }
  if (s.scroll) await p.locator(s.scroll).first().scrollIntoViewIfNeeded();
  const file = join(outDir, `launchers-${name}-${lang}-${theme}-${width}.png`);
  await p.screenshot({ path: file, fullPage: process.env.FULL === '1' });
  console.log(file);
  // Close the drawer between scenarios (its open state is remembered per site).
  await p.keyboard.press('Escape').catch(() => {});
  await p.evaluate(() => 0);
  const closeBtn = p.locator('tubex-launcher').first().locator('.tx-ln-head button').nth(1);
  if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click().catch(() => {});
  await p.waitForTimeout(300);
}
await ctx.close();

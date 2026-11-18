// Videolytics best practices on synthetic watch pages (#8 item 5): page signals (player chapters, CC, cards, end
// screen; pinned/hearted comments) plus the API facts. Also checks that the checklist re-evaluates when the
// comments load after the panel (MutationObserver, no polling). Usage:
//   npm run build && node tests/e2e/launchers-practices-shots.mjs [outDir]
// Env: LANG_UI=fa|en (default fa), WIDTH (default 1440).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { start, watchPage } from './launchers-lib.mjs';

const [outDir = '/tmp/tubex-practices-shots'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const lang = process.env.LANG_UI ?? 'fa';
const width = Number(process.env.WIDTH ?? 1440);

// Inferred 2026 player/comments markup (same selectors as the unit fixtures in tests/unit/launchersPractices.test.ts).
const PLAYER = (chapters) => `<div id="movie_player" class="html5-video-player player" style="position:relative">
  <div class="ytp-chrome-bottom" style="position:absolute;inset-inline:12px;bottom:12px">
    <div class="ytp-progress-bar"><div class="ytp-chapters-container" style="display:flex;gap:3px">${(chapters ? [30, 25, 45] : [100]).map((w) => `<div class="ytp-chapter-hover-container" style="height:4px;flex:${w};background:#888"></div>`).join('')}</div></div>
    <div style="display:flex;gap:12px;align-items:center;margin-top:8px;color:#fff">
      <span class="ytp-time-current">0:02</span>
      <div class="ytp-chapter-container" ${chapters ? '' : 'style="display:none"'}><span class="ytp-chapter-title-content">${chapters ? 'قسمت صفر - Figma' : ''}</span></div>
      <button class="ytp-subtitles-button ytp-button" aria-pressed="false" style="margin-inline-start:auto">CC</button>
    </div>
  </div>
  ${chapters ? '<div class="ytp-cards-teaser"><div class="ytp-cards-teaser-text">قسمت بعد</div></div><div class="ytp-ce-element ytp-ce-video" style="display:none"></div>' : ''}
</div>`;
const THREAD = (pinned, hearted) => `<ytd-comment-thread-renderer><ytd-comment-view-model id="comment"><div id="pinned-comment-badge">${pinned ? '<ytd-pinned-comment-badge-renderer><small>Pinned by @hossein</small></ytd-pinned-comment-badge-renderer>' : ''}</div><p>${pinned ? 'لینک فایل‌ها در توضیحات' : 'عالی بود'}</p><div id="creator-heart">${hearted ? '<ytd-creator-heart-renderer><span>♥</span></ytd-creator-heart-renderer>' : ''}</div></ytd-comment-view-model></ytd-comment-thread-renderer>`;
const COMMENTS = (inner) => `<ytd-comments id="comments"><ytd-item-section-renderer><div id="contents">${inner}</div></ytd-item-section-renderer></ytd-comments>`;

const page = ({ id, chapters, comments }) => () =>
  watchPage()
    .replace('video-id="dQw4w9WgXcQ"', `video-id="${id}"`)
    .replace('<div class="player"></div>', PLAYER(chapters))
    .replace('</ytd-watch-metadata>', `</ytd-watch-metadata>${COMMENTS(comments)}`);

const SCENES = {
  // The owner's case: chapters in the player, pinned + hearted comment loaded.
  loaded: { id: 'dQw4w9WgXcQ', page: page({ id: 'dQw4w9WgXcQ', chapters: true, comments: THREAD(true, false) + THREAD(false, true) }) },
  // Before scrolling to the comments; description chapters not starting at 0:00; no uploaded captions, CC on.
  warn: { id: 'bpWarn00001', page: page({ id: 'bpWarn00001', chapters: false, comments: '' }) },
  // Same page, then the comments load (no pin): pinned turns from "?" to "×" without polling.
  'warn-late-comments': { id: 'bpWarn00001', page: page({ id: 'bpWarn00001', chapters: false, comments: '' }), late: THREAD(false, false) + THREAD(false, false) },
};

const { ctx, setPage } = await start({ lang, width, height: 1100 });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.error('[pageerror]', e.message));
let failed = 0;
for (const [name, s] of Object.entries(SCENES)) {
  setPage(s.page());
  await p.goto('about:blank');
  await p.goto(`https://www.youtube.com/watch?v=${s.id}`);
  await p.waitForSelector('tubex-videolytics', { timeout: 8000, state: 'attached' });
  const bp = p.locator('tubex-videolytics').first().locator('.tx-vl-bp');
  await bp.waitFor({ timeout: 8000 });
  await p.waitForTimeout(1200);
  if (s.late) {
    await p.evaluate((html) => (document.querySelector('ytd-comments #contents').innerHTML = html), s.late);
    await p.waitForTimeout(1200);
  }
  const states = await bp.locator('li').evaluateAll((lis) => lis.map((li) => `${li.getAttribute('data-state')}`));
  console.log(name, states.join(' '));
  const expect = { loaded: 'ok ok ok ok ok ok ok', warn: 'fail ok warn unknown unknown unknown unknown', 'warn-late-comments': 'fail ok warn fail unknown unknown unknown' }[name];
  if (states.join(' ') !== expect) {
    failed++;
    console.error(`  expected ${expect}`);
  }
  await bp.scrollIntoViewIfNeeded();
  const file = join(outDir, `practices-${name}-${lang}-${width}.png`);
  await p.locator('tubex-videolytics').first().screenshot({ path: file });
  console.log(file);
}
await ctx.close();
process.exit(failed ? 1 : 0);

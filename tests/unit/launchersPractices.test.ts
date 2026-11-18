// @vitest-environment happy-dom
// Videolytics best practices (#8 item 5): tolerant chapter reading and the watch-page DOM signals.
import { describe, expect, it } from 'vitest';
import { chapterLines, chapterProblems, cleanChapterLine, extractChapters, scanChapters } from '../../src/domain/chapters';
import { readWatchSignals, shown } from '../../src/inpage/launch/dom';
import { bestPractices, chapterPractice } from '../../src/inpage/launch/logic';

const ID = 'dQw4w9WgXcQ';
const doc = (html: string) => {
  const d = document.implementation.createHTMLDocument('t');
  d.body.innerHTML = html;
  return d;
};
const watch = (inner: string, id = ID) => doc(`<ytd-watch-flexy video-id="${id}">${inner}</ytd-watch-flexy>`);
const state = (desc: string, page?: Parameters<typeof chapterPractice>[1]) => chapterPractice(desc, page);

describe('tolerant chapter reading', () => {
  it('cleans bidi marks, odd spaces and Persian/Arabic digits', () => {
    expect(cleanChapterLine('‏‫۰۱:۲۳‬ نصب')).toBe('01:23 نصب');
    expect(cleanChapterLine('٠:٤٥ x')).toBe('0:45 x');
  });

  it('reads timestamps at the start or the end, with bullets and brackets', () => {
    const lines = chapterLines(['• 0:00 Intro', '(0:45) Frames', '[1:02:03] - Outro', 'Export — 3:10', 'نصب فیگما (۵:۲۰)', 'at 5:30 I show', '12:00', 'see 1:2:3:4 here'].join('\n'));
    expect(lines).toEqual([
      { seconds: 0, title: 'Intro' },
      { seconds: 45, title: 'Frames' },
      { seconds: 3723, title: 'Outro' },
      { seconds: 190, title: 'Export' },
      { seconds: 320, title: 'نصب فیگما' },
    ]);
  });

  it('the owner’s video (1qhTxMEc8e4): Persian chapters with RLM marks, Persian digits and a second list are ok', () => {
    // Shape of the owner's description (starts "00:00 قسمت صفر - Figma …"); the exact text could not be fetched here,
    // so this reproduces the patterns that made 0.5.0's strict parser report a warning.
    const desc = [
      'آموزش جامع ابزار فیگما (Figma) | دوره کامل مقدماتی تا پیشرفته | پروژه محور',
      'در این ویدیو به طور جامع با نرم افزار فیگما آشنا میشید.',
      '',
      '00:00 قسمت صفر - Figma آموزش جامع فیگما - پیش نیازهای شروع کار با',
      '‏۰۱:۱۵ دانلود فیگما',
      '‏۰۳:۴۰ نصب روی ویندوز و مک',
      '07:18 ‏ابزار فیگما برای ویدیوز، مک و لینوکس',
      'نسخه وب فیگما - 12:05',
      '',
      'قسمت‌های دیگر دوره:',
      '00:00 قسمت اول',
      '19:26 قسمت دوم',
    ].join('\n');
    // 0.5.0 behaviour (kept for the chapter tools): the strict reader misses the marked/Persian lines and reads
    // the second list as out of order -> a warning the creator can't act on.
    expect(chapterProblems(desc).length).toBeGreaterThan(0);
    const scan = scanChapters(desc);
    expect(scan.chapters.map((c) => c.seconds)).toEqual([0, 75, 220, 438, 725]);
    expect(scan.problems).toEqual([]);
    expect(state(desc)).toMatchObject({ state: 'ok', source: 'description', reason: 'desc', values: { n: 5 } });
    // And the page signal wins regardless.
    expect(state(desc, 'shown')).toMatchObject({ state: 'ok', source: 'page' });
  });

  it('warns only with a concrete, fixable reason', () => {
    expect(state('0:10 Intro\n0:45 Frames\n3:10 Export')).toMatchObject({ state: 'warn', reason: 'notAtZero' });
    expect(state('0:00 Intro\n3:10 Export')).toMatchObject({ state: 'warn', reason: 'tooFew', values: { n: 2 } });
    expect(state('0:00 Intro\n0:05 Hi\n3:10 Export')).toMatchObject({ state: 'warn', reason: 'tooShort' });
    expect(state('0:00 Intro\n3:10 Export\n1:00 Frames')).toMatchObject({ state: 'warn', reason: 'notAscending' });
    // One or two stray timestamps are not a chapter list: "none", not a warning about a list that isn't there.
    expect(state('Recorded live\nat 5:30 I show the trick\nBonus - 12:40')).toMatchObject({ state: 'fail', reason: 'none' });
    expect(state('no timestamps')).toMatchObject({ state: 'fail', reason: 'none' });
    // YouTube's automatic chapters count as chapters.
    expect(state('no timestamps', 'auto')).toMatchObject({ state: 'ok', reason: 'auto' });
  });

  it('leaves the strict helpers used by the chapter tools unchanged', () => {
    expect(extractChapters('0:00 Intro\n‏1:00 x')).toEqual([{ time: '0:00', seconds: 0, title: 'Intro' }]);
    expect(chapterProblems('0:00 Intro\n3:10 Export')).toEqual(['too-few']);
  });
});

describe('watch page signals', () => {
  const PLAYER_CHAPTERS = `<div id="movie_player" class="html5-video-player"><div class="ytp-progress-bar"><div class="ytp-chapters-container"><div class="ytp-chapter-hover-container"></div><div class="ytp-chapter-hover-container"></div><div class="ytp-chapter-hover-container"></div></div></div></div>`;
  const PLAYER_PLAIN = `<div id="movie_player" class="html5-video-player"><div class="ytp-progress-bar"><div class="ytp-chapters-container"><div class="ytp-chapter-hover-container"></div></div></div><div class="ytp-chapter-container" style="display: none"><span class="ytp-chapter-title-content"></span></div></div>`;

  it('chapters: progress-bar segments, chapter title, engagement panels, description cards', () => {
    expect(readWatchSignals(watch(PLAYER_CHAPTERS), ID).chapters).toBe('shown');
    expect(readWatchSignals(watch(PLAYER_PLAIN), ID).chapters).toBe('none');
    expect(readWatchSignals(watch(`<div id="movie_player"><div class="ytp-chapter-container"><span class="ytp-chapter-title-content">قسمت صفر - Figma</span></div></div>`), ID).chapters).toBe('shown');
    expect(readWatchSignals(watch(`${PLAYER_PLAIN}<div id="panels"><ytd-engagement-panel-section-list-renderer target-id="engagement-panel-macro-markers-description-chapters" visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN"></ytd-engagement-panel-section-list-renderer></div>`), ID).chapters).toBe('shown');
    expect(readWatchSignals(watch(`<div id="description"><ytd-structured-description-content-renderer><ytd-horizontal-card-list-renderer><ytd-macro-markers-list-item-renderer></ytd-macro-markers-list-item-renderer></ytd-horizontal-card-list-renderer></ytd-structured-description-content-renderer></div>`), ID).chapters).toBe('shown');
    expect(readWatchSignals(watch(`<ytd-engagement-panel-section-list-renderer target-id="engagement-panel-macro-markers-auto-chapters"></ytd-engagement-panel-section-list-renderer>`), ID).chapters).toBe('auto');
    expect(readWatchSignals(watch(''), ID).chapters).toBeUndefined();
  });

  const thread = (pinned: boolean, heart = '') =>
    `<ytd-comment-thread-renderer><ytd-comment-view-model id="comment"><div id="pinned-comment-badge">${pinned ? '<ytd-pinned-comment-badge-renderer><span>Pinned by @hossein</span></ytd-pinned-comment-badge-renderer>' : ''}</div><div id="content-text">hi</div><div id="creator-heart">${heart}</div></ytd-comment-view-model></ytd-comment-thread-renderer>`;
  const comments = (inner: string) => `<div id="below"><ytd-comments id="comments"><ytd-item-section-renderer><div id="contents">${inner}</div></ytd-item-section-renderer></ytd-comments></div>`;

  it('pinned: found / first thread not pinned / not loaded / comments off', () => {
    expect(readWatchSignals(watch(comments(thread(true) + thread(false))), ID).pinned).toBe('yes');
    expect(readWatchSignals(watch(comments(thread(false) + thread(true))), ID).pinned).toBe('no');
    expect(readWatchSignals(watch(comments('')), ID).pinned).toBe('notLoaded');
    expect(readWatchSignals(watch(''), ID).pinned).toBe('notLoaded');
    expect(readWatchSignals(watch(comments('<ytd-message-renderer>Comments are turned off.</ytd-message-renderer>')), ID).pinned).toBe('off');
    // The empty badge slot every comment has is not a pin.
    expect(readWatchSignals(watch(comments(thread(false))), ID).pinned).toBe('no');
    // A pinned reply inside the first thread doesn't count (only the top comment can be pinned).
    expect(readWatchSignals(watch(comments(`<ytd-comment-thread-renderer><ytd-comment-view-model id="comment"><div id="pinned-comment-badge"></div></ytd-comment-view-model><div id="replies"><ytd-pinned-comment-badge-renderer>x</ytd-pinned-comment-badge-renderer></div></ytd-comment-thread-renderer>`)), ID).pinned).toBe('no');
  });

  it('hearted: viewer renderer, creator view (hearted / unhearted), aria-pressed, not loaded', () => {
    const viewer = '<ytd-creator-heart-renderer><img alt=""><span id="hearted-border"></span></ytd-creator-heart-renderer>';
    expect(readWatchSignals(watch(comments(thread(true) + thread(false, viewer))), ID).hearted).toBe(true);
    const creatorOn = '<ytd-creator-heart-renderer><div id="hearted"></div><div id="unhearted" hidden></div></ytd-creator-heart-renderer>';
    const creatorOff = '<ytd-creator-heart-renderer><div id="hearted" hidden></div><div id="unhearted"></div></ytd-creator-heart-renderer>';
    expect(readWatchSignals(watch(comments(thread(false, creatorOff) + thread(false, creatorOn))), ID).hearted).toBe(true);
    expect(readWatchSignals(watch(comments(thread(false, creatorOff))), ID).hearted).toBe(false);
    expect(readWatchSignals(watch(comments(thread(false, '<ytd-creator-heart-renderer is-hearted></ytd-creator-heart-renderer>'))), ID).hearted).toBe(true);
    expect(readWatchSignals(watch(comments(thread(false, '<ytd-creator-heart-renderer><button aria-pressed="false"></button></ytd-creator-heart-renderer>'))), ID).hearted).toBe(false);
    expect(readWatchSignals(watch(comments(thread(false))), ID).hearted).toBe(false);
    expect(readWatchSignals(watch(comments('')), ID).hearted).toBeUndefined();
  });

  it('cards, end screen and the CC button from the player', () => {
    const p = (inner: string) => watch(`<div id="movie_player" class="html5-video-player">${inner}</div>`);
    expect(readWatchSignals(p('<div class="ytp-cards-teaser"><div class="ytp-cards-teaser-text">Watch the next part</div></div>'), ID).cards).toBe(true);
    expect(readWatchSignals(p('<div class="iv-drawer"><div class="iv-card"></div></div>'), ID).cards).toBe(true);
    expect(readWatchSignals(p('<button class="ytp-button ytp-cards-button"></button>'), ID).cards).toBe(true);
    expect(readWatchSignals(p('<button class="ytp-button ytp-cards-button" style="display: none;"></button><div class="ytp-cards-teaser"><div class="ytp-cards-teaser-text"></div></div>'), ID).cards).toBeUndefined();
    expect(readWatchSignals(p('<div class="ytp-ce-element ytp-ce-video"></div>'), ID).endScreen).toBe(true);
    expect(readWatchSignals(p('<div class="ytp-endscreen-content"></div>'), ID).endScreen).toBeUndefined();
    expect(readWatchSignals(p('<button class="ytp-subtitles-button ytp-button" aria-pressed="false"></button>'), ID).cc).toBe('on');
    expect(readWatchSignals(p('<button class="ytp-subtitles-button ytp-button" aria-disabled="true"></button>'), ID).cc).toBe('off');
    expect(readWatchSignals(p('<button class="ytp-subtitles-button ytp-button" style="display:none"></button>'), ID).cc).toBeUndefined();
    expect(readWatchSignals(p(''), ID).cc).toBeUndefined();
  });

  it('ignores a page that still shows another video (SPA navigation)', () => {
    const s = readWatchSignals(watch(PLAYER_CHAPTERS + comments(thread(true)), 'otherVideo1'), ID);
    expect(s).toEqual({ pinned: 'notLoaded' });
  });

  it('skips hidden ytd-watch-flexy copies', () => {
    const d = doc(`<ytd-watch-flexy hidden video-id="${ID}">${PLAYER_CHAPTERS}</ytd-watch-flexy><ytd-watch-flexy video-id="${ID}">${PLAYER_PLAIN}</ytd-watch-flexy>`);
    expect(readWatchSignals(d, ID).chapters).toBe('none');
  });

  it('shown() respects [hidden] and display:none', () => {
    const d = doc('<div hidden><span id="a"></span></div><span id="b" style="display:none"></span><span id="c"></span>');
    expect(shown(d.getElementById('a'))).toBe(false);
    expect(shown(d.getElementById('b'))).toBe(false);
    expect(shown(d.getElementById('c'))).toBe(true);
    expect(shown(null)).toBe(false);
  });
});

describe('best practices with the page', () => {
  const by = (items: ReturnType<typeof bestPractices>) => Object.fromEntries(items.map((p) => [p.id, `${p.state}:${p.source}:${p.reason}`]));

  it('the owner’s case: chapters and pin shown on the page are ok', () => {
    const items = bestPractices('00:00 قسمت صفر - Figma', { maxres: true, caption: true }, { chapters: 'shown', pinned: 'yes', hearted: true, cards: true, endScreen: true, cc: 'on' });
    expect(by(items)).toEqual({
      thumbnail: 'ok:api:maxres',
      captions: 'ok:api:uploaded',
      chapters: 'ok:page:page',
      pinned: 'ok:page:page',
      hearted: 'ok:page:page',
      cards: 'ok:page:page',
      endScreen: 'ok:page:page',
    });
  });

  it('comments not loaded / not found are unknown, never fail; only a loaded unpinned first thread fails', () => {
    const base = { maxres: true, caption: false };
    expect(by(bestPractices('', base, { pinned: 'notLoaded' }))).toMatchObject({ pinned: 'unknown:page:notLoaded', hearted: 'unknown:page:notLoaded', cards: 'unknown:page:notFound', endScreen: 'unknown:page:notFound' });
    expect(by(bestPractices('', base, { pinned: 'no', hearted: false }))).toMatchObject({ pinned: 'fail:page:none', hearted: 'unknown:page:notFound' });
    expect(by(bestPractices('', base, { pinned: 'off' }))).toMatchObject({ pinned: 'unknown:page:off' });
  });

  it('captions: uploaded (API), auto/uploaded (CC button), none', () => {
    const cap = (caption: boolean | undefined, cc?: 'on' | 'off') => by(bestPractices('', { maxres: true, caption }, { pinned: 'notLoaded', cc })).captions;
    expect(cap(true, 'off')).toBe('ok:api:uploaded');
    expect(cap(false, 'on')).toBe('ok:page:auto');
    expect(cap(undefined, 'on')).toBe('ok:page:auto');
    expect(cap(false, 'off')).toBe('fail:page:none');
    expect(cap(false)).toBe('fail:api:noUploaded');
    expect(cap(undefined)).toBe('unknown:api:unknown');
  });
});

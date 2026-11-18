// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { launchersMethods } from '../../src/background/methods/launchers';
import { requestDrawer, onDrawerRequest } from '../../src/inpage/launch/bus';
import { inFullscreen, pageDir, studioMastheadSpot, videolyticsSpot } from '../../src/inpage/launch/dom';
import {
  bestPractices,
  chapterState,
  clampTabTop,
  clampWidth,
  edgeSide,
  factsFromItem,
  MAX_RANK_TAGS,
  pagePanelFor,
  rankedCount,
  rankPlan,
  ratioTo,
  recentAverage,
  watchIdFrom,
} from '../../src/inpage/launch/logic';

const doc = (html: string, attrs = '') => {
  const d = document.implementation.createHTMLDocument('t');
  d.documentElement.innerHTML = `<head></head><body ${attrs}>${html}</body>`;
  return d;
};

describe('pagePanelFor', () => {
  it('picks the page-aware panel by URL', () => {
    expect(pagePanelFor('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('videolytics');
    expect(pagePanelFor('youtube', 'https://www.youtube.com/watch?v=bad')).toBe('none');
    expect(pagePanelFor('youtube', 'https://www.youtube.com/@iHMahmoodi')).toBe('channelInsights');
    expect(pagePanelFor('youtube', 'https://www.youtube.com/@iHMahmoodi/videos')).toBe('channelInsights');
    expect(pagePanelFor('youtube', 'https://www.youtube.com/channel/UCWHEjv-OmN2J6mkAJ051OJg')).toBe('channelInsights');
    expect(pagePanelFor('youtube', 'https://www.youtube.com/results?search_query=x')).toBe('none');
    expect(pagePanelFor('youtube', 'https://www.youtube.com/')).toBe('none');
    expect(pagePanelFor('studio', 'https://studio.youtube.com/channel/UCWHEjv-OmN2J6mkAJ051OJg/videos/upload?filter=%5B%5D')).toBe('studioContent');
    expect(pagePanelFor('studio', 'https://studio.youtube.com/channel/UCWHEjv-OmN2J6mkAJ051OJg/content/shorts')).toBe('studioContent');
    expect(pagePanelFor('studio', 'https://studio.youtube.com/video/6u76wVXVDK8/edit')).toBe('tagTools');
    expect(pagePanelFor('studio', 'https://studio.youtube.com/channel/UCWHEjv-OmN2J6mkAJ051OJg/analytics')).toBe('none');
    expect(pagePanelFor('studio', 'not a url')).toBe('none');
    // A Studio-looking path on youtube.com is not Studio.
    expect(pagePanelFor('studio', 'https://www.youtube.com/video/6u76wVXVDK8/edit')).toBe('none');
  });
  it('reads the watch id', () => {
    expect(watchIdFrom('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ');
    expect(watchIdFrom('https://www.youtube.com/@x')).toBeNull();
  });
});

describe('geometry', () => {
  it('docks to the page end edge', () => {
    expect(edgeSide('ltr')).toBe('right');
    expect(edgeSide('rtl')).toBe('left');
    expect(edgeSide(undefined)).toBe('right');
  });
  it('clamps drawer width and tab position', () => {
    expect(clampWidth(380, 1440)).toBe(380);
    expect(clampWidth(100, 1440)).toBe(320);
    expect(clampWidth(2000, 1440)).toBe(720);
    expect(clampWidth(700, 600)).toBe(520);
    expect(clampWidth(NaN, 1440)).toBe(380);
    expect(clampTabTop(10, 900)).toBe(64);
    expect(clampTabTop(5000, 900)).toBe(836);
    expect(clampTabTop(NaN, 900)).toBe(160);
  });
});

describe('best practices', () => {
  it('reads chapters from description timestamps', () => {
    expect(chapterState('0:00 Intro\n0:45 Frames\n3:10 Export')).toBe('ok');
    expect(chapterState('0:10 Intro\n0:45 Frames\n3:10 Export')).toBe('warn');
    expect(chapterState('0:00 Intro\n3:10 Export')).toBe('warn');
    expect(chapterState('no timestamps here')).toBe('fail');
  });
  it('never marks what no API reports as failed', () => {
    const items = bestPractices('', { maxres: false, caption: true });
    const by = Object.fromEntries(items.map((i) => [i.id, i.state]));
    expect(by).toEqual({ thumbnail: 'fail', captions: 'ok', chapters: 'fail', pinned: 'unknown', hearted: 'unknown', cards: 'unknown', endScreen: 'unknown' });
    const none = Object.fromEntries(bestPractices('', null).map((i) => [i.id, i.state]));
    expect(none.thumbnail).toBe('unknown');
    expect(none.captions).toBe('unknown');
    expect(Object.values(none).filter((s) => s === 'fail')).toEqual(['fail']); // only chapters (from the public description)
  });
  it('reads facts from a videos.list item', () => {
    expect(factsFromItem({ snippet: { thumbnails: { maxres: { url: 'x' } } }, contentDetails: { caption: 'true', definition: 'hd' } })).toEqual({ maxres: true, caption: true, definition: 'hd' });
    expect(factsFromItem({ snippet: { thumbnails: { high: {} } }, contentDetails: { caption: 'false' } })).toEqual({ maxres: false, caption: false, definition: undefined });
    expect(factsFromItem({ snippet: {} })).toEqual({ maxres: false, caption: undefined, definition: undefined });
    expect(factsFromItem(undefined)).toBeNull();
  });
});

describe('compare', () => {
  it('averages recent uploads, skipping the video itself and hidden counts', () => {
    const avg = recentAverage(
      [
        { id: 'a', views: 100, likes: 10, comments: 1 },
        { id: 'b', views: 300, likes: undefined, comments: 3 },
        { id: 'self', views: 9999, likes: 999, comments: 99 },
      ],
      'self',
    );
    expect(avg).toEqual({ views: 200, likes: 10, comments: 2, sample: 2 });
    expect(recentAverage([], 'x')).toEqual({ views: undefined, likes: undefined, comments: undefined, sample: 0 });
  });
  it('ratio is undefined when a side is missing (never 0)', () => {
    expect(ratioTo(300, 100)).toBe(3);
    expect(ratioTo(undefined, 100)).toBeUndefined();
    expect(ratioTo(100, 0)).toBeUndefined();
  });
});

describe('ranked tags', () => {
  it('states the cost before checking; cached tags are free', () => {
    const tags = Array.from({ length: 40 }, (_, i) => `t${i}`);
    expect(rankPlan(tags, undefined)).toEqual({ tags: tags.slice(0, MAX_RANK_TAGS), units: 3000, cached: 0 });
    expect(rankPlan(tags.slice(0, 5), 2)).toEqual({ tags: tags.slice(0, 5), units: 200, cached: 3 });
    expect(rankedCount([{ rank: 3 }, { rank: null }, { rank: 40 }])).toBe(2);
  });
});

describe('anchors', () => {
  it('puts Videolytics at the top of the right column, with fallbacks', () => {
    const a = doc('<ytd-watch-flexy><div id="primary"></div><div id="secondary"><div id="secondary-inner"><div id="related"></div></div></div></ytd-watch-flexy>');
    expect(videolyticsSpot(a)).toMatchObject({ append: 'first' });
    expect(videolyticsSpot(a)!.el.id).toBe('secondary-inner');
    const b = doc('<ytd-watch-flexy><div id="secondary"><div id="related"></div></div></ytd-watch-flexy>');
    expect(videolyticsSpot(b)!.el.id).toBe('secondary');
    const c = doc('<ytd-watch-flexy><div><div id="related"></div></div></ytd-watch-flexy>');
    expect(videolyticsSpot(c)).toMatchObject({ append: 'before' });
    expect(videolyticsSpot(doc('<ytd-watch-flexy hidden><div id="secondary"></div></ytd-watch-flexy>'))).toBeNull();
    expect(videolyticsSpot(doc('<div id="secondary"></div>'))).toBeNull();
  });
  it('puts the Studio button before help, with fallbacks', () => {
    const a = doc('<ytcp-header><div id="right-section"><ytcp-icon-button id="help-button"></ytcp-icon-button><ytcp-icon-button id="n"></ytcp-icon-button></div></ytcp-header>');
    expect(studioMastheadSpot(a)).toMatchObject({ append: 'before' });
    expect(studioMastheadSpot(a)!.el.id).toBe('help-button');
    const b = doc('<ytcp-header><div id="right-section"></div></ytcp-header>');
    expect(studioMastheadSpot(b)).toMatchObject({ append: 'first' });
    expect(studioMastheadSpot(doc('<div></div>'))).toBeNull();
  });
  it('reads the page direction and fullscreen', () => {
    const rtl = doc('');
    rtl.documentElement.setAttribute('dir', 'rtl');
    expect(pageDir(rtl)).toBe('rtl');
    expect(pageDir(doc(''))).toBe('ltr');
    expect(inFullscreen(doc('<ytd-watch-flexy fullscreen></ytd-watch-flexy>'))).toBe(true);
    expect(inFullscreen(doc('<ytd-watch-flexy></ytd-watch-flexy>'))).toBe(false);
  });
});

describe('bus', () => {
  it('reports when no drawer listens (switch off)', () => {
    expect(requestDrawer({ mode: 'open' })).toBe(false);
    const got: unknown[] = [];
    const off = onDrawerRequest((r) => got.push(r));
    expect(requestDrawer({ mode: 'toggle', view: 'alerts' })).toBe(true);
    off();
    expect(got).toEqual([{ mode: 'toggle', view: 'alerts' }]);
  });
});

describe('background methods', () => {
  it('validate arguments from content scripts', async () => {
    await expect(launchersMethods['launchers.videoFacts']!('not-an-id')).rejects.toThrow('bad argument');
    await expect(launchersMethods['launchers.videoFacts']!({})).rejects.toThrow('bad argument');
    await expect(launchersMethods['launchers.uncachedTags']!([])).rejects.toThrow('bad argument');
    await expect(launchersMethods['launchers.uncachedTags']!(Array.from({ length: 31 }, () => 'x'))).rejects.toThrow('bad argument');
    await expect(launchersMethods['launchers.uncachedTags']!(['ok', 5])).rejects.toThrow('bad argument');
  });
});

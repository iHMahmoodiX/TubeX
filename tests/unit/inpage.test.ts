import { describe, expect, it } from 'vitest';
import {
  ageDays,
  channelSummary,
  commentsCsv,
  DAY_MS,
  embedCode,
  engagementRate,
  fillReply,
  insertBlock,
  likeRate,
  normalizeKeywordScore,
  normalizeReplies,
  normalizeTagRanks,
  parseStart,
  pendingPages,
  pickKeyword,
  resultBadge,
  snippetDiff,
  studioUrl,
  tagRankCost,
  tagsFromVideos,
  tagsToAdd,
  videoSeo,
  viewsPerDay,
} from '../../src/domain/inpage';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * DAY_MS).toISOString();

describe('video stats', () => {
  it('computes views/day, engagement and like rate, never inventing missing counters', () => {
    const v = { views: 10_000, likes: 400, comments: 100, publishedAt: daysAgo(10) };
    expect(viewsPerDay(v, NOW)).toBe(1000);
    expect(engagementRate(v)).toBe(5);
    expect(likeRate(v)).toBe(4);
    expect(engagementRate({ ...v, comments: undefined })).toBeUndefined();
    expect(likeRate({ ...v, likes: undefined })).toBeUndefined();
    expect(viewsPerDay({ ...v, views: undefined }, NOW)).toBeUndefined();
    expect(engagementRate({ ...v, views: 0 })).toBeUndefined();
  });
  it('counts videos younger than a day as one day', () => {
    expect(viewsPerDay({ views: 500, publishedAt: daysAgo(0.25) }, NOW)).toBe(500);
    expect(ageDays('not a date', NOW)).toBeUndefined();
  });
});

describe('video SEO checklist score', () => {
  const good = {
    title: 'Figma auto layout tutorial for beginners',
    description: `Figma auto layout explained step by step.\nIn this video you learn everything about frames.\n${'More details about the lesson. '.repeat(10)}\n0:00 Intro\n0:30 Basics\n2:00 Advanced\n#figma #design`,
    tags: ['figma auto layout', 'figma', 'auto layout', 'figma tutorial', 'ui design', 'design tools', 'figma for beginners', 'learn figma', 'figma 2026', 'responsive design', 'figma components', 'web design', 'ux design', 'figma prototyping tutorial', 'figma design system basics'],
  };
  it('scores a complete video high and lists every check', () => {
    const r = videoSeo({ ...good, keyword: 'figma auto layout' });
    expect(r.score).toBe(100);
    expect(r.items.every((i) => i.state === 'ok')).toBe(true);
  });
  it('fails keyword checks when the keyword is absent, and skips them without a keyword', () => {
    const miss = videoSeo({ ...good, keyword: 'blender' });
    expect(miss.items.find((i) => i.id === 'keyword-title')!.state).toBe('fail');
    expect(miss.score!).toBeLessThan(100);
    const none = videoSeo({ ...good, keyword: '' });
    expect(none.items.filter((i) => i.state === 'skip').map((i) => i.id)).toEqual(['keyword-title', 'keyword-description', 'keyword-tags']);
    expect(none.score).toBe(100);
  });
  it('flags empty metadata and limit breaks', () => {
    const r = videoSeo({ title: '', description: '', tags: [], keyword: 'x' });
    expect(r.score).toBeLessThan(20);
    expect(r.items.find((i) => i.id === 'title-length')!.state).toBe('fail');
    expect(r.items.find((i) => i.id === 'tags-count')!.state).toBe('fail');
    const angle = videoSeo({ ...good, title: 'A <b> title for testing here', keyword: '' });
    expect(angle.items.find((i) => i.id === 'limits')!.state).toBe('fail');
  });
  it('matches Persian keywords regardless of Arabic letter variants and ZWNJ', () => {
    const r = videoSeo({ title: 'آموزش فیگما برای مبتدی‌ها', description: 'آموزش فيگما', tags: ['فیگما'], keyword: 'آموزش فیگما' });
    expect(r.items.find((i) => i.id === 'keyword-title')!.state).toBe('ok');
    expect(r.items.find((i) => i.id === 'keyword-description')!.state).toBe('ok');
  });
  it('picks the saved keyword, else the first tag', () => {
    expect(pickKeyword(' saved ', ['a'])).toEqual({ keyword: 'saved', source: 'saved' });
    expect(pickKeyword('', ['first', 'b'])).toEqual({ keyword: 'first', source: 'first-tag' });
    expect(pickKeyword(undefined, [])).toEqual({ keyword: '', source: 'none' });
  });
});

describe('search badges', () => {
  it('builds badges and highlights own channels', () => {
    const v = { id: 'aaaaaaaaaa1', channelId: 'UCown', tags: ['a', 'b'], views: 3000, publishedAt: daysAgo(3) };
    expect(resultBadge(v, new Set(['UCown']), NOW)).toEqual({ videoId: 'aaaaaaaaaa1', viewsPerDay: 1000, ageDays: 3, tagCount: 2, own: true });
    expect(resultBadge(v, new Set(), NOW).own).toBe(false);
  });
  it('pages only unknown ids, 50 per call', () => {
    const ids = Array.from({ length: 120 }, (_, i) => `id${i}`);
    const pages = pendingPages([...ids, 'id1'], new Set(['id0', 'id1']));
    expect(pages.map((p) => p.length)).toEqual([50, 50, 18]);
    expect(pages.flat()).not.toContain('id0');
    expect(pendingPages(['id0'], new Set(['id0']))).toEqual([]);
  });
});

describe('channel summary', () => {
  it('averages the latest 10 uploads with views and measures upload frequency', () => {
    const recent = Array.from({ length: 12 }, (_, i) => ({ views: i === 1 ? undefined : 1000 * (i + 1), publishedAt: daysAgo(2 + i * 7) }));
    const s = channelSummary({ views: 1_000_000, videoCount: 100 }, recent, NOW);
    expect(s.sample).toBe(9); // latest 10, one hides its views
    expect(s.avgRecentViews).toBeCloseTo((1000 + 3000 + 4000 + 5000 + 6000 + 7000 + 8000 + 9000 + 10000) / 9);
    expect(s.uploadsPerWeek).toBeCloseTo(1);
    expect(s.lastUploadDays).toBeCloseTo(2);
    expect(s.avgAllViews).toBe(10_000);
  });
  it('leaves values undefined without data', () => {
    const s = channelSummary({}, [], NOW);
    expect(s).toEqual({ avgRecentViews: undefined, sample: 0, avgAllViews: undefined, uploadsPerWeek: undefined, lastUploadDays: undefined });
  });
});

describe('Studio links', () => {
  it('deep-links for a known channel, else Studio home', () => {
    expect(studioUrl('comments', 'UCabcdefghijklmnopqrstuv')).toBe('https://studio.youtube.com/channel/UCabcdefghijklmnopqrstuv/comments/inbox');
    expect(studioUrl('dashboard', 'UCabcdefghijklmnopqrstuv')).toBe('https://studio.youtube.com/channel/UCabcdefghijklmnopqrstuv');
    expect(studioUrl('analytics')).toBe('https://studio.youtube.com/');
    expect(studioUrl('content', 'bad')).toBe('https://studio.youtube.com/');
  });
});

describe('template insertion', () => {
  it('appends a description block once', () => {
    expect(insertBlock('Hello', 'Follow me')).toEqual({ text: 'Hello\n\nFollow me', changed: true });
    expect(insertBlock('', 'Follow me')).toEqual({ text: 'Follow me', changed: true });
    expect(insertBlock('Hello\n\nFollow me', 'Follow me')).toEqual({ text: 'Hello\n\nFollow me', changed: false });
    expect(insertBlock('Hello', '  ')).toEqual({ text: 'Hello', changed: false });
  });
  it('adds only new tags that fit the 500-character budget', () => {
    const r = tagsToAdd(['figma', 'Design'], ['#design', 'ui', 'figma', 'ux']);
    expect(r).toEqual({ add: ['ui', 'ux'], duplicate: ['design', 'figma'], overLimit: [] });
    const long = 'x'.repeat(240);
    const over = tagsToAdd([long, `${long}y`], ['abcdefghijklmnopqrstuvwxyz', 'ok']);
    expect(over.overLimit).toEqual(['abcdefghijklmnopqrstuvwxyz']);
    expect(over.add).toEqual(['ok']);
  });
  it('ranks tags used by top videos, excluding tags already present', () => {
    const r = tagsFromVideos([{ tags: ['a', 'B', 'c'] }, { tags: ['b', 'c', 'c'] }, { tags: ['c'] }], ['a']);
    expect(r).toEqual([
      { tag: 'c', count: 3 },
      { tag: 'B', count: 2 },
    ]);
  });
});

describe('canned replies', () => {
  it('fills {name} without the @, and tidies when the name is unknown', () => {
    expect(fillReply('Thanks {name}!', { name: '@sara' })).toBe('Thanks sara!');
    expect(fillReply('{name}, thanks a lot', { name: '' })).toBe('thanks a lot');
    expect(fillReply('مرسی {نام} عزیز', { name: 'Ali' })).toBe('مرسی Ali عزیز');
  });
  it('reads replies from either source shape', () => {
    expect(normalizeReplies([{ id: '1', name: 'Thanks', text: 'Thanks {name}' }, { id: '2', text: '' }])).toEqual([{ id: '1', name: 'Thanks', text: 'Thanks {name}' }]);
    expect(normalizeReplies({ items: [{ id: 'x', title: 'T', body: 'B' }] })).toEqual([{ id: 'x', name: 'T', text: 'B' }]);
    expect(normalizeReplies(null)).toEqual([]);
  });
});

describe('CSV, embed and diff', () => {
  it('escapes CSV and neutralizes spreadsheet formulas', () => {
    const csv = commentsCsv([{ id: 'c1', author: '=HYPERLINK("x")', text: 'a, "b"\nc', likes: 2, replies: 0, publishedAt: '2026-01-01' }]);
    expect(csv.startsWith('﻿id,author')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"a, ""b""\nc"');
  });
  it('builds embed code with options', () => {
    const code = embedCode({ videoId: 'dQw4w9WgXcQ', width: 560, height: 315, start: 90, autoplay: true, loop: true, privacy: true, controls: false });
    expect(code).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90&autoplay=1&mute=1&controls=0&loop=1&playlist=dQw4w9WgXcQ');
    expect(code).toContain('width="560" height="315"');
    expect(parseStart('1:30')).toBe(90);
    expect(parseStart('1:02:03')).toBe(3723);
    expect(parseStart('abc')).toBeUndefined();
  });
  it('diffs title, description and tags', () => {
    const d = snippetDiff({ title: 'A', description: 'x', tags: ['a', 'b'] }, { title: 'B', description: 'x', tags: ['b', 'c'] });
    expect(d.title).toEqual({ from: 'A', to: 'B' });
    expect(d.description).toBeUndefined();
    expect(d.tagsAdded).toEqual(['c']);
    expect(d.tagsRemoved).toEqual(['a']);
    expect(d.changed).toBe(true);
    expect(snippetDiff({ title: 'A', description: '', tags: ['a', 'b'] }, { title: 'A', description: '', tags: ['b', 'a'] })).toMatchObject({ tagOrderChanged: true, changed: true });
    expect(snippetDiff({ title: 'A', description: '', tags: [] }, { title: 'A', description: '', tags: [] }).changed).toBe(false);
  });
});

describe('results from other areas', () => {
  it('normalizes tag rank shapes and keeps asked order', () => {
    expect(normalizeTagRanks([{ tag: 'B', rank: 3 }, { keyword: 'a', position: 0 }], ['a', 'b', 'c'])).toEqual([
      { tag: 'a', rank: null },
      { tag: 'b', rank: 3 },
      { tag: 'c', rank: null },
    ]);
    expect(normalizeTagRanks({ a: 12, b: { rank: 2 } }, ['a', 'b'])).toEqual([
      { tag: 'a', rank: 12 },
      { tag: 'b', rank: 2 },
    ]);
    expect(tagRankCost(5)).toBe(500);
  });
  it('normalizes keyword scores', () => {
    expect(normalizeKeywordScore({ score: 140, parts: { demand: 70, competition: 'x' }, sampleSize: 25, fetchedAt: 'T' })).toEqual({ score: 100, parts: [{ key: 'demand', value: 70 }], sampleSize: 25, fetchedAt: 'T' });
    expect(normalizeKeywordScore({ parts: [{ id: 'a', score: 1 }] })).toEqual({ score: null, parts: [{ key: 'a', value: 1 }], sampleSize: undefined, fetchedAt: undefined });
  });
});

import { describe, expect, it } from 'vitest';
import {
  around,
  countSince,
  findPosition,
  freshUploads,
  growth,
  hasExactPhrase,
  isDue,
  keywordScore,
  leaderRow,
  logScale,
  meanOfFirst,
  newMentions,
  parseSearchItems,
  parseVideoInput,
  rankChange,
  relatedTerms,
  sortLeaders,
  spendable,
  tagAdvice,
  weighted,
} from '../../src/domain/seo';

const now = Date.parse('2026-10-20T00:00:00Z');
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
const vid = (i: number, over: Partial<{ title: string; channelId: string; views: number; publishedAt: string }> = {}) => ({
  id: `v${i}`,
  title: over.title ?? `video ${i}`,
  channelId: over.channelId ?? `C${i}`,
  publishedAt: over.publishedAt ?? daysAgo(100),
  views: over.views,
});

describe('keyword score', () => {
  it('scales on a log axis and clamps', () => {
    expect(logScale(1_000, 1_000, 1_000_000)).toBe(0);
    expect(logScale(1_000_000, 1_000, 1_000_000)).toBe(100);
    expect(logScale(31_623, 1_000, 1_000_000)).toBeCloseTo(50, 0);
    expect(logScale(5, 1_000, 1_000_000)).toBe(0);
    expect(logScale(undefined, 1, 10)).toBeUndefined();
  });

  it('drops missing parts from a weighted mean', () => {
    expect(weighted([[50, 1], [undefined, 3], [100, 1]])).toBe(75);
    expect(weighted([[undefined, 1]])).toBeUndefined();
  });

  it('matches the exact phrase in order, ignoring case and punctuation', () => {
    expect(hasExactPhrase('Learn Python: for beginners', 'learn python')).toBe(true);
    expect(hasExactPhrase('Python, learn it', 'learn python')).toBe(false);
    expect(hasExactPhrase('آموزش پایتون از صفر', 'آموزش پایتون')).toBe(true);
    expect(hasExactPhrase('آموزش‌های پایتون', 'آموزش پایتون')).toBe(false);
  });

  it('rates a crowded keyword with huge channels as hard and a quiet one with small channels as easy', () => {
    const big = Array.from({ length: 10 }, (_, i) => vid(i, { title: 'learn python fast', views: 2_000_000, publishedAt: daysAgo(400) }));
    const bigSubs = Object.fromEntries(big.map((v) => [v.channelId, 3_000_000]));
    const hard = keywordScore({ keyword: 'learn python', videos: big, subscribers: bigSubs, mine: { channelIds: ['ME'], subscribers: 2_000 }, now });
    expect(hard.parts.competition.score).toBeGreaterThan(90);
    expect(hard.parts.competition.exactShare).toBe(1);
    expect(hard.parts.chance.basis).toBe('similar');
    expect(hard.parts.chance.similarShare).toBe(0);

    const small = Array.from({ length: 10 }, (_, i) => vid(i, { title: `topic ${i}`, views: 3_000, publishedAt: daysAgo(10) }));
    const smallSubs = Object.fromEntries(small.map((v) => [v.channelId, 1_500]));
    const easy = keywordScore({ keyword: 'learn python', videos: small, subscribers: smallSubs, mine: { channelIds: ['ME'], subscribers: 2_000 }, now });
    expect(easy.parts.competition.score).toBeLessThan(15);
    expect(easy.parts.demand.recentShare).toBe(1);
    expect(easy.parts.chance.similarShare).toBe(1);
    expect(easy.score).toBeGreaterThan(hard.score);
    expect(easy.sampleSize).toBe(10);
  });

  it('uses the views/day median for demand and reports my positions', () => {
    const videos = [vid(1, { views: 10_000, publishedAt: daysAgo(10) }), vid(2, { channelId: 'ME', views: 100, publishedAt: daysAgo(1) }), vid(3, { views: 3_000, publishedAt: daysAgo(30) })];
    const s = keywordScore({ keyword: 'x', videos, subscribers: {}, mine: { channelIds: ['ME'] }, now });
    expect(s.parts.demand.medianViewsPerDay).toBe(100);
    expect(s.parts.chance.myPositions).toEqual([2]);
    // No public sizes: chance comes only from my rank.
    expect(s.parts.chance.basis).toBe('none');
    expect(s.parts.chance.score).toBe(80);
  });

  it('leaves chance unknown without sizes or a channel, and scores an empty sample as 0', () => {
    const s = keywordScore({ keyword: 'x', videos: [vid(1, { views: 10 })], subscribers: {}, now });
    expect(s.parts.chance.score).toBeNull();
    expect(keywordScore({ keyword: 'x', videos: [], subscribers: {}, now }).score).toBe(0);
  });

  it('falls back to channels under 10K when my size is unknown', () => {
    const videos = [vid(1), vid(2), vid(3), vid(4)];
    const s = keywordScore({ keyword: 'x', videos, subscribers: { C1: 500, C2: 9_000, C3: 50_000 }, now });
    expect(s.parts.chance.basis).toBe('small');
    expect(s.parts.chance.similarShare).toBeCloseTo(2 / 3);
  });

  it('builds related terms without the keyword or duplicates', () => {
    expect(relatedTerms('Python', [['python', 'Django', 'django'], ['Flask', 'PYTHON']])).toEqual(['Django', 'Flask']);
  });
});

describe('rank parsing', () => {
  const body = {
    items: [
      { id: { kind: 'youtube#channel', channelId: 'UCx' }, snippet: { channelId: 'UCx' } },
      { id: { videoId: 'a' }, snippet: { channelId: 'C1', title: 'A', channelTitle: 'One', publishedAt: '2026-01-01T00:00:00Z' } },
      { id: { videoId: 'b' }, snippet: { channelId: 'ME', title: 'B', channelTitle: 'Me' } },
      { id: { videoId: 'c' }, snippet: { channelId: 'ME', title: 'C', channelTitle: 'Me' } },
    ],
  };
  it('reads video results in order and skips channels', () => {
    const items = parseSearchItems(body);
    expect(items.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(parseSearchItems(null)).toEqual([]);
  });
  it('finds a video or the best video of a channel', () => {
    const items = parseSearchItems(body);
    expect(findPosition(items, { videoId: 'c' })).toBe(3);
    expect(findPosition(items, { channelId: 'ME' })).toBe(2);
    expect(findPosition(items, { videoId: 'zz' })).toBeNull();
    expect(findPosition(items, {})).toBeNull();
  });
  it('flags moves of 3 or more and crossing the top-10 or top-50 line', () => {
    expect(rankChange(undefined, 5)).toMatchObject({ delta: null, alert: false });
    expect(rankChange(8, 6)).toMatchObject({ delta: 2, alert: false });
    expect(rankChange(20, 16)).toMatchObject({ delta: 4, alert: true });
    expect(rankChange(11, 10)).toMatchObject({ enteredTop10: true, alert: true });
    expect(rankChange(9, 12)).toMatchObject({ leftTop10: true, delta: -3, alert: true });
    expect(rankChange(null, 40)).toMatchObject({ enteredTop50: true, alert: true });
    expect(rankChange(30, null)).toMatchObject({ leftTop50: true, alert: true });
    expect(rankChange(null, null).alert).toBe(false);
  });
  it('shows the neighbourhood of a position', () => {
    const xs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(around(xs, 4).map((x) => x.pos)).toEqual([2, 3, 4, 5, 6]);
    expect(around(xs, 1).map((x) => x.item)).toEqual(['a', 'b', 'c']);
    expect(around(xs, null, 3).map((x) => x.item)).toEqual(['a', 'b', 'c']);
  });
  it('throttles and keeps a budget reserve', () => {
    expect(isDue(undefined, 1000, now)).toBe(true);
    expect(isDue(daysAgo(0.5), 86_400_000, now)).toBe(false);
    expect(isDue(daysAgo(1), 86_400_000, now)).toBe(true);
    expect(spendable(0, 8000)).toBe(7200);
    expect(spendable(7000, 8000)).toBe(200);
    expect(spendable(9000, 0)).toBe(0);
  });
  it('advises on tags', () => {
    expect(tagAdvice(3)).toBe('keep');
    expect(tagAdvice(35)).toBe('improve');
    expect(tagAdvice(null)).toBe('drop');
  });
  it('parses video links and ids', () => {
    expect(parseVideoInput('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseVideoInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe('dQw4w9WgXcQ');
    expect(parseVideoInput('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseVideoInput('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseVideoInput('https://studio.youtube.com/video/dQw4w9WgXcQ/edit')).toBe('dQw4w9WgXcQ');
    expect(parseVideoInput('hello')).toBeNull();
  });
});

describe('alerts', () => {
  it('finds new brand mentions by other channels', () => {
    const items = [
      { id: '1', channelId: 'ME' },
      { id: '2', channelId: 'X' },
      { id: '3', channelId: 'Y' },
    ];
    expect(newMentions(items, ['ME'], ['3']).map((x) => x.id)).toEqual(['2']);
  });
  it('treats the first upload check as a baseline', () => {
    expect(freshUploads(['a', 'b'], undefined)).toEqual([]);
    expect(freshUploads(['c', 'a', 'b'], ['a', 'b'])).toEqual(['c']);
  });
});

describe('leaderboard growth', () => {
  const at = (d: number) => daysAgo(d);
  it('needs two snapshots', () => {
    expect(growth([{ at: at(0), subscribers: 10 }], 'subscribers', 7)).toBeNull();
    expect(growth([{ at: at(1), subscribers: undefined }, { at: at(0), subscribers: 10 }], 'subscribers', 7)).toBeNull();
  });
  it('uses the snapshot at the window start as the base', () => {
    const pts = [
      { at: at(40), subscribers: 100 },
      { at: at(30), subscribers: 200 },
      { at: at(7), subscribers: 400 },
      { at: at(3), subscribers: 450 },
      { at: at(0), subscribers: 500 },
    ];
    expect(growth(pts, 'subscribers', 7)).toMatchObject({ abs: 100, pct: 0.25, partial: false });
    expect(growth(pts, 'subscribers', 30)).toMatchObject({ abs: 300, pct: 1.5, partial: false });
  });
  it('marks growth over a shorter history as partial', () => {
    const g = growth([{ at: at(2), views: 1000 }, { at: at(0), views: 1500 }], 'views', 30);
    expect(g).toMatchObject({ abs: 500, partial: true });
    expect(g!.spanDays).toBeCloseTo(2);
  });
  it('counts uploads, averages views and sorts with missing values last', () => {
    expect(countSince([at(1), at(29), at(31), 'bad'], 30, now)).toBe(2);
    expect(meanOfFirst([10, undefined, 30, 1000], 3)).toBe(20);
    expect(meanOfFirst([undefined], 3)).toBeUndefined();
    const a = leaderRow('A', 'Alpha', false, [{ at: at(7), subscribers: 100 }, { at: at(0), subscribers: 150 }]);
    const b = leaderRow('B', 'Beta', true, [{ at: at(0), subscribers: 1000 }]);
    expect(a.subs7?.abs).toBe(50);
    expect(b.subs7).toBeNull();
    expect(sortLeaders([b, a], 'subs7').map((r) => r.channelId)).toEqual(['A', 'B']);
    expect(sortLeaders([a, b], 'subs').map((r) => r.channelId)).toEqual(['B', 'A']);
  });
});

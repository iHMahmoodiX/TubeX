import { describe, expect, it } from 'vitest';
import {
  bandOf,
  benchmark,
  dailyRate,
  DAY,
  feedGroups,
  gregorianParts,
  growthFromAnalytics,
  growthFromSnapshots,
  keywordsText,
  median,
  monthBounds,
  monthGrid,
  nextMonth,
  parseChannelKeywords,
  percentileOf,
  performance,
  prevMonth,
  relabelTopics,
  snapPoints,
  tokenize,
  topicMatrix,
  topicShare,
  topicStats,
  topicVideos,
  uploadsCost,
  uploadsSince,
  videoKind,
  videoTerms,
  viewsByPublishDate,
  type UploadLite,
} from '../../src/domain/channelInsights';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const vid = (id: string, daysAgo: number, views: number | undefined, durationSec = 600, extra: Partial<UploadLite> = {}): UploadLite => ({ id, title: `Video ${id}`, publishedAt: iso(daysAgo), durationSec, views, ...extra });

describe('channel keywords', () => {
  it('parses quoted phrases and words, dropping duplicates', () => {
    expect(parseChannelKeywords('"آموزش UI" UX "UI Design" figma Figma "آموزش‌ها" ""')).toEqual(['آموزش UI', 'UX', 'UI Design', 'figma', 'آموزش‌ها']);
    expect(parseChannelKeywords(undefined)).toEqual([]);
    expect(parseChannelKeywords('   ')).toEqual([]);
    expect(keywordsText(['a b', 'c'])).toBe('a b, c');
  });
});

describe('video kind', () => {
  it('uses the stated duration rule', () => {
    expect(videoKind(0)).toBe('unknown');
    expect(videoKind(45)).toBe('short');
    expect(videoKind(60)).toBe('short');
    expect(videoKind(61)).toBe('maybeShort');
    expect(videoKind(180)).toBe('maybeShort');
    expect(videoKind(181)).toBe('long');
  });
});

describe('snapshots and growth', () => {
  it('merges series into one point per day, keeping the latest', () => {
    const pts = snapPoints([
      { at: '2026-10-01T08:00:00Z', data: { views: 100, subscribers: 10 } },
      { at: '2026-10-01T20:00:00Z', data: { views: 120 } },
      { at: '2026-10-02T08:00:00Z', data: { views: 150, subscribers: 12 } },
      { at: 'bad', data: { views: 1 } },
      { at: '2026-10-03T08:00:00Z', data: { title: 'no numbers' } },
    ]);
    expect(pts).toHaveLength(2);
    expect(pts[0]).toMatchObject({ views: 120, subscribers: 10 });
    expect(pts[1]).toMatchObject({ views: 150, subscribers: 12 });
  });

  it('says "tracking" with the first date instead of a zero when history is too short', () => {
    expect(growthFromSnapshots([])).toEqual({ state: 'none' });
    const one = growthFromSnapshots([{ at: '2026-10-20T10:00:00Z', views: 5 }]);
    expect(one).toEqual({ state: 'tracking', since: '2026-10-20T10:00:00Z' });
    const sameDay = growthFromSnapshots([
      { at: '2026-10-20T01:00:00Z', views: 5 },
      { at: '2026-10-20T20:00:00Z', views: 9 },
    ]);
    expect(sameDay.state).toBe('tracking');
  });

  it('measures over the real span, capped to the last 30 days', () => {
    const pts = [
      { at: '2026-08-01T10:00:00Z', views: 10, subscribers: 1 },
      { at: '2026-09-21T10:00:00Z', views: 1000, subscribers: 100 },
      { at: '2026-10-11T10:00:00Z', views: 1100, subscribers: 110 },
      { at: '2026-10-21T10:00:00Z', views: 1200, subscribers: 100 },
    ];
    const g = growthFromSnapshots(pts);
    expect(g.state).toBe('ok');
    if (g.state !== 'ok') return;
    expect(Math.round(g.spanDays)).toBe(30);
    expect(g.views).toMatchObject({ from: 1000, to: 1200, delta: 200, pct: 20 });
    expect(g.subs?.pct).toBe(0);
    expect(dailyRate(g, 'views')).toBeCloseTo(20 / 30, 5);
    const short = growthFromSnapshots(pts.slice(2));
    expect(short.state === 'ok' && Math.round(short.spanDays)).toBe(10);
  });

  it('uses Analytics for the own channel and never divides by zero', () => {
    const g = growthFromAnalytics({ views: 1100, subscribers: 50 }, { views: 100, subsNet: 0, days: 30, startDate: '2026-09-22', endDate: '2026-10-21' });
    expect(g.state === 'ok' && g.views?.pct).toBe(10);
    expect(g.state === 'ok' && g.subs?.pct).toBe(0);
    const zero = growthFromAnalytics({ views: 100 }, { views: 100, days: 30, startDate: 'a', endDate: 'b' });
    expect(zero.state === 'ok' && zero.views?.pct).toBeUndefined();
    expect(growthFromAnalytics({}, { days: 30, startDate: 'a', endDate: 'b' })).toEqual({ state: 'none' });
  });
});

describe('benchmark', () => {
  it('places channels and the niche median on a lowest → highest scale', () => {
    const bm = benchmark([
      { id: 'this', label: 'This', rate: 2, role: 'this' },
      { id: 'you', label: 'You', rate: 1, role: 'you' },
      { id: 'a', label: 'A', rate: 0, role: 'member' },
      { id: 'b', label: 'B', rate: 4, role: 'member' },
      { id: 'c', label: 'C', rate: undefined, role: 'member' },
    ])!;
    expect(bm).toMatchObject({ min: 0, max: 4, n: 4 });
    expect(bm.marks.find((m) => m.role === 'this')!.pos).toBe(0.5);
    expect(bm.marks.find((m) => m.role === 'you')!.pos).toBe(0.25);
    expect(bm.marks.find((m) => m.role === 'niche')).toMatchObject({ rate: 2, pos: 0.5 });
  });
  it('needs two channels with a rate', () => {
    expect(benchmark([{ id: 'x', label: 'x', rate: 1, role: 'this' }])).toBeUndefined();
    expect(benchmark([{ id: 'x', label: 'x', rate: 1, role: 'this' }, { id: 'x', label: 'x', rate: 1, role: 'member' }])).toBeUndefined();
  });
});

describe('uploads', () => {
  it('counts uploads in the last 30 days and knows when the list may be cut short', () => {
    const vids = [vid('a', 1, 1), vid('b', 10, 1), vid('c', 29, 1)];
    expect(uploadsSince(vids, 30, NOW, 100)).toEqual({ count: 3, complete: false });
    expect(uploadsSince(vids, 30, NOW, 3)).toEqual({ count: 3, complete: true });
    expect(uploadsSince([...vids, vid('d', 40, 1)], 30, NOW, 100)).toEqual({ count: 3, complete: true });
    expect(uploadsCost(50)).toBe(2);
    expect(uploadsCost(200)).toBe(8);
  });
  it('orders per-upload views by publish date and skips hidden counts', () => {
    const pts = viewsByPublishDate([vid('a', 1, 5), vid('b', 3, undefined), vid('c', 5, 7)]);
    expect(pts.map((p) => p.id)).toEqual(['c', 'a']);
  });
  it('groups the feed by local day', () => {
    const now = new Date(2026, 9, 21, 15);
    const at = (d: number, h: number) => new Date(2026, 9, d, h).toISOString();
    const g = feedGroups([{ ...vid('x', 0, 1), publishedAt: at(20, 9) }, { ...vid('y', 0, 1), publishedAt: at(21, 8) }, { ...vid('z', 0, 1), publishedAt: at(20, 18) }], now);
    expect(g.map((x) => [x.daysAgo, x.videos.map((v) => v.id)])).toEqual([
      [0, ['y']],
      [1, ['z', 'x']],
    ]);
  });
});

describe('calendar', () => {
  it('builds a Gregorian month grid starting on the requested weekday', () => {
    const vids = [{ ...vid('a', 0, 1), publishedAt: new Date(2026, 6, 15, 10).toISOString() }];
    const { weeks, first, last } = monthGrid(new Date(2026, 6, 20), gregorianParts, 0, vids);
    expect(first.getDate()).toBe(1);
    expect(last.getDate()).toBe(31);
    expect(weeks[0]![0]!.date.getDay()).toBe(0);
    const cells = weeks.flat();
    expect(cells.filter((c) => c.inMonth)).toHaveLength(31);
    expect(cells.find((c) => c.inMonth && c.day === 15)!.uploads.map((v) => v.id)).toEqual(['a']);
    expect(prevMonth(first).getMonth()).toBe(5);
    expect(nextMonth(last).getMonth()).toBe(7);
    const sat = monthGrid(new Date(2026, 6, 20), gregorianParts, 6, []);
    expect(sat.weeks[0]![0]!.date.getDay()).toBe(6);
  });
  it('follows another calendar through its date parts (Persian months differ from Gregorian ones)', () => {
    const fmt = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });
    const parts = (d: Date) => {
      const p = fmt.formatToParts(d);
      const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
      return { y: get('year') || get('relatedYear'), m: get('month'), d: get('day') };
    };
    // 2026-10-21 is in Mehr 1405 (Mehr 1 = 2026-09-23).
    const b = monthBounds(new Date(2026, 9, 21), parts);
    expect([b.first.getMonth(), b.first.getDate()]).toEqual([8, 23]);
    expect(parts(b.first).d).toBe(1);
    expect(parts(b.last).d).toBe(30);
  });
});

describe('performance distribution', () => {
  it('judges each video against its own group median and lists hits and flops', () => {
    const longs = [100, 100, 100, 100, 100, 100, 100, 100, 1000, 10].map((v, i) => vid(`l${i}`, 10 + i, v));
    const shorts = [5000, 5000, 5000, 5000, 5000].map((v, i) => vid(`s${i}`, 10 + i, v, 40));
    const perf = performance([...longs, ...shorts, vid('new', 2, 9999), vid('hid', 20, undefined)], NOW);
    expect(perf.baseline).toEqual({ long: 100, short: 5000 });
    expect(perf.tooNew.map((v) => v.id)).toEqual(['new']);
    expect(perf.hidden.map((v) => v.id)).toEqual(['hid']);
    expect(perf.hits[0]!.video.id).toBe('l8');
    expect(perf.hits[0]!.ratio).toBe(10);
    expect(perf.hits[0]!.band).toBe('veryRare');
    expect(perf.flops.map((f) => f.video.id)).toEqual(['l9']);
    expect(perf.items.filter((i) => i.group === 'short').every((i) => i.band === 'typical')).toBe(true);
    expect(perf.counts.typical + perf.counts.uncommon + perf.counts.rare + perf.counts.veryRare).toBe(15);
  });
  it('leaves out groups that are too small', () => {
    const perf = performance([vid('a', 10, 1), vid('b', 10, 2)], NOW);
    expect(perf.items).toHaveLength(0);
    expect(perf.thin).toEqual(['long']);
  });
  it('bands and percentiles', () => {
    expect([bandOf(10), bandOf(75), bandOf(85), bandOf(95), bandOf(100)]).toEqual(['typical', 'uncommon', 'rare', 'veryRare', 'veryRare']);
    expect(percentileOf([1, 2, 3, 4], 4)).toBe(87.5);
    expect(median([3, undefined, 1, 2])).toBe(2);
    expect(median([])).toBeUndefined();
  });
});

describe('topical analysis', () => {
  it('tokenizes Persian with letter variants, ZWNJ suffixes and stop words', () => {
    expect(tokenize('آموزش فيگما برای طراحي‌ها و UI')).toEqual(['آموزش', 'فیگما', 'طراحی', 'ui']);
    expect(tokenize('کتاب‌های ۲۰۲۶ the best')).toEqual(['کتاب', 'best']);
    const terms = videoTerms({ title: 'آموزش فیگما مقدماتی', tags: ['UI Design', 'figma'] });
    expect([...terms]).toEqual(expect.arrayContaining(['فیگما', 'آموزش فیگما', 'ui design', 'figma']));
  });

  it('builds a topics × channels matrix with shares and "no content"', () => {
    const a = {
      channelId: 'A',
      title: 'A',
      videos: [
        vid('a1', 10, 100, 600, { title: 'آموزش فیگما قسمت ۱', tags: [], likes: 10, comments: 0 }),
        vid('a2', 11, 300, 600, { title: 'آموزش فیگما قسمت ۲', tags: [], likes: 30, comments: 0 }),
        vid('a3', 12, 50, 600, { title: 'Photoshop basics', tags: [], likes: 1, comments: 0 }),
        vid('a4', 13, 70, 600, { title: 'Illustrator intro', tags: [], likes: 1, comments: 0 }),
      ],
    };
    const b = {
      channelId: 'B',
      title: 'B',
      videos: [
        vid('b1', 10, 1000, 600, { title: 'فیگما برای مبتدی', tags: [] }),
        vid('b2', 11, 10, 600, { title: 'Photoshop masking', tags: [] }),
        vid('b3', 12, 20, 600, { title: 'Blender donut', tags: [] }),
      ],
    };
    const m = topicMatrix([a, b], 5);
    const figma = m.topics.find((t) => t.key === 'فیگما')!;
    expect(figma).toBeTruthy();
    expect(topicShare(m, figma, 'A')).toBe(0.5);
    expect(topicShare(m, figma, 'B')).toBeCloseTo(1 / 3);
    const ps = m.topics.find((t) => t.key === 'photoshop')!;
    expect(ps.total).toBe(2);
    // "آموزش فیگما" covers the same videos as part of "فیگما", so it is not a separate topic.
    expect(m.topics.some((t) => t.key === 'آموزش فیگما' || t.key === 'آموزش')).toBe(false);
    expect(topicShare(m, figma, 'C')).toBeUndefined();
    const vs = topicVideos([a, b], figma, 'views');
    expect(vs.map((x) => x.video.id)).toEqual(['b1', 'a2', 'a1']);
    expect(topicVideos([a, b], figma, 'outlier')[0]!.video.id).toBe('b1');
    expect(topicStats([a, b], figma).views).toBe(1400);
    const renamed = relabelTopics(m, { فیگما: 'Figma tutorials', nope: 'x', photoshop: '' });
    expect(renamed.topics.find((t) => t.key === 'فیگما')!.label).toBe('Figma tutorials');
    expect(renamed.topics.find((t) => t.key === 'photoshop')!.label).toBe('photoshop');
    expect(relabelTopics(m, null)).toBe(m);
  });
});

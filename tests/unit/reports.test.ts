import { describe, expect, it } from 'vitest';
import { change, firstValue, healthScore, periods, rowsOf, uploadConsistency, type HealthInputs } from '../../src/domain/reports';
import { auditAll, auditVideo, duplicateTitles, failureCounts, passesAudit, type AuditInput } from '../../src/domain/reportsAudit';
import { biggestDrops, meanRelative, mmss, relativeLabel, retentionPoints, watchAt, watchUrl } from '../../src/domain/reportsRetention';
import { bestTime, firstWeekComplete, firstWeekRange, mapLimit, slotOf, sumViews, viewsByWeekday } from '../../src/domain/reportsBestTime';
import { classifyClicks, clickRows, fallbackRanking, toShare } from '../../src/domain/reportsClick';
import { competitorTopics, covered, rankOpportunities, refreshPackaging, searchGaps, updateOld } from '../../src/domain/reportsOpportunities';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-20T12:00:00Z');

describe('report helpers', () => {
  it('reads first values and rows, null when missing', () => {
    const r = { columns: ['views', 'likes'], rows: [[120, 'x']] };
    expect(firstValue(r, 'views')).toBe(120);
    expect(firstValue(r, 'likes')).toBeNull();
    expect(firstValue(r, 'shares')).toBeNull();
    expect(firstValue({ columns: ['views'], rows: [] }, 'views')).toBeNull();
    expect(rowsOf(r)).toEqual([{ views: 120, likes: 'x' }]);
  });

  it('builds equal, adjacent periods', () => {
    const p = periods(7, NOW);
    expect(p.cur).toEqual({ startDate: '2026-10-14', endDate: '2026-10-20' });
    expect(p.prev).toEqual({ startDate: '2026-10-07', endDate: '2026-10-13' });
  });

  it('computes change, unknown when the previous value is missing or zero', () => {
    expect(change(150, 100)).toBeCloseTo(0.5);
    expect(change(50, 100)).toBeCloseTo(-0.5);
    expect(change(5, 0)).toBeNull();
    expect(change(null, 3)).toBeNull();
  });
});

describe('health score', () => {
  const base: HealthInputs = {
    now: NOW,
    uploads: [],
    views28: null,
    viewsPrev28: null,
    likes28: null,
    comments28: null,
    shares28: null,
    minutes28: null,
    avgViewPercent: null,
    subsGained28: null,
    subsLost28: null,
    auditPassShare: null,
    ctr: null,
  };

  it('measures upload consistency over 13 weeks', () => {
    const weekly = Array.from({ length: 13 }, (_, i) => new Date(NOW - (i * 7 + 1) * DAY).toISOString());
    expect(uploadConsistency(weekly, NOW)).toMatchObject({ uploads90: 13, activeWeeks: 13 });
    const c = uploadConsistency([new Date(NOW - 2 * DAY).toISOString(), new Date(NOW - 200 * DAY).toISOString()], NOW);
    expect(c.uploads90).toBe(1);
    expect(c.activeWeeks).toBe(1);
    expect(c.longestGapDays).toBe(89);
    expect(uploadConsistency([], NOW).longestGapDays).toBeNull();
  });

  it('scores each part with its formula and keeps missing parts null', () => {
    const h = healthScore({
      ...base,
      uploads: Array.from({ length: 13 }, (_, i) => new Date(NOW - (i * 7 + 1) * DAY).toISOString()),
      views28: 1200,
      viewsPrev28: 1000,
      likes28: 30,
      comments28: 6,
      shares28: 0,
      minutes28: 3600,
      avgViewPercent: 40,
      subsGained28: 12,
      subsLost28: 3,
      auditPassShare: 0.5,
    });
    const s = Object.fromEntries(h.parts.map((p) => [p.id, p.score]));
    expect(s).toEqual({ consistency: 100, trend: 70, engagement: 60, watch: 80, subscribers: 100, metadata: 50, ctr: null });
    expect(h.parts.find((p) => p.id === 'watch')!.inputs.minutesPerView).toBe(3);
    // Weighted mean without CTR: (100*20 + 70*20 + 60*15 + 80*15 + 100*10 + 50*10) / 90
    expect(h.total).toBe(Math.round((2000 + 1400 + 900 + 1200 + 1000 + 500) / 90));
    expect(h.available).toBe(6);
  });

  it('clamps scores and needs three parts for a total', () => {
    const h = healthScore({ ...base, views28: 5000, viewsPrev28: 1000, ctr: 0.2 });
    expect(h.parts.find((p) => p.id === 'trend')!.score).toBe(100);
    expect(h.parts.find((p) => p.id === 'ctr')!.score).toBe(100);
    // consistency is always computable (0 uploads → 0), so three parts → total
    expect(h.total).not.toBeNull();
    expect(healthScore({ ...base }).total).toBeNull();
  });
});

describe('best practice audit', () => {
  const good: AuditInput = {
    id: 'a',
    title: 'آموزش فیگما برای مبتدی‌ها: طراحی اولین اپ',
    description: 'در این ویدیو با فیگما یک صفحهٔ کامل اپ را از صفر طراحی می‌کنیم و نکته‌های مهم را می‌گوییم.\nلینک فایل‌ها پایین است.\n\n' + 'متن بیشتر '.repeat(20) + '\nhttps://example.com\n#فیگما #طراحی',
    tags: ['فیگما', 'آموزش فیگما', 'طراحی رابط کاربری', 'figma', 'ui design'],
    durationSec: 300,
    caption: true,
    defaultLanguage: 'fa',
    defaultAudioLanguage: 'fa',
  };

  it('passes a well-prepared video', () => {
    const r = auditVideo(good);
    expect(r.failing).toEqual([]);
    expect(r.score).toBe(100);
    expect(passesAudit(r)).toBe(true);
  });

  it('flags common problems with reasons', () => {
    const r = auditVideo({ ...good, title: 'ویدیو', description: '', tags: [], caption: false, defaultLanguage: undefined, durationSec: 900 });
    const ids = r.failing.map((c) => `${c.id}:${c.reason ?? ''}`);
    expect(ids).toEqual(expect.arrayContaining(['title-length:short', 'desc-length:empty', 'tags-count:none', 'captions:none', 'language:title', 'links:none', 'chapters:none', 'hashtags:none']));
    expect(r.score).toBeLessThan(50);
    expect(passesAudit(r)).toBe(false);
  });

  it('checks the keyword is front-loaded when a keyword is known', () => {
    expect(auditVideo({ ...good, keyword: 'فيگما' }).checks.find((c) => c.id === 'title-keyword')!.pass).toBe(true);
    const late = auditVideo({ ...good, title: 'یک آموزش کامل و ساده برای همهٔ طراحان تازه‌کار با فیگما', keyword: 'فیگما' });
    expect(late.failing.find((c) => c.id === 'title-keyword')!.reason).toBe('late');
    expect(auditVideo(good).checks.some((c) => c.id === 'title-keyword')).toBe(false);
  });

  it('validates chapters and duplicate titles', () => {
    const bad = auditVideo({ ...good, description: good.description + '\n0:05 شروع\n1:00 بخش دو' });
    expect(bad.failing.find((c) => c.id === 'chapters')).toMatchObject({ reason: 'not-at-zero', severity: 'error' });
    const dup = duplicateTitles([
      { id: '1', title: 'Figma Tutorial!' },
      { id: '2', title: 'figma tutorial' },
      { id: '3', title: 'Other' },
    ]);
    expect([...dup].sort()).toEqual(['1', '2']);
    const all = auditAll([good, { ...good, id: 'b' }]);
    expect(all.every((r) => r.failing.some((c) => c.id === 'duplicate-title'))).toBe(true);
    expect(failureCounts(all)[0]).toEqual({ id: 'duplicate-title', count: 2 });
  });

  it('treats unknown captions as not applicable', () => {
    expect(auditVideo({ ...good, caption: null }).checks.some((c) => c.id === 'captions')).toBe(false);
  });
});

describe('retention', () => {
  // 100 points: slow decline of 0.002 per point, with extra falls at 1 % (opening), 20 %, 21 %, 50 % and 80 %.
  const extra: Record<number, number> = { 2: 0.3, 20: 0.1, 21: 0.08, 50: 0.06, 80: 0.12 };
  let w = 1.05;
  const rep = {
    columns: ['elapsedVideoTimeRatio', 'audienceWatchRatio', 'relativeRetentionPerformance'],
    rows: Array.from({ length: 100 }, (_, i) => {
      w -= 0.002 + (extra[i + 1] ?? 0);
      return [(i + 1) / 100, Math.round(w * 1000) / 1000, i < 50 ? 0.5 : 0.7];
    }),
  };
  it('parses points and finds the biggest drops after the opening', () => {
    const pts = retentionPoints(rep);
    expect(pts).toHaveLength(100);
    const drops = biggestDrops(pts, 600);
    // The opening fall (at 1 %) is skipped; 21 % is too close to 20 % to be listed separately.
    expect(drops.map((d) => d.ratio)).toEqual([0.19, 0.49, 0.79]);
    expect(drops[0]!.seconds).toBe(114);
    expect(drops[2]!.drop).toBeCloseTo(0.122);
    expect(meanRelative(pts)).toBeCloseTo(0.6);
    expect(relativeLabel(0.6)).toBe('above');
    expect(relativeLabel(0.5)).toBe('typical');
    expect(relativeLabel(null)).toBeNull();
    expect(watchAt(pts, 0.005)).toBe(pts[0]!.watch);
    expect(watchAt(pts, 0.015)).toBeCloseTo((pts[0]!.watch + pts[1]!.watch) / 2);
  });
  it('returns nothing for empty reports and formats links', () => {
    expect(retentionPoints({ columns: ['elapsedVideoTimeRatio', 'audienceWatchRatio'], rows: [] })).toEqual([]);
    expect(retentionPoints(null)).toEqual([]);
    expect(watchUrl('abc', 61.4)).toBe('https://www.youtube.com/watch?v=abc&t=61s');
    expect(mmss(3725)).toBe('1:02:05');
    expect(mmss(65)).toBe('1:05');
  });
});

describe('best time to publish', () => {
  it('maps instants to weekday and hour in a time zone', () => {
    // 2026-10-20 is a Tuesday. 22:00 UTC is 01:30 Wednesday in Tehran (UTC+3:30).
    expect(slotOf('2026-10-20T22:00:00Z', 'UTC')).toEqual({ weekday: 2, hour: 22 });
    expect(slotOf('2026-10-20T22:00:00Z', 'Asia/Tehran')).toEqual({ weekday: 3, hour: 1 });
    expect(slotOf('nope', 'UTC')).toBeNull();
  });

  it('sums first-week views and knows when the week is complete', () => {
    expect(sumViews({ columns: ['day', 'views'], rows: [['2026-10-01', 10], ['2026-10-02', 5]] })).toBe(15);
    expect(sumViews({ columns: ['day', 'views'], rows: [] })).toBeNull();
    expect(firstWeekRange('2026-10-01T18:00:00Z')).toEqual({ startDate: '2026-10-01', endDate: '2026-10-07' });
    expect(firstWeekComplete('2026-10-01T00:00:00Z', NOW)).toBe(true);
    expect(firstWeekComplete('2026-10-15T00:00:00Z', NOW)).toBe(false);
  });

  it('ranks bins by median and prefers bins with several uploads', () => {
    const s = (id: string, iso: string, views7: number) => ({ videoId: id, publishedAt: iso, views7 });
    const r = bestTime(
      [
        s('a', '2026-09-01T16:00:00Z', 100), // Tue 16 UTC
        s('b', '2026-09-08T17:00:00Z', 300), // Tue 17 → same 3h bin (15–18)
        s('c', '2026-09-03T10:00:00Z', 1000), // Thu 10, single sample
        s('d', '2026-09-05T10:00:00Z', 50), // Sat 10
        s('e', '2026-09-12T11:00:00Z', 70), // Sat 11 → same bin (9–12)
      ],
      'UTC',
    );
    expect(r.top.map((c) => `${c.weekday}-${c.hour}`)).toEqual(['2-15', '6-9']);
    expect(r.top[0]).toMatchObject({ n: 2, median: 200 });
    expect(r.overall).toBe(100);
    expect(r.byWeekday[4]).toEqual({ weekday: 4, n: 1, median: 1000 });
    expect(r.byWeekday[0]!.median).toBeNull();
    // Only single samples → they are used.
    expect(bestTime([s('x', '2026-09-03T10:00:00Z', 5)], 'UTC').top).toHaveLength(1);
  });

  it('averages channel views by weekday', () => {
    const w = viewsByWeekday({ columns: ['day', 'views'], rows: [['2026-10-19', 10], ['2026-10-26', 30], ['2026-10-20', 7]] });
    expect(w[1]).toEqual({ weekday: 1, days: 2, mean: 20 });
    expect(w[2]!.mean).toBe(7);
    expect(w[0]!.mean).toBeNull();
  });

  it('maps with limited concurrency in order', async () => {
    let active = 0;
    let peak = 0;
    const seen: number[] = [];
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (x) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return x * 2;
    }, (d) => seen.push(d));
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('click magnet', () => {
  it('reads rates given as percentages or shares', () => {
    expect(toShare([5, 0.5])).toEqual([0.05, 0.005]);
    expect(toShare([0.05, 0.02])).toEqual([0.05, 0.02]);
    const rows = clickRows({ columns: ['video', 'videoThumbnailImpressions', 'videoThumbnailImpressionsClickRate'], rows: [['v1', 1000, 4.5]] });
    expect(rows).toEqual([{ videoId: 'v1', impressions: 1000, ctr: 0.045 }]);
  });

  it('flags high-impression low-CTR and high-CTR low-impression videos', () => {
    const rows = [
      { videoId: 'a', impressions: 10000, ctr: 0.02 },
      { videoId: 'b', impressions: 2000, ctr: 0.05 },
      { videoId: 'c', impressions: 1000, ctr: 0.1 },
      { videoId: 'd', impressions: 3000, ctr: 0.05 },
      { videoId: 'e', impressions: 50, ctr: 0.5 },
    ];
    const r = classifyClicks(rows);
    expect(r.medianImpressions).toBe(2500);
    expect(r.medianCtr).toBe(0.05);
    const f = Object.fromEntries(r.rows.map((x) => [x.videoId, x.flag]));
    expect(f).toEqual({ a: 'low-ctr', b: null, c: 'hidden-gem', d: null, e: null });
    expect(r.rows[0]!.missedClicks).toBe(300);
  });

  it('falls back to retention vs views without CTR', () => {
    const r = fallbackRanking({
      columns: ['video', 'views', 'averageViewDuration', 'averageViewPercentage'],
      rows: [
        ['a', 1000, 100, 30],
        ['b', 100, 200, 60],
        ['c', 500, 120, 40],
      ],
    });
    expect(r.medianViews).toBe(500);
    expect(r.rows.find((x) => x.videoId === 'b')!.flag).toBe('strong-retention-low-views');
    expect(r.rows.find((x) => x.videoId === 'a')!.flag).toBeNull();
  });
});

describe('opportunities', () => {
  const own = [
    { id: 'v1', title: 'آموزش فیگما برای مبتدی‌ها', tags: ['figma'], publishedAt: new Date(NOW - 400 * DAY).toISOString() },
    { id: 'v2', title: 'Photoshop basics', tags: [], publishedAt: new Date(NOW - 10 * DAY).toISOString() },
    { id: 'v3', title: 'رنگ در طراحی', tags: [], publishedAt: new Date(NOW - 300 * DAY).toISOString() },
    { id: 'v4', title: 'Lightroom', tags: [], publishedAt: new Date(NOW - 30 * DAY).toISOString() },
  ];

  it('finds search terms without a dedicated video', () => {
    expect(covered('فيگما آموزش', own.map((v) => v.title))).toBe(true);
    const g = searchGaps(
      [
        { term: 'آموزش فیگما', views: 200 },
        { term: 'figma auto layout', views: 100 },
        { term: 'ab', views: 50 },
      ],
      own,
    );
    expect(g.map((x) => x.term)).toEqual(['figma auto layout']);
    expect(g[0]!.score).toBe(75);
  });

  it('suggests refreshing packaging of well-retained low-view videos', () => {
    const r = refreshPackaging(
      [
        { videoId: 'v1', views: 1000, avgViewPercent: 30 },
        { videoId: 'v2', views: 100, avgViewPercent: 60 },
        { videoId: 'v3', views: 700, avgViewPercent: 30 },
      ],
      own,
    );
    expect(r.map((x) => x.videoId)).toEqual(['v2']);
    expect(r[0]!.score).toBe(100);
    expect(refreshPackaging([{ videoId: 'v1', views: 1, avgViewPercent: 1 }], own)).toEqual([]);
  });

  it('lists old videos still gaining views', () => {
    const r = updateOld([{ videoId: 'v1', views: 500 }, { videoId: 'v3', views: 100 }, { videoId: 'v2', views: 900 }], own, NOW);
    expect(r.map((x) => x.videoId)).toEqual(['v1', 'v3']);
    expect(r.map((x) => x.score)).toEqual([100, 44]);
  });

  it('finds competitor topics you do not cover and ranks everything', () => {
    const comp = [
      { title: 'Midjourney prompts for designers', channelTitle: 'A' },
      { title: 'Midjourney v7 review', channelTitle: 'B' },
      { title: 'Figma tips', channelTitle: 'A' },
      { title: 'Figma variables', channelTitle: 'B' },
    ];
    const t = competitorTopics(comp, own);
    expect(t.map((x) => x.term)).toEqual(['Midjourney']);
    expect(t[0]!.evidence).toMatchObject({ videos: 2, channels: 2 });
    expect(t[0]!.score).toBe(60);
    const ranked = rankOpportunities([t, searchGaps([{ term: 'blender', views: 10 }], own)]);
    expect(ranked[0]!.kind).toBe('search-gap');
  });
});

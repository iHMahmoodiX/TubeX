import { describe, expect, it } from 'vitest';
import { activeQueue, buildQueue, compareSnaps, effectiveStatus, queueId, type QueueVideo } from '../../src/domain/optimizeQueue';
import { checkRecord } from '../../src/domain/records';
import type { OptimizeItem } from '../../src/domain/models';

const NOW = Date.parse('2026-11-18T00:00:00Z');
const CH = 'UC' + 'a'.repeat(22);
const good = 'A clear tutorial title about Figma auto layout';
const desc = 'Learn Figma auto layout step by step in this tutorial.\nMore lines here.\n'.repeat(5);
const vid = (n: number, over: Partial<QueueVideo> = {}): QueueVideo => ({
  id: `vid${String(n).padStart(8, '0')}`,
  title: good,
  description: desc,
  tags: ['figma', 'auto layout', 'figma tutorial', 'ui design', 'design'],
  durationSec: 600,
  caption: true,
  publishedAt: '2026-10-01T00:00:00Z',
  privacy: 'public',
  ...over,
});

describe('Improve queue', () => {
  const videos = [1, 2, 3, 4, 5, 6].map((n) => vid(n));
  const perf28 = videos.map((v, i) => ({ videoId: v.id, views: [1000, 900, 800, 700, 600, 500][i]!, avgViewPercent: [40, 40, 40, 40, 40, 40][i]! }));
  const reach = videos.map((v, i) => ({ videoId: v.id, impressions: [20000, 15000, 10000, 9000, 8000, 7000][i]!, ctr: [0.02, 0.06, 0.06, 0.05, 0.05, 0.05][i]! }));

  it('flags low CTR only with enough impressions, with the numbers behind it', () => {
    const q = buildQueue({ videos, perf28, reach, measuredAt: '2026-11-18T00:00:00Z', now: NOW });
    expect(q.entries[0]!.videoId).toBe(videos[0]!.id);
    expect(q.entries[0]!.signals[0]).toMatchObject({ kind: 'low-ctr', evidence: { impressions: 20000, ctr: 2, medianCtr: 5 } });
    expect(q.entries[0]!.snap).toMatchObject({ views: 1000, impressions: 20000, ctr: 2, avgViewPercent: 40, periodDays: 28 });
  });

  it('treats a low-data channel, zero impressions and missing CTR as unknown, never as a signal', () => {
    const q1 = buildQueue({ videos, perf28, reach: null, measuredAt: 'x', now: NOW });
    expect(q1.thinCtr).toBe(true);
    expect(q1.entries.every((e) => e.signals.every((s) => s.kind !== 'low-ctr'))).toBe(true);
    const zero = reach.map((r) => ({ ...r, impressions: 0 }));
    expect(buildQueue({ videos, perf28, reach: zero, measuredAt: 'x', now: NOW }).thinCtr).toBe(true);
    const tiny = buildQueue({ videos: videos.slice(0, 2), perf28: perf28.slice(0, 2), reach: reach.slice(0, 2), measuredAt: 'x', now: NOW });
    expect(tiny.entries).toEqual([]);
    expect(tiny.medians).toEqual({ ctr: null, avgViewPercent: null, views: null });
    const noPerf = buildQueue({ videos, perf28: null, reach: null, measuredAt: 'x', now: NOW });
    expect(noPerf.entries).toEqual([]);
  });

  it('finds strong retention with low reach, evergreen traffic and weak packaging; more signals rank first', () => {
    const vs = [vid(1), vid(2), vid(3), vid(4, { publishedAt: '2024-01-01T00:00:00Z' }), vid(5, { title: 'x', description: '' }), vid(6)];
    const p = [
      { videoId: vs[0]!.id, views: 300, avgViewPercent: 70 },
      { videoId: vs[1]!.id, views: 900, avgViewPercent: 40 },
      { videoId: vs[2]!.id, views: 800, avgViewPercent: 40 },
      { videoId: vs[3]!.id, views: 2000, avgViewPercent: 40 },
      { videoId: vs[4]!.id, views: 500, avgViewPercent: 40 },
      { videoId: vs[5]!.id, views: 50, avgViewPercent: 40 },
    ];
    const q = buildQueue({ videos: vs, perf28: p, reach: null, measuredAt: 'x', now: NOW });
    const kinds = Object.fromEntries(q.entries.map((e) => [e.videoId, e.signals.map((s) => s.kind)]));
    expect(kinds[vs[0]!.id]).toEqual(['strong-retention-low-reach']);
    expect(kinds[vs[3]!.id]).toEqual(['evergreen-traffic']);
    expect(kinds[vs[4]!.id]).toEqual(['weak-packaging']);
    expect(kinds[vs[5]!.id]).toBeUndefined(); // too few views to judge
  });

  it('skips private videos and keeps snoozed/done items out of the active list until the snooze ends', () => {
    const q = buildQueue({ videos: [...videos.slice(1), vid(1, { privacy: 'private' })], perf28, reach, measuredAt: 'x', now: NOW });
    expect(q.entries.find((e) => e.videoId === videos[0]!.id)).toBeUndefined();
    const all = buildQueue({ videos, perf28, reach, measuredAt: 'x', now: NOW }).entries;
    const id = queueId(CH, all[0]!.videoId);
    const items = new Map<string, OptimizeItem>([[id, { id, channelId: CH, videoId: all[0]!.videoId, title: '', status: 'snoozed', snoozeUntil: '2026-11-20T00:00:00Z', log: [], createdAt: '', updatedAt: '', rev: 0 }]]);
    expect(activeQueue(all, items, CH, NOW).map((e) => e.videoId)).not.toContain(all[0]!.videoId);
    expect(activeQueue(all, items, CH, Date.parse('2026-11-21T00:00:00Z')).map((e) => e.videoId)).toContain(all[0]!.videoId);
    expect(activeQueue(all, items, 'UC' + 'b'.repeat(22), NOW).map((e) => e.videoId)).toContain(all[0]!.videoId); // other channel's state never applies
    expect(effectiveStatus(undefined)).toBe('open');
  });

  it('compares before/after only on metrics both sides have, after at least a week', () => {
    const b = { at: '2026-11-01T00:00:00Z', periodDays: 28, views: 100, ctr: 2 };
    expect(compareSnaps(b, { at: '2026-11-03T00:00:00Z', periodDays: 28, views: 120 }).ready).toBe(false);
    const c = compareSnaps(b, { at: '2026-11-10T00:00:00Z', periodDays: 28, views: 150, impressions: 9 });
    expect(c).toEqual({ ready: true, changes: [{ metric: 'views', before: 100, after: 150, delta: 50 }] });
  });

  it('stored queue items are bound to one channel and one video', () => {
    const vidId = 'abcdefghijk';
    const ok = checkRecord('optimize', { id: `${CH}:${vidId}`, channelId: CH, videoId: vidId, status: 'doing', log: [{ at: '2026-11-01T00:00:00Z', action: 'title', before: 'a', after: 'b' }, { action: 'hack' }] });
    expect(ok.ok && ok.record.log.length).toBe(1);
    expect(checkRecord('optimize', { id: 'other', channelId: CH, videoId: vidId }).ok).toBe(false);
    expect(checkRecord('optimize', { id: `x:${vidId}`, channelId: 'x', videoId: vidId }).ok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { findOutliers, flagFor, MIN_BASELINE } from '../../src/domain/outliers';

const NOW = Date.parse('2026-11-18T00:00:00Z');
const v = (id: string, ageDays: number, views?: number, channelId = 'UCa') => ({ id, title: id, channelId, channelTitle: 'A', publishedAt: new Date(NOW - ageDays * 86_400_000).toISOString(), views });

describe('outliers', () => {
  it('flags qualitatively, never below the threshold', () => {
    expect(flagFor(100, 0)).toBeUndefined();
    expect(flagFor(150, 100)).toBeUndefined();
    expect(flagFor(200, 100)).toBe('above');
    expect(flagFor(400, 100)).toBe('well-above');
  });

  it('skips groups that are too small to compare', () => {
    const vids = Array.from({ length: MIN_BASELINE - 2 }, (_, i) => v(`x${i}`, 10, 1000));
    vids.push(v('big', 5, 1_000_000), v('hidden', 5, undefined));
    expect(findOutliers([{ videos: vids, kind: 'channel' }], 30, NOW)).toEqual([]);
  });

  it('finds recent strong videos against the group median with its sample size', () => {
    const vids = [v('a', 20, 2000), v('b', 20, 2000), v('c', 20, 2000), v('d', 20, 2000), v('e', 20, 2000), v('hot', 5, 5000), v('warm', 10, 2200), v('old', 200, 900000), v('new', 1, 100000)];
    const r = findOutliers([{ videos: vids, kind: 'channel' }], 30, NOW);
    expect(r.map((x) => [x.video.id, x.flag])).toEqual([
      ['hot', 'well-above'],
      ['warm', 'above'],
    ]);
    expect(r[0]!.sampleSize).toBe(9);
    expect(r[0]!.baseline).toBe(100);
    expect(r[0]!.baselineKind).toBe('channel');
  });

  it('keeps one entry per video across groups', () => {
    const base = [v('a', 20, 2000), v('b', 20, 2000), v('c', 20, 2000), v('d', 20, 2000), v('hot', 5, 5000)];
    expect(findOutliers([{ videos: base, kind: 'channel' }, { videos: base, kind: 'sample' }], 30, NOW)).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { checkResults, experimentIssues, placeAmong, testKind, variantIssues } from '../../src/domain/experiments';
import { checkRecord } from '../../src/domain/records';
import type { Variant } from '../../src/domain/models';

const v = (id: string, title: string, thumb?: string): Variant => ({ id, title, thumbNote: '', rationale: '', ...(thumb && { thumb }) });
const IMG = 'data:image/jpeg;base64,AAAA';

describe('A/B assistant', () => {
  it('needs two variants that differ in title or thumbnail', () => {
    expect(experimentIssues({ variants: [v('a', 'Old')] })).toEqual(['need-two']);
    expect(experimentIssues({ variants: [v('a', 'Old'), v('b', 'Old')] })).toEqual(['nothing-differs']);
    expect(experimentIssues({ variants: [v('a', 'Old'), v('b', 'New')] })).toEqual([]);
    expect(testKind({ variants: [v('a', 'Old', IMG), v('b', 'Old', IMG + 'B')] })).toEqual({ thumbnails: true, titles: false });
  });
  it('flags empty, long, duplicate and unchanged variants', () => {
    const all = [v('a', 'Same'), v('b', 'Same'), v('c', 'x'.repeat(101))];
    expect(variantIssues(all[1]!, all, { title: 'Same' })).toEqual(['duplicate-title', 'same-as-current']);
    expect(variantIssues(all[2]!, all, { title: 'Same' })).toEqual(['title-long']);
    expect(variantIssues(v('d', ''), all, { title: 'Same' })).toEqual(['empty']);
  });
  it('checks entered results: shares add to ~100, leader only without a tie', () => {
    const variants = [v('a', '1'), v('b', '2'), v('c', '3')];
    expect(checkResults({ variants, results: [] })).toEqual({ total: null, sumOk: false, leader: null });
    expect(checkResults({ variants, results: [{ variantId: 'a', share: 40.2, note: '' }, { variantId: 'b', share: 35, note: '' }, { variantId: 'c', share: 24.8, note: '' }] })).toEqual({ total: 100, sumOk: true, leader: 'a' });
    expect(checkResults({ variants, results: [{ variantId: 'a', share: 50, note: '' }, { variantId: 'b', share: 50, note: '' }] }).leader).toBeNull();
    expect(checkResults({ variants, results: [{ variantId: 'a', share: 70, note: '' }] }).sumOk).toBe(false);
  });
  it('places own candidates among competitor cards deterministically', () => {
    const a = placeAmong(['ME'], ['x', 'y', 'z'], 'seed');
    expect(a).toHaveLength(4);
    expect(placeAmong(['ME'], ['x', 'y', 'z'], 'seed')).toEqual(a);
  });
  it('stored experiments keep at most 3 safe variants and results for known variants', () => {
    const r = checkRecord('experiments', {
      id: 'e1',
      channelId: 'UC' + 'a'.repeat(22),
      videoId: 'abcdefghijk',
      variants: [v('a', 'A', IMG), { ...v('b', 'B'), thumb: 'javascript:alert(1)' }, v('c', 'C'), v('d', 'D')],
      results: [{ variantId: 'a', share: 60, note: '' }, { variantId: 'zz', share: 40 }],
      winnerId: 'zz',
      status: 'running',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record.variants.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(r.record.variants[1]!.thumb).toBeUndefined();
    expect(r.record.results).toEqual([{ variantId: 'a', share: 60, note: '' }]);
    expect(r.record.winnerId).toBeUndefined();
  });
});

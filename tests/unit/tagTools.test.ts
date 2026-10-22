import { describe, expect, it } from 'vitest';
import {
  batches,
  mainPhrase,
  mergeRanks,
  mergeSuggestions,
  neighbours,
  parsePasted,
  rankLabel,
  ranksFor,
  sortSuggestions,
  sortTagList,
  studioEditUrl,
  trafficFor,
} from '../../src/inpage/studio/tags/logic';
import { tagToolsMethods } from '../../src/background/methods/tagTools';

describe('mainPhrase (default target keyword)', () => {
  it('takes the first segment before a separator and drops episode markers', () => {
    expect(mainPhrase('دوره جامع Adobe XD | چیدمان و تراز کردن اشیا (قسمت ۶)')).toBe('دوره جامع Adobe XD');
    expect(mainPhrase('Figma auto layout tutorial - part 3')).toBe('Figma auto layout tutorial');
    expect(mainPhrase('آموزش فیگما قسمت ۲')).toBe('آموزش فیگما');
  });
  it('ignores hashtags, emoji and empty leading segments', () => {
    expect(mainPhrase('🔥 #shorts | Learn UI/UX design fast')).toBe('Learn UI/UX design fast');
    expect(mainPhrase('')).toBe('');
    expect(mainPhrase('#a #b')).toBe('');
  });
  it('keeps at most six words', () => {
    expect(mainPhrase('one two three four five six seven eight')).toBe('one two three four five six');
  });
});

describe('sortTagList', () => {
  const tags = ['figma', 'auto layout in figma', 'ui', 'Banana'];
  it('relevance puts tags with the keyword first', () => {
    expect(sortTagList(tags, 'relevance', { keyword: 'figma' }).slice(0, 2)).toEqual(['figma', 'auto layout in figma']);
  });
  it('alphabetical ignores case', () => {
    expect(sortTagList(tags, 'alpha', { lang: 'en' })).toEqual(['auto layout in figma', 'Banana', 'figma', 'ui']);
  });
  it('score sorts known scores first and keeps the rest in order', () => {
    const scores = { ui: { score: 80, at: '2026-10-21T00:00:00Z' }, figma: { score: 40, at: '2026-10-21T00:00:00Z' } };
    expect(sortTagList(tags, 'score', { scores })).toEqual(['ui', 'figma', 'auto layout in figma', 'Banana']);
  });
});

describe('parsePasted', () => {
  it('splits on commas, Persian commas and lines, removes # and duplicates', () => {
    expect(parsePasted('#figma, Figma،  ui design\nآموزش  فیگما,,')).toEqual(['figma', 'ui design', 'آموزش فیگما']);
  });
});

describe('own search traffic', () => {
  const terms = [
    { term: 'figma tutorial', views: 120 },
    { term: 'figma', views: 50 },
    { term: 'figmaa', views: 7 },
  ];
  it('sums searches containing the tag as a phrase', () => {
    expect(trafficFor('figma', terms)).toBe(170);
    expect(trafficFor('figma tutorial', terms)).toBe(120);
  });
  it('returns undefined (not 0) when no term matches', () => {
    expect(trafficFor('sketch', terms)).toBeUndefined();
  });
});

describe('recommended tags', () => {
  const list = mergeSuggestions(
    {
      top: [
        { tag: 'figma tutorial', count: 8 },
        { tag: 'design', count: 2 },
        { tag: 'Figma', count: 9 },
      ],
      sampleSize: 10,
      ai: ['auto layout figma', 'design'],
      terms: [{ term: 'auto layout figma', views: 40 }],
    },
    ['figma'],
    'figma',
  );
  it('excludes tags already in the field and merges sources', () => {
    expect(list.map((s) => s.key)).not.toContain('figma');
    const design = list.find((s) => s.key === 'design')!;
    expect(design.sources.sort()).toEqual(['ai', 'top']);
  });
  it('ranks by relevance by default', () => {
    expect(list[0]!.tag).toBe('auto layout figma');
  });
  it('sorts by traffic with unknown values last', () => {
    const sorted = sortSuggestions(list, 'traffic');
    expect(sorted[0]!.tag).toBe('auto layout figma');
    expect(sorted.slice(1).every((s) => s.traffic === undefined)).toBe(true);
  });
  it('sorts by known keyword score', () => {
    const sorted = sortSuggestions(list, 'score', { design: { score: 90, at: '2026-10-21T00:00:00Z' } });
    expect(sorted[0]!.tag).toBe('design');
  });
});

describe('rank badges', () => {
  it('never shows 0: missing rank is "—", unchecked has no badge', () => {
    expect(rankLabel(undefined)).toBeUndefined();
    expect(rankLabel({ tag: 'a', rank: null, at: '' })).toBe('—');
    expect(rankLabel({ tag: 'a', rank: 0, at: '' })).toBe('—');
    expect(rankLabel({ tag: 'a', rank: 3, at: '' })).toBe('3');
  });
  it('merges results per normalized tag and summarizes the field', () => {
    const m = mergeRanks({}, [
      { tag: 'Figma', rank: 4 },
      { tag: 'ui', rank: null },
      { tag: 'design', rank: 27 },
    ], '2026-10-21T00:00:00Z');
    expect(m.figma!.rank).toBe(4);
    expect(ranksFor(['figma', 'ui', 'design', 'other'], m)).toEqual({ checked: 3, top10: 1, found: 2 });
  });
  it('batches lists', () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('video switcher', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('finds newer and older neighbours', () => {
    expect(neighbours(list, 'b')).toEqual({ index: 1, prev: { id: 'a' }, next: { id: 'c' } });
    expect(neighbours(list, 'a').prev).toBeUndefined();
    expect(neighbours(list, 'zzz')).toEqual({ index: -1, next: { id: 'a' } });
  });
  it('builds the Studio edit link', () => {
    expect(studioEditUrl('dQw4w9WgXcQ')).toBe('https://studio.youtube.com/video/dQw4w9WgXcQ/edit');
  });
});

describe('tagTools RPC argument validation', () => {
  it('rejects bad arguments before any network call', async () => {
    await expect(tagToolsMethods['tagTools.research']!('')).rejects.toThrow('bad argument');
    await expect(tagToolsMethods['tagTools.research']!(42)).rejects.toThrow('bad argument');
    await expect(tagToolsMethods['tagTools.cached']!('figma')).rejects.toThrow('bad argument');
    await expect(tagToolsMethods['tagTools.rankCost']!(Array.from({ length: 200 }, () => 'x'))).rejects.toThrow('bad argument');
    await expect(tagToolsMethods['tagTools.searchTerms']!('not a video')).rejects.toThrow('bad argument');
  });
  it('needs Google sign-in for own data', async () => {
    await expect(tagToolsMethods['tagTools.ownVideos']!(10)).rejects.toThrow('not signed in');
    await expect(tagToolsMethods['tagTools.searchTerms']!('dQw4w9WgXcQ')).rejects.toThrow('not signed in');
  });
});

import { describe, expect, it } from 'vitest';
import { AD_CATEGORIES, AD_TERMS, checkAdFriendly, matchText, normalizeWithMap, segments } from '../../src/domain/reportsDemonetization';

describe('demonetization word list', () => {
  it('covers every advertiser-friendly category in English and Persian', () => {
    for (const c of AD_CATEGORIES) {
      const terms = AD_TERMS.filter((t) => t.category === c);
      expect(terms.some((t) => /[a-z]/i.test(t.term)), `${c} en`).toBe(true);
      expect(terms.some((t) => /[؀-ۿ]/.test(t.term)), `${c} fa`).toBe(true);
    }
  });

  it('maps normalized characters back to the original text', () => {
    const { norm, map } = normalizeWithMap('  اسلحه‌ها  و  ك ');
    expect(norm).toBe('اسلحهها و ک');
    expect(map[0]).toBe(2);
    expect(map[norm.length - 1]).toBe(15);
  });
});

describe('matcher', () => {
  it('finds English word starts but not inside words', () => {
    expect(matchText('Killing it in this skill tutorial', 'title').map((m) => m.text)).toEqual(['Killing']);
    expect(matchText('A new method for drawing', 'title')).toEqual([]);
    expect(matchText('Breaking Bad meth lab', 'title').map((m) => m.term)).toEqual(['meth']);
  });

  it('normalizes Persian (Arabic letters, ZWNJ, diacritics) and keeps original offsets', () => {
    const text = 'نقد فيلم: اسلحه‌ها و خشونتِ بی‌پایان';
    const m = matchText(text, 'description');
    expect(m.map((x) => [x.term, x.text])).toEqual([
      ['اسلحه', 'اسلحه‌ها'],
      ['خشونت', 'خشونتِ'],
    ]);
    expect(text.slice(m[0]!.start, m[0]!.end)).toBe('اسلحه‌ها');
    expect(m[0]).toMatchObject({ category: 'firearms', severity: 'medium' });
  });

  it('respects exact terms and prefers the longest overlapping term', () => {
    expect(matchText('سفر به جنگل‌های شمال', 'title')).toEqual([]);
    expect(matchText('مستند جنگ جهانی', 'title').map((m) => m.term)).toEqual(['جنگ']);
    expect(matchText('گزارش حمله تروریستی', 'title').map((m) => m.term)).toEqual(['حمله تروریستی']);
    expect(matchText('خونه تکانی', 'title')).toEqual([]);
  });

  it('rates risk by severity and field', () => {
    expect(checkAdFriendly({ title: 'آموزش فیگما', description: 'طراحی رابط کاربری', tags: ['figma'] })).toMatchObject({ risk: 'none', matches: [] });
    expect(checkAdFriendly({ title: 'Nude art history', description: '', tags: [] }).risk).toBe('high');
    expect(checkAdFriendly({ title: 'Review', description: 'Drinking a beer on the beach', tags: [] }).risk).toBe('low');
    const r = checkAdFriendly({ title: 'Review', description: 'Shotgun and pistol', tags: ['gun'] });
    expect(r.risk).toBe('medium');
    expect(r.categories).toEqual(['firearms']);
    expect(r.matches.find((m) => m.field === 'tags')!.text).toBe('gun');
  });

  it('splits text into highlight segments', () => {
    const text = 'a gun b';
    const segs = segments(text, matchText(text, 'title'));
    expect(segs.map((s) => [s.text, !!s.match])).toEqual([
      ['a ', false],
      ['gun', true],
      [' b', false],
    ]);
  });
});

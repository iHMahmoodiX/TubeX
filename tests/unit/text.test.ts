import { describe, expect, it } from 'vitest';
import { charCount, isRtlText, matchesQuery, normalizeForSearch, toAsciiDigits, utf8Bytes } from '../../src/domain/text';

describe('normalizeForSearch', () => {
  it('folds Arabic letter variants to Persian', () => {
    expect(normalizeForSearch('كتاب علي')).toBe(normalizeForSearch('کتاب علی'));
  });
  it('ignores ZWNJ, diacritics and tatweel', () => {
    expect(normalizeForSearch('می‌خواهم')).toBe(normalizeForSearch('میخواهم'));
    expect(normalizeForSearch('عَلـــی')).toBe('علی');
  });
  it('unifies Persian, Arabic-Indic and ASCII digits', () => {
    expect(toAsciiDigits('۱۲۳٤٥')).toBe('12345');
    expect(normalizeForSearch('آموزش ۲۰۲۶')).toBe('آموزش 2026');
  });
  it('lower-cases Latin text and collapses spaces', () => {
    expect(normalizeForSearch('  Figma   UI ')).toBe('figma ui');
  });
});

describe('matchesQuery', () => {
  it('matches mixed Persian/English text term by term', () => {
    const text = 'آموزش طراحی رابط کاربری با Figma';
    expect(matchesQuery(text, 'figma طراحي')).toBe(true);
    expect(matchesQuery(text, 'sketch')).toBe(false);
    expect(matchesQuery(text, '')).toBe(true);
  });
});

describe('counts', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(charCount('🎨 UI')).toBe(4);
  });
  it('counts UTF-8 bytes (Persian letters are 2 bytes)', () => {
    expect(utf8Bytes('abc')).toBe(3);
    expect(utf8Bytes('سلام')).toBe(8);
    expect(utf8Bytes('‌')).toBe(3);
  });
});

describe('isRtlText', () => {
  it('uses the first strong character', () => {
    expect(isRtlText('سلام Figma')).toBe(true);
    expect(isRtlText('Figma سلام')).toBe(false);
    expect(isRtlText('2026 سلام')).toBe(true);
  });
});

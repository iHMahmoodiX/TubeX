import { describe, expect, it } from 'vitest';
import { applyTemplate, checkDraft, extractHashtags, formatDraftAsText, hasBlockingErrors, LIMITS, parseTags, snippet, tagsCharCount } from '../../src/domain/metadata';

const base = { title: 'عنوان', description: 'توضیح', tags: [] as string[], focusKeyword: '' };
const ids = (d: typeof base) => checkDraft(d).map((c) => c.id);

describe('tags', () => {
  it('splits on commas, Persian comma and newlines; dedupes by normalized form', () => {
    expect(parseTags('طراحی, UI،ui\nطراحي,  , فیگما')).toEqual(['طراحی', 'UI', 'فیگما']);
  });
  it('counts quotes around tags with spaces and separators', () => {
    expect(tagsCharCount([])).toBe(0);
    expect(tagsCharCount(['ab', 'c d'])).toBe(2 + 5 + 1);
  });
});

describe('hashtags', () => {
  it('extracts Persian hashtags including ZWNJ', () => {
    expect(extractHashtags('#طراحی و #هوش‌مصنوعی\n#UI_design but not a#b')).toEqual(['#طراحی', '#هوش‌مصنوعی', '#UI_design']);
  });
});

describe('checkDraft', () => {
  it('passes a reasonable draft', () => {
    expect(hasBlockingErrors(checkDraft(base))).toBe(false);
  });
  it('requires a title and enforces the title limit in code points', () => {
    expect(ids({ ...base, title: '  ' })).toContain('title-missing');
    expect(ids({ ...base, title: 'ا'.repeat(LIMITS.titleChars) })).not.toContain('title-too-long');
    expect(ids({ ...base, title: 'ا'.repeat(LIMITS.titleChars + 1) })).toContain('title-too-long');
    expect(ids({ ...base, title: 'a'.repeat(80) })).toContain('title-may-truncate');
  });
  it('measures the description in bytes, so Persian hits the limit at half the characters', () => {
    expect(ids({ ...base, description: 'a'.repeat(5000) })).not.toContain('description-too-long');
    expect(ids({ ...base, description: 'س'.repeat(2501) })).toContain('description-too-long');
  });
  it('flags angle brackets, long tags and hashtag overflow', () => {
    expect(ids({ ...base, title: 'a <b>' })).toContain('angle-brackets');
    expect(ids({ ...base, tags: Array.from({ length: 60 }, (_, i) => `tag${i}xxxx`) })).toContain('tags-too-long');
    expect(ids({ ...base, description: Array.from({ length: 61 }, (_, i) => `#h${i}`).join(' ') })).toContain('too-many-hashtags');
  });
  it('reports focus keyword placement with Persian normalization', () => {
    const checks = checkDraft({ ...base, title: 'آموزش فيگما', description: 'خط اول\nفیگما در خط دوم', tags: ['UI'], focusKeyword: 'فیگما' });
    const byId = Object.fromEntries(checks.map((c) => [c.id, c.ok]));
    expect(byId['keyword-in-title']).toBe(true);
    expect(byId['keyword-in-description-start']).toBe(true);
    expect(byId['keyword-in-tags']).toBe(false);
  });
});

describe('templates and export', () => {
  it('appends template text and merges tags without duplicates', () => {
    const out = applyTemplate({ description: 'متن', tags: ['a', 'b'] }, { description: 'لینک دوره', tags: ['B', 'c'] });
    expect(out.description).toBe('متن\n\nلینک دوره');
    expect(out.tags).toEqual(['a', 'b', 'c']);
    expect(applyTemplate({ description: '', tags: [] }, { description: 'x', tags: [] }).description).toBe('x');
  });
  it('builds a snippet cut on a word boundary', () => {
    const s = snippet('word '.repeat(50), 20);
    expect(s.cut).toBe(true);
    expect(s.text.endsWith('word')).toBe(true);
  });
  it('formats a plain-text package', () => {
    expect(formatDraftAsText({ title: 'T', description: 'D', tags: ['a', 'b'] })).toBe('T\n\nD\n\na, b\n');
  });
});

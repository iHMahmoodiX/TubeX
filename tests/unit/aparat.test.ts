import { describe, expect, it } from 'vitest';
import { aparatFromDraft, aparatPackageText, checkAparat, isAparatUrl, parseTags } from '../../src/domain/aparat';
import { parsePageUrl, cleanTabTitle } from '../../src/domain/pageContext';
import { sanitizeRecord } from '../../src/domain/records';

const draft = { title: 'آموزش فیگما', description: 'خط اول\nسابسکرایب: https://www.youtube.com/@figmafa?sub_confirmation=1\nhttps://youtu.be/abc\n\n\n\nلینک سایت https://figmafa.ir', tags: ['#فیگما', 'figma', 'figma', 'ui'] };

describe('aparat package', () => {
  it('prepares a package without YouTube-only lines and with unique tags', () => {
    const p = aparatFromDraft(draft, '2026-11-18T00:00:00Z');
    expect(p.description).toBe('خط اول\n\nلینک سایت https://figmafa.ir');
    expect(p.tags).toEqual(['فیگما', 'figma', 'ui']);
    expect(p.status).toBe('prepared');
    // The source draft is untouched.
    expect(draft.tags).toHaveLength(4);
  });

  it('errors only on sourced rules, warns on inferred ones', () => {
    const p = aparatFromDraft({ title: '', description: 'x', tags: ['a'] });
    const ids = checkAparat(p).map((i) => [i.id, i.severity]);
    expect(ids).toEqual([
      ['title-missing', 'error'],
      ['category-missing', 'error'],
      ['tags-few', 'error'],
    ]);
    const ok = { ...aparatFromDraft(draft), category: 'آموزشی' };
    expect(checkAparat(ok)).toEqual([]);
    const warn = checkAparat({ ...ok, title: 'x'.repeat(120), description: 'see https://youtube.com/watch?v=1' });
    expect(warn.every((i) => i.severity === 'warning')).toBe(true);
    expect(warn.map((i) => i.id)).toEqual(['title-long', 'youtube-links']);
    const hard = checkAparat({ ...ok, tags: ['a', 'b', 'c', 'd', 'e', 'برچسبی-خیلی-خیلی-طولانی-برای-آپارات'], description: 'x'.repeat(2001) });
    expect(hard.map((i) => [i.id, i.severity])).toEqual([
      ['tags-many', 'error'],
      ['tag-long', 'error'],
      ['description-long', 'error'],
    ]);
  });

  it('accepts only aparat.com links as the published URL', () => {
    expect(isAparatUrl('https://www.aparat.com/v/abc12')).toBe(true);
    expect(isAparatUrl('https://evil.com/aparat.com')).toBe(false);
    expect(isAparatUrl('http://www.aparat.com/v/abc12')).toBe(false);
    const p = { ...aparatFromDraft(draft), category: 'c', url: 'https://youtube.com/x' };
    expect(checkAparat(p).map((i) => i.id)).toContain('url-not-aparat');
  });

  it('parses tags typed with Persian or Latin commas', () => {
    expect(parseTags('فیگما، figma, #ui\nfigma')).toEqual(['فیگما', 'figma', 'ui']);
  });

  it('builds a labelled text package skipping empty fields', () => {
    const p = { ...aparatFromDraft(draft), category: 'آموزشی' };
    const txt = aparatPackageText(p, { title: 'عنوان', description: 'توضیحات', tags: 'برچسب‌ها', category: 'دسته', playlist: 'لیست', cover: 'کاور', schedule: 'زمان' });
    expect(txt.startsWith('عنوان:\nآموزش فیگما\n\nدسته:\nآموزشی')).toBe(true);
    expect(txt).not.toContain('لیست:');
  });

  it('keeps the package through record validation and drops a non-Aparat URL', () => {
    const p = { ...aparatFromDraft(draft), category: 'آموزشی', url: 'https://example.com/v/1' };
    const rec = { id: 'd1', createdAt: '2026-11-18T00:00:00Z', updatedAt: '2026-11-18T00:00:00Z', title: 't', description: '', tags: [], focusKeyword: '', language: 'fa', status: 'draft', platforms: { aparat: p } };
    const r = sanitizeRecord('drafts', rec);
    expect(r?.platforms?.aparat?.category).toBe('آموزشی');
    expect(r?.platforms?.aparat?.url).toBeUndefined();
  });

  it('reads Aparat pages as their own kind, never as YouTube ids', () => {
    expect(parsePageUrl('https://www.aparat.com/v/abC12?x=1')).toEqual({ kind: 'aparat', url: 'https://www.aparat.com/v/abC12', aparatHash: 'abC12', origin: 'url' });
    expect(parsePageUrl('https://aparat.com/figmafa').kind).toBe('aparat');
    expect(parsePageUrl('https://aparat.com.evil.io/v/abc').kind).toBe('unsupported');
    expect(cleanTabTitle('آموزش فیگما - آپارات')).toBe('آموزش فیگما');
  });
});

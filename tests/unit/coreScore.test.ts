import { describe, expect, it } from 'vitest';
import { checkCounts, ideaTitle, readiness } from '../../src/domain/coreScore';
import { checkDraft } from '../../src/domain/metadata';

const draft = (p: Partial<{ title: string; description: string; tags: string[]; focusKeyword: string }>) => ({
  title: '',
  description: '',
  tags: [] as string[],
  focusKeyword: '',
  ...p,
});

describe('readiness', () => {
  it('is null for an untouched draft (never a fake zero)', () => {
    const d = draft({});
    expect(readiness(d, checkDraft(d))).toBeNull();
  });

  it('is 100 for a complete draft with the keyword everywhere', () => {
    const d = draft({ title: 'آموزش فیگما', description: 'در این ویدیو فیگما را یاد می‌گیریم', tags: ['فیگما', 'طراحی'], focusKeyword: 'فیگما' });
    expect(readiness(d, checkDraft(d))).toBe(100);
  });

  it('subtracts for errors, warnings, missing keyword placements, no tags and no keyword', () => {
    const noKw = draft({ title: 'Title', description: 'Some text', tags: ['a'] });
    expect(readiness(noKw, checkDraft(noKw))).toBe(90);
    const noTags = draft({ title: 'Title', description: 'Some text', focusKeyword: 'figma' });
    // keyword missing from title, description start and tags (3 × 8) and no tags (10)
    expect(readiness(noTags, checkDraft(noTags))).toBe(66);
    const titleOnly = draft({ title: 'x'.repeat(120) });
    // title too long (error 30), description missing (warning 12), no tags, no keyword
    expect(readiness(titleOnly, checkDraft(titleOnly))).toBe(38);
  });

  it('never goes below zero', () => {
    const d = draft({ title: '<'.repeat(120), description: '<', tags: [] });
    expect(readiness(d, checkDraft(d))).toBeGreaterThanOrEqual(0);
  });
});

describe('checkCounts and ideaTitle', () => {
  it('counts severities', () => {
    const d = draft({ title: 'Hello', focusKeyword: 'hello' });
    expect(checkCounts(checkDraft(d))).toEqual({ errors: 0, warnings: 1, missing: 2, ok: 1 });
  });
  it('uses the first non-empty line', () => {
    expect(ideaTitle('\n  ایدهٔ اول \nجزئیات')).toBe('ایدهٔ اول');
  });
});

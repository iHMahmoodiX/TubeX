import { describe, expect, it } from 'vitest';
import { applyBulk, changedFields, countMatches, findPattern } from '../../src/domain/bulk';

const rec = { title: 'آموزش پایتون ۲۰۲۵', description: 'در این ویدیو پایتون یاد می‌گیریم.\nلینک: example', tags: ['پایتون', 'python 2025', 'آموزش'] };

describe('bulk edits', () => {
  it('replaces literally in the chosen fields and keeps $ literal', () => {
    const next = applyBulk(rec, { kind: 'replace', find: '۲۰۲۵', replace: '$2026', matchCase: false, wholeWord: false, fields: ['title'] });
    expect(next.title).toBe('آموزش پایتون $2026');
    expect(next.description).toBe(rec.description);
    expect(changedFields(rec, next)).toEqual(['title']);
  });

  it('matches whole Persian words only when asked', () => {
    const op = { kind: 'replace' as const, find: 'پایتون', replace: 'Python', matchCase: false, wholeWord: true, fields: ['description' as const] };
    expect(applyBulk({ ...rec, description: 'پایتون‌ها و پایتون' }, op).description).toBe('پایتون‌ها و Python');
    expect(countMatches('a.b a.b', findPattern({ ...op, find: 'a.b', wholeWord: false }))).toBe(2);
  });

  it('is case-insensitive by default and dedupes tags after replace', () => {
    const next = applyBulk(rec, { kind: 'replace', find: 'PYTHON 2025', replace: 'پایتون', matchCase: false, wholeWord: false, fields: ['tags'] });
    expect(next.tags).toEqual(['پایتون', 'آموزش']);
  });

  it('adds and removes tags without duplicates', () => {
    expect(applyBulk(rec, { kind: 'addTags', tags: ['آموزش', 'جدید'] }).tags).toEqual(['پایتون', 'python 2025', 'آموزش', 'جدید']);
    expect(applyBulk(rec, { kind: 'removeTags', tags: ['PYTHON 2025'] }).tags).toEqual(['پایتون', 'آموزش']);
  });

  it('adds text once, at the start or end', () => {
    const end = applyBulk(rec, { kind: 'addText', text: 'اینستاگرام: @me', position: 'end' });
    expect(end.description.endsWith('\n\nاینستاگرام: @me')).toBe(true);
    expect(applyBulk(end, { kind: 'addText', text: 'اینستاگرام: @me', position: 'end' })).toBe(end);
    expect(applyBulk({ ...rec, description: '' }, { kind: 'addText', text: 'x', position: 'start' }).description).toBe('x');
  });
});

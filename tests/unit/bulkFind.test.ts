import { describe, expect, it } from 'vitest';
import {
  addBlock,
  compileFind,
  compileOp,
  DEFAULT_MATCH,
  diffText,
  findAll,
  limitProblems,
  nextPacificMidnight,
  planVideo,
  quotaPlan,
  regexError,
  removeLines,
  replaceBetween,
  replaceIn,
  replaceUrls,
  sameSnippet,
  toCsv,
  urlRuleError,
  wordDiff,
  type FrOp,
  type MatchOptions,
} from '../../src/domain/bulk';

const P: MatchOptions = { ...DEFAULT_MATCH, persian: true };
const PLAIN: MatchOptions = { ...DEFAULT_MATCH, persian: false };
const m = (find: string, opts: MatchOptions = P) => {
  const r = compileFind(find, opts);
  if (!r || !r.ok) throw new Error('bad pattern');
  return r.value;
};
const run = (op: FrOp, rec: { title?: string; description: string; tags: string[] }) => {
  const c = compileOp(op);
  if (!c.ok) throw new Error(c.error);
  return c.run(rec);
};

describe('Persian-aware matching', () => {
  it('treats Arabic ي/ك/ة and Persian ی/ک/ه as equal and keeps the original text around the match', () => {
    const text = 'كانال يوتيوب ما: آموزش برنامه‌نويسي';
    expect(findAll(text, m('کانال یوتیوب')).length).toBe(1);
    expect(replaceIn(text, m('کانال یوتیوب'), 'Channel').text).toBe('Channel ما: آموزش برنامه‌نويسي');
    expect(findAll('مدرسة', m('مدرسه')).length).toBe(1);
  });

  it('treats Persian, Arabic and Latin digits as equal', () => {
    expect(findAll('سال ۱۴۰۳ و ٢٠٢٤ و 2025', m('1403')).length).toBe(1);
    expect(findAll('٢٠٢٤', m('۲۰۲۴')).length).toBe(1);
    expect(replaceIn('قیمت ۱۰۰ تومان', m('100'), '۲۰۰').text).toBe('قیمت ۲۰۰ تومان');
  });

  it('treats ZWNJ, space and repeated spaces as equal, and replaces the whole spaced run', () => {
    expect(findAll('می‌خواهم', m('می خواهم')).length).toBe(1);
    expect(findAll('می   خواهم', m('می‌خواهم')).length).toBe(1);
    expect(replaceIn('من می  خواهم بروم', m('می‌خواهم'), 'می‌روم').text).toBe('من می‌روم بروم');
  });

  it('is exact when Persian mode is off', () => {
    expect(findAll('كانال', m('کانال', PLAIN)).length).toBe(0);
    expect(findAll('می‌خواهم', m('می خواهم', PLAIN)).length).toBe(0);
  });

  it('is case-insensitive for Latin unless asked', () => {
    expect(findAll('Instagram INSTAGRAM instagram', m('instagram')).length).toBe(3);
    expect(findAll('Instagram INSTAGRAM instagram', m('instagram', { ...P, matchCase: true })).length).toBe(1);
  });

  it('matches whole words only when asked (ZWNJ joins Persian words)', () => {
    const w = { ...P, wholeWord: true };
    expect(replaceIn('پایتون‌ها و پایتون و پایتونی', m('پایتون', w), 'Python').text).toBe('پایتون‌ها و Python و پایتونی');
    expect(findAll('cat category cat.', m('cat', { ...PLAIN, wholeWord: true })).length).toBe(2);
  });

  it('inserts the replacement exactly as typed, $ included, and is idempotent', () => {
    expect(replaceIn('price 10', m('10'), '$1 & $&').text).toBe('price $1 & $&');
    const once = replaceIn('t.me/old and t.me/old', m('t.me/old'), 't.me/old_new');
    expect(once).toEqual({ text: 't.me/old_new and t.me/old_new', count: 2 });
    expect(replaceIn(once.text, m('t.me/old'), 't.me/old_new').count).toBe(0);
  });
});

describe('regular expressions', () => {
  it('supports capture groups and named groups', () => {
    const re = m('(\\d+)-(\\d+)', { ...P, regex: true });
    expect(replaceIn('a 12-34 b', re, '$2-$1').text).toBe('a 34-12 b');
    const named = m('@(?<h>\\w+)', { ...P, regex: true });
    expect(replaceIn('follow @tubex', named, 'instagram.com/$<h>').text).toBe('follow instagram.com/tubex');
  });

  it('captures from the original text even when matching on folded text', () => {
    const re = m('کانال (\\S+)', { ...P, regex: true });
    expect(replaceIn('كانال تلگرام', re, '[$1]').text).toBe('[تلگرام]');
  });

  it('reports invalid patterns for the live check and never replaces empty matches', () => {
    expect(regexError('(abc')).toMatch(/./);
    expect(regexError('a+')).toBeNull();
    expect(compileFind('(abc', { ...P, regex: true })).toMatchObject({ ok: false });
    expect(replaceIn('abc', m('x*', { ...P, regex: true }), '-')).toEqual({ text: 'abc', count: 0 });
  });

  it('uses multi-line mode so ^ and $ work per line', () => {
    expect(replaceIn('a\nb\nc', m('^b$', { ...P, regex: true }), 'B').text).toBe('a\nB\nc');
  });
});

describe('multi-line blocks', () => {
  const desc = 'سلام\r\n\r\nلینک‌ها:   \r\nاینستاگرام: instagram.com/old  \r\nتلگرام: t.me/old\r\n\r\nپایان';
  it('finds a pasted block across \\r\\n vs \\n and trailing spaces, and replaces it with the new block', () => {
    const find = '\nلینک‌ها:\nاینستاگرام: instagram.com/old\nتلگرام: t.me/old\n';
    const r = replaceIn(desc, m(find), 'لینک‌ها:\nسایت: example.com');
    expect(r.count).toBe(1);
    expect(r.text).toBe('سلام\r\n\r\nلینک‌ها:\nسایت: example.com\r\n\r\nپایان');
  });

  it('replaces the lines between two markers, keeping or dropping the markers', () => {
    const text = 'intro\n--- links ---\nold 1\nold 2\n--- end ---\noutro';
    const s = m('--- links ---');
    const e = m('--- end ---');
    expect(replaceBetween(text, s, e, 'new 1\nnew 2', true).text).toBe('intro\n--- links ---\nnew 1\nnew 2\n--- end ---\noutro');
    expect(replaceBetween(text, s, e, 'NEW', false).text).toBe('intro\nNEW\noutro');
    expect(replaceBetween(text, s, e, '', false).text).toBe('intro\noutro');
    // idempotent
    const once = replaceBetween(text, s, e, 'new 1\nnew 2', true).text;
    expect(replaceBetween(once, s, e, 'new 1\nnew 2', true).count).toBe(0);
    // end marker missing: nothing changes and it is reported
    expect(replaceBetween('--- links ---\nold', s, e, 'x', true)).toMatchObject({ count: 0, endMissing: true });
  });

  it('adds a block once (Persian-aware containment check)', () => {
    const block = 'کانال تلگرام: t.me/tubex';
    const end = addBlock('توضیحات\n\n', block, 'end', P);
    expect(end.text).toBe('توضیحات\n\nکانال تلگرام: t.me/tubex');
    expect(addBlock(end.text, 'كانال تلگرام:  t.me/tubex', 'end', P).count).toBe(0);
    expect(addBlock('متن', block, 'start', P).text).toBe('کانال تلگرام: t.me/tubex\n\nمتن');
  });

  it('removes lines that contain the text', () => {
    const r = removeLines('a\nTwitter: x.com/me\nb\ntwitter again', m('twitter'));
    expect(r).toEqual({ text: 'a\nb', count: 2 });
    expect(removeLines('only twitter', m('twitter')).text).toBe('');
  });
});

describe('link replacement', () => {
  const rule = { from: 'old.com', to: 'new.ir' };
  it('changes links on the host with or without scheme/www and keeps the path', () => {
    const r = replaceUrls('سایت: https://www.old.com/a?b=1، و old.com/x.', rule);
    expect(r).toEqual({ text: 'سایت: https://new.ir/a?b=1، و new.ir/x.', count: 2 });
  });

  it('leaves look-alike domains, other hosts and e-mail addresses alone', () => {
    const text = 'gold.com/x old.com.evil.net me@old.com notold.com';
    expect(replaceUrls(text, rule)).toEqual({ text, count: 0 });
  });

  it('replaces a link prefix only on a path boundary and can upgrade the scheme', () => {
    const r = replaceUrls('http://t.me/oldname t.me/oldname2 t.me/OldName/12', { from: 't.me/oldname', to: 'https://t.me/newname' });
    expect(r.text).toBe('https://t.me/newname t.me/oldname2 t.me/newname/12');
  });

  it('rejects rules that are not links or change nothing', () => {
    expect(urlRuleError({ from: 'not a link', to: 'a.com' })).toBe('from');
    expect(urlRuleError({ from: 'https://a.com', to: 'a.com/' })).toBe('same');
  });
});

describe('operations, limits and plans', () => {
  it('replaces in title, description and tags and dedupes tags', () => {
    const r = run({ kind: 'replace', find: 'فیگما', replace: 'Figma', fields: ['title', 'description', 'tags'], opts: P }, { title: 'آموزش فيگما', description: 'فیگما', tags: ['فیگما', 'Figma', 'ui'] });
    expect(r.next).toEqual({ title: 'آموزش Figma', description: 'Figma', tags: ['Figma', 'ui'] });
    expect(r.count).toBe(3);
  });

  it('never folds a multi-line replacement into a title or tag', () => {
    const r = run({ kind: 'replace', find: 'x', replace: 'a\nb', fields: ['title', 'tags'], opts: P }, { title: 'x', description: '', tags: ['x'] });
    expect(r.next.title).toBe('a b');
    expect(r.next.tags).toEqual(['a b']);
  });

  it('flags every YouTube limit instead of cutting text', () => {
    expect(limitProblems({ title: 'a'.repeat(101), description: 'ب'.repeat(2501), tags: ['<x>'] }).map((p) => p.code)).toEqual(['title-long', 'desc-long', 'angle']);
    expect(limitProblems({ title: ' ', description: 'ok', tags: Array.from({ length: 60 }, (_, i) => `tag number ${i}`) }).map((p) => p.code)).toEqual(['title-empty', 'tags-long']);
    const c = compileOp({ kind: 'replace', find: 'x', replace: '<b>', fields: ['description'], opts: P });
    if (!c.ok) throw new Error();
    const plan = planVideo({ title: 't', description: 'x', tags: [] }, c.run);
    expect(plan.status).toBe('invalid');
    expect(plan.problems).toEqual([{ code: 'angle', field: 'description' }]);
    expect(planVideo({ title: 't', description: 'y', tags: [] }, c.run).status).toBe('none');
  });

  it('reports a missing end marker in the plan', () => {
    const c = compileOp({ kind: 'block', start: 'START', end: 'END', block: 'x', keepMarkers: true, opts: P });
    if (!c.ok) throw new Error();
    expect(planVideo({ title: 't', description: 'START\nold', tags: [] }, c.run).status).toBe('end-missing');
  });

  it('explains why an operation cannot compile', () => {
    expect(compileOp({ kind: 'replace', find: '', replace: '', fields: ['title'], opts: P })).toMatchObject({ ok: false, error: 'empty' });
    expect(compileOp({ kind: 'replace', find: '[', replace: '', fields: ['title'], opts: { ...P, regex: true } })).toMatchObject({ ok: false, error: 'regex' });
    expect(compileOp({ kind: 'urls', from: 'x', to: 'y.com' })).toMatchObject({ ok: false, error: 'url-from' });
  });

  it('compares snippets the way YouTube stores them', () => {
    expect(sameSnippet({ title: 'a ', description: 'x  \r\ny\n', tags: [' t'] }, { title: 'a', description: 'x\ny', tags: ['t'] })).toBe(true);
    expect(sameSnippet({ title: 'a', description: 'x', tags: [] }, { title: 'a', description: 'y', tags: [] })).toBe(false);
  });
});

describe('preview diff', () => {
  it('highlights changed words inside a line and folds unchanged lines', () => {
    const before = ['l1', 'l2', 'l3', 'l4', 'l5', 'link: old.com', 'l7', 'l8', 'l9', 'l10'].join('\n');
    const after = before.replace('old.com', 'new.ir');
    const rows = diffText(before, after);
    expect(rows[0]).toMatchObject({ kind: 'gap' });
    const del = rows.find((r) => r.kind === 'del');
    const add = rows.find((r) => r.kind === 'add');
    expect(del && 'segs' in del && del.segs.filter((s) => s.changed).map((s) => s.text)).toEqual(['old.com']);
    expect(add && 'segs' in add && add.segs.filter((s) => s.changed).map((s) => s.text)).toEqual(['new.ir']);
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'gap' });
  });

  it('marks whole Persian words', () => {
    const w = wordDiff('دوره آموزش فیگما', 'دوره آموزش Figma');
    expect(w.del.filter((s) => s.changed).map((s) => s.text)).toEqual(['فیگما']);
  });
});

describe('quota and exports', () => {
  it('plans how many videos fit today and how many days the rest needs', () => {
    expect(quotaPlan(400, 8000, 500)).toMatchObject({ today: 147, later: 253, days: 3 });
    expect(quotaPlan(10, 0, 0)).toMatchObject({ today: 10, later: 0, days: 1 });
    expect(quotaPlan(5, 8000, 7990)).toMatchObject({ today: 0, later: 5, days: 2 });
  });

  it('finds the next Pacific midnight in summer and winter time', () => {
    // 2026-07-01 10:00 UTC = 03:00 PDT → next midnight 2026-07-02 07:00 UTC
    expect(new Date(nextPacificMidnight(Date.UTC(2026, 6, 1, 10))).toISOString()).toBe('2026-07-02T07:00:00.000Z');
    // 2026-12-01 07:30 UTC = 23:30 PST (Nov 30) → 2026-12-01 08:00 UTC
    expect(new Date(nextPacificMidnight(Date.UTC(2026, 11, 1, 7, 30))).toISOString()).toBe('2026-12-01T08:00:00.000Z');
  });

  it('writes CSV with a BOM, quoting and no formulas', () => {
    expect(toCsv([['a', 'b,c', '=1+1', 'x"y']])).toBe('﻿a,"b,c",\'=1+1,"x""y"\r\n');
  });
});

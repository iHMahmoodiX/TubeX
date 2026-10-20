import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, createBackup, emptyData, parseBackup } from '../../src/domain/backup';
import { newBase, type Idea } from '../../src/domain/models';

const idea = (over: Partial<Idea> = {}): Idea => ({ ...newBase(), text: 'ایده', notes: '', status: 'inbox', ...over });

describe('parseBackup', () => {
  it('round-trips a valid backup', () => {
    const data = emptyData();
    data.ideas.push(idea({ source: { kind: 'watch', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', capturedAt: new Date().toISOString(), origin: 'url' } }));
    const res = parseBackup(JSON.stringify(createBackup(data, '0.1.0')));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.ideas).toEqual(data.ideas);
  });
  it('rejects non-JSON, foreign JSON, newer formats and bad shapes', () => {
    expect(parseBackup('{oops')).toEqual({ ok: false, error: 'not-json' });
    expect(parseBackup('[]')).toEqual({ ok: false, error: 'not-tubex' });
    expect(parseBackup(JSON.stringify({ app: 'other' }))).toEqual({ ok: false, error: 'not-tubex' });
    expect(parseBackup(JSON.stringify({ app: 'tubex', format: BACKUP_FORMAT + 1, data: {} }))).toEqual({ ok: false, error: 'newer-format' });
    expect(parseBackup(JSON.stringify({ app: 'tubex', format: 1, data: { ideas: 'x' } }))).toEqual({ ok: false, error: 'bad-shape' });
    expect(parseBackup(JSON.stringify({ app: 'tubex', format: '1', data: {} }))).toEqual({ ok: false, error: 'bad-shape' });
  });
  it('rejects oversized files before parsing', () => {
    expect(parseBackup(' '.repeat(5 * 1024 * 1024 + 1))).toEqual({ ok: false, error: 'too-large' });
  });
  it('skips invalid records, unsafe URLs and duplicate ids, and counts them', () => {
    const good = idea();
    const text = JSON.stringify({
      app: 'tubex',
      format: 1,
      data: {
        ideas: [
          good,
          { ...good }, // duplicate id
          { ...idea(), text: '' }, // empty text
          { ...idea(), source: { kind: 'watch', url: 'javascript:alert(1)', capturedAt: good.createdAt } },
          { ...idea(), createdAt: 'yesterday' },
          'not an object',
        ],
      },
    });
    const res = parseBackup(text);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.ideas.map((i) => i.id)).toEqual([good.id]);
    expect(res.rejected.ideas).toBe(5);
  });
  it('drops unknown keys, including __proto__, and fills defaults', () => {
    const raw = `{"app":"tubex","format":1,"data":{"drafts":[{"id":"d1","createdAt":"2026-10-20T00:00:00.000Z","updatedAt":"2026-10-20T00:00:00.000Z","title":"t","description":"","focusKeyword":"","tags":["a"],"__proto__":{"polluted":true},"evil":1}]}}`;
    const res = parseBackup(raw);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const d = res.data.drafts[0]!;
    expect(Object.keys(d).sort()).toEqual(['createdAt', 'description', 'focusKeyword', 'id', 'language', 'rev', 'tags', 'title', 'updatedAt']);
    expect(d.language).toBe('fa');
    expect(d.rev).toBe(0);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

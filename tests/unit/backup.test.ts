import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, coerceBackupSettings, createBackup, emptyData, migrateBackup, parseBackup, type BackupSettings } from '../../src/domain/backup';
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
  it('skips unusable records and duplicate ids with a reason, and keeps records with fixable fields', () => {
    const good = idea();
    const text = JSON.stringify({
      app: 'tubex',
      format: 1,
      data: {
        ideas: [
          good,
          { ...good }, // duplicate id
          { ...idea(), text: '' }, // empty text
          { ...idea(), source: { kind: 'watch', url: 'javascript:alert(1)', capturedAt: good.createdAt } }, // tampered: refused
          { ...idea(), source: { kind: 'watch', url: 'http://www.youtube.com/watch?v=x', capturedAt: good.createdAt } }, // source dropped
          { ...idea(), createdAt: 'yesterday' },
          'not an object',
        ],
      },
    });
    const res = parseBackup(text);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // The plain-http source is dropped (record kept); the bad createdAt is filled from updatedAt.
    expect(res.data.ideas).toHaveLength(3);
    expect(res.data.ideas[0]!.id).toBe(good.id);
    expect(res.data.ideas[1]!.source).toBeUndefined();
    expect(res.data.ideas[2]!.createdAt).toBe(res.data.ideas[2]!.updatedAt);
    expect(JSON.stringify(res.data)).not.toContain('javascript:');
    expect(res.rejected.ideas).toBe(4);
    expect(res.reasons.ideas).toEqual({ duplicate: 1, empty: 1, 'bad-field': 1, 'not-object': 1 });
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

describe('older backups (format 1, TubeX 0.2/0.3 shape)', () => {
  // Shapes written by 0.2.0/0.3.0: format 1, no settings, some fields missing or written differently.
  const legacy = {
    app: 'tubex',
    format: 1,
    exportedAt: '2026-09-01T10:00:00.000Z',
    appVersion: '0.2.0',
    data: {
      profiles: [{ id: 'p1', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', name: 'کانال من', handle: '@me', notes: '', contentLanguage: 'fa', connection: 'unconnected' }],
      ideas: [
        {
          id: 'i1',
          createdAt: '2026-08-02T00:00:00.000Z',
          updatedAt: '2026-08-02T00:00:00.000Z',
          text: 'ایده',
          notes: '',
          status: 'inbox',
          source: { kind: 'old-kind', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', capturedAt: '2026-08-02T00:00:00.000Z', origin: 'url' },
        },
        { id: 'i2', text: 'بدون تاریخ' },
        { id: 'i3', createdAt: 1756000000000, updatedAt: 1756000000000, text: 'epoch dates', status: 'archived' },
      ],
      drafts: [
        { id: 'd1', createdAt: '2026-08-03T00:00:00.000Z', updatedAt: '2026-08-03T00:00:00.000Z', title: 'عنوان', description: 'x'.repeat(30_000), tags: 'فیگما, آموزش', profileId: 7 },
        { id: 'd2', createdAt: '2026-08-03T00:00:00.000Z', updatedAt: '2026-08-03T00:00:00.000Z', title: 't', tags: ['a', 3, null, { x: 1 }] },
      ],
      templates: [{ id: 't1', createdAt: '2026-08-04T00:00:00.000Z', updatedAt: '2026-08-04T00:00:00.000Z', description: 'Intro line\nmore', tags: [] }],
      keywordLists: [{ id: 'k1', createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z', name: 'لیست', keywords: ['فیگما', { text: 'ui', note: 'n' }, { text: '' }] }],
      watchlist: [
        { id: 'w1', createdAt: '2026-08-06T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z', channelId: 'UCabcdefghijklmnopqrstuv', title: 'Peer' },
        { id: 'w2', createdAt: '2026-08-06T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z', channelId: 'not-a-channel' },
      ],
      replies: [{ id: 'r1', createdAt: '2026-08-07T00:00:00.000Z', updatedAt: '2026-08-07T00:00:00.000Z', text: 'ممنون از نظرتان' }],
    },
  };

  it('imports every usable record and fills defaults for fields added since 0.1.0', () => {
    const res = parseBackup(JSON.stringify(legacy));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.format).toBe(1);
    expect(res.appVersion).toBe('0.2.0');
    expect(res.settings).toBeUndefined();
    expect(res.data.profiles).toHaveLength(1);
    expect(res.data.ideas.map((i) => i.id)).toEqual(['i1', 'i2', 'i3']);
    expect(res.data.ideas[0]!.source?.kind).toBe('unknown');
    expect(res.data.ideas[1]!.createdAt).toBe('2026-09-01T10:00:00.000Z'); // the export time
    expect(res.data.ideas[1]!.notes).toBe('');
    expect(res.data.ideas[2]!.createdAt).toBe(new Date(1756000000000).toISOString());
    expect(res.data.ideas[2]!.status).toBe('inbox');
    const d1 = res.data.drafts[0]!;
    expect(d1.tags).toEqual(['فیگما', 'آموزش']);
    expect(d1.description).toHaveLength(20_000);
    expect(d1.focusKeyword).toBe('');
    expect(d1.language).toBe('fa');
    expect(d1.profileId).toBe('7');
    expect(res.data.drafts[1]!.tags).toEqual(['a', '3']);
    expect(res.data.templates[0]!.name).toBe('Intro line');
    expect(res.data.keywordLists[0]!.keywords.map((k) => k.text)).toEqual(['فیگما', 'ui']);
    expect(res.data.watchlist.map((w) => w.id)).toEqual(['w1']);
    expect(res.data.watchlist[0]!.seenVideoIds).toEqual([]);
    expect(res.data.replies[0]!.name).toBe('ممنون از نظرتان');
    expect(res.rejected.watchlist).toBe(1);
    expect(res.reasons.watchlist).toEqual({ 'bad-field': 1 });
    expect(Object.values(res.rejected).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('ignores a settings section in a format-1 file (migration 1 → 2)', () => {
    expect(migrateBackup({ app: 'tubex', format: 1, data: {}, settings: { youtube: { apiKey: 'x' } } }, 1)).toEqual({ app: 'tubex', format: 2, data: {} });
    const res = parseBackup(JSON.stringify({ ...legacy, settings: { youtube: { apiKey: 'AIza-should-not-load' } } }));
    expect(res.ok && res.settings).toBeFalsy();
  });

  it('still rejects records with no id or no content', () => {
    const res = parseBackup(JSON.stringify({ app: 'tubex', format: 1, data: { ideas: [{ text: 'no id' }, { id: 'x', text: '   ' }, { id: 'y', text: { a: 1 } }, 5] } }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.ideas).toHaveLength(0);
    expect(res.reasons.ideas).toEqual({ 'bad-id': 1, empty: 1, 'bad-field': 1, 'not-object': 1 });
  });
});

describe('settings section (format 2)', () => {
  it('round-trips settings, keeps keys only when present, and never carries tokens', () => {
    const settings: BackupSettings = {
      prefs: { uiLanguage: 'en', theme: 'light', pageAdapterEnabled: false, inpage: { all: true, watch: false } },
      ai: { enabled: true, baseUrl: 'http://localhost:11434/v1', model: 'qwen3:8b', monthlyRequestCap: 500 },
      youtube: { region: 'DE', language: 'en', dailyUnitCap: 5000, apiKey: 'test-key-value' },
      channels: [{ channelId: 'UCabcdefghijklmnopqrstuv', title: 'Mine', handle: '@mine', connectedAt: '2026-10-01T00:00:00.000Z', sub: '1234567890' }],
      activeChannelId: 'UCabcdefghijklmnopqrstuv',
    };
    const file = createBackup(emptyData(), '0.5.1', settings);
    expect(file.format).toBe(BACKUP_FORMAT);
    const res = parseBackup(JSON.stringify(file));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.settings).toEqual(settings);
    expect(res.settings!.ai!.apiKey).toBeUndefined();
  });

  it('drops broken settings parts and unknown keys', () => {
    const s = coerceBackupSettings({
      prefs: { uiLanguage: 'xx', theme: 'neon', inpage: { ok: true, bad: 'yes' } },
      ai: { baseUrl: 'javascript:alert(1)', model: 5, accessToken: 'secret' },
      channels: [{ channelId: 'bad' }, { channelId: 'UCabcdefghijklmnopqrstuv', title: 'A', token: 'secret', thumbnail: 'http://x' }],
      googleTokens: { a: 1 },
    })!;
    expect(s.prefs).toEqual({ uiLanguage: 'fa', theme: 'dark', pageAdapterEnabled: true, inpage: { ok: true } });
    expect(s.ai!.baseUrl).toBe('');
    expect(JSON.stringify(s)).not.toContain('secret');
    expect(s.channels).toHaveLength(1);
    expect(s.channels![0]!.thumbnail).toBeUndefined();
    expect(coerceBackupSettings('nope')).toBeUndefined();
  });
});

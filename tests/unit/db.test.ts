import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyData } from '../../src/domain/backup';
import { newBase, type Draft, type Idea } from '../../src/domain/models';
import * as db from '../../src/storage/db';

const draft = (over: Partial<Draft> = {}): Draft => ({
  ...newBase(),
  language: 'fa',
  focusKeyword: '',
  title: 'پیش‌نویس',
  description: '',
  tags: [],
  ...over,
});
const idea = (over: Partial<Idea> = {}): Idea => ({ ...newBase(), text: 'ایده', notes: '', status: 'inbox', ...over });

beforeEach(async () => {
  await db.resetDbForTests();
  indexedDB.deleteDatabase(db.DB_NAME);
});
afterEach(async () => {
  await db.resetDbForTests();
});

describe('repository', () => {
  it('creates, lists newest first, and removes', async () => {
    const a = await db.create('ideas', idea({ updatedAt: '2026-01-01T00:00:00.000Z' }));
    const b = await db.create('ideas', idea({ updatedAt: '2026-02-01T00:00:00.000Z' }));
    expect((await db.list('ideas')).items.map((i) => i.id)).toEqual([b.id, a.id]);
    expect((await db.remove('ideas', a.id))?.id).toBe(a.id);
    expect((await db.list('ideas')).items).toHaveLength(1);
  });

  it('saves with optimistic concurrency and reports conflicts', async () => {
    const d = await db.create('drafts', draft());
    const first = await db.save('drafts', { ...d, title: 'نسخهٔ یک' });
    expect(first.ok).toBe(true);
    // A second window still holding rev 0 must not overwrite rev 1.
    const stale = await db.save('drafts', { ...d, title: 'نسخهٔ قدیمی' });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.conflict?.title).toBe('نسخهٔ یک');
    // Explicit "keep mine" wins and bumps the revision past the stored one.
    const kept = await db.put('drafts', { ...d, title: 'نسخهٔ من' });
    expect(kept.rev).toBe(2);
    expect((await db.get('drafts', d.id))?.title).toBe('نسخهٔ من');
  });

  it('hides corrupt stored rows instead of crashing and counts them', async () => {
    await db.create('ideas', idea());
    const raw = await db.openDb();
    await raw.put('ideas', { id: 'broken', text: 42 });
    const res = await db.list('ideas');
    expect(res.items).toHaveLength(1);
    expect(res.corrupt).toBe(1);
    // The corrupt row is left in storage for recovery, not deleted.
    expect(await raw.get('ideas', 'broken')).toBeTruthy();
  });
});

describe('import', () => {
  it('merges keeping the newer copy, and can undo the import', async () => {
    const local = await db.create('ideas', idea({ text: 'محلی', updatedAt: '2026-05-01T00:00:00.000Z' }));
    const data = emptyData();
    data.ideas.push({ ...local, text: 'قدیمی‌تر', updatedAt: '2026-04-01T00:00:00.000Z' });
    data.ideas.push(idea({ text: 'تازه' }));
    const res = await db.importData(data, 'merge');
    expect(res).toEqual({ added: 1, updated: 0, keptLocal: 1 });
    expect((await db.get('ideas', local.id))?.text).toBe('محلی');
    expect((await db.list('ideas')).items).toHaveLength(2);

    expect(await db.hasImportSnapshot()).toBeTruthy();
    expect(await db.undoLastImport()).toBe(true);
    expect((await db.list('ideas')).items.map((i) => i.id)).toEqual([local.id]);
    expect(await db.hasImportSnapshot()).toBeUndefined();
  });

  it('replace removes local records first', async () => {
    await db.create('ideas', idea());
    const data = emptyData();
    data.drafts.push(draft());
    await db.importData(data, 'replace');
    expect((await db.list('ideas')).items).toHaveLength(0);
    expect((await db.list('drafts')).items).toHaveLength(1);
  });

  it('export then import into an empty database reproduces the data', async () => {
    await db.create('ideas', idea());
    await db.create('drafts', draft({ tags: ['a', 'ب'] }));
    const exported = await db.exportAll();
    await db.deleteAllData();
    expect((await db.list('drafts')).items).toHaveLength(0);
    await db.importData(exported, 'merge');
    expect(await db.exportAll()).toEqual(exported);
  });
});

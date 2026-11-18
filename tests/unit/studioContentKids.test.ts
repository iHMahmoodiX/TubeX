import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { applyKidsBatch, kidsStatusBody, listKidsBatches, readKids, setKids, undoKidsBatch } from '../../src/integrations/google/kidsWrites';
import { studioContentMethods } from '../../src/background/methods/studioContent';
import { loadUsage } from '../../src/storage/integrations';
import * as db from '../../src/storage/db';

const CH = 'UCabcdefghijklmnopqrstuv';
const A = 'aaaaaaaaaa1';
const B = 'bbbbbbbbbb2';
const json = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('made for kids writes', () => {
  // A tiny fake of videos.list / videos.update holding each video's status.
  let live: Record<string, Record<string, unknown>>;
  let puts: { id: string; status: Record<string, unknown> }[];
  beforeEach(async () => {
    fakeBrowser.reset();
    await db.resetDbForTests();
    indexedDB.deleteDatabase(db.DB_NAME);
    await fakeBrowser.storage.session.set({ googleTokens: { [CH]: { accessToken: 'tok', expiresAt: Date.now() + 3600_000, scopes: [] } } });
    live = {
      [A]: { privacyStatus: 'public', embeddable: true, license: 'youtube', publicStatsViewable: true, madeForKids: false, selfDeclaredMadeForKids: false, uploadStatus: 'processed' },
      [B]: { privacyStatus: 'private', publishAt: '2026-12-01T10:00:00Z', madeForKids: true },
    };
    puts = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = new URL(String(url));
        if (init?.method === 'PUT') {
          const body = JSON.parse(init.body as string);
          puts.push(body);
          live[body.id] = { ...live[body.id], ...body.status, madeForKids: body.status.selfDeclaredMadeForKids };
          return json({ id: body.id, status: live[body.id] });
        }
        const ids = (u.searchParams.get('id') ?? '').split(',');
        return json({ items: ids.filter((id) => live[id]).map((id) => ({ id, snippet: { title: `Title ${id}`, thumbnails: {} }, contentDetails: { duration: 'PT45S' }, status: live[id] })) });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps every writable status field and drops read-only ones', () => {
    expect(kidsStatusBody(live[A]!, true)).toEqual({ privacyStatus: 'public', embeddable: true, license: 'youtube', publicStatsViewable: true, selfDeclaredMadeForKids: true });
    expect(kidsStatusBody(live[B]!, false)).toEqual({ privacyStatus: 'private', publishAt: '2026-12-01T10:00:00Z', selfDeclaredMadeForKids: false });
  });

  it('reads status with both fields; missing ids are left out', async () => {
    const r = await readKids(CH, [A, B, 'zzzzzzzzzz9']);
    expect(r.map((v) => [v.id, v.madeForKids, v.selfDeclared, v.durationSec])).toEqual([
      [A, false, false, 45],
      [B, true, undefined, 45],
    ]);
  });

  it('re-reads before writing and skips when already declared', async () => {
    const same = await setKids(CH, A, false);
    expect(same.changed).toBe(false);
    expect(puts).toHaveLength(0);
    const w = await setKids(CH, A, true);
    expect(w).toMatchObject({ changed: true, before: false, after: true, title: `Title ${A}` });
    expect(puts[0]!.status.selfDeclaredMadeForKids).toBe(true);
    expect((await loadUsage()).ytUnits).toBe(1 + 1 + 50);
  });

  it('applies a batch with undo, and undo leaves later manual changes alone', async () => {
    const out = await applyKidsBatch(CH, [A, B], true);
    expect(out.results.map((r) => [r.videoId, r.ok, r.changed])).toEqual([
      [A, true, true],
      [B, true, true],
    ]);
    expect(out.batch?.entries.map((e) => [e.videoId, e.before, e.after])).toEqual([
      [A, false, true],
      [B, true, true],
    ]);
    expect(await listKidsBatches(CH)).toHaveLength(1);
    // Someone sets A back by hand; undo must not touch it again.
    live[A] = { ...live[A], selfDeclaredMadeForKids: false };
    puts = [];
    const u = await undoKidsBatch(CH, out.batch!.id);
    expect(u.results.find((r) => r.videoId === A)).toMatchObject({ kept: true, changed: false });
    // B had no declaration before: its effective value (true) equals what was written, nothing to restore.
    expect(u.results.find((r) => r.videoId === B)).toMatchObject({ kept: true });
    expect(puts).toHaveLength(0);
    expect((await listKidsBatches(CH))[0]!.undoneAt).toBeTruthy();
  });

  it('undo restores the previous declaration', async () => {
    const out = await applyKidsBatch(CH, [A], true);
    await undoKidsBatch(CH, out.batch!.id);
    expect(live[A]!.selfDeclaredMadeForKids).toBe(false);
  });

  it('stops the batch at a quota error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }, 403)));
    const out = await applyKidsBatch(CH, [A, B], true);
    expect(out.stopped).toBe(true);
    expect(out.results).toHaveLength(1);
    expect(out.batch).toBeUndefined();
  });

  it('validates RPC arguments', async () => {
    await expect(studioContentMethods['studioContent.kidsApply']!(['bad id'], true)).rejects.toThrow('bad argument');
    await expect(studioContentMethods['studioContent.kidsApply']!([A], 'yes')).rejects.toThrow('bad argument');
    await expect(studioContentMethods['studioContent.open']!('drafts')).rejects.toThrow('bad argument');
    await expect(studioContentMethods['studioContent.kidsUndo']!('../x')).rejects.toThrow('bad argument');
  });
});

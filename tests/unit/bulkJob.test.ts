import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { classify, command, kick, loadItems, loadJob, recover, startJob, undoOne, type RunDeps } from '../../src/background/jobs/bulk';
import { JOB_HANDLERS } from '../../src/background/jobs';
import { bulkMethods, parseOp } from '../../src/background/methods/bulk';
import { DEFAULT_MATCH, nextPacificMidnight, type FrOp } from '../../src/domain/bulk';
import { writableSnippet } from '../../src/integrations/google/own';
import { YtError } from '../../src/integrations/youtube/client';
import { AuthError } from '../../src/integrations/google/auth';
import { DEFAULT_INTEGRATIONS, loadUsage, saveIntegrations } from '../../src/storage/integrations';
import { all } from '../../src/storage/stores';
import * as db from '../../src/storage/db';

const CH = 'UCabcdefghijklmnopqrstuv';
const ids = ['aaaaaaaaaa1', 'aaaaaaaaaa2', 'aaaaaaaaaa3'];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ytErr = (status: number, reason: string) => json({ error: { code: status, message: reason, errors: [{ reason }] } }, status);

type Snippet = { title: string; description: string; tags?: string[]; categoryId: string; defaultLanguage?: string; defaultAudioLanguage?: string; channelId?: string };

/** A tiny fake of videos.list / videos.update with failure injection. */
function fakeYouTube(initial: Record<string, Snippet>) {
  const videos: Record<string, Snippet> = structuredClone(initial);
  const puts: { id: string; snippet: Record<string, unknown> }[] = [];
  const gets: string[] = [];
  /** Responses to return instead of the normal one, consumed in order, per method. */
  const fail: { GET: (() => Response | Promise<Response>)[]; PUT: (() => Response | Promise<Response>)[] } = { GET: [], PUT: [] };
  let onPut: ((id: string) => Promise<void> | void) | null = null;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(String(url));
    const method = (init?.method ?? 'GET') as 'GET' | 'PUT';
    const injected = fail[method].shift();
    if (method === 'GET') {
      gets.push(u.searchParams.get('id') ?? '');
      if (injected) return injected();
      const id = u.searchParams.get('id')!;
      const sn = videos[id];
      return json({ items: sn ? [{ id, snippet: sn, localizations: { en: { title: 'x', description: 'y' } } }] : [] });
    }
    const body = JSON.parse(String(init!.body)) as { id: string; snippet: Snippet };
    if (injected) return injected();
    puts.push({ id: body.id, snippet: body.snippet as unknown as Record<string, unknown> });
    videos[body.id] = { ...body.snippet, channelId: CH };
    await onPut?.(body.id);
    return json({ id: body.id, snippet: videos[body.id] });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { videos, puts, gets, fail, fetchMock, setOnPut: (f: typeof onPut) => (onPut = f) };
}

const OLD = 'لینک‌ها:\nاینستاگرام: instagram.com/old\nتلگرام: t.me/old';
const NEW = 'لینک‌ها:\nسایت: tubex.example';
const replaceOp: FrOp = { kind: 'replace', find: OLD, replace: NEW, fields: ['description'], opts: DEFAULT_MATCH };

const video = (desc: string, extra: Partial<Snippet> = {}): Snippet => ({ title: 'عنوان', description: desc, tags: ['تگ'], categoryId: '27', defaultLanguage: 'fa', defaultAudioLanguage: 'fa', ...extra });

const NOW = Date.UTC(2026, 9, 21, 18); // 11:00 in Los Angeles
const sleeps: number[] = [];
const deps: RunDeps = { sleep: async (ms) => void sleeps.push(ms), now: () => NOW };

async function run(op: FrOp, videoIds = ids) {
  const job = await startJob({ channelId: CH, label: 'test', op, videos: videoIds.map((id) => ({ id, title: `t-${id}` })) }, deps);
  await kick(job.id, deps);
  return job.id;
}

describe('bulk job runner', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await db.resetDbForTests();
    indexedDB.deleteDatabase(db.DB_NAME);
    sleeps.length = 0;
    await fakeBrowser.storage.session.set({ googleTokens: { [CH]: { accessToken: 'tok', expiresAt: Date.now() + 3600_000, scopes: [] } } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('re-reads, writes the full writable snippet, skips videos without the old text and records undo data', async () => {
    const yt = fakeYouTube({ [ids[0]!]: video(`سلام\r\n\r\n${OLD.replace(/\n/g, '\r\n')}  \r\n`), [ids[1]!]: video('بدون لینک'), [ids[2]!]: video(`intro\n${OLD.replace('ی', 'ي')}`) });
    const id = await run(replaceOp);
    expect(yt.puts.map((p) => p.id)).toEqual([ids[0], ids[2]]);
    const sent = yt.puts[0]!.snippet;
    expect(Object.keys(sent).sort()).toEqual(['categoryId', 'defaultAudioLanguage', 'defaultLanguage', 'description', 'tags', 'title']);
    expect(sent).toMatchObject({ title: 'عنوان', tags: ['تگ'], categoryId: '27', defaultLanguage: 'fa', defaultAudioLanguage: 'fa' });
    // Spaces after the matched block stay where they were; only the block changes.
    expect(sent.description).toBe(`سلام\r\n\r\n${NEW}  \r\n`);
    expect(yt.videos[ids[2]!]!.description).toBe(`intro\n${NEW}`);
    const items = await loadItems(id);
    expect(items.map((i) => i.state)).toEqual(['written', 'skipped', 'written']);
    expect(items[1]!.reason).toBe('no-match');
    expect(items[0]!.before!.description).toContain('instagram.com/old');
    expect(items[0]!.localizations).toEqual(['en']);
    expect((await loadJob(id))!.status).toBe('done');
    expect((await loadUsage()).ytUnits).toBe(3 + 2 * 50);
    expect((await all('alerts'))[0]!.body).toMatch(/[2۲]/);
  });

  it('skips a video that would break a limit, with the reason, and never cuts text', async () => {
    const yt = fakeYouTube({ [ids[0]!]: video(`${'ب'.repeat(2490)} x`) });
    const id = await run({ kind: 'replace', find: 'x', replace: 'خیلی طولانی', fields: ['description'], opts: DEFAULT_MATCH }, [ids[0]!]);
    expect(yt.puts).toHaveLength(0);
    const [item] = await loadItems(id);
    expect(item).toMatchObject({ state: 'skipped', reason: 'limit', problems: [{ code: 'desc-long', max: 5000 }] });
  });

  it('backs off and retries on 5xx, 429 and rateLimitExceeded', async () => {
    const yt = fakeYouTube({ [ids[0]!]: video(OLD) });
    yt.fail.PUT.push(() => json({}, 503), () => ytErr(403, 'rateLimitExceeded'));
    yt.fail.GET.push(() => json({}, 429));
    const id = await run(replaceOp, [ids[0]!]);
    expect(sleeps.filter((ms) => ms >= 2000)).toHaveLength(3);
    expect((await loadItems(id))[0]!.state).toBe('written');
    expect(yt.puts).toHaveLength(1);
  });

  it('marks one video failed on a per-video error and goes on', async () => {
    const yt = fakeYouTube({ [ids[0]!]: video(OLD), [ids[1]!]: video(OLD) });
    yt.fail.PUT.push(() => ytErr(400, 'invalidDescription'));
    const id = await run(replaceOp, [ids[0]!, ids[1]!]);
    const items = await loadItems(id);
    expect(items[0]).toMatchObject({ state: 'failed', error: { kind: 'yt', code: 'bad-request' } });
    expect(items[1]!.state).toBe('written');
    expect(yt.puts).toHaveLength(1);
  });

  it('waits for the Pacific-midnight reset on quotaExceeded and continues by itself the next day', async () => {
    const yt = fakeYouTube({ [ids[0]!]: video(OLD), [ids[1]!]: video(OLD), [ids[2]!]: video(OLD) });
    yt.setOnPut(() => {
      if (yt.puts.length === 1) yt.fail.PUT.push(() => ytErr(403, 'quotaExceeded'));
    });
    const id = await run(replaceOp);
    const job = (await loadJob(id))!;
    expect(job.status).toBe('waiting');
    expect(job.waitReason).toBe('quota');
    expect(Date.parse(job.nextRunAt!)).toBe(nextPacificMidnight(NOW) + 10 * 60_000);
    expect((await loadItems(id)).map((i) => i.state)).toEqual(['written', 'pending', 'pending']);
    const cont = (await all('jobs')).find((j) => j.kind === 'bulk.continue')!;
    expect(cont).toMatchObject({ status: 'pending', runAt: job.nextRunAt, payload: { jobId: id } });
    // Next day: the scheduler runs the continuation, which restarts the loop.
    expect(await JOB_HANDLERS['bulk.continue']!(cont)).toMatch(/[2۲]/);
    await kick(id, deps);
    expect((await loadItems(id)).map((i) => i.state)).toEqual(['written', 'written', 'written']);
    expect((await loadJob(id))!.status).toBe('done');
  });

  it('respects the local daily cap and resumes from the 15-minute tick after the reset', async () => {
    await saveIntegrations({ ...DEFAULT_INTEGRATIONS, youtube: { ...DEFAULT_INTEGRATIONS.youtube, dailyUnitCap: 120 } });
    const yt = fakeYouTube({ [ids[0]!]: video(OLD), [ids[1]!]: video(OLD), [ids[2]!]: video(OLD) });
    const id = await run(replaceOp);
    expect((await loadJob(id))!).toMatchObject({ status: 'waiting', waitReason: 'budget' });
    expect(yt.puts).toHaveLength(2);
    // Before the reset nothing happens.
    expect(await recover(NOW + 60_000, deps)).toEqual([]);
    // After it (new Pacific day: the counter rolls over).
    await fakeBrowser.storage.local.set({ usage: { ytDay: '2000-01-01', ytUnits: 0 } });
    const next = Date.parse((await loadJob(id))!.nextRunAt!) + 1000;
    expect(await recover(next, deps)).toEqual([id]);
    await kick(id, deps);
    expect(yt.puts).toHaveLength(3);
    expect((await loadJob(id))!.status).toBe('done');
  });

  it('is idempotent: running the same change again writes nothing', async () => {
    const yt = fakeYouTube({ [ids[0]!]: video(OLD), [ids[1]!]: video(OLD) });
    await run(replaceOp, [ids[0]!, ids[1]!]);
    expect(yt.puts).toHaveLength(2);
    const again = await run(replaceOp, [ids[0]!, ids[1]!]);
    expect(yt.puts).toHaveLength(2);
    expect((await loadItems(again)).map((i) => i.reason)).toEqual(['no-match', 'no-match']);
  });

  it('recognizes a write whose response was lost and keeps the true before-state', async () => {
    const yt = fakeYouTube({ [ids[0]!]: video(OLD) });
    let first = true;
    yt.setOnPut(() => {
      if (first) {
        first = false;
        throw new TypeError('network down');
      }
    });
    const id = await run(replaceOp, [ids[0]!]);
    const [item] = await loadItems(id);
    expect(item).toMatchObject({ state: 'written' });
    expect(item!.before!.description).toBe(OLD);
    expect(item!.after!.description).toBe(NEW);
    expect(item!.attempt).toBeUndefined();
    expect(yt.puts).toHaveLength(1);
  });

  it('stops on an expired sign-in and resumes after a reconnect without repeating written videos', async () => {
    const yt = fakeYouTube({ [ids[0]!]: video(OLD), [ids[1]!]: video(OLD) });
    yt.setOnPut(() => {
      if (yt.puts.length === 1) yt.fail.GET.push(() => json({}, 401));
    });
    const id = await run(replaceOp, [ids[0]!, ids[1]!]);
    expect((await loadJob(id))!).toMatchObject({ status: 'stopped', error: { kind: 'auth', code: 'expired' } });
    await fakeBrowser.storage.session.set({ googleTokens: { [CH]: { accessToken: 'tok2', expiresAt: Date.now() + 3600_000, scopes: [] } } });
    await command(id, 'resume', deps);
    await kick(id, deps);
    expect((await loadItems(id)).map((i) => i.state)).toEqual(['written', 'written']);
    expect(yt.puts.map((p) => p.id)).toEqual([ids[0], ids[1]]);
  });

  it('pauses between videos and resumes where it stopped', async () => {
    const yt = fakeYouTube({ [ids[0]!]: video(OLD), [ids[1]!]: video(OLD), [ids[2]!]: video(OLD) });
    const job = await startJob({ channelId: CH, label: 'p', op: replaceOp, videos: ids.map((id) => ({ id, title: id })) }, deps);
    yt.setOnPut(async () => {
      if (yt.puts.length === 1) await command(job.id, 'pause', deps);
    });
    await kick(job.id, deps);
    expect((await loadJob(job.id))!.status).toBe('paused');
    expect((await loadItems(job.id)).map((i) => i.state)).toEqual(['written', 'pending', 'pending']);
    yt.setOnPut(null);
    await command(job.id, 'resume', deps);
    await kick(job.id, deps);
    expect((await loadJob(job.id))!.status).toBe('done');
    expect(yt.puts).toHaveLength(3);
  });

  it('refuses a second job while one is active', async () => {
    fakeYouTube({ [ids[0]!]: video(OLD) });
    await saveIntegrations({ ...DEFAULT_INTEGRATIONS, youtube: { ...DEFAULT_INTEGRATIONS.youtube, dailyUnitCap: 10 } });
    await run(replaceOp, [ids[0]!]); // waits for the reset (cap too low)
    await expect(startJob({ channelId: CH, label: 'x', op: replaceOp, videos: [{ id: ids[1]!, title: '' }] }, deps)).rejects.toThrow('busy');
  });
});

describe('bulk undo', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await db.resetDbForTests();
    indexedDB.deleteDatabase(db.DB_NAME);
    await fakeBrowser.storage.session.set({ googleTokens: { [CH]: { accessToken: 'tok', expiresAt: Date.now() + 3600_000, scopes: [] } } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('restores untouched videos, flags videos edited since, and overwrites only when asked', async () => {
    const yt = fakeYouTube({ [ids[0]!]: video(OLD), [ids[1]!]: video(OLD), [ids[2]!]: video(OLD) });
    const id = await run(replaceOp);
    // The owner edits video 2 by hand after TubeX changed it; video 3 is already back to the old text.
    yt.videos[ids[1]!]!.description = `${NEW}\nویرایش دستی`;
    yt.videos[ids[2]!]!.description = OLD;
    const putsBefore = yt.puts.length;
    await command(id, 'undo', deps);
    await kick(id, deps);
    const items = await loadItems(id);
    expect(items.map((i) => i.undo)).toEqual(['restored', 'conflict', 'same']);
    expect(yt.videos[ids[0]!]!.description).toBe(OLD);
    expect(yt.videos[ids[1]!]!.description).toBe(`${NEW}\nویرایش دستی`);
    expect(items[1]!.current!.description).toContain('ویرایش دستی');
    expect(yt.puts.length - putsBefore).toBe(1);
    // Explicit overwrite of the conflict.
    const r = await undoOne(id, ids[1]!, true);
    expect(r.undo).toBe('restored');
    expect(yt.videos[ids[1]!]!.description).toBe(OLD);
    // The restore wrote every writable field back as well.
    expect(Object.keys(yt.puts[yt.puts.length - 1]!.snippet).sort()).toEqual(['categoryId', 'defaultAudioLanguage', 'defaultLanguage', 'description', 'tags', 'title']);
  });

  it('single-video undo without force does not overwrite an edited video', async () => {
    const yt = fakeYouTube({ [ids[0]!]: video(OLD) });
    const id = await run(replaceOp, [ids[0]!]);
    yt.videos[ids[0]!]!.title = 'عنوان جدید دستی';
    expect((await undoOne(id, ids[0]!, false)).undo).toBe('conflict');
    expect(yt.videos[ids[0]!]!.title).toBe('عنوان جدید دستی');
  });
});

describe('bulk job helpers and RPC validation', () => {
  it('classifies errors into retry, wait, stop or per-video', () => {
    expect(classify(new YtError('quota', '403 quotaExceeded The request cannot be completed'))).toBe('quota');
    expect(classify(new YtError('quota', '403 rateLimitExceeded'))).toBe('transient');
    expect(classify(new YtError('server', '503 backendError'))).toBe('transient');
    expect(classify(new YtError('server', '429'))).toBe('transient');
    expect(classify(new YtError('budget'))).toBe('budget');
    expect(classify(new YtError('forbidden', '403 forbidden'))).toBe('item');
    expect(classify(new YtError('forbidden', '403 insufficientPermissions'))).toBe('stop');
    expect(classify(new AuthError('expired'))).toBe('stop');
    expect(classify(new YtError('bad-request', '400 invalidDescription'))).toBe('item');
  });

  it('keeps every writable snippet field (and nothing read-only)', () => {
    const live = { title: 'a', description: 'd', tags: ['x'], categoryId: '27', defaultLanguage: 'fa', defaultAudioLanguage: 'fa-IR', channelId: 'C', thumbnails: {}, localized: { title: 'a' }, publishedAt: 'p' };
    expect(writableSnippet(live, { title: 'b', description: 'e', tags: [] })).toEqual({ title: 'b', description: 'e', tags: [], categoryId: '27', defaultLanguage: 'fa', defaultAudioLanguage: 'fa-IR' });
  });

  it('rebuilds operations from known fields only and rejects bad input', () => {
    expect(parseOp({ kind: 'urls', from: 'old.com', to: 'new.com', evil: 1 })).toEqual({ kind: 'urls', from: 'old.com', to: 'new.com' });
    expect(() => parseOp({ kind: 'replace', find: 'a', replace: 'b', fields: ['title', 'status'], opts: DEFAULT_MATCH })).toThrow('bad argument');
    expect(() => parseOp({ kind: 'replace', find: '(', replace: '', fields: ['title'], opts: { ...DEFAULT_MATCH, regex: true } })).toThrow('bad argument');
    expect(() => parseOp({ kind: 'eval' })).toThrow('bad argument');
    expect(parseOp({ kind: 'profile', description: 'd', tags: ['t'], descriptionMode: 'append', tagsMode: 'keep' })).toMatchObject({ kind: 'profile' });
  });

  it('bulk.start needs a signed-in channel and valid video ids', async () => {
    fakeBrowser.reset();
    await expect(bulkMethods['bulk.start']!({ label: 'x', op: replaceOp, videos: [{ id: ids[0], title: '' }] })).rejects.toThrow('not signed in');
    await fakeBrowser.storage.local.set({ google: { channels: [{ channelId: CH, title: 'Me', handle: '@me', connectedAt: '2026-10-01' }], activeChannelId: CH } });
    await expect(bulkMethods['bulk.start']!({ label: 'x', op: replaceOp, videos: [{ id: 'bad id', title: '' }] })).rejects.toThrow('bad argument');
    await expect(bulkMethods['bulk.command']!('not-an-id!', 'pause')).rejects.toThrow('bad argument');
    await expect(bulkMethods['bulk.command']!('abcdef123456', 'drop-table')).rejects.toThrow('bad argument');
  });
});

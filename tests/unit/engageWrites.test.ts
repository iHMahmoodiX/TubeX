import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  deleteComment,
  downloadCaption,
  fetchCurrentThumbnail,
  insertPlaylistItem,
  listCommentThreads,
  movePlaylistItem,
  replyToComment,
  setModerationStatus,
  setThumbnail,
  updatePlaylist,
  writeStatus,
} from '../../src/integrations/google/ownWrites';
import { loadUsage, saveIntegrations, DEFAULT_INTEGRATIONS } from '../../src/storage/integrations';
import * as db from '../../src/storage/db';

const CH = 'UCabcdefghijklmnopqrstuv';
const json = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
type Call = [string, RequestInit | undefined];

describe('engage writes', () => {
  let calls: Call[];
  const mock = (handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) => {
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push([String(url), init]);
        return handler(new URL(String(url)), init);
      }),
    );
  };

  beforeEach(async () => {
    fakeBrowser.reset();
    await db.resetDbForTests();
    indexedDB.deleteDatabase(db.DB_NAME);
    await fakeBrowser.storage.session.set({ googleTokens: { [CH]: { accessToken: 'tok', expiresAt: Date.now() + 3600_000, scopes: [] } } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists the channel inbox with replies and counts 1 unit', async () => {
    mock(() => json({ items: [{ id: 'T1', snippet: { videoId: 'v', totalReplyCount: 0, topLevelComment: { snippet: { textOriginal: 'hi', authorDisplayName: '@a' } } } }], nextPageToken: 'n2' }));
    const page = await listCommentThreads(CH, { status: 'heldForReview' });
    const u = new URL(calls[0]![0]);
    expect(u.pathname).toBe('/youtube/v3/commentThreads');
    expect(u.searchParams.get('allThreadsRelatedToChannelId')).toBe(CH);
    expect(u.searchParams.get('moderationStatus')).toBe('heldForReview');
    expect(u.searchParams.get('part')).toBe('snippet,replies');
    expect(page).toMatchObject({ nextPageToken: 'n2', threads: [{ id: 'T1', text: 'hi' }] });
    expect((await loadUsage()).ytUnits).toBe(1);
  });

  it('posts a reply with parentId and textOriginal (50 units)', async () => {
    mock(() => json({ id: 'R1', snippet: { textOriginal: 'ممنون', authorChannelId: { value: CH } } }));
    const r = await replyToComment(CH, 'T1', 'ممنون');
    const [url, init] = calls[0]!;
    expect(url).toContain('/comments?part=snippet');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ snippet: { parentId: 'T1', textOriginal: 'ممنون' } });
    expect(r).toMatchObject({ id: 'R1', authorChannelId: CH, text: 'ممنون' });
    expect((await loadUsage()).ytUnits).toBe(50);
  });

  it('deletes a reply and moderates many ids in one request without banning', async () => {
    mock(() => json(null, 204));
    await deleteComment(CH, 'R1');
    expect(calls[0]![1]!.method).toBe('DELETE');
    await setModerationStatus(CH, ['a', 'b'], 'rejected');
    const u = new URL(calls[1]![0]);
    expect(u.pathname).toBe('/youtube/v3/comments/setModerationStatus');
    expect(u.searchParams.get('id')).toBe('a,b');
    expect(u.searchParams.get('moderationStatus')).toBe('rejected');
    expect(u.searchParams.get('banAuthor')).toBe('false');
    expect((await loadUsage()).ytUnits).toBe(100);
  });

  it('stops before sending when the daily cap would be passed', async () => {
    await saveIntegrations({ ...DEFAULT_INTEGRATIONS, youtube: { ...DEFAULT_INTEGRATIONS.youtube, dailyUnitCap: 40 } });
    mock(() => json({}));
    await expect(replyToComment(CH, 'T1', 'x')).rejects.toMatchObject({ code: 'budget' });
    expect(calls).toHaveLength(0);
  });

  it('re-reads status and sends every writable field when scheduling a publish', async () => {
    mock((u, init) =>
      init?.method === 'PUT'
        ? json({})
        : json({ items: [{ id: 'v1', status: { privacyStatus: 'unlisted', uploadStatus: 'processed', license: 'creativeCommon', embeddable: false, publicStatsViewable: true, selfDeclaredMadeForKids: false } }] }),
    );
    const r = await writeStatus(CH, 'v1', { publishAt: '2030-01-01T10:00:00.000Z' });
    const body = JSON.parse(calls[1]![1]!.body as string);
    expect(calls[1]![0]).toContain('/videos?part=status');
    expect(body).toEqual({ id: 'v1', status: { privacyStatus: 'private', publishAt: '2030-01-01T10:00:00.000Z', license: 'creativeCommon', embeddable: false, publicStatsViewable: true, selfDeclaredMadeForKids: false } });
    expect(r.before.privacyStatus).toBe('unlisted');
    expect((await loadUsage()).ytUnits).toBe(51);
  });

  it('moves and inserts playlist items with the right snippet', async () => {
    mock(() => json({ id: 'PI2', snippet: { playlistId: 'PL', position: 3, resourceId: { videoId: 'v2' } } }));
    await movePlaylistItem(CH, { id: 'PI1', playlistId: 'PL', videoId: 'v1' }, 2);
    expect(JSON.parse(calls[0]![1]!.body as string)).toEqual({ id: 'PI1', snippet: { playlistId: 'PL', resourceId: { kind: 'youtube#video', videoId: 'v1' }, position: 2 } });
    expect(calls[0]![1]!.method).toBe('PUT');
    const e = await insertPlaylistItem(CH, 'PL', 'v2', 3);
    expect(JSON.parse(calls[1]![1]!.body as string).snippet.position).toBe(3);
    expect(e).toMatchObject({ id: 'PI2', videoId: 'v2', position: 3 });
  });

  it('keeps the playlist default language when editing details', async () => {
    mock((u, init) => (init?.method === 'PUT' ? json({}) : json({ items: [{ id: 'PL', snippet: { title: 'a', description: 'b', defaultLanguage: 'fa' }, status: { privacyStatus: 'public' } }] })));
    const r = await updatePlaylist(CH, 'PL', { title: 'A2', description: 'B2', privacy: 'unlisted' });
    expect(JSON.parse(calls[1]![1]!.body as string)).toEqual({ id: 'PL', snippet: { title: 'A2', description: 'B2', defaultLanguage: 'fa' }, status: { privacyStatus: 'unlisted' } });
    expect(r.before).toEqual({ title: 'a', description: 'b', privacy: 'public' });
  });

  it('uploads a thumbnail as raw JPEG to the upload endpoint', async () => {
    mock(() => json({ items: [] }));
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    await setThumbnail(CH, 'v1', blob);
    const [url, init] = calls[0]!;
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://www.googleapis.com/upload/youtube/v3/thumbnails/set');
    expect(u.searchParams.get('videoId')).toBe('v1');
    expect(init!.body).toBe(blob);
    expect((init!.headers as Record<string, string>)['Content-Type']).toBe('image/jpeg');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('maps a 403 on thumbnails to forbidden', async () => {
    mock(() => json({ error: { message: 'The authenticated user does not have permissions to upload and set custom video thumbnails.', errors: [{ reason: 'forbidden' }] } }, 403));
    await expect(setThumbnail(CH, 'v1', new Blob(['x'], { type: 'image/jpeg' }))).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('falls back to the hq thumbnail when maxres is missing', async () => {
    const f = vi.fn(async (url: string) => (String(url).includes('maxres') ? new Response('', { status: 404 }) : new Response(new Blob(['img'], { type: 'image/jpeg' }))));
    const r = await fetchCurrentThumbnail('v1', f as unknown as typeof fetch);
    expect(r.size).toBe('hq');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('downloads captions as SRT text for 200 units and caches them', async () => {
    const f = vi.fn(async () => new Response('1\n00:00:01,000 --> 00:00:02,000\nسلام', { status: 200 }));
    expect(await downloadCaption(CH, 'cap1', f as unknown as typeof fetch)).toContain('سلام');
    expect(await downloadCaption(CH, 'cap1', f as unknown as typeof fetch)).toContain('سلام');
    expect(f).toHaveBeenCalledTimes(1);
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain('/captions/cap1?tfmt=srt');
    expect((await loadUsage()).ytUnits).toBe(200);
  });
});

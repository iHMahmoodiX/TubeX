import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AuthError, buildAuthUrl, coerceGoogleState, GOOGLE_CLIENT_ID, parseAuthResponse } from '../../src/integrations/google/auth';
import { updateVideo, writableSnippet } from '../../src/integrations/google/own';
import { applyBulk } from '../../src/domain/bulk';
import { loadUsage } from '../../src/storage/integrations';
import * as db from '../../src/storage/db';

const CH = 'UCabcdefghijklmnopqrstuv';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Google sign-in', () => {
  it('builds a token-flow URL with the account chooser', () => {
    const u = new URL(buildAuthUrl('https://cohhieggibbcifgenjclmjainpljkefh.chromiumapp.org/', 's1', true));
    expect(u.searchParams.get('client_id')).toBe(GOOGLE_CLIENT_ID);
    expect(u.searchParams.get('response_type')).toBe('token');
    expect(u.searchParams.get('prompt')).toBe('select_account');
    expect(u.searchParams.get('scope')).toContain('youtube.force-ssl');
    expect(new URL(buildAuthUrl('https://x/', 's', false)).searchParams.get('prompt')).toBe('none');
  });

  it('parses the redirect and checks state', () => {
    const t = parseAuthResponse('https://id.chromiumapp.org/#access_token=abc&expires_in=3600&scope=a%20b&state=s1', 's1', 0);
    expect(t).toEqual({ accessToken: 'abc', expiresAt: 3540_000, scopes: ['a', 'b'] });
    expect(() => parseAuthResponse('https://id.chromiumapp.org/#access_token=abc&state=evil', 's1')).toThrow(AuthError);
    expect(() => parseAuthResponse('https://id.chromiumapp.org/#error=access_denied&state=s1', 's1')).toThrowError(expect.objectContaining({ code: 'denied' }));
  });

  it('drops malformed stored channels', () => {
    const s = coerceGoogleState({ channels: [{ channelId: CH, title: 'A', thumbnail: 'javascript:x' }, { channelId: 'bad' }], activeChannelId: 'missing' });
    expect(s.channels).toHaveLength(1);
    expect(s.channels[0]!.thumbnail).toBeUndefined();
    expect(s.activeChannelId).toBe(CH);
  });
});

describe('writing to YouTube', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await db.resetDbForTests();
    indexedDB.deleteDatabase(db.DB_NAME);
    await fakeBrowser.storage.session.set({ googleTokens: { [CH]: { accessToken: 'tok', expiresAt: Date.now() + 3600_000, scopes: [] } } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps every writable snippet field', () => {
    const live = { title: 'a', description: 'd', tags: ['x'], categoryId: '27', defaultLanguage: 'fa', defaultAudioLanguage: 'fa', channelId: 'C', thumbnails: {} };
    expect(writableSnippet(live, { title: 'b', description: 'd2', tags: [] })).toEqual({ title: 'b', description: 'd2', tags: [], categoryId: '27', defaultLanguage: 'fa', defaultAudioLanguage: 'fa' });
  });

  it('re-reads the live snippet, writes the change and returns before/after', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method) return json({ items: [{ snippet: { title: 'آموزش فیگما', description: 'فیگما', tags: ['فیگما'], categoryId: '27' } }] });
      return json({ id: 'v1' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const op = { kind: 'replace' as const, find: 'فیگما', replace: 'Figma', matchCase: false, wholeWord: false, fields: ['title' as const, 'description' as const, 'tags' as const] };
    const r = await updateVideo(CH, 'v1', (cur) => applyBulk(cur, op));
    expect(r?.after).toEqual({ title: 'آموزش Figma', description: 'Figma', tags: ['Figma'] });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toContain('/videos?part=snippet');
    expect(init!.method).toBe('PUT');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init!.body as string).snippet.categoryId).toBe('27');
    expect((await loadUsage()).ytUnits).toBe(51);
  });

  it('writes nothing when the change makes no difference', async () => {
    const fetchMock = vi.fn(async () => json({ items: [{ snippet: { title: 't', description: '', categoryId: '1' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await updateVideo(CH, 'v1', (cur) => cur)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forgets an expired token on 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 401)));
    await expect(updateVideo(CH, 'v1', (c) => c)).rejects.toMatchObject({ code: 'expired' });
    expect(((await fakeBrowser.storage.session.get('googleTokens')).googleTokens as Record<string, unknown>)[CH]).toBeUndefined();
  });
});

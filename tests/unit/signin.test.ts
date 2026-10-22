// Persistent sign-in (D-020): PKCE, code-flow URL, server answers, encrypted refresh tokens, renewal through
// the sign-in server, fallback to the token flow, Reconnect all, sign-out and backups.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { channelsNeedingReconnect, getToken, GOOGLE_CLIENT_ID, loadAuthStatus, loadGoogleState, loadSignInServer, reconnect, reconnectAll, renewDue, saveSignInServer, SCOPES, signOut } from '../../src/integrations/google/auth';
import { buildCodeAuthUrl, createPkce, isSupabaseFunctionUrl, normalizeServerUrl, parseCodeResponse, parseServerResponse } from '../../src/integrations/google/codeFlow';
import { deleteRefreshToken, KEY_DB, loadRefreshToken, REFRESH_KEY, refreshChannelIds, resetKeyCache, saveRefreshToken } from '../../src/integrations/google/refreshStore';
import { collectSettings } from '../../src/features/settings/settingsBackup';

const A = 'UCaaaaaaaaaaaaaaaaaaaaaa'; // personal channel
const B = 'UCbbbbbbbbbbbbbbbbbbbbbb'; // Brand Account channel
const SUB_A = '111111111111111111111';
const SUB_B = '222222222222222222222';
const REDIRECT = 'https://cohhieggibbcifgenjclmjainpljkefh.chromiumapp.org/';
const SERVER = 'https://abcdefghijklmnop.supabase.co/functions/v1/google-token';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// RFC 7636 appendix B
const RFC_BYTES = [116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121];

describe('PKCE and the code-flow URL', () => {
  it('matches the RFC 7636 example and makes fresh verifiers', async () => {
    const p = await createPkce((b) => {
      b.set(RFC_BYTES);
      return b;
    });
    expect(p.verifier).toBe('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(p.challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    const a = await createPkce();
    const b = await createPkce();
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.verifier).not.toBe(b.verifier);
  });

  it('asks for a code, offline access, S256 and consent; chooser only without a known account', () => {
    const base = { clientId: GOOGLE_CLIENT_ID, scopes: SCOPES, redirectUri: REDIRECT, state: 'st', challenge: 'ch' };
    const first = new URL(buildCodeAuthUrl({ ...base, consent: true }));
    expect(Object.fromEntries(first.searchParams)).toMatchObject({
      response_type: 'code',
      access_type: 'offline',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      prompt: 'select_account consent',
      state: 'st',
      redirect_uri: REDIRECT,
      client_id: GOOGLE_CLIENT_ID,
    });
    expect(first.searchParams.get('login_hint')).toBeNull();
    const again = new URL(buildCodeAuthUrl({ ...base, consent: true, loginHint: SUB_B }));
    expect(again.searchParams.get('prompt')).toBe('consent');
    expect(again.searchParams.get('login_hint')).toBe(SUB_B);
    const has = new URL(buildCodeAuthUrl({ ...base, consent: false, loginHint: SUB_B }));
    expect(has.searchParams.get('prompt')).toBeNull();
    expect(first.searchParams.has('client_secret')).toBe(false);
  });

  it('reads the code and checks state', () => {
    expect(parseCodeResponse(`${REDIRECT}?state=s&code=4%2Fabc&scope=x`, 's')).toBe('4/abc');
    expect(() => parseCodeResponse(`${REDIRECT}?state=other&code=c`, 's')).toThrow(expect.objectContaining({ code: 'state-mismatch' }));
    expect(() => parseCodeResponse(`${REDIRECT}?error=access_denied&state=s`, 's')).toThrow(expect.objectContaining({ code: 'denied' }));
    expect(() => parseCodeResponse(`${REDIRECT}?state=s`, 's')).toThrow(expect.objectContaining({ code: 'expired' }));
  });
});

describe('sign-in server URL and answers', () => {
  it('accepts https URLs only and recognises the Supabase shape', () => {
    expect(normalizeServerUrl(` ${SERVER}/ `)).toBe(SERVER);
    expect(isSupabaseFunctionUrl(SERVER)).toBe(true);
    expect(normalizeServerUrl('https://tokens.example.com/x')).toBe('https://tokens.example.com/x');
    expect(isSupabaseFunctionUrl('https://tokens.example.com/x')).toBe(false);
    for (const bad of ['http://x.supabase.co/f', 'https://user:pw@x.com/f', 'https://x.com/f?k=1', 'https://x.com/f#a', 'ftp://x.com', 'not a url', 'https://localhost/f']) expect(normalizeServerUrl(bad), bad).toBeNull();
  });

  it('parses tokens and maps errors: invalid_grant → reconnect, 5xx → retry, setup → server', () => {
    expect(parseServerResponse(200, { access_token: 'at', expires_in: 3599, scope: 'a b', refresh_token: 'rt' })).toEqual({ accessToken: 'at', expiresIn: 3599, scopes: ['a', 'b'], refreshToken: 'rt' });
    expect(parseServerResponse(200, { access_token: 'at' })).toEqual({ accessToken: 'at', expiresIn: 3600, scopes: [] });
    expect(() => parseServerResponse(400, { error: 'invalid_grant' })).toThrow(expect.objectContaining({ code: 'expired', detail: 'invalid_grant' }));
    expect(() => parseServerResponse(502, { error: 'upstream_unreachable' })).toThrow(expect.objectContaining({ code: 'network' }));
    expect(() => parseServerResponse(429, null)).toThrow(expect.objectContaining({ code: 'network', detail: 'http_429' }));
    expect(() => parseServerResponse(500, { error: 'server_misconfigured' })).toThrow(expect.objectContaining({ code: 'server' }));
    expect(() => parseServerResponse(403, { error: 'origin_not_allowed' })).toThrow(expect.objectContaining({ code: 'server', detail: 'origin_not_allowed' }));
    expect(() => parseServerResponse(404, '<html>')).toThrow(expect.objectContaining({ code: 'server', detail: 'http_404' }));
    expect(() => parseServerResponse(200, { error: 'Some <b>long</b> text' })).toThrow(expect.objectContaining({ code: 'server', detail: 'http_200' }));
  });

  it('saves only valid server URLs', async () => {
    await saveSignInServer(`${SERVER}/`);
    expect(await loadSignInServer()).toBe(SERVER);
    await expect(saveSignInServer('http://x.com')).rejects.toMatchObject({ code: 'server' });
    await saveSignInServer('');
    expect(await loadSignInServer()).toBe('');
  });
});

describe('encrypted refresh tokens', () => {
  it('round-trips, never stores the token in clear and binds each entry to its channel', async () => {
    await saveRefreshToken(A, '1//secret-refresh-A');
    expect(await loadRefreshToken(A)).toBe('1//secret-refresh-A');
    const raw = JSON.stringify((await fakeBrowser.storage.local.get(REFRESH_KEY))[REFRESH_KEY]);
    expect(raw).not.toContain('secret-refresh');
    expect(await refreshChannelIds()).toEqual([A]);
    // An entry copied to another channel does not decrypt (channel id is authenticated data) and is dropped.
    const all = (await fakeBrowser.storage.local.get(REFRESH_KEY))[REFRESH_KEY] as Record<string, unknown>;
    await fakeBrowser.storage.local.set({ [REFRESH_KEY]: { ...all, [B]: all[A] } });
    expect(await loadRefreshToken(B)).toBeUndefined();
    expect(await refreshChannelIds()).toEqual([A]);
    await deleteRefreshToken(A);
    expect(await loadRefreshToken(A)).toBeUndefined();
  });

  it('uses a non-extractable key, and drops tokens when the key database is gone', async () => {
    await saveRefreshToken(A, 'rt-A');
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(KEY_DB);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const key = await new Promise<CryptoKey>((res) => {
      const g = db.transaction('keys').objectStore('keys').get('google-refresh');
      g.onsuccess = () => res(g.result as CryptoKey);
    });
    db.close();
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    await resetKeyCache();
    await new Promise<void>((res) => {
      const d = indexedDB.deleteDatabase(KEY_DB);
      d.onsuccess = () => res();
    });
    expect(await loadRefreshToken(A)).toBeUndefined();
    expect(await refreshChannelIds()).toEqual([]);
  });
});

// ---- the flows, against a fake Google and a fake sign-in server ----
interface ServerCall {
  action: string;
  [k: string]: string;
}
function fakeWorld(opts: { refresh?: 'ok' | 'invalid_grant' | 'down' | 'misconfigured'; codeSub?: string; silentFails?: boolean } = {}) {
  const server: ServerCall[] = [];
  const flows: URL[] = [];
  const flow = vi.fn(async (d: { url: string; interactive?: boolean }) => {
    const u = new URL(d.url);
    flows.push(u);
    const state = u.searchParams.get('state');
    const hint = u.searchParams.get('login_hint') ?? opts.codeSub ?? SUB_A;
    if (u.searchParams.get('response_type') === 'code') return `${REDIRECT}?state=${state}&code=code-${hint}`;
    if (!d.interactive && opts.silentFails) return `${REDIRECT}#error=interaction_required&state=${state}`;
    return `${REDIRECT}#access_token=tok-${hint}&expires_in=3600&scope=x&state=${state}`;
  });
  (fakeBrowser.identity as unknown as Record<string, unknown>).launchWebAuthFlow = flow;
  (fakeBrowser.identity as unknown as Record<string, unknown>).getRedirectURL = () => REDIRECT;
  (fakeBrowser.permissions as unknown as Record<string, unknown>).request = async () => true;
  (fakeBrowser.permissions as unknown as Record<string, unknown>).contains = async () => true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === SERVER) {
        const body = JSON.parse(String(init?.body)) as ServerCall;
        server.push(body);
        if (body.action === 'exchange') {
          const sub = body.code!.replace('code-', '');
          return json({ access_token: `tok-${sub}`, expires_in: 3599, scope: SCOPES.join(' '), refresh_token: `rt-${sub}` });
        }
        if (body.action === 'refresh') {
          if (opts.refresh === 'invalid_grant') return json({ error: 'invalid_grant' }, 400);
          if (opts.refresh === 'down') throw new TypeError('Failed to fetch');
          if (opts.refresh === 'misconfigured') return json({ error: 'server_misconfigured' }, 500);
          return json({ access_token: `tok-${body.refresh_token!.replace('rt-', '')}`, expires_in: 3599, scope: 'x' });
        }
        return json({ revoked: true });
      }
      const u = new URL(url);
      if (u.pathname.includes('tokeninfo')) return json({ aud: GOOGLE_CLIENT_ID, sub: (u.searchParams.get('access_token') ?? '').replace('tok-', '') });
      if (u.pathname.includes('/revoke')) return new Response('');
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? '';
      const id = auth.replace('Bearer tok-', '') === SUB_B ? B : A;
      return json({ items: [{ id, snippet: { title: id === B ? 'Brand' : 'Personal', customUrl: '@x' }, contentDetails: { relatedPlaylists: { uploads: `UU${id.slice(2)}` } } }] });
    }),
  );
  return { server, flows, flow };
}

const channels = () => ({
  google: {
    channels: [
      { channelId: A, title: 'Personal', handle: '@a', connectedAt: '2026-10-01', sub: SUB_A },
      { channelId: B, title: 'Brand', handle: '@b', connectedAt: '2026-10-01', sub: SUB_B },
    ],
    activeChannelId: B,
  },
});

describe('staying signed in with the sign-in server', () => {
  beforeEach(async () => {
    await fakeBrowser.storage.local.set(channels());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reconnect uses the code flow with consent, stores the Brand channel’s refresh token encrypted', async () => {
    await saveSignInServer(SERVER);
    const w = fakeWorld();
    const ch = await reconnect(B);
    expect(ch.channelId).toBe(B);
    const u = w.flows[0]!;
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('login_hint')).toBe(SUB_B);
    expect(w.server[0]).toMatchObject({ action: 'exchange', code: `code-${SUB_B}`, redirect_uri: REDIRECT });
    expect(w.server[0]!.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await loadRefreshToken(B)).toBe(`rt-${SUB_B}`);
    expect(await refreshChannelIds()).toEqual([B]);
  });

  it('after a browser restart renews through the server with no Google window', async () => {
    await saveSignInServer(SERVER);
    await saveRefreshToken(A, `rt-${SUB_A}`);
    await saveRefreshToken(B, `rt-${SUB_B}`);
    const w = fakeWorld({ silentFails: true }); // the token flow would fail, as on the owner's Edge
    await renewDue();
    expect(w.flow).not.toHaveBeenCalled();
    expect(w.server.map((c) => c.action)).toEqual(['refresh', 'refresh']);
    expect(await getToken(B)).toBe(`tok-${SUB_B}`);
    expect(await getToken(A)).toBe(`tok-${SUB_A}`);
    expect(await channelsNeedingReconnect()).toEqual([]);
  });

  it('invalid_grant drops the refresh token and marks only that channel for Reconnect', async () => {
    await saveSignInServer(SERVER);
    await saveRefreshToken(B, `rt-${SUB_B}`);
    fakeWorld({ refresh: 'invalid_grant' });
    await expect(getToken(B)).rejects.toMatchObject({ code: 'expired', channelId: B });
    expect(await channelsNeedingReconnect()).toEqual([B]);
    expect((await loadAuthStatus())[B]).toMatchObject({ reconnect: true, code: 'invalid_grant' });
    expect(await loadRefreshToken(B)).toBeUndefined();
  });

  it('a network failure keeps the refresh token, is retried later and records the code', async () => {
    await saveSignInServer(SERVER);
    await saveRefreshToken(B, `rt-${SUB_B}`);
    fakeWorld({ refresh: 'down' });
    await expect(getToken(B)).rejects.toMatchObject({ code: 'network', channelId: B });
    expect(await channelsNeedingReconnect()).toEqual([]);
    expect((await loadAuthStatus())[B]).toMatchObject({ reconnect: false, code: 'network' });
    expect(await loadRefreshToken(B)).toBe(`rt-${SUB_B}`);
    fakeWorld({ refresh: 'ok' });
    expect(await getToken(B)).toBe(`tok-${SUB_B}`);
    expect((await loadAuthStatus())[B]).toBeUndefined();
  });

  it('a misconfigured server asks for attention but keeps the refresh token', async () => {
    await saveSignInServer(SERVER);
    await saveRefreshToken(B, `rt-${SUB_B}`);
    fakeWorld({ refresh: 'misconfigured' });
    await expect(getToken(B)).rejects.toMatchObject({ code: 'server' });
    expect((await loadAuthStatus())[B]).toMatchObject({ reconnect: true, code: 'server_misconfigured' });
    expect(await loadRefreshToken(B)).toBe(`rt-${SUB_B}`);
  });

  it('without a server URL the token flow stays as before, even if a refresh token exists', async () => {
    await saveRefreshToken(B, `rt-${SUB_B}`);
    const w = fakeWorld();
    expect(await getToken(B)).toBe(`tok-${SUB_B}`);
    expect(w.server).toEqual([]);
    expect(w.flows[0]!.searchParams.get('response_type')).toBe('token');
    expect(w.flows[0]!.searchParams.get('prompt')).toBe('none');
    // Interactive too.
    const r = fakeWorld();
    await reconnect(A);
    expect(r.flows[0]!.searchParams.get('response_type')).toBe('token');
  });

  it('with a server but no refresh token yet, silent renewal still uses the token flow', async () => {
    await saveSignInServer(SERVER);
    const w = fakeWorld();
    expect(await getToken(A)).toBe(`tok-${SUB_A}`);
    expect(w.server).toEqual([]);
    expect(w.flows[0]!.searchParams.get('prompt')).toBe('none');
  });

  it('keeps the channel check: a refresh token answering for another channel marks Reconnect', async () => {
    await saveSignInServer(SERVER);
    await saveRefreshToken(B, `rt-${SUB_A}`); // wrong identity behind B's token
    fakeWorld();
    await expect(getToken(B)).rejects.toMatchObject({ code: 'expired', channelId: B });
    expect((await loadAuthStatus())[B]).toMatchObject({ reconnect: true, code: 'wrong-channel' });
  });

  it('Reconnect all goes through each channel in turn from one click and stops when the window is closed', async () => {
    await saveSignInServer(SERVER);
    let perm = 0;
    const w = fakeWorld();
    (fakeBrowser.permissions as unknown as Record<string, unknown>).request = async () => (perm++, true);
    const r = await reconnectAll([A, B]);
    expect(r.ok.map((c) => c.channelId)).toEqual([A, B]);
    expect(perm).toBe(1);
    expect(w.flows.map((u) => u.searchParams.get('login_hint'))).toEqual([SUB_A, SUB_B]);
    expect((await refreshChannelIds()).sort()).toEqual([A, B]);
    // Closing Google's window on the first channel stops the run.
    (fakeBrowser.identity as unknown as Record<string, unknown>).launchWebAuthFlow = vi.fn(async () => {
      throw new Error('The user did not approve access.');
    });
    const stop = await reconnectAll([A, B]);
    expect(stop.failed).toHaveLength(1);
    expect(stop.failed[0]!.error).toMatchObject({ code: 'canceled' });
  });

  it('disconnecting deletes and revokes the refresh token; backups never contain it', async () => {
    await saveSignInServer(SERVER);
    await saveRefreshToken(B, `rt-${SUB_B}`);
    const w = fakeWorld();
    const backup = JSON.stringify(await collectSettings({ includeAiKey: true, includeYtKey: true }));
    expect(backup).not.toContain('rt-');
    expect(backup).not.toContain(REFRESH_KEY);
    await signOut(B);
    await vi.waitFor(() => expect(w.server).toContainEqual({ action: 'revoke', token: `rt-${SUB_B}` }));
    expect(await loadRefreshToken(B)).toBeUndefined();
    expect((await loadGoogleState()).channels.map((c) => c.channelId)).toEqual([A]);
  });
});

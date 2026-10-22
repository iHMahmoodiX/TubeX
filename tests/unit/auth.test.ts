import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  AUTH_ALARM,
  buildAuthUrl,
  channelsNeedingReconnect,
  channelsToRenew,
  coerceGoogleState,
  getToken,
  GOOGLE_CLIENT_ID,
  loadGoogleState,
  mergeChannels,
  nextRenewalAt,
  reconnect,
  renewDue,
  RENEW_MARGIN_MS,
  tokenSubject,
} from '../../src/integrations/google/auth';

const A = 'UCaaaaaaaaaaaaaaaaaaaaaa'; // personal channel
const B = 'UCbbbbbbbbbbbbbbbbbbbbbb'; // Brand Account channel
const SUB_A = '111111111111111111111';
const SUB_B = '222222222222222222222';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const REDIRECT = 'https://cohhieggibbcifgenjclmjainpljkefh.chromiumapp.org/';

/** Fake Google: the token flow answers per login_hint; tokeninfo and channels.list answer per token. */
function fakeGoogle(opts: { silentFails?: boolean; defaultSub?: string } = {}) {
  const calls: URL[] = [];
  const flow = vi.fn(async (d: { url: string; interactive?: boolean }) => {
    const u = new URL(d.url);
    calls.push(u);
    const hint = u.searchParams.get('login_hint') ?? opts.defaultSub ?? SUB_A;
    if (!d.interactive && opts.silentFails) return `${REDIRECT}#error=interaction_required&state=${u.searchParams.get('state')}`;
    return `${REDIRECT}#access_token=tok-${hint}&expires_in=3600&scope=x&state=${u.searchParams.get('state')}`;
  });
  (fakeBrowser.identity as unknown as Record<string, unknown>).launchWebAuthFlow = flow;
  (fakeBrowser.identity as unknown as Record<string, unknown>).getRedirectURL = () => REDIRECT;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (u.pathname.includes('tokeninfo')) {
        const tok = u.searchParams.get('access_token') ?? '';
        return json({ aud: GOOGLE_CLIENT_ID, sub: tok.replace('tok-', ''), scope: 'x' });
      }
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? '';
      const sub = auth.replace('Bearer tok-', '');
      const id = sub === SUB_B ? B : A;
      return json({ items: [{ id, snippet: { title: id === B ? 'Brand' : 'Personal', customUrl: '@x' }, contentDetails: { relatedPlaylists: { uploads: `UU${id.slice(2)}` } } }] });
    }),
  );
  return { flow, calls };
}

beforeEach(() => {
  fakeBrowser.reset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('auth URL', () => {
  it('silent renewal sends prompt=none and the account hint', () => {
    const u = new URL(buildAuthUrl(REDIRECT, 's', { interactive: false, loginHint: SUB_B }));
    expect(u.searchParams.get('prompt')).toBe('none');
    expect(u.searchParams.get('login_hint')).toBe(SUB_B);
  });
  it('reconnect pre-selects the account without the chooser; first sign-in shows the chooser', () => {
    const r = new URL(buildAuthUrl(REDIRECT, 's', { interactive: true, loginHint: SUB_B }));
    expect(r.searchParams.get('prompt')).toBeNull();
    expect(r.searchParams.get('login_hint')).toBe(SUB_B);
    const f = new URL(buildAuthUrl(REDIRECT, 's', { interactive: true }));
    expect(f.searchParams.get('prompt')).toBe('select_account');
    expect(f.searchParams.get('login_hint')).toBeNull();
  });
});

describe('token subject', () => {
  it('reads sub and refuses tokens issued to another app', async () => {
    expect(await tokenSubject('t', (async () => json({ aud: GOOGLE_CLIENT_ID, sub: SUB_A })) as unknown as typeof fetch)).toBe(SUB_A);
    await expect(tokenSubject('t', (async () => json({ aud: 'other-app', sub: SUB_A })) as unknown as typeof fetch)).rejects.toMatchObject({ code: 'state-mismatch' });
    expect(await tokenSubject('t', (async () => { throw new Error('offline'); }) as unknown as typeof fetch)).toBeUndefined();
  });
});

describe('renewal planning', () => {
  const tok = (ms: number) => ({ accessToken: 'x', expiresAt: ms, scopes: [] });
  it('renews missing tokens and tokens inside the margin, not ones marked reconnect', () => {
    const now = 1_000_000_000;
    const all = { [A]: tok(now + RENEW_MARGIN_MS + 60_000), [B]: tok(now + 60_000) };
    expect(channelsToRenew(all, [A, B], {}, now)).toEqual([B]);
    expect(channelsToRenew({}, [A, B], {}, now)).toEqual([A, B]); // after a browser restart
    expect(channelsToRenew({}, [A, B], { [B]: { reconnect: true, at: '' } }, now)).toEqual([A]);
  });
  it('schedules the next renewal a few minutes before the earliest expiry', () => {
    const now = 1_000_000_000;
    expect(nextRenewalAt({ [A]: tok(now + 3_600_000), [B]: tok(now + 1_800_000) }, [A, B], now)).toBe(now + 1_800_000 - RENEW_MARGIN_MS);
    expect(nextRenewalAt({}, [A], now)).toBeUndefined();
    expect(nextRenewalAt({ [A]: tok(now) }, [A], now)).toBe(now + 30_000);
  });
});

describe('keeping channels signed in', () => {
  beforeEach(async () => {
    await fakeBrowser.storage.local.set({
      google: {
        channels: [
          { channelId: A, title: 'Personal', handle: '@a', connectedAt: '2026-10-01', sub: SUB_A },
          { channelId: B, title: 'Brand', handle: '@b', connectedAt: '2026-10-01', sub: SUB_B },
        ],
        activeChannelId: B,
      },
    });
  });

  it('renews a Brand Account channel silently with its own account hint (after a restart: no tokens)', async () => {
    const g = fakeGoogle();
    expect(await getToken(B)).toBe(`tok-${SUB_B}`);
    expect(g.calls[0]!.searchParams.get('login_hint')).toBe(SUB_B);
    expect(g.calls[0]!.searchParams.get('prompt')).toBe('none');
    expect(g.flow.mock.calls[0]![0]).toMatchObject({ interactive: false });
    // The second call uses the stored token.
    expect(await getToken(B)).toBe(`tok-${SUB_B}`);
    expect(g.flow).toHaveBeenCalledTimes(1);
  });

  it('renewDue renews every channel and schedules the next renewal alarm', async () => {
    fakeGoogle();
    await renewDue();
    const tokens = (await fakeBrowser.storage.session.get('googleTokens')).googleTokens as Record<string, { accessToken: string }>;
    expect(tokens[A]!.accessToken).toBe(`tok-${SUB_A}`);
    expect(tokens[B]!.accessToken).toBe(`tok-${SUB_B}`);
    expect(await fakeBrowser.alarms.get(AUTH_ALARM)).toBeTruthy();
    expect(await channelsNeedingReconnect()).toEqual([]);
  });

  it('keeps the channel check: a token for another channel is not used and the channel asks to reconnect', async () => {
    // A channel connected before 0.5.1 has no sub; Google's default identity (A) answers.
    await mergeChannels([]);
    const s = await loadGoogleState();
    await fakeBrowser.storage.local.set({ google: { ...s, channels: s.channels.map((c) => (c.channelId === B ? { ...c, sub: undefined } : c)) } });
    fakeGoogle({ defaultSub: SUB_A });
    await expect(getToken(B)).rejects.toMatchObject({ code: 'expired', channelId: B });
    expect(await channelsNeedingReconnect()).toEqual([B]);
    // The default identity's own token was still kept for channel A.
    const tokens = (await fakeBrowser.storage.session.get('googleTokens')).googleTokens as Record<string, unknown>;
    expect(tokens[A]).toBeTruthy();
    expect(tokens[B]).toBeUndefined();
  });

  it('marks "reconnect" when Google needs the owner, and one interactive click clears it', async () => {
    fakeGoogle({ silentFails: true });
    await expect(getToken(B)).rejects.toMatchObject({ code: 'expired' });
    expect(await channelsNeedingReconnect()).toEqual([B]);
    // renewDue skips it instead of retrying in a loop.
    const g = fakeGoogle({ silentFails: true });
    await renewDue();
    expect(g.calls.every((u) => u.searchParams.get('login_hint') !== SUB_B)).toBe(true);
    // Reconnect: interactive, pre-selected for the Brand Account.
    (fakeBrowser.permissions as unknown as Record<string, unknown>).request = async () => true;
    const r = fakeGoogle();
    const ch = await reconnect(B);
    expect(ch.channelId).toBe(B);
    expect(r.flow.mock.calls[0]![0]).toMatchObject({ interactive: true });
    expect(r.calls[0]!.searchParams.get('login_hint')).toBe(SUB_B);
    // B is fine again; A (also failed silently above, in renewDue) still asks for its own click.
    expect(await channelsNeedingReconnect()).toEqual([A]);
    expect(await getToken(B)).toBe(`tok-${SUB_B}`);
  });

  it('never adds a channel the owner did not connect during a silent renewal', async () => {
    await fakeBrowser.storage.local.set({ google: { channels: [{ channelId: B, title: 'Brand', handle: '@b', connectedAt: '', sub: SUB_B }], activeChannelId: B } });
    fakeGoogle({ defaultSub: SUB_A });
    // Simulate Google answering for the default identity despite the hint.
    (fakeBrowser.identity as unknown as Record<string, unknown>).launchWebAuthFlow = async (d: { url: string }) => `${REDIRECT}#access_token=tok-${SUB_A}&expires_in=3600&state=${new URL(d.url).searchParams.get('state')}`;
    await expect(getToken(B)).rejects.toMatchObject({ code: 'expired' });
    expect((await loadGoogleState()).channels.map((c) => c.channelId)).toEqual([B]);
  });

  it('stores the account sub per channel and restores channels from a backup without tokens', async () => {
    expect(coerceGoogleState({ channels: [{ channelId: A, sub: 'bad sub!' }] }).channels[0]!.sub).toBeUndefined();
    await fakeBrowser.storage.local.set({ google: { channels: [] } });
    expect(await mergeChannels([{ channelId: A, title: 'Personal', handle: '@a', connectedAt: '', sub: SUB_A }])).toBe(1);
    const s = await loadGoogleState();
    expect(s.channels[0]!.sub).toBe(SUB_A);
    expect(s.activeChannelId).toBe(A);
    expect((await fakeBrowser.storage.session.get('googleTokens')).googleTokens).toBeUndefined();
  });
});

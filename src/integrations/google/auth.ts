// Google sign-in for the owner's own channels, through chrome.identity.launchWebAuthFlow.
// Two ways to stay signed in:
// 1. With the owner's sign-in server (D-020): authorization code flow with PKCE; the server (a free Supabase
//    Edge Function he runs) holds the client secret, swaps the code for tokens and refreshes access tokens.
//    Each channel's refresh token is stored encrypted (refreshStore.ts), so renewal needs no window, also
//    after a browser restart.
// 2. Without it (D-018): the token flow; tokens are renewed silently with `login_hint=<sub>` and
//    `prompt=none`, which Google may refuse after a restart (then the channel shows "Reconnect").
// Access tokens live only in chrome.storage.session and are never logged, backed up or sent elsewhere.
// The client ID is public by design; there is never a client secret in the extension.
import { browser } from 'wxt/browser';
import { AuthError } from './authError';
import { buildCodeAuthUrl, createPkce, exchangeCode, normalizeServerUrl, parseCodeResponse, refreshAccessToken, revokeViaServer } from './codeFlow';
import { deleteRefreshToken, loadRefreshToken, saveRefreshToken } from './refreshStore';
export { AuthError, type AuthErrorCode } from './authError';

export const GOOGLE_CLIENT_ID = '49141970502-mffpqb3pg8mp9fu8knpetd4s6ej56ipr.apps.googleusercontent.com';
export const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  // Needed to change the owner's videos (bulk edit). Every write is previewed and confirmed in the UI.
  'https://www.googleapis.com/auth/youtube.force-ssl',
];
export const GOOGLE_ORIGINS = ['https://www.googleapis.com/*', 'https://youtubeanalytics.googleapis.com/*'];
/** Token info endpoints (documented). The first is covered by the www.googleapis.com host permission. */
const TOKENINFO = ['https://www.googleapis.com/oauth2/v3/tokeninfo', 'https://oauth2.googleapis.com/tokeninfo'];

/** Renew this long before a token expires. */
export const RENEW_MARGIN_MS = 5 * 60_000;
/** One-shot alarm for the next proactive renewal (rescheduled after every renewal). */
export const AUTH_ALARM = 'tubex-auth-renew';

export interface GoogleChannel {
  channelId: string;
  title: string;
  handle: string;
  thumbnail?: string;
  uploadsPlaylistId?: string;
  connectedAt: string;
  /** Google account id (OpenID `sub`) the channel's tokens belong to; used as login_hint. Not a secret. */
  sub?: string;
}
export interface GoogleState {
  channels: GoogleChannel[];
  activeChannelId?: string;
}
export interface Token {
  accessToken: string;
  expiresAt: number;
  scopes: string[];
}
/** Per-channel sign-in health, kept in session storage. */
export interface ChannelAuth {
  /** Silent renewal failed: the owner must click Reconnect. */
  reconnect: boolean;
  at: string;
  detail?: string;
  /** Short code of the last failed renewal (e.g. invalid_grant, interaction_required, network). */
  code?: string;
}

const STATE_KEY = 'google';
const TOKENS_KEY = 'googleTokens';
const STATUS_KEY = 'googleAuthStatus';
const SERVER_KEY = 'googleSignInServer';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const SUB_RE = /^[\w.-]{1,128}$/;

export function coerceGoogleChannel(c: unknown): GoogleChannel | null {
  if (!isObj(c) || typeof c.channelId !== 'string' || !/^UC[\w-]{22}$/.test(c.channelId)) return null;
  return {
    channelId: c.channelId,
    title: String(c.title ?? '').slice(0, 200),
    handle: String(c.handle ?? '').slice(0, 200),
    thumbnail: typeof c.thumbnail === 'string' && c.thumbnail.startsWith('https://') ? c.thumbnail : undefined,
    uploadsPlaylistId: typeof c.uploadsPlaylistId === 'string' && /^[\w-]{2,64}$/.test(c.uploadsPlaylistId) ? c.uploadsPlaylistId : undefined,
    connectedAt: String(c.connectedAt ?? '').slice(0, 40),
    sub: typeof c.sub === 'string' && SUB_RE.test(c.sub) ? c.sub : undefined,
  };
}

export function coerceGoogleState(raw: unknown): GoogleState {
  if (!isObj(raw) || !Array.isArray(raw.channels)) return { channels: [] };
  const channels = raw.channels.map(coerceGoogleChannel).filter((c): c is GoogleChannel => !!c);
  const active = typeof raw.activeChannelId === 'string' && channels.some((c) => c.channelId === raw.activeChannelId) ? raw.activeChannelId : channels[0]?.channelId;
  return { channels, activeChannelId: active };
}

export async function loadGoogleState(): Promise<GoogleState> {
  return coerceGoogleState((await browser.storage.local.get(STATE_KEY))[STATE_KEY]);
}
async function saveGoogleState(s: GoogleState): Promise<void> {
  await browser.storage.local.set({ [STATE_KEY]: s });
}
export function onGoogleStateChanged(cb: (s: GoogleState) => void): () => void {
  const l = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes[STATE_KEY]) cb(coerceGoogleState(changes[STATE_KEY].newValue));
  };
  browser.storage.onChanged.addListener(l);
  return () => browser.storage.onChanged.removeListener(l);
}
export async function setActiveChannel(channelId: string): Promise<void> {
  const s = await loadGoogleState();
  if (s.channels.some((c) => c.channelId === channelId)) await saveGoogleState({ ...s, activeChannelId: channelId });
}

// ---- sign-in server setting (storage.local; a URL, not a secret) ----
export async function loadSignInServer(): Promise<string> {
  const raw = (await browser.storage.local.get(SERVER_KEY))[SERVER_KEY];
  return typeof raw === 'string' ? (normalizeServerUrl(raw) ?? '') : '';
}
/** Saves the server URL ('' turns persistent sign-in off). Throws on an invalid URL. */
export async function saveSignInServer(url: string): Promise<string> {
  const clean = url.trim() ? normalizeServerUrl(url) : '';
  if (clean === null) throw new AuthError('server', 'bad_url');
  await browser.storage.local.set({ [SERVER_KEY]: clean });
  return clean;
}
export function onSignInServerChanged(cb: (url: string) => void): () => void {
  const l = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes[SERVER_KEY]) {
      const v = changes[SERVER_KEY].newValue;
      cb(typeof v === 'string' ? (normalizeServerUrl(v) ?? '') : '');
    }
  };
  browser.storage.onChanged.addListener(l);
  return () => browser.storage.onChanged.removeListener(l);
}

/**
 * Adds channels from a backup (no tokens). Existing channels keep their data; a missing `sub` is filled in.
 * Restored channels show "Reconnect" until their first renewal succeeds.
 */
export async function mergeChannels(list: GoogleChannel[]): Promise<number> {
  const s = await loadGoogleState();
  let added = 0;
  const channels = s.channels.map((c) => {
    const inc = list.find((x) => x.channelId === c.channelId);
    return inc && !c.sub && inc.sub ? { ...c, sub: inc.sub } : c;
  });
  for (const c of list) {
    if (channels.some((x) => x.channelId === c.channelId)) continue;
    channels.push(c);
    added++;
  }
  await saveGoogleState({ channels, activeChannelId: s.activeChannelId ?? channels[0]?.channelId });
  return added;
}

// ---- tokens (session storage) ----
async function tokens(): Promise<Record<string, Token>> {
  const raw = (await browser.storage.session.get(TOKENS_KEY))[TOKENS_KEY];
  return isObj(raw) ? (raw as Record<string, Token>) : {};
}
async function setToken(channelId: string, t: Token | null): Promise<void> {
  const all = await tokens();
  if (t) all[channelId] = t;
  else delete all[channelId];
  await browser.storage.session.set({ [TOKENS_KEY]: all });
}

// ---- sign-in health (session storage) ----
export async function loadAuthStatus(): Promise<Record<string, ChannelAuth>> {
  const raw = (await browser.storage.session.get(STATUS_KEY))[STATUS_KEY];
  return isObj(raw) ? (raw as Record<string, ChannelAuth>) : {};
}
async function setAuthStatus(channelId: string, st: ChannelAuth | null): Promise<void> {
  const all = await loadAuthStatus();
  if (st) all[channelId] = st;
  else if (!(channelId in all)) return;
  else delete all[channelId];
  await browser.storage.session.set({ [STATUS_KEY]: all });
}
export function onAuthStatusChanged(cb: (s: Record<string, ChannelAuth>) => void): () => void {
  const l = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'session' && changes[STATUS_KEY]) cb(isObj(changes[STATUS_KEY].newValue) ? (changes[STATUS_KEY].newValue as Record<string, ChannelAuth>) : {});
  };
  browser.storage.onChanged.addListener(l);
  return () => browser.storage.onChanged.removeListener(l);
}
/** Channel ids whose silent renewal failed in this browser session. */
export async function channelsNeedingReconnect(): Promise<string[]> {
  const st = await loadAuthStatus();
  return Object.entries(st)
    .filter(([, v]) => v?.reconnect)
    .map(([k]) => k);
}

// ---- the token flow ----
export interface FlowOptions {
  interactive: boolean;
  /** Google account id or email; pre-selects the account (documented `login_hint`). */
  loginHint?: string;
}

export function buildAuthUrl(redirectUri: string, state: string, opts: FlowOptions | boolean): string {
  const o: FlowOptions = typeof opts === 'boolean' ? { interactive: opts } : opts;
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'token');
  u.searchParams.set('scope', SCOPES.join(' '));
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('state', state);
  if (o.loginHint) u.searchParams.set('login_hint', o.loginHint);
  // Silent: never show UI. Interactive with a known account: let Google decide (usually no chooser, or the
  // account's own sign-in page). Interactive without one: the account and Brand Account (channel) chooser.
  if (!o.interactive) u.searchParams.set('prompt', 'none');
  else if (!o.loginHint) u.searchParams.set('prompt', 'select_account');
  return u.toString();
}

/** Parses the redirect URL fragment returned by Google's token flow. */
export function parseAuthResponse(responseUrl: string, expectedState: string, now = Date.now()): Token {
  const hash = new URL(responseUrl).hash.replace(/^#/, '');
  const p = new URLSearchParams(hash || new URL(responseUrl).search);
  const error = p.get('error');
  if (error) throw new AuthError(error === 'access_denied' ? 'denied' : 'expired', error);
  if (p.get('state') !== expectedState) throw new AuthError('state-mismatch');
  const accessToken = p.get('access_token');
  if (!accessToken) throw new AuthError('expired', 'no token');
  const expiresIn = Number(p.get('expires_in') ?? 3600);
  return { accessToken, expiresAt: now + Math.max(60, expiresIn - 60) * 1000, scopes: (p.get('scope') ?? '').split(' ').filter(Boolean) };
}

async function launch(url: string, interactive: boolean): Promise<string | undefined> {
  if (interactive) return browser.identity.launchWebAuthFlow({ url, interactive });
  // Google's prompt=none answer can pass through an intermediate page; let the hidden flow follow it
  // (Chrome/Edge 113+ options). Older builds reject unknown keys, so retry without them.
  try {
    return await browser.identity.launchWebAuthFlow({ url, interactive, abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: 20_000 } as Parameters<typeof browser.identity.launchWebAuthFlow>[0]);
  } catch (e) {
    if (/unexpected property|abortOnLoad|timeoutMs/i.test(e instanceof Error ? e.message : String(e))) return browser.identity.launchWebAuthFlow({ url, interactive });
    throw e;
  }
}

async function runFlow(opts: FlowOptions): Promise<Token> {
  const state = crypto.randomUUID();
  let responseUrl: string | undefined;
  try {
    responseUrl = await launch(buildAuthUrl(browser.identity.getRedirectURL(), state, opts), opts.interactive);
  } catch (e) {
    throw new AuthError(opts.interactive ? 'canceled' : 'expired', e instanceof Error ? e.message : String(e));
  }
  if (!responseUrl) throw new AuthError('canceled');
  return parseAuthResponse(responseUrl, state);
}

interface Grant {
  token: Token;
  refreshToken?: string;
}
const toToken = (accessToken: string, expiresIn: number, scopes: string[], now = Date.now()): Token => ({
  accessToken,
  expiresAt: now + Math.max(60, expiresIn - 60) * 1000,
  scopes,
});

/**
 * Interactive authorization code flow with PKCE, exchanged through the owner's sign-in server (D-020).
 * `consent` asks Google again so it issues a refresh token for this account.
 */
async function runCodeFlow(server: string, opts: { loginHint?: string; consent: boolean }): Promise<Grant> {
  const state = crypto.randomUUID();
  const pkce = await createPkce();
  const redirectUri = browser.identity.getRedirectURL();
  const url = buildCodeAuthUrl({ clientId: GOOGLE_CLIENT_ID, scopes: SCOPES, redirectUri, state, challenge: pkce.challenge, loginHint: opts.loginHint, consent: opts.consent });
  let responseUrl: string | undefined;
  try {
    responseUrl = await browser.identity.launchWebAuthFlow({ url, interactive: true });
  } catch (e) {
    throw new AuthError('canceled', e instanceof Error ? e.message : String(e));
  }
  if (!responseUrl) throw new AuthError('canceled');
  const code = parseCodeResponse(responseUrl, state);
  const t = await exchangeCode(server, code, pkce.verifier, redirectUri);
  return { token: toToken(t.accessToken, t.expiresIn, t.scopes), refreshToken: t.refreshToken };
}

/** Interactive sign-in: the code flow when a sign-in server is set, otherwise the token flow. */
async function interactiveGrant(opts: { loginHint?: string; channelId?: string }): Promise<Grant> {
  const server = await loadSignInServer();
  if (!server) return { token: await runFlow({ interactive: true, loginHint: opts.loginHint }) };
  const has = opts.channelId ? !!(await loadRefreshToken(opts.channelId).catch(() => undefined)) : false;
  return runCodeFlow(server, { loginHint: opts.loginHint, consent: !has });
}

/**
 * The Google account id behind an access token, after checking the token was issued to TubeX's client
 * (a token for another app is refused). Undefined when the endpoint cannot be reached; the flow still works,
 * only without a login_hint for the next renewal.
 */
export async function tokenSubject(accessToken: string, fetcher: typeof fetch = fetch): Promise<string | undefined> {
  for (const base of TOKENINFO) {
    let res: Response;
    try {
      res = await fetcher(`${base}?access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(10_000) });
    } catch {
      continue;
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !body) continue;
    const aud = body.aud ?? body.azp ?? body.audience ?? body.issued_to;
    if (aud !== undefined && aud !== GOOGLE_CLIENT_ID) throw new AuthError('state-mismatch', 'token audience');
    const sub = body.sub ?? body.user_id;
    return typeof sub === 'string' && SUB_RE.test(sub) ? sub : undefined;
  }
  return undefined;
}

async function fetchOwnChannel(t: Token): Promise<GoogleChannel> {
  let res: Response;
  try {
    res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true', {
      headers: { Authorization: `Bearer ${t.accessToken}` },
    });
  } catch (e) {
    throw new AuthError('network', e instanceof Error ? e.message : String(e));
  }
  const body = (await res.json().catch(() => null)) as { items?: Record<string, any>[] } | null;
  const item = body?.items?.[0];
  if (!res.ok || !item) throw new AuthError('no-channel', `${res.status}`);
  return {
    channelId: String(item.id),
    title: String(item.snippet?.title ?? ''),
    handle: String(item.snippet?.customUrl ?? ''),
    thumbnail: item.snippet?.thumbnails?.default?.url,
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads,
    connectedAt: new Date().toISOString(),
  };
}

/**
 * Stores a fresh token and the channel it belongs to (title, avatar and `sub` refreshed). Silent renewals pass
 * `allowNew: false`: a token for a channel the owner never connected is dropped, never added.
 */
async function adopt(t: Token, opts: { makeActive: boolean; allowNew: boolean; refreshToken?: string }): Promise<GoogleChannel> {
  const ch = await fetchOwnChannel(t);
  if (!opts.allowNew && !(await loadGoogleState()).channels.some((c) => c.channelId === ch.channelId)) return ch;
  const sub = await tokenSubject(t.accessToken).catch((e) => {
    if (e instanceof AuthError && e.code === 'state-mismatch') throw e;
    return undefined;
  });
  // The refresh token belongs to the identity Google signed in (a Brand Account has its own), which the
  // channel check above has just resolved to this channel.
  if (opts.refreshToken) await saveRefreshToken(ch.channelId, opts.refreshToken);
  await setToken(ch.channelId, t);
  await setAuthStatus(ch.channelId, null);
  const s = await loadGoogleState();
  const prev = s.channels.find((c) => c.channelId === ch.channelId);
  const next: GoogleChannel = { ...ch, connectedAt: prev?.connectedAt || ch.connectedAt, sub: sub ?? prev?.sub };
  const channels = prev ? s.channels.map((c) => (c.channelId === ch.channelId ? next : c)) : [...s.channels, next];
  await saveGoogleState({ channels, activeChannelId: opts.makeActive ? ch.channelId : (s.activeChannelId ?? ch.channelId) });
  await scheduleRenewal();
  return next;
}

/** Interactive sign-in from a click. Adds (or refreshes) the chosen channel and makes it active. */
export async function signIn(): Promise<GoogleChannel> {
  // Ask for API host access first, while the click still counts as a user gesture.
  const granted = await browser.permissions.request({ origins: GOOGLE_ORIGINS });
  if (!granted) throw new AuthError('permission');
  const g = await interactiveGrant({});
  return adopt(g.token, { makeActive: true, allowNew: true, refreshToken: g.refreshToken });
}

/**
 * One-click reconnect of a channel whose silent renewal failed: the interactive flow pre-selected for the
 * channel's Google account. `fromGesture` asks for the API host permission first (extension pages); the
 * background (called from an in-page button) can only check it.
 */
export async function reconnect(channelId: string, fromGesture = true): Promise<GoogleChannel> {
  const granted = fromGesture ? await browser.permissions.request({ origins: GOOGLE_ORIGINS }) : await browser.permissions.contains({ origins: GOOGLE_ORIGINS });
  if (!granted) throw new AuthError('permission', undefined, channelId);
  const s = await loadGoogleState();
  const known = s.channels.find((c) => c.channelId === channelId);
  const g = await interactiveGrant({ loginHint: known?.sub, channelId: known?.channelId });
  const got = await adopt(g.token, { makeActive: !known, allowNew: true, refreshToken: g.refreshToken });
  if (known && got.channelId !== channelId) throw new AuthError('wrong-channel', got.title, channelId);
  return got;
}

const inflight = new Map<string, Promise<string>>();

const SHORT_CODE = /^[a-z_]{1,40}$/;

/** A fresh token without UI: the refresh token through the sign-in server when there is one, else prompt=none. */
async function silentGrant(channelId: string, sub: string | undefined): Promise<Token> {
  const server = await loadSignInServer();
  const rt = server ? await loadRefreshToken(channelId).catch(() => undefined) : undefined;
  if (!server || !rt) return runFlow({ interactive: false, loginHint: sub });
  try {
    const t = await refreshAccessToken(server, rt);
    return toToken(t.accessToken, t.expiresIn, t.scopes);
  } catch (e) {
    // Revoked, expired (7 days while the Google app is in Testing) or password changed: the stored token is useless.
    if (e instanceof AuthError && e.detail === 'invalid_grant') await deleteRefreshToken(channelId);
    throw e;
  }
}

/**
 * Silent renewal for one channel (no UI). With a refresh token this also works right after a browser
 * restart. Without one it uses the channel's Google account as login_hint so Brand Account channels get
 * their own token instead of the default identity's. On an auth failure the channel is marked "reconnect";
 * network failures are recorded but not marked, so they are retried later.
 */
export function renewSilently(channelId: string): Promise<string> {
  const running = inflight.get(channelId);
  if (running) return running;
  const p = (async () => {
    const known = (await loadGoogleState()).channels.find((c) => c.channelId === channelId);
    try {
      const fresh = await silentGrant(channelId, known?.sub);
      const got = await adopt(fresh, { makeActive: false, allowNew: false });
      if (got.channelId === channelId) return fresh.accessToken;
      throw new AuthError('wrong-channel', got.title, channelId);
    } catch (e) {
      const err = e instanceof AuthError ? e : new AuthError('expired', e instanceof Error ? e.message : String(e));
      const code = err.detail && SHORT_CODE.test(err.detail) ? err.detail : err.code;
      const at = new Date().toISOString();
      if (err.code === 'network') {
        await setAuthStatus(channelId, { reconnect: false, at, code, detail: err.detail?.slice(0, 200) });
        throw new AuthError('network', err.detail, channelId);
      }
      await setAuthStatus(channelId, { reconnect: true, at, code, detail: err.detail?.slice(0, 200) });
      throw new AuthError(err.code === 'server' ? 'server' : 'expired', err.detail, channelId);
    }
  })().finally(() => inflight.delete(channelId));
  inflight.set(channelId, p);
  return p;
}

/**
 * Reconnects several channels one after another, from one click. Asks for the API host permission once
 * while the click still counts as a user gesture. Closing Google's window stops the run.
 */
export async function reconnectAll(channelIds: string[]): Promise<{ ok: GoogleChannel[]; failed: { channelId: string; error: unknown }[] }> {
  const granted = await browser.permissions.request({ origins: GOOGLE_ORIGINS });
  if (!granted) throw new AuthError('permission');
  const ok: GoogleChannel[] = [];
  const failed: { channelId: string; error: unknown }[] = [];
  for (const id of channelIds) {
    try {
      ok.push(await reconnect(id, false));
    } catch (error) {
      failed.push({ channelId: id, error });
      if (error instanceof AuthError && error.code === 'canceled') break;
    }
  }
  return { ok, failed };
}

/**
 * A valid access token for the channel. Renews silently when missing or about to expire; the channel check
 * stays, so a token for another channel of the same account is never used for this one.
 */
export async function getToken(channelId: string): Promise<string> {
  const t = (await tokens())[channelId];
  if (t && t.expiresAt > Date.now() + 30_000) return t.accessToken;
  return renewSilently(channelId);
}

/** When the next proactive renewal is due (ms epoch), or undefined when no channel has a token. */
export function nextRenewalAt(all: Record<string, Token>, channelIds: string[], now = Date.now()): number | undefined {
  const due = channelIds.map((id) => all[id]?.expiresAt).filter((x): x is number => typeof x === 'number');
  if (!due.length) return undefined;
  return Math.max(now + 30_000, Math.min(...due) - RENEW_MARGIN_MS);
}

/** Channels whose token is missing or expires within the margin, skipping ones already marked "reconnect". */
export function channelsToRenew(all: Record<string, Token>, channelIds: string[], status: Record<string, ChannelAuth>, now = Date.now()): string[] {
  return channelIds.filter((id) => !status[id]?.reconnect && !((all[id]?.expiresAt ?? 0) - RENEW_MARGIN_MS > now));
}

export async function scheduleRenewal(): Promise<void> {
  try {
    const at = nextRenewalAt(await tokens(), (await loadGoogleState()).channels.map((c) => c.channelId));
    if (at === undefined) await browser.alarms.clear(AUTH_ALARM);
    else await browser.alarms.create(AUTH_ALARM, { when: at });
  } catch {
    /* alarms unavailable in this context; the 15-minute tick renews as well */
  }
}

let renewing: Promise<void> | null = null;
/**
 * Background: renews every channel that needs it (after a browser restart, all of them), one at a time,
 * then schedules the next renewal. Safe to call often.
 */
export function renewDue(): Promise<void> {
  if (renewing) return renewing;
  renewing = (async () => {
    const ids = (await loadGoogleState()).channels.map((c) => c.channelId);
    for (const id of channelsToRenew(await tokens(), ids, await loadAuthStatus())) await renewSilently(id).catch(() => undefined);
    await scheduleRenewal();
  })().finally(() => {
    renewing = null;
  });
  return renewing;
}

export async function forgetToken(channelId: string): Promise<void> {
  await setToken(channelId, null);
}

/** Removes a channel from TubeX and revokes its token at Google (best effort). */
export async function signOut(channelId: string): Promise<void> {
  const t = (await tokens())[channelId];
  const rt = await loadRefreshToken(channelId).catch(() => undefined);
  const server = await loadSignInServer();
  await deleteRefreshToken(channelId).catch(() => undefined);
  await setToken(channelId, null);
  await setAuthStatus(channelId, null);
  // Revoking the refresh token ends the grant at Google; best effort, never blocks disconnecting.
  if (rt && server) void revokeViaServer(server, rt);
  if (t) void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.accessToken)}`, { method: 'POST', mode: 'no-cors' }).catch(() => undefined);
  const s = await loadGoogleState();
  const channels = s.channels.filter((c) => c.channelId !== channelId);
  await saveGoogleState({ channels, activeChannelId: channels[0]?.channelId });
  await scheduleRenewal();
}

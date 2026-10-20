// Google sign-in for the owner's own channels (OAuth 2.0 token flow through chrome.identity.launchWebAuthFlow).
// The client ID is public by design; there is no client secret in the extension. Access tokens live only in
// chrome.storage.session (cleared when the browser closes) and are never logged, backed up or sent elsewhere.
import { browser } from 'wxt/browser';

export const GOOGLE_CLIENT_ID = '49141970502-mffpqb3pg8mp9fu8knpetd4s6ej56ipr.apps.googleusercontent.com';
export const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  // Needed to change the owner's videos (bulk edit). Every write is previewed and confirmed in the UI.
  'https://www.googleapis.com/auth/youtube.force-ssl',
];
export const GOOGLE_ORIGINS = ['https://www.googleapis.com/*', 'https://youtubeanalytics.googleapis.com/*'];

export interface GoogleChannel {
  channelId: string;
  title: string;
  handle: string;
  thumbnail?: string;
  uploadsPlaylistId?: string;
  connectedAt: string;
}
export interface GoogleState {
  channels: GoogleChannel[];
  activeChannelId?: string;
}
interface Token {
  accessToken: string;
  expiresAt: number;
  scopes: string[];
}

export type AuthErrorCode = 'canceled' | 'denied' | 'permission' | 'state-mismatch' | 'no-channel' | 'expired' | 'network';
export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    public detail?: string,
  ) {
    super(code);
  }
}

const STATE_KEY = 'google';
const TOKENS_KEY = 'googleTokens';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function coerceGoogleState(raw: unknown): GoogleState {
  if (!isObj(raw) || !Array.isArray(raw.channels)) return { channels: [] };
  const channels = raw.channels
    .filter(isObj)
    .filter((c) => typeof c.channelId === 'string' && /^UC[\w-]{22}$/.test(c.channelId))
    .map((c) => ({
      channelId: c.channelId as string,
      title: String(c.title ?? '').slice(0, 200),
      handle: String(c.handle ?? '').slice(0, 200),
      thumbnail: typeof c.thumbnail === 'string' && c.thumbnail.startsWith('https://') ? c.thumbnail : undefined,
      uploadsPlaylistId: typeof c.uploadsPlaylistId === 'string' ? c.uploadsPlaylistId : undefined,
      connectedAt: String(c.connectedAt ?? ''),
    }));
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

export function buildAuthUrl(redirectUri: string, state: string, interactive: boolean): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'token');
  u.searchParams.set('scope', SCOPES.join(' '));
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('state', state);
  // select_account shows the account and Brand Account (channel) chooser.
  u.searchParams.set('prompt', interactive ? 'select_account' : 'none');
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

async function runFlow(interactive: boolean): Promise<Token> {
  const state = crypto.randomUUID();
  let responseUrl: string | undefined;
  try {
    responseUrl = await browser.identity.launchWebAuthFlow({ url: buildAuthUrl(browser.identity.getRedirectURL(), state, interactive), interactive });
  } catch (e) {
    throw new AuthError(interactive ? 'canceled' : 'expired', e instanceof Error ? e.message : String(e));
  }
  if (!responseUrl) throw new AuthError('canceled');
  return parseAuthResponse(responseUrl, state);
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

/** Interactive sign-in from a click. Adds (or refreshes) the chosen channel and makes it active. */
export async function signIn(): Promise<GoogleChannel> {
  // Ask for API host access first, while the click still counts as a user gesture.
  const granted = await browser.permissions.request({ origins: GOOGLE_ORIGINS });
  if (!granted) throw new AuthError('permission');
  const t = await runFlow(true);
  const ch = await fetchOwnChannel(t);
  await setToken(ch.channelId, t);
  const s = await loadGoogleState();
  await saveGoogleState({ channels: [...s.channels.filter((c) => c.channelId !== ch.channelId), ch], activeChannelId: ch.channelId });
  return ch;
}

/**
 * A valid access token for the channel. Tries a silent refresh when expired; the silent flow may return a
 * token for a different channel of the same account, so the channel is checked before the token is used.
 */
export async function getToken(channelId: string): Promise<string> {
  const t = (await tokens())[channelId];
  if (t && t.expiresAt > Date.now()) return t.accessToken;
  try {
    const fresh = await runFlow(false);
    const ch = await fetchOwnChannel(fresh);
    await setToken(ch.channelId, fresh);
    if (ch.channelId === channelId) return fresh.accessToken;
  } catch {
    /* fall through */
  }
  throw new AuthError('expired');
}

export async function forgetToken(channelId: string): Promise<void> {
  await setToken(channelId, null);
}

/** Removes a channel from TubeX and revokes its token at Google (best effort). */
export async function signOut(channelId: string): Promise<void> {
  const t = (await tokens())[channelId];
  await setToken(channelId, null);
  if (t) void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.accessToken)}`, { method: 'POST', mode: 'no-cors' }).catch(() => undefined);
  const s = await loadGoogleState();
  const channels = s.channels.filter((c) => c.channelId !== channelId);
  await saveGoogleState({ channels, activeChannelId: channels[0]?.channelId });
}

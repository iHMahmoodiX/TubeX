// Authorization code flow with PKCE for persistent sign-in (D-020). The extension builds the Google URL and
// the PKCE pair; the owner's own sign-in server (a Supabase Edge Function holding the client secret) swaps
// the code for tokens and later refreshes access tokens. No client secret ever lives in the extension.
// Pure helpers plus a small client for the server; storage of refresh tokens is in refreshStore.ts.
import { AuthError } from './authError';

const b64url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export interface Pkce {
  verifier: string;
  challenge: string;
}

/** RFC 7636: a 43–128 character verifier from 32 random bytes and its S256 challenge. */
export async function createPkce(random: (b: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): Promise<Pkce> {
  const verifier = b64url(random(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

export interface CodeFlowOptions {
  clientId: string;
  scopes: string[];
  redirectUri: string;
  state: string;
  challenge: string;
  /** Google account id of the channel; pre-selects the account. */
  loginHint?: string;
  /** Ask for consent so Google issues a refresh token (first connect of that account, or after a lost one). */
  consent: boolean;
}

export function buildCodeAuthUrl(o: CodeFlowOptions): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', o.clientId);
  u.searchParams.set('redirect_uri', o.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', o.scopes.join(' '));
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('state', o.state);
  u.searchParams.set('code_challenge', o.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  if (o.loginHint) u.searchParams.set('login_hint', o.loginHint);
  // Without a known account: the account and Brand Account (channel) chooser.
  const prompt = [o.loginHint ? '' : 'select_account', o.consent ? 'consent' : ''].filter(Boolean).join(' ');
  if (prompt) u.searchParams.set('prompt', prompt);
  return u.toString();
}

/** Reads `code` from Google's redirect (query string), checking `state`. */
export function parseCodeResponse(responseUrl: string, expectedState: string): string {
  const u = new URL(responseUrl);
  const p = new URLSearchParams(u.search || u.hash.replace(/^#/, ''));
  const error = p.get('error');
  if (error) throw new AuthError(error === 'access_denied' ? 'denied' : 'expired', error);
  if (p.get('state') !== expectedState) throw new AuthError('state-mismatch');
  const code = p.get('code');
  if (!code) throw new AuthError('expired', 'no code');
  return code;
}

// ---- sign-in server ----

/** Normalized server URL, or null when it is not an acceptable https URL. */
export function normalizeServerUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || s.length > 300) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || !u.hostname.includes('.')) return null;
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

/** True for the expected Supabase shape (https://<ref>.supabase.co/functions/v1/google-token); other https URLs are allowed too. */
export function isSupabaseFunctionUrl(url: string): boolean {
  return /^https:\/\/[a-z0-9]{8,40}\.supabase\.co\/functions\/v1\/google-token$/.test(url);
}

export interface ServerTokens {
  accessToken: string;
  expiresIn: number;
  scopes: string[];
  refreshToken?: string;
}

const SAFE_CODE = /^[a-z_]{1,40}$/;

/**
 * Turns the server's answer into tokens or an AuthError:
 * invalid_grant → 'expired' (the owner must reconnect); 429/5xx → 'network' (retried later);
 * anything else → 'server' (setup problem: URL, secrets, allowed origin). Only short codes are kept as detail.
 */
export function parseServerResponse(status: number, body: unknown): ServerTokens {
  const b = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const code = typeof b.error === 'string' && SAFE_CODE.test(b.error) ? b.error : `http_${status}`;
  if (status >= 200 && status < 300 && typeof b.access_token === 'string' && b.access_token) {
    const expiresIn = Number(b.expires_in);
    return {
      accessToken: b.access_token,
      expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
      scopes: typeof b.scope === 'string' ? b.scope.split(' ').filter(Boolean) : [],
      ...(typeof b.refresh_token === 'string' && b.refresh_token && { refreshToken: b.refresh_token }),
    };
  }
  if (code === 'invalid_grant') throw new AuthError('expired', 'invalid_grant');
  if (status === 429 || status >= 500) {
    if (code === 'server_misconfigured') throw new AuthError('server', code);
    throw new AuthError('network', code);
  }
  throw new AuthError('server', code);
}

async function callServer(serverUrl: string, payload: Record<string, string>, fetcher: typeof fetch): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    res = await fetcher(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new AuthError('network', e instanceof Error ? e.name : 'fetch');
  }
  return { status: res.status, body: await res.json().catch(() => null) };
}

export async function exchangeCode(serverUrl: string, code: string, verifier: string, redirectUri: string, fetcher: typeof fetch = fetch): Promise<ServerTokens> {
  const r = await callServer(serverUrl, { action: 'exchange', code, code_verifier: verifier, redirect_uri: redirectUri }, fetcher);
  return parseServerResponse(r.status, r.body);
}

export async function refreshAccessToken(serverUrl: string, refreshToken: string, fetcher: typeof fetch = fetch): Promise<ServerTokens> {
  const r = await callServer(serverUrl, { action: 'refresh', refresh_token: refreshToken }, fetcher);
  const t = parseServerResponse(r.status, r.body);
  // A refresh never rotates Google's refresh token; ignore one if a server sent it anyway.
  return { accessToken: t.accessToken, expiresIn: t.expiresIn, scopes: t.scopes };
}

/** Best effort; errors are swallowed (the token is deleted locally either way). */
export async function revokeViaServer(serverUrl: string, token: string, fetcher: typeof fetch = fetch): Promise<void> {
  await callServer(serverUrl, { action: 'revoke', token }, fetcher).catch(() => undefined);
}

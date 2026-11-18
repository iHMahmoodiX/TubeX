// TubeX sign-in server: a tiny token broker that holds the Google OAuth client secret so the extension never
// does (D-020). It exchanges an authorization code (with PKCE) for tokens, refreshes an access token from a
// refresh token, and revokes a token. It stores nothing and logs nothing: no bodies, codes or tokens.
// Pure module (no Deno globals) so it can be unit-tested with a fake fetch; index.ts wires it to Deno.serve.

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const DEFAULT_ALLOWED_ORIGINS = ['chrome-extension://cohhieggibbcifgenjclmjainpljkefh'];
/** Requests larger than this are refused before parsing. */
export const MAX_BODY_BYTES = 8 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;

export interface ServerEnv {
  clientId: string;
  clientSecret: string;
  /** Exact origins allowed to call (chrome-extension://<id>). */
  allowedOrigins: string[];
}

/** Error codes the server may return. Google's own descriptions are never passed through. */
export type ServerErrorCode =
  | 'method_not_allowed'
  | 'origin_not_allowed'
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'bad_request'
  | 'redirect_uri_not_allowed'
  | 'server_misconfigured'
  | 'invalid_grant'
  | 'invalid_scope'
  | 'unauthorized_client'
  | 'rate_limited'
  | 'upstream_error'
  | 'upstream_unreachable';

const EXT_ID_RE = /^chrome-extension:\/\/([a-p]{32})$/;
const CODE_RE = /^[\x21-\x7e]{1,2048}$/;
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
const TOKEN_RE = /^[\x21-\x7e]{1,4096}$/;

/** Reads the configuration from an env getter (Deno.env.get in production). */
export function readEnv(get: (k: string) => string | undefined): ServerEnv {
  const override = (get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => EXT_ID_RE.test(s));
  return {
    clientId: (get('GOOGLE_CLIENT_ID') ?? '').trim(),
    clientSecret: (get('GOOGLE_CLIENT_SECRET') ?? '').trim(),
    allowedOrigins: override.length ? override : DEFAULT_ALLOWED_ORIGINS,
  };
}

/** The only redirect URIs accepted: https://<extension id>.chromiumapp.org/ for each allowed extension. */
export function allowedRedirects(origins: string[]): string[] {
  return origins.map((o) => EXT_ID_RE.exec(o)?.[1]).filter((id): id is string => !!id).map((id) => `https://${id}.chromiumapp.org/`);
}

function cors(origin: string | null, env: ServerEnv): Record<string, string> {
  if (!origin || !env.allowedOrigins.includes(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function reply(status: number, body: Record<string, unknown> | null, headers: Record<string, string>): Response {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: { ...headers, ...(body && { 'Content-Type': 'application/json; charset=utf-8' }), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
const fail = (status: number, error: ServerErrorCode, h: Record<string, string>) => reply(status, { error }, h);

/** Maps Google's token-endpoint error to a sanitized code and status. */
export function mapGoogleError(status: number, error: unknown): { status: number; error: ServerErrorCode } {
  switch (error) {
    case 'invalid_grant':
      return { status: 400, error: 'invalid_grant' };
    case 'invalid_scope':
      return { status: 400, error: 'invalid_scope' };
    case 'unauthorized_client':
      return { status: 400, error: 'unauthorized_client' };
    case 'invalid_client':
    case 'redirect_uri_mismatch':
      return { status: 500, error: 'server_misconfigured' };
    case 'invalid_request':
      return { status: 400, error: 'bad_request' };
  }
  if (status === 429) return { status: 429, error: 'rate_limited' };
  return { status: 502, error: 'upstream_error' };
}

async function readJson(req: Request): Promise<Record<string, unknown> | 'too_large' | null> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return 'too_large';
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return 'too_large';
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    buf.set(c, at);
    at += c.byteLength;
  }
  try {
    const v: unknown = JSON.parse(new TextDecoder().decode(buf));
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function postForm(fetcher: typeof fetch, url: string, form: Record<string, string>): Promise<Response | null> {
  try {
    return await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

/** Calls Google's token endpoint and returns only the fields the extension needs. */
async function tokenCall(fetcher: typeof fetch, form: Record<string, string>, withRefresh: boolean, h: Record<string, string>): Promise<Response> {
  const res = await postForm(fetcher, GOOGLE_TOKEN_URL, form);
  if (!res) return fail(502, 'upstream_unreachable', h);
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !body || typeof body.access_token !== 'string') {
    const m = mapGoogleError(res.status, body?.error);
    return fail(m.status, m.error, h);
  }
  const out: Record<string, unknown> = {
    access_token: body.access_token,
    expires_in: typeof body.expires_in === 'number' ? body.expires_in : Number(body.expires_in) || 3600,
    scope: typeof body.scope === 'string' ? body.scope : '',
  };
  if (withRefresh && typeof body.refresh_token === 'string') out.refresh_token = body.refresh_token;
  if (typeof body.id_token === 'string') out.id_token = body.id_token;
  return reply(200, out, h);
}

/**
 * Handles one request. `fetcher` is the global fetch in production and a fake in tests.
 * Only https://oauth2.googleapis.com/token and /revoke are ever called.
 */
export async function handle(req: Request, env: ServerEnv, fetcher: typeof fetch = fetch): Promise<Response> {
  const origin = req.headers.get('origin');
  const h = cors(origin, env);
  const originOk = !!origin && env.allowedOrigins.includes(origin);
  if (req.method === 'OPTIONS') return originOk ? reply(204, null, h) : fail(403, 'origin_not_allowed', h);
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', { ...h, Allow: 'POST, OPTIONS' });
  if (!originOk) return fail(403, 'origin_not_allowed', h);
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return fail(415, 'unsupported_media_type', h);
  if (!env.clientId || !env.clientSecret) return fail(500, 'server_misconfigured', h);

  const body = await readJson(req);
  if (body === 'too_large') return fail(413, 'payload_too_large', h);
  if (!body) return fail(400, 'bad_request', h);
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '');

  switch (body.action) {
    case 'exchange': {
      const code = str('code');
      const verifier = str('code_verifier');
      const redirect = str('redirect_uri');
      if (!CODE_RE.test(code) || !VERIFIER_RE.test(verifier)) return fail(400, 'bad_request', h);
      if (!allowedRedirects(env.allowedOrigins).includes(redirect)) return fail(400, 'redirect_uri_not_allowed', h);
      return tokenCall(
        fetcher,
        { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect, client_id: env.clientId, client_secret: env.clientSecret },
        true,
        h,
      );
    }
    case 'refresh': {
      const rt = str('refresh_token');
      if (!TOKEN_RE.test(rt)) return fail(400, 'bad_request', h);
      return tokenCall(fetcher, { grant_type: 'refresh_token', refresh_token: rt, client_id: env.clientId, client_secret: env.clientSecret }, false, h);
    }
    case 'revoke': {
      const token = str('token');
      if (!TOKEN_RE.test(token)) return fail(400, 'bad_request', h);
      const res = await postForm(fetcher, GOOGLE_REVOKE_URL, { token });
      if (!res) return fail(502, 'upstream_unreachable', h);
      // An already-invalid token counts as revoked.
      if (res.ok || res.status === 400) return reply(200, { revoked: true }, h);
      return fail(502, 'upstream_error', h);
    }
    default:
      return fail(400, 'bad_request', h);
  }
}

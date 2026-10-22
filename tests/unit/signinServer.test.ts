// The sign-in server (Supabase Edge Function) handler, run as plain TS with a fake fetch (D-020).
import { describe, expect, it, vi } from 'vitest';
import { allowedRedirects, DEFAULT_ALLOWED_ORIGINS, handle, MAX_BODY_BYTES, readEnv, type ServerEnv } from '../../server/supabase/functions/google-token/handler';

const ORIGIN = 'chrome-extension://cohhieggibbcifgenjclmjainpljkefh';
const REDIRECT = 'https://cohhieggibbcifgenjclmjainpljkefh.chromiumapp.org/';
const ENV: ServerEnv = { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'test-secret-value', allowedOrigins: DEFAULT_ALLOWED_ORIGINS };
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const URL_ = 'https://ref.supabase.co/functions/v1/google-token';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(URL_, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

function google(answer: () => Response | Promise<Response>) {
  const calls: { url: string; form: URLSearchParams }[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, form: new URLSearchParams(String(init?.body ?? '')) });
    return answer();
  });
  return { f: f as unknown as typeof fetch, calls };
}

describe('sign-in server: request checks', () => {
  it('answers the preflight only for the TubeX extension origin', async () => {
    const ok = await handle(new Request(URL_, { method: 'OPTIONS', headers: { Origin: ORIGIN } }), ENV);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const bad = await handle(new Request(URL_, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), ENV);
    expect(bad.status).toBe(403);
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('refuses other methods, other origins, non-JSON, big bodies and bad JSON', async () => {
    const g = google(() => json({}));
    expect((await handle(new Request(URL_, { method: 'GET', headers: { Origin: ORIGIN } }), ENV, g.f)).status).toBe(405);
    expect((await handle(post({ action: 'refresh', refresh_token: 'x' }, { Origin: 'https://evil.example' }), ENV, g.f)).status).toBe(403);
    expect((await handle(new Request(URL_, { method: 'POST', headers: { Origin: ORIGIN } }), ENV, g.f)).status).toBe(415);
    const big = await handle(post({ action: 'refresh', refresh_token: 'x'.repeat(MAX_BODY_BYTES) }), ENV, g.f);
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ error: 'payload_too_large' });
    expect((await handle(post('{nope'), ENV, g.f)).status).toBe(400);
    expect((await handle(post({ action: 'other' }), ENV, g.f)).status).toBe(400);
    expect(g.calls).toHaveLength(0);
  });

  it('says the server is misconfigured when the secret is missing, without calling Google', async () => {
    const g = google(() => json({}));
    const r = await handle(post({ action: 'refresh', refresh_token: 'rt' }), { ...ENV, clientSecret: '' }, g.f);
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: 'server_misconfigured' });
    expect(g.calls).toHaveLength(0);
  });

  it('reads env and lets ALLOWED_ORIGINS override the default; redirects follow the allowed extensions', () => {
    const env = readEnv((k) => ({ GOOGLE_CLIENT_ID: ' id ', GOOGLE_CLIENT_SECRET: 's', ALLOWED_ORIGINS: `${ORIGIN}, chrome-extension://abcdefghijklmnopabcdefghijklmnop, https://x.com` })[k]);
    expect(env.clientId).toBe('id');
    expect(env.allowedOrigins).toEqual([ORIGIN, 'chrome-extension://abcdefghijklmnopabcdefghijklmnop']);
    expect(readEnv(() => undefined).allowedOrigins).toEqual(DEFAULT_ALLOWED_ORIGINS);
    expect(allowedRedirects(DEFAULT_ALLOWED_ORIGINS)).toEqual([REDIRECT]);
  });
});

describe('sign-in server: Google calls', () => {
  it('exchanges a code with PKCE and returns only the needed fields', async () => {
    const g = google(() => json({ access_token: 'at', expires_in: 3599, scope: 's1 s2', refresh_token: 'rt', token_type: 'Bearer', id_token: 'idt', extra: 'x' }));
    const r = await handle(post({ action: 'exchange', code: '4/abc', code_verifier: VERIFIER, redirect_uri: REDIRECT }), ENV, g.f);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(await r.json()).toEqual({ access_token: 'at', expires_in: 3599, scope: 's1 s2', refresh_token: 'rt', id_token: 'idt' });
    expect(g.calls).toHaveLength(1);
    expect(g.calls[0]!.url).toBe('https://oauth2.googleapis.com/token');
    const f = g.calls[0]!.form;
    expect(Object.fromEntries(f)).toEqual({ grant_type: 'authorization_code', code: '4/abc', code_verifier: VERIFIER, redirect_uri: REDIRECT, client_id: ENV.clientId, client_secret: ENV.clientSecret });
  });

  it('refuses a foreign redirect URI or a malformed verifier', async () => {
    const g = google(() => json({ access_token: 'at' }));
    const r = await handle(post({ action: 'exchange', code: 'c', code_verifier: VERIFIER, redirect_uri: 'https://evil.example/' }), ENV, g.f);
    expect(await r.json()).toEqual({ error: 'redirect_uri_not_allowed' });
    expect((await handle(post({ action: 'exchange', code: 'c', code_verifier: 'short', redirect_uri: REDIRECT }), ENV, g.f)).status).toBe(400);
    expect(g.calls).toHaveLength(0);
  });

  it('refreshes without passing a refresh token back', async () => {
    const g = google(() => json({ access_token: 'at2', expires_in: 3600, scope: 's', refresh_token: 'rotated?' }));
    const r = await handle(post({ action: 'refresh', refresh_token: '1//rt' }), ENV, g.f);
    expect(await r.json()).toEqual({ access_token: 'at2', expires_in: 3600, scope: 's' });
    expect(g.calls[0]!.form.get('grant_type')).toBe('refresh_token');
    expect(g.calls[0]!.form.get('refresh_token')).toBe('1//rt');
  });

  it('sanitizes Google errors and never echoes descriptions', async () => {
    const cases: [Response, number, string][] = [
      [json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400), 400, 'invalid_grant'],
      [json({ error: 'invalid_client', error_description: 'secret wrong' }, 401), 500, 'server_misconfigured'],
      [json({ error: 'whatever' }, 503), 502, 'upstream_error'],
      [json({}, 429), 429, 'rate_limited'],
    ];
    for (const [res, status, error] of cases) {
      const r = await handle(post({ action: 'refresh', refresh_token: 'rt' }), ENV, google(() => res).f);
      expect(r.status).toBe(status);
      const text = await r.text();
      expect(JSON.parse(text)).toEqual({ error });
      expect(text).not.toMatch(/expired or revoked|secret/);
    }
    const down = await handle(post({ action: 'refresh', refresh_token: 'rt' }), ENV, (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch);
    expect(down.status).toBe(502);
    expect(await down.json()).toEqual({ error: 'upstream_unreachable' });
  });

  it('revokes a token at Google', async () => {
    const g = google(() => new Response('', { status: 200 }));
    const r = await handle(post({ action: 'revoke', token: 'rt' }), ENV, g.f);
    expect(await r.json()).toEqual({ revoked: true });
    expect(g.calls[0]!.url).toBe('https://oauth2.googleapis.com/revoke');
    expect(g.calls[0]!.form.get('token')).toBe('rt');
    expect(g.calls[0]!.form.get('client_secret')).toBeNull();
  });
});

# TubeX sign-in server (optional)

A tiny Supabase Edge Function that lets TubeX stay signed in to Google after browser restarts (decision D-020).
It holds the Google OAuth **client secret** so the extension never does, and it stores nothing.

- `supabase/functions/google-token/handler.ts`: the logic (pure TypeScript, unit-tested in `tests/unit/signinServer.test.ts`).
- `supabase/functions/google-token/index.ts`: the Deno entry (`Deno.serve`).

## What it does
`POST` JSON only, from the TubeX extension origin only (CORS + origin check):

| Request | Google call | Response |
|---|---|---|
| `{action:'exchange', code, code_verifier, redirect_uri}` | `oauth2.googleapis.com/token`, `grant_type=authorization_code` (PKCE) | `access_token`, `expires_in`, `scope`, `refresh_token`, `id_token` if present |
| `{action:'refresh', refresh_token}` | `oauth2.googleapis.com/token`, `grant_type=refresh_token` | `access_token`, `expires_in`, `scope` |
| `{action:'revoke', token}` | `oauth2.googleapis.com/revoke` | `{revoked:true}` |

Errors are short codes only (`invalid_grant`, `server_misconfigured`, `origin_not_allowed`, `upstream_unreachable`, …); Google's descriptions are never passed on. `redirect_uri` must be `https://cohhieggibbcifgenjclmjainpljkefh.chromiumapp.org/`. Bodies over 8 KB are refused. Nothing is logged.

Security note: the origin check stops other websites, not other programs (anyone can send any `Origin` header). That is acceptable because every action needs something only the owner's browser has: an authorization code plus its PKCE verifier, or a refresh token. The function only turns those into tokens for TubeX's own client.

## Deploy (free Supabase plan)
1. Create a Supabase project (free) at <https://supabase.com/dashboard>.
2. Install the Supabase CLI, then from this `server/` folder:
   ```sh
   supabase login
   supabase functions deploy google-token --no-verify-jwt --project-ref <project-ref>
   ```
   (`supabase/config.toml` here also sets `verify_jwt = false` for this function.) `--no-verify-jwt` is needed because the extension has no Supabase session; the function does its own checks.
3. In the Supabase Dashboard → Edge Functions → Secrets, add:
   - `GOOGLE_CLIENT_ID` = the Web application client ID TubeX uses (see `src/integrations/google/auth.ts`).
   - `GOOGLE_CLIENT_SECRET` = that client's secret (Google Cloud Console → APIs & Services → Credentials). Enter it only there; never commit it or paste it anywhere else.
   - Optional `ALLOWED_ORIGINS` = comma-separated `chrome-extension://<id>` origins, if a different extension ID must be allowed.
4. Google Cloud → OAuth consent screen → **Publish app** (In production). In Testing mode Google expires refresh tokens after 7 days. An unverified app is fine for personal use (Google shows a warning screen once per consent).
5. In TubeX → Settings → Google account and channels → "Sign-in server URL": `https://<project-ref>.supabase.co/functions/v1/google-token`, click **Save and allow**, then **Reconnect all**.

## Updating or removing
Redeploy with the same command. To stop using it, click **Turn off** in TubeX (channels fall back to the token flow) and delete the function in Supabase. Disconnecting a channel in TubeX revokes its refresh token through this function.

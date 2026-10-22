# Next

Updated 2026-10-22.

## State
- Current release `0.5.2`: find & replace on YouTube (owner's top priority, D-019), on top of 0.5.1 (f19adad).
- Unreleased on this branch (no version bump): persistent sign-in (D-020), from the owner's report that every channel shows `interaction_required` and needs Reconnect after each Edge restart.
- 0.4.0 = every buildable item of the owner's TubeBuddy list, first in-page tools, Spotify-inspired design (DESIGN.md, D-016).
- 0.5.0 = owner's TubeBuddy-parity issues #2–#7. Issues stay open until the owner confirms on live pages.
- 0.5.1 = fixes from the owner's live test (issue #8): Estedad font, Studio menu placement, tolerant chapters, Click Magnet via the Reporting API (D-017), silent renewal + Reconnect (D-018), backup format 2.
- Still deferred by the owner: End Screen/Card templates and bulk editors, Quick-Edit Toolbar, A/B Testing, Search Explorer, Channel Valuation, Channel Access.

## Persistent sign-in (D-020, this branch)
- Server source (not deployed): `server/supabase/functions/google-token/{handler.ts,index.ts}`, `server/supabase/config.toml`, `server/README.md`. Owner guide (Persian): `/mnt/project-files/guides/persistent-sign-in-fa.md`.
- Extension: `src/integrations/google/codeFlow.ts` (PKCE, code-flow URL, server client and answer parsing, URL validation), `refreshStore.ts` (AES-GCM, non-extractable key in IndexedDB `tubex-keys`, ciphertext in `storage.local.googleRefresh`), `authError.ts`; `auth.ts` (`loadSignInServer`/`saveSignInServer`, code flow for interactive sign-in when a server is set, refresh in `renewSilently`, `reconnectAll`, revoke on `signOut`, `ChannelAuth.code`).
- UI: Settings → Google account and channels (`SignInServerBlock`, per-channel `ChannelSignInState`, "Reconnect all"); `ReconnectBanner` has "Reconnect all". i18n `src/i18n/parts/signin.ts`.
- No manifest change: the server origin is requested at runtime under the existing optional `https://*/*`.

## Find & replace (0.5.2)
- UI `src/features/bulk/**` (BulkView: Find → Preview → Run; FindForm, LiveFilters, Preview, Diff, JobPanel, useBulk, bulk.css), i18n `src/i18n/parts/bulk.ts` (`fr.*`).
- Logic `src/domain/bulk.ts`; worker `src/background/jobs/bulk.ts` and `src/background/methods/bulk.ts`; `own.ts` (`ownVideos` reads localizations, `updateVideo` has `beforeWrite`).
- Owner must raise TubeX's daily unit cap to 10,000 (button in step 3, or Settings → YouTube Data API) for ~190 videos a day; 400 videos ≈ 20,400 units, finishing on day 3 while the browser is open.

## Area layout (in-page)
`src/inpage/studio/content/**`, `src/inpage/studio/tags/**`, `src/inpage/youtube/insights/**` + `ChannelStrip.tsx`, `src/inpage/launch/**` + `youtube/Videolytics.tsx`. Each area: `register…Islands(ctx)`, a drawer panel export, its own i18n part, RPC file (`src/background/methods/<area>.ts`), dom helper file with fixture tests. Drawer panels: no props, read the page, return null when not their page.

## Checks run (Linux, Chromium headless)
`npx tsc --noEmit -p .` pass · `npx vitest run` 486/486 · `npm run build` pass · `node tests/e2e/smoke.mjs` 16/16. Settings sign-in screens reviewed in fa/dark and en/light at 1280 and 360 px (no overflow). `tests/unit/channelInsightsMethods.test.ts` had a clock-dependent failure between ~17:00 and midnight UTC on the baseline too; the test now pins the clock.

## Not verified
Persistent sign-in live: the deployed function under Deno, Google's code exchange/refresh with the real client and secret, Brand Account refresh tokens on Edge, revoke, Supabase CLI deploy with this `config.toml`. Earlier: live `videos.update` writes, quota reasons, worker lifetime on long runs, YouTube/Studio selectors, Reporting calls. Windows, screen reader, 200% zoom.

## Next task
1. Owner approves; then (agent, with his approval) deploy `google-token` to his free Supabase project. He enters `GOOGLE_CLIENT_SECRET` (and `GOOGLE_CLIENT_ID`) himself in Supabase Dashboard → Edge Functions → Secrets, publishes the Google app (In production), pastes the function URL in TubeX Settings, clicks "Reconnect all", restarts Edge and reports whether every channel shows "Stays signed in" without a click.
2. From 0.5.2: "Test on 1 video first", then the rest of find & replace; report job-card screenshots if anything stops.
3. From 0.5.1: CTR collection and in-page tools on real pages; close issues #2–#7 as confirmed.

## Key paths
`entrypoints/workspace/App.tsx` routes · `src/features/*` · `src/inpage/**` · `src/integrations/google/{auth,codeFlow,refreshStore,own,ownWrites,kidsWrites}.ts` · `server/` · `src/domain/*` · `tests/unit/*`, `tests/e2e/*.mjs`.

# Next

Updated 2026-10-21.

## State
- Branch `claude/m0-m1-baseline-9rp5tg`, draft PR #1 to `main`. Version `0.4.0`.
- 0.4.0 = every buildable item of the owner's TubeBuddy list (25: 8 partial completed + 17 new), in-page tools on youtube.com and studio.youtube.com, and the owner's Spotify-inspired design language (DESIGN.md, D-016). See CHANGELOG 0.4.0 and FEATURE_MATRIX "Delivered in 0.4.0".
- Deferred by the owner ("decide later"): End Screen Templates, Card Templates, Bulk End Screen/Cards editors, Related Video Manager, Quick-Edit Toolbar, A/B Testing, Search Explorer, Channel Valuation, Channel Access.

## Architecture added in 0.4.0
Background worker (`entrypoints/background.ts`): RPC for content scripts (`src/platform/rpc.ts`, methods per area in `src/background/methods/*`), scheduler + 15-min tick (`src/background/scheduler.ts`, handlers in `src/background/jobs/*`), notifications. Work stores (IDB v3): jobs, trackers, snapshots, alerts (`src/storage/stores.ts`). In-page islands in shadow roots (`src/inpage/**`). i18n per area in `src/i18n/parts/*`.

## Checks run (Linux, Chromium 141 headless)
`npm run typecheck` pass · `npm test` 235/235 · `npm run build` pass · `npm run e2e` 16/16 · `npm run zip` pass. Screens reviewed with `tests/e2e/shots.mjs` and `tests/e2e/inpage-shots.mjs` (fixtures, mocked APIs).

## Not verified
Everything live: Google sign-in on Edge, Data/Analytics API calls and writes (comments, playlists, status, thumbnails, captions), CTR metrics availability, `setModerationStatus` with several ids, YouTube/Studio DOM selectors for in-page tools and Studio field filling (synthetic fixtures only), AI providers, background ticks and notifications over real time. Windows, screen reader, 200% zoom.

## Next task
1. Owner installs 0.4.0 on Edge, signs in, and reports what fails on real pages (most likely: in-page selectors and Studio field filling; send screenshots).
2. Fix against the live DOM and real API responses; then the owner decides about the 9 deferred features.

## Key paths
`entrypoints/workspace/App.tsx` routes · `src/features/{reports,research,ranks,competitors,comments,bulk,playlists,schedule,thumbs,shorts,alerts,mychannel}` · `src/inpage/{youtube,studio}` · `src/integrations/google/{auth,own,ownWrites}.ts` · `src/domain/*` pure logic · `tests/unit/*`, `tests/e2e/{smoke,shots,inpage-shots}.mjs`.

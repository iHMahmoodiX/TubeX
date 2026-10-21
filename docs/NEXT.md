# Next

Updated 2026-10-21.

## State
- Branch `claude/m0-m1-baseline-9rp5tg`, draft PR #1 to `main`. Version `0.5.1`.
- 0.4.0 = every buildable item of the owner's TubeBuddy list, first in-page tools, Spotify-inspired design (DESIGN.md, D-016).
- 0.5.0 = owner's TubeBuddy-parity issues #2–#7 (from his screenshots of TubeBuddy in YouTube/Studio): Studio Content menu and selection actions, related video for Shorts (Studio handoff), COPPA center (route `kids`), tag tools in Studio's Tags field, channel page Channelytics + Channel Insights, edge tab + top-bar launchers + TubeX drawer, watch-page Videolytics. See CHANGELOG 0.5.0.
- Decision (owner, #6): keep both launchers if cheap. Measured (`tests/e2e/launchers-perf.mjs`, mock watch page, median of 9): both launchers ≈ +6 ms scripting, +4 DOM nodes; Videolytics ≈ +10 ms, +230 nodes; first drawer open ≈ 62 ms. Both kept.
- Still deferred by the owner: End Screen/Card templates and bulk editors (shown disabled in the Studio menu), Quick-Edit Toolbar, A/B Testing, Search Explorer, Channel Valuation, Channel Access. Related Video Manager is now a Studio handoff for Shorts.
- Issues #2–#7 stay open until the owner confirms on live pages.
- 0.5.1 = fixes from the owner's live test (issue #8): Estedad font (public/fonts, document-level @font-face for islands), Studio menu overlay placement, page-read best practices + tolerant chapters, Click Magnet via the Reporting API (D-017), silent per-channel renewal + Reconnect (D-018), backup format 2. Channels connected before 0.5.1 need one Reconnect click each to store their account id.

## Area layout (in-page)
`src/inpage/studio/content/**` (Content page, related-video queue), `src/inpage/studio/tags/**` (Tags field), `src/inpage/youtube/insights/**` + `ChannelStrip.tsx` (channel page), `src/inpage/launch/**` + `youtube/Videolytics.tsx` (launchers, drawer). Each area: `register…Islands(ctx)`, a drawer panel export, its own i18n part, RPC file (`src/background/methods/<area>.ts`), dom helper file with fixture tests. Drawer panels contract: no props, read the page, return null when not their page.

## Checks run (Linux, Chromium 141 headless)
`npm run typecheck` pass · `npm test` 412/412 · `npm run build` pass (3.6 MB) · `npm run e2e` 16/16 · `npm run zip` pass. Screens reviewed with `tests/e2e/{studioContent,tagTools,channelInsights,launchers}-shots.mjs` on synthetic fixtures with mocked APIs.

## Not verified
Everything live: all YouTube/Studio selectors of the new tools (listed in each area's `dom.ts`), Studio field filling (tags, related video picker), Data/Analytics API calls and writes (incl. `selfDeclaredMadeForKids`), background ticks over real time, Google sign-in on Edge. Windows, screen reader, 200% zoom.

## Next task
1. Owner installs 0.5.1 on Edge (extract over the same folder, Reload), clicks Reconnect once per channel, starts CTR collection in Click Magnet, and reports what fails on real pages with screenshots (expected: selectors and Studio field filling).
2. Fix against the live DOM; close issues #2–#7 as each is confirmed; owner decides on the remaining deferred features.

## Key paths
`entrypoints/workspace/App.tsx` routes · `src/features/*` · `src/inpage/**` · `src/integrations/google/{auth,own,ownWrites,kidsWrites}.ts` · `src/domain/*` · `tests/unit/*`, `tests/e2e/*.mjs`.

# Next

Updated 2026-10-21.

## State
- Base `0.5.1` (f19adad). This branch adds find & replace on YouTube (owner's top priority, CHANGELOG "Unreleased", D-019); version not bumped.
- 0.4.0 = every buildable item of the owner's TubeBuddy list, first in-page tools, Spotify-inspired design (DESIGN.md, D-016).
- 0.5.0 = owner's TubeBuddy-parity issues #2–#7: Studio Content menu and selection actions, related video for Shorts, COPPA center, tag tools, Channelytics + Channel Insights, launchers + drawer, Videolytics. Issues stay open until the owner confirms on live pages.
- 0.5.1 = fixes from the owner's live test (issue #8): Estedad font, Studio menu placement, tolerant chapters, Click Magnet via the Reporting API (D-017), silent renewal + Reconnect (D-018), backup format 2.
- Still deferred by the owner: End Screen/Card templates and bulk editors, Quick-Edit Toolbar, A/B Testing, Search Explorer, Channel Valuation, Channel Access.

## Find & replace (this branch)
- UI `src/features/bulk/**` (BulkView: Find → Preview → Run; FindForm, LiveFilters, Preview, Diff, JobPanel, useBulk, bulk.css), i18n `src/i18n/parts/bulk.ts` (`fr.*`).
- Logic `src/domain/bulk.ts` (matching, operations, limits, diff, quota plan, job types; legacy exports kept for drafts/templates).
- Worker `src/background/jobs/bulk.ts` (runner, backoff, quota wait, recover, undo) and `src/background/methods/bulk.ts` (RPC validation). `own.ts`: `ownVideos` reads localizations, `updateVideo` has `beforeWrite`.
- Owner must raise TubeX's daily unit cap to 10,000 (button in step 3, or Settings → YouTube Data API) for ~190 videos a day; 400 videos ≈ 20,400 units, so it finishes on day 3 by itself while the browser is open.

## Area layout (in-page)
`src/inpage/studio/content/**` (Content page, related-video queue), `src/inpage/studio/tags/**` (Tags field), `src/inpage/youtube/insights/**` + `ChannelStrip.tsx` (channel page), `src/inpage/launch/**` + `youtube/Videolytics.tsx` (launchers, drawer). Each area: `register…Islands(ctx)`, a drawer panel export, its own i18n part, RPC file (`src/background/methods/<area>.ts`), dom helper file with fixture tests. Drawer panels contract: no props, read the page, return null when not their page.

## Checks run (Linux, Chromium headless)
`npx tsc --noEmit -p .` pass · `npx vitest run` 459/459 · `npm run build` pass · `npm run e2e` 16/16. Find & replace screens reviewed in fa/dark and en/light with `tests/e2e/bulk-shots.mjs` (in-memory Data API, real background job: quota wait, cap raise, finish, undo with one conflict kept; 420 px without overflow).

## Not verified
Everything live: real `videos.update` writes, exact `quotaExceeded`/`rateLimitExceeded` reasons from Google, service-worker lifetime during long runs and the next-day continuation on Edge, localizations reporting, Brand Account writes. Earlier: YouTube/Studio selectors of in-page tools, Studio field filling, Analytics/Reporting calls, Google sign-in on Edge. Windows, screen reader, 200% zoom.

## Next task
1. Owner installs this build on Edge, raises the daily cap to 10,000, runs "Test on 1 video first" on one old video, checks it in Studio, then runs the rest and reports (screenshots of the job card if anything stops).
2. From 0.5.1: owner clicks Reconnect once per channel, starts CTR collection, and reports failures on real pages; fix against the live DOM; close issues #2–#7 as confirmed.

## Key paths
`entrypoints/workspace/App.tsx` routes · `src/features/*` · `src/inpage/**` · `src/integrations/google/{auth,own,ownWrites,kidsWrites}.ts` · `src/domain/*` · `tests/unit/*`, `tests/e2e/*.mjs`.

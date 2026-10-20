# Next

Updated 2026-10-20.

## State
- Branch `claude/m0-m1-baseline-9rp5tg`, draft PR to `main`. Base was a single commit with a 7-byte README.
- M0 done with one gap: official vidIQ catalog (TubeBuddy list since supplied by owner and mapped) and Google docs were unreachable from the build environment. Matrix and API facts are marked secondary/Inferred.
- M1 delivered: side panel, popup, workspace; context detection; idea capture; drafts with autosave/recovery/conflicts; templates; local channel profiles; fa/en RTL; themes; backup export/import/undo. No Google, AI or YouTube writes.

## Checks run (Linux, Chromium 141 headless)
`npm run typecheck` pass · `npm test` 45/45 · `npm run build` pass · `npm run e2e` 14/14 · `npm run zip` pass (267 KB).

## Not verified
Windows build, Edge, live YouTube DOM selectors, screen reader, 200% zoom, measured contrast.

## Next task
1. Owner reviews M1 in Chrome/Edge on Windows (README → Install) and comments on copy, palette, fonts.
2. Owner picks the next milestone. Recommended: M2 read-only connection, which needs a Google Cloud project (OAuth client, test users) from the owner.
3. Before M2 code: verify INTEGRATIONS rows for auth, channels.list, quota; add manifest `key` for a stable ID.

## Key paths
`src/domain/*` rules · `src/storage/db.ts` data · `src/platform/pageContext.ts` + `youtubeDom.ts` detection · `src/features/drafts/DraftEditor.tsx` · `tests/e2e/smoke.mjs`.

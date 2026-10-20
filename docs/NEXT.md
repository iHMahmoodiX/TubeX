# Next

Updated 2026-10-20.

## State
- Branch `claude/m0-m1-baseline-9rp5tg`, draft PR #1 to `main`. Version `0.3.0`.
- 0.2.0 batch plus M2 core: Google sign-in (multi-channel, Brand Accounts), My Channel analytics and video list, bulk find/replace and tag edits on published videos with confirmation and undo (D-015). See CHANGELOG 0.3.0.
- Not built: posting/moderating comments, playlists, scheduled publish/update, thumbnails/end screens/cards in bulk, A/B tests, retention analyzer, best time to publish.

## Checks run (Linux, Chromium 141 headless)
`npm run typecheck` pass · `npm test` 82/82 · `npm run build` pass · `npm run e2e` 16/16 · `npm run zip` pass.

## Not verified
Live Google sign-in (`launchWebAuthFlow`) on Chrome and Edge, every live call (Analytics, `videos.update`, Gemini, Ollama, Data API; mocked in unit tests). Windows build, live YouTube DOM, screen reader, 200% zoom, measured contrast. Analytics metric/dimension combinations against real data. YouTube API derived-metrics policy check still open.

## Next task
1. Owner installs 0.3.0 on Edge, signs in with Google, adds each Brand channel, tries My Channel and a small live bulk edit (one video), and reports any error text.
2. Fix what fails; then the next writes the owner asks for (playlists, comment replies, scheduled updates), each with preview and undo.

## Key paths
`src/integrations/google/{auth,own}.ts` OAuth, own-channel reads and writes · `src/features/mychannel` · `src/features/bulk/BulkView.tsx` live scope · `src/storage/db.ts` live undo log · `src/integrations/{ai,youtube}/*` · `tests/unit/google.test.ts` · `tests/e2e/smoke.mjs`.

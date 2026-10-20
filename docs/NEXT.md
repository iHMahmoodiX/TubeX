# Next

Updated 2026-10-20.

## State
- Branch `claude/m0-m1-baseline-9rp5tg`, draft PR #1 to `main`. Version `0.2.0`.
- M1 plus the owner-requested "all features now" batch: optional AI (Ollama / Gemini / custom OpenAI-compatible), YouTube Data API with the owner's key (public data), research, competitors, bulk edit of drafts/templates, comments tools, thumbnail check and maker. See CHANGELOG 0.2.0 and "Delivered in 0.2.0" in FEATURE_MATRIX.
- Not built (needs OAuth = M2 and, for writes, explicit owner authorization): own-channel analytics, editing published videos (including bulk find/replace on live videos), posting/moderating comments, playlists, scheduled publish/update, end screens/cards.

## Checks run (Linux, Chromium 141 headless)
`npm run typecheck` pass · `npm test` 75/75 · `npm run build` pass · `npm run e2e` 16/16 · `npm run zip` pass.

- Extension ID is now fixed (`cohhieggibbcifgenjclmjainpljkefh`, manifest `key`). Installs from earlier zips used another ID: export a backup there and import it after updating.

## Not verified
Live calls to Gemini, Ollama and the YouTube Data API (mocked in unit tests; e2e cannot accept the browser's permission prompt). Windows build, Edge, live YouTube DOM, screen reader, 200% zoom, measured contrast. YouTube API derived-metrics policy check (views/day, engagement) still open.

## Next task
1. Owner installs 0.2.0, adds a YouTube API key and an AI provider in Settings, and reports what fails (error text is shown in the UI).
2. M2: owner follows the Google Cloud setup (Persian guide in the project files, `guides/google-oauth-setup-fa.md`) and sends the OAuth Client ID; then a read-only own-channel connection; then bulk edit of published videos with dry run (live writes need explicit authorization).

## Key paths
`src/integrations/ai/*` AI client, prompts, runner · `src/integrations/youtube/*` API client · `src/storage/integrations.ts` keys, caps, usage · `src/domain/{bulk,research,chapters}.ts` · `src/features/{connections,ai,insights,research,competitors,bulk,comments}` · `tests/e2e/smoke.mjs`.

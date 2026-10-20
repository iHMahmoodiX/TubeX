# Testing

| Command | Covers | Last result |
|---|---|---|
| `npm run typecheck` | TypeScript strict | Pass, 2026-10-20 |
| `npm test` | 75 unit tests: bulk edit, research helpers, chapters, AI client/prompts/validators, YouTube client (key, permission, cap, cache, error mapping), settings coercion, DB v1→v2 upgrade; Persian normalization, URL context, metadata limits/hashtags/tags, backup parsing (unsafe/invalid/newer/oversized), IndexedDB repository (conflicts, corrupt rows, import merge/replace/undo, round-trip), prefs, DOM adapter on fixture, i18n catalog parity | 75/75 pass, 2026-10-20 |
| `npm run build` | WXT production build | Pass, 2026-10-20 |
| `npm run e2e` | Loads the real unpacked build in Chromium; YouTube URLs served from local fixtures | 16/16 steps pass, 2026-10-20, Chromium 141.0.7390.37 headless, Linux |

## e2e steps (tests/e2e/smoke.mjs)
Persian RTL default and local channel profile; content script injects nothing and YouTube DOM is unchanged; popup opens the real side panel; panel detects the video from page DOM; one-click capture with canonical source link; draft from idea with Persian autosave, checks and preview; instant language/theme switch across pages; navigation to another video keeps the draft and warns about context; unsupported page fallback; 320 px panel and workspace without overflow; keyboard focus order and focus on route change; backup export contents; invalid JSON and unsafe record rejection; merge import with undo available; text typed just before browser quit survives restart; bulk find/replace preview, apply and reverse on drafts; research/competitors/comments/connection settings render, canned reply with markup, Gemini preset fills URL and model.

Screenshots are written to `tests/e2e/artifacts/` (git-ignored).

## Not yet verified
- Live YouTube DOM (selectors are checked only against a synthetic fixture), Microsoft Edge, Windows build, headed Chrome stable.
- Screen-reader pass, 200% zoom, measured contrast.
- Live YouTube Data API, Ollama and Gemini calls (mocked in unit tests; e2e cannot click the browser's host-permission prompt). Google auth and writes are not built.

## Running e2e on Windows
Install Chrome or Chromium and set `CHROMIUM_PATH` to its executable, `npm run build`, then `npm run e2e`. `HEADED=1` shows the browser.

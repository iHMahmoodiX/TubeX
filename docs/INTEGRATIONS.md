# Integrations and limits

Checked 2026-10-20. Google developer docs were **not reachable** from the build environment, so every API fact below is **Inferred** (from prior knowledge) and must be verified against current official docs before the feature that depends on it is built. Do not hard-code quota numbers.

## Used in M1 (Verified by tests on fixtures)
| Capability | How | Evidence |
|---|---|---|
| Active tab URL/title | `tabs.query` with host permissions for www/studio.youtube.com; other hosts return no URL | e2e on Chromium 141 |
| Side panel | `sidePanel` permission, `side_panel.default_path`; opened from popup with `sidePanel.open({windowId})` | e2e |
| Watch-page title/channel | Content script, adapter `yt-watch-2026-10-20`, selectors `ytd-watch-flexy[video-id]`, `ytd-watch-metadata h1 …`, `ytd-channel-name a` | Synthetic fixture only; **live YouTube unverified** |
| Messaging | `tabs.sendMessage` → content script; reply via `sendResponse` + `return true` (Chrome 141 ignores returned Promises) | e2e |
| Storage | IndexedDB (`tubex` v1), `chrome.storage.local` (prefs), `localStorage` (pending draft mirror) | unit + e2e |

## Metadata limits used by checks (Inferred, verify)
| Rule | Value in code (`src/domain/metadata.ts`) |
|---|---|
| Title length | 100 characters |
| Description size | 5000 bytes (UTF-8; Persian letters are 2 bytes) |
| Tags total | 500 characters, tags with spaces count quotes, separators counted |
| `<` `>` in title/description | rejected |
| Hashtags | more than 60 → all ignored; first 3 shown above title |
| Title visible in search | ~70 characters (approximate, display varies) |

## Used in 0.2.0 (Inferred, mocked in unit tests; live calls not yet verified)
| Service | Calls | Auth | TubeX safeguards |
|---|---|---|---|
| YouTube Data API v3 | `search` (100 units), `videos`, `channels` (`forHandle`), `playlistItems`, `videoCategories`, `commentThreads` (1 unit each) | Owner's API key (public data only) | Whitelisted GET resources only; local daily unit cap (default 8,000) counted before sending, reset at Pacific midnight; responses cached 3 h–7 d in IndexedDB `cache`; key not part of the cache key; errors mapped (quota, bad key, API not enabled) |
| OpenAI-compatible chat | `POST {base}/chat/completions` (`response_format: json_object`, non-streaming), `GET {base}/models` | Optional Bearer key | Presets: Ollama `http://localhost:11434/v1`, Gemini `https://generativelanguage.googleapis.com/v1beta/openai` (Inferred endpoint); monthly request cap counted before sending; 120 s timeout; output validated per task; page/user data wrapped in `<data>` and declared untrusted; results cached 30 days keyed by prompt version, URL, model and prompt |
| Thumbnails | `https://i.ytimg.com/vi/<id>/{maxres,hq,mq}default.jpg` | none | Links only; TubeX fetches nothing |

- Host access is requested at runtime per origin (`optional_host_permissions`), from the Save/Test click. Keys live unencrypted in `chrome.storage.local` (`integrations`), never in backups or logs.
- Ollama may reject extension origins; the UI documents the fix: start it with `OLLAMA_ORIGINS=chrome-extension://*`.
- Derived values (views/day, likes+comments per view, sample medians) are computed on screen and not stored; the derived-metrics policy check below is still open.

## Planned APIs (all Inferred, verify at the milestone)
| Need | Endpoint | Scope | Notes to verify |
|---|---|---|---|
| Channel identity | `channels.list mine=true` | `youtube.readonly` | Brand Account selection, multiple channels per Google account |
| Own videos | uploads playlist via `playlistItems.list` + `videos.list` | `youtube.readonly` | `part`/`fields`, paging |
| Metadata write | `videos.update` (snippet) | `youtube` (or `youtube.force-ssl`) | Omitted snippet fields may be cleared: always fetch then send full snippet; categoryId required |
| Thumbnail | `thumbnails.set` | `youtube` | Size/format limits, verification requirement |
| Playlists | `playlistItems.insert/delete` | `youtube` | — |
| Captions | `captions.list/download` | `youtube.force-ssl` | Owner-only download |
| Comments | `commentThreads.list`, `comments.insert`, `comments.setModerationStatus` | `youtube.force-ssl` | — |
| Analytics | YouTube Analytics API `reports.query` | `yt-analytics.readonly` (+ `yt-analytics-monetary.readonly` for revenue) | Which metrics/dimensions combine; data delay; impressions/CTR availability Unknown |
| Bulk reports | YouTube Reporting API | same | Job creation latency, retention |
| Public research | `search.list`, `videos.list chart=mostPopular` | API key or OAuth | `search.list` is far more expensive than `videos.list`; read actual costs from the quota calculator |
| Auth (built 0.3.0, token flow, `prompt=select_account`, D-015) | `chrome.identity.launchWebAuthFlow` / `getAuthToken` | — | Chrome vs Edge differences (Edge lacks `getAuthToken` support, Inferred), stable extension ID via manifest `key`, OAuth testing-mode user limits and token expiry |

## Policy gates (must check before building)
- YouTube API Services Developer Policies and the derived-metrics policy: composite scores, outlier ratios, velocity, sentiment, cross-source combinations and stored history of public metrics. Until checked: show only raw permitted values with retrieval time.
- Data retention/refresh rules for cached API data (separate from the owner's own notes and drafts).
- No private endpoints (Innertube, Studio internal APIs), no cookies, no scraping fallbacks.

## Dependencies (runtime bundle)
| Package | Version | Licence | Why |
|---|---|---|---|
| react, react-dom | 19.3.1 | MIT | UI |
| idb | 8.0.4 | ISC | Small promise wrapper for IndexedDB |
| @fontsource-variable/estedad | 5.3.0 | OFL-1.1 | Persian UI font, bundled |
| @fontsource-variable/figtree | 5.3.0 | OFL-1.1 | English UI font, bundled |
Dev-only: wxt 0.21.4, vite 8.3.4, typescript 5.9.3, vitest 4.1.12, fake-indexeddb 6.2.6, happy-dom 21.0.3, playwright-core 1.56.1.

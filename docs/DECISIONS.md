# Decisions

Short records. Status: Accepted / Proposed / Superseded.

### D-001 Stack: WXT + React + TypeScript, MV3, single package — Accepted 2026-10-20
Context: empty repository; need side panel, popup, full page, content script, local fonts, fast rebuilds. Choice: WXT 0.21.4 (MIT), React 19, TypeScript 5.9 strict, Vite 8. Alternatives: hand-rolled Vite config (more glue to maintain), Plasmo (heavier). Consequences: WXT conventions decide entrypoint layout; Windows build not yet verified (built and tested on Linux only).

### D-002 npm with `legacy-peer-deps` — Accepted 2026-10-20
Context: npm 10.9 crashes (`Cannot read properties of null (reading 'edgesOut')`) resolving vitest's optional peers alongside WXT. Choice: `.npmrc` `legacy-peer-deps=true`, with every needed peer (vite, react, typescript) pinned explicitly. Alternative: pnpm (adds a tool for the owner). Revisit when npm is upgraded.

### D-003 Storage: IndexedDB via `idb`, one owner module, optimistic revisions — Accepted
Records in IndexedDB (`src/storage/db.ts`), preferences in `chrome.storage.local`. Each record has `rev`; saves detect edits from another window and offer keep-mine / load-other. Reads are sanitized; corrupt rows are hidden and counted, never deleted.

### D-004 Unsaved-draft mirror in `localStorage` — Accepted
IndexedDB writes can be cut off when the side panel or browser closes during the autosave debounce. Edits are mirrored synchronously and replayed on next open (conflict UI if the stored draft changed meanwhile). Verified by the restart step in e2e.

### D-005 Page context is URL-first; DOM read-only, watch pages only — Accepted
URL parsing is pure and testable. DOM enrichment only on watch pages, only when the player's video id matches the URL (SPA stale-DOM guard), behind a settings kill switch. No injected UI in M1. Alternative (in-page launchers) deferred until a workflow needs them.

### D-006 No background service worker in M1 — Accepted
Nothing privileged or scheduled exists yet. It arrives with OAuth/API work (M2).

### D-007 Fonts: Estedad + Figtree bundled from Fontsource — Accepted
Both OFL-1.1 (licence files in the packages). ~210 KB of woff2 including Vietnamese/Latin-ext subsets that are loaded only on demand.

### D-008 Gate = TypeScript strict + unit tests + build + Chromium smoke; no linter yet — Accepted
Keeps tooling small. Add ESLint only if recurring issues appear that types/tests do not catch.

### D-009 Confirmations inline, not modal; reversible actions use Undo — Accepted
Matches the brief's consequence-based confirmation and avoids focus traps.

### D-010 Skills: vendor three small Markdown skills, not full design systems — Accepted
See `.agents/skills/SOURCES.md`. `ui-ux-pro-max` (30 MB with datasets and Python scripts) reviewed and not vendored.

### D-011 AI is provider-agnostic (OpenAI-compatible), called directly from the extension — Accepted
The owner wants AI that always works directly. One client covers Ollama (local, free), Gemini's OpenAI-compatible endpoint with the owner's own key, and any custom service (including a relay the owner may run on Supabase or Cloudflare). A TubeX-hosted relay was dropped: it would hold a shared key and add a service to operate.

### D-012 YouTube public data via the owner's API key before OAuth — Accepted
Research, competitor and page stats need only public data, so they ship now with an API key the owner creates. OAuth (own analytics, writes) stays M2. The daily unit cap and caching protect the default quota (Inferred 10,000 units).

### D-013 Bulk edit works on TubeX drafts and templates first — Accepted
The owner prioritized Bulk Find & Replace. Live video edits need OAuth and explicit write authorization; local bulk edit ships with preview, per-item opt-out, rev-checked saves and undo.

### D-014 Fixed extension ID via manifest `key`; OAuth with a Web application client and `launchWebAuthFlow` — Accepted
The redirect URI `https://cohhieggibbcifgenjclmjainpljkefh.chromiumapp.org/` must stay stable across installs, so `wxt.config.ts` carries the public key (the private key was discarded; a store listing would get its own). A Web application client works in Chrome and Edge (`getAuthToken` is Chrome-only, Inferred). TubeX will use the token response (no client secret in the extension); tokens live only in memory/session storage. The owner's project stays in Testing mode (owner plus up to 100 test users, no Google verification), unlike TubeBuddy/vidIQ, which are verified and audited for public use.

### D-015 Google sign-in, own analytics and live metadata writes with undo — Accepted
The owner sent the OAuth Client ID, uses Edge, has several Brand Account channels on one Google account, and authorized write access (`youtube.force-ssl`). Adds the `identity` permission and the optional host `https://youtubeanalytics.googleapis.com/*`. Scopes: `youtube.readonly`, `yt-analytics.readonly`, `youtube.force-ssl`. Token (implicit) flow through `launchWebAuthFlow`; interactive sign-in uses `prompt=select_account` so each Brand channel is added by signing in again; silent refresh uses `prompt=none` and checks the returned channel. Tokens live in `storage.session` only; channel list in `storage.local`. Live writes are limited to title, description and tags via `videos.update`, re-read the live snippet first and send every writable snippet field back, need preview plus explicit confirmation, run one at a time, stop on auth/quota/permission errors, and keep the last 10 batches for undo (undo only restores videos still holding what TubeX wrote). Alternatives: `getAuthToken` (Chrome only), a server-side token exchange (needs a client secret and a hosted service).

### D-016 0.4.0: owner's design language, background worker, in-page tools — Accepted
The owner asked (2026-10-20) for every buildable TubeBuddy feature, tools inside YouTube and Studio pages like TubeBuddy/vidIQ, and a professional redesign using the Spotify-inspired design brief he uploaded (DESIGN.md). Adds a background service worker (RPC for content scripts, scheduled jobs, notifications), permissions `alarms` and `notifications`, IndexedDB v3 working stores (jobs, trackers, snapshots, alerts; not in backups), and shadow-root islands on youtube.com/studio.youtube.com. Public API reads fall back to the signed-in channel's OAuth token when no API key is set. Scheduled work runs only while the browser is open (said in the UI). Studio form fields are filled only on click and saved by Studio's Save. Alternatives: a hosted scheduler (needs a server holding tokens), injecting into YouTube's own DOM without shadow roots (style clashes, fragile).

### D-018 Staying signed in: silent renewal with login_hint, tokens stay in session storage; backups format 2 — Accepted
Owner report (#8, Edge, one Google account with several channels incl. a Brand Account): he had to sign in again every time. Cause (Inferred): tokens were only in `storage.session` (gone after a browser restart) and the silent `prompt=none` flow had no `login_hint`, so Google answered for the account's default identity; the channel check then refused it for the Brand channel. Fix: at sign-in TubeX reads the token's Google account id (`sub`) from the documented tokeninfo endpoint (`www.googleapis.com/oauth2/v3/tokeninfo`, already covered by the API host permission; the token's audience must be TubeX's client ID) and stores it with the channel in `storage.local` (an identifier, not a credential). Silent renewal sends `login_hint=<sub>` with `prompt=none`, a few minutes before expiry (one-shot `chrome.alarms` alarm, plus the 15-minute tick) and on the first worker start of each browser session, so tools do not meet an expired token. The channel check stays; a silent token for a channel the owner never connected is dropped. When Google needs the owner (signed out of Google, consent changed), the channel is marked "reconnect" for the session and Settings, the bulk page, error notices and in-page errors (`auth.reconnect` RPC) offer one "Reconnect <channel>" click: the interactive flow with the same `login_hint`, no chooser, no permission step. Tokens are NOT persisted to disk: renewing after a restart gives the same result without leaving bearer tokens in `storage.local`. Still no client secret, no auth-code/refresh-token flow. No new permissions or scopes. Unverified live: Google's behaviour for Brand Account `sub` hints in Edge's hidden auth window.
Backups move to format 2: an optional settings section (UI prefs, in-page switches, AI and YouTube settings, connected channels without tokens); AI keys and the YouTube API key only when the owner ticks them at export. Format 1 files migrate (any settings section in them is ignored). Records from older versions get defaults instead of being refused; only records with no id, no content or unusable identity are skipped, and the import preview says how many per collection and why.

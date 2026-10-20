# Architecture

Status labels: **Verified** = exercised by tests/smoke run on 2026-10-20; **Proposed** = not built.

## Verified (M1)
```text
entrypoints/
  sidepanel/  popup/  workspace/   React pages (index.html + main.tsx + App.tsx)
  youtube.content.ts                read-only page-context responder on www.youtube.com
src/
  domain/      pure rules: text normalization, page-URL parsing, metadata checks, records, backup format
  storage/     db.ts (IndexedDB via idb, sole owner of records), prefs.ts (chrome.storage.local)
  platform/    active-tab context, YouTube DOM adapter, typed messages, files, navigation
  features/    ideas, drafts, templates, profiles, settings UI
  components/  AppShell (prefs/i18n/theme/storage health), ui primitives, toasts, hooks
  i18n/        en.ts (keys), fa.ts, runtime
  styles/      base.css (tokens + components)
tests/unit, tests/e2e, tests/fixtures
```
No background service worker in M1: nothing needs privileged network or scheduled work yet.

### Data
- IndexedDB `tubex` v1: stores `profiles`, `ideas`, `drafts`, `templates` (keyPath `id`, index `updatedAt`), `meta` (import snapshot). Upgrades run per version from `MIGRATIONS` in `db.ts`.
- Every record: `id`, `createdAt`, `updatedAt`, `rev`. `save()` writes only if the stored `rev` matches (cross-window conflict detection); `put()` is the explicit override.
- Reads pass through `sanitizeRecord()`; invalid rows are hidden and counted, never deleted.
- Draft edits are mirrored synchronously to `localStorage` (`tubex:pending-draft:<id>`) until IndexedDB confirms, so closing the panel or browser mid-debounce does not lose text.
- Backup: JSON `{ app: "tubex", format: 1, exportedAt, appVersion, data }`, max 5 MB; import validates every record (known keys only, https URLs only, size caps), reports rejects, snapshots current data for one-step undo.
- Preferences (`chrome.storage.local` key `prefs`): UI language, theme, active profile, last draft, page-adapter kill switch.

### Page context
1. Side panel/popup asks `tabs.query` for the active tab; URL is parsed purely (`parsePageUrl`). Hosts outside the permission list come back without URL and are shown as unsupported.
2. For watch pages only, it asks the content script for DOM title/channel. The adapter (`youtubeDom.ts`, version `yt-watch-2026-10-20`) returns data only if `ytd-watch-flexy[video-id]` equals the URL video id (YouTube SPA can show stale DOM). 800 ms timeout; any failure falls back to URL + tab title.
3. Content script validates `sender.id` and message type, changes nothing, injects nothing.

### Security boundaries
- Permissions: `storage`, `sidePanel`; hosts `https://www.youtube.com/*`, `https://studio.youtube.com/*`. CSP `script-src 'self'`.
- No network requests, no credentials, no remote code. Page DOM and imported files are untrusted and validated.

## Proposed (not built)
- M2: service worker owns OAuth (`chrome.identity`), YouTube Data/Analytics adapters with quota accounting, per-channel cache partitions with retention rules. Needs a stable extension ID (manifest `key`) for redirect URIs.
- M3: one optional AI provider adapter with budget enforcement; thumbnail canvas workbench.
- M4: durable job store with per-item checkpoints, lease against duplicate execution, conditional restore.

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

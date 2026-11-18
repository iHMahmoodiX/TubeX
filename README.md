# TubeX

A personal, local-first YouTube creator workbench as a Chrome/Edge extension, with a Persian-first (RTL) and English interface.

**Status (2026-10-20): local development build `0.2.0`.** Everything local works without credentials. Optional: your own YouTube Data API key (public stats and research) and an AI provider (Ollama, Gemini with your key, or any OpenAI-compatible service). TubeX never signs in to your YouTube account or changes anything on YouTube yet. See [docs/NEXT.md](docs/NEXT.md) for the current state and [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md) for coverage.

## What it does

**New in 0.2.0**
- **AI assistant** in every draft: titles, description, tags, hooks/outline, content brief, translation, chapters from a transcript, thumbnail critique. Settings → Connections: choose Ollama, Gemini (your key) or a custom service.
- **Public stats** in the side panel (with your YouTube API key): video/channel/search stats, view and copy tags, embed code, comment export, channel video export.
- **Research**: keyword explorer on a labeled search sample, trending, keyword lists (CSV). **Competitors**: watchlist with new-upload badges.
- **Bulk edit**: find and replace, add/remove tags and add text across drafts and templates, with preview and undo.
- **Comments**: canned replies and comment formatter. **Thumbnails**: size previews and a simple maker.

**From M1**

- **Side panel**: shows the current YouTube page (video, Short, search, channel, playlist, Studio video) and saves a source-linked idea in one click. Non-YouTube pages get a safe fallback.
- **Draft editor**: title, description, tags and focus keyword with autosave, Persian-aware limit checks (description limit is in bytes), an approximate search/watch preview, reusable templates, and copy/download of the package.
- **Workspace** (full page): ideas (search with Persian normalization, status, notes), drafts, templates, local channel profiles (marked *not connected*), settings.
- **Settings**: Persian/English, light/dark/system, page-reading kill switch, JSON backup export/import with validation, merge/replace and one-step undo of the last import.
- **Popup**: save current page as an idea, open the side panel or workspace.

## Install (unpacked, Chrome or Edge on Windows)

Requires Node.js 22+ and npm.

```bash
npm install
npm run build          # Chrome/Edge build in .output/chrome-mv3
```

1. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
2. **Load unpacked** → choose the `.output/chrome-mv3` folder.
3. Pin TubeX, open a YouTube video, click the icon → **Open side panel**.

To update: `git pull`, `npm install`, `npm run build`, then press **Reload** on the extension card. Your data stays in the browser profile. Export a backup before major updates.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development build with reload (opens a browser) |
| `npm run build` | Production build to `.output/chrome-mv3` |
| `npm run zip` | Zip of the build in `.output/` (for your own archive; not a store release) |
| `npm run typecheck` | TypeScript strict check |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Real unpacked-extension smoke test in Chromium (run `npm run build` first; set `CHROMIUM_PATH` on your machine) |
| `npm run check` | typecheck + tests + build |

## Documentation map

| File | Purpose |
|---|---|
| [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) | Rules for coding agents |
| [PROJECT.md](PROJECT.md) | Goals, scope, milestones |
| [DESIGN.md](DESIGN.md) | UX contract, tokens, RTL, states |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Verified structure and data/security boundaries |
| [TESTING.md](TESTING.md) | Commands and evidence |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Local build, install, update, rollback |
| [docs/NEXT.md](docs/NEXT.md) | Current state and next task |
| [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md) | Coverage vs. TubeBuddy/vidIQ workflows and feasibility |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | YouTube/Chrome capabilities, limits, evidence status |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision records |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Prioritized backlog |
| [docs/MASTER_BRIEF.md](docs/MASTER_BRIEF.md) | Original brief (read sections on demand) |

## Privacy

All data is stored in your browser profile (IndexedDB and `chrome.storage.local`). Nothing leaves the browser unless you add a connection: then video ids, search terms and channel ids go to the YouTube Data API, and the draft text you ask about goes to the AI service you chose. API keys stay in the browser profile, unencrypted and outside backups. Backups contain your ideas and drafts in plain JSON; keep them out of this public repository (`.gitignore` excludes `tubex-backup-*.json`).

# Changelog

## 0.2.0 — 2026-10-20 (connections, research and bulk tools, local development build)
- Optional AI through any OpenAI-compatible service: presets for Ollama (local) and Google Gemini (own key), or a custom base URL. Runtime host permission per origin, monthly request cap, token usage, 30-day result cache, prompt-injection guard for page data.
- Draft AI tools: titles, description, tags, hooks and outline, content brief, translation into a new draft, chapters from a timestamped transcript (validated). Every suggestion is applied by click with undo.
- Thumbnail check (local previews at three sizes, light/dark, 16:9 warning), thumbnail maker (1280×720 text overlay, PNG download) and optional AI critique for vision models.
- YouTube Data API with the owner's own key (read-only, public data): side-panel stats for videos, channels and searches; view/copy tags and add them to the open draft; thumbnail image links; embed-code builder; comment export (CSV) with common words; channel video export (CSV); subscriber milestone.
- Research: keyword explorer over a labeled search sample (common tags, title words, own-channel positions, CSV), AI related terms/questions, trending by category, keyword lists with CSV export.
- Competitors: watchlist from handle/link/ID, public counts, recent uploads with new-upload badges, side-by-side table, notes.
- Bulk edit across drafts and templates: find and replace (case, whole word, fields), add/remove tags, add text to descriptions; preview with per-item selection, limit warnings and one-click undo.
- Comments workspace: canned replies and a formatter for YouTube comment markup.
- Tag sorter, chapter-rule check in the checklist, popup quick links.
- IndexedDB v2 (keyword lists, watchlist, replies, response cache). Backups include the new collections; keys and usage are never in backups.

## 0.1.0 — 2026-10-20 (M1, local development build)
- First unpacked extension: side panel, popup and full-page workspace.
- YouTube page-context detection (URL first, read-only DOM enrichment on watch pages with stale-DOM guard and kill switch).
- Source-linked idea capture; idea library with Persian-aware search, statuses and notes.
- Metadata draft editor with autosave, conflict handling and unsaved-edit recovery; limit checks (description in bytes), focus-keyword checklist, approximate search/watch preview, copy and text download.
- Reusable description/tag templates; local channel profiles marked not connected.
- Persian/English with instant switching, RTL/LTR, light/dark/system, bundled Estedad and Figtree fonts.
- JSON backup export, validated import with merge/replace and undo, delete-all.
- Project OS documents, feature matrix, integration map, unit tests and Chromium smoke test.

# Changelog

## 0.4.0 — 2026-10-21 (every buildable TubeBuddy feature, tools inside YouTube, new design)
- New design language chosen by the owner (Spotify-inspired, dark by default): black-framed workspace with grouped navigation (Create, Research, Analyze, Manage, Engage), channel library, global keyword search, alerts bell, thumbnail-led track lists, pill buttons, content-tinted page headers. Ideas, drafts (tag chips, readiness ring), templates, channels, settings (sub-navigation, provider cards, usage meters), side panel and popup redesigned.
- Home: channel hero, period comparison, daily views, latest uploads shelf, top videos, search terms, traffic sources, countries.
- Reports: Health (0–100 with sub-scores and daily history), Best practice audit (13 checks per video), Retention analyzer (drops, compare two videos), Best time to publish (estimate from your own uploads), Click Magnet (impressions/CTR when the API provides them, honest fallback), Opportunity finder, Ad-friendliness (demonetization) heuristic audit.
- Research: keyword score (estimate with explained parts, never "search volume"), related keywords, compare 3 keywords, your real YouTube search terms, language analysis and AI translation, trending.
- Rankings: daily search rank tracking with history and alerts, tag rankings (cost shown first), brand alerts.
- Competitors: card grid, automatic upload alerts, niche leaderboard from daily snapshots, scorecard.
- Comments: inbox for your channel with filters, replies with canned responses, bulk moderation (hold/hide/approve) with undo.
- Bulk edit: three-step flow, live cost, new "default upload profile" operation.
- Playlists: create, edit, add videos in bulk, sort, reorder, copy, delete, with undo.
- Schedule: scheduled publish (YouTube publishes itself), scheduled updates with optional revert, sunset videos.
- Thumbnails: bulk overlays (banner, badge, logo) with restore of the originals. Shorts ideas from retention peaks, chapters and transcript.
- Inside YouTube: card under each video (stats, tags, SEO checks, actions, inline edit of your own videos), search result badges and keyword score, channel strip, quick-links button. Inside Studio: SEO assistant in the video editor, templates in the editor and upload dialog, canned replies on the comments page. Each can be switched off in Settings.
- Alerts and scheduled work run in a background worker while the browser is open, with desktop notifications. Public data works with Google sign-in alone (no API key needed).
- New permissions: `alarms`, `notifications`; optional host `i.ytimg.com` (thumbnail overlays). IndexedDB v3.

## 0.3.0 — 2026-10-20 (Google sign-in, own channel, live bulk edit)
- Sign in with Google from Settings (Chrome and Edge). Several channels, including Brand Accounts: sign in again and pick the next channel; switch the active channel anytime. Disconnect revokes the token.
- My Channel: analytics for 7/28/90/365 days (views, watch hours, average view duration and percentage, net subscribers, likes, comments, shares), daily views chart, YouTube search terms, traffic sources, countries, top videos; video list with visibility, views, age, metadata audit, copy to draft and CSV export.
- Bulk edit on published videos: find and replace, add/remove tags and add text now also apply to the signed-in channel's videos, with preview, per-video selection, limit checks, unit cost shown before confirming, sequential writes, and undo of the last 10 batches.
- New permission `identity`; optional host for the YouTube Analytics API.

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

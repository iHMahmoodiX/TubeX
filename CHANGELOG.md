# Changelog

## 0.5.2 — 2026-10-21 — find & replace on YouTube (owner's top priority)
- Bulk edit is now a full find & replace for the descriptions, titles and tags of all your uploads (every page of the uploads list), with filters for visibility, date range, text, Shorts vs videos (by duration, up to 3 minutes) and playlist; Studio's selection still preselects videos.
- Matching: Persian-aware by default (ي/ی, ك/ک, ة/ه, Persian/Arabic/Latin digits, half-space vs space and repeated spaces count as the same; the new text is inserted exactly as typed), case-insensitive Latin, whole word, regex with $1 and a live validity check, multi-line blocks with CRLF and trailing-space tolerance.
- Operations: replace text, replace between two markers, add a block at the start or end (never twice), remove lines containing a text, change links safely, add/remove tags, default upload profile.
- Preview: a real word-level diff for every video with unchanged lines folded, match counts, totals, untick any video, and items that would break a YouTube limit (5,000-byte description, 100-character title, 500-character tags, angle brackets) listed as skipped with the reason, never cut.
- Run: a background job in the service worker, one video at a time, re-reading each video just before writing and writing back the full editable snippet (translations untouched). Live progress, pause, resume, cancel, toast and desktop notification. Retries with backoff on temporary errors; stops cleanly when the daily quota is used and continues by itself after the Pacific-midnight reset. Plans 51 units per video against TubeX's daily limit, which can be raised to 10,000 from the run step. "Test on 1 video first".
- Undo: the exact previous text of every changed video is kept; undo a whole job or one video. Videos edited by hand after the change are not overwritten without asking, with a diff of what changed since.
- Results: per-video list with filters, plain-sentence errors with details folded, Reconnect when Google sign-in needs it, CSV export.

## 0.5.1 — 2026-10-21 (fixes from the owner's live test, issue #8)
- Font: the owner's Estedad build (variable, Persian digits) everywhere, including the tools inside YouTube and Studio.
- Studio Content: the bulk-tools menu opens under its button, fully visible (overlay layer), and the button sits right after the last tab; the TubeX selection menu shows only when rows are selected.
- Videolytics best practices: chapters and pinned/hearted comments, cards, end screens and captions are read from the page when YouTube shows them; tolerant chapter parsing (RTL marks, Persian digits, timestamps at line end); every item says where its answer comes from. The SEO checklist under the video uses the same chapter rule.
- Click Magnet: no more unsupported Analytics query (400). Impressions and CTR now come from the official YouTube Reporting API after one click ("Start collecting CTR data"; first data after about 1–2 days). New optional host `youtubereporting.googleapis.com` (D-017). Report errors are plain sentences with details folded.
- Staying signed in: silent renewal per channel (login_hint), proactive renewal before expiry and after a browser restart, one-click Reconnect when Google asks for confirmation (D-018).
- Bulk edit explains that editing needs Google sign-in (an API key only reads public data) and signs in from there.
- Backups: format 2 with an optional settings section (keys only when ticked); older backups import with defaults filled instead of being rejected; per-collection import report. Settings → Data explains how to update without losing data.

## 0.5.0 — 2026-10-21 (TubeBuddy-style tools inside YouTube and Studio, issues #2–#7)
- Studio Content page: TubeX "Bulk & tools" menu next to the tabs, grouped like TubeBuddy (bulk processing, cards, end screens, misc tools); a TubeX action in Studio's selection toolbar for the selected rows (#2, #3). Cards and end screens are listed but disabled: YouTube has no API for them.
- Related video for Shorts: queue of selected Shorts; on each Short's edit page TubeX fills Studio's own related-video field on a click and the user saves (no API exists for it).
- Made for kids (COPPA) center: new workspace page; review and bulk-set "made for kids" on your videos with preview, cost, confirmation and undo.
- Studio video details: tag tools inside the Tags field (#4): double-click a tag to research it, rank badges on tags (cost shown first), copy/clear all, Copy · Sort · Import · Translate · Keyword Explorer, recommended tags from a target keyword (sort by relevance, keyword score or your own search traffic), and a video switcher on the page edge.
- Channel pages (#5): Channelytics section (lifetime and 30-day figures, compare chart, channel keywords with copy, channel ID) and Channel Insights: niche, growth benchmark vs your channel and niche, content calendar, activity feed, outlier distribution, topics × channels analysis. Growth of other channels comes from TubeX's own daily snapshots (no history exists in the API).
- Launchers (#6): floating TubeX tab on the page edge and a TubeX button in the top bar on YouTube and Studio, both opening a page-aware TubeX drawer (this page's tools, all tools, alerts, in-page switches). Measured cost on a mock page: about 6 ms scripting and 4 DOM nodes for both.
- Watch page (#7): Videolytics panel in the right column (summary, SEO score, ranked tags on demand, channel block, best-practices checklist with honest "unknown" items, tags with ranks, compare to the channel's recent average, tools menu).
- Every new tool has its own switch in Settings → In-page tools.

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

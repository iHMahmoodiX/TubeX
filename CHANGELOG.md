# Changelog

## 0.6.6 — 2026-11-19 — Ask Studio fixes from the first live test
- Page method now reads the answer from the whole Ask Studio side panel, including text inside Studio's shadow DOM and tables, skips the shortened question bubble, and no longer waits forever for a spinner. (Studio answered but TubeX timed out.)
- "TubeX questions" inside Studio's own Ask Studio panel: a button above the question box opens the ready-made questions (this video's first on a video page); one click types and sends it in Ask Studio. Can be hidden in Settings → Ask Studio.

## 0.6.5 — 2026-11-19 — Ask Studio from TubeX, one settings section at a time
- Ask Studio page (Analyze): 14 ready-made questions (7 channel, 7 per video), a video picker, the answer shown in TubeX, copy, save as idea and a history of answers. The Improve queue can ask Ask Studio and show the answer inline.
- Settings → Ask Studio chooses the method (D-030): copy and open Studio; through the Studio page (a background Studio tab, the question typed into Ask Studio, the answer read back, the tab closed); or direct request (Studio's own request, learned once from a page run and replayed with the signed-in session, falling back to the page when it fails). Ready-made questions are editable, with restore to TubeX's.
- Settings shows only the chosen section; links open the right one (#settings/<section>).
- Settings backups include the Ask Studio method and questions (not the learned request).

## 0.6.4 — 2026-11-18 — separate Aparat and Blog, your own prompts, "Do it all"
- Aparat and Blog are separate pages in the menu and separate sections in Settings.
- Prompt templates (Settings → Aparat / Blog): edit TubeX's prompt, save, reset to TubeX's default, add, duplicate, delete and choose the default; several templates per kind and a template per blog. The default prompts are now in Persian. TubeX always appends the fixed answer format (and Aparat's hard limits) so edited prompts keep working. Drafts let you pick the template per run.
- Per-blog defaults: default blog, call-to-action link, category and prompt for each blog; default Aparat category.
- "Do it all" per video and for selected videos: Blog = captions → article in your voice → WordPress draft (when connected); Aparat = package → AI rewrite applied. Progress per video, stop after the current one. "Write the article" in a draft also sends the WordPress draft when the blog is connected (switchable).
- Settings backups include these settings and prompts (never WordPress passwords).

## 0.6.3 — 2026-11-18 — article from captions, WordPress drafts
- Blog version reads the video's own captions from YouTube (owner's videos, about 250 quota units, on a click; "Write the article" fetches them by itself when the transcript is empty). Caption timing is turned into paragraphs and rolling repeats are removed.
- Article prompt (blog-article-v2): written in first person as the creator, natural and not transcript-like, in the owner's post structure, with strong on-page SEO.
- WordPress connection (D-028): Settings → WordPress takes the site address, username and an Application Password, tests it (REST, edit rights) and stores it locally only (never in backups). Disconnect removes it and the site permission.
- "Send to WordPress" creates a **draft** (title, content, excerpt, slug, tags created if missing, existing category matched, video thumbnail as featured image, Yoast/Rank Math meta description when allowed) and later updates that same draft. It never publishes or deletes, and refuses to touch a post that is no longer a draft.

## 0.6.2 — 2026-11-18 — Aparat rewrite and WordPress blog version
- Aparat package follows Aparat's rules by itself: at most 5 tags of up to 23 characters (YouTube order), description cut at a line within 2000 characters.
- "Optimize for Aparat" (AI): Persian title for Aparat search, description without YouTube-only parts (links, subscribe/bell requests, hashtags) with chapters kept, exactly 5 Aparat search tags and a category. Shown for review; "Use this version" replaces the package. Always rewritten from the YouTube draft, never from an earlier rewrite.
- Blog version (WordPress) in every draft and on the page, renamed "Aparat & blog": an AI article in the owner's post style (problem-first intro, question H2s with a bold one-line summary, steps and lists, FAQ, final checklist, call-to-action link), with the YouTube video and the Aparat video (once its link is recorded) embedded as WordPress blocks. SEO fields (title, English slug, focus keyword, meta description, excerpt, category, tags) with checks, a read-only preview, copy/download, a link to the WordPress new-post screen, and status/link record. Optional transcript for a fuller article. A plain version without AI from the description. TubeX builds the HTML itself; model text is escaped.
- Blog address and call-to-action link are remembered for the next video.

## 0.6.1 — 2026-11-18 — Aparat page
- New workspace page "Aparat" (Manage group): every YouTube upload with its Aparat state (not prepared, prepared, uploaded, published with link), filters and search. One click prepares a video's Aparat package from its YouTube title, description (YouTube links removed) and tags, reusing the video's draft if there is one, and opens it.
- The last category you chose is filled in for the next package.
- The Aparat package shows in every draft without a setting; the Settings switch now only controls reading Aparat tabs in the side panel.
- My channel → videos: an "Aparat" button per video.

## 0.6.0 — 2026-11-18 — grow the channel: improve queue, A/B assistant, research workflow, outliers, Aparat package
- Studio upload: the upload profile is now a small "Upload profile" button next to Studio's "Reuse details"; the panel opens only on click and floats above the dialog without changing its layout.
- 2026 YouTube quota (D-021): searches have their own daily limit (default 100, with a reserve for manual research); research costs are shown in searches.
- Gemini (D-022): new default `gemini-3.5-flash-lite`; Settings warns about retiring models and switches with one click, never silently.
- Improve queue (#10): the few published videos worth improving now, each with its reason and numbers (low CTR, strong retention with low reach, evergreen traffic, failing metadata), observation log with 7-day before/after, done/snooze/dismiss with undo, "Improve in a draft", A/B and Studio links.
- Coach and Ask Studio (#15, D-024): rule-based advice for each item; optional Gemini advice after one-time consent, only from the item's own numbers; Ask Studio prompt copy and handoff.
- A/B assistant (#12) and thumbnail context previews (#13): up to 3 title/thumbnail variants checked against Test & Compare rules, previews in home, search, mobile and sidebar (optionally among real search results, 1 search), Studio checklist and a results record.
- Research → Idea → Draft (#14): "Idea + draft" and "Save idea" from keyword research, outliers and the watch page carry the keyword, intent and dated public numbers into the draft; drafts show a step tracker with one next action and link to the Improve queue.
- Outliers (#11, D-025): Research → Outliers finds recent videos well above their channel's or search sample's usual views per day, with raw numbers, sample size and time, bounded cost shown before the click, and one-click idea capture.
- Aparat (#16, #17, D-026): feasibility matrix; opt-in "Aparat helpers" with a per-draft Aparat package (Aparat-specific checks, copy/download, open Aparat's upload page, status and link record) and Aparat tabs in the side panel. No Aparat login, upload or API use.
- Database v4 (D-023): new local stores for the queue and experiments; backups include them.
- CI: typecheck, unit tests, build and fixture e2e on pull requests.

## 0.5.3 — 2026-10-22 — persistent Google sign-in (D-020)
- Stay signed in after a browser restart (D-020): optional "Sign-in server URL" in Settings → Google account and channels. With your own free Supabase function (source and guide in `server/`), sign-in uses Google's code flow with PKCE and keeps an encrypted refresh token per channel, so channels renew without any window, also after restarting Edge. The client secret stays in Supabase, never in TubeX. Without a server everything works as before.
- Settings shows per channel whether it stays signed in or needs a click after a restart, and the last renewal error code.
- "Reconnect all" in Settings and in the Reconnect banner: one click goes through every channel that needs it.
- Disconnecting a channel also deletes and revokes its refresh token. Backups never include sign-in tokens.

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

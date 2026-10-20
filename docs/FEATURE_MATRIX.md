# Feature matrix

Checked 2026-10-20. **Important limit:** the official catalogs (TubeBuddy `https://www.tubebuddy.com/tutorials/` = **TB**, vidIQ `https://vidiq.com/features/` = **VQ**) and Google developer docs were **not reachable from the build environment** (DNS/proxy block). Competitor rows therefore come from the brief's seed list plus secondary reviews found by web search (Capterra, wyzowl.com, alejandrorioja.com, thefoodranger.com, toolradar.com; 2026). Re-audit against the official catalogs from a normal browser before relying on completeness. Paid-tier behaviour is unverified throughout.

Legend. Evidence (about the competitor capability): **S** = secondary source names it; **B** = brief seed only; **U** = unknown. Feasibility: Direct / Approximation / Native handoff / Optional service / Research required / Blocked / Out of personal scope. Status: Not started / In progress / Verified / Blocked / Deferred. "Verified" for M1 means unit tests + Chromium smoke test on fixtures (TESTING.md), not live YouTube. API facts are **Inferred** until checked against current docs (docs/INTEGRATIONS.md). Priority: P1 next milestones, P2 later, P3 park.

| ID | Workflow | Source (checked 2026-10-20) | Ev. | TubeX behaviour | Data origin | API / scope | Feasibility | Deps / cost | Prio | Status | Acceptance proof |
|---|---|---|---|---|---|---|---|---|---|---|---|
| KW-01 | Keyword explorer: related terms | TB Keyword Explorer; VQ keyword tool | S | Related terms from sampled public results and own notes; no invented volume | Public API sample; local | search.list (quota-heavy); read-only key or OAuth | Approximation | Quota | P2 | Not started | Same query twice shows sample date, region, language |
| KW-02 | Search volume / competition / overall score | VQ scores; TB Keyword Explorer | S | Not offered as numbers; show available public signals labelled as signals | — | No permitted source known | Blocked | Paid third-party data would need owner choice | P3 | Blocked | UI states "no permitted volume source" |
| KW-03 | Question ideas | TB/VQ (seed) | B | Question-style ideas from AI on supplied evidence | Model output | AI provider (owner key) | Optional service | AI cost | P2 | Not started | Output labelled AI, editable, budget shown |
| KW-04 | Keyword lists / collections | TB/VQ (seed) | B | Local keyword collections per channel, export | Local | — | Direct | — | P1 | Not started | Create, rename, export CSV with formula-safe cells |
| KW-05 | Keyword comparison | seed | B | Side-by-side of sampled signals with sample metadata | Public API sample | search.list, videos.list | Approximation | Quota | P2 | Not started | Comparison shows sample size and date |
| KW-06 | Language / region filters | seed | B | Region and relevance-language parameters on research | Public API | search.list params | Direct (Inferred) | — | P2 | Not started | Params visible on every result set |
| KW-07 | Trending topics | VQ trending (S) | S | Most-popular charts by region/category | Public API | videos.list chart=mostPopular | Direct (Inferred) | Quota | P2 | Not started | Region/category/date shown |
| KW-08 | Rank tracking / search position | TB Rank Tracking | S | Contextual position samples, labelled as samples | Public API sample | search.list; policy check on storage | Research required | Quota; storage rules | P3 | Not started | Policy gate documented before storing history |
| KW-09 | Inline scores on YouTube search page | VQ extension overlay | S | Not cloned; optional launcher to research view | — | — | Blocked (no data) | — | P3 | Deferred | — |
| KW-10 | Topic clusters, intent notes | seed | B | Tags/notes grouping on ideas and keywords | Local | — | Direct | — | P2 | Not started | Cluster view filters ideas |
| KW-11 | Keyword export | seed | B | CSV/JSON export | Local | — | Direct | — | P2 | Not started | Formula-injection-safe CSV test |
| DC-01 | Saved channels/videos watchlist | TB/VQ competitors | S | Local watchlist; refresh public data on demand | Local + public API | channels.list, videos.list | Direct (Inferred) | Quota | P1 | Not started | Watchlist survives restart; refresh shows retrieved time |
| DC-02 | Competitor recent uploads | VQ competitors | S | Upload list via uploads playlist | Public API | playlistItems.list | Direct (Inferred) | Quota | P2 | Not started | Paged list with retrieved time |
| DC-03 | Competitor comparison / scorecard | TB Competitor Scorecard | S | Plain public stats side by side; no composite score until policy check | Public API | channels.list statistics | Approximation | Derived-metrics policy | P2 | Not started | Policy row in INTEGRATIONS marked checked |
| DC-04 | Most-viewed videos of a channel | VQ (seed) | B | Sorted public list | Public API | search.list order=viewCount or uploads + videos.list | Direct (Inferred) | Quota | P2 | Not started | — |
| DC-05 | Outlier discovery | VQ outliers (seed) | B | Only if derived-metric rules allow; otherwise manual flag | Public API | — | Research required | Policy | P3 | Not started | Written policy check |
| DC-06 | Video stats overlay on watch page (views/hour, engagement) | VQ scorecard | S | Side-panel card with public counts and retrieval time; no velocity until policy check | Public API | videos.list statistics | Approximation | Policy | P2 | Not started | Panel never shows missing as 0 |
| DC-07 | View tags of any video | TB Tag viewer; VQ | S | Show public tags when API returns them | Public API | videos.list snippet.tags (Inferred available for public videos) | Research required | — | P2 | Not started | Verified against current docs and a real response |
| DC-08 | Capture idea from video/search/channel | seed | B | One-click source-linked idea from side panel or popup | Local + page URL/DOM | Content script (read-only) | Direct | — | P1 | **Verified** | e2e: capture saves canonical source |
| DC-09 | Competitor channel audit | TB Health Report (S) | S | Public-data review with explicit gaps | Public API | channels/videos.list | Approximation | Policy | P3 | Not started | — |
| IP-01 | Idea backlog with status, notes, search | seed | B | Ideas view: Persian-aware search, statuses, notes, channel filter | Local | — | Direct | — | P1 | **Verified** | unit + e2e |
| IP-02 | Daily idea suggestions | VQ Daily Ideas | S | On request only, from own channel evidence | Model output | AI provider | Optional service | AI cost | P2 | Not started | No background calls |
| IP-03 | Content brief builder | seed | B | Brief from idea + research + template | Local (+AI optional) | — | Direct | — | P1 | Not started | Brief exports and links to draft |
| IP-04 | Content pillars / series | seed | B | Pillar and series tags on ideas/drafts | Local | — | Direct | — | P2 | Not started | — |
| IP-05 | Content calendar | seed | B | Calendar of planned drafts; Persian calendar display | Local | — | Direct | — | P2 | Not started | — |
| IP-06 | Comment-to-idea | seed | B | Save a comment as idea from inbox | Owner API | commentThreads.list (Inferred) | Direct | Quota | P2 | Not started | — |
| IP-07 | Per-channel separation | seed | B | Local channel profiles; drafts/ideas/templates carry profile; marked not connected | Local | — | Direct | — | P1 | **Verified** (local only) | e2e creates profile; unit sanitizes |
| MD-01 | Title / description / tag editor | TB SEO Studio; VQ | S | Draft editor with autosave and recovery | Local | — | Direct | — | P1 | **Verified** | e2e autosave + restart recovery |
| MD-02 | Tag suggestions | TB Suggested Tags | S | Suggestions from own templates, sampled public tags or AI, labelled by origin | Local / public / AI | — | Approximation | AI cost optional | P2 | Not started | Origin label on each suggestion |
| MD-03 | AI title / description generator | VQ AI title; TB AI | S | Variants on request, editable | Model output | AI provider | Optional service | AI cost | P2 | Not started | Cost shown; no auto-apply |
| MD-04 | Description templates / upload defaults | TB/VQ (seed) | B | Reusable description blocks and tag sets, insert with Undo | Local | — | Direct | — | P1 | **Verified** | e2e/unit applyTemplate |
| MD-05 | Saved tag sets | seed | B | Same as templates (tags-only templates) | Local | — | Direct | — | P1 | **Verified** | unit |
| MD-06 | SEO score | TB SEO score; VQ SEO score | S | Pre-publish checklist only; explicitly not a ranking score | Local | — | Approximation | — | P1 | **Verified** (checklist) | UI disclaimer in e2e |
| MD-07 | Search / watch preview | seed | B | Approximate layouts from exact text, labelled approximate | Local | — | Direct | — | P1 | **Verified** | e2e preview hashtags |
| MD-08 | Hashtag rules | seed | B | Persian hashtags parsed; >60 warning; first 3 shown above title (Inferred rule) | Local | — | Direct | — | P1 | **Verified** | unit |
| MD-09 | Localization of metadata | seed | B | Per-language title/description; API write later | Local → owner API | videos.update localizations (Inferred) | Direct | — | P2 | Not started | — |
| MD-10 | Copy / export package | seed | B | Copy fields, copy all, download .txt | Local | — | Direct | — | P1 | **Verified** (copy not asserted in e2e) | build + manual |
| MD-11 | Limit checks | seed | B | Title chars, description bytes, tag chars incl. quotes | Local | Limits Inferred | Direct | — | P1 | **Verified** | unit |
| MD-12 | Chapters from transcript | seed | B | From owned captions or supplied text | Owner API / supplied | captions.download (Inferred owner-only) | Approximation | — | P2 | Not started | — |
| PB-01 | Pre-publish checklist | seed | B | Metadata checks now; thumbnail/captions/playlist later | Local (+API) | — | Direct | — | P1 | In progress | — |
| PB-02 | Best time to publish | TB Best Time | S | From authorized analytics if available; else Studio export import | Owner analytics / import | Analytics API (audience-active time likely unavailable, Unknown) | Research required | — | P2 | Not started | — |
| PB-03 | Scheduling | seed | B | Native handoff now; API publishAt write in M4 | Owner API | videos.update status.publishAt (Inferred) | Native handoff → Direct | — | P2 | Not started | — |
| PB-04 | Playlist choice | seed | B | Pick playlists in package; write in M4 | Owner API | playlistItems.insert | Direct (Inferred) | Quota | P2 | Not started | — |
| PB-05 | Captions readiness | seed | B | Read caption tracks of own video | Owner API | captions.list | Direct (Inferred) | — | P2 | Not started | — |
| PB-06 | Studio upload helper | TB upload checklist (U) | U | Opt-in launcher on Studio edit page | Page context | Content script | Approximation | DOM fragility | P3 | Not started | Kill switch + fixture tests |
| TH-01 | Thumbnail editor / templates / Persian text | TB Thumbnail Generator (S) | S | Canvas workbench on user images, local fonts, brand presets | Local | — | Direct | — | P1 | Not started | Persian shaping correct at small size |
| TH-02 | Small-size / dark previews | seed | B | Previews in feed sizes, light/dark | Local | — | Direct | — | P1 | Not started | — |
| TH-03 | Thumbnail A/B test | TB A/B; YouTube Test & Compare | S | Native handoff with prepared variants; results imported | Native / import | No API known (Unknown) | Native handoff | — | P2 | Not started | — |
| TH-04 | AI thumbnail generation | TB/VQ AI (S) | S | Optional provider | Model output | Image provider | Optional service | Cost | P3 | Not started | — |
| TH-05 | Thumbnail critique | TB thumbnail analyzer (S) | S | Qualitative AI critique, no CTR prediction | Model output | AI provider | Optional service | Cost | P3 | Not started | — |
| TH-06 | Thumbnail upload | seed | B | Explicit apply in M4 | Owner API | thumbnails.set (Inferred) | Direct | Quota | P2 | Not started | — |
| TO-01 | Title / description A/B tests | TB Video A/B Tests | S | Experiment plan + sequential log, labelled observational | Local + owner analytics | — | Approximation | — | P2 | Not started | No causal claims in copy |
| TO-02 | Experiment log | seed | B | Before/after values, dates, observation window | Local | — | Direct | — | P2 | Not started | — |
| TO-03 | Old-video refresh queue | seed | B | Queue of own videos with evidence | Owner API | videos.list, Analytics | Direct | — | P2 | Not started | — |
| TO-04 | Change history / rollback | seed | B | Conditional restore of permitted before-values | Local + owner API | videos.update | Direct | — | P1 (M4) | Not started | Conflict shown when Studio changed it |
| AN-01 | Channel/video reports | TB/VQ analytics | S | Authorized reports with period, timezone, freshness | Owner analytics | YouTube Analytics API, yt-analytics.readonly (Inferred) | Direct | — | P1 (M2) | Not started | — |
| AN-02 | Impressions / CTR | seed | B | Only if API exposes; else Studio CSV import | Owner analytics / import | Unknown | Research required | — | P2 | Not started | — |
| AN-03 | Retention | TB Retention Analyzer | S | Audience retention report where supported | Owner analytics | Analytics audienceWatchRatio (Inferred) | Direct (verify) | — | P2 | Not started | — |
| AN-04 | Traffic sources / search terms | seed | B | Traffic source and YouTube-search terms report | Owner analytics | insightTrafficSourceDetail (Inferred) | Direct (verify) | — | P2 | Not started | — |
| AN-05 | Revenue | seed | B | Only with monetary scope and owner choice | Owner analytics | yt-analytics-monetary.readonly (Inferred) | Direct | — | P3 | Not started | — |
| AN-06 | Realtime / views per hour | VQ realtime (S) | S | Not available via API (Inferred); periodic public counts need policy check | Public API | — | Blocked → Research | — | P3 | Not started | — |
| AN-07 | Channel audit / health report | TB Health Report | S | Actionable review from available evidence, gaps explicit | Owner analytics | — | Approximation | — | P2 | Not started | — |
| AN-08 | Studio CSV import | seed | B | Import with provenance, period, units, timezone, formula-safe | Import | — | Direct | — | P1 (M2) | Not started | Wrong-channel and duplicate-row tests |
| BK-01 | Bulk find/replace/append metadata | TB bulk tools | S | Dry run, exclusions, backup, explicit commit, per-item result | Owner API | videos.list/update, youtube scope | Direct | Quota | P1 (M4) | Not started | Unedited fields preserved test |
| BK-02 | Bulk thumbnail overlays | TB (S) | S | Overlay on owned images, preview, apply per video | Local + owner API | thumbnails.set | Direct | Quota | P3 | Not started | — |
| BK-03 | Bulk playlist operations | TB (S) | S | Add/remove with dry run | Owner API | playlistItems.* | Direct | Quota | P2 | Not started | — |
| BK-04 | Metadata backup / export of own videos | seed | B | Export current metadata before any write | Owner API | videos.list | Direct | Quota | P1 (M2) | Not started | — |
| BK-05 | Bulk cards / end screens | TB (S) | S | Guided handoff checklist | Native | No API (Inferred) | Blocked → Native handoff | — | P3 | Not started | — |
| BK-06 | Scheduled updates | TB (S) | S | Local due list with overdue state; browser-closed needs service | Local | — | Approximation / Optional service | — | P3 | Not started | Missed jobs visible after sleep |
| BK-07 | Local data backup / import | seed | B | JSON backup, validated import, undo | Local | — | Direct | — | P1 | **Verified** | unit + e2e |
| CM-01 | Comment inbox / filters | TB/VQ (S) | S | Inbox of own channel comments | Owner API | commentThreads.list (Inferred) | Direct | Quota | P2 | Not started | — |
| CM-02 | Canned replies | TB (S) | S | Local reply templates; explicit post | Local + owner API | comments.insert | Direct | Quota | P2 | Not started | — |
| CM-03 | AI reply drafts | seed | B | Drafts only, never auto-post | Model output | AI provider | Optional service | Cost | P3 | Not started | — |
| CM-04 | Moderation actions | seed | B | Explicit, scoped; no AI-triggered deletion | Owner API | comments.setModerationStatus (Inferred) | Direct | — | P3 | Not started | — |
| CE-01 | Card / end-screen templates | TB (S) | S | Templates + timing notes + Studio handoff | Local / native | No API (Inferred) | Native handoff | — | P3 | Not started | — |
| CE-02 | Link inventory / broken links | seed | B | Extract links from own descriptions; checking URLs needs extra host permission | Owner API | — | Research required | Permission | P3 | Not started | — |
| PR-01 | Share links, embeds, UTM templates | seed | B | Generators for own videos and products | Local | — | Direct | — | P2 | Not started | — |
| PR-02 | Localized promo drafts | seed | B | AI drafts on request | Model output | AI provider | Optional service | Cost | P3 | Not started | — |
| PR-03 | Social monitor | TB Social Monitor (S) | S | — | — | — | Out of personal scope | — | — | Deferred | — |
| AI-01 | Channel-aware assistant / coach | VQ AI Coach (S) | S | On-demand, evidence-bounded, one provider | Model output | AI provider | Optional service | Cost, budget cap | P2 (M3) | Not started | Budget stop tested |
| AI-02 | Scripts, hooks, outlines | VQ AI script (S) | S | Editable drafts | Model output | AI provider | Optional service | Cost | P2 | Not started | — |
| RP-01 | Clip suggestions | TB/VQ Shorts (S) | S | From supplied/owned transcripts | Supplied / owner API | — | Optional service | — | P3 | Not started | — |
| RP-02 | Vertical rendering / Shorts creation | TB AI Shorts (S) | S | Local companion only if needed | Local media | — | Optional service | Companion app | P3 | Deferred | — |
| RP-03 | Subtitle preparation | seed | B | Owned captions, supplied files | Owner API / supplied | captions.* | Direct | — | P3 | Not started | — |
| HU-01 | Connection / quota status | seed | B | Shows unconnected states now; quota/freshness in M2 | Local | — | Direct | — | P1 | In progress | Settings shows each connection state |
| HU-02 | Custom links, reminders, milestones | seed | B | Local list, reminders via alarms with missed-state | Local | alarms permission (not yet requested) | Direct | — | P3 | Not started | — |
| HU-03 | Context detection + side panel | seed | B | URL-first detection, DOM enrichment guard, kill switch | Page | Content script | Direct | DOM fragility | P1 | **Verified** (fixtures) | unit + e2e; live YouTube unverified |
| HU-04 | Persian/English, RTL, themes | seed | B | Instant switch, Persian digits/calendar | Local | — | Direct | — | P1 | **Verified** | e2e |
| EC-01 | Vendor MCP / AI integrations | VQ (U) | U | Track only | — | — | Research required | — | P3 | Deferred | — |
| EC-02 | Mobile apps | TB/VQ mobile (U) | U | — | — | — | Out of personal scope | — | — | Deferred | — |
| EC-03 | Coaching / professional services | VQ Coaching (S) | S | — | — | — | Out of personal scope | — | — | Deferred | — |
| EC-04 | Other platforms (Instagram, TikTok) | seed | B | — | — | — | Out of personal scope | — | — | Deferred | — |

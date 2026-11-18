# TubeX — Claude Code Implementation Handoff

**Prepared:** 2026-11-18  
**Language:** Persian product requirements; English code identifiers and commit messages  
**Repository:** `iHMahmoodiX/TubeX`  
**Execution order:** **Stabilization → High-impact YouTube development → Aparat support LAST**  
**Status:** Authorized development plan, **not** a claim that proposed features have been implemented.

> **START HERE, CLAUDE CODE.** You are the lead engineer and product architect for the existing TubeX codebase. Work autonomously on safe, scoped implementation, make informed engineering decisions, minimize token/credit expenditure, verify every change, and report actual results. **Do not rebuild the app, reread the entire repo, or attempt all features in one giant commit.** Preserve current production behavior and user data. The owner specifically wants useful new YouTube features first and Aparat only after those are delivered.

---

## 0. Owner's outcome and the development contract

TubeX is a **local-first Chrome/Edge MV3 extension**, optimized for one Persian-speaking creator operating multiple YouTube channels. It should reduce the time required to **discover worthwhile topics, prepare titles/thumbnail, improve existing videos, publish consistently and reuse the same content on Aparat**. Prefer gains to actual publishing/optimization throughput, **not feature-count parity** with TubeBuddy or vidIQ.

Priorities, in order:
1. Protect existing working features, data, Google sign-in, undo, and user trust.
2. Deliver **observable creator workflows** in YouTube before starting Aparat.
3. Maximize reuse of current research, reports, SEO, thumbnail, Studio integration, and Gemini code; no speculative platform rewrite.
4. Prefer free/owner-supplied APIs and deterministic logic; avoid new paid subscriptions or external services.
5. Keep scope narrow: one milestone and one clean PR at a time; if a new feature doesn't clearly remove steps or improve decisions, simplify or park it.
6. **Do not start Aparat implementation until the owner-relevant YouTube milestone set is completed and verified.** A time-boxed read-only feasibility memo may be prepared earlier only if it does not interrupt YouTube delivery.

Decision categories: **Do now / Do next / Validate first / Maintain / Park / Drop**. No features from Park/Drop are part of the authorized implementation scope. Do not add a new major side project or create a backend by default.

**Non-negotiable operational safety:** No live upload, publication, social posting, destructive operation, paid API call, live YouTube metadata write, token-server deployment, or store submission without the existing user confirmation gates and separately appropriate authorization. In-page editing of a visible Studio form happens only after a user click; final Save belongs to Studio unless a separately approved supported API write is used. Always preserve preview, exact video IDs, before-values and conditional undo when possible.

---

## 1. Reliable repository checkpoint — do not rediscover this

### Confirmed state as of 2026-11-18

| Item | Confirmed checkpoint |
|---|---|
| Repo | `https://github.com/iHMahmoodiX/TubeX` |
| Default branch | `main` |
| Development PR | [#1](https://github.com/iHMahmoodiX/TubeX/pull/1), **merged**; merge commit `3432e29e924f6fe256dc797f32c69d727d4b8691` |
| Current app version | `0.5.3` (`package.json`) |
| Release | [v0.5.3](https://github.com/iHMahmoodiX/TubeX/releases/tag/v0.5.3) with `tubex-0.5.3-chrome.zip` |
| Release pipeline | `.github/workflows/release-v0.5.3.yml`, [successful run 44254314177](https://github.com/iHMahmoodiX/TubeX/actions/runs/44254314177) |
| Post-release docs checkpoint | `docs/NEXT.md`, amended 2026-11-18; main SHA at this memo's initial read `a0d9eef6f8ee3265ab05c297079d89f8ddcbe967` (**check current HEAD before changes**) |
| Existing task registry | [Issues #9–#17](https://github.com/iHMahmoodiX/TubeX/issues), **already created** — update these, do not duplicate |
| Older feature feedback | Issues #2–#8 remain open until verified on a live YouTube/Edge session |

**Test evidence vs. reality:** The GitHub release workflow successfully ran install, TypeScript checks, unit tests, production build and ZIP packaging. An older local checkpoint reported **486/486 unit tests** and **16/16 synthetic-fixture E2E**. **Neither is proof that every real Google OAuth flow, Studio selector, Reporting call or multi-video write works**. Live Edge/Windows browser testing, real API calls and optional persistent sign-in backend remain separate verification gates.

**Architecture in use, not a proposal:** TypeScript + React 19 + WXT + Vite + Manifest V3; background service worker with RPC and `chrome.alarms`; local IndexedDB v3 (`src/storage/db.ts`) plus preferences in `chrome.storage.local`; shadow-root in-page UI; per-channel model; Google OAuth; optional Supabase function for persistent refresh. `ARCHITECTURE.md` contains outdated M1-era descriptions and **must not be treated as the sole truth for v0.5.3**.

### Existing source — REUSE, do not rewrite

| Existing area | Key paths | Reuse for |
|---|---|---|
| Workbench & navigation | `entrypoints/workspace/App.tsx`, `entrypoints/sidepanel/`, `src/components/` | Route changes, UI, navigation |
| Analytics & opportunities | `src/features/reports/`, `src/domain/reports*.ts` | Optimize Queue, evidence, retention, CTR, existing Opportunity Finder |
| Research & rank | `src/features/research/`, `src/features/ranks/`, `src/domain/research.ts` | Outlier Lite, topic ideas, search insights |
| Competition | `src/features/competitors/`, `src/domain/channelInsights.ts` | Compare/watchlist, candidate outliers |
| Drafts & ideas | `src/features/ideas/`, `src/features/drafts/`, `src/features/templates/`, `src/domain/metadata.ts` | Source-linked idea → draft → variant workflow |
| Thumbnail | `src/features/ai/ThumbnailMaker.tsx`, `ThumbnailCheck.tsx`, `src/features/thumbs/` | Thumbnail previews, variants |
| In-page YouTube | `src/inpage/youtube/{SearchTools,WatchCard,Videolytics,ChannelStrip}.tsx` | Supported page context and limited overlays |
| In-page Studio | `src/inpage/studio/`, `src/inpage/launch/` | Native handoffs; selectors are fragile, use fixtures |
| Bulk & scheduling | `src/features/bulk/`, `src/background/jobs/bulk.ts`, `src/features/schedule/` | Transaction-like previews, checkpointing, rollback patterns |
| AI integration | `src/integrations/ai/{provider,custom,run,tasks}.ts`, `src/features/connections/ConnectionsSettings.tsx` | **Already has Gemini preset**; budgeted requests and JSON validation |
| Google auth & writes | `src/integrations/google/{auth,codeFlow,refreshStore,own,ownWrites}.ts`, `server/supabase/` | Existing OAuth and token flow; avoid duplicate systems |
| Browser boundary | `src/platform/{rpc,pageContext,permissions,youtubeDom}.ts`, `src/background/methods/` | Checked, typed privileged interactions |
| Local persistence | `src/storage/{db,stores,prefs,cache}.ts`, `src/domain/{models,records,backup}.ts` | Single schema owner, migrations, backups |
| i18n, visual contracts | `src/i18n/`, `src/styles/`, `DESIGN.md` | Persian RTL + English parity |
| Build & testing | `package.json`, `TESTING.md`, `tests/unit/`, `tests/e2e/` | Targeted verification and real E2E |

**Do not assume** a module is fully functional solely because the file exists. Examine affected exports/handlers and tests, then prove the specific behavior. Repo and file paths above are the working map; **there is no need for another full-repo audit** unless the HEAD or architecture has materially changed.

### Current features already implemented in source

- Keyword Research/Compare, Trending, saved terms, search rank/tag rank, Alerts, Watchlist, competitor comparisons, niche/channel insights.
- Source-linked ideas, local drafts, title/description/tag editor, AI suggestions, templates, metadata checks and previews.
- Reports: Health, best practices, retention, Best Time (estimate), Click Magnet reporting, Opportunities and Ad-friendliness.
- YouTube and Studio page integrations: Videolytics, Channelytics, search result hints, tag tools, launchers/drawer, Studio bulk menu, Shorts related-video guided handoff.
- Advanced Persian-aware Bulk Find & Replace with diff, filters, job progress and conditional undo; playlists, comments, moderation, thumbnails overlays, scheduling and COPPA tools.
- Local backup/import, multi-channel Google sign-in code, optional Supabase refresh server, Persian/English/RTL.

**The requested features are improvements and integrations of this base, not a rewrite.**

---

## 2. Execution plan: YouTube FIRST

Issue links below are canonical. **Do not create duplicates.** For each stage, first define a small implementation slice, relevant files, baseline tests and acceptance evidence; implement and verify; then update the same Issue and `docs/NEXT.md`.

### Y0 — Release stabilization, API policy and Gemini compatibility (**P0; #9 and relevant #15**)

**Issue:** [#9](https://github.com/iHMahmoodiX/TubeX/issues/9)  
**Why:** A new feature is worthless if auth/bulk/reporting/data recovery are unreliable.  
**Required before broad new functionality:**

- In Edge and Chrome, validate multi-channel Google sign-in, Brand Accounts, token refresh after browser restart, reconnect and OAuth consent errors. Optional Supabase `google-token` backend **is source code only until live deployment is confirmed**; do not deploy without separate approval/secrets supplied via secure console.
- Check YouTube watch/search/channel/Studio DOM selectors on real pages and preserve kill switches; update sanitized fixtures if necessary. Reconcile legacy Issues #2–#8 based on live evidence, not age of code.
- Audit live Click Magnet/Reporting API and the jobs' pause/resume/undo, cache, backup and errors; test bulk **first on a single explicitly approved owned video**, no accidental writes. Any failure retains work.
- **Verify 2026 YouTube Data API quota model.** Official docs currently describe default **100 `search.list` calls/day**, **100 `videos.insert` calls/day**, plus **10,000 units/day for other endpoints**; do not rely on old combined `search.list` 100-units-per-call budgeting. Read official latest docs and Cloud Console limits before changing rate accounting: https://developers.google.com/youtube/data/determine_quota_cost and https://developers.google.com/youtube/data/revision_history.
- Verify policies on composite/derived metrics, caching, public-data history, quotas, and access scopes; mark unverified facts *unknown*, not zero. Do not invent search volume or guarantee improvement.
- **Gemini priority:** `src/integrations/ai/provider.ts` currently defaults to `gemini-2.5-flash`, with provider URL `https://generativelanguage.googleapis.com/v1beta/openai`. Google's current deprecations page says **API calls to this model automatically route to `gemini-3.5-flash-lite` on 2026-12-01**, with pricing/API compatibility implications: https://ai.google.dev/gemini-api/docs/deprecations. Check live `/models` with owner's own key if already configured, test the JSON/vision behaviors and supported low-cost models, migrate the preset safely and maintain existing saved configs. **Do not assume the key is already stored or available to the agent; do not ask for it in chat.**
- Strengthen release CI with fixture E2E **only if headless dependencies and Actions budget permit**. Avoid automatically republishing the same `v0.5.3` tag on documentation-only commits; subsequent code versions should use a new semver tag.

**Acceptance:** documented test matrix for Chrome + Edge, explicit pass/fail for live auth/reporting/bulk on approved account, safe rollback, correct quota gates, Gemini supported-model selection, all tests pass and no data loss. If owner credentials/test permission are missing, complete **read-only and fixture work** and label live tests blocked; do not stop all independent work.

### Y1 — Optimize Queue for existing uploaded videos (**high impact; #10**)

**Issue:** [#10](https://github.com/iHMahmoodiX/TubeX/issues/10)  
**Product outcome:** After opening TubeX, the creator sees the *few existing videos worth improving now*, with an understandable reason and a direct next action.

**Implementation slices:**
1. Reuse existing health, retention, Opportunity Finder and Click Magnet data. Audit duplicate data fetches; prefer one hydrated data set. Build a compact per-channel **Improve queue**: last measured date, data freshness, title/thumbnail flags, a small explanation, and an explicit reason for priority. No unsupported prediction.
2. Candidate signals: low available CTR with meaningful impressions; watch retention/engagement evidence; proven topic but weak packaging; old evergreen video with current relevant traffic. Respect missing/insufficient samples. Do not create a pseudo-scientific composite score without YouTube policy clearance.
3. For the selected video, show title & thumbnail options, editor/Studio handoff, current values, and a lightweight before/after observation log. Use existing AI generator optionally, never background AI calls.
4. Persist queue actions locally with channel/video identity and safe migration; prevent cross-channel edits. Offer mark done/snooze or dismiss (not a task-management suite).

**Acceptance:** `Reports/Opportunities → Improve queue → evidence → modify draft → preview → native Studio handoff → log outcome`. A user can complete the flow without AI and without paid data. Test low-data channel, zero impressions and unavailable CTR. Track time/steps to first actionable improvement.

### Y2 — Connect Research → Idea → Draft → Optimize (**high impact; #14**)

**Issue:** [#14](https://github.com/iHMahmoodiX/TubeX/issues/14)  
**Product outcome:** Stop duplicating keyword, channel, title, source URL and notes across disconnected screens.

- From YouTube video/search/channel/competitor research create a provenance-linked Idea in at most **two deliberate actions** after initial setup.
- Preserve selected channel, topic, source URL, retrieved time, language, intent, relevant public signals and optional focus keyword into Draft and Thumbnail workflows. Reuse existing typed models/schema migrations; do not introduce a second Idea store.
- Build an efficient **next action**/stepper rather than a new page hierarchy. Maintain draft autosave, undo, copy/export and recoverability when navigation changes; prevent mismatched channel context.
- Optional AI generates a brief/title variant on explicit request only. Validate long Persian text, نیم‌فاصله, mixed English, RTL and 320px panel.

**Acceptance:** one end-to-end real-looking user journey measured for interaction count and data retained after restart, no regression to current Ideas/Drafts/Templates flows. No broad UI redesign.

### Y3 — Native A/B testing assistant, then contextual Thumbnail previews (**#12 then #13**)

**Issues:** [#12](https://github.com/iHMahmoodiX/TubeX/issues/12), [#13](https://github.com/iHMahmoodiX/TubeX/issues/13)

- For owned video, prepare **up to 3 editable title/thumbnail variants** with rationale, image source, experiment notes, version/date and hypothesis. Reuse ThumbnailMaker/ThumbnailCheck and current drafts.
- Hand off to **YouTube Studio's supported Test & Compare** UI where available; do **not** call hidden endpoints, create fake automated tests or claim causal wins from before/after experiments. Clearly handle eligibility differences, user-controlled saves and results not exposed through an API.
- Allow manually entering/importing results with provenance and a decision log, or reading only from an approved API. Preserve variants for later comparison.
- In existing ThumbnailCheck add compact YouTube desktop/mobile feed/search-preview contexts, with optionally permitted competitor public thumbnails. Make it clear that a visual mockup is not a CTR forecast. Ensure readable Persian typography/RTL.

**Acceptance:** variant drafts → compare in small-size contexts → official Studio handoff → result journal. User doesn't have to leave/re-enter data repeatedly. Avoid image-generation services and automatic account changes.

### Y4 — Personalized recommendations with **existing** Gemini, plus Ask Studio handoff (**#15**)

**Issue:** [#15](https://github.com/iHMahmoodiX/TubeX/issues/15)

- DO NOT create a separate AI service or duplicate provider logic. Confirm the configured Gemini model, permissions and minimal connection test in the existing AI adapter; preserve Ollama/custom-compatible provider options.
- Assemble only **allowed, authorized, relevant, dated evidence** from existing own-channel analytics and the selected queue/video; reduce context locally. On-demand request: 2–3 specific suggestions with proof/data freshness, estimated effort (not guaranteed views/revenue), actionable next step and confidence limits. Validate structured JSON before rendering.
- Compare with existing `Opportunities` rules. If deterministic logic already generates the same advice, **reuse the rule and skip the AI call**; Gemini should explain or personalize only when it adds distinct value.
- Ask Studio belongs to YouTube Studio; **no supported public third-party Ask Studio API is confirmed**. Implement native open/handoff and optionally copy a prompt that includes only information user chooses to share. Do not scrape Studio private endpoints, cookies or Ask Studio conversations.
- Consent for sending channel data to Gemini, user-initiated calls, request quota, token/output cap, monthly money limit, a no-AI fallback, redacted logs, cache invalidation and “regenerate” control.

**Acceptance:** on-demand creator suggestions supported by source/date, zero fabricated numbers, no AI calls during page navigation, predictable cost and a graceful offline/no-key path.

### Y5 — Outlier Discovery Lite after short policy/demand validation (**#11**)

**Issue:** [#11](https://github.com/iHMahmoodiX/TubeX/issues/11)

**Validate first:** confirm 2026 YouTube derived-metric and data retention requirements, useful region/language filters, actual per-project search quota, and evidence the creator will use this to choose ideas. Do not consume a large search budget to imitate vidIQ.

**Small MVP:** reuse existing competitor Watchlist and research result samples; discover recent/strong-performing candidates by topic, channel, period, region and language using only **permitted data**, show sample size and collection time, then offer **Save as Idea**. If a proprietary/derived outlier score is not allowed, show raw public facts and qualitative flags rather than fake “outlier x15” figures. If discovery quality is poor, limit the feature to an easily understood saved shortlist instead of building more research infrastructure.

**Acceptance:** useful results at bounded API calls, transparent sampling, stable policy handling, one-click idea capture. No crawler or paid dataset.

### YouTube milestone gate before Aparat

All primary YouTube features (#10, #14, #12, #13, #15, and permitted #11 scope) must reach a verified, usable state or be explicitly marked **validated-but-unbuildable with reason**. Confirm UX flows, regression tests, source changes, release notes, and one trusted build. Do **not** infer a successful live run from unit tests. Update all issues, close only verified acceptance, and preserve milestone checkpoint. Only then move to Aparat.

---

## 3. Aparat LAST — two gated stages, not a parallel project

### A0 — Verify API, permissions and feasibility (**#16; research only**)

**Issue:** [#16](https://github.com/iHMahmoodiX/TubeX/issues/16)

As of this handoff, `https://api.aparat.com/` is a documentation landing portal but a public, stable, officially supported API contract for third-party OAuth, uploads, writes, and analytics **has not been confirmed**. Unofficial older `/etc/api` or `/api/fa/v1` routes and cookie-based upload scripts are **not authorization** to integrate them. The third-party `sepehr071/aparat-mcp` is unofficial/read-oriented and has a **PolyForm Noncommercial** license in the reviewed version: do not bundle its implementation without license verification/permission.

**Research checklist:**
- Obtain primary-source Aparat developer/API docs or explicit support confirmation: scopes, stable search/video/channel metadata, likes/comments, own stats, thumbnail, upload, schedule, bulk edit, publishing and rate limits.
- Verify written terms, consent, cache/retention, scraping restrictions, commercial licensing, security and allowed integrations. Distinguish supported API, visible-page context, manual import/export, and impossible/unsafe.
- Verify current native publishing constraints on official support pages: **description up to 2,000 characters**, **3–5 tags each up to 23 characters**, and **cover recommendation 1920×1080 (16:9)** were noted previously; **recheck exact live rules before encoding them**. Native dashboard supports upload, metadata, playlists and scheduling.
- Produce a **dated capability matrix**: `Capability | Official source | Supported? | Auth | Quota | Risk | Recommended implementation`.
- Do not implement a reverse-engineered upload service or request account cookies.

**Acceptance:** trustworthy API/terms matrix and a yes/no decision for each feature, no unsupported assumptions or credentials needed for initial research.

### A1 — Aparat Creator Companion within TubeX (**#17**)

**Issue:** [#17](https://github.com/iHMahmoodiX/TubeX/issues/17)

**Business goal:** one finished video becomes ready to publish on **YouTube and Aparat**, with low effort and per-platform SEO metadata. Focus on accelerating re-publication of already-created content, not launching a separate Aparat product.

**MVP user journey:**
`Existing video / Idea / Draft → Choose YouTube + Aparat → automatically prepare editable, platform-specific packages → check title/description/tag/cover constraints → copy/export/open Aparat native upload or edit page → human Save/Publish → optionally record Aparat URL and publication status.`

**Proposed thin slices:**
1. Add **opt-in** Aparat page-context awareness for public video/search/channel and official native upload/edit URLs, behind host permission + kill switch. Start read-only: capture canonical URL/title visible on page as a source-linked idea; do not scrape account credentials or internal API.
2. Extend existing Draft/metadata model to support an optional typed `platform`/`platformTargets` and independent platform-specific metadata, preserving **existing YouTube records by default** through migration. A shared content object can link both outputs; channel/account IDs must remain isolated and type-safe. No speculative generic plugin architecture.
3. Add Aparat metadata preset and validator: title, description, tags, category, cover ratio/resolution, optional playlist, subtitles and scheduling notes. Constraints are configuration derived from official docs, separately tested; never apply YouTube limits to Aparat by accident.
4. Build platform-specific **copy/export package** with a native Upload/Edit page handoff. Optional **click-to-fill visible form fields** only when user deliberately invokes it and real DOM fixtures prove selectors; always leave final Save/Publish to Aparat. If selectors drift, fail visibly and fall back to copying metadata.
5. Save native publication URL, platform, status (draft/prepared/uploaded/published/manual verification), date and update note locally. Do **not** claim it was uploaded based on a click alone.
6. Public search/competitor context and basic analytics only if A0 confirms policy-permitted APIs; otherwise expose manual data import/CSV and explicit unsupported state. Never spoof or automate login.

**MVP acceptance:** one source produces **two editable packages** and a correct Aparat handoff, with no expensive backend, no undocumented write endpoint, no lost YouTube data, Persian RTL tested and permission prompts deferred until necessary. Do not attempt multi-account bulk uploads or an Aparat scheduler without supported API.

---

## 4. Engineering architecture — THINK independently, change minimally

Before implementing each **major** phase, produce a **short architecture decision** (problem, reuse candidates, 2 viable options, expected latency, API cost, maintenance, security, testing, migration, chosen option). You are encouraged to improve the proposed designs if measurable benefits justify it. **Do not turn this handoff into unquestioned architecture instructions**; verify existing code first.

Guardrails:

1. **Default: keep WXT/React/TypeScript MV3 and one package.** Avoid a rewrite, new monorepo, generic framework or extra backend unless a concrete blocking requirement is demonstrated.
2. **Domain boundary:** deterministic rules in `src/domain/`; provider integrations in `src/integrations/`; privileged calls in background RPC; presentational UI in `src/features/` and `src/inpage/`; persistence only through `src/storage/db.ts`. Use existing typed contracts; avoid parallel data caches and duplicate business logic.
3. **Platforms:** YouTube is the existing implementation. When Aparat starts, consider a **small capability-gated adapter** for `PlatformId = 'youtube' | 'aparat'` with `prepareMetadata`, `validate`, `openNativeEditor` and optionally `readPublicData` where lawful. Add only interfaces needed by actual features. Keep platform-specific writes and credentials separate. Never force every YouTube feature into a generic adapter.
4. **Migration:** optional fields with backward-compatible YouTube defaults, schema revision, migration tests, full backup/restore test, channel-bound keys. Never overwrite existing drafts or reinterpret YouTube-owned video IDs as Aparat IDs.
5. **API & security:** verify user/channel identity and capability before a write, use preview/confirm/re-fetch current values, prevent stale overwrite, conditional undo. Respect quotas, pagination, retries, backoff and temporary account errors. No undocumented YouTube/Studio or Aparat endpoints, cookies or broad origins; limit optional host permissions to approved domains; content scripts untrusted and shadow-root isolated.
6. **MV3 performance:** service worker may be terminated; checkpoint jobs to IndexedDB, rely on alarms not indefinite timers, reconcile uncertain outcomes; lazy-load in-page panels, minimal observers, no busy polling. Avoid changes that slow YouTube playback or Studio.
7. **AI:** Gemini/Ollama/custom via existing adapter only; no mandatory cloud service. User click → selected evidence → bounded prompt → validated typed response → editable suggestion → deterministic preview → explicit action. Never execute AI-provided instructions from page data.
8. **Design:** follow existing Spotify-inspired dark UI and components, Estedad, Figtree where present, true Persian RTL and English LTR, responsive side panel, keyboard/focus, WCAG-aware contrast and reduced motion. No gratuitous redesign.
9. **Data provenance:** all metrics display source/date/channel/period; distinguish *Measured*, *Estimated*, *Sampled*, *AI suggestion*, *Unknown*. Never fabricate Search Volume or predict CTR without defensible data.
10. **User value:** for every proposed interface ask “what decision/action becomes quicker?”; choose fewer integrated steps over a new tab.

---

## 5. Verification / release checklist — required for every slice

- [ ] Confirm `git status` clean, `git rev-parse HEAD`, current Issues and relevant source; no unrelated changes or stale base. Use a feature branch; open focused PR to `main`. No force-push.
- [ ] Summarize scope, existing code reused, exact files changed and why. Check public-repo diff for secrets before commit.
- [ ] Add regression/unit tests for all domain/migration behavior; maintain i18n key parity (`fa` and `en`). Update sanitized DOM fixtures for affected in-page integrations.
- [ ] Run targeted tests during iteration; before merging run `npm run typecheck && npm test && npm run build` and `npm run e2e` for UI/in-page changes. Record counts and environment **as actually run**.
- [ ] Test Chrome and Edge on realistic pages when available; if not, label unavailable/live validation pending and do not claim complete.
- [ ] On API writes, require exact targets, preview, explicit user confirmation and conditional restoration where applicable. Backup test before mass data migrations.
- [ ] Test missing permissions, exhausted daily search quota, revoked OAuth, multi-channel context switch, AI timeout/budget, absent metrics, browser restart, duplicate service worker jobs, failed migration, offline, unsupported page and partial success.
- [ ] Verify no regression to Bulk, COPPA, comments, playlist manager, scheduling, CTR reporting, in-page toolbar, backup or sign-in.
- [ ] Update the **existing** Issue status/acceptance and any dependent issue; update `CHANGELOG.md` when user-visible, `docs/NEXT.md` at meaningful gates and `docs/DECISIONS.md` for material changes. Release a new semver version only after necessary checks; do not silently overwrite the old release.

**Caution:** Browser-installed extension UI, external API responses and YouTube/Aparat DOM may differ from fixtures. A build is not proof of account-level compatibility.

---

## 6. Aggressive, safe reduction of Claude tokens/credits

**Goal:** minimize irrelevant reading/rework, not skip correctness.

### Single startup read and scope control

At task start run:

```bash
git status --short
git branch --show-current
git rev-parse --short HEAD
# Then read only these lightweight context files:
cat AGENTS.md
cat docs/NEXT.md
# This handoff is the one-time task brief, not an always-loaded prompt.
```

- On a fresh chat read **this document once**. For each new task use **Issue # + relevant file map above + `docs/NEXT.md`**, not all docs. `README.md`, `ARCHITECTURE.md`, `docs/MASTER_BRIEF.md`, `docs/FEATURE_MATRIX.md` and `docs/INTEGRATIONS.md` are **on-demand**, and may contain historical, stale or proposed states.
- Start with the exact target Issue; identify 3–8 candidate files, then `rg` narrowed to that subtree. E.g. `rg -n 'Opportunities|ClickMagnet' src/features/reports src/domain` rather than `grep -R` across repo.
- Exclude `node_modules`, `.output`, `.wxt`, generated assets, `package-lock.json` bodies, screenshots, dist, and unrelated tests from normal context; open lockfile only for dependency tasks.
- Record verified implementation and APIs in **one authoritative document** instead of duplicating lists in new docs. Avoid regenerating competitor research already summarized in Issues #9–#17 unless a source changed or it affects a critical decision.
- Do not start multiple subagents by default, hold redundant reviews/model debates, read every skill, or run a full audit per commit. Use one agent and one issue. Open a focused skill only for a matching bug/test/design task.

### Small, independently verifiable work

- Before changes: output <=12-line mini-plan containing **goal, touched files, reuse, tests, risk and expected user benefit**. If uncertain, read the smallest relevant code and choose a reasonable implementation.
- Ship one **vertical slice** per PR: data rules + persisted state + UI + tests where needed. Prefer 1–3 coherent commits rather than a huge rewrite.
- Reuse existing hooks, components, handlers, cache and AI providers. Do not generate unused abstractions or create a second service to save trivial code.
- Use focused diffs; avoid global formatting, massive design iterations, dependency upgrades or unrelated lint refactors.
- Run targeted tests first, summarizing pass/fail. Run full checks at PR/release gates, not on every tiny edit. Save verbose logs locally and only read the failing excerpt.
- Cache valid source evaluations and snapshots with date+scope; re-open upstream docs only on relevant changes. Never silently assume cached policy is still current at a go-live gate.
- Avoid periodic AI calls, model requests on every keypress and repeated API searches; request on click, set token/usage caps, deduplicate and cache permitted responses keyed by channel, model, task, input and prompt version.
- At handoff update **`docs/NEXT.md` by replacing the old checkpoint**: repo SHA, finished Issue/PR, what actually works, commands and results, blockers, next one task and exact files. Make the next session continue from this rather than starting another audit.
- Developer output each milestone: **What shipped / Evidence / Changed paths / Unresolved risks / Next issue**. Keep it concise. Never invent token-cost savings percentages.

### Suggested execution ledger (update in issue, not more files)

| Phase | Issue(s) | State at handoff | Priority |
|---|---|---|---|
| Release hardening, Gemini/quota | #9 + #15 dependency | Open; release built but live proof pending | NOW |
| Improve/Optimize Queue | #10 | Open, not yet implemented | 1 |
| Connected creator flow | #14 | Open, not yet implemented | 2 |
| Native A/B assistant | #12 | Open, not yet implemented | 3 |
| Thumbnail context previews | #13 | Open, not yet implemented | 4 |
| Personalized Gemini recommendations | #15 | Open, not yet implemented | 5 (model compatibility earlier) |
| Outlier Lite | #11 | Open; policy/need validation first | 6 / validate |
| Aparat API/legal discovery | #16 | Open; do last | 7 |
| Aparat native creator companion | #17 | Open; dependent on #16 | 8 |

---

## 7. Definition of Done — product-level

The project succeeds when a creator can: **(1)** select a real YouTube video that deserves improving, **(2)** get an evidence-linked optimization recommendation, **(3)** prepare and compare title/thumbnail variants, **(4)** perform native Studio actions with explicit consent, **(5)** record results, **(6)** discover new topics efficiently, **(7)** optionally request channel-specific Gemini suggestions, and finally **(8)** prepare an Aparat-ready metadata/cover package from the same content without redundant typing. Existing extension features and data must remain intact.

### Claude Code execution instruction

**Proceed from Issue #9 first.** Inspect only its code neighborhood, decide a minimally invasive design, implement the maximum safe portion independently, verify actual behavior and open a focused PR. Advance YouTube stages in the priority order above, only after their acceptance gates. **Do not jump straight to Aparat**, do not automatically pay for services, and do not claim an untested release is production-verified. Report blockers precisely and continue safe independent tasks where possible. Maintain the smallest useful context throughout.

---

## 8. Primary reference links (read only when necessary)

- Canonical tasks: https://github.com/iHMahmoodiX/TubeX/issues
- Current release: https://github.com/iHMahmoodiX/TubeX/releases/tag/v0.5.3
- Current source files: https://github.com/iHMahmoodiX/TubeX/tree/main/src
- Google API quota: https://developers.google.com/youtube/data/determine_quota_cost
- YouTube API changes: https://developers.google.com/youtube/data/revision_history
- YouTube API developer policy: https://developers.google.com/youtube/terms/developer-policies
- Gemini model deprecations: https://ai.google.dev/gemini-api/docs/deprecations
- Gemini model availability: https://ai.google.dev/gemini-api/docs/models
- Official Aparat support: https://support.aparat.com/
- Aparat API documentation portal (public contract *unverified*): https://api.aparat.com/

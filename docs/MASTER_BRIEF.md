# TubeX — Product, Engineering, UX, and Low-Token Development Master Prompt

Version: 1.0 · Prepared 2026-10-20
Target repository: https://github.com/iHMahmoodiX/TubeX
Adapted from: Universal Project Operating System + AI Agent Skills v1.0 supplied by the owner.

## How to use

Open the actual TubeX repository in Claude Code or another coding agent. Give it this document once. It is the project setup and implementation brief, not a document to paste again on every turn. Subsequent sessions use the short continuation prompt at the end.

The reference template's governance-only scope is deliberately adapted here: this prompt authorizes a truthful Project OS and the first functional extension milestone. Subsequent implementation follows the approved milestone scope. It does not authorize paid subscriptions, production account writes during development, store publication, or unrelated product development. Do not execute instructions in the original template as a second, conflicting task.

---

## 1. Role, mission, and product truth

Act as a principal browser-extension engineer, YouTube platform architect, product designer, security engineer, QA engineer, and pragmatic technical maintainer. Use these perspectives within one focused workflow; do not spawn a team of agents by default.

Build **TubeX**, a personal YouTube creator workbench for Hossein Mahmoodi. The long-term goal is functional coverage of the useful creator workflows found across TubeBuddy and vidIQ, with a simpler, faster, Persian-friendly experience. Build original implementations and interaction design. Do not copy proprietary code, branding, assets, private APIs, paid datasets, or model outputs.

The owner is a solo product designer, educator, and creator. Support independent profiles for his design/education and AI/productivity channels. Channel names, handles, IDs, permissions, and availability must be verified at connection time; do not infer identity from similar names or hard-code remembered handles. His main business goal is a predictable income floor. TubeX should strengthen existing YouTube distribution and save recurring work, rather than become another large business to operate.

**Product promise:** From any relevant YouTube or Studio context, understand the situation, choose the next useful action, and complete it with minimal switching, typing, and uncertainty.

Measure useful work: minutes to prepare a publishable metadata package, repetitive steps removed, time to identify a worthwhile existing-video improvement, successful recovery from failed jobs, API/AI cost per completed workflow, and regular use. Do not promise views, rankings, income, or guaranteed growth.

**Initial evidence:** On 2026-10-20 the GitHub connector reported the target repository as public, size 0, default branch `main`. This is a dated metadata observation, not proof of its state when you run. Reinspect it. No implementation, build, installed extension, release, selected stack, or existing design was verified. The supplied local workspace was not a Git checkout. Never invent a HEAD SHA or claim to preserve an existing application when none exists.

### Boundaries

- Personal use first: unpacked installation on desktop Chrome and Edge on Windows. Other Chromium browsers are best effort; Firefox is a separate later decision.
- No SaaS accounts, billing, licensing, team roles, cloud database, subscription infrastructure, marketing site, or mandatory backend.
- Start local-first. A small local companion or remote service may be proposed only for a demonstrated need, such as private provider credentials, heavy media processing, or reliable jobs while the browser is closed.
- No recurring paid dependency without the owner's explicit choice. Display the tradeoff before introducing one.
- Full coverage is a tracked ambition, not permission to implement every feature simultaneously or represent blocked features as finished.

## 2. Establish truth before implementation

Inspect the actual repository, branch, HEAD if any, working tree, instructions, README, manifests, lockfiles, source, tests, CI, open issues, recent changes, and available installation/runtime evidence. Protect uncommitted work. If empty, say so and initialize the smallest useful baseline. If code now exists, reuse it instead of scaffolding over it.

Classify factual findings **Verified / Inferred / Proposed / Unknown / Not Applicable** with evidence for important claims. Separate source, passing build, packaged artifact, loaded extension, authenticated account, and real workflow verification. These are different states.

Audit a bounded set of current official TubeBuddy and vidIQ feature/help pages. Their catalogs change and include browser, web, mobile, AI, and service features. Inventory every currently advertised capability relevant to this request, including paid tiers; mark retired, duplicate, platform-specific, ecosystem-only, and inaccessible items. Do not claim literal complete parity based solely on the seed list below. No access to paid screens means their detailed behavior remains unverified.

Create `docs/FEATURE_MATRIX.md` with one row per distinct capability:

`ID | workflow | competitor/source URL + checked date | evidence status | TubeX behavior | data origin | API/scope | feasibility | dependencies/cost | priority | implementation status | acceptance proof`

Use feasibility labels: **Direct / Approximation / Native handoff / Optional service / Research required / Blocked / Out of personal scope**. Use implementation labels: **Not started / In progress / Verified / Blocked / Deferred**. Link duplicates to a canonical row. Keep a reason and useful alternative for every gap. Never hide missing coverage behind an enabled button or fabricated example result.

Priority is distinct from authorization. Initial delivery is deliberately small; the matrix must retain the larger ambition.

## 3. Data feasibility is an architectural requirement

For each metric or operation, verify the current official endpoint, fields, allowed query combinations, scope, ownership, quota, data freshness, retention, and policy conditions before coding. Do not assume that a metric visible in Studio is exposed through the public API.

Separate these sources in code and UI:

1. **YouTube public API data:** public metadata and supported public statistics.
2. **Owner-authorized Analytics/Reporting data:** only the connected channel and granted scopes; revenue requires the applicable permission and report availability.
3. **User-imported Studio reports or supplied assets:** preserve provenance, reporting interval, channel, units, and timezone. Import is not a way to bypass contractual restrictions.
4. **Local user-created data:** notes, drafts, plans, templates, manual observations, and assets owned by the user.
5. **Permitted external providers:** optional and named; document rights, terms, cost, and limitations.
6. **Model-generated suggestions:** clearly identified, with available supporting evidence and no invented measurements.

Every data record needs source, observed/retrieved time, channel/resource identity, applicable date range, freshness state, and missing/error semantics. Never turn missing, private, unsupported, or delayed data into zero. Never mix data from different periods or channels silently.

### Hard feasibility gates

- Exact keyword search volume, proprietary competition/difficulty scores, vendor prediction models, hidden competitor analytics, and their historical datasets are not automatically available through YouTube APIs. Do not label a proxy as an exact replacement.
- CTR, impressions, realtime activity, audience-active times, search terms, retention, Shorts-specific metrics, and A/B results require individually verified access. If the needed report is unavailable, offer a supported Studio export/import or native handoff. Do not scrape private endpoints as a fallback.
- Before custom scores, outlier ratios, sentiment analysis, predictions, cross-source combinations, or historical statistical storage, check current YouTube derived-metric and retention rules. Simple permitted arithmetic and additional metrics requiring approval are different categories. A label such as “estimate” does not make a prohibited calculation permissible. Gate each feature; record required approvals and keep it unavailable when they are absent.
- Do not infer competitor revenue, demographics, retention, monetization, satisfaction, or private search traffic.
- Search-position observations are contextual samples affected by time, region, language, device, and personalization. They are not universal ranking guarantees; collect them only through a permitted mechanism.
- Current public APIs may not support native title/thumbnail experiments, cards, end screens, related-video settings, or every Studio workflow. Verify each. Prefer a deep link plus prepared instructions to inventing an endpoint.
- Browser alarms are not a reliable always-on scheduler. Persist due times and job state, handle sleep/restart, and expose missed/overdue work. Use native supported scheduling when possible. Guaranteed browser-closed execution requires separately approved infrastructure.
- Do not assume transcripts of arbitrary videos are downloadable. Use authorized caption APIs when permitted, supplied text/files, or explicit supported exports. Do not bypass restrictions or download YouTube media to implement clipping.
- Current quota limits and endpoint costs must be read from official documentation and the actual project. Do not hard-code an old blanket quota or search cost from model memory. No quota sharding.
- Implement retention, refresh, revocation, deletion, and export restrictions per data category. User-created notes and permitted cached API data need different lifecycles. Long-lived user drafts must not become a covert permanent store of restricted API data.

## 4. Functional coverage seed

This is the required starting inventory to expand against current official catalogs. These are requested workflows, not claims that every named workflow is presently offered by both competitors or implementable without additional services.

| Area | Required TubeX workflow coverage | Feasibility notes |
|---|---|---|
| Keyword and topic research | Related terms, question ideas, keyword collections, comparison, language/region filters, intent notes, topic clusters, trends, contextual ranking observations, export | Exact volume/difficulty requires a verified permitted source; otherwise show available signals without false precision |
| Discovery and competitors | Saved channels/videos, comparison views, recent uploads, most-viewed research, trend watchlists, outlier discovery, topic/format patterns, reusable idea capture | Respect public/private boundaries, source rules, derived-metric conditions, sampling and age bias |
| Ideas and planning | Channel-specific ideas, brief builder, content pillars, backlog, calendar, series planning, comment-to-idea capture, priorities and reusable research | Favor fewer ideas tied to existing products; no endless novelty feed |
| Metadata and SEO | Title/description/tag drafts, variants, keyword placement review, metadata completeness, tag collections, hashtags, reusable upload profiles, localization, search/snippet preview, metadata export | An SEO checklist is not a YouTube ranking score; tags do not guarantee reach |
| Publishing assistance | Preflight checklist, channel defaults, language/category/audience reminders, playlist choices, thumbnail and captions readiness, scheduling handoff, draft persistence | No automatic declaration that content is legally compliant or monetization-safe |
| Thumbnail workbench | User-supplied images, layout templates, readable Persian text, brand presets, crop/safe-area preview, small-size and light/dark previews, variants, export, optional image-generation provider | Analysis is a qualitative critique unless a validated allowed model provides more; do not fabricate predicted CTR |
| Testing and optimization | Variant library, experiment plans/logs, native test handoff, verified/imported results, old-video refresh queue, rollback history | Sequential changes are observational, not randomized A/B tests; insufficient data means no conclusion |
| Channel/video analytics | Authorized performance reports, date comparisons, retention where supported, traffic sources, search terms where available, revenue where authorized, channel audit, actionable review, publishing-time evidence | Preserve timezone, reporting delays, format differences, sample limits and metric definitions |
| Productivity and bulk | Find/replace/append titles/descriptions/tags, saved templates, thumbnail overlays on owned assets, supported playlist operations, video navigation, metadata backup/export, scheduled-update planning | Dry run, resource list, backup, concurrency control, retry and explicit commit are required |
| Community | Comment inbox/filters, canned replies, draft reply assistance, comment-to-idea, supported moderation and bulk actions | Posting/deletion is explicit and scoped; never auto-spam or auto-delete from an AI judgment |
| Cards/end screens/related links | Templates, link inventory, recommendations, timing notes, broken-link review, supported native handoff | Unsupported operations remain guided workflows; no fictional API write support |
| Promotion | Embeds, share links, campaign/UTM templates where applicable, localized promotional drafts, reusable channel/product CTAs | No automatic messages or cross-platform publication; connectors require explicit setup |
| AI assistant | Channel-aware advice, research synthesis, titles, descriptions, scripts, hooks, outlines, chapters, localization and thumbnail critique | Provider optional, evidence bounded, editable drafts, cost visible, no autonomous account writes |
| Repurposing | Timestamped clip suggestions, vertical layout planning, captions/subtitle preparation, optional export from user-owned local media | Heavy rendering/transcription is deferred or delegated to an approved local companion |
| Health and utility | Accessible status panel, connection/quota checks, export/import, custom links, local reminders and milestones where useful | No gamified vanity dashboard; no unsupported policy/monetization guarantees |
| Ecosystem features | Record any current vendor MCP, mobile, Instagram, professional coaching or other service offerings | Track explicitly; do not silently turn a personal YouTube extension into a multi-platform SaaS |

Use workflow-level equivalents where they improve the experience. Coverage means solving the job honestly, not cloning the competitor's menu or preserving unnecessary steps.

## 5. UX contract: a useful tool inside the creator's work

**Mode: Operate.** Familiar controls, fast scanning, clear consequences, restrained visuals. Original identity, minimal decoration, no generic dashboard of oversized metric cards.

### Surfaces and information architecture

- **Side panel:** primary context-aware workspace. Keep a visible channel badge, current resource, connection state, and one clear next action. Preserve the current draft when pages change; explain when its context differs from the newly opened video.
- **YouTube/Studio entry points:** small, opt-in context launchers on verified watch, search, channel, video-list, upload and editor contexts. No interference with playback, ads, captions, Studio save controls or page accessibility.
- **Full-page extension workspace:** research tables, idea library, calendar, templates, bulk jobs, history and settings. Heavy tasks belong here rather than in a narrow panel.
- **Popup:** open panel/workspace, quick capture and connection status only. Do not squeeze the whole product into it.
- Primary navigation should follow jobs: **Research / Prepare / Improve / Library**, with a separate low-noise settings entry. Test this against actual workflows; avoid tool-per-feature navigation.
- Default home: resume last draft and at most three useful actions with evidence, effort and expected practical benefit. Do not claim these are predicted revenue or growth.

### Five critical journeys

1. **Capture:** On a relevant video/search/comment, save a source-linked idea in at most two deliberate actions after initial setup.
2. **Prepare:** Choose channel and topic → reuse research → create/edit title, thumbnail and description → validate → preview the exact package → explicitly apply supported changes or copy/export. Preserve edits and explain unsaved state.
3. **Improve:** Select an old video → see available evidence → choose one change → compare before/after → apply → record observation period → review real results without causal overclaiming.
4. **Bulk:** Filter and select exact video IDs → dry-run differences and exclusions → see cost and risks → confirm scoped execution → persistent progress and per-item outcome → conditional restoration where possible.
5. **Recover:** When auth, quota, API, page integration or AI fails, retain work and provide a specific recovery action. Never leave an indefinite spinner or require re-entering a draft.

### Interaction requirements

- Persian and English UI from the beginning. Default Persian for this owner; separate UI language, content language, research region and channel settings. Instant language change without restart.
- True RTL: logical CSS properties, suitable component direction, bidi isolation for handles/URLs/metrics, appropriate icons and tab order. Keep code and identifiers LTR. Test mixed Persian/English titles, نیم‌فاصله, Arabic/Persian letter variants and numbers. Normalize search matching without silently rewriting saved copy.
- Proposed fonts: locally bundled Estedad for Persian UI and Figtree for English UI, only after license verification; use good fallbacks until available. Treat the visual palette as proposed until the owner reviews a real screen. Prefer restrained warm neutrals, subtle orange action accents, and YouTube-compatible light/dark/system modes. Avoid decorative green/turquoise washes.
- Semantic design tokens and reusable accessible components. No arbitrary radii, inconsistent action styles or color-only statuses. Charts use meaningful comparable scales and disclose missing periods.
- Keyboard support, visible focus, accessible names, focus restoration, screen-reader status announcements, reduced motion and WCAG 2.2 AA intent. Verify actual applicable contrast and interaction checks.
- Layout works at narrow side-panel widths (including about 320 px where available), normal desktop sizes, 200% zoom and long localized strings. Do not assume a fixed browser panel width.
- Dense tables support search, filters, sort, selection, column controls, clear units, sticky headers when useful and persistent view preferences. Paginate first; virtualize only for demonstrated volume.
- Explicit states: first use, no channel, no permissions, no data, stale data, loading, partial success, offline, unsupported page, quota exhausted, revoked auth, disabled integration and recovered connection.
- Auto-save local drafts; show save status. Provide copy/export and undo for local edits. Whole action rows/cards are clickable when intended; never make an apparent button clickable only on its text.
- Contextual onboarding: demonstrate a local useful action before requesting all credentials. Explain every permission when first needed. Advanced configuration is progressively disclosed.
- Confirm actions according to consequence: local reversible edits need no modal; public writes, destructive operations and bulk commits show precise consequences. Avoid repeating approval for already authorized steps in the same scope.
- Provide a plain-language explanation of each recommendation with source and date; technical logs stay behind Details. Never expose raw provider stack traces as the main error copy.

Before a major flow, compare two feasible interaction approaches briefly and choose. Before delivery, inspect actual running UI in a bounded pass covering light/dark, Persian/English, narrow/full workspace, then fix real defects in one batch and confirm. Do not spend sessions on cosmetic iteration without user feedback.

## 6. Proposed technical direction — verify before adopting

If the repository is still empty, prefer **TypeScript + React + WXT + Vite + Manifest V3**, subject to current official support, dependency/license review and a working Windows build. This is a proposal, not existing architecture. If another established stack exists, preserve it unless there is a concrete reason to change.

Use a simple single package initially. Avoid microservices, monorepo scaffolding, global event buses and generic plugin frameworks. Choose a small accessible UI primitive set only when it reduces maintenance. Bundle scripts, fonts and icons locally; MV3 does not permit remotely hosted executable code.

Suggested ownership boundaries, adapted to the actual framework layout:

```text
entrypoints/                 # service worker, content scripts, panel, popup, workspace
src/features/                # research, preparation, optimization, library, jobs
src/components/              # shared accessible UI
src/domain/                  # pure rules and typed operations
src/integrations/youtube/    # Data API, Analytics, auth, quota and capability map
src/integrations/ai/         # optional provider adapter and budget enforcement
src/platform/               # browser APIs, typed messaging, context adapters
src/storage/                # one schema owner, repositories and migrations
src/i18n/                   # Persian and English catalogs
tests/fixtures/             # sanitized local/API/page fixtures
```

Create directories when they contain real code. Do not build the whole hierarchy as empty scaffolding.

### Extension engineering

- Service worker owns privileged network operations, auth coordination and durable job orchestration. Register event listeners correctly at startup. Assume termination and restart at any time; no required state only in memory, long-lived timers, forced keepalive hacks or DOM APIs in the worker.
- Use the side panel/workspace for user-facing work. Use an offscreen document only for an officially supported, demonstrated need with lifecycle cleanup.
- Keep content scripts minimal. Mount isolated UI, use narrowly scoped debounced observers, handle YouTube SPA navigation, cancel old work, clean observers/listeners, and prevent duplicate mounting across re-navigation or extension updates.
- Encapsulate page detection/selectors in versioned adapters with sanitized fixtures, a visible fallback and a kill switch. Prefer supported APIs; do not reverse-engineer private Studio/Innertube endpoints or extract session cookies as a shortcut.
- Typed, validated messages across all boundaries; verify sender, origin, operation, channel and payload. Page content is untrusted. Do not expose a generic privileged fetch or scripting bridge to the page.
- Restrict host permissions to verified YouTube/Google endpoints and explicitly selected optional providers. No default `<all_urls>`, cookies, history, broad webRequest or arbitrary execution permissions.
- Strict CSP, no eval/new Function, sanitize imported/AI HTML and Markdown, safe links, and narrow web-accessible resources.
- Use `chrome.storage.local` for small preferences and appropriate storage for larger records, typically IndexedDB. One canonical schema and migration layer. Never assume unlimited browser storage or use sync storage for credentials or large reports.
- Partition cache, templates, drafts, jobs and auth-derived state by actual channel ID. Distinguish Google identity from YouTube channel identity and Brand Account access. Clear stale context on switching; fail closed on identity mismatch.
- Migrations must be versioned and recoverable. Avoid multi-tab duplicate job execution using a tested coordinator/lease. Handle stale leases after crashes.

### Auth and secret handling

- Start read-only; request write and monetary scopes only when needed. Verify supported `chrome.identity` / OAuth flows, stable extension ID setup for unpacked builds, redirect URIs, test users, consent-screen publishing/testing limits, renewal, revocation and Chrome/Edge differences.
- Browser extensions cannot keep bundled client secrets private. Never embed OAuth client secrets or shared AI keys. Public client IDs are not secrets; API keys still require appropriate restriction and abuse controls.
- Keep tokens in the smallest appropriate isolated session/cache surface, not content scripts, logs, exports, URLs or prompts. Clear on disconnect. Document the actual risks of any user-supplied provider key kept locally; do not call ordinary browser storage encrypted or a secure vault.
- AI use is optional. A user key, supported local model or separately approved trusted companion may provide it. Do not create a mandatory relay service. Verify provider CORS/auth compatibility before promising direct extension access.
- Never request the user's Google password or instruct them to paste session cookies. Provide disconnect, provider-key removal, export and deletion controls.

### Reliability and writes

- API adapters handle pagination, `part`/`fields`, supported batching, deduplication, caching, bounded concurrency, timeouts, backoff with jitter and quota-aware pacing. Honor endpoint-specific errors and retry headers. Do not retry authentication, permissions or invalid requests blindly.
- Before a metadata write, fetch current fields and ownership; preserve fields outside the intended edit and protect against stale previews. YouTube update semantics can remove omitted properties. Check current endpoint behavior instead of applying a generic PATCH assumption.
- Preview content and video IDs. Revalidate identity, permissions and current remote values at execution time. Resolve conflicts rather than overwriting edits made in Studio after preview.
- Durable jobs have explicit states: queued/running/succeeded/partially failed/failed/canceled/overdue as needed. Persist per-item checkpoints and avoid replaying a successful mutation after worker restart or a timeout. Reconcile uncertain outcomes before retrying.
- No blanket claim of idempotence where an API does not provide it. Use local operation IDs, payload hashes, resource checks and reconciliation.
- Rollback is conditional restoration, not a transaction across YouTube. Preserve permitted before-values, show conflicts and unsupported reversals, and do not undo newer manual changes. Remote deletes and some asset replacements cannot be fully undone.
- Native schedules may continue when the extension is closed; local schedules may not. Make that distinction visible in the feature's own UI.

## 7. Two separate cost controls

### A. Claude/development context efficiency

Token efficiency must come from reducing irrelevant work, not omitting verification. Never guarantee a fixed percentage reduction or invent token measurements.

1. Treat this master brief as initial input, not an always-loaded instruction file. Keep a canonical copy in `docs/MASTER_BRIEF.md` and route to sections on demand. Do not import the entire brief automatically from `CLAUDE.md`.
2. `AGENTS.md` target: at most about 1,200 tokens. `CLAUDE.md`: about 250 tokens, containing a compatibility pointer and minimal startup rules. `docs/NEXT.md`: about 700 tokens. These are practical budgets, not excuses to erase critical rules.
3. Startup reads only `CLAUDE.md`, `AGENTS.md`, `docs/NEXT.md` and the current task's file/command map. Read architecture, design, integration references and relevant local skills only when the task touches them. Check Git status first. Never recursively read the whole repository at every turn.
4. Each task begins with a compact scope: outcome, affected modules, acceptance criteria and likely files. Use `rg`/targeted reads and bounded output. Exclude `node_modules`, build outputs, lockfile bodies, vendored skill data, generated bundles, screenshots and large logs from routine context. Lockfiles remain committed and available when dependency analysis actually requires them.
5. Keep one source of truth for every rule/schema/decision. Link rather than copy. Use a short capability index so agents do not rediscover feasibility for each feature.
6. Work in small end-to-end slices. Reuse canonical components, providers and utilities. No unrelated cleanup, whole-file rewrites, broad formatting or speculative abstraction.
7. Use scripts for repetitive verification and inventory, returning concise failures/summary rather than dumping thousands of lines. Capture full logs locally; open the relevant excerpt on failure. Do not paste entire generated files in conversation.
8. Read only task-relevant skill entry points and referenced sections. Do not autoload every engineering/design manual or an entire skill corpus. Never vendor enormous datasets just to make startup look comprehensive.
9. Use one agent by default. Do not launch subagents, multiple independent reviews or model debates for routine work. Delegation requires an explicit task instruction and a clear bounded benefit.
10. At compaction or handoff, update `docs/NEXT.md` with goal, actual state, recent decisions, exact next task, relevant file paths, tested commands/results, blockers and next action. Replace obsolete active notes instead of appending transcripts. Git and the changelog hold history.
11. Do not rerun a repository-wide audit, competitor research, dependency upgrade or full test suite on every small change. Reuse dated evidence until affected code or a time-sensitive decision invalidates it. Run targeted checks and required broader checks at meaningful gates.
12. Keep output short: outcome, key changed paths, actual checks, unresolved blocker, next step. Do not narrate every read or repeat plans after each tool call.
13. If the host exposes real context/usage measurements, record them with task size. Otherwise label budgets approximate. Use cheaper/faster model choices only if explicitly available and appropriate; the agent must not pretend it changed its own model or billing configuration.
14. Do not write instructions requiring the agent to reread every governance document after every commit. Review the focused diff and affected documents. Full evidence-oriented review belongs at milestone boundaries or significant architecture changes.
15. If you discover a real blocker, preserve progress and continue independent authorized work. Ask one focused question only when the answer changes a material decision. Do not ask the owner to reconfirm routine reversible steps.

### B. TubeX runtime AI/API efficiency

- Core capture, templates, metadata editing, preview, library, history and import/export work without AI.
- No model request on each keystroke, tab visit, page mutation, navigation or background poll. AI is deliberate and cancelable.
- Send the selected task's minimal evidence, not the entire channel, complete transcripts or comment history. Summarize/filter locally first when permitted. Do not send private channel data to a third party without clear consent.
- Cache permitted AI results by channel/context, normalized inputs, prompt version, provider/model and relevant data version. Deduplicate in-flight requests and invalidate when assumptions change.
- Set input/output limits, concurrency, timeout, retry policy, per-action estimate and monthly budget. Stop at the cap; retries count. Display real provider usage when available and clearly label approximate cost otherwise.
- Provider adapters expose typed requests/responses and schema validation. Model output is untrusted content, never executable instructions. External videos/comments can contain prompt injection; they cannot override instructions, trigger tools or authorize account changes.
- The assistant may suggest an operation; deterministic application code validates and previews it, and the user commits it. Keep a local action history with sensitive data redacted.
- No training/fine-tuning on YouTube data or private user data as an incidental implementation step. Verify permitted data handling before any provider integration.

## 8. Lightweight, portable Project OS

Adapt the supplied Universal Project OS rather than recreating its long reading chain. The owner's Claude preference overrides its vendor-neutral-only environment restriction: Claude Code compatibility is allowed, but TubeX runtime and governance must remain provider-neutral. Claude-specific glue must be small and optional. Do not install vendor skills solely because the agent is Claude.

Create or reuse only useful authoritative files:

| File | Purpose |
|---|---|
| `README.md` | Product, quickstart, actual commands, unpacked install, documentation map |
| `AGENTS.md` | Short contract, scope, evidence, context budget, protected behavior, skill routing |
| `CLAUDE.md` | Thin Claude compatibility entry pointing to canonical rules and NEXT |
| `PROJECT.md` | Owner, jobs, scope, milestones, success criteria and non-goals |
| `DESIGN.md` | Operate-mode UX contract, tokens once implemented, components, RTL and states |
| `ARCHITECTURE.md` | Verified implementation separate from proposals; security/data boundaries |
| `TESTING.md` | Real commands, risk-based matrix and actual evidence locations |
| `DEPLOYMENT.md` | Local build/package/install/update/rollback, not fictional cloud deployment |
| `CHANGELOG.md` | Meaningful completed changes; do not invent customer releases |
| `docs/NEXT.md` | Single current-state and continuation checkpoint; do not also create a duplicate CURRENT_STATE |
| `docs/FEATURE_MATRIX.md` | Full coverage, feasibility, data sources and evidence |
| `docs/INTEGRATIONS.md` | Endpoint/scope/capability/retention/quota map with checked dates |
| `docs/DECISIONS.md` | Short material ADRs: context, choice, status, alternatives, consequences |
| `docs/BACKLOG.md` | Do now / Validate first / Do next / Maintain / Automate / Park / Drop; index existing issue tracker if used |
| `.agents/skills/SOURCES.md` | Exact source, revision, license, local adaptations and verification |

Do not create empty incident folders, fake release notes, databases or deployment diagrams. Keep change rules in AGENTS unless they genuinely need their own file. Never make documentation larger than the useful project it describes.

### Real local skill integration

Review independent candidate sources such as `nextlevelbuilder/ui-ux-pro-max-skill` for design and `obra/superpowers` for systematic debugging, appropriate test-driven development, and verification before completion. A suitably licensed available Impeccable skill can supply the Operate UX discipline. Do not install competing full design systems automatically.

Before vendoring: verify current upstream identity, exact reviewed revision, maintenance, licenses, scripts and dependency closure. Preserve notices, inspect executable behavior, pin versions and test paths/representative commands. Never download and execute scripts blindly. Preserve canonical local paths under `.agents/skills/` and document real host discovery limitations. If blocked, record the precise blocker; do not manufacture placeholder skills or claim installation.

Task-aware routing: design work reads relevant UI guidance; bugs use diagnosis/reproduction; testable behaviors use focused regression tests; completion claims require applicable real checks. A label typo does not need an extensive workshop or test suite. Governance and skill instructions never override the owner's actual authorization.

## 9. Milestone delivery

### M0 — Truth and decisions

Audit, create the lightweight Project OS, inventory feature coverage, resolve first-slice data requirements and verify the proposed stack. Establish Git history non-destructively if the repository is empty. Record unknowns explicitly. No permanent backup branch when there is no useful baseline.

### M1 — First useful extension (authorized by this master prompt)

Deliver a working unpacked extension with:

- side panel, minimal popup and full-page library;
- verified page-context detection and a safe non-YouTube fallback;
- local channel profiles clearly marked unconnected until ownership is verified;
- source-linked idea capture and retrieval;
- Persian/English, RTL/LTR and light/dark/system support;
- title/description/tag draft editor, reusable local templates and a genuine metadata preview;
- persistent local save, export/import, basic migration and working recovery states;
- automated checks plus a real unpacked browser smoke test when available;
- AI and live public writes disabled until their milestone and configuration exist.

Provide a complete vertical slice, not decorative screens with placeholder buttons. It must be useful before Google or AI credentials are supplied. Sample data may exist in tests or a clearly separated demo mode only; never show it as the owner's channel.

### M2 — Read-only connection and research

Verified Google/channel identity, least-privilege connection, disconnect/revocation, real channel/video data, supported read-only reports, permitted research, capability/freshness/quota display and Studio CSV import where necessary. Validate channel switching and error recovery before adding writes.

### M3 — Preparation and optional AI

Channel presets, production-quality metadata workflow, thumbnail preview/library, chapters from supplied/authorized transcripts, content brief and optional budgeted AI. Keep unsupported native workflows as honest handoffs. First integrate one selected provider, not many unused SDKs.

### M4 — Safe updates and bulk jobs

Single-resource write flow first, then bulk metadata/playlist operations. Prove preservation of unedited fields, preview conflicts, durable progress, uncertain-outcome reconciliation and conditional restoration before allowing large selections. Develop with mocks, then use a designated owned test resource with explicit authorization.

### M5 — Evidence-driven improvement and coverage expansion

Authorized analytics, evidence-based existing-video review, permitted competitor/trend/outlier workflows, native experiments, comment assistance and richer workbench tools. Every custom metric passes the source/policy gate. Expand toward the full feature matrix without losing core usability.

### M6 — Expensive or service-dependent capabilities

Heavy clipping/rendering/transcription, image generation, browser-closed scheduling, additional ecosystems/MCP and other backend-like work require an explicit practical need and separate scope. Prefer integration with an existing owner tool over rebuilding a media studio.

After M1, report a concise evidence-based handoff and await/obey the owner's selected next milestone. If the active user task already authorizes another bounded milestone, continue through it without requesting redundant confirmation. A milestone is not complete until its end-to-end behavior works; do not jump to the next one because its UI looks easier.

## 10. Verification and acceptance

Derive real build/typecheck/lint/test/package commands from actual manifests; once added, execute and document them. Proposed commands must remain labeled proposed until they run. Passing compilation is not proof of extension behavior or Google access.

Risk-based tests should cover:

- pure domain validation, Persian normalization and mixed-direction handling;
- import schema errors, unsafe CSV cells/formulas, duplicate rows, missing metrics, wrong channel and reporting timezones;
- schema upgrades, reload persistence, export/import roundtrip and graceful corrupt data handling;
- navigation, duplicate-mount prevention, missing page anchors, content-script isolation and permission-denied fallback;
- auth canceled/revoked/expired, Brand Account mismatch and read-only versus write authorization;
- paging, quota exhaustion, offline/timeouts, partial results, stale caches and rate-limit recovery;
- service-worker termination/restart, browser restart, concurrent tabs, canceled jobs, partially completed writes and missed schedules;
- metadata field preservation, changed remote data after preview, failed items and unsupported rollback;
- optional AI disabled, malformed output, injection attempts, token cap, canceled request and exhausted cost budget;
- keyboard/focus/screen-reader essentials, narrow panel/full workspace, Persian/English and light/dark.

Use focused unit/integration tests with sanitized fixtures and supported browser-extension end-to-end tooling verified against the current framework. No credentials in fixtures. For write tests, mocks first and a specifically authorized owned test resource only. Do not edit a real public video just to prove the API works.

Performance targets are proposed until measured: local text interactions should feel immediate; avoid blocking main-thread tasks over roughly 50 ms; use a realistic profile to set startup/bundle/memory budgets. Measure on a real extension build, not just a web development preview. Keep YouTube playback and Studio editing unaffected. Record device/browser/build and tested conditions.

Minimum M1 acceptance example:

1. Load the real unpacked extension using documented instructions.
2. Open a verified YouTube context and capture an idea; the source is correct and capture does not disturb the page.
3. Create a Persian metadata draft, switch language/theme, close and reopen the panel and browser; content survives.
4. Export and reimport a valid backup; reject an invalid/unsafe import safely.
5. Navigate to another video and an unsupported page; no duplicated UI or silent draft reassignment.
6. With no credentials, local workflows remain functional and remote features explain their unavailable state.
7. Verify keyboard access and the narrow layout, then package the tested code.

If a browser or credentials are unavailable, deliver the verifiable safe work and state exactly which acceptance checks were not run. Never replace real evidence with “should work.” No endless test reruns once relevant checks pass unless code or unresolved risk changes.

## 11. Delivery, security and scope discipline

- The repository is currently public according to dated metadata. Treat everything committed as public. Ignore local secrets, credential files, personal exports, private analytics and sensitive logs. Run a focused secret/diff check before a commit.
- Keep release artifacts reproducible: manifest version, commit/build ID, included files, build instructions, unpacked ZIP and rollback instructions. Do not call a development bundle a store release.
- Store publication, external messaging, automatic posting, live destructive tests, paid services and changes to production permissions are outside default development authority.
- Preserve user changes, existing approved behavior and licenses. No force pushes, destructive resets, unrelated redesigns or dependency upgrades.
- Commit focused changes when Git writes are authorized by the working environment/task. Do not claim a remote push unless it succeeded and the remote commit is verified. Do not create GitHub issues, TickTick tasks or other external records unless requested.
- Final report in natural Persian: delivered behavior, important paths, actual validation, limitations, source/build/installed status and at most three next actions. Be concise. Give evidence links/files rather than dumping code.

### Definition of Done

The requested slice works end to end, preserves existing workflows, has honest data, passes relevant checks, has usable Persian UX, saves and recovers work correctly, has bounded API/AI costs, and leaves a short accurate continuation checkpoint. A skill invocation, a screenshot, mocked data, a passing build or a long document alone does not meet this definition.

## 12. Start now

Inspect the actual target repository. Summarize the verified baseline and first-slice decisions briefly. Create the minimal truthful Project OS and relevant reviewed skill guidance, then implement and verify M1 within the available authorization. Do not merely return another plan or rewritten version of this prompt. Do not attempt the entire parity backlog in one pass. Make the first extension useful and reviewable, and leave a precise next task.

---

## Short continuation prompt — use after the initial setup

```text
Continue TubeX in the actual repository. Read CLAUDE.md, AGENTS.md and docs/NEXT.md first; inspect Git status. Then read only the files, references and skills needed for the current authorized task. Preserve user changes and verified behavior. Complete the next bounded end-to-end slice, run relevant real checks, review the focused diff, and update docs/NEXT.md. Do not repeat the full audit, reload the master brief or rescan the whole repository unless new evidence requires it. Report the result, actual checks and any blocker concisely in Persian. Do not publish, spend money or modify live YouTube content without scoped authorization.
```

## Source baseline and verification references

Checked for this brief on 2026-10-20; revalidate when using a capability. Official catalogs advertise capabilities, not proof that their underlying data or private services are available to TubeX.

- TubeBuddy tools/tutorial catalog: https://www.tubebuddy.com/tutorials/
- vidIQ feature catalog: https://vidiq.com/features/
- YouTube Data API overview: https://developers.google.com/youtube/data/getting-started
- YouTube Analytics metrics: https://developers.google.com/youtube/analytics/metrics
- YouTube developer-policy guide: https://developers.google.com/youtube/terms/developer-policies-guide
- Additional derived-metrics/storage policies: https://developers.google.com/youtube/terms/derived-metrics-policy
- Chrome extension service-worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Chrome identity: https://developer.chrome.com/docs/extensions/reference/api/identity
- Chrome remotely hosted code rules: https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code

These references informed the constraints and workflow inventory. Proposed stack, priorities, UX, module boundaries, context budgets and milestone decisions are tailored recommendations for TubeX, not statements from the vendors.

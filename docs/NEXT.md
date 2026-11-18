# TubeX — current checkpoint

Updated: 2026-11-18.

## Current state
- Branch `main` now contains all code merged from PR #1 (`3432e29e`), originally on `claude/m0-m1-baseline-9rp5tg`.
- GitHub Release **v0.5.3** is published: https://github.com/iHMahmoodiX/TubeX/releases/tag/v0.5.3
- Release asset: `tubex-0.5.3-chrome.zip`, built with the repo's `.github/workflows/release-v0.5.3.yml` on GitHub Actions run 44254314177 (success, checks + ZIP).
- Version remains **0.5.3**; GitHub Release means a downloadable unpacked extension, not a Chrome Web Store/Edge Add-ons publication.
- No source-feature code was changed for the competitor or Aparat research. GitHub Issues #9–#17 are the active post-release task registry.

## Priority order (do not start all at once)
1. **P0 Do now:** #9 — real YouTube/Edge stabilization, Google sign-in persistence/Brand Accounts, in-page selectors, bulk single-video test, reporting, API quota and derived metrics policy; close old #2–#8 only with live evidence.
2. **Do next after P0:** #10 Optimize Queue; #12 YouTube-native A/B test assistant; #14 Research → Idea → Draft → Optimize workflow.
3. **Validate first:** #11 compliant Outlier Discovery Lite; #15 evidence-based personalized recommendations with existing Gemini and Ask Studio native handoff.
4. **Do next if justified:** #13 competitive thumbnail context previews.
5. **Aparat separate, minimal track:** #16 official API/terms audit then, only if worthwhile, #17 local-first Aparat metadata package, native upload/edit handoff and optional permitted read research.
- Parked features (full automated shorts rendering, generic AI coach rewrite, own MCP service, team/organization platform, speculative search volume and paid data) remain out of the active tasks.

## Gemini integration note
- Existing preset: `src/integrations/ai/provider.ts` (OpenAI-compatible Gemini endpoint). The API key and live connectivity are **not confirmed**; do not claim Gemini already works in the owner's installation.
- Default model is `gemini-2.5-flash`, which Google's deprecations page says is deprecated; requests will route to `gemini-3.5-flash-lite` starting **2026-12-01** with possible pricing/compatibility change. Validate/test and migrate under #15 before that date.
- Ask Studio is part of YouTube Studio. No supported external API confirmed; use an explicit native Studio handoff or copyable prompt, not private calls or scraped conversations.

## Aparat evidence
- Official portal `https://api.aparat.com/` has a documentation landing page but no usable public spec verified as of 2026-11-18.
- Unofficial old `/etc/api` and newer `/api/fa/v1` patterns appear in third-party clients; they are **not** approval for a stable API.
- `sepehr071/aparat-mcp` exposes unofficial read-only research and is PolyForm Noncommercial in current version; assess licensing before reuse, and do not bundle unapproved code.
- Official Aparat upload guidance: description <=2000 characters, 3–5 tags each <=23 characters, recommended cover 1920×1080, playlists, captions and scheduled publishing in the native UI. Re-verify prior to implementation (#17).

## Existing implementation landmarks
- WXT + React + TypeScript MV3.
- Core: `entrypoints/`, `src/features/`, `src/domain/`, `src/storage/`, `src/background/`, `src/inpage/`.
- Google auth: `src/integrations/google/{auth,codeFlow,refreshStore,own,ownWrites}.ts`; optional server `server/supabase/functions/google-token/`.
- AI: `src/integrations/ai/` and Settings → Connections.
- Research, competitors, reports, bulk and scheduling already have nontrivial implementation; prefer reuse over new architectures.

## Verification and immediate next step
- GitHub Actions v0.5.3: install, typecheck/unit tests/build, WXT ZIP packaging and release all **passed** on 2026-11-18.
- Historical project checkpoint reported 486/486 unit tests and 16/16 fixture E2E, but **no independent live-account validation**. GitHub release workflow currently does not execute fixture E2E.
- Start #9. Test on a single owned video with owner authorization before broad bulk writes. Ensure token setup/deployment remains separately authorized. No external/store publication.
- Read `AGENTS.md`, this checkpoint and only task-relevant modules; preserve token budget and avoid unnecessary rebuilds.

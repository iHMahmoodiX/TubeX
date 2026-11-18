# TubeX — current prioritized backlog

Updated 2026-11-18. **GitHub Issues are the task registry**. Do not create duplicate issues or interpret the historical rows in `docs/FEATURE_MATRIX.md` as unimplemented work.

**Claude Code implementation contract:** [CLAUDE_IMPLEMENTATION_HANDOFF_2026-11-18.md](CLAUDE_IMPLEMENTATION_HANDOFF_2026-11-18.md). Read this **once per fresh handoff**, then use `AGENTS.md`, `docs/NEXT.md` and the active Issue rather than re-reading the repository.

## Current release and baseline

- `main` contains merged development PR #1; v0.5.3 released with ZIP in GitHub Releases.
- GitHub Actions build/typecheck/unit/package succeeded on release run 44254314177. Older fixture E2E checkpoint was 16/16; live Chrome/Edge/Google account tests **not confirmed**.
- Existing functions: research/rank, competitor and channel insights, reports (retention/CTR/health/opportunities), ideas/drafts/templates, AI presets, in-page YouTube/Studio tools, bulk metadata/playlist/comment/schedule workflows.
- Critical dependencies: proper OAuth refresh, changed 2026 YouTube quota model, policy around derived metrics, and Gemini preset compatibility. Keep baseline functional.

## YouTube first — sequential implementation

| Order | Issue | Decision | Required outcome |
|---|---|---|---|
| 0 | [#9](https://github.com/iHMahmoodiX/TubeX/issues/9) | **Do now / P0** | Stabilize live OAuth, Edge/Chrome selectors, bulk/CTR, 2026 quota and policy; validate old #2–#8 |
| 0b | [#15](https://github.com/iHMahmoodiX/TubeX/issues/15) | **Do now dependency** | Verify Gemini model/config before 2026-12-01; avoid duplicate provider |
| 1 | [#10](https://github.com/iHMahmoodiX/TubeX/issues/10) | **Do next** | Optimize Queue with dated evidence, title/thumbnail variants and observation log |
| 2 | [#14](https://github.com/iHMahmoodiX/TubeX/issues/14) | **Do next** | Connect Research → Idea → Draft → Optimize using existing components |
| 3 | [#12](https://github.com/iHMahmoodiX/TubeX/issues/12) | **Do next** | Prepare native YouTube A/B title/thumbnail tests and result journal |
| 4 | [#13](https://github.com/iHMahmoodiX/TubeX/issues/13) | **Do next** | Search/feed contexts for mobile/desktop thumbnails; no CTR prediction |
| 5 | [#15](https://github.com/iHMahmoodiX/TubeX/issues/15) | **Validate first → Do next** | Evidence-linked on-demand Gemini recommendations; Ask Studio handoff, no private API |
| 6 | [#11](https://github.com/iHMahmoodiX/TubeX/issues/11) | **Validate first** | Quota/policy-safe Outlier Discovery Lite built on current competitor research |

**Gate:** complete and verify the scoped YouTube milestones before Aparat feature coding; explicitly document any legally or technically impossible item rather than claiming delivery. Keep only one feature issue active at a time.

## Aparat last — gated and small

| Order | Issue | Decision | Outcome |
|---|---|---|---|
| 7 | [#16](https://github.com/iHMahmoodiX/TubeX/issues/16) | **Validate first** | Official API/terms/license and capability matrix; no private endpoints or cookies |
| 8 | [#17](https://github.com/iHMahmoodiX/TubeX/issues/17) | **Do next only after #16** | One content source → YouTube and Aparat metadata packages, Persian validation, cover preview, copy/export and safe native upload/edit handoff |

No separate Aparat application, undocumented account upload automations, or high-maintenance universal adapter. Reuse existing TubeX drafts, thumbnails and platform-context infrastructure.

## Maintain

- Keep existing Bulk/Studio/SEO/Analytics functionality, optional refresh server, backups, user data and migrations intact; handle #2–#8 as real-world verification follow-ups.
- Run targeted tests per slice and full CI checks at PR/release gates. Fix regressions before new features.
- Read YouTube Developer Policies and Google model availability at time of implementation, without repeating an entire competitor audit.

## Park / Drop (not authorized for implementation)

- Full AI Shorts rendering/clipping engine, newly built generic AI Coach, separate TubeX MCP server, team/enterprise access, social-monitor extension, mobile apps, additional social networks, AI-generated image service, unverified exact search-volume numbers, unapproved paid data, speculative platform redesign.
- Any bulk Cards/End Screens or Aparat upload feature that requires private/undocumented account endpoints.

## Working rule

**One Issue → short plan → focused branch/PR → tests → actual evidence → update Issue and `docs/NEXT.md`.** For complete code pointers, acceptance details, security and token-saving constraints consult the one-time Claude handoff linked above.

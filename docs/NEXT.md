# TubeX — current checkpoint

Updated: 2026-11-18.

## State
- Version **0.6.4**. 0.6.4 splits Aparat and Blog into their own pages and Settings sections, adds owner-editable prompt templates (per kind, per blog, reset to default) and "Do it all" for one or many videos (D-029). 0.6.3 writes the blog article from the video's captions (first person) and sends it to WordPress as a draft via an Application Password (D-028). 0.6.1 added the Aparat page (one-click package per YouTube video); 0.6.2 adds the AI rewrite for Aparat, Aparat's tag/length rules applied automatically, and the WordPress blog version (D-027). Page is now "Aparat & blog". on branch `claude/project-thread-2pwd6e` (PR to `main`). Implements the whole plan in [`docs/CLAUDE_IMPLEMENTATION_HANDOFF_2026-11-18.md`](CLAUDE_IMPLEMENTATION_HANDOFF_2026-11-18.md): Y0 (#9 quota/Gemini/CI), Y1 (#10 Improve queue), Y2 (#14 Research → Idea → Draft), Y3 (#12 A/B assistant, #13 context previews), Y4 (#15 coach + Ask Studio), Y5 (#11 Outlier Lite), A0 (#16 [Aparat feasibility](APARAT_FEASIBILITY.md)), A1 (#17 Aparat package). Also: Studio "Upload profile" is a button next to "Reuse details".
- Checks: 551/551 unit tests, typecheck, build, fixture e2e 16/16, grow screenshots reviewed (fa, dark). Decisions D-021…D-029 in [DECISIONS.md](DECISIONS.md).
- **Nothing is live-verified.** Owner runs [LIVE_TEST_MATRIX.md](LIVE_TEST_MATRIX.md); close issues only with that evidence.

## Owner-only steps still open
- Supabase secrets for the sign-in server (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and publishing the OAuth app (see `/mnt/project-files/guides/persistent-sign-in-fa.md`).
- Gemini key test in Settings; switch to `gemini-3.5-flash-lite` before 2026-12-01 if still on 2.5.
- Create a WordPress Application Password and connect each blog in Settings → WordPress (matrix line 17).
- Confirm `https://www.aparat.com/upload` and Aparat's form limits (matrix lines 11–12).
- Single-video bulk find & replace test before any large run.

## Next
1. Aparat auto-fill of the upload form: waiting for the owner's saved Aparat upload page (HTML or screenshot) to write selectors against a real fixture.
2. Fix whatever the live matrix finds (selectors in Studio, Edge sign-in, Aparat URL/limits).
3. Then the 10 workaround-only TubeBuddy features remain parked until the owner decides.
4. Never: Aparat login/upload/endpoints, private YouTube endpoints, paid services, store submission.

## Landmarks
- New domain modules: `src/domain/{optimizeQueue,coach,experiments,workflow,outliers,aparat,aiModels}.ts`.
- New UI: `src/features/republish/pipeline.ts` (republishing steps), `src/features/settings/RepublishSettings.tsx`, `src/features/optimize/`, `src/features/experiments/`, `src/features/thumbs/ContextPreview.tsx`, `src/features/drafts/{DraftFlow,AparatPanel}.tsx`, `src/features/research/Outliers.tsx`, `src/features/ideas/WorkflowButtons.tsx`.
- Screens: `node tests/e2e/grow-shots.mjs <outDir> [route…]` (see TESTING.md).

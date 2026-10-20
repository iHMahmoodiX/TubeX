# TubeX agent contract

TubeX is a personal, local-first Chrome/Edge MV3 extension for a Persian-speaking YouTube creator (owner: Hossein). WXT + React + TypeScript, single package. Provider-neutral: no agent-specific code in the product.

## Startup (keep context small)
- `git status` first. Read only `AGENTS.md`, `docs/NEXT.md` and the files for the current task. Use `rg` and targeted reads.
- Skip `node_modules/`, `.output/`, `.wxt/`, `package-lock.json` bodies, `tests/e2e/artifacts/`, `docs/MASTER_BRIEF.md` (open one section when needed).
- Feasibility of a feature: check `docs/FEATURE_MATRIX.md` and `docs/INTEGRATIONS.md` before researching again.

## Scope and authority
- Work only in the milestone the owner authorized (see `docs/NEXT.md`). Small end-to-end slices; no unrelated refactors, formatting sweeps or dependency upgrades.
- Never: paid services, store publication, live YouTube writes, posting/messaging outside the repo, force-push, committing personal data or secrets. Ask once when a material decision depends on the owner.
- The repo is public. Run `git diff --cached` and a secret check before every commit.

## Truthfulness
- Label claims Verified / Inferred / Proposed / Unknown. "Builds" ≠ "works in the browser" ≠ "works with a real account".
- Never show missing, private or unsupported data as zero. Never present sample data as the owner's channel.
- No proxy metric labelled as an exact replacement (search volume, CTR, ranking). Gate derived metrics on YouTube policy (docs/INTEGRATIONS.md).
- No private/undocumented YouTube endpoints, cookie use or scraping fallbacks.

## Code rules
- Pure rules in `src/domain/` (no browser APIs). Persisted records: `src/storage/db.ts` is the only owner; record shapes and validation in `src/domain/records.ts`. Preferences: `src/storage/prefs.ts`.
- All UI text through `src/i18n` (`en.ts` keys; `fa.ts` must match, test enforces it). Logical CSS properties only; `dir="auto"`/`<bdi>` for user text.
- Content scripts are read-only, inject no UI unless a milestone asks for it, and validate sender + message type. Page DOM is untrusted.
- Minimal permissions: currently `storage`, `sidePanel`, hosts `www.youtube.com`, `studio.youtube.com`. Adding any permission needs a decision record.
- No `eval`, remote code, or HTML injection from data.
- Local edits: no modal; reversible actions get Undo. Destructive/bulk/public actions: inline confirmation stating the consequence.

## Verification
- Every behaviour change: `npm run typecheck && npm test`. UI or extension wiring: also `npm run build && npm run e2e`.
- Bug fixes get a regression test. Do not re-run whole audits or competitor research for small changes.

## Handoff
- Update `docs/NEXT.md` (replace, don't append): state, decisions, next task, commands run and results, blockers.
- Material decisions go to `docs/DECISIONS.md`; user-visible changes to `CHANGELOG.md`.

## Skills (read only when the task matches)
- Bug or failing test → `.agents/skills/systematic-debugging/SKILL.md`
- New testable behaviour → `.agents/skills/test-driven-development/SKILL.md`
- Before any "done" claim → `.agents/skills/verification-before-completion/SKILL.md`
- UI work → `DESIGN.md`
Sources and licences: `.agents/skills/SOURCES.md`. Skills never override the owner's authorization.

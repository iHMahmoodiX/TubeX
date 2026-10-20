# Design

Mode: **Operate**. Familiar controls, fast scanning, clear consequences, restrained visuals. Palette and type are **proposed** until the owner reviews real screens (screenshots: run `npm run e2e`, see `tests/e2e/artifacts/`).

## Surfaces (M1)
- **Side panel** (`entrypoints/sidepanel`): current page card → idea capture → current draft (editor, checks, package, collapsible preview) → recent ideas. Header: active channel, "not connected" badge, open workspace.
- **Workspace** (`entrypoints/workspace`, full tab): Ideas, Drafts, Templates, Channels, Settings. Hash routes (`#drafts/<id>`). Focus moves to the section heading on route change.
- **Popup**: save current page as idea, open panel, open workspace, connection status. Nothing else.
- No UI is injected into YouTube pages in M1.

Job-based navigation (Research / Prepare / Improve / Library) is the target; M1 uses object sections because Research and Improve need YouTube data (M2+). Revisit when those land rather than show empty sections.

## Tokens (`src/styles/base.css`)
- Colour: warm neutrals (`--bg`, `--surface`, `--surface-2`, `--border*`, `--text*`), one orange action accent (`--accent` #c2410c light / #fb923c dark), status colours with soft backgrounds. Dark theme via `data-theme="dark"` on `<html>`; system follows `prefers-color-scheme`.
- Type: Estedad (Persian) and Figtree (English), variable, bundled locally from Fontsource (OFL-1.1). Sizes `--text-s/m/l/xl`. Persian line-height 1.75.
- Space `--space-1..5` (4–24 px); radius `--radius-s` 6 px, `--radius-m` 10 px.

## Components (`src/components/ui.tsx`)
`Button` (default/primary/ghost/danger, `s` size), `Field` (label + counter + help, wires `aria-describedby`), `Notice` (info/warning/error/success; error is `role=alert`), `Empty`, `ConfirmButton` (inline two-step confirmation, no modal), toasts with optional Undo (`role=status`, polite).

## RTL and mixed text
- `<html lang dir>` follows UI language instantly across all open pages (storage change event).
- Logical CSS properties only. User text fields and previews use `dir="auto"`/`unicode-bidi: plaintext`; names, handles and URLs in `<bdi>`; handles are LTR inputs.
- Search matching normalizes ي/ك variants, ZWNJ, diacritics and Persian/Arabic digits; saved text is never rewritten.
- Numbers in Persian UI use Persian digits; dates use the Persian calendar (`fa-IR-u-ca-persian`).

## States
Loading, empty, no match, unsupported page, unreadable page, saving/saved/unsaved/failed (with retry), edit conflict (keep mine / load other), corrupt records hidden with notice, storage open failure with retry, import errors, connection-not-available explanations. Not yet: offline/quota/auth states (arrive with M2).

## Confirmation policy
Local reversible edits: no dialog, Undo toast. Replace-all import and delete-all data: inline confirmation stating the consequence. Public writes (M4+): preview with exact video IDs and fields.

## Checked (2026-10-20, Chromium 141 headless, fixtures)
Persian/English, light/dark, side panel at 320 px and workspace at 320 px and 1280 px without horizontal overflow; keyboard reaches nav first; focus moves to heading on route change. Not yet checked: screen-reader run, 200% zoom, Edge, contrast measurement with a tool (token pairs were chosen for ≥4.5:1 but not measured).

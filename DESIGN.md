# Design

Owner-chosen design language (2026-10-20): the Spotify-inspired brief he uploaded. TubeX adapts it to a creator tool: **content-first darkness** where video thumbnails and channel art are the only decorative colour, one functional green accent, pill and circle geometry, heavy elevation, compact bold/regular type.

## Rules
- **Dark by default** (`#121212` page, `#181818`/`#1f1f1f` surfaces, black frame between workspace panels). Light theme is an achromatic variant for those who choose it.
- **Green `#1ed760` is functional only**: primary action, active state, positive change, score fill. Never decoration, never a background wash. No other brand colours. Semantic: red `#f3727f` errors/negative, orange `#ffa42b` warnings, blue `#539df5` info.
- **Colour comes from content**: the workspace hero tint is taken from the active channel's avatar (`useArtColor`); lists show thumbnails (`Thumb`) and avatars (`Avatar`).
- **Pills and circles**: every button is a pill (`Button`), icon controls are circles (`IconButton`), the main action of a page may be the round green `.play-btn`. Search inputs are pills (`SearchInput`). Cards 8 px radius, no borders; depth comes from shade (`--surface` → `--surface-2` → `--surface-3`) and heavy shadows for floating things.
- **Type**: Figtree (Latin, Circular-like geometric) and Estedad (Persian), bundled. Bold (700/800) vs regular (400) contrast instead of many sizes; 12–16 px for UI, big 28–48 px page titles in `PageHeader`. English buttons are uppercase with wide tracking; **Persian never gets letter-spacing or uppercase** (it breaks Arabic-script joining).
- **Dense, scannable lists**: videos, keywords, comments and alerts use the track-list pattern (`.tracks`/`.track`: index, thumbnail + title + subtitle, right-aligned numbers) like a Spotify playlist, not boxed cards.
- **Pages**: `PageHeader` (kicker, big title, one-line description, optional art) → action bar (primary green pill first) → `Tabs` (pills) → content. One primary action per view.
- **Never show missing data as zero**: use `—`, `Score value={null}`, or a sentence saying why it is missing.
- **Words**: plain verbs, sentence case, the button says what happens ("Schedule update", not "Submit"); errors say what happened and what to do.

## Tokens and components
`src/styles/base.css` (tokens on `:root` and `.tx-root`, all sizes in px so in-page UI is unaffected by YouTube's 10 px root font). Components in `src/components/ui.tsx`: `Button`, `IconButton`, `Field`, `Notice`, `Empty` (icon, title, action), `ConfirmButton`, `PageHeader`, `Card`, `Tabs`, `Stat`, `Score`, `Meter`, `Skeleton`, `SearchInput`, `Switch`, `Avatar`, `Thumb`, `BarChart`, `LineChart`. Icons: `src/components/icons.tsx` (`<Icon name="…" />`, own 24 px stroke set; add paths there). Live lists of work stores: `useWork('alerts' | 'jobs' | 'trackers' | 'snapshots')`.

## Surfaces
- **Workspace** (full tab): black frame, start-side nav panel (groups: Create, Research, Analyze, Manage, Engage) with "Your library" (Google channels, watched channels), main panel with top bar (back/forward, search pill, language, theme, alerts bell, channel avatar). Routes in `entrypoints/workspace/App.tsx`.
- **Side panel**: the same language at 320–400 px; sticky header; page-aware tools first.
- **Popup**: quick actions only.
- **In-page (YouTube and Studio)**: islands in shadow roots (`src/inpage/mount.tsx`), following YouTube's own dark/light theme and font, with the green TubeX mark. Never restyle or hide YouTube's UI; add, don't replace. Studio form fields are filled only on an explicit click and saved by Studio's own Save.

## Quality floor
Keyboard reachable with visible focus (white ring on dark), `aria-current` on nav, tabs are `role=tablist` with arrow keys, 320 px without horizontal scroll, reduced motion respected, logical CSS properties only, `dir="auto"` / `<bdi>` for user and YouTube text. Review real screens with `node tests/e2e/shots.mjs <outDir> <route…>` (env `LANG_UI`, `THEME`, `WIDTH`, `PAGE`).

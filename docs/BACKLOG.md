# Backlog

IDs refer to docs/FEATURE_MATRIX.md. No external issue tracker is used yet.

## Do now (needs owner)
- Review M1 in a real browser (Chrome and Edge on Windows): install steps, Persian copy, palette and fonts.
- Decide M2 start: create a Google Cloud project (OAuth client for a Chrome extension, test users) or postpone.

## Validate first
- Re-audit TubeBuddy and vidIQ official catalogs from a normal browser; correct FEATURE_MATRIX rows (evidence S/B/U → verified).
- Verify every Inferred API fact in INTEGRATIONS before its milestone; read the derived-metrics policy.
- Check watch-page selectors against live YouTube; update the fixture from a sanitized real snapshot.
- Run the e2e smoke on Windows Chrome and Edge.

## Do next (M2, when authorized)
- Stable extension ID (manifest `key`), service worker, OAuth read-only connect/disconnect, verified channel identity per profile (HU-01, IP-07).
- Own videos list and metadata backup (BK-04), Studio CSV import (AN-08), watchlist (DC-01).

## Maintain
- Keep fixtures and adapter version in step with YouTube changes; kill switch documented.
- Dependency updates only with a reason; re-run `npm run check && npm run e2e`.

## Automate
- CI workflow (typecheck, unit, build, e2e headless) once the owner wants GitHub Actions minutes used.

## Park
- KW-02 exact search volume, KW-09 search overlays, AN-06 realtime, TH-04 image generation, RP-02 rendering, EC-*.

## Drop
- Social monitor (PR-03), coaching and mobile features (EC-02, EC-03).

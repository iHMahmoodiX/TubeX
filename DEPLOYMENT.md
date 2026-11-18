# Deployment (local only)

TubeX is not published to any store. A "release" here is a local build you load unpacked.

## Build
```bash
npm ci            # exact versions from package-lock.json
npm run check     # typecheck, unit tests, build
npm run zip       # optional archive: .output/tubex-<version>-chrome.zip
```
Edge uses the same Chromium build (`.output/chrome-mv3`). `npm run build:edge` exists but is not verified yet.

## Install / update
1. `chrome://extensions` or `edge://extensions` → Developer mode → Load unpacked → `.output/chrome-mv3`.
2. Update: rebuild, then **Reload** on the extension card. Data in IndexedDB and `chrome.storage.local` survives reloads and updates of the same unpacked folder.
3. Removing the extension deletes its data. Export a backup first (Settings → Backup).

## Rollback
`git checkout <previous tag or commit>`, `npm ci`, `npm run build`, Reload. If a newer version wrote a newer backup format, the older version refuses to import it (by design); keep the backup until you upgrade again.

## Record per build
Manifest version (`package.json` → `version`), commit SHA, `npm run check` result. Do not call a development zip a store release.

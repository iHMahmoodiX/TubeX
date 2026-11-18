# Aparat feasibility and capability matrix (A0, #16)

Checked on **2026-11-18**. Re-check before widening the Aparat scope.

## What was looked at

| Source | Result |
|---|---|
| `https://www.aparat.com/etc/api` (the legacy web-service path used by community libraries) | Not readable by automated tools (robots.txt disallows). No public developer portal, published terms for API clients, scopes, OAuth or rate limits were found. |
| `https://api.aparat.com/` | A documentation landing page was noted earlier (docs/NEXT.md); not readable by automated tools now (robots.txt) and no usable public spec, scopes or terms were verified. |
| `https://support.aparat.com` (help center, e.g. article 94 "How do I upload a video?") | Blocked for automated reads (robots.txt). Owner can open it in a browser. |
| Community wrappers: `mahdikhashan/aparat-python`, `meysam1366/LaravelAparat`, `im-javad/aparat-API`, `AparatPHP`, `m2sh/AparatVideoUploader`, `karim23657/AparatUploader` | Unofficial. Log in with **username + sha1(md5(password)) in the URL path** and get an `ltoken`, or reuse **browser cookies**; upload through an `uploadform` handshake. |
| `apieco.ir/docs/aparat.html` | Third-party reseller proxy of the same legacy endpoints (search, video, profile, uploadform, delete, login) behind its own API key. Not Aparat. |
| Project notes (docs/NEXT.md, 2026-11-18): Aparat help-center upload guidance | Description ≤ 2000 characters, 3–5 tags each ≤ 23 characters, cover 1920×1080, playlists, captions and scheduling in the native UI. Recorded earlier; re-check live. |
| How-to guide (anzalweb.ir, "آموزش آپلود ویدیو در آپارات") | Upload form: title **required**, description optional, tags **required, at least 3**, category **required (one)**, thumbnail from a frame or an uploaded image, subtitle **SRT only**, "save, publish later" option. No published max lengths, tag limits or cover size. |

## Capability matrix

| Capability | Officially documented & permitted for a third-party extension? | TubeX decision |
|---|---|---|
| OAuth / delegated sign-in | **No** (only password-in-URL or cookies) | Not built. Never ask for an Aparat password or read cookies. |
| Upload video | **No** | Not built. Owner uploads on Aparat's page. |
| Edit metadata of a published video | **No** | Not built. |
| Schedule / publish | **No** | Owner does it on Aparat. TubeX keeps a "publish time" note only. |
| Bulk edit, delete | **No** | Not built. |
| Own channel analytics | **No** | Not built. Manual note/URL record only. |
| Public search / video / channel data | Legacy endpoints exist, **undocumented, no terms** | Not used. Revisit only if Aparat publishes an API with terms. |
| Comments read/write | **No** | Not built. |
| Open Aparat's own upload page | Yes (ordinary link) | **Built**: "Open Aparat upload page". |
| Read the open aparat.com tab's URL and title | Yes, with the owner's site permission | **Built**, opt-in: Settings → Aparat helpers (asks for `https://www.aparat.com/*`, removed when turned off). |
| Prepare/validate/copy/export metadata | Local only | **Built**: Aparat package in each draft. |

## Rules used by the validator (`src/domain/aparat.ts`)

| Rule | Value | Source | Severity |
|---|---|---|---|
| Title required | – | how-to guide | error |
| Category required | – | how-to guide | error |
| Minimum tags | 3 | how-to guide | error |
| Max tags | 5 | Aparat upload guidance (project notes, docs/NEXT.md of 2026-11-18) | error |
| Tag length | 23 chars | Aparat upload guidance (same) | error |
| Description length | 2000 chars | Aparat upload guidance (same) | error |
| Title length | ~100 chars | inferred default | warning |
| Subtitle format | SRT | how-to guide | note |
| Cover | 1920×1080 (16:9) recommended | Aparat upload guidance (same) | note |

Inferred values are never errors. YouTube limits are never applied to the Aparat package.

## Owner checks (live)

1. Confirm `https://www.aparat.com/upload` opens the upload page when signed in (constant `APARAT_UPLOAD_URL`).
2. Compare the form's category names, tag limit and title/description limits with the table above; report differences.
3. With "Aparat helpers" on, open an Aparat video and save it as an idea from the side panel.

## Not built, and why

Login/upload/edit automation, cookie reuse, scraping and the legacy `etc/api` endpoints: no official documentation or terms, and they require handling the owner's Aparat password. This follows the plan's rule: no undocumented endpoints, cookies or spoofed login.

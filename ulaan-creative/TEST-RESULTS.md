# Test results — 18 Oct 2026

Environment: local dev server (`scripts/dev-server.mjs` → the same `api/router.js` Vercel runs), PostgreSQL 16, `STORAGE_DRIVER=local` for the browser tests, the S3 driver tested against the `s3rver` emulator, Chromium (Playwright) at 1360×900 and 390×844 (iPhone width).

## Passed

**Browser end-to-end (44/44)**

| Area | Checks that passed |
| --- | --- |
| Auth | Unauthenticated `/admin/dashboard` → login; wrong password rejected; login works; HttpOnly + SameSite=Strict cookie; session survives refresh; after logout the old token gets 401 and protected routes redirect to login |
| Media | Uploaded 3 images + MP4 + WebM with progress; fake `.jpg` (text) and random-bytes `.mp4` rejected by server-side magic-byte check; duplicate detected and reused; type filter; replace file (old object deleted, new file shown publicly); delete refused while media is used by a project |
| Portfolio | Create with cover, uploaded video and 2-item gallery; publish → appears on homepage + `/work/<slug>`; cover loads; **video plays**; unpublish → 404 publicly and hidden from homepage; admin draft preview |
| Influencers | Create (photo uploaded from the picker); URL validation; draft private (section hidden); publish → visible; no fabricated follower count; edit reflected; unpublish hides; delete |
| Content | Draft not public; draft visible in admin preview; publish → public; package price edit published; contact details hidden until set |
| Contact | Client validation incl. consent; submission stored in DB; visible in admin |
| Responsive | Admin has no horizontal overflow at iPhone width; no unexpected console errors |

**Persistence (passed):** after restarting the backend and opening a brand-new browser session, the project, edited content, 6 media files and submissions were all still there, and the admin login still worked.

**API / security (`npm test`, 11/11)**
* 10 admin endpoints return 401 without a session; a forged cookie is also rejected.
* Previews require a session.
* Missing CSRF header → 403; foreign `Origin` → 403.
* Rejected uploads: `.exe`, `.svg`, oversize image or video, extension/MIME mismatch.
* Empty title rejected; `javascript:` URLs rejected; unknown content key → 404; unknown fields dropped; HTML is escaped on render (XSS).
* Drafts never appear in `/api/public/content`, `/work/<slug>` or the sitemap.
* CSP nonce, `nosniff`, `X-Frame-Options: DENY` and `noindex` are present.
* Contact form: consent required, unknown service rejected, too-fast submissions rejected, honeypot works, rate limit kicks in after 5.
* Login rate limit: 429 after 5 failures.
* S3 driver against the emulator: presigned PUT → HEAD → range read → public GET → delete.
* SigV4 query signing matches the official AWS test vector.

**Other:** reduced-motion run of the homepage showed no console errors and all content visible. Migrations run twice safely. The CLI rejects weak admin passwords.

## Not performed (needs owner credentials / devices)

* **Real Cloudflare R2 / AWS S3 bucket:** no credentials. The signing algorithm is verified against AWS's reference vector, and the full upload flow against an S3 emulator, but the bucket CORS and public URL must be checked after setup. Upload one image and one video in *Admin → Медиа сан* as the first production test.
* **Managed Postgres (Neon/Supabase):** tested on local PostgreSQL 16 only.
* **Vercel deployment, domains and HTTPS:** no deployment access was used. `vercel.json` rewrites (incl. the admin-host rule) are untested on Vercel itself.
* **Resend e-mail notifications:** no API key. Submissions are stored in the DB regardless.
* **Mobile Safari / real iPhone:** only Chromium is available in this environment. Layouts were checked at iPhone width in Chromium.
* **H.264 MP4 playback:** the test Chromium build has no proprietary codecs, so playback was verified with a WebM upload. MP4 upload and validation were tested. MP4 (H.264) plays in Chrome, Safari, Edge and Firefox.

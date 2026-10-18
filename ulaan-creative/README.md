# Ulaan Creative — website + CMS

Public agency website **and** a separate admin dashboard to manage portfolio projects, images, videos, influencer profiles, website text, services, pricing, SEO and contact submissions — without editing code.

| Part | URL | Code |
| --- | --- | --- |
| Public website | `https://ulaancreative.mn/` | `lib/render.js` (server-rendered), `public/assets/*` |
| Project pages | `https://ulaancreative.mn/work/<slug>` | `lib/render.js` |
| Admin dashboard | `https://admin.ulaancreative.mn/login` (or `/admin/login`) | `public/admin/assets/*`, `lib/admin-shell.js` |
| API | `/api/public/*`, `/api/contact`, `/api/admin/*` | `api/router.js` → `lib/*.js` |

## Architecture

```
Browser ──► Vercel ──► api/router.js (one Node function)
                         ├─ public pages: SSR from Postgres (published data only), 20 s CDN cache
                         ├─ /api/contact: validate → store in Postgres (+ optional Resend e-mail)
                         └─ /api/admin/*: session check (Postgres) + CSRF/origin check → CRUD
Admin browser ──presigned PUT──► S3-compatible bucket (R2/S3)  ◄── public media URLs
```

* **Stack:** no build step. Plain HTML/CSS/JS, GSAP + ScrollTrigger + Lenis (self-hosted in `public/assets/vendor`). Node 18+ serverless function. Only two runtime dependencies: `pg` and `aws4fetch`.
* **Database:** PostgreSQL. Schema: `migrations/001_init.sql`.
* **Media:** any S3-compatible bucket (Cloudflare R2 recommended). Uploads go **directly from the browser to the bucket** through 15-minute presigned URLs, so large videos never pass through or sit in a serverless function. After upload the server checks the real size and **reads the file header (magic bytes)** to verify the type. It never trusts the extension or browser MIME type.
* **Content model:** every website section is stored as JSON with **draft** and **published** versions (`site_content`). Public pages only read published data. The admin can preview drafts at `/admin/preview/site`.
* **Fallback:** if the database is unreachable, the public site still renders using built-in default content (`lib/defaults.js`).

### Folders

```
api/router.js            the only serverless function (routes everything)
lib/                     server code: db, auth, storage, media rules, content, render, admin API, mascot
migrations/              SQL schema
public/                  static files served by Vercel (site assets, admin app, mascot files)
scripts/                 dev server, migrations, admin creation, mascot export
test/                    automated tests (node --test)
```

---

## 1. Run locally

Requirements: Node 18+, PostgreSQL 14+.

```bash
cd ulaan-creative
npm install
cp .env.example .env.local      # then edit .env.local
```

Minimal `.env.local` for development (local disk storage, **never used in production**):

```
DATABASE_URL=postgres://postgres@127.0.0.1:5432/ulaan
STORAGE_DRIVER=local
```

```bash
createdb ulaan                                   # or create it in your DB tool
npm run db:migrate                               # creates tables (safe to re-run)
npm run admin:create -- --email you@example.com  # asks for a password (hidden)
npm run dev                                      # http://localhost:3000  ·  admin: http://localhost:3000/admin
```

## 2. Database (production)

Use a managed Postgres, e.g. **Neon** (Vercel Marketplace → Neon), **Supabase** or **AWS RDS**.

1. Create a database and copy the **pooled** connection string (Neon: "Pooled connection"; Supabase: "Transaction pooler").
2. Put it in `DATABASE_URL` (Vercel env vars, and your local `.env.local` when running migrations).
3. From your computer: `DATABASE_URL="postgres://…" npm run db:migrate`.
4. Re-run `npm run db:migrate` after future updates that add files to `migrations/`.

TLS is required automatically for non-local hosts (`DATABASE_SSL=false` only for a local DB).

## 3. Media storage (Cloudflare R2 example)

1. Cloudflare dashboard → **R2** → *Create bucket* (e.g. `ulaan-media`).
2. Bucket → *Settings* → **Public access**: connect a custom domain (e.g. `media.ulaancreative.mn`) or enable the `r2.dev` URL. Put that URL in `MEDIA_PUBLIC_BASE_URL`.
3. Bucket → *Settings* → **CORS policy** (needed for browser uploads):

   ```json
   [
     {
       "AllowedOrigins": ["https://admin.ulaancreative.mn", "https://ulaancreative.mn"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. R2 → **Manage API tokens** → create a token with *Object Read & Write* on this bucket. Set:

   ```
   STORAGE_DRIVER=s3
   S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=ulaan-media
   S3_ACCESS_KEY_ID=…
   S3_SECRET_ACCESS_KEY=…
   ```

AWS S3 works the same way: `S3_ENDPOINT=https://s3.<region>.amazonaws.com`, `S3_REGION=<region>`, a bucket policy allowing public `GetObject`, and the same CORS rules. MinIO/Backblaze may need `S3_FORCE_PATH_STYLE=true`.

**Upload limits & automatic conversion:** the admin accepts anything a phone or camera produces and converts it **in the browser before upload**, so every published file works on Android, iPhone and desktop:
* Photos: JPG, PNG, WebP, AVIF, GIF are kept. **HEIC/HEIF (iPhone), TIFF, BMP** … are converted to JPEG (PNG/WebP with transparency → WebP). Photos above `MAX_IMAGE_MB` (default 15 MB) or larger than ~6000 px are scaled down to 4096 px instead of being rejected. RAW/PSD/SVG/PDF are refused with an explanation.
* Videos: the published format is always **MP4 with H.264 video + AAC audio**. iPhone HEVC `.mov`, WebM/VP9, AV1 … are converted with WebCodecs (Mediabunny); H.264 `.mov` is just rewrapped to MP4; videos are scaled to 1920 px when converted. The server re-checks every video (`lib/mp4-probe.js`) and refuses anything that is not H.264 + AAC MP4, so an unplayable video can never reach the site. Converting needs a current Chrome, Edge or Safari (desktop or phone); if a browser can't, the admin shows how to export H.264 MP4 instead. `MAX_VIDEO_MB` (default 500 MB) applies to the converted file.
* Libraries live in `public/admin/assets/vendor` (see its README for versions/licenses) and load only when a file needs converting. The admin CSP therefore allows `'wasm-unsafe-eval'` and `blob:` workers.

## 4. Deploy on Vercel

This folder lives inside the `amjuulya` repository, so deploy it as its **own Vercel project**:

1. Vercel → *Add New → Project* → import the repository.
2. **Root Directory:** `ulaan-creative`. Framework preset **Other**. Leave the build and output settings empty: Vercel serves `public/` and deploys `api/router.js`.
3. Add environment variables from `.env.example` (DATABASE_URL, S3_*, MEDIA_PUBLIC_BASE_URL, SITE_URL, ADMIN_HOST, IP_HASH_SALT, optional RESEND_*). Generate `IP_HASH_SALT` with `openssl rand -hex 32`.
4. Deploy. Then run migrations (section 2) and create the admin (section 5).

## 5. Admin account

There is **no default account and no default password**. Create the owner account from a computer that can reach the production DB:

```bash
DATABASE_URL="postgres://…production…" npm run admin:create -- --email owner@ulaancreative.mn
```

You'll be asked for the password (hidden input; at least 12 characters, letters + digits). Running the same command again for an existing e-mail **resets** its password and signs out all its sessions. The owner can also change the password in *Admin → Тохиргоо*.

Security model:
* Passwords are hashed with scrypt.
* Sessions are random 256-bit tokens. Only their SHA-256 is stored in Postgres, and every request is validated server-side.
* The cookie is `__Host-` prefixed, `HttpOnly`, `Secure`, `SameSite=Strict`, and expires after 12 h (`SESSION_TTL_HOURS`).
* Logout deletes the session. *Change password* and *logout everywhere* revoke other sessions.
* Login is rate-limited (5 failures per account and 10 per IP in 15 min), stored in Postgres.
* Every admin write requires the session, a same-origin `Origin`, and the `X-UC-Admin` header.
* CSP, `X-Frame-Options: DENY` and `noindex` are set on the admin.

## 6. Domains & DNS

1. In the Vercel project → *Settings → Domains*, add `ulaancreative.mn`, `www.ulaancreative.mn` (redirect to apex) and `admin.ulaancreative.mn`.
2. At your DNS provider create the records Vercel shows. Typically:
   * `A @ → 76.76.21.21`
   * `CNAME www → cname.vercel-dns.com`
   * `CNAME admin → cname.vercel-dns.com`
3. Set `SITE_URL=https://ulaancreative.mn` and `ADMIN_HOST=admin.ulaancreative.mn`, then redeploy.
4. If your admin domain is different, update the `"value"` of the `host` rule in `vercel.json` too.
5. Media domain (R2 custom domain): add `media.ulaancreative.mn` in Cloudflare and point `MEDIA_PUBLIC_BASE_URL` at it.

Without an admin subdomain, the dashboard works at `https://ulaancreative.mn/admin`. When `ADMIN_HOST` is set, `/admin` on the public domain redirects to the subdomain.

## 7. Contact form

* Submissions are validated server-side, protected by a honeypot, a minimum fill time and DB-backed rate limiting (5 per 10 min per visitor), require privacy consent, and are **stored in Postgres**. They appear in *Admin → Ирсэн хүсэлтүүд*.
* Optional e-mail notification via [Resend](https://resend.com): verify your domain in Resend, then set `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`.
* The visitor sees success only if the submission was stored or e-mailed. Otherwise they see an error and are told nothing was sent.
* Visitor IPs are stored only as a salted hash. Delete old submissions from the admin when they are no longer needed.

## 8. Brand: logo + mascot "Ulaan"

**Logo:** the owner-supplied ULAAN CREATIVE logo, extracted onto a transparent background in three versions (`public/assets/img/`):

| File | Look | Used for |
| --- | --- | --- |
| `ulaan-logo-light.webp` / `.png` | white + red stripe | dark backgrounds: scrolled nav, mobile menu, footer, admin sidebar, structured data |
| `ulaan-logo-dark.webp` | black + red stripe | light backgrounds: admin login |
| `ulaan-logo-on-red.webp` | white + black stripe | the red hero and the loader (a red stripe would disappear on red) |

For print or large formats, ask the designer for the original vector (SVG/AI) file.

**Mascot (bomb character):** the 3D bomb character from the owner-supplied poster, used **with the creator's permission** (keep that permission in writing). It was cut out of the poster:
* background, poster typography and logo removed;
* the yellow bounce light re-tinted red so it sits on the red site;
* the arm is cropped where the poster tagline crossed it.

| File | Use |
| --- | --- |
| `public/assets/img/ulaan-bomb.webp` (959×1492) + `ulaan-bomb-sm.webp` (480 px) | hero and 404 page only |
| `public/assets/mascot/ulaan-bomb.png` | transparent PNG for social / presentations |
| `public/assets/mascot/ulaan-bomb-icon-512.png`, `public/assets/img/favicon-32.png`, `icon-192.png`, `apple-touch-icon.png` | icons (bomb head on red) |

In the hero, the bomb sways around the hand, follows the cursor slightly, and the "Start a project" line points to its left eye (`.hero__eye` in `styles.css`; adjust `left/top` if the image is replaced). For a sharper or animated version (e.g. a lit fuse), ask the creator for the original render or 3D file.

**Fonts:** self-hosted in `public/assets/fonts` (`public/assets/css/fonts.css`, SIL OFL): Oswald (display), Inter (body), JetBrains Mono (labels). Each family covers Latin and full Cyrillic, so Mongolian Ө Ү ө ү render in the same typeface as the rest of the word. No Google Fonts request.

**Service visuals:** *AI Creative Production* shows real work (images / playable videos) added in *Admin → Үйлчилгээнүүд → Бүтээлүүд*; until then it shows "Бүтээлүүд удахгүй нэмэгдэнэ". *Brand & Digital* shows its own steps as a staircase. If a section was published before this update, press **Анхдагч руу буцаах** in the admin to load the new default texts.

**Influencers (creator browser):** the nav item *Influencers* opens a full-screen browser:
* optional **featured** creator (Admin → Influencer → «Онцлох»), then **horizontal rows per category** (admin-managed, many-to-many — a creator can appear in several rows; uncategorised creators appear under *Other*);
* **search** by name, **Filter** panel (categories incl. *All*, follower ranges 1K–10K … 500K+, sort: recommended / followers ↑↓); filters combine, empty rows hide, a clear empty state shows when nothing matches;
* **multi-select** (+ Сонгох on each card / featured / details) with a selection bar (review + remove) and a **campaign inquiry** form (name, company, phone/e-mail, objective, optional dates, notes). Inquiries are stored in `contact_submissions` (kind `influencer`, selected creators as `[{id,name}]`; only *published* creators are accepted) and appear in *Admin → Ирсэн хүсэлтүүд*;
* engagement is shown only when the admin ticks «Engagement баталгаажсан».

**Home preview:** the home page shows an *INFLUENCERS* row with up to 8 published creators (featured first, then the admin order) — the same data and cards as the full browser, so admin edits show in both. Arrows / drag on desktop, swipe on phones; selecting a creator there is shared with the full browser. «БҮГДИЙГ ХАРАХ →» opens the full browser (`#influencers`). The subtitle is editable in *Website content → Influencer хэсгийн текст*.

**Private price:** the influencer **price** is stored for the admin only. It is never in the public HTML, JS, `/api/public/*` or the contact flow (covered by `test/api.test.mjs`).

**Categories:** Admin → Influencer-ууд → «Ангиллууд»: add, rename, reorder, delete. Deleting a category removes only its links, never the profiles. Default categories are seeded by `migrations/003_influencer_categories.sql`; run `npm run db:migrate` after updating.

**Demo preview:** `npm run build:html -- --demo` writes `ulaan-creative-influencers-demo.html` with clearly labelled *DEMO Creator* profiles (no photos, invented numbers, red DEMO banner). Never publish it as the real site.

## 9. Tests

```bash
npm test                         # all tests in test/ (S3 tests need devDependencies)
node --test test/storage-s3.test.mjs
TEST_BASE=http://localhost:3000 TEST_EMAIL=… TEST_PASSWORD=… node --test test/api.test.mjs   # against a running dev server with DB
```

## 10. Launch checklist

- [ ] Postgres created, `npm run db:migrate` run against production
- [ ] R2/S3 bucket + public URL + CORS configured; upload a test image and video in *Media*
- [ ] All env vars set in Vercel (see `.env.example`); `IP_HASH_SALT` generated
- [ ] Owner admin account created with a strong password; test login/logout on phone and desktop
- [ ] Domains added (site, www, admin, media) and HTTPS active; `SITE_URL` / `ADMIN_HOST` set
- [ ] Settings → contact e-mail, phone and social links entered **and published** (hidden until then)
- [ ] Services & pricing → confirm VAT wording for every package (flagged in the admin)
- [ ] Website content → review statistics: only keep confirmed numbers visible
- [ ] Add real portfolio projects (cover, gallery, video) and publish
- [ ] Add influencers only with confirmed details and permission; publish when ready
- [ ] SEO → title, description, Open Graph image (1200×630)
- [ ] Submit `https://ulaancreative.mn/sitemap.xml` in Google Search Console
- [ ] Optional: Resend configured and a test contact submission received

# Ulaan Creative — website

Single-page motion website for **Ulaan Creative**, a Mongolian creative marketing agency.
Static HTML/CSS/JS + one Vercel serverless function for the contact form. No build step, no npm dependencies.

```
ulaan-creative/
├── index.html              # all content (edit text, packages, placeholders here)
├── assets/css/styles.css   # design system + layout + motion initial states
├── assets/js/main.js       # GSAP/ScrollTrigger motion, Lenis, slider, form
├── assets/vendor/          # gsap 3.12.5, ScrollTrigger, lenis 1.1.13 (self-hosted)
├── assets/img/             # mascot (from the reference image), OG image, icons
├── api/contact.js          # POST /api/contact → Resend email
├── scripts/dev-server.mjs  # local server (static + API)
└── vercel.json
```

## Run locally

```bash
cd ulaan-creative
cp .env.example .env.local   # optional: fill in to test real email delivery
npm run dev                  # http://localhost:3000
```

## Deploy on Vercel

This folder lives inside the `amjuulya` repository, so deploy it as its **own** Vercel project:

1. Vercel → Add New → Project → import this repository.
2. **Root Directory:** `ulaan-creative`. Framework preset: **Other**. No build command, no output directory.
3. Add the environment variables below, then deploy.

### Contact form (required for real submissions)

The form posts to `/api/contact`, which sends the request through [Resend](https://resend.com).
Without these variables the API answers `503 not_configured` and the visitor is told that **nothing was sent** — it never fakes success.

| Variable | Example |
| --- | --- |
| `RESEND_API_KEY` | `re_…` |
| `CONTACT_TO_EMAIL` | the agency inbox (comma-separate several) |
| `CONTACT_FROM_EMAIL` | `Ulaan Creative <noreply@your-domain.mn>` (domain must be verified in Resend) |

Spam protection: hidden honeypot field, minimum fill time, per-instance rate limit, server-side validation and HTML escaping.

## Content still to supply / confirm

Search `index.html` for `PLACEHOLDER` and `CONFIRM`.

- [ ] **100+ brands/companies/projects** stat — owner-supplied claim; confirm or delete that `<li>`.
- [ ] **Portfolio** — five clearly labelled placeholder slots. Add `<img>` inside each `.work__media` (instructions in the HTML comment) and real titles.
- [ ] **Creators** — placeholder cards. Add portrait `<img>` in `.creator__portrait`, name, platform, follower count, and change the disabled “Профайл удахгүй” span to a real `<a href>`.
- [ ] **Email, phone, social URLs** — contact section + footer show “тун удахгүй”. Replace with real `mailto:` / `tel:` / profile links.
- [ ] **Mascot** — cropped and cleaned from the supplied 1199×675 reference, so it is ~609×675 px. Supply a high-resolution, background-matched render for sharper large screens (replace `assets/img/mascot.webp` and `mascot-sm.webp`, keep the same aspect or update `aspect-ratio` in `.hero__mascot`).
- [ ] **Domain** — set `<link rel="canonical">` and make `og:image` an absolute URL once the domain is known.
- [ ] **Packages** — edit names, prices and items directly in the Packages section.

## Motion & accessibility notes

- GSAP + ScrollTrigger for reveals, counters, stacking service panels, pinned manifesto, marquee, footer wordmark. Lenis smooth scroll runs on desktop pointers only.
- `prefers-reduced-motion`: no loader, no smooth scroll, no scroll/mouse animation — everything renders statically.
- No JS: all content is visible (motion initial states only apply under `.motion-ok`, and a 4 s safety net removes them if scripts fail).
- Mouse parallax, magnetic buttons and the cursor label only run on fine pointers.
- Fonts: Anton (Latin display) with Oswald fallback for Mongolian Cyrillic (incl. Ө/Ү), Inter body, JetBrains Mono labels.

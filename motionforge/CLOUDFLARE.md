# Deploying MOTIONFORGE STUDIO to Cloudflare Pages

The app is a static Vite + React build (no server runtime, no secrets, no API
functions). Rendering and export run entirely in the browser, so exported
videos never go through the static site.

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Root directory | `motionforge` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 22 (from `.node-version`) |
| Package manager | npm (`package-lock.json`) |
| Environment variables | none required |

Files in this folder that Cloudflare uses:

- `public/_headers` → copied to `dist/_headers`: immutable caching for hashed
  `/assets/*`, `no-cache` for the HTML shell (same policy as `netlify.toml`).
- `wrangler.toml` → project name and output dir for `wrangler pages deploy`.
- No `_redirects` is needed: Pages serves `index.html` for unknown paths when
  the build has no `404.html` (verified with `wrangler pages dev`).
- `vite.config.ts` uses an absolute base (`/`), so deep links and refreshes
  load the assets correctly. For a sub-path host set `MF_BASE=/path/`.

Largest file: `ort-wasm-simd-threaded.wasm` 14.2 MB (Pages limit: 25 MiB per
file); ~500 files in total (limit 20 000).

## Dashboard steps (needs your Cloudflare account)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
2. Pick the GitHub repository `kensquadzz/amjuulya`.
3. Production branch: the branch Netlify deploys today (`claude/motionforge-studio`),
   or `main` once that is merged.
4. Use the settings in the table above and Save and Deploy.
5. Open the `*.pages.dev` URL: check Home, open a template, play, export.
6. Only after that: add your custom domain in Pages → Custom domains, then retire Netlify.

## CLI alternative

```
cd motionforge
npm ci && npm run build
npx wrangler login            # or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
npx wrangler pages deploy dist --project-name motionforge-studio
```

## Local check (no account needed)

```
npm run build && npx wrangler pages dev dist --port 8788
```

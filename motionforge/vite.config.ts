import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Absolute base: the app is served from the site root (Cloudflare Pages, Netlify),
// so assets resolve from any URL path, including deep links that fall back to
// index.html. For a sub-path host (e.g. GitHub Pages project site) build with
// MF_BASE=/repo-name/ npm run build.
export default defineConfig({
  base: process.env.MF_BASE || '/',
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});

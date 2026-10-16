import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps asset paths relative so the build works from any sub-path
// (GitHub Pages project sites, Netlify, Cloudflare Pages, Vercel, a plain folder).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});

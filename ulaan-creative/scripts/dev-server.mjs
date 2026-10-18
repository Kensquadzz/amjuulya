// Local development server: serves public/ like Vercel's static output and
// sends everything else to the same router function Vercel runs.
// Usage: npm run dev   (reads .env.local)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './load-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const { default: router } = await import('../api/router.js');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
};
const port = Number(process.env.PORT) || 3000;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.join(root, decodeURIComponent(url.pathname));
  if (file.startsWith(root + path.sep) && (req.method === 'GET' || req.method === 'HEAD')) {
    try {
      const st = await stat(file);
      if (st.isFile()) {
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        return res.end(req.method === 'HEAD' ? undefined : await readFile(file));
      }
    } catch { /* not a static file — fall through to the router */ }
  }
  router(req, res).catch((e) => { console.error(e); if (!res.headersSent) { res.statusCode = 500; res.end('error'); } });
}).listen(port, () => console.log(`Ulaan Creative → http://localhost:${port}  (admin: http://localhost:${port}/admin)`));

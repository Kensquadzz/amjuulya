// Локал хөгжүүлэлтийн сервер: статик файлууд + /api/learn/* функцуудыг Vercel шиг ажиллуулна.
// Ажиллуулах: `npm run dev` (.env.local файл байвал түүнээс орчны хувьсагч уншина)
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

for (const file of [".env.local", ".env"]) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

// Зөвхөн хэл сурах API-г ачаална (messenger webhook-д Meta-ийн тохиргоо хэрэгтэй)
const API_ROUTES = new Set(["learn/chat", "learn/stt", "learn/tts", "learn/config"]);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) {
      const route = url.pathname.slice(5).replace(/\/$/, "");
      if (!API_ROUTES.has(route)) {
        res.statusCode = 404;
        return res.end("Not found");
      }
      const mod = await import(pathToFileURL(join(root, "api", `${route}.js`)).href);
      req.query = Object.fromEntries(url.searchParams);
      return await mod.default(req, res);
    }
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root + sep) && path !== root) {
      res.statusCode = 403;
      return res.end("Forbidden");
    }
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
    if (!existsSync(path) && existsSync(path + ".html")) path += ".html";
    if (!existsSync(path) || /[\\/](node_modules|\.git|api|scripts|test)([\\/]|$)/.test(path.slice(root.length)) || /[\\/]\.env/.test(path)) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    res.setHeader("Content-Type", TYPES[extname(path)] || "application/octet-stream");
    res.end(readFileSync(path));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.statusCode = 500;
    res.end("Server error");
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`AMJUULYA dev server: http://localhost:${port}/learn`));

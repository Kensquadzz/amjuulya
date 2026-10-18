// Single Vercel function that serves every dynamic route (Hobby plans allow 12
// functions; one router keeps us far below that). vercel.json rewrites send the
// original path in ?__p=…
import crypto from 'node:crypto';
import { HttpError, json, html, send, siteUrl, isProd } from '../lib/http.js';
import { dbConfigured } from '../lib/db.js';
import { requireAdmin } from '../lib/auth.js';
import { handleLocalStorage, storageDriver, blobPublicBase } from '../lib/storage.js';
import { getPublishedContent, getDraftContent, getPublishedProjects, getPublishedInfluencers, getInfluencerCategories, getProject, getMediaView, getContentMediaMap } from '../lib/content.js';
import { DEFAULT_CONTENT } from '../lib/defaults.js';
import { ensureMigrated } from '../lib/migrate.js';
import { renderHome, renderProject, renderNotFound } from '../lib/render.js';
import { handleContact } from '../lib/contact.js';
import { adminShell } from '../lib/admin-shell.js';
import * as A from '../lib/admin-api.js';

const UUID = '([0-9a-f-]{36})';

/* ------------------------------ security headers ------------------------------ */

const origin = (u) => { try { return new URL(u).origin; } catch { return ''; } };
function mediaOrigins() {
  const list = [origin(process.env.MEDIA_PUBLIC_BASE_URL || '')];
  if (storageDriver() === 's3' && process.env.S3_ENDPOINT) {
    const e = new URL(process.env.S3_ENDPOINT);
    list.push(process.env.S3_FORCE_PATH_STYLE === 'true' ? e.origin : `${e.protocol}//${process.env.S3_BUCKET}.${e.host}`);
  }
  if (storageDriver() === 'blob') list.push(origin(blobPublicBase()));
  return list.filter(Boolean);
}

function securityHeaders(res, { nonce, admin = false }) {
  const media = mediaOrigins().join(' ');
  const csp = admin
    ? `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: ${media}; media-src 'self' blob: ${media}; connect-src 'self' ${media}${storageDriver() === 'blob' ? ' https://vercel.com https://*.blob.vercel-storage.com' : ''}; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`
    : `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: ${media}; media-src 'self' ${media}; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'`;
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProd()) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (admin) { res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('X-Robots-Tag', 'noindex, nofollow'); }
}

/* ------------------------------ public pages ------------------------------ */

async function loadPublic() {
  try {
    const [content, projects, influencers, influencerCategories] = await Promise.all([getPublishedContent(), getPublishedProjects(), getPublishedInfluencers(), getInfluencerCategories()]);
    const ogMedia = content.seo.ogImageMediaId ? await getMediaView(content.seo.ogImageMediaId) : null;
    const mediaMap = await getContentMediaMap(content);
    return { content, projects, influencers, influencerCategories, ogMedia, mediaMap };
  } catch (e) {
    // Database unreachable: keep the site up with built-in content.
    console.error('[site] falling back to defaults:', e.message);
    return { content: structuredClone(DEFAULT_CONTENT), projects: [], influencers: [], influencerCategories: [], ogMedia: null, mediaMap: {} };
  }
}

const PUBLIC_CACHE = { 'Cache-Control': 'public, max-age=0, s-maxage=20, stale-while-revalidate=300' };

async function homePage(req, res) {
  const nonce = crypto.randomBytes(16).toString('base64');
  securityHeaders(res, { nonce });
  const data = await loadPublic();
  html(res, 200, renderHome({ ...data, site: siteUrl(req), nonce }), PUBLIC_CACHE);
}

async function projectPage(req, res, slug) {
  const nonce = crypto.randomBytes(16).toString('base64');
  securityHeaders(res, { nonce });
  const data = await loadPublic();
  const project = dbConfigured() ? await getProject({ slug }).catch(() => null) : null;
  if (!project) return html(res, 404, renderNotFound({ content: data.content, site: siteUrl(req), nonce }));
  html(res, 200, renderProject({ project, content: data.content, projects: data.projects, site: siteUrl(req), nonce }), PUBLIC_CACHE);
}

async function sitemap(req, res) {
  const site = siteUrl(req);
  const { projects } = await loadPublic();
  const urls = [`<url><loc>${site}/</loc></url>`, ...projects.map((p) => `<url><loc>${site}/work/${encodeURIComponent(p.slug)}</loc><lastmod>${new Date(p.updatedAt).toISOString().slice(0, 10)}</lastmod></url>`)];
  send(res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`, { 'Content-Type': 'application/xml; charset=utf-8', ...PUBLIC_CACHE });
}

function robots(req, res) {
  send(res, 200, `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${siteUrl(req)}/sitemap.xml\n`, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
}

/* ------------------------------ admin shell ------------------------------ */

const adminHost = () => (process.env.ADMIN_HOST || '').toLowerCase();
const reqHost = (req) => String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();

async function adminPage(req, res, path) {
  const onAdminHost = adminHost() && reqHost(req) === adminHost();
  if (adminHost() && !onAdminHost && isProd()) {
    res.statusCode = 308; res.setHeader('Location', `https://${adminHost()}${path.replace(/^\/admin/, '') || '/'}`); return res.end();
  }
  const base = onAdminHost ? '' : '/admin';
  const sub = path.replace(/^\/admin/, '') || '/';

  // Authenticated previews (draft content / draft project)
  if (sub === '/preview/site' || sub.startsWith('/preview/project/')) {
    await requireAdmin(req);
    const nonce = crypto.randomBytes(16).toString('base64');
    securityHeaders(res, { nonce });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const content = await getDraftContent();
    const [projects, influencers, influencerCategories] = await Promise.all([getPublishedProjects(), getPublishedInfluencers(), getInfluencerCategories()]);
    if (sub === '/preview/site') {
      const ogMedia = content.seo.ogImageMediaId ? await getMediaView(content.seo.ogImageMediaId) : null;
      const mediaMap = await getContentMediaMap(content);
      return html(res, 200, renderHome({ content, projects, influencers, influencerCategories, ogMedia, mediaMap, site: siteUrl(req), nonce, preview: 'PREVIEW — нийтлээгүй өөрчлөлтүүдийг харуулж байна' }));
    }
    const project = await getProject({ id: sub.split('/').pop(), includeDrafts: true }).catch(() => null);
    if (!project) throw new HttpError(404, 'not_found');
    return html(res, 200, renderProject({ project, content, projects, site: siteUrl(req), nonce, preview: project.status === 'draft' ? 'PREVIEW — DRAFT (олон нийтэд харагдахгүй)' : 'PREVIEW' }));
  }
  if (onAdminHost && sub === '/') { res.statusCode = 302; res.setHeader('Location', '/dashboard'); return res.end(); }
  securityHeaders(res, { admin: true });
  html(res, 200, adminShell({ base }), { 'Cache-Control': 'no-store' });
}

/* ------------------------------ admin API ------------------------------ */

// Each handler receives ctx = { id, q (search params), user }.
const routes = [
  ['GET', /^\/overview$/, (q, s) => A.overview(q, s)],
  ['POST', /^\/auth\/password$/, (q, s, c) => A.changePassword(q, s, c.user)],
  ['POST', /^\/auth\/logout-all$/, (q, s, c) => A.logoutAll(q, s, c.user)],

  ['GET', /^\/projects$/, (q, s) => A.listProjects(q, s)],
  ['POST', /^\/projects$/, (q, s) => A.createProject(q, s)],
  ['POST', /^\/projects\/reorder$/, (q, s) => A.reorderProjects(q, s)],
  ['GET', new RegExp(`^/projects/${UUID}$`), (q, s, c) => A.getProjectAdmin(q, s, c.id)],
  ['PUT', new RegExp(`^/projects/${UUID}$`), (q, s, c) => A.updateProject(q, s, c.id)],
  ['POST', new RegExp(`^/projects/${UUID}/status$`), (q, s, c) => A.setProjectStatus(q, s, c.id)],
  ['DELETE', new RegExp(`^/projects/${UUID}$`), (q, s, c) => A.deleteProject(q, s, c.id)],

  ['GET', /^\/influencers$/, (q, s) => A.listInfluencers(q, s)],
  ['POST', /^\/influencers$/, (q, s) => A.saveInfluencer(q, s, null)],
  ['POST', /^\/influencers\/reorder$/, (q, s) => A.reorderInfluencers(q, s)],
  ['GET', /^\/influencer-categories$/, (q, s) => A.listInfluencerCategories(q, s)],
  ['POST', /^\/influencer-categories$/, (q, s) => A.createInfluencerCategory(q, s)],
  ['POST', /^\/influencer-categories\/reorder$/, (q, s) => A.reorderInfluencerCategories(q, s)],
  ['PUT', new RegExp(`^/influencer-categories/${UUID}$`), (q, s, c) => A.updateInfluencerCategory(q, s, c.id)],
  ['DELETE', new RegExp(`^/influencer-categories/${UUID}$`), (q, s, c) => A.deleteInfluencerCategory(q, s, c.id)],
  ['GET', new RegExp(`^/influencers/${UUID}$`), (q, s, c) => A.getInfluencer(q, s, c.id)],
  ['PUT', new RegExp(`^/influencers/${UUID}$`), (q, s, c) => A.saveInfluencer(q, s, c.id)],
  ['POST', new RegExp(`^/influencers/${UUID}/status$`), (q, s, c) => A.setInfluencerStatus(q, s, c.id)],
  ['DELETE', new RegExp(`^/influencers/${UUID}$`), (q, s, c) => A.deleteInfluencer(q, s, c.id)],

  ['GET', /^\/media$/, (q, s, c) => A.listMedia(q, s, c.q)],
  ['POST', /^\/media\/uploads$/, (q, s) => A.createUpload(q, s)],
  ['POST', new RegExp(`^/media/${UUID}/complete$`), (q, s, c) => A.completeUpload(q, s, c.id)],
  ['POST', new RegExp(`^/media/${UUID}/blob-presign$`), (q, s, c) => A.blobPresignUpload(q, s, c.id)],
  ['PUT', new RegExp(`^/media/${UUID}$`), (q, s, c) => A.updateMedia(q, s, c.id)],
  ['GET', new RegExp(`^/media/${UUID}/usage$`), (q, s, c) => A.getMediaUsage(q, s, c.id)],
  ['DELETE', new RegExp(`^/media/${UUID}$`), (q, s, c) => A.deleteMedia(q, s, c.id)],

  ['GET', /^\/content$/, (q, s) => A.listContent(q, s)],
  ['PUT', /^\/content\/([a-z_]+)$/, (q, s, c) => A.saveContentDraft(q, s, c.id)],
  ['POST', /^\/content\/([a-z_]+)\/publish$/, (q, s, c) => A.publishContent(q, s, c.id)],
  ['POST', /^\/content\/([a-z_]+)\/discard$/, (q, s, c) => A.discardContentDraft(q, s, c.id)],
  ['POST', /^\/content\/([a-z_]+)\/reset$/, (q, s, c) => A.resetContent(q, s, c.id)],

  ['POST', /^\/email\/test$/, (q, s) => A.testEmail(q, s)],
  ['GET', /^\/submissions$/, (q, s, c) => A.listSubmissions(q, s, c.q)],
  ['PUT', new RegExp(`^/submissions/${UUID}$`), (q, s, c) => A.updateSubmission(q, s, c.id)],
  ['DELETE', new RegExp(`^/submissions/${UUID}$`), (q, s, c) => A.deleteSubmission(q, s, c.id)],
];

async function adminApi(req, res, sub, searchParams) {
  if (!dbConfigured()) throw new HttpError(503, 'db_not_configured', 'DATABASE_URL тохируулаагүй байна.');
  try { await ensureMigrated(); } catch (e) { throw new HttpError(503, 'migration_failed', `Мэдээллийн сангийн хүснэгт үүсгэж чадсангүй: ${String(e.message).slice(0, 300)}`); }
  if (sub === '/setup' && req.method === 'GET') return A.setupStatus(req, res);
  if (sub === '/setup' && req.method === 'POST') return A.setupFirstAdmin(req, res);
  if (sub === '/auth/login' && req.method === 'POST') return A.login(req, res);
  if (sub === '/auth/logout' && req.method === 'POST') return A.logout(req, res);
  if (sub === '/auth/me' && req.method === 'GET') return A.me(req, res);
  const user = await requireAdmin(req); // 401 for every other admin endpoint without a valid session
  let pathMatched = false;
  for (const [method, re, fn] of routes) {
    const m = re.exec(sub);
    if (!m) continue;
    pathMatched = true;
    if (method === req.method) return fn(req, res, { id: m[1], q: searchParams, user });
  }
  throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'method_not_allowed' : 'not_found');
}

/* ------------------------------ entry ------------------------------ */

export default async function handler(req, res) {
  // Vercel hands each request a short-lived OIDC token; the Blob SDK reads it from here when the
  // request context isn't available (Blob stores connected without a read-write token)
  const oidc = req.headers['x-vercel-oidc-token'];
  if (typeof oidc === 'string' && oidc) process.env.VERCEL_OIDC_TOKEN = oidc;
  const url = new URL(req.url, 'http://x');
  const path = (url.searchParams.get('__p') || url.pathname).replace(/\/+$/, '') || '/';
  url.searchParams.delete('__p');
  const isApi = path.startsWith('/api/');
  try {
    // a fresh database gets its tables on the first request (no terminal step needed)
    if (dbConfigured()) await ensureMigrated().catch(() => {});
    if (path === '/' && (req.method === 'GET' || req.method === 'HEAD')) return await homePage(req, res);
    if (path.startsWith('/work/')) return await projectPage(req, res, decodeURIComponent(path.slice(6)));
    if (path === '/sitemap.xml') return await sitemap(req, res);
    if (path === '/robots.txt') return robots(req, res);
    if (path === '/admin' || path.startsWith('/admin/')) return await adminPage(req, res, path);

    if (path === '/api/contact' && req.method === 'POST') return await handleContact(req, res);
    if (path === '/api/public/content' && req.method === 'GET') {
      const d = await loadPublic();
      return json(res, 200, { content: d.content, projects: d.projects, influencers: d.influencers }, PUBLIC_CACHE);
    }
    if (path.startsWith('/api/admin/')) return await adminApi(req, res, path.slice('/api/admin'.length), url.searchParams);
    if (path.startsWith('/api/_local-storage/')) return await handleLocalStorage(req, res, decodeURIComponent(path.slice('/api/_local-storage/'.length)), url.searchParams);

    if (isApi) throw new HttpError(404, 'not_found');
    const nonce = crypto.randomBytes(16).toString('base64');
    securityHeaders(res, { nonce });
    return html(res, 404, renderNotFound({ content: DEFAULT_CONTENT, site: siteUrl(req), nonce }));
  } catch (e) {
    if (res.headersSent) { res.end(); return; }
    const status = e instanceof HttpError ? e.status : e.code === 'DB_NOT_CONFIGURED' ? 503 : 500;
    if (status >= 500) console.error('[router]', path, e);
    const body = { ok: false, error: e instanceof HttpError ? e.code : status === 503 ? 'db_not_configured' : 'server_error' };
    if (e instanceof HttpError && e.message && e.message !== e.code) body.message = e.message; // human-readable, no internals
    if (e instanceof HttpError && e.extra) Object.assign(body, e.extra);
    // admin API: show the technical cause (e.g. a database error code) so problems can be diagnosed from the screen
    if (status === 500 && path.startsWith('/api/admin/')) body.detail = `${e.code ? `${e.code}: ` : ''}${String(e.message || e).slice(0, 300)}`;
    if (!isApi && status === 401) { res.statusCode = 302; res.setHeader('Location', path.startsWith('/admin') ? '/admin/login' : '/'); return res.end(); }
    return json(res, status, body);
  }
}

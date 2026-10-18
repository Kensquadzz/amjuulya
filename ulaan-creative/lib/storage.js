// Object storage for images and videos.
//
//  STORAGE_DRIVER=s3     (production) any S3-compatible bucket — Cloudflare R2, AWS S3,
//                         Backblaze B2, Supabase Storage S3 … Files go straight from the
//                         admin's browser to the bucket through short-lived presigned URLs,
//                         so large videos never pass through (or sit in memory of) a function.
//  STORAGE_DRIVER=local  development only: files on local disk. Refused on Vercel, whose
//                         filesystem is ephemeral.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { AwsClient } from 'aws4fetch';
import { HttpError } from './http.js';

const PRESIGN_TTL = 15 * 60; // seconds

export function storageDriver() {
  const d = (process.env.STORAGE_DRIVER || '').toLowerCase();
  if (d === 'local') {
    if (process.env.VERCEL) return null; // never use local disk in serverless production
    return 'local';
  }
  if (d === 's3' || (!d && process.env.S3_BUCKET)) {
    const need = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'MEDIA_PUBLIC_BASE_URL'];
    return need.every((k) => process.env[k]) ? 's3' : null;
  }
  return null;
}

export function assertStorage() {
  if (!storageDriver()) throw new HttpError(503, 'storage_not_configured', 'Media storage is not configured.');
}

const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');

export function publicUrl(key) {
  if (!key) return '';
  if (storageDriver() === 'local') return `/api/_local-storage/${encodeKey(key)}`;
  return `${String(process.env.MEDIA_PUBLIC_BASE_URL || '').replace(/\/$/, '')}/${encodeKey(key)}`;
}

/* ------------------------------- S3 ------------------------------- */
let aws = null;
const s3 = () => (aws ||= new AwsClient({
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  service: 's3',
  region: process.env.S3_REGION || 'auto',
}));

function s3ObjectUrl(key) {
  const endpoint = process.env.S3_ENDPOINT.replace(/\/$/, '');
  if (process.env.S3_FORCE_PATH_STYLE === 'true') return `${endpoint}/${process.env.S3_BUCKET}/${encodeKey(key)}`;
  const u = new URL(endpoint);
  return `${u.protocol}//${process.env.S3_BUCKET}.${u.host}/${encodeKey(key)}`;
}

/* ------------------------------ local ------------------------------ */
const localDir = () => path.resolve(process.env.STORAGE_LOCAL_DIR || '.data/storage');
const localSecret = (() => {
  let s = null;
  return () => (s ||= process.env.LOCAL_STORAGE_SECRET || crypto.randomBytes(32).toString('hex'));
})();
const localSig = (key, exp) => crypto.createHmac('sha256', localSecret()).update(`${key}|${exp}`).digest('base64url');
function localPath(key) {
  const p = path.resolve(localDir(), key);
  if (!p.startsWith(localDir() + path.sep)) throw new HttpError(400, 'bad_key');
  return p;
}

/* ------------------------------ API ------------------------------ */

/** Presigned URL the browser PUTs the file to. */
export async function presignPut(key) {
  const driver = storageDriver();
  if (driver === 'local') {
    const exp = Math.floor(Date.now() / 1000) + PRESIGN_TTL;
    return `/api/_local-storage/${encodeKey(key)}?exp=${exp}&sig=${localSig(key, exp)}`;
  }
  const url = new URL(s3ObjectUrl(key));
  url.searchParams.set('X-Amz-Expires', String(PRESIGN_TTL));
  const signed = await s3().sign(new Request(url, { method: 'PUT' }), { aws: { signQuery: true } });
  return signed.url;
}

/** { size, contentType } or null when the object doesn't exist. */
export async function headObject(key) {
  if (storageDriver() === 'local') {
    try { const st = await fs.promises.stat(localPath(key)); return { size: st.size, contentType: '' }; } catch { return null; }
  }
  const r = await s3().fetch(s3ObjectUrl(key), { method: 'HEAD' });
  if (r.status === 404) return null;
  if (!r.ok) throw new HttpError(502, 'storage_error', `HEAD ${r.status}`);
  return { size: Number(r.headers.get('content-length') || 0), contentType: r.headers.get('content-type') || '' };
}

/** First bytes of an object — used to check the real file type (magic numbers). */
export async function readHead(key, bytes = 4096) {
  return readRange(key, 0, bytes);
}

/** Reads `length` bytes starting at `start` (fewer at the end of the object). */
export async function readRange(key, start, length) {
  if (storageDriver() === 'local') {
    const fh = await fs.promises.open(localPath(key), 'r');
    try { const buf = Buffer.alloc(length); const { bytesRead } = await fh.read(buf, 0, length, start); return buf.subarray(0, bytesRead); } finally { await fh.close(); }
  }
  const r = await s3().fetch(s3ObjectUrl(key), { headers: { Range: `bytes=${start}-${start + length - 1}` } });
  if (r.status === 416) return Buffer.alloc(0);
  if (!r.ok) throw new HttpError(502, 'storage_error', `GET ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function deleteObject(key) {
  if (!key) return;
  if (storageDriver() === 'local') { await fs.promises.rm(localPath(key), { force: true }); return; }
  const r = await s3().fetch(s3ObjectUrl(key), { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new HttpError(502, 'storage_error', `DELETE ${r.status}`);
}

/* ---------------- local driver HTTP endpoints (dev only) ---------------- */
const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };

export async function handleLocalStorage(req, res, key, searchParams) {
  if (storageDriver() !== 'local') throw new HttpError(404, 'not_found');
  const file = localPath(key);
  if (req.method === 'PUT') {
    const exp = Number(searchParams.get('exp'));
    const sig = searchParams.get('sig') || '';
    const good = localSig(key, exp);
    if (!exp || exp < Date.now() / 1000 || sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) {
      throw new HttpError(403, 'bad_signature');
    }
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.part`;
    await pipeline(req, fs.createWriteStream(tmp));
    await fs.promises.rename(tmp, file);
    res.statusCode = 200; res.end(); return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method_not_allowed');
  let st;
  try { st = await fs.promises.stat(file); } catch { throw new HttpError(404, 'not_found'); }
  const type = MIME_BY_EXT[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  let start = 0, end = st.size - 1;
  if (range) {
    if (range[1]) start = Number(range[1]);
    if (range[2]) end = Math.min(Number(range[2]), st.size - 1);
    if (!range[1] && range[2]) { start = st.size - Number(range[2]); end = st.size - 1; }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`);
  } else res.statusCode = 200;
  res.setHeader('Content-Type', type);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', end - start + 1);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (req.method === 'HEAD') { res.end(); return; }
  await pipeline(fs.createReadStream(file, { start, end }), res);
}

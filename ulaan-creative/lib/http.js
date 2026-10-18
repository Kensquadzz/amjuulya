// Small HTTP helpers shared by the router (works on Vercel's Node runtime and the local dev server).
import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const isProd = () => process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}

export function json(res, status, payload, headers = {}) {
  send(res, status, JSON.stringify(payload), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
}

export function html(res, status, markup, headers = {}) {
  send(res, status, markup, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
}

export async function readJson(req, limit = 256 * 1024) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new HttpError(413, 'payload_too_large');
      chunks.push(chunk);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (raw.length > limit) throw new HttpError(413, 'payload_too_large');
  if (!raw) return {};
  const type = String(req.headers['content-type'] || '');
  try {
    if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

export function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

/** Irreversible hash so we can rate-limit / spot abuse without storing raw IP addresses. */
export function hashIp(ip) {
  const salt = process.env.IP_HASH_SALT || 'ulaan-creative';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

export function requestOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] || (isProd() ? 'https' : 'http');
  return `${String(proto).split(',')[0]}://${String(host).split(',')[0]}`;
}

export function siteUrl(req) {
  return (process.env.SITE_URL || requestOrigin(req)).replace(/\/$/, '');
}

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

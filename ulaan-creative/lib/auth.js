// Admin authentication: scrypt password hashes, opaque server-side sessions
// stored in Postgres (only a SHA-256 of the cookie token is stored), and
// cross-site request protection for every state-changing admin call.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { query, one } from './db.js';
import { HttpError, parseCookies, isProd, hashIp, clientIp } from './http.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS) || 12;

export const cookieName = () => (isProd() ? '__Host-uc_admin' : 'uc_admin');

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, saltB64, keyB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(key, expected);
}

export function validatePasswordStrength(pw) {
  if (typeof pw !== 'string' || pw.length < 12) return 'Нууц үг хамгийн багадаа 12 тэмдэгт байх ёстой.';
  if (pw.length > 200) return 'Нууц үг хэт урт байна.';
  if (!/[A-Za-zА-Яа-яӨөҮү]/.test(pw) || !/\d/.test(pw)) return 'Нууц үг үсэг болон тоо агуулсан байх ёстой.';
  return '';
}

const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export async function createSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await query(
    `insert into admin_sessions (id, user_id, expires_at, ip_hash, user_agent)
     values ($1, $2, now() + make_interval(hours => $3), $4, $5)`,
    [tokenHash(token), userId, SESSION_TTL_HOURS, hashIp(clientIp(req)), String(req.headers['user-agent'] || '').slice(0, 300)],
  );
  setSessionCookie(res, token, SESSION_TTL_HOURS * 3600);
}

function setSessionCookie(res, value, maxAge) {
  const parts = [`${cookieName()}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (isProd()) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export async function destroySession(req, res) {
  const token = parseCookies(req)[cookieName()];
  if (token) await query('delete from admin_sessions where id = $1', [tokenHash(token)]);
  setSessionCookie(res, '', 0);
}

/** Returns the admin user for a valid session, or null. Validated against the DB on every request. */
export async function getSessionUser(req) {
  const token = parseCookies(req)[cookieName()];
  if (!token || token.length > 100) return null;
  const row = await one(
    `update admin_sessions s set last_seen_at = now()
       from admin_users u
      where s.id = $1 and s.user_id = u.id and s.expires_at > now()
      returning u.id, u.email, s.id as session_id`,
    [tokenHash(token)],
  );
  if (Math.random() < 0.02) await query('delete from admin_sessions where expires_at < now()');
  return row;
}

/**
 * Cross-site request protection for state-changing admin requests:
 *  - SameSite=Strict session cookie (browser won't send it cross-site)
 *  - Origin / Referer must match this host when present
 *  - custom header required (forces a CORS preflight for any cross-origin script)
 */
export function assertSameOrigin(req) {
  const method = req.method || 'GET';
  if (method === 'GET' || method === 'HEAD') return;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const origin = req.headers.origin || req.headers.referer;
  if (origin) {
    let oh = '';
    try { oh = new URL(origin).host; } catch { /* malformed */ }
    if (oh !== host) throw new HttpError(403, 'bad_origin');
  }
  if (req.headers['x-uc-admin'] !== '1') throw new HttpError(403, 'missing_csrf_header');
}

export async function requireAdmin(req) {
  const user = await getSessionUser(req);
  if (!user) throw new HttpError(401, 'unauthorized');
  assertSameOrigin(req);
  return user;
}

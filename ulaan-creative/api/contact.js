/**
 * POST /api/contact — Vercel serverless function.
 *
 * Sends contact-form submissions to the agency inbox through Resend (https://resend.com).
 * All secrets stay on the server. Required environment variables:
 *   RESEND_API_KEY      Resend API key
 *   CONTACT_TO_EMAIL    Inbox that receives submissions (comma-separate for several)
 *   CONTACT_FROM_EMAIL  Verified sender, e.g. "Ulaan Creative <noreply@your-domain.mn>"
 *
 * If they are missing the endpoint answers 503 { error: "not_configured" } and the
 * site tells the visitor that nothing was sent — it never fakes a success.
 */

const SERVICES = {
  ai: 'AI Creative Production',
  influencer: 'Influencer Marketing',
  video: 'Video & Content Production',
  brand: 'Brand & Digital Marketing',
  starter: 'Package — Creative Starter',
  growth: 'Package — Creative Growth',
  premium: 'Package — Creative Premium',
  other: 'Other',
};
const BUDGETS = {
  'lt-1.5m': 'Up to ₮1.5M',
  '1.5-3m': '₮1.5M – 3M',
  '3-5m': '₮3M – 5M',
  'gt-5m': '₮5M+',
  unknown: 'Not decided yet',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s\-()]{8,20}$/;
const MIN_FILL_MS = 2500; // humans need longer than this to fill the form

// Best-effort per-instance rate limit (serverless instances are short-lived).
const hits = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function validate(body) {
  const data = {
    name: str(body.name, 120),
    company: str(body.company, 160),
    contact: str(body.contact, 160),
    service: str(body.service, 40),
    budget: str(body.budget, 40),
    message: str(body.message, 4000),
  };
  const fields = {};
  if (data.name.length < 2) fields.name = 'required';
  const digits = data.contact.replace(/\D/g, '');
  if (!(EMAIL_RE.test(data.contact) || (PHONE_RE.test(data.contact) && digits.length >= 8))) fields.contact = 'invalid';
  if (!SERVICES[data.service]) fields.service = 'invalid';
  if (data.budget && !BUDGETS[data.budget]) fields.budget = 'invalid';
  if (data.message.length < 10) fields.message = 'too_short';
  return { data, fields };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) break;
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  const type = String(req.headers['content-type'] || '');
  try {
    if (type.includes('application/json')) return JSON.parse(raw || '{}');
    return Object.fromEntries(new URLSearchParams(raw));
  } catch { return {}; }
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  const body = await readBody(req);

  // Honeypot: real visitors never see this field. Quietly drop bot submissions.
  if (str(body.website, 200)) return send(res, 200, { ok: true });

  const ts = Number(body.ts);
  if (Number.isFinite(ts) && ts > 0 && Date.now() - ts < MIN_FILL_MS) {
    return send(res, 429, { ok: false, error: 'too_fast' });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return send(res, 429, { ok: false, error: 'rate_limited' });

  const { data, fields } = validate(body);
  if (Object.keys(fields).length) return send(res, 400, { ok: false, error: 'invalid', fields });

  const { RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL } = process.env;
  if (!RESEND_API_KEY || !CONTACT_TO_EMAIL || !CONTACT_FROM_EMAIL) {
    console.error('[contact] Missing RESEND_API_KEY / CONTACT_TO_EMAIL / CONTACT_FROM_EMAIL — submission NOT delivered.');
    return send(res, 503, { ok: false, error: 'not_configured' });
  }

  recent.push(now);
  hits.set(ip, recent);

  const rows = [
    ['Name', data.name],
    ['Company / brand', data.company || '—'],
    ['Email / phone', data.contact],
    ['Service', SERVICES[data.service]],
    ['Budget', BUDGETS[data.budget] || '—'],
  ];
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nProject:\n${data.message}`;
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#111">
      <h2 style="margin:0 0 16px;color:#E50920">New project request — Ulaan Creative</h2>
      <table cellpadding="6" style="border-collapse:collapse">
        ${rows.map(([k, v]) => `<tr><td style="color:#666">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}
      </table>
      <p style="margin:18px 0 6px;color:#666">Project</p>
      <p style="white-space:pre-wrap;margin:0">${esc(data.message)}</p>
    </div>`;

  const replyTo = EMAIL_RE.test(data.contact) ? data.contact : undefined;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: CONTACT_FROM_EMAIL,
        to: CONTACT_TO_EMAIL.split(',').map((s) => s.trim()).filter(Boolean),
        subject: `New project request — ${data.name}${data.company ? ` (${data.company})` : ''}`,
        text,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!r.ok) {
      console.error('[contact] Resend error', r.status, await r.text().catch(() => ''));
      return send(res, 502, { ok: false, error: 'delivery_failed' });
    }
    return send(res, 200, { ok: true });
  } catch (err) {
    console.error('[contact] Network error', err);
    return send(res, 502, { ok: false, error: 'delivery_failed' });
  }
}

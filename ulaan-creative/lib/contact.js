// POST /api/contact — validates, rate-limits, stores the submission in Postgres and
// (optionally) emails a notification through Resend. It reports success only when the
// submission was actually stored or delivered — never a fake success.
import { query, dbConfigured } from './db.js';
import { hit } from './ratelimit.js';
import { json, readJson, clientIp, hashIp, esc } from './http.js';
import { getPublishedContent, isUuid } from './content.js';
import { serviceOptions } from './render.js';
import { BUDGET_OPTIONS } from './defaults.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s\-()]{8,20}$/;
const MIN_FILL_MS = 2500;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const memHits = new Map(); // fallback limiter when no database is configured

export function validateContact(body, services) {
  const fields = {};
  const data = {
    name: str(body.name, 120),
    company: str(body.company, 160),
    contact: str(body.contact, 160),
    service: str(body.service, 80),
    budget: str(body.budget, 40),
    message: str(body.message, 4000),
    consent: body.consent === true || body.consent === 'yes' || body.consent === 'on',
    kind: body.kind === 'influencer' ? 'influencer' : 'project',
    campaignDates: '',
    notes: str(body.notes, 2000),
  };
  const date = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : '');
  const from = date(body.campaignStart), to = date(body.campaignEnd);
  if ((body.campaignStart && !from) || (body.campaignEnd && !to) || (from && to && to < from)) fields.campaignDates = 'invalid';
  data.campaignDates = from || to ? `${from || '…'} → ${to || '…'}` : '';
  if (data.name.length < 2) fields.name = 'required';
  const digits = data.contact.replace(/\D/g, '');
  if (!(EMAIL_RE.test(data.contact) || (PHONE_RE.test(data.contact) && digits.length >= 8))) fields.contact = 'invalid';
  if (!services.some(([v]) => v === data.service)) fields.service = 'invalid';
  if (data.budget && !BUDGET_OPTIONS.some(([v]) => v === data.budget)) fields.budget = 'invalid';
  if (data.message.length < 10) fields.message = 'too_short';
  if (!data.consent) fields.consent = 'required';
  return { data, fields };
}

export async function handleContact(req, res) {
  const body = await readJson(req, 64 * 1024);
  if (str(body.website, 200)) return json(res, 200, { ok: true }); // honeypot: silently drop bots

  const ts = Number(body.ts);
  if (Number.isFinite(ts) && ts > 0 && Date.now() - ts < MIN_FILL_MS) return json(res, 429, { ok: false, error: 'too_fast' });

  const ipHash = hashIp(clientIp(req));
  if (dbConfigured()) {
    const rl = await hit('contact', ipHash, { limit: 5, windowSec: 600 });
    if (!rl.allowed) return json(res, 429, { ok: false, error: 'rate_limited' });
  } else {
    const now = Date.now();
    const recent = (memHits.get(ipHash) || []).filter((t) => now - t < 600_000);
    if (recent.length >= 5) return json(res, 429, { ok: false, error: 'rate_limited' });
    memHits.set(ipHash, [...recent, now]);
  }

  const content = await getPublishedContent().catch(() => null);
  const services = content ? serviceOptions(content) : [];
  const { data, fields } = validateContact(body, services);
  if (Object.keys(fields).length) return json(res, 400, { ok: false, error: 'invalid', fields });

  const emailReady = Boolean(process.env.RESEND_API_KEY && process.env.CONTACT_TO_EMAIL && process.env.CONTACT_FROM_EMAIL);
  if (!dbConfigured() && !emailReady) {
    console.error('[contact] Neither DATABASE_URL nor Resend is configured — submission NOT stored or delivered.');
    return json(res, 503, { ok: false, error: 'not_configured' });
  }

  // Selected influencers: only ids of currently published profiles are kept (names are
  // looked up server-side, so the client can't inject arbitrary names). No prices involved.
  const pickedIds = [...new Set((Array.isArray(body.influencers) ? body.influencers : []).filter(isUuid))].slice(0, 30);
  data.influencers = [];
  if (pickedIds.length && dbConfigured()) {
    try {
      const { rows } = await query(`select id, display_name from influencers where status = 'published' and id = any($1::uuid[]) order by sort_order`, [pickedIds]);
      data.influencers = rows.map((r) => ({ id: r.id, name: r.display_name }));
    } catch (e) { console.error('[contact] influencer lookup failed:', e.message); }
  }
  // a campaign inquiry must name at least one (published) influencer
  if (data.kind === 'influencer' && dbConfigured() && !data.influencers.length) return json(res, 400, { ok: false, error: 'invalid', fields: { influencers: 'required' } });

  let stored = null;
  if (dbConfigured()) {
    try {
      const { rows } = await query(
        `insert into contact_submissions (name, company, contact, service, budget, message, consent, ip_hash, user_agent, influencers, kind, campaign_dates, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
        [data.name, data.company, data.contact, data.service, data.budget, data.message, data.consent, ipHash, String(req.headers['user-agent'] || '').slice(0, 300), JSON.stringify(data.influencers), data.kind, data.campaignDates, data.notes],
      );
      stored = rows[0].id;
    } catch (e) {
      console.error('[contact] DB insert failed:', e.message);
    }
  }

  let emailed = false;
  if (emailReady) {
    emailed = await sendEmail(data, services).catch((e) => { console.error('[contact] email failed:', e.message); return false; });
    if (emailed && stored) await query('update contact_submissions set email_sent = true where id = $1', [stored]).catch(() => {});
  }

  if (!stored && !emailed) return json(res, 502, { ok: false, error: 'delivery_failed' });
  return json(res, 200, { ok: true });
}

async function sendEmail(data, services) {
  const serviceLabel = (services.find(([v]) => v === data.service) || [, data.service])[1];
  const budget = (BUDGET_OPTIONS.find(([v]) => v === data.budget) || [, '—'])[1];
  const rows = [['Name', data.name], ['Company / brand', data.company || '—'], ['Email / phone', data.contact], ['Service', serviceLabel], ['Budget', budget]];
  if (data.influencers?.length) rows.push(['Influencers', data.influencers.map((i) => i.name).join(', ')]);
  if (data.campaignDates) rows.push(['Campaign dates', data.campaignDates]);
  if (data.notes) rows.push(['Notes', data.notes]);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM_EMAIL,
      to: process.env.CONTACT_TO_EMAIL.split(',').map((s) => s.trim()).filter(Boolean),
      subject: `New ${data.kind === 'influencer' ? 'influencer campaign' : 'project'} request — ${data.name}${data.company ? ` (${data.company})` : ''}`,
      text: rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nProject:\n${data.message}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111"><h2 style="color:#E50920">New project request — Ulaan Creative</h2><table cellpadding="6">${rows.map(([k, v]) => `<tr><td style="color:#666">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}</table><p style="white-space:pre-wrap">${esc(data.message)}</p></div>`,
      ...(EMAIL_RE.test(data.contact) ? { reply_to: data.contact } : {}),
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}`);
  return true;
}

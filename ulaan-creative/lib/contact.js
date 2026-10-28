// POST /api/contact — validates, rate-limits, stores the submission in Postgres and
// (optionally) emails a notification through Resend. It reports success only when the
// submission was actually stored or delivered — never a fake success.
import { query, dbConfigured } from './db.js';
import { hit } from './ratelimit.js';
import { json, readJson, clientIp, hashIp, esc } from './http.js';
import { getPublishedContent, isUuid } from './content.js';
import { serviceOptions } from './render.js';
import { BUDGET_OPTIONS, DEFAULT_CONTENT } from './defaults.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_FILL_MS = 2500;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const memHits = new Map(); // fallback limiter when no database is configured

/**
 * E-mail notification settings (Resend). Only RESEND_API_KEY and CONTACT_TO_EMAIL are required:
 * without a verified domain, Resend's shared sender onboarding@resend.dev can deliver to the
 * e-mail address the Resend account was created with.
 */
export function emailConfig() {
  const to = String(process.env.CONTACT_TO_EMAIL || '').split(',').map((s) => s.trim()).filter((s) => EMAIL_RE.test(s));
  return {
    key: process.env.RESEND_API_KEY || '',
    to,
    from: process.env.CONTACT_FROM_EMAIL || 'Ulaan Creative <onboarding@resend.dev>',
    api: (process.env.RESEND_API_BASE || 'https://api.resend.com').replace(/\/$/, ''),
    ready: Boolean(process.env.RESEND_API_KEY && to.length),
  };
}

export function validateContact(body, services) {
  const fields = {};
  const data = {
    name: str(body.name, 120),
    company: str(body.company, 160),
    contact: str(body.contact, 160),
    phone: str(body.phone, 40), // optional and not verified — only kept so the team can call back
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
  if (!EMAIL_RE.test(data.contact)) fields.contact = 'invalid'; // e-mail only: the auto-reply goes there
  if (!services.some(([v]) => v === data.service)) fields.service = 'invalid';
  if (data.budget && !BUDGET_OPTIONS.some(([v]) => v === data.budget)) fields.budget = 'invalid';
  if (data.message.length < 10) fields.message = 'too_short';
  if (!data.consent) fields.consent = 'required';
  return { data, fields };
}

const MAX_PICKED = 10; // creators per campaign request (the site enforces the same limit)

export async function handleContact(req, res) {
  const body = await readJson(req, 64 * 1024);
  if (str(body.website, 200)) return json(res, 200, { ok: true }); // honeypot: silently drop bots

  const ts = Number(body.ts);
  if (Number.isFinite(ts) && ts > 0 && Date.now() - ts < MIN_FILL_MS) return json(res, 429, { ok: false, error: 'too_fast' });

  const ipHash = hashIp(clientIp(req));
  // without the database the default services still validate, so the email can go out
  const content = await getPublishedContent().catch(() => structuredClone(DEFAULT_CONTENT));
  const services = serviceOptions(content);
  const { data, fields } = validateContact(body, services);
  if (Object.keys(fields).length) return json(res, 400, { ok: false, error: 'invalid', fields });

  // Counted only for valid submissions; mobile carriers share IPs (CGNAT), so the limit is generous
  const LIMIT = 20;
  if (dbConfigured()) {
    const rl = await hit('contact', ipHash, { limit: LIMIT, windowSec: 600 });
    if (!rl.allowed) return json(res, 429, { ok: false, error: 'rate_limited' });
  } else {
    const now = Date.now();
    const recent = (memHits.get(ipHash) || []).filter((t) => now - t < 600_000);
    if (recent.length >= LIMIT) return json(res, 429, { ok: false, error: 'rate_limited' });
    memHits.set(ipHash, [...recent, now]);
  }

  const emailReady = emailConfig().ready;
  if (!dbConfigured() && !emailReady) {
    console.error('[contact] Neither DATABASE_URL nor Resend is configured — submission NOT stored or delivered.');
    return json(res, 503, { ok: false, error: 'not_configured' });
  }

  // Selected influencers: only ids of currently published profiles are kept (names are
  // looked up server-side, so the client can't inject arbitrary names). No prices involved.
  const pickedIds = [...new Set((Array.isArray(body.influencers) ? body.influencers : []).filter(isUuid))];
  if (pickedIds.length > MAX_PICKED) return json(res, 400, { ok: false, error: 'invalid', fields: { influencers: 'too_many' } });
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
        `insert into contact_submissions (name, company, contact, service, budget, message, consent, ip_hash, user_agent, influencers, kind, campaign_dates, notes, phone)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
        [data.name, data.company, data.contact, data.service, data.budget, data.message, data.consent, ipHash, String(req.headers['user-agent'] || '').slice(0, 300), JSON.stringify(data.influencers), data.kind, data.campaignDates, data.notes, data.phone],
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

  // Auto-reply to the sender; a failure here never turns a stored submission into an error
  if (emailReady && (stored || emailed) && EMAIL_RE.test(data.contact)) {
    await sendAutoReply(data.contact, content.contact || {}).catch((e) => console.error('[contact] auto-reply failed:', e.message));
  }

  if (!stored && !emailed) return json(res, 502, { ok: false, error: 'delivery_failed' });
  return json(res, 200, { ok: true });
}

async function sendEmail(data, services) {
  const serviceLabel = (services.find(([v]) => v === data.service) || [, data.service])[1];
  const budget = (BUDGET_OPTIONS.find(([v]) => v === data.budget) || [, '—'])[1];
  const isInf = data.kind === 'influencer';
  const rows = [['Нэр', data.name], ['Компани / брэнд', data.company || '—'], ['Имэйл', data.contact]];
  if (data.phone) rows.push(['Утас', data.phone]);
  if (isInf) rows.push(['Сонгосон influencer', (data.influencers || []).map((i) => i.name).join(', ') || '—'], ['Кампанит ажлын огноо', data.campaignDates || '—']);
  else rows.push(['Үйлчилгээ', serviceLabel], ['Төсөв', budget]);
  if (data.notes) rows.push(['Нэмэлт тэмдэглэл', data.notes]);
  const title = isInf ? 'Influencer кампанит ажлын хүсэлт' : 'Шинэ хүсэлт';
  const bodyLabel = isInf ? 'Кампанит ажлын зорилго, тайлбар' : 'Төслийн мэдээлэл';
  const admin = process.env.SITE_URL ? `${process.env.SITE_URL.replace(/\/$/, '')}/admin/submissions` : '';
  const cfg = emailConfig();
  const r = await fetch(`${cfg.api}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: cfg.from,
      to: cfg.to,
      subject: `${title} — ${data.name}${data.company ? ` (${data.company})` : ''}`,
      text: `${title} — Ulaan Creative\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${bodyLabel}:\n${data.message}${admin ? `\n\nБүх хүсэлт: ${admin}` : ''}${EMAIL_RE.test(data.contact) ? '\n\n«Reply» дарж шууд хариулж болно.' : ''}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:640px">
<h2 style="color:#E50920;margin:0 0 16px">${esc(title)} — Ulaan Creative</h2>
<table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#666;vertical-align:top;white-space:nowrap">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}</table>
<p style="margin:18px 0 6px;color:#666">${esc(bodyLabel)}:</p><p style="white-space:pre-wrap;margin:0;padding:12px 14px;background:#F5F3EF">${esc(data.message)}</p>
${admin ? `<p style="margin-top:18px"><a href="${esc(admin)}" style="color:#E50920">Admin → Ирсэн хүсэлтүүд</a></p>` : ''}
${EMAIL_RE.test(data.contact) ? '<p style="color:#666;font-size:13px">«Reply» дарж хүсэлт илгээгчид шууд хариулж болно.</p>' : ''}</div>`,
      ...(EMAIL_RE.test(data.contact) ? { reply_to: data.contact } : {}),
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`);
  return true;
}

async function sendAutoReply(to, c) {
  const text = String(c.autoReplyBody ?? DEFAULT_CONTENT.contact.autoReplyBody).trim();
  if (!text) return false;
  const subject = String(c.autoReplySubject || DEFAULT_CONTENT.contact.autoReplySubject).trim();
  const cfg = emailConfig();
  const linkify = (t) => esc(t).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#E50920">${u}</a>`);
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:640px">${text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${linkify(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>`;
  const r = await fetch(`${cfg.api}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg.from, to: [to], subject, text, html, reply_to: cfg.to }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`);
  return true;
}

/** Admin "send test e-mail": reports Resend's real answer. */
export async function sendTestEmail(adminEmail) {
  const cfg = emailConfig();
  if (!cfg.ready) return { ok: false, error: 'not_configured' };
  try {
    await sendEmail({ name: 'Туршилтын имэйл', company: '', contact: adminEmail || '', service: 'other', budget: '', message: 'Ulaan Creative вэб сайтын холбоо барих формын имэйл мэдэгдэл зөв тохируулагдсан байна.', influencers: [], campaignDates: '', notes: '', kind: 'project' }, [['other', 'Бусад']]);
    return { ok: true, to: cfg.to };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

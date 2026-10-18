// Admin API handlers. Every handler except login runs behind requireAdmin()
// (session validated against the DB + same-origin/CSRF checks) in the router.
import crypto from 'node:crypto';
import { query, one, tx } from './db.js';
import { HttpError, json, readJson, clientIp, hashIp } from './http.js';
import { createSession, destroySession, verifyPassword, hashPassword, validatePasswordStrength, getSessionUser, assertSameOrigin } from './auth.js';
import { hit, count, clear } from './ratelimit.js';
import { assertStorage, presignPut, headObject, readHead, deleteObject, storageDriver } from './storage.js';
import { checkDeclared, sniff, sniffMatches, LIMITS, TYPES } from './media-rules.js';
import { sanitizeContent, getContentForAdmin, mediaView, influencerView, attachCategories, getProject, isUuid } from './content.js';
import { CONTENT_KEYS, DEFAULT_CONTENT } from './defaults.js';
import { embedFor } from './render.js';

/* ------------------------------ validation ------------------------------ */

const str = (v, max, field, { required = false } = {}) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  if (required && !s) throw new HttpError(400, 'invalid', `${field} шаардлагатай.`, { field });
  if (s.length > max) throw new HttpError(400, 'invalid', `${field} хэт урт байна (≤ ${max}).`, { field });
  return s;
};
const url = (v, field, hosts) => {
  const s = str(v, 500, field);
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch { throw new HttpError(400, 'invalid', `${field}: зөв URL оруулна уу.`, { field }); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new HttpError(400, 'invalid', `${field}: http(s) холбоос байх ёстой.`, { field });
  if (hosts && !hosts.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))) throw new HttpError(400, 'invalid', `${field}: ${hosts.join(' / ')} холбоос байх ёстой.`, { field });
  return u.toString();
};
const status = (v) => (v === 'published' ? 'published' : 'draft');
const uuidOrNull = (v, field) => {
  if (v == null || v === '') return null;
  if (!isUuid(v)) throw new HttpError(400, 'invalid', `${field}: буруу ID`, { field });
  return v;
};

const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', ө: 'u', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export function slugify(s) {
  return String(s).toLowerCase().split('').map((c) => TRANSLIT[c] ?? c).join('')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'project';
}
async function uniqueSlug(base, excludeId = null) {
  let slug = base, i = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await one('select 1 from projects where slug = $1 and ($2::uuid is null or id <> $2)', [slug, excludeId])) slug = `${base}-${i++}`;
  return slug;
}

async function assertMedia(id, kind, field) {
  if (!id) return;
  const m = await one(`select kind from media where id = $1 and status = 'ready'`, [id]);
  if (!m) throw new HttpError(400, 'invalid', `${field}: медиа олдсонгүй.`, { field });
  if (kind && m.kind !== kind) throw new HttpError(400, 'invalid', `${field}: ${kind === 'image' ? 'зураг' : 'видео'} сонгоно уу.`, { field });
}

/* -------------------------------- auth -------------------------------- */

const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

export async function login(req, res) {
  assertSameOrigin(req);
  const body = await readJson(req, 8 * 1024);
  const email = str(body.email, 200, 'Имэйл').toLowerCase();
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  const ipKey = hashIp(clientIp(req));
  // Max 10 failed attempts per IP and 5 per account in 15 minutes.
  if ((await count('login-fail-ip', ipKey, 900)) >= 10 || (await count('login-fail-user', email, 900)) >= 5) {
    throw new HttpError(429, 'too_many_attempts', 'Хэт олон удаа буруу оролдлоо. 15 минутын дараа дахин оролдоно уу.');
  }
  const user = email ? await one('select id, email, password_hash from admin_users where email = $1', [email]) : null;
  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH).catch(() => false);
  if (!user || !ok) {
    await hit('login-fail-ip', ipKey, { limit: 1e9, windowSec: 900 });
    if (email) await hit('login-fail-user', email, { limit: 1e9, windowSec: 900 });
    throw new HttpError(401, 'invalid_credentials', 'Имэйл эсвэл нууц үг буруу байна.');
  }
  await clear('login-fail-user', email);
  await query('update admin_users set last_login_at = now() where id = $1', [user.id]);
  await createSession(res, req, user.id);
  json(res, 200, { ok: true, user: { email: user.email } });
}

export async function logout(req, res) {
  assertSameOrigin(req);
  await destroySession(req, res);
  json(res, 200, { ok: true });
}

export async function me(req, res) {
  const user = await getSessionUser(req);
  if (!user) return json(res, 200, { user: null });
  json(res, 200, { user: { email: user.email }, storage: storageDriver() || null, limits: { imageMB: LIMITS.image / 1048576, videoMB: LIMITS.video / 1048576 }, accept: Object.keys(TYPES) });
}

export async function changePassword(req, res, user) {
  const body = await readJson(req, 8 * 1024);
  const row = await one('select password_hash from admin_users where id = $1', [user.id]);
  if (!(await verifyPassword(String(body.current || ''), row.password_hash).catch(() => false))) throw new HttpError(400, 'invalid', 'Одоогийн нууц үг буруу байна.', { field: 'current' });
  const problem = validatePasswordStrength(body.next);
  if (problem) throw new HttpError(400, 'invalid', problem, { field: 'next' });
  await query('update admin_users set password_hash = $1, updated_at = now() where id = $2', [await hashPassword(body.next), user.id]);
  await query('delete from admin_sessions where user_id = $1 and id <> $2', [user.id, user.session_id]);
  json(res, 200, { ok: true });
}

export async function logoutAll(req, res, user) {
  await query('delete from admin_sessions where user_id = $1', [user.id]);
  await destroySession(req, res);
  json(res, 200, { ok: true });
}

/* ------------------------------ overview ------------------------------ */

export async function overview(req, res) {
  const c = await one(`select
      (select count(*) from projects)::int as projects,
      (select count(*) from projects where status = 'published')::int as published,
      (select count(*) from projects where status = 'draft')::int as drafts,
      (select count(*) from media where status = 'ready')::int as media,
      (select coalesce(sum(size_bytes), 0) from media where status = 'ready')::bigint as media_bytes,
      (select count(*) from influencers)::int as influencers,
      (select count(*) from influencers where status = 'published')::int as influencers_published,
      (select count(*) from contact_submissions where status = 'new')::int as new_submissions`);
  const { rows: recent } = await query(`
    (select 'project' as type, id::text, title as label, status, updated_at from projects)
    union all (select 'influencer', id::text, display_name, status, updated_at from influencers)
    union all (select 'content', key, key, case when draft is not null then 'draft' else 'published' end, updated_at from site_content)
    union all (select 'media', id::text, original_name, kind, updated_at from media where status = 'ready')
    order by updated_at desc limit 8`);
  json(res, 200, { counts: { ...c, media_bytes: Number(c.media_bytes) }, recent });
}

/* ------------------------------ portfolio ------------------------------ */

function projectInput(b) {
  return {
    title: str(b.title, 200, 'Гарчиг', { required: true }),
    description: str(b.description, 10000, 'Тайлбар'),
    category: str(b.category, 100, 'Ангилал'),
    client_name: str(b.client, 200, 'Харилцагч'),
    project_date: (() => { const d = str(b.date, 10, 'Огноо'); if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new HttpError(400, 'invalid', 'Огноо YYYY-MM-DD хэлбэртэй байна.', { field: 'date' }); return d || null; })(),
    cover_media_id: uuidOrNull(b.coverId, 'Нүүр зураг'),
    video_media_id: uuidOrNull(b.videoId, 'Видео'),
    video_url: (() => { const u = url(b.videoUrl, 'Видео холбоос'); if (u && !embedFor(u)) throw new HttpError(400, 'invalid', 'Видео холбоос YouTube эсвэл Vimeo байх ёстой.', { field: 'videoUrl' }); return u; })(),
    external_url: url(b.externalUrl, 'Гадаад холбоос'),
    seo_title: str(b.seoTitle, 120, 'SEO гарчиг'),
    seo_description: str(b.seoDescription, 300, 'SEO тайлбар'),
    status: status(b.status),
  };
}

export async function listProjects(req, res) {
  const { rows } = await query(`select p.*, (select count(*) from project_media pm where pm.project_id = p.id)::int as gallery_count from projects p order by sort_order, created_at desc`);
  const ids = rows.flatMap((p) => [p.cover_media_id, p.video_media_id]).filter(Boolean);
  const { rows: m } = ids.length ? await query('select * from media where id = any($1::uuid[])', [ids]) : { rows: [] };
  const media = Object.fromEntries(m.map((x) => [x.id, mediaView(x)]));
  json(res, 200, { items: rows.map((p) => ({ id: p.id, slug: p.slug, title: p.title, category: p.category, status: p.status, sortOrder: p.sort_order, cover: media[p.cover_media_id] || null, hasVideo: Boolean(p.video_media_id || p.video_url), galleryCount: p.gallery_count, updatedAt: p.updated_at })) });
}

export async function getProjectAdmin(req, res, id) {
  const p = await getProject({ id, includeDrafts: true });
  if (!p) throw new HttpError(404, 'not_found');
  json(res, 200, { item: p });
}

async function saveGallery(client, projectId, gallery) {
  const ids = [...new Set((Array.isArray(gallery) ? gallery : []).filter(isUuid))].slice(0, 60);
  if (ids.length) {
    const { rows } = await client.query(`select id from media where id = any($1::uuid[]) and status = 'ready'`, [ids]);
    if (rows.length !== ids.length) throw new HttpError(400, 'invalid', 'Галерейд байхгүй медиа байна.', { field: 'gallery' });
  }
  await client.query('delete from project_media where project_id = $1', [projectId]);
  for (const [i, mid] of ids.entries()) await client.query('insert into project_media (project_id, media_id, sort_order) values ($1, $2, $3)', [projectId, mid, i]);
}

export async function createProject(req, res) {
  const b = await readJson(req);
  const d = projectInput(b);
  await assertMedia(d.cover_media_id, 'image', 'Нүүр зураг');
  await assertMedia(d.video_media_id, 'video', 'Видео');
  const slug = await uniqueSlug(b.slug ? slugify(b.slug) : slugify(d.title));
  const id = await tx(async (c) => {
    const { rows } = await c.query(
      `insert into projects (slug, title, description, category, client_name, project_date, cover_media_id, video_media_id, video_url, external_url, seo_title, seo_description, status, sort_order, published_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, (select coalesce(max(sort_order), 0) + 1 from projects), case when $13 = 'published' then now() end) returning id`,
      [slug, d.title, d.description, d.category, d.client_name, d.project_date, d.cover_media_id, d.video_media_id, d.video_url, d.external_url, d.seo_title, d.seo_description, d.status],
    );
    await saveGallery(c, rows[0].id, b.gallery);
    return rows[0].id;
  });
  json(res, 201, { item: await getProject({ id, includeDrafts: true }) });
}

export async function updateProject(req, res, id) {
  const b = await readJson(req);
  const d = projectInput(b);
  await assertMedia(d.cover_media_id, 'image', 'Нүүр зураг');
  await assertMedia(d.video_media_id, 'video', 'Видео');
  const existing = await one('select slug from projects where id = $1', [id]);
  if (!existing) throw new HttpError(404, 'not_found');
  const slug = b.slug && slugify(b.slug) !== existing.slug ? await uniqueSlug(slugify(b.slug), id) : existing.slug;
  await tx(async (c) => {
    await c.query(
      `update projects set slug=$2, title=$3, description=$4, category=$5, client_name=$6, project_date=$7, cover_media_id=$8, video_media_id=$9,
         video_url=$10, external_url=$11, seo_title=$12, seo_description=$13, status=$14, updated_at=now(),
         published_at = case when $14 = 'published' then coalesce(published_at, now()) else null end
       where id = $1`,
      [id, slug, d.title, d.description, d.category, d.client_name, d.project_date, d.cover_media_id, d.video_media_id, d.video_url, d.external_url, d.seo_title, d.seo_description, d.status],
    );
    if (Array.isArray(b.gallery)) await saveGallery(c, id, b.gallery);
  });
  json(res, 200, { item: await getProject({ id, includeDrafts: true }) });
}

export async function setProjectStatus(req, res, id) {
  const b = await readJson(req);
  const s = status(b.status);
  const r = await one(`update projects set status=$2, updated_at=now(), published_at = case when $2='published' then coalesce(published_at, now()) else null end where id=$1 returning id`, [id, s]);
  if (!r) throw new HttpError(404, 'not_found');
  json(res, 200, { ok: true, status: s });
}

/** Deletes the project and its gallery links only — media files stay in the library. */
export async function deleteProject(req, res, id) {
  const r = await one('delete from projects where id = $1 returning id', [id]);
  if (!r) throw new HttpError(404, 'not_found');
  json(res, 200, { ok: true });
}

async function reorder(table, req, res) {
  const b = await readJson(req);
  const ids = (Array.isArray(b.ids) ? b.ids : []).filter(isUuid);
  await tx(async (c) => { for (const [i, id] of ids.entries()) await c.query(`update ${table} set sort_order = $2 where id = $1`, [id, i + 1]); });
  json(res, 200, { ok: true });
}
export const reorderProjects = (req, res) => reorder('projects', req, res);
export const reorderInfluencers = (req, res) => reorder('influencers', req, res);
export const reorderInfluencerCategories = (req, res) => reorder('influencer_categories', req, res);

/* ------------------------- influencer categories ------------------------- */

export async function listInfluencerCategories(req, res) {
  const { rows } = await query(
    `select c.id, c.name, c.sort_order, count(l.influencer_id)::int as influencers
       from influencer_categories c left join influencer_category_links l on l.category_id = c.id
      group by c.id order by c.sort_order, c.name`);
  json(res, 200, { items: rows });
}

async function categoryName(req) {
  const name = str((await readJson(req)).name, 60, 'Ангиллын нэр', { required: true });
  return name;
}

export async function createInfluencerCategory(req, res) {
  const name = await categoryName(req);
  const r = await one(
    `insert into influencer_categories (name, sort_order) values ($1, (select coalesce(max(sort_order), 0) + 1 from influencer_categories))
     on conflict do nothing returning id, name`, [name]);
  if (!r) throw new HttpError(409, 'exists', 'Ийм нэртэй ангилал аль хэдийн байна.', { field: 'name' });
  json(res, 200, { item: r });
}

export async function updateInfluencerCategory(req, res, id) {
  const name = await categoryName(req);
  let r;
  try { r = await one('update influencer_categories set name = $2, updated_at = now() where id = $1 returning id, name', [id, name]); }
  catch (e) { if (e.code === '23505') throw new HttpError(409, 'exists', 'Ийм нэртэй ангилал аль хэдийн байна.', { field: 'name' }); throw e; }
  if (!r) throw new HttpError(404, 'not_found');
  json(res, 200, { item: r });
}

/** Removes the category and its links only; influencer profiles are untouched. */
export async function deleteInfluencerCategory(req, res, id) {
  const r = await one('delete from influencer_categories where id = $1 returning id', [id]);
  if (!r) throw new HttpError(404, 'not_found');
  json(res, 200, { ok: true });
}

/* ----------------------------- influencers ----------------------------- */

function influencerInput(b) {
  const followers = b.followers === '' || b.followers == null ? null : Number(String(b.followers).replace(/[\s,]/g, ''));
  if (followers !== null && (!Number.isInteger(followers) || followers < 0 || followers > 1e10)) throw new HttpError(400, 'invalid', 'Дагагчдын тоо бүхэл тоо байх ёстой.', { field: 'followers' });
  return {
    display_name: str(b.name, 120, 'Нэр', { required: true }),
    profile_media_id: uuidOrNull(b.photoId, 'Профайл зураг'),
    instagram_url: url(b.instagram, 'Instagram', ['instagram.com']),
    tiktok_url: url(b.tiktok, 'TikTok', ['tiktok.com']),
    youtube_url: url(b.youtube, 'YouTube', ['youtube.com', 'youtu.be']),
    facebook_url: url(b.facebook, 'Facebook', ['facebook.com', 'fb.com']),
    follower_count: followers,
    category: str(b.category, 100, 'Ангилал'),
    bio: str(b.bio, 600, 'Намтар'),
    engagement: str(b.engagement, 100, 'Engagement'),
    engagement_verified: b.engagementVerified === true,
    featured: b.featured === true,
    price: str(b.price, 200, 'Үнэ'),
    status: status(b.status),
  };
}

export async function listInfluencers(req, res) {
  const { rows } = await query('select * from influencers order by sort_order, created_at');
  const ids = rows.map((r) => r.profile_media_id).filter(Boolean);
  const { rows: m } = ids.length ? await query('select * from media where id = any($1::uuid[])', [ids]) : { rows: [] };
  const media = Object.fromEntries(m.map((x) => [x.id, mediaView(x)]));
  await attachCategories(rows);
  json(res, 200, { items: rows.map((r) => influencerView(r, media, { admin: true })) });
}

export async function getInfluencer(req, res, id) {
  const r = await one('select * from influencers where id = $1', [id]);
  if (!r) throw new HttpError(404, 'not_found');
  const m = r.profile_media_id ? await one('select * from media where id = $1', [r.profile_media_id]) : null;
  await attachCategories([r]);
  json(res, 200, { item: influencerView(r, m ? { [m.id]: mediaView(m) } : {}, { admin: true }) });
}

export async function saveInfluencer(req, res, id = null) {
  const body = await readJson(req);
  const d = influencerInput(body);
  const categoryIds = [...new Set((Array.isArray(body.categoryIds) ? body.categoryIds : []).filter(isUuid))].slice(0, 30);
  await assertMedia(d.profile_media_id, 'image', 'Профайл зураг');
  const cols = Object.keys(d);
  let row;
  if (id) {
    row = await one(
      `update influencers set ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now(),
         published_at = case when $${cols.indexOf('status') + 2} = 'published' then coalesce(published_at, now()) else null end
       where id = $1 returning id`, [id, ...cols.map((k) => d[k])]);
    if (!row) throw new HttpError(404, 'not_found');
  } else {
    row = await one(
      `insert into influencers (${cols.join(', ')}, sort_order, published_at) values (${cols.map((_, i) => `$${i + 1}`).join(', ')},
         (select coalesce(max(sort_order), 0) + 1 from influencers), case when $${cols.indexOf('status') + 1} = 'published' then now() end) returning id`,
      cols.map((k) => d[k]));
  }
  await tx(async (c) => {
    await c.query('delete from influencer_category_links where influencer_id = $1', [row.id]);
    if (categoryIds.length) {
      await c.query(`insert into influencer_category_links (influencer_id, category_id)
        select $1, id from influencer_categories where id = any($2::uuid[]) on conflict do nothing`, [row.id, categoryIds]);
    }
  });
  return getInfluencer(req, res, row.id);
}

export async function setInfluencerStatus(req, res, id) {
  const s = status((await readJson(req)).status);
  const r = await one(`update influencers set status=$2, updated_at=now(), published_at = case when $2='published' then coalesce(published_at, now()) else null end where id=$1 returning id`, [id, s]);
  if (!r) throw new HttpError(404, 'not_found');
  json(res, 200, { ok: true, status: s });
}

export async function deleteInfluencer(req, res, id) {
  const r = await one('delete from influencers where id = $1 returning id', [id]);
  if (!r) throw new HttpError(404, 'not_found');
  json(res, 200, { ok: true });
}

/* -------------------------------- media -------------------------------- */

const keyFor = (id, ext, suffix = '') => {
  const d = new Date();
  return `media/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${id}${suffix}.${ext}`;
};

export async function listMedia(req, res, searchParams) {
  // Clean up abandoned uploads (pending > 24 h).
  const { rows: stale } = await query(`delete from media where status <> 'ready' and created_at < now() - interval '1 day' returning storage_key, thumb_key`);
  for (const s of stale) { await deleteObject(s.storage_key).catch(() => {}); await deleteObject(s.thumb_key).catch(() => {}); }

  const kind = ['image', 'video'].includes(searchParams.get('type')) ? searchParams.get('type') : null;
  const q = (searchParams.get('q') || '').slice(0, 100);
  const limit = Math.min(Number(searchParams.get('limit')) || 60, 200);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);
  const { rows } = await query(
    `select *, count(*) over()::int as total from media where status = 'ready'
       and ($1::text is null or kind = $1) and ($2 = '' or original_name ilike '%' || $2 || '%' or alt_text ilike '%' || $2 || '%')
     order by created_at desc limit $3 offset $4`,
    [kind, q, limit, offset]);
  json(res, 200, { items: rows.map(mediaView), total: rows[0]?.total || 0 });
}

export async function createUpload(req, res) {
  assertStorage();
  const b = await readJson(req, 16 * 1024);
  const declared = checkDeclared({ name: b.name, size: b.size, type: b.type });
  if (declared.error) throw new HttpError(400, 'invalid_file', declared.error);
  const sha = typeof b.sha256 === 'string' && /^[0-9a-f]{64}$/.test(b.sha256) ? b.sha256 : null;
  const replaceId = uuidOrNull(b.replaceId, 'replaceId');
  if (replaceId) {
    const target = await one(`select kind from media where id = $1 and status = 'ready'`, [replaceId]);
    if (!target) throw new HttpError(404, 'not_found');
    if (target.kind !== declared.kind) throw new HttpError(400, 'invalid_file', `Зөвхөн ${target.kind === 'image' ? 'зураг' : 'видео'}-оор солих боломжтой.`);
  } else if (sha) {
    const dup = await one(`select * from media where sha256 = $1 and status = 'ready' limit 1`, [sha]);
    if (dup) return json(res, 200, { existing: mediaView(dup) });
  }
  const id = crypto.randomUUID();
  const key = keyFor(id, declared.ext);
  const thumbKey = b.hasThumb ? keyFor(id, 'webp', '-thumb') : null;
  const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < max ? n : null; };
  await query(
    `insert into media (id, kind, status, storage_key, thumb_key, original_name, mime, size_bytes, width, height, duration_s, sha256)
     values ($1,$2,'pending',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, declared.kind, key, thumbKey, str(b.name, 200, 'name').replace(/[\\/]/g, '_'), declared.mime, Number(b.size), num(b.width, 20000), num(b.height, 20000), num(b.duration, 86400), sha]);
  json(res, 201, { id, uploadUrl: await presignPut(key), thumbUploadUrl: thumbKey ? await presignPut(thumbKey) : null, kind: declared.kind });
}

export async function completeUpload(req, res, id) {
  assertStorage();
  const b = await readJson(req, 8 * 1024);
  const m = await one(`select * from media where id = $1 and status = 'pending'`, [id]);
  if (!m) throw new HttpError(404, 'not_found');
  const fail = async (msg) => {
    await deleteObject(m.storage_key).catch(() => {});
    await deleteObject(m.thumb_key).catch(() => {});
    await query(`delete from media where id = $1`, [id]);
    throw new HttpError(400, 'invalid_file', msg);
  };
  const obj = await headObject(m.storage_key);
  if (!obj) return fail('Файл storage-д олдсонгүй — байршуулалт амжилтгүй болсон байна.');
  if (obj.size > LIMITS[m.kind]) return fail(`Файл хэт том байна (дээд хэмжээ ${Math.round(LIMITS[m.kind] / 1048576)} MB).`);
  if (!sniffMatches(sniff(await readHead(m.storage_key)), { kind: m.kind, mime: m.mime })) return fail('Файлын агуулга өргөтгөлтэйгээ таарахгүй байна (зөвшөөрөгдөөгүй эсвэл гэмтсэн файл).');

  let thumbKey = m.thumb_key;
  if (thumbKey) {
    const t = await headObject(thumbKey);
    const ok = t && t.size <= LIMITS.thumb && ['image/webp', 'image/jpeg', 'image/png'].includes(sniff(await readHead(thumbKey)));
    if (!ok) { await deleteObject(thumbKey).catch(() => {}); thumbKey = null; }
  }

  const replaceId = uuidOrNull(b.replaceId, 'replaceId');
  if (replaceId) {
    const old = await one(`select * from media where id = $1 and status = 'ready'`, [replaceId]);
    if (!old || old.kind !== m.kind) return fail('Солих медиа олдсонгүй.');
    await tx(async (c) => {
      await c.query('delete from media where id = $1', [id]);
      await c.query(
        `update media set storage_key=$2, thumb_key=$3, original_name=$4, mime=$5, size_bytes=$6, width=$7, height=$8, duration_s=$9, sha256=$10, updated_at=now() where id=$1`,
        [replaceId, m.storage_key, thumbKey, m.original_name, m.mime, obj.size, m.width, m.height, m.duration_s, m.sha256]);
    });
    await deleteObject(old.storage_key).catch((e) => console.error('[media] old object delete failed', e.message));
    if (old.thumb_key) await deleteObject(old.thumb_key).catch(() => {});
    return json(res, 200, { item: mediaView(await one('select * from media where id = $1', [replaceId])) });
  }
  const row = await one(`update media set status='ready', size_bytes=$2, thumb_key=$3, updated_at=now() where id=$1 returning *`, [id, obj.size, thumbKey]);
  json(res, 200, { item: mediaView(row) });
}

export async function updateMedia(req, res, id) {
  const b = await readJson(req, 8 * 1024);
  const row = await one(`update media set alt_text=$2, original_name=coalesce(nullif($3, ''), original_name), updated_at=now() where id=$1 and status='ready' returning *`,
    [id, str(b.alt, 300, 'Alt текст'), str(b.name, 200, 'Нэр').replace(/[\\/]/g, '_')]);
  if (!row) throw new HttpError(404, 'not_found');
  json(res, 200, { item: mediaView(row) });
}

export async function mediaUsage(id) {
  const { rows } = await query(`
    select 'project' as type, id::text, title as label from projects where cover_media_id = $1 or video_media_id = $1
    union select 'project', p.id::text, p.title from project_media pm join projects p on p.id = pm.project_id where pm.media_id = $1
    union select 'influencer', id::text, display_name from influencers where profile_media_id = $1
    union select 'content', key, key from site_content where draft::text like '%' || $1::text || '%' or published::text like '%' || $1::text || '%'`, [id]);
  return rows;
}

export async function getMediaUsage(req, res, id) {
  json(res, 200, { usage: await mediaUsage(id) });
}

/** Refuses to delete media that is still referenced anywhere. */
export async function deleteMedia(req, res, id) {
  const m = await one('select * from media where id = $1', [id]);
  if (!m) throw new HttpError(404, 'not_found');
  const usage = await mediaUsage(id);
  if (usage.length) throw new HttpError(409, 'in_use', 'Энэ медиаг ашиглаж байгаа тул устгах боломжгүй. Эхлээд холбоосыг нь салгана уу.', { usage });
  await query('delete from media where id = $1', [id]);
  await deleteObject(m.storage_key).catch((e) => console.error('[media] delete failed', e.message));
  if (m.thumb_key) await deleteObject(m.thumb_key).catch(() => {});
  json(res, 200, { ok: true });
}

/* ------------------------------- content ------------------------------- */

export async function listContent(req, res) {
  json(res, 200, { items: await getContentForAdmin(), defaults: DEFAULT_CONTENT });
}

function contentKey(key) {
  if (!CONTENT_KEYS.includes(key)) throw new HttpError(404, 'not_found');
  return key;
}

export async function saveContentDraft(req, res, key) {
  contentKey(key);
  const b = await readJson(req, 512 * 1024);
  const value = sanitizeContent(key, b.value);
  await query(`insert into site_content (key, draft, updated_at) values ($1, $2, now())
               on conflict (key) do update set draft = excluded.draft, updated_at = now()`, [key, JSON.stringify(value)]);
  json(res, 200, { ok: true, value });
}

export async function publishContent(req, res, key) {
  contentKey(key);
  const row = await one('select draft, published from site_content where key = $1', [key]);
  const value = sanitizeContent(key, row?.draft ?? row?.published ?? DEFAULT_CONTENT[key]);
  await query(`insert into site_content (key, published, draft, updated_at, published_at) values ($1, $2, null, now(), now())
               on conflict (key) do update set published = excluded.published, draft = null, updated_at = now(), published_at = now()`, [key, JSON.stringify(value)]);
  json(res, 200, { ok: true });
}

/** Removes the stored section so the built-in default text is used again. */
export async function resetContent(req, res, key) {
  contentKey(key);
  await query('delete from site_content where key = $1', [key]);
  json(res, 200, { ok: true });
}

export async function discardContentDraft(req, res, key) {
  contentKey(key);
  await query('update site_content set draft = null, updated_at = now() where key = $1', [key]);
  json(res, 200, { ok: true });
}

/* ----------------------------- submissions ----------------------------- */

export async function listSubmissions(req, res, searchParams) {
  const st = ['new', 'read', 'archived'].includes(searchParams.get('status')) ? searchParams.get('status') : null;
  const { rows } = await query(
    `select id, name, company, contact, service, budget, message, consent, status, email_sent, influencers, kind, campaign_dates, notes, created_at
       from contact_submissions where ($1::text is null or status = $1) order by created_at desc limit 200`, [st]);
  json(res, 200, { items: rows });
}

export async function updateSubmission(req, res, id) {
  const s = (await readJson(req)).status;
  if (!['new', 'read', 'archived'].includes(s)) throw new HttpError(400, 'invalid');
  const r = await one('update contact_submissions set status = $2 where id = $1 returning id', [id, s]);
  if (!r) throw new HttpError(404, 'not_found');
  json(res, 200, { ok: true });
}

export async function deleteSubmission(req, res, id) {
  const r = await one('delete from contact_submissions where id = $1 returning id', [id]);
  if (!r) throw new HttpError(404, 'not_found');
  json(res, 200, { ok: true });
}

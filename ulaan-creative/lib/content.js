// Website content, portfolio and influencer data access.
// Public functions only ever return PUBLISHED data; draft access is admin-only (see router).
import { DEFAULT_CONTENT, CONTENT_KEYS } from './defaults.js';
import { query, one, dbConfigured } from './db.js';
import { publicUrl } from './storage.js';
import { tierOf } from './tiers.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// Templates for list items whose default list is empty.
const ITEM_TEMPLATES = {
  'faq.items': { q: '', a: '' },
  'services.items[].works': { mediaId: null, title: '', caption: '' },
};

/**
 * Coerce untrusted input into the exact shape of the default content for a key:
 * unknown fields dropped, types enforced, strings trimmed and length-capped.
 */
export function sanitizeContent(key, input) {
  if (!CONTENT_KEYS.includes(key)) throw new Error('unknown key');
  return coerce(DEFAULT_CONTENT[key], input, key);
}

function coerce(shape, value, path) {
  if (Array.isArray(shape)) {
    const tpl = ITEM_TEMPLATES[path] ?? shape[0] ?? '';
    const arr = Array.isArray(value) ? value.slice(0, 60) : [];
    return arr.map((v) => coerce(tpl, v, `${path}[]`)).filter((v) => !(typeof v === 'string' && v === ''));
  }
  if (shape && typeof shape === 'object') {
    const src = value && typeof value === 'object' ? value : {};
    const out = {};
    for (const k of Object.keys(shape)) out[k] = coerce(shape[k], src[k], `${path}.${k}`);
    return out;
  }
  if (shape === null || /mediaId$/i.test(path)) return isUuid(value) ? value : null;
  if (typeof shape === 'boolean') return value === true || value === 'true';
  if (typeof shape === 'number') { const n = Number(value); return Number.isFinite(n) ? n : shape; }
  // strings
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, 5000) : '';
}

/* ---------------------------- site content ---------------------------- */

export async function getPublishedContent() {
  const content = structuredClone(DEFAULT_CONTENT);
  if (!dbConfigured()) return content;
  const { rows } = await query('select key, published from site_content where published is not null');
  for (const r of rows) if (CONTENT_KEYS.includes(r.key)) content[r.key] = sanitizeContent(r.key, r.published);
  return content;
}

/** Draft view (admin preview): draft ?? published ?? default for every key. */
export async function getDraftContent() {
  const content = structuredClone(DEFAULT_CONTENT);
  const { rows } = await query('select key, draft, published from site_content');
  for (const r of rows) {
    if (!CONTENT_KEYS.includes(r.key)) continue;
    const v = r.draft ?? r.published;
    if (v) content[r.key] = sanitizeContent(r.key, v);
  }
  return content;
}

export async function getContentForAdmin() {
  const { rows } = await query('select key, draft, published, updated_at, published_at from site_content');
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  return CONTENT_KEYS.map((key) => {
    const r = byKey[key];
    const published = r?.published ? sanitizeContent(key, r.published) : null;
    const draft = r?.draft ? sanitizeContent(key, r.draft) : null;
    return {
      key,
      value: draft ?? published ?? DEFAULT_CONTENT[key],
      isDefault: !published,
      hasUnpublishedChanges: Boolean(draft) && JSON.stringify(draft) !== JSON.stringify(published),
      updatedAt: r?.updated_at || null,
      publishedAt: r?.published_at || null,
    };
  });
}

/* ------------------------------- media ------------------------------- */

export function mediaView(m) {
  if (!m) return null;
  return {
    id: m.id,
    kind: m.kind,
    url: publicUrl(m.storage_key),
    thumbUrl: m.thumb_key ? publicUrl(m.thumb_key) : (m.kind === 'image' ? publicUrl(m.storage_key) : ''),
    mime: m.mime,
    width: m.width,
    height: m.height,
    duration: m.duration_s != null ? Number(m.duration_s) : null,
    alt: m.alt_text || '',
    name: m.original_name,
    size: Number(m.size_bytes),
    status: m.status,
    createdAt: m.created_at,
  };
}

async function mediaByIds(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return {};
  const { rows } = await query(`select * from media where id = any($1::uuid[]) and status = 'ready'`, [list]);
  return Object.fromEntries(rows.map((m) => [m.id, mediaView(m)]));
}

/* ----------------------------- portfolio ----------------------------- */

function projectView(p, media, gallery = []) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    category: p.category,
    client: p.client_name,
    date: p.project_date ? new Date(p.project_date).toISOString().slice(0, 10) : '',
    cover: media[p.cover_media_id] || null,
    video: media[p.video_media_id] || null,
    videoUrl: p.video_url,
    externalUrl: p.external_url,
    seoTitle: p.seo_title,
    seoDescription: p.seo_description,
    status: p.status,
    sortOrder: p.sort_order,
    gallery,
    updatedAt: p.updated_at,
  };
}

export async function getPublishedProjects() {
  if (!dbConfigured()) return [];
  const { rows } = await query(`select * from projects where status = 'published' order by sort_order, created_at desc`);
  const media = await mediaByIds(rows.flatMap((p) => [p.cover_media_id, p.video_media_id]));
  return rows.map((p) => projectView(p, media));
}

/** Full project incl. gallery. `includeDrafts` only for authenticated admin preview. */
export async function getProject({ slug, id, includeDrafts = false }) {
  const p = await one(
    `select * from projects where ${id ? 'id = $1' : 'slug = $1'} ${includeDrafts ? '' : "and status = 'published'"}`,
    [id || slug],
  );
  if (!p) return null;
  const { rows: g } = await query('select media_id from project_media where project_id = $1 order by sort_order', [p.id]);
  const media = await mediaByIds([p.cover_media_id, p.video_media_id, ...g.map((r) => r.media_id)]);
  return projectView(p, media, g.map((r) => media[r.media_id]).filter(Boolean));
}

/* ----------------------------- influencers ----------------------------- */

/** Public view never includes the price; pass { admin: true } only from authenticated admin endpoints. */
export function influencerView(r, media, { admin = false } = {}) {
  const view = {
    id: r.id,
    name: r.display_name,
    photo: media[r.profile_media_id] || null,
    instagram: r.instagram_url,
    tiktok: r.tiktok_url,
    youtube: r.youtube_url,
    facebook: r.facebook_url || '',
    followers: r.follower_count != null ? Number(r.follower_count) : null,
    category: r.category,
    bio: r.bio,
    // engagement is public only once the admin marks it as verified
    engagement: admin || r.engagement_verified ? r.engagement : '',
    categories: r.categories || [],
    featured: Boolean(r.featured),
    tier: tierOf(r.follower_count != null ? Number(r.follower_count) : null)?.id || null,
    // hero collage on the Influencer tab (layout only — nothing private)
    inCollage: Boolean(r.in_collage),
    collageOrder: r.collage_order ?? 0,
    collageSize: r.collage_size || 'm',
    collageFocus: r.collage_focus || 'top',
    status: r.status,
    sortOrder: r.sort_order,
    updatedAt: r.updated_at,
  };
  if (admin) Object.assign(view, { price: r.price || '', engagementVerified: Boolean(r.engagement_verified), categoryIds: view.categories.map((c) => c.id) });
  return view;
}

export async function getPublishedInfluencers() {
  if (!dbConfigured()) return [];
  const { rows } = await query(`select * from influencers where status = 'published' order by sort_order, created_at`);
  const media = await mediaByIds(rows.map((r) => r.profile_media_id));
  await attachCategories(rows);
  return rows.map((r) => influencerView(r, media));
}

/** Adds r.categories = [{ id, name }] (in category order) to influencer rows. */
export async function attachCategories(rows) {
  if (!rows.length) return rows;
  const { rows: links } = await query(
    `select l.influencer_id, c.id, c.name from influencer_category_links l
       join influencer_categories c on c.id = l.category_id
      where l.influencer_id = any($1::uuid[]) order by c.sort_order, c.name`, [rows.map((r) => r.id)]);
  for (const r of rows) r.categories = links.filter((l) => l.influencer_id === r.id).map((l) => ({ id: l.id, name: l.name }));
  return rows;
}

export async function getInfluencerCategories() {
  if (!dbConfigured()) return [];
  const { rows } = await query('select id, name from influencer_categories order by sort_order, name');
  return rows;
}

/** Media referenced from website content (e.g. service showcase works), keyed by id. Ready media only. */
export async function getContentMediaMap(content) {
  if (!dbConfigured()) return {};
  const ids = content.services.items.flatMap((it) => it.works.map((w) => w.mediaId));
  return mediaByIds(ids);
}

export async function getMediaView(id) {
  if (!id) return null;
  const m = await mediaByIds([id]);
  return m[id] || null;
}

// Uploads (direct to storage via presigned URL, with progress), the Media Library
// view and the reusable media picker used by the project/influencer editors.
import { h, api, toast, modal, confirmDialog, fmtBytes, fmtDate, busy } from './lib.js';
import { prepareFile, PICK_ACCEPT, IMAGE_EXT, CONVERT_IMAGE_EXT, VIDEO_EXT as PICK_VIDEO_EXT } from './prepare.js';

export const session = { limits: { imageMB: 50, videoMB: 2048 }, accept: [], storage: null };
const ACCEPT = PICK_ACCEPT; // anything a phone/camera produces; prepare.js converts before upload
const IMAGE_ACCEPT = ['image/*', ...[...IMAGE_EXT, ...CONVERT_IMAGE_EXT].map((e) => '.' + e)].join(',');
const VIDEO_ACCEPT = ['video/*', ...PICK_VIDEO_EXT.map((e) => '.' + e)].join(',');
const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'webm'];
const extOf = (n) => (/\.([a-z0-9]+)$/i.exec(n) || [, ''])[1].toLowerCase();
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };

/* ------------------------------- upload ------------------------------- */

async function sha256(file) {
  if (!crypto.subtle || file.size > 100 * 1024 * 1024) return null; // skip hashing very large videos
  const buf = await file.arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const toWebp = (canvas) => new Promise((r) => canvas.toBlob((b) => r(b), 'image/webp', 0.82));

/** Reads dimensions/duration and makes a small WebP thumbnail / video poster in the browser. */
async function probe(file) {
  const isVideo = VIDEO_EXT.includes(extOf(file.name));
  const out = { width: null, height: null, duration: null, thumb: null };
  const draw = async (src, w, h) => {
    const scale = Math.min(1, 720 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return toWebp(c);
  };
  try {
    if (!isVideo) {
      const bmp = await createImageBitmap(file);
      out.width = bmp.width; out.height = bmp.height;
      if (file.size > 300 * 1024) out.thumb = await draw(bmp, bmp.width, bmp.height);
      bmp.close?.();
    } else {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = url;
      await new Promise((ok, fail) => { v.onloadedmetadata = ok; v.onerror = fail; setTimeout(fail, 8000); });
      out.duration = v.duration || null; out.width = v.videoWidth || null; out.height = v.videoHeight || null;
      v.currentTime = Math.min(1, (v.duration || 2) / 3);
      await new Promise((ok, fail) => { v.onseeked = ok; setTimeout(fail, 8000); });
      if (v.videoWidth) out.thumb = await draw(v, v.videoWidth, v.videoHeight);
      URL.revokeObjectURL(url);
    }
  } catch { /* unsupported codec / format in this browser: upload without metadata */ }
  return out;
}

function put(url, body, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    if (contentType) x.setRequestHeader('Content-Type', contentType);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Storage рүү илгээж чадсангүй (${x.status}).`)));
    x.onerror = () => reject(new Error('Storage рүү илгээх үед сүлжээний алдаа гарлаа (CORS тохиргоог шалгана уу).'));
    x.send(body);
  });
}

/** Validates locally, then uploads straight to storage. Returns { item, existing }. */
export async function uploadFile(file, { replaceId, onProgress, onStage, onConvert } = {}) {
  onStage?.('Шалгаж байна…');
  // convert to web-safe formats first (HEIC → JPEG, HEVC/MOV/WebM → H.264 MP4, huge photos scaled)
  file = await prepareFile(file, { imageLimit: session.limits.imageMB * 1048576, videoLimit: session.limits.videoMB * 1048576, onStage, onProgress: onConvert });
  const ext = extOf(file.name);
  if (!MIME[ext]) throw new Error(`.${ext || '?'} төрлийн файл зөвшөөрөгдөхгүй.`);
  onStage?.('Шалгаж байна…');
  const [meta, sha] = await Promise.all([probe(file), sha256(file)]);
  const init = await api('/media/uploads', { method: 'POST', body: { name: file.name, size: file.size, type: file.type, sha256: sha, width: meta.width, height: meta.height, duration: meta.duration, hasThumb: Boolean(meta.thumb), replaceId } });
  if (init.existing) return { item: init.existing, existing: true };
  onStage?.('Байршуулж байна…');
  if (init.blob) {
    // Vercel Blob: upload straight from the browser with the server-issued client token
    const { put: blobPut } = await import('./vendor/vercel-blob-client.js');
    const send = (target, body, contentType, progress) => blobPut(target.pathname, body, {
      access: 'public', token: target.token, contentType, multipart: body.size > 50 * 1048576,
      onUploadProgress: progress ? (e) => progress(e.percentage / 100) : undefined,
    }).catch((e) => { throw new Error(`Vercel Blob руу илгээж чадсангүй: ${e.message}`); });
    await send(init.blob, file, MIME[ext], onProgress);
    if (init.thumbBlob && meta.thumb) await send(init.thumbBlob, meta.thumb, 'image/webp').catch(() => {});
  } else {
    await put(init.uploadUrl, file, file.type || MIME[ext], onProgress);
    if (init.thumbUploadUrl && meta.thumb) await put(init.thumbUploadUrl, meta.thumb, 'image/webp').catch(() => {});
  }
  onStage?.('Баталгаажуулж байна…');
  const done = await api(`/media/${init.id}/complete`, { method: 'POST', body: { replaceId } });
  return { item: done.item, existing: false };
}

/** Upload several files, showing a progress row for each. */
function uploadQueue(files, listEl, { onDone, replaceId } = {}) {
  return Promise.all([...files].map(async (file) => {
    const bar = h('progress', { max: 1, value: 0, 'aria-label': `${file.name} байршуулж байна` });
    const msg = h('span.upload__msg', 'Хүлээгдэж байна…');
    const row = h('li.upload', h('span.upload__name', file.name), h('span.upload__size', fmtBytes(file.size)), bar, msg);
    listEl.prepend(row);
    try {
      let stage = '';
      const { item, existing } = await uploadFile(file, { replaceId, onProgress: (p) => { bar.value = p; msg.textContent = `Байршуулж байна… ${Math.round(p * 100)}%`; }, onStage: (s) => { stage = s; msg.textContent = s; bar.removeAttribute('value'); }, onConvert: (p) => { bar.value = p; msg.textContent = `${stage.replace(/…$/, '')} ${Math.round(p * 100)}%`; } });
      bar.value = 1; row.classList.add('is-ok');
      msg.textContent = existing ? 'Сан-д аль хэдийн байна — дахин ашиглана' : 'Амжилттай';
      onDone?.(item);
      return item;
    } catch (e) {
      row.classList.add('is-error'); msg.textContent = e.message;
      toast(`${file.name}: ${e.message}`, 'error');
      return null;
    }
  }));
}

/* ------------------------------ components ------------------------------ */

export function mediaThumb(m, { size = 'md' } = {}) {
  if (!m) return h('div.thumb.thumb--empty', { class: `thumb--${size}` }, 'Медиа байхгүй');
  const inner = m.kind === 'video'
    ? (m.thumbUrl ? h('img', { src: m.thumbUrl, alt: '', loading: 'lazy' }) : h('span.thumb__icon', '▶'))
    : h('img', { src: m.thumbUrl || m.url, alt: m.alt || '', loading: 'lazy' });
  return h('div.thumb', { class: `thumb--${size}` }, inner, m.kind === 'video' ? h('span.thumb__tag', '▶ Видео') : null);
}

function uploadZone({ onFiles, multiple = true, accept = ACCEPT }) {
  const input = h('input', { type: 'file', multiple, accept, class: 'sr-only', id: `up-${Math.random().toString(36).slice(2)}` });
  input.addEventListener('change', () => { if (input.files.length) onFiles(input.files); input.value = ''; });
  const zone = h('label.dropzone', { for: input.id },
    h('strong', 'Файл сонгох эсвэл энд чирж оруулах'),
    h('span', `Зураг: JPG, PNG, WebP, HEIC (iPhone) … — шаардлагатай бол JPEG болгож, ${session.limits.imageMB} MB хүртэл багасгана · Видео: MP4, MOV (iPhone), WebM … — Android, iPhone-д тоглогдох H.264 MP4 болгож хөрвүүлнэ (≤ ${session.limits.videoMB} MB)`), input);
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('is-over'); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); });
  return zone;
}

function storageWarning() {
  return session.storage ? null : h('div.notice.notice--warn', h('strong', 'Медиа storage тохируулагдаагүй байна. '), 'Vercel → Storage → Create → Blob → Connect дараад Redeploy хийнэ (эсвэл S3/R2).');
}

/* ---------------------------- detail dialog ---------------------------- */

export function openMediaDetail(m, { onChange } = {}) {
  const alt = h('input', { value: m.alt, maxlength: 300, id: 'md-alt' });
  const name = h('input', { value: m.name, maxlength: 200, id: 'md-name' });
  const usage = h('div.usage', 'Ашиглалт шалгаж байна…');
  api(`/media/${m.id}/usage`).then(({ usage: u }) => {
    usage.replaceChildren(u.length ? h('p', 'Ашиглагдаж буй газар: ', u.map((x) => `${x.type}: ${x.label}`).join(', ')) : h('p.muted', 'Одоогоор хаана ч ашиглагдаагүй.'));
  }).catch(() => usage.replaceChildren());
  const preview = m.kind === 'video'
    ? h('video', { src: m.url, controls: true, playsinline: true, preload: 'metadata', poster: m.thumbUrl || null, class: 'detail__media' })
    : h('img.detail__media', { src: m.url, alt: m.alt });
  const replaceInput = h('input', { type: 'file', accept: m.kind === 'video' ? VIDEO_ACCEPT : IMAGE_ACCEPT, class: 'sr-only', id: `rep-${m.id}` });
  const progress = h('ul.uploads');
  replaceInput.addEventListener('change', async () => {
    const f = replaceInput.files[0]; if (!f) return;
    const [item] = await uploadQueue([f], progress, { replaceId: m.id });
    if (item) { toast('Файл солигдлоо. Холбогдсон бүх газарт шинэ файл харагдана.'); dlg.close(); onChange?.(); }
  });
  const save = h('button.btn', { type: 'button' }, 'Хадгалах');
  save.onclick = async () => {
    busy(save, true);
    try { await api(`/media/${m.id}`, { method: 'PUT', body: { alt: alt.value, name: name.value } }); toast('Хадгалагдлаа'); onChange?.(); dlg.close(); }
    catch (e) { toast(e.message, 'error'); } finally { busy(save, false); }
  };
  const del = h('button.btn.btn--danger', { type: 'button' }, 'Устгах');
  del.onclick = async () => {
    if (!(await confirmDialog(`"${m.name}" файлыг бүрмөсөн устгах уу? Энэ үйлдлийг буцаах боломжгүй.`, { okLabel: 'Устгах', danger: true }))) return;
    try { await api(`/media/${m.id}`, { method: 'DELETE' }); toast('Устгагдлаа'); dlg.close(); onChange?.(); }
    catch (e) {
      const u = e.data?.usage;
      toast(u ? `${e.message} (${u.map((x) => x.label).join(', ')})` : e.message, 'error');
    }
  };
  const copy = h('button.btn.btn--ghost', { type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(new URL(m.url, location.origin).href); toast('URL хуулагдлаа'); } catch { toast('Хуулж чадсангүй', 'error'); } } }, 'URL хуулах');
  const dlg = modal(m.name, [
    h('div.detail', preview, h('div.detail__side',
      h('dl.meta',
        h('dt', 'Төрөл'), h('dd', m.mime),
        h('dt', 'Хэмжээ'), h('dd', fmtBytes(m.size)),
        m.width ? [h('dt', 'Нягтрал'), h('dd', `${m.width} × ${m.height}`)] : null,
        m.duration ? [h('dt', 'Урт'), h('dd', `${Math.round(m.duration)} сек`)] : null,
        h('dt', 'Огноо'), h('dd', fmtDate(m.createdAt))),
      h('label', { for: 'md-name' }, 'Файлын нэр'), name,
      h('label', { for: 'md-alt' }, 'Alt текст (зургийн тайлбар — хүртээмж, SEO)'), alt,
      usage,
      h('div.row', save, copy, h('label.btn.btn--ghost', { for: replaceInput.id }, 'Файл солих'), replaceInput, del),
      progress)),
  ], { wide: true });
}

/* ------------------------------ library view ------------------------------ */

function mediaGrid({ kind = '', selectable = false, multiple = false, onPick } = {}) {
  const state = { type: kind, q: '', items: [], selected: new Set() };
  const grid = h('div.media-grid');
  const count = h('span.muted');
  const load = async () => {
    grid.setAttribute('aria-busy', 'true');
    try {
      const { items, total } = await api(`/media?type=${state.type}&q=${encodeURIComponent(state.q)}&limit=200`);
      state.items = items;
      count.textContent = `${total} файл`;
      grid.replaceChildren(...(items.length ? items.map(card) : [h('p.muted.empty', 'Медиа олдсонгүй.')]));
    } catch (e) { grid.replaceChildren(h('p.error', e.message)); }
    grid.removeAttribute('aria-busy');
  };
  const card = (m) => {
    const btn = h('button.media-card', { type: 'button', 'aria-pressed': selectable ? String(state.selected.has(m.id)) : null, title: m.name },
      mediaThumb(m), h('span.media-card__name', m.name), h('span.media-card__meta', `${m.kind === 'video' ? 'Видео' : 'Зураг'} · ${fmtBytes(m.size)}`));
    btn.onclick = () => {
      if (!selectable) return openMediaDetail(m, { onChange: load });
      if (!multiple) return onPick([m]);
      state.selected.has(m.id) ? state.selected.delete(m.id) : state.selected.add(m.id);
      btn.setAttribute('aria-pressed', String(state.selected.has(m.id)));
    };
    return btn;
  };
  const search = h('input', { type: 'search', placeholder: 'Хайх…', 'aria-label': 'Медиа хайх' });
  let t; search.oninput = () => { clearTimeout(t); t = setTimeout(() => { state.q = search.value; load(); }, 250); };
  const filter = kind ? null : h('select', { 'aria-label': 'Төрлөөр шүүх', onchange: (e) => { state.type = e.target.value; load(); } },
    h('option', { value: '' }, 'Бүгд'), h('option', { value: 'image' }, 'Зураг'), h('option', { value: 'video' }, 'Видео'));
  const uploads = h('ul.uploads');
  const zone = uploadZone({
    accept: kind === 'video' ? VIDEO_ACCEPT : kind === 'image' ? IMAGE_ACCEPT : ACCEPT,
    onFiles: async (files) => {
      const items = (await uploadQueue(files, uploads)).filter(Boolean);
      await load();
      if (selectable && items.length) {
        const ok = items.filter((m) => !kind || m.kind === kind);
        if (!multiple) { if (ok[0]) onPick([ok[0]]); } else ok.forEach((m) => state.selected.add(m.id));
        if (multiple) load();
      }
    },
  });
  load();
  const el = h('div.media-lib', storageWarning(), session.storage ? zone : null, uploads, h('div.toolbar', search, filter, count), grid);
  return { el, state, reload: load };
}

export function mediaLibraryView() {
  return h('section.page', h('header.page__head', h('h1', 'Медиа сан'), h('p.muted', 'Зураг, видеог нэг дор байршуулж, төсөл болон influencer профайлд дахин ашиглана.')), mediaGrid().el);
}

/** Opens a picker; resolves with an array of media (or [] if cancelled). */
export function pickMedia({ kind = '', multiple = false, title } = {}) {
  return new Promise((resolve) => {
    let picked = false;
    const g = mediaGrid({ kind, selectable: true, multiple, onPick: (items) => { picked = true; m.close(); resolve(items); } });
    const confirmBtn = multiple ? h('button.btn', { type: 'button', onclick: () => { picked = true; const sel = g.state.items.filter((x) => g.state.selected.has(x.id)); m.close(); resolve(sel); } }, 'Сонгосныг нэмэх') : null;
    const m = modal(title || (kind === 'video' ? 'Видео сонгох' : kind === 'image' ? 'Зураг сонгох' : 'Медиа сонгох'), [g.el, confirmBtn ? h('div.row.row--end.sticky-foot', confirmBtn) : null], { wide: true });
    m.el.addEventListener('close', () => { if (!picked) resolve([]); });
  });
}

/** Form control holding a single media id with preview + choose/remove. */
export function mediaField({ label, kind = 'image', value = null, onChange, help }) {
  let current = value;
  const box = h('div.media-field');
  const draw = () => {
    box.replaceChildren(
      mediaThumb(current, { size: 'sm' }),
      h('div.media-field__actions',
        h('button.btn.btn--ghost', { type: 'button', onclick: async () => { const [m] = await pickMedia({ kind }); if (m) { current = m; draw(); onChange(m); } } }, current ? 'Солих' : 'Сонгох'),
        current ? h('button.btn.btn--ghost', { type: 'button', onclick: () => { current = null; draw(); onChange(null); } }, 'Хасах') : null,
        current ? h('span.muted', current.name) : null));
  };
  draw();
  return h('div.field', h('span.label', label), help ? h('p.help', help) : null, box);
}

/** Ordered gallery (multiple media) with reorder + remove. */
export function galleryField({ label, value = [], onChange }) {
  let items = [...value];
  const list = h('ol.gallery');
  const emit = () => { onChange(items); draw(); };
  const draw = () => {
    list.replaceChildren(...items.map((m, i) => h('li.gallery__item', mediaThumb(m, { size: 'sm' }),
      h('div.gallery__actions',
        h('button.icon-btn', { type: 'button', disabled: i === 0, 'aria-label': 'Дээш', onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; emit(); } }, '↑'),
        h('button.icon-btn', { type: 'button', disabled: i === items.length - 1, 'aria-label': 'Доош', onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; emit(); } }, '↓'),
        h('button.icon-btn', { type: 'button', 'aria-label': 'Хасах', onclick: () => { items.splice(i, 1); emit(); } }, '✕')))));
    if (!items.length) list.append(h('li.muted', 'Нэмэлт зураг/видео байхгүй.'));
  };
  draw();
  const add = h('button.btn.btn--ghost', { type: 'button', onclick: async () => { const picked = await pickMedia({ multiple: true, title: 'Галерейд нэмэх' }); const ids = new Set(items.map((x) => x.id)); items.push(...picked.filter((m) => !ids.has(m.id))); emit(); } }, '+ Зураг / видео нэмэх');
  return h('div.field', h('span.label', label), list, add);
}

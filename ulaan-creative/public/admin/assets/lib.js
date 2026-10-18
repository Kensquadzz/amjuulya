// Shared admin helpers: DOM builder, API client, router, toasts, dialogs.

export const BASE = document.documentElement.dataset.base || '';

/** Tiny DOM builder: h('button.btn', { onclick }, 'Label') */
export function h(tag, attrs = {}, ...children) {
  const name = (/^[a-z][a-z0-9]*/i.exec(tag) || ['div'])[0];
  const id = (/#([\w-]+)/.exec(tag) || [])[1];
  const classes = [...tag.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const el = document.createElement(name);
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = {}; }
  let value;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'value') { value = v; continue; }
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  if (value !== undefined) el.value = value ?? ''; // after children so <select> options exist
  return el;
}

/* -------------------------------- API -------------------------------- */

const ERRORS = {
  unauthorized: 'Нэвтрэх шаардлагатай.',
  invalid_credentials: 'Имэйл эсвэл нууц үг буруу байна.',
  too_many_attempts: 'Хэт олон оролдлого. 15 минутын дараа дахин оролдоно уу.',
  storage_not_configured: 'Зураг/видео хадгалах сан холбогдоогүй байна (Vercel → Storage → Blob).',
  db_not_configured: 'Өгөгдлийн сан тохируулагдаагүй байна (DATABASE_URL).',
  not_found: 'Олдсонгүй.',
  in_use: 'Ашиглагдаж байгаа тул устгах боломжгүй.',
  server_error: 'Серверийн алдаа гарлаа. Дахин оролдоно уу.',
  payload_too_large: 'Өгөгдөл хэт том байна.',
};

export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}

export async function api(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch('/api/admin' + path, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-UC-Admin': '1', Accept: 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Сүлжээний алдаа. Интернэт холболтоо шалгана уу.', 0, {});
  }
  let data = {};
  try { data = await r.json(); } catch { /* empty */ }
  if (r.status === 401 && !path.startsWith('/auth/')) { navigate('/login'); throw new ApiError(ERRORS.unauthorized, 401, data); }
  if (!r.ok) throw new ApiError(`${data.message || ERRORS[data.error] || `Алдаа (${r.status})`}${data.detail ? ` [${data.detail}]` : ''}`, r.status, data);
  return data;
}

/* ------------------------------- router ------------------------------- */

const routes = [];
let onRoute = null;
export const route = (pattern, view) => routes.push([new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), view]);
export const setRouteHandler = (fn) => { onRoute = fn; };
export const currentPath = () => location.pathname.slice(BASE.length) || '/';
export function navigate(path, { replace = false } = {}) {
  if (dirty && !confirm('Хадгалаагүй өөрчлөлт байна. Хуудаснаас гарах уу?')) return;
  dirty = false;
  history[replace ? 'replaceState' : 'pushState'](null, '', BASE + path);
  render();
}
export function render() {
  const p = currentPath();
  for (const [re, view] of routes) {
    const m = re.exec(p);
    if (m) return onRoute(view, m.groups || {}, p);
  }
  return onRoute(null, {}, p);
}
window.addEventListener('popstate', render);
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  e.preventDefault();
  navigate(a.getAttribute('href').slice(BASE.length) || '/');
});
export const link = (path, attrs, ...children) => h('a', { href: BASE + path, 'data-link': '', ...attrs }, ...children);

/* Unsaved-changes guard */
let dirty = false;
export const setDirty = (v) => { dirty = v; };
export const isDirty = () => dirty;
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ------------------------------- feedback ------------------------------- */

export function toast(message, type = 'ok') {
  const t = h('div.toast', { class: `toast--${type}`, role: type === 'error' ? 'alert' : 'status' }, message);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.classList.add('is-out'), type === 'error' ? 6000 : 3000);
  setTimeout(() => t.remove(), type === 'error' ? 6600 : 3600);
}

export function modal(title, body, { wide = false } = {}) {
  const prev = document.activeElement;
  const close = () => { dlg.close(); dlg.remove(); prev?.focus?.(); };
  const dlg = h('dialog.modal', { class: wide ? 'modal--wide' : '', 'aria-label': title },
    h('div.modal__head', h('h2', title), h('button.icon-btn', { type: 'button', onclick: close, 'aria-label': 'Хаах' }, '✕')),
    h('div.modal__body', body));
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.append(dlg);
  dlg.showModal();
  return { close, el: dlg };
}

export function confirmDialog(message, { okLabel = 'Тийм', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; m.close(); resolve(v); };
    const m = modal('Баталгаажуулах', [
      h('p', message),
      h('div.row.row--end',
        h('button.btn.btn--ghost', { type: 'button', onclick: () => finish(false) }, 'Болих'),
        h('button.btn', { type: 'button', class: danger ? 'btn--danger' : '', onclick: () => finish(true) }, okLabel)),
    ]);
    m.el.addEventListener('close', () => finish(false));
  });
}

/* ------------------------------- format ------------------------------- */

export const fmtBytes = (n) => (n == null ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);
export const fmtDate = (d) => (d ? new Date(d).toLocaleString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const statusBadge = (s) => h('span.badge', { class: s === 'published' ? 'badge--ok' : 'badge--draft' }, s === 'published' ? 'Нийтлэгдсэн' : 'Ноорог');

export function busy(btn, on, label) {
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Түр хүлээнэ үү…'; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}

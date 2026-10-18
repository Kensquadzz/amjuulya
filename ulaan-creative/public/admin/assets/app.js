// Ulaan Creative — admin dashboard (separate from the public site).
import { h, api, route, render, setRouteHandler, navigate, link, toast, confirmDialog, fmtBytes, fmtDate, statusBadge, busy, setDirty, isDirty, BASE } from './lib.js';
import { session, mediaLibraryView, mediaField, galleryField, mediaThumb } from './media.js';
import { buildForm } from './forms.js';

const app = document.getElementById('app');
let me = null;

/* ------------------------------- layout ------------------------------- */

const NAV = [
  ['/dashboard', 'Хянах самбар', 'Overview'],
  ['/portfolio', 'Портфолио', 'Portfolio'],
  ['/media', 'Медиа сан', 'Media Library'],
  ['/influencers', 'Influencer-ууд', 'Influencers'],
  ['/content', 'Вэбсайтын агуулга', 'Website Content'],
  ['/services', 'Үйлчилгээ & үнэ', 'Services & Pricing'],
  ['/submissions', 'Ирсэн хүсэлтүүд', 'Contact Submissions'],
  ['/seo', 'SEO / Metadata', 'SEO'],
  ['/settings', 'Тохиргоо', 'Settings'],
];

function layout(content, path) {
  const toggle = h('button.nav-toggle', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'side' }, h('span.sr-only', 'Цэс'), '☰');
  const side = h('aside.side#side',
    h('div.side__brand', h('img.side__logo', { src: '/assets/img/ulaan-logo-light.webp', alt: 'Ulaan Creative', width: 640, height: 252 }), h('small', 'Admin')),
    h('nav', { 'aria-label': 'Админ цэс' }, NAV.map(([p, l, en]) => link(p, { class: 'side__link' + (path.startsWith(p) ? ' is-active' : ''), 'aria-current': path.startsWith(p) ? 'page' : null }, h('span', l), h('small', en)))),
    h('div.side__foot',
      h('a.side__link', { href: '/', target: '_blank', rel: 'noopener' }, h('span', 'Вэбсайт үзэх ↗')),
      h('p.side__user', me?.email || ''),
      h('button.btn.btn--ghost.btn--block', { type: 'button', onclick: logout }, 'Гарах')));
  toggle.onclick = () => { const open = side.classList.toggle('is-open'); toggle.setAttribute('aria-expanded', String(open)); };
  side.addEventListener('click', (e) => { if (e.target.closest('a')) side.classList.remove('is-open'); });
  return h('div.shell', h('header.topbar', toggle, h('strong', 'ULAAN Admin')), side, h('main.main#main', { tabindex: '-1' }, content));
}

async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  me = null; setDirty(false); navigate('/login', { replace: true });
}

setRouteHandler(async (view, params, path) => {
  setDirty(false);
  if (path === '/' || path === '') return navigate('/dashboard', { replace: true });
  if (path === '/login') return loginView();
  if (!me) {
    try {
      const r = await api('/auth/me');
      if (!r.user) return navigate('/login', { replace: true });
      me = r.user; Object.assign(session, { limits: r.limits, accept: r.accept, storage: r.storage, email: r.email || { ready: false, to: [] } });
    } catch { return navigate('/login', { replace: true }); }
  }
  if (!view) { app.replaceChildren(layout(h('section.page', h('h1', 'Хуудас олдсонгүй')), path)); return; }
  app.replaceChildren(layout(h('div.loading', 'Ачаалж байна…'), path));
  try {
    const el = await view(params);
    app.replaceChildren(layout(el, path));
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (e) {
    if (e.status === 401) return;
    app.replaceChildren(layout(h('section.page', h('h1', 'Алдаа'), h('p.error', e.message)), path));
  }
});

/* ------------------------------- login ------------------------------- */

/** First run: no admin exists yet → create the owner account here (needs the ADMIN_SETUP_TOKEN code). */
function setupView({ tokenConfigured }) {
  const err = h('p.error', { role: 'alert' });
  const field = (id, label, attrs) => [h('label', { for: id }, label), h(`input#${id}`, attrs)];
  const [lt, token] = field('su-token', 'Setup код (Vercel дээрх ADMIN_SETUP_TOKEN)', { type: 'password', autocomplete: 'off', required: true });
  const [le, email] = field('su-email', 'Таны имэйл (нэвтрэх нэр)', { type: 'email', autocomplete: 'username', required: true });
  const [lp, pw] = field('su-pw', 'Нууц үг (12+ тэмдэгт, үсэг + тоо)', { type: 'password', autocomplete: 'new-password', minlength: 12, required: true });
  const [lr, pw2] = field('su-pw2', 'Нууц үгээ давтах', { type: 'password', autocomplete: 'new-password', required: true });
  const btn = h('button.btn.btn--block', { type: 'submit', disabled: !tokenConfigured }, 'Админ эрх үүсгэх');
  const form = h('form.login__form', { novalidate: true }, lt, token, le, email, lp, pw, lr, pw2, err, btn);
  form.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = '';
    if (pw.value !== pw2.value) { err.textContent = 'Нууц үг таарахгүй байна.'; return; }
    busy(btn, true, 'Үүсгэж байна…');
    try {
      await api('/setup', { method: 'POST', body: { token: token.value, email: email.value, password: pw.value } });
      me = null; toast('Админ эрх үүслээ'); navigate('/dashboard', { replace: true });
    } catch (ex) { err.textContent = ex.message; } finally { busy(btn, false); }
  };
  app.replaceChildren(h('main.login', h('div.login__card',
    h('img.login__logo', { src: '/assets/img/ulaan-logo-dark.webp', alt: 'Ulaan Creative', width: 640, height: 252 }),
    h('h1', h('small', 'Анхны тохиргоо — админ эрх үүсгэх')),
    tokenConfigured
      ? h('p.muted', 'Админ хараахан үүсээгүй байна. Vercel дээр тавьсан Setup кодоо оруулж, өөрийн имэйл, нууц үгээр эрх үүсгэнэ. Нэг л удаа хийгдэнэ.')
      : h('div.notice.notice--warn', 'Vercel → Settings → Environment Variables дээр ADMIN_SETUP_TOKEN (16+ тэмдэгт) нэмээд Redeploy хийсний дараа энд эрх үүсгэнэ.'),
    h('p.muted', 'Код таарахгүй бол: Vercel → Settings → Environment Variables → ADMIN_SETUP_TOKEN → ⋯ → Edit хэсгээс утгыг харж яг тэрийг бичнэ. Утгыг өөрчилсөн бол Redeploy хийнэ.'),
    form)));
}

async function loginView() {
  try { const r = await api('/auth/me'); if (r.user) { me = r.user; return navigate('/dashboard', { replace: true }); } } catch { /* not logged in */ }
  let setupError = '';
  try { const st = await api('/setup'); if (st.needed) return setupView(st); } catch (ex) { setupError = ex.message; /* shown above the login form */ }
  const err = h('p.error', { role: 'alert' }, setupError);
  const email = h('input#l-email', { type: 'email', autocomplete: 'username', required: true });
  const pw = h('input#l-pw', { type: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button.btn.btn--block', { type: 'submit' }, 'Нэвтрэх');
  const form = h('form.login__form', { novalidate: true },
    h('label', { for: 'l-email' }, 'Имэйл'), email,
    h('label', { for: 'l-pw' }, 'Нууц үг'), pw, err, btn);
  form.onsubmit = async (e) => {
    e.preventDefault(); err.textContent = '';
    if (!email.value || !pw.value) { err.textContent = 'Имэйл болон нууц үгээ оруулна уу.'; return; }
    busy(btn, true, 'Нэвтэрч байна…');
    try {
      await api('/auth/login', { method: 'POST', body: { email: email.value, password: pw.value } });
      me = null; // reload full session info (limits, storage status) on the next route
      navigate('/dashboard', { replace: true });
    } catch (ex) { err.textContent = ex.message; pw.value = ''; pw.focus(); } finally { busy(btn, false); }
  };
  app.replaceChildren(h('main.login', h('div.login__card',
    h('img.login__logo', { src: '/assets/img/ulaan-logo-dark.webp', alt: 'Ulaan Creative', width: 640, height: 252 }),
    h('h1', h('small', 'Админ хэсэгт нэвтрэх')), form)));
  email.focus();
}

/* ------------------------------ dashboard ------------------------------ */

route('/dashboard', async () => {
  const { counts: c, recent } = await api('/overview');
  const stat = (n, l, to) => link(to, { class: 'stat-card' }, h('strong', String(n)), h('span', l));
  const typeLabel = { project: 'Төсөл', influencer: 'Influencer', content: 'Агуулга', media: 'Медиа' };
  const hrefOf = (r) => (r.type === 'project' ? `/portfolio/${r.id}` : r.type === 'influencer' ? `/influencers/${r.id}` : r.type === 'media' ? '/media' : '/content');
  return h('section.page',
    h('header.page__head', h('h1', 'Хянах самбар'), h('p.muted', `Тавтай морил, ${me.email}`)),
    !session.storage ? h('div.notice.notice--warn', 'Зураг/видео хадгалах сан холбогдоогүй байна. Vercel → Storage → Create → Blob → Connect дараад Redeploy хийнэ.') : null,
    c.new_submissions ? h('div.notice', link('/submissions', {}, `${c.new_submissions} шинэ хүсэлт ирсэн байна →`)) : null,
    h('div.stats-grid',
      stat(c.projects, 'Нийт төсөл', '/portfolio'), stat(c.published, 'Нийтлэгдсэн', '/portfolio'), stat(c.drafts, 'Ноорог', '/portfolio'),
      stat(c.media, `Медиа файл · ${fmtBytes(c.media_bytes)}`, '/media'), stat(c.influencers, `Influencer (${c.influencers_published} нийтлэгдсэн)`, '/influencers'),
      stat(c.new_submissions, 'Шинэ хүсэлт', '/submissions')),
    h('h2', 'Шуурхай үйлдлүүд'),
    h('div.row', link('/portfolio/new', { class: 'btn' }, '+ Төсөл нэмэх'), link('/media', { class: 'btn btn--ghost' }, '↑ Медиа байршуулах'), link('/influencers/new', { class: 'btn btn--ghost' }, '+ Influencer нэмэх'), h('a.btn.btn--ghost', { href: `${BASE}/preview/site`, target: '_blank' }, 'Сайтын preview ↗')),
    h('h2', 'Сүүлд шинэчлэгдсэн'),
    recent.length ? h('ul.recent', recent.map((r) => h('li', link(hrefOf(r), {}, h('span.badge', typeLabel[r.type]), ' ', r.label), h('span.muted', fmtDate(r.updated_at))))) : h('p.muted', 'Одоогоор өөрчлөлт алга.'));
});

/* ------------------------------ portfolio ------------------------------ */

function sortableList({ items, render: renderRow, endpoint, onChanged }) {
  const ul = h('ul.rows');
  const draw = () => ul.replaceChildren(...items.map((it, i) => renderRow(it, {
    up: i > 0 ? () => move(i, -1) : null,
    down: i < items.length - 1 ? () => move(i, 1) : null,
  })));
  const move = async (i, d) => {
    [items[i], items[i + d]] = [items[i + d], items[i]];
    draw();
    try { await api(endpoint, { method: 'POST', body: { ids: items.map((x) => x.id) } }); toast('Дараалал хадгалагдлаа'); }
    catch (e) { toast(e.message, 'error'); onChanged(); }
  };
  draw();
  return ul;
}

const orderButtons = ({ up, down }) => h('div.order', h('button.icon-btn', { type: 'button', disabled: !up, onclick: up, 'aria-label': 'Дээш зөөх' }, '↑'), h('button.icon-btn', { type: 'button', disabled: !down, onclick: down, 'aria-label': 'Доош зөөх' }, '↓'));

route('/portfolio', async () => {
  const { items } = await api('/projects');
  const reload = () => render();
  const row = (p, mv) => h('li.row-item',
    orderButtons(mv),
    mediaThumb(p.cover, { size: 'sm' }),
    h('div.row-item__main', link(`/portfolio/${p.id}`, { class: 'row-item__title' }, p.title), h('span.muted', [p.category, p.hasVideo ? 'Видеотой' : '', `${p.galleryCount} нэмэлт медиа`].filter(Boolean).join(' · '))),
    statusBadge(p.status),
    h('div.row-item__actions',
      h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async () => { const s = p.status === 'published' ? 'draft' : 'published'; try { await api(`/projects/${p.id}/status`, { method: 'POST', body: { status: s } }); toast(s === 'published' ? 'Нийтлэгдлээ — сайт дээр харагдана' : 'Нийтлэлээс буцаагдлаа'); reload(); } catch (e) { toast(e.message, 'error'); } } }, p.status === 'published' ? 'Нуух' : 'Нийтлэх'),
      h('a.btn.btn--ghost.btn--sm', { href: `${BASE}/preview/project/${p.id}`, target: '_blank' }, 'Preview'),
      link(`/portfolio/${p.id}`, { class: 'btn btn--sm' }, 'Засах')));
  return h('section.page',
    h('header.page__head', h('h1', 'Портфолио'), link('/portfolio/new', { class: 'btn' }, '+ Шинэ төсөл')),
    h('p.muted', 'Нийтлэгдсэн төслүүд сайтын "Selected work" хэсэгт энэ дарааллаар харагдана. Ноорог төслүүд олон нийтэд харагдахгүй.'),
    items.length ? sortableList({ items, render: row, endpoint: '/projects/reorder', onChanged: reload }) : h('div.empty', h('p', 'Одоогоор төсөл алга.'), link('/portfolio/new', { class: 'btn' }, 'Эхний төслөө нэмэх')));
});

async function projectEditor({ id }) {
  const isNew = id === 'new';
  const p = isNew ? { title: '', slug: '', category: '', client: '', date: '', description: '', cover: null, video: null, videoUrl: '', externalUrl: '', seoTitle: '', seoDescription: '', status: 'draft', gallery: [] }
    : (await api(`/projects/${id}`)).item;
  const v = { ...p };
  const input = (name, label, { textarea, wide, help, ...attrs } = {}) => {
    const el = h(textarea ? 'textarea' : 'input', { id: `p-${name}`, value: v[name] ?? '', 'aria-describedby': help ? `p-${name}-h` : null, ...attrs });
    el.oninput = () => { v[name] = el.value; setDirty(true); };
    return h('div.field', { class: wide ? 'field--wide' : '' }, h('label', { for: `p-${name}` }, label), help ? h('p.help', { id: `p-${name}-h` }, help) : null, el);
  };
  const errorBox = h('p.error', { role: 'alert' });
  const save = async (status) => {
    errorBox.textContent = '';
    if (!v.title.trim()) { errorBox.textContent = 'Гарчиг оруулна уу.'; return; }
    const body = { title: v.title, slug: v.slug, category: v.category, client: v.client, date: v.date, description: v.description, coverId: v.cover?.id || null, videoId: v.video?.id || null, videoUrl: v.videoUrl, externalUrl: v.externalUrl, seoTitle: v.seoTitle, seoDescription: v.seoDescription, status: status || v.status, gallery: v.gallery.map((m) => m.id) };
    try {
      const r = await api(isNew ? '/projects' : `/projects/${id}`, { method: isNew ? 'POST' : 'PUT', body });
      setDirty(false);
      toast(body.status === 'published' ? 'Хадгалж, нийтэллээ — сайт дээр харагдана.' : 'Ноорог хадгалагдлаа.');
      if (isNew) navigate(`/portfolio/${r.item.id}`, { replace: true }); else render();
    } catch (e) { errorBox.textContent = e.message; toast(e.message, 'error'); }
  };
  const del = async () => {
    if (!(await confirmDialog(`"${p.title}" төслийг устгах уу? Медиа файлууд медиа санд хэвээр үлдэнэ.`, { okLabel: 'Устгах', danger: true }))) return;
    try { await api(`/projects/${id}`, { method: 'DELETE' }); setDirty(false); toast('Төсөл устгагдлаа'); navigate('/portfolio'); } catch (e) { toast(e.message, 'error'); }
  };
  const statusSel = h('select#p-status', h('option', { value: 'draft' }, 'Ноорог (нууц)'), h('option', { value: 'published' }, 'Нийтлэгдсэн'));
  statusSel.value = v.status; statusSel.onchange = () => { v.status = statusSel.value; setDirty(true); };
  return h('section.page',
    h('header.page__head', h('div', link('/portfolio', { class: 'back' }, '← Портфолио'), h('h1', isNew ? 'Шинэ төсөл' : p.title)), !isNew ? statusBadge(p.status) : null),
    h('form.editor', { onsubmit: (e) => { e.preventDefault(); save(); } },
      h('div.card', h('h2', 'Үндсэн мэдээлэл'), h('div.form-grid',
        input('title', 'Гарчиг *', { required: true, maxlength: 200, wide: true }),
        input('category', 'Ангилал', { maxlength: 100, placeholder: 'Жишээ: Brand campaign' }),
        input('client', 'Харилцагч (заавал биш)', { maxlength: 200 }),
        input('date', 'Огноо (заавал биш)', { type: 'date' }),
        input('slug', 'URL slug', { maxlength: 80, help: 'Хоосон орхивол гарчгаас автоматаар үүснэ. /work/<slug>' }),
        input('description', 'Тайлбар', { textarea: true, rows: 7, maxlength: 10000, wide: true, help: 'Догол мөрийг хоосон мөрөөр тусгаарлана.' }))),
      h('div.card', h('h2', 'Медиа'), h('div.form-grid',
        mediaField({ label: 'Нүүр зураг (cover)', kind: 'image', value: v.cover, onChange: (m) => { v.cover = m; setDirty(true); } }),
        mediaField({ label: 'Видео (байршуулсан)', kind: 'video', value: v.video, onChange: (m) => { v.video = m; setDirty(true); }, help: 'Эсвэл доор YouTube/Vimeo холбоос оруулна.' }),
        input('videoUrl', 'YouTube / Vimeo холбоос', { type: 'url', maxlength: 500, placeholder: 'https://www.youtube.com/watch?v=…' }),
        h('div.field--wide', galleryField({ label: 'Нэмэлт зураг / видео (галерей)', value: v.gallery, onChange: (items) => { v.gallery = items; setDirty(true); } })))),
      h('div.card', h('h2', 'Холбоос & SEO'), h('div.form-grid',
        input('externalUrl', 'Гадаад холбоос (заавал биш)', { type: 'url', maxlength: 500, wide: true }),
        input('seoTitle', 'SEO гарчиг', { maxlength: 120 }),
        input('seoDescription', 'SEO тайлбар', { maxlength: 300 }),
        h('div.field', h('label', { for: 'p-status' }, 'Төлөв'), statusSel))),
      errorBox,
      h('div.savebar',
        h('button.btn', { type: 'submit' }, 'Хадгалах'),
        h('button.btn.btn--ghost', { type: 'button', onclick: () => save('published') }, 'Хадгалаад нийтлэх'),
        !isNew && p.status === 'published' ? h('button.btn.btn--ghost', { type: 'button', onclick: () => save('draft') }, 'Нийтлэлээс буцаах') : null,
        !isNew ? h('a.btn.btn--ghost', { href: `${BASE}/preview/project/${id}`, target: '_blank' }, 'Preview ↗') : null,
        !isNew && p.status === 'published' ? h('a.btn.btn--ghost', { href: `/work/${p.slug}`, target: '_blank' }, 'Сайт дээр үзэх ↗') : null,
        !isNew ? h('button.btn.btn--danger.push-right', { type: 'button', onclick: del }, 'Устгах') : null)));
}
route('/portfolio/new', () => projectEditor({ id: 'new' }));
route('/portfolio/:id', projectEditor);

/* ----------------------------- influencers ----------------------------- */

/** Category manager: add, rename, reorder, delete (deleting never removes influencer profiles). */
function categoryManager(cats, reload) {
  const addInput = h('input', { type: 'text', maxlength: 60, placeholder: 'Шинэ ангиллын нэр', 'aria-label': 'Шинэ ангиллын нэр' });
  const add = async () => {
    const name = addInput.value.trim(); if (!name) return;
    try { await api('/influencer-categories', { method: 'POST', body: { name } }); toast('Ангилал нэмэгдлээ'); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const row = (c, mv) => {
    const input = h('input', { type: 'text', value: c.name, maxlength: 60, 'aria-label': 'Ангиллын нэр' });
    const save = async () => {
      const name = input.value.trim();
      if (!name || name === c.name) { input.value = c.name; return; }
      try { await api(`/influencer-categories/${c.id}`, { method: 'PUT', body: { name } }); c.name = name; toast('Нэр солигдлоо'); } catch (e) { input.value = c.name; toast(e.message, 'error'); }
    };
    input.onchange = save;
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } };
    return h('li.row-item', orderButtons(mv),
      h('div.row-item__main', input, h('span.muted', `${c.influencers} influencer`)),
      h('div.row-item__actions', h('button.btn.btn--danger.btn--sm', { type: 'button', onclick: async () => {
        if (!(await confirmDialog(`"${c.name}" ангиллыг устгах уу? Influencer-ууд устахгүй — зөвхөн энэ ангиллаас хасагдана.`, { okLabel: 'Ангилал устгах', danger: true }))) return;
        try { await api(`/influencer-categories/${c.id}`, { method: 'DELETE' }); toast('Ангилал устгагдлаа'); reload(); } catch (e) { toast(e.message, 'error'); }
      } }, 'Устгах')));
  };
  return h('div.card',
    h('div.card__head', h('h2', 'Ангиллууд'), h('span.muted', 'Сайтын influencer хэсгийн мөрүүд энэ дарааллаар гарна')),
    cats.length ? h('div.cat-list', sortableList({ items: cats, render: row, endpoint: '/influencer-categories/reorder', onChanged: reload })) : h('p.muted', 'Ангилал алга.'),
    h('div.row.cat-add', addInput, h('button.btn.btn--ghost', { type: 'button', onclick: add }, '+ Ангилал нэмэх')));
}

route('/influencers', async () => {
  const [{ items }, { items: cats }] = await Promise.all([api('/influencers'), api('/influencer-categories')]);
  const reload = () => render();
  const row = (p, mv) => h('li.row-item',
    orderButtons(mv), mediaThumb(p.photo, { size: 'sm' }),
    h('div.row-item__main', link(`/influencers/${p.id}`, { class: 'row-item__title' }, p.name), h('span.muted', [p.featured ? '★ Онцлох' : '', p.categories.map((c) => c.name).join(', ') || p.category, p.followers != null ? `${p.followers.toLocaleString()} дагагч` : ''].filter(Boolean).join(' · '))),
    statusBadge(p.status),
    h('div.row-item__actions',
      h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async () => { const s = p.status === 'published' ? 'draft' : 'published'; try { await api(`/influencers/${p.id}/status`, { method: 'POST', body: { status: s } }); toast(s === 'published' ? 'Нийтлэгдлээ' : 'Нийтлэлээс буцаагдлаа'); reload(); } catch (e) { toast(e.message, 'error'); } } }, p.status === 'published' ? 'Нуух' : 'Нийтлэх'),
      link(`/influencers/${p.id}`, { class: 'btn btn--sm' }, 'Засах')));
  return h('section.page',
    h('header.page__head', h('h1', 'Influencer-ууд'), link('/influencers/new', { class: 'btn' }, '+ Influencer нэмэх')),
    h('p.muted', 'Зөвхөн баталгаажсан мэдээллийг оруулна уу. Хоосон талбарууд сайт дээр харагдахгүй. Сайтын цэсний «Influencers»-ийг дарахад нийтлэгдсэн influencer-ууд ангиллын мөрүүдээр гарна. Дараалал = «Санал болгосон» эрэмбэ. Үнэ зөвхөн энд харагдана, сайт болон public API-д хэзээ ч гарахгүй.'),
    items.length ? sortableList({ items, render: row, endpoint: '/influencers/reorder', onChanged: reload }) : h('div.empty', h('p', 'Одоогоор influencer бүртгэгдээгүй.'), link('/influencers/new', { class: 'btn' }, 'Эхнийхийг нэмэх')),
    categoryManager(cats, reload));
});

async function influencerEditor({ id }) {
  const isNew = id === 'new';
  const { items: allCats } = await api('/influencer-categories');
  const p = isNew ? { name: '', photo: null, instagram: '', tiktok: '', youtube: '', facebook: '', followers: null, category: '', bio: '', engagement: '', engagementVerified: false, featured: false, categoryIds: [], price: '', status: 'draft' } : (await api(`/influencers/${id}`)).item;
  const v = { ...p, followers: p.followers ?? '', categoryIds: [...(p.categoryIds || [])] };
  const toggle = (name, label, help) => { const el = h('input', { type: 'checkbox', id: `i-${name}`, checked: Boolean(v[name]) }); el.onchange = () => { v[name] = el.checked; setDirty(true); }; return h('div.field.field--toggle', h('label.switch', { for: `i-${name}` }, el, h('span', label)), help ? h('p.help', help) : null); };
  const catBoxes = h('fieldset.field.field--wide', h('legend', 'Ангиллууд (олныг сонгож болно)'),
    allCats.length ? h('div.row', allCats.map((c) => { const el = h('input', { type: 'checkbox', checked: v.categoryIds.includes(c.id) }); el.onchange = () => { v.categoryIds = el.checked ? [...v.categoryIds, c.id] : v.categoryIds.filter((x) => x !== c.id); setDirty(true); }; return h('label.check-inline', el, ' ', c.name); })) : h('p.muted', 'Ангилал алга — Influencer-ууд хуудаснаас нэмнэ үү.'),
    h('p.help', 'Ангилалгүй influencer сайт дээр «Other» мөрөнд гарна.'));
  const input = (name, label, { textarea, wide, ...attrs } = {}) => {
    const el = h(textarea ? 'textarea' : 'input', { id: `i-${name}`, value: v[name] ?? '', ...attrs });
    el.oninput = () => { v[name] = el.value; setDirty(true); };
    return h('div.field', { class: wide ? 'field--wide' : '' }, h('label', { for: `i-${name}` }, label), el);
  };
  const errorBox = h('p.error', { role: 'alert' });
  const statusSel = h('select#i-status', h('option', { value: 'draft' }, 'Ноорог (нууц)'), h('option', { value: 'published' }, 'Нийтлэгдсэн'));
  statusSel.value = v.status; statusSel.onchange = () => { v.status = statusSel.value; setDirty(true); };
  const save = async (status) => {
    errorBox.textContent = '';
    if (!v.name.trim()) { errorBox.textContent = 'Нэр оруулна уу.'; return; }
    const body = { name: v.name, photoId: v.photo?.id || null, instagram: v.instagram, tiktok: v.tiktok, youtube: v.youtube, facebook: v.facebook, price: v.price, featured: v.featured, engagementVerified: v.engagementVerified, categoryIds: v.categoryIds, followers: v.followers, category: v.category, bio: v.bio, engagement: v.engagement, status: status || v.status };
    try {
      const r = await api(isNew ? '/influencers' : `/influencers/${id}`, { method: isNew ? 'POST' : 'PUT', body });
      setDirty(false); toast('Хадгалагдлаа');
      if (isNew) navigate(`/influencers/${r.item.id}`, { replace: true }); else render();
    } catch (e) { errorBox.textContent = e.message; toast(e.message, 'error'); }
  };
  const del = async () => {
    if (!(await confirmDialog(`"${p.name}"-г устгах уу?`, { okLabel: 'Устгах', danger: true }))) return;
    try { await api(`/influencers/${id}`, { method: 'DELETE' }); setDirty(false); toast('Устгагдлаа'); navigate('/influencers'); } catch (e) { toast(e.message, 'error'); }
  };
  return h('section.page',
    h('header.page__head', h('div', link('/influencers', { class: 'back' }, '← Influencer-ууд'), h('h1', isNew ? 'Шинэ influencer' : p.name)), !isNew ? statusBadge(p.status) : null),
    h('form.editor', { onsubmit: (e) => { e.preventDefault(); save(); } },
      h('div.card', h('div.form-grid',
        input('name', 'Нэр *', { maxlength: 120, required: true }),
        catBoxes,
        toggle('featured', 'Онцлох бүтээгч (сайтын дээд хэсэгт том харагдана)', 'Олон онцлох байвал жагсаалтын эхнийх нь харагдана.'),
        mediaField({ label: 'Профайл зураг', kind: 'image', value: v.photo, onChange: (m) => { v.photo = m; setDirty(true); } }),
        input('followers', 'Дагагчдын тоо (заавал биш)', { inputmode: 'numeric', maxlength: 14, placeholder: 'Жишээ: 125000' }),
        input('instagram', 'Instagram URL', { type: 'url', maxlength: 500 }),
        input('tiktok', 'TikTok URL', { type: 'url', maxlength: 500 }),
        input('youtube', 'YouTube URL', { type: 'url', maxlength: 500 }),
        input('facebook', 'Facebook URL', { type: 'url', maxlength: 500 }),
        input('price', 'Үнэ — зөвхөн admin-д (сайт дээр хэзээ ч харагдахгүй)', { maxlength: 200, placeholder: 'Жишээ: 1 пост ₮…, 1 reels ₮…' }),
        input('engagement', 'Engagement (заавал биш)', { maxlength: 100, placeholder: 'Жишээ: 4.2%' }),
        toggle('engagementVerified', 'Engagement баталгаажсан — сайт дээр харуулах', 'Тэмдэглээгүй бол engagement сайт дээр харагдахгүй.'),
        input('bio', 'Товч танилцуулга', { textarea: true, rows: 4, maxlength: 600, wide: true }),
        h('div.field', h('label', { for: 'i-status' }, 'Төлөв'), statusSel))),
      errorBox,
      h('div.savebar',
        h('button.btn', { type: 'submit' }, 'Хадгалах'),
        h('button.btn.btn--ghost', { type: 'button', onclick: () => save('published') }, 'Хадгалаад нийтлэх'),
        !isNew && p.status === 'published' ? h('button.btn.btn--ghost', { type: 'button', onclick: () => save('draft') }, 'Нийтлэлээс буцаах') : null,
        !isNew ? h('button.btn.btn--danger.push-right', { type: 'button', onclick: del }, 'Устгах') : null)));
}
route('/influencers/new', () => influencerEditor({ id: 'new' }));
route('/influencers/:id', influencerEditor);

route('/media', async () => mediaLibraryView());

/* ------------------------------- content ------------------------------- */

const SCHEMAS = {
  hero: { title: 'Hero (нүүр хэсэг)', fields: [
    { name: 'headline', label: 'Гол гарчиг', type: 'textarea', rows: 3, help: 'Мөр бүр тусдаа мөрөнд харагдана. Жишээ: CREATE / GROW / GO VIRAL.' },
    { name: 'lede', label: 'Дэд текст', type: 'textarea', rows: 3 },
    { name: 'metaLabel', label: 'Жижиг тэмдэглэгээ', type: 'text' },
    { name: 'ctaLabel', label: 'CTA товчны текст', type: 'text' },
    { name: 'ctaHref', label: 'CTA холбоос', type: 'text', help: '#contact, #work гэх мэт эсвэл https://… холбоос' },
    { name: 'status', label: 'Доод зүүн текст', type: 'text' },
    { name: 'tagline', label: 'Доод голын текст', type: 'text' } ] },
  marquee: { title: 'Гүйдэг текстийн тууз', fields: [{ name: 'items', label: 'Үгнүүд (мөр бүрт нэг)', type: 'lines' }] },
  intro: { title: 'Танилцуулга & статистик', fields: [
    { name: 'label', label: 'Хэсгийн шошго', type: 'text' },
    { name: 'title', label: 'Гарчиг', type: 'textarea', rows: 2, help: '*одоор* хүрээлсэн үг улаанаар тодорно.' },
    { name: 'copy', label: 'Текст', type: 'textarea' },
    { name: 'stats', label: 'Статистик', type: 'list', itemLabel: 'Тоо', titleOf: (s) => `${s.value}${s.suffix}`, addLabel: 'Тоо нэмэх', help: 'Зөвхөн баталгаажсан тоо оруулна. "Харуулах"-г унтраавал сайт дээр нуугдана.',
      template: { value: '', suffix: '+', label: '', sublabel: '', visible: false },
      fields: [{ name: 'value', label: 'Тоо', type: 'text' }, { name: 'suffix', label: 'Дагавар (+, %)', type: 'text' }, { name: 'label', label: 'Тайлбар (MN)', type: 'text' }, { name: 'sublabel', label: 'Тайлбар (EN)', type: 'text' }, { name: 'visible', label: 'Сайт дээр харуулах', type: 'toggle' }] } ] },
  work: { title: 'Портфолио хэсгийн текст', fields: [
    { name: 'label', label: 'Шошго', type: 'text' }, { name: 'title', label: 'Гарчиг', type: 'textarea', rows: 2 }, { name: 'intro', label: 'Текст', type: 'textarea' },
    { name: 'flow', label: 'Санаанаас үр дүн хүртэлх урсгал', type: 'list', itemLabel: 'Алхам', titleOf: (s) => s.en, addLabel: 'Алхам нэмэх', help: 'Жишээ: Idea → Action → Result. 3 алхам хамгийн цэвэрхэн харагдана.', template: { en: '', mn: '', text: '' }, fields: [{ name: 'en', label: 'EN', type: 'text' }, { name: 'mn', label: 'MN', type: 'text' }, { name: 'text', label: 'Тайлбар', type: 'text' }] },
    { name: 'emptyTitle', label: 'Төсөл байхгүй үеийн гарчиг', type: 'text' }, { name: 'emptyText', label: 'Төсөл байхгүй үеийн текст', type: 'textarea' } ] },
  influencers: { title: 'Influencer хэсгийн текст', fields: [
    { name: 'label', label: 'Шошго', type: 'text' }, { name: 'title', label: 'Гарчиг', type: 'textarea', rows: 2 }, { name: 'intro', label: 'Текст', type: 'textarea' },
    { name: 'homeSubtitle', label: 'Нүүр хуудасны INFLUENCERS хэсгийн дэд гарчиг', type: 'text' }, { name: 'emptyTitle', label: 'Influencer нэмэгдээгүй үеийн гарчиг', type: 'text' }, { name: 'emptyText', label: 'Influencer нэмэгдээгүй үеийн текст', type: 'textarea' } ] },
  about: { title: 'Бидний тухай', fields: [
    { name: 'label', label: 'Шошго', type: 'text' },
    { name: 'manifesto', label: 'Манифест (том текст)', type: 'textarea', help: '*одоор* хүрээлсэн үг улаанаар тодорно.' },
    { name: 'title', label: 'Гарчиг', type: 'textarea', rows: 2 },
    { name: 'paragraphs', label: 'Догол мөрүүд (мөр бүр нэг догол)', type: 'lines', rows: 6 },
    { name: 'process', label: 'Ажлын үе шат', type: 'list', itemLabel: 'Үе шат', titleOf: (s) => s.en, addLabel: 'Үе шат нэмэх', template: { en: '', mn: '' }, fields: [{ name: 'en', label: 'EN', type: 'text' }, { name: 'mn', label: 'MN', type: 'text' }] } ] },
  faq: { title: 'Түгээмэл асуулт (FAQ)', fields: [
    { name: 'label', label: 'Шошго', type: 'text' }, { name: 'title', label: 'Гарчиг', type: 'text' },
    { name: 'items', label: 'Асуулт, хариулт', type: 'list', itemLabel: 'Асуулт', titleOf: (s) => s.q, addLabel: 'Асуулт нэмэх', help: 'Асуулт нэмэгдэж нийтлэгдсэн үед л сайт дээр FAQ хэсэг харагдана.', template: { q: '', a: '' }, fields: [{ name: 'q', label: 'Асуулт', type: 'text' }, { name: 'a', label: 'Хариулт', type: 'textarea' }] } ] },
  contact: { title: 'Холбоо барих хэсэг', fields: [
    { name: 'label', label: 'Шошго', type: 'text' }, { name: 'title', label: 'Гарчиг', type: 'textarea', rows: 3 }, { name: 'copy', label: 'Текст', type: 'textarea' },
    { name: 'consentLabel', label: 'Зөвшөөрлийн текст (checkbox)', type: 'textarea' }, { name: 'privacyNotice', label: 'Нууцлалын мэдэгдэл', type: 'textarea' }, { name: 'successMessage', label: 'Амжилттай илгээсний мессеж', type: 'textarea' } ] },
  footer: { title: 'Footer', fields: [{ name: 'tagline', label: 'Footer уриа', type: 'textarea', rows: 3 }] },
  services: { title: 'Үйлчилгээнүүд', fields: [
    { name: 'label', label: 'Шошго', type: 'text' }, { name: 'title', label: 'Гарчиг', type: 'textarea', rows: 2 }, { name: 'intro', label: 'Текст', type: 'textarea' },
    { name: 'items', label: 'Үйлчилгээ', type: 'list', itemLabel: 'Үйлчилгээ', titleOf: (s) => s.title.replace(/\n/g, ' '), addLabel: 'Үйлчилгээ нэмэх',
      template: { visual: 'ai', tag: '', title: '', description: '', bullets: [], works: [] },
      fields: [{ name: 'title', label: 'Нэр', type: 'textarea', rows: 2 }, { name: 'tag', label: 'Жижиг шошго', type: 'text' },
        { name: 'visual', label: 'Визуал / өнгө', type: 'select', options: [['ai', 'Бүтээлийн галерей (хар)'], ['influencer', 'Influencer тойрог (улаан)'], ['video', 'Видео камер — FILMING (цагаан)'], ['strategy', 'Стратегийн шат (хар)']] },
        { name: 'description', label: 'Тайлбар', type: 'textarea' }, { name: 'bullets', label: 'Жагсаалт (мөр бүрт нэг)', type: 'lines', help: '"Стратегийн шат" визуал эхний 4 мөрийг шат болгон харуулна.' },
        { name: 'works', label: 'Бүтээлүүд (зураг / видео)', type: 'list', itemLabel: 'Бүтээл', titleOf: (w) => w.title, addLabel: 'Бүтээл нэмэх',
          help: '"Бүтээлийн галерей" визуалтай үйлчилгээнд эхний 4 бүтээл харагдана. Видео сайтаас шууд тоглогдоно. Хоосон бол "Бүтээлүүд удахгүй нэмэгдэнэ" гэж харагдана.',
          template: { mediaId: null, title: '', caption: '' },
          fields: [{ name: 'mediaId', label: 'Зураг эсвэл видео', type: 'media', kind: 'any' }, { name: 'title', label: 'Гарчиг', type: 'text' }, { name: 'caption', label: 'Тайлбар', type: 'text' }] }] } ] },
  packages: { title: 'Багцууд & үнэ', fields: [
    { name: 'label', label: 'Шошго', type: 'text' }, { name: 'title', label: 'Гарчиг', type: 'textarea', rows: 2 }, { name: 'intro', label: 'Текст', type: 'textarea' },
    { name: 'note', label: 'Анхааруулга (тусад нь тооцогдох зардал)', type: 'textarea', help: 'Рекламны төсөв, influencer-ийн төлбөр, нэмэлт үйлдвэрлэлийн зардлын нөхцөл.' },
    { name: 'items', label: 'Багцууд', type: 'list', itemLabel: 'Багц', titleOf: (s) => `${s.name.replace(/\n/g, ' ')} ${s.price}`, addLabel: 'Багц нэмэх',
      template: { id: '', tier: '', name: '', tagline: '', price: '', priceSuffix: '', badge: '', theme: 'light', ctaLabel: 'Багц сонгох', features: [] },
      fields: [{ name: 'name', label: 'Нэр', type: 'textarea', rows: 2 }, { name: 'id', label: 'ID (латин, жишээ: starter)', type: 'text', help: 'Хүсэлтийн формд ашиглагдана. Өөрчлөхгүй байх нь зүйтэй.' }, { name: 'tier', label: 'Жижиг шошго', type: 'text' }, { name: 'tagline', label: 'Товч тайлбар', type: 'text' },
        { name: 'price', label: 'Үнэ', type: 'text' }, { name: 'priceSuffix', label: 'Үнийн дагавар (жишээ: + НӨАТ)', type: 'text' }, { name: 'badge', label: 'Тэмдэг', type: 'text' },
        { name: 'theme', label: 'Өнгө', type: 'select', options: [['light', 'Цагаан'], ['dark', 'Хар'], ['red', 'Улаан']] }, { name: 'ctaLabel', label: 'Товчны текст', type: 'text' }, { name: 'features', label: 'Багтсан зүйлс (мөр бүрт нэг)', type: 'lines', rows: 8 }] } ] },
  seo: { title: 'SEO / Metadata', fields: [
    { name: 'title', label: 'Хуудасны гарчиг (title)', type: 'text', max: 120, help: '50–60 тэмдэгт орчим байхад тохиромжтой.' },
    { name: 'description', label: 'Meta description', type: 'textarea', max: 300, help: '150–160 тэмдэгт орчим.' },
    { name: 'ogTitle', label: 'Сошиал хуваалцах гарчиг (Open Graph)', type: 'text' },
    { name: 'ogDescription', label: 'Сошиал хуваалцах тайлбар', type: 'textarea' },
    { name: 'ogImageMediaId', label: 'Сошиал хуваалцах зураг (1200×630)', type: 'media', kind: 'image', help: 'Сонгоогүй бол анхдагч OG зураг ашиглана.' } ] },
  contact_details: { title: 'Холбоо барих мэдээлэл', fields: [
    { name: 'email', label: 'Имэйл', type: 'text' }, { name: 'phone', label: 'Утас', type: 'text' }, { name: 'address', label: 'Хаяг / байршил', type: 'text' },
    { name: 'instagram', label: 'Instagram URL', type: 'url' }, { name: 'facebook', label: 'Facebook URL', type: 'url' }, { name: 'tiktok', label: 'TikTok URL', type: 'url' }, { name: 'youtube', label: 'YouTube URL', type: 'url' } ] },
};

async function contentSections(keys, { title, intro, notice } = {}) {
  const { items } = await api('/content');
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  const mediaCache = {};
  // Resolve picked media (e.g. OG image) for previews
  if (keys.some((k) => JSON.stringify(byKey[k].value).match(/"(ogImageMediaId|mediaId)":"[0-9a-f-]{36}"/))) {
    try { const { items: m } = await api('/media?limit=200'); m.forEach((x) => { mediaCache[x.id] = x; }); } catch { /* ignore */ }
  }
  const tabs = h('div.tabs', { role: 'tablist' });
  const panel = h('div.tab-panel', { role: 'tabpanel' });
  const show = (key) => {
    const item = byKey[key];
    const value = structuredClone(item.value);
    const statusEl = h('span.badge', { class: item.hasUnpublishedChanges ? 'badge--draft' : 'badge--ok' }, item.hasUnpublishedChanges ? 'Нийтлээгүй өөрчлөлттэй' : item.isDefault ? 'Анхдагч агуулга' : 'Нийтлэгдсэн');
    const saveBtn = h('button.btn.btn--ghost', { type: 'button' }, 'Ноорог хадгалах');
    const pubBtn = h('button.btn', { type: 'button' }, 'Нийтлэх');
    const doSave = async () => { const r = await api(`/content/${key}`, { method: 'PUT', body: { value } }); item.value = r.value; item.hasUnpublishedChanges = true; setDirty(false); };
    saveBtn.onclick = async () => { busy(saveBtn, true); try { await doSave(); toast('Ноорог хадгалагдлаа (сайт дээр хараахан харагдахгүй)'); show(key); } catch (e) { toast(e.message, 'error'); } finally { busy(saveBtn, false); } };
    pubBtn.onclick = async () => {
      busy(pubBtn, true);
      try { await doSave(); await api(`/content/${key}/publish`, { method: 'POST' }); item.hasUnpublishedChanges = false; item.isDefault = false; toast('Нийтлэгдлээ — сайт дээр хэдэн секундын дотор шинэчлэгдэнэ.'); show(key); }
      catch (e) { toast(e.message, 'error'); } finally { busy(pubBtn, false); }
    };
    const discard = item.hasUnpublishedChanges ? h('button.btn.btn--ghost', { type: 'button', onclick: async () => {
      if (!(await confirmDialog('Нийтлээгүй өөрчлөлтүүдийг цуцлах уу?'))) return;
      try { await api(`/content/${key}/discard`, { method: 'POST' }); toast('Цуцлагдлаа'); render(); } catch (e) { toast(e.message, 'error'); }
    } }, 'Өөрчлөлт цуцлах') : null;
    const reset = !item.isDefault || item.hasUnpublishedChanges ? h('button.btn.btn--ghost', { type: 'button', onclick: async () => {
      if (!(await confirmDialog('Энэ хэсгийн бүх засварыг устгаж, анхдагч текст рүү буцаах уу? Сайт дээр шууд хэрэгжинэ.', { okLabel: 'Анхдагч руу буцаах', danger: true }))) return;
      try { await api(`/content/${key}/reset`, { method: 'POST' }); toast('Анхдагч текст рүү буцлаа'); render(); } catch (e) { toast(e.message, 'error'); }
    } }, 'Анхдагч руу буцаах') : null;
    panel.replaceChildren(
      h('div.card', h('div.card__head', h('h2', SCHEMAS[key].title), statusEl),
        buildForm(SCHEMAS[key].fields, value, { mediaCache }),
        h('div.savebar', pubBtn, saveBtn, h('a.btn.btn--ghost', { href: `${BASE}/preview/site`, target: '_blank', title: 'Ноорог хадгалсны дараа харагдана' }, 'Preview ↗'), discard, reset)));
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.key === key)));
  };
  keys.forEach((k) => tabs.append(h('button.tab', { type: 'button', role: 'tab', dataset: { key: k }, onclick: () => { if (!confirmLeave()) return; setDirty(false); show(k); } }, SCHEMAS[k].title, byKey[k].hasUnpublishedChanges ? h('i.dot', { 'aria-label': 'нийтлээгүй' }) : null)));
  show(keys[0]);
  return h('section.page', h('header.page__head', h('h1', title)), intro ? h('p.muted', intro) : null, notice || null, keys.length > 1 ? tabs : null, panel);
}
const confirmLeave = () => !isDirty() || confirm('Хадгалаагүй өөрчлөлт байна. Үргэлжлүүлэх үү?');

route('/content', () => contentSections(['hero', 'intro', 'marquee', 'work', 'influencers', 'about', 'faq', 'contact', 'footer'], {
  title: 'Вэбсайтын агуулга',
  intro: '"Ноорог хадгалах" нь зөвхөн preview-д харагдана. "Нийтлэх" дарсны дараа олон нийтийн сайт шинэчлэгдэнэ.',
}));
route('/services', () => contentSections(['services', 'packages'], {
  title: 'Үйлчилгээ & үнэ',
  notice: h('div.notice.notice--warn', h('strong', 'Эзэмшигчийн баталгаажуулалт шаардлагатай: '), 'Premium багцад "+ НӨАТ" гэж бичигдсэн бол Starter, Growth багцад НӨАТ-ын тэмдэглэгээ алга. НӨАТ-ын нөхцөлийг нягтлан, үнийн текстийг энд засна уу.'),
}));
route('/seo', () => contentSections(['seo'], { title: 'SEO / Metadata', intro: 'Production домэйн (canonical, sitemap, OG URL)-ийг SITE_URL орчны хувьсагчаар тохируулна.' }));

/* ----------------------------- submissions ----------------------------- */

route('/submissions', async () => {
  const filter = new URLSearchParams(location.search).get('status') || '';
  const { items } = await api(`/submissions${filter ? `?status=${filter}` : ''}`);
  const label = { new: 'Шинэ', read: 'Уншсан', archived: 'Архивласан' };
  const setStatus = async (s, st) => { try { await api(`/submissions/${s.id}`, { method: 'PUT', body: { status: st } }); render(); } catch (e) { toast(e.message, 'error'); } };
  const card = (s) => {
    const isEmail = s.contact.includes('@');
    return h('details.sub', { open: s.status === 'new' },
      h('summary', h('span.badge', { class: s.status === 'new' ? 'badge--draft' : '' }, label[s.status]), h('strong', s.name), s.company ? h('span.muted', ` · ${s.company}`) : null, h('span.muted.push-right', fmtDate(s.created_at))),
      h('dl.meta',
        h('dt', 'Холбоо барих'), h('dd', h('a', { href: isEmail ? `mailto:${s.contact}` : `tel:${s.contact.replace(/[^\d+]/g, '')}` }, s.contact)),
        h('dt', 'Үйлчилгээ'), h('dd', s.service), h('dt', 'Төсөв'), h('dd', s.budget || '—'),
        s.kind === 'influencer' ? [h('dt', 'Төрөл'), h('dd', 'Influencer кампанит ажил')] : null,
        s.influencers && s.influencers.length ? [h('dt', 'Сонгосон influencer'), h('dd', s.influencers.map((i) => i.name).join(', '))] : null,
        s.campaign_dates ? [h('dt', 'Кампанит ажлын огноо'), h('dd', s.campaign_dates)] : null,
        s.notes ? [h('dt', 'Нэмэлт тэмдэглэл'), h('dd', s.notes)] : null,
        h('dt', 'Зөвшөөрөл'), h('dd', s.consent ? 'Тийм' : 'Үгүй'), h('dt', 'Имэйл мэдэгдэл'), h('dd', s.email_sent ? 'Илгээгдсэн' : 'Илгээгдээгүй')),
      h('p.sub__msg', s.message),
      h('div.row',
        s.status !== 'read' ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => setStatus(s, 'read') }, 'Уншсан') : null,
        s.status !== 'archived' ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => setStatus(s, 'archived') }, 'Архивлах') : null,
        h('button.btn.btn--danger.btn--sm', { type: 'button', onclick: async () => { if (await confirmDialog('Энэ хүсэлтийг бүрмөсөн устгах уу? (хувийн мэдээлэл устна)', { okLabel: 'Устгах', danger: true })) { try { await api(`/submissions/${s.id}`, { method: 'DELETE' }); toast('Устгагдлаа'); render(); } catch (e) { toast(e.message, 'error'); } } } }, 'Устгах')));
  };
  return h('section.page',
    h('header.page__head', h('h1', 'Ирсэн хүсэлтүүд')),
    h('p.muted', 'Холбоо барих формоор ирсэн хүсэлтүүд. Хувийн мэдээлэл тул зөвхөн нэвтэрсэн админд харагдана.'),
    h('div.tabs', [['', 'Бүгд'], ['new', 'Шинэ'], ['read', 'Уншсан'], ['archived', 'Архив']].map(([v, l]) => link(`/submissions${v ? `?status=${v}` : ''}`, { class: 'tab', 'aria-selected': String(filter === v) }, l))),
    items.length ? h('div.subs', items.map(card)) : h('p.empty.muted', 'Хүсэлт алга.'));
});

/* ------------------------------- settings ------------------------------- */

route('/settings', async () => {
  const contactPanel = await contentSections(['contact_details'], { title: 'Тохиргоо', intro: 'Баталгаажсан мэдээллээ оруулаад "Нийтлэх" дарна уу. Хоосон талбар сайт дээр харагдахгүй.' });
  const cur = h('input#s-cur', { type: 'password', autocomplete: 'current-password' });
  const next = h('input#s-next', { type: 'password', autocomplete: 'new-password', minlength: 12 });
  const pwBtn = h('button.btn', { type: 'submit' }, 'Нууц үг солих');
  const pwForm = h('form.card', h('h2', 'Нууц үг солих'), h('div.form-grid',
    h('div.field', h('label', { for: 's-cur' }, 'Одоогийн нууц үг'), cur),
    h('div.field', h('label', { for: 's-next' }, 'Шинэ нууц үг (12+ тэмдэгт, үсэг + тоо)'), next)), pwBtn);
  pwForm.onsubmit = async (e) => {
    e.preventDefault(); busy(pwBtn, true);
    try { await api('/auth/password', { method: 'POST', body: { current: cur.value, next: next.value } }); cur.value = next.value = ''; toast('Нууц үг солигдлоо. Бусад төхөөрөмжүүд гарлаа.'); }
    catch (ex) { toast(ex.message, 'error'); } finally { busy(pwBtn, false); }
  };
  const sessions = h('div.card', h('h2', 'Нэвтрэлт'), h('p.muted', 'Бүх төхөөрөмж дээрх нэвтрэлтийг хаах (энэ төхөөрөмж ч мөн).'),
    h('button.btn.btn--danger', { type: 'button', onclick: async () => { if (await confirmDialog('Бүх төхөөрөмжөөс гарах уу?')) { await api('/auth/logout-all', { method: 'POST' }).catch(() => {}); me = null; navigate('/login', { replace: true }); } } }, 'Бүх төхөөрөмжөөс гарах'));
  const sys = h('div.card', h('h2', 'Систем'), h('dl.meta',
    h('dt', 'Медиа storage'), h('dd', session.storage ? session.storage.toUpperCase() : 'Тохируулаагүй'),
    h('dt', 'Имэйл мэдэгдэл'), h('dd', session.email.ready ? `Идэвхтэй → ${session.email.to.join(', ')}` : 'Тохируулаагүй (RESEND_API_KEY, CONTACT_TO_EMAIL)'),
    h('dt', 'Зургийн дээд хэмжээ'), h('dd', `${session.limits.imageMB} MB`),
    h('dt', 'Видеоны дээд хэмжээ'), h('dd', `${session.limits.videoMB} MB`),
    h('dt', 'Зөвшөөрөгдөх төрөл'), h('dd', session.accept.join(', ')),
    ...Object.entries(session.env || {}).flatMap(([k, ok]) => [h('dt', k), h('dd', ok ? '✓ Байна' : '✕ Алга — Vercel → Settings → Environment Variables, дараа нь Redeploy')])));
  const testBtn = h('button.btn.btn--ghost', { type: 'button', disabled: !session.email.ready, onclick: async () => {
    busy(testBtn, true);
    try { const r = await api('/email/test', { method: 'POST' }); toast(`Туршилтын имэйл илгээгдлээ → ${r.to.join(', ')}`); }
    catch (ex) { toast(`Имэйл илгээгдсэнгүй: ${ex.message}`, 'error'); } finally { busy(testBtn, false); }
  } }, 'Туршилтын имэйл илгээх');
  const mail = h('div.card', h('h2', 'Формын имэйл мэдэгдэл'),
    h('p.muted', session.email.ready
      ? `Холбоо барих болон influencer-ийн хүсэлт бүр ${session.email.to.join(', ')} хаяг руу имэйлээр ирнэ (мөн «Ирсэн хүсэлтүүд»-д хадгалагдана).`
      : 'Одоогоор зөвхөн «Ирсэн хүсэлтүүд»-д хадгалагдаж байна. Имэйлээр авахын тулд серверт RESEND_API_KEY болон CONTACT_TO_EMAIL тохируулна (README → Contact form).'),
    testBtn);
  contactPanel.append(mail, pwForm, sessions, sys);
  return contactPanel;
});

render();

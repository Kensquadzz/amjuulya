// Server-side rendering of the public website from CMS data.
// Markup/classes follow the original design (public/assets/css/styles.css).
import { esc } from './http.js';
import { SERVICE_OPTIONS, BUDGET_OPTIONS } from './defaults.js';

/* ------------------------------ helpers ------------------------------ */

/** Escape, keep line breaks, and turn *text* into a red accent. */
const rich = (s, accent = 'red') =>
  esc(s).replace(/\*([^*]+)\*/g, accent === 'em' ? '<em>$1</em>' : `<span class="${accent}">$1</span>`).replace(/\n/g, '<br>');
const plain = (s) => String(s ?? '').replace(/\*/g, '').replace(/\s*\n\s*/g, ' ');
const attr = esc;
const lines = (s) => String(s || '').split('\n').map((l) => l.trim()).filter(Boolean);
const safeHref = (u) => (/^(https?:\/\/|mailto:|tel:|#|\/)/i.test(String(u || '').trim()) ? String(u).trim() : '#contact');
const fmtFollowers = (n) => (n == null ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n % 1e3 && n < 1e4 ? 1 : 0)}K` : String(n));
const initials = (name) => plain(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const ARROW = '<svg viewBox="0 0 16 16"><path d="M4 12 12 4M6 4h6v6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

function mediaImg(m, { alt, sizes = '100vw', eager = false, cls = '' } = {}) {
  if (!m) return '';
  const w = m.width ? ` width="${m.width}" height="${m.height}"` : '';
  return `<img src="${attr(m.url)}"${w} alt="${attr(alt ?? m.alt ?? '')}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" sizes="${sizes}"${cls ? ` class="${cls}"` : ''}>`;
}

function videoTag(m, poster, label) {
  return `<video class="video" controls playsinline preload="none"${poster ? ` poster="${attr(poster)}"` : ''} aria-label="${attr(label)}">
    <source src="${attr(m.url)}" type="${attr(m.mime === 'video/quicktime' ? 'video/mp4' : m.mime)}">
  </video>`;
}

export function embedFor(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (host === 'youtube.com') id = u.searchParams.get('v') || (u.pathname.match(/^\/(shorts|embed)\/([\w-]{6,})/) || [])[2] || '';
    if (id && /^[\w-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    if (host === 'vimeo.com' && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video/${u.pathname.split('/')[1]}`;
  } catch { /* invalid */ }
  return '';
}

/* ------------------------------ layout ------------------------------ */

function head({ title, description, canonical, ogTitle, ogDescription, ogImage, nonce, noindex, jsonLd }) {
  return `<!doctype html>
<html lang="mn" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<meta name="theme-color" content="#E50920">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : `<link rel="canonical" href="${attr(canonical)}">`}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ulaan Creative">
<meta property="og:url" content="${attr(canonical)}">
<meta property="og:title" content="${attr(ogTitle || title)}">
<meta property="og:description" content="${attr(ogDescription || description)}">
<meta property="og:image" content="${attr(ogImage)}">
<meta property="og:locale" content="mn_MN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${attr(ogTitle || title)}">
<meta name="twitter:description" content="${attr(ogDescription || description)}">
<meta name="twitter:image" content="${attr(ogImage)}">
<link rel="icon" href="/assets/img/favicon-32.png" type="image/png" sizes="32x32">
<link rel="icon" href="/assets/img/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<script nonce="${nonce}">
  (function (d) {
    var h = d.documentElement, reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    h.classList.remove('no-js'); h.classList.add('js');
    if (!reduce) h.classList.add('motion-ok');
    var seen = false; try { seen = sessionStorage.getItem('uc-loaded') === '1'; } catch (e) {}
    if (!reduce && !seen && d.body === null && location.pathname === '/') h.classList.add('is-loading');
    setTimeout(function () { if (!window.__ucReady) h.classList.remove('motion-ok', 'is-loading'); }, 4000);
  })(document);
</script>
<link rel="preload" href="/assets/fonts/oswald-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/oswald-cyrillic-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/inter-cyrillic-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/fonts.css">
<link rel="stylesheet" href="/assets/css/styles.css">
${jsonLd ? `<script type="application/ld+json" nonce="${nonce}">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>`;
}

function nav({ hasInfluencers, base = '' }) {
  const links = [['work', 'Work'], ['services', 'Services'], ['influencers', 'Influencers'], ['packages', 'Packages'], ['about', 'About'], ['contact', 'Contact']].filter(Boolean);
  return `<header class="nav" data-nav>
  <div class="nav__inner">
    <a class="logo" href="${base || '#top'}" aria-label="Ulaan Creative — нүүр хуудас">
      <img class="logo__img logo__img--on-red" src="/assets/img/ulaan-logo-on-red.webp" width="640" height="252" alt="Ulaan Creative">
      <img class="logo__img logo__img--light" src="/assets/img/ulaan-logo-light.webp" width="640" height="252" alt="" aria-hidden="true">
    </a>
    <nav class="nav__links" aria-label="Үндсэн цэс">
      ${links.map(([id, l]) => `<a href="${base}#${id}" class="link-line">/ ${l}</a>`).join('\n      ')}
    </nav>
    <a class="nav__cta btn-fill" href="${base}#contact" data-magnetic><span>LET’S TALK</span><i class="dot" aria-hidden="true"></i></a>
    <button class="nav__toggle" type="button" aria-expanded="false" aria-controls="mobile-menu" data-menu-toggle>
      <span class="sr-only">Цэс нээх</span><span class="nav__toggle-lines" aria-hidden="true"></span>
    </button>
  </div>
</header>
<div class="menu" id="mobile-menu" data-menu hidden>
  <nav aria-label="Гар утасны цэс">
    ${links.map(([id, l], i) => `<a href="${base}#${id}"><small>0${i + 1}</small>${l}</a>`).join('\n    ')}
  </nav>
  <a class="btn-fill btn-fill--light menu__cta" href="${base}#contact"><span>LET’S TALK</span><i class="dot" aria-hidden="true"></i></a>
</div>`;
}

function footer(c, { hasInfluencers, base = '' }) {
  const d = c.contact_details;
  const contactItems = [
    d.email && `<a class="link-line" href="mailto:${attr(d.email)}">${esc(d.email)}</a>`,
    d.phone && `<a class="link-line" href="tel:${attr(d.phone.replace(/[^\d+]/g, ''))}">${esc(d.phone)}</a>`,
    d.address && `<span>${esc(d.address)}</span>`,
  ].filter(Boolean);
  const socials = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['youtube', 'YouTube']]
    .filter(([k]) => /^https:\/\//.test(d[k] || ''))
    .map(([k, l]) => `<a class="link-line" href="${attr(d[k])}" target="_blank" rel="noopener">${l} ↗</a>`);
  const links = [['work', 'Work'], ['services', 'Services'], ['influencers', 'Influencers'], ['packages', 'Packages'], ['about', 'About'], ['contact', 'Contact']].filter(Boolean);
  return `<footer class="footer" data-cursor-theme="light">
  <div class="container footer__top">
    <div class="footer__col">
      <img class="footer__logo" src="/assets/img/ulaan-logo-light.webp" width="640" height="252" alt="Ulaan Creative" loading="lazy">
      <p class="footer__tag">${rich(c.footer.tagline)}</p>
    </div>
    <nav class="footer__col" aria-label="Footer цэс">
      <p class="label mono">Цэс</p>
      ${links.map(([id, l]) => `<a class="link-line" href="${base}#${id}">${l}</a>`).join('\n      ')}
    </nav>
    ${contactItems.length ? `<div class="footer__col"><p class="label mono">Холбоо барих</p>${contactItems.join('')}</div>` : ''}
    ${socials.length ? `<div class="footer__col"><p class="label mono">Сошиал</p>${socials.join('')}</div>` : ''}
  </div>
  <div class="container footer__bottom mono">
    <span>© <span data-year>${new Date().getFullYear()}</span> Ulaan Creative. Бүх эрх хуулиар хамгаалагдсан.</span>
    <span class="footer__clock" data-clock aria-label="Улаанбаатарын цаг"></span>
    <a href="${base || ''}#top" class="link-line">Дээш буцах ↑</a>
  </div>
</footer>`;
}

const scripts = (nonce) => `
<script src="/assets/vendor/gsap.min.js" defer></script>
<script src="/assets/vendor/ScrollTrigger.min.js" defer></script>
<script src="/assets/vendor/lenis.min.js" defer></script>
<script src="/assets/js/main.js" defer></script>`;

const previewBar = (label) => label ? `<div class="preview-bar mono" role="status">${esc(label)}</div>` : '';

/* ------------------------------ sections ------------------------------ */


function hero(h) {
  const words = lines(h.headline);
  return `<section class="hero" id="top" aria-labelledby="hero-title" data-cursor-theme="light">
  <div class="hero__mascot" data-hero-mascot>
    <div class="hero__mascot-float" data-hero-float>
      <img class="bomb" src="/assets/img/ulaan-bomb.webp" srcset="/assets/img/ulaan-bomb-sm.webp 480w, /assets/img/ulaan-bomb.webp 959w" width="959" height="1492" decoding="async" sizes="(max-width: 760px) 70vw, 40vw" fetchpriority="high" alt="Ulaan Creative-ийн дүр — гартаа барьсан, гал нь асаж буй хар бөмбөг">
      <span class="hero__eye" data-eye-anchor aria-hidden="true"></span>
    </div>
  </div>
  <div class="hero__grain" aria-hidden="true"></div>
  <svg class="hero__line" aria-hidden="true" data-hero-line><line x1="0" y1="0" x2="0" y2="0"/><circle r="3.5" cx="0" cy="0"/></svg>
  <div class="hero__content">
    <h1 class="hero__title" id="hero-title" aria-label="${attr(words.join(' '))}">
      ${words.map((w) => `<span class="line" aria-hidden="true"><span class="word" data-hero-word>${esc(w).replace(/\.$/, '<em>.</em>')}</span></span>`).join('\n      ')}
    </h1>
    <div class="hero__aside" data-hero-fade>
      ${h.metaLabel ? `<p class="hero__meta mono">${esc(h.metaLabel)}</p>` : ''}
      <p class="hero__lede mono">${esc(h.lede)}</p>
    </div>
    <div class="hero__actions" data-hero-fade>
      <a class="btn-pill" href="${attr(safeHref(h.ctaHref))}" data-magnetic data-hero-cta>
        <span class="btn-pill__text">${esc(h.ctaLabel)}</span>
        <span class="btn-pill__icon" aria-hidden="true">${ARROW}</span>
      </a>
      <span class="hero__anchor" data-hero-anchor aria-hidden="true"></span>
    </div>
  </div>
  <div class="hero__bottom mono">
    ${h.status ? `<p class="hero__status" data-hero-fade><i class="pulse" aria-hidden="true"></i>${esc(h.status)}</p>` : '<span></span>'}
    ${h.tagline ? `<p class="hero__tagline" data-hero-fade>${esc(h.tagline)}</p>` : ''}
    <a class="hero__scroll" href="#intro" data-hero-fade>Scroll to explore <span aria-hidden="true">↓</span></a>
  </div>
</section>`;
}

function marquee(m) {
  if (!m.items.length) return '';
  const row = m.items.map((t) => `<span>${esc(t)}</span><b>✶</b>`).join('');
  return `<div class="marquee" aria-hidden="true"><div class="marquee__track" data-marquee>${row}${row}</div></div>`;
}

function intro(c) {
  const stats = c.stats.filter((s) => s.visible && (s.value || s.label));
  return `<section class="intro" id="intro" aria-labelledby="intro-title">
  <div class="container">
    <div class="intro__head">
      <p class="label mono" data-reveal>${esc(c.label)}</p>
      <h2 class="intro__title display" id="intro-title" data-split>${rich(c.title)}</h2>
      <p class="intro__copy" data-reveal>${esc(c.copy)}</p>
    </div>
    ${stats.length ? `<ul class="stats stats--${stats.length}" role="list">
      ${stats.map((s) => `<li class="stat" data-reveal>
        <span class="stat__num display">${/^\d+$/.test(s.value) ? `<span data-count="${s.value}">${s.value}</span>` : esc(s.value)}${esc(s.suffix)}</span>
        <span class="stat__label">${esc(s.label)}${s.sublabel ? `<small class="mono">${esc(s.sublabel)}</small>` : ''}</span>
      </li>`).join('\n      ')}
    </ul>` : ''}
  </div>
</section>`;
}

/** Real work gallery (images / playable videos) managed in the admin; clean empty state otherwise. */
function showcaseVisual(item, mediaMap) {
  const works = item.works.map((w) => ({ ...w, media: mediaMap[w.mediaId] })).filter((w) => w.media).slice(0, 4);
  if (!works.length) {
    return `<div class="svc__visual vis-show vis-show--empty">
      <div class="vis-show__empty">
        <span class="mono">Selected work</span>
        <p class="vis-show__empty-title">Бүтээлүүд удахгүй нэмэгдэнэ</p>
        <p>Бидний хийсэн зураг, видео бүтээлүүдийг энд үзэх боломжтой болно.</p>
      </div>
    </div>`;
  }
  return `<div class="svc__visual vis-show vis-show--${works.length}">
    ${works.map((w) => `<figure class="vis-show__item">
      <div class="vis-show__media">${w.media.kind === 'video'
        ? `<video controls playsinline preload="metadata"${w.media.thumbUrl ? ` poster="${attr(w.media.thumbUrl)}"` : ''} aria-label="${attr(w.title || w.media.alt || 'Видео бүтээл')}"><source src="${attr(w.media.url)}" type="${attr(w.media.mime === 'video/quicktime' ? 'video/mp4' : w.media.mime)}"></video>`
        : mediaImg(w.media, { alt: w.media.alt || w.title, sizes: '(max-width: 900px) 50vw, 25vw' })}</div>
      ${w.title || w.caption ? `<figcaption>${w.title ? `<strong>${esc(w.title)}</strong>` : ''}${w.caption ? `<span>${esc(w.caption)}</span>` : ''}</figcaption>` : ''}
    </figure>`).join('')}
  </div>`;
}

/** Brand & digital: the service's own steps as a strategy staircase (brand → content → campaign). */
function strategyVisual(item) {
  const steps = item.bullets.slice(0, 4);
  return `<div class="svc__visual vis-plan" aria-hidden="true">
    <ol class="vis-plan__steps">${steps.map((b, i) => `<li style="--i:${i}"><span class="mono">0${i + 1}</span><strong>${esc(b)}</strong></li>`).join('')}</ol>
    <p class="vis-plan__foot mono">Brand → Content → Campaign</p>
  </div>`;
}

const STATIC_VISUALS = {
  influencer: `<div class="svc__visual vis-inf" aria-hidden="true"><div class="vis-inf__ring r1"><i></i><i></i><i></i></div><div class="vis-inf__ring r2"><i></i><i></i><i></i><i></i></div><div class="vis-inf__ring r3"><i></i><i></i><i></i><i></i><i></i></div><div class="vis-inf__core display">BRAND</div><span class="vis-inf__chip mono c1">reels</span><span class="vis-inf__chip mono c2">tiktok</span><span class="vis-inf__chip mono c3">stories</span></div>`,
  video: `<div class="svc__visual vis-vid" aria-hidden="true"><div class="vis-vid__frame"><span class="c tl"></span><span class="c tr"></span><span class="c bl"></span><span class="c br"></span><span class="vis-vid__rec mono"><i></i>REC</span><span class="vis-vid__tc mono" data-timecode>00:00:00:00</span><span class="vis-vid__meta mono">9:16 · 4K · 25FPS</span><span class="vis-vid__cross"></span><span class="vis-vid__word display">RECORDING</span></div></div>`,
};
// 'calendar' is the old name of the strategy visual (kept for content saved before the rename)
const SVC_THEME = { ai: ['svc--ai', 'dark'], influencer: ['svc--inf', 'light'], video: ['svc--vid', 'dark'], strategy: ['svc--brand', 'light'], calendar: ['svc--brand', 'light'] };

function serviceVisual(item, mediaMap) {
  if (item.visual === 'ai') return showcaseVisual(item, mediaMap);
  if (item.visual === 'strategy' || item.visual === 'calendar') return strategyVisual(item);
  return STATIC_VISUALS[item.visual] || showcaseVisual(item, mediaMap);
}

function services(s, mediaMap) {
  return `<section class="services" id="services" aria-labelledby="services-title">
  <div class="container services__head">
    <p class="label mono" data-reveal>${esc(s.label)}</p>
    <h2 class="display services__title" id="services-title" data-split>${rich(s.title)}</h2>
    <p class="services__intro" data-reveal>${esc(s.intro)}</p>
  </div>
  <div class="services__stack" data-services>
    ${s.items.map((it, i) => {
      const [cls, cur] = SVC_THEME[it.visual] || SVC_THEME.ai;
      return `<article class="svc ${cls}" data-svc data-cursor-theme="${cur}">
      <div class="svc__inner container">
        <div class="svc__text">
          <p class="svc__num mono"><span>${String(i + 1).padStart(2, '0')}</span> / ${esc(it.tag)}</p>
          <h3 class="svc__title display">${rich(it.title)}</h3>
          <p class="svc__desc">${esc(it.description)}</p>
          ${it.bullets.length ? `<ul class="svc__list">${it.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
        </div>
        ${serviceVisual(it, mediaMap)}
      </div>
    </article>`;
    }).join('\n    ')}
  </div>
</section>`;
}

function work(w, projects) {
  const items = projects.map((p, i) => {
    const media = p.cover
      ? mediaImg(p.cover, { alt: p.cover.alt || p.title, sizes: '(max-width: 900px) 100vw, 60vw' })
      : p.video?.thumbUrl ? `<img src="${attr(p.video.thumbUrl)}" alt="${attr(p.title)}" loading="lazy" decoding="async">`
      : `<div class="ph ph--${(i % 5) + 1}" aria-hidden="true"><span class="display">${esc(initials(p.title) || 'UC')}</span></div>`;
    return `<article class="work__item w${(i % 5) + 1}" data-cursor="Үзэх">
        <a class="work__link" href="/work/${attr(p.slug)}" aria-label="${attr(p.title)}">
          <figure class="work__media" data-reveal-media>${media}${p.video || p.videoUrl ? '<span class="work__play mono" aria-hidden="true">▶ Video</span>' : ''}</figure>
          <div class="work__meta">
            <span class="mono">${String(i + 1).padStart(2, '0')}${p.category ? ` — ${esc(p.category)}` : ''}</span>
            <h3>${esc(p.title)}</h3>
            ${p.client ? `<span class="work__client mono">${esc(p.client)}</span>` : ''}
          </div>
        </a>
      </article>`;
  });
  return `<section class="work" id="work" aria-labelledby="work-title" data-cursor-theme="dark">
  <div class="container">
    <div class="work__head">
      <p class="label mono" data-reveal>${esc(w.label)}</p>
      <h2 class="display work__title" id="work-title" data-split>${rich(w.title)}</h2>
      <p class="work__intro" data-reveal>${esc(w.intro)}</p>
    </div>
    ${w.flow.length ? `<ol class="flow" role="list" aria-label="Санаанаас үр дүн хүртэл">
      ${w.flow.map((f, i) => `<li class="flow__step" data-reveal>
        <span class="flow__num mono">0${i + 1}</span>
        <span class="flow__en display">${esc(f.en)}</span>
        <span class="flow__mn">${esc(f.mn)}</span>
        ${f.text ? `<p>${esc(f.text)}</p>` : ''}
      </li>`).join('')}
    </ol>` : ''}
    ${items.length ? `<div class="work__grid">${items.join('\n      ')}</div>` : `<div class="work__empty" data-reveal>
      <div><h3 class="display">${esc(w.emptyTitle)}</h3><p>${esc(w.emptyText)}</p></div>
      <a class="btn-fill btn-fill--dark" href="#contact" data-magnetic><span>Төслөө ярилцах</span><i class="dot" aria-hidden="true"></i></a>
    </div>`}
  </div>
</section>`;
}

const SOCIALS = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['facebook', 'Facebook']];

/** Influencer list: full-screen panel opened from the nav ("Influencers"), cards fanned in an arc
 *  and swiped sideways. Price is never part of the public data, so it can't appear here. */
const FOLLOWER_RANGES = [['all', 'Бүгд'], ['1k-10k', '1K–10K'], ['10k-50k', '10K–50K'], ['50k-100k', '50K–100K'], ['100k-500k', '100K–500K'], ['500k+', '500K+']];
const catNames = (p) => (p.categories && p.categories.length ? p.categories.map((c) => c.name) : p.category ? [p.category] : []);
const platforms = (p) => SOCIALS.filter(([k]) => p[k]).map(([, l]) => l);

/** Category / followers / sort controls in a compact panel (search lives in the toolbar). */
function influencerFilter(categories) {
  return `<div class="inf-filter" id="inf-filter" role="dialog" aria-label="Шүүлтүүр" data-inf-filter hidden>
    <form class="inf-filter__form" data-inf-filter-form>
      <div class="inf-filter__head"><p class="mono">Шүүлтүүр</p><button type="button" class="inf-filter__x" data-inf-filter-close aria-label="Шүүлтүүр хаах">✕</button></div>
      ${categories.length ? `<fieldset class="inf-filter__group"><legend class="mono">Ангилал</legend><div class="inf-filter__chips">
        <label class="inf-chip"><input type="checkbox" name="cat" value="all" checked data-cat-all><span>Бүгд</span></label>
        ${categories.map((c) => `<label class="inf-chip"><input type="checkbox" name="cat" value="${attr(c.id)}"><span>${esc(c.name)}</span></label>`).join('')}
      </div></fieldset>` : ''}
      <fieldset class="inf-filter__group"><legend class="mono">Дагагч</legend><div class="inf-filter__chips">
        ${FOLLOWER_RANGES.map(([v, l], i) => `<label class="inf-chip"><input type="radio" name="followers" value="${v}"${i ? '' : ' checked'}><span>${l}</span></label>`).join('')}
      </div></fieldset>
      <label class="inf-filter__group"><span class="mono">Эрэмбэ</span><span class="inf-filter__select"><select name="sort">
        <option value="recommended">Санал болгосон</option><option value="followers-desc">Дагагч: ихээс бага</option><option value="followers-asc">Дагагч: багаас их</option>
      </select></span></label>
      <div class="inf-filter__foot">
        <button type="button" class="inf-link mono" data-inf-reset>Цэвэрлэх</button>
        <button type="submit" class="btn-fill btn-fill--light"><span>Хэрэглэх</span><i class="dot" aria-hidden="true"></i></button>
      </div>
    </form>
  </div>`;
}

const pickBtn = (p, cls = '') => `<button type="button" class="inf-pick${cls}" data-inf-pick="${attr(p.id)}" aria-pressed="false" aria-label="${attr(p.name)} — кампанит ажилд сонгох"><span class="inf-pick__off">+ Сонгох</span><span class="inf-pick__on">✓ Сонгосон</span></button>`;
const metaLine = (p) => [platforms(p).join(' · '), p.followers != null && `${fmtFollowers(p.followers)} дагагч`, p.engagement && `ER ${p.engagement}`].filter(Boolean).map(esc).join('<i aria-hidden="true">/</i>');

function influencerCard(p) {
  return `<li class="inf-card" data-inf-item="${attr(p.id)}">
        <div class="inf-card__media">${p.photo ? mediaImg(p.photo, { alt: '', sizes: '(max-width: 760px) 46vw, 240px' }) : `<span class="display" aria-hidden="true">${esc(initials(p.name))}</span>`}</div>
        <button type="button" class="inf-card__open" data-inf-open="${attr(p.id)}" aria-label="${attr(p.name)} — дэлгэрэнгүй">
          <span class="inf-card__cat mono">${esc(catNames(p).join(' · ') || 'Influencer')}</span>
          <strong class="inf-card__name">${esc(p.name)}</strong>
          <span class="inf-card__meta mono">${metaLine(p)}</span>
        </button>
        ${pickBtn(p, ' inf-pick--card')}
      </li>`;
}

/** Hidden per-creator detail (shown in the details sheet). Public fields only — never the price. */
function influencerDetail(p) {
  const links = SOCIALS.filter(([k]) => p[k]);
  const data = [p.followers != null && ['Дагагч', fmtFollowers(p.followers)], p.engagement && ['Engagement (баталгаажсан)', p.engagement]].filter(Boolean);
  return `<template data-inf-detail="${attr(p.id)}">
    <div class="inf-detail__media">${p.photo ? mediaImg(p.photo, { alt: p.photo.alt || p.name, sizes: '(max-width: 760px) 100vw, 420px' }) : `<span class="display" aria-hidden="true">${esc(initials(p.name))}</span>`}</div>
    <div class="inf-detail__body">
      <p class="mono inf-detail__cat">${esc(catNames(p).join(' · ') || 'Influencer')}</p>
      <h3 class="display inf-detail__name" id="inf-detail-title">${esc(p.name)}</h3>
      ${p.bio ? `<p class="inf-detail__bio">${esc(p.bio)}</p>` : ''}
      ${data.length ? `<dl class="inf-detail__data mono">${data.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      ${links.length ? `<p class="inf-detail__links">${links.map(([k, l]) => `<a class="mono" href="${attr(p[k])}" target="_blank" rel="noopener">${l} ↗</a>`).join('')}</p>` : ''}
      ${pickBtn(p, ' inf-pick--lg')}
    </div>
  </template>`;
}

/** Netflix-inspired creator browser, opened from the nav ("Influencers"): optional featured
 *  creator, horizontal category rows, search + filter, multi-select → one campaign inquiry. */
function influencersPanel(s, list, categories = []) {
  const empty = !list.length;
  // rows follow the admin-managed categories; creators without a category go to "Other"
  const cats = categories.length ? categories : [...new Map(list.flatMap((p) => p.categories || []).map((c) => [c.id, c])).values()];
  const other = cats.find((c) => /^other$|^бусад$/i.test(c.name));
  const rows = cats.map((c) => ({ ...c, people: list.filter((p) => (p.categories || []).some((x) => x.id === c.id) || (c === other && !(p.categories || []).length)) }));
  if (!other && list.some((p) => !(p.categories || []).length)) rows.push({ id: 'none', name: 'Other', people: list.filter((p) => !(p.categories || []).length) });
  const featured = list.find((p) => p.featured);
  const data = list.map((p, i) => [p.id, { n: plain(p.name).toLowerCase(), f: p.followers ?? null, c: (p.categories || []).map((x) => x.id), o: i, name: p.name }]);
  return `<div class="inf" id="influencers" role="dialog" aria-modal="true" aria-labelledby="inf-title" data-inf>
  <div class="inf__scroll" data-inf-scroll data-lenis-prevent>
    <div class="inf__top">
      <p class="label mono">${esc(s.label)}</p>
      <a class="inf__close" href="#top" data-inf-close aria-label="Хаах"><span aria-hidden="true">✕</span></a>
    </div>
    <header class="inf__intro">
      <div>
        <h2 class="display inf__title" id="inf-title">${rich(s.title)}</h2>
        <p>${esc(s.intro)}</p>
      </div>
      ${empty ? '' : `<div class="inf__tools">
        <label class="inf__search"><span class="sr-only">Нэрээр хайх</span><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m11 11 4 4" stroke="currentColor" stroke-width="1.5"/></svg><input type="search" placeholder="Нэрээр хайх" autocomplete="off" maxlength="80" data-inf-search></label>
        <button type="button" class="inf__filter-btn mono" data-inf-filter-toggle aria-expanded="false" aria-controls="inf-filter">Filter<span class="inf__filter-count" data-inf-filter-count hidden></span></button>
        ${influencerFilter(cats)}
      </div>`}
    </header>
    ${featured ? `<article class="inf-feat" data-inf-item="${attr(featured.id)}" data-inf-featured>
      <div class="inf-feat__media">${featured.photo ? mediaImg(featured.photo, { alt: featured.photo.alt || featured.name, sizes: '(max-width: 760px) 100vw, 60vw' }) : `<span class="display" aria-hidden="true">${esc(initials(featured.name))}</span>`}</div>
      <div class="inf-feat__body">
        <p class="mono inf-feat__label">Онцлох бүтээгч · ${esc(catNames(featured).join(' · ') || 'Influencer')}</p>
        <h3 class="display inf-feat__name">${esc(featured.name)}</h3>
        <p class="inf-card__meta mono">${metaLine(featured)}</p>
        <div class="inf-feat__actions"><button type="button" class="inf-link mono" data-inf-open="${attr(featured.id)}">Дэлгэрэнгүй</button>${pickBtn(featured, ' inf-pick--lg')}</div>
      </div>
    </article>` : ''}
    ${empty ? `<div class="inf__empty">
      <h3 class="display">${esc(s.emptyTitle)}</h3>
      <p>${esc(s.emptyText)}</p>
      <p><a class="btn-fill btn-fill--light" href="#contact" data-inf-close><span>Хамтран ажиллах</span><i class="dot" aria-hidden="true"></i></a></p>
    </div>` : `<div class="inf-rows">
      ${rows.filter((r) => r.people.length).map((r) => `<section class="inf-row" data-inf-row="${attr(r.id)}" aria-label="${attr(r.name)}">
        <div class="inf-row__head">
          <h3 class="inf-row__title">${esc(r.name)} <span class="mono" data-inf-row-count>${r.people.length}</span></h3>
          <div class="inf-row__nav">
            <button type="button" class="inf-row__btn" data-inf-row-prev aria-label="${attr(r.name)} — өмнөх"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
            <button type="button" class="inf-row__btn" data-inf-row-next aria-label="${attr(r.name)} — дараагийн"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
          </div>
        </div>
        <ul class="inf-row__track" role="list" data-inf-track>
      ${r.people.map(influencerCard).join('\n      ')}
        </ul>
      </section>`).join('\n      ')}
      <div class="inf__none" data-inf-none hidden><p class="display">Бүтээгч олдсонгүй.</p><p>Шүүлтүүр эсвэл хайлтаа өөрчлөөд дахин оролдоно уу.</p><button type="button" class="inf-link mono" data-inf-reset>Шүүлтүүр цэвэрлэх</button></div>
    </div>`}
  </div>
  ${empty ? '' : `<script type="application/json" data-inf-data>${JSON.stringify(Object.fromEntries(data)).replace(/</g, '\\u003c')}</script>
  ${list.map(influencerDetail).join('\n  ')}
  <div class="inf-bar" data-inf-bar hidden>
    <button type="button" class="inf-bar__review" data-inf-review aria-expanded="false" aria-controls="inf-bar-list"><span class="inf-bar__count" data-inf-count>0</span> <span>бүтээгч сонгосон</span> <span class="inf-bar__caret" aria-hidden="true">▴</span></button>
    <ul class="inf-bar__list" id="inf-bar-list" role="list" data-inf-picked-list hidden></ul>
    <button type="button" class="btn-fill btn-fill--light inf-bar__go" data-inf-inquire><span>Хүсэлт илгээх</span><i class="dot" aria-hidden="true"></i></button>
  </div>
  <div class="inf-sheet" data-inf-sheet="detail" role="dialog" aria-modal="true" aria-labelledby="inf-detail-title" hidden>
    <div class="inf-sheet__panel inf-detail"><button type="button" class="inf-sheet__x" data-inf-sheet-close aria-label="Хаах">✕</button><div class="inf-detail__inner" data-inf-detail-slot></div></div>
  </div>
  <div class="inf-sheet" data-inf-sheet="inquiry" role="dialog" aria-modal="true" aria-labelledby="inf-q-title" hidden>
    <div class="inf-sheet__panel inf-q">
      <button type="button" class="inf-sheet__x" data-inf-sheet-close aria-label="Хаах">✕</button>
      <p class="mono inf-q__label">Кампанит ажлын хүсэлт</p>
      <h3 class="display inf-q__title" id="inf-q-title">Request a campaign</h3>
      <form class="inf-q__form" action="/api/contact" method="post" novalidate data-inf-form>
        <div class="inf-q__picked"><p class="inf-q__lbl">Сонгосон бүтээгчид <b aria-hidden="true">*</b></p><ul class="form__picked-list" role="list" data-inf-form-picked></ul><p class="field__err" id="q-influencers-err" aria-live="polite"></p></div>
        <div class="form__row">
          <div class="field"><label for="q-name">Холбогдох хүний нэр <b aria-hidden="true">*</b></label><input id="q-name" name="name" type="text" autocomplete="name" required maxlength="120" aria-describedby="q-name-err"><p class="field__err" id="q-name-err" aria-live="polite"></p></div>
          <div class="field"><label for="q-company">Компани / байгууллага</label><input id="q-company" name="company" type="text" autocomplete="organization" maxlength="160"></div>
        </div>
        <div class="field"><label for="q-contact">Утас эсвэл имэйл <b aria-hidden="true">*</b></label><input id="q-contact" name="contact" type="text" autocomplete="email" inputmode="email" required maxlength="160" aria-describedby="q-contact-err"><p class="field__err" id="q-contact-err" aria-live="polite"></p></div>
        <div class="field"><label for="q-message">Кампанит ажлын зорилго, тайлбар <b aria-hidden="true">*</b></label><textarea id="q-message" name="message" rows="4" required minlength="10" maxlength="4000" aria-describedby="q-message-err"></textarea><p class="field__err" id="q-message-err" aria-live="polite"></p></div>
        <div class="form__row">
          <div class="field"><label for="q-start">Эхлэх огноо (заавал биш)</label><input id="q-start" name="campaignStart" type="date"></div>
          <div class="field"><label for="q-end">Дуусах огноо (заавал биш)</label><input id="q-end" name="campaignEnd" type="date" aria-describedby="q-campaignDates-err"><p class="field__err" id="q-campaignDates-err" aria-live="polite"></p></div>
        </div>
        <div class="field"><label for="q-notes">Нэмэлт тэмдэглэл (заавал биш)</label><textarea id="q-notes" name="notes" rows="2" maxlength="2000"></textarea></div>
        <div class="field field--check"><label class="check"><input type="checkbox" name="consent" value="yes" required aria-describedby="q-consent-err"><span>${esc(s.consentLabel || 'Ulaan Creative миний илгээсэн мэдээллийг зөвхөн энэ хүсэлтэд хариу өгөх зорилгоор хадгалж, ашиглахыг зөвшөөрч байна.')}</span></label><p class="field__err" id="q-consent-err" aria-live="polite"></p></div>
        <div class="hp" aria-hidden="true"><label for="q-website">Website</label><input id="q-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
        <div class="form__foot">
          <button class="btn-fill btn-fill--light inf-q__submit" type="submit"><span>Хүсэлт илгээх</span><i class="dot" aria-hidden="true"></i></button>
          <p class="form__status mono" role="status" aria-live="polite" data-inf-form-status></p>
        </div>
      </form>
    </div>
  </div>`}
</div>`;
}

function packages(p) {
  const theme = { light: 'pkg--starter', dark: 'pkg--growth', red: 'pkg--premium' };
  const cta = { light: '', dark: '', red: ' btn-fill--dark' };
  return `<section class="packages" id="packages" aria-labelledby="packages-title" data-cursor-theme="dark">
  <div class="container">
    <div class="packages__head">
      <p class="label mono" data-reveal>${esc(p.label)}</p>
      <h2 class="display packages__title" id="packages-title" data-split>${rich(p.title)}</h2>
      <p class="packages__intro" data-reveal>${esc(p.intro)}</p>
    </div>
    <div class="packages__grid packages__grid--${p.items.length}">
      ${p.items.map((k) => `<article class="pkg ${theme[k.theme] || theme.light}" data-reveal>
        <header class="pkg__head">
          <span class="mono">${esc(k.tier)}${k.badge ? ` <b class="pkg__badge">${esc(k.badge)}</b>` : ''}</span>
          <h3 class="display">${rich(k.name)}</h3>
          <p>${esc(k.tagline)}</p>
        </header>
        <p class="pkg__price display">${esc(k.price)}${k.priceSuffix ? ` <small>${esc(k.priceSuffix)}</small>` : ''}</p>
        <ul class="pkg__list">${k.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        <a class="btn-fill pkg__cta${cta[k.theme] || ''}" href="#contact" data-package="pkg:${attr(k.id)}" data-magnetic><span>${esc(k.ctaLabel || 'Багц сонгох')}</span><i class="dot" aria-hidden="true"></i></a>
      </article>`).join('\n      ')}
    </div>
    ${p.note ? `<p class="packages__note" data-reveal>${esc(p.note)}</p>` : ''}
  </div>
</section>`;
}

function about(a) {
  return `<section class="about" id="about" aria-labelledby="about-title" data-cursor-theme="light">
  <div class="about__pin" data-about-pin>
    <div class="container">
      <p class="label mono">${esc(a.label)}</p>
      <h2 class="sr-only" id="about-title">Бидний тухай</h2>
      <p class="about__manifesto display" data-manifesto>${rich(a.manifesto, 'em')}</p>
    </div>
  </div>
  <div class="container about__grid">
    <div class="about__copy">
      <h3 class="display" data-split>${rich(a.title)}</h3>
      ${a.paragraphs.map((p) => `<p data-reveal>${esc(p)}</p>`).join('\n      ')}
      ${a.process.length ? `<ol class="process mono" role="list">${a.process.map((s, i) => `<li data-reveal><span>${String(i + 1).padStart(2, '0')}</span>${esc(s.en)}<em>${esc(s.mn)}</em></li>`).join('')}</ol>` : ''}
    </div>
  </div>
</section>`;
}

function faq(f) {
  const items = f.items.filter((i) => i.q && i.a);
  if (!items.length) return '';
  return `<section class="faq" id="faq" aria-labelledby="faq-title">
  <div class="container faq__grid">
    <div><p class="label mono" data-reveal>${esc(f.label)}</p><h2 class="display faq__title" id="faq-title" data-split>${rich(f.title)}</h2></div>
    <div class="faq__list">${items.map((i) => `<details class="faq__item" data-reveal><summary>${esc(i.q)}<span aria-hidden="true">+</span></summary><p>${esc(i.a).replace(/\n/g, '<br>')}</p></details>`).join('')}</div>
  </div>
</section>`;
}

export function serviceOptions(content) {
  const fixed = SERVICE_OPTIONS.filter(([v]) => !['starter', 'growth', 'premium', 'other'].includes(v));
  const pkgs = content.packages.items.map((k) => [`pkg:${k.id}`, `Багц — ${plain(k.name)}`]);
  return [...fixed, ...pkgs, ['other', 'Бусад']];
}

function contact(c, content) {
  const d = content.contact_details;
  const details = [['Email', d.email && `<a href="mailto:${attr(d.email)}">${esc(d.email)}</a>`], ['Phone', d.phone && `<a href="tel:${attr(d.phone.replace(/[^\d+]/g, ''))}">${esc(d.phone)}</a>`], ['Studio', d.address && esc(d.address)]].filter(([, v]) => v);
  return `<section class="contact" id="contact" aria-labelledby="contact-title" data-cursor-theme="light">
  <div class="container contact__grid">
    <div class="contact__intro">
      <p class="label mono" data-reveal>${esc(c.label)}</p>
      <h2 class="display contact__title" id="contact-title" data-split>${rich(c.title)}</h2>
      <p data-reveal>${esc(c.copy)}</p>
      ${details.length ? `<ul class="contact__details mono" role="list" data-reveal>${details.map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join('')}</ul>` : ''}
    </div>
    <form class="form" action="/api/contact" method="post" novalidate data-contact-form data-success="${attr(c.successMessage)}">
      <div class="form__row">
        <div class="field"><label for="f-name">Нэр <b aria-hidden="true">*</b></label><input id="f-name" name="name" type="text" autocomplete="name" required maxlength="120" aria-describedby="f-name-err"><p class="field__err" id="f-name-err" aria-live="polite"></p></div>
        <div class="field"><label for="f-company">Компани / брэнд</label><input id="f-company" name="company" type="text" autocomplete="organization" maxlength="160"></div>
      </div>
      <div class="field"><label for="f-contact">Имэйл эсвэл утас <b aria-hidden="true">*</b></label><input id="f-contact" name="contact" type="text" autocomplete="email" inputmode="email" required maxlength="160" aria-describedby="f-contact-err"><p class="field__err" id="f-contact-err" aria-live="polite"></p></div>
      <div class="form__row">
        <div class="field"><label for="f-service">Үйлчилгээ <b aria-hidden="true">*</b></label><div class="select"><select id="f-service" name="service" required aria-describedby="f-service-err"><option value="">Сонгоно уу</option>${serviceOptions(content).map(([v, l]) => `<option value="${attr(v)}">${esc(l)}</option>`).join('')}</select></div><p class="field__err" id="f-service-err" aria-live="polite"></p></div>
        <div class="field"><label for="f-budget">Төсөв</label><div class="select"><select id="f-budget" name="budget"><option value="">Сонгоно уу</option>${BUDGET_OPTIONS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div></div>
      </div>
      <div class="field"><label for="f-message">Төслийн товч мэдээлэл <b aria-hidden="true">*</b></label><textarea id="f-message" name="message" rows="4" required minlength="10" maxlength="4000" aria-describedby="f-message-err"></textarea><p class="field__err" id="f-message-err" aria-live="polite"></p></div>
      <div class="field field--check"><label class="check"><input type="checkbox" name="consent" value="yes" required aria-describedby="f-consent-err"><span>${esc(c.consentLabel)}</span></label><p class="field__err" id="f-consent-err" aria-live="polite"></p></div>
      <p class="form__privacy">${esc(c.privacyNotice)}</p>
      <div class="hp" aria-hidden="true"><label for="f-website">Website</label><input id="f-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
      <input type="hidden" name="ts" value="" data-form-ts>
      <div class="form__foot">
        <button class="btn-pill btn-pill--dark form__submit" type="submit" data-magnetic><span class="btn-pill__text">Хүсэлт илгээх</span><span class="btn-pill__icon" aria-hidden="true">${ARROW}</span></button>
        <p class="form__status mono" role="status" aria-live="polite" data-form-status></p>
      </div>
    </form>
  </div>
</section>`;
}

/* ------------------------------ pages ------------------------------ */

function ogImageUrl(content, site, ogMedia) {
  return ogMedia?.url ? (ogMedia.url.startsWith('http') ? ogMedia.url : site + ogMedia.url) : `${site}/assets/img/og.jpg`;
}


export function renderHome({ content, projects, influencers, influencerCategories = [], site, nonce, ogMedia, preview, mediaMap = {} }) {
  const c = content;
  const hasInfluencers = influencers.length > 0;
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Ulaan Creative', url: site + '/', logo: `${site}/assets/img/ulaan-logo-light.png` };
  const sameAs = ['instagram', 'facebook', 'tiktok', 'youtube'].map((k) => c.contact_details[k]).filter((u) => /^https:\/\//.test(u || ''));
  if (sameAs.length) jsonLd.sameAs = sameAs;
  if (c.contact_details.email) jsonLd.email = c.contact_details.email;
  return `${head({ title: c.seo.title, description: c.seo.description, canonical: site + '/', ogTitle: c.seo.ogTitle, ogDescription: c.seo.ogDescription, ogImage: ogImageUrl(c, site, ogMedia), nonce, noindex: Boolean(preview), jsonLd })}
<body>
<a class="skip-link" href="#main">Үндсэн агуулга руу шилжих</a>
${previewBar(preview)}
<div class="loader" aria-hidden="true"><div class="loader__inner"><img class="loader__logo" src="/assets/img/ulaan-logo-on-red.webp" width="640" height="252" alt=""><span class="loader__count"><span data-loader-count>000</span>%</span></div><div class="loader__bar"><span></span></div></div>
<div class="cursor" aria-hidden="true"><span class="cursor__label"></span></div>
${nav({ hasInfluencers })}
<main id="main">
${hero(c.hero)}
${marquee(c.marquee)}
${intro(c.intro)}
${services(c.services, mediaMap)}
${work(c.work, projects)}
${packages(c.packages)}
${about(c.about)}
${faq(c.faq)}
${contact(c.contact, c)}
</main>
${influencersPanel({ ...c.influencers, consentLabel: c.contact.consentLabel }, influencers, influencerCategories)}
${footer(c, { hasInfluencers })}
${scripts(nonce)}
</body>
</html>`;
}

export function renderProject({ project: p, content, projects, site, nonce, preview }) {
  const c = content;
  const idx = projects.findIndex((x) => x.id === p.id);
  const next = projects.length > 1 ? projects[(idx + 1) % projects.length] : null;
  const embed = p.videoUrl ? embedFor(p.videoUrl) : '';
  const title = p.seoTitle || `${p.title} — Ulaan Creative`;
  const desc = p.seoDescription || plain(p.description).slice(0, 160) || c.seo.description;
  const og = p.cover?.url || p.video?.thumbUrl;
  const meta = [p.category && ['Category', p.category], p.client && ['Client', p.client], p.date && ['Date', p.date]].filter(Boolean);
  return `${head({ title, description: desc, canonical: `${site}/work/${p.slug}`, ogImage: og ? (og.startsWith('http') ? og : site + og) : `${site}/assets/img/og.jpg`, nonce, noindex: Boolean(preview) })}
<body class="page-project">
<a class="skip-link" href="#main">Үндсэн агуулга руу шилжих</a>
${previewBar(preview)}
<div class="cursor" aria-hidden="true"><span class="cursor__label"></span></div>
${nav({ hasInfluencers: false, base: '/' })}
<main id="main" class="project">
  <header class="project__head container">
    <a class="project__back mono link-line" href="/#work">← Бүх төслүүд</a>
    <h1 class="display project__title" data-split>${esc(p.title)}</h1>
    ${meta.length ? `<dl class="project__meta mono">${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
  </header>
  ${p.cover ? `<figure class="project__cover container" data-reveal-media>${mediaImg(p.cover, { alt: p.cover.alt || p.title, eager: true })}</figure>` : ''}
  <div class="project__body container">
    ${p.description ? `<div class="project__desc">${esc(p.description).split(/\n{2,}/).map((para) => `<p data-reveal>${para.replace(/\n/g, '<br>')}</p>`).join('')}</div>` : ''}
    ${p.externalUrl ? `<p><a class="btn-fill btn-fill--dark" href="${attr(p.externalUrl)}" target="_blank" rel="noopener"><span>Төслийг үзэх ↗</span><i class="dot" aria-hidden="true"></i></a></p>` : ''}
  </div>
  ${p.video ? `<div class="project__video container" data-reveal>${videoTag(p.video, p.video.thumbUrl, p.title)}</div>`
    : embed ? `<div class="project__video container" data-reveal><div class="embed"><iframe src="${attr(embed)}" title="${attr(p.title)} — video" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div></div>` : ''}
  ${p.gallery.length ? `<div class="project__gallery container">${p.gallery.map((m) => `<figure data-reveal-media>${m.kind === 'video' ? videoTag(m, m.thumbUrl, m.alt || p.title) : mediaImg(m, { alt: m.alt || p.title, sizes: '(max-width: 900px) 100vw, 50vw' })}</figure>`).join('')}</div>` : ''}
  ${next && next.id !== p.id ? `<a class="project__next container" href="/work/${attr(next.slug)}"><span class="mono">Дараагийн төсөл</span><span class="display">${esc(next.title)} →</span></a>` : ''}
</main>
${footer(c, { hasInfluencers: false, base: '/' })}
${scripts(nonce)}
</body>
</html>`;
}

export function renderNotFound({ content, site, nonce }) {
  return `${head({ title: 'Хуудас олдсонгүй — Ulaan Creative', description: content.seo.description, canonical: site + '/', ogImage: `${site}/assets/img/og.jpg`, nonce, noindex: true })}
<body class="page-404">
<main id="main" class="notfound">
  <div class="notfound__art" aria-hidden="true"><img class="bomb" src="/assets/img/ulaan-bomb.webp" srcset="/assets/img/ulaan-bomb-sm.webp 480w, /assets/img/ulaan-bomb.webp 959w" width="959" height="1492" decoding="async" sizes="360px" alt=""></div>
  <div><p class="mono">Error 404</p><h1 class="display">Хуудас<br>олдсонгүй.</h1><p><a class="btn-fill btn-fill--dark" href="/"><span>Нүүр хуудас руу</span><i class="dot" aria-hidden="true"></i></a></p></div>
</main>
</body>
</html>`;
}

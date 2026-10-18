// Server-side rendering of the public website from CMS data.
// Markup/classes follow the original design (public/assets/css/styles.css).
import { esc } from './http.js';
import { mascotSVG } from './mascot.js';
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
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Oswald:wght@700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/styles.css">
${jsonLd ? `<script type="application/ld+json" nonce="${nonce}">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>`;
}

function nav({ hasInfluencers, base = '' }) {
  const links = [['work', 'Work'], ['services', 'Services'], hasInfluencers && ['influencers', 'Influencers'], ['packages', 'Packages'], ['about', 'About'], ['contact', 'Contact']].filter(Boolean);
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
  const links = [['work', 'Work'], ['services', 'Services'], hasInfluencers && ['influencers', 'Influencers'], ['packages', 'Packages'], ['about', 'About'], ['contact', 'Contact']].filter(Boolean);
  return `<footer class="footer" data-cursor-theme="light">
  <div class="container footer__top">
    <div class="footer__col">
      <img class="footer__logo" src="/assets/img/ulaan-logo-light.webp" width="640" height="252" alt="Ulaan Creative" loading="lazy">
      <p class="footer__tag">${rich(c.footer.tagline)}</p>
    </div>
    <nav class="footer__col" aria-label="Footer цэс">
      <p class="label mono">Navigate</p>
      ${links.map(([id, l]) => `<a class="link-line" href="${base}#${id}">${l}</a>`).join('\n      ')}
    </nav>
    ${contactItems.length ? `<div class="footer__col"><p class="label mono">Contact</p>${contactItems.join('')}</div>` : ''}
    ${socials.length ? `<div class="footer__col"><p class="label mono">Social</p>${socials.join('')}</div>` : ''}
  </div>
  <div class="footer__word display" aria-hidden="true" data-footer-word>
    <span>U</span><span>L</span><span>A</span><span>A</span><span>N</span>
  </div>
  <div class="container footer__bottom mono">
    <span>© <span data-year>${new Date().getFullYear()}</span> Ulaan Creative. Бүх эрх хуулиар хамгаалагдсан.</span>
    <span class="footer__clock" data-clock aria-label="Улаанбаатарын цаг"></span>
    <a href="${base || ''}#top" class="link-line">Back to top ↑</a>
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
    <div class="hero__mascot-float" data-hero-float>${mascotSVG({ id: 'hero-m', title: 'Ulaan Creative-ийн дүр — улаан бөмбөг Улаан', className: 'mascot--hero' })}</div>
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

const VISUALS = {
  ai: `<div class="svc__visual vis-ai" aria-hidden="true"><div class="vis-ai__grid" data-ai-grid></div><div class="vis-ai__prompt mono"><span class="vis-ai__tag">PROMPT</span><p data-ai-type>/product hero shot, red studio light, cinematic</p><div class="vis-ai__progress"><span></span></div><span class="vis-ai__status" data-ai-status>GENERATING · 00%</span></div></div>`,
  influencer: `<div class="svc__visual vis-inf" aria-hidden="true"><div class="vis-inf__ring r1"><i></i><i></i><i></i></div><div class="vis-inf__ring r2"><i></i><i></i><i></i><i></i></div><div class="vis-inf__ring r3"><i></i><i></i><i></i><i></i><i></i></div><div class="vis-inf__core display">BRAND</div><span class="vis-inf__chip mono c1">reels</span><span class="vis-inf__chip mono c2">tiktok</span><span class="vis-inf__chip mono c3">stories</span></div>`,
  video: `<div class="svc__visual vis-vid" aria-hidden="true"><div class="vis-vid__frame"><span class="c tl"></span><span class="c tr"></span><span class="c bl"></span><span class="c br"></span><span class="vis-vid__rec mono"><i></i>REC</span><span class="vis-vid__tc mono" data-timecode>00:00:00:00</span><span class="vis-vid__meta mono">9:16 · 4K · 25FPS</span><span class="vis-vid__cross"></span><span class="vis-vid__word display">ACTION</span></div></div>`,
  calendar: `<div class="svc__visual vis-cal" aria-hidden="true"><div class="vis-cal__head mono"><span>CONTENT CALENDAR</span><span>WK 01—04</span></div><div class="vis-cal__days mono"><span>Да</span><span>Мя</span><span>Лх</span><span>Пү</span><span>Ба</span><span>Бя</span><span>Ня</span></div><div class="vis-cal__grid" data-cal-grid></div><div class="vis-cal__legend mono"><span><i class="k1"></i>REEL</span><span><i class="k2"></i>POST</span><span><i class="k3"></i>STORY</span></div></div>`,
};
const SVC_THEME = { ai: ['svc--ai', 'dark'], influencer: ['svc--inf', 'light'], video: ['svc--vid', 'dark'], calendar: ['svc--brand', 'light'] };

function services(s) {
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
        ${VISUALS[it.visual] || VISUALS.ai}
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
    ${items.length ? `<div class="work__grid">${items.join('\n      ')}</div>` : `<div class="work__empty" data-reveal>
      <div class="work__empty-art" aria-hidden="true">${mascotSVG({ id: 'work-m', expression: 'focused', shadow: false })}</div>
      <div><h3 class="display">${esc(w.emptyTitle)}</h3><p>${esc(w.emptyText)}</p>
      <a class="btn-fill btn-fill--dark" href="#contact" data-magnetic><span>Төслөө ярилцах</span><i class="dot" aria-hidden="true"></i></a></div>
    </div>`}
  </div>
</section>`;
}

function creators(s, list) {
  if (!list.length) return '';
  const card = (p) => {
    const links = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube']].filter(([k]) => p[k]);
    const data = [p.followers != null && ['Followers', fmtFollowers(p.followers)], p.engagement && ['Engagement', p.engagement]].filter(Boolean);
    return `<li class="creator">
      <div class="creator__portrait">${p.photo ? mediaImg(p.photo, { alt: p.photo.alt || p.name, sizes: '340px' }) : `<span class="display" aria-hidden="true">${esc(initials(p.name))}</span>`}</div>
      <div class="creator__body">
        ${p.category ? `<p class="creator__cat mono">${esc(p.category)}</p>` : ''}
        <h3 class="creator__name">${esc(p.name)}</h3>
        ${p.bio ? `<p class="creator__bio">${esc(p.bio)}</p>` : ''}
        ${data.length ? `<dl class="creator__data mono">${data.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
        ${links.length ? `<p class="creator__links">${links.map(([k, l]) => `<a class="creator__link mono" href="${attr(p[k])}" target="_blank" rel="noopener">${l} ↗</a>`).join('')}</p>` : ''}
      </div>
    </li>`;
  };
  return `<section class="creators" id="influencers" aria-labelledby="creators-title" data-cursor-theme="light">
  <div class="container creators__head">
    <div>
      <p class="label mono" data-reveal>${esc(s.label)}</p>
      <h2 class="display creators__title" id="creators-title" data-split>${rich(s.title)}</h2>
    </div>
    <div class="creators__side">
      <p data-reveal>${esc(s.intro)}</p>
      <div class="creators__controls" data-reveal>
        <button type="button" class="round-btn" data-creators-prev aria-label="Өмнөх" aria-controls="creator-track"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
        <button type="button" class="round-btn" data-creators-next aria-label="Дараагийн" aria-controls="creator-track"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></button>
        <div class="creators__progress" aria-hidden="true"><span data-creators-progress></span></div>
      </div>
    </div>
  </div>
  <ul class="creators__track" id="creator-track" role="list" tabindex="0" aria-label="Creator-уудын жагсаалт (хэвтээ гүйлгэх)" data-creators-track data-lenis-prevent>
    ${list.map(card).join('\n    ')}
  </ul>
</section>`;
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
    <figure class="about__figure" data-reveal-media>
      <div class="about__mascot" data-parallax-img>${mascotSVG({ id: 'about-m', expression: 'happy', shadow: true })}</div>
      <figcaption class="mono">Fig. 01 — Ulaan, the idea bomb</figcaption>
    </figure>
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

export function renderHome({ content, projects, influencers, site, nonce, ogMedia, preview }) {
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
${services(c.services)}
${work(c.work, projects)}
${creators(c.influencers, influencers)}
${packages(c.packages)}
${about(c.about)}
${faq(c.faq)}
${contact(c.contact, c)}
</main>
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
  <div class="notfound__art" aria-hidden="true">${mascotSVG({ id: 'nf-m', expression: 'surprised' })}</div>
  <div><p class="mono">Error 404</p><h1 class="display">Хуудас<br>олдсонгүй.</h1><p><a class="btn-fill btn-fill--dark" href="/"><span>Нүүр хуудас руу</span><i class="dot" aria-hidden="true"></i></a></p></div>
</main>
</body>
</html>`;
}

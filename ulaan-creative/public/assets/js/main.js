/* =========================================================
   ULAAN CREATIVE — interactions & motion
   GSAP + ScrollTrigger (+ Lenis on desktop). Everything degrades
   to a fully readable static page without JS or with reduced motion.
   ========================================================= */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isDesktop = () => window.matchMedia('(min-width: 901px)').matches;
  const motion = hasGsap && !reduceMotion;

  if (!motion) root.classList.remove('motion-ok', 'is-loading');
  window.__ucReady = true;

  const { gsap, ScrollTrigger } = window;
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  /* ---------------- Smooth scroll ---------------- */
  let lenis = null;
  if (motion && finePointer && typeof window.Lenis !== 'undefined') {
    lenis = new window.Lenis({ lerp: 0.11, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const scrollToTarget = (target) => {
    if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.4 });
    else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    // Move focus for keyboard / screen reader users without jumping the page.
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  };

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    if (id === '#influencers' && inf) { e.preventDefault(); closeMenu(); openInf(); return; }
    const target = document.getElementById(id.slice(1));
    if (!target) return;
    e.preventDefault();
    closeMenu();
    scrollToTarget(target);
    history.replaceState(null, '', id === '#top' ? location.pathname : id);
  });

  /* ---------------- Navigation ---------------- */
  const nav = $('[data-nav]');
  const hero = $('.hero');
  let lastY = window.scrollY;
  const onScrollNav = () => {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 40);
    const pastHero = y > (hero ? hero.offsetHeight * 0.6 : 400);
    const menuOpen = toggle && toggle.getAttribute('aria-expanded') === 'true';
    nav.classList.toggle('is-hidden', pastHero && y > lastY + 2 && !menuOpen);
    if (y < lastY - 2) nav.classList.remove('is-hidden');
    lastY = y;
  };
  window.addEventListener('scroll', onScrollNav, { passive: true });
  nav.addEventListener('focusin', () => nav.classList.remove('is-hidden'));

  // Active section indicator
  const navLinks = $$('.nav__links a');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        navLinks.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === '#' + en.target.id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['work', 'services', 'influencers', 'packages', 'about', 'contact'].forEach((id) => {
      const el = document.getElementById(id); if (el) io.observe(el);
    });
  }

  /* ---------------- Mobile menu ---------------- */
  const toggle = $('[data-menu-toggle]');
  const menu = $('[data-menu]');
  function openMenu() {
    menu.hidden = false;
    requestAnimationFrame(() => menu.classList.add('is-open'));
    toggle.setAttribute('aria-expanded', 'true');
    toggle.querySelector('.sr-only').textContent = 'Цэс хаах';
    document.body.style.overflow = 'hidden';
    if (lenis) lenis.stop();
    const first = menu.querySelector('a'); if (first) setTimeout(() => first.focus(), 50);
  }
  function closeMenu() {
    if (!toggle || toggle.getAttribute('aria-expanded') !== 'true') return;
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.querySelector('.sr-only').textContent = 'Цэс нээх';
    document.body.style.overflow = '';
    if (lenis) lenis.start();
    setTimeout(() => { if (!menu.classList.contains('is-open')) menu.hidden = true; }, reduceMotion ? 0 : 700);
  }
  toggle.addEventListener('click', () => (toggle.getAttribute('aria-expanded') === 'true' ? (closeMenu(), toggle.focus()) : openMenu()));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { closeMenu(); toggle.focus(); } });
  window.addEventListener('resize', () => { if (window.innerWidth > 1080) closeMenu(); });

  /* ---------------- Buttons: directional fill + magnetic ---------------- */
  $$('.btn-fill, .btn-pill').forEach((btn) => {
    const setPos = (e) => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty('--x', `${e.clientX - r.left}px`);
      btn.style.setProperty('--y', `${e.clientY - r.top}px`);
    };
    btn.addEventListener('pointerenter', setPos);
    btn.addEventListener('pointerleave', setPos);
  });

  if (motion && finePointer) {
    $$('[data-magnetic]').forEach((el) => {
      const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.28);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.38);
      });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  /* ---------------- Cursor bubble ---------------- */
  const cursor = $('.cursor');
  if (finePointer && cursor) {
    const label = $('.cursor__label', cursor);
    let cx = 0, cy = 0;
    const moveCursor = hasGsap
      ? (() => { const xs = gsap.quickTo(cursor, 'x', { duration: 0.45, ease: 'power3' }); const ys = gsap.quickTo(cursor, 'y', { duration: 0.45, ease: 'power3' }); return (x, y) => { xs(x); ys(y); }; })()
      : (x, y) => { cursor.style.translate = `${x}px ${y}px`; };
    window.addEventListener('pointermove', (e) => { cx = e.clientX; cy = e.clientY; moveCursor(cx, cy); }, { passive: true });
    const bind = (el, text, dark) => {
      el.addEventListener('pointerenter', () => { label.textContent = text; cursor.classList.toggle('is-dark', !!dark); cursor.classList.add('is-active'); });
      el.addEventListener('pointerleave', () => cursor.classList.remove('is-active'));
    };
    $$('[data-cursor]').forEach((el) => bind(el, el.dataset.cursor));
  }

  /* ---------------- Text splitting ---------------- */
  function splitWords(el) {
    if (el.dataset.splitDone) return $$('.split-word', el);
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const parts = child.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
            const mask = document.createElement('span');
            mask.className = 'split-line';
            mask.style.display = 'inline-block';
            mask.setAttribute('aria-hidden', 'true');
            const w = document.createElement('span');
            w.className = 'split-word';
            w.textContent = p;
            mask.appendChild(w);
            frag.appendChild(mask);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(el);
    el.dataset.splitDone = '1';
    return $$('.split-word', el);
  }

  /* ---------------- Showcase: one video plays at a time ---------------- */
  const showVideos = $$('.vis-show video');
  showVideos.forEach((v) => v.addEventListener('play', () => showVideos.forEach((o) => { if (o !== v) o.pause(); })));

  /* ---------------- Visual: timecode ---------------- */
  const tc = $('[data-timecode]');
  let tcTimer = null, tcFrames = 0;
  const tcStart = () => {
    if (!tc || tcTimer || reduceMotion) return;
    tcTimer = setInterval(() => {
      tcFrames += 1;
      const f = tcFrames % 25, s = Math.floor(tcFrames / 25) % 60, m = Math.floor(tcFrames / 1500) % 60;
      tc.textContent = `00:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
    }, 40);
  };
  const tcStop = () => { clearInterval(tcTimer); tcTimer = null; };

  // Run the timecode only while the camera visual is on screen.
  if ('IntersectionObserver' in window) {
    const vio = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? tcStart() : tcStop()));
    }, { threshold: 0.25 });
    $$('.vis-vid').forEach((el) => vio.observe(el));
  }

  /* ---------------- Influencers: rows, search/filter, multi-select → campaign inquiry ---------------- */
  const inf = $('[data-inf]');
  let infLastFocus = null;
  function openInf() {
    if (!inf) return;
    infLastFocus = document.activeElement;
    inf.classList.add('is-open');
    document.documentElement.classList.add('inf-open');
    if (lenis) lenis.stop();
    if (history.replaceState) history.replaceState(null, '', '#influencers');
    $$('[data-inf-track]', inf).forEach((t) => { updateRowNav(t); if (inf._pages) inf._pages(t); });
    setTimeout(() => { const c = $('.inf__close', inf); if (c) c.focus({ preventScroll: true }); }, 30);
  }
  function closeInf(toHash) {
    if (!inf || !inf.classList.contains('is-open')) return;
    inf.classList.remove('is-open');
    document.documentElement.classList.remove('inf-open');
    if (lenis) lenis.start();
    if (history.replaceState) history.replaceState(null, '', toHash || location.pathname);
    if (infLastFocus && infLastFocus.focus) infLastFocus.focus({ preventScroll: true });
  }
  function updateRowNav(track) {
    const row = track.closest('.inf-row');
    const prev = $('[data-inf-row-prev]', row), next = $('[data-inf-row-next]', row);
    const max = track.scrollWidth - track.clientWidth;
    if (prev) prev.disabled = track.scrollLeft <= 4;
    if (next) next.disabled = track.scrollLeft >= max - 4;
  }

  if (inf) {
    const dataEl = $('[data-inf-data]', inf);
    const people = dataEl ? JSON.parse(dataEl.textContent) : {};
    const nameOf = (id) => (people[id] ? people[id].name : '');

    /* --- selection (kept while browsing; survives reloads in this tab) --- */
    const KEY = 'uc-inf-picked';
    let saved = [];
    try { saved = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { saved = []; }
    const picked = new Set((Array.isArray(saved) ? saved : []).filter((id) => people[id]));
    const bar = $('[data-inf-bar]', inf);
    const chip = (id) => { const li = document.createElement('li'); li.textContent = nameOf(id); const x = document.createElement('button'); x.type = 'button'; x.dataset.infUnpick = id; x.setAttribute('aria-label', `${nameOf(id)} — хасах`); x.textContent = '✕'; li.appendChild(x); return li; };
    function syncPicked() {
      try { sessionStorage.setItem(KEY, JSON.stringify([...picked])); } catch (e) { /* private mode */ }
      $$('[data-inf-pick]', inf).forEach((b) => b.setAttribute('aria-pressed', String(picked.has(b.dataset.infPick))));
      $$('[data-inf-item]', inf).forEach((c) => c.classList.toggle('is-picked', picked.has(c.dataset.infItem)));
      if (bar) {
        bar.hidden = picked.size === 0;
        $('[data-inf-count]', bar).textContent = String(picked.size);
        $('[data-inf-picked-list]', bar).replaceChildren(...[...picked].map(chip));
        if (!picked.size) { $('[data-inf-picked-list]', bar).hidden = true; $('[data-inf-review]', bar).setAttribute('aria-expanded', 'false'); }
      }
      const formList = $('[data-inf-form-picked]', inf);
      if (formList) formList.replaceChildren(...[...picked].map(chip));
    }

    /* --- sheets (details, inquiry) --- */
    let sheetReturn = null;
    const openSheet = (name, from) => {
      const sheet = $(`[data-inf-sheet="${name}"]`, inf);
      sheetReturn = from || document.activeElement;
      sheet.hidden = false;
      setTimeout(() => $('[data-inf-sheet-close]', sheet).focus(), 30);
    };
    const openSheetEl = () => $$('[data-inf-sheet]', inf).find((x) => !x.hidden);
    const closeSheet = () => {
      const open = openSheetEl();
      if (!open) return false;
      open.hidden = true;
      if (sheetReturn && sheetReturn.isConnected) sheetReturn.focus({ preventScroll: true });
      return true;
    };
    function openDetail(id, from) {
      const tpl = $(`template[data-inf-detail="${CSS.escape(id)}"]`, inf);
      if (!tpl) return;
      $('[data-inf-detail-slot]', inf).replaceChildren(tpl.content.cloneNode(true));
      syncPicked();
      openSheet('detail', from);
    }

    /* --- search + filter --- */
    const form = $('[data-inf-filter-form]', inf);
    const panel = $('[data-inf-filter]', inf);
    const toggleBtn = $('[data-inf-filter-toggle]', inf);
    const search = $('[data-inf-search]', inf);
    const RANGES = { all: [0, Infinity], '1k-10k': [1e3, 1e4], '10k-50k': [1e4, 5e4], '50k-100k': [5e4, 1e5], '100k-500k': [1e5, 5e5], '500k+': [5e5, Infinity] };
    const state = { q: '', cats: new Set(), followers: 'all', sort: 'recommended' };
    const readForm = () => {
      if (!form) return;
      state.cats = new Set($$('input[name="cat"]:checked', form).map((i) => i.value).filter((v) => v !== 'all'));
      state.followers = (form.querySelector('input[name="followers"]:checked') || {}).value || 'all';
      state.sort = form.elements.sort.value;
    };
    const filterActive = () => state.cats.size > 0 || state.followers !== 'all' || state.sort !== 'recommended';
    function applyFilters() {
      const q = state.q.trim().toLowerCase();
      const [min, max] = RANGES[state.followers] || RANGES.all;
      const matches = (id) => {
        const d = people[id]; if (!d) return false;
        if (q && !d.n.includes(q)) return false;
        if (state.cats.size && !d.c.some((c) => state.cats.has(c))) return false;
        if (state.followers !== 'all' && (d.f == null || d.f < min || d.f >= max)) return false;
        return true;
      };
      const cmp = (a, b) => {
        const da = people[a.dataset.infItem], db = people[b.dataset.infItem];
        if (state.sort === 'recommended') return da.o - db.o;
        const fa = da.f == null ? -1 : da.f, fb = db.f == null ? -1 : db.f;
        if (fa === fb) return da.o - db.o;
        if (da.f == null) return 1; if (db.f == null) return -1; // unknown follower counts last
        return state.sort === 'followers-asc' ? fa - fb : fb - fa;
      };
      let shown = 0;
      $$('[data-inf-row]', inf).forEach((row) => {
        const track = $('[data-inf-track]', row);
        const cards = $$('.inf-card', track);
        const rowAllowed = !state.cats.size || state.cats.has(row.dataset.infRow);
        let visible = 0;
        cards.sort(cmp).forEach((c) => { track.appendChild(c); const ok = rowAllowed && matches(c.dataset.infItem); c.hidden = !ok; if (ok) visible++; });
        row.hidden = visible === 0;
        $('[data-inf-row-count]', row).textContent = String(visible);
        cancelAnimationFrame(track._raf);
        track.scrollLeft = 0;
        updateRowNav(track);
        updatePages(track);
        shown += visible;
      });
      const feat = $('[data-inf-featured]', inf);
      if (feat) feat.hidden = Boolean(q) || filterActive();
      const none = $('[data-inf-none]', inf); if (none) none.hidden = shown > 0;
      const badge = $('[data-inf-filter-count]', inf);
      if (badge) { const n = (state.cats.size ? 1 : 0) + (state.followers !== 'all' ? 1 : 0) + (state.sort !== 'recommended' ? 1 : 0); badge.hidden = !n; badge.textContent = String(n); }
    }
    const setFilterOpen = (open) => {
      if (!panel) return;
      panel.hidden = !open;
      toggleBtn.setAttribute('aria-expanded', String(open));
      if (open) { const first = panel.querySelector('input, select'); if (first) setTimeout(() => first.focus(), 30); }
    };
    if (toggleBtn) toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); setFilterOpen(panel.hidden); });
    if (form) {
      // "All" and specific categories are mutually exclusive
      form.addEventListener('change', (e) => {
        if (e.target.name !== 'cat') return;
        const all = $('[data-cat-all]', form);
        if (e.target === all && all.checked) $$('input[name="cat"]', form).forEach((i) => { if (i !== all) i.checked = false; });
        else if (e.target !== all && e.target.checked) all.checked = false;
        if (!$$('input[name="cat"]:checked', form).length) all.checked = true;
      });
      form.addEventListener('submit', (e) => { e.preventDefault(); readForm(); applyFilters(); setFilterOpen(false); toggleBtn.focus(); });
    }
    const resetAll = () => {
      if (form) { form.reset(); readForm(); }
      if (search) search.value = '';
      state.q = '';
      applyFilters();
    };
    let qTimer = null;
    if (search) search.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = search.value; applyFilters(); }, 120); });
    document.addEventListener('click', (e) => { if (panel && !panel.hidden && !panel.contains(e.target) && e.target !== toggleBtn) setFilterOpen(false); });

    /* --- rows: Netflix-style paging with eased scroll, mouse drag with momentum, page dashes --- */
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const cardStep = (track) => { const c = track.querySelector('.inf-card:not([hidden])'); if (!c) return track.clientWidth; const gap = parseFloat(getComputedStyle(track).columnGap) || 0; return c.offsetWidth + gap; };
    function glide(track, to, dur) {
      const max = track.scrollWidth - track.clientWidth;
      to = Math.max(0, Math.min(max, to));
      cancelAnimationFrame(track._raf);
      if (reduceMotion) { track.scrollLeft = to; return; }
      const from = track.scrollLeft, d = to - from;
      if (Math.abs(d) < 1) return;
      const ms = dur || Math.min(900, 420 + Math.abs(d) * 0.35);
      const t0 = performance.now();
      track.classList.add('is-animating');
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        track.scrollLeft = from + d * easeInOut(t);
        if (t < 1) track._raf = requestAnimationFrame(step);
        else track.classList.remove('is-animating');
      };
      track._raf = requestAnimationFrame(step);
    }
    // page = as many whole cards as fit; targets land on card edges like Netflix
    const page = (track, dir) => {
      const w = cardStep(track);
      const perPage = Math.max(1, Math.floor((track.clientWidth - 2 * parseFloat(getComputedStyle(track).paddingLeft)) / w));
      const idx = Math.round(track.scrollLeft / w) + dir * perPage;
      glide(track, idx * w);
    };
    function updatePages(track) {
      const row = track.closest('.inf-row'), box = $('[data-inf-pages]', row);
      if (!box) return;
      const max = track.scrollWidth - track.clientWidth;
      const n = max > 4 ? Math.ceil(track.scrollWidth / track.clientWidth) : 0;
      if (box.childElementCount !== n) box.replaceChildren(...Array.from({ length: n }, () => document.createElement('i')));
      const on = n ? Math.round((track.scrollLeft / max) * (n - 1)) : -1;
      [...box.children].forEach((el, i) => el.classList.toggle('is-on', i === on));
    }
    $$('[data-inf-track]', inf).forEach((track) => {
      const row = track.closest('.inf-row');
      $('[data-inf-row-prev]', row).addEventListener('click', () => page(track, -1));
      $('[data-inf-row-next]', row).addEventListener('click', () => page(track, 1));
      let ticking = false;
      track.addEventListener('scroll', () => {
        if (ticking) return; ticking = true;
        requestAnimationFrame(() => { ticking = false; updateRowNav(track); updatePages(track); });
      }, { passive: true });
      // mouse drag (touch already scrolls natively with momentum)
      let down = false, moved = false, startX = 0, startLeft = 0, lastX = 0, lastT = 0, vel = 0;
      track.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('[data-inf-pick]')) return;
        down = true; moved = false; startX = lastX = e.clientX; startLeft = track.scrollLeft; lastT = performance.now(); vel = 0;
        cancelAnimationFrame(track._raf);
      });
      window.addEventListener('pointermove', (e) => {
        if (!down) return;
        const dx = e.clientX - startX;
        if (!moved && Math.abs(dx) > 5) { moved = true; track.classList.add('is-dragging'); }
        if (!moved) return;
        track.scrollLeft = startLeft - dx;
        const now = performance.now();
        vel = 0.8 * ((lastX - e.clientX) / Math.max(1, now - lastT)) + 0.2 * vel;
        lastX = e.clientX; lastT = now;
      });
      const release = () => {
        if (!down) return;
        down = false;
        if (!moved) return;
        track.classList.remove('is-dragging');
        // momentum, then settle on the nearest card edge
        const w = cardStep(track);
        const target = Math.round((track.scrollLeft + vel * 260) / w) * w;
        glide(track, target, 650);
        const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        track.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => track.removeEventListener('click', swallow, { capture: true }), 0);
      };
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
      track.addEventListener('dragstart', (e) => e.preventDefault());
      // keyboard: arrow keys inside a row page through it
      track.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); page(track, e.key === 'ArrowRight' ? 1 : -1); }
      });
    });
    window.addEventListener('resize', () => $$('[data-inf-track]', inf).forEach((t) => { updateRowNav(t); updatePages(t); }));
    inf._pages = updatePages;

    /* --- one click handler for the panel --- */
    inf.addEventListener('click', (e) => {
      const t = e.target;
      const pick = t.closest('[data-inf-pick]');
      if (pick) { const id = pick.dataset.infPick; if (picked.has(id)) picked.delete(id); else picked.add(id); syncPicked(); return; }
      const un = t.closest('[data-inf-unpick]');
      if (un) { picked.delete(un.dataset.infUnpick); syncPicked(); return; }
      const open = t.closest('[data-inf-open]');
      if (open) { openDetail(open.dataset.infOpen, open); return; }
      if (t.closest('[data-inf-reset]')) { resetAll(); return; }
      if (t.closest('[data-inf-filter-close]')) { setFilterOpen(false); toggleBtn.focus(); return; }
      if (t.closest('[data-inf-sheet-close]') || t.matches('[data-inf-sheet]')) { closeSheet(); return; }
      const review = t.closest('[data-inf-review]');
      if (review) { const list = $('[data-inf-picked-list]', inf); list.hidden = !list.hidden; review.setAttribute('aria-expanded', String(!list.hidden)); return; }
      if (t.closest('[data-inf-inquire]')) { syncPicked(); openSheet('inquiry', t.closest('[data-inf-inquire]')); return; }
      const close = t.closest('[data-inf-close]');
      if (close) {
        const href = close.getAttribute('href');
        e.preventDefault(); e.stopPropagation();
        closeInf();
        if (href && href !== '#top') { const target = document.getElementById(href.slice(1)); if (target) scrollToTarget(target); }
      }
    });
    document.addEventListener('keydown', (e) => {
      if (!inf.classList.contains('is-open')) return;
      if (e.key === 'Escape') {
        if (closeSheet()) return;
        if (panel && !panel.hidden) { setFilterOpen(false); toggleBtn.focus(); return; }
        closeInf();
      } else if (e.key === 'Tab') { // keep focus inside the panel (or the open sheet)
        const scope = openSheetEl() || (panel && !panel.hidden && window.innerWidth <= 760 ? panel : inf);
        const f = $$('a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea', scope).filter((el) => el.offsetParent !== null && el.tabIndex >= 0);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });

    /* --- campaign inquiry (stored server-side; success shown only on a real OK) --- */
    const qForm = $('[data-inf-form]', inf);
    if (qForm) {
      const qStatus = $('[data-inf-form-status]', inf);
      const qSubmit = $('.inf-q__submit', qForm);
      const shownAt = { t: Date.now() };
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      const phoneRe = /^\+?[\d\s\-()]{8,20}$/;
      const rules = {
        name: (v) => (v.trim().length < 2 ? 'Нэрээ оруулна уу.' : ''),
        contact: (v) => { const t = v.trim(); if (!t) return 'Утас эсвэл имэйлээ оруулна уу.'; return emailRe.test(t) || (phoneRe.test(t) && t.replace(/\D/g, '').length >= 8) ? '' : 'Зөв утас эсвэл имэйл оруулна уу.'; },
        message: (v) => (v.trim().length < 10 ? 'Кампанит ажлын зорилгоо товч бичнэ үү (дор хаяж 10 тэмдэгт).' : ''),
        consent: (v, el) => (el.checked ? '' : 'Мэдээлэл хадгалахыг зөвшөөрнө үү.'),
        campaignEnd: (v) => { const s0 = qForm.elements.campaignStart.value; return s0 && v && v < s0 ? 'Дуусах огноо эхлэх огнооноос өмнө байж болохгүй.' : ''; },
      };
      const errId = (n) => (n === 'campaignEnd' ? 'q-campaignDates-err' : `q-${n}-err`);
      const check = (n) => { const el = qForm.elements[n]; const msg = rules[n](el.value, el); el.setAttribute('aria-invalid', msg ? 'true' : 'false'); const err = document.getElementById(errId(n)); if (err) err.textContent = msg; return !msg; };
      const say = (msg, type) => { qStatus.textContent = msg; qStatus.classList.toggle('is-success', type === 'success'); qStatus.classList.toggle('is-error', type === 'error'); };
      $$('[data-inf-inquire]', inf).forEach((b) => b.addEventListener('click', () => { shownAt.t = Date.now(); }));
      qForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ok = Object.keys(rules).map(check);
        const pickErr = document.getElementById('q-influencers-err');
        pickErr.textContent = picked.size ? '' : 'Дор хаяж нэг бүтээгч сонгоно уу.';
        if (ok.includes(false) || !picked.size) { say('Шаардлагатай талбаруудыг бөглөнө үү.', 'error'); const bad = Object.keys(rules).find((n) => qForm.elements[n].getAttribute('aria-invalid') === 'true'); if (bad) qForm.elements[bad].focus(); return; }
        const fd = Object.fromEntries(new FormData(qForm).entries());
        const body = { ...fd, service: 'influencer', kind: 'influencer', influencers: [...picked], ts: shownAt.t };
        qSubmit.disabled = true; say('Илгээж байна…', '');
        try {
          const res = await fetch(qForm.getAttribute('action'), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
          let r = {}; try { r = await res.json(); } catch (_) { /* not JSON */ }
          if (res.ok && r.ok) {
            say('Баярлалаа! Таны кампанит ажлын хүсэлтийг хүлээн авлаа. Бид удахгүй эргэн холбогдоно.', 'success');
            qForm.reset(); picked.clear(); syncPicked();
          } else if (r.error === 'not_configured') say('Хүсэлт хүлээн авах сервер одоогоор тохируулагдаагүй байна. Таны хүсэлт илгээгдсэнгүй.', 'error');
          else if (res.status === 429 || r.error === 'too_fast' || r.error === 'rate_limited') say('Түр хүлээгээд дахин оролдоно уу.', 'error');
          else if (r.error === 'invalid') { if (r.fields && r.fields.influencers) pickErr.textContent = 'Сонгосон бүтээгч олдсонгүй — жагсаалтаа шалгана уу.'; Object.keys(r.fields || {}).forEach((n) => { if (rules[n]) check(n); }); say('Мэдээллээ шалгаад дахин илгээнэ үү.', 'error'); }
          else say('Илгээх үед алдаа гарлаа. Таны хүсэлт илгээгдсэнгүй — дахин оролдоно уу.', 'error');
        } catch (err) {
          say('Сүлжээний алдаа гарлаа. Таны хүсэлт илгээгдсэнгүй — дахин оролдоно уу.', 'error');
        } finally { qSubmit.disabled = false; }
      });
    }

    syncPicked();
    if (form) readForm();
    if (location.hash === '#influencers') openInf();
  }

  /* ---------------- Package / CTA → contact form prefill ---------------- */
  const serviceSelect = $('#f-service');
  $$('[data-package]').forEach((a) => a.addEventListener('click', () => {
    if (serviceSelect) serviceSelect.value = a.dataset.package;
  }));

  /* ---------------- Footer details ---------------- */
  const year = $('[data-year]'); if (year) year.textContent = new Date().getFullYear();
  const clock = $('[data-clock]');
  const tick = () => {
    try {
      clock.textContent = 'UB ' + new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ulaanbaatar' }).format(new Date()) + ' (GMT+8)';
    } catch (e) { clock.textContent = ''; }
  };
  if (clock) { tick(); setInterval(tick, 30000); }

  /* ---------------- Contact form ---------------- */
  const form = $('[data-contact-form]');
  if (form) initForm(form);

  function initForm(form) {
    const status = $('[data-form-status]', form);
    const submit = $('.form__submit', form);
    const submitText = $('.btn-pill__text', submit);
    const ts = $('[data-form-ts]', form);
    ts.value = String(Date.now());

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const phoneRe = /^\+?[\d\s\-()]{8,20}$/;
    const rules = {
      name: (v) => (v.trim().length < 2 ? 'Нэрээ оруулна уу.' : ''),
      contact: (v) => {
        const t = v.trim();
        if (!t) return 'Имэйл эсвэл утасны дугаараа оруулна уу.';
        return emailRe.test(t) || (phoneRe.test(t) && t.replace(/\D/g, '').length >= 8) ? '' : 'Зөв имэйл эсвэл утасны дугаар оруулна уу.';
      },
      service: (v) => (!v ? 'Үйлчилгээ сонгоно уу.' : ''),
      message: (v) => (v.trim().length < 10 ? 'Төслийнхөө талаар товч бичнэ үү (дор хаяж 10 тэмдэгт).' : ''),
      consent: (v, el) => (el.checked ? '' : 'Мэдээлэл хадгалахыг зөвшөөрнө үү.'),
    };
    const check = (name) => {
      const input = form.elements[name];
      const msg = rules[name](input.value, input);
      const err = document.getElementById(`f-${name}-err`);
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (err) err.textContent = msg;
      return !msg;
    };
    Object.keys(rules).forEach((name) => {
      const input = form.elements[name];
      input.addEventListener('blur', () => { if (input.value) check(name); });
      input.addEventListener('input', () => { if (input.getAttribute('aria-invalid') === 'true') check(name); });
      input.addEventListener('change', () => { if (input.getAttribute('aria-invalid') === 'true') check(name); });
    });
    const setStatus = (msg, type) => {
      status.textContent = msg;
      status.classList.toggle('is-success', type === 'success');
      status.classList.toggle('is-error', type === 'error');
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const results = Object.keys(rules).map(check);
      if (results.includes(false)) {
        const firstBad = Object.keys(rules).find((n) => form.elements[n].getAttribute('aria-invalid') === 'true');
        if (firstBad) form.elements[firstBad].focus();
        setStatus('Шаардлагатай талбаруудыг бөглөнө үү.', 'error');
        return;
      }
      const data = Object.fromEntries(new FormData(form).entries());
      form.classList.add('is-loading');
      submit.disabled = true;
      submitText.textContent = 'Илгээж байна…';
      setStatus('', '');
      try {
        const res = await fetch(form.getAttribute('action'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data),
        });
        let body = {};
        try { body = await res.json(); } catch (_) { /* non-JSON response */ }
        if (res.ok && body.ok) {
          setStatus(form.dataset.success || 'Баярлалаа! Таны хүсэлтийг хүлээн авлаа.', 'success');
          form.reset();
          ts.value = String(Date.now());
          Object.keys(rules).forEach((n) => form.elements[n].removeAttribute('aria-invalid'));
        } else if (body.error === 'not_configured') {
          setStatus('Уучлаарай, хүсэлт илгээх үйлчилгээ одоогоор тохируулагдаагүй байна. Таны хүсэлт илгээгдсэнгүй.', 'error');
        } else if (res.status === 429 || body.error === 'too_fast') {
          setStatus('Түр хүлээгээд дахин оролдоно уу.', 'error');
        } else if (body.error === 'invalid' && body.fields) {
          Object.keys(body.fields).forEach((n) => { if (rules[n]) check(n); });
          setStatus('Мэдээллээ шалгаад дахин илгээнэ үү.', 'error');
        } else {
          setStatus('Илгээх үед алдаа гарлаа. Таны хүсэлт илгээгдсэнгүй — дахин оролдоно уу.', 'error');
        }
      } catch (err) {
        setStatus('Сүлжээний алдаа гарлаа. Таны хүсэлт илгээгдсэнгүй — дахин оролдоно уу.', 'error');
      } finally {
        form.classList.remove('is-loading');
        submit.disabled = false;
        submitText.textContent = 'Хүсэлт илгээх';
      }
    });
  }

  /* =========================================================
     MOTION (GSAP) — skipped entirely for reduced motion
     ========================================================= */
  if (!motion) return;

  const mm = gsap.matchMedia();

  /* ---------------- Loader + hero intro (home page only) ---------------- */
  const heroWords = $$('[data-hero-word]');
  const heroFades = $$('[data-hero-fade]');
  const mascotWrap = $('[data-hero-mascot]');
  const navItems = $$('.nav__inner > *');
  const svgLine = $('[data-hero-line]');
  const anchor = $('[data-hero-anchor]');
  const lineEl = svgLine && $('line', svgLine);
  const dotEl = svgLine && $('circle', svgLine);
  const heroEye = $('[data-eye-anchor]');
  let lineReady = false;

  function heroIntro() {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.to(navItems, { opacity: 1, duration: 1, stagger: 0.06 }, 0.35);
    if (!hero) return tl;
    tl.fromTo(mascotWrap, { opacity: 0, yPercent: 30, rotation: -4 }, { opacity: 1, yPercent: 0, rotation: 0, duration: 1.8 }, 0)
      .to(heroWords, { y: 0, duration: 1.3, stagger: 0.09 }, 0.1)
      .fromTo(heroFades, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 1.1, stagger: 0.08 }, 0.55)
      .add(() => { lineReady = true; drawLine(true); }, 0.9);
    return tl;
  }

  const loader = $('.loader');
  if (hero && root.classList.contains('is-loading') && loader) {
    const countEl = $('[data-loader-count]', loader);
    const bar = $('.loader__bar span', loader);
    const counter = { v: 0 };
    gsap.timeline()
      .to(counter, { v: 100, duration: 1.1, ease: 'power2.inOut', onUpdate: () => { countEl.textContent = String(Math.round(counter.v)).padStart(3, '0'); } }, 0)
      .to(bar, { scaleX: 1, duration: 1.1, ease: 'power2.inOut' }, 0)
      .to(loader, { yPercent: -100, duration: 0.9, ease: 'expo.inOut' }, 1.2)
      .add(() => heroIntro(), 1.45)
      .add(() => { root.classList.remove('is-loading'); try { sessionStorage.setItem('uc-loaded', '1'); } catch (e) { /* storage blocked */ } }, 2.1);
  } else {
    root.classList.remove('is-loading');
    heroIntro();
  }

  /* ---------------- Hero: dotted line from the CTA to the mascot's eye ---------------- */
  function drawLine(animate) {
    if (!hero || !svgLine || !anchor || !heroEye || !lineReady || getComputedStyle(svgLine).display === 'none') return;
    const hr = hero.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const er = heroEye.getBoundingClientRect();
    const x1 = ar.left + ar.width / 2 - hr.left, y1 = ar.top + ar.height / 2 - hr.top;
    const x2 = er.left + er.width / 2 - hr.left, y2 = er.top + er.height / 2 - hr.top;
    lineEl.setAttribute('x1', x1); lineEl.setAttribute('y1', y1);
    lineEl.setAttribute('x2', x2); lineEl.setAttribute('y2', y2);
    dotEl.setAttribute('cx', x2); dotEl.setAttribute('cy', y2);
    if (animate) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      gsap.fromTo(svgLine, { opacity: 0 }, { opacity: 1, duration: 0.4 });
      gsap.fromTo(lineEl, { attr: { 'stroke-dashoffset': len }, strokeDasharray: `${len} ${len}` },
        { attr: { 'stroke-dashoffset': 0 }, duration: 1.4, ease: 'expo.inOut', onComplete: () => { lineEl.style.strokeDasharray = ''; } });
      gsap.fromTo(dotEl, { scale: 0, transformOrigin: 'center' }, { scale: 1, duration: 0.6, delay: 1.1, ease: 'back.out(3)' });
    }
  }

  if (hero) {
    window.addEventListener('resize', () => drawLine(false));

    /* Idle sway around the hand holding the bomb */
    gsap.to('[data-hero-float]', { rotation: 1.6, duration: 3.4, ease: 'sine.inOut', yoyo: true, repeat: -1 });

    /* Mouse parallax (desktop) */
    if (finePointer) {
      const mx = gsap.quickTo(mascotWrap, 'x', { duration: 1.2, ease: 'power3.out' });
      const mr = gsap.quickTo(mascotWrap, 'rotation', { duration: 1.4, ease: 'power3.out' });
      const title = $('.hero__title');
      const tx = gsap.quickTo(title, 'x', { duration: 1.4, ease: 'power3.out' });
      const ty = gsap.quickTo(title, 'y', { duration: 1.4, ease: 'power3.out' });
      window.addEventListener('pointermove', (e) => {
        if (window.scrollY > hero.offsetHeight) return;
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        mx(nx * 24); mr(nx * 2.5);
        tx(nx * -10); ty(ny * -6);
      }, { passive: true });
    }
    // Keep the dotted line attached while the mascot / CTA move (only while the hero is on screen).
    gsap.ticker.add(() => { if (window.scrollY < hero.offsetHeight) drawLine(false); });

    gsap.to('.hero__mascot-float', {
      yPercent: 10, scale: 1.05, ease: 'none',
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
    });
    gsap.to('.hero__content', {
      yPercent: -14, opacity: 0.2, ease: 'none',
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
    });
  }

  /* ---------------- Marquee (scroll-velocity aware) ---------------- */
  const mq = $('[data-marquee]');
  if (mq) {
    const loop = gsap.to(mq, { xPercent: -50, duration: 28, ease: 'none', repeat: -1 });
    let dir = 1;
    ScrollTrigger.create({
      trigger: '.marquee', start: 'top bottom', end: 'bottom top',
      onUpdate: (self) => {
        const v = self.getVelocity();
        if (Math.abs(v) > 30) dir = v > 0 ? 1 : -1;
        const boost = gsap.utils.clamp(1, 5, 1 + Math.abs(v) / 600);
        gsap.to(loop, { timeScale: boost * dir, duration: 0.3, overwrite: true, onComplete: () => gsap.to(loop, { timeScale: dir, duration: 1.2 }) });
      },
    });
  }

  /* ---------------- Split headings ---------------- */
  $$('[data-split]').forEach((el) => {
    const words = splitWords(el);
    gsap.set(el, { opacity: 1 });
    gsap.set(words, { yPercent: 120 });
    gsap.to(words, {
      yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: 0.06,
      scrollTrigger: { trigger: el, start: 'top 86%', once: true },
    });
  });

  /* ---------------- Generic reveals ---------------- */
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 90%',
    once: true,
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08, overwrite: true }),
  });

  $$('[data-reveal-media]').forEach((el) => {
    const inner = el.querySelector('img, .ph');
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    tl.to(el, { clipPath: 'inset(0% 0 0 0)', duration: 1.4, ease: 'expo.inOut' });
    if (inner) tl.from(inner, { scale: 1.25, duration: 1.8, ease: 'expo.out' }, 0.1);
  });

  /* ---------------- Counters ---------------- */
  $$('[data-count]').forEach((el) => {
    const end = parseInt(el.dataset.count, 10);
    const obj = { v: 0 };
    el.textContent = '0';
    gsap.to(obj, {
      v: end, duration: 2, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      onUpdate: () => { el.textContent = Math.round(obj.v); },
    });
  });

  /* ---------------- Services: stacking panels + inner reveals ---------------- */
  const panels = $$('[data-svc]');
  panels.forEach((panel) => {
    const items = [
      panel.querySelector('.svc__num'),
      panel.querySelector('.svc__title'),
      panel.querySelector('.svc__desc'),
      ...panel.querySelectorAll('.svc__list li'),
    ].filter(Boolean);
    gsap.from(items, {
      y: 50, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.06,
      scrollTrigger: { trigger: panel, start: 'top 65%', once: true },
    });
    gsap.from(panel.querySelector('.svc__visual'), {
      scale: 0.85, opacity: 0, rotation: -3, duration: 1.4, ease: 'expo.out',
      scrollTrigger: { trigger: panel, start: 'top 60%', once: true },
    });
  });
  mm.add('(min-width: 901px)', () => {
    panels.forEach((panel, i) => {
      const next = panels[i + 1];
      if (!next) return;
      gsap.to(panel.querySelector('.svc__inner'), {
        scale: 0.9, opacity: 0.25, yPercent: -4, ease: 'none',
        scrollTrigger: { trigger: next, start: 'top bottom', end: 'top top', scrub: true },
      });
    });
  });

  /* ---------------- Work: parallax inside media ---------------- */
  $$('.work__media').forEach((m) => {
    const inner = m.querySelector('img, .ph span');
    if (!inner) return;
    gsap.fromTo(inner, { yPercent: -8 }, {
      yPercent: 8, ease: 'none',
      scrollTrigger: { trigger: m, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

  /* ---------------- About: manifesto scrub ---------------- */
  const manifesto = $('[data-manifesto]');
  if (manifesto) {
    const words = splitWords(manifesto);
    words.forEach((w) => w.classList.add('mw'));
    const paint = (p) => {
      const n = Math.round(p * words.length);
      words.forEach((w, i) => w.classList.toggle('is-on', i < n));
    };
    mm.add('(min-width: 901px)', () => {
      ScrollTrigger.create({
        trigger: '[data-about-pin]', start: 'top top', end: '+=110%', pin: true, scrub: true,
        onUpdate: (self) => paint(self.progress * 1.08),
      });
    });
    mm.add('(max-width: 900px)', () => {
      ScrollTrigger.create({
        trigger: manifesto, start: 'top 80%', end: 'bottom 45%', scrub: true,
        onUpdate: (self) => paint(self.progress),
      });
    });
  }
  const aboutImg = $('[data-parallax-img]');
  if (aboutImg) {
    gsap.fromTo(aboutImg, { yPercent: -10 }, {
      yPercent: 0, ease: 'none',
      scrollTrigger: { trigger: aboutImg.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  }

  // Fonts change layout metrics — refresh trigger positions once they're in.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { ScrollTrigger.refresh(); drawLine(false); });
  window.addEventListener('load', () => ScrollTrigger.refresh());
})();

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
    const infStage = $('[data-inf-stage]');
    if (infStage) bind(infStage, 'Drag', true);
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

  /* ---------------- Influencers panel (fanned cards, swipe sideways) ---------------- */
  const inf = $('[data-inf]');
  let infIndex = 0, infLastFocus = null;
  function infLayout() {
    if (!inf) return;
    const stage = $('[data-inf-stage]', inf);
    stage.style.setProperty('--stage-h', `${stage.clientHeight}px`);
    const cards = $$('[data-inf-card]', inf);
    const w = cards[0] ? cards[0].offsetWidth : 200;
    const step = w * (window.innerWidth < 760 ? 0.72 : 0.86);
    cards.forEach((c, i) => {
      const d = i - infIndex + infDrag / step, a = Math.abs(d);
      c.style.transform = `translateX(${d * step}px) translateY(${a * a * w * 0.06}px) rotate(${d * 7}deg) scale(${1 - Math.min(a, 3) * 0.07})`;
      c.style.zIndex = String(100 - Math.round(a * 10));
      c.style.opacity = a > 3.2 ? '0' : '1';
      c.style.filter = a > 0.5 ? `brightness(${Math.max(0.45, 1 - a * 0.22)})` : '';
      c.classList.toggle('is-active', i === infIndex);
      const btn = c.querySelector('button');
      if (btn && !c.classList.contains('inf-card--empty')) btn.tabIndex = i === infIndex ? 0 : -1;
    });
  }
  function infGo(i) {
    const n = $$('[data-inf-card]', inf).length;
    infIndex = Math.max(0, Math.min(n - 1, i));
    $$('[data-inf-info]', inf).forEach((el) => { el.hidden = el.dataset.infInfo !== String(infIndex); });
    $$('[data-inf-bg]', inf).forEach((el) => el.classList.toggle('is-on', el.dataset.infBg === String(infIndex)));
    const count = $('[data-inf-count]', inf); if (count) count.textContent = `${infIndex + 1} / ${n}`;
    const prev = $('[data-inf-prev]', inf), next = $('[data-inf-next]', inf);
    if (prev) prev.disabled = infIndex === 0;
    if (next) next.disabled = infIndex === n - 1;
    infLayout();
  }
  let infDrag = 0;
  function openInf() {
    if (!inf) return;
    infLastFocus = document.activeElement;
    inf.classList.add('is-open');
    document.documentElement.classList.add('inf-open');
    if (lenis) lenis.stop();
    infGo(infIndex);
    if (history.replaceState) history.replaceState(null, '', '#influencers');
    setTimeout(() => { const c = $('.inf__close', inf); if (c) c.focus(); }, 30);
  }
  function closeInf(toHash) {
    if (!inf || !inf.classList.contains('is-open')) return;
    inf.classList.remove('is-open');
    document.documentElement.classList.remove('inf-open');
    if (lenis) lenis.start();
    if (history.replaceState) history.replaceState(null, '', toHash || location.pathname);
    if (infLastFocus && infLastFocus.focus) infLastFocus.focus({ preventScroll: true });
  }
  if (inf) {
    infIndex = Number(inf.dataset.start) || 0;
    $$('[data-inf-close]', inf).forEach((a) => a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      e.preventDefault(); e.stopPropagation();
      closeInf();
      if (href && href !== '#top') { const t = document.getElementById(href.slice(1)); if (t) scrollToTarget(t); }
    }));
    const prev = $('[data-inf-prev]', inf), next = $('[data-inf-next]', inf);
    if (prev) prev.addEventListener('click', () => infGo(infIndex - 1));
    if (next) next.addEventListener('click', () => infGo(infIndex + 1));
    $$('[data-inf-card]', inf).forEach((c, i) => c.addEventListener('click', () => { if (!infMoved) infGo(i); }));
    document.addEventListener('keydown', (e) => {
      if (!inf.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeInf();
      else if (e.key === 'ArrowLeft') infGo(infIndex - 1);
      else if (e.key === 'ArrowRight') infGo(infIndex + 1);
      else if (e.key === 'Tab') { // keep focus inside the panel
        const f = $$('a[href], button:not([disabled])', inf).filter((el) => el.tabIndex >= 0 && el.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    // drag / swipe sideways
    const stage = $('[data-inf-stage]', inf);
    let infDown = false, infX = 0, infMoved = false;
    stage.addEventListener('dragstart', (e) => e.preventDefault());
    stage.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; infDown = true; infMoved = false; infX = e.clientX; });
    window.addEventListener('pointermove', (e) => {
      if (!infDown) return;
      infDrag = e.clientX - infX;
      if (Math.abs(infDrag) > 6 && !infMoved) { infMoved = true; stage.classList.add('is-dragging'); }
      if (infMoved) infLayout();
    });
    const end = () => {
      if (!infDown) return;
      infDown = false; stage.classList.remove('is-dragging');
      const cards = $$('[data-inf-card]', inf);
      const step = (cards[0] ? cards[0].offsetWidth : 200) * (window.innerWidth < 760 ? 0.72 : 0.86);
      const shift = Math.round(-infDrag / step) || (Math.abs(infDrag) > 40 ? -Math.sign(infDrag) : 0);
      infDrag = 0;
      infGo(infIndex + shift);
      setTimeout(() => { infMoved = false; }, 0);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    // trackpad / horizontal wheel
    let wheelLock = 0;
    stage.addEventListener('wheel', (e) => {
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
      if (!dx || Date.now() < wheelLock || Math.abs(dx) < 12) return;
      e.preventDefault(); wheelLock = Date.now() + 380; infGo(infIndex + Math.sign(dx));
    }, { passive: false });
    window.addEventListener('resize', infLayout);
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

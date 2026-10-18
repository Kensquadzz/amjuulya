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
    const track = $('[data-creators-track]');
    if (track) bind(track, 'Drag', true);
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

  /* ---------------- Visual: AI pixel generator ---------------- */
  const aiGrid = $('[data-ai-grid]');
  const aiType = $('[data-ai-type]');
  const aiStatus = $('[data-ai-status]');
  const aiProgress = $('.vis-ai__progress');
  const N = 16;
  const aiCells = [];
  if (aiGrid) {
    for (let i = 0; i < N * N; i++) { const s = document.createElement('span'); aiGrid.appendChild(s); aiCells.push(s); }
  }
  // A simple "generated" shape: a sphere with a highlight, dithered.
  const aiTarget = aiCells.map((_, i) => {
    const x = i % N, y = Math.floor(i / N);
    const dx = (x - 7.5) / 6.2, dy = (y - 7) / 6.2, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1) return y > 13 ? 'on-d' : '';
    const hl = Math.sqrt((dx + 0.35) ** 2 + (dy + 0.4) ** 2);
    if (hl < 0.32) return 'on-w';
    return d > 0.82 && (x + y) % 2 ? 'on-d' : 'on-r';
  });
  const aiFull = aiType ? aiType.textContent : '';
  let aiTimer = null;
  function aiShowFinal() {
    aiCells.forEach((c, i) => { c.className = aiTarget[i]; });
    if (aiStatus) aiStatus.textContent = 'DONE · 100%';
    if (aiProgress) aiProgress.style.setProperty('--p', '100%');
  }
  function aiRun() {
    if (!aiGrid || aiTimer) return;
    let step = 0;
    const order = aiCells.map((_, i) => i).sort(() => Math.random() - 0.5);
    aiCells.forEach((c) => { c.className = ''; });
    const total = 70;
    aiTimer = setInterval(() => {
      step++;
      const typed = Math.min(aiFull.length, Math.round((step / 24) * aiFull.length));
      aiType.textContent = aiFull.slice(0, typed);
      if (step > 24) {
        const k = Math.round(((step - 24) / (total - 24)) * order.length);
        for (let j = 0; j < k; j++) aiCells[order[j]].className = aiTarget[order[j]];
        // noise flicker on remaining cells
        for (let j = k; j < order.length; j += 7) aiCells[order[j]].className = Math.random() > 0.85 ? 'on-d' : '';
      }
      const pct = Math.min(100, Math.round((step / total) * 100));
      aiProgress.style.setProperty('--p', pct + '%');
      aiStatus.textContent = (pct < 100 ? 'GENERATING · ' : 'DONE · ') + String(pct).padStart(2, '0') + '%';
      if (step >= total) { clearInterval(aiTimer); aiTimer = null; setTimeout(() => { if (aiVisible) aiRun(); }, 3800); }
    }, 70);
  }
  let aiVisible = false;

  /* ---------------- Visual: calendar ---------------- */
  const calGrid = $('[data-cal-grid]');
  const calPlan = ['k1', '', 'k2', 'k3', 'k1', '', 'k2', 'k2', 'k1', '', 'k3', 'k2', 'k1', '', '', 'k2', 'k1', 'k3', '', 'k1', 'k2', 'k1', 'k3', '', 'k2', 'k1', '', 'k3'];
  if (calGrid) {
    calPlan.forEach((k, i) => {
      const s = document.createElement('span');
      s.textContent = String(i + 1).padStart(2, '0');
      if (k) { const tag = document.createElement('i'); tag.className = k; s.appendChild(tag); }
      calGrid.appendChild(s);
    });
  }

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

  // Run the service visuals only while they are on screen.
  if ('IntersectionObserver' in window) {
    const vio = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const el = en.target;
        if (el.classList.contains('vis-ai')) {
          aiVisible = en.isIntersecting;
          if (reduceMotion) { if (en.isIntersecting) aiShowFinal(); return; }
          if (en.isIntersecting) aiRun();
        }
        if (el.classList.contains('vis-vid')) (en.isIntersecting ? tcStart() : tcStop());
      });
    }, { threshold: 0.25 });
    $$('.vis-ai, .vis-vid').forEach((el) => vio.observe(el));
  } else { aiShowFinal(); }

  /* ---------------- Creators slider ---------------- */
  const track = $('[data-creators-track]');
  if (track) {
    const prev = $('[data-creators-prev]');
    const next = $('[data-creators-next]');
    const bar = $('[data-creators-progress]');
    const step = () => { const card = track.querySelector('.creator'); return card ? card.getBoundingClientRect().width + 20 : 300; };
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const p = max > 0 ? track.scrollLeft / max : 1;
      const vis = Math.min(1, track.clientWidth / track.scrollWidth);
      if (bar) bar.style.transform = `scaleX(${vis + (1 - vis) * p})`;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max - 2;
    };
    prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: reduceMotion ? 'auto' : 'smooth' }));
    next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: reduceMotion ? 'auto' : 'smooth' }));
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();

    // Mouse drag-to-scroll (touch already scrolls natively)
    let down = false, startX = 0, startLeft = 0, moved = false;
    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; moved = false; startX = e.clientX; startLeft = track.scrollLeft;
    });
    window.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) { moved = true; track.classList.add('is-dragging'); }
      track.scrollLeft = startLeft - dx;
    });
    window.addEventListener('pointerup', () => {
      if (!down) return; down = false;
      if (moved) {
        // settle on nearest card
        track.classList.remove('is-dragging');
        const s = step(); track.scrollTo({ left: Math.round(track.scrollLeft / s) * s, behavior: 'smooth' });
      }
    });
    track.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
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
    };
    const check = (name) => {
      const input = form.elements[name];
      const msg = rules[name](input.value);
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
          setStatus('Баярлалаа! Таны хүсэлтийг хүлээн авлаа. Бид удахгүй эргэн холбогдоно.', 'success');
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
  if (!motion) {
    aiShowFinal();
    return;
  }

  const mm = gsap.matchMedia();

  /* ---------------- Loader + hero intro ---------------- */
  const heroWords = $$('[data-hero-word]');
  const heroFades = $$('[data-hero-fade]');
  const mascotWrap = $('[data-hero-mascot]');
  const navItems = $$('.nav__inner > *');

  function heroIntro() {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.fromTo(mascotWrap, { opacity: 0, scale: 1.12, yPercent: 8 }, { opacity: 1, scale: 1, yPercent: 0, duration: 1.8 }, 0)
      .to(heroWords, { y: 0, duration: 1.3, stagger: 0.09 }, 0.1)
      .to(navItems, { opacity: 1, duration: 1, stagger: 0.06 }, 0.35)
      .fromTo(heroFades, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 1.1, stagger: 0.08 }, 0.55)
      .add(() => { lineReady = true; drawLine(true); }, 0.9);
    return tl;
  }

  const loader = $('.loader');
  if (root.classList.contains('is-loading') && loader) {
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
    heroIntro();
  }

  /* ---------------- Hero: dotted line from CTA to the mascot's eye ---------------- */
  const svgLine = $('[data-hero-line]');
  const anchor = $('[data-hero-anchor]');
  const lineEl = svgLine && $('line', svgLine);
  const dotEl = svgLine && $('circle', svgLine);
  const mascotImg = $('.hero__mascot img');
  let lineReady = false, lineLen = 0;
  const EYE = { x: 0.48, y: 0.255 }; // position of the left pupil inside mascot.webp
  function drawLine(animate) {
    if (!svgLine || !lineReady || getComputedStyle(svgLine).display === 'none') return;
    const hr = hero.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const mr = mascotImg.getBoundingClientRect();
    const x1 = ar.left + ar.width / 2 - hr.left, y1 = ar.top + ar.height / 2 - hr.top;
    const x2 = mr.left + mr.width * EYE.x - hr.left, y2 = mr.top + mr.height * EYE.y - hr.top;
    lineEl.setAttribute('x1', x1); lineEl.setAttribute('y1', y1);
    lineEl.setAttribute('x2', x2); lineEl.setAttribute('y2', y2);
    dotEl.setAttribute('cx', x2); dotEl.setAttribute('cy', y2);
    lineLen = Math.hypot(x2 - x1, y2 - y1);
    if (animate) {
      gsap.fromTo(svgLine, { opacity: 0 }, { opacity: 1, duration: 0.4 });
      gsap.fromTo(lineEl, { attr: { 'stroke-dashoffset': lineLen } , strokeDasharray: `${lineLen} ${lineLen}` },
        { attr: { 'stroke-dashoffset': 0 }, duration: 1.4, ease: 'expo.inOut', onComplete: () => { lineEl.style.strokeDasharray = ''; } });
      gsap.fromTo(dotEl, { scale: 0, transformOrigin: 'center' }, { scale: 1, duration: 0.6, delay: 1.1, ease: 'back.out(3)' });
    }
  }
  window.addEventListener('resize', () => drawLine(false));

  /* ---------------- Hero: idle float, mouse parallax, scroll parallax ---------------- */
  const floatEl = $('[data-hero-float]');
  gsap.to(floatEl, { y: -10, rotation: 0.8, duration: 4.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });

  if (finePointer) {
    const mx = gsap.quickTo(mascotWrap, 'x', { duration: 1.2, ease: 'power3.out' });
    const my = gsap.quickTo(mascotWrap, 'y', { duration: 1.2, ease: 'power3.out' });
    const mr = gsap.quickTo(mascotWrap, 'rotation', { duration: 1.4, ease: 'power3.out' });
    const title = $('.hero__title');
    const tx = gsap.quickTo(title, 'x', { duration: 1.4, ease: 'power3.out' });
    const ty = gsap.quickTo(title, 'y', { duration: 1.4, ease: 'power3.out' });
    hero.addEventListener('pointermove', (e) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      mx(nx * 26); my(ny * 16); mr(nx * 1.6);
      tx(nx * -10); ty(ny * -6);
    });
    hero.addEventListener('pointerleave', () => { mx(0); my(0); mr(0); tx(0); ty(0); });
  }
  // Keep the dotted line attached while the mascot / CTA move (only while the hero is on screen).
  gsap.ticker.add(() => { if (window.scrollY < hero.offsetHeight) drawLine(false); });

  gsap.to('.hero__mascot-float img', {
    yPercent: 12, scale: 1.06, ease: 'none',
    scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
  });
  gsap.to('.hero__content', {
    yPercent: -14, opacity: 0.2, ease: 'none',
    scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
  });

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
    ];
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

  // Calendar cells pop in
  if (calGrid) {
    gsap.from(calGrid.children, {
      scale: 0.6, opacity: 0, duration: 0.6, ease: 'back.out(2)', stagger: { each: 0.025, from: 'start' },
      scrollTrigger: { trigger: calGrid, start: 'top 80%', once: true },
    });
  }

  /* ---------------- Work: parallax inside media ---------------- */
  $$('.work__media').forEach((m) => {
    const inner = m.querySelector('img, .ph span');
    if (!inner) return;
    gsap.fromTo(inner, { yPercent: -8 }, {
      yPercent: 8, ease: 'none',
      scrollTrigger: { trigger: m, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

  /* ---------------- Creators: cards slide in ---------------- */
  gsap.from('.creator', {
    x: 120, opacity: 0, duration: 1.3, ease: 'expo.out', stagger: 0.07,
    scrollTrigger: { trigger: '.creators__track', start: 'top 85%', once: true },
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

  /* ---------------- Footer wordmark ---------------- */
  const footerLetters = $$('[data-footer-word] span');
  if (footerLetters.length) {
    gsap.from(footerLetters, {
      yPercent: 100, ease: 'none', stagger: 0.08,
      scrollTrigger: { trigger: '[data-footer-word]', start: 'top bottom', end: 'bottom bottom', scrub: 0.6 },
    });
  }

  // Fonts change layout metrics — refresh trigger positions once they're in.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { ScrollTrigger.refresh(); drawLine(false); });
  window.addEventListener('load', () => ScrollTrigger.refresh());
})();

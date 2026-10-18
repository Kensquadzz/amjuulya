// Dark streaming-app motion shots (Canvas 2D): black with a soft breathing
// glow, a pill that pops, lines that type in letter by letter, a logo that
// pops and slides its name out, round artwork, list rows, filter pills,
// a heading with a paragraph, a price drop. Plus two transitions for
// pastel 3D shots: a white light burst and a magenta speed tunnel (drawn
// over whatever is below). One shot per layer, timed by its own length;
// `beats` (seconds into the shot) line up key moments with the voice-over.
import type { FrameState, SceneDef, Scene2DInstance } from '../scene3d';
import { loadImg } from '../scene3d';

const fmt = (s: unknown) => String(s ?? '');
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
const eo = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const eo5 = (x: number) => 1 - Math.pow(1 - clamp(x), 5);
const eio = (x: number) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const back = (x: number) => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const W = 1080, H = 1920, IMGS = 6;
const SHOTS = ['type', 'track', 'logo', 'circles', 'para', 'list', 'pills', 'price', 'burst', 'tunnel'] as const;

export const glowUI: SceneDef = {
  id: 'glowUI',
  name: 'Dark glow UI shot (2D)',
  params: [
    { key: 'shot', kind: 'text', label: `Shot (${SHOTS.join(', ')})`, def: 'type' },
    { key: 'title', kind: 'text', label: 'Main text', def: 'More than just files' },
    { key: 'sub', kind: 'text', label: 'Supporting text', def: '' },
    { key: 'pill', kind: 'text', label: 'Pill', def: '' },
    { key: 'items', kind: 'text', label: 'Items (one per line, "title | sub")', def: '' },
    { key: 'beats', kind: 'text', label: 'Beats (seconds into the shot)', def: '' },
    { key: 'accent', kind: 'color', label: 'Accent', def: '#b46bff' },
    { key: 'glow', kind: 'color', label: 'Glow', def: '#4a1490' },
    { key: 'font', kind: 'text', label: 'Font', def: 'Inter' },
    ...Array.from({ length: IMGS }, (_, i) => ({ key: `img${i + 1}`, kind: 'image' as const, label: `Picture ${i + 1}`, def: '' as const })),
  ],
  create2d(kit) {
    let c: CanvasRenderingContext2D;
    let P: Record<string, number | string> = {};
    let A = '#b46bff', G = '#4a1490', F = 'Inter';
    const imgs: (HTMLImageElement | null)[] = [], srcs: string[] = [];
    const hexRgb = (h: string) => { const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; };
    const font = (w: number, px: number, fam = F) => { c.font = `${w} ${px}px "${fam}", Inter, Montserrat, sans-serif`; };
    const tw = (s: string, w: number, px: number) => { font(w, px); return c.measureText(s).width; };
    const text = (s: string, x: number, y: number, w: number, px: number, col: string | CanvasGradient, align: CanvasTextAlign = 'center') => { font(w, px); c.fillStyle = col; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(s, x, y); };
    const fit = (s: string, maxW: number, w: number, px: number) => { const m = tw(s, w, px); return m > maxW ? px * maxW / m : px; };
    const wrap = (s: string, maxW: number, w: number, px: number) => { const out: string[] = []; let cur = ''; for (const word of s.split(/\s+/).filter(Boolean)) { const tryS = cur ? cur + ' ' + word : word; if (tw(tryS, w, px) > maxW && cur) { out.push(cur); cur = word; } else cur = tryS; } if (cur) out.push(cur); return out; };
    const rr = (x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
    const beats = (n: number, D: number) => { const b = fmt(P.beats).split(',').map(parseFloat).filter((v) => isFinite(v)); while (b.length < n) b.push((D * (b.length + 1)) / (n + 1)); return b; };
    const items = () => fmt(P.items).split('\n').map((s) => s.trim()).filter(Boolean).map((s) => { const [a, b] = s.split('|').map((x) => x.trim()); return { t: a, s: b ?? '' }; });
    const pic = (i: number) => { const l = imgs.filter(Boolean) as HTMLImageElement[]; return l.length ? l[i % l.length] : null; };
    const cover = (img: HTMLImageElement, x: number, y: number, w: number, h: number) => { const s = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / s, sh = h / s; c.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) * 0.1, sw, sh, x, y, w, h); };

    /** black with a big soft glow that breathes and drifts */
    const bg = (t: number, cy = 900, k = 1) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      const x = W / 2 + Math.sin(t * 0.5) * 60, y = cy + Math.cos(t * 0.4) * 50, r = (760 + Math.sin(t * 0.8) * 50) * k;
      c.save(); c.translate(x, y); c.scale(1, 1.25);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, `rgba(${hexRgb(G)},0.95)`); g.addColorStop(0.45, `rgba(${hexRgb(G)},0.45)`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(-r, -r, 2 * r, 2 * r); c.restore();
      const v = c.createRadialGradient(W / 2, H / 2, 500, W / 2, H / 2, 1300); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.85)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
    };
    /** letters fade in one by one at their final positions (no reflow) */
    const typeLine = (s: string, cx: number, y: number, w: number, px: number, t: number, t0: number, rate: number, col = '#ffffff', align: 'center' | 'left' = 'center') => {
      font(w, px); const total = c.measureText(s).width; let x = align === 'center' ? cx - total / 2 : cx;
      c.textAlign = 'left'; c.textBaseline = 'middle';
      for (let i = 0; i < s.length; i++) {
        const ch = s[i], cw = c.measureText(s.slice(0, i + 1)).width - c.measureText(s.slice(0, i)).width;
        const a = seg(t, t0 + i * rate, t0 + i * rate + 0.16);
        if (a > 0) { c.save(); c.globalAlpha *= a; c.fillStyle = col; c.fillText(ch, x + (1 - eo(a)) * 10, y); c.restore(); }
        x += cw;
      }
      return t0 + s.length * rate + 0.16;
    };
    const pill = (s: string, x: number, y: number, k: number, on = true, px = 34) => {
      if (k <= 0) return;
      const w = tw(s, 600, px) + px * 1.5, h = px * 1.75;
      c.save(); c.translate(x, y); c.scale(k, k);
      rr(-w / 2, -h / 2, w, h, h / 2); c.fillStyle = on ? A : 'rgba(255,255,255,0.14)'; c.fill();
      text(s, 0, 2, 600, px, on ? '#0b0614' : '#f2f2f2'); c.restore();
    };
    const mark = (x: number, y: number, r: number, k: number) => {
      if (k <= 0) return;
      c.save(); c.translate(x, y); c.scale(k, k);
      const gl = c.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.4); gl.addColorStop(0, `rgba(${hexRgb(A)},0.55)`); gl.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gl; c.fillRect(-r * 2.5, -r * 2.5, r * 5, r * 5);
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fillStyle = A; c.fill();
      // document glyph: three lines like the streaming logo, on a page
      c.fillStyle = '#0b0614'; c.beginPath(); c.moveTo(-r * 0.36, -r * 0.5); c.lineTo(r * 0.2, -r * 0.5); c.lineTo(r * 0.4, -r * 0.3); c.lineTo(r * 0.4, r * 0.5); c.lineTo(-r * 0.36, r * 0.5); c.closePath(); c.fill();
      c.strokeStyle = A; c.lineCap = 'round'; c.lineWidth = r * 0.09;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-r * 0.2, -r * 0.18 + i * r * 0.22); c.quadraticCurveTo(0, -r * 0.24 + i * r * 0.22, r * 0.24 - i * r * 0.06, -r * 0.16 + i * r * 0.22); c.stroke(); }
      c.restore();
    };

    // ---------------------------------------------------------------- shots
    const shotType = (t: number, D: number) => {
      bg(t);
      const [b0] = beats(1, D), p = fmt(P.pill);
      if (p) { const k = back(seg(t, 0.05, 0.4)) * (1 - seg(t, b0 - 0.25, b0 - 0.05)); pill(p, W / 2, 900, k, true, 48); }
      const ls = wrap(fmt(P.title), W - 160, 500, 88);
      let tt = p ? b0 : 0.1;
      ls.forEach((l, i) => { tt = typeLine(l, W / 2, 900 + (i - (ls.length - 1) / 2) * 116, 500, 88, t, tt, Math.min(0.055, (D - tt - 0.3) / Math.max(1, fmt(P.title).length))) - 0.1; });
    };
    const shotTrack = (t: number, D: number) => {
      bg(t, 900, 0.9);
      const ls = wrap(fmt(P.title), W - 180, 500, 84);
      ls.forEach((l, i) => {
        const k = eo5(seg(t, 0.05 + i * 0.25, 0.9 + i * 0.25)), sp = lerp(26, 2, k);
        c.save(); c.globalAlpha *= k * (0.65 + 0.35 * seg(t, 0.5, D)); (c as any).letterSpacing = `${sp}px`;
        text(l, W / 2 + sp / 2, 900 + (i - (ls.length - 1) / 2) * 118, 500, 84, '#e9e9ee'); (c as any).letterSpacing = '0px'; c.restore();
      });
    };
    const shotLogo = (t: number, D: number) => {
      bg(t, 900, 0.85 + 0.15 * seg(t, 0, 0.6));
      const [b0] = beats(1, D);
      const pre = fmt(P.pill);
      if (pre) { c.save(); c.globalAlpha *= 1 - seg(t, b0 - 0.2, b0); typeLine(pre, W / 2, 900, 500, 80, t, 0.05, 0.05, '#d8d8de'); c.restore(); }
      const pop = back(seg(t, b0, b0 + 0.4));
      const name = fmt(P.title), sub = fmt(P.sub), px = 74;
      const nw = tw(name + ' ', 700, px) + tw(sub, 500, px), slide = eo5(seg(t, b0 + 0.35, b0 + 0.85));
      const r = 80, total = 2 * r + 30 + nw, x0 = lerp(W / 2, W / 2 - total / 2 + r, slide);
      mark(x0, 900, r, pop);
      if (slide > 0) {
        const tx = x0 + r + 30;
        c.save(); c.beginPath(); c.rect(x0 + r + 6, 780, W, 240); c.clip();
        const full = name + ' ' + sub, n = Math.round(full.length * seg(t, b0 + 0.4, Math.min(D - 0.2, b0 + 1.4)));
        const a = full.slice(0, Math.min(n, name.length)), b = n > name.length ? full.slice(name.length + 1, n) : '';
        text(a, tx, 902, 700, px, '#ffffff', 'left');
        if (b) text(b, tx + tw(name + ' ', 700, px), 902, 500, px, A, 'left');
        c.restore();
      }
    };
    const shotCircles = (t: number, D: number) => {
      bg(t, 980);
      const its = items().slice(0, 3), B = beats(its.length, D);
      const h = fmt(P.title);
      if (h) { const k = eo5(seg(t, 0.05, 0.5)); c.save(); c.globalAlpha *= k; text(h, 80 + (1 - k) * -30, 560, 600, 96, '#ffffff', 'left'); c.restore(); }
      const n = its.length, R = n > 2 ? 135 : 170, gap = n > 2 ? 330 : 400;
      its.forEach((it, i) => {
        const k = back(seg(t, B[i] - 0.05, B[i] + 0.35)); if (k <= 0) return;
        const x = W / 2 + (i - (n - 1) / 2) * gap, y = 960;
        c.save(); c.translate(x, y); c.scale(k, k);
        const gl = c.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.9); gl.addColorStop(0, `rgba(${hexRgb(A)},0.45)`); gl.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gl; c.fillRect(-R * 2, -R * 2, R * 4, R * 4);
        c.save(); c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.clip();
        const im = pic(i);
        if (/^word$/i.test(it.t)) { c.fillStyle = '#185abd'; c.fillRect(-R, -R, 2 * R, 2 * R); text('W', 0, 6, 800, R * 1.1, '#fff'); }
        else if (/^excel$/i.test(it.t)) { c.fillStyle = '#107c41'; c.fillRect(-R, -R, 2 * R, 2 * R); text('X', 0, 6, 800, R * 1.1, '#fff'); }
        else if (im) cover(im, -R, -R, 2 * R, 2 * R);
        else { c.fillStyle = '#222'; c.fillRect(-R, -R, 2 * R, 2 * R); }
        c.restore();
        c.beginPath(); c.arc(0, 0, R + 6, 0, Math.PI * 2); c.strokeStyle = `rgba(${hexRgb(A)},0.9)`; c.lineWidth = 5; c.stroke();
        c.restore();
        const la = seg(t, B[i] + 0.15, B[i] + 0.45);
        c.save(); c.globalAlpha *= la; text(it.t, x, y + R + 66, 600, 46, '#ffffff'); if (it.s) text(it.s, x, y + R + 118, 500, 34, 'rgba(255,255,255,0.5)'); c.restore();
      });
    };
    const shotPara = (t: number, _D: number) => {
      bg(t, 950);
      const h = fmt(P.title), body = fmt(P.sub), p = fmt(P.pill);
      const hl = wrap(h, W - 160, 600, 96);
      let tt = 0.05;
      hl.forEach((l, i) => { tt = typeLine(l, 80, 640 + i * 116, 600, 96, t, tt, 0.035, '#ffffff', 'left') - 0.08; });
      const bl = wrap(body, W - 170, 400, 50), y0 = 640 + hl.length * 116 + 50;
      bl.forEach((l, i) => { const k = eo(seg(t, tt + 0.1 + i * 0.12, tt + 0.5 + i * 0.12)); c.save(); c.globalAlpha *= k * 0.86; text(l, 84, y0 + i * 70 + (1 - k) * 16, 400, 50, '#e4e4ea', 'left'); c.restore(); });
      if (p) {
        const k = back(seg(t, tt + 0.4 + bl.length * 0.12, tt + 0.8 + bl.length * 0.12)), y = y0 + bl.length * 70 + 90, w = tw(p, 500, 40) + 120;
        if (k > 0) { c.save(); c.translate(84 + w / 2, y); c.scale(k, k); rr(-w / 2, -40, w, 80, 40); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fill(); c.strokeStyle = A; c.lineWidth = 3.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(-w / 2 + 32, 0); c.lineTo(-w / 2 + 45, 13); c.lineTo(-w / 2 + 66, -13); c.stroke(); text(p, -w / 2 + 84, 2, 500, 40, '#f0f0f0', 'left'); c.restore(); }
      }
    };
    const shotList = (t: number, D: number) => {
      bg(t, 1000);
      const its = items(), rowH = 200, x = 50, w = W - 100;
      const scroll = eio(seg(t, 0, D)) * rowH * Math.max(0, its.length - 4) + t * 18;
      const y0 = 640 - scroll;
      its.forEach((it, i) => {
        const y = y0 + i * (rowH + 24), k = eo5(seg(t, i * 0.09, 0.45 + i * 0.09));
        if (y < 300 || y > 1500 || k <= 0) return;
        const fade = clamp((y - 300) / 220) * clamp((1500 - y) / 220);
        c.save(); c.globalAlpha *= k * fade; c.translate((1 - k) * 80, 0);
        rr(x, y, w, rowH, 26); c.fillStyle = 'rgba(255,255,255,0.075)'; c.fill();
        const im = pic(i), s = rowH - 40;
        c.save(); rr(x + 22, y + 20, s, s, 14); c.clip(); if (im) cover(im, x + 22, y + 20, s, s); else { c.fillStyle = '#333'; c.fillRect(x + 22, y + 20, s, s); } c.restore();
        text(it.t, x + 22 + s + 30, y + rowH / 2 - 26, 600, fit(it.t, w - s - 150, 600, 46), '#ffffff', 'left');
        if (it.s) text(it.s, x + 22 + s + 30, y + rowH / 2 + 30, 500, 36, 'rgba(255,255,255,0.5)', 'left');
        for (let d = 0; d < 3; d++) { c.beginPath(); c.arc(x + w - 70 + d * 16, y + rowH / 2, 4, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fill(); }
        c.restore();
      });
    };
    const shotPills = (t: number, D: number) => {
      bg(t, 900, 0.8);
      const its = items().map((x) => x.t), B = beats(its.length, D), y = 900, gap = 24;
      const ws = its.map((s) => tw(s, 600, 44) + 66), total = ws.reduce((a, b) => a + b, 0) + gap * (its.length - 1);
      let x = W / 2 - total / 2, active = -1;
      B.forEach((b, i) => { if (t >= b) active = i; });
      its.forEach((s, i) => {
        const k = back(seg(t, 0.05 + i * 0.08, 0.4 + i * 0.08)), cx = x + ws[i] / 2;
        pill(s, cx, y, k, i === active, 44); x += ws[i] + gap;
      });
    };
    const shotPrice = (t: number, D: number) => {
      bg(t, 920);
      const [b0, b1] = beats(2, D), p = fmt(P.pill), old = fmt(P.sub), now = fmt(P.title);
      if (p) pill(p, W / 2, 600, back(seg(t, 0.05, 0.4)), true, 46);
      const ka = eo5(seg(t, 0.1, 0.5));
      c.save(); c.globalAlpha *= ka * (1 - 0.45 * seg(t, b1, b1 + 0.3)); const op = fit(old, W - 300, 500, 140); text(old, W / 2, 780, 500, op, '#cfcfd6');
      const ow = tw(old, 500, op), st = eo(seg(t, b0, b0 + 0.35)); c.strokeStyle = '#ff4d6d'; c.lineWidth = 10; c.lineCap = 'round'; if (st > 0.01) { c.beginPath(); c.moveTo(W / 2 - ow / 2 - 16, 792); c.lineTo(W / 2 - ow / 2 - 16 + (ow + 32) * st, 768); c.stroke(); } c.restore();
      const kn = back(seg(t, b1, b1 + 0.45));
      if (kn > 0) {
        const np = fit(now, W - 140, 700, 250);
        c.save(); c.translate(W / 2, 1010); c.scale(kn, kn); c.shadowColor = `rgba(${hexRgb(A)},0.9)`; c.shadowBlur = 80; text(now, 0, 0, 700, np, '#ffffff'); c.shadowBlur = 0; c.restore();
        const ul = eo(seg(t, b1 + 0.3, b1 + 0.7)), uw = tw(now, 700, np) * 0.8;
        c.fillStyle = A; rr(W / 2 - uw / 2, 1140, uw * ul, 10, 5); c.fill();
      }
    };
    const shotBurst = (t: number, D: number) => {
      // light explosion over the shot below: rays, sparks, a white flash
      const k = seg(t, 0, D), cx = W / 2, cy = 900;
      const fl = Math.exp(-Math.pow((t - D * 0.35) * 7, 2));
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 90; i++) {
        const a = hash(i) * Math.PI * 2, sp = 0.5 + hash(i * 3) * 0.8, r0 = 40 + 1400 * eo(k * sp), len = 120 + hash(i * 5) * 520;
        const g = c.createLinearGradient(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
        const col = i % 4 === 0 ? hexRgb(A) : i % 4 === 1 ? '255,140,200' : '255,255,255';
        g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${0.85 * (1 - k)})`);
        c.strokeStyle = g; c.lineWidth = 3 + hash(i * 7) * 9; c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len)); c.stroke();
      }
      c.restore();
      c.fillStyle = `rgba(255,255,255,${0.95 * fl})`; c.fillRect(0, 0, W, H);
    };
    const shotTunnel = (t: number, D: number) => {
      // magenta speed tunnel: streaks rushing out of the centre
      const k = seg(t, 0, D), mag = '#ff1fd1';
      const g = c.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 1300); g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, '#ff7be8'); g.addColorStop(0.6, mag); g.addColorStop(1, '#8a00b8');
      c.globalAlpha *= Math.min(1, seg(t, 0, 0.08) * (1 - seg(t, D - 0.08, D)) * 1.2);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 140; i++) {
        const a = hash(i * 1.7) * Math.PI * 2, ph = (hash(i * 4.1) + k * (1.6 + hash(i) * 1.2)) % 1, r0 = 60 + 1500 * ph * ph, len = 80 + 600 * ph;
        c.strokeStyle = `rgba(255,255,255,${0.75 * ph})`; c.lineWidth = 2 + 8 * ph;
        c.beginPath(); c.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0); c.lineTo(W / 2 + Math.cos(a) * (r0 + len), H / 2 + Math.sin(a) * (r0 + len)); c.stroke();
      }
      c.restore();
      const fl = Math.exp(-Math.pow((t - D * 0.85) * 10, 2)); c.fillStyle = `rgba(255,255,255,${0.8 * fl})`; c.fillRect(0, 0, W, H);
    };

    const inst: Scene2DInstance = {
      async prepare(prm) {
        P = prm;
        const fam = fmt(prm.font) || 'Inter';
        try { await Promise.all([400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 40px "${fam}"`, 'Аа Өө Үү ₮ 0123'))); } catch { /* fallback */ }
        await Promise.all(Array.from({ length: IMGS }, async (_, i) => { srcs[i] = fmt(prm[`img${i + 1}`]); imgs[i] = await loadImg(srcs[i]); }));
      },
      draw(ctx, f: FrameState) {
        c = ctx; P = f.params;
        A = fmt(P.accent) || '#b46bff'; G = fmt(P.glow) || '#4a1490'; F = fmt(P.font) || 'Inter';
        for (let i = 0; i < IMGS; i++) { const s = fmt(P[`img${i + 1}`]); if (s !== srcs[i]) { srcs[i] = s; imgs[i] = null; loadImg(s).then((im) => { if (srcs[i] === s) { imgs[i] = im; kit.redraw(); } }); } }
        const D = f.dur ?? (f.p > 0 ? f.t / f.p : 3), t = f.t;
        const k = Math.max(f.W / W, f.H / H);
        c.save(); c.translate((f.W - W * k) / 2, (f.H - H * k) / 2); c.scale(k, k);
        switch (fmt(P.shot)) {
          case 'track': shotTrack(t, D); break;
          case 'logo': shotLogo(t, D); break;
          case 'circles': shotCircles(t, D); break;
          case 'para': shotPara(t, D); break;
          case 'list': shotList(t, D); break;
          case 'pills': shotPills(t, D); break;
          case 'price': shotPrice(t, D); break;
          case 'burst': shotBurst(t, D); break;
          case 'tunnel': shotTunnel(t, D); break;
          default: shotType(t, D);
        }
        c.restore();
      },
      dispose() { /* nothing cached */ },
    };
    return inst;
  },
};

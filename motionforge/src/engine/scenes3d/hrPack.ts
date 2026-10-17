// Product ad for a document-template pack, in the style of an app concept ad:
// a dock and cursor click, a pixel burst into the brand, a glass search bar
// with typing, category cards, a word roll, a template grid with a download,
// a counter, editing, the brand, the price and a comment call-to-action.
// Canvas 2D (no Three.js), designed for 9:16 reels; the lower band
// (y ≈ 64–82 %) is kept clear for subtitles. Times are seconds from the
// layer start, matched to the voice-over.
import type { FrameState, SceneDef, Scene2DInstance } from '../scene3d';
import { loadImg } from '../scene3d';

const fmt = (s: unknown) => String(s ?? '');
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const eo = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const eo5 = (x: number) => 1 - Math.pow(1 - clamp(x), 5);
const eio = (x: number) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const back = (x: number) => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function keys(t: number, ks: number[][]) {
  if (t <= ks[0][0]) return ks[0].slice(1);
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) { const k = eio((t - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0])); return ks[i].slice(1).map((v, j) => lerp(ks[i - 1][j + 1], v, k)); }
  }
  return ks[ks.length - 1].slice(1);
}
const lines = (s: unknown) => fmt(s).split('\n').map((x) => x.trim()).filter(Boolean);

// design space: a 1080 x 1920 reel
const W = 1080, H = 1920;
const DOCS = 12;

export const hrPack: SceneDef = {
  id: 'hrPack',
  name: 'Template pack ad (2D)',
  params: [
    { key: 'brand', kind: 'text', label: 'Brand / pack name', def: 'HR OFFICE MASTER PACK' },
    { key: 'query', kind: 'text', label: 'Typed search', def: 'Хөдөлмөрийн гэрээний загвар' },
    { key: 'cats', kind: 'text', label: 'Categories (name | count, one per line)', def: 'Албан бичиг | 17\nГэрээ | 9\nТушаал | 48\nХүний нөөцийн маягт | 36' },
    { key: 'roll', kind: 'text', label: 'Word roll (one per line)', def: 'Өргөдөл\nАлбан бичиг\nГэрээ\nТушаал\nАнкет\nТодорхойлолт\nМэдэгдэл\nАкт\nБэлэн загвар' },
    { key: 'fill', kind: 'text', label: 'Text typed into the document', def: '«Таны байгууллага» ХХК' },
    { key: 'total', kind: 'float', label: 'Total templates', min: 1, max: 1000, def: 110 },
    { key: 'oldPrice', kind: 'text', label: 'Old price', def: '40,000₮' },
    { key: 'newPrice', kind: 'text', label: 'New price', def: '30,000₮' },
    { key: 'comment', kind: 'text', label: 'Comment to type', def: '1' },
    { key: 'accent', kind: 'color', label: 'Brand colour', def: '#2f5bff' },
    { key: 'accent2', kind: 'color', label: 'Second colour', def: '#7c3aed' },
    { key: 'headFont', kind: 'text', label: 'Headline font', def: 'Montserrat' },
    { key: 'uiFont', kind: 'text', label: 'Interface font', def: 'Roboto Condensed' },
    { key: 'numFont', kind: 'text', label: 'Number font', def: 'Oswald' },
    ...Array.from({ length: DOCS }, (_, i) => ({ key: `doc${i + 1}`, kind: 'image' as const, label: `Document page ${i + 1}`, def: '' as const })),
  ],
  create2d(kit) {
    let c: CanvasRenderingContext2D;
    let P: Record<string, number | string> = {};
    let A = '#2f5bff', A2 = '#7c3aed';
    let HF = 'Montserrat', UF = 'Roboto Condensed', NF = 'Oswald';
    const imgs: (HTMLImageElement | null)[] = [];
    const srcs: string[] = [];
    let sky: HTMLCanvasElement | null = null, skyBlur: HTMLCanvasElement | null = null;
    const particles: [number, number, number, number][] = [];

    // ---------------------------------------------------------------- drawing helpers
    const rr = (x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
    const font = (w: number, px: number, fam: string, ls = 0) => { c.font = `${w} ${px}px "${fam}", Montserrat, Inter, sans-serif`; (c as any).letterSpacing = `${ls}px`; };
    const text = (s: string, x: number, y: number, w: number, px: number, col: string | CanvasGradient, align: CanvasTextAlign = 'center', fam = HF, ls = 0) => {
      font(w, px, fam, ls); c.fillStyle = col; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(s, x, y); (c as any).letterSpacing = '0px';
    };
    const fit = (s: string, maxW: number, w: number, px: number, fam: string) => { font(w, px, fam); const m = c.measureText(s).width; (c as any).letterSpacing = '0px'; return m > maxW ? px * maxW / m : px; };
    const cursor = (x: number, y: number, s = 1, a = 1) => {
      if (a <= 0) return;
      c.save(); c.globalAlpha *= a; c.translate(x, y); c.scale(1.9 * s, 1.9 * s);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 34); c.lineTo(8, 26.5); c.lineTo(13.5, 39); c.lineTo(19, 36.5); c.lineTo(13.5, 24.5); c.lineTo(24, 24.5); c.closePath();
      c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 8; c.shadowOffsetY = 3; c.fillStyle = '#fff'; c.fill(); c.shadowColor = 'transparent';
      c.lineWidth = 2.2; c.strokeStyle = '#fff'; c.stroke();
      c.beginPath(); c.moveTo(2.5, 5.5); c.lineTo(2.5, 28); c.lineTo(8.5, 22.5); c.lineTo(14, 35); c.lineTo(16.5, 34); c.lineTo(11, 21.5); c.lineTo(19.5, 21.5); c.closePath();
      c.fillStyle = '#111'; c.fill();
      c.restore();
    };
    const ripple = (x: number, y: number, k: number, rgb = '255,255,255') => { if (k <= 0 || k >= 1) return; c.beginPath(); c.arc(x, y, 24 + 90 * eo(k), 0, Math.PI * 2); c.strokeStyle = `rgba(${rgb},${0.7 * (1 - k)})`; c.lineWidth = 5; c.stroke(); };
    const hexRgb = (h: string) => { const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; };

    // brand mark: a page with a folded corner and "HR"
    const mark = (x: number, y: number, s: number, col = '#fff', ink = A) => {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.beginPath(); c.moveTo(-24, -32); c.lineTo(12, -32); c.lineTo(26, -18); c.lineTo(26, 32); c.lineTo(-24, 32); c.closePath(); c.fillStyle = col; c.fill();
      c.beginPath(); c.moveTo(12, -32); c.lineTo(12, -18); c.lineTo(26, -18); c.closePath(); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fill();
      text('HR', 1, 10, 900, 24, ink, 'center', HF);
      c.fillStyle = ink; c.globalAlpha *= 0.55; c.fillRect(-14, -18, 20, 4);
      c.restore();
    };
    const appIcon = (kind: string, x: number, y: number, s: number, press = 1) => {
      c.save(); c.translate(x, y); c.scale(s * press, s * press);
      const R = 55, r = 25;
      const C: Record<string, [string, string]> = { word: ['#3b82f6', '#1d4ed8'], excel: ['#22c55e', '#15803d'], pdf: ['#f87171', '#dc2626'], folder: ['#fde68a', '#f59e0b'], mail: ['#7dd3fc', '#0284c7'], hr: [A, A2] };
      const g = c.createLinearGradient(0, -R, 0, R); g.addColorStop(0, C[kind][0]); g.addColorStop(1, C[kind][1]);
      c.shadowColor = 'rgba(0,0,0,0.2)'; c.shadowBlur = 16; c.shadowOffsetY = 7;
      rr(-R, -R, 2 * R, 2 * R, r); c.fillStyle = g; c.fill(); c.shadowColor = 'transparent';
      const gl = c.createLinearGradient(0, -R, 0, 0); gl.addColorStop(0, 'rgba(255,255,255,0.35)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      rr(-R, -R, 2 * R, R, r); c.fillStyle = gl; c.fill();
      c.fillStyle = '#fff'; c.strokeStyle = '#fff';
      if (kind === 'word' || kind === 'excel') { rr(-22, -30, 50, 60, 6); c.globalAlpha *= 0.35; c.fill(); c.globalAlpha /= 0.35; text(kind === 'word' ? 'W' : 'X', -6, 2, 800, 46, '#fff', 'center', UF); }
      else if (kind === 'pdf') { rr(-24, -32, 48, 64, 6); c.fill(); text('PDF', 0, 10, 800, 20, '#dc2626', 'center', UF); }
      else if (kind === 'folder') { c.fillStyle = '#b45309'; rr(-34, -22, 30, 12, 4); c.fill(); c.fillStyle = '#fff7ed'; rr(-34, -16, 68, 44, 8); c.fill(); }
      else if (kind === 'mail') { rr(-32, -22, 64, 44, 7); c.fill(); c.beginPath(); c.moveTo(-30, -18); c.lineTo(0, 6); c.lineTo(30, -18); c.strokeStyle = '#0284c7'; c.lineWidth = 5; c.stroke(); }
      else if (kind === 'hr') mark(0, 0, 1);
      c.restore();
    };
    // a document page: the user's picture, or a drawn placeholder page
    const page = (i: number, x: number, y: number, w: number, rot = 0, a = 1, o: { lift?: boolean; title?: string; btn?: '' | 'go' | 'done'; tag?: string } = {}) => {
      if (a <= 0.003) return;
      const h = w * 1.294;
      c.save(); c.globalAlpha *= a; c.translate(x, y); c.rotate(rot);
      c.shadowColor = 'rgba(20,30,70,0.25)'; c.shadowBlur = o.lift ? 60 : 30; c.shadowOffsetY = o.lift ? 26 : 12;
      rr(-w / 2, -h / 2, w, h, w * 0.045); c.fillStyle = '#fff'; c.fill(); c.shadowColor = 'transparent';
      c.save(); rr(-w / 2, -h / 2, w, h, w * 0.045); c.clip();
      const img = imgs[i % DOCS];
      if (img) c.drawImage(img, -w / 2, -h / 2, w, h);
      else {
        c.fillStyle = '#e8ecf5'; c.fillRect(-w / 2 + w * 0.12, -h / 2 + w * 0.12, w * 0.5, w * 0.05);
        for (let k = 0; k < 14; k++) { c.fillStyle = k % 5 === 0 ? '#c7d2fe' : '#eef1f7'; c.fillRect(-w / 2 + w * 0.12, -h / 2 + w * (0.3 + k * 0.075), w * (0.76 - (hash(i * 9 + k) * 0.3)), w * 0.025); }
      }
      if (o.title) { const gg = c.createLinearGradient(0, h / 2 - w * 0.42, 0, h / 2); gg.addColorStop(0, 'rgba(10,14,30,0)'); gg.addColorStop(1, 'rgba(10,14,30,0.8)'); c.fillStyle = gg; c.fillRect(-w / 2, h / 2 - w * 0.42, w, w * 0.42); }
      c.restore();
      if (o.tag) { rr(-w / 2 + w * 0.07, -h / 2 + w * 0.07, w * 0.24, w * 0.055, w * 0.03); c.fillStyle = o.tag; c.fill(); }
      if (o.title) { font(600, Math.round(w * 0.07), UF); c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(o.title, -w / 2 + w * 0.07, h / 2 - w * 0.08); }
      if (o.btn) {
        const bw = w * 0.4, bh = w * 0.13, bx = w / 2 - bw - w * 0.06, by = -h / 2 + w * 0.06;
        rr(bx, by, bw, bh, bh / 2); c.fillStyle = o.btn === 'done' ? '#111827' : '#ef4444'; c.fill();
        text(o.btn === 'done' ? 'Татсан ✓' : 'Татах', bx + bw / 2, by + bh / 2 + 1, 700, Math.round(w * 0.065), '#fff', 'center', UF);
      }
      c.restore();
    };
    const darkBg = (t: number) => {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b1230'); g.addColorStop(1, '#04050c'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(120,150,255,0.06)'; c.lineWidth = 1.5;
      const o = (t * 24) % 90;
      for (let x = -90 + o; x < W; x += 90) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
      for (let y = -90 + o; y < H; y += 90) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      const gl = c.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.36, 900); gl.addColorStop(0, `rgba(${hexRgb(A)},0.32)`); gl.addColorStop(1, `rgba(${hexRgb(A)},0)`); c.fillStyle = gl; c.fillRect(0, 0, W, H);
    };
    const headline = (s: string, y: number, a: number, px = 64, col = '#fff') => {
      if (a <= 0) return;
      c.save(); c.globalAlpha *= clamp(a);
      const size = fit(s, W - 140, 800, px, HF);
      text(s, W / 2, y + 26 * (1 - eo(a)), 800, size, col, 'center', HF, -size * 0.01);
      c.restore();
    };
    const kicker = (s: string, y: number, a: number, col: string) => {
      if (a <= 0) return;
      c.save(); c.globalAlpha *= clamp(a);
      font(600, 26, UF, 6); const w = c.measureText(s).width + 60; (c as any).letterSpacing = '0px';
      rr(W / 2 - w / 2, y - 26, w, 52, 26); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fill(); c.strokeStyle = `rgba(${hexRgb(col)},0.6)`; c.lineWidth = 2; c.stroke();
      text(s, W / 2 + 3, y + 1, 600, 26, col, 'center', UF, 6);
      c.restore();
    };

    // ---------------------------------------------------------------- pre-renders
    const buildSky = () => {
      const s = document.createElement('canvas'); s.width = 1300; s.height = 2100; const x = s.getContext('2d')!;
      const g = x.createLinearGradient(0, 0, 0, 2100);
      g.addColorStop(0, '#3a86f5'); g.addColorStop(0.42, '#a3d3ff'); g.addColorStop(0.55, '#eaf6ff'); g.addColorStop(0.56, '#cde6c4'); g.addColorStop(1, '#2c7a2a');
      x.fillStyle = g; x.fillRect(0, 0, 1300, 2100);
      x.filter = 'blur(30px)';
      for (let i = 0; i < 22; i++) { x.fillStyle = `rgba(255,255,255,${0.35 + hash(i) * 0.5})`; x.beginPath(); x.ellipse(hash(i + 3) * 1300, 120 + hash(i + 7) * 880, 120 + hash(i + 9) * 220, 50 + hash(i + 11) * 70, 0, 0, Math.PI * 2); x.fill(); }
      x.filter = 'none';
      ([['#79b860', 1180, 70], ['#4f9a3a', 1260, 80], ['#2f7d2c', 1360, 50]] as [string, number, number][]).forEach(([col, y0, a], k) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, 2100); for (let u = 0; u <= 1300; u += 20) x.lineTo(u, y0 + Math.sin(u / 300 + k * 2) * a + Math.sin(u / 110 + k) * 10); x.lineTo(1300, 2100); x.fill(); });
      for (let i = 0; i < 2600; i++) {
        const u = hash(i * 1.3) * 1300, v = 1380 + hash(i * 2.7) * 720, h = 26 + hash(i * 4.1) * 80;
        x.strokeStyle = `rgba(${30 + hash(i) * 60 | 0},${110 + hash(i * 5) * 90 | 0},${30 + hash(i * 6) * 30 | 0},0.9)`; x.lineWidth = 2 + hash(i * 7) * 2.5;
        x.beginPath(); x.moveTo(u, v); x.quadraticCurveTo(u + 6, v - h / 2, u + (hash(i * 8) - 0.5) * 26, v - h); x.stroke();
      }
      for (let i = 0; i < 120; i++) { const u = hash(i * 9.1) * 1300, v = 1420 + hash(i * 3.3) * 640, r = 6 + hash(i) * 11; x.fillStyle = '#fff'; for (let p = 0; p < 8; p++) { x.beginPath(); x.ellipse(u + Math.cos(p * 0.785) * r, v + Math.sin(p * 0.785) * r * 0.6, r * 0.7, r * 0.3, p * 0.785, 0, Math.PI * 2); x.fill(); } x.fillStyle = '#facc15'; x.beginPath(); x.arc(u, v, r * 0.45, 0, Math.PI * 2); x.fill(); }
      const b = document.createElement('canvas'); b.width = 1300; b.height = 2100; const bx = b.getContext('2d')!; bx.filter = 'blur(26px)'; bx.drawImage(s, 0, 0);
      sky = s; skyBlur = b;
      for (let yy = -210; yy < 210; yy += 7) for (let xx = -210; xx < 210; xx += 7) if (xx * xx + yy * yy < 150 * 150) particles.push([xx, yy, hash(xx * 7 + yy), hash(xx + yy * 13)]);
    };

    // ---------------------------------------------------------------- scenes
    const DOCK = ['folder', 'word', 'excel', 'hr', 'pdf'];
    const dock = (t: number) => {
      c.fillStyle = '#ececee'; c.fillRect(0, 0, W, H);
      const vg = c.createRadialGradient(W / 2, H * 0.42, 200, W / 2, H * 0.42, 1300); vg.addColorStop(0, 'rgba(255,255,255,0.7)'); vg.addColorStop(1, 'rgba(0,0,0,0.1)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
      headline('Таны оффисын туслах', 520, seg(t, 0.25, 0.85), 58, '#111827');
      c.save(); c.globalAlpha *= seg(t, 0.5, 1.0); text('Office · HR · Бизнес', W / 2, 600, 500, 30, '#6b7280', 'center', UF, 3); c.restore();
      const cam = 1 + 0.1 * eio(seg(t, 0, 4.1));
      c.save(); c.translate(W / 2, 860); c.scale(cam, cam); c.translate(-W / 2, -860);
      const step = 150, base = (i: number) => W / 2 + (i - 2) * step;
      const [cx, cy] = keys(t, [[0, 980, 560], [0.7, 900, 640], [1.5, base(0), 870], [2.5, base(4) + 10, 875], [3.35, base(3) + 6, 872], [3.9, base(3) + 4, 868]]);
      const intro = back(seg(t, 0.1, 0.65));
      c.save(); c.globalAlpha *= clamp(t / 0.35); c.translate(W / 2, 860); c.scale(0.85 + 0.15 * intro, 0.85 + 0.15 * intro); c.translate(-W / 2, -860);
      const mag = DOCK.map((_, i) => 1 + 0.42 * Math.exp(-Math.pow((cx - base(i)) / 170, 2)));
      const total = mag.reduce((a, m) => a + 112 * m + 26, -26);
      let x0 = W / 2 - total / 2;
      rr(x0 - 24, 860 - 84, total + 48, 168, 48); c.fillStyle = 'rgba(255,255,255,0.78)'; c.shadowColor = 'rgba(0,0,0,0.12)'; c.shadowBlur = 50; c.shadowOffsetY = 16; c.fill(); c.shadowColor = 'transparent';
      c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 2; c.stroke();
      let hr: [number, number] = [W / 2, 860];
      DOCK.forEach((k, i) => {
        const w = 112 * mag[i]; const ix = x0 + w / 2; x0 += w + 26;
        const press = k === 'hr' ? 1 - 0.12 * Math.sin(Math.PI * seg(t, 3.82, 4.05)) : 1;
        const lift = (mag[i] - 1) * 46;
        appIcon(k, ix, 860 - lift, mag[i] * 0.98, press);
        if (k === 'hr') hr = [ix, 860 - lift];
      });
      c.restore();
      if (t > 3.3) { const a = seg(t, 3.3, 3.45); c.save(); c.globalAlpha *= a; font(600, 28, UF); const tw = c.measureText(fmt(P.brand)).width + 50; rr(hr[0] - tw / 2, 860 - 215, tw, 60, 16); c.fillStyle = 'rgba(20,24,40,0.88)'; c.fill(); text(fmt(P.brand), hr[0], 860 - 185, 600, 28, '#fff', 'center', UF); c.restore(); }
      cursor(cx, cy, t > 3.82 && t < 4.02 ? 0.86 : 1, clamp((t - 0.4) / 0.3));
      c.restore();
    };
    const burst = (t: number) => {
      const k = seg(t, 4.05, 4.6), cx = W / 2, cy = 860;
      c.fillStyle = '#ececee'; c.fillRect(0, 0, W, H);
      const R = 2300 * eo5(k);
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, R)); g.addColorStop(0, '#5579ff'); g.addColorStop(1, A);
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
      for (let i = 0; i < 160; i++) {
        const a = hash(i) * Math.PI * 2, sp = 300 + hash(i + 1) * 1000, life = seg(t, 4.05 + hash(i + 2) * 0.15, 5.0);
        if (life <= 0 || life >= 1) continue;
        const d = sp * eo(life), s = 12 + hash(i + 3) * 40;
        c.save(); c.globalAlpha *= 1 - life; c.fillStyle = i % 3 ? '#ffffff' : '#a5b8ff'; c.fillRect(cx + Math.cos(a) * d - s / 2, cy + Math.sin(a) * d - s / 2, s, s); c.restore();
      }
      if (t < 4.3) return;
      for (let i = 5; i >= 1; i--) { c.beginPath(); c.arc(cx, cy, (190 + i * 150) * (0.92 + 0.08 * seg(t, 4.3, 6.7)), 0, Math.PI * 2); c.fillStyle = `rgba(255,255,255,${0.03 + 0.018 * (5 - i)})`; c.fill(); }
      const ls = back(seg(t, 4.35, 4.85)), dis = seg(t, 6.05, 6.7);
      const wa = seg(t, 4.8, 5.3);
      if (dis <= 0) {
        c.save(); c.translate(cx, cy); c.scale(ls, ls);
        c.shadowColor = 'rgba(0,0,0,0.28)'; c.shadowBlur = 60; c.shadowOffsetY = 24;
        const lg = c.createLinearGradient(0, -150, 0, 150); lg.addColorStop(0, '#6a88ff'); lg.addColorStop(1, '#2443e0');
        c.beginPath(); c.arc(0, 0, 150, 0, Math.PI * 2); c.fillStyle = lg; c.fill(); c.shadowColor = 'transparent';
        c.lineWidth = 10; c.strokeStyle = 'rgba(255,255,255,0.92)'; c.stroke();
        mark(0, 0, 2.6);
        c.restore();
      } else {
        for (const [px, py, r1, r2] of particles) {
          const q = clamp((dis - (px + 210) / 420 * 0.45) / 0.55);
          const x = cx + px + eo(q) * (420 + r1 * 520), y = cy + py - eo(q) * (300 + r2 * 400) + Math.sin(r1 * 9 + q * 6) * 30 * q;
          const rad = Math.hypot(px, py);
          c.save(); c.globalAlpha *= 1 - q; c.fillStyle = rad > 136 || (Math.abs(px) < 62 && Math.abs(py) < 82) ? '#ffffff' : (r1 > 0.5 ? '#5577ff' : '#3a5cf5'); c.fillRect(x, y, 6, 6); c.restore();
        }
      }
      const name = fmt(P.brand);
      const words = name.split(' ');
      const top = words.slice(0, Math.ceil(words.length / 2)).join(' '), bot = words.slice(Math.ceil(words.length / 2)).join(' ');
      c.save(); c.globalAlpha *= wa * (1 - dis);
      text(top, cx, cy + 270 + 24 * (1 - eo(wa)), 800, fit(top, W - 160, 800, 74, HF), '#fff', 'center', HF, -1);
      text(bot, cx, cy + 355 + 24 * (1 - eo(wa)), 300, fit(bot, W - 160, 300, 50, HF), 'rgba(255,255,255,0.85)', 'center', HF, 12);
      c.restore();
    };
    const search = (t: number) => {
      const pan = (t - 6.4) * 12;
      c.drawImage(sky!, -110 - pan, -90, 1300, 2100);
      const q = fmt(P.query);
      const zin = eio(seg(t, 7.0, 7.6)), zout = eio(seg(t, 9.75, 10.25));
      const z = 1 + 0.75 * zin * (1 - zout);
      const typed = Math.round(q.length * seg(t, 7.55, 9.5));
      const bw = 900, bh = 120, bx = W / 2 - bw / 2, by = 780;
      font(500, 40, UF);
      const tw = c.measureText(q.slice(0, typed)).width;
      const caretX = bx + 120 + tw;
      const fx = lerp(W / 2, clamp(caretX, bx + 330, bx + bw - 260), zin * (1 - zout)), fy = by + bh / 2;
      headline('Хэрэгтэй загвараа хайгаарай', 520, seg(t, 6.75, 7.2) * (1 - zin) + seg(t, 10.2, 10.5) * 0, 54, '#ffffff');
      c.save(); c.translate(W / 2, fy); c.scale(z, z); c.translate(-fx, -fy);
      const ap = back(seg(t, 6.45, 6.95)), press = 1 - 0.03 * Math.sin(Math.PI * seg(t, 6.85, 7.05));
      c.save(); c.translate(W / 2, fy); c.scale(ap * press, ap * press); c.translate(-W / 2, -fy);
      c.globalAlpha *= seg(t, 6.4, 6.7);
      c.save(); rr(bx, by, bw, bh, 60); c.clip(); c.drawImage(skyBlur!, -110 - pan, -90, 1300, 2100); c.fillStyle = 'rgba(255,255,255,0.74)'; c.fillRect(bx, by, bw, bh); c.restore();
      rr(bx, by, bw, bh, 60); c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 2.5; c.shadowColor = 'rgba(0,40,90,0.2)'; c.shadowBlur = 50; c.shadowOffsetY = 18; c.stroke(); c.shadowColor = 'transparent';
      c.beginPath(); c.arc(bx + 66, fy, 32, 0, Math.PI * 2); c.fillStyle = A; c.fill(); mark(bx + 66, fy, 0.66);
      if (typed === 0) text('Загвар хайх...', bx + 120, fy, 400, 40, '#8a94a6', 'left', UF);
      else {
        const s = q.slice(0, typed), cut = s.lastIndexOf(' ', s.length - 2), done = cut > 0 ? s.slice(0, cut + 1) : '';
        text(done, bx + 120, fy, 500, 40, '#111827', 'left', UF);
        font(500, 40, UF); const dw = c.measureText(done).width;
        text(s.slice(done.length), bx + 120 + dw, fy, 600, 40, A, 'left', UF);
      }
      if (t > 7.0 && t < 10.6 && Math.floor(t * 2.2) % 2 === 0) { c.fillStyle = A; c.fillRect(caretX + 4, by + 34, 4, 52); }
      const sp = 1 - 0.12 * Math.sin(Math.PI * seg(t, 10.2, 10.4));
      c.save(); c.translate(bx + bw - 70, fy); c.scale(sp, sp);
      c.beginPath(); c.arc(0, 0, 40, 0, Math.PI * 2); c.fillStyle = t > 10.2 ? A : `rgba(${hexRgb(A)},0.1)`; c.fill();
      c.beginPath(); c.arc(-5, -5, 15, 0, Math.PI * 2); c.strokeStyle = t > 10.2 ? '#fff' : '#111827'; c.lineWidth = 5; c.stroke();
      c.beginPath(); c.moveTo(6, 6); c.lineTo(17, 17); c.stroke();
      c.restore(); c.restore();
      ripple(bx + bw - 70, fy, seg(t, 10.22, 10.65), hexRgb(A));
      c.restore();
      const [mx, my] = keys(t, [[6.5, 900, 1100], [6.85, 260, 850], [7.0, 250, 852], [9.8, 700, 1050], [10.15, bx + bw - 64, fy + 6], [10.8, bx + bw - 64, fy + 6]]);
      ripple(250, 850, seg(t, 6.86, 7.2), hexRgb(A));
      cursor(mx, my, (t > 6.85 && t < 7.0) || (t > 10.2 && t < 10.38) ? 0.86 : 1, t < 7.0 ? clamp((t - 6.5) / 0.2) : clamp((t - 9.75) / 0.2));
    };
    const CAT_T = [10.9, 11.81, 12.49, 13.22];
    const COLS = ['#ef4444', '#f59e0b', A, '#10b981'];
    const cats = (t: number) => {
      darkBg(t);
      const list = lines(P.cats).map((l) => { const [n, v] = l.split('|'); return [n.trim(), Number(v) || 0] as [string, number]; }).slice(0, 4);
      kicker('ӨДӨР БҮР ХЭРЭГТЭЙ', 150, seg(t, 10.75, 11.1), '#9fb4ff');
      headline('Бүх бичиг баримт', 240, seg(t, 10.8, 11.2), 66);
      list.forEach(([name, n], i) => {
        const k = back(seg(t, CAT_T[i], CAT_T[i] + 0.55));
        if (k <= 0) return;
        const cw = 440, ch = 360, x = W / 2 + (i % 2 ? 1 : -1) * 240, y = 630 + Math.floor(i / 2) * 455;
        c.save(); c.translate(x, y + (1 - k) * 160); c.globalAlpha *= clamp(k * 1.5);
        const fan = eo(seg(t, CAT_T[i] + 0.2, CAT_T[i] + 0.9));
        for (let j = 0; j < 3; j++) page(i * 3 + j, (j - 1) * 60 * fan, -ch / 2 + 40 - 30 * fan, 130, (j - 1) * 0.17 * fan, 1);
        rr(-cw / 2, -ch / 2 + 70, cw, ch - 70, 36);
        const cg = c.createLinearGradient(0, -ch / 2, 0, ch / 2); cg.addColorStop(0, 'rgba(255,255,255,0.12)'); cg.addColorStop(1, 'rgba(255,255,255,0.04)');
        c.fillStyle = cg; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.16)'; c.lineWidth = 2; c.stroke();
        rr(-cw / 2 + 40, -ch / 2 + 70, cw - 80, 8, 4); c.fillStyle = COLS[i]; c.fill();
        const cnt = Math.round(n * eo(seg(t, CAT_T[i] + 0.1, CAT_T[i] + 1.1)));
        text(String(cnt), 0, 50, 600, 130, '#fff', 'center', NF);
        text(name, 0, 145, 700, fit(name, cw - 60, 700, 36, HF), '#fff', 'center', HF);
        c.restore();
      });
    };
    const roll = (t: number) => {
      c.fillStyle = '#05060a'; c.fillRect(0, 0, W, H);
      c.save(); c.globalAlpha *= 0.16; c.filter = 'blur(6px)';
      for (let r = 0; r < 14; r++) for (let k = 0; k < 11; k++) { rr(k * 104 - 30 + (r % 2) * 44, r * 140 + 10, 88, 112, 16); c.fillStyle = '#2a2f3d'; c.fill(); }
      c.restore(); c.filter = 'none';
      const words = lines(P.roll); if (!words.length) return;
      const pos = eio(seg(t, 16.45, 18.5)) * (words.length - 1);
      const cy = 780, lh = 104;
      for (let i = 0; i < words.length; i++) {
        const d = i - pos; if (Math.abs(d) > 6) continue;
        const near = Math.exp(-d * d * 2.2);
        c.save(); c.globalAlpha *= (0.18 + 0.82 * near) * Math.exp(-d * d * 0.07);
        text(words[i], W / 2, cy + d * lh, 600, 80, near > 0.5 ? '#ffffff' : '#9aa3b2', 'center', HF);
        c.restore();
      }
      const ci = Math.round(pos); font(600, 80, HF); const bw = c.measureText(words[ci]).width + 60;
      c.strokeStyle = '#3b82f6'; c.lineWidth = 4; c.strokeRect(W / 2 - bw / 2, cy - 58, bw, 116);
      c.fillStyle = '#fff'; for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.fillRect(W / 2 + sx * bw / 2 - 8, cy + sy * 58 - 8, 16, 16); c.strokeRect(W / 2 + sx * bw / 2 - 8, cy + sy * 58 - 8, 16, 16); }
    };
    const grid = (t: number) => {
      c.fillStyle = '#f4f6fb'; c.fillRect(0, 0, W, H);
      const scroll = 300 * eo(seg(t, 18.6, 19.6)) + 120 * eio(seg(t, 21.0, 22.8));
      const colW = 300, gap = 34, x0 = W / 2 - (colW + gap);
      let hover: { x: number; y: number } | null = null;
      for (let col = 0; col < 3; col++) for (let r = -1; r < 6; r++) {
        const n = (col * 5 + r * 3 + 40) % DOCS;
        const x = x0 + col * (colW + gap), y = 260 + r * (colW * 1.294 + gap) + (col % 2) * 190 - scroll;
        if (y < -500 || y > H + 500) continue;
        const intro = back(seg(t, 18.55 + ((col + r + 1) % 4) * 0.07, 19.1 + ((col + r + 1) % 4) * 0.07));
        if (col === 1 && r === 2) { hover = { x, y }; continue; }
        page(n, x, y + (1 - intro) * 140, colW * (0.6 + 0.4 * intro), 0, clamp(intro * 1.4), { tag: COLS[n % 4] });
      }
      // the chosen template: hover, download, then it comes forward to be filled in
      const fwd = eio(seg(t, 21.0, 21.6));
      if (hover) {
        const lift = eo(seg(t, 19.55, 19.85));
        const intro = back(seg(t, 18.6, 19.2));
        const x = lerp(hover.x, W / 2, fwd), y = lerp(hover.y - lift * 16, 760, fwd), w = colW * (0.6 + 0.4 * intro) * (1 + 0.06 * lift) * (1 + 1.25 * fwd);
        if (fwd > 0) { c.save(); c.fillStyle = `rgba(4,6,14,${0.55 * fwd})`; c.fillRect(0, 0, W, H); c.restore(); }
        page(3, x, y, w, 0, clamp(intro * 1.4), { lift: lift > 0, btn: lift > 0.3 && fwd < 0.3 ? (t > 20.3 ? 'done' : 'go') : '', tag: COLS[0] });
        // typing into the document: a highlighted field fills in
        if (fwd > 0.6) {
          const fill = fmt(P.fill), n = Math.round(fill.length * seg(t, 21.6, 22.6));
          const fw = w * 0.78, fh = w * 0.1, fxx = x - fw / 2, fyy = y - w * 1.294 / 2 + w * 0.3;
          c.save(); c.globalAlpha *= seg(t, 21.5, 21.7);
          rr(fxx, fyy, fw, fh, 10); c.fillStyle = `rgba(${hexRgb(A)},0.12)`; c.fill(); c.strokeStyle = A; c.lineWidth = 3; c.stroke();
          text(fill.slice(0, n), fxx + 22, fyy + fh / 2, 700, Math.round(fh * 0.5), '#111827', 'left', UF);
          font(700, Math.round(fh * 0.5), UF); const cw2 = c.measureText(fill.slice(0, n)).width;
          if (Math.floor(t * 2.4) % 2 === 0) { c.fillStyle = A; c.fillRect(fxx + 24 + cw2, fyy + fh * 0.2, 4, fh * 0.6); }
          c.restore();
        }
        const bx = hover.x + colW * 1.06 / 2 - colW * 1.06 * 0.26, byy = hover.y - 16 - colW * 1.06 * 1.294 / 2 + colW * 1.06 * 0.125;
        const [mx, my] = keys(t, [[19.0, 950, 1250], [19.6, hover.x + 30, hover.y + 60], [20.15, bx, byy], [20.9, bx + 10, byy + 8], [21.4, 1000, 1300]]);
        ripple(bx, byy, seg(t, 20.3, 20.75), '239,68,68');
        cursor(mx, my, t > 20.25 && t < 20.45 ? 0.86 : 1, clamp((t - 19.0) / 0.25) * (1 - seg(t, 21.0, 21.3)));
      }
      const ha = seg(t, 18.9, 19.3) * (1 - fwd);
      if (ha > 0) { c.save(); c.globalAlpha *= ha; rr(W / 2 - 360, 90, 720, 86, 43); c.fillStyle = 'rgba(255,255,255,0.95)'; c.shadowColor = 'rgba(0,0,0,0.1)'; c.shadowBlur = 30; c.fill(); c.shadowColor = 'transparent'; text('🔎  ' + fmt(P.query), W / 2, 133, 600, fit('🔎  ' + fmt(P.query), 640, 600, 36, UF), '#111827', 'center', UF); c.restore(); }
      if (fwd > 0.7) headline('Мэдээллээ оруулаад л болно', 260, seg(t, 21.7, 22.1), 54);
      if (t > 22.45) { const k = eio(seg(t, 22.45, 23.0)); c.fillStyle = '#05070f'; c.beginPath(); c.arc(W / 2, 760, 2300 * k, 0, Math.PI * 2); c.fill(); }
    };
    const counter = (t: number) => {
      darkBg(t);
      const items = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2 + t * 0.4; return { i, z: Math.cos(a), x: Math.sin(a) * 470, y: -Math.cos(a) * 140 + Math.sin(a * 2 + i) * 16 }; }).sort((p, q) => p.z - q.z);
      const intro = eo(seg(t, 22.95, 23.9));
      for (const it of items) page(it.i, W / 2 + it.x, 760 + it.y - (1 - intro) * 220, 200 * (0.55 + 0.35 * (it.z + 1) / 2) * intro, it.x / 3000, (0.25 + 0.75 * (it.z + 1) / 2) * intro);
      const pl = c.createRadialGradient(W / 2, 740, 0, W / 2, 740, 460); pl.addColorStop(0, 'rgba(5,8,20,0.94)'); pl.addColorStop(0.6, 'rgba(5,8,20,0.6)'); pl.addColorStop(1, 'rgba(5,8,20,0)'); c.fillStyle = pl; c.fillRect(0, 0, W, H);
      const total = Math.round(Number(P.total ?? 110));
      const n = Math.round(total * eo(seg(t, 23.1, 25.2)));
      const pulse = 1 + 0.05 * Math.exp(-Math.pow((t - 25.25) * 6, 2));
      c.save(); c.translate(W / 2, 700); c.scale(pulse, pulse);
      c.shadowColor = `rgba(${hexRgb(A)},0.9)`; c.shadowBlur = 70;
      const gr = c.createLinearGradient(0, -140, 0, 140); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#b9c8ff');
      text(n + '+', 0, 0, 700, 300, gr, 'center', NF); c.shadowColor = 'transparent';
      c.restore();
      headline('баримт бичгийн загвар', 900, seg(t, 23.6, 24.1), 52, '#c7d3ff');
      kicker('НЭГ ДОР', 1000, seg(t, 25.95, 26.3), '#ffffff');
      if (t > 27.6) { c.fillStyle = `rgba(0,0,0,${seg(t, 27.6, 28.0)})`; c.fillRect(0, 0, W, H); }
    };
    const edit = (t: number) => {
      c.fillStyle = '#eef1f8'; c.fillRect(0, 0, W, H);
      const g = c.createRadialGradient(W / 2, 700, 0, W / 2, 700, 1100); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#dfe5f3'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // two app windows: Word and Excel, with the document being edited
      const k1 = back(seg(t, 28.1, 28.7)), k2 = back(seg(t, 28.9, 29.5));
      const win = (x: number, y: number, w: number, h: number, kind: 'word' | 'excel', k: number) => {
        if (k <= 0) return;
        c.save(); c.translate(x, y); c.scale(k, k); c.globalAlpha *= clamp(k);
        c.shadowColor = 'rgba(20,30,70,0.25)'; c.shadowBlur = 60; c.shadowOffsetY = 24;
        rr(-w / 2, -h / 2, w, h, 26); c.fillStyle = '#fff'; c.fill(); c.shadowColor = 'transparent';
        c.save(); rr(-w / 2, -h / 2, w, h, 26); c.clip();
        c.fillStyle = kind === 'word' ? '#2b579a' : '#217346'; c.fillRect(-w / 2, -h / 2, w, 70);
        text(kind === 'word' ? 'Word' : 'Excel', -w / 2 + 90, -h / 2 + 36, 700, 30, '#fff', 'left', UF);
        appIcon(kind, -w / 2 + 50, -h / 2 + 35, 0.42);
        if (kind === 'word') {
          page(4, 0, 50, w * 0.72, 0, 1);
          const field = fmt(P.fill), n = Math.round(field.length * seg(t, 29.3, 30.6));
          const fw = w * 0.6, fh = 48, fx = -fw / 2, fy = -h / 2 + 150;
          rr(fx, fy, fw, fh, 8); c.fillStyle = `rgba(${hexRgb(A)},0.12)`; c.fill(); c.strokeStyle = A; c.lineWidth = 3; c.stroke();
          text(field.slice(0, n), fx + 16, fy + fh / 2, 700, 26, '#111827', 'left', UF);
        } else {
          for (let r = 0; r < 12; r++) for (let q = 0; q < 5; q++) { c.strokeStyle = '#e5e7eb'; c.lineWidth = 1.5; c.strokeRect(-w / 2 + 30 + q * ((w - 60) / 5), -h / 2 + 100 + r * 44, (w - 60) / 5, 44); }
          c.fillStyle = 'rgba(33,115,70,0.12)'; c.fillRect(-w / 2 + 30, -h / 2 + 100, w - 60, 44);
          const hi = Math.floor(seg(t, 29.6, 31.0) * 10);
          for (let r = 1; r <= hi; r++) text(String((r * 37) % 90 + 10), -w / 2 + 30 + 2.5 * ((w - 60) / 5), -h / 2 + 122 + r * 44, 500, 22, '#111827', 'center', UF);
          c.strokeStyle = '#217346'; c.lineWidth = 4; c.strokeRect(-w / 2 + 30 + 2 * ((w - 60) / 5), -h / 2 + 100 + Math.max(1, hi) * 44, (w - 60) / 5, 44);
        }
        c.restore(); c.restore();
      };
      win(W / 2 + 120, 860, 620, 780, 'excel', k2);
      win(W / 2 - 110, 760, 640, 820, 'word', k1);
      headline('Word, Excel дээр', 240, seg(t, 28.2, 28.6), 64, '#111827');
      kicker('ШУУД ЗАСВАРЛАНА', 330, seg(t, 28.6, 28.9), A);
      if (t > 31.15) { const k = eio(seg(t, 31.15, 31.6)); c.fillStyle = A; c.beginPath(); c.arc(W / 2, 760, 2300 * k, 0, Math.PI * 2); c.fill(); }
    };
    const reveal = (t: number) => {
      const g = c.createRadialGradient(W / 2, 620, 0, W / 2, 620, 1400); g.addColorStop(0, '#5579ff'); g.addColorStop(1, '#1a33c4'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      for (let i = 5; i >= 1; i--) { c.beginPath(); c.arc(W / 2, 560, (140 + i * 140) * (0.95 + 0.05 * seg(t, 31.4, 33.5)), 0, Math.PI * 2); c.fillStyle = `rgba(255,255,255,${0.03 + 0.016 * (5 - i)})`; c.fill(); }
      const ls = back(seg(t, 31.55, 32.05));
      c.save(); c.translate(W / 2, 560); c.scale(ls, ls);
      c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 60; c.shadowOffsetY = 24; c.beginPath(); c.arc(0, 0, 140, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.shadowColor = 'transparent';
      mark(0, 0, 2.5, A, '#fff'); c.restore();
      const words = fmt(P.brand).split(' ');
      const top = words.slice(0, Math.ceil(words.length / 2)).join(' '), bot = words.slice(Math.ceil(words.length / 2)).join(' ');
      const a = seg(t, 31.9, 32.4);
      c.save(); c.globalAlpha *= a;
      text(top, W / 2, 800 + 24 * (1 - eo(a)), 800, fit(top, W - 160, 800, 84, HF), '#fff', 'center', HF, -1);
      text(bot, W / 2, 890 + 24 * (1 - eo(a)), 300, fit(bot, W - 160, 300, 56, HF), 'rgba(255,255,255,0.88)', 'center', HF, 14);
      c.restore();
    };
    const price = (t: number) => {
      reveal(Math.min(t, 33.5));
      const k = back(seg(t, 33.6, 34.1));
      if (k <= 0) return;
      c.save(); c.translate(W / 2, 1010 + (1 - k) * 80); c.globalAlpha *= clamp(k * 1.4);
      const old = fmt(P.oldPrice), nw = fmt(P.newPrice);
      // old price, struck through as it is said
      font(600, 60, NF); const ow = c.measureText(old).width;
      text(old, 0, -10, 600, 60, 'rgba(255,255,255,0.7)', 'center', NF);
      const st = eo(seg(t, 34.6, 35.0));
      c.strokeStyle = '#ff4d6d'; c.lineWidth = 7; c.beginPath(); c.moveTo(-ow / 2 - 14, -6); c.lineTo(-ow / 2 - 14 + (ow + 28) * st, -16); c.stroke();
      c.restore();
      const k2 = back(seg(t, 35.0, 35.5));
      if (k2 > 0) {
        c.save(); c.translate(W / 2, 1135); c.scale(k2, k2);
        rr(-280, -80, 560, 160, 80); c.fillStyle = '#ffffff'; c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 40; c.shadowOffsetY = 14; c.fill(); c.shadowColor = 'transparent';
        text(nw, 0, 4, 700, fit(nw, 480, 700, 100, NF), A, 'center', NF);
        c.restore();
        c.save(); c.globalAlpha *= seg(t, 35.3, 35.6);
        rr(W / 2 + 170, 1018, 170, 56, 28); c.fillStyle = '#ffcc00'; c.fill(); text('ХЯМДРАЛ', W / 2 + 255, 1047, 800, 24, '#111827', 'center', UF, 2);
        c.restore();
      }
    };
    const cta = (t: number) => {
      darkBg(t);
      headline('Дэлгэрэнгүй мэдээлэл', 300, seg(t, 36.85, 37.3), 62);
      kicker('КОММЕНТ ҮЛДЭЭГЭЭРЭЙ', 395, seg(t, 37.2, 37.5), '#9fb4ff');
      // a social post card with a comment box
      const k = back(seg(t, 36.9, 37.5));
      c.save(); c.translate(W / 2, 800 + (1 - k) * 120); c.globalAlpha *= clamp(k * 1.3);
      rr(-400, -260, 800, 520, 40); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.arc(-320, -180, 40, 0, Math.PI * 2); c.fillStyle = A; c.fill(); mark(-320, -180, 0.8);
      text(fmt(P.brand), -260, -192, 700, 30, '#fff', 'left', UF);
      text('Ивээн тэтгэсэн', -260, -158, 400, 24, '#9aa3b2', 'left', UF);
      for (let i = 0; i < 3; i++) page(i + 3, -230 + i * 230, 10, 180, (i - 1) * 0.05, 1);
      // comment input
      rr(-360, 150, 600, 76, 38); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
      const typed = t > 38.9;
      text(typed ? fmt(P.comment) : 'Сэтгэгдэл бичих…', -320, 188, typed ? 800 : 400, typed ? 40 : 28, typed ? '#fff' : '#8a94a6', 'left', typed ? NF : UF);
      const sp = 1 - 0.14 * Math.sin(Math.PI * seg(t, 39.45, 39.65));
      c.save(); c.translate(310, 188); c.scale(sp, sp); c.beginPath(); c.arc(0, 0, 38, 0, Math.PI * 2); c.fillStyle = A; c.fill();
      c.beginPath(); c.moveTo(-14, -12); c.lineTo(16, 0); c.lineTo(-14, 12); c.lineTo(-8, 0); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.restore();
      c.restore();
      // the comment appears, with hearts
      const posted = seg(t, 39.65, 40.1);
      if (posted > 0) {
        c.save(); c.globalAlpha *= posted; c.translate(W / 2, 1150 - 30 * eo(posted));
        rr(-330, -60, 660, 120, 30); c.fillStyle = '#ffffff'; c.fill();
        c.beginPath(); c.arc(-260, 0, 36, 0, Math.PI * 2); c.fillStyle = '#c7d2fe'; c.fill();
        text('Та', -200, -18, 700, 26, '#111827', 'left', UF);
        text(fmt(P.comment), -200, 18, 800, 40, A, 'left', NF);
        text('♥', 280, 0, 700, 44, '#ef4444', 'center', UF);
        c.restore();
        for (let i = 0; i < 9; i++) { const q = seg(t, 39.8 + i * 0.07, 41.2 + i * 0.07); if (q <= 0 || q >= 1) continue; c.save(); c.globalAlpha *= 1 - q; text('♥', W / 2 + 280 + Math.sin(i * 2.1 + q * 4) * 40, 1150 - q * 420, 700, 40 + i % 3 * 14, i % 2 ? '#ff4d6d' : '#ff8fab', 'center', UF); c.restore(); }
      }
      const [mx, my] = keys(t, [[38.0, 900, 1250], [38.6, W / 2 - 120, 990], [39.2, W / 2 + 300, 990], [40.2, W / 2 + 330, 1010]]);
      cursor(mx, my, (t > 38.6 && t < 38.8) || (t > 39.45 && t < 39.65) ? 0.86 : 1, clamp((t - 38.0) / 0.25) * (1 - seg(t, 40.3, 40.6)));
      // brand sign-off
      const e = seg(t, 40.9, 41.4);
      if (e > 0) { c.save(); c.globalAlpha *= e; reveal(31.4 + Math.min(2.1, (t - 40.9) * 1.6)); c.restore(); }
    };

    const inst: Scene2DInstance = {
      async prepare(prm) {
        P = prm;
        const fams = [fmt(prm.headFont) || 'Montserrat', fmt(prm.uiFont) || 'Roboto Condensed', fmt(prm.numFont) || 'Oswald'];
        try { await Promise.all(fams.flatMap((f) => [300, 400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 40px "${f}"`, 'Аа Өө Үү 0123')))); } catch { /* fallback fonts */ }
        await Promise.all(Array.from({ length: DOCS }, async (_, i) => { srcs[i] = fmt(prm[`doc${i + 1}`]); imgs[i] = await loadImg(srcs[i]); }));
        if (!sky) buildSky();
      },
      draw(ctx, f: FrameState) {
        c = ctx; P = f.params;
        A = fmt(P.accent) || '#2f5bff'; A2 = fmt(P.accent2) || '#7c3aed';
        HF = fmt(P.headFont) || 'Montserrat'; UF = fmt(P.uiFont) || 'Roboto Condensed'; NF = fmt(P.numFont) || 'Oswald';
        for (let i = 0; i < DOCS; i++) {
          const s = fmt(P[`doc${i + 1}`]);
          if (s !== srcs[i]) { srcs[i] = s; imgs[i] = null; loadImg(s).then((im) => { if (srcs[i] === s) { imgs[i] = im; kit.redraw(); } }); }
        }
        if (!sky) buildSky();
        // fit the 1080 x 1920 design into any frame
        const k = Math.min(f.W / W, f.H / H);
        c.save();
        c.fillStyle = '#05070f'; c.fillRect(0, 0, f.W, f.H);
        c.translate((f.W - W * k) / 2, (f.H - H * k) / 2); c.scale(k, k);
        c.beginPath(); c.rect(0, 0, W, H); c.clip();
        const t = f.t;
        if (t < 4.05) dock(t);
        else if (t < 6.4) burst(t);
        else if (t < 10.75) { search(t); if (t < 6.75) { c.save(); c.globalAlpha = 1 - seg(t, 6.4, 6.75); burst(t); c.restore(); } }
        else if (t < 16.4) { cats(t); if (t < 11.0) { c.save(); c.globalAlpha = 1 - seg(t, 10.75, 11.0); search(t); c.restore(); } }
        else if (t < 18.55) roll(t);
        else if (t < 22.95) grid(t);
        else if (t < 28.0) counter(t);
        else if (t < 31.4) edit(t);
        else if (t < 33.55) reveal(t);
        else if (t < 36.8) price(t);
        else cta(t);
        c.restore();
      },
      dispose() { sky = skyBlur = null; },
    };
    return inst;
  },
};

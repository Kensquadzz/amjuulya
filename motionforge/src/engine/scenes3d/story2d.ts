// One storyboard shot per layer (Canvas 2D). Every shot is timed relative to
// its own layer length, so the voice-over generator can give each narration
// section a shot of exactly the right duration. Shots: app dock + click,
// brand burst, glass search with typing, result variants, template grid with
// Save, word roll, kinetic title, feature list, number / price, comment CTA.
// Heavy backgrounds (meadow, keyboard) are built once and shared by all
// layers. 9:16 design space; the band at y ≈ 66–81 % is left for subtitles.
import type { FrameState, SceneDef, Scene2DInstance } from '../scene3d';
import { loadImg } from '../scene3d';
import { SHOT_KINDS, splitList } from '../storyboard';

const fmt = (s: unknown) => String(s ?? '');
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
const eo = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const eo5 = (x: number) => 1 - Math.pow(1 - clamp(x), 5);
const eio = (x: number) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const back = (x: number) => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function keys(t: number, ks: number[][]) {
  if (t <= ks[0][0]) return ks[0].slice(1);
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) { const k = eio((t - ks[i - 1][0]) / Math.max(1e-3, ks[i][0] - ks[i - 1][0])); return ks[i].slice(1).map((v, j) => lerp(ks[i - 1][j + 1], v, k)); }
  }
  return ks[ks.length - 1].slice(1);
}
const lines = (s: unknown) => fmt(s).split('\n').map((x) => x.trim()).filter(Boolean);

const W = 1080, H = 1920, IMGS = 8;

// ---------------------------------------------------------------- shared backgrounds (built once per page)
let MEADOW: HTMLCanvasElement[] | null = null, MEADOW_BLUR: HTMLCanvasElement | null = null, KEYBOARD: HTMLCanvasElement | null = null;
const SHREDS: number[][] = Array.from({ length: 520 }, (_, i) => [hash(i * 3.1) * Math.PI * 2, Math.sqrt(hash(i * 7.7)) * 150, 8 + hash(i * 1.3) * 26, hash(i * 9.9)]);
function buildMeadow() {
  if (MEADOW) return;
  const MW = 1400, MH = 2300;
  const mk = () => { const x = document.createElement('canvas'); x.width = MW; x.height = MH; return x; };
  const sky = mk(), far = mk(), mid = mk(), near = mk(), fore = mk();
  {
    const x = sky.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 0, 1250); g.addColorStop(0, '#2f7ef0'); g.addColorStop(0.55, '#8cc6ff'); g.addColorStop(1, '#f2f9ff');
    x.fillStyle = g; x.fillRect(0, 0, MW, MH);
    const n = document.createElement('canvas'); n.width = 175; n.height = 160; const nx = n.getContext('2d')!; const d = nx.createImageData(175, 160);
    const v = (a: number, b: number) => hash(a * 57.3 + b * 131.7);
    const noise = (px: number, py: number) => { const i = Math.floor(px), j = Math.floor(py), fx = px - i, fy = py - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); return lerp(lerp(v(i, j), v(i + 1, j), sx), lerp(v(i, j + 1), v(i + 1, j + 1), sx), sy); };
    for (let py = 0; py < 160; py++) for (let px = 0; px < 175; px++) {
      let fb = 0, a = 0.5, s = 0.035;
      for (let o = 0; o < 5; o++) { fb += a * noise(px * s + o * 7, py * s * 1.8 + o * 3); a *= 0.5; s *= 2; }
      const cl = clamp((fb - 0.5) * 3.2) * (0.35 + 0.65 * clamp((py / 160) * 1.4));
      const q = (py * 175 + px) * 4; d.data[q] = d.data[q + 1] = d.data[q + 2] = 255; d.data[q + 3] = cl * 245;
    }
    nx.putImageData(d, 0, 0);
    x.imageSmoothingQuality = 'high'; x.filter = 'blur(6px)'; x.drawImage(n, 0, 0, 175, 160, -60, -40, MW + 120, 1250); x.filter = 'none';
    const sun = x.createRadialGradient(MW * 0.82, 160, 0, MW * 0.82, 160, 700); sun.addColorStop(0, 'rgba(255,255,245,0.95)'); sun.addColorStop(0.25, 'rgba(255,250,230,0.35)'); sun.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = sun; x.fillRect(0, 0, MW, MH);
  }
  const blade = (x: CanvasRenderingContext2D, u: number, v: number, h: number, w: number, bend: number, dark: string, light: string) => {
    const g = x.createLinearGradient(0, v, 0, v - h); g.addColorStop(0, dark); g.addColorStop(1, light);
    x.fillStyle = g; x.beginPath(); x.moveTo(u - w / 2, v); x.quadraticCurveTo(u - w * 0.2 + bend * 0.4, v - h * 0.55, u + bend, v - h); x.quadraticCurveTo(u + w * 0.2 + bend * 0.4, v - h * 0.55, u + w / 2, v); x.fill();
  };
  const daisy = (x: CanvasRenderingContext2D, u: number, v: number, r: number, blue: boolean, tilt: number) => {
    x.save(); x.translate(u, v); x.scale(1, 0.55 + 0.35 * tilt);
    for (let p = 0; p < 12; p++) { x.save(); x.rotate(p * Math.PI / 6); const g = x.createLinearGradient(0, 0, r, 0); g.addColorStop(0, blue ? '#8fa8ff' : '#f4f4f0'); g.addColorStop(1, blue ? '#4f6df5' : '#ffffff'); x.fillStyle = g; x.beginPath(); x.ellipse(r * 0.55, 0, r * 0.5, r * 0.16, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
    x.fillStyle = blue ? '#f5f5ff' : '#f2c21b'; x.beginPath(); x.arc(0, 0, r * 0.24, 0, Math.PI * 2); x.fill();
    x.restore();
  };
  {
    const x = far.getContext('2d')!;
    x.fillStyle = '#9cc79a'; x.beginPath(); x.moveTo(0, MH); for (let u = 0; u <= MW; u += 20) x.lineTo(u, 1130 + Math.sin(u / 260) * 30 + Math.sin(u / 90) * 8); x.lineTo(MW, MH); x.fill();
    x.fillStyle = '#5f9e4e'; x.beginPath(); x.moveTo(0, MH); for (let u = 0; u <= MW; u += 20) x.lineTo(u, 1190 + Math.sin(u / 200 + 2) * 26); x.lineTo(MW, MH); x.fill();
    for (let i = 0; i < 1600; i++) { const u = hash(i * 1.7) * MW, v = 1200 + hash(i * 2.3) * 220; blade(x, u, v, 26 + hash(i) * 30, 4, (hash(i * 3) - 0.5) * 12, '#3f7f2f', '#9bcf73'); }
    const haze = x.createLinearGradient(0, 1050, 0, 1350); haze.addColorStop(0, 'rgba(240,248,255,0.85)'); haze.addColorStop(1, 'rgba(240,248,255,0)'); x.fillStyle = haze; x.fillRect(0, 1050, MW, 300);
  }
  {
    const x = mid.getContext('2d')!;
    x.fillStyle = '#2f6e22'; x.fillRect(0, 1420, MW, MH - 1420);
    for (let i = 0; i < 4200; i++) { const u = hash(i * 1.31) * MW, v = 1330 + Math.pow(hash(i * 2.71), 0.7) * 700; const s = 0.6 + (v - 1330) / 700; blade(x, u, v, (50 + hash(i * 4.1) * 90) * s, (4 + hash(i * 5) * 4) * s, (hash(i * 8) - 0.5) * 40 * s, '#1f5a17', hash(i * 9) > 0.5 ? '#8fd45a' : '#5fae38'); }
    for (let i = 0; i < 70; i++) { const v = 1360 + hash(i * 3.3) * 520; daisy(x, hash(i * 9.1) * MW, v, 7 + (v - 1360) / 40, i % 4 === 0, 0.2); }
  }
  {
    const x = near.getContext('2d')!;
    for (let i = 0; i < 1400; i++) { const u = hash(i * 7.31) * MW, v = 1650 + hash(i * 1.91) * 650; const s = 1 + (v - 1650) / 400; blade(x, u, v, (140 + hash(i * 4.7) * 220) * s, (7 + hash(i * 5.3) * 6) * s, (hash(i * 8.3) - 0.5) * 120 * s, '#1b4f14', hash(i * 9.7) > 0.4 ? '#a8e36b' : '#6cbf3f'); }
    for (let i = 0; i < 26; i++) { const v = 1700 + hash(i * 5.3) * 400; daisy(x, hash(i * 11.1) * MW, v, 20 + (v - 1700) / 14, i % 3 === 0, 0.3); }
  }
  {
    const x = fore.getContext('2d')!;
    for (let i = 0; i < 70; i++) { const side = i % 2 ? hash(i) * 260 : MW - hash(i) * 260; blade(x, side, MH, 500 + hash(i * 3) * 600, 30 + hash(i * 5) * 26, (hash(i * 7) - 0.5) * 300, '#163f10', '#8ccf55'); }
    for (let i = 0; i < 6; i++) daisy(x, i % 2 ? 120 + hash(i) * 120 : MW - 140 - hash(i) * 120, 1900 + hash(i * 3) * 300, 70 + hash(i * 7) * 40, i % 3 === 1, 0.5);
  }
  const soften = (cv: HTMLCanvasElement, px: number) => { const tmp = mk(); const tx = tmp.getContext('2d')!; tx.filter = `blur(${px}px)`; tx.drawImage(cv, 0, 0); const x = cv.getContext('2d')!; x.clearRect(0, 0, MW, MH); x.drawImage(tmp, 0, 0); };
  soften(far, 6); soften(mid, 1.2); soften(fore, 14);
  MEADOW = [sky, far, mid, near, fore];
  const b = document.createElement('canvas'); b.width = 700; b.height = 1150; const bx = b.getContext('2d')!;
  bx.filter = 'blur(14px)'; for (const L of MEADOW) bx.drawImage(L, 0, 0, 700, 1150);
  MEADOW_BLUR = b;
}
function buildKeyboard() {
  if (KEYBOARD) return;
  const kb = document.createElement('canvas'); kb.width = 1300; kb.height = 2100; const kx = kb.getContext('2d')!;
  kx.fillStyle = '#060608'; kx.fillRect(0, 0, 1300, 2100);
  kx.save(); kx.translate(650, 1050); kx.rotate(-0.42); kx.translate(-900, -1300);
  for (let r = 0; r < 18; r++) for (let q = 0; q < 18; q++) {
    const g = kx.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, '#2b2e36'); g.addColorStop(1, '#15171c');
    kx.save(); kx.translate(q * 112 + (r % 2) * 40, r * 128); kx.fillStyle = g; kx.beginPath(); kx.roundRect(0, 0, 96, 110, 16); kx.fill(); kx.strokeStyle = 'rgba(255,255,255,0.06)'; kx.lineWidth = 2; kx.stroke(); kx.restore();
  }
  kx.restore();
  const tmp = document.createElement('canvas'); tmp.width = 1300; tmp.height = 2100; const tx = tmp.getContext('2d')!; tx.filter = 'blur(5px)'; tx.drawImage(kb, 0, 0); kx.clearRect(0, 0, 1300, 2100); kx.drawImage(tmp, 0, 0);
  const vg = kx.createRadialGradient(650, 900, 200, 650, 900, 1200); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.85)'); kx.fillStyle = vg; kx.fillRect(0, 0, 1300, 2100);
  KEYBOARD = kb;
}

export const story2d: SceneDef = {
  id: 'story2d',
  name: 'Story shot (2D)',
  params: [
    { key: 'shot', kind: 'text', label: `Shot (${SHOT_KINDS.join(', ')})`, def: 'title' },
    { key: 'title', kind: 'text', label: 'Main text', def: 'Your message' },
    { key: 'sub', kind: 'text', label: 'Supporting text', def: '' },
    { key: 'items', kind: 'text', label: 'Items (one per line)', def: '' },
    { key: 'brand', kind: 'text', label: 'Brand', def: 'YOUR BRAND' },
    { key: 'hint', kind: 'text', label: 'Search / comment placeholder', def: 'Хайх...' },
    { key: 'accent', kind: 'color', label: 'Brand colour', def: '#2f5bff' },
    { key: 'accent2', kind: 'color', label: 'Highlight colour', def: '#18b4ff' },
    { key: 'headFont', kind: 'text', label: 'Headline font', def: 'Montserrat' },
    { key: 'uiFont', kind: 'text', label: 'Interface font', def: 'Inter' },
    { key: 'style', kind: 'text', label: 'Look (app, glass, cinema)', def: 'app' },
    { key: 'seed', kind: 'float', label: 'Variation', min: 0, max: 20, def: 0 },
    ...Array.from({ length: IMGS }, (_, i) => ({ key: `img${i + 1}`, kind: 'image' as const, label: `Picture ${i + 1}`, def: '' as const })),
  ],
  create2d(kit) {
    let c: CanvasRenderingContext2D;
    let P: Record<string, number | string> = {};
    let A = '#2f5bff', A2 = '#18b4ff', HF = 'Montserrat', UF = 'Inter', SEED = 0, ST = 'app';
    const imgs: (HTMLImageElement | null)[] = [];
    const srcs: string[] = [];

    // ---------------------------------------------------------------- helpers
    const rr = (x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
    const font = (w: number, px: number, fam: string) => { c.font = `${w} ${px}px "${fam}", Inter, Montserrat, sans-serif`; };
    const text = (s: string, x: number, y: number, w: number, px: number, col: string | CanvasGradient, align: CanvasTextAlign = 'center', fam = UF) => { font(w, px, fam); c.fillStyle = col; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(s, x, y); };
    const tw = (s: string, w: number, px: number, fam = UF) => { font(w, px, fam); return c.measureText(s).width; };
    const fitPx = (s: string, maxW: number, w: number, px: number, fam: string) => { const m = tw(s, w, px, fam); return m > maxW ? px * maxW / m : px; };
    /** greedy word wrap to maxW; shrinks the size until it fits in maxLines */
    const wrap = (s: string, maxW: number, w: number, px: number, fam: string, maxLines = 4) => {
      for (let size = px; size > 24; size -= 4) {
        const out: string[] = []; let cur = '';
        for (const word of s.split(/\s+/).filter(Boolean)) { const tryS = cur ? cur + ' ' + word : word; if (tw(tryS, w, size, fam) > maxW && cur) { out.push(cur); cur = word; } else cur = tryS; }
        if (cur) out.push(cur);
        if (out.length <= maxLines && out.every((l) => tw(l, w, size, fam) <= maxW)) return { lines: out, size };
      }
      return { lines: [s], size: fitPx(s, maxW, w, 24, fam) };
    };
    const hexRgb = (h: string) => { const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; };
    const cursor = (x: number, y: number, s = 1, a = 1) => {
      if (a <= 0) return;
      c.save(); c.globalAlpha *= a; c.translate(x, y); c.scale(2.1 * s, 2.1 * s);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 30); c.lineTo(7, 23.5); c.lineTo(12, 34.5); c.lineTo(17, 32.3); c.lineTo(12, 21.6); c.lineTo(21.4, 21.6); c.closePath();
      c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 6; c.shadowOffsetY = 2; c.lineJoin = 'round'; c.lineWidth = 3.4; c.strokeStyle = '#fff'; c.stroke(); c.shadowColor = 'transparent';
      c.fillStyle = '#0b0b0d'; c.fill(); c.restore();
    };
    const ripple = (x: number, y: number, k: number, rgb = '255,255,255') => { if (k <= 0 || k >= 1) return; c.beginPath(); c.arc(x, y, 26 + 90 * eo(k), 0, Math.PI * 2); c.strokeStyle = `rgba(${rgb},${0.65 * (1 - k)})`; c.lineWidth = 5; c.stroke(); };
    // brand mark: a page with a folded corner and the brand's initials
    const initials = () => { const w = fmt(P.brand).split(/\s+/).filter(Boolean); return (w[0] && w[0].length <= 3 ? w[0] : w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? 'MF').slice(0, 2)).toUpperCase(); };
    const mark = (x: number, y: number, s: number, col = '#fff', ink = A) => {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.beginPath(); c.moveTo(-24, -32); c.lineTo(12, -32); c.lineTo(26, -18); c.lineTo(26, 32); c.lineTo(-24, 32); c.closePath(); c.fillStyle = col; c.fill();
      c.beginPath(); c.moveTo(12, -32); c.lineTo(12, -18); c.lineTo(26, -18); c.closePath(); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fill();
      text(initials(), 1, 10, 900, 22, ink, 'center', HF);
      c.fillStyle = ink; c.globalAlpha *= 0.55; c.fillRect(-14, -18, 20, 4);
      c.restore();
    };
    const ICON: Record<string, [string, string]> = { notes: ['#fff7d6', '#ffd84a'], word: ['#4b8bf5', '#1d4ed8'], excel: ['#34c76f', '#15803d'], chat: ['#5ff27a', '#1fbf3c'] };
    const appIcon = (kind: string, x: number, y: number, s: number) => {
      c.save(); c.translate(x, y); c.scale(s, s);
      const R = 50, r = 22;
      c.shadowColor = 'rgba(0,0,0,0.16)'; c.shadowBlur = 10; c.shadowOffsetY = 4;
      rr(-R, -R, 2 * R, 2 * R, r);
      if (kind === 'brand') c.fillStyle = '#ffffff'; else { const g = c.createLinearGradient(0, -R, 0, R); g.addColorStop(0, ICON[kind][0]); g.addColorStop(1, ICON[kind][1]); c.fillStyle = g; }
      c.fill(); c.shadowColor = 'transparent';
      if (kind === 'notes') { c.fillStyle = '#ffd84a'; c.fillRect(-R + 4, -R + 8, 2 * R - 8, 24); c.fillStyle = '#e5e1d3'; for (let i = 0; i < 3; i++) c.fillRect(-34, -2 + i * 16, 68, 3); }
      else if (kind === 'word' || kind === 'excel') { c.fillStyle = 'rgba(255,255,255,0.3)'; rr(-6, -30, 36, 60, 5); c.fill(); rr(-34, -22, 42, 44, 6); c.fillStyle = '#fff'; c.fill(); text(kind === 'word' ? 'W' : 'X', -13, 1, 800, 32, kind === 'word' ? '#1d4ed8' : '#15803d', 'center', UF); }
      else if (kind === 'chat') { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, -2, 32, 26, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(-20, 16); c.lineTo(-28, 32); c.lineTo(-4, 20); c.fill(); }
      else if (kind === 'brand') { c.beginPath(); c.arc(0, 0, 38, 0, Math.PI * 2); c.fillStyle = A; c.fill(); mark(0, 0, 0.82); }
      c.restore();
    };
    const nImg = () => imgs.filter(Boolean).length;
    const page = (i: number, x: number, y: number, w: number, h: number, crop = 0) => {
      const list = imgs.filter(Boolean) as HTMLImageElement[];
      const img = list.length ? list[((i % list.length) + list.length) % list.length] : null;
      if (img) {
        // cover-crop the picture into the slot, keeping its aspect ratio
        const s = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / s, sh = h / s;
        c.drawImage(img, (img.naturalWidth - sw) / 2, crop * (img.naturalHeight - sh), sw, sh, x, y, w, h);
      } else {
        const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#eef2fb'); c.fillStyle = g; c.fillRect(x, y, w, h);
        c.fillStyle = `rgba(${hexRgb(A)},0.25)`; c.fillRect(x + w * 0.12, y + w * 0.12, w * 0.5, w * 0.05);
        for (let k = 0; k < 18 && w * (0.3 + k * 0.075) < h - w * 0.1; k++) { c.fillStyle = k % 6 === 0 ? `rgba(${hexRgb(A)},0.22)` : '#e6eaf3'; c.fillRect(x + w * 0.12, y + w * (0.3 + k * 0.075), w * (0.76 - hash(i * 9 + k) * 0.3), w * 0.025); }
      }
    };
    const NAV = ['home', 'sliders', 'plus', 'bell', 'chat', 'share'];
    const navIcon = (k: string, x: number, y: number, col: string) => {
      c.save(); c.translate(x, y); c.strokeStyle = col; c.lineWidth = 3.2; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
      if (k === 'home') { c.moveTo(-14, 2); c.lineTo(0, -12); c.lineTo(14, 2); c.moveTo(-10, -1); c.lineTo(-10, 13); c.lineTo(10, 13); c.lineTo(10, -1); }
      else if (k === 'sliders') { c.moveTo(-14, -7); c.lineTo(14, -7); c.moveTo(-14, 7); c.lineTo(14, 7); c.moveTo(-5, -12); c.lineTo(-5, -2); c.moveTo(6, 2); c.lineTo(6, 12); }
      else if (k === 'plus') { c.moveTo(0, -13); c.lineTo(0, 13); c.moveTo(-13, 0); c.lineTo(13, 0); }
      else if (k === 'bell') { c.moveTo(-11, 8); c.lineTo(11, 8); c.moveTo(-8, 8); c.quadraticCurveTo(-9, -12, 0, -12); c.quadraticCurveTo(9, -12, 8, 8); c.moveTo(-3, 13); c.lineTo(3, 13); }
      else if (k === 'chat') { c.arc(0, 0, 12, 0.4, Math.PI * 2.2); c.lineTo(12, 12); }
      else if (k === 'share') { c.moveTo(0, -13); c.lineTo(0, 5); c.moveTo(-7, -6); c.lineTo(0, -13); c.lineTo(7, -6); c.moveTo(-12, 2); c.lineTo(-12, 13); c.lineTo(12, 13); c.lineTo(12, 2); }
      else if (k === 'check') { c.moveTo(-10, 0); c.lineTo(-3, 8); c.lineTo(11, -8); }
      c.stroke(); c.restore();
    };
    const drawMeadow = (t: number) => {
      const rates = [0.004, 0.01, 0.018, 0.03, 0.05];
      MEADOW!.forEach((cv, i) => { const s = 1 + rates[i] * t, ox = -160 - t * (4 + i * 6) - SEED * 13, oy = -230 + t * i * 1.5; c.drawImage(cv, W / 2 + (ox - W / 2) * s, H / 2 + (oy - H / 2) * s, 1400 * s, 2300 * s); });
    };
    const darkBg = (t: number) => {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b1230'); g.addColorStop(1, '#04050c'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 3; i++) { const x = W * (0.2 + 0.6 * hash(i + SEED)) + Math.sin(t * 0.4 + i * 2) * 120, y = H * (0.2 + 0.4 * hash(i * 3 + SEED)) + Math.cos(t * 0.3 + i) * 90; const gl = c.createRadialGradient(x, y, 0, x, y, 620); gl.addColorStop(0, `rgba(${hexRgb(i === 1 ? A2 : A)},0.32)`); gl.addColorStop(1, `rgba(${hexRgb(A)},0)`); c.fillStyle = gl; c.fillRect(0, 0, W, H); }
    };
    const lightBg = (t: number) => {
      c.fillStyle = '#f5f7fb'; c.fillRect(0, 0, W, H);
      const x = W * 0.75 + Math.sin(t * 0.5) * 80, gl = c.createRadialGradient(x, 380, 0, x, 380, 900); gl.addColorStop(0, `rgba(${hexRgb(A)},0.16)`); gl.addColorStop(1, `rgba(${hexRgb(A)},0)`); c.fillStyle = gl; c.fillRect(0, 0, W, H);
    };

    // ---------------------------------------------------------------- look: liquid glass (same shots, glass materials on a moving aurora)
    const isGlass = () => ST === 'glass';
    const aurora = (t: number) => {
      c.fillStyle = '#07071a'; c.fillRect(0, 0, W, H);
      const cols = [A, A2, '#ff3fa4', '#7c4dff'];
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const x = W * (0.15 + 0.7 * hash(i * 5 + SEED)) + Math.sin(t * 0.35 + i * 1.7) * 220, y = H * (0.1 + 0.55 * hash(i * 11 + SEED)) + Math.cos(t * 0.28 + i * 2.3) * 200, r = 650 + 250 * hash(i * 3 + 1);
        const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${hexRgb(cols[i])},0.46)`); g.addColorStop(1, `rgba(${hexRgb(cols[i])},0)`); c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      c.restore();
    };
    /** a pane of glass: faint body, bright top edge, light-catching rim */
    const glass = (x: number, y: number, w: number, h: number, r: number, body = 0.09) => {
      c.save();
      rr(x, y, w, h, r); c.fillStyle = `rgba(255,255,255,${body})`; c.fill();
      const hl = c.createLinearGradient(0, y, 0, y + Math.min(h, 220)); hl.addColorStop(0, 'rgba(255,255,255,0.2)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = hl; c.fill();
      const sg = c.createLinearGradient(x, y, x + w * 0.5, y + h); sg.addColorStop(0, 'rgba(255,255,255,0.75)'); sg.addColorStop(0.45, 'rgba(255,255,255,0.1)'); sg.addColorStop(1, 'rgba(255,255,255,0.4)'); c.strokeStyle = sg; c.lineWidth = 2.5; c.stroke();
      c.restore();
    };
    const bgL = (t: number) => (isGlass() ? aurora(t) : lightBg(t));
    const bgD = (t: number) => (isGlass() ? aurora(t) : ST === 'cinema' ? cineBg(t) : darkBg(t));
    const ink = (dark: string) => (isGlass() ? '#ffffff' : dark);

    // ---------------------------------------------------------------- look: cinematic typography (own shots: black, grain, letterbox, hard cuts)
    let GRAIN: HTMLCanvasElement | null = null;
    const cineBg = (_t: number) => {
      c.fillStyle = '#060606'; c.fillRect(0, 0, W, H);
      const g = c.createRadialGradient(W / 2, 720, 60, W / 2, 720, 1150); g.addColorStop(0, 'rgba(46,46,52,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    };
    const cineOver = (t: number) => {
      if (!GRAIN) { GRAIN = document.createElement('canvas'); GRAIN.width = GRAIN.height = 256; const gx = GRAIN.getContext('2d')!, d = gx.createImageData(256, 256); for (let i = 0; i < d.data.length; i += 4) { const v = hash(i * 0.37) * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } gx.putImageData(d, 0, 0); }
      const f = Math.floor(t * 24);
      c.save(); c.globalAlpha *= 0.07; c.globalCompositeOperation = 'overlay';
      const ox = -hash(f) * 256, oy = -hash(f + 0.5) * 256;
      for (let y = oy; y < H; y += 256) for (let x = ox; x < W; x += 256) c.drawImage(GRAIN, x, y);
      c.restore();
      c.fillStyle = '#000'; c.fillRect(0, 0, W, 118); c.fillRect(0, H - 118, W, 118);
    };
    const mono = (s: string, x: number, y: number, px: number, col: string, align: CanvasTextAlign = 'left', spacing = 6) => {
      (c as any).letterSpacing = `${spacing}px`; text(s, x, y, 500, px, col, align, 'JetBrains Mono'); (c as any).letterSpacing = '0px';
    };
    /** uppercase condensed headline; each word slams in (scale 1.35 -> 1) on its own beat */
    const slam = (s: string, x: number, yc: number, maxW: number, px: number, t: number, t0: number, maxLines = 4, beat = 0.09) => {
      const up = s.toUpperCase().trim();
      const { lines: ls, size } = wrap(up, maxW, 700, px, 'Oswald', maxLines);
      const lh = size * 1.04, y0 = yc - ((ls.length - 1) * lh) / 2;
      const hi = up.split(/\s+/).reduce((a, b) => (b.replace(/[^\p{L}\d]/gu, '').length > a.replace(/[^\p{L}\d]/gu, '').length ? b : a), '');
      let wi = 0;
      ls.forEach((line, li) => {
        let xx = x;
        for (const w of line.split(' ')) {
          const k = seg(t, t0 + wi * beat, t0 + wi * beat + 0.16); wi++;
          const wW = tw(w, 700, size, 'Oswald');
          if (k > 0) { const sc = 1 + 0.35 * (1 - eo5(k)); c.save(); c.translate(xx + wW / 2, y0 + li * lh); c.scale(sc, sc); c.globalAlpha *= Math.min(1, k * 3); text(w, -wW / 2, 0, 700, size, w === hi ? A : '#f4f4f2', 'left', 'Oswald'); c.restore(); }
          xx += wW + tw(' ', 700, size, 'Oswald');
        }
      });
      return { top: y0 - size * 0.55, bottom: y0 + (ls.length - 1) * lh + size * 0.55, size, words: wi };
    };
    const rule = (x: number, y: number, w: number, k: number) => { c.fillStyle = A; c.fillRect(x, y, w * eo(k), 6); };
    const tag = (s: string, t: number) => { const a = seg(t, 0.05, 0.25); c.save(); c.globalAlpha *= a; mono(s, 90, 230, 26, 'rgba(255,255,255,0.55)'); c.restore(); rule(90, 262, 120, seg(t, 0.1, 0.5)); };
    const num2 = (i: number) => String(i + 1).padStart(2, '0');

    const cineTitle = (t: number, D: number) => {
      cineBg(t);
      const z = 1 + 0.03 * (t / D); c.save(); c.translate(W / 2, 720); c.scale(z, z); c.translate(-W / 2, -720);
      tag(`${num2(Math.round(SEED))} / ${fmt(P.brand).toUpperCase()}`, t);
      const r = slam(fmt(P.title), 90, 700, W - 180, 150, t, 0.12, 5);
      const sub = fmt(P.sub);
      if (sub) { c.save(); c.globalAlpha *= seg(t, 0.4 + r.words * 0.09, 0.8 + r.words * 0.09); mono(sub.toUpperCase(), 90, r.bottom + 70, 28, 'rgba(255,255,255,0.7)', 'left', 3); c.restore(); }
      c.restore();
    };
    const cineHook = (t: number, D: number) => {
      cineBg(t);
      // a giant outlined question mark (or the shot number) behind the line
      const ask = /\?/.test(fmt(P.title)), qk = eo(seg(t, 0, 0.6)), qs = 1.15 - 0.15 * qk + 0.03 * (t / D);
      c.save(); c.globalAlpha *= 0.9 * qk; c.translate(W * 0.72, 760); c.scale(qs, qs); font(700, ask ? 1100 : 760, 'Oswald'); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 6; c.strokeStyle = `rgba(${hexRgb(A)},0.55)`; c.strokeText(ask ? '?' : num2(Math.round(SEED)), 0, 0); c.restore();
      tag(ask ? 'QUESTION' : 'NOTE', t);
      slam(fmt(P.title), 90, 760, W - 180, 140, t, 0.2, 5, 0.12);
    };
    const cineBrand = (t: number, D: number) => {
      cineBg(t);
      // a light streak sweeps the frame, the name opens from the centre
      const sk = seg(t, 0, 0.7), sx = lerp(-300, W + 300, eio(sk));
      const sg = c.createLinearGradient(sx - 500, 0, sx + 500, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, `rgba(${hexRgb(A2)},0.9)`); sg.addColorStop(1, 'rgba(255,255,255,0)');
      c.save(); c.globalAlpha *= 1 - seg(t, 0.55, 0.85); c.fillStyle = sg; c.fillRect(0, 758, W, 4); c.restore();
      const flare = c.createRadialGradient(sx, 760, 0, sx, 760, 260); flare.addColorStop(0, `rgba(${hexRgb(A2)},${0.5 * (1 - sk)})`); flare.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = flare; c.fillRect(0, 400, W, 720);
      const words = fmt(P.brand).toUpperCase().split(/\s+/).filter(Boolean), top = words.slice(0, Math.ceil(words.length / 2)).join(' '), bot = words.slice(Math.ceil(words.length / 2)).join(' ');
      const open = eo5(seg(t, 0.35, 1.0)), sp = lerp(60, 14, eo(seg(t, 0.35, D)));
      c.save(); c.beginPath(); c.rect(0, 760 - 260 * open, W, 520 * open); c.clip();
      (c as any).letterSpacing = `${sp}px`;
      text(top, W / 2 + sp / 2, 690, 700, fitPx(top, W - 160 - sp * top.length, 700, 170, 'Oswald'), '#ffffff', 'center', 'Oswald');
      (c as any).letterSpacing = '0px';
      if (bot) mono(bot, W / 2, 850, 40, A, 'center', 18);
      c.restore();
    };
    const cineType = (t: number, D: number, comment = false) => {
      cineBg(t);
      tag(comment ? 'COMMENT' : 'SEARCH', t);
      const q = comment ? fmt(P.title) : fmt(P.title), t0 = 0.3, t1 = Math.max(t0 + 0.3, D * 0.75);
      const n = Math.round(q.length * seg(t, t0, t1)), shown = q.slice(0, n);
      const { lines: ls, size } = wrap(shown || ' ', W - 260, 500, 58, 'JetBrains Mono', 6);
      const lh = size * 1.45, y0 = 700 - ((ls.length - 1) * lh) / 2;
      text('>', 90, y0, 700, size, A, 'left', 'JetBrains Mono');
      ls.forEach((l, i) => text(l, 150, y0 + i * lh, 500, size, '#ededed', 'left', 'JetBrains Mono'));
      const last = ls[ls.length - 1] ?? '', cx = 150 + tw(last, 500, size, 'JetBrains Mono') + 6;
      if (Math.floor(t * 2.4) % 2 === 0 || n < q.length) { c.fillStyle = A; c.fillRect(cx, y0 + (ls.length - 1) * lh - size * 0.55, size * 0.58, size * 1.1); }
      if (comment) {
        // the comment itself, huge
        const v = fmt(P.sub) || '1', k = back(seg(t, t1, t1 + 0.4));
        if (k > 0) { c.save(); c.translate(W / 2, 1060); c.scale(k, k); font(700, 300, 'Oswald'); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 8; c.strokeStyle = A; c.strokeText(`«${v}»`, 0, 0); c.restore(); }
      }
    };
    const cineFrames = (t: number, D: number) => {
      // Ken Burns over full-bleed pictures, one per beat
      cineBg(t);
      const n = Math.max(1, Math.min(3, nImg() || 1)), per = D / n, i = Math.min(n - 1, Math.floor(t / per)), lt = t - i * per;
      const z = 1.12 - 0.1 * (lt / per), dx = (i % 2 ? -1 : 1) * 30 * (lt / per);
      c.save(); c.translate(W / 2 + dx, 760); c.scale(z, z); c.translate(-W / 2, -760); page(Math.round(SEED) + i, 0, 118, W, H - 236, 0.15); c.restore();
      const sh = c.createLinearGradient(0, 118, 0, H); sh.addColorStop(0, 'rgba(0,0,0,0.75)'); sh.addColorStop(0.35, 'rgba(0,0,0,0.15)'); sh.addColorStop(0.65, 'rgba(0,0,0,0.25)'); sh.addColorStop(1, 'rgba(0,0,0,0.9)'); c.fillStyle = sh; c.fillRect(0, 0, W, H);
      c.fillStyle = `rgba(6,6,8,${nImg() ? 0.5 : 0.55})`; c.fillRect(0, 0, W, H);
      tag(`${num2(i)} / ${num2(n - 1)}`, t);
      slam(fmt(P.title), 90, 420, W - 180, 96, t, 0.15, 3);
    };
    const cineStrip = (t: number, D: number) => {
      cineBg(t);
      tag('LIBRARY', t);
      slam(fmt(P.title), 90, 420, W - 180, 76, t, 0.1, 3);
      // a moving film strip of documents (below the headline, above the subtitles)
      const FW = 400, FH = 520, y = 870, off = (t * 140 + SEED * 37) % (FW + 40), k = eo(seg(t, 0.1, 0.6));
      c.save(); c.globalAlpha *= k; c.fillStyle = '#111'; c.fillRect(0, y - FH / 2 - 60, W, FH + 120);
      for (let x = -off - 40; x < W + 40; x += 60) { rr(x, y - FH / 2 - 44, 30, 24, 5); c.fillStyle = '#2a2a2a'; c.fill(); rr(x, y + FH / 2 + 20, 30, 24, 5); c.fill(); }
      for (let j = -1; j < 4; j++) { const x = j * (FW + 40) - off + 60, idx = j + Math.floor((t * 140 + SEED * 37) / (FW + 40)); c.save(); rr(x, y - FH / 2, FW, FH, 6); c.clip(); page(idx, x, y - FH / 2, FW, FH, 0); c.restore(); }
      c.restore();
      const mid = W / 2 - FW / 2 - 6, hk = seg(t, D * 0.55, D * 0.65);
      if (hk > 0) { c.strokeStyle = A; c.lineWidth = 8; c.strokeRect(mid, y - FH / 2 - 6, (FW + 12) * eo(hk), FH + 12); }
    };
    const cineList = (t: number, D: number) => {
      cineBg(t);
      const items = itemsOf().slice(0, 5), head = lines(P.items).length ? fmt(P.title) : fmt(P.sub);
      tag(head ? head.toUpperCase().slice(0, 34) : 'WHAT YOU GET', t);
      const n = Math.max(1, items.length), step = Math.min(190, 900 / n), y0 = 760 - ((n - 1) * step) / 2;
      items.forEach((it, i) => {
        const a = 0.2 + i * Math.min(0.45, (D * 0.6) / n), k = eo5(seg(t, a, a + 0.35));
        if (k <= 0) return;
        const y = y0 + i * step;
        mono(num2(i), 90, y, 30, A, 'left', 2);
        const px = fitPx(it.toUpperCase(), W - 300, 700, Math.min(84, step * 0.55), 'Oswald');
        c.save(); c.beginPath(); c.rect(170, y - px, (W - 170) * k, px * 2); c.clip(); text(it.toUpperCase(), 170, y, 700, px, '#f4f4f2', 'left', 'Oswald'); c.restore();
        c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(90, y + step / 2 - 2, (W - 180) * k, 2);
      });
    };
    const cineRoll = (t: number, D: number) => {
      cineBg(t);
      const words = (itemsOf().length >= 2 ? itemsOf() : fmt(P.title).split(/\s+/).filter(Boolean)).map((w) => w.toUpperCase());
      if (!words.length) return;
      const pos = eio(seg(t, 0.2, D - 0.4)) * (words.length - 1), cy = 760, lh = 150;
      for (let i = 0; i < words.length; i++) {
        const d = i - pos; if (Math.abs(d) > 6) continue;
        const near = Math.exp(-d * d * 3), w = words[i], px = fitPx(w, W - 260, 700, 132, 'Oswald');
        c.save(); c.globalAlpha *= Math.max(0.12, near) * Math.exp(-d * d * 0.06);
        if (near > 0.5) text(w, 150, cy + d * lh, 700, px, '#ffffff', 'left', 'Oswald');
        else { font(700, px, 'Oswald'); c.textAlign = 'left'; c.textBaseline = 'middle'; c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.6)'; c.strokeText(w, 150, cy + d * lh); }
        c.restore();
      }
      c.fillStyle = A; c.fillRect(90, cy - 60, 14, 120);
    };

    // ---------------------------------------------------------------- shots (t: seconds into the shot, D: its length)
    const DOCK = ['notes', 'word', 'brand', 'excel', 'chat'], STEP = 172, DY = 800;
    const dockX = (k: string) => W / 2 + (DOCK.indexOf(k) - 2) * STEP;
    const target = () => { const s = (fmt(P.title) + ' ' + fmt(P.sub)).toLowerCase(); return /excel/.test(s) ? 'excel' : /word/.test(s) ? 'word' : 'brand'; };
    const shotDock = (t: number, D: number) => {
      if (isGlass()) aurora(t);
      else { c.fillStyle = '#ebebed'; c.fillRect(0, 0, W, H); const vg = c.createRadialGradient(W / 2, H * 0.42, 100, W / 2, H * 0.42, 1300); vg.addColorStop(0, 'rgba(255,255,255,0.55)'); vg.addColorStop(1, 'rgba(0,0,0,0.06)'); c.fillStyle = vg; c.fillRect(0, 0, W, H); }
      const z = 1 + 0.08 * eio(t / D);
      c.save(); c.translate(W / 2, DY); c.scale(z, z); c.translate(-W / 2, -DY);
      const intro = eo(seg(t, 0, 0.45));
      c.save(); c.globalAlpha *= intro;
      const total = DOCK.length * STEP - 40;
      if (isGlass()) glass(W / 2 - total / 2 - 26, DY - 92, total + 52, 184, 50, 0.12);
      else { rr(W / 2 - total / 2 - 26, DY - 92, total + 52, 184, 50); c.fillStyle = 'rgba(255,255,255,0.82)'; c.shadowColor = 'rgba(0,0,0,0.1)'; c.shadowBlur = 40; c.shadowOffsetY = 12; c.fill(); c.shadowColor = 'transparent'; c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.stroke(); }
      const tg = target(), tx = dockX(tg), click = Math.max(0.9, D - 0.4);
      const tour = [dockX('chat'), dockX('notes'), dockX(tg === 'excel' ? 'word' : 'excel')];
      const [mx, my] = keys(t, [[0.15, 1000, 560], [click * 0.3, tour[0] + 6, DY + 6], [click * 0.55, tour[1] + 6, DY + 8], [click * 0.8, tour[2] + 6, DY + 6], [click - 0.08, tx + 6, DY + 4], [D, tx + 6, DY + 4]]);
      for (const k of DOCK) {
        const ix = dockX(k), hover = Math.abs(mx - ix) < 76 && Math.abs(my - DY) < 90 ? 1 : 0;
        appIcon(k, ix, DY, 1.28 + 0.1 * hover - 0.15 * (hover ? Math.sin(Math.PI * seg(t, click, click + 0.2)) : 0));
      }
      c.restore();
      const label = tg === 'brand' ? fmt(P.brand) : tg === 'word' ? 'Word' : 'Excel';
      const tk = seg(t, click - 0.45, click - 0.3);
      if (tk > 0) { const w = tw(label, 600, 28) + 46; c.save(); c.globalAlpha *= tk; rr(tx - w / 2, DY - 180, w, 54, 14); c.fillStyle = 'rgba(30,32,40,0.88)'; c.fill(); text(label, tx, DY - 153, 600, 28, '#fff'); c.restore(); }
      cursor(mx, my, t > click && t < click + 0.18 ? 0.86 : 1, clamp((t - 0.15) / 0.25));
      c.restore();
    };
    const shotBrand = (t: number, D: number) => {
      const cx = W / 2, cy = DY, k = seg(t, 0, 0.5);
      if (isGlass()) aurora(t); else { c.fillStyle = '#ebebed'; c.fillRect(0, 0, W, H); }
      c.fillStyle = isGlass() ? `rgba(${hexRgb(A)},0.5)` : A; c.beginPath(); c.arc(cx, cy, 2300 * eo5(k), 0, Math.PI * 2); c.fill();
      for (let i = 0; i < 70; i++) {
        const a = hash(i + SEED) * Math.PI * 2, life = seg(t, hash(i + 2) * 0.12, 0.8);
        if (life <= 0 || life >= 1) continue;
        const d = (80 + hash(i + 1) * 520) * eo(life), s = 18 + hash(i + 3) * 30;
        c.save(); c.globalAlpha *= 1 - life; c.strokeStyle = k > 0.3 ? 'rgba(255,255,255,0.9)' : A; c.lineWidth = 4; c.strokeRect(cx + Math.cos(a) * d - s / 2, cy + Math.sin(a) * d - s / 2, s, s); c.restore();
      }
      if (t < 0.2) return;
      for (let i = 4; i >= 1; i--) { c.beginPath(); c.arc(cx, cy, (230 + i * 165) * (0.94 + 0.06 * seg(t, 0, D)), 0, Math.PI * 2); c.fillStyle = `rgba(255,255,255,${0.035 + 0.02 * (4 - i)})`; c.fill(); }
      const ls = back(seg(t, 0.2, 0.7));
      const swirlAt = D > 2.6 ? D - 0.7 : 99, shred = seg(t, swirlAt - 0.5, swirlAt), sw = seg(t, swirlAt, swirlAt + 0.7);
      c.save(); c.translate(cx, cy); c.scale(ls, ls);
      if (sw <= 0) {
        c.beginPath(); c.arc(0, 0, 178, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 10; c.stroke();
        if (isGlass()) { glass(-160, -160, 320, 320, 160, 0.14); const lg = c.createLinearGradient(0, -140, 0, 140); lg.addColorStop(0, `rgba(${hexRgb(A2)},0.55)`); lg.addColorStop(1, `rgba(${hexRgb(A)},0.75)`); c.beginPath(); c.arc(0, 0, 138, 0, Math.PI * 2); c.fillStyle = lg; c.fill(); }
        else {
          c.shadowColor = 'rgba(0,0,0,0.2)'; c.shadowBlur = 40; c.shadowOffsetY = 16; c.beginPath(); c.arc(0, 0, 160, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.shadowColor = 'transparent';
          const lg = c.createLinearGradient(0, -150, 0, 150); lg.addColorStop(0, `rgba(${hexRgb(A)},0.82)`); lg.addColorStop(1, A); c.beginPath(); c.arc(0, 0, 146, 0, Math.PI * 2); c.fillStyle = lg; c.fill();
        }
        if (shred > 0) { c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 3; for (const [a, r, len, s] of SHREDS) { if (s > shred * 1.3) continue; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); c.lineTo(Math.cos(a) * (r * 0.5 + len * shred), Math.sin(a) * (r * 0.5 + len * shred)); c.stroke(); } }
        mark(0, 0, 2.7 * (1 - 0.1 * shred));
      } else {
        c.strokeStyle = `rgba(255,255,255,${0.9 * (1 - sw)})`;
        for (const [a, r, len, s] of SHREDS) { const ang = a + sw * (2.4 + s * 2), rad = r * (1 + sw * (2 + s * 5)), L2 = rad + len * (1 + sw * 4); c.lineWidth = 3 + 8 * sw; c.beginPath(); c.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad); c.lineTo(Math.cos(ang - 0.15 - sw * 0.3) * L2, Math.sin(ang - 0.15 - sw * 0.3) * L2); c.stroke(); }
      }
      c.restore();
      const wa = seg(t, 0.6, 1.1) * (1 - sw);
      const ws = fmt(P.brand).split(' '), top = ws.slice(0, Math.ceil(ws.length / 2)).join(' '), bot = ws.slice(Math.ceil(ws.length / 2)).join(' ');
      c.save(); c.globalAlpha *= wa;
      text(top, cx, cy + 300 + 24 * (1 - eo(wa)), 800, fitPx(top, W - 180, 800, 76, HF), '#fff', 'center', HF);
      font(400, 42, HF); (c as any).letterSpacing = '14px'; c.fillStyle = 'rgba(255,255,255,0.88)'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(bot, cx + 7, cy + 382 + 24 * (1 - eo(wa))); (c as any).letterSpacing = '0px';
      c.restore();
    };
    const shotSearch = (t: number, D: number, comment = false) => {
      if (isGlass()) aurora(t); else { buildMeadow(); drawMeadow(t); }
      const q = comment ? (fmt(P.sub) || '1') : fmt(P.title);
      // phases scale with the shot: click, zoom in, type, zoom out, send
      const click = Math.min(0.7, D * 0.12), zin = Math.min(1.1, D * 0.2), go = D - Math.min(0.7, D * 0.12), zout = go - Math.min(1.0, D * 0.18);
      const t0 = zin + 0.45, t1 = Math.max(t0 + 0.2, zout - 0.25);
      const n = Math.round(q.length * seg(t, t0, t1));
      const typed = q.slice(0, n), cut = typed.lastIndexOf(' ', typed.length - 2), active = n < q.length ? typed.slice(cut + 1) : '';
      const zk = eio(seg(t, zin, zin + 0.5)) * (1 - eio(seg(t, zout, zout + 0.45)));
      const bw = 820, bx = W / 2 - bw / 2, by = 760, ih = 100, fy = by + ih / 2, textX = bx + 112, areaR = bx + bw - 215;
      const full = tw(typed, 600, 36), scrollX = Math.max(0, textX + full - areaR), caretX = textX + full - scrollX;
      const z = 1 + 1.35 * zk, fx = lerp(W / 2, Math.max(bx + 330, caretX - 160), zk);
      c.save(); c.translate(W / 2, fy + 40 * zk); c.scale(z, z); c.translate(-fx, -fy);
      const ap = back(seg(t, 0.05, 0.55)), press = 1 - 0.03 * Math.sin(Math.PI * seg(t, click, click + 0.2));
      c.save(); c.translate(W / 2, fy); c.scale(ap * press, ap * press); c.translate(-W / 2, -fy);
      c.globalAlpha *= seg(t, 0, 0.3);
      const ty = by + 30, th = 190, s = 1 + 0.018 * t;
      if (isGlass()) glass(bx - 10, ty, bw + 20, th, 52, 0.08);
      else {
        c.save(); rr(bx - 10, ty, bw + 20, th, 52); c.clip(); c.drawImage(MEADOW_BLUR!, W / 2 + (-160 - SEED * 13 - W / 2) * s, H / 2 + (-230 - H / 2) * s, 1400 * s, 2300 * s); c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(bx - 10, ty, bw + 20, th); c.restore();
        rr(bx - 10, ty, bw + 20, th, 52); c.strokeStyle = 'rgba(255,255,255,0.65)'; c.lineWidth = 2; c.stroke();
      }
      NAV.forEach((nv, i) => navIcon(nv, bx + 120 + i * ((bw - 240) / 5), ty + th - 52, 'rgba(255,255,255,0.78)'));
      if (isGlass()) glass(bx, by, bw, ih, 50, 0.16);
      else { c.shadowColor = 'rgba(0,30,60,0.18)'; c.shadowBlur = 30; c.shadowOffsetY = 10; rr(bx, by, bw, ih, 50); c.fillStyle = 'rgba(255,255,255,0.97)'; c.fill(); c.shadowColor = 'transparent'; }
      c.beginPath(); c.arc(bx + 58, fy, 27, 0, Math.PI * 2); c.fillStyle = A; c.fill(); mark(bx + 58, fy, 0.56);
      if (!typed) text(fmt(P.hint) || (comment ? 'Сэтгэгдэл бичих...' : 'Хайх...'), textX, fy, 400, 34, isGlass() ? 'rgba(255,255,255,0.6)' : '#9aa1ad', 'left', UF);
      else {
        c.save(); c.beginPath(); c.rect(textX - 8, by, areaR - textX + 16, ih); c.clip();
        const tx0 = textX - scrollX, done = typed.slice(0, typed.length - active.length), dw = tw(done, 600, 36);
        text(done, tx0, fy, 600, 36, ink('#111318'), 'left', UF);
        const hg = c.createLinearGradient(tx0 + dw, 0, tx0 + dw + Math.max(40, tw(active, 600, 36)), 0); hg.addColorStop(0, A2); hg.addColorStop(1, A);
        text(active, tx0 + dw, fy, 600, 36, hg, 'left', UF); c.restore();
      }
      if (t > click && t < go + 0.4 && Math.floor(t * 2.2) % 2 === 0) { c.fillStyle = A; c.fillRect(caretX + 4, by + 28, 4, ih - 56); }
      rr(bx + bw - 200, by + 32, 78, 36, 18); c.fillStyle = '#ffd3db'; c.fill();
      c.strokeStyle = '#ef4466'; c.lineWidth = 3; rr(bx + bw - 175, by + 41, 28, 19, 5); c.stroke(); c.beginPath(); c.arc(bx + bw - 161, by + 50, 5, 0, Math.PI * 2); c.stroke();
      const sp = 1 - 0.14 * Math.sin(Math.PI * seg(t, go, go + 0.2)), on = t > go;
      c.save(); c.translate(bx + bw - 66, fy); c.scale(sp, sp);
      c.beginPath(); c.arc(0, 0, 34, 0, Math.PI * 2); c.fillStyle = on ? A : 'rgba(0,0,0,0.04)'; c.fill();
      c.strokeStyle = on ? '#fff' : ink('#111318'); c.lineWidth = 4.5; c.lineCap = 'round'; c.lineJoin = 'round';
      if (comment) { c.beginPath(); c.moveTo(-12, -11); c.lineTo(14, 0); c.lineTo(-12, 11); c.lineTo(-6, 0); c.closePath(); c.stroke(); }
      else { c.beginPath(); c.arc(-4, -4, 13, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(6, 6); c.lineTo(15, 15); c.stroke(); }
      c.restore(); c.restore();
      ripple(bx + bw - 66, fy, seg(t, go + 0.02, go + 0.45), hexRgb(A));
      c.restore();
      const [mx, my] = keys(t, [[0.3, 900, 1150], [click - 0.05, bx + 200, fy + 8], [click + 0.3, bx + 190, fy + 10], [zout + 0.3, 760, 1000], [go - 0.05, bx + bw - 60, fy + 6], [D, bx + bw - 60, fy + 6]]);
      ripple(bx + 200, fy, seg(t, click, click + 0.4), hexRgb(A));
      cursor(mx, my, (t > click && t < click + 0.18) || (t > go && t < go + 0.18) ? 0.86 : 1, t < zin ? clamp((t - 0.3) / 0.2) : clamp((t - zout - 0.2) / 0.2));
      // the comment shot closes on the brand mark
      if (comment && D > 3) { const e = seg(t, D - 1.1, D - 0.5); if (e > 0) { c.save(); c.globalAlpha *= e; c.fillStyle = A; c.fillRect(0, 0, W, H); c.restore(); c.save(); c.globalAlpha *= e; const ls = back(seg(t, D - 0.9, D - 0.4)); c.translate(W / 2, DY); c.scale(ls, ls); c.beginPath(); c.arc(0, 0, 150, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); mark(0, 0, 2.3, A, '#fff'); c.restore(); } }
    };
    const VAR = [['#d7e2ff', '#7ea2ff'], ['#ffe1c2', '#ff9a3d'], ['#efd9ff', '#a855f7'], ['#d9fbe8', '#22c55e'], ['#ffffff', '#ffffff']];
    const shotCards = (t: number, D: number) => {
      bgL(t);
      const n = VAR.length, kk = seg(t, 0, D - 0.25) * n, i = Math.min(n - 1, Math.floor(kk)), local = Math.min(1, kk - i);
      const pop = 0.93 + 0.07 * back(clamp(local * 3)), w = 660 * pop, h = 856 * pop, tilt = (i % 2 ? -1 : 1) * 0.12 * (1 - eo(local * 2));
      c.save(); c.translate(W / 2, 780); c.transform(1, tilt * 0.35, 0, 1, 0, 0); c.scale(1 - Math.abs(tilt) * 0.5, 1);
      c.shadowColor = 'rgba(30,40,80,0.22)'; c.shadowBlur = 50; c.shadowOffsetY = 22; rr(-w / 2, -h / 2, w, h, 34);
      const bg = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); bg.addColorStop(0, VAR[i][0]); bg.addColorStop(1, VAR[i][1]); c.fillStyle = bg; if (isGlass()) c.globalAlpha *= 0.35; c.fill(); if (isGlass()) c.globalAlpha /= 0.35; c.shadowColor = 'transparent';
      c.save(); rr(-w / 2, -h / 2, w, h, 34); c.clip();
      const last = i === n - 1, pw = last ? w : w * 0.8, ph = last ? h : h * 0.82;
      c.translate(0, last ? 0 : 18); c.shadowColor = 'rgba(0,0,0,0.18)'; c.shadowBlur = 20; c.fillStyle = '#fff'; c.fillRect(-pw / 2, -ph / 2, pw, ph); c.shadowColor = 'transparent';
      page(Math.round(SEED) + (nImg() > 1 ? i % 2 : 0), -pw / 2, -ph / 2, pw, ph, 0);
      if (!last) { c.globalCompositeOperation = 'multiply'; c.fillStyle = VAR[i][0]; c.fillRect(-pw / 2, -ph / 2, pw, ph); c.globalCompositeOperation = 'source-over'; }
      c.restore();
      if (isGlass()) glass(-w / 2, -h / 2, w, h, 34, 0.04);
      c.restore();
    };
    const shotGrid = (t: number, D: number) => {
      bgL(t);
      const saveAt = D * 0.42, pullFrom = D * 0.62, pullTo = D * 0.95;
      const z = lerp(1, 0.38, eio(seg(t, pullFrom, pullTo))), drift = t * 26, COLW = 310, GAP = 26, HC = 4, HR = 5, x0 = W / 2 - (COLW + GAP) * HC;
      c.save(); c.translate(W / 2, 780); c.scale(z, z); c.translate(-W / 2, -780);
      let hover: { x: number; y: number; h: number } | null = null;
      for (let col = 0; col < 9; col++) {
        let y = -1400 + (col % 2) * 170 - drift * (col % 2 ? 1.1 : 0.9);
        const x = x0 + col * (COLW + GAP);
        for (let r = 0; r < 14; r++) {
          const n = col * 7 + r * 3 + Math.round(SEED) * 5, hh = COLW * (1.05 + 0.42 * hash(n * 1.7));
          const ar = Math.min(6, Math.abs(col - HC) + Math.abs(r - HR)), intro = back(seg(t, 0.05 * ar, 0.45 + 0.05 * ar));
          if (col === HC && r === HR) hover = { x, y, h: hh };
          if (intro > 0 && y + hh > 780 - 780 / z - 50 && y < 780 + (H - 780) / z + 50) {
            const s = 0.7 + 0.3 * intro;
            c.save(); c.globalAlpha *= clamp(intro * 1.5); c.translate(x, y + hh / 2); c.scale(s, s); rr(-COLW / 2, -hh / 2, COLW, hh, 26); c.clip(); page(n, -COLW / 2, -hh / 2, COLW, hh, hash(n * 3.3) * 0.5); c.restore();
          }
          y += hh + GAP;
        }
      }
      let sx = W / 2, sy = 780;
      if (hover) {
        const { x, y, h } = hover, hv = seg(t, saveAt - 0.7, saveAt - 0.5) * (1 - seg(t, pullFrom - 0.4, pullFrom));
        if (hv > 0) {
          c.save(); c.translate(x, y + h / 2); rr(-COLW / 2, -h / 2, COLW, h, 26); c.fillStyle = `rgba(0,0,0,${0.18 * hv})`; c.fill(); c.globalAlpha *= hv;
          const saved = t > saveAt, bw = saved ? 134 : 112, bh = 56;
          rr(COLW / 2 - bw - 16, -h / 2 + 16, bw, bh, 28); c.fillStyle = saved ? '#111318' : '#e60023'; c.fill();
          text(saved ? 'Татсан' : 'Татах', COLW / 2 - bw / 2 - 16, -h / 2 + 16 + bh / 2 + 1, 700, 25, '#fff');
          rr(-COLW / 2 + 16, h / 2 - 66, 150, 50, 25); c.fillStyle = 'rgba(255,255,255,0.92)'; c.fill(); text('↗  Нээх', -COLW / 2 + 91, h / 2 - 41, 600, 23, '#111318');
          c.beginPath(); c.arc(COLW / 2 - 42, h / 2 - 41, 25, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.92)'; c.fill(); navIcon('share', COLW / 2 - 42, h / 2 - 41, '#111318');
          c.restore();
        }
        sx = W / 2 + (x + COLW / 2 - 72 - W / 2) * z; sy = 780 + (y + 44 - 780) * z;
      }
      c.restore();
      const [mx, my] = keys(t, [[0.5, 980, 1250], [saveAt - 0.6, sx - 120, sy + 140], [saveAt - 0.05, sx, sy], [saveAt + 0.7, sx + 8, sy + 6], [pullFrom, sx + 300, sy + 500]]);
      ripple(sx, sy, seg(t, saveAt, saveAt + 0.45), '230,0,35');
      cursor(mx, my, t > saveAt && t < saveAt + 0.18 ? 0.86 : 1, clamp((t - 0.5) / 0.25) * (1 - seg(t, pullFrom - 0.3, pullFrom)));
    };
    const itemsOf = () => { const l = lines(P.items); if (l.length) return l; return splitList(fmt(P.title)).map((s) => s.replace(/[.!?]$/, '')); };
    const shotRoll = (t: number, D: number) => {
      if (isGlass()) aurora(t); else { buildKeyboard(); c.drawImage(KEYBOARD!, -110, -90); }
      const words = itemsOf().length >= 2 ? itemsOf() : fmt(P.title).split(/\s+/).filter(Boolean);
      if (!words.length) return;
      const pos = eio(seg(t, 0.2, D - 0.4)) * (words.length - 1), cy = 780, lh = 118;
      for (let i = 0; i < words.length; i++) {
        const d = i - pos; if (Math.abs(d) > 7) continue;
        const near = Math.exp(-d * d * 2.4), w = words[i], px = fitPx(w, W - 200, 700, 96, HF);
        c.save(); c.globalAlpha *= (0.22 + 0.78 * near) * Math.exp(-d * d * 0.05); text(w, W / 2, cy + d * lh, 700, px, near > 0.5 ? '#ffffff' : '#8b8f99', 'center', HF); c.restore();
      }
      const ci = Math.round(pos), w = words[ci], bw = tw(w, 700, fitPx(w, W - 200, 700, 96, HF), HF) + 56, bh = 128;
      if (isGlass()) { glass(W / 2 - bw / 2 - 20, cy - bh / 2 - 6, bw + 40, bh + 12, 40, 0.1); return; }
      c.strokeStyle = '#2f7bff'; c.lineWidth = 4; c.strokeRect(W / 2 - bw / 2, cy - bh / 2, bw, bh);
      for (const [hx, hy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) { c.fillStyle = '#fff'; c.fillRect(W / 2 + hx * bw / 2 - 8, cy + hy * bh / 2 - 8, 16, 16); c.strokeRect(W / 2 + hx * bw / 2 - 8, cy + hy * bh / 2 - 8, 16, 16); }
    };
    const shotTitle = (t: number, D: number) => {
      bgD(t);
      // fine diagonal light lines drifting
      c.save(); c.globalAlpha *= 0.08; c.strokeStyle = '#ffffff'; c.lineWidth = 2;
      for (let i = -6; i < 14; i++) { const x = i * 140 + (t * 40) % 140; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 900, H); c.stroke(); }
      c.restore();
      const title = fmt(P.title), sub = fmt(P.sub);
      const { lines: ls, size } = wrap(title, W - 180, 800, 96, HF, 4);
      const lh = size * 1.12, y0 = 700 - ((ls.length - 1) * lh) / 2;
      const z = 1 + 0.04 * (t / D);
      c.save(); c.translate(W / 2, 760); c.scale(z, z); c.translate(-W / 2, -760);
      let wi = 0;
      ls.forEach((line, li) => {
        const words = line.split(' '), total = tw(line, 800, size, HF);
        let x = W / 2 - total / 2;
        for (const w of words) {
          const k = eo(seg(t, 0.1 + wi * 0.07, 0.6 + wi * 0.07)); wi++;
          const ww = tw(w + ' ', 800, size, HF);
          c.save(); c.globalAlpha *= k; text(w, x, y0 + li * lh + 50 * (1 - k), 800, size, '#ffffff', 'left', HF); c.restore();
          x += ww;
        }
      });
      const lastW = tw(ls[ls.length - 1], 800, size, HF), ul = eo(seg(t, 0.5 + wi * 0.07, 1.0 + wi * 0.07));
      const ug = c.createLinearGradient(W / 2 - lastW / 2, 0, W / 2 + lastW / 2, 0); ug.addColorStop(0, A2); ug.addColorStop(1, A);
      rr(W / 2 - lastW / 2, y0 + (ls.length - 1) * lh + size * 0.62, lastW * ul, 10, 5); c.fillStyle = ug; c.fill();
      if (sub) { const a = seg(t, 0.7, 1.1); const sw = wrap(sub, W - 220, 500, 40, UF, 3); c.save(); c.globalAlpha *= a * 0.82; sw.lines.forEach((l, i) => text(l, W / 2, y0 + ls.length * lh + 70 + i * sw.size * 1.3, 500, sw.size, '#dbe4ff', 'center', UF)); c.restore(); }
      c.restore();
    };
    const shotFeatures = (t: number, D: number) => {
      bgL(t);
      const items = itemsOf().slice(0, 5), head = lines(P.items).length ? fmt(P.title) : fmt(P.sub);
      if (head) { const h = wrap(head, W - 180, 800, 62, HF, 2); h.lines.forEach((l, i) => { const a = eo(seg(t, 0.05, 0.5)); c.save(); c.globalAlpha *= a; text(l, W / 2, 330 + i * h.size * 1.15 + 20 * (1 - a), 800, h.size, ink('#0f1424'), 'center', HF); c.restore(); }); }
      const n = Math.max(1, items.length), step = Math.min(160, 760 / n), y0 = 780 - ((n - 1) * step) / 2 + (head ? 30 : 0);
      items.forEach((it, i) => {
        const k = back(seg(t, 0.25 + i * Math.min(0.5, (D * 0.55) / n), 0.75 + i * Math.min(0.5, (D * 0.55) / n)));
        if (k <= 0) return;
        const y = y0 + i * step, w = 880, h = Math.min(128, step - 22);
        c.save(); c.translate(W / 2 + (1 - k) * 420, y); c.globalAlpha *= clamp(k * 1.4);
        if (isGlass()) glass(-w / 2, -h / 2, w, h, 30, 0.1);
        else { c.shadowColor = 'rgba(20,30,70,0.12)'; c.shadowBlur = 30; c.shadowOffsetY = 10; rr(-w / 2, -h / 2, w, h, 30); c.fillStyle = '#ffffff'; c.fill(); c.shadowColor = 'transparent'; }
        c.beginPath(); c.arc(-w / 2 + 64, 0, 30, 0, Math.PI * 2); c.fillStyle = A; c.fill(); navIcon('check', -w / 2 + 64, 0, '#fff');
        const px = fitPx(it, w - 160, 600, 40, UF); text(it, -w / 2 + 116, 0, 600, px, ink('#111827'), 'left', UF);
        c.restore();
      });
    };
    const shotStat = (t: number, D: number) => {
      bgD(t);
      if (isGlass()) { const k = back(seg(t, 0, 0.5)); c.save(); c.translate(W / 2, 760); c.scale(k, k); glass(-450, -330, 900, 560, 64, 0.08); c.restore(); }
      if (ST === 'cinema') { tag('PRICE', t); c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 2; c.strokeRect(90, 400, W - 180, 700); }
      const src = fmt(P.title);
      const nums = [...src.matchAll(/(\d[\d.,\s]*\d|\d)\s*(₮|%|\+|төгрөг|мянга)?/g)].map((m) => ({ raw: m[0].trim(), n: Number(m[1].replace(/[\s,]/g, '')), unit: m[2] ?? '' }));
      // with two numbers (before -> after) the leftover words rarely read well: only an explicit sub
      const sub = fmt(P.sub) || (nums.length >= 2 ? '' : src.replace(/(\d[\d.,\s]*\d|\d)\s*(₮|%|\+)?/g, '')
        .replace(/\s+/g, ' ').trim());
      const show = (v: number, unit: string) => { const s = Math.round(v).toLocaleString('en-US'); return unit === 'төгрөг' || unit === '₮' ? s + '₮' : unit === 'мянга' ? s + ' мянга' : s + unit; };
      if (nums.length >= 2) {
        // before -> after (e.g. a price drop)
        const [a, b] = nums, st = eo(seg(t, D * 0.25, D * 0.4)), nb = back(seg(t, D * 0.42, D * 0.6));
        const s1 = show(a.n, a.unit), p1 = fitPx(s1, W - 260, 600, 110, 'Oswald');
        c.save(); c.globalAlpha *= eo(seg(t, 0.05, 0.4)) * (1 - 0.45 * st); text(s1, W / 2, 560, 600, p1, '#c7d0e6', 'center', 'Oswald');
        const w1 = tw(s1, 600, p1, 'Oswald'); c.strokeStyle = '#ff4d6d'; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(W / 2 - w1 / 2 - 14, 568); c.lineTo(W / 2 - w1 / 2 - 14 + (w1 + 28) * st, 552); c.stroke(); c.restore();
        if (nb > 0) { const s2 = show(b.n, b.unit), p2 = fitPx(s2, W - 200, 700, 190, 'Oswald'); c.save(); c.translate(W / 2, 800); c.scale(nb, nb); c.shadowColor = `rgba(${hexRgb(A2)},0.8)`; c.shadowBlur = 60; const g = c.createLinearGradient(0, -100, 0, 100); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#b9c8ff'); text(s2, 0, 0, 700, p2, g, 'center', 'Oswald'); c.restore(); }
      } else {
        const v = nums[0] ?? { n: 100, unit: '+', raw: '' };
        const cur = v.n * eo(seg(t, 0.15, Math.min(D * 0.6, 2.2))), pulse = 1 + 0.05 * Math.exp(-Math.pow((t - Math.min(D * 0.6, 2.2)) * 6, 2));
        const s = show(cur, v.unit), px = fitPx(show(v.n, v.unit), W - 160, 700, 260, 'Oswald');
        c.save(); c.translate(W / 2, 700); c.scale(pulse, pulse); c.shadowColor = `rgba(${hexRgb(A)},0.9)`; c.shadowBlur = 70; const g = c.createLinearGradient(0, -140, 0, 140); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#b9c8ff'); text(s, 0, 0, 700, px, g, 'center', 'Oswald'); c.restore();
      }
      if (sub) { const a = eo(seg(t, 0.4, 0.9)), w = wrap(sub, W - 200, 700, 50, HF, 2); c.save(); c.globalAlpha *= a; w.lines.forEach((l, i) => text(l, W / 2, 960 + i * w.size * 1.2 + 20 * (1 - a), 700, w.size, '#c7d3ff', 'center', HF)); c.restore(); }
    };

    const inst: Scene2DInstance = {
      async prepare(prm) {
        P = prm;
        const fams = [fmt(prm.headFont) || 'Montserrat', fmt(prm.uiFont) || 'Inter', 'Oswald', 'JetBrains Mono'];
        try { await Promise.all(fams.flatMap((f) => [400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 40px "${f}"`, 'Аа Өө Үү 0123')))); } catch { /* fallback fonts */ }
        await Promise.all(Array.from({ length: IMGS }, async (_, i) => { srcs[i] = fmt(prm[`img${i + 1}`]); imgs[i] = await loadImg(srcs[i]); }));
        const s = fmt(prm.shot);
        const look = fmt(prm.style) || 'app';
        if (look === 'app' && (s === 'search' || s === 'cta')) buildMeadow();
        if (look === 'app' && s === 'roll') buildKeyboard();
      },
      draw(ctx, f: FrameState) {
        c = ctx; P = f.params;
        A = fmt(P.accent) || '#2f5bff'; A2 = fmt(P.accent2) || '#18b4ff';
        HF = fmt(P.headFont) || 'Montserrat'; UF = fmt(P.uiFont) || 'Inter'; SEED = Number(P.seed ?? 0); ST = fmt(P.style) || 'app';
        for (let i = 0; i < IMGS; i++) {
          const s = fmt(P[`img${i + 1}`]);
          if (s !== srcs[i]) { srcs[i] = s; imgs[i] = null; loadImg(s).then((im) => { if (srcs[i] === s) { imgs[i] = im; kit.redraw(); } }); }
        }
        const D = f.dur ?? (f.p > 0 ? f.t / f.p : 4), t = f.t;
        const k = Math.min(f.W / W, f.H / H);
        c.save();
        c.translate((f.W - W * k) / 2, (f.H - H * k) / 2); c.scale(k, k);
        c.beginPath(); c.rect(0, 0, W, H); c.clip();
        if (ST === 'cinema') {
          // hard cut: a short punch-in and a white flash instead of a dissolve
          const pk = 1 + 0.05 * (1 - eo(seg(t, 0, 0.3)));
          c.save(); c.translate(W / 2, H / 2); c.scale(pk, pk); c.translate(-W / 2, -H / 2);
          switch (fmt(P.shot)) {
            case 'dock': cineHook(t, D); break;
            case 'brand': cineBrand(t, D); break;
            case 'search': cineType(t, D); break;
            case 'cta': cineType(t, D, true); break;
            case 'cards': cineFrames(t, D); break;
            case 'grid': cineStrip(t, D); break;
            case 'roll': cineRoll(t, D); break;
            case 'features': cineList(t, D); break;
            case 'stat': shotStat(t, D); break;
            default: cineTitle(t, D);
          }
          c.restore();
          cineOver(t);
          if (t < 0.12) { c.fillStyle = `rgba(255,255,255,${0.55 * (1 - t / 0.12)})`; c.fillRect(0, 0, W, H); }
          c.restore();
          return;
        }
        // every shot dissolves in over the previous one (layers overlap slightly)
        c.globalAlpha = seg(t, 0, 0.3);
        switch (fmt(P.shot)) {
          case 'dock': shotDock(t, D); break;
          case 'brand': shotBrand(t, D); break;
          case 'search': shotSearch(t, D); break;
          case 'cta': shotSearch(t, D, true); break;
          case 'cards': shotCards(t, D); break;
          case 'grid': shotGrid(t, D); break;
          case 'roll': shotRoll(t, D); break;
          case 'features': shotFeatures(t, D); break;
          case 'stat': shotStat(t, D); break;
          default: shotTitle(t, D);
        }
        c.restore();
      },
      dispose() { /* shared backgrounds stay cached for the page */ },
    };
    return inst;
  },
};

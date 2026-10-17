// Concept-ad reel for a document-template pack, built only from the shots of
// the classic "app concept ad": a dock and cursor click, a pixel burst into
// the brand screen whose logo shreds into a swirl, a two-tier glass search bar
// in a sunny meadow with zoom-in typing, a result card cycling variants, a
// masonry grid with Save, a word roll with a selection box — re-used and
// timed to the voice-over. Canvas 2D (no Three.js), 9:16; the band at
// y ≈ 66–81 % stays free for subtitles. Times are seconds from the layer start.
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
/** "time | text" lines -> sorted cues (text keeps its trailing space) */
const cues = (s: unknown) => fmt(s).split('\n').filter((l) => l.includes('|')).map((l) => { const i = l.indexOf('|'); return [Number(l.slice(0, i)) || 0, l.slice(i + 1).replace(/^ /, '')] as [number, string]; }).sort((a, b) => a[0] - b[0]);

// design space: a 1080 x 1920 reel
const W = 1080, H = 1920;
const DOCS = 12;

export const hrPack: SceneDef = {
  id: 'hrPack',
  name: 'App concept ad (2D)',
  params: [
    { key: 'brand', kind: 'text', label: 'Brand / pack name', def: 'HR OFFICE MASTER PACK' },
    { key: 'placeholder', kind: 'text', label: 'Search placeholder', def: 'Загвар хайх...' },
    { key: 'typed', kind: 'text', label: 'Typed search (start time | text, one per line)', def: '10.05 | Өргөдөл, \n10.85 | албан бичиг, \n11.75 | гэрээ, \n12.45 | тушаал, \n13.15 | хүний нөөцийн маягт' },
    { key: 'roll', kind: 'text', label: 'Word roll (one per line; ~ marks the old price)', def: 'Өргөдөл\nГэрээ\nТушаал\nМаягт\nАнкет\nMaster Pack\n~40,000₮\n30,000₮' },
    { key: 'comment', kind: 'text', label: 'Comment to type', def: '1' },
    { key: 'commentHint', kind: 'text', label: 'Comment placeholder', def: 'Сэтгэгдэл бичих...' },
    { key: 'accent', kind: 'color', label: 'Brand colour', def: '#2f5bff' },
    { key: 'accent2', kind: 'color', label: 'Highlight colour (typed text)', def: '#18b4ff' },
    { key: 'headFont', kind: 'text', label: 'Headline font', def: 'Montserrat' },
    { key: 'uiFont', kind: 'text', label: 'Interface font', def: 'Inter' },
    ...Array.from({ length: DOCS }, (_, i) => ({ key: `doc${i + 1}`, kind: 'image' as const, label: `Document page ${i + 1}`, def: '' as const })),
  ],
  create2d(kit) {
    let c: CanvasRenderingContext2D;
    let P: Record<string, number | string> = {};
    let A = '#2f5bff', A2 = '#18b4ff', HF = 'Montserrat', UF = 'Inter';
    const imgs: (HTMLImageElement | null)[] = [];
    const srcs: string[] = [];
    let meadow: HTMLCanvasElement[] | null = null; // sky, far, mid, near, fore
    let meadowBlur: HTMLCanvasElement | null = null;
    let keyboard: HTMLCanvasElement | null = null;
    const shreds: number[][] = [];

    // ---------------------------------------------------------------- helpers
    const rr = (x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
    const font = (w: number, px: number, fam: string) => { c.font = `${w} ${px}px "${fam}", Inter, Montserrat, sans-serif`; };
    const text = (s: string, x: number, y: number, w: number, px: number, col: string | CanvasGradient, align: CanvasTextAlign = 'center', fam = UF) => {
      font(w, px, fam); c.fillStyle = col; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(s, x, y);
    };
    const tw = (s: string, w: number, px: number, fam = UF) => { font(w, px, fam); return c.measureText(s).width; };
    const fitPx = (s: string, maxW: number, w: number, px: number, fam: string) => { const m = tw(s, w, px, fam); return m > maxW ? px * maxW / m : px; };
    const hexRgb = (h: string) => { const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; };
    // black arrow cursor with a white rim (as in the reference)
    const cursor = (x: number, y: number, s = 1, a = 1) => {
      if (a <= 0) return;
      c.save(); c.globalAlpha *= a; c.translate(x, y); c.scale(2.1 * s, 2.1 * s);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 30); c.lineTo(7, 23.5); c.lineTo(12, 34.5); c.lineTo(17, 32.3); c.lineTo(12, 21.6); c.lineTo(21.4, 21.6); c.closePath();
      c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
      c.lineJoin = 'round'; c.lineWidth = 3.4; c.strokeStyle = '#fff'; c.stroke(); c.shadowColor = 'transparent';
      c.fillStyle = '#0b0b0d'; c.fill();
      c.restore();
    };
    const ripple = (x: number, y: number, k: number, rgb = '255,255,255') => { if (k <= 0 || k >= 1) return; c.beginPath(); c.arc(x, y, 26 + 90 * eo(k), 0, Math.PI * 2); c.strokeStyle = `rgba(${rgb},${0.65 * (1 - k)})`; c.lineWidth = 5; c.stroke(); };
    // brand mark: a page with a folded corner and "HR"
    const mark = (x: number, y: number, s: number, col = '#fff', ink = A) => {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.beginPath(); c.moveTo(-24, -32); c.lineTo(12, -32); c.lineTo(26, -18); c.lineTo(26, 32); c.lineTo(-24, 32); c.closePath(); c.fillStyle = col; c.fill();
      c.beginPath(); c.moveTo(12, -32); c.lineTo(12, -18); c.lineTo(26, -18); c.closePath(); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fill();
      text('HR', 1, 10, 900, 24, ink, 'center', HF);
      c.fillStyle = ink; c.globalAlpha *= 0.55; c.fillRect(-14, -18, 20, 4);
      c.restore();
    };
    const ICON: Record<string, [string, string]> = { notes: ['#fff7d6', '#ffd84a'], word: ['#4b8bf5', '#1d4ed8'], hr: ['', ''], excel: ['#34c76f', '#15803d'], chat: ['#5ff27a', '#1fbf3c'] };
    const appIcon = (kind: string, x: number, y: number, s: number) => {
      c.save(); c.translate(x, y); c.scale(s, s);
      const R = 50, r = 22;
      const col = ICON[kind];
      c.shadowColor = 'rgba(0,0,0,0.16)'; c.shadowBlur = 10; c.shadowOffsetY = 4;
      rr(-R, -R, 2 * R, 2 * R, r);
      if (kind === 'hr') c.fillStyle = '#ffffff';
      else { const g = c.createLinearGradient(0, -R, 0, R); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]); c.fillStyle = g; }
      c.fill(); c.shadowColor = 'transparent';
      if (kind === 'notes') { c.fillStyle = '#ffd84a'; c.fillRect(-R + 4, -R + 8, 2 * R - 8, 24); c.fillStyle = '#e5e1d3'; for (let i = 0; i < 3; i++) c.fillRect(-34, -2 + i * 16, 68, 3); }
      else if (kind === 'word' || kind === 'excel') { c.fillStyle = 'rgba(255,255,255,0.3)'; rr(-6, -30, 36, 60, 5); c.fill(); rr(-34, -22, 42, 44, 6); c.fillStyle = '#fff'; c.fill(); text(kind === 'word' ? 'W' : 'X', -13, 1, 800, 32, kind === 'word' ? '#1d4ed8' : '#15803d', 'center', UF); }
      else if (kind === 'chat') { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, -2, 32, 26, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(-20, 16); c.lineTo(-28, 32); c.lineTo(-4, 20); c.fill(); }
      else if (kind === 'hr') { c.beginPath(); c.arc(0, 0, 38, 0, Math.PI * 2); c.fillStyle = A; c.fill(); mark(0, 0, 0.82); }
      c.restore();
    };
    // a document page (the user's picture or a drawn placeholder), cropped to w x h
    const page = (i: number, x: number, y: number, w: number, h: number, crop = 0) => {
      const img = imgs[((i % DOCS) + DOCS) % DOCS];
      if (img) {
        const ih = Math.min(img.naturalHeight, img.naturalWidth * (h / w));
        c.drawImage(img, 0, crop * Math.max(0, img.naturalHeight - ih), img.naturalWidth, ih, x, y, w, h);
      } else {
        c.fillStyle = '#fff'; c.fillRect(x, y, w, h);
        c.fillStyle = '#dbe2f0'; c.fillRect(x + w * 0.12, y + w * 0.12, w * 0.5, w * 0.05);
        for (let k = 0; k < 18; k++) { c.fillStyle = k % 6 === 0 ? '#c7d2fe' : '#eef1f7'; c.fillRect(x + w * 0.12, y + w * (0.3 + k * 0.075), w * (0.76 - hash(i * 9 + k) * 0.3), w * 0.025); }
      }
    };

    // ---------------------------------------------------------------- the meadow, keyboard and logo shreds (built once)
    const build = () => {
      const MW = 1400, MH = 2300;
      const mk = () => { const x = document.createElement('canvas'); x.width = MW; x.height = MH; return x; };
      const sky = mk(), far = mk(), mid = mk(), near = mk(), fore = mk();
      // sky: deep blue to a bright hazy horizon, soft cumulus from value noise, sun glow
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
      // far: blurred distant meadow under the haze
      {
        const x = far.getContext('2d')!;
        x.fillStyle = '#9cc79a'; x.beginPath(); x.moveTo(0, MH); for (let u = 0; u <= MW; u += 20) x.lineTo(u, 1130 + Math.sin(u / 260) * 30 + Math.sin(u / 90) * 8); x.lineTo(MW, MH); x.fill();
        x.fillStyle = '#5f9e4e'; x.beginPath(); x.moveTo(0, MH); for (let u = 0; u <= MW; u += 20) x.lineTo(u, 1190 + Math.sin(u / 200 + 2) * 26); x.lineTo(MW, MH); x.fill();
        for (let i = 0; i < 1600; i++) { const u = hash(i * 1.7) * MW, v = 1200 + hash(i * 2.3) * 220; blade(x, u, v, 26 + hash(i) * 30, 4, (hash(i * 3) - 0.5) * 12, '#3f7f2f', '#9bcf73'); }
        const haze = x.createLinearGradient(0, 1050, 0, 1350); haze.addColorStop(0, 'rgba(240,248,255,0.85)'); haze.addColorStop(1, 'rgba(240,248,255,0)'); x.fillStyle = haze; x.fillRect(0, 1050, MW, 300);
      }
      // mid: dense grass with small flowers, slightly soft
      {
        const x = mid.getContext('2d')!;
        x.fillStyle = '#2f6e22'; x.fillRect(0, 1420, MW, MH - 1420);
        for (let i = 0; i < 4200; i++) { const u = hash(i * 1.31) * MW, v = 1330 + Math.pow(hash(i * 2.71), 0.7) * 700; const s = 0.6 + (v - 1330) / 700; blade(x, u, v, (50 + hash(i * 4.1) * 90) * s, (4 + hash(i * 5) * 4) * s, (hash(i * 8) - 0.5) * 40 * s, '#1f5a17', hash(i * 9) > 0.5 ? '#8fd45a' : '#5fae38'); }
        for (let i = 0; i < 70; i++) { const v = 1360 + hash(i * 3.3) * 520; daisy(x, hash(i * 9.1) * MW, v, 7 + (v - 1360) / 40, i % 4 === 0, 0.2); }
      }
      // near: tall sharp blades catching the sun
      {
        const x = near.getContext('2d')!;
        for (let i = 0; i < 1400; i++) { const u = hash(i * 7.31) * MW, v = 1650 + hash(i * 1.91) * 650; const s = 1 + (v - 1650) / 400; blade(x, u, v, (140 + hash(i * 4.7) * 220) * s, (7 + hash(i * 5.3) * 6) * s, (hash(i * 8.3) - 0.5) * 120 * s, '#1b4f14', hash(i * 9.7) > 0.4 ? '#a8e36b' : '#6cbf3f'); }
        for (let i = 0; i < 26; i++) { const v = 1700 + hash(i * 5.3) * 400; daisy(x, hash(i * 11.1) * MW, v, 20 + (v - 1700) / 14, i % 3 === 0, 0.3); }
      }
      // foreground: big out-of-focus blades and flowers framing the shot
      {
        const x = fore.getContext('2d')!;
        for (let i = 0; i < 70; i++) { const side = i % 2 ? hash(i) * 260 : MW - hash(i) * 260; blade(x, side, MH, 500 + hash(i * 3) * 600, 30 + hash(i * 5) * 26, (hash(i * 7) - 0.5) * 300, '#163f10', '#8ccf55'); }
        for (let i = 0; i < 6; i++) daisy(x, i % 2 ? 120 + hash(i) * 120 : MW - 140 - hash(i) * 120, 1900 + hash(i * 3) * 300, 70 + hash(i * 7) * 40, i % 3 === 1, 0.5);
      }
      // depth of field: blur each layer once
      const soften = (cv: HTMLCanvasElement, px: number) => { const tmp = mk(); const tx = tmp.getContext('2d')!; tx.filter = `blur(${px}px)`; tx.drawImage(cv, 0, 0); const x = cv.getContext('2d')!; x.clearRect(0, 0, MW, MH); x.drawImage(tmp, 0, 0); };
      soften(far, 6); soften(mid, 1.2); soften(fore, 14);
      meadow = [sky, far, mid, near, fore];
      // blurred copy for the frosted glass
      const b = document.createElement('canvas'); b.width = 700; b.height = 1150; const bx = b.getContext('2d')!;
      bx.filter = 'blur(14px)'; for (const L of meadow) bx.drawImage(L, 0, 0, 700, 1150);
      meadowBlur = b;
      // dark keyboard plate for the word roll
      const kb = document.createElement('canvas'); kb.width = 1300; kb.height = 2100; const kx = kb.getContext('2d')!;
      kx.fillStyle = '#060608'; kx.fillRect(0, 0, 1300, 2100);
      kx.save(); kx.translate(650, 1050); kx.rotate(-0.42); kx.translate(-900, -1300);
      for (let r = 0; r < 18; r++) for (let q = 0; q < 18; q++) {
        const g = kx.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, '#2b2e36'); g.addColorStop(1, '#15171c');
        kx.save(); kx.translate(q * 112 + (r % 2) * 40, r * 128); kx.fillStyle = g; kx.beginPath(); kx.roundRect(0, 0, 96, 110, 16); kx.fill(); kx.strokeStyle = 'rgba(255,255,255,0.06)'; kx.lineWidth = 2; kx.stroke(); kx.restore();
      }
      kx.restore();
      { const tmp = document.createElement('canvas'); tmp.width = 1300; tmp.height = 2100; const tx = tmp.getContext('2d')!; tx.filter = 'blur(5px)'; tx.drawImage(kb, 0, 0); kx.clearRect(0, 0, 1300, 2100); kx.drawImage(tmp, 0, 0); }
      const vg = kx.createRadialGradient(650, 900, 200, 650, 900, 1200); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.85)'); kx.fillStyle = vg; kx.fillRect(0, 0, 1300, 2100);
      keyboard = kb;
      // shreds of the logo (radial strands) for the swirl
      for (let i = 0; i < 520; i++) shreds.push([hash(i * 3.1) * Math.PI * 2, Math.sqrt(hash(i * 7.7)) * 150, 8 + hash(i * 1.3) * 26, hash(i * 9.9)]);
    };

    // camera over the meadow: a slow dolly, parallax per layer
    const drawMeadow = (t: number, t0: number) => {
      const L = meadow!; const k = t - t0;
      const rates = [0.004, 0.01, 0.018, 0.03, 0.05];
      L.forEach((cv, i) => {
        const s = 1 + rates[i] * k, ox = -160 - k * (4 + i * 6), oy = -230 + k * i * 1.5;
        c.drawImage(cv, W / 2 + (ox - W / 2) * s, H / 2 + (oy - H / 2) * s, 1400 * s, 2300 * s);
      });
    };

    // ---------------------------------------------------------------- shot: dock + cursor
    const DOCK = ['notes', 'word', 'hr', 'excel', 'chat'];
    const STEP = 172, DY = 800;
    const dockX = (k: string) => W / 2 + (DOCK.indexOf(k) - 2) * STEP;
    const dockShot = (t: number, path: number[][], click: number, tips: [number, number, string, string][], t0: number) => {
      c.fillStyle = '#ebebed'; c.fillRect(0, 0, W, H);
      const vg = c.createRadialGradient(W / 2, H * 0.42, 100, W / 2, H * 0.42, 1300); vg.addColorStop(0, 'rgba(255,255,255,0.55)'); vg.addColorStop(1, 'rgba(0,0,0,0.06)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
      const z = 1 + 0.08 * eio(seg(t, t0, t0 + 4));
      c.save(); c.translate(W / 2, DY); c.scale(z, z); c.translate(-W / 2, -DY);
      const intro = eo(seg(t, t0, t0 + 0.45));
      c.save(); c.globalAlpha *= intro;
      const total = DOCK.length * STEP - 40;
      rr(W / 2 - total / 2 - 26, DY - 92, total + 52, 184, 50); c.fillStyle = 'rgba(255,255,255,0.82)'; c.shadowColor = 'rgba(0,0,0,0.1)'; c.shadowBlur = 40; c.shadowOffsetY = 12; c.fill(); c.shadowColor = 'transparent';
      c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.stroke();
      const [mx, my] = keys(t, path);
      for (const k of DOCK) {
        const ix = dockX(k);
        const hover = Math.abs(mx - ix) < 76 && Math.abs(my - DY) < 90 ? 1 : 0;
        const pressK = hover ? Math.sin(Math.PI * seg(t, click, click + 0.2)) : 0;
        appIcon(k, ix, DY, 1.28 + 0.1 * hover - 0.15 * pressK);
      }
      c.restore();
      for (const [a, b2, icon, label] of tips) {
        const tk = seg(t, a, a + 0.15) * (1 - seg(t, b2, b2 + 0.15));
        if (tk <= 0) continue;
        const ix = dockX(icon), w = tw(label, 600, 28) + 46;
        c.save(); c.globalAlpha *= tk; rr(ix - w / 2, DY - 180, w, 54, 14); c.fillStyle = 'rgba(30,32,40,0.88)'; c.fill(); text(label, ix, DY - 153, 600, 28, '#fff'); c.restore();
      }
      cursor(mx, my, t > click && t < click + 0.18 ? 0.86 : 1, clamp((t - path[0][0]) / 0.25));
      c.restore();
    };

    // ---------------------------------------------------------------- shot: pixel burst -> brand screen -> shredded swirl
    const brandShot = (t: number, t0: number, swirl: number, word: boolean) => {
      const cx = W / 2, cy = DY;
      const k = seg(t, t0, t0 + 0.5);
      c.fillStyle = '#ebebed'; c.fillRect(0, 0, W, H);
      c.fillStyle = A; c.beginPath(); c.arc(cx, cy, 2300 * eo5(k), 0, Math.PI * 2); c.fill();
      // hollow pixel squares flying out of the icon
      for (let i = 0; i < 70; i++) {
        const a = hash(i) * Math.PI * 2, life = seg(t, t0 - 0.05 + hash(i + 2) * 0.12, t0 + 0.75);
        if (life <= 0 || life >= 1) continue;
        const d = (80 + hash(i + 1) * 520) * eo(life), s = 18 + hash(i + 3) * 30;
        c.save(); c.globalAlpha *= 1 - life; c.strokeStyle = k > 0.3 ? 'rgba(255,255,255,0.9)' : A; c.lineWidth = 4;
        c.strokeRect(cx + Math.cos(a) * d - s / 2, cy + Math.sin(a) * d - s / 2, s, s); c.restore();
      }
      if (t < t0 + 0.2) return;
      for (let i = 4; i >= 1; i--) { c.beginPath(); c.arc(cx, cy, (230 + i * 165) * (0.94 + 0.06 * seg(t, t0, t0 + 2.5)), 0, Math.PI * 2); c.fillStyle = `rgba(255,255,255,${0.035 + 0.02 * (4 - i)})`; c.fill(); }
      const ls = back(seg(t, t0 + 0.2, t0 + 0.7));
      const shred = seg(t, swirl - 0.6, swirl), sw = seg(t, swirl, swirl + 0.7);
      c.save(); c.translate(cx, cy); c.scale(ls, ls);
      if (sw <= 0) {
        c.beginPath(); c.arc(0, 0, 178, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 10; c.stroke();
        c.shadowColor = 'rgba(0,0,0,0.2)'; c.shadowBlur = 40; c.shadowOffsetY = 16;
        c.beginPath(); c.arc(0, 0, 160, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.shadowColor = 'transparent';
        const lg = c.createLinearGradient(0, -150, 0, 150); lg.addColorStop(0, `rgba(${hexRgb(A)},0.82)`); lg.addColorStop(1, A);
        c.beginPath(); c.arc(0, 0, 146, 0, Math.PI * 2); c.fillStyle = lg; c.fill();
        // the mark frays into strands before it goes
        if (shred > 0) {
          c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 3;
          for (const [a, r, len, s] of shreds) { if (s > shred * 1.3) continue; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); c.lineTo(Math.cos(a) * (r * 0.5 + len * shred), Math.sin(a) * (r * 0.5 + len * shred)); c.stroke(); }
        }
        mark(0, 0, 2.7 * (1 - 0.1 * shred));
      } else {
        // vortex of white strands spinning out toward the lens
        c.strokeStyle = `rgba(255,255,255,${0.9 * (1 - sw)})`;
        for (const [a, r, len, s] of shreds) {
          const ang = a + sw * (2.4 + s * 2), rad = r * (1 + sw * (2 + s * 5)), L2 = rad + len * (1 + sw * 4);
          c.lineWidth = 3 + 8 * sw;
          c.beginPath(); c.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad); c.lineTo(Math.cos(ang - 0.15 - sw * 0.3) * L2, Math.sin(ang - 0.15 - sw * 0.3) * L2); c.stroke();
        }
      }
      c.restore();
      if (word) {
        const wa = seg(t, t0 + 0.6, t0 + 1.1) * (1 - sw);
        const ws = fmt(P.brand).split(' '), top = ws.slice(0, Math.ceil(ws.length / 2)).join(' '), bot = ws.slice(Math.ceil(ws.length / 2)).join(' ');
        c.save(); c.globalAlpha *= wa;
        text(top, cx, cy + 300 + 24 * (1 - eo(wa)), 800, fitPx(top, W - 180, 800, 76, HF), '#fff', 'center', HF);
        font(400, 42, HF); (c as any).letterSpacing = '14px'; c.fillStyle = 'rgba(255,255,255,0.88)'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(bot, cx + 7, cy + 382 + 24 * (1 - eo(wa))); (c as any).letterSpacing = '0px';
        c.restore();
      }
    };

    // ---------------------------------------------------------------- shot: two-tier glass search bar in the meadow
    const NAV = ['home', 'sliders', 'plus', 'bell', 'chat', 'share'];
    const navIcon = (k: string, x: number, y: number, col: string) => {
      c.save(); c.translate(x, y); c.strokeStyle = col; c.lineWidth = 3.2; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      if (k === 'home') { c.moveTo(-14, 2); c.lineTo(0, -12); c.lineTo(14, 2); c.moveTo(-10, -1); c.lineTo(-10, 13); c.lineTo(10, 13); c.lineTo(10, -1); }
      else if (k === 'sliders') { c.moveTo(-14, -7); c.lineTo(14, -7); c.moveTo(-14, 7); c.lineTo(14, 7); c.moveTo(-5, -12); c.lineTo(-5, -2); c.moveTo(6, 2); c.lineTo(6, 12); }
      else if (k === 'plus') { c.moveTo(0, -13); c.lineTo(0, 13); c.moveTo(-13, 0); c.lineTo(13, 0); }
      else if (k === 'bell') { c.moveTo(-11, 8); c.lineTo(11, 8); c.moveTo(-8, 8); c.quadraticCurveTo(-9, -12, 0, -12); c.quadraticCurveTo(9, -12, 8, 8); c.moveTo(-3, 13); c.lineTo(3, 13); }
      else if (k === 'chat') { c.arc(0, 0, 12, 0.4, Math.PI * 2.2); c.lineTo(12, 12); }
      else if (k === 'share') { c.moveTo(0, -13); c.lineTo(0, 5); c.moveTo(-7, -6); c.lineTo(0, -13); c.lineTo(7, -6); c.moveTo(-12, 2); c.lineTo(-12, 13); c.lineTo(12, 13); c.lineTo(12, 2); }
      c.stroke(); c.restore();
    };
    interface SearchOpts { t0: number; click: number; zin: number; zout: number; go: number; cuesList: [number, string][]; hint: string; send: boolean; cps: number }
    const searchShot = (t: number, o: SearchOpts) => {
      drawMeadow(t, o.t0);
      // text typed so far; the word being typed gets the highlight gradient
      let typed = '', active = '';
      for (const [ts, s] of o.cuesList) {
        const n = Math.floor((t - ts) * o.cps);
        if (n <= 0) continue;
        const part = s.slice(0, Math.min(s.length, n));
        typed += part; active = n < s.length + 8 ? part : '';
      }
      const zk = eio(seg(t, o.zin, o.zin + 0.55)) * (1 - eio(seg(t, o.zout, o.zout + 0.5)));
      const bw = 820, bx = W / 2 - bw / 2, by = 760, ih = 100, fy = by + ih / 2;
      const textX = bx + 112;
      // like a real input, long text scrolls left inside the field
      const areaR = bx + bw - 215;
      const scrollX = Math.max(0, textX + tw(typed, 600, 36) - areaR);
      const caretX = textX + tw(typed, 600, 36) - scrollX;
      const z = 1 + 1.35 * zk;
      // while zoomed in, the camera follows the caret
      const fx = lerp(W / 2, Math.max(bx + 330, caretX - 160), zk);
      c.save(); c.translate(W / 2, fy + 40 * zk); c.scale(z, z); c.translate(-fx, -fy);
      const ap = back(seg(t, o.t0 + 0.1, o.t0 + 0.6));
      const press = 1 - 0.03 * Math.sin(Math.PI * seg(t, o.click, o.click + 0.2));
      c.save(); c.translate(W / 2, fy); c.scale(ap * press, ap * press); c.translate(-W / 2, -fy);
      c.globalAlpha *= seg(t, o.t0 + 0.05, o.t0 + 0.35);
      // lower tier: frosted tray with the nav icons
      const ty = by + 30, th = 190;
      c.save(); rr(bx - 10, ty, bw + 20, th, 52); c.clip();
      const k = t - o.t0, s = 1 + 0.018 * k;
      c.drawImage(meadowBlur!, W / 2 + (-160 - W / 2) * s, H / 2 + (-230 - H / 2) * s, 1400 * s, 2300 * s);
      c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(bx - 10, ty, bw + 20, th);
      c.restore();
      rr(bx - 10, ty, bw + 20, th, 52); c.strokeStyle = 'rgba(255,255,255,0.65)'; c.lineWidth = 2; c.stroke();
      NAV.forEach((n, i) => navIcon(n, bx + 120 + i * ((bw - 240) / 5), ty + th - 52, 'rgba(255,255,255,0.78)'));
      // upper tier: the white input
      c.shadowColor = 'rgba(0,30,60,0.18)'; c.shadowBlur = 30; c.shadowOffsetY = 10;
      rr(bx, by, bw, ih, 50); c.fillStyle = 'rgba(255,255,255,0.97)'; c.fill(); c.shadowColor = 'transparent';
      c.beginPath(); c.arc(bx + 58, fy, 27, 0, Math.PI * 2); c.fillStyle = A; c.fill(); mark(bx + 58, fy, 0.56);
      if (!typed) text(o.hint, textX, fy, 400, 34, '#9aa1ad', 'left', UF);
      else {
        c.save(); c.beginPath(); c.rect(textX - 8, by, areaR - textX + 16, ih); c.clip();
        const tx0 = textX - scrollX;
        const done = typed.slice(0, typed.length - active.length);
        text(done, tx0, fy, 600, 36, '#111318', 'left', UF);
        const dw = tw(done, 600, 36);
        const hg = c.createLinearGradient(tx0 + dw, 0, tx0 + dw + Math.max(40, tw(active, 600, 36)), 0); hg.addColorStop(0, A2); hg.addColorStop(1, A);
        text(active, tx0 + dw, fy, 600, 36, hg, 'left', UF);
        c.restore();
      }
      if (t > o.click && t < o.go + 0.4 && Math.floor(t * 2.2) % 2 === 0) { c.fillStyle = A; c.fillRect(caretX + 4, by + 28, 4, ih - 56); }
      // right side: pink camera pill and the search / send button
      rr(bx + bw - 200, by + 32, 78, 36, 18); c.fillStyle = '#ffd3db'; c.fill();
      c.strokeStyle = '#ef4466'; c.lineWidth = 3; rr(bx + bw - 175, by + 41, 28, 19, 5); c.stroke(); c.beginPath(); c.arc(bx + bw - 161, by + 50, 5, 0, Math.PI * 2); c.stroke();
      const sp = 1 - 0.14 * Math.sin(Math.PI * seg(t, o.go, o.go + 0.2));
      c.save(); c.translate(bx + bw - 66, fy); c.scale(sp, sp);
      const on = t > o.go;
      c.beginPath(); c.arc(0, 0, 34, 0, Math.PI * 2); c.fillStyle = on ? A : 'rgba(0,0,0,0.04)'; c.fill();
      c.strokeStyle = on ? '#fff' : '#111318'; c.lineWidth = 4.5; c.lineCap = 'round'; c.lineJoin = 'round';
      if (o.send) { c.beginPath(); c.moveTo(-12, -11); c.lineTo(14, 0); c.lineTo(-12, 11); c.lineTo(-6, 0); c.closePath(); c.stroke(); }
      else { c.beginPath(); c.arc(-4, -4, 13, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(6, 6); c.lineTo(15, 15); c.stroke(); }
      c.restore();
      c.restore();
      ripple(bx + bw - 66, fy, seg(t, o.go + 0.02, o.go + 0.45), hexRgb(A));
      c.restore();
      // cursor in screen space, hidden while zoomed in
      const [mx, my] = keys(t, [[o.t0 + 0.4, 900, 1150], [o.click - 0.05, bx + 200, fy + 8], [o.click + 0.3, bx + 190, fy + 10], [o.zout + 0.3, 760, 1000], [o.go - 0.05, bx + bw - 60, fy + 6], [o.go + 1, bx + bw - 60, fy + 6]]);
      ripple(bx + 200, fy, seg(t, o.click, o.click + 0.4), hexRgb(A));
      const ca = t < o.zin ? clamp((t - o.t0 - 0.4) / 0.2) : clamp((t - o.zout - 0.2) / 0.2);
      cursor(mx, my, (t > o.click && t < o.click + 0.18) || (t > o.go && t < o.go + 0.18) ? 0.86 : 1, ca);
    };

    // ---------------------------------------------------------------- shot: one result cycling style variants
    const VAR = [['#d7e2ff', '#7ea2ff'], ['#ffe1c2', '#ff9a3d'], ['#efd9ff', '#a855f7'], ['#d9fbe8', '#22c55e'], ['#ffffff', '#ffffff']];
    const cardShot = (t: number, t0: number, t1: number) => {
      c.fillStyle = '#f5f7fb'; c.fillRect(0, 0, W, H);
      const n = VAR.length, kk = seg(t, t0, t1 - 0.25) * n, i = Math.min(n - 1, Math.floor(kk)), local = Math.min(1, kk - i);
      const pop = 0.93 + 0.07 * back(clamp(local * 3));
      const w = 660 * pop, h = 856 * pop;
      const tilt = (i % 2 ? -1 : 1) * 0.12 * (1 - eo(local * 2));
      c.save(); c.translate(W / 2, 780);
      c.transform(1, tilt * 0.35, 0, 1, 0, 0); c.scale(1 - Math.abs(tilt) * 0.5, 1);
      c.shadowColor = 'rgba(30,40,80,0.22)'; c.shadowBlur = 50; c.shadowOffsetY = 22;
      rr(-w / 2, -h / 2, w, h, 34);
      const bg = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); bg.addColorStop(0, VAR[i][0]); bg.addColorStop(1, VAR[i][1]);
      c.fillStyle = bg; c.fill(); c.shadowColor = 'transparent';
      c.save(); rr(-w / 2, -h / 2, w, h, 34); c.clip();
      const last = i === n - 1, pw = last ? w : w * 0.8, ph = last ? h : h * 0.82;
      c.translate(0, last ? 0 : 18);
      c.shadowColor = 'rgba(0,0,0,0.18)'; c.shadowBlur = 20; c.fillStyle = '#fff'; c.fillRect(-pw / 2, -ph / 2, pw, ph); c.shadowColor = 'transparent';
      page(3, -pw / 2, -ph / 2, pw, ph, 0);
      if (!last) { c.globalCompositeOperation = 'multiply'; c.fillStyle = VAR[i][0]; c.fillRect(-pw / 2, -ph / 2, pw, ph); c.globalCompositeOperation = 'source-over'; }
      c.restore();
      c.restore();
    };

    // ---------------------------------------------------------------- shot: masonry grid, Save, pull back to a wall of templates
    const COLW = 310, GAP = 26, HC = 4, HR = 5;
    const gridShot = (t: number, t0: number, saveAt: number, pullFrom: number, pullTo: number) => {
      c.fillStyle = '#f5f7fb'; c.fillRect(0, 0, W, H);
      const z = lerp(1, 0.34, eio(seg(t, pullFrom, pullTo)));
      const drift = (t - t0) * 26;
      const x0 = W / 2 - (COLW + GAP) * HC;
      c.save(); c.translate(W / 2, 780); c.scale(z, z); c.translate(-W / 2, -780);
      let hover: { x: number; y: number; h: number } | null = null;
      for (let col = 0; col < 9; col++) {
        let y = -1400 + (col % 2) * 170 - drift * (col % 2 ? 1.1 : 0.9);
        const x = x0 + col * (COLW + GAP);
        for (let r = 0; r < 14; r++) {
          const n = col * 7 + r * 3;
          const hh = COLW * (1.05 + 0.42 * hash(n * 1.7));
          const ar = Math.min(6, Math.abs(col - HC) + Math.abs(r - HR));
          const intro = back(seg(t, t0 + 0.05 * ar, t0 + 0.45 + 0.05 * ar));
          if (col === HC && r === HR) hover = { x, y, h: hh };
          if (intro > 0 && y + hh > 780 - 780 / z - 50 && y < 780 + (H - 780) / z + 50) {
            const s = 0.7 + 0.3 * intro;
            c.save(); c.globalAlpha *= clamp(intro * 1.5); c.translate(x, y + hh / 2); c.scale(s, s);
            rr(-COLW / 2, -hh / 2, COLW, hh, 26); c.clip();
            page(n, -COLW / 2, -hh / 2, COLW, hh, hash(n * 3.3) * 0.5);
            c.restore();
          }
          y += hh + GAP;
        }
      }
      // the hovered card: Save -> Saved, an Open chip and a share button
      let sx = W / 2, sy = 780;
      if (hover) {
        const { x, y, h } = hover;
        const hv = seg(t, saveAt - 0.7, saveAt - 0.5) * (1 - seg(t, pullFrom - 0.4, pullFrom));
        if (hv > 0) {
          c.save(); c.translate(x, y + h / 2);
          rr(-COLW / 2, -h / 2, COLW, h, 26); c.fillStyle = `rgba(0,0,0,${0.18 * hv})`; c.fill();
          c.globalAlpha *= hv;
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
      const [mx, my] = keys(t, [[t0 + 0.5, 980, 1250], [saveAt - 0.6, sx - 120, sy + 140], [saveAt - 0.05, sx, sy], [saveAt + 0.7, sx + 8, sy + 6], [pullFrom, sx + 300, sy + 500]]);
      ripple(sx, sy, seg(t, saveAt, saveAt + 0.45), '230,0,35');
      cursor(mx, my, t > saveAt && t < saveAt + 0.18 ? 0.86 : 1, clamp((t - t0 - 0.5) / 0.25) * (1 - seg(t, pullFrom - 0.3, pullFrom)));
    };

    // ---------------------------------------------------------------- shot: word roll with a selection box
    const rollShot = (t: number, t0: number, t1: number, stops: number[]) => {
      c.drawImage(keyboard!, -110, -90);
      const words = lines(P.roll); if (!words.length) return;
      // ease between stop indices spread evenly over [t0, t1]
      const at = (i: number) => t0 + (t1 - t0) * (i / Math.max(1, stops.length - 1));
      let pos = stops[stops.length - 1];
      for (let i = 0; i < stops.length; i++) {
        if (t < at(i)) { pos = i === 0 ? stops[0] : lerp(stops[i - 1], stops[i], eio((t - at(i - 1)) / (at(i) - at(i - 1)))); break; }
      }
      pos = Math.min(words.length - 1, pos);
      const cy = 780, lh = 118;
      for (let i = 0; i < words.length; i++) {
        const d = i - pos; if (Math.abs(d) > 7) continue;
        const near = Math.exp(-d * d * 2.4);
        const w = words[i].replace(/^~/, '');
        const px = fitPx(w, W - 200, 700, 96, HF);
        c.save(); c.globalAlpha *= (0.22 + 0.78 * near) * Math.exp(-d * d * 0.05);
        text(w, W / 2, cy + d * lh, 700, px, near > 0.5 ? '#ffffff' : '#8b8f99', 'center', HF);
        // the old price is struck through while it is selected and after
        if (words[i].startsWith('~') && pos > i - 0.5) {
          const st = clamp((pos - i + 0.5) * 2.5);
          const ww = tw(w, 700, px, HF);
          c.strokeStyle = '#ff4466'; c.lineWidth = 8; c.lineCap = 'round';
          c.beginPath(); c.moveTo(W / 2 - ww / 2 - 10, cy + d * lh + 4); c.lineTo(W / 2 - ww / 2 - 10 + (ww + 20) * st, cy + d * lh - 4); c.stroke();
        }
        c.restore();
      }
      const ci = Math.round(pos), w = words[ci].replace(/^~/, '');
      const bw = tw(w, 700, fitPx(w, W - 200, 700, 96, HF), HF) + 56, bh = 128;
      c.strokeStyle = '#2f7bff'; c.lineWidth = 4; c.strokeRect(W / 2 - bw / 2, cy - bh / 2, bw, bh);
      for (const [hx, hy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) { c.fillStyle = '#fff'; c.fillRect(W / 2 + hx * bw / 2 - 8, cy + hy * bh / 2 - 8, 16, 16); c.strokeRect(W / 2 + hx * bw / 2 - 8, cy + hy * bh / 2 - 8, 16, 16); }
    };

    const fade = (t: number, a: number, b: number, col: string) => { if (t <= a) return; c.save(); c.globalAlpha = seg(t, a, b); c.fillStyle = col; c.fillRect(0, 0, W, H); c.restore(); };
    const ROLL_STOPS = [0, 4, 5, 6, 7];

    // ---------------------------------------------------------------- the edit (times match the voice-over)
    const inst: Scene2DInstance = {
      async prepare(prm) {
        P = prm;
        const fams = [fmt(prm.headFont) || 'Montserrat', fmt(prm.uiFont) || 'Inter'];
        try { await Promise.all(fams.flatMap((f) => [400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 40px "${f}"`, 'Аа Өө Үү 0123')))); } catch { /* fallback fonts */ }
        await Promise.all(Array.from({ length: DOCS }, async (_, i) => { srcs[i] = fmt(prm[`doc${i + 1}`]); imgs[i] = await loadImg(srcs[i]); }));
        if (!meadow) build();
      },
      draw(ctx, f: FrameState) {
        c = ctx; P = f.params;
        A = fmt(P.accent) || '#2f5bff'; A2 = fmt(P.accent2) || '#18b4ff';
        HF = fmt(P.headFont) || 'Montserrat'; UF = fmt(P.uiFont) || 'Inter';
        for (let i = 0; i < DOCS; i++) {
          const s = fmt(P[`doc${i + 1}`]);
          if (s !== srcs[i]) { srcs[i] = s; imgs[i] = null; loadImg(s).then((im) => { if (srcs[i] === s) { imgs[i] = im; kit.redraw(); } }); }
        }
        if (!meadow) build();
        const k = Math.min(f.W / W, f.H / H);
        c.save();
        c.fillStyle = '#05070f'; c.fillRect(0, 0, f.W, f.H);
        c.translate((f.W - W * k) / 2, (f.H - H * k) / 2); c.scale(k, k);
        c.beginPath(); c.rect(0, 0, W, H); c.clip();
        const t = f.t;
        const hr = dockX('hr'), wd = dockX('word'), xl = dockX('excel');
        if (t < 4.05) {
          dockShot(t, [[0.5, 1000, 560], [1.3, dockX('chat') + 6, DY + 6], [2.2, dockX('notes') + 6, DY + 8], [3.1, xl + 6, DY + 6], [3.75, hr + 6, DY + 4], [4.1, hr + 6, DY + 4]], 3.82, [[3.3, 4.0, 'hr', fmt(P.brand)]], 0);
        } else if (t < 6.75) brandShot(t, 4.05, 6.05, true);
        else if (t < 16.4) {
          searchShot(t, { t0: 6.6, click: 7.55, zin: 8.75, zout: 14.55, go: 15.6, cuesList: cues(P.typed), hint: fmt(P.placeholder), send: false, cps: 26 });
          if (t < 7.05) { c.save(); c.globalAlpha = 1 - seg(t, 6.75, 7.05); brandShot(t, 4.05, 6.05, true); c.restore(); }
          fade(t, 16.05, 16.4, '#f5f7fb');
        } else if (t < 18.95) cardShot(t, 16.4, 18.95);
        else if (t < 28.1) {
          gridShot(t, 18.95, 20.3, 23.0, 27.0);
          if (t < 19.35) { c.save(); c.globalAlpha = 1 - seg(t, 18.95, 19.35); cardShot(18.94, 16.4, 18.95); c.restore(); }
          fade(t, 27.75, 28.1, '#ebebed');
        } else if (t < 31.05) {
          dockShot(t, [[28.15, 1000, 560], [28.75, wd + 6, DY + 6], [29.7, wd + 10, DY + 8], [30.25, xl + 6, DY + 6], [30.8, xl + 6, DY + 4], [31.2, xl + 6, DY + 4]], 30.85, [[28.75, 29.75, 'word', 'Word'], [30.25, 31.0, 'excel', 'Excel']], 28.0);
        } else if (t < 33.65) brandShot(t, 31.05, 33.5, true);
        else if (t < 36.85) {
          rollShot(t, 33.65, 36.4, ROLL_STOPS);
          if (t < 33.95) { c.save(); c.globalAlpha = 1 - seg(t, 33.65, 33.95); brandShot(t, 31.05, 33.5, true); c.restore(); }
        } else if (t < 40.35) {
          searchShot(t, { t0: 36.8, click: 37.5, zin: 38.2, zout: 39.25, go: 39.95, cuesList: [[38.85, fmt(P.comment)]], hint: fmt(P.commentHint), send: true, cps: 6 });
          if (t < 37.1) { c.save(); c.globalAlpha = 1 - seg(t, 36.85, 37.1); rollShot(t, 33.65, 36.4, ROLL_STOPS); c.restore(); }
        } else brandShot(t, 40.35, 99, true);
        c.restore();
      },
      dispose() { meadow = null; meadowBlur = null; keyboard = null; },
    };
    return inst;
  },
};

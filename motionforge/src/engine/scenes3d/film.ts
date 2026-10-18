// Art-directed film renderer (Canvas 2D). One layer plays a whole storyboard
// (see ../film/plan.ts): it knows the scene before and after, so transitions
// carry elements across cuts instead of fading generic shots in and out.
// Art direction: warm paper and ink with one accent; a dark mode only for the
// offer; display type in Montserrat, interface type in Inter; real interface
// pieces (cards, rows, pills, a pointer) as the visual language; expo-out
// entrances, short overshoots for small pops, a slow camera push so nothing
// freezes. Design space 1080 x 1920; content stays inside the Reel safe area
// (y 230 - 1560) so captions and app buttons never cover it.
import type { FrameState, SceneDef, Scene2DInstance } from '../scene3d';
import { loadImg } from '../scene3d';
import { DEFAULT_PALETTE, TRANSITION_LEN, listOf, type FilmScene, type Storyboard } from '../film/plan';
import { DEMO_STORYBOARD } from '../film/demo';

const W = 1080, H = 1920, IMGS = 12, X0 = 96, XW = W - 2 * X0;
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
const expo = (x: number) => { x = clamp(x); return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); };
const eio = (x: number) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const back = (x: number) => { x = clamp(x); const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Text audit for tests: every visible string drawn in the last frame with its box in design pixels. */
export interface AuditText { s: string; x0: number; y0: number; x1: number; y1: number; px: number; scene: string }
export const FILM_AUDIT: { on: boolean; items: AuditText[] } = { on: false, items: [] };

export function parseStoryboard(src: unknown): Storyboard | null {
  if (src === '' || src === undefined || src === null) return DEMO_STORYBOARD;
  try { const sb = typeof src === 'string' ? JSON.parse(src) : src; return sb && Array.isArray(sb.scenes) ? sb as Storyboard : null; } catch { return null; }
}

export const film: SceneDef = {
  id: 'film',
  name: 'Art-directed film (storyboard)',
  params: [
    { key: 'storyboard', kind: 'text', label: 'Storyboard (JSON)', def: '' },
    ...Array.from({ length: IMGS }, (_, i) => ({ key: `img${i + 1}`, kind: 'image' as const, label: `Picture ${i + 1}`, def: '' as const })),
  ],
  create2d(kit) {
    let c: CanvasRenderingContext2D;
    let sb: Storyboard | null = null, sbSrc = '';
    let PAL = DEFAULT_PALETTE, HF = 'Montserrat', UF = 'Inter', SCENE = '';
    const imgs: (HTMLImageElement | null)[] = [], srcs: string[] = [];
    const bufA = document.createElement('canvas'), bufB = document.createElement('canvas');

    // ---------------------------------------------------------------- type
    const font = (fam: 'd' | 'u', w: number, px: number) => { c.font = `${w} ${px}px "${fam === 'd' ? HF : UF}", Inter, sans-serif`; };
    const measure = (s: string, fam: 'd' | 'u', w: number, px: number, sp = 0) => { font(fam, w, px); (c as any).letterSpacing = `${sp}px`; const m = c.measureText(s).width; (c as any).letterSpacing = '0px'; return m; };
    const audit = (s: string, x: number, y: number, wd: number, px: number) => {
      if (!FILM_AUDIT.on || c.globalAlpha < 0.35 || !s.trim()) return;
      const m = c.getTransform(), k = Math.min(bufScale.x, bufScale.y), sc = Math.hypot(m.c, m.d) / k;
      // text that is still scaling in or overshooting is mid-animation, not a layout
      const cam = camScale || 1; if (sc / cam < 0.9 || sc / cam > 1.08) return;
      const pts = [[x, y - px * 0.55], [x + wd, y + px * 0.45]].map(([a, b]) => [(m.a * a + m.c * b + m.e) / k - bufScale.ox, (m.b * a + m.d * b + m.f) / k - bufScale.oy]);
      FILM_AUDIT.items.push({ s, x0: Math.min(pts[0][0], pts[1][0]), y0: Math.min(pts[0][1], pts[1][1]), x1: Math.max(pts[0][0], pts[1][0]), y1: Math.max(pts[0][1], pts[1][1]), px: px * Math.abs(m.d) / k, scene: SCENE });
    };
    const bufScale = { x: 1, y: 1, ox: 0, oy: 0 };
    let camScale = 1;
    /** draw one line; align by its left edge, centre or right edge; returns its width */
    const T = (s: string, x: number, y: number, fam: 'd' | 'u', w: number, px: number, col: string, align: 'l' | 'c' | 'r' = 'l', sp = 0) => {
      const wd = measure(s, fam, w, px, sp), x0 = align === 'l' ? x : align === 'c' ? x - wd / 2 : x - wd;
      font(fam, w, px); (c as any).letterSpacing = `${sp}px`; c.fillStyle = col; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(s, x0, y); (c as any).letterSpacing = '0px';
      audit(s, x0, y, wd, px);
      return wd;
    };
    /** largest size <= max that fits maxW (never below min): words never break */
    const fit = (lines: string[], fam: 'd' | 'u', w: number, max: number, min: number, maxW = XW) => {
      let px = max;
      while (px > min && lines.some((l) => measure(l, fam, w, px) > maxW)) px -= 2;
      return px;
    };
    /** line rises out of a mask (k 0..1) */
    const rise = (s: string, x: number, y: number, fam: 'd' | 'u', w: number, px: number, col: string, k: number, align: 'l' | 'c' = 'l') => {
      if (k <= 0) return 0;
      const wd = measure(s, fam, w, px), x0 = align === 'l' ? x : x - wd / 2;
      c.save(); c.beginPath(); c.rect(x0 - 20, y - px * 0.75, wd + 40, px * 1.5); c.clip();
      const e = expo(k); c.globalAlpha *= clamp(k * 3);
      T(s, x0, y + (1 - e) * px * 1.1, fam, w, px, col, 'l');
      c.restore();
      return wd;
    };
    /** words appear one by one (fade + small rise) */
    const words = (s: string, x: number, y: number, fam: 'd' | 'u', w: number, px: number, col: string, t: number, t0: number, step: number, align: 'l' | 'c' = 'l') => {
      const ws = s.split(' '), total = measure(s, fam, w, px), sp = measure(' ', fam, w, px);
      let xx = align === 'l' ? x : x - total / 2;
      ws.forEach((wd, i) => { const k = expo(seg(t, t0 + i * step, t0 + i * step + 0.5)); const ww = measure(wd, fam, w, px); if (k > 0) { c.save(); c.globalAlpha *= k; T(wd, xx, y + (1 - k) * 18, fam, w, px, col); c.restore(); } xx += ww + sp; });
      return total;
    };
    /** letters appear one by one at their final positions */
    const typed = (s: string, x: number, y: number, fam: 'd' | 'u', w: number, px: number, col: string, t: number, t0: number, rate: number, align: 'l' | 'c' = 'l') => {
      const total = measure(s, fam, w, px); let xx = align === 'l' ? x : x - total / 2;
      const n = Math.floor(clamp((t - t0) / rate, 0, s.length));
      const shown = s.slice(0, n);
      if (shown) T(shown, xx, y, fam, w, px, col);
      xx += measure(shown, fam, w, px);
      return { end: xx, done: n >= s.length };
    };

    // ---------------------------------------------------------------- shapes
    const rr = (x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
    const card = (x: number, y: number, w: number, h: number, r: number, fill: string, lift = 1) => {
      c.save(); c.shadowColor = `rgba(18,18,20,${0.1 * lift})`; c.shadowBlur = 50 * lift; c.shadowOffsetY = 22 * lift; rr(x, y, w, h, r); c.fillStyle = fill; c.fill(); c.restore();
    };
    const pointer = (x: number, y: number, s = 1, a = 1, press = 0) => {
      if (a <= 0) return;
      c.save(); c.globalAlpha *= a; c.translate(x, y); const k = 2.2 * s * (1 - 0.12 * press); c.scale(k, k);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 30); c.lineTo(7, 23.5); c.lineTo(12, 34.5); c.lineTo(17, 32.3); c.lineTo(12, 21.6); c.lineTo(21.4, 21.6); c.closePath();
      c.shadowColor = 'rgba(0,0,0,0.25)'; c.shadowBlur = 6; c.shadowOffsetY = 2; c.lineJoin = 'round'; c.lineWidth = 3; c.strokeStyle = '#fff'; c.stroke(); c.shadowColor = 'transparent';
      c.fillStyle = PAL.ink; c.fill(); c.restore();
    };
    const ripple = (x: number, y: number, k: number, col = PAL.accent) => { if (k <= 0 || k >= 1) return; c.save(); c.globalAlpha *= 1 - k; c.beginPath(); c.arc(x, y, 20 + 70 * expo(k), 0, Math.PI * 2); c.strokeStyle = col; c.lineWidth = 4; c.stroke(); c.restore(); };
    const folderIcon = (x: number, y: number, s: number, col: string) => {
      c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = col;
      c.beginPath(); c.moveTo(-40, -26); c.lineTo(-12, -26); c.lineTo(-4, -18); c.lineTo(40, -18); c.lineTo(40, 28); c.lineTo(-40, 28); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(-40, -10, 80, 4); c.restore();
    };
    /** brand mark: a page with a folded corner and three lines, on an accent tile */
    const mark = (x: number, y: number, s: number, k = 1) => {
      if (k <= 0) return;
      c.save(); c.translate(x, y); c.scale(s * k, s * k);
      rr(-60, -60, 120, 120, 30); c.fillStyle = PAL.accent; c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(-26, -36); c.lineTo(12, -36); c.lineTo(28, -20); c.lineTo(28, 36); c.lineTo(-26, 36); c.closePath(); c.fill();
      c.fillStyle = PAL.accent; c.fillRect(-14, -8, 30, 6); c.fillRect(-14, 6, 30, 6); c.fillRect(-14, 20, 18, 6);
      c.restore();
    };
    const pic = (i: number | undefined) => (i ? imgs[i - 1] : null) ?? null;
    /** document page: the real picture, cover-cropped from the top */
    const page = (i: number | undefined, x: number, y: number, w: number, h: number, r = 18) => {
      const img = pic(i);
      c.save(); rr(x, y, w, h, r); c.clip(); c.fillStyle = '#ffffff'; c.fillRect(x, y, w, h);
      if (img) { const s = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / s, sh = h / s; c.drawImage(img, (img.naturalWidth - sw) / 2, 0, sw, sh, x, y, w, h); }
      else { c.fillStyle = PAL.line; for (let k = 0; k < 14; k++) c.fillRect(x + w * 0.12, y + h * (0.12 + k * 0.055), w * (0.76 - hash(k + (i ?? 0)) * 0.3), h * 0.014); }
      c.restore();
    };
    const check = (x: number, y: number, r: number, k: number) => {
      if (k <= 0) return;
      c.save(); c.translate(x, y); c.scale(back(k), back(k)); c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fillStyle = PAL.accent; c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = r * 0.16; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(-r * 0.4, 0); c.lineTo(-r * 0.1, r * 0.32); c.lineTo(r * 0.45, -r * 0.32); c.stroke(); c.restore();
    };

    // ---------------------------------------------------------------- backgrounds
    const paper = () => { c.fillStyle = PAL.paper; c.fillRect(0, 0, W, H); };
    const dark = (t: number) => {
      c.fillStyle = PAL.dark; c.fillRect(0, 0, W, H);
      // one restrained light source, off centre, slowly moving
      const x = W * 0.78 + Math.sin(t * 0.4) * 40, y = H * 0.22 + Math.cos(t * 0.3) * 30;
      const g = c.createRadialGradient(x, y, 0, x, y, 900); g.addColorStop(0, hexA(PAL.accent, 0.2)); g.addColorStop(1, hexA(PAL.accent, 0)); c.fillStyle = g; c.fillRect(0, 0, W, H);
    };
    const hexA = (h: string, a: number) => { const n = parseInt(h.replace('#', '').slice(0, 6), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
    /** slow push towards (fx, fy): no frame ever stands still */
    const push = (t: number, D: number, fx = W / 2, fy = 900, amt = 0.03) => { const z = 1 + Math.max(amt, 0.045) * clamp(t / Math.max(0.5, D)); /* constant speed: the frame never settles into a still */ camScale = z; c.translate(fx, fy); c.scale(z, z); c.translate(-fx, -fy); };

    // ---------------------------------------------------------------- scenes (t: seconds into the scene, D: its length, b: beats in scene time)
    type Ctx = { s: FilmScene; t: number; D: number; b: number[] };
    const SC: Record<string, (x: Ctx) => void> = {
      // kinetic question: lines rise out of masks, one word in the accent, a caret waits
      question({ s, t, D, b }) {
        paper();
        c.save(); push(t, D, X0, 880);
        const ls = listOf(s.copy.lines), kick = s.copy.kicker, hl = s.copy.highlight;
        const px = fit(ls, 'd', 800, 150, 84), lh = px * 1.04, block = ls.length * lh + (kick ? 90 : 0), y0 = 880 - block / 2 + (kick ? 90 : 0) + px * 0.5;
        if (kick) rise(kick, X0, y0 - px * 0.5 - 60, 'u', 600, 46, PAL.muted, seg(t, 0, 0.5));
        let lastEnd = 0;
        ls.forEach((l, i) => {
          const t0 = (b[i] ?? 0.08 + i * 0.16), k = seg(t, t0, t0 + 0.6), y = y0 + i * lh;
          if (hl && l.includes(hl)) {
            // the line in three runs so the highlighted word is drawn once, in the accent, then underlined
            const at = l.indexOf(hl), pre = l.slice(0, at), post = l.slice(at + hl.length);
            const wPre = measure(pre, 'd', 800, px), wHl = measure(hl, 'd', 800, px);
            if (pre) rise(pre, X0, y, 'd', 800, px, PAL.ink, k);
            rise(hl, X0 + wPre, y, 'd', 800, px, PAL.accent, k);
            if (post) rise(post, X0 + wPre + wHl, y, 'd', 800, px, PAL.ink, k);
            if (k > 0) { const u = expo(seg(t, t0 + 0.45, t0 + 0.9)); c.fillStyle = PAL.accent; rr(X0 + wPre, y + px * 0.52, wHl * u, px * 0.07, px * 0.035); c.fill(); }
            lastEnd = measure(l, 'd', 800, px);
          } else lastEnd = rise(l, X0, y, 'd', 800, px, PAL.ink, k);
        });
        // before the first word: the caret waits where the line will start
        // before the first word: someone is typing (a bubble with three dots), so the hook moves from frame one
        const first = b[0] ?? 0.08;
        if (first > 0.4 && t < first + 0.15) {
          const k = expo(seg(t, 0, 0.35)) * (1 - seg(t, first - 0.1, first + 0.15)), bw = 250, bh = 128;
          c.save(); c.globalAlpha *= k; c.translate(X0 + bw / 2, y0); c.scale(lerp(0.6, 1, k), lerp(0.6, 1, k));
          rr(-bw / 2, -bh / 2, bw, bh, bh / 2); c.fillStyle = '#ffffff'; c.fill();
          for (let d = 0; d < 3; d++) { const ph = (t * 2.6 - d * 0.18) % 1, up = Math.sin(Math.PI * clamp(ph / 0.5)) * 12; c.beginPath(); c.arc((d - 1) * 56, -up, 17, 0, Math.PI * 2); c.fillStyle = d === 1 ? PAL.accent : hexA(PAL.accent, 0.55); c.fill(); }
          c.restore();
        }
        const lastT = (b[ls.length - 1] ?? 0.08 + (ls.length - 1) * 0.16) + 0.6, yl = y0 + (ls.length - 1) * lh;
        if (t > lastT && Math.floor((t - lastT) * 2.2) % 2 === 0) { c.fillStyle = PAL.accent; c.fillRect(X0 + lastEnd + 18, yl - px * 0.42, px * 0.08, px * 0.84); }
        c.restore();
      },
      // the pack: a dot opens into an ink card; the name rises inside it
      brand({ s, t, D, b }) {
        paper();
        c.save(); push(t, D, W / 2, 920);
        const b0 = b[0] ?? 0.05, k = expo(seg(t, b0, b0 + 0.7));
        const cw = lerp(130, 820, k), ch = lerp(130, 560, expo(seg(t, b0 + 0.08, b0 + 0.78))), cx = W / 2, cy = 960;
        if (t >= b0) {
          // folder tab grows with the card
          const tab = expo(seg(t, b0 + 0.3, b0 + 0.8));
          c.save(); c.shadowColor = 'rgba(18,18,20,0.18)'; c.shadowBlur = 60; c.shadowOffsetY = 28;
          c.fillStyle = PAL.ink;
          if (tab > 0) { rr(cx - cw / 2, cy - ch / 2 - 46 * tab, 300 * tab, 90, 26); c.fill(); }
          rr(cx - cw / 2, cy - ch / 2, cw, ch, lerp(65, 40, k)); c.fill(); c.restore();
          const name = s.copy.name ?? sb!.brand, sub = s.copy.sub ?? '';
          const npx = fit([name], 'd', 800, 132, 70, cw - 120);
          c.save(); rr(cx - cw / 2, cy - ch / 2, cw, ch, 40); c.clip();
          rise(name, cx, cy - 30, 'd', 800, npx, PAL.paper, seg(t, b0 + 0.35, b0 + 0.95), 'c');
          if (sub) { const sk = expo(seg(t, b0 + 0.55, b0 + 1.2)), spc = lerp(34, 16, sk); c.save(); c.globalAlpha *= sk; T(sub, cx + spc / 2, cy + 70, 'u', 600, 40, PAL.accent, 'c', spc); c.restore(); }
          c.restore();
        }
        if (s.copy.lead) words(s.copy.lead, W / 2, 470, 'd', 800, fit([s.copy.lead], 'd', 800, 84, 56), PAL.ink, t, (b[1] ?? b0 + 0.25), 0.12, 'c');
        c.restore();
      },
      // the pack opens: a window with its folders
      folders({ s, t, D }) {
        paper();
        c.save(); push(t, D, W / 2, 1000);
        if (s.copy.lead) rise(s.copy.lead, X0, 420, 'd', 800, fit([s.copy.lead], 'd', 800, 96, 60), PAL.ink, seg(t, 0.1, 0.7));
        const items = listOf(s.copy.items), wx = X0, wy = 560, ww = XW, rowH = 168, wh = 120 + items.length * rowH + 30;
        const k = expo(seg(t, 0, 0.6));
        c.save(); c.globalAlpha *= clamp(k * 2); c.translate(0, (1 - k) * 60);
        card(wx, wy, ww, wh, 36, '#ffffff');
        c.fillStyle = PAL.line; c.fillRect(wx, wy + 100, ww, 2);
        ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { c.beginPath(); c.arc(wx + 50 + i * 36, wy + 50, 11, 0, Math.PI * 2); c.fillStyle = col; c.fill(); });
        if (s.copy.title) T(s.copy.title, wx + ww / 2, wy + 52, 'u', 600, 30, PAL.muted, 'c');
        items.forEach((it, i) => {
          const rk = expo(seg(t, 0.35 + i * 0.12, 0.95 + i * 0.12)), y = wy + 130 + i * rowH + rowH / 2;
          if (rk <= 0) return;
          c.save(); c.globalAlpha *= rk; c.translate((1 - rk) * 50, 0);
          folderIcon(wx + 92, y, 1.05, PAL.accent);
          T(it, wx + 170, y, 'u', 600, fit([it], 'u', 600, 46, 34, ww - 260), PAL.ink);
          c.strokeStyle = PAL.muted; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(wx + ww - 70, y - 14); c.lineTo(wx + ww - 56, y); c.lineTo(wx + ww - 70, y + 14); c.stroke();
          if (i < items.length - 1) { c.fillStyle = PAL.line; c.fillRect(wx + 170, y + rowH / 2, ww - 210, 2); }
          c.restore();
        });
        c.restore();
        // the pointer arrives on the first folder
        const pk = seg(t, Math.max(0.8, D - 1.2), D - 0.2), fy = wy + 130 + rowH / 2;
        if (pk > 0) { const px = lerp(W - 120, wx + 360, eio(pk)), py = lerp(1600, fy + 10, eio(pk)); pointer(px, py, 1, clamp(pk * 4)); }
        c.restore();
      },
      // word roll: the selection box lands on each word as it is spoken
      roll({ s, t, D, b }) {
        paper();
        c.save(); push(t, D, W / 2, 920, 0.02);
        if (s.copy.kicker) rise(s.copy.kicker, W / 2, 470, 'u', 600, 46, PAL.muted, seg(t, 0, 0.5), 'c');
        const items = listOf(s.copy.items), px = fit(items, 'd', 800, 120, 72, XW - 80), lh = px * 1.45, cy = 940;
        // position along the list follows the beats
        let pos = 0;
        b.forEach((bt, i) => { pos = lerp(pos, i, expo(seg(t, bt - 0.12, bt + 0.3))); });
        const intro = expo(seg(t, 0, 0.5));
        c.save(); c.beginPath(); c.rect(0, 560, W, 760); c.clip();
        items.forEach((it, i) => {
          const d = i - pos, a = Math.exp(-d * d * 0.9) * 0.85 + 0.15;
          if (Math.abs(d) > 3.2) return;
          c.save(); c.globalAlpha *= a * intro; T(it, W / 2, cy + d * lh + (1 - intro) * 40, 'd', 800, px, Math.abs(d) < 0.5 ? PAL.ink : PAL.muted, 'c'); c.restore();
        });
        c.restore();
        const fadeT = c.createLinearGradient(0, 560, 0, 720); fadeT.addColorStop(0, PAL.paper); fadeT.addColorStop(1, hexA(PAL.paper, 0)); c.fillStyle = fadeT; c.fillRect(0, 560, W, 160);
        const fadeB = c.createLinearGradient(0, 1160, 0, 1320); fadeB.addColorStop(0, hexA(PAL.paper, 0)); fadeB.addColorStop(1, PAL.paper); c.fillStyle = fadeB; c.fillRect(0, 1160, W, 160);
        const ci = Math.round(pos), cur = items[ci] ?? '', bw = measure(cur, 'd', 800, px) + 70, bh = px * 1.3;
        const on = seg(t, (b[0] ?? 0) - 0.15, (b[0] ?? 0) + 0.1);
        if (on > 0) {
          c.save(); c.globalAlpha *= on; c.strokeStyle = PAL.accent; c.lineWidth = 5; c.strokeRect(W / 2 - bw / 2, cy - bh / 2, bw, bh);
          for (const [hx, hy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.fillStyle = '#fff'; c.fillRect(W / 2 + hx * bw / 2 - 10, cy + hy * bh / 2 - 10, 20, 20); c.strokeRect(W / 2 + hx * bw / 2 - 10, cy + hy * bh / 2 - 10, 20, 20); }
          c.restore();
        }
        c.restore();
      },
      // a folder's files as rows; the caption lands on its beat
      list({ s, t, D, b }) {
        paper();
        c.save(); push(t, D, W / 2, 900, 0.02);
        const k = expo(seg(t, 0, 0.6));
        folderIcon(X0 + 46, 340, 1.1 * k, PAL.accent);
        if (s.copy.title) rise(s.copy.title, X0 + 120, 342, 'd', 800, fit([s.copy.title], 'd', 800, 64, 44, XW - 130), PAL.ink, seg(t, 0.05, 0.6));
        const items = listOf(s.copy.items), rowH = 150, gap = 22, top = 450, scroll = eio(seg(t, 0.6, D)) * Math.max(0, items.length - 5) * (rowH + gap);
        c.save(); c.beginPath(); c.rect(0, top - 10, W, 860); c.clip();
        items.forEach((it, i) => {
          const y = top + i * (rowH + gap) - scroll, rk = expo(seg(t, 0.15 + i * 0.08, 0.7 + i * 0.08));
          if (y > top + 860 || y + rowH < top - 10 || rk <= 0) return;
          c.save(); c.globalAlpha *= rk; c.translate((1 - rk) * 70, 0);
          card(X0, y, XW, rowH, 26, '#ffffff', 0.6);
          page((s.images ?? [])[i], X0 + 22, y + 20, 110, 110, 12);
          const [name, kind] = it.split('|').map((x) => x.trim());
          T(name, X0 + 160, y + (kind ? 56 : rowH / 2), 'u', 600, fit([name], 'u', 600, 40, 30, XW - 260), PAL.ink);
          if (kind) T(kind, X0 + 160, y + 102, 'u', 500, 32, PAL.muted);
          for (let d = 0; d < 3; d++) { c.beginPath(); c.arc(X0 + XW - 70 + d * 16, y + rowH / 2, 4.5, 0, Math.PI * 2); c.fillStyle = PAL.muted; c.fill(); }
          c.restore();
        });
        c.restore();
        // soft fade at the list edges
        const fade = c.createLinearGradient(0, top + 700, 0, top + 860); fade.addColorStop(0, hexA(PAL.paper, 0)); fade.addColorStop(1, PAL.paper); c.fillStyle = fade; c.fillRect(0, top + 700, W, 170);
        if (s.copy.caption) {
          const cap = s.copy.caption, hl = s.copy.highlight, cpx = fit([cap], 'd', 800, 86, 56), bt = b[0] ?? D * 0.5;
          const wd = rise(cap, X0, 1440, 'd', 800, cpx, PAL.ink, seg(t, bt - 0.2, bt + 0.4));
          if (hl && cap.includes(hl)) { const pre = measure(cap.slice(0, cap.indexOf(hl)), 'd', 800, cpx), hw = measure(hl, 'd', 800, cpx), u = expo(seg(t, bt + 0.2, bt + 0.7)); c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = hexA(PAL.accent, 0.22); rr(X0 + pre - 10, 1440 - cpx * 0.55, (hw + 20) * u, cpx * 1.1, 14); c.fill(); c.restore(); }
          void wd;
        }
        c.restore();
      },
      // a blank page: typing that goes nowhere, then a firm strike
      blank({ s, t, D, b }) {
        paper();
        c.save(); push(t, D, W / 2, 1000, 0.02);
        const ls = listOf(s.copy.lines), px = fit(ls, 'd', 800, 88, 56);
        ls.forEach((l, i) => rise(l, X0, 360 + i * px * 1.08, 'd', 800, px, PAL.ink, seg(t, 0.05 + i * 0.14, 0.65 + i * 0.14)));
        const pw = 620, ph = 840, px0 = W / 2 - pw / 2, py0 = 600, k = expo(seg(t, 0.1, 0.7)), strikeAt = b[0] ?? D * 0.7;
        const shrink = expo(seg(t, strikeAt, strikeAt + 0.5));
        c.save(); c.translate(W / 2, py0 + ph / 2); c.rotate(-0.04 * shrink); c.scale(1 - 0.06 * shrink, 1 - 0.06 * shrink); c.translate(-W / 2, -(py0 + ph / 2));
        c.globalAlpha *= k; c.translate(0, (1 - k) * 80);
        card(px0, py0, pw, ph, 22, '#ffffff');
        // grey "words" typed and erased twice
        const cyc = [[0.4, 1.0, 1.25], [1.35, 1.75, 1.95]];
        let shown = 0;
        for (const [a, m, e] of cyc) { if (t >= a && t < e) shown = t < m ? (t - a) / (m - a) : 1 - (t - m) / (e - m); }
        const rows = 3, lineW = pw - 140;
        let caretX = px0 + 70, caretY = py0 + 110;
        for (let r = 0; r < rows; r++) {
          const fr = clamp(shown * rows - r); if (fr <= 0) break;
          const w = lineW * (r === rows - 1 ? 0.6 : 1) * fr; c.fillStyle = PAL.line; rr(px0 + 70, py0 + 90 + r * 64, w, 26, 13); c.fill();
          caretX = px0 + 70 + w + 8; caretY = py0 + 103 + r * 64;
        }
        if (t < strikeAt && Math.floor(t * 2.4) % 2 === 0) { c.fillStyle = PAL.accent; c.fillRect(caretX, caretY - 24, 5, 48); }
        c.restore();
        // the strike
        const sk = expo(seg(t, strikeAt, strikeAt + 0.35));
        if (sk > 0) { c.save(); c.strokeStyle = PAL.alert; c.lineWidth = 22; c.lineCap = 'round'; c.beginPath(); c.moveTo(px0 + 40, py0 + ph - 60); c.lineTo(lerp(px0 + 40, px0 + pw - 40, sk), lerp(py0 + ph - 60, py0 + 60, sk)); c.stroke(); c.restore(); }
        c.restore();
      },
      // a ready template: it lands, the pointer takes it, fields fill, a check
      template({ s, t, D, b }) {
        paper();
        c.save(); push(t, D, W / 2, 1000, 0.025);
        const heads = [s.copy.lead1, s.copy.lead2, s.copy.lead3].filter(Boolean) as string[];
        const hb = [0.05, b[1] ?? D * 0.4, b[2] ?? D * 0.75];
        const hpx = fit(heads, 'd', 800, 80, 52);
        heads.forEach((h, i) => {
          const kin = seg(t, hb[i], hb[i] + 0.55), kout = i + 1 < heads.length ? seg(t, hb[i + 1] - 0.1, hb[i + 1] + 0.3) : 0;
          if (kin <= 0 || kout >= 1) return;
          c.save(); c.beginPath(); c.rect(0, 300, W, 180); c.clip(); c.translate(0, -expo(kout) * 70); c.globalAlpha *= clamp(1 - kout * 1.6);
          rise(h, X0, 390, 'd', 800, hpx, i === heads.length - 1 ? PAL.accent : PAL.ink, kin); c.restore();
        });
        const pw = 600, ph = 820, px0 = W / 2 - pw / 2, py0 = 560;
        const land = seg(t, 0.15, 0.85), e = back(land), y = lerp(py0 - 260, py0, expo(land)), rot = lerp(-0.08, 0, e);
        c.save(); c.translate(W / 2, y + ph / 2); c.rotate(rot); c.globalAlpha *= clamp(land * 3); c.translate(-W / 2, -(y + ph / 2));
        c.save(); c.shadowColor = 'rgba(18,18,20,0.14)'; c.shadowBlur = 60; c.shadowOffsetY = 26; rr(px0, y, pw, ph, 22); c.fillStyle = '#fff'; c.fill(); c.restore();
        page((s.images ?? [])[0], px0, y, pw, ph, 22);
        // fields fill as "your information" goes in
        const fb = b[1] ?? D * 0.4;
        [[0.2, 0.62], [0.31, 0.5], [0.42, 0.7]].forEach(([fy, fw], i) => { const fk = expo(seg(t, fb + i * 0.28, fb + i * 0.28 + 0.45)); if (fk > 0) { c.fillStyle = hexA(PAL.accent, 0.18); rr(px0 + 60, y + ph * fy - 22, (pw - 120) * fw * fk, 44, 10); c.fill(); c.fillStyle = PAL.accent; c.fillRect(px0 + 60 + (pw - 120) * fw * fk, y + ph * fy - 20, 4, 40); } });
        // download button on the card
        const bx = px0 + pw - 70, by = y + ph - 70, click = b[0] ?? D * 0.25, pressK = Math.sin(Math.PI * seg(t, click - 0.05, click + 0.15));
        c.save(); c.translate(bx, by); c.scale(1 - 0.1 * pressK, 1 - 0.1 * pressK); c.beginPath(); c.arc(0, 0, 46, 0, Math.PI * 2); c.fillStyle = PAL.accent; c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(0, -20); c.lineTo(0, 16); c.moveTo(-14, 3); c.lineTo(0, 17); c.lineTo(14, 3); c.stroke();
        const ring = seg(t, click + 0.05, click + 0.6); if (ring > 0 && ring < 1) { c.beginPath(); c.arc(0, 0, 58, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * expo(ring)); c.strokeStyle = PAL.accent; c.lineWidth = 6; c.stroke(); }
        c.restore();
        ripple(bx, by, seg(t, click, click + 0.5));
        check(px0 + pw - 30, y + 30, 54, seg(t, hb[2] + 0.1, hb[2] + 0.5));
        c.restore();
        const [mx, my] = t < click ? [lerp(W - 80, bx + 14, eio(seg(t, 0.6, click))), lerp(1680, by + 16, eio(seg(t, 0.6, click)))] : [lerp(bx + 14, W - 60, eio(seg(t, click + 0.4, click + 1.2))), lerp(by + 16, 1700, eio(seg(t, click + 0.4, click + 1.2)))];
        pointer(mx, my, 1, clamp(seg(t, 0.6, 0.8)) * (1 - seg(t, click + 0.9, click + 1.2)), pressK);
        c.restore();
      },
      // the number counts up; scattered pages gather into one folder ("in one place")
      counter({ s, t, D, b }) {
        paper();
        c.save(); push(t, D, W / 2, 900, 0.025);
        const lean = eio(seg(t, (b[1] ?? D * 0.55) + 0.9, D));
        if (lean > 0) { const z = 1 + 0.12 * lean; c.translate(W / 2, 1290); c.scale(z, z); c.translate(-W / 2, -1290); camScale *= z; }
        const num = s.copy.number ?? '100+', digits = parseInt(num, 10) || 100, plus = num.replace(/[0-9]/g, '');
        const done = b[0] ?? Math.min(D * 0.35, 1.4), v = Math.round(digits * eio(seg(t, 0.05, done)));
        // pages fly in from the frame edges and stack into the folder
        const g0 = b[1] ?? D * 0.55, fx = W / 2, fy = 1290, n = 18, imgsN = (s.images ?? []).length;
        const fold = expo(seg(t, g0 - 0.3, g0 + 0.3));
        for (let i = 0; i < n; i++) {
          const a = hash(i * 3.3) * Math.PI * 2, r0 = 900 + hash(i) * 300, t0 = g0 - 0.9 + i * 0.03, k = eio(seg(t, t0, t0 + 0.9));
          if (k <= 0) continue;
          const x = lerp(fx + Math.cos(a) * r0, fx + (hash(i * 7) - 0.5) * 40, k), y = lerp(fy + Math.sin(a) * r0 * 0.7, fy - 40 - (n - i) * 1.5, k), sc = lerp(1, 0.55, k);
          c.save(); c.translate(x, y); c.rotate(lerp((hash(i * 9) - 0.5) * 0.8, (hash(i * 5) - 0.5) * 0.1, k)); c.scale(sc, sc);
          c.save(); c.shadowColor = 'rgba(18,18,20,0.12)'; c.shadowBlur = 24; c.shadowOffsetY = 10; rr(-90, -125, 180, 250, 10); c.fillStyle = '#fff'; c.fill(); c.restore();
          page(imgsN ? (s.images ?? [])[i % imgsN] : undefined, -90, -125, 180, 250, 10);
          c.restore();
        }
        // the folder: back, pages, front flap closing over them
        if (fold > 0) {
          c.save(); c.translate(fx, fy); c.scale(fold, fold);
          c.fillStyle = PAL.accent; rr(-190, -150, 150, 40, 14); c.fill(); rr(-190, -128, 380, 250, 26); c.fill();
          c.restore();
        }
        const front = expo(seg(t, g0 + 0.5, g0 + 0.9));
        if (front > 0) { c.save(); c.translate(fx, fy + 122); c.transform(1, 0, 0, front, 0, 0); c.fillStyle = hexA(PAL.accent, 1); rr(-200, -200, 400, 200, 26); c.fill(); c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect(-200, -200, 400, 6); c.restore(); }
        const npx = 340, txt = String(v), wn = measure(String(digits), 'd', 800, npx), x0 = W / 2 - (wn + measure(plus, 'd', 800, npx)) / 2;
        c.save(); c.globalAlpha *= clamp(t * 5); T(txt, x0 + wn, 700, 'd', 800, npx, PAL.ink, 'r'); c.restore();
        const pk = back(seg(t, done - 0.05, done + 0.35));
        if (plus && pk > 0) { c.save(); c.translate(x0 + wn + npx * 0.05 + measure(plus, 'd', 800, npx) / 2, 700); c.scale(pk, pk); T(plus, 0, 0, 'd', 800, npx, PAL.accent, 'c'); c.restore(); }
        // as the camera leans into the folder, the type steps back
        if (s.copy.lead) { c.save(); c.globalAlpha *= 1 - lean; words(s.copy.lead, W / 2, 920, 'd', 800, fit([s.copy.lead], 'd', 800, 68, 48), PAL.ink, t, 0.4, 0.14, 'c'); c.restore(); }
        if (s.copy.tail) words(s.copy.tail, W / 2, 1462, 'd', 800, 72, PAL.accent, t, g0 + 0.3, 0.12, 'c');
        c.restore();
      },
      // Word, Excel; then the document opens and a line is edited in place
      apps({ s, t, D, b }) {
        paper();
        c.save(); push(t, D, W / 2, 900, 0.02);
        const tiles: [string | undefined, string, string][] = [[s.copy.a, '#185abd', 'W'], [s.copy.b, '#107c41', 'X']];
        tiles.forEach(([label, col, ch], i) => {
          if (!label) return;
          const k = back(seg(t, (b[i] ?? i * 0.5) - 0.05, (b[i] ?? i * 0.5) + 0.4)), x = W / 2 + (i - 0.5) * 300, y = 520;
          if (k <= 0) return;
          c.save(); c.translate(x, y); c.scale(k, k);
          c.save(); c.shadowColor = 'rgba(18,18,20,0.16)'; c.shadowBlur = 40; c.shadowOffsetY = 18; rr(-110, -110, 220, 220, 52); c.fillStyle = col; c.fill(); c.restore();
          T(ch, 0, 4, 'd', 800, 130, '#ffffff', 'c');
          c.restore();
          c.save(); c.globalAlpha *= seg(t, (b[i] ?? 0) + 0.15, (b[i] ?? 0) + 0.5); T(label, x, y + 160, 'u', 600, 42, PAL.ink, 'c'); c.restore();
        });
        const e0 = b[2] ?? D * 0.5;
        if (s.copy.lead) rise(s.copy.lead, W / 2, 820, 'd', 800, fit([s.copy.lead], 'd', 800, 76, 52), PAL.ink, seg(t, e0 - 0.1, e0 + 0.5), 'c');
        // editor window
        const k = expo(seg(t, e0, e0 + 0.6)), ww = XW, wh = 600, wx = X0, wy = lerp(1700, 920, k);
        if (k > 0) {
          card(wx, wy, ww, wh, 30, '#ffffff');
          c.fillStyle = '#185abd'; rr(wx, wy, ww, 80, 30); c.fill(); c.fillRect(wx, wy + 40, ww, 40);
          for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(255,255,255,0.35)'; rr(wx + 40 + i * 70, wy + 28, 44, 24, 8); c.fill(); }
          c.save(); rr(wx + 40, wy + 110, ww - 80, wh - 140, 10); c.clip(); page((s.images ?? [])[0], wx + 40, wy + 110, ww - 80, (ww - 80) * 1.3, 0); c.restore();
          const sel = expo(seg(t, e0 + 0.6, e0 + 1.1)), ly = wy + 250;
          if (sel > 0) { c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = hexA(PAL.accent, 0.28); rr(wx + 120, ly - 22, (ww - 300) * sel, 44, 6); c.fill(); c.restore(); }
          if (sel >= 1 && Math.floor(t * 2.4) % 2 === 0) { c.fillStyle = PAL.accent; c.fillRect(wx + 120 + (ww - 300), ly - 26, 5, 52); }
          pointer(lerp(wx + ww - 40, wx + 140 + (ww - 300) * sel, eio(seg(t, e0 + 0.3, e0 + 0.6))), ly + 12, 1, seg(t, e0 + 0.3, e0 + 0.5));
        }
        c.restore();
      },
      // dark: "now" types in, the mark pops, the name slides out of it
      reveal({ s, t, D, b }) {
        dark(t);
        c.save(); push(t, D, W / 2, 900, 0.02);
        const b0 = b[0] ?? D * 0.45;
        if (s.copy.kicker) { c.save(); c.globalAlpha *= 1 - seg(t, b0 - 0.25, b0); typed(s.copy.kicker, W / 2, 900, 'u', 500, 64, '#e8e8ee', t, 0.05, 0.05, 'c'); c.restore(); }
        lockup(t, b0, W / 2, 900, 1);
        c.restore();
      },
      // the offer: the old price is struck, the new one lands
      price({ s, t, D, b }) {
        dark(t + 5);
        c.save(); push(t, D, W / 2, 1000, 0.02);
        // the lockup from the previous scene moves up and stays as a signature
        const up = expo(seg(t, 0, 0.6));
        c.save(); c.translate(0, lerp(0, -560, up)); c.translate(W / 2, 900); c.scale(lerp(1, 0.8, up), lerp(1, 0.8, up)); c.translate(-W / 2, -900); lockup(99, 0, W / 2, 900, 1); c.restore();
        const s0 = b[0] ?? D * 0.4, s1 = b[1] ?? s0 + 0.2;
        const old = s.copy.old ?? '', now = s.copy.now ?? '';
        const ok = expo(seg(t, 0.3, 0.8));
        c.save(); c.globalAlpha *= ok * (1 - 0.5 * seg(t, s1, s1 + 0.3)); const ow = T(old, W / 2, 860, 'd', 700, 130, '#b8b8c2', 'c'); c.restore();
        const sk = expo(seg(t, s0, s0 + 0.3));
        if (sk > 0) { c.save(); c.strokeStyle = PAL.alert; c.lineWidth = 12; c.lineCap = 'round'; c.beginPath(); c.moveTo(W / 2 - ow / 2 - 20, 878); c.lineTo(W / 2 - ow / 2 - 20 + (ow + 40) * sk, 842); c.stroke(); c.restore(); }
        const nk = seg(t, s1, s1 + 0.6);
        if (nk > 0) {
          const npx = fit([now], 'd', 800, 260, 160);
          c.save(); c.translate(W / 2, 1110); const sc = lerp(0.86, 1, expo(nk)); c.scale(sc, sc); c.globalAlpha *= clamp(nk * 3); T(now, 0, 0, 'd', 800, npx, '#ffffff', 'c'); c.restore();
          const u = expo(seg(t, s1 + 0.3, s1 + 0.8)), uw = measure(now, 'd', 800, npx) * 0.7; c.fillStyle = PAL.accent; rr(W / 2 - uw / 2, 1250, uw * u, 12, 6); c.fill();
        }
        c.restore();
      },
      // call to action: type 1 in the comment field, send, it appears
      cta({ s, t, D, b }) {
        paper();
        c.save(); push(t, D, W / 2, 1000, 0.02);
        if (s.copy.lead) rise(s.copy.lead, X0, 360, 'u', 600, fit([s.copy.lead], 'u', 600, 46, 34), PAL.muted, seg(t, 0.05, 0.6));
        const main = listOf(s.copy.main), mpx = fit(main, 'd', 800, 96, 60);
        main.forEach((l, i) => rise(l, X0, 470 + i * mpx * 1.06, 'd', 800, mpx, PAL.ink, seg(t, 0.15 + i * 0.12, 0.75 + i * 0.12)));
        const typeAt = b[0] ?? D * 0.35, send = b[1] ?? typeAt + 0.8, val = s.copy.typed ?? '1';
        // posted comment appears above the composer
        const pk = expo(seg(t, send + 0.1, send + 0.6));
        if (pk > 0) {
          c.save(); c.globalAlpha *= pk; c.translate(0, (1 - pk) * 60);
          c.beginPath(); c.arc(X0 + 40, 900, 40, 0, Math.PI * 2); c.fillStyle = PAL.line; c.fill();
          c.fillStyle = PAL.muted; c.beginPath(); c.arc(X0 + 40, 888, 14, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(X0 + 40, 922, 22, 13, 0, Math.PI, 0); c.fill();
          card(X0 + 100, 850, 170, 100, 50, '#ffffff', 0.5); T(val, X0 + 185, 900, 'd', 800, 56, PAL.ink, 'c');
          // heart
          c.save(); c.translate(X0 + 330, 900); c.scale(back(seg(t, send + 0.4, send + 0.8)), back(seg(t, send + 0.4, send + 0.8))); c.fillStyle = PAL.alert; c.beginPath(); c.moveTo(0, 12); c.bezierCurveTo(-30, -8, -14, -30, 0, -14); c.bezierCurveTo(14, -30, 30, -8, 0, 12); c.fill(); c.restore();
          c.restore();
        }
        // composer
        const ck = expo(seg(t, 0.3, 0.9)), cy = lerp(1300, 1080, ck);
        c.save(); c.globalAlpha *= ck;
        card(X0, cy - 60, XW, 120, 60, '#ffffff', 0.8);
        const n = t >= typeAt && t < send + 0.12 ? val : '';
        if (n) T(n, X0 + 60, cy, 'd', 800, 52, PAL.ink); else if (Math.floor(t * 2.4) % 2 === 0) { c.fillStyle = PAL.accent; c.fillRect(X0 + 60, cy - 26, 5, 52); }
        if (n && t < send && Math.floor(t * 2.4) % 2 === 0) { c.fillStyle = PAL.accent; c.fillRect(X0 + 60 + measure(n, 'd', 800, 52) + 8, cy - 26, 5, 52); }
        const sp = Math.sin(Math.PI * seg(t, send - 0.05, send + 0.15)), sx = X0 + XW - 70;
        c.save(); c.translate(sx, cy); c.scale(1 - 0.12 * sp, 1 - 0.12 * sp); c.beginPath(); c.arc(0, 0, 42, 0, Math.PI * 2); c.fillStyle = n ? PAL.accent : PAL.line; c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-14, -16); c.lineTo(20, 0); c.lineTo(-14, 16); c.lineTo(-8, 0); c.closePath(); c.fill(); c.restore();
        ripple(sx, cy, seg(t, send, send + 0.5));
        c.restore();
        const mx = t < send ? lerp(W - 60, sx + 10, eio(seg(t, typeAt, send))) : lerp(sx + 10, W - 40, eio(seg(t, send + 0.4, send + 1.0)));
        const my = t < send ? lerp(1640, cy + 14, eio(seg(t, typeAt, send))) : lerp(cy + 14, 1680, eio(seg(t, send + 0.4, send + 1.0)));
        pointer(mx, my, 1, seg(t, typeAt, typeAt + 0.2) * (1 - seg(t, send + 0.8, send + 1.0)), sp);
        // closing signature
        const ek = seg(t, D - 1.6, D - 1.0);
        if (ek > 0) {
          const br = s.copy.brand ?? sb!.brand, bpx = 50, bw = measure(br, 'd', 800, bpx), total = 84 + 26 + bw, x0 = W / 2 - total / 2;
          c.save(); c.globalAlpha *= ek; c.translate(0, (1 - expo(ek)) * 30); mark(x0 + 42, 1410, 0.7, back(ek)); T(br, x0 + 84 + 26, 1412, 'd', 800, bpx, PAL.ink, 'l'); c.restore();
        }
        c.restore();
      },
    };
    /** the brand lockup (mark + name), as it is after the reveal; t0 = when the mark pops */
    const lockup = (t: number, t0: number, cx: number, cy: number, a: number) => {
      const name = sb!.brand.split(' ').slice(0, 2).join(' '), sub = sb!.brand.split(' ').slice(2).join(' ');
      const pop = back(seg(t, t0, t0 + 0.4)), slide = expo(seg(t, t0 + 0.35, t0 + 0.9));
      const nw = measure(name, 'd', 800, 80), total = 130 + 36 + nw, mx = lerp(cx, cx - total / 2 + 65, slide);
      c.save(); c.globalAlpha *= a;
      mark(mx, cy, 1.08, pop);
      if (slide > 0) {
        c.save(); c.beginPath(); c.rect(mx + 70, cy - 120, W, 240); c.clip();
        const off = (1 - slide) * -120;
        T(name, mx + 101 + off, cy - 22, 'd', 800, 80, '#ffffff');
        if (sub) T(sub, mx + 104 + off, cy + 50, 'u', 600, 36, PAL.accent, 'l', 12);
        c.restore();
      }
      c.restore();
    };

    // ================================================================ night theme
    // Black with one large soft glow that wanders between scenes; text arrives out
    // of a blur or letter by letter with collapsing tracking; the mark drops in and
    // slides its name out; shapes morph (outline -> circle, pills -> one pill);
    // headings change by deleting and retyping. Every scene leaves through a blur.
    const NF = () => (sb?.fonts?.ui || 'Manrope');
    const nfont = (w: number, px: number) => { c.font = `${w} ${px}px "${NF()}", Inter, sans-serif`; };
    const nmeasure = (s: string, w: number, px: number, sp = 0) => { nfont(w, px); (c as any).letterSpacing = `${sp}px`; const m = c.measureText(s).width; (c as any).letterSpacing = '0px'; return m; };
    const NT = (s: string, x: number, y: number, w: number, px: number, col: string, align: 'l' | 'c' | 'r' = 'l', sp = 0) => {
      const wd = nmeasure(s, w, px, sp), x0 = align === 'l' ? x : align === 'c' ? x - wd / 2 : x - wd;
      nfont(w, px); (c as any).letterSpacing = `${sp}px`; c.fillStyle = col; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(s, x0, y); (c as any).letterSpacing = '0px';
      audit(s, x0, y, wd, px);
      return wd;
    };
    const nfit = (lines: string[], w: number, max: number, min: number, maxW = XW) => { let px = max; while (px > min && lines.some((l) => nmeasure(l, w, px) > maxW)) px -= 2; return px; };
    const NACC = () => PAL.accent, NMUTED = '#9a9aa3', NROW = '#161618';
    /** a block of text arriving out of a blur (k: 0..1), leaving the same way */
    const blurIn = (k: number, paint: () => void, rise = 18) => {
      if (k <= 0.001) return;
      c.save(); c.globalAlpha *= clamp(k); const b2 = (1 - k) * 16; if (b2 > 0.4) c.filter = `blur(${b2.toFixed(1)}px)`; c.translate(0, (1 - k) * rise); paint(); c.restore();
    };
    /** letters appear one by one while the tracking collapses */
    const nTracked = (s: string, cx: number, y: number, w: number, px: number, col: string, t: number, t0: number, rate: number) => {
      const done = seg(t, t0, t0 + s.length * rate + 0.3), sp = lerp(px * 0.22, px * 0.02, eio(done));
      const total = nmeasure(s, w, px, sp); let x = cx - total / 2;
      nfont(w, px); c.textAlign = 'left'; c.textBaseline = 'middle';
      for (let i = 0; i < s.length; i++) {
        const ch = s[i], cw = nmeasure(ch, w, px) + sp, a = seg(t, t0 + i * rate, t0 + i * rate + 0.22);
        if (a > 0 && ch !== ' ') { c.save(); c.globalAlpha *= a; nfont(w, px); c.fillStyle = col; c.fillText(ch, x, y); c.restore(); }
        x += cw;
      }
      if (done >= 1 && c.globalAlpha > 0.35) audit(s, cx - total / 2, y, total, px);
    };
    /** type text in, then (optionally) delete back to the common prefix and type the next */
    const retype = (words: string[], beats: number[], t: number, rate = 0.045) => {
      let cur = '';
      for (let i = 0; i < words.length; i++) {
        const st = beats[i] ?? 0; if (t < st) break;
        const prev = i ? words[i - 1] : '', w = words[i];
        let common = 0; while (common < prev.length && common < w.length && prev[common] === w[common]) common++;
        const del = prev.length - common, dt = t - st;
        if (dt < del * rate * 0.6) cur = prev.slice(0, prev.length - Math.floor(dt / (rate * 0.6)));
        else cur = w.slice(0, common + Math.floor((dt - del * rate * 0.6) / rate));
      }
      return cur;
    };
    const npill = (s: string, x: number, y: number, k: number, on: boolean, px = 42) => {
      if (k <= 0.001) return 0;
      const w = nmeasure(s, 600, px) + px * 1.4, h = px * 1.8;
      c.save(); c.globalAlpha *= clamp(k); c.translate(x, y); const sc = lerp(0.85, 1, eio(k)); c.scale(sc, sc);
      rr(-w / 2, -h / 2, w, h, h / 2); c.fillStyle = on ? NACC() : 'rgba(255,255,255,0.14)'; c.fill();
      NT(s, 0, 2, 600, px, on ? '#05130a' : '#f2f2f2', 'c');
      c.restore();
      return w;
    };
    /** the mark in night style: an accent disc with a page glyph */
    const nmark = (x: number, y: number, r: number, k = 1, blurPx = 0) => {
      if (k <= 0.001) return;
      c.save(); if (blurPx > 0.4) c.filter = `blur(${blurPx.toFixed(1)}px)`; c.globalAlpha *= clamp(k); c.translate(x, y);
      const g = c.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 2.6); g.addColorStop(0, hexA(NACC(), 0.35)); g.addColorStop(1, hexA(NACC(), 0)); c.fillStyle = g; c.fillRect(-r * 3, -r * 3, r * 6, r * 6);
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fillStyle = NACC(); c.fill();
      c.fillStyle = '#05130a'; c.beginPath(); c.moveTo(-r * 0.36, -r * 0.5); c.lineTo(r * 0.18, -r * 0.5); c.lineTo(r * 0.4, -r * 0.28); c.lineTo(r * 0.4, r * 0.5); c.lineTo(-r * 0.36, r * 0.5); c.closePath(); c.fill();
      c.strokeStyle = NACC(); c.lineCap = 'round'; c.lineWidth = r * 0.1;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-r * 0.2, (-0.16 + i * 0.22) * r); c.quadraticCurveTo(0, (-0.22 + i * 0.22) * r, (0.24 - i * 0.07) * r, (-0.14 + i * 0.22) * r); c.stroke(); }
      c.restore();
    };
    /** mark + wordmark lockup; name types out of the mark (t0: mark lands) */
    const nLockup = (t: number, t0: number, cx: number, cy: number, r = 64, px = 64, rate = 0.035) => {
      const brand = sb!.brand, parts = brand.split(' '), a = parts.slice(0, 2).join(' '), bpart = parts.slice(2).join(' ');
      const slide = eio(seg(t, t0 + 0.1, t0 + 0.6));
      const wa = nmeasure(a + ' ', 700, px), wb = nmeasure(bpart, 600, px), total = r * 2 + 28 + wa + wb;
      const mx = lerp(cx, cx - total / 2 + r, slide);
      nmark(mx, cy, r, 1);
      const full = a + ' ' + bpart, n = Math.floor(clamp((t - t0 - 0.2) / rate, 0, full.length));
      const shown = full.slice(0, n), sa = shown.slice(0, a.length), sbp = shown.length > a.length + 1 ? shown.slice(a.length + 1) : '';
      const tx = mx + r + 28;
      if (sa) NT(sa, tx, cy + 2, 700, px, '#ffffff');
      if (sbp) NT(sbp, tx + wa, cy + 2, 600, px, NACC());
    };
    /** one big soft glow for the whole film: each scene names a spot, the glow travels there */
    const GLOW_SPOTS: Record<string, [number, number, number]> = {
      nLine: [0.5, 0.47, 1], nTrack: [0.35, 0.42, 0.95], nLogo: [0.55, 0.5, 0.85], nCircles: [0.5, 0.6, 1.05], nHeading: [0.3, 0.35, 1],
      nRows: [0.62, 0.62, 1.1], nPills: [0.5, 0.5, 0.9], nCount: [0.5, 0.42, 1.05], nPrice: [0.7, 0.45, 1], nComment: [0.45, 0.62, 1],
    };
    const nightBg = (T0: number) => {
      c.fillStyle = '#000000'; c.fillRect(0, 0, W, H);
      const sc = sb!.scenes;
      let i = sc.findIndex((s) => T0 >= s.start && T0 < s.end); if (i < 0) i = sc.length - 1;
      const cur = GLOW_SPOTS[sc[i].kind] ?? [0.5, 0.5, 1], pre = i > 0 ? GLOW_SPOTS[sc[i - 1].kind] ?? cur : cur;
      const k = eio(seg(T0 - sc[i].start, 0, 1.4));
      const gx = lerp(pre[0], cur[0], k) * W + Math.sin(T0 * 0.37) * 60, gy = lerp(pre[1], cur[1], k) * H + Math.cos(T0 * 0.29) * 80, gs = lerp(pre[2], cur[2], k) * (1 + 0.06 * Math.sin(T0 * 0.8));
      c.save(); c.translate(gx, gy); c.scale(gs * 1.0, gs * 1.35);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 760); g.addColorStop(0, hexA(PAL.accent, 0.34)); g.addColorStop(0.35, hexA(PAL.accent, 0.17)); g.addColorStop(0.7, hexA(PAL.accent, 0.05)); g.addColorStop(1, hexA(PAL.accent, 0));
      c.fillStyle = g; c.fillRect(-800, -800, 1600, 1600);
      // a darker core now and then turns the glow into a soft ring
      const ring = 0.5 + 0.5 * Math.sin(T0 * 0.45 + 1);
      const g2 = c.createRadialGradient(0, 0, 0, 0, 0, 420); g2.addColorStop(0, `rgba(0,0,0,${0.55 * ring})`); g2.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g2; c.fillRect(-450, -450, 900, 900);
      c.restore();
      const v = c.createRadialGradient(W / 2, H / 2, 600, W / 2, H / 2, 1300); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.7)'); c.fillStyle = v; c.fillRect(0, 0, W, H);
    };
    const NIGHT: Record<string, (x: Ctx) => void> = {
      // a pill that dissolves into the glow, then a line out of the blur (optionally replaced by a second line)
      nLine({ s, t, D, b }) {
        const p = s.copy.pill, b0 = b[0] ?? 0.1;
        if (p) npill(p, W / 2, 900, eio(seg(t, 0, 0.3)) * (1 - eio(seg(t, b0 - 0.4, b0 - 0.05))), true, 46);
        const l1 = listOf(s.copy.text), l2 = listOf(s.copy.next), b1 = b[1] ?? D;
        const px = nfit([...l1, ...l2], 600, 80, 50), lh = px * 1.2;
        const k1 = eio(seg(t, b0, b0 + 0.6)) * (l2.length ? 1 - eio(seg(t, b1 - 0.35, b1)) : 1 - eio(seg(t, D - 0.35, D)));
        blurIn(k1, () => l1.forEach((l, i) => NT(l, W / 2, 900 + (i - (l1.length - 1) / 2) * lh, 600, px, '#ffffff', 'c')));
        if (l2.length) { const k2 = eio(seg(t, b1, b1 + 0.6)) * (1 - eio(seg(t, D - 0.35, D))); blurIn(k2, () => l2.forEach((l, i) => NT(l, W / 2, 900 + (i - (l2.length - 1) / 2) * lh, 600, px, i === l2.length - 1 && s.copy.accentLast ? NACC() : '#ffffff', 'c'))); }
      },
      // letter-spaced line, letters arrive one by one
      nTrack({ s, t, D, b }) {
        const ls = listOf(s.copy.lines), px = nfit(ls, 500, 76, 48, XW - 60), lh = px * 1.3;
        const out = 1 - eio(seg(t, D - 0.4, D));
        c.save(); c.globalAlpha *= out; c.translate(0, -(1 - out) * 30);
        ls.forEach((l, i) => nTracked(l, W / 2, 900 + (i - (ls.length - 1) / 2) * lh, 500, px, i === ls.length - 1 && s.copy.accentLast ? NACC() : '#ececf1', t, (b[i] ?? 0.08 + i * 0.5), Math.min(0.05, 0.9 / Math.max(1, l.length))));
        c.restore();
      },
      // optional line, then the mark drops in out of a blur and slides its name out
      nLogo({ s, t, D, b }) {
        const b0 = b[0] ?? 0.2, pre = s.copy.pre;
        if (pre) blurIn(eio(seg(t, 0.05, 0.5)) * (1 - eio(seg(t, b0 - 0.3, b0))), () => NT(pre, W / 2, 900, 500, nfit([pre], 500, 76, 50), '#e8e8ee', 'c'));
        const drop = eio(seg(t, b0, b0 + 0.55)), out = 1 - eio(seg(t, D - 0.35, D));
        if (t < b0) return;
        c.save(); c.globalAlpha *= out;
        if (drop < 1) nmark(W / 2, lerp(760, 900, drop), lerp(36, 64, drop), drop, (1 - drop) * 12);
        else {
          // the name must be complete well before the scene leaves
          const room = D - 0.35 - 0.3 - (b0 + 0.75), rate = clamp(room / sb!.brand.length, 0.018, 0.035);
          nLockup(t, b0 + 0.55, W / 2, 900, 64, nfit([sb!.brand], 700, 64, 40, XW - 180), rate);
        }
        c.restore();
      },
      // an outline morphs into a circle; the row of circles with labels
      nCircles({ s, t, D, b }) {
        const its = listOf(s.copy.items).map((x) => { const [a, bb] = x.split('|').map((y) => y.trim()); return { t: a, s: bb ?? '' }; }), n = its.length;
        const R = n > 3 ? 92 : n > 2 ? 112 : 140, gap = n > 3 ? 230 : n > 2 ? 300 : 360, mid = Math.floor((n - 1) / 2), y = 900;
        const morph = eio(seg(t, 0.05, 0.45)), out = 1 - eio(seg(t, D - 0.4, D));
        c.save(); c.globalAlpha *= out; c.translate(0, (1 - out) * 60);
        its.forEach((it, i) => {
          const st = i === mid ? 0.05 : (b[i] ?? 0.55 + Math.abs(i - mid) * 0.12), k = eio(seg(t, st, st + 0.45));
          if (k <= 0.001) return;
          const x = W / 2 + (i - (n - 1) / 2) * gap;
          c.save(); c.globalAlpha *= i === mid ? 1 : k;
          const r = i === mid ? lerp(18, R, morph) : R * lerp(0.85, 1, k), corner = i === mid ? lerp(18, R, morph) : R;
          rr(x - r, y - r, 2 * r, 2 * r, corner);
          c.save(); c.clip();
          const fillK = i === mid ? seg(t, 0.3, 0.6) : 1;
          c.globalAlpha *= fillK;
          const img = pic((s.images ?? [])[i]);
          if (/^word$/i.test(it.t)) { c.fillStyle = '#185abd'; c.fillRect(x - r, y - r, 2 * r, 2 * r); NT('W', x, y + 4, 800, r * 1.0, '#ffffff', 'c'); }
          else if (/^excel$/i.test(it.t)) { c.fillStyle = '#107c41'; c.fillRect(x - r, y - r, 2 * r, 2 * r); NT('X', x, y + 4, 800, r * 1.0, '#ffffff', 'c'); }
          else if (img) { const sc2 = Math.max(2 * r / img.naturalWidth, 2 * r / img.naturalHeight), sw = 2 * r / sc2, sh = 2 * r / sc2; c.drawImage(img, (img.naturalWidth - sw) / 2, 0, sw, sh, x - r, y - r, 2 * r, 2 * r); }
          else { c.fillStyle = '#1d1d21'; c.fillRect(x - r, y - r, 2 * r, 2 * r); folderIcon(x, y, r / 70, NACC()); }
          c.restore();
          rr(x - r - 6, y - r - 6, 2 * r + 12, 2 * r + 12, corner + 6); c.strokeStyle = i === mid ? NACC() : 'rgba(255,255,255,0.18)'; c.lineWidth = 4; c.stroke();
          c.restore();
          const la = seg(t, st + 0.3, st + 0.6);
          if (la > 0) { c.save(); c.globalAlpha *= la; const lpx = nfit([it.t], 600, 36, 26, gap - 16); NT(it.t, x, y + R + 52, 600, lpx, '#ffffff', 'c'); if (it.s) NT(it.s, x, y + R + 96, 500, 28, NMUTED, 'c'); c.restore(); }
        });
        c.restore();
      },
      // a heading that changes by deleting and retyping; optional kicker, paragraph and pill
      nHeading({ s, t, D, b }) {
        const words = listOf(s.copy.words), out = 1 - eio(seg(t, D - 0.35, D));
        c.save(); c.globalAlpha *= out; c.translate(0, -(1 - out) * 50);
        if (s.copy.kicker) blurIn(eio(seg(t, 0.05, 0.5)), () => NT(s.copy.kicker!, X0, 640, 500, 40, NMUTED, 'l'));
        // '/' in a heading is a line break
        const px = nfit(words.flatMap((w) => w.split('/')), 700, 104, 64), cur = retype(words, b.length ? b : [0.1], t);
        const curLines = cur.split('/'), lastLine = curLines[curLines.length - 1], ly = 760 + (curLines.length - 1) * px * 1.1;
        curLines.forEach((l, i) => { if (l) NT(l, X0, 760 + i * px * 1.1, 700, px, '#ffffff', 'l'); });
        const typing = words.some((w, i) => t >= (b[i] ?? 0) && t < (b[i] ?? 0) + (w.length + (i ? words[i - 1].length : 0)) * 0.045 + 0.1);
        if (typing || Math.floor(t * 2.2) % 2 === 0) { c.fillStyle = NACC(); c.fillRect(X0 + nmeasure(lastLine, 700, px) + 10, ly - px * 0.42, 5, px * 0.84); }
        if (s.copy.para) {
          const pa = s.copy.para, lines = wrapN(pa, XW, 500, 38), pt = (b[b.length - 1] ?? 0) + 0.5, py = 760 + (words[words.length - 1].split('/').length) * px * 1.1 - px * 0.2;
          const n = Math.floor(clamp((t - pt) / 0.018, 0, pa.length)); let used = 0;
          lines.forEach((l, i) => { const show = l.slice(0, Math.max(0, n - used)); used += l.length + 1; if (show) NT(show, X0 + 6, py + i * 52, 500, 38, '#d9d9e0', 'l'); });
        }
        c.restore();
      },
      // heading + caption, then rows rise from below and scroll
      nRows({ s, t, D }) {
        const out = 1 - eio(seg(t, D - 0.4, D));
        const lift = eio(seg(t, 0.9, 1.6));
        c.save(); c.globalAlpha *= out;
        c.save(); c.translate(0, -lift * 180);
        if (s.copy.title) { const tt = s.copy.title, n = Math.floor(clamp((t - 0.05) / 0.04, 0, tt.length)); NT(tt.slice(0, n), X0, 560, 700, nfit([tt], 700, 76, 50), '#ffffff', 'l'); }
        if (s.copy.caption) blurIn(eio(seg(t, 0.5, 1.0)), () => NT(s.copy.caption!, X0 + 4, 650, 500, 44, '#d9d9e0', 'l'));
        c.restore();
        const its = listOf(s.copy.items), rowH = 150, gap = 18, start = 1.0, top = 640;
        const scroll = eio(seg(t, start, D)) * Math.max(0, its.length * (rowH + gap) - 760);
        c.save(); c.beginPath(); c.rect(0, top - 20, W, 920); c.clip();
        its.forEach((it, i) => {
          const rk = eio(seg(t, start + i * 0.08, start + 0.6 + i * 0.08)); if (rk <= 0) return;
          const y = top + i * (rowH + gap) - scroll + (1 - rk) * 260; if (y > top + 900 || y + rowH < top - 20) return;
          const [name, kind] = it.split('|').map((x) => x.trim());
          c.save(); c.globalAlpha *= rk;
          rr(X0 - 20, y, XW + 40, rowH, 22); c.fillStyle = NROW; c.fill();
          const img = pic((s.images ?? [])[i]);
          c.save(); rr(X0, y + 20, 110, 110, 10); c.clip(); if (img) { const sc2 = Math.max(110 / img.naturalWidth, 110 / img.naturalHeight); c.drawImage(img, (img.naturalWidth - 110 / sc2) / 2, 0, 110 / sc2, 110 / sc2, X0, y + 20, 110, 110); } else { c.fillStyle = '#2a2a2e'; c.fillRect(X0, y + 20, 110, 110); } c.restore();
          NT(name, X0 + 140, y + (kind ? 56 : rowH / 2), 600, nfit([name], 600, 38, 28, XW - 230), '#ffffff', 'l');
          if (kind) NT(kind, X0 + 140, y + 100, 500, 30, NMUTED, 'l');
          for (let d = 0; d < 3; d++) { c.beginPath(); c.arc(X0 + XW - 30 + d * 14, y + rowH / 2, 4, 0, Math.PI * 2); c.fillStyle = NMUTED; c.fill(); }
          c.restore();
        });
        c.restore();
        c.restore();
      },
      // pills appear one by one; the newest is active; at the end they fold into the active one
      nPills({ s, t, D, b }) {
        const its = listOf(s.copy.items), n = its.length, gapX = 22, px = 44;
        const ws = its.map((x) => nmeasure(x, 600, px) + px * 1.4), total = ws.reduce((a, x) => a + x, 0) + gapX * (n - 1);
        const fold = eio(seg(t, b[n] ?? D - 0.9, (b[n] ?? D - 0.9) + 0.5)), out = 1 - eio(seg(t, D - 0.3, D));
        let x = W / 2 - total / 2, active = -1;
        its.forEach((_, i) => { if (t >= (b[i] ?? 0.1 + i * 0.3) + 0.12) active = i; });
        const ax = (() => { let xx = W / 2 - total / 2; for (let i = 0; i < active; i++) xx += ws[i] + gapX; return xx + (active >= 0 ? ws[active] / 2 : 0); })();
        c.save(); c.globalAlpha *= out;
        its.forEach((p, i) => {
          const st = b[i] ?? 0.1 + i * 0.3, k = eio(seg(t, st, st + 0.35)), cx = x + ws[i] / 2;
          const fx = i === active ? lerp(cx, W / 2, fold) : lerp(cx, ax, fold), fk = i === active ? 1 : 1 - fold;
          npill(p, fx, 900, k * fk, i === active, px);
          x += ws[i] + gapX;
        });
        c.restore();
      },
      // a number counts up; a line below; then a pill lands under it
      nCount({ s, t, D, b }) {
        const num = s.copy.number ?? '100+', digits = parseInt(num, 10) || 100, plus = num.replace(/[0-9]/g, '');
        const done = b[0] ?? 1.2, v = Math.round(digits * eio(seg(t, 0.1, done))), out = 1 - eio(seg(t, D - 0.4, D));
        c.save(); c.globalAlpha *= out; c.filter = out < 1 ? `blur(${((1 - out) * 14).toFixed(1)}px)` : 'none';
        const npx = 230, wn = nmeasure(String(digits), 700, npx), wp = nmeasure(plus, 700, npx), x0 = W / 2 - (wn + wp + 10) / 2;
        blurIn(eio(seg(t, 0.05, 0.4)), () => NT(String(v), x0 + wn, 820, 700, npx, '#ffffff', 'r'));
        if (plus) { const pk = back(seg(t, done - 0.05, done + 0.35)); if (pk > 0) { c.save(); c.translate(x0 + wn + 10 + wp / 2, 820); c.scale(pk, pk); NT(plus, 0, 0, 700, npx, NACC(), 'c'); c.restore(); } }
        if (s.copy.lead) blurIn(eio(seg(t, 0.5, 1.1)), () => NT(s.copy.lead!, W / 2, 990, 500, nfit([s.copy.lead!], 500, 52, 36), '#e8e8ee', 'c'));
        if (s.copy.pill) npill(s.copy.pill, W / 2, 1120, eio(seg(t, b[1] ?? D * 0.5, (b[1] ?? D * 0.5) + 0.4)), true, 44);
        c.restore();
      },
      // the old price types in, gets struck and steps back; the new one types in
      nPrice({ s, t, D, b }) {
        const old = s.copy.old ?? '', now = s.copy.now ?? '', s0 = b[0] ?? D * 0.35, s1 = b[1] ?? s0 + 0.3, out = 1 - eio(seg(t, D - 0.35, D));
        c.save(); c.globalAlpha *= out;
        // the mark stays as a small signature (continuity from the lockup)
        blurIn(eio(seg(t, 0, 0.5)), () => nmark(W / 2, 520, 34, 1));
        const step = eio(seg(t, s1 - 0.15, s1 + 0.4));
        const oy = lerp(880, 760, step), opx = lerp(150, 84, step);
        const n = Math.floor(clamp((t - 0.1) / 0.06, 0, old.length));
        c.save(); c.globalAlpha *= lerp(1, 0.55, step);
        const ow = NT(old.slice(0, n), W / 2, oy, 600, opx, '#ffffff', 'c'), owFull = nmeasure(old, 600, opx);
        const sk = eio(seg(t, s0, s0 + 0.3)); if (sk > 0) { c.strokeStyle = NACC(); c.lineWidth = lerp(10, 6, step); c.lineCap = 'round'; c.beginPath(); c.moveTo(W / 2 - owFull / 2 - 14, oy + 4); c.lineTo(W / 2 - owFull / 2 - 14 + (owFull + 28) * sk, oy - 4); c.stroke(); }
        void ow; c.restore();
        const m = Math.floor(clamp((t - s1) / 0.07, 0, now.length));
        if (m > 0) { const npx = nfit([now], 700, 190, 120); NT(now.slice(0, m), W / 2, 960, 700, npx, '#ffffff', 'c'); const u = eio(seg(t, s1 + now.length * 0.07, s1 + now.length * 0.07 + 0.5)), uw = nmeasure(now, 700, npx) * 0.6; c.fillStyle = NACC(); rr(W / 2 - uw / 2, 1075, uw * u, 10, 5); c.fill(); }
        c.restore();
      },
      // call to action: a line, a comment field types the answer and sends; then the lockup closes the film
      nComment({ s, t, D, b }) {
        const typeAt = b[0] ?? 1, send = b[1] ?? typeAt + 0.8, end = b[2] ?? D - 1.8, val = s.copy.typed ?? '1';
        const gone = eio(seg(t, end - 0.4, end));
        c.save(); c.globalAlpha *= 1 - gone; if (gone > 0) c.filter = `blur(${(gone * 14).toFixed(1)}px)`;
        if (s.copy.lead) blurIn(eio(seg(t, 0.05, 0.5)), () => NT(s.copy.lead!, W / 2, 640, 500, nfit([s.copy.lead!], 500, 44, 32), NMUTED, 'c'));
        const main = listOf(s.copy.main), mpx = nfit(main, 600, 76, 48);
        main.forEach((l, i) => nTracked(l, W / 2, 740 + i * mpx * 1.25, 600, mpx, i === main.length - 1 ? NACC() : '#ffffff', t, 0.25 + i * 0.45, 0.035));
        const fk = eio(seg(t, typeAt - 0.6, typeAt - 0.1)), fw = 760, fh = 120, fx = W / 2 - fw / 2, fy = 1120;
        if (fk > 0) {
          c.save(); c.globalAlpha *= fk; c.translate(0, (1 - fk) * 40);
          rr(fx, fy, fw, fh, fh / 2); c.fillStyle = '#1b1b1f'; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.1)'; c.lineWidth = 2; c.stroke();
          const typed = t >= typeAt && t < send + 0.1 ? val : '';
          if (typed) NT(typed, fx + 60, fy + fh / 2 + 2, 700, 52, '#ffffff', 'l');
          if (t < send && Math.floor(t * 2.4) % 2 === 0) { c.fillStyle = NACC(); c.fillRect(fx + 60 + (typed ? nmeasure(typed, 700, 52) + 8 : 0), fy + 34, 5, 52); }
          const sp = Math.sin(Math.PI * seg(t, send - 0.05, send + 0.15)), sx = fx + fw - 64;
          c.save(); c.translate(sx, fy + fh / 2); c.scale(1 - 0.14 * sp, 1 - 0.14 * sp); c.beginPath(); c.arc(0, 0, 40, 0, Math.PI * 2); c.fillStyle = typed || t > send ? NACC() : '#2a2a30'; c.fill();
          c.fillStyle = '#05130a'; c.beginPath(); c.moveTo(-13, -15); c.lineTo(18, 0); c.lineTo(-13, 15); c.lineTo(-7, 0); c.closePath(); c.fill(); c.restore();
          c.restore();
          // the posted comment rises out of the field
          const pk = eio(seg(t, send + 0.1, send + 0.55));
          if (pk > 0) { c.save(); c.globalAlpha *= pk; const by = lerp(fy + fh / 2, fy - 120, pk); c.beginPath(); c.arc(fx + 44, by, 34, 0, Math.PI * 2); c.fillStyle = '#2a2a30'; c.fill(); rr(fx + 96, by - 40, 140, 80, 40); c.fillStyle = NACC(); c.fill(); NT(val, fx + 166, by + 2, 700, 48, '#05130a', 'c'); c.restore(); }
        }
        c.restore();
        // closing lockup
        if (t >= end) { const k = eio(seg(t, end, end + 0.5)); if (k < 1) nmark(W / 2, lerp(780, 900, k), lerp(36, 64, k), k, (1 - k) * 12); else nLockup(t, end + 0.5, W / 2, 900, 64, nfit([sb!.brand], 700, 64, 40, XW - 180)); }
      },
    };
    const wrapN = (s: string, maxW: number, w: number, px: number) => { const out: string[] = []; let cur = ''; for (const word of s.split(/\s+/)) { const tr2 = cur ? cur + ' ' + word : word; if (nmeasure(tr2, w, px) > maxW && cur) { out.push(cur); cur = word; } else cur = tr2; } if (cur) out.push(cur); return out; };

    // ---------------------------------------------------------------- frame
    const drawScene = (s: FilmScene, T0: number) => {
      SCENE = s.id; camScale = 1;
      const t = T0 - s.start, D = s.end - s.start, b = (s.beats ?? []).map((x) => x - s.start);
      (SC[s.kind] ?? NIGHT[s.kind] ?? SC.question)({ s, t, D, b });
    };
    const into = (buf: HTMLCanvasElement, f: FrameState, s: FilmScene, T0: number) => {
      if (buf.width !== f.W || buf.height !== f.H) { buf.width = f.W; buf.height = f.H; }
      const x = buf.getContext('2d')!; const keep = c; c = x;
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, f.W, f.H); x.globalAlpha = 1;
      frame(f, () => drawScene(s, T0));
      c = keep;
    };
    const frame = (f: FrameState, paint: () => void) => {
      const k = Math.max(f.W / W, f.H / H), ox = (f.W - W * k) / 2, oy = (f.H - H * k) / 2;
      bufScale.x = bufScale.y = k; bufScale.ox = ox / k; bufScale.oy = oy / k;
      c.save(); c.translate(ox, oy); c.scale(k, k); c.beginPath(); c.rect(0, 0, W, H); c.clip(); paint(); c.restore();
    };

    const inst: Scene2DInstance = {
      async prepare(prm) {
        sb = parseStoryboard(prm.storyboard); sbSrc = String(prm.storyboard ?? '');
        const fams = [sb?.fonts.display ?? 'Montserrat', sb?.fonts.ui ?? 'Inter', 'Manrope'];
        try { await Promise.all(fams.flatMap((fm) => [500, 600, 700, 800].map((w) => document.fonts.load(`${w} 40px "${fm}"`, 'Аа Өө Үү ₮ «1» 0123')))); } catch { /* fallback */ }
        await Promise.all(Array.from({ length: IMGS }, async (_, i) => { srcs[i] = String(prm[`img${i + 1}`] ?? ''); imgs[i] = await loadImg(srcs[i]); }));
      },
      draw(ctx, f: FrameState) {
        c = ctx;
        const src = String(f.params.storyboard ?? '');
        if (src !== sbSrc) { sbSrc = src; sb = parseStoryboard(src); }
        for (let i = 0; i < IMGS; i++) { const s = String(f.params[`img${i + 1}`] ?? ''); if (s !== srcs[i]) { srcs[i] = s; imgs[i] = null; loadImg(s).then((im) => { if (srcs[i] === s) { imgs[i] = im; kit.redraw(); } }); } }
        if (FILM_AUDIT.on) FILM_AUDIT.items = [];
        if (!sb || !sb.scenes.length) { c.fillStyle = '#111'; c.fillRect(0, 0, f.W, f.H); return; }
        PAL = { ...DEFAULT_PALETTE, ...sb.palette }; HF = sb.fonts?.display || 'Montserrat'; UF = sb.fonts?.ui || 'Inter';
        const T0 = f.t, scenes = sb.scenes;
        let i = scenes.findIndex((s) => T0 >= s.start && T0 < s.end);
        if (i < 0) i = T0 < scenes[0].start ? 0 : scenes.length - 1;
        if (sb.theme === 'night') { frame(f, () => { nightBg(T0); drawScene(scenes[i], T0); }); return; }
        const s = scenes[i], prev = scenes[i - 1], tr = s.enter ?? 'cut', into0 = T0 - s.start;
        if (!prev || tr === 'cut' || into0 >= TRANSITION_LEN) { frame(f, () => drawScene(s, T0)); return; }
        // transition: both scenes rendered, composited by the transition
        const e = expo(into0 / TRANSITION_LEN);
        const auditOn = FILM_AUDIT.on; FILM_AUDIT.on = false;
        into(bufA, f, prev, T0);
        FILM_AUDIT.on = auditOn;
        into(bufB, f, s, T0);
        const Wf = f.W, Hf = f.H;
        c.save();
        switch (tr) {
          case 'pushUp':
            c.globalAlpha = 1 - e; c.drawImage(bufA, 0, -Hf * 0.18 * e);
            c.globalAlpha = e; c.drawImage(bufB, 0, Hf * 0.18 * (1 - e)); break;
          case 'zoomIn':
            c.save(); c.translate(Wf / 2, Hf * 0.5); c.scale(1 + 1.4 * e, 1 + 1.4 * e); c.translate(-Wf / 2, -Hf * 0.5); c.globalAlpha = 1 - e; c.drawImage(bufA, 0, 0); c.restore();
            c.save(); c.translate(Wf / 2, Hf * 0.5); const z = 0.82 + 0.18 * e; c.scale(z, z); c.translate(-Wf / 2, -Hf * 0.5); c.globalAlpha = e; c.drawImage(bufB, 0, 0); c.restore(); break;
          case 'swipe':
            c.drawImage(bufA, -Wf * e, 0); c.drawImage(bufB, Wf * (1 - e), 0); break;
          case 'iris': {
            c.drawImage(bufA, 0, 0);
            c.save(); c.beginPath(); c.arc(Wf / 2, Hf * 0.47, Math.hypot(Wf, Hf) * e, 0, Math.PI * 2); c.clip(); c.drawImage(bufB, 0, 0); c.restore(); break;
          }
          case 'flash':
            c.drawImage(bufB, 0, 0); c.fillStyle = `rgba(255,255,255,${1 - e})`; c.fillRect(0, 0, Wf, Hf); break;
          default: c.drawImage(bufB, 0, 0);
        }
        c.restore();
      },
      dispose() { /* buffers are collected with the instance */ },
    };
    return inst;
  },
};

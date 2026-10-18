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
        const first = b[0] ?? 0.08;
        if (t < first && Math.floor(t * 2.4) % 2 === 0) { c.fillStyle = PAL.accent; c.fillRect(X0, y0 - px * 0.42, px * 0.08, px * 0.84); }
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
        if (ek > 0) { c.save(); c.globalAlpha *= ek; mark(W / 2 - 230, 1420, 0.5); T(s.copy.brand ?? sb!.brand, W / 2 - 180, 1420, 'd', 800, 44, PAL.ink, 'l'); c.restore(); }
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

    // ---------------------------------------------------------------- frame
    const drawScene = (s: FilmScene, T0: number) => {
      SCENE = s.id; camScale = 1;
      const t = T0 - s.start, D = s.end - s.start, b = (s.beats ?? []).map((x) => x - s.start);
      (SC[s.kind] ?? SC.question)({ s, t, D, b });
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
        const fams = [sb?.fonts.display ?? 'Montserrat', sb?.fonts.ui ?? 'Inter'];
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

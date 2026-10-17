// Canvas2D rendering modules: background, shapes, images, particles.
import { clamp } from './easing';
import { hexToRgb, mixHex, rgba } from './color';
import { hash } from './util';
import type { BackgroundLayer, IconId, ImageLayer, ParticleLayer, ShapeLayer } from './types';

export interface Env2D {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  k: number;
  t: number;
  /** particle density multiplier for adaptive preview quality */
  density: number;
  /** draw editor-only hints (empty image slots); false for export */
  placeholders?: boolean;
  /** pointer in composition pixels, or null */
  pointer: { x: number; y: number; down: boolean } | null;
  requestRedraw: () => void;
}

export function drawBackground(env: Env2D, l: BackgroundLayer) {
  const { ctx, W, H } = env;
  if (l.mode === 'solid') {
    ctx.fillStyle = l.colorA;
  } else if (l.mode === 'linear') {
    const a = (l.angle * Math.PI) / 180;
    const r = Math.hypot(W, H) / 2;
    const cx = W / 2, cy = H / 2;
    const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.addColorStop(0, l.colorA);
    g.addColorStop(1, l.colorB);
    ctx.fillStyle = g;
  } else {
    const g = ctx.createRadialGradient(l.x * W, l.y * H, 0, l.x * W, l.y * H, (Math.hypot(W, H) / 2) * l.scale);
    g.addColorStop(0, l.colorA);
    if (l.inner) g.addColorStop(clamp(l.inner, 0, 0.99), l.colorA);
    g.addColorStop(1, l.colorB);
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, W, H);
}

function shapePath(ctx: CanvasRenderingContext2D, l: ShapeLayer, w: number, h: number, r: number) {
  ctx.beginPath();
  switch (l.shape) {
    case 'rect': {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.moveTo(-w / 2 + rr, -h / 2);
      ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, rr);
      ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, rr);
      ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, rr);
      ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, rr);
      ctx.closePath();
      return 2 * (w + h);
    }
    case 'circle':
    case 'ring':
      ctx.ellipse(0, 0, w / 2, h / 2, 0, -Math.PI / 2, Math.PI * 1.5);
      return Math.PI * (w + h) / 2;
    case 'line':
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(w / 2, 0);
      return w;
    case 'triangle':
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(w / 2, h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.closePath();
      return w + 2 * Math.hypot(w / 2, h);
    case 'cross':
      ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0);
      ctx.moveTo(0, -h / 2); ctx.lineTo(0, h / 2);
      return w + h;
    case 'swoosh':
      // liquid blade hugging a corner: anchored at its top-right corner (0,0),
      // running left along the top edge and down the right edge, with a
      // concave inner curve ending in a sharp tip. Rotate 90/180/270° for other corners.
      ctx.moveTo(0, 0);
      ctx.lineTo(-w, 0);
      // inner edge: concave sweep from the far end of the top edge down to the tip
      ctx.bezierCurveTo(-w * 0.42, h * 0.04, -w * 0.3, h * 0.42, -w * 0.3, h);
      // back up along a tighter curve to the right edge
      ctx.bezierCurveTo(-w * 0.2, h * 0.5, -w * 0.06, h * 0.2, 0, h * 0.12);
      ctx.closePath();
      return 2 * (w + h);
    case 'barcode':
      ctx.rect(-w / 2, -h / 2, w, h);
      return w;
  }
}

/** Deterministic barcode bars; `draw` reveals them left to right. */
function drawBarcode(ctx: CanvasRenderingContext2D, l: ShapeLayer, w: number, h: number) {
  const seed = l.seed ?? 7;
  const n = 64;
  const widths: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const bw = 1 + Math.floor(hash(i, seed, 11) * 4);
    widths.push(bw);
    total += bw;
  }
  const unit = w / total;
  const limit = -w / 2 + w * clamp(l.draw);
  ctx.fillStyle = l.fill;
  let x = -w / 2;
  for (let i = 0; i < n; i++) {
    const bw = widths[i] * unit;
    if (i % 2 === 0 && x < limit) ctx.fillRect(x, -h / 2, Math.min(bw, limit - x), h);
    x += bw;
  }
}

/** Vector icons drawn in a unit box (-0.5..0.5). Stroked/filled with the current styles. */
export function iconPath(ctx: CanvasRenderingContext2D, icon: IconId): 'stroke' | 'fill' | 'both' {
  ctx.beginPath();
  switch (icon) {
    case 'music':
      ctx.moveTo(-0.12, 0.22); ctx.lineTo(-0.12, -0.28); ctx.lineTo(0.28, -0.36); ctx.lineTo(0.28, 0.14);
      ctx.moveTo(-0.12, -0.12); ctx.lineTo(0.28, -0.2);
      ctx.moveTo(-0.12 + 0.11, 0.24); ctx.arc(-0.2, 0.24, 0.11, 0, Math.PI * 2);
      ctx.moveTo(0.28 + 0.11, 0.16); ctx.arc(0.2, 0.16, 0.11, 0, Math.PI * 2);
      return 'stroke';
    case 'image':
      ctx.roundRect?.(-0.36, -0.3, 0.72, 0.6, 0.1);
      ctx.moveTo(-0.3, 0.22); ctx.lineTo(-0.08, -0.02); ctx.lineTo(0.06, 0.12); ctx.lineTo(0.16, 0.02); ctx.lineTo(0.3, 0.2);
      ctx.moveTo(0.2, -0.12); ctx.arc(0.13, -0.12, 0.07, 0, Math.PI * 2);
      return 'stroke';
    case 'eye':
      ctx.moveTo(-0.42, 0); ctx.quadraticCurveTo(0, -0.38, 0.42, 0); ctx.quadraticCurveTo(0, 0.38, -0.42, 0);
      ctx.moveTo(0.13, 0); ctx.arc(0, 0, 0.13, 0, Math.PI * 2);
      return 'stroke';
    case 'diamond':
      ctx.moveTo(-0.38, -0.1); ctx.lineTo(-0.2, -0.32); ctx.lineTo(0.2, -0.32); ctx.lineTo(0.38, -0.1); ctx.lineTo(0, 0.38); ctx.closePath();
      ctx.moveTo(-0.38, -0.1); ctx.lineTo(0.38, -0.1); ctx.moveTo(-0.08, -0.32); ctx.lineTo(0, 0.38); ctx.lineTo(0.08, -0.32);
      return 'stroke';
    case 'flower':
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; const x = Math.cos(a) * 0.22, y = Math.sin(a) * 0.22; ctx.moveTo(x + 0.13, y); ctx.arc(x, y, 0.13, 0, Math.PI * 2); }
      ctx.moveTo(0.08, 0); ctx.arc(0, 0, 0.08, 0, Math.PI * 2);
      return 'stroke';
    case 'sparkle':
      ctx.moveTo(0, -0.42); ctx.quadraticCurveTo(0.05, -0.05, 0.42, 0); ctx.quadraticCurveTo(0.05, 0.05, 0, 0.42); ctx.quadraticCurveTo(-0.05, 0.05, -0.42, 0); ctx.quadraticCurveTo(-0.05, -0.05, 0, -0.42);
      return 'fill';
    case 'search':
      ctx.moveTo(0.04 + 0.22, -0.06); ctx.arc(-0.06, -0.06, 0.22, 0, Math.PI * 2);
      ctx.moveTo(0.1, 0.1); ctx.lineTo(0.34, 0.34);
      return 'stroke';
    case 'heart':
      ctx.moveTo(0, 0.34); ctx.bezierCurveTo(-0.5, 0.0, -0.32, -0.42, 0, -0.16); ctx.bezierCurveTo(0.32, -0.42, 0.5, 0.0, 0, 0.34);
      return 'fill';
    case 'dots':
      for (const x of [-0.22, 0, 0.22]) { ctx.moveTo(x + 0.06, 0); ctx.arc(x, 0, 0.06, 0, Math.PI * 2); }
      return 'fill';
    case 'arrow':
      ctx.moveTo(0, 0.36); ctx.lineTo(0, -0.34); ctx.moveTo(-0.26, -0.08); ctx.lineTo(0, -0.34); ctx.lineTo(0.26, -0.08);
      return 'stroke';
    case 'wave':
      ctx.moveTo(-0.38, 0.06);
      ctx.bezierCurveTo(-0.26, -0.3, -0.12, -0.3, -0.04, 0.02); ctx.bezierCurveTo(0.04, 0.32, 0.2, 0.32, 0.38, -0.06);
      return 'stroke';
    case 'chat':
      ctx.roundRect?.(-0.36, -0.3, 0.72, 0.48, 0.16);
      ctx.moveTo(-0.14, 0.18); ctx.lineTo(-0.22, 0.34); ctx.lineTo(0.02, 0.18);
      return 'stroke';
    case 'play':
      ctx.moveTo(-0.16, -0.26); ctx.lineTo(0.28, 0); ctx.lineTo(-0.16, 0.26); ctx.closePath();
      return 'fill';
    default:
      return 'stroke';
  }
}

/** Glassmorphism app-icon tile: dark translucent body, gradient rim with glow, highlight, vector icon. */
function drawGlassTile(env: Env2D, l: ShapeLayer, w: number, h: number) {
  const { ctx, k } = env;
  const r = Math.min(l.radius * k, w / 2, h / 2);
  const c2 = l.stroke2 ?? l.stroke;
  const rr = () => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, r); else ctx.rect(-w / 2, -h / 2, w, h); };
  // glow
  if (l.glow > 0) {
    ctx.save();
    ctx.shadowColor = l.stroke;
    ctx.shadowBlur = l.glow * k * l.scale;
    rr();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    ctx.restore();
  }
  // body
  const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  body.addColorStop(0, mixHex(l.fill, '#ffffff', 0.08));
  body.addColorStop(1, mixHex(l.fill, '#000000', 0.35));
  rr();
  ctx.fillStyle = body;
  ctx.fill();
  // inner colour wash from the rim colours
  const wash = ctx.createRadialGradient(-w * 0.25, -h * 0.3, 0, -w * 0.25, -h * 0.3, w * 0.9);
  wash.addColorStop(0, rgba(c2, 0.22));
  wash.addColorStop(1, rgba(l.stroke, 0.04));
  ctx.fillStyle = wash;
  ctx.fill();
  // gradient rim
  const rim = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  rim.addColorStop(0, c2);
  rim.addColorStop(0.5, rgba(l.stroke, 0.35));
  rim.addColorStop(1, l.stroke);
  ctx.lineWidth = Math.max(1, l.strokeWidth * k);
  ctx.strokeStyle = rim;
  rr();
  ctx.stroke();
  // top highlight
  ctx.save();
  rr();
  ctx.clip();
  const hl = ctx.createLinearGradient(0, -h / 2, 0, -h / 2 + h * 0.4);
  hl.addColorStop(0, 'rgba(255,255,255,0.18)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(-w / 2, -h / 2, w, h * 0.4);
  ctx.restore();
  // icon
  if (l.icon && l.icon !== 'none') {
    const s = Math.min(w, h) * 0.62;
    ctx.save();
    ctx.scale(s, s);
    const g = ctx.createLinearGradient(-0.4, -0.4, 0.4, 0.4);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, c2);
    g.addColorStop(1, l.stroke);
    ctx.lineWidth = 0.075;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = g;
    ctx.fillStyle = g;
    ctx.shadowColor = c2;
    ctx.shadowBlur = 14 * k * l.scale;
    const mode = iconPath(ctx, l.icon);
    if (mode !== 'stroke') ctx.fill();
    if (mode !== 'fill') ctx.stroke();
    ctx.restore();
  }
}

export function drawShape(env: Env2D, l: ShapeLayer) {
  const { ctx, W, H, k } = env;
  ctx.save();
  ctx.translate(l.x * W, l.y * H);
  ctx.rotate((l.rotation * Math.PI) / 180);
  ctx.scale(l.scale, l.scale);
  const w = l.w * k, h = l.h * k;
  if (l.shape === 'barcode') {
    drawBarcode(ctx, l, w, h);
    ctx.restore();
    return;
  }
  if (l.shape === 'glassTile') {
    drawGlassTile(env, l, w, h);
    ctx.restore();
    return;
  }
  if (l.shape === 'search') {
    // stroked magnifier icon sized by w
    const s = w;
    ctx.save();
    ctx.scale(s, s);
    ctx.lineWidth = Math.max(0.02, (l.strokeWidth * k) / s);
    ctx.lineCap = 'round';
    ctx.strokeStyle = l.stroke;
    if (l.glow > 0) { ctx.shadowColor = l.stroke; ctx.shadowBlur = l.glow * k; }
    iconPath(ctx, 'search');
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    return;
  }
  const len = shapePath(ctx, l, w, h, l.radius * k) ?? w;
  const draw = clamp(l.draw);
  const glow = l.glow * k * l.scale;
  const strokeOnly = l.shape === 'line' || l.shape === 'ring' || l.shape === 'cross';
  if (l.fillOn && !strokeOnly && draw >= 0.999) {
    ctx.fillStyle = l.fill;
    if (glow > 0) { ctx.shadowColor = l.fill; ctx.shadowBlur = glow; }
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  if (l.strokeWidth > 0) {
    ctx.lineWidth = l.strokeWidth * k;
    ctx.lineCap = 'round';
    ctx.strokeStyle = l.stroke;
    if (draw < 0.999) ctx.setLineDash([Math.max(0.001, len * draw), len + 1]);
    if (glow > 0) { ctx.shadowColor = l.stroke; ctx.shadowBlur = glow; }
    if (draw > 0.001) {
      ctx.stroke();
      if (glow > 0) ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

const imageCache = new Map<string, HTMLImageElement>();

function drawSlot(env: Env2D, l: ImageLayer) {
  const { ctx, W, H, k } = env;
  const w = l.w * k, h = w * (l.slotRatio ?? 1);
  ctx.save();
  ctx.translate(l.x * W, l.y * H);
  ctx.rotate((l.rotation * Math.PI) / 180);
  ctx.scale(l.scale, l.scale);
  ctx.fillStyle = 'rgba(128,128,140,0.18)';
  ctx.strokeStyle = 'rgba(128,128,140,0.85)';
  ctx.lineWidth = Math.max(1, 3 * k);
  ctx.setLineDash([14 * k, 10 * k]);
  ctx.beginPath();
  ctx.roundRect?.(-w / 2, -h / 2, w, h, 24 * k);
  if (!ctx.roundRect) ctx.rect(-w / 2, -h / 2, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(110,110,120,0.95)';
  ctx.font = `600 ${Math.round(Math.min(w, h) * 0.075)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('＋ ' + (l.name || 'Image'), 0, 0);
  ctx.font = `400 ${Math.round(Math.min(w, h) * 0.05)}px Inter, sans-serif`;
  ctx.fillText('Inspect → Replace image (PNG cutout)', 0, Math.min(w, h) * 0.1);
  ctx.restore();
}

export function drawImageLayer(env: Env2D, l: ImageLayer) {
  const { ctx, W, H, k } = env;
  if (!l.src) {
    if (env.placeholders) drawSlot(env, l);
    return;
  }
  let img = imageCache.get(l.src);
  if (!img) {
    img = new Image();
    img.onload = () => env.requestRedraw();
    img.src = l.src;
    imageCache.set(l.src, img);
  }
  if (!img.complete || !img.naturalWidth) return;
  const w = l.w * k;
  const h = (w * img.naturalHeight) / img.naturalWidth;
  ctx.save();
  ctx.translate(l.x * W, l.y * H);
  ctx.rotate((l.rotation * Math.PI) / 180);
  ctx.scale(l.scale, l.scale);
  if ((l.shadow ?? 0) > 0.5 && (l.shadowOpacity ?? 0) > 0) {
    // drop shadow for cut-out PNGs (pass drawn far away, only the shadow lands)
    const m = ctx.getTransform();
    const sc = Math.hypot(m.a, m.b) || 1;
    const off = (W * 3) / sc;
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${Math.min(1, l.shadowOpacity ?? 0.4)})`;
    ctx.shadowBlur = (l.shadow ?? 0) * k * l.scale;
    ctx.shadowOffsetX = m.a * off;
    ctx.shadowOffsetY = m.b * off + (l.shadowY ?? 0) * k * l.scale;
    ctx.drawImage(img, -w / 2 - off, -h / 2, w, h);
    ctx.restore();
  }
  if (l.blur > 0.3) {
    // same offset-shadow blur as text (works without canvas `filter`)
    const m = ctx.getTransform();
    const off = (W * 3) / (Math.hypot(m.a, m.b) || 1);
    ctx.shadowColor = '#000';
    ctx.shadowBlur = l.blur * k;
    ctx.shadowOffsetX = m.a * off;
    ctx.shadowOffsetY = m.b * off;
    ctx.drawImage(img, -w / 2 - off, -h / 2, w, h);
  } else ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

export function forgetImage(src: string) {
  imageCache.delete(src);
}

// ---------- particles ----------
// Positions are a pure function of (seed, index, time): scrubbing and export
// produce exactly the same frame as live playback.

const spriteCache = new Map<string, HTMLCanvasElement>();

function sprite(color: string, glow: number) {
  const key = `${color}|${glow.toFixed(2)}`;
  let c = spriteCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  const core = 0.22 / (1 + glow * 0.5);
  grad.addColorStop(0, rgba('#ffffff', 1));
  grad.addColorStop(core * 0.6, rgba(color, 1));
  grad.addColorStop(core, rgba(color, 0.85));
  grad.addColorStop(Math.min(0.95, core + 0.1 + glow * 0.12), rgba(color, 0.18 * Math.min(glow, 2)));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  if (spriteCache.size > 64) spriteCache.clear();
  spriteCache.set(key, c);
  return c;
}

export function particlePositions(l: ParticleLayer, W: number, H: number, k: number, t: number, density: number) {
  const n = Math.max(0, Math.round(l.count * density));
  const xs = new Float32Array(n), ys = new Float32Array(n), ss = new Float32Array(n), as = new Float32Array(n), cs = new Float32Array(n);
  const margin = 60 * k;
  const spanX = W + margin * 2, spanY = H + margin * 2;
  const base = (l.direction * Math.PI) / 180;
  const lt = t - l.start;
  for (let i = 0; i < n; i++) {
    const r1 = hash(i, l.seed, 1), r2 = hash(i, l.seed, 2), r3 = hash(i, l.seed, 3), r4 = hash(i, l.seed, 4), r5 = hash(i, l.seed, 5);
    const ang = base + ((r3 - 0.5) * l.spread * Math.PI) / 180;
    const sp = l.speed * k * (0.35 + r4 * 0.9);
    const wob = l.noise * k;
    let x = r1 * spanX + Math.cos(ang) * sp * lt + Math.sin(lt * (0.6 + r5) + r1 * 20) * wob;
    let y = r2 * spanY - Math.sin(ang) * sp * lt + Math.cos(lt * (0.5 + r4) + r2 * 20) * wob;
    x = ((x % spanX) + spanX) % spanX - margin;
    y = ((y % spanY) + spanY) % spanY - margin;
    xs[i] = x; ys[i] = y;
    ss[i] = l.size * k * (0.35 + r5 * r5 * 1.4);
    as[i] = 1 - l.twinkle * (0.5 + 0.5 * Math.sin(lt * (1.5 + r3 * 3) + r4 * 30));
    cs[i] = r2;
  }
  return { n, xs, ys, ss, as, cs };
}

export function drawParticles(env: Env2D, l: ParticleLayer) {
  const { ctx, W, H, k, t } = env;
  const P = particlePositions(l, W, H, k, t, env.density);
  if (l.interactive && env.pointer) {
    const R = 220 * k;
    for (let i = 0; i < P.n; i++) {
      const dx = P.xs[i] - env.pointer.x, dy = P.ys[i] - env.pointer.y;
      const d = Math.hypot(dx, dy);
      if (d < R && d > 0.001) {
        const f = (1 - d / R) * (env.pointer.down ? 140 : 70) * k;
        P.xs[i] += (dx / d) * f;
        P.ys[i] += (dy / d) * f;
      }
    }
  }
  const prevComp = ctx.globalCompositeOperation;
  const baseAlpha = ctx.globalAlpha;
  if (l.connect > 0) {
    const maxD = l.connect * k;
    const maxD2 = maxD * maxD;
    const [r, g, b] = hexToRgb(mixHex(l.colorA, l.colorB, 0.5));
    ctx.lineWidth = Math.max(0.5, 1.2 * k);
    // bucket by alpha to keep stroke calls low
    const buckets: number[][] = [[], [], [], []];
    const lim = Math.min(P.n, 500);
    for (let i = 0; i < lim; i++) {
      for (let j = i + 1; j < lim; j++) {
        const dx = P.xs[i] - P.xs[j], dy = P.ys[i] - P.ys[j];
        const d2 = dx * dx + dy * dy;
        if (d2 < maxD2) {
          const a = 1 - Math.sqrt(d2) / maxD;
          buckets[Math.min(3, Math.floor(a * 4))].push(i, j);
        }
      }
    }
    buckets.forEach((list, bi) => {
      if (!list.length) return;
      ctx.strokeStyle = `rgba(${r},${g},${b},${((bi + 0.5) / 4) * l.connectOpacity})`;
      ctx.beginPath();
      for (let q = 0; q < list.length; q += 2) {
        ctx.moveTo(P.xs[list[q]], P.ys[list[q]]);
        ctx.lineTo(P.xs[list[q + 1]], P.ys[list[q + 1]]);
      }
      ctx.stroke();
    });
  }
  if (l.glow > 0) ctx.globalCompositeOperation = 'lighter';
  const sprites = Array.from({ length: 6 }, (_, i) => sprite(mixHex(l.colorA, l.colorB, i / 5), l.glow));
  const spriteScale = 2.2 + l.glow * 1.6;
  for (let i = 0; i < P.n; i++) {
    const s = P.ss[i] * spriteScale;
    ctx.globalAlpha = baseAlpha * clamp(P.as[i]);
    ctx.drawImage(sprites[Math.min(5, Math.floor(P.cs[i] * 6))], P.xs[i] - s, P.ys[i] - s, s * 2, s * 2);
  }
  ctx.globalAlpha = baseAlpha;
  ctx.globalCompositeOperation = prevComp;
}

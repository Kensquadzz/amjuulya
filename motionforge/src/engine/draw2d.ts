// Canvas2D rendering modules: background, shapes, images, particles.
import { clamp } from './easing';
import { hexToRgb, mixHex, rgba } from './color';
import { hash } from './util';
import type { BackgroundLayer, ImageLayer, ParticleLayer, ShapeLayer } from './types';

export interface Env2D {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  k: number;
  t: number;
  /** particle density multiplier for adaptive preview quality */
  density: number;
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
  }
}

export function drawShape(env: Env2D, l: ShapeLayer) {
  const { ctx, W, H, k } = env;
  ctx.save();
  ctx.translate(l.x * W, l.y * H);
  ctx.rotate((l.rotation * Math.PI) / 180);
  ctx.scale(l.scale, l.scale);
  const w = l.w * k, h = l.h * k;
  const len = shapePath(ctx, l, w, h, l.radius * k);
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

export function drawImageLayer(env: Env2D, l: ImageLayer) {
  const { ctx, W, H, k } = env;
  if (!l.src) return;
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

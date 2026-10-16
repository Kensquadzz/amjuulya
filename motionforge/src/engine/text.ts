// Typography motion engine: lays text out per character and evaluates
// per-character / per-word / per-line animation state for a given time.
import { clamp, ease, lerp } from './easing';
import { rgba } from './color';
import { fontStack } from './fonts';
import { hash } from './util';
import type { Direction, EasingId, Order, TextAnim, TextLayer, TextPresetId, TextUnit } from './types';

export interface Glyph {
  ch: string;
  x: number; // left edge, block space (px)
  w: number;
  line: number;
  space: boolean;
  charIdx: number; // index among non-space characters
  wordIdx: number;
  xn: number; // 0..1 horizontal position across the block
}

export interface TextLayout {
  glyphs: Glyph[];
  lines: { x0: number; w: number; baseline: number; top: number; h: number }[];
  width: number;
  height: number;
  left: number;
  fontPx: number;
  counts: { char: number; word: number; line: number };
}

export interface CharState {
  tx: number; // em
  ty: number; // em
  sc: number;
  sx: number;
  sy: number;
  rot: number; // degrees
  op: number;
  blur: number; // reference px
  clip: boolean; // clip to the line box (mask reveals)
  glitch: number; // 0..1
}

const identity = (): CharState => ({ tx: 0, ty: 0, sc: 1, sx: 1, sy: 1, rot: 0, op: 1, blur: 0, clip: false, glitch: 0 });

export interface GlyphCtx {
  i: number; // unit index
  n: number; // unit count
  g: Glyph;
  dir: [number, number]; // movement direction (screen space, y down)
  k: number; // intensity
  t: number; // composition time
}

export interface TextPresetDef {
  id: TextPresetId;
  label: string;
  defaults: Partial<TextAnim>;
  /** extra letter spacing (em) driven by global progress, for tracking animations */
  spacing?: (e: number, k: number) => number;
  state: (p: number, e: number, c: GlyphCtx) => CharState;
  /** recommended cursor setup when the preset is applied */
  cursor?: { mode: 'cursor' | 'lightbar' | 'sweep'; glow: number };
}

const dirVec = (d: Direction): [number, number] =>
  d === 'up' ? [0, -1] : d === 'down' ? [0, 1] : d === 'left' ? [-1, 0] : [1, 0];

const fade = (p: number, speed = 1) => clamp(p * speed);

export const TEXT_PRESETS: TextPresetDef[] = [
  {
    id: 'smooth', label: 'Smooth reveal',
    defaults: { unit: 'char', duration: 0.9, stagger: 0.035, ease: 'easeOutCubic', direction: 'up', intensity: 1, order: 'forward' },
    state: (_p, e, c) => ({ ...identity(), op: e, tx: -c.dir[0] * 0.3 * c.k * (1 - e), ty: -c.dir[1] * 0.3 * c.k * (1 - e), blur: 8 * c.k * (1 - e) }),
  },
  {
    id: 'typewriter', label: 'Typewriter',
    defaults: { unit: 'char', duration: 0.02, stagger: 0.065, ease: 'hold', intensity: 1, order: 'forward' },
    state: (p) => ({ ...identity(), op: p > 0 ? 1 : 0 }),
    cursor: { mode: 'cursor', glow: 0 },
  },
  {
    id: 'spacing', label: 'Letter spacing expansion',
    defaults: { unit: 'all', duration: 2.2, stagger: 0, ease: 'easeOutExpo', intensity: 1, order: 'forward' },
    spacing: (e, k) => lerp(-0.18 * k, 0.16 * k, e),
    state: (p, e, c) => ({ ...identity(), op: fade(p, 2.2), blur: 10 * c.k * (1 - e) }),
  },
  {
    id: 'split', label: 'Split text reveal',
    defaults: { unit: 'char', duration: 0.9, stagger: 0.03, ease: 'easeOutExpo', intensity: 1, order: 'forward' },
    state: (p, e, c) => ({ ...identity(), clip: true, ty: (c.g.charIdx % 2 ? -1 : 1) * 1.05 * c.k * (1 - e), op: fade(p, 4) }),
  },
  {
    id: 'stagger', label: 'Character stagger',
    defaults: { unit: 'char', duration: 0.75, stagger: 0.045, ease: 'easeOutBack', direction: 'up', intensity: 1, order: 'forward' },
    state: (p, e, c) => ({ ...identity(), ty: -c.dir[1] * 0.7 * c.k * (1 - e), tx: -c.dir[0] * 0.7 * c.k * (1 - e), sc: 0.55 + 0.45 * e, op: fade(p, 3) }),
  },
  {
    id: 'fadeRise', label: 'Fade and rise',
    defaults: { unit: 'word', duration: 1.1, stagger: 0.12, ease: 'easeOutCubic', direction: 'up', intensity: 1, order: 'forward' },
    state: (_p, e, c) => ({ ...identity(), op: e, ty: -c.dir[1] * 0.55 * c.k * (1 - e), tx: -c.dir[0] * 0.55 * c.k * (1 - e) }),
  },
  {
    id: 'slideBlur', label: 'Slide and blur',
    defaults: { unit: 'char', duration: 0.9, stagger: 0.035, ease: 'easeOutExpo', direction: 'right', intensity: 1, order: 'forward' },
    state: (p, e, c) => ({ ...identity(), tx: -c.dir[0] * 1.4 * c.k * (1 - e), ty: -c.dir[1] * 1.4 * c.k * (1 - e), blur: 16 * c.k * (1 - e), op: fade(p, 2.5) }),
  },
  {
    id: 'elastic', label: 'Elastic scale',
    defaults: { unit: 'char', duration: 1.2, stagger: 0.05, ease: 'elastic', intensity: 1, order: 'center' },
    state: (p, e, c) => ({ ...identity(), sc: lerp(1 - c.k, 1, e), op: fade(p, 5) }),
  },
  {
    id: 'kinetic', label: 'Minimal kinetic',
    defaults: { unit: 'word', duration: 0.65, stagger: 0.28, ease: 'easeOutBack', direction: 'up', intensity: 1, order: 'forward' },
    state: (p, e, c) => ({
      ...identity(),
      sc: lerp(1 + 0.7 * c.k, 1, e),
      rot: (c.g.wordIdx % 2 ? 7 : -7) * c.k * (1 - e),
      ty: -c.dir[1] * 0.25 * c.k * (1 - e),
      op: fade(p, 3),
    }),
  },
  {
    id: 'cursorGlow', label: 'Glowing cursor reveal',
    defaults: { unit: 'char', duration: 0.4, stagger: 0.075, ease: 'easeOutCubic', intensity: 1, order: 'forward' },
    state: (_p, e, c) => ({ ...identity(), op: e, blur: 7 * c.k * (1 - e), tx: -0.15 * c.k * (1 - e) }),
    cursor: { mode: 'cursor', glow: 24 },
  },
  {
    id: 'lightbar', label: 'Vertical light-bar reveal',
    defaults: { unit: 'all', duration: 1.6, stagger: 0, ease: 'easeInOutCubic', intensity: 1, order: 'forward' },
    state: (_p, e, c) => {
      const soft = 0.12;
      const local = clamp((e * (1 + soft) - c.g.xn) / soft);
      return { ...identity(), op: local, blur: 10 * c.k * (1 - local), tx: -0.35 * c.k * (1 - local) };
    },
    cursor: { mode: 'lightbar', glow: 30 },
  },
  {
    id: 'glitch', label: 'Glitch typography',
    defaults: { unit: 'char', duration: 0.6, stagger: 0.03, ease: 'linear', intensity: 1, order: 'random' },
    state: (p, _e, c) => {
      const frame = Math.floor(c.t * 24);
      const r = hash(c.g.charIdx, frame);
      if (p <= 0) return { ...identity(), op: 0 };
      if (p < 1) {
        const on = r < 0.35 + p * 0.65;
        return { ...identity(), op: on ? 1 : 0.15, tx: (hash(c.g.charIdx, frame, 7) - 0.5) * 0.5 * c.k * (1 - p), ty: (hash(c.g.charIdx, frame, 9) - 0.5) * 0.2 * c.k * (1 - p), glitch: (1 - p) * c.k };
      }
      // periodic glitch bursts after the reveal settles
      const slot = Math.floor(c.t / 1.6);
      const inBurst = hash(slot, 3) < 0.7 && (c.t % 1.6) < 0.14;
      if (!inBurst) return identity();
      return { ...identity(), tx: (r - 0.5) * 0.25 * c.k, glitch: 0.7 * c.k, op: r < 0.08 ? 0.3 : 1 };
    },
  },
  {
    id: 'mask', label: 'Mask reveal',
    defaults: { unit: 'line', duration: 1.1, stagger: 0.16, ease: 'easeOutExpo', direction: 'up', intensity: 1, order: 'forward' },
    state: (_p, e, c) => ({ ...identity(), clip: true, ty: -(c.dir[1] || -1) * 1.1 * Math.max(c.k, 0.2) * (1 - e), tx: -c.dir[0] * 1.5 * c.k * (1 - e) }),
  },
  {
    id: 'wordByWord', label: 'Word-by-word entrance',
    defaults: { unit: 'word', duration: 0.75, stagger: 0.18, ease: 'easeOutCubic', direction: 'up', intensity: 1, order: 'forward' },
    state: (_p, e, c) => ({ ...identity(), op: e, ty: -c.dir[1] * 0.3 * c.k * (1 - e), tx: -c.dir[0] * 0.3 * c.k * (1 - e), blur: 6 * c.k * (1 - e), sc: 0.94 + 0.06 * e }),
  },
  {
    id: 'rotate', label: 'Rotating character reveal',
    defaults: { unit: 'char', duration: 0.95, stagger: 0.05, ease: 'easeOutBack', intensity: 1, order: 'forward' },
    state: (p, e, c) => ({ ...identity(), rot: -80 * c.k * (1 - e), sy: clamp(e, 0, 1.2), ty: 0.3 * c.k * (1 - e), op: fade(p, 2) }),
  },
  {
    id: 'cinematic', label: 'Cinematic title reveal',
    defaults: { unit: 'char', duration: 2.2, stagger: 0.03, ease: 'easeOutExpo', intensity: 1, order: 'center' },
    spacing: (e, k) => (1 - e) * 0.55 * k,
    state: (p, e, c) => ({ ...identity(), op: Math.pow(fade(p, 1.4), 0.8), blur: 26 * c.k * (1 - e), sc: lerp(1 + 0.12 * c.k, 1, e) }),
  },
  {
    id: 'none', label: 'No animation',
    defaults: { unit: 'all', duration: 0.01, stagger: 0, ease: 'linear', intensity: 1, order: 'forward' },
    state: () => identity(),
  },
];

export const presetById = (id: TextPresetId) => TEXT_PRESETS.find((p) => p.id === id) ?? TEXT_PRESETS[TEXT_PRESETS.length - 1];

export function cssFont(l: TextLayer, px: number) {
  return `${l.italic ? 'italic ' : ''}${l.fontWeight} ${px.toFixed(2)}px ${fontStack(l.fontFamily)}`;
}

// ---------- layout ----------

const layoutCache = new Map<string, { glyphs: Omit<Glyph, 'xn' | 'line'>[]; w: number }>();

function layoutLine(ctx: CanvasRenderingContext2D, line: string, font: string, lsPx: number) {
  const key = `${font}|${lsPx.toFixed(3)}|${line}`;
  const hit = layoutCache.get(key);
  if (hit) return hit;
  ctx.font = font;
  const chars = Array.from(line);
  const glyphs: Omit<Glyph, 'xn' | 'line'>[] = [];
  let prefix = '';
  let prevW = 0;
  for (let i = 0; i < chars.length; i++) {
    prefix += chars[i];
    // prefix measuring keeps the font's kerning between pairs
    const pw = ctx.measureText(prefix).width;
    glyphs.push({ ch: chars[i], x: prevW + i * lsPx, w: pw - prevW, space: /\s/.test(chars[i]), charIdx: 0, wordIdx: 0 });
    prevW = pw;
  }
  const w = prevW + Math.max(0, chars.length - 1) * lsPx;
  const res = { glyphs, w };
  if (layoutCache.size > 400) layoutCache.clear();
  layoutCache.set(key, res);
  return res;
}

export function layoutText(ctx: CanvasRenderingContext2D, l: TextLayer, k: number, extraSpacingEm = 0): TextLayout {
  const fontPx = l.fontSize * k;
  const font = cssFont(l, fontPx);
  const lsPx = (l.letterSpacing + extraSpacingEm) * fontPx;
  const raw = (l.uppercase ? l.text.toUpperCase() : l.text).split('\n');
  const lh = fontPx * l.lineHeight;
  const measured = raw.map((s) => layoutLine(ctx, s, font, lsPx));
  const width = Math.max(1, ...measured.map((m) => m.w));
  const height = raw.length * lh;
  const top = -height / 2;
  const glyphs: Glyph[] = [];
  const lines: TextLayout['lines'] = [];
  let charIdx = 0, wordIdx = 0;
  measured.forEach((m, li) => {
    const x0 = l.align === 'center' ? -m.w / 2 : l.align === 'left' ? -width / 2 : width / 2 - m.w;
    const ltop = top + li * lh;
    lines.push({ x0, w: m.w, top: ltop, h: lh, baseline: ltop + lh / 2 + fontPx * 0.35 });
    let inWord = false;
    for (const g of m.glyphs) {
      if (g.space) {
        if (inWord) wordIdx++;
        inWord = false;
      } else inWord = true;
      const x = x0 + g.x;
      glyphs.push({ ...g, x, line: li, charIdx: g.space ? charIdx : charIdx++, wordIdx, xn: (x + width / 2 + g.w / 2) / width });
    }
    if (inWord) wordIdx++;
  });
  return { glyphs, lines, width, height, left: -width / 2, fontPx, counts: { char: charIdx, word: wordIdx, line: raw.length } };
}

// ---------- timing ----------

function orderIndex(i: number, n: number, order: Order): number {
  switch (order) {
    case 'reverse': return n - 1 - i;
    case 'center': return Math.round(Math.abs(i - (n - 1) / 2));
    case 'random': {
      // deterministic permutation rank
      const r = hash(i + 1, n, 97);
      let rank = 0;
      for (let j = 0; j < n; j++) if (hash(j + 1, n, 97) < r) rank++;
      return rank;
    }
    default: return i;
  }
}

function maxOrderIndex(n: number, order: Order) {
  return order === 'center' ? Math.round((n - 1) / 2) : Math.max(0, n - 1);
}

const unitOf = (g: Glyph, u: TextUnit) => (u === 'char' ? g.charIdx : u === 'word' ? g.wordIdx : u === 'line' ? g.line : 0);
const unitCount = (L: TextLayout, u: TextUnit) => (u === 'char' ? L.counts.char : u === 'word' ? L.counts.word : u === 'line' ? L.counts.line : 1);

/** Raw (uneased) progress for unit i, combining the in- and out- animations. */
export function unitProgress(l: TextLayer, i: number, n: number, t: number): number {
  const a = l.anim;
  const oi = orderIndex(i, n, a.order);
  const start = l.start + a.delay + oi * a.stagger;
  let p = a.duration <= 0 ? (t >= start ? 1 : 0) : clamp((t - start) / a.duration);
  if (a.out.enabled) {
    const total = a.out.duration + maxOrderIndex(n, a.order) * a.out.stagger;
    const os = l.end - total + oi * a.out.stagger;
    const po = a.out.duration <= 0 ? (t >= os ? 1 : 0) : clamp((t - os) / a.out.duration);
    p = Math.min(p, 1 - po);
  }
  return p;
}

/** Progress of the whole block (used for tracking + light bar). */
export function globalProgress(l: TextLayer, n: number, t: number): number {
  const a = l.anim;
  const total = a.duration + maxOrderIndex(n, a.order) * a.stagger;
  let p = total <= 0 ? 1 : clamp((t - l.start - a.delay) / total);
  if (a.out.enabled) {
    const outTotal = a.out.duration + maxOrderIndex(n, a.order) * a.out.stagger;
    p = Math.min(p, 1 - clamp((t - (l.end - outTotal)) / Math.max(outTotal, 1e-3)));
  }
  return p;
}

const easeOf = (a: TextAnim, p: number) => ease(a.ease as EasingId, p, a.bezier);

// ---------- drawing ----------

function drawBlurredText(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, blurPx: number, color: string, canvasW: number) {
  // Canvas `filter` is not available on every iOS Safari version, so blur is
  // done with the offset-shadow trick: draw far off-canvas and let only the
  // blurred shadow land where the glyph should be.
  const m = ctx.getTransform();
  const scale = Math.hypot(m.a, m.b) || 1;
  const off = (canvasW * 3) / scale;
  ctx.shadowColor = color;
  ctx.shadowBlur = blurPx;
  ctx.shadowOffsetX = m.a * off;
  ctx.shadowOffsetY = m.b * off;
  ctx.fillText(ch, x - off, y);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.shadowBlur = 0;
}

export interface TextDrawEnv {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  k: number; // render px per reference px
  t: number;
}

/** Draw a (keyframe-resolved) text layer. Caller sets globalAlpha/composite. */
export function drawText(env: TextDrawEnv, l: TextLayer) {
  const { ctx, W, H, k, t } = env;
  const def = presetById(l.anim.preset);
  // pass 1: global progress for tracking presets (needs counts, so layout once without spacing)
  let L = layoutText(ctx, l, k, 0);
  const unit = l.anim.unit;
  const n = Math.max(1, unitCount(L, unit));
  const gp = globalProgress(l, n, t);
  if (def.spacing) L = layoutText(ctx, l, k, def.spacing(easeOf(l.anim, gp), l.anim.intensity));
  const fontPx = L.fontPx;
  const dir = dirVec(l.anim.direction);
  const baseAlpha = ctx.globalAlpha;

  ctx.save();
  ctx.translate(l.x * W, l.y * H);
  ctx.rotate((l.rotation * Math.PI) / 180);
  ctx.scale(l.scale, l.scale);
  ctx.font = cssFont(l, fontPx);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  const mid = fontPx * 0.35;
  let frontier: { x: number; line: number } | null = null;
  const unitIsGlobal = unit === 'all' || l.anim.preset === 'lightbar';

  for (const g of L.glyphs) {
    const ui = unitIsGlobal ? 0 : unitOf(g, unit);
    const p = unitIsGlobal ? gp : unitProgress(l, ui, n, t);
    if (!g.space && p > 0) frontier = { x: g.x + g.w, line: g.line };
    if (g.space) continue;
    const s = def.state(p, easeOf(l.anim, p), { i: ui, n, g, dir, k: l.anim.intensity, t });
    if (s.op <= 0.002 || s.sc * s.sx * s.sy === 0) continue;
    const line = L.lines[g.line];
    ctx.save();
    if (s.clip) {
      ctx.beginPath();
      ctx.rect(line.x0 - fontPx, line.top, line.w + fontPx * 2, line.h);
      ctx.clip();
    }
    ctx.translate(g.x + g.w / 2 + s.tx * fontPx, line.baseline - mid + s.ty * fontPx);
    if (s.rot) ctx.rotate((s.rot * Math.PI) / 180);
    if (s.sc !== 1 || s.sx !== 1 || s.sy !== 1) ctx.scale(s.sc * s.sx, s.sc * s.sy);
    const alpha = baseAlpha * clamp(s.op);
    const blur = (l.blur + s.blur) * k * l.scale;
    const dx = -g.w / 2, dy = mid;
    if (s.glitch > 0.01) {
      const off = s.glitch * fontPx * 0.08;
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = '#ff2a4d';
      ctx.fillText(g.ch, dx - off, dy);
      ctx.fillStyle = '#21e6ff';
      ctx.fillText(g.ch, dx + off, dy + off * 0.3);
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = l.color;
    if (l.glow > 0.5) {
      ctx.shadowColor = l.glowColor;
      ctx.shadowBlur = l.glow * k * l.scale;
      if (blur > 0.4) drawBlurredText(ctx, g.ch, dx, dy, blur + l.glow * k * 0.5, l.glowColor, W);
      else ctx.fillText(g.ch, dx, dy);
      ctx.shadowBlur = 0;
    }
    if (blur > 0.4) drawBlurredText(ctx, g.ch, dx, dy, blur, l.color, W);
    else ctx.fillText(g.ch, dx, dy);
    ctx.restore();
  }
  ctx.globalAlpha = baseAlpha;

  if (l.cursor.enabled) drawCursor(env, l, L, frontier, gp);
  ctx.restore();
}

function drawCursor(env: TextDrawEnv, l: TextLayer, L: TextLayout, frontier: { x: number; line: number } | null, gp: number) {
  const { ctx, k, t } = env;
  const c = l.cursor;
  const fontPx = L.fontPx;
  const baseAlpha = ctx.globalAlpha;
  const glow = c.glow * k;
  const cw = Math.max(1, c.width * k);

  if (c.mode === 'cursor') {
    if (t < l.start + l.anim.delay - 0.6 && l.anim.delay > 0) return;
    const line = frontier ? L.lines[frontier.line] : L.lines[0];
    const x = frontier ? frontier.x + fontPx * 0.08 : line.x0;
    const typing = gp > 0 && gp < 1;
    const blinkOn = c.blink <= 0 || typing || ((t * c.blink) % 1) < 0.5;
    if (!blinkOn) return;
    const h = fontPx * c.height;
    ctx.fillStyle = c.color;
    ctx.shadowColor = c.color;
    ctx.shadowBlur = glow;
    ctx.fillRect(x, line.baseline - fontPx * 0.35 - h / 2, cw, h);
    if (glow > 0) ctx.fillRect(x, line.baseline - fontPx * 0.35 - h / 2, cw, h);
    ctx.shadowBlur = 0;
    return;
  }

  if (c.mode !== 'lightbar') return;
  // the light bar follows the text reveal when the preset is "lightbar",
  // otherwise it travels on its own timing (cursor.delay / cursor.travel)
  const usesAnim = l.anim.preset === 'lightbar';
  const p = usesAnim ? gp : clamp((t - l.start - c.delay) / Math.max(0.05, c.travel));
  if (p <= 0) return;
  const e = usesAnim ? ease(l.anim.ease, p, l.anim.bezier) : ease('easeInOutCubic', p);
  const animEnd = usesAnim ? l.start + l.anim.delay + l.anim.duration : l.start + c.delay + c.travel;
  const alpha = p < 1 ? 1 : clamp(1 - (t - animEnd) / 0.6);
  if (alpha <= 0.001) return;
  const grow = ease('easeOutExpo', clamp(p * 5));
  const x = L.left + e * (usesAnim ? 1.12 : 1) * L.width;
  const h = Math.max(L.height, fontPx * c.height) * (0.15 + 0.85 * grow);
  ctx.globalAlpha = baseAlpha * alpha;
  const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  grad.addColorStop(0, rgba(c.color, 0));
  grad.addColorStop(0.5, rgba(c.color, 1));
  grad.addColorStop(1, rgba(c.color, 0));
  ctx.fillStyle = grad;
  ctx.shadowColor = c.color;
  ctx.shadowBlur = glow;
  ctx.fillRect(x - cw / 2, -h / 2, cw, h);
  ctx.fillRect(x - cw / 2, -h / 2, cw, h);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = baseAlpha;
}

/** Horizontal light sweep over text; drawn with source-atop onto an isolated text canvas. */
export function drawSweep(env: TextDrawEnv, l: TextLayer) {
  const { ctx, W, H, k, t } = env;
  const c = l.cursor;
  const p = clamp((t - l.start - c.delay) / Math.max(0.05, c.travel));
  if (p <= 0 || p >= 1) return;
  const L = layoutText(ctx, l, k, 0);
  const e = ease('easeInOutCubic', p);
  const band = Math.max(L.width * 0.25, L.fontPx);
  const x = L.left - band + e * (L.width + band * 2);
  ctx.save();
  ctx.translate(l.x * W, l.y * H);
  ctx.rotate((l.rotation * Math.PI) / 180);
  ctx.scale(l.scale, l.scale);
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(x - band / 2, 0, x + band / 2, 0);
  g.addColorStop(0, rgba(c.color, 0));
  g.addColorStop(0.5, rgba(c.color, 0.95));
  g.addColorStop(1, rgba(c.color, 0));
  ctx.fillStyle = g;
  ctx.transform(1, 0, -0.35, 1, 0, 0);
  ctx.fillRect(x - band, -L.height, band * 2, L.height * 2);
  ctx.restore();
}

export const textNeedsIsolation = (l: TextLayer) => l.cursor.enabled && l.cursor.mode === 'sweep';

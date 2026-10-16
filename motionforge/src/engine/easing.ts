import type { Bezier, EasingId } from './types';

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Cubic Bézier timing function (CSS semantics: P0=(0,0), P3=(1,1)). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton-Raphson, falling back to bisection for flat derivatives.
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

const bezierCache = new Map<string, (x: number) => number>();

const springRaw = (t: number) => 1 - Math.exp(-6.5 * t) * Math.cos(t * Math.PI * 2 * 1.35);
const springEnd = springRaw(1);

export const EASINGS: Record<Exclude<EasingId, 'bezier'>, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOutExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInOutExpo: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  easeOutBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  // Damped spring, normalised so f(0)=0 and f(1)=1 exactly.
  spring: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : springRaw(t) + (1 - springEnd) * t),
  elastic: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  hold: (t) => (t >= 1 ? 1 : 0),
};

export function ease(id: EasingId, t: number, bezier?: Bezier): number {
  t = clamp(t);
  if (id === 'bezier') {
    const b = bezier ?? [0.25, 0.1, 0.25, 1];
    const key = b.join(',');
    let f = bezierCache.get(key);
    if (!f) {
      f = cubicBezier(b[0], b[1], b[2], b[3]);
      bezierCache.set(key, f);
    }
    return f(t);
  }
  return (EASINGS[id] ?? EASINGS.linear)(t);
}

export const EASING_LABELS: Record<EasingId, string> = {
  linear: 'Linear',
  easeIn: 'Ease in',
  easeOut: 'Ease out',
  easeInOut: 'Ease in-out',
  easeOutCubic: 'Ease out (cubic)',
  easeInOutCubic: 'Ease in-out (cubic)',
  easeOutExpo: 'Ease out (expo)',
  easeInOutExpo: 'Ease in-out (expo)',
  easeOutBack: 'Back (overshoot)',
  spring: 'Spring',
  elastic: 'Elastic',
  bezier: 'Cubic Bézier',
  hold: 'Hold',
};

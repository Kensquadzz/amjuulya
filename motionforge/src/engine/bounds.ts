// On-screen bounds of layers (composition pixels) for tap-to-select,
// the selection frame and direct manipulation in the preview.
import { resolveLayer } from './keyframes';
import { layoutText } from './text';
import type { Layer, Project } from './types';

export interface Box { cx: number; cy: number; w: number; h: number; rot: number }

let mctx: CanvasRenderingContext2D | null = null;
const measureCtx = () => (mctx ??= document.createElement('canvas').getContext('2d')!);
const imgSize = new Map<string, number>();

export function layerBox(raw: Layer, t: number, W: number, H: number): Box | null {
  const l = resolveLayer(raw, t);
  const k = Math.min(W, H) / 1080;
  switch (l.type) {
    case 'text': {
      const L = layoutText(measureCtx(), l, k, 0);
      const w = L.width * l.scale, h = L.height * l.scale;
      const off = l.anchor === 'left' ? w / 2 : l.anchor === 'right' ? -w / 2 : 0;
      return { cx: l.x * W + off, cy: l.y * H, w: w + 20 * k, h: h + 10 * k, rot: l.rotation };
    }
    case 'image': {
      let ratio = l.slotRatio ?? 1;
      if (l.src) {
        const r = imgSize.get(l.src);
        if (r) ratio = r;
        else { const i = new Image(); i.onload = () => imgSize.set(l.src, i.naturalHeight / i.naturalWidth); i.src = l.src; }
      }
      const w = l.w * k * l.scale;
      return { cx: l.x * W, cy: l.y * H, w, h: w * ratio, rot: l.rotation };
    }
    case 'shape': {
      if (l.mask && l.mask !== 'none') return null;
      const w = Math.max(l.w * k, 30 * k) * l.scale, h = Math.max(l.h * k, 30 * k) * l.scale;
      // swoosh is anchored at its top-right corner
      if (l.shape === 'swoosh') return { cx: l.x * W - w / 2, cy: l.y * H + h / 2, w, h, rot: l.rotation };
      return { cx: l.x * W, cy: l.y * H, w, h: l.shape === 'line' ? Math.max(h, 40 * k) : h, rot: l.rotation };
    }
    default:
      return null; // backgrounds, particles and shader effects fill the frame
  }
}

function inside(b: Box, x: number, y: number) {
  const a = (-b.rot * Math.PI) / 180;
  const dx = x - b.cx, dy = y - b.cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2;
}

/** Topmost selectable layer under a point (composition pixels), or null. */
export function hitTest(p: Project, t: number, x: number, y: number, W: number, H: number): string | null {
  for (let i = p.layers.length - 1; i >= 0; i--) {
    const l = p.layers[i];
    if (!l.visible || l.locked || t < l.start || t > l.end) continue;
    const b = layerBox(l, t, W, H);
    if (b && inside(b, x, y)) return l.id;
  }
  return null;
}

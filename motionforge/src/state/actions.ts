// Editing actions used by the simple (CapCut-style) editor.
import { deepClone, uid } from '../engine/util';
import type { AudioClip, EasingId, Keyframe, Layer, TextLayer } from '../engine/types';
import { engine } from './engine';
import { getStore } from './store';

const now = () => engine.frameTime();

export function deleteLayer(id: string) {
  getStore().update((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== id) }));
  getStore().select(null);
}

export function duplicateLayer(id: string) {
  const store = getStore();
  const l = store.state.project.layers.find((x) => x.id === id);
  if (!l) return;
  const copy = { ...deepClone(l), id: uid(), name: `${l.name} 2` } as Layer;
  // nudge copies of visible things so they don't sit exactly on top
  if (copy.type === 'text' || copy.type === 'shape' || copy.type === 'image') { copy.x = Math.min(0.95, copy.x + 0.03); copy.y = Math.min(0.95, copy.y + 0.03); }
  store.update((p) => {
    const i = p.layers.findIndex((x) => x.id === id);
    const layers = [...p.layers];
    layers.splice(i + 1, 0, copy);
    return { ...p, layers };
  });
  store.select(copy.id);
}

export function moveLayer(id: string, dir: 1 | -1) {
  getStore().update((p) => {
    const i = p.layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.layers.length) return p;
    const layers = [...p.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    return { ...p, layers };
  });
}

/** Split a layer at the playhead into two layers. Returns false if the playhead is outside it. */
export function splitLayer(id: string): boolean {
  const store = getStore();
  const l = store.state.project.layers.find((x) => x.id === id);
  const t = now();
  if (!l || t <= l.start + 0.05 || t >= l.end - 0.05) return false;
  const a = { ...deepClone(l), end: t } as Layer;
  const b = { ...deepClone(l), id: uid(), start: t, name: `${l.name} 2` } as Layer;
  if (a.type === 'text') (a as TextLayer).anim.out.enabled = false; // first part stays on screen until the cut
  if (b.type === 'text') { const bt = b as TextLayer; bt.anim = { ...bt.anim, preset: 'none', delay: 0 }; bt.cursor = { ...bt.cursor, enabled: bt.cursor.mode === 'cursor' && bt.cursor.enabled }; }
  store.update((p) => {
    const i = p.layers.findIndex((x) => x.id === id);
    const layers = [...p.layers];
    layers.splice(i, 1, a, b);
    return { ...p, layers };
  });
  store.select(b.id);
  return true;
}

export function deleteClip(id: string) {
  getStore().update((p) => ({ ...p, audio: (p.audio ?? []).filter((c) => c.id !== id) }));
  getStore().selectClip(null);
}

export function splitClip(id: string): boolean {
  const store = getStore();
  const c = store.state.project.audio?.find((x) => x.id === id);
  const t = now();
  if (!c || t <= c.start + 0.05 || t >= c.start + c.duration - 0.05) return false;
  const first: AudioClip = { ...c, duration: t - c.start, fadeOut: Math.min(c.fadeOut, 0.05) };
  const second: AudioClip = { ...c, id: uid(), start: t, offset: c.offset + (t - c.start), duration: c.duration - (t - c.start), fadeIn: 0.02 };
  store.update((p) => ({ ...p, audio: (p.audio ?? []).flatMap((x) => (x.id === id ? [first, second] : [x])) }));
  store.selectClip(second.id);
  return true;
}

export function duplicateClip(id: string) {
  const store = getStore();
  const c = store.state.project.audio?.find((x) => x.id === id);
  if (!c) return;
  const d = store.state.project.duration;
  const copy = { ...c, id: uid(), start: Math.min(d - 0.05, c.start + c.duration) };
  store.update((p) => ({ ...p, audio: [...(p.audio ?? []), copy] }));
  store.selectClip(copy.id);
}

// ---------------------------------------------------------------- in / out animation (photos, shapes, effects)

export type MotionPreset = 'none' | 'fade' | 'zoomIn' | 'zoomOut' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'pop' | 'spin' | 'blur';
export const MOTION_PRESETS: MotionPreset[] = ['none', 'fade', 'zoomIn', 'zoomOut', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'pop', 'spin', 'blur'];

const IN_TAG = 'ain', OUT_TAG = 'aout';

/** Which preset is currently applied (read back from tagged keyframes). */
export function currentMotion(l: Layer, which: 'in' | 'out'): { preset: MotionPreset; duration: number } {
  const tag = which === 'in' ? IN_TAG : OUT_TAG;
  for (const kfs of Object.values(l.tracks)) {
    const k = kfs.find((q) => q.id.startsWith(tag + ':'));
    if (k) {
      const [, preset, dur] = k.id.split(':');
      return { preset: preset as MotionPreset, duration: Number(dur) || 0.5 };
    }
  }
  return { preset: 'none', duration: 0.5 };
}

/**
 * Apply an In or Out animation by writing tagged keyframes at the layer's
 * start (In) or end (Out). Previous tagged keys are replaced; the user's own
 * keyframes elsewhere are kept.
 */
export function setMotion(layerId: string, which: 'in' | 'out', preset: MotionPreset, duration = 0.5) {
  getStore().updateLayer(layerId, (l) => {
    const tag = which === 'in' ? IN_TAG : OUT_TAG;
    const tracks: Record<string, Keyframe[]> = {};
    for (const [path, kfs] of Object.entries(l.tracks)) {
      const kept = kfs.filter((k) => !k.id.startsWith(tag + ':'));
      if (kept.length) tracks[path] = kept;
    }
    if (preset === 'none') return { ...l, tracks };
    const d = Math.max(0.1, Math.min(duration, (l.end - l.start) / 2));
    const t0 = which === 'in' ? l.start : l.end - d;
    const t1 = which === 'in' ? l.start + d : l.end;
    const id = () => `${tag}:${preset}:${d.toFixed(2)}:${uid()}`;
    const base = (path: string) => {
      const v = (l as any)[path] as number;
      // keyframed already? use its value at the boundary
      return Number.isFinite(v) ? v : 0;
    };
    const add = (path: string, from: number, to: number, ease: EasingId) => {
      const list = tracks[path] ? [...tracks[path]] : [];
      const a: Keyframe = { id: id(), t: t0, v: which === 'in' ? from : to, ease: which === 'in' ? ease : 'easeIn' };
      const b: Keyframe = { id: id(), t: t1, v: which === 'in' ? to : from, ease: 'linear' };
      // when In and Out are both set, In's end value and Out's start value are the resting value
      tracks[path] = [...list.filter((k) => Math.abs(k.t - a.t) > 1e-3 && Math.abs(k.t - b.t) > 1e-3), a, b].sort((x, y) => x.t - y.t);
    };
    const op = base('opacity') || 1, sc = base('scale') || 1, x = base('x'), y = base('y'), rot = base('rotation');
    add('opacity', 0, op, 'easeOutCubic');
    switch (preset) {
      case 'zoomIn': add('scale', sc * 0.6, sc, 'easeOutCubic'); break;
      case 'zoomOut': add('scale', sc * 1.4, sc, 'easeOutCubic'); break;
      case 'slideUp': add('y', y + 0.08, y, 'easeOutCubic'); break;
      case 'slideDown': add('y', y - 0.08, y, 'easeOutCubic'); break;
      case 'slideLeft': add('x', x + 0.2, x, 'easeOutCubic'); break;
      case 'slideRight': add('x', x - 0.2, x, 'easeOutCubic'); break;
      case 'pop': add('scale', 0.01, sc, 'easeOutBack'); break;
      case 'spin': add('rotation', rot - 120, rot, 'easeOutCubic'); add('scale', sc * 0.5, sc, 'easeOutCubic'); break;
      case 'blur': if (l.type === 'image') add('blur', 30, (l as any).blur ?? 0, 'easeOutCubic'); else add('scale', sc * 1.1, sc, 'easeOutCubic'); break;
    }
    return { ...l, tracks };
  });
}

/** Add a layer at the playhead (CapCut: new items start where you are). */
export function addLayerHere(l: Layer, defaultLen?: number) {
  const store = getStore();
  const d = store.state.project.duration;
  let start = now();
  if (start > d - 0.8) start = 0;
  const end = defaultLen ? Math.min(d, start + defaultLen) : d;
  const nl = { ...l, start, end } as Layer;
  // keyframes authored at t=0 move with the layer
  if (start > 0) for (const k of Object.values(nl.tracks)) for (const q of k) q.t += start;
  store.update((p) => ({ ...p, layers: [...p.layers, nl] }));
  store.select(nl.id);
  return nl;
}

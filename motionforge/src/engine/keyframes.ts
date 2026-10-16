import { ease, clamp } from './easing';
import { isHexColor, mixHex } from './color';
import type { Keyframe, KfValue, Layer, Tracks } from './types';
import { uid } from './util';

/** Read a value by dotted path ("params.u_spacing", "cursor.color"). */
export function getPath(obj: unknown, path: string): unknown {
  let cur: any = obj;
  for (const k of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

/** Immutable set by dotted path. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const root: any = Array.isArray(obj) ? [...(obj as any)] : { ...(obj as any) };
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const next = cur[k];
    cur[k] = Array.isArray(next) ? [...next] : { ...(next ?? {}) };
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return root;
}

export function interpolate(a: KfValue, b: KfValue, t: number): KfValue {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (isHexColor(a) && isHexColor(b)) return mixHex(a, b, t);
  return t < 1 ? a : b;
}

/** Evaluate a keyframe track at time t. Keyframes must be sorted by t. */
export function evalTrack(kfs: Keyframe[], t: number): KfValue | undefined {
  if (!kfs || kfs.length === 0) return undefined;
  if (t <= kfs[0].t) return kfs[0].v;
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return last.v;
  // binary search for the segment containing t
  let lo = 0, hi = kfs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (kfs[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = kfs[lo], b = kfs[hi];
  const span = b.t - a.t;
  const local = span <= 0 ? 1 : clamp((t - a.t) / span);
  return interpolate(a.v, b.v, ease(a.ease, local, a.bezier));
}

/** Return a copy of the layer with every keyframed property resolved at time t. */
export function resolveLayer<L extends Layer>(layer: L, t: number): L {
  const paths = Object.keys(layer.tracks || {});
  if (paths.length === 0) return layer;
  let out: L = layer;
  for (const p of paths) {
    const v = evalTrack(layer.tracks[p], t);
    if (v !== undefined) out = setPath(out, p, v);
  }
  return out;
}

export const sortKfs = (k: Keyframe[]) => [...k].sort((a, b) => a.t - b.t);

const EPS = 1 / 240;

/** Insert or replace a keyframe at time t. */
export function upsertKeyframe(tracks: Tracks, path: string, t: number, v: KfValue, easeId: Keyframe['ease'] = 'easeInOutCubic'): Tracks {
  const list = tracks[path] ? [...tracks[path]] : [];
  const i = list.findIndex((k) => Math.abs(k.t - t) < EPS);
  if (i >= 0) list[i] = { ...list[i], v };
  else list.push({ id: uid(), t, v, ease: easeId });
  return { ...tracks, [path]: sortKfs(list) };
}

export function keyframeAt(tracks: Tracks, path: string, t: number): Keyframe | undefined {
  return tracks[path]?.find((k) => Math.abs(k.t - t) < EPS);
}

export function removeKeyframe(tracks: Tracks, path: string, id: string): Tracks {
  const list = (tracks[path] || []).filter((k) => k.id !== id);
  const next = { ...tracks };
  if (list.length) next[path] = list; else delete next[path];
  return next;
}

export function updateKeyframe(tracks: Tracks, path: string, id: string, patch: Partial<Keyframe>): Tracks {
  const list = (tracks[path] || []).map((k) => (k.id === id ? { ...k, ...patch } : k));
  return { ...tracks, [path]: sortKfs(list) };
}

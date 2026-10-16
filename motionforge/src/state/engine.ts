// Singleton bridge between the UI and the rendering engine.
import { useEffect, useState } from 'react';
import { Renderer } from '../engine/renderer';
import { Player } from '../engine/player';
import { keyframeAt, upsertKeyframe, removeKeyframe, getPath, setPath, resolveLayer } from '../engine/keyframes';
import type { KfValue, Layer, PreviewQuality } from '../engine/types';
import { getStore } from './store';

export const QUALITY_SCALE: Record<PreviewQuality, number> = { low: 0.34, medium: 0.5, high: 0.75 };
export const QUALITY_DENSITY: Record<PreviewQuality, number> = { low: 0.4, medium: 0.7, high: 1 };

class Engine {
  renderer: Renderer | null = null;
  player: Player | null = null;
  quality: PreviewQuality = 'medium';
  private unsub: (() => void) | null = null;

  attach(canvas: HTMLCanvasElement) {
    this.detach();
    this.renderer = new Renderer(canvas);
    this.player = new Player(this.renderer);
    this.player.density = QUALITY_DENSITY[this.quality];
    const store = getStore();
    this.player.setProject(store.state.project);
    let last = store.state.project;
    this.unsub = store.subscribe(() => {
      if (store.state.project !== last) {
        last = store.state.project;
        this.player?.setProject(last);
      }
    });
    return this.renderer;
  }

  detach() {
    this.unsub?.();
    this.player?.dispose();
    this.renderer?.dispose();
    this.player = null;
    this.renderer = null;
  }

  get time() { return this.player?.time ?? 0; }

  /** Current time snapped to the project's frame grid (keyframes land on frames). */
  frameTime() {
    const fps = getStore().state.project.fps;
    return Math.round(this.time * fps) / fps;
  }
}

export const engine = new Engine();

/** React hook: current time; updates continuously while paused/scrubbing, throttled while playing. */
export function useTime(throttleMs = 120) {
  const [t, setT] = useState(engine.time);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let last = 0;
    let unsub: (() => void) | undefined;
    const attach = () => {
      unsub = engine.player?.subscribe((time, pl) => {
        const now = performance.now();
        setPlaying(pl);
        if (!pl || now - last > throttleMs) { last = now; setT(time); }
      }) as (() => void) | undefined;
    };
    attach();
    const iv = engine.player ? 0 : window.setInterval(() => { if (engine.player) { attach(); clearInterval(iv); } }, 100);
    return () => { unsub?.(); clearInterval(iv); };
  }, [throttleMs]);
  return { t, playing };
}

// ---------- property editing with keyframe semantics ----------

/** Value of a property at the current time (animated if it has keyframes). */
export function valueAt(layer: Layer, path: string, t: number): unknown {
  return getPath(layer.tracks[path]?.length ? resolveLayer(layer, t) : layer, path);
}

/**
 * Set a property. If the property is keyframed, this writes (or updates) a
 * keyframe at the current frame — like stopwatch-enabled properties in a
 * desktop compositor. Otherwise it changes the static value.
 */
export function setProp(layerId: string, path: string, value: KfValue | boolean) {
  const store = getStore();
  const t = engine.frameTime();
  store.updateLayer(layerId, (l) => {
    if (l.tracks[path]?.length && typeof value !== 'boolean') return { ...l, tracks: upsertKeyframe(l.tracks, path, t, value) };
    return setPath(l, path, value);
  }, `${layerId}:${path}`);
}

/** Toggle a keyframe at the current frame. */
export function toggleKeyframe(layer: Layer, path: string) {
  const store = getStore();
  const t = engine.frameTime();
  const existing = keyframeAt(layer.tracks, path, t);
  store.updateLayer(layer.id, (l) => {
    if (existing) return { ...l, tracks: removeKeyframe(l.tracks, path, existing.id) };
    const v = valueAt(l, path, t) as KfValue;
    return { ...l, tracks: upsertKeyframe(l.tracks, path, t, v) };
  });
}

export function clearTrack(layerId: string, path: string) {
  getStore().updateLayer(layerId, (l) => {
    const v = valueAt(l, path, engine.frameTime());
    const tracks = { ...l.tracks };
    delete tracks[path];
    return setPath({ ...l, tracks }, path, v);
  });
}

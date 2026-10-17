// Singleton bridge between the UI and the rendering engine.
import { useEffect, useState } from 'react';
import { Renderer } from '../engine/renderer';
import { Player } from '../engine/player';
import { keyframeAt, upsertKeyframe, removeKeyframe, getPath, setPath, resolveLayer } from '../engine/keyframes';
import type { KfValue, Layer, PreviewQuality } from '../engine/types';
import { getStore } from './store';
import { getBuffer, liveAudio } from '../engine/audio';
import type { Project } from '../engine/types';

/** Decode/synthesise every clip ahead of time so the first Play starts on cue. */
function warmAudio(p: Project) {
  for (const c of p.audio ?? []) getBuffer(c.assetId).catch(() => {});
}

// Fraction of the export size the preview renders at. The result is also
// capped at the screen's own pixel count, so High is retina-sharp on a phone
// without rendering pixels nobody can see.
export const QUALITY_SCALE: Record<PreviewQuality, number> = { low: 0.4, medium: 0.67, high: 1.5 }; // high may exceed 1080p in full screen on a 3× phone
/** upper bound for @heavy 3D shaders in the preview */
export const QUALITY_HEAVY: Record<PreviewQuality, number> = { low: 0.45, medium: 0.7, high: 1 };
export const QUALITY_DENSITY: Record<PreviewQuality, number> = { low: 0.5, medium: 0.8, high: 1 };

class Engine {
  renderer: Renderer | null = null;
  player: Player | null = null;
  quality: PreviewQuality = 'high';
  private unsub: (() => void) | null = null;

  attach(canvas: HTMLCanvasElement) {
    this.detach();
    this.renderer = new Renderer(canvas);
    this.renderer.placeholders = true;
    this.player = new Player(this.renderer);
    this.player.density = QUALITY_DENSITY[this.quality];
    const store = getStore();
    this.player.setProject(store.state.project);
    let last = store.state.project;
    warmAudio(last);
    const unsubStore = store.subscribe(() => {
      if (store.state.project !== last) {
        const audioChanged = store.state.project.audio !== last.audio;
        last = store.state.project;
        this.player?.setProject(last);
        if (audioChanged) warmAudio(last);
        if (audioChanged && this.player?.playing) liveAudio.start(last, this.player.time);
      }
    });
    // keep audio in sync with the picture clock: start/stop with playback,
    // re-sync after seeks and loop wrap-around
    let wasPlaying = false, lastT = 0, lastWall = 0;
    const unsubPlayer = this.player.subscribe((t, playing) => {
      const now = performance.now();
      if (playing && !wasPlaying) liveAudio.start(store.state.project, t);
      else if (!playing && wasPlaying) liveAudio.stop();
      else if (playing && Math.abs(t - (lastT + (now - lastWall) / 1000)) > 0.25) liveAudio.start(store.state.project, t);
      wasPlaying = playing;
      lastT = t;
      lastWall = now;
    });
    // 3D (@heavy) shaders: full resolution whenever the picture stands still;
    // while playing, step down if the device cannot keep up, so playback stays
    // smooth. Exports always render at full size with their own renderer.
    const adapt = setInterval(() => {
      const r = this.renderer, pl = this.player;
      if (!r || !pl) return;
      const max = QUALITY_HEAVY[this.quality];
      let next = r.heavyScale;
      if (!pl.playing) next = max;
      else if (pl.fpsEstimate < 40) next = Math.max(0.4, r.heavyScale * 0.85);
      else if (pl.fpsEstimate > 55) next = Math.min(max, r.heavyScale * 1.08);
      if (Math.abs(next - r.heavyScale) > 0.01) { r.heavyScale = next; pl.invalidate(); }
    }, 400);
    this.unsub = () => { clearInterval(adapt); unsubStore(); unsubPlayer(); liveAudio.stop(); };
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

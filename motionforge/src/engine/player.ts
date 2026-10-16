// Single deterministic timeline clock driving the preview. The frame shown for
// a given time is a pure function of (project, time): playback, scrubbing and
// export all evaluate the same state.
import type { Renderer } from './renderer';
import type { Project } from './types';

type Listener = (t: number, playing: boolean) => void;

export class Player {
  time = 0;
  playing = false;
  loop = true;
  density = 1;
  private project: Project | null = null;
  private raf = 0;
  private last = 0;
  private dirty = true;
  private listeners = new Set<Listener>();
  fpsEstimate = 60;

  constructor(private renderer: Renderer) {
    renderer.onNeedsRedraw = () => this.invalidate();
    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = () => {
    // iOS suspends rAF in background; reset the clock so we don't jump ahead
    if (document.visibilityState === 'visible') {
      this.last = performance.now();
      this.invalidate();
    }
  };

  setProject(p: Project) {
    this.project = p;
    if (this.time > p.duration) this.time = p.duration;
    this.invalidate();
  }

  invalidate() {
    this.dirty = true;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.time, this.playing);
  }

  play() {
    if (!this.project) return;
    if (this.time >= this.project.duration - 1e-3) this.time = 0;
    this.playing = true;
    this.last = performance.now();
    this.emit();
  }

  pause() {
    this.playing = false;
    this.emit();
    this.invalidate();
  }

  toggle() {
    if (this.playing) this.pause(); else this.play();
  }

  seek(t: number) {
    if (!this.project) return;
    this.time = Math.max(0, Math.min(this.project.duration, t));
    this.invalidate();
    this.emit();
  }

  restart() {
    this.seek(0);
    this.play();
  }

  /** Snap time to the frame grid so preview matches exported frames exactly. */
  private frameTime(t: number) {
    const fps = this.project?.fps ?? 30;
    return Math.round(t * fps) / fps;
  }

  private tick(now: number) {
    this.raf = requestAnimationFrame(this.tick);
    const p = this.project;
    if (!p) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (dt > 0) this.fpsEstimate = this.fpsEstimate * 0.95 + (1 / dt) * 0.05;
    if (this.playing) {
      this.time += dt;
      if (this.time >= p.duration) {
        if (this.loop) this.time = this.time % p.duration;
        else { this.time = p.duration; this.playing = false; }
      }
      this.dirty = true;
      this.emit();
    }
    if (this.dirty || (this.renderer.pointer && this.hasInteractive(p))) {
      this.dirty = false;
      this.renderer.render(p, this.playing ? this.time : this.frameTime(this.time), { density: this.density, dt: this.playing ? dt : 1 / p.fps });
    }
  }

  private hasInteractive(p: Project) {
    return p.layers.some((l) => (l.type === 'particles' && l.interactive) || (l.type === 'shader' && l.source.includes('u_mouse') && /u_mouse\s*[.,);*+\-/]/.test(l.source.split('void main')[1] ?? '')));
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.listeners.clear();
  }
}

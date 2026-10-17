// Host for Canvas 2D motion scenes (SceneDef.create2d): same deterministic
// FrameState contract as the Three.js scenes, drawn into an offscreen canvas
// and composited with the layer's transform and opacity.
import type { Project, SceneLayer } from './types';
import type { Env2D } from './draw2d';
import { sceneById } from './scenes3d';
import { sceneDefaults, type Scene2DInstance } from './scene3d';

interface Entry { id: string; inst: Scene2DInstance; ready: boolean; error?: string; wait: Promise<void> }

export class Scene2DHost {
  private scenes = new Map<string, Entry>();
  private canvas = document.createElement('canvas');
  constructor(private onReady: () => void) {}

  static is(l: SceneLayer) { return !!sceneById(l.scene)?.create2d; }

  private params(l: SceneLayer) {
    const def = sceneById(l.scene);
    return { ...(def ? sceneDefaults(def) : {}), ...l.params };
  }

  private entry(l: SceneLayer) {
    const old = this.scenes.get(l.id);
    if (old && old.id === l.scene) return old;
    if (old) { old.inst.dispose(); this.scenes.delete(l.id); }
    const def = sceneById(l.scene);
    if (!def?.create2d) return null;
    const inst = def.create2d({ redraw: () => this.onReady() });
    const e: Entry = { id: l.scene, inst, ready: false, wait: Promise.resolve() };
    e.wait = inst.prepare(this.params(l)).catch((err) => { e.error = String(err?.message ?? err); }).finally(() => { e.ready = true; this.onReady(); });
    this.scenes.set(l.id, e);
    return e;
  }

  async prepare(p: Project) {
    const ls = p.layers.filter((l): l is SceneLayer => l.type === 'scene3d' && Scene2DHost.is(l));
    await Promise.all(ls.map((l) => this.entry(l)?.wait));
    const bad = ls.map((l) => this.scenes.get(l.id)?.error).find(Boolean);
    if (bad) throw new Error(`Scene could not be loaded: ${bad}`);
  }

  draw(ctx: CanvasRenderingContext2D, l: SceneLayer, env: Env2D) {
    const e = this.entry(l);
    if (!e) return;
    if (!e.ready || e.error) {
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = `${Math.round(env.H * 0.025)}px Inter, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(e.error ? `Scene error: ${e.error}` : 'Preparing scene…', env.W / 2, env.H / 2); ctx.restore();
      return;
    }
    const { W, H } = env;
    const c = this.canvas;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const x = c.getContext('2d')!;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
    x.clearRect(0, 0, W, H);
    const span = Math.max(1e-3, l.end - l.start);
    x.save();
    e.inst.draw(x, { p: Math.max(0, Math.min(1, (env.t - l.start) / span)), t: Math.max(0, env.t - l.start), W, H, params: this.params(l), dur: span });
    x.restore();
    ctx.save();
    ctx.translate(l.x * W, l.y * H);
    ctx.rotate((l.rotation * Math.PI) / 180);
    ctx.scale(l.scale, l.scale);
    ctx.drawImage(c, -W / 2, -H / 2, W, H);
    ctx.restore();
  }

  dispose() { for (const e of this.scenes.values()) e.inst.dispose(); this.scenes.clear(); }
}

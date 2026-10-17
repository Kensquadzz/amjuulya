// Gallery thumbnails: templates and effects are rendered with the real engine
// (one shared off-screen renderer, one job at a time) and cached on device.
import { Renderer } from '../engine/renderer';
import { cssFont } from '../engine/text';
import { projectFromTemplate, TEMPLATES } from '../engine/templates';
import { TEMPLATE_INFO } from '../engine/templateInfo';
import { makeBackground, makeShader, makeText, newProject } from '../engine/project';
import { shaderById } from '../engine/shaders/library';
import { storage } from '../engine/storage';
import type { AspectId, Project } from '../engine/types';

const VERSION = "v4";
const W = 216, H = 384;
let renderer: Renderer | null = null;
const memory = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
let chain: Promise<unknown> = Promise.resolve();

function getRenderer() {
  if (!renderer) {
    const c = document.createElement('canvas');
    renderer = new Renderer(c, { preserveDrawingBuffer: true });
    renderer.placeholders = true;
  }
  return renderer;
}

async function loadFonts(p: Project) {
  if (!document.fonts) return;
  await Promise.all(p.layers.filter((l) => l.type === 'text').map((l) => document.fonts.load(cssFont(l as any, 64), (l as any).text || 'A').catch(() => {})));
}

function renderJob(key: string, build: () => { project: Project; t: number; w: number; h: number }): Promise<string> {
  const hit = memory.get(key);
  if (hit) return Promise.resolve(hit);
  const p = pending.get(key);
  if (p) return p;
  const job = (async () => {
    try {
      const cached = await storage.getMeta<string>(`thumb:${key}`);
      if (cached) { memory.set(key, cached); return cached; }
    } catch { /* no storage */ }
    // serialise renders: one GL renderer, one frame at a time, yielding between jobs
    const run = chain.then(async () => {
      const { project, t, w, h } = build();
      await loadFonts(project);
      const r = getRenderer();
      r.setSize(w, h);
      r.render(project, t, { density: 0.8 });
      const url = (r.canvas as HTMLCanvasElement).toDataURL('image/jpeg', 0.82);
      await new Promise((res) => setTimeout(res, 16));
      return url;
    });
    chain = run.catch(() => {});
    const url = await run;
    memory.set(key, url);
    storage.setMeta(`thumb:${key}`, url).catch(() => {});
    return url;
  })();
  pending.set(key, job);
  job.finally(() => pending.delete(key));
  return job;
}

const sizeFor = (aspect: AspectId) => (aspect === '16:9' ? { w: H, h: W } : aspect === '1:1' ? { w: W * 1.4, h: W * 1.4 } : aspect === '4:5' ? { w: W * 1.2, h: W * 1.5 } : { w: W, h: H });

export function heroTime(templateId: string, duration: number) {
  return Math.min(duration - 0.05, TEMPLATE_INFO[templateId]?.at ?? duration * 0.55);
}

export function templateThumb(id: string, aspect: AspectId = '9:16') {
  return renderJob(`tpl:${id}:${aspect}:${VERSION}`, () => {
    const tpl = TEMPLATES.find((t) => t.id === id)!;
    const project = projectFromTemplate(tpl, aspect);
    return { project, t: heroTime(id, project.duration), ...sizeFor(aspect) };
  });
}

/** Effect thumbnail: generators alone, filters over a sample composition. */
export function effectThumb(shaderId: string) {
  return renderJob(`fx:${shaderId}:${VERSION}`, () => {
    const def = shaderById(shaderId)!;
    const p = newProject('fx', { aspect: '1:1', duration: 4 });
    if (def.kind === 'filter') {
      p.layers.push(
        makeBackground(4, { mode: 'linear', colorA: '#1b2a6b', colorB: '#c2335a', angle: 120 }),
        makeText(4, { text: 'MOTION', fontFamily: 'Inter', fontWeight: 900, fontSize: 230, color: '#ffffff', anim: { preset: 'none' } as any }),
      );
    }
    p.layers.push(makeShader(4, shaderId));
    return { project: p, t: 1.7, w: 160, h: 160 };
  });
}

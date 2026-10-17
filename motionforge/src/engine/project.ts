// Layer factories and project helpers.
import { uid } from './util';
import { presetById } from './text';
import { shaderById, BLANK_SHADER } from './shaders/library';
import { defaultParams } from './shaderParams';
import { LEGACY_SHADERS, fingerprint } from './shaders/legacy';
import { sceneById } from './scenes3d';
import { sceneDefaults } from './scene3d';
import type {
  BackgroundLayer, ImageLayer, Layer, LayerBase, LayerType, ModelLayer, ParticleLayer, Project, SceneLayer, ShaderLayer, ShapeLayer, TextAnim, TextLayer, TextPresetId,
} from './types';

const base = <T extends LayerType>(type: T, name: string, duration: number): LayerBase & { type: T } => ({
  id: uid(), name, type, visible: true, start: 0, end: duration, opacity: 1, x: 0.5, y: 0.5, scale: 1, rotation: 0, blend: 'normal', tracks: {},
});

export function animFor(preset: TextPresetId, prev?: TextAnim): TextAnim {
  const d = presetById(preset).defaults;
  return {
    preset,
    unit: d.unit ?? 'char',
    delay: prev?.delay ?? 0.3,
    duration: d.duration ?? 0.8,
    stagger: d.stagger ?? 0.04,
    ease: d.ease ?? 'easeOutCubic',
    bezier: prev?.bezier ?? [0.22, 1, 0.36, 1],
    direction: d.direction ?? 'up',
    intensity: d.intensity ?? 1,
    order: d.order ?? 'forward',
    out: prev?.out ?? { enabled: false, duration: 0.6, stagger: 0.02 },
  };
}

export function makeText(duration: number, patch: Partial<TextLayer> = {}): TextLayer {
  const preset = patch.anim?.preset ?? 'smooth';
  const def = presetById(preset);
  const defaultCursor: TextLayer['cursor'] = {
    enabled: !!def.cursor, mode: def.cursor?.mode ?? 'cursor', color: '#ffffff', width: 6, height: 1.05, glow: def.cursor?.glow ?? 0,
    blink: 1.6, travel: 1.4, delay: 0.3,
  };
  const l: TextLayer = {
    ...base('text', 'Text', duration),
    text: 'MOTIONFORGE',
    fontFamily: 'Inter',
    fontWeight: 600,
    italic: false,
    uppercase: false,
    fontSize: 120,
    letterSpacing: 0.02,
    lineHeight: 1.1,
    align: 'center',
    color: '#ffffff',
    blur: 0,
    glow: 0,
    glowColor: '#ffffff',
    anim: animFor(preset),
    cursor: defaultCursor,
    ...patch,
  };
  if (patch.anim) l.anim = { ...animFor(preset), ...patch.anim };
  if (patch.cursor) l.cursor = { ...defaultCursor, ...patch.cursor };
  if (!patch.name) l.name = l.text.split('\n')[0].slice(0, 24) || 'Text';
  return l;
}

export function makeShape(duration: number, patch: Partial<ShapeLayer> = {}): ShapeLayer {
  return {
    ...base('shape', 'Shape', duration),
    shape: 'rect', w: 400, h: 400, fill: '#ffffff', fillOn: false, stroke: '#ffffff', strokeWidth: 3, radius: 0, glow: 0, draw: 1,
    ...patch,
  };
}

export function makeImage(duration: number, src: string, patch: Partial<ImageLayer> = {}): ImageLayer {
  return { ...base('image', 'Image', duration), src, w: 700, blur: 0, ...patch };
}

export function makeBackground(duration: number, patch: Partial<BackgroundLayer> = {}): BackgroundLayer {
  return { ...base('background', 'Background', duration), mode: 'solid', colorA: '#0b0b0d', colorB: '#1d1d24', angle: 90, ...patch };
}

export function makeParticles(duration: number, patch: Partial<ParticleLayer> = {}): ParticleLayer {
  return {
    ...base('particles', 'Particles', duration),
    count: 160, size: 4, speed: 40, direction: 90, spread: 60, noise: 30, glow: 1.2, colorA: '#7a5cff', colorB: '#22e1ff',
    connect: 0, connectOpacity: 0.35, twinkle: 0.4, seed: Math.floor(Math.random() * 1000), interactive: true,
    ...patch,
  };
}

export function makeShader(duration: number, shaderId: string, patch: Partial<ShaderLayer> = {}): ShaderLayer {
  const def = shaderById(shaderId);
  const source = def?.source ?? BLANK_SHADER;
  return {
    ...base('shader', def?.name ?? 'Custom Shader', duration),
    shaderName: def?.name ?? 'Custom Shader',
    source,
    blend: def?.blend ?? 'normal',
    ...patch,
    params: { ...defaultParams(source), ...(def?.params ?? {}), ...(patch.params ?? {}) },
  };
}

export function makeModel(duration: number, patch: Partial<ModelLayer> = {}): ModelLayer {
  return {
    ...base('model3d', '3D model', duration),
    src: '', primitive: 'phone', texture: '',
    materialOverride: false, color: '#c9ced6', metalness: 0.9, roughness: 0.25,
    orbit: 25, elevation: 12, distance: 0.92, fov: 32,
    rotY: 0, tiltX: 0, spin: 20, float: 0.5,
    env: 'studio', light: 1, lightColor: '#fff4e8', exposure: 1, shadow: 0.55,
    clip: 0, clipSpeed: 1,
    ...patch,
  };
}

export function makeScene3D(duration: number, sceneId: string, patch: Partial<SceneLayer> = {}): SceneLayer {
  const def = sceneById(sceneId);
  return {
    ...base('scene3d', def?.name ?? '3D scene', duration),
    scene: sceneId,
    ...patch,
    params: { ...(def ? sceneDefaults(def) : {}), ...(patch.params ?? {}) },
  };
}

export function makeLayer(type: LayerType, duration: number): Layer {
  switch (type) {
    case 'text': return makeText(duration);
    case 'shape': return makeShape(duration);
    case 'image': return makeImage(duration, '');
    case 'background': return makeBackground(duration);
    case 'particles': return makeParticles(duration);
    case 'shader': return makeShader(duration, 'custom');
    case 'model3d': return makeModel(duration);
    case 'scene3d': return makeScene3D(duration, 'productOrbit');
  }
}

export function newProject(name = 'Untitled', patch: Partial<Project> = {}): Project {
  const now = Date.now();
  return {
    id: uid(), name, version: 1, aspect: '9:16', duration: 6, fps: 30, background: '#000000', layers: [], audio: [], createdAt: now, updatedAt: now,
    ...patch,
  };
}

/** Defensive normalisation for imported / older project JSON. */
export function normalizeProject(raw: any): Project {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.layers)) throw new Error('Not a MOTIONFORGE project file (missing "layers").');
  const p = newProject(String(raw.name ?? 'Imported'), {});
  const out: Project = {
    ...p,
    ...raw,
    id: typeof raw.id === 'string' ? raw.id : p.id,
    version: 1,
    aspect: ['9:16', '16:9', '1:1', '4:5'].includes(raw.aspect) ? raw.aspect : '9:16',
    duration: Math.max(0.5, Math.min(120, Number(raw.duration) || 6)),
    fps: [24, 25, 30, 50, 60].includes(Number(raw.fps)) ? Number(raw.fps) : 30,
    background: typeof raw.background === 'string' ? raw.background : '#000000',
  };
  out.audio = Array.isArray(raw.audio)
    ? raw.audio
        .filter((c: any) => c && typeof c.assetId === 'string' && Number.isFinite(c.start) && Number.isFinite(c.duration))
        .map((c: any) => ({ id: typeof c.id === 'string' ? c.id : uid(), name: String(c.name ?? 'Audio'), assetId: c.assetId, start: +c.start, offset: +c.offset || 0, duration: +c.duration, volume: Number.isFinite(+c.volume) ? +c.volume : 1, fadeIn: +c.fadeIn || 0, fadeOut: +c.fadeOut || 0, muted: !!c.muted }))
    : [];
  delete (out as any)._assets;
  out.layers = raw.layers
    .filter((l: any) => l && typeof l === 'object' && typeof l.type === 'string')
    .map((l: any) => {
      const dflt = makeLayer(l.type, out.duration) as any;
      const merged = { ...dflt, ...l, id: typeof l.id === 'string' ? l.id : uid(), tracks: l.tracks && typeof l.tracks === 'object' ? l.tracks : {} };
      if (l.type === 'text') {
        merged.anim = { ...dflt.anim, ...(l.anim ?? {}), out: { ...dflt.anim.out, ...(l.anim?.out ?? {}) } };
        merged.cursor = { ...dflt.cursor, ...(l.cursor ?? {}) };
      }
      if (l.type === 'scene3d') {
        const def = sceneById(merged.scene);
        merged.params = { ...(def ? sceneDefaults(def) : {}), ...(l.params ?? {}) };
      }
      if (l.type === 'shader') {
        // an unedited copy of an older built-in shader picks up the current
        // version (quality fixes); edited sources never match and stay as-is
        const id = typeof merged.source === 'string' ? LEGACY_SHADERS[fingerprint(merged.source)] : undefined;
        const def = id ? shaderById(id) : undefined;
        if (def) {
          if (merged.draft === merged.source) delete merged.draft;
          merged.source = def.source;
        }
        merged.params = { ...defaultParams(merged.source), ...(l.params ?? {}) };
      }
      return merged as Layer;
    });
  return out;
}

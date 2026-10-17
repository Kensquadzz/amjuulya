// "Neon / Glass" promo templates: dark backdrops, glowing glass gradient
// card, colour-cycling neon search bar with typed text, converging orb ring,
// floating glass app-icon tiles, a glowing tile, and a rising planet with a
// lens flare. Each scene ships with matching procedural sound design.
import { uid } from './util';
import { makeShader, makeShape, makeText } from './project';
import { sfxById, userSfx } from './sfx';
import type { AudioClip, EasingId, IconId, Keyframe, KfValue, Layer, ShapeLayer, TextLayer } from './types';
import type { Template } from './templates';

const kf = (t: number, v: KfValue, ease: EasingId = 'easeInOutCubic'): Keyframe => ({ id: uid(), t, v, ease });

function sfx(name: string, start: number, patch: Partial<AudioClip> = {}): AudioClip {
  const [id, peak] = userSfx(name);
  start -= peak;
  const p = sfxById(id);
  return { id: uid(), name: p?.label ?? id, assetId: `sfx:${id}`, start: Math.max(0, start), offset: 0, duration: p?.duration ?? 1, volume: 0.85, fadeIn: 0, fadeOut: 0, ...patch };
}

interface Scene { layers: Layer[]; audio: AudioClip[] }
type Span = { start: number; end: number };

const label = (d: number, s: Span, text: string, o: Partial<TextLayer> = {}) =>
  makeText(d, {
    ...s, text, fontFamily: 'Inter', fontWeight: 500, fontSize: 56, letterSpacing: -0.01, color: '#ffffff',
    anim: { preset: 'fadeRise', unit: 'char', stagger: 0.03, duration: 0.6, delay: 0.1, out: { enabled: true, duration: 0.3, stagger: 0.01 } } as any,
    ...o,
  });

// ---------------------------------------------------------------- scenes

/** 1 — brand name, then a glass gradient card rises behind it. */
function sceneCard(d: number, t0: number, brand: string, len = 2.6): Scene {
  const s = { start: t0, end: t0 + len };
  const rise = t0 + 0.8;
  return {
    layers: [
      makeShader(d, 'aurora', { ...s, name: 'Colour bleed', params: { u_intensity: 0.5, u_colorA: '#ff5a2b', u_colorB: '#d42d8f', u_colorC: '#3a2dff' } as any,
        tracks: { 'params.u_intensity': [kf(t0, 0, 'easeOutCubic'), kf(rise + 0.6, 0.55)] } }),
      label(d, { start: t0, end: rise + 0.15 }, brand, { name: 'Brand (intro)', color: '#ff6a3a', fontWeight: 600, fontSize: 60, y: 0.45,
        anim: { preset: 'typePop', delay: 0.15, out: { enabled: true, duration: 0.2, stagger: 0 } } as any }),
      makeShader(d, 'glassCard', {
        ...s, name: 'Glass card',
        tracks: {
          'params.u_y': [kf(rise, 1.25, 'easeOutExpo'), kf(rise + 0.9, 0.47, 'easeInOut'), kf(s.end - 0.35, 0.45, 'easeIn'), kf(s.end, 0.2)],
          'params.u_scale': [kf(rise, 0.8, 'easeOutExpo'), kf(rise + 0.9, 1, 'easeInOut'), kf(s.end - 0.35, 1.02, 'easeIn'), kf(s.end, 1.9)],
          'params.u_alpha': [kf(s.end - 0.3, 1, 'easeIn'), kf(s.end, 0)],
        },
      }),
      label(d, { start: rise + 0.35, end: s.end }, brand, { name: 'Brand (card)', fontWeight: 600, fontSize: 70, y: 0.355, x: 0.2, anchor: 'left', align: 'left',
        anim: { preset: 'blurReveal', unit: 'all', delay: 0, duration: 0.6, out: { enabled: true, duration: 0.25, stagger: 0 } } as any }),
    ],
    audio: [sfx('deepWhoosh', rise - 0.55, { volume: 0.8 }), sfx('softHit', rise + 0.45, { volume: 0.7 }), sfx('whooshFast', s.end - 0.35, { volume: 0.6 })],
  };
}

/** 2 — neon search bar typing a sequence of phrases (with backspace out). */
function sceneSearch(d: number, t0: number, phrases: string[], len = 3.8): Scene {
  const s = { start: t0, end: t0 + len };
  const pop = [kf(t0, 0.55, 'easeOutBack'), kf(t0 + 0.45, 1)];
  const per = (len - 0.4) / phrases.length;
  const layers: Layer[] = [
    makeShader(d, 'neonPill', { ...s, name: 'Neon search bar', tracks: { 'params.u_scale': pop, 'params.u_alpha': [kf(t0, 0, 'easeOutCubic'), kf(t0 + 0.25, 1), kf(s.end - 0.15, 1, 'easeIn'), kf(s.end, 0)] } }),
    makeShape(d, { ...s, name: 'Search icon', shape: 'search', w: 50, h: 50, x: 0.775, y: 0.45, stroke: '#ffffff', strokeWidth: 4.5, glow: 10, tracks: { scale: pop.map((k) => ({ ...k, id: uid() })) } }),
  ];
  const audio: AudioClip[] = [sfx('swipe', t0, { volume: 0.7 }), sfx('blip', t0 + 0.2, { volume: 0.6 })];
  phrases.forEach((ph, i) => {
    const a = t0 + 0.35 + i * per;
    const typeDur = ph.length * 0.06;
    layers.push(makeText(d, {
      start: a, end: a + per - 0.02, name: `Search text ${i + 1}`, text: ph, fontFamily: 'Inter', fontWeight: 500, fontSize: 40, color: '#ecebff',
      x: 0.205, anchor: 'left', align: 'left', y: 0.452,
      anim: { preset: 'typewriter', unit: 'char', delay: 0.05, duration: 0.02, stagger: 0.06, out: { enabled: i < phrases.length - 1, duration: 0.02, stagger: 0.02 } } as any,
      cursor: { enabled: true, mode: 'cursor', color: '#ffffff', width: 3, height: 1.05, glow: 8, blink: 2 } as any,
    }));
    audio.push(sfx('typing', a + 0.05, { duration: Math.min(2, typeDur + 0.05), volume: 0.55, fadeOut: 0.05 }));
  });
  audio.push(sfx('whooshFast', s.end - 0.3, { volume: 0.6 }));
  return { layers, audio };
}

/** 3 — orbs spiral into the centre. */
function sceneOrbs(d: number, t0: number, len = 0.9): Scene {
  const s = { start: t0, end: t0 + len };
  return {
    layers: [makeShader(d, 'orbRing', {
      ...s, name: 'Orb ring',
      tracks: {
        'params.u_radius': [kf(t0, 0.32, 'easeIn'), kf(s.end, 0.0)],
        'params.u_speed': [kf(t0, 1.5, 'easeIn'), kf(s.end, 6)],
        'params.u_alpha': [kf(t0, 0, 'easeOut'), kf(t0 + 0.15, 1)],
      },
    })],
    audio: [sfx('reverseSwell', t0 - 0.7, { volume: 0.7 }), sfx('pop', s.end - 0.05, { volume: 0.8 })],
  };
}

const TILE_ICONS: { icon: IconId; x: number; y: number; w: number; c1: string; c2: string; rot: number }[] = [
  { icon: 'image', x: 0.3, y: 0.2, w: 230, c1: '#2dffb0', c2: '#3a7bff', rot: -6 },
  { icon: 'eye', x: 0.82, y: 0.3, w: 200, c1: '#3ad8ff', c2: '#ffffff', rot: 8 },
  { icon: 'music', x: 0.12, y: 0.42, w: 170, c1: '#ffb12d', c2: '#ff4fd8', rot: -10 },
  { icon: 'sparkle', x: 0.2, y: 0.68, w: 190, c1: '#b34dff', c2: '#3ad8ff', rot: 6 },
  { icon: 'wave', x: 0.5, y: 0.8, w: 210, c1: '#ff7a2b', c2: '#ff3d9a', rot: -4 },
  { icon: 'search', x: 0.78, y: 0.66, w: 200, c1: '#3dffa8', c2: '#2d8bff', rot: 10 },
  { icon: 'diamond', x: 0.82, y: 0.88, w: 160, c1: '#ff4fd8', c2: '#ff9a2d', rot: -8 },
  { icon: 'flower', x: 0.62, y: 0.16, w: 160, c1: '#9a6bff', c2: '#ff79e1', rot: 4 },
];

/** 4 — floating glass app tiles around two lines of text. */
function sceneTiles(d: number, t0: number, words: [string, string], len = 2.7): Scene {
  const s = { start: t0, end: t0 + len };
  const half = t0 + len / 2;
  const tiles: ShapeLayer[] = TILE_ICONS.map((ti, i) => {
    const a = t0 + 0.05 + i * 0.07;
    return makeShape(d, {
      ...s, name: `Glass tile ${i + 1}`, shape: 'glassTile', icon: ti.icon, w: ti.w, h: ti.w, radius: ti.w * 0.24, x: ti.x, y: ti.y,
      fill: '#14141c', stroke: ti.c1, stroke2: ti.c2, strokeWidth: 2.5, glow: 30,
      tracks: {
        scale: [kf(a, 0, 'easeOutBack'), kf(a + 0.45, 1, 'linear'), kf(s.end - 0.35, 1.06, 'easeIn'), kf(s.end, 0)],
        rotation: [kf(a, ti.rot * 3, 'easeOutCubic'), kf(a + 0.6, ti.rot, 'linear'), kf(s.end, ti.rot * 0.4)],
        y: [kf(a, ti.y + 0.04, 'easeOutCubic'), kf(a + 0.6, ti.y, 'linear'), kf(s.end, ti.y - 0.03)],
      },
    });
  });
  return {
    layers: [
      makeShader(d, 'aurora', { ...s, name: 'Dark wash', params: { u_intensity: 0.22, u_colorA: '#3a2dff', u_colorB: '#7a2dff', u_colorC: '#1a6bff' } as any }),
      ...tiles,
      label(d, { start: t0 + 0.15, end: half }, words[0], { name: 'Word 1', y: 0.5, color: '#d9d9e8', fontSize: 60 }),
      label(d, { start: half, end: s.end }, words[1], { name: 'Word 2', y: 0.5, color: '#d9d9e8', fontSize: 60 }),
    ],
    audio: [sfx('blipSequence', t0 + 0.05, { volume: 0.7 }), sfx('whoosh', half - 0.35, { volume: 0.55 }), sfx('swipe', s.end - 0.3, { volume: 0.6 })],
  };
}

/** 5 — one glowing tile that charges up and turns into an arrow. */
function sceneGlowTile(d: number, t0: number, len = 1.6): Scene {
  const s = { start: t0, end: t0 + len };
  const swap = t0 + len * 0.62;
  const base = { shape: 'glassTile' as const, w: 300, h: 300, radius: 74, x: 0.5, y: 0.5, fill: '#14141c', strokeWidth: 3 };
  return {
    layers: [
      makeShape(d, { ...base, start: t0, end: swap + 0.15, name: 'Tile (dots)', icon: 'dots', stroke: '#ff8a2b', stroke2: '#ffcf6b', glow: 20,
        tracks: {
          scale: [kf(t0, 0.4, 'easeOutBack'), kf(t0 + 0.4, 1)],
          glow: [kf(t0 + 0.3, 20, 'easeIn'), kf(swap, 110)],
          stroke: [kf(t0 + 0.3, '#ff8a2b', 'easeInOut'), kf(swap, '#5a5cff')],
          opacity: [kf(swap, 1, 'easeIn'), kf(swap + 0.15, 0)],
        } }),
      makeShape(d, { ...base, start: swap, end: s.end, name: 'Tile (arrow)', icon: 'arrow', stroke: '#7a5cff', stroke2: '#c9b8ff', glow: 60,
        tracks: { scale: [kf(swap, 1.12, 'easeOutBack'), kf(swap + 0.3, 1)], y: [kf(s.end - 0.3, 0.5, 'easeIn'), kf(s.end, 0.42)] } }),
    ],
    audio: [sfx('softHit', t0, { volume: 0.6 }), sfx('sparkle', swap - 0.1, { volume: 0.7 }), sfx('riser', s.end - 2.4, { volume: 0.55 })],
  };
}

/** 6 — planet rises, flare blooms, closing line types on. */
function scenePlanet(d: number, t0: number, line: string, len = 3.4): Scene {
  const s = { start: t0, end: t0 + len };
  const flare = t0 + 0.75;
  return {
    layers: [
      makeShader(d, 'planet', { ...s, name: 'Planet horizon', tracks: { 'params.u_rise': [kf(t0, 0, 'easeOutCubic'), kf(t0 + 1.3, 0.93, 'linear'), kf(s.end, 0.97)] } }),
      makeShader(d, 'flare', { ...s, name: 'Lens flare', params: { u_y: 0.37, u_size: 0.32 } as any,
        tracks: { 'params.u_intensity': [kf(flare - 0.2, 0, 'easeOutExpo'), kf(flare, 1.8, 'easeOutCubic'), kf(flare + 0.9, 0.0)], 'params.u_rot': [kf(flare - 0.2, 0.1, 'linear'), kf(flare + 1, 0.5)] } }),
      label(d, { start: flare, end: s.end }, line, { name: 'Closing line', y: 0.29, fontSize: 64, fontWeight: 500, anim: { preset: 'typePop', delay: 0.1, out: { enabled: false, duration: 0.3, stagger: 0 } } as any }),
    ],
    audio: [sfx('impact', flare - 0.02, { volume: 0.85 }), sfx('shimmer', flare + 0.05, { volume: 0.6 })],
  };
}

const merge = (...sc: Scene[]): Scene => ({ layers: sc.flatMap((x) => x.layers), audio: sc.flatMap((x) => x.audio) });
const finish = (sc: Scene, d: number) => ({
  ...sc,
  layers: [...sc.layers, makeShader(d, 'bloom', { name: 'Glow', params: { u_threshold: 0.55, u_radius: 20, u_intensity: 0.55, u_tint: '#ffffff' } as any })],
});

// ---------------------------------------------------------------- templates

function neonPromo() {
  const d = 15;
  const sc = merge(
    sceneCard(d, 0, 'YourBrand'),
    sceneSearch(d, 2.6, ['A Cool Template', 'Logo Reveal', 'Anime Transition']),
    sceneOrbs(d, 6.4),
    sceneTiles(d, 7.3, ['Any case', 'Any Need']),
    sceneGlowTile(d, 10.0),
    scenePlanet(d, 11.6, 'Keep Moving'),
  );
  sc.audio.push(
    sfx('padDark', 0, { volume: 0.55, duration: 12, fadeIn: 0.8, fadeOut: 2 }),
    sfx('padBright', 10.6, { volume: 0.5, duration: 4.4, fadeIn: 1.2, fadeOut: 1.2 }),
  );
  return { background: '#050507', duration: d, ...finish(sc, d) };
}

const single = (d: number, sc: Scene, pad = true) => {
  if (pad) sc.audio.push(sfx('padDark', 0, { volume: 0.45, duration: d, fadeIn: 0.5, fadeOut: 1 }));
  return { background: '#050507', duration: d, ...finish(sc, d) };
};

export const NEON_TEMPLATES: Template[] = [
  { id: 'neon-promo', name: 'Neon Promo (15s, 6 scenes, with SFX)', categories: ['Reels', 'Glow', 'Light effects'], swatch: ['#0a0614', '#7a5cff'], build: neonPromo },
  { id: 'neon-card', name: 'Glass Logo Reveal', categories: ['Reels', 'Glow'], swatch: ['#1a0a10', '#ff6a3a'], build: () => single(4, sceneCard(4, 0, 'YourBrand', 4)) },
  { id: 'neon-search', name: 'Neon Search Bar', categories: ['Reels', 'Glow'], swatch: ['#06060c', '#29c8ff'], build: () => single(5, sceneSearch(5, 0, ['Your idea here', 'Search anything'], 5)) },
  { id: 'neon-tiles', name: 'Floating Glass Icons', categories: ['Reels', 'Glow', 'Kinetic type'], swatch: ['#0a0a14', '#ff4fd8'], build: () => single(4, sceneTiles(4, 0, ['Every tool', 'One app'], 4)) },
  { id: 'neon-planet', name: 'Planet Horizon Outro', categories: ['Reels', 'Light effects'], swatch: ['#050510', '#8a3dff'], build: () => {
    const sc = merge(sceneGlowTile(5, 0, 1.6), scenePlanet(5, 1.6, 'Keep Moving', 3.4));
    return single(5, sc);
  } },
];

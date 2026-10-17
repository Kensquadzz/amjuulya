// Ready-made motion templates. Every template is an ordinary, fully editable
// project: real layers, real animation parameters, real keyframes.
import { uid } from './util';
import { makeBackground, makeParticles, makeShader, makeShape, makeText, newProject } from './project';
import type { AspectId, EasingId, Keyframe, KfValue, Layer, Project } from './types';

export type TemplateCategory =
  | 'Typography' | 'Text reveal' | 'Minimal' | 'Kinetic type' | 'Glitch' | 'Glow' | 'Particles' | 'Grid' | 'Distortion' | 'Light effects' | 'Shader effects';

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  'Typography', 'Text reveal', 'Minimal', 'Kinetic type', 'Glitch', 'Glow', 'Particles', 'Grid', 'Distortion', 'Light effects', 'Shader effects',
];

export interface Template {
  id: string;
  name: string;
  categories: TemplateCategory[];
  swatch: [string, string];
  build: () => { background: string; duration: number; layers: Layer[] };
}

const kf = (t: number, v: KfValue, ease: EasingId = 'easeInOutCubic'): Keyframe => ({ id: uid(), t, v, ease });

const D = 6;

export const TEMPLATES: Template[] = [
  {
    id: 'minimal-white', name: 'Minimal White Typography', categories: ['Typography', 'Minimal'], swatch: ['#f4f3ef', '#111111'],
    build: () => ({
      background: '#f4f3ef', duration: D,
      layers: [
        makeShape(D, { name: 'Rule', shape: 'line', w: 520, h: 0, stroke: '#111111', strokeWidth: 2, y: 0.555, tracks: { draw: [kf(0.9, 0, 'easeInOutExpo'), kf(2.0, 1)] }, draw: 0 }),
        makeText(D, { text: 'Less, but better.', fontFamily: 'Inter', fontWeight: 300, fontSize: 104, letterSpacing: -0.02, color: '#111111', y: 0.48, anim: { preset: 'smooth', delay: 0.2, out: { enabled: true, duration: 0.7, stagger: 0.015 } } as any }),
        makeText(D, { text: 'DESIGN STUDIO — 2026', fontFamily: 'Inter', fontWeight: 500, fontSize: 26, letterSpacing: 0.42, color: '#555555', y: 0.6, anim: { preset: 'fadeRise', unit: 'all', delay: 1.4, out: { enabled: true, duration: 0.5, stagger: 0 } } as any }),
      ],
    }),
  },
  {
    id: 'black-premium', name: 'Black Premium Typography', categories: ['Typography', 'Minimal'], swatch: ['#000000', '#d8c7a3'],
    build: () => ({
      background: '#000000', duration: D,
      layers: [
        makeText(D, { text: 'Premium\nMotion', fontFamily: 'Playfair Display', fontWeight: 400, italic: true, fontSize: 150, lineHeight: 1.0, color: '#efe6d2', y: 0.47, glow: 12, glowColor: '#8a7448', anim: { preset: 'cinematic', delay: 0.2 } as any }),
        makeText(D, { text: 'EST. MMXXVI', fontFamily: 'Inter', fontWeight: 400, fontSize: 24, letterSpacing: 0.6, color: '#a89a7c', y: 0.64, anim: { preset: 'spacing', delay: 1.8 } as any }),
        makeShader(D, 'film', { params: { u_vignette: 0.9, u_grain: 0.07, u_scanlines: 0, u_flicker: 0.02 } }),
      ],
    }),
  },
  {
    id: 'kinetic', name: 'Kinetic Text', categories: ['Kinetic type', 'Typography'], swatch: ['#ff3d2e', '#0d0d0d'],
    build: () => ({
      background: '#0d0d0d', duration: D,
      layers: [
        makeBackground(D, { mode: 'radial', colorA: '#2a0b08', colorB: '#0d0d0d' }),
        makeText(D, {
          text: 'MOVE FAST\nTHINK\nBOLD', fontFamily: 'Bebas Neue', fontWeight: 400, fontSize: 250, lineHeight: 0.9, color: '#ff3d2e', letterSpacing: 0.01,
          anim: { preset: 'kinetic', delay: 0.2, out: { enabled: true, duration: 0.4, stagger: 0.06 } } as any,
          tracks: { scale: [kf(0, 0.94, 'linear'), kf(D, 1.06)], rotation: [kf(0, -2, 'linear'), kf(D, 0)] },
        }),
      ],
    }),
  },
  {
    id: 'spacing-reveal', name: 'Letter Spacing Reveal', categories: ['Text reveal', 'Typography', 'Minimal'], swatch: ['#0a0a0a', '#ffffff'],
    build: () => ({
      background: '#0a0a0a', duration: D,
      layers: [
        makeText(D, { text: 'EXPANSION', fontFamily: 'Inter', fontWeight: 200, fontSize: 118, color: '#ffffff', anim: { preset: 'spacing', delay: 0.3, intensity: 1.2 } as any, tracks: { letterSpacing: [kf(2.5, 0.02, 'linear'), kf(D, 0.1)] } }),
        makeShader(D, 'bloom', { params: { u_threshold: 0.6, u_radius: 22, u_intensity: 0.7, u_tint: '#ffffff' } }),
      ],
    }),
  },
  {
    id: 'cursor-lightbar', name: 'Cursor and Light Bar', categories: ['Text reveal', 'Glow', 'Light effects'], swatch: ['#050505', '#7ff4ff'],
    build: () => ({
      background: '#050505', duration: 7,
      layers: [
        makeText(7, { text: 'CREATE', fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: 170, letterSpacing: 0.08, color: '#ffffff', y: 0.44, anim: { preset: 'lightbar', delay: 0.3, duration: 1.6 } as any, cursor: { enabled: true, mode: 'lightbar', color: '#7ff4ff', width: 7, height: 1.4, glow: 40 } as any }),
        makeText(7, { text: 'with intention', fontFamily: 'JetBrains Mono', fontWeight: 400, fontSize: 50, color: '#bfefff', y: 0.56, anim: { preset: 'typewriter', delay: 2.2 } as any, cursor: { enabled: true, mode: 'cursor', color: '#7ff4ff', width: 4, height: 1.1, glow: 14, blink: 1.6 } as any }),
        makeShader(7, 'bloom', { params: { u_threshold: 0.5, u_radius: 26, u_intensity: 0.9, u_tint: '#bff8ff' } }),
      ],
    }),
  },
  {
    id: 'word-reveal', name: 'Smooth Word Reveal', categories: ['Text reveal', 'Typography'], swatch: ['#121110', '#f2efe9'],
    build: () => ({
      background: '#121110', duration: D,
      layers: [
        makeText(D, { text: 'Ideas become\nmotion.', fontFamily: 'Instrument Serif', fontWeight: 400, fontSize: 150, lineHeight: 1.0, color: '#f2efe9', anim: { preset: 'wordByWord', delay: 0.3, out: { enabled: true, duration: 0.6, stagger: 0.08 } } as any }),
      ],
    }),
  },
  {
    id: 'char-stagger', name: 'Character Stagger', categories: ['Text reveal', 'Kinetic type'], swatch: ['#2b2bff', '#ffffff'],
    build: () => ({
      background: '#1414ff', duration: D,
      layers: [
        makeBackground(D, { mode: 'linear', colorA: '#2b2bff', colorB: '#8a2bff', angle: 120, tracks: { angle: [kf(0, 60, 'linear'), kf(D, 160)] } }),
        makeText(D, { text: 'STAGGER', fontFamily: 'Syne', fontWeight: 800, fontSize: 168, color: '#ffffff', anim: { preset: 'stagger', delay: 0.3, out: { enabled: true, duration: 0.5, stagger: 0.04 } } as any }),
      ],
    }),
  },
  {
    id: 'red-grid', name: 'Red Glow Grid', categories: ['Grid', 'Glow', 'Shader effects'], swatch: ['#050102', '#ff2238'],
    build: () => ({
      background: '#000000', duration: D,
      layers: [
        makeShader(D, 'glowGridRed', { tracks: { 'params.u_lightX': [kf(0, 0.25), kf(3, 0.75), kf(D, 0.25)] } }),
        makeText(D, { text: 'SYSTEM ONLINE', fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: 92, letterSpacing: 0.12, color: '#ffffff', glow: 26, glowColor: '#ff2238', y: 0.38, anim: { preset: 'smooth', delay: 0.4 } as any }),
        makeShader(D, 'bloom', { params: { u_threshold: 0.45, u_radius: 20, u_intensity: 1.0, u_tint: '#ff6070' } }),
      ],
    }),
  },
  {
    id: 'cyan-grid', name: 'Cyan Sci-Fi Grid', categories: ['Grid', 'Shader effects'], swatch: ['#01070a', '#22e8ff'],
    build: () => ({
      background: '#000000', duration: D,
      layers: [
        makeShader(D, 'glowGridCyan', { tracks: { 'params.u_intensity': [kf(0, 0, 'easeOutCubic'), kf(1.2, 1.3)] } }),
        makeText(D, { text: 'NEXT\nFRONTIER', fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 130, lineHeight: 0.95, letterSpacing: 0.06, color: '#e9feff', glow: 30, glowColor: '#22e8ff', y: 0.36, anim: { preset: 'slideBlur', delay: 0.6 } as any }),
      ],
    }),
  },
  {
    id: 'neon-particles', name: 'Neon Particle Field', categories: ['Particles', 'Glow'], swatch: ['#07020f', '#ff3df5'],
    build: () => ({
      background: '#07020f', duration: D,
      layers: [
        makeParticles(D, { count: 140, size: 4, speed: 30, direction: 90, spread: 360, noise: 40, glow: 1.6, colorA: '#ff3df5', colorB: '#3dd8ff', connect: 150, connectOpacity: 0.35, seed: 7 }),
        makeText(D, { text: 'NEON', fontFamily: 'Inter', fontWeight: 800, fontSize: 230, letterSpacing: 0.05, color: '#ffe9fd', glow: 40, glowColor: '#ff3df5', anim: { preset: 'elastic', delay: 0.4 } as any }),
        makeShader(D, 'bloom', { params: { u_threshold: 0.4, u_radius: 24, u_intensity: 1.0, u_tint: '#ff9cf1' } }),
      ],
    }),
  },
  {
    id: 'glitch-intro', name: 'Digital Glitch Intro', categories: ['Glitch', 'Typography'], swatch: ['#000000', '#21e6ff'],
    build: () => ({
      background: '#030303', duration: D,
      layers: [
        makeText(D, { text: 'GLITCH', fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 210, letterSpacing: 0.04, color: '#ffffff', anim: { preset: 'glitch', delay: 0.2 } as any }),
        makeText(D, { text: 'SIGNAL // LOST', fontFamily: 'JetBrains Mono', fontWeight: 400, fontSize: 34, letterSpacing: 0.25, color: '#21e6ff', y: 0.6, anim: { preset: 'typewriter', delay: 1.4 } as any, cursor: { enabled: true, mode: 'cursor', color: '#21e6ff', width: 3, height: 1, glow: 8, blink: 2 } as any }),
        makeShader(D, 'glitch', { tracks: { 'params.u_intensity': [kf(0, 1.6, 'easeOutExpo'), kf(1.2, 0.6)] }, params: { u_frequency: 0.6, u_base: 0.12 } as any }),
        makeShader(D, 'chromatic', { params: { u_amount: 0.6, u_pulse: 0.5, u_speed: 2 } }),
      ],
    }),
  },
  {
    id: 'energy-pulse', name: 'Energy Pulse', categories: ['Glow', 'Shader effects'], swatch: ['#000000', '#ff3df5'],
    build: () => ({
      background: '#000000', duration: D,
      layers: [
        makeShader(D, 'pulse'),
        makeText(D, { text: 'ENERGY', fontFamily: 'Syne', fontWeight: 700, fontSize: 160, letterSpacing: 0.1, color: '#ffffff', glow: 20, glowColor: '#ff3df5', anim: { preset: 'cinematic', delay: 0.2 } as any }),
        makeShader(D, 'bloom', { params: { u_threshold: 0.4, u_radius: 30, u_intensity: 1.0, u_tint: '#ffffff' } }),
      ],
    }),
  },
  {
    id: 'holo', name: 'Holographic Noise', categories: ['Shader effects', 'Light effects'], swatch: ['#8ff7ff', '#ff9cf1'],
    build: () => ({
      background: '#000000', duration: D,
      layers: [
        makeShader(D, 'holo'),
        makeText(D, { text: 'HOLOGRAM', fontFamily: 'Syne', fontWeight: 800, fontSize: 150, color: '#0b0b16', anim: { preset: 'mask', unit: 'char', stagger: 0.04, delay: 0.3 } as any }),
        makeShader(D, 'film', { params: { u_vignette: 0.5, u_grain: 0.05 } }),
      ],
    }),
  },
  {
    id: 'chromatic-wave', name: 'Chromatic Wave', categories: ['Distortion', 'Shader effects'], swatch: ['#1d1b4b', '#ff5a7a'],
    build: () => ({
      background: '#000000', duration: D,
      layers: [
        makeShader(D, 'gradient', { params: { u_colorA: '#0b0a2e', u_colorB: '#ff3d6e', u_colorC: '#22e1ff', u_speed: 0.5 } as any }),
        makeText(D, { text: 'WAVE', fontFamily: 'Inter', fontWeight: 900, fontSize: 280, color: '#ffffff', anim: { preset: 'fadeRise', unit: 'char', stagger: 0.08, delay: 0.3 } as any }),
        makeShader(D, 'distortion', { params: { u_mode: 0, u_amount: 0.45, u_frequency: 10, u_speed: 1.5 } as any }),
        makeShader(D, 'chromatic', { tracks: { 'params.u_amount': [kf(0, 2.2, 'easeOutCubic'), kf(1.5, 0.6), kf(4, 0.6, 'easeIn'), kf(D, 2)] } }),
      ],
    }),
  },
  {
    id: 'radial-burst', name: 'Radial Light Burst', categories: ['Light effects', 'Glow'], swatch: ['#000000', '#ffd27a'],
    build: () => ({
      background: '#000000', duration: D,
      layers: [
        makeShader(D, 'radialLight', { tracks: { 'params.u_intensity': [kf(0, 0, 'easeOutExpo'), kf(1.0, 1.2)] } }),
        makeText(D, { text: 'BURST', fontFamily: 'Inter', fontWeight: 800, fontSize: 200, letterSpacing: 0.04, color: '#1a0a00', anim: { preset: 'elastic', delay: 0.5 } as any, tracks: { scale: [kf(0, 0.9, 'linear'), kf(D, 1.05)] } }),
      ],
    }),
  },
  {
    id: 'hud', name: 'Futuristic HUD Background', categories: ['Grid', 'Shader effects', 'Light effects'], swatch: ['#020a0e', '#2ef2ff'],
    build: () => ({
      background: '#000000', duration: D,
      layers: [
        makeShader(D, 'hud'),
        makeShader(D, 'lines', { opacity: 0.6, params: { u_count: 30, u_colorA: '#2ef2ff', u_colorB: '#ffffff' } as any }),
        makeText(D, { text: 'TARGET ACQUIRED', fontFamily: 'JetBrains Mono', fontWeight: 500, fontSize: 52, letterSpacing: 0.12, color: '#bdfbff', glow: 14, glowColor: '#2ef2ff', y: 0.78, anim: { preset: 'typewriter', delay: 0.6 } as any, cursor: { enabled: true, mode: 'cursor', color: '#2ef2ff', width: 18, height: 1, glow: 12, blink: 2 } as any }),
      ],
    }),
  },
  {
    id: 'scanlines', name: 'Distorted Scanlines', categories: ['Glitch', 'Distortion'], swatch: ['#0c0c0c', '#ff2a55'],
    build: () => ({
      background: '#0c0c0c', duration: D,
      layers: [
        makeBackground(D, { mode: 'radial', colorA: '#3a0a18', colorB: '#050505' }),
        makeText(D, { text: 'BROADCAST', fontFamily: 'Bebas Neue', fontWeight: 400, fontSize: 230, letterSpacing: 0.06, color: '#ffe3ea', glow: 18, glowColor: '#ff2a55', anim: { preset: 'slideBlur', direction: 'left', delay: 0.3 } as any }),
        makeShader(D, 'crt'),
        makeShader(D, 'glitch', { params: { u_intensity: 0.5, u_frequency: 0.35, u_base: 0.03 } as any }),
      ],
    }),
  },
  {
    id: 'gradient-motion', name: 'Minimal Gradient Motion', categories: ['Minimal', 'Shader effects'], swatch: ['#f7d6c9', '#a8b8ff'],
    build: () => ({
      background: '#000000', duration: D,
      layers: [
        makeShader(D, 'gradient', { params: { u_colorA: '#f6efe8', u_colorB: '#f7b9a6', u_colorC: '#a8b8ff', u_speed: 0.25, u_scale: 1.1, u_grain: 0.04 } as any }),
        makeText(D, { text: 'Calm', fontFamily: 'Instrument Serif', fontWeight: 400, fontSize: 240, color: '#1b1b1f', anim: { preset: 'smooth', stagger: 0.12, duration: 1.4, delay: 0.4, out: { enabled: true, duration: 1, stagger: 0.1 } } as any }),
        makeText(D, { text: 'breathe in motion', fontFamily: 'Inter', fontWeight: 400, fontSize: 30, letterSpacing: 0.3, color: '#3a3a44', y: 0.6, anim: { preset: 'fadeRise', unit: 'all', delay: 1.6 } as any }),
      ],
    }),
  },
  {
    id: 'tunnel', name: 'Light Tunnel', categories: ['Light effects', 'Shader effects'], swatch: ['#000000', '#7a5cff'],
    build: () => ({
      background: '#000000', duration: D,
      layers: [
        makeShader(D, 'tunnel', { tracks: { 'params.u_speed': [kf(0, 3, 'easeOutCubic'), kf(2, 0.8)] } }),
        makeText(D, { text: 'WARP', fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 220, color: '#ffffff', glow: 30, glowColor: '#7a5cff', anim: { preset: 'cinematic', delay: 0.6 } as any }),
        makeShader(D, 'bloom', { params: { u_threshold: 0.45, u_radius: 26, u_intensity: 1.1, u_tint: '#c9bcff' } }),
      ],
    }),
  },
  {
    id: 'cinematic', name: 'Cinematic Title Reveal', categories: ['Typography', 'Text reveal', 'Light effects'], swatch: ['#000000', '#e8d9b5'],
    build: () => ({
      background: '#000000', duration: 7,
      layers: [
        makeShader(7, 'lightRays', { opacity: 0.8, params: { u_sourceX: 0.5, u_sourceY: 1.2, u_intensity: 0.5, u_colorA: '#ffe9c4' } as any }),
        makeText(7, {
          text: 'THE LAST\nHORIZON', fontFamily: 'Playfair Display', fontWeight: 500, fontSize: 120, lineHeight: 1.05, letterSpacing: 0.08, color: '#efe3c6', y: 0.47,
          anim: { preset: 'cinematic', delay: 0.3, out: { enabled: true, duration: 1.0, stagger: 0.01 } } as any,
          cursor: { enabled: true, mode: 'sweep', color: '#ffffff', travel: 1.6, delay: 2.8 } as any,
        }),
        makeText(7, { text: 'A FILM BY MOTIONFORGE', fontFamily: 'Inter', fontWeight: 400, fontSize: 24, letterSpacing: 0.5, color: '#8f8570', y: 0.62, anim: { preset: 'fadeRise', unit: 'all', delay: 2.2, out: { enabled: true, duration: 0.8, stagger: 0 } } as any }),
        makeShape(7, { name: 'Letterbox top', shape: 'rect', fillOn: true, fill: '#000000', strokeWidth: 0, w: 4000, h: 260, y: 0, tracks: { h: [kf(0, 900, 'easeInOutExpo'), kf(1.4, 260)] } }),
        makeShape(7, { name: 'Letterbox bottom', shape: 'rect', fillOn: true, fill: '#000000', strokeWidth: 0, w: 4000, h: 260, y: 1, tracks: { h: [kf(0, 900, 'easeInOutExpo'), kf(1.4, 260)] } }),
        makeShader(7, 'film', { params: { u_vignette: 1.0, u_grain: 0.08, u_flicker: 0.04 } }),
      ],
    }),
  },
];

/** Starter project shown on first launch: text animation + glow + a glitch transition. */
export function sampleProject(aspect: AspectId = '9:16'): Project {
  const d = 8;
  const p = newProject('Sample — Motion Reel', { aspect, duration: d, background: '#000000' });
  p.layers = [
    makeShader(d, 'glowGridRed', {
      name: 'Glow grid',
      params: { u_colorA: '#ff2238', u_perspective: 0.8, u_spacing: 80 } as any,
      tracks: { 'params.u_intensity': [kf(0, 0, 'easeOutCubic'), kf(1.5, 1.2)], 'params.u_lightX': [kf(0, 0.3), kf(4, 0.7), kf(8, 0.3)] },
    }),
    makeText(d, {
      name: 'Title', text: 'MOTIONFORGE', fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 96, letterSpacing: 0.04, color: '#ffffff', glow: 24, glowColor: '#ff2238', y: 0.42,
      end: 4.2, anim: { preset: 'spacing', delay: 0.3, intensity: 1, out: { enabled: true, duration: 0.5, stagger: 0.015 } } as any,
    }),
    makeText(d, {
      name: 'Subtitle', text: 'STUDIO', fontFamily: 'Inter', fontWeight: 400, fontSize: 34, letterSpacing: 0.8, color: '#ffb3bb', y: 0.5,
      end: 4.2, anim: { preset: 'lightbar', delay: 1.4, duration: 1.2, out: { enabled: true, duration: 0.4, stagger: 0 } } as any,
      cursor: { enabled: true, mode: 'lightbar', color: '#ff7080', width: 4, height: 1.6, glow: 26 } as any,
    }),
    makeText(d, {
      name: 'Second title', text: 'Typography\nin motion', fontFamily: 'Playfair Display', fontWeight: 500, italic: true, fontSize: 130, lineHeight: 1.0, color: '#ffffff', y: 0.42,
      start: 4.1, end: d, glow: 10, glowColor: '#ff2238', anim: { preset: 'mask', delay: 0.15 } as any,
    }),
    makeShader(d, 'bloom', { name: 'Glow', params: { u_threshold: 0.5, u_radius: 22, u_intensity: 0.9, u_tint: '#ff7a88' } as any }),
    makeShader(d, 'glitch', {
      name: 'Glitch transition',
      params: { u_base: 1, u_frequency: 0.5, u_duration: 0.2 } as any,
      tracks: { 'params.u_intensity': [kf(3.7, 0, 'easeOutExpo'), kf(4.15, 1.4, 'easeIn'), kf(4.6, 0)] },
    }),
  ];
  return p;
}

export function projectFromTemplate(tpl: Template, aspect: AspectId): Project {
  const b = tpl.build();
  return newProject(tpl.name, { aspect, duration: b.duration, background: b.background, layers: b.layers, templateId: tpl.id });
}

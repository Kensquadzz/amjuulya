// Cinematic 3D video templates. Each one is a complete, independent film:
// its own ray-marched world (see shaders/cinematic.ts) with its own camera
// choreography, materials and lighting, plus editable typography, sound
// design and an ending. Timings are fractions of the duration, so every
// template can be built at 10, 15 or 20 seconds (or any length).
import { uid } from './util';
import { makeShader, makeText } from './project';
import { sfxById } from './sfx';
import type { AudioClip, Layer, ShaderLayer, TextLayer } from './types';
import type { Template } from './templates';

type Built = ReturnType<Template['build']>;

function sfx(id: string, start: number, patch: Partial<AudioClip> = {}): AudioClip {
  const p = sfxById(id);
  return { id: uid(), name: p?.label ?? id, assetId: `sfx:${id}`, start: Math.max(0, start), offset: 0, duration: p?.duration ?? 1, volume: 0.8, fadeIn: 0, fadeOut: 0, role: 'sfx', ...patch };
}
const bed = (id: string, d: number, volume = 0.5): AudioClip => sfx(id, 0, { duration: d, volume, fadeIn: 0.8, fadeOut: 1.5, role: 'music' });

/** Text over the 3D world. a/b are fractions of the film. */
function T(d: number, a: number, b: number, text: string, o: Partial<TextLayer> = {}): TextLayer {
  return makeText(d, {
    start: +(a * d).toFixed(3), end: +(b * d).toFixed(3), text,
    fontFamily: 'Inter', fontWeight: 600, fontSize: 54, letterSpacing: 0.02, color: '#ffffff',
    ...o,
    anim: { preset: 'blurReveal', unit: 'all', delay: 0.05, duration: 0.8, stagger: 0.03, intensity: 1, direction: 'up', ...(o.anim ?? {}), out: { enabled: true, duration: 0.45, stagger: 0.02, ...(o.anim?.out ?? {}) } } as any,
  });
}
const kicker = (d: number, a: number, b: number, text: string, o: Partial<TextLayer> = {}) =>
  T(d, a, b, text, { fontSize: 30, fontWeight: 600, letterSpacing: 0.42, uppercase: true, color: '#e8ecf5', ...o, anim: { preset: 'spacing', unit: 'all', duration: 1.1, ...(o.anim ?? {}) } as any });

function world(d: number, id: string, name: string, params: Record<string, number | string> = {}): ShaderLayer {
  return makeShader(d, id, { name, start: 0, end: d, params: params as any });
}

// ================================================================ 1. Liquid Glass
function liquidGlass(d: number): Built {
  const at = (f: number) => f * d;
  const layers: Layer[] = [
    world(d, 'cineLiquidGlass', 'Liquid glass world'),
    kicker(d, 0.06, 0.3, 'Designed to flow', { y: 0.8 }),
    T(d, 0.32, 0.56, 'Pure. Clear.\nEffortless.', { y: 0.8, fontSize: 64, fontWeight: 300, fontFamily: 'Playfair Display', italic: true, anim: { preset: 'fadeRise', unit: 'word', stagger: 0.18, duration: 0.9 } as any }),
    T(d, 0.84, 1, 'The new standard of clarity', { y: 0.63, fontSize: 40, fontWeight: 400, letterSpacing: 0.04, color: '#eef2ff', anim: { preset: 'fadeRise', unit: 'word', stagger: 0.08, out: { enabled: false } } as any }),
    T(d, 0.9, 1, 'yourbrand.com', { y: 0.9, fontSize: 28, fontWeight: 500, letterSpacing: 0.12, color: '#c9d4ff', anim: { preset: 'smooth', out: { enabled: false } } as any }),
  ];
  const audio = [
    bed('padBright', d, 0.5),
    sfx('deepWhoosh', 0.1, { volume: 0.6 }),
    sfx('bubble', at(0.25), { volume: 0.35 }), sfx('bubble', at(0.43), { volume: 0.3 }),
    sfx('rec-slide-whoosh', at(0.57), { volume: 0.55 }),
    sfx('shimmer', at(0.66), { volume: 0.55 }),
    sfx('softHit', at(0.8), { volume: 0.7 }),
    sfx('shine', at(0.86), { volume: 0.45 }),
  ];
  return { background: '#05040a', duration: d, layers, audio };
}

// ================================================================ 2. 3D Product Orbit
function productOrbit(d: number): Built {
  const at = (f: number) => f * d;
  const callout = (a: number, text: string, y: number) =>
    T(d, a, a + 0.12, text, { x: 0.5, y, fontSize: 40, fontWeight: 500, letterSpacing: 0.06, color: '#ffffff', anim: { preset: 'slideBlur', unit: 'all', direction: 'right', duration: 0.6 } as any });
  const layers: Layer[] = [
    world(d, 'cineProductOrbit', 'Product studio'),
    kicker(d, 0.04, 0.2, 'Introducing', { y: 0.12 }),
    T(d, 0.2, 0.4, 'NOVA', { y: 0.13, fontSize: 150, fontWeight: 900, fontFamily: 'Montserrat', letterSpacing: 0.08, anim: { preset: 'blurReveal', unit: 'char', stagger: 0.06 } as any }),
    callout(0.42, 'Zero sugar', 0.12),
    callout(0.54, 'Natural caffeine', 0.12),
    callout(0.66, 'Sparkling citrus', 0.12),
    T(d, 0.8, 1, 'NOVA Citrus', { y: 0.11, fontSize: 92, fontWeight: 800, fontFamily: 'Montserrat', anim: { preset: 'blurReveal', unit: 'all', out: { enabled: false } } as any }),
    T(d, 0.86, 1, 'Available now', { y: 0.88, fontSize: 38, fontWeight: 500, letterSpacing: 0.1, color: '#ffe3e8', anim: { preset: 'fadeRise', unit: 'word', out: { enabled: false } } as any }),
  ];
  const audio = [
    bed('beatDrive', d, 0.35),
    sfx('downlifter', 0, { volume: 0.4 }),
    sfx('whooshHit', at(0.17), { volume: 0.7 }),
    sfx('swoosh', at(0.42), { volume: 0.45 }), sfx('swoosh', at(0.54), { volume: 0.45 }), sfx('swoosh', at(0.66), { volume: 0.45 }),
    sfx('rec-blade-whoosh', at(0.76), { volume: 0.55 }),
    sfx('impact', at(0.8), { volume: 0.65 }),
    sfx('success', at(0.87), { volume: 0.35 }),
  ];
  return { background: '#101116', duration: d, layers, audio };
}

// ================================================================ 3. Chrome Logo Reveal
function chromeLogo(d: number): Built {
  const at = (f: number) => f * d;
  const layers: Layer[] = [
    world(d, 'cineChromeLogo', 'Chrome logo stage'),
    kicker(d, 0.05, 0.3, 'A new era', { y: 0.32, color: '#bcd2ff' }),
    T(d, 0.62, 1, 'Engineered for excellence', { y: 0.7, fontSize: 36, fontWeight: 500, letterSpacing: 0.32, uppercase: true, color: '#dfe8ff', anim: { preset: 'spacing', unit: 'all', duration: 1.4, out: { enabled: false } } as any }),
  ];
  const audio = [
    bed('droneDeep', d, 0.45),
    sfx('rec-metallic-riser', 0, { volume: 0.6 }),
    sfx('cinematicBoom', at(0.3), { volume: 0.75 }),
    sfx('rec-blade-whoosh', at(0.42), { volume: 0.6 }),
    sfx('rec-slide-whoosh', at(0.6), { volume: 0.4 }),
    sfx('rec-camera-flash', at(0.85), { volume: 0.45 }),
    sfx('shine', at(0.86), { volume: 0.5 }),
  ];
  return { background: '#030408', duration: d, layers, audio };
}

// ================================================================ 4. Floating App Interface
function floatingUI(d: number): Built {
  const at = (f: number) => f * d;
  const layers: Layer[] = [
    world(d, 'cineFloatingUI', 'Interface space'),
    kicker(d, 0.05, 0.28, 'Meet the new app', { y: 0.12, color: '#bcd0ff' }),
    T(d, 0.3, 0.52, 'Everything you need.\nIn one place.', { y: 0.14, fontSize: 56, fontWeight: 700, anim: { preset: 'fadeRise', unit: 'line', stagger: 0.25 } as any }),
    T(d, 0.56, 0.8, 'Fast · Private · Beautiful', { y: 0.88, fontSize: 36, fontWeight: 500, letterSpacing: 0.08, color: '#dfe6ff', anim: { preset: 'wordByWord', unit: 'word', stagger: 0.25 } as any }),
    T(d, 0.84, 1, 'Download today', { y: 0.12, fontSize: 64, fontWeight: 800, anim: { preset: 'blurReveal', unit: 'all', out: { enabled: false } } as any }),
    T(d, 0.89, 1, 'App Store · Google Play', { y: 0.9, fontSize: 30, fontWeight: 500, letterSpacing: 0.1, color: '#b8c6ff', anim: { preset: 'smooth', out: { enabled: false } } as any }),
  ];
  const audio = [
    bed('padBright', d, 0.45),
    sfx('whoosh', 0.2, { volume: 0.5 }),
    sfx('notify', at(0.3), { volume: 0.4 }),
    sfx('tap', at(0.45), { volume: 0.5 }), sfx('toggle', at(0.5), { volume: 0.45 }),
    sfx('rec-slide-whoosh', at(0.54), { volume: 0.55 }),
    sfx('rec-click', at(0.84), { volume: 0.5 }),
    sfx('success', at(0.86), { volume: 0.45 }),
  ];
  return { background: '#050a1f', duration: d, layers, audio };
}

// ================================================================ 5. Cinematic Typography
function typography(d: number): Built {
  const at = (f: number) => f * d;
  const layers: Layer[] = [
    world(d, 'cineTypography', 'Monumental type'),
    T(d, 0.74, 1, 'A film by Your Studio', { y: 0.86, fontSize: 30, fontWeight: 500, letterSpacing: 0.3, uppercase: true, color: '#f2e6dc', anim: { preset: 'spacing', unit: 'all', duration: 1.4, out: { enabled: false } } as any }),
  ];
  const audio = [
    bed('droneDeep', d, 0.5),
    sfx('heartbeat', at(0.05), { volume: 0.4 }), sfx('heartbeat', at(0.18), { volume: 0.4 }),
    sfx('rec-blade-whoosh', at(0.35), { volume: 0.65 }),
    sfx('whooshHit', at(0.41), { volume: 0.7 }),
    sfx('cinematicBoom', at(0.6), { volume: 0.8 }),
    sfx('downlifter', at(0.72), { volume: 0.4 }),
  ];
  return { background: '#0d0f16', duration: d, layers, audio };
}

// ================================================================ 6. Luxury Perfume Commercial
function perfume(d: number): Built {
  const at = (f: number) => f * d;
  const serif = { fontFamily: 'Playfair Display', fontWeight: 400, italic: true } as Partial<TextLayer>;
  const layers: Layer[] = [
    world(d, 'cinePerfume', 'Perfume set'),
    T(d, 0.08, 0.34, 'An ode to warmth', { ...serif, y: 0.1, fontSize: 52, color: '#f7e7c8', anim: { preset: 'fadeRise', unit: 'word', stagger: 0.2, duration: 1.2 } as any }),
    T(d, 0.4, 0.66, 'Amber · Vanilla · Oud', { y: 0.1, fontSize: 30, fontWeight: 500, letterSpacing: 0.36, uppercase: true, color: '#e8cf9a', anim: { preset: 'spacing', unit: 'all', duration: 1.2 } as any }),
    T(d, 0.76, 1, 'AURUM', { y: 0.1, fontFamily: 'Playfair Display', fontWeight: 700, fontSize: 96, letterSpacing: 0.3, color: '#f3dfae', anim: { preset: 'blurReveal', unit: 'all', duration: 1.4, out: { enabled: false } } as any }),
    T(d, 0.83, 1, 'Eau de Parfum', { ...serif, y: 0.17, fontSize: 40, color: '#f7e7c8', anim: { preset: 'fadeRise', unit: 'all', out: { enabled: false } } as any }),
  ];
  const audio = [
    bed('padWarm', d, 0.55),
    sfx('chime', at(0.08), { volume: 0.35 }),
    sfx('swoosh', at(0.44), { volume: 0.35 }),
    sfx('shine', at(0.6), { volume: 0.45 }),
    sfx('softHit', at(0.76), { volume: 0.55 }),
    sfx('twinkle', at(0.8), { volume: 0.35 }),
  ];
  return { background: '#1a080e', duration: d, layers, audio };
}

// ================================================================ 7. Holographic Future UI
function holoUI(d: number): Built {
  const at = (f: number) => f * d;
  const mono = { fontFamily: 'JetBrains Mono', fontWeight: 500, color: '#8ff5ff' } as Partial<TextLayer>;
  const layers: Layer[] = [
    world(d, 'cineHoloUI', 'Hologram'),
    T(d, 0.04, 0.3, '> INITIALISING SYSTEM', { ...mono, y: 0.1, fontSize: 30, letterSpacing: 0.1, anim: { preset: 'typewriter', unit: 'char', stagger: 0.04, duration: 0.02 } as any, cursor: { enabled: true, mode: 'cursor', color: '#8ff5ff', width: 4, height: 1, glow: 12, blink: 2 } as any }),
    T(d, 0.32, 0.6, 'GLOBAL NETWORK ONLINE', { ...mono, y: 0.1, fontSize: 34, letterSpacing: 0.18, anim: { preset: 'glitch', unit: 'char', stagger: 0.03 } as any }),
    T(d, 0.62, 0.82, 'Data · Vision · Control', { y: 0.9, fontSize: 34, fontWeight: 500, letterSpacing: 0.12, color: '#d6fbff', anim: { preset: 'wordByWord', unit: 'word', stagger: 0.2 } as any }),
    T(d, 0.84, 1, 'THE FUTURE IS LIVE', { y: 0.1, fontSize: 62, fontWeight: 800, letterSpacing: 0.06, color: '#ffffff', glow: 22, glowColor: '#29e7ff', anim: { preset: 'blurReveal', unit: 'char', stagger: 0.03, out: { enabled: false } } as any }),
  ];
  const audio = [
    bed('droneDeep', d, 0.45),
    sfx('rec-radio-beep', at(0.03), { volume: 0.5 }),
    sfx('scroll', at(0.06), { volume: 0.35 }),
    sfx('sweepUp', at(0.15), { volume: 0.45 }),
    sfx('glitchSwipe', at(0.32), { volume: 0.5 }),
    sfx('rec-radio-beep', at(0.62), { volume: 0.4 }),
    sfx('impact', at(0.84), { volume: 0.6 }),
  ];
  return { background: '#02040c', duration: d, layers, audio };
}

// ================================================================ 8. Abstract 3D Worlds
function abstractWorlds(d: number): Built {
  const at = (f: number) => f * d;
  const layers: Layer[] = [
    world(d, 'cineAbstract', 'Three worlds'),
    kicker(d, 0.08, 0.3, 'World I · Monoliths', { y: 0.88, color: '#ffd9c2' }),
    kicker(d, 0.4, 0.62, 'World II · Rings', { y: 0.88, color: '#c8f0ff' }),
    kicker(d, 0.72, 0.86, 'World III · Crystal', { y: 0.88, color: '#ffd1f3' }),
    T(d, 0.86, 1, 'BEYOND FORM', { y: 0.47, fontSize: 96, fontWeight: 800, letterSpacing: 0.12, anim: { preset: 'blurReveal', unit: 'char', stagger: 0.05, out: { enabled: false } } as any }),
  ];
  const audio = [
    bed('padDark', d, 0.5),
    sfx('rec-fire-whoosh', at(0.31), { volume: 0.55 }), sfx('impact', at(0.33), { volume: 0.5 }),
    sfx('rec-fire-whoosh', at(0.65), { volume: 0.55 }), sfx('impact', at(0.67), { volume: 0.5 }),
    sfx('shine', at(0.87), { volume: 0.45 }),
  ];
  return { background: '#050505', duration: d, layers, audio };
}

// ================================================================ 9. Particle Brand Film
function particleFilm(d: number): Built {
  const at = (f: number) => f * d;
  const layers: Layer[] = [
    world(d, 'cineParticles', 'Particle field'),
    T(d, 0.06, 0.3, 'Every idea starts as a spark', { y: 0.8, fontSize: 40, fontWeight: 400, fontFamily: 'Playfair Display', italic: true, color: '#ffe7c2', anim: { preset: 'fadeRise', unit: 'word', stagger: 0.12 } as any }),
    T(d, 0.76, 1, 'Ignite your story', { y: 0.62, fontSize: 40, fontWeight: 500, letterSpacing: 0.08, color: '#fff1d6', anim: { preset: 'fadeRise', unit: 'word', stagger: 0.12, out: { enabled: false } } as any }),
  ];
  const audio = [
    bed('padDark', d, 0.45),
    sfx('magicWand', at(0.05), { volume: 0.4 }),
    sfx('sweepUp', at(0.4), { volume: 0.55 }),
    sfx('rec-metallic-riser', at(0.48), { volume: 0.5 }),
    sfx('cinematicBoom', at(0.66), { volume: 0.8 }),
    sfx('twinkle', at(0.72), { volume: 0.4 }),
  ];
  return { background: '#05040a', duration: d, layers, audio };
}

// ================================================================ 10. Premium Watch Commercial
function watch(d: number): Built {
  const at = (f: number) => f * d;
  const layers: Layer[] = [
    world(d, 'cineWatch', 'Watch studio'),
    kicker(d, 0.06, 0.28, 'Precision', { y: 0.9, color: '#dfe7f2' }),
    kicker(d, 0.33, 0.58, 'Crafted in steel', { y: 0.9, color: '#dfe7f2' }),
    T(d, 0.66, 1, 'MERIDIAN', { y: 0.1, fontFamily: 'Playfair Display', fontWeight: 700, fontSize: 88, letterSpacing: 0.3, color: '#f1f4f8', anim: { preset: 'spacing', unit: 'all', duration: 1.6, out: { enabled: false } } as any }),
    T(d, 0.74, 1, 'Time, perfected.', { y: 0.9, fontFamily: 'Playfair Display', italic: true, fontWeight: 400, fontSize: 42, color: '#e6edf6', anim: { preset: 'fadeRise', unit: 'word', out: { enabled: false } } as any }),
  ];
  const audio = [
    bed('padDark', d, 0.4),
    sfx('clockTick', 0, { volume: 0.5, duration: Math.min(4.1, d * 0.3) }),
    sfx('rec-gear-shift', at(0.28), { volume: 0.45 }),
    sfx('swoosh', at(0.6), { volume: 0.45 }),
    sfx('softHit', at(0.66), { volume: 0.6 }),
    sfx('clockTick', at(0.7), { volume: 0.35, duration: Math.min(4.1, d * 0.3) }),
  ];
  return { background: '#030406', duration: d, layers, audio };
}

// ================================================================ 11. Floating Device Showcase
function devices(d: number): Built {
  const at = (f: number) => f * d;
  const dark = '#1b1830';
  const layers: Layer[] = [
    world(d, 'cineDevices', 'Device studio'),
    T(d, 0.46, 0.7, 'Designed for every screen', { y: 0.1, fontSize: 50, fontWeight: 700, color: dark, anim: { preset: 'fadeRise', unit: 'word', stagger: 0.1 } as any }),
    T(d, 0.74, 1, 'Your App', { y: 0.09, fontSize: 84, fontWeight: 800, color: dark, anim: { preset: 'blurReveal', unit: 'all', out: { enabled: false } } as any }),
    T(d, 0.8, 1, 'Coming soon', { y: 0.92, fontSize: 34, fontWeight: 500, letterSpacing: 0.14, uppercase: true, color: '#4a4560', anim: { preset: 'spacing', unit: 'all', out: { enabled: false } } as any }),
  ];
  const audio = [
    bed('padBright', d, 0.45),
    sfx('rec-camera-charge', 0, { volume: 0.35, duration: Math.min(4, d * 0.3), fadeOut: 0.5 }),
    sfx('whoosh', at(0.12), { volume: 0.5 }),
    sfx('rec-slide-whoosh', at(0.44), { volume: 0.5 }),
    sfx('notify', at(0.6), { volume: 0.4 }),
    sfx('softHit', at(0.74), { volume: 0.6 }),
  ];
  return { background: '#e9e6ef', duration: d, layers, audio };
}

// ================================================================ 12. Futuristic Event Promo
function eventPromo(d: number): Built {
  const at = (f: number) => f * d;
  const layers: Layer[] = [
    world(d, 'cineEvent', 'Event tunnel'),
    kicker(d, 0.04, 0.24, 'Get ready', { y: 0.86, color: '#ffc2f4' }),
    kicker(d, 0.25, 0.42, 'The biggest night of the year', { y: 0.86, fontSize: 24, color: '#c2f6ff' }),
    T(d, 0.66, 1, '12 · 12 · 2026', { y: 0.62, fontSize: 52, fontWeight: 700, letterSpacing: 0.1, glow: 14, glowColor: '#2be4ff', anim: { preset: 'kinetic', unit: 'word', stagger: 0.12, out: { enabled: false } } as any }),
    T(d, 0.74, 1, 'Ulaanbaatar Arena', { y: 0.69, fontSize: 34, fontWeight: 500, letterSpacing: 0.16, uppercase: true, color: '#ffd6f6', anim: { preset: 'spacing', unit: 'all', out: { enabled: false } } as any }),
    T(d, 0.84, 1, 'Tickets on sale now', { y: 0.88, fontSize: 38, fontWeight: 700, color: '#ffffff', glow: 18, glowColor: '#ff2bd6', anim: { preset: 'elastic', unit: 'char', stagger: 0.02, out: { enabled: false } } as any }),
  ];
  const audio = [
    bed('beatDrive', d, 0.55),
    sfx('rec-metallic-riser', at(0.2), { volume: 0.55 }),
    sfx('sweepUp', at(0.38), { volume: 0.5 }),
    sfx('rec-fire-whoosh', at(0.53), { volume: 0.6 }),
    sfx('cinematicBoom', at(0.6), { volume: 0.85 }),
    sfx('punch', at(0.66), { volume: 0.55 }),
    sfx('rec-camera-flash', at(0.84), { volume: 0.45 }),
  ];
  return { background: '#04020a', duration: d, layers, audio };
}

const cine = (id: string, name: string, swatch: [string, string], fn: (d: number) => Built, def = 15): Template => ({
  id, name, categories: ['Cinematic 3D'], swatch, durations: [...new Set([10, 15, 20, def])].sort((a, b) => a - b), defaultDuration: def,
  build: (o) => fn(o?.duration ?? def),
});

export const CINEMATIC_TEMPLATES: Template[] = [
  cine('cine-liquid-glass', 'Liquid Glass', ['#1b0f3a', '#19c3ff'], liquidGlass, 14),
  cine('cine-product-orbit', '3D Product Orbit', ['#16171d', '#ff3b5c'], productOrbit, 15),
  cine('cine-chrome-logo', 'Chrome Logo Reveal', ['#05070c', '#7fb8ff'], chromeLogo, 10),
  cine('cine-floating-ui', 'Floating App Interface', ['#050a1f', '#2f6bff'], floatingUI, 15),
  cine('cine-typography', 'Cinematic Typography', ['#0d0f16', '#ff5a2b'], typography, 12),
  cine('cine-perfume', 'Luxury Perfume Commercial', ['#2a0d16', '#e6c27a'], perfume, 15),
  cine('cine-holo-ui', 'Holographic Future UI', ['#02040c', '#29e7ff'], holoUI, 14),
  cine('cine-abstract', 'Abstract 3D Worlds', ['#120806', '#3dc8ff'], abstractWorlds, 18),
  cine('cine-particles', 'Particle Brand Film', ['#05040a', '#ffb03a'], particleFilm, 12),
  cine('cine-watch', 'Premium Watch Commercial', ['#030406', '#0d2a4a'], watch, 15),
  cine('cine-devices', 'Floating Device Showcase', ['#e9e6ef', '#6b3dff'], devices, 14),
  cine('cine-event', 'Futuristic Event Promo', ['#04020a', '#ff2bd6'], eventPromo, 15),
];

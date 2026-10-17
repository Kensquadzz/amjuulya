// "Reels" templates: kinetic-typography branding reels in the style of
// editorial social content — light studio backdrops, small italic captions
// that type on, heavy italic headlines resolving from motion blur, a black
// liquid swoosh accent, hard scene cuts, image slots for PNG cut-outs.
// Everything is ordinary editable layers + keyframes.
import { uid } from './util';
import { makeBackground, makeImage, makeShader, makeShape, makeText } from './project';
import type { EasingId, ImageLayer, Keyframe, KfValue, Layer, TextLayer } from './types';
import type { Template } from './templates';

const kf = (t: number, v: KfValue, ease: EasingId = 'easeInOutCubic'): Keyframe => ({ id: uid(), t, v, ease });

export const REEL = {
  red: '#8b2a30',
  redBright: '#c8343d',
  ink: '#151515',
  paper: '#f4f4f4',
  paperEdge: '#bdbdbd',
};

type Span = { start: number; end: number };

const studio = (d: number, s: Span, name = 'Studio backdrop') =>
  makeBackground(d, { ...s, name, mode: 'radial', colorA: '#f6f6f6', colorB: REEL.paperEdge, x: 0.5, y: 0.4, scale: 1.2 });

const darkRoom = (d: number, s: Span, edge = '#6a1219') =>
  makeBackground(d, { ...s, name: 'Dark backdrop', mode: 'radial', colorA: '#050505', colorB: edge, x: 0.5, y: 0.5, scale: 1.0, inner: 0.62 });

/** Small italic caption that types on letter by letter. */
function caption(d: number, s: Span, text: string, o: Partial<TextLayer> & { delay?: number } = {}): TextLayer {
  const { delay = 0.15, ...rest } = o;
  return makeText(d, {
    ...s, name: 'Caption', text, fontFamily: 'Poppins', fontWeight: 600, italic: true, fontSize: 56, letterSpacing: -0.015, lineHeight: 1.05,
    color: REEL.ink, x: 0.5, y: 0.2,
    anim: { preset: 'typePop', delay, out: { enabled: true, duration: 0.25, stagger: 0.008 } } as any,
    ...rest,
  });
}

/** Heavy italic headline, each line resolving out of motion blur. */
function headline(d: number, s: Span, text: string, o: Partial<TextLayer> & { delay?: number } = {}): TextLayer {
  const { delay = 0.8, ...rest } = o;
  return makeText(d, {
    ...s, name: 'Headline', text, fontFamily: 'Poppins', fontWeight: 800, italic: true, fontSize: 162, letterSpacing: -0.05, lineHeight: 0.86,
    align: 'left', color: REEL.red, x: 0.5, y: 0.32,
    anim: { preset: 'blurReveal', delay, out: { enabled: true, duration: 0.3, stagger: 0.04 } } as any,
    ...rest,
  });
}

/** Black liquid blade that grows out of the top-right corner. */
function swoosh(d: number, s: Span, o: { w?: number; h?: number; at?: number } = {}) {
  const at = s.start + (o.at ?? 0.25);
  return makeShape(d, {
    ...s, name: 'Swoosh', shape: 'swoosh', fillOn: true, fill: '#0a0a0a', strokeWidth: 0, w: o.w ?? 520, h: o.h ?? 640, x: 1.002, y: -0.002,
    tracks: {
      scale: [kf(at, 0, 'easeOutExpo'), kf(at + 0.8, 1, 'easeInOut'), kf(s.end - 0.05, 1.04)],
      rotation: [kf(at, -28, 'easeOutExpo'), kf(at + 0.8, 0)],
    },
  });
}

/** Image slot for a PNG cut-out (empty until the user picks a photo). */
function slot(d: number, s: Span, name: string, o: Partial<ImageLayer> = {}): ImageLayer {
  const enter = s.start;
  return makeImage(d, '', {
    ...s, name, w: 820, slotRatio: 1.05, x: 0.6, y: 0.72, shadow: 60, shadowOpacity: 0.35, shadowY: 40,
    tracks: {
      scale: [kf(enter, 1.12, 'easeOutExpo'), kf(enter + 0.9, 1, 'linear'), kf(s.end, 1.03)],
      opacity: [kf(enter, 0, 'easeOutCubic'), kf(enter + 0.35, 1)],
    },
    ...o,
  });
}

function barcode(d: number, s: Span, y = 0.88) {
  return makeShape(d, {
    ...s, name: 'Barcode', shape: 'barcode', fill: REEL.ink, w: 300, h: 70, x: 0.5, y, seed: 23,
    tracks: { draw: [kf(s.start + 0.3, 0, 'easeInOutCubic'), kf(s.start + 1.1, 1)] },
  });
}

const grain = (d: number) => makeShader(d, 'film', { name: 'Film grain', params: { u_vignette: 0.35, u_grain: 0.045, u_scanlines: 0, u_flicker: 0 } as any });

// ---------------------------------------------------------------------------

function brandingReel(): { background: string; duration: number; layers: Layer[] } {
  const d = 18;
  const S1 = { start: 0, end: 3.4 }, S2 = { start: 3.4, end: 6.2 }, S3 = { start: 6.2, end: 7.8 };
  const S4 = { start: 7.8, end: 11.2 }, S5 = { start: 11.2, end: 13.0 }, S6 = { start: 13.0, end: 16.0 }, S7 = { start: 16.0, end: 18 };
  return {
    background: '#e9e9e9', duration: d,
    layers: [
      // 1 — hook
      studio(d, S1),
      caption(d, S1, "here's the branding secret", { y: 0.19 }),
      headline(d, S1, 'no one\ntells\nyou', { y: 0.35, x: 0.47, fontSize: 200 }),
      slot(d, S1, 'Hero image', { x: 0.62, y: 0.74 }),
      // 2 — problem
      studio(d, S2),
      swoosh(d, S2),
      caption(d, S2, 'A brand without a content strategy', { y: 0.27 }),
      headline(d, S2, 'is just\nposting and\nhoping', { y: 0.405, delay: 0.7 }),
      slot(d, S2, 'Object image', { x: 0.55, y: 0.76, w: 700 }),
      barcode(d, S2),
      // 3 — dark beat
      darkRoom(d, S3),
      caption(d, S3, 'and hope is', { y: 0.47, color: '#ffffff', glow: 18, glowColor: '#ffffff' }),
      headline(d, S3, 'not a growth plan', { y: 0.525, fontSize: 80, align: 'center', color: REEL.redBright, delay: 0.55 }),
      // 4 — the rule
      studio(d, S4),
      swoosh(d, S4, { w: 470, h: 560 }),
      caption(d, S4, 'Every piece of content\nshould', { y: 0.29 }),
      headline(d, S4, 'either\n   attract\nnew eyes', { y: 0.445, delay: 0.75 }),
      slot(d, S4, 'Product image', { x: 0.62, y: 0.76, w: 760 }),
      caption(d, S4, 'build trust\nwith existing\nones', { y: 0.87, x: 0.25, fontSize: 40, align: 'center', delay: 1.9, name: 'Side note' }),
      // 5 — dark beat
      darkRoom(d, S5),
      caption(d, S5, 'or convert attention', { y: 0.47, color: '#ffffff', glow: 18, glowColor: '#ffffff' }),
      headline(d, S5, 'into action', { y: 0.525, fontSize: 88, align: 'center', color: REEL.redBright, delay: 0.6 }),
      // 6 — payoff
      studio(d, S6),
      swoosh(d, S6, { w: 500, h: 600 }),
      caption(d, S6, 'Posting randomly does', { y: 0.29 }),
      headline(d, S6, 'none of the\nthree\nconsistently', { y: 0.415, delay: 0.7, fontSize: 146 }),
      slot(d, S6, 'Creator image', { x: 0.55, y: 0.76, w: 820 }),
      // 7 — end card
      studio(d, S7),
      makeShape(d, { ...S7, name: 'Avatar mask', shape: 'circle', mask: 'alpha', w: 320, h: 320, x: 0.5, y: 0.42, fillOn: true, strokeWidth: 0 }),
      slot(d, S7, 'Avatar image', { x: 0.5, y: 0.42, w: 340, slotRatio: 1, shadow: 0, shadowOpacity: 0 }),
      makeShape(d, { ...S7, name: 'Avatar ring', shape: 'ring', w: 350, h: 350, x: 0.5, y: 0.42, stroke: REEL.red, strokeWidth: 4, tracks: { draw: [kf(S7.start + 0.1, 0, 'easeInOutCubic'), kf(S7.start + 0.9, 1)] } }),
      caption(d, S7, 'Follow for more branding secrets', { y: 0.55, delay: 0.5 }),
      grain(d),
    ],
  };
}

function boldStatement() {
  const d = 6, S = { start: 0, end: d };
  return {
    background: '#e9e9e9', duration: d,
    layers: [
      studio(d, S),
      swoosh(d, S),
      caption(d, S, 'the one rule nobody follows', { y: 0.28 }),
      headline(d, S, 'say less.\nshow\nmore.', { y: 0.42, fontSize: 168 }),
      slot(d, S, 'Image (optional)', { y: 0.76, w: 640 }),
      barcode(d, S, 0.9),
      grain(d),
    ],
  };
}

function darkQuote() {
  const d = 5, S = { start: 0, end: d };
  return {
    background: '#050505', duration: d,
    layers: [
      darkRoom(d, S),
      caption(d, S, 'most brands are loud', { y: 0.46, color: '#ffffff', glow: 8, glowColor: '#ffffff', fontSize: 52 }),
      headline(d, S, 'few are remembered', { y: 0.515, fontSize: 76, align: 'center', color: REEL.redBright, delay: 1.0 }),
      makeShader(d, 'bloom', { params: { u_threshold: 0.8, u_radius: 16, u_intensity: 0.35, u_tint: '#ff8a90' } as any }),
      grain(d),
    ],
  };
}

function productShowcase() {
  const d = 7, S = { start: 0, end: d };
  const name = headline(d, S, 'AURA', { y: 0.38, align: 'center', fontSize: 330, letterSpacing: -0.02, color: '#d9d9d9', italic: false, fontWeight: 900, delay: 0.1, name: 'Big name (behind)' });
  name.anim = { ...name.anim, preset: 'spacing', unit: 'all', duration: 2.4, ease: 'easeOutExpo', intensity: 0.6 };
  return {
    background: '#ececec', duration: d,
    layers: [
      studio(d, S),
      name,
      slot(d, S, 'Product image', {
        x: 0.5, y: 0.52, w: 760, slotRatio: 1.1,
        tracks: {
          y: [kf(0, 0.6, 'easeOutExpo'), kf(1.1, 0.52, 'easeInOut'), kf(4, 0.505, 'easeInOut'), kf(d, 0.52)],
          opacity: [kf(0, 0, 'easeOutCubic'), kf(0.5, 1)],
          rotation: [kf(0, -6, 'easeOutExpo'), kf(1.2, 0)],
        },
      }),
      caption(d, S, 'new collection — 2026', { y: 0.8, delay: 1.2 }),
      headline(d, S, 'made to be seen', { y: 0.845, fontSize: 64, align: 'center', delay: 1.8 }),
      barcode(d, S, 0.92),
      grain(d),
    ],
  };
}

function endCard() {
  const d = 5, S = { start: 0, end: d };
  return {
    background: '#e9e9e9', duration: d,
    layers: [
      studio(d, S),
      makeShape(d, { ...S, name: 'Avatar mask', shape: 'circle', mask: 'alpha', w: 360, h: 360, x: 0.5, y: 0.4, fillOn: true, strokeWidth: 0,
        tracks: { scale: [kf(0, 0, 'easeOutBack'), kf(0.7, 1)] } }),
      makeImage(d, '', { name: 'Avatar image', x: 0.5, y: 0.4, w: 380, slotRatio: 1 }),
      makeShape(d, { ...S, name: 'Avatar ring', shape: 'ring', w: 392, h: 392, x: 0.5, y: 0.4, stroke: REEL.red, strokeWidth: 5, tracks: { draw: [kf(0.4, 0, 'easeInOutCubic'), kf(1.3, 1)] } }),
      headline(d, S, '@yourname', { y: 0.53, fontSize: 72, align: 'center', delay: 0.9 }),
      caption(d, S, 'Follow for more branding secrets', { y: 0.58, delay: 1.5 }),
      swoosh(d, S, { w: 420, h: 640, at: 0.1 }),
      grain(d),
    ],
  };
}

function mongolKinetic() {
  const d = 6, S = { start: 0, end: d };
  // Montserrat covers Cyrillic (Mongolian) in every weight/italic
  const cap = caption(d, S, 'брэндийн гол нууц', { y: 0.27, fontFamily: 'Montserrat' });
  const head = headline(d, S, 'хэн ч\nтанд\nхэлэхгүй', { y: 0.4, fontFamily: 'Montserrat', fontWeight: 900, fontSize: 140, letterSpacing: -0.04 });
  return {
    background: '#e9e9e9', duration: d,
    layers: [
      studio(d, S),
      swoosh(d, S),
      cap,
      head,
      slot(d, S, 'Зураг (PNG)', { y: 0.75, w: 700 }),
      caption(d, S, 'дагаарай →', { y: 0.92, delay: 2.4, fontSize: 36, fontFamily: 'Montserrat', name: 'CTA' }),
      grain(d),
    ],
  };
}

function editorialSerif() {
  const d = 6;
  return {
    background: '#0b0b0b', duration: d,
    layers: [
      makeBackground(d, { name: 'Backdrop', mode: 'radial', colorA: '#1a1a1a', colorB: '#050505', x: 0.5, y: 0.45, scale: 1.1 }),
      makeText(d, { name: 'Kicker', text: 'ISSUE 07 — THE QUIET BRAND', fontFamily: 'Inter', fontWeight: 500, fontSize: 24, letterSpacing: 0.42, color: '#9a9a9a', y: 0.36,
        anim: { preset: 'spacing', unit: 'all', delay: 0.2, duration: 2, intensity: 0.5, out: { enabled: true, duration: 0.5, stagger: 0 } } as any }),
      makeShape(d, { name: 'Rule', shape: 'line', w: 360, h: 0, stroke: '#6a6a6a', strokeWidth: 2, y: 0.39, draw: 0, tracks: { draw: [kf(0.5, 0, 'easeInOutExpo'), kf(1.6, 1)] } }),
      makeText(d, { name: 'Title', text: 'Taste is\nthe strategy', fontFamily: 'Playfair Display', fontWeight: 500, italic: true, fontSize: 132, lineHeight: 1.0, color: '#f2ede4', y: 0.48,
        anim: { preset: 'blurReveal', delay: 0.9, duration: 0.9, stagger: 0.3, out: { enabled: true, duration: 0.6, stagger: 0.1 } } as any }),
      makeText(d, { name: 'Byline', text: 'words by your studio', fontFamily: 'Playfair Display', fontWeight: 400, italic: true, fontSize: 34, color: '#a59d90', y: 0.6,
        anim: { preset: 'typePop', delay: 2.4, out: { enabled: true, duration: 0.4, stagger: 0.005 } } as any }),
      makeShader(d, 'film', { params: { u_vignette: 0.8, u_grain: 0.06, u_scanlines: 0, u_flicker: 0.015 } as any }),
    ],
  };
}

export const REEL_TEMPLATES: Template[] = [
  { id: 'reel-branding', name: 'Branding Secret Reel (18s, 7 scenes)', categories: ['Reels', 'Kinetic type', 'Typography'], swatch: ['#ececec', REEL.red], build: brandingReel },
  { id: 'reel-bold', name: 'Bold Statement', categories: ['Reels', 'Kinetic type'], swatch: ['#ececec', '#0a0a0a'], build: boldStatement },
  { id: 'reel-dark', name: 'Dark Quote', categories: ['Reels', 'Glow'], swatch: ['#050505', REEL.redBright], build: darkQuote },
  { id: 'reel-product', name: 'Product Showcase', categories: ['Reels', 'Minimal'], swatch: ['#ececec', '#cfcfcf'], build: productShowcase },
  { id: 'reel-endcard', name: 'Creator End Card', categories: ['Reels', 'Minimal'], swatch: ['#ececec', REEL.red], build: endCard },
  { id: 'reel-mongol', name: 'Монгол Kinetic (Кирилл)', categories: ['Reels', 'Kinetic type'], swatch: ['#ececec', REEL.red], build: mongolKinetic },
  { id: 'reel-editorial', name: 'Editorial Serif', categories: ['Reels', 'Typography', 'Minimal'], swatch: ['#0b0b0b', '#f2ede4'], build: editorialSerif },
];

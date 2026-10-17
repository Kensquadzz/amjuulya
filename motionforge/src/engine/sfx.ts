// Sound effects library. Most sounds are procedural: rendered with the Web
// Audio API in an OfflineAudioContext from code, deterministic for a given
// (preset, seed) and regenerated on load. The 'Studio' sounds are recorded
// samples shipped with the app in /public/sfx; projects reference both kinds
// by id only, so they stay small.

export type SfxCategory = 'Studio' | 'Transitions' | 'Hits' | 'UI' | 'Risers' | 'Magic' | 'Ambience' | 'Music';

export interface SfxPreset {
  id: string;
  label: string;
  category: SfxCategory;
  duration: number;
  build?: (ctx: OfflineAudioContext, out: AudioNode, rnd: () => number) => void;
  /** recorded sample bundled with the app (path under the site root) */
  file?: string;
}

/** Recorded studio samples (see public/sfx). */
const STUDIO: SfxPreset[] = ([
  ['blade-whoosh', 'Blade whoosh', 1.39],
  ['slide-whoosh', 'Slide whoosh', 3.15],
  ['fire-whoosh', 'Fire whoosh', 3.25],
  ['metallic-riser', 'Metallic riser', 3.24],
  ['camera-flash', 'Camera flash', 2.04],
  ['camera-charge', 'Camera flash charge', 9.22],
  ['click', 'Click', 1.41],
  ['radio-beep', 'Radio beep', 0.53],
  ['gear-shift', 'Gear shift', 5.15],
  ['gun-reload', 'Reload', 4.09],
] as const).map(([id, label, duration]) => ({ id: `rec-${id}`, label, category: 'Studio' as const, duration, file: `sfx/${id}.mp3` }));

const SR = 44100;

/** Small seeded PRNG (mulberry32). */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, rnd: () => number, pink = false) {
  const len = Math.max(1, Math.ceil(seconds * ctx.sampleRate));
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = rnd() * 2 - 1;
    if (pink) {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else d[i] = w;
  }
  return b;
}

function noise(ctx: OfflineAudioContext, seconds: number, rnd: () => number, pink = false) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, seconds, rnd, pink);
  return s;
}

/** Synthetic room reverb (decaying stereo noise impulse). */
function reverb(ctx: OfflineAudioContext, seconds: number, rnd: () => number, decay = 3) {
  const len = Math.ceil(seconds * ctx.sampleRate);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  const c = ctx.createConvolver();
  c.buffer = ir;
  return c;
}

/** dry/wet send helper: returns the input node to connect sources into */
function withReverb(ctx: OfflineAudioContext, out: AudioNode, rnd: () => number, wet = 0.3, seconds = 2) {
  const input = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 1 - wet * 0.5;
  const w = ctx.createGain();
  w.gain.value = wet;
  const rv = reverb(ctx, seconds, rnd);
  input.connect(dry).connect(out);
  input.connect(rv).connect(w).connect(out);
  return input;
}

function env(g: AudioParam, t: number, attack: number, peak: number, release: number, sustain = 0) {
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + attack);
  if (sustain > 0) g.setValueAtTime(peak, t + attack + sustain);
  g.exponentialRampToValueAtTime(0.0001, t + attack + sustain + release);
}

function tone(ctx: OfflineAudioContext, type: OscillatorType, f0: number, t: number, dur: number) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.start(t);
  o.stop(t + dur);
  return o;
}

function whoosh(ctx: OfflineAudioContext, out: AudioNode, rnd: () => number, d: number, lo = 220, hi = 3200, pan = true) {
  const n = noise(ctx, d, rnd, true);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(lo, 0);
  bp.frequency.exponentialRampToValueAtTime(hi, d * 0.55);
  bp.frequency.exponentialRampToValueAtTime(lo * 2.5, d);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.linearRampToValueAtTime(1.6, d * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, d);
  const p = ctx.createStereoPanner();
  if (pan) { p.pan.setValueAtTime(-0.7, 0); p.pan.linearRampToValueAtTime(0.7, d); }
  n.connect(bp).connect(g).connect(p).connect(out);
  n.start(0);
}

function hit(ctx: OfflineAudioContext, out: AudioNode, rnd: () => number, t: number, f0: number, f1: number, body: number, level = 1, bright = 1400) {
  const room = withReverb(ctx, out, rnd, 0.35, 2.2);
  const o = tone(ctx, 'sine', f0, t, body + 0.1);
  o.frequency.exponentialRampToValueAtTime(f1, t + 0.35);
  const g = ctx.createGain();
  env(g.gain, t, 0.004, level, body);
  o.connect(g).connect(room);
  const n = noise(ctx, 0.5, rnd);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(bright * 3, t);
  lp.frequency.exponentialRampToValueAtTime(bright * 0.3, t + 0.3);
  const ng = ctx.createGain();
  env(ng.gain, t, 0.002, level * 0.55, 0.28);
  n.connect(lp).connect(ng).connect(room);
  n.start(t);
}

function bell(ctx: OfflineAudioContext, out: AudioNode, t: number, f: number, dur: number, level: number) {
  // two-operator FM bell
  const car = tone(ctx, 'sine', f, t, dur);
  const mod = tone(ctx, 'sine', f * 3.5, t, dur);
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * 1.2, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.05, t + dur);
  mod.connect(mg).connect(car.frequency);
  const g = ctx.createGain();
  env(g.gain, t, 0.003, level, dur - 0.01);
  car.connect(g).connect(out);
}

function click(ctx: OfflineAudioContext, out: AudioNode, rnd: () => number, t: number, level = 0.5) {
  const n = noise(ctx, 0.03, rnd);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2600 + rnd() * 2400;
  bp.Q.value = 0.9;
  const g = ctx.createGain();
  env(g.gain, t, 0.001, level, 0.025);
  n.connect(bp).connect(g).connect(out);
  n.start(t);
  // tiny low "thock" of the key
  const o = tone(ctx, 'sine', 180 + rnd() * 60, t, 0.05);
  const og = ctx.createGain();
  env(og.gain, t, 0.001, level * 0.35, 0.04);
  o.connect(og).connect(out);
}

function pad(ctx: OfflineAudioContext, out: AudioNode, rnd: () => number, d: number, notes: number[], cutoff: number) {
  const room = withReverb(ctx, out, rnd, 0.45, 3);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  lp.Q.value = 0.6;
  const lfo = tone(ctx, 'sine', 0.13, 0, d);
  const lfoG = ctx.createGain();
  lfoG.gain.value = cutoff * 0.35;
  lfo.connect(lfoG).connect(lp.frequency);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, 0);
  master.gain.linearRampToValueAtTime(0.32, 2.2);
  master.gain.setValueAtTime(0.32, d - 2.4);
  master.gain.linearRampToValueAtTime(0.0001, d);
  lp.connect(master).connect(room);
  for (const f of notes) {
    for (const det of [-7, 6]) {
      const o = tone(ctx, 'sawtooth', f, 0, d);
      o.detune.value = det + (rnd() - 0.5) * 3;
      const g = ctx.createGain();
      g.gain.value = 0.11 / notes.length;
      const p = ctx.createStereoPanner();
      p.pan.value = det < 0 ? -0.35 : 0.35;
      o.connect(g).connect(p).connect(lp);
    }
  }
  const sub = tone(ctx, 'sine', notes[0] / 2, 0, d);
  const sg = ctx.createGain();
  sg.gain.value = 0.18;
  sub.connect(sg).connect(master);
}

function kick(ctx: OfflineAudioContext, out: AudioNode, t: number, level = 1) {
  const o = tone(ctx, 'sine', 150, t, 0.5);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  const g = ctx.createGain();
  env(g.gain, t, 0.002, level, 0.42);
  o.connect(g).connect(out);
}

function snare(ctx: OfflineAudioContext, out: AudioNode, rnd: () => number, t: number, level = 0.6) {
  const n = noise(ctx, 0.3, rnd);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1900;
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  env(g.gain, t, 0.001, level, 0.2);
  n.connect(bp).connect(g).connect(out);
  n.start(t);
  const o = tone(ctx, 'triangle', 190, t, 0.15);
  const og = ctx.createGain();
  env(og.gain, t, 0.001, level * 0.5, 0.1);
  o.connect(og).connect(out);
}

function hat(ctx: OfflineAudioContext, out: AudioNode, rnd: () => number, t: number, level = 0.25, open = false) {
  const n = noise(ctx, 0.25, rnd);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7500;
  const g = ctx.createGain();
  env(g.gain, t, 0.001, level, open ? 0.2 : 0.045);
  n.connect(hp).connect(g).connect(out);
  n.start(t);
}

function beat(ctx: OfflineAudioContext, out: AudioNode, rnd: () => number, bpm: number, bars: number, style: 'lofi' | 'drive') {
  const beatLen = 60 / bpm;
  const room = withReverb(ctx, out, rnd, 0.18, 1.2);
  const bassNotes = style === 'lofi' ? [55, 55, 49, 41.2] : [55, 65.4, 49, 58.3];
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * beatLen * 4;
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * beatLen;
      if (b === 0 || b === 2 || (style === 'drive')) kick(ctx, room, t, style === 'drive' ? 0.9 : 1);
      if (b === 1 || b === 3) snare(ctx, room, rnd, t, style === 'lofi' ? 0.45 : 0.6);
      hat(ctx, room, rnd, t + beatLen / 2, 0.18, style === 'drive' && b === 3);
      hat(ctx, room, rnd, t, 0.1);
    }
    // bass
    const f = bassNotes[bar % bassNotes.length];
    const o = tone(ctx, style === 'lofi' ? 'triangle' : 'sawtooth', f, t0, beatLen * 4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = style === 'lofi' ? 400 : 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.22, t0 + 0.02);
    g.gain.setValueAtTime(0.22, t0 + beatLen * 4 - 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t0 + beatLen * 4);
    o.connect(lp).connect(g).connect(room);
  }
}

function sweep(ctx: OfflineAudioContext, out: AudioNode, rnd: () => number, d: number, f0: number, f1: number, level = 1) {
  const n = noise(ctx, d, rnd);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2.5;
  bp.frequency.setValueAtTime(f0, 0);
  bp.frequency.exponentialRampToValueAtTime(f1, d);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(level, d * (f1 > f0 ? 0.95 : 0.1));
  g.gain.exponentialRampToValueAtTime(0.0001, d);
  n.connect(bp).connect(g).connect(out);
  n.start(0);
}

export const SFX: SfxPreset[] = [
  ...STUDIO,
  { id: 'whoosh', label: 'Whoosh', category: 'Transitions', duration: 0.9, build: (c, o, r) => whoosh(c, o, r, 0.9) },
  { id: 'whooshFast', label: 'Fast whoosh', category: 'Transitions', duration: 0.45, build: (c, o, r) => whoosh(c, o, r, 0.45, 400, 5200) },
  { id: 'swipe', label: 'Swipe', category: 'Transitions', duration: 0.3, build: (c, o, r) => whoosh(c, o, r, 0.3, 900, 7000, false) },
  {
    id: 'deepWhoosh', label: 'Deep whoosh', category: 'Transitions', duration: 1.4,
    build: (c, o, r) => { whoosh(c, o, r, 1.4, 120, 1600); hit(c, o, r, 0.62, 90, 40, 0.8, 0.35, 500); },
  },
  { id: 'impact', label: 'Cinematic impact', category: 'Hits', duration: 2.4, build: (c, o, r) => hit(c, o, r, 0.01, 130, 38, 1.9, 1, 1600) },
  { id: 'softHit', label: 'Soft hit', category: 'Hits', duration: 1.4, build: (c, o, r) => hit(c, o, r, 0.01, 160, 70, 1.1, 0.6, 700) },
  {
    id: 'boom', label: 'Sub boom', category: 'Hits', duration: 2.8,
    build: (c, o) => {
      const t = tone(c, 'sine', 70, 0.01, 2.7);
      t.frequency.exponentialRampToValueAtTime(28, 2.2);
      const g = c.createGain(); env(g.gain, 0.01, 0.01, 1, 2.6);
      const ws = c.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.2); }
      ws.curve = curve;
      t.connect(ws).connect(g).connect(o);
    },
  },
  {
    id: 'pop', label: 'Pop', category: 'UI', duration: 0.3,
    build: (c, o) => {
      const t = tone(c, 'sine', 380, 0.005, 0.25);
      t.frequency.exponentialRampToValueAtTime(980, 0.035);
      t.frequency.exponentialRampToValueAtTime(620, 0.2);
      const g = c.createGain(); env(g.gain, 0.005, 0.004, 0.8, 0.18);
      t.connect(g).connect(o);
    },
  },
  {
    id: 'blip', label: 'Blip', category: 'UI', duration: 0.2,
    build: (c, o) => {
      const t = tone(c, 'triangle', 1320, 0.002, 0.18);
      t.frequency.exponentialRampToValueAtTime(1500, 0.08);
      const g = c.createGain(); env(g.gain, 0.002, 0.003, 0.5, 0.13);
      t.connect(g).connect(o);
    },
  },
  {
    id: 'blipSequence', label: 'Blip sequence (7)', category: 'UI', duration: 1.4,
    build: (c, o, r) => {
      const notes = [880, 987.8, 1174.7, 1318.5, 1480, 1760, 1975.5];
      notes.forEach((f, i) => { const t = 0.02 + i * 0.13 + r() * 0.02; bell(c, o, t, f, 0.35, 0.22); });
    },
  },
  { id: 'click', label: 'Click', category: 'UI', duration: 0.08, build: (c, o, r) => click(c, o, r, 0.002, 0.8) },
  {
    id: 'typing', label: 'Typing (2s)', category: 'UI', duration: 2.1,
    build: (c, o, r) => { let t = 0.01; while (t < 1.95) { click(c, o, r, t, 0.35 + r() * 0.35); t += 0.07 + r() * 0.09; } },
  },
  {
    id: 'ding', label: 'Notification ding', category: 'UI', duration: 1.2,
    build: (c, o) => { bell(c, o, 0.01, 1318.5, 1.1, 0.35); bell(c, o, 0.09, 1975.5, 1.0, 0.22); },
  },
  {
    id: 'riser', label: 'Riser (2.5s)', category: 'Risers', duration: 2.6,
    build: (c, o, r) => {
      const d = 2.5;
      const n = noise(c, d, r);
      const hp = c.createBiquadFilter(); hp.type = 'highpass';
      hp.frequency.setValueAtTime(200, 0); hp.frequency.exponentialRampToValueAtTime(5000, d);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.7, d); g.gain.setValueAtTime(0.0001, d + 0.01);
      n.connect(hp).connect(g).connect(o); n.start(0);
      const s = tone(c, 'sawtooth', 110, 0, d);
      s.frequency.exponentialRampToValueAtTime(880, d);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, 0); lp.frequency.exponentialRampToValueAtTime(6000, d);
      const sg = c.createGain(); sg.gain.setValueAtTime(0.0001, 0); sg.gain.exponentialRampToValueAtTime(0.25, d); sg.gain.setValueAtTime(0.0001, d + 0.01);
      s.connect(lp).connect(sg).connect(o);
    },
  },
  {
    id: 'reverseSwell', label: 'Reverse swell', category: 'Risers', duration: 1.6,
    build: (c, o, r) => {
      const d = 1.5;
      const n = noise(c, d, r, true);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
      bp.frequency.setValueAtTime(800, 0); bp.frequency.exponentialRampToValueAtTime(6000, d);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(1.2, d); g.gain.linearRampToValueAtTime(0.0001, d + 0.05);
      n.connect(bp).connect(g).connect(o); n.start(0);
    },
  },
  {
    id: 'shimmer', label: 'Shimmer', category: 'Magic', duration: 2.6,
    build: (c, o, r) => {
      const room = withReverb(c, o, r, 0.55, 2.5);
      [1318.5, 1567.98, 1975.5, 2637].forEach((f, i) => bell(c, room, 0.02 + i * 0.07, f, 2.2, 0.16));
    },
  },
  {
    id: 'sparkle', label: 'Sparkle', category: 'Magic', duration: 1.6,
    build: (c, o, r) => {
      const room = withReverb(c, o, r, 0.5, 1.5);
      for (let i = 0; i < 9; i++) bell(c, room, 0.02 + r() * 0.9, 2200 + r() * 2600, 0.5, 0.08 + r() * 0.06);
    },
  },
  {
    id: 'logoReveal', label: 'Logo reveal (hit + shimmer)', category: 'Magic', duration: 3.2,
    build: (c, o, r) => {
      hit(c, o, r, 0.01, 120, 40, 2.0, 0.85, 1500);
      const room = withReverb(c, o, r, 0.6, 3);
      [987.8, 1318.5, 1760, 2637].forEach((f, i) => bell(c, room, 0.05 + i * 0.05, f, 2.8, 0.12));
    },
  },
  {
    id: 'glitch', label: 'Digital glitch', category: 'Transitions', duration: 0.6,
    build: (c, o, r) => {
      let t = 0;
      while (t < 0.55) {
        const len = 0.02 + r() * 0.05;
        const s = tone(c, 'square', 80 + r() * 1800, t, len);
        const g = c.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.setValueAtTime(0, t + len);
        s.connect(g).connect(o);
        t += len + r() * 0.02;
      }
    },
  },
  // ---- more transitions
  { id: 'swoosh', label: 'Swoosh (airy)', category: 'Transitions', duration: 0.6, build: (c, o, r) => whoosh(c, o, r, 0.6, 600, 4200) },
  { id: 'swish', label: 'Swish (very fast)', category: 'Transitions', duration: 0.2, build: (c, o, r) => whoosh(c, o, r, 0.2, 1500, 9000, false) },
  {
    id: 'zoomIn', label: 'Zoom in', category: 'Transitions', duration: 0.9,
    build: (c, o, r) => { sweep(c, o, r, 0.85, 300, 6000, 1.2); const t = tone(c, 'sine', 180, 0, 0.85); t.frequency.exponentialRampToValueAtTime(900, 0.85); const g = c.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.25, 0.8); g.gain.exponentialRampToValueAtTime(0.0001, 0.88); t.connect(g).connect(o); },
  },
  {
    id: 'zoomOut', label: 'Zoom out', category: 'Transitions', duration: 0.9,
    build: (c, o, r) => { sweep(c, o, r, 0.85, 6000, 250, 1.2); const t = tone(c, 'sine', 900, 0, 0.85); t.frequency.exponentialRampToValueAtTime(160, 0.85); const g = c.createGain(); env(g.gain, 0, 0.01, 0.25, 0.8); t.connect(g).connect(o); },
  },
  {
    id: 'spinWhoosh', label: 'Spin whoosh', category: 'Transitions', duration: 1.0,
    build: (c, o, r) => {
      const n = noise(c, 1, r, true);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(500, 0); bp.frequency.exponentialRampToValueAtTime(3000, 0.6); bp.frequency.exponentialRampToValueAtTime(700, 1);
      const trem = tone(c, 'sine', 9, 0, 1); trem.frequency.linearRampToValueAtTime(22, 1);
      const tg = c.createGain(); tg.gain.value = 0.5;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.9, 0.5); g.gain.exponentialRampToValueAtTime(0.0001, 1);
      trem.connect(tg).connect(g.gain);
      n.connect(bp).connect(g).connect(o); n.start(0);
    },
  },
  { id: 'whooshHit', label: 'Whoosh → hit', category: 'Transitions', duration: 2.2, build: (c, o, r) => { whoosh(c, o, r, 0.7, 250, 4000); hit(c, o, r, 0.62, 140, 40, 1.4, 0.9, 1500); } },
  { id: 'glitchSwipe', label: 'Glitch swipe', category: 'Transitions', duration: 0.7, build: (c, o, r) => { whoosh(c, o, r, 0.45, 800, 6000, false); let t = 0.05; while (t < 0.6) { const len = 0.015 + r() * 0.03; const q = tone(c, 'square', 200 + r() * 2400, t, len); const g = c.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.setValueAtTime(0, t + len); q.connect(g).connect(o); t += len + r() * 0.04; } } },
  {
    id: 'tapeStop', label: 'Tape stop', category: 'Transitions', duration: 1.1,
    build: (c, o) => { for (const f of [220, 277.2, 329.6]) { const t = tone(c, 'sawtooth', f, 0, 1.05); t.frequency.exponentialRampToValueAtTime(f * 0.12, 1.0); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, 0); lp.frequency.exponentialRampToValueAtTime(200, 1); const g = c.createGain(); g.gain.setValueAtTime(0.12, 0); g.gain.exponentialRampToValueAtTime(0.0001, 1.05); t.connect(lp).connect(g).connect(o); } },
  },
  { id: 'shutter', label: 'Camera shutter', category: 'Transitions', duration: 0.3, build: (c, o, r) => { click(c, o, r, 0.005, 0.9); click(c, o, r, 0.09, 0.7); const n = noise(c, 0.12, r); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000; const g = c.createGain(); env(g.gain, 0.01, 0.002, 0.25, 0.08); n.connect(hp).connect(g).connect(o); n.start(0.01); } },
  // ---- more hits
  { id: 'punch', label: 'Punch', category: 'Hits', duration: 0.6, build: (c, o, r) => { kick(c, o, 0.005, 1); const n = noise(c, 0.1, r); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500; const g = c.createGain(); env(g.gain, 0.005, 0.001, 0.5, 0.07); n.connect(lp).connect(g).connect(o); n.start(0.005); } },
  { id: 'cinematicBoom', label: 'Cinematic boom', category: 'Hits', duration: 4, build: (c, o, r) => { const room = withReverb(c, o, r, 0.6, 3.5); hit(c, room, r, 0.01, 90, 30, 3.2, 1, 900); } },
  {
    id: 'bassDrop', label: 'Bass drop (808)', category: 'Hits', duration: 2.2,
    build: (c, o) => { const t = tone(c, 'sine', 110, 0.01, 2.1); t.frequency.exponentialRampToValueAtTime(36, 1.6); const g = c.createGain(); env(g.gain, 0.01, 0.005, 1, 2.0); const ws = c.createWaveShaper(); const cv = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = (i / 511) * 2 - 1; cv[i] = Math.tanh(x * 3); } ws.curve = cv; t.connect(ws).connect(g).connect(o); },
  },
  { id: 'clap', label: 'Clap', category: 'Hits', duration: 0.5, build: (c, o, r) => { for (const dt of [0, 0.012, 0.024]) snare(c, o, r, 0.005 + dt, 0.5); } },
  { id: 'heartbeat', label: 'Heartbeat', category: 'Hits', duration: 1.2, build: (c, o) => { kick(c, o, 0.01, 0.9); kick(c, o, 0.24, 0.6); } },
  // ---- more UI
  { id: 'tap', label: 'Tap', category: 'UI', duration: 0.1, build: (c, o) => { const t = tone(c, 'sine', 900, 0.002, 0.08); t.frequency.exponentialRampToValueAtTime(500, 0.05); const g = c.createGain(); env(g.gain, 0.002, 0.001, 0.6, 0.06); t.connect(g).connect(o); } },
  { id: 'toggle', label: 'Toggle switch', category: 'UI', duration: 0.2, build: (c, o, r) => { click(c, o, r, 0.002, 0.6); const t = tone(c, 'sine', 1600, 0.02, 0.1); const g = c.createGain(); env(g.gain, 0.02, 0.002, 0.3, 0.07); t.connect(g).connect(o); } },
  { id: 'bubble', label: 'Bubble pop', category: 'UI', duration: 0.3, build: (c, o) => { const t = tone(c, 'sine', 300, 0.005, 0.25); t.frequency.exponentialRampToValueAtTime(1400, 0.09); const g = c.createGain(); env(g.gain, 0.005, 0.01, 0.7, 0.15); t.connect(g).connect(o); } },
  { id: 'success', label: 'Success chime', category: 'UI', duration: 1.4, build: (c, o, r) => { const room = withReverb(c, o, r, 0.4, 1.5); [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(c, room, 0.02 + i * 0.09, f, 0.9, 0.22)); } },
  { id: 'error', label: 'Error buzz', category: 'UI', duration: 0.6, build: (c, o) => { for (const t0 of [0.01, 0.22]) { const t = tone(c, 'square', 160, t0, 0.16); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200; const g = c.createGain(); g.gain.setValueAtTime(0.15, t0); g.gain.setValueAtTime(0, t0 + 0.15); t.connect(lp).connect(g).connect(o); } } },
  { id: 'scroll', label: 'Scroll ticks', category: 'UI', duration: 1.0, build: (c, o, r) => { for (let i = 0; i < 12; i++) click(c, o, r, 0.01 + i * 0.07 * (1 + i * 0.03), 0.3); } },
  { id: 'clockTick', label: 'Clock tick (4s)', category: 'UI', duration: 4.1, build: (c, o, r) => { for (let i = 0; i < 8; i++) { const t = tone(c, 'sine', i % 2 ? 1500 : 1200, i * 0.5 + 0.01, 0.05); const g = c.createGain(); env(g.gain, i * 0.5 + 0.01, 0.001, 0.4, 0.04); t.connect(g).connect(o); click(c, o, r, i * 0.5 + 0.01, 0.2); } } },
  { id: 'notify', label: 'Marimba notification', category: 'UI', duration: 1.0, build: (c, o) => { [880, 1318.5].forEach((f, i) => { const t = tone(c, 'sine', f, 0.01 + i * 0.11, 0.5); const g = c.createGain(); env(g.gain, 0.01 + i * 0.11, 0.002, 0.4, 0.45); t.connect(g).connect(o); const t2 = tone(c, 'sine', f * 4, 0.01 + i * 0.11, 0.1); const g2 = c.createGain(); env(g2.gain, 0.01 + i * 0.11, 0.001, 0.12, 0.06); t2.connect(g2).connect(o); }); } },
  // ---- more risers
  { id: 'downlifter', label: 'Downlifter', category: 'Risers', duration: 2.0, build: (c, o, r) => { sweep(c, o, r, 2, 7000, 150, 1.4); const t = tone(c, 'sawtooth', 660, 0, 2); t.frequency.exponentialRampToValueAtTime(80, 2); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(5000, 0); lp.frequency.exponentialRampToValueAtTime(200, 2); const g = c.createGain(); env(g.gain, 0, 0.02, 0.2, 1.95); t.connect(lp).connect(g).connect(o); } },
  {
    id: 'tensionRiser', label: 'Tension riser (5s)', category: 'Risers', duration: 5.1,
    build: (c, o, r) => {
      const d = 5;
      sweep(c, o, r, d, 200, 8000, 0.9);
      for (const f of [110, 116.5]) { const t = tone(c, 'sawtooth', f, 0, d); t.frequency.exponentialRampToValueAtTime(f * 4, d); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, 0); lp.frequency.exponentialRampToValueAtTime(5000, d); const g = c.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.14, d); g.gain.setValueAtTime(0.0001, d + 0.01); t.connect(lp).connect(g).connect(o); }
    },
  },
  { id: 'sweepUp', label: 'Filter sweep up', category: 'Risers', duration: 1.5, build: (c, o, r) => sweep(c, o, r, 1.5, 200, 9000, 1.3) },
  // ---- more magic
  { id: 'chime', label: 'Chime arpeggio', category: 'Magic', duration: 2.4, build: (c, o, r) => { const room = withReverb(c, o, r, 0.55, 2.4); [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => bell(c, room, 0.02 + i * 0.08, f, 1.6, 0.14)); } },
  { id: 'twinkle', label: 'Twinkle', category: 'Magic', duration: 1.2, build: (c, o, r) => { const room = withReverb(c, o, r, 0.5, 1.2); for (let i = 0; i < 6; i++) bell(c, room, 0.02 + i * 0.12, 2637 + (i % 2) * 500, 0.4, 0.1); } },
  { id: 'magicWand', label: 'Magic wand', category: 'Magic', duration: 2.0, build: (c, o, r) => { sweep(c, o, r, 0.6, 1000, 9000, 0.8); const room = withReverb(c, o, r, 0.6, 1.8); for (let i = 0; i < 10; i++) bell(c, room, 0.3 + r() * 0.8, 2000 + r() * 3000, 0.6, 0.08); } },
  { id: 'shine', label: 'Shine (ding)', category: 'Magic', duration: 1.8, build: (c, o, r) => { const room = withReverb(c, o, r, 0.5, 1.8); bell(c, room, 0.01, 2349.3, 1.6, 0.3); bell(c, room, 0.01, 3520, 1.2, 0.12); } },
  { id: 'padDark', label: 'Ambient pad — dark (12s)', category: 'Ambience', duration: 12, build: (c, o, r) => pad(c, o, r, 12, [110, 164.81, 196, 246.94, 261.63], 900) },
  { id: 'padBright', label: 'Ambient pad — bright (12s)', category: 'Ambience', duration: 12, build: (c, o, r) => pad(c, o, r, 12, [130.81, 196, 246.94, 293.66, 329.63], 1900) },
  { id: 'padWarm', label: 'Ambient pad — warm (12s)', category: 'Ambience', duration: 12, build: (c, o, r) => pad(c, o, r, 12, [87.31, 130.81, 174.61, 220, 261.63], 1200) },
  { id: 'droneDeep', label: 'Deep drone (12s)', category: 'Ambience', duration: 12, build: (c, o, r) => pad(c, o, r, 12, [55, 82.41, 110], 500) },
  { id: 'beatLofi', label: 'Lo-fi beat 85 BPM (11s)', category: 'Music', duration: 11.3, build: (c, o, r) => beat(c, o, r, 85, 4, 'lofi') },
  { id: 'beatDrive', label: 'Driving beat 120 BPM (8s)', category: 'Music', duration: 8.0, build: (c, o, r) => beat(c, o, r, 120, 4, 'drive') },
];

export const sfxById = (id: string) => SFX.find((s) => s.id === id);

/** Render a preset to an AudioBuffer (stereo, 44.1 kHz). */
async function loadSample(file: string): Promise<AudioBuffer> {
  const res = await fetch(`${import.meta.env.BASE_URL}${file}`);
  if (!res.ok) throw new Error(`Sound file missing (${res.status})`);
  const data = await res.arrayBuffer();
  const ctx = new OfflineAudioContext(2, 1, SR);
  return ctx.decodeAudioData(data);
}

export async function renderSfx(id: string, seed = 1): Promise<AudioBuffer> {
  const p = sfxById(id);
  if (!p) throw new Error(`Unknown sound effect "${id}"`);
  if (p.file) return normalise(await loadSample(p.file), 0.8);
  if (!p.build) throw new Error(`Sound effect "${id}" has no source`);
  const ctx = new OfflineAudioContext(2, Math.ceil((p.duration + 0.05) * SR), SR);
  const master = ctx.createGain();
  master.gain.value = 0.85;
  // soft limiter so stacked layers never clip
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -6;
  comp.ratio.value = 8;
  master.connect(comp).connect(ctx.destination);
  p.build(ctx, master, prng(seed * 7919 + id.length));
  const buf = await ctx.startRendering();
  // peak-normalise so every effect sits at a consistent level in the mix
  return normalise(buf, p.category === 'Ambience' ? 0.45 : p.category === 'Music' ? 0.7 : p.category === 'UI' ? 0.6 : 0.8);
}

function normalise(buf: AudioBuffer, target: number) {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
  if (peak > 1e-4) {
    const g = target / peak;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; }
  }
  return buf;
}

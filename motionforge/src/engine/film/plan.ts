// Art-directed film storyboard: the data that drives the `film` renderer.
// A storyboard is a list of scenes; each scene has one job (its narration
// segment), one scene kind from the film vocabulary, the exact on-screen copy,
// beats (absolute seconds of the words it reacts to) and how it enters from
// the scene before. Pure functions (validated in unit tests):
//   validateStoryboard — coverage, timing, reading time, copy integrity
//   filmSfx            — sound cues derived from the choreography itself

export const FILM_KINDS = ['question', 'brand', 'folders', 'roll', 'list', 'blank', 'template', 'counter', 'apps', 'reveal', 'price', 'cta'] as const;
export type FilmKind = typeof FILM_KINDS[number];
export const FILM_TRANSITIONS = ['cut', 'pushUp', 'zoomIn', 'swipe', 'iris', 'flash'] as const;
export type FilmTransition = typeof FILM_TRANSITIONS[number];

export interface FilmScene {
  id: string;
  kind: FilmKind;
  /** seconds on the film timeline */
  start: number;
  end: number;
  /** the narration this scene carries (verbatim) */
  say: string;
  /** on-screen copy, by slot; rendered exactly as written */
  copy: Record<string, string>;
  /** absolute seconds of the words the scene reacts to */
  beats?: number[];
  /** picture indexes (1-based) into the film's images */
  images?: number[];
  /** how this scene arrives from the previous one */
  enter?: FilmTransition;
}
export interface FilmPalette { paper: string; ink: string; muted: string; line: string; accent: string; alert: string; dark: string }
export interface Storyboard {
  brand: string;
  duration: number;
  palette: FilmPalette;
  fonts: { display: string; ui: string };
  /** product facts allowed on screen besides narration words (brand, prices, file names...) */
  facts: string[];
  scenes: FilmScene[];
}
export interface FilmIssue { level: 'error' | 'warn'; scene?: string; msg: string }

export const DEFAULT_PALETTE: FilmPalette = { paper: '#f3f1ec', ink: '#121214', muted: '#8a8a92', line: '#e2ded6', accent: '#2b4bff', alert: '#e5484d', dark: '#0b0b0d' };
export const TRANSITION_LEN = 0.45;

/** slots that hold lists: one entry per line */
export const listOf = (s: string | undefined) => (s ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
const norm = (s: string) => s.toLocaleLowerCase('mn').replace(/[«»"“”.,!?;:—–\-]/g, ' ').replace(/\s+/g, ' ').trim();
/** every visible string a scene draws (list slots split per line) */
export function sceneStrings(s: FilmScene) { return Object.values(s.copy).flatMap((v) => listOf(v)).flatMap((l) => l.split('|').map((x) => x.trim())).filter(Boolean); }

/**
 * Words per second people can read on a moving phone screen (~3), plus time
 * to notice the text at all.
 */
export const readTime = (text: string) => 0.5 + text.split(/\s+/).filter(Boolean).length / 3;

export function validateStoryboard(sb: Storyboard, audioDuration: number): FilmIssue[] {
  const out: FilmIssue[] = [];
  const sc = [...sb.scenes].sort((a, b) => a.start - b.start);
  if (Math.abs(sb.duration - audioDuration) > 0.05 && sb.duration < audioDuration) out.push({ level: 'error', msg: `film (${sb.duration}s) is shorter than the voice (${audioDuration.toFixed(2)}s)` });
  if (!sc.length) return [{ level: 'error', msg: 'no scenes' }];
  if (sc[0].start > 0.001) out.push({ level: 'error', msg: `nothing on screen before ${sc[0].start}s` });
  if (sc[sc.length - 1].end < sb.duration - 0.001) out.push({ level: 'error', msg: `nothing on screen after ${sc[sc.length - 1].end}s` });
  const allSay = norm(sc.map((s) => s.say).join(' '));
  const facts = sb.facts.map(norm);
  const ids = new Set<string>();
  sc.forEach((s, i) => {
    if (ids.has(s.id)) out.push({ level: 'error', scene: s.id, msg: 'duplicate scene id' });
    ids.add(s.id);
    if (!FILM_KINDS.includes(s.kind)) out.push({ level: 'error', scene: s.id, msg: `unknown kind ${s.kind}` });
    if (s.end <= s.start) out.push({ level: 'error', scene: s.id, msg: 'scene has no length' });
    if (i > 0) {
      const gap = s.start - sc[i - 1].end;
      if (gap > 0.001) out.push({ level: 'error', scene: s.id, msg: `gap of ${gap.toFixed(2)}s before this scene` });
      if (gap < -0.001) out.push({ level: 'error', scene: s.id, msg: `overlaps the previous scene by ${(-gap).toFixed(2)}s` });
      if (s.kind === sc[i - 1].kind && s.kind !== 'question') out.push({ level: 'warn', scene: s.id, msg: `same kind as the previous scene (${s.kind})` });
    }
    (s.beats ?? []).forEach((b) => { if (b < s.start - 0.01 || b > s.end + 0.01) out.push({ level: 'error', scene: s.id, msg: `beat ${b}s lies outside the scene` }); });
    // copy integrity: every on-screen string comes from the narration or the product facts
    for (const str of sceneStrings(s)) {
      const n = norm(str);
      if (!n) continue;
      const ok = allSay.includes(n) || facts.some((f) => f === n || f.includes(n));
      if (!ok) out.push({ level: 'error', scene: s.id, msg: `copy "${str}" is neither narration nor a product fact` });
    }
    // reading time: the scene's copy must stay up long enough
    const words = sceneStrings(s).join(' ');
    if (words && s.end - s.start < Math.min(readTime(words), 2.2) * 0.75) out.push({ level: 'warn', scene: s.id, msg: `${(s.end - s.start).toFixed(1)}s may be too short to read "${words.slice(0, 40)}"` });
  });
  // the brand is immutable wherever it appears
  const brandParts = sb.brand.split(/\s+/);
  for (const s of sc) for (const str of sceneStrings(s)) {
    const tokens = str.split(/\s+/);
    tokens.forEach((t) => { const near = brandParts.find((b) => b !== t && b.toLowerCase() === t.toLowerCase()); if (near && /[A-Z]/.test(near)) out.push({ level: 'error', scene: s.id, msg: `brand word "${t}" must be written "${near}"` }); });
  }
  // the whole narration is carried by scenes
  const missing = sc.filter((s) => !s.say.trim()).filter((s) => s.kind !== 'reveal');
  if (missing.length > 1) out.push({ level: 'warn', msg: `${missing.length} scenes carry no narration` });
  return out;
}

export interface FilmCue { t: number; id: string; vol: number; max?: number }
/**
 * Sound design from the choreography: every entrance, beat, press and typing
 * run gets a cue at the moment it happens on screen (ids from the SFX library).
 */
export function filmSfx(sb: Storyboard): FilmCue[] {
  const cues: FilmCue[] = [];
  const add = (t: number, id: string, vol: number, max?: number) => { if (t >= 0 && t < sb.duration) cues.push({ t: +t.toFixed(3), id, vol, max }); };
  for (const s of sb.scenes) {
    const b = s.beats ?? [];
    switch (s.enter) {
      case 'pushUp': add(s.start - 0.08, 'ks-swoosh-014', 0.3); break;
      case 'zoomIn': add(s.start - 0.15, 'ks-whoosh-velocity', 0.35); break;
      case 'swipe': add(s.start - 0.1, 'ks-swoosh-2', 0.35); break;
      case 'iris': add(s.start - 0.05, 'ks-swoosh-06', 0.35); break;
      case 'flash': add(s.start - 0.05, 'ks-whoosh-end', 0.4, 1.4); break;
      default: break;
    }
    switch (s.kind) {
      case 'question': add(s.start + 0.05, 'ks-interface-digital-de-texto-text-digital-interface', 0.25, Math.min(0.9, s.end - s.start)); break;
      case 'brand': add(b[0] ?? s.start + 0.3, 'ks-sharp-pop', 0.5); add((b[0] ?? s.start) + 0.35, 'ks-shine-1', 0.25, 1.6); break;
      case 'folders': listOf(s.copy.items).forEach((_, i) => add(s.start + 0.45 + i * 0.12, 'ks-soft-pop-sfx', 0.3)); break;
      case 'roll': b.forEach((t) => add(t, 'ks-ui-sounds-pack-3-7', 0.4)); break;
      case 'list': listOf(s.copy.items).slice(0, 6).forEach((_, i) => add(s.start + 0.1 + i * 0.08, 'ks-soft-pop-sfx', 0.2)); break;
      case 'blank': add(s.start + 0.3, 'ks-keyboard-typing-fast', 0.25, 0.7); add((b[0] ?? s.end - 0.6), 'ks-swoosh-015', 0.4); break;
      case 'template': add(b[0] ?? s.start + 1, 'ks-mouse-click', 0.9); add((b[0] ?? s.start + 1) + 0.05, 'ks-ui-pop-up-2', 0.4); if (b[1]) add(b[1], 'ks-keyboard-typing-fast', 0.22, 0.8); if (b[2]) add(b[2], 'ks-sfx-acceptation', 0.4, 1.4); break;
      case 'counter': add(s.start + 0.1, 'ks-ui-processing-data-sequence-modern-interface-progress-02', 0.25, 1.2); add(b[0] ?? s.start + 1.3, 'ks-plop', 0.5); if (b[1]) add(b[1], 'ks-whoosh-velocity', 0.35); break;
      case 'apps': b.slice(0, 2).forEach((t) => add(t, 'ks-pop', 0.45)); if (b[2]) add(b[2], 'ks-app-click-1', 0.6); break;
      case 'reveal': add(b[0] ?? s.start + 0.6, 'ks-sharp-pop', 0.55); add((b[0] ?? s.start + 0.6) + 0.3, 'ks-swoosh-2', 0.3); break;
      case 'price': if (b[0]) add(b[0], 'ks-swoosh-015', 0.45); if (b[1]) { add(b[1], 'ks-success', 0.4, 1.6); add(b[1] + 0.05, 'ks-shine-6', 0.3, 1.6); } break;
      case 'cta': if (b[0]) add(b[0], 'ks-iphone-keyboard-typing-sound-effect', 0.4, 0.4); if (b[1]) { add(b[1], 'ks-mouse-click', 0.9); add(b[1] + 0.08, 'ks-happy-message-ping', 0.5); } break;
    }
  }
  return cues.sort((a, b) => a.t - b.t);
}

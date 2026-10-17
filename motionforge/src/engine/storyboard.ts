// Voice-over -> storyboard. The voice file is the timeline's source of truth:
// its decoded duration sets the video length, speech/silence detection (local,
// no network) finds phrase boundaries, script lines are aligned to them, and
// every section gets its own shot so the whole narration is developed visually
// instead of a short template being repeated. Pure functions: unit-tested.

export interface Span { start: number; end: number }
export interface PcmLike { sampleRate: number; length: number; numberOfChannels: number; getChannelData(c: number): Float32Array }

/**
 * Speech intervals from the audio energy. Frames of 20 ms; a frame is speech
 * when its RMS is within `rangeDb` of the loudest frames; gaps shorter than
 * `minGap` are bridged and blips shorter than `minSpeech` dropped.
 */
export function detectSpeech(buf: PcmLike, o: { rangeDb?: number; minGap?: number; minSpeech?: number } = {}): Span[] {
  const rangeDb = o.rangeDb ?? 32, minGap = o.minGap ?? 0.28, minSpeech = o.minSpeech ?? 0.12;
  const sr = buf.sampleRate, hop = Math.max(1, Math.round(sr * 0.02)), n = Math.floor(buf.length / hop);
  if (n === 0) return [];
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const db = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (const ch of chans) for (let i = f * hop, e = i + hop; i < e; i++) s += ch[i] * ch[i];
    db[f] = 10 * Math.log10(s / (hop * chans.length) + 1e-12);
  }
  // reference level: 95th percentile, so one click does not set the scale
  const sorted = Array.from(db).sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.95)];
  const thr = Math.max(ref - rangeDb, -70);
  const out: Span[] = [];
  let cur: Span | null = null;
  for (let f = 0; f < n; f++) {
    const t = (f * hop) / sr;
    if (db[f] > thr) { if (!cur) cur = { start: t, end: t + hop / sr }; else cur.end = t + hop / sr; }
    else if (cur && t - cur.end > minGap) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.filter((s) => s.end - s.start >= minSpeech).map((s) => ({ start: +s.start.toFixed(3), end: +s.end.toFixed(3) }));
}

export interface Section extends Span { text: string; index: number }

/**
 * Align script lines to the speech: line k is given a share of the speech time
 * proportional to its length, and every boundary snaps to the nearest pause.
 * Without a script, speech is grouped into phrases of about `target` seconds
 * (text stays empty: the app does not pretend to know the words).
 */
export function alignScript(lines: string[], speech: Span[], duration: number, target = 4): Section[] {
  const sp = speech.length ? speech : [{ start: 0, end: duration }];
  const pauses = sp.slice(0, -1).map((s, i) => (s.end + sp[i + 1].start) / 2);
  const speechStart = sp[0].start, speechEnd = sp[sp.length - 1].end;
  // time measured in speech seconds, so pauses do not count as words
  const total = sp.reduce((a, s) => a + s.end - s.start, 0);
  const speechAt = (x: number) => { // speech-time -> clock time
    let acc = 0;
    for (const s of sp) { const d = s.end - s.start; if (acc + d >= x) return s.start + (x - acc); acc += d; }
    return speechEnd;
  };
  let texts = lines.map((l) => l.trim()).filter(Boolean);
  if (!texts.length) {
    const k = Math.max(1, Math.round(total / target));
    texts = Array.from({ length: k }, () => '');
  }
  const weights = texts.map((t) => Math.max(4, t.length || 1));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const bounds: number[] = [speechStart];
  let acc = 0;
  for (let i = 0; i < texts.length - 1; i++) {
    acc += weights[i];
    const ideal = speechAt((total * acc) / wsum);
    // snap to the nearest pause that keeps boundaries increasing
    let best = ideal, bd = Infinity;
    for (const p of pauses) { const d = Math.abs(p - ideal); if (p > bounds[bounds.length - 1] + 0.3 && d < bd && d < 1.6) { bd = d; best = p; } }
    bounds.push(Math.max(best, bounds[bounds.length - 1] + 0.3));
  }
  bounds.push(speechEnd);
  return texts.map((text, i) => ({ index: i, text, start: +bounds[i].toFixed(3), end: +bounds[i + 1].toFixed(3) }));
}

// ---------------------------------------------------------------- shots
export type ShotKind = 'dock' | 'brand' | 'search' | 'cards' | 'grid' | 'roll' | 'title' | 'features' | 'stat' | 'cta';
export const SHOT_KINDS: ShotKind[] = ['dock', 'brand', 'search', 'cards', 'grid', 'roll', 'title', 'features', 'stat', 'cta'];

export interface PlannedShot extends Section { shot: ShotKind; why: string }
interface Cand { shot: ShotKind; why: string; strong?: boolean }

const has = (s: string, re: RegExp) => re.test(s.toLowerCase());
/** list items: commas followed by a space (so 40,000 stays one number) */
export const splitList = (s: string) => s.split(/,\s+|;|·|•|\s+ба\s+|\s+and\s+/).map((x) => x.trim()).filter((x) => x.length > 1);
const listCount = (s: string) => splitList(s).length;

/** Which shots suit a line, best first (keyword heuristics, Mongolian + English). */
export function shotCandidates(text: string, i: number, n: number): Cand[] {
  const c: Cand[] = [];
  const t = text.toLowerCase();
  if (i === n - 1 || has(t, /коммент|comment|холбоо бари|утас|залга|линк|link|call|message|dm\b|захиал|order|бичээрэй/)) c.push({ shot: 'cta', why: 'call to action' });
  if (/\d/.test(t) || has(t, /төгрөг|₮|\$|%|хувь|мянга|сая|зуу|гаруй|price|үнэ/)) c.push({ shot: 'stat', why: 'a number or price' });
  if (i === 0 || t.includes('?')) c.push({ shot: 'dock', why: 'opening question / hook' });
  if (has(t, /хай|search|олох|find/)) c.push({ shot: 'search', why: 'searching / finding' });
  if (listCount(t) >= 3) c.push({ shot: 'features', why: 'a list of items' }, { shot: 'roll', why: 'a list of words' });
  if (has(t, /бэлэн|аваад|татаж|download|save|хадгал|ашигла|use|сонго/)) c.push({ shot: 'grid', why: 'picking a ready item' });
  if (has(t, /шинээр|оронд|instead|өөрчл|хувилбар|style|загвар/)) c.push({ shot: 'cards', why: 'variations / alternatives' });
  if (has(t, /pack|багц|брэнд|brand|танилц|introduc|шинэ|new/)) c.push({ shot: 'brand', why: 'brand / product introduction' });
  if (has(t, /word|excel|файл|file|засвар|edit|app|апп/)) c.push({ shot: 'dock', why: 'apps / files' });
  for (const x of c) x.strong = true; // everything above matched the words of the line
  c.push({ shot: 'title', why: 'key message' }, { shot: 'features', why: 'supporting points' }, { shot: 'cards', why: 'visual variety' }, { shot: 'grid', why: 'visual variety' });
  return c;
}

/**
 * Give every section a shot. Never the same shot twice in a row; prefer shots
 * not used yet; the opening is a hook, the brand appears early, the end is
 * the call to action.
 */
export function planShots(sections: Section[]): PlannedShot[] {
  const used = new Map<ShotKind, number>();
  const out: PlannedShot[] = [];
  sections.forEach((s, i) => {
    let cands = shotCandidates(s.text, i, sections.length);
    if (i === 1 && !out.some((o) => o.shot === 'brand')) cands = [{ shot: 'brand', why: 'brand introduction', strong: true }, ...cands];
    const prev = out[out.length - 1]?.shot;
    const ok = cands.filter((x) => x.shot !== prev);
    // a shot that fits the words wins (even if it was used earlier — never twice
    // in a row); prefer an unused one when the line matches several
    const strong = ok.filter((x) => x.strong);
    const pick = strong.find((x) => !used.has(x.shot)) ?? strong[0] ?? ok.find((x) => !used.has(x.shot)) ?? ok.sort((a, b) => (used.get(a.shot) ?? 0) - (used.get(b.shot) ?? 0))[0] ?? { shot: 'title' as ShotKind, why: 'key message' };
    used.set(pick.shot, (used.get(pick.shot) ?? 0) + 1);
    out.push({ ...s, shot: pick.shot, why: pick.why });
  });
  return out;
}

export interface StoryIssue { level: 'error' | 'warn'; msg: string }

/** Checks the plan covers the whole narration and does not repeat itself. */
export function validatePlan(p: PlannedShot[], audioDuration: number, videoDuration: number): StoryIssue[] {
  const issues: StoryIssue[] = [];
  if (!p.length) return [{ level: 'error', msg: 'The storyboard is empty.' }];
  if (videoDuration + 0.05 < audioDuration) issues.push({ level: 'error', msg: `The video (${videoDuration.toFixed(1)} s) is shorter than the voice-over (${audioDuration.toFixed(1)} s).` });
  if (p[0].start > 2) issues.push({ level: 'warn', msg: `Nothing is planned for the first ${p[0].start.toFixed(1)} s.` });
  for (let i = 1; i < p.length; i++) {
    const gap = p[i].start - p[i - 1].end;
    if (gap > 0.6) issues.push({ level: 'error', msg: `Gap of ${gap.toFixed(1)} s between sections ${i} and ${i + 1}.` });
    if (p[i].shot && p[i].shot === p[i - 1].shot) issues.push({ level: 'error', msg: `Sections ${i} and ${i + 1} use the same shot (${p[i].shot}).` });
  }
  const last = p[p.length - 1];
  if (audioDuration - last.end > 1.5) issues.push({ level: 'error', msg: `The last ${(audioDuration - last.end).toFixed(1)} s of the voice-over have no section.` });
  return issues;
}

export interface Cue extends Span { text: string }

/**
 * Subtitle cues for a section: long sentences are split at word boundaries
 * into chunks of at most `maxChars`, each shown for a share of the section
 * proportional to its length. Line breaks are added at ~`lineChars`.
 */
export function captionCues(text: string, start: number, end: number, maxChars = 46, lineChars = 26): Cue[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chunks: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (next.length > maxChars && cur) { chunks.push(cur); cur = w; } else cur = next;
  }
  if (cur) chunks.push(cur);
  const total = chunks.reduce((a, s) => a + s.length, 0);
  const out: Cue[] = [];
  let t = start;
  for (const ch of chunks) {
    const d = (end - start) * (ch.length / total);
    out.push({ start: +t.toFixed(3), end: +(t + d).toFixed(3), text: breakLine(ch, lineChars) });
    t += d;
  }
  return out;
}

/** Break one caption into two balanced lines when it is longer than `lineChars`. */
export function breakLine(s: string, lineChars = 26): string {
  if (s.length <= lineChars) return s;
  const mid = s.length / 2;
  let best = -1;
  for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? s : s.slice(0, best) + '\n' + s.slice(best + 1);
}

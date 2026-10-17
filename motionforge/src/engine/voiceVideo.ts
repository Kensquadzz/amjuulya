// Build a complete project from a voice-over: the decoded audio length is the
// timeline (plus an explicit outro), speech detection + the script give the
// sections, every section gets its own story shot, subtitles sit in one fixed
// caption box, and the plan is validated for coverage and repetition.
import type { AspectId, AudioClip, Layer, Project } from './types';
import { makeScene3D, makeShape, makeText, newProject } from './project';
import { alignScript, captionCues, detectSpeech, planShots, splitLong, validatePlan, type PcmLike, type PlannedShot, type Span, type StoryIssue } from './storyboard';
import { sfxById } from './sfx';
import { uid } from './util';

export interface VoiceInput { assetId: string; name: string; duration: number; buffer: PcmLike }
export interface VoiceVideoOptions {
  voice: VoiceInput;
  script: string;
  brand: string;
  accent: string;
  /** second colour (typed-text highlight, glows) */
  accent2?: string;
  /** typical shot length in seconds (e.g. measured from a reference video) */
  pace?: number;
  images: string[];
  /** seconds of picture after the voice ends (ending policy) */
  outro: number;
  aspect: AspectId;
  subtitles: boolean;
  music: boolean;
  name?: string;
}
export interface VoiceVideoResult { project: Project; plan: PlannedShot[]; speech: Span[]; issues: StoryIssue[]; duration: number }

/** «1», "1", '1' -> the quoted text; used for the comment the CTA types. */
const quoted = (s: string) => s.match(/[«"“']([^»"”']{1,24})[»"”']/)?.[1];

export function buildVoiceProject(o: VoiceVideoOptions): VoiceVideoResult {
  const speech = detectSpeech(o.voice.buffer);
  const lines = o.script.split('\n').map((l) => l.trim()).filter(Boolean);
  const pace = o.pace ?? 4;
  const sections = splitLong(alignScript(lines, speech, o.voice.duration, pace), speech, Math.max(4, pace * 1.8));
  const plan = planShots(sections);
  // leading / trailing silence belong to the first / last section (nothing is cut)
  if (plan.length) { plan[0].start = 0; plan[plan.length - 1].end = o.voice.duration; }
  // never shorter than the voice; the outro is added after the file ends
  const D = +(o.voice.duration + Math.max(0, o.outro)).toFixed(2);
  const issues = validatePlan(plan, o.voice.duration, D);
  if (!lines.length) issues.push({ level: 'warn', msg: 'No script given: sections follow the pauses in the voice, without subtitles or text from the speech (speech is not transcribed on the device).' });

  const layers: Layer[] = [];
  const XF = 0.3; // dissolve overlap between shots
  plan.forEach((s, i) => {
    const start = i === 0 ? 0 : s.start;
    const end = i === plan.length - 1 ? D : Math.min(D, plan[i + 1].start + XF);
    const params: Record<string, string | number> = {
      shot: s.shot, title: s.text || o.brand, sub: '', items: '', brand: o.brand, accent: o.accent, accent2: o.accent2 ?? '#18b4ff', seed: i,
    };
    if (s.shot === 'cta') { params.sub = quoted(s.text) ?? (/\d/.test(s.text) ? s.text.match(/\d+/)![0] : o.brand); params.hint = 'Сэтгэгдэл бичих...'; }
    if (s.shot === 'search') params.hint = 'Хайх...';
    o.images.slice(0, 8).forEach((src, k) => { params[`img${k + 1}`] = o.images[(k + i) % o.images.length] ?? src; });
    layers.push(makeScene3D(D, 'story2d', { name: `${i + 1}. ${s.shot} — ${(s.text || '').slice(0, 28)}`, start: +start.toFixed(3), end: +end.toFixed(3), params }));
  });
  if (o.subtitles && lines.length) {
    const cues = plan.flatMap((s) => captionCues(s.text, s.start, s.end));
    if (cues.length) {
      const first = cues[0].start, last = cues[cues.length - 1].end;
      layers.push(makeShape(D, { name: 'Subtitle box', shape: 'rect', w: 960, h: 230, radius: 46, fill: '#05070f', fillOn: true, strokeWidth: 0, x: 0.5, y: 0.735, opacity: 0.62, start: Math.max(0, first - 0.05), end: Math.min(D, last + 0.2) }));
      cues.forEach((q, i) => layers.push(makeText(D, {
        name: `Subtitle ${i + 1}`, text: q.text, fontFamily: 'Montserrat', fontWeight: 700, fontSize: 54, lineHeight: 1.2, letterSpacing: -0.005, color: '#ffffff', align: 'center',
        x: 0.5, y: 0.735, start: q.start, end: i + 1 < cues.length ? cues[i + 1].start : Math.min(D, q.end + 0.2),
        anim: { preset: 'typePop', unit: 'word', delay: 0, duration: 0.28, stagger: 0.05, ease: 'easeOutCubic', direction: 'up', intensity: 0.6, order: 'forward', out: { enabled: i + 1 === cues.length, duration: 0.2, stagger: 0 } } as any,
      })));
    }
  }
  const audio: AudioClip[] = [{ id: uid(), name: `Voice — ${o.voice.name}`, assetId: o.voice.assetId, start: 0, offset: 0, duration: o.voice.duration, volume: 1, fadeIn: 0, fadeOut: 0, role: 'sfx' }];
  const bed = sfxById('ks-nightfall-future-bass-music');
  if (o.music && bed) audio.push({ id: uid(), name: bed.label, assetId: `sfx:${bed.id}`, start: 0, offset: 0, duration: Math.min(D, bed.duration ?? D), volume: 0.1, fadeIn: 1, fadeOut: 1.5, role: 'music' });
  const project = newProject(o.name || `${o.brand} — voice video`, { aspect: o.aspect, duration: D, fps: 30, background: '#05070f', layers, audio });
  return { project, plan, speech, issues, duration: D };
}

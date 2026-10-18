// Storyboard -> editable project: one film layer (the art-directed renderer),
// the voice-over untouched at full length, and the sound design derived from
// the choreography (filmSfx), plus an optional quiet music bed.
import type { AudioClip, Project } from '../types';
import { makeScene3D, newProject } from '../project';
import { sfxById } from '../sfx';
import { uid } from '../util';
import { filmSfx, type Storyboard } from './plan';

export interface FilmBuild { voiceAssetId?: string; voiceName?: string; voiceDuration?: number; images: string[]; music?: boolean; name?: string }

export function buildFilmProject(sb: Storyboard, o: FilmBuild): { project: Project; missing: string[] } {
  const D = sb.duration;
  const params: Record<string, string> = { storyboard: JSON.stringify(sb) };
  o.images.slice(0, 12).forEach((src, i) => { params[`img${i + 1}`] = src; });
  const layer = makeScene3D(D, 'film', { name: `Film — ${sb.brand}`, start: 0, end: D, params });
  const audio: AudioClip[] = [];
  if (o.voiceAssetId) audio.push({ id: uid(), name: `Voice — ${o.voiceName ?? 'voice over'}`, assetId: o.voiceAssetId, start: 0, offset: 0, duration: o.voiceDuration ?? D, volume: 1, fadeIn: 0, fadeOut: 0, role: 'sfx' });
  const bed = sfxById('ks-nightfall-future-bass-music');
  if (o.music !== false && bed) audio.push({ id: uid(), name: bed.label, assetId: `sfx:${bed.id}`, start: 0, offset: 0, duration: Math.min(D, bed.duration ?? D), volume: 0.09, fadeIn: 1.2, fadeOut: 1.8, role: 'music' });
  const missing: string[] = [];
  for (const q of filmSfx(sb)) {
    const pr = sfxById(q.id);
    if (!pr) { missing.push(q.id); continue; }
    audio.push({ id: uid(), name: pr.label, assetId: `sfx:${q.id}`, start: q.t, offset: 0, duration: Math.min(pr.duration ?? 1, q.max ?? 99, D - q.t), volume: q.vol, fadeIn: 0, fadeOut: q.max ? 0.25 : 0, role: 'sfx' });
  }
  const project = newProject(o.name ?? `${sb.brand} — film`, { aspect: '9:16', duration: D, fps: 30, background: sb.palette?.paper ?? '#f3f1ec', layers: [layer], audio });
  return { project, missing };
}

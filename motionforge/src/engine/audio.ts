// Audio: decoding/caching sources, preview playback in sync with the
// timeline clock, offline mixdown for export, audio extraction from video
// files and MP3/WAV encoding.
import { renderSfx, sfxById } from './sfx';
import { storage } from './storage';
import { uid } from './util';
import type { AudioClip, Project } from './types';

export const MIX_RATE = 48000;

// ---------------------------------------------------------------- decoding

const bufferCache = new Map<string, Promise<AudioBuffer>>();
const peakCache = new Map<string, Float32Array>();

let decodeCtx: OfflineAudioContext | null = null;
function decoder() {
  if (!decodeCtx) decodeCtx = new OfflineAudioContext(2, 1, MIX_RATE);
  return decodeCtx;
}

export async function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  // decodeAudioData understands mp3 / m4a / aac / wav and the audio of mp4/mov on Safari & Chrome
  return decoder().decodeAudioData(data.slice(0));
}

export function getBuffer(assetId: string): Promise<AudioBuffer> {
  let p = bufferCache.get(assetId);
  if (!p) {
    p = (async () => {
      if (assetId.startsWith('sfx:')) {
        const [, id, seed] = assetId.split(':');
        return renderSfx(id, Number(seed) || 1);
      }
      const a = await storage.getAsset(assetId.replace(/^asset:/, ''));
      if (!a) throw new Error('Audio file is missing from this device (it may have been deleted).');
      return decodeAudio(await a.blob.arrayBuffer());
    })();
    bufferCache.set(assetId, p);
    p.catch(() => bufferCache.delete(assetId));
  }
  return p;
}

/** Downsampled absolute peaks for waveform drawing. */
export async function getPeaks(assetId: string, buckets = 400): Promise<Float32Array> {
  const key = `${assetId}|${buckets}`;
  const hit = peakCache.get(key);
  if (hit) return hit;
  const b = await getBuffer(assetId);
  const out = new Float32Array(buckets);
  const chans = Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i));
  const per = Math.max(1, Math.floor(b.length / buckets));
  for (let k = 0; k < buckets; k++) {
    let m = 0;
    for (let i = k * per; i < Math.min(b.length, (k + 1) * per); i += 8) for (const c of chans) m = Math.max(m, Math.abs(c[i]));
    out[k] = m;
  }
  peakCache.set(key, out);
  return out;
}

export function clipLabel(assetId: string) {
  if (assetId.startsWith('sfx:')) return sfxById(assetId.split(':')[1])?.label ?? 'Sound effect';
  return 'Audio';
}

// ---------------------------------------------------------------- scheduling

/**
 * Schedule a clip onto a context, as if the timeline were at `t0` when the
 * context clock reads `when`. Shared by live preview and offline export so
 * both produce the same mix.
 */
function scheduleClip(ctx: BaseAudioContext, dest: AudioNode, clip: AudioClip, buf: AudioBuffer, t0: number, when: number) {
  if (clip.muted || clip.volume <= 0) return null;
  const end = clip.start + clip.duration;
  if (end <= t0) return null;
  const into = Math.max(0, t0 - clip.start); // seconds already elapsed in the clip
  const srcOffset = clip.offset + into;
  if (srcOffset >= buf.duration) return null;
  const length = Math.min(clip.duration - into, buf.duration - srcOffset);
  if (length <= 0) return null;
  const at = when + Math.max(0, clip.start - t0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  const v = clip.volume;
  // envelope in clip-local time
  const local = (tc: number) => at + (tc - into);
  const fi = Math.min(clip.fadeIn, clip.duration / 2), fo = Math.min(clip.fadeOut, clip.duration / 2);
  const gainAt = (tc: number) => v * Math.min(1, fi > 0 ? tc / fi : 1, fo > 0 ? (clip.duration - tc) / fo : 1);
  g.gain.setValueAtTime(Math.max(0, gainAt(into)), at);
  if (fi > 0 && into < fi) g.gain.linearRampToValueAtTime(v, local(fi));
  if (fo > 0) {
    const s = Math.max(into, clip.duration - fo);
    g.gain.setValueAtTime(Math.max(0, gainAt(s)), local(s));
    g.gain.linearRampToValueAtTime(0, local(clip.duration));
  }
  src.connect(g).connect(dest);
  src.start(at, srcOffset, length);
  return src;
}

/** Render the project's audio to a single stereo buffer (deterministic). */
export async function mixdown(project: Project, duration: number, sampleRate = MIX_RATE): Promise<AudioBuffer | null> {
  const clips = (project.audio ?? []).filter((c) => !c.muted && c.start < duration);
  if (!clips.length) return null;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
  const bus = ctx.createDynamicsCompressor(); // gentle bus limiter: stacked SFX never clip
  bus.threshold.value = -3;
  bus.ratio.value = 12;
  bus.attack.value = 0.003;
  bus.release.value = 0.15;
  bus.connect(ctx.destination);
  for (const c of clips) scheduleClip(ctx, bus, c, await getBuffer(c.assetId), 0, 0);
  return ctx.startRendering();
}

// ---------------------------------------------------------------- live preview

class LiveAudio {
  ctx: AudioContext | null = null;
  private bus: AudioNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private gen = 0;

  private keepAlive: HTMLAudioElement | null = null;

  get activeSources() { return this.sources.length; }
  get state() { return this.ctx?.state ?? 'none'; }

  /**
   * iOS mutes Web Audio while the ring/silent switch is on, unless the page's
   * audio session is "playback" (what video players use). Safari 17+ exposes
   * navigator.audioSession; older iOS switches category once an HTML media
   * element is playing, so a silent looping <audio> is started as a fallback.
   */
  private forcePlaybackSession() {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    try { if (nav.audioSession) nav.audioSession.type = 'playback'; } catch { /* unsupported */ }
    if (!this.keepAlive) {
      // 0.1 s of silence as a WAV data URI
      const n = 4410, b = new DataView(new ArrayBuffer(44 + n * 2));
      const w = (o: number, t: string) => { for (let i = 0; i < t.length; i++) b.setUint8(o + i, t.charCodeAt(i)); };
      w(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true);
      b.setUint16(22, 1, true); b.setUint32(24, 44100, true); b.setUint32(28, 88200, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true);
      w(36, 'data'); b.setUint32(40, n * 2, true);
      const url = URL.createObjectURL(new Blob([b.buffer], { type: 'audio/wav' }));
      const a = new Audio(url);
      a.loop = true;
      a.setAttribute('playsinline', '');
      a.preload = 'auto';
      this.keepAlive = a;
    }
    this.keepAlive.play().catch(() => { /* not allowed outside a gesture; retried on next tap */ });
  }

  /** Must run inside a user gesture on iOS (play button tap). */
  unlock() {
    this.forcePlaybackSession();
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -3;
      comp.ratio.value = 12;
      comp.connect(this.ctx.destination);
      this.bus = comp;
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    // iOS: play a silent buffer in the gesture to fully unlock output
    const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.ctx.destination);
    s.start();
  }

  async start(project: Project, t: number) {
    this.stop();
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    const gen = ++this.gen;
    const startedAt = ctx.currentTime + 0.03;
    const clips = (project.audio ?? []).filter((c) => !c.muted && c.start + c.duration > t);
    for (const c of clips) {
      let buf: AudioBuffer;
      try { buf = await getBuffer(c.assetId); } catch { continue; }
      if (gen !== this.gen) return; // stopped or restarted meanwhile
      // account for time spent decoding so audio stays aligned with the picture
      const now = ctx.currentTime;
      const elapsed = Math.max(0, now - startedAt);
      const src = scheduleClip(ctx, this.bus, c, buf, t + elapsed, Math.max(now, startedAt));
      if (src) this.sources.push(src);
    }
  }

  stop() {
    this.gen++;
    for (const s of this.sources) { try { s.stop(); } catch { /* already stopped */ } s.disconnect(); }
    this.sources = [];
  }

  /** Audition a single buffer (e.g. a sound effect in the picker). */
  async preview(assetId: string) {
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    const buf = await getBuffer(assetId);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.connect(this.bus);
    s.start();
  }
}

export const liveAudio = new LiveAudio();

// ---------------------------------------------------------------- import / extract

export interface ImportedAudio { assetId: string; name: string; duration: number }

async function storeBlob(blob: Blob, name: string, duration: number): Promise<ImportedAudio> {
  const id = uid();
  await storage.saveAsset({ id, name, mime: blob.type || 'audio/mpeg', blob, size: blob.size, duration, createdAt: Date.now() });
  return { assetId: `asset:${id}`, name, duration };
}

/** Import an audio file (mp3 / m4a / aac / wav / ogg) as-is. */
export async function importAudioFile(file: File): Promise<ImportedAudio> {
  const buf = await decodeAudio(await file.arrayBuffer()).catch(() => {
    throw new Error('This audio format could not be decoded by the browser. Try MP3, M4A or WAV.');
  });
  const res = await storeBlob(file, file.name.replace(/\.[^.]+$/, ''), buf.duration);
  bufferCache.set(res.assetId, Promise.resolve(buf));
  return res;
}

/** Decode the audio track of a video file (fallback: demux with mediabunny). */
async function decodeVideoAudio(file: File): Promise<AudioBuffer> {
  try {
    return await decodeAudio(await file.arrayBuffer());
  } catch {
    const { Input, ALL_FORMATS, BlobSource, AudioBufferSink } = await import('mediabunny');
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error('This video has no audio track.');
    if (!(await track.canDecode())) throw new Error('This device cannot decode the audio of this video.');
    const sink = new AudioBufferSink(track);
    const parts: AudioBuffer[] = [];
    for await (const { buffer } of sink.buffers()) parts.push(buffer);
    if (!parts.length) throw new Error('No audio could be read from this video.');
    const sr = parts[0].sampleRate;
    const len = parts.reduce((n, b) => n + b.length, 0);
    const out = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });
    let off = 0;
    for (const b of parts) {
      for (let ch = 0; ch < 2; ch++) out.copyToChannel(b.getChannelData(Math.min(ch, b.numberOfChannels - 1)), ch, off);
      off += b.length;
    }
    return out;
  }
}

/** CapCut-style "extract audio": video file → MP3 asset. */
export async function extractAudioFromVideo(file: File, onProgress?: (f: number) => void): Promise<ImportedAudio & { mp3: Blob }> {
  const buf = await decodeVideoAudio(file);
  const mp3 = await encodeMp3(buf, 192, onProgress);
  const res = await storeBlob(mp3, file.name.replace(/\.[^.]+$/, '') + ' (audio)', buf.duration);
  bufferCache.set(res.assetId, Promise.resolve(buf));
  return { ...res, mp3 };
}

// ---------------------------------------------------------------- encoding

function toInt16(f: Float32Array) {
  const o = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    o[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return o;
}

/** MP3 (LAME via lamejs), encoded in chunks so the UI stays responsive. */
export async function encodeMp3(buf: AudioBuffer, kbps = 192, onProgress?: (f: number) => void): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const channels = Math.min(2, buf.numberOfChannels);
  const enc = new Mp3Encoder(channels, buf.sampleRate, kbps);
  const L = toInt16(buf.getChannelData(0));
  const R = channels > 1 ? toInt16(buf.getChannelData(1)) : undefined;
  const parts: BlobPart[] = [];
  const block = 1152 * 40;
  for (let i = 0; i < L.length; i += block) {
    const chunk = enc.encodeBuffer(L.subarray(i, i + block), R?.subarray(i, i + block));
    if (chunk.length) parts.push(new Uint8Array(chunk));
    if ((i / block) % 8 === 0) { onProgress?.(i / L.length); await new Promise((r) => setTimeout(r, 0)); }
  }
  const end = enc.flush();
  if (end.length) parts.push(new Uint8Array(end));
  onProgress?.(1);
  return new Blob(parts, { type: 'audio/mpeg' });
}

export function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, sr, true);
  data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([data.buffer], { type: 'audio/wav' });
}

/** Make a clip for a sound-effect preset at time t. */
export async function sfxClip(id: string, start: number, patch: Partial<AudioClip> = {}): Promise<AudioClip> {
  const p = sfxById(id);
  return { id: uid(), name: p?.label ?? id, assetId: `sfx:${id}`, start, offset: 0, duration: p?.duration ?? 1, volume: 0.9, fadeIn: 0, fadeOut: 0, ...patch };
}

/** Asset blobs referenced by a project (for JSON export). */
export async function collectAssets(project: Project) {
  const out: Record<string, { name: string; mime: string; duration: number; dataUrl: string }> = {};
  for (const c of project.audio ?? []) {
    if (!c.assetId.startsWith('asset:') || out[c.assetId]) continue;
    const a = await storage.getAsset(c.assetId.slice(6));
    if (!a) continue;
    const dataUrl = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(a.blob); });
    out[c.assetId] = { name: a.name, mime: a.mime, duration: a.duration, dataUrl };
  }
  return out;
}

export async function restoreAssets(assets: Record<string, { name: string; mime: string; duration: number; dataUrl: string }> | undefined) {
  if (!assets) return;
  for (const [key, a] of Object.entries(assets)) {
    const blob = await (await fetch(a.dataUrl)).blob();
    await storage.saveAsset({ id: key.replace(/^asset:/, ''), name: a.name, mime: a.mime, blob, size: blob.size, duration: a.duration, createdAt: Date.now() });
  }
}

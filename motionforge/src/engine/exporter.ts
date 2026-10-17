// Video export.
//
// Method A — WebCodecs (preferred): every frame is rendered at an exact
// timestamp (i / fps) and encoded with VideoEncoder, then muxed into MP4
// (H.264/HEVC) or WebM (VP9/VP8/AV1) by mediabunny. Frame-exact, and not tied
// to real-time speed.
// Method B — MediaRecorder: the canvas is captured while the timeline plays in
// real time. Output container is whatever the browser actually supports
// (Safari: MP4, Chrome/Firefox: WebM). Slow devices may drop frames.
//
// The file extension always matches the real container; nothing is renamed.
import { AudioBufferSource, BufferTarget, CanvasSource, MovOutputFormat, Mp4OutputFormat, Output, Quality, WebMOutputFormat, canEncodeAudio, canEncodeVideo, type AudioCodec, type VideoCodec } from 'mediabunny';
import { mixdown } from './audio';
import { Renderer } from './renderer';
import { ASPECTS, type Project } from './types';
import { cssFont } from './text';

export type ExportMethod = 'webcodecs' | 'mediarecorder';
export type QualityLevel = 'low' | 'medium' | 'high';

export interface ExportSettings {
  method: ExportMethod;
  /** webcodecs only */
  codec?: VideoCodec;
  /** mediarecorder only */
  mimeType?: string;
  scale: number; // 1 = 1080p reference, 0.667 = 720p, 0.5 = 540p
  fps: number;
  duration: number;
  quality: QualityLevel;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  frames: number;
  method: ExportMethod;
  droppedFrames?: number;
  elapsedMs: number;
  /** what happened to the soundtrack */
  audio: 'none' | 'included' | 'dropped';
  audioCodec?: string;
}

export interface Capabilities {
  webcodecs: { codec: VideoCodec; label: string; container: 'mp4' | 'webm'; uhd: boolean }[];
  mediarecorder: { mimeType: string; label: string; ext: string }[];
  webgl2: boolean;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function exportSize(p: Project, scale: number) {
  const a = ASPECTS[p.aspect];
  return { width: even(a.w * scale), height: even(a.h * scale) };
}

const CODEC_LABEL: Record<string, { label: string; container: 'mp4' | 'webm' }> = {
  avc: { label: 'MP4 · H.264 (best for iPhone / Photos)', container: 'mp4' },
  hevc: { label: 'MP4 · HEVC (H.265)', container: 'mp4' },
  vp9: { label: 'WebM · VP9', container: 'webm' },
  av1: { label: 'WebM · AV1', container: 'webm' },
  vp8: { label: 'WebM · VP8', container: 'webm' },
};

const MR_TYPES = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E', label: 'MP4 · H.264 (MediaRecorder)', ext: 'mp4' },
  { mimeType: 'video/mp4', label: 'MP4 (MediaRecorder)', ext: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9', label: 'WebM · VP9 (MediaRecorder)', ext: 'webm' },
  { mimeType: 'video/webm;codecs=vp8', label: 'WebM · VP8 (MediaRecorder)', ext: 'webm' },
  { mimeType: 'video/webm', label: 'WebM (MediaRecorder)', ext: 'webm' },
];

export async function detectCapabilities(width = 1080, height = 1920): Promise<Capabilities> {
  const webcodecs: Capabilities['webcodecs'] = [];
  if (typeof VideoEncoder !== 'undefined') {
    for (const codec of ['avc', 'hevc', 'vp9', 'av1', 'vp8'] as VideoCodec[]) {
      try {
        if (await canEncodeVideo(codec, { width, height, bitrate: 8e6 })) {
          // 4K = 2× the 1080-reference size; only offered when the encoder accepts it
          let uhd = false;
          try { uhd = await canEncodeVideo(codec, { width: width * 2, height: height * 2, bitrate: 40e6, frameRate: 30 }); } catch { /* no 4K */ }
          webcodecs.push({ codec, ...CODEC_LABEL[codec], uhd });
        }
      } catch { /* unsupported */ }
    }
  }
  const mediarecorder: Capabilities['mediarecorder'] = [];
  const canCapture = typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
  if (typeof MediaRecorder !== 'undefined' && canCapture) {
    for (const t of MR_TYPES) {
      try { if (MediaRecorder.isTypeSupported(t.mimeType)) mediarecorder.push(t); } catch { /* ignore */ }
    }
  }
  const c = document.createElement('canvas');
  const webgl2 = !!c.getContext('webgl2');
  return { webcodecs, mediarecorder, webgl2 };
}

function bitrateFor(w: number, h: number, fps: number, q: QualityLevel) {
  const bpp = q === 'high' ? 0.16 : q === 'medium' ? 0.09 : 0.05;
  // 4K needs a higher ceiling (~40–60 Mbps at high quality)
  const cap = w * h > 4e6 ? 60e6 : 40e6;
  return Math.round(Math.min(cap, Math.max(1e6, w * h * fps * bpp)));
}

/** Make sure every web font used by the project is loaded before frame 0. */
async function loadFonts(p: Project) {
  if (!document.fonts) return;
  // pass the real text so the needed unicode subsets (e.g. Cyrillic) are loaded
  const jobs = p.layers.filter((l) => l.type === 'text').map((l) => document.fonts.load(cssFont(l as any, 64), (l as any).text || 'A').catch(() => undefined));
  await Promise.all(jobs);
  await document.fonts.ready;
}

async function loadImages(p: Project) {
  await Promise.all(
    p.layers.filter((l) => l.type === 'image' && l.src).map((l) => new Promise<void>((res) => {
      const img = new Image();
      img.onload = img.onerror = () => res();
      img.src = (l as any).src;
    })),
  );
}

export function validateForExport(p: Project, s: ExportSettings): string[] {
  const errs: string[] = [];
  if (!p.layers.some((l) => l.visible)) errs.push('The composition has no visible layers.');
  if (!(s.duration > 0)) errs.push('Duration must be greater than zero.');
  if (s.duration > 120) errs.push('Exports are limited to 120 seconds to stay within mobile memory limits.');
  if (![24, 25, 30, 50, 60].includes(s.fps)) errs.push('Unsupported frame rate.');
  if (s.scale > 1 && s.method !== 'webcodecs') errs.push('4K needs the frame-exact WebCodecs format (real-time recording cannot keep up at 4K).');
  if (s.scale > 1 && s.duration > 60) errs.push('4K exports are limited to 60 seconds to stay within phone memory.');
  return errs;
}

const safeName = (n: string) => (n.trim() || 'motionforge').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 60);

export class ExportCancelled extends Error {
  constructor() { super('Export cancelled'); }
}

export async function exportVideo(
  project: Project,
  s: ExportSettings,
  onProgress: (stage: string, frac: number) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  const errs = validateForExport(project, s);
  if (errs.length) throw new Error(errs.join(' '));
  const t0 = performance.now();
  onProgress('Preparing renderer', 0);
  await loadFonts(project);
  await loadImages(project);
  const { width, height } = exportSize(project, s.scale);
  const canvas = document.createElement('canvas');
  // MediaRecorder captures only canvases that are in a document on some browsers
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;pointer-events:none;opacity:0.01;z-index:-1';
  document.body.appendChild(canvas);
  const renderer = new Renderer(canvas, { preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  // compile every shader up-front so failures surface before encoding
  for (const l of project.layers) {
    if (l.type !== 'shader') continue;
    const r = renderer.installShader(l.id, l.source);
    if (!r.ok) {
      renderer.destroy();
      canvas.remove();
      throw new Error(`Shader layer "${l.name}" does not compile: ${r.errors[0]?.message ?? 'unknown error'}`);
    }
  }
  const frames = Math.max(1, Math.round(s.duration * s.fps));
  // soundtrack: one deterministic offline mix of every audio clip
  let mix: AudioBuffer | null = null;
  if (project.audio?.some((c) => !c.muted)) {
    onProgress('Mixing audio', 0);
    try {
      mix = await mixdown(project, s.duration);
    } catch (e) {
      renderer.destroy();
      canvas.remove();
      throw new Error('Audio mix failed: ' + ((e as Error).message || e));
    }
  }
  try {
    if (s.method === 'webcodecs') return await viaWebCodecs();
    return await viaMediaRecorder();
  } finally {
    renderer.destroy();
    canvas.remove();
  }

  async function viaWebCodecs(): Promise<ExportResult> {
    const codec = s.codec ?? 'avc';
    let container: 'mp4' | 'webm' | 'mov' = CODEC_LABEL[codec]?.container ?? 'mp4';
    // choose an audio codec the device can encode for this container
    let audioCodec: AudioCodec | null = null;
    if (mix) {
      const can = (c: AudioCodec) => canEncodeAudio(c, { numberOfChannels: 2, sampleRate: mix!.sampleRate, bitrate: 192000 }).catch(() => false);
      if (container === 'mp4') {
        if (await can('aac')) audioCodec = 'aac';
        else { container = 'mov'; audioCodec = 'pcm-s16'; } // QuickTime MOV + PCM plays everywhere on Apple devices
      } else if (await can('opus')) audioCodec = 'opus';
    }
    const output = new Output({
      format: container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : container === 'mov' ? new MovOutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
      target: new BufferTarget(),
    });
    // Safari's hardware encoder undershoots a variable target badly on dark,
    // smooth motion graphics (a 40 Mbps 4K request came out at ~9 Mbps and
    // looked soft), so High quality asks for a constant bitrate where the
    // encoder supports it (Chromium's software H.264 does not at 4K).
    const bitrate = bitrateFor(width, height, s.fps, s.quality);
    const cbr = new Quality({ bitrate, bitrateMode: 'constant' });
    const useCbr = s.quality === 'high' && await canEncodeVideo(codec, { width, height, quality: cbr, frameRate: s.fps }).catch(() => false);
    const source = new CanvasSource(canvas, {
      codec,
      quality: useCbr ? cbr : new Quality({ bitrate }),
      keyFrameInterval: 2,
    });
    output.addVideoTrack(source, { frameRate: s.fps });
    let audioSource: AudioBufferSource | null = null;
    if (mix && audioCodec) {
      audioSource = new AudioBufferSource({ codec: audioCodec, quality: new Quality({ bitrate: 192000 }) });
      output.addAudioTrack(audioSource);
    }
    await output.start();
    if (audioSource && mix) {
      onProgress('Encoding audio', 0);
      await audioSource.add(mix);
      audioSource.close();
    }
    for (let i = 0; i < frames; i++) {
      if (signal.aborted) { await output.cancel(); throw new ExportCancelled(); }
      const t = i / s.fps;
      renderer.render(project, t, { density: 1, dt: 1 / s.fps });
      await source.add(t, 1 / s.fps);
      if (i % 3 === 0) {
        onProgress(`Encoding frame ${i + 1} / ${frames}`, (i + 1) / frames);
        await new Promise((r) => setTimeout(r, 0)); // keep UI responsive
      }
    }
    onProgress('Finalizing file', 1);
    source.close();
    await output.finalize();
    const buf = (output.target as BufferTarget).buffer;
    if (!buf || buf.byteLength === 0) throw new Error('The encoder produced an empty file.');
    const mimeType = container === 'mp4' ? 'video/mp4' : container === 'mov' ? 'video/quicktime' : 'video/webm';
    return {
      blob: new Blob([buf], { type: mimeType }),
      filename: `${safeName(project.name)}-${width}x${height}.${container}`,
      mimeType, width, height, frames, method: 'webcodecs', elapsedMs: performance.now() - t0,
      audio: !mix ? 'none' : audioCodec ? 'included' : 'dropped', audioCodec: audioCodec ?? undefined,
    };
  }

  async function viaMediaRecorder(): Promise<ExportResult> {
    let mimeType = s.mimeType ?? MR_TYPES.find((t) => MediaRecorder.isTypeSupported(t.mimeType))?.mimeType;
    if (!mimeType) throw new Error('MediaRecorder on this browser cannot record any known video format.');
    // with a soundtrack, a video-only codec string would reject the audio track
    if (mix && /webm;codecs=vp[89]$/.test(mimeType)) {
      const withOpus = mimeType + ',opus';
      mimeType = MediaRecorder.isTypeSupported(withOpus) ? withOpus : 'video/webm';
    }
    if (mix && mimeType.startsWith('video/mp4;codecs=avc1')) mimeType = 'video/mp4';
    let actx: AudioContext | null = null;
    let audioDest: MediaStreamAudioDestinationNode | null = null;
    if (mix) {
      actx = new AudioContext({ sampleRate: mix.sampleRate });
      await actx.resume().catch(() => {});
      audioDest = actx.createMediaStreamDestination();
    }
    // Prefer manual frame capture (captureStream(0) + requestFrame) so every
    // rendered frame is captured even though the export canvas is off-screen.
    let stream = (canvas as HTMLCanvasElement).captureStream(0);
    let track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
    if (!track || typeof track.requestFrame !== 'function') {
      stream.getTracks().forEach((t) => t.stop());
      stream = (canvas as HTMLCanvasElement).captureStream(s.fps);
      track = stream.getVideoTracks()[0];
    }
    const pushFrame = () => track?.requestFrame?.();
    if (audioDest) stream = new MediaStream([...stream.getVideoTracks(), ...audioDest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrateFor(width, height, s.fps, s.quality) });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>((res, rej) => {
      rec.onstop = () => res();
      rec.onerror = (e: any) => rej(new Error('MediaRecorder error: ' + (e?.error?.message ?? 'unknown')));
    });
    // draw frame 0 before starting so the first captured frame is correct
    renderer.render(project, 0, { density: 1 });
    rec.start(250);
    pushFrame();
    if (actx && audioDest && mix) {
      const src = actx.createBufferSource();
      src.buffer = mix;
      src.connect(audioDest);
      src.start();
    }
    const start = performance.now();
    let dropped = 0;
    let lastFrame = -1;
    await new Promise<void>((resolve, reject) => {
      const step = () => {
        if (signal.aborted) { rec.stop(); reject(new ExportCancelled()); return; }
        const elapsed = (performance.now() - start) / 1000;
        const i = Math.min(frames - 1, Math.floor(elapsed * s.fps));
        if (i > lastFrame) {
          dropped += Math.max(0, i - lastFrame - 1);
          lastFrame = i;
          renderer.render(project, i / s.fps, { density: 1, dt: 1 / s.fps });
          pushFrame();
          onProgress(`Recording in real time ${(i / s.fps).toFixed(1)}s / ${s.duration.toFixed(1)}s`, (i + 1) / frames);
        }
        if (elapsed >= s.duration) { resolve(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    // hold the last frame briefly so the recorder flushes it
    await new Promise((r) => setTimeout(r, 1000 / s.fps + 60));
    pushFrame();
    onProgress('Finalizing file', 1);
    rec.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    actx?.close().catch(() => {});
    const type = rec.mimeType || mimeType;
    const blob = new Blob(chunks, { type: type.split(';')[0] });
    if (blob.size === 0) throw new Error('MediaRecorder produced an empty recording. Try the WebCodecs method or a lower resolution.');
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    return {
      blob, filename: `${safeName(project.name)}-${width}x${height}.${ext}`, mimeType: type.split(';')[0], width, height, frames,
      method: 'mediarecorder', droppedFrames: dropped, elapsedMs: performance.now() - t0,
      audio: mix ? 'included' : 'none',
    };
  }
}

/** Save or share a finished video. iOS: share sheet ("Save Video" → Photos); elsewhere: download. */
export async function deliverFile(blob: Blob, filename: string, preferShare: boolean): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (preferShare && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

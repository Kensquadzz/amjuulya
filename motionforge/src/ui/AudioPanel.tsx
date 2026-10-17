import { useEffect, useRef, useState } from 'react';
import { SFX, type SfxCategory } from '../engine/sfx';
import { encodeMp3, extractAudioFromVideo, getBuffer, getPeaks, importAudioFile, liveAudio, sfxClip } from '../engine/audio';
import { storage } from '../engine/storage';
import { deliverFile } from '../engine/exporter';
import { uid } from '../engine/util';
import type { AudioClip } from '../engine/types';
import { engine, useTime } from '../state/engine';
import { getStore, useStore } from '../state/store';
import { Sheet, toast } from './controls';

const CATS: SfxCategory[] = ['Transitions', 'Hits', 'UI', 'Risers', 'Magic', 'Ambience'];

export function updateClip(id: string, patch: Partial<AudioClip>, coalesce?: string) {
  getStore().update((p) => ({ ...p, audio: (p.audio ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)) }), coalesce);
}

function addClip(c: AudioClip) {
  getStore().update((p) => ({ ...p, audio: [...(p.audio ?? []), c] }));
}

export function AudioPanel() {
  const clips = useStore((s) => s.project.audio ?? []);
  const duration = useStore((s) => s.project.duration);
  const [sfxOpen, setSfxOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useTime(250);

  const at = () => {
    const t = engine.frameTime();
    return t >= duration - 0.2 ? 0 : t;
  };

  const importFile = async (f: File) => {
    setBusy('Decoding audio…');
    try {
      const a = await importAudioFile(f);
      addClip({ id: uid(), name: a.name, assetId: a.assetId, start: at(), offset: 0, duration: Math.min(a.duration, duration - at()), volume: 1, fadeIn: 0.05, fadeOut: 0.5 });
      toast(`Added ${a.name}`, 'ok');
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(null);
  };

  const extract = async (f: File) => {
    setBusy('Extracting audio from video…');
    try {
      const a = await extractAudioFromVideo(f, (p) => setBusy(`Converting to MP3… ${Math.round(p * 100)}%`));
      addClip({ id: uid(), name: a.name, assetId: a.assetId, start: 0, offset: 0, duration: Math.min(a.duration, duration), volume: 1, fadeIn: 0.05, fadeOut: 0.5 });
      toast(`Audio extracted (${(a.mp3.size / 1048576).toFixed(1)} MB MP3) and added to the timeline`, 'ok');
    } catch (e) { toast('Could not extract audio: ' + (e as Error).message, 'error'); }
    setBusy(null);
  };

  const sorted = [...clips].sort((a, b) => a.start - b.start);
  return (
    <div className="audio-panel">
      <div className="add-row">
        <button onClick={() => setSfxOpen(true)}>＋ Sound effect</button>
        <label className="file-btn">＋ Music / audio file
          <input type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importFile(f); }} />
        </label>
        <label className="file-btn">＋ Extract from video (MP3)
          <input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) extract(f); }} />
        </label>
      </div>
      {busy && <div className="notice">{busy}</div>}
      {!clips.length && <p className="hint">No audio yet. Add sound effects (whooshes, hits, pops, typing, risers, ambience), a music file, or pull the sound out of a video. New clips start at the playhead. Audio plays with the preview and is mixed into the exported video.</p>}
      <ul className="layer-list">
        {sorted.map((c) => (
          <li key={c.id} className={`clip-row ${c.muted ? 'off' : ''} ${open === c.id ? 'sel' : ''}`}>
            <div className="clip-head">
              <button className="vis" aria-label={c.muted ? 'Unmute' : 'Mute'} onClick={() => updateClip(c.id, { muted: !c.muted })}>{c.muted ? '🔇' : '🔊'}</button>
              <button className="lname" onClick={() => setOpen(open === c.id ? null : c.id)}>
                <span className="lt lt-audio">♪</span>
                <span className="nm">{c.name}</span>
                <small>{c.start.toFixed(2)}s → {(c.start + c.duration).toFixed(2)}s · vol {Math.round(c.volume * 100)}%</small>
              </button>
              <div className="lactions">
                <button aria-label="Preview sound" onClick={() => liveAudio.preview(c.assetId).catch((e) => toast(e.message, 'error'))}>▶</button>
                <button aria-label="Delete clip" className="danger" onClick={() => getStore().update((p) => ({ ...p, audio: (p.audio ?? []).filter((x) => x.id !== c.id) }))}>✕</button>
              </div>
            </div>
            {open === c.id && <ClipEditor clip={c} />}
          </li>
        ))}
      </ul>
      {sfxOpen && <SfxPicker onClose={() => setSfxOpen(false)} onAdd={async (id) => { addClip(await sfxClip(id, at())); toast('Sound added at the playhead', 'ok'); }} />}
    </div>
  );
}

function Num({ label, value, min, max, step, onChange, unit }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <div className="prop">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={Math.max(min, Math.min(max, value))} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="num ro">{value.toFixed(step < 0.1 ? 2 : 1)}{unit}</span>
    </div>
  );
}

function ClipEditor({ clip }: { clip: AudioClip }) {
  const dur = useStore((s) => s.project.duration);
  const [srcLen, setSrcLen] = useState<number | null>(null);
  useEffect(() => { getBuffer(clip.assetId).then((b) => setSrcLen(b.duration)).catch(() => setSrcLen(null)); }, [clip.assetId]);
  const k = `clip:${clip.id}`;
  const maxLen = srcLen ? Math.max(0.05, srcLen - clip.offset) : dur;
  const download = async () => {
    try {
      let blob: Blob, name = clip.name.replace(/[^\w\- ]+/g, '').trim() || 'audio';
      const a = clip.assetId.startsWith('asset:') ? await storage.getAsset(clip.assetId.slice(6)) : undefined;
      if (a && a.mime === 'audio/mpeg') blob = a.blob;
      else blob = await encodeMp3(await getBuffer(clip.assetId));
      await deliverFile(blob, `${name}.mp3`, /iP(hone|ad)/.test(navigator.userAgent));
    } catch (e) { toast('MP3 export failed: ' + (e as Error).message, 'error'); }
  };
  return (
    <div className="clip-editor">
      <Waveform clip={clip} />
      <div className="prop"><label>Name</label><input className="name-input" value={clip.name} onChange={(e) => updateClip(clip.id, { name: e.target.value }, k + 'n')} /></div>
      <Num label="Volume" value={clip.volume} min={0} max={2} step={0.01} onChange={(v) => updateClip(clip.id, { volume: v }, k + 'v')} />
      <Num label="Start" value={clip.start} min={0} max={dur} step={1 / 30} unit="s" onChange={(v) => updateClip(clip.id, { start: v }, k + 's')} />
      <Num label="Trim start" value={clip.offset} min={0} max={Math.max(0, (srcLen ?? dur) - 0.05)} step={0.01} unit="s" onChange={(v) => updateClip(clip.id, { offset: v, duration: Math.min(clip.duration, (srcLen ?? 1e9) - v) }, k + 'o')} />
      <Num label="Length" value={clip.duration} min={0.05} max={Math.max(0.05, Math.min(maxLen, dur))} step={0.01} unit="s" onChange={(v) => updateClip(clip.id, { duration: v }, k + 'd')} />
      <Num label="Fade in" value={clip.fadeIn} min={0} max={Math.max(0, clip.duration / 2)} step={0.01} unit="s" onChange={(v) => updateClip(clip.id, { fadeIn: v }, k + 'fi')} />
      <Num label="Fade out" value={clip.fadeOut} min={0} max={Math.max(0, clip.duration / 2)} step={0.01} unit="s" onChange={(v) => updateClip(clip.id, { fadeOut: v }, k + 'fo')} />
      <div className="row-btns">
        <button onClick={() => updateClip(clip.id, { start: engine.frameTime() })}>Move to playhead</button>
        <button onClick={() => { const c = { ...clip, id: uid(), start: Math.min(dur - 0.05, clip.start + clip.duration) }; getStore().update((p) => ({ ...p, audio: [...(p.audio ?? []), c] })); }}>Duplicate</button>
        <button onClick={download}>⤓ Download MP3</button>
      </div>
    </div>
  );
}

/** Waveform of the trimmed part of a clip. */
export function Waveform({ clip, height = 44 }: { clip: AudioClip; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let dead = false;
    Promise.all([getPeaks(clip.assetId), getBuffer(clip.assetId)]).then(([peaks, buf]) => {
      const c = ref.current;
      if (dead || !c) return;
      const w = c.clientWidth || 300;
      c.width = w * devicePixelRatio;
      c.height = height * devicePixelRatio;
      const x = c.getContext('2d')!;
      x.scale(devicePixelRatio, devicePixelRatio);
      x.fillStyle = '#7fd8ff';
      const a = clip.offset / buf.duration, b = Math.min(1, (clip.offset + clip.duration) / buf.duration);
      for (let i = 0; i < w; i++) {
        const k = Math.floor((a + ((b - a) * i) / w) * peaks.length);
        const v = (peaks[Math.min(peaks.length - 1, k)] ?? 0) * clip.volume;
        const h = Math.max(1, Math.min(1, v) * height);
        x.fillRect(i, (height - h) / 2, 1, h);
      }
    }).catch(() => {});
    return () => { dead = true; };
  }, [clip.assetId, clip.offset, clip.duration, clip.volume, height]);
  return <canvas ref={ref} className="waveform" style={{ height, width: '100%' }} />;
}

function SfxPicker({ onClose, onAdd }: { onClose: () => void; onAdd: (id: string) => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const play = async (id: string) => {
    setLoading(id);
    try { await liveAudio.preview(`sfx:${id}`); } catch (e) { toast((e as Error).message, 'error'); }
    setLoading(null);
  };
  return (
    <Sheet title="Sound effects" onClose={onClose}>
      <p className="hint">All sounds are generated on your device (no downloads, no licensing). Tap ▶ to listen, ＋ to add at the playhead.</p>
      {CATS.map((cat) => (
        <div key={cat} className="fx-cat">
          <h3>{cat}</h3>
          <ul className="layer-list">
            {SFX.filter((s) => s.category === cat).map((s) => (
              <li key={s.id}>
                <button className="vis" aria-label={`Preview ${s.label}`} onClick={() => play(s.id)}>{loading === s.id ? '…' : '▶'}</button>
                <span className="lname"><span className="nm">{s.label}</span><small>{s.duration.toFixed(1)}s</small></span>
                <div className="lactions"><button aria-label={`Add ${s.label}`} onClick={() => onAdd(s.id)}>＋</button></div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Sheet>
  );
}

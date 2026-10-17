import { useEffect, useMemo, useRef, useState } from 'react';
import { SFX, sfxById, type SfxCategory } from '../engine/sfx';
import { allSfxZip, clipRole, encodeMp3, extractAudioFromVideo, getBuffer, getPeaks, importAudioFile, liveAudio, sfxClip, sfxToMp3 } from '../engine/audio';
import { storage, type StoredAsset } from '../engine/storage';
import { deliverFile } from '../engine/exporter';
import { uid } from '../engine/util';
import type { AudioClip } from '../engine/types';
import { engine, useTime } from '../state/engine';
import { getStore, useStore } from '../state/store';
import { Section, Sheet, toast } from './controls';

const CATS: SfxCategory[] = ['Studio', 'Transitions', 'Hits', 'Pops', 'UI', 'Notifications', 'Typing', 'Sci-fi', 'Risers', 'Magic', 'Ambience', 'Music'];
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function updateClip(id: string, patch: Partial<AudioClip>, coalesce?: string) {
  getStore().update((p) => ({ ...p, audio: (p.audio ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)) }), coalesce);
}

const addClips = (...c: AudioClip[]) => getStore().update((p) => ({ ...p, audio: [...(p.audio ?? []), ...c] }));
const removeWhere = (fn: (c: AudioClip) => boolean) => getStore().update((p) => ({ ...p, audio: (p.audio ?? []).filter((c) => !fn(c)) }));

/** Replace the background music with a new clip spanning the whole video. */
function setMusic(assetId: string, name: string, srcDuration: number) {
  const d = getStore().state.project.duration;
  getStore().update((p) => ({
    ...p,
    audio: [
      ...(p.audio ?? []).filter((c) => clipRole(c) !== 'music'),
      { id: uid(), name, assetId, start: 0, offset: 0, duration: Math.min(srcDuration, d), volume: 0.8, fadeIn: 0.3, fadeOut: Math.min(1.5, d / 4), role: 'music' },
    ],
  }));
}

const FAV_KEY = 'mf.sfxFavs';
function useFavs() {
  const [favs, setFavs] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } });
  const toggle = (id: string) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* */ }
  };
  return { favs, toggle };
}

export function AudioPanel() {
  const clips = useStore((s) => s.project.audio ?? []);
  const duration = useStore((s) => s.project.duration);
  const [picker, setPicker] = useState<null | 'sfx' | 'music'>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [library, setLibrary] = useState<StoredAsset[]>([]);
  useTime(250);
  const refreshLib = () => storage.listAssets().then(setLibrary).catch(() => {});
  useEffect(() => { refreshLib(); }, [clips.length]);

  const at = () => { const t = engine.frameTime(); return t >= duration - 0.2 ? 0 : t; };
  const music = clips.filter((c) => clipRole(c) === 'music');
  const effects = clips.filter((c) => clipRole(c) === 'sfx').sort((a, b) => a.start - b.start);

  const pickMusicFile = async (f: File) => {
    setBusy('Loading your music…');
    try { const a = await importAudioFile(f); setMusic(a.assetId, a.name, a.duration); toast(`Background music: ${a.name}`, 'ok'); refreshLib(); }
    catch (e) { toast((e as Error).message, 'error'); }
    setBusy(null);
  };
  const pickVideoSound = async (f: File) => {
    setBusy('Extracting the sound from your video…');
    try {
      const a = await extractAudioFromVideo(f, (p) => setBusy(`Converting to MP3… ${Math.round(p * 100)}%`));
      setMusic(a.assetId, a.name, a.duration);
      toast(`Video sound saved to My sounds (${(a.mp3.size / 1048576).toFixed(1)} MB MP3) and set as background`, 'ok');
      refreshLib();
    } catch (e) { toast('Could not extract audio: ' + (e as Error).message, 'error'); }
    setBusy(null);
  };
  const addSfxFile = async (f: File) => {
    setBusy('Loading sound…');
    try {
      const a = await importAudioFile(f);
      addClips({ id: uid(), name: a.name, assetId: a.assetId, start: at(), offset: 0, duration: Math.min(a.duration, duration - at()), volume: 1, fadeIn: 0, fadeOut: 0.05, role: 'sfx' });
      toast(`Added ${a.name} at the playhead`, 'ok');
      refreshLib();
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(null);
  };

  return (
    <div className="audio-panel">
      {busy && <div className="notice">{busy}</div>}

      <Section title={`🎵 Background music (${music.length})`}>
        {music.length === 0 && <p className="hint">No background music. Use your own song, the sound of a video, or a built-in pad / beat.</p>}
        <ClipList clips={music} open={open} setOpen={setOpen} />
        <div className="row-btns">
          <label className="file-btn primary-file">🎵 Use my music…
            <input type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickMusicFile(f); }} />
          </label>
          <label className="file-btn">🎬 Sound from a video…
            <input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickVideoSound(f); }} />
          </label>
          <button onClick={() => setPicker('music')}>Built-in music…</button>
          {music.length > 0 && <button className="danger" onClick={() => { removeWhere((c) => clipRole(c) === 'music'); toast('Background music removed (Undo to restore)'); }}>✕ Remove music</button>}
        </div>
      </Section>

      <Section title={`🔊 Sound effects (${effects.length})`}>
        {effects.length === 0 && <p className="hint">No sound effects. New effects are placed at the playhead — move the playhead to where the motion happens, then add.</p>}
        <ClipList clips={effects} open={open} setOpen={setOpen} />
        <div className="row-btns">
          <button className="primary" onClick={() => setPicker('sfx')}>＋ Add sound effect</button>
          <label className="file-btn">＋ My own sound file…
            <input type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addSfxFile(f); }} />
          </label>
          {effects.length > 0 && <button className="danger" onClick={() => { removeWhere((c) => clipRole(c) === 'sfx'); toast('All sound effects removed (Undo to restore)'); }}>✕ Remove all effects</button>}
        </div>
      </Section>

      <Section title={`📁 My sounds (${library.length})`} defaultOpen={false}>
        <p className="hint">Every song, video sound and sound file you add is saved on this device and can be reused in any project.</p>
        <ul className="layer-list">
          {library.map((a) => (
            <li key={a.id}>
              <button className="vis" aria-label={`Play ${a.name}`} onClick={() => liveAudio.preview(`asset:${a.id}`).catch((e) => toast(e.message, 'error'))}>▶</button>
              <span className="lname"><span className="nm">{a.name}</span><small>{a.duration.toFixed(1)}s · {(a.size / 1048576).toFixed(1)} MB</small></span>
              <div className="lactions">
                <button aria-label="Use as background music" title="Use as background music" onClick={() => setMusic(`asset:${a.id}`, a.name, a.duration)}>🎵</button>
                <button aria-label="Add at playhead" title="Add at playhead" onClick={() => addClips({ id: uid(), name: a.name, assetId: `asset:${a.id}`, start: at(), offset: 0, duration: Math.min(a.duration, duration - at()), volume: 1, fadeIn: 0, fadeOut: 0.05, role: 'sfx' })}>＋</button>
                <button aria-label="Download MP3" onClick={async () => {
                  const blob = a.mime === 'audio/mpeg' ? a.blob : await encodeMp3(await getBuffer(`asset:${a.id}`));
                  deliverFile(blob, `${a.name.replace(/[^\w\- ]+/g, '').trim() || 'sound'}.mp3`, isIOS());
                }}>⤓</button>
                <button aria-label="Delete from My sounds" className="danger" onClick={async () => {
                  const used = getStore().state.project.audio?.some((c) => c.assetId === `asset:${a.id}`);
                  if (!confirm(used ? `"${a.name}" is used in this project. Delete it anyway?` : `Delete "${a.name}" from this device?`)) return;
                  if (used) removeWhere((c) => c.assetId === `asset:${a.id}`);
                  await storage.deleteAsset(a.id);
                  refreshLib();
                }}>✕</button>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {picker && (
        <SfxPicker
          mode={picker}
          onClose={() => setPicker(null)}
          onAdd={async (id) => {
            const p = sfxById(id);
            if (p && (p.category === 'Ambience' || p.category === 'Music')) { setMusic(`sfx:${id}`, p.label, p.duration); toast(`Background music: ${p.label}`, 'ok'); }
            else { addClips({ ...(await sfxClip(id, at())), role: 'sfx' }); toast(`${p?.label ?? 'Sound'} added at ${at().toFixed(2)}s`, 'ok'); }
          }}
        />
      )}
    </div>
  );
}

function ClipList({ clips, open, setOpen }: { clips: AudioClip[]; open: string | null; setOpen: (id: string | null) => void }) {
  return (
    <ul className="layer-list">
      {clips.map((c) => (
        <li key={c.id} className={`clip-row ${c.muted ? 'off' : ''} ${open === c.id ? 'sel' : ''}`}>
          <div className="clip-head">
            <button className="vis" aria-label={c.muted ? 'Unmute' : 'Mute'} onClick={() => updateClip(c.id, { muted: !c.muted })}>{c.muted ? '🔇' : '🔊'}</button>
            <button className="lname" onClick={() => setOpen(open === c.id ? null : c.id)}>
              <span className="lt lt-audio">♪</span>
              <span className="nm">{c.name}</span>
              <small>{c.start.toFixed(2)}s → {(c.start + c.duration).toFixed(2)}s · vol {Math.round(c.volume * 100)}% · tap to edit</small>
            </button>
            <div className="lactions">
              <button aria-label="Preview sound" onClick={() => liveAudio.preview(c.assetId).catch((e) => toast(e.message, 'error'))}>▶</button>
              <button aria-label="Delete clip" className="danger" onClick={() => removeWhere((x) => x.id === c.id)}>✕</button>
            </div>
          </div>
          {open === c.id && <ClipEditor clip={c} />}
        </li>
      ))}
    </ul>
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

export function ClipEditor({ clip }: { clip: AudioClip }) {
  const dur = useStore((s) => s.project.duration);
  const [srcLen, setSrcLen] = useState<number | null>(null);
  useEffect(() => { getBuffer(clip.assetId).then((b) => setSrcLen(b.duration)).catch(() => setSrcLen(null)); }, [clip.assetId]);
  const k = `clip:${clip.id}`;
  const maxLen = srcLen ? Math.max(0.05, srcLen - clip.offset) : dur;
  const download = async () => {
    try {
      const name = clip.name.replace(/[^\w\- ]+/g, '').trim() || 'audio';
      const a = clip.assetId.startsWith('asset:') ? await storage.getAsset(clip.assetId.slice(6)) : undefined;
      const blob = a && a.mime === 'audio/mpeg' ? a.blob : await encodeMp3(await getBuffer(clip.assetId));
      await deliverFile(blob, `${name}.mp3`, isIOS());
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
        <button onClick={() => addClips({ ...clip, id: uid(), start: Math.min(dur - 0.05, clip.start + clip.duration) })}>Duplicate</button>
        <button onClick={download}>⤓ MP3</button>
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

function SfxPicker({ mode, onClose, onAdd }: { mode: 'sfx' | 'music'; onClose: () => void; onAdd: (id: string) => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [zip, setZip] = useState<string | null>(null);
  const { favs, toggle } = useFavs();
  const cats = mode === 'music' ? (['Music', 'Ambience'] as SfxCategory[]) : CATS.filter((c) => c !== 'Music' && c !== 'Ambience');
  const list = useMemo(() => SFX.filter((s) => cats.includes(s.category) && (!q || s.label.toLowerCase().includes(q.toLowerCase()))), [q, mode]);
  const play = async (id: string) => {
    setLoading(id);
    try { await liveAudio.preview(`sfx:${id}`); } catch (e) { toast((e as Error).message, 'error'); }
    setLoading(null);
  };
  const row = (s: (typeof SFX)[number]) => (
    <li key={s.id}>
      <button className="vis" aria-label={`Preview ${s.label}`} onClick={() => play(s.id)}>{loading === s.id ? '…' : '▶'}</button>
      <span className="lname"><span className="nm">{s.label}</span><small>{s.pack ? `${s.pack} · ` : ''}{s.category} · {s.duration.toFixed(1)}s</small></span>
      <div className="lactions">
        <button aria-label={favs.includes(s.id) ? `Unstar ${s.label}` : `Star ${s.label}`} className={favs.includes(s.id) ? 'star on' : 'star'} onClick={() => toggle(s.id)}>★</button>
        <button aria-label={`Download ${s.label}`} onClick={async () => deliverFile(await sfxToMp3(s.id), `${s.label.replace(/[^\w\- ()]+/g, '').trim()}.mp3`, isIOS())}>⤓</button>
        <button aria-label={`Add ${s.label}`} className="add" onClick={() => onAdd(s.id)}>＋</button>
      </div>
    </li>
  );
  return (
    <Sheet title={mode === 'music' ? 'Built-in music & ambience' : 'Sound effects'} onClose={onClose}>
      <p className="hint">{SFX.length} sounds: recorded Studio samples plus effects generated on this device. ▶ listen · ★ favourite · ⤓ save MP3 · ＋ add.</p>
      <div className="row-btns">
        <input className="name-input" placeholder="Search sounds…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sounds" />
        <button disabled={!!zip} onClick={async () => {
          try {
            const blob = await allSfxZip((d, n) => setZip(`Saving ${d}/${n}…`));
            setZip(null);
            await deliverFile(blob, 'MotionForge-SFX.zip', isIOS());
          } catch (e) { setZip(null); toast('ZIP failed: ' + (e as Error).message, 'error'); }
        }}>{zip ?? '⤓ Save all sounds (ZIP)'}</button>
      </div>
      {favs.length > 0 && !q && (
        <div className="fx-cat">
          <h3>★ Favourites</h3>
          <ul className="layer-list">{SFX.filter((s) => favs.includes(s.id) && cats.includes(s.category)).map(row)}</ul>
        </div>
      )}
      {cats.map((cat) => {
        const items = list.filter((s) => s.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat} className="fx-cat">
            <h3>{cat} ({items.length})</h3>
            <ul className="layer-list">{items.map(row)}</ul>
          </div>
        );
      })}
    </Sheet>
  );
}

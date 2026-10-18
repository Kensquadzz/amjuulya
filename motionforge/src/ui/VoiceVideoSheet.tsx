import { useState } from 'react';
import { getBuffer, importAudioFile, extractAudioFromVideo } from '../engine/audio';
import { buildVoiceProject, VOICE_STYLES, type VoiceStyle, type VoiceVideoResult } from '../engine/voiceVideo';
import { storage } from '../engine/storage';
import { engine } from '../state/engine';
import { getStore } from '../state/store';
import type { AspectId } from '../engine/types';
import { Sheet, toast } from './controls';
import { analyzeReference, type RefProfile } from '../engine/refAnalysis';

const fmtT = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const SHOT_MN: Record<string, string> = { dock: 'Апп + курсор', brand: 'Брэнд дэлбэрэлт', search: 'Хайлт + бичих', cards: 'Хувилбарууд', grid: 'Загварын сүлжээ', roll: 'Үгийн жагсаалт', title: 'Гарчиг', features: 'Давуу талууд', stat: 'Тоо / үнэ', cta: 'Коммент CTA' };

/** Voice-over -> a complete video: the voice length is the timeline, every phrase gets its own shot. */
export function VoiceVideoSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [voice, setVoice] = useState<{ assetId: string; name: string; duration: number; buffer: AudioBuffer } | null>(null);
  const [busy, setBusy] = useState('');
  const [script, setScript] = useState('');
  const [brand, setBrand] = useState('');
  const [accent, setAccent] = useState('#2f5bff');
  const [images, setImages] = useState<string[]>([]);
  const [outro, setOutro] = useState(0.6);
  const [aspect, setAspect] = useState<AspectId>('9:16');
  const [subs, setSubs] = useState(true);
  const [music, setMusic] = useState(true);
  const [result, setResult] = useState<VoiceVideoResult | null>(null);
  const [ref, setRef] = useState<RefProfile | null>(null);
  const [useRef, setUseRef] = useState(true);
  const [accent2, setAccent2] = useState('#18b4ff');
  const [style, setStyle] = useState<VoiceStyle>('app');

  const pickVoice = async (f: File) => {
    setBusy('Дууг уншиж байна…'); setResult(null);
    try {
      const a = /^video\//.test(f.type) ? await extractAudioFromVideo(f, (p) => setBusy(`Видеоноос дуу ялгаж байна… ${Math.round(p * 100)}%`)) : await importAudioFile(f);
      const buffer = await getBuffer(a.assetId);
      setVoice({ assetId: a.assetId, name: a.name, duration: buffer.duration, buffer });
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy('');
  };
  const pickImages = async (fs: FileList) => {
    const out: string[] = [];
    for (const f of Array.from(fs).slice(0, 8)) out.push(await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); }));
    setImages(out); setResult(null);
  };
  const pickRef = async (f: File) => {
    setBusy('Жишээ видеог шинжилж байна… 0%'); setResult(null);
    try {
      const r = await analyzeReference(f, (p) => setBusy(`Жишээ видеог шинжилж байна… ${Math.round(p * 100)}%`));
      setRef(r);
      if (useRef) { setAccent(r.accent); setAccent2(r.accent2); }
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy('');
  };
  const plan = () => {
    if (!voice) return;
    setResult(buildVoiceProject({ voice, script, brand: brand.trim() || 'YOUR BRAND', accent, accent2, pace: ref && useRef ? Math.min(7, Math.max(1.8, ref.avgShot)) : undefined, images, outro, aspect, subtitles: subs, music, style, name: brand.trim() ? `${brand.trim()} — voice video` : undefined }));
  };
  const create = async () => {
    if (!result) return;
    await storage.saveProject(getStore().state.project).catch(() => {});
    getStore().load(result.project);
    await storage.saveProject(result.project).catch(() => {});
    getStore().markSaved();
    engine.player?.seek(0);
    toast(`Видео бэлэн: ${result.duration.toFixed(1)} сек, ${result.plan.length} хэсэг`, 'ok');
    onCreated();
  };
  const errors = result?.issues.filter((i) => i.level === 'error') ?? [];

  return (
    <Sheet title="🎙 Voice over → Видео" onClose={onClose}>
      <div className="vv">
        <p className="hint">Дууны бодит урт видеоны уртыг тогтооно. Ярианы завсрыг утсан дээрээ илрүүлж, скриптийн мөр бүрийг өөр өөр хэсэг (shot) болгоно. Яриаг текст болгох (speech-to-text) ажиллахгүй тул subtitle-д скриптээ бичнэ үү.</p>
        <label className="file-btn primary-file">{voice ? `🎙 ${voice.name} · ${fmtT(voice.duration)}` : '🎙 Voice over сонгох (аудио эсвэл видео)…'}
          <input type="file" accept="audio/*,video/*,.mp3,.m4a,.wav,.aac,.mp4,.mov" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickVoice(f); }} />
        </label>
        {busy && <p className="hint">{busy}</p>}
        <label className="file-btn">{ref ? `🎞 ${ref.name}` : '🎞 Жишээ видео (заавал биш)…'}
          <input type="file" accept="video/*,.mp4,.mov,.webm" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickRef(f); }} />
        </label>
        {ref && (
          <div className="vv-ref">
            <img src={ref.sheet} alt="Жишээ видеоны хэсгүүд" />
            <p className="hint">{ref.duration.toFixed(1)} сек · {ref.shots.length} хэсэг · дундаж {ref.avgShot.toFixed(1)} сек · гэрэлтэлт {Math.round(ref.brightness * 100)}% · өнгө {Math.round(ref.saturation * 100)}%</p>
            <div className="vv-pal">{ref.palette.map((c) => <button key={c} style={{ background: c }} title={c} onClick={() => { setAccent(c); setResult(null); }} />)}</div>
            <label className="vv-check"><input type="checkbox" checked={useRef} onChange={(e) => { setUseRef(e.target.checked); if (e.target.checked) { setAccent(ref.accent); setAccent2(ref.accent2); } setResult(null); }} /> Жишээний өнгө, хэмнэлийг ашиглах</label>
            <p className="hint">Зөвхөн кадр, өнгө, хэсэг солигдох цэгийг хэмждэг. Видеоны агуулгыг ойлгодоггүй, юу ч хуулахгүй.</p>
          </div>
        )}
        <label className="vv-l">Скрипт — нэг мөрөнд нэг өгүүлбэр / санаа</label>
        <textarea className="vv-script" rows={7} value={script} placeholder={'Офист ажилладаг уу?\nЭнэ багц танд их хэрэг болно.\n…\n«1» гэж коммент бичээрэй.'} onChange={(e) => { setScript(e.target.value); setResult(null); }} />
        <div className="prop"><label>Брэнд</label><input value={brand} placeholder="HR OFFICE MASTER PACK" onChange={(e) => { setBrand(e.target.value); setResult(null); }} /></div>
        <div className="prop"><label>Хэв маяг</label><div className="vv-styles">{VOICE_STYLES.map((x) => <button key={x.id} className={style === x.id ? 'on' : ''} onClick={() => { setStyle(x.id); setResult(null); }}>{x.label}</button>)}</div></div>
        <div className="prop"><label>Өнгө</label><input type="color" value={accent} onChange={(e) => { setAccent(e.target.value); setResult(null); }} /><input type="color" value={accent2} onChange={(e) => { setAccent2(e.target.value); setResult(null); }} /></div>
        <div className="prop"><label>Зураг ({images.length})</label><label className="file-btn">Бүтээгдэхүүн / баримтын зураг…<input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) pickImages(e.target.files); e.target.value = ''; }} /></label></div>
        <div className="prop"><label>Хэмжээ</label><select value={aspect} onChange={(e) => { setAspect(e.target.value as AspectId); setResult(null); }}><option value="9:16">9:16 Reels</option><option value="1:1">1:1</option><option value="4:5">4:5</option><option value="16:9">16:9</option></select></div>
        <div className="prop"><label>Төгсгөл</label><select value={outro} onChange={(e) => { setOutro(+e.target.value); setResult(null); }}><option value={0}>Яриатай зэрэг дуусна</option><option value={0.6}>+0.6 сек</option><option value={1.5}>+1.5 сек</option><option value={3}>+3 сек</option></select></div>
        <label className="vv-check"><input type="checkbox" checked={subs} onChange={(e) => { setSubs(e.target.checked); setResult(null); }} /> Subtitle (нэг байранд тогтмол)</label>
        <label className="vv-check"><input type="checkbox" checked={music} onChange={(e) => { setMusic(e.target.checked); setResult(null); }} /> Арын хөгжим (Kenyset)</label>
        <button className="primary" disabled={!voice} onClick={plan}>Storyboard гаргах</button>
        {result && (
          <>
            <p className="vv-sum">Дуу {fmtT(voice!.duration)} → видео <b>{fmtT(result.duration)}</b> · {result.speech.length} ярианы хэсэг · {result.plan.length} shot</p>
            <ol className="vv-plan">
              {result.plan.map((s) => <li key={s.index}><span className="t">{fmtT(s.start)}–{fmtT(s.end)}</span> <b>{SHOT_MN[s.shot] ?? s.shot}</b><small>{s.text || '—'}</small></li>)}
            </ol>
            {result.issues.map((i, k) => <p key={k} className={`notice ${i.level === 'error' ? 'error' : ''}`}>{i.msg}</p>)}
            <button className="primary" disabled={errors.length > 0} onClick={create}>Видео үүсгэх ({result.plan.length} хэсэг)</button>
          </>
        )}
      </div>
    </Sheet>
  );
}

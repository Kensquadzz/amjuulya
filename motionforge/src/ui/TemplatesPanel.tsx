import { useEffect, useRef, useState } from 'react';
import { TEMPLATES, TEMPLATE_CATEGORIES, projectFromTemplate, type Template, type TemplateCategory } from '../engine/templates';
import { TEMPLATE_INFO } from '../engine/templateInfo';
import { newProject, normalizeProject } from '../engine/project';
import { storage, type SavedPreset } from '../engine/storage';
import { Renderer } from '../engine/renderer';
import { liveAudio } from '../engine/audio';
import { cssFont } from '../engine/text';
import { deepClone, uid } from '../engine/util';
import type { AspectId, Project } from '../engine/types';
import { engine } from '../state/engine';
import { getStore, useStore } from '../state/store';
import { Sheet, toast } from './controls';
import { templateThumb } from './thumbs';

export function useThumb(load: () => Promise<string>, key: string) {
  const [src, setSrc] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dead = false;
    const el = ref.current;
    const go = () => load().then((u) => { if (!dead) setSrc(u); }).catch(() => {});
    // only render thumbnails that scroll into view
    if (el && 'IntersectionObserver' in window) {
      // observe against the scrolling panel so cards just below the fold render ahead of time
      const root = el.closest('.panel-body, .sheet-body') as Element | null;
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { root, rootMargin: '600px 0px' });
      io.observe(el);
      return () => { dead = true; io.disconnect(); };
    }
    go();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { src, ref };
}

// favourite templates (per device)
const FAV_KEY = 'mf.favTemplates';
const readFavs = (): string[] => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; } };
function useFavTemplates() {
  const [favs, setFavs] = useState<string[]>(readFavs);
  const toggle = (id: string) => setFavs((f) => {
    const n = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
    try { localStorage.setItem(FAV_KEY, JSON.stringify(n)); } catch { /* private mode */ }
    return n;
  });
  return { favs, toggle };
}

function facts(tpl: Template, duration?: number) {
  const b = tpl.build(duration ? { duration } : undefined);
  const slots = b.layers.filter((l) => l.type === 'image' && !l.src).length;
  const scenes = TEMPLATE_INFO[tpl.id]?.scenes ?? 1;
  return { duration: b.duration, sound: (b.audio?.length ?? 0) > 0, slots, scenes, texts: b.layers.filter((l) => l.type === 'text').length };
}

function TemplateCard({ tpl, current, onOpen, fav, onFav }: { tpl: Template; current: boolean; onOpen: () => void; fav: boolean; onFav: () => void }) {
  const aspect = useStore((s) => s.project.aspect);
  const { src, ref } = useThumb(() => templateThumb(tpl.id, aspect), `${tpl.id}:${aspect}`);
  const f = useState(() => facts(tpl))[0];
  return (
    <div className={`tpl ${current ? 'cur' : ''}`} ref={ref}>
      <button className="tpl-main" onClick={onOpen}>
        <span className={`thumb ar-${aspect.replace(':', 'x')}`} style={{ background: `linear-gradient(135deg, ${tpl.swatch[0]} 0%, ${tpl.swatch[0]} 45%, ${tpl.swatch[1]} 100%)` }}>
          {src ? <img src={src} alt="" /> : <span className="thumb-wait">rendering…</span>}
          <span className="badges">
            {tpl.categories.includes('Cinematic 3D') && <span className="b3d">3D</span>}
            <span>{f.duration}s</span>
            <span>{aspect}</span>
            {f.sound && <span>🔊</span>}
            {f.slots > 0 && <span>🖼 {f.slots}</span>}
          </span>
          <span className="play-hint">▶</span>
        </span>
        <b>{tpl.name}</b>
        <small>{TEMPLATE_INFO[tpl.id]?.desc ?? tpl.categories.join(' · ')}</small>
      </button>
      <button className={`tpl-fav ${fav ? 'on' : ''}`} aria-label={fav ? `Unfavourite ${tpl.name}` : `Favourite ${tpl.name}`} aria-pressed={fav} onClick={onFav}>★</button>
    </div>
  );
}

/** Live animated preview of a template (own renderer), with optional sound. */
function PreviewSheet({ tpl, onClose, onUse, onDuplicate }: { tpl: Template; onClose: () => void; onUse: (o: { aspect: AspectId; duration?: number }) => void; onDuplicate: () => void }) {
  const projectAspect = useStore((s) => s.project.aspect);
  const [aspect, setAspect] = useState<AspectId>(projectAspect);
  const [duration, setDuration] = useState<number | undefined>(tpl.defaultDuration);
  const holder = useRef<HTMLDivElement>(null);
  const [sound, setSound] = useState(false);
  const [t, setT] = useState(0);
  const projRef = useRef<Project | null>(null);
  const soundRef = useRef(false);
  const tRef = useRef(0);
  const f = facts(tpl, duration);

  useEffect(() => {
    const p = projectFromTemplate(tpl, aspect, duration);
    projRef.current = p;
    const canvas = document.createElement('canvas');
    canvas.className = 'preview-live';
    holder.current?.appendChild(canvas);
    const r = new Renderer(canvas);
    r.placeholders = true;
    const A = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] }[aspect];
    // render at the pixel size the sheet actually shows (retina-sharp), up to full 1080p
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const boxW = (holder.current?.clientWidth ?? 360) - 16;
    const cssH = Math.min(window.innerHeight * 0.52, (boxW * A[1]) / A[0]);
    const k = Math.min(1, (cssH * dpr) / A[1]);
    r.setSize(A[0] * k, A[1] * k);
    let raf = 0, start = performance.now(), last = 0, lastUi = 0, dead = false;
    engine.player?.pause();
    Promise.all([r.prepareTextures(p), ...p.layers.filter((l) => l.type === 'text').map((l) => document.fonts?.load(cssFont(l as any, 64), (l as any).text || 'A').catch(() => {}))]).then(() => {
      if (dead) return;
      start = performance.now();
      const tick = (now: number) => {
        const tt = ((now - start) / 1000) % p.duration;
        if (tt < last && soundRef.current) liveAudio.start(p, 0); // looped: restart the sound with the picture
        last = tt;
        tRef.current = tt;
        r.render(p, tt, { density: 1 });
        if (now - lastUi > 200) { lastUi = now; setT(tt); }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      liveAudio.stop();
      r.destroy();
      canvas.remove();
    };
  }, [tpl, aspect, duration]);

  const toggleSound = () => {
    const on = !soundRef.current;
    soundRef.current = on;
    setSound(on);
    if (on && projRef.current) { liveAudio.unlock(); liveAudio.start(projRef.current, tRef.current); }
    else liveAudio.stop();
  };

  return (
    <Sheet title={tpl.name} onClose={onClose}>
      <div className="preview-holder" ref={holder} />
      <div className="row-btns">
        {f.sound && <button onClick={toggleSound}>{sound ? '🔇 Sound off' : '🔊 Play with sound'}</button>}
        <span className="hint" style={{ margin: 0, alignSelf: 'center' }}>{t.toFixed(1)}s / {f.duration}s</span>
      </div>
      <div className="tpl-opts">
        <div className="seg" role="radiogroup" aria-label="Aspect ratio">
          {(['9:16', '16:9', '1:1', '4:5'] as AspectId[]).map((a) => <button key={a} className={aspect === a ? 'on' : ''} onClick={() => setAspect(a)}>{a}</button>)}
        </div>
        {tpl.durations && (
          <div className="seg" role="radiogroup" aria-label="Duration">
            {tpl.durations.map((d) => <button key={d} className={duration === d ? 'on' : ''} onClick={() => setDuration(d)}>{d}s</button>)}
          </div>
        )}
      </div>
      <p>{TEMPLATE_INFO[tpl.id]?.desc}</p>
      <ul className="facts">
        <li>⏱ {f.duration} seconds{f.scenes > 1 ? ` · ${f.scenes} scenes` : ''}</li>
        <li>✏️ {f.texts} editable text layer{f.texts === 1 ? '' : 's'}</li>
        {f.slots > 0 && <li>🖼 {f.slots} image slot{f.slots === 1 ? '' : 's'} — dashed boxes; add your photos (background is removed automatically). They are not exported when empty.</li>}
        <li>{f.sound ? '🔊 Includes sound design (editable in the Audio tab)' : '🔇 No sound — add music or effects in the Audio tab'}</li>
        <li>🏷 {tpl.categories.join(' · ')} · {aspect}</li>
        {tpl.categories.includes('Cinematic 3D') && <li>🎥 Real-time 3D scene: change the brand text, logo, pictures, colours, lighting and camera movement under the 3D layer’s “Adjust”.</li>}
      </ul>
      <div className="row-btns">
        <button className="primary" onClick={() => onUse({ aspect, duration })}>Use this template</button>
        <button onClick={onDuplicate}>Save a copy to My presets</button>
      </div>
    </Sheet>
  );
}

export function TemplatesPanel({ onUsed }: { onUsed?: () => void } = {}) {
  const [cat, setCat] = useState<TemplateCategory | 'All' | 'Mine' | 'Fav'>('All');
  const [q, setQ] = useState('');
  const { favs, toggle } = useFavTemplates();
  const [mine, setMine] = useState<SavedPreset[]>([]);
  const [preview, setPreview] = useState<Template | null>(null);
  const store = getStore();
  const project = useStore((s) => s.project);
  const refresh = () => storage.listPresets().then(setMine).catch((e) => toast('Could not read presets: ' + e.message, 'error'));
  useEffect(() => { refresh(); }, []);

  const confirmReplace = () => !store.state.dirty || confirm('Replace the current composition? (Your current project stays in Projects if it was saved; Undo also works.)');

  const apply = (tpl: Template, o?: { aspect: AspectId; duration?: number }) => {
    if (!confirmReplace()) return;
    const p = projectFromTemplate(tpl, o?.aspect ?? store.state.project.aspect, o?.duration);
    store.load(p);
    setPreview(null);
    engine.player?.seek(0);
    toast(`"${tpl.name}" ✓`, 'ok');
    onUsed?.();
  };

  const applyMine = (sp: SavedPreset) => {
    if (!confirmReplace()) return;
    const p = normalizeProject(deepClone(sp.project));
    store.load({ ...p, id: uid(), name: sp.name, createdAt: Date.now(), updatedAt: Date.now() });
    engine.player?.seek(0);
    onUsed?.();
  };

  const saveAsPreset = async () => {
    const name = prompt('Preset name', project.name);
    if (!name) return;
    await storage.savePreset({ id: uid(), name, project: deepClone(project), updatedAt: Date.now() });
    toast('Saved as custom preset', 'ok');
    refresh();
    setCat('Mine');
  };

  const duplicateTemplate = async (tpl: Template) => {
    const p = projectFromTemplate(tpl, project.aspect);
    await storage.savePreset({ id: uid(), name: `${tpl.name} (copy)`, project: p, updatedAt: Date.now() });
    toast('Copied into My presets', 'ok');
    refresh();
  };

  const resetPreset = () => {
    const tpl = TEMPLATES.find((t) => t.id === project.templateId);
    if (!tpl) return;
    if (!confirm(`Reset "${tpl.name}" to its default parameters? (Undo can restore.)`)) return;
    const b = tpl.build();
    store.update((p) => ({ ...p, duration: b.duration, background: b.background, layers: b.layers, audio: b.audio ?? [] }));
    engine.player?.seek(0);
  };

  const needle = q.trim().toLowerCase();
  const list = (cat === 'All' ? TEMPLATES : cat === 'Mine' ? [] : cat === 'Fav' ? TEMPLATES.filter((t) => favs.includes(t.id)) : TEMPLATES.filter((t) => t.categories.includes(cat)))
    .filter((t) => !needle || `${t.name} ${t.categories.join(' ')} ${TEMPLATE_INFO[t.id]?.desc ?? ''}`.toLowerCase().includes(needle));

  return (
    <div className="templates">
      <p className="hint">Tap a template to watch it move{' '}(with sound) before using it. Everything in a template stays editable.</p>
      <div className="row-btns">
        <button onClick={saveAsPreset}>Save current as preset</button>
        {project.templateId && TEMPLATES.some((t) => t.id === project.templateId) && <button onClick={resetPreset}>Reset preset</button>}
        <button onClick={() => { if (confirmReplace()) store.load(newProject('Untitled', { aspect: project.aspect })); }}>Blank</button>
      </div>
      <input className="name-input tpl-search" type="search" placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search templates" />
      <div className="chips">
        {(['All', 'Fav', 'Mine', ...TEMPLATE_CATEGORIES] as const).map((c) => (
          <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c === 'Mine' ? `My presets (${mine.length})` : c === 'Fav' ? `★ (${favs.length})` : c}</button>
        ))}
      </div>
      {!list.length && cat !== 'Mine' && <p className="hint">{cat === 'Fav' ? 'Tap ★ on a template to keep it here.' : 'No template matches.'}</p>}
      <div className="tpl-grid">
        {list.map((t) => <TemplateCard key={t.id} tpl={t} current={project.templateId === t.id} onOpen={() => setPreview(t)} fav={favs.includes(t.id)} onFav={() => toggle(t.id)} />)}
        {cat === 'Mine' && mine.map((m) => (
          <div key={m.id} className="tpl">
            <button className="tpl-main" onClick={() => applyMine(m)}>
              <span className="thumb" style={{ background: m.project.background }} />
              <b>{m.name}</b>
              <small>{m.project.layers.length} layers · {new Date(m.updatedAt).toLocaleDateString()} · tap to use</small>
            </button>
            <button className="tpl-dup danger" aria-label={`Delete ${m.name}`} onClick={async () => { if (confirm(`Delete preset "${m.name}"?`)) { await storage.deletePreset(m.id); refresh(); } }}>✕</button>
          </div>
        ))}
        {cat === 'Mine' && !mine.length && <p className="hint">No custom presets yet. Edit a composition and tap “Save current as preset”.</p>}
      </div>
      {preview && <PreviewSheet tpl={preview} onClose={() => setPreview(null)} onUse={(o) => apply(preview, o)} onDuplicate={() => duplicateTemplate(preview)} />}
    </div>
  );
}

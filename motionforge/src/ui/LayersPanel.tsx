import { useState } from 'react';
import { makeBackground, makeImage, makeParticles, makeShader, makeShape, makeText } from '../engine/project';
import { SHADERS, type ShaderCategory } from '../engine/shaders/library';
import { deepClone, uid } from '../engine/util';
import type { Layer } from '../engine/types';
import { engine } from '../state/engine';
import { getStore, useStore } from '../state/store';
import { LAYER_ICON } from './props';
import { Sheet, toast } from './controls';
import { setLayerImageFromFile } from './imageActions';
import { useThumb } from './TemplatesPanel';
import { effectThumb } from './thumbs';

export function LayersPanel({ onEdit }: { onEdit: () => void }) {
  const layers = useStore((s) => s.project.layers);
  const sel = useStore((s) => s.selectedLayerId);
  const store = getStore();
  const [addFx, setAddFx] = useState(false);

  const add = (l: Layer) => {
    const t = engine.frameTime();
    const dur = store.state.project.duration;
    // new layers start at the playhead (or 0 if the playhead is at the end)
    const start = t < dur - 0.5 ? t : 0;
    const nl = { ...l, start, end: dur };
    const idx = store.state.project.layers.findIndex((x) => x.id === sel);
    store.update((p) => {
      const layers = [...p.layers];
      layers.splice(idx >= 0 ? idx + 1 : layers.length, 0, nl);
      return { ...p, layers };
    });
    store.select(nl.id);
    toast(`Added ${nl.name}`, 'ok');
  };
  const dur = useStore((s) => s.project.duration);

  const move = (id: string, dir: 1 | -1) => store.update((p) => {
    const i = p.layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.layers.length) return p;
    const layers = [...p.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    return { ...p, layers };
  });

  const duplicate = (l: Layer) => {
    const copy = { ...deepClone(l), id: uid(), name: `${l.name} copy` };
    store.update((p) => {
      const i = p.layers.findIndex((x) => x.id === l.id);
      const layers = [...p.layers];
      layers.splice(i + 1, 0, copy);
      return { ...p, layers };
    });
    store.select(copy.id);
  };

  const remove = (l: Layer) => {
    store.update((p) => ({ ...p, layers: p.layers.filter((x) => x.id !== l.id) }));
    toast(`Deleted ${l.name} (Undo to restore)`);
  };

  return (
    <div className="layers">
      <div className="add-row">
        <button onClick={() => add(makeText(dur, { text: 'New text', anim: { preset: 'smooth' } as any }))}>＋ Text</button>
        <button onClick={() => add(makeShape(dur, { strokeWidth: 3 }))}>＋ Shape</button>
        <label className="file-btn">＋ Image
          <input type="file" accept="image/*" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const l = makeImage(dur, '', { name: f.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Image' });
            add(l);
            await setLayerImageFromFile(l.id, f);
          }} />
        </label>
        <button onClick={() => add(makeParticles(dur))}>＋ Particles</button>
        <button onClick={() => add(makeBackground(dur))}>＋ Background</button>
        <button onClick={() => setAddFx(true)}>＋ Effect</button>
        <button onClick={() => add(makeShader(dur, 'custom', { name: 'Custom shader' }))}>＋ Custom GLSL</button>
      </div>
      {layers.length === 0 && <p className="hint">No layers yet. Add one above or pick a template.</p>}
      <ul className="layer-list">
        {[...layers].reverse().map((l, ri) => {
          const i = layers.length - 1 - ri;
          return (
            <li key={l.id} className={`${l.id === sel ? 'sel' : ''} ${l.visible ? '' : 'off'}`}>
              <button className="vis" aria-label={l.visible ? 'Hide layer' : 'Show layer'} onClick={() => store.updateLayer(l.id, (x) => ({ ...x, visible: !x.visible }))}>{l.visible ? '◉' : '○'}</button>
              <button className="lname" onClick={() => { store.select(l.id); }} onDoubleClick={onEdit}>
                <span className={`lt lt-${l.type}`}>{LAYER_ICON[l.type]}</span>
                <span className="nm">{l.name}</span>
                {l.type === 'shape' && l.mask && l.mask !== 'none' ? <span className="badge">mask</span> : null}
                {Object.keys(l.tracks).length ? <span className="badge">◆{Object.keys(l.tracks).length}</span> : null}
              </button>
              <div className="lactions">
                <button aria-label="Move up" disabled={i === layers.length - 1} onClick={() => move(l.id, 1)}>▲</button>
                <button aria-label="Move down" disabled={i === 0} onClick={() => move(l.id, -1)}>▼</button>
                <button aria-label="Duplicate" onClick={() => duplicate(l)}>⧉</button>
                <button aria-label="Delete" className="danger" onClick={() => remove(l)}>✕</button>
              </div>
            </li>
          );
        })}
      </ul>
      {sel && <button className="wide primary" onClick={onEdit}>Edit selected layer →</button>}
      {addFx && <EffectPicker onPick={(id) => { add(makeShader(dur, id)); setAddFx(false); }} onClose={() => setAddFx(false)} />}
    </div>
  );
}

const CATS: ShaderCategory[] = ['Grid', 'Particles', 'Glitch', 'Distortion', 'Glow', 'Light', 'Gradient', 'Texture'];

export function EffectPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  return (
    <Sheet title="Add effect layer" onClose={onClose}>
      <p className="hint">Generators draw an image. Filters (marked ⧉) process everything below them in the layer stack — place them above the layers they should affect.</p>
      {CATS.map((c) => (
        <div key={c} className="fx-cat">
          <h3>{c}</h3>
          <div className="fx-grid">
            {SHADERS.filter((s) => s.category === c).map((s) => <FxItem key={s.id} id={s.id} onPick={onPick} />)}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

function FxItem({ id, onPick }: { id: string; onPick: (id: string) => void }) {
  const s = SHADERS.find((x) => x.id === id)!;
  const { src, ref } = useThumb(() => effectThumb(id), id);
  return (
    <div ref={ref}>
      <button className="fx-item" onClick={() => onPick(id)} style={{ width: '100%' }}>
        {src ? <img className="fx-thumb" src={src} alt="" /> : <span className="fx-thumb" />}
        <b>{s.kind === 'filter' ? '⧉ ' : ''}{s.name}</b>
        <small>{s.description}</small>
      </button>
    </div>
  );
}

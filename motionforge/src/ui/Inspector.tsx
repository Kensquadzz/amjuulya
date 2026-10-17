import { FONTS } from '../engine/fonts';
import { TEXT_PRESETS } from '../engine/text';
import { EASING_LABELS } from '../engine/easing';
import { animFor } from '../engine/project';
import { parseShaderParams } from '../engine/shaderParams';
import { setPath } from '../engine/keyframes';
import type { EasingId, ImageLayer, Layer, SceneLayer, ShaderLayer, TextLayer } from '../engine/types';
import { sceneById } from '../engine/scenes3d';
import { engine, setProp, useTime } from '../state/engine';
import { getStore, useSelectedLayer, useStore } from '../state/store';
import { autoRemoveBg, cutOutLayer, restoreOriginal, setAutoRemoveBg, setLayerImageFromFile } from './imageActions';
import { useState } from 'react';
import { ColorProp, NumProp, Section, SelectProp, ToggleProp, KfButton, toast } from './controls';
import { loadImageFile } from './images';
import { MODEL_PROPS } from './props';

const EASE_OPTS = (Object.keys(EASING_LABELS) as EasingId[]).map((id) => ({ value: id, label: EASING_LABELS[id] }));
const BLEND_OPTS = [
  { value: 'normal', label: 'Normal' }, { value: 'add', label: 'Add' }, { value: 'screen', label: 'Screen' }, { value: 'multiply', label: 'Multiply' },
] as const;

export function Inspector({ onOpenCode }: { onOpenCode: () => void }) {
  const layer = useSelectedLayer();
  useTime(150);
  const t = engine.frameTime();
  if (!layer) return <CompositionProps />;
  return (
    <div className="inspector">
      <LayerHeader layer={layer} />
      {layer.type === 'text' && <TextProps l={layer} t={t} />}
      {layer.type === 'shader' && <ShaderProps l={layer} t={t} onOpenCode={onOpenCode} />}
      {layer.type === 'scene3d' && <Section title={`${sceneById(layer.scene)?.name ?? layer.scene} · Three.js scene`}><SceneParamControls l={layer} t={t} /></Section>}
      {layer.type === 'model3d' && (
        <Section title={`3D model · ${layer.src ? layer.fileName ?? 'GLB' : layer.primitive}`}>
          {MODEL_PROPS.map((p) => p.kind === 'color'
            ? <ColorProp key={p.path} layer={layer} path={p.path} label={p.label} t={t} />
            : <NumProp key={p.path} layer={layer} path={p.path} label={p.label} min={p.min!} max={p.max!} step={p.step!} t={t} />)}
          <SelectProp layer={layer} path="env" label="Environment" t={t} options={[{ value: 'studio', label: 'Studio' }, { value: 'soft', label: 'Soft' }, { value: 'night', label: 'Night neon' }]} />
        </Section>
      )}
      {layer.type === 'shape' && (
        <Section title="Shape">
          <SelectProp layer={layer} path="shape" label="Kind" t={t} options={['rect', 'circle', 'ring', 'line', 'triangle', 'cross', 'swoosh', 'barcode', 'glassTile', 'search'].map((v) => ({ value: v, label: v }))} />
          <NumProp layer={layer} path="w" label="Width" min={0} max={2400} step={1} t={t} />
          <NumProp layer={layer} path="h" label="Height" min={0} max={2400} step={1} t={t} />
          <NumProp layer={layer} path="radius" label="Corner" min={0} max={600} step={1} t={t} />
          <ToggleProp layer={layer} path="fillOn" label="Fill" t={t} />
          <ColorProp layer={layer} path="fill" label="Fill color" t={t} />
          <NumProp layer={layer} path="strokeWidth" label="Stroke" min={0} max={60} step={0.5} t={t} />
          <ColorProp layer={layer} path="stroke" label="Stroke color" t={t} />
          {layer.shape === 'glassTile' && <ColorProp layer={layer} path="stroke2" label="Rim colour 2" t={t} />}
          {layer.shape === 'glassTile' && <SelectProp layer={layer} path="icon" label="Icon" t={t} options={['none', 'music', 'image', 'eye', 'diamond', 'flower', 'sparkle', 'search', 'heart', 'dots', 'arrow', 'wave', 'chat', 'play'].map((v) => ({ value: v, label: v }))} />}
          <NumProp layer={layer} path="draw" label="Draw on" min={0} max={1} step={0.005} t={t} display={100} unit="%" />
          <NumProp layer={layer} path="glow" label="Glow" min={0} max={120} step={1} t={t} />
        </Section>
      )}
      {layer.type === 'shape' && (
        <Section title="Mask (track matte)" defaultOpen={!!layer.mask && layer.mask !== 'none'}>
          <SelectProp layer={layer} path="mask" label="Use as mask" t={t} options={[{ value: 'none', label: 'Off — draw shape' }, { value: 'alpha', label: 'Mask layer above' }, { value: 'inverted', label: 'Inverted mask' }]} />
          <NumProp layer={layer} path="feather" label="Feather" min={0} max={200} step={1} t={t} keyframable={false} />
          <p className="hint">When on, this shape is hidden and only the part of the layer directly above it (in Layers) inside the shape is shown. Animate Position, Width or Draw for wipes and reveals.</p>
        </Section>
      )}
      {layer.type === 'image' && (
        <Section title="Image">
          <NumProp layer={layer} path="w" label="Width" min={10} max={3000} step={1} t={t} />
          <NumProp layer={layer} path="blur" label="Blur" min={0} max={60} step={0.5} t={t} />
          <NumProp layer={layer} path="shadow" label="Shadow blur" min={0} max={200} step={1} t={t} />
          <NumProp layer={layer} path="shadowOpacity" label="Shadow alpha" min={0} max={1} step={0.01} t={t} />
          <NumProp layer={layer} path="shadowY" label="Shadow Y" min={-200} max={200} step={1} t={t} />
          <ImagePicker layer={layer} />
          {!layer.src && <p className="hint">Empty slot — only shown in the editor, never exported. Transparent PNG cut-outs (people, products, objects) look best.</p>}
        </Section>
      )}
      {layer.type === 'background' && (
        <Section title="Background">
          <SelectProp layer={layer} path="mode" label="Mode" t={t} options={[{ value: 'solid', label: 'Solid' }, { value: 'linear', label: 'Linear gradient' }, { value: 'radial', label: 'Radial gradient' }]} />
          <ColorProp layer={layer} path="colorA" label="Color A" t={t} />
          <ColorProp layer={layer} path="colorB" label="Color B" t={t} />
          <NumProp layer={layer} path="angle" label="Angle" min={-360} max={360} step={1} t={t} unit="°" />
          {layer.mode === 'radial' && <NumProp layer={layer} path="inner" label="Inner size" min={0} max={0.95} step={0.01} t={t} />}
          {layer.mode === 'radial' && <NumProp layer={layer} path="scale" label="Radius" min={0.1} max={3} step={0.01} t={t} />}
        </Section>
      )}
      {layer.type === 'particles' && (
        <Section title="Particles">
          <NumProp layer={layer} path="count" label="Count" min={0} max={600} step={1} t={t} />
          <NumProp layer={layer} path="size" label="Size" min={0.5} max={40} step={0.1} t={t} />
          <NumProp layer={layer} path="speed" label="Speed" min={0} max={600} step={1} t={t} />
          <NumProp layer={layer} path="direction" label="Direction" min={-360} max={360} step={1} t={t} unit="°" />
          <NumProp layer={layer} path="spread" label="Spread" min={0} max={360} step={1} t={t} unit="°" />
          <NumProp layer={layer} path="noise" label="Noise" min={0} max={300} step={1} t={t} />
          <NumProp layer={layer} path="glow" label="Glow" min={0} max={3} step={0.01} t={t} />
          <NumProp layer={layer} path="twinkle" label="Twinkle" min={0} max={1} step={0.01} t={t} />
          <ColorProp layer={layer} path="colorA" label="Color A" t={t} />
          <ColorProp layer={layer} path="colorB" label="Color B" t={t} />
          <NumProp layer={layer} path="connect" label="Lines dist." min={0} max={400} step={1} t={t} />
          <NumProp layer={layer} path="connectOpacity" label="Lines alpha" min={0} max={1} step={0.01} t={t} keyframable={false} />
          <NumProp layer={layer} path="seed" label="Seed" min={0} max={999} step={1} t={t} keyframable={false} />
          <ToggleProp layer={layer} path="interactive" label="Touch repel" t={t} />
        </Section>
      )}
      <Section title="Transform" defaultOpen={layer.type !== 'shader'}>
        {layer.type !== 'shader' && layer.type !== 'particles' && (
          <>
            <NumProp layer={layer} path="x" label="Position X" min={-0.5} max={1.5} step={0.001} t={t} display={100} unit="%" />
            <NumProp layer={layer} path="y" label="Position Y" min={-0.5} max={1.5} step={0.001} t={t} display={100} unit="%" />
            <NumProp layer={layer} path="scale" label="Scale" min={0} max={4} step={0.01} t={t} display={100} unit="%" />
            <NumProp layer={layer} path="rotation" label="Rotation" min={-360} max={360} step={0.5} t={t} unit="°" />
          </>
        )}
        <NumProp layer={layer} path="opacity" label="Opacity" min={0} max={1} step={0.01} t={t} display={100} unit="%" />
        <SelectProp layer={layer} path="blend" label="Blend" t={t} options={BLEND_OPTS as any} />
      </Section>
      <Section title="Timing" defaultOpen={false}>
        <NumProp layer={layer} path="start" label="In point" min={0} max={getStore().state.project.duration} step={1 / 30} t={t} keyframable={false} unit="s" />
        <NumProp layer={layer} path="end" label="Out point" min={0} max={getStore().state.project.duration} step={1 / 30} t={t} keyframable={false} unit="s" />
      </Section>
    </div>
  );
}

function LayerHeader({ layer }: { layer: Layer }) {
  return (
    <div className="layer-header">
      <input className="name-input" value={layer.name} aria-label="Layer name"
        onChange={(e) => getStore().updateLayer(layer.id, (l) => ({ ...l, name: e.target.value }), `name:${layer.id}`)} />
      <button className="chip small" onClick={() => getStore().select(null)}>Composition</button>
    </div>
  );
}

function TextProps({ l, t }: { l: TextLayer; t: number }) {
  const store = getStore();
  const fam = FONTS.find((f) => f.family === l.fontFamily) ?? FONTS[0];
  const applyPreset = (id: TextLayer['anim']['preset']) => {
    const def = TEXT_PRESETS.find((p) => p.id === id)!;
    store.updateLayer(l.id, (x) => {
      const tl = x as TextLayer;
      const anim = animFor(id, tl.anim);
      const cursor = def.cursor ? { ...tl.cursor, enabled: true, mode: def.cursor.mode, glow: def.cursor.glow || tl.cursor.glow } : tl.cursor.mode === 'lightbar' && tl.anim.preset === 'lightbar' ? { ...tl.cursor, enabled: false } : tl.cursor;
      return { ...tl, anim, cursor };
    });
  };
  return (
    <>
      <Section title="Text">
        <textarea className="text-input" value={l.text} rows={Math.min(5, l.text.split('\n').length + 1)} aria-label="Text content"
          onChange={(e) => store.updateLayer(l.id, (x) => ({ ...x, text: e.target.value }), `text:${l.id}`)} />
        <div className="prop">
          <label>Font</label>
          <select value={l.fontFamily} onChange={(e) => {
            const f = FONTS.find((x) => x.family === e.target.value)!;
            const w = f.weights.reduce((a, b) => (Math.abs(b - l.fontWeight) < Math.abs(a - l.fontWeight) ? b : a));
            store.updateLayer(l.id, (x) => ({ ...x, fontFamily: f.family, fontWeight: w }));
          }}>
            {FONTS.map((f) => <option key={f.family} value={f.family} style={{ fontFamily: f.stack }}>{f.family}{f.cyrillic ? ' · Кирилл' : ''}</option>)}
          </select>
        </div>
        <SelectProp layer={l} path="fontWeight" label="Weight" t={t} options={fam.weights.map((w) => ({ value: w, label: String(w) }))} />
        {fam.italic ? <ToggleProp layer={l} path="italic" label="Italic" t={t} /> : null}
        <ToggleProp layer={l} path="uppercase" label="Uppercase" t={t} />
        <SelectProp layer={l} path="align" label="Align" t={t} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
        <SelectProp layer={l} path="anchor" label="Anchor X" t={t} options={[{ value: 'center', label: 'Block centre' }, { value: 'left', label: 'Left edge' }, { value: 'right', label: 'Right edge' }]} />
        <NumProp layer={l} path="fontSize" label="Size" min={8} max={600} step={1} t={t} unit="px" />
        <NumProp layer={l} path="letterSpacing" label="Tracking" min={-0.2} max={1.5} step={0.005} t={t} unit="em" />
        <NumProp layer={l} path="lineHeight" label="Line height" min={0.5} max={3} step={0.01} t={t} />
        <ColorProp layer={l} path="color" label="Color" t={t} />
        <NumProp layer={l} path="blur" label="Blur" min={0} max={60} step={0.5} t={t} />
        <NumProp layer={l} path="glow" label="Glow" min={0} max={120} step={1} t={t} />
        <ColorProp layer={l} path="glowColor" label="Glow color" t={t} />
      </Section>
      <Section title="Text animation">
        <div className="preset-grid">
          {TEXT_PRESETS.map((p) => (
            <button key={p.id} className={`preset-chip ${l.anim.preset === p.id ? 'on' : ''}`} onClick={() => applyPreset(p.id)}>{p.label}</button>
          ))}
        </div>
        <SelectProp layer={l} path="anim.unit" label="Animate by" t={t} options={[{ value: 'char', label: 'Character' }, { value: 'word', label: 'Word' }, { value: 'line', label: 'Line' }, { value: 'all', label: 'Whole block' }]} />
        <NumProp layer={l} path="anim.delay" label="Delay" min={0} max={10} step={0.01} t={t} keyframable={false} unit="s" />
        <NumProp layer={l} path="anim.duration" label="Duration" min={0} max={5} step={0.01} t={t} keyframable={false} unit="s" />
        <NumProp layer={l} path="anim.stagger" label="Stagger" min={0} max={1} step={0.005} t={t} keyframable={false} unit="s" />
        <NumProp layer={l} path="anim.intensity" label="Intensity" min={0} max={2} step={0.01} t={t} />
        <SelectProp layer={l} path="anim.ease" label="Easing" t={t} options={EASE_OPTS} />
        {l.anim.ease === 'bezier' && (
          <div className="prop bez">
            <label>Bézier</label>
            {(l.anim.bezier ?? [0.22, 1, 0.36, 1]).map((b, i) => (
              <input key={i} className="num" inputMode="decimal" defaultValue={b} onBlur={(e) => {
                const n = parseFloat(e.target.value); if (!Number.isFinite(n)) return;
                const arr = [...(l.anim.bezier ?? [0.22, 1, 0.36, 1])]; arr[i] = n;
                store.updateLayer(l.id, (x) => setPath(x, 'anim.bezier', arr));
              }} />
            ))}
          </div>
        )}
        <SelectProp layer={l} path="anim.direction" label="Direction" t={t} options={['up', 'down', 'left', 'right'].map((v) => ({ value: v, label: v }))} />
        <SelectProp layer={l} path="anim.order" label="Order" t={t} options={['forward', 'reverse', 'center', 'random'].map((v) => ({ value: v, label: v }))} />
        <ToggleProp layer={l} path="anim.out.enabled" label="Animate out" t={t} />
        {l.anim.out.enabled && (
          <>
            <NumProp layer={l} path="anim.out.duration" label="Out duration" min={0} max={4} step={0.01} t={t} keyframable={false} unit="s" />
            <NumProp layer={l} path="anim.out.stagger" label="Out stagger" min={0} max={0.5} step={0.005} t={t} keyframable={false} unit="s" />
          </>
        )}
        <button className="wide" onClick={() => applyPreset(l.anim.preset)}>Reset animation to preset defaults</button>
      </Section>
      <Section title="Cursor / light bar" defaultOpen={l.cursor.enabled}>
        <ToggleProp layer={l} path="cursor.enabled" label="Enabled" t={t} />
        <SelectProp layer={l} path="cursor.mode" label="Type" t={t} options={[{ value: 'cursor', label: 'Blinking cursor' }, { value: 'lightbar', label: 'Vertical light bar' }, { value: 'sweep', label: 'Horizontal light sweep' }]} />
        <ColorProp layer={l} path="cursor.color" label="Color" t={t} />
        <NumProp layer={l} path="cursor.width" label="Width" min={1} max={60} step={0.5} t={t} keyframable={false} />
        <NumProp layer={l} path="cursor.height" label="Height" min={0.2} max={4} step={0.01} t={t} keyframable={false} unit="×" />
        <NumProp layer={l} path="cursor.glow" label="Glow" min={0} max={120} step={1} t={t} keyframable={false} />
        <NumProp layer={l} path="cursor.blink" label="Blink" min={0} max={6} step={0.1} t={t} keyframable={false} unit="Hz" />
        <NumProp layer={l} path="cursor.delay" label="Sweep delay" min={0} max={10} step={0.01} t={t} keyframable={false} unit="s" />
        <NumProp layer={l} path="cursor.travel" label="Sweep travel" min={0.1} max={10} step={0.01} t={t} keyframable={false} unit="s" />
      </Section>
    </>
  );
}

export function ShaderParamControls({ l, t }: { l: ShaderLayer; t: number }) {
  const params = parseShaderParams(l.source);
  if (!params.length) return <p className="hint">This shader declares no adjustable uniforms. Add e.g. <code>uniform float u_amount; // @ui 0 1 0.5 | Amount</code></p>;
  return (
    <>
      {params.map((p) => {
        const path = `params.${p.key}`;
        if (p.kind === 'float') return <NumProp key={p.key} layer={l} path={path} label={p.label} min={p.min} max={p.max} step={p.step} t={t} />;
        if (p.kind === 'color') return <ColorProp key={p.key} layer={l} path={path} label={p.label} t={t} />;
        if (p.kind === 'image') return <ShaderImageParam key={p.key} l={l} k={p.key} label={p.label} />;
        if (p.kind === 'glyph') return <ShaderGlyphParam key={p.key} l={l} k={p.key} label={p.label} def={p.def} family={p.family} weight={p.weight} />;
        return (
          <div className="prop" key={p.key}>
            <label>{p.label}</label>
            <select value={String(l.params[p.key] ?? p.def)} onChange={(e) => setProp(l.id, path, +e.target.value)}>
              {p.options.map((o, i) => <option key={i} value={i}>{o}</option>)}
            </select>
            <KfButton layer={l} path={path} t={t} />
          </div>
        );
      })}
    </>
  );
}

/** Controls for a Three.js cinematic scene: text, pictures, colours and keyframable numbers. */
export function SceneParamControls({ l, t }: { l: SceneLayer; t: number }) {
  const def = sceneById(l.scene);
  if (!def) return <p className="hint">Unknown scene.</p>;
  const set = (k: string, v: string) => getStore().updateLayer(l.id, (x) => ({ ...(x as SceneLayer), params: { ...(x as SceneLayer).params, [k]: v } }), `sp:${l.id}:${k}`);
  return (
    <>
      {def.params.map((p) => {
        const path = `params.${p.key}`;
        if (p.kind === 'float') return <NumProp key={p.key} layer={l} path={path} label={p.label} min={p.min} max={p.max} step={(p.max - p.min) / 200} t={t} />;
        if (p.kind === 'color') return <ColorProp key={p.key} layer={l} path={path} label={p.label} t={t} />;
        if (p.kind === 'text') return (
          <div className="glyph-prop" key={p.key}>
            <label className="cap-prop-l">{p.label}</label>
            <textarea rows={1} value={String(l.params[p.key] ?? p.def)} onChange={(e) => set(p.key, e.target.value)} aria-label={p.label} />
          </div>
        );
        const v = String(l.params[p.key] ?? '');
        return (
          <div className="prop tex-prop" key={p.key}>
            <label>{p.label}</label>
            {v ? <img className="tex-thumb" src={v} alt="" /> : <span className="tex-thumb empty">—</span>}
            <label className="file-btn">{v ? 'Replace…' : '＋ Add…'}
              <input type="file" accept="image/*" hidden onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try { set(p.key, await loadImageFile(f, 4096)); } catch (err) { toast((err as Error).message, 'error'); }
              }} />
            </label>
            {v && <button className="chip small" onClick={() => set(p.key, '')}>Remove</button>}
          </div>
        );
      })}
    </>
  );
}

/** Picture used inside a 3D shader (product shot, screenshot, label…). */
function ShaderImageParam({ l, k, label }: { l: ShaderLayer; k: string; label: string }) {
  const v = String(l.params[k] ?? '');
  const set = (val: string) => getStore().updateLayer(l.id, (x) => ({ ...(x as ShaderLayer), params: { ...(x as ShaderLayer).params, [k]: val } }));
  return (
    <div className="prop tex-prop">
      <label>{label}</label>
      {v ? <img className="tex-thumb" src={v} alt="" /> : <span className="tex-thumb empty">—</span>}
      <label className="file-btn">{v ? 'Replace…' : '＋ Add…'}
        <input type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try { set(await loadImageFile(f)); } catch (err) { toast((err as Error).message, 'error'); }
        }} />
      </label>
      {v && <button className="chip small" onClick={() => set('')}>Remove</button>}
    </div>
  );
}

/** Text (or a logo picture) a 3D shader extrudes into real geometry. */
function ShaderGlyphParam({ l, k, label, def, family, weight }: { l: ShaderLayer; k: string; label: string; def: string; family: string; weight: number }) {
  const v = String(l.params[k] ?? def);
  const font = String(l.params[`${k}Font`] ?? `${family}:${weight}`);
  const isImg = /^(data:|blob:|https?:)/.test(v);
  const set = (patch: Record<string, string>) => getStore().updateLayer(l.id, (x) => ({ ...(x as ShaderLayer), params: { ...(x as ShaderLayer).params, ...patch } }), `glyph:${l.id}:${k}`);
  return (
    <div className="glyph-prop">
      <label className="cap-prop-l">{label}</label>
      {isImg ? <img className="tex-thumb" src={v} alt="" /> : (
        <textarea rows={2} value={v} onChange={(e) => set({ [k]: e.target.value })} aria-label={label} />
      )}
      <div className="row-btns">
        {!isImg && (
          <select aria-label={`${label} font`} value={font} onChange={(e) => set({ [`${k}Font`]: e.target.value })}>
            {FONTS.flatMap((f) => f.weights.filter((w) => w >= 500).map((w) => <option key={`${f.family}:${w}`} value={`${f.family}:${w}`}>{f.family} {w}</option>))}
          </select>
        )}
        <label className="file-btn">{isImg ? 'Replace logo…' : 'Use a logo image…'}
          <input type="file" accept="image/png,image/svg+xml,image/webp,image/*" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try { set({ [k]: await loadImageFile(f, 2048) }); } catch (err) { toast((err as Error).message, 'error'); }
          }} />
        </label>
        {isImg && <button className="chip small" onClick={() => set({ [k]: def })}>Use text</button>}
      </div>
    </div>
  );
}

function ShaderProps({ l, t, onOpenCode }: { l: ShaderLayer; t: number; onOpenCode: () => void }) {
  const isFilter = l.source.includes('u_input');
  return (
    <Section title={`${l.shaderName} · ${isFilter ? 'filter (affects layers below)' : 'generator'}`} right={<button className="chip small" onClick={onOpenCode}>{'</>'} Code</button>}>
      <ShaderParamControls l={l} t={t} />
    </Section>
  );
}

function ImagePicker({ layer }: { layer: ImageLayer }) {
  const [auto, setAuto] = useState(autoRemoveBg);
  return (
    <>
      <div className="row-btns">
        <label className="file-btn primary-file">
          {layer.src ? 'Replace image…' : '＋ Add image…'}
          <input type="file" accept="image/*" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) setLayerImageFromFile(layer.id, f);
          }} />
        </label>
        {layer.src && !layer.srcOriginal && <button onClick={() => cutOutLayer(layer.id)}>✂ Remove background</button>}
        {layer.srcOriginal && <button onClick={() => restoreOriginal(layer.id)}>↺ Restore original</button>}
      </div>
      <div className="prop">
        <label>Auto cut-out</label>
        <button className={`switch ${auto ? 'on' : ''}`} role="switch" aria-checked={auto} onClick={() => { setAutoRemoveBg(!auto); setAuto(!auto); }}><span /></button>
        <span className="hint" style={{ margin: 0 }}>remove background after picking</span>
      </div>
    </>
  );
}

function CompositionProps() {
  const p = useStore((s) => s.project);
  const store = getStore();
  return (
    <div className="inspector">
      <Section title="Composition">
        <div className="prop"><label>Name</label><input className="name-input" value={p.name} onChange={(e) => store.update((x) => ({ ...x, name: e.target.value }), 'pname')} /></div>
        <div className="prop"><label>Background</label><input type="color" value={p.background} onChange={(e) => store.update((x) => ({ ...x, background: e.target.value }), 'pbg')} /></div>
        <div className="prop"><label>Duration</label>
          <input type="range" min={1} max={30} step={0.5} value={p.duration} onChange={(e) => store.update((x) => ({ ...x, duration: +e.target.value }), 'pdur')} />
          <span className="num ro">{p.duration}s</span>
        </div>
        <p className="hint">Select a layer in Layers or the Timeline to edit its properties. Each ◆ button sets a keyframe at the playhead; once a property has keyframes, changing it at another time adds a new keyframe automatically.</p>
      </Section>
    </div>
  );
}

// Simple-editor panels for Three.js model layers: add a model, swap it,
// camera moves, light and material. Every control writes real layer
// properties (keyframable with ◆ where it makes sense).
import { useState, type ReactNode } from 'react';
import { makeModel } from '../engine/project';
import { uid } from '../engine/util';
import type { EasingId, Keyframe, Layer, ModelLayer, ModelPrimitive } from '../engine/types';
import { getStore } from '../state/store';
import { addLayerHere } from '../state/actions';
import { engine, useTime } from '../state/engine';
import { NumProp, ToolSheet, toast } from './controls';
import { loadImageFile } from './images';
import { useLang, type StrKey } from './i18n';

const MAX_BYTES = 30 * 1024 * 1024;
const PRIMS: { id: ModelPrimitive; label: StrKey; icon: string }[] = [
  { id: 'phone', label: 'm3dPhone', icon: '📱' }, { id: 'can', label: 'm3dCan', icon: '🥫' }, { id: 'knot', label: 'm3dKnot', icon: '➰' },
  { id: 'sphere', label: 'm3dSphere', icon: '⚪' }, { id: 'cube', label: 'm3dCube', icon: '◼' },
];

function readModelFile(f: File): Promise<string> {
  if (f.size > MAX_BYTES) return Promise.reject(new Error('too-big'));
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^;]*;/, 'data:model/gltf-binary;'));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

function ModelFileButton({ label, onFile }: { label: string; onFile: (src: string, name: string) => void }) {
  const { t } = useLang();
  return (
    <label className="file-btn primary-file wide">{label}
      <input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        try { onFile(await readModelFile(f), f.name); } catch (err) { toast((err as Error).message === 'too-big' ? t('m3dTooBig') : (err as Error).message, 'error'); }
      }} />
    </label>
  );
}

/** "3D" tool: upload a model or pick a built-in one. */
export function Model3DAddSheet({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const d = getStore().state.project.duration;
  const add = (patch: Partial<ModelLayer>) => {
    const l = addLayerHere(makeModel(d, patch), d) as ModelLayer;
    applyCameraPreset(l, 'orbit');
    onClose();
    toast(t('added'), 'ok');
  };
  return (
    <ToolSheet title={t('m3dTitle')} onClose={onClose}>
      <ModelFileButton label={t('m3dUpload')} onFile={(src, name) => add({ src, fileName: name, name: name.replace(/\.[^.]+$/, '').slice(0, 24) || '3D model', spin: 0 })} />
      <p className="hint">{t('m3dHint')}</p>
      <h3 className="sub-h">{t('m3dSamples')}</h3>
      <div className="anim-grid">
        {PRIMS.map((p) => (
          <button key={p.id} className="anim-item" onClick={() => add({ primitive: p.id, name: t(p.label) })}>
            <span className="ai">{p.icon}</span><small>{t(p.label)}</small>
          </button>
        ))}
      </div>
    </ToolSheet>
  );
}

const set = (l: ModelLayer, patch: Partial<ModelLayer>, merge?: string) =>
  getStore().updateLayer(l.id, (x) => ({ ...(x as ModelLayer), ...patch }) as Layer, merge);

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="cap-prop"><span className="cap-prop-l">{label}</span>{children}</div>;
}

/** Swap the model, its screen/label picture and its animation clip. */
export function ModelSheet({ l, onClose }: { l: ModelLayer; onClose: () => void }) {
  const { t } = useLang();
  useTime(400); // refresh load state / clip list
  const info = engine.renderer?.modelInfo(l) ?? { ready: false, clips: [] as string[] };
  return (
    <ToolSheet title={t('cModel')} onClose={onClose}>
      <ModelFileButton label={l.src ? `⟳ ${l.fileName ?? 'model.glb'}` : t('m3dUpload')} onFile={(src, name) => set(l, { src, fileName: name, clip: 0 })} />
      {info.error && <div className="notice error">{info.error}</div>}
      <div className="chips wrap">
        {PRIMS.map((p) => <button key={p.id} className={`chip small ${!l.src && l.primitive === p.id ? 'on' : ''}`} onClick={() => set(l, { src: '', fileName: undefined, primitive: p.id })}>{p.icon} {t(p.label)}</button>)}
      </div>
      {!l.src && (l.primitive === 'phone' || l.primitive === 'can') && (
        <Row label={t('m3dScreen')}>
          <div className="row-btns">
            {l.texture && <img className="tex-thumb" src={l.texture} alt="" />}
            <label className="file-btn">{l.texture ? t('cReplace') : '＋'}
              <input type="file" accept="image/*" hidden onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) set(l, { texture: await loadImageFile(f, 2048) });
              }} />
            </label>
            {l.texture && <button className="chip small" onClick={() => set(l, { texture: '' })}>✕</button>}
          </div>
        </Row>
      )}
      {l.src && (
        <Row label={t('m3dClip')}>
          <select value={info.clips.length ? l.clip : -1} onChange={(e) => set(l, { clip: +e.target.value })}>
            <option value={-1}>{t('m3dNoClip')}</option>
            {info.clips.map((c, i) => <option key={i} value={i}>{c}</option>)}
          </select>
        </Row>
      )}
      {l.src && info.clips.length > 0 && <NumProp layer={l} path="clipSpeed" label={t('speed')} min={0} max={3} step={0.01} t={engine.frameTime()} keyframable={false} />}
    </ToolSheet>
  );
}

type Preset = 'turntable' | 'orbit' | 'push' | 'hero' | 'static';
const CAM_PATHS = ['orbit', 'elevation', 'distance', 'rotY'];

/** Write a camera move as keyframes across the layer. */
export function applyCameraPreset(l: ModelLayer, p: Preset) {
  const a = l.start, b = l.end;
  const kf = (t: number, v: number, ease: EasingId = 'easeInOutCubic'): Keyframe => ({ id: uid(), t, v, ease });
  const tracks = { ...l.tracks };
  for (const k of CAM_PATHS) delete tracks[k];
  let spin = 0;
  if (p === 'turntable') spin = 30;
  if (p === 'orbit') {
    tracks.orbit = [kf(a, -70), kf(b, 40, 'linear')];
    tracks.distance = [kf(a, 1.7, 'easeOutCubic'), kf(a + (b - a) * 0.6, 0.92)];
    tracks.elevation = [kf(a, 28), kf(b, 10, 'linear')];
  }
  if (p === 'push') tracks.distance = [kf(a, 1.9, 'easeInOutCubic'), kf(b, 0.75, 'linear')];
  if (p === 'hero') {
    tracks.elevation = [kf(a, -18), kf(b, 16, 'linear')];
    tracks.rotY = [kf(a, -35), kf(b, 35, 'linear')];
  }
  getStore().updateLayer(l.id, (x) => ({ ...(x as ModelLayer), tracks, spin }) as Layer);
}

export function CameraSheet({ l, onClose }: { l: ModelLayer; onClose: () => void }) {
  const { t } = useLang();
  const { t: time } = useTime(150);
  const tt = Math.round(time * 30) / 30;
  const presets: { id: Preset; label: StrKey }[] = [
    { id: 'orbit', label: 'pOrbit' }, { id: 'turntable', label: 'pTurntable' }, { id: 'push', label: 'pPush' }, { id: 'hero', label: 'pHero' }, { id: 'static', label: 'pStatic' },
  ];
  return (
    <ToolSheet title={t('cCamera')} onClose={onClose}>
      <Row label={t('camPresets')}>
        <div className="chips wrap">
          {presets.map((p) => <button key={p.id} className="chip" onClick={() => { applyCameraPreset(l, p.id); engine.player?.seek(l.start); engine.player?.play(); }}>{t(p.label)}</button>)}
        </div>
      </Row>
      <NumProp layer={l} path="orbit" label="Orbit" min={-360} max={360} step={0.5} t={tt} unit="°" />
      <NumProp layer={l} path="elevation" label="Height" min={-80} max={80} step={0.5} t={tt} unit="°" />
      <NumProp layer={l} path="distance" label="Distance" min={0.4} max={6} step={0.01} t={tt} />
      <NumProp layer={l} path="fov" label="Lens" min={10} max={90} step={0.5} t={tt} unit="°" />
      <NumProp layer={l} path="spin" label="Turntable °/s" min={-180} max={180} step={1} t={tt} keyframable={false} />
      <NumProp layer={l} path="rotY" label="Model turn" min={-720} max={720} step={0.5} t={tt} unit="°" />
      <NumProp layer={l} path="tiltX" label="Model tilt" min={-90} max={90} step={0.5} t={tt} unit="°" />
      <NumProp layer={l} path="float" label="Float" min={0} max={3} step={0.01} t={tt} />
    </ToolSheet>
  );
}

export function LightSheet({ l, onClose }: { l: ModelLayer; onClose: () => void }) {
  const { t } = useLang();
  const { t: time } = useTime(150);
  const tt = Math.round(time * 30) / 30;
  return (
    <ToolSheet title={t('cLight')} onClose={onClose}>
      <Row label={t('m3dEnv')}>
        <div className="seg">
          {(['studio', 'soft', 'night'] as const).map((e) => <button key={e} className={l.env === e ? 'on' : ''} onClick={() => set(l, { env: e })}>{t(e === 'studio' ? 'envStudio' : e === 'soft' ? 'envSoft' : 'envNight')}</button>)}
        </div>
      </Row>
      <NumProp layer={l} path="light" label="Light" min={0} max={3} step={0.01} t={tt} />
      <NumProp layer={l} path="exposure" label="Exposure" min={0.2} max={3} step={0.01} t={tt} />
      <NumProp layer={l} path="shadow" label="Shadow" min={0} max={1} step={0.01} t={tt} />
      <Row label="Light colour"><input type="color" value={l.lightColor} onChange={(e) => set(l, { lightColor: e.target.value }, `lc:${l.id}`)} /></Row>
    </ToolSheet>
  );
}

export function MaterialSheet({ l, onClose }: { l: ModelLayer; onClose: () => void }) {
  const { t } = useLang();
  const [, force] = useState(0);
  const tt = engine.frameTime();
  return (
    <ToolSheet title={t('cMaterial')} onClose={onClose}>
      <Row label={t('m3dOverride')}>
        <button className={`switch ${l.materialOverride ? 'on' : ''}`} role="switch" aria-checked={l.materialOverride} onClick={() => { set(l, { materialOverride: !l.materialOverride }); force((n) => n + 1); }}><span /></button>
      </Row>
      {l.materialOverride && (
        <>
          <Row label="Colour"><input type="color" value={l.color} onChange={(e) => set(l, { color: e.target.value }, `mc:${l.id}`)} /></Row>
          <NumProp layer={l} path="metalness" label="Metal" min={0} max={1} step={0.01} t={tt} keyframable={false} />
          <NumProp layer={l} path="roughness" label="Roughness" min={0} max={1} step={0.01} t={tt} keyframable={false} />
        </>
      )}
    </ToolSheet>
  );
}

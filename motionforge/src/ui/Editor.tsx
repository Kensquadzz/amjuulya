// Simple (CapCut-style) editor: big preview, centred-playhead timeline and a
// bottom toolbar whose tools change with the selection. Every tool opens a
// compact half-height panel so the preview stays visible while editing.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FONTS } from '../engine/fonts';
import { animFor, makeBackground, makeImage, makeParticles, makeShader, makeShape, makeText } from '../engine/project';
import { TEXT_PRESETS } from '../engine/text';
import { ASPECTS, type AspectId, type ImageLayer, type Layer, type ShapeLayer, type TextLayer, type TextPresetId } from '../engine/types';
import { getStore, useStore } from '../state/store';
import { engine, setProp, valueAt, useTime } from '../state/engine';
import { addLayerHere, currentMotion, deleteClip, deleteLayer, duplicateClip, duplicateLayer, moveLayer, MOTION_PRESETS, setMotion, splitClip, splitLayer, type MotionPreset } from '../state/actions';
import { Preview } from './Preview';
import { CapTimeline } from './CapTimeline';
import { AudioPanel, ClipEditor } from './AudioPanel';
import { TemplatesPanel } from './TemplatesPanel';
import { EffectPicker, LayersPanel } from './LayersPanel';
import { Inspector, ShaderParamControls } from './Inspector';
import { Timeline } from './Timeline';
import { CodePanel } from './CodePanel';
import { NumProp, Sheet, ToolSheet, toast } from './controls';
import { cutOutLayer, restoreOriginal, setLayerImageFromFile } from './imageActions';
import { TEXT_ANIM_NAMES, useLang, type StrKey } from './i18n';
import { layerThumb } from './thumbs';
import { useThumb } from './TemplatesPanel';
import type { IconId } from '../engine/types';

type Panel =
  | null | 'templates' | 'audio' | 'effects' | 'stickers' | 'ratio' | 'background' | 'pro'
  | 'textEdit' | 'font' | 'style' | 'textAnim' | 'position' | 'motion' | 'shadow' | 'color' | 'adjust' | 'all' | 'clip';

interface Tool { id: string; icon: string; label: StrKey; run: () => void; danger?: boolean }

const SWATCHES = ['#ffffff', '#000000', '#ff3d55', '#ff7a2b', '#ffc24d', '#3ddc97', '#22e1ff', '#2f6bff', '#7a5cff', '#ff4fd8', '#8b2a30', '#efe3c6', '#9a9aa6', '#1b1b1f'];

export function Editor({ onHome, onExport }: { onHome: () => void; onExport: () => void }) {
  const { t } = useLang();
  const [panel, setPanel] = useState<Panel>(null);
  const sel = useStore((s) => s.project.layers.find((l) => l.id === s.selectedLayerId) ?? null);
  const clip = useStore((s) => (s.selectedClipId ? s.project.audio?.find((c) => c.id === s.selectedClipId) ?? null : null));
  const name = useStore((s) => s.project.name);
  const dirty = useStore((s) => s.dirty);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const dur = useStore((s) => s.project.duration);
  const store = getStore();

  // close a selection-bound panel when the selection goes away
  useEffect(() => {
    const needsLayer: Panel[] = ['textEdit', 'font', 'style', 'textAnim', 'position', 'motion', 'shadow', 'color', 'adjust', 'all'];
    if (!sel && needsLayer.includes(panel)) setPanel(null);
    if (!clip && panel === 'clip') setPanel(null);
  }, [sel, clip, panel]);

  const addText = () => {
    const l = makeText(dur, { text: t('tText'), fontFamily: 'Montserrat', fontWeight: 800, fontSize: 110, anim: { preset: 'smooth', delay: 0 } as any });
    addLayerHere(l, 3);
    setPanel('textEdit');
  };

  const split = () => {
    const ok = sel ? splitLayer(sel.id) : clip ? splitClip(clip.id) : false;
    toast(ok ? t('split') : t('splitHint'), ok ? 'ok' : 'info');
  };

  const mainTools: Tool[] = [
    { id: 'templates', icon: '✧', label: 'tTemplates', run: () => setPanel('templates') },
    { id: 'text', icon: 'T', label: 'tText', run: addText },
    { id: 'audio', icon: '♪', label: 'tAudio', run: () => setPanel('audio') },
    { id: 'image', icon: '🖼', label: 'tImage', run: () => fileRef.current?.click() },
    { id: 'effects', icon: '✦', label: 'tEffects', run: () => setPanel('effects') },
    { id: 'stickers', icon: '◎', label: 'tStickers', run: () => setPanel('stickers') },
    { id: 'ratio', icon: '▭', label: 'tRatio', run: () => setPanel('ratio') },
    { id: 'bg', icon: '▤', label: 'tBackground', run: () => setPanel('background') },
    { id: 'pro', icon: '⚙', label: 'tPro', run: () => setPanel('pro') },
  ];

  const common = (l: Layer): Tool[] => [
    { id: 'split', icon: '✂', label: 'cSplit', run: split },
    { id: 'copy', icon: '⧉', label: 'cCopy', run: () => { duplicateLayer(l.id); toast(t('copied'), 'ok'); } },
    { id: 'fwd', icon: '⬆', label: 'cForward', run: () => moveLayer(l.id, 1) },
    { id: 'bwd', icon: '⬇', label: 'cBackward', run: () => moveLayer(l.id, -1) },
    { id: 'all', icon: '⚙', label: 'cAll', run: () => setPanel('all') },
    { id: 'del', icon: '🗑', label: 'cDelete', run: () => { deleteLayer(l.id); toast(t('deleted')); }, danger: true },
  ];

  let tools: Tool[] = mainTools;
  if (sel) {
    const back: Tool = { id: 'back', icon: '‹', label: 'cBack', run: () => store.select(null) };
    if (sel.type === 'text') tools = [back,
      { id: 'edit', icon: '✎', label: 'cEdit', run: () => setPanel('textEdit') },
      { id: 'font', icon: 'Aa', label: 'cFont', run: () => setPanel('font') },
      { id: 'style', icon: '🎨', label: 'cStyle', run: () => setPanel('style') },
      { id: 'anim', icon: '✺', label: 'cAnim', run: () => setPanel('textAnim') },
      { id: 'pos', icon: '✥', label: 'cPosition', run: () => setPanel('position') },
      ...common(sel)];
    else if (sel.type === 'image') tools = [back,
      { id: 'replace', icon: '⟳', label: 'cReplace', run: () => replaceRef.current?.click() },
      sel.srcOriginal ? { id: 'restore', icon: '↺', label: 'cRestore', run: () => restoreOriginal(sel.id) } : { id: 'cut', icon: '✂︎', label: 'cCutout', run: () => cutOutLayer(sel.id) },
      { id: 'anim', icon: '✺', label: 'cAnim', run: () => setPanel('motion') },
      { id: 'pos', icon: '✥', label: 'cPosition', run: () => setPanel('position') },
      { id: 'shadow', icon: '◐', label: 'cShadow', run: () => setPanel('shadow') },
      ...common(sel)];
    else if (sel.type === 'shape') tools = [back,
      { id: 'color', icon: '🎨', label: 'cColor', run: () => setPanel('color') },
      { id: 'anim', icon: '✺', label: 'cAnim', run: () => setPanel('motion') },
      { id: 'pos', icon: '✥', label: 'cPosition', run: () => setPanel('position') },
      ...common(sel)];
    else tools = [back,
      { id: 'adjust', icon: '🎚', label: 'cAdjust', run: () => setPanel(sel.type === 'shader' ? 'adjust' : 'all') },
      ...common(sel)];
  } else if (clip) {
    tools = [
      { id: 'back', icon: '‹', label: 'cBack', run: () => store.selectClip(null) },
      { id: 'vol', icon: '🔊', label: 'cVolume', run: () => setPanel('clip') },
      { id: 'split', icon: '✂', label: 'cSplit', run: split },
      { id: 'copy', icon: '⧉', label: 'cCopy', run: () => duplicateClip(clip.id) },
      { id: 'del', icon: '🗑', label: 'cDelete', run: () => { deleteClip(clip.id); toast(t('deleted')); }, danger: true },
    ];
  }

  const title = sel ? (sel.type === 'text' ? sel.text.split('\n')[0].slice(0, 24) : sel.name) : clip ? clip.name : null;

  return (
    <div className="app cap">
      <header className="cap-top">
        <button className="icon-btn" onClick={onHome} aria-label={t('home')}>⌂</button>
        <span className="cap-name">{name || 'Untitled'}{dirty ? ' •' : ''}</span>
        <button className="export-btn" onClick={onExport}>{t('export')} ⤓</button>
      </header>
      <main className="cap-main">
        <Preview simple />
        <CapTimeline />
        {title && <div className="cap-selname">{title}</div>}
        <nav className="cap-tools" aria-label="Tools">
          {tools.map((tool) => (
            <button key={tool.id} className={`cap-tool ${tool.danger ? 'danger' : ''}`} onClick={tool.run}>
              <span className="ci">{tool.icon}</span>
              <span className="cl">{t(tool.label)}</span>
            </button>
          ))}
        </nav>
      </main>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        const l = addLayerHere(makeImage(dur, '', { name: f.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Photo' }));
        await setLayerImageFromFile(l.id, f);
      }} />
      <input ref={replaceRef} type="file" accept="image/*" hidden onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f && sel) setLayerImageFromFile(sel.id, f);
      }} />

      {panel === 'templates' && <Sheet title={t('templates')} onClose={() => setPanel(null)}><TemplatesPanel onUsed={() => setPanel(null)} /></Sheet>}
      {panel === 'audio' && <ToolSheet tall title={t('tAudio')} onClose={() => setPanel(null)}><AudioPanel /></ToolSheet>}
      {panel === 'effects' && <EffectPicker onClose={() => setPanel(null)} onPick={(id) => { addLayerHere(makeShader(dur, id)); setPanel(null); toast(t('added'), 'ok'); }} />}
      {panel === 'stickers' && <StickerSheet onClose={() => setPanel(null)} />}
      {panel === 'ratio' && <RatioSheet onClose={() => setPanel(null)} />}
      {panel === 'background' && <BackgroundSheet onClose={() => setPanel(null)} />}
      {panel === 'pro' && <ProSheet onClose={() => setPanel(null)} />}
      {panel === 'all' && sel && <Sheet title={title ?? ''} onClose={() => setPanel(null)}><Inspector onOpenCode={() => setPanel('pro')} /></Sheet>}
      {panel === 'textEdit' && sel?.type === 'text' && <TextEditSheet l={sel} onClose={() => setPanel(null)} />}
      {panel === 'font' && sel?.type === 'text' && <FontSheet l={sel} onClose={() => setPanel(null)} />}
      {panel === 'style' && sel?.type === 'text' && <StyleSheet l={sel} onClose={() => setPanel(null)} />}
      {panel === 'textAnim' && sel?.type === 'text' && <TextAnimSheet l={sel} onClose={() => setPanel(null)} />}
      {panel === 'position' && sel && <PositionSheet l={sel} onClose={() => setPanel(null)} />}
      {panel === 'motion' && sel && <MotionSheet l={sel} onClose={() => setPanel(null)} />}
      {panel === 'shadow' && sel?.type === 'image' && <ShadowSheet l={sel} onClose={() => setPanel(null)} />}
      {panel === 'color' && sel?.type === 'shape' && <ShapeColorSheet l={sel} onClose={() => setPanel(null)} />}
      {panel === 'adjust' && sel?.type === 'shader' && <ToolSheet title={sel.name} onClose={() => setPanel(null)}><ShaderParamControls l={sel} t={engine.frameTime()} /></ToolSheet>}
      {panel === 'clip' && clip && <ToolSheet title={clip.name} onClose={() => setPanel(null)}><ClipEditor clip={clip} /></ToolSheet>}
    </div>
  );
}

// ---------------------------------------------------------------- shared bits

function Swatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <div className="swatches">
      {SWATCHES.map((c) => <button key={c} className={`sw ${value.toLowerCase() === c ? 'on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => onPick(c)} />)}
      <label className="sw custom" aria-label="Custom colour"><input type="color" value={value.slice(0, 7)} onChange={(e) => onPick(e.target.value)} />＋</label>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="cap-prop"><span className="cap-prop-l">{label}</span>{children}</div>;
}

// ---------------------------------------------------------------- text

function TextEditSheet({ l, onClose }: { l: TextLayer; onClose: () => void }) {
  const { t } = useLang();
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.select(); } }, []);
  return (
    <ToolSheet title={t('editText')} onClose={onClose}>
      <textarea ref={ref} className="cap-text" rows={3} value={l.text} placeholder={t('typeHere')}
        onChange={(e) => getStore().updateLayer(l.id, (x) => ({ ...x, text: e.target.value, name: e.target.value.split('\n')[0].slice(0, 24) || 'Text' } as Layer), `text:${l.id}`)} />
    </ToolSheet>
  );
}

function FontSheet({ l, onClose }: { l: TextLayer; onClose: () => void }) {
  const { t } = useLang();
  const fam = FONTS.find((f) => f.family === l.fontFamily) ?? FONTS[0];
  const set = (patch: Partial<TextLayer>) => getStore().updateLayer(l.id, (x) => ({ ...x, ...patch } as Layer));
  const cyr = /[Ѐ-ӿ]/.test(l.text);
  return (
    <ToolSheet title={t('cFont')} onClose={onClose}>
      <div className="font-grid">
        {FONTS.map((f) => (
          <button key={f.family} className={`font-item ${f.family === l.fontFamily ? 'on' : ''}`} style={{ fontFamily: f.stack, fontWeight: 700 }}
            onClick={() => set({ fontFamily: f.family, fontWeight: f.weights.reduce((a, b) => (Math.abs(b - l.fontWeight) < Math.abs(a - l.fontWeight) ? b : a)), italic: f.italic ? l.italic : false })}>
            <span className="fs">{cyr ? 'Аа Бб' : 'Aa Bb'}</span>
            <small>{f.family}{f.cyrillic ? ' · Кирилл' : ''}</small>
          </button>
        ))}
      </div>
      <Row label={t('weight')}>
        <div className="chips wrap">{fam.weights.map((w) => <button key={w} className={`chip small ${l.fontWeight === w ? 'on' : ''}`} onClick={() => set({ fontWeight: w })}>{w}</button>)}</div>
      </Row>
      <div className="chips wrap">
        {fam.italic && <button className={`chip ${l.italic ? 'on' : ''}`} onClick={() => set({ italic: !l.italic })}><i>{t('italic')}</i></button>}
        <button className={`chip ${l.uppercase ? 'on' : ''}`} onClick={() => set({ uppercase: !l.uppercase })}>{t('uppercase')}</button>
        {(['left', 'center', 'right'] as const).map((a) => <button key={a} className={`chip ${l.align === a ? 'on' : ''}`} onClick={() => set({ align: a })}>{a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}</button>)}
      </div>
    </ToolSheet>
  );
}

function StyleSheet({ l, onClose }: { l: TextLayer; onClose: () => void }) {
  const { t } = useLang();
  const { t: time } = useTime(150);
  const tt = Math.round(time * 30) / 30;
  return (
    <ToolSheet title={t('cStyle')} onClose={onClose}>
      <Row label={t('textColor')}><Swatches value={String(valueAt(l, 'color', tt))} onPick={(c) => setProp(l.id, 'color', c)} /></Row>
      <NumProp layer={l} path="fontSize" label={t('size')} min={12} max={500} step={1} t={tt} />
      <NumProp layer={l} path="letterSpacing" label={t('spacing')} min={-0.15} max={1} step={0.005} t={tt} />
      <NumProp layer={l} path="lineHeight" label={t('lineHeight')} min={0.6} max={2.5} step={0.01} t={tt} />
      <NumProp layer={l} path="glow" label={t('glow')} min={0} max={100} step={1} t={tt} />
      <Row label={t('glowColor')}><Swatches value={String(valueAt(l, 'glowColor', tt))} onPick={(c) => setProp(l.id, 'glowColor', c)} /></Row>
      <NumProp layer={l} path="blur" label={t('blur')} min={0} max={40} step={0.5} t={tt} />
      <NumProp layer={l} path="opacity" label={t('opacity')} min={0} max={1} step={0.01} t={tt} display={100} unit="%" />
    </ToolSheet>
  );
}

function TextAnimSheet({ l, onClose }: { l: TextLayer; onClose: () => void }) {
  const { t, lang } = useLang();
  const store = getStore();
  const choose = (id: TextPresetId) => {
    const def = TEXT_PRESETS.find((p) => p.id === id)!;
    store.updateLayer(l.id, (x) => {
      const tl = x as TextLayer;
      const anim = animFor(id, tl.anim);
      const cursor = def.cursor ? { ...tl.cursor, enabled: true, mode: def.cursor.mode, glow: def.cursor.glow || tl.cursor.glow } : { ...tl.cursor, enabled: tl.cursor.mode === 'sweep' && tl.cursor.enabled };
      return { ...tl, anim, cursor };
    });
    engine.player?.seek(l.start);
    engine.player?.play();
  };
  // speed multiplier relative to the preset's own timing (1 = default)
  const base = TEXT_PRESETS.find((p) => p.id === l.anim.preset)?.defaults;
  const speed = base?.duration ? base.duration / Math.max(0.01, l.anim.duration) : 1;
  const setSpeed = (k: number) => store.updateLayer(l.id, (x) => {
    const tl = x as TextLayer;
    return { ...tl, anim: { ...tl.anim, duration: (base?.duration ?? 0.8) / k, stagger: (base?.stagger ?? 0.04) / k } };
  }, `spd:${l.id}`);
  const order: TextPresetId[] = ['none', 'smooth', 'typePop', 'blurReveal', 'typewriter', 'fadeRise', 'wordByWord', 'stagger', 'kinetic', 'slideBlur', 'elastic', 'spacing', 'cinematic', 'mask', 'split', 'rotate', 'glitch', 'lightbar', 'cursorGlow'];
  return (
    <ToolSheet title={t('cAnim')} onClose={onClose}>
      <div className="anim-grid">
        {order.map((id) => (
          <button key={id} className={`anim-item ${l.anim.preset === id ? 'on' : ''}`} onClick={() => choose(id)}>
            <span className="ai">{id === 'none' ? '⊘' : 'Aa'}</span>
            <small>{TEXT_ANIM_NAMES[id]?.[lang] ?? id}</small>
          </button>
        ))}
      </div>
      {l.anim.preset !== 'none' && (
        <>
          <Row label={t('speed')}>
            <input type="range" min={0.25} max={3} step={0.05} value={Math.min(3, Math.max(0.25, speed))} onChange={(e) => setSpeed(parseFloat(e.target.value))} />
            <span className="num ro">{speed.toFixed(1)}×</span>
          </Row>
          <Row label={t('intensity')}>
            <input type="range" min={0} max={2} step={0.01} value={l.anim.intensity} onChange={(e) => store.updateLayer(l.id, (x) => ({ ...(x as TextLayer), anim: { ...(x as TextLayer).anim, intensity: parseFloat(e.target.value) } }), `int:${l.id}`)} />
          </Row>
          <div className="chips wrap">
            {(['char', 'word', 'line', 'all'] as const).map((u) => (
              <button key={u} className={`chip small ${l.anim.unit === u ? 'on' : ''}`} onClick={() => store.updateLayer(l.id, (x) => ({ ...(x as TextLayer), anim: { ...(x as TextLayer).anim, unit: u } }))}>
                {lang === 'mn' ? { char: 'Үсгээр', word: 'Үгээр', line: 'Мөрөөр', all: 'Бүхэлд' }[u] : { char: 'Letters', word: 'Words', line: 'Lines', all: 'Whole' }[u]}
              </button>
            ))}
          </div>
        </>
      )}
      <Row label={t('exitAnim')}>
        <button className={`switch ${l.anim.out.enabled ? 'on' : ''}`} role="switch" aria-checked={l.anim.out.enabled} onClick={() => store.updateLayer(l.id, (x) => { const tl = x as TextLayer; return { ...tl, anim: { ...tl.anim, out: { ...tl.anim.out, enabled: !tl.anim.out.enabled } } }; })}><span /></button>
      </Row>
    </ToolSheet>
  );
}

// ---------------------------------------------------------------- position / motion / shadow / colour

function PositionSheet({ l, onClose }: { l: Layer; onClose: () => void }) {
  const { t } = useLang();
  const { t: time } = useTime(150);
  const tt = Math.round(time * 30) / 30;
  return (
    <ToolSheet title={t('cPosition')} onClose={onClose}>
      <p className="hint">{t('posHint')}</p>
      <NumProp layer={l} path="x" label={t('posX')} min={-0.3} max={1.3} step={0.001} t={tt} display={100} unit="%" />
      <NumProp layer={l} path="y" label={t('posY')} min={-0.3} max={1.3} step={0.001} t={tt} display={100} unit="%" />
      <NumProp layer={l} path="scale" label={t('scale')} min={0.05} max={4} step={0.01} t={tt} display={100} unit="%" />
      <NumProp layer={l} path="rotation" label={t('rotation')} min={-180} max={180} step={0.5} t={tt} unit="°" />
      <NumProp layer={l} path="opacity" label={t('opacity')} min={0} max={1} step={0.01} t={tt} display={100} unit="%" />
    </ToolSheet>
  );
}

const MOTION_LABEL: Record<MotionPreset, StrKey> = {
  none: 'animNone', fade: 'aFade', zoomIn: 'aZoomIn', zoomOut: 'aZoomOut', slideUp: 'aSlideUp', slideDown: 'aSlideDown',
  slideLeft: 'aSlideLeft', slideRight: 'aSlideRight', pop: 'aPop', spin: 'aSpin', blur: 'aBlur',
};
const MOTION_ICON: Record<MotionPreset, string> = { none: '⊘', fade: '◌', zoomIn: '⤢', zoomOut: '⤡', slideUp: '↑', slideDown: '↓', slideLeft: '←', slideRight: '→', pop: '✸', spin: '↻', blur: '≋' };

function MotionSheet({ l, onClose }: { l: Layer; onClose: () => void }) {
  const { t } = useLang();
  const [which, setWhich] = useState<'in' | 'out'>('in');
  const cur = currentMotion(l, which);
  const pick = (p: MotionPreset, d = cur.duration) => {
    setMotion(l.id, which, p, d);
    engine.player?.seek(which === 'in' ? l.start : Math.max(l.start, l.end - d - 0.3));
    engine.player?.play();
  };
  return (
    <ToolSheet title={t('cAnim')} onClose={onClose}>
      <div className="seg">
        <button className={which === 'in' ? 'on' : ''} onClick={() => setWhich('in')}>{t('animIn')}</button>
        <button className={which === 'out' ? 'on' : ''} onClick={() => setWhich('out')}>{t('animOut')}</button>
      </div>
      <div className="anim-grid">
        {MOTION_PRESETS.map((p) => (
          <button key={p} className={`anim-item ${cur.preset === p ? 'on' : ''}`} onClick={() => pick(p)}>
            <span className="ai">{MOTION_ICON[p]}</span>
            <small>{t(MOTION_LABEL[p])}</small>
          </button>
        ))}
      </div>
      {cur.preset !== 'none' && (
        <Row label={t('duration')}>
          <input type="range" min={0.15} max={2} step={0.05} value={cur.duration} onChange={(e) => setMotion(l.id, which, cur.preset, parseFloat(e.target.value))} />
          <span className="num ro">{cur.duration.toFixed(2)}s</span>
        </Row>
      )}
    </ToolSheet>
  );
}

function ShadowSheet({ l, onClose }: { l: ImageLayer; onClose: () => void }) {
  const { t } = useLang();
  const tt = engine.frameTime();
  useTime(200);
  return (
    <ToolSheet title={t('cShadow')} onClose={onClose}>
      <NumProp layer={l} path="shadow" label={t('blur')} min={0} max={200} step={1} t={tt} />
      <NumProp layer={l} path="shadowOpacity" label={t('opacity')} min={0} max={1} step={0.01} t={tt} display={100} unit="%" />
      <NumProp layer={l} path="shadowY" label={t('posY')} min={-200} max={200} step={1} t={tt} />
    </ToolSheet>
  );
}

const ICONS: IconId[] = ['image', 'eye', 'music', 'sparkle', 'wave', 'search', 'diamond', 'flower', 'heart', 'dots', 'arrow', 'chat', 'play'];

function ShapeColorSheet({ l, onClose }: { l: ShapeLayer; onClose: () => void }) {
  const { t } = useLang();
  const tt = engine.frameTime();
  useTime(200);
  const tile = l.shape === 'glassTile';
  return (
    <ToolSheet title={t('cColor')} onClose={onClose}>
      {!tile && <Row label="Fill"><Swatches value={l.fill} onPick={(c) => getStore().updateLayer(l.id, (x) => ({ ...(x as ShapeLayer), fill: c, fillOn: true }))} /></Row>}
      <Row label={tile ? 'Rim 1' : 'Stroke'}><Swatches value={l.stroke} onPick={(c) => setProp(l.id, 'stroke', c)} /></Row>
      {tile && <Row label="Rim 2"><Swatches value={l.stroke2 ?? l.stroke} onPick={(c) => getStore().updateLayer(l.id, (x) => ({ ...(x as ShapeLayer), stroke2: c }))} /></Row>}
      {tile && (
        <div className="chips wrap">
          {ICONS.map((ic) => <button key={ic} className={`chip small ${l.icon === ic ? 'on' : ''}`} onClick={() => getStore().updateLayer(l.id, (x) => ({ ...(x as ShapeLayer), icon: ic }))}>{ic}</button>)}
        </div>
      )}
      <NumProp layer={l} path="glow" label={t('glow')} min={0} max={120} step={1} t={tt} />
      {!tile && <NumProp layer={l} path="strokeWidth" label="Stroke" min={0} max={60} step={0.5} t={tt} />}
    </ToolSheet>
  );
}

// ---------------------------------------------------------------- add: stickers / ratio / background / pro

interface Sticker { key: string; make: () => Layer; len?: number }
const TILE_COLORS: [string, string][] = [['#2dffb0', '#3a7bff'], ['#3ad8ff', '#ffffff'], ['#ffb12d', '#ff4fd8'], ['#b34dff', '#3ad8ff'], ['#ff7a2b', '#ff3d9a'], ['#3dffa8', '#2d8bff'], ['#ff4fd8', '#ff9a2d']];

function stickers(d: number): { group: StrKey; items: Sticker[] }[] {
  return [
    {
      group: 'stickerTiles',
      items: ICONS.map((ic, i) => ({ key: `tile-${ic}`, len: 3, make: () => makeShape(d, { name: `Icon ${ic}`, shape: 'glassTile', icon: ic, w: 260, h: 260, radius: 62, fill: '#14141c', stroke: TILE_COLORS[i % TILE_COLORS.length][0], stroke2: TILE_COLORS[i % TILE_COLORS.length][1], strokeWidth: 2.5, glow: 30 }) })),
    },
    {
      group: 'stickerShapes',
      items: [
        { key: 'circle', len: 3, make: () => makeShape(d, { name: 'Circle', shape: 'circle', w: 360, h: 360, fillOn: true, fill: '#ff3d55', strokeWidth: 0 }) },
        { key: 'rect', len: 3, make: () => makeShape(d, { name: 'Box', shape: 'rect', w: 520, h: 300, radius: 40, fillOn: true, fill: '#22e1ff', strokeWidth: 0 }) },
        { key: 'ring', len: 3, make: () => makeShape(d, { name: 'Ring', shape: 'ring', w: 380, h: 380, stroke: '#ffffff', strokeWidth: 8, glow: 20 }) },
        { key: 'line', len: 3, make: () => makeShape(d, { name: 'Line', shape: 'line', w: 600, h: 0, stroke: '#ffffff', strokeWidth: 6 }) },
        { key: 'tri', len: 3, make: () => makeShape(d, { name: 'Triangle', shape: 'triangle', w: 360, h: 320, fillOn: true, fill: '#ffc24d', strokeWidth: 0 }) },
        { key: 'swoosh', len: 3, make: () => makeShape(d, { name: 'Swoosh', shape: 'swoosh', w: 520, h: 640, fillOn: true, fill: '#0a0a0a', strokeWidth: 0, x: 1, y: 0 }) },
        { key: 'barcode', len: 3, make: () => makeShape(d, { name: 'Barcode', shape: 'barcode', w: 360, h: 90, fill: '#ffffff', seed: 9 }) },
        { key: 'search', len: 3, make: () => makeShape(d, { name: 'Search icon', shape: 'search', w: 140, h: 140, stroke: '#ffffff', strokeWidth: 10, glow: 14 }) },
      ],
    },
    {
      group: 'stickerFx',
      items: [
        { key: 'particles', make: () => makeParticles(d, { name: 'Particles', colorA: '#ff3df5', colorB: '#3dd8ff', connect: 140, seed: 7 }) },
        { key: 'neonPill', len: 4, make: () => makeShader(d, 'neonPill') },
        { key: 'glassCard', len: 4, make: () => makeShader(d, 'glassCard') },
        { key: 'flare', len: 3, make: () => makeShader(d, 'flare') },
        { key: 'orbs', len: 3, make: () => makeShader(d, 'orbRing') },
      ],
    },
  ];
}

function StickerItem({ s, onAdd }: { s: Sticker; onAdd: () => void }) {
  const { src, ref } = useThumb(() => layerThumb(s.key, s.make), s.key);
  return (
    <div ref={ref}>
      <button className="sticker" onClick={onAdd}>{src ? <img src={src} alt={s.key} /> : <span className="thumb-wait">…</span>}</button>
    </div>
  );
}

function StickerSheet({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const d = getStore().state.project.duration;
  return (
    <ToolSheet tall title={t('tStickers')} onClose={onClose}>
      {stickers(d).map((g) => (
        <div key={g.group} className="fx-cat">
          <h3>{t(g.group)}</h3>
          <div className="sticker-grid">
            {g.items.map((s) => <StickerItem key={s.key} s={s} onAdd={() => { addLayerHere(s.make(), s.len); onClose(); toast(t('added'), 'ok'); }} />)}
          </div>
        </div>
      ))}
    </ToolSheet>
  );
}

function RatioSheet({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const aspect = useStore((s) => s.project.aspect);
  const names: Record<AspectId, string> = { '9:16': 'TikTok · Reels · Story', '16:9': 'YouTube', '1:1': 'Post', '4:5': 'Instagram post' };
  return (
    <ToolSheet title={t('tRatio')} onClose={onClose}>
      <div className="ratio-grid">
        {(Object.keys(ASPECTS) as AspectId[]).map((a) => {
          const A = ASPECTS[a];
          const s = 46 / Math.max(A.w, A.h);
          return (
            <button key={a} className={`ratio ${aspect === a ? 'on' : ''}`} onClick={() => getStore().update((p) => ({ ...p, aspect: a }))}>
              <span className="rbox" style={{ width: A.w * s, height: A.h * s }} />
              <b>{a}</b>
              <small>{names[a]}</small>
            </button>
          );
        })}
      </div>
      <p className="hint">{t('ratioHint')}</p>
    </ToolSheet>
  );
}

const GRADIENTS: [string, string][] = [['#1d1b4b', '#ff5a7a'], ['#0b0a2e', '#22e1ff'], ['#2b2bff', '#8a2bff'], ['#ff7a2b', '#ff2d7a'], ['#f6efe8', '#a8b8ff'], ['#050505', '#5a1218'], ['#f6f6f6', '#bdbdbd'], ['#003a4d', '#3ddc97']];

function BackgroundSheet({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const p = useStore((s) => s.project);
  const bg = p.layers[0]?.type === 'background' ? p.layers[0] : null;
  const setBg = (patch: { mode: 'solid' | 'linear' | 'radial'; colorA: string; colorB?: string }) => {
    getStore().update((pr) => {
      const first = pr.layers[0];
      if (first?.type === 'background') return { ...pr, layers: [{ ...first, ...patch, colorB: patch.colorB ?? first.colorB }, ...pr.layers.slice(1)] };
      return { ...pr, layers: [makeBackground(pr.duration, { name: 'Background', ...patch }), ...pr.layers] };
    });
  };
  return (
    <ToolSheet title={t('tBackground')} onClose={onClose}>
      <Row label={t('bgSolid')}><Swatches value={bg?.mode === 'solid' ? bg.colorA : p.background} onPick={(c) => setBg({ mode: 'solid', colorA: c })} /></Row>
      <Row label={t('bgGradient')}>
        <div className="swatches">
          {GRADIENTS.map(([a, b]) => <button key={a + b} className="sw" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} aria-label={`${a} ${b}`} onClick={() => setBg({ mode: 'linear', colorA: a, colorB: b })} />)}
          {GRADIENTS.slice(4).map(([a, b]) => <button key={'r' + a + b} className="sw" style={{ background: `radial-gradient(circle, ${a}, ${b})` }} aria-label={`radial ${a} ${b}`} onClick={() => setBg({ mode: 'radial', colorA: a, colorB: b })} />)}
        </div>
      </Row>
      <button className="wide" onClick={() => { addLayerHere(makeShader(p.duration, 'aurora', { name: 'BG · Aurora' })); getStore().update((pr) => { const l = pr.layers[pr.layers.length - 1]; return { ...pr, layers: [{ ...l, start: 0, end: pr.duration }, ...pr.layers.slice(0, -1)] }; }); onClose(); }}>✦ Animated colour bleed</button>
    </ToolSheet>
  );
}

function ProSheet({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [tab, setTab] = useState<'layers' | 'inspect' | 'timeline' | 'code'>('timeline');
  return (
    <Sheet title={`${t('tPro')} — ${t('proHint')}`} onClose={onClose}>
      <div className="seg">
        {(['layers', 'inspect', 'timeline', 'code'] as const).map((id) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{{ layers: 'Layers', inspect: 'Inspect', timeline: 'Keyframes', code: 'Code' }[id]}</button>)}
      </div>
      <div className="pro-body">
        {tab === 'layers' && <LayersPanel onEdit={() => setTab('inspect')} />}
        {tab === 'inspect' && <Inspector onOpenCode={() => setTab('code')} />}
        {tab === 'timeline' && <Timeline />}
        {tab === 'code' && <CodePanel />}
      </div>
    </Sheet>
  );
}

import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { keyframeAt } from '../engine/keyframes';
import type { Layer } from '../engine/types';
import { setProp, toggleKeyframe, valueAt, clearTrack } from '../state/engine';

export function Section({ title, children, defaultOpen = true, right }: { title: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`section ${open ? 'open' : ''}`}>
      <header>
        <button className="section-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="chev">{open ? '▾' : '▸'}</span>
          {title}
        </button>
        {right}
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function KfButton({ layer, path, t }: { layer: Layer; path: string; t: number }) {
  const track = layer.tracks[path];
  const at = keyframeAt(layer.tracks, path, Math.round(t * 1000) / 1000);
  const state = at ? 'on' : track?.length ? 'track' : 'off';
  return (
    <button
      className={`kf-btn ${state}`}
      title={at ? 'Remove keyframe at playhead' : 'Add keyframe at playhead'}
      aria-label={at ? 'Remove keyframe' : 'Add keyframe'}
      onClick={() => toggleKeyframe(layer, path)}
      onContextMenu={(e) => { e.preventDefault(); if (track) clearTrack(layer.id, path); }}
    >
      ◆
    </button>
  );
}

interface NumProps {
  layer: Layer;
  path: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  t: number;
  keyframable?: boolean;
  /** display multiplier (e.g. opacity 0..1 shown as 0..100) */
  display?: number;
  unit?: string;
}

export function NumProp({ layer, path, label, min, max, step = 0.01, t, keyframable = true, display = 1, unit = '' }: NumProps) {
  const v = Number(valueAt(layer, path, t) ?? 0);
  const [text, setText] = useState<string | null>(null);
  const shown = +(v * display).toFixed(step * display < 0.1 ? 2 : step * display < 1 ? 1 : 0);
  return (
    <div className="prop">
      <label>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.max(min, Math.min(max, v))}
        onChange={(e) => setProp(layer.id, path, parseFloat(e.target.value))}
      />
      <input
        className="num"
        inputMode="decimal"
        value={text ?? `${shown}`}
        onFocus={(e) => { setText(`${shown}`); e.target.select(); }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = parseFloat(text ?? '');
          if (Number.isFinite(n)) setProp(layer.id, path, n / display);
          setText(null);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        aria-label={label}
      />
      {unit ? <span className="unit">{unit}</span> : null}
      {keyframable ? <KfButton layer={layer} path={path} t={t} /> : <span className="kf-spacer" />}
    </div>
  );
}

export function ColorProp({ layer, path, label, t, keyframable = true }: { layer: Layer; path: string; label: string; t: number; keyframable?: boolean }) {
  const v = String(valueAt(layer, path, t) ?? '#ffffff');
  return (
    <div className="prop">
      <label>{label}</label>
      <input type="color" value={v.slice(0, 7)} onChange={(e) => setProp(layer.id, path, e.target.value)} />
      <input className="hex" value={v} onChange={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && setProp(layer.id, path, e.target.value)} aria-label={`${label} hex`} />
      {keyframable ? <KfButton layer={layer} path={path} t={t} /> : <span className="kf-spacer" />}
    </div>
  );
}

export function SelectProp<T extends string | number>({ layer, path, label, options, t }: { layer: Layer; path: string; label: string; options: { value: T; label: string }[]; t: number }) {
  const v = valueAt(layer, path, t) as T;
  return (
    <div className="prop">
      <label>{label}</label>
      <select
        value={String(v)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value);
          if (o) setProp(layer.id, path, o.value as any);
        }}
      >
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function ToggleProp({ layer, path, label, t }: { layer: Layer; path: string; label: string; t: number }) {
  const v = !!valueAt(layer, path, t);
  return (
    <div className="prop">
      <label>{label}</label>
      <button className={`switch ${v ? 'on' : ''}`} role="switch" aria-checked={v} onClick={() => setProp(layer.id, path, !v)}>
        <span />
      </button>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- toasts ----------
type Toast = { id: number; msg: string; kind: 'info' | 'error' | 'ok' };
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
export function toast(msg: string, kind: Toast['kind'] = 'info') {
  const id = Math.random();
  toasts = [...toasts, { id, msg, kind }];
  toastListeners.forEach((f) => f());
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== id); toastListeners.forEach((f) => f()); }, kind === 'error' ? 6000 : 2800);
}
export function Toasts() {
  const [, force] = useState(0);
  useState(() => { toastListeners.add(() => force((n) => n + 1)); return 0; });
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}
    </div>
  );
}

/** Full bottom sheet, rendered into <body> so iOS never clips it inside a scroll container. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Half-height tool panel (CapCut style): the preview stays visible above it. */
export function ToolSheet({ title, onClose, children, tall }: { title: string; onClose: () => void; children: ReactNode; tall?: boolean }) {
  return createPortal(
    <div className={`tool-sheet ${tall ? 'tall' : ''}`} role="dialog" aria-label={title}>
      <header className="tool-head">
        <h2>{title}</h2>
        <button className="done-btn" onClick={onClose} aria-label="Done">✓</button>
      </header>
      <div className="tool-body">{children}</div>
    </div>,
    document.body,
  );
}

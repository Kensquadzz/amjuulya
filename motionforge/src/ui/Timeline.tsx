import { useEffect, useRef, useState } from 'react';
import { updateKeyframe, removeKeyframe, upsertKeyframe, sortKfs, evalTrack } from '../engine/keyframes';
import { EASING_LABELS } from '../engine/easing';
import { isHexColor } from '../engine/color';
import { uid } from '../engine/util';
import type { AudioClip, EasingId, Keyframe, Layer } from '../engine/types';
import { updateClip, Waveform } from './AudioPanel';
import { engine, useTime } from '../state/engine';
import { getStore, useStore } from '../state/store';
import { animatableProps, LAYER_ICON, propLabel } from './props';
import { toast } from './controls';

const LABEL_W = 116;
const ROW_H = 40;

let clipboard: { path: string; kf: Keyframe } | null = null;

const snap = (t: number, fps: number) => Math.round(t * fps) / fps;

/** Pointer drag helper distinguishing taps from drags (touch-friendly). */
function useDrag() {
  return (e: React.PointerEvent, onMove: (dx: number) => void, onTap?: () => void, onEnd?: () => void) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 6) return;
      moved = true;
      onMove(dx);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (!moved) onTap?.();
      onEnd?.();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
}

export function Timeline() {
  const project = useStore((s) => s.project);
  const selectedId = useStore((s) => s.selectedLayerId);
  const selKf = useStore((s) => s.selectedKf);
  const [pps, setPps] = useState(() => 60); // pixels per second
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const playheadRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useDrag();
  const store = getStore();
  const { fps, duration } = project;
  const laneW = Math.max(200, duration * pps);

  // fit zoom to width on first mount
  useEffect(() => {
    const w = (scrollRef.current?.clientWidth ?? 360) - LABEL_W - 16;
    setPps(Math.max(20, Math.min(400, w / duration)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // playhead follows the clock via direct DOM writes
  useEffect(() => {
    let unsub: (() => void) | undefined;
    const place = (t: number) => { if (playheadRef.current) playheadRef.current.style.transform = `translateX(${LABEL_W + t * pps}px)`; };
    place(engine.time);
    const iv = setInterval(() => {
      if (engine.player && !unsub) unsub = engine.player.subscribe((t) => place(t)) as () => void;
    }, 50);
    return () => { clearInterval(iv); unsub?.(); };
  }, [pps]);

  const seekFromEvent = (clientX: number) => {
    const r = scrollRef.current!.getBoundingClientRect();
    const x = clientX - r.left + scrollRef.current!.scrollLeft - LABEL_W;
    engine.player?.pause();
    engine.player?.seek(snap(x / pps, fps));
  };

  const onRulerDown = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    seekFromEvent(e.clientX);
    const move = (ev: PointerEvent) => seekFromEvent(ev.clientX);
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const dragBar = (e: React.PointerEvent, l: Layer, mode: 'move' | 'start' | 'end') => {
    const orig = l;
    store.select(l.id);
    drag(e, (dx) => {
      const dt = snap(dx / pps, fps);
      store.updateLayer(l.id, () => {
        if (mode === 'start') return { ...orig, start: Math.max(0, Math.min(orig.end - 1 / fps, orig.start + dt)) };
        if (mode === 'end') return { ...orig, end: Math.max(orig.start + 1 / fps, Math.min(duration, orig.end + dt)) };
        // moving a layer moves its keyframes with it
        const d = Math.max(-orig.start, Math.min(duration - orig.end, dt));
        const tracks: Layer['tracks'] = {};
        for (const [p, k] of Object.entries(orig.tracks)) tracks[p] = k.map((q) => ({ ...q, t: snap(q.t + d, fps) }));
        return { ...orig, start: orig.start + d, end: orig.end + d, tracks };
      }, `bar:${l.id}:${mode}`);
    });
  };

  const dragAudio = (e: React.PointerEvent, c: AudioClip, mode: 'move' | 'start' | 'end') => {
    const o = c;
    drag(e, (dx) => {
      const dt = snap(dx / pps, fps);
      let patch: Partial<AudioClip>;
      if (mode === 'move') patch = { start: Math.max(0, Math.min(duration - 0.05, o.start + dt)) };
      else if (mode === 'end') patch = { duration: Math.max(0.05, o.duration + dt) };
      else {
        // trimming the head keeps the sound anchored in time
        const d = Math.max(-o.offset, Math.max(-o.start, Math.min(o.duration - 0.05, dt)));
        patch = { start: o.start + d, offset: o.offset + d, duration: o.duration - d };
      }
      updateClip(c.id, patch, `adrag:${c.id}:${mode}`);
    });
  };

  const dragKf = (e: React.PointerEvent, l: Layer, path: string, k: Keyframe) => {
    const t0 = k.t;
    drag(
      e,
      (dx) => {
        const t = Math.max(0, Math.min(duration, snap(t0 + dx / pps, fps)));
        store.updateLayer(l.id, (cur) => ({ ...cur, tracks: updateKeyframe(cur.tracks, path, k.id, { t }) }), `kf:${k.id}`);
        engine.player?.seek(t);
      },
      () => { store.selectKf({ layerId: l.id, path, id: k.id }); engine.player?.pause(); engine.player?.seek(k.t); },
    );
  };

  const layersTopFirst = [...project.layers].reverse();
  const ticks: number[] = [];
  const tickStep = pps > 160 ? 0.25 : pps > 60 ? 0.5 : pps > 25 ? 1 : 2;
  for (let t = 0; t <= duration + 1e-6; t += tickStep) ticks.push(+t.toFixed(3));

  return (
    <div className="timeline">
      <div className="tl-toolbar">
        <label>Dur
          <input className="num" inputMode="decimal" defaultValue={duration} key={duration}
            onBlur={(e) => {
              const d = Math.max(0.5, Math.min(120, parseFloat(e.target.value) || duration));
              store.update((p) => ({ ...p, duration: d, layers: p.layers.map((l) => (l.end >= p.duration - 1e-3 || l.end > d ? { ...l, end: d, start: Math.min(l.start, d - 0.1) } : l)) }));
            }} />s
        </label>
        <label>FPS
          <select value={fps} onChange={(e) => store.update((p) => ({ ...p, fps: +e.target.value }))}>
            {[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="zoom">Zoom
          <input type="range" min={15} max={400} value={pps} onChange={(e) => setPps(+e.target.value)} />
        </label>
        <button className="chip small" disabled={!clipboard} onClick={() => paste()}>Paste ◆</button>
      </div>

      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-inner" style={{ width: LABEL_W + laneW + 24 }}>
          <div className="tl-ruler" onPointerDown={onRulerDown} style={{ paddingLeft: LABEL_W }}>
            <div className="tl-label tl-corner">{project.layers.length} layers</div>
            {ticks.map((t) => (
              <div key={t} className={`tick ${Number.isInteger(t) ? 'major' : ''}`} style={{ left: LABEL_W + t * pps }}>
                {Number.isInteger(t) ? `${t}s` : ''}
              </div>
            ))}
          </div>

          {layersTopFirst.map((l) => {
            const paths = Object.keys(l.tracks).filter((p) => l.tracks[p]?.length);
            const open = expanded[l.id] ?? false;
            return (
              <div key={l.id} className={`tl-layer ${l.id === selectedId ? 'sel' : ''} ${l.visible ? '' : 'hidden'}`}>
                <div className="tl-row" style={{ height: ROW_H }}>
                  <div className="tl-label" style={{ width: LABEL_W }} onClick={() => store.select(l.id)}>
                    <button className="exp" onClick={(e) => { e.stopPropagation(); setExpanded({ ...expanded, [l.id]: !open }); }} aria-label="Expand tracks">
                      {open ? '▾' : '▸'}
                    </button>
                    <span className={`lt lt-${l.type}`}>{LAYER_ICON[l.type]}</span>
                    <span className="nm">{l.name}</span>
                  </div>
                  <div className="tl-lane" style={{ width: laneW }}>
                    <div className={`tl-bar bar-${l.type}`} style={{ left: l.start * pps, width: Math.max(8, (l.end - l.start) * pps) }}
                      onPointerDown={(e) => dragBar(e, l, 'move')}>
                      <span className="h h-l" onPointerDown={(e) => dragBar(e, l, 'start')} />
                      <span className="h h-r" onPointerDown={(e) => dragBar(e, l, 'end')} />
                      {/* collapsed: summary of all keyframe times */}
                      {!open && [...new Set(paths.flatMap((p) => l.tracks[p].map((k) => +k.t.toFixed(3))))].map((t) => (
                        <span key={t} className="kf-dot" style={{ left: (t - l.start) * pps }} />
                      ))}
                    </div>
                  </div>
                </div>
                {open && paths.map((path) => (
                  <div key={path} className="tl-row track" style={{ height: ROW_H - 6 }}>
                    <div className="tl-label sub" style={{ width: LABEL_W }}>{propLabel(l, path)}</div>
                    <div className="tl-lane" style={{ width: laneW }}>
                      <TrackCurve kfs={l.tracks[path]} pps={pps} />
                      {l.tracks[path].map((k) => (
                        <button key={k.id}
                          className={`kf ${selKf?.id === k.id ? 'sel' : ''} ease-${k.ease}`}
                          style={{ left: k.t * pps }}
                          onPointerDown={(e) => dragKf(e, l, path, k)}
                          aria-label={`Keyframe ${propLabel(l, path)} at ${k.t.toFixed(2)}s`}>
                          ◆
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {open && <AddTrack layer={l} />}
              </div>
            );
          })}
          {(project.audio ?? []).length > 0 && (
            <div className="tl-row tl-section" style={{ height: 22 }}>
              <div className="tl-label sub" style={{ width: LABEL_W }}>♪ Audio</div>
            </div>
          )}
          {(project.audio ?? []).map((c) => (
            <div key={c.id} className={`tl-row tl-audio ${c.muted ? 'hidden' : ''}`} style={{ height: ROW_H }}>
              <div className="tl-label" style={{ width: LABEL_W }}>
                <span className="lt lt-audio">♪</span>
                <span className="nm">{c.name}</span>
              </div>
              <div className="tl-lane" style={{ width: laneW }}>
                <div className="tl-bar bar-audio" style={{ left: c.start * pps, width: Math.max(8, c.duration * pps) }} onPointerDown={(e) => dragAudio(e, c, 'move')}>
                  <Waveform clip={c} height={24} />
                  <span className="h h-l" onPointerDown={(e) => dragAudio(e, c, 'start')} />
                  <span className="h h-r" onPointerDown={(e) => dragAudio(e, c, 'end')} />
                </div>
              </div>
            </div>
          ))}
          <div className="tl-playhead" ref={playheadRef} onPointerDown={onRulerDown} />
        </div>
      </div>
      <KeyframeEditor />
    </div>
  );

  function paste() {
    const st = store.state;
    const l = st.project.layers.find((x) => x.id === st.selectedLayerId);
    if (!clipboard || !l) return;
    const t = engine.frameTime();
    const { path, kf } = clipboard;
    if (!animatableProps(l).some((p) => p.path === path)) { toast(`"${path}" is not a property of ${l.name}`, 'error'); return; }
    store.updateLayer(l.id, (cur) => {
      const tr = upsertKeyframe(cur.tracks, path, t, kf.v);
      return { ...cur, tracks: { ...tr, [path]: tr[path].map((q) => (Math.abs(q.t - t) < 1e-3 ? { ...q, ease: kf.ease, bezier: kf.bezier } : q)) } };
    });
    setExpanded({ ...expanded, [l.id]: true });
    toast('Keyframe pasted', 'ok');
  }
}

/** Tiny value graph behind numeric keyframes. */
function TrackCurve({ kfs, pps }: { kfs: Keyframe[]; pps: number }) {
  if (kfs.length < 2 || typeof kfs[0].v !== 'number') return null;
  const t0 = kfs[0].t, t1 = kfs[kfs.length - 1].t;
  const vals = kfs.map((k) => k.v as number);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pts: string[] = [];
  const n = Math.min(120, Math.max(8, Math.round((t1 - t0) * pps / 4)));
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const v = evalTrack(kfs, t) as number;
    pts.push(`${(t * pps).toFixed(1)},${(26 - ((v - lo) / span) * 20).toFixed(1)}`);
  }
  return (
    <svg className="curve" width={t1 * pps + 4} height={30} aria-hidden>
      <polyline points={pts.join(' ')} />
    </svg>
  );
}

function AddTrack({ layer }: { layer: Layer }) {
  const props = animatableProps(layer).filter((p) => !layer.tracks[p.path]?.length);
  return (
    <div className="tl-row add-track">
      <div className="tl-label sub" style={{ width: LABEL_W }}>
        <select value="" aria-label="Animate property" onChange={(e) => {
          const path = e.target.value;
          if (!path) return;
          const t = engine.frameTime();
          getStore().updateLayer(layer.id, (l) => {
            const v = path.split('.').reduce((o: any, k) => o?.[k], l);
            return { ...l, tracks: upsertKeyframe(l.tracks, path, t, v) };
          });
          toast(`Keyframe added: ${propLabel(layer, path)} @ ${t.toFixed(2)}s — move the playhead and change the value to animate`, 'ok');
        }}>
          <option value="">＋ Animate…</option>
          {props.map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}
        </select>
      </div>
    </div>
  );
}

const EASE_IDS = Object.keys(EASING_LABELS) as EasingId[];

function KeyframeEditor() {
  const sel = useStore((s) => s.selectedKf);
  const layer = useStore((s) => (sel ? s.project.layers.find((l) => l.id === sel.layerId) : undefined));
  const fps = useStore((s) => s.project.fps);
  useTime();
  const store = getStore();
  const kf = layer?.tracks[sel?.path ?? '']?.find((k) => k.id === sel?.id);
  if (!sel || !layer || !kf) return <p className="hint">Tap a ◆ to edit it. Use “＋ Animate…” on an expanded layer, or the ◆ buttons in Inspect, to add keyframes. Drag ◆ to retime, drag bars to move/trim layers.</p>;
  const set = (patch: Partial<Keyframe>, key?: string) => store.updateLayer(layer.id, (l) => ({ ...l, tracks: updateKeyframe(l.tracks, sel.path, kf.id, patch) }), key);
  const def = animatableProps(layer).find((p) => p.path === sel.path);
  return (
    <div className="kf-editor">
      <div className="kf-title"><b>{layer.name}</b> · {propLabel(layer, sel.path)}</div>
      <div className="prop">
        <label>Time</label>
        <input className="num" inputMode="decimal" key={kf.t} defaultValue={kf.t.toFixed(3)}
          onBlur={(e) => { const t = parseFloat(e.target.value); if (Number.isFinite(t)) set({ t: snap(Math.max(0, t), fps) }); }} />
        <span className="unit">s</span>
      </div>
      <div className="prop">
        <label>Value</label>
        {isHexColor(kf.v) ? (
          <input type="color" value={String(kf.v).slice(0, 7)} onChange={(e) => set({ v: e.target.value }, `kfv:${kf.id}`)} />
        ) : (
          <>
            {def?.min !== undefined && <input type="range" min={def.min} max={def.max} step={def.step} value={Number(kf.v)} onChange={(e) => set({ v: parseFloat(e.target.value) }, `kfv:${kf.id}`)} />}
            <input className="num" inputMode="decimal" key={String(kf.v)} defaultValue={String(+Number(kf.v).toFixed(4))}
              onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) set({ v }); }} />
          </>
        )}
      </div>
      <div className="prop">
        <label>Easing →</label>
        <select value={kf.ease} onChange={(e) => set({ ease: e.target.value as EasingId, bezier: kf.bezier ?? [0.25, 0.1, 0.25, 1] })}>
          {EASE_IDS.map((id) => <option key={id} value={id}>{EASING_LABELS[id]}</option>)}
        </select>
      </div>
      {kf.ease === 'bezier' && (
        <div className="prop bez">
          <label>Bézier</label>
          {(kf.bezier ?? [0.25, 0.1, 0.25, 1]).map((b, i) => (
            <input key={i} className="num" inputMode="decimal" defaultValue={b}
              onBlur={(e) => {
                const arr = [...(kf.bezier ?? [0.25, 0.1, 0.25, 1])] as [number, number, number, number];
                const n = parseFloat(e.target.value);
                if (!Number.isFinite(n)) return;
                arr[i] = i % 2 === 0 ? Math.max(0, Math.min(1, n)) : n;
                set({ bezier: arr });
              }} />
          ))}
        </div>
      )}
      <div className="row-btns">
        <button onClick={() => { engine.player?.pause(); engine.player?.seek(kf.t); }}>Go to</button>
        <button onClick={() => { clipboard = { path: sel.path, kf: { ...kf } }; toast('Keyframe copied', 'ok'); }}>Copy</button>
        <button onClick={() => {
          const t = snap(Math.min(layer.end, kf.t + 0.5), fps);
          store.updateLayer(layer.id, (l) => ({ ...l, tracks: { ...l.tracks, [sel.path]: sortKfs([...l.tracks[sel.path].filter((q) => Math.abs(q.t - t) > 1e-3), { ...kf, id: uid(), t }]) } }));
        }}>Duplicate</button>
        <button className="danger" onClick={() => { store.updateLayer(layer.id, (l) => ({ ...l, tracks: removeKeyframe(l.tracks, sel.path, kf.id) })); store.selectKf(null); }}>Delete</button>
      </div>
    </div>
  );
}

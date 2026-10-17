import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ASPECTS, type AspectId, type PreviewQuality } from '../engine/types';
import { formatTime } from '../engine/util';
import { engine, QUALITY_DENSITY, QUALITY_SCALE, setProp, valueAt } from '../state/engine';
import { getStore, useStore } from '../state/store';
import { toast } from './controls';
import { liveAudio } from '../engine/audio';
import { hitTest, layerBox } from '../engine/bounds';
import { useLang } from './i18n';

export function Preview({ simple = false }: { simple?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aspect = useStore((s) => s.project.aspect);
  const [quality, setQuality] = useState<PreviewQuality>(() => (localStorage.getItem('mf.quality') as PreviewQuality) || 'medium');
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [focus, setFocus] = useState(false);
  const [glStatus, setGlStatus] = useState<string | null>(null);

  useEffect(() => {
    const r = engine.attach(canvasRef.current!);
    r.onStatus = (s) => {
      if (s === 'lost') setGlStatus('GPU context lost — recovering…');
      else if (s === 'restored') { setGlStatus(null); toast('GPU context restored', 'ok'); }
      else if (s === 'no-webgl2') setGlStatus('WebGL2 is not available: shader effects are disabled, 2D layers still render.');
    };
    return () => engine.detach();
  }, []);

  // fit the composition inside the available box
  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const A = ASPECTS[aspect];
  const fit = Math.min(box.w / A.w, box.h / A.h) || 0;
  const cssW = Math.floor(A.w * fit), cssH = Math.floor(A.h * fit);

  // render resolution: quality fraction of export size, never above what the screen can show
  useEffect(() => {
    if (!engine.renderer || !cssW) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const s = Math.min(QUALITY_SCALE[quality], (cssW * dpr) / A.w);
    engine.renderer.setSize(A.w * s, A.h * s);
    if (engine.player) engine.player.density = QUALITY_DENSITY[quality];
    engine.quality = quality;
    engine.player?.invalidate();
    try { localStorage.setItem('mf.quality', quality); } catch { /* private mode */ }
  }, [cssW, cssH, quality, A.w, A.h]);

  // ---- pointer: tap selects (simple mode), one finger drags the selected
  // layer, two fingers scale + rotate it; otherwise feed u_mouse / particles
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ id: string; x0: number; y0: number; px: number; py: number; moved: boolean } | null>(null);
  const pinch = useRef<{ id: string; d0: number; a0: number; s0: number; r0: number } | null>(null);
  const [moveMode, setMoveMode] = useState(true);
  const norm = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const selectedMovable = () => {
    const st = getStore().state;
    const l = st.project.layers.find((x) => x.id === st.selectedLayerId);
    return l && l.type !== 'shader' && l.type !== 'background' && l.type !== 'particles' ? l : null;
  };
  const startPinch = () => {
    const l = selectedMovable();
    const pts = [...pointers.current.values()];
    if (!l || pts.length < 2) return;
    const t = engine.frameTime();
    drag.current = null;
    pinch.current = { id: l.id, d0: Math.hypot(pts[0].x - pts[1].x, (pts[0].y - pts[1].y) * A.h / A.w), a0: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x), s0: Number(valueAt(l, 'scale', t)), r0: Number(valueAt(l, 'rotation', t)) };
  };
  const onDown = (e: React.PointerEvent) => {
    const p = norm(e);
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) { startPinch(); return; }
    const st = getStore().state;
    const t = engine.frameTime();
    if (simple) {
      const hit = hitTest(st.project, t, p.x * A.w, p.y * A.h, A.w, A.h);
      if (hit && hit !== st.selectedLayerId) getStore().select(hit);
      else if (!hit) { getStore().select(null); if (engine.renderer) engine.renderer.pointer = { ...p, down: true }; return; }
    }
    const l = selectedMovable();
    if (l && (moveMode || simple)) {
      drag.current = { id: l.id, x0: Number(valueAt(l, 'x', t)), y0: Number(valueAt(l, 'y', t)), px: p.x, py: p.y, moved: false };
    } else if (engine.renderer) {
      engine.renderer.pointer = { ...p, down: true };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const p = norm(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);
    const pc = pinch.current;
    if (pc && pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, (pts[0].y - pts[1].y) * A.h / A.w);
      const a = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      setProp(pc.id, 'scale', +Math.max(0.05, Math.min(8, pc.s0 * (d / Math.max(1e-3, pc.d0)))).toFixed(3));
      setProp(pc.id, 'rotation', +(pc.r0 + ((a - pc.a0) * 180) / Math.PI).toFixed(1));
      return;
    }
    const d = drag.current;
    if (d) {
      if (!d.moved && Math.hypot(p.x - d.px, p.y - d.py) < 0.008) return;
      d.moved = true;
      setProp(d.id, 'x', +(d.x0 + p.x - d.px).toFixed(4));
      setProp(d.id, 'y', +(d.y0 + p.y - d.py).toFixed(4));
    } else if (engine.renderer && (e.pointerType !== 'mouse' || e.buttons || engine.renderer.pointer)) {
      engine.renderer.pointer = { ...p, down: e.buttons > 0 };
      engine.player?.invalidate();
    }
  };
  const onUp = (e?: React.PointerEvent) => {
    if (e) pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
    if (engine.renderer) engine.renderer.pointer = null;
    engine.player?.invalidate();
  };

  const toggleFocus = () => {
    const el = wrapRef.current?.parentElement;
    if (!focus && el?.requestFullscreen && document.fullscreenEnabled) el.requestFullscreen().catch(() => {});
    else if (focus && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setFocus(!focus);
  };

  return (
    <div className={`preview ${focus ? 'focus' : ''} ${simple ? 'simple' : ''}`}>
      {!simple && <div className="preview-bar">
        <select aria-label="Aspect ratio" value={aspect} onChange={(e) => getStore().update((p) => ({ ...p, aspect: e.target.value as AspectId }))}>
          {(Object.keys(ASPECTS) as AspectId[]).map((a) => <option key={a} value={a}>{ASPECTS[a].label}</option>)}
        </select>
        <select aria-label="Preview quality" value={quality} onChange={(e) => setQuality(e.target.value as PreviewQuality)}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button className={`chip ${moveMode ? 'on' : ''}`} onClick={() => setMoveMode(!moveMode)} title="Drag on canvas moves the selected layer">
          {moveMode ? '✥ Move' : '☝ Touch'}
        </button>
        <button className="icon-btn" onClick={toggleFocus} aria-label="Fullscreen preview">{focus ? '⤡' : '⤢'}</button>
      </div>}
      <div className="stage" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          style={{ width: cssW, height: cssH }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={(e) => { if (!drag.current && e.pointerType === 'mouse') onUp(); }}
        />
        {simple && <SelectionFrame cssW={cssW} cssH={cssH} />}
        {glStatus && <div className="stage-msg">{glStatus}</div>}
        {simple && <button className="stage-fs icon-btn" onClick={toggleFocus} aria-label="Fullscreen preview">{focus ? '⤡' : '⤢'}</button>}
      </div>
      {simple ? <PlayRow /> : <Transport />}
    </div>
  );
}

export function Transport() {
  const duration = useStore((s) => s.project.duration);
  const fps = useStore((s) => s.project.fps);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef<HTMLSpanElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const [loop, setLoop] = useState(true);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const iv = setInterval(() => {
      if (!engine.player || unsub) return;
      unsub = engine.player.subscribe((t, pl) => {
        // direct DOM writes: no React re-render per frame
        if (timeRef.current) timeRef.current.textContent = formatTime(t, fps);
        if (rangeRef.current && document.activeElement !== rangeRef.current) rangeRef.current.value = String(t);
        setPlaying((p) => (p !== pl ? pl : p));
      }) as () => void;
    }, 50);
    return () => { clearInterval(iv); unsub?.(); };
  }, [fps]);

  useEffect(() => { if (engine.player) engine.player.loop = loop; }, [loop]);

  const step = (d: number) => { engine.player?.pause(); engine.player?.seek(engine.frameTime() + d / fps); };

  return (
    <div className="transport">
      <button className="icon-btn" onClick={() => engine.player?.seek(0)} aria-label="Go to start">⏮</button>
      <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous frame">◂</button>
      <button className="play-btn" onClick={() => { liveAudio.unlock(); engine.player?.toggle(); }} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
      <button className="icon-btn" onClick={() => step(1)} aria-label="Next frame">▸</button>
      <button className="icon-btn" onClick={() => { liveAudio.unlock(); engine.player?.restart(); }} aria-label="Restart">↻</button>
      <input
        ref={rangeRef}
        className="scrub"
        type="range"
        min={0}
        max={duration}
        step={1 / fps}
        defaultValue={0}
        aria-label="Scrub timeline"
        onPointerDown={() => engine.player?.pause()}
        onChange={(e) => engine.player?.seek(parseFloat(e.target.value))}
      />
      <span className="timecode" ref={timeRef}>{formatTime(0, fps)}</span>
      <button className={`chip small ${loop ? 'on' : ''}`} onClick={() => setLoop(!loop)} aria-label="Loop">⟲</button>
    </div>
  );
}

/** White frame around the selected layer, positioned over the canvas. */
function SelectionFrame({ cssW, cssH }: { cssW: number; cssH: number }) {
  const sel = useStore((s) => s.project.layers.find((l) => l.id === s.selectedLayerId) ?? null);
  const aspect = useStore((s) => s.project.aspect);
  const [, force] = useState(0);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    const iv = setInterval(() => { if (engine.player && !unsub) unsub = engine.player.subscribe(() => force((n) => (n + 1) % 1e6)) as () => void; }, 60);
    return () => { clearInterval(iv); unsub?.(); };
  }, []);
  if (!sel || !cssW) return null;
  const A = ASPECTS[aspect];
  const t = engine.frameTime();
  if (t < sel.start || t > sel.end) return null;
  const b = layerBox(sel, t, A.w, A.h);
  if (!b) return null;
  const s = cssW / A.w;
  return (
    <div className="sel-frame" style={{ width: b.w * s, height: b.h * s, left: `calc(50% - ${cssW / 2}px + ${b.cx * s}px)`, top: `calc(50% - ${cssH / 2}px + ${b.cy * s}px)`, transform: `translate(-50%, -50%) rotate(${b.rot}deg)` }} />
  );
}

/** Simple play row: big play button, current / total time. */
export function PlayRow() {
  const duration = useStore((s) => s.project.duration);
  const fps = useStore((s) => s.project.fps);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef<HTMLSpanElement>(null);
  const { t } = useLang();
  useStore((s) => s.project); // refresh undo/redo state
  useEffect(() => {
    let unsub: (() => void) | undefined;
    const iv = setInterval(() => {
      if (!engine.player || unsub) return;
      unsub = engine.player.subscribe((tt, pl) => {
        if (timeRef.current) timeRef.current.textContent = fmtShort(tt);
        setPlaying((p) => (p !== pl ? pl : p));
      }) as () => void;
    }, 50);
    return () => { clearInterval(iv); unsub?.(); };
  }, [fps]);
  return (
    <div className="play-row">
      <span className="time"><span ref={timeRef}>{fmtShort(0)}</span> / {fmtShort(duration)}</span>
      <button className="play-big" aria-label={playing ? t('pause') : t('play')} onClick={() => { liveAudio.unlock(); engine.player?.toggle(); }}>{playing ? '❚❚' : '▶'}</button>
      <span className="time right">
        <button className="icon-btn small" aria-label={t('undo')} disabled={!getStore().canUndo} onClick={() => getStore().undo()}>↶</button>
        <button className="icon-btn small" aria-label={t('redo')} disabled={!getStore().canRedo} onClick={() => getStore().redo()}>↷</button>
      </span>
    </div>
  );
}

const fmtShort = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;

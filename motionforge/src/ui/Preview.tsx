import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ASPECTS, type AspectId, type PreviewQuality } from '../engine/types';
import { formatTime } from '../engine/util';
import { engine, QUALITY_DENSITY, QUALITY_SCALE, setProp, valueAt } from '../state/engine';
import { getStore, useStore } from '../state/store';
import { toast } from './controls';

export function Preview() {
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

  // ---- pointer: drag selected layer, or feed u_mouse / particle interaction
  const drag = useRef<{ id: string; x0: number; y0: number; px: number; py: number } | null>(null);
  const norm = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const onDown = (e: React.PointerEvent) => {
    const p = norm(e);
    const st = getStore().state;
    const l = st.project.layers.find((x) => x.id === st.selectedLayerId);
    if (l && l.type !== 'shader' && l.type !== 'background' && moveMode) {
      (e.target as Element).setPointerCapture(e.pointerId);
      const t = engine.frameTime();
      drag.current = { id: l.id, x0: Number(valueAt(l, 'x', t)), y0: Number(valueAt(l, 'y', t)), px: p.x, py: p.y };
    } else if (engine.renderer) {
      engine.renderer.pointer = { ...p, down: true };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const p = norm(e);
    const d = drag.current;
    if (d) {
      setProp(d.id, 'x', +(d.x0 + p.x - d.px).toFixed(4));
      setProp(d.id, 'y', +(d.y0 + p.y - d.py).toFixed(4));
    } else if (engine.renderer && (e.pointerType !== 'mouse' || e.buttons || engine.renderer.pointer)) {
      engine.renderer.pointer = { ...p, down: e.buttons > 0 };
      engine.player?.invalidate();
    }
  };
  const onUp = () => {
    drag.current = null;
    if (engine.renderer) engine.renderer.pointer = null;
    engine.player?.invalidate();
  };
  const [moveMode, setMoveMode] = useState(true);

  const toggleFocus = () => {
    const el = wrapRef.current?.parentElement;
    if (!focus && el?.requestFullscreen && document.fullscreenEnabled) el.requestFullscreen().catch(() => {});
    else if (focus && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setFocus(!focus);
  };

  return (
    <div className={`preview ${focus ? 'focus' : ''}`}>
      <div className="preview-bar">
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
      </div>
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
        {glStatus && <div className="stage-msg">{glStatus}</div>}
      </div>
      <Transport />
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
      <button className="play-btn" onClick={() => engine.player?.toggle()} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
      <button className="icon-btn" onClick={() => step(1)} aria-label="Next frame">▸</button>
      <button className="icon-btn" onClick={() => engine.player?.restart()} aria-label="Restart">↻</button>
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

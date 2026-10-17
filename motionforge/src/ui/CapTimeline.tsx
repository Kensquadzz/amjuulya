// CapCut-style timeline: the playhead stays fixed in the centre and the
// tracks scroll under it. Swipe to scrub, pinch to zoom, tap to select,
// drag the handles of the selected item to trim it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AudioClip, Layer } from '../engine/types';
import { engine } from '../state/engine';
import { getStore, useStore } from '../state/store';
import { clipRole } from '../engine/audio';
import { Waveform, updateClip } from './AudioPanel';
import { LAYER_ICON } from './props';

const ROW = 30;

function layerLabel(l: Layer) {
  if (l.type === 'text') return l.text.replace(/\n/g, ' ').slice(0, 40) || 'Text';
  return l.name;
}

export function CapTimeline() {
  const project = useStore((s) => s.project);
  const selLayer = useStore((s) => s.selectedLayerId);
  const selClip = useStore((s) => s.selectedClipId);
  const scroller = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(70);
  const [vw, setVw] = useState(360);
  const programmatic = useRef(false);
  const { duration, fps } = project;
  const store = getStore();

  useLayoutEffect(() => {
    const el = scroller.current!;
    const ro = new ResizeObserver(() => setVw(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // follow the clock (playback / seeks) by scrolling the tracks under the playhead
  useEffect(() => {
    const place = (t: number) => {
      const el = scroller.current;
      if (!el) return;
      const target = t * pps;
      if (Math.abs(el.scrollLeft - target) > 0.5) { programmatic.current = true; el.scrollLeft = target; }
    };
    place(engine.time);
    let unsub: (() => void) | undefined;
    const iv = setInterval(() => { if (engine.player && !unsub) unsub = engine.player.subscribe((t) => place(t)) as () => void; }, 50);
    return () => { clearInterval(iv); unsub?.(); };
  }, [pps]);

  const onScroll = () => {
    if (programmatic.current) { programmatic.current = false; return; }
    const el = scroller.current!;
    engine.player?.pause();
    engine.player?.seek(Math.round((el.scrollLeft / pps) * fps) / fps);
  };

  // pinch to zoom (keeps the time under the playhead)
  const pinch = useRef<{ d0: number; p0: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) pinch.current = { d0: Math.abs(e.touches[0].clientX - e.touches[1].clientX), p0: pps };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinch.current) {
      const d = Math.abs(e.touches[0].clientX - e.touches[1].clientX);
      const t = engine.time;
      const next = Math.max(15, Math.min(500, pinch.current.p0 * (d / Math.max(10, pinch.current.d0))));
      setPps(next);
      requestAnimationFrame(() => { const el = scroller.current; if (el) { programmatic.current = true; el.scrollLeft = t * next; } });
    }
  };
  const onTouchEnd = () => { pinch.current = null; };

  // trimming handles on the selected item
  const trim = (e: React.PointerEvent, side: 'start' | 'end', item: { kind: 'layer'; l: Layer } | { kind: 'clip'; c: AudioClip }) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const snap = (v: number) => Math.round(v * fps) / fps;
    const move = (ev: PointerEvent) => {
      const dt = snap((ev.clientX - x0) / pps);
      if (item.kind === 'layer') {
        const o = item.l;
        store.updateLayer(o.id, (l) => side === 'start'
          ? { ...l, start: Math.max(0, Math.min(o.end - 1 / fps, o.start + dt)) }
          : { ...l, end: Math.max(o.start + 1 / fps, Math.min(duration, o.end + dt)) }, `trim:${o.id}:${side}`);
      } else {
        const o = item.c;
        if (side === 'end') updateClip(o.id, { duration: Math.max(0.05, o.duration + dt) }, `trim:${o.id}:e`);
        else { const d = Math.max(-o.offset, Math.max(-o.start, Math.min(o.duration - 0.05, dt))); updateClip(o.id, { start: o.start + d, offset: o.offset + d, duration: o.duration - d }, `trim:${o.id}:s`); }
      }
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // drag the selected bar to move it in time (long-press free: only when already selected)
  const moveBar = (e: React.PointerEvent, item: { kind: 'layer'; l: Layer } | { kind: 'clip'; c: AudioClip }, selected: boolean) => {
    if (!selected) return; // first tap selects; scrolling stays natural
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 8) return;
      moved = true;
      const dt = Math.round((dx / pps) * fps) / fps;
      if (item.kind === 'layer') {
        const o = item.l;
        const d = Math.max(-o.start, Math.min(duration - o.end, dt));
        const tracks: Layer['tracks'] = {};
        for (const [p, k] of Object.entries(o.tracks)) tracks[p] = k.map((q) => ({ ...q, t: q.t + d }));
        store.updateLayer(o.id, () => ({ ...o, start: o.start + d, end: o.end + d, tracks }), `mv:${o.id}`);
      } else updateClip(item.c.id, { start: Math.max(0, Math.min(duration - 0.05, item.c.start + dt)) }, `mv:${item.c.id}`);
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const pad = vw / 2;
  const width = duration * pps;
  const ticks: number[] = [];
  const step = pps > 160 ? 0.5 : pps > 50 ? 1 : pps > 25 ? 2 : 5;
  for (let t = 0; t <= duration + 1e-6; t += step) ticks.push(+t.toFixed(2));
  // pack items into as few lanes as possible (like CapCut's overlay tracks):
  // things that never overlap in time share a row. Top-most layers come first.
  const pack = <T,>(items: T[], span: (x: T) => [number, number]) => {
    const lanes: { end: number[]; items: T[] }[] = [];
    for (const it of items) {
      const [a, b] = span(it);
      let lane = lanes.find((ln) => ln.items.every((o) => { const [c, d] = span(o); return b <= c + 1e-3 || a >= d - 1e-3; }));
      if (!lane) { lane = { end: [], items: [] }; lanes.push(lane); }
      lane.items.push(it);
    }
    return lanes.map((l) => l.items);
  };
  const layerLanes = pack([...project.layers].reverse(), (l) => [l.start, l.end]);
  const sfx = (project.audio ?? []).filter((c) => clipRole(c) === 'sfx').sort((a, b) => a.start - b.start);
  const music = (project.audio ?? []).filter((c) => clipRole(c) === 'music').sort((a, b) => a.start - b.start);
  const clipLanes = [...pack(sfx, (c) => [c.start, c.start + c.duration]), ...pack(music, (c) => [c.start, c.start + c.duration])];

  return (
    <div className="cap-timeline">
      <div className="cap-scroll" ref={scroller} onScroll={onScroll} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onClick={(e) => { if (e.target === e.currentTarget) store.select(null); }}>
        <div className="cap-inner" style={{ width: width + pad * 2, paddingLeft: pad, paddingRight: pad }}>
          <div className="cap-ruler" style={{ width }}>
            {ticks.map((t) => <span key={t} style={{ left: t * pps }}>{Number.isInteger(t) ? `${t}s` : '·'}</span>)}
          </div>
          {layerLanes.map((lane, li) => (
            <div key={`L${li}`} className="cap-row" style={{ height: ROW, width }}>
              {lane.map((l) => {
                const sel = l.id === selLayer;
                return (
                  <div key={l.id} className={`cap-bar bar-${l.type} ${sel ? 'sel' : ''} ${l.visible ? '' : 'hidden'}`} style={{ left: l.start * pps, width: Math.max(14, (l.end - l.start) * pps) }}
                    onClick={(e) => { e.stopPropagation(); store.select(l.id); }} onPointerDown={(e) => moveBar(e, { kind: 'layer', l }, sel)}>
                    <span className="cap-ico">{LAYER_ICON[l.type]}</span>
                    <span className="cap-label">{layerLabel(l)}</span>
                    {sel && <span className="cap-h l" onPointerDown={(e) => trim(e, 'start', { kind: 'layer', l })} />}
                    {sel && <span className="cap-h r" onPointerDown={(e) => trim(e, 'end', { kind: 'layer', l })} />}
                  </div>
                );
              })}
            </div>
          ))}
          {clipLanes.map((lane, li) => (
            <div key={`A${li}`} className="cap-row" style={{ height: ROW, width }}>
              {lane.map((c) => {
                const sel = c.id === selClip;
                return (
                  <div key={c.id} className={`cap-bar bar-audio ${clipRole(c)} ${sel ? 'sel' : ''} ${c.muted ? 'hidden' : ''}`} style={{ left: c.start * pps, width: Math.max(14, c.duration * pps) }}
                    onClick={(e) => { e.stopPropagation(); store.selectClip(c.id); }} onPointerDown={(e) => moveBar(e, { kind: 'clip', c }, sel)}>
                    <Waveform clip={c} height={20} />
                    <span className="cap-label">{clipRole(c) === 'music' ? '🎵 ' : '🔊 '}{c.name}</span>
                    {sel && <span className="cap-h l" onPointerDown={(e) => trim(e, 'start', { kind: 'clip', c })} />}
                    {sel && <span className="cap-h r" onPointerDown={(e) => trim(e, 'end', { kind: 'clip', c })} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="cap-playhead" aria-hidden />
    </div>
  );
}

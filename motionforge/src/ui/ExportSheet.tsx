import { useEffect, useRef, useState } from 'react';
import { deliverFile, detectCapabilities, exportSize, exportVideo, ExportCancelled, validateForExport, type Capabilities, type ExportResult, type ExportSettings, type QualityLevel } from '../engine/exporter';
import type { VideoCodec } from 'mediabunny';
import { engine } from '../state/engine';
import { getStore, useStore } from '../state/store';
import { Sheet, toast } from './controls';

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function ExportSheet({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [choice, setChoice] = useState<string>('');
  const [scale, setScale] = useState(1);
  const [fps, setFps] = useState(project.fps);
  const [duration, setDuration] = useState(project.duration);
  const [quality, setQuality] = useState<QualityLevel>('high');
  const [progress, setProgress] = useState<{ stage: string; frac: number } | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const { width, height } = exportSize(project, 1);
    detectCapabilities(width, height).then((c) => {
      setCaps(c);
      setChoice(c.webcodecs[0] ? `wc:${c.webcodecs[0].codec}` : c.mediarecorder[0] ? `mr:${c.mediarecorder[0].mimeType}` : '');
    });
    return () => { abort.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const size = exportSize(project, scale);
  const uhdOk = !!caps && choice.startsWith('wc:') && !!caps.webcodecs.find((c) => `wc:${c.codec}` === choice)?.uhd;
  // leaving a 4K-capable codec drops back to Full HD
  useEffect(() => { if (scale > 1 && caps && !uhdOk) setScale(1); }, [uhdOk, scale, caps]);
  const settings = (): ExportSettings => {
    const [m, v] = [choice.slice(0, 2), choice.slice(3)];
    return m === 'wc'
      ? { method: 'webcodecs', codec: v as VideoCodec, scale, fps, duration, quality }
      : { method: 'mediarecorder', mimeType: v, scale, fps, duration, quality };
  };
  const issues = validateForExport(project, { ...settings(), duration, fps });

  const start = async () => {
    setError(null);
    setResult(null);
    if (url) { URL.revokeObjectURL(url); setUrl(null); }
    engine.player?.pause();
    const ac = new AbortController();
    abort.current = ac;
    setProgress({ stage: 'Validating', frac: 0 });
    try {
      const r = await exportVideo(getStore().state.project, settings(), (stage, frac) => setProgress({ stage, frac }), ac.signal);
      setResult(r);
      setUrl(URL.createObjectURL(r.blob));
    } catch (e) {
      if (e instanceof ExportCancelled) toast('Export cancelled');
      else setError((e as Error).message || String(e));
    } finally {
      setProgress(null);
      abort.current = null;
      engine.player?.invalidate();
    }
  };

  const mb = (n: number) => `${(n / 1048576).toFixed(n > 1048576 * 10 ? 0 : 1)} MB`;
  const noMethods = caps && !caps.webcodecs.length && !caps.mediarecorder.length;

  return (
    <Sheet title="Export video" onClose={() => { if (!progress || confirm('Cancel the running export?')) { abort.current?.abort(); onClose(); } }}>
      {!caps && <p>Checking what this browser can encode…</p>}
      {noMethods && (
        <div className="notice error">
          This browser exposes neither WebCodecs video encoding nor MediaRecorder canvas capture, so a video file cannot be produced here.
          Update iOS / Safari (16.4+ recommended) or try another browser. Your project is saved and can be exported as JSON from Projects.
        </div>
      )}
      {caps && !noMethods && !progress && !result && (
        <div className="export-form">
          <div className="prop">
            <label>Format</label>
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              {caps.webcodecs.length > 0 && (
                <optgroup label="Frame-exact (WebCodecs)">
                  {caps.webcodecs.map((c) => <option key={c.codec} value={`wc:${c.codec}`}>{c.label}</option>)}
                </optgroup>
              )}
              {caps.mediarecorder.length > 0 && (
                <optgroup label="Real-time recording (MediaRecorder)">
                  {caps.mediarecorder.map((c) => <option key={c.mimeType} value={`mr:${c.mimeType}`}>{c.label}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="prop">
            <label>Resolution</label>
            <select value={scale} onChange={(e) => setScale(+e.target.value)}>
              {uhdOk && <option value={2}>4K · {exportSize(project, 2).width}×{exportSize(project, 2).height}</option>}
              <option value={1}>Full HD · {exportSize(project, 1).width}×{exportSize(project, 1).height}</option>
              <option value={2 / 3}>720p · {exportSize(project, 2 / 3).width}×{exportSize(project, 2 / 3).height}</option>
              <option value={0.5}>540p · {exportSize(project, 0.5).width}×{exportSize(project, 0.5).height}</option>
            </select>
          </div>
          <div className="prop">
            <label>Frame rate</label>
            <select value={fps} onChange={(e) => setFps(+e.target.value)}>{[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select>
          </div>
          <div className="prop">
            <label>Duration</label>
            <input type="range" min={0.5} max={project.duration} step={0.1} value={duration} onChange={(e) => setDuration(+e.target.value)} />
            <span className="num ro">{duration.toFixed(1)}s</span>
          </div>
          <div className="prop">
            <label>Quality</label>
            <select value={quality} onChange={(e) => setQuality(e.target.value as QualityLevel)}>
              <option value="low">Low (small file)</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <p className="hint">
            {choice.startsWith('wc')
              ? `Renders all ${Math.round(duration * fps)} frames exactly, independent of device speed. Output: ${size.width}×${size.height}.`
              : `Records the canvas while the animation plays in real time (${duration.toFixed(1)}s). Slow devices may drop frames — the result will tell you how many. Prefer WebCodecs when listed.`}
            {isIOS && ' On iPhone, MP4 · H.264 can be saved to Photos from the share sheet.'}
            {scale > 1 && ` 4K uses about ${Math.round((size.width * size.height * 4 * 7) / 1048576)} MB of GPU memory while rendering and makes a large file — keep exports under ~30s on phones, and pick HEVC if offered for a smaller file.`}
            {scale === 1 && project.aspect !== '1:1' && ' If the export fails on an older iPhone, choose 720p.'}
            {caps && choice.startsWith('wc:') && !uhdOk && ' 4K is not offered because this device’s encoder does not accept 4K for the selected format.'}
          </p>
          {issues.map((i) => <div key={i} className="notice error">{i}</div>)}
          <button className="wide primary" disabled={!choice || issues.length > 0} onClick={start}>Export</button>
        </div>
      )}
      {progress && (
        <div className="export-progress">
          <p>{progress.stage}</p>
          <div className="bar"><span style={{ width: `${Math.round(progress.frac * 100)}%` }} /></div>
          <p className="hint">Keep this tab open and the screen on — iOS pauses background tabs.</p>
          <button className="wide danger" onClick={() => abort.current?.abort()}>Cancel</button>
        </div>
      )}
      {error && (
        <div className="notice error">
          <b>Export failed.</b> {error}
          <div className="row-btns"><button onClick={() => setError(null)}>Back to settings</button></div>
        </div>
      )}
      {result && url && (
        <div className="export-result">
          <video src={url} controls playsInline loop muted autoPlay className={`result-video ar-${project.aspect.replace(':', 'x')}`} />
          <p>
            <b>{result.filename}</b><br />
            {mb(result.blob.size)} · {result.width}×{result.height} · {result.frames} frames · {result.mimeType} · {(result.elapsedMs / 1000).toFixed(1)}s
          </p>
          {result.droppedFrames ? <div className="notice">{result.droppedFrames} of {result.frames} frames were dropped because this device could not render in real time. Try 540p, Low preview quality, or the WebCodecs format.</div> : null}
          <div className="row-btns">
            {'share' in navigator && <button className="primary" onClick={async () => { const r = await deliverFile(result.blob, result.filename, true); if (r === 'downloaded') toast('Sharing not available — downloaded instead'); }}>Share / Save to Photos</button>}
            <button onClick={() => deliverFile(result.blob, result.filename, false)}>Download</button>
            <button onClick={() => { setResult(null); }}>New export</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

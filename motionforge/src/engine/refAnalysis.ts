// Local reference-video analysis (in the browser, nothing is uploaded).
// What it measures: frames sampled over time, cuts (big frame-to-frame
// histogram changes), average shot length (pacing), a colour palette,
// brightness / saturation, and a contact sheet of one frame per shot.
// What it does NOT do: understand objects, text or meaning in the video.

export interface RefShot { start: number; end: number; thumb: string }
export interface RefProfile {
  name: string;
  duration: number;
  width: number;
  height: number;
  cuts: number[];
  shots: RefShot[];
  avgShot: number;
  palette: string[]; // most frequent first
  accent: string; // most saturated useful colour
  accent2: string;
  brightness: number; // 0..1
  saturation: number; // 0..1
  sheet: string; // data URL contact sheet
}

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
function hsv(r: number, g: number, b: number) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return { s: mx ? (mx - mn) / mx : 0, v: mx / 255 };
}

/** k-means on RGB samples */
function kmeans(px: number[][], k: number, iters = 10) {
  let cent = Array.from({ length: k }, (_, i) => px[Math.floor((i + 0.5) * px.length / k)].slice());
  let counts = new Array(k).fill(0);
  for (let it = 0; it < iters; it++) {
    const sum = Array.from({ length: k }, () => [0, 0, 0]); counts = new Array(k).fill(0);
    for (const p of px) {
      let bi = 0, bd = Infinity;
      for (let j = 0; j < k; j++) { const d = (p[0] - cent[j][0]) ** 2 + (p[1] - cent[j][1]) ** 2 + (p[2] - cent[j][2]) ** 2; if (d < bd) { bd = d; bi = j; } }
      sum[bi][0] += p[0]; sum[bi][1] += p[1]; sum[bi][2] += p[2]; counts[bi]++;
    }
    cent = cent.map((c, j) => (counts[j] ? sum[j].map((v) => v / counts[j]) : c));
  }
  return cent.map((c, j) => ({ c, n: counts[j] })).sort((a, b) => b.n - a.n);
}

function seekTo(v: HTMLVideoElement, t: number) {
  return new Promise<void>((res) => {
    const done = () => { v.removeEventListener('seeked', done); res(); };
    v.addEventListener('seeked', done);
    v.currentTime = Math.min(t, Math.max(0, v.duration - 0.05));
  });
}

/** Analyse a video file. `step` = seconds between sampled frames. */
export async function analyzeReference(file: File, onProgress?: (f: number) => void, step = 0.25): Promise<RefProfile> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try {
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('This video could not be opened by the browser.')); });
    const duration = v.duration, vw = v.videoWidth, vh = v.videoHeight;
    if (!isFinite(duration) || duration <= 0) throw new Error('The video has no readable duration.');
    const SW = 64, SH = Math.max(8, Math.round((64 * vh) / vw));
    const small = document.createElement('canvas'); small.width = SW; small.height = SH;
    const sx = small.getContext('2d', { willReadFrequently: true })!;
    const TW = 180, TH = Math.round((TW * vh) / vw);
    const thumbC = document.createElement('canvas'); thumbC.width = TW; thumbC.height = TH;
    const tx = thumbC.getContext('2d')!;
    const times: number[] = [];
    for (let t = 0; t < duration; t += step) times.push(+t.toFixed(3));
    const hists: Float32Array[] = [];
    const samples: number[][] = [];
    let bright = 0, sat = 0, nPix = 0;
    const thumbs: string[] = [];
    for (let i = 0; i < times.length; i++) {
      await seekTo(v, times[i]);
      sx.drawImage(v, 0, 0, SW, SH);
      const d = sx.getImageData(0, 0, SW, SH).data;
      const h = new Float32Array(64);
      for (let p = 0; p < d.length; p += 4) {
        const r = d[p], g = d[p + 1], b = d[p + 2];
        h[(r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)]++;
        const q = hsv(r, g, b); bright += q.v; sat += q.s; nPix++;
        if ((p >> 2) % 7 === 0) samples.push([r, g, b]);
      }
      for (let k = 0; k < 64; k++) h[k] /= SW * SH;
      hists.push(h);
      tx.drawImage(v, 0, 0, TW, TH); thumbs.push(thumbC.toDataURL('image/jpeg', 0.7));
      onProgress?.((i + 1) / times.length);
    }
    // cuts: histogram distance well above the clip's typical change
    const dist = hists.map((h, i) => (i ? h.reduce((a, x, k) => a + Math.abs(x - hists[i - 1][k]), 0) / 2 : 0));
    const sorted = dist.slice(1).sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const thr = Math.max(0.28, med * 4);
    const cuts: number[] = [];
    dist.forEach((x, i) => { if (i && x > thr && (!cuts.length || times[i] - cuts[cuts.length - 1] > 0.5)) cuts.push(times[i]); });
    const bounds = [0, ...cuts, duration];
    const shots: RefShot[] = bounds.slice(0, -1).map((s, i) => {
      const mid = (s + bounds[i + 1]) / 2, fi = Math.min(times.length - 1, Math.round(mid / step));
      return { start: s, end: bounds[i + 1], thumb: thumbs[fi] };
    });
    const pal = kmeans(samples.length ? samples : [[0, 0, 0]], 6);
    const palette = pal.map((p) => hex(p.c[0], p.c[1], p.c[2]));
    // accent: saturated, not too dark or too light
    const rank = pal.map((p) => { const q = hsv(p.c[0], p.c[1], p.c[2]); return { col: hex(p.c[0], p.c[1], p.c[2]), score: q.s * (q.v > 0.25 && q.v < 0.97 ? 1 : 0.2) }; }).sort((a, b) => b.score - a.score);
    // contact sheet: one frame per shot (max 24)
    const pick = shots.length > 24 ? shots.filter((_, i) => i % Math.ceil(shots.length / 24) === 0) : shots;
    const cols = Math.min(6, pick.length), rows = Math.ceil(pick.length / cols);
    const sheet = document.createElement('canvas'); sheet.width = cols * TW; sheet.height = rows * (TH + 22);
    const sh = sheet.getContext('2d')!; sh.fillStyle = '#0b0d12'; sh.fillRect(0, 0, sheet.width, sheet.height);
    await Promise.all(pick.map((s, i) => new Promise<void>((res) => { const im = new Image(); im.onload = () => { const x = (i % cols) * TW, y = Math.floor(i / cols) * (TH + 22); sh.drawImage(im, x, y, TW, TH); sh.fillStyle = '#cfd6e6'; sh.font = '13px Inter, sans-serif'; sh.fillText(`${s.start.toFixed(1)}–${s.end.toFixed(1)} s`, x + 6, y + TH + 16); res(); }; im.onerror = () => res(); im.src = s.thumb; })));
    return {
      name: file.name, duration, width: vw, height: vh, cuts, shots,
      avgShot: +(duration / shots.length).toFixed(2),
      palette, accent: rank[0]?.col ?? '#2f5bff', accent2: rank[1]?.col ?? '#18b4ff',
      brightness: +(bright / nPix).toFixed(3), saturation: +(sat / nPix).toFixed(3),
      sheet: sheet.toDataURL('image/jpeg', 0.85),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

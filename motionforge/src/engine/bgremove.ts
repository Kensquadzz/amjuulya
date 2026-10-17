// On-device background removal.
// Model: U²-Net-p (Qin et al., Apache-2.0), 4.6 MB ONNX, run with
// onnxruntime-web (MIT) on WebAssembly. Nothing leaves the device; the model
// and runtime download once from this app's own origin and are then cached.
import type { InferenceSession, Tensor } from 'onnxruntime-web';

const SIZE = 320; // U²-Net input resolution
let sessionPromise: Promise<{ ort: typeof import('onnxruntime-web'); session: InferenceSession }> | null = null;

function assetUrl(path: string) {
  // relative to the app's base, not the page URL (deep links fall back to index.html)
  return new URL(path.replace(/^\.\//, ''), new URL(import.meta.env.BASE_URL, location.origin)).href;
}

async function getSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await import('onnxruntime-web/wasm');
      ort.env.wasm.wasmPaths = assetUrl('./ort/');
      // threads need cross-origin isolation, which static hosts don't set by default
      ort.env.wasm.numThreads = 1;
      const session = await ort.InferenceSession.create(assetUrl('./models/u2netp.onnx'), {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      return { ort: ort as unknown as typeof import('onnxruntime-web'), session };
    })();
    sessionPromise.catch(() => { sessionPromise = null; });
  }
  return sessionPromise;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Could not decode the image.'));
    i.src = src;
  });
}

export interface RemoveResult {
  dataUrl: string;
  /** fraction of the image kept as foreground (sanity signal for the UI) */
  coverage: number;
  ms: number;
}

/**
 * Remove the background of an image (data URL in, transparent PNG data URL out).
 * The result is cropped to the subject with a small margin.
 */
export async function removeBackground(src: string, onStage?: (s: string) => void): Promise<RemoveResult> {
  const t0 = performance.now();
  onStage?.('Loading model (first time only)…');
  const { ort, session } = await getSession();
  const img = await loadImage(src);
  const W = img.naturalWidth, H = img.naturalHeight;

  onStage?.('Finding the subject…');
  // 1. resize to 320×320 and normalise like the reference implementation
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const cx = c.getContext('2d', { willReadFrequently: true })!;
  cx.drawImage(img, 0, 0, SIZE, SIZE);
  const px = cx.getImageData(0, 0, SIZE, SIZE).data;
  let maxV = 1;
  for (let i = 0; i < px.length; i += 4) maxV = Math.max(maxV, px[i], px[i + 1], px[i + 2]);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  const input = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    for (let ch = 0; ch < 3; ch++) input[ch * SIZE * SIZE + p] = (px[i + ch] / maxV - mean[ch]) / std[ch];
  }
  const feeds: Record<string, Tensor> = { [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) };
  const out = await session.run(feeds);
  const pred = out[session.outputNames[0]].data as Float32Array;

  // 2. normalise prediction to 0..1 and build a small alpha mask
  let lo = Infinity, hi = -Infinity;
  for (const v of pred) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo || 1;
  const m = document.createElement('canvas');
  m.width = m.height = SIZE;
  const mx = m.getContext('2d')!;
  const md = mx.createImageData(SIZE, SIZE);
  let fg = 0;
  for (let p = 0; p < SIZE * SIZE; p++) {
    let a = (pred[p] - lo) / span;
    // gentle contrast curve: crisper edges without hard aliasing
    a = Math.min(1, Math.max(0, (a - 0.12) / 0.76));
    fg += a;
    md.data[p * 4 + 3] = Math.round(a * 255);
  }
  mx.putImageData(md, 0, 0);

  onStage?.('Cutting out…');
  // 3. upscale mask (bilinear) onto the full-resolution image
  const o = document.createElement('canvas');
  o.width = W;
  o.height = H;
  const ox = o.getContext('2d', { willReadFrequently: true })!;
  ox.drawImage(img, 0, 0);
  ox.globalCompositeOperation = 'destination-in';
  ox.imageSmoothingEnabled = true;
  ox.imageSmoothingQuality = 'high';
  ox.drawImage(m, 0, 0, W, H);
  ox.globalCompositeOperation = 'source-over';

  // 4. crop to the subject bounds
  const a = ox.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    if (a[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const coverage = fg / (SIZE * SIZE);
  if (x1 < 0) throw new Error('No subject was found in this image.');
  const pad = Math.round(Math.max(W, H) * 0.02);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const f = document.createElement('canvas');
  f.width = x1 - x0 + 1;
  f.height = y1 - y0 + 1;
  f.getContext('2d')!.drawImage(o, x0, y0, f.width, f.height, 0, 0, f.width, f.height);
  return { dataUrl: f.toDataURL('image/png'), coverage, ms: performance.now() - t0 };
}

/** Load the model ahead of time (e.g. when the user opens an image layer). */
export function warmUpBackgroundRemoval() {
  getSession().catch(() => {});
}

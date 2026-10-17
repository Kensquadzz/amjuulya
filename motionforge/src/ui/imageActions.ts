import { removeBackground } from '../engine/bgremove';
import type { ImageLayer, Layer } from '../engine/types';
import { getStore } from '../state/store';
import { loadImageFile } from './images';
import { toast } from './controls';

const KEY = 'mf.autoRemoveBg';
export const autoRemoveBg = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
export const setAutoRemoveBg = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* */ } };

let busy = false;

/** Run background removal on a layer's current photo and store the cut-out. */
export async function cutOutLayer(layerId: string) {
  const store = getStore();
  const l = store.state.project.layers.find((x) => x.id === layerId) as ImageLayer | undefined;
  if (!l || l.type !== 'image' || !l.src) return;
  if (busy) { toast('Background removal is already running…'); return; }
  busy = true;
  const original = l.srcOriginal ?? l.src;
  toast('Removing background…');
  try {
    const r = await removeBackground(original, (s) => toast(s));
    store.updateLayer(layerId, (x) => ({ ...(x as ImageLayer), src: r.dataUrl, srcOriginal: original } as Layer));
    if (r.coverage > 0.92) toast('Background removed — the subject fills almost the whole photo, check the result', 'info');
    else toast(`Background removed in ${(r.ms / 1000).toFixed(1)}s`, 'ok');
  } catch (e) {
    toast('Background removal failed: ' + ((e as Error).message || e), 'error');
  } finally {
    busy = false;
  }
}

export function restoreOriginal(layerId: string) {
  getStore().updateLayer(layerId, (x) => {
    const l = x as ImageLayer;
    return l.srcOriginal ? ({ ...l, src: l.srcOriginal, srcOriginal: undefined } as Layer) : x;
  });
}

/** Load a picked file into an image layer, then (optionally) cut it out. */
export async function setLayerImageFromFile(layerId: string, file: File) {
  try {
    const src = await loadImageFile(file);
    getStore().updateLayer(layerId, (x) => ({ ...(x as ImageLayer), src, srcOriginal: undefined } as Layer));
    if (autoRemoveBg()) await cutOutLayer(layerId);
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

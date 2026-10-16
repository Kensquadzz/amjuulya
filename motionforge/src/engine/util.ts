export const uid = () =>
  (globalThis.crypto && 'randomUUID' in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
  ).slice(0, 12);

/** Deterministic hash -> [0,1). Same inputs always give the same output (needed for scrubbing/export). */
export function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const deepClone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function formatTime(t: number, fps = 30): string {
  const s = Math.max(0, t);
  const sec = Math.floor(s);
  const fr = Math.floor((s - sec) * fps + 1e-6);
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}:${String(fr).padStart(2, '0')}`;
}

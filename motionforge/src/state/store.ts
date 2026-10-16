// App state outside React: project + selection + undo/redo history.
// React subscribes through useSyncExternalStore; the engine subscribes directly.
import { useRef, useSyncExternalStore } from 'react';
import type { Layer, Project } from '../engine/types';

export interface SelectedKf { layerId: string; path: string; id: string }

export interface AppState {
  project: Project;
  selectedLayerId: string | null;
  selectedKf: SelectedKf | null;
  dirty: boolean;
  savedAt: number | null;
}

type Listener = () => void;

const HISTORY_LIMIT = 80;
const COALESCE_MS = 700;

export class Store {
  state: AppState;
  private listeners = new Set<Listener>();
  private past: Project[] = [];
  private future: Project[] = [];
  private lastKey: string | null = null;
  private lastTime = 0;

  constructor(project: Project) {
    this.state = { project, selectedLayerId: project.layers.at(-1)?.id ?? null, selectedKf: null, dirty: false, savedAt: null };
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  private set(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  /**
   * Apply a project change. Changes with the same `coalesce` key in quick
   * succession (e.g. dragging a slider) collapse into one undo step.
   */
  update(fn: (p: Project) => Project, coalesce?: string) {
    const prev = this.state.project;
    const next = fn(prev);
    if (next === prev) return;
    const now = performance.now();
    const merge = coalesce && coalesce === this.lastKey && now - this.lastTime < COALESCE_MS;
    if (!merge) {
      this.past.push(prev);
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.future = [];
    this.lastKey = coalesce ?? null;
    this.lastTime = now;
    this.set({ project: { ...next, updatedAt: Date.now() }, dirty: true });
  }

  updateLayer(id: string, fn: (l: Layer) => Layer, coalesce?: string) {
    this.update((p) => {
      const i = p.layers.findIndex((l) => l.id === id);
      if (i < 0) return p;
      const nl = fn(p.layers[i]);
      if (nl === p.layers[i]) return p;
      const layers = [...p.layers];
      layers[i] = nl;
      return { ...p, layers };
    }, coalesce);
  }

  /** Replace the whole project (open/new/import). Clears history. */
  load(project: Project) {
    this.past = [];
    this.future = [];
    this.lastKey = null;
    this.set({ project, selectedLayerId: project.layers.at(-1)?.id ?? null, selectedKf: null, dirty: false, savedAt: null });
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  undo() {
    const p = this.past.pop();
    if (!p) return;
    this.future.push(this.state.project);
    this.lastKey = null;
    this.set({ project: p, dirty: true, selectedKf: null, ...this.fixSelection(p) });
  }

  redo() {
    const p = this.future.pop();
    if (!p) return;
    this.past.push(this.state.project);
    this.lastKey = null;
    this.set({ project: p, dirty: true, selectedKf: null, ...this.fixSelection(p) });
  }

  private fixSelection(p: Project) {
    return p.layers.some((l) => l.id === this.state.selectedLayerId) ? {} : { selectedLayerId: p.layers.at(-1)?.id ?? null };
  }

  select(id: string | null) {
    if (id !== this.state.selectedLayerId) this.set({ selectedLayerId: id, selectedKf: null });
  }

  selectKf(k: SelectedKf | null) {
    this.set({ selectedKf: k, ...(k ? { selectedLayerId: k.layerId } : {}) });
  }

  markSaved() {
    this.set({ dirty: false, savedAt: Date.now() });
  }
}

let store: Store;
export const initStore = (p: Project) => (store = new Store(p));
export const getStore = () => store;

export function useStore<T>(sel: (s: AppState) => T): T {
  // cache per state snapshot so selectors that build arrays/objects stay stable
  // (recomputed when the state or the selector changes; selectors may close over props)
  const cache = useRef<{ state: AppState | null; sel: unknown; value: T }>({ state: null, sel: null, value: undefined as T });
  return useSyncExternalStore(store.subscribe, () => {
    const c = cache.current;
    if (c.state !== store.state || c.sel !== sel) {
      const v = sel(store.state);
      c.state = store.state;
      c.sel = sel;
      if (!shallowEqual(v, c.value)) c.value = v;
    }
    return c.value;
  });
}

function shallowEqual(a: unknown, b: unknown) {
  if (Object.is(a, b)) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((x, i) => Object.is(x, b[i]));
}

export function useSelectedLayer(): Layer | null {
  return useStore((s) => s.project.layers.find((l) => l.id === s.selectedLayerId) ?? null);
}

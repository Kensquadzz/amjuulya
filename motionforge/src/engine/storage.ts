// IndexedDB persistence for projects, custom shaders and custom presets.
// Falls back to an in-memory store (with a warning) when IndexedDB is blocked.
import type { Project } from './types';

const DB_NAME = 'motionforge';
const DB_VERSION = 1;
const STORES = ['projects', 'shaders', 'presets', 'meta'] as const;
type StoreName = (typeof STORES)[number];

export interface SavedShader { id: string; name: string; source: string; updatedAt: number }
export interface SavedPreset { id: string; name: string; project: Project; updatedAt: number }
export interface ProjectSummary { id: string; name: string; updatedAt: number; aspect: string; layers: number }

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory: Record<StoreName, Map<string, unknown>> = { projects: new Map(), shaders: new Map(), presets: new Map(), meta: new Map() };
export let storageMode: 'indexeddb' | 'memory' = 'indexeddb';

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (!('indexedDB' in globalThis)) throw new Error('no indexedDB');
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { storageMode = 'memory'; resolve(null); };
      req.onblocked = () => { storageMode = 'memory'; resolve(null); };
    } catch {
      storageMode = 'memory';
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        if (!db) return reject(new Error('memory'));
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
        t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted (storage full?)'));
      }),
  );
}

async function put(store: StoreName, value: any) {
  try {
    await tx(store, 'readwrite', (s) => s.put(value));
  } catch (e) {
    if ((e as Error).message !== 'memory') throw e;
    memory[store].set(value.id ?? value.key, JSON.parse(JSON.stringify(value)));
  }
}

async function get<T>(store: StoreName, key: string): Promise<T | undefined> {
  try {
    return await tx<T>(store, 'readonly', (s) => s.get(key) as IDBRequest<T>);
  } catch (e) {
    if ((e as Error).message !== 'memory') throw e;
    return memory[store].get(key) as T | undefined;
  }
}

async function all<T>(store: StoreName): Promise<T[]> {
  try {
    return await tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
  } catch (e) {
    if ((e as Error).message !== 'memory') throw e;
    return [...memory[store].values()] as T[];
  }
}

async function del(store: StoreName, key: string) {
  try {
    await tx(store, 'readwrite', (s) => s.delete(key));
  } catch (e) {
    if ((e as Error).message !== 'memory') throw e;
    memory[store].delete(key);
  }
}

export const storage = {
  async saveProject(p: Project) {
    await put('projects', { ...p, updatedAt: Date.now() });
    await put('meta', { key: 'lastProjectId', value: p.id });
  },
  loadProject: (id: string) => get<Project>('projects', id),
  async listProjects(): Promise<ProjectSummary[]> {
    const list = await all<Project>('projects');
    return list
      .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, aspect: p.aspect, layers: p.layers.length }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
  deleteProject: (id: string) => del('projects', id),
  async lastProjectId() {
    return (await get<{ key: string; value: string }>('meta', 'lastProjectId'))?.value;
  },
  async setMeta(key: string, value: unknown) { await put('meta', { key, value }); },
  async getMeta<T>(key: string) { return (await get<{ key: string; value: T }>('meta', key))?.value; },
  saveShader: (s: SavedShader) => put('shaders', s),
  listShaders: () => all<SavedShader>('shaders').then((l) => l.sort((a, b) => b.updatedAt - a.updatedAt)),
  deleteShader: (id: string) => del('shaders', id),
  savePreset: (p: SavedPreset) => put('presets', p),
  listPresets: () => all<SavedPreset>('presets').then((l) => l.sort((a, b) => b.updatedAt - a.updatedAt)),
  deletePreset: (id: string) => del('presets', id),
  async estimate() {
    try {
      const e = await navigator.storage?.estimate?.();
      return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
    } catch {
      return null;
    }
  },
  async requestPersistence() {
    try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
  },
};

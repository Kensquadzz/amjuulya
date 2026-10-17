import { useEffect, useState } from 'react';
import { storage, storageMode, type ProjectSummary } from '../engine/storage';
import { newProject, normalizeProject } from '../engine/project';
import { sampleProject } from '../engine/templates';
import { deepClone, uid } from '../engine/util';
import { deliverFile } from '../engine/exporter';
import { collectAssets, restoreAssets } from '../engine/audio';
import { engine } from '../state/engine';
import { getStore, useStore } from '../state/store';
import { Sheet, toast } from './controls';

export function ProjectsSheet({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const dirty = useStore((s) => s.dirty);
  const [list, setList] = useState<ProjectSummary[]>([]);
  const [usage, setUsage] = useState<string>('');
  const store = getStore();
  const refresh = () => {
    storage.listProjects().then(setList).catch((e) => toast('Storage error: ' + e.message, 'error'));
    storage.estimate().then((e) => e && setUsage(`${(e.usage / 1048576).toFixed(1)} MB used of ~${(e.quota / 1048576).toFixed(0)} MB`));
  };
  useEffect(refresh, []);

  const saveNow = async () => {
    try { await storage.saveProject(store.state.project); store.markSaved(); toast('Saved', 'ok'); refresh(); }
    catch (e) { toast('Save failed: ' + (e as Error).message, 'error'); }
  };

  const guard = () => !dirty || confirm('The current project has unsaved changes. Continue anyway?');

  const open = async (id: string) => {
    if (!guard()) return;
    try {
      const p = await storage.loadProject(id);
      if (!p) throw new Error('Project not found');
      store.load(normalizeProject(p));
      engine.player?.seek(0);
      onClose();
    } catch (e) { toast('Could not open: ' + (e as Error).message, 'error'); }
  };

  const duplicate = async (id: string) => {
    const p = await storage.loadProject(id);
    if (!p) return;
    await storage.saveProject({ ...deepClone(p), id: uid(), name: `${p.name} copy`, createdAt: Date.now() });
    refresh();
  };

  const remove = async (s: ProjectSummary) => {
    if (!confirm(`Delete "${s.name}" permanently?`)) return;
    await storage.deleteProject(s.id);
    if (s.id === project.id) store.markSaved();
    refresh();
  };

  const importJson = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text());
      const p = normalizeProject(raw);
      await restoreAssets(raw._assets);
      if (!guard()) return;
      const fresh = { ...p, id: uid(), updatedAt: Date.now() };
      store.load(fresh);
      await storage.saveProject(fresh);
      store.markSaved();
      toast(`Imported "${p.name}"`, 'ok');
      onClose();
    } catch (e) {
      toast('Import failed: ' + (e as Error).message, 'error');
    }
  };

  const exportJson = async () => {
    // embed imported audio files so the JSON is self-contained
    const _assets = await collectAssets(store.state.project);
    const blob = new Blob([JSON.stringify({ ...store.state.project, _assets }, null, 2)], { type: 'application/json' });
    const name = `${(project.name || 'project').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-')}.motionforge.json`;
    const r = await deliverFile(blob, name, /iP(hone|ad)/.test(navigator.userAgent));
    if (r !== 'cancelled') toast('Project JSON exported', 'ok');
  };

  return (
    <Sheet title="Projects" onClose={onClose}>
      {storageMode === 'memory' && <div className="notice error">IndexedDB is unavailable (private browsing?). Projects only last until this tab closes — use Export JSON to keep your work.</div>}
      <div className="prop">
        <label>Current</label>
        <input className="name-input" value={project.name} onChange={(e) => store.update((p) => ({ ...p, name: e.target.value }), 'pname')} aria-label="Project name" />
      </div>
      <div className="row-btns">
        <button className="primary" onClick={saveNow}>Save{dirty ? ' •' : ''}</button>
        <button onClick={() => { if (guard()) { store.load(newProject('Untitled', { aspect: project.aspect })); onClose(); } }}>New</button>
        <button onClick={async () => { const c = { ...deepClone(project), id: uid(), name: `${project.name} copy` }; store.load(c); await storage.saveProject(c); store.markSaved(); refresh(); toast('Duplicated — now editing the copy', 'ok'); }}>Duplicate</button>
      </div>
      <div className="row-btns">
        <label className="file-btn">Import JSON<input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importJson(f); }} /></label>
        <button onClick={exportJson}>Export JSON</button>
        <button onClick={() => { if (guard()) { store.load(sampleProject(project.aspect)); engine.player?.restart(); onClose(); } }}>Restore sample</button>
      </div>
      <h3>Saved on this device</h3>
      {list.length === 0 && <p className="hint">Nothing saved yet.</p>}
      <ul className="layer-list">
        {list.map((s) => (
          <li key={s.id} className={s.id === project.id ? 'sel' : ''}>
            <button className="lname" onClick={() => open(s.id)}>
              <span className="nm">{s.name}</span>
              <small>{s.aspect} · {s.layers} layers · {new Date(s.updatedAt).toLocaleString()}</small>
            </button>
            <div className="lactions">
              <button aria-label="Duplicate" onClick={() => duplicate(s.id)}>⧉</button>
              <button aria-label="Delete" className="danger" onClick={() => remove(s)}>✕</button>
            </div>
          </li>
        ))}
      </ul>
      {usage && <p className="hint">{usage}. Videos are never stored here — only project data.</p>}
    </Sheet>
  );
}

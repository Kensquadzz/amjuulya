import { useEffect, useState } from 'react';
import { TEMPLATES, TEMPLATE_CATEGORIES, projectFromTemplate, type TemplateCategory } from '../engine/templates';
import { newProject, normalizeProject } from '../engine/project';
import { storage, type SavedPreset } from '../engine/storage';
import { deepClone, uid } from '../engine/util';
import { engine } from '../state/engine';
import { getStore, useStore } from '../state/store';
import { toast } from './controls';

export function TemplatesPanel() {
  const [cat, setCat] = useState<TemplateCategory | 'All' | 'Mine'>('All');
  const [mine, setMine] = useState<SavedPreset[]>([]);
  const store = getStore();
  const project = useStore((s) => s.project);
  const refresh = () => storage.listPresets().then(setMine).catch((e) => toast('Could not read presets: ' + e.message, 'error'));
  useEffect(() => { refresh(); }, []);

  const confirmReplace = () => !store.state.dirty || confirm('Replace the current composition? Unsaved changes are kept only if you saved them (Undo also works).');

  const apply = (id: string) => {
    const tpl = TEMPLATES.find((t) => t.id === id)!;
    if (!confirmReplace()) return;
    const p = projectFromTemplate(tpl, store.state.project.aspect);
    store.load(p);
    engine.player?.restart();
  };

  const applyMine = (sp: SavedPreset) => {
    if (!confirmReplace()) return;
    const p = normalizeProject(deepClone(sp.project));
    store.load({ ...p, id: uid(), name: sp.name, createdAt: Date.now(), updatedAt: Date.now() });
    engine.player?.restart();
  };

  const saveAsPreset = async () => {
    const name = prompt('Preset name', project.name);
    if (!name) return;
    await storage.savePreset({ id: uid(), name, project: deepClone(project), updatedAt: Date.now() });
    toast('Saved as custom preset', 'ok');
    refresh();
    setCat('Mine');
  };

  const duplicateTemplate = async (id: string) => {
    const tpl = TEMPLATES.find((t) => t.id === id)!;
    const p = projectFromTemplate(tpl, project.aspect);
    await storage.savePreset({ id: uid(), name: `${tpl.name} (copy)`, project: p, updatedAt: Date.now() });
    toast('Template duplicated into My presets', 'ok');
    refresh();
  };

  const resetPreset = () => {
    const tpl = TEMPLATES.find((t) => t.id === project.templateId);
    if (!tpl) return;
    if (!confirm(`Reset "${tpl.name}" to its default parameters? (Undo can restore.)`)) return;
    const b = tpl.build();
    store.update((p) => ({ ...p, duration: b.duration, background: b.background, layers: b.layers }));
    engine.player?.restart();
  };

  const list = cat === 'All' ? TEMPLATES : cat === 'Mine' ? [] : TEMPLATES.filter((t) => t.categories.includes(cat));

  return (
    <div className="templates">
      <div className="row-btns">
        <button onClick={saveAsPreset}>Save current as preset</button>
        {project.templateId && TEMPLATES.some((t) => t.id === project.templateId) && <button onClick={resetPreset}>Reset preset</button>}
        <button onClick={() => { if (confirmReplace()) store.load(newProject('Untitled', { aspect: project.aspect })); }}>Blank</button>
      </div>
      <div className="chips">
        {(['All', 'Mine', ...TEMPLATE_CATEGORIES] as const).map((c) => (
          <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c === 'Mine' ? `My presets (${mine.length})` : c}</button>
        ))}
      </div>
      <div className="tpl-grid">
        {list.map((t) => (
          <div key={t.id} className={`tpl ${project.templateId === t.id ? 'cur' : ''}`}>
            <button className="tpl-main" onClick={() => apply(t.id)}>
              <span className="sw" style={{ background: `linear-gradient(135deg, ${t.swatch[0]} 0%, ${t.swatch[0]} 45%, ${t.swatch[1]} 100%)` }} />
              <b>{t.name}</b>
              <small>{t.categories.join(' · ')}</small>
            </button>
            <button className="tpl-dup" aria-label={`Duplicate ${t.name}`} onClick={() => duplicateTemplate(t.id)}>⧉</button>
          </div>
        ))}
        {cat === 'Mine' && mine.map((m) => (
          <div key={m.id} className="tpl">
            <button className="tpl-main" onClick={() => applyMine(m)}>
              <span className="sw" style={{ background: m.project.background }} />
              <b>{m.name}</b>
              <small>{m.project.layers.length} layers · {new Date(m.updatedAt).toLocaleDateString()}</small>
            </button>
            <button className="tpl-dup danger" aria-label={`Delete ${m.name}`} onClick={async () => { if (confirm(`Delete preset "${m.name}"?`)) { await storage.deletePreset(m.id); refresh(); } }}>✕</button>
          </div>
        ))}
        {cat === 'Mine' && !mine.length && <p className="hint">No custom presets yet. Edit a composition and tap “Save current as preset”.</p>}
      </div>
    </div>
  );
}

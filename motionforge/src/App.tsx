import { useEffect, useState } from 'react';
import { Preview } from './ui/Preview';
import { Timeline } from './ui/Timeline';
import { Inspector } from './ui/Inspector';
import { LayersPanel } from './ui/LayersPanel';
import { TemplatesPanel } from './ui/TemplatesPanel';
import { CodePanel } from './ui/CodePanel';
import { ExportSheet } from './ui/ExportSheet';
import { ProjectsSheet } from './ui/ProjectsSheet';
import { Toasts, toast } from './ui/controls';
import { storage } from './engine/storage';
import { getStore, useStore } from './state/store';
import { engine } from './state/engine';

type Tab = 'templates' | 'layers' | 'inspect' | 'timeline' | 'code';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'templates', label: 'Presets', icon: '✧' },
  { id: 'layers', label: 'Layers', icon: '☰' },
  { id: 'inspect', label: 'Inspect', icon: '⚙' },
  { id: 'timeline', label: 'Timeline', icon: '◆' },
  { id: 'code', label: 'Code', icon: '</>' },
];

export function App() {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('mf.tab') as Tab) || 'timeline');
  const [sheet, setSheet] = useState<'export' | 'projects' | null>(null);
  const name = useStore((s) => s.project.name);
  const dirty = useStore((s) => s.dirty);
  useStore((s) => s.project); // re-render undo/redo enabled state
  const store = getStore();

  useEffect(() => { try { localStorage.setItem('mf.tab', tab); } catch { /* */ } }, [tab]);

  // autosave shortly after changes
  useEffect(() => {
    if (!dirty) return;
    const id = setTimeout(() => {
      storage.saveProject(store.state.project).then(() => store.markSaved()).catch((e) => toast('Autosave failed: ' + e.message, 'error'));
    }, 1500);
    return () => clearTimeout(id);
  });

  // optional keyboard shortcuts (never required on touch devices)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); }
      if (e.key === ' ') { e.preventDefault(); engine.player?.toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  const save = async () => {
    try { await storage.saveProject(store.state.project); store.markSaved(); toast('Project saved', 'ok'); }
    catch (e) { toast('Save failed: ' + (e as Error).message, 'error'); }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo" aria-label="MOTIONFORGE STUDIO"><span className="mark">MF</span><span className="word">MOTIONFORGE <i>STUDIO</i></span></div>
        <button className="proj-name" onClick={() => setSheet('projects')} title="Projects">{name || 'Untitled'}{dirty ? ' •' : ''}</button>
        <div className="top-actions">
          <button className="icon-btn" onClick={() => store.undo()} disabled={!store.canUndo} aria-label="Undo">↶</button>
          <button className="icon-btn" onClick={() => store.redo()} disabled={!store.canRedo} aria-label="Redo">↷</button>
          <button className="icon-btn" onClick={save} aria-label="Save project">⤓</button>
          <button className="export-btn" onClick={() => setSheet('export')}>Export</button>
        </div>
      </header>
      <main className="workspace">
        <Preview />
        <div className="panel">
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                <span className="ti">{t.icon}</span><span className="tl">{t.label}</span>
              </button>
            ))}
          </nav>
          <div className="panel-body">
            {tab === 'templates' && <TemplatesPanel />}
            {tab === 'layers' && <LayersPanel onEdit={() => setTab('inspect')} />}
            {tab === 'inspect' && <Inspector onOpenCode={() => setTab('code')} />}
            {tab === 'timeline' && <Timeline />}
            {tab === 'code' && <CodePanel />}
          </div>
        </div>
      </main>
      {sheet === 'export' && <ExportSheet onClose={() => setSheet(null)} />}
      {sheet === 'projects' && <ProjectsSheet onClose={() => setSheet(null)} />}
      <Toasts />
    </div>
  );
}

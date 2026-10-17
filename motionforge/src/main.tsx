import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initStore } from './state/store';
import { storage } from './engine/storage';
import { normalizeProject } from './engine/project';
import { sampleProject } from './engine/templates';
import { engine } from './state/engine';
import { liveAudio } from './engine/audio';
import './fonts.css';
import './styles.css';

async function boot() {
  let project = null;
  try {
    const id = await storage.lastProjectId();
    const saved = id ? await storage.loadProject(id) : undefined;
    if (saved) project = normalizeProject(saved);
  } catch (e) {
    console.warn('Could not restore last project', e);
  }
  // first launch: a sample showing text animation, glow and a glitch transition
  if (!project) project = sampleProject();
  const store = initStore(project);
  // debugging / automated-test hook (read-only access to app internals)
  (window as any).__motionforge = { store, engine, liveAudio };
  storage.requestPersistence();
  createRoot(document.getElementById('root')!).render(<App />);
}

boot().catch((e) => {
  document.getElementById('root')!.innerHTML = `<div style="padding:24px;color:#fff;font-family:system-ui">MOTIONFORGE failed to start: ${String(e?.message ?? e)}</div>`;
});

import { useEffect, useState } from 'react';
import { ASPECTS, type AspectId } from '../engine/types';
import { newProject, normalizeProject } from '../engine/project';
import { storage, type ProjectSummary } from '../engine/storage';
import { engine } from '../state/engine';
import { getStore, useStore } from '../state/store';
import { TemplatesPanel } from './TemplatesPanel';
import { setLang, useLang } from './i18n';
import { toast } from './controls';

export function Home({ onOpen }: { onOpen: () => void }) {
  const { t, lang } = useLang();
  const project = useStore((s) => s.project);
  const [list, setList] = useState<ProjectSummary[]>([]);
  const [picking, setPicking] = useState(false);
  const refresh = () => storage.listProjects().then(setList).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const create = async (a: AspectId) => {
    // keep the current work safe before switching
    await storage.saveProject(getStore().state.project).catch(() => {});
    getStore().load(newProject(lang === 'mn' ? 'Шинэ төсөл' : 'New project', { aspect: a, duration: 10 }));
    engine.player?.seek(0);
    onOpen();
  };

  const open = async (id: string) => {
    if (id === project.id) { onOpen(); return; }
    await storage.saveProject(getStore().state.project).catch(() => {});
    const p = await storage.loadProject(id);
    if (!p) { toast('Not found', 'error'); return; }
    getStore().load(normalizeProject(p));
    engine.player?.seek(0);
    onOpen();
  };

  return (
    <div className="home">
      <header className="home-top">
        <div className="logo"><span className="mark">MF</span><span className="word">MOTIONFORGE</span></div>
        <div className="seg lang" role="radiogroup" aria-label={t('language')}>
          <button className={lang === 'mn' ? 'on' : ''} onClick={() => setLang('mn')}>MN</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
      </header>
      <div className="home-body">
        <button className="new-project" onClick={() => setPicking(!picking)}>
          <span className="plus">＋</span>
          <span>{t('newProject')}</span>
        </button>
        {picking && (
          <div className="ratio-grid">
            {(Object.keys(ASPECTS) as AspectId[]).map((a) => {
              const A = ASPECTS[a];
              const s = 46 / Math.max(A.w, A.h);
              return (
                <button key={a} className="ratio" onClick={() => create(a)}>
                  <span className="rbox" style={{ width: A.w * s, height: A.h * s }} />
                  <b>{a}</b>
                  <small>{{ '9:16': 'TikTok · Reels', '16:9': 'YouTube', '1:1': 'Post', '4:5': 'Instagram' }[a]}</small>
                </button>
              );
            })}
          </div>
        )}

        <button className="continue" onClick={onOpen}>
          <span className="cbadge">▶</span>
          <span className="ctext"><small>{t('continue')}</small><b>{project.name}</b><small>{project.layers.length} · {project.duration}s · {project.aspect}</small></span>
        </button>

        <h2 className="home-h">{t('templates')}</h2>
        <TemplatesPanel onUsed={onOpen} />

        {list.length > 0 && (
          <>
            <h2 className="home-h">{t('myProjects')}</h2>
            <ul className="layer-list">
              {list.map((p) => (
                <li key={p.id} className={p.id === project.id ? 'sel' : ''}>
                  <button className="lname" onClick={() => open(p.id)}>
                    <span className="nm">{p.name}</span>
                    <small>{p.aspect} · {new Date(p.updatedAt).toLocaleString()}</small>
                  </button>
                  <div className="lactions">
                    <button aria-label="Delete" className="danger" onClick={async () => {
                      if (!confirm(`${p.name}?`)) return;
                      await storage.deleteProject(p.id);
                      refresh();
                    }}>🗑</button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

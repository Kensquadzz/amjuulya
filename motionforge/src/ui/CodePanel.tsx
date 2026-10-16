import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { StreamLanguage, bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { shader } from '@codemirror/legacy-modes/mode/clike';
import { oneDark } from '@codemirror/theme-one-dark';
import { linter, lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import type { ShaderError } from '../engine/gl';
import { BLANK_SHADER, SHADERS } from '../engine/shaders/library';
import { defaultParams } from '../engine/shaderParams';
import { storage, type SavedShader } from '../engine/storage';
import { makeShader } from '../engine/project';
import { uid } from '../engine/util';
import type { ShaderLayer } from '../engine/types';
import { engine, useTime } from '../state/engine';
import { getStore, useSelectedLayer, useStore } from '../state/store';
import { Section, toast } from './controls';
import { ShaderParamControls } from './Inspector';

function toDiagnostics(doc: EditorState['doc'], errs: ShaderError[]): Diagnostic[] {
  return errs.map((e) => {
    const ln = e.line && e.line >= 1 && e.line <= doc.lines ? doc.line(e.line) : doc.line(1);
    return { from: ln.from, to: ln.to, severity: 'error', message: e.message };
  });
}

export function CodePanel() {
  const layer = useSelectedLayer();
  const shaderLayers = useStore((s) => s.project.layers.filter((l) => l.type === 'shader')) as ShaderLayer[];
  const dur = useStore((s) => s.project.duration);
  const store = getStore();

  if (!layer || layer.type !== 'shader') {
    return (
      <div className="code-empty">
        <p className="hint">The code editor edits GLSL ES 3.00 fragment shaders. Select a shader layer, or create one:</p>
        <div className="row-btns">
          <button className="primary" onClick={() => {
            const l = makeShader(dur, 'custom', { name: 'Custom shader' });
            store.update((p) => ({ ...p, layers: [...p.layers, l] }));
            store.select(l.id);
          }}>＋ New custom shader layer</button>
        </div>
        {shaderLayers.length > 0 && (
          <ul className="layer-list">
            {shaderLayers.map((l) => <li key={l.id}><button className="lname" onClick={() => store.select(l.id)}>✦ {l.name}</button></li>)}
          </ul>
        )}
      </div>
    );
  }
  return <Editor key={layer.id} layer={layer} />;
}

function Editor({ layer }: { layer: ShaderLayer }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [errors, setErrors] = useState<ShaderError[]>([]);
  const [status, setStatus] = useState<'ok' | 'error' | 'editing'>(layer.draft && layer.draft !== layer.source ? 'editing' : 'ok');
  const [auto, setAuto] = useState(() => localStorage.getItem('mf.autocompile') !== '0');
  const [lib, setLib] = useState<SavedShader[]>([]);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const timer = useRef(0);
  const store = getStore();
  useTime(200);
  const live = useStore((s) => s.project.layers.find((l) => l.id === layer.id)) as ShaderLayer | undefined;

  const refreshLib = () => storage.listShaders().then(setLib).catch(() => {});
  useEffect(() => { refreshLib(); }, []);

  const compile = (src: string, quiet = false) => {
    const r = engine.renderer;
    if (!r) return;
    const res = r.installShader(layer.id, src);
    const v = view.current;
    if (v) v.dispatch(setDiagnostics(v.state, toDiagnostics(v.state.doc, res.errors)));
    setErrors(res.errors);
    if (res.ok) {
      setStatus('ok');
      // keep existing parameter values, add defaults for newly declared uniforms
      store.updateLayer(layer.id, (l) => {
        const sl = l as ShaderLayer;
        return { ...sl, source: src, draft: undefined, params: { ...defaultParams(src), ...sl.params } };
      }, `src:${layer.id}`);
      engine.player?.invalidate();
      if (!quiet) toast('Compiled ✓', 'ok');
    } else {
      setStatus('error');
      // the previous working program keeps rendering; keep the draft so nothing is lost
      store.updateLayer(layer.id, (l) => ({ ...(l as ShaderLayer), draft: src }), `src:${layer.id}`);
    }
  };

  useEffect(() => {
    const state = EditorState.create({
      doc: layer.draft ?? layer.source,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        indentOnInput(),
        bracketMatching(),
        StreamLanguage.define(shader),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        oneDark,
        lintGutter(),
        linter(null),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab, { key: 'Mod-Enter', run: (v) => { compile(v.state.doc.toString()); return true; } }]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          setStatus('editing');
          clearTimeout(timer.current);
          if (autoRef.current) timer.current = window.setTimeout(() => compile(u.state.doc.toString(), true), 700);
        }),
        EditorView.contentAttributes.of({ autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' }),
      ],
    });
    view.current = new EditorView({ state, parent: host.current! });
    if (layer.draft && layer.draft !== layer.source) compile(layer.draft, true);
    return () => { clearTimeout(timer.current); view.current?.destroy(); view.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDoc = (src: string) => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: src } });
    compile(src, true);
  };

  const jump = (line: number | null) => {
    const v = view.current;
    if (!v || !line || line > v.state.doc.lines) return;
    const ln = v.state.doc.line(line);
    v.dispatch({ selection: { anchor: ln.from, head: ln.to }, scrollIntoView: true });
    v.focus();
  };

  const saveToLibrary = async () => {
    const name = prompt('Save shader as', layer.shaderName || layer.name);
    if (!name) return;
    await storage.saveShader({ id: uid(), name, source: view.current!.state.doc.toString(), updatedAt: Date.now() });
    toast('Shader saved to your library', 'ok');
    refreshLib();
  };

  return (
    <div className="code-panel">
      <div className="code-toolbar">
        <button className="primary" onClick={() => compile(view.current!.state.doc.toString())}>▶ Compile</button>
        <button className={`chip ${auto ? 'on' : ''}`} onClick={() => { setAuto(!auto); try { localStorage.setItem('mf.autocompile', auto ? '0' : '1'); } catch { /* */ } }}>Live</button>
        <span className={`status ${status}`}>{status === 'ok' ? '● Compiled' : status === 'error' ? `● ${errors.length} error${errors.length === 1 ? '' : 's'} — showing last working shader` : '● Edited'}</span>
      </div>
      <div className="code-toolbar">
        <select value="" aria-label="Load example shader" onChange={(e) => {
          const id = e.target.value;
          if (!id) return;
          const src = id === '__blank' ? BLANK_SHADER : SHADERS.find((s) => s.id === id)!.source;
          if (confirm('Replace the editor contents with this example?')) {
            setDoc(src);
            const def = SHADERS.find((s) => s.id === id);
            store.updateLayer(layer.id, (l) => ({ ...(l as ShaderLayer), shaderName: def?.name ?? 'Custom shader', params: { ...defaultParams(src), ...(def?.params ?? {}) } }));
          }
        }}>
          <option value="">Examples…</option>
          <option value="__blank">Blank template</option>
          <optgroup label="Starter shaders">
            {SHADERS.filter((s) => s.starter).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </optgroup>
          <optgroup label="All built-in effects">
            {SHADERS.filter((s) => !s.starter).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </optgroup>
        </select>
        <select value="" aria-label="Load saved shader" onChange={(e) => {
          const s = lib.find((x) => x.id === e.target.value);
          if (s && confirm(`Load "${s.name}"?`)) { setDoc(s.source); store.updateLayer(layer.id, (l) => ({ ...(l as ShaderLayer), shaderName: s.name })); }
        }}>
          <option value="">My shaders ({lib.length})…</option>
          {lib.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={saveToLibrary}>Save</button>
        <button disabled={!live || (live.draft === undefined && status !== 'error')} onClick={() => { if (live) { setDoc(live.source); setStatus('ok'); setErrors([]); toast('Restored last working shader', 'ok'); } }}>Restore working</button>
      </div>
      <div className="cm-host" ref={host} />
      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}><button onClick={() => jump(e.line)}>{e.line ? <b>Line {e.line}</b> : <b>Error</b>} {e.message}</button></li>
          ))}
        </ul>
      )}
      {lib.length > 0 && (
        <Section title="Manage my shaders" defaultOpen={false}>
          <ul className="layer-list">
            {lib.map((s) => (
              <li key={s.id}>
                <span className="lname">{s.name}</span>
                <div className="lactions"><button className="danger" onClick={async () => { if (confirm(`Delete "${s.name}"?`)) { await storage.deleteShader(s.id); refreshLib(); } }}>✕</button></div>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Uniform controls">
        {live && <ShaderParamControls l={live} t={engine.frameTime()} />}
      </Section>
      <Section title="Reference" defaultOpen={false}>
        <div className="ref">
          <p>Write a complete GLSL ES 3.00 fragment shader. The first line must be <code>#version 300 es</code>; output with <code>out vec4 fragColor;</code>. Only GLSL is accepted — no JavaScript is ever executed.</p>
          <p>Provided uniforms: <code>vec2 u_resolution</code>, <code>float u_time</code>, <code>float u_deltaTime</code>, <code>vec2 u_mouse</code> (0–1, touch position), <code>float u_progress</code> (0–1 across the layer), <code>sampler2D u_input</code> (layers below — makes this a filter). Varying: <code>in vec2 v_uv</code>.</p>
          <p>Any other <code>uniform float/vec3/int u_name;</code> gets a control and can be keyframed. Annotate: <code>// @ui min max default | Label</code>, <code>// @color #rrggbb | Label</code>, <code>// @select 0 A,B,C | Label</code>.</p>
          <p>Shortcut: ⌘/Ctrl + Enter compiles. On iPhone use the Compile button or keep Live on.</p>
        </div>
      </Section>
    </div>
  );
}

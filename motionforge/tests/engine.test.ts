import { describe, expect, it } from 'vitest';
import { ease, cubicBezier, EASINGS } from '../src/engine/easing';
import { evalTrack, resolveLayer, upsertKeyframe, removeKeyframe, setPath, getPath } from '../src/engine/keyframes';
import { mixHex } from '../src/engine/color';
import { parseShaderParams } from '../src/engine/shaderParams';
import { parseShaderLog, precheckFragment } from '../src/engine/gl';
import { makeText, makeShader, normalizeProject } from '../src/engine/project';
import { unitProgress, globalProgress, TEXT_PRESETS } from '../src/engine/text';
import { SHADERS, shaderById } from '../src/engine/shaders/library';
import { TEMPLATES, sampleProject } from '../src/engine/templates';
import type { Keyframe, ShaderLayer } from '../src/engine/types';

const k = (t: number, v: number | string, e: Keyframe['ease'] = 'linear'): Keyframe => ({ id: String(t), t, v, ease: e });

describe('easing', () => {
  it('all easings start at 0 and end at 1', () => {
    for (const [id, f] of Object.entries(EASINGS)) {
      expect(f(0), id).toBeCloseTo(0, 5);
      expect(f(1), id).toBeCloseTo(1, 5);
    }
  });
  it('cubic bezier matches known CSS ease values', () => {
    const f = cubicBezier(0.25, 0.1, 0.25, 1); // CSS "ease"
    expect(f(0.5)).toBeCloseTo(0.8024, 3);
    expect(cubicBezier(0, 0, 1, 1)(0.37)).toBeCloseTo(0.37, 4);
    expect(ease('bezier', 0.5, [0.42, 0, 0.58, 1])).toBeCloseTo(0.5, 4);
  });
  it('clamps input', () => {
    expect(ease('easeOutCubic', -1)).toBe(0);
    expect(ease('easeOutCubic', 2)).toBe(1);
  });
});

describe('keyframes', () => {
  it('interpolates numbers with per-segment easing', () => {
    const kfs = [k(0, 0), k(1, 10, 'easeIn'), k(2, 0)];
    expect(evalTrack(kfs, -1)).toBe(0);
    expect(evalTrack(kfs, 0.5)).toBeCloseTo(5);
    expect(evalTrack(kfs, 1.5)).toBeCloseTo(10 - 10 * 0.25); // easeIn(0.5)=0.25
    expect(evalTrack(kfs, 3)).toBe(0);
  });
  it('interpolates colors', () => {
    expect(evalTrack([k(0, '#000000'), k(1, '#ffffff')], 0.5)).toBe(mixHex('#000000', '#ffffff', 0.5));
  });
  it('hold keeps value until next key', () => {
    expect(evalTrack([k(0, 1, 'hold'), k(1, 5)], 0.99)).toBe(1);
  });
  it('resolves nested paths onto a layer without mutating it', () => {
    const l = makeShader(5, 'glowGridRed');
    l.tracks = { 'params.u_spacing': [k(0, 20), k(2, 40)], opacity: [k(0, 0), k(1, 1)] };
    const r = resolveLayer(l, 1);
    expect(r.params.u_spacing).toBeCloseTo(30);
    expect(r.opacity).toBe(1);
    expect(l.params.u_spacing).toBe(90);
    expect(getPath(r, 'params.u_spacing')).toBeCloseTo(30);
    expect(setPath({ a: { b: 1 } }, 'a.b', 2)).toEqual({ a: { b: 2 } });
  });
  it('upsert replaces a key at the same time and keeps order', () => {
    let tr = upsertKeyframe({}, 'x', 1, 0.2);
    tr = upsertKeyframe(tr, 'x', 0, 0.1);
    tr = upsertKeyframe(tr, 'x', 1, 0.9);
    expect(tr.x.map((q) => q.v)).toEqual([0.1, 0.9]);
    tr = removeKeyframe(tr, 'x', tr.x[0].id);
    tr = removeKeyframe(tr, 'x', tr.x[0].id);
    expect(tr.x).toBeUndefined();
  });
});

describe('text timing', () => {
  it('staggers units and applies out animation', () => {
    const l = makeText(4, { text: 'ABC', anim: { preset: 'smooth', delay: 0, duration: 1, stagger: 0.5, order: 'forward', out: { enabled: true, duration: 0.5, stagger: 0 } } as any });
    expect(unitProgress(l, 0, 3, 0.5)).toBeCloseTo(0.5);
    expect(unitProgress(l, 1, 3, 0.5)).toBe(0);
    expect(unitProgress(l, 2, 3, 2.5)).toBe(1);
    expect(unitProgress(l, 0, 3, 3.75)).toBeCloseTo(0.5); // out started at 3.5
    expect(globalProgress(l, 3, 0)).toBe(0);
  });
  it('reverse order animates the last unit first', () => {
    const l = makeText(4, { text: 'AB', anim: { preset: 'smooth', delay: 0, duration: 1, stagger: 1, order: 'reverse' } as any });
    expect(unitProgress(l, 1, 2, 0.5)).toBeCloseTo(0.5);
    expect(unitProgress(l, 0, 2, 0.5)).toBe(0);
  });
  it('every preset reaches a resting state at p=1 and differs at p=0', () => {
    const g = { ch: 'A', x: 0, w: 10, line: 0, space: false, charIdx: 0, wordIdx: 0, xn: 0.5 };
    for (const p of TEXT_PRESETS) {
      if (p.id === 'none') continue;
      const end = p.state(1, 1, { i: 0, n: 1, g, dir: [0, -1], k: 1, t: 100.5 });
      expect(end.op, p.id).toBeGreaterThan(0.99);
      const start = p.state(0, 0, { i: 0, n: 1, g, dir: [0, -1], k: 1, t: 0 });
      const same = JSON.stringify(start) === JSON.stringify(end);
      expect(same && !p.spacing, `${p.id} should animate`).toBe(false);
    }
  });
});

describe('shaders', () => {
  it('parses annotated uniforms', () => {
    const ps = parseShaderParams(`uniform float u_a; // @ui 1 9 3 | Alpha\nuniform vec3 u_c; // @color #ff0000\nuniform int u_m; // @select 1 A,B | Mode\nuniform float u_time;`);
    expect(ps).toEqual([
      { key: 'u_a', kind: 'float', label: 'Alpha', min: 1, max: 9, def: 3, step: 0.04 },
      { key: 'u_c', kind: 'color', label: 'C', def: '#ff0000' },
      { key: 'u_m', kind: 'select', label: 'Mode', def: 1, options: ['A', 'B'] },
    ]);
  });
  it('parses driver error logs with line numbers', () => {
    expect(parseShaderLog("ERROR: 0:12: 'foo' : undeclared identifier\nERROR: 0:14: '' : syntax error")).toEqual([
      { line: 12, message: "'foo' : undeclared identifier" },
      { line: 14, message: "'' : syntax error" },
    ]);
  });
  it('prechecks GLSL ES 3.00 rules', () => {
    expect(precheckFragment('void main(){ gl_FragColor = vec4(1); }').length).toBeGreaterThan(1);
    for (const s of SHADERS) expect(precheckFragment(s.source), s.id).toEqual([]);
  });
});

describe('projects', () => {
  it('templates build valid projects', () => {
    expect(TEMPLATES.length).toBe(45);
    for (const t of TEMPLATES) {
      const b = t.build();
      expect(b.layers.length, t.id).toBeGreaterThan(0);
      const norm = normalizeProject({ name: t.name, layers: b.layers, duration: b.duration, aspect: '1:1' });
      expect(norm.layers.length).toBe(b.layers.length);
    }
  });
  it('round-trips through JSON', () => {
    const p = sampleProject();
    const back = normalizeProject(JSON.parse(JSON.stringify(p)));
    expect(back).toEqual(p);
  });
  it('rejects non-project JSON', () => {
    expect(() => normalizeProject({ foo: 1 })).toThrow();
  });
});

describe('built-in shader upgrades', () => {
  it('replaces an unedited older built-in shader source with the current one', async () => {
    const { LEGACY_SHADERS, fingerprint } = await import('../src/engine/shaders/legacy');
    const { execSync } = await import('node:child_process');
    // the bloom source as first shipped (before the mip-chain rewrite)
    const old = execSync('git show a0c7965:./src/engine/shaders/library.ts', { encoding: 'utf8' });
    const m = old.match(/const BLOOM = `\$\{FILTER_H\}([\s\S]*?)`;/)!;
    const H = old.match(/const H = `([\s\S]*?)`;/)![1];
    const oldBloom = `${H}uniform sampler2D u_input; // everything composited below this layer\n${m[1]}`;
    expect(LEGACY_SHADERS[fingerprint(oldBloom)]).toBe('bloom');
    const p = normalizeProject({ ...sampleProject(), layers: [{ ...makeShader(5, 'bloom'), source: oldBloom, params: { u_radius: 30 } }] });
    const l = p.layers[0] as ShaderLayer;
    expect(l.source).toBe(shaderById('bloom')!.source);
    expect(l.params.u_radius).toBe(30); // the user's settings survive the upgrade
  });

  it('keeps user-edited shader sources untouched', () => {
    const src = shaderById('bloom')!.source.replace('Glow / bloom', 'my bloom');
    const p = normalizeProject({ ...sampleProject(), layers: [{ ...makeShader(5, 'bloom'), source: src }] });
    expect((p.layers[0] as ShaderLayer).source).toBe(src);
  });

  it('legacy table covers every shader source in the last commit', async () => {
    const { LEGACY_SHADERS, fingerprint } = await import('../src/engine/shaders/legacy');
    const { execSync } = await import('node:child_process');
    const fs = await import('node:fs');
    // load HEAD's library.ts and check each of its sources is current or listed
    // (after editing a built-in shader, run: node scripts/legacy-shaders.mjs)
    const dir = 'tests/.tmp-head/shaders';
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync('tests/.tmp-head/types.ts', 'export type BlendMode = string;\n');
    for (const f of execSync('git ls-tree --name-only HEAD ./src/engine/shaders/', { encoding: 'utf8' }).trim().split('\n')) {
      const name = f.split('/').pop()!;
      fs.writeFileSync(`${dir}/${name}`, execSync(`git show HEAD:./src/engine/shaders/${name}`, { encoding: 'utf8' }));
    }
    try {
      const head = await import('./.tmp-head/shaders/library');
      const cur = new Set(SHADERS.map((s) => fingerprint(s.source)));
      const stale = head.SHADERS.filter((s: { source: string }) => !cur.has(fingerprint(s.source)) && !(fingerprint(s.source) in LEGACY_SHADERS)).map((s: { id: string }) => s.id);
      expect(stale).toEqual([]);
    } finally {
      fs.rmSync('tests/.tmp-head', { recursive: true, force: true });
    }
  });
});

describe('cinematic templates', () => {
  it('are 12 independent films with their own 3D world, editable text, sound and an ending', async () => {
    const { CINEMATIC_TEMPLATES } = await import('../src/engine/templates-cinematic');
    const { sfxById } = await import('../src/engine/sfx');
    const { FONTS } = await import('../src/engine/fonts');
    const { TEXT_PRESETS } = await import('../src/engine/text');
    expect(CINEMATIC_TEMPLATES.length).toBe(12);
    const worlds = new Set<string>();
    for (const tpl of CINEMATIC_TEMPLATES) {
      for (const d of tpl.durations!) {
        const b = tpl.build({ duration: d });
        expect(b.duration).toBe(d);
        // exactly one 3D world: a ray-marched shader or a Three.js scene
        const w = b.layers.filter((l) => l.type === 'scene3d' || (l.type === 'shader' && shaderById(SHADERS.find((s) => s.source === (l as ShaderLayer).source)?.id ?? '')?.category === 'Cinematic 3D'));
        expect(w.length).toBe(1);
        expect(w[0].start).toBe(0);
        expect(w[0].end).toBe(d);
        if (d === tpl.defaultDuration) worlds.add(w[0].type === 'scene3d' ? `scene:${w[0].scene}` : (w[0] as ShaderLayer).source);
        for (const l of b.layers) {
          expect(l.start).toBeGreaterThanOrEqual(0);
          expect(l.end).toBeLessThanOrEqual(d + 1e-6);
          if (l.type === 'text') {
            expect(FONTS.some((f) => f.family === l.fontFamily), `${tpl.id}: font ${l.fontFamily}`).toBe(true);
            expect(TEXT_PRESETS.some((p) => p.id === l.anim.preset), `${tpl.id}: anim ${l.anim.preset}`).toBe(true);
          }
        }
        // something is still on screen in the final second (a designed ending)
        expect(b.layers.some((l) => l.type === 'text' && l.end >= d - 1e-6) || tpl.id === 'cine-chrome-logo').toBe(true);
        for (const c of b.audio ?? []) {
          const id = c.assetId.replace(/^sfx:/, '');
          expect(sfxById(id), `${tpl.id}: sound ${id}`).toBeTruthy();
          expect(c.start).toBeLessThan(d);
        }
      }
    }
    expect(worlds.size).toBe(12); // twelve different scenes, not one scene renamed
  });
});

describe('template sounds', () => {
  it('templates play the owner\'s recordings, not generated sounds', async () => {
    const { USER_SFX, sfxById } = await import('../src/engine/sfx');
    for (const [, [id]] of Object.entries(USER_SFX)) expect(sfxById(id)?.file, id).toBeTruthy();
    for (const t of TEMPLATES) {
      for (const a of t.build().audio ?? []) {
        const id = a.assetId.replace(/^sfx:/, '');
        expect(sfxById(id)?.file, `${t.id}: ${id}`).toBeTruthy();
      }
    }
  });
});

describe('voice-over drives the video', () => {
  // synthetic narration: noise bursts (speech) separated by silences
  const fakeVoice = (dur: number, phrases: number) => {
    const sr = 8000, len = Math.round(dur * sr), data = new Float32Array(len);
    const slot = (dur - 1) / phrases;
    for (let p = 0; p < phrases; p++) {
      const a = 0.5 + p * slot, b = a + slot * 0.8;
      for (let i = Math.round(a * sr); i < Math.round(b * sr); i++) data[i] = Math.sin(i * 0.3) * 0.4 * (0.6 + 0.4 * Math.sin(i * 0.0021));
    }
    return { sampleRate: sr, length: len, numberOfChannels: 1, getChannelData: () => data };
  };
  for (const [dur, n] of [[16, 4], [45, 11], [90, 20]] as const) {
    it(`${dur} s narration -> ${dur} s video, every section its own shot`, async () => {
      const { buildVoiceProject } = await import('../src/engine/voiceVideo');
      const script = Array.from({ length: n }, (_, i) => i === 0 ? 'Та оффист ажилладаг уу?' : i === n - 1 ? 'Дэлгэрэнгүйг «1» гэж коммент бичээрэй.' : i % 3 === 0 ? `Үнэ ${i}0,000₮` : i % 3 === 1 ? 'Гэрээ, тушаал, маягт, анкет бүгд бэлэн' : `Хэсэг ${i}: шинэ загвар хайж олох`).join('\n');
      const r = buildVoiceProject({ voice: { assetId: 'asset:v', name: 'v', duration: dur, buffer: fakeVoice(dur, n) }, script, brand: 'HR PACK', accent: '#2f5bff', images: [], outro: 0.6, aspect: '9:16', subtitles: true, music: false });
      expect(r.speech.length).toBe(n);
      expect(r.project.duration).toBeCloseTo(dur + 0.6, 1);
      expect(r.issues.filter((x) => x.level === 'error')).toEqual([]);
      const shots = r.project.layers.filter((l) => l.type === 'scene3d') as any[];
      expect(shots.length).toBeGreaterThanOrEqual(n); // long phrases may be split into two shots
      expect(Math.max(...shots.map((l: any) => l.end - l.start))).toBeLessThan(8.5);
      expect(shots[0].start).toBe(0);
      expect(shots[shots.length - 1].end).toBeCloseTo(r.project.duration, 2);
      for (let i = 1; i < shots.length; i++) {
        expect(shots[i].start).toBeLessThanOrEqual(shots[i - 1].end); // no holes
        expect(shots[i].params.shot).not.toBe(shots[i - 1].params.shot); // no back-to-back repeats
        if (i > 1) expect(shots[i].params.shot).not.toBe(shots[i - 2].params.shot);
      }
      // the part after the old 16 s cutoff is developed with new sections
      if (dur > 16) expect(shots.filter((s) => s.start > 16).length).toBeGreaterThanOrEqual(3);
      expect(shots[shots.length - 1].params.shot).toBe('cta');
      expect(r.project.audio[0].duration).toBe(dur); // the voice is never trimmed
    });
  }
  it('the chosen look is applied to every shot; timing is identical across looks', async () => {
    const { buildVoiceProject } = await import('../src/engine/voiceVideo');
    const base = { voice: { assetId: 'asset:v', name: 'v', duration: 45, buffer: fakeVoice(45, 10) }, script: Array.from({ length: 10 }, (_, i) => `Хэсэг ${i + 1}`).join('\n'), brand: 'HR PACK', accent: '#2f5bff', images: [], outro: 0.6, aspect: '9:16' as const, subtitles: true, music: false };
    const runs = (['app', 'glass', 'cinema'] as const).map((style) => buildVoiceProject({ ...base, style }));
    runs.forEach((r, k) => { const shots = r.project.layers.filter((l) => l.type === 'scene3d') as any[]; expect(shots.every((l) => l.params.style === ['app', 'glass', 'cinema'][k])).toBe(true); });
    const timing = (r: any) => r.plan.map((s: any) => `${s.shot}@${s.start.toFixed(2)}`).join(' ');
    expect(timing(runs[1])).toBe(timing(runs[0]));
    expect(timing(runs[2])).toBe(timing(runs[0]));
  });
});

describe('art-directed film storyboard', () => {
  it('the demo storyboard is valid and covers the film', async () => {
    const { validateStoryboard } = await import('../src/engine/film/plan');
    const { DEMO_STORYBOARD } = await import('../src/engine/film/demo');
    expect(validateStoryboard(DEMO_STORYBOARD, 36).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('catches gaps, invented copy, a misspelt brand and a film shorter than the voice', async () => {
    const { validateStoryboard } = await import('../src/engine/film/plan');
    const { DEMO_STORYBOARD } = await import('../src/engine/film/demo');
    const sb = JSON.parse(JSON.stringify(DEMO_STORYBOARD));
    sb.scenes[1].start += 0.5; // gap
    sb.scenes[2].copy.lead = 'the best kit in the world'; // not in the narration or facts
    sb.scenes[12].copy.brand = 'Nova DOCS KIT'; // brand case changed
    const msgs = validateStoryboard(sb, 40).filter((i) => i.level === 'error').map((i) => i.msg).join('\n');
    expect(msgs).toMatch(/gap of 0.50s/);
    expect(msgs).toMatch(/"the best kit in the world" is neither narration nor a product fact/);
    expect(msgs).toMatch(/brand word "Nova" must be written "NOVA"/);
    expect(msgs).toMatch(/shorter than the voice/);
  });
  it('sound design follows the choreography and the project keeps the full voice', async () => {
    const { filmSfx } = await import('../src/engine/film/plan');
    const { buildFilmProject } = await import('../src/engine/film/project');
    const { DEMO_STORYBOARD } = await import('../src/engine/film/demo');
    const cues = filmSfx(DEMO_STORYBOARD);
    expect(cues.length).toBeGreaterThan(20);
    expect(cues.every((q) => q.t >= 0 && q.t < 36)).toBe(true);
    // every roll beat gets a tick exactly on the beat
    for (const b of DEMO_STORYBOARD.scenes[4].beats!) expect(cues.some((q) => q.t === b)).toBe(true);
    const { project, missing } = buildFilmProject(DEMO_STORYBOARD, { voiceAssetId: 'asset:v', voiceDuration: 36, images: [] });
    expect(missing).toEqual([]);
    expect(project.duration).toBe(36);
    expect(project.audio[0].duration).toBe(36);
    expect(project.layers).toHaveLength(1);
  });
});

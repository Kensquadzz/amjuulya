import { describe, expect, it } from 'vitest';
import { ease, cubicBezier, EASINGS } from '../src/engine/easing';
import { evalTrack, resolveLayer, upsertKeyframe, removeKeyframe, setPath, getPath } from '../src/engine/keyframes';
import { mixHex } from '../src/engine/color';
import { parseShaderParams } from '../src/engine/shaderParams';
import { parseShaderLog, precheckFragment } from '../src/engine/gl';
import { makeText, makeShader, normalizeProject } from '../src/engine/project';
import { unitProgress, globalProgress, TEXT_PRESETS } from '../src/engine/text';
import { SHADERS } from '../src/engine/shaders/library';
import { TEMPLATES, sampleProject } from '../src/engine/templates';
import type { Keyframe } from '../src/engine/types';

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
    expect(TEMPLATES.length).toBe(27);
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

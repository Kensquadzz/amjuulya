// Parses `uniform` declarations from GLSL source to build UI controls.
//
// Annotation syntax (trailing comment on the uniform line):
//   uniform float u_spacing;  // @ui 10 200 60 | Grid spacing
//   uniform vec3  u_colorA;   // @color #ff2a55 | Primary
//   uniform int   u_mode;     // @select 0 Wave,Radial,Ripple | Mode
// Unannotated floats get a 0..1 slider, vec3 gets a color picker.

export const BUILTIN_UNIFORMS = new Set(['u_resolution', 'u_time', 'u_deltaTime', 'u_mouse', 'u_progress', 'u_input']);

export type ShaderParam =
  | { key: string; kind: 'float'; label: string; min: number; max: number; def: number; step: number }
  | { key: string; kind: 'color'; label: string; def: string }
  | { key: string; kind: 'select'; label: string; options: string[]; def: number };

const STANDARD_DEFAULTS: Record<string, ShaderParam> = {
  u_intensity: { key: 'u_intensity', kind: 'float', label: 'Intensity', min: 0, max: 2, def: 1, step: 0.01 },
  u_speed: { key: 'u_speed', kind: 'float', label: 'Speed', min: 0, max: 4, def: 1, step: 0.01 },
  u_colorA: { key: 'u_colorA', kind: 'color', label: 'Color A', def: '#ff2a55' },
  u_colorB: { key: 'u_colorB', kind: 'color', label: 'Color B', def: '#22e1ff' },
};

const pretty = (k: string) =>
  k.replace(/^u_/, '').replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function parseShaderParams(src: string): ShaderParam[] {
  const out: ShaderParam[] = [];
  const re = /^\s*uniform\s+(?:(?:lowp|mediump|highp)\s+)?(float|vec3|int)\s+(u_\w+)\s*;[ \t]*(?:\/\/(.*))?$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const [, type, key, comment = ''] = m;
    if (BUILTIN_UNIFORMS.has(key) || out.some((p) => p.key === key)) continue;
    const [spec, labelPart] = comment.split('|');
    const label = (labelPart ?? '').trim() || STANDARD_DEFAULTS[key]?.label || pretty(key);
    const s = spec.trim();
    if (type === 'float') {
      const a = /@ui\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(s);
      if (a) {
        const min = +a[1], max = +a[2];
        out.push({ key, kind: 'float', label, min, max, def: +a[3], step: (max - min) / 200 });
      } else {
        const std = STANDARD_DEFAULTS[key];
        out.push(std && std.kind === 'float' ? { ...std, label } : { key, kind: 'float', label, min: 0, max: 1, def: 0.5, step: 0.005 });
      }
    } else if (type === 'vec3') {
      const a = /@color\s+(#[0-9a-fA-F]{6})/.exec(s);
      const std = STANDARD_DEFAULTS[key];
      out.push({ key, kind: 'color', label, def: a ? a[1] : std && std.kind === 'color' ? std.def : '#ffffff' });
    } else if (type === 'int') {
      const a = /@select\s+(\d+)\s+([^|]+)/.exec(s);
      if (a) out.push({ key, kind: 'select', label, def: +a[1], options: a[2].split(',').map((x) => x.trim()) });
      else out.push({ key, kind: 'select', label, def: 0, options: ['0', '1', '2', '3'] });
    }
  }
  return out;
}

export function defaultParams(src: string): Record<string, number | string> {
  const o: Record<string, number | string> = {};
  for (const p of parseShaderParams(src)) o[p.key] = p.def;
  return o;
}

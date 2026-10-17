import type { Layer } from '../engine/types';
import { parseShaderParams } from '../engine/shaderParams';

export interface PropDef { path: string; label: string; kind: 'num' | 'color'; min?: number; max?: number; step?: number }

const COMMON: PropDef[] = [
  { path: 'x', label: 'Position X', kind: 'num', min: -0.5, max: 1.5, step: 0.001 },
  { path: 'y', label: 'Position Y', kind: 'num', min: -0.5, max: 1.5, step: 0.001 },
  { path: 'scale', label: 'Scale', kind: 'num', min: 0, max: 4, step: 0.01 },
  { path: 'rotation', label: 'Rotation', kind: 'num', min: -360, max: 360, step: 0.5 },
  { path: 'opacity', label: 'Opacity', kind: 'num', min: 0, max: 1, step: 0.01 },
];

export function animatableProps(l: Layer): PropDef[] {
  switch (l.type) {
    case 'text':
      return [...COMMON,
        { path: 'fontSize', label: 'Font size', kind: 'num', min: 8, max: 600, step: 1 },
        { path: 'letterSpacing', label: 'Letter spacing', kind: 'num', min: -0.2, max: 1.5, step: 0.005 },
        { path: 'lineHeight', label: 'Line height', kind: 'num', min: 0.5, max: 3, step: 0.01 },
        { path: 'blur', label: 'Blur', kind: 'num', min: 0, max: 60, step: 0.5 },
        { path: 'glow', label: 'Glow', kind: 'num', min: 0, max: 120, step: 1 },
        { path: 'color', label: 'Color', kind: 'color' },
        { path: 'glowColor', label: 'Glow color', kind: 'color' },
        { path: 'anim.intensity', label: 'Anim intensity', kind: 'num', min: 0, max: 2, step: 0.01 },
        { path: 'cursor.color', label: 'Cursor color', kind: 'color' },
      ];
    case 'shape':
      return [...COMMON,
        { path: 'w', label: 'Width', kind: 'num', min: 0, max: 4000, step: 1 },
        { path: 'h', label: 'Height', kind: 'num', min: 0, max: 4000, step: 1 },
        { path: 'draw', label: 'Stroke draw', kind: 'num', min: 0, max: 1, step: 0.005 },
        { path: 'strokeWidth', label: 'Stroke width', kind: 'num', min: 0, max: 80, step: 0.5 },
        { path: 'radius', label: 'Corner radius', kind: 'num', min: 0, max: 1000, step: 1 },
        { path: 'glow', label: 'Glow', kind: 'num', min: 0, max: 120, step: 1 },
        { path: 'fill', label: 'Fill', kind: 'color' },
        { path: 'stroke', label: 'Stroke', kind: 'color' },
      ];
    case 'image':
      return [...COMMON,
        { path: 'w', label: 'Width', kind: 'num', min: 10, max: 4000, step: 1 },
        { path: 'blur', label: 'Blur', kind: 'num', min: 0, max: 60, step: 0.5 },
        { path: 'shadow', label: 'Shadow blur', kind: 'num', min: 0, max: 200, step: 1 },
        { path: 'shadowOpacity', label: 'Shadow alpha', kind: 'num', min: 0, max: 1, step: 0.01 },
      ];
    case 'background':
      return [
        { path: 'opacity', label: 'Opacity', kind: 'num', min: 0, max: 1, step: 0.01 },
        { path: 'colorA', label: 'Color A', kind: 'color' },
        { path: 'colorB', label: 'Color B', kind: 'color' },
        { path: 'angle', label: 'Angle', kind: 'num', min: -360, max: 360, step: 1 },
        { path: 'x', label: 'Center X', kind: 'num', min: 0, max: 1, step: 0.001 },
        { path: 'y', label: 'Center Y', kind: 'num', min: 0, max: 1, step: 0.001 },
        { path: 'scale', label: 'Radius', kind: 'num', min: 0.05, max: 4, step: 0.01 },
      ];
    case 'particles':
      return [
        { path: 'opacity', label: 'Opacity', kind: 'num', min: 0, max: 1, step: 0.01 },
        { path: 'count', label: 'Count', kind: 'num', min: 0, max: 600, step: 1 },
        { path: 'size', label: 'Size', kind: 'num', min: 0.5, max: 40, step: 0.1 },
        { path: 'speed', label: 'Speed', kind: 'num', min: 0, max: 600, step: 1 },
        { path: 'direction', label: 'Direction', kind: 'num', min: -360, max: 360, step: 1 },
        { path: 'spread', label: 'Spread', kind: 'num', min: 0, max: 360, step: 1 },
        { path: 'noise', label: 'Noise', kind: 'num', min: 0, max: 300, step: 1 },
        { path: 'glow', label: 'Glow', kind: 'num', min: 0, max: 3, step: 0.01 },
        { path: 'connect', label: 'Connection distance', kind: 'num', min: 0, max: 400, step: 1 },
        { path: 'twinkle', label: 'Twinkle', kind: 'num', min: 0, max: 1, step: 0.01 },
        { path: 'colorA', label: 'Color A', kind: 'color' },
        { path: 'colorB', label: 'Color B', kind: 'color' },
      ];
    case 'shader':
      return [
        { path: 'opacity', label: 'Opacity', kind: 'num', min: 0, max: 1, step: 0.01 },
        ...parseShaderParams(l.source).filter((p) => p.kind !== 'image' && p.kind !== 'glyph').map((p): PropDef =>
          p.kind === 'color' ? { path: `params.${p.key}`, label: p.label, kind: 'color' }
            : p.kind === 'float' ? { path: `params.${p.key}`, label: p.label, kind: 'num', min: p.min, max: p.max, step: p.step }
              : { path: `params.${p.key}`, label: p.label, kind: 'num', min: 0, max: (p as { options: string[] }).options.length - 1, step: 1 }),
      ];
  }
}

export function propLabel(l: Layer, path: string) {
  return animatableProps(l).find((p) => p.path === path)?.label ?? path;
}

export const LAYER_ICON: Record<Layer['type'], string> = { text: 'T', shape: '◻', image: '▣', shader: '✦', background: '▤', particles: '∴' };

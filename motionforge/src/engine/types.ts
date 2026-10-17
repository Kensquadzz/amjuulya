// Core data model for MOTIONFORGE projects. Everything here is plain JSON so
// projects can be stored in IndexedDB and exported/imported as files.

export type AspectId = '9:16' | '16:9' | '1:1' | '4:5';

export const ASPECTS: Record<AspectId, { w: number; h: number; label: string }> = {
  '9:16': { w: 1080, h: 1920, label: '9:16 · 1080×1920' },
  '16:9': { w: 1920, h: 1080, label: '16:9 · 1920×1080' },
  '1:1': { w: 1080, h: 1080, label: '1:1 · 1080×1080' },
  '4:5': { w: 1080, h: 1350, label: '4:5 · 1080×1350' },
};

export type EasingId =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeOutExpo'
  | 'easeInOutExpo'
  | 'easeOutBack'
  | 'spring'
  | 'elastic'
  | 'bezier'
  | 'hold';

export type Bezier = [number, number, number, number];

export type KfValue = number | string; // string values are #rrggbb colors

export interface Keyframe {
  id: string;
  t: number; // seconds, composition time
  v: KfValue;
  ease: EasingId; // easing of the segment leaving this keyframe
  bezier?: Bezier;
}

/** property path (e.g. "opacity", "params.u_spacing") -> keyframes sorted by t */
export type Tracks = Record<string, Keyframe[]>;

export type BlendMode = 'normal' | 'add' | 'screen' | 'multiply';

export type LayerType = 'text' | 'shape' | 'image' | 'shader' | 'background' | 'particles';

export interface LayerBase {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  start: number;
  end: number;
  opacity: number; // 0..1
  x: number; // normalized 0..1 of composition width
  y: number; // normalized 0..1 of composition height
  scale: number;
  rotation: number; // degrees
  blend: BlendMode;
  tracks: Tracks;
}

export type TextPresetId =
  | 'smooth'
  | 'typewriter'
  | 'spacing'
  | 'split'
  | 'stagger'
  | 'fadeRise'
  | 'slideBlur'
  | 'elastic'
  | 'kinetic'
  | 'cursorGlow'
  | 'lightbar'
  | 'glitch'
  | 'mask'
  | 'wordByWord'
  | 'rotate'
  | 'cinematic'
  | 'typePop'
  | 'blurReveal'
  | 'none';

export type TextUnit = 'char' | 'word' | 'line' | 'all';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Order = 'forward' | 'reverse' | 'center' | 'random';

export interface TextAnim {
  preset: TextPresetId;
  unit: TextUnit;
  delay: number; // seconds after layer start
  duration: number; // seconds per unit
  stagger: number; // seconds between units
  ease: EasingId;
  bezier?: Bezier;
  direction: Direction;
  intensity: number; // 0..2
  order: Order;
  out: { enabled: boolean; duration: number; stagger: number };
}

export type CursorMode = 'cursor' | 'lightbar' | 'sweep';

export interface CursorOpts {
  enabled: boolean;
  mode: CursorMode;
  color: string;
  width: number; // px (reference)
  height: number; // multiplier of font size
  glow: number; // px
  blink: number; // Hz, 0 = steady
  /** light bar / sweep travel duration (seconds); cursor follows the reveal */
  travel: number;
  delay: number;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  fontFamily: string;
  fontWeight: number;
  italic: boolean;
  uppercase: boolean;
  fontSize: number; // reference px (short side = 1080)
  letterSpacing: number; // em
  lineHeight: number; // multiplier
  align: 'left' | 'center' | 'right';
  /** which edge of the text block Position X refers to (default centre) */
  anchor?: 'left' | 'center' | 'right';
  color: string;
  blur: number; // px
  glow: number; // px
  glowColor: string;
  anim: TextAnim;
  cursor: CursorOpts;
}

export type ShapeKind = 'rect' | 'circle' | 'ring' | 'line' | 'triangle' | 'cross' | 'swoosh' | 'barcode' | 'glassTile' | 'search';

export type IconId = 'none' | 'music' | 'image' | 'eye' | 'diamond' | 'flower' | 'sparkle' | 'search' | 'heart' | 'dots' | 'arrow' | 'wave' | 'chat' | 'play';

export interface ShapeLayer extends LayerBase {
  type: 'shape';
  shape: ShapeKind;
  w: number;
  h: number;
  fill: string;
  fillOn: boolean;
  stroke: string;
  strokeWidth: number;
  radius: number;
  glow: number;
  draw: number; // 0..1 stroke draw-on progress
  /** track matte: this shape is not drawn, it masks the layer directly above it */
  mask?: 'none' | 'alpha' | 'inverted';
  /** soft edge for masks (reference px) */
  feather?: number;
  /** pattern seed (barcode) */
  seed?: number;
  /** glass tile: second gradient colour for rim/icon, icon glyph */
  stroke2?: string;
  icon?: IconId;
}

export interface ImageLayer extends LayerBase {
  type: 'image';
  src: string; // data URL ('' = empty slot, shown as a placeholder in the editor only)
  w: number; // reference px width
  blur: number;
  /** drop shadow: blur radius (reference px), opacity 0..1, vertical offset */
  shadow?: number;
  shadowOpacity?: number;
  shadowY?: number;
  /** placeholder aspect (h / w) for an empty slot */
  slotRatio?: number;
  /** the photo before background removal (kept so it can be restored) */
  srcOriginal?: string;
}

export interface BackgroundLayer extends LayerBase {
  type: 'background';
  mode: 'solid' | 'linear' | 'radial';
  colorA: string;
  colorB: string;
  angle: number;
  /** radial only: fraction of the radius that stays colorA before the blend starts */
  inner?: number;
}

export interface ParticleLayer extends LayerBase {
  type: 'particles';
  count: number;
  size: number;
  speed: number; // px per second (reference)
  direction: number; // degrees, 0 = right, 90 = up
  spread: number; // degrees
  noise: number; // wobble amount px
  glow: number; // 0..3
  colorA: string;
  colorB: string;
  connect: number; // max distance px for lines, 0 = off
  connectOpacity: number;
  twinkle: number;
  seed: number;
  interactive: boolean;
}

export type ParamValue = number | string;

export interface ShaderLayer extends LayerBase {
  type: 'shader';
  shaderName: string;
  /** source currently rendering (always the last successfully compiled source) */
  source: string;
  /** unsaved/uncompiled editor buffer, kept so edits are never lost */
  draft?: string;
  params: Record<string, ParamValue>;
}

export type Layer = TextLayer | ShapeLayer | ImageLayer | BackgroundLayer | ParticleLayer | ShaderLayer;

export interface AudioClip {
  id: string;
  name: string;
  /** 'sfx:<preset>[:seed]' (generated) or 'asset:<id>' (file stored in IndexedDB) */
  assetId: string;
  start: number; // timeline time (s)
  offset: number; // seconds trimmed from the start of the source
  duration: number; // clip length on the timeline (s)
  volume: number; // 0..2
  fadeIn: number;
  fadeOut: number;
  muted?: boolean;
  /** background music bed or a sound effect (derived when missing) */
  role?: 'music' | 'sfx';
}

export interface Project {
  id: string;
  name: string;
  version: 1;
  aspect: AspectId;
  duration: number;
  fps: number;
  background: string;
  layers: Layer[]; // bottom -> top
  audio?: AudioClip[];
  templateId?: string;
  createdAt: number;
  updatedAt: number;
}

export type PreviewQuality = 'low' | 'medium' | 'high';

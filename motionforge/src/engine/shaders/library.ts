// Built-in GLSL ES 3.00 effects. Every effect is ordinary editable shader
// source: the UI controls are generated from the annotated uniforms.
// "generator" effects draw their own image; "filter" effects read u_input
// (everything composited below the layer) and transform it.
import type { BlendMode } from '../types';

export type ShaderCategory = 'Grid' | 'Particles' | 'Glitch' | 'Distortion' | 'Glow' | 'Light' | 'Gradient' | 'Texture';

export interface ShaderDef {
  id: string;
  name: string;
  category: ShaderCategory;
  kind: 'generator' | 'filter';
  blend: BlendMode;
  source: string;
  params?: Record<string, number | string>;
  starter?: boolean; // listed as a starter in the code editor
  description: string;
}

const H = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_deltaTime;
uniform vec2 u_mouse;
uniform float u_progress;
in vec2 v_uv;
out vec4 fragColor;
`;

const NOISE = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
  return v;
}
`;

// ---------------------------------------------------------------- generators

const GLOW_GRID = `${H}
// Glow grid — a perspective floor/ceiling grid lit by a moving point light.
uniform float u_spacing;     // @ui 10 300 90 | Grid spacing
uniform float u_thickness;   // @ui 0.3 10 1.4 | Line thickness
uniform float u_glow;        // @ui 0 80 22 | Glow radius
uniform float u_lightX;      // @ui 0 1 0.5 | Light X
uniform float u_lightY;      // @ui 0 1 0.5 | Light Y
uniform float u_falloff;     // @ui 0.1 6 1.6 | Light falloff
uniform float u_perspective; // @ui 0 1 0.75 | Perspective
uniform float u_wave;        // @ui 0 1 0.15 | Wave movement
uniform float u_intensity;   // @ui 0 3 1.2 | Glow intensity
uniform float u_speed;       // @ui 0 4 0.6 | Speed
uniform vec3 u_colorA;       // @color #ff2238 | Primary
uniform vec3 u_colorB;       // @color #5a0010 | Secondary
uniform vec3 u_bg;           // @color #050102 | Background

void main() {
  float S = min(u_resolution.x, u_resolution.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / S;
  float t = u_time * u_speed;
  float hz = 0.12;
  float d = abs(p.y - hz) + 0.002;
  float s = u_perspective;
  float z = 1.0 / d;
  vec2 g;
  g.x = p.x * mix(1.0, z * 0.5, s);
  g.y = mix(p.y, z * 0.25 + t * 0.35, s) + (1.0 - s) * t * 0.05;
  g += u_wave * 0.06 * vec2(sin(g.y * 6.0 + t * 1.7), sin(g.x * 5.0 + t * 1.3));
  float cell = u_spacing / 1080.0;
  vec2 gr = g / cell;
  vec2 f = abs(fract(gr - 0.5) - 0.5) / max(fwidth(gr), vec2(1e-4));
  float line = min(f.x, f.y);
  float px = S / 1080.0;
  float core = 1.0 - smoothstep(0.0, u_thickness * px, line);
  float glow = exp(-line / max(u_glow * px * 0.25, 0.01));
  float fade = mix(1.0, smoothstep(0.0, 0.35, d), s);
  vec2 L = vec2(u_lightX - 0.5, u_lightY - 0.5) * u_resolution / S;
  L += vec2(sin(t * 0.7), cos(t * 0.5)) * 0.04 * u_wave;
  float lit = exp(-length(p - L) * u_falloff * 1.6);
  vec3 col = u_bg;
  col += u_colorB * glow * 0.6 * lit * u_intensity * fade;
  col += u_colorA * (core * 1.1 + glow * 0.45) * lit * u_intensity * fade;
  col += u_colorA * exp(-d * 40.0) * s * 0.6 * u_intensity * exp(-abs(p.x - L.x) * 2.0);
  fragColor = vec4(col, 1.0);
}
`;

const PARTICLE_FIELD = `${H}${NOISE}
// Particle field — three parallax layers of drifting glowing points.
uniform float u_density;   // @ui 2 30 9 | Density
uniform float u_size;      // @ui 0.2 4 1 | Size
uniform float u_speed;     // @ui 0 4 1 | Speed
uniform float u_intensity; // @ui 0 3 1 | Glow
uniform vec3 u_colorA;     // @color #6a5cff | Color A
uniform vec3 u_colorB;     // @color #22e1ff | Color B
uniform vec3 u_bg;         // @color #03030a | Background

void main() {
  float S = min(u_resolution.x, u_resolution.y);
  vec2 p = gl_FragCoord.xy / S;
  vec3 col = u_bg;
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float sc = u_density * (1.0 + fl * 0.8);
    vec2 q = p * sc + vec2(fl * 13.7, u_time * u_speed * (0.25 + fl * 0.15));
    vec2 id = floor(q);
    vec2 fr = fract(q);
    for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 h = hash22(id + o + fl * 31.0);
      vec2 pos = o + 0.5 + 0.4 * sin(u_time * u_speed * (0.5 + h) + h * 6.2831);
      float dd = length(fr - pos);
      float r = (0.02 + 0.05 * h.x) * u_size / (1.0 + fl * 0.4);
      float tw = 0.6 + 0.4 * sin(u_time * 3.0 * h.y + h.x * 20.0);
      float g = (r / max(dd, 0.001)) * 0.18 * tw;
      g = g * g;
      col += mix(u_colorA, u_colorB, h.y) * g * u_intensity * (1.0 - fl * 0.25);
    }
  }
  fragColor = vec4(col, 1.0);
}
`;

const GRADIENT = `${H}${NOISE}
// Gradient motion — domain-warped noise blending three colors.
uniform float u_scale;   // @ui 0.2 5 1.4 | Scale
uniform float u_speed;   // @ui 0 3 0.35 | Speed
uniform float u_warp;    // @ui 0 3 1.2 | Warp
uniform float u_grain;   // @ui 0 0.2 0.03 | Grain
uniform vec3 u_colorA;   // @color #1d1b4b | Color A
uniform vec3 u_colorB;   // @color #ff5a7a | Color B
uniform vec3 u_colorC;   // @color #ffd6a8 | Color C

void main() {
  float S = min(u_resolution.x, u_resolution.y);
  vec2 p = gl_FragCoord.xy / S * u_scale;
  float t = u_time * u_speed;
  vec2 q = vec2(fbm(p + t * 0.3), fbm(p + vec2(5.2, 1.3) - t * 0.2));
  float n = fbm(p + u_warp * q + vec2(t * 0.1, 0.0));
  vec3 col = mix(u_colorA, u_colorB, smoothstep(0.25, 0.75, n));
  col = mix(col, u_colorC, smoothstep(0.55, 0.95, q.x * n * 1.6));
  col += (hash12(gl_FragCoord.xy + fract(u_time) * 100.0) - 0.5) * u_grain;
  fragColor = vec4(col, 1.0);
}
`;

const RADIAL_LIGHT = `${H}${NOISE}
// Radial light burst — rays radiating from a pulsing core.
uniform float u_rays;      // @ui 3 60 18 | Ray count
uniform float u_sharp;     // @ui 1 20 6 | Ray sharpness
uniform float u_falloff;   // @ui 0.2 6 1.8 | Falloff
uniform float u_pulse;     // @ui 0 1 0.35 | Pulse
uniform float u_centerX;   // @ui 0 1 0.5 | Center X
uniform float u_centerY;   // @ui 0 1 0.5 | Center Y
uniform float u_intensity; // @ui 0 3 1.1 | Intensity
uniform float u_speed;     // @ui 0 4 0.5 | Speed
uniform vec3 u_colorA;     // @color #ffd27a | Core
uniform vec3 u_colorB;     // @color #ff3d6e | Rays

void main() {
  float S = min(u_resolution.x, u_resolution.y);
  vec2 c = vec2(u_centerX, u_centerY) * u_resolution;
  vec2 p = (gl_FragCoord.xy - c) / S;
  float r = length(p);
  float a = atan(p.y, p.x);
  float t = u_time * u_speed;
  float n = vnoise(vec2(a * 3.0, t));
  float rays = pow(0.5 + 0.5 * sin(a * u_rays + t * 2.0 + n * 3.0), u_sharp);
  rays += 0.5 * pow(0.5 + 0.5 * sin(a * u_rays * 0.5 - t * 1.3), u_sharp * 2.0);
  float pulse = 1.0 + u_pulse * sin(u_time * 3.0);
  float fall = exp(-r * u_falloff * 2.0 / pulse);
  vec3 col = u_colorB * rays * fall * 0.9 + u_colorA * (0.012 / (r + 0.01)) * pulse;
  col *= u_intensity;
  fragColor = vec4(col, 1.0);
}
`;

const HOLO = `${H}${NOISE}
// Holographic noise — iridescent flowing foil with fine scan texture.
uniform float u_scale;     // @ui 0.3 6 1.6 | Scale
uniform float u_speed;     // @ui 0 3 0.4 | Speed
uniform float u_shift;     // @ui 0 3 1.2 | Hue shift
uniform float u_scan;      // @ui 0 1 0.25 | Scanlines
uniform float u_intensity; // @ui 0 2 1 | Intensity
uniform vec3 u_colorA;     // @color #8ff7ff | Tint A
uniform vec3 u_colorB;     // @color #ff9cf1 | Tint B

void main() {
  float S = min(u_resolution.x, u_resolution.y);
  vec2 p = gl_FragCoord.xy / S * u_scale;
  float t = u_time * u_speed;
  float n = fbm(p + vec2(t * 0.2, -t * 0.15) + fbm(p * 1.7 - t * 0.1));
  vec3 iri = 0.5 + 0.5 * cos(6.2831 * (n * u_shift + vec3(0.0, 0.33, 0.67) + t * 0.05));
  vec3 col = mix(u_colorA, u_colorB, n) * 0.55 + iri * 0.6;
  col *= 0.65 + 0.35 * smoothstep(0.3, 0.8, n);
  col *= 1.0 - u_scan * 0.4 * (0.5 + 0.5 * sin(gl_FragCoord.y * 1.6));
  float sparkle = step(0.997, hash12(floor(gl_FragCoord.xy / 3.0) + floor(u_time * 8.0)));
  col += sparkle * 0.8;
  fragColor = vec4(col * u_intensity, 1.0);
}
`;

const TUNNEL = `${H}${NOISE}
// Light tunnel — rings rushing toward the viewer.
uniform float u_rings;     // @ui 1 20 6 | Ring density
uniform float u_segments;  // @ui 0 48 16 | Segments
uniform float u_speed;     // @ui 0 4 1 | Speed
uniform float u_twist;     // @ui -2 2 0.3 | Twist
uniform float u_intensity; // @ui 0 3 1.2 | Intensity
uniform vec3 u_colorA;     // @color #7a5cff | Color A
uniform vec3 u_colorB;     // @color #22e1ff | Color B

void main() {
  float S = min(u_resolution.x, u_resolution.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / S;
  float r = length(p) + 1e-3;
  float a = atan(p.y, p.x);
  float t = u_time * u_speed;
  float z = 0.3 / r + t;
  float ring = pow(abs(sin(z * u_rings)), 24.0);
  float seg = u_segments > 0.5 ? smoothstep(0.2, 0.0, abs(fract((a / 6.2831 + z * u_twist * 0.1) * u_segments) - 0.5) - 0.3) : 1.0;
  float glow = exp(-abs(sin(z * u_rings)) * 4.0) * 0.35;
  vec3 col = mix(u_colorA, u_colorB, 0.5 + 0.5 * sin(z * 0.7)) * (ring * seg + glow);
  col *= smoothstep(0.0, 0.25, r) * u_intensity;
  col += u_colorB * 0.03 / r * u_intensity;
  fragColor = vec4(col, 1.0);
}
`;

const HUD = `${H}
// Futuristic HUD — rotating arcs, ticks, radar sweep and dot grid.
uniform float u_scale;     // @ui 0.3 2 1 | Scale
uniform float u_speed;     // @ui 0 4 1 | Speed
uniform float u_grid;      // @ui 0 1 0.4 | Dot grid
uniform float u_intensity; // @ui 0 3 1 | Intensity
uniform vec3 u_colorA;     // @color #2ef2ff | Primary
uniform vec3 u_colorB;     // @color #ff3d6e | Accent
uniform vec3 u_bg;         // @color #020a0e | Background

float ringf(float r, float rad, float w, float px) { return 1.0 - smoothstep(w, w + px * 1.5, abs(r - rad)); }

void main() {
  float S = min(u_resolution.x, u_resolution.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / S / u_scale;
  float px = 1.0 / S / u_scale;
  float r = length(p);
  float a = atan(p.y, p.x);
  float t = u_time * u_speed;
  vec3 col = u_bg;
  float c = 0.0;
  c += ringf(r, 0.42, px, px) * 0.8;
  c += ringf(r, 0.30, px * 2.0, px) * step(0.5, fract((a + t * 0.4) / 6.2831 * 3.0));
  c += ringf(r, 0.36, px * 4.0, px) * step(0.75, fract((a - t * 0.25) / 6.2831 * 2.0));
  float ticks = step(0.92, fract(a / 6.2831 * 72.0)) * step(0.44, r) * step(r, 0.47);
  c += ticks;
  float sweep = fract((a - t) / 6.2831);
  c += smoothstep(0.85, 1.0, sweep) * step(r, 0.42) * 0.35;
  vec2 gp = fract(gl_FragCoord.xy / (S * 0.04)) - 0.5;
  float dots = (1.0 - smoothstep(0.03, 0.06, length(gp))) * u_grid * 0.4;
  float cross = (1.0 - smoothstep(px, px * 2.0, abs(p.x))) * step(r, 0.2) + (1.0 - smoothstep(px, px * 2.0, abs(p.y))) * step(r, 0.2);
  col += u_colorA * (c + dots + cross * 0.5) * u_intensity;
  float blip = step(0.95, fract(t * 0.5)) * (1.0 - smoothstep(0.0, 0.015, length(p - vec2(0.18, 0.12))));
  col += u_colorB * blip * 2.0 * u_intensity;
  col += u_colorA * exp(-r * 6.0) * 0.08 * u_intensity;
  fragColor = vec4(col, 1.0);
}
`;

const PULSE = `${H}${NOISE}
// Energy pulse — expanding shockwave rings from the center.
uniform float u_rings;     // @ui 1 8 4 | Rings
uniform float u_sharp;     // @ui 5 120 40 | Sharpness
uniform float u_distort;   // @ui 0 1 0.3 | Noise distortion
uniform float u_speed;     // @ui 0 4 1 | Speed
uniform float u_intensity; // @ui 0 3 1.2 | Intensity
uniform vec3 u_colorA;     // @color #ff3df5 | Color A
uniform vec3 u_colorB;     // @color #3d8bff | Color B

void main() {
  float S = min(u_resolution.x, u_resolution.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / S;
  float r = length(p);
  r += (vnoise(p * 6.0 + u_time) - 0.5) * 0.06 * u_distort;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= u_rings) break;
    float ph = fract(u_time * u_speed * 0.3 + fi / u_rings);
    float rad = ph * 0.9;
    float w = exp(-abs(r - rad) * u_sharp) * (1.0 - ph);
    col += mix(u_colorA, u_colorB, ph) * w;
  }
  col += u_colorA * 0.02 / (r + 0.02);
  fragColor = vec4(col * u_intensity, 1.0);
}
`;

const LIGHT_RAYS = `${H}${NOISE}
// Light rays — volumetric streaks from a light source. Use with Add blend.
uniform float u_sourceX;   // @ui -0.5 1.5 0.2 | Source X
uniform float u_sourceY;   // @ui -0.5 1.5 1.1 | Source Y
uniform float u_density;   // @ui 2 60 18 | Ray density
uniform float u_length;    // @ui 0.2 4 1.4 | Length
uniform float u_speed;     // @ui 0 3 0.4 | Speed
uniform float u_intensity; // @ui 0 3 0.8 | Intensity
uniform vec3 u_colorA;     // @color #fff1d6 | Color

void main() {
  float S = min(u_resolution.x, u_resolution.y);
  vec2 src = vec2(u_sourceX, u_sourceY) * u_resolution / S;
  vec2 p = gl_FragCoord.xy / S;
  vec2 d = p - src;
  float a = atan(d.y, d.x);
  float r = length(d);
  float n = vnoise(vec2(a * u_density, u_time * u_speed)) * vnoise(vec2(a * u_density * 2.3, -u_time * u_speed * 0.7 + 4.0));
  float rays = pow(n, 1.5) * exp(-r / u_length);
  fragColor = vec4(u_colorA * rays * u_intensity * 1.5, 1.0);
}
`;

const LIGHT_SWEEP = `${H}
// Light sweep — a soft diagonal band that crosses the frame (transparent).
uniform float u_period;    // @ui 0.5 10 3 | Period (s)
uniform float u_width;     // @ui 0.02 1 0.18 | Band width
uniform float u_angle;     // @ui -1.5 1.5 0.5 | Angle
uniform float u_intensity; // @ui 0 2 0.7 | Intensity
uniform vec3 u_colorA;     // @color #ffffff | Color

void main() {
  vec2 p = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  float x = p.x * aspect * cos(u_angle) + p.y * sin(u_angle);
  float span = aspect + 1.0 + u_width * 4.0;
  float pos = fract(u_time / u_period) * span - u_width * 2.0 - 0.5;
  float band = exp(-pow((x - pos) / u_width, 2.0));
  fragColor = vec4(u_colorA, band * u_intensity);
}
`;

const ANIMATED_LINES = `${H}${NOISE}
// Animated lines — thin light streaks travelling horizontally.
uniform float u_count;     // @ui 4 80 24 | Line count
uniform float u_speed;     // @ui 0 4 1 | Speed
uniform float u_length;    // @ui 0.05 1 0.3 | Streak length
uniform float u_thickness; // @ui 0.5 6 1.5 | Thickness
uniform float u_intensity; // @ui 0 3 1 | Intensity
uniform vec3 u_colorA;     // @color #22e1ff | Color A
uniform vec3 u_colorB;     // @color #ff2a55 | Color B

void main() {
  vec2 p = gl_FragCoord.xy / u_resolution;
  float row = floor(p.y * u_count);
  float fy = fract(p.y * u_count) - 0.5;
  float h = hash12(vec2(row, 7.0));
  float x = fract(p.x * 0.6 - u_time * u_speed * (0.15 + h * 0.4) - h * 10.0);
  float streak = smoothstep(1.0 - u_length, 1.0, x) * step(x, 1.0);
  float th = u_thickness * u_count / u_resolution.y;
  float line = 1.0 - smoothstep(th * 0.5, th, abs(fy));
  float on = step(0.45, hash12(vec2(row, 3.0)));
  vec3 col = mix(u_colorA, u_colorB, h) * streak * line * on * u_intensity;
  fragColor = vec4(col, max(col.r, max(col.g, col.b)));
}
`;

// ---------------------------------------------------------------- filters

const FILTER_H = `${H}uniform sampler2D u_input; // everything composited below this layer
`;

const GLITCH = `${FILTER_H}
// Digital glitch — RGB split, displaced strips, block artifacts, noise, scanlines.
uniform float u_intensity; // @ui 0 2 1 | Glitch intensity
uniform float u_frequency; // @ui 0 1 0.5 | Glitch frequency
uniform float u_duration;  // @ui 0.02 1 0.22 | Glitch duration (s)
uniform float u_rgbSplit;  // @ui 0 40 12 | RGB separation
uniform float u_displace;  // @ui 0 1 0.5 | Horizontal displacement
uniform float u_blocks;    // @ui 0 1 0.45 | Block artifacts
uniform float u_noise;     // @ui 0 1 0.25 | Digital noise
uniform float u_scanlines; // @ui 0 1 0.3 | Scanlines
uniform float u_base;      // @ui 0 1 0.08 | Constant glitch

float h1(float n) { return fract(sin(n * 91.345) * 43758.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = v_uv;
  float slotLen = mix(2.5, 0.25, u_frequency);
  float slot = floor(u_time / slotLen);
  float inSlot = u_time - slot * slotLen;
  float burst = step(h1(slot + 1.0), 0.8) * (1.0 - smoothstep(u_duration * 0.7, u_duration, inSlot));
  float g = clamp((burst + u_base) * u_intensity, 0.0, 3.0);
  float frame = floor(u_time * 24.0);
  float rows = mix(6.0, 48.0, h1(frame + slot));
  float row = floor(uv.y * rows);
  float strip = step(0.55, h2(vec2(row * 1.7, frame + 3.0)));
  float shift = (h2(vec2(row, frame)) - 0.5) * 0.15 * g * u_displace * strip;
  vec2 bs = vec2(16.0, 9.0) * mix(1.0, 3.0, h1(frame * 1.3));
  vec2 blk = floor(uv * bs);
  float bh = h2(blk + frame);
  float bon = step(1.0 - u_blocks * 0.3 * g, bh);
  vec2 boff = bon * (vec2(h2(blk * 3.1 + frame), h2(blk * 7.3 + frame)) - 0.5) * 0.12;
  vec2 uv2 = uv + vec2(shift, 0.0) + boff;
  float split = u_rgbSplit / u_resolution.x * (0.25 + g);
  vec3 col;
  col.r = texture(u_input, uv2 + vec2(split, 0.0)).r;
  col.g = texture(u_input, uv2).g;
  col.b = texture(u_input, uv2 - vec2(split, split * 0.3)).b;
  col = mix(col, 1.0 - col, bon * step(0.7, h2(blk + 9.0)) * step(0.5, g));
  col += (h2(gl_FragCoord.xy + frame) - 0.5) * u_noise * (0.2 + g * 0.6);
  col *= 1.0 - u_scanlines * 0.35 * (0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159 * 0.5));
  fragColor = vec4(col, 1.0);
}
`;

const DISTORTION = `${FILTER_H}${NOISE}
// Distortion — wave, radial (barrel), ripple, heat haze or noise displacement.
uniform int u_mode;        // @select 0 Wave,Radial,Ripple,Heat haze,Noise | Mode
uniform float u_amount;    // @ui 0 1 0.35 | Amount
uniform float u_frequency; // @ui 0.5 40 8 | Frequency
uniform float u_speed;     // @ui 0 5 1 | Speed
uniform float u_centerX;   // @ui 0 1 0.5 | Center X
uniform float u_centerY;   // @ui 0 1 0.5 | Center Y

void main() {
  vec2 uv = v_uv;
  float t = u_time * u_speed;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 c = vec2(u_centerX, u_centerY);
  vec2 d = (uv - c) * vec2(aspect, 1.0);
  float r = length(d);
  if (u_mode == 0) {
    uv.x += sin(uv.y * u_frequency + t) * u_amount * 0.03;
    uv.y += cos(uv.x * u_frequency * 0.7 + t * 1.3) * u_amount * 0.015;
  } else if (u_mode == 1) {
    float k = u_amount * (0.75 + 0.25 * sin(t));
    uv = c + (uv - c) * (1.0 - k * 0.6 + k * r * r * 2.0);
  } else if (u_mode == 2) {
    vec2 dir = r > 0.0 ? d / r : vec2(0.0);
    uv += dir / vec2(aspect, 1.0) * sin(r * u_frequency * 6.0 - t * 5.0) * u_amount * 0.02 * exp(-r * 1.5);
  } else if (u_mode == 3) {
    float n = vnoise(vec2(uv.x * u_frequency * 2.0, uv.y * u_frequency * 4.0 - t * 3.0));
    uv.x += (n - 0.5) * u_amount * 0.03 * (1.2 - uv.y);
    uv.y += (vnoise(vec2(uv.x * u_frequency, uv.y * u_frequency - t * 2.0)) - 0.5) * u_amount * 0.01;
  } else {
    vec2 n = vec2(fbm(uv * u_frequency * 0.5 + t * 0.3), fbm(uv * u_frequency * 0.5 - t * 0.3 + 7.0));
    uv += (n - 0.5) * u_amount * 0.12;
  }
  fragColor = vec4(texture(u_input, clamp(uv, 0.0, 1.0)).rgb, 1.0);
}
`;

const CHROMATIC = `${FILTER_H}
// Chromatic aberration — radial RGB separation, optionally pulsing.
uniform float u_amount;    // @ui 0 3 0.8 | Amount
uniform float u_pulse;     // @ui 0 1 0.3 | Pulse
uniform float u_speed;     // @ui 0 5 1.5 | Pulse speed

void main() {
  vec2 uv = v_uv;
  vec2 d = uv - 0.5;
  float k = u_amount * 0.012 * (1.0 + u_pulse * sin(u_time * u_speed * 3.0));
  vec3 col;
  col.r = texture(u_input, uv + d * k).r;
  col.g = texture(u_input, uv).g;
  col.b = texture(u_input, uv - d * k).b;
  fragColor = vec4(col, 1.0);
}
`;

const FILM = `${FILTER_H}
// Film finish — vignette, animated grain, subtle scanlines and flicker.
uniform float u_vignette;  // @ui 0 1.5 0.6 | Vignette
uniform float u_grain;     // @ui 0 0.4 0.06 | Grain
uniform float u_scanlines; // @ui 0 1 0.0 | Scanlines
uniform float u_flicker;   // @ui 0 0.3 0.02 | Flicker

float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec3 col = texture(u_input, v_uv).rgb;
  vec2 d = v_uv - 0.5;
  col *= 1.0 - u_vignette * dot(d, d) * 1.6;
  float f = floor(u_time * 24.0);
  col += (h2(gl_FragCoord.xy + f * 17.0) - 0.5) * u_grain;
  col *= 1.0 - u_scanlines * 0.3 * (0.5 + 0.5 * sin(gl_FragCoord.y * 2.0));
  col *= 1.0 - u_flicker * h2(vec2(f, 1.0));
  fragColor = vec4(col, 1.0);
}
`;

const CRT = `${FILTER_H}${NOISE}
// Distorted scanlines — CRT curvature, rolling band, line jitter, RGB shift.
uniform float u_lines;     // @ui 100 1200 520 | Line count
uniform float u_strength;  // @ui 0 1 0.55 | Line strength
uniform float u_curve;     // @ui 0 0.5 0.12 | Curvature
uniform float u_roll;      // @ui 0 2 0.6 | Roll speed
uniform float u_jitter;    // @ui 0 1 0.35 | Jitter
uniform float u_rgb;       // @ui 0 6 1.5 | RGB shift

void main() {
  vec2 uv = v_uv - 0.5;
  uv *= 1.0 + u_curve * dot(uv, uv);
  uv += 0.5;
  float band = smoothstep(0.0, 0.08, abs(fract(uv.y - u_time * u_roll * 0.2) - 0.5) - 0.38);
  float jit = (vnoise(vec2(uv.y * 80.0, u_time * 20.0)) - 0.5) * u_jitter * 0.01 * (1.0 - band * 0.8 + 0.2);
  uv.x += jit;
  float s = u_rgb / u_resolution.x;
  vec3 col = vec3(texture(u_input, uv + vec2(s, 0.0)).r, texture(u_input, uv).g, texture(u_input, uv - vec2(s, 0.0)).b);
  col *= 1.0 - u_strength * (0.5 + 0.5 * sin(uv.y * u_lines * 3.14159));
  col *= 0.85 + 0.15 * band;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
  fragColor = vec4(col, 1.0);
}
`;

const BLOOM = `${FILTER_H}
// Glow / bloom — bright areas bleed soft light.
uniform float u_threshold; // @ui 0 1 0.55 | Threshold
uniform float u_radius;    // @ui 1 60 18 | Radius
uniform float u_intensity; // @ui 0 4 1.2 | Intensity
uniform vec3 u_tint;       // @color #ffffff | Tint

vec3 bright(vec2 uv) {
  vec3 c = texture(u_input, uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  return c * smoothstep(u_threshold, u_threshold + 0.2, l);
}

void main() {
  vec3 base = texture(u_input, v_uv).rgb;
  vec2 px = u_radius / u_resolution * (min(u_resolution.x, u_resolution.y) / 1080.0);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int ring = 1; ring <= 3; ring++) {
    float rr = float(ring) / 3.0;
    for (int i = 0; i < 12; i++) {
      float a = float(i) / 12.0 * 6.2831 + float(ring) * 0.5;
      float w = 1.0 - rr * 0.6;
      acc += bright(v_uv + vec2(cos(a), sin(a)) * px * rr) * w;
      wsum += w;
    }
  }
  vec3 glow = acc / wsum;
  fragColor = vec4(base + glow * u_tint * u_intensity * 2.0, 1.0);
}
`;

const BLUR = `${FILTER_H}
// Blur — 25-tap gaussian blur of everything below.
uniform float u_radius;    // @ui 0 40 8 | Radius

void main() {
  vec2 px = u_radius / u_resolution * (min(u_resolution.x, u_resolution.y) / 1080.0) * 0.5;
  vec3 acc = vec3(0.0);
  float ws = 0.0;
  for (int y = -2; y <= 2; y++)
  for (int x = -2; x <= 2; x++) {
    vec2 o = vec2(float(x), float(y));
    float w = exp(-dot(o, o) / 4.5);
    acc += texture(u_input, v_uv + o * px).rgb * w;
    ws += w;
  }
  fragColor = vec4(acc / ws, 1.0);
}
`;

export const SHADERS: ShaderDef[] = [
  { id: 'glowGridRed', name: 'Red Glow Grid', category: 'Grid', kind: 'generator', blend: 'normal', source: GLOW_GRID, starter: true, description: 'Perspective grid with a moving red light.' },
  {
    id: 'glowGridCyan', name: 'Cyan Grid', category: 'Grid', kind: 'generator', blend: 'normal', source: GLOW_GRID, starter: true,
    params: { u_colorA: '#22e8ff', u_colorB: '#003a4d', u_bg: '#01070a', u_perspective: 0.85, u_spacing: 70, u_speed: 1.0, u_wave: 0.05 },
    description: 'Sci-fi cyan floor grid.',
  },
  {
    id: 'flatGrid', name: 'Flat Glow Grid', category: 'Grid', kind: 'generator', blend: 'normal', source: GLOW_GRID,
    params: { u_perspective: 0, u_spacing: 60, u_colorA: '#a46bff', u_colorB: '#2a0a5c', u_wave: 0.3, u_falloff: 1.2 },
    description: 'Flat violet grid with wave motion.',
  },
  { id: 'particleField', name: 'Particle Field', category: 'Particles', kind: 'generator', blend: 'normal', source: PARTICLE_FIELD, starter: true, description: 'Parallax glowing particle layers (GPU).' },
  { id: 'glitch', name: 'Digital Glitch', category: 'Glitch', kind: 'filter', blend: 'normal', source: GLITCH, starter: true, description: 'RGB split, displacement, blocks, noise, scanlines.' },
  { id: 'distortion', name: 'Wave Distortion', category: 'Distortion', kind: 'filter', blend: 'normal', source: DISTORTION, starter: true, description: 'Wave / radial / ripple / heat haze / noise.' },
  { id: 'gradient', name: 'Gradient Motion', category: 'Gradient', kind: 'generator', blend: 'normal', source: GRADIENT, starter: true, description: 'Flowing three-color gradient.' },
  { id: 'radialLight', name: 'Radial Light', category: 'Light', kind: 'generator', blend: 'normal', source: RADIAL_LIGHT, starter: true, description: 'Light burst with rays.' },
  { id: 'holo', name: 'Holographic Noise', category: 'Texture', kind: 'generator', blend: 'normal', source: HOLO, starter: true, description: 'Iridescent foil noise.' },
  { id: 'tunnel', name: 'Light Tunnel', category: 'Light', kind: 'generator', blend: 'normal', source: TUNNEL, description: 'Rings rushing toward camera.' },
  { id: 'hud', name: 'Futuristic HUD', category: 'Grid', kind: 'generator', blend: 'normal', source: HUD, description: 'Arcs, ticks and radar sweep.' },
  { id: 'pulse', name: 'Energy Pulse', category: 'Glow', kind: 'generator', blend: 'normal', source: PULSE, description: 'Expanding shockwave rings.' },
  { id: 'lightRays', name: 'Light Rays', category: 'Light', kind: 'generator', blend: 'add', source: LIGHT_RAYS, description: 'Volumetric light streaks.' },
  { id: 'lightSweep', name: 'Light Sweep', category: 'Light', kind: 'generator', blend: 'add', source: LIGHT_SWEEP, description: 'Diagonal sweeping highlight.' },
  { id: 'lines', name: 'Animated Lines', category: 'Light', kind: 'generator', blend: 'add', source: ANIMATED_LINES, description: 'Travelling light streaks.' },
  { id: 'chromatic', name: 'Chromatic Aberration', category: 'Distortion', kind: 'filter', blend: 'normal', source: CHROMATIC, description: 'Radial RGB fringing.' },
  { id: 'crt', name: 'Distorted Scanlines', category: 'Glitch', kind: 'filter', blend: 'normal', source: CRT, description: 'CRT curvature and rolling lines.' },
  { id: 'bloom', name: 'Glow / Bloom', category: 'Glow', kind: 'filter', blend: 'normal', source: BLOOM, description: 'Soft glow from bright areas.' },
  { id: 'blur', name: 'Blur', category: 'Texture', kind: 'filter', blend: 'normal', source: BLUR, description: 'Gaussian blur.' },
  { id: 'film', name: 'Film Finish', category: 'Texture', kind: 'filter', blend: 'normal', source: FILM, description: 'Vignette, grain, scanlines.' },
];

export const shaderById = (id: string) => SHADERS.find((s) => s.id === id);

export const BLANK_SHADER = `${H}
// Your shader. Uniforms below get UI controls automatically:
//   uniform float u_name; // @ui min max default | Label
//   uniform vec3  u_name; // @color #rrggbb | Label
uniform float u_intensity; // @ui 0 2 1 | Intensity
uniform float u_speed;     // @ui 0 4 1 | Speed
uniform vec3 u_colorA;     // @color #ff2a55 | Color A
uniform vec3 u_colorB;     // @color #22e1ff | Color B

void main() {
  vec2 uv = v_uv;
  float t = u_time * u_speed;
  float w = 0.5 + 0.5 * sin(uv.x * 10.0 + t) * cos(uv.y * 8.0 - t * 0.7);
  vec3 col = mix(u_colorA, u_colorB, w) * u_intensity;
  fragColor = vec4(col, 1.0);
}
`;

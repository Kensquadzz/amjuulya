// Cinematic 3D scenes: ray-marched GLSL worlds used by the cinematic video
// templates. Every scene is a pure function of (u_progress, u_time, params),
// so preview, thumbnails and export render identical frames. u_progress runs
// 0..1 across the layer, so stretching the layer re-times the whole film.
// User content enters through texture parameters: @glyph (text or a logo,
// extruded as real geometry) and @image (product shots, screenshots).
import type { ShaderDef } from './library';
import { H, NOISE } from './common';

/** Ray-marching kit shared by all scenes (no scene-specific code). */
export const RM = `
#define PI 3.14159265
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float seg(float x, float a, float b) { return clamp((x - a) / (b - a), 0.0, 1.0); }
float eOut(float x) { x = clamp(x, 0.0, 1.0); return 1.0 - (1.0 - x) * (1.0 - x) * (1.0 - x); }
float eIn(float x) { x = clamp(x, 0.0, 1.0); return x * x * x; }
float eInOut(float x) { x = clamp(x, 0.0, 1.0); return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) * 0.5; }
float eExpo(float x) { x = clamp(x, 0.0, 1.0); return x >= 1.0 ? 1.0 : 1.0 - pow(2.0, -10.0 * x); }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdRBox(vec3 p, vec3 b, float r) { return sdBox(p, b - r) - r; }
float sdRCylY(vec3 p, float r, float h, float rr) { vec2 d = vec2(length(p.xz) - r + rr, abs(p.y) - h + rr); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - rr; }
float sdTorusY(vec3 p, float R, float r) { return length(vec2(length(p.xz) - R, p.y)) - r; }
float sdExtrude(float d2, float z, float h) { vec2 w = vec2(d2, abs(z) - h); return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)); }
float sdRect2(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
/** World width that fits the frame: narrower in portrait, wider in landscape. */
float fitW(float portrait, float landscape) { float ar = u_resolution.x / u_resolution.y; return ar < 1.0 ? portrait : mix(portrait, landscape, clamp((ar - 1.0) / 0.78, 0.0, 1.0)); }
/** 0 in portrait/square, 1 in 16:9: tall subjects need the camera further back in landscape. */
float landK() { return clamp((u_resolution.x / u_resolution.y - 1.0) / 0.78, 0.0, 1.0); }
/** Screen position with the short side spanning -0.5..0.5 (portrait and landscape both frame the subject). */
vec2 shortUV() { return (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y); }
vec3 camRay(vec2 uv, vec3 ro, vec3 ta, float zoom, float roll) {
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(sin(roll), cos(roll), 0.0)));
  vec3 vv = cross(uu, ww);
  return normalize(uv.x * uu + uv.y * vv + zoom * ww);
}
/** Signed distance (in texture heights) of an @glyph field at q (texture heights, centred). */
float glyphSDF(sampler2D t, vec4 info, vec2 q) {
  vec2 uv = vec2(q.x / info.x + 0.5, q.y + 0.5);
  vec2 c = clamp(uv, vec2(0.002), vec2(0.998));
  return texture(t, c).r + length((uv - c) * vec2(info.x, 1.0));
}
float fres(float c, float f0) { return f0 + (1.0 - f0) * pow(1.0 - clamp(c, 0.0, 1.0), 5.0); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
/** Tone map, gamma, vignette and a whisper of resolution-independent grain. */
vec3 grade(vec3 c, vec2 uv) {
  c = aces(c);
  c = pow(c, vec3(1.0 / 2.2));
  c *= 1.0 - 0.45 * dot(uv, uv);
  c += (hash12(floor(gl_FragCoord.xy / MF_PX) + fract(u_time) * 91.0) - 0.5) * 0.014;
  return clamp(c, 0.0, 1.0);
}
/** Photographic studio: dark sweep, overhead softbox, two strip lights, a travelling streak. */
vec3 studio(vec3 d, vec3 key, vec3 rim, float streak) {
  float y = d.y;
  vec3 c = mix(vec3(0.01), vec3(0.045), smoothstep(-0.4, 0.9, y));
  c += key * smoothstep(0.82, 0.97, y) * 2.6;
  float a = atan(d.x, d.z);
  float strips = smoothstep(0.07, 0.0, abs(a - 1.25)) + smoothstep(0.05, 0.0, abs(a + 1.95));
  c += rim * strips * smoothstep(-0.25, 0.25, y) * smoothstep(0.95, 0.5, y) * 2.2;
  c += vec3(1.0) * smoothstep(0.035, 0.0, abs(a - streak)) * smoothstep(-0.6, 0.6, y) * 3.0;
  // large soft panel behind the camera (lights faces that look at the lens)
  c += key * 0.55 * smoothstep(0.55, 0.95, d.z) * smoothstep(-0.5, 0.2, y);
  return c;
}
`;

/** Generic marcher / normal / AO; expects \`vec2 map(vec3 p)\` (distance, material) above it. */
export const MARCH = `
vec2 march(vec3 ro, vec3 rd, float maxd, int steps) {
  float t = 0.0;
  vec2 h = vec2(1.0, -1.0);
  for (int i = 0; i < 160; i++) {
    if (i >= steps) break;
    h = map(ro + rd * t);
    if (abs(h.x) < 0.0004 * (1.0 + t)) return vec2(t, h.y);
    t += h.x * 0.85;
    if (t > maxd) break;
  }
  return vec2(t, (t < maxd && abs(h.x) < 0.02) ? h.y : -1.0);
}
vec3 calcNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.0008;
  return normalize(k.xyy * map(p + k.xyy * e).x + k.yyx * map(p + k.yyx * e).x + k.yxy * map(p + k.yxy * e).x + k.xxx * map(p + k.xxx * e).x);
}
float calcAO(vec3 p, vec3 n) {
  float o = 0.0, s = 1.0;
  for (int i = 1; i <= 5; i++) { float h = 0.02 + 0.06 * float(i); o += (h - map(p + n * h).x) * s; s *= 0.7; }
  return clamp(1.0 - 2.2 * o, 0.0, 1.0);
}
float softShadow(vec3 ro, vec3 rd, float k) {
  float r = 1.0, t = 0.02;
  for (int i = 0; i < 28; i++) { float h = map(ro + rd * t).x; r = min(r, k * h / t); t += clamp(h, 0.02, 0.25); if (r < 0.01 || t > 4.0) break; }
  return clamp(r, 0.0, 1.0);
}
`;

export const HEAD = `${H}${NOISE}${RM}`;

// ================================================================ 1. Liquid Glass
const LIQUID_GLASS = `${HEAD}
// @heavy
// Liquid Glass — refractive glass drops flow, merge and finally pour into the
// brand mark. Thick-glass refraction with dispersion over a flowing colour field.
uniform sampler2D u_logo; // @glyph Montserrat:900 FLOW | Brand (formed in glass)
uniform vec4 u_logoInfo;
uniform vec3 u_colorA;  // @color #6d3bff | Colour field A
uniform vec3 u_colorB;  // @color #19c3ff | Colour field B
uniform vec3 u_colorC;  // @color #ff4fa8 | Colour field C
uniform vec3 u_tint;    // @color #dfe9ff | Glass tint
uniform float u_ior;    // @ui 1.05 1.9 1.45 | Refraction
uniform float u_cam;    // @ui 0 2 1 | Camera movement
uniform float u_flow;   // @ui 0 2 1 | Flow speed
uniform float u_light;  // @ui 0 2 1 | Highlights

float P;     // film progress
float FORM;  // 0 = free drops, 1 = brand mark

float blobs(vec3 p) {
  float t = u_time * 0.35 * u_flow;
  float d = 1e3;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec3 c = vec3(sin(t * (0.7 + fi * 0.13) + fi * 2.1) * 0.75, cos(t * (0.6 + fi * 0.11) + fi * 1.3) * 0.42, sin(t * 0.5 + fi * 2.7) * 0.35);
    c *= 1.0 - 0.55 * FORM;
    d = smin(d, length(p - c) - (0.2 + 0.07 * sin(fi * 3.1)), 0.32);
  }
  return d;
}
float logo(vec3 p) {
  float s = fitW(1.25, 1.8) / max(u_logoInfo.z, 0.6); // fit the mark's width
  float g = glyphSDF(u_logo, u_logoInfo, p.xy / s) * s;
  return sdExtrude(g + 0.03, p.z, 0.09) - 0.05;
}
vec2 map(vec3 p) {
  float b = blobs(p);
  if (FORM <= 0.0 || u_logoInfo.y < 0.5) return vec2(b, 1.0);
  float l = logo(p);
  return vec2(mix(b, l, FORM), 1.0);
}
${MARCH}
vec3 field(vec3 d) {
  vec2 q = vec2(atan(d.x, -d.z), d.y * 1.6) * 1.3;
  float t = u_time * 0.12 * u_flow;
  float n = fbm(q * 0.9 + vec2(t, -t * 0.6));
  float m = fbm(q * 1.7 - vec2(t * 0.8, t * 0.3) + n);
  vec3 c = mix(u_colorA, u_colorB, smoothstep(0.25, 0.75, n));
  c = mix(c, u_colorC, smoothstep(0.45, 0.85, m) * 0.85);
  float bands = smoothstep(0.48, 0.5, fract(q.y * 1.4 + n * 2.0)) * smoothstep(0.56, 0.5, fract(q.y * 1.4 + n * 2.0));
  return c * (0.3 + 1.0 * m) + bands * 0.22;
}
vec3 glass(vec3 ro, vec3 rd, vec3 p, vec3 n) {
  vec3 refl = field(reflect(rd, n)) * 1.4;
  vec3 col = vec3(0.0);
  for (int ch = 0; ch < 3; ch++) {
    float ior = u_ior + (float(ch) - 1.0) * 0.025;
    vec3 r1 = refract(rd, n, 1.0 / ior);
    // march through the glass to find the exit surface
    vec3 q = p - n * 0.003;
    float tt = 0.0;
    for (int i = 0; i < 28; i++) { float h = -map(q + r1 * tt).x; if (h < 0.001) break; tt += max(h, 0.01); }
    vec3 pe = q + r1 * tt;
    vec3 ne = -calcNormal(pe);
    vec3 r2 = refract(r1, ne, ior);
    if (dot(r2, r2) < 0.01) r2 = reflect(r1, ne);
    float absorb = exp(-tt * 1.2);
    col[ch] = field(r2)[ch] * absorb * u_tint[ch];
  }
  float f = fres(dot(-rd, n), 0.04);
  vec3 c = mix(col, refl, f);
  vec3 L1 = normalize(vec3(0.6, 0.8, 0.5)), L2 = normalize(vec3(-0.7, 0.3, 0.4));
  vec3 h1 = normalize(L1 - rd), h2 = normalize(L2 - rd);
  c += (pow(max(dot(n, h1), 0.0), 220.0) * 2.5 + pow(max(dot(n, h2), 0.0), 90.0) * 0.8) * u_light;
  c += pow(1.0 - max(dot(-rd, n), 0.0), 3.0) * 0.25 * u_tint; // glass rim
  return c;
}
void main() {
  P = u_progress;
  FORM = eInOut(seg(P, 0.58, 0.8));
  vec2 uv = shortUV();
  float orbit = (P * 1.6 - 0.4) * u_cam;
  float dist = mix(3.1, 2.5, eInOut(seg(P, 0.0, 0.5))) + mix(0.0, 0.25, eInOut(seg(P, 0.8, 1.0)));
  vec3 ro = vec3(sin(orbit) * dist, 0.25 * sin(P * 3.0) * u_cam, cos(orbit) * dist);
  ro.xz *= 1.0;
  // the brand reads front-on at the end
  ro = mix(ro, vec3(0.0, 0.05, 2.75), eInOut(seg(P, 0.66, 0.86)));
  vec3 rd = camRay(uv, ro, vec3(0.0), 1.9, 0.06 * sin(P * 4.0) * u_cam);
  vec3 bg = field(rd) * 0.16 + 0.012;
  vec3 col = bg;
  vec2 h = march(ro, rd, 7.0, 110);
  if (h.y > 0.0) {
    vec3 p = ro + rd * h.x;
    col = glass(ro, rd, p, calcNormal(p));
  }
  // intro: fade up from black; outro hold
  col *= eOut(seg(P, 0.0, 0.06));
  fragColor = vec4(grade(col, uv), 1.0);
}
`;

// ================================================================ 2. Product Orbit
const PRODUCT_ORBIT = `${HEAD}
// @heavy
// 3D Product Orbit — a hero can on a glossy studio floor; the camera starts on
// a macro of the rim, orbits a full turn while rising, then settles on a hero
// angle. Wrap your own label artwork around it.
uniform sampler2D u_label; // @image | Label artwork (wraps around)
uniform vec4 u_labelInfo;
uniform sampler2D u_brand; // @glyph Montserrat:900 NOVA | Name on the label
uniform vec4 u_brandInfo;
uniform vec3 u_colorA;  // @color #ff3b5c | Product colour
uniform vec3 u_colorB;  // @color #1a1c24 | Backdrop
uniform vec3 u_metal;   // @color #d7dbe3 | Rim metal
uniform float u_cam;    // @ui 0 2 1 | Camera movement
uniform float u_spin;   // @ui -2 2 0.4 | Product spin
uniform float u_light;  // @ui 0 2 1 | Light intensity

const float R = 0.42, HH = 0.78;
float SPIN;

vec2 map(vec3 p) {
  vec3 q = p; q.xz *= rot(SPIN);
  float body = sdRCylY(q, R, HH, 0.07);
  float neck = sdRCylY(q - vec3(0.0, HH + 0.02, 0.0), R * 0.86, 0.05, 0.04);
  float can = smin(body, neck, 0.04);
  float floor_ = p.y + HH + 0.001;
  return can < floor_ ? vec2(can, 1.0) : vec2(floor_, 2.0);
}
${MARCH}
vec3 env(vec3 d) {
  vec3 c = u_colorB * (0.4 + 0.6 * smoothstep(-0.2, 0.7, d.y));
  // warm spotlight pool on the backdrop
  c += mix(u_colorB, u_colorA, 0.35) * 1.4 * smoothstep(0.75, 0.0, length(vec2(atan(d.x, -d.z) * 0.8, d.y - 0.15)));
  return c + studio(d, vec3(1.0, 0.97, 0.92) * u_light, vec3(0.75, 0.85, 1.0) * u_light, 9.0);
}
vec3 labelColor(vec3 q) {
  float a = atan(q.x, q.z);
  float v = q.y / (HH * 2.0) + 0.5;
  if (u_labelInfo.y > 0.5) return texture(u_label, vec2(fract(a / (2.0 * PI) + 0.5), clamp((v - 0.1) / 0.8, 0.0, 1.0))).rgb;
  // default label: colour body, white band and the brand name running round it
  vec3 c = u_colorA * (0.85 + 0.15 * v);
  float band = smoothstep(0.004, 0.0, abs(v - 0.3) - 0.03);
  c = mix(c, vec3(1.0), band * 0.9);
  float s = 0.42 / max(u_brandInfo.w, 0.4);
  float g = glyphSDF(u_brand, u_brandInfo, vec2(a * R, q.y - 0.05) / s);
  c = mix(c, vec3(1.0), smoothstep(0.004, -0.004, g * s) * u_brandInfo.y);
  return c;
}
vec3 shadeCan(vec3 p, vec3 rd, vec3 n) {
  vec3 q = p; q.xz *= rot(SPIN);
  vec3 qn = n; qn.xz *= rot(SPIN);
  bool rim = abs(q.y) > HH - 0.1;
  vec3 base = rim ? u_metal : labelColor(q);
  float rough = rim ? 0.15 : 0.35;
  vec3 L = normalize(vec3(0.5, 0.9, 0.6));
  float dif = max(dot(n, L), 0.0) * softShadow(p + n * 0.01, L, 8.0);
  float amb = 0.3 + 0.3 * n.y;
  vec3 r = reflect(rd, n);
  float f = fres(dot(-rd, n), rim ? 0.6 : 0.06);
  vec3 spec = env(r) * f * (rim ? 1.6 : 1.0);
  float hl = pow(max(dot(r, L), 0.0), mix(400.0, 40.0, rough)) * (rim ? 2.0 : 1.0);
  vec3 c = base * (dif * 1.1 + amb * 0.5) * u_light + spec + hl * u_light;
  return c * calcAO(p, n);
}
void main() {
  float P = u_progress;
  SPIN = u_time * u_spin;
  vec2 uv = shortUV();
  // macro rim -> full orbit while rising -> hero angle
  float a = mix(-0.6, -0.6 + 2.0 * PI * 0.9, eInOut(seg(P, 0.05, 0.78))) * u_cam;
  float dist = mix(1.25, 3.2, eInOut(seg(P, 0.0, 0.42))) * (1.0 + 0.35 * landK());
  float y = mix(0.75, 0.45, eInOut(seg(P, 0.0, 0.4))) + 0.35 * sin(P * PI) * u_cam;
  vec3 ro = vec3(sin(a) * dist, y, cos(a) * dist);
  vec3 ta = vec3(0.0, mix(0.62, 0.05, eInOut(seg(P, 0.0, 0.4))), 0.0);
  vec3 hero = vec3(1.25, 0.32, 2.75) * (1.0 + 0.35 * landK());
  float hk = eInOut(seg(P, 0.78, 0.95));
  ro = mix(ro, hero, hk);
  ta = mix(ta, vec3(0.0, 0.08, 0.0), hk);
  vec3 rd = camRay(uv, ro, ta, 1.8, 0.0);
  vec3 col = env(rd) * 0.6;
  vec2 h = march(ro, rd, 12.0, 110);
  if (h.y > 1.5) {
    vec3 p = ro + rd * h.x;
    vec3 n = vec3(0.0, 1.0, 0.0);
    // glossy floor: reflection of the product, contact shadow
    vec3 rr = reflect(rd, n);
    vec2 h2 = march(p + n * 0.002, rr, 6.0, 64);
    vec3 refl = env(rr) * 0.4;
    if (h2.y > 0.5 && h2.y < 1.5) { vec3 p2 = p + rr * h2.x; refl = shadeCan(p2, rr, calcNormal(p2)); }
    float f = fres(dot(-rd, n), 0.03);
    float sh = softShadow(p + n * 0.01, normalize(vec3(0.5, 0.9, 0.6)), 6.0);
    float contact = smoothstep(0.0, 0.6, length(p.xz) - R);
    col = u_colorB * 0.35 * (0.4 + 0.6 * sh) * (0.5 + 0.5 * contact) + refl * mix(0.18, 0.8, f);
    col = mix(col, env(rd) * 0.6, smoothstep(3.0, 9.0, h.x)); // floor fades into the sweep
  } else if (h.y > 0.5) {
    vec3 p = ro + rd * h.x;
    col = shadeCan(p, rd, calcNormal(p));
  }
  col *= eOut(seg(P, 0.0, 0.05)) * (1.0 - 0.6 * eIn(seg(P, 0.97, 1.0)));
  fragColor = vec4(grade(col, uv), 1.0);
}
`;

// ================================================================ 3. Chrome Logo Reveal
const CHROME_LOGO = `${HEAD}
// @heavy
// Chrome Logo Reveal — a bevelled chrome extrusion of your logo emerges from
// smoke while light streaks race across it; the camera sweeps from the edge
// to the front and the final frame lands with a glint.
uniform sampler2D u_logo; // @glyph Montserrat:900 CHROME | Logo (text or picture)
uniform vec4 u_logoInfo;
uniform vec3 u_tint;    // @color #e9eef7 | Chrome tint
uniform vec3 u_streak;  // @color #7fb8ff | Light streak colour
uniform vec3 u_smokeC;  // @color #1b2a4a | Smoke colour
uniform float u_depth;  // @ui 0.02 0.4 0.14 | Extrusion depth
uniform float u_bevel;  // @ui 0 0.08 0.03 | Bevel
uniform float u_cam;    // @ui 0 2 1 | Camera movement
uniform float u_smoke;  // @ui 0 2 1 | Smoke

float P;
float SC;

vec2 map(vec3 p) {
  float g = glyphSDF(u_logo, u_logoInfo, p.xy / SC) * SC;
  float d = sdExtrude(g + u_bevel, p.z, u_depth) - u_bevel;
  float floor_ = p.y + 0.62;
  return d < floor_ ? vec2(d, 1.0) : vec2(floor_, 2.0);
}
${MARCH}
vec3 env(vec3 d, float streak) {
  vec3 c = studio(d, vec3(0.9, 0.95, 1.0), u_streak * 0.9, streak);
  // moving horizontal light bars sweep across the chrome
  float bars = smoothstep(0.03, 0.0, abs(fract(d.y * 2.0 - u_time * 0.25) - 0.5) - 0.42);
  c += u_streak * bars * 0.8 * smoothstep(-0.2, 0.4, d.z * -1.0 + 0.3);
  return c;
}
vec3 smoke(vec2 uv, float t) {
  float n = fbm(uv * 2.2 + vec2(t * 0.05, -t * 0.03));
  float m = fbm(uv * 4.0 - vec2(t * 0.07, 0.0) + n);
  return u_smokeC * (n * m) * 1.6 * u_smoke;
}
void main() {
  P = u_progress;
  SC = fitW(1.2, 1.7) / max(u_logoInfo.z, 0.6);
  vec2 uv = shortUV();
  // edge-on sweep -> front -> slow push -> settle
  float a = mix(1.25, 0.0, eInOut(seg(P, 0.04, 0.55))) * u_cam;
  float el = mix(-0.25, 0.08, eInOut(seg(P, 0.04, 0.55))) * u_cam;
  float dist = mix(1.6, 3.0, eInOut(seg(P, 0.0, 0.55))) - 0.25 * eInOut(seg(P, 0.55, 0.92)) * u_cam;
  vec3 ro = vec3(sin(a) * dist, el + 0.1, cos(a) * dist);
  vec3 rd = camRay(uv, ro, vec3(0.0, 0.0, 0.0), 1.9, -0.05 * (1.0 - seg(P, 0.0, 0.55)) * u_cam);
  float streak = mix(-2.6, 2.6, seg(P, 0.42, 0.75)); // the hero light pass
  vec3 col = smoke(uv + vec2(0.0, 0.1), u_time) + vec3(0.004, 0.006, 0.012);
  // light rays fanning from behind the logo
  float rays = pow(max(0.0, 1.0 - length(uv * vec2(0.55, 1.4))), 3.0) * (0.6 + 0.4 * fbm(vec2(atan(uv.y, uv.x) * 6.0, u_time * 0.2)));
  col += u_streak * rays * 0.22 * eOut(seg(P, 0.1, 0.5));
  vec2 h = march(ro, rd, 10.0, 120);
  float reveal = eOut(seg(P, 0.03, 0.3));
  if (h.y > 1.5) {
    vec3 p = ro + rd * h.x;
    vec3 n = vec3(0.0, 1.0, 0.0);
    vec3 rr = reflect(rd, n);
    vec2 h2 = march(p + n * 0.003, rr, 5.0, 70);
    vec3 refl = vec3(0.0);
    if (h2.y > 0.5 && h2.y < 1.5) { vec3 p2 = p + rr * h2.x; vec3 n2 = calcNormal(p2); refl = env(reflect(rr, n2), streak) * u_tint * 0.9; }
    col += refl * 0.22 * smoothstep(4.0, 0.5, h.x) * reveal * (1.0 - 0.5 * fbm(p.xz * 30.0));
  } else if (h.y > 0.5) {
    vec3 p = ro + rd * h.x;
    vec3 n = calcNormal(p);
    vec3 r = reflect(rd, n);
    float f = fres(dot(-rd, n), 0.75);
    vec3 c = env(r, streak) * u_tint * f;
    c += pow(max(dot(r, normalize(vec3(0.4, 0.7, 0.6))), 0.0), 120.0) * 2.0;
    c *= 0.55 + 0.45 * calcAO(p, n);
    col = mix(col, c, reveal);
  }
  // glint on the final settle
  vec2 gp = uv - vec2(0.36, 0.13) * vec2(max(u_resolution.x / u_resolution.y, 1.0), 1.0) * 0.6;
  float gk = smoothstep(0.0, 0.08, P - 0.84) * smoothstep(0.98, 0.88, P);
  float glint = (0.0015 / (abs(gp.x * gp.y) + 0.0004) * smoothstep(0.2, 0.0, length(gp)) + 0.004 / (dot(gp, gp) + 0.001)) * gk;
  col += vec3(0.85, 0.92, 1.0) * glint * 0.35;
  col *= eOut(seg(P, 0.0, 0.05));
  fragColor = vec4(grade(col, uv), 1.0);
}
`;

export const CINEMATIC_SHADERS: ShaderDef[] = [
  { id: 'cineLiquidGlass', name: 'Liquid Glass (3D)', category: 'Cinematic 3D', kind: 'generator', blend: 'normal', source: LIQUID_GLASS, description: 'Refractive glass drops that flow, merge and pour into your brand mark.' },
  { id: 'cineProductOrbit', name: 'Product Orbit (3D)', category: 'Cinematic 3D', kind: 'generator', blend: 'normal', source: PRODUCT_ORBIT, description: 'Studio product turntable with a full camera orbit, reflective floor and your label.' },
  { id: 'cineChromeLogo', name: 'Chrome Logo (3D)', category: 'Cinematic 3D', kind: 'generator', blend: 'normal', source: CHROME_LOGO, description: 'Bevelled chrome extrusion of your logo with light streaks, smoke and a glint.' },
];

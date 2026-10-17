// Cinematic 3D scenes, part 2: interface, typography, perfume, hologram and
// abstract worlds. Same conventions as cinematic.ts.
import type { ShaderDef } from './library';
import { HEAD, MARCH } from './cinematic';

// ================================================================ 4. Floating App Interface
const FLOATING_UI = `${HEAD}
// @heavy
// Floating App Interface — glass app screens hang at different depths in a
// deep blue space; the camera dollies through them, they drift and turn, and
// finally fan out around the hero screen. Drop in your own screenshots.
uniform sampler2D u_screen1; // @image | Hero screenshot
uniform vec4 u_screen1Info;
uniform sampler2D u_screen2; // @image | Screenshot 2
uniform vec4 u_screen2Info;
uniform sampler2D u_screen3; // @image | Screenshot 3
uniform vec4 u_screen3Info;
uniform vec3 u_colorA;  // @color #2f6bff | Accent
uniform vec3 u_colorB;  // @color #050a1f | Space
uniform vec3 u_colorC;  // @color #8a5cff | Accent 2
uniform float u_cam;    // @ui 0 2 1 | Camera movement
uniform float u_drift;  // @ui 0 2 1 | Drift
uniform float u_glow;   // @ui 0 2 1 | Edge glow

float P;
const vec2 PANEL = vec2(0.36, 0.72); // half size (phone-like screen)

// layout of the five screens: scattered in depth, then a fan around the hero
vec3 panelPos(int i) {
  float fi = float(i);
  vec3 a = vec3(sin(fi * 2.4) * 1.3, cos(fi * 1.7) * 0.7, -fi * 1.6 + 1.5);
  vec3 b = vec3((fi - 2.0) * 0.62, -abs(fi - 2.0) * 0.08, -abs(fi - 2.0) * 0.45);
  vec3 p = mix(a, b, eInOut(seg(P, 0.55, 0.85)));
  p.y += sin(u_time * 0.6 + fi * 1.3) * 0.04 * u_drift;
  return p;
}
vec2 panelRot(int i) { // yaw, pitch
  float fi = float(i);
  vec2 a = vec2(sin(fi * 1.9) * 0.55, cos(fi * 2.3) * 0.25) + vec2(sin(u_time * 0.3 + fi), cos(u_time * 0.25 + fi)) * 0.06 * u_drift;
  vec2 b = vec2((fi - 2.0) * -0.32, 0.0);
  return mix(a, b, eInOut(seg(P, 0.55, 0.85)));
}
vec3 toLocal(vec3 p, int i) {
  vec3 q = p - panelPos(i);
  vec2 r = panelRot(i);
  q.xz *= rot(r.x);
  q.yz *= rot(r.y);
  return q;
}
vec2 map(vec3 p) {
  vec2 res = vec2(1e3, -1.0);
  for (int i = 0; i < 5; i++) {
    vec3 q = toLocal(p, i);
    float d = sdRBox(q, vec3(PANEL, 0.018), 0.016);
    if (d < res.x) res = vec2(d, float(i));
  }
  return res;
}
${MARCH}
// procedural app screen (used when no screenshot is set)
vec3 appUI(vec2 uv, int i) {
  vec3 bg = mix(u_colorB * 2.2 + 0.03, mix(u_colorA, u_colorC, float(i) / 4.0) * 0.35, uv.y * 0.6);
  vec3 c = bg;
  vec2 q = (uv - 0.5) * vec2(PANEL.x, PANEL.y) * 2.0;
  // status bar + title
  c = mix(c, vec3(0.95), step(abs(q.y - 0.62), 0.012) * step(abs(q.x + 0.12), 0.16));
  // hero card
  float card = sdRect2(q - vec2(0.0, 0.3), vec2(0.3, 0.17), 0.04);
  c = mix(c, mix(u_colorA, u_colorC, uv.x) * 1.3, smoothstep(0.003, -0.003, card));
  // rows: avatar + two lines
  for (int r = 0; r < 4; r++) {
    float y = 0.0 - float(r) * 0.15;
    float av = length(q - vec2(-0.23, y)) - 0.045;
    c = mix(c, mix(u_colorC, u_colorA, float(r) / 3.0), smoothstep(0.003, -0.003, av));
    c = mix(c, vec3(0.85), smoothstep(0.003, -0.003, sdRect2(q - vec2(0.02, y + 0.02), vec2(0.17, 0.011), 0.01)));
    c = mix(c, vec3(0.45), smoothstep(0.003, -0.003, sdRect2(q - vec2(-0.03, y - 0.022), vec2(0.12, 0.008), 0.008)));
  }
  // tab bar
  c = mix(c, vec3(0.08, 0.1, 0.18), step(q.y, -0.6));
  for (int k = 0; k < 4; k++) c = mix(c, k == 0 ? u_colorA : vec3(0.55), smoothstep(0.003, -0.003, length(q - vec2(-0.24 + float(k) * 0.16, -0.66)) - 0.022));
  return c;
}
vec3 screenColor(vec2 uv, int i) {
  if (i == 2 && u_screen1Info.y > 0.5) return texture(u_screen1, uv).rgb;
  if (i == 1 && u_screen2Info.y > 0.5) return texture(u_screen2, uv).rgb;
  if (i == 3 && u_screen3Info.y > 0.5) return texture(u_screen3, uv).rgb;
  return appUI(uv, i);
}
vec3 space(vec3 rd, vec2 uv) {
  vec3 c = u_colorB * (0.6 + 0.6 * smoothstep(-0.6, 0.6, rd.y));
  c += u_colorA * 0.25 * smoothstep(0.9, 0.0, length(uv - vec2(0.15, 0.2)));
  c += u_colorC * 0.18 * smoothstep(0.8, 0.0, length(uv + vec2(0.3, 0.25)));
  // bokeh
  vec2 g = rd.xy / max(0.2, abs(rd.z)) * 6.0;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5 + (hash22(id) - 0.5) * 0.6;
  float b = smoothstep(0.12, 0.08, length(f)) * step(0.8, hash12(id + 7.0));
  return c + b * mix(u_colorA, u_colorC, hash12(id)) * 0.25;
}
void main() {
  P = u_progress;
  vec2 uv = shortUV();
  float z = mix(6.0, 3.1, eInOut(seg(P, 0.0, 0.55))) + 0.4 * eInOut(seg(P, 0.85, 1.0));
  vec3 ro = vec3(sin(P * 2.2 - 0.6) * 1.1 * u_cam * (1.0 - seg(P, 0.55, 0.85)), 0.3 * sin(P * 3.0) * u_cam, z);
  vec3 ta = vec3(0.0, 0.0, mix(-1.5, 0.0, eInOut(seg(P, 0.0, 0.7))));
  vec3 rd = camRay(uv, ro, ta, 1.8, 0.05 * sin(P * 5.0) * u_cam);
  vec3 col = space(rd, uv);
  vec2 h = march(ro, rd, 14.0, 110);
  if (h.y >= 0.0) {
    int i = int(h.y + 0.5);
    vec3 p = ro + rd * h.x;
    vec3 n = calcNormal(p);
    vec3 q = toLocal(p, i);
    float face = step(0.0175, q.z);
    vec2 suv = q.xy / (PANEL * 2.0) + 0.5;
    float inner = smoothstep(0.0, 0.01, min(min(suv.x, 1.0 - suv.x), min(suv.y, 1.0 - suv.y)) - 0.012);
    vec3 scr = screenColor(clamp(suv, 0.0, 1.0), i) * 1.05;
    vec3 r = reflect(rd, n);
    float f = fres(dot(-rd, n), 0.04);
    vec3 glassC = space(r, uv) * 0.6 + studio(r, vec3(0.6, 0.7, 1.0), u_colorA, 9.0) * 0.4;
    vec3 c = mix(vec3(0.03, 0.04, 0.08), scr, face * inner);
    c = mix(c, glassC, f * 0.8 + (1.0 - face) * 0.3);
    float edge = 1.0 - inner;
    c += mix(u_colorA, u_colorC, suv.y) * edge * face * 0.9 * u_glow;
    // depth haze: far screens sink into space
    col = mix(c, col, smoothstep(5.0, 12.0, h.x) * 0.8);
  }
  col *= eOut(seg(P, 0.0, 0.05)) * (1.0 - 0.5 * eIn(seg(P, 0.98, 1.0)));
  fragColor = vec4(grade(col, uv), 1.0);
}
`;

// ================================================================ 5. Cinematic Typography
const TYPOGRAPHY = `${HEAD}
// @heavy
// Cinematic Typography — two monumental extruded words. The camera skims the
// face of the first word in macro, whips round as the second rises from the
// floor, and ends on a lit, dimensional title card.
uniform sampler2D u_word1; // @glyph Montserrat:900 MAKE | First word
uniform vec4 u_word1Info;
uniform sampler2D u_word2; // @glyph Montserrat:900 IT BOLD | Second word
uniform vec4 u_word2Info;
uniform vec3 u_colorA;  // @color #f2efe9 | Letter colour
uniform vec3 u_colorB;  // @color #ff5a2b | Rim light
uniform vec3 u_colorC;  // @color #0d0f16 | Stage
uniform float u_depth;  // @ui 0.05 0.6 0.28 | Extrusion
uniform float u_cam;    // @ui 0 2 1 | Camera movement
uniform float u_beam;   // @ui 0 2 1 | Light beam

float P, S1, S2, RISE;

vec2 map(vec3 p) {
  float g1 = glyphSDF(u_word1, u_word1Info, (p.xy - vec2(0.0, 0.36)) / S1) * S1;
  float w1 = sdExtrude(g1 + 0.012, p.z, u_depth) - 0.012;
  vec3 q = p - vec3(0.0, mix(-1.6, -0.36, RISE), 0.0);
  float g2 = glyphSDF(u_word2, u_word2Info, q.xy / S2) * S2;
  float w2 = sdExtrude(g2 + 0.012, q.z, u_depth) - 0.012;
  float floor_ = p.y + 0.75;
  vec2 r = w1 < w2 ? vec2(w1, 1.0) : vec2(w2, 2.0);
  return r.x < floor_ ? r : vec2(floor_, 3.0);
}
${MARCH}
vec3 shade(vec3 p, vec3 rd, vec3 n, float m) {
  vec3 L = normalize(vec3(-0.4, 0.9, 0.5));
  vec3 Lr = normalize(vec3(0.9, 0.2, -0.6));
  float dif = max(dot(n, L), 0.0) * softShadow(p + n * 0.01, L, 10.0);
  float rim = pow(max(dot(n, Lr), 0.0), 2.0);
  float front = smoothstep(0.7, 0.95, n.z); // the type face reads lighter than the sides
  vec3 base = m > 1.5 ? mix(u_colorA, u_colorB, 0.15) : u_colorA;
  vec3 c = base * (0.12 + 1.1 * dif) * mix(0.6, 1.0, front) + u_colorB * rim * 1.4;
  vec3 r = reflect(rd, n);
  c += studio(r, vec3(1.0), u_colorB, 9.0) * fres(dot(-rd, n), 0.05) * 0.5;
  return c * calcAO(p, n);
}
void main() {
  P = u_progress;
  S1 = fitW(1.15, 1.9) / max(u_word1Info.z, 0.5);
  S2 = fitW(1.15, 1.9) / max(u_word2Info.z, 0.5);
  RISE = eOut(seg(P, 0.4, 0.62));
  vec2 uv = shortUV();
  // macro skim along word 1 -> whip -> wide hero
  float k1 = eInOut(seg(P, 0.0, 0.38));
  vec3 ro = mix(vec3(-0.9, 0.42, 0.55), vec3(0.9, 0.38, 0.75), k1);
  vec3 ta = mix(vec3(-0.2, 0.36, 0.0), vec3(0.4, 0.36, 0.0), k1);
  float k2 = eInOut(seg(P, 0.36, 0.7));
  ro = mix(ro, vec3(-1.4 * u_cam, -0.1, 2.6), k2);
  ta = mix(ta, vec3(0.0, -0.05, 0.0), k2);
  float k3 = eInOut(seg(P, 0.7, 1.0));
  ro = mix(ro, vec3(0.25 * u_cam, 0.12, 3.05), k3);
  ro.xy += vec2(sin(u_time * 0.7), cos(u_time * 0.5)) * 0.015 * u_cam; // handheld breath
  vec3 rd = camRay(uv, ro, ta, 1.7, mix(0.12, -0.04, k2) * u_cam);
  vec3 col = u_colorC * (0.4 + 0.6 * smoothstep(-0.5, 0.6, rd.y));
  // volumetric beam from above
  float beam = pow(max(0.0, 1.0 - abs(uv.x * 1.6 + uv.y * 0.35 - 0.1)), 6.0) * smoothstep(-0.6, 0.6, uv.y);
  col += mix(vec3(1.0), u_colorB, 0.4) * beam * 0.25 * u_beam;
  vec2 h = march(ro, rd, 12.0, 120);
  if (h.y > 2.5) {
    vec3 p = ro + rd * h.x;
    vec3 n = vec3(0.0, 1.0, 0.0);
    vec3 rr = reflect(rd, n);
    vec2 h2 = march(p + n * 0.003, rr, 4.0, 60);
    vec3 refl = h2.y > 0.5 && h2.y < 2.5 ? shade(p + rr * h2.x, rr, calcNormal(p + rr * h2.x), h2.y) : vec3(0.0);
    float sh = softShadow(p + n * 0.01, normalize(vec3(-0.4, 0.9, 0.5)), 8.0);
    col = u_colorC * 0.6 * (0.35 + 0.65 * sh) + refl * 0.25;
    col = mix(col, u_colorC * 0.5, smoothstep(2.0, 9.0, h.x));
  } else if (h.y > 0.5) {
    vec3 p = ro + rd * h.x;
    col = shade(p, rd, calcNormal(p), h.y);
  }
  col *= eOut(seg(P, 0.0, 0.04));
  fragColor = vec4(grade(col, uv), 1.0);
}
`;

// ================================================================ 6. Luxury Perfume Commercial
const PERFUME = `${HEAD}
// @heavy
// Luxury Perfume — a faceted glass flacon with amber liquid and a gold cap on
// a polished plinth, against slow silk folds. Elegant arc from below to eye
// level, a single highlight glides across the glass, and it ends in stillness.
uniform sampler2D u_brand; // @glyph Playfair Display:700 Aurum | Name etched on the glass
uniform vec4 u_brandInfo;
uniform vec3 u_liquid;  // @color #e0a03a | Fragrance colour
uniform vec3 u_gold;    // @color #e6c27a | Cap & plinth metal
uniform vec3 u_silk;    // @color #3a1420 | Silk backdrop
uniform float u_cam;    // @ui 0 2 1 | Camera movement
uniform float u_sweep;  // @ui 0 2 1 | Highlight sweep
uniform float u_folds;  // @ui 0 2 1 | Silk movement

float P;
vec2 map(vec3 p) {
  float body = sdRBox(p - vec3(0.0, 0.05, 0.0), vec3(0.42, 0.5, 0.17), 0.06);
  float neck = sdRCylY(p - vec3(0.0, 0.6, 0.0), 0.09, 0.08, 0.02);
  float glassD = smin(body, neck, 0.05);
  float cap = sdRBox(p - vec3(0.0, 0.84, 0.0), vec3(0.2, 0.18, 0.2), 0.05);
  float plinth = sdRCylY(p - vec3(0.0, -0.62, 0.0), 0.95, 0.15, 0.02);
  vec2 r = glassD < cap ? vec2(glassD, 1.0) : vec2(cap, 2.0);
  return r.x < plinth ? r : vec2(plinth, 3.0);
}
${MARCH}
vec3 silk(vec3 d) {
  vec2 q = vec2(atan(d.x, -d.z) * 2.0, d.y * 2.5);
  float t = u_time * 0.15 * u_folds;
  float f = sin(q.x * 3.0 + sin(q.y * 1.7 + t) * 1.6 + t) * 0.5 + 0.5;
  f = pow(f, 3.0) + 0.3 * sin(q.x * 7.0 + q.y * 2.0 - t * 1.3);
  return u_silk * (0.35 + 1.1 * f) + u_silk * u_silk * 0.5;
}
vec3 env(vec3 d, float sweep) {
  vec3 c = silk(d) * 0.8;
  c += studio(d, vec3(1.0, 0.95, 0.88), u_gold, sweep) * 0.9;
  return c;
}
vec3 metal(vec3 p, vec3 rd, vec3 n, float sweep) {
  vec3 r = reflect(rd, n);
  vec3 c = env(r, sweep) * u_gold * 1.3 * fres(dot(-rd, n), 0.7);
  c += pow(max(dot(r, normalize(vec3(0.5, 0.8, 0.6))), 0.0), 60.0) * u_gold * 2.0;
  return c * (0.5 + 0.5 * calcAO(p, n));
}
float liquidBox(vec3 p) { return sdRBox(p - vec3(0.0, -0.06, 0.0), vec3(0.36, 0.37, 0.12), 0.05); }
vec3 glassShade(vec3 p, vec3 rd, vec3 n, float sweep) {
  vec3 r = reflect(rd, n);
  float f = fres(dot(-rd, n), 0.05);
  vec3 refl = env(r, sweep) * 1.2;
  vec3 rr = refract(rd, n, 1.0 / 1.5);
  // thick glass walls: brighter, cleaner glass near the silhouette
  float wall = pow(1.0 - abs(dot(rd, n)), 2.0);
  // liquid inside (analytic-enough: short march against the liquid volume)
  float t = 0.0; bool hitL = false;
  for (int i = 0; i < 24; i++) { float d = liquidBox(p + rr * t); if (d < 0.002) { hitL = true; break; } t += max(d, 0.01); if (t > 0.6) break; }
  vec3 through = env(rr, sweep) * 0.45;
  if (hitL) {
    vec3 pl = p + rr * t;
    float depth = smoothstep(0.37, -0.37, pl.y);
    vec3 bgT = env(refract(rr, normalize(vec3(rr.xy * 0.4, 1.0)), 0.85), sweep);
    // amber deepens towards the bottom and towards the edges of the flacon
    float edge = smoothstep(0.2, 0.36, abs(pl.x)) * 0.5;
    vec3 amber = u_liquid * u_liquid * (0.12 + 0.5 * (1.0 - depth)) + u_liquid * 0.06;
    // caustic light pooling low in the liquid and a soft vertical gradient
    amber += u_liquid * smoothstep(0.25, 0.0, length(vec2(pl.x * 1.6, pl.y + 0.22))) * 0.35;
    through = (amber + bgT * u_liquid * 0.35) * (1.0 - edge * 0.7);
    through += u_liquid * pow(max(0.0, 1.0 - abs(pl.y - 0.31) * 30.0), 2.0) * 0.8; // meniscus line
  }
  // etched name on the front face
  float s = 0.42 / max(u_brandInfo.z, 0.8);
  float g = glyphSDF(u_brand, u_brandInfo, (p.xy - vec2(0.0, 0.12)) / s) * s;
  float etch = smoothstep(0.003, -0.003, g) * step(0.15, p.z) * u_brandInfo.y;
  vec3 c = mix(through, refl, clamp(f + wall * 0.35, 0.0, 1.0));
  c = mix(c, vec3(0.92, 0.9, 0.86) * (0.6 + 0.4 * refl.r), etch * 0.85);
  c += pow(max(dot(r, normalize(vec3(-0.5, 0.7, 0.6))), 0.0), 300.0) * 3.0;
  return c;
}
void main() {
  P = u_progress;
  vec2 uv = shortUV();
  float a = mix(-0.7, 0.18, eInOut(seg(P, 0.0, 0.9))) * u_cam;
  float y = mix(-0.35, 0.18, eInOut(seg(P, 0.0, 0.75)));
  float dist = mix(2.5, 3.4, eInOut(seg(P, 0.0, 0.6))) * (1.0 + 0.3 * landK());
  vec3 ro = vec3(sin(a) * dist, y, cos(a) * dist);
  vec3 ta = vec3(0.0, mix(0.3, 0.1, eInOut(seg(P, 0.0, 0.6))), 0.0);
  vec3 rd = camRay(uv, ro, ta, 1.9, 0.0);
  float sweep = mix(-2.5, 2.5, seg(P, 0.45, 0.78) * u_sweep);
  vec3 col = silk(rd) * 0.75;
  vec2 h = march(ro, rd, 12.0, 120);
  if (h.y > 0.5) {
    vec3 p = ro + rd * h.x;
    vec3 n = calcNormal(p);
    if (h.y < 1.5) col = glassShade(p, rd, n, sweep);
    else if (h.y < 2.5) col = metal(p, rd, n, sweep);
    else {
      // polished plinth: dark lacquer top, gold rim
      bool rimBand = p.y < -0.5;
      vec3 r = reflect(rd, n);
      col = rimBand ? metal(p, rd, n, sweep) : vec3(0.02) + env(r, sweep) * fres(dot(-rd, n), 0.04) * 0.9;
      if (!rimBand) { vec2 h2 = march(p + n * 0.003, r, 3.0, 50); if (h2.y > 0.5 && h2.y < 2.5) { col += (h2.y < 1.5 ? u_liquid * 0.5 : u_gold * 0.5) * 0.5; } }
    }
  }
  col *= eOut(seg(P, 0.0, 0.07)) * (1.0 - 0.7 * eIn(seg(P, 0.97, 1.0)));
  fragColor = vec4(grade(col, uv), 1.0);
}
`;

// ================================================================ 7. Holographic Future UI
const HOLO_UI = `${HEAD}
// Holographic Future UI — a wireframe hologram globe with orbiting data rings,
// curved HUD panels and a glowing grid floor; the camera circles and rises
// into the interface. Emissive layers are intersected analytically (cheap).
uniform vec3 u_colorA;  // @color #29e7ff | Hologram
uniform vec3 u_colorB;  // @color #ff3df0 | Accent
uniform vec3 u_colorC;  // @color #02040c | Darkness
uniform float u_cam;    // @ui 0 2 1 | Camera movement
uniform float u_scan;   // @ui 0 2 1 | Scan lines
uniform float u_data;   // @ui 0 2 1 | Data density

float P;
float lineAA(float x, float w) { float f = abs(fract(x) - 0.5); return smoothstep(w + fwidth(x) * 1.2, w, 0.5 - f); }
vec3 globe(vec3 ro, vec3 rd, float R) {
  float b = dot(ro, rd), c = dot(ro, ro) - R * R, h = b * b - c;
  if (h < 0.0) return vec3(0.0);
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 2; k++) { // front and back shell
    float t = -b + (k == 0 ? -1.0 : 1.0) * sqrt(h);
    if (t < 0.0) continue;
    vec3 p = ro + rd * t;
    vec3 q = p; q.xz *= rot(u_time * 0.25);
    float lat = asin(clamp(q.y / R, -1.0, 1.0)) / PI * 12.0;
    float lon = atan(q.x, q.z) / PI * 12.0;
    float lines = max(lineAA(lat, 0.02), lineAA(lon, 0.02));
    float land = smoothstep(0.55, 0.62, fbm(vec2(lon, lat) * 0.35 + 3.0)) * 0.35;
    float fr = pow(1.0 - abs(dot(normalize(p), rd)), 2.0);
    acc += u_colorA * (lines * 0.9 + land + fr * 0.6) * (k == 0 ? 1.0 : 0.35);
  }
  return acc;
}
vec3 ring(vec3 ro, vec3 rd, float R, float tilt, float spd, float w) {
  // plane through the origin with a tilted normal; the ring is an annulus on it
  vec3 nrm = normalize(vec3(sin(tilt), cos(tilt), 0.3 * sin(tilt * 2.0)));
  float dn = dot(rd, nrm);
  if (abs(dn) < 1e-4) return vec3(0.0);
  float t = -dot(ro, nrm) / dn;
  if (t < 0.0) return vec3(0.0);
  vec3 p = ro + rd * t;
  float r = length(p);
  float band = smoothstep(w, w * 0.4, abs(r - R));
  vec3 u = normalize(cross(nrm, vec3(0.0, 0.0, 1.0)));
  float ang = atan(dot(p, cross(nrm, u)), dot(p, u)) + u_time * spd;
  float ticks = step(0.5, fract(ang * 18.0 / PI)) * 0.6 + 0.4;
  float gap = smoothstep(0.1, 0.2, abs(fract(ang / (2.0 * PI)) - 0.5));
  return mix(u_colorA, u_colorB, 0.5 + 0.5 * sin(ang)) * band * ticks * gap * 1.3;
}
vec3 panels(vec3 ro, vec3 rd) {
  // curved HUD panels on a cylinder of radius 1.9 around the globe
  float R = 1.9;
  float b = dot(ro.xz, rd.xz), a = dot(rd.xz, rd.xz), c = dot(ro.xz, ro.xz) - R * R;
  float h = b * b - a * c;
  if (h < 0.0) return vec3(0.0);
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float t = (-b + (k == 0 ? -1.0 : 1.0) * sqrt(h)) / a;
    if (t < 0.0) continue;
    vec3 p = ro + rd * t;
    float ang = atan(p.x, p.z) + u_time * 0.05;
    float sector = floor(ang / 0.9);
    float ux = fract(ang / 0.9), uy = p.y;
    float on = step(0.12, ux) * step(ux, 0.88) * step(abs(uy - 0.15 * sin(sector)), 0.42) * step(0.35, hash12(vec2(sector, 4.0)));
    if (on < 0.5) continue;
    vec2 q = vec2(ux, uy * 1.2);
    float frame = smoothstep(0.012, 0.0, min(min(abs(ux - 0.12), abs(ux - 0.88)), abs(abs(uy - 0.15 * sin(sector)) - 0.42)));
    float bars = step(fract(q.x * 14.0), 0.6) * step(q.y + 0.4, hash12(vec2(floor(q.x * 14.0), sector)) * 0.5 + 0.25 * sin(u_time * 1.5 + q.x * 9.0)) * u_data;
    float txt = step(0.55, hash12(floor(vec2(q.x * 40.0, q.y * 18.0)) + floor(u_time * 3.0))) * step(0.15, q.y) * step(q.y, 0.35) * u_data;
    float scan = smoothstep(0.02, 0.0, abs(fract(uy * 0.7 - u_time * 0.4) - 0.5)) * u_scan;
    acc += (u_colorA * (frame * 1.2 + bars * 0.5 + txt * 0.45) + u_colorB * scan * 0.4) * (k == 0 ? 1.0 : 0.4);
  }
  return acc;
}
vec3 floorGrid(vec3 ro, vec3 rd) {
  if (rd.y >= -0.001) return vec3(0.0);
  float t = (-1.1 - ro.y) / rd.y;
  vec3 p = ro + rd * t;
  float g = max(lineAA(p.x * 2.0, 0.015), lineAA(p.z * 2.0 + u_time * 0.4, 0.015));
  float fade = exp(-t * 0.18) * smoothstep(9.0, 2.0, length(p.xz));
  float pulse = smoothstep(0.08, 0.0, abs(length(p.xz) - fract(u_time * 0.3) * 6.0));
  return (u_colorA * g * 0.55 + u_colorB * pulse * 0.6) * fade;
}
void main() {
  P = u_progress;
  vec2 uv = shortUV();
  float a = P * 2.4 * u_cam + 0.4;
  float dist = mix(5.2, 3.3, eInOut(seg(P, 0.0, 0.6))) + mix(0.0, 0.6, eInOut(seg(P, 0.85, 1.0)));
  float y = mix(-0.2, 0.9, eInOut(seg(P, 0.0, 0.8)));
  vec3 ro = vec3(sin(a) * dist, y, cos(a) * dist);
  vec3 rd = camRay(uv, ro, vec3(0.0, 0.05, 0.0), 1.7, 0.0);
  vec3 col = u_colorC + u_colorA * 0.04 * smoothstep(1.0, 0.0, length(uv));
  float boot = eOut(seg(P, 0.03, 0.25)); // the hologram powers up
  col += floorGrid(ro, rd) * boot;
  col += globe(ro, rd, 0.9 * boot) * boot;
  col += ring(ro, rd, 1.25, 0.35, 0.6, 0.02) * seg(P, 0.12, 0.25);
  col += ring(ro, rd, 1.45, -0.6, -0.4, 0.015) * seg(P, 0.18, 0.32);
  col += ring(ro, rd, 1.05, 1.2, 0.9, 0.012) * seg(P, 0.24, 0.38);
  col += panels(ro, rd) * eOut(seg(P, 0.3, 0.5));
  // horizontal interference + flicker
  col *= 0.92 + 0.08 * sin(gl_FragCoord.y / MF_PX * 1.4 + u_time * 30.0) * u_scan;
  col *= 0.95 + 0.05 * step(0.97, hash12(vec2(floor(u_time * 20.0), 1.0)));
  col *= eOut(seg(P, 0.0, 0.04));
  fragColor = vec4(grade(col * 1.1, uv), 1.0);
}
`;

// ================================================================ 8. Abstract 3D Worlds
const ABSTRACT = `${HEAD}
// @heavy
// Abstract 3D Worlds — the camera flies through three procedural worlds:
// a forest of twisting monoliths, a lattice of rings, and a crystal field,
// each with its own light, palette and fog, joined by bright transitions.
uniform vec3 u_colorA;  // @color #ff7a3d | World 1 light
uniform vec3 u_colorB;  // @color #3dc8ff | World 2 light
uniform vec3 u_colorC;  // @color #ff4fd8 | World 3 light
uniform float u_speed;  // @ui 0 2 1 | Flight speed
uniform float u_cam;    // @ui 0 2 1 | Camera banking
uniform float u_fog;    // @ui 0 2 1 | Fog

float P;
float W; // 0..2 world blend
vec2 rep(vec2 p, float c) { return mod(p + 0.5 * c, c) - 0.5 * c; }
float rep(float x, float c) { return mod(x + 0.5 * c, c) - 0.5 * c; }
float world1(vec3 p) { // twisting monoliths
  vec2 id = floor((p.xz + 1.0) / 2.0);
  vec3 q = vec3(rep(p.xz, 2.0), p.y).xzy;
  q.xz *= rot(p.y * 0.6 + hash12(id) * 6.0);
  float h = 1.0 + hash12(id + 3.0) * 1.6;
  return sdRBox(q - vec3(0.0, h - 1.2, 0.0), vec3(0.22, h, 0.22), 0.05) * 0.7;
}
float world2(vec3 p) { // ring lattice
  vec3 q = vec3(rep(p.x, 2.2), p.y, rep(p.z, 2.2));
  q.xy *= rot(u_time * 0.2);
  float a = length(vec2(length(q.xy) - 0.75, q.z)) - 0.06;
  float b = length(vec2(length(q.yz) - 0.75, q.x)) - 0.05;
  return min(a, b);
}
float world3(vec3 p) { // crystals
  vec2 id = floor((p.xz + 0.8) / 1.6);
  vec3 q = vec3(rep(p.x, 1.6), p.y + 0.7 - hash12(id) * 0.5, rep(p.z, 1.6));
  q.xz *= rot(hash12(id + 9.0) * 6.0);
  q.xy *= rot(0.15);
  vec3 a = abs(q);
  float oct = (a.x + a.y * 0.6 + a.z - 0.4) * 0.577;
  return max(oct, -p.y - 1.4);
}
vec2 map(vec3 p) {
  float d1 = W < 1.2 ? world1(p) : 1e3;
  float d2 = W > 0.5 && W < 2.0 ? world2(p) : 1e3;
  float d3 = W > 1.3 ? world3(p) : 1e3;
  float k1 = clamp(1.0 - abs(W - 0.0), 0.0, 1.0), k2 = clamp(1.0 - abs(W - 1.0), 0.0, 1.0), k3 = clamp(1.0 - abs(W - 2.0), 0.0, 1.0);
  float d = 1e3;
  if (k1 > 0.0) d = min(d, d1 + (1.0 - k1) * 1.5);
  if (k2 > 0.0) d = min(d, d2 + (1.0 - k2) * 1.5);
  if (k3 > 0.0) d = min(d, d3 + (1.0 - k3) * 1.5);
  return vec2(d, 1.0);
}
${MARCH}
vec3 lightC() { return W < 1.0 ? mix(u_colorA, u_colorB, W) : mix(u_colorB, u_colorC, W - 1.0); }
void main() {
  P = u_progress;
  W = smoothstep(0.28, 0.38, P) + smoothstep(0.62, 0.72, P);
  vec2 uv = shortUV();
  float z = -u_time * 1.4 * u_speed;
  vec3 ro = vec3(sin(u_time * 0.3) * 0.45 * u_cam + mix(1.0, 0.8, smoothstep(1.2, 1.8, W)), -0.1 + 0.25 * sin(u_time * 0.4), z);
  // world 1/3 fly between pillars; avoid the cells' centres
  vec3 ta = ro + vec3(sin(u_time * 0.3 + 0.6) * 0.5 * u_cam, -0.05, -1.0);
  vec3 rd = camRay(uv, ro, ta, 1.5, sin(u_time * 0.35) * 0.18 * u_cam);
  vec3 L = lightC();
  vec3 fogC = L * 0.06 + 0.006;
  vec3 col = fogC;
  vec2 h = march(ro, rd, 22.0, 120);
  if (h.y > 0.0) {
    vec3 p = ro + rd * h.x;
    vec3 n = calcNormal(p);
    vec3 ld = normalize(vec3(0.4, 0.8, -0.6));
    float dif = max(dot(n, ld), 0.0);
    float glow = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);
    vec3 base = vec3(0.035) + L * 0.08;
    vec3 c = base * (0.2 + 1.4 * dif) + L * glow * 1.2;
    // emissive seams make each world read as designed, not foggy
    float seam = smoothstep(0.92, 1.0, abs(n.y)) * 0.0 + smoothstep(0.015, 0.0, abs(fract(p.y * 1.5 + p.x * 0.2) - 0.5) - 0.48);
    c += L * seam * 0.6;
    c += L * pow(max(dot(reflect(rd, n), ld), 0.0), 40.0);
    c *= calcAO(p, n);
    col = mix(c, fogC, 1.0 - exp(-h.x * 0.09 * u_fog));
  }
  // light shafts
  col += L * pow(max(0.0, dot(rd, normalize(vec3(0.3, 0.6, -1.0)))), 18.0) * 0.6;
  // transitions: white bloom between worlds
  float flash = exp(-pow((P - 0.33) * 60.0, 2.0)) + exp(-pow((P - 0.67) * 60.0, 2.0));
  col += mix(vec3(1.0), L, 0.3) * flash * 0.55;
  col *= eOut(seg(P, 0.0, 0.05)) * (1.0 - 0.6 * eIn(seg(P, 0.95, 1.0)));
  fragColor = vec4(grade(col, uv), 1.0);
}
`;

export const CINEMATIC_SHADERS_2: ShaderDef[] = [
  { id: 'cineFloatingUI', name: 'Floating App Interface (3D)', category: 'Cinematic 3D', kind: 'generator', blend: 'normal', source: FLOATING_UI, description: 'Glass app screens floating in deep space; your screenshots on them.' },
  { id: 'cineTypography', name: 'Cinematic Typography (3D)', category: 'Cinematic 3D', kind: 'generator', blend: 'normal', source: TYPOGRAPHY, description: 'Two monumental extruded words, macro camera and dimensional lighting.' },
  { id: 'cinePerfume', name: 'Luxury Perfume (3D)', category: 'Cinematic 3D', kind: 'generator', blend: 'normal', source: PERFUME, description: 'Glass flacon, gold cap, silk backdrop and a gliding highlight.' },
  { id: 'cineHoloUI', name: 'Holographic UI (3D)', category: 'Cinematic 3D', kind: 'generator', blend: 'normal', source: HOLO_UI, description: 'Wireframe hologram globe, data rings, curved HUD panels and grid floor.' },
  { id: 'cineAbstract', name: 'Abstract Worlds (3D)', category: 'Cinematic 3D', kind: 'generator', blend: 'normal', source: ABSTRACT, description: 'A flight through three procedural worlds joined by light transitions.' },
];

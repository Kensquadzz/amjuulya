// Cinematic 3D scenes, part 3: particles, watch, devices and event promo.
// Same conventions as cinematic.ts.
import type { ShaderDef } from './library';
import { HEAD, MARCH } from './cinematic';

// ================================================================ 9. Particle Brand Film
const PARTICLES = `${HEAD}
// @heavy
// Particle Brand Film — drifting sparks wake up, swirl in a vortex and lock
// into your brand mark; a shockwave fires, the mark ignites and sparks keep
// orbiting it. Particles are evaluated per pixel (deterministic at any time).
uniform sampler2D u_logo; // @glyph Montserrat:900 SPARK | Brand
uniform vec4 u_logoInfo;
uniform vec3 u_colorA;   // @color #ffb03a | Energy
uniform vec3 u_colorB;   // @color #3a6bff | Cool sparks
uniform vec3 u_colorC;   // @color #05040a | Darkness
uniform float u_density; // @ui 0.5 2 1 | Particle density
uniform float u_swirl;   // @ui 0 2 1 | Swirl
uniform float u_cam;     // @ui 0 2 1 | Camera drift

float P, S;
// where the spark that belongs at target q is, at assembly state k (1 = scattered)
vec2 noiseDisp(vec2 q, float k) {
  float t = u_time * 0.15;
  return (vec2(fbm(q * 1.4 + vec2(t, 3.1)), fbm(q * 1.4 + vec2(7.3, -t))) - 0.5) * 0.9 * k * u_swirl;
}
vec2 sparkPos(vec2 q, float k) { return rot(k * k * 2.8 * u_swirl) * q * (1.0 + k * k * 2.2) + noiseDisp(q, k); }
// inverse of sparkPos for a pixel (the spiral is inverted exactly, the noise by iteration)
vec2 sparkTarget(vec2 w, float k) {
  float sc = 1.0 + k * k * 2.2;
  mat2 ir = rot(-k * k * 2.8 * u_swirl);
  vec2 q = ir * w / sc;
  q = ir * (w - noiseDisp(q, k)) / sc;
  q = ir * (w - noiseDisp(q, k)) / sc;
  return q;
}
float logoD(vec2 q) { return glyphSDF(u_logo, u_logoInfo, q / S) * S; }
void main() {
  P = u_progress;
  S = fitW(0.82, 1.45) / max(u_logoInfo.z, 0.6);
  vec2 uv = shortUV();
  float zoom = mix(1.25, 1.0, eInOut(seg(P, 0.0, 0.7))) * (1.0 + 0.04 * eInOut(seg(P, 0.75, 1.0)));
  vec2 w = uv / zoom + vec2(sin(u_time * 0.2), cos(u_time * 0.17)) * 0.015 * u_cam;
  float a = eInOut(seg(P, 0.12, 0.66));
  float k = 1.0 - a;
  // nebula
  float neb = fbm(w * 2.0 + vec2(u_time * 0.02, 0.0));
  vec3 col = u_colorC + u_colorB * 0.12 * neb * neb + u_colorA * 0.05 * smoothstep(0.8, 0.0, length(w));
  // invert the (smooth) flow to find which target cells can land near this pixel
  vec2 q = sparkTarget(w, k);
  float cs = 0.0115 / u_density;
  vec2 id = floor(q / cs);
  float birth = seg(P, 0.0, 0.22);
  vec3 acc = vec3(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = id + vec2(float(i), float(j));
    vec2 rnd = hash22(c);
    vec2 target = (c + 0.5 + (rnd - 0.5) * 0.5) * cs;
    float inside = step(logoD(target), 0.0) * u_logoInfo.y;
    float ambient = step(0.93, hash12(c + 17.0)) * (1.0 - a * 0.85);
    float alive = max(inside, ambient) * step(hash12(c + 3.0), birth * 1.25);
    alive *= step(cs * 1.6, length(target)); // the vortex centre would pin one spark on screen
    if (alive <= 0.0) continue;
    float kk = k * (0.85 + 0.3 * rnd.x); // each spark arrives at its own moment
    vec2 pos = sparkPos(target, kk);
    float r = cs * (0.16 + 0.12 * rnd.y);
    float d = length(w - pos);
    // motion streak: where the spark was a moment ago
    vec2 prev = sparkPos(target, min(1.0, kk + 0.06));
    vec2 pa = w - pos, ba = prev - pos;
    float ds = length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0));
    float tw = 0.6 + 0.4 * sin(u_time * (3.0 + rnd.x * 5.0) + rnd.y * 30.0);
    vec3 tint = mix(u_colorA, u_colorB, inside > 0.5 ? rnd.x * 0.35 : 0.75);
    acc += tint * (smoothstep(r, r * 0.2, d) * 1.6 + exp(-d / (cs * 0.5)) * 0.35 + smoothstep(r * 0.9, 0.0, ds) * 0.5 * k) * tw * alive;
  }
  col += acc;
  // ignition: shockwave + the mark lights up and stays
  float g = logoD(w);
  float ign = eOut(seg(P, 0.66, 0.78));
  float fill = smoothstep(0.003, -0.003, g) * u_logoInfo.y;
  vec3 hot = mix(u_colorA, vec3(1.0), 0.35);
  col += hot * fill * ign * (0.55 + 0.25 * fbm(w * 8.0 + u_time * 0.3));
  col += u_colorA * exp(-abs(g) * 60.0) * ign * 0.9 * u_logoInfo.y;
  float wave = seg(P, 0.66, 0.8);
  col += mix(u_colorA, u_colorB, 0.5) * smoothstep(0.03, 0.0, abs(length(w) - wave * 1.6)) * (1.0 - wave) * 1.5 * step(0.002, wave);
  col += vec3(1.0) * exp(-pow((P - 0.665) * 70.0, 2.0)) * 0.8;
  col *= eOut(seg(P, 0.0, 0.05));
  fragColor = vec4(grade(col, uv), 1.0);
}
`;

// ================================================================ 10. Premium Watch Commercial
const WATCH = `${HEAD}
// @heavy
// Premium Watch — a steel chronometer with a sunburst dial, polished indices
// and sweeping hands, lit by a single spot. Macro passes over the crown and
// bezel, a grazing glide across the dial, then the pull-back hero.
uniform sampler2D u_brand; // @glyph Playfair Display:700 MERIDIAN | Name on the dial
uniform vec4 u_brandInfo;
uniform vec3 u_metal;   // @color #c9ced6 | Case metal
uniform vec3 u_dial;    // @color #0d2a4a | Dial
uniform vec3 u_accent;  // @color #ff5a3a | Seconds hand
uniform vec3 u_strap;   // @color #1a1410 | Strap
uniform float u_cam;    // @ui 0 2 1 | Camera movement
uniform float u_light;  // @ui 0 2 1 | Spot light

float P;
float T; // seconds shown by the hands

vec2 map(vec3 p) {
  // case: cylinder along z
  float cs = sdRCylY(p.xzy, 0.6, 0.085, 0.03);
  float bezel = length(vec2(length(p.xy) - 0.6, p.z - 0.07)) - 0.05;
  float crown = sdRCylY((p - vec3(0.67, 0.0, 0.0)).yxz, 0.06, 0.05, 0.015);
  vec3 lp = vec3(abs(p.x) - 0.3, abs(p.y) - 0.6, p.z + 0.01);
  float lugs = sdRBox(lp, vec3(0.07, 0.12, 0.05), 0.03);
  float metal = min(min(cs, bezel), min(crown, lugs));
  // strap curves away behind the case
  vec3 sp = p;
  float ay = abs(sp.y) - 0.7;
  sp.z += max(ay, 0.0) * max(ay, 0.0) * 0.55;
  float strap = sdRBox(vec3(sp.x, max(ay, 0.0) * 0.5 + 0.05, sp.z + 0.02), vec3(0.24, 1.0, 0.035), 0.03);
  strap = max(strap, -ay - 0.02);
  // hands and indices sit above the dial plane (z ~ 0.085)
  vec3 hp = p - vec3(0.0, 0.0, 0.1);
  float aS = -T * 2.0 * PI / 60.0;
  float aM = -(T / 60.0 + 10.0) * 2.0 * PI / 60.0;
  float aH = -(T / 3600.0 + 10.1667) * 2.0 * PI / 12.0;
  vec3 q = hp; q.xy *= rot(-aH);
  float hh = sdRBox(q - vec3(0.0, 0.15, 0.0), vec3(0.022, 0.17, 0.006), 0.008);
  q = hp; q.xy *= rot(-aM);
  float mh = sdRBox(q - vec3(0.0, 0.22, 0.01), vec3(0.015, 0.25, 0.005), 0.006);
  float ia = atan(p.x, p.y);
  float sector = floor(ia / (2.0 * PI / 12.0) + 0.5) * (2.0 * PI / 12.0);
  vec3 ip = p; ip.xy *= rot(sector);
  float idx = sdRBox(ip - vec3(0.0, 0.44, 0.09), vec3(0.016, 0.055, 0.006), 0.004);
  float polished = min(min(hh, mh), idx);
  q = hp; q.xy *= rot(-aS);
  float sh = sdRBox(q - vec3(0.0, 0.17, 0.02), vec3(0.006, 0.33, 0.003), 0.003);
  vec2 r = vec2(metal, 1.0);
  if (polished < r.x) r = vec2(polished, 3.0);
  if (sh < r.x) r = vec2(sh, 4.0);
  if (strap < r.x) r = vec2(strap, 5.0);
  return r;
}
${MARCH}
vec3 env(vec3 d) { return studio(d, vec3(1.0, 0.96, 0.9) * u_light, vec3(0.6, 0.7, 0.9), 0.4 + u_time * 0.1) + vec3(0.01); }
vec3 shade(vec3 p, vec3 rd, vec3 n, float m) {
  vec3 r = reflect(rd, n);
  vec3 L = normalize(vec3(-0.3, 0.6, 0.75));
  float spot = pow(max(dot(normalize(p - vec3(-1.2, 2.4, 3.0)) * -1.0, normalize(vec3(1.2, -2.4, -3.0))), 0.0), 30.0);
  vec3 c;
  if (m < 1.5) {
    // case: brushed steel; the dial is the recessed top face
    bool dial = n.z > 0.95 && length(p.xy) < 0.52 && p.z > 0.06;
    if (dial) {
      float a = atan(p.y, p.x);
      float sun = pow(abs(cos(a - 0.9 + u_time * 0.05)), 10.0); // sunburst sheen follows the light
      float grain = hash12(vec2(floor(a * 400.0), 1.0)) * 0.15;
      c = u_dial * (0.35 + 1.3 * sun + grain) * u_light;
      float s = 0.16 / max(u_brandInfo.z, 0.6);
      float g = glyphSDF(u_brand, u_brandInfo, (p.xy - vec2(0.0, 0.2)) / s) * s;
      c = mix(c, vec3(0.92), smoothstep(0.002, -0.002, g) * u_brandInfo.y);
      // crystal reflection over the dial
      c += env(r) * fres(dot(-rd, n), 0.04) * 0.7;
      return c;
    }
    c = env(r) * u_metal * fres(dot(-rd, n), 0.55) * 1.3;
  } else if (m < 3.5) c = env(r) * fres(dot(-rd, n), 0.8) * 1.6 + 0.05;
  else if (m < 4.5) c = u_accent * (0.3 + max(dot(n, L), 0.0)) + env(r) * 0.2;
  else {
    float stitch = smoothstep(0.012, 0.0, abs(abs(p.x) - 0.2)) * step(0.5, fract(p.y * 25.0));
    c = u_strap * (0.2 + max(dot(n, L), 0.0)) + env(r) * 0.06 + vec3(0.5, 0.45, 0.4) * stitch * 0.4;
  }
  c += pow(max(dot(r, L), 0.0), 200.0) * 2.5 * u_light;
  return c * (0.6 + 0.4 * calcAO(p, n)) * (0.7 + 0.6 * spot);
}
void main() {
  P = u_progress;
  T = 18.0 + u_time; // seconds hand sweeps in real time
  vec2 uv = shortUV();
  // 1 macro crown/bezel  2 grazing glide over the dial  3 pull back hero
  float k1 = eInOut(seg(P, 0.0, 0.3)), k2 = eInOut(seg(P, 0.28, 0.62)), k3 = eInOut(seg(P, 0.6, 0.9));
  vec3 ro = mix(vec3(1.05, 0.25, 0.25), vec3(0.6, -0.55, 0.45), k1);
  vec3 ta = mix(vec3(0.62, 0.0, 0.05), vec3(0.2, -0.2, 0.08), k1);
  ro = mix(ro, vec3(-0.65, 0.2, 0.42), k2);
  ta = mix(ta, vec3(-0.05, 0.05, 0.09), k2);
  ro = mix(ro, vec3(0.9 * u_cam, -0.55, 2.6), k3);
  ta = mix(ta, vec3(0.0, -0.05, 0.0), k3);
  ro.x += sin(u_time * 0.4) * 0.02 * u_cam;
  vec3 rd = camRay(uv, ro, ta, 1.9, 0.08 * sin(P * 3.0) * u_cam);
  vec3 col = vec3(0.012, 0.014, 0.02) + vec3(0.05, 0.06, 0.08) * smoothstep(0.9, 0.0, length(uv - vec2(-0.2, 0.25))) * u_light;
  vec2 h = march(ro, rd, 8.0, 130);
  if (h.y > 0.0) { vec3 p = ro + rd * h.x; col = shade(p, rd, calcNormal(p), h.y); }
  col *= eOut(seg(P, 0.0, 0.05));
  fragColor = vec4(grade(col, uv), 1.0);
}
`;

// ================================================================ 11. Floating Device Showcase
const DEVICES = `${HEAD}
// @heavy
// Floating Device Showcase — three phones with metal frames, camera bumps and
// lit screens float in a studio. The film starts inside the hero screen,
// pulls back past the camera bumps of the side phones and ends on a lineup.
uniform sampler2D u_screen1; // @image | Centre phone screen
uniform vec4 u_screen1Info;
uniform sampler2D u_screen2; // @image | Left phone screen
uniform vec4 u_screen2Info;
uniform sampler2D u_screen3; // @image | Right phone screen
uniform vec4 u_screen3Info;
uniform vec3 u_frame;   // @color #c8ccd4 | Frame metal
uniform vec3 u_colorA;  // @color #ff6b3d | Wallpaper A
uniform vec3 u_colorB;  // @color #6b3dff | Wallpaper B
uniform vec3 u_bg;      // @color #e9e6ef | Studio
uniform float u_cam;    // @ui 0 2 1 | Camera movement
uniform float u_float;  // @ui 0 2 1 | Float

float P;
const vec3 B = vec3(0.37, 0.78, 0.035);
vec3 devPos(int i) {
  float fi = float(i) - 1.0;
  vec3 p = vec3(fi * mix(0.95, 0.88, P), -abs(fi) * 0.08, -abs(fi) * mix(0.9, 0.35, eInOut(seg(P, 0.45, 0.85))));
  p.y += sin(u_time * 0.8 + fi * 2.0) * 0.03 * u_float;
  return p;
}
float devYaw(int i) {
  float fi = float(i) - 1.0;
  // side phones first show their backs, then turn to face the camera
  return fi * mix(2.4, 0.38, eInOut(seg(P, 0.4, 0.8))) + sin(u_time * 0.5 + fi) * 0.04 * u_float;
}
vec3 local(vec3 p, int i) { vec3 q = p - devPos(i); q.xz *= rot(devYaw(i)); return q; }
vec2 map(vec3 p) {
  vec2 r = vec2(1e3, -1.0);
  for (int i = 0; i < 3; i++) {
    vec3 q = local(p, i);
    float body = sdRBox(q, B, 0.07);
    float bump = sdRBox(q - vec3(-0.19, 0.55, -0.045), vec3(0.13, 0.15, 0.02), 0.05);
    float d = min(body, bump);
    if (d < r.x) r = vec2(d, float(i));
  }
  float floor_ = p.y + 1.05;
  return r.x < floor_ ? r : vec2(floor_, 9.0);
}
${MARCH}
vec3 wallpaper(vec2 uv, int i) {
  vec3 c = mix(u_colorA, u_colorB, smoothstep(0.0, 1.0, uv.y + 0.25 * sin(uv.x * 3.0 + float(i))));
  float blob = smoothstep(0.35, 0.0, length(uv - vec2(0.3 + 0.2 * float(i), 0.65)));
  c += vec3(1.0, 0.9, 0.8) * blob * 0.35;
  // clock and app grid
  vec2 g = uv * vec2(4.0, 6.0);
  vec2 cell = fract(g) - 0.5;
  float icon = smoothstep(0.02, -0.02, sdRect2(cell, vec2(0.28, 0.28 * 4.0 / 6.0 * 1.5), 0.1)) * step(uv.y, 0.55) * step(0.12, uv.y);
  c = mix(c, vec3(1.0) * 0.92, icon * 0.75);
  float clock = smoothstep(0.004, -0.004, sdRect2(uv - vec2(0.5, 0.8), vec2(0.22, 0.045), 0.02));
  return mix(c, vec3(1.0), clock * 0.9);
}
vec3 screen(vec2 uv, int i) {
  if (i == 1 && u_screen1Info.y > 0.5) return texture(u_screen1, uv).rgb;
  if (i == 0 && u_screen2Info.y > 0.5) return texture(u_screen2, uv).rgb;
  if (i == 2 && u_screen3Info.y > 0.5) return texture(u_screen3, uv).rgb;
  return wallpaper(uv, i);
}
vec3 env(vec3 d) { return u_bg * (0.5 + 0.5 * smoothstep(-0.5, 0.8, d.y)) + studio(d, vec3(1.0), vec3(0.9), 9.0) * 0.6; }
vec3 shadeDev(vec3 p, vec3 rd, vec3 n, int i) {
  vec3 q = local(p, i);
  vec3 qn = n; qn.xz *= rot(devYaw(i));
  vec3 r = reflect(rd, n);
  vec3 L = normalize(vec3(0.4, 0.8, 0.7));
  if (qn.z > 0.9) {
    vec2 suv = q.xy / (B.xy * 2.0 - 0.06) + 0.5;
    float inScreen = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
    float notch = smoothstep(0.003, -0.003, sdRect2(q.xy - vec2(0.0, 0.7), vec2(0.06, 0.016), 0.016));
    vec3 c = mix(vec3(0.01), screen(clamp(suv, 0.0, 1.0), i) * 1.1, inScreen * (1.0 - notch));
    return c + env(r) * fres(dot(-rd, n), 0.04) * 0.6;
  }
  if (qn.z < -0.9) {
    // glass back + camera lenses
    vec2 lp = q.xy - vec2(-0.19, 0.55);
    float lens = min(length(lp - vec2(-0.05, 0.06)), min(length(lp - vec2(-0.05, -0.07)), length(lp - vec2(0.07, 0.0)))) - 0.045;
    vec3 c = mix(u_frame * 0.25, vec3(0.02), smoothstep(0.003, -0.003, lens));
    c += env(r) * fres(dot(-rd, n), 0.08) * 0.8;
    return c + pow(max(dot(r, L), 0.0), 80.0);
  }
  // polished metal frame
  return env(r) * u_frame * fres(dot(-rd, n), 0.6) * 1.2 + pow(max(dot(r, L), 0.0), 120.0) * 1.5;
}
void main() {
  P = u_progress;
  vec2 uv = shortUV();
  float k1 = eInOut(seg(P, 0.0, 0.42)), k2 = eInOut(seg(P, 0.42, 0.85));
  vec3 ro = mix(vec3(0.05, 0.1, 0.55), vec3(-1.6 * u_cam, 0.5, 3.0), k1);
  vec3 ta = mix(vec3(0.0, 0.05, 0.0), vec3(0.0, 0.0, -0.3), k1);
  ro = mix(ro, vec3(0.35 * u_cam, 0.15, 3.5), k2);
  ta = mix(ta, vec3(0.0, -0.05, 0.0), k2);
  vec3 rd = camRay(uv, ro, ta, 1.8, 0.0);
  vec3 col = env(rd) * 0.75;
  vec2 h = march(ro, rd, 12.0, 120);
  if (h.y > 8.5) {
    vec3 p = ro + rd * h.x;
    vec3 n = vec3(0.0, 1.0, 0.0);
    vec3 rr = reflect(rd, n);
    vec2 h2 = march(p + n * 0.003, rr, 5.0, 64);
    vec3 refl = env(rr) * 0.7;
    if (h2.y > -0.5 && h2.y < 8.5) { vec3 p2 = p + rr * h2.x; refl = shadeDev(p2, rr, calcNormal(p2), int(h2.y + 0.5)); }
    float sh = softShadow(p + n * 0.01, normalize(vec3(0.2, 1.0, 0.3)), 5.0);
    col = mix(u_bg * 0.7 * (0.45 + 0.55 * sh), refl, 0.22);
    col = mix(col, env(rd) * 0.75, smoothstep(3.0, 9.0, h.x));
  } else if (h.y > -0.5) {
    vec3 p = ro + rd * h.x;
    col = shadeDev(p, rd, calcNormal(p), int(h.y + 0.5));
  }
  col *= eOut(seg(P, 0.0, 0.05));
  fragColor = vec4(grade(col, uv), 1.0);
}
`;

// ================================================================ 12. Futuristic Event Promo
const EVENT = `${HEAD}
// @heavy
// Futuristic Event Promo — a fast flight down a neon hexagon tunnel that
// opens into a laser-lit void; the event title slams in as dimensional neon
// type, beams sweep to the beat and the film closes on the title card.
uniform sampler2D u_title; // @glyph Montserrat:900 FUTURE 2026 | Event title
uniform vec4 u_titleInfo;
uniform vec3 u_colorA;  // @color #ff2bd6 | Neon A
uniform vec3 u_colorB;  // @color #2be4ff | Neon B
uniform vec3 u_colorC;  // @color #04020a | Void
uniform float u_bpm;    // @ui 60 160 124 | Beat (BPM)
uniform float u_speed;  // @ui 0 2 1 | Flight speed
uniform float u_lasers; // @ui 0 2 1 | Lasers

float P, S, OPEN, Z0;
float sdHex(vec2 p, float r) { p = abs(p); return max(p.x * 0.866 + p.y * 0.5, p.y) - r; }
float tunnel(vec3 p) {
  float cz = 1.2;
  float id = floor(p.z / cz + 0.5);
  float z = p.z - id * cz;
  vec2 q = p.xy * rot(id * 0.18 + u_time * 0.2);
  float R = 1.1 + OPEN * 6.0;
  float ring = abs(sdHex(q, R)) - 0.03;
  return length(vec2(max(ring, 0.0), z)) - 0.02;
}
float title(vec3 p) {
  float g = glyphSDF(u_title, u_titleInfo, p.xy / S) * S;
  return sdExtrude(g + 0.01, p.z, 0.08) - 0.01;
}
vec2 map(vec3 p) {
  float t = tunnel(p);
  float ti = title(p - vec3(0.0, 0.0, Z0));
  return t < ti ? vec2(t, 1.0) : vec2(ti, 2.0);
}
${MARCH}
void main() {
  P = u_progress;
  S = fitW(1.32, 2.1) / max(u_titleInfo.z, 0.6);
  OPEN = eInOut(seg(P, 0.42, 0.58));
  float beat = u_time * u_bpm / 60.0;
  float pulse = pow(1.0 - fract(beat), 6.0);
  vec2 uv = shortUV();
  // flight distance slows to a stop in front of the title
  float travel = mix(0.0, 34.0, 1.0 - pow(1.0 - seg(P, 0.0, 0.6), 2.0)) * u_speed;
  vec3 ro = vec3(0.0, 0.0, -travel);
  Z0 = -34.0 * u_speed - 2.6;
  ro.xy += vec2(sin(u_time * 1.3), cos(u_time * 1.1)) * 0.05 * (1.0 - OPEN);
  float slam = eExpo(seg(P, 0.56, 0.64));
  vec3 rd = camRay(uv, ro, ro + vec3(0.0, 0.0, -1.0), mix(1.4, 1.8, slam), sin(u_time * 0.4) * 0.1 * (1.0 - OPEN));
  vec3 col = u_colorC;
  // glow march: neon accumulates along the ray
  float t = 0.0;
  vec3 glow = vec3(0.0);
  float hit = -1.0;
  for (int i = 0; i < 100; i++) {
    vec3 p = ro + rd * t;
    float dT = tunnel(p);
    float idz = floor(p.z / 1.2 + 0.5);
    vec3 nc = mod(idz, 2.0) < 1.0 ? u_colorA : u_colorB;
    glow += nc * 0.0045 / (0.002 + dT * dT) * (0.5 + 0.8 * pulse) * exp(-t * 0.06);
    float d = min(dT, title(p - vec3(0.0, 0.0, Z0)));
    if (d < 0.001) { hit = d == dT ? 1.0 : 2.0; break; }
    t += max(d * 0.7, 0.01);
    if (t > 40.0) break;
  }
  col += glow * 0.02 * (1.0 - OPEN * 0.7);
  if (hit > 1.5) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 lp = p - vec3(0.0, 0.0, Z0);
    float g = glyphSDF(u_title, u_titleInfo, lp.xy / S) * S;
    float edge = smoothstep(0.02, 0.0, abs(g + 0.01)) * step(0.5, abs(n.z));
    vec3 face = vec3(0.02) + studio(reflect(rd, n), vec3(0.4), mix(u_colorA, u_colorB, 0.5), 9.0) * 0.5;
    vec3 neon = mix(u_colorA, u_colorB, smoothstep(-0.6, 0.6, lp.x));
    col = face + neon * (edge * 2.2 + (1.0 - abs(n.z)) * 0.9) * (0.75 + 0.5 * pulse);
  }
  // title backlight + lasers after the tunnel opens
  vec2 lo = uv - vec2(0.0, -0.05);
  float ang = atan(lo.x, lo.y);
  float sweep = sin(u_time * 0.9) * 0.6;
  float beams = 0.0;
  for (int b = 0; b < 6; b++) {
    float fb = float(b);
    float a0 = (fb - 2.5) * 0.32 + sweep * (mod(fb, 2.0) < 1.0 ? 1.0 : -1.0);
    beams += smoothstep(0.012, 0.0, abs(ang - a0)) * smoothstep(0.0, 0.6, length(lo));
  }
  vec3 beamC = mix(u_colorA, u_colorB, 0.5 + 0.5 * sin(u_time + ang * 3.0));
  col += beamC * beams * 0.55 * OPEN * u_lasers * (0.6 + 0.6 * pulse);
  col += mix(u_colorA, u_colorB, 0.5) * exp(-length(lo * vec2(0.6, 1.8)) * 3.0) * 0.35 * slam * (0.8 + 0.4 * pulse);
  // grid floor in the void
  if (rd.y < -0.02) {
    float tf = -1.0 / rd.y;
    vec2 gp = (ro + rd * tf).xz;
    vec2 gl = abs(fract(gp * 1.0) - 0.5);
    float grid = smoothstep(0.03 + fwidth(gp.x), 0.0, 0.5 - max(gl.x, gl.y)) * exp(-tf * 0.08);
    col += u_colorB * grid * 0.5 * OPEN;
  }
  col += vec3(1.0) * exp(-pow((P - 0.6) * 60.0, 2.0)) * 0.9; // slam flash
  col *= eOut(seg(P, 0.0, 0.03));
  fragColor = vec4(grade(col, uv), 1.0);
}
`;

export const CINEMATIC_SHADERS_3: ShaderDef[] = [
  { id: 'cineParticles', name: 'Particle Brand Film (3D)', category: 'Cinematic 3D', kind: 'generator', blend: 'normal', source: PARTICLES, description: 'Sparks swirl in a vortex, assemble into your brand and ignite.' },
  { id: 'cineWatch', name: 'Premium Watch (3D)', category: 'Cinematic 3D', kind: 'generator', blend: 'normal', source: WATCH, description: 'Steel watch with sunburst dial and sweeping hands; macro camera moves.' },
  { id: 'cineDevices', name: 'Floating Devices (3D)', category: 'Cinematic 3D', kind: 'generator', blend: 'normal', source: DEVICES, description: 'Three phones with your screens, camera bumps and a studio floor.' },
  { id: 'cineEvent', name: 'Futuristic Event (3D)', category: 'Cinematic 3D', kind: 'generator', blend: 'normal', source: EVENT, description: 'Neon hexagon tunnel, lasers on the beat and a dimensional title.' },
];

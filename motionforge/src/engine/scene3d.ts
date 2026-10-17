// Three.js scene framework for cinematic templates. A scene is code that
// builds a Three.js world once and then poses it for any (progress, time,
// params) — no hidden state — so preview, thumbnails and export render the
// same frame. Scenes render through the shared ModelHost renderer.
import type * as THREEType from 'three';

export type SceneParam =
  | { key: string; kind: 'float'; label: string; min: number; max: number; def: number }
  | { key: string; kind: 'color'; label: string; def: string }
  | { key: string; kind: 'text'; label: string; def: string }
  | { key: string; kind: 'image'; label: string; def: '' };

export interface SceneKit {
  THREE: typeof THREEType;
  RoundedBoxGeometry: typeof import('three/examples/jsm/geometries/RoundedBoxGeometry.js').RoundedBoxGeometry;
  toCreasedNormals: typeof import('three/examples/jsm/utils/BufferGeometryUtils.js').toCreasedNormals;
  MarchingCubes: typeof import('three/examples/jsm/objects/MarchingCubes.js').MarchingCubes;
  renderer: THREEType.WebGLRenderer;
  /** ask the host to redraw (async texture / font finished) */
  redraw: () => void;
}

export interface FrameState {
  /** 0..1 across the layer */
  p: number;
  /** seconds since the layer started */
  t: number;
  W: number;
  H: number;
  params: Record<string, number | string>;
}

export interface SceneInstance {
  /** fonts, pictures: resolved before an export starts */
  prepare(params: Record<string, number | string>): Promise<void>;
  /** pose and render the frame into the renderer's canvas (may use extra passes) */
  render(f: FrameState): void;
  dispose(): void;
}

export interface SceneDef {
  id: string;
  name: string;
  params: SceneParam[];
  create(kit: SceneKit): SceneInstance;
}

export const sceneDefaults = (d: SceneDef) => Object.fromEntries(d.params.map((p) => [p.key, p.def])) as Record<string, number | string>;

// ---------------------------------------------------------------- shared helpers for scenes

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const seg = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
/** 0 in portrait / square, 1 at 16:9 — tall subjects need the camera further back in landscape. */
export const landK = (W: number, H: number) => clamp01((W / H - 1) / 0.78);

/**
 * Smooth camera path: Catmull-Rom through keys [p, ...values]; between keys
 * the motion keeps its momentum (no stop at every waypoint).
 */
export function path(keys: number[][], p: number): number[] {
  const n = keys.length;
  if (p <= keys[0][0]) return keys[0].slice(1);
  if (p >= keys[n - 1][0]) return keys[n - 1].slice(1);
  let i = 0;
  while (i < n - 2 && p > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
  const u = (p - k1[0]) / (k2[0] - k1[0]);
  const out: number[] = [];
  for (let j = 1; j < k1.length; j++) {
    // tangents scaled to the segment length (non-uniform knots)
    const m1 = ((k2[j] - k0[j]) / (k2[0] - k0[0] || 1)) * (k2[0] - k1[0]);
    const m2 = ((k3[j] - k1[j]) / (k3[0] - k1[0] || 1)) * (k2[0] - k1[0]);
    const u2 = u * u, u3 = u2 * u;
    out.push((2 * u3 - 3 * u2 + 1) * k1[j] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2[j] + (u3 - u2) * m2);
  }
  return out;
}

/** Load a picture (data URL) into an <img>, resolving null on failure. */
export function loadImg(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

/** Wait for a web font so canvas-drawn labels use it. */
export async function fontReady(css: string, text = 'A') {
  try { await document.fonts?.load(css, text); } catch { /* fallback font */ }
}

/**
 * A photographic studio as an environment map: dark room, a large overhead
 * softbox, a tall key panel and two slim strip lights. Reflections of these
 * shapes are what make metal and glossy surfaces read as "product shot".
 */
export function studioEnv(kit: SceneKit, o: { key?: number; strips?: number; warm?: string; cool?: string; room?: string } = {}) {
  const { THREE, renderer } = kit;
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20), new THREE.MeshBasicMaterial({ color: o.room ?? '#141519', side: THREE.BackSide }));
  room.position.y = 4;
  s.add(room);
  const panel = (w: number, h: number, color: string, k: number, pos: [number, number, number], look: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    s.add(m);
  };
  const key = o.key ?? 1, strips = o.strips ?? 1;
  panel(6, 6, '#ffffff', 3.2 * key, [0, 7.5, 0.5], [0, 0, 0]); // overhead
  panel(3, 5, o.warm ?? '#fff1e2', 4.5 * key, [-5, 2.5, 4], [0, 1, 0]); // key
  panel(0.5, 7, o.cool ?? '#dfe9ff', 7 * strips, [6, 2.5, -1.5], [0, 1, 0]); // strip R
  panel(0.5, 7, '#ffffff', 6 * strips, [-6, 2.5, -2.5], [0, 1, 0]); // strip L
  panel(8, 1.2, '#ffffff', 1.2 * key, [0, 1.2, 9], [0, 1, 0]); // low front fill
  panel(7, 2.5, '#ffffff', 2.2 * key, [0, 5, -7], [0, 0, 0]); // high back panel: lights lids and rims
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  s.traverse((x) => { const m = x as THREEType.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREEType.Material).dispose(); } });
  return tex;
}

/** Soft contact shadow baked once from a top-down depth render (for static silhouettes). */
export function bakeContactShadow(kit: SceneKit, target: THREEType.Object3D, size: number, opacity: number, blur: number) {
  const { THREE, renderer } = kit;
  const res = 512;
  const rt = new THREE.WebGLRenderTarget(res, res);
  const rtB = new THREE.WebGLRenderTarget(res, res);
  const cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, 3);
  cam.rotation.x = Math.PI / 2; // look up from below
  const s = new THREE.Scene();
  const depthMat = new THREE.ShaderMaterial({
    vertexShader: 'varying float vz; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vz = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'varying float vz; void main(){ float a = clamp(1.0 - vz * 1.6, 0.0, 1.0); gl_FragColor = vec4(0.0,0.0,0.0,a*a); }',
    transparent: true, depthTest: false,
  });
  const clone = target.clone(true);
  clone.traverse((x) => { const m = x as THREEType.Mesh; if (m.isMesh) m.material = depthMat; });
  s.add(clone);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(s, cam);
  // two-pass gaussian blur
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;
      void main(){ vec4 c = vec4(0.0); float ws = 0.0; for (int i = -12; i <= 12; i++) { float w = exp(-float(i*i) / 50.0); c += texture2D(tex, vUv + dir * float(i)) * w; ws += w; } gl_FragColor = c / ws; }`,
    depthTest: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat);
  const qs = new THREE.Scene();
  qs.add(quad);
  const qc = new THREE.Camera();
  for (let k = 0; k < 2; k++) {
    blurMat.uniforms.tex.value = rt.texture; blurMat.uniforms.dir.value.set(blur / res, 0);
    renderer.setRenderTarget(rtB); renderer.clear(); renderer.render(qs, qc);
    blurMat.uniforms.tex.value = rtB.texture; blurMat.uniforms.dir.value.set(0, blur / res);
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(qs, qc);
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearAlpha(prevClear);
  rtB.dispose(); depthMat.dispose(); blurMat.dispose(); quad.geometry.dispose();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true, opacity, depthWrite: false }));
  plane.rotation.x = -Math.PI / 2;
  plane.scale.y = -1; // the depth camera looked up, flip back
  plane.renderOrder = 2;
  return { plane, dispose: () => { rt.dispose(); plane.geometry.dispose(); (plane.material as THREEType.Material).dispose(); } };
}

/**
 * Floor reflection without a blurry mirror: a y-flipped copy of `obj` whose
 * materials fade out with depth below the floor (strength in `amount.value`).
 */
export function fadedMirror(obj: THREEType.Object3D, amount: { value: number }, depth = 0.55) {
  const fade = (m: THREEType.Material) => {
    const c = m.clone();
    c.transparent = true;
    c.depthWrite = false;
    c.onBeforeCompile = (sh) => {
      sh.uniforms.uRefl = amount;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;').replace('#include <project_vertex>', '#include <project_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY;\nuniform float uRefl;')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>\ngl_FragColor.a *= smoothstep(-${depth.toFixed(3)}, 0.0, vWY) * uRefl;`);
    };
    return c;
  };
  const mirror = obj.clone(true);
  mirror.traverse((x) => { const m = x as THREEType.Mesh; if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(fade) : fade(m.material); });
  mirror.scale.y = -1;
  mirror.renderOrder = 1;
  return mirror;
}

/** Seamless value-noise smoke / cloud texture (generated once, cached per size). */
export function smokeTexture(kit: SceneKit, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  const img = x.createImageData(size, size);
  const hash = (i: number, j: number, s: number) => { const n = Math.sin(((i % s) + s) % s * 127.1 + ((j % s) + s) % s * 311.7 + s * 17.3) * 43758.5453; return n - Math.floor(n); };
  const noise = (u: number, v: number, s: number) => {
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const a = hash(i, j, s), b = hash(i + 1, j, s), cc = hash(i, j + 1, s), d = hash(i + 1, j + 1, s);
    const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
    return a + (b - a) * su + (cc - a) * sv + (a - b - cc + d) * su * sv;
  };
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let v = 0, amp = 0.5, f = 4;
    for (let o = 0; o < 5; o++) { v += amp * noise((px / size) * f, (py / size) * f, f); amp *= 0.5; f *= 2; }
    const dx = px / size - 0.5, dy = py / size - 0.5;
    const fall = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2); // soft round puff
    const a = Math.max(0, Math.min(1, (v - 0.35) * 2.2)) * fall * fall;
    const k = (py * size + px) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
    img.data[k + 3] = a * 255;
  }
  x.putImageData(img, 0, 0);
  const t = new kit.THREE.CanvasTexture(c);
  t.colorSpace = kit.THREE.SRGBColorSpace;
  return t;
}

/** Radial glow / star sprite textures for flares and glints. */
export function glowTexture(kit: SceneKit, kind: 'glow' | 'star' | 'rays', size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  const h = size / 2;
  if (kind === 'glow') {
    const g = x.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
  } else if (kind === 'star') {
    const g = x.createRadialGradient(h, h, 0, h, h, h * 0.35);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    for (const [w, l] of [[size * 0.012, h], [size * 0.006, h * 0.6]] as [number, number][]) {
      for (const ang of l === h ? [0, Math.PI / 2] : [Math.PI / 4, -Math.PI / 4]) {
        x.save(); x.translate(h, h); x.rotate(ang);
        const lg = x.createLinearGradient(-l, 0, l, 0);
        lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = lg; x.fillRect(-l, -w / 2, l * 2, w);
        x.restore();
      }
    }
  } else {
    x.translate(h, h);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2 + Math.sin(i * 12.9) * 0.05;
      const w = 0.02 + (Math.sin(i * 7.3) * 0.5 + 0.5) * 0.05;
      const g = x.createLinearGradient(0, 0, Math.cos(a) * h, Math.sin(a) * h);
      g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, h, a - w, a + w); x.closePath(); x.fill();
    }
  }
  const t = new kit.THREE.CanvasTexture(c);
  t.colorSpace = kit.THREE.SRGBColorSpace;
  return t;
}

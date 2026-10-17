// Three.js host for 3D model layers. Three.js is loaded on first use (its own
// chunk), renders each model layer into an offscreen WebGL canvas at the
// composition's full size, and the compositor draws that frame like any other
// 2D layer. Everything is set from the layer at time t (camera, rotation,
// animation clip time), so preview, thumbnails and export match frame for frame.
import type * as THREEType from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Env2D } from './draw2d';
import type { ModelLayer, Project } from './types';

type T = typeof THREEType;
interface Mods {
  THREE: T;
  GLTFLoader: typeof import('three/examples/jsm/loaders/GLTFLoader.js').GLTFLoader;
  RoomEnvironment: typeof import('three/examples/jsm/environments/RoomEnvironment.js').RoomEnvironment;
  RoundedBoxGeometry: typeof import('three/examples/jsm/geometries/RoundedBoxGeometry.js').RoundedBoxGeometry;
}

let modsP: Promise<Mods> | null = null;
function loadThree(): Promise<Mods> {
  modsP ??= Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/environments/RoomEnvironment.js'),
    import('three/examples/jsm/geometries/RoundedBoxGeometry.js'),
  ]).then(([THREE, g, r, rb]) => ({ THREE, GLTFLoader: g.GLTFLoader, RoomEnvironment: r.RoomEnvironment, RoundedBoxGeometry: rb.RoundedBoxGeometry }));
  return modsP;
}

interface Entry {
  key: string;
  scene: THREEType.Scene;
  pivot: THREEType.Group; // spin / tilt / float
  model: THREEType.Object3D | null;
  mixer: THREEType.AnimationMixer | null;
  clips: THREEType.AnimationClip[];
  action: THREEType.AnimationAction | null;
  actionClip: number;
  originals: Map<THREEType.Mesh, THREEType.Material | THREEType.Material[]>;
  override: THREEType.MeshStandardMaterial | null;
  key3: THREEType.DirectionalLight;
  hemi: THREEType.HemisphereLight;
  rimA: THREEType.PointLight;
  rimB: THREEType.PointLight;
  shadow: THREEType.Mesh;
  floorY: number;
  ready: boolean;
  error?: string;
  wait: Promise<void>;
}

/** Info about a loaded model, for the editor UI. */
export interface ModelInfo { ready: boolean; error?: string; clips: string[] }

export class ModelHost {
  private mods: Mods | null = null;
  private gl: THREEType.WebGLRenderer | null = null;
  private envMap: THREEType.Texture | null = null;
  private entries = new Map<string, Entry>();
  readonly canvas = document.createElement('canvas');

  constructor(private onReady: () => void) {}

  /** Start loading Three.js; true once it can render. */
  private ensure(): boolean {
    if (this.mods) return true;
    loadThree().then((m) => { this.mods = m; this.onReady(); }).catch(() => {});
    return false;
  }

  private renderer(): THREEType.WebGLRenderer {
    if (this.gl) return this.gl;
    const { THREE, RoomEnvironment } = this.mods!;
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    const pm = new THREE.PMREMGenerator(r);
    this.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    this.gl = r;
    return r;
  }

  info(l: ModelLayer): ModelInfo {
    const e = this.entries.get(l.id);
    return { ready: !!e?.ready, error: e?.error, clips: e?.clips.map((c, i) => c.name || `Clip ${i + 1}`) ?? [] };
  }

  /** Exports and thumbnails: load Three.js and every model before frame 0. */
  async prepare(p: Project) {
    const ls = p.layers.filter((l): l is ModelLayer => l.type === 'model3d');
    if (!ls.length) return;
    this.mods = await loadThree();
    this.renderer();
    await Promise.all(ls.map((l) => this.entry(l).wait));
    const bad = ls.map((l) => this.entries.get(l.id)?.error).find(Boolean);
    if (bad) throw new Error(`3D model could not be loaded: ${bad}`);
  }

  private keyOf(l: ModelLayer) { return `${l.src ? l.src.length + ':' + l.src.slice(-64) : l.primitive}|${l.texture.length}:${l.texture.slice(-32)}`; }

  private entry(l: ModelLayer): Entry {
    const key = this.keyOf(l);
    const old = this.entries.get(l.id);
    if (old && old.key === key) return old;
    if (old) this.disposeEntry(old);
    const { THREE } = this.mods!;
    const scene = new THREE.Scene();
    scene.environment = this.envMap;
    const pivot = new THREE.Group();
    scene.add(pivot);
    const key3 = new THREE.DirectionalLight(0xffffff, 2.5);
    key3.castShadow = true;
    key3.shadow.mapSize.set(2048, 2048);
    key3.shadow.radius = 6;
    key3.shadow.bias = -0.0005;
    const sc = key3.shadow.camera as THREEType.OrthographicCamera;
    sc.left = sc.bottom = -2; sc.right = sc.top = 2; sc.near = 0.1; sc.far = 12;
    scene.add(key3, key3.target);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.4);
    const rimA = new THREE.PointLight(0x7fb8ff, 0, 12);
    const rimB = new THREE.PointLight(0xff5ad8, 0, 12);
    rimA.position.set(-2.5, 1.2, -2);
    rimB.position.set(2.5, 0.6, -1.5);
    scene.add(hemi, rimA, rimB);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.5 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.receiveShadow = true;
    scene.add(shadow);
    const e: Entry = {
      key, scene, pivot, model: null, mixer: null, clips: [], action: null, actionClip: -2, originals: new Map(), override: null,
      key3, hemi, rimA, rimB, shadow, floorY: -1, ready: false, wait: Promise.resolve(),
    };
    this.entries.set(l.id, e);
    e.wait = (l.src ? this.loadGLB(l.src) : Promise.resolve(this.primitive(l)))
      .then((obj) => { if (this.entries.get(l.id) === e) this.attach(e, obj.scene, obj.clips); })
      .catch((err) => { e.error = String(err?.message ?? err); })
      .finally(() => { e.ready = true; this.onReady(); });
    return e;
  }

  private async loadGLB(src: string): Promise<{ scene: THREEType.Object3D; clips: THREEType.AnimationClip[] }> {
    const { GLTFLoader } = this.mods!;
    const buf = await (await fetch(src)).arrayBuffer();
    const gltf: GLTF = await new GLTFLoader().parseAsync(buf, '');
    return { scene: gltf.scene, clips: gltf.animations };
  }

  /** Normalise to a radius-1 model standing on the shadow plane. */
  private attach(e: Entry, obj: THREEType.Object3D, clips: THREEType.AnimationClip[]) {
    const { THREE } = this.mods!;
    const box = new THREE.Box3().setFromObject(obj);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const s = 1 / Math.max(1e-6, sphere.radius);
    const holder = new THREE.Group();
    obj.position.sub(sphere.center);
    holder.add(obj);
    holder.scale.setScalar(s);
    e.floorY = (box.min.y - sphere.center.y) * s - 0.002;
    obj.traverse((o) => {
      const m = o as THREEType.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; e.originals.set(m, m.material); }
    });
    e.pivot.add(holder);
    e.model = holder;
    e.clips = clips;
    if (clips.length) e.mixer = new THREE.AnimationMixer(obj);
  }

  // ---------------------------------------------------------------- built-in models
  private picture(src: string, fallback: (c: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
    const { THREE } = this.mods!;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d')!;
    fallback(x, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    if (src) {
      const img = new Image();
      img.onload = () => { x.clearRect(0, 0, w, h); const k = Math.max(w / img.naturalWidth, h / img.naturalHeight); x.drawImage(img, (w - img.naturalWidth * k) / 2, (h - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k); tex.needsUpdate = true; this.onReady(); };
      img.src = src;
    }
    return tex;
  }

  private primitive(l: ModelLayer): { scene: THREEType.Object3D; clips: THREEType.AnimationClip[] } {
    const { THREE, RoundedBoxGeometry } = this.mods!;
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xd9dde4, metalness: 1, roughness: 0.22 });
    if (l.primitive === 'phone') {
      g.add(new THREE.Mesh(new RoundedBoxGeometry(0.76, 1.56, 0.085, 6, 0.1), metal));
      const screen = this.picture(l.texture, (x, w, h) => {
        const gr = x.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, '#ff6b3d'); gr.addColorStop(1, '#6b3dff');
        x.fillStyle = gr; x.fillRect(0, 0, w, h);
        x.fillStyle = 'rgba(255,255,255,0.9)'; x.font = `600 ${w * 0.2}px Inter, sans-serif`; x.textAlign = 'center';
        x.fillText('9:41', w / 2, h * 0.2);
        for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 4; c2++) { x.globalAlpha = 0.85; x.beginPath(); x.roundRect?.(w * (0.1 + c2 * 0.21), h * (0.45 + r * 0.11), w * 0.15, w * 0.15, w * 0.04); x.fill(); }
        x.globalAlpha = 1;
      }, 1180, 2560);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.5), new THREE.MeshPhysicalMaterial({ map: screen, emissive: 0xffffff, emissiveMap: screen, emissiveIntensity: 0.45, roughness: 0.05, clearcoat: 1, metalness: 0 }));
      glass.position.z = 0.0435;
      g.add(glass);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.52), new THREE.MeshPhysicalMaterial({ color: 0x2a2d35, roughness: 0.35, clearcoat: 1 }));
      back.position.z = -0.0435; back.rotation.y = Math.PI;
      g.add(back);
      const bump = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.3, 0.03, 4, 0.06), new THREE.MeshPhysicalMaterial({ color: 0x1b1d22, roughness: 0.2, clearcoat: 1 }));
      bump.position.set(-0.18, 0.55, -0.055);
      g.add(bump);
      for (const [lx, ly] of [[-0.24, 0.6], [-0.24, 0.48], [-0.12, 0.54]]) {
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 32), new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.05, metalness: 0.5, clearcoat: 1 }));
        lens.rotation.x = Math.PI / 2; lens.position.set(lx, ly, -0.075);
        g.add(lens);
      }
    } else if (l.primitive === 'can') {
      const label = this.picture(l.texture, (x, w, h) => {
        x.fillStyle = '#ff3b5c'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#fff'; x.fillRect(0, h * 0.66, w, h * 0.06);
        x.font = `900 ${h * 0.32}px Montserrat, Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText('YOUR', w * 0.25, h * 0.42); x.fillText('BRAND', w * 0.75, h * 0.42);
      }, 2048, 1024);
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.36, 96, 1, true), new THREE.MeshPhysicalMaterial({ map: label, metalness: 0.35, roughness: 0.3, clearcoat: 0.6 })));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.1, 96), metal); top.position.y = 0.73; g.add(top);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.022, 16, 96), metal); rim.rotation.x = Math.PI / 2; rim.position.y = 0.78; g.add(rim);
      const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.37, 0.08, 96), metal); bot.position.y = -0.72; g.add(bot);
    } else if (l.primitive === 'knot') {
      g.add(new THREE.Mesh(new THREE.TorusKnotGeometry(0.6, 0.2, 320, 48), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08 })));
    } else if (l.primitive === 'sphere') {
      // pearl: iridescent clear-coated sphere (transmission would need a scene behind it to refract)
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 128, 64), new THREE.MeshPhysicalMaterial({ color: 0xf4f1ff, metalness: 0.1, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600], sheen: 0.6, sheenColor: new THREE.Color(0xc7b8ff) })));
    } else {
      g.add(new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 8, 0.14), new THREE.MeshPhysicalMaterial({ color: 0x6b3dff, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 })));
    }
    return { scene: g, clips: [] };
  }

  // ---------------------------------------------------------------- frame
  /** Draw layer `l` (already resolved at env.t) into the 2D compositor. */
  draw(ctx: CanvasRenderingContext2D, l: ModelLayer, env: Env2D) {
    if (!this.ensure()) { this.hint(ctx, env, 'Loading 3D…'); return; }
    const { THREE } = this.mods!;
    const r = this.renderer();
    const e = this.entry(l);
    if (!e.ready) { this.hint(ctx, env, 'Loading 3D model…'); return; }
    if (e.error) { this.hint(ctx, env, `3D model error: ${e.error}`); return; }
    const { W, H } = env;
    if (this.canvas.width !== W || this.canvas.height !== H) r.setSize(W, H, false);
    const local = Math.max(0, env.t - l.start);
    const D2R = Math.PI / 180;
    // model motion
    e.pivot.rotation.set(l.tiltX * D2R, (l.rotY + l.spin * local) * D2R, 0);
    e.pivot.position.y = Math.sin(local * 1.3) * 0.05 * l.float;
    e.shadow.position.y = e.floorY;
    (e.shadow.material as THREEType.ShadowMaterial).opacity = l.shadow;
    e.shadow.visible = l.shadow > 0.001;
    // GLB animation at an exact time
    if (e.mixer) {
      const want = l.clip >= 0 && l.clip < e.clips.length ? Math.round(l.clip) : -1;
      if (want !== e.actionClip) {
        e.mixer.stopAllAction();
        e.action = want >= 0 ? e.mixer.clipAction(e.clips[want]) : null;
        e.action?.play();
        e.actionClip = want;
      }
      if (e.action) e.mixer.setTime(local * l.clipSpeed);
    }
    // material override
    if (l.materialOverride) {
      e.override ??= new THREE.MeshStandardMaterial();
      e.override.color.set(l.color);
      e.override.metalness = l.metalness;
      e.override.roughness = l.roughness;
      for (const m of e.originals.keys()) m.material = e.override;
    } else for (const [m, mat] of e.originals) m.material = mat;
    // lights
    const night = l.env === 'night', soft = l.env === 'soft';
    e.scene.environmentIntensity = (night ? 0.25 : soft ? 0.8 : 1) * l.light;
    e.key3.intensity = (night ? 1.2 : soft ? 1.2 : 2.6) * l.light;
    e.key3.color.set(l.lightColor);
    e.key3.position.set(2.2, 4, 2.6);
    e.hemi.intensity = (soft ? 0.9 : 0.35) * l.light;
    e.rimA.intensity = e.rimB.intensity = night ? 9 * l.light : 0;
    r.toneMappingExposure = l.exposure;
    // camera on a sphere around the model, framed for portrait and landscape
    const cam = new THREE.PerspectiveCamera(l.fov, W / H, 0.05, 100);
    const vf = l.fov * D2R;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * (W / H));
    const dist = Math.max(0.2, l.distance) / Math.sin(Math.min(vf, hf) / 2);
    const az = l.orbit * D2R, el = l.elevation * D2R;
    cam.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    cam.lookAt(0, 0, 0);
    r.render(e.scene, cam);
    // composite the 3D frame with the layer's 2D transform
    ctx.save();
    ctx.translate(l.x * W, l.y * H);
    ctx.rotate((l.rotation * Math.PI) / 180);
    ctx.scale(l.scale, l.scale);
    ctx.drawImage(this.canvas, -W / 2, -H / 2, W, H);
    ctx.restore();
  }

  private hint(ctx: CanvasRenderingContext2D, env: Env2D, text: string) {
    if (!env.placeholders) return;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `500 ${28 * env.k}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(text.slice(0, 80), env.W / 2, env.H / 2);
    ctx.restore();
  }

  /** Drop scenes of layers that no longer exist. */
  sweep(ids: Set<string>) {
    for (const [id, e] of this.entries) if (!ids.has(id)) { this.disposeEntry(e); this.entries.delete(id); }
  }

  private disposeEntry(e: Entry) {
    e.mixer?.stopAllAction();
    e.scene.traverse((o) => {
      const m = o as THREEType.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v && typeof v === 'object' && 'isTexture' in v) (v as THREEType.Texture).dispose();
        mat.dispose();
      }
    });
    for (const mat of e.originals.values()) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
    e.override?.dispose();
  }

  dispose() {
    for (const e of this.entries.values()) this.disposeEntry(e);
    this.entries.clear();
    this.envMap?.dispose();
    this.gl?.dispose();
    this.gl?.forceContextLoss();
    this.gl = null;
  }
}

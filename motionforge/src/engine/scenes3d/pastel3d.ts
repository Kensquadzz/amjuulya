// Pastel 3D shots in the style of soft "clay + glossy plastic" product
// promos: a lilac/pink world lit by a bright window, glossy play-cursor
// triangles, floating notification cards, a big pill button that gets
// pressed, a marker drawing on paper, inflated 3D numbers, a comment bubble
// in the sky. One shot per layer, timed by the layer's own progress; `beats`
// (seconds into the shot, comma separated) lines the key moments up with the
// voice-over. Text on objects is drawn on canvases (works for Cyrillic).
import type * as T from 'three';
import { fontReady, glowTexture, loadImg, smokeTexture, studioEnv, type FrameState, type SceneDef, type SceneKit } from '../scene3d';

const fmt = (s: unknown) => String(s ?? '');
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
const eo = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const eo5 = (x: number) => 1 - Math.pow(1 - clamp(x), 5);
const eio = (x: number) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const back = (x: number) => { x = clamp(x); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** keyframes [t, ...values] with ease-in-out between them */
function keys(t: number, ks: number[][]) {
  if (t <= ks[0][0]) return ks[0].slice(1);
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) { const k = eio((t - ks[i - 1][0]) / Math.max(1e-3, ks[i][0] - ks[i - 1][0])); return ks[i].slice(1).map((v, j) => lerp(ks[i - 1][j + 1], v, k)); }
  return ks[ks.length - 1].slice(1);
}
const SHOTS = ['desk', 'phone', 'marker', 'button', 'number', 'sky'] as const;
const IMGS = 4;
const UI = 'Inter, Montserrat, "Helvetica Neue", Arial, sans-serif';

type Shot = { root: T.Group; update: (t: number, D: number, f: FrameState) => void };

export const pastel3d: SceneDef = {
  id: 'pastel3d',
  name: 'Pastel 3D shot',
  params: [
    { key: 'shot', kind: 'text', label: `Shot (${SHOTS.join(', ')})`, def: 'desk' },
    { key: 'title', kind: 'text', label: 'Main text', def: 'HR OFFICE' },
    { key: 'sub', kind: 'text', label: 'Supporting text', def: 'MASTER PACK' },
    { key: 'items', kind: 'text', label: 'Items (one per line)', def: 'Өргөдөл\nАлбан бичиг\nГэрээ\nТушаал' },
    { key: 'brand', kind: 'text', label: 'Brand', def: 'HR OFFICE MASTER PACK' },
    { key: 'beats', kind: 'text', label: 'Beats (seconds into the shot)', def: '' },
    { key: 'accent', kind: 'color', label: 'Violet', def: '#8b5cf6' },
    { key: 'accent2', kind: 'color', label: 'Pink', def: '#ff5fa2' },
    ...Array.from({ length: IMGS }, (_, i) => ({ key: `img${i + 1}`, kind: 'image' as const, label: `Document ${i + 1}`, def: '' as const })),
  ],
  create(kit: SceneKit) {
    const { THREE } = kit;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, 9 / 16, 0.02, 60);
    const env = studioEnv(kit, { room: '#e7d9ff', warm: '#fff0f8', cool: '#efe6ff', key: 1.1 });
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    const hemi = new THREE.HemisphereLight('#fff0fb', '#9b6bff', 0.55);
    const sun = new THREE.DirectionalLight('#fff4fb', 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 8;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    const sc = sun.shadow.camera as T.OrthographicCamera;
    sc.left = -3; sc.right = 3; sc.top = 3; sc.bottom = -3; sc.near = 0.1; sc.far = 20;
    const fill = new THREE.DirectionalLight('#ffd6f1', 0.8);
    scene.add(hemi, sun, sun.target, fill);
    const disposables: { dispose(): void }[] = [env];
    const glowTex = glowTexture(kit, 'glow'); disposables.push(glowTex);
    const smoke = smokeTexture(kit, 256); disposables.push(smoke);

    // ---------------------------------------------------------------- helpers
    const mat = (color: string, o: Partial<T.MeshPhysicalMaterialParameters> = {}) => { const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.22, sheen: 0.4, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.6, ...o }); disposables.push(m); return m; };
    const mesh = (g: T.BufferGeometry, m: T.Material, cast = true, recv = true) => { const x = new THREE.Mesh(g, m); x.castShadow = cast; x.receiveShadow = recv; disposables.push(g); return x; };
    const canvasTex = (w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d')!; draw(x);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; disposables.push(t);
      return { t, c, x };
    };
    const rrPath = (x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number) => { x.beginPath(); x.roundRect(X, Y, w, h, r); };
    const rrShape = (w: number, h: number, r: number) => {
      const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      return s;
    };
    /** a flat textured face with rounded corners (uv 0..1 over the box) */
    const face = (w: number, h: number, r: number, map: T.Texture, o: Partial<T.MeshStandardMaterialParameters> = {}) => {
      const g = new THREE.ShapeGeometry(rrShape(w, h, r), 16);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
      const m = new THREE.MeshStandardMaterial({ map, roughness: 0.42, metalness: 0, ...o }); disposables.push(m);
      return mesh(g, m, false, true);
    };
    const gradBg = (stops: [number, string][], glow?: [number, number, string]) => canvasTex(64, 512, (x) => {
      const g = x.createLinearGradient(0, 0, 0, 512); stops.forEach(([k, c]) => g.addColorStop(k, c)); x.fillStyle = g; x.fillRect(0, 0, 64, 512);
      if (glow) { const rg = x.createRadialGradient(32, glow[0] * 512, 0, 32, glow[0] * 512, glow[1] * 512); rg.addColorStop(0, glow[2]); rg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = rg; x.fillRect(0, 0, 64, 512); }
    }).t;
    /** glossy play-shaped cursor triangle */
    const cursorGeo = (() => {
      const s = new THREE.Shape(), R = 0.035, pts: [number, number][] = [[-0.09, 0.1], [0.12, 0], [-0.09, -0.1]];
      const corner = (i: number) => { const p = pts[i], a = pts[(i + 2) % 3], b = pts[(i + 1) % 3]; const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]); return { p, pa: [p[0] + (a[0] - p[0]) * R / da, p[1] + (a[1] - p[1]) * R / da], pb: [p[0] + (b[0] - p[0]) * R / db, p[1] + (b[1] - p[1]) * R / db] }; };
      const cs = [0, 1, 2].map(corner);
      s.moveTo(cs[0].pb[0], cs[0].pb[1]);
      for (let i = 1; i <= 3; i++) { const c = cs[i % 3]; s.lineTo(c.pa[0], c.pa[1]); s.quadraticCurveTo(c.p[0], c.p[1], c.pb[0], c.pb[1]); }
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.018, bevelSegments: 6, curveSegments: 10 });
      g.center(); disposables.push(g); return g;
    })();
    const cursor = (color: string, s = 1) => { const m = new THREE.Mesh(cursorGeo, mat(color, { roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 })); m.castShadow = true; m.scale.setScalar(s); return m; };
    const glow = (color: string, size: number, op = 0.6) => { const m = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op, fog: false }); disposables.push(m); const s = new THREE.Sprite(m); s.scale.set(size, size, 1); return s; };
    const imgs: (HTMLImageElement | null)[] = [];
    /** document page texture: the user's picture, or a drawn page */
    const docTex = (i: number, w = 512, h = 724) => canvasTex(w, h, (x) => {
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
      const list = imgs.filter(Boolean) as HTMLImageElement[], img = list.length ? list[i % list.length] : null;
      if (img) { const s = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / s, sh = h / s; x.drawImage(img, (img.naturalWidth - sw) / 2, 0, sw, sh, 0, 0, w, h); }
      else { x.fillStyle = '#e9e3f5'; for (let k = 0; k < 16; k++) x.fillRect(w * 0.12, h * (0.16 + k * 0.045), w * (0.76 - hash(i * 7 + k) * 0.3), h * 0.012); x.fillStyle = '#c4b5fd'; x.fillRect(w * 0.12, h * 0.08, w * 0.4, h * 0.03); }
    }).t;
    const paper = (i: number, w = 0.42, h = 0.594) => { const g = new THREE.Group(); const b = mesh(new THREE.BoxGeometry(w, 0.004, h), mat('#ffffff', { roughness: 0.8, clearcoat: 0, sheen: 0 })); g.add(b); const f = face(w, h, 0.004, docTex(i)); f.rotation.x = -Math.PI / 2; f.position.y = 0.0025; g.add(f); return g; };
    const notifTex = (title: string, sub: string, A: string, A2: string) => canvasTex(1000, 240, (x) => {
      const g = x.createLinearGradient(0, 0, 1000, 0); g.addColorStop(0, '#fbe7ff'); g.addColorStop(1, '#f1dcff'); rrPath(x, 0, 0, 1000, 240, 60); x.fillStyle = g; x.fill();
      const ig = x.createLinearGradient(40, 40, 200, 200); ig.addColorStop(0, A2); ig.addColorStop(1, A); rrPath(x, 40, 40, 160, 160, 40); x.fillStyle = ig; x.fill();
      x.fillStyle = '#fff'; x.beginPath(); x.moveTo(88, 72); x.lineTo(138, 72); x.lineTo(156, 90); x.lineTo(156, 168); x.lineTo(88, 168); x.closePath(); x.fill();
      x.fillStyle = A; for (let k = 0; k < 3; k++) x.fillRect(100, 104 + k * 18, 42 - k * 8, 7);
      x.textBaseline = 'middle'; x.fillStyle = '#2b1a4a'; x.font = `700 62px ${UI}`; x.fillText(title, 240, 96, 700);
      x.fillStyle = '#7b6a96'; x.font = `500 44px ${UI}`; x.fillText(sub, 240, 166, 700);
      x.fillStyle = '#a99bbf'; x.font = `500 36px ${UI}`; x.textAlign = 'right'; x.fillText('одоо', 960, 70);
    }).t;
    const notifCard = (title: string, sub: string, A: string, A2: string) => {
      const g = new THREE.Group();
      const b = mesh(new kit.RoundedBoxGeometry(0.62, 0.15, 0.03, 4, 0.012), mat('#f6e6ff', { roughness: 0.3, clearcoat: 0.8, transmission: 0, opacity: 1 }));
      g.add(b);
      const f = face(0.6, 0.144, 0.035, notifTex(title, sub, A, A2), { roughness: 0.3 }); f.position.z = 0.0155; g.add(f);
      return g;
    };
    const labelTex = (s: string, px: number, color: string, w = 2048, h = 512, weight = 800, fam = 'Montserrat') => canvasTex(w, h, (x) => {
      x.font = `${weight} ${px}px "${fam}", ${UI}`; const m = x.measureText(s).width; if (m > w * 0.94) x.font = `${weight} ${px * w * 0.94 / m}px "${fam}", ${UI}`;
      x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s, w / 2, h / 2);
    }).t;
    const label = (s: string, px: number, color: string, wWorld: number, o: { w?: number; h?: number; weight?: number; fam?: string } = {}) => {
      const w = o.w ?? 2048, h = o.h ?? 512, t = labelTex(s, px, color, w, h, o.weight ?? 800, o.fam ?? 'Montserrat');
      const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }); disposables.push(m);
      const g = new THREE.PlaneGeometry(wWorld, wWorld * h / w); disposables.push(g);
      return new THREE.Mesh(g, m);
    };
    let FONT: any = null;
    const text3d = (s: string, size: number, depth: number, m: T.Material) => {
      if (!FONT) return new THREE.Group();
      const TG = (kit as any).__TextGeometry;
      const g = new TG(s, { font: FONT, size, depth, curveSegments: 14, bevelEnabled: true, bevelThickness: depth * 0.55, bevelSize: size * 0.085, bevelSegments: 10 });
      g.center(); g.computeVertexNormals(); disposables.push(g);
      const x = new THREE.Mesh(g, m); x.castShadow = true; x.receiveShadow = true; return x;
    };
    const beatsOf = (prm: Record<string, unknown>, n: number, D: number) => { const b = fmt(prm.beats).split(',').map((v) => parseFloat(v)).filter((v) => isFinite(v)); while (b.length < n) b.push((D * (b.length + 1)) / (n + 1)); return b; };
    const itemsOf = (prm: Record<string, unknown>) => fmt(prm.items).split('\n').map((s) => s.trim()).filter(Boolean);

    // ---------------------------------------------------------------- shots
    const SHOT: Record<string, (prm: Record<string, unknown>) => Shot> = {
      // a bright pastel room: desk, laptop with the brand on screen, window glow; the camera pushes in to the screen
      desk(prm) {
        const A = fmt(prm.accent) || '#8b5cf6', A2 = fmt(prm.accent2) || '#ff5fa2';
        const root = new THREE.Group();
        scene.background = gradBg([[0, '#f3b6e6'], [1, '#c79bff']]);
        scene.fog = new THREE.Fog('#e9b9f3', 4, 11);
        const floor = mesh(new THREE.PlaneGeometry(30, 30), mat('#b28af5', { roughness: 0.7, clearcoat: 0.2 }), false, true); floor.rotation.x = -Math.PI / 2; root.add(floor);
        const wall = mesh(new THREE.PlaneGeometry(14, 6), mat('#e58bd0', { roughness: 0.9, clearcoat: 0 }), false, true); wall.position.set(0, 3, -2.6); root.add(wall);
        const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7), new THREE.MeshBasicMaterial({ color: '#f9cdee' })); win.position.set(0.3, 2.1, -2.58); root.add(win); disposables.push(win.geometry, win.material as T.Material);
        for (const xx of [-0.35, 0.95]) { const bar = mesh(new THREE.BoxGeometry(0.05, 1.7, 0.04), mat('#f3dcff')); bar.position.set(xx, 2.1, -2.56); root.add(bar); }
        const wg = glow('#ffd9f3', 4, 0.3); wg.position.set(0.3, 2.1, -2.4); root.add(wg);
        // desk
        const top = mesh(new kit.RoundedBoxGeometry(2.6, 0.06, 1.0, 4, 0.02), mat('#f7eefe', { roughness: 0.3, clearcoat: 0.8 })); top.position.set(0, 0.95, -0.5); root.add(top);
        for (const [lx, lz] of [[-1.2, -0.05], [1.2, -0.05], [-1.2, -0.95], [1.2, -0.95]]) { const leg = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.92, 16), mat('#efe6ff', { metalness: 0.4, roughness: 0.25 })); leg.position.set(lx, 0.46, lz); root.add(leg); }
        // laptop
        const lap = new THREE.Group(); lap.position.set(0, 0.98, -0.55); root.add(lap);
        const base = mesh(new kit.RoundedBoxGeometry(0.64, 0.024, 0.44, 4, 0.01), mat('#eee6f7', { metalness: 0.55, roughness: 0.3 })); lap.add(base);
        const kb = mesh(new THREE.PlaneGeometry(0.56, 0.2), mat('#d9cde8', { roughness: 0.6 })); kb.rotation.x = -Math.PI / 2; kb.position.set(0, 0.0125, -0.04); lap.add(kb);
        const lid = new THREE.Group(); lid.position.set(0, 0.012, -0.22); lid.rotation.x = -0.28; lap.add(lid);
        const lidB = mesh(new kit.RoundedBoxGeometry(0.64, 0.42, 0.014, 4, 0.008), mat('#eee6f7', { metalness: 0.55, roughness: 0.3 })); lidB.position.y = 0.21; lid.add(lidB);
        const screenTex = canvasTex(1280, 840, (x) => {
          const g = x.createLinearGradient(0, 0, 0, 840); g.addColorStop(0, '#fff7fd'); g.addColorStop(1, '#f3e6ff'); x.fillStyle = g; x.fillRect(0, 0, 1280, 840);
          x.fillStyle = '#efe4fb'; x.fillRect(0, 0, 1280, 70); x.fillStyle = '#d7c6f0'; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(40 + i * 34, 35, 11, 0, 7); x.fill(); }
          x.textAlign = 'center'; x.textBaseline = 'middle';
          const tg = x.createLinearGradient(300, 0, 980, 0); tg.addColorStop(0, A2); tg.addColorStop(1, A);
          x.fillStyle = tg; x.font = `900 120px Montserrat, ${UI}`; x.fillText(fmt(prm.title) || 'HR OFFICE', 640, 330, 1100);
          x.fillStyle = '#7c6a99'; x.font = `600 46px Montserrat, ${UI}`; (x as any).letterSpacing = '14px'; x.fillText(fmt(prm.sub) || 'MASTER PACK', 647, 430); (x as any).letterSpacing = '0px';
          rrPath(x, 490, 520, 300, 96, 48); const bg = x.createLinearGradient(490, 0, 790, 0); bg.addColorStop(0, A2); bg.addColorStop(1, A); x.fillStyle = bg; x.fill();
          x.fillStyle = '#fff'; x.font = `700 44px ${UI}`; x.fillText('Татах', 640, 569);
        });
        const scr = face(0.6, 0.38, 0.01, screenTex.t, { emissive: new THREE.Color('#ffffff'), emissiveMap: screenTex.t, emissiveIntensity: 0.55, roughness: 0.15 }); scr.position.set(0, 0.21, 0.0075); lid.add(scr);
        // props
        const cup = mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.15, 32), mat(A2, { roughness: 0.3 })); cup.position.set(0.72, 1.055, -0.62); root.add(cup);
        ['#7c3aed', '#22d3ee', '#f43f5e', '#facc15', '#a3e635'].forEach((c, i) => { const pen = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 10), mat(c)); pen.position.set(0.72 + Math.cos(i * 1.3) * 0.025, 1.14, -0.62 + Math.sin(i * 1.3) * 0.025); pen.rotation.set(Math.cos(i * 2) * 0.25, 0, Math.sin(i * 2.4) * 0.25); root.add(pen); });
        const mug = mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 32), mat('#ffffff', { roughness: 0.2 })); mug.position.set(-0.66, 1.03, -0.42); root.add(mug);
        const handle = mesh(new THREE.TorusGeometry(0.03, 0.009, 12, 24), mat('#ffffff', { roughness: 0.2 })); handle.position.set(-0.6, 1.03, -0.42); handle.rotation.y = Math.PI / 2; root.add(handle);
        const phones = mesh(new THREE.TorusGeometry(0.11, 0.022, 16, 40, Math.PI * 1.3), mat('#ff4d6d', { roughness: 0.3 })); phones.position.set(-0.9, 0.995, -0.7); phones.rotation.x = -Math.PI / 2; root.add(phones);
        const notebook = paper(0, 0.3, 0.42); notebook.position.set(-0.45, 0.985, -0.2); notebook.rotation.y = 0.35; root.add(notebook);
        const cur = cursor(A, 0.55); root.add(cur);
        const cur2 = cursor(A2, 0.4); root.add(cur2);
        return {
          root,
          update(t, D) {
            const k = eio(seg(t, 0, D)), whip = 1 - eo5(seg(t, 0, 0.45));
            const [px, py, pz, lx, ly, lz] = keys(t / D, [[0, 0.35, 1.9, 2.2, 0, 1.45, -1.0], [0.55, 0.12, 1.45, 1.5, 0, 1.2, -0.7], [1, 0.02, 1.22, 0.85, 0, 1.18, -0.68]]);
            cam.fov = 38; cam.position.set(px + whip * 0.9, py + whip * 0.3, pz + whip * 0.6); cam.lookAt(lx, ly, lz);
            cam.rotation.z += whip * 0.12 + Math.sin(t * 1.3) * 0.004;
            cur.position.set(0.24 - 0.12 * k, 1.2 + Math.sin(t * 2.2) * 0.015, -0.3); cur.rotation.set(0.15, -0.35 + Math.sin(t) * 0.2, -0.25);
            cur2.position.set(-0.42 + 0.08 * k, 1.36 + Math.cos(t * 2) * 0.02, -0.85); cur2.rotation.set(-0.2, 0.6 + t * 0.5, 0.3);
            sun.position.set(-1.5, 4, 2.5); sun.target.position.set(0, 1, -0.5);
          },
        };
      },
      // phone on a lilac table, notification cards pop out of it on the beats, cursors fly across
      phone(prm) {
        const A = fmt(prm.accent) || '#8b5cf6', A2 = fmt(prm.accent2) || '#ff5fa2';
        const root = new THREE.Group();
        scene.background = gradBg([[0, '#a77bff'], [1, '#d3a8ff']]);
        scene.fog = null;
        const table = mesh(new THREE.PlaneGeometry(12, 12), mat('#b38af7', { roughness: 0.5, clearcoat: 0.35 }), false, true); table.rotation.x = -Math.PI / 2; root.add(table);
        const ph = new THREE.Group(); root.add(ph);
        const body = mesh(new kit.RoundedBoxGeometry(0.36, 0.035, 0.74, 6, 0.016), mat('#ff3d6e', { roughness: 0.25, clearcoat: 1 })); body.position.y = 0.0175; ph.add(body);
        const lock = canvasTex(500, 1030, (x) => {
          const g = x.createLinearGradient(0, 0, 0, 1030); g.addColorStop(0, '#ff6b8f'); g.addColorStop(0.6, '#e11d48'); g.addColorStop(1, '#9f1239'); x.fillStyle = g; x.fillRect(0, 0, 500, 1030);
          x.fillStyle = '#000'; rrPath(x, 180, 22, 140, 40, 20); x.fill();
          x.fillStyle = 'rgba(255,255,255,0.92)'; x.textAlign = 'center'; x.font = `600 34px ${UI}`; x.fillText('Даваа, 10 сарын 20', 250, 150);
          x.font = `700 170px ${UI}`; x.fillText('9:41', 250, 320);
        });
        const screen = face(0.335, 0.715, 0.04, lock.t, { emissive: new THREE.Color('#ffffff'), emissiveMap: lock.t, emissiveIntensity: 0.4, roughness: 0.1 }); screen.rotation.x = -Math.PI / 2; screen.position.y = 0.0356; ph.add(screen);
        ph.rotation.y = -0.35;
        const p1 = paper(0); p1.position.set(0.55, 0, 0.1); p1.rotation.y = 0.5; root.add(p1);
        const p2 = paper(1); p2.position.set(-0.58, 0.003, -0.32); p2.rotation.y = -0.4; root.add(p2);
        const speaker = mesh(new kit.RoundedBoxGeometry(0.2, 0.2, 0.2, 4, 0.04), mat('#ff5a3c', { roughness: 0.4 })); speaker.position.set(-0.55, 0.1, 0.45); root.add(speaker);
        const cone = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 32), mat('#ffd34d')); cone.position.set(-0.55, 0.205, 0.45); root.add(cone);
        const cupT = mesh(new THREE.CylinderGeometry(0.08, 0.075, 0.18, 32), mat('#ff9bd2')); cupT.position.set(0.5, 0.09, -0.55); root.add(cupT);
        ['#1f2937', '#7c3aed', '#22d3ee', '#ef4444', '#111827', '#f59e0b'].forEach((c, i) => { const pen = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 10), mat(c)); const a = i * 1.05; pen.position.set(0.5 + Math.cos(a) * 0.03, 0.26, -0.55 + Math.sin(a) * 0.03); pen.rotation.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45); root.add(pen); });
        const items = itemsOf(prm).slice(0, 4);
        const cards = items.map((it, i) => { const c = notifCard(it, i === 0 ? 'Загвар бэлэн боллоо' : 'Шинэ загвар нэмэгдлээ', A, A2); root.add(c); return c; });
        const curs = [cursor(A, 1.3), cursor('#a78bfa', 0.9), cursor(A2, 0.8)]; curs.forEach((c) => root.add(c));
        const homes = [[-0.05, 0.42, 0.18, -0.25], [0.22, 0.58, -0.02, 0.2], [-0.2, 0.74, -0.2, -0.15], [0.12, 0.9, -0.38, 0.18]];
        return {
          root,
          update(t, D) {
            const B = beatsOf(prm, cards.length, D);
            const whip = 1 - eo5(seg(t, 0, 0.4)), k = t / D;
            const ang = -0.55 + 0.45 * eio(k), dist = lerp(2.0, 1.45, eio(k));
            cam.fov = 40;
            cam.position.set(Math.sin(ang) * dist * 0.55 + whip * 0.7, lerp(1.85, 1.6, k) + whip * 0.5, Math.cos(ang) * dist * 0.62);
            cam.lookAt(0, 0.35, -0.02);
            cam.rotation.z += -0.25 + whip * 0.3;
            cards.forEach((c, i) => {
              const a = back(seg(t, B[i] - 0.05, B[i] + 0.45)), h = homes[i];
              c.visible = a > 0.001;
              c.scale.setScalar(Math.max(0.001, a));
              c.position.set(lerp(0, h[0], eo(a)), lerp(0.05, h[1], eo(a)) + Math.sin(t * 1.6 + i) * 0.012, lerp(0, h[2], eo(a)));
              c.rotation.set(-0.9 + Math.sin(t + i) * 0.04, h[3] - 0.35, 0.05 * Math.sin(t * 1.2 + i));
            });
            curs.forEach((c, i) => { const q = (t * (0.25 + i * 0.07) + i * 0.33) % 1; c.position.set(lerp(-0.9, 0.9, q) * (i % 2 ? -1 : 1), 0.5 + i * 0.18 + Math.sin(t * 2 + i) * 0.04, lerp(0.5, -0.4, q)); c.rotation.set(t * 0.8 + i, t * 1.1 + i * 2, 0.4); });
            sun.position.set(-2, 4.5, 1.5); sun.target.position.set(0, 0, 0);
          },
        };
      },
      // a marker writes on a sheet: soft grey world, pink and blue plastic
      marker(prm) {
        const A2 = fmt(prm.accent2) || '#ff5fa2';
        const root = new THREE.Group();
        scene.background = gradBg([[0, '#f4f4f7'], [1, '#d9d9e2']]);
        scene.fog = new THREE.Fog('#ececf2', 2.2, 6);
        const desk = mesh(new THREE.PlaneGeometry(12, 12), mat('#e9e9ee', { roughness: 0.65, clearcoat: 0.1 }), false, true); desk.rotation.x = -Math.PI / 2; root.add(desk);
        // the sheet with a sketch, the line is drawn into its canvas as the marker moves
        const sheetC = canvasTex(1024, 1448, () => {});
        const sheet = mesh(new THREE.BoxGeometry(0.84, 0.004, 1.19), mat('#ffffff', { roughness: 0.85, clearcoat: 0 })); sheet.position.y = 0.002; root.add(sheet);
        const sf = face(0.84, 1.19, 0.004, sheetC.t, { roughness: 0.85 }); sf.rotation.x = -Math.PI / 2; sf.position.y = 0.0045; root.add(sf);
        const P: [number, number][] = [];
        for (let i = 0; i <= 140; i++) { const u = i / 140; P.push([0.18 + 0.64 * u + 0.05 * Math.sin(u * 19), 0.56 + 0.12 * Math.sin(u * 7.5) + 0.06 * Math.cos(u * 23)]); }
        const drawSheet = (k: number) => {
          const x = sheetC.x, w = 1024, h = 1448;
          x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
          x.strokeStyle = 'rgba(80,80,95,0.22)'; x.lineWidth = 3; x.lineCap = 'round';
          for (let i = 0; i < 9; i++) { x.beginPath(); const y = 180 + i * 46; x.moveTo(110, y); x.lineTo(110 + 380 + hash(i) * 300, y + hash(i + 3) * 8); x.stroke(); }
          for (let i = 0; i < 5; i++) { x.strokeRect(120 + i * 160, 1080, 120, 120); }
          x.fillStyle = 'rgba(80,80,95,0.4)'; x.font = `700 46px Montserrat, ${UI}`; x.fillText(fmt(prm.title) || 'ГЭРЭЭ', 110, 120);
          const n = Math.floor(k * (P.length - 1));
          if (n > 0) { x.strokeStyle = '#2b2b33'; x.lineWidth = 16; x.lineJoin = 'round'; x.beginPath(); x.moveTo(P[0][0] * w, P[0][1] * h); for (let i = 1; i <= n; i++) x.lineTo(P[i][0] * w, P[i][1] * h); x.stroke(); }
          sheetC.t.needsUpdate = true;
        };
        // marker: gradient barrel, pink cap at the back, dark felt tip
        const barrel = canvasTex(64, 512, (x) => { const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#7aa7ff'); g.addColorStop(0.55, '#c084fc'); g.addColorStop(1, A2); x.fillStyle = g; x.fillRect(0, 0, 64, 512); });
        const mk = new THREE.Group(); root.add(mk);
        const bm = new THREE.MeshPhysicalMaterial({ map: barrel.t, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }); disposables.push(bm);
        const bar = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.5, 40), bm); bar.position.y = 0.32; mk.add(bar);
        const neck = mesh(new THREE.CylinderGeometry(0.036, 0.02, 0.06, 40), mat(A2, { roughness: 0.3 })); neck.position.y = 0.04 + 0.0; mk.add(neck);
        const tip = mesh(new THREE.ConeGeometry(0.014, 0.04, 24), mat('#202028', { roughness: 0.8, clearcoat: 0 })); tip.rotation.x = Math.PI; tip.position.y = 0.0; mk.add(tip);
        const capE = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 40), mat(A2, { roughness: 0.25, clearcoat: 1 })); capE.position.y = 0.6; mk.add(capE);
        neck.position.y = 0.05; bar.position.y = 0.33;
        mk.children.forEach((c) => { c.position.y += 0.02; });
        // clips and pens around
        const clipM = mat('#ff3b5c', { roughness: 0.3, metalness: 0.2 });
        [[-0.55, 0.35, 0.4], [-0.62, 0.48, -0.3], [0.6, -0.5, 1.2]].forEach(([x, z, r]) => { const c = mesh(new THREE.TorusGeometry(0.05, 0.008, 10, 32), clipM); c.scale.set(1, 2.1, 1); c.rotation.set(-Math.PI / 2, 0, r); c.position.set(x, 0.01, z); root.add(c); });
        ['#3b82f6', '#a855f7', '#ef4444', '#64748b'].forEach((c, i) => { const pen = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 12), mat(c)); pen.rotation.set(0, 0, Math.PI / 2); pen.rotation.y = 0.3 + i * 0.12; pen.position.set(0.15 - i * 0.04, 0.012, -0.85 - i * 0.05); root.add(pen); });
        return {
          root,
          update(t, D) {
            const k = seg(t, 0.15, D * 0.92);
            drawSheet(k);
            const n = Math.min(P.length - 1, Math.floor(k * (P.length - 1))), [u, v] = P[n];
            const tx = (u - 0.5) * 0.84, tz = (v - 0.5) * 1.19;
            mk.position.set(tx, 0.006, tz); mk.rotation.set(-0.25 + Math.sin(t * 9) * 0.03, 0, -0.55 + Math.cos(t * 7) * 0.04);
            const whip = 1 - eo5(seg(t, 0, 0.35));
            cam.fov = 40;
            cam.position.set(tx * 0.5 - 0.15 + whip * 0.6, 1.05 - 0.12 * (t / D) + whip * 0.3, tz * 0.5 + 1.15 + whip * 0.4);
            cam.lookAt(tx * 0.6, 0.12, tz * 0.6 - 0.05);
            cam.rotation.z += -0.12 - whip * 0.2;
            sun.position.set(-1.2, 3.5, 1.8); sun.target.position.set(0, 0, 0);
          },
        };
      },
      // a big lilac pill button, a cursor presses it, documents fly out
      button(prm) {
        const A = fmt(prm.accent) || '#8b5cf6', A2 = fmt(prm.accent2) || '#ff5fa2';
        const root = new THREE.Group();
        scene.background = gradBg([[0, '#ffd9ee'], [1, '#e2c2ff']]);
        scene.fog = new THREE.Fog('#f4d6f6', 2.5, 7);
        const floor = mesh(new THREE.PlaneGeometry(12, 12), mat('#e9b8e9', { roughness: 0.45, clearcoat: 0.4 }), false, true); floor.rotation.x = -Math.PI / 2; root.add(floor);
        // keyboard keys behind, warm coral
        const keyM = mat('#ff8a7a', { roughness: 0.4 });
        for (let r = 0; r < 4; r++) for (let q = 0; q < 12; q++) { const kk = mesh(new kit.RoundedBoxGeometry(0.16, 0.06, 0.16, 3, 0.02), keyM); kk.position.set(-1.0 + q * 0.19 + (r % 2) * 0.05, 0.03, -0.9 - r * 0.19); root.add(kk); }
        const plate = mesh(new THREE.ExtrudeGeometry(rrShape(1.5, 0.5, 0.25), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4 }), mat('#b48cf0', { roughness: 0.35 }));
        plate.rotation.x = -Math.PI / 2; plate.position.y = 0.0;
        const btn = new THREE.Group(); btn.scale.setScalar(0.62); btn.add(plate); root.add(btn);
        const capG = new THREE.Group(); btn.add(capG);
        const cap = mesh(new THREE.ExtrudeGeometry(rrShape(1.36, 0.4, 0.2), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 8, curveSegments: 24 }), mat('#d6b4ff', { roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06 }));
        cap.rotation.x = -Math.PI / 2; capG.add(cap);
        const lab = canvasTex(1360, 400, (x) => {
          x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `800 220px Montserrat, ${UI}`;
          x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillText(fmt(prm.title) || 'Татах', 676, 192);
          const g = x.createLinearGradient(0, 80, 0, 320); g.addColorStop(0, '#7c3aed'); g.addColorStop(1, '#5b21b6'); x.fillStyle = g; x.fillText(fmt(prm.title) || 'Татах', 680, 200);
        });
        const lm = new THREE.MeshStandardMaterial({ map: lab.t, transparent: true, roughness: 0.3, depthWrite: false }); disposables.push(lm);
        const labM = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.4), lm); labM.rotation.x = -Math.PI / 2; labM.position.y = 0.192; capG.add(labM); disposables.push(labM.geometry);
        const cur = cursor(A, 0.85); root.add(cur);
        const docs = Array.from({ length: 4 }, (_, i) => { const p = paper(i, 0.3, 0.42); p.rotation.x = Math.PI / 2; const g = new THREE.Group(); g.add(p); g.visible = false; root.add(g); return g; });
        const bits = Array.from({ length: 26 }, (_, i) => { const m = mesh(i % 3 ? new kit.RoundedBoxGeometry(0.05, 0.05, 0.05, 2, 0.012) : new THREE.SphereGeometry(0.03, 16, 12), mat([A, A2, '#ffd34d', '#7dd3fc', '#ffffff'][i % 5], { roughness: 0.25 })); m.visible = false; root.add(m); return m; });
        return {
          root,
          update(t, D) {
            const [press] = beatsOf(prm, 1, D);
            const down = Math.sin(Math.PI * seg(t, press - 0.06, press + 0.22));
            capG.position.y = 0.06 - 0.07 * down; capG.scale.set(1 + 0.02 * down, 1 - 0.1 * down, 1 + 0.02 * down);
            // cursor glides in, presses, lifts away
            const [cx, cy, cz] = keys(t, [[0, 1.0, 0.7, 0.6], [press - 0.35, 0.2, 0.32, 0.1], [press, 0.18, 0.2, 0.07], [press + 0.3, 0.22, 0.4, 0.14], [D, 0.6, 0.65, 0.35]]);
            cur.position.set(cx, cy, cz); cur.rotation.set(-1.1, 0.35, -2.2 + 0.2 * Math.sin(t * 2));
            const fly = seg(t, press + 0.05, D);
            docs.forEach((d, i) => { const k = eo(seg(fly, i * 0.08, 0.7 + i * 0.08)); d.visible = k > 0; d.position.set(lerp(0, (i - 1.5) * 0.42, k), lerp(0.1, 0.55 + (i % 2) * 0.22, k), lerp(0, 0.35 + i * 0.05, k)); d.rotation.set(-0.5 * k, (i - 1.5) * 0.4 * k, (i - 1.5) * 0.15 * k); d.scale.setScalar(0.4 + 0.6 * k); });
            bits.forEach((b, i) => { const k = seg(t, press, press + 1.1 + hash(i) * 0.6), a = hash(i * 3.1) * Math.PI * 2, r = 0.2 + hash(i * 5.3) * 1.1; b.visible = k > 0 && k < 1; b.position.set(Math.cos(a) * r * eo(k), 0.15 + (0.3 + hash(i * 2.2) * 0.7) * Math.sin(Math.PI * k * 0.9), Math.sin(a) * r * eo(k) * 0.6 + 0.1); b.rotation.set(k * 6 + i, k * 4, i); });
            const whip = 1 - eo5(seg(t, 0, 0.35)), shake = Math.exp(-Math.pow((t - press - 0.1) * 9, 2));
            cam.fov = 40;
            cam.position.set(-0.2 + 0.12 * (t / D) - whip * 0.8 + shake * 0.012 * Math.sin(t * 90), 1.35 + 0.25 * fly + whip * 0.2, 1.75 - 0.15 * (t / D) + whip * 0.6);
            cam.lookAt(0.05, 0.1 + 0.25 * fly, 0.05);
            cam.rotation.z += 0.06 + whip * 0.25;
            sun.position.set(-1.5, 4, 2); sun.target.position.set(0, 0, 0);
          },
        };
      },
      // inflated glossy number with sticky notes around it
      number(prm) {
        const A = fmt(prm.accent) || '#8b5cf6', A2 = fmt(prm.accent2) || '#ff5fa2';
        const root = new THREE.Group();
        scene.background = gradBg([[0, '#ffc7e6'], [1, '#d9a6ff']]);
        scene.fog = new THREE.Fog('#fbdcf4', 3.5, 9);
        const floor = mesh(new THREE.PlaneGeometry(14, 14), mat('#eaa3dc', { roughness: 0.4, clearcoat: 0.5 }), false, true); floor.rotation.x = -Math.PI / 2; root.add(floor);
        const num = text3d(fmt(prm.title) || '100+', 0.3, 0.12, mat('#ff8fcb', { roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.8, sheenColor: new THREE.Color('#ffd6ef') }));
        const numG = new THREE.Group(); numG.add(num); root.add(numG);
        const notes = itemsOf(prm).slice(0, 6).map((s, i) => {
          const col = ['#fff3a3', '#ffc2d6', '#ffd8b0', '#d8f5c9', '#d9d0ff', '#bfe8ff'][i % 6];
          const g = new THREE.Group();
          const b = mesh(new THREE.BoxGeometry(0.26, 0.26, 0.006), mat(col, { roughness: 0.75, clearcoat: 0, sheen: 0 })); g.add(b);
          const tx = canvasTex(512, 512, (x) => { x.fillStyle = col; x.fillRect(0, 0, 512, 512); x.fillStyle = '#3b2a57'; x.font = `700 64px Montserrat, ${UI}`; x.textAlign = 'center'; x.textBaseline = 'middle'; const ws = s.split(' '); ws.forEach((w, j) => x.fillText(w, 256, 256 + (j - (ws.length - 1) / 2) * 76, 470)); });
          const f = face(0.26, 0.26, 0.001, tx.t, { roughness: 0.8 }); f.position.z = 0.0035; g.add(f);
          root.add(g); return g;
        });
        const subL = label(fmt(prm.sub) || 'баримт бичгийн загвар', 150, '#6d28d9', 1.15, { weight: 800 }); root.add(subL);
        const docs = [0, 1, 2].map((i) => { const p = paper(i, 0.3, 0.42); root.add(p); return p; });
        const curs = [cursor(A, 1.2), cursor(A2, 0.8)]; curs.forEach((c) => root.add(c));
        return {
          root,
          update(t, D) {
            const [hit] = beatsOf(prm, 1, Math.min(D, 1.2));
            const pop = back(seg(t, 0.05, 0.55)), wob = 1 + 0.04 * Math.sin(t * 5) * Math.exp(-t * 1.5);
            numG.position.set(0, 0.3, 0); numG.scale.set(pop * wob, pop / wob, pop); numG.rotation.y = -0.25 + 0.3 * eio(seg(t, 0, D));
            subL.position.set(0, 0.02, 0.42); subL.rotation.x = -Math.PI / 2 + 0.35; (subL.material as T.MeshBasicMaterial).opacity = seg(t, hit, hit + 0.4);
            notes.forEach((g, i) => { const a = (i / notes.length) * Math.PI * 2 + t * 0.25, k = back(seg(t, 0.3 + i * 0.1, 0.8 + i * 0.1)); g.visible = k > 0.001; g.scale.setScalar(Math.max(0.001, k)); g.position.set(Math.cos(a) * 0.85, 0.5 + Math.sin(a * 2 + t) * 0.2, Math.sin(a) * 0.35 - 0.6); g.rotation.set(Math.sin(t + i) * 0.3, -a + Math.PI / 2, Math.cos(t * 0.8 + i) * 0.2); });
            docs.forEach((d, i) => { d.position.set(-0.8 + i * 0.8, 0.003, -0.75 - (i % 2) * 0.2); d.rotation.y = (i - 1) * 0.5; });
            curs.forEach((c, i) => { c.position.set(Math.cos(t * 0.9 + i * 3) * 0.75, 0.95 + i * 0.15, Math.sin(t * 0.9 + i * 3) * 0.4 + 0.2); c.rotation.set(t + i, t * 1.4, 0.5); });
            const whip = 1 - eo5(seg(t, 0, 0.4));
            const [px, py, pz, ly] = keys(t / D, [[0, 0.3, 0.32, 3.1, 0.5], [0.3, 0.12, 0.5, 3.25, 0.5], [1, -0.06, 0.72, 3.45, 0.46]]);
            cam.fov = 40; cam.position.set(px + whip * 0.6, py - whip * 0.15, pz - whip * 0.3); cam.lookAt(0, ly, 0); cam.rotation.z += -0.05 + whip * 0.3;
            sun.position.set(-1.6, 4, 2.4); sun.target.position.set(0, 0.3, 0);
          },
        };
      },
      // blue sky and clouds, a glossy comment bubble with the number, a big white word behind it
      sky(prm) {
        const A = fmt(prm.accent) || '#8b5cf6', A2 = fmt(prm.accent2) || '#ff5fa2';
        const root = new THREE.Group();
        scene.background = gradBg([[0, '#3fa9f5'], [0.6, '#8fd0ff'], [1, '#d9f0ff']], [0.18, 0.3, 'rgba(255,255,245,0.85)']);
        scene.fog = null;
        const clouds = Array.from({ length: 34 }, (_, i) => { const m = new THREE.SpriteMaterial({ map: smoke, color: '#ffffff', transparent: true, depthWrite: false, opacity: 0.85, fog: false }); disposables.push(m); const s = new THREE.Sprite(m); const sz = 1.2 + hash(i * 3.3) * 2.4; s.scale.set(sz * 1.6, sz, 1); s.position.set((hash(i) - 0.5) * 7, (hash(i * 7.7) - 0.6) * 6, -1.5 - hash(i * 1.9) * 6); root.add(s); return s; });
        const big = label(fmt(prm.title) || 'Коммент', 330, '#ffffff', 1.55, { weight: 900 }); big.position.set(0, 0.05, -0.6); root.add(big);
        const s1 = label(fmt(prm.sub) || '«1» гэж бичээрэй', 130, '#7c3aed', 1.3, { weight: 800, w: 2048, h: 256 }); s1.position.set(0, -0.32, -0.4); root.add(s1);
        const brand = label(fmt(prm.brand) || 'HR OFFICE MASTER PACK', 96, '#ffffff', 1.5, { weight: 700, w: 2048, h: 256 }); brand.position.set(0, -0.95, -0.4); root.add(brand);
        // speech bubble: rounded rect + tail, extruded and glossy
        const bs = rrShape(0.9, 0.66, 0.3);
        const tail = new THREE.Shape(); tail.moveTo(-0.18, -0.3); tail.lineTo(-0.3, -0.52); tail.lineTo(0.02, -0.3); tail.closePath();
        const bubble = new THREE.Group(); root.add(bubble);
        const bm = mat(A2, { roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.6, sheenColor: new THREE.Color('#ffd1e8') });
        const bg = new THREE.ExtrudeGeometry([bs, tail], { depth: 0.12, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 10, curveSegments: 24 }); bg.center();
        bubble.add(mesh(bg, bm));
        const one = text3d(fmt(prm.items).split('\n')[0] || '1', 0.36, 0.06, mat('#ffffff', { roughness: 0.2, clearcoat: 1 })); one.position.set(0, 0.03, 0.15); bubble.add(one);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.012, 12, 90), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, toneMapped: false })); disposables.push(ring.geometry, ring.material as T.Material); bubble.add(ring);
        const sunG = glow('#fffbe6', 5, 0.7); sunG.position.set(1.2, 2.2, -4); root.add(sunG);
        const curs = [cursor(A, 1.4)]; curs.forEach((c) => root.add(c));
        return {
          root,
          update(t, D) {
            const [hit] = beatsOf(prm, 1, D);
            const fly = eo5(seg(t, 0, 1.0));
            clouds.forEach((c, i) => { c.position.x += 0; c.position.y = ((hash(i * 7.7) - 0.6) * 6) + (1 - fly) * 3 * (1 + hash(i)); (c.material as T.SpriteMaterial).opacity = 0.35 + 0.4 * hash(i * 2.1); c.material.rotation = t * 0.02 * (i % 2 ? 1 : -1); });
            const bk = back(seg(t, hit - 0.15, hit + 0.45));
            bubble.visible = bk > 0.001; bubble.scale.setScalar(Math.max(0.001, bk) * 0.62); bubble.position.set(0.12, 0.42 + Math.sin(t * 1.4) * 0.03, 0.3); bubble.rotation.set(0.12 + Math.sin(t * 0.9) * 0.05, -0.3 + Math.sin(t * 0.7) * 0.15, 0.06);
            (ring.material as T.MeshBasicMaterial).opacity = 0.9 * (1 - seg(t, hit + 0.1, hit + 0.7)); ring.scale.setScalar(1 + 1.2 * eo(seg(t, hit + 0.05, hit + 0.7)));
            const bw = eo5(seg(t, 0.35, 1.0)); big.scale.setScalar(0.85 + 0.15 * bw); (big.material as T.MeshBasicMaterial).opacity = bw;
            (s1.material as T.MeshBasicMaterial).opacity = seg(t, hit + 0.2, hit + 0.6);
            (brand.material as T.MeshBasicMaterial).opacity = seg(t, Math.max(hit + 0.9, D - 2.2), Math.max(hit + 1.3, D - 1.8));
            curs[0].position.set(lerp(1.4, 0.55, eo(seg(t, hit, hit + 0.8))), lerp(-1.2, -0.1, eo(seg(t, hit, hit + 0.8))) + Math.sin(t * 2) * 0.02, 0.5); curs[0].rotation.set(-0.3, 0.4, 2.4 + Math.sin(t) * 0.1);
            cam.fov = 40; cam.position.set(0, lerp(-1.4, 0, fly), lerp(3.3, 3.0, seg(t, 0, D))); cam.lookAt(0, lerp(-0.6, 0, fly) - 0.05, 0); cam.rotation.z += (1 - fly) * 0.25;
            sun.position.set(1.5, 3, 4); sun.target.position.set(0, 0, 0);
          },
        };
      },
    };

    let shot: Shot | null = null, builtFor = '', building: Promise<void> | null = null;
    const ensure = (prm: Record<string, number | string>) => {
      const key = [prm.shot, prm.title, prm.sub, prm.items, prm.brand, prm.accent, prm.accent2, ...Array.from({ length: IMGS }, (_, i) => fmt(prm[`img${i + 1}`]).length)].join('|');
      if (key === builtFor) return building ?? Promise.resolve();
      builtFor = key;
      building = (async () => {
        await Promise.all([fontReady(`800 80px Montserrat`, 'Аа Өө Үү'), fontReady(`900 80px Montserrat`, 'Аа'), fontReady(`700 80px Inter`, 'Аа Өө')]);
        for (let i = 0; i < IMGS; i++) imgs[i] = await loadImg(fmt(prm[`img${i + 1}`]));
        if (!FONT) {
          const [{ FontLoader }, { TextGeometry }, json] = await Promise.all([import('three/examples/jsm/loaders/FontLoader.js'), import('three/examples/jsm/geometries/TextGeometry.js'), import('three/examples/fonts/helvetiker_bold.typeface.json')]);
          FONT = new FontLoader().parse((json as any).default ?? json);
          (kit as any).__TextGeometry = TextGeometry;
        }
        if (shot) scene.remove(shot.root);
        const make = SHOT[fmt(prm.shot)] ?? SHOT.desk;
        shot = make(prm);
        scene.add(shot.root);
        building = null;
        kit.redraw();
      })();
      return building;
    };

    return {
      async prepare(prm) { await ensure(prm); },
      render(f: FrameState) {
        const r = kit.renderer;
        r.toneMappingExposure = 0.9;
        ensure(f.params);
        if (!shot) { r.setClearColor('#e9d5ff', 1); r.clear(); return; }
        const D = f.dur ?? (f.p > 0 ? f.t / f.p : 3);
        cam.aspect = f.W / f.H;
        cam.rotation.set(0, 0, 0);
        shot.update(f.t, D, f);
        fill.position.set(2.5, 1.5, 3);
        cam.updateProjectionMatrix();
        r.render(scene, cam);
      },
      dispose() { disposables.forEach((d) => d.dispose()); },
    };
  },
};

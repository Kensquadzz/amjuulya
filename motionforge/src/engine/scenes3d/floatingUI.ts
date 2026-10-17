// Floating App Interface — five real phone bodies (rounded titanium frame,
// glass screen with reflections) float in a deep blue space, each showing a
// different, fully designed screen: music, finance, chat, fitness, weather.
// Or drop in your own screenshots. A clear camera path: fly-in, glide past
// the hero screen, sweep the side devices, settle on a hero group shot.
import type * as THREEType from 'three';
import { easeOut, fontReady, glowTexture, loadImg, path, seg, studioEnv, type FrameState, type SceneDef, type SceneKit } from '../scene3d';

const fmt = (s: unknown) => String(s ?? '');
const SW = 900, SH = 1950; // screen canvas (≈ 19.5:9)
const PW = 0.46, PH = 0.995, PD = 0.05; // phone body in world units

type Ctx = CanvasRenderingContext2D;
const F = (w: number, px: number) => `${w} ${px}px Inter, "Helvetica Neue", Arial, sans-serif`;

function rr(x: Ctx, X: number, Y: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r);
  x.closePath();
}
function txt(x: Ctx, s: string, X: number, Y: number, w: number, px: number, color: string, align: CanvasTextAlign = 'left') {
  x.font = F(w, px); x.fillStyle = color; x.textAlign = align; x.textBaseline = 'alphabetic';
  x.fillText(s, X, Y);
}
function chrome(x: Ctx, dark: boolean) {
  const c = dark ? '#ffffff' : '#0b0d14';
  txt(x, '9:41', 92, 92, 600, 40, c);
  // signal / battery
  x.fillStyle = c;
  for (let i = 0; i < 4; i++) rr(x, 640 + i * 18, 80 - i * 8, 11, 12 + i * 8, 3), x.fill();
  rr(x, 735, 62, 62, 30, 9); x.strokeStyle = c; x.lineWidth = 3; x.stroke();
  rr(x, 741, 68, 44, 18, 5); x.fill();
  // dynamic island
  x.fillStyle = '#000'; rr(x, SW / 2 - 130, 38, 260, 74, 37); x.fill();
  // home indicator
  x.fillStyle = dark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.75)';
  rr(x, SW / 2 - 140, SH - 40, 280, 12, 6); x.fill();
}

function music(x: Ctx, accent: string, name: string) {
  const g = x.createLinearGradient(0, 0, 0, SH);
  g.addColorStop(0, '#2a1450'); g.addColorStop(1, '#07060d');
  x.fillStyle = g; x.fillRect(0, 0, SW, SH);
  // album art
  const a = x.createLinearGradient(110, 250, 790, 930);
  a.addColorStop(0, accent); a.addColorStop(0.55, '#ff4fa3'); a.addColorStop(1, '#ffb347');
  x.save(); x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 80; x.shadowOffsetY = 40;
  rr(x, 110, 250, 680, 680, 44); x.fillStyle = a; x.fill(); x.restore();
  x.save(); rr(x, 110, 250, 680, 680, 44); x.clip();
  for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(450, 590, 90 + i * 70, 0, Math.PI * 2); x.strokeStyle = `rgba(255,255,255,${0.16 - i * 0.02})`; x.lineWidth = 18; x.stroke(); }
  x.restore();
  txt(x, 'Midnight Drive', 110, 1070, 800, 64, '#fff');
  txt(x, name + ' Sessions', 110, 1140, 500, 40, 'rgba(255,255,255,0.6)');
  // heart
  txt(x, '♥', 790, 1080, 700, 60, accent, 'right');
  // scrubber
  rr(x, 110, 1230, 680, 12, 6); x.fillStyle = 'rgba(255,255,255,0.22)'; x.fill();
  rr(x, 110, 1230, 410, 12, 6); x.fillStyle = '#fff'; x.fill();
  x.beginPath(); x.arc(520, 1236, 20, 0, Math.PI * 2); x.fill();
  txt(x, '2:14', 110, 1300, 500, 32, 'rgba(255,255,255,0.55)');
  txt(x, '-1:32', 790, 1300, 500, 32, 'rgba(255,255,255,0.55)', 'right');
  // controls
  x.fillStyle = '#fff';
  const tri = (cx: number, cy: number, s: number, dir: number) => { x.beginPath(); x.moveTo(cx - s * dir, cy - s); x.lineTo(cx + s * dir, cy); x.lineTo(cx - s * dir, cy + s); x.closePath(); x.fill(); };
  tri(250, 1470, 34, -1); tri(210, 1470, 34, -1);
  rr(x, 405, 1415, 32, 110, 8); x.fill(); rr(x, 463, 1415, 32, 110, 8); x.fill();
  tri(650, 1470, 34, 1); tri(690, 1470, 34, 1);
  // volume + lyrics strip
  rr(x, 170, 1640, 560, 10, 5); x.fillStyle = 'rgba(255,255,255,0.22)'; x.fill();
  rr(x, 170, 1640, 380, 10, 5); x.fillStyle = 'rgba(255,255,255,0.85)'; x.fill();
  chrome(x, true);
}

function finance(x: Ctx, accent: string) {
  x.fillStyle = '#f4f6fb'; x.fillRect(0, 0, SW, SH);
  txt(x, 'Total balance', 80, 250, 500, 40, '#6b7280');
  txt(x, '$24,860.42', 80, 350, 800, 96, '#0b0d14');
  rr(x, 80, 390, 200, 56, 28); x.fillStyle = 'rgba(34,197,94,0.14)'; x.fill();
  txt(x, '▲ 8.2%', 180, 430, 700, 32, '#16a34a', 'center');
  // chart card
  x.save(); x.shadowColor = 'rgba(15,23,42,0.12)'; x.shadowBlur = 50; x.shadowOffsetY = 20;
  rr(x, 60, 500, 780, 600, 48); x.fillStyle = '#fff'; x.fill(); x.restore();
  const pts: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push([110 + t * 680, 960 - (Math.sin(t * 5.2) * 0.25 + t * 0.6 + Math.sin(t * 17) * 0.05) * 420]);
  }
  const area = x.createLinearGradient(0, 560, 0, 1000);
  area.addColorStop(0, accent + '66'); area.addColorStop(1, accent + '00');
  x.beginPath(); x.moveTo(pts[0][0], 1020); pts.forEach(([a, b]) => x.lineTo(a, b)); x.lineTo(pts[24][0], 1020); x.closePath(); x.fillStyle = area; x.fill();
  x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.strokeStyle = accent; x.lineWidth = 9; x.lineJoin = 'round'; x.stroke();
  const [ex, ey] = pts[24];
  x.beginPath(); x.arc(ex, ey, 18, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 8; x.stroke();
  ['1D', '1W', '1M', '1Y'].forEach((s, i) => {
    if (i === 2) { rr(x, 120 + i * 175, 1030, 120, 52, 26); x.fillStyle = accent; x.fill(); }
    txt(x, s, 180 + i * 175, 1068, 700, 30, i === 2 ? '#fff' : '#6b7280', 'center');
  });
  txt(x, 'Recent', 80, 1220, 800, 46, '#0b0d14');
  const rows: [string, string, string, string][] = [['Coffee House', 'Today', '-$6.40', '#f59e0b'], ['Salary', 'Yesterday', '+$4,200', '#22c55e'], ['Streaming', 'Mon', '-$12.99', '#ef4444'], ['Groceries', 'Sun', '-$84.10', '#8b5cf6']];
  rows.forEach(([a, b, c, col], i) => {
    const y = 1290 + i * 150;
    rr(x, 80, y, 100, 100, 30); x.fillStyle = col + '26'; x.fill();
    x.beginPath(); x.arc(130, y + 50, 22, 0, Math.PI * 2); x.fillStyle = col; x.fill();
    txt(x, a, 220, y + 45, 700, 38, '#0b0d14');
    txt(x, b, 220, y + 90, 500, 30, '#9ca3af');
    txt(x, c, 820, y + 64, 700, 38, c.startsWith('+') ? '#16a34a' : '#0b0d14', 'right');
  });
  chrome(x, false);
}

function chat(x: Ctx, accent: string) {
  x.fillStyle = '#0d1018'; x.fillRect(0, 0, SW, SH);
  x.fillStyle = '#151a26'; x.fillRect(0, 0, SW, 330);
  const av = x.createLinearGradient(380, 150, 520, 290);
  av.addColorStop(0, '#22d3ee'); av.addColorStop(1, accent);
  x.beginPath(); x.arc(450, 210, 62, 0, Math.PI * 2); x.fillStyle = av; x.fill();
  txt(x, 'M', 450, 232, 800, 60, '#fff', 'center');
  txt(x, 'Maya', 450, 312, 700, 36, '#fff', 'center');
  const msgs: [boolean, string[]][] = [
    [false, ['Did you see the new', 'release? 🔥']],
    [true, ['Yes! The 3D view', 'is unreal']],
    [false, ['Sending you the', 'designs now']],
    [true, ['Perfect, thanks ✨']],
    [false, ['Launch is Friday 🚀']],
  ];
  let y = 430;
  for (const [me, lines] of msgs) {
    const h = 48 + lines.length * 56;
    const w = Math.max(...lines.map((l) => { x.font = F(500, 42); return x.measureText(l).width; })) + 80;
    const X = me ? SW - 60 - w : 60;
    rr(x, X, y, w, h, 46);
    if (me) { const g = x.createLinearGradient(X, y, X + w, y + h); g.addColorStop(0, accent); g.addColorStop(1, '#8b5cf6'); x.fillStyle = g; } else x.fillStyle = '#232a3a';
    x.fill();
    lines.forEach((l, i) => txt(x, l, X + 40, y + 74 + i * 56, 500, 42, '#fff'));
    y += h + 44;
  }
  // typing dots + composer
  rr(x, 60, y, 170, 90, 45); x.fillStyle = '#232a3a'; x.fill();
  for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(105 + i * 40, y + 45, 12, 0, Math.PI * 2); x.fillStyle = `rgba(255,255,255,${0.4 + i * 0.2})`; x.fill(); }
  rr(x, 50, SH - 200, 680, 100, 50); x.fillStyle = '#1b2130'; x.fill();
  txt(x, 'Message', 100, SH - 135, 500, 38, '#6b7280');
  x.beginPath(); x.arc(800, SH - 150, 50, 0, Math.PI * 2); x.fillStyle = accent; x.fill();
  txt(x, '↑', 800, SH - 132, 800, 52, '#fff', 'center');
  chrome(x, true);
}

function fitness(x: Ctx) {
  x.fillStyle = '#000'; x.fillRect(0, 0, SW, SH);
  txt(x, 'Activity', 80, 250, 800, 72, '#fff');
  txt(x, 'Thursday, 12 June', 80, 310, 500, 36, '#8e8e93');
  const rings: [string, number][] = [['#fa114f', 0.82], ['#a6ff00', 0.64], ['#00f0ff', 0.9]];
  rings.forEach(([c, v], i) => {
    const r = 290 - i * 92;
    x.lineCap = 'round'; x.lineWidth = 78;
    x.beginPath(); x.arc(SW / 2, 720, r, 0, Math.PI * 2); x.strokeStyle = c + '33'; x.stroke();
    x.beginPath(); x.arc(SW / 2, 720, r, -Math.PI / 2, -Math.PI / 2 + v * Math.PI * 2); x.strokeStyle = c; x.stroke();
  });
  const stat = (y: number, label: string, v: string, c: string) => {
    txt(x, label, 80, y, 600, 38, '#fff');
    txt(x, v, 80, y + 80, 700, 72, c);
  };
  stat(1150, 'Move', '512/620 KCAL', '#fa114f');
  stat(1340, 'Exercise', '38/60 MIN', '#a6ff00');
  stat(1530, 'Stand', '9/10 HRS', '#00f0ff');
  // mini bar chart
  for (let i = 0; i < 12; i++) {
    const h = 30 + Math.abs(Math.sin(i * 1.7)) * 120;
    rr(x, 560 + i * 24, 1280 - h, 14, h, 7); x.fillStyle = '#fa114f'; x.fill();
  }
  chrome(x, true);
}

function weather(x: Ctx) {
  const g = x.createLinearGradient(0, 0, 0, SH);
  g.addColorStop(0, '#2f80ed'); g.addColorStop(1, '#56ccf2');
  x.fillStyle = g; x.fillRect(0, 0, SW, SH);
  txt(x, 'Ulaanbaatar', SW / 2, 300, 500, 60, '#fff', 'center');
  txt(x, '24°', SW / 2 + 20, 560, 200, 260, '#fff', 'center');
  txt(x, 'Mostly Sunny', SW / 2, 650, 600, 44, 'rgba(255,255,255,0.9)', 'center');
  txt(x, 'H:27°  L:12°', SW / 2, 715, 600, 40, 'rgba(255,255,255,0.9)', 'center');
  rr(x, 60, 820, 780, 380, 44); x.fillStyle = 'rgba(255,255,255,0.18)'; x.fill();
  for (let i = 0; i < 6; i++) {
    const X = 130 + i * 128;
    txt(x, i ? `${(9 + i) % 12 || 12}PM` : 'Now', X, 900, 600, 30, '#fff', 'center');
    x.beginPath(); x.arc(X, 1000, 30, 0, Math.PI * 2); x.fillStyle = i % 3 === 2 ? '#e5ecf5' : '#ffd84d'; x.fill();
    txt(x, `${24 - i}°`, X, 1110, 700, 40, '#fff', 'center');
  }
  rr(x, 60, 1250, 780, 560, 44); x.fillStyle = 'rgba(255,255,255,0.18)'; x.fill();
  ['Today', 'Fri', 'Sat', 'Sun'].forEach((d, i) => {
    const y = 1350 + i * 120;
    txt(x, d, 110, y, 600, 40, '#fff');
    rr(x, 380, y - 20, 300, 14, 7); x.fillStyle = 'rgba(255,255,255,0.25)'; x.fill();
    rr(x, 420 + i * 18, y - 20, 180 - i * 10, 14, 7); x.fillStyle = '#ffd84d'; x.fill();
    txt(x, `${27 - i}°`, 790, y, 700, 40, '#fff', 'right');
  });
  chrome(x, true);
}

function drawImageCover(x: Ctx, img: HTMLImageElement) {
  const s = Math.max(SW / img.width, SH / img.height);
  const w = img.width * s, h = img.height * s;
  x.fillStyle = '#000'; x.fillRect(0, 0, SW, SH);
  x.drawImage(img, (SW - w) / 2, (SH - h) / 2, w, h);
}

export const floatingUI: SceneDef = {
  id: 'floatingUI',
  name: 'Floating App Interface',
  params: [
    { key: 'appName', kind: 'text', label: 'App name (music screen)', def: 'Nova' },
    { key: 'accent', kind: 'color', label: 'App accent colour', def: '#2f6bff' },
    { key: 'space', kind: 'color', label: 'Space colour', def: '#050a1f' },
    { key: 'glow', kind: 'color', label: 'Glow colour', def: '#6d4bff' },
    { key: 'frame', kind: 'color', label: 'Phone frame', def: '#9aa3b2' },
    { key: 'shot1', kind: 'image', label: 'Your screenshot — hero phone', def: '' },
    { key: 'shot2', kind: 'image', label: 'Your screenshot — left phone', def: '' },
    { key: 'shot3', kind: 'image', label: 'Your screenshot — right phone', def: '' },
    { key: 'camera', kind: 'float', label: 'Camera movement', min: 0, max: 1.5, def: 1 },
    { key: 'floatAmt', kind: 'float', label: 'Float', min: 0, max: 2, def: 1 },
  ],
  create(kit: SceneKit) {
    const { THREE } = kit;
    const scene = new THREE.Scene();
    const env = studioEnv(kit, { key: 1, strips: 1.6, cool: '#cfe0ff', room: '#0a0f22' });
    scene.environment = env;
    scene.fog = new THREE.FogExp2('#050a1f', 0.085);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 80);

    // deep space backdrop: vertical gradient with two soft coloured nebulae
    const backMat = new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Color() }, uG: { value: new THREE.Color() }, uA: { value: new THREE.Color() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uC, uG, uA; varying vec2 vUv;
        void main(){
          vec3 c = uC * (0.35 + 0.9 * vUv.y);
          c += uG * 0.14 * exp(-pow(length((vUv - vec2(0.3, 0.62)) * vec2(1.6, 2.2)), 2.0) * 3.0);
          c += uA * 0.1 * exp(-pow(length((vUv - vec2(0.72, 0.38)) * vec2(1.6, 2.2)), 2.0) * 3.5);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      depthWrite: false, fog: false,
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), backMat);
    back.position.z = -9;
    scene.add(back);

    // floating bokeh orbs at several depths (fog fades the far ones)
    const glowTex = glowTexture(kit, 'glow');
    const orbs: THREEType.Sprite[] = [];
    for (let i = 0; i < 22; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.25 + 0.25 * Math.abs(Math.sin(i * 4.1)) }));
      const z = -0.5 - Math.abs(Math.sin(i * 7.7)) * 5;
      s.position.set(Math.sin(i * 12.9) * (2 + -z * 0.6), Math.cos(i * 5.3) * (1.4 + -z * 0.35), z);
      s.scale.setScalar(0.06 + Math.abs(Math.sin(i * 3.3)) * 0.14);
      orbs.push(s); scene.add(s);
    }

    // phones: an iPhone-proportioned slab — large continuous corner radius,
    // flat glass front and back, a rounded titanium band (bevelled extrusion)
    const rrShape = (w: number, h: number, r: number) => {
      const sh = new THREE.Shape();
      sh.moveTo(-w / 2 + r, -h / 2);
      sh.lineTo(w / 2 - r, -h / 2); sh.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
      sh.lineTo(w / 2, h / 2 - r); sh.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
      sh.lineTo(-w / 2 + r, h / 2); sh.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
      sh.lineTo(-w / 2, -h / 2 + r); sh.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
      return sh;
    };
    const RC = 0.074; // corner radius ≈ 16% of the width, like the real device
    const BT = PD * 0.36, BS = 0.011; // band roundness: bevel depth and inset
    const body = new THREE.ExtrudeGeometry(rrShape(PW - 2 * BS, PH - 2 * BS, RC - BS), { depth: PD - 2 * BT, bevelEnabled: true, bevelThickness: BT, bevelSize: BS, bevelSegments: 10, curveSegments: 48 });
    body.translate(0, 0, -(PD - 2 * BT) / 2);
    const frameMat = new THREE.MeshPhysicalMaterial({ color: '#9aa3b2', metalness: 1, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.2 });
    const backGlass = new THREE.MeshPhysicalMaterial({ color: '#1a1f2b', metalness: 0.1, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.12 });
    const lensGlass = new THREE.MeshPhysicalMaterial({ color: '#05060a', metalness: 0.2, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.6, iridescenceIOR: 1.6 });
    const ringMat = new THREE.MeshPhysicalMaterial({ color: '#c8ccd4', metalness: 1, roughness: 0.18 });
    // the screen: rounded rect with UVs 0..1; a glass layer gives it real reflections
    const sw = PW - 0.03, sh = PH - 0.03, sr = RC - 0.016;
    const shape = rrShape(sw, sh, sr);
    const screenGeo = new THREE.ShapeGeometry(shape, 24);
    const pos = screenGeo.attributes.position, uv = screenGeo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / sw + 0.5, pos.getY(i) / sh + 0.5);
    const bezelGeo = new THREE.ShapeGeometry(rrShape(PW - 0.014, PH - 0.014, RC - 0.007), 24);
    const bezelMat = new THREE.MeshPhysicalMaterial({ color: '#020203', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 });
    // camera plateau on the back (seen when a phone turns), side buttons
    const bumpGeo = new THREE.ExtrudeGeometry(rrShape(0.17, 0.17, 0.045), { depth: 0.004, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 4, curveSegments: 24 });
    const lensGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.01, 40);
    const ringGeo = new THREE.TorusGeometry(0.031, 0.004, 10, 40);
    const btnGeo = new kit.RoundedBoxGeometry(0.008, 0.1, 0.018, 3, 0.004);
    const makeShell = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(body, [backGlass, frameMat]));
      const bezel = new THREE.Mesh(bezelGeo, bezelMat);
      bezel.position.z = PD / 2 + 0.0004;
      g.add(bezel);
      const bump = new THREE.Mesh(bumpGeo, [backGlass, frameMat]);
      bump.rotation.y = Math.PI;
      bump.position.set(PW / 2 - 0.115, PH / 2 - 0.115, -PD / 2 - 0.0005);
      g.add(bump);
      ([[-0.035, 0.035], [-0.035, -0.035], [0.035, 0]] as [number, number][]).forEach(([dx, dy]) => {
        const lens = new THREE.Mesh(lensGeo, lensGlass);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(PW / 2 - 0.115 + dx, PH / 2 - 0.115 + dy, -PD / 2 - 0.012);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(lens.position).setZ(-PD / 2 - 0.016);
        g.add(lens, ring);
      });
      ([[-1, 0.27, 0.06], [-1, 0.14, 0.1], [-1, 0.01, 0.1], [1, 0.12, 0.16]] as [number, number, number][]).forEach(([side, y, len]) => {
        const b = new THREE.Mesh(btnGeo, frameMat);
        b.scale.y = len / 0.1;
        b.position.set(side * (PW / 2 + 0.002), y, 0);
        g.add(b);
      });
      return g;
    };

    type Phone = { g: THREEType.Group; canvas: HTMLCanvasElement; tex: THREEType.CanvasTexture; mat: THREEType.MeshPhysicalMaterial; home: [number, number, number, number]; draw: (x: Ctx, accent: string, name: string) => void; shot?: string; img?: HTMLImageElement | null };
    const phones: Phone[] = [];
    const DESIGNS: Phone['draw'][] = [
      (x, a) => finance(x, a),
      (x, a, n) => music(x, a, n),
      (x, a) => chat(x, a),
      (x) => fitness(x),
      (x) => weather(x),
    ];
    // x, y, z, yaw: hero in the middle, two flanking, two further back
    const HOMES: [number, number, number, number][] = [[0, 0, 0, 0], [-0.62, 0.07, -0.42, 0.42], [0.62, -0.06, -0.42, -0.42], [-1.18, -0.1, -1.15, 0.6], [1.18, 0.12, -1.15, -0.6]];
    HOMES.forEach((home, i) => {
      const g = new THREE.Group();
      g.add(makeShell());
      const canvas = document.createElement('canvas');
      canvas.width = SW; canvas.height = SH;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = kit.renderer.capabilities.getMaxAnisotropy();
      // black glass that emits the UI: reflections from the clearcoat sit on top of the pixels
      const mat = new THREE.MeshPhysicalMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1, roughness: 0.12, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.02, envMap: env, envMapIntensity: 0.3 });
      // (its own envMap: scene.environment would ignore envMapIntensity and wash dark screens grey)
      const screen = new THREE.Mesh(screenGeo, mat);
      screen.position.z = PD / 2 + 0.0009;
      g.add(screen);
      scene.add(g);
      phones.push({ g, canvas, tex, mat, home, draw: DESIGNS[i] });
    });

    const key = new THREE.DirectionalLight('#ffffff', 1.2);
    key.position.set(-2, 3, 4);
    const rim = new THREE.DirectionalLight('#8fb4ff', 3.2);
    rim.position.set(3, 1.5, -3);
    const rim2 = new THREE.DirectionalLight('#b48cff', 2.4);
    rim2.position.set(-3, -1, -3);
    scene.add(key, rim, rim2);
    // soft glow pooled behind the hero device
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.28, fog: false }));
    halo.position.set(0, 0, -0.9);
    halo.scale.set(3.2, 3.2, 1);
    scene.add(halo);

    let drawn = '';
    const redrawScreens = async (prm: Record<string, number | string>, wait: boolean) => {
      const k = [prm.accent, prm.appName, prm.shot1, prm.shot2, prm.shot3].map((v) => fmt(v).slice(-48) + fmt(v).length).join('|');
      if (k === drawn) return;
      drawn = k;
      const font = fontReady(F(800, 60), 'Aa9');
      if (wait) await font; else font.then(() => { drawn = ''; kit.redraw(); });
      const shots = [fmt(prm.shot1), fmt(prm.shot2), fmt(prm.shot3)];
      // screen index 0 = hero, 1 = left, 2 = right
      await Promise.all(shots.map(async (src, i) => {
        const ph = phones[i];
        if (ph.shot !== src) { ph.shot = src; ph.img = src ? await loadImg(src) : null; }
      }));
      if (k !== drawn) return;
      const accent = fmt(prm.accent) || '#2f6bff';
      for (const ph of phones) {
        const x = ph.canvas.getContext('2d')!;
        x.clearRect(0, 0, SW, SH);
        if (ph.img) drawImageCover(x, ph.img);
        else ph.draw(x, accent, fmt(prm.appName) || 'Nova');
        ph.tex.needsUpdate = true;
      }
      kit.redraw();
    };

    return {
      async prepare(prm) { await redrawScreens(prm, true); },
      render(f: FrameState) {
        const prm = f.params;
        redrawScreens(prm, false);
        const r = kit.renderer;
        r.toneMappingExposure = 1;
        const space = fmt(prm.space) || '#050a1f';
        (scene.fog as THREEType.FogExp2).color.set(space);
        backMat.uniforms.uC.value.set(space).multiplyScalar(1.6);
        backMat.uniforms.uG.value.set(fmt(prm.glow) || '#6d4bff');
        backMat.uniforms.uA.value.set(fmt(prm.accent) || '#2f6bff');
        frameMat.color.set(fmt(prm.frame) || '#9aa3b2');
        (halo.material as THREEType.SpriteMaterial).color.set(fmt(prm.glow) || '#6d4bff').multiplyScalar(0.6);
        const p = f.p, t = f.t;
        const portrait = f.W < f.H;
        const fl = Number(prm.floatAmt ?? 1);
        // devices arrive one after another from below and behind, then float
        phones.forEach((ph, i) => {
          const order = [0, 1, 2, 3, 4][i];
          const a = easeOut(seg(p, 0.02 + order * 0.045, 0.24 + order * 0.045));
          const [hx0, hy, hz, yaw] = ph.home;
          const hx = hx0 * (portrait ? 0.78 : 1);
          const bob = Math.sin(t * 0.9 + i * 1.7) * 0.03 * fl;
          ph.g.position.set(hx, hy + bob - (1 - a) * 1.6, hz - (1 - a) * 1.2);
          ph.g.rotation.set(-0.08 + (1 - a) * 0.6 + Math.sin(t * 0.7 + i) * 0.03 * fl, yaw + (1 - a) * (i % 2 ? 0.8 : -0.8), Math.sin(t * 0.5 + i * 2.3) * 0.025 * fl);
          ph.mat.emissiveIntensity = 0.15 + 0.85 * seg(p, 0.06 + order * 0.045, 0.2 + order * 0.045);
        });
        orbs.forEach((o, i) => { o.position.y += Math.sin(t * 0.3 + i) * 0.0008; });
        // camera: wide fly-in -> glide past the hero screen -> sweep the right side -> hero group
        const k = Number(prm.camera ?? 1);
        const [az, el, dist, lx, ly, fov] = path([
          [0, -10, 4, 4.6, 0, -0.05, 32],
          [0.28, -22, 4, 2.75, -0.05, 0.0, 30],
          [0.5, 16, -2, 2.75, 0.0, 0.1, 30],
          [0.7, 34, 3, 2.6, 0.35, 0.0, 30],
          [0.84, 6, 3, 3.9, 0.0, 0.0, 30],
          [1, 0, 2, 4.1, 0, 0.0, 30],
        ], p);
        // keep the five-phone group inside the frame horizontally in portrait
        const fit = portrait ? Math.max(1, 0.72 / (f.W / f.H)) * 0.82 : 0.82;
        const A = (az * k * Math.PI) / 180, E = (el * k * Math.PI) / 180;
        const D = dist * fit;
        cam.fov = fov;
        cam.aspect = f.W / f.H;
        cam.position.set(Math.sin(A) * Math.cos(E) * D + lx * 0.3, Math.sin(E) * D, Math.cos(A) * Math.cos(E) * D);
        cam.lookAt(lx * k, ly, -0.2);
        cam.updateProjectionMatrix();
        back.position.set(cam.position.x * 0.6, cam.position.y * 0.6, -9);
        back.lookAt(cam.position);
        r.render(scene, cam);
      },
      dispose() {
        scene.traverse((x) => {
          const m = x as THREEType.Mesh;
          if (!(m.isMesh || (x as THREEType.Sprite).isSprite)) return;
          m.geometry?.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => mm.dispose());
        });
        phones.forEach((ph) => ph.tex.dispose());
        env.dispose(); glowTex.dispose();
      },
    };
  },
};

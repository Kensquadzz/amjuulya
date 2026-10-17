// 3D Product Orbit — a 330 ml aluminium can in a photographic studio.
// Real lathe-turned profile (domed base, chime, body, necked shoulder, rolled
// rim, countersunk lid with a tab), a printed label with clear-coat, studio
// softbox reflections, a soft baked contact shadow, a faded floor reflection
// and a single continuous camera path: macro on the rim, a descending orbit
// that reveals the label, a low hero pass and a front hero frame.
import type * as THREEType from 'three';
import { bakeContactShadow, fadedMirror, fontReady, loadImg, path, seg, easeInOut, studioEnv, type FrameState, type SceneDef, type SceneKit } from '../scene3d';

const R = 0.33; // body radius (66 mm can = 0.33 units at 1 unit = 100 mm)
const LABEL_Y0 = 0.1, LABEL_Y1 = 1.02;

/** Can profile, bottom centre -> rim -> lid centre (r, y). */
function profile(THREE: typeof THREEType) {
  const p: [number, number][] = [
    [0, 0.045], [0.12, 0.04], [0.2, 0.026], [0.235, 0.008], [0.25, 0.0], [0.262, 0.004], [0.282, 0.022], [0.305, 0.048], [0.322, 0.075], [R, LABEL_Y0],
    // (label cylinder covers the straight body)
    [R, LABEL_Y1], [0.328, 1.05], [0.318, 1.085], [0.3, 1.118], [0.285, 1.14], [0.276, 1.158], [0.274, 1.17],
    // rolled rim
    [0.279, 1.178], [0.282, 1.188], [0.279, 1.197], [0.272, 1.2], [0.265, 1.195], [0.262, 1.183],
    // countersink and lid panel
    [0.258, 1.165], [0.25, 1.158], [0.242, 1.163], [0.22, 1.168], [0, 1.172],
  ];
  return p.map(([r, y]) => new THREE.Vector2(r, y));
}

const fmt = (s: unknown) => String(s ?? '');

export const productOrbit: SceneDef = {
  id: 'productOrbit',
  name: '3D Product Orbit',
  params: [
    { key: 'brand', kind: 'text', label: 'Brand on the can', def: 'NOVA' },
    { key: 'flavor', kind: 'text', label: 'Flavour line', def: 'SPARKLING CITRUS' },
    { key: 'label', kind: 'image', label: 'Your label artwork (wraps around)', def: '' },
    { key: 'canColor', kind: 'color', label: 'Can colour', def: '#e2253f' },
    { key: 'accent', kind: 'color', label: 'Accent colour', def: '#ffd23f' },
    { key: 'backdrop', kind: 'color', label: 'Backdrop', def: '#1c1e26' },
    { key: 'light', kind: 'float', label: 'Light', min: 0.2, max: 2, def: 1 },
    { key: 'exposure', kind: 'float', label: 'Exposure', min: 0.4, max: 2, def: 1 },
    { key: 'camera', kind: 'float', label: 'Camera movement', min: 0, max: 1.5, def: 1 },
    { key: 'reflection', kind: 'float', label: 'Floor reflection', min: 0, max: 1, def: 0.35 },
    { key: 'spin', kind: 'float', label: 'Can spin (°/s)', min: -40, max: 40, def: 0 },
    { key: 'condensation', kind: 'float', label: 'Ice-cold droplets', min: 0, max: 1, def: 0.8 },
  ],
  create(kit: SceneKit) {
    const { THREE } = kit;
    const scene = new THREE.Scene();
    const env = studioEnv(kit, { strips: 0.75, room: '#585c66' }); // a grey room: polished metal never reflects pure black
    scene.environment = env;
    scene.fog = new THREE.Fog('#1c1e26', 5, 16);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.02, 60);

    // ---- materials
    const alu = new THREE.MeshPhysicalMaterial({ color: '#d9dde3', metalness: 1, roughness: 0.24, clearcoat: 0.3, clearcoatRoughness: 0.2 });
    const lc = document.createElement('canvas');
    lc.width = 4096; lc.height = 1820;
    const labelTex = new THREE.CanvasTexture(lc);
    labelTex.colorSpace = THREE.SRGBColorSpace;
    labelTex.anisotropy = kit.renderer.capabilities.getMaxAnisotropy();
    // condensation: a mist + micro-droplet relief (bump) and matching roughness
    // (mist is matt, water is glossy), baked once into a canvas
    const dc = document.createElement('canvas');
    dc.width = 2048; dc.height = 1024;
    {
      const x = dc.getContext('2d')!;
      x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, 2048, 1024);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 14000; i++) {
        const X = rnd() * 2048, Y = rnd() * 1024, r = 1 + rnd() * rnd() * 7;
        const g = x.createRadialGradient(X - r * 0.3, Y - r * 0.3, 0, X, Y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.7, 'rgba(200,200,200,0.6)'); g.addColorStop(1, 'rgba(128,128,128,0)');
        x.fillStyle = g; x.beginPath(); x.arc(X, Y, r, 0, Math.PI * 2); x.fill();
      }
      // a few runs: drops that slid down and left a clear trail
      for (let i = 0; i < 26; i++) {
        const X = rnd() * 2048, Y0 = rnd() * 600, L = 120 + rnd() * 380, w = 3 + rnd() * 4;
        const g = x.createLinearGradient(0, Y0, 0, Y0 + L);
        g.addColorStop(0, 'rgba(90,90,90,0)'); g.addColorStop(1, 'rgba(90,90,90,0.9)');
        x.fillStyle = g; x.fillRect(X - w / 2, Y0, w, L);
        x.fillStyle = 'rgba(255,255,255,1)'; x.beginPath(); x.ellipse(X, Y0 + L, w * 1.3, w * 1.6, 0, 0, Math.PI * 2); x.fill();
      }
    }
    const dropTex = new THREE.CanvasTexture(dc);
    dropTex.wrapS = THREE.RepeatWrapping;
    dropTex.anisotropy = kit.renderer.capabilities.getMaxAnisotropy();
    // printed metal: ink over aluminium keeps a metallic sheen under the colour
    const label = new THREE.MeshPhysicalMaterial({ map: labelTex, metalness: 0.62, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, bumpMap: dropTex, bumpScale: 1.2 });

    // ---- the can
    const can = new THREE.Group();
    const pts = profile(THREE);
    const iBody0 = pts.findIndex((v) => v.y === LABEL_Y0), iBody1 = pts.findIndex((v) => v.y === LABEL_Y1);
    can.add(new THREE.Mesh(new THREE.LatheGeometry(pts.slice(0, iBody0 + 1), 160), alu));
    // the print continues over the shoulder up to the neck, like a real can
    const iNeck = pts.findIndex((v) => v.y === 1.118);
    const shoulder = new THREE.MeshPhysicalMaterial({ color: '#e2253f', metalness: 0.62, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
    can.add(new THREE.Mesh(new THREE.LatheGeometry(pts.slice(iBody1, iNeck + 1), 160), shoulder));
    can.add(new THREE.Mesh(new THREE.LatheGeometry(pts.slice(iNeck), 160), alu));
    // label: u = 0.5 faces +z (the hero side), text reads left to right from outside
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, LABEL_Y1 - LABEL_Y0, 160, 1, true, Math.PI, Math.PI * 2), label);
    body.position.y = (LABEL_Y0 + LABEL_Y1) / 2;
    can.add(body);
    // pull tab and rivet on the lid
    const tabShape = new THREE.Shape();
    tabShape.absarc(0, 0.06, 0.055, Math.PI, 0, true);
    tabShape.lineTo(0.055, -0.07);
    tabShape.absarc(0, -0.07, 0.055, 0, Math.PI, true);
    tabShape.lineTo(-0.055, 0.06);
    const hole = new THREE.Path();
    hole.absellipse(0, -0.065, 0.032, 0.026, 0, Math.PI * 2, false, 0);
    tabShape.holes.push(hole);
    const tab = new THREE.Mesh(new THREE.ExtrudeGeometry(tabShape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.003, bevelSegments: 2, curveSegments: 24 }), alu);
    tab.rotation.x = -Math.PI / 2 + 0.04;
    tab.position.set(0, 1.176, 0.04);
    can.add(tab);
    const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.012, 24), alu);
    rivet.position.set(0, 1.176, 0);
    can.add(rivet);
    // opening score line
    const score = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.0025, 8, 64, Math.PI * 1.4), alu);
    score.rotation.x = Math.PI / 2;
    score.rotation.z = Math.PI * 0.3;
    score.position.set(0, 1.174, -0.11);
    can.add(score);
    // water drops sitting on the can: real little lenses (transmission)
    const DROPS = 420;
    const dropMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.02, ior: 1.33, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 1.4 });
    const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), dropMat, DROPS);
    {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      let seed = 11;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < DROPS; i++) {
        const a = rnd() * Math.PI * 2, y = LABEL_Y0 + 0.03 + rnd() * (LABEL_Y1 - LABEL_Y0 - 0.06);
        const r = 0.003 + rnd() * rnd() * 0.011;
        const n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        q.setFromUnitVectors(up, n);
        // gravity: big drops sag into a slight teardrop
        m.compose(n.clone().multiplyScalar(R + 0.0004).setY(y), q, new THREE.Vector3(r, r * 0.5, r * (1 + Math.min(0.35, r * 30))));
        drops.setMatrixAt(i, m);
      }
    }
    can.add(drops);
    scene.add(can);

    // ---- floor, faded reflection, contact shadow, backdrop
    const floorMat = new THREE.MeshPhysicalMaterial({ color: '#15161b', roughness: 0.55, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.4, depthWrite: false });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 96), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.renderOrder = -2;
    scene.add(floor);
    const reflUniform = { value: 0.35 };
    const mirror = fadedMirror(can, reflUniform);
    scene.add(mirror);
    const shadow = bakeContactShadow(kit, can, 2.4, 0.85, 3.2);
    shadow.plane.position.y = 0.002;
    scene.add(shadow.plane);
    const backMat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color('#1c1e26') }, uPool: { value: new THREE.Color('#e2253f') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uCol; uniform vec3 uPool; varying vec3 vP;
        void main(){
          vec3 d = normalize(vP);
          // seamless cyclorama: the wall starts at the floor's fog colour
          float h = smoothstep(0.0, 0.55, d.y);
          vec3 c = mix(uCol * 0.55, uCol * 1.2, h);
          float pool = exp(-pow(length(vec2(atan(d.x, -d.z) * 1.1, (d.y - 0.18) * 1.6)) * 2.4, 2.0));
          c += mix(uCol, uPool, 0.3) * pool * 0.45 * smoothstep(0.0, 0.2, d.y);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const back = new THREE.Mesh(new THREE.SphereGeometry(20, 48, 24), backMat);
    back.renderOrder = -3;
    scene.add(back);

    // ---- lights: env does most of the work; a key and two rims shape the form
    const key = new THREE.DirectionalLight('#fff3e6', 1.6);
    key.position.set(-2.5, 3.2, 2.6);
    const rimC = new THREE.SpotLight('#cfe0ff', 22, 10, 0.5, 0.8);
    rimC.position.set(2.6, 1.8, -2.2);
    const rimW = new THREE.SpotLight('#ffd7b0', 14, 10, 0.5, 0.8);
    rimW.position.set(-2.8, 1.2, -2.4);
    scene.add(key, rimC, rimW, rimC.target, rimW.target);
    rimC.target.position.set(0, 0.6, 0);
    rimW.target.position.set(0, 0.6, 0);

    // ---- dust in the light
    const N = 160;
    const pos = new Float32Array(N * 3);
    const seeds = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const h = (k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }; seeds.set([h(1) * 4 - 2, h(2) * 2, h(3) * 4 - 2], i * 3); }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sp = document.createElement('canvas'); sp.width = sp.height = 64;
    const sx = sp.getContext('2d')!;
    const gr = sx.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    sx.fillStyle = gr; sx.fillRect(0, 0, 64, 64);
    const dustTex = new THREE.CanvasTexture(sp);
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.012, map: dustTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, sizeAttenuation: true }));
    scene.add(dust);

    // ---- label artwork
    let labelKey = '';
    let labelImg: HTMLImageElement | null = null;
    const drawLabel = (prm: Record<string, number | string>) => {
      const x = lc.getContext('2d')!;
      const W = lc.width, H = lc.height;
      const base = new THREE.Color(fmt(prm.canColor) || '#e2253f');
      const acc = fmt(prm.accent) || '#ffd23f';
      if (labelImg) {
        const k = Math.max(W / labelImg.naturalWidth, H / labelImg.naturalHeight);
        x.drawImage(labelImg, (W - labelImg.naturalWidth * k) / 2, (H - labelImg.naturalHeight * k) / 2, labelImg.naturalWidth * k, labelImg.naturalHeight * k);
      } else {
        const g = x.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#' + base.clone().offsetHSL(0, 0, 0.06).getHexString());
        g.addColorStop(1, '#' + base.clone().offsetHSL(0, 0.02, -0.12).getHexString());
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        // flowing accent waves all the way round
        x.save();
        x.globalAlpha = 0.9;
        for (let k = 0; k < 3; k++) {
          x.beginPath();
          x.moveTo(0, H * (0.74 + k * 0.05));
          for (let u = 0; u <= W; u += 32) x.lineTo(u, H * (0.74 + k * 0.05) + Math.sin(u / W * Math.PI * 6 + k) * H * 0.03);
          x.lineTo(W, H); x.lineTo(0, H); x.closePath();
          x.fillStyle = k === 0 ? acc : k === 1 ? '#ffffff' : '#' + base.clone().offsetHSL(0, 0, -0.18).getHexString();
          x.globalAlpha = k === 1 ? 0.95 : 0.9;
          x.fill();
        }
        x.restore();
        // fine rule lines top and bottom
        x.fillStyle = 'rgba(255,255,255,0.85)';
        x.fillRect(0, H * 0.055, W, H * 0.008);
        x.fillRect(0, H * 0.075, W, H * 0.003);
        // hero typography on the front (u = 0.5)
        const brand = fmt(prm.brand) || 'NOVA';
        let fs = 520;
        x.font = `900 ${fs}px Montserrat, Arial, sans-serif`;
        const bw = x.measureText(brand).width;
        fs = Math.min(fs, (W * 0.3) / Math.max(1, bw) * fs);
        x.font = `900 ${fs}px Montserrat, Arial, sans-serif`;
        x.textAlign = 'center';
        x.textBaseline = 'alphabetic';
        x.fillStyle = '#ffffff';
        x.shadowColor = 'rgba(0,0,0,0.18)'; x.shadowBlur = 24; x.shadowOffsetY = 10;
        x.fillText(brand, W / 2, H * 0.5);
        x.shadowColor = 'transparent';
        x.font = `700 ${Math.round(fs * 0.17)}px Montserrat, Arial, sans-serif`;
        x.fillStyle = acc;
        const flavor = fmt(prm.flavor);
        const spaced = flavor.split('').join(String.fromCharCode(8202));
        x.fillText(spaced, W / 2, H * 0.6);
        // side panels: volume, claims, a barcode on the back
        x.font = `600 ${Math.round(H * 0.035)}px Inter, Arial, sans-serif`;
        x.fillStyle = 'rgba(255,255,255,0.9)';
        x.fillText('330 ml', W * 0.23, H * 0.22);
        x.fillText('ZERO SUGAR · NATURAL CAFFEINE', W * 0.77, H * 0.22);
        x.fillStyle = 'rgba(255,255,255,0.75)';
        for (let r = 0; r < 7; r++) x.fillRect(W * 0.94 - W * 0.06, H * (0.3 + r * 0.035), W * (0.08 - (r % 3) * 0.015), H * 0.012);
        x.fillStyle = '#ffffff';
        x.fillRect(W * 0.02, H * 0.3, W * 0.05, H * 0.2);
        x.fillStyle = '#111111';
        for (let b = 0, u = W * 0.025; u < W * 0.065; b++) { const w = ((b * 7) % 3 + 1) * 5; x.fillRect(u, H * 0.32, w, H * 0.14); u += w + 6; }
      }
      labelTex.needsUpdate = true;
    };
    const syncLabel = (prm: Record<string, number | string>) => {
      const k = [prm.brand, prm.flavor, prm.canColor, prm.accent, String(prm.label ?? '').length, String(prm.label ?? '').slice(-40), labelImg ? 1 : 0].join('|');
      if (k === labelKey) return;
      labelKey = k;
      drawLabel(prm);
    };

    let imgSrc = '';
    return {
      async prepare(prm) {
        await fontReady('900 100px Montserrat', fmt(prm.brand) || 'NOVA');
        await fontReady('700 100px Montserrat', fmt(prm.flavor) || 'A');
        await fontReady('600 100px Inter');
        imgSrc = fmt(prm.label);
        labelImg = await loadImg(imgSrc);
        labelKey = '';
      },
      render(f: FrameState) {
        const prm = f.params;
        if (fmt(prm.label) !== imgSrc) { imgSrc = fmt(prm.label); loadImg(imgSrc).then((i) => { labelImg = i; labelKey = ''; kit.redraw(); }); }
        syncLabel(prm);
        const r = kit.renderer;
        r.toneMappingExposure = Number(prm.exposure ?? 1);
        const L = Number(prm.light ?? 1);
        scene.environmentIntensity = 1.1 * L;
        key.intensity = 1.6 * L; rimC.intensity = 22 * L; rimW.intensity = 14 * L;
        const bd = fmt(prm.backdrop) || '#1c1e26';
        backMat.uniforms.uCol.value.set(bd);
        backMat.uniforms.uPool.value.set(fmt(prm.canColor) || '#e2253f');
        (scene.fog as THREEType.Fog).color.set(bd).multiplyScalar(0.55);
        floorMat.color.set(bd).multiplyScalar(0.62);
        reflUniform.value = Number(prm.reflection ?? 0.35);
        shoulder.color.set(fmt(prm.canColor) || '#e2253f');
        const cond = Number(prm.condensation ?? 0.8);
        drops.count = Math.round(DROPS * cond);
        drops.visible = cond > 0.01;
        label.bumpScale = 1.6 * cond;
        label.roughness = 0.3 + 0.12 * cond; // mist frosts the print a little
        const spin = (Number(prm.spin ?? 0) * f.t * Math.PI) / 180;
        can.rotation.y = mirror.rotation.y = spin;
        // dust drifts slowly through the key light
        for (let i = 0; i < N; i++) {
          const s0 = seeds[i * 3], s1 = seeds[i * 3 + 1], s2 = seeds[i * 3 + 2];
          pos[i * 3] = s0 + Math.sin(f.t * 0.13 + i) * 0.1;
          pos[i * 3 + 1] = ((s1 + f.t * 0.03) % 2 + 2) % 2;
          pos[i * 3 + 2] = s2 + Math.cos(f.t * 0.11 + i * 0.7) * 0.1;
        }
        dustGeo.attributes.position.needsUpdate = true;
        // camera: one continuous move, [p, azimuth°, height, radius, look-at y, fov]
        const k = Number(prm.camera ?? 1);
        const [az, hy, rad, ty, fov] = path([
          [0.0, 30, 1.62, 1.05, 1.12, 30],
          [0.15, 70, 1.5, 1.3, 1.06, 30],
          [0.33, 155, 1.05, 3.1, 0.72, 29],
          [0.5, 235, 0.62, 3.4, 0.62, 28],
          [0.66, 305, 0.25, 3.0, 0.62, 26],
          [0.82, 352, 0.7, 4.3, 0.6, 27],
          [1.0, 360, 0.78, 4.05, 0.6, 27],
        ], f.p);
        const azr = ((360 + (az - 360) * k) * Math.PI) / 180;
        // portrait frames are narrow: keep the can's width comfortably inside
        const radius = rad * (f.W < f.H ? 1 + 0.35 * (1 - f.W / f.H) : 0.8);
        cam.fov = fov;
        cam.aspect = f.W / f.H;
        cam.position.set(Math.sin(azr) * radius, hy, Math.cos(azr) * radius);
        cam.lookAt(0, ty, 0);
        cam.updateProjectionMatrix();
        // gentle fade in / out of black
        r.toneMappingExposure *= 0.2 + 0.8 * easeInOut(seg(f.p, 0, 0.03));
        r.render(scene, cam);
      },
      dispose() {
        scene.traverse((x) => {
          const m = x as THREEType.Mesh;
          if (!m.isMesh && !(x as THREEType.Points).isPoints) return;
          m.geometry.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => mm.dispose());
        });
        labelTex.dispose(); dropTex.dispose(); dustTex.dispose(); env.dispose(); shadow.dispose();
      },
    };
  },
};

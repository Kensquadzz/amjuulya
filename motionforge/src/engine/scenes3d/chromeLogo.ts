// Chrome Logo Reveal — your word (or a traced logo picture) as real extruded,
// bevelled chrome lettering in a dark studio. It emerges from drifting
// smoke, a light sweep travels across the bevels, the camera glides from an
// edge-on angle to the front and the final frame lands with a glint.
import type * as THREEType from 'three';
import { extrude, imageShapes, loadFonts3D, textShapes, FONTS_3D } from '../text3d';
import { easeInOut, easeOut, fadedMirror, glowTexture, path, seg, smokeTexture, type FrameState, type SceneDef, type SceneKit } from '../scene3d';

const fmt = (s: unknown) => String(s ?? '');

/** Dark chrome studio: horizontal strip lights give chrome its bright / dark banding. */
function chromeEnv(kit: SceneKit, tint: string) {
  const { THREE, renderer } = kit;
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uT: { value: new THREE.Color(tint) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    // classic chrome "horizon": bright sky above, a hot line at the horizon,
    // a dark band just below it and a coloured ground glow — flat chrome faces
    // pick up this gradient and read as polished metal, not black
    fragmentShader: `uniform vec3 uT; varying vec3 vP; void main(){ vec3 d = normalize(vP);
      float y = d.y;
      // banded sky: soft white band low, dark gap, bright overhead
      vec3 sky = vec3(0.025, 0.03, 0.045);
      sky += vec3(1.5) * smoothstep(0.06, 0.12, y) * smoothstep(0.32, 0.22, y);
      sky += vec3(0.9, 0.95, 1.0) * 1.8 * smoothstep(0.62, 0.85, y);
      sky += uT * 0.35 * smoothstep(0.3, 0.5, y) * smoothstep(0.65, 0.5, y);
      vec3 ground = mix(uT * 0.25, vec3(0.006), smoothstep(-0.02, -0.5, y));
      vec3 c = y > 0.0 ? sky : ground;
      c += vec3(3.0) * exp(-pow(y * 55.0, 2.0)); // horizon line
      c *= mix(0.35, 1.0, smoothstep(-0.2, 0.6, d.z)); // darker towards the back
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  s.add(room);
  const strip = (w: number, h: number, k: number, color: string, pos: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  strip(14, 0.35, 9, '#ffffff', [0, 4.5, 6]); // long overhead strip in front: top bevels flare
  strip(14, 0.22, 6, '#ffffff', [0, 1.4, 8]); // eye-level strip: lit faces
  strip(14, 0.5, 2.4, tint, [0, -2.5, 7]); // low coloured bounce
  strip(0.4, 8, 7, '#ffffff', [-7, 1, 2]); // side strips: vertical edges
  strip(0.4, 8, 7, tint, [7, 1, 1]);
  strip(10, 3, 1.5, '#ffffff', [0, 6, -6]); // back top
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.01).texture;
  pm.dispose();
  s.traverse((x) => { const m = x as THREEType.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREEType.Material).dispose(); } });
  return tex;
}

export const chromeLogo: SceneDef = {
  id: 'chromeLogo',
  name: 'Chrome Logo Reveal',
  params: [
    { key: 'text', kind: 'text', label: 'Logo text', def: 'CHROME' },
    { key: 'logo', kind: 'image', label: 'Or a logo picture (PNG with transparency)', def: '' },
    { key: 'font', kind: 'text', label: `Font (${Object.keys(FONTS_3D).join(', ')})`, def: 'Montserrat:900' },
    { key: 'tint', kind: 'color', label: 'Chrome tint', def: '#eef2f8' },
    { key: 'streak', kind: 'color', label: 'Light sweep colour', def: '#9cc7ff' },
    { key: 'smoke', kind: 'color', label: 'Smoke colour', def: '#2a3d63' },
    { key: 'depth', kind: 'float', label: 'Extrusion depth', min: 0.05, max: 0.6, def: 0.22 },
    { key: 'bevel', kind: 'float', label: 'Bevel', min: 0, max: 0.06, def: 0.028 },
    { key: 'gloss', kind: 'float', label: 'Polish', min: 0, max: 1, def: 0.92 },
    { key: 'camera', kind: 'float', label: 'Camera movement', min: 0, max: 1.5, def: 1 },
    { key: 'smokeAmount', kind: 'float', label: 'Smoke', min: 0, max: 2, def: 1 },
  ],
  create(kit: SceneKit) {
    const { THREE } = kit;
    const scene = new THREE.Scene();
    let envTint = '';
    let env: THREEType.Texture | null = null;
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 80);

    // chrome with an animated light sweep travelling across it
    const sweep = { uX: { value: -10 }, uCol: { value: new THREE.Color('#9cc7ff') } };
    const chrome = new THREE.MeshPhysicalMaterial({ color: '#eef2f8', metalness: 1, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04 });
    chrome.onBeforeCompile = (sh) => {
      sh.uniforms.uX = sweep.uX;
      sh.uniforms.uCol = sweep.uCol;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform float uX;\nuniform vec3 uCol;')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          float band = exp(-pow((vWP.x + vWP.y * 0.45 - uX) * 7.0, 2.0));
          gl_FragColor.rgb += uCol * band * 1.6;`);
    };
    const side = chrome; // same material on bevels / sides
    const logo = new THREE.Group();
    let mesh: THREEType.Mesh | null = null;
    let mirror: THREEType.Object3D | null = null;
    const reflAmt = { value: 0.3 };
    let logoW = 3, logoH = 1;
    scene.add(logo);

    // stage: glossy black floor with a faded reflection
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: '#020203', roughness: 0.55, metalness: 0, depthWrite: false, envMapIntensity: 0.06 }));
    floor.rotation.x = -Math.PI / 2;
    floor.renderOrder = -2;
    scene.add(floor);
    const back = new THREE.Mesh(new THREE.SphereGeometry(25, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uC: { value: new THREE.Color('#2a3d63') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uC; varying vec3 vP; void main(){ vec3 d = normalize(vP); float g = exp(-pow(length(vec2(d.x * 1.2, d.y - 0.12)) * 2.2, 2.0)); gl_FragColor = vec4(uC * (0.06 + 0.55 * g), 1.0);\n#include <colorspace_fragment>\n}',
    }));
    back.renderOrder = -3;
    scene.add(back);

    // smoke: soft puffs at several depths, drifting
    const smokeTex = smokeTexture(kit, 384);
    // the floor doesn't write depth (so the reflection shows), so clip smoke and rays at it
    const aboveFloor = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
    const puffs: { m: THREEType.Mesh; seed: number }[] = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.4, color: '#2a3d63', fog: false, blending: THREE.AdditiveBlending, clippingPlanes: aboveFloor }));
      m.renderOrder = 5 + i;
      scene.add(m);
      puffs.push({ m, seed: i * 1.618 });
    }
    // light shaft behind the logo, lens streak and glint
    const raysTex = glowTexture(kit, 'rays', 512);
    const rays = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: raysTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: '#9cc7ff', fog: false, clippingPlanes: aboveFloor }));
    rays.position.set(0, 0.9, -3.5);
    rays.scale.setScalar(0.55);
    rays.renderOrder = 4;
    scene.add(rays);
    const glowTex = glowTexture(kit, 'glow');
    const streakQuad = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.08), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
    streakQuad.renderOrder = 20;
    scene.add(streakQuad);
    const starTex = glowTexture(kit, 'star');
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, color: '#ffffff' }));
    glint.renderOrder = 21;
    scene.add(glint);
    const key = new THREE.DirectionalLight('#ffffff', 1.2);
    key.position.set(-2, 4, 5);
    scene.add(key);

    let builtKey = '';
    const build = async (prm: Record<string, number | string>) => {
      const k = [prm.text, String(prm.logo ?? '').length, String(prm.logo ?? '').slice(-32), prm.font, prm.depth, prm.bevel].join('|');
      if (k === builtKey) return;
      builtKey = k;
      const depth = Number(prm.depth ?? 0.22), bevel = Number(prm.bevel ?? 0.028);
      let shapes: THREEType.Shape[];
      const img = fmt(prm.logo);
      if (img) shapes = await imageShapes(THREE, img);
      else shapes = textShapes(THREE, await loadFonts3D(fmt(prm.font) || 'Montserrat:900'), fmt(prm.text) || ' ', 0.02);
      if (k !== builtKey) return; // superseded while loading
      const ex = extrude(THREE, shapes, { depth, bevel, segments: 6, curve: 14, creased: kit.toCreasedNormals, pillow: 0.24 });
      if (mesh) { logo.remove(mesh); mesh.geometry.dispose(); }
      if (mirror) { scene.remove(mirror); mirror.traverse((x) => { const mm = x as THREEType.Mesh; if (mm.isMesh) (mm.material as THREEType.Material).dispose(); }); }
      mesh = new THREE.Mesh(ex.geometry, [chrome, side]);
      logo.add(mesh);
      logoW = ex.width; logoH = ex.height;
      mirror = fadedMirror(logo, reflAmt, 0.9);
      scene.add(mirror);
      kit.redraw();
    };

    return {
      async prepare(prm) { await build(prm); },
      render(f: FrameState) {
        const prm = f.params;
        build(prm); // async rebuild if text / logo / bevel changed
        const r = kit.renderer;
        r.localClippingEnabled = true;
        const tint = fmt(prm.tint) || '#eef2f8';
        const smokeC = fmt(prm.smoke) || '#2a3d63';
        if (smokeC !== envTint) {
          env?.dispose(); env = chromeEnv(kit, smokeC); scene.environment = env; envTint = smokeC;
          // a material's envMapIntensity only applies to its own envMap (scene.environment ignores it)
          const fm = floor.material as THREEType.MeshStandardMaterial;
          fm.envMap = env; fm.envMapIntensity = 0.05; fm.needsUpdate = true;
        }
        chrome.color.set(tint);
        chrome.roughness = 0.02 + (1 - Number(prm.gloss ?? 0.92)) * 0.4;
        sweep.uCol.value.set(fmt(prm.streak) || '#9cc7ff');
        (rays.material as THREEType.MeshBasicMaterial).color.set(fmt(prm.streak) || '#9cc7ff');
        (back.material as THREEType.ShaderMaterial).uniforms.uC.value.set(smokeC);
        // fit the logo: 1 unit tall lettering scaled to a comfortable width
        const portrait = f.W < f.H;
        const targetW = portrait ? 2.2 : 3.4;
        const s = Math.min(targetW / Math.max(0.1, logoW), 1.3 / Math.max(0.1, logoH));
        logo.scale.setScalar(s);
        const lift = (logoH * s) / 2 + 0.06;
        logo.position.y = lift;
        logo.rotation.x = -0.12;
        if (mirror) mirror.rotation.x = 0.12;
        if (mirror) { mirror.scale.set(s, -s, s); mirror.position.y = -lift; }
        // reveal and light sweep
        const p = f.p;
        const reveal = easeOut(seg(p, 0.02, 0.3));
        r.toneMappingExposure = 0.25 + 0.75 * reveal;
        const sx = -6 + 12 * easeInOut(seg(p, 0.42, 0.72));
        sweep.uX.value = sx;
        reflAmt.value = 0.32 * reveal;
        // camera: edge-on glide -> front -> slow push -> settle
        const k = Number(prm.camera ?? 1);
        const [az, hy, dist, fov] = path([
          [0, 58, 0.25, 0.62, 32],
          [0.28, 22, 0.55, 0.85, 30],
          [0.55, 4, 0.7, 1.0, 28],
          [0.85, -2, 0.62, 0.94, 27],
          [1, 0, 0.6, 0.96, 27],
        ], p);
        const vf = (fov * Math.PI) / 180;
        const hf = 2 * Math.atan(Math.tan(vf / 2) * (f.W / f.H));
        const fitDist = ((targetW * 0.62) / Math.tan(Math.min(hf, vf * 1.6) / 2));
        const a = (az * k * Math.PI) / 180;
        cam.fov = fov;
        cam.aspect = f.W / f.H;
        cam.position.set(Math.sin(a) * fitDist * dist, lift + (hy - 0.5) * k + 0.1, Math.cos(a) * fitDist * dist);
        cam.lookAt(0, lift * 0.95, 0);
        cam.updateProjectionMatrix();
        // smoke drifts and thins out as the logo is revealed
        const amt = Number(prm.smokeAmount ?? 1);
        puffs.forEach(({ m, seed }, i) => {
          // behind the lettering and low over the floor, never between it and the lens
          const z = -3.2 + (i % 3) * 1.1;
          m.position.set(Math.sin(seed * 3.1 + f.t * 0.05) * 2.6 + (i - 4) * 0.6 + f.t * 0.06 * ((i % 2) * 2 - 1), 0.25 + Math.abs(Math.cos(seed * 2.3)) * 1.2 + f.t * 0.015, z);
          m.rotation.z = seed + f.t * 0.03 * ((i % 2) * 2 - 1);
          m.lookAt(cam.position.x, m.position.y, cam.position.z);
          const mat = m.material as THREEType.MeshBasicMaterial;
          mat.color.set(smokeC).multiplyScalar(2.2);
          mat.opacity = amt * 0.42 * (1 - 0.35 * reveal);
        });
        (rays.material as THREEType.MeshBasicMaterial).opacity = 0.12 * reveal * (0.8 + 0.2 * Math.sin(f.t * 0.7));
        rays.lookAt(cam.position);
        // lens streak follows the sweep, glint at the end on the top-right corner
        const st = Math.exp(-Math.pow((p - 0.57) * 9, 2));
        (streakQuad.material as THREEType.MeshBasicMaterial).opacity = st * 0.8;
        (streakQuad.material as THREEType.MeshBasicMaterial).color.set(fmt(prm.streak) || '#9cc7ff');
        streakQuad.position.set(sx * 0.4, lift + logoH * s * 0.15, 0.6);
        streakQuad.lookAt(cam.position);
        const gk = seg(p, 0.84, 0.9) * (1 - seg(p, 0.95, 1));
        glint.position.set((logoW * s) / 2 - 0.05, lift + (logoH * s) / 2 - 0.02, (Number(prm.depth ?? 0.22) * s) / 2 + 0.03);
        glint.scale.setScalar(0.9 * gk + 0.0001);
        glint.material.rotation = p * 3;
        r.render(scene, cam);
      },
      dispose() {
        scene.traverse((x) => {
          const m = x as THREEType.Mesh;
          if (!m.isMesh && !(x as THREEType.Sprite).isSprite) return;
          m.geometry?.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => mm.dispose());
        });
        env?.dispose(); smokeTex.dispose(); raysTex.dispose(); glowTex.dispose(); starTex.dispose();
      },
    };
  },
};

// Liquid Glass — thick refractive glass drops (marching-cubes metaballs)
// drift and merge in front of a flowing colour field, then gather and become
// your word as solid, bevelled glass: real transmission with thickness,
// dispersion and tinted absorption, studio highlights on the rounded edges,
// and a soft shadow behind the letters so they stay legible.
import type * as THREEType from 'three';
import { extrude, loadFonts3D, textShapes, FONTS_3D } from '../text3d';
import { easeInOut, easeOut, path, seg, studioEnv, type FrameState, type SceneDef, type SceneKit } from '../scene3d';

const fmt = (s: unknown) => String(s ?? '');

export const liquidGlass: SceneDef = {
  id: 'liquidGlass',
  name: 'Liquid Glass',
  params: [
    { key: 'text', kind: 'text', label: 'Word formed in glass', def: 'FLOW' },
    { key: 'font', kind: 'text', label: `Font (${Object.keys(FONTS_3D).join(', ')})`, def: 'Montserrat:900' },
    { key: 'colorA', kind: 'color', label: 'Colour field A', def: '#5b2bff' },
    { key: 'colorB', kind: 'color', label: 'Colour field B', def: '#14b8ff' },
    { key: 'colorC', kind: 'color', label: 'Colour field C', def: '#ff4fa3' },
    { key: 'tint', kind: 'color', label: 'Glass tint', def: '#dcd4ff' },
    { key: 'ior', kind: 'float', label: 'Refraction', min: 1.05, max: 2, def: 1.5 },
    { key: 'dispersion', kind: 'float', label: 'Rainbow dispersion', min: 0, max: 10, def: 6 },
    { key: 'flow', kind: 'float', label: 'Flow speed', min: 0, max: 2, def: 1 },
    { key: 'camera', kind: 'float', label: 'Camera movement', min: 0, max: 1.5, def: 1 },
  ],
  create(kit: SceneKit) {
    const { THREE } = kit;
    const scene = new THREE.Scene();
    const env = studioEnv(kit, { key: 1.4, strips: 2.4, room: '#07070b' }); // sharp bright strips = crisp glass highlights
    scene.environment = env;
    scene.environmentIntensity = 1.15;
    const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 60);

    // flowing colour field: what the glass refracts
    const field = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uFade: { value: 1 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uC: { value: new THREE.Color() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uT, uFade; uniform vec3 uA, uB, uC; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * n(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
        void main(){
          vec2 p = vUv * vec2(3.2, 2.0);
          float t = uT * 0.05;
          vec2 w = vec2(fbm(p * 0.7 + vec2(t, -t * 0.7)), fbm(p * 0.9 - vec2(t * 0.8, t * 0.4) + 4.0));
          // silk ribbons of light drifting through a near-black space: crisp
          // bright bands are what make real glass read (you see them bend inside it)
          vec3 c = vec3(0.004, 0.004, 0.012);
          for (int k = 0; k < 3; k++) {
            float fk = float(k);
            float y = vUv.y + (w.x - 0.5) * (0.55 + fk * 0.1) + sin(vUv.x * (2.2 + fk) + t * (3.0 + fk) + fk * 2.1) * 0.12 - 0.25 - fk * 0.24;
            float core = exp(-pow(y / (0.012 + 0.01 * w.y), 2.0));
            float glow = exp(-pow(y / 0.09, 2.0));
            vec3 col = k == 0 ? uA : (k == 1 ? uB : uC);
            float along = 0.55 + 0.45 * sin(vUv.x * 5.0 - t * 4.0 + fk * 1.7 + w.y * 6.0);
            c += col * (core * 1.8 + glow * 0.18) * along;
          }
          c += mix(uA, uC, vUv.x) * 0.05 * fbm(p * 1.5 + w * 2.0);
          float v = length((vUv - 0.5) * vec2(1.3, 1.0));
          c *= (1.0 - smoothstep(0.2, 0.75, v) * 0.75) * uFade;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      depthWrite: false,
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(24, 15), field);
    back.position.z = -4;
    scene.add(back);

    // glass
    const glassOpts = { color: '#ffffff', metalness: 0, roughness: 0, transmission: 1, thickness: 1.5, ior: 1.5, dispersion: 6, attenuationColor: new THREE.Color('#ffffff'), attenuationDistance: 6, specularIntensity: 1, iridescence: 0.35, iridescenceIOR: 1.3, iridescenceThicknessRange: [180, 520] as [number, number], clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 2.4 };
    const blobGlass = new THREE.MeshPhysicalMaterial(glassOpts);
    // lettering: thick clear glass with a faint inner glow; the dark halo behind keeps it legible
    const textGlass = new THREE.MeshPhysicalMaterial({ ...glassOpts, color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.12, thickness: 1.1, roughness: 0.04, attenuationDistance: 1.6 });
    const blobs = new kit.MarchingCubes(44, blobGlass, false, false, 60000);
    blobs.isolation = 60;
    blobs.scale.setScalar(1.6);
    scene.add(blobs);
    const word = new THREE.Group();
    scene.add(word);
    let wordMesh: THREEType.Mesh | null = null;
    // dark soft halo behind the letters keeps glass type readable on bright colour
    const haloC = document.createElement('canvas');
    haloC.width = 1024; haloC.height = 512;
    const haloTex = new THREE.CanvasTexture(haloC);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, color: '#000000' }));
    halo.position.z = -1.2;
    scene.add(halo);
    let wordW = 2, wordH = 0.8;

    const key = new THREE.DirectionalLight('#ffffff', 1.4);
    key.position.set(-3, 4, 4);
    const moving = new THREE.PointLight('#ffffff', 0, 8);
    // coloured rims trace the bevels so the glass edges read against the dark field
    const rimA = new THREE.PointLight('#7cc8ff', 18, 9);
    rimA.position.set(3.2, 1.6, -1.5);
    const rimB = new THREE.PointLight('#ff6fb5', 14, 9);
    rimB.position.set(-3.2, -1.4, -1.2);
    scene.add(key, moving, rimA, rimB);

    let built = '';
    const build = async (prm: Record<string, number | string>) => {
      const k = [prm.text, prm.font].join('|');
      if (k === built) return;
      built = k;
      const fonts = await loadFonts3D(fmt(prm.font) || 'Montserrat:900');
      if (k !== built) return;
      const ex = extrude(THREE, textShapes(THREE, fonts, fmt(prm.text) || ' ', 0.03), { depth: 0.32, bevel: 0.065, segments: 8, curve: 16, creased: kit.toCreasedNormals });
      if (wordMesh) { word.remove(wordMesh); wordMesh.geometry.dispose(); }
      wordMesh = new THREE.Mesh(ex.geometry, textGlass);
      word.add(wordMesh);
      wordW = ex.width; wordH = ex.height;
      // halo: blurred silhouette of the word
      const x = haloC.getContext('2d')!;
      x.clearRect(0, 0, 1024, 512);
      x.filter = 'blur(28px)';
      x.fillStyle = 'rgba(0,0,0,0.9)';
      x.font = `900 ${Math.min(300, 900 / Math.max(1, (fmt(prm.text) || ' ').length))}px Montserrat, Arial, sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(fmt(prm.text) || ' ', 512, 256);
      x.filter = 'none';
      haloTex.needsUpdate = true;
      kit.redraw();
    };

    return {
      async prepare(prm) { await build(prm); },
      render(f: FrameState) {
        const prm = f.params;
        build(prm);
        const r = kit.renderer;
        r.toneMappingExposure = 1;
        field.uniforms.uT.value = f.t * Number(prm.flow ?? 1);
        field.uniforms.uA.value.set(fmt(prm.colorA) || '#5b2bff');
        field.uniforms.uB.value.set(fmt(prm.colorB) || '#14b8ff');
        field.uniforms.uC.value.set(fmt(prm.colorC) || '#ff4fa3');
        for (const m of [blobGlass, textGlass]) {
          m.ior = Number(prm.ior ?? 1.5);
          m.dispersion = Number(prm.dispersion ?? 6);
        }
        // the drops stay nearly clear (only a whisper of tint); the lettering carries the full tint
        textGlass.attenuationColor.set(fmt(prm.tint) || '#dcd4ff');
        blobGlass.attenuationColor.set('#ffffff').lerp(textGlass.attenuationColor, 0.12);
        const p = f.p;
        // drops: wander, then gather into the centre and shrink as the word forms
        const gather = easeInOut(seg(p, 0.46, 0.66));
        const shrink = 1 - easeInOut(seg(p, 0.56, 0.7));
        blobs.visible = shrink > 0.01;
        if (blobs.visible) {
          blobs.reset();
          const t = f.t * 0.32 * Number(prm.flow ?? 1);
          for (let i = 0; i < 7; i++) {
            const fx = 0.5 + Math.sin(t * (0.7 + i * 0.11) + i * 2.1) * 0.27 * (1 - gather);
            const fy = 0.5 + Math.cos(t * (0.6 + i * 0.13) + i * 1.3) * 0.2 * (1 - gather);
            const fz = 0.5 + Math.sin(t * 0.5 + i * 2.7) * 0.12 * (1 - gather);
            blobs.addBall(fx, fy, fz, (0.55 + 0.25 * Math.sin(i * 3.1)) * shrink * shrink + 0.0001, 12);
          }
          blobs.update();
        }
        // the word grows out of the merged glass
        const form = easeOut(seg(p, 0.6, 0.82));
        const portrait = f.W < f.H;
        const targetW = portrait ? 2.1 : 3.3;
        const s = (Math.min(targetW / Math.max(0.1, wordW), 1.4 / Math.max(0.1, wordH))) * (0.55 + 0.45 * form);
        word.scale.setScalar(s * Math.max(0.0001, form));
        word.rotation.y = (1 - form) * 0.6;
        word.visible = form > 0.001;
        halo.visible = word.visible;
        halo.scale.set(wordW * s * 1.9, wordH * s * 2.6, 1);
        (halo.material as THREEType.MeshBasicMaterial).opacity = 0.7 * form;
        // a highlight light glides across the glass at the end
        moving.intensity = 6 * seg(p, 0.78, 0.84) * (1 - seg(p, 0.95, 1));
        moving.position.set(-3 + 6 * easeInOut(seg(p, 0.78, 0.98)), 1.2, 2.2);
        // camera: slow drifting orbit among the drops, settling front-on for the word
        const k = Number(prm.camera ?? 1);
        const [az, hy, dist, fov] = path([
          [0, -28, 0.35, 6.2, 34],
          [0.3, 12, -0.15, 5.4, 33],
          [0.55, 30, 0.2, 5.0, 32],
          [0.78, 4, 0.05, 5.6, 31],
          [1, 0, 0.0, 5.9, 31],
        ], p);
        const a = (az * k * Math.PI) / 180;
        const fitK = portrait ? 1.25 : 1;
        cam.fov = fov;
        cam.aspect = f.W / f.H;
        cam.position.set(Math.sin(a) * dist * fitK, hy * k, Math.cos(a) * dist * fitK);
        cam.lookAt(0, 0, 0);
        cam.updateProjectionMatrix();
        back.lookAt(cam.position.x * 0.2, cam.position.y * 0.2, 10);
        field.uniforms.uFade.value = 0.45 + 0.55 * easeInOut(seg(p, 0, 0.06));
        rimA.color.set(fmt(prm.colorB) || '#14b8ff');
        rimB.color.set(fmt(prm.colorC) || '#ff4fa3');
        r.render(scene, cam);
      },
      dispose() {
        scene.traverse((x) => {
          const m = x as THREEType.Mesh;
          if (!m.isMesh) return;
          m.geometry?.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => mm.dispose());
        });
        env.dispose(); haloTex.dispose();
      },
    };
  },
};

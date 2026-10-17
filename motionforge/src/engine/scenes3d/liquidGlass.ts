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
    { key: 'tint', kind: 'color', label: 'Glass tint', def: '#c4b5ff' },
    { key: 'ior', kind: 'float', label: 'Refraction', min: 1.05, max: 2, def: 1.5 },
    { key: 'dispersion', kind: 'float', label: 'Rainbow dispersion', min: 0, max: 10, def: 6 },
    { key: 'flow', kind: 'float', label: 'Flow speed', min: 0, max: 2, def: 1 },
    { key: 'camera', kind: 'float', label: 'Camera movement', min: 0, max: 1.5, def: 1 },
  ],
  create(kit: SceneKit) {
    const { THREE } = kit;
    const scene = new THREE.Scene();
    const env = studioEnv(kit, { key: 1.2, strips: 1.4, room: '#0b0b12' });
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
          float t = uT * 0.06;
          vec2 w = vec2(fbm(p + vec2(t, -t * 0.7)), fbm(p * 1.3 - vec2(t * 0.8, t * 0.4) + 4.0));
          float a = fbm(p * 0.8 + w * 1.8 + t);
          // hue drifts across the frame (A -> C) with B pooling in the eddies
          vec3 c = mix(uA, uC, smoothstep(0.15, 0.85, vUv.x * 0.8 + (w.x - 0.5) * 1.2 + 0.1));
          c = mix(c, uB, smoothstep(0.52, 0.78, fbm(p * 1.1 - w * 1.4 - t)));
          // fine liquid caustic lines give the refraction something to bend
          float lines = 1.0 - smoothstep(0.0, 0.025, 0.5 - abs(fract(a * 7.0 + w.x * 2.0) - 0.5));
          float fine = 1.0 - smoothstep(0.0, 0.03, 0.5 - abs(fract(fbm(p * 2.2 - w * 2.0 + t * 1.5) * 9.0) - 0.5));
          c += lines * 0.9 * (0.3 + c) + fine * 0.25 * (0.2 + c);
          // deep night base: colour only lives in the flowing veins, the rest stays ink-dark
          float body = smoothstep(0.5, 0.74, a) * (0.65 + 0.35 * sin(w.y * 9.0 + a * 6.0));
          c = mix(vec3(0.004, 0.004, 0.014) + c * 0.02, c * 0.6, clamp(body, 0.0, 1.0));
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
    const glassOpts = { color: '#ffffff', metalness: 0, roughness: 0.04, transmission: 1, thickness: 1.0, ior: 1.5, dispersion: 6, attenuationColor: new THREE.Color('#c4b5ff'), attenuationDistance: 3, specularIntensity: 1, iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [180, 520] as [number, number], clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.8 };
    const blobGlass = new THREE.MeshPhysicalMaterial(glassOpts);
    // lettering is lightly frosted glass: brighter and more legible than clear glass, with clear polished bevels catching the rims
    const textGlass = new THREE.MeshPhysicalMaterial({ ...glassOpts, color: '#f4f2ff', emissive: '#4a3a8c', emissiveIntensity: 0.35, transmission: 0.82, thickness: 0.7, roughness: 0.16, attenuationDistance: 2.4, clearcoatRoughness: 0.02 });
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
        textGlass.attenuationColor.set(fmt(prm.tint) || '#c4b5ff');
        blobGlass.attenuationColor.set('#ffffff').lerp(textGlass.attenuationColor, 0.25);
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
        (halo.material as THREEType.MeshBasicMaterial).opacity = 0.35 * form;
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

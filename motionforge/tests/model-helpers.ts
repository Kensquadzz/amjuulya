// Browser-side helpers for tests/model.mjs (bare imports resolved by Vite).
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/** A small animated GLB as a data URL: a torus knot that bounces up and back over 2 s. */
export async function makeTestGLB(): Promise<string> {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 128, 24), new THREE.MeshStandardMaterial({ color: 0x22d3ee, metalness: 0.6, roughness: 0.3 }));
  mesh.name = 'knot';
  scene.add(mesh);
  const clip = new THREE.AnimationClip('bounce', 2, [new THREE.VectorKeyframeTrack('knot.position', [0, 1, 2], [0, 0, 0, 0, 1.5, 0, 0, 0, 0])]);
  const glb = (await new GLTFExporter().parseAsync(scene, { binary: true, animations: [clip] })) as ArrayBuffer;
  const bytes = new Uint8Array(glb);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'data:model/gltf-binary;base64,' + btoa(bin);
}

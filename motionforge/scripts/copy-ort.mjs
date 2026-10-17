// Copies the onnxruntime-web WASM runtime into public/ort so it is served
// with the app (loaded only when background removal is first used).
import { copyFileSync, mkdirSync } from 'node:fs';
const src = 'node_modules/onnxruntime-web/dist/';
mkdirSync('public/ort', { recursive: true });
for (const f of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) copyFileSync(src + f, 'public/ort/' + f);
console.log('copied onnxruntime-web runtime to public/ort');

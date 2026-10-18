// Writes the mascot SVG asset files (public/assets/mascot/*) and the favicon from lib/mascot.js.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mascotSVG, mascotIconSVG, EXPRESSIONS } from '../lib/mascot.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public/assets/mascot');
mkdirSync(out, { recursive: true });
const standalone = (svg) => svg.replace('<svg class="mascot ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" class="mascot ');
for (const e of EXPRESSIONS) writeFileSync(path.join(out, `ulaan-mascot-${e}.svg`), standalone(mascotSVG({ expression: e, id: `m-${e}`, title: `Ulaan — ${e}` })));
writeFileSync(path.join(out, 'ulaan-icon.svg'), mascotIconSVG());
writeFileSync(path.join(out, 'ulaan-icon-dark.svg'), mascotIconSVG({ background: '#111111' }));
writeFileSync(path.join(root, 'public/assets/img/favicon.svg'), mascotIconSVG());
console.log('Mascot assets written to public/assets/mascot/');

// Real 3D lettering for Three.js scenes: glyph outlines from the app's own
// self-hosted fonts (opentype.js reads the WOFF files) become THREE.Shapes and
// are extruded with true bevels. Latin and Cyrillic subsets are combined per
// character. A logo picture can be traced (marching squares) into shapes too.
import type * as THREEType from 'three';
import type { Font } from 'opentype.js';

import montserrat900L from '@fontsource/montserrat/files/montserrat-latin-900-normal.woff?url';
import montserrat900C from '@fontsource/montserrat/files/montserrat-cyrillic-900-normal.woff?url';
import montserrat700L from '@fontsource/montserrat/files/montserrat-latin-700-normal.woff?url';
import montserrat700C from '@fontsource/montserrat/files/montserrat-cyrillic-700-normal.woff?url';
import playfair700L from '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff?url';
import playfair700C from '@fontsource/playfair-display/files/playfair-display-cyrillic-700-normal.woff?url';
import inter800L from '@fontsource/inter/files/inter-latin-800-normal.woff?url';
import inter800C from '@fontsource/inter/files/inter-cyrillic-800-normal.woff?url';
import unbounded800L from '@fontsource/unbounded/files/unbounded-latin-800-normal.woff?url';
import unbounded800C from '@fontsource/unbounded/files/unbounded-cyrillic-800-normal.woff?url';
import bebasL from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff?url';
import syne800L from '@fontsource/syne/files/syne-latin-800-normal.woff?url';
import space700L from '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff?url';

/** Fonts available as 3D type: "Family:weight" -> [latin, cyrillic?] WOFF urls. */
export const FONTS_3D: Record<string, string[]> = {
  'Montserrat:900': [montserrat900L, montserrat900C],
  'Montserrat:700': [montserrat700L, montserrat700C],
  'Playfair Display:700': [playfair700L, playfair700C],
  'Inter:800': [inter800L, inter800C],
  'Unbounded:800': [unbounded800L, unbounded800C],
  'Bebas Neue:400': [bebasL],
  'Syne:800': [syne800L],
  'Space Grotesk:700': [space700L],
};

const fontCache = new Map<string, Promise<Font>>();
async function loadFont(url: string): Promise<Font> {
  let p = fontCache.get(url);
  if (!p) {
    p = (async () => {
      const [{ parse }, buf] = await Promise.all([import('opentype.js'), fetch(url).then((r) => r.arrayBuffer())]);
      return parse(buf);
    })();
    fontCache.set(url, p);
    p.catch(() => fontCache.delete(url));
  }
  return p;
}

export async function loadFonts3D(key: string): Promise<Font[]> {
  const urls = FONTS_3D[key] ?? FONTS_3D['Montserrat:900'];
  return Promise.all(urls.map(loadFont));
}

type Cmd = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };

function area(pts: { x: number; y: number }[]) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x - pts[i].x) * (pts[j].y + pts[i].y);
  return a / 2;
}

/** Outline shapes of `text` (y up, font size 1 = cap height about 0.7). */
export function textShapes(THREE: typeof THREEType, fonts: Font[], text: string, letterSpacing = 0): THREEType.Shape[] {
  const shapes: THREEType.Shape[] = [];
  const lines = text.split('\n');
  const lineH = 1.15;
  lines.forEach((line, li) => {
    let x = 0;
    const lineShapes: THREEType.Shape[] = [];
    let prev: { font: Font; glyph: ReturnType<Font['charToGlyph']> } | null = null;
    for (const ch of line) {
      const font = fonts.find((f) => f.charToGlyphIndex(ch) > 0) ?? fonts[0];
      const glyph = font.charToGlyph(ch);
      const k = 1 / font.unitsPerEm;
      if (prev && prev.font === font) x += font.getKerningValue(prev.glyph, glyph) * k;
      const raw = glyph.getPath(x, 0, 1).commands as Cmd[];
      // drop the explicit return-to-start before Z (a duplicated closing point breaks triangulation)
      const cmds: Cmd[] = [];
      let start: Cmd | null = null;
      raw.forEach((c, i) => {
        if (c.type === 'M') start = c;
        const next = raw[i + 1];
        if (c.type === 'L' && start && (!next || next.type === 'Z' || next.type === 'M') && Math.abs(c.x! - start.x!) < 1e-6 && Math.abs(c.y! - start.y!) < 1e-6) return;
        cmds.push(c);
      });
      // collect sub-paths; decide winding from the largest contour of the glyph
      const sp = new THREE.ShapePath();
      const contours: { x: number; y: number }[][] = [];
      let cur: { x: number; y: number }[] = [];
      for (const c of cmds) {
        if (c.type === 'M') { sp.moveTo(c.x!, -c.y!); cur = [{ x: c.x!, y: -c.y! }]; contours.push(cur); }
        else if (c.type === 'L') { sp.lineTo(c.x!, -c.y!); cur.push({ x: c.x!, y: -c.y! }); }
        else if (c.type === 'Q') { sp.quadraticCurveTo(c.x1!, -c.y1!, c.x!, -c.y!); cur.push({ x: c.x!, y: -c.y! }); }
        else if (c.type === 'C') { sp.bezierCurveTo(c.x1!, -c.y1!, c.x2!, -c.y2!, c.x!, -c.y!); cur.push({ x: c.x!, y: -c.y! }); }
      }
      if (contours.length) {
        const big = contours.reduce((a, b) => (Math.abs(area(b)) > Math.abs(area(a)) ? b : a));
        const ccw = area(big) < 0; // area() is positive for clockwise in y-up
        lineShapes.push(...sp.toShapes(ccw));
      }
      x += glyph.advanceWidth! * k + letterSpacing;
      prev = { font, glyph };
    }
    // centre the line horizontally
    const w = x - letterSpacing;
    const dy = ((lines.length - 1) / 2 - li) * lineH;
    for (const s of lineShapes) {
      const moved = new THREE.Shape();
      s.getPoints(); // ensure curves are valid
      moved.curves = s.curves.map((c) => { const cc = c.clone(); shiftCurve(cc, -w / 2, dy); return cc; });
      moved.holes = s.holes.map((h) => { const hp = new THREE.Path(); hp.curves = h.curves.map((c) => { const cc = c.clone(); shiftCurve(cc, -w / 2, dy); return cc; }); return hp; });
      shapes.push(moved);
    }
  });
  return shapes;
}

function shiftCurve(c: THREEType.Curve<THREEType.Vector2>, dx: number, dy: number) {
  for (const k of ['v0', 'v1', 'v2', 'v3'] as const) {
    const v = (c as unknown as Record<string, THREEType.Vector2 | undefined>)[k];
    if (v) { v.x += dx; v.y += dy; }
  }
}

/** Trace a logo picture (alpha, or contrast to the corner colour) into shapes, ~1 unit tall. */
export async function imageShapes(THREE: typeof THREEType, src: string): Promise<THREEType.Shape[]> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const S = 360;
  const k = S / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(2, Math.round(img.naturalWidth * k)) + 4, h = Math.max(2, Math.round(img.naturalHeight * k)) + 4;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 2, 2, w - 4, h - 4);
  const d = x.getImageData(0, 0, w, h).data;
  let opaque = true;
  for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) { opaque = false; break; }
  const p0 = (2 * w + 2) * 4;
  const bg = d[p0] * 0.2126 + d[p0 + 1] * 0.7152 + d[p0 + 2] * 0.0722;
  const m = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) {
    m[i] = opaque ? Math.min(1, Math.abs(d[i * 4] * 0.2126 + d[i * 4 + 1] * 0.7152 + d[i * 4 + 2] * 0.0722 - bg) / 64) : d[i * 4 + 3] / 255;
  }
  const rings = marchingSquares(m, w, h, 0.5).map((r) => simplify(r, 0.6)).filter((r) => r.length >= 3 && Math.abs(area(r)) > 4);
  // nesting depth decides outer (even) vs hole (odd)
  const depth = rings.map((r, i) => rings.reduce((n, o, j) => (j !== i && Math.abs(area(o)) > Math.abs(area(r)) && inside(r[0], o) ? n + 1 : n), 0));
  const sc = 1 / h;
  const toV = (r: { x: number; y: number }[]) => r.map((p) => new THREE.Vector2((p.x - w / 2) * sc, (h / 2 - p.y) * sc));
  const shapes: { s: THREEType.Shape; ring: { x: number; y: number }[] }[] = [];
  rings.forEach((r, i) => { if (depth[i] % 2 === 0) shapes.push({ s: new THREE.Shape(toV(r)), ring: r }); });
  rings.forEach((r, i) => {
    if (depth[i] % 2 === 1) {
      // attach to the smallest outer ring that contains it
      const host = shapes.filter((o) => inside(r[0], o.ring)).sort((a, b) => Math.abs(area(a.ring)) - Math.abs(area(b.ring)))[0];
      host?.s.holes.push(new THREE.Path(toV(r)));
    }
  });
  return shapes.map((o) => o.s);
}

function inside(p: { x: number; y: number }, poly: { x: number; y: number }[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if ((poly[i].y > p.y) !== (poly[j].y > p.y) && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) c = !c;
  }
  return c;
}

/** Iso-contours of a scalar field as closed rings (pixel coordinates). */
function marchingSquares(f: Float32Array, w: number, h: number, iso: number) {
  const segs = new Map<string, [number, number, number, number]>();
  const key = (x: number, y: number) => `${Math.round(x * 64)},${Math.round(y * 64)}`;
  const lerp = (a: number, b: number) => (iso - a) / (b - a || 1e-6);
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const a = f[y * w + x], b = f[y * w + x + 1], c = f[(y + 1) * w + x + 1], d = f[(y + 1) * w + x];
    const idx = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const top = [x + lerp(a, b), y], right = [x + 1, y + lerp(b, c)], bottom = [x + lerp(d, c), y + 1], left = [x, y + lerp(a, d)];
    const add = (p: number[], q: number[]) => segs.set(key(p[0], p[1]), [p[0], p[1], q[0], q[1]]);
    switch (idx) {
      case 1: add(left, bottom); break; case 2: add(bottom, right); break; case 3: add(left, right); break;
      case 4: add(right, top); break; case 5: add(left, top); add(right, bottom); break; case 6: add(bottom, top); break;
      case 7: add(left, top); break; case 8: add(top, left); break; case 9: add(top, bottom); break;
      case 10: add(top, right); add(bottom, left); break; case 11: add(top, right); break; case 12: add(right, left); break;
      case 13: add(right, bottom); break; case 14: add(bottom, left); break;
    }
  }
  const rings: { x: number; y: number }[][] = [];
  while (segs.size) {
    const [k0, s0] = segs.entries().next().value as [string, [number, number, number, number]];
    segs.delete(k0);
    const ring = [{ x: s0[0], y: s0[1] }];
    let nx = s0[2], ny = s0[3];
    for (let guard = 0; guard < 200000; guard++) {
      ring.push({ x: nx, y: ny });
      const k = key(nx, ny);
      const s = segs.get(k);
      if (!s) break;
      segs.delete(k);
      nx = s[2]; ny = s[3];
    }
    rings.push(ring);
  }
  return rings;
}

/** Ramer–Douglas–Peucker simplification of a closed ring. */
function simplify(pts: { x: number; y: number }[], eps: number): { x: number; y: number }[] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1, bi = -1;
    const ax = pts[a].x, ay = pts[a].y, bx = pts[b].x, by = pts[b].y;
    const L = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) {
      const dd = Math.abs((by - ay) * pts[i].x - (bx - ax) * pts[i].y + bx * ay - by * ax) / L;
      if (dd > best) { best = dd; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Extruded, bevelled, centred geometry for text or a traced logo; returns its size. */
export function extrude(THREE: typeof THREEType, shapes: THREEType.Shape[], o: { depth: number; bevel: number; segments?: number; curve?: number; creased?: (g: THREEType.BufferGeometry, angle: number) => THREEType.BufferGeometry; pillow?: number }) {
  const g = new THREE.ExtrudeGeometry(shapes, {
    depth: o.depth, bevelEnabled: o.bevel > 0, bevelThickness: o.bevel, bevelSize: o.bevel * 0.8, bevelOffset: 0,
    bevelSegments: o.segments ?? 5, curveSegments: o.curve ?? 10,
  });
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -(b.min.z + b.max.z) / 2);
  // Front/back caps stay perfectly flat; only the sides and bevel rounds are
  // smoothed (creasing the whole mesh tilts the cap's outline normals and
  // shows long shading wedges across the faces).
  if (!o.creased) return { geometry: g, width: b.max.x - b.min.x, height: b.max.y - b.min.y };
  // ExtrudeGeometry adds a caps group (material 0) and a sides group (material 1) per shape
  const part = (mat: number) => {
    const out = new THREE.BufferGeometry();
    const groups = g.groups.filter((gr) => gr.materialIndex === mat);
    for (const name of ['position', 'normal', 'uv']) {
      const at = g.getAttribute(name) as THREEType.BufferAttribute;
      const n = at.itemSize;
      const total = groups.reduce((a2, gr) => a2 + gr.count, 0);
      const arr = new Float32Array(total * n);
      let off = 0;
      for (const gr of groups) { arr.set((at.array as Float32Array).subarray(gr.start * n, (gr.start + gr.count) * n), off); off += gr.count * n; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, n));
    }
    return out;
  };
  const caps = part(0);
  if (o.pillow) {
    // tilt the flat faces' normals with height, as if the type were very slightly
    // domed: reflections then sweep across the face (sky above, horizon, ground)
    const P = caps.getAttribute('position'), N = caps.getAttribute('normal');
    const hh = (b.max.y - b.min.y) / 2 || 1, hw = (b.max.x - b.min.x) / 2 || 1;
    for (let i = 0; i < P.count; i++) {
      const sz = Math.sign(N.getZ(i)) || 1;
      const nx = (P.getX(i) / hw) * o.pillow * 0.15, ny = (P.getY(i) / hh) * o.pillow;
      const l = Math.hypot(nx, ny, 1);
      N.setXYZ(i, nx / l, ny / l, sz / l);
    }
  }
  const sides = o.creased(part(1), Math.PI / 4);
  const merged = new THREE.BufferGeometry();
  const cat = (name: string, n: number) => {
    const a1 = caps.getAttribute(name).array as Float32Array, a2 = sides.getAttribute(name).array as Float32Array;
    const arr = new Float32Array(a1.length + a2.length);
    arr.set(a1); arr.set(a2, a1.length);
    merged.setAttribute(name, new THREE.BufferAttribute(arr, n));
  };
  cat('position', 3); cat('normal', 3); cat('uv', 2);
  const nc = caps.getAttribute('position').count;
  merged.addGroup(0, nc, 0);
  merged.addGroup(nc, sides.getAttribute('position').count, 1);
  g.dispose(); caps.dispose(); sides.dispose();
  return { geometry: merged, width: b.max.x - b.min.x, height: b.max.y - b.min.y };
}

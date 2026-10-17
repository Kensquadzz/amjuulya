// Texture parameters for shader layers.
//
//   uniform sampler2D u_photo; // @image | Product photo
//   uniform sampler2D u_logo;  // @glyph Montserrat:900 YOUR BRAND | Logo text
//
// @image binds a user picture (data URL) as an ordinary mip-mapped texture.
// @glyph turns text (or a logo picture) into a signed-distance field, so a
// shader can extrude, bevel and light it as real 3D geometry at any output
// size. A shader may also declare `uniform vec4 <name>Info;` and receives
//   image: (width / height, 1 if a picture is loaded else 0, 0, 0)
//   glyph: (texture width / height, 1 if ready, content width, content height)
// with glyph sizes in "texture heights" (the unit glyphSDF() works in).

export type TexParam = { kind: 'image' } | { kind: 'glyph'; family: string; weight: number };

interface Entry {
  tex: WebGLTexture | null;
  info: [number, number, number, number];
  ready: boolean;
  wait?: Promise<void>;
}

const GLYPH_H = 512; // texture height in px; the glyph SDF unit
const GLYPH_PX = 300; // font size inside it
const RANGE = 64; // padding (and useful distance range) in px

/** Key the store uses for one parameter value. */
export function texKey(p: TexParam, value: string, font?: string) {
  return p.kind === 'image' ? `img|${value}` : `gly|${font ?? `${p.family}:${p.weight}`}|${value}`;
}

export class TextureStore {
  private map = new Map<string, Entry>();
  private empty: WebGLTexture | null = null;
  constructor(private gl: WebGL2RenderingContext, private onReady: () => void) {}

  /** The placeholder bound while a texture is missing or still loading. */
  placeholder() {
    if (this.empty) return this.empty;
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    // R = large positive distance (empty glyph), A = 0 (transparent image)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.empty = t;
    return t;
  }

  /** Synchronous lookup for rendering; starts loading on first use. */
  get(p: TexParam, value: string, font?: string): Entry {
    const key = texKey(p, value, font);
    let e = this.map.get(key);
    if (!e) {
      e = { tex: null, info: [1, 0, 0, 0], ready: false };
      this.map.set(key, e);
      const ent = e;
      ent.wait = (p.kind === 'image' ? this.loadImage(ent, value) : this.loadGlyph(ent, p, value, font))
        .catch(() => { ent.ready = true; })
        .then(() => this.onReady());
    }
    return e;
  }

  /** Resolve once every given texture has finished (exports wait for this). */
  async prepare(items: { p: TexParam; value: string; font?: string }[]) {
    await Promise.all(items.map((i) => this.get(i.p, i.value, i.font).wait));
  }

  private upload(e: Entry, src: TexImageSource | null, data?: { w: number; h: number; f: Float32Array }) {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    // texture v runs bottom-up like gl_FragCoord; flip rows ourselves for raw
    // data (UNPACK_FLIP_Y is only reliable for DOM sources)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !data);
    if (data) {
      const f = new Float32Array(data.f.length);
      for (let y = 0; y < data.h; y++) f.set(data.f.subarray((data.h - 1 - y) * data.w, (data.h - y) * data.w), y * data.w);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, data.w, data.h, 0, gl.RED, gl.FLOAT, f);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    } else if (src) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    e.tex = t;
  }

  private async loadImage(e: Entry, src: string) {
    if (!src) { e.ready = true; return; }
    const img = await decodeImage(src);
    // keep textures within what every phone GPU accepts
    const max = Math.min(4096, this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number);
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    let source: TexImageSource = img;
    if (s < 1) {
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      source = c;
    }
    this.upload(e, source);
    e.info = [img.naturalWidth / img.naturalHeight, 1, 0, 0];
    e.ready = true;
  }

  private async loadGlyph(e: Entry, p: Extract<TexParam, { kind: 'glyph' }>, value: string, font?: string) {
    const [family, w] = (font ?? `${p.family}:${p.weight}`).split(':');
    const weight = +w || p.weight;
    let mask: { a: Float32Array; w: number; h: number; cw: number; ch: number };
    if (/^(data:|blob:|https?:)/.test(value)) mask = await imageMask(value);
    else {
      const css = `${weight} ${GLYPH_PX}px "${family}"`;
      if (document.fonts) await document.fonts.load(css, value || 'A').catch(() => undefined);
      mask = textMask(value || ' ', css);
    }
    const f = sdf(mask.a, mask.w, mask.h);
    // distances in texture heights
    for (let i = 0; i < f.length; i++) f[i] /= mask.h;
    this.upload(e, null, { w: mask.w, h: mask.h, f });
    e.info = [mask.w / mask.h, 1, mask.cw / mask.h, mask.ch / mask.h];
    e.ready = true;
  }

  dispose() {
    for (const e of this.map.values()) if (e.tex) this.gl.deleteTexture(e.tex);
    if (this.empty) this.gl.deleteTexture(this.empty);
    this.map.clear();
    this.empty = null;
  }
}

function decodeImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('image failed to load'));
    i.src = src;
  });
}

/** Coverage mask of text, sized to the text with RANGE px of padding. */
function textMask(text: string, css: string) {
  const lines = text.split('\n');
  const c = document.createElement('canvas');
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.font = css;
  const lineH = GLYPH_PX * 1.05;
  const tw = Math.max(1, ...lines.map((l) => x.measureText(l).width));
  // shrink very long text so the texture stays within 4096 px wide
  const k = Math.min(1, (4096 - 2 * RANGE) / tw, (GLYPH_H - 2 * RANGE) / (lineH * lines.length));
  const cw = Math.ceil(tw * k), ch = Math.ceil(lineH * lines.length * k);
  c.width = Math.min(4096, cw + 2 * RANGE);
  c.height = GLYPH_H;
  x.font = css;
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.setTransform(k, 0, 0, k, c.width / 2, c.height / 2);
  lines.forEach((l, i) => x.fillText(l, 0, (i - (lines.length - 1) / 2) * lineH));
  return { a: alphaOf(x, c.width, c.height), w: c.width, h: c.height, cw, ch };
}

/** Mask of a logo picture: its alpha, or its contrast to the corner colour if it is opaque. */
async function imageMask(src: string) {
  const img = await decodeImage(src);
  const ar = img.naturalWidth / img.naturalHeight;
  const ch = GLYPH_H - 2 * RANGE;
  const cw = Math.min(4096 - 2 * RANGE, Math.round(ch * ar));
  const c = document.createElement('canvas');
  c.width = cw + 2 * RANGE;
  c.height = GLYPH_H;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, RANGE, RANGE + (ch - cw / ar) / 2, cw, cw / ar);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const a = new Float32Array(c.width * c.height);
  let opaque = true;
  for (let i = RANGE * c.width + RANGE; i < a.length; i += 97) if (d[i * 4 + 3] < 250 && d[i * 4 + 3] > 0) { opaque = false; break; }
  const p0 = (RANGE * c.width + RANGE) * 4;
  const bg = 0.2126 * d[p0] + 0.7152 * d[p0 + 1] + 0.0722 * d[p0 + 2];
  for (let i = 0; i < a.length; i++) {
    const al = d[i * 4 + 3] / 255;
    if (!opaque) a[i] = al;
    else {
      const l = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
      a[i] = al > 0 ? Math.min(1, Math.abs(l - bg) / 96) : 0;
    }
  }
  return { a, w: c.width, h: c.height, cw, ch: cw / ar };
}

function alphaOf(x: CanvasRenderingContext2D, w: number, h: number) {
  const d = x.getImageData(0, 0, w, h).data;
  const a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
  return a;
}

// ---------------------------------------------------------------- signed distance field
// Felzenszwalb & Huttenlocher exact Euclidean distance transform, seeded with
// sub-pixel edge offsets from anti-aliased coverage (as in Mapbox TinySDF).

const INF = 1e20;

function edt1d(f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array, n: number) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

function edt(g: Float64Array, w: number, h: number) {
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1), v = new Int32Array(n);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) g[y * w + x] = d[x];
  }
}

/** Signed distance in px: negative inside the shape. */
export function sdf(a: Float32Array, w: number, h: number): Float32Array {
  const outer = new Float64Array(w * h), inner = new Float64Array(w * h);
  for (let i = 0; i < a.length; i++) {
    const c = a[i];
    if (c >= 1) { outer[i] = 0; inner[i] = INF; }
    else if (c <= 0) { outer[i] = INF; inner[i] = 0; }
    else { const o = Math.max(0, 0.5 - c); const n = Math.max(0, c - 0.5); outer[i] = o * o; inner[i] = n * n; }
  }
  edt(outer, w, h);
  edt(inner, w, h);
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(outer[i]) - Math.sqrt(inner[i]);
  return out;
}

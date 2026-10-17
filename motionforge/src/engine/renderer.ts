// Compositing renderer. Independent of React: give it a canvas, a project and
// a time, and it draws that exact frame. Preview and export both use it, so
// what you see while scrubbing is what gets exported.
//
// Pipeline (WebGL2):
//   accum <- project background
//   for each visible layer, bottom -> top:
//     2D layers (text/shape/image/background/particles) are batched into an
//       offscreen Canvas2D, uploaded as a texture and composited onto accum
//     shader layers render into a temp target (filters sample accum through
//       u_input), then are composited onto accum with opacity + blend mode
//   present accum to the visible canvas
import { compileProgram, createQuad, createTarget, deleteTarget, type CompileResult, type ShaderError, type Target } from './gl';
import { resolveLayer } from './keyframes';
import { drawBackground, drawImageLayer, drawParticles, drawShape, type Env2D } from './draw2d';
import { cssFont, drawSweep, drawText, textNeedsIsolation } from './text';
import { ensureFont } from './fonts';
import { hexToVec3 } from './color';
import { BUILTIN_UNIFORMS, defaultParams } from './shaderParams';
import type { BlendMode, Layer, Project, ShaderLayer, ShapeLayer } from './types';

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_dst;
uniform sampler2D u_src;
uniform float u_opacity;
uniform int u_mode;
uniform int u_premult;
void main() {
  vec3 d = texture(u_dst, v_uv).rgb;
  vec4 s = texture(u_src, v_uv);
  if (u_premult == 0) s.rgb *= s.a;
  s *= u_opacity;
  vec3 r;
  if (u_mode == 1) r = d + s.rgb;
  else if (u_mode == 2) r = d + s.rgb - d * s.rgb;
  else if (u_mode == 3) r = d * (1.0 - s.a) + d * s.rgb;
  else r = s.rgb + d * (1.0 - s.a);
  fragColor = vec4(r, 1.0);
}`;

const COPY_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_src;
void main() { fragColor = vec4(texture(u_src, v_uv).rgb, 1.0); }`;

const BLEND_IDX: Record<BlendMode, number> = { normal: 0, add: 1, screen: 2, multiply: 3 };
const COMPOSITE_OP: Record<BlendMode, GlobalCompositeOperation> = { normal: 'source-over', add: 'lighter', screen: 'screen', multiply: 'multiply' };

interface UniformInfo { loc: WebGLUniformLocation; type: number }

interface ProgEntry {
  source: string; // source of the installed program
  program: WebGLProgram | null;
  uniforms: Map<string, UniformInfo>;
  defaults: Record<string, number | string>;
  failedSource?: string;
  errors: ShaderError[];
}

export interface RenderOptions {
  density?: number;
  dt?: number;
}

export type RendererStatus = 'ok' | 'lost' | 'restored' | 'no-webgl2';

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext | null = null;
  private ctxFallback: CanvasRenderingContext2D | null = null;
  private layerCanvas: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private isoCanvas: HTMLCanvasElement;
  private ictx: CanvasRenderingContext2D;
  private maskCanvas: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private accum: [Target, Target] | null = null;
  private temp: Target | null = null;
  private layerTex: WebGLTexture | null = null;
  private quad: { vao: WebGLVertexArrayObject; buf: WebGLBuffer } | null = null;
  private compositeProg: { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> } | null = null;
  private copyProg: { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> } | null = null;
  private programs = new Map<string, ProgEntry>();
  private cur = 0;
  private lost = false;
  width = 0;
  height = 0;
  pointer: { x: number; y: number; down: boolean } | null = null; // normalized, y down
  /** editor preview only: draw empty image slots (never set for export) */
  placeholders = false;
  onStatus?: (s: RendererStatus) => void;
  /** called when an async resource (font, image) becomes ready */
  onNeedsRedraw?: () => void;

  constructor(canvas: HTMLCanvasElement, opts: { preserveDrawingBuffer?: boolean } = {}) {
    this.canvas = canvas;
    this.layerCanvas = document.createElement('canvas');
    this.lctx = this.layerCanvas.getContext('2d')!;
    this.isoCanvas = document.createElement('canvas');
    this.ictx = this.isoCanvas.getContext('2d')!;
    this.maskCanvas = document.createElement('canvas');
    this.mctx = this.maskCanvas.getContext('2d')!;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
      powerPreference: 'high-performance',
    });
    if (gl) {
      this.gl = gl;
      this.initGL();
      canvas.addEventListener('webglcontextlost', this.handleLost, false);
      canvas.addEventListener('webglcontextrestored', this.handleRestored, false);
    } else {
      this.ctxFallback = canvas.getContext('2d');
      queueMicrotask(() => this.onStatus?.('no-webgl2'));
    }
  }

  get hasWebGL() {
    return !!this.gl && !this.lost;
  }

  private handleLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    this.programs.clear();
    this.onStatus?.('lost');
  };

  private handleRestored = () => {
    this.lost = false;
    this.initGL();
    if (this.width) this.allocTargets();
    this.onStatus?.('restored');
    this.onNeedsRedraw?.();
  };

  private initGL() {
    const gl = this.gl!;
    this.quad = createQuad(gl);
    const mk = (fs: string, names: string[]) => {
      const r = compileProgram(gl, fs);
      if (!r.ok || !r.program) throw new Error('Internal shader failed: ' + r.errors.map((e) => e.message).join('; '));
      const u: Record<string, WebGLUniformLocation | null> = {};
      for (const n of names) u[n] = gl.getUniformLocation(r.program, n);
      return { p: r.program, u };
    };
    this.compositeProg = mk(COMPOSITE_FS, ['u_dst', 'u_src', 'u_opacity', 'u_mode', 'u_premult']);
    this.copyProg = mk(COPY_FS, ['u_src']);
    this.layerTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.layerTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private allocTargets() {
    const gl = this.gl!;
    if (this.accum) { deleteTarget(gl, this.accum[0]); deleteTarget(gl, this.accum[1]); }
    deleteTarget(gl, this.temp);
    this.accum = [createTarget(gl, this.width, this.height), createTarget(gl, this.width, this.height)];
    this.temp = createTarget(gl, this.width, this.height);
  }

  setSize(w: number, h: number) {
    w = Math.max(2, Math.round(w));
    h = Math.max(2, Math.round(h));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.layerCanvas.width = w;
    this.layerCanvas.height = h;
    this.isoCanvas.width = w;
    this.isoCanvas.height = h;
    this.maskCanvas.width = w;
    this.maskCanvas.height = h;
    if (this.gl && !this.lost) this.allocTargets();
  }

  // ---------------------------------------------------------------- shaders

  /** Compile without installing (used to validate editor code). */
  testCompile(src: string): CompileResult {
    if (!this.gl || this.lost) return { ok: false, errors: [{ line: null, message: 'WebGL2 is not available on this device/browser.' }] };
    const r = compileProgram(this.gl, src);
    if (r.program) this.gl.deleteProgram(r.program);
    return { ok: r.ok, errors: r.errors };
  }

  /** Compile and install for a layer. On failure the previous program keeps rendering. */
  installShader(layerId: string, src: string): CompileResult {
    if (!this.gl || this.lost) return { ok: false, errors: [{ line: null, message: 'WebGL2 is not available on this device/browser.' }] };
    const gl = this.gl;
    const r = compileProgram(gl, src);
    let e = this.programs.get(layerId);
    if (!e) {
      e = { source: '', program: null, uniforms: new Map(), defaults: {}, errors: [] };
      this.programs.set(layerId, e);
    }
    if (!r.ok || !r.program) {
      e.failedSource = src;
      e.errors = r.errors;
      return r;
    }
    if (e.program) gl.deleteProgram(e.program);
    e.program = r.program;
    e.source = src;
    e.failedSource = undefined;
    e.errors = [];
    e.defaults = defaultParams(src);
    e.uniforms = new Map();
    const n = gl.getProgramParameter(r.program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(r.program, i);
      if (!info) continue;
      const loc = gl.getUniformLocation(r.program, info.name);
      if (loc) e.uniforms.set(info.name, { loc, type: info.type });
    }
    return r;
  }

  shaderErrors(layerId: string): ShaderError[] {
    return this.programs.get(layerId)?.errors ?? [];
  }

  private ensureProgram(l: ShaderLayer): ProgEntry | undefined {
    const e = this.programs.get(l.id);
    if (!e || (e.source !== l.source && e.failedSource !== l.source)) this.installShader(l.id, l.source);
    return this.programs.get(l.id);
  }

  // ---------------------------------------------------------------- render

  private env2d(ctx: CanvasRenderingContext2D, t: number, density: number): Env2D {
    const W = this.width, H = this.height;
    return {
      ctx, W, H, t, density,
      k: Math.min(W, H) / 1080,
      pointer: this.pointer ? { x: this.pointer.x * W, y: this.pointer.y * H, down: this.pointer.down } : null,
      placeholders: this.placeholders,
      requestRedraw: () => this.onNeedsRedraw?.(),
    };
  }

  private draw2DLayer(ctx: CanvasRenderingContext2D, L: Layer, env: Env2D) {
    ctx.save();
    ctx.globalAlpha = L.opacity;
    switch (L.type) {
      case 'background': drawBackground(env, L); break;
      case 'shape': drawShape(env, L); break;
      case 'image': drawImageLayer(env, L); break;
      case 'particles': drawParticles(env, L); break;
      case 'text': {
        ensureFont(cssFont(L, 64), () => this.onNeedsRedraw?.(), L.text || 'A');
        if (textNeedsIsolation(L)) {
          const ic = this.ictx;
          ic.setTransform(1, 0, 0, 1, 0, 0);
          ic.clearRect(0, 0, this.width, this.height);
          ic.globalAlpha = 1;
          const ienv = { ...env, ctx: ic };
          drawText(ienv, L);
          drawSweep(ienv, L);
          ctx.drawImage(this.isoCanvas, 0, 0);
        } else drawText({ ...env, ctx }, L);
        break;
      }
    }
    ctx.restore();
  }

  /** Draw a 2D layer through a shape track matte. */
  private drawMasked(ctx: CanvasRenderingContext2D, L: Layer, mask: ShapeLayer, env: Env2D) {
    const mc = this.mctx;
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.globalCompositeOperation = 'source-over';
    mc.globalAlpha = 1;
    mc.clearRect(0, 0, this.width, this.height);
    this.draw2DLayer(mc, L, { ...env, ctx: mc });
    mc.save();
    mc.globalCompositeOperation = mask.mask === 'inverted' ? 'destination-out' : 'destination-in';
    mc.globalAlpha = mask.opacity;
    const m = { ...mask, fillOn: true, fill: '#ffffff', stroke: '#ffffff', glow: mask.feather ?? 0 };
    if (m.shape === 'line' || m.shape === 'ring' || m.shape === 'cross') m.fillOn = false;
    drawShape({ ...env, ctx: mc }, m);
    mc.restore();
    ctx.save();
    ctx.globalCompositeOperation = COMPOSITE_OP[L.blend];
    ctx.drawImage(this.maskCanvas, 0, 0);
    ctx.restore();
  }

  /** Render the composition at time t. */
  render(project: Project, t: number, opts: RenderOptions = {}) {
    const density = opts.density ?? 1;
    const dt = opts.dt ?? 1 / project.fps;
    if (!this.width) return;
    const layers = project.layers.filter((l) => l.visible && t >= l.start && t <= l.end);

    if (!this.gl) {
      // 2D-only fallback (no WebGL2): shader layers are skipped.
      const ctx = this.ctxFallback;
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = project.background;
      ctx.fillRect(0, 0, this.width, this.height);
      const env = this.env2d(ctx, t, density);
      let fbMask: ShapeLayer | null = null;
      for (const raw of layers) {
        if (raw.type === 'shader') { fbMask = null; continue; }
        const L = resolveLayer(raw, t);
        if (L.type === 'shape' && L.mask && L.mask !== 'none') { fbMask = L; continue; }
        if (fbMask) { this.drawMasked(ctx, L, fbMask, env); fbMask = null; continue; }
        ctx.globalCompositeOperation = COMPOSITE_OP[L.blend];
        this.draw2DLayer(ctx, L, env);
      }
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    if (this.lost || !this.accum || !this.temp) return;

    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.quad!.vao);
    this.cur = 0;
    const [r, g, b] = hexToVec3(project.background);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accum[0].fb);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const ctx = this.lctx;
    const env = this.env2d(ctx, t, density);
    let pending = false;
    const reset2D = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, this.width, this.height);
    };
    reset2D();
    const flush = (blend: BlendMode = 'normal') => {
      if (!pending) return;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.layerTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.layerCanvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      this.composite(this.layerTex!, 1, blend, true);
      pending = false;
      reset2D();
    };

    let mask: ShapeLayer | null = null;
    for (const raw of layers) {
      const L = resolveLayer(raw, t);
      if (L.type === 'shader') {
        mask = null; // mattes apply to 2D layers only
        flush();
        this.drawShader(L, t, dt);
        continue;
      }
      if (L.type === 'shape' && L.mask && L.mask !== 'none') { mask = L; continue; }
      if (mask) {
        const m = mask;
        mask = null;
        if (L.blend !== 'normal') flush();
        this.drawMasked(ctx, L, m, env);
        pending = true;
        if (L.blend !== 'normal') flush(L.blend);
        continue;
      }
      if (L.blend !== 'normal') {
        // isolated so the blend mode applies against everything below (incl. shaders)
        flush();
        this.draw2DLayer(ctx, L, env);
        pending = true;
        flush(L.blend);
      } else {
        this.draw2DLayer(ctx, L, env);
        pending = true;
      }
    }
    flush();

    // present
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.copyProg!.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accum[this.cur].tex);
    gl.uniform1i(this.copyProg!.u.u_src, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    // release programs of layers that no longer exist
    const ids = new Set(project.layers.map((l) => l.id));
    for (const [id, e] of this.programs) {
      if (!ids.has(id)) {
        if (e.program) gl.deleteProgram(e.program);
        this.programs.delete(id);
      }
    }
  }

  private composite(src: WebGLTexture, opacity: number, blend: BlendMode, premult: boolean) {
    const gl = this.gl!;
    const acc = this.accum!;
    const dst = acc[this.cur], out = acc[1 - this.cur];
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb);
    gl.viewport(0, 0, this.width, this.height);
    const cp = this.compositeProg!;
    gl.useProgram(cp.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dst.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(cp.u.u_dst, 0);
    gl.uniform1i(cp.u.u_src, 1);
    gl.uniform1f(cp.u.u_opacity, opacity);
    gl.uniform1i(cp.u.u_mode, BLEND_IDX[blend]);
    gl.uniform1i(cp.u.u_premult, premult ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.cur = 1 - this.cur;
  }

  private drawShader(L: ShaderLayer, t: number, dt: number) {
    const e = this.ensureProgram(L);
    if (!e || !e.program) return;
    const gl = this.gl!;
    const temp = this.temp!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, temp.fb);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(e.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accum![this.cur].tex);
    // Filters that read u_input with textureLod get a mip chain, so wide
    // blurs/glows sample pre-filtered levels instead of a few sparse texels
    // (sparse taps show up as speckled ghost copies, worst at 4K).
    const lod = /textureLod\s*\(\s*u_input/.test(L.source);
    if (lod) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    const mouse = this.pointer ? [this.pointer.x, 1 - this.pointer.y] : [0.5, 0.5];
    const span = Math.max(1e-3, L.end - L.start);
    for (const [name, u] of e.uniforms) {
      switch (name) {
        case 'u_resolution': gl.uniform2f(u.loc, this.width, this.height); continue;
        case 'u_time': gl.uniform1f(u.loc, t); continue;
        case 'u_deltaTime': gl.uniform1f(u.loc, dt); continue;
        case 'u_progress': gl.uniform1f(u.loc, Math.max(0, Math.min(1, (t - L.start) / span))); continue;
        case 'u_input': gl.uniform1i(u.loc, 0); continue;
        case 'u_mouse':
          if (u.type === gl.FLOAT_VEC2) gl.uniform2f(u.loc, mouse[0], mouse[1]);
          else if (u.type === gl.FLOAT_VEC3) gl.uniform3f(u.loc, mouse[0], mouse[1], this.pointer?.down ? 1 : 0);
          else if (u.type === gl.FLOAT_VEC4) gl.uniform4f(u.loc, mouse[0], mouse[1], this.pointer?.down ? 1 : 0, 0);
          continue;
      }
      if (BUILTIN_UNIFORMS.has(name)) continue;
      const v = L.params[name] ?? e.defaults[name];
      if (v === undefined) continue;
      if (u.type === gl.FLOAT && typeof v === 'number') gl.uniform1f(u.loc, v);
      else if (u.type === gl.INT && typeof v === 'number') gl.uniform1i(u.loc, Math.round(v));
      else if (u.type === gl.BOOL && typeof v === 'number') gl.uniform1i(u.loc, v ? 1 : 0);
      else if (u.type === gl.FLOAT_VEC3 && typeof v === 'string') { const c = hexToVec3(v); gl.uniform3f(u.loc, c[0], c[1], c[2]); }
      else if (u.type === gl.FLOAT_VEC4 && typeof v === 'string') { const c = hexToVec3(v); gl.uniform4f(u.loc, c[0], c[1], c[2], 1); }
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (lod) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // still bound on unit 0
    this.composite(temp.tex, L.opacity, L.blend, false);
  }

  dispose() {
    const gl = this.gl;
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
    if (!gl || this.lost) return;
    for (const e of this.programs.values()) if (e.program) gl.deleteProgram(e.program);
    this.programs.clear();
    if (this.accum) { deleteTarget(gl, this.accum[0]); deleteTarget(gl, this.accum[1]); }
    deleteTarget(gl, this.temp);
    if (this.layerTex) gl.deleteTexture(this.layerTex);
    if (this.quad) { gl.deleteBuffer(this.quad.buf); gl.deleteVertexArray(this.quad.vao); }
    if (this.compositeProg) gl.deleteProgram(this.compositeProg.p);
    if (this.copyProg) gl.deleteProgram(this.copyProg.p);
    this.accum = null;
    this.temp = null;
  }

  /** Release the GL context entirely (export renderers). */
  /**
   * Confirm the GPU and 2D buffers really have the requested size. Browsers
   * may silently clamp a WebGL drawing buffer, and iOS Safari blanks 2D
   * canvases past its canvas-memory limit; either would make a "4K" export
   * an upscale (or lose layers), so exports refuse to start instead.
   */
  verifySize(): string | null {
    const gl = this.gl;
    if (gl && (gl.drawingBufferWidth !== this.width || gl.drawingBufferHeight !== this.height)) {
      return `This device's GPU gave a ${gl.drawingBufferWidth}×${gl.drawingBufferHeight} buffer instead of ${this.width}×${this.height}. Choose a lower resolution.`;
    }
    for (const c of [this.lctx, this.ictx, this.mctx]) {
      try {
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.fillStyle = '#ffffff';
        c.fillRect(this.width - 1, this.height - 1, 1, 1);
        const px = c.getImageData(this.width - 1, this.height - 1, 1, 1).data;
        c.clearRect(this.width - 1, this.height - 1, 1, 1);
        c.restore();
        if (px[3] === 0) throw new Error('blank');
      } catch {
        return `This device ran out of canvas memory at ${this.width}×${this.height}. Close other tabs or choose a lower resolution.`;
      }
    }
    return null;
  }

  destroy() {
    this.dispose();
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.layerCanvas.width = this.layerCanvas.height = 1;
    this.isoCanvas.width = this.isoCanvas.height = 1;
    this.maskCanvas.width = this.maskCanvas.height = 1;
  }
}


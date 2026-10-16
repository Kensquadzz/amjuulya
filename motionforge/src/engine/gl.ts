// Minimal WebGL2 helpers: program compilation with readable error reports,
// render targets, fullscreen triangle.

export interface ShaderError {
  line: number | null; // 1-based line in the user's fragment source
  message: string;
}

export interface CompileResult {
  ok: boolean;
  program?: WebGLProgram;
  errors: ShaderError[];
}

export const VERTEX_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/** Parse driver logs: "ERROR: 0:12: 'x' : undeclared identifier" (ANGLE/Chrome/Safari). */
export function parseShaderLog(log: string): ShaderError[] {
  const errs: ShaderError[] = [];
  for (const raw of log.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(?:ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/.exec(line);
    if (m) errs.push({ line: +m[1], message: m[2].replace(/^\s*:\s*/, '') });
    else if (!/^\0/.test(line)) errs.push({ line: null, message: line });
  }
  return errs;
}

/** Static checks that drivers report poorly (or that would fail silently). */
export function precheckFragment(src: string): ShaderError[] {
  const errs: ShaderError[] = [];
  if (!src.startsWith('#version 300 es')) {
    errs.push({ line: 1, message: '"#version 300 es" must be the very first line of the shader — nothing (not even a blank line or comment) may precede it.' });
  }
  if (!/\bout\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+\w+\s*;/.test(src))
    errs.push({ line: null, message: 'Declare a fragment output, e.g. "out vec4 fragColor;" (gl_FragColor is not available in GLSL ES 3.00).' });
  if (/\bgl_FragColor\b/.test(src)) {
    const line = src.slice(0, src.search(/\bgl_FragColor\b/)).split('\n').length;
    errs.push({ line, message: 'gl_FragColor does not exist in GLSL ES 3.00 — write to your "out vec4" variable instead.' });
  }
  if (/\btexture2D\s*\(/.test(src)) {
    const line = src.slice(0, src.search(/\btexture2D\s*\(/)).split('\n').length;
    errs.push({ line, message: 'texture2D() was removed in GLSL ES 3.00 — use texture().' });
  }
  return errs;
}

export function compileProgram(gl: WebGL2RenderingContext, fragSrc: string, vertSrc = VERTEX_SRC): CompileResult {
  const pre = precheckFragment(fragSrc);
  if (pre.length) return { ok: false, errors: pre };
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, vertSrc);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(vs) || 'vertex shader failed';
    gl.deleteShader(vs);
    return { ok: false, errors: [{ line: null, message: 'Internal vertex shader: ' + log }] };
  }
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fragSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(fs) || 'Unknown compile error';
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    const errs = parseShaderLog(log);
    return { ok: false, errors: errs.length ? errs : [{ line: null, message: log }] };
  }
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'a_pos');
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || 'Link failed';
    gl.deleteProgram(prog);
    return { ok: false, errors: parseShaderLog(log).length ? parseShaderLog(log) : [{ line: null, message: log }] };
  }
  return { ok: true, program: prog, errors: [] };
}

export interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

export function createTexture(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export function createTarget(gl: WebGL2RenderingContext, w: number, h: number): Target {
  const tex = createTexture(gl, w, h);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, w, h };
}

export function deleteTarget(gl: WebGL2RenderingContext, t: Target | null) {
  if (!t) return;
  gl.deleteFramebuffer(t.fb);
  gl.deleteTexture(t.tex);
}

export function createQuad(gl: WebGL2RenderingContext) {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  // single oversized triangle covering the viewport
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, buf };
}

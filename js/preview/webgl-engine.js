export class AureaWebGLEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true });
    this.program = null;
    this.sourceTex = null;
    this.frameCount = 0;
    this.previewScale = 0.5;

    if (!this.gl) {
      throw new Error('Browser tidak mendukung WebGL2.');
    }

    this.initQuad();
    this.initDefaultTexture();
  }

  setPreviewScale(scale) {
    this.previewScale = Math.max(0.25, Math.min(1.0, Number(scale) || 0.5));
  }

  initQuad() {
    const gl = this.gl;
    const verts = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
       1,  1, 1, 0
    ]);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  }

  initDefaultTexture() {
    const gl = this.gl;
    this.sourceTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const fallback = new Uint8Array([34, 56, 32, 255]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, fallback);
  }

  uploadSourceImage(source) {
    const gl = this.gl;
    if (!gl || !this.sourceTex || !source) return;
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  createShader(type, src) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) || 'Unknown GLSL compile error';
      gl.deleteShader(shader);
      return { shader: null, error: log };
    }
    return { shader, error: null };
  }

  buildUniformDeclarations(params = []) {
    return params.map(p => {
      const name = `u_${p.id}`;
      if (p.type === 'int' || p.type === 'enum' || p.type === 'choice') return `uniform int ${name};`;
      if (p.type === 'color') return `uniform vec4 ${name};`;
      if (p.type === 'point') return `uniform vec2 ${name};`;
      return `uniform float ${name};`;
    }).join('\n');
  }

  compile(userFragCode, params = []) {
    const gl = this.gl;
    if (!gl) return { ok: false, error: 'WebGL2 context unavailable' };

    const vertSrc = `#version 300 es
      in vec2 a_pos;
      in vec2 a_uv;
      out vec2 v_uv;
      void main() {
        v_uv = a_uv;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const paramUniforms = this.buildUniformDeclarations(params);
    const cleanedUserCode = userFragCode.replace(/^\s*#version\s+.*$/gm, '');

    const fragSrc = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      out vec4 fragColor;

      uniform sampler2D aurea_source;
      struct AureaContext {
        vec4 resolution;
        vec4 time;
        vec4 layer;
      };
      uniform AureaContext aurea;

      ${paramUniforms}

      vec2 aurea_px_to_uv(vec2 px) {
        return px * aurea.resolution.zw;
      }

      ${cleanedUserCode}

      void main() {
        fragColor = aurea_main(v_uv);
      }
    `;

    const vs = this.createShader(gl.VERTEX_SHADER, vertSrc);
    if (!vs.shader) return { ok: false, error: vs.error };

    const fs = this.createShader(gl.FRAGMENT_SHADER, fragSrc);
    if (!fs.shader) {
      gl.deleteShader(vs.shader);
      return { ok: false, error: fs.error };
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs.shader);
    gl.attachShader(prog, fs.shader);
    gl.linkProgram(prog);

    gl.deleteShader(vs.shader);
    gl.deleteShader(fs.shader);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog) || 'Program link error';
      gl.deleteProgram(prog);
      return { ok: false, error: log };
    }

    if (this.program) gl.deleteProgram(this.program);
    this.program = prog;
    this.frameCount = 0;
    return { ok: true };
  }

  initPassthrough() {
    if (this.passthroughProg) return;
    const gl = this.gl;
    const vs = this.createShader(gl.VERTEX_SHADER, `#version 300 es
      in vec2 a_pos; in vec2 a_uv; out vec2 v_uv;
      void main() { v_uv = a_uv; gl_Position = vec4(a_pos, 0.0, 1.0); }
    `);
    const fs = this.createShader(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float; in vec2 v_uv; out vec4 fragColor;
      uniform sampler2D u_tex;
      void main() { fragColor = texture(u_tex, v_uv); }
    `);
    this.passthroughProg = gl.createProgram();
    gl.attachShader(this.passthroughProg, vs.shader);
    gl.attachShader(this.passthroughProg, fs.shader);
    gl.linkProgram(this.passthroughProg);
    gl.deleteShader(vs.shader);
    gl.deleteShader(fs.shader);
  }

  drawCanvasDirectly(sourceCanvas) {
    const gl = this.gl;
    if (!gl || !sourceCanvas) return;
    this.initPassthrough();

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const targetW = Math.max(1, Math.floor((this.canvas.clientWidth || 360) * dpr * this.previewScale));
    const targetH = Math.max(1, Math.floor((this.canvas.clientHeight || 202) * dpr * this.previewScale));
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.passthroughProg);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const posLoc = gl.getAttribLocation(this.passthroughProg, 'a_pos');
    const uvLoc = gl.getAttribLocation(this.passthroughProg, 'a_uv');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    gl.uniform1i(gl.getUniformLocation(this.passthroughProg, 'u_tex'), 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  render(timeSec, params = [], values = {}) {
    const gl = this.gl;
    if (!gl || !this.program) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const targetW = Math.max(1, Math.floor((this.canvas.clientWidth || 360) * dpr * this.previewScale));
    const targetH = Math.max(1, Math.floor((this.canvas.clientHeight || 202) * dpr * this.previewScale));
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const posLoc = gl.getAttribLocation(this.program, 'a_pos');
    const uvLoc = gl.getAttribLocation(this.program, 'a_uv');
    if (posLoc >= 0) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    }
    if (uvLoc >= 0) {
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    const srcLoc = gl.getUniformLocation(this.program, 'aurea_source');
    if (srcLoc) gl.uniform1i(srcLoc, 0);

    const resLoc = gl.getUniformLocation(this.program, 'aurea.resolution');
    if (resLoc) {
      gl.uniform4f(resLoc, this.canvas.width, this.canvas.height, 1.0 / this.canvas.width, 1.0 / this.canvas.height);
    }

    const timeLoc = gl.getUniformLocation(this.program, 'aurea.time');
    if (timeLoc) {
      gl.uniform4f(timeLoc, timeSec, 1.0 / 60.0, this.frameCount++, 0.0);
    }

    const layerLoc = gl.getUniformLocation(this.program, 'aurea.layer');
    if (layerLoc) {
      gl.uniform4f(layerLoc, this.canvas.width, this.canvas.height, 0.0, 0.0);
    }

    params.forEach(p => {
      const loc = gl.getUniformLocation(this.program, `u_${p.id}`);
      if (!loc) return;
      const val = values[p.id] ?? p.default;

      if (p.type === 'bool') {
        gl.uniform1f(loc, val ? 1.0 : 0.0);
      } else if (p.type === 'int' || p.type === 'enum' || p.type === 'choice') {
        gl.uniform1i(loc, parseInt(val, 10) || 0);
      } else if (p.type === 'color') {
        const rgba = hexToRgba(val);
        gl.uniform4f(loc, rgba[0], rgba[1], rgba[2], rgba[3]);
      } else if (p.type === 'point') {
        const pt = Array.isArray(val) ? val : [0.5, 0.5];
        gl.uniform2f(loc, Number(pt[0]) || 0, Number(pt[1]) || 0);
      } else {
        gl.uniform1f(loc, parseFloat(val) || 0.0);
      }
    });

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

function hexToRgba(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return [0.47, 0.85, 0.44, 1.0];
  const clean = hex.replace('#', '');
  const r = (parseInt(clean.slice(0, 2), 16) || 0) / 255;
  const g = (parseInt(clean.slice(2, 4), 16) || 0) / 255;
  const b = (parseInt(clean.slice(4, 6), 16) || 0) / 255;
  const a = clean.length >= 8 ? (parseInt(clean.slice(6, 8), 16) || 255) / 255 : 1.0;
  return [r, g, b, a];
}
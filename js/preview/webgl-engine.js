export class AureaWebGLEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false });
    this.program = null;
    this.passthroughProg = null;
    this.previewScale = 0.5;
    this.sourceTex = null;
    this.vbo = null;

    if (this.gl) {
      this.initQuad();
      this.initDefaultTexture();
    }
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
  }

  uploadSourceImage(imgOrCanvas) {
    const gl = this.gl;
    if (!gl || !imgOrCanvas) return;
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgOrCanvas);
  }

  createShader(type, src) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      return { ok: false, error: log };
    }
    return { ok: true, shader };
  }

  buildUniformDeclarations(params = []) {
    const lines = [];
    const declared = new Set(['aurea_source', 'aurea', 'u_resolution', 'u_time']);

    const addUniform = (glslType, name) => {
      if (!name || declared.has(name) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return;
      declared.add(name);
      lines.push(`uniform ${glslType} ${name};`);
    };

    params.forEach(p => {
      const id = p.id;
      const t = (p.type || 'float').toLowerCase();
      let glslType = 'float';
      if (t === 'int' || t === 'enum') glslType = 'int';
      else if (t === 'color' || t === 'vec4') glslType = 'vec4';
      else if (t === 'vec2') glslType = 'vec2';
      else if (t === 'vec3') glslType = 'vec3';

      addUniform(glslType, `u_${id}`);
      addUniform(glslType, id);
    });

    return lines.join('\n');
  }

  compile(userFragCode, params = []) {
    const gl = this.gl;
    if (!gl) return { ok: false, error: 'WebGL2 is not supported in this browser.' };

    const vsSrc = `#version 300 es
      in vec2 a_pos;
      in vec2 a_uv;
      out vec2 v_uv;
      void main() {
        v_uv = a_uv;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const uniformBlock = this.buildUniformDeclarations(params);

    const fsSrc = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      out vec4 fragColor;

      uniform sampler2D aurea_source;
      uniform vec2 u_resolution;
      uniform float u_time;

      struct AureaBuiltins {
        vec4 time;
        vec2 resolution;
      };
      uniform AureaBuiltins aurea;

      float aurea_luma(vec3 c) {
        return dot(c, vec3(0.2126, 0.7152, 0.0722));
      }

      vec2 aurea_px_to_uv(vec2 px) {
        return px / max(u_resolution, vec2(1.0));
      }

      ${uniformBlock}

      ${userFragCode}

      void main() {
        fragColor = aurea_main(v_uv);
      }
    `;

    const vs = this.createShader(gl.VERTEX_SHADER, vsSrc);
    if (!vs.ok) return vs;

    const fs = this.createShader(gl.FRAGMENT_SHADER, fsSrc);
    if (!fs.ok) {
      gl.deleteShader(vs.shader);
      return fs;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs.shader);
    gl.attachShader(prog, fs.shader);
    gl.linkProgram(prog);

    gl.deleteShader(vs.shader);
    gl.deleteShader(fs.shader);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      return { ok: false, error: log };
    }

    if (this.program) gl.deleteProgram(this.program);
    this.program = prog;
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

  hexToRgba(hex) {
    const clean = String(hex || '#ffffff').replace('#', '');
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean.padEnd(6, 'f');
    const num = parseInt(full.slice(0, 6), 16) || 0xffffff;
    const alpha = full.length >= 8 ? (parseInt(full.slice(6, 8), 16) / 255) : 1.0;
    return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255, alpha];
  }

  bindUniformValue(gl, prog, name, type, rawVal) {
    const loc = gl.getUniformLocation(prog, name);
    if (!loc) return;

    if (type === 'bool') {
      gl.uniform1f(loc, rawVal ? 1.0 : 0.0);
    } else if (type === 'int' || type === 'enum') {
      gl.uniform1i(loc, parseInt(rawVal, 10) || 0);
    } else if (type === 'color' || type === 'vec4') {
      const rgba = Array.isArray(rawVal) ? rawVal : this.hexToRgba(rawVal);
      gl.uniform4f(loc, rgba[0] ?? 1, rgba[1] ?? 1, rgba[2] ?? 1, rgba[3] ?? 1);
    } else if (type === 'vec2' && Array.isArray(rawVal)) {
      gl.uniform2f(loc, Number(rawVal[0]) || 0, Number(rawVal[1]) || 0);
    } else if (type === 'vec3' && Array.isArray(rawVal)) {
      gl.uniform3f(loc, Number(rawVal[0]) || 0, Number(rawVal[1]) || 0, Number(rawVal[2]) || 0);
    } else {
      gl.uniform1f(loc, Number(rawVal) || 0);
    }
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
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.uniform1i(gl.getUniformLocation(this.program, 'aurea_source'), 0);

    gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), this.canvas.width, this.canvas.height);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_time'), timeSec);
    gl.uniform4f(gl.getUniformLocation(this.program, 'aurea.time'), timeSec, timeSec * 60.0, Math.sin(timeSec), Math.cos(timeSec));
    gl.uniform2f(gl.getUniformLocation(this.program, 'aurea.resolution'), this.canvas.width, this.canvas.height);

    params.forEach(p => {
      const val = values[p.id] !== undefined ? values[p.id] : p.default;
      const type = (p.type || 'float').toLowerCase();
      this.bindUniformValue(gl, this.program, `u_${p.id}`, type, val);
      this.bindUniformValue(gl, this.program, p.id, type, val);
    });

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

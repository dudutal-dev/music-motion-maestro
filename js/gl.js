/* ============================================================
   gl.js — a small WebGL renderer, written rather than imported

   The scene this app needs is one neck, six strings, some fret wire and a
   hand. A general 3D library would carry a scene graph, a material system,
   loaders and an animation stack to draw it, and would more than double
   what the app weighs — for a page that currently has no dependencies at
   all and is served as plain files.

   So this is the part of an engine the scene actually uses: matrices, one
   shader with one light, and meshes drawn by model matrix. Everything it
   does not do — shadows, textures, transparency sorting, skinning — it does
   not do on purpose.
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 4x4 matrices, column-major, as WebGL wants them ---------- */
  const M4 = {
    identity: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),

    multiply(a, b, out) {
      out = out || new Float32Array(16);
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
          let s = 0;
          for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
          out[c * 4 + r] = s;
        }
      }
      return out;
    },

    perspective(fovyDeg, aspect, near, far) {
      const f = 1 / Math.tan(fovyDeg * Math.PI / 360);
      const nf = 1 / (near - far);
      return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
      ]);
    },

    lookAt(eye, at, up) {
      const z = norm(sub(eye, at));
      const x = norm(cross(up, z));
      const y = cross(z, x);
      return new Float32Array([
        x.x, y.x, z.x, 0,
        x.y, y.y, z.y, 0,
        x.z, y.z, z.z, 0,
        -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
      ]);
    },

    translate(t) {
      const m = M4.identity();
      m[12] = t.x; m[13] = t.y; m[14] = t.z;
      return m;
    },

    scale(s) {
      const m = M4.identity();
      m[0] = s.x; m[5] = s.y; m[10] = s.z;
      return m;
    },

    /** Rotation taking +X onto `dir`, which is how every limb is placed. */
    alignX(dir) {
      const x = norm(dir);
      // Any perpendicular will do for the roll of a round segment; pick one
      // that is never parallel to x so the cross product cannot collapse.
      const ref = Math.abs(x.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
      const z = norm(cross(x, ref));
      const y = cross(z, x);
      return new Float32Array([
        x.x, x.y, x.z, 0,
        y.x, y.y, y.z, 0,
        z.x, z.y, z.z, 0,
        0, 0, 0, 1
      ]);
    },

    rotateY(rad) {
      const c = Math.cos(rad), s = Math.sin(rad);
      return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
    },
    rotateX(rad) {
      const c = Math.cos(rad), s = Math.sin(rad);
      return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
    },

    /**
     * The 3x3 that normals must use.
     * A segment scaled long and thin is a non-uniform scale, and normals
     * pushed through it directly come out tilted — visible as light sliding
     * off a finger the wrong way. The inverse transpose is the fix.
     */
    normalMatrix(m) {
      const a = m[0], b = m[1], c = m[2],
            d = m[4], e = m[5], f = m[6],
            g = m[8], h = m[9], i = m[10];
      const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
      if (!det) return new Float32Array([1,0,0, 0,1,0, 0,0,1]);
      const k = 1 / det;
      // inverse, then transposed by how it is written out
      return new Float32Array([
        (e * i - f * h) * k, (c * h - b * i) * k, (b * f - c * e) * k,
        (f * g - d * i) * k, (a * i - c * g) * k, (c * d - a * f) * k,
        (d * h - e * g) * k, (b * g - a * h) * k, (a * e - b * d) * k
      ]);
    }
  };

  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const len = a => Math.hypot(a.x, a.y, a.z);
  const cross = (a, b) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  });
  const norm = a => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };

  /* ---------- shaders ---------- */
  const VERT = `
    attribute vec3 aPos;
    attribute vec3 aNormal;
    uniform mat4 uModel, uViewProj;
    uniform mat3 uNormal;
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      vec4 w = uModel * vec4(aPos, 1.0);
      vWorld = w.xyz;
      vNormal = normalize(uNormal * aNormal);
      gl_Position = uViewProj * w;
    }`;

  /* One key light, a dim fill from the other side so nothing goes solid
     black, and a rim term that makes the round parts read as round. The
     specular is what separates fret wire and strings from wood.

     uWrap is what separates skin from everything else. Light entering skin
     scatters under the surface and comes back out a little way around, so a
     lit hand has no hard terminator: the shadow line is soft and reddens as
     it turns away. Wrapping the diffuse term and tinting what it picks up on
     the way costs two lines and does more for a hand looking like a hand
     than any amount of extra geometry. */
  const FRAG = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec3 vWorld;
    uniform vec3 uColor;
    uniform vec3 uEye;
    uniform float uShine;
    uniform float uWrap;
    void main() {
      vec3 n = normalize(vNormal);
      vec3 key = normalize(vec3(-0.45, 0.75, 0.5));
      vec3 fill = normalize(vec3(0.6, -0.2, 0.35));
      vec3 v = normalize(uEye - vWorld);
      float w = uWrap;
      float nk = (dot(n, key) + w) / (1.0 + w);
      float nf = (dot(n, fill) + w) / (1.0 + w);
      float d = max(nk, 0.0) * 0.95 + max(nf, 0.0) * 0.22;
      // the reddening just past the terminator, where the light is coming
      // back out of the surface rather than bouncing off it
      float sss = uWrap * max(0.0, 1.0 - abs(dot(n, key)) * 3.0) * 0.5;
      vec3 h = normalize(key + v);
      float spec = pow(max(dot(n, h), 0.0), mix(12.0, 90.0, uShine)) * uShine;
      float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * (0.28 - uWrap * 0.12);
      vec3 warm = vec3(0.42, 0.10, 0.06);
      vec3 c = uColor * (0.16 + d) + warm * sss + vec3(spec) + uColor * rim;
      gl_FragColor = vec4(c, 1.0);
    }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('shader: ' + log);
    }
    return s;
  }

  /**
   * @returns {object|null} a renderer, or null when WebGL is unavailable —
   *   which the caller must handle by offering a different stage rather
   *   than showing a blank rectangle.
   */
  function create(canvas) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, depth: true })
            || canvas.getContext('experimental-webgl');
    if (!gl) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);

    const A = {
      pos: gl.getAttribLocation(prog, 'aPos'),
      normal: gl.getAttribLocation(prog, 'aNormal')
    };
    const U = {};
    ['uModel', 'uViewProj', 'uNormal', 'uColor', 'uEye', 'uShine', 'uWrap']
      .forEach(n => { U[n] = gl.getUniformLocation(prog, n); });

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    let viewProj = M4.identity();
    let eye = { x: 0, y: 0, z: 1 };

    /** Uploads one mesh. Positions and normals interleaved would be faster; * two buffers is clearer and this scene is tiny. */
    function mesh(positions, normals, indices) {
      const pb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
      const nb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, nb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      const big = positions.length / 3 > 65535;
      const ext = big ? gl.getExtension('OES_element_index_uint') : null;
      if (big && !ext) throw new Error('mesh too large for this device');
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
        big ? new Uint32Array(indices) : new Uint16Array(indices), gl.STATIC_DRAW);
      return { pb, nb, ib, count: indices.length, type: big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
               verts: positions.length / 3 };
    }

    /**
     * A mesh whose contents change every time the hand moves.
     * The static path uploads once and never again; the hand is re-swept
     * whenever the pose changes, so its buffers are declared dynamic and
     * refilled in place rather than recreated.
     */
    function dynamicMesh() {
      return { pb: gl.createBuffer(), nb: gl.createBuffer(), ib: gl.createBuffer(),
               count: 0, type: gl.UNSIGNED_SHORT, verts: 0, dynamic: true };
    }

    function upload(m, positions, normals, indices) {
      gl.bindBuffer(gl.ARRAY_BUFFER, m.pb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.nb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.DYNAMIC_DRAW);
      m.count = indices.length;
      m.verts = positions.length / 3;
      return m;
    }

    function frame(w, h, camera) {
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      eye = camera.eye;
      viewProj = M4.multiply(
        M4.perspective(camera.fov || 34, w / h, camera.near || 10, camera.far || 4000),
        M4.lookAt(camera.eye, camera.at, camera.up || { x: 0, y: 0, z: 1 }));
      gl.uniformMatrix4fv(U.uViewProj, false, viewProj);
      gl.uniform3f(U.uEye, eye.x, eye.y, eye.z);
    }

    function draw(m, model, color, shine, wrap) {
      gl.bindBuffer(gl.ARRAY_BUFFER, m.pb);
      gl.enableVertexAttribArray(A.pos);
      gl.vertexAttribPointer(A.pos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.nb);
      gl.enableVertexAttribArray(A.normal);
      gl.vertexAttribPointer(A.normal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
      gl.uniformMatrix4fv(U.uModel, false, model);
      gl.uniformMatrix3fv(U.uNormal, false, M4.normalMatrix(model));
      gl.uniform3f(U.uColor, color[0], color[1], color[2]);
      gl.uniform1f(U.uShine, shine == null ? 0.08 : shine);
      gl.uniform1f(U.uWrap, wrap || 0);
      gl.drawElements(gl.TRIANGLES, m.count, m.type, 0);
    }

    function dispose() {
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }

    return { gl, mesh, dynamicMesh, upload, frame, draw, dispose, M4,
             get lost() { return gl.isContextLost(); } };
  }

  /* ---------- primitives ---------- */

  /**
   * A cylinder along +X from 0 to 1, radius 1 at each end, capped.
   * Everything limb-shaped is this mesh under a different matrix, which
   * keeps the whole hand to one upload.
   */
  function cylinder(sides) {
    sides = sides || 12;
    const P = [], N = [], I = [];
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const y = Math.cos(a), z = Math.sin(a);
        P.push(r, y, z); N.push(0, y, z);
      }
    }
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      I.push(i, sides + i, sides + j, i, sides + j, j);
    }
    // caps, with their own vertices so the normals do not smear round the rim
    for (const [x, nx] of [[0, -1], [1, 1]]) {
      const base = P.length / 3;
      P.push(x, 0, 0); N.push(nx, 0, 0);
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        P.push(x, Math.cos(a), Math.sin(a)); N.push(nx, 0, 0);
      }
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        if (nx > 0) I.push(base, base + 1 + i, base + 1 + j);
        else I.push(base, base + 1 + j, base + 1 + i);
      }
    }
    return { positions: P, normals: N, indices: I };
  }

  /** A unit sphere, for knuckles and fingertips. */
  function sphere(seg) {
    seg = seg || 12;
    const P = [], N = [], I = [];
    for (let i = 0; i <= seg; i++) {
      const th = i / seg * Math.PI;
      for (let j = 0; j <= seg * 2; j++) {
        const ph = j / (seg * 2) * Math.PI * 2;
        const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
        P.push(x, y, z); N.push(x, y, z);
      }
    }
    const row = seg * 2 + 1;
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < seg * 2; j++) {
        const a = i * row + j, b = a + row;
        I.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
    return { positions: P, normals: N, indices: I };
  }

  /** A box from -1..1 on every axis. */
  function box() {
    const P = [], N = [], I = [];
    const faces = [
      [[1,0,0], [[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]],
      [[-1,0,0], [[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]]],
      [[0,1,0], [[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]]],
      [[0,-1,0], [[-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1]]],
      [[0,0,1], [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],
      [[0,0,-1], [[-1,1,-1],[1,1,-1],[1,-1,-1],[-1,-1,-1]]]
    ];
    for (const [n, quad] of faces) {
      const base = P.length / 3;
      for (const v of quad) { P.push(v[0], v[1], v[2]); N.push(n[0], n[1], n[2]); }
      I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return { positions: P, normals: N, indices: I };
  }

  global.Gl = { create, M4, cylinder, sphere, box,
                vec: { add, sub, mul, dot, cross, len, norm } };
})(window);

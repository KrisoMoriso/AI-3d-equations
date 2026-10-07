'use strict';

// WebGL shaders, GPU buffers, projection matrices, and drawing.
function shader(type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
  return s;
}
function initializeGL() {
  program = gl.createProgram();
  gl.attachShader(
    program,
    shader(
      gl.VERTEX_SHADER,
      `
        attribute vec3 aPosition;
        attribute vec3 aNormal;
        uniform mat4 uMatrix;
        uniform float uRange;
        uniform float uPointSize;
        uniform mediump int uKind;
        varying vec3 vNormal;
        varying float vHeight;

        void main() {
          vNormal = aNormal;
          vHeight = aPosition.z;
          gl_Position = uMatrix * vec4(aPosition / uRange, 1.0);
          gl_PointSize = uPointSize;
          if (uKind == 2 || uKind == 4) gl_Position.z -= .0003 * gl_Position.w;
        }
      `,
    ),
  );
  gl.attachShader(
    program,
    shader(
      gl.FRAGMENT_SHADER,
      `
        precision mediump float;
        varying vec3 vNormal;
        varying float vHeight;
        uniform vec2 uHeights;
        uniform mediump int uKind;
        uniform vec3 uColor;
        uniform float uAlpha;

        void main() {
          if (uKind == 2) {
            float radius = length(gl_PointCoord - vec2(.5));
            if (radius > .5) discard;
            gl_FragColor = vec4(radius > .35 ? vec3(1.0) : uColor, 1.0);
            return;
          }
          if (uKind == 3) {
            gl_FragColor = vec4(uColor, uAlpha);
            return;
          }
          if (uKind == 1 || uKind == 4) {
            gl_FragColor = vec4(uColor, 1.0);
            return;
          }

          float t = clamp((vHeight - uHeights.x) / max(uHeights.y - uHeights.x, .001), 0.0, 1.0);
          vec3 color = uColor * (.6 + .4 * t);
          vec3 n = normalize(vNormal);
          float lighting = .48 + .52 * abs(dot(n, normalize(vec3(-.4, -.6, 1.))));
          gl_FragColor = vec4(color * lighting, 1.0);
        }
      `,
    ),
  );
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  program.position = gl.getAttribLocation(program, 'aPosition');
  program.normal = gl.getAttribLocation(program, 'aNormal');
  for (const name of ['uMatrix', 'uRange', 'uHeights', 'uKind', 'uColor', 'uPointSize', 'uAlpha'])
    program[name] = gl.getUniformLocation(program, name);
  gridBuffer = gl.createBuffer();
  axisBuffer = gl.createBuffer();
  pointBuffer = gl.createBuffer();
  sectionPlaneBuffer = gl.createBuffer();
  sectionLineBuffer = gl.createBuffer();
  sectionPointBuffer = gl.createBuffer();
  sectionAreaBuffer = gl.createBuffer();
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.051, 0.071, 0.094, 1);
}
function upload(buffer, data) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
}
function uploadMesh(equation, m) {
  const buffers = equation.buffers || {
    surface: gl.createBuffer(),
    wire: gl.createBuffer(),
  };
  equation.buffers = buffers;
  upload(buffers.surface, m.vertices);
  buffers.surfaceCount = m.vertices.length / 6;
  const wire = [];
  for (let i = 0; i < m.vertices.length; i += 18) {
    for (const [a, b] of [
      [0, 6],
      [6, 12],
      [12, 0],
    ])
      wire.push(...m.vertices.slice(i + a, i + a + 6), ...m.vertices.slice(i + b, i + b + 6));
  }
  upload(buffers.wire, wire);
  buffers.wireCount = wire.length / 6;
}
function uploadSceneGeometry(d) {
  const grid = [];
  const addLine = (arr, a, b) => arr.push(...a, 0, 0, 1, ...b, 0, 0, 1);
  const division = Math.ceil(d),
    floor = -d;
  for (let i = -division; i <= division; i++) {
    if (Math.abs(i) > d) continue;
    addLine(grid, [i, -d, floor], [i, d, floor]);
    addLine(grid, [-d, i, floor], [d, i, floor]);
  }
  upload(gridBuffer, grid);
  gridCount = grid.length / 6;
  const axes = [];
  addLine(axes, [-d, 0, 0], [d * 1.09, 0, 0]);
  addLine(axes, [0, -d, 0], [0, d * 1.09, 0]);
  addLine(axes, [0, 0, -d], [0, 0, d * 1.09]);
  upload(axisBuffer, axes);
}
function multiplyMatrix(a, b) {
  const r = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[c * 4 + k];
      r[c * 4 + row] = s;
    }
  return r;
}
function viewMatrix() {
  const { theta: t, phi: p, zoom: z, panX: px, panY: py } = camera,
    eye = [Math.sin(p) * Math.cos(t), Math.sin(p) * Math.sin(t), Math.cos(p)],
    back = normalized(eye),
    right = normalized([-back[1], back[0], 0]),
    up = [
      back[1] * right[2] - back[2] * right[1],
      back[2] * right[0] - back[0] * right[2],
      back[0] * right[1] - back[1] * right[0],
    ],
    dist = 5.2 / z;
  const view = new Float32Array([
    right[0],
    up[0],
    back[0],
    0,
    right[1],
    up[1],
    back[1],
    0,
    right[2],
    up[2],
    back[2],
    0,
    px,
    py,
    -dist,
    1,
  ]);
  const aspect = canvas.width / canvas.height,
    f = 1 / Math.tan(Math.PI / 8),
    near = 0.1,
    far = 100;
  const proj = new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) / (near - far),
    -1,
    0,
    0,
    (2 * far * near) / (near - far),
    0,
  ]);
  return multiplyMatrix(proj, view);
}
function bind(buffer) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(program.position);
  gl.vertexAttribPointer(program.position, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(program.normal);
  gl.vertexAttribPointer(program.normal, 3, gl.FLOAT, false, 24, 12);
}
function lines(buffer, count, color, start = 0) {
  bind(buffer);
  gl.uniform1i(program.uKind, 1);
  gl.uniform3fv(program.uColor, color);
  gl.drawArrays(gl.LINES, start, count);
}
function draw() {
  if (!gl || gl.isContextLost()) return;
  const ratio = Math.min(devicePixelRatio || 1, 2),
    w = Math.round(canvas.clientWidth * ratio),
    h = Math.round(canvas.clientHeight * ratio);
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, w, h);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);
  const matrix = viewMatrix();
  gl.uniformMatrix4fv(program.uMatrix, false, matrix);
  gl.uniform1f(program.uRange, currentDomain);
  const surfaces = visibleSurfaces();
  const heights = sceneHeightRange(surfaces);
  gl.uniform2f(program.uHeights, heights.min, heights.max);
  if ($('grid').checked) lines(gridBuffer, gridCount, [0.15, 0.2, 0.25]);
  const style = $('style').value;
  for (const equation of surfaces) {
    const color = colorComponents(equation.color);
    const buffers = equation.buffers;
    if (style !== 'wire') {
      bind(buffers.surface);
      gl.uniform1i(program.uKind, 0);
      gl.uniform3fv(program.uColor, color);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      gl.drawArrays(gl.TRIANGLES, 0, buffers.surfaceCount);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    if (style !== 'solid') {
      lines(
        buffers.wire,
        buffers.wireCount,
        style === 'wire' ? color : color.map((value) => value * 0.3),
      );
    }
  }
  if ($('axes').checked) {
    lines(axisBuffer, 2, [0.72, 0.34, 0.38], 0);
    lines(axisBuffer, 2, [0.35, 0.63, 0.52], 2);
    lines(axisBuffer, 2, [0.36, 0.53, 0.78], 4);
  }
  drawCrossSection();
  drawPointMarkers();
  for (const [id, v] of [
    ['labelX', [1.16, 0, 0]],
    ['labelY', [0, 1.16, 0]],
    ['labelZ', [0, 0, 1.16]],
  ]) {
    const e = $(id),
      r = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++)
      r[i] = matrix[i] * v[0] + matrix[4 + i] * v[1] + matrix[8 + i] * v[2] + matrix[12 + i];
    const x = ((r[0] / r[3]) * 0.5 + 0.5) * canvas.clientWidth,
      y = ((-r[1] / r[3]) * 0.5 + 0.5) * canvas.clientHeight;
    e.style.display =
      $('axes').checked &&
      r[3] > 0 &&
      x > 5 &&
      x < canvas.clientWidth - 5 &&
      y > 5 &&
      y < canvas.clientHeight - 5
        ? 'block'
        : 'none';
    e.style.left = x + 'px';
    e.style.top = y + 'px';
  }
}

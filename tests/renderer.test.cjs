const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const context = vm.createContext({});
vm.runInContext(read('js/equation-parser.js'), context);
vm.runInContext(read('js/geometry.js'), context);
vm.runInContext(read('js/picking.js'), context);
vm.runInContext(read('js/sections.js'), context);
const { sliceTriangles, sectionPlaneVertices } = vm.runInContext(
  '({ sliceTriangles, sectionPlaneVertices })',
  context,
);
const { screenRay, pickSurface, inverseMatrix } = vm.runInContext(
  '({ screenRay, pickSurface, inverseMatrix })',
  context,
);
const { compileEquation, surfaceMesh, implicitMesh } = vm.runInContext(
  '({ compileEquation, surfaceMesh, implicitMesh })',
  context,
);

test('equations preserve precedence, implicit multiplication, and Unicode syntax', () => {
  const evaluate = (expression, x = 0, y = 0) => compileEquation(expression, 'explicit')(x, y, 0);
  assert.equal(evaluate('-2^2'), -4);
  assert.equal(evaluate('2^3^2'), 512);
  assert.equal(evaluate('2x + xy + 2(x+y)', 3, 4), 32);
  assert.equal(evaluate('x² − y³', 3, 2), 1);
  assert.equal(evaluate('2 × 3 · 4'), 24);
  assert.equal(evaluate('z = sin(π/2) + ln(e)'), 2);
  assert.equal(evaluate('max(2, pow(3, 2))'), 9);
});

test('implicit equations support expressions and both sides of an equality', () => {
  assert.equal(compileEquation('x^2+y^2+z^2=9', 'implicit')(1, 2, 2), 0);
  assert.equal(compileEquation('x+y-z', 'implicit')(1, 2, 3), 0);
});

test('invalid equations report errors instead of evaluating arbitrary code', () => {
  for (const equation of ['z+1', 'unknown(x)', 'sin(1,2)', 'sqrt(', 'x=1', '1=2=3', '']) {
    assert.throws(() => compileEquation(equation, 'explicit'));
  }
});

test('explicit meshes preserve bounds and unit normals', () => {
  const mesh = surfaceMesh(compileEquation('0', 'explicit'), 2, 4);
  assert.equal(mesh.vertices.length / 18, 32);
  assert.equal(mesh.zmin, 0);
  assert.equal(mesh.zmax, 0);
  for (let i = 0; i < mesh.vertices.length; i += 6) {
    const [x, y, z, nx, ny, nz] = mesh.vertices.slice(i, i + 6);
    assert.ok(Math.abs(x) <= 2 && Math.abs(y) <= 2);
    assert.equal(z, 0);
    assert.equal(Math.hypot(nx, ny, nz), 1);
  }
});

test('explicit meshes exclude undefined and out-of-domain surfaces', () => {
  assert.equal(surfaceMesh(compileEquation('sqrt(-1)', 'explicit'), 2, 4).vertices.length, 0);
  assert.equal(surfaceMesh(compileEquation('10', 'explicit'), 2, 4).vertices.length, 0);
});

test('implicit sphere meshes have finite vertices, bounds, and unit normals', () => {
  const mesh = implicitMesh(compileEquation('x^2+y^2+z^2=1', 'implicit'), 2, 12);
  assert.ok(mesh.vertices.length > 0);
  assert.equal(mesh.vertices.length % 18, 0);
  assert.ok(mesh.vertices.every(Number.isFinite));
  assert.ok(mesh.zmin >= -1 && mesh.zmax <= 1);
  for (let i = 0; i < mesh.vertices.length; i += 6) {
    assert.ok(Math.abs(Math.hypot(...mesh.vertices.slice(i + 3, i + 6)) - 1) < 1e-12);
  }
});

test('HTML references existing classic scripts in dependency order', () => {
  const html = read('renderer-3d.html');
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"\s+defer><\/script>/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(scripts, [
    'js/equation-parser.js',
    'js/geometry.js',
    'js/sections.js',
    'js/state.js',
    'js/renderer.js',
    'js/equations.js',
    'js/picking.js',
    'js/inspector.js',
    'js/cross-section.js',
    'js/ui.js',
    'js/controls.js',
    'js/export.js',
    'js/main.js',
  ]);
  for (const script of scripts) new vm.Script(read(script), { filename: script });
  assert.match(html, /<link rel="stylesheet" href="css\/styles.css"\s*\/>/);
  assert.ok(read('css/styles.css').length > 0);
});

function createPage({ webgl = false } = {}) {
  const frames = [];
  const drawing = [];
  const uploads = [];
  const deletedBuffers = [];
  const exportText = [];
  let nextBuffer = 1;
  let boundBuffer;
  let currentColor;
  let currentKind;
  let depthWrite = true;
  const enabledCaps = new Set();
  const gl = {
    ARRAY_BUFFER: 'ARRAY_BUFFER',
    STATIC_DRAW: 'STATIC_DRAW',
    FLOAT: 'FLOAT',
    LINES: 'LINES',
    TRIANGLES: 'TRIANGLES',
    POINTS: 'POINTS',
    DEPTH_TEST: 'DEPTH_TEST',
    BLEND: 'BLEND',
    SRC_ALPHA: 'SRC_ALPHA',
    ONE_MINUS_SRC_ALPHA: 'ONE_MINUS_SRC_ALPHA',
    POLYGON_OFFSET_FILL: 'POLYGON_OFFSET_FILL',
    VERTEX_SHADER: 'VERTEX_SHADER',
    FRAGMENT_SHADER: 'FRAGMENT_SHADER',
    COMPILE_STATUS: 'COMPILE_STATUS',
    LINK_STATUS: 'LINK_STATUS',
    COLOR_BUFFER_BIT: 1,
    DEPTH_BUFFER_BIT: 2,
    createShader: () => ({}),
    shaderSource() {},
    compileShader() {},
    getShaderParameter: () => true,
    createProgram: () => ({}),
    attachShader() {},
    linkProgram() {},
    getProgramParameter: () => true,
    useProgram() {},
    getAttribLocation: (_, name) => name,
    getUniformLocation: (_, name) => name,
    createBuffer: () => ({ id: nextBuffer++ }),
    deleteBuffer(buffer) {
      deletedBuffers.push(buffer);
    },
    bindBuffer(_, buffer) {
      boundBuffer = buffer;
    },
    bufferData(_, data) {
      uploads.push({ buffer: boundBuffer, length: data.length });
    },
    enable(cap) {
      enabledCaps.add(cap);
    },
    disable(cap) {
      enabledCaps.delete(cap);
    },
    clearColor() {},
    viewport() {},
    clear() {},
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    uniform1i(name, value) {
      if (name === 'uKind') currentKind = value;
    },
    uniform1f() {},
    uniform2f() {},
    uniformMatrix4fv() {},
    uniform3fv(_, color) {
      currentColor = [...color];
    },
    polygonOffset() {},
    depthMask(value) {
      depthWrite = value;
    },
    blendFunc() {},
    isContextLost: () => false,
    drawArrays(primitive, start, count) {
      drawing.push({
        primitive,
        start,
        count,
        buffer: boundBuffer,
        color: currentColor,
        kind: currentKind,
        depthWrite,
        blended: enabledCaps.has('BLEND'),
      });
    },
  };
  const context2d = {
    fillRect() {},
    drawImage() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    strokeRect() {},
    closePath() {},
    fill() {},
    arc() {},
    fillText(text) {
      exportText.push({ text, color: this.fillStyle });
    },
  };
  const makeElement = () => ({
    style: { setProperty() {} },
    listeners: new Map(),
    attributes: new Map(),
    children: [],
    value: '',
    textContent: '',
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(event, callback) {
      this.listeners.set(event, callback);
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    removeAttribute(name) {
      this.attributes.delete(name);
    },
    appendChild(child) {
      this.children.push(child);
      child.parent = this;
    },
    replaceChildren(...children) {
      this.children = [];
      children.forEach((child) => this.appendChild(child));
    },
    setPointerCapture() {},
    getBoundingClientRect() {
      return { left: 20, top: 30, width: this.clientWidth, height: this.clientHeight };
    },
    remove() {
      this.parent.children = this.parent.children.filter((child) => child !== this);
    },
    focus() {
      this.parent?.listeners.get('focusin')?.();
    },
    getContext: (kind) => (kind === '2d' ? context2d : webgl ? gl : null),
    toBlob(callback) {
      callback({});
    },
    click() {},
  });
  const makeCard = () => {
    const card = makeElement();
    const fields = new Map();
    const template = read('renderer-3d.html').match(
      /<template id="equationTemplate">([\s\S]*?)<\/template>/,
    )[1];
    for (const [, name] of template.matchAll(/data-field="([^"]+)"/g)) {
      const field = makeElement();
      field.parent = card;
      fields.set(name, field);
    }
    card.querySelector = (selector) => fields.get(selector.match(/data-field="([^"]+)"/)[1]);
    return card;
  };
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, makeElement());
    }
    return elements.get(id);
  };
  element('equationTemplate').content = { firstElementChild: { cloneNode: makeCard } };
  element('domain').value = '6';
  element('quality').value = 'low';
  element('style').value = 'solid';
  element('grid').checked = true;
  element('axes').checked = true;
  element('sectionAxis').value = 'z';
  element('sectionPosition').value = '0';
  element('sectionPlane').checked = true;
  Object.assign(element('canvas'), {
    width: 1000,
    height: 600,
    clientWidth: 1000,
    clientHeight: 600,
  });
  const presetButtons = [...read('renderer-3d.html').matchAll(/data-preset="([^"]+)"/g)].map(
    ([, key]) => ({ ...element(`preset-${key}`), dataset: { preset: key } }),
  );
  const page = vm.createContext({
    document: {
      getElementById: element,
      querySelectorAll: (selector) => (selector === '.preset' ? presetButtons : []),
      addEventListener() {},
      createElement: makeElement,
    },
    ResizeObserver: class {
      observe() {}
    },
    console,
    devicePixelRatio: 1,
    performance: { now: () => 0 },
    requestAnimationFrame: (callback) => frames.push(callback),
    setTimeout: (callback) => queueMicrotask(callback),
    clearTimeout() {},
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
  });
  const scripts = [...read('renderer-3d.html').matchAll(/<script\s+src="([^"]+)"/g)];
  for (const [, file] of scripts) vm.runInContext(read(file), page, { filename: file });
  const flushBuild = async () => {
    for (let i = 0; i < 100 && vm.runInContext('building', page); i++) {
      frames.splice(0).forEach((callback) => callback(i * 16));
      await new Promise(setImmediate);
    }
    assert.equal(vm.runInContext('building', page), false, 'build completes');
  };
  return { page, element, presetButtons, flushBuild, drawing, uploads, deletedBuffers, exportText };
}

test('separate scripts start in order and retain the WebGL-unavailable fallback', () => {
  const { element } = createPage();
  assert.equal(element('fatal').style.display, 'grid');
  assert.equal(element('meshStatus').textContent, 'WebGL niedostępny');
  for (const id of ['renderButton', 'export', 'zoomIn', 'zoomOut', 'rotate']) {
    assert.equal(element(id).disabled, true);
  }
  assert.equal(typeof element('reset').onclick, 'function');
  assert.equal(typeof element('export').onclick, 'function');
});

test('every preset produces a finite mesh at the default quality and domain', () => {
  const { page, presetButtons } = createPage();
  const presets = vm.runInContext('presets', page);
  assert.deepEqual(
    presetButtons.map((b) => b.dataset.preset),
    Object.keys(presets),
  );
  for (const [key, preset] of Object.entries(presets)) {
    const fn = compileEquation(preset.eq, preset.mode);
    const mesh =
      preset.mode === 'explicit' ? surfaceMesh(fn, preset.d, 90) : implicitMesh(fn, preset.d, 38);
    assert.ok(mesh.vertices.length > 0, `${key}: nonempty mesh`);
    assert.ok(mesh.vertices.every(Number.isFinite), `${key}: finite vertex data`);
    assert.ok(mesh.zmin >= -preset.d && mesh.zmax <= preset.d, `${key}: height bounds`);
    assert.ok(preset.description && preset.experiment, `${key}: explanation and experiment`);
  }
});

test('clicking a preset fills its equation, mode, domain, and explanation', () => {
  const { page, element, presetButtons } = createPage();
  const presets = vm.runInContext('presets', page);
  for (const button of presetButtons) {
    const preset = presets[button.dataset.preset];
    button.onclick();
    const equation = vm.runInContext('activeEquation()', page);
    assert.equal(equation.view.input.value, preset.eq);
    assert.equal(Number(element('domain').value), preset.d);
    assert.equal(equation.mode, preset.mode);
    assert.equal(element('presetExplanation').hidden, false);
    assert.equal(element('presetTitle').textContent, preset.name);
    assert.equal(element('presetDescription').textContent, preset.description);
    assert.equal(element('presetExperiment').textContent, preset.experiment);
  }
  const equation = vm.runInContext('activeEquation()', page);
  equation.view.input.listeners.get('input')();
  assert.equal(element('presetExplanation').hidden, true);
  assert.equal(equation.presetKey, null);
  presetButtons[0].onclick();
  equation.view.mode.value = 'implicit';
  equation.view.mode.listeners.get('change')();
  assert.equal(element('presetExplanation').hidden, true);
});

test('mixed equation modes draw separate buffers and colors while errors stay local', async () => {
  const app = createPage({ webgl: true });
  await app.flushBuild();
  vm.runInContext(
    "addEquation('x^2+y^2+z^2=9', 'implicit', false); addEquation('sin(', 'explicit', false); build()",
    app.page,
  );
  await app.flushBuild();
  const equations = vm.runInContext('equations', app.page);
  assert.ok(equations[0].mesh);
  assert.ok(equations[1].mesh);
  assert.equal(equations[2].mesh, null);
  assert.ok(equations[2].error);
  assert.equal(equations[0].error, '');
  assert.equal(equations[1].error, '');
  assert.notEqual(equations[0].buffers.surface, equations[1].buffers.surface);
  assert.notEqual(equations[0].color, equations[1].color);
  app.drawing.length = 0;
  vm.runInContext('draw()', app.page);
  const triangles = app.drawing.filter((call) => call.primitive === 'TRIANGLES');
  assert.equal(triangles.length, 2);
  assert.notDeepEqual(triangles[0].color, triangles[1].color);
  assert.ok(app.element('equationTag').textContent.includes('#1:'));
  assert.ok(app.element('equationTag').textContent.includes('#2:'));
  assert.ok(!app.element('equationTag').textContent.includes('#3:'));

  app.element('style').value = 'wire';
  app.drawing.length = 0;
  vm.runInContext('draw()', app.page);
  assert.equal(app.drawing.filter((call) => call.primitive === 'TRIANGLES').length, 0);
  for (const equation of equations.slice(0, 2)) {
    assert.ok(app.drawing.some((call) => call.buffer === equation.buffers.wire));
  }
});

test('visibility and color reuse meshes; removal releases only the selected surface', async () => {
  const app = createPage({ webgl: true });
  await app.flushBuild();
  vm.runInContext("addEquation('0', 'explicit', false); build()", app.page);
  await app.flushBuild();
  const equations = vm.runInContext('equations', app.page);
  const [first, second] = equations;
  const initialMesh = first.mesh;
  const firstBuffers = first.buffers;
  const secondBuffers = second.buffers;
  const initialUploads = app.uploads.length;
  first.view.color.value = '#ff0000';
  first.view.color.listeners.get('input')();
  assert.equal(first.color, '#ff0000');
  assert.equal(first.mesh, initialMesh);
  assert.equal(app.uploads.length, initialUploads);
  second.view.visible.checked = false;
  second.view.visible.listeners.get('change')();
  await app.flushBuild();
  assert.equal(vm.runInContext('visibleSurfaces().length', app.page), 1);
  assert.equal(first.mesh, initialMesh);
  assert.equal(second.buffers, secondBuffers);
  second.view.visible.checked = true;
  second.view.visible.listeners.get('change')();
  await app.flushBuild();
  assert.equal(vm.runInContext('visibleSurfaces().length', app.page), 2);
  assert.equal(second.buffers, secondBuffers);
  vm.runInContext('removeEquation(2)', app.page);
  assert.deepEqual(app.deletedBuffers, [secondBuffers.surface, secondBuffers.wire]);
  assert.equal(first.buffers, firstBuffers);
  assert.equal(vm.runInContext('activeEquation().id', app.page), 1);
  assert.equal(first.view.remove.disabled, true);
  vm.runInContext('removeEquation(1)', app.page);
  assert.equal(equations.length, 1);
});

test('presets replace the active equation only and keep a shared domain for existing surfaces', () => {
  const app = createPage();
  const first = vm.runInContext('activeEquation()', app.page);
  vm.runInContext("addEquation('', 'explicit', false)", app.page);
  app.presetButtons.find((button) => button.dataset.preset === 'sphere').onclick();
  const second = vm.runInContext('activeEquation()', app.page);
  assert.equal(first.source, 'sin(sqrt(x^2 + y^2))');
  assert.equal(second.source, 'x^2 + y^2 + z^2 = 9');
  assert.equal(second.mode, 'implicit');
  assert.equal(Number(app.element('domain').value), 6);
  vm.runInContext('selectEquation(1)', app.page);
  assert.equal(app.element('presetExplanation').hidden, true);
  vm.runInContext('selectEquation(2)', app.page);
  assert.equal(app.element('presetTitle').textContent, 'Sfera');
});

test('failed or blank equations release stale surfaces without affecting valid neighbors', async () => {
  const app = createPage({ webgl: true });
  await app.flushBuild();
  vm.runInContext("addEquation('0', 'explicit', false); build()", app.page);
  await app.flushBuild();
  const equations = vm.runInContext('equations', app.page);
  const neighbor = equations[1].mesh;
  const oldBuffers = equations[0].buffers;
  equations[0].source = 'sqrt(';
  vm.runInContext('build()', app.page);
  await app.flushBuild();
  assert.equal(equations[0].mesh, null);
  assert.equal(equations[1].mesh, neighbor);
  assert.ok(equations[0].view.input.attributes.has('aria-invalid'));
  assert.deepEqual(app.deletedBuffers, [oldBuffers.surface, oldBuffers.wire]);
  equations[0].source = '';
  vm.runInContext('build()', app.page);
  await app.flushBuild();
  assert.equal(equations[0].error, '');
  assert.equal(equations[0].view.input.attributes.has('aria-invalid'), false);
  assert.equal(vm.runInContext('visibleSurfaces().length', app.page), 1);
});

test('the latest build wins when equations or domain change before rendering', async () => {
  const app = createPage({ webgl: true });
  vm.runInContext(
    "activeEquation().source = '1'; build(); activeEquation().source = '2'; $('domain').value = '3'; build()",
    app.page,
  );
  await app.flushBuild();
  const equation = vm.runInContext('activeEquation()', app.page);
  assert.equal(equation.renderedSource, '2');
  assert.equal(equation.renderedDomain, 3);
  assert.equal(equation.mesh.zmin, 2);
  assert.equal(equation.mesh.zmax, 2);
  assert.equal(app.element('renderButton').disabled, false);
  assert.equal(app.element('meshStatus').textContent.includes('Obliczanie'), false);

  vm.runInContext('build()', app.page);
  equation.view.input.value = '3';
  equation.view.input.listeners.get('input')();
  await app.flushBuild();
  assert.equal(equation.renderedSource, '2');
  assert.equal(app.element('renderButton').disabled, false);
  assert.equal(app.element('meshStatus').textContent.includes('Obliczanie'), false);
});

test('hidden meshes rebuild for changed domain and PNG labels include visible surfaces only', async () => {
  const app = createPage({ webgl: true });
  await app.flushBuild();
  vm.runInContext("addEquation('1', 'explicit', false); build()", app.page);
  await app.flushBuild();
  const second = vm.runInContext('activeEquation()', app.page);
  second.view.visible.checked = false;
  second.view.visible.listeners.get('change')();
  app.element('domain').value = '3';
  app.element('domain').onchange();
  await app.flushBuild();
  assert.equal(second.renderedDomain, 6);
  app.element('export').onclick();
  assert.ok(app.exportText.some((label) => label.text.startsWith('#1:')));
  assert.ok(!app.exportText.some((label) => label.text.startsWith('#2:')));
  second.view.visible.checked = true;
  second.view.visible.listeners.get('change')();
  await app.flushBuild();
  assert.equal(second.renderedDomain, 3);
  assert.equal(vm.runInContext('visibleSurfaces().length', app.page), 2);
  app.exportText.length = 0;
  app.element('export').onclick();
  assert.ok(
    app.exportText.some((label) => label.text.startsWith('#2:') && label.color === second.color),
  );
});

test('screen rays unproject pixels into world coordinates and reject invalid inputs', () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const ray = screenRay(75, 25, 100, 100, identity, 6);
  assert.deepEqual([...ray.origin], [3, 3, -6]);
  assert.deepEqual([...ray.direction], [0, 0, 1]);
  assert.equal(ray.maxDistance, 12);
  assert.equal(screenRay(-1, 50, 100, 100, identity, 6), null);
  assert.equal(screenRay(50, 50, 0, 100, identity, 6), null);
  assert.equal(inverseMatrix(Array(16).fill(0)), null);
});

test('triangle picking hits both sides and edges and chooses the nearest surface', () => {
  const triangle = (z, reverse = false) => {
    const points = [
      [-1, -1, z],
      [1, -1, z],
      [0, 1, z],
    ];
    if (reverse) points.reverse();
    return points.flatMap((point) => [...point, 0, 0, 1]);
  };
  const ray = { origin: [0, 0, -3], direction: [0, 0, 1], maxDistance: 10 };
  const surfaces = [
    { id: 2, mesh: { vertices: triangle(1) } },
    { id: 1, mesh: { vertices: triangle(0, true) } },
  ];
  const hit = pickSurface(ray, surfaces);
  assert.equal(hit.equationId, 1);
  assert.deepEqual([...hit.position], [0, 0, 0]);
  assert.equal(hit.distance, 3);
  assert.ok(pickSurface({ ...ray, origin: [0, 1, -3] }, surfaces));
  assert.equal(pickSurface({ ...ray, origin: [2, 0, -3] }, surfaces), null);
  assert.equal(pickSurface({ ...ray, direction: [1, 0, 0] }, surfaces), null);
  assert.equal(pickSurface({ ...ray, maxDistance: 2 }, surfaces), null);
  assert.equal(pickSurface(null, surfaces), null);
});

function clientPosition(app, position) {
  const matrix = vm.runInContext('viewMatrix()', app.page);
  const domain = vm.runInContext('currentDomain', app.page);
  const clip = Array.from(
    { length: 4 },
    (_, row) =>
      (matrix[row] * position[0]) / domain +
      (matrix[4 + row] * position[1]) / domain +
      (matrix[8 + row] * position[2]) / domain +
      matrix[12 + row],
  );
  return [
    20 + ((clip[0] / clip[3]) * 0.5 + 0.5) * 1000,
    30 + ((-clip[1] / clip[3]) * 0.5 + 0.5) * 600,
  ];
}

test('screen rays remain aligned after camera rotation, zoom, pan, and domain changes', async () => {
  const app = createPage({ webgl: true });
  await app.flushBuild();
  const position = [1, -0.6, 0.3];
  for (const settings of [
    { theta: 0.78, phi: 0.94, zoom: 1, panX: 0, panY: 0 },
    { theta: -1.2, phi: 1.8, zoom: 1.6, panX: 0.2, panY: -0.1 },
  ]) {
    vm.runInContext(
      'Object.assign(camera, ' + JSON.stringify(settings) + '); currentDomain = 4;',
      app.page,
    );
    const [x, y] = clientPosition(app, position);
    const ray = screenRay(x - 20, y - 30, 1000, 600, vm.runInContext('viewMatrix()', app.page), 4);
    const delta = position.map((value, index) => value - ray.origin[index]);
    const distance = delta.reduce((sum, value, index) => sum + value * ray.direction[index], 0);
    const error = Math.hypot(
      ...position.map(
        (value, index) => value - ray.origin[index] - distance * ray.direction[index],
      ),
    );
    assert.ok(error < 1e-8);
  }
});

test('inspection chooses the front implicit surface and reports its equation and coordinates', async () => {
  const app = createPage({ webgl: true });
  vm.runInContext(
    "activeEquation().source = '0'; addEquation('x^2+y^2+z^2=4', 'implicit', false); build()",
    app.page,
  );
  await app.flushBuild();
  vm.runInContext('inspectPoint(520, 330)', app.page);
  const point = vm.runInContext('selectedPoint', app.page);
  assert.equal(point.equationId, 2);
  assert.ok(Math.hypot(...point.position) > 1.8);
  assert.equal(app.element('pointInspector').hidden, false);
  assert.match(app.element('pointEquation').textContent, /równanie 2/);
  assert.match(app.element('pointCoordinates').textContent, /x ≈ .*y ≈ .*z ≈ /);
  app.drawing.length = 0;
  vm.runInContext('draw()', app.page);
  assert.equal(app.drawing.filter((call) => call.primitive === 'POINTS').length, 1);
});

test('pins compare multiple positions, prevent duplicates, and can be removed individually', async () => {
  const app = createPage({ webgl: true });
  vm.runInContext("activeEquation().source = '0'; build()", app.page);
  await app.flushBuild();
  vm.runInContext('inspectPoint(520, 330)', app.page);
  app.element('pinPoint').onclick();
  app.element('pinPoint').onclick();
  assert.equal(vm.runInContext('pinnedPoints.length', app.page), 1);
  assert.equal(app.element('pinPoint').disabled, true);
  const [x, y] = clientPosition(app, [1, 1, 0]);
  vm.runInContext(`inspectPoint(${x}, ${y})`, app.page);
  app.element('pinPoint').onclick();
  const pins = vm.runInContext('pinnedPoints', app.page);
  assert.equal(pins.length, 2);
  assert.ok(Math.abs(pins[1].position[0] - 1) < 1e-8);
  assert.ok(Math.abs(pins[1].position[1] - 1) < 1e-8);
  assert.equal(app.element('pinnedPoints').children.length, 2);
  app.element('clearSelectedPoint').onclick();
  assert.equal(app.element('pointInspector').hidden, true);
  assert.equal(pins.length, 2);
  app.drawing.length = 0;
  vm.runInContext('camera.theta += .4; draw()', app.page);
  assert.equal(app.drawing.filter((call) => call.primitive === 'POINTS').length, 2);
  app.element('pinnedPoints').children[0].children[1].listeners.get('click')();
  assert.equal(pins.length, 1);
  assert.equal(pins[0].id, 2);
  app.element('clearPinnedPoints').onclick();
  assert.equal(pins.length, 0);
  assert.equal(app.element('clearPinnedPoints').disabled, true);
});

test('pins hide with their equation, survive quality changes, and clear after a changed equation renders', async () => {
  const app = createPage({ webgl: true });
  vm.runInContext("activeEquation().source = '0'; build()", app.page);
  await app.flushBuild();
  vm.runInContext('inspectPoint(520, 330); pinSelectedPoint()', app.page);
  const equation = vm.runInContext('activeEquation()', app.page);
  const pins = vm.runInContext('pinnedPoints', app.page);
  equation.view.visible.checked = false;
  equation.view.visible.listeners.get('change')();
  await app.flushBuild();
  assert.equal(pins.length, 1);
  assert.equal(app.element('pointInspector').hidden, true);
  app.drawing.length = 0;
  vm.runInContext('draw()', app.page);
  assert.equal(app.drawing.filter((call) => call.primitive === 'POINTS').length, 0);
  equation.view.visible.checked = true;
  equation.view.visible.listeners.get('change')();
  app.element('quality').value = 'medium';
  app.element('quality').onchange();
  await app.flushBuild();
  assert.equal(pins.length, 1);
  app.drawing.length = 0;
  vm.runInContext('draw()', app.page);
  assert.equal(app.drawing.filter((call) => call.primitive === 'POINTS').length, 1);
  equation.view.input.value = '1';
  equation.view.input.listeners.get('input')();
  assert.equal(pins.length, 1);
  vm.runInContext('build()', app.page);
  await app.flushBuild();
  assert.equal(pins.length, 0);
});

test('only a click or tap inspects a point; drags, panning, pinches, and cancellations do not', async () => {
  const app = createPage({ webgl: true });
  vm.runInContext("activeEquation().source = '0'; build()", app.page);
  await app.flushBuild();
  const listeners = app.element('canvas').listeners;
  const event = (type, overrides = {}) => ({
    type,
    pointerId: 1,
    clientX: 520,
    clientY: 330,
    button: 0,
    buttons: 1,
    shiftKey: false,
    ...overrides,
  });
  listeners.get('pointerdown')(event('pointerdown'));
  listeners.get('pointermove')(event('pointermove', { clientX: 550 }));
  listeners.get('pointerup')(event('pointerup', { clientX: 550 }));
  assert.equal(vm.runInContext('selectedPoint', app.page), null);
  for (const overrides of [{ shiftKey: true }, { button: 2 }]) {
    listeners.get('pointerdown')(event('pointerdown', overrides));
    listeners.get('pointerup')(event('pointerup', overrides));
    assert.equal(vm.runInContext('selectedPoint', app.page), null);
  }
  listeners.get('pointerdown')(event('pointerdown'));
  listeners.get('pointerdown')(event('pointerdown', { pointerId: 2 }));
  listeners.get('pointerup')(event('pointerup'));
  listeners.get('pointerup')(event('pointerup', { pointerId: 2 }));
  assert.equal(vm.runInContext('selectedPoint', app.page), null);
  listeners.get('pointerdown')(event('pointerdown'));
  listeners.get('pointercancel')(event('pointercancel'));
  assert.equal(vm.runInContext('selectedPoint', app.page), null);
  listeners.get('pointerdown')(event('pointerdown'));
  listeners.get('pointerup')(event('pointerup'));
  assert.ok(vm.runInContext('selectedPoint', app.page));
  listeners.get('keydown')({ key: 'Escape', preventDefault() {} });
  assert.equal(vm.runInContext('selectedPoint', app.page), null);
});

test('triangle sections handle ordinary cuts, shared edges, tangent points, and coplanar regions', () => {
  const mesh = surfaceMesh(() => 0, 2, 2);
  const cut = sliceTriangles(mesh.vertices, 0, 0, 2);
  assert.equal(cut.segments.length, 12);
  assert.equal(cut.points.length, 0);
  for (let index = 0; index < cut.segments.length; index += 3) {
    assert.equal(cut.segments[index], 0);
    assert.equal(cut.segments[index + 2], 0);
  }
  const flat = surfaceMesh(() => 0, 2, 1);
  const coincident = sliceTriangles(flat.vertices, 2, 0, 2);
  assert.equal(coincident.areas.length, 18);
  assert.equal(
    coincident.segments.length,
    24,
    'only the four boundary edges, without the diagonal',
  );
  assert.equal(coincident.points.length, 0);
  const triangle = [
    [0, 0, 0],
    [1, 0, 1],
    [0, 1, 1],
  ].flatMap((point) => [...point, 0, 0, 1]);
  const tangent = sliceTriangles(triangle, 2, 0, 2);
  assert.equal(tangent.segments.length, 0);
  assert.deepEqual([...tangent.points], [0, 0, 0]);
  const empty = sliceTriangles(triangle, 2, -1, 2);
  assert.equal(empty.segments.length + empty.points.length + empty.areas.length, 0);
});

test('sphere sections shrink with height and detect the polar contact point', () => {
  const mesh = implicitMesh(compileEquation('x^2+y^2+z^2=9', 'implicit'), 4, 32);
  for (const height of [0, 1, 2]) {
    const cut = sliceTriangles(mesh.vertices, 2, height, 4);
    assert.ok(cut.segments.length > 0);
    const radius = Math.sqrt(9 - height * height);
    for (let index = 0; index < cut.segments.length; index += 3) {
      assert.equal(cut.segments[index + 2], height);
      assert.ok(Math.abs(Math.hypot(cut.segments[index], cut.segments[index + 1]) - radius) < 0.04);
    }
  }
  const tangent = sliceTriangles(mesh.vertices, 2, 3, 4);
  assert.equal(tangent.segments.length, 0);
  assert.deepEqual([...tangent.points], [0, 0, 3]);
  const empty = sliceTriangles(mesh.vertices, 2, 3.5, 4);
  assert.equal(empty.segments.length + empty.points.length, 0);
});

test('torus horizontal sections include both inner and outer circles', () => {
  const mesh = implicitMesh(compileEquation('(sqrt(x^2+y^2)-2)^2+z^2=1', 'implicit'), 4, 32);
  const cut = sliceTriangles(mesh.vertices, 2, 0, 4);
  let inner = false,
    outer = false;
  for (let index = 0; index < cut.segments.length; index += 3) {
    const radius = Math.hypot(cut.segments[index], cut.segments[index + 1]);
    assert.equal(cut.segments[index + 2], 0);
    assert.ok(Math.min(Math.abs(radius - 1), Math.abs(radius - 3)) < 0.06);
    if (radius < 2) inner = true;
    else outer = true;
  }
  assert.ok(inner && outer);
});

test('cutting-plane geometry uses the chosen axis and shared domain', () => {
  for (const axis of [0, 1, 2]) {
    const plane = sectionPlaneVertices(axis, 1.25, 3);
    assert.equal(plane.fill.length, 18);
    assert.equal(plane.border.length, 24);
    for (let index = 0; index < plane.fill.length; index += 3) {
      assert.equal(plane.fill[index + axis], 1.25);
      for (const freeAxis of [0, 1, 2].filter((value) => value !== axis)) {
        assert.equal(Math.abs(plane.fill[index + freeAxis]), 3);
      }
    }
  }
});

test('section controls move across axes without rebuilding surfaces and draw transparent planes safely', async () => {
  const app = createPage({ webgl: true });
  vm.runInContext("activeEquation().source = 'x'; build()", app.page);
  await app.flushBuild();
  const equation = vm.runInContext('activeEquation()', app.page);
  const mesh = equation.mesh,
    buffers = equation.buffers;
  app.element('sectionEnabled').checked = true;
  app.element('sectionEnabled').onchange();
  app.element('sectionPosition').value = '1.25';
  app.element('sectionPosition').oninput();
  const section = vm.runInContext('crossSection', app.page);
  assert.equal(section.results.length, 1);
  assert.equal(equation.mesh, mesh);
  assert.equal(equation.buffers, buffers);
  for (let index = 0; index < section.results[0].segments.length; index += 3) {
    assert.equal(section.results[0].segments[index + 2], 1.25);
    assert.ok(Math.abs(section.results[0].segments[index] - 1.25) < 1e-8);
  }
  app.element('sectionAxis').value = 'y';
  app.element('sectionAxis').onchange();
  assert.equal(section.axis, 'y');
  assert.equal(app.element('sectionAxes').textContent, 'Osie przekroju: x, z.');
  app.element('sectionZero').onclick();
  assert.equal(section.value, 0);
  app.drawing.length = 0;
  vm.runInContext('draw()', app.page);
  const plane = app.drawing.find((call) => call.kind === 3);
  assert.equal(plane.blended, true);
  assert.equal(plane.depthWrite, false);
  assert.ok(app.drawing.some((call) => call.kind === 4 && !call.blended && call.depthWrite));
  app.element('sectionPlane').checked = false;
  app.element('sectionPlane').onchange();
  app.drawing.length = 0;
  vm.runInContext('draw()', app.page);
  assert.equal(
    app.drawing.some((call) => call.kind === 3),
    false,
  );
  assert.ok(app.drawing.some((call) => call.kind === 4));
  assert.equal(equation.mesh, mesh);
});

test('sections track equation visibility, color, domain, errors, and removal', async () => {
  const app = createPage({ webgl: true });
  vm.runInContext(
    "activeEquation().source = 'x'; addEquation('y', 'explicit', false); build()",
    app.page,
  );
  await app.flushBuild();
  app.element('sectionEnabled').checked = true;
  app.element('sectionEnabled').onchange();
  const section = vm.runInContext('crossSection', app.page);
  const equations = vm.runInContext('equations', app.page);
  assert.equal(section.results.length, 2);
  const geometry = section.results[0].segments;
  equations[0].view.color.value = '#ff0000';
  equations[0].view.color.listeners.get('input')();
  assert.equal(section.results[0].segments, geometry);
  assert.equal(section.results[0].equation.color, '#ff0000');
  equations[1].view.visible.checked = false;
  equations[1].view.visible.listeners.get('change')();
  await app.flushBuild();
  assert.equal(section.results.length, 1);
  app.element('sectionPosition').value = '5';
  app.element('sectionPosition').oninput();
  app.element('domain').value = '2';
  app.element('domain').onchange();
  await app.flushBuild();
  assert.equal(section.value, 2);
  assert.equal(Number(app.element('sectionPosition').max), 2);
  assert.equal(Number(app.element('sectionPosition').min), -2);
  assert.equal(section.results[0].equation.renderedDomain, 2);
  equations[1].view.visible.checked = true;
  equations[1].view.visible.listeners.get('change')();
  await app.flushBuild();
  assert.equal(section.results.length, 2);
  equations[1].source = 'sqrt(';
  vm.runInContext('build()', app.page);
  await app.flushBuild();
  assert.equal(section.results.length, 1);
  vm.runInContext('removeEquation(1)', app.page);
  assert.equal(section.results.length, 0);
  assert.match(app.element('sectionStatus').textContent, /Wyrenderuj/);
});

test('point picking ignores the section plane and PNG export records the enabled slice', async () => {
  const app = createPage({ webgl: true });
  vm.runInContext("activeEquation().source = '0'; build()", app.page);
  await app.flushBuild();
  app.element('sectionEnabled').checked = true;
  app.element('sectionEnabled').onchange();
  app.element('sectionPosition').value = '1';
  app.element('sectionPosition').oninput();
  vm.runInContext('inspectPoint(520, 330); pinSelectedPoint()', app.page);
  const point = vm.runInContext('selectedPoint', app.page);
  assert.ok(Math.abs(point.position[2]) < 1e-8);
  app.element('export').onclick();
  assert.ok(app.exportText.some((label) => label.text.includes('Przekrój: z = 1.00')));
  assert.equal(vm.runInContext('pinnedPoints.length', app.page), 1);
  app.element('sectionEnabled').checked = false;
  app.element('sectionEnabled').onchange();
  assert.equal(app.element('sectionTag').hidden, true);
  app.drawing.length = 0;
  vm.runInContext('draw()', app.page);
  assert.equal(
    app.drawing.some((call) => call.kind === 3 || call.kind === 4),
    false,
  );
  assert.ok(app.drawing.some((call) => call.primitive === 'POINTS'));
});

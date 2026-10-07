'use strict';

// Equation records and GPU resource lifetime. Each surface owns its buffers.
function activeEquation() {
  return equations.find((equation) => equation.id === activeEquationId);
}

function visibleSurfaces() {
  return equations.filter(
    (equation) => equation.visible && equation.mesh && equation.renderedDomain === currentDomain,
  );
}

function equationLabel(equation) {
  const source = equation.renderedSource;
  if (source.includes('=')) return source;
  return equation.renderedMode === 'explicit' ? 'z = ' + source : source + ' = 0';
}

function colorComponents(color) {
  return [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16) / 255);
}

function addEquation(source = '', mode = 'explicit', focus = true) {
  const id = nextEquationId++;
  const usedColors = new Set(equations.map((equation) => equation.color));
  const equation = {
    id,
    source,
    mode,
    color:
      equationColors.find((color) => !usedColors.has(color)) ||
      equationColors[(id - 1) % equationColors.length],
    visible: true,
    presetKey: null,
    mesh: null,
    buffers: null,
    renderedSource: '',
    renderedMode: '',
    renderedDomain: null,
    renderedQuality: null,
    error: '',
    sectionCache: null,
    view: null,
  };
  equations.push(equation);
  equation.view = createEquationCard(equation);
  selectEquation(id);
  updateRemoveButtons();
  if (focus) equation.view.input.focus({ preventScroll: true });
  return equation;
}

function discardSurface(equation) {
  invalidateEquationPoints(equation.id);
  if (equation.buffers) {
    gl.deleteBuffer(equation.buffers.surface);
    gl.deleteBuffer(equation.buffers.wire);
  }
  equation.buffers = null;
  equation.mesh = null;
  equation.sectionCache = null;
}

function removeEquation(id) {
  if (equations.length === 1) return;
  const index = equations.findIndex((equation) => equation.id === id);
  if (index < 0) return;
  cancelBuild();
  const [equation] = equations.splice(index, 1);
  discardSurface(equation);
  equation.view.card.remove();
  if (activeEquationId === id) selectEquation(equations[Math.min(index, equations.length - 1)].id);
  updateRemoveButtons();
  refreshScene();
}

'use strict';

// Equation cards, messages, preset explanations, and rebuilding the shared scene.
function toast(s) {
  $('toast').textContent = s;
  $('toast').classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('toast').classList.remove('show'), 2500);
}

function fatal(s) {
  rendererUnavailable = true;
  cancelBuild();
  $('fatal').style.display = 'grid';
  if (s) $('fatalText').textContent = s;
  for (const id of ['renderButton', 'export', 'zoomIn', 'zoomOut', 'rotate']) $(id).disabled = true;
}

function createEquationCard(equation) {
  const card = $('equationTemplate').content.firstElementChild.cloneNode(true);
  const field = (name) => card.querySelector(`[data-field="${name}"]`);
  const view = {
    card,
    input: field('input'),
    mode: field('mode'),
    color: field('color'),
    visible: field('visible'),
    remove: field('remove'),
    message: field('message'),
    hint: field('hint'),
  };
  field('title').textContent = 'Równanie ' + equation.id;
  view.input.id = 'equation-' + equation.id;
  view.hint.id = 'equation-hint-' + equation.id;
  view.message.id = 'equation-message-' + equation.id;
  field('inputLabel').htmlFor = view.input.id;
  view.input.setAttribute('aria-describedby', view.hint.id + ' ' + view.message.id);
  view.color.setAttribute('aria-label', 'Kolor równania ' + equation.id);
  view.remove.setAttribute('aria-label', 'Usuń równanie ' + equation.id);
  view.input.value = equation.source;
  view.input.placeholder = 'Wpisz równanie…';
  view.mode.value = equation.mode;
  view.color.value = equation.color;
  view.visible.checked = equation.visible;
  card.style.setProperty('--surface-color', equation.color);
  card.addEventListener('focusin', () => selectEquation(equation.id));
  card.addEventListener('click', () => selectEquation(equation.id));
  view.input.addEventListener('input', () => {
    cancelBuild();
    equation.source = view.input.value;
    clearPresetExplanation();
    setEquationError(equation, '');
    updatePresetSelection();
  });
  view.mode.addEventListener('change', () => {
    cancelBuild();
    equation.mode = view.mode.value;
    clearPresetExplanation();
    setEquationError(equation, '');
    updateEquationHint(equation);
    updatePresetSelection();
  });
  view.color.addEventListener('input', () => {
    equation.color = view.color.value;
    card.style.setProperty('--surface-color', equation.color);
    refreshScene();
  });
  view.visible.addEventListener('change', () => {
    equation.visible = view.visible.checked;
    refreshScene();
    build();
  });
  view.remove.addEventListener('click', (event) => {
    event.stopPropagation();
    removeEquation(equation.id);
  });
  $('equations').appendChild(card);
  equation.view = view;
  updateEquationHint(equation);
  return view;
}

function updateEquationHint(equation) {
  equation.view.hint.textContent =
    equation.mode === 'explicit'
      ? 'Wpisz funkcję x, y lub z = …; użyj ^ do potęgowania.'
      : 'Wpisz F(x, y, z) albo równanie lewa = prawa.';
}

function setEquationError(equation, message) {
  equation.error = message;
  equation.view.message.textContent = message;
  if (message) equation.view.input.setAttribute('aria-invalid', 'true');
  else equation.view.input.removeAttribute('aria-invalid');
}

function selectEquation(id) {
  if (!equations.some((equation) => equation.id === id)) return;
  activeEquationId = id;
  for (const equation of equations)
    equation.view.card.classList.toggle('active', equation.id === id);
  $('presetTarget').textContent = 'Przykład zostanie wstawiony do równania ' + id + '.';
  updatePresetSelection();
  const key = activeEquation().presetKey;
  if (key) showPresetExplanation(key);
  else $('presetExplanation').hidden = true;
}

function updateRemoveButtons() {
  for (const equation of equations) equation.view.remove.disabled = equations.length === 1;
}

function updatePresetSelection() {
  const equation = activeEquation();
  document.querySelectorAll('.preset').forEach((button) => {
    const preset = presets[button.dataset.preset];
    button.classList.toggle(
      'active',
      !!equation && equation.source.trim() === preset.eq && equation.mode === preset.mode,
    );
  });
}

function clearPresetExplanation() {
  const equation = activeEquation();
  if (equation) equation.presetKey = null;
  $('presetExplanation').hidden = true;
}

function showPresetExplanation(key) {
  const preset = presets[key];
  activeEquation().presetKey = key;
  $('presetTitle').textContent = preset.name;
  $('presetDescription').textContent = preset.description;
  $('presetExperiment').textContent = preset.experiment;
  $('presetExplanation').hidden = false;
}

function applyPreset(key) {
  cancelBuild();
  const equation = activeEquation();
  const preset = presets[key];
  equation.source = preset.eq;
  equation.mode = preset.mode;
  equation.visible = true;
  equation.view.input.value = preset.eq;
  equation.view.mode.value = preset.mode;
  equation.view.visible.checked = true;
  updateEquationHint(equation);
  setEquationError(equation, '');
  // A shared domain must fit the other surfaces already in the scene.
  $('domain').value =
    equations.length === 1 ? preset.d : Math.max(Number($('domain').value), preset.d);
  updateDomain();
  updatePresetSelection();
  resetCamera();
  showPresetExplanation(key);
  return build();
}

function updateDomain() {
  $('domainValue').value = '−' + $('domain').value + ' … ' + $('domain').value;
}

function sceneHeightRange(surfaces) {
  return surfaces.length
    ? {
        min: Math.min(...surfaces.map((equation) => equation.mesh.zmin)),
        max: Math.max(...surfaces.map((equation) => equation.mesh.zmax)),
      }
    : { min: 0, max: 0 };
}

function refreshScene() {
  updateCrossSection();
  refreshPointInspector();
  const surfaces = visibleSurfaces();
  const heights = sceneHeightRange(surfaces);
  const count = surfaces.reduce((sum, equation) => sum + equation.buffers.surfaceCount / 3, 0);
  const labels = surfaces.map((equation) => '#' + equation.id + ': ' + equationLabel(equation));
  $('equationTag').textContent = labels.join(' · ') || 'Brak widocznych powierzchni';
  $('equationTag').title = labels.join('\n');
  $('zMin').textContent = heights.min.toFixed(2);
  $('zMax').textContent = heights.max.toFixed(2);
  $('meshStatus').textContent = surfaces.length
    ? count.toLocaleString('pl-PL') + ' trójkątów · widoczne powierzchnie: ' + surfaces.length
    : 'Brak widocznych powierzchni';
  needsDraw = true;
}

function cancelBuild() {
  if (building) refreshScene();
  buildVersion++;
  building = false;
  $('renderButton').disabled = rendererUnavailable;
}

function yieldToPage() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

async function build() {
  if (!gl || rendererUnavailable) return;
  const version = ++buildVersion;
  const domain = Number($('domain').value);
  const quality = $('quality').value;
  const snapshots = equations
    .filter((equation) => equation.visible)
    .map((equation) => ({
      equation,
      source: equation.source.trim(),
      mode: equation.mode,
    }));
  building = true;
  $('renderButton').disabled = true;
  $('meshStatus').textContent = 'Obliczanie powierzchni…';
  await yieldToPage();
  if (version !== buildVersion) return;
  const start = performance.now();
  try {
    currentDomain = domain;
    uploadSceneGeometry(domain);
    for (const { equation, source, mode } of snapshots) {
      if (version !== buildVersion) return;
      setEquationError(equation, '');
      if (!source) {
        discardSurface(equation);
        continue;
      }
      if (
        equation.mesh &&
        equation.renderedSource === source &&
        equation.renderedMode === mode &&
        equation.renderedDomain === domain &&
        equation.renderedQuality === quality
      )
        continue;
      try {
        const fn = compileEquation(source, mode);
        const n =
          mode === 'explicit'
            ? { low: 48, medium: 90, high: 150 }[quality]
            : { low: 24, medium: 38, high: 54 }[quality];
        const result =
          mode === 'explicit' ? surfaceMesh(fn, domain, n) : implicitMesh(fn, domain, n);
        if (!result.vertices.length)
          throw Error('Brak powierzchni w tym zakresie. Zmień równanie lub zakres osi.');
        uploadMesh(equation, result);
        if (equation.renderedSource !== source || equation.renderedMode !== mode) {
          invalidateEquationPoints(equation.id);
        }
        equation.mesh = result;
        equation.renderedSource = source;
        equation.renderedMode = mode;
        equation.renderedDomain = domain;
        equation.renderedQuality = quality;
      } catch (error) {
        discardSurface(equation);
        setEquationError(equation, error.message);
      }
      refreshScene();
      await yieldToPage();
    }
  } catch (error) {
    toast('Nie udało się przygotować widoku: ' + error.message);
  } finally {
    if (version === buildVersion) {
      building = false;
      $('renderButton').disabled = rendererUnavailable;
      refreshScene();
      $('renderTime').textContent = Math.round(performance.now() - start) + ' ms · WebGL';
    }
  }
}

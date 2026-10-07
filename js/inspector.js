'use strict';

// Selected and pinned points belong to the rendered equation, not an unrendered draft.
function pointEquation(point) {
  return equations.find((equation) => equation.id === point.equationId);
}

function pointIsVisible(point) {
  const equation = pointEquation(point);
  return (
    equation &&
    equation.visible &&
    equation.mesh &&
    equation.renderedDomain === currentDomain &&
    point.position.every((value) => Math.abs(value) <= currentDomain + 1e-8)
  );
}

function pointCoordinates(point) {
  return point.position
    .map(
      (value, index) =>
        ['x', 'y', 'z'][index] + ' ≈ ' + (Math.abs(value) < 0.00005 ? 0 : value).toFixed(4),
    )
    .join(' · ');
}

function samePoint(a, b) {
  return (
    a &&
    b &&
    a.equationId === b.equationId &&
    Math.hypot(...a.position.map((value, index) => value - b.position[index])) < 1e-6
  );
}

function inspectPoint(clientX, clientY) {
  if (!gl || rendererUnavailable) return;
  draw();
  const rect = canvas.getBoundingClientRect();
  const ray = screenRay(
    clientX - rect.left,
    clientY - rect.top,
    rect.width,
    rect.height,
    viewMatrix(),
    currentDomain,
  );
  selectedPoint = pickSurface(ray, visibleSurfaces());
  refreshPointInspector();
  if (!selectedPoint) toast('Kliknij w widoczną powierzchnię, aby odczytać punkt.');
}

function clearSelectedPoint() {
  selectedPoint = null;
  refreshPointInspector();
}

function pinSelectedPoint() {
  if (
    !selectedPoint ||
    !pointIsVisible(selectedPoint) ||
    pinnedPoints.some((point) => samePoint(point, selectedPoint))
  )
    return;
  const id = nextPointId++;
  pinnedPoints.push({
    ...selectedPoint,
    position: [...selectedPoint.position],
    id,
    color: equationColors[(id - 1) % equationColors.length],
  });
  refreshPointInspector();
}

function removePinnedPoint(id) {
  const index = pinnedPoints.findIndex((point) => point.id === id);
  if (index >= 0) pinnedPoints.splice(index, 1);
  refreshPointInspector();
}

function clearPinnedPoints() {
  pinnedPoints.length = 0;
  refreshPointInspector();
}

function invalidateEquationPoints(id) {
  if (selectedPoint?.equationId === id) selectedPoint = null;
  for (let index = pinnedPoints.length - 1; index >= 0; index--) {
    if (pinnedPoints[index].equationId === id) pinnedPoints.splice(index, 1);
  }
  refreshPointInspector();
}

function refreshPointInspector() {
  if (selectedPoint && !pointIsVisible(selectedPoint)) selectedPoint = null;
  $('pointInspector').hidden = !selectedPoint;
  $('viewport').classList.toggle('inspecting', !!selectedPoint);
  if (selectedPoint) {
    $('pointEquation').textContent = 'Wybrany punkt · równanie ' + selectedPoint.equationId;
    $('pointCoordinates').textContent = pointCoordinates(selectedPoint);
  }
  const alreadyPinned = pinnedPoints.some((point) => samePoint(point, selectedPoint));
  $('pinPoint').disabled = !selectedPoint || alreadyPinned;
  $('pinPoint').textContent = alreadyPinned ? 'Przypięty' : 'Przypnij punkt';
  $('clearPinnedPoints').disabled = !pinnedPoints.length;
  const items = pinnedPoints.map((point) => {
    const item = document.createElement('li');
    item.className = 'pinned-point';
    item.style.setProperty('--point-color', point.color);
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent =
      'P' +
      point.id +
      ' · równanie ' +
      point.equationId +
      (pointIsVisible(point) ? '' : ' · poza widokiem');
    const coordinates = document.createElement('span');
    coordinates.textContent = pointCoordinates(point);
    text.appendChild(title);
    text.appendChild(coordinates);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-equation';
    remove.textContent = 'Usuń';
    remove.setAttribute('aria-label', 'Usuń punkt P' + point.id);
    remove.addEventListener('click', () => removePinnedPoint(point.id));
    item.appendChild(text);
    item.appendChild(remove);
    return item;
  });
  $('pinnedPoints').replaceChildren(...items);
  $('pointsEmpty').hidden = !!items.length;
  needsDraw = true;
}

function drawPointMarkers() {
  const points = pinnedPoints.filter(pointIsVisible);
  if (selectedPoint && pointIsVisible(selectedPoint))
    points.push({ ...selectedPoint, color: '#ffffff' });
  if (!points.length) return;
  upload(
    pointBuffer,
    points.flatMap((point) => [...point.position, 0, 0, 1]),
  );
  bind(pointBuffer);
  gl.uniform1i(program.uKind, 2);
  gl.uniform1f(program.uPointSize, 14 * Math.min(devicePixelRatio || 1, 2));
  points.forEach((point, index) => {
    gl.uniform3fv(program.uColor, colorComponents(point.color));
    gl.drawArrays(gl.POINTS, index, 1);
  });
}

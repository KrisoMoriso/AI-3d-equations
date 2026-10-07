'use strict';

// Shared slice controls, cached contours, 3D drawing, and a flat preview for learning.
function sectionLabel() {
  return crossSection.axis + ' = ' + crossSection.value.toFixed(2);
}

function updateCrossSection() {
  const domain = currentDomain;
  crossSection.value = Math.max(-domain, Math.min(domain, crossSection.value));
  $('sectionPosition').min = -domain;
  $('sectionPosition').max = domain;
  $('sectionPosition').value = crossSection.value;
  $('sectionPosition').setAttribute('aria-valuetext', sectionLabel());
  $('sectionPositionValue').value = sectionLabel();
  $('sectionTag').textContent = 'Przekrój: ' + sectionLabel();
  $('sectionTag').hidden = !crossSection.enabled;
  const axes = ['x', 'y', 'z'].filter((axis) => axis !== crossSection.axis);
  $('sectionAxes').textContent = 'Osie przekroju: ' + axes.join(', ') + '.';
  crossSection.results = crossSection.enabled
    ? visibleSurfaces().map((equation) => {
        const cache = equation.sectionCache;
        const axis = ['x', 'y', 'z'].indexOf(crossSection.axis);
        if (
          !cache ||
          cache.mesh !== equation.mesh ||
          cache.axis !== axis ||
          cache.value !== crossSection.value
        ) {
          equation.sectionCache = {
            mesh: equation.mesh,
            axis,
            value: crossSection.value,
            result: sliceTriangles(equation.mesh.vertices, axis, crossSection.value, domain),
          };
        }
        return { equation, ...equation.sectionCache.result };
      })
    : [];
  if (crossSection.enabled && gl && !rendererUnavailable && sectionPlaneBuffer)
    uploadCrossSection();
  const summaries = crossSection.results.map((result) => {
    const item = document.createElement('li');
    item.style.setProperty('--surface-color', result.equation.color);
    const kind = result.areas.length
      ? 'obszar wspólny'
      : result.segments.length
        ? 'krzywa przekroju'
        : result.points.length
          ? 'punkt styczności'
          : 'brak przecięcia';
    item.textContent = '#' + result.equation.id + ' · ' + kind;
    return item;
  });
  $('sectionSummary').replaceChildren(...summaries);
  $('sectionStatus').textContent = !crossSection.enabled
    ? 'Włącz przekrój, aby zobaczyć przecięcie z płaszczyzną.'
    : !summaries.length
      ? 'Wyrenderuj widoczną powierzchnię, aby zobaczyć przekrój.'
      : 'Przekrój ' + sectionLabel() + '. Kolory odpowiadają równaniom.';
  drawSectionPreview();
  needsDraw = true;
}

function uploadCrossSection() {
  const plane = sectionPlaneVertices(
    ['x', 'y', 'z'].indexOf(crossSection.axis),
    crossSection.value,
    currentDomain,
  );
  upload(sectionPlaneBuffer, sectionVertexData([...plane.fill, ...plane.border]));
  const positions = { segments: [], points: [], areas: [] };
  for (const result of crossSection.results) {
    result.starts = {};
    for (const kind of ['segments', 'points', 'areas']) {
      result.starts[kind] = positions[kind].length / 3;
      for (const coordinate of result[kind]) positions[kind].push(coordinate);
    }
  }
  upload(sectionLineBuffer, sectionVertexData(positions.segments));
  upload(sectionPointBuffer, sectionVertexData(positions.points));
  upload(sectionAreaBuffer, sectionVertexData(positions.areas));
}

function drawSectionFill(buffer, start, count, color, alpha) {
  bind(buffer);
  gl.uniform1i(program.uKind, 3);
  gl.uniform3fv(program.uColor, color);
  gl.uniform1f(program.uAlpha, alpha);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.drawArrays(gl.TRIANGLES, start, count);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

function drawSectionLines(buffer, start, count, color) {
  bind(buffer);
  gl.uniform1i(program.uKind, 4);
  gl.uniform3fv(program.uColor, color);
  gl.drawArrays(gl.LINES, start, count);
}

function drawCrossSection() {
  if (!crossSection.enabled) return;
  if (crossSection.showPlane) {
    drawSectionFill(sectionPlaneBuffer, 0, 6, [0.6, 0.7, 0.85], 0.12);
    drawSectionLines(sectionPlaneBuffer, 6, 8, [0.6, 0.7, 0.85]);
  }
  for (const result of crossSection.results) {
    const color = colorComponents(result.equation.color);
    if (result.areas.length)
      drawSectionFill(sectionAreaBuffer, result.starts.areas, result.areas.length / 3, color, 0.35);
    if (result.segments.length)
      drawSectionLines(
        sectionLineBuffer,
        result.starts.segments,
        result.segments.length / 3,
        color,
      );
    if (result.points.length) {
      bind(sectionPointBuffer);
      gl.uniform1i(program.uKind, 2);
      gl.uniform1f(program.uPointSize, 10 * Math.min(devicePixelRatio || 1, 2));
      gl.uniform3fv(program.uColor, color);
      gl.drawArrays(gl.POINTS, result.starts.points, result.points.length / 3);
    }
  }
}

function drawSectionPreview() {
  const preview = $('sectionPreview');
  const ratio = Math.min(devicePixelRatio || 1, 2);
  preview.width = Math.round((preview.clientWidth || 260) * ratio);
  preview.height = Math.round((preview.clientHeight || 180) * ratio);
  const ctx = preview.getContext('2d');
  if (!ctx) return;
  const width = preview.width,
    height = preview.height;
  const scale =
    Math.max(1, Math.min(width - 48 * ratio, height - 38 * ratio)) / (2 * currentDomain);
  const freeAxes = [0, 1, 2].filter((axis) => axis !== ['x', 'y', 'z'].indexOf(crossSection.axis));
  const project = (point) => [
    width / 2 + point[freeAxes[0]] * scale,
    height / 2 - point[freeAxes[1]] * scale,
  ];
  ctx.fillStyle = '#0d1218';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#293641';
  ctx.lineWidth = ratio;
  ctx.beginPath();
  ctx.moveTo(width / 2 - currentDomain * scale, height / 2);
  ctx.lineTo(width / 2 + currentDomain * scale, height / 2);
  ctx.moveTo(width / 2, height / 2 - currentDomain * scale);
  ctx.lineTo(width / 2, height / 2 + currentDomain * scale);
  ctx.stroke();
  ctx.strokeRect(
    width / 2 - currentDomain * scale,
    height / 2 - currentDomain * scale,
    2 * currentDomain * scale,
    2 * currentDomain * scale,
  );
  ctx.fillStyle = '#929ca9';
  ctx.font = 10 * ratio + 'px monospace';
  ctx.fillText(
    ['x', 'y', 'z'][freeAxes[0]],
    width / 2 + currentDomain * scale + 6 * ratio,
    height / 2 + 4 * ratio,
  );
  ctx.fillText(
    ['x', 'y', 'z'][freeAxes[1]],
    width / 2 + 5 * ratio,
    height / 2 - currentDomain * scale - 5 * ratio,
  );
  ctx.fillText('±' + currentDomain, 8 * ratio, height - 9 * ratio);
  for (const result of crossSection.results) {
    ctx.strokeStyle = result.equation.color;
    ctx.fillStyle = result.equation.color;
    ctx.lineWidth = 2 * ratio;
    ctx.globalAlpha = 0.25;
    for (let offset = 0; offset < result.areas.length; offset += 9) {
      ctx.beginPath();
      for (let corner = 0; corner < 3; corner++) {
        const [x, y] = project(result.areas.slice(offset + corner * 3, offset + corner * 3 + 3));
        if (!corner) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let offset = 0; offset < result.segments.length; offset += 6) {
      const a = project(result.segments.slice(offset, offset + 3));
      const b = project(result.segments.slice(offset + 3, offset + 6));
      ctx.moveTo(...a);
      ctx.lineTo(...b);
    }
    ctx.stroke();
    for (let offset = 0; offset < result.points.length; offset += 3) {
      const point = project(result.points.slice(offset, offset + 3));
      ctx.beginPath();
      ctx.arc(...point, 3 * ratio, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}

function initializeSectionControls() {
  $('sectionEnabled').onchange = () => {
    crossSection.enabled = $('sectionEnabled').checked;
    updateCrossSection();
  };
  $('sectionAxis').onchange = () => {
    crossSection.axis = $('sectionAxis').value;
    updateCrossSection();
  };
  $('sectionPosition').oninput = () => {
    crossSection.value = Number($('sectionPosition').value);
    updateCrossSection();
  };
  $('sectionPlane').onchange = () => {
    crossSection.showPlane = $('sectionPlane').checked;
    needsDraw = true;
  };
  $('sectionZero').onclick = () => {
    crossSection.value = 0;
    updateCrossSection();
  };
  updateCrossSection();
}

'use strict';

// Pointer, touch, keyboard, and form/settings event handlers.
function resetCamera() {
  Object.assign(camera, { theta: 0.78, phi: 0.94, zoom: 1, panX: 0, panY: 0 });
  needsDraw = true;
}
function zoom(factor) {
  camera.zoom = Math.max(0.35, Math.min(2.8, camera.zoom * factor));
  needsDraw = true;
}
const pointers = new Map();
let pinch = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.focus({ preventScroll: true });
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  pointGesture =
    pointers.size === 1 && e.button === 0 && !e.shiftKey
      ? { id: e.pointerId, x: e.clientX, y: e.clientY }
      : null;
  pinch = null;
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  if (pointGesture && Math.hypot(e.clientX - pointGesture.x, e.clientY - pointGesture.y) > 5) {
    pointGesture = null;
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()],
      distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch && distance > 0) zoom(distance / pinch);
    pinch = distance;
  } else if (pointers.size === 1) {
    const dx = e.clientX - prev.x,
      dy = e.clientY - prev.y;
    if (e.shiftKey || e.buttons === 2) {
      camera.panX += (dx / canvas.clientHeight) * 2.5;
      camera.panY -= (dy / canvas.clientHeight) * 2.5;
    } else {
      camera.theta -= dx * 0.007;
      camera.phi = Math.max(0.06, Math.min(Math.PI - 0.06, camera.phi - dy * 0.007));
    }
    needsDraw = true;
  }
});
function endPointer(e) {
  if (
    e.type === 'pointerup' &&
    pointGesture?.id === e.pointerId &&
    pointers.size === 1 &&
    !e.shiftKey &&
    Math.hypot(e.clientX - pointGesture.x, e.clientY - pointGesture.y) <= 5
  ) {
    inspectPoint(e.clientX, e.clientY);
  }
  pointGesture = null;
  pointers.delete(e.pointerId);
  pinch = null;
}
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
  canvas.addEventListener(event, endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    pointGesture = null;
    zoom(Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.0015));
  },
  { passive: false },
);
canvas.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') camera.theta -= 0.1;
  else if (e.key === 'ArrowRight') camera.theta += 0.1;
  else if (e.key === 'ArrowUp') camera.phi = Math.max(0.06, camera.phi - 0.1);
  else if (e.key === 'ArrowDown') camera.phi = Math.min(Math.PI - 0.06, camera.phi + 0.1);
  else if (e.key === '+' || e.key === '=') zoom(1.12);
  else if (e.key === '-') zoom(1 / 1.12);
  else if (e.key.toLowerCase() === 'r') resetCamera();
  else if (e.key === 'Escape') clearSelectedPoint();
  else return;
  e.preventDefault();
  needsDraw = true;
});
$('equationForm').addEventListener('submit', (e) => {
  e.preventDefault();
  build();
});
$('addEquation').onclick = () => addEquation();
$('pinPoint').onclick = pinSelectedPoint;
$('clearSelectedPoint').onclick = clearSelectedPoint;
$('clearPinnedPoints').onclick = clearPinnedPoints;
document
  .querySelectorAll('.preset')
  .forEach((b) => (b.onclick = () => applyPreset(b.dataset.preset)));
$('domain').oninput = updateDomain;
$('domain').onchange = () => build();
$('quality').onchange = () => build();
for (const id of ['style', 'grid', 'axes'])
  $(id).onchange = () => {
    needsDraw = true;
  };
$('reset').onclick = resetCamera;
$('zoomIn').onclick = () => zoom(1.15);
$('zoomOut').onclick = () => zoom(1 / 1.15);
$('rotate').onclick = () => {
  auto = !auto;
  $('rotate').classList.toggle('active', auto);
  $('rotate').setAttribute('aria-pressed', auto);
  needsDraw = true;
};

'use strict';

// Context/resize/visibility handling, animation loop, and application startup.
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  fatal('Utracono kontekst WebGL. Odśwież stronę, aby uruchomić wykres ponownie.');
});
new ResizeObserver(() => {
  needsDraw = true;
}).observe($('viewport'));
document.addEventListener('visibilitychange', () => {
  needsDraw = true;
});
let previousTime = 0;
function frame(time) {
  if (!document.hidden) {
    if (auto && !pointers.size) {
      camera.theta += (previousTime ? Math.min(time - previousTime, 50) : 0) * 0.0002;
      needsDraw = true;
    }
    if (needsDraw) {
      draw();
      needsDraw = false;
    }
  }
  previousTime = time;
  requestAnimationFrame(frame);
}
addEquation(presets.ripple.eq, presets.ripple.mode, false);
refreshPointInspector();
initializeSectionControls();
new ResizeObserver(drawSectionPreview).observe($('sectionPreview'));
if (!gl) {
  fatal();
  $('meshStatus').textContent = 'WebGL niedostępny';
} else {
  try {
    initializeGL();
    uploadSceneGeometry(currentDomain);
    build();
    requestAnimationFrame(frame);
  } catch (e) {
    fatal(
      'Nie udało się uruchomić renderera WebGL. Spróbuj aktualnej przeglądarki z akceleracją sprzętową.',
    );
    $('meshStatus').textContent = 'Błąd inicjalizacji';
    console.error(e);
  }
}

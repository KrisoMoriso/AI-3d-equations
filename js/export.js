'use strict';

// PNG export with the equation and domain annotations.
$('export').onclick = () => {
  const surfaces = visibleSurfaces();
  if (!surfaces.length) {
    toast('Najpierw wyrenderuj i pokaż powierzchnię.');
    return;
  }
  draw();
  const s = Math.min(devicePixelRatio || 1, 2);
  const headerHeight = (46 + surfaces.length * 20) * s;
  const footerHeight = 38 * s;
  const image = document.createElement('canvas');
  image.width = canvas.width;
  image.height = canvas.height + headerHeight + footerHeight;
  const ctx = image.getContext('2d');
  ctx.fillStyle = '#151e27';
  ctx.fillRect(0, 0, image.width, image.height);
  ctx.drawImage(canvas, 0, headerHeight);
  ctx.fillStyle = '#edf1f5';
  ctx.font = 14 * s + 'px sans-serif';
  ctx.fillText('forma. — Twoje powierzchnie', 22 * s, 28 * s, image.width - 44 * s);
  ctx.font = 12 * s + 'px monospace';
  surfaces.forEach((equation, index) => {
    ctx.fillStyle = equation.color;
    ctx.fillText(
      '#' + equation.id + ': ' + equationLabel(equation),
      22 * s,
      (50 + index * 20) * s,
      image.width - 44 * s,
    );
  });
  ctx.font = 11 * s + 'px sans-serif';
  ctx.fillStyle = '#a0acb8';
  ctx.fillText(
    'forma.  •  Zakres osi: −' +
      currentDomain +
      ' … ' +
      currentDomain +
      (crossSection.enabled ? '  •  Przekrój: ' + sectionLabel() : ''),
    22 * s,
    image.height - 20 * s,
  );
  image.toBlob((blob) => {
    if (!blob) {
      toast('Nie udało się zapisać obrazu.');
      return;
    }
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'forma-rownanie-3d.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Zapisano widok jako PNG.');
  }, 'image/png');
};

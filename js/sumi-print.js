// Prints the About photograph as ink on paper: one-bit Atkinson dithering at the screen's own
// dot size, drawn over the greyscale image it is made from.
(() => {
  'use strict';

  const mat = document.querySelector('.print .mat');
  const img = mat && mat.querySelector('img');
  const canvas = mat && mat.querySelector('canvas');
  if (!canvas) return;

  const INK = [20, 20, 22];

  let printedSize = '';
  function print() {
    const cssWidth = img.clientWidth;
    const cssHeight = img.clientHeight;
    if (!cssWidth || !img.naturalWidth) return;

    canvas.style.left = img.offsetLeft + 'px';
    canvas.style.top = img.offsetTop + 'px';
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';

    // a dot is a whole number of device pixels and never under half a CSS pixel
    const dpr = devicePixelRatio || 1;
    const dot = Math.max(1, Math.round(dpr / 1.5));
    const width = Math.round((cssWidth * dpr) / dot);
    const height = Math.round((cssHeight * dpr) / dot);
    // a phone's toolbar resizes the window, not the photograph
    if (printedSize === width + 'x' + height) return;
    printedSize = width + 'x' + height;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    const px = image.data;

    const tone = new Float32Array(width * height);
    for (let i = 0; i < tone.length; i++) tone[i] = px[i * 4] / 255;

    // Atkinson: six eighths of the error go right, two right, three below and two below
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const paper = tone[i] >= 0.5;
        const error = (tone[i] - (paper ? 1 : 0)) / 8;
        if (x + 1 < width) tone[i + 1] += error;
        if (x + 2 < width) tone[i + 2] += error;
        if (y + 1 < height) {
          if (x > 0) tone[i + width - 1] += error;
          tone[i + width] += error;
          if (x + 1 < width) tone[i + width + 1] += error;
        }
        if (y + 2 < height) tone[i + 2 * width] += error;
        px[i * 4] = INK[0];
        px[i * 4 + 1] = INK[1];
        px[i * 4 + 2] = INK[2];
        px[i * 4 + 3] = paper ? 0 : 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    mat.classList.add('printed');
  }

  if (img.complete) print();
  img.addEventListener('load', print);

  let resizeTimer;
  addEventListener(
    'resize',
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(print, 150);
    },
    { passive: true },
  );
})();

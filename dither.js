// Animated Bayer-dithered noise background (Nous Research-style).
// Renders a slow-drifting fractal noise field to a low-res buffer, thresholds
// it against an 8x8 Bayer matrix (1-bit dither), and upscales with smoothing
// off for crisp pixel-grain. Pure canvas 2D, no dependencies.
(() => {
  'use strict';

  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CELL = 3;          // CSS px per dither cell (chunkier = more retro)
  const FPS = 8;           // drift is so slow that 8fps reads identically to 18
                           // and roughly halves the constant CPU/battery cost
  const DRIFT = 0.000005;      // field drift speed (per ms)

  // Theme-dependent ink (set by syncTheme; codec mode = green phosphor)
  let INK = [47, 84, 204];     // --ink
  let DOT_ALPHA = 44;          // 0-255; keep faint so text stays readable

  function syncTheme() {
    const codec = document.documentElement.dataset.theme === 'codec';
    INK = codec ? [111, 207, 131] : [47, 84, 204];
    DOT_ALPHA = codec ? 54 : 44;
  }

  // --- 8x8 Bayer matrix, normalized to (0,1) ---
  const BAYER = (() => {
    const m = [
      0, 32, 8, 40, 2, 34, 10, 42,
      48, 16, 56, 24, 50, 18, 58, 26,
      12, 44, 4, 36, 14, 46, 6, 38,
      60, 28, 52, 20, 62, 30, 54, 22,
      3, 35, 11, 43, 1, 33, 9, 41,
      51, 19, 59, 27, 49, 17, 57, 25,
      15, 47, 7, 39, 13, 45, 5, 37,
      63, 31, 55, 23, 61, 29, 53, 21,
    ];
    return m.map(v => (v + 0.5) / 64);
  })();

  // --- Tileable fractal value-noise texture (computed once) ---
  const TEX_SIZE = 256;
  const tex = new Float32Array(TEX_SIZE * TEX_SIZE);
  (() => {
    const octaves = [
      { freq: 4, amp: 0.5 },
      { freq: 8, amp: 0.28 },
      { freq: 16, amp: 0.15 },
      { freq: 32, amp: 0.07 },
    ];
    const smooth = t => t * t * (3 - 2 * t);
    for (const { freq, amp } of octaves) {
      const grid = new Float32Array(freq * freq);
      for (let i = 0; i < grid.length; i++) grid[i] = Math.random();
      const step = TEX_SIZE / freq;
      for (let y = 0; y < TEX_SIZE; y++) {
        const gy = y / step, y0 = Math.floor(gy), fy = smooth(gy - y0);
        const y0i = (y0 % freq) * freq, y1i = ((y0 + 1) % freq) * freq;
        for (let x = 0; x < TEX_SIZE; x++) {
          const gx = x / step, x0 = Math.floor(gx), fx = smooth(gx - x0);
          const x0i = x0 % freq, x1i = (x0 + 1) % freq;
          const a = grid[y0i + x0i], b = grid[y0i + x1i];
          const c = grid[y1i + x0i], d = grid[y1i + x1i];
          tex[y * TEX_SIZE + x] += amp * ((a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy);
        }
      }
    }
  })();

  // Bilinear sample with wrapping; coords in texture units
  function sample(u, v) {
    u -= Math.floor(u / TEX_SIZE) * TEX_SIZE;
    v -= Math.floor(v / TEX_SIZE) * TEX_SIZE;
    const x0 = u | 0, y0 = v | 0;
    const fx = u - x0, fy = v - y0;
    const x1 = (x0 + 1) % TEX_SIZE, y1 = (y0 + 1) % TEX_SIZE;
    const r0 = y0 * TEX_SIZE, r1 = y1 * TEX_SIZE;
    const a = tex[r0 + x0], b = tex[r0 + x1];
    const c = tex[r1 + x0], d = tex[r1 + x1];
    const top = a + (b - a) * fx;
    return top + ((c + (d - c) * fx) - top) * fy;
  }

  // --- Canvas setup ---
  const canvas = document.createElement('canvas');
  canvas.id = 'dither-bg';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');

  const buffer = document.createElement('canvas');
  const bctx = buffer.getContext('2d');

  let bw = 0, bh = 0, img = null, data = null;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    bw = Math.ceil(w / CELL);
    bh = Math.ceil(h / CELL);
    buffer.width = bw;
    buffer.height = bh;
    img = bctx.createImageData(bw, bh);
    data = img.data;
    fillInk();
    ctx.imageSmoothingEnabled = false;
  }

  // pre-fill ink color; render animates the alpha channel only
  function fillInk() {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = INK[0]; data[i + 1] = INK[1]; data[i + 2] = INK[2]; data[i + 3] = 0;
    }
  }

  // feature scales: big slow clouds + mid detail (texture units per cell)
  const S1 = 0.34, S2 = 1.1;

  function render(t) {
    const t1 = t * DRIFT * TEX_SIZE;
    for (let y = 0; y < bh; y++) {
      const rowB = (y & 7) << 3;
      const row = y * bw;
      // vertical shaping: denser toward the very top, lighter mid-page
      const yn = y / bh;
      const bias = 0.10 - 0.16 * Math.sin(Math.PI * Math.min(yn * 1.15, 1));
      for (let x = 0; x < bw; x++) {
        let v = 0.68 * sample(x * S1 + t1, y * S1 + t1 * 0.6)
              + 0.32 * sample(x * S2 - t1 * 0.8, y * S2 + t1 * 0.35);
        v = (v - 0.36) * 2.3 + bias; // hard stretch: big clouds vs. clean paper
        const on = v > BAYER[rowB | (x & 7)];
        data[(row + x) * 4 + 3] = on ? DOT_ALPHA : 0;
      }
    }
    bctx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buffer, 0, 0, bw, bh, 0, 0, bw * CELL, bh * CELL);
  }

  // --- Animation loop (throttled, pauses when tab hidden) ---
  let last = 0, raf = null;
  const FRAME_MS = 1000 / FPS;

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < FRAME_MS) return;
    last = now;
    render(now);
  }

  // starwars (holo void) and gotham (red-sky nightscape) hide the canvas and
  // paint their own CSS atmosphere — no point rendering into display:none.
  const hiddenByTheme = () => {
    const t = document.documentElement.dataset.theme;
    return t === 'starwars' || t === 'gotham';
  };

  function start() {
    if (raf === null && !REDUCED_MOTION && !hiddenByTheme()) raf = requestAnimationFrame(loop);
  }
  function stop() {
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); render(performance.now()); }, 150);
  });

  document.addEventListener('visibilitychange', () => {
    document.hidden ? stop() : start();
  });

  // Re-ink when the theme toggles (works under reduced motion too); pause the
  // loop while starwars hides the canvas, resume when it comes back.
  window.addEventListener('themechange', () => {
    syncTheme();
    if (hiddenByTheme()) { stop(); return; }
    fillInk();
    render(performance.now());
    start();
  });

  syncTheme();
  resize();
  render(0);   // static first frame (also the only frame under reduced motion)
  start();
})();

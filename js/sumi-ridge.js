// the closing band: mountains at night, printed through the fold moon's screen (Bayer 4x4, one dot
// to a css pixel); a still, printed again only when the band changes size
(() => {
  'use strict';
  const band = document.querySelector('.ridge');
  if (!band) return;
  const canvas = band.querySelector('canvas');

  const PAPER = 0xffe2e7e9; // #e9e7e2 as one little-endian pixel
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const JITTER = 0.9;
  const OCTAVES = 5;
  const CREASE = 0.04;
  const SLICE_MS = 8;

  // far to near; lengths in band heights from the summit, tone and fog in levels of 16
  const RIDGES = [
    { seed: 91, foot: 0.56, rise: 0.12, span: 0.45, rough: 0.4, tone: 4.5, fog: 5.5 },
    { seed: 30, foot: 0.62, rise: 0.13, span: 0.34, rough: 0.3, tone: 3.3, fog: 5.5, lean: -0.08 },
    {
      seed: 495,
      foot: 0.7,
      rise: 0.19,
      span: 0.45,
      rough: 0.35,
      tone: 2.2,
      fog: 5,
      rightOf: -0.5,
      lean: -0.08,
      shoulder: { at: 1.05, rise: 0.1 },
    },
    {
      seed: 420,
      foot: 0.8,
      rise: 0.24,
      span: 0.65,
      rough: 0.42,
      tone: 1.1,
      fog: 4.2,
      leftOf: 0.1,
      lean: 0.08,
      shoulder: { at: -1.7, rise: 0.14 },
    },
    { seed: 140, foot: 0.97, rise: 0.26, span: 1.2, rough: 0.5, tone: 0, fog: 0 },
  ];
  const NEAREST = RIDGES.length - 1;
  const SPUR_FALL = 0.45;
  const LEAN = { from: 0.7, over: 1.2 };
  const HAZE = { from: 1, over: 0.6 };
  const LOWEST_CREST = 0.875; // the near ridge's lowest point, so mist never meets the band's foot
  // at is a share of the band's width; the left face is lit, the right in shade
  const SUMMIT = { at: 0.64, rise: 0.25, left: 0.55, right: 0.38, cone: 0.5 };
  const FACE = { lit: 3, shade: 2.2, slope: 0.6, wander: 0.08 };
  const TRAIL = { from: -0.6, to: -0.34, turns: 1.6, swing: 0.07, short: 0.05, gap: 0.012 };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const smooth = t => {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  };
  // value noise on a line; the offsets added to x keep each use on its own stretch of the lattice
  function value(knots, x) {
    const i = Math.floor(x);
    const a = knots[i & 1023];
    const b = knots[(i + 1) & 1023];
    return a + (b - a) * smooth(x - i);
  }
  // each octave is weighted by the one below it, so crests are rough and valleys smooth
  function ridged(knots, x, rough, octaves) {
    let sum = 0;
    let norm = 0;
    let amp = 1;
    let weight = 1;
    for (let o = 0; o < octaves; o++) {
      const d = 2 * value(knots, x) - 1;
      const crease = 1 + CREASE - Math.sqrt(d * d + CREASE * CREASE);
      sum += amp * weight * crease;
      norm += amp;
      weight = Math.min(1, 0.3 + crease);
      amp *= rough;
      x = x * 2.17 + 31.7;
    }
    return sum / norm;
  }
  const jitter = (x, y) => {
    let h = Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (h & 1023) / 1023 - 0.5;
  };

  // data-profiles: one array of elevations in metres per hike, nearest first
  const profiles = JSON.parse(band.dataset.profiles || '[]');
  const climbs = profiles.map(metres => metres.slice(0, metres.indexOf(Math.max(...metres)) + 1));
  const largestClimb = Math.max(1, ...climbs.map(m => Math.max(...m) - Math.min(...m)));
  RIDGES.forEach((ridge, i) => {
    ridge.knots = Float32Array.from({ length: 1024 }, mulberry32(ridge.seed));
    const climb = i > 0 && climbs[NEAREST - i];
    if (climb && climb.length > 1) {
      const low = Math.min(...climb);
      ridge.climb = climb.map(m => (m - low) / largestClimb);
    }
  });
  function climbAt(climb, across) {
    const at = Math.min(1, Math.max(0, across)) * (climb.length - 1);
    const i = Math.min(climb.length - 2, Math.floor(at));
    return climb[i] + (climb[i + 1] - climb[i]) * (at - i);
  }

  const flankAt = u => Math.exp(-Math.abs(u) / (u < 0 ? SUMMIT.left : SUMMIT.right));

  // u in band heights right of the summit, across as a share of the band's width
  function crestOf(i, u, across, octaves) {
    const ridge = RIDGES[i];
    const along = u / ridge.span + 300;
    if (ridge.climb) {
      // the noise's finest octaves, so a ridge drawn from data keeps the print's grain
      const grain = 0.1 * ridged(ridge.knots, 10 * along, ridge.rough, 2);
      const foot = Math.min(ridge.foot, LOWEST_CREST);
      return foot - ridge.rise * (climbAt(ridge.climb, across) + grain);
    }
    const height = ridged(ridge.knots, along, ridge.rough, octaves);
    let foot = ridge.foot;
    if (ridge.lean) {
      foot += ridge.lean * Math.sign(u) * smooth((Math.abs(u) - LEAN.from) / LEAN.over);
    }
    if (ridge.shoulder) {
      const fall = u < ridge.shoulder.at ? 0.3 : 0.45;
      foot -= ridge.shoulder.rise * Math.exp(-Math.abs(u - ridge.shoulder.at) / fall);
    }
    if (i === 0) {
      const peak = SUMMIT.rise * flankAt(u) * (SUMMIT.cone + (1 - SUMMIT.cone) * height);
      return foot - ridge.rise * height - peak;
    }
    let stands = 1;
    if ('rightOf' in ridge) stands = smooth((u - ridge.rightOf) / SPUR_FALL + 0.5);
    if ('leftOf' in ridge) stands = smooth((ridge.leftOf - u) / SPUR_FALL + 0.5);
    return foot - ridge.rise * (height * stands - 0.2 * (1 - stands));
  }

  let sliceTimer = 0;
  function printBand(cols, rows, show) {
    const image = new ImageData(cols, rows);
    const dots = new Uint32Array(image.data.buffer);
    const summitCol = cols * SUMMIT.at;
    const crest = new Float32Array(RIDGES.length);
    const shape = new Float32Array(RIDGES.length);
    const nearCrest = new Float32Array(cols);

    let peakX = summitCol;
    let peakY = rows;
    for (let x = 0; x < cols; x++) {
      const y = rows * crestOf(0, (x - summitCol) / rows, x / cols, OCTAVES);
      if (y < peakY) {
        peakX = x;
        peakY = y;
      }
    }
    const wanderAt = v => ridged(RIDGES[0].knots, 5 * v + 500, 0.5, 3);
    const arete = new Float32Array(rows);
    for (let y = Math.ceil(peakY); y < rows; y++) {
      const fall = Math.min(1, (y - peakY) / (0.15 * rows));
      const wander = wanderAt(y / rows) - wanderAt(peakY / rows);
      arete[y] = peakX + FACE.slope * (y - peakY) + FACE.wander * rows * fall * wander;
    }

    function column(x) {
      const u = (x - summitCol) / rows;
      for (let i = 0; i <= NEAREST; i++) {
        crest[i] = rows * crestOf(i, u, x / cols, OCTAVES);
        shape[i] = rows * crestOf(i, u, x / cols, 2);
      }
      nearCrest[x] = crest[NEAREST];
      let floor = rows;
      let front = rows;
      for (let i = NEAREST; i >= 0; i--) {
        const ridge = RIDGES[i];
        const top = Math.max(0, Math.ceil(crest[i]));
        const depth = Math.max(0.02 * rows, front - shape[i]);
        const flank = i === 0 ? flankAt(u) : 0;
        const haze = i <= 1 ? smooth((Math.abs(u) - HAZE.from) / HAZE.over) : 0;
        for (let y = top; y < floor; y++) {
          const mist = smooth((y - shape[i]) / depth);
          let tone = ridge.tone + (ridge.fog - ridge.tone) * haze;
          if (flank) tone += flank * (x < arete[y] ? FACE.lit : -FACE.shade);
          const level = tone + (ridge.fog - tone) * mist * mist;
          if (BAYER[(y & 3) * 4 + (x & 3)] + 0.5 < level + JITTER * jitter(x, y)) {
            dots[y * cols + x] = PAPER;
          }
        }
        floor = Math.min(floor, top);
        front = Math.min(front, shape[i]);
      }
    }

    function trail() {
      const startX = summitCol + TRAIL.from * rows;
      const endX = summitCol + TRAIL.to * rows;
      const startY = rows - 1;
      const endY = nearCrest[Math.round(endX)] + TRAIL.short * rows;
      const gap = Math.max(3, TRAIL.gap * rows);
      let lastX = startX;
      let lastY = startY;
      let sinceDot = gap;
      for (let k = 0; k <= 1000; k++) {
        const s = k / 1000;
        const climbed = 1 - (1 - s) * (1 - s);
        const swing = TRAIL.swing * rows * (1 - 0.6 * s) * Math.sin(2 * Math.PI * TRAIL.turns * s);
        const x = startX + (endX - startX) * s + swing;
        const y = startY + (endY - startY) * climbed;
        sinceDot += Math.hypot(x - lastX, y - lastY);
        lastX = x;
        lastY = y;
        if (sinceDot >= gap * (1 - 0.4 * s)) {
          dots[Math.round(y) * cols + Math.round(x)] = PAPER;
          sinceDot = 0;
        }
      }
    }

    let x = 0;
    function slice() {
      const until = performance.now() + SLICE_MS;
      while (x < cols && performance.now() < until) column(x++);
      if (x < cols) {
        sliceTimer = setTimeout(slice);
        return;
      }
      trail();
      show(image);
    }
    slice();
  }

  let printed = '';
  function layout() {
    // a dot is a whole number of device pixels, so the screen never beats against the display
    const ratio = window.devicePixelRatio || 1;
    const dotPx = Math.max(1, Math.round(ratio)) / ratio;
    const cols = Math.ceil(band.clientWidth / dotPx);
    const rows = Math.ceil(band.clientHeight / dotPx);
    const fit = () => {
      canvas.style.width = cols * dotPx + 'px';
      canvas.style.height = rows * dotPx + 'px';
    };
    if (printed === cols + 'x' + rows) {
      fit();
      return;
    }
    printed = cols + 'x' + rows;
    clearTimeout(sliceTimer);
    printBand(cols, rows, image => {
      canvas.width = cols;
      canvas.height = rows;
      fit();
      canvas.getContext('2d').putImageData(image, 0, 0);
    });
  }

  let resizeTimer = 0;
  addEventListener(
    'resize',
    () => {
      // the old print stretches over the band until the new one is ready
      canvas.style.width = '';
      canvas.style.height = '';
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(layout, 150);
    },
    { passive: true },
  );
  layout();
})();

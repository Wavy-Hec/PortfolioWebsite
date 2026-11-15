// The closing band: a summit and two ridges in dry-brush ink, with mist drifting through the
// valleys while the band is on screen. Each layer is painted once per size; the mist slides.
(() => {
  'use strict';
  const band = document.querySelector('.ridge');
  if (!band) return;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the 404 asks for the range without its summit
  const BARE = band.hasAttribute('data-bare');

  const PAPER = '233,231,226';
  const DEEP = '#0b0b0d';
  const MAX_PIXELS = 2.4e6;
  const BRISTLE_PX = [0.8, 1.3, 2.1];
  const STEP_PX = 2.5;
  // a shorter run of a bristle lands as a speck
  const MIN_RUN_PX = 3 * STEP_PX;
  const SUMMIT_AT = 0.62;
  // the summit's skyline as (u, y): band heights right of the peak and down from the top
  const LEFT_SKY = [
    [0, 0.085],
    [-0.08, 0.13],
    [-0.21, 0.2],
    [-0.36, 0.29],
    [-0.46, 0.28],
    [-0.6, 0.34],
    [-0.85, 0.41],
    [-1.25, 0.47],
  ];
  const RIGHT_SKY = [
    [0, 0.085],
    [0.05, 0.11],
    [0.1, 0.17],
    [0.15, 0.25],
    [0.21, 0.31],
    [0.31, 0.34],
    [0.5, 0.38],
    [0.72, 0.39],
    [0.9, 0.35],
    [1.08, 0.41],
    [1.5, 0.47],
  ];
  const ARETE = [
    [0, 0.085],
    [0.025, 0.16],
    [0.05, 0.25],
    [0.085, 0.35],
    [0.13, 0.48],
  ];
  const FAR = { base: 0.48, roll: 0.1, span: 0.8 };
  const MID = { base: 0.7, roll: 0.08, span: 0.5, lift: 0.12 };
  const NEAR = { base: 0.9, roll: 0.06, span: 0.45, lift: 0.14 };
  // tops and bottoms in band heights; a tile crosses the band once a period, in seconds
  const MISTS = [
    { seed: 3, from: 0.28, to: 0.86, alpha: 0.34, period: 240, offset: 0.31 },
    { seed: 11, from: 0.6, to: 0.98, alpha: 0.26, period: 160, offset: 0.77 },
  ];

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
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const lerp = (a, b, t) => a + (b - a) * t;

  const NOISE = Float32Array.from({ length: 4096 }, mulberry32(1985));
  function value(x) {
    const i = Math.floor(x);
    const f = x - i;
    const a = NOISE[i & 4095];
    const b = NOISE[(i + 1) & 4095];
    return a + (b - a) * f * f * (3 - 2 * f);
  }
  function fbm(x, octaves) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * value(x);
      norm += amp;
      amp *= 0.5;
      x = x * 2.03 + 17.1;
    }
    return sum / norm;
  }
  // folded noise: sharp crests, rounded hollows
  function crags(x, octaves) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * (1 - Math.abs(2 * value(x) - 1));
      norm += amp;
      amp *= 0.5;
      x = x * 2.11 + 31.7;
    }
    return sum / norm;
  }
  function hash(i, j) {
    let h = Math.imul(i * 374761393 + j * 668265263, 1274126177) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (h & 1023) / 1023;
  }
  // value noise on a plane, for the gaps in a stroke: u across the brush, v along it
  function field(u, v) {
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = u - i;
    const fv = v - j;
    const su = fu * fu * (3 - 2 * fu);
    const sv = fv * fv * (3 - 2 * fv);
    const a = hash(i, j);
    const b = hash(i + 1, j);
    const c = hash(i, j + 1);
    const d = hash(i + 1, j + 1);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  }

  const ink = color => ({ color, tracks: BRISTLE_PX.map(() => new Path2D()) });
  function lay(g, { color, tracks }) {
    g.strokeStyle = color;
    g.lineCap = 'round';
    tracks.forEach((track, k) => {
      g.lineWidth = BRISTLE_PX[k];
      g.stroke(track);
    });
  }

  // a dry brush: each bristle lays its own track and lifts where it runs out of ink
  function brush({ tracks }, line, width, dry, rand) {
    const n = line.length;
    const s = new Float32Array(n);
    const nx = new Float32Array(n);
    const ny = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = line[Math.max(0, i - 3)];
      const q = line[Math.min(n - 1, i + 3)];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      nx[i] = (p[1] - q[1]) / d;
      ny[i] = (q[0] - p[0]) / d;
      if (i) s[i] = s[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    }
    const length = s[n - 1] || 1;
    const count = Math.max(4, Math.round(width / 1.3));
    const clumps = Math.max(2, width / 7);
    const offset = Math.floor(rand() * 9999);
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    const inked = new Uint8Array(n);
    for (let j = 0; j < count; j++) {
      const across = (j + rand()) / count - 0.5;
      const edge = Math.abs(2 * across);
      const load = 1 - 0.5 * edge ** 1.5 + 0.4 * (rand() - 0.5);
      // the brush lands and lifts round: the outer bristles touch down later and leave sooner
      const enter = edge * edge * 0.35 * width;
      const leave = length - enter;
      const u = (across + 0.5) * clumps + offset;
      const phase = rand() * 3000;
      const track = tracks[Math.floor(rand() * tracks.length)];
      // late in the stroke a bristle that runs dry stays dry
      let spent = false;
      for (let i = 0; i < n; i++) {
        inked[i] = 0;
        if (spent || s[i] < enter || s[i] > leave) continue;
        const t = s[i] / length;
        const w = width * (0.8 + 0.2 * smooth(0, 0.15, t)) * (1 - 0.35 * smooth(0.5, 1, t));
        const gap = field(u, s[i] / 40) - 0.5 + 0.4 * (value(phase + s[i] / 6) - 0.5);
        if (load - dry * t ** 1.4 + 1.1 * gap <= 0.35) {
          spent = t > 0.6;
          continue;
        }
        xs[i] = line[i][0] + nx[i] * across * w;
        ys[i] = line[i][1] + ny[i] * across * w;
        inked[i] = 1;
      }
      let start = -1;
      for (let i = 0; i <= n; i++) {
        if (i < n && inked[i]) {
          if (start < 0) start = i;
        } else if (start >= 0) {
          if (s[i - 1] - s[start] >= MIN_RUN_PX) {
            track.moveTo(xs[start], ys[start]);
            for (let k = start + 1; k < i; k++) track.lineTo(xs[k], ys[k]);
          }
          start = -1;
        }
      }
    }
  }

  // a line from (x, y) at an angle, bowing to one side
  function ray(x, y, angle, length, bend) {
    const points = [];
    const steps = Math.max(2, Math.ceil(length / STEP_PX));
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const bow = bend * length * 4 * t * (1 - t);
      points.push([x + dx * length * t - dy * bow, y + dy * length * t + dx * bow]);
    }
    return points;
  }

  // catmull-rom through a skyline's points: y at a distance from the peak
  function profile(points, d) {
    const n = points.length;
    let i = 1;
    while (i < n - 1 && Math.abs(points[i][0]) < d) i++;
    const p0 = points[Math.max(0, i - 2)];
    const p1 = points[i - 1];
    const p2 = points[i];
    const p3 = points[Math.min(n - 1, i + 1)];
    const from = Math.abs(p1[0]);
    const t = Math.min(1, Math.max(0, (d - from) / (Math.abs(p2[0]) - from)));
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      0.5 *
      (2 * p1[1] +
        (p2[1] - p0[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * t3)
    );
  }

  // each crest in band heights, at u band heights right of the summit
  function farAt(u) {
    const range = FAR.base + FAR.roll * (fbm(u / FAR.span + 40, 3) - 0.5);
    const rock = 0.024 * (crags(u / 0.05 + 90, 3) - 0.5);
    if (BARE) return range - rock;
    const side = u < 0 ? LEFT_SKY : RIGHT_SKY;
    const reach = Math.abs(side[side.length - 1][0]);
    const d = Math.abs(u);
    const peak = profile(side, Math.min(d, reach));
    return lerp(peak, range, smooth(reach * 0.7, reach, d)) - rock * smooth(0, 0.04, d);
  }
  function midAt(u) {
    const roll = MID.roll * (fbm(u / MID.span + 7, 4) - 0.5);
    const rock = 0.025 * crags(u / 0.09 + 300, 3);
    return MID.base + roll - MID.lift * smooth(-0.35, -1.1, u) - rock;
  }
  function nearAt(u) {
    const roll = NEAR.roll * (fbm(u / NEAR.span + 70, 4) - 0.5);
    const rock = 0.02 * crags(u / 0.08 + 500, 3);
    return NEAR.base + roll - NEAR.lift * smooth(0.25, 0.95, u) - rock;
  }
  function crestOf(at, W, H) {
    const summitX = W * SUMMIT_AT;
    const ys = new Float32Array(W + 1);
    for (let x = 0; x <= W; x++) ys[x] = H * at((x - summitX) / H);
    return ys;
  }
  function outline(ys, bottom) {
    const path = new Path2D();
    path.moveTo(0, bottom);
    for (let x = 0; x < ys.length; x++) path.lineTo(x, ys[x]);
    path.lineTo(ys.length - 1, bottom);
    path.closePath();
    return path;
  }
  // a crest averaged over a span, for a brush to follow
  function eased(ys, span) {
    const out = new Float32Array(ys.length);
    const k = Math.max(1, Math.round(span / 2));
    for (let x = 0; x < ys.length; x++) {
      let sum = 0;
      let n = 0;
      for (let i = Math.max(0, x - k); i <= Math.min(ys.length - 1, x + k); i++) {
        sum += ys[i];
        n++;
      }
      out[x] = sum / n;
    }
    return out;
  }

  // the moon is up and to the left: a crest that climbs to the right catches it
  function ridgeline(tone, ys, from, to, H, width, rand) {
    const path = eased(ys, H * 0.06);
    const start = Math.max(3, Math.round(from));
    const stop = Math.min(ys.length - 4, Math.round(to));
    let low = -1;
    for (let x = start; x <= stop; x++) {
      const lit = path[x + 3] - path[x - 3] < -0.6;
      if (lit && low < 0) low = x;
      if ((lit && x < stop) || low < 0) continue;
      let end = x;
      while (x - low > H * 0.14 && end > low + 8) {
        const length = H * (0.3 + 0.6 * rand());
        const line = [];
        for (let i = end; i >= Math.max(low, end - length); i -= STEP_PX) {
          line.push([i, Math.max(path[Math.round(i)], ys[Math.round(i)]) + width * 0.3]);
        }
        if (line.length * STEP_PX > H * 0.08) {
          brush(tone, line, width * (0.7 + 0.6 * rand()), 0.6 + 0.8 * rand(), rand);
        }
        end -= length * (0.8 + 0.5 * rand());
      }
      low = -1;
    }
  }

  function sheet(className, W, top, height, ratio) {
    const canvas = document.createElement('canvas');
    canvas.className = className;
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(height * ratio);
    const g = canvas.getContext('2d');
    g.setTransform(ratio, 0, 0, ratio, 0, -top * ratio);
    return { canvas, g, top, height };
  }

  // a ridge in shadow; the sheet stops where the next ridge hides it
  function paintRidge(className, W, H, ratio, crest, front) {
    const top = Math.max(0, Math.min(...crest) - 4);
    // the nearest runs past the foot: a band ending mid-pixel still meets the footer in one tone
    const bottom = front ? Math.min(H, Math.max(...front) + 4) : H + 2;
    const ridge = sheet(className, W, top, bottom - top, ratio);
    ridge.g.fillStyle = DEEP;
    ridge.g.fill(outline(crest, bottom));
    return ridge;
  }

  // the summit's moonlit face, laid on the far range's sheet
  function* paintSnow(far, W, H, crest) {
    const { g, top, height } = far;
    const rand = mulberry32(7);
    const peakX = W * SUMMIT_AT;
    const peakY = crest[Math.round(peakX)];
    const skyAt = d => H * profile(LEFT_SKY, d / H);
    const arete = [];
    for (let i = 1; i < ARETE.length; i++) {
      const [u0, y0] = ARETE[i - 1];
      const [u1, y1] = ARETE[i];
      const steps = Math.ceil((Math.hypot(u1 - u0, y1 - y0) * H) / STEP_PX);
      for (let k = 1; k <= steps; k++) {
        arete.push([peakX + H * lerp(u0, u1, k / steps), H * lerp(y0, y1, k / steps)]);
      }
    }
    const snow = ink(`rgba(${PAPER},0.92)`);
    const hung = ink(`rgba(${PAPER},0.92)`);
    const edges = ink(`rgba(${PAPER},0.92)`);
    const ribs = ink(DEEP);
    // the cap, laid from the peak
    for (let i = 0; i < 6; i++) {
      const angle = lerp(1.3, 2.65, (i + rand()) / 6);
      const line = ray(peakX, peakY, angle, H * (0.1 + 0.08 * rand()), 0.06 * (rand() - 0.5));
      brush(snow, line, H * (0.07 + 0.03 * rand()), 0.6 + 0.5 * rand(), rand);
      yield;
    }
    // the snow along the ridge, the brush drawn down the skyline from the peak
    for (let i = 0; i < 3; i++) {
      const to = H * (0.14 + 0.24 * rand());
      const below = H * (0.012 + 0.03 * rand());
      const line = [];
      for (let d = H * 0.02 * rand(); d <= to; d += STEP_PX) {
        line.push([peakX - d, skyAt(d) + below]);
      }
      brush(snow, line, H * (0.035 + 0.025 * rand()), 1 + 0.6 * rand(), rand);
    }
    yield;
    // and hung from it down the face, running dry before the snow line
    for (let i = 0; i < 11; i++) {
      const d = H * (0.03 + 0.31 * ((i + rand()) / 11) ** 1.2);
      const high = 1 - d / (H * 0.48);
      // it starts above the skyline, so the silhouette cuts its top
      const line = ray(
        peakX - d,
        skyAt(d) - H * 0.04,
        1.55 + 0.5 * rand(),
        H * (0.12 + 0.22 * high * (0.5 + 0.8 * rand())),
        0.1 * (rand() - 0.5),
      );
      brush(hung, line, H * (0.04 + 0.045 * high), 1 + 0.7 * rand(), rand);
    }
    // rock ribs between the couloirs
    for (let i = 0; i < 5; i++) {
      const d = H * (0.08 + 0.3 * ((i + rand()) / 5));
      const line = ray(
        peakX - d,
        skyAt(d) + H * 0.04,
        1.6 + 0.35 * rand(),
        H * (0.08 + 0.12 * rand()),
        0.1 * (rand() - 0.5),
      );
      brush(ribs, line, H * (0.008 + 0.012 * rand()), 0.6 + 0.6 * rand(), rand);
    }
    // the arete's lit edge
    for (let i = 0; i < 2; i++) {
      const k = Math.floor(arete.length * (0.06 + 0.2 * i));
      const line = ray(
        arete[k][0],
        arete[k][1],
        1.9 + 0.35 * rand(),
        H * (0.1 + 0.12 * rand()),
        0.05,
      );
      brush(edges, line, H * (0.035 + 0.025 * rand()), 0.8 + 0.5 * rand(), rand);
    }
    ridgeline(edges, crest, peakX - H * 0.5, peakX, H, H * 0.03, rand);
    yield;

    // each ink is rastered at the end of the task that lays it
    const bottom = top + height;
    const litFace = new Path2D();
    litFace.moveTo(peakX, top);
    for (const [x, y] of arete) litFace.lineTo(x, y);
    litFace.lineTo(arete[arete.length - 1][0], bottom);
    litFace.lineTo(0, bottom);
    litFace.lineTo(0, top);
    litFace.closePath();
    g.clip(outline(crest, bottom));
    g.clip(litFace);
    lay(g, snow);
    yield;
    lay(g, hung);
    yield;
    lay(g, edges);
    yield;
    lay(g, ribs);
  }

  // value noise on a grid that wraps, so the mist tiles sideways
  function wrapped(grid, nx, ny, x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const sx = smooth(0, 1, x - xi);
    const sy = smooth(0, 1, y - yi);
    const x0 = xi % nx;
    const x1 = (x0 + 1) % nx;
    const y0 = Math.min(yi, ny) * nx;
    const y1 = Math.min(yi + 1, ny) * nx;
    const a = grid[y0 + x0];
    const b = grid[y0 + x1];
    const c = grid[y1 + x0];
    const d = grid[y1 + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  // mist: noise drawn small, stretched by css to twice the band's width and slid a tile at a time
  function paintMist(mist, H) {
    const TW = 320;
    const TH = 48;
    const OCTAVES = [
      [5, 2],
      [10, 4],
      [20, 8],
    ];
    const r = mulberry32(mist.seed);
    const grids = OCTAVES.map(([nx, ny]) => Float32Array.from({ length: nx * (ny + 1) }, r));
    const tile = sheet('mist', 2 * TW, 0, TH, 1);
    const image = tile.g.createImageData(TW, TH);
    const px = image.data;
    for (let y = 0; y < TH; y++) {
      const v = y / (TH - 1);
      const lie = smooth(0, 0.7, v) * (1 - 0.4 * smooth(0.85, 1, v)) * mist.alpha * 255;
      for (let x = 0; x < TW; x++) {
        const u = x / TW;
        let n = 0;
        for (let o = 0; o < OCTAVES.length; o++) {
          const [nx, ny] = OCTAVES[o];
          n += wrapped(grids[o], nx, ny, u * nx, v * ny) / (1 << o);
        }
        const i = (y * TW + x) * 4;
        px[i] = 233;
        px[i + 1] = 231;
        px[i + 2] = 226;
        px[i + 3] = lie * (0.35 + 0.65 * smooth(0.35, 0.75, n / 1.75));
      }
    }
    tile.g.putImageData(image, 0, 0);
    tile.g.putImageData(image, TW, 0);
    return { canvas: tile.canvas, top: mist.from * H, height: (mist.to - mist.from) * H };
  }

  // the mist slides on the compositor, a tile a period, and only while it can be seen
  const SLIDE = [{ transform: 'translateX(-50%)' }, { transform: 'translateX(0)' }];
  let drifts = [];
  let onScreen = false;
  function playOrPause() {
    const seen = onScreen && !REDUCED && !document.body.classList.contains('game-open');
    for (const slide of drifts) {
      if (seen) slide.play();
      else slide.pause();
    }
  }
  function drift(mists) {
    const times = drifts.map(slide => slide.currentTime);
    for (const slide of drifts) slide.cancel();
    drifts = mists.map((canvas, i) => {
      const { period, offset } = MISTS[i];
      const slide = canvas.animate(SLIDE, { duration: period * 1000, iterations: Infinity });
      slide.currentTime = times[i] ?? offset * period * 1000;
      return slide;
    });
    playOrPause();
  }

  // the sheets back to front, each handed over as it is done
  function* paintBand(W, H, ratio) {
    const [farCrest, midCrest, nearCrest] = [farAt, midAt, nearAt].map(at => crestOf(at, W, H));
    yield;
    const far = paintRidge('far', W, H, ratio, farCrest, midCrest);
    yield;
    if (!BARE) yield* paintSnow(far, W, H, farCrest);
    yield far;
    yield paintMist(MISTS[0], H);
    yield paintRidge('mid', W, H, ratio, midCrest, nearCrest);
    yield paintMist(MISTS[1], H);
    yield paintRidge('near', W, H, ratio, nearCrest, null);
  }

  // a chunk a task; each sheet goes in when done, so the compositor uploads them one by one
  let paintedSize = '';
  let painting = null;
  function paint(W, H) {
    if (!W || !H) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (W * H)));
    const size = [W, H, ratio].join(' ');
    if (size === paintedSize) return;
    paintedSize = size;
    const job = paintBand(W, H, ratio);
    painting = job;
    const old = [...band.children];
    const fresh = [];
    const next = () => {
      if (painting !== job) {
        for (const canvas of fresh) canvas.remove();
        return;
      }
      const step = job.next();
      if (step.value) {
        const { canvas, top, height } = step.value;
        canvas.style.top = (top / H) * 100 + '%';
        canvas.style.height = (height / H) * 100 + '%';
        // the first time the stylesheet's veil covers it; after that it waits hidden
        if (old.length) canvas.style.opacity = '0';
        band.append(canvas);
        fresh.push(canvas);
      }
      if (!step.done) {
        setTimeout(next);
        return;
      }
      for (const canvas of old) canvas.remove();
      for (const canvas of fresh) canvas.style.opacity = '';
      drift(fresh.filter(canvas => canvas.className === 'mist'));
      requestAnimationFrame(() => band.classList.add('painted'));
    };
    next();
  }

  let resizeTimer = 0;
  new ResizeObserver(entries => {
    const { width, height } = entries[entries.length - 1].contentRect;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(
      () => paint(Math.round(width), Math.round(height)),
      paintedSize ? 150 : 0,
    );
  }).observe(band);

  if (REDUCED) return;
  new IntersectionObserver(entries => {
    onScreen = entries[entries.length - 1].isIntersecting;
    playOrPause();
  }).observe(band);
  // the game's overlay covers the band
  addEventListener('gameopen', playOrPause);
  addEventListener('gameclose', playOrPause);
})();

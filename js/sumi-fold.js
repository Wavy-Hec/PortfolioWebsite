// The fold's weather: a halftone moon, three layers of fog and six rows of pampas grass, moved by
// one wind that rolls left to right. Runs in the page's loop only while the fold is on screen;
// under reduced motion it draws one still frame.
(() => {
  'use strict';
  const hero = document.querySelector('.hero');
  const scene = hero && hero.querySelector('.scene');
  if (!scene) return;
  const S = window.SUMI;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PAPER = '233,231,226';
  const TAU = Math.PI * 2;
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const lerp = (a, b, t) => a + (b - a) * t;

  // mulberry32 and tileable value noise, seeded so every visit gets the same field and fog
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function lattice(nx, ny, r) {
    const a = new Float32Array(nx * ny);
    for (let i = 0; i < a.length; i++) a[i] = r();
    return { nx, ny, a };
  }
  function vnoise(L, x, y) {
    // x and y in lattice cells, both wrapping
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const x0 = ((xi % L.nx) + L.nx) % L.nx;
    const x1 = (x0 + 1) % L.nx;
    const y0 = ((yi % L.ny) + L.ny) % L.ny;
    const y1 = (y0 + 1) % L.ny;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = L.a[y0 * L.nx + x0];
    const b = L.a[y0 * L.nx + x1];
    const c = L.a[y1 * L.nx + x0];
    const d = L.a[y1 * L.nx + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function fbm(octs, u, v) {
    // u and v in 0..1 of the tile
    let n = 0;
    let amp = 0.5;
    let norm = 0;
    for (const L of octs) {
      n += amp * vnoise(L, u * L.nx, v * L.ny);
      norm += amp;
      amp *= 0.5;
    }
    return n / norm;
  }
  const octaves = (r, cx, cy, k = 4) =>
    Array.from({ length: k }, (_, o) => lattice(cx << o, cy << o, r));

  // the moon is printed like the robot's plate: a Bayer 4 x 4 screen at the plate's pitch
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const PLATE_H = 480; // img/go2-night.png; its 2x keeps the same screen
  const PAPER_RGBA = [233, 231, 226, 255];
  const moonC = scene.querySelector('canvas.moon');
  // back to the stylesheet's size, which a resize follows (blurred) until the moon is drawn again
  function freeMoon() {
    moonC.style.width = '';
    moonC.style.height = '';
    moonC.style.imageRendering = '';
  }
  function drawMoon() {
    freeMoon();
    // nearest sampling keeps the dots exact where the box does not start on a device pixel (125 %)
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const N = Math.round(moonC.getBoundingClientRect().width * dpr);
    if (!N) return;
    moonC.width = N;
    moonC.height = N;
    moonC.style.width = N / dpr + 'px';
    moonC.style.height = N / dpr + 'px';
    moonC.style.imageRendering = 'pixelated';
    const plateH = scene.querySelector('.figure img').clientHeight;
    const DOT = Math.max(1, Math.round((plateH / PLATE_H) * dpr));
    const g = moonC.getContext('2d');
    const im = g.createImageData(N, N);
    const px = im.data;
    const c = N / DOT / 2;
    const R = c - 1;
    const r0 = rng(1985);
    const ph = [r0() * TAU, r0() * TAU, r0() * TAU];
    const wob = a =>
      0.7 *
      (0.55 * Math.sin(3 * a + ph[0]) +
        0.3 * Math.sin(5 * a + ph[1]) +
        0.15 * Math.sin(8 * a + ph[2])); // the limb, out of true by under a dot
    // darker toward the limb and under four seas; the jitter frays the steps between levels
    const SEAS = [
      [-0.28, -0.22, 0.3, 1],
      [0.22, -0.02, 0.22, 0.8],
      [0.02, 0.34, 0.2, 0.7],
      [-0.4, 0.28, 0.14, 0.55],
    ];
    const jit = (x, y) => {
      let h = Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
      return (h & 1023) / 1023 - 0.5;
    };
    const ink = (x, y) => {
      for (let py = y * DOT; py < Math.min(N, (y + 1) * DOT); py++)
        for (let qx = x * DOT; qx < Math.min(N, (x + 1) * DOT); qx++)
          px.set(PAPER_RGBA, (py * N + qx) * 4);
    };
    for (let y = 0; y < N / DOT; y++)
      for (let x = 0; x < N / DOT; x++) {
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        const d = Math.hypot(dx, dy);
        // atan2 only in the limb's ring
        if (d > R + 1 || (d > R - 1 && d > R + wob(Math.atan2(dy, dx)))) continue;
        const u = dx / R;
        const v = dy / R;
        const r2 = u * u + v * v;
        let sea = 0;
        for (const [sx, sy, sg, w] of SEAS)
          sea += w * Math.exp(-((u - sx) * (u - sx) + (v - sy) * (v - sy)) / (2 * sg * sg));
        const level =
          7.5 * (1 - 0.45 * r2) * (1 - 0.38 * Math.min(1, sea)) * smooth(R, R * 0.96, d) +
          0.9 * jit(x, y);
        if (BAYER[(y & 3) * 4 + (x & 3)] + 0.5 < level) ink(x, y);
      }
    g.putImageData(im, 0, 0);
  }

  // each fog layer is a seeded noise tile, drawn once at low resolution and stretched by css
  const FOG = {
    'f-back': {
      cells: [5, 3],
      cut: [0.36, 0.8],
      str: 0.11,
      prof: v => smooth(0, 0.75, v) * (0.7 + 0.3 * v),
    },
    'f-mid': {
      cells: [6, 3],
      cut: [0.34, 0.78],
      str: 0.2,
      prof: v => smooth(0, 0.62, v) * (1 - 0.3 * smooth(0.8, 1, v)),
    },
    'f-low': { cells: [8, 2], cut: [0.3, 0.74], str: 0.22, prof: v => smooth(0, 0.55, v) },
  };
  const fogs = [...scene.querySelectorAll('.fog')]
    .map(el => {
      const kind = Object.keys(FOG).find(k => el.classList.contains(k));
      return {
        el,
        cv: el.querySelector('canvas'),
        cfg: FOG[kind],
        period: +el.dataset.period || 60,
        seed: +el.dataset.seed || 1,
        off: 0,
      };
    })
    .filter(f => f.cv && f.cfg);
  function drawFog(f) {
    const TW = 384;
    const TH = 72;
    const { cells, cut, str, prof } = f.cfg;
    const r = rng(f.seed);
    const oc = octaves(r, cells[0], cells[1], 4);
    const warp = octaves(r, 3, 2, 2);
    f.cv.width = TW * 2;
    f.cv.height = TH;
    const g = f.cv.getContext('2d');
    const im = g.createImageData(TW, TH);
    const px = im.data;
    for (let y = 0; y < TH; y++) {
      const v = y / (TH - 1);
      const p = prof(v);
      for (let x = 0; x < TW; x++) {
        const u = x / TW;
        const w = fbm(warp, u, v) - 0.5; // a little domain warp: wisps, not blobs
        const n = fbm(oc, u + w * 0.08, v + w * 0.25);
        const a = Math.pow(smooth(cut[0], cut[1], n), 1.25) * p * str;
        const i = (y * TW + x) * 4;
        px[i] = 233;
        px[i + 1] = 231;
        px[i + 2] = 226;
        px[i + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(im, 0, 0);
    g.putImageData(im, TW, 0);
  }
  // fixed starting offsets, so the still frame is the same every time
  fogs.forEach((f, i) => {
    f.off = [0.31, 0.18, 0.77][i % 3];
  });
  function placeFog(dtWind) {
    for (const f of fogs) {
      f.off = (f.off + dtWind / f.period) % 1;
      // the canvas holds two tiles: -50 % to 0 moves one tile, then wraps
      f.cv.style.transform = `translate3d(${((f.off - 1) * 50).toFixed(3)}%,0,0)`;
    }
  }

  // the stand rises where the robot stands, with no plumes on its legs
  const cvs = [scene.querySelector('canvas.g-far'), scene.querySelector('canvas.g-near')];
  const ROWS = [
    { d: 0, cv: 0, sp: 10 },
    { d: 0.2, cv: 0, sp: 15 },
    { d: 0.4, cv: 0, sp: 22 },
    { d: 0.64, cv: 1, sp: 30 },
    { d: 0.83, cv: 1, sp: 40 },
    { d: 1, cv: 1, sp: 54 },
  ];
  const LIGHT = [0.42, 0.62, 0.85, 1.08]; // the plumes catch the light only near the moon
  let W = 0;
  let H = 0;
  let scale = 1;
  let field = [];
  let moonX = 0;
  let slow = false;
  let probed = false;
  let tickN = 0;
  const GRID = 64;
  const windGrid = new Float32Array(GRID + 2);
  function build() {
    const box = cvs[0].getBoundingClientRect();
    const sb = scene.getBoundingClientRect();
    W = Math.round(box.width);
    H = Math.round(box.height);
    if (!W || !H) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    // at most ~1.2 Mpx per canvas
    scale = Math.min(dpr, Math.sqrt(1.2e6 / (W * H))) * (slow ? 0.6 : 1);
    for (const c of cvs) {
      c.width = Math.round(W * scale);
      c.height = Math.round(H * scale);
    }
    const mb = moonC.getBoundingClientRect();
    moonX = mb.left + mb.width / 2 - sb.left;
    const pb = scene.querySelector('.figure img:last-of-type').getBoundingClientRect();
    // the robot's feet are 6 to 88 % across its plate
    const standL = pb.left - sb.left + pb.width * 0.06;
    const standR = pb.left - sb.left + pb.width * 0.88;
    const pad = Math.max(40, (standR - standL) * 0.18);
    const rise = x => smooth(standL - pad, standL, x) * (1 - smooth(standR, standR + pad, x));
    const narrow = W < 720;
    const r = rng(8085);
    const swell = octaves(rng(77), 5, 1, 3); // the stand's density and height along x
    const sky = octaves(rng(31), 3, 1, 2); // the field's top edge swells and dips
    const skyAt = x =>
      Math.max(-1, Math.min(1, (fbm(sky, ((x / W) * 0.9 + 1) % 1, 0.5) - 0.5) / 0.16));
    const lightAt = x => {
      const L = Math.max(0, 1 - Math.abs(x - moonX) / Math.max(160, W * 0.2));
      if (L > 0.7) return 3;
      if (L > 0.45) return 2;
      if (L > 0.15) return 1;
      return 0;
    };
    field = ROWS.map(row => {
      const d = row.d;
      const sp = row.sp * (narrow ? 0.78 : 1);
      const near = d >= 0.6;
      const baseY = H * (0.62 + 0.4 * d);
      const items = [];
      function clump(x, n, tall) {
        const sw = fbm(swell, ((x / W) * 0.8 + d * 0.37 + 1) % 1, 0.5);
        const cw = sp * (near ? 0.22 + 0.14 * r() : 0.3);
        const k0 = skyAt(x);
        const bucket = lightAt(x);
        for (let c = 0; c < n; c++) {
          const xc = x + (c - (n - 1) / 2) * cw + (r() - 0.5) * cw * 0.7;
          let darkShare = 0.22;
          if (tall) darkShare = 0.6;
          else if (d >= 0.8) darkShare = 0.5;
          const dark = near && r() < darkShare;
          const y0 = baseY + (r() - 0.5) * H * 0.05;
          let sh =
            H *
              lerp(0.24, 0.82, Math.pow(d, 1.05)) *
              (0.55 + 0.7 * smooth(0.25, 0.75, sw)) *
              (0.75 + 0.4 * r()) +
            H * 0.12 * k0 * (0.4 + 0.6 * d) +
            H * (near ? 0.16 : 0.1) * rise(x);
          if (tall) sh = H * (0.74 + 0.12 * r());
          sh = Math.max(H * 0.08, Math.min(y0 * 0.8, sh)); // the plume stays on the canvas
          const nStems = near ? 1 + (r() < 0.25 ? 1 : 0) : 1;
          for (let k = 0; k < nStems; k++) {
            // a dark stem carries no plume: against the fog a dark plume reads as a bird
            let plume = !dark && r() < (tall ? 0.5 : lerp(0.55, 0.92, d) * (near ? 0.3 : 0.33));
            if (rise(xc) > 0.2) plume = false;
            items.push({
              stem: true,
              x: xc + (r() - 0.5) * sp * 0.2,
              y: y0,
              h: sh * (k ? 0.82 + 0.1 * r() : 1),
              w: lerp(0.7, 2.1, d),
              lean: -0.04 + 0.2 * r(),
              flex: 0.5 + 0.35 * r(),
              ph: r() * TAU,
              fr: 1.1 + 1.1 * r(),
              plume,
              pl: sh * (0.06 + 0.2 * r()) * (near ? 0.5 + 0.4 * r() : 1),
              dr: 0.15 + 1.5 * r(),
              pa: (r() - 0.4) * 1.1,
              nf: 1 + Math.floor(r() * 3),
              bucket,
              dark,
            });
          }
          const nLeaves = near ? 1 + (r() < 0.55 ? 1 : 0) : 1 + (r() < 0.5 ? 1 : 0);
          for (let k = 0; k < nLeaves; k++) {
            const side = r() < 0.64 ? 1 : -1;
            items.push({
              stem: false,
              x: xc + (r() - 0.5) * sp * 0.25,
              y: y0 + H * 0.01,
              h: sh * (0.42 + 0.3 * r()),
              w: lerp(0.9, 3.4, d) * (0.8 + 0.4 * r()),
              lean: side * (0.25 + 0.6 * r()),
              flex: 0.9 + 0.45 * r(),
              ph: r() * TAU,
              fr: 1.3 + 1.2 * r(),
              bucket,
              dark,
            });
          }
        }
      }
      if (!near) {
        for (let x = -sp * r(); x < W + sp; x += sp * (0.6 + 0.8 * r())) {
          const sw = fbm(swell, ((x / W) * 0.8 + d * 0.37 + 1) % 1, 0.5);
          if (sw < 0.32 && r() < 0.55) continue;
          clump(x, 1, false);
        }
      } else {
        for (let x = -sp * r(); x < W + sp;) {
          const sw = fbm(swell, ((x / W) * 0.8 + d * 0.37 + 1) % 1, 0.5);
          const n = 3 + Math.floor(r() * 5);
          if (!(sw < 0.34 && r() < 0.5) || rise(x) > 0.5) clump(x, n, false);
          x += sp * (n * 0.2 + 1.3 + 1.6 * r());
        }
        if (d === 1) clump(W * 0.035 + 6, 2, true);
      }
      const a = lerp(0.1, 0.28, d);
      return {
        ...row,
        items,
        leafA: a,
        plumeA: LIGHT.map(m => Math.min(0.62, lerp(0.24, 0.58, d) * m * (near ? 1 : 0.5))),
      };
    });
    return true;
  }

  // 0 is still air, about 1 a gust's crest; a gust takes about 10 s to cross the field
  let windT = 0;
  let push = 0;
  let pushX = -1e4;
  let meanWind = 0.4;
  function gust(u, t) {
    const swell = 0.5 + 0.5 * Math.sin((TAU * t) / 23);
    const w1 = Math.pow(0.5 + 0.5 * Math.sin(TAU * (u / 0.95 - t / 9.5)), 3);
    const w2 = Math.pow(0.5 + 0.5 * Math.sin(TAU * (u / 0.37 - t / 4.4) + 1.3), 2);
    return 0.64 * w1 * (0.62 + 0.38 * swell) + 0.22 * w2 + 0.14 * swell;
  }
  function sampleWind(t) {
    let sum = 0;
    for (let i = 0; i <= GRID + 1; i++) {
      const x = (i / GRID) * W;
      let u = gust(i / GRID, t);
      if (push > 0.002) u += push * Math.exp(-Math.pow((x - pushX) / 130, 2));
      windGrid[i] = u;
      sum += u;
    }
    meanWind = sum / (GRID + 2);
  }
  const windAt = x => {
    const f = Math.min(GRID, Math.max(0, (x / W) * GRID));
    const i = f | 0;
    return windGrid[i] + (windGrid[i + 1] - windGrid[i]) * (f - i);
  };

  function drawGrass(t, which = 3) {
    // which: a bit mask of the canvases to redraw (1 the far, 2 the near)
    const g0 = cvs[0].getContext('2d');
    const g1 = cvs[1].getContext('2d');
    for (const g of [g0, g1]) {
      if (!(which & (g === g0 ? 1 : 2))) continue;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, g.canvas.width, g.canvas.height);
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.lineCap = 'round';
    }
    for (const row of field) {
      if (!(which & (row.cv ? 2 : 1))) continue;
      const g = row.cv ? g1 : g0;
      const body = LIGHT.map(() => new Path2D());
      const dark = new Path2D();
      const plumes = LIGHT.map(() => new Path2D());
      const tufts = LIGHT.map(() => new Path2D());
      const reach = 0.55 + 0.45 * row.d;
      for (const it of row.items) {
        const u = windAt(it.x);
        const flut = Math.sin(t * it.fr + it.ph) * (0.03 + 0.05 * u);
        let th = it.stem
          ? it.lean + it.flex * reach * (0.08 + 0.66 * u) + flut
          : it.lean + it.flex * reach * (0.06 + 0.5 * u) * (it.lean < 0 ? 0.8 : 1) + flut * 1.5;
        th = Math.max(-1.35, Math.min(1.35, th));
        const P = it.dark ? dark : body[it.bucket];
        let tx;
        let ty;
        if (it.stem) {
          const a1 = th * 0.3;
          const a2 = th * 0.88;
          const L = it.h;
          const cx = it.x + L * 0.52 * Math.sin(a1);
          const cy = it.y - L * 0.52 * Math.cos(a1);
          tx = it.x + L * Math.sin(a2);
          ty = it.y - L * 0.97 * Math.cos(a2);
          const nx = Math.cos(a1) * it.w * 0.5;
          const ny = Math.sin(a1) * it.w * 0.5;
          P.moveTo(it.x - nx, it.y - ny);
          P.quadraticCurveTo(cx - nx * 0.5, cy - ny * 0.5, tx, ty);
          P.quadraticCurveTo(cx + nx * 0.5, cy + ny * 0.5, it.x + nx, it.y + ny);
          P.closePath();
          if (it.plume) {
            const pl = it.pl;
            const ax = th * 1.2 + 0.1 + it.pa;
            const droop = (0.32 + 0.25 * reach) * it.dr;
            const bx = tx - Math.sin(a2) * pl * 0.45;
            const by = ty + Math.cos(a2) * pl * 0.45;
            const cx2 = bx + pl * 0.55 * Math.sin(ax);
            const cy2 = by - pl * 0.55 * Math.cos(ax);
            const ex = bx + pl * Math.sin(ax + droop);
            const ey = by - pl * Math.cos(ax + droop);
            const wv = pl * (0.1 + 0.05 * reach);
            const nx2 = Math.cos(ax) * wv;
            const ny2 = Math.sin(ax) * wv;
            const T = tufts[it.bucket];
            T.moveTo(bx, by);
            T.quadraticCurveTo(cx2 - nx2, cy2 - ny2, ex, ey);
            T.quadraticCurveTo(cx2 + nx2, cy2 + ny2, bx, by);
            T.closePath();
            const Q = plumes[it.bucket];
            for (let j = 0; j < it.nf; j++) {
              const o = (j / Math.max(1, it.nf - 1) - 0.5) * 1.5;
              const k = 1 - 0.18 * Math.abs(o);
              Q.moveTo(bx, by);
              Q.quadraticCurveTo(
                cx2 + nx2 * o,
                cy2 + ny2 * o,
                bx + (ex - bx) * k + nx2 * o * 0.7,
                by + (ey - by) * k + ny2 * o * 0.7,
              );
            }
          }
        } else {
          const a1 = th * 0.5;
          const a2 = th * 1.32;
          const L = it.h;
          const cx = it.x + L * 0.62 * Math.sin(a1);
          const cy = it.y - L * 0.62 * Math.cos(a1);
          tx = it.x + L * Math.sin(a2);
          ty = it.y - L * 0.86 * Math.cos(a2);
          const nx = Math.cos(a1) * it.w * 0.5;
          const ny = Math.sin(a1) * it.w * 0.5;
          P.moveTo(it.x - nx, it.y - ny);
          P.quadraticCurveTo(cx - nx * 0.45, cy - ny * 0.45, tx, ty);
          P.quadraticCurveTo(cx + nx * 0.45, cy + ny * 0.45, it.x + nx, it.y + ny);
          P.closePath();
        }
      }
      for (let b = 0; b < LIGHT.length; b++) {
        g.fillStyle = `rgba(${PAPER},${(row.leafA * (0.84 + (0.16 * b) / (LIGHT.length - 1))).toFixed(3)})`;
        g.fill(body[b]);
      }
      g.lineWidth = lerp(0.6, 1.1, row.d);
      for (let b = 0; b < LIGHT.length; b++) {
        g.fillStyle = `rgba(${PAPER},${(row.plumeA[b] * 0.55).toFixed(3)})`;
        g.fill(tufts[b]);
        g.strokeStyle = `rgba(${PAPER},${row.plumeA[b]})`;
        g.stroke(plumes[b]);
      }
      g.fillStyle = 'rgba(12,12,14,.94)';
      g.fill(dark);
    }
  }

  const STILL_T = 1.9; // a gust's crest a little left of centre
  // for a software renderer the probe misses: ticks averaging over 45 ms turn the grass light, once
  let tickAt = 0;
  let tickSum = 0;
  let tickCount = 0;
  function watch() {
    if (slow || tickCount < 0) return;
    const now = performance.now();
    if (tickAt && now - tickAt < 500) {
      // a longer gap is the loop waking up, not a slow frame
      if (++tickCount > 15) tickSum += now - tickAt;
      if (tickCount === 45) {
        if (tickSum / 30 > 45) {
          slow = true;
          build();
          drawGrass(windT);
        }
        tickCount = -1;
      }
    }
    tickAt = now;
  }
  function frame(dt) {
    watch();
    windT += dt;
    push *= Math.exp(-dt / 0.9);
    sampleWind(windT);
    placeFog(dt * (0.75 + 0.5 * meanWind));
    // light grass: the near rows at 15 fps, the far rows still
    if (!slow) drawGrass(windT);
    else if (tickN++ & 1) drawGrass(windT, 2);
  }
  let ready = false;
  // the stacked fold sizes the robot to the scene
  const measure = () => hero.style.setProperty('--sh', scene.clientHeight + 'px');
  function paintScene() {
    ready = build();
    if (ready) firstGrass();
  }
  function firstGrass() {
    windT = REDUCED ? STILL_T : windT || STILL_T;
    sampleWind(windT);
    placeFog(0);
    drawGrass(windT);
    // the renderer probe's throwaway WebGL context is a 50 ms task: keep it clear of the fade-in
    if (!probed && !REDUCED) {
      probed = true;
      setTimeout(() => {
        if (!slow) idle(probe);
      }, 2000);
    }
  }
  function setup() {
    measure();
    drawMoon();
    paintScene();
  }
  // without a GPU the grass costs about 250 ms of main thread a second, so it goes light
  function probe() {
    let r = '';
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      r = gl
        ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
        : 'none';
      const lose = gl && gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    } catch (e) {
      r = 'none';
    }
    if (!slow && (r === 'none' || /SwiftShader|Basic Render|llvmpipe|softpipe|Software/i.test(r))) {
      slow = true;
      if (build()) drawGrass(windT);
    }
  }
  // the first frame in short tasks, with the moon and the fog in idle time during the fade-in
  const idle = cb =>
    'requestIdleCallback' in window
      ? requestIdleCallback(cb, { timeout: 300 })
      : setTimeout(cb, 50);
  fogs.forEach(f => idle(() => drawFog(f)));
  let rt = 0;
  let lastW = -1;
  let lastH = -1;
  const first = () => {
    lastW = scene.clientWidth;
    lastH = scene.clientHeight;
    measure();
    setTimeout(() => {
      if (!build()) return;
      setTimeout(() => {
        ready = true;
        firstGrass();
      }, 0);
    }, 0);
    idle(drawMoon);
  };
  requestAnimationFrame(first);
  // the observer's first call reports the size first() laid out, and is ignored
  new ResizeObserver(() => {
    if (lastW < 0) return;
    const w = scene.clientWidth;
    const h = scene.clientHeight;
    if (w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;
    // the robot is resized before the next paint, the drawings once the resize settles
    measure();
    freeMoon();
    clearTimeout(rt);
    rt = setTimeout(setup, 120);
  }).observe(scene);
  if (REDUCED) return;

  let onScreen = false;
  let running = false;
  const tick = dt => {
    if (ready) frame(dt);
  };
  function sync() {
    const want = onScreen && !document.hidden;
    if (want && !running) {
      S.add(tick);
      running = true;
    } else if (!want && running) {
      S.remove(tick);
      running = false;
    }
  }
  new IntersectionObserver(
    es => {
      onScreen = es[es.length - 1].isIntersecting;
      sync();
    },
    { threshold: 0 },
  ).observe(hero);
  document.addEventListener('visibilitychange', sync);
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let lx = 0;
    let lt = 0;
    hero.addEventListener(
      'pointermove',
      e => {
        const sb = scene.getBoundingClientRect();
        const y = e.clientY - sb.top;
        if (y < sb.height * 0.45) return;
        const now = performance.now();
        const x = e.clientX - sb.left;
        const v = Math.abs(x - lx) / Math.max(16, now - lt);
        lx = x;
        lt = now;
        pushX = x;
        push = Math.min(0.32, push + v * 0.05);
      },
      { passive: true },
    );
  }
})();

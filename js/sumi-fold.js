/* SUMI v8 — the fold's weather. One wind: gusts that roll across the field from left to right bend the pampas, and the same wind drifts
   the fog, each layer at its own pace (a wisp crosses the fold in 42-90 s). The moon is drawn once. Everything here is procedural: no
   images, no glyphs, no libraries. Back to front (css places the layers, .scene in index.html): the moon, the far fog, the wisps over the
   moon's lower limb, Raiden, the far grass, the fog bank, the near grass, the ground fog.
   It runs inside the page's one loop (js/sumi.js, ~30 fps): only while the fold is on screen, never while the tab is hidden or the codec
   call / game is open. Under prefers-reduced-motion it draws one still frame, the grass bent mid-gust, and stops. */
(() => {
  'use strict';
  const hero = document.querySelector('.hero'), scene = hero && hero.querySelector('.scene');
  if (!scene) return;
  const S = window.SUMI;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const q = new URLSearchParams(location.search);
  const PAPER = '233,231,226';
  const TAU = Math.PI * 2;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  /* seeded random (mulberry32) and tileable value noise: the field and the fog are the same on every visit */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function lattice(nx, ny, r) { const a = new Float32Array(nx * ny); for (let i = 0; i < a.length; i++) a[i] = r(); return { nx, ny, a }; }
  function vnoise(L, x, y) {                                   // x and y in lattice cells, both wrapping
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const x0 = ((xi % L.nx) + L.nx) % L.nx, x1 = (x0 + 1) % L.nx, y0 = ((yi % L.ny) + L.ny) % L.ny, y1 = (y0 + 1) % L.ny;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = L.a[y0 * L.nx + x0], b = L.a[y0 * L.nx + x1], c = L.a[y1 * L.nx + x0], d = L.a[y1 * L.nx + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function fbm(octs, u, v) {                                   // u, v in 0..1 of the tile
    let n = 0, amp = .5, norm = 0;
    for (const L of octs) { n += amp * vnoise(L, u * L.nx, v * L.ny); norm += amp; amp *= .5; }
    return n / norm;
  }
  const octaves = (r, cx, cy, k = 4) => Array.from({ length: k }, (_, o) => lattice(cx << o, cy << o, r));

  /* ---------- the moon: a pale full disc at ~54 % of paper at its brightest (~57 % with the grain over it), a darker limb, faint maria, a soft halo that bleeds into the
     fog. Drawn once (and on resize) into a canvas twice its diameter; the grain lies over it (css body::after). ---------- */
  const moonC = scene.querySelector('canvas.moon');
  function drawMoon() {
    if (!moonC) return;
    const css = moonC.clientWidth;
    if (!css) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const N = Math.max(64, Math.min(1400, Math.round(css * dpr)));
    moonC.width = moonC.height = N;
    const g = moonC.getContext('2d');
    const c = N / 2, R = N / 4;
    // the halo: wide and faint, eased to nothing at twice the radius, so it reads as lit air, not a glow
    const h = g.createRadialGradient(c, c, R * .97, c, c, R * 2);
    [[0, .085], [.08, .06], [.22, .034], [.42, .016], [.68, .005], [1, 0]].forEach(([o, a]) => h.addColorStop(o, `rgba(${PAPER},${a})`));
    g.fillStyle = h; g.fillRect(0, 0, N, N);
    // the disc: limb-darkened, its light a little up and to the left
    const D = Math.ceil(R * 2) + 4, dc = D / 2;
    const d = document.createElement('canvas'); d.width = d.height = D;
    const dg = d.getContext('2d');
    const lg = dg.createRadialGradient(dc - R * .14, dc - R * .12, 0, dc, dc, R);
    const tone = k => `rgb(${Math.round(233 * k)},${Math.round(231 * k)},${Math.round(226 * k)})`;
    [[0, .545], [.45, .53], [.75, .48], [.92, .425], [1, .355]].forEach(([o, k]) => lg.addColorStop(o, tone(k)));
    dg.beginPath(); dg.arc(dc, dc, R, 0, TAU); dg.fillStyle = lg; dg.fill();
    // the maria: dark seas from a seeded noise field, mostly in the upper half like the real near side, their shores fairly crisp (a narrow
    // step, so they read as seas, not cloud); a mottle over the highlands, and a fine one at ~2.5 % (the regolith)
    const M = 256, mc = document.createElement('canvas'); mc.width = mc.height = M;
    const mg = mc.getContext('2d'), im = mg.createImageData(M, M), px = im.data;
    const r = rng(1969), seas = octaves(r, 3, 3, 4), mottle = octaves(r, 9, 9, 3), fine = octaves(r, 40, 40, 2);
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
      const u = x / M, v = y / M;
      const bias = .1 * (1 - v) - .06 * Math.abs(u - .45);
      const sea = smooth(.56, .62, fbm(seas, u, v) + bias);
      const mot = fbm(mottle, u, v), fn = fbm(fine, u, v);
      const a = Math.min(1, Math.max(0, sea * .62 + Math.max(0, mot - .5) * .5 + (fn - .5) * .12));
      const i = (y * M + x) * 4; px[i] = 18; px[i + 1] = 18; px[i + 2] = 20; px[i + 3] = Math.round(a * 255);
    }
    mg.putImageData(im, 0, 0);
    dg.globalCompositeOperation = 'source-atop'; dg.globalAlpha = .42; dg.imageSmoothingQuality = 'high';
    dg.drawImage(mc, dc - R, dc - R, R * 2, R * 2);
    // the limb itself: a hairline of shade so the disc has an edge in the fog
    dg.globalAlpha = 1; dg.globalCompositeOperation = 'source-over';
    const lr = dg.createRadialGradient(dc, dc, R * .9, dc, dc, R);
    lr.addColorStop(0, 'rgba(18,18,20,0)'); lr.addColorStop(1, 'rgba(18,18,20,.16)');
    dg.beginPath(); dg.arc(dc, dc, R, 0, TAU); dg.fillStyle = lr; dg.fill();
    g.drawImage(d, c - dc, c - dc);
  }

  /* ---------- the fog: four soft layers, each a seeded noise tile (wrapping in x) with its own height profile, drawn once at low
     resolution; css stretches it (the fog is all soft edge) and the wind slides it right. ---------- */
  const FOG = {
    'f-back': { cells: [5, 3], cut: [.36, .8], str: .11, prof: v => smooth(0, .75, v) * (.7 + .3 * v) },
    'f-wisp': { cells: [7, 2], cut: [.5, .86], str: .16, prof: v => Math.pow(Math.sin(Math.PI * v), 2) },
    'f-mid': { cells: [6, 3], cut: [.34, .78], str: .2, prof: v => smooth(0, .62, v) * (1 - .3 * smooth(.8, 1, v)) },
    'f-low': { cells: [8, 2], cut: [.3, .74], str: .22, prof: v => smooth(0, .55, v) },
  };
  const fogs = [...scene.querySelectorAll('.fog')].map(el => {
    const kind = Object.keys(FOG).find(k => el.classList.contains(k));
    return { el, cv: el.querySelector('canvas'), cfg: FOG[kind], period: +el.dataset.period || 60, seed: +el.dataset.seed || 1, off: 0 };
  }).filter(f => f.cv && f.cfg);
  function drawFog(f) {
    const TW = 384, TH = 72, { cells, cut, str, prof } = f.cfg;
    const r = rng(f.seed), oc = octaves(r, cells[0], cells[1], 4), warp = octaves(r, 3, 2, 2);
    f.cv.width = TW * 2; f.cv.height = TH;
    const g = f.cv.getContext('2d'), im = g.createImageData(TW, TH), px = im.data;
    for (let y = 0; y < TH; y++) {
      const v = y / (TH - 1), p = prof(v);
      for (let x = 0; x < TW; x++) {
        const u = x / TW;
        const w = fbm(warp, u, v) - .5;                        // a little domain warp: wisps, not blobs
        const n = fbm(oc, u + w * .08, v + w * .25);
        const a = Math.pow(smooth(cut[0], cut[1], n), 1.25) * p * str;
        const i = (y * TW + x) * 4; px[i] = 233; px[i + 1] = 231; px[i + 2] = 226; px[i + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(im, 0, 0); g.putImageData(im, TW, 0);
  }
  // seeded starting offsets, so the still frame is composed the same way every time
  fogs.forEach((f, i) => { f.off = [.31, .62, .18, .77][i % 4]; });
  function placeFog(dtWind) {
    for (const f of fogs) {
      f.off = (f.off + dtWind / f.period) % 1;
      f.cv.style.transform = `translate3d(${((f.off - 1) * 50).toFixed(3)}%,0,0)`;   // the canvas is 200 % wide: -50 % -> 0 moves one tile right, then wraps
    }
  }

  /* ---------- the grass: pampas, six rows deep. Far rows: short, dim, dense, an even stand on the far canvas (behind the fog bank). Near
     rows: tall clumps of 3-7 with open ground between, on the near canvas, a few silhouetted dark against the lit fog, and a few taller
     stems (before his thigh, at the left edge). The field's top swells and dips. Each stem is a tapered quadratic curve with arching
     leaves; most carry a feathery plume (thin curved filaments) of its own size and droop; the plumes catch the moon, a third dimmer far
     from it. ---------- */
  const cvs = [scene.querySelector('canvas.g-far'), scene.querySelector('canvas.g-near')];
  const ROWS = [
    { d: 0, cv: 0, sp: 10 }, { d: .2, cv: 0, sp: 15 }, { d: .4, cv: 0, sp: 22 },
    { d: .64, cv: 1, sp: 30 }, { d: .83, cv: 1, sp: 40 }, { d: 1, cv: 1, sp: 54 },
  ];
  const LIGHT = [.55, .72, .9, 1.08];                         // the plumes' four light levels: far from the moon ~ a third dimmer than under it
  let W = 0, H = 0, scale = 1, field = [], moonX = 0;
  const GRID = 64; const windGrid = new Float32Array(GRID + 2);
  function build() {
    const box = cvs[0].getBoundingClientRect(), sb = scene.getBoundingClientRect();
    W = Math.round(box.width); H = Math.round(box.height);
    if (!W || !H) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    scale = Math.min(dpr, Math.sqrt(1.2e6 / (W * H)));        // the grass renders at most ~1.2 Mpx per canvas
    for (const c of cvs) { c.width = Math.round(W * scale); c.height = Math.round(H * scale); }
    moonX = W * .75;
    if (moonC) { const mb = moonC.getBoundingClientRect(); moonX = mb.left + mb.width / 2 - sb.left; }
    const plate = scene.querySelector('.figure img:last-of-type'), pb = plate && plate.getBoundingClientRect();
    const thighX = pb && pb.width ? pb.left - sb.left + pb.width * .4 : W * .78;   // a few tall stems stand in front of his thigh
    const narrow = W < 720;
    const r = rng(8085);
    const swell = octaves(rng(77), 5, 1, 3);                   // the stand's density and height along x
    const sky = octaves(rng(31), 3, 1, 2);                     // the field's top edge: slow swells and dips, +-12 % of the grass's height
    const skyAt = x => Math.max(-1, Math.min(1, (fbm(sky, ((x / W) * .9 + 1) % 1, .5) - .5) / .16));
    const lightAt = x => { const L = Math.max(0, 1 - Math.abs(x - moonX) / (W * .75)); const m = .7 + .38 * Math.pow(L, 1.3); return m < .8 ? 0 : m < .9 ? 1 : m < 1 ? 2 : 3; };
    field = ROWS.map(row => {
      const d = row.d, sp = row.sp * (narrow ? .78 : 1), near = d >= .6;
      const baseY = H * (.62 + .4 * d);
      const items = [];
      function clump(x, n, tall) {                             // n stems (and their leaves) round x
        const sw = fbm(swell, ((x / W) * .8 + d * .37 + 1) % 1, .5);
        const cw = sp * (near ? .22 + .14 * r() : .3);
        const k0 = skyAt(x), bucket = lightAt(x);
        for (let c = 0; c < n; c++) {
          const xc = x + (c - (n - 1) / 2) * cw + (r() - .5) * cw * .7;
          const dark = d >= .8 && !tall && r() < .17;
          const y0 = baseY + (r() - .5) * H * .05;
          let sh = H * lerp(.24, .82, Math.pow(d, 1.05)) * (.55 + .7 * smooth(.25, .75, sw)) * (.75 + .4 * r()) + H * .12 * k0 * (.4 + .6 * d);
          if (tall) sh = H * (.74 + .12 * r());
          sh = Math.max(H * .08, Math.min(y0 * .8, sh));         // the plume stays on the canvas
          const nStems = near ? 1 + (r() < .25 ? 1 : 0) : 1;
          for (let k = 0; k < nStems; k++) {
            const plume = !dark && (tall || r() < lerp(.55, .92, d) * (near ? .6 : 1));
            items.push({
              stem: true, x: xc + (r() - .5) * sp * .2, y: y0, h: sh * (k ? .82 + .1 * r() : 1), w: lerp(.7, 2.1, d), lean: -.04 + .2 * r(),
              flex: .5 + .35 * r(), ph: r() * TAU, fr: 1.1 + 1.1 * r(), plume, pl: sh * (.15 + .09 * r()) * (near ? .6 + r() : 1),
              dr: near ? .6 + .9 * r() : 1, nf: d < .4 ? 2 : 3, bucket, dark,
            });
          }
          const nLeaves = near ? 1 + (r() < .55 ? 1 : 0) : 1 + (r() < .5 ? 1 : 0);
          for (let k = 0; k < nLeaves; k++) {
            const side = r() < .64 ? 1 : -1;
            items.push({
              stem: false, x: xc + (r() - .5) * sp * .25, y: y0 + H * .01, h: sh * (.42 + .3 * r()), w: lerp(.9, 3.4, d) * (.8 + .4 * r()),
              lean: side * (.25 + .6 * r()), flex: .9 + .45 * r(), ph: r() * TAU, fr: 1.3 + 1.2 * r(), bucket, dark,
            });
          }
        }
      }
      if (!near) {                                             // the far rows: an even, dense stand with gaps
        for (let x = -sp * r(); x < W + sp; x += sp * (.6 + .8 * r())) {
          const sw = fbm(swell, ((x / W) * .8 + d * .37 + 1) % 1, .5);
          if (sw < .32 && r() < .55) continue;
          clump(x, 1, false);
        }
      } else {                                                 // the near rows: clumps of 3-7 with open ground between them
        for (let x = -sp * r(); x < W + sp;) {
          const sw = fbm(swell, ((x / W) * .8 + d * .37 + 1) % 1, .5);
          const n = 3 + Math.floor(r() * 5);
          if (!(sw < .34 && r() < .5)) clump(x, n, false);
          x += sp * (n * .2 + 1.3 + 1.6 * r());
        }
        if (d === 1) { clump(thighX, 3, true); clump(W * .035 + 6, 2, true); }   // the tall ones: before his thigh, and at the left edge
      }
      const a = lerp(.1, .34, d);
      return { ...row, items, leafA: a, plumeA: LIGHT.map(m => Math.min(.86, lerp(.24, .74, d) * m)) };
    });
    return true;
  }

  /* the wind: two wave trains rolling left to right (a long gust, ~10 s across the field, and a quicker ripple) over a slow swell, plus a
     local push where the cursor moves through the grass. 0 = still air, ~1 = the crest of a gust. */
  let windT = 0, push = 0, pushX = -1e4, meanWind = .4;
  function gust(u, t) {
    const swell = .5 + .5 * Math.sin(TAU * t / 23);
    const w1 = Math.pow(.5 + .5 * Math.sin(TAU * (u / .95 - t / 9.5)), 3);
    const w2 = Math.pow(.5 + .5 * Math.sin(TAU * (u / .37 - t / 4.4) + 1.3), 2);
    return .64 * w1 * (.62 + .38 * swell) + .22 * w2 + .14 * swell;
  }
  function sampleWind(t) {
    let sum = 0;
    for (let i = 0; i <= GRID + 1; i++) {
      const x = i / GRID * W;
      let u = gust(i / GRID, t);
      if (push > .002) u += push * Math.exp(-Math.pow((x - pushX) / 130, 2));
      windGrid[i] = u; sum += u;
    }
    meanWind = sum / (GRID + 2);
  }
  const windAt = x => { const f = Math.min(GRID, Math.max(0, x / W * GRID)), i = f | 0; return windGrid[i] + (windGrid[i + 1] - windGrid[i]) * (f - i); };

  function drawGrass(t) {
    const g0 = cvs[0].getContext('2d'), g1 = cvs[1].getContext('2d');
    for (const g of [g0, g1]) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, g.canvas.width, g.canvas.height); g.setTransform(scale, 0, 0, scale, 0, 0); g.lineCap = 'round'; }
    for (const row of field) {
      const g = row.cv ? g1 : g0;
      const body = LIGHT.map(() => new Path2D()), dark = new Path2D(), plumes = LIGHT.map(() => new Path2D()), tufts = LIGHT.map(() => new Path2D()), darkPl = new Path2D();
      const reach = .55 + .45 * row.d;
      for (const it of row.items) {
        const u = windAt(it.x);
        const flut = Math.sin(t * it.fr + it.ph) * (.03 + .05 * u);
        let th = it.stem ? it.lean + it.flex * reach * (.08 + .66 * u) + flut
                         : it.lean + it.flex * reach * (.06 + .5 * u) * (it.lean < 0 ? .8 : 1) + flut * 1.5;
        th = Math.max(-1.35, Math.min(1.35, th));
        const P = it.dark ? dark : body[it.bucket];
        let tx, ty;
        if (it.stem) {
          const a1 = th * .3, a2 = th * .88, L = it.h;
          const cx = it.x + L * .52 * Math.sin(a1), cy = it.y - L * .52 * Math.cos(a1);
          tx = it.x + L * Math.sin(a2); ty = it.y - L * .97 * Math.cos(a2);
          const nx = Math.cos(a1) * it.w * .5, ny = Math.sin(a1) * it.w * .5;
          P.moveTo(it.x - nx, it.y - ny); P.quadraticCurveTo(cx - nx * .5, cy - ny * .5, tx, ty); P.quadraticCurveTo(cx + nx * .5, cy + ny * .5, it.x + nx, it.y + ny); P.closePath();
          if (it.plume) {                                      // the plume: a soft feather along a drooping axis (a tapered fill), combed by a few fine filaments
            const pl = it.pl, ax = th * 1.2 + .1, droop = (.32 + .25 * reach) * it.dr;
            const bx = tx - Math.sin(a2) * pl * .45, by = ty + Math.cos(a2) * pl * .45;
            const cx2 = bx + pl * .55 * Math.sin(ax), cy2 = by - pl * .55 * Math.cos(ax);
            const ex = bx + pl * Math.sin(ax + droop), ey = by - pl * Math.cos(ax + droop);
            const wv = pl * (.1 + .05 * reach), nx2 = Math.cos(ax) * wv, ny2 = Math.sin(ax) * wv;
            const T = it.dark ? darkPl : tufts[it.bucket];
            T.moveTo(bx, by); T.quadraticCurveTo(cx2 - nx2, cy2 - ny2, ex, ey); T.quadraticCurveTo(cx2 + nx2, cy2 + ny2, bx, by); T.closePath();
            const Q = it.dark ? darkPl : plumes[it.bucket];
            for (let j = 0; j < it.nf; j++) {
              const o = (j / Math.max(1, it.nf - 1) - .5) * 1.5, k = 1 - .18 * Math.abs(o);
              Q.moveTo(bx, by);
              Q.quadraticCurveTo(cx2 + nx2 * o, cy2 + ny2 * o, bx + (ex - bx) * k + nx2 * o * .7, by + (ey - by) * k + ny2 * o * .7);
            }
          }
        } else {                                               // a leaf: arches out and over, its tip falling downwind
          const a1 = th * .5, a2 = th * 1.32, L = it.h;
          const cx = it.x + L * .62 * Math.sin(a1), cy = it.y - L * .62 * Math.cos(a1);
          tx = it.x + L * Math.sin(a2); ty = it.y - L * .86 * Math.cos(a2);
          const nx = Math.cos(a1) * it.w * .5, ny = Math.sin(a1) * it.w * .5;
          P.moveTo(it.x - nx, it.y - ny); P.quadraticCurveTo(cx - nx * .45, cy - ny * .45, tx, ty); P.quadraticCurveTo(cx + nx * .45, cy + ny * .45, it.x + nx, it.y + ny); P.closePath();
        }
      }
      for (let b = 0; b < LIGHT.length; b++) { g.fillStyle = `rgba(${PAPER},${(row.leafA * (.84 + .16 * b / (LIGHT.length - 1))).toFixed(3)})`; g.fill(body[b]); }   // the blades dim a little away from the moon too
      g.lineWidth = lerp(.6, 1.1, row.d);
      for (let b = 0; b < LIGHT.length; b++) {
        g.fillStyle = `rgba(${PAPER},${(row.plumeA[b] * .55).toFixed(3)})`; g.fill(tufts[b]);
        g.strokeStyle = `rgba(${PAPER},${row.plumeA[b]})`; g.stroke(plumes[b]);
      }
      if (row.d >= .8) { g.fillStyle = 'rgba(12,12,14,.92)'; g.fill(dark); }   // the silhouetted clumps: blades only (a dark plume reads as a bird)
    }
  }

  /* ---------- frame, sizing, the loop ---------- */
  const STILL_T = 1.9;                                         // a gust's crest a little left of centre, mid-field
  const perf = DEV && q.has('perf') ? [] : null;
  function frame(dt) {
    const t0 = perf ? performance.now() : 0;
    windT += dt;
    push *= Math.exp(-dt / .9);
    sampleWind(windT);
    placeFog(dt * (.75 + .5 * meanWind));
    drawGrass(windT);
    if (perf) { perf.push(performance.now() - t0); if (perf.length % 60 === 0) report(); }
  }
  function report() {
    const a = perf.slice(30).sort((x, y) => x - y);              // the first second is warm-up
    if (!a.length) return;
    const mean = a.reduce((s, v) => s + v, 0) / a.length, p95 = a[Math.min(a.length - 1, Math.floor(a.length * .95))];
    document.documentElement.dataset.foldPerf = `n=${a.length} mean=${mean.toFixed(3)} p95=${p95.toFixed(3)} max=${a[a.length - 1].toFixed(3)} W=${W} H=${H} scale=${scale.toFixed(2)} items=${field.reduce((s, r) => s + r.items.length, 0)}`;
  }
  let ready = false;
  function setup() {
    hero.style.setProperty('--sh', scene.clientHeight + 'px');   // phones size Raiden to the scene (css)
    drawMoon();
    ready = build();
    if (!ready) return;
    windT = REDUCED ? STILL_T : windT || STILL_T;
    sampleWind(windT);
    placeFog(0);
    drawGrass(windT);
  }
  fogs.forEach(drawFog);
  setup();
  if (DEV && q.has('wind')) { windT = +q.get('wind'); sampleWind(windT); placeFog(0); drawGrass(windT); }   // dev: a composed instant (?wind=<seconds>)
  let rt = 0;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(setup, 120); }).observe(scene);
  if (REDUCED || !S) return;                                   // one still frame

  let onScreen = false, running = false;
  const tick = dt => { if (ready) frame(dt); };
  function sync() {
    const want = onScreen && !document.hidden;
    if (want && !running) { S.add(tick); running = true; }
    else if (!want && running) { S.remove(tick); running = false; }
  }
  new IntersectionObserver(es => { onScreen = es[es.length - 1].isIntersecting; sync(); }, { threshold: 0 }).observe(hero);
  document.addEventListener('visibilitychange', sync);
  // the cursor: a gentle local gust where it moves through the lower fold (fine pointers only)
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let lx = 0, lt = 0;
    hero.addEventListener('pointermove', e => {
      const sb = scene.getBoundingClientRect(), y = e.clientY - sb.top;
      if (y < sb.height * .45) return;
      const now = performance.now(), x = e.clientX - sb.left, v = Math.abs(x - lx) / Math.max(16, now - lt);
      lx = x; lt = now;
      pushX = x; push = Math.min(.32, push + v * .05);
    }, { passive: true });
  }
})();

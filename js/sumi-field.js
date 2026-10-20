/* SUMI v6 — the field: pampas grass drawn live as ASCII halftone, the hero's ground (canvas.field in .hero). The renderer still takes a second
   instance with a moon (the v5 footer: canvas.field-foot, denser, the moon drawn into it); since v6 the footer's field is ascii-magic's
   wind-grass piece instead (js/ascii, index.html), so that instance only runs when a .field-foot canvas is present.
   The picture is a height field, not rows of bars: three depth layers (near, mid, far), each a skyline of TUFTS along a world x — narrow
   bells of hashed height and width, taller than the air between them, so the top edge is a ragged line of sheaves — and a per-column
   density. A cell is grass when it lies under its layer's skyline; whether it is DRAWN is a halftone test (hash < coverage x density), and
   the coverage is never solid: there is air inside every blade, more toward the tip, so the blades thin into dots the way a halftone does.
   Every other column sits half a cell lower (the stagger kills the row banding). A blade is never a column of pipes: each tuft is a sheaf
   that fans (blades left of its centre lean left, blades right of it lean right), every blade has its own bend, and the wind
   (window.SUMI.wind, js/sumi.js) adds a lean per column = ambient + a travelling wave + the pointer gusts (window.SUMI.gusts), more at
   the tip than the root. The sum picks the glyph ('/' leaning with the wind, '\' against it, '|' only near upright) and shifts where a cell
   samples the skyline, so a gust bends the tufts over. Paint: per row, two brightness classes x two column parities = four fillText calls
   (~110 a frame at 1440), per-row precomputed layer tables, no per-blade objects. Runs inside the page's single frame loop at ~24 fps,
   only while the host is on screen; reduced motion = one still frame. */
(() => {
  'use strict';
  const S = window.SUMI;
  if (!S) return;
  const PAPER = '#e9e7e2', DPR = Math.min(1.5, devicePixelRatio || 1), FRAME = 1000 / 24;
  const R = new Float32Array(8192);
  { let seed = 1234567; for (let i = 0; i < 8192; i++) { seed = (seed * 16807) % 2147483647; R[i] = seed / 2147483647; } }
  const hash = (i, b) => R[(((i * 73 + b * 1021) % 8192) + 8192) % 8192];
  // layers, near -> far: g = ground (fraction of the rows; > 1 puts the nearest roots under the edge), hb = base height between tufts (rows),
  // gj = ground jitter (rows), h0..h1 = tuft peak (rows), sp0..sp1 = tuft spacing (cols), w0..w1 = tuft half-width (cols), k = how far a lean
  // of 1 shifts the tip per row, cov = the body's coverage (the halftone density inside a blade), root = the root glyphs
  const LAYERS = [
    { g: .98, hb: 2, gj: 2.4, h0: 9, h1: 18, sp0: 4, sp1: 9, w0: 1.4, w1: 3.2, k: .9, cov: .8, root: '%#', seed: 11 },
    { g: .66, hb: .7, gj: 2, h0: 4, h1: 9, sp0: 4, sp1: 8, w0: 1.2, w1: 2.8, k: .7, cov: .78, root: '|:', seed: 23 },
    { g: .42, hb: .5, gj: 1.6, h0: 1.8, h1: 4, sp0: 3, sp1: 7, w0: 1.5, w1: 3.5, k: .5, cov: .7, root: '::', seed: 37 },
  ];
  const WORLD = 2048;                                                         // skyline table length (world columns, wraps)

  function Field(canvas, host, opt) {
    const ctx = canvas.getContext('2d');
    const dens = opt.density || 1, moon = opt.moon || null;
    let cols = 0, rows = 0, cw = 7, ch = 14, W = 0, H = 0, laidOut = false, inView = false, acc = 0, t = 0, lastCost = 0;
    let lean = null, bump = null, rowAlpha = null, rowL = null, rowY = null, rowN = null;
    const sky = LAYERS.map(() => new Float32Array(WORLD)), den = LAYERS.map(() => new Float32Array(WORLD)), gnd = LAYERS.map(() => new Float32Array(WORLD));
    const fan = LAYERS.map(() => new Float32Array(WORLD)), bend = LAYERS.map(() => new Float32Array(WORLD));   // per world column: where it sits in its tuft (-1 left edge .. 1 right edge), its blade's own bend
    const lines = [];                                                         // [row][class 0 dim / 1 bright][parity]
    let moonX = 0, moonY = 0, moonR = 0;

    function skyline() {
      for (let l = 0; l < LAYERS.length; l++) {
        const L = LAYERS[l], h = sky[l], d = den[l], f = fan[l], b = bend[l];
        h.fill(L.hb); f.fill(0);
        for (let c = 0; c < WORLD; c++) { d[c] = (0.72 + 0.28 * hash(c, L.seed + 2)) * dens; gnd[l][c] = L.gj * hash(c * 3, L.seed + 5); b[c] = (hash(c * 5, L.seed + 7) - 0.5) * 0.56; }
        let x = hash(0, L.seed) * L.sp1;
        for (let n = 0; x < WORLD + 40; n++) {                                // tufts: a bell each, hashed peak / width / spacing
          const peak = L.h0 + (L.h1 - L.h0) * hash(n, L.seed), w = L.w0 + (L.w1 - L.w0) * hash(n, L.seed + 1);
          const c0 = Math.max(0, Math.floor(x - w * 2.2)), c1 = Math.min(WORLD - 1, Math.ceil(x + w * 2.2));
          for (let c = c0; c <= c1; c++) {
            const u = (c - x) / w, v = peak * Math.exp(-u * u * 1.4) + (hash(c, L.seed + 3) - 0.5) * 0.9 * (l === 0 ? 1.4 : 1);
            if (v > h[c]) { h[c] = v; f[c] = Math.max(-1, Math.min(1, u / 1.6)); }   // the tallest tuft owns the column: its blades fan from its centre
          }
          x += L.sp0 + (L.sp1 - L.sp0) * hash(n, L.seed + 4);
        }
      }
    }
    function layout() {
      const narrow = innerWidth <= 720;
      ch = narrow ? 9.5 : 11;                                                  // rows tighter than the glyph: the strokes of a blade connect
      const fs = narrow ? 11.2 : 13;
      ctx.font = fs + 'px "Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';
      cw = ctx.measureText('M').width || (narrow ? 6 : 7);
      W = host.clientWidth; H = Math.round(opt.height(host, narrow));
      cols = Math.ceil(W / cw) + 2; rows = Math.max(8, Math.floor(H / ch));
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.font = '10px sans-serif';
      ctx.font = fs + 'px "Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';
      ctx.textBaseline = 'alphabetic'; ctx.fillStyle = PAPER;
      lean = new Float32Array(cols); bump = new Float32Array(cols);
      rowAlpha = new Float32Array(rows);
      rowL = []; rowY = []; rowN = new Uint8Array(rows); lines.length = 0;
      for (let r = 0; r < rows; r++) {
        const v = r / (rows - 1);
        rowAlpha[r] = 0.42 + 0.58 * Math.pow(v, 1.2);                           // the horizon rows sink into the fog
        const ll = [], yl = [];
        for (let l = 0; l < LAYERS.length; l++) {
          const y = LAYERS[l].g * rows - 0.5 - r;                              // rows above this layer's ground (even columns; odd sit .5 lower)
          if (y >= -0.5 && y < LAYERS[l].h1 + LAYERS[l].gj + 1.5) { ll.push(l); yl.push(y); }
        }
        rowL.push(ll); rowY.push(yl); rowN[r] = ll.length;
        lines.push([['', ''], ['', '']]);
      }
      if (moon) { moonR = moon.r(narrow); moonY = moon.y(rows, narrow); if (!moonX) moonX = moon.x(W, narrow); }
      skyline();
      laidOut = true;
    }
    function leans(now, still) {
      const base = still ? 0.35 : S.wind.lean;
      bump.fill(0);
      if (!still && S.gusts && S.gusts.length) {
        const rect = canvas.getBoundingClientRect();
        for (const g of S.gusts) {
          const age = (now - g.t0) / 1000;
          if (age < 0 || age > 1.1) continue;
          const origin = (g.x - rect.left) / cw, pos = origin + age * 190, wdt = 7 + age * 70, amp = 1.15 * g.s * Math.exp(-age * 2.3);
          const c0 = Math.max(0, Math.floor(pos - wdt * 2)), c1 = Math.min(cols, Math.ceil(pos + wdt * 2));
          for (let c = c0; c < c1; c++) { const d = (c - pos) / wdt; bump[c] += amp * Math.exp(-d * d); }
          if (age < 0.25) {                                                    // the blades under the pointer bend first, before the wave leaves
            const c2 = Math.max(0, Math.floor(origin - 6)), c3 = Math.min(cols, Math.ceil(origin + 6));
            for (let c = c2; c < c3; c++) bump[c] += 0.6 * g.s * (1 - age / 0.25);
          }
        }
      }
      const tt = still ? 0 : t;
      for (let c = 0; c < cols; c++) lean[c] = base * 0.9 + 0.2 * Math.sin(c * 0.05 - tt * 2.4) + 0.09 * Math.sin(c * 0.13 + tt * 1.5) + bump[c];
    }
    function build() {
      const mx = moon ? moonX / cw : -1, my = moonY, mr = moon ? moonR / cw : 0, mry = moon ? moonR / ch : 0;
      const hazeR = moon ? Math.round(my + mry * 0.35) : -9;                   // the horizon haze: three rows at the moon's foot, across the whole width
      for (let r = 0; r < rows; r++) {
        const ll = rowL[r], yl = rowY[r], n = rowN[r], L4 = lines[r];
        let d0 = '', d1 = '', b0 = '', b1 = '';
        for (let c = 0; c < cols; c++) {
          const odd = c & 1;
          let g = ' ', bright = false;
          const Lc = lean[c];
          for (let i = 0; i < n; i++) {
            const l = ll[i], LY = LAYERS[l];
            let y = yl[i] - (odd ? 0.5 : 0);
            if (y < 0) continue;
            const wx = c - Lc * y * LY.k;
            const ci = ((Math.floor(wx) % WORLD) + WORLD) % WORLD;
            y -= gnd[l][ci];
            const h = sky[l][ci];
            if (y < 0 || y >= h) continue;
            const v = y / h, j = hash(c * 7 + r * 3, l + 40);
            // the blade's slant here: the sheaf's fan (left blades lean left, right blades right, more toward the tip), the wind (more at the
            // tip than the root), the blade's own bend. '/' past .2, '\' past -.2; the strip between is upright
            const sl = fan[l][ci] * 0.7 * (0.35 + 0.65 * v) + Lc * (0.15 + 0.6 * v) + bend[l][ci];
            if (h - y < 1) {                                                   // the tip: always drawn, bright
              bright = l < 2;
              g = l === 0 ? (h > 15 && j > 0.6 ? '*' : sl > 0.2 ? '`' : sl < -0.2 ? "'" : j > 0.5 ? "'" : '`') : l === 1 ? (sl > 0.2 ? '`' : "'") : (j > 0.5 ? '.' : ':');   // the plume only on the tallest tufts
            } else {
              const cov = (v < 0.5 ? LY.cov : LY.cov - (v - 0.5) * 0.8) * (l === 2 ? den[l][ci] * 0.7 : 0.8 + 0.2 * den[l][ci]);   // the halftone test: air inside every blade, the tips thinning to dots, the far layer a scatter
              if (hash(c * 13 + r * 29, l + 50) > cov) continue;
              bright = v > 0.5 && l < 2;
              if (v < 0.2) g = LY.root[j > 0.5 ? 0 : 1];
              else if (l === 2) g = j > 0.6 ? ':' : '.';
              else g = sl > 0.2 ? '/' : sl < -0.2 ? '\\' : j > 0.82 ? ':' : j > 0.7 ? '!' : '|';   // an upright blade is still not a bar: every fifth cell is a ':' or '!'
            }
            break;
          }
          if (g === ' ') {
            if (moon) {                                                        // the moon: a disc of lighter glyphs behind the grass (the near tufts stand across its foot)
              const dx = (c - mx) / mr, dy = (r + (odd ? 0.5 : 0) - my) / mry, q = dx * dx + dy * dy;
              if (q < 1.18) {
                const j = hash(c * 5 + r * 11, 77);
                if (q < 0.3) { g = j > 0.3 ? '@' : 'O'; bright = true; }
                else if (q < 0.6) { g = j > 0.45 ? 'O' : 'o'; bright = true; }
                else if (q < 0.84) { g = j > 0.35 ? 'o' : ':'; bright = j > 0.6; }
                else if (q < 1) { g = j > 0.3 ? ':' : '.'; }
                else if (j > 0.86) g = '.';                                    // the dim ring: a cell of haze around the disc
              }
              if (g === ' ' && r >= hazeR - 1 && r <= hazeR + 1 && hash(c * 3 + r * 17, 99) > (r === hazeR ? 0.86 : 0.93)) g = j2(c, r) > 0.5 ? ':' : '.';
            }
            if (g === ' ' && r < 2 && hash(c * 3 + r, 99) > 0.88) g = '.';     // the haze along the horizon
          }
          if (bright) { if (odd) { b1 += g; b0 += ' '; } else { b0 += g; b1 += ' '; } d0 += ' '; d1 += ' '; }
          else { if (odd) { d1 += g; d0 += ' '; } else { d0 += g; d1 += ' '; } b0 += ' '; b1 += ' '; }
        }
        L4[0][0] = d0; L4[0][1] = d1; L4[1][0] = b0; L4[1][1] = b1;
      }
    }
    const j2 = (c, r) => hash(c * 9 + r * 5, 88);
    function paint() {
      ctx.clearRect(0, 0, W, H);
      const by = ch * 0.8, half = ch * 0.5;
      for (let r = 0; r < rows; r++) {
        const y = r * ch + by, a = rowAlpha[r], L4 = lines[r];
        ctx.globalAlpha = a * 0.7; ctx.fillText(L4[0][0], 0, y); ctx.fillText(L4[0][1], 0, y + half);
        ctx.globalAlpha = a; ctx.fillText(L4[1][0], 0, y); ctx.fillText(L4[1][1], 0, y + half);
      }
      ctx.globalAlpha = 1;
    }
    function frame(dt, now) {
      t += dt;
      if (moon && dt > 0) { moonX += moon.drift * dt; if (moonX > W + moonR * 2) moonX = -moonR * 2; }   // the moon crosses over a visit (.6 px/s)
      leans(now, false); build(); paint();
    }
    function tick(dt, now) {
      if (!inView || !laidOut || S.REDUCED) return;
      acc += dt * 1000;
      if (acc < FRAME) return;
      const step = Math.min(0.1, acc / 1000); acc = 0;
      const t0 = performance.now();
      frame(step, now);
      lastCost = performance.now() - t0;
    }
    function stillFrame() { if (!laidOut) return; leans(0, true); build(); paint(); }
    function init() {
      layout();
      if (S.REDUCED) { stillFrame(); }
      else {
        frame(0, performance.now());
        S.add(tick);
        new IntersectionObserver(es => { inView = es.some(e => e.isIntersecting); if (inView) acc = FRAME; }, { threshold: 0 }).observe(host);
        const r = host.getBoundingClientRect(); inView = r.bottom > 0 && r.top < innerHeight;
      }
      const refresh = () => { layout(); S.REDUCED ? stillFrame() : frame(0, performance.now()); };
      if (document.fonts) { document.fonts.ready.then(refresh); document.fonts.addEventListener('loadingdone', refresh); }
      let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(refresh, 150); }, { passive: true });
    }
    // dev: the cost of a frame (leans + build + paint, synchronous), a mean over n frames in ms; stats() counts the glyphs of the last frame
    const api = { cost: () => lastCost, bench(n) { if (!laidOut) layout(); const t0 = performance.now(); for (let i = 0; i < n; i++) frame(1 / 24, performance.now()); return ((performance.now() - t0) / n).toFixed(2); }, get size() { return cols + 'x' + rows; },
      stats() { const m = {}; for (const L4 of lines) for (const cl of L4) for (const s of cl) for (const g of s) if (g !== ' ') m[g] = (m[g] || 0) + 1; return m; } };
    let started = false; const go = () => { if (!started) { started = true; init(); } };
    if (document.fonts && document.fonts.load) { document.fonts.load('12px "Share Tech Mono"').then(go, go); setTimeout(go, 1500); } else go();
    return api;
  }

  const hero = document.querySelector('.hero'), fc = hero && hero.querySelector('canvas.field');
  if (hero && fc) S.field = Field(fc, hero, { height: (h, narrow) => h.clientHeight * (narrow ? .38 : .5) });
  const art = document.querySelector('.foot .art'), ac = art && art.querySelector('canvas.field-foot');
  if (art && ac) S.fieldFoot = Field(ac, art, { height: h => h.clientHeight, density: 1.25,
    moon: { r: narrow => narrow ? 24 : 56, x: (W, narrow) => W * (narrow ? .2 : .16), y: (rows, narrow) => rows * (narrow ? .42 : .45), drift: 0.6 } });
})();

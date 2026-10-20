/* SUMI v4 — the hero field: a pampas field drawn live as ASCII halftone. A full-width glyph grid (7x14 px cells at 1440, 6x12 on phones;
   paper glyphs on sumi) renders a procedural field: six depth bands of blades, near -> far, each a row of blade "ids" along a world x with a
   hashed height; a cell is inside a blade when its height above the band's ground is under that blade's height. Density falls with
   distance (the far bands are thin ':' and '.', the near roots are '@%#'), the tips are ticks and seed heads, and the moon's haze is a
   scatter of '.' along the horizon row. The wind (window.SUMI.wind, js/sumi.js) leans the blades: a lean per column = ambient + a travelling
   wave + the pointer gusts (window.SUMI.gusts: a bump that starts at the pointer's column and travels right over ~.6 s); the lean shifts
   where a cell samples the blade row (tips displace further than roots) and picks the glyph ('|' upright, '/' leaning with the wind, '\'
   rebounding). One fillText per row (~30 a frame), per-row precomputed band tables, no per-blade objects. Runs inside the page's single
   frame loop at ~26 fps, only while the hero is on screen; reduced motion = one still frame. */
(() => {
  'use strict';
  const S = window.SUMI;
  const canvas = document.querySelector('canvas.field'), hero = document.querySelector('.hero');
  if (!S || !canvas || !hero) return;
  const ctx = canvas.getContext('2d');
  const PAPER = '#e9e7e2', DPR = Math.min(1.5, devicePixelRatio || 1), FRAME = 1000 / 26;
  const BODY = ' .:-=+*#%@';
  // bands, near -> far: g = ground (fraction of the rows; > 1 puts the nearest roots under the edge), h0..h1 = blade height (rows),
  // sp = blade spacing (cols), fill = the share of each spacing that is blade, w = the root glyph (BODY index), k = how far a lean of 1 shifts the tip per row
  const BANDS = [
    { g: 1.08, h0: 9, h1: 14, sp: 3.4, fill: .58, w: 9, k: .95 },
    { g: .86, h0: 6, h1: 9.5, sp: 2.6, fill: .6, w: 8, k: .85 },
    { g: .66, h0: 4, h1: 6.5, sp: 2.0, fill: .64, w: 6, k: .75 },
    { g: .49, h0: 2.5, h1: 4.2, sp: 1.5, fill: .68, w: 4, k: .62 },
    { g: .35, h0: 1.6, h1: 2.8, sp: 1.15, fill: .74, w: 3, k: .5 },
    { g: .24, h0: 1, h1: 1.9, sp: 1.0, fill: .7, w: 2, k: .4 },
  ];
  const R = new Float32Array(4096);
  { let seed = 1234567; for (let i = 0; i < 4096; i++) { seed = (seed * 16807) % 2147483647; R[i] = seed / 2147483647; } }
  const hash = (i, b) => R[(((i * 73 + b * 1021) % 4096) + 4096) % 4096];
  let cols = 0, rows = 0, cw = 7, ch = 14, W = 0, H = 0, laidOut = false, inView = false, acc = 0, t = 0, lastCost = 0;
  let lean = null, bump = null, rowAlpha = null, lines = null, rowBand = null, rowY = null, rowN = null;

  function layout() {
    const narrow = innerWidth <= 720;
    ch = narrow ? 12 : 14;
    const fs = narrow ? 11.2 : 13;
    ctx.font = fs + 'px "Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';
    cw = ctx.measureText('M').width || (narrow ? 6 : 7);
    W = hero.clientWidth; H = Math.round(hero.clientHeight * (narrow ? .35 : .45));
    cols = Math.ceil(W / cw) + 1; rows = Math.max(8, Math.floor(H / ch));
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.font = '10px sans-serif';
    ctx.font = fs + 'px "Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'alphabetic'; ctx.fillStyle = PAPER;
    lean = new Float32Array(cols); bump = new Float32Array(cols); lines = new Array(rows).fill('');
    rowAlpha = new Float32Array(rows);
    // per row: which bands reach it and the height above each band's ground (the tables the frame reads)
    rowBand = []; rowY = []; rowN = new Uint8Array(rows);
    for (let r = 0; r < rows; r++) {
      const v = r / (rows - 1);
      rowAlpha[r] = 0.22 + 0.78 * Math.pow(v, 1.1);                        // the horizon rows sink into the fog
      const bl = [], yl = [];
      for (let b = 0; b < BANDS.length; b++) {
        const y = BANDS[b].g * rows - 0.5 - r;                                // rows above this band's ground
        if (y >= 0 && y < BANDS[b].h1) { bl.push(b); yl.push(y); }
      }
      rowBand.push(bl); rowY.push(yl); rowN[r] = bl.length;
    }
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
    for (let r = 0; r < rows; r++) {
      const bl = rowBand[r], yl = rowY[r], n = rowN[r];
      let s = '';
      for (let c = 0; c < cols; c++) {
        let g = ' ';
        const L = lean[c];
        for (let i = 0; i < n; i++) {
          const b = bl[i], B = BANDS[b], y = yl[i];
          const wx = c - L * y * B.k;
          const id = Math.floor(wx / B.sp), frac = wx / B.sp - id;
          if (frac > B.fill) continue;
          const h = B.h0 + (B.h1 - B.h0) * hash(id, b);
          if (y >= h) continue;
          const j = hash(id, b + 7), lj = L + (j - 0.5) * 0.5;
          if (h - y < 1) {                                                   // the tip
            g = b >= 4 ? (j > 0.55 ? '*' : "'") : lj > 0.5 ? '`' : "'";
          } else {
            const v = y / h;
            if (v < 0.3 && b <= 2) g = BODY[B.w - (v < 0.15 ? 0 : 1)];       // the dense roots
            else if (b >= 4) g = j > 0.5 ? ':' : '.';
            else if (b === 3) g = lj > 0.55 ? '/' : j > 0.7 ? ':' : '|';
            else g = lj > 0.55 ? '/' : lj < -0.15 ? '\\' : j > 0.82 ? ':' : '|';
          }
          break;
        }
        if (g === ' ' && r < 2 && hash(c * 3 + r, 99) > 0.86) g = '.';        // the haze along the horizon
        s += g;
      }
      lines[r] = s;
    }
  }
  function paint() {
    ctx.clearRect(0, 0, W, H);
    const by = ch * 0.8;
    for (let r = 0; r < rows; r++) { ctx.globalAlpha = rowAlpha[r]; ctx.fillText(lines[r], 0, r * ch + by); }
    ctx.globalAlpha = 1;
  }
  function frame(dt, now) { t += dt; leans(now, false); build(); paint(); }
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
      new IntersectionObserver(es => { inView = es.some(e => e.isIntersecting); if (inView) acc = FRAME; }, { threshold: 0 }).observe(hero);
      inView = hero.getBoundingClientRect().bottom > 0;
    }
    const refresh = () => { layout(); S.REDUCED ? stillFrame() : frame(0, performance.now()); };
    if (document.fonts) { document.fonts.ready.then(refresh); document.fonts.addEventListener('loadingdone', refresh); }
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(refresh, 150); }, { passive: true });
  }
  // dev: the cost of a frame (leans + build + paint, synchronous), a mean over n frames in ms
  S.field = { cost: () => lastCost, bench(n) { if (!laidOut) layout(); const t0 = performance.now(); for (let i = 0; i < n; i++) frame(1 / 26, performance.now()); return ((performance.now() - t0) / n).toFixed(2); } };
  let started = false; const go = () => { if (!started) { started = true; init(); } };
  if (document.fonts && document.fonts.load) { document.fonts.load('12px "Share Tech Mono"').then(go, go); setTimeout(go, 1500); } else go();
})();

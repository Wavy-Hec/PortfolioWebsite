/* SUMI v3 — the About band: a live ASCII first-person scene, a minimal port of Neon Grid (ascii-city.html, github.com/Wavy-Hec/neon-grid).
   What is ported: the DDA march, the distance-shaded glyph ramp, the row-wise floor. What is not: the city generator, colour, the sheet
   atlas, sprites, bloom, input. A hand-authored walled courtyard with a gate; the camera drifts along a fixed loop (no WASD), the pointer
   steers the yaw by +-12 deg, and the page wind (window.SUMI.wind, see js/sumi.js) leans the far rows. Paper glyphs on sumi, one fillText
   per row (monospace: 42 calls a frame, not 4000). Runs inside the page's single frame loop (SUMI.add) at ~18 fps, only while the band is
   on screen; reduced motion = one still frame. */
(() => {
  'use strict';
  const S = window.SUMI;
  const canvas = document.querySelector('canvas.ascii'), band = document.querySelector('.band');
  if (!S || !canvas || !band) return;
  const ctx = canvas.getContext('2d');
  const RAMP = ' .:-=+*#%@|';                                        // 0 = bare sumi .. 9 = densest paper; 10 = a seam between wall tiles
  const MAP = [                                                      // '#' wall 1.25 high, 'B' block 0.95, 'P' gate post 1.7, '.' ground; the gate opens off the map
    '########################',
    '#......................#',
    '#..BBB..........BBBB...#',
    '#..BBB..........B..B...#',
    '#..BBB..........B..B...#',
    '#...............BBBB...#',
    '#......................#',
    '#..........B...........#',
    '#......................#',
    '#.....BB.........BB....#',
    '#.....BB.........BB....#',
    '#......................#',
    '#......................#',
    '#..BBBBB...............#',
    '#..B...B.....BBB.......#',
    '#..B...B.....B.B.......#',
    '#..BBBBB.....BBB.......#',
    '#......................#',
    '#......................#',
    '########P......P########',
  ];
  const MW = MAP[0].length, MH = MAP.length;
  const HEIGHT = { '#': 2.4, 'B': 1.7, 'P': 3.2 };
  const cell = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? '.' : MAP[y][x];
  // the walk: a closed Catmull-Rom loop through the yard, 0.5 u/s; the yaw follows the tangent plus a slow look-around
  const WAY = [[11.5, 17.5], [9.8, 11.8], [9, 6.8], [14, 5.2], [14.6, 8.6], [12.8, 12.2], [10.4, 14.8]];   // >= 0.9 u from every wall
  const SPEED = 0.5, FOV = 1.3, EYE = 0.55, FAR = 20;
  const PAPER = '#e9e7e2', DPR = Math.min(2, devicePixelRatio || 1), FRAME = 1000 / 18;
  let cols = 0, rows = 0, cw = 0, ch = 0, fs = 0, W = 0, H = 0, grid = null, offs = null;
  let t = 0, u = 0, yawCur = 0, yawCursor = 0, yawTarget = 0, inView = false, acc = 0, laidOut = false;
  const still = { x: 10, y: 12, a: 0.3 };                            // the reduced-motion frame: mid-yard, the near block right, the far hall ahead

  function layout() {
    const narrow = innerWidth <= 720;
    cols = narrow ? 60 : 96; rows = narrow ? 30 : 38;
    const pad = parseFloat(getComputedStyle(band).paddingLeft) || 0;
    const avail = Math.max(160, band.clientWidth - 2 * pad - (narrow ? 34 : 50));
    fs = Math.min(narrow ? 11 : 18, avail / cols / 0.54);           // Share Tech Mono advances ~0.54 em
    ctx.font = fs + 'px "Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';
    cw = ctx.measureText('M').width; ch = Math.round(fs * 1.06);
    W = Math.round(cw * cols); H = ch * rows;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    canvas.width = Math.round(W * DPR); canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.font = '10px sans-serif';                                    // a resize resets the context; force a fresh face resolution
    ctx.font = fs + 'px "Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'alphabetic'; ctx.fillStyle = PAPER;
    grid = new Uint8Array(cols * rows); offs = new Float32Array(rows);
    laidOut = true;
  }

  // closed Catmull-Rom: position and tangent at parameter u (one unit per segment)
  function spline(u, out) {
    const n = WAY.length, i = Math.floor(u) % n, f = u - Math.floor(u);
    const p0 = WAY[(i + n - 1) % n], p1 = WAY[i], p2 = WAY[(i + 1) % n], p3 = WAY[(i + 2) % n];
    const f2 = f * f, f3 = f2 * f;
    for (let k = 0; k < 2; k++) {
      const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
      out[k] = 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f2 + (3 * b - a - 3 * c + d) * f3);
      out[k + 2] = 0.5 * ((c - a) + 2 * (2 * a - 5 * b + 4 * c - d) * f + 3 * (3 * b - a - 3 * c + d) * f2);
    }
    return out;
  }
  const pose = [0, 0, 0, 0];
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // one frame of the scene into grid[]: a DDA per column, then wall / floor / sky per row (the Neon Grid march, without the stack)
  function render(px, py, ang, lean) {
    grid.fill(0);
    const dx = Math.cos(ang), dy = Math.sin(ang), plx = -dy * FOV * 0.5, ply = dx * FOV * 0.5;
    const horizon = rows * 0.52, proj = rows * 1.45;                 // rows per world unit at distance 1 (a narrow vertical field: the walls stand tall)
    for (let sx = 0; sx < cols; sx++) {
      const cam = 2 * sx / cols - 1, rx = dx + plx * cam, ry = dy + ply * cam;
      let mx = Math.floor(px), my = Math.floor(py);
      const ddx = rx === 0 ? 1e30 : Math.abs(1 / rx), ddy = ry === 0 ? 1e30 : Math.abs(1 / ry);
      let stx, sty, sdx, sdy;
      if (rx < 0) { stx = -1; sdx = (px - mx) * ddx; } else { stx = 1; sdx = (mx + 1 - px) * ddx; }
      if (ry < 0) { sty = -1; sdy = (py - my) * ddy; } else { sty = 1; sdy = (my + 1 - py) * ddy; }
      let side = 0, dist = 0, tile = '.';
      for (let n = 0; n < 64; n++) {
        if (sdx < sdy) { dist = sdx; sdx += ddx; mx += stx; side = 0; } else { dist = sdy; sdy += ddy; my += sty; side = 1; }
        if (mx < 0 || my < 0 || mx >= MW || my >= MH) { dist = FAR; break; }   // through the gate: open ground to the horizon
        tile = MAP[my][mx];
        if (tile !== '.') break;
        if (dist > FAR) { dist = FAR; break; }
      }
      const hgt = HEIGHT[tile];
      let top = horizon, bottom = horizon;
      if (hgt) {
        const d = Math.max(0.05, dist);
        top = horizon - (hgt - EYE) * proj / d; bottom = horizon + EYE * proj / d;
        const wu = side ? px + dist * rx : py + dist * ry, uu = wu - Math.floor(wu);   // texture u along the face
        const shade = Math.max(0, 1 - d / 13) * (side ? 0.78 : 1);
        const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(rows, Math.ceil(bottom));
        const span = Math.max(1, bottom - top), courses = tile === 'P' ? 12 : tile === '#' ? 9 : 6;
        const edge = uu < 0.07 || uu > 0.93;                        // the tile seam: a darker joint
        for (let y = y0; y < y1; y++) {
          const v = (y + 0.5 - top) / span;                        // 0 at the wall top .. 1 at its foot
          let k = Math.round(shade * 7.4);                          // the broad face tops out at '*': a near wall is texture, not a slab
          const line = (v * courses) % 1 < 0.16;                   // stone courses
          if (line) k -= 2;
          const g = hash(mx * 8 + Math.floor(uu * 8) + my * 1000, Math.floor(v * courses));
          k += g > 0.72 ? 1 : g < 0.2 ? -1 : 0;                      // grain, both ways
          if (tile === 'P' && v < 0.06) k = 9;                      // the capstone on the gate posts
          if (edge && d < 11 && !line) k = 10;                      // the seam: a bar where one tile meets the next
          grid[y * cols + sx] = k < 0 ? 0 : k > 10 ? 10 : k;
        }
      }
      // floor: each row below the wall foot is a distance; flagstones from the world point
      const fy0 = Math.max(Math.ceil(bottom), Math.floor(horizon) + 1);
      for (let y = fy0; y < rows; y++) {
        const fd = EYE * proj / (y + 0.5 - horizon);
        const wx = px + rx * fd, wy = py + ry * fd;
        const fx = (wx * 0.5) % 1, fyy = (wy * 0.5) % 1;           // flagstones two units wide
        const near = Math.max(0, 1 - fd / 12);
        let k = near * near * 3.0;
        const joint = (fx > 0 && fx < 0.1) || (fyy > 0 && fyy < 0.1);
        if (joint) k = near * 2.6 + 0.4;                            // the joints carry the perspective
        else if (hash(Math.floor(wx * 2), Math.floor(wy * 2)) > 0.84) k += 0.8;   // a few rougher stones
        else if (hash(Math.floor(wx * 3) + 7, Math.floor(wy * 3)) > 0.3) k -= 1.2;   // most of a stone is quiet
        grid[y * cols + sx] = k < 0.5 ? 0 : k > 4 ? 4 : Math.round(k);
      }
    }
    // the wind: the rows near the horizon (the far ones) lean with the gust
    for (let y = 0; y < rows; y++) offs[y] = lean * cw * 0.55 * Math.max(0, 1 - Math.abs(y - horizon) / horizon);
  }
  function paint() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 0.92;
    const by = ch * 0.78;
    for (let y = 0; y < rows; y++) {
      let s = '', any = false;
      for (let x = 0; x < cols; x++) { const k = grid[y * cols + x]; s += RAMP[k]; if (k) any = true; }
      if (any) ctx.fillText(s, offs[y], y * ch + by);
    }
    ctx.globalAlpha = 1;
  }
  function frame(dt) {
    t += dt;
    u += dt * SPEED * 0.55;                                          // ~0.55 segments a second across the loop
    spline(u, pose);
    const head = Math.atan2(pose[3], pose[2]) + Math.sin(t * 0.21) * 0.16;
    let da = head - yawCur; da = Math.atan2(Math.sin(da), Math.cos(da));
    yawCur += da * Math.min(1, dt * 1.6);
    yawCursor += (yawTarget - yawCursor) * Math.min(1, dt * 4);
    render(pose[0], pose[1], yawCur + yawCursor, S.wind.lean);
    paint();
  }
  // the page loop calls this every tick; the scene draws at ~18 fps, only while the band is on screen
  let lastCost = 0;
  function tick(dt) {
    if (!inView || !laidOut || S.REDUCED) return;
    acc += dt * 1000;
    if (acc < FRAME) return;
    const step = Math.min(0.12, acc / 1000); acc = 0;
    const t0 = performance.now();
    frame(step);
    lastCost = performance.now() - t0;
  }
  function stillFrame() { if (!laidOut) return; render(still.x, still.y, still.a, 0); paint(); }

  function init() {
    layout();
    if (S.REDUCED) { stillFrame(); }
    else {
      spline(0, pose); yawCur = Math.atan2(pose[3], pose[2]);
      frame(0);                                                      // a first frame before the scroll reaches it
      S.add(tick);
      band.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; const r = canvas.getBoundingClientRect(); yawTarget = ((e.clientX - r.left) / r.width - 0.5) * 0.42; }, { passive: true });
      band.addEventListener('pointerleave', () => { yawTarget = 0; }, { passive: true });
      new IntersectionObserver(es => { inView = es.some(e => e.isIntersecting); if (inView) acc = FRAME; }, { threshold: 0.02, rootMargin: '80px 0px' }).observe(band);
      const rect = () => { const r = band.getBoundingClientRect(); inView = r.bottom > -80 && r.top < innerHeight + 80; };
      rect(); addEventListener('scroll', rect, { passive: true });
    }
    if (document.fonts) {
      const refont = () => { layout(); S.REDUCED ? stillFrame() : (render(pose[0], pose[1], yawCur + yawCursor, S.wind.lean), paint()); };
      document.fonts.ready.then(refont);
      document.fonts.addEventListener('loadingdone', refont);
    }
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); S.REDUCED ? stillFrame() : (render(pose[0], pose[1], yawCur + yawCursor, S.wind.lean), paint()); }, 150); }, { passive: true });
  }
  // dev: the cost of a frame, measured in place (render + paint, synchronous): a mean over n frames in ms
  S.city = { cost: () => lastCost, bench(n) { if (!laidOut) layout(); const t0 = performance.now(); for (let i = 0; i < n; i++) frame(1 / 18); return ((performance.now() - t0) / n).toFixed(2); } };
  let started = false; const go = () => { if (!started) { started = true; init(); } };
  if (document.fonts && document.fonts.load) { document.fonts.load('12px "Share Tech Mono"').then(go, go); setTimeout(go, 1500); } else go();
})();

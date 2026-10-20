/* SUMI v2 — the petal wind, the ASCII Raiden that reacts, the footer A/B switch, and the secret (140.85 → codec call → Shadow Moses). */
(() => {
  'use strict';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // dev: any uncaught error surfaces in the title so a headless --dump-dom can see it
  addEventListener('error', e => { document.title = 'WF-ERR ' + e.message; });
  addEventListener('unhandledrejection', e => { document.title = 'WF-ERR ' + (e.reason && e.reason.message || e.reason); });
  const q = new URLSearchParams(location.search);
  const gameOpen = () => document.body.classList.contains('game-open');

  /* ---------- footer variant: ?footer=a (grass, default) | ?footer=b (shinkawa) | ?footer=both (stacked, captions on) ----------
     The markup ships with B and the captions hidden, so a URL without the switch (or without JS) has exactly one footer landmark. */
  {
    const f = q.get('footer');
    const foots = document.querySelectorAll('.foot'), devs = document.querySelectorAll('.dev');
    if (f === 'both') { foots.forEach(x => { x.hidden = false; }); devs.forEach(d => { d.hidden = false; }); }
    else if (f === 'b') {
      foots.forEach(x => { x.hidden = x.dataset.art !== 'shinkawa'; if (x.dataset.art === 'shinkawa') x.id = 'contact'; else x.removeAttribute('id'); });
      const a = document.getElementById('codec-launch'); if (a) a.removeAttribute('id');
      const b = document.querySelector('.foot[data-art="shinkawa"] .freq'); if (b) b.id = 'codec-launch';
    }
  }

  /* ---------- motion 1: the petal wind. Raiden's red petals, blown down-right across the whole page, behind the ink. ----------
     One fixed canvas, <= 24 petals, three hand-drawn petal paths, a sin-based gust (no Math.random per frame), a tumble, and the
     scroll velocity as a gust of its own. 30 fps, timer-paced; sleeps when the tab is hidden, while the game is open, and under
     reduced motion (nothing is drawn at all). */
  (() => {
    const canvas = document.querySelector('canvas.petals');
    if (!canvas || REDUCED) return;
    const ctx = canvas.getContext('2d');
    const RED = '#c9333a', DPR = Math.min(2, devicePixelRatio || 1), FRAME_MS = 1000 / 30;
    // three petals, unit-sized (about 1 x 1), tip at the top: a cherry petal with its notch, a narrow leaf, a teardrop
    const SHAPES = [
      new Path2D('M0 -.5C.34 -.46 .52 -.14 .44 .22 .38 .44 .14 .52 0 .4-.14 .52-.38 .44-.44 .22-.52-.14-.34-.46 0-.5Z'),
      new Path2D('M0 -.5C.26 -.3 .28 .3 0 .5-.28 .3-.26-.3 0-.5Z'),
      new Path2D('M0 -.5C.42 -.22 .36 .34 0 .5-.2 .3-.3-.22 0-.5Z'),
    ];
    let W = 0, H = 0, petals = [], raf = 0, timer = 0, prev = 0, seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // seeded, used only at spawn
    const count = () => Math.min(24, Math.max(8, Math.round(W * H / 72000)));

    function resize() {
      W = innerWidth; H = innerHeight;
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const n = count();
      while (petals.length < n) petals.push(spawn({}, true));
      petals.length = n;
    }
    function spawn(p, fresh) {
      p.size = 10 + rnd() * 9;                      // px, the long axis
      p.shape = SHAPES[Math.floor(rnd() * SHAPES.length)];
      p.vx = 55 + rnd() * 60;                       // px/s at wind 1: down-right, mostly right
      p.vy = 22 + rnd() * 34;
      p.rot = rnd() * Math.PI * 2;
      p.spin = (rnd() - 0.5) * 2.6;                 // rad/s tumble
      p.phase = rnd() * Math.PI * 2;
      p.sway = 10 + rnd() * 16;                     // px of side-to-side lift
      p.alpha = 0.6 + rnd() * 0.35;
      if (fresh) { p.x = rnd() * W; p.y = rnd() * H; }
      else if (rnd() < 0.6) { p.x = rnd() * W * 0.45 - 20; p.y = -20; }   // enter at the top-left...
      else { p.x = -20; p.y = rnd() * H * 0.6; }                           // ...or the left edge
      return p;
    }
    // scroll = wind: the scroll velocity (px/s, smoothed) adds to the gust for a moment
    let lastY = scrollY, scrollV = 0;
    addEventListener('scroll', () => { const y = scrollY; scrollV += (y - lastY); lastY = y; }, { passive: true });

    function draw(dt, now) {
      ctx.clearRect(0, 0, W, H);
      scrollV *= Math.exp(-dt * 3);                                   // decays in ~1/3 s
      const gust = 0.75 + 0.35 * Math.sin(now / 5200) + 0.15 * Math.sin(now / 1700 + 1.3);
      const wind = gust + Math.min(2.2, Math.abs(scrollV) * 0.004);
      const lift = Math.sign(scrollV) * Math.min(1, Math.abs(scrollV) * 0.003); // scrolling down pushes them up the screen a touch, like a draught
      ctx.fillStyle = RED;
      for (const p of petals) {
        p.x += p.vx * wind * dt;
        p.y += (p.vy * wind - lift * 40) * dt + Math.cos(now / 900 + p.phase) * p.sway * dt;
        p.rot += p.spin * dt * (0.6 + 0.4 * wind);
        if (p.x > W + 24 || p.y > H + 24 || p.y < -80) spawn(p, false);
        const s = p.size * (0.85 + 0.15 * Math.sin(now / 400 + p.phase));   // a little tilt toward / away from the eye
        ctx.setTransform(DPR * s * 0.62, 0, 0, DPR * s, 0, 0);               // 0.62: petals are narrower than long
        ctx.translate(p.x / (s * 0.62), p.y / s);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.alpha;
        ctx.fill(p.shape);
      }
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.globalAlpha = 1;
    }
    function loop(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - prev) / 1000 || 0.016); prev = now;
      draw(dt, now);
      timer = setTimeout(() => { timer = 0; raf = requestAnimationFrame(loop); }, Math.max(0, FRAME_MS - (performance.now() - now)));
    }
    function start() { if (raf || timer || document.hidden || gameOpen()) return; prev = performance.now(); raf = requestAnimationFrame(loop); }
    function stop() { cancelAnimationFrame(raf); clearTimeout(timer); raf = 0; timer = 0; }

    resize();
    document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
    addEventListener('gameopen', stop);
    addEventListener('gameclose', start);
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); }, { passive: true });
    start();
  })();

  /* ---------- motion 2: the ASCII Raiden on a canvas. Resolves from noise once (~1.2 s), then reacts to the pointer. ----------
     The grid comes from tools/ascii-face.py (inlined as <script type="text/plain" class="ascii-grid">). Each cell is a ramp index
     ('@' = 0 densest .. ' ' = 9). The settled image is painted once. Under the pointer a lens (~90 px) steps the glyphs up the
     ramp (3.5 steps at the centre) and brightens them; moving (or a tap) sends one crest outward — a narrow gaussian ring at
     d = 170 px/s * age, fading over ~1 s — that only ever adds ink. Empty cells wake too (to ':' / '-', never denser), so the
     ring and the lens read on the bare sumi, not just on the figure. Each frame repaints just the cells the lens and the rings touch. */
  (() => {
    const RAMP = '@#%*+=-:. ', RESOLVE_MS = 1200, RIPPLE_MS = 1000, REACH = 170, NEAR = 90;
    const canvas = document.querySelector('canvas.ascii');
    const band = document.querySelector('.band');
    if (!canvas || !band) return;
    const grids = {};
    document.querySelectorAll('script.ascii-grid').forEach(s => { grids[s.dataset.cols] = s.textContent.replace(/^\n|\n$/g, '').split('\n'); });
    const ctx = canvas.getContext('2d');
    const PAPER = '#e9e7e2', DPR = Math.min(2, devicePixelRatio || 1);
    const FREEZE = q.has('t') ? parseFloat(q.get('t')) * 1000 : null;   // ?t=0.5 freezes the resolve mid-way (screenshots)
    let cols = 0, rows = 0, idx = null, cw = 0, ch = 0, fs = 0, W = 0, H = 0;
    let resolveT0 = 0, resolved = REDUCED, fired = false;
    const ripples = [];                                                  // rings: {x, y, t0}, newest last
    const lens = { x: 0, y: 0, on: false, left: -1e9 };                  // the pointer; after it leaves, the lens fades over ~300 ms
    let dirty = null;                                                    // [x0, y0, x1, y1] in cells, the area the last frame touched

    function layout() {
      const narrow = innerWidth <= 720;
      const g = grids[narrow ? '60' : '96'] || grids['96'];
      if (!g) return false;
      const rowsText = g; cols = rowsText[0].length; rows = rowsText.length;
      idx = new Uint8Array(cols * rows);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const k = RAMP.indexOf(rowsText[y][x] || ' '); idx[y * cols + x] = k < 0 ? 9 : k; }
      const avail = Math.max(120, band.clientWidth - (narrow ? 66 : 2 * 24 + 2) - 2 * parseFloat(getComputedStyle(band).paddingLeft));
      fs = Math.min(narrow ? 6.2 : 7, avail / cols) / 0.54;               // Share Tech Mono: advance ~0.54 em; the grid was sampled at that aspect
      fs = Math.min(fs, (narrow ? 560 : 800) / rows);                      // ...and the figure is tall (74 rows): never past ~800 px
      ctx.font = fs + 'px "Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';
      cw = ctx.measureText('M').width; ch = fs;                           // the cell is exactly one advance wide and one em tall
      W = Math.round(cw * cols); H = Math.round(ch * rows);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.font = '10px sans-serif';                                        // resizing resets the context; the throwaway value forces a fresh
      ctx.font = fs + 'px "Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';   // resolution (a same-string set can keep a cached fallback face)
      ctx.textBaseline = 'alphabetic'; ctx.fillStyle = PAPER;
      return true;
    }
    const hash = (i, f) => ((Math.imul(i + 1, 2654435761) ^ Math.imul(f + 1, 40503)) >>> 0) % 7;   // cheap per-cell, per-frame noise

    // paints the cells in [x0,x1) x [y0,y1) for time t; the resolve and the ripples both pass through here
    function paint(x0, y0, x1, y1, now) {
      ctx.clearRect(x0 * cw, y0 * ch, (x1 - x0) * cw, (y1 - y0) * ch);
      const rt = resolved ? Infinity : now - resolveT0;
      const f = Math.floor(now / 33);
      const live = ripples.filter(r => now - r.t0 < RIPPLE_MS);
      const lensA = lens.on ? 1 : Math.max(0, Math.exp(-(now - lens.left) / 300) - 0.02);
      // baseline at 0.76 em: every ramp glyph's ink then stays inside its own cell, so a partial repaint's clearRect never
      // chips the neighbours (with textBaseline 'top' the lower dot of ':' hung into the row below and got erased)
      for (let y = y0; y < y1; y++) {
        const py = y * ch, cy = py + ch / 2, by = py + ch * 0.76;
        for (let x = x0; x < x1; x++) {
          const i = y * cols + x;
          let k = idx[i];
          let a = 0.94;
          if (rt < RESOLVE_MS) {                                           // settle: top rows first, each cell at its own moment, noise +-2 steps before
            const settle = (0.25 * (y / rows) + 0.75 * (hash(i, 0) / 6)) * RESOLVE_MS;
            if (rt < settle) { k = Math.min(9, Math.max(0, k + (hash(i, f) % 5) - 2)); a = 0.7; }
          }
          if (live.length || lensA > 0) {
            const cx = x * cw + cw / 2;
            let shift = 0, glow = 0;
            if (lensA > 0) {
              const dx = cx - lens.x, dy = cy - lens.y, d = Math.sqrt(dx * dx + dy * dy);
              if (d < NEAR) { const n = 1 - d / NEAR, sm = n * n * (3 - 2 * n); shift += sm * 3.5 * lensA; glow += sm * lensA; }
            }
            for (const r of live) {
              const dx = cx - r.x, dy = cy - r.y, d = Math.sqrt(dx * dx + dy * dy);
              if (d > REACH) continue;
              const age = now - r.t0, u = (d - age * 0.17) / 13;                           // one crest, 13 px wide, rolling outward at 170 px/s
              shift += Math.exp(-u * u) * Math.exp(-age / 600) * (1 - 0.5 * d / REACH) * 5.5;   // fades with age (and a little with distance): the ring outgrows the lens, then thins
            }
            if (shift > 0.35) {
              if (k === 9) { k = Math.max(6, Math.round(9 - shift * 0.85)); }   // empty cells wake only as far as '-'
              else { k = Math.max(0, Math.round(k - shift)); }
              a = Math.min(1, 0.94 + glow * 0.06 + shift * 0.02);
            }
          }
          if (k >= 9) continue;
          ctx.globalAlpha = a;
          ctx.fillText(RAMP[k], x * cw, by);
        }
      }
      ctx.globalAlpha = 1;
    }
    function paintAll(now) { paint(0, 0, cols, rows, now); dirty = null; }
    function activeBounds(now) {                                         // the cells the lens and the live rings can touch, or null
      const live = ripples.filter(r => now - r.t0 < RIPPLE_MS);
      const lensA = lens.on || now - lens.left < 1200;
      if (!live.length && !lensA) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (x, y, r) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
      for (const r of live) add(r.x, r.y, REACH);
      if (lensA) add(lens.x, lens.y, NEAR);
      return [Math.max(0, Math.floor(x0 / cw)), Math.max(0, Math.floor(y0 / ch)), Math.min(cols, Math.ceil(x1 / cw) + 1), Math.min(rows, Math.ceil(y1 / ch) + 1)];
    }
    // 30 fps on a plain timer (no rAF): a text canvas repainted every 33 ms is indistinguishable from a frame-locked one, the
    // renderer idles between paints, and the loop keeps running where rAF is starved (headless capture, some embedded views).
    let timer = 0;
    function tick() {
      timer = 0;
      const now = performance.now();
      if (!resolved) {
        if (now - resolveT0 >= RESOLVE_MS) resolved = true;
        paintAll(now);
      } else {
        const b = activeBounds(now);
        if (dirty) paint(dirty[0], dirty[1], dirty[2], dirty[3], now);    // repaint what the last frame touched (settles it back)
        if (b) paint(b[0], b[1], b[2], b[3], now);
        dirty = b;
        if (!b) { ripples.length = 0; return; }                            // quiet: stop the loop until the next pointer event
        if (!ripples.some(r => now - r.t0 < RIPPLE_MS) && lens.on && !lens.moved) return;   // the pointer rests: the lens is painted, sleep until it moves
        lens.moved = false;
      }
      timer = setTimeout(tick, Math.max(0, 33 - (performance.now() - now)));
    }
    const run = () => { if (!timer && !document.hidden) timer = setTimeout(tick, 0); };
    function play() {
      if (fired) return; fired = true;
      layout();                                                            // re-resolve the face right before the first paint
      if (REDUCED) { paintAll(performance.now()); return; }
      resolveT0 = performance.now();
      if (FREEZE !== null) { resolved = false; resolveT0 = performance.now() - FREEZE; paintAll(performance.now()); resolved = true; return; }
      run();
    }
    function pointer(e) {
      if (REDUCED || !resolved) return;
      const r = canvas.getBoundingClientRect(), now = performance.now();
      const x = (e.clientX - r.left) * (W / r.width), y = (e.clientY - r.top) * (H / r.height);
      if (e.type === 'pointerleave') { lens.on = false; lens.left = now; run(); return; }
      lens.x = x; lens.y = y; lens.on = true; lens.moved = true;
      const last = ripples[ripples.length - 1];
      if (e.type === 'pointerdown' || !last || now - last.t0 > 160) {      // a ring every 160 ms while moving, one per tap
        ripples.push({ x, y, t0: now });
        if (ripples.length > 6) ripples.shift();
      }
      run();
    }

    if (!layout()) return;
    const init = () => {
      layout();
      // the font stylesheet is async: when Share Tech Mono lands (or already has), lay out and paint again in the right face
      // (a canvas keeps whatever face it resolved at paint time; the static reduced-motion paint needs this as much as the live one)
      if (document.fonts) {
        const refont = () => { layout(); if (fired) paintAll(performance.now()); };
        document.fonts.ready.then(refont);
        document.fonts.addEventListener('loadingdone', refont);
      }
      if (REDUCED) { play(); return; }
      new IntersectionObserver((es, io) => { if (es.some(e => e.isIntersecting)) { io.disconnect(); play(); } }, { threshold: 0.3 }).observe(band);
      // belt and braces: an IO notification can lag a jump-scroll (anchor links, restored scroll positions); a cheap rect check on scroll covers it
      const inView = () => { if (fired) return; const r = band.getBoundingClientRect(); if (r.bottom > innerHeight * 0.3 && r.top < innerHeight * 0.7) play(); };
      addEventListener('scroll', inView, { passive: true }); inView();
      const poll = setInterval(() => { inView(); if (fired) clearInterval(poll); }, 400);   // ...and a slow poll for views that starve scroll/IO events
      canvas.addEventListener('pointermove', pointer, { passive: true });
      canvas.addEventListener('pointerdown', pointer, { passive: true });
      canvas.addEventListener('pointerleave', pointer, { passive: true });
      document.addEventListener('visibilitychange', () => { if (!document.hidden && fired) run(); });
      let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); if (fired) paintAll(performance.now()); }, 150); }, { passive: true });
    };
    // the glyphs must be Share Tech Mono: wait for it (the stylesheet loads async), but never more than 1.5 s
    let started = false; const go = () => { if (!started) { started = true; init(); } };
    if (document.fonts && document.fonts.load) { document.fonts.load('12px "Share Tech Mono"').then(go, go); setTimeout(go, 1500); } else go();
  })();

  /* ---------- the secret: 140.85 · Konami · the frequency button → codec call → Shadow Moses ---------- */
  // Ported from js/script.js (openGame / launchGame / playCodecRing / Konami / dial) by copy, not by loading it.
  let gameScriptRequested = false;
  function status(msg) { const el = document.getElementById('live-status'); if (el) el.textContent = msg; }
  function openGame() {
    if (window.MGSGame) { window.MGSGame.open(); return; }
    if (gameScriptRequested) return;
    gameScriptRequested = true;
    const s = document.createElement('script');
    s.src = 'js/game.js?v=13';
    s.onload = () => { if (window.MGSGame) window.MGSGame.open(); };
    s.onerror = () => { gameScriptRequested = false; status('codec link failed — try again'); };
    document.body.appendChild(s);
  }
  function launchGame() {
    const alertMark = document.createElement('div');
    alertMark.className = 'mgs-alert';
    alertMark.textContent = '!';
    alertMark.setAttribute('aria-hidden', 'true');
    document.body.appendChild(alertMark);
    setTimeout(() => alertMark.remove(), 1600);
    status('Incoming codec call — opening mini-game');
    playCodecRing();
    setTimeout(openGame, 650);                          // the dramatic beat covers the fetch
  }
  let codecRingCtx = null;
  function playCodecRing() {
    try {
      if (!codecRingCtx) codecRingCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = codecRingCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const beep = (t, freq, dur) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur);
      };
      const t0 = ctx.currentTime;
      [0, 0.12, 0.32, 0.44].forEach((off, i) => beep(t0 + off, i % 2 ? 1245 : 1660, 0.09));
    } catch (e) {}
  }
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let konamiPos = 0, dialBuffer = '';
  const inField = t => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  document.addEventListener('keydown', (e) => {
    if (inField(e.target)) { konamiPos = 0; return; }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    konamiPos = (k === KONAMI[konamiPos]) ? konamiPos + 1 : (k === KONAMI[0] ? 1 : 0);
    if (konamiPos === KONAMI.length) { konamiPos = 0; launchGame(); }
  });
  document.addEventListener('keydown', (e) => {
    if (inField(e.target) || e.key.length !== 1) return;
    dialBuffer = (dialBuffer + e.key).slice(-6);
    if (dialBuffer === '140.85') {
      dialBuffer = '';
      document.querySelectorAll('.freq').forEach(btn => { btn.classList.add('dialed'); setTimeout(() => btn.classList.remove('dialed'), 1300); });
      launchGame();                                     // the old site only rang; now the dial answers
    }
  });
  document.querySelectorAll('.freq').forEach(btn => btn.addEventListener('click', launchGame));
})();

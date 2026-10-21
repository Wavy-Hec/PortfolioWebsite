/* SUMI v7 — the research stack: four isometric plates drawn as a halftone dot grid, cursor-lit. Each plate is a field of N x N paper dots on
   sumi whose SIZE carries the tone (as the ascii-magic dots do: one colour, the dot grows with the light): a static isometric shading (a
   lighter centre, a bright rim along the edges, a hashed grain) plus a soft light that follows the cursor (a gaussian spot, sigma 50 px at 600 wide; the dots under it brighten and grow up to x1.8);
   the plate's thickness is two dim rows of dots under its front edges; a dotted beam joins the plates with a bright cap; sparks (<= 40)
   lift off the plate edges as short vertical dashes, drift up and fade in ~1.5 s. The plates slide apart from a collapsed stack the first time they are seen (.9 s, eased),
   once their chapter has settled; the names arrive after (css .exploded). The buttons (.pl, laid over each plate by layout()) are the
   controls: hover or focus lights the plate and shows its line, a focused plate pulls the light to its centre, click / Enter / Space holds it
   (.lit, aria-pressed); the active plate's tag turns full paper (css). Reduced motion: already apart, no sparks, no light, one still frame
   (hover / focus still brightens the plate by a direct redraw). Draws inside the page's one frame loop at ~30 fps, subscribed only while on screen;
   every dot is an arc on one of 12 radius-bucketed Path2Ds, so a frame is 12 fills. */
(() => {
  'use strict';
  const S = window.SUMI;
  const wrap = document.querySelector('.stack'), canvas = wrap && wrap.querySelector('canvas'), btns = wrap ? [...wrap.querySelectorAll('.pl')] : [];
  if (!S || !canvas || btns.length !== 4) return;
  const ctx = canvas.getContext('2d');
  const PAPER = '#e9e7e2', DPR = Math.min(2, devicePixelRatio || 1), FRAME = 1000 / 30;
  const N = 22, GAP = 64, SIGMA = 50, BUCKETS = 16, R0 = 0.55, DR = 0.26;   // dots per plate side, the exploded spacing (design px at 600 wide), the light's sigma (a spot, not a plate-wide brighten), the radius buckets
  let W = 0, H = 0, k = 1, gap = GAP, cx = 0, hw = 0, hh = 0, yBase = 0, laidOut = false, inView = false, acc = 0, lastCost = 0;
  let exp = S.REDUCED ? 1 : 0, expT0 = null, exploded = S.REDUCED, hot = -1, pointerIn = false, focused = -1;
  const light = { x: 0, y: 0, a: 0, tx: 0, ty: 0, ta: 0 };
  const held = [false, false, false, false];
  const grain = new Float32Array(N * N * 4);
  { let seed = 4321; for (let i = 0; i < grain.length; i++) { seed = (seed * 16807) % 2147483647; grain[i] = seed / 2147483647; } }
  const sparks = []; let seed2 = 99; const rnd = () => (seed2 = (seed2 * 16807) % 2147483647) / 2147483647;
  const ease = v => v < 0 ? 0 : v > 1 ? 1 : v * v * (3 - 2 * v);
  const plateY = (i, e) => yBase - i * (gap * k * e + 6 * k * (1 - e));   // the centre y of plate i at explosion e (0 = a stack, 1 = apart)

  function layout() {
    W = Math.max(120, wrap.clientWidth); k = W / 600;                    // never a zero width: k steps the beam's loop
    gap = Math.max(GAP, 42 / k);                                         // a narrow stack spreads its plates: every plate's band is 42 px or more, a finger's width
    const extra = 3 * (gap - GAP) * k;                                   // ... and the drawing grows by what that adds, so the top plate keeps its air
    H = Math.round(372 * k + extra);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx = 170 * k; hw = 120 * k; hh = 40 * k; yBase = 302 * k + extra;
    btns.forEach(b => {                                                   // the button spans its plate and the label's run to the right of it
      const i = +b.dataset.k, cy = plateY(i, 1);                           // data-k: the plate's index from the bottom (the buttons are listed top to bottom, in reading order)
      const bh = Math.min(hh * 2 + 12, gap * k - 2);                     // never taller than the plates' spacing: no two buttons' hit areas overlap
      b.style.left = (cx - hw) + 'px'; b.style.top = Math.round(cy - bh / 2) + 'px'; b.style.width = Math.round(W - (cx - hw)) + 'px'; b.style.height = Math.round(bh) + 'px';
      b.style.paddingLeft = Math.round(hw * 2 + (W < 400 ? 12 : 22)) + 'px';             // a 360 phone: the label column starts 12 px past the plate, so VISION-LANGUAGE MODEL fits
      const nm = b.querySelector('.name'), lh = nm ? parseFloat(getComputedStyle(nm).lineHeight) || 16 : 16;
      b.style.paddingTop = Math.max(0, Math.round(bh / 2 - lh / 2)) + 'px';             // the name's first line (its paper square) sits on the plate's leader; a wrapped line or the caption hangs below
    });
    laidOut = true;
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const e = ease(exp), base = Math.max(1.2, Math.min(2.4, 2.1 * k)), lx = light.x, ly = light.y, la = light.a, s2 = 2 * SIGMA * SIGMA * k * k;
    const paths = []; for (let b = 0; b < BUCKETS; b++) paths.push(new Path2D());
    const dot = (x, y, v, l = 0) => {                                      // v 0..1 -> a radius bucket (the tone is the size); l = the light here, which enlarges the dot up to x1.8 at the centre
      const r = base * (0.22 + 0.78 * (v > 1 ? 1 : v)) * (1 + 0.8 * l), b = Math.min(BUCKETS - 1, Math.max(0, Math.round((r - R0) / DR))), rr = R0 + b * DR, p = paths[b];
      p.moveTo(x + rr, y); p.arc(x, y, rr, 0, 6.2832);
    };
    const lit = (x, y) => la > 0.01 ? la * Math.exp(-((x - lx) * (x - lx) + (y - ly) * (y - ly)) / s2) : 0;
    for (let i = 3; i >= 0; i--) {
      const cy = plateY(i, e), act = i === hot || held[i] ? 0.14 : 0;
      for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {           // the top face: u along the right-going edge, v along the left-going one
        const u = (a + 0.5) / N, v = (b + 0.5) / N, x = cx + (u - v) * hw, y = cy + (u + v - 1) * hh;
        const edge = Math.min(a, b, N - 1 - a, N - 1 - b) === 0 ? 0.34 : 0;
        const tone = 0.08 + 0.1 * grain[(i * N * N + a * N + b) % grain.length] + 0.14 * (1 - Math.abs(u - 0.5) * 2) * (1 - Math.abs(v - 0.5) * 2) + edge + act;
        const l = lit(x, y); dot(x, y, tone + 0.6 * l, l);
      }
      for (let s = 1; s <= 2; s++) for (let a = 0; a < N; a++) {           // the thickness: two rows under the two front edges
        const u = (a + 0.5) / N, dy = s * 3.4 * k;
        const x1 = cx - hw + u * hw, y1 = cy + u * hh + dy, x2 = cx + u * hw, y2 = cy + (1 - u) * hh + dy;
        const l1 = lit(x1, y1), l2 = lit(x2, y2); dot(x1, y1, 0.1 + 0.4 * l1, l1); dot(x2, y2, 0.1 + 0.4 * l2, l2);
      }
      for (let n = 0; n < 4; n++) dot(cx + hw + (8 + n * 6) * k, cy, 0.16 * e);   // the lead to the name
    }
    const top = plateY(3, e) - hh - 26 * k, bot = plateY(0, e) - 2 * k;    // the beam: a dotted vertical through the plates' centres, a bright cap
    for (let y = bot; y > top; y -= 5.5 * k) { const l = lit(cx, y); dot(cx, y, 0.18 + 0.4 * l, l); }
    dot(cx, top, 0.9); dot(cx - 4 * k, top + 3 * k, 0.3); dot(cx + 4 * k, top + 3 * k, 0.3);
    ctx.fillStyle = PAPER; ctx.globalAlpha = 0.92;
    for (const p of paths) ctx.fill(p);
    if (sparks.length) {                                                   // the sparks: short vertical dashes (two dot pitches tall) rising off the rims, each its own alpha
      for (const sp of sparks) { ctx.globalAlpha = 0.9 * (1 - sp.age / sp.life); ctx.fillRect(sp.x - 0.7 * k, sp.y - sp.h, 1.4 * k, sp.h); }
    }
    ctx.globalAlpha = 1;
  }
  function spawn(now) {
    const i = Math.floor(rnd() * 4), cy = plateY(i, ease(exp)), u = rnd(), left = rnd() < 0.5;
    sparks.push({ x: left ? cx - hw + u * hw : cx + u * hw, y: left ? cy + u * hh : cy + (1 - u) * hh, vx: (rnd() - 0.5) * 6 * k, vy: -(14 + rnd() * 18) * k, h: (7 + rnd() * 5) * k, age: 0, life: 1.2 + rnd() * 0.6 });
  }
  let spawned = 0, steps = 0, lastDt = 0;                                   // dev counters
  function step(dt, now) {
    steps++; lastDt = dt;
    if (expT0 !== null && exp < 1) { exp = Math.min(1, (now - expT0) / 900); if (exp >= 1 && !exploded) { exploded = true; wrap.classList.add('exploded'); } }
    const f = 1 - Math.exp(-dt * 10);
    light.x += (light.tx - light.x) * f; light.y += (light.ty - light.y) * f; light.a += (light.ta - light.a) * (1 - Math.exp(-dt * 6));
    if (!inView || !laidOut) return;
    if (exploded && sparks.length < 40 && rnd() < dt * 11) { spawn(now); spawned++; }
    for (let i = sparks.length - 1; i >= 0; i--) { const sp = sparks[i]; sp.age += dt; if (sp.age >= sp.life) { sparks.splice(i, 1); continue; } sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.vx += (rnd() - 0.5) * 20 * k * dt; }
    acc += dt * 1000; if (acc < FRAME) return; acc = 0;
    const c0 = performance.now(); draw(); lastCost = performance.now() - c0;
  }
  // the light follows the pointer over the stack (the buttons sit on it); it fades when the pointer leaves; a focused plate pulls it to its centre
  const rect = () => canvas.getBoundingClientRect();
  wrap.addEventListener('pointermove', e => { const r = rect(); light.tx = e.clientX - r.left; light.ty = e.clientY - r.top; light.ta = 1; pointerIn = true; }, { passive: true });
  wrap.addEventListener('pointerleave', () => { pointerIn = false; if (focused < 0) light.ta = 0; });
  btns.forEach(b => {
    const i = +b.dataset.k;
    const on = () => { hot = i; if (S.REDUCED) draw(); }, off = () => { if (hot === i) hot = -1; if (S.REDUCED) draw(); };
    b.addEventListener('pointerenter', on); b.addEventListener('pointerleave', off);
    b.addEventListener('focus', () => { focused = i; on(); light.tx = cx; light.ty = plateY(i, 1); light.ta = 1; if (!exploded) { expT0 = performance.now() - 900; exp = 1; exploded = true; wrap.classList.add('exploded'); inView = true; draw(); } });   // keyboard focus before the stack has exploded: apart at once, so the control is never invisible
    b.addEventListener('blur', () => { focused = -1; off(); if (!pointerIn) light.ta = 0; });
    b.addEventListener('click', () => { held[i] = !held[i]; b.classList.toggle('lit', held[i]); b.setAttribute('aria-pressed', held[i] ? 'true' : 'false'); if (S.REDUCED) draw(); });
  });
  layout();
  if (S.REDUCED) { wrap.classList.add('exploded'); light.a = 0; draw(); }
  else {
    draw();
    // subscribed to the page's loop only while the stack is on screen, so the loop can sleep elsewhere on the page
    let running = false;
    const go = () => setTimeout(() => { expT0 = performance.now(); }, 250);
    const io = new IntersectionObserver(es => {
      inView = es[es.length - 1].isIntersecting;
      if (inView && !running) { running = true; S.add(step); } else if (!inView && running) { running = false; S.remove(step); }
      if (inView && expT0 === null) go();
    }, { threshold: 0.25 });
    io.observe(wrap);
  }
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); draw(); }, 160); }, { passive: true });
  // dev (local hosts only): a frame's cost; bench(n); at(e, lx, ly) sets the explosion and the light for screenshots
  if (S.DEV) S.stack = { cost: () => lastCost, get inView() { return inView; }, get exploded() { return exploded; }, get dev() { return { spawned, steps, lastDt }; }, bench(n) { const a = performance.now(); for (let i = 0; i < n; i++) draw(); return ((performance.now() - a) / n).toFixed(2); },
    at(e, lx, ly, a) { exp = e; if (e >= 1) { exploded = true; wrap.classList.add('exploded'); } if (lx !== undefined) { light.x = light.tx = lx; light.y = light.ty = ly; light.a = light.ta = a === undefined ? 1 : a; } inView = true; draw(); }, sparks };
})();

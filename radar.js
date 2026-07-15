// Soliton Radar — MGS2-style sweep radar, fixed bottom-right HUD.
// Player blip sits at center; the mouse position maps to a tracked blip; a few
// ambient blips drift and "ping" brighter as the sweep line passes over them.
// Adapts its ink colour to the active theme (blue in light, green in codec) and
// goes static under prefers-reduced-motion. Hidden on small screens.
// Per-theme modes: starwars renders an X-wing targeting computer; gotham
// renders a GCPD bat-signal searchlight. Any other theme gets the soliton sweep.
(() => {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Live breakpoint check (not one-shot): the radar appears if the viewport
  // grows past 600px (e.g. phone rotated to landscape) and the draw loop
  // stops while the CSS breakpoint hides it — no drawing into a hidden canvas.
  const smallScreen = window.matchMedia('(max-width: 600px)');

  const SIZE = 132;
  const R = SIZE / 2;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const wrap = document.createElement('div');
  wrap.className = 'soliton-radar';
  wrap.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  wrap.appendChild(canvas);
  const label = document.createElement('span');
  label.className = 'soliton-label';
  label.textContent = 'SOLITON';
  wrap.appendChild(label);
  document.body.appendChild(wrap);

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // --- theme-aware ink colour (soliton mode: blue in light, green in codec) ---
  let ink = [47, 84, 204];
  function readInk() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
    const m = v.match(/^#?([0-9a-f]{6})$/i);
    if (m) ink = [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  }
  const rgba = a => `rgba(${ink[0]},${ink[1]},${ink[2]},${a})`;

  // --- fixed palettes for the themed modes (independent of CSS variables) ---
  const AMBER = a => `rgba(240,168,50,${a})`;   // starwars --ink
  const HOLO  = a => `rgba(74,168,255,${a})`;   // starwars --sw-holo
  const GOLD  = a => `rgba(245,197,24,${a})`;   // gotham signal yellow

  // --- render mode, selected by theme ---
  const MODE_LABEL = { soliton: 'SOLITON', targeting: 'TARGETING', signal: 'GCPD SIGNAL' };
  let mode = 'soliton';
  function applyMode() {
    const t = document.documentElement.dataset.theme;
    mode = t === 'starwars' ? 'targeting' : t === 'gotham' ? 'signal' : 'soliton';
    label.textContent = MODE_LABEL[mode];
    readInk();
    draw(0); // instant repaint on switch; also the static frame under reduced motion
  }
  window.addEventListener('themechange', applyMode);

  // --- mouse → radar coords (relative to viewport centre, clamped) ---
  let mx = 0, my = 0;
  window.addEventListener('mousemove', (e) => {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  // --- ambient blips ---
  const blips = [];
  for (let i = 0; i < 3; i++) {
    blips.push({
      a: (i / 3) * Math.PI * 2,
      r: 0.35 + i * 0.18,
      spd: (0.2 + i * 0.12) * (i % 2 ? 1 : -1),
    });
  }

  let sweep = 0;

  // --- targeting-computer state (starwars) ---
  let tickAngle = 0;
  const swTargets = [                       // ambient orbiting contacts
    { a: 1.1, r: 0.58, spd: 0.00016 },
    { a: 4.4, r: 0.82, spd: -0.00021 },
  ];

  // --- bat-signal state (gotham) ---
  const BAT_ANGLE = -Math.PI / 2;
  let coneAngle = BAT_ANGLE;    // start on the bat: static frame = signal lit
  let cloudAngle = 0;
  let cloudCanvas = null, signalGrad = null;
  function buildSignalAssets() {
    signalGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, R);
    signalGrad.addColorStop(0, GOLD(0.55));
    signalGrad.addColorStop(0.75, GOLD(0.18));
    signalGrad.addColorStop(1, GOLD(0.04));
    cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = cloudCanvas.height = SIZE * dpr;
    const c = cloudCanvas.getContext('2d');
    c.scale(dpr, dpr);
    let seed = 9;   // deterministic blotches — same sky every visit
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 14; i++) {
      const x = rnd() * SIZE, y = rnd() * SIZE, r = 12 + rnd() * 22;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(200,200,210,0.10)');
      g.addColorStop(1, 'rgba(200,200,210,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
  }

  function drawBat(x, y, alpha) {   // ~26x12px silhouette, dark against the beam
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(-13, -1);
    ctx.quadraticCurveTo(-8, 3.5, -3.5, 3.2);   // left underside scallop
    ctx.quadraticCurveTo(-1.6, 3.4, 0, 6);      // centre tail point
    ctx.quadraticCurveTo(1.6, 3.4, 3.5, 3.2);
    ctx.quadraticCurveTo(8, 3.5, 13, -1);       // right underside → wingtip
    ctx.quadraticCurveTo(6, -3.4, 3, -3);       // right wing top edge
    ctx.lineTo(1.8, -6);                        // right ear
    ctx.lineTo(0.8, -3.4);
    ctx.lineTo(-0.8, -3.4);
    ctx.lineTo(-1.8, -6);                       // left ear
    ctx.lineTo(-3, -3);
    ctx.quadraticCurveTo(-6, -3.4, -13, -1);
    ctx.closePath();
    ctx.fillStyle = `rgba(5,6,8,${0.92 * alpha})`;
    ctx.fill();
    ctx.restore();
  }

  function blipDot(x, y) {
    let bright = 0.5;
    if (!REDUCED) {
      const ang = Math.atan2(y, x);
      const d = Math.abs(((sweep - ang + Math.PI) % (Math.PI * 2)) - Math.PI);
      bright = 0.45 + 0.55 * Math.max(0, 1 - d / 0.8);
    }
    ctx.beginPath();
    ctx.arc(x, y, 2.3, 0, Math.PI * 2);
    ctx.fillStyle = rgba(bright);
    ctx.fill();
  }

  function drawSoliton(dt) {
    if (!REDUCED) { sweep += dt * 0.0023; if (sweep > Math.PI * 2) sweep -= Math.PI * 2; }

    // dish backdrop
    ctx.beginPath(); ctx.arc(0, 0, R - 1, 0, Math.PI * 2);
    ctx.fillStyle = rgba(0.05); ctx.fill();

    // concentric rings
    ctx.lineWidth = 1; ctx.strokeStyle = rgba(0.28);
    for (const rr of [R - 2, R * 0.66, R * 0.33]) { ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke(); }

    // crosshair
    ctx.beginPath();
    ctx.moveTo(-R + 2, 0); ctx.lineTo(R - 2, 0);
    ctx.moveTo(0, -R + 2); ctx.lineTo(0, R - 2);
    ctx.strokeStyle = rgba(0.16); ctx.stroke();

    // rotating sweep (trailing wedge + leading line)
    if (!REDUCED) {
      const seg = 18, span = 0.55;
      for (let i = 0; i < seg; i++) {
        const a1 = sweep - i * (span / seg);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R - 2, a1 - 0.035, a1);
        ctx.closePath();
        ctx.fillStyle = rgba(0.20 * (1 - i / seg));
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(sweep) * (R - 2), Math.sin(sweep) * (R - 2));
      ctx.strokeStyle = rgba(0.6); ctx.lineWidth = 1.5; ctx.stroke();
    }

    // player blip (you, at centre)
    ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = rgba(0.95); ctx.fill();

    // tracked cursor blip
    blipDot(Math.max(-1, Math.min(1, mx)) * (R - 9), Math.max(-1, Math.min(1, my)) * (R - 9));

    // ambient blips
    for (const b of blips) {
      if (!REDUCED) b.a += b.spd * dt * 0.001;
      blipDot(Math.cos(b.a) * b.r * (R - 9), Math.sin(b.a) * b.r * (R - 9));
    }
  }

  function drawTargeting(dt) {
    if (!REDUCED) tickAngle += dt * 0.0005;   // full rotation ~12.5s

    // console panel backdrop + hairline frame
    ctx.fillStyle = 'rgba(13,17,22,0.72)';
    ctx.fillRect(-R + 1, -R + 1, SIZE - 2, SIZE - 2);
    ctx.lineWidth = 1; ctx.strokeStyle = AMBER(0.28);
    ctx.strokeRect(-R + 1.5, -R + 1.5, SIZE - 3, SIZE - 3);

    // corner brackets (static) — 4 L-shapes, 14px arms, 6px inset
    ctx.lineWidth = 1.5; ctx.strokeStyle = AMBER(0.75);
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const ox = sx * (R - 6), oy = sy * (R - 6);
      ctx.moveTo(ox - sx * 14, oy);
      ctx.lineTo(ox, oy);
      ctx.lineTo(ox, oy - sy * 14);
    }
    ctx.stroke();

    // concentric angular guides (static): amber square + holo diamond
    ctx.lineWidth = 1;
    ctx.strokeStyle = AMBER(0.30);
    ctx.strokeRect(-26, -26, 52, 52);
    ctx.strokeStyle = HOLO(0.25);
    ctx.beginPath();
    ctx.moveTo(0, -36); ctx.lineTo(36, 0); ctx.lineTo(0, 36); ctx.lineTo(-36, 0);
    ctx.closePath(); ctx.stroke();

    // slow-rotating tick ring on a faint guide circle
    ctx.beginPath(); ctx.arc(0, 0, 45.5, 0, Math.PI * 2);
    ctx.strokeStyle = AMBER(0.22); ctx.stroke();
    ctx.save(); ctx.rotate(tickAngle);
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      ctx.moveTo(c * 43, s * 43); ctx.lineTo(c * 48, s * 48);
    }
    ctx.strokeStyle = AMBER(0.5); ctx.stroke();
    ctx.restore();

    // crosshair with a centre gap
    ctx.beginPath();
    ctx.moveTo(-R + 8, 0); ctx.lineTo(-9, 0);
    ctx.moveTo(9, 0);      ctx.lineTo(R - 8, 0);
    ctx.moveTo(0, -R + 8); ctx.lineTo(0, -9);
    ctx.moveTo(0, 9);      ctx.lineTo(0, R - 8);
    ctx.strokeStyle = AMBER(0.35); ctx.stroke();

    // centre range gate
    ctx.lineWidth = 1.5; ctx.strokeStyle = AMBER(0.8);
    ctx.strokeRect(-8, -8, 16, 16);

    // ambient contacts (open holo squares, orbiting)
    ctx.lineWidth = 1.2;
    for (const t of swTargets) {
      if (!REDUCED) t.a += t.spd * dt;
      const x = Math.cos(t.a) * t.r * (R - 12), y = Math.sin(t.a) * t.r * (R - 12);
      ctx.strokeStyle = HOLO(0.8);
      ctx.strokeRect(x - 3, y - 3, 6, 6);
    }

    // primary target tracks the cursor (mirrors soliton's tracked blip);
    // static frame (reduced motion / first paint) shows it centred and locked
    const tx = Math.max(-1, Math.min(1, mx)) * (R - 12);
    const ty = Math.max(-1, Math.min(1, my)) * (R - 12);
    const locked = Math.abs(tx) < 9 && Math.abs(ty) < 9;
    ctx.strokeStyle = locked ? AMBER(0.95) : HOLO(0.9);
    ctx.strokeRect(tx - 3, ty - 3, 6, 6);
    if (locked) {           // amber lock chevrons outside the gate corners
      ctx.strokeStyle = AMBER(0.9); ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-13, -7); ctx.lineTo(-13, -13); ctx.lineTo(-7, -13);
      ctx.moveTo(7, -13);  ctx.lineTo(13, -13);  ctx.lineTo(13, -7);
      ctx.moveTo(13, 7);   ctx.lineTo(13, 13);   ctx.lineTo(7, 13);
      ctx.moveTo(-7, 13);  ctx.lineTo(-13, 13);  ctx.lineTo(-13, 7);
      ctx.stroke();
    }
  }

  function drawSignal(dt) {
    if (!cloudCanvas) buildSignalAssets();
    if (!REDUCED) {
      coneAngle += dt * 0.00042;                 // full sweep ~15s
      if (coneAngle > BAT_ANGLE + Math.PI * 2) coneAngle -= Math.PI * 2;
      cloudAngle += dt * 0.00006;                // barely-drifting cloud deck
    }

    // night-sky disc
    ctx.beginPath(); ctx.arc(0, 0, R - 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6,7,10,0.9)'; ctx.fill();

    // clip to the disc for clouds/beam/bat
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, R - 2, 0, Math.PI * 2); ctx.clip();

    // rotating cloud wash (one drawImage)
    ctx.save(); ctx.rotate(cloudAngle);
    ctx.drawImage(cloudCanvas, -R, -R, SIZE, SIZE);
    ctx.restore();

    // searchlight: soft halo wedge + bright core wedge, shared radial falloff
    for (const [span, alphaScale] of [[0.55, 0.5], [0.26, 1]]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, coneAngle - span / 2, coneAngle + span / 2);
      ctx.closePath();
      ctx.globalAlpha = alphaScale;
      ctx.fillStyle = signalGrad;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // bat silhouette revealed as the beam crosses 12 o'clock
    const d = Math.abs(((coneAngle - BAT_ANGLE + Math.PI) % (Math.PI * 2)) - Math.PI);
    const reveal = Math.max(0, 1 - d / 0.5);
    if (reveal > 0.02) drawBat(0, -R * 0.52, reveal);

    ctx.restore();   // unclip

    // rim + searchlight housing
    ctx.beginPath(); ctx.arc(0, 0, R - 1, 0, Math.PI * 2);
    ctx.lineWidth = 1; ctx.strokeStyle = GOLD(0.35); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = GOLD(0.9); ctx.fill();
  }

  function draw(dt) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.translate(R, R);
    if (mode === 'targeting') drawTargeting(dt);
    else if (mode === 'signal') drawSignal(dt);
    else drawSoliton(dt);
    ctx.restore();
  }

  let raf = null, prev = 0;
  const FRAME_MS = 1000 / 30; // decorative sweep doesn't need 60fps
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - prev < FRAME_MS) return;
    const dt = now - prev; prev = now;
    draw(dt);
  }
  function start() {
    if (raf === null && !REDUCED && !document.hidden && !smallScreen.matches) {
      prev = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }
  function stop() { if (raf !== null) { cancelAnimationFrame(raf); raf = null; } }
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());

  const onBreakpoint = () => {
    if (smallScreen.matches) { stop(); } else { draw(0); start(); }
  };
  if (smallScreen.addEventListener) smallScreen.addEventListener('change', onBreakpoint);
  else if (smallScreen.addListener) smallScreen.addListener(onBreakpoint); // older Safari

  applyMode(); // mode + label from the current theme; its draw(0) is the static first frame
  start();
})();

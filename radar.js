// Soliton Radar — MGS2-style sweep radar, fixed bottom-right HUD.
// Player blip sits at center; the mouse position maps to a tracked blip; a few
// ambient blips drift and "ping" brighter as the sweep line passes over them.
// Adapts its ink colour to the active theme (blue in light, green in codec) and
// goes static under prefers-reduced-motion. Hidden on small screens.
// Per-theme modes: starwars renders an X-wing targeting computer; gotham
// renders a GCPD bat-signal TRACKER: a rooftop skyline, a sweeping signal
// beam projecting the bat emblem on the cloud deck, and a patrolling Batman
// blip the beam periodically locks onto. Any other theme gets the soliton sweep.
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
  const AMBER = a => `rgba(240,168,50,${a})`;   // starwars lock/warning only
  const HOLO  = a => `rgba(74,168,255,${a})`;   // starwars --sw-holo
  const GOLD  = a => `rgba(212,175,106,${a})`;  // gotham deco gold #d4af6a
  const PALE  = a => `rgba(236,224,200,${a})`;  // pale warm searchlight

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

  // --- bat-signal tracker state (gotham) ---
  const SIG_O = { x: 0, y: 60 };                 // searchlight origin, hidden behind skyline
  const SIG_BASE = -1.6406, SIG_AMP = 0.6632;    // sweep centre -94deg, amplitude 38deg
  const SWEEP_MS = 11000;                        // full left-right-left period
  const WAYPOINTS = [[-25, 28], [-8, 16], [10, 24], [27, 12]];  // rooftop patrol points
  const BLIP_SPEED = 0.011;                      // px per ms
  const GRAY = a => `rgba(176,168,153,${a})`;    // warm-gray instrument/trail ink
  let sigT = 0;                                  // gotham-mode clock (ms, dt-accumulated)
  let blipX = 10, blipY = 24;                    // starts ON W2 -> static frame is the lock
  let wpIndex = 3, wpDir = 1;                    // next target W3, then ping-pong back
  let pauseUntil = 900;                          // frozen in the light at t=0
  let lockStart = -300, lockUntil = 900;         // mid-lock at t=0 (static frame shows it)
  let lockCooldown = 4900;                       // no re-lock until sigT > this
  let lockGlow = 1;                              // eased 0..1, drives emblem/beam brightness
  let beamAngle = Math.atan2(24 - 60, 10 - 0);   // = -1.3003 rad, pointing at the blip
  let cloudShift = 0;
  let lastTrail = 0;
  const trail = [];                              // ring buffer, max 14 {x,y}
  for (let i = 0; i < 8; i++) trail.push({ x: -8 + 18 * (i / 8), y: 16 + 8 * (i / 8) }); // seeded W1->W2 so the static frame shows a trail
  let skyCanvas = null, cityCanvas = null, beamGrad = null, skyGrad = null;
  const angDiff = (a, b) => ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  function beamRim(ang) {   // distance from SIG_O to circle r=58 along ang (emblem ray)
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const od = SIG_O.x * dx + SIG_O.y * dy;
    return -od + Math.sqrt(Math.max(0, od * od - (SIG_O.x * SIG_O.x + SIG_O.y * SIG_O.y) + 58 * 58));
  }

  function buildSignalAssets() {
    // beam gradient, centred on the searchlight origin
    beamGrad = ctx.createRadialGradient(SIG_O.x, SIG_O.y, 2, SIG_O.x, SIG_O.y, 115);
    beamGrad.addColorStop(0, PALE(0.5));
    beamGrad.addColorStop(0.55, PALE(0.17));
    beamGrad.addColorStop(1, PALE(0.02));

    skyGrad = ctx.createLinearGradient(0, -R, 0, R);   // disc-spanning red sky
    skyGrad.addColorStop(0, '#360c11');
    skyGrad.addColorStop(0.55, '#22080d');
    skyGrad.addColorStop(1, '#12060a');

    // sky: thinned red cloud texture (8 blotches, was 14),
    // sky band only, drawn 3x per blotch (x, x-SIZE, x+SIZE) so horizontal drift tiles seamlessly
    skyCanvas = document.createElement('canvas');
    skyCanvas.width = skyCanvas.height = SIZE * dpr;
    const s = skyCanvas.getContext('2d'); s.scale(dpr, dpr);
    let seed = 9;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 8; i++) {
      const x = rnd() * SIZE, y = 10 + rnd() * 50, r = 10 + rnd() * 18;
      for (const ox of [x, x - SIZE, x + SIZE]) {
        const g = s.createRadialGradient(ox, y, 0, ox, y, r);
        g.addColorStop(0, 'rgba(196,84,92,0.08)');
        g.addColorStop(1, 'rgba(196,84,92,0)');
        s.fillStyle = g;
        s.beginPath(); s.arc(ox, y, r, 0, Math.PI * 2); s.fill();
      }
    }

    // city: fixed hand-authored roofline, baked once (center-origin via translate)
    cityCanvas = document.createElement('canvas');
    cityCanvas.width = cityCanvas.height = SIZE * dpr;
    const c = cityCanvas.getContext('2d'); c.scale(dpr, dpr); c.translate(R, R);
    const ROOFS = [ // {x, w, top}: rects from roof top down past the disc bottom
      { x: -66, w: 18, top: 26 }, { x: -48, w: 16, top: 16 }, { x: -32, w: 14, top: 30 },
      { x: -18, w: 20, top: 18 }, { x: 2, w: 16, top: 26 }, { x: 18, w: 18, top: 14 },
      { x: 36, w: 30, top: 22 },
    ];
    c.fillStyle = 'rgba(0,0,0,0.98)';
    for (const b of ROOFS) c.fillRect(b.x, b.top, b.w, 66 - b.top);
    c.lineWidth = 1; c.strokeStyle = GRAY(0.30);            // 1px roof-edge highlight
    c.beginPath();
    for (const b of ROOFS) { c.moveTo(b.x, b.top + 0.5); c.lineTo(b.x + b.w, b.top + 0.5); }
    c.stroke();
    c.strokeStyle = GRAY(0.35);                             // two antennas
    c.beginPath();
    c.moveTo(-40, 16); c.lineTo(-40, 9);
    c.moveTo(27, 14);  c.lineTo(27, 5);
    c.stroke();
    c.fillStyle = GOLD(0.6);                                // antenna tip light
    c.beginPath(); c.arc(27, 4.5, 0.8, 0, Math.PI * 2); c.fill();
    c.fillStyle = GOLD(0.4);                                // 7 lit windows, fixed
    for (const [wx, wy] of [[-58,32],[-42,22],[-26,38],[-12,26],[8,34],[24,20],[44,30]])
      c.fillRect(wx, wy, 1.5, 2);
  }

  function drawBat(x, y, alpha, s = 1) {   // ~26x12px silhouette, dark against the beam
    ctx.save(); ctx.translate(x, y);
    ctx.scale(s, s);
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
    ctx.fillStyle = `rgba(0,0,0,${0.92 * alpha})`;
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
    ctx.fillStyle = 'rgba(6,10,18,0.72)';
    ctx.fillRect(-R + 1, -R + 1, SIZE - 2, SIZE - 2);
    ctx.lineWidth = 1; ctx.strokeStyle = HOLO(0.30);
    ctx.strokeRect(-R + 1.5, -R + 1.5, SIZE - 3, SIZE - 3);

    // corner brackets (static) — 4 L-shapes, 14px arms, 6px inset
    ctx.lineWidth = 1.5; ctx.strokeStyle = HOLO(0.75);
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const ox = sx * (R - 6), oy = sy * (R - 6);
      ctx.moveTo(ox - sx * 14, oy);
      ctx.lineTo(ox, oy);
      ctx.lineTo(ox, oy - sy * 14);
    }
    ctx.stroke();

    // concentric angular guides (static): holo square + holo diamond
    ctx.lineWidth = 1;
    ctx.strokeStyle = HOLO(0.30);
    ctx.strokeRect(-26, -26, 52, 52);
    ctx.strokeStyle = HOLO(0.25);
    ctx.beginPath();
    ctx.moveTo(0, -36); ctx.lineTo(36, 0); ctx.lineTo(0, 36); ctx.lineTo(-36, 0);
    ctx.closePath(); ctx.stroke();

    // slow-rotating tick ring on a faint guide circle
    ctx.beginPath(); ctx.arc(0, 0, 45.5, 0, Math.PI * 2);
    ctx.strokeStyle = HOLO(0.22); ctx.stroke();
    ctx.save(); ctx.rotate(tickAngle);
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      ctx.moveTo(c * 43, s * 43); ctx.lineTo(c * 48, s * 48);
    }
    ctx.strokeStyle = HOLO(0.5); ctx.stroke();
    ctx.restore();

    // crosshair with a centre gap
    ctx.beginPath();
    ctx.moveTo(-R + 8, 0); ctx.lineTo(-9, 0);
    ctx.moveTo(9, 0);      ctx.lineTo(R - 8, 0);
    ctx.moveTo(0, -R + 8); ctx.lineTo(0, -9);
    ctx.moveTo(0, 9);      ctx.lineTo(0, R - 8);
    ctx.strokeStyle = HOLO(0.35); ctx.stroke();

    // centre range gate
    ctx.lineWidth = 1.5; ctx.strokeStyle = HOLO(0.85);
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
    if (!skyCanvas) buildSignalAssets();

    // ---- update (skipped under reduced motion and on dt=0 repaints) ----
    if (!REDUCED && dt > 0) {
      sigT += dt;
      cloudShift = (cloudShift + dt * 0.0016) % SIZE;      // cloud deck drifts right, ~82s per lap

      // Batman patrol: frozen while pausing at a rooftop or while caught in the beam
      if (sigT >= pauseUntil && sigT >= lockUntil) {
        const wx = WAYPOINTS[wpIndex][0], wy = WAYPOINTS[wpIndex][1];
        const ddx = wx - blipX, ddy = wy - blipY;
        const dist = Math.hypot(ddx, ddy), step = BLIP_SPEED * dt;
        if (dist <= step) {                                // arrived: pause, pick next (ping-pong)
          blipX = wx; blipY = wy;
          pauseUntil = sigT + ((wpIndex === 0 || wpIndex === 3) ? 1800 : 1000);
          if (wpIndex === WAYPOINTS.length - 1) wpDir = -1; else if (wpIndex === 0) wpDir = 1;
          wpIndex += wpDir;
        } else { blipX += (ddx / dist) * step; blipY += (ddy / dist) * step; }
        if (sigT - lastTrail > 90) {                       // trail sample every 90ms while moving
          trail.push({ x: blipX, y: blipY });
          if (trail.length > 14) trail.shift();
          lastTrail = sigT;
        }
      }

      // beam: free pendulum sweep; lock when its centreline crosses Batman's bearing
      const freeAngle = SIG_BASE + SIG_AMP * Math.sin((sigT / SWEEP_MS) * Math.PI * 2);
      const bearing = Math.atan2(blipY - SIG_O.y, blipX - SIG_O.x);
      if (sigT >= lockUntil && sigT > lockCooldown && Math.abs(angDiff(beamAngle, bearing)) < 0.05) {
        lockStart = sigT; lockUntil = sigT + 1500; lockCooldown = lockUntil + 4000;
        pauseUntil = Math.max(pauseUntil, lockUntil);      // caught in the light: he freezes
      }
      const target = (sigT < lockUntil) ? bearing : freeAngle;
      beamAngle += angDiff(target, beamAngle) * Math.min(1, dt * 0.012);  // snap ~85ms
      lockGlow += ((sigT < lockUntil ? 1 : 0) - lockGlow) * Math.min(1, dt * 0.006);
    }
    const locked = sigT < lockUntil;

    // ---- render ----
    // 1. red-sky disc (BTAS blood-red gradient, bright up top)
    ctx.beginPath(); ctx.arc(0, 0, R - 1, 0, Math.PI * 2);
    ctx.fillStyle = skyGrad; ctx.fill();

    // 2. clip to disc
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, R - 2, 0, Math.PI * 2); ctx.clip();

    // 3. drifting cloud texture (2 drawImage, wraps seamlessly)
    ctx.drawImage(skyCanvas, -R + cloudShift, -R, SIZE, SIZE);
    ctx.drawImage(skyCanvas, -R + cloudShift - SIZE, -R, SIZE, SIZE);

    // 4. beam: halo wedge + core wedge from SIG_O (buildings drawn later hide its base)
    for (const [span, aScale] of [[0.30, 0.45], [0.13, 1]]) {
      ctx.beginPath();
      ctx.moveTo(SIG_O.x, SIG_O.y);
      ctx.arc(SIG_O.x, SIG_O.y, 120, beamAngle - span / 2, beamAngle + span / 2);
      ctx.closePath();
      ctx.globalAlpha = aScale * (0.8 + 0.35 * lockGlow);
      ctx.fillStyle = beamGrad;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 5. bat emblem where the beam hits the cloud deck (80% of the way to r=58 rim)
    const eDist = 0.8 * beamRim(beamAngle);
    const px = SIG_O.x + Math.cos(beamAngle) * eDist;
    const py = SIG_O.y + Math.sin(beamAngle) * eDist;
    ctx.save();
    ctx.translate(px, py); ctx.rotate(beamAngle + Math.PI / 2);   // ellipse faces along the beam
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 10, 0, 0, Math.PI * 2); // soft outer glow
    ctx.fillStyle = PALE(0.08 + 0.14 * lockGlow); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 7.5, 0, 0, Math.PI * 2); // light pool
    ctx.fillStyle = PALE(0.28 + 0.34 * lockGlow); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = PALE(0.5 + 0.4 * lockGlow); ctx.stroke();
    ctx.restore();
    drawBat(px, py, 0.75 + 0.25 * lockGlow, 0.6);                 // upright dark silhouette

    // 6. roofline silhouette OVER the beam (one drawImage)
    ctx.drawImage(cityCanvas, -R, -R, SIZE, SIZE);

    // 7. fading dashed trail (oldest = faintest)
    ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
    for (let i = 1; i < trail.length; i++) {
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y);
      ctx.strokeStyle = GRAY(0.06 + 0.30 * (i / trail.length));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 8. Batman blip (+ expanding pulse ring while locked)
    ctx.beginPath(); ctx.arc(blipX, blipY, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = locked ? GOLD(0.95) : 'rgba(214,206,192,0.9)';
    ctx.fill();
    if (lockGlow > 0.05) {
      const k = ((sigT - lockStart) % 600) / 600;   // static frame: (0-(-300))%600/600 = 0.5
      ctx.beginPath(); ctx.arc(blipX, blipY, 3 + 9 * k, 0, Math.PI * 2);
      ctx.lineWidth = 1.2; ctx.strokeStyle = GOLD(0.55 * (1 - k) * lockGlow);
      ctx.stroke();
    }

    ctx.restore();  // unclip

    // 9. rim (unchanged) + instrument range ring + 3 bearing ticks (sweep min/centre/max)
    ctx.beginPath(); ctx.arc(0, 0, R - 1, 0, Math.PI * 2);
    ctx.lineWidth = 1; ctx.strokeStyle = GOLD(0.35); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 61, 0, Math.PI * 2);
    ctx.strokeStyle = GRAY(0.22); ctx.stroke();
    ctx.beginPath();
    for (const a of [-2.3038, -1.6406, -0.9774]) {
      ctx.moveTo(Math.cos(a) * 58, Math.sin(a) * 58);
      ctx.lineTo(Math.cos(a) * 64, Math.sin(a) * 64);
    }
    ctx.strokeStyle = GOLD(0.45); ctx.stroke();
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

  // Timer-paced at 30fps: scheduling the next rAF from a timeout (instead of a
  // bare 60Hz rAF chain that skipped every other tick) lets the renderer idle
  // between draws. dt semantics unchanged — prev still tracks drawn frames.
  let raf = null, timer = null, prev = 0;
  const FRAME_MS = 1000 / 30; // decorative sweep doesn't need 60fps
  function loop(now) {
    raf = null;
    const dt = now - prev; prev = now;
    draw(dt);
    timer = setTimeout(() => {
      timer = null;
      raf = requestAnimationFrame(loop);
    }, Math.max(0, FRAME_MS - (performance.now() - now)));
  }
  // Codec Infiltration overlay covers the page — pause while it's open
  // (game.js toggles the class and dispatches gameopen/gameclose).
  const gameOpen = () => document.body.classList.contains('game-open');
  function start() {
    if (raf === null && timer === null && !REDUCED && !document.hidden && !smallScreen.matches && !gameOpen()) {
      prev = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }
  function stop() {
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    if (timer !== null) { clearTimeout(timer); timer = null; }
  }
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  window.addEventListener('gameopen', stop);
  window.addEventListener('gameclose', start);

  const onBreakpoint = () => {
    if (smallScreen.matches) { stop(); } else { draw(0); start(); }
  };
  if (smallScreen.addEventListener) smallScreen.addEventListener('change', onBreakpoint);
  else if (smallScreen.addListener) smallScreen.addListener(onBreakpoint); // older Safari

  applyMode(); // mode + label from the current theme; its draw(0) is the static first frame
  start();
})();

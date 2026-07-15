// Soliton Radar — MGS2-style sweep radar, fixed bottom-right HUD.
// Player blip sits at center; the mouse position maps to a tracked blip; a few
// ambient blips drift and "ping" brighter as the sweep line passes over them.
// Adapts its ink colour to the active theme (blue in light, green in codec) and
// goes static under prefers-reduced-motion. Hidden on small screens.
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

  // --- theme-aware ink colour ---
  let ink = [47, 84, 204];
  function readInk() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
    const m = v.match(/^#?([0-9a-f]{6})$/i);
    if (m) ink = [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  }
  readInk();
  window.addEventListener('themechange', readInk);
  const rgba = a => `rgba(${ink[0]},${ink[1]},${ink[2]},${a})`;

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

  function draw(dt) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.translate(R, R);

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

    ctx.restore();
  }

  let raf = null, prev = 0;
  const FRAME_MS = 1000 / 30; // decorative sweep doesn't need 60fps
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - prev < FRAME_MS) return;
    const dt = now - prev; prev = now;
    sweep += dt * 0.0023;
    if (sweep > Math.PI * 2) sweep -= Math.PI * 2;
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

  draw(0); // static first frame (and the only frame under reduced motion)
  start();
})();

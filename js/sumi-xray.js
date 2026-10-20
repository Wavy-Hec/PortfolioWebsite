/* SUMI v5 — the About band: a quadruped in x-ray. A side elevation of a Unitree Go2 (the robot the locomotion work runs on), drawn
   procedurally in paper lines on deep sumi: the kinematic skeleton inside (links as lines, joints as circles: 12 of them, hip / thigh / calf
   per leg) in bright paper, the outer silhouette as a dotted line, a faint ground line and shadow. Proportions from the Go2: body 0.37 m,
   hips 0.19 m fore and aft of the centre, thigh and calf 0.213 m, knees folding back. It RESOLVES on entry (the skeleton draws itself joint
   by joint over 1.4 s, the silhouette fades in, then the red tags), then trots in place: a diagonal-pair gait at 1.6 Hz, joint angles a
   sinusoid per leg, every point from forward kinematics. The red tags (mono labels, a red square, a hairline leader to the part) brighten
   their part on hover / focus; the band's fog leans with the page wind. Reduced motion: the standing pose, everything present, no walk.
   One canvas, ~40 strokes a frame, inside the page's single frame loop at ~30 fps, only while the band is on screen. */
(() => {
  'use strict';
  const S = window.SUMI;
  const wrap = document.querySelector('.xray'), canvas = wrap && wrap.querySelector('canvas'), band = wrap && wrap.closest('.band');
  if (!S || !canvas || !band) return;
  const ctx = canvas.getContext('2d');
  const PAPER = '#e9e7e2', RED = '#c9333a', DPR = Math.min(2, devicePixelRatio || 1), FRAME = 1000 / 30;
  // the robot (metres; x to the rear, y down; it faces left). Hip abduction joints sit on the body line; the thigh joint hangs 0.03 under them
  // (the real offset is lateral, invisible from the side), thigh 0.213 at th1 from the down vertical (positive = knee back), calf 0.213 at th1 + psi.
  const BODY_L = 0.37, BODY_H = 0.095, HIP_X = 0.1934, THIGH = 0.213, CALF = 0.213, HIP_DROP = 0.03;
  const TH1 = 0.8, PSI = -1.5, GAIT_HZ = 1.6;                                 // standing: the rear knee at (0.346, 0.178), the feet at y 0.341; the ground at 0.372
  // legs: name, hip x, phase, near side (the far side draws dimmer, nudged back 0.018)
  const LEGS = [{ n: 'FL', x: -HIP_X, ph: 0, near: true }, { n: 'RR', x: HIP_X, ph: 0, near: false }, { n: 'FR', x: -HIP_X, ph: Math.PI, near: false }, { n: 'RL', x: HIP_X, ph: Math.PI, near: true }];
  const DRAW_ORDER = ['FL', 'RL', 'FR', 'RR'];                                 // the resolve: front near, rear near, front far, rear far
  // tags: label, the part it brightens, the anchor on the robot (metres), the label's place in metres from the figure's centre (desktop): for a
  // tag on the left (side 'l', its red square at its right end) l[0] is where that square sits; for one on the right, its left edge
  const TAGS = [
    { k: 'head', side: 'l', a: [-0.255, -0.035], l: [-0.36, -0.17] },
    { k: 'imu', side: 'r', a: [0.02, -0.01], l: [0.0, -0.22] },
    { k: 'memory', side: 'r', a: [0.12, 0.0], l: [0.3, -0.17] },
    { k: 'joints', side: 'r', a: [HIP_X + 0.153, HIP_DROP + 0.148], l: [0.345, 0.3], alt: [0.2, 0.46] },   // under the rear knee, its leader rising beside the calf, never across it; where the radar's corner would push it onto the foot (< ~1200 px) it goes under the ground line instead
    { k: 'legs', side: 'l', a: [-HIP_X + 0.09, HIP_DROP + 0.23], l: [-0.36, 0.2] },
    { k: 'ground', side: 'l', a: [0.33, 0.372], l: [0.1, 0.4] },
  ];
  const tagEls = [...wrap.querySelectorAll('.tag')];
  let W = 0, H = 0, s = 0, cx = 0, cy = 0, narrow = false, laidOut = false, inView = false, acc = 0, lastCost = 0;
  let t0 = null, phase = 0, walk = 0, resolved = S.REDUCED, lastFrameAt = 0;
  const hl = { head: 0, imu: 0, memory: 0, joints: 0, legs: 0, ground: 0 }, hlT = { ...hl }, held = {};
  const P = (x, y) => [cx + x * s, cy + y * s], clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  function layout() {
    narrow = innerWidth <= 720;
    W = wrap.clientWidth; H = narrow ? Math.round(W * 0.72) : 700;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    s = Math.min((narrow ? W * 0.92 : W * 0.7) / 0.76, H * (narrow ? 1 : 0.68) / 0.43);   // px per metre: the figure is ~0.76 m long, 0.43 m from the head's top to the ground (the body ~410 px at 1440, the joints readable)
    cx = W / 2; cy = H * (narrow ? 0.44 : 0.28);
    if (!narrow) {
      const reserve = innerWidth - 150 - wrap.getBoundingClientRect().left;   // the Soliton radar's corner (fixed, bottom-right): no tag runs under it
      tagEls.forEach((el, i) => {
        const T = TAGS[i]; if (!T) return;
        const w = el.offsetWidth, left = T.side === 'l', maxX = Math.min(W - 8, reserve) - w;
        let pos = T.l, lx = clamp(cx + pos[0] * s - (left ? w : 0), 8, maxX);
        if (T.alt && cx + pos[0] * s - lx > 40) { pos = T.alt; lx = clamp(cx + pos[0] * s, 8, maxX); }
        el.style.left = lx + 'px'; el.style.top = (cy + pos[1] * s) + 'px'; el.classList.toggle('l', left);
      });
    } else tagEls.forEach(el => { el.style.left = ''; el.style.top = ''; });
    laidOut = true;
  }
  // forward kinematics for one leg at gait phase ph (walk = 0 is the standing pose)
  function legPose(leg, ph) {
    const sw = Math.max(0, Math.sin(ph)), st = Math.min(0, Math.sin(ph));
    const th1 = TH1 - 0.26 * Math.sin(ph) * walk, psi = PSI + (-0.42 * sw + 0.1 * st) * walk;
    const hx = leg.x + (leg.near ? 0 : 0.018), hy = 0, tx = hx, ty = HIP_DROP;
    const kx = tx + THIGH * Math.sin(th1), ky = ty + THIGH * Math.cos(th1);
    const fx = kx + CALF * Math.sin(th1 + psi), fy = ky + CALF * Math.cos(th1 + psi);
    return { hip: [hx, hy], thigh: [tx, ty], knee: [kx, ky], foot: [fx, fy] };
  }
  function line(a, b, f) {                                                    // a -> b, drawn to fraction f
    const [x0, y0] = P(a[0], a[1]), [x1, y1] = P(b[0], b[1]);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f); ctx.stroke();
  }
  function joint(p, r, f) {
    const [x, y] = P(p[0], p[1]);
    ctx.beginPath(); ctx.arc(x, y, r * f, 0, Math.PI * 2); ctx.stroke();
  }
  function capsule(a, b, r) {                                                 // the silhouette of a link
    const [x0, y0] = P(a[0], a[1]), [x1, y1] = P(b[0], b[1]), ang = Math.atan2(y1 - y0, x1 - x0), rr = r * s;
    ctx.beginPath(); ctx.arc(x0, y0, rr, ang + Math.PI / 2, ang - Math.PI / 2); ctx.arc(x1, y1, rr, ang - Math.PI / 2, ang + Math.PI / 2); ctx.closePath(); ctx.stroke();
  }
  function rbox(x, y, w, h, r) {
    const [px, py] = P(x, y), pw = w * s, ph = h * s, pr = r * s;
    ctx.beginPath(); ctx.moveTo(px + pr, py); ctx.lineTo(px + pw - pr, py); ctx.arcTo(px + pw, py, px + pw, py + pr, pr); ctx.lineTo(px + pw, py + ph - pr); ctx.arcTo(px + pw, py + ph, px + pw - pr, py + ph, pr);
    ctx.lineTo(px + pr, py + ph); ctx.arcTo(px, py + ph, px, py + ph - pr, pr); ctx.lineTo(px, py + pr); ctx.arcTo(px, py, px + pr, py, pr); ctx.closePath();
  }
  const ease = v => v < 0 ? 0 : v > 1 ? 1 : v * v * (3 - 2 * v);
  const seg = (t, a, b) => ease((t - a) / (b - a));

  function draw(now) {
    const t = S.REDUCED ? 9 : t0 === null ? 0 : (now - t0) / 1000;        // seconds since the band came into view
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const bob = 0.004 * Math.sin(phase * 2) * walk;
    cy += bob * s;
    const poses = {}; for (const L of LEGS) poses[L.n] = legPose(L, phase + L.ph);
    const GROUND = HIP_DROP + 0.342;
    // the ground line and the shadow: a hairline, and a soft bar under the feet
    const gA = 0.25 + 0.5 * hl.ground, silA = seg(t, 1.4, 2.0);
    ctx.strokeStyle = PAPER; ctx.globalAlpha = gA * silA; ctx.lineWidth = 1;
    ctx.setLineDash([]);
    const [gx0, gy] = P(-0.46, GROUND), [gx1] = P(0.46, GROUND);
    ctx.beginPath(); ctx.moveTo(gx0, gy); ctx.lineTo(gx1, gy); ctx.stroke();
    const grd = ctx.createLinearGradient(gx0, 0, gx1, 0);
    grd.addColorStop(0, 'rgba(233,231,226,0)'); grd.addColorStop(0.3, 'rgba(233,231,226,.1)'); grd.addColorStop(0.7, 'rgba(233,231,226,.1)'); grd.addColorStop(1, 'rgba(233,231,226,0)');
    ctx.fillStyle = grd; ctx.globalAlpha = silA * (0.5 + 0.5 * hl.ground); ctx.fillRect(gx0, gy + 2, gx1 - gx0, 5);
    // the silhouette: dotted paper, body, head, legs as capsules, feet
    if (silA > 0) {
      ctx.setLineDash([1.5, 3.5]); ctx.lineWidth = 1;
      for (const L of LEGS) {
        if (L.near) continue;
        const p = poses[L.n]; ctx.globalAlpha = silA * 0.22 * (1 + hl.legs);
        capsule(p.thigh, p.knee, 0.022); capsule(p.knee, p.foot, 0.016);
      }
      ctx.globalAlpha = silA * 0.55 * (1 + 0.6 * hl.memory);
      rbox(-BODY_L / 2, -BODY_H / 2, BODY_L, BODY_H, 0.03); ctx.stroke();
      ctx.globalAlpha = silA * 0.55 * (1 + 0.6 * hl.head);                   // the head: a slanted block ahead of the body, the camera on its face
      const [hx0, hy0] = P(-BODY_L / 2 - 0.085, -0.045), [hx1, hy1] = P(-BODY_L / 2 - 0.06, 0.03), [hx2, hy2] = P(-BODY_L / 2 + 0.02, 0.03), [hx3, hy3] = P(-BODY_L / 2 + 0.02, -0.052);
      ctx.beginPath(); ctx.moveTo(hx0, hy0); ctx.lineTo(hx1, hy1); ctx.lineTo(hx2, hy2); ctx.lineTo(hx3, hy3); ctx.closePath(); ctx.stroke();
      for (const L of LEGS) {
        if (!L.near) continue;
        const p = poses[L.n]; ctx.globalAlpha = silA * 0.5 * (1 + 0.6 * hl.legs);
        capsule(p.thigh, p.knee, 0.024); capsule(p.knee, p.foot, 0.017);
        ctx.setLineDash([]); joint(p.foot, 0.021 * s, 1); ctx.setLineDash([1.5, 3.5]);
      }
      ctx.setLineDash([]);
      // the camera: a small filled circle on the head's face; the IMU: a square at the body's centre; the memory: a dotted tray in the rear of the body
      ctx.fillStyle = PAPER; ctx.globalAlpha = silA * (0.6 + 0.4 * hl.head);
      const [cxp, cyp] = P(-BODY_L / 2 - 0.068, -0.012); ctx.beginPath(); ctx.arc(cxp, cyp, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = silA * (0.5 + 0.5 * hl.imu); const [ix, iy] = P(0.02, -0.01); ctx.strokeRect(ix - 5, iy - 5, 10, 10); ctx.beginPath(); ctx.arc(ix, iy, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = silA * (0.35 + 0.65 * hl.memory); ctx.setLineDash([2, 2]); const [mx, my] = P(0.075, -0.028); ctx.strokeRect(mx, my, 0.09 * s, 0.056 * s);
      ctx.beginPath(); for (let i = 1; i < 3; i++) { ctx.moveTo(mx + 4, my + i * 0.056 * s / 3); ctx.lineTo(mx + 0.09 * s - 4, my + i * 0.056 * s / 3); } ctx.stroke(); ctx.setLineDash([]);
    }
    // the skeleton: the spine (hip to hip) then each leg in order; links as lines, joints as circles
    const spineF = seg(t, 0, 0.2);
    ctx.lineWidth = 1.5; ctx.strokeStyle = PAPER;
    if (spineF > 0) { ctx.globalAlpha = 0.85; line([-HIP_X, 0], [HIP_X, 0], spineF); }
    DRAW_ORDER.forEach((n, i) => {
      const L = LEGS.find(l => l.n === n), p = poses[n], a0 = 0.2 + i * 0.3, a1 = a0 + 0.3;
      const f = seg(t, a0, a1); if (f <= 0) return;
      const base = (L.near ? 0.95 : 0.42) * (1 + 0.3 * hl.legs), jA = (L.near ? 0.95 : 0.5) * (1 + 0.4 * hl.joints);
      const fDrop = ease(f / 0.15), fTh = ease((f - 0.1) / 0.45), fCa = ease((f - 0.5) / 0.5);
      ctx.lineWidth = L.near ? 1.5 + hl.legs : 1;
      ctx.globalAlpha = base; line(p.hip, p.thigh, fDrop); if (fTh > 0) line(p.thigh, p.knee, fTh); if (fCa > 0) line(p.knee, p.foot, fCa);
      ctx.lineWidth = 1 + hl.joints * 0.8; ctx.globalAlpha = jA;
      const jr = (L.near ? 4.5 : 3.5) + hl.joints * 1.5;
      joint(p.hip, jr, ease(f / 0.1)); if (fDrop >= 1) joint(p.thigh, jr * 0.8, ease((f - 0.12) / 0.1)); if (fTh >= 1) joint(p.knee, jr, ease((f - 0.52) / 0.1));
    });
    // the leaders: from each tag's red square to its part (desktop only)
    if (!narrow) {
      const tagA = seg(t, 2.0, 2.5);
      ctx.lineWidth = 1;
      tagEls.forEach((el, i) => {
        const T = TAGS[i]; if (!T) return;
        const [ax, ay] = P(T.a[0], T.a[1]), lx = parseFloat(el.style.left) || 0, ly = parseFloat(el.style.top) || 0;
        const left = el.classList.contains('l'), sx = left ? lx + el.offsetWidth + 3 : lx - 3, sy = ly + el.offsetHeight / 2;
        const a = tagA * (hl[T.k] > 0.01 ? 0.3 + 0.7 * hl[T.k] : 0.3);
        ctx.globalAlpha = a; ctx.strokeStyle = PAPER; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ax, ay); ctx.stroke();
        ctx.fillStyle = RED; ctx.globalAlpha = tagA; ctx.beginPath(); ctx.arc(ax, ay, 2 + hl[T.k] * 1.5, 0, Math.PI * 2); ctx.fill();
      });
    }
    cy -= bob * s;
    ctx.globalAlpha = 1;
  }

  function step(dt, now) {
    for (const k in hl) hl[k] += (hlT[k] - hl[k]) * (1 - Math.exp(-dt * 9));
    if (!inView || !laidOut) return;
    if (t0 === null) t0 = now;
    const t = (now - t0) / 1000;
    if (!resolved && t > 2.5) { resolved = true; wrap.classList.add('resolved'); }
    walk = ease((t - 1.6) / 1.0);
    phase += dt * GAIT_HZ * Math.PI * 2 * walk;
    const lean = S.wind.lean;
    fog.style.transform = `translateX(${(lean * 26).toFixed(1)}px) skewX(${(-lean * 2).toFixed(2)}deg)`;
    acc += dt * 1000; if (acc < FRAME) return; acc = 0;
    const c0 = performance.now(); draw(now); lastCost = performance.now() - c0;
  }
  const fog = band.querySelector('.fog') || document.createElement('i');
  function still() { if (!laidOut) return; wrap.classList.add('resolved'); draw(performance.now()); }

  tagEls.forEach((el, i) => {
    const k = (TAGS[i] || {}).k; if (!k) return;
    const on = () => { hlT[k] = 1; wrap.dataset.part = k; }, off = () => { if (held[k]) return; hlT[k] = 0; if (wrap.dataset.part === k) delete wrap.dataset.part; };
    el.addEventListener('pointerenter', on); el.addEventListener('pointerleave', off); el.addEventListener('focus', on); el.addEventListener('blur', off);
    el.addEventListener('click', e => {                                      // the toggle (a click, Enter or Space): holds the part bright, aria-pressed
      held[k] = !held[k]; el.setAttribute('aria-pressed', held[k] ? 'true' : 'false');
      if (held[k]) on(); else if (!el.matches(':hover, :focus-visible')) off();
      if (S.REDUCED) { for (const q in hl) hl[q] = hlT[q]; draw(performance.now()); }
    });
  });
  if (S.REDUCED) {                                                          // the standing pose; hover still brightens (a direct redraw)
    layout(); still();
    tagEls.forEach(el => ['pointerenter', 'pointerleave', 'focus', 'blur'].forEach(ev => el.addEventListener(ev, () => { for (const k in hl) hl[k] = hlT[k]; draw(performance.now()); })));
  } else {
    layout(); draw(performance.now());
    S.add(step);
    new IntersectionObserver(es => { inView = es.some(e => e.isIntersecting); }, { threshold: 0.15 }).observe(wrap);
  }
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); S.REDUCED ? still() : draw(performance.now()); }, 150); }, { passive: true });
  // dev: a frame's cost; at(sec) jumps the resolve clock for screenshots
  S.xray = { cost: () => lastCost, bench(n) { const a = performance.now(); for (let i = 0; i < n; i++) draw(performance.now()); return ((performance.now() - a) / n).toFixed(2); }, at(sec) { t0 = performance.now() - sec * 1000; inView = true; walk = ease((sec - 1.6) / 1.0); draw(performance.now()); if (sec > 2.5) wrap.classList.add('resolved'); } };
})();

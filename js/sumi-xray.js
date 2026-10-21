/* SUMI v7 — the About band: a Unitree Go2 (the robot the locomotion work runs on) in side elevation, drawn procedurally in paper lines on
   deep sumi: the kinematic skeleton inside (links as lines, joints as circles: 12 of them, hip / thigh / calf per leg) in bright paper, the
   outer silhouette as a dotted line, a faint ground line and shadow. Proportions from the go2_description URDF (unitree_ros): trunk 0.3762 m,
   hips 0.1934 m fore and aft of the centre, thigh and calf 0.213 m, knees folding back. It RESOLVES on entry (the skeleton draws itself joint
   by joint in 0.85 s, the silhouette fades in by 1.2 s, the leaders by 1.5 s, the tags by ~2 s; a timer, not the frame loop, reveals the tags, so
   they arrive even when frames are throttled), then trots in place: a diagonal-pair gait, joint angles a sinusoid per leg,
   every point from forward kinematics. The hardware tags (mono labels, a paper square, a hairline leader to the part) brighten their part on
   hover / focus. Reduced motion: the standing pose, everything present, no walk. One canvas, ~40 strokes a frame, inside the page's single
   frame loop at ~30 fps, only while the band is on screen. */
(() => {
  'use strict';
  const S = window.SUMI;
  const wrap = document.querySelector('.xray'), canvas = wrap && wrap.querySelector('canvas'), band = wrap && wrap.closest('.band');
  if (!S || !canvas || !band) return;
  const ctx = canvas.getContext('2d');
  const PAPER = '#e9e7e2', DPR = Math.min(2, devicePixelRatio || 1), FRAME = 1000 / 30;
  // the robot (metres; x to the rear, y down; it faces left). Hip abduction joints sit on the body line; the thigh joint hangs 0.03 under them
  // (the real offset is lateral, invisible from the side), thigh 0.213 at th1 from the down vertical (positive = knee back), calf 0.213 at th1 + psi.
  const BODY_L = 0.3762, BODY_H = 0.095, HIP_X = 0.1934, THIGH = 0.213, CALF = 0.213, HIP_DROP = 0.03;
  const TH1 = 0.8, PSI = -1.5, GAIT_HZ = 1.6;                                 // standing: the rear knee at (0.346, 0.178), the feet at y 0.341; the ground at 0.372
  // legs: name, hip x, phase, near side (the far side draws dimmer, nudged back 0.018)
  const LEGS = [{ n: 'FL', x: -HIP_X, ph: 0, near: true }, { n: 'RR', x: HIP_X, ph: 0, near: false }, { n: 'FR', x: -HIP_X, ph: Math.PI, near: false }, { n: 'RL', x: HIP_X, ph: Math.PI, near: true }];
  const DRAW_ORDER = ['FL', 'RL', 'FR', 'RR'];                                 // the resolve: front near, rear near, front far, rear far
  // tags (order = the buttons in index.html): the part it brightens, the anchor on the robot (metres; a function of this frame's leg poses for
  // a part that moves, so the leader stays on it while the robot trots), the label's place in metres from the figure's centre (desktop): for a
  // tag on the left (side 'l', its square at its right end) l[0] is where that square sits; for one on the right, its left edge
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const TAGS = [
    { k: 'joints', side: 'l', a: p => p.RL.knee, l: [0.31, 0.43] },                                   // 12 joint motors (two lines, css .l2): under the ground line below the rear legs, its leader rising to the rear near knee right of both calves; nothing it names is crossed by its letters, at any width (right of the knee it ran out of room under ~1280 and was clamped onto the thigh)
    { k: 'lengths', side: 'l', a: p => mid(p.FL.thigh, p.FL.knee), l: [-0.42, 0.27] },   // thigh / calf: the front near leg's thigh, at its middle
    { k: 'imu', side: 'r', a: [0.02, -0.01], l: [0.1, -0.2] },                              // the trunk's centre
    { k: 'head', side: 'l', a: [-BODY_L / 2 - 0.05, -0.04], l: [-0.4, -0.19] },             // the head block: the LiDAR and the camera
  ];
  const tagEls = [...wrap.querySelectorAll('.tag')];
  let W = 0, H = 0, s = 0, cx = 0, cy = 0, narrow = false, laidOut = false, inView = false, acc = 0, lastCost = 0;
  let t0 = null, phase = 0, walk = 0, resolved = S.REDUCED;
  const hl = { joints: 0, lengths: 0, imu: 0, head: 0 }, hlT = { ...hl }, held = {};
  const P = (x, y) => [cx + x * s, cy + y * s], clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  function layout() {
    narrow = innerWidth <= 720;
    W = wrap.clientWidth; H = narrow ? Math.round(W * 0.74) : Math.round(clamp(W * 0.62, 380, 560));
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    s = Math.min((narrow ? W * 0.92 : W * 0.6) / 0.76, H * (narrow ? 1 : 0.66) / 0.43);   // px per metre: the figure is ~0.76 m long, 0.43 m from the head's top to the ground
    cx = W / 2; cy = H * (narrow ? 0.44 : 0.3);
    if (!narrow) {
      tagEls.forEach((el, i) => {
        const T = TAGS[i]; if (!T) return;
        const w = el.offsetWidth, left = T.side === 'l', maxX = W - 8 - w;
        const lx = clamp(cx + T.l[0] * s - (left ? w : 0), 8, maxX);
        el.style.left = lx + 'px'; el.style.top = (cy + T.l[1] * s) + 'px'; el.classList.toggle('l', left);
      });
    } else tagEls.forEach(el => { el.style.left = ''; el.style.top = ''; el.classList.remove('l'); });
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
    const silA = seg(t, 0.85, 1.2);
    ctx.strokeStyle = PAPER; ctx.globalAlpha = 0.25 * silA; ctx.lineWidth = 1;
    ctx.setLineDash([]);
    const [gx0, gy] = P(-0.46, GROUND), [gx1] = P(0.46, GROUND);
    ctx.beginPath(); ctx.moveTo(gx0, gy); ctx.lineTo(gx1, gy); ctx.stroke();
    const grd = ctx.createLinearGradient(gx0, 0, gx1, 0);
    grd.addColorStop(0, 'rgba(233,231,226,0)'); grd.addColorStop(0.3, 'rgba(233,231,226,.1)'); grd.addColorStop(0.7, 'rgba(233,231,226,.1)'); grd.addColorStop(1, 'rgba(233,231,226,0)');
    ctx.fillStyle = grd; ctx.globalAlpha = silA * 0.5; ctx.fillRect(gx0, gy + 2, gx1 - gx0, 5);
    // the silhouette: dotted paper, body, head, legs as capsules, feet
    if (silA > 0) {
      ctx.setLineDash([1.5, 3.5]); ctx.lineWidth = 1;
      for (const L of LEGS) {
        if (L.near) continue;
        const p = poses[L.n]; ctx.globalAlpha = silA * 0.22;
        capsule(p.thigh, p.knee, 0.022); capsule(p.knee, p.foot, 0.016);
      }
      ctx.globalAlpha = silA * 0.55 * (1 + 0.5 * hl.imu);
      rbox(-BODY_L / 2, -BODY_H / 2, BODY_L, BODY_H, 0.03); ctx.stroke();
      ctx.globalAlpha = silA * 0.55 * (1 + 0.7 * hl.head);                   // the head: a slanted block ahead of the body, the camera on its face
      const [hx0, hy0] = P(-BODY_L / 2 - 0.085, -0.045), [hx1, hy1] = P(-BODY_L / 2 - 0.06, 0.03), [hx2, hy2] = P(-BODY_L / 2 + 0.02, 0.03), [hx3, hy3] = P(-BODY_L / 2 + 0.02, -0.052);
      ctx.beginPath(); ctx.moveTo(hx0, hy0); ctx.lineTo(hx1, hy1); ctx.lineTo(hx2, hy2); ctx.lineTo(hx3, hy3); ctx.closePath(); ctx.stroke();
      for (const L of LEGS) {
        if (!L.near) continue;
        const p = poses[L.n], lit = L.n === 'FL' ? hl.lengths : 0; ctx.globalAlpha = silA * 0.5 * (1 + 0.6 * lit);
        capsule(p.thigh, p.knee, 0.024); capsule(p.knee, p.foot, 0.017);
        ctx.setLineDash([]); joint(p.foot, 0.021 * s, 1); ctx.setLineDash([1.5, 3.5]);
      }
      ctx.setLineDash([]);
      // the camera: a small filled circle on the head's face, the LiDAR a short arc above it; the IMU: a square at the body's centre
      ctx.fillStyle = PAPER; ctx.globalAlpha = silA * (0.6 + 0.4 * hl.head);
      const [cxp, cyp] = P(-BODY_L / 2 - 0.068, -0.012); ctx.beginPath(); ctx.arc(cxp, cyp, 2.5, 0, Math.PI * 2); ctx.fill();
      const [lxp, lyp] = P(-BODY_L / 2 - 0.04, -0.045); ctx.beginPath(); ctx.arc(lxp, lyp, 0.028 * s, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.globalAlpha = silA * (0.5 + 0.5 * hl.imu); const [ix, iy] = P(0.02, -0.01); ctx.strokeRect(ix - 5, iy - 5, 10, 10); ctx.beginPath(); ctx.arc(ix, iy, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    // the skeleton: the spine (hip to hip) then each leg in order; links as lines, joints as circles
    const spineF = seg(t, 0, 0.12);
    ctx.lineWidth = 1.5; ctx.strokeStyle = PAPER;
    if (spineF > 0) { ctx.globalAlpha = 0.85; line([-HIP_X, 0], [HIP_X, 0], spineF); }
    DRAW_ORDER.forEach((n, i) => {
      const L = LEGS.find(l => l.n === n), p = poses[n], a0 = 0.12 + i * 0.18, a1 = a0 + 0.24;
      const f = seg(t, a0, a1); if (f <= 0) return;
      const lit = n === 'FL' ? hl.lengths : 0, jl = n === 'RL' ? hl.joints : hl.joints * 0.5;
      const base = (L.near ? 0.95 : 0.42) * (1 + 0.3 * lit), jA = (L.near ? 0.95 : 0.5) * (1 + 0.4 * jl);
      const fDrop = ease(f / 0.15), fTh = ease((f - 0.1) / 0.45), fCa = ease((f - 0.5) / 0.5);
      ctx.lineWidth = L.near ? 1.5 + lit : 1;
      ctx.globalAlpha = base; line(p.hip, p.thigh, fDrop); if (fTh > 0) line(p.thigh, p.knee, fTh); if (fCa > 0) line(p.knee, p.foot, fCa);
      ctx.lineWidth = 1 + jl * 0.8; ctx.globalAlpha = Math.min(1, jA);
      const jr = (L.near ? 4.5 : 3.5) + jl * 1.5;
      joint(p.hip, jr, ease(f / 0.1)); if (fDrop >= 1) joint(p.thigh, jr * 0.8, ease((f - 0.12) / 0.1)); if (fTh >= 1) joint(p.knee, jr, ease((f - 0.52) / 0.1));
    });
    // the leaders: from each tag's square to its part, a small paper square at the part (desktop only)
    if (!narrow) {
      const tagA = seg(t, 1.2, 1.5);
      ctx.lineWidth = 1;
      tagEls.forEach((el, i) => {
        const T = TAGS[i]; if (!T) return;
        const A = typeof T.a === 'function' ? T.a(poses) : T.a, [ax, ay] = P(A[0], A[1]), lx = parseFloat(el.style.left) || 0, ly = parseFloat(el.style.top) || 0;
        const left = el.classList.contains('l'), sx = left ? lx + el.offsetWidth + 3 : lx - 3, sy = ly + el.offsetHeight / 2;
        ctx.globalAlpha = tagA * (0.3 + 0.6 * hl[T.k]); ctx.strokeStyle = PAPER; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ax, ay); ctx.stroke();
        ctx.fillStyle = PAPER; ctx.globalAlpha = tagA * (0.7 + 0.3 * hl[T.k]); const r = 2.5 + hl[T.k]; ctx.fillRect(ax - r, ay - r, r * 2, r * 2);
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
    if (!resolved && t > 1.5) { resolved = true; wrap.classList.add('resolved'); }
    walk = ease((t - 1.2) / 1.0);
    phase += dt * GAIT_HZ * Math.PI * 2 * walk;
    acc += dt * 1000; if (acc < FRAME) return; acc = 0;
    const c0 = performance.now(); draw(now); lastCost = performance.now() - c0;
  }
  function still() { if (!laidOut) return; wrap.classList.add('resolved'); draw(performance.now()); }

  function resolveNow() {                                                   // keyboard focus lands on a tag before the band has resolved: finish the drawing at once, so the control is never invisible
    if (resolved) return;
    resolved = true; wrap.classList.add('resolved');
    if (!S.REDUCED) { t0 = performance.now() - 2600; inView = true; walk = 1; draw(performance.now()); }
  }
  // the first time the band is in view, a timer (not the frame loop) guarantees the tags by 1.6 s (fully in by ~2.1 s): a throttled requestAnimationFrame (a
  // background tab, a hidden pane) must not leave them invisible. If no frame has drawn the sketch by then, it is drawn whole, standing.
  let armed = false;
  function arm() {
    if (armed) return; armed = true;
    setTimeout(() => {
      if (!resolved) { resolved = true; wrap.classList.add('resolved'); }
      if (t0 === null) { t0 = performance.now() - 3000; draw(performance.now()); }
    }, 1600);
  }
  tagEls.forEach((el, i) => {
    const k = (TAGS[i] || {}).k; if (!k) return;
    const on = () => { hlT[k] = 1; }, off = () => { if (!held[k]) hlT[k] = 0; };
    el.addEventListener('pointerenter', on); el.addEventListener('pointerleave', off); el.addEventListener('focus', () => { resolveNow(); on(); }); el.addEventListener('blur', off);
    el.addEventListener('click', () => {                                     // the toggle (a click, Enter or Space): holds the part bright, aria-pressed
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
    new IntersectionObserver(es => { inView = es.some(e => e.isIntersecting); if (inView) arm(); }, { threshold: 0.15 }).observe(wrap);
  }
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); S.REDUCED ? still() : draw(performance.now()); }, 150); }, { passive: true });
  // dev: a frame's cost; at(sec) jumps the resolve clock for screenshots
  S.xray = { cost: () => lastCost, bench(n) { const a = performance.now(); for (let i = 0; i < n; i++) draw(performance.now()); return ((performance.now() - a) / n).toFixed(2); }, at(sec) { t0 = performance.now() - sec * 1000; inView = true; walk = ease((sec - 1.2) / 1.0); draw(performance.now()); if (sec > 1.5) wrap.classList.add('resolved'); } };
})();

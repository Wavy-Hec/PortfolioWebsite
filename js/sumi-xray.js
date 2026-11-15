/* The Go2 band: a Unitree Go2 in side elevation, walking at the speed a visitor commands, and a
   dial for its heading. A command reaches the robot at the navigator's next tick and holds until
   the one after. */
(() => {
  'use strict';
  const S = window.SUMI;
  const wrap = document.querySelector('.xray');
  if (!wrap) return;
  const band = wrap.closest('.band');
  const sketch = wrap.querySelector('.sketch');
  const canvas = sketch.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const dial = band.querySelector('.dial');
  const dialCtx = dial.getContext('2d');
  const speedInput = band.querySelector('#go2-speed');
  const headingInput = band.querySelector('#go2-heading');
  const [speedHeld, headingHeld] = band.querySelectorAll('.held');
  const [speedNext, headingNext] = band.querySelectorAll('.next');
  const tickButtons = [...band.querySelectorAll('.interval button')];
  const lamp = band.querySelector('.lamp');
  const lampCtx = lamp.getContext('2d');
  const rateText = lamp.nextSibling;
  const status = band.querySelector('[role="status"]');

  const PAPER = '#e9e7e2';
  const DOTTED = [1.5, 3.5];
  const DPR = Math.min(2, devicePixelRatio || 1);
  const HOVER = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const forcedColors = matchMedia('(forced-colors: active)');

  // metres, x to the rear, y down; BODY_L, BODY_W, HIP_X, LEG_Y, THIGH and CALF: go2_description
  const BODY_L = 0.3762;
  const BODY_W = 0.0935;
  const BODY_H = 0.095;
  const HIP_X = 0.1934;
  const LEG_Y = 0.0465 + 0.0955; // out from the spine to the hip joint, then to the thigh joint
  const THIGH = 0.213;
  const CALF = 0.213;
  const HIP_DROP = 0.03;
  const FOOT_R = 0.021;
  const NOSE = BODY_L / 2 + 0.085;
  // standing, the thigh leans 0.8 rad back and the calf 1.5 rad forward of it
  const STAND_X = THIGH * Math.sin(0.8) + CALF * Math.sin(0.8 - 1.5);
  const STAND_Y = THIGH * Math.cos(0.8) + CALF * Math.cos(0.8 - 1.5);
  const KNEE_BACK = THIGH * Math.sin(0.8);
  const GROUND = HIP_DROP + STAND_Y + FOOT_R;
  const HEAD_TOP = 0.08; // the LiDAR's arc over the head, at the top of a bob
  const TICK_M = 0.25;
  const HOME_SLACK_M = 0.002;

  const MAX_SPEED_MPS = 1.5;
  const MAX_ACCEL_MPS2 = 2;
  const MAX_YAW_DPS = 90;
  const CONTROL_HZ = 100; // the trained checkpoint's control rate
  const LAMP_S = 0.15; // the navigator's lamp lights on its tick and eases off over this long
  const DUTY = 0.56; // the share of a stride a foot spends on the ground
  const MAX_STROKE_M = 0.26; // a longer stance splays the legs, so near the top the cadence rises
  const stridesPerSecond = v => Math.max(1.5 + 0.5 * v, (v * DUTY) / MAX_STROKE_M);
  const stanceTravel = v => (v * DUTY) / stridesPerSecond(v);
  const swingTravel = v => (v * (1 - DUTY)) / stridesPerSecond(v);
  const swingHeight = v => 0.03 + 0.02 * v;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const smooth = v => {
    const c = clamp(v, 0, 1);
    return c * c * (3 - 2 * c);
  };
  const ramp = (t, from, to) => smooth((t - from) / (to - from));
  const degrees = h => (h > 0 ? '+' : '') + String(h).replace('-', '−') + '°';
  const degreesInWords = h => {
    if (h === 0 || Math.abs(h) === 180) return `${Math.abs(h)} degrees`;
    return `${Math.abs(h)} degrees to the ${h > 0 ? 'right' : 'left'}`;
  };

  // front near, rear near, front far, rear far; the far pair sits a little behind so both read
  const makeLeg = (hipX, near, offset) => ({
    hipX,
    near,
    offset,
    x: STAND_X,
    lift: 0,
    spot: hipX + STAND_X,
    swing: null,
  });
  const LEGS = [
    makeLeg(-HIP_X, true, 0),
    makeLeg(HIP_X, true, 0.5),
    makeLeg(-HIP_X + 0.018, false, 0.5),
    makeLeg(HIP_X + 0.018, false, 0),
  ];
  const [FRONT_NEAR, REAR_NEAR] = LEGS;

  // per tag button: where its square sits, in metres from the centre, and where its leader ends
  const TAGS = [
    { left: true, at: [-0.4, -0.19], anchor: () => px(-BODY_L / 2 - 0.05, trunkY - 0.04) },
    { left: false, at: [0.1, -0.19], anchor: () => px(0.02, trunkY - 0.01) },
    { left: true, at: [-0.42, 0.43], anchor: () => mid(FRONT_NEAR.top, FRONT_NEAR.knee) },
    { left: true, at: [0.31, 0.43], anchor: () => REAR_NEAR.knee },
  ];
  wrap.querySelectorAll('.tag').forEach((el, i) => Object.assign(TAGS[i], { el, glow: 0 }));
  const [head, imu, lengths, joints] = TAGS;
  const lit = tag => (tag.pinned || tag.hovered || tag.focused ? 1 : 0);

  const wanted = { speed: +speedInput.value, heading: +headingInput.value };
  const held = { ...wanted };
  let stepsPerTick = +band.querySelector('.interval [aria-pressed="true"]').value;
  let sinceTick = 0;
  let lampLevel = 0;
  let lastInput = 0;
  let unsaid = false;

  let speed = 0;
  let travel = 0;
  let phase = 0;
  let trunkY = 0;
  let yaw = held.heading;

  let W = 0;
  let H = 0;
  let scale = 0;
  let cx = 0;
  let cy = 0;
  let groundHalf = 0;
  let ink = PAPER;
  let groundInk = null;
  let inked = null;
  let dialSize = 0;
  let dialStale = true;
  let phone = false;

  let age = 0; // seconds since the sketch came into view
  let entered = false;
  let tagsShown = false;
  let bandSeen = false;
  let sketchSeen = false;
  let awake = false;

  const px = (x, y) => [cx + x * scale, cy + y * scale];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const pending = () => wanted.speed !== held.speed || wanted.heading !== held.heading;

  function layout() {
    phone = matchMedia('(max-width: 720px)').matches;
    // forced colors repaint the page but not a canvas: the drawing takes the system's text color
    ink = forcedColors.matches ? getComputedStyle(band).color : PAPER;
    const box = sketch.getBoundingClientRect();
    W = Math.round(box.width);
    H = Math.round(box.height);
    // px per metre: the robot is about 0.76 m long and 0.43 m tall; a phone fits its longest stride
    scale = phone ? W / 0.93 : Math.min((W * 0.6) / 0.76, (H * 0.66) / 0.43);
    cx = W / 2;
    // the ground line on a pixel's centre, so that it stays one pixel wide
    cy = Math.round(H * 0.3 + GROUND * scale) + 0.5 - GROUND * scale;
    groundHalf = Math.min(0.5, W / 2 / scale);
    placeTags();
    fitCanvas();

    dialSize = dial.clientWidth;
    dial.width = Math.round(dialSize * DPR);
    dial.height = Math.round(dialSize * DPR);
    dialCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dialCtx.strokeStyle = ink;
    dialCtx.fillStyle = ink;
    lampCtx.fillStyle = ink;
    dialCtx.lineCap = 'round';
    dialStale = true;
  }

  function placeTags() {
    if (phone) {
      for (const tag of TAGS) {
        tag.el.style.left = '';
        tag.el.style.top = '';
        tag.el.classList.remove('l');
      }
      return;
    }
    for (const tag of TAGS) {
      const w = tag.el.offsetWidth;
      const maxX = W - 8 - w;
      const x = clamp(cx + tag.at[0] * scale - (tag.left ? w : 0), 0, maxX);
      const y = cy + tag.at[1] * scale;
      tag.from = [tag.left ? x + w + 3 : x - 3, y + tag.el.offsetHeight / 2];
      tag.el.style.left = x + 'px';
      tag.el.style.top = y + 'px';
      tag.el.classList.toggle('l', tag.left);
    }
  }

  function fitCanvas() {
    const ground = cy + GROUND * scale;
    const ends = phone ? [] : TAGS.map(tag => tag.from);
    const xs = [cx - groundHalf * scale, cx + groundHalf * scale, ...ends.map(p => p[0])];
    const ys = [cy - HEAD_TOP * scale, ground + 9, ...ends.map(p => p[1])];
    const x = Math.max(0, Math.floor(Math.min(...xs)) - 4);
    const y = Math.max(0, Math.floor(Math.min(...ys)) - 4);
    inked = {
      x,
      y,
      w: Math.min(W, Math.ceil(Math.max(...xs)) + 4) - x,
      h: Math.min(H, Math.ceil(Math.max(...ys)) + 4) - y,
    };
    canvas.style.left = x + 'px';
    canvas.style.top = y + 'px';
    canvas.style.width = inked.w + 'px';
    canvas.style.height = inked.h + 'px';
    canvas.width = Math.round(inked.w * DPR);
    canvas.height = Math.round(inked.h * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, -x * DPR, -y * DPR);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = ink;
    groundInk = ctx.createLinearGradient(cx - groundHalf * scale, 0, cx + groundHalf * scale, 0);
    groundInk.addColorStop(0, 'rgba(233, 231, 226, 0)');
    groundInk.addColorStop(0.12, ink);
    groundInk.addColorStop(0.88, ink);
    groundInk.addColorStop(1, 'rgba(233, 231, 226, 0)');
  }

  // a swinging foot leaves the ground and lands at the ground's own speed
  function swing(leg, from, to, carry, s) {
    leg.x = from + (to - from) * smooth(s) + carry * s * (1 - s) * (1 - 2 * s);
    leg.lift = swingHeight(speed) * Math.sin(Math.PI * s) ** 2;
  }

  function stepGait(dt) {
    const goal = age < 1.2 ? 0 : held.speed;
    speed += clamp(goal - speed, -MAX_ACCEL_MPS2 * dt, MAX_ACCEL_MPS2 * dt);
    travel += speed * dt;
    const rate = stridesPerSecond(speed);
    const advance = rate * dt;
    phase = (phase + advance) % 1;
    trunkY = -0.004 * (speed / MAX_SPEED_MPS) * Math.cos(4 * Math.PI * phase);
    const reach = stanceTravel(speed) / 2;
    for (const leg of LEGS) {
      const p = (phase + leg.offset) % 1;
      if (leg.swing) {
        leg.swing.s += advance / (1 - DUTY);
        if (leg.swing.s >= 1) {
          // it landed part of a frame ago and has moved with the ground since
          const since = ((leg.swing.s - 1) * (1 - DUTY)) / rate;
          leg.spot = leg.hipX + STAND_X - reach - travel + speed * since;
          leg.swing = null;
        }
      }
      const planted = leg.spot + travel - leg.hipX;
      if (!leg.swing && p >= DUTY && (speed > 0 || Math.abs(planted - STAND_X) > HOME_SLACK_M)) {
        // lifting on time, it left the ground part of a frame ago
        const late = p - advance < DUTY ? p - DUTY : 0;
        leg.swing = { from: planted - (speed * late) / rate, s: late / (1 - DUTY) };
      }
      if (leg.swing) {
        swing(leg, leg.swing.from, STAND_X - reach, swingTravel(speed), leg.swing.s);
      } else {
        leg.x = planted;
        leg.lift = 0;
      }
    }
  }

  // reduced motion: a stride held three quarters through a stance
  function poseStill() {
    speed = held.speed;
    yaw = held.heading;
    const reach = stanceTravel(speed) / 2;
    for (const leg of LEGS) {
      const p = (0.42 + leg.offset) % 1;
      if (p < DUTY || speed === 0) {
        leg.x = STAND_X + reach * ((2 * p) / DUTY - 1);
        leg.lift = 0;
      } else {
        swing(leg, STAND_X + reach, STAND_X - reach, swingTravel(speed), (p - DUTY) / (1 - DUTY));
      }
    }
  }

  // two-link inverse kinematics, the knee to the rear
  function solveLegs() {
    for (const leg of LEGS) {
      const dx = leg.x;
      const dy = STAND_Y - leg.lift - trunkY;
      const d = Math.hypot(dx, dy);
      const thigh =
        Math.atan2(dx, dy) + Math.acos((THIGH * THIGH + d * d - CALF * CALF) / (2 * THIGH * d));
      const topY = trunkY + HIP_DROP;
      leg.hip = px(leg.hipX, trunkY);
      leg.top = px(leg.hipX, topY);
      leg.knee = px(leg.hipX + THIGH * Math.sin(thigh), topY + THIGH * Math.cos(thigh));
      leg.foot = px(leg.hipX + dx, topY + dy);
    }
  }

  function stroke(alpha, width, dash = []) {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.stroke();
  }
  function line(a, b, f) {
    if (f <= 0) return;
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
  }
  function ring(x, y, r) {
    if (r <= 0) return;
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  function capsule(a, b, r) {
    const tilt = Math.atan2(b[1] - a[1], b[0] - a[0]);
    ctx.moveTo(a[0] - r * Math.sin(tilt), a[1] + r * Math.cos(tilt));
    ctx.arc(a[0], a[1], r, tilt + Math.PI / 2, tilt - Math.PI / 2);
    ctx.arc(b[0], b[1], r, tilt - Math.PI / 2, tilt + Math.PI / 2);
    ctx.closePath();
  }
  function roundedBox(x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGround(shown) {
    const y = cy + GROUND * scale;
    ctx.beginPath();
    ctx.moveTo(cx - groundHalf * scale, y);
    ctx.lineTo(cx + groundHalf * scale, y);
    const first = Math.ceil((-groundHalf - travel) / TICK_M);
    for (let k = first; k * TICK_M + travel < groundHalf; k++) {
      const x = cx + (k * TICK_M + travel) * scale;
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + (k % 4 ? 4 : 8));
    }
    ctx.strokeStyle = groundInk;
    stroke(0.3 * shown, 1);
    ctx.strokeStyle = ink;
  }

  function drawSilhouette(shown) {
    ctx.beginPath();
    for (const leg of LEGS) {
      if (leg.near) continue;
      capsule(leg.top, leg.knee, 0.022 * scale);
      capsule(leg.knee, leg.foot, 0.016 * scale);
    }
    stroke(0.22 * shown, 1, DOTTED);

    const [bx, by] = px(-BODY_L / 2, trunkY - BODY_H / 2);
    ctx.beginPath();
    roundedBox(bx, by, BODY_L * scale, BODY_H * scale, 0.03 * scale);
    stroke(0.55 * shown * (1 + 0.5 * imu.glow), 1, DOTTED);

    ctx.beginPath();
    ctx.moveTo(...px(-NOSE, trunkY - 0.045));
    ctx.lineTo(...px(-BODY_L / 2 - 0.06, trunkY + 0.03));
    ctx.lineTo(...px(-BODY_L / 2 + 0.02, trunkY + 0.03));
    ctx.lineTo(...px(-BODY_L / 2 + 0.02, trunkY - 0.052));
    ctx.closePath();
    stroke(0.55 * shown * (1 + 0.7 * head.glow), 1, DOTTED);

    for (const leg of [FRONT_NEAR, REAR_NEAR]) {
      const tone = 0.5 * shown * (leg === FRONT_NEAR ? 1 + 0.6 * lengths.glow : 1);
      ctx.beginPath();
      capsule(leg.top, leg.knee, 0.024 * scale);
      capsule(leg.knee, leg.foot, 0.017 * scale);
      stroke(tone, 1, DOTTED);
      ctx.beginPath();
      ring(...leg.foot, FOOT_R * scale);
      stroke(tone, 1);
    }

    const camera = px(-BODY_L / 2 - 0.068, trunkY - 0.012);
    const lidar = px(-BODY_L / 2 - 0.04, trunkY - 0.045);
    ctx.beginPath();
    ctx.arc(camera[0], camera[1], 2.5, 0, Math.PI * 2);
    ctx.globalAlpha = shown * (0.6 + 0.4 * head.glow);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lidar[0], lidar[1], 0.028 * scale, Math.PI * 1.1, Math.PI * 1.9);
    stroke(shown * (0.6 + 0.4 * head.glow), 1);
    const unit = px(0.02, trunkY - 0.01);
    ctx.beginPath();
    ctx.rect(unit[0] - 5, unit[1] - 5, 10, 10);
    stroke(shown * (0.5 + 0.5 * imu.glow), 1);
    ctx.beginPath();
    ctx.arc(unit[0], unit[1], 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSkeleton() {
    ctx.beginPath();
    line(px(-HIP_X, trunkY), px(HIP_X, trunkY), ramp(age, 0, 0.12));
    stroke(0.85, 1.5);
    LEGS.forEach((leg, i) => {
      const f = ramp(age, 0.12 + i * 0.18, 0.36 + i * 0.18);
      if (f <= 0) return;
      const motors = leg === REAR_NEAR ? joints.glow : joints.glow / 2;
      ctx.beginPath();
      line(leg.hip, leg.top, smooth(f / 0.15));
      line(leg.top, leg.knee, smooth((f - 0.1) / 0.45));
      line(leg.knee, leg.foot, smooth((f - 0.5) / 0.5));
      const width = leg.near ? 1.5 : 1;
      stroke(leg.near ? 0.95 : 0.42, leg === FRONT_NEAR ? width + lengths.glow : width);
      const r = (leg.near ? 4.5 : 3.5) + motors * 1.5;
      ctx.beginPath();
      ring(...leg.hip, r * smooth(f / 0.1));
      ring(...leg.top, r * 0.8 * smooth((f - 0.15) / 0.1));
      ring(...leg.knee, r * smooth((f - 0.55) / 0.1));
      stroke(Math.min(1, (leg.near ? 0.95 : 0.5) * (1 + 0.4 * motors)), 1 + motors * 0.8);
    });
  }

  function drawLeaders() {
    const shown = ramp(age, 1.2, 1.5);
    if (phone || shown <= 0) return;
    for (const tag of TAGS) {
      const [ax, ay] = tag.anchor();
      ctx.beginPath();
      ctx.moveTo(...tag.from);
      ctx.lineTo(ax, ay);
      stroke(shown * (0.3 + 0.6 * tag.glow), 1);
      const r = 2.5 + tag.glow;
      ctx.globalAlpha = shown * (0.7 + 0.3 * tag.glow);
      ctx.fillRect(ax - r, ay - r, r * 2, r * 2);
    }
  }

  function drawSketch() {
    const shown = ramp(age, 0.85, 1.2);
    ctx.clearRect(inked.x, inked.y, inked.w, inked.h);
    solveLegs();
    drawGround(shown);
    if (shown > 0) drawSilhouette(shown);
    drawSkeleton();
    drawLeaders();
  }

  // straight ahead is up; a heading still waiting for its tick is marked hollow
  function drawDial() {
    const g = dialCtx;
    const c = Math.floor(dialSize / 2) + 0.5;
    const r = c - 8;
    // px per metre: the rear knees, the farthest point from the centre, reach 0.72 of the ring
    const u = (0.72 * r) / Math.hypot(HIP_X + KNEE_BACK, LEG_Y);
    const needle = r * 0.76;
    const spoke = (deg, from, to) => {
      const a = (deg * Math.PI) / 180;
      g.moveTo(c + from * Math.sin(a), c - from * Math.cos(a));
      g.lineTo(c + to * Math.sin(a), c - to * Math.cos(a));
    };
    const onRing = (deg, size) => {
      const a = (deg * Math.PI) / 180;
      return [
        Math.round(c + r * Math.sin(a) - size / 2),
        Math.round(c - r * Math.cos(a) - size / 2),
      ];
    };
    dialStale = false;
    g.clearRect(0, 0, dialSize, dialSize);
    g.lineWidth = 1;
    g.setLineDash([]);

    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    for (let deg = 0; deg < 360; deg += 90) spoke(deg, r, r + (deg ? 3 : 6));
    g.globalAlpha = 0.3;
    g.stroke();

    if (wanted.heading !== held.heading) {
      const [x, y] = onRing(wanted.heading, 7);
      g.beginPath();
      spoke(wanted.heading, needle, r);
      g.setLineDash(DOTTED);
      g.globalAlpha = 0.72;
      g.stroke();
      g.setLineDash([]);
      g.clearRect(x, y, 7, 7);
      g.strokeRect(x + 0.5, y + 0.5, 6, 6);
    }

    g.save();
    g.translate(c, c);
    g.rotate((yaw * Math.PI) / 180);
    g.scale(u, u);
    g.lineWidth = 1 / u;
    g.globalAlpha = 0.85;
    g.beginPath();
    g.rect(-BODY_W / 2, -BODY_L / 2, BODY_W, BODY_L);
    for (const y of [-HIP_X, HIP_X]) {
      for (const side of [-1, 1]) {
        g.moveTo((side * BODY_W) / 2, y);
        g.lineTo(side * LEG_Y, y);
        g.lineTo(side * LEG_Y, y + KNEE_BACK);
      }
    }
    g.stroke();
    g.beginPath();
    g.moveTo(-0.038, -BODY_L / 2);
    g.lineTo(-0.026, -NOSE);
    g.lineTo(0.026, -NOSE);
    g.lineTo(0.038, -BODY_L / 2);
    g.fill();
    g.restore();

    g.globalAlpha = 1;
    g.beginPath();
    spoke(held.heading, needle, r);
    g.stroke();
    g.fillRect(...onRing(held.heading, 5), 5, 5);
  }

  function draw() {
    drawSketch();
    drawDial();
  }

  function showCommand() {
    speedHeld.textContent = held.speed.toFixed(1);
    headingHeld.textContent = degrees(held.heading);
    speedNext.textContent = wanted.speed === held.speed ? '' : '→ ' + wanted.speed.toFixed(1);
    headingNext.textContent = wanted.heading === held.heading ? '' : '→ ' + degrees(wanted.heading);
    dialStale = true;
  }

  function describeSliders() {
    speedInput.setAttribute('aria-valuetext', `${wanted.speed.toFixed(1)} meters per second`);
    headingInput.setAttribute('aria-valuetext', degreesInWords(wanted.heading));
  }

  function announce() {
    const course = `on a heading of ${degreesInWords(held.heading)}`;
    status.textContent = held.speed
      ? `The robot now walks at ${held.speed.toFixed(1)} meters per second ${course}.`
      : `The robot now stands ${course}.`;
  }

  function showTags() {
    if (tagsShown) return;
    tagsShown = true;
    wrap.classList.add('resolved');
  }

  function tickNavigator(dt) {
    sinceTick += dt;
    const period = stepsPerTick / CONTROL_HZ;
    if (sinceTick >= period) {
      sinceTick %= period;
      if (pending()) {
        Object.assign(held, wanted);
        showCommand();
        unsaid = true;
      }
      // one message, once the sliders have come to rest
      if (unsaid && performance.now() - lastInput > 300) {
        unsaid = false;
        announce();
      }
    }
    // a canvas, not a style: a style change every frame repaints far more of the page
    const level = 1 - smooth(sinceTick / LAMP_S);
    if (level !== lampLevel) {
      lampLevel = level;
      lampCtx.clearRect(0, 0, lamp.width, lamp.height);
      lampCtx.globalAlpha = level;
      lampCtx.fillRect(0, 0, lamp.width, lamp.height);
    }
  }

  function turn(dt) {
    if (yaw === held.heading) return;
    const error = ((held.heading - yaw + 540) % 360) - 180;
    if (Math.abs(error) < 0.1) yaw = held.heading;
    else yaw += clamp(error * 4, -MAX_YAW_DPS, MAX_YAW_DPS) * dt;
    dialStale = true;
  }

  function easeGlow(dt) {
    for (const tag of TAGS) {
      const to = lit(tag);
      tag.glow += (to - tag.glow) * (1 - Math.exp(-9 * dt));
      if (Math.abs(to - tag.glow) < 0.01) tag.glow = to;
    }
  }

  const resting = () =>
    (age > 2 || !entered) &&
    lampLevel === 0 &&
    !unsaid &&
    !pending() &&
    speed === 0 &&
    held.speed === 0 &&
    yaw === held.heading &&
    LEGS.every(leg => !leg.swing && Math.abs(leg.x - STAND_X) <= HOME_SLACK_M) &&
    TAGS.every(tag => tag.glow === lit(tag));

  function frame(dt) {
    if (entered) age += dt;
    if (age > 1.5) showTags();
    tickNavigator(dt);
    stepGait(dt);
    turn(dt);
    easeGlow(dt);
    if (sketchSeen && entered) drawSketch();
    if (dialStale) drawDial();
    if (resting()) sleep();
  }

  function wake() {
    if (awake || !bandSeen) return;
    awake = true;
    S.add(frame);
  }
  function sleep() {
    awake = false;
    S.remove(frame);
  }

  function still() {
    Object.assign(held, wanted);
    showCommand();
    for (const tag of TAGS) tag.glow = lit(tag);
    poseStill();
    draw();
  }
  const refresh = S.REDUCED ? still : wake;

  function onCommand() {
    wanted.speed = +speedInput.value;
    wanted.heading = +headingInput.value;
    describeSliders();
    lastInput = performance.now();
    showCommand();
    refresh();
  }
  speedInput.addEventListener('input', onCommand);
  headingInput.addEventListener('input', onCommand);

  // a touch that turns out to be a scroll puts the slider and the command back
  for (const input of [speedInput, headingInput]) {
    let before = null;
    input.addEventListener('pointerdown', e => {
      before = e.pointerType === 'touch' ? { value: input.value, held: { ...held }, unsaid } : null;
    });
    input.addEventListener('pointercancel', () => {
      if (!before) return;
      input.value = before.value;
      Object.assign(held, before.held);
      unsaid = before.unsaid;
      before = null;
      onCommand();
    });
  }

  for (const button of tickButtons) {
    button.addEventListener('click', () => {
      stepsPerTick = +button.value;
      for (const other of tickButtons) other.setAttribute('aria-pressed', other === button);
      rateText.data = `every ${stepsPerTick} steps`;
    });
  }

  // a focused tag is never left invisible: the sketch finishes drawing at once
  function finish() {
    entered = true;
    age = Math.max(age, 1.5);
    showTags();
  }
  for (const tag of TAGS) {
    const set = (key, on) => {
      tag[key] = on;
      refresh();
    };
    if (HOVER) {
      tag.el.addEventListener('pointerenter', () => set('hovered', true));
      tag.el.addEventListener('pointerleave', () => set('hovered', false));
    }
    tag.el.addEventListener('focus', () => {
      finish();
      set('focused', tag.el.matches(':focus-visible'));
    });
    tag.el.addEventListener('blur', () => set('focused', false));
    tag.el.addEventListener('click', () => {
      tag.el.setAttribute('aria-pressed', !tag.pinned);
      set('pinned', !tag.pinned);
    });
  }

  lamp.width = Math.round(4 * DPR);
  lamp.height = Math.round(4 * DPR);
  layout();
  // the browser may have restored the sliders from history
  describeSliders();
  showCommand();
  band.classList.add('live');
  if (S.REDUCED) {
    age = 2;
    showTags();
    still();
  } else {
    draw();
    new IntersectionObserver(entries => {
      bandSeen = entries[entries.length - 1].isIntersecting;
      if (bandSeen) wake();
      else sleep();
    }).observe(band);
    new IntersectionObserver(
      entries => {
        const entry = entries[entries.length - 1];
        sketchSeen = entry.isIntersecting;
        // to resolve on entry, or to redraw a robot that came to rest off screen
        if (sketchSeen) wake();
        if (entered || entry.intersectionRatio < 0.15) return;
        entered = true;
        // the tags arrive even where frames are throttled or the sketch has already scrolled away
        setTimeout(() => {
          showTags();
          if (age < 1.5) {
            age = 2;
            drawSketch();
          }
        }, 1600);
      },
      { threshold: [0, 0.15] },
    ).observe(sketch);
  }

  forcedColors.addEventListener('change', () => {
    layout();
    draw();
  });

  // the tags are placed by their width: again once the web font is in
  document.fonts.ready.then(() => {
    layout();
    draw();
  });

  let resizeTimer = 0;
  addEventListener(
    'resize',
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        layout();
        draw();
      }, 150);
    },
    { passive: true },
  );
})();

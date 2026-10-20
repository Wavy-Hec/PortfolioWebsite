/* SUMI v4 — one wind, one loop. The wind model (gust + scroll + the pointer's gusts) drives the petals, the ASCII field in the hero
   (js/sumi-field.js), the ink stroke down the chapter rail, the grass in the footer, the lean of the ASCII scene (js/sumi-city.js), the
   wind bed (sound, opt-in) and the radar's chapter blips; the hero's parallax, the chapter title cards, the opening (the dial, the brush,
   the title card), the "!" over Raiden, the stamping seals, the tuning strip, and the secret (140.85 / Konami / the strip -> codec call ->
   Shadow Moses) live here too.
   The loop: one requestAnimationFrame chain paced to ~30 fps by a timer; asleep when the tab is hidden, while the game is open, and
   under reduced motion (nothing moves at all; the scenes are one still frame; the headings are simply present). */
(() => {
  'use strict';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // dev: any uncaught error surfaces in the title so a headless --dump-dom can see it
  addEventListener('error', e => { document.title = 'WF-ERR ' + e.message; });
  addEventListener('unhandledrejection', e => { document.title = 'WF-ERR ' + (e.reason && e.reason.message || e.reason); });
  const q = new URLSearchParams(location.search);
  const gameOpen = () => document.body.classList.contains('game-open');
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  /* ---------- footer variant: ?footer=a (grass, default) | ?footer=b (shinkawa) | ?footer=both (stacked, captions on) ----------
     The markup ships with B and the captions hidden, so a URL without the switch (or without JS) has exactly one footer landmark. */
  {
    const f = q.get('footer');
    const foots = document.querySelectorAll('.foot'), devs = document.querySelectorAll('.dev');
    if (f === 'both' || f === 'b') document.querySelectorAll('.art-plate[data-src]').forEach(i => { i.src = i.dataset.src; });   // the B plate (42 KB) loads only when B is shown
    if (f === 'both') { foots.forEach(x => { x.hidden = false; }); devs.forEach(d => { d.hidden = false; }); }
    else if (f === 'b') {
      foots.forEach(x => { x.hidden = x.dataset.art !== 'shinkawa'; if (x.dataset.art === 'shinkawa') x.id = 'contact'; else x.removeAttribute('id'); });
      const a = document.getElementById('codec-launch'); if (a) a.removeAttribute('id');
      const b = document.querySelector('.foot[data-art="shinkawa"] .freq'); if (b) b.id = 'codec-launch';
    }
  }

  // ?horizon=moon: the fallback horizon, a low moon instead of the structure (css .hero.horizon-moon)
  if (q.get('horizon') === 'moon') { const h = document.querySelector('.hero'); if (h) h.classList.add('horizon-moon'); }

  /* ---------- the wind and the loop ----------
     gust(t): two slow sines, 0.25..1.25. Scroll adds a burst (|px/s|, decaying in ~1/3 s) so a fast scroll is a gust that settles.
     strength = gust + burst feeds the petals; lean (0..1) is the same wind normalised for everything that tilts. */
  const wind = { gust: 0.75, strength: 0.75, lean: 0, v: 0, puff: 0 };
  const subs = [], gusts = [];
  let raf = 0, timer = 0, prev = 0, scrollV = 0, lastY = scrollY;
  const FRAME_MS = 1000 / 30;
  const S = window.SUMI = { REDUCED, wind, gusts, add(fn) { subs.push(fn); start(); }, remove(fn) { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); } };
  addEventListener('scroll', () => { const y = scrollY; scrollV += (y - lastY); lastY = y; }, { passive: true });
  /* the pointer is a gust source: moving the mouse injects a gust at the pointer (x, y, strength 0..1, born now); the field bends under it
     first and the bend travels in the wind direction, the petals near it accelerate, the wind bed swells. A tap sends one. Gusts live 1.1 s,
     at most six; a move within 90 ms of the last feeds that gust instead of spawning another. Nothing under reduced motion. */
  S.gust = (x, y, s) => {
    if (REDUCED) return;
    const now = performance.now(), last = gusts[gusts.length - 1];
    if (last && now - last.t0 < 90) { last.x = x; last.y = y; last.s = Math.max(last.s, s); return; }
    if (gusts.length >= 6) gusts.shift();
    gusts.push({ x, y, s, t0: now });
  };
  {
    let px = -1, pt = 0;
    addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      const now = performance.now(), dtp = now - pt;
      const v = px >= 0 && dtp > 0 && dtp < 120 ? Math.abs(e.clientX - px) / dtp : 0.4;   // px per ms
      px = e.clientX; pt = now;
      S.gust(e.clientX, e.clientY, clamp(0.35 + v * 0.6, 0.35, 1));
    }, { passive: true });
    addEventListener('pointerdown', e => { if (e.pointerType === 'touch') S.gust(e.clientX, e.clientY, 1); }, { passive: true });
  }
  function tickWind(dt, now) {
    scrollV *= Math.exp(-dt * 3);
    wind.v = scrollV;
    wind.gust = 0.75 + 0.35 * Math.sin(now / 5200) + 0.15 * Math.sin(now / 1700 + 1.3);
    wind.strength = wind.gust + Math.min(2.2, Math.abs(scrollV) * 0.004);
    wind.lean = clamp((wind.strength - 0.3) / 1.6, 0, 1);
    while (gusts.length && now - gusts[0].t0 > 1100) gusts.shift();
    let puff = 0; for (const g of gusts) puff = Math.max(puff, g.s * Math.exp(-(now - g.t0) / 400));
    wind.puff = puff;                                                     // the freshest gust, 0..1, for the sound bed
  }
  function loop(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - prev) / 1000 || 0.016); prev = now;
    tickWind(dt, now);
    for (const fn of subs) fn(dt, now);
    timer = setTimeout(() => { timer = 0; raf = requestAnimationFrame(loop); }, Math.max(0, FRAME_MS - (performance.now() - now)));
  }
  function start() { if (REDUCED || raf || timer || document.hidden || gameOpen()) return; prev = performance.now(); raf = requestAnimationFrame(loop); }
  function stop() { cancelAnimationFrame(raf); clearTimeout(timer); raf = 0; timer = 0; }
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  addEventListener('gameopen', stop);
  addEventListener('gameclose', start);

  /* ---------- the petals: Raiden's red petals, blown down-right across the page, behind the ink ----------
     One fixed canvas, <= 24 petals, three hand-drawn petal paths, a tumble; the wind above moves them. */
  (() => {
    const canvas = document.querySelector('canvas.petals');
    if (!canvas || REDUCED) return;
    const ctx = canvas.getContext('2d');
    const RED = '#c9333a', DPR = Math.min(2, devicePixelRatio || 1);
    const SHAPES = [
      new Path2D('M0 -.5C.34 -.46 .52 -.14 .44 .22 .38 .44 .14 .52 0 .4-.14 .52-.38 .44-.44 .22-.52-.14-.34-.46 0-.5Z'),
      new Path2D('M0 -.5C.26 -.3 .28 .3 0 .5-.28 .3-.26-.3 0-.5Z'),
      new Path2D('M0 -.5C.42 -.22 .36 .34 0 .5-.2 .3-.3-.22 0-.5Z'),
    ];
    let W = 0, H = 0, petals = [], seed = 7;
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
      p.size = 10 + rnd() * 9; p.shape = SHAPES[Math.floor(rnd() * SHAPES.length)];
      p.vx = 55 + rnd() * 60; p.vy = 22 + rnd() * 34;
      p.rot = rnd() * Math.PI * 2; p.spin = (rnd() - 0.5) * 2.6; p.phase = rnd() * Math.PI * 2;
      p.sway = 10 + rnd() * 16; p.alpha = 0.6 + rnd() * 0.35;
      if (fresh) { p.x = rnd() * W; p.y = rnd() * H; }
      else if (rnd() < 0.6) { p.x = rnd() * W * 0.45 - 20; p.y = -20; }
      else { p.x = -20; p.y = rnd() * H * 0.6; }
      return p;
    }
    const HALO = 'rgba(233,231,226,.22)';                              // on sumi each petal wears a faint paper halo: two fills, no shadowBlur
    function draw(dt, now) {
      ctx.clearRect(0, 0, W, H);
      const w = wind.strength, lift = Math.sign(wind.v) * Math.min(1, Math.abs(wind.v) * 0.003);
      for (const p of petals) {
        let boost = 0;                                                      // the pointer's gusts: petals near one are blown on
        for (const g of gusts) {
          const age = (now - g.t0) / 1000, dx = p.x - g.x, dy = p.y - g.y, r = 120 + age * 320;
          if (dx < -r || dx > r || dy < -r || dy > r) continue;
          boost += g.s * Math.exp(-age * 2.4) * Math.exp(-(dx * dx + dy * dy) / (r * r));
        }
        p.x += (p.vx * w + boost * 320) * dt;
        p.y += (p.vy * w - lift * 40 + boost * 60) * dt + Math.cos(now / 900 + p.phase) * p.sway * dt;
        p.rot += p.spin * dt * (0.6 + 0.4 * w + boost * 2);
        if (p.x > W + 24 || p.y > H + 24 || p.y < -80) spawn(p, false);
        const s = p.size * (0.85 + 0.15 * Math.sin(now / 400 + p.phase));
        ctx.setTransform(DPR * s * 0.62, 0, 0, DPR * s, 0, 0);
        ctx.translate(p.x / (s * 0.62), p.y / s);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.alpha * 0.8;
        ctx.fillStyle = HALO; ctx.scale(1.7, 1.55); ctx.fill(p.shape); ctx.scale(1 / 1.7, 1 / 1.55);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = RED; ctx.fill(p.shape);
      }
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.globalAlpha = 1;
    }
    resize();
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); }, { passive: true });
    S.add(draw);
  })();

  /* ---------- the chapters: where the reader is (for the cards, the rail, the radar) ---------- */
  const chapters = [...document.querySelectorAll('[data-chapter]')];   // work, research, about, contact — in page order
  let activeIdx = -1;
  function findActive() {
    const mid = innerHeight * 0.5;
    let idx = -1;
    for (let i = 0; i < chapters.length; i++) { const r = chapters[i].getBoundingClientRect(); if (r.top <= mid) idx = i; }
    return idx;
  }

  /* ---------- the title cards: a chapter's numeral brushes in once, the first time the chapter is reached; then the heading.
     A chapter the reader jumped past (an anchor, a #hash landing: its top is above the viewport, or it lies above the active chapter)
     gets no card: it is simply there, so scrolling back up never meets blank paper. ---------- */
  (() => {
    if (REDUCED || !chapters.length) return;
    const pending = new Set(chapters.filter(c => c.querySelector('.tcard')));
    pending.forEach(c => c.classList.add('pending'));
    const carding = new Map();                                       // chapter -> its two timers, while the card plays
    function settle(c) { c.classList.remove('pending', 'carding'); c.classList.add('shown'); }
    function skip(c) { pending.delete(c); const t = carding.get(c); if (t) { t.forEach(clearTimeout); carding.delete(c); } settle(c); }
    function show(c) {
      pending.delete(c);
      if (S.sound) S.sound.tick();                                        // a soft tick as the card appears (only with the sound on)
      c.classList.add('carding');
      carding.set(c, [setTimeout(() => { c.classList.remove('pending'); c.classList.add('shown'); }, 1150),
                      setTimeout(() => { c.classList.remove('carding'); carding.delete(c); }, 1700)]);
    }
    // a #hash landing: the target chapter (and all before it) is shown at once
    const target = location.hash && document.getElementById(location.hash.slice(1));
    const landed = target && target.closest('[data-chapter]');
    if (landed) for (const c of chapters) { if (pending.has(c)) skip(c); if (c === landed) break; }
    S.add(() => {
      if (!pending.size && !carding.size) return;
      const active = findActive();
      for (const c of pending) {
        const r = c.getBoundingClientRect();
        if (r.top < 0 || chapters.indexOf(c) < active) skip(c);
        else if (r.top < innerHeight * 0.72 && r.bottom > innerHeight * 0.25) show(c);
      }
      for (const c of carding.keys()) {                              // a card still playing while the reader has already passed it: cut it
        if (c.getBoundingClientRect().top < -120 || chapters.indexOf(c) < active) skip(c);
      }
    });
  })();

  /* ---------- the guiding wind: a 1 px ink line down the chapter rail, its brushed head easing toward where the reader is ---------- */
  (() => {
    const rail = document.querySelector('.rail'), main = document.querySelector('main'), ink = rail && rail.querySelector('.rail-ink'), head = rail && rail.querySelector('.rail-head');
    if (!rail || !ink || !head || REDUCED) return;
    let y0 = 0, y1 = 0, top = 0, pos = -1, lastLean = -1;
    function measure() {
      const mark = document.querySelector('#work .mark'), band = document.querySelector('.band');
      if (!mark || !band) return;
      const mr = main.getBoundingClientRect();
      top = mr.top + scrollY;
      y0 = mark.getBoundingClientRect().top + scrollY - top + 44;   // just under the numeral
      y1 = band.getBoundingClientRect().top + scrollY - top + 10;   // into the ink of the About band
    }
    measure();
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(measure, 160); }, { passive: true });
    addEventListener('load', measure);
    S.add((dt) => {
      if (innerWidth <= 720) return;
      const target = clamp(scrollY + innerHeight * 0.55 - top, y0, y1);
      if (pos < 0) pos = target;
      const d = target - pos;
      if (Math.abs(d) < 0.3 && Math.abs(wind.lean - lastLean) < 0.01) return;
      lastLean = wind.lean;
      pos += d * (1 - Math.exp(-dt * 2.6));
      const len = Math.max(0, pos - y0);
      ink.style.transform = `translateY(${y0}px) scaleY(${len})`;
      head.style.transform = `translate(${wind.lean * 4 - 1}px, ${pos}px) rotate(${-2 + wind.lean * 12 + clamp(d * 0.02, -10, 10)}deg)`;   // the head leans with the wind (right, like the petals and the grass) and toward where it is going
      rail.classList.toggle('moving', Math.abs(d) > 40);
    });
  })();

  /* ---------- the grass (footer A): the blade tips, a masked duplicate layer, shear with the gust (<= 2 deg) ---------- */
  (() => {
    const sway = document.querySelector('.art-grass-sway'), foot = sway && sway.closest('.foot');
    if (!sway || REDUCED) return;
    let vis = false;
    new IntersectionObserver(es => { vis = es.some(e => e.isIntersecting); }, { threshold: 0 }).observe(foot);
    S.add(() => { if (vis) sway.style.transform = `skewX(${(-0.4 - wind.lean * 1.6).toFixed(2)}deg)`; });
  })();

  /* ---------- the radar's blips are the four chapters: a CSS overlay on js/radar.js's wrapper (that file is shared and untouched).
     The one whose chapter is in view sits bright; each pings as the sweep passes (the sweep angle is reconstructed: radar.js turns
     0.0023 rad per drawn ms from the moment it starts, which is this DOMContentLoaded). ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const wrap = document.querySelector('.soliton-radar');
    if (!wrap || !chapters.length) return;
    const ov = document.createElement('div'); ov.className = 'radar-ch';
    const ANG = [-1.85, -0.35, 1.05, 2.45], R = 0.62, NUM = '一二三四';
    const dots = ANG.map((a, i) => {
      const d = document.createElement('i');
      d.style.left = (50 + Math.cos(a) * R * 43) + '%'; d.style.top = (50 + Math.sin(a) * R * 43) + '%';
      d.dataset.n = NUM[i]; ov.appendChild(d); return d;
    });
    wrap.appendChild(ov);
    const t0 = performance.now(); let hiddenAt = 0, hiddenMs = 0;
    document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = performance.now(); else if (hiddenAt) { hiddenMs += performance.now() - hiddenAt; hiddenAt = 0; } });
    const setActive = () => { const i = findActive(); if (i !== activeIdx) { activeIdx = i; dots.forEach((d, k) => d.classList.toggle('on', k === i)); } };
    setActive();
    if (REDUCED) { addEventListener('scroll', setActive, { passive: true }); return; }
    S.add((dt, now) => {
      setActive();
      const sweep = ((now - t0 - hiddenMs) * 0.0023) % (Math.PI * 2);
      dots.forEach((d, k) => { let a = sweep - ANG[k]; a = Math.abs(((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI); d.classList.toggle('ping', a < 0.45); });
    });
  });

  /* ---------- the "!" over Raiden: hover or focus on the figure pops the alert plate above his head, once per hover ---------- */
  (() => {
    const fig = document.querySelector('.hero .figure'), hero = document.querySelector('.hero'), plate = hero && hero.querySelector('.alert'), img = fig && fig.querySelector('img');
    if (!fig || !plate || !img) return;
    let armed = true, t = 0;
    const touch = matchMedia('(hover: none)').matches;
    function pop(e) {
      if (!armed) return; armed = false;
      const r = img.getBoundingClientRect(), h = hero.getBoundingClientRect();   // over his head: 56 % across the plate, just under its top edge
      plate.style.left = Math.min(h.width - 60, r.left - h.left + r.width * 0.56) + 'px';
      plate.style.top = Math.max(8, r.top - h.top + r.height * 0.03) + 'px';
      plate.classList.remove('on'); void plate.offsetWidth; plate.classList.add('on');
      clearTimeout(t); t = setTimeout(() => plate.classList.remove('on'), 1500);
      if (!touch && !(e && e.pointerType === 'touch')) playCodecRing();
    }
    fig.addEventListener('pointerenter', pop);
    fig.addEventListener('pointerleave', () => { armed = true; });
    fig.addEventListener('focus', pop);
    fig.addEventListener('blur', () => { armed = true; });
  })();

  /* ---------- the hero's parallax: three layers moved from scrollY in the loop (sky .2x, figure .5x, field .9x: a layer at rate f lags the
     page by (1 - f) * scrollY), only while the hero is on screen; no scroll listener does layout ---------- */
  (() => {
    const hero = document.querySelector('.hero'), sky = hero && hero.querySelector('.sky'), fig = hero && hero.querySelector('.figure'), field = hero && hero.querySelector('.field');
    if (!hero || !sky || !fig || !field || REDUCED) return;
    let last = -1;
    S.add(() => {
      const y = scrollY;
      if (y === last) return;
      if (y > hero.offsetHeight + 80) { last = -1; return; }
      last = y;
      sky.style.transform = `translate3d(0,${(y * 0.8).toFixed(1)}px,0)`;
      fig.style.transform = `translate3d(0,${(y * 0.5).toFixed(1)}px,0)`;
      field.style.transform = `translate3d(0,${(y * 0.1).toFixed(1)}px,0)`;
    });
  })();

  /* ---------- the chapter monuments: each lags the page by .2x of its chapter's travel across the viewport (a far thing moves slower), from the loop ---------- */
  (() => {
    const items = [...document.querySelectorAll('.chapter .monument')].map(m => ({ m, c: m.closest('.chapter'), last: null }));
    if (!items.length || REDUCED) return;
    S.add(() => {
      if (innerWidth <= 960) return;                                     // hidden there (css)
      const vh = innerHeight;
      for (const it of items) {
        const r = it.c.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        const y = clamp(Math.round((vh - r.top) * 0.2), 0, 90);            // capped: it drifts level with the heading, never down to the rows
        if (y === it.last) continue;
        it.last = y; it.m.style.transform = `translate3d(0,${y}px,0)`;
      }
    });
  })();

  /* ---------- the opening: html.opening is set inline in <head> (first load of the session, no hash, no reduced motion). Black screen; the
     dial climbs 140.00 -> 140.85 over 1.6 s (the needle settles, "connected"), at 2 s the screen goes and the paper brush sweeps the scene in
     (css), the title card lands at 2.45 s and fades from 3.6 s; done at 4.2 s. Any key, click or tap jumps to the finished state: the class
     comes off and every opening animation with it. Remembered for the session. ---------- */
  (() => {
    const html = document.documentElement;
    if (!html.classList.contains('opening')) return;
    const hz = document.querySelector('.dial-hz'), dial = document.querySelector('.dial'), st = document.querySelector('.dial-status');
    const t0 = performance.now(); let done = false, settled = false;
    const finish = () => {
      if (done) return; done = true;
      html.classList.remove('opening'); S.remove(step);
      removeEventListener('keydown', finish); removeEventListener('pointerdown', finish);
      try { sessionStorage.setItem('sumi-opened', '1'); } catch (e) {}
    };
    function step(dt, now) {
      const t = (now - t0) / 1000;
      if (t < 1.6) { const e = 1 - Math.pow(1 - t / 1.6, 3); if (hz) hz.textContent = (140 + 0.85 * e).toFixed(2); }
      else if (!settled) { settled = true; if (hz) hz.textContent = '140.85'; if (dial) dial.classList.add('settled'); if (st) st.textContent = 'connected'; if (S.sound) S.sound.ring(); }
      if (t >= 4.2) finish();
    }
    S.add(step);
    addEventListener('keydown', finish); addEventListener('pointerdown', finish);
    setTimeout(finish, 5000);                                           // belt and braces: the loop may be asleep (hidden tab)
  })();

  /* ---------- the hanko stamps itself on click: scale 1.15 -> 1 with a 6 deg settle (css .stamp) and a paper ring that expands and fades;
     the nav seal is the wordmark link, so its click also goes to the top ---------- */
  document.querySelectorAll('.seal').forEach(seal => {
    const host = seal.closest('.wordmark, .seal-end, .legal-l') || seal.parentElement;
    const fire = () => {
      seal.classList.remove('stamp'); void seal.getBoundingClientRect(); seal.classList.add('stamp');
      if (REDUCED) return;
      const r = document.createElement('i'); r.className = 'seal-ring';
      const sr = seal.getBoundingClientRect(), hr = host.getBoundingClientRect();
      r.style.left = (sr.left - hr.left) + 'px'; r.style.top = (sr.top - hr.top) + 'px'; r.style.width = sr.width + 'px'; r.style.height = sr.height + 'px';
      host.appendChild(r); setTimeout(() => r.remove(), 600);
    };
    (seal.closest('a') || seal).addEventListener('click', fire);
  });

  /* ---------- sound, opt-in: the nav toggle (a real button, aria-pressed), off by default, remembered for the session. On = a WebAudio wind
     bed (pink-ish noise -> lowpass whose cutoff rides a slow LFO and the wind model -> ~-28 dB, 2 s fade), the codec beep on the 140.85
     interactions and a soft tick when a chapter card appears. Never autoplays: the AudioContext is created only from a user gesture (the
     toggle's click; or, when the session remembers "on", the first click or key of the page). Hidden page = fade out. ---------- */
  const sound = S.sound = (() => {
    const btn = document.querySelector('.snd');
    let ctx = null, master = null, filter = null, on = false, lastMod = 0;
    const label = () => { if (btn) { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.textContent = on ? 'sound: on' : 'sound: off'; } };
    function build() {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const sr = ctx.sampleRate, buf = ctx.createBuffer(1, sr * 2, sr), d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < d.length; i++) {                                 // pink-ish noise (a three-pole approximation), wind has no hiss
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
      }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 480; filter.Q.value = 0.8;
      const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
      lfo.frequency.value = 0.08; lfoGain.gain.value = 170; lfo.connect(lfoGain).connect(filter.frequency);
      master = ctx.createGain(); master.gain.value = 0;
      src.connect(filter).connect(master).connect(ctx.destination);
      src.start(); lfo.start();
    }
    function fade(to, s) { if (!master) return; const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(to, t + s); }
    function enable() {                                                    // from a gesture only
      if (!ctx) build();
      if (ctx.state === 'suspended') ctx.resume();
      fade(0.04, 2);                                                       // -28 dB
    }
    function disable() { fade(0, 0.8); if (ctx) setTimeout(() => { if (!on && ctx && ctx.state === 'running') ctx.suspend(); }, 900); }
    function toggle() {
      on = !on; label();
      try { sessionStorage.setItem('sumi-sound', on ? 'on' : 'off'); } catch (e) {}
      on ? enable() : disable();
    }
    if (btn) btn.addEventListener('click', toggle);
    let remembered = false;
    try { remembered = sessionStorage.getItem('sumi-sound') === 'on'; } catch (e) {}
    if (remembered) {
      on = true; label();
      const arm = () => { if (on && !ctx) enable(); removeEventListener('pointerdown', arm); removeEventListener('keydown', arm); };
      addEventListener('pointerdown', arm); addEventListener('keydown', arm);
    }
    document.addEventListener('visibilitychange', () => { if (!ctx || !on) return; if (document.hidden) fade(0, 0.5); else { if (ctx.state === 'suspended') ctx.resume(); fade(0.04, 1.5); } });
    S.add((dt, now) => {                                                   // the gust modulates the cutoff, ten times a second
      if (!ctx || !on || !filter || now - lastMod < 100) return;
      lastMod = now;
      filter.frequency.setTargetAtTime(380 + wind.lean * 520 + wind.puff * 700, ctx.currentTime, 0.18);
    });
    const blip = (f, dur, g, type) => {
      if (!ctx || !on || ctx.state !== 'running') return;
      const o = ctx.createOscillator(), a = ctx.createGain(), t = ctx.currentTime;
      o.type = type || 'sine'; o.frequency.value = f;
      a.gain.setValueAtTime(g, t); a.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      o.connect(a).connect(ctx.destination); o.start(t); o.stop(t + dur);
    };
    return {
      get on() { return on; }, get ctx() { return ctx; },
      tick() { blip(1320, 0.07, 0.02); },
      ring() { if (ctx && on && ctx.state === 'running') playCodecRing(); },
    };
  })();

  /* ---------- the secret: 140.85 · Konami · the tuning strip → codec call → Shadow Moses ---------- */
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
  // the ring belongs to the opt-in package: with the toggle off it is silent (the "!" plate and the game still open); it never creates a context of its own
  function playCodecRing() {
    try {
      if (!sound || !sound.on || !sound.ctx) return;
      const ctx = sound.ctx;
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

  start();
})();

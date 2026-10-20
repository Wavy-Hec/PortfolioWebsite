/* SUMI v3 — one wind, one loop. The wind model (gust + scroll) drives the petals, the ink stroke down the chapter rail, the grass in the
   footer, the lean of the ASCII scene (js/sumi-city.js) and the radar's chapter blips; the chapter title cards, the brush that opens the
   page, the "!" over Raiden, the tuning strip, and the secret (140.85 / Konami / the strip -> codec call -> Shadow Moses) live here too.
   The loop: one requestAnimationFrame chain paced to ~30 fps by a timer; asleep when the tab is hidden, while the game is open, and
   under reduced motion (nothing moves at all; the scene is one still frame; the headings are simply present). */
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
    if (f === 'both') { foots.forEach(x => { x.hidden = false; }); devs.forEach(d => { d.hidden = false; }); }
    else if (f === 'b') {
      foots.forEach(x => { x.hidden = x.dataset.art !== 'shinkawa'; if (x.dataset.art === 'shinkawa') x.id = 'contact'; else x.removeAttribute('id'); });
      const a = document.getElementById('codec-launch'); if (a) a.removeAttribute('id');
      const b = document.querySelector('.foot[data-art="shinkawa"] .freq'); if (b) b.id = 'codec-launch';
    }
  }

  /* ---------- the wind and the loop ----------
     gust(t): two slow sines, 0.25..1.25. Scroll adds a burst (|px/s|, decaying in ~1/3 s) so a fast scroll is a gust that settles.
     strength = gust + burst feeds the petals; lean (0..1) is the same wind normalised for everything that tilts. */
  const wind = { gust: 0.75, strength: 0.75, lean: 0, v: 0 };
  const subs = [];
  let raf = 0, timer = 0, prev = 0, scrollV = 0, lastY = scrollY;
  const FRAME_MS = 1000 / 30;
  const S = window.SUMI = { REDUCED, wind, add(fn) { subs.push(fn); start(); } };
  addEventListener('scroll', () => { const y = scrollY; scrollV += (y - lastY); lastY = y; }, { passive: true });
  function tickWind(dt, now) {
    scrollV *= Math.exp(-dt * 3);
    wind.v = scrollV;
    wind.gust = 0.75 + 0.35 * Math.sin(now / 5200) + 0.15 * Math.sin(now / 1700 + 1.3);
    wind.strength = wind.gust + Math.min(2.2, Math.abs(scrollV) * 0.004);
    wind.lean = clamp((wind.strength - 0.3) / 1.6, 0, 1);
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
    function draw(dt, now) {
      ctx.clearRect(0, 0, W, H);
      const w = wind.strength, lift = Math.sign(wind.v) * Math.min(1, Math.abs(wind.v) * 0.003);
      ctx.fillStyle = RED;
      for (const p of petals) {
        p.x += p.vx * w * dt;
        p.y += (p.vy * w - lift * 40) * dt + Math.cos(now / 900 + p.phase) * p.sway * dt;
        p.rot += p.spin * dt * (0.6 + 0.4 * w);
        if (p.x > W + 24 || p.y > H + 24 || p.y < -80) spawn(p, false);
        const s = p.size * (0.85 + 0.15 * Math.sin(now / 400 + p.phase));
        ctx.setTransform(DPR * s * 0.62, 0, 0, DPR * s, 0, 0);
        ctx.translate(p.x / (s * 0.62), p.y / s);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.alpha;
        ctx.fill(p.shape);
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

  /* ---------- the brush that opens the page: the class is set inline in <head> (first load of the session, no hash, no reduced
     motion); here we only tidy up after the sweep and remember it for the session ---------- */
  (() => {
    const html = document.documentElement, brush = document.querySelector('.brush-open');
    if (!html.classList.contains('opening')) return;
    const done = () => { html.classList.remove('opening'); try { sessionStorage.setItem('sumi-opened', '1'); } catch (e) {} };
    if (brush) brush.addEventListener('animationend', done, { once: true });
    setTimeout(done, 1400);                                           // belt and braces
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

  start();
})();

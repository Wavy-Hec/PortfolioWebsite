/* SUMI v8 — one loop, two secrets. The loop: one requestAnimationFrame chain paced to ~30 fps by a timer that the fold's wind
   (js/sumi-fold.js), the research stack (js/sumi-stack.js) and the Go2 sketch (js/sumi-xray.js) draw inside; asleep when the tab is hidden,
   while the game is open, and under reduced motion (nothing moves at all). Here too: the "!" over Raiden (hover / focus, silent), and the
   secret (the footer's 140.85, the Konami code, 140.85 typed -> the codec call -> the game, js/game.js, loaded on the first call only). */
(() => {
  'use strict';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // dev: any uncaught error surfaces in the title so a headless --dump-dom can see it
  addEventListener('error', e => { document.title = 'WF-ERR ' + e.message; });
  addEventListener('unhandledrejection', e => { document.title = 'WF-ERR ' + (e.reason && e.reason.message || e.reason); });
  const q = new URLSearchParams(location.search);
  const gameOpen = () => document.body.classList.contains('game-open');

  /* ---------- the loop ---------- */
  const subs = [];
  let raf = 0, timer = 0, prev = 0;
  const FRAME_MS = 1000 / 30;
  const S = window.SUMI = { REDUCED, add(fn) { subs.push(fn); start(); }, remove(fn) { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); } };
  function loop(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - prev) / 1000 || 0.016); prev = now;
    for (const fn of subs) fn(dt, now);
    timer = setTimeout(() => { timer = 0; raf = requestAnimationFrame(loop); }, Math.max(0, FRAME_MS - (performance.now() - now)));
  }
  function start() { if (REDUCED || raf || timer || document.hidden || gameOpen()) return; prev = performance.now(); raf = requestAnimationFrame(loop); }
  function stop() { cancelAnimationFrame(raf); clearTimeout(timer); raf = 0; timer = 0; }
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  addEventListener('gameopen', stop);
  addEventListener('gameclose', start);

  /* dev: ?at=<scrollY> jumps there once the page has loaded (for headless screenshots of a chapter), with ?stack=e,x,y[,a] (the research
     stack's explosion and light), ?focus=<selector> (keyboard focus) and ?xray=<seconds> (the sketch's resolve clock). Local hosts only. */
  {
    const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    const at = DEV ? q.get('at') : null;
    if (at !== null) addEventListener('load', () => setTimeout(() => {
      if (at === 'all') { const h = document.querySelector('.hero'), vh = +q.get('vh') || 840; if (h) { h.style.minHeight = vh + 'px'; h.style.height = vh + 'px'; } dispatchEvent(new Event('resize')); }
      else { try { scrollTo({ top: +at || 0, behavior: 'instant' }); } catch (e) { scrollTo(0, +at || 0); } }
      setTimeout(() => {
        if (q.has('stack') || q.has('focus') || q.has('xray')) document.documentElement.classList.add('dev-still');
        const st = q.get('stack'); if (st && S.stack) S.stack.at(...st.split(',').map(Number));
        const xr = q.get('xray'); if (xr && S.xray) S.xray.at(+xr);
        const fo = q.get('focus'); if (fo) { const el = document.querySelector(fo); if (el) el.focus(); }
      }, 500);
    }, 300));
  }

  /* ---------- the chapter drawings load on approach: the research stack and the Go2 sketch are not in the first view, so their scripts
     are fetched when their chapter's top comes within 600 px of the screen's foot (or is above it: a link straight to #contact), checked on
     load, scroll and resize, and in any case 4 s after the page has loaded (so they are there before anyone can reach them); the listeners
     go once both are in ---------- */
  (() => {
    const load = src => { const s = document.createElement('script'); s.src = src; s.async = false; document.body.appendChild(s); };
    const pending = [['.stack', 'js/sumi-stack.js?v=7'], ['.xray', 'js/sumi-xray.js?v=7']].map(([sel, src]) => [document.querySelector(sel), src]).filter(([el]) => el);
    let queued = false;
    function check(all) {
      queued = false;
      for (let i = pending.length - 1; i >= 0; i--) if (all === true || pending[i][0].getBoundingClientRect().top < innerHeight + 600) load(pending.splice(i, 1)[0][1]);
      if (!pending.length) { removeEventListener('scroll', soon); removeEventListener('resize', soon); }
    }
    function soon() { if (!queued) { queued = true; setTimeout(check, 50); } }
    addEventListener('scroll', soon, { passive: true });
    addEventListener('resize', soon, { passive: true });
    addEventListener('load', () => setTimeout(() => check(true), 4000));
    check(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && q.has('at'));   // dev captures (?at=, with ?stack= / ?xray=) want both at once
  })();

  /* ---------- the "!" over Raiden: hover or focus on the figure pops the paper plate above his head for 1.2 s, once per hover; silent ---------- */
  (() => {
    const fig = document.querySelector('.hero .figure'), plate = fig && fig.querySelector('.alert');
    if (!fig || !plate) return;
    let armed = true, t = 0;
    function pop() {
      if (!armed) return; armed = false;
      plate.classList.remove('on'); void plate.offsetWidth; plate.classList.add('on');
      clearTimeout(t); t = setTimeout(() => plate.classList.remove('on'), 1200);
    }
    fig.addEventListener('pointerenter', pop);
    fig.addEventListener('pointerleave', () => { armed = true; });
    fig.addEventListener('focus', pop);
    // the hero clips (css overflow: clip); where clip is unsupported it is overflow: hidden, which the browser still scrolls to bring the
    // focused figure (its plate hangs past the fold's floor) into view: hold it at 0
    const hero = fig.closest('.hero');
    if (hero) hero.addEventListener('scroll', () => { if (hero.scrollTop || hero.scrollLeft) { hero.scrollTop = 0; hero.scrollLeft = 0; } }, { passive: true });
    fig.addEventListener('blur', () => { armed = true; });
  })();

  /* ---------- the secret: 140.85 (the footer's last line, or typed) · Konami → the codec call → the game ----------
     The codec ring is the one sound on the page: four square-wave beeps from an AudioContext made on the gesture that dials. */
  let gameScriptRequested = false, actx = null;
  function status(msg) { const el = document.getElementById('live-status'); if (el) el.textContent = msg; }
  function openGame() {
    if (window.MGSGame) { window.MGSGame.open(); return; }
    if (gameScriptRequested) return;
    gameScriptRequested = true;
    const s = document.createElement('script');
    s.src = 'js/game.js?v=13';                                        // lazy: the game (126 KB) loads on the first call only
    s.onload = () => { if (window.MGSGame) window.MGSGame.open(); };
    s.onerror = () => { gameScriptRequested = false; status('codec link failed — try again'); };
    document.body.appendChild(s);
  }
  function playCodecRing() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const ctx = actx, t0 = ctx.currentTime;
      [0, 0.12, 0.32, 0.44].forEach((off, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain(), t = t0 + off;
        osc.type = 'square'; osc.frequency.value = i % 2 ? 1245 : 1660;
        gain.gain.setValueAtTime(0.05, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        osc.connect(gain).connect(ctx.destination); osc.start(t); osc.stop(t + 0.09);
      });
    } catch (e) {}
  }
  function launchGame() {
    const alertMark = document.createElement('div');
    alertMark.className = 'mgs-alert';
    alertMark.textContent = '!';
    alertMark.setAttribute('aria-hidden', 'true');
    document.body.appendChild(alertMark);
    setTimeout(() => alertMark.remove(), 1600);
    status('Incoming codec call — opening the game');
    playCodecRing();
    setTimeout(openGame, 650);                          // the beat covers the fetch
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
      launchGame();
    }
  });
  document.querySelectorAll('.freq').forEach(btn => btn.addEventListener('click', launchGame));

  start();
})();

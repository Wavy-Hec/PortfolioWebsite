/* SUMI v9 — one loop, two secrets. The loop: one requestAnimationFrame chain paced to ~30 fps by a timer that the fold's wind
   (js/sumi-fold.js), the research stack (js/sumi-stack.js) and the Go2 sketch (js/sumi-xray.js) draw inside, each subscribed only while its
   drawing is on screen; asleep when nothing is subscribed, when the tab is hidden, while the game is open, and under reduced motion. Here too: the "!" over Raiden (hover / focus, silent), and the
   secret (the footer's 140.85, the Konami code, 140.85 typed -> the codec call -> the game, js/game.js, loaded on the first call only). */
(() => {
  'use strict';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  // dev (local hosts only): any uncaught error surfaces in the title so a headless --dump-dom can see it; a visitor's tab is never renamed
  if (DEV) {
    addEventListener('error', e => { document.title = 'WF-ERR ' + e.message; });
    addEventListener('unhandledrejection', e => { document.title = 'WF-ERR ' + (e.reason && e.reason.message || e.reason); });
  }
  const q = new URLSearchParams(location.search);
  const gameOpen = () => document.body.classList.contains('game-open');

  /* ---------- the loop ---------- */
  const subs = [];
  let raf = 0, timer = 0, prev = 0;
  const FRAME_MS = 1000 / 30;
  const S = window.SUMI = { REDUCED, DEV, add(fn) { if (!subs.includes(fn)) subs.push(fn); start(); }, remove(fn) { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); } };
  function loop(now) {
    raf = 0;
    if (!subs.length) return;                                      // nothing animated on screen: the loop sleeps until S.add wakes it
    const dt = Math.min(0.05, (now - prev) / 1000 || 0.016); prev = now;
    for (const fn of subs.slice()) fn(dt, now);                     // a copy: a drawing may unsubscribe itself inside its own tick
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

  /* ---------- the halftone pieces (<ascii-art>, js/ascii): sized to their CSS box. The engine draws a piece at a font size (its canvas is
     cols x size x .602 px wide), so a piece with data-cols gets size = width / (cols x .602), at start and after a resize. data-piece: the engine
     (js/ascii/ascii.js, a module, imported here) and the piece are loaded 2.5 s after the page's load (or when its box comes within 1600 px
     of the screen, if that is sooner), so none of it is part of the first view. On a phone or a touch screen the piece is drawn once and holds
     (still: a full-width halftone redraw costs ~26 ms on a mid-range phone); a piece marked data-still (the pagoda: a fine print) is drawn once
     everywhere; any other plays at its data-fps, only while on screen. The one draw (40-150 ms on a phone) is split by the player into the piece's
     set-up and, a task later, its render (js/ascii/player.js, local change 5); it is named in an idle slot once
     every module it needs is already fetched, while the reader is still on the first screens, not inside a scroll toward the band. ---------- */
  (() => {
    const pieces = [...document.querySelectorAll('ascii-art[data-cols]')];
    if (!pieces.length) return;
    function fit() {
      for (const el of pieces) {
        const w = el.clientWidth, cols = parseFloat(el.dataset.cols) || 96;
        if (!w) continue;
        const size = (w / (cols * 0.602)).toFixed(2);
        if (el.getAttribute('size') !== size) el.setAttribute('size', size);
      }
    }
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(fit, 200); }, { passive: true });
    const lazy = new Map(pieces.filter(el => el.dataset.piece && !el.hasAttribute('piece')).map(el => [el.parentElement, el]));
    const STILL = matchMedia('(max-width: 720px), (pointer: coarse)').matches;
    let engine = null;
    // the engine and the piece (and the piece's kit) are fetched first, all in parallel, so the import inside the element's _start resolves
    // from the module map and the draw follows the idle slot at once, not a network round trip later. The piece URL is exactly the one the
    // engine builds (`${BASE}pieces/${slug}.js`, no cache key), or the module map would hold two copies.
    const name = el => {
      if (!lazy.has(el.parentElement)) return; lazy.delete(el.parentElement);
      const slug = el.dataset.piece.replace(/[^a-z0-9-]/g, '');
      engine = engine || Promise.all([import('./ascii/ascii.js?v=13'), import('./ascii/lib/kit.js')]);
      Promise.all([engine, import(`./ascii/pieces/${slug}.js`)]).then(() => {
        const go = () => {
          fit();                                                        // sized here, not at parse: reading its width then would pull the page's first layout into this script
          if (STILL || 'still' in el.dataset) el.setAttribute('still', '');   // data-still: a print, drawn once on every screen
          if (matchMedia('(max-width: 960px)').matches) el.setAttribute('contrast', '12');   // a phone's or a tablet's 5 px cells: a gentler curve, so the pagoda's sky ramps instead of stepping into a seam and the moon bridge keeps its midtones
          else if (el.dataset.fps) el.setAttribute('fps', el.dataset.fps);
          el.setAttribute('piece', el.dataset.piece);
        };
        ('requestIdleCallback' in window) ? requestIdleCallback(go, { timeout: 1200 }) : setTimeout(go, 200);
      }).catch(() => {});
    };
    if (!lazy.size) return;
    // named 2.5 s after load, wherever the reader is: the one 40-150 ms draw then lands while the fold or Work is being read, never inside
    // a flick toward About. The observer (1600 px ahead) stays as the fallback for a reader who jumps straight down.
    const all = () => [...lazy.values()].forEach(name);
    addEventListener('load', () => setTimeout(() => ('requestIdleCallback' in window) ? requestIdleCallback(all, { timeout: 4000 }) : all(), 2500));
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); const el = lazy.get(e.target); if (el) name(el); }
    }, { rootMargin: '1600px 0px' });
    lazy.forEach((el, box) => io.observe(box));
  })();

  /* ---------- the chapter drawings load on approach: the research stack and the Go2 sketch are not in the first view, so their scripts
     are fetched when their chapter comes within 600 px of the screen's foot, seen by one IntersectionObserver (it never forces a layout, so
     nothing here pulls the page's first layout into this script), and in any case 4 s after the page has loaded (so they are there before
     anyone can reach them, and a section already above the screen, a link straight to #contact, is caught) ---------- */
  (() => {
    const load = src => { const s = document.createElement('script'); s.src = src; s.async = false; document.body.appendChild(s); };
    const pending = [['.stack', 'js/sumi-stack.js?v=15'], ['.xray', 'js/sumi-xray.js?v=15']].map(([sel, src]) => [document.querySelector(sel), src]).filter(([el]) => el);
    let io = null;
    function check() { if (io) io.disconnect(); while (pending.length) load(pending.shift()[1]); }
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(es => {
        for (const e of es) if (e.isIntersecting) { const i = pending.findIndex(p => p[0] === e.target); if (i >= 0) { io.unobserve(e.target); load(pending.splice(i, 1)[0][1]); } }
      }, { rootMargin: '0px 0px 600px 0px' });
      pending.forEach(([el]) => io.observe(el));
    }
    addEventListener('load', () => setTimeout(check, 4000));
    if (DEV && q.has('at')) check();   // dev captures (?at=, with ?stack= / ?xray=) want both at once
  })();

  /* ---------- a link to a section (/#research), on a first visit: the smooth scroll aims at where the section was before the web fonts
     arrived, and the fonts then grow the chapters above it, so it stops short. Once the fonts are in and the scroll has had time to finish,
     the section is put back at the top, unless the reader has moved in the meantime ---------- */
  if (location.hash.length > 1 && 'fonts' in document) {
    let t = null; try { t = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) {}
    if (t && t !== document.body) {
      let moved = false;
      ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => addEventListener(ev, () => { moved = true; }, { once: true, passive: true }));
      document.fonts.ready.then(() => setTimeout(() => {
        if (!moved && Math.abs(t.getBoundingClientRect().top) > 4) { try { t.scrollIntoView({ behavior: 'instant', block: 'start' }); } catch (e) { t.scrollIntoView(true); } }
      }, 1500));
    }
  }

  /* ---------- the "!" over Raiden: hover or focus on the figure pops the paper plate above his head for 1.2 s, once per hover; silent. Under
     keyboard focus the plate holds for as long as he has focus (css .figure:focus-visible .alert): it is the figure's focus cue. On a touch
     screen only a tap pops it: a swipe that starts on him (he fills most of a phone's first screen) fires pointerenter but never a click, so
     scrolling from the fold stays silent ---------- */
  (() => {
    const fig = document.querySelector('.hero .figure'), plate = fig && fig.querySelector('.alert');
    if (!fig || !plate) return;
    let armed = true, t = 0;
    function pop() {
      if (!armed) return; armed = false;
      plate.classList.remove('on'); void plate.offsetWidth; plate.classList.add('on');
      clearTimeout(t); t = setTimeout(() => plate.classList.remove('on'), 1200);
    }
    const touchy = e => e.pointerType === 'touch' || matchMedia('(hover: none)').matches;
    fig.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') pop(); });
    fig.addEventListener('click', e => { if (touchy(e)) pop(); });   // a tap: the focus it gives pops first; a second tap (pointerleave re-armed it) pops again
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
  let statusT = 0;
  function status(msg) {                                              // cleared first and written on the next tick, so a second call with the same words is announced again
    const el = document.getElementById('live-status'); if (!el) return;
    el.textContent = ''; clearTimeout(statusT);
    if (msg) statusT = setTimeout(() => { el.textContent = msg; }, 50);
  }
  addEventListener('gameclose', () => status(''));
  // launching: from the dial until the game is open (or its script fails), so a second click or tap inside the beat neither stacks a
  // second "!" nor rings twice
  let launching = false, launchT = 0;
  const landed = () => { launching = false; clearTimeout(launchT); };
  addEventListener('gameopen', landed);
  function openGame() {
    if (window.MGSGame) { window.MGSGame.open(); landed(); return; }
    if (gameScriptRequested) return;
    gameScriptRequested = true;
    const s = document.createElement('script');
    s.src = 'js/game.js?v=24';                                        // lazy: the game (142 KB) loads on the first call only
    s.onload = () => { if (window.MGSGame) window.MGSGame.open(); landed(); };
    s.onerror = () => { gameScriptRequested = false; landed(); status('Codec link failed. Try again.'); };
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
    if (launching || gameOpen()) return;
    launching = true; launchT = setTimeout(landed, 10000);              // never stuck: a stalled fetch frees the dial after 10 s
    const alertMark = document.createElement('div');
    alertMark.className = 'mgs-alert';
    alertMark.textContent = '!';
    alertMark.setAttribute('aria-hidden', 'true');
    document.body.appendChild(alertMark);
    setTimeout(() => alertMark.remove(), 1600);
    status('Incoming codec call. Opening the game.');
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

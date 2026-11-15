// The page's one frame loop (about 30 fps, asleep while nothing is subscribed), the scripts
// that load on approach, the "!" over the figure, and the footer's secret.
(() => {
  'use strict';

  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FRAME_MS = 1000 / 30;
  const gameOpen = () => document.body.classList.contains('game-open');

  const subscribers = [];
  let frame = 0;
  let timer = 0;
  let last = 0;

  function tick(now) {
    frame = 0;
    if (!subscribers.length) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    // a copy, because a drawing may unsubscribe inside its own tick
    for (const fn of subscribers.slice()) fn(dt, now);
    const wait = Math.max(0, FRAME_MS - (performance.now() - now));
    timer = setTimeout(() => {
      timer = 0;
      frame = requestAnimationFrame(tick);
    }, wait);
  }

  function start() {
    if (REDUCED || frame || timer || document.hidden || gameOpen()) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    frame = 0;
    timer = 0;
  }

  window.SUMI = {
    REDUCED,
    add(fn) {
      if (!subscribers.includes(fn)) subscribers.push(fn);
      start();
    },
    remove(fn) {
      const i = subscribers.indexOf(fn);
      if (i >= 0) subscribers.splice(i, 1);
    },
  };

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  addEventListener('gameopen', stop);
  addEventListener('gameclose', start);

  // Drawings below the fold: each script loads when its element nears the screen, or four
  // seconds after the page has loaded, whichever comes first.
  const LAZY_SCRIPTS = [
    ['.reel', 'js/sumi-clips.js'],
    ['.results', 'js/sumi-results.js'],
    ['.search', 'js/sumi-search.js'],
    ['.xray', 'js/sumi-xray.js?v=16'],
    ['.print', 'js/sumi-print.js'],
    ['.track', 'js/sumi-track.js'],
    ['.ridge', 'js/sumi-ridge.js'],
  ];
  const waiting = new Map();
  for (const [selector, src] of LAZY_SCRIPTS) {
    const el = document.querySelector(selector);
    if (el) waiting.set(el, src);
  }

  const nearby = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) loadScriptFor(entry.target);
      }
    },
    { rootMargin: '0px 0px 600px 0px' },
  );

  function loadScriptFor(el) {
    if (!waiting.has(el)) return;
    const script = document.createElement('script');
    script.src = waiting.get(el);
    waiting.delete(el);
    nearby.unobserve(el);
    document.body.appendChild(script);
  }

  for (const el of waiting.keys()) nearby.observe(el);
  addEventListener('load', () =>
    setTimeout(() => [...waiting.keys()].forEach(loadScriptFor), 4000),
  );

  // A link to a section lands short when the web fonts arrive after the scroll and grow the
  // chapters above it: put the section back at the top, unless the reader has moved.
  const target = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
  if (target && target !== document.body) {
    let moved = false;
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) {
      addEventListener(type, () => (moved = true), { once: true, passive: true });
    }
    document.fonts.ready.then(() =>
      setTimeout(() => {
        if (!moved && Math.abs(target.getBoundingClientRect().top) > 4) {
          target.scrollIntoView({ behavior: 'instant' });
        }
      }, 1500),
    );
  }

  // The "!" over the figure: hover, focus or a tap pops it for 1.2 s. Under keyboard focus the
  // stylesheet holds it for as long as the figure has focus.
  const figure = document.querySelector('.hero .figure');
  const alertPlate = figure && figure.querySelector('.alert');
  if (alertPlate) {
    let armed = true;
    let hideTimer = 0;

    const pop = () => {
      if (!armed) return;
      armed = false;
      alertPlate.classList.remove('on');
      // a reflow between the two, so the animation starts over
      void alertPlate.offsetWidth;
      alertPlate.classList.add('on');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => alertPlate.classList.remove('on'), 1200);
    };
    const rearm = () => (armed = true);

    // a swipe that starts on the figure fires pointerenter but never a click: on touch, only a tap pops it
    figure.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'touch') pop();
    });
    figure.addEventListener('click', e => {
      if (e.pointerType === 'touch' || matchMedia('(hover: none)').matches) pop();
    });
    figure.addEventListener('focus', pop);
    figure.addEventListener('pointerleave', rearm);
    figure.addEventListener('blur', rearm);

    // without overflow: clip the hero is overflow: hidden, which still scrolls to show the focused figure
    const hero = figure.closest('.hero');
    hero.addEventListener(
      'scroll',
      () => {
        hero.scrollTop = 0;
        hero.scrollLeft = 0;
      },
      { passive: true },
    );
  }

  // The secret: the footer's 140.85 (clicked or typed) or the Konami code rings the codec and
  // opens the game, which is fetched on the first call.
  const FREQUENCY = '140.85';
  const KONAMI = [
    'ArrowUp',
    'ArrowUp',
    'ArrowDown',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowLeft',
    'ArrowRight',
    'b',
    'a',
  ];
  const dial = document.getElementById('codec-launch');
  const liveStatus = document.getElementById('live-status');
  let statusTimer = 0;
  let audio = null;
  let launching = false;
  let launchTimer = 0;
  let gameRequested = false;

  function announce(message) {
    // emptied first, so the same words are read out a second time
    liveStatus.textContent = '';
    clearTimeout(statusTimer);
    if (message) statusTimer = setTimeout(() => (liveStatus.textContent = message), 50);
  }

  function ring() {
    audio = audio || new AudioContext();
    audio.resume();
    const start = audio.currentTime;
    [0, 0.12, 0.32, 0.44].forEach((offset, i) => {
      const beep = audio.createOscillator();
      const gain = audio.createGain();
      const at = start + offset;
      beep.type = 'square';
      beep.frequency.value = i % 2 ? 1245 : 1660;
      gain.gain.setValueAtTime(0.05, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
      beep.connect(gain).connect(audio.destination);
      beep.start(at);
      beep.stop(at + 0.09);
    });
  }

  function finishLaunch() {
    launching = false;
    clearTimeout(launchTimer);
  }

  function openGame() {
    if (window.MGSGame) {
      window.MGSGame.open();
      return;
    }
    if (gameRequested) return;
    gameRequested = true;
    const script = document.createElement('script');
    script.src = 'js/game.js?v=24';
    script.onload = () => window.MGSGame.open();
    script.onerror = () => {
      gameRequested = false;
      finishLaunch();
      announce('Codec link failed. Try again.');
    };
    document.body.appendChild(script);
  }

  function launchGame() {
    if (launching || gameOpen()) return;
    launching = true;
    // a stalled fetch frees the dial after ten seconds
    launchTimer = setTimeout(finishLaunch, 10000);

    const mark = document.createElement('div');
    mark.className = 'mgs-alert';
    mark.textContent = '!';
    mark.setAttribute('aria-hidden', 'true');
    document.body.appendChild(mark);
    setTimeout(() => mark.remove(), 1600);

    announce('Incoming codec call. Opening the game.');
    // the beat before the game opens covers its fetch
    setTimeout(openGame, 650);
    ring();
  }

  addEventListener('gameopen', finishLaunch);
  addEventListener('gameclose', () => announce(''));
  dial.addEventListener('click', launchGame);

  let konamiIndex = 0;
  let typed = '';
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, [contenteditable]')) {
      konamiIndex = 0;
      return;
    }

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === KONAMI[konamiIndex]) konamiIndex++;
    else konamiIndex = key === KONAMI[0] ? 1 : 0;
    if (konamiIndex === KONAMI.length) {
      konamiIndex = 0;
      launchGame();
    }

    if (e.key.length !== 1) return;
    typed = (typed + e.key).slice(-FREQUENCY.length);
    if (typed === FREQUENCY) {
      typed = '';
      dial.classList.add('dialed');
      setTimeout(() => dial.classList.remove('dialed'), 1300);
      launchGame();
    }
  });

  start();
})();

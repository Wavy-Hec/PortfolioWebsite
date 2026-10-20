/* SUMI — the two motions (hero wind, ASCII resolve), the footer A/B switch, and the secret (140.85 → codec call → Shadow Moses). */
(() => {
  'use strict';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // dev: any uncaught error surfaces in the title so a headless --dump-dom can see it
  addEventListener('error', e => { document.title = 'WF-ERR ' + e.message; });

  /* ---------- footer variant: ?footer=a (grass, default) | ?footer=b (shinkawa) | ?footer=both (stacked, captions on) ----------
     The markup ships with B and the captions hidden, so a URL without the switch (or without JS) has exactly one footer landmark. */
  {
    const q = new URLSearchParams(location.search).get('footer');
    const foots = document.querySelectorAll('.foot'), devs = document.querySelectorAll('.dev');
    if (q === 'both') { foots.forEach(f => { f.hidden = false; }); devs.forEach(d => { d.hidden = false; }); }
    else if (q === 'b') {
      foots.forEach(f => { f.hidden = f.dataset.art !== 'shinkawa'; if (f.dataset.art === 'shinkawa') f.id = 'contact'; else f.removeAttribute('id'); });
      const a = document.getElementById('codec-launch'); if (a) a.removeAttribute('id');
      const b = document.querySelector('.foot[data-art="shinkawa"] .freq'); if (b) b.id = 'codec-launch';
    }
  }

  /* ---------- motion 1: the guiding wind, hero-scoped ---------- */
  (() => {
    const hero = document.querySelector('.hero');
    const canvas = hero && hero.querySelector('canvas.wind');
    if (!canvas || REDUCED) return;
    const ctx = canvas.getContext('2d');
    const N = 8, SEG = 24, DPR = Math.min(1.5, devicePixelRatio || 1);
    const INK = getComputedStyle(document.documentElement).getPropertyValue('--sumi').trim() || '#141416';
    let W = 0, H = 0, strokes = [], raf = 0, last = 0, visible = false;

    function resize() {
      W = hero.clientWidth; H = hero.clientHeight;
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    function spawn(s, fresh) {
      s.len = 220 + Math.random() * 380;          // long streaks, not noodles
      s.speed = 320 + Math.random() * 380;        // px/s
      s.amp = 1.5 + Math.random() * 4;            // one gentle arc
      s.freq = 0.004 + Math.random() * 0.006;
      s.phase = Math.random() * Math.PI * 2;
      s.alpha = 0.22 + Math.random() * 0.2;
      s.width = 0.7 + Math.random() * 0.8;
      s.tilt = (Math.random() - 0.5) * 0.18;
      s.lane = Math.random();
      s.x = fresh ? Math.random() * (W + 500) - 250 : -250;  // respawn off the left edge
    }
    function draw(dt, now) {
      ctx.clearRect(0, 0, W, H);
      const gust = 1 + 0.35 * Math.sin(now / 6500);           // one global, slow gust
      ctx.lineCap = 'round';
      for (const s of strokes) {
        s.x += s.speed * gust * dt;
        if (s.x - s.len > W + 60) spawn(s, false);
        const cx = s.x, cy = s.lane * H;
        const ca = Math.cos(s.tilt), sa = Math.sin(s.tilt);
        ctx.beginPath();
        for (let i = 0; i <= SEG; i++) {
          const k = i / SEG, d = -k * s.len;
          const wob = Math.sin(s.phase + d * s.freq + now * 0.002) * s.amp * Math.sin(k * Math.PI);
          const x = cx + ca * d - sa * wob, y = cy + sa * d + ca * wob;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        const g = ctx.createLinearGradient(cx, cy, cx - ca * s.len, cy - sa * s.len);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.15, INK); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.strokeStyle = g; ctx.globalAlpha = s.alpha; ctx.lineWidth = s.width;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
      draw(dt, now);
      raf = requestAnimationFrame(tick);
    }
    function start() { if (raf || !visible || document.hidden) return; last = performance.now(); raf = requestAnimationFrame(tick); }
    function stop() { cancelAnimationFrame(raf); raf = 0; }

    resize();
    strokes = Array.from({ length: N }, () => { const s = {}; spawn(s, true); return s; });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }, { threshold: 0 }).observe(hero);
    document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 120); }, { passive: true });
  })();

  /* ---------- motion 2: the ASCII face resolves from near-noise, once ---------- */
  (() => {
    const RAMP = '@#%*+=-:. ', DURATION = 1200;
    const faces = Array.from(document.querySelectorAll('pre.face'));
    const band = document.querySelector('.band');
    if (!faces.length || !band || REDUCED) return;        // reduced motion: the final text is simply there
    const q = new URLSearchParams(location.search);
    const FREEZE = q.has('t') ? parseFloat(q.get('t')) * 1000 : null;   // ?t=0.5 freezes mid-resolve (screenshots)
    const prep = faces.map(pre => {
      const final = pre.textContent.split('\n');
      const cols = final[0].length, rows = final.length;
      const settle = new Float32Array(cols * rows);
      for (let i = 0; i < settle.length; i++) settle[i] = (0.25 * (Math.floor(i / cols) / rows) + 0.75 * Math.random()) * DURATION;
      return { pre, final, cols, rows, settle };
    });
    function frame(f, t) {
      f.pre.dataset.resolve = t >= DURATION ? 'done' : 'playing';
      if (t >= DURATION) { f.pre.textContent = f.final.join('\n'); return true; }
      const out = new Array(f.rows);
      for (let y = 0; y < f.rows; y++) {
        const row = f.final[y]; let s = '';
        for (let x = 0; x < f.cols; x++) {
          const i = y * f.cols + x;
          if (t >= f.settle[i]) { s += row[x]; continue; }
          const k = RAMP.indexOf(row[x]);                 // ±2 ramp steps of the final glyph
          s += RAMP[Math.min(RAMP.length - 1, Math.max(0, k + Math.round((Math.random() * 2 - 1) * 2)))];
        }
        out[y] = s;
      }
      f.pre.textContent = out.join('\n');
      return false;
    }
    let fired = false;
    function play() {
      if (fired) return; fired = true;
      if (FREEZE !== null) { prep.forEach(f => frame(f, FREEZE)); return; }
      const t0 = performance.now();
      const tick = () => { const t = performance.now() - t0; let done = true; for (const f of prep) done = frame(f, t) && done; if (!done) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
    new IntersectionObserver((es, io) => { if (es.some(e => e.isIntersecting)) { io.disconnect(); play(); } }, { threshold: 0.35 }).observe(band);
  })();

  /* ---------- the secret: 140.85 · Konami · the frequency button → codec call → Shadow Moses ---------- */
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
})();

/* ===========================================================================
   CODEC INFILTRATION — a top-down, Metal Gear–style stealth mini-game.
   Launched by the Konami code (wired in script.js). Fully self-contained:
   injects its own styles + DOM and exposes window.MGSGame = { open, close }.

   Systems: pixel-art operatives, Alert/Evasion/Caution states with BFS-pathing
   guard AI, a stealth toolkit (walk/run noise, cardboard box, wall-knock lure,
   CQC subdue), a Soliton radar, security cameras, and codec presentation.
   Local / experimental — delete this file + the launch call in script.js to remove.
   =========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarsePointer = window.matchMedia('(pointer: coarse)').matches;

  /* ---- geometry (logical px; CSS scales the canvas) ---- */
  var COLS = 20, ROWS = 12, TILE = 32, W = COLS * TILE, H = ROWS * TILE;
  var PLAYER_R = 9, GUARD_R = 9, SCALE = 2;
  var WALK_SPEED = 92, RUN_SPEED = 152, BOX_SPEED = 58;
  var LOS_STEP = 6, SCAN_TIME = 1.05, SCAN_ARC = 0.7;
  var SPOT_FULL = 1.0;                 // suspicion needed to raise the alarm
  var ALERT_GRACE = 2.2, EVASION_TIME = 16, CAUTION_TIME = 20, SEARCH_TIME = 4;
  var SHOOT_RATE = 0.33, REGEN = 0.05, GRAB_DIST = 14;
  var RUN_NOISE_R = 96, KNOCK_R = 150, NOISE_INT = 0.3, KNOCK_CD = 1.1;
  var CQC_R = 24, CQC_REAR = 2.4, CQC_CD = 0.8, PICKUP_R = 15, EXIT_R = 16;

  /* ---- palette (scene stays codec mint-on-steel; sprites carry color).
     MGS1 / Shadow Moses: mint sampled from Snake's 1998 codec portrait —
     --ink #77d2a6, --ink-strong #b4ecd0, --error #e0606d. ---- */
  var C = {
    bg: '#071612', panel: '#0f2220',
    floorA: '#0b1f19', floorB: '#0e2822',            // checker pair (~4 steps apart — visible)
    floorDot: 'rgba(119,210,166,0.06)',              // dither dots
    grid: 'rgba(119,210,166,0.04)',
    wallFace: '#1b3f34', wallTop: '#2f6e58',         // lit top face
    wallRim: '#5fbf95',                              // 1px top rim highlight
    wallFront: '#12302a',                            // south "front face" (2.5D height)
    wallSide: '#0c211c',                             // shaded right edge
    wallEdge: '#3f8a6e', wallShadow: 'rgba(0,0,0,0.4)',
    green: '#77d2a6', bright: '#b4ecd0', dim: '#4f8f7a',
    amber: '#e0c25a', amberHi: '#f0d98c',
    red: '#e0606d', redHi: '#ef8f98'
  };
  /* per-op floor identity (baked once in buildBg — zero per-frame cost):
     small hue offsets on the checker pair, everything stays in the mint family */
  var FLOORS = {
    heliport: { a: '#10261f', b: '#142e27' },   // snow-dusted concrete — lighter, cooler
    hangar: { a: '#0b1f19', b: '#0e2822' },     // base slab
    nuke: { a: '#0a1d1c', b: '#0d2624' }        // composite panels — a touch bluer
  };

  /* ---- pixel sprites (16x16 grids = one tile tall at SCALE 2; '.' transparent).
     Drawn rotated to face; sprites face UP pre-rotation (facing + PI/2).
     Read top-down: weapon forward (row 0 = muzzle, the brightest W pixel, so
     facing reads instantly), then head, shoulders, torso, legs. Symmetric
     about the column 7|8 seam except the bandana tails. Letters:
     K internal edge · S suit · B suit shade · G hair/helmet · g gunmetal ·
     H skin · W muzzle · N bandana · T bandana tail · V visor. ---- */
  // Solid Snake — sneaking suit in the mint tones, bandana band across the
  // crown with two trailing tail pixels per side, pistol held two-handed forward
  var PLAYER = [
    '.......WW.......',
    '.......gg.......',
    '.......gg.......',
    '......KggK......',
    '......HggH......',
    '.....HHHHHH.....',
    '....SSSHHSSS....',
    '...SSSKNNKSSS...',
    '...SSKNNNNKSS...',
    '...SSKGGGGKSS...',
    '...SSKGGGGKSS...',
    '..T.SBKGGKBS.T..',
    '.T.SSSBKKBSSS.T.',
    '...SSSBBBBSSS...',
    '...SBB....BBS...',
    '....BB....BB....'
  ];
  // Genome soldier — helmet dome with a bright visor band (V, the facing cue),
  // rifle forward, broad armored shoulders; lit red when hostile
  var GUARD = [
    '.......WW.......',
    '.......gg.......',
    '.......gg.......',
    '......KggK......',
    '.....HHggHH.....',
    '.....SSggSS.....',
    '....SSSKKSSS....',
    '..SSSSKVVKSSSS..',
    '..SSSKVVVVKSSS..',
    '..SSSKGGGGKSSS..',
    '..SSSKGGGGKSSS..',
    '...SSBKGGKBSS...',
    '...SSBBKKBBSS...',
    '...SSSBBBBSSS...',
    '...SBB....BBS...',
    '....BB....BB....'
  ];
  // cardboard box from above: lit top edge, centre lid seam, taped corner
  // tabs (W), shaded right/bottom (D), a label line + a stamped print mark
  var BOX = [
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KWWWWWWKWWWWWK.',
    '.KWWBBBBKBBBWWK.',
    '.KBBBBBBKBBBBDK.',
    '.KBBDDBBKBBBBDK.',
    '.KBBBBBBKBBBBDK.',
    '.KBBBBBBKBBBBDK.',
    '.KBBBBBBKBBBBDK.',
    '.KBBBBBBKBDDBDK.',
    '.KBBBBBBKBDDBDK.',
    '.KBBBBBBKBBBBDK.',
    '.KWWBBBBKBBBWWK.',
    '.KWWDDDDKDDDWWK.',
    '.KKKKKKKKKKKKKK.',
    '................'
  ];
  // intel keycard (8x6): amber body, lighter top stripe, bright contact notch
  // (W) and a 1px darker slot — replaces the old rotating square
  var KEYCARD = [
    '.AAAAAA.',
    'ALLLLLWA',
    'AAAAAAAA',
    'AAAAAAAA',
    'ADDAAAAA',
    '.AAAAAA.'
  ];
  // frame B of the 2-frame walk cycle (legs passing) — rows 14–15 swapped
  var WALK_B_ROWS = ['....KSBKKBSK....', '.....KK..KK.....'];
  var PLAYER_B = PLAYER.slice(0, 14).concat(WALK_B_ROWS);
  var GUARD_B = GUARD.slice(0, 14).concat(WALK_B_ROWS);
  var PAL_PLAYER = { K: '#06100a', S: '#4f9a7c', H: '#cda678', B: '#2c5a46', G: '#1c1f1c', g: '#5f7470', W: '#c2f7e0', N: '#b4ecd0', T: '#9fe3c4' };
  var PAL_GUARD = { K: '#06100a', S: '#7c6a3d', H: '#cda678', B: '#4d4326', G: '#353a28', g: '#6b6f62', W: '#cbb878', V: '#e6d9a0' };
  var PAL_GUARD_RED = { K: '#160707', S: '#b0463f', H: '#cda678', B: '#6e2a26', G: '#3e1f1f', g: '#7a4a48', W: '#e89089', V: '#ffb9b0' };
  var PAL_BOX = { K: '#3a2a14', B: '#9c7a44', W: '#c8a86a', D: '#775b30' };
  var PAL_KEY = { A: '#e0c25a', L: '#f0d98c', W: '#fff6d0', D: '#8a6f24' };

  /* ---- pre-rendered sprite canvases (crisp pixels + 1px outline; built once).
     Player gets a faint bright outline (hero pop); guards a dark one (grounded). ---- */
  var SPR = null;
  function makeSprite(grid, pal, outline) {
    var rows = grid.length, cols = grid[0].length, pad = 1;
    var cv = document.createElement('canvas');
    cv.width = (cols + 2 * pad) * SCALE; cv.height = (rows + 2 * pad) * SCALE;
    var g = cv.getContext('2d');
    function solid(r, c) {
      if (r < 0 || c < 0 || r >= rows || c >= cols) return false;
      var ch = grid[r].charAt(c); return ch !== '.' && !!pal[ch];
    }
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      if (solid(r, c)) { g.fillStyle = pal[grid[r].charAt(c)]; g.fillRect((c + pad) * SCALE, (r + pad) * SCALE, SCALE, SCALE); }
      else if (outline && (solid(r - 1, c) || solid(r + 1, c) || solid(r, c - 1) || solid(r, c + 1))) {
        g.fillStyle = outline; g.fillRect((c + pad) * SCALE, (r + pad) * SCALE, SCALE, SCALE);
      }
    }
    return cv;
  }
  function buildSprites() {
    var pOut = 'rgba(180,236,208,0.35)', gOut = 'rgba(3,10,6,0.9)';
    SPR = {
      player: [makeSprite(PLAYER, PAL_PLAYER, pOut), makeSprite(PLAYER_B, PAL_PLAYER, pOut)],
      guard: [makeSprite(GUARD, PAL_GUARD, gOut), makeSprite(GUARD_B, PAL_GUARD, gOut)],
      guardRed: [makeSprite(GUARD, PAL_GUARD_RED, gOut), makeSprite(GUARD_B, PAL_GUARD_RED, gOut)],
      box: makeSprite(BOX, PAL_BOX, 'rgba(0,0,0,0.5)'),
      key: makeSprite(KEYCARD, PAL_KEY, 'rgba(6,16,10,0.8)')
    };
  }

  /* ---- levels: maps 20x12 ('#' wall / '.' floor). Tile coords [col,row].
     Shadow Moses ops — floor: buildBg() identity key; freq: codec frequency shown
     in the briefing caller line. Maps/paths/speeds are the gameplay and stay put. ---- */
  var LEVELS = [
    {
      name: 'HELIPORT', caller: 'CAMPBELL', freq: '140.85', floor: 'heliport',
      brief: 'Snow on the heliport. Grab the intel and reach the EXIT. One sentry on patrol. If you are spotted the pad goes to ALERT — break line of sight and lie low to slip away.',
      map: ['####################', '#..................#', '#..####....####....#', '#..####....####....#',
        '#..................#', '#.......####.......#', '#.......####.......#', '#..................#',
        '#..####....####....#', '#..####....####....#', '#..................#', '####################'],
      start: [1, 10], exit: [18, 1], intel: [10, 4],
      guards: [{ path: [[2, 4], [17, 4]], speed: 70, fov: 1.05, range: 150 }], cameras: []
    },
    {
      name: 'TANK HANGAR', caller: 'OTACON', freq: '141.12', floor: 'hangar',
      brief: 'Two patrols, opposite directions. Use the tank bays to break their sightlines. Try running — it is faster but the noise draws them. Hold still in a box if you must.',
      map: ['####################', '#..................#', '#..##..##..##..##..#', '#..##..##..##..##..#',
        '#..................#', '#..................#', '#..##..##..##..##..#', '#..##..##..##..##..#',
        '#..................#', '#..................#', '#..................#', '####################'],
      start: [1, 10], exit: [18, 1], intel: [9, 5],
      guards: [{ path: [[2, 4], [17, 4]], speed: 82, fov: 1.13, range: 160 },
        { path: [[17, 8], [2, 8]], speed: 82, fov: 1.13, range: 160, offset: 0.5 }], cameras: []
    },
    {
      name: 'NUKE BUILDING B1', caller: 'MEI LING', freq: '140.96', floor: 'nuke',
      brief: 'Three patrols and a camera over the blast door. Knock a wall to lure a guard off his route, or slip behind one for a CQC takedown. Then take the intel and run.',
      map: ['####################', '#..................#', '#..##..####..##....#', '#..##..####..##....#',
        '#..................#', '#....####..####....#', '#....####..####....#', '#..................#',
        '#..##..####..##....#', '#..##..####..##....#', '#..................#', '####################'],
      start: [1, 10], exit: [18, 1], intel: [9, 5],
      guards: [{ path: [[2, 4], [17, 4]], speed: 92, fov: 1.2, range: 172 },
        { path: [[17, 7], [2, 7]], speed: 92, fov: 1.2, range: 172, offset: 0.5 },
        { path: [[2, 10], [17, 10]], speed: 88, fov: 1.15, range: 165, offset: 0.25 }],
      cameras: [{ t: [13, 1], base: Math.PI / 2, arc: 0.9, speed: 0.8, fov: 0.95, range: 150 }]
    }
  ];

  /* ---- per-theme CHROME palettes (frame/bar/HUD/buttons/screens/toast only).
     The canvas playfield stays codec-green in every theme — in-fiction it is a
     codec transmission; only the shell around it dresses for the site theme.
     One map drives everything: CSS custom properties on .mgsg-overlay carry the
     values, the stylesheet defaults are generated from CHROME.codec (so ink/codec
     render the current green EXACTLY), and applyChrome() overrides the vars
     inline for starwars/gotham. Alarm/caution reds+ambers stay literal in the
     stylesheet — a red alert reads as a red alert in every theme. ---- */
  var CHROME = {
    // ink + codec — Shadow Moses mint-on-steel chrome
    codec: {
      bg: '#071612', panel: '#0f2220', line: '#1d3a33', edge: '#3a6b5c', border: '#2e5a4c',
      text: '#77d2a6', hi: '#b4ecd0', dim: '#5f8f7c', glow: '119,210,166', hglow: '180,236,208',
      shade: '4,14,11', pad: '15,34,32', veil: 'rgba(3,10,8,0.92)', toastbg: 'rgba(3,12,9,.82)'
    },
    // holonet — hologram blue on dark glass (site --sw-holo #4aa8ff family)
    starwars: {
      bg: '#060a12', panel: '#0c1726', line: '#16283e', edge: '#3d6a99', border: '#2e5578',
      text: '#4aa8ff', hi: '#8cc6ff', dim: '#7d9fc4', glow: '74,168,255', hglow: '140,198,255',
      shade: '5,10,18', pad: '13,24,38', veil: 'rgba(4,8,14,0.92)', toastbg: 'rgba(6,12,22,.85)'
    },
    // gotham — BTAS deco: black shell, gold chrome (site --ink #d4af6a), red alerts
    gotham: {
      bg: '#0a0a0c', panel: '#121114', line: '#2b2723', edge: '#6a5a38', border: '#4a3f28',
      text: '#d4af6a', hi: '#e8cf9a', dim: '#9a8f78', glow: '212,175,106', hglow: '232,207,154',
      shade: '10,9,8', pad: '22,20,17', veil: 'rgba(6,5,7,0.92)', toastbg: 'rgba(12,11,10,.85)'
    }
  };
  var CHROME_VARS = {
    bg: '--mg-bg', panel: '--mg-panel', line: '--mg-line', edge: '--mg-edge', border: '--mg-border',
    text: '--mg-text', hi: '--mg-hi', dim: '--mg-dim', glow: '--mg-glow', hglow: '--mg-hglow',
    shade: '--mg-shade', pad: '--mg-pad', veil: '--mg-veil', toastbg: '--mg-toastbg'
  };
  function chromeVarsCSS(p) { var s = '', k; for (k in CHROME_VARS) s += CHROME_VARS[k] + ':' + p[k] + ';'; return s; }
  // read html[data-theme] and dress the overlay chrome; inline custom properties
  // beat the stylesheet defaults, and removing them falls back to codec-green
  function applyChrome() {
    if (!overlay) return;
    var t = document.documentElement.getAttribute('data-theme');
    var pal = CHROME[t] || CHROME.codec;   // light/codec/unknown -> green defaults
    for (var k in CHROME_VARS) {
      if (pal === CHROME.codec) overlay.style.removeProperty(CHROME_VARS[k]);
      else overlay.style.setProperty(CHROME_VARS[k], pal[k]);
    }
  }

  /* ---- injected stylesheet (one-time).
     Perf guardrails: all glow here is text-shadow/box-shadow (composited once);
     CRT/vignette/alarm wash are CSS pseudo-elements — GPU compositor only.
     Chrome colors are var(--mg-*) refs so applyChrome() can reskin per theme. ---- */
  var CSS = ''
    + '.mgsg-overlay{' + chromeVarsCSS(CHROME.codec) + 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;'
    + 'background:var(--mg-veil);backdrop-filter:blur(2px);font-family:"Share Tech Mono",ui-monospace,monospace;'
    + 'color:var(--mg-text);opacity:0;transition:opacity .25s ease;padding:16px;overscroll-behavior:contain;overflow-y:auto;}'
    + '.mgsg-overlay.in{opacity:1;}'
    /* max-height + shrinking stage keep HUD/footer reachable on short viewports;
       margin:auto = safe centering (overflow stays scrollable, never clipped off-top) */
    + '.mgsg-frame{width:min(94vw,760px);margin:auto;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);'
    + 'background:var(--mg-bg);border:1px solid var(--mg-border);border-radius:8px;'
    + 'box-shadow:0 24px 70px rgba(0,0,0,.6),0 0 0 1px rgba(var(--mg-glow),.08),0 0 32px rgba(var(--mg-glow),.12);'
    + 'overflow:hidden;display:flex;flex-direction:column;'
    + 'outline:1px solid rgba(var(--mg-glow),.12);outline-offset:-4px;}'
    + '.mgsg-bar{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--mg-line);'
    + 'background:var(--mg-panel);font-size:13px;letter-spacing:1.5px;flex-shrink:0;}'
    + '.mgsg-bar .t{color:var(--mg-hi);text-transform:uppercase;text-shadow:0 0 8px rgba(var(--mg-glow),.5);}'
    /* frequency readout as an LCD chip */
    + '.mgsg-bar .f{margin-left:auto;color:var(--mg-hi);letter-spacing:2px;font-size:12px;'
    + 'background:rgba(var(--mg-shade),.6);border:1px solid var(--mg-border);border-radius:3px;padding:3px 9px;'
    + 'text-shadow:0 0 6px rgba(var(--mg-glow),.6);font-variant-numeric:tabular-nums;}'
    + '.mgsg-frame.alarm .f{color:' + C.redHi + ';border-color:#7a2e35;text-shadow:0 0 6px rgba(224,96,109,.6);}'
    + '.mgsg-bar .f::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;'
    + 'background:var(--mg-text);margin-right:8px;vertical-align:1px;box-shadow:0 0 6px rgba(var(--mg-glow),.8);'
    + 'animation:mgsgBlink 1.4s steps(1) infinite;}'
    + '.mgsg-frame.alarm .f::before{background:' + C.red + ';box-shadow:0 0 6px rgba(224,96,109,.8);animation-duration:.5s;}'
    /* caution: the LCD chip and stage pick up the amber state color */
    + '.mgsg-frame.caution .f{color:' + C.amberHi + ';border-color:#6a5a28;text-shadow:0 0 6px rgba(224,194,90,.6);}'
    + '.mgsg-frame.caution .f::before{background:' + C.amber + ';box-shadow:0 0 6px rgba(224,194,90,.8);animation-duration:.9s;}'
    + '.mgsg-btn{background:transparent;border:1px solid var(--mg-edge);color:var(--mg-text);font:inherit;font-size:12px;'
    + 'line-height:1;padding:5px 8px;border-radius:4px;cursor:pointer;}'
    + '.mgsg-btn:hover{background:rgba(var(--mg-glow),.1);color:var(--mg-hi);}'
    + '.mgsg-hud{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--mg-line);'
    + 'font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--mg-dim);flex-shrink:0;}'
    + '.mgsg-hud b{color:var(--mg-text);font-weight:400;text-shadow:0 0 5px rgba(var(--mg-glow),.35);}'
    + '.mgsg-stbadge{padding:2px 8px;border:1px solid currentColor;border-radius:3px;letter-spacing:2px;color:var(--mg-text);background:rgba(var(--mg-glow),.08);}'
    + '.mgsg-stbadge.alert,.mgsg-stbadge.evasion{color:' + C.red + ';}.mgsg-stbadge.caution{color:' + C.amber + ';background:rgba(224,194,90,.10);}'
    + '.mgsg-stbadge.evasion{background:rgba(224,96,109,.10);}'
    + '.mgsg-stbadge.alert{background:rgba(224,96,109,.14);animation:mgsgBlink .5s steps(1) infinite;}'
    + '.mgsg-lifebar{position:relative;width:88px;height:8px;border:1px solid var(--mg-edge);border-radius:5px;overflow:hidden;background:rgba(0,0,0,.3);}'
    + '.mgsg-lifebar i{display:block;height:100%;width:100%;background:var(--mg-text);transition:width .12s linear;}'
    + '.mgsg-lifebar::after{content:"";position:absolute;inset:0;pointer-events:none;'
    + 'background:repeating-linear-gradient(90deg,transparent 0 7px,rgba(var(--mg-shade),.7) 7px 8px);}'
    + '.mgsg-lifebar.low i{animation:mgsgBlink .6s steps(1) infinite;}'
    + '.mgsg-stage{position:relative;flex:1 1 auto;min-height:0;background:var(--mg-bg);transition:box-shadow .2s ease;'
    + 'box-shadow:inset 0 0 70px rgba(var(--mg-glow),.06);}'
    /* CRT vignette + scanlines (mirrors the site .crt) — pseudo-elements, zero canvas cost */
    + '.mgsg-stage::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:5;'
    + 'background:radial-gradient(ellipse 105% 105% at 50% 50%,transparent 55%,rgba(0,0,0,.42) 100%);'
    + 'transition:background .3s ease;}'
    + '.mgsg-stage::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:5;'
    + 'background:repeating-linear-gradient(0deg,rgba(0,0,0,.14) 0 1px,transparent 1px 3px);}'
    + '.mgsg-stage.alarm{box-shadow:inset 0 0 0 3px ' + C.red + ',inset 0 0 70px rgba(224,96,109,.10);}'
    + '.mgsg-stage.caution{box-shadow:inset 0 0 0 2px rgba(224,194,90,.35),inset 0 0 70px rgba(224,194,90,.07);}'
    + '.mgsg-stage.alarm::before{background:radial-gradient(ellipse 105% 105% at 50% 50%,rgba(224,96,109,.05) 40%,rgba(140,20,30,.30) 100%);'
    + 'animation:mgsgAlarmPulse 1.1s ease-in-out infinite;}'
    + '.mgsg-canvas{display:block;width:100%;height:auto;}'
    /* modern browsers: stage keeps the playfield aspect and the canvas letterboxes
       inside it, so a height-capped frame scales the game instead of clipping it */
    + '@supports (aspect-ratio:1/1){'
    + '.mgsg-stage{aspect-ratio:' + W + '/' + H + ';}'
    + '.mgsg-canvas{position:absolute;inset:0;height:100%;object-fit:contain;}'
    + '}'
    /* overflow:hidden — a tall codec call can never paint over the HUD/footer
       (the phone block below turns it into a scroll instead) */
    + '.mgsg-screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;'
    + 'text-align:center;gap:12px;padding:24px;overflow:hidden;backdrop-filter:blur(1px);'
    + 'opacity:0;visibility:hidden;transform:translateY(6px);'
    + 'transition:opacity .22s ease,transform .22s ease,visibility .22s;'
    + 'background:linear-gradient(rgba(var(--mg-shade),.93),rgba(var(--mg-shade),.86) 30%,rgba(var(--mg-shade),.86) 70%,rgba(var(--mg-shade),.95));}'
    /* codec wipe: every screen opens from a horizontal beam (clip-path, compositor-only) */
    + '.mgsg-screen.show{opacity:1;visibility:visible;transform:none;animation:mgsgWipe .25s ease-out 1;}'
    + '.mgsg-beam{position:absolute;left:0;right:0;top:50%;height:1px;background:var(--mg-hi);opacity:0;pointer-events:none;'
    + 'box-shadow:0 0 8px rgba(var(--mg-hglow),.8);}'
    + '.mgsg-screen.show .mgsg-beam{animation:mgsgBeam .3s ease-out 1;}'
    + '.mgsg-screen h2{font-size:clamp(20px,4.4vw,32px);color:var(--mg-hi);letter-spacing:3px;margin:0;'
    + 'text-shadow:0 0 12px rgba(var(--mg-hglow),.45),0 0 2px rgba(var(--mg-hglow),.8);}'
    /* logotype — condensed MGS treatment: bold, tall (scaleY), stacked chrome shadow */
    + '.mgsg-screen.title h2,.mgsg-screen .rank{font-weight:700;letter-spacing:4px;transform:scaleY(1.28);transform-origin:50% 100%;'
    + 'text-shadow:0 1px 0 rgba(var(--mg-hglow),.9),0 2px 0 rgba(var(--mg-glow),.55),0 3px 0 rgba(var(--mg-shade),.9),'
    + '3px 4px 0 rgba(var(--mg-shade),.85),0 0 22px rgba(var(--mg-glow),.35);}'
    /* scaleY from the bottom edge grows the plate upward — reserve that room so
       the double rule never crosses the kicker above it */
    + '.mgsg-screen.title h2{font-size:clamp(30px,7vw,52px);padding:8px 18px 12px;margin-top:.55em;'
    + 'border-top:3px double var(--mg-border);border-bottom:3px double var(--mg-border);}'
    /* caller line as a small kicker */
    + '.mgsg-screen .caller{color:' + C.amber + ';font-size:10px;letter-spacing:6px;text-transform:uppercase;}'
    /* codec call layout (title + briefing): portrait | wave + frequency strip | portrait */
    + '.mgsg-call{display:none;grid-template-columns:96px minmax(120px,1fr) 96px;align-items:center;gap:14px;width:min(100%,520px);}'
    + '.mgsg-screen.title .mgsg-call,.mgsg-screen.brief .mgsg-call{display:grid;}'
    + '.mgsg-port{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;}'
    + '.mgsg-port .px{position:relative;width:96px;height:96px;border:1px solid var(--mg-edge);background:var(--mg-panel);overflow:hidden;'
    + 'box-shadow:0 0 0 1px rgba(var(--mg-shade),.8),0 0 14px rgba(var(--mg-glow),.12);}'
    + '.mgsg-port .px img{display:block;width:100%;height:100%;object-fit:cover;}'
    + '.mgsg-port .px>span{display:none;}.mgsg-port .px.noimg img{display:none;}'
    /* inset scanlines over every portrait (pseudo-element, compositor-only) */
    + '.mgsg-port .px::after{content:"";position:absolute;inset:0;pointer-events:none;'
    + 'background:repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0 1px,transparent 1px 3px),'
    + 'linear-gradient(rgba(var(--mg-glow),.06),transparent 40%,rgba(var(--mg-shade),.35));}'
    /* NO IMAGE — codec static for callers without a portrait */
    + '.mgsg-port .px.noimg{background:repeating-linear-gradient(90deg,rgba(var(--mg-glow),.10) 0 1px,transparent 1px 3px),'
    + 'repeating-linear-gradient(0deg,rgba(var(--mg-glow),.16) 0 2px,transparent 2px 5px),'
    + 'repeating-linear-gradient(37deg,rgba(var(--mg-shade),.6) 0 3px,transparent 3px 9px),var(--mg-panel);'
    /* the static crawls: background-position steps at ~8 fps (steps(6) over .75s);
       compositor-cheap, and reduced motion keeps the still frame */
    + 'animation:mgsgStatic .75s steps(6) infinite;}'
    + '.mgsg-port .px.noimg span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;'
    + 'font-size:9px;letter-spacing:2px;color:var(--mg-dim);text-shadow:0 0 6px rgba(var(--mg-shade),1);}'
    + '.mgsg-port .who{font-size:8px;letter-spacing:2px;color:var(--mg-dim);}'
    + '.mgsg-cc{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0;}'
    + '.mgsg-fstrip{position:relative;width:100%;height:14px;border-top:1px solid var(--mg-line);border-bottom:1px solid var(--mg-line);'
    + 'background:repeating-linear-gradient(90deg,rgba(var(--mg-glow),.55) 0 1px,transparent 1px 30px),'
    + 'repeating-linear-gradient(90deg,rgba(var(--mg-glow),.22) 0 1px,transparent 1px 6px);'
    + 'background-size:100% 100%,100% 50%;background-position:0 0,0 100%;background-repeat:no-repeat,repeat-x;}'
    + '.mgsg-fstrip i{position:absolute;top:-2px;bottom:-2px;left:50%;width:2px;margin-left:-1px;background:var(--mg-hi);'
    + 'box-shadow:0 0 6px rgba(var(--mg-hglow),.8);}'
    + '.mgsg-fnum{font-size:15px;letter-spacing:3px;color:var(--mg-hi);font-variant-numeric:tabular-nums;text-shadow:0 0 8px rgba(var(--mg-glow),.5);}'
    /* phone widths: the aspect-locked stage is ~210px tall at 375px, so the call
       collapses to kicker + logotype + wave + text — portraits and the frequency
       strip go, gaps/padding tighten, and the screen scrolls from the top
       (safe center where supported) instead of overflowing the frame */
    + '@media (max-width:520px){'
    + '.mgsg-screen{gap:6px;padding:12px;justify-content:flex-start;justify-content:safe center;overflow-y:auto;}'
    + '.mgsg-call{grid-template-columns:1fr;gap:0;width:auto;}'
    + '.mgsg-port,.mgsg-fstrip,.mgsg-fnum{display:none;}'
    + '.mgsg-screen.title h2{margin-top:.3em;padding:4px 12px 6px;font-size:clamp(24px,7vw,52px);}'
    + '.mgsg-screen p{font-size:12px;line-height:1.45;}.mgsg-screen .go{margin-top:2px;}}'
    /* phones: the bar row's min-content (title + LCD chip + SND + EXIT) used to
       exceed 94vw and push the frame past the screen. Smaller title that may
       ellipsize (min-width:0 lets the flex item shrink), tighter gaps/padding,
       and the HUD strip wraps — the frame now fits 100vw at 375px */
    + '@media (max-width:480px){'
    + '.mgsg-bar{gap:6px;padding:7px 8px;font-size:11px;letter-spacing:1px;}'
    + '.mgsg-bar .t{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.mgsg-bar .f{font-size:11px;letter-spacing:1px;padding:3px 6px;flex-shrink:0;white-space:nowrap;}'
    + '.mgsg-bar .f::before{margin-right:5px;}'
    + '.mgsg-bar .mgsg-btn{padding:5px 6px;font-size:11px;flex-shrink:0;white-space:nowrap;}'
    + '.mgsg-hud{gap:6px 10px;padding:6px 8px;font-size:11px;letter-spacing:1px;}'
    + '.mgsg-foot{gap:8px;padding:6px 8px;}}'
    + '.mgsg-screen p{max-width:46ch;font-size:13px;line-height:1.65;color:var(--mg-text);margin:0;}'
    + '.mgsg-screen .sub{color:var(--mg-dim);font-size:12px;letter-spacing:1px;}'
    + '.mgsg-screen .go{margin-top:6px;color:var(--mg-hi);animation:mgsgBlink 1.1s steps(1) infinite;}'
    + '.mgsg-screen.fail h2{color:' + C.red + ';}'
    /* GAME OVER letterbox bars */
    + '.mgsg-screen.fail::before,.mgsg-screen.fail::after{content:"";position:absolute;left:0;right:0;height:13%;background:#020603;}'
    + '.mgsg-screen.fail::before{top:0}.mgsg-screen.fail::after{bottom:0}'
    + '.mgsg-screen .snaaake{font-size:clamp(26px,7vw,56px);color:' + C.red + ';letter-spacing:4px;margin:0;'
    + 'text-shadow:0 0 16px rgba(224,96,109,.6);animation:mgsgFlicker .8s steps(2) 2;}'
    + '.mgsg-screen .rank{font-size:clamp(40px,10vw,80px);color:var(--mg-hi);line-height:1;margin:0;'
    + 'animation:mgsgStampTall .35s cubic-bezier(.2,1.6,.4,1) 1;}'
    /* NEW RECORD flourish — stamped chip under the rank on clear/complete screens
       (scoped like .rank so it outranks the .mgsg-screen p color) */
    + '.mgsg-screen .mgsg-rec{margin:0;font-size:13px;letter-spacing:4px;color:var(--mg-hi);'
    + 'border:1px solid var(--mg-edge);border-radius:3px;padding:4px 12px;background:rgba(var(--mg-glow),.10);'
    + 'text-shadow:0 0 10px rgba(var(--mg-hglow),.6);'
    + 'animation:mgsgStamp .35s cubic-bezier(.2,1.6,.4,1) 1,mgsgBlink 1.1s steps(1) 2 .4s;}'
    /* codec audio wave (matches the site .codec-wave) — title/brief screens only */
    + '.mgsg-wave{display:none;align-items:flex-end;gap:3px;height:16px;}'
    + '.mgsg-screen.title.show .mgsg-wave,.mgsg-screen.brief.show .mgsg-wave{display:inline-flex;}'
    /* transform (compositor-only), not height — mirrors the site .codec-wave fix;
       15px tall, bottom-anchored, base scaleY(.4)=6px = old static height */
    + '.mgsg-wave i{width:3px;height:15px;transform:scaleY(.4);transform-origin:50% 100%;background:var(--mg-text);animation:mgsgWave 1s ease-in-out infinite;}'
    + '.mgsg-wave i:nth-child(2){animation-delay:.15s}.mgsg-wave i:nth-child(3){animation-delay:.3s}'
    + '.mgsg-wave i:nth-child(4){animation-delay:.45s}.mgsg-wave i:nth-child(5){animation-delay:.6s}'
    + '.mgsg-foot{padding:8px 12px;border-top:1px solid var(--mg-line);font-size:11px;color:var(--mg-dim);letter-spacing:.5px;'
    + 'display:flex;gap:12px;flex-wrap:wrap;flex-shrink:0;}.mgsg-foot kbd{border:1px solid var(--mg-edge);border-radius:3px;padding:0 4px;color:var(--mg-text);}'
    + '.mgsg-flash{position:absolute;inset:0;background:' + C.red + ';opacity:0;pointer-events:none;}'
    + '.mgsg-flash.on{animation:mgsgFlash .5s ease-out;}'
    /* codec subtitle toast — visible mirror of the aria-live announcements */
    + '.mgsg-toast{position:absolute;left:50%;bottom:10px;z-index:6;max-width:88%;padding:4px 12px;'
    + 'background:var(--mg-toastbg);border:1px solid var(--mg-edge);border-radius:3px;'
    + 'color:var(--mg-hi);font-size:12px;letter-spacing:1px;text-align:center;pointer-events:none;'
    + 'opacity:0;transform:translateX(-50%) translateY(4px);transition:opacity .18s ease,transform .18s ease;}'
    + '.mgsg-toast.show{opacity:1;transform:translateX(-50%);}'
    + '.mgsg-touch .mgsg-toast{bottom:72px;}'
    /* CRT roll bar + alarm hazard stripes + power-on sweep (compositor-only) */
    + '.mgsg-roll{position:absolute;left:0;right:0;top:-30%;height:26%;pointer-events:none;z-index:6;'
    + 'background:linear-gradient(180deg,transparent,rgba(180,236,208,.045) 50%,transparent);'
    + 'animation:mgsgRoll 7s linear infinite;}'
    + '.mgsg-hazard{position:absolute;left:0;width:200%;height:5px;z-index:6;pointer-events:none;display:none;'
    + 'background:repeating-linear-gradient(45deg,rgba(224,96,109,.55) 0 10px,transparent 10px 20px);}'
    + '.hz-t{top:0}.hz-b{bottom:0}'
    + '.mgsg-stage.alarm .mgsg-hazard{display:block;animation:mgsgHzScroll 1.2s linear infinite;}'
    + '.mgsg-canvas.on{animation:mgsgPowerOn .3s cubic-bezier(.2,.8,.3,1) 1;transform-origin:50% 50%;}'
    /* stats grid on clear/complete/fail screens */
    + '.mgsg-stats{display:none;grid-template-columns:auto auto;gap:4px 18px;font-size:13px;letter-spacing:2px;margin:4px 0;}'
    + '.mgsg-stats span:nth-child(odd){color:var(--mg-dim);text-align:left;}'
    + '.mgsg-stats span:nth-child(even){color:var(--mg-hi);text-align:right;text-shadow:0 0 6px rgba(var(--mg-glow),.4);}'
    + '.mgsg-screen.show .mgsg-stats span{animation:mgsgStatIn .3s both;}'
    + '.mgsg-screen.show .mgsg-stats span:nth-child(n+3){animation-delay:.12s}'
    + '.mgsg-screen.show .mgsg-stats span:nth-child(n+5){animation-delay:.24s}'
    + '.mgsg-screen .mgsg-btn{margin-top:4px;padding:7px 14px;font-size:12px;letter-spacing:2px;}'
    + '.mgsg-pad{position:absolute;left:12px;bottom:12px;display:none;grid-template-columns:repeat(3,46px);grid-template-rows:repeat(3,46px);gap:5px;touch-action:none;}'
    + '.mgsg-acts{position:absolute;right:12px;bottom:12px;display:none;grid-template-columns:repeat(2,52px);grid-template-rows:repeat(2,44px);gap:6px;touch-action:none;}'
    + '.mgsg-pad button,.mgsg-acts button{background:rgba(var(--mg-pad),.85);border:1px solid var(--mg-edge);color:var(--mg-text);'
    + 'border-radius:8px;font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center;-webkit-user-select:none;user-select:none;}'
    + '.mgsg-pad button:active,.mgsg-acts button:active{background:rgba(var(--mg-glow),.2);}'
    + '.mgsg-pad .u{grid-area:1/2}.mgsg-pad .l{grid-area:2/1}.mgsg-pad .r{grid-area:2/3}.mgsg-pad .d{grid-area:3/2}'
    + '.mgsg-pad .p{grid-area:2/2;font-size:10px;letter-spacing:1px;color:var(--mg-dim);}'
    + '.mgsg-touch .mgsg-pad,.mgsg-touch .mgsg-acts{display:grid;}'
    + '.mgsg-touch .mgsg-foot{display:none;}'
    /* SND/EXIT are the only affordances in touch mode — give them touch-size targets */
    + '.mgsg-touch .mgsg-bar .mgsg-btn{min-height:40px;min-width:44px;}'
    + '.mgsg-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);}'
    + '.mgsg-overlay,.mgsg-overlay *{cursor:auto !important;}'
    + '.mgsg-overlay .mgsg-btn,.mgsg-overlay .mgsg-pad button,.mgsg-overlay .mgsg-acts button{cursor:pointer !important;}'
    /* Phone portrait: overlaid on the letterboxed stage the touch controls
       covered ~72% of the playfield. Drop them below the stage into real frame
       padding (frame is overflow:hidden, so negative bottom alone would clip);
       the overlay already scrolls + margin:auto safe-centers on short
       viewports, so the taller frame degrades gracefully. Toast reclaims the
       stage bottom it vacated. Must sit AFTER the base .mgsg-pad/.mgsg-acts/
       .mgsg-touch .mgsg-toast rules — equal specificity, source order wins. */
    + '@media (max-width:700px) and (orientation:portrait){'
    + '.mgsg-touch .mgsg-frame{padding-bottom:172px;}'
    + '.mgsg-touch .mgsg-pad{bottom:-160px;}'
    + '.mgsg-touch .mgsg-acts{bottom:-133px;}'
    + '.mgsg-touch .mgsg-toast{bottom:10px;}'
    + '}'
    + '@media (prefers-reduced-motion:reduce){.mgsg-screen .go{animation:none}.mgsg-overlay{transition:none}.mgsg-stage{transition:none}'
    + '.mgsg-stage.alarm::before,.mgsg-bar .f::before,.mgsg-stbadge.alert,.mgsg-lifebar.low i,.mgsg-wave i,'
    + '.mgsg-screen .snaaake,.mgsg-screen .rank,.mgsg-screen .mgsg-rec{animation:none}'
    + '.mgsg-roll{display:none}.mgsg-stage.alarm .mgsg-hazard{animation:none}.mgsg-canvas.on{animation:none}'
    + '.mgsg-screen.show .mgsg-stats span{animation:none}.mgsg-toast{transition:none}'
    + '.mgsg-screen{transition:opacity .22s ease;transform:none}'
    + '.mgsg-screen.show{animation:none;clip-path:none}.mgsg-screen.show .mgsg-beam{animation:none}'
    + '.mgsg-port .px.noimg{animation:none}}'
    + '@keyframes mgsgStatic{to{background-position:16px 0,0 26px,-33px 21px}}'
    + '@keyframes mgsgBlink{50%{opacity:.25}}@keyframes mgsgFlash{from{opacity:.5}to{opacity:0}}'
    + '@keyframes mgsgAlarmPulse{50%{opacity:.55}}@keyframes mgsgFlicker{50%{opacity:.4}}'
    + '@keyframes mgsgStamp{from{transform:scale(2.4);opacity:0}to{transform:scale(1);opacity:1}}'
    + '@keyframes mgsgStampTall{from{transform:scale(2.4) scaleY(1.28);opacity:0}to{transform:scaleY(1.28);opacity:1}}'
    + '@keyframes mgsgWipe{from{clip-path:inset(50% 0)}to{clip-path:inset(0)}}'
    + '@keyframes mgsgBeam{0%{opacity:1;transform:scaleX(.15)}55%{opacity:1;transform:scaleX(1)}100%{opacity:0;transform:scaleX(1)}}'
    + '@keyframes mgsgWave{0%,100%{transform:scaleY(.333)}50%{transform:scaleY(1)}}'
    + '@keyframes mgsgRoll{from{transform:translateY(0)}to{transform:translateY(520%)}}'
    + '@keyframes mgsgHzScroll{from{transform:translateX(0)}to{transform:translateX(-28.3px)}}'
    + '@keyframes mgsgPowerOn{0%{transform:scaleY(.005) scaleX(1.1);opacity:.4}60%{transform:scaleY(1.04)}100%{transform:none;opacity:1}}'
    + '@keyframes mgsgStatIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1}}';

  /* ---- module handles (built lazily on first open) ---- */
  var built = false, open = false;
  var overlay, frame, stage, canvas, ctx, dpr = 1;
  var stateBadge, lifeFill, hudIntel, hudLevel, hudTime;
  var lastLifeW = '', lastLifeC = '';   // last DOM life-bar width/color written (skip no-op style writes)
  var screenEl, scrCaller, scrTitle, scrBody, scrSub, scrGo, scrRank, scrStats, scrRec, scrRetry, flashEl, srLive, muteBtn;
  var scrPortThem, scrWhoThem, scrFnum, scrNeedle, beamEl, freqEl;   // codec-call layout + wipe beam + LCD chip
  var toastEl = null, toastTimer = null, typeTimer = null, freqTimer = null;
  var radarMap = null;   // Soliton minimap wall layout (baked in buildBg at radar scale)
  var rafId = null, lastT = 0, muted = false, audioCtx = null, prevFocus = null, alertLoop = null;
  var bgLayer = null;    // pre-rendered floor+walls (rebuilt on loadLevel/sizeCanvas)
  var shakeT = 0;        // screen-shake timer (set on alert, decays in update)
  var hitFlashT = 0;     // taking-fire vignette timer (visual only)
  var hitBeepCD = 0;     // throttle for the taking-fire beep
  var fxPulses = [];     // transient ring pulses (CQC takedown, intel grab) — presentation only
  // cached gradients — created once (pool/vignette) or per level (exit/intel);
  // render() never calls createRadialGradient for these (only the cones remain per-frame — the radar is gradient-free)
  var poolGrad = null, vigGrad = null, exitGlowGrad = null, intelHaloGrad = null;

  /* ---- game state ---- */
  var state = 'title';   // title | briefing | playing | paused | clear | complete | over
  var levelIdx = 0, level = null, walls = null;
  var player = null, guards = [], cameras = [], intel = null, exitPt = null;
  var alertPhase = 'normal', alertGrace = 0, evasionTimer = 0, cautionTimer = 0;
  var lastKnown = null, alertsThisLevel = 0, totalAlerts = 0;
  var life = 1, elapsed = 0, totalTime = 0, intelGot = false;
  var boxed = false, running = false, noiseAccum = 0, knockCD = 0, cqcCD = 0, walkPhase = 0, noisePings = [], boxHinted = false;
  var keys = Object.create(null);
  var touchDir = { up: 0, down: 0, left: 0, right: 0 };

  /* ===================== build DOM / styles ===================== */
  function $(sel) { return overlay.querySelector(sel); }

  function build() {
    if (built) return;
    built = true;

    var style = document.createElement('style');
    style.id = 'mgsg-styles';
    style.textContent = CSS;
    document.head.appendChild(style);

    overlay = document.createElement('div');
    overlay.className = 'mgsg-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Codec Infiltration — Metal Gear style stealth mini-game');
    if (coarsePointer) overlay.classList.add('mgsg-touch');

    overlay.innerHTML =
      '<div class="mgsg-frame" tabindex="-1">'
      + '<div class="mgsg-bar"><span class="t">&#9658; CODEC INFILTRATION</span><span class="f">140.85</span>'
      + '<button type="button" class="mgsg-btn" data-act="mute" title="Toggle sound">SND</button>'
      + '<button type="button" class="mgsg-btn" data-act="close" title="Disconnect (Esc)">&times; EXIT</button></div>'
      + '<div class="mgsg-hud"><span class="mgsg-stbadge" data-hud="state">NORMAL</span>'
      + '<span>LIFE</span><span class="mgsg-lifebar"><i></i></span>'
      + '<span>INTEL <b data-hud="intel">[ ]</b></span>'
      + '<span>OP <b data-hud="level">1/3</b></span>'
      + '<span>T <b data-hud="time">0:00</b></span></div>'
      + '<div class="mgsg-stage">'
      + '<canvas class="mgsg-canvas" width="' + W + '" height="' + H + '" aria-hidden="true"></canvas>'
      + '<div class="mgsg-flash"></div>'
      + '<div class="mgsg-roll" aria-hidden="true"></div>'
      + '<div class="mgsg-hazard hz-t" aria-hidden="true"></div><div class="mgsg-hazard hz-b" aria-hidden="true"></div>'
      + '<div class="mgsg-toast" aria-hidden="true"></div>'
      + '<div class="mgsg-screen"><i class="mgsg-beam" aria-hidden="true"></i><span class="caller" data-scr="caller"></span>'
      + '<h2 data-scr="title">CODEC INFILTRATION</h2>'
      /* codec call row (title + briefing only): you | wave + frequency strip | caller.
         Decorative — announce() carries the same information to the aria-live region. */
      + '<div class="mgsg-call" aria-hidden="true">'
      + '<div class="mgsg-port"><div class="px"><img src="img/headshot-dither-green.png" alt="" width="96" height="96" loading="lazy"></div><span class="who">YOU</span></div>'
      + '<div class="mgsg-cc"><span class="mgsg-wave"><i></i><i></i><i></i><i></i><i></i></span>'
      + '<div class="mgsg-fstrip"><i data-scr="needle"></i></div><span class="mgsg-fnum" data-scr="fnum">140.85</span></div>'
      + '<div class="mgsg-port"><div class="px noimg" data-scr="them"><img src="img/codec-snake-face.png" alt="" width="96" height="96" loading="lazy"><span>NO IMAGE</span></div><span class="who" data-scr="who"></span></div>'
      + '</div>'
      + '<p class="rank" data-scr="big" style="display:none"></p>'
      + '<div class="mgsg-stats" data-scr="stats" style="display:none"></div>'
      + '<p class="mgsg-rec" data-scr="rec" style="display:none"></p>'
      + '<p data-scr="body"></p><p class="sub" data-scr="sub"></p>'
      + '<p class="go" data-scr="go">PRESS ENTER</p>'
      + '<button type="button" class="mgsg-btn" data-scr="retry" style="display:none">RETRY OP</button></div>'
      + '<div class="mgsg-pad" aria-hidden="true">'
      + '<button class="u" data-dir="up" tabindex="-1">&#9650;</button>'
      + '<button class="l" data-dir="left" tabindex="-1">&#9664;</button>'
      + '<button class="r" data-dir="right" tabindex="-1">&#9654;</button>'
      + '<button class="d" data-dir="down" tabindex="-1">&#9660;</button>'
      + '<button class="p" data-act2="pause" tabindex="-1" title="Pause">&#10074;&#10074;</button></div>'
      + '<div class="mgsg-acts" aria-hidden="true">'
      + '<button data-act2="run" tabindex="-1">RUN</button>'
      + '<button data-act2="box" tabindex="-1">BOX</button>'
      + '<button data-act2="knock" tabindex="-1">KNK</button>'
      + '<button data-act2="cqc" tabindex="-1">CQC</button></div>'
      + '</div>'
      + '<div class="mgsg-foot"><span><kbd>WASD</kbd> move</span><span><kbd>Shift</kbd> run</span>'
      + '<span><kbd>B</kbd> box</span><span><kbd>K</kbd> knock</span><span><kbd>F</kbd> CQC</span>'
      + '<span><kbd>R</kbd> retry</span><span><kbd>Esc</kbd> pause/exit</span></div>'
      + '<div class="mgsg-sr" aria-live="assertive"></div>'
      + '</div>';

    document.body.appendChild(overlay);

    frame = $('.mgsg-frame'); stage = $('.mgsg-stage');
    canvas = $('.mgsg-canvas'); ctx = canvas.getContext('2d');
    stateBadge = $('[data-hud="state"]'); lifeFill = $('.mgsg-lifebar i');
    hudIntel = $('[data-hud="intel"]'); hudLevel = $('[data-hud="level"]'); hudTime = $('[data-hud="time"]');
    screenEl = $('.mgsg-screen'); scrCaller = $('[data-scr="caller"]'); scrTitle = $('[data-scr="title"]');
    scrRank = $('[data-scr="big"]'); scrBody = $('[data-scr="body"]'); scrSub = $('[data-scr="sub"]'); scrGo = $('[data-scr="go"]');
    flashEl = $('.mgsg-flash'); srLive = $('.mgsg-sr'); muteBtn = $('[data-act="mute"]');
    toastEl = $('.mgsg-toast'); scrStats = $('[data-scr="stats"]'); scrRec = $('[data-scr="rec"]'); scrRetry = $('[data-scr="retry"]');
    scrPortThem = $('[data-scr="them"]'); scrWhoThem = $('[data-scr="who"]'); scrFnum = $('[data-scr="fnum"]'); scrNeedle = $('[data-scr="needle"]');
    beamEl = $('.mgsg-beam'); freqEl = $('.mgsg-bar .f');

    buildSprites();
    sizeCanvas();
    buildStaticGrads();

    $('[data-act="close"]').addEventListener('click', closeGame);
    muteBtn.addEventListener('click', function (e) {
      unlockAudio();  // real gesture — resume a policy-suspended AudioContext
      muted = !muted; muteBtn.textContent = muted ? 'MUTE' : 'SND';
      muteBtn.style.color = muted ? 'var(--mg-dim)' : '';
      if (muted) stopAlertMusic();
      else if (alertPhase === 'alert' || alertPhase === 'evasion') startAlertMusic();
      // A mouse/touch click leaves focus on this button, and onKey defers
      // Enter/Space to a focused .mgsg-btn — so every Enter would keep toggling
      // SND instead of advancing the screen. Hand focus back to the frame for
      // pointer activations; keyboard activations (detail 0) keep focus so
      // Tab users can toggle repeatedly.
      if (e.detail > 0) frame.focus();
    });

    // tap/click anywhere on a menu screen advances it (touch users have no Enter)
    screenEl.addEventListener('click', function () { if (state !== 'playing') advance(); });
    // mid-run retry from the pause screen — the touch path back into a level
    scrRetry.addEventListener('click', function (e) { e.stopPropagation(); unlockAudio(); startBriefing(); });

    // touch d-pad (movement)
    Array.prototype.forEach.call(overlay.querySelectorAll('.mgsg-pad button[data-dir]'), function (b) {
      var dir = b.getAttribute('data-dir');
      var set = function (v) { return function (e) { e.preventDefault(); if (v) unlockAudio(); touchDir[dir] = v; }; };
      b.addEventListener('touchstart', set(1), { passive: false });
      b.addEventListener('touchend', set(0), { passive: false });
      b.addEventListener('touchcancel', set(0), { passive: false });
      b.addEventListener('mousedown', set(1)); b.addEventListener('mouseup', set(0)); b.addEventListener('mouseleave', set(0));
    });
    // touch action buttons (+ the d-pad center pause)
    Array.prototype.forEach.call(overlay.querySelectorAll('.mgsg-acts button,.mgsg-pad button[data-act2]'), function (b) {
      var a = b.getAttribute('data-act2');
      var press = function (e) {
        e.preventDefault(); unlockAudio();
        if (state === 'playing') {
          if (a === 'run') running = true;
          else if (a === 'box') doBox(); else if (a === 'knock') doKnock(); else if (a === 'cqc') doCQC();
          else if (a === 'pause') pauseGame();  // touch users need a pause path too
        } else advance();  // any action button doubles as "continue" on menu screens
      };
      b.addEventListener('touchstart', press, { passive: false });
      b.addEventListener('mousedown', press);
      if (a === 'run') {
        var rel = function (e) { e.preventDefault(); running = false; };
        b.addEventListener('touchend', rel, { passive: false });
        b.addEventListener('touchcancel', rel, { passive: false });
        b.addEventListener('mouseup', rel); b.addEventListener('mouseleave', rel);
      }
    });
  }

  /* ===================== canvas sizing (DPR-aware; refreshed each open) ===================== */
  function sizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;  // canvas resize resets state — keep pixel art crisp
    if (walls) buildBg();  // rebuild static layer at the new DPR (first open: no level yet)
  }
  // gradients that never change shape: player light pool (drawn under a translate,
  // so it is built at the origin) and the full-strength red vignette (drawn through
  // globalAlpha, which scales it for both taking-fire flashes and low-life pulses)
  function buildStaticGrads() {
    poolGrad = ctx.createRadialGradient(0, 0, 6, 0, 0, 130);
    poolGrad.addColorStop(0, 'rgba(180,236,208,0.10)'); poolGrad.addColorStop(1, 'rgba(180,236,208,0)');
    vigGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.8);
    vigGrad.addColorStop(0, 'rgba(224,96,109,0)'); vigGrad.addColorStop(1, 'rgba(224,96,109,1)');
  }

  /* ===================== audio (tiny WebAudio sfx) ===================== */
  // Called from genuine gestures (keydown / clicks / touchstart): under strict autoplay
  // policies (Safari/iOS) a context created outside a gesture starts 'suspended' and
  // must be resume()d inside one, or every sfx silently no-ops.
  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
  }
  function beep(freq, dur, type, vol) {
    if (muted || !open) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t = audioCtx.currentTime, osc = audioCtx.createOscillator(), g = audioCtx.createGain();
      osc.type = type || 'square'; osc.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      osc.connect(g).connect(audioCtx.destination); osc.start(t); osc.stop(t + dur);
    } catch (e) {}
  }
  function sfxPickup() { beep(880, 0.08); setTimeout(function () { beep(1320, 0.1); }, 70); }
  function sfxSpot() { beep(1660, 0.07, 'square', 0.05); setTimeout(function () { beep(1976, 0.12, 'square', 0.05); }, 80); }
  function sfxKnock() { beep(180, 0.06, 'square', 0.06); setTimeout(function () { beep(150, 0.07, 'square', 0.05); }, 90); }
  function sfxCQC() { beep(120, 0.12, 'sawtooth', 0.06); }
  function sfxClear() { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { beep(f, 0.12, 'square', 0.05); }, i * 90); }); }
  function sfxOver() { [392, 330, 262, 196].forEach(function (f, i) { setTimeout(function () { beep(f, 0.22, 'sawtooth', 0.06); }, i * 160); }); }
  function startAlertMusic() {
    if (alertLoop || muted) return;
    var step = 0;
    alertLoop = setInterval(function () { if (!open || muted) return; beep(step % 2 ? 330 : 247, 0.13, 'sawtooth', 0.05); step++; }, 230);
  }
  function stopAlertMusic() { if (alertLoop) { clearInterval(alertLoop); alertLoop = null; } }

  /* ===================== geometry / grid helpers ===================== */
  function px(t) { return t * TILE + TILE / 2; }
  function tcol(x) { return (x / TILE) | 0; }
  function trow(y) { return (y / TILE) | 0; }
  function isWallPx(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    return walls[(y / TILE) | 0][(x / TILE) | 0];
  }
  function circleHitsWall(cx, cy, r) {
    if (cx - r < 0 || cy - r < 0 || cx + r >= W || cy + r >= H) return true;
    var c0 = Math.max(0, ((cx - r) / TILE) | 0), c1 = Math.min(COLS - 1, ((cx + r) / TILE) | 0);
    var r0 = Math.max(0, ((cy - r) / TILE) | 0), r1 = Math.min(ROWS - 1, ((cy + r) / TILE) | 0);
    for (var rr = r0; rr <= r1; rr++) for (var cc = c0; cc <= c1; cc++) {
      if (!walls[rr][cc]) continue;
      var nx = Math.max(cc * TILE, Math.min(cx, cc * TILE + TILE));
      var ny = Math.max(rr * TILE, Math.min(cy, rr * TILE + TILE));
      var dx = cx - nx, dy = cy - ny;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }
  function losClear(x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0, dist = Math.hypot(dx, dy);
    var steps = Math.max(1, Math.ceil(dist / LOS_STEP));
    for (var s = 1; s <= steps; s++) { var t = s / steps; if (isWallPx(x0 + dx * t, y0 + dy * t)) return false; }
    return true;
  }
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
  function rayHit(x, y, a, maxd) {
    var cs = Math.cos(a), sn = Math.sin(a);
    for (var d = LOS_STEP; d <= maxd; d += LOS_STEP) if (isWallPx(x + cs * d, y + sn * d)) return { x: x + cs * (d - LOS_STEP), y: y + sn * (d - LOS_STEP) };
    return { x: x + cs * maxd, y: y + sn * maxd };
  }
  // BFS one step from (sc,sr) toward (gc,gr) over floor tiles; null if there/unreachable
  function bfsStep(sc, sr, gc, gr) {
    if (sc === gc && sr === gr) return null;
    if (gc < 0 || gr < 0 || gc >= COLS || gr >= ROWS || walls[gr][gc]) return null;
    var N = COLS * ROWS, vis = new Uint8Array(N), prev = new Int32Array(N), q = new Int32Array(N);
    var head = 0, tail = 0, startK = sr * COLS + sc, goalK = gr * COLS + gc;
    q[head++] = startK; vis[startK] = 1; prev[startK] = -1;
    var dc = [1, -1, 0, 0], dr = [0, 0, 1, -1];
    while (tail < head) {
      var cur = q[tail++], cc = cur % COLS, cr = (cur / COLS) | 0;
      if (cur === goalK) break;
      for (var i = 0; i < 4; i++) {
        var nc = cc + dc[i], nr = cr + dr[i];
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || walls[nr][nc]) continue;
        var k = nr * COLS + nc; if (vis[k]) continue;
        vis[k] = 1; prev[k] = cur; q[head++] = k;
      }
    }
    if (!vis[goalK]) return null;
    var c2 = goalK;
    while (prev[c2] !== -1 && prev[c2] !== startK) c2 = prev[c2];
    return { dc: (c2 % COLS) - sc, dr: ((c2 / COLS) | 0) - sr };
  }
  // a noise at (x,y) makes nearby patrolling guards investigate that spot
  function emitNoise(x, y, radius) {
    noisePings.push({ x: x, y: y, r: radius, t: 0 });
    if (alertPhase === 'alert' || alertPhase === 'evasion') return;
    for (var i = 0; i < guards.length; i++) {
      var g = guards[i]; if (g.down) continue;
      if (g.behavior === 'investigate' && g.invTimer > 0) continue;  // already checking a spot — don't re-home onto the live player
      if (Math.hypot(g.x - x, g.y - y) <= radius) { g.behavior = 'investigate'; g.invC = tcol(x); g.invR = trow(y); g.invTimer = SEARCH_TIME; g.scanning = false; }
    }
  }
  // purely visual ring pulse (CQC takedown, intel grab) — guards never react to it
  function addPulse(x, y, rgb) { if (fxPulses.length < 6) fxPulses.push({ x: x, y: y, c: rgb, t: 0 }); }

  /* ===================== level setup ===================== */
  function loadLevel(i) {
    level = LEVELS[i];
    walls = level.map.map(function (row) { return row.split('').map(function (ch) { return ch === '#'; }); });
    player = { x: px(level.start[0]), y: px(level.start[1]), fx: 0, fy: -1, moving: false };
    exitPt = { x: px(level.exit[0]), y: px(level.exit[1]) };
    intel = level.intel ? { x: px(level.intel[0]), y: px(level.intel[1]) } : null;
    intelGot = !level.intel;
    // per-level cached glow gradients (exit + intel are static per level)
    exitGlowGrad = ctx.createRadialGradient(exitPt.x, exitPt.y, 3, exitPt.x, exitPt.y, 20);
    exitGlowGrad.addColorStop(0, 'rgba(180,236,208,1)'); exitGlowGrad.addColorStop(1, 'rgba(180,236,208,0)');
    if (intel) {
      intelHaloGrad = ctx.createRadialGradient(intel.x, intel.y, 2, intel.x, intel.y, 18);
      intelHaloGrad.addColorStop(0, 'rgba(224,194,90,1)'); intelHaloGrad.addColorStop(1, 'rgba(224,194,90,0)');
    } else intelHaloGrad = null;

    guards = level.guards.map(function (g) {
      var path = g.path.map(function (p) { return { x: px(p[0]), y: px(p[1]) }; });
      var a = path[0], b = path[1 % path.length], off = g.offset || 0;
      return {
        path: path, speed: g.speed, fov: g.fov, range: g.range,
        x: a.x + (b.x - a.x) * off, y: a.y + (b.y - a.y) * off,
        i: 1 % path.length, mode: 'move', pscanT: 0, pscanBase: 0,
        facing: Math.atan2(b.y - a.y, b.x - a.x),
        behavior: 'patrol', invC: 0, invR: 0, invTimer: 0, scanning: false, scanBase: 0, scanT: 0,
        seeing: false, _was: false, spotTimer: 0, fovMul: 1, rangeMul: 1, down: false, glimpseC: 0, glimpseR: 0,
        lastMark: null, markSince: 0
      };
    });
    cameras = (level.cameras || []).map(function (c) {
      return { x: px(c.t[0]), y: px(c.t[1]), base: c.base, arc: c.arc, speed: c.speed, fov: c.fov, range: c.range, facing: c.base, seeing: false, spotTimer: 0, isCam: true };
    });

    alertPhase = 'normal'; alertGrace = 0; evasionTimer = 0; cautionTimer = 0; lastKnown = null; alertsThisLevel = 0;
    life = 1; elapsed = 0; boxed = false; running = false; noiseAccum = 0; knockCD = 0; cqcCD = 0; walkPhase = 0; noisePings = []; boxHinted = false;
    hitFlashT = 0; hitBeepCD = 0; fxPulses.length = 0; hideToast();
    stopAlertMusic();
    hudLevel.textContent = (i + 1) + '/' + LEVELS.length;
    if (stage) stage.classList.remove('alarm');
    updateHud();
    buildBg();
  }

  /* ---- pre-rendered background layer (floor + walls). Static world lives here;
     per-frame canvas work is 1 blit + ~10 entities + a handful of gradients. ---- */
  // deterministic 0..1 hash for baked scatter (snow, stains) — no Math.random,
  // so every rebuild (DPR change, retry) bakes the identical floor
  function hash01(n) { var v = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); }
  // per-op floor dressing, drawn under the walls (they fully cover their tiles)
  function bakeFloorIdentity(b) {
    var kind = level.floor, i, x, y, cx = W / 2, cy = H / 2;
    if (kind === 'heliport') {
      // snow dust — ~140 pale specks + a few shallow drift streaks
      for (i = 0; i < 140; i++) {
        x = hash01(i * 3) * W; y = hash01(i * 3 + 1) * H;
        b.fillStyle = 'rgba(228,246,240,' + (0.10 + hash01(i * 3 + 2) * 0.18).toFixed(2) + ')';
        b.fillRect(x | 0, y | 0, (i % 5) ? 1 : 2, (i % 7) ? 1 : 2);
      }
      b.strokeStyle = 'rgba(228,246,240,0.05)'; b.lineWidth = 2; b.beginPath();
      for (i = 0; i < 12; i++) {
        x = hash01(500 + i * 2) * W; y = hash01(501 + i * 2) * H; var len = 60 + hash01(700 + i) * 90;
        b.moveTo(x, y); b.lineTo(x + len, y + len * 0.18);
      }
      b.stroke();
      // helipad marking: circled H on the open 4x4 pad (cols 7-10, rows 1-4) —
      // the map centre is a wall block, which would hide the letter
      var hx = px(8) + TILE / 2, hy = px(2) + TILE / 2;
      b.strokeStyle = 'rgba(200,236,224,0.16)'; b.lineWidth = 4;
      b.beginPath(); b.arc(hx, hy, 56, 0, Math.PI * 2); b.stroke();
      b.strokeStyle = 'rgba(200,236,224,0.10)'; b.lineWidth = 1.5;
      b.beginPath(); b.arc(hx, hy, 47, 0, Math.PI * 2); b.stroke();
      b.fillStyle = 'rgba(200,236,224,0.13)';
      b.fillRect(hx - 24, hy - 23, 8, 46); b.fillRect(hx + 16, hy - 23, 8, 46); b.fillRect(hx - 16, hy - 4, 32, 8);
      // static floodlight pools (baked radial gradients — never per-frame)
      var pools = [[px(4), TILE, 100], [px(15), H - TILE, 100], [W - TILE, px(6), 80]];
      for (i = 0; i < pools.length; i++) {
        var fl = b.createRadialGradient(pools[i][0], pools[i][1], 4, pools[i][0], pools[i][1], pools[i][2]);
        fl.addColorStop(0, 'rgba(210,244,230,0.11)'); fl.addColorStop(1, 'rgba(210,244,230,0)');
        b.fillStyle = fl; b.fillRect(pools[i][0] - pools[i][2], pools[i][1] - pools[i][2], pools[i][2] * 2, pools[i][2] * 2);
      }
    } else if (kind === 'hangar') {
      // concrete slab seams every 2 tiles
      b.lineWidth = 1; b.beginPath();
      for (x = TILE * 2; x < W; x += TILE * 2) { b.moveTo(x + .5, 0); b.lineTo(x + .5, H); }
      for (y = TILE * 2; y < H; y += TILE * 2) { b.moveTo(0, y + .5); b.lineTo(W, y + .5); }
      b.strokeStyle = 'rgba(0,0,0,0.32)'; b.stroke();
      b.beginPath();
      for (x = TILE * 2; x < W; x += TILE * 2) { b.moveTo(x + 1.5, 0); b.lineTo(x + 1.5, H); }
      for (y = TILE * 2; y < H; y += TILE * 2) { b.moveTo(0, y + 1.5); b.lineTo(W, y + 1.5); }
      b.strokeStyle = 'rgba(119,210,166,0.05)'; b.stroke();
      // oil stains
      for (i = 0; i < 7; i++) {
        x = TILE + hash01(900 + i * 3) * (W - TILE * 2); y = TILE + hash01(901 + i * 3) * (H - TILE * 2);
        var rot = hash01(902 + i * 3) * Math.PI, rx = 14 + hash01(950 + i) * 18, ry = 7 + hash01(960 + i) * 8;
        b.fillStyle = 'rgba(2,8,6,0.34)'; b.beginPath(); b.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); b.fill();
        b.fillStyle = 'rgba(2,8,6,0.30)'; b.beginPath(); b.ellipse(x + rx * 0.5, y + ry * 0.4, rx * 0.5, ry * 0.55, rot, 0, Math.PI * 2); b.fill();
      }
      // hazard-stripe band along the bottom wall row (floor strip just above it)
      var hy = (ROWS - 1) * TILE - 5;
      b.save(); b.beginPath(); b.rect(TILE, hy, W - TILE * 2, 5); b.clip();
      b.fillStyle = 'rgba(0,0,0,0.35)'; b.fillRect(TILE, hy, W - TILE * 2, 5);
      b.strokeStyle = 'rgba(224,194,90,0.42)'; b.lineWidth = 4; b.beginPath();
      for (x = TILE - 8; x < W; x += 12) { b.moveTo(x, hy + 6); b.lineTo(x + 6, hy - 1); }
      b.stroke(); b.restore();
    } else if (kind === 'nuke') {
      // catwalk grating: fine cross-hatch
      b.strokeStyle = 'rgba(119,210,166,0.035)'; b.lineWidth = 1; b.beginPath();
      for (x = -H; x < W; x += 8) { b.moveTo(x, 0); b.lineTo(x + H, H); b.moveTo(x + H, 0); b.lineTo(x, H); }
      b.stroke();
      // composite panel seams every 2 tiles + rivets at the joints
      b.strokeStyle = 'rgba(0,0,0,0.28)'; b.beginPath();
      for (x = TILE * 2; x < W; x += TILE * 2) { b.moveTo(x + .5, 0); b.lineTo(x + .5, H); }
      for (y = TILE * 2; y < H; y += TILE * 2) { b.moveTo(0, y + .5); b.lineTo(W, y + .5); }
      b.stroke();
      b.fillStyle = 'rgba(180,236,208,0.12)';
      for (x = TILE * 2; x < W; x += TILE * 2) for (y = TILE * 2; y < H; y += TILE * 2) b.fillRect(x - 1, y - 1, 3, 3);
      // amber hazard chevrons on the floor cells of the row in front of the
      // camera (its own row is wall/corridor) — clipped to floor tiles only
      var cam = (level.cameras || [])[0];
      if (cam && cam.t[1] + 1 < ROWS - 1) {
        var cr = cam.t[1] + 1, c0 = Math.max(1, cam.t[0] - 3), c1 = Math.min(COLS - 2, cam.t[0] + 3), yb = cr * TILE, cc, any = false;
        b.save(); b.beginPath();
        for (cc = c0; cc <= c1; cc++) if (!walls[cr][cc]) { b.rect(cc * TILE, yb + 4, TILE, TILE - 8); any = true; }
        if (any) {
          b.clip();
          b.strokeStyle = 'rgba(224,194,90,0.26)'; b.lineWidth = 3; b.beginPath();
          for (x = c0 * TILE - 6; x < (c1 + 1) * TILE + 6; x += 12) { b.moveTo(x, yb + 4); b.lineTo(x + 7, yb + TILE / 2); b.lineTo(x, yb + TILE - 4); }
          b.stroke();
        }
        b.restore();
      }
    }
  }
  // lit doorway: cut into the wall tile adjoining the exit (above first, then
  // below / left / right — whichever side is wall). A recessed dark opening
  // with a 1px bright jamb on its three closed sides, a lit strip at the far
  // end, two dim treads, and ONE baked radial light spill onto the exit tile —
  // the doorway reads as where the op leads. Bakes once per level (zero per-frame cost).
  function bakeDoorway(b, ec, er) {
    var dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]], d = null, i;
    for (i = 0; i < dirs.length; i++) {
      var nc = ec + dirs[i][0], nr = er + dirs[i][1];
      if (nc >= 0 && nr >= 0 && nc < COLS && nr < ROWS && walls[nr][nc]) { d = dirs[i]; break; }
    }
    if (!d) return;
    var wx = (ec + d[0]) * TILE, wy = (er + d[1]) * TILE, vert = d[1] !== 0, ox, oy, ow, oh;
    if (vert) { ox = wx + 8; ow = TILE - 16; oh = TILE - 4; oy = d[1] < 0 ? wy + 4 : wy; }
    else { oy = wy + 8; oh = TILE - 16; ow = TILE - 4; ox = d[0] < 0 ? wx + 4 : wx; }
    b.fillStyle = '#03100b'; b.fillRect(ox, oy, ow, oh);   // recessed opening
    // far-end light strip + two dim treads stepping toward the threshold
    b.fillStyle = 'rgba(180,236,208,0.55)';
    if (vert) b.fillRect(ox + 2, d[1] < 0 ? oy : oy + oh - 3, ow - 4, 3);
    else b.fillRect(d[0] < 0 ? ox : ox + ow - 3, oy + 2, 3, oh - 4);
    b.fillStyle = 'rgba(180,236,208,0.10)';
    for (i = 1; i <= 2; i++) {
      if (vert) b.fillRect(ox + 3, d[1] < 0 ? oy + 3 + i * 8 : oy + oh - 4 - i * 8, ow - 6, 1);
      else b.fillRect(d[0] < 0 ? ox + 3 + i * 8 : ox + ow - 4 - i * 8, oy + 3, 1, oh - 6);
    }
    var x0 = ox + .5, y0 = oy + .5, x1 = ox + ow - .5, y1 = oy + oh - .5;
    b.strokeStyle = 'rgba(180,236,208,0.7)'; b.lineWidth = 1; b.beginPath();
    if (vert && d[1] < 0) { b.moveTo(x0, y1 + 1); b.lineTo(x0, y0); b.lineTo(x1, y0); b.lineTo(x1, y1 + 1); }
    else if (vert) { b.moveTo(x0, y0 - 1); b.lineTo(x0, y1); b.lineTo(x1, y1); b.lineTo(x1, y0 - 1); }
    else if (d[0] < 0) { b.moveTo(x1 + 1, y0); b.lineTo(x0, y0); b.lineTo(x0, y1); b.lineTo(x1 + 1, y1); }
    else { b.moveTo(x0 - 1, y0); b.lineTo(x1, y0); b.lineTo(x1, y1); b.lineTo(x0 - 1, y1); }
    b.stroke();
    // light spill onto the exit tile from the threshold (the shared edge), clipped to the tile
    var tx = px(ec) + d[0] * TILE / 2, ty = px(er) + d[1] * TILE / 2, sr = TILE * 1.1;
    var sp = b.createRadialGradient(tx, ty, 2, tx, ty, sr);
    sp.addColorStop(0, 'rgba(180,236,208,0.42)'); sp.addColorStop(0.55, 'rgba(180,236,208,0.13)'); sp.addColorStop(1, 'rgba(180,236,208,0)');
    b.save(); b.beginPath(); b.rect(ec * TILE, er * TILE, TILE, TILE); b.clip();
    b.fillStyle = sp; b.fillRect(tx - sr, ty - sr, sr * 2, sr * 2);
    b.restore();
  }
  function buildBg() {
    bgLayer = document.createElement('canvas');
    bgLayer.width = W * dpr; bgLayer.height = H * dpr;
    var b = bgLayer.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    var r, c, x0, y0, fl = FLOORS[level.floor] || { a: C.floorA, b: C.floorB };
    // floor: checker + 2px dither dots
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      x0 = c * TILE; y0 = r * TILE;
      b.fillStyle = ((r + c) & 1) ? fl.b : fl.a;
      b.fillRect(x0, y0, TILE, TILE);
      if (!walls[r][c]) {
        b.fillStyle = C.floorDot;
        for (var dy = ((c & 1) ? 5 : 13); dy < TILE; dy += 16)
          for (var dx = ((r & 1) ? 5 : 13); dx < TILE; dx += 16)
            b.fillRect(x0 + dx, y0 + dy, 2, 2);
      }
    }
    bakeFloorIdentity(b);
    // exit pad, baked (visible from spawn — chevron hatch + frame)
    var ec = level.exit[0], er = level.exit[1], ex0 = ec * TILE, ey0 = er * TILE;
    b.save(); b.beginPath(); b.rect(ex0 + 2, ey0 + 2, TILE - 4, TILE - 4); b.clip();
    b.strokeStyle = 'rgba(180,236,208,0.14)'; b.lineWidth = 3; b.beginPath();
    for (var sD = -TILE; sD < TILE; sD += 8) { b.moveTo(ex0 + sD, ey0 + TILE); b.lineTo(ex0 + sD + TILE, ey0); }
    b.stroke(); b.restore();
    b.strokeStyle = 'rgba(180,236,208,0.25)'; b.lineWidth = 1;
    b.strokeRect(ex0 + 2.5, ey0 + 2.5, TILE - 5, TILE - 5);
    // faint tile grid
    b.strokeStyle = C.grid; b.lineWidth = 1; b.beginPath();
    for (var x = TILE; x < W; x += TILE) { b.moveTo(x + .5, 0); b.lineTo(x + .5, H); }
    for (var y = TILE; y < H; y += TILE) { b.moveTo(0, y + .5); b.lineTo(W, y + .5); }
    b.stroke();
    // walls: neighbor-aware bevel + hatching + drop shadow
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      if (!walls[r][c]) continue;
      x0 = c * TILE; y0 = r * TILE;
      var oN = r > 0 && !walls[r - 1][c], oS = r < ROWS - 1 && !walls[r + 1][c];
      var oW = c > 0 && !walls[r][c - 1], oE = c < COLS - 1 && !walls[r][c + 1];
      b.fillStyle = C.wallFace; b.fillRect(x0, y0, TILE, TILE);
      // diagonal hatch texture, clipped to tile
      b.save(); b.beginPath(); b.rect(x0, y0, TILE, TILE); b.clip();
      b.strokeStyle = 'rgba(0,0,0,0.16)'; b.lineWidth = 1; b.beginPath();
      for (var h = -TILE; h < TILE; h += 6) { b.moveTo(x0 + h, y0 + TILE); b.lineTo(x0 + h + TILE, y0); }
      b.stroke(); b.restore();
      // bevel: lit top face + 1px rim highlight, raised-block south front face,
      // shaded east side — walls read as extruded blocks, not flat tiles
      if (oN) { b.fillStyle = C.wallTop; b.fillRect(x0, y0, TILE, 3); b.fillStyle = C.wallRim; b.fillRect(x0, y0, TILE, 1); }
      if (oW) { b.fillStyle = C.wallTop; b.fillRect(x0, y0, 3, TILE); }
      if (oS) {
        b.fillStyle = C.wallFront; b.fillRect(x0, y0 + TILE - 7, TILE, 7);         // front face (2.5D height)
        b.fillStyle = 'rgba(0,0,0,0.28)'; b.fillRect(x0, y0 + TILE - 7, TILE, 1);  // seam line
        b.fillStyle = 'rgba(0,0,0,0.25)';
        for (var vx = 6; vx < TILE; vx += 10) b.fillRect(x0 + vx, y0 + TILE - 7, 1, 7); // mortar joints
      }
      if (oE) { b.fillStyle = C.wallSide; b.fillRect(x0 + TILE - 3, y0, 3, TILE); }
      // 1px outline only on open sides (avoids a grid-of-boxes look)
      b.strokeStyle = C.wallEdge; b.lineWidth = 1; b.beginPath();
      if (oN) { b.moveTo(x0, y0 + .5); b.lineTo(x0 + TILE, y0 + .5); }
      if (oS) { b.moveTo(x0, y0 + TILE - .5); b.lineTo(x0 + TILE, y0 + TILE - .5); }
      if (oW) { b.moveTo(x0 + .5, y0); b.lineTo(x0 + .5, y0 + TILE); }
      if (oE) { b.moveTo(x0 + TILE - .5, y0); b.lineTo(x0 + TILE - .5, y0 + TILE); }
      b.stroke();
      // drop shadow cast onto the floor below (depth cue)
      if (oS) { b.fillStyle = C.wallShadow; b.fillRect(x0, y0 + TILE, TILE, 5); }
    }
    bakeDoorway(b, ec, er);
    // baked ambient light: phosphor bloom at center, dark corners (one-time cost)
    var lg = b.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.62);
    lg.addColorStop(0, 'rgba(159,227,196,0.05)');
    lg.addColorStop(0.6, 'rgba(0,0,0,0)');
    lg.addColorStop(1, 'rgba(0,0,0,0.32)');
    b.fillStyle = lg; b.fillRect(0, 0, W, H);
    // Soliton minimap: the wall layout at radar scale, baked once — drawRadar()
    // blits it player-centred (one drawImage, no per-frame tile loop)
    var mw = Math.ceil(W * RADAR_SC), mh = Math.ceil(H * RADAR_SC), ts = TILE * RADAR_SC;
    radarMap = document.createElement('canvas');
    radarMap.width = Math.ceil(mw * dpr); radarMap.height = Math.ceil(mh * dpr);
    var m = radarMap.getContext('2d'); m.setTransform(dpr, 0, 0, dpr, 0, 0);
    m.fillStyle = 'rgba(8,26,20,0.72)'; m.fillRect(0, 0, mw, mh);
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      if (!walls[r][c]) continue;
      m.fillStyle = 'rgba(119,210,166,0.42)'; m.fillRect(c * ts, r * ts, ts + 0.5, ts + 0.5);
      if (r > 0 && !walls[r - 1][c]) { m.fillStyle = 'rgba(180,236,208,0.7)'; m.fillRect(c * ts, r * ts, ts + 0.5, 1); }
    }
  }
  function playerTile() { return { c: tcol(player.x), r: trow(player.y) }; }

  /* ===================== per-frame update ===================== */
  function update(dt) {
    knockCD = Math.max(0, knockCD - dt); cqcCD = Math.max(0, cqcCD - dt);
    shakeT = Math.max(0, shakeT - dt);
    hitFlashT = Math.max(0, hitFlashT - dt); hitBeepCD = Math.max(0, hitBeepCD - dt);
    updatePlayer(dt);

    if (intel && !intelGot && Math.hypot(player.x - intel.x, player.y - intel.y) < PICKUP_R) {
      if (boxed) { if (!boxHinted) { boxHinted = true; announce('Get out of the box to grab the intel.'); } }
      else { intelGot = true; sfxPickup(); addPulse(intel.x, intel.y, '224,194,90'); announce('Intel acquired. Reach the exit.'); updateHud(); }
    }
    // reaching the exit wins the frame outright — even if a guard would grab you on the same tick
    if (intelGot && Math.hypot(player.x - exitPt.x, player.y - exitPt.y) < EXIT_R) { levelClear(); return; }

    for (var n = noisePings.length - 1; n >= 0; n--) { noisePings[n].t += dt; if (noisePings[n].t > 0.6) noisePings.splice(n, 1); }
    for (n = fxPulses.length - 1; n >= 0; n--) { fxPulses[n].t += dt; if (fxPulses[n].t > 0.45) fxPulses.splice(n, 1); }

    var roomAlert = alertPhase === 'alert' || alertPhase === 'evasion';
    for (var gi = 0; gi < guards.length; gi++) updateGuard(guards[gi], dt, roomAlert);
    for (var ci = 0; ci < cameras.length; ci++) updateCamera(cameras[ci], dt);

    // ---- detection ----
    var losNow = false, fullSpot = false, k;
    for (k = 0; k < guards.length; k++) {
      var g = guards[k]; if (g.down) { g.seeing = false; continue; }
      var see = detect(g);
      if (see) {
        losNow = true; g.spotTimer = Math.min(SPOT_FULL, g.spotTimer + spotSpeed(g) * dt);
        g.glimpseC = tcol(player.x); g.glimpseR = trow(player.y);
        if (g.spotTimer >= SPOT_FULL) fullSpot = true;
      } else {
        g.spotTimer = Math.max(0, g.spotTimer - dt * 1.4);
        if (g._was && !roomAlert && g.behavior !== 'investigate') { g.behavior = 'investigate'; g.invC = g.glimpseC; g.invR = g.glimpseR; g.invTimer = SEARCH_TIME; g.scanning = false; }
      }
      g.seeing = see; g._was = see;
    }
    for (k = 0; k < cameras.length; k++) {
      var cam = cameras[k], cs = detect(cam);
      if (cs) { losNow = true; cam.spotTimer = Math.min(SPOT_FULL, cam.spotTimer + spotSpeed(cam) * dt); if (cam.spotTimer >= SPOT_FULL) fullSpot = true; }
      else cam.spotTimer = Math.max(0, cam.spotTimer - dt * 1.4);
      cam.seeing = cs;
    }

    phaseMachine(dt, losNow, fullSpot);

    // ---- damage ----
    if (roomAlert) {
      var shot = false, grabbed = false;
      for (k = 0; k < guards.length; k++) {
        var gg = guards[k]; if (gg.down) continue;
        if (gg.seeing) shot = true;
        if (!boxed && Math.hypot(gg.x - player.x, gg.y - player.y) < GRAB_DIST) grabbed = true;
      }
      if (grabbed) life = 0;
      else if (shot) {
        // taking-fire feedback: render() draws tracers + a red vignette while
        // hitFlashT > 0, and a low hit beep fires a few times per second
        life = Math.max(0, life - SHOOT_RATE * dt);
        hitFlashT = 0.18;
        if (!reduceMotion) shakeT = Math.max(shakeT, 0.12);  // low rumble while under fire
        if (hitBeepCD <= 0) { hitBeepCD = 0.3; beep(196, 0.06, 'sawtooth', 0.05); }
      }
    } else if (alertPhase === 'normal') { life = Math.min(1, life + REGEN * dt); }
    if (life <= 0) { gameOver(); return; }

    elapsed += dt; updateHud();
  }

  function spotSpeed(d) {
    var dist = Math.hypot(player.x - d.x, player.y - d.y), range = d.range * (d.rangeMul || 1);
    return 1.4 + (1 - Math.min(1, dist / range)) * 2.6;
  }
  function detect(d) {
    if (boxed && !player.moving) return false;  // a still box hides you; moving in it does not
    var dx = player.x - d.x, dy = player.y - d.y, dist = Math.hypot(dx, dy), range = d.range * (d.rangeMul || 1);
    if (dist > range || dist < 0.001) return false;
    if (Math.abs(angDiff(Math.atan2(dy, dx), d.facing)) > d.fov * (d.fovMul || 1) / 2) return false;
    return losClear(d.x, d.y, player.x, player.y);
  }

  function phaseMachine(dt, losNow, fullSpot) {
    if (alertPhase === 'normal' || alertPhase === 'caution') {
      if (alertPhase === 'caution') { cautionTimer -= dt; if (cautionTimer <= 0) alertPhase = 'normal'; }
      if (fullSpot) enterAlert();
    } else if (alertPhase === 'alert') {
      if (losNow) { lastKnown = playerTile(); alertGrace = ALERT_GRACE; }
      else { alertGrace -= dt; if (alertGrace <= 0) { alertPhase = 'evasion'; evasionTimer = EVASION_TIME; } }
    } else if (alertPhase === 'evasion') {
      if (losNow) { alertPhase = 'alert'; alertGrace = ALERT_GRACE; lastKnown = playerTile(); }
      else { evasionTimer -= dt; if (evasionTimer <= 0) { alertPhase = 'caution'; cautionTimer = CAUTION_TIME; stopAlertMusic(); } }
    }
  }
  function enterAlert() {
    if (alertPhase !== 'alert' && alertPhase !== 'evasion') alertsThisLevel++;
    alertPhase = 'alert'; alertGrace = ALERT_GRACE; lastKnown = playerTile();
    if (!reduceMotion) {
      shakeT = 0.35;
      // red screen sting on the spot — the classic "!" alert moment
      flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on');
    }
    sfxSpot(); startAlertMusic();
    for (var i = 0; i < guards.length; i++) { guards[i].behavior = 'patrol'; guards[i].scanning = false; }
  }

  /* ===================== player + guards ===================== */
  function blocked(nx, ny) {
    if (circleHitsWall(nx, ny, PLAYER_R)) return true;
    for (var i = 0; i < guards.length; i++) {
      var g = guards[i]; if (g.down) continue;
      var nd = Math.hypot(nx - g.x, ny - g.y);
      if (nd >= GUARD_R + PLAYER_R) continue;
      // ignore a guard when the move INCREASES distance from him — a player a guard
      // has walked onto can always back out (prevents the boxed-pin softlock)
      if (nd >= Math.hypot(player.x - g.x, player.y - g.y)) continue;
      return true;
    }
    return false;
  }
  function updatePlayer(dt) {
    var ix = ((keys['arrowright'] || keys['d'] || touchDir.right) ? 1 : 0) - ((keys['arrowleft'] || keys['a'] || touchDir.left) ? 1 : 0);
    var iy = ((keys['arrowdown'] || keys['s'] || touchDir.down) ? 1 : 0) - ((keys['arrowup'] || keys['w'] || touchDir.up) ? 1 : 0);
    var ox = player.x, oy = player.y;
    if (ix || iy) {
      var len = Math.hypot(ix, iy), spd = boxed ? BOX_SPEED : (running ? RUN_SPEED : WALK_SPEED);
      var nx = player.x + ix / len * spd * dt; if (!blocked(nx, player.y)) player.x = nx;
      var ny = player.y + iy / len * spd * dt; if (!blocked(player.x, ny)) player.y = ny;
      player.fx = ix / len; player.fy = iy / len;
      // 'moving' = actual displacement, not raw input — a boxed player wedged
      // against a wall looks motionless and must stay hidden
      player.moving = (player.x !== ox || player.y !== oy);
      if (player.moving) walkPhase += spd * dt * 0.06;
      if (running && !boxed) { noiseAccum += dt; if (noiseAccum >= NOISE_INT) { noiseAccum = 0; emitNoise(player.x, player.y, RUN_NOISE_R); } }
      else noiseAccum = 0;
    } else { player.moving = false; noiseAccum = 0; }
  }
  function doBox() { boxed = !boxed; beep(boxed ? 150 : 210, 0.05, 'square', 0.05); announce(boxed ? 'In the box.' : 'Out of the box.'); }
  function doKnock() {
    if (knockCD > 0) return;
    if (alertPhase === 'alert' || alertPhase === 'evasion') { announce('No use — they are already alerted.'); return; }
    knockCD = KNOCK_CD; emitNoise(player.x, player.y, KNOCK_R); sfxKnock(); announce('Knock — luring a guard.');
  }
  function doCQC() {
    // CQC works in every alert phase — the only skill check is the rear-arc
    // approach (a guard you're behind can't be seeing you, so no seeing check).
    if (cqcCD > 0) return;
    var best = null, bestd = CQC_R;
    for (var i = 0; i < guards.length; i++) {
      var g = guards[i]; if (g.down) continue;
      var d = Math.hypot(g.x - player.x, g.y - player.y); if (d > CQC_R) continue;
      var ang = Math.atan2(player.y - g.y, player.x - g.x);
      if (Math.abs(angDiff(ang, g.facing)) >= CQC_REAR && d < bestd) { bestd = d; best = g; }
    }
    if (best) { cqcCD = CQC_CD; best.down = true; best.seeing = false; best.spotTimer = 0; addPulse(best.x, best.y, '180,236,208'); sfxCQC(); announce('Guard subdued.'); }
    else announce('No guard to subdue.');
  }

  function updateGuard(g, dt, roomAlert) {
    if (g.down) return;
    var ox = g.x, oy = g.y;  // for the walk-cycle flag below (visual only)
    var fovMul = 1, rangeMul = 1;
    if (alertPhase === 'caution') { fovMul = 1.25; rangeMul = 1.12; }
    if (roomAlert) { fovMul = 1.3; rangeMul = 1.2; }
    g.fovMul = fovMul; g.rangeMul = rangeMul;
    if (roomAlert) {
      var tc = lastKnown ? lastKnown.c : tcol(g.x), tr = lastKnown ? lastKnown.r : trow(g.y);
      if (huntToward(g, tc, tr, dt, 1.35, true)) doSearch(g, dt); else g.scanning = false;
    } else if (g.behavior === 'investigate' && g.invTimer > 0) {
      g.invTimer -= dt;
      if (huntToward(g, g.invC, g.invR, dt, 1.1, true)) doSearch(g, dt); else g.scanning = false;
      if (g.invTimer <= 0) { g.behavior = 'patrol'; g.scanning = false; g.mode = 'move'; }
    } else { g.behavior = 'patrol'; patrolMove(g, dt); }
    // walk animation state — pure presentation, no behavior change
    g.moving = (g.x !== ox || g.y !== oy);
    if (g.moving) g.walk = (g.walk || 0) + dt * 9;
  }
  // stopNearBox: while hunting, stop short of a hiding (boxed) player instead of
  // parking on top of him — he can't be grabbed while boxed, and a guard standing
  // on the box used to pin the player in place for the whole alert window.
  function guardMoveOK(nx, ny, stopNearBox) {
    return !(stopNearBox && boxed && Math.hypot(nx - player.x, ny - player.y) < GUARD_R + PLAYER_R + 2);
  }
  function huntToward(g, tc, tr, dt, mul, stopNearBox) {
    var gc = tcol(g.x), gr = trow(g.y);
    if (gc === tc && gr === tr) {
      var cx = px(tc), cy = px(tr), d = Math.hypot(cx - g.x, cy - g.y); if (d < 2) return true;
      var s = g.speed * mul * dt; g.facing = Math.atan2(cy - g.y, cx - g.x);
      var ax = d <= s ? cx : g.x + (cx - g.x) / d * s, ay = d <= s ? cy : g.y + (cy - g.y) / d * s;
      if (!guardMoveOK(ax, ay, stopNearBox)) return true;  // close enough — search here
      g.x = ax; g.y = ay; return d <= s;
    }
    var step = bfsStep(gc, gr, tc, tr); if (!step) return true;
    var nx = px(gc + step.dc), ny = px(gr + step.dr), d2 = Math.hypot(nx - g.x, ny - g.y), s2 = g.speed * mul * dt;
    g.facing = Math.atan2(ny - g.y, nx - g.x);
    var bx = d2 <= s2 ? nx : g.x + (nx - g.x) / d2 * s2, by = d2 <= s2 ? ny : g.y + (ny - g.y) / d2 * s2;
    if (!guardMoveOK(bx, by, stopNearBox)) return true;
    g.x = bx; g.y = by;
    return false;
  }
  function doSearch(g, dt) {
    if (!g.scanning) { g.scanning = true; g.scanBase = g.facing; g.scanT = 0; }
    g.scanT += dt; g.facing = g.scanBase + Math.sin(g.scanT * 2.4) * 1.1;
  }
  function patrolMove(g, dt) {
    if (g.mode === 'scan') {
      g.pscanT -= dt; g.facing = g.pscanBase + Math.sin((SCAN_TIME - g.pscanT) * 4.2) * SCAN_ARC;
      if (g.pscanT <= 0) { g.i = (g.i + 1) % g.path.length; g.mode = 'move'; } return;
    }
    // path to the waypoint tile (wall-aware) so a guard returning from a hunt never straight-lines through walls
    var tgt = g.path[g.i];
    if (huntToward(g, tcol(tgt.x), trow(tgt.y), dt, 1)) { g.x = tgt.x; g.y = tgt.y; g.mode = 'scan'; g.pscanT = SCAN_TIME; g.pscanBase = g.facing; }
  }
  function updateCamera(c, dt) { c.facing = c.base + Math.sin(elapsed * c.speed) * c.arc; }

  function updateHud() {
    var ph = alertPhase;
    stateBadge.className = 'mgsg-stbadge' + (ph !== 'normal' ? ' ' + ph : '');
    stateBadge.textContent = ph === 'alert' ? '! ALERT' : ph === 'evasion' ? 'EVASION ' + Math.ceil(Math.max(0, evasionTimer))
      : ph === 'caution' ? 'CAUTION ' + Math.ceil(Math.max(0, cautionTimer)) : 'NORMAL';
    // write the bar width only when the rounded value changes — render() reads
    // canvas.clientWidth each frame, and a dirty style every frame would force a layout
    var lwid = (life * 100).toFixed(0) + '%';
    if (lwid !== lastLifeW) { lastLifeW = lwid; lifeFill.style.width = lwid; }
    // healthy = theme chrome color; warning/critical stay amber/red in every theme
    var lcol = life > 0.5 ? 'var(--mg-text)' : life > 0.25 ? C.amber : C.red;
    if (lcol !== lastLifeC) { lastLifeC = lcol; lifeFill.style.background = lcol; }
    lifeFill.parentNode.classList.toggle('low', life < 0.25);
    hudIntel.textContent = intel ? (intelGot ? '[OK]' : '[ ]') : '[--]';
    var s = Math.floor(elapsed); hudTime.textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    if (stage) { stage.classList.toggle('alarm', ph === 'alert' || ph === 'evasion'); stage.classList.toggle('caution', ph === 'caution'); }
    if (frame) { frame.classList.toggle('alarm', ph === 'alert' || ph === 'evasion'); frame.classList.toggle('caution', ph === 'caution'); }
  }

  /* ===================== rendering =====================
     Perf guardrails: never ctx.shadowBlur / ctx.filter — glow is radial-gradient
     fills only; shake is one ctx.translate with sin(); sprites are pre-rendered
     canvases (1 drawImage each); per-frame gradient budget ≤9. ===================== */
  function drawShadow(x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 10, 9, 3.5, 0, 0, Math.PI * 2); ctx.fill();   // sized to the one-tile sprites
  }
  // 8-way facing snap keeps rotated pixel art crisp; vision cones keep the
  // smooth unsnapped facing — classic 2D-stealth look, identical gameplay
  var STEP8 = Math.PI / 4;
  // Soliton minimap geometry: 96x48 bezelled rectangle in the top-left corner —
  // bezel + label end inside row 1 so it occludes as little corridor as
  // possible (the screen is translucent for the rest); RADAR_SC keeps a 250px
  // world span at 34px
  var RADAR_X = 6, RADAR_Y = 6, RADAR_W = 96, RADAR_H = 48, RADAR_SC = 34 / 250;
  var DASH_CALM = [4, 3], DASH_NONE = [];  // hoisted — no per-frame arrays
  function drawSpriteImg(img, x, y, angle, bobPhase) {
    ctx.save(); ctx.translate(x, y);
    if (angle !== null) ctx.rotate(Math.round(angle / STEP8) * STEP8);
    if (bobPhase !== null && !reduceMotion) ctx.translate(0, Math.sin(bobPhase) * 1.2);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
  function drawCone(d, roomAlert) {
    var rgb, edgeA, calm = false;
    if (roomAlert || d.seeing) {
      rgb = '224,96,109';
      // edge strobes while this watcher has live eyes on the player
      edgeA = d.seeing && !reduceMotion ? 0.45 + 0.25 * Math.abs(Math.sin(elapsed * 9)) : 0.55;
    }
    else if ((d.spotTimer || 0) > 0 || alertPhase === 'caution') { rgb = '224,194,90'; edgeA = 0.45; }
    else { rgb = '119,210,166'; edgeA = 0.30; calm = true; }
    var half = d.fov * (d.fovMul || 1) / 2, range = d.range * (d.rangeMul || 1), STEPS = 20;
    // hostile cones fill brighter — the additive red otherwise sinks into the
    // alarm wash; calm/caution keep the softer stops so the pale heliport floor
    // never blows out
    var hot = roomAlert || d.seeing;
    var grad = ctx.createRadialGradient(d.x, d.y, 4, d.x, d.y, range);
    grad.addColorStop(0, 'rgba(' + rgb + (hot ? ',0.48)' : ',0.32)'));
    grad.addColorStop(0.5, 'rgba(' + rgb + (hot ? ',0.16)' : ',0.10)'));
    grad.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.beginPath(); ctx.moveTo(d.x, d.y);
    for (var s = 0; s <= STEPS; s++) { var a = d.facing - half + (half * 2) * (s / STEPS); var h = rayHit(d.x, d.y, a, range); ctx.lineTo(h.x, h.y); }
    ctx.closePath();
    // the cone is LIGHT: additive fill brightens whatever floor it falls on;
    // two faint range arcs (50% / 100%) are clipped to the cone. State restored after.
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grad; ctx.fill();
    ctx.restore();
    // edge: dashed while the watcher is calm, solid once he is suspicious or hostile
    ctx.setLineDash(calm ? DASH_CALM : DASH_NONE);
    ctx.strokeStyle = 'rgba(' + rgb + ',' + edgeA + ')'; ctx.lineWidth = 1; ctx.stroke();
    ctx.setLineDash(DASH_NONE);
    // range arcs, clipped to the (still current) cone path
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(' + rgb + ',0.14)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(d.x, d.y, range * 0.5, d.facing - half, d.facing + half); ctx.stroke();
    ctx.beginPath(); ctx.arc(d.x, d.y, range - 1.5, d.facing - half, d.facing + half); ctx.stroke();
    ctx.restore();
    // hot center ray — the look direction reads instantly
    var hFar = rayHit(d.x, d.y, d.facing, range);
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (d.seeing ? 0.5 : 0.15) + ')'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(hFar.x, hFar.y); ctx.stroke();
  }
  // last-known-position marker — pure visualization of the existing lastKnown
  // tile the guard AI already converges on during ALERT/EVASION
  function drawLastKnown() {
    if (!lastKnown) return;
    var x = px(lastKnown.c), y = px(lastKnown.r);
    var p = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(elapsed * 5);
    var s = reduceMotion ? 9 : 9 + (1 - p) * 3, a = 4;
    ctx.strokeStyle = 'rgba(224,96,109,' + (0.30 + 0.35 * p).toFixed(3) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s + a); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s + a, y - s);
    ctx.moveTo(x + s - a, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y - s + a);
    ctx.moveTo(x + s, y + s - a); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - a, y + s);
    ctx.moveTo(x - s + a, y + s); ctx.lineTo(x - s, y + s); ctx.lineTo(x - s, y + s - a);
    ctx.stroke();
    ctx.fillStyle = 'rgba(224,96,109,' + (0.45 + 0.35 * p).toFixed(3) + ')';
    ctx.font = 'bold 9px "Share Tech Mono",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!?', x, y);
  }
  function drawExit() {
    var on = intelGot, p = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(elapsed * 4);
    if (on) {
      ctx.globalAlpha = 0.18 + 0.18 * p;  // cached gradient, alpha does the breathing
      ctx.fillStyle = exitGlowGrad; ctx.fillRect(exitPt.x - 20, exitPt.y - 20, 40, 40);
      ctx.globalAlpha = 1;
    }
    var col = on ? C.bright : C.dim, x = exitPt.x, y = exitPt.y, h = 13 + (on && !reduceMotion ? Math.sin(elapsed * 4) * 1.5 : 0), a = 6;
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.globalAlpha = on ? 1 : 0.7;
    ctx.beginPath();
    ctx.moveTo(x - h, y - h + a); ctx.lineTo(x - h, y - h); ctx.lineTo(x - h + a, y - h);
    ctx.moveTo(x + h - a, y - h); ctx.lineTo(x + h, y - h); ctx.lineTo(x + h, y - h + a);
    ctx.moveTo(x + h, y + h - a); ctx.lineTo(x + h, y + h); ctx.lineTo(x + h - a, y + h);
    ctx.moveTo(x - h + a, y + h); ctx.lineTo(x - h, y + h); ctx.lineTo(x - h, y + h - a);
    ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = col; ctx.font = '9px "Share Tech Mono",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('EXIT', x, y);
  }
  // intel = an amber keycard (pre-rendered SPR.key) bobbing gently over its
  // cached halo; the bright contact notch is the read, so no '!' glyph is needed
  function drawIntel() {
    if (!intel || intelGot) return;
    var p = reduceMotion ? 0.6 : 0.5 + 0.5 * Math.sin(elapsed * 3);
    ctx.globalAlpha = 0.30 + 0.25 * p;  // cached gradient, alpha does the pulsing
    ctx.fillStyle = intelHaloGrad; ctx.fillRect(intel.x - 18, intel.y - 18, 36, 36);
    ctx.globalAlpha = 1;
    var bob = reduceMotion ? 0 : Math.round(Math.sin(elapsed * 2.6) * 1.5);
    // soft contact shadow under the card sells the hover
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(intel.x - 7, intel.y + 5, 14, 3);
    ctx.drawImage(SPR.key, intel.x - SPR.key.width / 2, intel.y - SPR.key.height / 2 + bob);
  }
  function drawCamera(c) {
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.fillStyle = C.wallSide; ctx.fillRect(-2, -12, 4, 8);           // stem
    ctx.fillStyle = C.wallEdge; ctx.fillRect(-3, -13, 6, 2);           // mount plate
    ctx.rotate(c.facing);
    // hooded housing with a lens slit
    ctx.fillStyle = C.wallFront; ctx.strokeStyle = c.seeing ? C.red : C.wallEdge; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(5, -4); ctx.lineTo(8, -2);
    ctx.lineTo(8, 2); ctx.lineTo(5, 4); ctx.lineTo(-7, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c.seeing ? C.redHi : C.bright; ctx.fillRect(6, -1.5, 2, 3);  // lens slit
    ctx.restore();
    var led = c.seeing || Math.sin(elapsed * 6) > 0;
    ctx.fillStyle = led ? C.red : 'rgba(224,96,109,0.25)';
    ctx.fillRect(c.x - 1, c.y - 11, 2, 2);
  }
  function drawGuard(g, roomAlert) {
    if (g.down) {
      ctx.save(); ctx.globalAlpha = 0.32; drawSpriteImg(SPR.guard[0], g.x, g.y, g.facing + Math.PI / 2, null); ctx.restore();
      ctx.fillStyle = C.dim; ctx.font = '9px "Share Tech Mono",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      if (reduceMotion) ctx.fillText('z z', g.x, g.y - 12);
      else {
        var zt = (elapsed % 1.6) / 1.6;  // rising, fading z
        ctx.globalAlpha = 1 - zt;
        ctx.fillText('z', g.x + 5, g.y - 10 - zt * 6);
        ctx.globalAlpha = 1;
      }
      return;
    }
    drawShadow(g.x, g.y);
    drawSpriteImg(SPR[(g.seeing || roomAlert) ? 'guardRed' : 'guard'][g.moving ? (Math.floor(g.walk / Math.PI) % 2) : 0],
      g.x, g.y, g.facing + Math.PI / 2, g.moving ? g.walk : null);
    // MGS awareness gauge — arc fills amber→red with spotTimer before the alarm trips
    // (gauge + plate sit above the 36px sprite: half-height 18 + a 2–6px gap)
    if (!roomAlert && g.spotTimer > 0.05 && g.spotTimer < SPOT_FULL) {
      var t = g.spotTimer / SPOT_FULL;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4,14,11,0.65)';
      ctx.beginPath(); ctx.arc(g.x, g.y - 24, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = t < 0.7 ? C.amber : C.red;
      ctx.beginPath(); ctx.arc(g.x, g.y - 24, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t); ctx.stroke();
    }
    var mark = null, col = C.red;
    if (roomAlert) { mark = '!'; col = C.red; }
    else if (g.behavior === 'investigate' && !g.seeing) { mark = '?'; col = C.amber; }
    if (mark !== g.lastMark) { g.markSince = elapsed; g.lastMark = mark; }
    if (mark) drawAlertPlate(g.x, g.y - 20, mark, col, elapsed - (g.markSince || 0));
  }
  // MGS alert plate: filled panel + 2px stroke + bold glyph. Pops in from 2.6x
  // (ease-out over 0.14s), holds large ~0.5s, then eases down to a small
  // persistent plate. reduceMotion shows the small plate immediately.
  function drawAlertPlate(x, yBottom, mark, col, age) {
    var s, t;
    if (reduceMotion) s = 0.62;
    else if (age < 0.14) { t = 1 - age / 0.14; s = 1 + 1.6 * t * t * t; }
    else if (age < 0.64) s = 1;
    else if (age < 0.84) { t = 1 - (age - 0.64) / 0.2; s = 0.62 + 0.38 * t * t; }
    else s = 0.62;
    var w = 14 * s, h = 18 * s, x0 = x - w / 2, y0 = yBottom - h;
    ctx.fillStyle = C.bg; ctx.fillRect(x0, y0, w, h);
    ctx.lineWidth = s < 0.8 ? 1.5 : 2; ctx.strokeStyle = col; ctx.strokeRect(x0, y0, w, h);
    ctx.font = 'bold ' + Math.round(14 * s) + 'px "Share Tech Mono",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (mark === '?') { ctx.lineWidth = 1; ctx.strokeStyle = C.amberHi; ctx.strokeText(mark, x, y0 + h / 2 + 1); }
    ctx.fillStyle = col; ctx.fillText(mark, x, y0 + h / 2 + 1);
  }
  // Soliton radar — the MGS1 rectangular minimap: the level's wall layout (baked
  // radarMap, one drawImage) player-centred, guards as red squares with their
  // cone wedges, cameras amber, exit bearing once the intel is in hand.
  // JAMMED (alert/evasion, or forceJam on the game-over freeze) = deterministic
  // static stripes. No gradients here — the old sweep gradient is gone.
  function drawRadar(forceJam) {
    var x = RADAR_X, y = RADAR_Y, w = RADAR_W, h = RADAR_H, cx = x + w / 2, cy = y + h / 2, sc = RADAR_SC, i;
    var jam = forceJam || alertPhase === 'alert' || alertPhase === 'evasion';
    ctx.save();
    // bezel + screen — translucent, so a sprite walking under the corner stays visible
    ctx.fillStyle = 'rgba(4,14,11,0.6)'; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.strokeStyle = 'rgba(119,210,166,0.18)'; ctx.lineWidth = 3; ctx.strokeRect(x - 3.5, y - 3.5, w + 7, h + 7);
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (jam) {
      // static: 2px bands whose brightness hashes off (row, frame) — no allocation
      var fr = reduceMotion ? 0 : Math.floor(elapsed * 16);
      for (i = 0; i < h; i += 2) {
        var v = Math.sin((i + fr * 7) * 12.9898) * 43758.5453; v -= Math.floor(v);
        ctx.fillStyle = 'rgba(224,96,109,' + (0.05 + v * 0.22).toFixed(2) + ')';
        ctx.fillRect(x, y + i, w, 2);
      }
      ctx.fillStyle = 'rgba(4,14,11,0.7)'; ctx.fillRect(cx - 22, cy - 6, 44, 12);
      ctx.fillStyle = C.red; ctx.font = 'bold 8px "Share Tech Mono",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('JAMMED', cx, cy + 0.5);
    } else {
      if (radarMap) ctx.drawImage(radarMap, cx - player.x * sc, cy - player.y * sc, W * sc, H * sc);
      for (i = 0; i < guards.length; i++) {
        var g = guards[i]; if (g.down) continue;
        var rx = cx + (g.x - player.x) * sc, ry = cy + (g.y - player.y) * sc;
        if (rx < x - 40 || rx > x + w + 40 || ry < y - 40 || ry > y + h + 40) continue;
        var hf = g.fov * (g.fovMul || 1) / 2;
        ctx.fillStyle = g.seeing ? 'rgba(224,96,109,0.32)' : 'rgba(224,96,109,0.20)'; ctx.beginPath(); ctx.moveTo(rx, ry);
        ctx.arc(rx, ry, g.range * (g.rangeMul || 1) * sc, g.facing - hf, g.facing + hf); ctx.closePath(); ctx.fill();
        ctx.fillStyle = g.seeing ? C.redHi : C.red; ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
      }
      for (i = 0; i < cameras.length; i++) {
        var cm = cameras[i], rx2 = cx + (cm.x - player.x) * sc, ry2 = cy + (cm.y - player.y) * sc;
        var hf2 = cm.fov / 2;
        ctx.fillStyle = 'rgba(224,194,90,0.16)'; ctx.beginPath(); ctx.moveTo(rx2, ry2);
        ctx.arc(rx2, ry2, cm.range * sc, cm.facing - hf2, cm.facing + hf2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.amber; ctx.fillRect(rx2 - 1.5, ry2 - 1.5, 3, 3);
      }
      // exit waypoint once the intel is in hand — clamps to the frame as a bearing marker
      if (intelGot) {
        var dx = (exitPt.x - player.x) * sc, dy = (exitPt.y - player.y) * sc, lx = w / 2 - 6, ly = h / 2 - 6, k = 1;
        if (Math.abs(dx) > lx) k = Math.min(k, lx / Math.abs(dx));
        if (Math.abs(dy) > ly) k = Math.min(k, ly / Math.abs(dy));
        var rex = cx + dx * k, rey = cy + dy * k;
        if (reduceMotion || Math.sin(elapsed * 6) > -0.3) {
          ctx.fillStyle = C.bright; ctx.fillRect(rex - 1.5, rey - 1.5, 3, 3);
          ctx.strokeStyle = 'rgba(180,236,208,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(rex - 3.5, rey - 3.5, 7, 7);
        }
      }
      // player dot + facing tick — bearing reads off the radar at a glance
      ctx.fillStyle = C.bright; ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
      var pfa = Math.atan2(player.fy, player.fx);
      ctx.strokeStyle = C.bright; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(pfa) * 3, cy + Math.sin(pfa) * 3);
      ctx.lineTo(cx + Math.cos(pfa) * 7, cy + Math.sin(pfa) * 7); ctx.stroke();
    }
    ctx.restore();
    // frame + corner ticks
    ctx.strokeStyle = jam ? 'rgba(224,96,109,0.6)' : 'rgba(119,210,166,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    ctx.strokeStyle = 'rgba(180,236,208,0.55)'; ctx.beginPath();
    ctx.moveTo(x - 4, y + 4); ctx.lineTo(x - 4, y - 4); ctx.lineTo(x + 4, y - 4);
    ctx.moveTo(x + w - 4, y - 4); ctx.lineTo(x + w + 4, y - 4); ctx.lineTo(x + w + 4, y + 4);
    ctx.moveTo(x + w + 4, y + h - 4); ctx.lineTo(x + w + 4, y + h + 4); ctx.lineTo(x + w - 4, y + h + 4);
    ctx.moveTo(x + 4, y + h + 4); ctx.lineTo(x - 4, y + h + 4); ctx.lineTo(x - 4, y + h - 4);
    ctx.stroke();
    ctx.fillStyle = C.dim; ctx.font = '8px "Share Tech Mono",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('SOLITON', cx, y + h + 7);
  }
  /* ---- in-canvas MGS HUD windows — visual duplicates of the DOM strip (which
     stays the accessible source of truth). Drawn after the radar, only when the
     canvas is at least 520 CSS px wide (below that the DOM strip alone serves).
     Every window sits inside the outer wall ring so no floor is covered:
       LIFE gauge   top row, right of the radar   x 118–330, y 7–25
       ALERT timer  top row                        x 340–470, y 7–25 (nothing when NORMAL)
       WEAPON/ACTION window  bottom-left            x 8–104,  y 353–381
       ITEM window  bottom-right                    x 536–632, y 353–381
     fillRect / strokeRect / fillText / arc only — no gradients, so the per-frame
     gradient budget is untouched. reduceMotion: no blinking, values only. ---- */
  var HUD_FONT = '8px "Share Tech Mono",monospace', HUD_PANEL = 'rgba(4,14,11,0.62)', HUD_EDGE = 'rgba(119,210,166,0.35)';
  function hudPanel(x, y, w, h, edge) {
    ctx.fillStyle = HUD_PANEL; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = edge || HUD_EDGE; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  }
  // cooldown ring: dim track; amber arc grows as the timer recharges; full green ring when ready
  function hudRing(x, y, cd, max) {
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(119,210,166,0.22)';
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
    if (cd > 0) {
      ctx.strokeStyle = C.amber;
      ctx.beginPath(); ctx.arc(x, y, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cd / max)); ctx.stroke();
    } else {
      ctx.strokeStyle = C.green;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.green; ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }
  function drawHudWindows() {
    var blinkOn = reduceMotion || Math.sin(elapsed * 10) > 0, i;
    ctx.font = HUD_FONT; ctx.textBaseline = 'middle';
    // (a) LIFE gauge — same thresholds as updateHud()
    hudPanel(118, 7, 212, 18);
    ctx.textAlign = 'left'; ctx.fillStyle = C.dim; ctx.fillText('LIFE', 124, 16.5);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(150, 11, 176, 10);
    ctx.strokeStyle = 'rgba(119,210,166,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(150.5, 11.5, 175, 9);
    var lw = Math.round(174 * Math.max(0, Math.min(1, life)));
    if (lw > 0 && (life >= 0.25 || blinkOn)) {
      ctx.fillStyle = life > 0.5 ? C.green : life > 0.25 ? C.amber : C.red;
      ctx.fillRect(151, 12, lw, 8);
    }
    ctx.fillStyle = 'rgba(4,14,11,0.75)';
    for (i = 158; i < 325; i += 8) ctx.fillRect(i, 12, 1, 8);   // segment ticks every 8px
    // (d) alert-phase countdown — digits left-aligned at a fixed x so they never jitter
    if (alertPhase !== 'normal') {
      var ph = alertPhase, pc = ph === 'caution' ? C.amber : C.red;
      var pe = ph === 'caution' ? 'rgba(224,194,90,0.45)' : 'rgba(224,96,109,0.5)';
      hudPanel(340, 7, 130, 18, pe);
      ctx.textAlign = 'left'; ctx.fillStyle = pc;
      if (ph === 'alert') { ctx.fillText('ALERT', 358, 16.5); if (blinkOn) ctx.fillText('!', 346, 16.5); }   // word stays, the ! blinks
      else {
        ctx.fillText(ph === 'evasion' ? 'EVASION' : 'CAUTION', 346, 16.5);
        ctx.fillStyle = ph === 'caution' ? C.amberHi : C.redHi;
        ctx.fillText(Math.max(0, ph === 'evasion' ? evasionTimer : cautionTimer).toFixed(2), 404, 16.5);
      }
    }
    if (coarsePointer) return;   // the touch d-pad / action buttons overlay both bottom corners
    // (c) WEAPON / ACTION window — CQC + KNOCK with their cooldown rings
    hudPanel(8, 353, 96, 28);
    hudRing(21, 367, cqcCD, CQC_CD); hudRing(63, 367, knockCD, KNOCK_CD);
    ctx.textAlign = 'left'; ctx.font = HUD_FONT;
    ctx.fillStyle = cqcCD > 0 ? C.dim : C.green; ctx.fillText('CQC', 31, 367.5);
    ctx.fillStyle = knockCD > 0 ? C.dim : C.green; ctx.fillText('KNOCK', 73, 367.5);
    // (b) ITEM window — the box (mini SPR.box) when worn, an empty slot otherwise
    hudPanel(536, 353, 96, 28);
    ctx.fillStyle = C.dim; ctx.fillText('ITEM', 541, 367.5);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(570, 356, 22, 22);
    ctx.strokeStyle = boxed ? 'rgba(180,236,208,0.6)' : 'rgba(119,210,166,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(570.5, 356.5, 21, 21);
    if (boxed) {
      ctx.drawImage(SPR.box, 572, 358, 18, 18);   // exact 1:2 of the 2x sprite at an integer origin (no ragged rows)
      ctx.fillStyle = C.bright; ctx.fillText('BOX', 598, 367.5);
    } else { ctx.fillStyle = C.dim; ctx.fillText('NONE', 598, 367.5); }
  }
  function render() {
    var roomAlert = alertPhase === 'alert' || alertPhase === 'evasion', i;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    // deterministic sin-based shake — no allocation, no Math.random
    if (shakeT > 0) { var shk = shakeT / 0.35; ctx.translate(Math.sin(elapsed * 87) * 3.5 * shk, Math.cos(elapsed * 61) * 2.5 * shk); }
    // static world: one blit from the pre-rendered layer (vs 240 tile draws/frame)
    if (bgLayer) ctx.drawImage(bgLayer, 0, 0, W, H);
    // player light pool — gives the eye a focal point on the dark floor
    // (origin-built cached gradient drawn under a translate: zero per-frame allocation)
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(player.x, player.y);
    ctx.fillStyle = poolGrad; ctx.fillRect(-130, -130, 260, 260);
    ctx.restore();
    drawExit(); drawIntel();
    for (i = 0; i < noisePings.length; i++) {
      var pg = noisePings[i], t = pg.t / 0.6;
      ctx.strokeStyle = 'rgba(159,227,196,' + (0.5 * (1 - t)) + ')'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(pg.x, pg.y, pg.r * t, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(159,227,196,' + (0.3 * (1 - t)) + ')'; ctx.lineWidth = 1;   // trailing ring
      ctx.beginPath(); ctx.arc(pg.x, pg.y, pg.r * t * 0.65, 0, Math.PI * 2); ctx.stroke();
    }
    // event pulses: green ring on a CQC takedown, amber ring on the intel grab
    for (i = 0; i < fxPulses.length; i++) {
      var fp = fxPulses[i], ft = fp.t / 0.45, fr = reduceMotion ? 13 : 5 + ft * 15;
      ctx.strokeStyle = 'rgba(' + fp.c + ',' + (0.75 * (1 - ft)).toFixed(3) + ')';
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(fp.x, fp.y, fr, 0, Math.PI * 2); ctx.stroke();
    }
    for (i = 0; i < guards.length; i++) { if (!guards[i].down) drawCone(guards[i], roomAlert); }
    for (i = 0; i < cameras.length; i++) drawCone(cameras[i], roomAlert);
    if (roomAlert) drawLastKnown();
    for (i = 0; i < cameras.length; i++) drawCamera(cameras[i]);
    for (i = 0; i < guards.length; i++) drawGuard(guards[i], roomAlert);
    if (boxed) { drawShadow(player.x, player.y); drawSpriteImg(SPR.box, player.x, player.y, null, null); }
    else {
      drawShadow(player.x, player.y);
      drawSpriteImg(SPR.player[player.moving ? (Math.floor(walkPhase / Math.PI) % 2) : 0], player.x, player.y,
        Math.atan2(player.fy, player.fx) + Math.PI / 2, player.moving ? walkPhase : null);
    }
    // taking-fire feedback: flickering tracers from every shooter (world space)
    if (hitFlashT > 0) {
      for (i = 0; i < guards.length; i++) {
        var tg = guards[i]; if (tg.down || !tg.seeing) continue;
        ctx.strokeStyle = 'rgba(240,217,140,' + (reduceMotion ? 0.5 : (0.2 + 0.4 * Math.abs(Math.sin(elapsed * 47 + i * 2))).toFixed(3)) + ')';
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tg.x, tg.y); ctx.lineTo(player.x, player.y); ctx.stroke();
        ctx.fillStyle = 'rgba(240,217,140,0.95)'; ctx.fillRect(tg.x - 2, tg.y - 2, 4, 4);  // muzzle flash
      }
    }
    // heliport snow: ≤40 drifting specks on deterministic sin paths — visual only,
    // no Math.random, no per-frame allocation; skipped entirely under reduceMotion
    if (level.floor === 'heliport' && !reduceMotion) {
      ctx.fillStyle = 'rgba(228,246,240,0.55)';
      for (i = 0; i < 40; i++) {
        var sx = (i * 97.3 + elapsed * (14 + (i % 5) * 5) + Math.sin(elapsed * 0.9 + i) * 12) % W;
        var sy = (i * 53.7 + elapsed * (30 + (i % 7) * 6)) % H;
        if (sx < 0) sx += W;
        var sz = (i % 3) ? 1 : 2;
        ctx.fillRect(sx | 0, sy | 0, sz, sz);
      }
    }
    ctx.restore();
    // red vignette (screen space — must not shake): scales with taking-fire flash,
    // and pulses slowly while life is critical so danger reads without the HUD bar
    var vigA = hitFlashT > 0 ? 0.38 * (hitFlashT / 0.18) : 0;
    if (life > 0 && life < 0.3 && state === 'playing') vigA = Math.max(vigA, reduceMotion ? 0.14 : 0.10 + 0.08 * Math.sin(elapsed * 5));
    if (vigA > 0) { ctx.globalAlpha = vigA; ctx.fillStyle = vigGrad; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    drawRadar();
    // MGS HUD windows on wide canvases only (one clientWidth read per frame);
    // narrow/phone layouts rely on the DOM strip alone
    // gate on the RENDERED width: a height-capped frame letterboxes the canvas (object-fit: contain)
    if (Math.min(canvas.clientWidth, canvas.clientHeight * W / H) >= 520) drawHudWindows();
  }

  /* ===================== screens / transitions ===================== */
  // gameplay messages go to the aria-live region AND (during play) to a visible
  // codec-subtitle toast — sighted players get the same guidance as SR users
  function announce(m) {
    if (srLive) srLive.textContent = m;
    if (!toastEl || state !== 'playing') return;
    toastEl.textContent = m; toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastTimer = null; toastEl.classList.remove('show'); }, 2200);
  }
  function hideToast() {
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (toastEl) toastEl.classList.remove('show');
  }
  // typewriter reveal for codec briefings (visual only — announce() gets the full string)
  function typeText(el, str) {
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    if (reduceMotion || !str) { el.textContent = str || ''; return; }
    el.textContent = ''; var i = 0;
    typeTimer = setInterval(function () {
      i += 2; el.textContent = str.slice(0, i);
      if (i >= str.length) { clearInterval(typeTimer); typeTimer = null; }
    }, 16);
  }
  // touch devices have no Enter key — swap the prompt for a tap hint
  function goText(t) {
    if (!coarsePointer || !t) return t;
    return t.replace('PRESS ENTER / R TO RETRY', 'TAP TO RETRY').replace('PRESS ENTER TO', 'TAP TO').replace('PRESS ENTER', 'TAP TO CONTINUE');
  }
  function showScreen(o) {
    hideToast();  // a live gameplay toast (z above the screen) must not float over a menu
    screenEl.className = 'mgsg-screen show' + (o.cls ? ' ' + o.cls : '');
    // restart the codec wipe + beam on every screen change (the 'show' class may
    // already be present, e.g. title -> briefing); inline animation:none + reflow
    // restarts the keyframes without touching the opacity transition
    if (!reduceMotion) {
      screenEl.style.animation = 'none'; beamEl.style.animation = 'none';
      void screenEl.offsetWidth;
      screenEl.style.animation = ''; beamEl.style.animation = '';
    }
    scrCaller.textContent = o.caller || ''; scrCaller.style.display = o.caller ? '' : 'none';
    scrTitle.textContent = o.title || ''; scrSub.textContent = o.sub || ''; scrGo.textContent = goText(o.go) || '';
    // codec-call layout (title + briefing): caller portrait, name, frequency needle
    var call = o.cls === 'title' || o.cls === 'brief';
    if (call) {
      scrPortThem.classList.toggle('noimg', !o.portrait);
      scrWhoThem.textContent = o.who || '';
      var fq = o.freq || '140.85';
      scrFnum.textContent = fq;
      // needle: 140.00 .. 142.00 across the strip
      scrNeedle.style.left = Math.max(4, Math.min(96, (parseFloat(fq) - 140) / 2 * 100)).toFixed(1) + '%';
    }
    if (call) typeText(scrBody, o.body || '');
    else { if (typeTimer) { clearInterval(typeTimer); typeTimer = null; } scrBody.textContent = o.body || ''; }
    if (o.big) { scrRank.textContent = o.big; scrRank.className = o.bigCls || 'rank'; scrRank.style.display = ''; } else scrRank.style.display = 'none';
    scrStats.innerHTML = '';
    if (o.stats) {
      o.stats.forEach(function (rw) {
        var a = document.createElement('span'); a.textContent = rw[0];
        var v = document.createElement('span'); v.textContent = rw[1];
        scrStats.appendChild(a); scrStats.appendChild(v);
      });
      scrStats.style.display = 'grid';
    } else scrStats.style.display = 'none';
    scrRec.textContent = o.rec || ''; scrRec.style.display = o.rec ? '' : 'none';
    scrRetry.style.display = o.retry ? '' : 'none';
    announce((o.title || '') + '. ' + (o.rec ? o.rec + '. ' : '') + (o.body || ''));
  }
  function hideScreen() {
    screenEl.className = 'mgsg-screen'; scrRetry.style.display = 'none';
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
  }
  function fmt(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function rankFor(alerts, time, sTime) { if (alerts === 0 && time < (sTime || 55)) return 'S'; if (alerts === 0) return 'A'; if (alerts <= 2) return 'B'; return 'C'; }

  /* ---- per-op best completion times (localStorage 'mgs-best': {op1:s,op2:s,op3:s,total:s}).
     Flat schema, every read guarded — corrupt/foreign JSON degrades to "no best". ---- */
  var BEST_KEY = 'mgs-best';
  function readBest() {
    var b = null;
    try { b = JSON.parse(localStorage.getItem(BEST_KEY)); } catch (e) {}
    return (b && typeof b === 'object' && !Array.isArray(b)) ? b : {};
  }
  function bestFor(key) {
    var v = readBest()[key];
    return (typeof v === 'number' && isFinite(v) && v > 0) ? v : null;
  }
  // store secs under key if it beats (or first sets) the best; true = new record
  function noteBest(key, secs) {
    var prev = bestFor(key);
    if (prev !== null && prev <= secs) return false;
    var b = readBest(); b[key] = Math.round(secs * 100) / 100;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) {}
    return true;
  }

  // title: the call comes from Shadow Moses on 140.85 — Snake's codec portrait
  // (img/codec-snake-face.png) on the caller side; briefings show the op's
  // caller as a NO IMAGE static box on that op's frequency
  function startTitle() { state = 'title'; loadLevel(0); render(); showScreen({ cls: 'title', caller: 'SHADOW MOSES · 140.85', title: 'METAL GEAR', portrait: true, who: 'SNAKE', freq: '140.85', body: 'A stealth drill on an encrypted burst channel. Get the intel, reach the exit, stay unseen.', sub: 'WASD move · Shift run · B box · K knock · F CQC', go: 'PRESS ENTER' }); }
  function startBriefing() {
    state = 'briefing'; loadLevel(levelIdx); render();
    var pb = bestFor('op' + (levelIdx + 1));   // personal best line — omitted until an op is cleared once
    showScreen({ cls: 'brief', caller: '▸ ' + level.caller + ' · ' + level.freq, title: 'OP ' + (levelIdx + 1) + ' — ' + level.name, who: level.caller, freq: level.freq, stats: pb !== null ? [['PERSONAL BEST', fmt(pb)]] : null, body: level.brief, sub: 'incoming codec · transmission secure', go: 'PRESS ENTER TO INFILTRATE' });
  }
  function startPlay() {
    hideScreen(); keys = Object.create(null); touchDir = { up: 0, down: 0, left: 0, right: 0 }; running = false;
    // CRT power-on sweep as gameplay starts
    if (!reduceMotion) { canvas.classList.remove('on'); void canvas.offsetWidth; canvas.classList.add('on'); }
    state = 'playing'; announce('Go.');
  }
  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused'; stopAlertMusic();
    showScreen({ cls: 'pause', title: 'PAUSED', body: 'Codec link on hold. Your position is held.', sub: 'ESC AGAIN TO DISCONNECT', go: 'PRESS ENTER TO RESUME', retry: true });
  }
  function resumeGame() {
    hideScreen(); keys = Object.create(null); touchDir = { up: 0, down: 0, left: 0, right: 0 }; running = false;
    state = 'playing';
    if (alertPhase === 'alert' || alertPhase === 'evasion') startAlertMusic();
    announce('Resumed.');
  }
  function levelClear() {
    totalTime += elapsed; totalAlerts += alertsThisLevel; stopAlertMusic(); sfxClear();
    // op best is recorded on every clear (incl. op3) so its briefing shows a PB
    var opPrev = bestFor('op' + (levelIdx + 1));
    var opRec = noteBest('op' + (levelIdx + 1), elapsed);
    if (levelIdx + 1 < LEVELS.length) {
      var rank = rankFor(alertsThisLevel, elapsed);
      var stats = [['TIME', fmt(elapsed)], ['ALERTS', String(alertsThisLevel)]];
      if (!opRec && opPrev !== null) stats.push(['BEST', fmt(opPrev)]);
      state = 'clear'; render(); showScreen({ title: 'OP ' + (levelIdx + 1) + ' CLEAR', big: rank, rec: opRec ? 'NEW RECORD' : '', body: alertsThisLevel ? ('Extracted — ' + alertsThisLevel + ' alert(s) raised.') : 'Clean extraction. No alerts.', stats: stats, go: 'PRESS ENTER TO CONTINUE' });
    } else {
      // mission rank counts every op: total alerts + total time
      var mRank = rankFor(totalAlerts, totalTime, 165);
      var totPrev = bestFor('total');
      var totRec = noteBest('total', totalTime);
      var mStats = [['TOTAL TIME', fmt(totalTime)], ['TOTAL ALERTS', String(totalAlerts)]];
      if (!totRec && totPrev !== null) mStats.push(['BEST', fmt(totPrev)]);
      state = 'complete'; render(); showScreen({ title: 'MISSION COMPLETE', big: mRank, rec: totRec ? 'NEW RECORD' : '', body: (totalAlerts ? 'All sectors cleared — ' + totalAlerts + ' alert(s) across the mission.' : 'All sectors cleared and the intel is out.') + ' Kept you waiting, huh?', stats: mStats, go: 'PRESS ENTER TO REPLAY' });
    }
  }
  function gameOver() {
    stopAlertMusic(); state = 'over'; sfxOver();
    updateHud();  // the death frame returns before update()'s HUD refresh — show the real (empty) life bar
    if (!reduceMotion) { flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on'); }
    render();
    // freeze frame: grade the field red-monochrome (two flat fills, no gradient)
    // and show the radar jammed — the frame stays under the GAME OVER screen
    ctx.save();
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(224,96,109,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(80,0,10,0.25)'; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    drawRadar(true);
    showScreen({ cls: 'fail', title: 'GAME OVER', big: 'SNAAAKE!', bigCls: 'snaaake', body: 'You were taken down on OP ' + (levelIdx + 1) + '.', stats: [['OP', String(levelIdx + 1)], ['STATUS', 'K.I.A.']], go: 'PRESS ENTER / R TO RETRY' });
  }
  function advance() {
    if (state === 'title') startBriefing();
    else if (state === 'briefing') startPlay();
    else if (state === 'paused') resumeGame();
    else if (state === 'over') startBriefing();
    else if (state === 'clear') { levelIdx++; startBriefing(); }
    else if (state === 'complete') { levelIdx = 0; totalTime = 0; totalAlerts = 0; startTitle(); }
  }

  /* ===================== loop + input ===================== */
  function frameStep(now) {
    if (!open) return;
    rafId = requestAnimationFrame(frameStep);
    var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0; lastT = now;
    if (state === 'playing') { update(dt); render(); }
  }
  function onKey(e) {
    if (!open) return;
    var k = (e.key || '').toLowerCase();
    if (e.type === 'keydown') {
      // never hijack browser shortcuts (Ctrl+R reload, Ctrl+F find, Cmd/Alt combos)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // let a focused SND/EXIT button receive its native Enter/Space activation
      if ((k === 'enter' || k === ' ' || k === 'spacebar') && document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('mgsg-btn')) return;
      e.stopImmediatePropagation();
      unlockAudio();
      var isMove = k.indexOf('arrow') === 0 || k === 'w' || k === 'a' || k === 's' || k === 'd';
      // swallow OS auto-repeat on action keys (movement is held state; shift is stateful)
      if (e.repeat && !isMove && k !== 'shift') { e.preventDefault(); return; }
      if (k === 'escape') { e.preventDefault(); if (state === 'playing') pauseGame(); else closeGame(); return; }
      if (k === 'tab') {
        e.preventDefault();
        var f = Array.prototype.filter.call(overlay.querySelectorAll('button:not([tabindex="-1"])'), function (el) { return el.offsetParent !== null; });
        if (!f.length) { frame.focus(); return; }
        var ci = f.indexOf(document.activeElement), ni = e.shiftKey ? (ci <= 0 ? f.length - 1 : ci - 1) : (ci >= f.length - 1 ? 0 : ci + 1);
        f[ni].focus(); return;
      }
      if (k === 'enter' || k === ' ' || k === 'spacebar') { e.preventDefault(); if (state !== 'playing') advance(); return; }
      if (k === 'r') { e.preventDefault(); if (state === 'playing' || state === 'paused' || state === 'over') startBriefing(); return; }
      if (k === 'shift') { running = true; return; }
      if (state === 'playing') {
        if (k === 'b') { e.preventDefault(); doBox(); return; }
        if (k === 'k') { e.preventDefault(); doKnock(); return; }
        if (k === 'f') { e.preventDefault(); doCQC(); return; }
      }
      if (isMove) { e.preventDefault(); keys[k] = true; }
    } else {
      e.stopImmediatePropagation();
      if (k === 'shift') running = false;
      keys[k] = false;
    }
  }
  function resetInput() { keys = Object.create(null); touchDir = { up: 0, down: 0, left: 0, right: 0 }; running = false; lastT = 0; }
  // losing focus or visibility PAUSES the run (pauseGame self-guards on state):
  // rAF keeps firing on an unfocused-but-visible window, so without this guards
  // hunt a frozen player, and the setInterval alert music loops in a hidden tab.
  function onVisibility() { if (document.hidden) { resetInput(); pauseGame(); } }
  function onBlur() { resetInput(); pauseGame(); }
  // browser zoom / monitor-DPI moves change devicePixelRatio mid-game — resize the
  // backing stores (canvas + bgLayer) or the playfield stays blurry until reopened
  function onResize() {
    if (Math.min(window.devicePixelRatio || 1, 2) === dpr) return;
    sizeCanvas();
    if (state !== 'playing') render();  // static screens won't re-render via the loop
  }

  /* ===================== open / close ===================== */
  function openGame() {
    build();
    if (open) return;
    open = true; sizeCanvas();
    // Let the page's background loops (dither/radar) pause under the overlay
    document.body.classList.add('game-open');
    window.dispatchEvent(new CustomEvent('gameopen'));
    applyChrome();   // dress the chrome for the current site theme
    levelIdx = 0; totalTime = 0; totalAlerts = 0; keys = Object.create(null); touchDir = { up: 0, down: 0, left: 0, right: 0 }; running = false; boxed = false;
    prevFocus = document.activeElement;
    document.body.style.overflow = 'hidden'; overlay.style.display = 'flex';
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKey, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onResize);
    window.addEventListener('themechange', applyChrome);   // live reskin while open
    requestAnimationFrame(function () { overlay.classList.add('in'); });
    // LCD chip dials in: 140.00 -> 140.85 in 8 steps over 0.4s (cleared on close)
    if (freqTimer) { clearInterval(freqTimer); freqTimer = null; }
    if (!reduceMotion) {
      var fstep = 0; freqEl.textContent = '140.00';
      freqTimer = setInterval(function () {
        fstep++; freqEl.textContent = (140 + 0.85 * Math.min(1, fstep / 8)).toFixed(2);
        if (fstep >= 8) { clearInterval(freqTimer); freqTimer = null; }
      }, 50);
    } else freqEl.textContent = '140.85';
    frame.focus();
    startTitle();
    lastT = 0; rafId = requestAnimationFrame(frameStep);
  }
  function closeGame() {
    if (!open) return;
    open = false; stopAlertMusic();
    document.body.classList.remove('game-open');   // resume dither/radar loops
    window.dispatchEvent(new CustomEvent('gameclose'));
    if (rafId) cancelAnimationFrame(rafId); rafId = null;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('keyup', onKey, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('themechange', applyChrome);
    overlay.classList.remove('in'); document.body.style.overflow = '';
    hideToast(); if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    if (freqTimer) { clearInterval(freqTimer); freqTimer = null; }
    freqEl.textContent = '140.85';
    resetInput(); boxed = false;  // resetInput also clears touchDir — no stuck d-pad on reopen
    try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) {}
    prevFocus = null;
    setTimeout(function () { if (!open) overlay.style.display = 'none'; }, 260);
  }

  /* ---- dev sanity check: warn if an entity/waypoint/camera sits on a wall or is unreachable ---- */
  function validate() {
    try {
      LEVELS.forEach(function (lv, n) {
        var w = lv.map.map(function (row) { return row.split('').map(function (ch) { return ch === '#'; }); });
        var wall = function (p) { return !p || p[1] < 0 || p[0] < 0 || p[1] >= ROWS || p[0] >= COLS || w[p[1]][p[0]]; };
        if (lv.map.length !== ROWS) console.warn('[MGSGame] L' + (n + 1) + ' rows=' + lv.map.length);
        ['start', 'exit', 'intel'].forEach(function (key) { if (lv[key] && wall(lv[key])) console.warn('[MGSGame] L' + (n + 1) + ' ' + key + ' on wall', lv[key]); });
        lv.guards.forEach(function (g, gi) { g.path.forEach(function (p) { if (wall(p)) console.warn('[MGSGame] L' + (n + 1) + ' guard ' + gi + ' wp on wall', p); }); });
        (lv.cameras || []).forEach(function (cm, ci) { if (wall(cm.t)) console.warn('[MGSGame] L' + (n + 1) + ' camera ' + ci + ' on wall', cm.t); });
        // reachability from start
        var seen = Array.from({ length: ROWS }, function () { return Array(COLS).fill(false); });
        var q = [[lv.start[0], lv.start[1]]]; seen[lv.start[1]][lv.start[0]] = true;
        while (q.length) { var cur = q.shift(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var nc = cur[0] + d[0], nr = cur[1] + d[1]; if (nc >= 0 && nr >= 0 && nc < COLS && nr < ROWS && !w[nr][nc] && !seen[nr][nc]) { seen[nr][nc] = true; q.push([nc, nr]); } }); }
        var reach = function (p, what) { if (p && !seen[p[1]][p[0]]) console.warn('[MGSGame] L' + (n + 1) + ' ' + what + ' unreachable', p); };
        reach(lv.exit, 'exit'); reach(lv.intel, 'intel');
        lv.guards.forEach(function (g, gi) { g.path.forEach(function (p) { reach(p, 'guard ' + gi + ' wp'); }); });
      });
    } catch (e) {}
  }

  validate();
  window.MGSGame = { open: openGame, close: closeGame, get isOpen() { return open; } };
})();

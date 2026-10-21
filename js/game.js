/* ===========================================================================
   BIG SHELL — a hidden top-down stealth mini-game: Raiden's three operations on
   the Big Shell (Metal Gear Solid 2), behind the footer's 140.85 / the Konami
   code / 140.85 typed (wired in js/sumi.js, which loads this file on the first
   call). Self-contained: injects its own styles + DOM and exposes
   window.MGSGame = { open, close }.

   Systems: pixel-art operatives, Alert/Evasion/Caution states with BFS-pathing
   guard AI, a stealth toolkit (walk/run noise, cardboard box, wall-knock lure,
   CQC subdue), a rectangular radar minimap, security cameras, codec presentation.
   Palette: moonlit steel blue. A deep navy ground (#0b1220 / #0e1726), steel-blue
   linework and type (#8fa6c0 / #b8c6d6, dim #7189a6), cool greys for secondary
   things, and paper (#e9e7e2) for the brightest highlights: alerts, the player's
   crown, hostile cones. NO red, amber or mint anywhere (alerts, damage and game
   over included).
   Perf rules: no ctx.shadowBlur / ctx.filter; <= 9 gradients per frame (only the
   vision cones make one each); the static world (floor, walls, doorway, radar
   map, mist sprite, the Colonel's portrait) is pre-baked once per level/open.

   SOURCES — every Metal Gear name used in this file, and where it was checked
   (retrieved 2026-10-20). Nothing else from the series is used.
   - The Big Shell: an environmental clean-up facility erected in the lower New
     York Harbor, seized by the Sons of Liberty; Raiden, a rookie FOXHOUND agent,
     infiltrates it in the Plant chapter.
     https://en.wikipedia.org/wiki/Metal_Gear_Solid_2:_Sons_of_Liberty
   - The Gurlukovich mercenaries: a Russian mercenary force that patrols the
     facility (the guards in every operation).
     https://en.wikipedia.org/wiki/Metal_Gear_Solid_2:_Sons_of_Liberty
   - Raiden's codec contacts: his commanding officer the Colonel (and his
     girlfriend Rosemary); designed by Yoji Shinkawa.
     https://en.wikipedia.org/wiki/Raiden_(Metal_Gear)
   - The Colonel's frequency in the Plant chapter: 140.85 (codec list
     "Colonel | 140.85"); 140.85 is the mission-control channel of each chapter.
     https://www.gamerevolution.com/?p=30494 (MGS2 walkthrough, codec list)
     https://amkstation.com/fr/metal-gear-solid-2-all-codec-frequencies/
   - Area names, verbatim from the Plant walkthrough: "Strut A Deep Sea Dock",
     "AB connecting bridge", "Shell 1 Core, B1" (guards pass between crates there).
     https://www.gamerevolution.com/?p=30494
   - Security cameras on the Big Shell ("Shoot the camera with the SOCOM").
     https://www.gamerevolution.com/?p=30494
   - The radar goes dark in alert and evasion phases (series convention; drawn
     here as JAMMED). https://en.wikipedia.org/wiki/Metal_Gear_Solid_(1998_video_game)
   Not used, because they could not be verified: suit names, hair colour as
   lore (the sprite's pale hair follows the site's own ink of him), any quoted
   game dialogue. Every caller line below is original.
   Raiden's codec portrait is the site's own img/raiden-night.png, masked and
   tinted steel blue; the Colonel's is drawn here (a dithered silhouette whose signal
   breaks up). No portrait art, logo or trademark image is shipped for this game.
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

  /* ---- palette: moonlit steel blue on a navy night sea; sprites carry their own
     tones. Danger is PAPER (#e9e7e2), suspicion a cool light grey (#c3cbd5): there is
     no red, rose or amber anywhere in this file. ---- */
  var C = {
    bg: '#0b1220', panel: '#0e1726',
    floorA: '#0c1422', floorB: '#0f1827',            // checker pair (steel, faint)
    floorDot: 'rgba(143,166,192,0.05)',              // dither dots
    grid: 'rgba(143,166,192,0.035)',
    wallFace: '#1a2433', wallTop: '#34465e',         // lit top face
    wallRim: '#8a9cb3',                              // 1px top rim highlight
    wallFront: '#121b29',                            // south "front face" (2.5D height)
    wallSide: '#0a101b',                             // shaded right edge
    wallEdge: '#4b5e79', wallShadow: 'rgba(0,0,0,0.42)',
    line: '#8fa6c0', bright: '#b8c6d6', dim: '#7189a6',
    paper: '#e9e7e2', paperDim: '#c3cbd5', steel: '#7c8a9c', ink: '#141416'
  };
  /* per-op floor identity (baked once in buildBg — zero per-frame cost) */
  var FLOORS = {
    dock: { a: '#0d1523', b: '#0f1826' },     // Strut A deck: treadplate steel
    bridge: { a: '#060c18', b: '#07101c' },   // AB bridge: night sea under a catwalk grate
    core: { a: '#0c1422', b: '#0f1827' }      // Shell 1 core: composite panels
  };

  /* ---- pixel sprites (16x16 grids = one tile tall at SCALE 2; '.' transparent).
     Drawn rotated to face; sprites face UP pre-rotation (facing + PI/2).
     Read top-down: weapon forward (row 0 = muzzle, the brightest W pixel, so
     facing reads instantly), then head, shoulders, torso, legs. Symmetric
     about the column 7|8 seam (Raiden's crown is lit from the left). Letters:
     K internal edge · S suit · L suit highlight · B suit shade · G hair/helmet ·
     P hair shade · g gunmetal · H face (cool grey) · W muzzle ·
     V visor. ---- */
  // Raiden — readable from above as a person, not a glyph: a round PALE head
  // (G lit, P its shaded side; 2-4-4-4-4 px, an oval) sits INSIDE the shoulders
  // with no dark ring around it, so it reads as a head between shoulders; a
  // mid steel-blue suit (S, L the lit shoulder caps, B shade) narrows from 10 px
  // shoulders to the waist; both arms reach forward to the pistol (g, dark),
  // whose muzzle (W) is the facing cue.
  var PLAYER = [
    '.......WW.......',
    '.......gg.......',
    '......BggB......',
    '.....SB..BS.....',
    '.....S....S.....',
    '....LS.PP.SL....',
    '...LLSPGGPSLL...',
    '...LSSGGGGSSL...',
    '...BSSGGGPSSB...',
    '...BSSPGPPSSB...',
    '....BSSSSSSB....',
    '....BBSSSSBB....',
    '.....BSSSSB.....',
    '.....SB..BS.....',
    '.....SB..BS.....',
    '.....BB..BB.....'
  ];
  // Gurlukovich mercenary — helmet dome with a visor band (V, the facing cue),
  // rifle forward, broad armored shoulders; lit paper-white when hostile
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
  // intel keycard (8x6): steel-blue body, lighter top stripe, a paper contact notch
  // (W) and a 1px darker slot
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
  var PLAYER_B = PLAYER.slice(0, 14).concat(['......SBBS......', '......BB.BB.....']);   // legs passing
  var GUARD_B = GUARD.slice(0, 14).concat(WALK_B_ROWS);
  var PAL_PLAYER = { K: '#060a12', S: '#5d708a', L: '#8496b0', B: '#3c4b61', G: '#e9e7e2', P: '#b4bfcc', g: '#262f3e', W: '#b8c6d6' };
  var PAL_GUARD = { K: '#050912', S: '#566478', H: '#a3adba', B: '#364257', G: '#2a3445', g: '#6b7588', W: '#a9b6c6', V: '#9fb4cc' };
  var PAL_GUARD_HOT = { K: '#050912', S: '#8e9bac', H: '#d0d6de', B: '#5f6c80', G: '#3c4759', g: '#a4aebe', W: '#e9e7e2', V: '#e9e7e2' };
  var PAL_GUARD_DOWN = { K: '#04070e', S: '#3c475a', H: '#7c8594', B: '#262f3e', G: '#1d2433', g: '#4b5262', W: '#767f8e', V: '#5a6b80' };
  var PAL_BOX = { K: '#262b33', B: '#7d8796', W: '#a7b0bc', D: '#565f6d' };
  var PAL_KEY = { A: '#6f86a3', L: '#b8c6d6', W: '#e9e7e2', D: '#2c3d55' };

  /* ---- pre-rendered sprite canvases (crisp pixels + 1px outline; built once).
     Every sprite gets a dark 1px outline (grounded on the floor). ---- */
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
    var pOut = 'rgba(3,6,12,0.9)', gOut = 'rgba(3,6,12,0.9)';   // both dark: Raiden pops by his pale crown and lighter suit, not a halo
    SPR = {
      player: [makeSprite(PLAYER, PAL_PLAYER, pOut), makeSprite(PLAYER_B, PAL_PLAYER, pOut)],
      guard: [makeSprite(GUARD, PAL_GUARD, gOut), makeSprite(GUARD_B, PAL_GUARD, gOut)],
      guardHot: [makeSprite(GUARD, PAL_GUARD_HOT, gOut), makeSprite(GUARD_B, PAL_GUARD_HOT, gOut)],
      guardDown: makeSprite(GUARD, PAL_GUARD_DOWN, gOut),
      box: makeSprite(BOX, PAL_BOX, 'rgba(0,0,0,0.5)'),
      key: makeSprite(KEYCARD, PAL_KEY, 'rgba(5,10,20,0.8)')
    };
  }

  /* ---- levels: maps 20x12 ('#' wall / '.' floor). Tile coords [col,row].
     Three Big Shell areas (names verbatim from the SOURCES above) — floor:
     buildBg() identity key; weather: 'sea' = wind-driven spray + drifting mist
     (the open bridge), 'mist' = mist only (the enclosed dock), none in the core.
     lost = where the Colonel loses the signal (game over). Every call is the
     Colonel on 140.85.
     Maps/paths/speeds are the gameplay and stay put. Every op starts with Raiden at
     [1,10] and no watcher able to see that tile for the opening seconds. The
     westbound patrols used to turn at column 2 and spot a still Raiden in ~4 s: in
     op 2 the row-8 sentry now turns at column 8 (out of range of the spawn: the open
     floor there has no cover), in op 3 the row-7 patrol turns at column 5, where the
     walls at [3-4, 8-9] block the line to the spawn. ---- */
  var LEVELS = [
    {
      name: 'STRUT A DEEP SEA DOCK', caller: 'COLONEL', freq: '140.85', floor: 'dock', weather: 'mist',
      lost: 'Lost you at the Strut A deep sea dock.',
      brief: 'Raiden, you’re in the dock. One Gurlukovich sentry walks the floor. Take the intel, reach the exit. If he spots you, break his line of sight and hold still until the alert passes.',
      map: ['####################', '#..................#', '#..####....####....#', '#..####....####....#',
        '#..................#', '#.......####.......#', '#.......####.......#', '#..................#',
        '#..####....####....#', '#..####....####....#', '#..................#', '####################'],
      start: [1, 10], exit: [18, 1], intel: [10, 4],
      guards: [{ path: [[2, 4], [17, 4]], speed: 70, fov: 1.05, range: 150 }], cameras: []
    },
    {
      name: 'AB CONNECTING BRIDGE', caller: 'COLONEL', freq: '140.85', floor: 'bridge', weather: 'sea',
      lost: 'Lost you on the AB connecting bridge.',
      brief: 'The bridge to Strut B. Two sentries, crossing in opposite directions. Use the cargo to break their sightlines. Running is fast, but the grating carries the sound. A still box hides you.',
      map: ['####################', '#..................#', '#..##..##..##..##..#', '#..##..##..##..##..#',
        '#..................#', '#..................#', '#..##..##..##..##..#', '#..##..##..##..##..#',
        '#..................#', '#..................#', '#..................#', '####################'],
      start: [1, 10], exit: [18, 1], intel: [9, 5],
      guards: [{ path: [[2, 4], [17, 4]], speed: 82, fov: 1.13, range: 160 },
        { path: [[17, 8], [8, 8]], speed: 82, fov: 1.13, range: 160, offset: 0.5 }], cameras: []
    },
    {
      name: 'SHELL 1 CORE · B1', caller: 'COLONEL', freq: '140.85', floor: 'core',
      lost: 'Lost you in the Shell 1 core, B1.',
      brief: 'Shell 1 core, B1. Three patrols and a camera on the upper corridor. Knock on a wall to pull a guard off his route, or take him from behind. Then get the intel out.',
      map: ['####################', '#..................#', '#..##..####..##....#', '#..##..####..##....#',
        '#..................#', '#....####..####....#', '#....####..####....#', '#..................#',
        '#..##..####..##....#', '#..##..####..##....#', '#..................#', '####################'],
      start: [1, 10], exit: [18, 1], intel: [9, 5],
      guards: [{ path: [[2, 4], [17, 4]], speed: 92, fov: 1.2, range: 172 },
        { path: [[17, 7], [5, 7]], speed: 92, fov: 1.2, range: 172, offset: 0.5 },
        { path: [[2, 10], [17, 10]], speed: 88, fov: 1.15, range: 165, offset: 0.25 }],
      cameras: [{ t: [13, 1], base: Math.PI / 2, arc: 0.9, speed: 0.8, fov: 0.95, range: 150 }]
    }
  ];

  /* ---- CHROME palette (frame / bar / HUD / buttons / screens / toast): one map,
     written as CSS custom properties on .mgsg-overlay. Steel blue on navy;
     paper (--mg-paper) is the danger colour, cool grey (--mg-pdim) the caution. ---- */
  var CHROME = {
    bg: '#0b1220', panel: '#0e1726', line: '#1b2638', edge: '#46607f', border: '#2b3d56',
    text: '#8fa6c0', hi: '#b8c6d6', dim: '#7d93ae', glow: '143,166,192', hglow: '184,198,214',
    shade: '5,9,18', pad: '14,23,38', veil: 'rgba(5,8,15,0.93)', toastbg: 'rgba(5,9,18,.84)',
    paper: '#e9e7e2', pdim: '#c3cbd5'
  };
  var CHROME_VARS = {
    bg: '--mg-bg', panel: '--mg-panel', line: '--mg-line', edge: '--mg-edge', border: '--mg-border',
    text: '--mg-text', hi: '--mg-hi', dim: '--mg-dim', glow: '--mg-glow', hglow: '--mg-hglow',
    shade: '--mg-shade', pad: '--mg-pad', veil: '--mg-veil', toastbg: '--mg-toastbg', paper: '--mg-paper', pdim: '--mg-pdim'
  };
  function chromeVarsCSS(p) { var s = '', k; for (k in CHROME_VARS) s += CHROME_VARS[k] + ':' + p[k] + ';'; return s; }

  /* ---- injected stylesheet (one-time).
     Perf guardrails: all glow here is text-shadow/box-shadow (composited once);
     CRT/vignette/alarm wash are CSS pseudo-elements — GPU compositor only.
     Chrome colors are var(--mg-*) refs, written once from CHROME. ---- */
  var CSS = ''
    + '.mgsg-overlay{' + chromeVarsCSS(CHROME) + 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;'
    + 'background:var(--mg-veil);backdrop-filter:blur(2px);font-family:"Share Tech Mono",ui-monospace,monospace;'
    + 'color:var(--mg-text);opacity:0;transition:opacity .25s ease;padding:16px;overscroll-behavior:contain;overflow-y:auto;}'
    + '.mgsg-overlay.in{opacity:1;}'
    /* max-height + shrinking stage keep HUD/footer reachable on short viewports;
       margin:auto = safe centering (overflow stays scrollable, never clipped off-top) */
    + '.mgsg-frame{width:min(92vw,1080px);margin:auto;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);'
    + 'background:var(--mg-bg);border:1px solid var(--mg-border);border-radius:8px;'
    + 'box-shadow:0 24px 70px rgba(0,0,0,.6),0 0 0 1px rgba(var(--mg-glow),.08),0 0 32px rgba(var(--mg-glow),.12);'
    + 'overflow:hidden;display:flex;flex-direction:column;'
    + 'outline:1px solid rgba(var(--mg-glow),.12);outline-offset:-4px;transform-origin:50% 50%;}'
    + '.mgsg-frame:focus-visible{outline:2px solid var(--mg-text);outline-offset:-2px;}'
    /* codec connect / disconnect: the frame opens out of a horizontal line and
       closes back into one (transform only — compositor) */
    + '.mgsg-overlay.in .mgsg-frame{animation:mgsgConnect .3s cubic-bezier(.2,.8,.3,1) 1;}'
    + '.mgsg-overlay.out .mgsg-frame{animation:mgsgDisconnect .24s ease-in 1 forwards;}'
    + '.mgsg-bar{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--mg-line);'
    + 'background:var(--mg-panel);font-size:13px;letter-spacing:1.5px;flex-shrink:0;}'
    + '.mgsg-bar .t{color:var(--mg-hi);text-transform:uppercase;text-shadow:0 0 8px rgba(var(--mg-glow),.5);}'
    /* frequency readout as an LCD chip */
    + '.mgsg-bar .f{margin-left:auto;color:var(--mg-hi);letter-spacing:2px;font-size:12px;'
    + 'background:rgba(var(--mg-shade),.6);border:1px solid var(--mg-border);border-radius:3px;padding:3px 9px;'
    + 'text-shadow:0 0 6px rgba(var(--mg-glow),.6);font-variant-numeric:tabular-nums;}'
    + '.mgsg-frame.alarm .f{color:var(--mg-paper);border-color:var(--mg-hi);text-shadow:0 0 6px rgba(233,231,226,.45);}'
    + '.mgsg-bar .f::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;'
    + 'background:var(--mg-text);margin-right:8px;vertical-align:1px;box-shadow:0 0 6px rgba(var(--mg-glow),.8);'
    + 'animation:mgsgBlink 1.4s steps(1) infinite;}'
    + '.mgsg-frame.alarm .f::before{background:var(--mg-paper);box-shadow:0 0 6px rgba(233,231,226,.7);animation-duration:.5s;}'
    /* caution: the LCD chip and stage pick up the cool caution grey */
    + '.mgsg-frame.caution .f{color:var(--mg-pdim);border-color:#505a68;text-shadow:none;}'
    + '.mgsg-frame.caution .f::before{background:var(--mg-pdim);box-shadow:none;animation-duration:.9s;}'
    + '.mgsg-btn{background:transparent;border:1px solid var(--mg-edge);color:var(--mg-text);font:inherit;font-size:12px;'
    + 'line-height:1;padding:5px 8px;border-radius:4px;cursor:pointer;}'
    + '.mgsg-btn:hover{background:rgba(var(--mg-glow),.1);color:var(--mg-hi);}'
    /* the DOM strip: slim (the canvas carries the MGS2 windows); it stays the accessible source of truth */
    + '.mgsg-hud{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:4px 12px;border-bottom:1px solid var(--mg-line);'
    + 'font-size:10.5px;line-height:16px;letter-spacing:1.5px;text-transform:uppercase;color:var(--mg-dim);flex-shrink:0;}'
    + '.mgsg-hud b{color:var(--mg-text);font-weight:400;text-shadow:0 0 5px rgba(var(--mg-glow),.35);}'
    + '.mgsg-stbadge{padding:0 7px;border:1px solid currentColor;border-radius:2px;letter-spacing:2px;color:var(--mg-text);background:rgba(var(--mg-glow),.08);}'
    + '.mgsg-stbadge.alert,.mgsg-stbadge.evasion{color:var(--mg-paper);}.mgsg-stbadge.caution{color:var(--mg-pdim);background:rgba(195,203,213,.08);}'
    + '.mgsg-stbadge.evasion{background:rgba(233,231,226,.08);}'
    + '.mgsg-stbadge.alert{background:rgba(233,231,226,.14);animation:mgsgBlink .5s steps(1) infinite;}'
    + '.mgsg-life{display:inline-flex;align-items:center;gap:6px;}'
    /* wide canvases draw their own LIFE gauge + phase countdown (drawHudWindows): the DOM badge and gauge
       step out of sight there but stay readable to assistive tech (visually hidden, not display:none) */
    + '.mgsg-wide .mgsg-stbadge,.mgsg-wide .mgsg-life{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;}'
    + '.mgsg-lifebar{position:relative;width:88px;height:6px;border:1px solid var(--mg-edge);border-radius:4px;overflow:hidden;background:rgba(0,0,0,.3);}'
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
    + '.mgsg-stage.alarm{box-shadow:inset 0 0 0 2px var(--mg-paper),inset 0 0 0 3px rgba(var(--mg-glow),.5),inset 0 0 70px rgba(233,231,226,.08);}'
    + '.mgsg-stage.caution{box-shadow:inset 0 0 0 2px rgba(195,203,213,.35),inset 0 0 70px rgba(195,203,213,.06);}'
    + '.mgsg-stage.alarm::before{background:radial-gradient(ellipse 105% 105% at 50% 50%,rgba(233,231,226,.03) 40%,rgba(0,0,0,.48) 100%);'
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
    + '.mgsg-screen .caller{color:var(--mg-dim);font-size:10px;letter-spacing:6px;text-transform:uppercase;}'
    /* codec call layout (title + briefing): portrait | wave + frequency strip | portrait */
    + '.mgsg-call{display:none;grid-template-columns:96px minmax(120px,1fr) 96px;align-items:center;gap:14px;width:min(100%,520px);}'
    + '.mgsg-screen.title .mgsg-call,.mgsg-screen.brief .mgsg-call{display:grid;}'
    + '.mgsg-port{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;}'
    + '.mgsg-port .px{position:relative;width:96px;height:96px;border:1px solid var(--mg-edge);background:var(--mg-panel);overflow:hidden;'
    + 'box-shadow:0 0 0 1px rgba(var(--mg-shade),.8),0 0 14px rgba(var(--mg-glow),.12);}'
    /* RAIDEN: the site's own ink of him (img/raiden-night.png, paper on alpha) used as a mask over a steel-blue fill:
       his head and hair in moonlit steel; a 2 px dither grid over it reads as a codec CRT */
    + '.mgsg-port .px.raiden{--s:1;}'
    + '.mgsg-port .px.raiden i{position:absolute;inset:0;background:var(--mg-text);'
    + '-webkit-mask:url(img/raiden-night.png?v=12) no-repeat calc(-100px * var(--s)) calc(-75px * var(--s))/calc(300px * var(--s)) auto;'
    + 'mask:url(img/raiden-night.png?v=12) no-repeat calc(-100px * var(--s)) calc(-75px * var(--s))/calc(300px * var(--s)) auto;}'
    + '.mgsg-port .px.raiden b{position:absolute;inset:0;background:radial-gradient(circle,transparent 0 .7px,rgba(var(--mg-shade),.55) .8px) 0 0/2px 2px;}'
    /* COLONEL: a canvas (48 px, pixelated), drawn in buildColonel(), its signal breaking up in glitchColonel() */
    + '.mgsg-port .px canvas{display:block;width:100%;height:100%;image-rendering:pixelated;}'
    /* inset scanlines over every portrait (pseudo-element, compositor-only) */
    + '.mgsg-port .px::after{content:"";position:absolute;inset:0;pointer-events:none;'
    + 'background:repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0 1px,transparent 1px 3px),'
    + 'linear-gradient(rgba(var(--mg-glow),.06),transparent 40%,rgba(var(--mg-shade),.35));}'
    + '.mgsg-port .who{font-size:8px;letter-spacing:2px;color:var(--mg-dim);}'
    + '.mgsg-cc{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0;}'
    + '.mgsg-fstrip{position:relative;width:100%;height:14px;margin-bottom:10px;border-top:1px solid var(--mg-line);border-bottom:1px solid var(--mg-line);'
    + 'background:repeating-linear-gradient(90deg,rgba(var(--mg-glow),.55) 0 1px,transparent 1px 30px),'
    + 'repeating-linear-gradient(90deg,rgba(var(--mg-glow),.22) 0 1px,transparent 1px 6px);'
    + 'background-size:100% 100%,100% 50%;background-position:0 0,0 100%;background-repeat:no-repeat,repeat-x;}'
    + '.mgsg-fstrip i{position:absolute;top:-2px;bottom:-2px;left:50%;width:2px;margin-left:-1px;background:var(--mg-hi);'
    + 'box-shadow:0 0 6px rgba(var(--mg-hglow),.8);transition:left .45s cubic-bezier(.2,.8,.3,1);}'
    + '.mgsg-fstrip b{position:absolute;top:100%;margin-top:3px;font-weight:400;font-size:7px;letter-spacing:1px;color:var(--mg-dim);transform:translateX(-50%);}'
    + '.mgsg-fnum{font-size:15px;letter-spacing:3px;color:var(--mg-hi);font-variant-numeric:tabular-nums;text-shadow:0 0 8px rgba(var(--mg-glow),.5);}'
    /* phone widths: the aspect-locked stage is ~210px tall at 375px. On a touch
       phone (portrait) a menu screen also covers the control deck below the stage
       (see the portrait block), so the call keeps a compact row: Raiden 56 px |
       frequency strip | the Colonel 56 px. Gaps/padding tighten; safe centering
       scrolls rather than clips if a screen ever overflows */
    + '@media (max-width:520px){'
    + '.mgsg-screen{gap:6px;padding:12px;justify-content:flex-start;justify-content:safe center;overflow-y:auto;}'
    + '.mgsg-call{grid-template-columns:56px minmax(0,1fr) 56px;gap:10px;width:100%;}'
    + '.mgsg-port .px{width:56px;height:56px;}.mgsg-port .px.raiden{--s:.5833;}'
    + '.mgsg-cc{gap:4px;}.mgsg-fstrip{height:10px;margin-bottom:8px;}.mgsg-fnum{font-size:12px;letter-spacing:2px;}'
    /* a narrow window WITHOUT the touch deck has only the ~210 px stage for the call: the portraits and strip step out */
    + '.mgsg-overlay:not(.mgsg-touch) .mgsg-call{grid-template-columns:1fr;gap:0;width:auto;}'
    + '.mgsg-overlay:not(.mgsg-touch) .mgsg-port,.mgsg-overlay:not(.mgsg-touch) .mgsg-fstrip,.mgsg-overlay:not(.mgsg-touch) .mgsg-fnum,'
    + '.mgsg-overlay:not(.mgsg-touch) .mgsg-screen.show .mgsg-wave,.mgsg-overlay:not(.mgsg-touch) .mgsg-screen .mgsg-rec{display:none !important;}.mgsg-overlay:not(.mgsg-touch) .mgsg-screen{padding:8px 12px;gap:5px;}'
    + '.mgsg-screen.title h2{margin-top:.3em;padding:2px 10px 4px;font-size:22px;}'
    + '.mgsg-screen p{font-size:11px;line-height:1.4;}.mgsg-screen .go{margin-top:2px;}'
    /* the stage is ~210 px tall here: smaller op titles, rank, SIGNAL LOST and stats, thinner letterbox bars */
    + '.mgsg-overlay .mgsg-screen:not(.title) h2{font-size:17px;letter-spacing:2px;}.mgsg-overlay .mgsg-screen .rank{font-size:28px;}.mgsg-overlay .mgsg-screen .lost{font-size:22px;letter-spacing:4px;}'
    + '.mgsg-overlay .mgsg-stats{font-size:11px;gap:1px 14px;margin:0;}.mgsg-overlay .mgsg-screen.fail::before,.mgsg-overlay .mgsg-screen.fail::after{height:5%;}.mgsg-overlay .mgsg-screen.brief .sub{display:none;}}'
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
    + '.mgsg-hud{gap:4px 7px;padding:6px 8px;font-size:11px;letter-spacing:.5px;}.mgsg-hud>span{white-space:nowrap;}.mgsg-lifebar{width:40px;}'
    + '.mgsg-stbadge{letter-spacing:1px;padding:0 4px;}.mgsg-life{gap:4px;}'
    + '.mgsg-foot{gap:8px;padding:6px 8px;}}'
    /* the narrowest phones (360): the strip stays one line even with EVASION/CAUTION in the badge */
    + '@media (max-width:380px){.mgsg-hud{gap:4px 6px;font-size:10px;letter-spacing:0;}.mgsg-lifebar{width:32px;}}'
    + '.mgsg-screen p{max-width:46ch;font-size:13px;line-height:1.65;color:var(--mg-text);margin:0;}'
    + '.mgsg-screen .sub{color:var(--mg-dim);font-size:12px;letter-spacing:1px;}'
    + '.mgsg-screen .go{margin-top:6px;color:var(--mg-hi);animation:mgsgGoBlink 1.1s steps(1) infinite;}'
    + '.mgsg-screen.fail h2{color:var(--mg-pdim);}'
    /* GAME OVER letterbox bars */
    + '.mgsg-screen.fail::before,.mgsg-screen.fail::after{content:"";position:absolute;left:0;right:0;height:13%;background:#03060d;}'
    + '.mgsg-screen.fail::before{top:0}.mgsg-screen.fail::after{bottom:0}'
    + '.mgsg-screen .lost{font-size:clamp(26px,7vw,52px);color:var(--mg-paper);letter-spacing:6px;margin:0;'
    + 'text-shadow:0 0 14px rgba(233,231,226,.3);animation:mgsgFlicker .8s steps(2) 2;}'
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
    + '.mgsg-flash{position:absolute;inset:0;background:var(--mg-paper);opacity:0;pointer-events:none;}'
    + '.mgsg-flash.on{animation:mgsgFlash .5s ease-out;}'
    /* codec subtitle toast — visible mirror of the aria-live announcements */
    /* one line (nowrap + ellipsis: the aria-live region keeps the full text), so it never wraps into a
       block over the floor; on desktop it sits on the outer wall row at the stage's foot */
    + '.mgsg-toast{position:absolute;left:50%;bottom:10px;z-index:6;max-width:88%;padding:4px 12px;'
    + 'background:var(--mg-toastbg);border:1px solid var(--mg-edge);border-radius:3px;'
    + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:16px;'
    + 'color:var(--mg-hi);font-size:12px;letter-spacing:1px;text-align:center;pointer-events:none;'
    + 'opacity:0;transform:translateX(-50%) translateY(4px);transition:opacity .18s ease,transform .18s ease;}'
    + '.mgsg-toast.show{opacity:1;transform:translateX(-50%);}'
    /* touch (the deck covers the stage foot) and narrow stages: a slim line on the TOP wall row,
       between the radar and the exit, clear of every floor tile */
    + '.mgsg-touch .mgsg-toast{top:1px;bottom:auto;max-width:62%;padding:0 8px;font-size:9.5px;line-height:12px;letter-spacing:.5px;}'
    + '@media (max-width:520px){.mgsg-toast{top:1px;bottom:auto;max-width:62%;padding:0 8px;font-size:9.5px;line-height:12px;letter-spacing:.5px;}}'
    /* CRT roll bar + alarm hazard stripes + power-on sweep (compositor-only) */
    + '.mgsg-roll{position:absolute;left:0;right:0;top:-30%;height:26%;pointer-events:none;z-index:6;'
    + 'background:linear-gradient(180deg,transparent,rgba(184,198,214,.045) 50%,transparent);'
    + 'animation:mgsgRoll 7s linear infinite;}'
    + '.mgsg-hazard{position:absolute;left:0;width:200%;height:5px;z-index:6;pointer-events:none;display:none;'
    + 'background:repeating-linear-gradient(45deg,rgba(233,231,226,.5) 0 10px,transparent 10px 20px);}'
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
    /* Portrait touch screens (phones and tablets): overlaid on the letterboxed stage the touch controls
       covered ~72% of the playfield. Drop them below the stage into real frame
       padding (frame is overflow:hidden, so negative bottom alone would clip);
       the overlay already scrolls + margin:auto safe-centers on short
       viewports, so the taller frame degrades gracefully. The toast stays on the
       top wall row. Must sit AFTER the base .mgsg-pad/.mgsg-acts/
       .mgsg-touch .mgsg-toast rules — equal specificity, source order wins. */
    + '@media (orientation:portrait){'
    + '.mgsg-touch .mgsg-frame{padding-bottom:172px;}'
    + '.mgsg-touch .mgsg-pad{bottom:-160px;}'
    + '.mgsg-touch .mgsg-acts{bottom:-133px;}'
    + '.mgsg-touch .mgsg-screen{bottom:-172px;justify-content:center;justify-content:safe center;overflow-y:auto;}'
    + '}'
    + '.mgsg-touch.mgsg-scr .mgsg-pad,.mgsg-touch.mgsg-scr .mgsg-acts{visibility:hidden;}'
    + '@media (prefers-reduced-motion:reduce){.mgsg-screen .go{animation:none}.mgsg-overlay{transition:none}.mgsg-stage{transition:none}'
    + '.mgsg-stage.alarm::before,.mgsg-bar .f::before,.mgsg-stbadge.alert,.mgsg-lifebar.low i,.mgsg-wave i,'
    + '.mgsg-screen .lost,.mgsg-screen .rank,.mgsg-screen .mgsg-rec{animation:none}'
    + '.mgsg-overlay.in .mgsg-frame,.mgsg-overlay.out .mgsg-frame{animation:none}.mgsg-fstrip i{transition:none}'
    + '.mgsg-roll{display:none}.mgsg-stage.alarm .mgsg-hazard{animation:none}.mgsg-canvas.on{animation:none}'
    + '.mgsg-screen.show .mgsg-stats span{animation:none}.mgsg-toast{transition:none}'
    + '.mgsg-screen{transition:opacity .22s ease;transform:none}'
    + '.mgsg-screen.show{animation:none;clip-path:none}.mgsg-screen.show .mgsg-beam{animation:none}}'
    + '@keyframes mgsgConnect{0%{transform:scale(.55,.006);opacity:.5}45%{transform:scale(1,.006);opacity:1}100%{transform:none}}'
    + '@keyframes mgsgDisconnect{0%{transform:none}55%{transform:scale(1,.006);opacity:1}100%{transform:scale(0,.006);opacity:0}}'
    + '@keyframes mgsgBlink{50%{opacity:.25}}@keyframes mgsgGoBlink{50%{opacity:.55}}@keyframes mgsgFlash{from{opacity:.3}to{opacity:0}}'
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
  var toastEl = null, toastTimer = null, typeTimer = null;
  var radarMap = null;   // radar minimap wall layout (baked in buildBg at radar scale)
  var seaGlints = null;  // drifting glints for the open-water rows (dock channel, bridge edges), baked per level
  var lastWide = null;   // canvas HUD on/off last frame (toggles .mgsg-wide once per change)
  var mistSprite = null; // one soft fog blob, baked once; the sea ops draw it a few times per frame (no per-frame gradient)
  var colCtx = null, colBase = null, colTimer = null, colFrame = 0;   // the Colonel's codec portrait (48 px canvas) + its glitch clock
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
    overlay.setAttribute('aria-label', 'Big Shell — a hidden stealth mini-game');
    if (coarsePointer) overlay.classList.add('mgsg-touch');

    overlay.innerHTML =
      '<div class="mgsg-frame" tabindex="-1">'
      + '<div class="mgsg-bar"><span class="t">&#9658; BIG SHELL</span><span class="f">140.85</span>'
      + '<button type="button" class="mgsg-btn" data-act="mute" title="Toggle sound">SND ON</button>'
      + '<button type="button" class="mgsg-btn" data-act="close" title="Disconnect (Esc)">&times; EXIT</button></div>'
      + '<div class="mgsg-hud"><span class="mgsg-stbadge" data-hud="state">NORMAL</span>'
      + '<span class="mgsg-life">LIFE <span class="mgsg-lifebar"><i></i></span></span>'
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
      + '<h2 data-scr="title">BIG SHELL</h2>'
      /* codec call row (title + briefing only): Raiden | wave + frequency strip | the Colonel.
         Decorative — announce() carries the same information to the aria-live region. */
      + '<div class="mgsg-call" aria-hidden="true">'
      + '<div class="mgsg-port"><div class="px raiden"><i></i><b></b></div><span class="who">RAIDEN</span></div>'
      + '<div class="mgsg-cc"><span class="mgsg-wave"><i></i><i></i><i></i><i></i><i></i></span>'
      + '<div class="mgsg-fstrip"><i data-scr="needle"></i><b style="left:0">140</b><b style="left:50%">141</b><b style="left:100%">142</b></div>'
      + '<span class="mgsg-fnum" data-scr="fnum">140.85</span></div>'
      + '<div class="mgsg-port"><div class="px" data-scr="them"><canvas width="48" height="48"></canvas></div><span class="who" data-scr="who">COLONEL</span></div>'
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
      + '<button data-act2="knock" tabindex="-1">KNOCK</button>'
      + '<button data-act2="cqc" tabindex="-1">CHOKE</button></div>'
      + '</div>'
      + '<div class="mgsg-foot"><span><kbd>WASD</kbd> move</span><span><kbd>Shift</kbd> run</span>'
      + '<span><kbd>B</kbd> box</span><span><kbd>K</kbd> knock</span><span><kbd>F</kbd> choke</span>'
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
    colCtx = scrPortThem.querySelector('canvas').getContext('2d');
    colBase = buildColonel(); drawColonel(false);

    buildSprites();
    sizeCanvas();
    buildStaticGrads();

    $('[data-act="close"]').addEventListener('click', closeGame);
    muteBtn.addEventListener('click', function (e) {
      unlockAudio();  // real gesture — resume a policy-suspended AudioContext
      muted = !muted; muteBtn.textContent = muted ? 'SND OFF' : 'SND ON';
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
  // the frame is up to 1080 CSS px wide (and height-capped): back the 640x384 canvas with enough
  // device pixels for that width so the 8 px HUD type stays sharp. Quarter steps, capped at 2.
  function targetDpr() {
    var r = window.devicePixelRatio || 1, vw = window.innerWidth || W, vh = window.innerHeight || H;
    var css = Math.min(vw * 0.92, 1080, Math.max(200, vh - 140) * W / H);
    return Math.round(Math.min(2, Math.max(r, css * r / W)) * 4) / 4;
  }
  function sizeCanvas() {
    dpr = targetDpr();
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;  // canvas resize resets state — keep pixel art crisp
    if (walls) buildBg();  // rebuild static layer at the new DPR (first open: no level yet)
  }
  // gradients that never change shape: player light pool (drawn under a translate,
  // so it is built at the origin) and the full-strength dark vignette (drawn through
  // globalAlpha, which scales it for both taking-fire flashes and low-life pulses:
  // damage DIMS the edges of the world, it never tints them). Plus the mist sprite.
  function buildStaticGrads() {
    poolGrad = ctx.createRadialGradient(0, 0, 6, 0, 0, 130);
    poolGrad.addColorStop(0, 'rgba(184,198,214,0.10)'); poolGrad.addColorStop(1, 'rgba(184,198,214,0)');
    vigGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.8);
    vigGrad.addColorStop(0, 'rgba(2,4,10,0)'); vigGrad.addColorStop(1, 'rgba(2,4,10,1)');
    // mist: a 192x64 soft ellipse of silver fog, baked once (drawn scaled + alpha'd per frame)
    mistSprite = document.createElement('canvas'); mistSprite.width = 192; mistSprite.height = 64;
    var m = mistSprite.getContext('2d'); m.setTransform(1, 0, 0, 1 / 3, 0, 0);
    var mg = m.createRadialGradient(96, 96, 4, 96, 96, 94);
    mg.addColorStop(0, 'rgba(208,214,222,0.9)'); mg.addColorStop(0.55, 'rgba(208,214,222,0.35)'); mg.addColorStop(1, 'rgba(208,214,222,0)');
    m.fillStyle = mg; m.fillRect(0, 0, 192, 192);
  }

  /* ===================== the Colonel's codec portrait =====================
     A 48 px head-and-shoulders silhouette, ordered-dithered (4x4 Bayer) in steel
     blue, lit from the upper left; baked once. glitchColonel() runs only while a
     codec call is on screen (~9 fps, a setInterval, not the game loop): one or two
     rows tear sideways and a few static lines cross it; every ~3 s the signal breaks
     up hard for a third of a second. Reduced motion: the still, clean frame. */
  var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function buildColonel() {
    var S = 48, cv = document.createElement('canvas'); cv.width = cv.height = S;
    var g = cv.getContext('2d'), img = g.createImageData(S, S), d = img.data, x, y;
    for (y = 0; y < S; y++) for (x = 0; x < S; x++) {
      var hx = (x - 24) / 9.5, hy = (y - 19) / 12, inHead = hx * hx + hy * hy <= 1;
      var sx = (x - 24) / 23, sy = (y - 52) / 17, inBody = y > 34 && sx * sx + sy * sy <= 1;
      var inNeck = y >= 28 && y <= 38 && Math.abs(x - 24) <= 5;
      var lum;
      if (inHead) {
        lum = 0.98 - 0.6 * Math.hypot((x - 19) / 12, (y - 14) / 14);
        if (y < 11) lum *= 0.5;                                                     // the hairline
        if (y >= 17 && y <= 19 && Math.abs(x - 24) >= 2 && Math.abs(x - 24) <= 7) lum *= 0.3;   // the brow / eye shadow
        if (y >= 26) lum *= 0.7;                                                    // the jaw falls into shade
      } else if (inNeck) lum = 0.26;
      else if (inBody) lum = 0.66 - 0.5 * Math.hypot((x - 14) / 30, (y - 38) / 18) - (Math.abs(x - 24) < 3 && y < 44 ? 0.3 : 0);   // a collar line
      else lum = 0;
      var on = lum * 16 > BAYER4[(y & 3) * 4 + (x & 3)] + 0.5, i = (y * S + x) * 4;
      d[i] = on ? 143 : 8; d[i + 1] = on ? 166 : 14; d[i + 2] = on ? 192 : 26; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
  function drawColonel(heavy) {
    var g = colCtx, S = 48, i, n;
    if (!g) return;
    g.drawImage(colBase, 0, 0);
    if (reduceMotion) return;
    n = heavy ? 6 : (Math.random() < 0.55 ? 1 : 2);
    for (i = 0; i < n; i++) {   // torn rows: a band redrawn shifted sideways
      var y = (Math.random() * S) | 0, h = 1 + ((Math.random() * (heavy ? 6 : 3)) | 0), dx = ((Math.random() - 0.5) * (heavy ? 20 : 6)) | 0;
      g.fillStyle = '#08101c'; g.fillRect(0, y, S, h);
      g.drawImage(colBase, 0, y, S, h, dx, y, S, h);
    }
    n = heavy ? 16 : 3;
    for (i = 0; i < n; i++) {   // static lines
      var ry = (Math.random() * S) | 0;
      g.fillStyle = 'rgba(184,198,214,' + (0.15 + Math.random() * 0.5).toFixed(2) + ')';
      for (var sx2 = 0; sx2 < S; sx2 += 2) if (Math.random() < 0.5) g.fillRect(sx2, ry, 2, 1);
    }
  }
  function glitchColonel(on) {
    if (colTimer) { clearInterval(colTimer); colTimer = null; }
    drawColonel(false);
    if (!on || reduceMotion) return;
    colFrame = 0;
    colTimer = setInterval(function () { colFrame++; drawColonel(colFrame % 27 < 3); }, 110);
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
    exitGlowGrad.addColorStop(0, 'rgba(184,198,214,1)'); exitGlowGrad.addColorStop(1, 'rgba(184,198,214,0)');
    if (intel) {
      intelHaloGrad = ctx.createRadialGradient(intel.x, intel.y, 2, intel.x, intel.y, 18);
      intelHaloGrad.addColorStop(0, 'rgba(184,198,214,1)'); intelHaloGrad.addColorStop(1, 'rgba(184,198,214,0)');
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
  // deterministic 0..1 hash for baked scatter (glints, lugs) — no Math.random,
  // so every rebuild (DPR change, retry) bakes the identical floor
  function hash01(n) { var v = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); }
  // per-op floor dressing, drawn under the walls (they fully cover their tiles)
  function bakeFloorIdentity(b) {
    var kind = level.floor, i, x, y, cx = W / 2, cy = H / 2;
    if (kind === 'dock') {
      // Strut A's deck: treadplate — raised lugs every 8 px, alternating diagonals,
      // each with a 1 px shadow under its lit edge
      b.lineWidth = 1; b.beginPath();
      for (y = 4; y < H; y += 8) for (x = 4 + ((y >> 3) & 1) * 4; x < W; x += 8) {
        if (((x + y) >> 3) & 1) { b.moveTo(x - 2, y + 1.5); b.lineTo(x + 2, y - 1.5); } else { b.moveTo(x - 2, y - 1.5); b.lineTo(x + 2, y + 1.5); }
      }
      b.save(); b.translate(0, 1); b.strokeStyle = 'rgba(0,0,0,0.5)'; b.stroke(); b.restore();
      b.strokeStyle = 'rgba(184,198,214,0.11)'; b.stroke();
      // bolted deck plates: seams every 4 tiles, rivets along them
      b.beginPath();
      for (x = TILE * 4; x < W; x += TILE * 4) { b.moveTo(x + .5, 0); b.lineTo(x + .5, H); }
      for (y = TILE * 3; y < H; y += TILE * 3) { b.moveTo(0, y + .5); b.lineTo(W, y + .5); }
      b.strokeStyle = 'rgba(0,0,0,0.45)'; b.stroke();
      b.fillStyle = 'rgba(184,198,214,0.12)';
      for (x = TILE * 4; x < W; x += TILE * 4) for (y = 6; y < H; y += 12) b.fillRect(x - 2, y, 1, 1);
      // wet sheen: long faint streaks laid down by the wind (it blows from the left)
      b.strokeStyle = 'rgba(184,198,214,0.035)'; b.lineWidth = 2; b.beginPath();
      for (i = 0; i < 14; i++) { x = hash01(500 + i * 2) * W; y = hash01(501 + i * 2) * H; var len = 70 + hash01(700 + i) * 110; b.moveTo(x, y); b.lineTo(x + len, y + len * 0.12); }
      b.stroke();
      // drain grates: the night sea showing through the deck
      var drains = [[6, 7], [13, 1], [15, 10]];
      for (i = 0; i < drains.length; i++) {
        var dx0 = drains[i][0] * TILE + 6, dy0 = drains[i][1] * TILE + 10;
        b.fillStyle = '#030710'; b.fillRect(dx0, dy0, 20, 12);
        b.fillStyle = 'rgba(143,166,192,0.14)'; b.fillRect(dx0 + 3 + i * 3, dy0 + 5, 7, 1);
        b.fillStyle = 'rgba(124,138,156,0.5)'; for (x = dx0 + 2; x < dx0 + 20; x += 3) b.fillRect(x, dy0, 1, 12);
        b.strokeStyle = 'rgba(124,138,156,0.45)'; b.lineWidth = 1; b.strokeRect(dx0 + .5, dy0 + .5, 19, 11);
      }
      // the floor's edge over the water channel: dim-paper chevrons along the last floor row
      var hy = (ROWS - 1) * TILE - 5;
      b.save(); b.beginPath(); b.rect(TILE, hy, W - TILE * 2, 5); b.clip();
      b.fillStyle = 'rgba(0,0,0,0.35)'; b.fillRect(TILE, hy, W - TILE * 2, 5);
      b.strokeStyle = 'rgba(195,203,213,0.3)'; b.lineWidth = 4; b.beginPath();
      for (x = TILE - 8; x < W; x += 12) { b.moveTo(x, hy + 6); b.lineTo(x + 6, hy - 1); }
      b.stroke(); b.restore();
      // night floodlight pools (baked radial gradients — never per-frame)
      var pools = [[px(4), TILE, 110], [px(15), H - TILE, 100], [W - TILE, px(6), 80]];
      for (i = 0; i < pools.length; i++) {
        var fl = b.createRadialGradient(pools[i][0], pools[i][1], 4, pools[i][0], pools[i][1], pools[i][2]);
        fl.addColorStop(0, 'rgba(210,220,232,0.10)'); fl.addColorStop(1, 'rgba(210,220,232,0)');
        b.fillStyle = fl; b.fillRect(pools[i][0] - pools[i][2], pools[i][1] - pools[i][2], pools[i][2] * 2, pools[i][2] * 2);
      }
    } else if (kind === 'bridge') {
      // the AB connecting bridge: the night sea under the whole walk ...
      b.fillStyle = '#030812'; b.fillRect(0, 0, W, H);
      for (i = 0; i < 90; i++) {   // swell glints, laid along the wind
        x = hash01(i * 5) * W; y = hash01(i * 5 + 1) * H;
        b.fillStyle = 'rgba(143,166,192,' + (0.05 + hash01(i * 5 + 3) * 0.11).toFixed(3) + ')';
        b.fillRect(x | 0, y | 0, (6 + hash01(i * 5 + 2) * 24) | 0, 1);
      }
      // ... seen through a catwalk grate (1 px steel every 4 px) ...
      b.beginPath();
      for (x = 0.5; x < W; x += 4) { b.moveTo(x, 0); b.lineTo(x, H); }
      for (y = 0.5; y < H; y += 4) { b.moveTo(0, y); b.lineTo(W, y); }
      b.strokeStyle = 'rgba(96,110,128,0.17)'; b.lineWidth = 1; b.stroke();
      // ... on heavier stringers every 2 tiles across the span
      b.beginPath();
      for (x = TILE * 2; x < W; x += TILE * 2) { b.moveTo(x + 1, 0); b.lineTo(x + 1, H); }
      b.strokeStyle = 'rgba(130,144,160,0.24)'; b.lineWidth = 2; b.stroke();
      // handrails along the inner edges of the outer walls, stanchions every 24 px
      b.fillStyle = 'rgba(195,203,213,0.22)';
      b.fillRect(TILE, TILE + 1, W - 2 * TILE, 2); b.fillRect(TILE, H - TILE - 3, W - 2 * TILE, 2);
      for (x = TILE + 8; x < W - TILE; x += 24) { b.fillRect(x, TILE + 1, 2, 5); b.fillRect(x, H - TILE - 6, 2, 5); }
    } else if (kind === 'core') {
      // catwalk grating: fine cross-hatch
      b.strokeStyle = 'rgba(143,166,192,0.035)'; b.lineWidth = 1; b.beginPath();
      for (x = -H; x < W; x += 8) { b.moveTo(x, 0); b.lineTo(x + H, H); b.moveTo(x + H, 0); b.lineTo(x, H); }
      b.stroke();
      // composite panel seams every 2 tiles + rivets at the joints
      b.strokeStyle = 'rgba(0,0,0,0.28)'; b.beginPath();
      for (x = TILE * 2; x < W; x += TILE * 2) { b.moveTo(x + .5, 0); b.lineTo(x + .5, H); }
      for (y = TILE * 2; y < H; y += TILE * 2) { b.moveTo(0, y + .5); b.lineTo(W, y + .5); }
      b.stroke();
      b.fillStyle = 'rgba(184,198,214,0.12)';
      for (x = TILE * 2; x < W; x += TILE * 2) for (y = TILE * 2; y < H; y += TILE * 2) b.fillRect(x - 1, y - 1, 3, 3);
      // dim-paper hazard chevrons on the floor cells of the row in front of the
      // camera (its own row is wall/corridor) — clipped to floor tiles only
      var cam = (level.cameras || [])[0];
      if (cam && cam.t[1] + 1 < ROWS - 1) {
        var cr = cam.t[1] + 1, c0 = Math.max(1, cam.t[0] - 3), c1 = Math.min(COLS - 2, cam.t[0] + 3), yb = cr * TILE, cc, any = false;
        b.save(); b.beginPath();
        for (cc = c0; cc <= c1; cc++) if (!walls[cr][cc]) { b.rect(cc * TILE, yb + 4, TILE, TILE - 8); any = true; }
        if (any) {
          b.clip();
          b.strokeStyle = 'rgba(195,203,213,0.26)'; b.lineWidth = 3; b.beginPath();
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
    // on the bridge the exit opens into the strut (right), never over the water
    var dirs = level.floor === 'bridge' ? [[1, 0], [-1, 0], [0, -1], [0, 1]] : [[0, -1], [0, 1], [-1, 0], [1, 0]], d = null, i;
    for (i = 0; i < dirs.length; i++) {
      var nc = ec + dirs[i][0], nr = er + dirs[i][1];
      if (nc >= 0 && nr >= 0 && nc < COLS && nr < ROWS && walls[nr][nc]) { d = dirs[i]; break; }
    }
    if (!d) return;
    var wx = (ec + d[0]) * TILE, wy = (er + d[1]) * TILE, vert = d[1] !== 0, ox, oy, ow, oh;
    if (vert) { ox = wx + 8; ow = TILE - 16; oh = TILE - 4; oy = d[1] < 0 ? wy + 4 : wy; }
    else { oy = wy + 8; oh = TILE - 16; ow = TILE - 4; ox = d[0] < 0 ? wx + 4 : wx; }
    b.fillStyle = '#040a16'; b.fillRect(ox, oy, ow, oh);   // recessed opening
    // far-end light strip + two dim treads stepping toward the threshold
    b.fillStyle = 'rgba(184,198,214,0.55)';
    if (vert) b.fillRect(ox + 2, d[1] < 0 ? oy : oy + oh - 3, ow - 4, 3);
    else b.fillRect(d[0] < 0 ? ox : ox + ow - 3, oy + 2, 3, oh - 4);
    b.fillStyle = 'rgba(184,198,214,0.10)';
    for (i = 1; i <= 2; i++) {
      if (vert) b.fillRect(ox + 3, d[1] < 0 ? oy + 3 + i * 8 : oy + oh - 4 - i * 8, ow - 6, 1);
      else b.fillRect(d[0] < 0 ? ox + 3 + i * 8 : ox + ow - 4 - i * 8, oy + 3, 1, oh - 6);
    }
    var x0 = ox + .5, y0 = oy + .5, x1 = ox + ow - .5, y1 = oy + oh - .5;
    b.strokeStyle = 'rgba(184,198,214,0.7)'; b.lineWidth = 1; b.beginPath();
    if (vert && d[1] < 0) { b.moveTo(x0, y1 + 1); b.lineTo(x0, y0); b.lineTo(x1, y0); b.lineTo(x1, y1 + 1); }
    else if (vert) { b.moveTo(x0, y0 - 1); b.lineTo(x0, y1); b.lineTo(x1, y1); b.lineTo(x1, y0 - 1); }
    else if (d[0] < 0) { b.moveTo(x1 + 1, y0); b.lineTo(x0, y0); b.lineTo(x0, y1); b.lineTo(x1 + 1, y1); }
    else { b.moveTo(x0 - 1, y0); b.lineTo(x1, y0); b.lineTo(x1, y1); b.lineTo(x0 - 1, y1); }
    b.stroke();
    // light spill onto the exit tile from the threshold (the shared edge), clipped to the tile
    var tx = px(ec) + d[0] * TILE / 2, ty = px(er) + d[1] * TILE / 2, sr = TILE * 1.1;
    var sp = b.createRadialGradient(tx, ty, 2, tx, ty, sr);
    sp.addColorStop(0, 'rgba(184,198,214,0.42)'); sp.addColorStop(0.55, 'rgba(184,198,214,0.13)'); sp.addColorStop(1, 'rgba(184,198,214,0)');
    b.save(); b.beginPath(); b.rect(ec * TILE, er * TILE, TILE, TILE); b.clip();
    b.fillStyle = sp; b.fillRect(tx - sr, ty - sr, sr * 2, sr * 2);
    b.restore();
  }
  // open-water rows: the dock's channel (row 11), the bridge's two edges (rows 0 and 11)
  function isWaterRow(r) {
    return (level.floor === 'dock' && r === ROWS - 1) || (level.floor === 'bridge' && (r === 0 || r === ROWS - 1));
  }
  // the bridge's inner 2x2 blocks are cargo crates (the outer ring is the struts / water)
  function isCrate(c, r) {
    return level.floor === 'bridge' && c > 0 && c < COLS - 1 && r > 0 && r < ROWS - 1 && walls[r][c];
  }
  function bakeWaterRow(b, r) {
    var y0 = r * TILE, x0 = TILE, w = W - 2 * TILE, x, i, top = r === 0;
    b.fillStyle = '#02060e'; b.fillRect(x0, y0, w, TILE);
    // long low swells (static; seaGlints drifts the bright ones per frame)
    b.fillStyle = 'rgba(143,166,192,0.05)';
    for (i = 0; i < 16; i++) b.fillRect(x0 + (hash01(900 + i + r) * w) | 0, y0 + 4 + ((hash01(940 + i + r) * (TILE - 12)) | 0), (20 + hash01(980 + i) * 50) | 0, 1);
    if (level.floor === 'bridge') {
      // handrail on the deck side: a paper-dim bar, posts every 2 tiles, the deck's shadow on the water
      var ry = top ? y0 + TILE - 4 : y0 + 2;
      b.fillStyle = 'rgba(0,0,0,0.45)'; b.fillRect(x0, top ? y0 + TILE - 9 : y0 + 4, w, 5);
      b.fillStyle = 'rgba(195,203,213,0.42)'; b.fillRect(x0, ry, w, 2);
      for (x = x0 + 2 * TILE; x < x0 + w; x += 2 * TILE) {
        b.fillStyle = 'rgba(195,203,213,0.55)'; b.fillRect(x - 1, top ? ry - 5 : ry, 3, 7);
        b.fillStyle = 'rgba(0,0,0,0.5)'; b.fillRect(x - 1, top ? ry - 6 : ry + 7, 3, 1);
      }
    } else {
      // the dock edge: a steel lip and a bollard every 4 tiles
      b.fillStyle = '#3a4658'; b.fillRect(x0, y0, w, 3);
      b.fillStyle = 'rgba(0,0,0,0.5)'; b.fillRect(x0, y0 + 3, w, 3);
      for (x = x0 + 2 * TILE; x < x0 + w; x += 4 * TILE) {
        b.fillStyle = '#566478'; b.fillRect(x - 4, y0 - 2, 8, 7);
        b.fillStyle = 'rgba(195,203,213,0.5)'; b.fillRect(x - 4, y0 - 2, 8, 1);
      }
    }
  }
  // cargo crates on the bridge: corrugated steel, a lid seam, corner castings, one stencil line
  function bakeCrates(b) {
    var r, c, i;
    for (r = 1; r < ROWS - 1; r++) for (c = 1; c < COLS - 1; c++) {
      if (!isCrate(c, r) || isCrate(c - 1, r) || isCrate(c, r - 1)) continue;   // top-left tile of a block
      var bw = 0, bh = 0;
      while (isCrate(c + bw, r)) bw++;
      while (isCrate(c, r + bh)) bh++;
      var x0 = c * TILE, y0 = r * TILE, w = bw * TILE, h = bh * TILE, fh = 7, top = h - fh;
      b.fillStyle = 'rgba(0,0,0,0.42)'; b.fillRect(x0 + 2, y0 + h, w, 5);           // drop shadow
      b.fillStyle = '#2a3546'; b.fillRect(x0, y0, w, top);                         // lid
      b.fillStyle = '#131b28'; b.fillRect(x0, y0 + top, w, fh);                    // front face
      b.fillStyle = 'rgba(0,0,0,0.35)';
      for (i = 4; i < w; i += 4) b.fillRect(x0 + i, y0 + top, 1, fh);             // ribs on the face
      for (i = 3; i < w - 2; i += 4) {                                             // corrugation on the lid
        b.fillStyle = 'rgba(0,0,0,0.26)'; b.fillRect(x0 + i, y0 + 2, 1, top - 4);
        b.fillStyle = 'rgba(192,202,214,0.07)'; b.fillRect(x0 + i + 1, y0 + 2, 1, top - 4);
      }
      var sy = y0 + (top >> 1);                                                    // lid seam
      b.fillStyle = 'rgba(0,0,0,0.55)'; b.fillRect(x0 + 1, sy, w - 2, 1);
      b.fillStyle = 'rgba(192,202,214,0.14)'; b.fillRect(x0 + 1, sy + 1, w - 2, 1);
      b.fillStyle = 'rgba(195,203,213,0.32)';                                      // stencil line
      for (i = 0; i < 5; i++) b.fillRect(x0 + 8 + i * 5, y0 + 7, 3, 2);
      b.fillStyle = '#566478';                                                     // corner castings
      b.fillRect(x0, y0, 4, 4); b.fillRect(x0 + w - 4, y0, 4, 4); b.fillRect(x0, y0 + top - 4, 4, 4); b.fillRect(x0 + w - 4, y0 + top - 4, 4, 4);
      b.strokeStyle = 'rgba(138,156,180,0.45)'; b.lineWidth = 1; b.strokeRect(x0 + .5, y0 + .5, w - 1, h - 1);
      b.fillStyle = 'rgba(184,198,214,0.22)'; b.fillRect(x0 + 1, y0, w - 2, 1);    // lit top rim
    }
  }
  // drifting glints for the water rows: a transparent strip (W + 8 by one tile), drawn
  // once per water row per frame at a 1-2 px sine offset — one drawImage each
  function bakeSeaGlints() {
    seaGlints = null;
    if (level.floor !== 'dock' && level.floor !== 'bridge') return;
    seaGlints = document.createElement('canvas');
    seaGlints.width = Math.ceil((W + 8) * dpr); seaGlints.height = Math.ceil(TILE * dpr);
    var g = seaGlints.getContext('2d'), i; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (i = 0; i < 26; i++) {
      g.fillStyle = 'rgba(184,198,214,' + (0.10 + hash01(i * 7 + 3) * 0.16).toFixed(3) + ')';
      g.fillRect((hash01(i * 7) * (W + 8)) | 0, 9 + ((hash01(i * 7 + 1) * 13) | 0), (4 + hash01(i * 7 + 2) * 16) | 0, 1);
    }
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
    bakeSeaGlints();
    // exit pad, baked (visible from spawn — chevron hatch + frame)
    var ec = level.exit[0], er = level.exit[1], ex0 = ec * TILE, ey0 = er * TILE;
    b.save(); b.beginPath(); b.rect(ex0 + 2, ey0 + 2, TILE - 4, TILE - 4); b.clip();
    b.strokeStyle = 'rgba(184,198,214,0.14)'; b.lineWidth = 3; b.beginPath();
    for (var sD = -TILE; sD < TILE; sD += 8) { b.moveTo(ex0 + sD, ey0 + TILE); b.lineTo(ex0 + sD + TILE, ey0); }
    b.stroke(); b.restore();
    b.strokeStyle = 'rgba(184,198,214,0.25)'; b.lineWidth = 1;
    b.strokeRect(ex0 + 2.5, ey0 + 2.5, TILE - 5, TILE - 5);
    // faint tile grid
    b.strokeStyle = C.grid; b.lineWidth = 1; b.beginPath();
    for (var x = TILE; x < W; x += TILE) { b.moveTo(x + .5, 0); b.lineTo(x + .5, H); }
    for (var y = TILE; y < H; y += TILE) { b.moveTo(0, y + .5); b.lineTo(W, y + .5); }
    b.stroke();
    // open water instead of a wall block: the dock's channel (bottom row) and both
    // edges of the bridge (top + bottom rows) — still impassable, drawn as night sea
    for (r = 0; r < ROWS; r++) if (isWaterRow(r)) bakeWaterRow(b, r);
    // walls: neighbor-aware bevel + hatching + drop shadow
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      if (!walls[r][c]) continue;
      if (isWaterRow(r) && c > 0 && c < COLS - 1) continue;
      if (isCrate(c, r)) continue;
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
    if (level.floor === 'bridge') bakeCrates(b);
    bakeDoorway(b, ec, er);
    // baked ambient light: a faint moonlit bloom at center, dark corners (one-time cost)
    var lg = b.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.62);
    lg.addColorStop(0, 'rgba(164,182,204,0.05)');
    lg.addColorStop(0.6, 'rgba(0,0,0,0)');
    lg.addColorStop(1, 'rgba(0,0,0,0.32)');
    b.fillStyle = lg; b.fillRect(0, 0, W, H);
    // radar minimap: the wall layout at radar scale, baked once — drawRadar()
    // blits it fixed in the box (one drawImage, no per-frame tile loop)
    var mw = Math.ceil(W * RADAR_SC), mh = Math.ceil(H * RADAR_SC), ts = TILE * RADAR_SC;
    radarMap = document.createElement('canvas');
    radarMap.width = Math.ceil(mw * dpr); radarMap.height = Math.ceil(mh * dpr);
    var m = radarMap.getContext('2d'); m.setTransform(dpr, 0, 0, dpr, 0, 0);
    m.fillStyle = 'rgba(8,16,30,0.72)'; m.fillRect(0, 0, mw, mh);
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      if (!walls[r][c]) continue;
      m.fillStyle = 'rgba(143,166,192,0.42)'; m.fillRect(c * ts, r * ts, ts + 0.5, ts + 0.5);
      if (r > 0 && !walls[r - 1][c]) { m.fillStyle = 'rgba(184,198,214,0.7)'; m.fillRect(c * ts, r * ts, ts + 0.5, 1); }
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
      if (boxed) { if (!boxHinted) { boxHinted = true; announce('Leave the box to take the intel.'); } }
      else { intelGot = true; sfxPickup(); addPulse(intel.x, intel.y, '233,231,226'); announce('Intel acquired. Reach the exit.'); updateHud(); }
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
        // taking-fire feedback: render() draws tracers + a dark vignette while
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
      // a paper-white sting on the spot — the "!" alert moment
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
    if (alertPhase === 'alert' || alertPhase === 'evasion') { announce('No use — already alerted.'); return; }
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
    if (best) { cqcCD = CQC_CD; best.down = true; best.seeing = false; best.spotTimer = 0; addPulse(best.x, best.y, '184,198,214'); sfxCQC(); announce('Guard subdued.'); }
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

  // the one countdown readout (whole seconds, rounded up), shared by the DOM badge and the canvas window
  function phaseSecs() { return Math.ceil(Math.max(0, alertPhase === 'evasion' ? evasionTimer : cautionTimer)); }
  function updateHud() {
    var ph = alertPhase;
    stateBadge.className = 'mgsg-stbadge' + (ph !== 'normal' ? ' ' + ph : '');
    stateBadge.textContent = ph === 'alert' ? '! ALERT' : ph === 'evasion' ? 'EVASION ' + phaseSecs()
      : ph === 'caution' ? 'CAUTION ' + phaseSecs() : 'NORMAL';
    // write the bar width only when the rounded value changes — render() reads
    // canvas.clientWidth each frame, and a dirty style every frame would force a layout
    var lwid = (life * 100).toFixed(0) + '%';
    if (lwid !== lastLifeW) { lastLifeW = lwid; lifeFill.style.width = lwid; }
    // healthy = steel blue; warning = cool grey; critical = paper (blinking)
    var lcol = life > 0.5 ? 'var(--mg-text)' : life > 0.25 ? 'var(--mg-pdim)' : 'var(--mg-paper)';
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
  // radar minimap geometry: a 90x54 bezelled rectangle in the top-left corner,
  // the room's own 5:3 shape, so the whole room fills the box edge to edge
  // (640x384 at 54/384 = 90x54, nothing wasted). The bezel ends at y 63, inside
  // row 1; the RADAR label sits to the box's right, under the LIFE window.
  var RADAR_X = 6, RADAR_Y = 5, RADAR_W = 90, RADAR_H = 54, RADAR_SC = 54 / 384;
  var RADAR_OX = RADAR_X + (RADAR_W - W * RADAR_SC) / 2, RADAR_OY = RADAR_Y + (RADAR_H - H * RADAR_SC) / 2;
  var DASH_CALM = [4, 3], DASH_NONE = [];  // hoisted — no per-frame arrays
  function drawSpriteImg(img, x, y, angle, bobPhase) {
    ctx.save(); ctx.translate(x, y);
    if (angle !== null) ctx.rotate(Math.round(angle / STEP8) * STEP8);
    if (bobPhase !== null && !reduceMotion) ctx.translate(0, Math.sin(bobPhase) * 1.2);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
  function drawCone(d, roomAlert) {
    // calm = steel-blue light, dashed edge; suspicious / caution = cool grey; hostile =
    // paper-white searchlight (no red: danger reads as hard white light)
    var rgb, edgeA, calm = false;
    if (roomAlert || d.seeing) {
      rgb = '233,231,226';
      // edge strobes while this watcher has live eyes on the player
      edgeA = d.seeing && !reduceMotion ? 0.45 + 0.3 * Math.abs(Math.sin(elapsed * 9)) : 0.6;
    }
    else if ((d.spotTimer || 0) > 0 || alertPhase === 'caution') { rgb = '195,203,213'; edgeA = 0.45; }
    else { rgb = '143,166,192'; edgeA = 0.30; calm = true; }
    var half = d.fov * (d.fovMul || 1) / 2, range = d.range * (d.rangeMul || 1), STEPS = 20;
    // hostile cones fill a little brighter so they read over the alarm vignette;
    // the additive white is kept low so the floor under it never blows out
    var hot = roomAlert || d.seeing;
    var grad = ctx.createRadialGradient(d.x, d.y, 4, d.x, d.y, range);
    grad.addColorStop(0, 'rgba(' + rgb + (hot ? ',0.30)' : ',0.30)'));
    grad.addColorStop(0.5, 'rgba(' + rgb + (hot ? ',0.11)' : ',0.09)'));
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
    ctx.strokeStyle = 'rgba(233,231,226,' + (0.30 + 0.35 * p).toFixed(3) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s + a); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s + a, y - s);
    ctx.moveTo(x + s - a, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y - s + a);
    ctx.moveTo(x + s, y + s - a); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - a, y + s);
    ctx.moveTo(x - s + a, y + s); ctx.lineTo(x - s, y + s); ctx.lineTo(x - s, y + s - a);
    ctx.stroke();
    ctx.fillStyle = 'rgba(233,231,226,' + (0.45 + 0.35 * p).toFixed(3) + ')';
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
  // intel = a steel-blue keycard (pre-rendered SPR.key) bobbing gently over its
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
    ctx.fillStyle = C.wallFront; ctx.strokeStyle = c.seeing ? C.paper : C.wallEdge; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(5, -4); ctx.lineTo(8, -2);
    ctx.lineTo(8, 2); ctx.lineTo(5, 4); ctx.lineTo(-7, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c.seeing ? C.paper : C.bright; ctx.fillRect(6, -1.5, 2, 3);  // lens slit
    ctx.restore();
    var led = c.seeing || Math.sin(elapsed * 6) > 0;
    ctx.fillStyle = c.seeing ? C.paper : led ? C.line : 'rgba(143,166,192,0.25)';
    ctx.fillRect(c.x - 1, c.y - 11, 2, 2);
  }
  function drawGuard(g, roomAlert) {
    if (g.down) {
      // prone: the guard sprite turned 90 degrees off his facing, dimmed to ~70 %, a paper "zz"
      drawShadow(g.x, g.y);
      drawSpriteImg(SPR.guardDown, g.x, g.y, g.facing + Math.PI, null);
      ctx.font = 'bold 9px "Share Tech Mono",monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      var zb = reduceMotion ? 0 : Math.round(Math.sin(elapsed * 2.2) * 1.5);
      ctx.fillStyle = 'rgba(4,9,18,0.7)'; ctx.fillRect(g.x + 6, g.y - 21 + zb, 15, 10);
      ctx.fillStyle = C.paperDim; ctx.fillText('zz', g.x + 8, g.y - 11 + zb);
      return;
    }
    drawShadow(g.x, g.y);
    drawSpriteImg(SPR[(g.seeing || roomAlert) ? 'guardHot' : 'guard'][g.moving ? (Math.floor(g.walk / Math.PI) % 2) : 0],
      g.x, g.y, g.facing + Math.PI / 2, g.moving ? g.walk : null);
    // awareness gauge — the arc fills cool grey -> paper with spotTimer before the alarm trips
    // (gauge + plate sit above the 36px sprite: half-height 18 + a 2–6px gap)
    if (!roomAlert && g.spotTimer > 0.05 && g.spotTimer < SPOT_FULL) {
      var t = g.spotTimer / SPOT_FULL;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4,9,18,0.65)';
      ctx.beginPath(); ctx.arc(g.x, g.y - 24, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = t < 0.7 ? C.paperDim : C.paper;
      ctx.beginPath(); ctx.arc(g.x, g.y - 24, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t); ctx.stroke();
    }
    var mark = null;
    if (roomAlert) mark = '!';
    else if (g.behavior === 'investigate' && !g.seeing) mark = '?';
    if (mark !== g.lastMark) { g.markSince = elapsed; g.lastMark = mark; }
    if (mark) drawAlertPlate(g.x, g.y - 20, mark, elapsed - (g.markSince || 0));
  }
  // MGS alert plate. "!" = a paper plate, steel-blue 2px stroke, a sumi glyph (the site's
  // own "!" over Raiden, in the game); "?" = a dim-paper plate, paper stroke, sumi glyph.
  // Pops in from 2.6x (ease-out over 0.14s), holds large ~0.5s, then eases down
  // to a small persistent plate. reduceMotion shows the small plate immediately.
  function drawAlertPlate(x, yBottom, mark, age) {
    var s, t;
    if (reduceMotion) s = 0.62;
    else if (age < 0.14) { t = 1 - age / 0.14; s = 1 + 1.6 * t * t * t; }
    else if (age < 0.64) s = 1;
    else if (age < 0.84) { t = 1 - (age - 0.64) / 0.2; s = 0.62 + 0.38 * t * t; }
    else s = 0.62;
    var w = 14 * s, h = 18 * s, x0 = x - w / 2, y0 = yBottom - h;
    var bang = mark === '!';
    ctx.fillStyle = bang ? C.paper : C.paperDim; ctx.fillRect(x0, y0, w, h);
    ctx.lineWidth = s < 0.8 ? 1.5 : 2; ctx.strokeStyle = bang ? C.line : C.paper; ctx.strokeRect(x0, y0, w, h);
    ctx.font = 'bold ' + Math.round(14 * s) + 'px "Share Tech Mono",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.ink; ctx.fillText(mark, x, y0 + h / 2 + 1);
  }
  // radar — MGS2's rectangular minimap: the level's wall layout (baked radarMap,
  // one drawImage) showing the whole room, guards as steel-blue blips with their cone wedges
  // (paper while one has eyes on you), cameras cool grey, exit bearing once the
  // intel is in hand. JAMMED (alert/evasion, or forceJam on the game-over freeze)
  // = steel-blue static stripes. No gradients here.
  // radarFade: the box dims to 0.3 while Raiden or a standing guard is under it
  // (MGS2 fades its HUD the same way), so nobody vanishes in the corner
  var radarFade = 1;
  function underRadar(px, py) { return px > RADAR_X - 12 && px < RADAR_X + RADAR_W + 12 && py > RADAR_Y - 12 && py < RADAR_Y + RADAR_H + 14; }
  function drawRadar(forceJam) {
    var x = RADAR_X, y = RADAR_Y, w = RADAR_W, h = RADAR_H, cx = x + w / 2, cy = y + h / 2, sc = RADAR_SC, i;
    var jam = forceJam || alertPhase === 'alert' || alertPhase === 'evasion';
    var hid = underRadar(player.x, player.y);
    for (i = 0; !hid && i < guards.length; i++) if (!guards[i].down && underRadar(guards[i].x, guards[i].y)) hid = true;
    var fadeTo = hid ? 0.3 : 1;
    radarFade = reduceMotion ? fadeTo : radarFade + (fadeTo - radarFade) * 0.25;
    ctx.globalAlpha = radarFade;
    ctx.save();
    // bezel + screen — translucent, so a sprite walking under the corner stays visible
    ctx.fillStyle = 'rgba(4,9,18,0.6)'; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.strokeStyle = 'rgba(143,166,192,0.18)'; ctx.lineWidth = 3; ctx.strokeRect(x - 3.5, y - 3.5, w + 7, h + 7);
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (jam) {
      // static: 2px bands whose brightness hashes off (row, frame) — no allocation
      var fr = reduceMotion ? 0 : Math.floor(elapsed * 16);
      for (i = 0; i < h; i += 2) {
        var v = Math.sin((i + fr * 7) * 12.9898) * 43758.5453; v -= Math.floor(v);
        ctx.fillStyle = 'rgba(143,166,192,' + (0.04 + v * 0.2).toFixed(2) + ')';
        ctx.fillRect(x, y + i, w, 2);
      }
      ctx.fillStyle = 'rgba(5,9,18,0.75)'; ctx.fillRect(cx - 22, cy - 6, 44, 12);
      ctx.fillStyle = C.bright; ctx.font = 'bold 8px "Share Tech Mono",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('JAMMED', cx, cy + 0.5);
    } else {
      var ox = RADAR_OX, oy = RADAR_OY;
      if (radarMap) ctx.drawImage(radarMap, ox, oy, W * sc, H * sc);
      for (i = 0; i < guards.length; i++) {
        var g = guards[i]; if (g.down) continue;
        var rx = ox + g.x * sc, ry = oy + g.y * sc;
        var hf = g.fov * (g.fovMul || 1) / 2;
        ctx.fillStyle = g.seeing ? 'rgba(233,231,226,0.28)' : 'rgba(143,166,192,0.22)'; ctx.beginPath(); ctx.moveTo(rx, ry);
        ctx.arc(rx, ry, g.range * (g.rangeMul || 1) * sc, g.facing - hf, g.facing + hf); ctx.closePath(); ctx.fill();
        ctx.fillStyle = g.seeing ? C.paper : C.line; ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
      }
      for (i = 0; i < cameras.length; i++) {
        var cm = cameras[i], rx2 = ox + cm.x * sc, ry2 = oy + cm.y * sc;
        var hf2 = cm.fov / 2;
        ctx.fillStyle = 'rgba(195,203,213,0.16)'; ctx.beginPath(); ctx.moveTo(rx2, ry2);
        ctx.arc(rx2, ry2, cm.range * sc, cm.facing - hf2, cm.facing + hf2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.paperDim; ctx.fillRect(rx2 - 1.5, ry2 - 1.5, 3, 3);
      }
      // exit waypoint once the intel is in hand
      if (intelGot) {
        var rex = ox + exitPt.x * sc, rey = oy + exitPt.y * sc;
        if (reduceMotion || Math.sin(elapsed * 6) > -0.3) {
          ctx.fillStyle = C.bright; ctx.fillRect(rex - 1.5, rey - 1.5, 3, 3);
          ctx.strokeStyle = 'rgba(184,198,214,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(rex - 3.5, rey - 3.5, 7, 7);
        }
      }
      // player dot + facing tick — bearing reads off the radar at a glance
      var pxr = ox + player.x * sc, pyr = oy + player.y * sc;
      ctx.fillStyle = C.bright; ctx.fillRect(pxr - 1.5, pyr - 1.5, 3, 3);
      var pfa = Math.atan2(player.fy, player.fx);
      ctx.strokeStyle = C.bright; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(pxr + Math.cos(pfa) * 3, pyr + Math.sin(pfa) * 3);
      ctx.lineTo(pxr + Math.cos(pfa) * 7, pyr + Math.sin(pfa) * 7); ctx.stroke();
    }
    ctx.restore();
    // frame + corner ticks
    ctx.strokeStyle = jam ? 'rgba(184,198,214,0.7)' : 'rgba(143,166,192,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    ctx.strokeStyle = 'rgba(184,198,214,0.55)'; ctx.beginPath();
    ctx.moveTo(x - 4, y + 4); ctx.lineTo(x - 4, y - 4); ctx.lineTo(x + 4, y - 4);
    ctx.moveTo(x + w - 4, y - 4); ctx.lineTo(x + w + 4, y - 4); ctx.lineTo(x + w + 4, y + 4);
    ctx.moveTo(x + w + 4, y + h - 4); ctx.lineTo(x + w + 4, y + h + 4); ctx.lineTo(x + w - 4, y + h + 4);
    ctx.moveTo(x + 4, y + h + 4); ctx.lineTo(x - 4, y + h + 4); ctx.lineTo(x - 4, y + h - 4);
    ctx.stroke();
    // the label only where it is legible (a phone scales the canvas to ~0.55: 8 px would be 4 px of noise)
    if (lastWide) { ctx.fillStyle = C.dim; ctx.font = '8px "Share Tech Mono",monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('RADAR', x + w + 9, y + h + 1); }
    ctx.globalAlpha = 1;
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
  var HUD_FONT = '8px "Share Tech Mono",monospace', HUD_PANEL = 'rgba(4,9,18,0.62)', HUD_EDGE = 'rgba(143,166,192,0.35)';
  function hudPanel(x, y, w, h, edge) {
    ctx.fillStyle = HUD_PANEL; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = edge || HUD_EDGE; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  }
  // cooldown ring: dim track; a dim-paper arc grows as the timer recharges; full steel-blue ring when ready
  function hudRing(x, y, cd, max) {
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(143,166,192,0.22)';
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
    if (cd > 0) {
      ctx.strokeStyle = C.paperDim;
      ctx.beginPath(); ctx.arc(x, y, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cd / max)); ctx.stroke();
    } else {
      ctx.strokeStyle = C.line;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.line; ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }
  function drawHudWindows() {
    var blinkOn = reduceMotion || Math.sin(elapsed * 10) > 0, i;
    ctx.font = HUD_FONT; ctx.textBaseline = 'middle';
    // (a) LIFE gauge — same thresholds as updateHud()
    hudPanel(118, 7, 212, 18);
    ctx.textAlign = 'left'; ctx.fillStyle = C.dim; ctx.fillText('LIFE', 124, 16.5);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(150, 11, 176, 10);
    ctx.strokeStyle = 'rgba(143,166,192,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(150.5, 11.5, 175, 9);
    var lw = Math.round(174 * Math.max(0, Math.min(1, life)));
    if (lw > 0 && (life >= 0.25 || blinkOn)) {
      ctx.fillStyle = life > 0.5 ? C.line : life > 0.25 ? C.paperDim : C.paper;
      ctx.fillRect(151, 12, lw, 8);
    }
    ctx.fillStyle = 'rgba(4,9,18,0.75)';
    for (i = 158; i < 325; i += 8) ctx.fillRect(i, 12, 1, 8);   // segment ticks every 8px
    // (d) alert-phase countdown — digits left-aligned at a fixed x so they never jitter
    if (alertPhase !== 'normal' && state === 'playing') {
      var ph = alertPhase, pc = ph === 'caution' ? C.paperDim : C.paper;
      var pe = ph === 'caution' ? 'rgba(195,203,213,0.45)' : 'rgba(233,231,226,0.6)';
      hudPanel(340, 7, 130, 18, pe);
      ctx.textAlign = 'left'; ctx.fillStyle = pc;
      if (ph === 'alert') { ctx.fillText('ALERT', 358, 16.5); if (blinkOn) ctx.fillText('!', 346, 16.5); }   // word stays, the ! blinks
      else {
        ctx.fillText(ph === 'evasion' ? 'EVASION' : 'CAUTION', 346, 16.5);
        ctx.fillStyle = ph === 'caution' ? C.paperDim : C.paper;
        ctx.fillText(String(phaseSecs()), 404, 16.5);
      }
    }
    if (coarsePointer) return;   // the touch d-pad / action buttons overlay both bottom corners
    // (c) WEAPON / ACTION window — CQC + KNOCK with their cooldown rings
    hudPanel(8, 353, 96, 28);
    hudRing(21, 367, cqcCD, CQC_CD); hudRing(63, 367, knockCD, KNOCK_CD);
    ctx.textAlign = 'left'; ctx.font = HUD_FONT;
    ctx.fillStyle = cqcCD > 0 ? C.dim : C.line; ctx.fillText('CHOKE', 31, 367.5);
    ctx.fillStyle = knockCD > 0 ? C.dim : C.line; ctx.fillText('KNOCK', 73, 367.5);
    // (b) ITEM window — the box (mini SPR.box) when worn, an empty slot otherwise
    hudPanel(536, 353, 96, 28);
    ctx.fillStyle = C.dim; ctx.fillText('ITEM', 541, 367.5);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(570, 356, 22, 22);
    ctx.strokeStyle = boxed ? 'rgba(184,198,214,0.6)' : 'rgba(143,166,192,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(570.5, 356.5, 21, 21);
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
    // the open water drifts: the glint strip, 1-2 px of sine sway, one drawImage per water row
    if (seaGlints) {
      var sway = reduceMotion ? -4 : -4 + Math.sin(elapsed * 0.9) * 2;
      for (i = 0; i < ROWS; i += ROWS - 1) if (isWaterRow(i)) ctx.drawImage(seaGlints, TILE + sway, i * TILE, W - 2 * TILE + 8, TILE);
    }
    // player light pool — gives the eye a focal point on the dark floor
    // (origin-built cached gradient drawn under a translate: zero per-frame allocation)
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(player.x, player.y);
    ctx.fillStyle = poolGrad; ctx.fillRect(-130, -130, 260, 260);
    ctx.restore();
    drawExit(); drawIntel();
    for (i = 0; i < noisePings.length; i++) {
      var pg = noisePings[i], t = pg.t / 0.6;
      ctx.strokeStyle = 'rgba(164,182,204,' + (0.5 * (1 - t)) + ')'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(pg.x, pg.y, pg.r * t, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(164,182,204,' + (0.3 * (1 - t)) + ')'; ctx.lineWidth = 1;   // trailing ring
      ctx.beginPath(); ctx.arc(pg.x, pg.y, pg.r * t * 0.65, 0, Math.PI * 2); ctx.stroke();
    }
    // event pulses: steel-blue ring on a CQC takedown, paper ring on the intel grab
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
        ctx.strokeStyle = 'rgba(233,231,226,' + (reduceMotion ? 0.5 : (0.2 + 0.4 * Math.abs(Math.sin(elapsed * 47 + i * 2))).toFixed(3)) + ')';
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tg.x, tg.y); ctx.lineTo(player.x, player.y); ctx.stroke();
        ctx.fillStyle = 'rgba(233,231,226,0.95)'; ctx.fillRect(tg.x - 2, tg.y - 2, 4, 4);  // muzzle flash
      }
    }
    if (level.weather) drawSeaWeather(level.weather === 'sea');
    ctx.restore();
    // dark vignette (screen space — must not shake): scales with taking-fire flash,
    // and pulses slowly while life is critical so danger reads without the HUD bar
    var vigA = hitFlashT > 0 ? 0.38 * (hitFlashT / 0.18) : 0;
    if (life > 0 && life < 0.3 && state === 'playing') vigA = Math.max(vigA, reduceMotion ? 0.14 : 0.10 + 0.08 * Math.sin(elapsed * 5));
    if (vigA > 0) { ctx.globalAlpha = Math.min(0.6, vigA * 1.5); ctx.fillStyle = vigGrad; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    // MGS HUD windows on wide canvases only (one clientWidth read per frame);
    // narrow/phone layouts rely on the DOM strip alone
    // gate on the RENDERED width: a height-capped frame letterboxes the canvas (object-fit: contain)
    var wide = Math.min(canvas.clientWidth, canvas.clientHeight * W / H) >= 520;
    if (wide !== lastWide) { lastWide = wide; overlay.classList.toggle('mgsg-wide', wide); }   // hides the DOM badge + gauge
    drawRadar();
    if (wide) drawHudWindows();
  }

  /* ---- night weather. Mist = the baked mistSprite drawn 5 times, drifting with
     the wind (no gradient per frame). Spray (the open bridge only) = short
     diagonal streaks on ONE wind vector, coming in gusts (the count swells and
     falls), paper at .25, one stroked path (no Math.random, no allocation).
     Reduced motion: the mist holds still and the spray is skipped. ---- */
  function drawSeaWeather(spray) {
    var t = reduceMotion ? 0 : elapsed, i, span = W + 300;
    for (i = 0; i < 5; i++) {
      var mx = ((i * 211 + t * (10 + i * 4)) % span) - 260, my = 18 + i * 74 + Math.sin(t * 0.35 + i * 1.7) * 10;
      ctx.globalAlpha = 0.10 + (i % 2) * 0.04;
      ctx.drawImage(mistSprite, mx, my, 320, 96);
    }
    ctx.globalAlpha = 1;
    if (reduceMotion || !spray) return;
    var gust = 0.5 + 0.5 * Math.sin(t * 0.55), n = 8 + Math.round(gust * gust * 34);
    ctx.strokeStyle = 'rgba(233,231,226,0.25)'; ctx.lineWidth = 1; ctx.beginPath();
    for (i = 0; i < n; i++) {
      var sp = 260 + (i % 5) * 40, len = 5 + (i % 3) * 3;
      var sx = (i * 97.3 + t * sp) % (W + 60) - 30, sy = (i * 53.7 + t * sp * 0.3) % (H + 20) - 10;
      ctx.moveTo(sx, sy); ctx.lineTo(sx + len, sy + len * 0.3);
    }
    ctx.stroke();
  }

  /* ===================== screens / transitions ===================== */
  // gameplay messages go to the aria-live region AND (during play) to a visible
  // codec-subtitle toast — sighted players get the same guidance as SR users
  function announce(m, ms) {
    if (srLive) srLive.textContent = m;
    if (!toastEl || state !== 'playing') return;
    toastEl.textContent = m; toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastTimer = null; toastEl.classList.remove('show'); }, ms || 2200);
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
    // every screen change stands the live-play chrome down: the DOM badge names the screen (never a stale
    // "! ALERT" or "CAUTION 20" under it) and the alarm wash, hazard tape and paper LCD chip go;
    // resumeGame() / the next run's updateHud() bring the live state back
    endChrome(o.cls === 'pause' ? 'PAUSED' : o.cls === 'fail' ? 'NO SIGNAL' : (o.cls === 'title' || o.cls === 'brief') ? 'NORMAL' : 'CLEAR');
    screenEl.className = 'mgsg-screen show' + (o.cls ? ' ' + o.cls : '');
    overlay.classList.add('mgsg-scr');   // phone: the screen also covers the control deck, which hides
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
    // codec-call layout (title + briefing): Raiden | frequency strip | the Colonel,
    // whose signal breaks up while the call is on screen
    var call = o.cls === 'title' || o.cls === 'brief';
    glitchColonel(call);
    if (call) {
      scrWhoThem.textContent = o.who || 'COLONEL';
      var fq = o.freq || '140.85', target = Math.max(1, Math.min(99, (parseFloat(fq) - 140) / 2 * 100)).toFixed(1) + '%';
      // needle: 140.00 .. 142.00 across the strip. On the title it sweeps in from 140.00 while the readout ticks up
      if (o.cls === 'title' && !reduceMotion) {
        scrNeedle.style.left = '1%'; void scrNeedle.offsetWidth; scrNeedle.style.left = target;
        tickFreq(scrFnum, parseFloat(fq));
      } else { scrNeedle.style.left = target; scrFnum.textContent = fq; }
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
    screenEl.className = 'mgsg-screen'; scrRetry.style.display = 'none'; overlay.classList.remove('mgsg-scr');
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    glitchColonel(false);
  }
  // an LCD readout dials in: 140.00 -> f in 8 steps over 0.4 s (one timer per element)
  var tickTimers = [];
  function tickFreq(el, f) {
    var slot = el === freqEl ? 0 : 1;
    if (tickTimers[slot]) { clearInterval(tickTimers[slot]); tickTimers[slot] = null; }
    if (reduceMotion) { el.textContent = f.toFixed(2); return; }
    var n = 0; el.textContent = '140.00';
    tickTimers[slot] = setInterval(function () {
      n++; el.textContent = (140 + (f - 140) * Math.min(1, n / 8)).toFixed(2);
      if (n >= 8) { clearInterval(tickTimers[slot]); tickTimers[slot] = null; }
    }, 50);
  }
  function stopTicks() { for (var i = 0; i < tickTimers.length; i++) if (tickTimers[i]) { clearInterval(tickTimers[i]); tickTimers[i] = null; } }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
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

  // title + briefings: a codec call from the Colonel on 140.85 — Raiden (the site's
  // own ink, masked steel blue) on the left, the Colonel's breaking-up signal on the right
  function startTitle() { state = 'title'; loadLevel(0); render(); showScreen({ cls: 'title', caller: 'INCOMING CALL', title: 'BIG SHELL', who: 'COLONEL', freq: '140.85', body: 'Raiden, this is the Colonel. The Big Shell is in enemy hands. Three areas. In each one: get the intel, reach the exit, stay out of sight.', sub: '', go: 'PRESS ENTER' }); }
  function startBriefing() {
    state = 'briefing'; loadLevel(levelIdx); render();
    var pb = bestFor('op' + (levelIdx + 1));   // personal best line — omitted until an op is cleared once
    showScreen({ cls: 'brief', caller: '▸ ' + level.caller, title: 'OP ' + (levelIdx + 1) + ' — ' + level.name, who: level.caller, freq: level.freq, stats: pb !== null ? [['PERSONAL BEST', fmt(pb)]] : null, body: level.brief, sub: '', go: 'PRESS ENTER TO INFILTRATE' });
  }
  function startPlay() {
    hideScreen(); keys = Object.create(null); touchDir = { up: 0, down: 0, left: 0, right: 0 }; running = false;
    // CRT power-on sweep as gameplay starts
    if (!reduceMotion) { canvas.classList.remove('on'); void canvas.offsetWidth; canvas.classList.add('on'); }
    state = 'playing'; announce('Go.', 900);   // a beat, not a banner
  }
  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused'; stopAlertMusic();
    render();   // redraw the frame under the screen without the live phase window (drawHudWindows draws it only while playing)
    showScreen({ cls: 'pause', title: 'PAUSED', body: 'Codec on hold, Raiden. Your position is safe.', sub: coarsePointer ? 'TAP EXIT TO DISCONNECT' : 'ESC AGAIN TO DISCONNECT', go: 'PRESS ENTER TO RESUME', retry: true });
  }
  function resumeGame() {
    hideScreen(); keys = Object.create(null); touchDir = { up: 0, down: 0, left: 0, right: 0 }; running = false;
    state = 'playing'; updateHud();   // the badge and the alarm chrome return with the run
    if (alertPhase === 'alert' || alertPhase === 'evasion') startAlertMusic();
    announce('Resumed.', 900);
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
      state = 'clear'; render(); showScreen({ title: 'OP ' + (levelIdx + 1) + ' CLEAR', big: rank, rec: opRec ? 'NEW RECORD' : '', body: alertsThisLevel ? ('Extracted — ' + plural(alertsThisLevel, 'alert') + ' raised.') : 'Clean extraction. No alerts.', stats: stats, go: 'PRESS ENTER TO CONTINUE' });
    } else {
      // mission rank counts every op: total alerts + total time
      var mRank = rankFor(totalAlerts, totalTime, 165);
      var totPrev = bestFor('total');
      var totRec = noteBest('total', totalTime);
      var mStats = [['TOTAL TIME', fmt(totalTime)], ['TOTAL ALERTS', String(totalAlerts)]];
      if (!totRec && totPrev !== null) mStats.push(['BEST', fmt(totPrev)]);
      state = 'complete'; render(); showScreen({ title: 'MISSION COMPLETE', big: mRank, rec: totRec ? 'NEW RECORD' : '', body: (totalAlerts ? 'All three areas clear — ' + plural(totalAlerts, 'alert') + ' across the mission.' : 'All three areas clear, and not one alert.') + ' Good work, Raiden. Colonel out.', stats: mStats, go: 'PRESS ENTER TO REPLAY' });
    }
  }
  // screens: the DOM state badge stops showing (or blinking) a stale phase, and the alarm
  // chrome (hazard tape, paper LCD chip, the stage wash) stands down under the screen
  function endChrome(label) {
    stateBadge.className = 'mgsg-stbadge'; stateBadge.textContent = label;
    stage.classList.remove('alarm', 'caution'); frame.classList.remove('alarm', 'caution');
  }
  function gameOver() {
    stopAlertMusic(); state = 'over'; sfxOver();
    updateHud();  // the death frame returns before update()'s HUD refresh — show the real (empty) life bar
    if (!reduceMotion) { flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on'); }
    render();
    // freeze frame: drain the colour out of the field and dim it (two flat fills,
    // no gradient, no tint) and show the radar jammed — it stays under GAME OVER
    ctx.save();
    ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(4,6,12,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    drawRadar(true);
    showScreen({ cls: 'fail', title: 'GAME OVER', big: 'SIGNAL LOST', bigCls: 'lost', body: 'Raiden? Raiden, respond! ' + level.lost, stats: [['OP', (levelIdx + 1) + '/' + LEVELS.length], ['TIME', fmt(elapsed)]], go: 'PRESS ENTER / R TO RETRY' });
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
  // browser zoom / monitor-DPI moves / window resizes change the target DPR mid-game —
  // resize the backing stores (canvas + bgLayer) or the playfield stays blurry until reopened
  function onResize() {
    if (targetDpr() === dpr) return;
    sizeCanvas();
    if (state !== 'playing') render();  // static screens won't re-render via the loop
  }

  /* ===================== open / close ===================== */
  function openGame() {
    build();
    if (open) return;
    open = true; sizeCanvas();
    // the page's own pieces (js/sumi.js's loop) pause under the overlay
    document.body.classList.add('game-open');
    window.dispatchEvent(new CustomEvent('gameopen'));
    overlay.classList.remove('out');
    levelIdx = 0; totalTime = 0; totalAlerts = 0; keys = Object.create(null); touchDir = { up: 0, down: 0, left: 0, right: 0 }; running = false; boxed = false;
    prevFocus = document.activeElement;
    // the page behind the dialog is inert while it is open: no screen reader browses it, nothing in it takes focus
    Array.prototype.forEach.call(document.querySelectorAll('body > header, body > main, body > footer, body > .skip'), function (el) { el.inert = true; });
    document.body.style.overflow = 'hidden'; overlay.style.display = 'flex';
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKey, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onResize);
    requestAnimationFrame(function () { overlay.classList.add('in'); });   // the connect wipe (css)
    // the LCD chip dials in: 140.00 -> 140.85 in 8 steps over 0.4 s (cleared on close)
    tickFreq(freqEl, 140.85);
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
    overlay.classList.remove('in'); overlay.classList.add('out'); document.body.style.overflow = '';   // the disconnect wipe (css)
    hideToast(); if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    glitchColonel(false); stopTicks();
    freqEl.textContent = '140.85';
    resetInput(); boxed = false;  // resetInput also clears touchDir — no stuck d-pad on reopen
    Array.prototype.forEach.call(document.querySelectorAll('body > header, body > main, body > footer, body > .skip'), function (el) { el.inert = false; });
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

// Big Shell, a hidden top-down stealth game. It opens from the footer's 140.85, by typing 140.85,
// or by the Konami code (js/sumi.js loads this file the first time), and exposes
// window.MGSGame with open and close.
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

  const COLS = 20;
  const ROWS = 12;
  const TILE = 32;
  const W = COLS * TILE;
  const H = ROWS * TILE;
  const PLAYER_R = 9;
  const GUARD_R = 9;
  const SCALE = 2;
  const WALK_SPEED = 92;
  const RUN_SPEED = 152;
  const BOX_SPEED = 58;
  const LOS_STEP = 6;
  const SCAN_TIME = 1.05;
  const SCAN_ARC = 0.7;
  const SPOT_FULL = 1.0;
  const ALERT_GRACE = 2.2;
  const EVASION_TIME = 16;
  const CAUTION_TIME = 20;
  const SEARCH_TIME = 4;
  const SHOOT_RATE = 0.33;
  const REGEN = 0.05;
  const GRAB_DIST = 14;
  const RUN_NOISE_R = 96;
  const KNOCK_R = 150;
  const NOISE_INTERVAL_S = 0.3;
  const KNOCK_COOLDOWN_S = 1.1;
  const CQC_R = 24;
  const CQC_REAR = 2.4;
  const CQC_COOLDOWN_S = 0.8;
  const PICKUP_R = 15;
  const EXIT_R = 16;

  const RADAR_X = 6;
  const RADAR_Y = 5;
  const RADAR_W = 90;
  const RADAR_H = 54;
  const RADAR_SC = 54 / 384;
  const RADAR_OX = RADAR_X + (RADAR_W - W * RADAR_SC) / 2;
  const RADAR_OY = RADAR_Y + (RADAR_H - H * RADAR_SC) / 2;

  // steel blue on navy; danger is paper, caution a cool grey, and nothing is red or amber
  const C = {
    bg: '#0b1220',
    panel: '#0e1726',
    floorA: '#0c1422',
    floorB: '#0f1827',
    floorDot: 'rgba(143,166,192,0.05)',
    grid: 'rgba(143,166,192,0.035)',
    wallFace: '#1a2433',
    wallTop: '#34465e',
    wallRim: '#8a9cb3',
    wallFront: '#121b29',
    wallSide: '#0a101b',
    wallEdge: '#4b5e79',
    wallShadow: 'rgba(0,0,0,0.42)',
    line: '#8fa6c0',
    bright: '#b8c6d6',
    dim: '#7d93ae',
    paper: '#e9e7e2',
    paperDim: '#c3cbd5',
    ink: '#141416',
  };
  const FLOORS = {
    dock: { a: '#0d1523', b: '#0f1826' },
    bridge: { a: '#060c18', b: '#07101c' },
    core: { a: '#0c1422', b: '#0f1827' },
  };

  // the figures face up and are rotated to their heading when drawn
  const PLAYER = [
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
    '.....BB..BB.....',
  ];
  const GUARD = [
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
    '....BB....BB....',
  ];
  const BOX = [
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
    '................',
  ];
  const KEYCARD = ['.AAAAAA.', 'ALLLLLWA', 'AAAAAAAA', 'AAAAAAAA', 'ADDAAAAA', '.AAAAAA.'];
  const WALK_B_ROWS = ['....KSBKKBSK....', '.....KK..KK.....'];
  const PLAYER_B = PLAYER.slice(0, 14).concat(['......SBBS......', '......BB.BB.....']);
  const GUARD_B = GUARD.slice(0, 14).concat(WALK_B_ROWS);
  const PAL_PLAYER = {
    K: '#060a12',
    S: '#5d708a',
    L: '#8496b0',
    B: '#3c4b61',
    G: '#e9e7e2',
    P: '#b4bfcc',
    g: '#262f3e',
    W: '#b8c6d6',
  };
  const PAL_GUARD = {
    K: '#050912',
    S: '#566478',
    H: '#a3adba',
    B: '#364257',
    G: '#2a3445',
    g: '#6b7588',
    W: '#a9b6c6',
    V: '#9fb4cc',
  };
  const PAL_GUARD_HOT = {
    K: '#050912',
    S: '#8e9bac',
    H: '#d0d6de',
    B: '#5f6c80',
    G: '#3c4759',
    g: '#a4aebe',
    W: '#e9e7e2',
    V: '#e9e7e2',
  };
  const PAL_GUARD_DOWN = {
    K: '#04070e',
    S: '#3c475a',
    H: '#7c8594',
    B: '#262f3e',
    G: '#1d2433',
    g: '#4b5262',
    W: '#767f8e',
    V: '#5a6b80',
  };
  const PAL_BOX = { K: '#262b33', B: '#7d8796', W: '#a7b0bc', D: '#565f6d' };
  const PAL_KEY = { A: '#6f86a3', L: '#b8c6d6', W: '#e9e7e2', D: '#2c3d55' };

  let SPR = null;
  function makeSprite(grid, pal, outline) {
    const rows = grid.length;
    const cols = grid[0].length;
    const pad = 1;
    const cv = document.createElement('canvas');
    cv.width = (cols + 2 * pad) * SCALE;
    cv.height = (rows + 2 * pad) * SCALE;
    const g = cv.getContext('2d');
    function solid(r, c) {
      if (r < 0 || c < 0 || r >= rows || c >= cols) return false;
      const ch = grid[r].charAt(c);
      return ch !== '.' && !!pal[ch];
    }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (solid(r, c)) {
          g.fillStyle = pal[grid[r].charAt(c)];
          g.fillRect((c + pad) * SCALE, (r + pad) * SCALE, SCALE, SCALE);
        } else if (
          outline &&
          (solid(r - 1, c) || solid(r + 1, c) || solid(r, c - 1) || solid(r, c + 1))
        ) {
          g.fillStyle = outline;
          g.fillRect((c + pad) * SCALE, (r + pad) * SCALE, SCALE, SCALE);
        }
      }
    return cv;
  }
  function buildSprites() {
    const outline = 'rgba(3,6,12,0.9)';
    SPR = {
      player: [makeSprite(PLAYER, PAL_PLAYER, outline), makeSprite(PLAYER_B, PAL_PLAYER, outline)],
      guard: [makeSprite(GUARD, PAL_GUARD, outline), makeSprite(GUARD_B, PAL_GUARD, outline)],
      guardHot: [
        makeSprite(GUARD, PAL_GUARD_HOT, outline),
        makeSprite(GUARD_B, PAL_GUARD_HOT, outline),
      ],
      guardDown: makeSprite(GUARD, PAL_GUARD_DOWN, outline),
      box: makeSprite(BOX, PAL_BOX, 'rgba(0,0,0,0.5)'),
      key: makeSprite(KEYCARD, PAL_KEY, 'rgba(5,10,20,0.8)'),
    };
  }

  // no patrol may see the start tile [1, 10] at first, hence the short routes in ops 2 and 3
  const LEVELS = [
    {
      name: 'STRUT A DEEP SEA DOCK',
      caller: 'COLONEL',
      freq: '140.85',
      floor: 'dock',
      weather: 'mist',
      lost: 'Lost you at the Strut A Deep Sea Dock.',
      brief:
        'Raiden, you’re in the dock. One Gurlukovich sentry walks the floor. Take the intel, reach the exit. If he spots you, break his line of sight and hold still until the alert passes.',
      map: [
        '####################',
        '#..................#',
        '#..####....####....#',
        '#..####....####....#',
        '#..................#',
        '#.......####.......#',
        '#.......####.......#',
        '#..................#',
        '#..####....####....#',
        '#..####....####....#',
        '#..................#',
        '####################',
      ],
      start: [1, 10],
      exit: [18, 1],
      intel: [10, 4],
      guards: [
        {
          path: [
            [2, 4],
            [17, 4],
          ],
          speed: 70,
          fov: 1.05,
          range: 150,
        },
      ],
      cameras: [],
    },
    {
      name: 'AB CONNECTING BRIDGE',
      caller: 'COLONEL',
      freq: '140.85',
      floor: 'bridge',
      weather: 'sea',
      lost: 'Lost you on the AB connecting bridge.',
      brief:
        'The bridge to Strut B. Two sentries, crossing in opposite directions. Use the cargo to break their sightlines. Running is fast, but the grating carries the sound. A still box hides you.',
      map: [
        '####################',
        '#..................#',
        '#..##..##..##..##..#',
        '#..##..##..##..##..#',
        '#..................#',
        '#..................#',
        '#..##..##..##..##..#',
        '#..##..##..##..##..#',
        '#..................#',
        '#..................#',
        '#..................#',
        '####################',
      ],
      start: [1, 10],
      exit: [18, 1],
      intel: [9, 5],
      guards: [
        {
          path: [
            [2, 4],
            [17, 4],
          ],
          speed: 82,
          fov: 1.13,
          range: 160,
        },
        {
          path: [
            [17, 8],
            [8, 8],
          ],
          speed: 82,
          fov: 1.13,
          range: 160,
          offset: 0.5,
        },
      ],
      cameras: [],
    },
    {
      name: 'SHELL 1 CORE, B1',
      caller: 'COLONEL',
      freq: '140.85',
      floor: 'core',
      lost: 'Lost you in the Shell 1 Core, B1.',
      brief:
        'Shell 1 Core, B1. Three patrols and a camera on the upper corridor. Knock on a wall to pull a guard off his route, or take him from behind. Then get the intel out.',
      map: [
        '####################',
        '#..................#',
        '#..##..####..##....#',
        '#..##..####..##....#',
        '#..................#',
        '#....####..####....#',
        '#....####..####....#',
        '#..................#',
        '#..##..####..##....#',
        '#..##..####..##....#',
        '#..................#',
        '####################',
      ],
      start: [1, 10],
      exit: [18, 1],
      intel: [9, 5],
      guards: [
        {
          path: [
            [2, 4],
            [17, 4],
          ],
          speed: 92,
          fov: 1.2,
          range: 172,
        },
        {
          path: [
            [17, 7],
            [5, 7],
          ],
          speed: 92,
          fov: 1.2,
          range: 172,
          offset: 0.5,
        },
        {
          path: [
            [2, 10],
            [17, 10],
          ],
          speed: 88,
          fov: 1.15,
          range: 165,
          offset: 0.25,
        },
      ],
      cameras: [{ t: [13, 1], base: Math.PI / 2, arc: 0.9, speed: 0.8, fov: 0.95, range: 150 }],
    },
  ];

  const CHROME = {
    bg: '#0b1220',
    panel: '#0e1726',
    line: '#1b2638',
    edge: '#46607f',
    border: '#2b3d56',
    text: '#8fa6c0',
    hi: '#b8c6d6',
    dim: '#7d93ae',
    glow: '143,166,192',
    hglow: '184,198,214',
    shade: '5,9,18',
    pad: '14,23,38',
    veil: 'rgba(5,8,15,0.93)',
    toastbg: 'rgba(5,9,18,.84)',
    paper: '#e9e7e2',
    pdim: '#c3cbd5',
  };
  const CHROME_VARS = {
    bg: '--mg-bg',
    panel: '--mg-panel',
    line: '--mg-line',
    edge: '--mg-edge',
    border: '--mg-border',
    text: '--mg-text',
    hi: '--mg-hi',
    dim: '--mg-dim',
    glow: '--mg-glow',
    hglow: '--mg-hglow',
    shade: '--mg-shade',
    pad: '--mg-pad',
    veil: '--mg-veil',
    toastbg: '--mg-toastbg',
    paper: '--mg-paper',
    pdim: '--mg-pdim',
  };
  function chromeVarsCSS(p) {
    let s = '';
    let k;
    for (k in CHROME_VARS) s += CHROME_VARS[k] + ':' + p[k] + ';';
    return s;
  }

  const CSS =
    '' +
    '.mgsg-overlay{' +
    chromeVarsCSS(CHROME) +
    'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;' +
    'background:var(--mg-veil);backdrop-filter:blur(2px);font-family:"Share Tech Mono",ui-monospace,monospace;' +
    'color:var(--mg-text);opacity:0;transition:opacity .25s ease;padding:16px;overscroll-behavior:contain;overflow-y:auto;}' +
    '.mgsg-overlay.in{opacity:1;}' +
    // margin:auto keeps the top of a too-tall frame reachable, which flex centring alone does not
    '.mgsg-frame{width:min(92vw,1080px);margin:auto;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);' +
    'background:var(--mg-bg);border:1px solid var(--mg-border);border-radius:8px;' +
    'box-shadow:0 24px 70px rgba(0,0,0,.6),0 0 0 1px rgba(var(--mg-glow),.08),0 0 32px rgba(var(--mg-glow),.12);' +
    'overflow:hidden;display:flex;flex-direction:column;' +
    'outline:1px solid rgba(var(--mg-glow),.12);outline-offset:-4px;transform-origin:50% 50%;}' +
    '.mgsg-frame:focus-visible{outline:2px solid var(--mg-text);outline-offset:-2px;}' +
    '.mgsg-overlay.in .mgsg-frame{animation:mgsgConnect .3s cubic-bezier(.2,.8,.3,1) 1;}' +
    '.mgsg-overlay.out .mgsg-frame{animation:mgsgDisconnect .24s ease-in 1 forwards;}' +
    '.mgsg-bar{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--mg-line);' +
    'background:var(--mg-panel);font-size:13px;letter-spacing:1.5px;flex-shrink:0;}' +
    '.mgsg-bar .t{color:var(--mg-hi);text-transform:uppercase;text-shadow:0 0 8px rgba(var(--mg-glow),.5);}' +
    '.mgsg-bar .f{margin-left:auto;color:var(--mg-hi);letter-spacing:2px;font-size:12px;' +
    'background:rgba(var(--mg-shade),.6);border:1px solid var(--mg-border);border-radius:3px;padding:3px 9px;' +
    'text-shadow:0 0 6px rgba(var(--mg-glow),.6);font-variant-numeric:tabular-nums;}' +
    '.mgsg-frame.alarm .f{color:var(--mg-paper);border-color:var(--mg-hi);text-shadow:0 0 6px rgba(233,231,226,.45);}' +
    '.mgsg-bar .f::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;' +
    'background:var(--mg-text);margin-right:8px;vertical-align:1px;box-shadow:0 0 6px rgba(var(--mg-glow),.8);' +
    'animation:mgsgBlink 1.4s steps(1) infinite;}' +
    '.mgsg-frame.alarm .f::before{background:var(--mg-paper);box-shadow:0 0 6px rgba(233,231,226,.7);animation-duration:.5s;}' +
    '.mgsg-frame.caution .f{color:var(--mg-pdim);border-color:#505a68;text-shadow:none;}' +
    '.mgsg-frame.caution .f::before{background:var(--mg-pdim);box-shadow:none;animation-duration:.9s;}' +
    '.mgsg-btn{background:transparent;border:1px solid var(--mg-edge);color:var(--mg-text);font:inherit;font-size:12px;' +
    'line-height:1;padding:5px 8px;border-radius:4px;cursor:pointer;}' +
    '.mgsg-btn:hover{background:rgba(var(--mg-glow),.1);color:var(--mg-hi);}' +
    '.mgsg-hud{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:4px 12px;border-bottom:1px solid var(--mg-line);' +
    'font-size:11px;line-height:16px;letter-spacing:1.5px;text-transform:uppercase;color:var(--mg-dim);flex-shrink:0;}' +
    '.mgsg-hud b{color:var(--mg-text);font-weight:400;text-shadow:0 0 5px rgba(var(--mg-glow),.35);}' +
    '.mgsg-stbadge{padding:0 7px;border:1px solid currentColor;border-radius:2px;letter-spacing:2px;color:var(--mg-text);background:rgba(var(--mg-glow),.08);}' +
    '.mgsg-stbadge.alert,.mgsg-stbadge.evasion{color:var(--mg-paper);}.mgsg-stbadge.caution{color:var(--mg-pdim);background:rgba(195,203,213,.08);}' +
    '.mgsg-stbadge.evasion{background:rgba(233,231,226,.08);}' +
    '.mgsg-stbadge.alert{background:rgba(233,231,226,.14);animation:mgsgBlink .5s steps(1) infinite;}' +
    '.mgsg-life{display:inline-flex;align-items:center;gap:6px;}' +
    // the canvas draws these when wide: clipped, not display:none, so screen readers still get them
    '.mgsg-wide .mgsg-stbadge,.mgsg-wide .mgsg-life{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;}' +
    '.mgsg-lifebar{position:relative;width:88px;height:6px;border:1px solid var(--mg-edge);border-radius:4px;overflow:hidden;background:rgba(0,0,0,.3);}' +
    '.mgsg-lifebar i{display:block;height:100%;width:100%;background:var(--mg-text);transition:width .12s linear;}' +
    '.mgsg-lifebar::after{content:"";position:absolute;inset:0;pointer-events:none;' +
    'background:repeating-linear-gradient(90deg,transparent 0 7px,rgba(var(--mg-shade),.7) 7px 8px);}' +
    '.mgsg-lifebar.low i{animation:mgsgBlink .6s steps(1) infinite;}' +
    '.mgsg-stage{position:relative;flex:1 1 auto;min-height:0;background:var(--mg-bg);transition:box-shadow .2s ease;' +
    'box-shadow:inset 0 0 70px rgba(var(--mg-glow),.06);}' +
    '.mgsg-stage::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:5;' +
    'background:radial-gradient(ellipse 105% 105% at 50% 50%,transparent 55%,rgba(0,0,0,.42) 100%);' +
    'transition:background .3s ease;}' +
    '.mgsg-stage::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:5;' +
    'background:repeating-linear-gradient(0deg,rgba(0,0,0,.14) 0 1px,transparent 1px 3px);}' +
    '.mgsg-stage.alarm{box-shadow:inset 0 0 0 2px var(--mg-paper),inset 0 0 0 3px rgba(var(--mg-glow),.5),inset 0 0 70px rgba(233,231,226,.08);}' +
    '.mgsg-stage.caution{box-shadow:inset 0 0 0 2px rgba(195,203,213,.35),inset 0 0 70px rgba(195,203,213,.06);}' +
    '.mgsg-stage.alarm::before{background:radial-gradient(ellipse 105% 105% at 50% 50%,rgba(233,231,226,.03) 40%,rgba(0,0,0,.48) 100%);' +
    'animation:mgsgAlarmPulse 1.1s ease-in-out infinite;}' +
    '.mgsg-canvas{display:block;width:100%;height:auto;}' +
    '@supports (aspect-ratio:1/1){' +
    '.mgsg-stage{aspect-ratio:' +
    W +
    '/' +
    H +
    ';}' +
    '.mgsg-canvas{position:absolute;inset:0;height:100%;object-fit:contain;}' +
    '}' +
    '.mgsg-screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'text-align:center;gap:12px;padding:24px;overflow:hidden;backdrop-filter:blur(1px);' +
    'opacity:0;visibility:hidden;transform:translateY(6px);' +
    'transition:opacity .22s ease,transform .22s ease,visibility .22s;' +
    'background:linear-gradient(rgba(var(--mg-shade),.93),rgba(var(--mg-shade),.86) 30%,rgba(var(--mg-shade),.86) 70%,rgba(var(--mg-shade),.95));}' +
    '.mgsg-screen.show{opacity:1;visibility:visible;transform:none;animation:mgsgWipe .25s ease-out 1;}' +
    '.mgsg-beam{position:absolute;left:0;right:0;top:50%;height:1px;background:var(--mg-hi);opacity:0;pointer-events:none;' +
    'box-shadow:0 0 8px rgba(var(--mg-hglow),.8);}' +
    '.mgsg-screen.show .mgsg-beam{animation:mgsgBeam .3s ease-out 1;}' +
    '.mgsg-screen h2{font-size:clamp(20px,4.4vw,32px);color:var(--mg-hi);letter-spacing:3px;margin:0;' +
    'text-shadow:0 0 12px rgba(var(--mg-hglow),.45),0 0 2px rgba(var(--mg-hglow),.8);}' +
    '.mgsg-screen.title h2,.mgsg-screen .rank{font-weight:700;letter-spacing:4px;transform:scaleY(1.28);transform-origin:50% 100%;' +
    'text-shadow:0 1px 0 rgba(var(--mg-hglow),.9),0 2px 0 rgba(var(--mg-glow),.55),0 3px 0 rgba(var(--mg-shade),.9),' +
    '3px 4px 0 rgba(var(--mg-shade),.85),0 0 22px rgba(var(--mg-glow),.35);}' +
    // the title scales up from its bottom edge; the top margin keeps it clear of the caller line
    '.mgsg-screen.title h2{font-size:clamp(30px,7vw,52px);padding:8px 18px 12px;margin-top:.55em;' +
    'border-top:3px double var(--mg-border);border-bottom:3px double var(--mg-border);}' +
    '.mgsg-screen .caller{color:var(--mg-dim);font-size:11px;letter-spacing:6px;text-transform:uppercase;}' +
    '.mgsg-call{display:none;grid-template-columns:96px minmax(120px,1fr) 96px;align-items:center;gap:14px;width:min(100%,520px);}' +
    '.mgsg-screen.title .mgsg-call,.mgsg-screen.brief .mgsg-call{display:grid;}' +
    '.mgsg-port{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;}' +
    '.mgsg-port .px{position:relative;width:96px;height:96px;border:1px solid var(--mg-edge);background:var(--mg-panel);overflow:hidden;' +
    'box-shadow:0 0 0 1px rgba(var(--mg-shade),.8),0 0 14px rgba(var(--mg-glow),.12);}' +
    '.mgsg-port .px.raiden{--s:1;}' +
    '.mgsg-port .px.raiden i{position:absolute;inset:0;background:var(--mg-text);' +
    '-webkit-mask:url(img/raiden-night.png?v=12) no-repeat calc(-100px * var(--s)) calc(-75px * var(--s))/calc(300px * var(--s)) auto;' +
    'mask:url(img/raiden-night.png?v=12) no-repeat calc(-100px * var(--s)) calc(-75px * var(--s))/calc(300px * var(--s)) auto;}' +
    '.mgsg-port .px.raiden b{position:absolute;inset:0;background:radial-gradient(circle,transparent 0 .7px,rgba(var(--mg-shade),.55) .8px) 0 0/2px 2px;}' +
    '.mgsg-port .px canvas{display:block;width:100%;height:100%;image-rendering:pixelated;}' +
    '.mgsg-port .px::after{content:"";position:absolute;inset:0;pointer-events:none;' +
    'background:repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0 1px,transparent 1px 3px),' +
    'linear-gradient(rgba(var(--mg-glow),.06),transparent 40%,rgba(var(--mg-shade),.35));}' +
    '.mgsg-port .who{font-size:11px;letter-spacing:2px;color:var(--mg-dim);}' +
    '.mgsg-cc{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0;}' +
    '.mgsg-fstrip{position:relative;width:100%;height:14px;margin-bottom:10px;border-top:1px solid var(--mg-line);border-bottom:1px solid var(--mg-line);' +
    'background:repeating-linear-gradient(90deg,rgba(var(--mg-glow),.55) 0 1px,transparent 1px 30px),' +
    'repeating-linear-gradient(90deg,rgba(var(--mg-glow),.22) 0 1px,transparent 1px 6px);' +
    'background-size:100% 100%,100% 50%;background-position:0 0,0 100%;background-repeat:no-repeat,repeat-x;}' +
    '.mgsg-fstrip i{position:absolute;top:-2px;bottom:-2px;left:50%;width:2px;margin-left:-1px;background:var(--mg-hi);' +
    'box-shadow:0 0 6px rgba(var(--mg-hglow),.8);transition:left .45s cubic-bezier(.2,.8,.3,1);}' +
    '.mgsg-fstrip b{position:absolute;top:100%;margin-top:3px;font-weight:400;font-size:11px;letter-spacing:1px;color:var(--mg-dim);transform:translateX(-50%);}' +
    '.mgsg-fnum{font-size:15px;letter-spacing:3px;color:var(--mg-hi);font-variant-numeric:tabular-nums;text-shadow:0 0 8px rgba(var(--mg-glow),.5);}' +
    '@media (max-width:520px){' +
    '.mgsg-screen{gap:6px;padding:12px;justify-content:flex-start;justify-content:safe center;overflow-y:auto;}' +
    '.mgsg-call{grid-template-columns:56px minmax(0,1fr) 56px;gap:10px;width:100%;}' +
    '.mgsg-port .px{width:56px;height:56px;}.mgsg-port .px.raiden{--s:.5833;}' +
    '.mgsg-cc{gap:4px;}.mgsg-fstrip{height:10px;margin-bottom:8px;}.mgsg-fstrip b{display:none;}.mgsg-fnum{font-size:12px;letter-spacing:2px;}' +
    // a narrow window without touch controls has only the stage's height: portraits and strip go
    '.mgsg-overlay:not(.mgsg-touch) .mgsg-call{grid-template-columns:1fr;gap:0;width:auto;}' +
    '.mgsg-overlay:not(.mgsg-touch) .mgsg-port,.mgsg-overlay:not(.mgsg-touch) .mgsg-fstrip,.mgsg-overlay:not(.mgsg-touch) .mgsg-fnum,' +
    '.mgsg-overlay:not(.mgsg-touch) .mgsg-screen.show .mgsg-wave,.mgsg-overlay:not(.mgsg-touch) .mgsg-screen .mgsg-rec{display:none !important;}.mgsg-overlay:not(.mgsg-touch) .mgsg-screen{padding:8px 12px;gap:5px;}' +
    '.mgsg-screen.title h2{margin-top:.3em;padding:2px 10px 4px;font-size:22px;}' +
    '.mgsg-screen p{font-size:11px;line-height:1.4;}.mgsg-screen .go{margin-top:2px;}' +
    '.mgsg-overlay .mgsg-screen:not(.title) h2{font-size:17px;letter-spacing:2px;}.mgsg-overlay .mgsg-screen .rank{font-size:28px;}.mgsg-overlay .mgsg-screen .lost{font-size:22px;letter-spacing:4px;}' +
    '.mgsg-overlay .mgsg-stats{font-size:11px;gap:1px 14px;margin:0;}.mgsg-overlay .mgsg-screen.fail::before,.mgsg-overlay .mgsg-screen.fail::after{height:5%;}.mgsg-overlay .mgsg-screen.brief .sub{display:none;}}' +
    '@media (max-width:480px){' +
    '.mgsg-bar{gap:6px;padding:7px 8px;font-size:11px;letter-spacing:1px;}' +
    '.mgsg-bar .t{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.mgsg-bar .f{font-size:11px;letter-spacing:1px;padding:3px 6px;flex-shrink:0;white-space:nowrap;}' +
    '.mgsg-bar .f::before{margin-right:5px;}' +
    '.mgsg-bar .mgsg-btn{padding:5px 6px;font-size:11px;flex-shrink:0;white-space:nowrap;}' +
    '.mgsg-hud{gap:4px 7px;padding:6px 8px;font-size:11px;letter-spacing:.5px;}.mgsg-hud>span{white-space:nowrap;}.mgsg-lifebar{width:40px;}' +
    '.mgsg-stbadge{letter-spacing:1px;padding:0 4px;}.mgsg-life{gap:4px;}' +
    '.mgsg-foot{gap:8px;padding:6px 8px;}}' +
    '@media (max-width:380px){.mgsg-hud{gap:4px 6px;font-size:11px;letter-spacing:0;}.mgsg-lifebar{width:32px;}}' +
    '.mgsg-screen p{max-width:46ch;font-size:13px;line-height:1.65;color:var(--mg-text);margin:0;}' +
    '.mgsg-screen .sub{color:var(--mg-dim);font-size:12px;letter-spacing:1px;}' +
    '.mgsg-screen .go{margin-top:6px;color:var(--mg-hi);animation:mgsgGoBlink 1.1s steps(1) infinite;}' +
    '.mgsg-screen.fail h2{color:var(--mg-pdim);}' +
    '.mgsg-screen.fail::before,.mgsg-screen.fail::after{content:"";position:absolute;left:0;right:0;height:13%;background:#03060d;}' +
    '.mgsg-screen.fail::before{top:0}.mgsg-screen.fail::after{bottom:0}' +
    '.mgsg-screen .lost{font-size:clamp(26px,7vw,52px);color:var(--mg-paper);letter-spacing:6px;margin:0;' +
    'text-shadow:0 0 14px rgba(233,231,226,.3);animation:mgsgFlicker .8s steps(2) 2;}' +
    '.mgsg-screen .rank{font-size:clamp(40px,10vw,80px);color:var(--mg-hi);line-height:1;margin:0;' +
    'animation:mgsgStampTall .35s cubic-bezier(.2,1.6,.4,1) 1;}' +
    '.mgsg-screen .mgsg-rec{margin:0;font-size:13px;letter-spacing:4px;color:var(--mg-hi);' +
    'border:1px solid var(--mg-edge);border-radius:3px;padding:4px 12px;background:rgba(var(--mg-glow),.10);' +
    'text-shadow:0 0 10px rgba(var(--mg-hglow),.6);' +
    'animation:mgsgStamp .35s cubic-bezier(.2,1.6,.4,1) 1,mgsgBlink 1.1s steps(1) 2 .4s;}' +
    '.mgsg-wave{display:none;align-items:flex-end;gap:3px;height:16px;}' +
    '.mgsg-screen.title.show .mgsg-wave,.mgsg-screen.brief.show .mgsg-wave{display:inline-flex;}' +
    '.mgsg-wave i{width:3px;height:15px;transform:scaleY(.4);transform-origin:50% 100%;background:var(--mg-text);animation:mgsgWave 1s ease-in-out infinite;}' +
    '.mgsg-wave i:nth-child(2){animation-delay:.15s}.mgsg-wave i:nth-child(3){animation-delay:.3s}' +
    '.mgsg-wave i:nth-child(4){animation-delay:.45s}.mgsg-wave i:nth-child(5){animation-delay:.6s}' +
    '.mgsg-foot{padding:8px 12px;border-top:1px solid var(--mg-line);font-size:11px;color:var(--mg-dim);letter-spacing:.5px;' +
    'display:flex;gap:12px;flex-wrap:wrap;flex-shrink:0;}.mgsg-foot kbd{border:1px solid var(--mg-edge);border-radius:3px;padding:0 4px;color:var(--mg-text);}' +
    '.mgsg-flash{position:absolute;inset:0;background:var(--mg-paper);opacity:0;pointer-events:none;}' +
    '.mgsg-flash.on{animation:mgsgFlash .5s ease-out;}' +
    '.mgsg-toast{position:absolute;left:50%;bottom:10px;z-index:6;max-width:88%;padding:4px 12px;' +
    'background:var(--mg-toastbg);border:1px solid var(--mg-edge);border-radius:3px;' +
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:16px;' +
    'color:var(--mg-hi);font-size:12px;letter-spacing:1px;text-align:center;pointer-events:none;' +
    'opacity:0;transform:translateX(-50%) translateY(4px);transition:opacity .18s ease,transform .18s ease;}' +
    '.mgsg-toast.show{opacity:1;transform:translateX(-50%);}' +
    '.mgsg-touch .mgsg-toast{top:1px;bottom:auto;max-width:62%;padding:0 8px;font-size:11px;line-height:14px;letter-spacing:.5px;}' +
    '@media (max-width:520px){.mgsg-toast{top:1px;bottom:auto;max-width:62%;padding:0 8px;font-size:11px;line-height:14px;letter-spacing:.5px;}}' +
    '.mgsg-roll{position:absolute;left:0;right:0;top:-30%;height:26%;pointer-events:none;z-index:6;' +
    'background:linear-gradient(180deg,transparent,rgba(184,198,214,.045) 50%,transparent);' +
    'animation:mgsgRoll 7s linear infinite;}' +
    '.mgsg-hazard{position:absolute;left:0;width:200%;height:5px;z-index:6;pointer-events:none;display:none;' +
    'background:repeating-linear-gradient(45deg,rgba(233,231,226,.5) 0 10px,transparent 10px 20px);}' +
    '.hz-t{top:0}.hz-b{bottom:0}' +
    '.mgsg-stage.alarm .mgsg-hazard{display:block;animation:mgsgHzScroll 1.2s linear infinite;}' +
    '.mgsg-canvas.on{animation:mgsgPowerOn .3s cubic-bezier(.2,.8,.3,1) 1;transform-origin:50% 50%;}' +
    '.mgsg-stats{display:none;grid-template-columns:auto auto;gap:4px 18px;font-size:13px;letter-spacing:2px;margin:4px 0;}' +
    '.mgsg-stats span:nth-child(odd){color:var(--mg-dim);text-align:left;}' +
    '.mgsg-stats span:nth-child(even){color:var(--mg-hi);text-align:right;text-shadow:0 0 6px rgba(var(--mg-glow),.4);}' +
    '.mgsg-screen.show .mgsg-stats span{animation:mgsgStatIn .3s both;}' +
    '.mgsg-screen.show .mgsg-stats span:nth-child(n+3){animation-delay:.12s}' +
    '.mgsg-screen.show .mgsg-stats span:nth-child(n+5){animation-delay:.24s}' +
    '.mgsg-screen .mgsg-btn{margin-top:4px;padding:7px 14px;font-size:12px;letter-spacing:2px;}' +
    '.mgsg-pad{position:absolute;left:12px;bottom:12px;display:none;grid-template-columns:repeat(3,46px);grid-template-rows:repeat(3,46px);gap:5px;touch-action:none;}' +
    '.mgsg-acts{position:absolute;right:12px;bottom:12px;display:none;grid-template-columns:repeat(2,52px);grid-template-rows:repeat(2,44px);gap:6px;touch-action:none;}' +
    '.mgsg-pad button,.mgsg-acts button{background:rgba(var(--mg-pad),.85);border:1px solid var(--mg-edge);color:var(--mg-text);' +
    'border-radius:8px;font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center;-webkit-user-select:none;user-select:none;}' +
    '.mgsg-pad button:active,.mgsg-acts button:active{background:rgba(var(--mg-glow),.2);}' +
    '.mgsg-pad .u{grid-area:1/2}.mgsg-pad .l{grid-area:2/1}.mgsg-pad .r{grid-area:2/3}.mgsg-pad .d{grid-area:3/2}' +
    '.mgsg-pad .p{grid-area:2/2;font-size:11px;letter-spacing:1px;color:var(--mg-dim);}' +
    '.mgsg-touch .mgsg-pad,.mgsg-touch .mgsg-acts{display:grid;}' +
    '.mgsg-touch .mgsg-foot{display:none;}' +
    '.mgsg-touch .mgsg-bar .mgsg-btn{min-height:40px;min-width:44px;}' +
    '.mgsg-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);}' +
    '.mgsg-overlay,.mgsg-overlay *{cursor:auto !important;}' +
    '.mgsg-overlay .mgsg-btn,.mgsg-overlay .mgsg-pad button,.mgsg-overlay .mgsg-acts button{cursor:pointer !important;}' +
    // the frame clips its overflow, so the controls below the stage get real padding to sit in
    '@media (orientation:portrait){' +
    '.mgsg-touch .mgsg-frame{padding-bottom:172px;}' +
    '.mgsg-touch .mgsg-pad{bottom:-160px;}' +
    '.mgsg-touch .mgsg-acts{bottom:-133px;}' +
    '.mgsg-touch .mgsg-screen{bottom:-172px;justify-content:center;justify-content:safe center;overflow-y:auto;}' +
    '}' +
    '.mgsg-touch.mgsg-scr .mgsg-pad,.mgsg-touch.mgsg-scr .mgsg-acts{visibility:hidden;}' +
    '@media (max-width:520px){.mgsg-overlay.mgsg-touch{padding:6px;}.mgsg-touch .mgsg-frame{width:calc(100vw - 12px);margin:auto;}}' +
    '@media (prefers-reduced-motion:reduce){.mgsg-screen .go{animation:none}.mgsg-overlay{transition:none}.mgsg-stage{transition:none}' +
    '.mgsg-stage.alarm::before,.mgsg-bar .f::before,.mgsg-stbadge.alert,.mgsg-lifebar.low i,.mgsg-wave i,' +
    '.mgsg-screen .lost,.mgsg-screen .rank,.mgsg-screen .mgsg-rec{animation:none}' +
    '.mgsg-overlay.in .mgsg-frame,.mgsg-overlay.out .mgsg-frame{animation:none}.mgsg-fstrip i{transition:none}' +
    '.mgsg-roll{display:none}.mgsg-stage.alarm .mgsg-hazard{animation:none}.mgsg-canvas.on{animation:none}' +
    '.mgsg-screen.show .mgsg-stats span{animation:none}.mgsg-toast{transition:none}' +
    '.mgsg-screen{transition:opacity .22s ease;transform:none}' +
    '.mgsg-screen.show{animation:none;clip-path:none}.mgsg-screen.show .mgsg-beam{animation:none}}' +
    '@keyframes mgsgConnect{0%{transform:scale(.55,.006);opacity:.5}45%{transform:scale(1,.006);opacity:1}100%{transform:none}}' +
    '@keyframes mgsgDisconnect{0%{transform:none}55%{transform:scale(1,.006);opacity:1}100%{transform:scale(0,.006);opacity:0}}' +
    '@keyframes mgsgBlink{50%{opacity:.25}}@keyframes mgsgGoBlink{50%{opacity:.55}}@keyframes mgsgFlash{from{opacity:.3}to{opacity:0}}' +
    '@keyframes mgsgAlarmPulse{50%{opacity:.55}}@keyframes mgsgFlicker{50%{opacity:.4}}' +
    '@keyframes mgsgStamp{from{transform:scale(2.4);opacity:0}to{transform:scale(1);opacity:1}}' +
    '@keyframes mgsgStampTall{from{transform:scale(2.4) scaleY(1.28);opacity:0}to{transform:scaleY(1.28);opacity:1}}' +
    '@keyframes mgsgWipe{from{clip-path:inset(50% 0)}to{clip-path:inset(0)}}' +
    '@keyframes mgsgBeam{0%{opacity:1;transform:scaleX(.15)}55%{opacity:1;transform:scaleX(1)}100%{opacity:0;transform:scaleX(1)}}' +
    '@keyframes mgsgWave{0%,100%{transform:scaleY(.333)}50%{transform:scaleY(1)}}' +
    '@keyframes mgsgRoll{from{transform:translateY(0)}to{transform:translateY(520%)}}' +
    '@keyframes mgsgHzScroll{from{transform:translateX(0)}to{transform:translateX(-28.3px)}}' +
    '@keyframes mgsgPowerOn{0%{transform:scaleY(.005) scaleX(1.1);opacity:.4}60%{transform:scaleY(1.04)}100%{transform:none;opacity:1}}' +
    '@keyframes mgsgStatIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1}}';

  let built = false;
  let open = false;
  let overlay;
  let frame;
  let stage;
  let canvas;
  let ctx;
  let dpr = 1;
  let stateBadge;
  let lifeFill;
  let hudIntel;
  let hudLevel;
  let hudTime;
  let lastLifeW = '';
  let lastLifeC = '';
  let screenEl;
  let scrCaller;
  let scrTitle;
  let scrBody;
  let scrSub;
  let scrGo;
  let scrRank;
  let scrStats;
  let scrRec;
  let scrRetry;
  let flashEl;
  let srLive;
  let muteBtn;
  let scrPortThem;
  let scrWhoThem;
  let scrFnum;
  let scrNeedle;
  let beamEl;
  let freqEl;
  let toastEl = null;
  let toastTimer = null;
  let typeTimer = null;
  let radarMap = null;
  let seaGlints = null;
  let lastWide = null;
  let mistSprite = null;
  let colCtx = null;
  let colBase = null;
  let colTimer = null;
  let colFrame = 0;
  let rafId = null;
  let lastT = 0;
  let muted = false;
  let audioCtx = null;
  let prevFocus = null;
  let alertLoop = null;
  let bgLayer = null;
  let shakeT = 0;
  let hitFlashT = 0;
  let hitBeepCD = 0;
  const fxPulses = [];
  let poolGrad = null;
  let vigGrad = null;
  let exitGlowGrad = null;
  let intelHaloGrad = null;

  let state = 'title'; // title | briefing | playing | paused | clear | complete | over
  let levelIdx = 0;
  let level = null;
  let walls = null;
  let player = null;
  let guards = [];
  let cameras = [];
  let intel = null;
  let exitPt = null;
  let alertPhase = 'normal';
  let alertGrace = 0;
  let evasionTimer = 0;
  let cautionTimer = 0;
  let lastKnown = null;
  let alertsThisLevel = 0;
  let totalAlerts = 0;
  let life = 1;
  let elapsed = 0;
  let totalTime = 0;
  let intelGot = false;
  let boxed = false;
  let running = false;
  let noiseAccum = 0;
  let knockCD = 0;
  let cqcCD = 0;
  let walkPhase = 0;
  let noisePings = [];
  let boxHinted = false;
  let keys = Object.create(null);
  let touchDir = { up: 0, down: 0, left: 0, right: 0 };

  function $(sel) {
    return overlay.querySelector(sel);
  }

  function build() {
    if (built) return;
    built = true;

    const style = document.createElement('style');
    style.id = 'mgsg-styles';
    style.textContent = CSS;
    document.head.appendChild(style);

    overlay = document.createElement('div');
    overlay.className = 'mgsg-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Big Shell: a hidden stealth mini-game');
    if (coarsePointer) overlay.classList.add('mgsg-touch');

    overlay.innerHTML =
      '<div class="mgsg-frame" tabindex="-1">' +
      '<div class="mgsg-bar"><span class="t">&#9658; BIG SHELL</span><span class="f">140.85</span>' +
      '<button type="button" class="mgsg-btn" data-act="mute" title="Toggle sound">SND ON</button>' +
      '<button type="button" class="mgsg-btn" data-act="close" title="Disconnect (Esc)">&times; EXIT</button></div>' +
      '<div class="mgsg-hud"><span class="mgsg-stbadge" data-hud="state">NORMAL</span>' +
      '<span class="mgsg-life">LIFE <span class="mgsg-lifebar"><i></i></span></span>' +
      '<span>INTEL <b data-hud="intel">[ ]</b></span>' +
      '<span>OP <b data-hud="level">1/3</b></span>' +
      '<span>T <b data-hud="time">0:00</b></span></div>' +
      '<div class="mgsg-stage">' +
      '<canvas class="mgsg-canvas" width="' +
      W +
      '" height="' +
      H +
      '" aria-hidden="true"></canvas>' +
      '<div class="mgsg-flash"></div>' +
      '<div class="mgsg-roll" aria-hidden="true"></div>' +
      '<div class="mgsg-hazard hz-t" aria-hidden="true"></div><div class="mgsg-hazard hz-b" aria-hidden="true"></div>' +
      '<div class="mgsg-toast" aria-hidden="true"></div>' +
      '<div class="mgsg-screen"><i class="mgsg-beam" aria-hidden="true"></i><span class="caller" data-scr="caller"></span>' +
      '<h2 data-scr="title">BIG SHELL</h2>' +
      '<div class="mgsg-call" aria-hidden="true">' +
      '<div class="mgsg-port"><div class="px raiden"><i></i><b></b></div><span class="who">RAIDEN</span></div>' +
      '<div class="mgsg-cc"><span class="mgsg-wave"><i></i><i></i><i></i><i></i><i></i></span>' +
      '<div class="mgsg-fstrip"><i data-scr="needle"></i><b style="left:0">140</b><b style="left:50%">141</b><b style="left:100%">142</b></div>' +
      '<span class="mgsg-fnum" data-scr="fnum">140.85</span></div>' +
      '<div class="mgsg-port"><div class="px" data-scr="them"><canvas width="48" height="48"></canvas></div><span class="who" data-scr="who">COLONEL</span></div>' +
      '</div>' +
      '<p class="rank" data-scr="big" style="display:none"></p>' +
      '<div class="mgsg-stats" data-scr="stats" style="display:none"></div>' +
      '<p class="mgsg-rec" data-scr="rec" style="display:none"></p>' +
      '<p data-scr="body"></p><p class="sub" data-scr="sub"></p>' +
      '<p class="go" data-scr="go">PRESS ENTER</p>' +
      '<button type="button" class="mgsg-btn" data-scr="retry" style="display:none">RETRY OP</button></div>' +
      '<div class="mgsg-pad" aria-hidden="true">' +
      '<button class="u" data-dir="up" tabindex="-1">&#9650;</button>' +
      '<button class="l" data-dir="left" tabindex="-1">&#9664;</button>' +
      '<button class="r" data-dir="right" tabindex="-1">&#9654;</button>' +
      '<button class="d" data-dir="down" tabindex="-1">&#9660;</button>' +
      '<button class="p" data-act2="pause" tabindex="-1" title="Pause">&#10074;&#10074;</button></div>' +
      '<div class="mgsg-acts" aria-hidden="true">' +
      '<button data-act2="run" tabindex="-1">RUN</button>' +
      '<button data-act2="box" tabindex="-1">BOX</button>' +
      '<button data-act2="knock" tabindex="-1">KNOCK</button>' +
      '<button data-act2="cqc" tabindex="-1">CHOKE</button></div>' +
      '</div>' +
      '<div class="mgsg-foot"><span><kbd>WASD</kbd> / <kbd>↑↓←→</kbd> move</span><span><kbd>Shift</kbd> run</span>' +
      '<span><kbd>B</kbd> box</span><span><kbd>K</kbd> knock</span><span><kbd>F</kbd> choke</span>' +
      '<span><kbd>R</kbd> retry</span><span><kbd>Esc</kbd> pause/exit</span></div>' +
      '<div class="mgsg-sr" aria-live="assertive"></div>' +
      '</div>';

    document.body.appendChild(overlay);

    frame = $('.mgsg-frame');
    stage = $('.mgsg-stage');
    canvas = $('.mgsg-canvas');
    ctx = canvas.getContext('2d');
    stateBadge = $('[data-hud="state"]');
    lifeFill = $('.mgsg-lifebar i');
    hudIntel = $('[data-hud="intel"]');
    hudLevel = $('[data-hud="level"]');
    hudTime = $('[data-hud="time"]');
    screenEl = $('.mgsg-screen');
    scrCaller = $('[data-scr="caller"]');
    scrTitle = $('[data-scr="title"]');
    scrRank = $('[data-scr="big"]');
    scrBody = $('[data-scr="body"]');
    scrSub = $('[data-scr="sub"]');
    scrGo = $('[data-scr="go"]');
    flashEl = $('.mgsg-flash');
    srLive = $('.mgsg-sr');
    muteBtn = $('[data-act="mute"]');
    toastEl = $('.mgsg-toast');
    scrStats = $('[data-scr="stats"]');
    scrRec = $('[data-scr="rec"]');
    scrRetry = $('[data-scr="retry"]');
    scrPortThem = $('[data-scr="them"]');
    scrWhoThem = $('[data-scr="who"]');
    scrFnum = $('[data-scr="fnum"]');
    scrNeedle = $('[data-scr="needle"]');
    beamEl = $('.mgsg-beam');
    freqEl = $('.mgsg-bar .f');
    colCtx = scrPortThem.querySelector('canvas').getContext('2d');
    colBase = buildColonel();
    drawColonel(false);

    buildSprites();
    sizeCanvas();
    buildStaticGrads();

    $('[data-act="close"]').addEventListener('click', closeGame);
    muteBtn.addEventListener('click', function (e) {
      unlockAudio();
      muted = !muted;
      muteBtn.textContent = muted ? 'SND OFF' : 'SND ON';
      muteBtn.style.color = muted ? 'var(--mg-dim)' : '';
      if (muted) stopAlertMusic();
      else if (alertPhase === 'alert' || alertPhase === 'evasion') startAlertMusic();
      // a pointer click (detail > 0) returns focus to the frame, or Enter would keep toggling sound
      if (e.detail > 0) frame.focus();
    });

    screenEl.addEventListener('click', function () {
      if (state !== 'playing') advance();
    });
    scrRetry.addEventListener('click', function (e) {
      e.stopPropagation();
      unlockAudio();
      startBriefing();
    });

    Array.prototype.forEach.call(
      overlay.querySelectorAll('.mgsg-pad button[data-dir]'),
      function (b) {
        const dir = b.getAttribute('data-dir');
        const set = function (v) {
          return function (e) {
            e.preventDefault();
            if (v) unlockAudio();
            touchDir[dir] = v;
          };
        };
        b.addEventListener('touchstart', set(1), { passive: false });
        b.addEventListener('touchend', set(0), { passive: false });
        b.addEventListener('touchcancel', set(0), { passive: false });
        b.addEventListener('mousedown', set(1));
        b.addEventListener('mouseup', set(0));
        b.addEventListener('mouseleave', set(0));
      },
    );
    Array.prototype.forEach.call(
      overlay.querySelectorAll('.mgsg-acts button,.mgsg-pad button[data-act2]'),
      function (b) {
        const a = b.getAttribute('data-act2');
        const press = function (e) {
          e.preventDefault();
          unlockAudio();
          if (state === 'playing') {
            if (a === 'run') running = true;
            else if (a === 'box') doBox();
            else if (a === 'knock') doKnock();
            else if (a === 'cqc') doCQC();
            else if (a === 'pause') pauseGame();
          } else advance();
        };
        b.addEventListener('touchstart', press, { passive: false });
        b.addEventListener('mousedown', press);
        if (a === 'run') {
          const rel = function (e) {
            e.preventDefault();
            running = false;
          };
          b.addEventListener('touchend', rel, { passive: false });
          b.addEventListener('touchcancel', rel, { passive: false });
          b.addEventListener('mouseup', rel);
          b.addEventListener('mouseleave', rel);
        }
      },
    );
  }

  // enough device pixels for the stage at its CSS size: 0.92 and 1080 mirror .mgsg-frame's width
  function targetDpr() {
    const r = window.devicePixelRatio || 1;
    const vw = window.innerWidth || W;
    const vh = window.innerHeight || H;
    const css = Math.min(vw * 0.92, 1080, (Math.max(200, vh - 140) * W) / H);
    return Math.round(Math.min(2, Math.max(r, (css * r) / W)) * 4) / 4;
  }
  function sizeCanvas() {
    dpr = targetDpr();
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false; // resizing the canvas resets its context
    if (walls) buildBg();
  }
  function buildStaticGrads() {
    poolGrad = ctx.createRadialGradient(0, 0, 6, 0, 0, 130);
    poolGrad.addColorStop(0, 'rgba(184,198,214,0.10)');
    poolGrad.addColorStop(1, 'rgba(184,198,214,0)');
    vigGrad = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.8);
    vigGrad.addColorStop(0, 'rgba(2,4,10,0)');
    vigGrad.addColorStop(1, 'rgba(2,4,10,1)');

    mistSprite = document.createElement('canvas');
    mistSprite.width = 192;
    mistSprite.height = 64;
    const m = mistSprite.getContext('2d');
    m.setTransform(1, 0, 0, 1 / 3, 0, 0);
    const mg = m.createRadialGradient(96, 96, 4, 96, 96, 94);
    mg.addColorStop(0, 'rgba(208,214,222,0.9)');
    mg.addColorStop(0.55, 'rgba(208,214,222,0.35)');
    mg.addColorStop(1, 'rgba(208,214,222,0)');
    m.fillStyle = mg;
    m.fillRect(0, 0, 192, 192);
  }

  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function buildColonel() {
    const S = 48;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const img = g.createImageData(S, S);
    const d = img.data;
    let x;
    let y;
    for (y = 0; y < S; y++)
      for (x = 0; x < S; x++) {
        const hx = (x - 24) / 9.5;
        const hy = (y - 19) / 12;
        const inHead = hx * hx + hy * hy <= 1;
        const sx = (x - 24) / 23;
        const sy = (y - 52) / 17;
        const inBody = y > 34 && sx * sx + sy * sy <= 1;
        const inNeck = y >= 28 && y <= 38 && Math.abs(x - 24) <= 5;
        let lum;
        if (inHead) {
          lum = 0.98 - 0.6 * Math.hypot((x - 19) / 12, (y - 14) / 14);
          if (y < 11) lum *= 0.5;
          if (y >= 17 && y <= 19 && Math.abs(x - 24) >= 2 && Math.abs(x - 24) <= 7) lum *= 0.3;
          if (y >= 26) lum *= 0.7;
        } else if (inNeck) lum = 0.26;
        else if (inBody)
          lum =
            0.66 -
            0.5 * Math.hypot((x - 14) / 30, (y - 38) / 18) -
            (Math.abs(x - 24) < 3 && y < 44 ? 0.3 : 0);
        else lum = 0;
        const on = lum * 16 > BAYER4[(y & 3) * 4 + (x & 3)] + 0.5;
        const i = (y * S + x) * 4;
        d[i] = on ? 143 : 8;
        d[i + 1] = on ? 166 : 14;
        d[i + 2] = on ? 192 : 26;
        d[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return cv;
  }
  function drawColonel(heavy) {
    const g = colCtx;
    const S = 48;
    let i;
    let n;
    if (!g) return;
    g.drawImage(colBase, 0, 0);
    if (reduceMotion) return;
    if (heavy) n = 6;
    else n = Math.random() < 0.55 ? 1 : 2;
    for (i = 0; i < n; i++) {
      const y = (Math.random() * S) | 0;
      const h = 1 + ((Math.random() * (heavy ? 6 : 3)) | 0);
      const dx = ((Math.random() - 0.5) * (heavy ? 20 : 6)) | 0;
      g.fillStyle = '#08101c';
      g.fillRect(0, y, S, h);
      g.drawImage(colBase, 0, y, S, h, dx, y, S, h);
    }
    n = heavy ? 16 : 3;
    for (i = 0; i < n; i++) {
      const ry = (Math.random() * S) | 0;
      g.fillStyle = 'rgba(184,198,214,' + (0.15 + Math.random() * 0.5).toFixed(2) + ')';
      for (let sx2 = 0; sx2 < S; sx2 += 2) if (Math.random() < 0.5) g.fillRect(sx2, ry, 2, 1);
    }
  }
  function glitchColonel(on) {
    if (colTimer) {
      clearInterval(colTimer);
      colTimer = null;
    }
    drawColonel(false);
    if (!on || reduceMotion) return;
    colFrame = 0;
    colTimer = setInterval(function () {
      colFrame++;
      drawColonel(colFrame % 27 < 3);
    }, 110);
  }

  // browsers keep an AudioContext suspended until it is resumed inside a real gesture
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
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      osc.connect(g).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch (e) {}
  }
  function sfxPickup() {
    beep(880, 0.08);
    setTimeout(function () {
      beep(1320, 0.1);
    }, 70);
  }
  function sfxSpot() {
    beep(1660, 0.07, 'square', 0.05);
    setTimeout(function () {
      beep(1976, 0.12, 'square', 0.05);
    }, 80);
  }
  function sfxKnock() {
    beep(180, 0.06, 'square', 0.06);
    setTimeout(function () {
      beep(150, 0.07, 'square', 0.05);
    }, 90);
  }
  function sfxCQC() {
    beep(120, 0.12, 'sawtooth', 0.06);
  }
  function sfxClear() {
    [523, 659, 784, 1046].forEach(function (f, i) {
      setTimeout(function () {
        beep(f, 0.12, 'square', 0.05);
      }, i * 90);
    });
  }
  function sfxOver() {
    [392, 330, 262, 196].forEach(function (f, i) {
      setTimeout(function () {
        beep(f, 0.22, 'sawtooth', 0.06);
      }, i * 160);
    });
  }
  function startAlertMusic() {
    if (alertLoop || muted) return;
    let step = 0;
    alertLoop = setInterval(function () {
      if (!open || muted) return;
      beep(step % 2 ? 330 : 247, 0.13, 'sawtooth', 0.05);
      step++;
    }, 230);
  }
  function stopAlertMusic() {
    if (alertLoop) {
      clearInterval(alertLoop);
      alertLoop = null;
    }
  }

  // grid helpers
  function px(t) {
    return t * TILE + TILE / 2;
  }
  function tcol(x) {
    return (x / TILE) | 0;
  }
  function trow(y) {
    return (y / TILE) | 0;
  }
  function isWallPx(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    return walls[(y / TILE) | 0][(x / TILE) | 0];
  }
  function circleHitsWall(cx, cy, r) {
    if (cx - r < 0 || cy - r < 0 || cx + r >= W || cy + r >= H) return true;
    const c0 = Math.max(0, ((cx - r) / TILE) | 0);
    const c1 = Math.min(COLS - 1, ((cx + r) / TILE) | 0);
    const r0 = Math.max(0, ((cy - r) / TILE) | 0);
    const r1 = Math.min(ROWS - 1, ((cy + r) / TILE) | 0);
    for (let rr = r0; rr <= r1; rr++)
      for (let cc = c0; cc <= c1; cc++) {
        if (!walls[rr][cc]) continue;
        const nx = Math.max(cc * TILE, Math.min(cx, cc * TILE + TILE));
        const ny = Math.max(rr * TILE, Math.min(cy, rr * TILE + TILE));
        const dx = cx - nx;
        const dy = cy - ny;
        if (dx * dx + dy * dy < r * r) return true;
      }
    return false;
  }
  function losClear(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / LOS_STEP));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (isWallPx(x0 + dx * t, y0 + dy * t)) return false;
    }
    return true;
  }
  function angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }
  function rayHit(x, y, a, maxd) {
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    for (let d = LOS_STEP; d <= maxd; d += LOS_STEP)
      if (isWallPx(x + cs * d, y + sn * d))
        return { x: x + cs * (d - LOS_STEP), y: y + sn * (d - LOS_STEP) };
    return { x: x + cs * maxd, y: y + sn * maxd };
  }
  function bfsStep(sc, sr, gc, gr) {
    if (sc === gc && sr === gr) return null;
    if (gc < 0 || gr < 0 || gc >= COLS || gr >= ROWS || walls[gr][gc]) return null;
    const N = COLS * ROWS;
    const vis = new Uint8Array(N);
    const prev = new Int32Array(N);
    const q = new Int32Array(N);
    let head = 0;
    let tail = 0;
    const startK = sr * COLS + sc;
    const goalK = gr * COLS + gc;
    q[head++] = startK;
    vis[startK] = 1;
    prev[startK] = -1;
    const dc = [1, -1, 0, 0];
    const dr = [0, 0, 1, -1];
    while (tail < head) {
      const cur = q[tail++];
      const cc = cur % COLS;
      const cr = (cur / COLS) | 0;
      if (cur === goalK) break;
      for (let i = 0; i < 4; i++) {
        const nc = cc + dc[i];
        const nr = cr + dr[i];
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || walls[nr][nc]) continue;
        const k = nr * COLS + nc;
        if (vis[k]) continue;
        vis[k] = 1;
        prev[k] = cur;
        q[head++] = k;
      }
    }
    if (!vis[goalK]) return null;
    let c2 = goalK;
    while (prev[c2] !== -1 && prev[c2] !== startK) c2 = prev[c2];
    return { dc: (c2 % COLS) - sc, dr: ((c2 / COLS) | 0) - sr };
  }
  function emitNoise(x, y, radius) {
    noisePings.push({ x: x, y: y, r: radius, t: 0 });
    if (alertPhase === 'alert' || alertPhase === 'evasion') return;
    for (let i = 0; i < guards.length; i++) {
      const g = guards[i];
      if (g.down) continue;
      if (g.behavior === 'investigate' && g.invTimer > 0) continue;
      if (Math.hypot(g.x - x, g.y - y) <= radius) {
        g.behavior = 'investigate';
        g.invC = tcol(x);
        g.invR = trow(y);
        g.invTimer = SEARCH_TIME;
        g.scanning = false;
      }
    }
  }
  function addPulse(x, y, rgb) {
    if (fxPulses.length < 6) fxPulses.push({ x: x, y: y, c: rgb, t: 0 });
  }

  function loadLevel(i) {
    level = LEVELS[i];
    walls = level.map.map(function (row) {
      return row.split('').map(function (ch) {
        return ch === '#';
      });
    });
    player = { x: px(level.start[0]), y: px(level.start[1]), fx: 0, fy: -1, moving: false };
    exitPt = { x: px(level.exit[0]), y: px(level.exit[1]) };
    intel = level.intel ? { x: px(level.intel[0]), y: px(level.intel[1]) } : null;
    intelGot = !level.intel;
    exitGlowGrad = ctx.createRadialGradient(exitPt.x, exitPt.y, 3, exitPt.x, exitPt.y, 20);
    exitGlowGrad.addColorStop(0, 'rgba(184,198,214,1)');
    exitGlowGrad.addColorStop(1, 'rgba(184,198,214,0)');
    if (intel) {
      intelHaloGrad = ctx.createRadialGradient(intel.x, intel.y, 2, intel.x, intel.y, 18);
      intelHaloGrad.addColorStop(0, 'rgba(184,198,214,1)');
      intelHaloGrad.addColorStop(1, 'rgba(184,198,214,0)');
    } else intelHaloGrad = null;

    guards = level.guards.map(function (g) {
      const path = g.path.map(function (p) {
        return { x: px(p[0]), y: px(p[1]) };
      });
      const a = path[0];
      const b = path[1 % path.length];
      const off = g.offset || 0;
      return {
        path: path,
        speed: g.speed,
        fov: g.fov,
        range: g.range,
        x: a.x + (b.x - a.x) * off,
        y: a.y + (b.y - a.y) * off,
        i: 1 % path.length,
        mode: 'move',
        pscanT: 0,
        pscanBase: 0,
        facing: Math.atan2(b.y - a.y, b.x - a.x),
        behavior: 'patrol',
        invC: 0,
        invR: 0,
        invTimer: 0,
        scanning: false,
        scanBase: 0,
        scanT: 0,
        seeing: false,
        _was: false,
        spotTimer: 0,
        fovMul: 1,
        rangeMul: 1,
        down: false,
        glimpseC: 0,
        glimpseR: 0,
        lastMark: null,
        markSince: 0,
      };
    });
    cameras = (level.cameras || []).map(function (c) {
      return {
        x: px(c.t[0]),
        y: px(c.t[1]),
        base: c.base,
        arc: c.arc,
        speed: c.speed,
        fov: c.fov,
        range: c.range,
        facing: c.base,
        seeing: false,
        spotTimer: 0,
        isCam: true,
      };
    });

    alertPhase = 'normal';
    alertGrace = 0;
    evasionTimer = 0;
    cautionTimer = 0;
    lastKnown = null;
    alertsThisLevel = 0;
    life = 1;
    elapsed = 0;
    boxed = false;
    running = false;
    noiseAccum = 0;
    knockCD = 0;
    cqcCD = 0;
    walkPhase = 0;
    noisePings = [];
    boxHinted = false;
    hitFlashT = 0;
    hitBeepCD = 0;
    fxPulses.length = 0;
    hideToast();
    stopAlertMusic();
    hudLevel.textContent = i + 1 + '/' + LEVELS.length;
    if (stage) stage.classList.remove('alarm');
    updateHud();
    buildBg();
  }

  // a fixed hash, not Math.random, so every rebuild bakes the same floor
  function hash01(n) {
    const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return v - Math.floor(v);
  }
  function bakeFloorIdentity(b) {
    const kind = level.floor;
    let i;
    let x;
    let y;
    if (kind === 'dock') {
      b.lineWidth = 1;
      b.beginPath();
      for (y = 4; y < H; y += 8)
        for (x = 4 + ((y >> 3) & 1) * 4; x < W; x += 8) {
          if (((x + y) >> 3) & 1) {
            b.moveTo(x - 2, y + 1.5);
            b.lineTo(x + 2, y - 1.5);
          } else {
            b.moveTo(x - 2, y - 1.5);
            b.lineTo(x + 2, y + 1.5);
          }
        }
      b.save();
      b.translate(0, 1);
      b.strokeStyle = 'rgba(0,0,0,0.5)';
      b.stroke();
      b.restore();
      b.strokeStyle = 'rgba(184,198,214,0.11)';
      b.stroke();

      b.beginPath();
      for (x = TILE * 4; x < W; x += TILE * 4) {
        b.moveTo(x + 0.5, 0);
        b.lineTo(x + 0.5, H);
      }
      for (y = TILE * 3; y < H; y += TILE * 3) {
        b.moveTo(0, y + 0.5);
        b.lineTo(W, y + 0.5);
      }
      b.strokeStyle = 'rgba(0,0,0,0.45)';
      b.stroke();
      b.fillStyle = 'rgba(184,198,214,0.12)';
      for (x = TILE * 4; x < W; x += TILE * 4)
        for (y = 6; y < H; y += 12) b.fillRect(x - 2, y, 1, 1);

      b.strokeStyle = 'rgba(184,198,214,0.035)';
      b.lineWidth = 2;
      b.beginPath();
      for (i = 0; i < 14; i++) {
        x = hash01(500 + i * 2) * W;
        y = hash01(501 + i * 2) * H;
        const len = 70 + hash01(700 + i) * 110;
        b.moveTo(x, y);
        b.lineTo(x + len, y + len * 0.12);
      }
      b.stroke();

      const drains = [
        [6, 7],
        [13, 1],
        [15, 10],
      ];
      for (i = 0; i < drains.length; i++) {
        const dx0 = drains[i][0] * TILE + 6;
        const dy0 = drains[i][1] * TILE + 10;
        b.fillStyle = '#030710';
        b.fillRect(dx0, dy0, 20, 12);
        b.fillStyle = 'rgba(143,166,192,0.14)';
        b.fillRect(dx0 + 3 + i * 3, dy0 + 5, 7, 1);
        b.fillStyle = 'rgba(124,138,156,0.5)';
        for (x = dx0 + 2; x < dx0 + 20; x += 3) b.fillRect(x, dy0, 1, 12);
        b.strokeStyle = 'rgba(124,138,156,0.45)';
        b.lineWidth = 1;
        b.strokeRect(dx0 + 0.5, dy0 + 0.5, 19, 11);
      }

      const hy = (ROWS - 1) * TILE - 5;
      b.save();
      b.beginPath();
      b.rect(TILE, hy, W - TILE * 2, 5);
      b.clip();
      b.fillStyle = 'rgba(0,0,0,0.35)';
      b.fillRect(TILE, hy, W - TILE * 2, 5);
      b.strokeStyle = 'rgba(195,203,213,0.3)';
      b.lineWidth = 4;
      b.beginPath();
      for (x = TILE - 8; x < W; x += 12) {
        b.moveTo(x, hy + 6);
        b.lineTo(x + 6, hy - 1);
      }
      b.stroke();
      b.restore();

      const pools = [
        [px(4), TILE, 110],
        [px(15), H - TILE, 100],
        [W - TILE, px(6), 80],
      ];
      for (i = 0; i < pools.length; i++) {
        const fl = b.createRadialGradient(
          pools[i][0],
          pools[i][1],
          4,
          pools[i][0],
          pools[i][1],
          pools[i][2],
        );
        fl.addColorStop(0, 'rgba(210,220,232,0.10)');
        fl.addColorStop(1, 'rgba(210,220,232,0)');
        b.fillStyle = fl;
        b.fillRect(
          pools[i][0] - pools[i][2],
          pools[i][1] - pools[i][2],
          pools[i][2] * 2,
          pools[i][2] * 2,
        );
      }
    } else if (kind === 'bridge') {
      b.fillStyle = '#030812';
      b.fillRect(0, 0, W, H);
      for (i = 0; i < 90; i++) {
        x = hash01(i * 5) * W;
        y = hash01(i * 5 + 1) * H;
        b.fillStyle = 'rgba(143,166,192,' + (0.05 + hash01(i * 5 + 3) * 0.11).toFixed(3) + ')';
        b.fillRect(x | 0, y | 0, (6 + hash01(i * 5 + 2) * 24) | 0, 1);
      }

      b.beginPath();
      for (x = 0.5; x < W; x += 4) {
        b.moveTo(x, 0);
        b.lineTo(x, H);
      }
      for (y = 0.5; y < H; y += 4) {
        b.moveTo(0, y);
        b.lineTo(W, y);
      }
      b.strokeStyle = 'rgba(96,110,128,0.17)';
      b.lineWidth = 1;
      b.stroke();

      b.beginPath();
      for (x = TILE * 2; x < W; x += TILE * 2) {
        b.moveTo(x + 1, 0);
        b.lineTo(x + 1, H);
      }
      b.strokeStyle = 'rgba(130,144,160,0.24)';
      b.lineWidth = 2;
      b.stroke();

      b.fillStyle = 'rgba(195,203,213,0.22)';
      b.fillRect(TILE, TILE + 1, W - 2 * TILE, 2);
      b.fillRect(TILE, H - TILE - 3, W - 2 * TILE, 2);
      for (x = TILE + 8; x < W - TILE; x += 24) {
        b.fillRect(x, TILE + 1, 2, 5);
        b.fillRect(x, H - TILE - 6, 2, 5);
      }
    } else if (kind === 'core') {
      b.strokeStyle = 'rgba(143,166,192,0.035)';
      b.lineWidth = 1;
      b.beginPath();
      for (x = -H; x < W; x += 8) {
        b.moveTo(x, 0);
        b.lineTo(x + H, H);
        b.moveTo(x + H, 0);
        b.lineTo(x, H);
      }
      b.stroke();

      b.strokeStyle = 'rgba(0,0,0,0.28)';
      b.beginPath();
      for (x = TILE * 2; x < W; x += TILE * 2) {
        b.moveTo(x + 0.5, 0);
        b.lineTo(x + 0.5, H);
      }
      for (y = TILE * 2; y < H; y += TILE * 2) {
        b.moveTo(0, y + 0.5);
        b.lineTo(W, y + 0.5);
      }
      b.stroke();
      b.fillStyle = 'rgba(184,198,214,0.12)';
      for (x = TILE * 2; x < W; x += TILE * 2)
        for (y = TILE * 2; y < H; y += TILE * 2) b.fillRect(x - 1, y - 1, 3, 3);

      const cam = (level.cameras || [])[0];
      if (cam && cam.t[1] + 1 < ROWS - 1) {
        const cr = cam.t[1] + 1;
        const c0 = Math.max(1, cam.t[0] - 3);
        const c1 = Math.min(COLS - 2, cam.t[0] + 3);
        const yb = cr * TILE;
        let cc;
        let any = false;
        b.save();
        b.beginPath();
        for (cc = c0; cc <= c1; cc++)
          if (!walls[cr][cc]) {
            b.rect(cc * TILE, yb + 4, TILE, TILE - 8);
            any = true;
          }
        if (any) {
          b.clip();
          b.strokeStyle = 'rgba(195,203,213,0.26)';
          b.lineWidth = 3;
          b.beginPath();
          for (x = c0 * TILE - 6; x < (c1 + 1) * TILE + 6; x += 12) {
            b.moveTo(x, yb + 4);
            b.lineTo(x + 7, yb + TILE / 2);
            b.lineTo(x, yb + TILE - 4);
          }
          b.stroke();
        }
        b.restore();
      }
    }
  }
  function bakeDoorway(b, ec, er) {
    // on the bridge the door opens into the strut on the right, never over the water
    const dirs =
      level.floor === 'bridge'
        ? [
            [1, 0],
            [-1, 0],
            [0, -1],
            [0, 1],
          ]
        : [
            [0, -1],
            [0, 1],
            [-1, 0],
            [1, 0],
          ];
    let d = null;
    let i;
    for (i = 0; i < dirs.length; i++) {
      const nc = ec + dirs[i][0];
      const nr = er + dirs[i][1];
      if (nc >= 0 && nr >= 0 && nc < COLS && nr < ROWS && walls[nr][nc]) {
        d = dirs[i];
        break;
      }
    }
    if (!d) return;
    const wx = (ec + d[0]) * TILE;
    const wy = (er + d[1]) * TILE;
    const vert = d[1] !== 0;
    let ox;
    let oy;
    let ow;
    let oh;
    if (vert) {
      ox = wx + 8;
      ow = TILE - 16;
      oh = TILE - 4;
      oy = d[1] < 0 ? wy + 4 : wy;
    } else {
      oy = wy + 8;
      oh = TILE - 16;
      ow = TILE - 4;
      ox = d[0] < 0 ? wx + 4 : wx;
    }
    b.fillStyle = '#040a16';
    b.fillRect(ox, oy, ow, oh);
    b.fillStyle = 'rgba(184,198,214,0.55)';
    if (vert) b.fillRect(ox + 2, d[1] < 0 ? oy : oy + oh - 3, ow - 4, 3);
    else b.fillRect(d[0] < 0 ? ox : ox + ow - 3, oy + 2, 3, oh - 4);
    b.fillStyle = 'rgba(184,198,214,0.10)';
    for (i = 1; i <= 2; i++) {
      if (vert) b.fillRect(ox + 3, d[1] < 0 ? oy + 3 + i * 8 : oy + oh - 4 - i * 8, ow - 6, 1);
      else b.fillRect(d[0] < 0 ? ox + 3 + i * 8 : ox + ow - 4 - i * 8, oy + 3, 1, oh - 6);
    }
    const x0 = ox + 0.5;
    const y0 = oy + 0.5;
    const x1 = ox + ow - 0.5;
    const y1 = oy + oh - 0.5;
    b.strokeStyle = 'rgba(184,198,214,0.7)';
    b.lineWidth = 1;
    b.beginPath();
    if (vert && d[1] < 0) {
      b.moveTo(x0, y1 + 1);
      b.lineTo(x0, y0);
      b.lineTo(x1, y0);
      b.lineTo(x1, y1 + 1);
    } else if (vert) {
      b.moveTo(x0, y0 - 1);
      b.lineTo(x0, y1);
      b.lineTo(x1, y1);
      b.lineTo(x1, y0 - 1);
    } else if (d[0] < 0) {
      b.moveTo(x1 + 1, y0);
      b.lineTo(x0, y0);
      b.lineTo(x0, y1);
      b.lineTo(x1 + 1, y1);
    } else {
      b.moveTo(x0 - 1, y0);
      b.lineTo(x1, y0);
      b.lineTo(x1, y1);
      b.lineTo(x0 - 1, y1);
    }
    b.stroke();

    const tx = px(ec) + (d[0] * TILE) / 2;
    const ty = px(er) + (d[1] * TILE) / 2;
    const sr = TILE * 1.1;
    const sp = b.createRadialGradient(tx, ty, 2, tx, ty, sr);
    sp.addColorStop(0, 'rgba(184,198,214,0.42)');
    sp.addColorStop(0.55, 'rgba(184,198,214,0.13)');
    sp.addColorStop(1, 'rgba(184,198,214,0)');
    b.save();
    b.beginPath();
    b.rect(ec * TILE, er * TILE, TILE, TILE);
    b.clip();
    b.fillStyle = sp;
    b.fillRect(tx - sr, ty - sr, sr * 2, sr * 2);
    b.restore();
  }
  function isWaterRow(r) {
    return (
      (level.floor === 'dock' && r === ROWS - 1) ||
      (level.floor === 'bridge' && (r === 0 || r === ROWS - 1))
    );
  }
  function isCrate(c, r) {
    return (
      level.floor === 'bridge' && c > 0 && c < COLS - 1 && r > 0 && r < ROWS - 1 && walls[r][c]
    );
  }
  function bakeWaterRow(b, r) {
    const y0 = r * TILE;
    const x0 = TILE;
    const w = W - 2 * TILE;
    let x;
    let i;
    const top = r === 0;
    b.fillStyle = '#02060e';
    b.fillRect(x0, y0, w, TILE);
    b.fillStyle = 'rgba(143,166,192,0.05)';
    for (i = 0; i < 16; i++)
      b.fillRect(
        (x0 + hash01(900 + i + r) * w) | 0,
        y0 + 4 + ((hash01(940 + i + r) * (TILE - 12)) | 0),
        (20 + hash01(980 + i) * 50) | 0,
        1,
      );
    if (level.floor === 'bridge') {
      const ry = top ? y0 + TILE - 4 : y0 + 2;
      b.fillStyle = 'rgba(0,0,0,0.45)';
      b.fillRect(x0, top ? y0 + TILE - 9 : y0 + 4, w, 5);
      b.fillStyle = 'rgba(195,203,213,0.42)';
      b.fillRect(x0, ry, w, 2);
      for (x = x0 + 2 * TILE; x < x0 + w; x += 2 * TILE) {
        b.fillStyle = 'rgba(195,203,213,0.55)';
        b.fillRect(x - 1, top ? ry - 5 : ry, 3, 7);
        b.fillStyle = 'rgba(0,0,0,0.5)';
        b.fillRect(x - 1, top ? ry - 6 : ry + 7, 3, 1);
      }
    } else {
      b.fillStyle = '#3a4658';
      b.fillRect(x0, y0, w, 3);
      b.fillStyle = 'rgba(0,0,0,0.5)';
      b.fillRect(x0, y0 + 3, w, 3);
      for (x = x0 + 2 * TILE; x < x0 + w; x += 4 * TILE) {
        b.fillStyle = '#566478';
        b.fillRect(x - 4, y0 - 2, 8, 7);
        b.fillStyle = 'rgba(195,203,213,0.5)';
        b.fillRect(x - 4, y0 - 2, 8, 1);
      }
    }
  }
  function bakeCrates(b) {
    let r;
    let c;
    let i;
    for (r = 1; r < ROWS - 1; r++)
      for (c = 1; c < COLS - 1; c++) {
        if (!isCrate(c, r) || isCrate(c - 1, r) || isCrate(c, r - 1)) continue;
        let bw = 0;
        let bh = 0;
        while (isCrate(c + bw, r)) bw++;
        while (isCrate(c, r + bh)) bh++;
        const x0 = c * TILE;
        const y0 = r * TILE;
        const w = bw * TILE;
        const h = bh * TILE;
        const fh = 7;
        const top = h - fh;
        b.fillStyle = 'rgba(0,0,0,0.42)';
        b.fillRect(x0 + 2, y0 + h, w, 5);
        b.fillStyle = '#2a3546';
        b.fillRect(x0, y0, w, top);
        b.fillStyle = '#131b28';
        b.fillRect(x0, y0 + top, w, fh);
        b.fillStyle = 'rgba(0,0,0,0.35)';
        for (i = 4; i < w; i += 4) b.fillRect(x0 + i, y0 + top, 1, fh);
        for (i = 3; i < w - 2; i += 4) {
          b.fillStyle = 'rgba(0,0,0,0.26)';
          b.fillRect(x0 + i, y0 + 2, 1, top - 4);
          b.fillStyle = 'rgba(192,202,214,0.07)';
          b.fillRect(x0 + i + 1, y0 + 2, 1, top - 4);
        }
        const sy = y0 + (top >> 1);
        b.fillStyle = 'rgba(0,0,0,0.55)';
        b.fillRect(x0 + 1, sy, w - 2, 1);
        b.fillStyle = 'rgba(192,202,214,0.14)';
        b.fillRect(x0 + 1, sy + 1, w - 2, 1);
        b.fillStyle = 'rgba(195,203,213,0.32)';
        for (i = 0; i < 5; i++) b.fillRect(x0 + 8 + i * 5, y0 + 7, 3, 2);
        b.fillStyle = '#566478';
        b.fillRect(x0, y0, 4, 4);
        b.fillRect(x0 + w - 4, y0, 4, 4);
        b.fillRect(x0, y0 + top - 4, 4, 4);
        b.fillRect(x0 + w - 4, y0 + top - 4, 4, 4);
        b.strokeStyle = 'rgba(138,156,180,0.45)';
        b.lineWidth = 1;
        b.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
        b.fillStyle = 'rgba(184,198,214,0.22)';
        b.fillRect(x0 + 1, y0, w - 2, 1);
      }
  }
  function bakeSeaGlints() {
    seaGlints = null;
    if (level.floor !== 'dock' && level.floor !== 'bridge') return;
    seaGlints = document.createElement('canvas');
    seaGlints.width = Math.ceil((W + 8) * dpr);
    seaGlints.height = Math.ceil(TILE * dpr);
    const g = seaGlints.getContext('2d');
    let i;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (i = 0; i < 26; i++) {
      g.fillStyle = 'rgba(184,198,214,' + (0.1 + hash01(i * 7 + 3) * 0.16).toFixed(3) + ')';
      g.fillRect(
        (hash01(i * 7) * (W + 8)) | 0,
        9 + ((hash01(i * 7 + 1) * 13) | 0),
        (4 + hash01(i * 7 + 2) * 16) | 0,
        1,
      );
    }
  }
  function buildBg() {
    bgLayer = document.createElement('canvas');
    bgLayer.width = W * dpr;
    bgLayer.height = H * dpr;
    const b = bgLayer.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    let r;
    let c;
    let x0;
    let y0;
    const fl = FLOORS[level.floor] || { a: C.floorA, b: C.floorB };

    for (r = 0; r < ROWS; r++)
      for (c = 0; c < COLS; c++) {
        x0 = c * TILE;
        y0 = r * TILE;
        b.fillStyle = (r + c) & 1 ? fl.b : fl.a;
        b.fillRect(x0, y0, TILE, TILE);
        if (!walls[r][c]) {
          b.fillStyle = C.floorDot;
          for (let dy = c & 1 ? 5 : 13; dy < TILE; dy += 16)
            for (let dx = r & 1 ? 5 : 13; dx < TILE; dx += 16) b.fillRect(x0 + dx, y0 + dy, 2, 2);
        }
      }
    bakeFloorIdentity(b);
    bakeSeaGlints();

    const ec = level.exit[0];
    const er = level.exit[1];
    const ex0 = ec * TILE;
    const ey0 = er * TILE;
    b.save();
    b.beginPath();
    b.rect(ex0 + 2, ey0 + 2, TILE - 4, TILE - 4);
    b.clip();
    b.strokeStyle = 'rgba(184,198,214,0.14)';
    b.lineWidth = 3;
    b.beginPath();
    for (let sD = -TILE; sD < TILE; sD += 8) {
      b.moveTo(ex0 + sD, ey0 + TILE);
      b.lineTo(ex0 + sD + TILE, ey0);
    }
    b.stroke();
    b.restore();
    b.strokeStyle = 'rgba(184,198,214,0.25)';
    b.lineWidth = 1;
    b.strokeRect(ex0 + 2.5, ey0 + 2.5, TILE - 5, TILE - 5);

    b.strokeStyle = C.grid;
    b.lineWidth = 1;
    b.beginPath();
    for (let x = TILE; x < W; x += TILE) {
      b.moveTo(x + 0.5, 0);
      b.lineTo(x + 0.5, H);
    }
    for (let y = TILE; y < H; y += TILE) {
      b.moveTo(0, y + 0.5);
      b.lineTo(W, y + 0.5);
    }
    b.stroke();

    for (r = 0; r < ROWS; r++) if (isWaterRow(r)) bakeWaterRow(b, r);
    for (r = 0; r < ROWS; r++)
      for (c = 0; c < COLS; c++) {
        if (!walls[r][c]) continue;
        if (isWaterRow(r) && c > 0 && c < COLS - 1) continue;
        if (isCrate(c, r)) continue;
        x0 = c * TILE;
        y0 = r * TILE;
        const oN = r > 0 && !walls[r - 1][c];
        const oS = r < ROWS - 1 && !walls[r + 1][c];
        const oW = c > 0 && !walls[r][c - 1];
        const oE = c < COLS - 1 && !walls[r][c + 1];
        b.fillStyle = C.wallFace;
        b.fillRect(x0, y0, TILE, TILE);

        b.save();
        b.beginPath();
        b.rect(x0, y0, TILE, TILE);
        b.clip();
        b.strokeStyle = 'rgba(0,0,0,0.16)';
        b.lineWidth = 1;
        b.beginPath();
        for (let h = -TILE; h < TILE; h += 6) {
          b.moveTo(x0 + h, y0 + TILE);
          b.lineTo(x0 + h + TILE, y0);
        }
        b.stroke();
        b.restore();

        if (oN) {
          b.fillStyle = C.wallTop;
          b.fillRect(x0, y0, TILE, 3);
          b.fillStyle = C.wallRim;
          b.fillRect(x0, y0, TILE, 1);
        }
        if (oW) {
          b.fillStyle = C.wallTop;
          b.fillRect(x0, y0, 3, TILE);
        }
        if (oS) {
          b.fillStyle = C.wallFront;
          b.fillRect(x0, y0 + TILE - 7, TILE, 7);
          b.fillStyle = 'rgba(0,0,0,0.28)';
          b.fillRect(x0, y0 + TILE - 7, TILE, 1);
          b.fillStyle = 'rgba(0,0,0,0.25)';
          for (let vx = 6; vx < TILE; vx += 10) b.fillRect(x0 + vx, y0 + TILE - 7, 1, 7);
        }
        if (oE) {
          b.fillStyle = C.wallSide;
          b.fillRect(x0 + TILE - 3, y0, 3, TILE);
        }

        b.strokeStyle = C.wallEdge;
        b.lineWidth = 1;
        b.beginPath();
        if (oN) {
          b.moveTo(x0, y0 + 0.5);
          b.lineTo(x0 + TILE, y0 + 0.5);
        }
        if (oS) {
          b.moveTo(x0, y0 + TILE - 0.5);
          b.lineTo(x0 + TILE, y0 + TILE - 0.5);
        }
        if (oW) {
          b.moveTo(x0 + 0.5, y0);
          b.lineTo(x0 + 0.5, y0 + TILE);
        }
        if (oE) {
          b.moveTo(x0 + TILE - 0.5, y0);
          b.lineTo(x0 + TILE - 0.5, y0 + TILE);
        }
        b.stroke();
        if (oS) {
          b.fillStyle = C.wallShadow;
          b.fillRect(x0, y0 + TILE, TILE, 5);
        }
      }
    if (level.floor === 'bridge') bakeCrates(b);
    bakeDoorway(b, ec, er);

    const lg = b.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.62);
    lg.addColorStop(0, 'rgba(164,182,204,0.05)');
    lg.addColorStop(0.6, 'rgba(0,0,0,0)');
    lg.addColorStop(1, 'rgba(0,0,0,0.32)');
    b.fillStyle = lg;
    b.fillRect(0, 0, W, H);

    const mw = Math.ceil(W * RADAR_SC);
    const mh = Math.ceil(H * RADAR_SC);
    const ts = TILE * RADAR_SC;
    radarMap = document.createElement('canvas');
    radarMap.width = Math.ceil(mw * dpr);
    radarMap.height = Math.ceil(mh * dpr);
    const m = radarMap.getContext('2d');
    m.setTransform(dpr, 0, 0, dpr, 0, 0);
    m.fillStyle = 'rgba(8,16,30,0.72)';
    m.fillRect(0, 0, mw, mh);
    for (r = 0; r < ROWS; r++)
      for (c = 0; c < COLS; c++) {
        if (!walls[r][c]) continue;
        m.fillStyle = 'rgba(143,166,192,0.42)';
        m.fillRect(c * ts, r * ts, ts + 0.5, ts + 0.5);
        if (r > 0 && !walls[r - 1][c]) {
          m.fillStyle = 'rgba(184,198,214,0.7)';
          m.fillRect(c * ts, r * ts, ts + 0.5, 1);
        }
      }
  }
  function playerTile() {
    return { c: tcol(player.x), r: trow(player.y) };
  }

  function update(dt) {
    knockCD = Math.max(0, knockCD - dt);
    cqcCD = Math.max(0, cqcCD - dt);
    shakeT = Math.max(0, shakeT - dt);
    hitFlashT = Math.max(0, hitFlashT - dt);
    hitBeepCD = Math.max(0, hitBeepCD - dt);
    updatePlayer(dt);

    if (intel && !intelGot && Math.hypot(player.x - intel.x, player.y - intel.y) < PICKUP_R) {
      if (boxed) {
        if (!boxHinted) {
          boxHinted = true;
          announce('Leave the box to take the intel.');
        }
      } else {
        intelGot = true;
        sfxPickup();
        addPulse(intel.x, intel.y, '233,231,226');
        announce('Intel acquired. Reach the exit.');
        updateHud();
      }
    }
    if (intelGot && Math.hypot(player.x - exitPt.x, player.y - exitPt.y) < EXIT_R) {
      levelClear();
      return;
    }

    for (let n = noisePings.length - 1; n >= 0; n--) {
      noisePings[n].t += dt;
      if (noisePings[n].t > 0.6) noisePings.splice(n, 1);
    }
    for (let n = fxPulses.length - 1; n >= 0; n--) {
      fxPulses[n].t += dt;
      if (fxPulses[n].t > 0.45) fxPulses.splice(n, 1);
    }

    const roomAlert = alertPhase === 'alert' || alertPhase === 'evasion';
    for (let gi = 0; gi < guards.length; gi++) updateGuard(guards[gi], dt, roomAlert);
    for (let ci = 0; ci < cameras.length; ci++) updateCamera(cameras[ci]);

    let losNow = false;
    let fullSpot = false;
    let k;
    for (k = 0; k < guards.length; k++) {
      const g = guards[k];
      if (g.down) {
        g.seeing = false;
        continue;
      }
      const see = detect(g);
      if (see) {
        losNow = true;
        g.spotTimer = Math.min(SPOT_FULL, g.spotTimer + spotSpeed(g) * dt);
        g.glimpseC = tcol(player.x);
        g.glimpseR = trow(player.y);
        if (g.spotTimer >= SPOT_FULL) fullSpot = true;
      } else {
        g.spotTimer = Math.max(0, g.spotTimer - dt * 1.4);
        if (g._was && !roomAlert && g.behavior !== 'investigate') {
          g.behavior = 'investigate';
          g.invC = g.glimpseC;
          g.invR = g.glimpseR;
          g.invTimer = SEARCH_TIME;
          g.scanning = false;
        }
      }
      g.seeing = see;
      g._was = see;
    }
    for (k = 0; k < cameras.length; k++) {
      const cam = cameras[k];
      const cs = detect(cam);
      if (cs) {
        losNow = true;
        cam.spotTimer = Math.min(SPOT_FULL, cam.spotTimer + spotSpeed(cam) * dt);
        if (cam.spotTimer >= SPOT_FULL) fullSpot = true;
      } else cam.spotTimer = Math.max(0, cam.spotTimer - dt * 1.4);
      cam.seeing = cs;
    }

    phaseMachine(dt, losNow, fullSpot);

    if (roomAlert) {
      let shot = false;
      let grabbed = false;
      for (k = 0; k < guards.length; k++) {
        const gg = guards[k];
        if (gg.down) continue;
        if (gg.seeing) shot = true;
        if (!boxed && Math.hypot(gg.x - player.x, gg.y - player.y) < GRAB_DIST) grabbed = true;
      }
      if (grabbed) life = 0;
      else if (shot) {
        life = Math.max(0, life - SHOOT_RATE * dt);
        hitFlashT = 0.18;
        if (!reduceMotion) shakeT = Math.max(shakeT, 0.12);
        if (hitBeepCD <= 0) {
          hitBeepCD = 0.3;
          beep(196, 0.06, 'sawtooth', 0.05);
        }
      }
    } else if (alertPhase === 'normal') {
      life = Math.min(1, life + REGEN * dt);
    }
    if (life <= 0) {
      gameOver();
      return;
    }

    elapsed += dt;
    updateHud();
  }

  function spotSpeed(d) {
    const dist = Math.hypot(player.x - d.x, player.y - d.y);
    const range = d.range * (d.rangeMul || 1);
    return 1.4 + (1 - Math.min(1, dist / range)) * 2.6;
  }
  function detect(d) {
    if (boxed && !player.moving) return false;
    const dx = player.x - d.x;
    const dy = player.y - d.y;
    const dist = Math.hypot(dx, dy);
    const range = d.range * (d.rangeMul || 1);
    if (dist > range || dist < 0.001) return false;
    if (Math.abs(angDiff(Math.atan2(dy, dx), d.facing)) > (d.fov * (d.fovMul || 1)) / 2)
      return false;
    return losClear(d.x, d.y, player.x, player.y);
  }

  function phaseMachine(dt, losNow, fullSpot) {
    if (alertPhase === 'normal' || alertPhase === 'caution') {
      if (alertPhase === 'caution') {
        cautionTimer -= dt;
        if (cautionTimer <= 0) alertPhase = 'normal';
      }
      if (fullSpot) enterAlert();
    } else if (alertPhase === 'alert') {
      if (losNow) {
        lastKnown = playerTile();
        alertGrace = ALERT_GRACE;
      } else {
        alertGrace -= dt;
        if (alertGrace <= 0) {
          alertPhase = 'evasion';
          evasionTimer = EVASION_TIME;
        }
      }
    } else if (alertPhase === 'evasion') {
      if (losNow) {
        alertPhase = 'alert';
        alertGrace = ALERT_GRACE;
        lastKnown = playerTile();
      } else {
        evasionTimer -= dt;
        if (evasionTimer <= 0) {
          alertPhase = 'caution';
          cautionTimer = CAUTION_TIME;
          stopAlertMusic();
        }
      }
    }
  }
  function enterAlert() {
    if (alertPhase !== 'alert' && alertPhase !== 'evasion') alertsThisLevel++;
    alertPhase = 'alert';
    alertGrace = ALERT_GRACE;
    lastKnown = playerTile();
    if (!reduceMotion) {
      shakeT = 0.35;
      flashEl.classList.remove('on');
      void flashEl.offsetWidth;
      flashEl.classList.add('on');
    }
    sfxSpot();
    startAlertMusic();
    for (let i = 0; i < guards.length; i++) {
      guards[i].behavior = 'patrol';
      guards[i].scanning = false;
    }
  }

  // player and guards
  function blocked(nx, ny) {
    if (circleHitsWall(nx, ny, PLAYER_R)) return true;
    for (let i = 0; i < guards.length; i++) {
      const g = guards[i];
      if (g.down) continue;
      const nd = Math.hypot(nx - g.x, ny - g.y);
      if (nd >= GUARD_R + PLAYER_R) continue;
      // a move away from a guard is always allowed, so a player he has walked onto can back out
      if (nd >= Math.hypot(player.x - g.x, player.y - g.y)) continue;
      return true;
    }
    return false;
  }
  function updatePlayer(dt) {
    const ix =
      (keys['arrowright'] || keys['d'] || touchDir.right ? 1 : 0) -
      (keys['arrowleft'] || keys['a'] || touchDir.left ? 1 : 0);
    const iy =
      (keys['arrowdown'] || keys['s'] || touchDir.down ? 1 : 0) -
      (keys['arrowup'] || keys['w'] || touchDir.up ? 1 : 0);
    const ox = player.x;
    const oy = player.y;
    if (ix || iy) {
      const len = Math.hypot(ix, iy);
      let spd = WALK_SPEED;
      if (boxed) spd = BOX_SPEED;
      else if (running) spd = RUN_SPEED;
      const nx = player.x + (ix / len) * spd * dt;
      if (!blocked(nx, player.y)) player.x = nx;
      const ny = player.y + (iy / len) * spd * dt;
      if (!blocked(player.x, ny)) player.y = ny;
      player.fx = ix / len;
      player.fy = iy / len;
      // moving means displaced, not key held: a boxed player pushing against a wall stays hidden
      player.moving = player.x !== ox || player.y !== oy;
      if (player.moving) walkPhase += spd * dt * 0.06;
      if (running && !boxed) {
        noiseAccum += dt;
        if (noiseAccum >= NOISE_INTERVAL_S) {
          noiseAccum = 0;
          emitNoise(player.x, player.y, RUN_NOISE_R);
        }
      } else noiseAccum = 0;
    } else {
      player.moving = false;
      noiseAccum = 0;
    }
  }
  function doBox() {
    boxed = !boxed;
    beep(boxed ? 150 : 210, 0.05, 'square', 0.05);
    announce(boxed ? 'In the box.' : 'Out of the box.');
  }
  function doKnock() {
    if (knockCD > 0) return;
    if (alertPhase === 'alert' || alertPhase === 'evasion') {
      announce('No use: already alerted.');
      return;
    }
    knockCD = KNOCK_COOLDOWN_S;
    emitNoise(player.x, player.y, KNOCK_R);
    sfxKnock();
    announce('Knocking to lure a guard.');
  }
  function doCQC() {
    if (cqcCD > 0) return;
    let best = null;
    let bestd = CQC_R;
    for (let i = 0; i < guards.length; i++) {
      const g = guards[i];
      if (g.down) continue;
      const d = Math.hypot(g.x - player.x, g.y - player.y);
      if (d > CQC_R) continue;
      const ang = Math.atan2(player.y - g.y, player.x - g.x);
      if (Math.abs(angDiff(ang, g.facing)) >= CQC_REAR && d < bestd) {
        bestd = d;
        best = g;
      }
    }
    if (best) {
      cqcCD = CQC_COOLDOWN_S;
      best.down = true;
      best.seeing = false;
      best.spotTimer = 0;
      addPulse(best.x, best.y, '184,198,214');
      sfxCQC();
      announce('Guard subdued.');
    } else announce('No guard to subdue.');
  }

  function updateGuard(g, dt, roomAlert) {
    if (g.down) return;
    const ox = g.x;
    const oy = g.y;
    let fovMul = 1;
    let rangeMul = 1;
    if (alertPhase === 'caution') {
      fovMul = 1.25;
      rangeMul = 1.12;
    }
    if (roomAlert) {
      fovMul = 1.3;
      rangeMul = 1.2;
    }
    g.fovMul = fovMul;
    g.rangeMul = rangeMul;
    if (roomAlert) {
      const tc = lastKnown ? lastKnown.c : tcol(g.x);
      const tr = lastKnown ? lastKnown.r : trow(g.y);
      if (huntToward(g, tc, tr, dt, 1.35, true)) doSearch(g, dt);
      else g.scanning = false;
    } else if (g.behavior === 'investigate' && g.invTimer > 0) {
      g.invTimer -= dt;
      if (huntToward(g, g.invC, g.invR, dt, 1.1, true)) doSearch(g, dt);
      else g.scanning = false;
      if (g.invTimer <= 0) {
        g.behavior = 'patrol';
        g.scanning = false;
        g.mode = 'move';
      }
    } else {
      g.behavior = 'patrol';
      patrolMove(g, dt);
    }
    g.moving = g.x !== ox || g.y !== oy;
    if (g.moving) g.walk = (g.walk || 0) + dt * 9;
  }
  // a boxed player cannot be grabbed, so a hunting guard stops beside the box, not on it
  function guardMoveOK(nx, ny, stopNearBox) {
    return !(
      stopNearBox &&
      boxed &&
      Math.hypot(nx - player.x, ny - player.y) < GUARD_R + PLAYER_R + 2
    );
  }
  function huntToward(g, tc, tr, dt, mul, stopNearBox) {
    const gc = tcol(g.x);
    const gr = trow(g.y);
    if (gc === tc && gr === tr) {
      const cx = px(tc);
      const cy = px(tr);
      const d = Math.hypot(cx - g.x, cy - g.y);
      if (d < 2) return true;
      const s = g.speed * mul * dt;
      g.facing = Math.atan2(cy - g.y, cx - g.x);
      const ax = d <= s ? cx : g.x + ((cx - g.x) / d) * s;
      const ay = d <= s ? cy : g.y + ((cy - g.y) / d) * s;
      if (!guardMoveOK(ax, ay, stopNearBox)) return true;
      g.x = ax;
      g.y = ay;
      return d <= s;
    }
    const step = bfsStep(gc, gr, tc, tr);
    if (!step) return true;
    const nx = px(gc + step.dc);
    const ny = px(gr + step.dr);
    const d2 = Math.hypot(nx - g.x, ny - g.y);
    const s2 = g.speed * mul * dt;
    g.facing = Math.atan2(ny - g.y, nx - g.x);
    const bx = d2 <= s2 ? nx : g.x + ((nx - g.x) / d2) * s2;
    const by = d2 <= s2 ? ny : g.y + ((ny - g.y) / d2) * s2;
    if (!guardMoveOK(bx, by, stopNearBox)) return true;
    g.x = bx;
    g.y = by;
    return false;
  }
  function doSearch(g, dt) {
    if (!g.scanning) {
      g.scanning = true;
      g.scanBase = g.facing;
      g.scanT = 0;
    }
    g.scanT += dt;
    g.facing = g.scanBase + Math.sin(g.scanT * 2.4) * 1.1;
  }
  function patrolMove(g, dt) {
    if (g.mode === 'scan') {
      g.pscanT -= dt;
      g.facing = g.pscanBase + Math.sin((SCAN_TIME - g.pscanT) * 4.2) * SCAN_ARC;
      if (g.pscanT <= 0) {
        g.i = (g.i + 1) % g.path.length;
        g.mode = 'move';
      }
      return;
    }
    // routed like a hunt: a guard coming back from one may have walls between him and the waypoint
    const tgt = g.path[g.i];
    if (huntToward(g, tcol(tgt.x), trow(tgt.y), dt, 1)) {
      g.x = tgt.x;
      g.y = tgt.y;
      g.mode = 'scan';
      g.pscanT = SCAN_TIME;
      g.pscanBase = g.facing;
    }
  }
  function updateCamera(c) {
    c.facing = c.base + Math.sin(elapsed * c.speed) * c.arc;
  }

  function phaseSecs() {
    return Math.ceil(Math.max(0, alertPhase === 'evasion' ? evasionTimer : cautionTimer));
  }
  function updateHud() {
    const ph = alertPhase;
    stateBadge.className = 'mgsg-stbadge' + (ph !== 'normal' ? ' ' + ph : '');
    if (ph === 'alert') stateBadge.textContent = '! ALERT';
    else if (ph === 'evasion') stateBadge.textContent = 'EVASION ' + phaseSecs();
    else if (ph === 'caution') stateBadge.textContent = 'CAUTION ' + phaseSecs();
    else stateBadge.textContent = 'NORMAL';
    // set only on change, or render()'s clientWidth read would force a layout every frame
    const lwid = (life * 100).toFixed(0) + '%';
    if (lwid !== lastLifeW) {
      lastLifeW = lwid;
      lifeFill.style.width = lwid;
    }
    let lcol = 'var(--mg-paper)';
    if (life > 0.5) lcol = 'var(--mg-text)';
    else if (life > 0.25) lcol = 'var(--mg-pdim)';
    if (lcol !== lastLifeC) {
      lastLifeC = lcol;
      lifeFill.style.background = lcol;
    }
    lifeFill.parentNode.classList.toggle('low', life < 0.25);
    if (!intel) hudIntel.textContent = '[--]';
    else hudIntel.textContent = intelGot ? '[OK]' : '[ ]';
    const s = Math.floor(elapsed);
    hudTime.textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    if (stage) {
      stage.classList.toggle('alarm', ph === 'alert' || ph === 'evasion');
      stage.classList.toggle('caution', ph === 'caution');
    }
    if (frame) {
      frame.classList.toggle('alarm', ph === 'alert' || ph === 'evasion');
      frame.classList.toggle('caution', ph === 'caution');
    }
  }

  // rendering: no shadowBlur, no filter, and only the vision cones make a gradient each frame
  function drawShadow(x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 9, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // sprites turn in 45 degree steps, which keeps the pixel art crisp
  const STEP8 = Math.PI / 4;

  const DASH_CALM = [4, 3];
  const DASH_NONE = [];
  function drawSpriteImg(img, x, y, angle, bobPhase) {
    ctx.save();
    ctx.translate(x, y);
    if (angle !== null) ctx.rotate(Math.round(angle / STEP8) * STEP8);
    if (bobPhase !== null && !reduceMotion) ctx.translate(0, Math.sin(bobPhase) * 1.2);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
  function drawCone(d, roomAlert) {
    let rgb;
    let edgeA;
    let calm = false;
    if (roomAlert || d.seeing) {
      rgb = '233,231,226';
      edgeA = d.seeing && !reduceMotion ? 0.45 + 0.3 * Math.abs(Math.sin(elapsed * 9)) : 0.6;
    } else if ((d.spotTimer || 0) > 0 || alertPhase === 'caution') {
      rgb = '195,203,213';
      edgeA = 0.45;
    } else {
      rgb = '143,166,192';
      edgeA = 0.3;
      calm = true;
    }
    const half = (d.fov * (d.fovMul || 1)) / 2;
    const range = d.range * (d.rangeMul || 1);
    const STEPS = 20;
    const hot = roomAlert || d.seeing;
    const grad = ctx.createRadialGradient(d.x, d.y, 4, d.x, d.y, range);
    grad.addColorStop(0, 'rgba(' + rgb + ',0.30)');
    grad.addColorStop(0.5, 'rgba(' + rgb + (hot ? ',0.11)' : ',0.09)'));
    grad.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    for (let s = 0; s <= STEPS; s++) {
      const a = d.facing - half + half * 2 * (s / STEPS);
      const h = rayHit(d.x, d.y, a, range);
      ctx.lineTo(h.x, h.y);
    }
    ctx.closePath();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    ctx.setLineDash(calm ? DASH_CALM : DASH_NONE);
    ctx.strokeStyle = 'rgba(' + rgb + ',' + edgeA + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash(DASH_NONE);

    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(' + rgb + ',0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(d.x, d.y, range * 0.5, d.facing - half, d.facing + half);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(d.x, d.y, range - 1.5, d.facing - half, d.facing + half);
    ctx.stroke();
    ctx.restore();

    const hFar = rayHit(d.x, d.y, d.facing, range);
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (d.seeing ? 0.5 : 0.15) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(hFar.x, hFar.y);
    ctx.stroke();
  }
  function drawLastKnown() {
    if (!lastKnown) return;
    const x = px(lastKnown.c);
    const y = px(lastKnown.r);
    const p = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(elapsed * 5);
    const s = reduceMotion ? 9 : 9 + (1 - p) * 3;
    const a = 4;
    ctx.strokeStyle = 'rgba(233,231,226,' + (0.3 + 0.35 * p).toFixed(3) + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s + a);
    ctx.lineTo(x - s, y - s);
    ctx.lineTo(x - s + a, y - s);
    ctx.moveTo(x + s - a, y - s);
    ctx.lineTo(x + s, y - s);
    ctx.lineTo(x + s, y - s + a);
    ctx.moveTo(x + s, y + s - a);
    ctx.lineTo(x + s, y + s);
    ctx.lineTo(x + s - a, y + s);
    ctx.moveTo(x - s + a, y + s);
    ctx.lineTo(x - s, y + s);
    ctx.lineTo(x - s, y + s - a);
    ctx.stroke();
    ctx.fillStyle = 'rgba(233,231,226,' + (0.45 + 0.35 * p).toFixed(3) + ')';
    ctx.font = 'bold 9px "Share Tech Mono",monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!?', x, y);
  }
  function drawExit() {
    const on = intelGot;
    const p = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(elapsed * 4);
    if (on) {
      ctx.globalAlpha = 0.18 + 0.18 * p;
      ctx.fillStyle = exitGlowGrad;
      ctx.fillRect(exitPt.x - 20, exitPt.y - 20, 40, 40);
      ctx.globalAlpha = 1;
    }
    const col = on ? C.bright : C.dim;
    const x = exitPt.x;
    const y = exitPt.y;
    const h = 13 + (on && !reduceMotion ? Math.sin(elapsed * 4) * 1.5 : 0);
    const a = 6;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.globalAlpha = on ? 1 : 0.7;
    ctx.beginPath();
    ctx.moveTo(x - h, y - h + a);
    ctx.lineTo(x - h, y - h);
    ctx.lineTo(x - h + a, y - h);
    ctx.moveTo(x + h - a, y - h);
    ctx.lineTo(x + h, y - h);
    ctx.lineTo(x + h, y - h + a);
    ctx.moveTo(x + h, y + h - a);
    ctx.lineTo(x + h, y + h);
    ctx.lineTo(x + h - a, y + h);
    ctx.moveTo(x - h + a, y + h);
    ctx.lineTo(x - h, y + h);
    ctx.lineTo(x - h, y + h - a);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.font = '9px "Share Tech Mono",monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', x, y);
  }
  function drawIntel() {
    if (!intel || intelGot) return;
    const p = reduceMotion ? 0.6 : 0.5 + 0.5 * Math.sin(elapsed * 3);
    ctx.globalAlpha = 0.3 + 0.25 * p;
    ctx.fillStyle = intelHaloGrad;
    ctx.fillRect(intel.x - 18, intel.y - 18, 36, 36);
    ctx.globalAlpha = 1;
    const bob = reduceMotion ? 0 : Math.round(Math.sin(elapsed * 2.6) * 1.5);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(intel.x - 7, intel.y + 5, 14, 3);
    ctx.drawImage(SPR.key, intel.x - SPR.key.width / 2, intel.y - SPR.key.height / 2 + bob);
  }
  function drawCamera(c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = C.wallSide;
    ctx.fillRect(-2, -12, 4, 8);
    ctx.fillStyle = C.wallEdge;
    ctx.fillRect(-3, -13, 6, 2);
    ctx.rotate(c.facing);
    ctx.fillStyle = C.wallFront;
    ctx.strokeStyle = c.seeing ? C.paper : C.wallEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-7, -4);
    ctx.lineTo(5, -4);
    ctx.lineTo(8, -2);
    ctx.lineTo(8, 2);
    ctx.lineTo(5, 4);
    ctx.lineTo(-7, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.seeing ? C.paper : C.bright;
    ctx.fillRect(6, -1.5, 2, 3);
    ctx.restore();
    const led = c.seeing || Math.sin(elapsed * 6) > 0;
    if (c.seeing) ctx.fillStyle = C.paper;
    else ctx.fillStyle = led ? C.line : 'rgba(143,166,192,0.25)';
    ctx.fillRect(c.x - 1, c.y - 11, 2, 2);
  }
  function drawGuard(g, roomAlert) {
    if (g.down) {
      drawShadow(g.x, g.y);
      drawSpriteImg(SPR.guardDown, g.x, g.y, g.facing + Math.PI, null);
      ctx.font = 'bold 9px "Share Tech Mono",monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      const zb = reduceMotion ? 0 : Math.round(Math.sin(elapsed * 2.2) * 1.5);
      ctx.fillStyle = 'rgba(4,9,18,0.7)';
      ctx.fillRect(g.x + 6, g.y - 21 + zb, 15, 10);
      ctx.fillStyle = C.paperDim;
      ctx.fillText('zz', g.x + 8, g.y - 11 + zb);
      return;
    }
    drawShadow(g.x, g.y);
    drawSpriteImg(
      SPR[g.seeing || roomAlert ? 'guardHot' : 'guard'][
        g.moving ? Math.floor(g.walk / Math.PI) % 2 : 0
      ],
      g.x,
      g.y,
      g.facing + Math.PI / 2,
      g.moving ? g.walk : null,
    );

    if (!roomAlert && g.spotTimer > 0.05 && g.spotTimer < SPOT_FULL) {
      const t = g.spotTimer / SPOT_FULL;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(4,9,18,0.65)';
      ctx.beginPath();
      ctx.arc(g.x, g.y - 24, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = t < 0.7 ? C.paperDim : C.paper;
      ctx.beginPath();
      ctx.arc(g.x, g.y - 24, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
      ctx.stroke();
    }
    let mark = null;
    if (roomAlert) mark = '!';
    else if (g.behavior === 'investigate' && !g.seeing) mark = '?';
    if (mark !== g.lastMark) {
      g.markSince = elapsed;
      g.lastMark = mark;
    }
    if (mark) drawAlertPlate(g.x, g.y - 20, mark, elapsed - (g.markSince || 0));
  }
  function drawAlertPlate(x, yBottom, mark, age) {
    let s;
    let t;
    if (reduceMotion) s = 0.62;
    else if (age < 0.14) {
      t = 1 - age / 0.14;
      s = 1 + 1.6 * t * t * t;
    } else if (age < 0.64) s = 1;
    else if (age < 0.84) {
      t = 1 - (age - 0.64) / 0.2;
      s = 0.62 + 0.38 * t * t;
    } else s = 0.62;
    const w = 14 * s;
    const h = 18 * s;
    const x0 = x - w / 2;
    const y0 = yBottom - h;
    const bang = mark === '!';
    ctx.fillStyle = bang ? C.paper : C.paperDim;
    ctx.fillRect(x0, y0, w, h);
    ctx.lineWidth = s < 0.8 ? 1.5 : 2;
    ctx.strokeStyle = bang ? C.line : C.paper;
    ctx.strokeRect(x0, y0, w, h);
    ctx.font = 'bold ' + Math.round(14 * s) + 'px "Share Tech Mono",monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.ink;
    ctx.fillText(mark, x, y0 + h / 2 + 1);
  }
  let radarFade = 1;
  function underRadar(px, py) {
    return (
      px > RADAR_X - 12 &&
      px < RADAR_X + RADAR_W + 12 &&
      py > RADAR_Y - 12 &&
      py < RADAR_Y + RADAR_H + 14
    );
  }
  function drawRadar(forceJam) {
    const x = RADAR_X;
    const y = RADAR_Y;
    const w = RADAR_W;
    const h = RADAR_H;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const sc = RADAR_SC;
    let i;
    const jam = forceJam || alertPhase === 'alert' || alertPhase === 'evasion';
    let hid = underRadar(player.x, player.y);
    for (i = 0; !hid && i < guards.length; i++)
      if (!guards[i].down && underRadar(guards[i].x, guards[i].y)) hid = true;
    const fadeTo = hid ? 0.3 : 1;
    radarFade = reduceMotion ? fadeTo : radarFade + (fadeTo - radarFade) * 0.25;
    ctx.globalAlpha = radarFade;
    ctx.save();
    ctx.fillStyle = 'rgba(4,9,18,0.6)';
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.strokeStyle = 'rgba(143,166,192,0.18)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 3.5, y - 3.5, w + 7, h + 7);
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (jam) {
      const fr = reduceMotion ? 0 : Math.floor(elapsed * 16);
      for (i = 0; i < h; i += 2) {
        let v = Math.sin((i + fr * 7) * 12.9898) * 43758.5453;
        v -= Math.floor(v);
        ctx.fillStyle = 'rgba(143,166,192,' + (0.04 + v * 0.2).toFixed(2) + ')';
        ctx.fillRect(x, y + i, w, 2);
      }
      ctx.fillStyle = 'rgba(5,9,18,0.75)';
      ctx.fillRect(cx - 22, cy - 6, 44, 12);
      ctx.fillStyle = C.bright;
      ctx.font = 'bold 8px "Share Tech Mono",monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('JAMMED', cx, cy + 0.5);
    } else {
      const ox = RADAR_OX;
      const oy = RADAR_OY;
      if (radarMap) ctx.drawImage(radarMap, ox, oy, W * sc, H * sc);
      for (i = 0; i < guards.length; i++) {
        const g = guards[i];
        if (g.down) continue;
        const rx = ox + g.x * sc;
        const ry = oy + g.y * sc;
        const hf = (g.fov * (g.fovMul || 1)) / 2;
        ctx.fillStyle = g.seeing ? 'rgba(233,231,226,0.28)' : 'rgba(143,166,192,0.22)';
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.arc(rx, ry, g.range * (g.rangeMul || 1) * sc, g.facing - hf, g.facing + hf);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = g.seeing ? C.paper : C.line;
        ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
      }
      for (i = 0; i < cameras.length; i++) {
        const cm = cameras[i];
        const rx2 = ox + cm.x * sc;
        const ry2 = oy + cm.y * sc;
        const hf2 = cm.fov / 2;
        ctx.fillStyle = 'rgba(195,203,213,0.16)';
        ctx.beginPath();
        ctx.moveTo(rx2, ry2);
        ctx.arc(rx2, ry2, cm.range * sc, cm.facing - hf2, cm.facing + hf2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = C.paperDim;
        ctx.fillRect(rx2 - 1.5, ry2 - 1.5, 3, 3);
      }
      if (intelGot) {
        const rex = ox + exitPt.x * sc;
        const rey = oy + exitPt.y * sc;
        if (reduceMotion || Math.sin(elapsed * 6) > -0.3) {
          ctx.fillStyle = C.bright;
          ctx.fillRect(rex - 1.5, rey - 1.5, 3, 3);
          ctx.strokeStyle = 'rgba(184,198,214,0.55)';
          ctx.lineWidth = 1;
          ctx.strokeRect(rex - 3.5, rey - 3.5, 7, 7);
        }
      }
      const pxr = ox + player.x * sc;
      const pyr = oy + player.y * sc;
      ctx.fillStyle = C.bright;
      ctx.fillRect(pxr - 1.5, pyr - 1.5, 3, 3);
      const pfa = Math.atan2(player.fy, player.fx);
      ctx.strokeStyle = C.bright;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pxr + Math.cos(pfa) * 3, pyr + Math.sin(pfa) * 3);
      ctx.lineTo(pxr + Math.cos(pfa) * 7, pyr + Math.sin(pfa) * 7);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = jam ? 'rgba(184,198,214,0.7)' : 'rgba(143,166,192,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = 'rgba(184,198,214,0.55)';
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 4);
    ctx.lineTo(x - 4, y - 4);
    ctx.lineTo(x + 4, y - 4);
    ctx.moveTo(x + w - 4, y - 4);
    ctx.lineTo(x + w + 4, y - 4);
    ctx.lineTo(x + w + 4, y + 4);
    ctx.moveTo(x + w + 4, y + h - 4);
    ctx.lineTo(x + w + 4, y + h + 4);
    ctx.lineTo(x + w - 4, y + h + 4);
    ctx.moveTo(x + 4, y + h + 4);
    ctx.lineTo(x - 4, y + h + 4);
    ctx.lineTo(x - 4, y + h - 4);
    ctx.stroke();
    if (lastWide) {
      ctx.fillStyle = C.dim;
      ctx.font = '8px "Share Tech Mono",monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('RADAR', x + w + 9, y + h + 1);
    }
    ctx.globalAlpha = 1;
  }

  // HUD windows, drawn on the outer wall rows so they never cover floor
  const HUD_FONT = '8px "Share Tech Mono",monospace';
  const HUD_PANEL = 'rgba(4,9,18,0.62)';
  const HUD_EDGE = 'rgba(143,166,192,0.35)';
  function hudPanel(x, y, w, h, edge) {
    ctx.fillStyle = HUD_PANEL;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = edge || HUD_EDGE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  function hudRing(x, y, cd, max) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(143,166,192,0.22)';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.stroke();
    if (cd > 0) {
      ctx.strokeStyle = C.paperDim;
      ctx.beginPath();
      ctx.arc(x, y, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cd / max));
      ctx.stroke();
    } else {
      ctx.strokeStyle = C.line;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = C.line;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }
  function drawHudWindows() {
    const blinkOn = reduceMotion || Math.sin(elapsed * 10) > 0;
    let i;
    ctx.font = HUD_FONT;
    ctx.textBaseline = 'middle';

    hudPanel(118, 7, 212, 18);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.dim;
    ctx.fillText('LIFE', 124, 16.5);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(150, 11, 176, 10);
    ctx.strokeStyle = 'rgba(143,166,192,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(150.5, 11.5, 175, 9);
    const lw = Math.round(174 * Math.max(0, Math.min(1, life)));
    if (lw > 0 && (life >= 0.25 || blinkOn)) {
      if (life > 0.5) ctx.fillStyle = C.line;
      else if (life > 0.25) ctx.fillStyle = C.paperDim;
      else ctx.fillStyle = C.paper;
      ctx.fillRect(151, 12, lw, 8);
    }
    ctx.fillStyle = 'rgba(4,9,18,0.75)';
    for (i = 158; i < 325; i += 8) ctx.fillRect(i, 12, 1, 8);

    if (alertPhase !== 'normal' && state === 'playing') {
      const ph = alertPhase;
      const pc = ph === 'caution' ? C.paperDim : C.paper;
      const pe = ph === 'caution' ? 'rgba(195,203,213,0.45)' : 'rgba(233,231,226,0.6)';
      hudPanel(340, 7, 130, 18, pe);
      ctx.textAlign = 'left';
      ctx.fillStyle = pc;
      if (ph === 'alert') {
        ctx.fillText('ALERT', 358, 16.5);
        if (blinkOn) ctx.fillText('!', 346, 16.5);
      } else {
        ctx.fillText(ph === 'evasion' ? 'EVASION' : 'CAUTION', 346, 16.5);
        ctx.fillStyle = ph === 'caution' ? C.paperDim : C.paper;
        ctx.fillText(String(phaseSecs()), 404, 16.5);
      }
    }
    if (coarsePointer) return; // the touch controls cover both bottom corners

    hudPanel(8, 353, 96, 28);
    hudRing(21, 367, cqcCD, CQC_COOLDOWN_S);
    hudRing(63, 367, knockCD, KNOCK_COOLDOWN_S);
    ctx.textAlign = 'left';
    ctx.font = HUD_FONT;
    ctx.fillStyle = cqcCD > 0 ? C.dim : C.line;
    ctx.fillText('CHOKE', 31, 367.5);
    ctx.fillStyle = knockCD > 0 ? C.dim : C.line;
    ctx.fillText('KNOCK', 73, 367.5);

    hudPanel(536, 353, 96, 28);
    ctx.fillStyle = C.dim;
    ctx.fillText('ITEM', 541, 367.5);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(570, 356, 22, 22);
    ctx.strokeStyle = boxed ? 'rgba(184,198,214,0.6)' : 'rgba(143,166,192,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(570.5, 356.5, 21, 21);
    if (boxed) {
      ctx.drawImage(SPR.box, 572, 358, 18, 18);
      ctx.fillStyle = C.bright;
      ctx.fillText('BOX', 598, 367.5);
    } else {
      ctx.fillStyle = C.dim;
      ctx.fillText('NONE', 598, 367.5);
    }
  }
  function render() {
    const roomAlert = alertPhase === 'alert' || alertPhase === 'evasion';
    let i;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shakeT > 0) {
      const shk = shakeT / 0.35;
      ctx.translate(Math.sin(elapsed * 87) * 3.5 * shk, Math.cos(elapsed * 61) * 2.5 * shk);
    }
    if (bgLayer) ctx.drawImage(bgLayer, 0, 0, W, H);
    if (seaGlints) {
      const sway = reduceMotion ? -4 : -4 + Math.sin(elapsed * 0.9) * 2;
      for (i = 0; i < ROWS; i += ROWS - 1)
        if (isWaterRow(i)) ctx.drawImage(seaGlints, TILE + sway, i * TILE, W - 2 * TILE + 8, TILE);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(player.x, player.y);
    ctx.fillStyle = poolGrad;
    ctx.fillRect(-130, -130, 260, 260);
    ctx.restore();
    drawExit();
    drawIntel();
    for (i = 0; i < noisePings.length; i++) {
      const pg = noisePings[i];
      const t = pg.t / 0.6;
      ctx.strokeStyle = 'rgba(164,182,204,' + 0.5 * (1 - t) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pg.x, pg.y, pg.r * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(164,182,204,' + 0.3 * (1 - t) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pg.x, pg.y, pg.r * t * 0.65, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (i = 0; i < fxPulses.length; i++) {
      const fp = fxPulses[i];
      const ft = fp.t / 0.45;
      const fr = reduceMotion ? 13 : 5 + ft * 15;
      ctx.strokeStyle = 'rgba(' + fp.c + ',' + (0.75 * (1 - ft)).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fp.x, fp.y, fr, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (i = 0; i < guards.length; i++) {
      if (!guards[i].down) drawCone(guards[i], roomAlert);
    }
    for (i = 0; i < cameras.length; i++) drawCone(cameras[i], roomAlert);
    if (roomAlert) drawLastKnown();
    for (i = 0; i < cameras.length; i++) drawCamera(cameras[i]);
    for (i = 0; i < guards.length; i++) drawGuard(guards[i], roomAlert);
    if (boxed) {
      drawShadow(player.x, player.y);
      drawSpriteImg(SPR.box, player.x, player.y, null, null);
    } else {
      drawShadow(player.x, player.y);
      drawSpriteImg(
        SPR.player[player.moving ? Math.floor(walkPhase / Math.PI) % 2 : 0],
        player.x,
        player.y,
        Math.atan2(player.fy, player.fx) + Math.PI / 2,
        player.moving ? walkPhase : null,
      );
    }
    if (hitFlashT > 0) {
      for (i = 0; i < guards.length; i++) {
        const tg = guards[i];
        if (tg.down || !tg.seeing) continue;
        ctx.strokeStyle =
          'rgba(233,231,226,' +
          (reduceMotion ? 0.5 : (0.2 + 0.4 * Math.abs(Math.sin(elapsed * 47 + i * 2))).toFixed(3)) +
          ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tg.x, tg.y);
        ctx.lineTo(player.x, player.y);
        ctx.stroke();
        ctx.fillStyle = 'rgba(233,231,226,0.95)';
        ctx.fillRect(tg.x - 2, tg.y - 2, 4, 4);
      }
    }
    if (level.weather) drawSeaWeather(level.weather === 'sea');
    ctx.restore();

    let vigA = hitFlashT > 0 ? 0.38 * (hitFlashT / 0.18) : 0;
    if (life > 0 && life < 0.3 && state === 'playing')
      vigA = Math.max(vigA, reduceMotion ? 0.14 : 0.1 + 0.08 * Math.sin(elapsed * 5));
    if (vigA > 0) {
      ctx.globalAlpha = Math.min(0.6, vigA * 1.5);
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // the drawn width: object-fit:contain letterboxes the canvas when the frame is height-capped
    const wide = Math.min(canvas.clientWidth, (canvas.clientHeight * W) / H) >= 520;
    if (wide !== lastWide) {
      lastWide = wide;
      overlay.classList.toggle('mgsg-wide', wide);
    }
    drawRadar();
    if (wide) drawHudWindows();
  }

  function drawSeaWeather(spray) {
    const t = reduceMotion ? 0 : elapsed;
    let i;
    const span = W + 300;
    for (i = 0; i < 5; i++) {
      const mx = ((i * 211 + t * (10 + i * 4)) % span) - 260;
      const my = 18 + i * 74 + Math.sin(t * 0.35 + i * 1.7) * 10;
      ctx.globalAlpha = 0.1 + (i % 2) * 0.04;
      ctx.drawImage(mistSprite, mx, my, 320, 96);
    }
    ctx.globalAlpha = 1;
    if (reduceMotion || !spray) return;
    const gust = 0.5 + 0.5 * Math.sin(t * 0.55);
    const n = 8 + Math.round(gust * gust * 34);
    ctx.strokeStyle = 'rgba(233,231,226,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (i = 0; i < n; i++) {
      const sp = 260 + (i % 5) * 40;
      const len = 5 + (i % 3) * 3;
      const sx = ((i * 97.3 + t * sp) % (W + 60)) - 30;
      const sy = ((i * 53.7 + t * sp * 0.3) % (H + 20)) - 10;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + len, sy + len * 0.3);
    }
    ctx.stroke();
  }

  // screens
  function announce(m, ms) {
    if (srLive) srLive.textContent = m;
    if (!toastEl || state !== 'playing') return;
    toastEl.textContent = m;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastTimer = null;
      toastEl.classList.remove('show');
    }, ms || 2200);
  }
  function hideToast() {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (toastEl) toastEl.classList.remove('show');
  }
  function typeText(el, str) {
    if (typeTimer) {
      clearInterval(typeTimer);
      typeTimer = null;
    }
    if (reduceMotion || !str) {
      el.textContent = str || '';
      return;
    }
    el.textContent = '';
    let i = 0;
    typeTimer = setInterval(function () {
      i += 2;
      el.textContent = str.slice(0, i);
      if (i >= str.length) {
        clearInterval(typeTimer);
        typeTimer = null;
      }
    }, 16);
  }
  function goText(t) {
    if (!coarsePointer || !t) return t;
    return t
      .replace('PRESS ENTER / R TO RETRY', 'TAP TO RETRY')
      .replace('PRESS ENTER TO', 'TAP TO')
      .replace('PRESS ENTER', 'TAP TO CONTINUE');
  }
  function showScreen(o) {
    hideToast();
    let label = 'CLEAR';
    if (o.cls === 'pause') label = 'PAUSED';
    else if (o.cls === 'fail') label = 'NO SIGNAL';
    else if (o.cls === 'title' || o.cls === 'brief') label = 'NORMAL';
    endChrome(label);
    screenEl.className = 'mgsg-screen show' + (o.cls ? ' ' + o.cls : '');
    overlay.classList.add('mgsg-scr');
    // the show class may already be on, so restart the wipe: animation none, reflow, then clear it
    if (!reduceMotion) {
      screenEl.style.animation = 'none';
      beamEl.style.animation = 'none';
      void screenEl.offsetWidth;
      screenEl.style.animation = '';
      beamEl.style.animation = '';
    }
    scrCaller.textContent = o.caller || '';
    scrCaller.style.display = o.caller ? '' : 'none';
    scrTitle.textContent = o.title || '';
    scrSub.textContent = o.sub || '';
    scrGo.textContent = goText(o.go) || '';

    const call = o.cls === 'title' || o.cls === 'brief';
    glitchColonel(call);
    if (call) {
      scrWhoThem.textContent = o.who || 'COLONEL';
      const fq = o.freq || '140.85';
      const target = Math.max(1, Math.min(99, ((parseFloat(fq) - 140) / 2) * 100)).toFixed(1) + '%';
      if (o.cls === 'title' && !reduceMotion) {
        scrNeedle.style.left = '1%';
        void scrNeedle.offsetWidth;
        scrNeedle.style.left = target;
        tickFreq(scrFnum, parseFloat(fq));
      } else {
        scrNeedle.style.left = target;
        scrFnum.textContent = fq;
      }
    }
    if (call) typeText(scrBody, o.body || '');
    else {
      if (typeTimer) {
        clearInterval(typeTimer);
        typeTimer = null;
      }
      scrBody.textContent = o.body || '';
    }
    if (o.big) {
      scrRank.textContent = o.big;
      scrRank.className = o.bigCls || 'rank';
      scrRank.style.display = '';
    } else scrRank.style.display = 'none';
    scrStats.innerHTML = '';
    if (o.stats) {
      o.stats.forEach(function (rw) {
        const a = document.createElement('span');
        a.textContent = rw[0];
        const v = document.createElement('span');
        v.textContent = rw[1];
        scrStats.appendChild(a);
        scrStats.appendChild(v);
      });
      scrStats.style.display = 'grid';
    } else scrStats.style.display = 'none';
    scrRec.textContent = o.rec || '';
    scrRec.style.display = o.rec ? '' : 'none';
    scrRetry.style.display = o.retry ? '' : 'none';
    announce((o.title || '') + '. ' + (o.rec ? o.rec + '. ' : '') + (o.body || ''));
  }
  function hideScreen() {
    screenEl.className = 'mgsg-screen';
    scrRetry.style.display = 'none';
    overlay.classList.remove('mgsg-scr');
    if (typeTimer) {
      clearInterval(typeTimer);
      typeTimer = null;
    }
    glitchColonel(false);
  }
  const tickTimers = [];
  function tickFreq(el, f) {
    const slot = el === freqEl ? 0 : 1;
    if (tickTimers[slot]) {
      clearInterval(tickTimers[slot]);
      tickTimers[slot] = null;
    }
    if (reduceMotion) {
      el.textContent = f.toFixed(2);
      return;
    }
    let n = 0;
    el.textContent = '140.00';
    tickTimers[slot] = setInterval(function () {
      n++;
      el.textContent = (140 + (f - 140) * Math.min(1, n / 8)).toFixed(2);
      if (n >= 8) {
        clearInterval(tickTimers[slot]);
        tickTimers[slot] = null;
      }
    }, 50);
  }
  function stopTicks() {
    for (let i = 0; i < tickTimers.length; i++)
      if (tickTimers[i]) {
        clearInterval(tickTimers[i]);
        tickTimers[i] = null;
      }
  }
  function plural(n, w) {
    return n + ' ' + w + (n === 1 ? '' : 's');
  }
  function fmt(s) {
    s = Math.floor(s);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function rankFor(alerts, time, sTime) {
    if (alerts === 0 && time < (sTime || 55)) return 'S';
    if (alerts === 0) return 'A';
    if (alerts <= 2) return 'B';
    return 'C';
  }

  // best times in seconds: { op1, op2, op3, total }; an unreadable value counts as none
  const BEST_KEY = 'mgs-best';
  function readBest() {
    let b = null;
    try {
      b = JSON.parse(localStorage.getItem(BEST_KEY));
    } catch (e) {}
    return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
  }
  function bestFor(key) {
    const v = readBest()[key];
    return typeof v === 'number' && isFinite(v) && v > 0 ? v : null;
  }
  function noteBest(key, secs) {
    const prev = bestFor(key);
    if (prev !== null && prev <= secs) return false;
    const b = readBest();
    b[key] = Math.round(secs * 100) / 100;
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(b));
    } catch (e) {}
    return true;
  }

  function startTitle() {
    state = 'title';
    loadLevel(0);
    render();
    showScreen({
      cls: 'title',
      caller: 'INCOMING CALL',
      title: 'BIG SHELL',
      who: 'COLONEL',
      freq: '140.85',
      body: 'Raiden, this is the Colonel. The Big Shell is in enemy hands. Three areas. In each one: get the intel, reach the exit, stay out of sight.',
      sub: '',
      go: 'PRESS ENTER',
    });
  }
  function startBriefing() {
    state = 'briefing';
    loadLevel(levelIdx);
    render();
    const pb = bestFor('op' + (levelIdx + 1));
    showScreen({
      cls: 'brief',
      caller: '▸ ' + level.caller,
      title: 'OP ' + (levelIdx + 1) + ' · ' + level.name,
      who: level.caller,
      freq: level.freq,
      stats: pb !== null ? [['PERSONAL BEST', fmt(pb)]] : null,
      body: level.brief,
      sub: '',
      go: 'PRESS ENTER TO INFILTRATE',
    });
  }
  function startPlay() {
    hideScreen();
    keys = Object.create(null);
    touchDir = { up: 0, down: 0, left: 0, right: 0 };
    running = false;
    if (!reduceMotion) {
      canvas.classList.remove('on');
      void canvas.offsetWidth;
      canvas.classList.add('on');
    }
    state = 'playing';
    announce('Go.', 900);
  }
  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    stopAlertMusic();
    render();
    showScreen({
      cls: 'pause',
      title: 'PAUSED',
      body: 'Codec on hold, Raiden. Your position is safe.',
      sub: coarsePointer ? 'TAP EXIT TO DISCONNECT' : 'ESC AGAIN TO DISCONNECT',
      go: 'PRESS ENTER TO RESUME',
      retry: true,
    });
  }
  function resumeGame() {
    hideScreen();
    keys = Object.create(null);
    touchDir = { up: 0, down: 0, left: 0, right: 0 };
    running = false;
    state = 'playing';
    updateHud();
    if (alertPhase === 'alert' || alertPhase === 'evasion') startAlertMusic();
    announce('Resumed.', 900);
  }
  function levelClear() {
    totalTime += elapsed;
    totalAlerts += alertsThisLevel;
    stopAlertMusic();
    sfxClear();
    const opPrev = bestFor('op' + (levelIdx + 1));
    const opRec = noteBest('op' + (levelIdx + 1), elapsed);
    if (levelIdx + 1 < LEVELS.length) {
      const rank = rankFor(alertsThisLevel, elapsed);
      const stats = [
        ['TIME', fmt(elapsed)],
        ['ALERTS', String(alertsThisLevel)],
      ];
      if (!opRec && opPrev !== null) stats.push(['BEST', fmt(opPrev)]);
      state = 'clear';
      render();
      showScreen({
        title: 'OP ' + (levelIdx + 1) + ' CLEAR',
        big: rank,
        rec: opRec ? 'NEW RECORD' : '',
        body: alertsThisLevel
          ? 'Extracted, with ' + plural(alertsThisLevel, 'alert') + ' raised.'
          : 'Clean extraction. No alerts.',
        stats: stats,
        go: 'PRESS ENTER TO CONTINUE',
      });
    } else {
      const mRank = rankFor(totalAlerts, totalTime, 165);
      const totPrev = bestFor('total');
      const totRec = noteBest('total', totalTime);
      const mStats = [
        ['TOTAL TIME', fmt(totalTime)],
        ['TOTAL ALERTS', String(totalAlerts)],
      ];
      if (!totRec && totPrev !== null) mStats.push(['BEST', fmt(totPrev)]);
      state = 'complete';
      render();
      showScreen({
        title: 'MISSION COMPLETE',
        big: mRank,
        rec: totRec ? 'NEW RECORD' : '',
        body:
          (totalAlerts
            ? 'All three areas clear, with ' + plural(totalAlerts, 'alert') + ' across the mission.'
            : 'All three areas clear, and not one alert.') + ' Good work, Raiden. Colonel out.',
        stats: mStats,
        go: 'PRESS ENTER TO REPLAY',
      });
    }
  }
  function endChrome(label) {
    stateBadge.className = 'mgsg-stbadge';
    stateBadge.textContent = label;
    stage.classList.remove('alarm', 'caution');
    frame.classList.remove('alarm', 'caution');
  }
  function gameOver() {
    stopAlertMusic();
    state = 'over';
    sfxOver();
    updateHud();
    if (!reduceMotion) {
      flashEl.classList.remove('on');
      void flashEl.offsetWidth;
      flashEl.classList.add('on');
    }
    render();

    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(4,6,12,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    drawRadar(true);
    showScreen({
      cls: 'fail',
      title: 'GAME OVER',
      big: 'SIGNAL LOST',
      bigCls: 'lost',
      body: 'Raiden? Raiden, respond! ' + level.lost,
      stats: [
        ['OP', levelIdx + 1 + '/' + LEVELS.length],
        ['TIME', fmt(elapsed)],
      ],
      go: 'PRESS ENTER / R TO RETRY',
    });
  }
  function advance() {
    if (state === 'title') startBriefing();
    else if (state === 'briefing') startPlay();
    else if (state === 'paused') resumeGame();
    else if (state === 'over') startBriefing();
    else if (state === 'clear') {
      levelIdx++;
      startBriefing();
    } else if (state === 'complete') {
      levelIdx = 0;
      totalTime = 0;
      totalAlerts = 0;
      startTitle();
    }
  }

  // loop and input
  function frameStep(now) {
    if (!open) return;
    rafId = requestAnimationFrame(frameStep);
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0;
    lastT = now;
    if (state === 'playing') {
      update(dt);
      render();
    }
  }
  function onKey(e) {
    if (!open) return;
    const k = (e.key || '').toLowerCase();
    if (e.type === 'keydown') {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (
        (k === 'enter' || k === ' ' || k === 'spacebar') &&
        document.activeElement &&
        document.activeElement.classList &&
        document.activeElement.classList.contains('mgsg-btn')
      )
        return;
      e.stopImmediatePropagation();
      unlockAudio();
      const isMove = k.indexOf('arrow') === 0 || k === 'w' || k === 'a' || k === 's' || k === 'd';
      if (e.repeat && !isMove && k !== 'shift') {
        e.preventDefault();
        return;
      }
      if (k === 'escape') {
        e.preventDefault();
        if (state === 'playing') pauseGame();
        else closeGame();
        return;
      }
      if (k === 'tab') {
        e.preventDefault();
        const f = Array.prototype.filter.call(
          overlay.querySelectorAll('button:not([tabindex="-1"])'),
          function (el) {
            return el.offsetParent !== null;
          },
        );
        if (!f.length) {
          frame.focus();
          return;
        }
        const ci = f.indexOf(document.activeElement);
        let ni;
        if (e.shiftKey) ni = ci <= 0 ? f.length - 1 : ci - 1;
        else ni = ci >= f.length - 1 ? 0 : ci + 1;
        f[ni].focus();
        return;
      }
      if (k === 'enter' || k === ' ' || k === 'spacebar') {
        e.preventDefault();
        if (state !== 'playing') advance();
        return;
      }
      if (k === 'r') {
        e.preventDefault();
        if (state === 'playing' || state === 'paused' || state === 'over') startBriefing();
        return;
      }
      if (k === 'shift') {
        running = true;
        return;
      }
      if (state === 'playing') {
        if (k === 'b') {
          e.preventDefault();
          doBox();
          return;
        }
        if (k === 'k') {
          e.preventDefault();
          doKnock();
          return;
        }
        if (k === 'f') {
          e.preventDefault();
          doCQC();
          return;
        }
      }
      if (isMove) {
        e.preventDefault();
        keys[k] = true;
      }
    } else {
      e.stopImmediatePropagation();
      if (k === 'shift') running = false;
      keys[k] = false;
    }
  }
  function resetInput() {
    keys = Object.create(null);
    touchDir = { up: 0, down: 0, left: 0, right: 0 };
    running = false;
    lastT = 0;
  }
  function onVisibility() {
    if (document.hidden) {
      resetInput();
      pauseGame();
    }
  }
  // an unfocused window still gets animation frames but no keys, so losing focus pauses the run
  function onBlur() {
    resetInput();
    pauseGame();
  }
  function onResize() {
    if (targetDpr() === dpr) return;
    sizeCanvas();
    if (state !== 'playing') render();
  }

  function openGame() {
    build();
    if (open) return;
    open = true;
    sizeCanvas();
    // js/sumi.js stops the page's frame loop on gameopen and starts it again on gameclose
    document.body.classList.add('game-open');
    window.dispatchEvent(new CustomEvent('gameopen'));
    overlay.classList.remove('out');
    levelIdx = 0;
    totalTime = 0;
    totalAlerts = 0;
    keys = Object.create(null);
    touchDir = { up: 0, down: 0, left: 0, right: 0 };
    running = false;
    boxed = false;
    prevFocus = document.activeElement;
    Array.prototype.forEach.call(
      document.querySelectorAll('body > header, body > main, body > footer, body > .skip'),
      function (el) {
        el.inert = true;
      },
    );
    document.body.style.overflow = 'hidden';
    overlay.style.display = 'flex';
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKey, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onResize);
    requestAnimationFrame(function () {
      overlay.classList.add('in');
    });
    tickFreq(freqEl, 140.85);
    frame.focus();
    startTitle();
    lastT = 0;
    rafId = requestAnimationFrame(frameStep);
  }
  function closeGame() {
    if (!open) return;
    open = false;
    stopAlertMusic();
    document.body.classList.remove('game-open');
    window.dispatchEvent(new CustomEvent('gameclose'));
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('keyup', onKey, true);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', onResize);
    overlay.classList.remove('in');
    overlay.classList.add('out');
    document.body.style.overflow = '';
    hideToast();
    if (typeTimer) {
      clearInterval(typeTimer);
      typeTimer = null;
    }
    glitchColonel(false);
    stopTicks();
    freqEl.textContent = '140.85';
    resetInput();
    boxed = false;
    Array.prototype.forEach.call(
      document.querySelectorAll('body > header, body > main, body > footer, body > .skip'),
      function (el) {
        el.inert = false;
      },
    );
    try {
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    } catch (e) {}
    prevFocus = null;
    setTimeout(function () {
      if (!open) overlay.style.display = 'none';
    }, 260);
  }

  window.MGSGame = { open: openGame, close: closeGame };
})();

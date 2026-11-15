// The search figure: three robots look for the same chair in the same room, and only their memory
// differs. A toy: rays stand in for the camera and a fixed rule for the vision-language model.
(() => {
  'use strict';

  const S = window.SUMI;
  const root = document.querySelector('.search');
  if (!root) return;

  const PAPER = '#e9e7e2';
  const DPR = Math.min(2, devicePixelRatio || 1);
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const forcedColors = matchMedia('(forced-colors: active)');
  const TAU = Math.PI * 2;

  // the room: 12 x 8 m on a 0.25 m grid
  const CELL_M = 0.25;
  const COLS = 48;
  const ROWS = 32;
  const CELLS = COLS * ROWS;
  const ROOM_W_M = COLS * CELL_M;
  const ROOM_H_M = ROWS * CELL_M;
  const cellOf = (col, row) => row * COLS + col;

  // [col, row, cols, rows]: bookshelf, couch, table, cardboard box, trash can
  const FURNITURE = [
    [20, 0, 2, 10],
    [28, 22, 10, 4],
    [34, 8, 6, 4],
    [10, 22, 3, 3],
    [41, 18, 2, 2],
  ];
  const START_X_M = 1.25;
  const START_Y_M = 3;
  const START_HEADING = 0.3;
  const FIRST_CHAIR = cellOf(17, 16);
  const SCRIPTED_CHAIR = cellOf(42, 5);
  // "Move the chair" offers these in turn, each chosen from where the one before leaves the robots
  const PRESETS = [cellOf(31, 13), cellOf(34, 29), cellOf(34, 14), cellOf(23, 27)];
  const SEED = 281;

  // a robot keeps two cells clear of furniture and walls; a line of sight keeps 0.4 m clear of
  // furniture, room for the robot to walk along it, so no floor dot is drawn inside that margin
  const CLEARANCE_CELLS = 2;
  const SIGHT_MARGIN_M = 0.4;
  const WALL_M = CLEARANCE_CELLS * CELL_M;
  const MAX_SPEED_MPS = 1;
  const MAX_TURN_RADPS = 1.6;
  const FOV_DEG = 70;
  const HALF_FOV_RAD = ((FOV_DEG / 2) * Math.PI) / 180;
  const COS_HALF_FOV = Math.cos(HALF_FOV_RAD);
  const RANGE_M = 7;
  const STANDOFF_M = 0.9;
  const NAV_STEP_S = 0.2;
  const SUBSTEPS = 4;
  const SEARCH_CAP_STEPS = 450;
  const HEADING_BINS = 24;
  const REGION_CELLS = 8;
  const REGION_COLS = Math.ceil(COLS / REGION_CELLS);
  const HOP_M = 2;
  const AWAY_M = 1.5;
  const ALIGNED_RAD = 0.5;

  const NO_MEMORY = 0;
  const NEVER_REVISED = 1;
  const REVISED = 2;

  // on screen: two simulated seconds a second
  const SIM_SPEED = 2;
  const PAUSE_S = 1.2;
  const SLIDE_S = 0.8;
  // after the chair lands, a beat for the eye to come back to the robots
  const HOLD_S = 0.6;
  // a revised belief: struck through, held, then faded to what stays on the drawing
  const STRIKE_S = 0.3;
  const STRUCK_HOLD_S = 1;
  const FADE_S = 0.8;
  const MARK_S = STRIKE_S + STRUCK_HOLD_S + FADE_S;
  const BELIEF_ALPHA = 0.9;
  const BELIEF_LINE_ALPHA = 0.5;
  const STALE_ALPHA = 0.5;
  const STRUCK_ALPHA = 0.3;
  const FAN_RAYS = 36;
  // floor dots, radius in grid pitches: never looked at, looked at, in view now
  const UNSEEN_R = 0.065;
  const SEEN_R = 0.1;
  const LIT_R = 0.2;
  const LIT_ALPHA = 0.55;
  const HATCH_PX = 3.5;
  // a Go2 from above: half its 0.3762 m trunk, never under TRUNK_MIN_PX; then in pixels the trunk's
  // half width, how far out its feet stand and their radius
  const TRUNK_M = 0.3762 / 2;
  const TRUNK_MIN_PX = 4.5;
  const TRUNK_HALF_W_PX = 1.6;
  const FOOT_OUT_PX = 4.6;
  const FOOT_PX = 1.25;
  const RING_M = 0.5;
  const CHAIR_M = 0.36;
  const BELIEF_M = 0.66;
  const GRAB_PX = 16;
  const DRAG_PX = 4;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const wrapAngle = a => a - TAU * Math.round(a / TAU);
  const smooth = v => v * v * (3 - 2 * v);

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const cellAt = (x, y) => Math.floor(y / CELL_M) * COLS + Math.floor(x / CELL_M);
  const cellX = cell => ((cell % COLS) + 0.5) * CELL_M;
  const cellY = cell => (Math.floor(cell / COLS) + 0.5) * CELL_M;
  const regionOf = cell =>
    Math.floor(Math.floor(cell / COLS) / REGION_CELLS) * REGION_COLS +
    Math.floor((cell % COLS) / REGION_CELLS);

  const boxes = FURNITURE.map(([col, row, cols, rows]) => ({
    left: col * CELL_M,
    top: row * CELL_M,
    right: (col + cols) * CELL_M,
    bottom: (row + rows) * CELL_M,
  }));
  const solid = new Uint8Array(CELLS);
  for (const [col, row, cols, rows] of FURNITURE) {
    for (let r = row; r < row + rows; r++) {
      for (let c = col; c < col + cols; c++) solid[cellOf(c, r)] = 1;
    }
  }
  const dotted = new Uint8Array(CELLS);
  const walkable = new Uint8Array(CELLS);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      let clear = 1;
      for (let r = Math.max(0, row - CLEARANCE_CELLS); r <= row + CLEARANCE_CELLS; r++) {
        for (let c = Math.max(0, col - CLEARANCE_CELLS); c <= col + CLEARANCE_CELLS; c++) {
          if (r < ROWS && c < COLS && solid[cellOf(c, r)]) clear = 0;
        }
      }
      const inside =
        row >= CLEARANCE_CELLS &&
        row < ROWS - CLEARANCE_CELLS &&
        col >= CLEARANCE_CELLS &&
        col < COLS - CLEARANCE_CELLS;
      dotted[cellOf(col, row)] = clear;
      walkable[cellOf(col, row)] = inside ? clear : 0;
    }
  }

  // where a segment first enters a box, as a fraction of its length: 1 if it never does
  function entry(box, x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    let enter = 0;
    let leave = 1;
    if (dx !== 0) {
      const a = (box.left - x0) / dx;
      const b = (box.right - x0) / dx;
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
    } else if (x0 <= box.left || x0 >= box.right) {
      return 1;
    }
    if (dy !== 0) {
      const a = (box.top - y0) / dy;
      const b = (box.bottom - y0) / dy;
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
    } else if (y0 <= box.top || y0 >= box.bottom) {
      return 1;
    }
    return enter < leave ? enter : 1;
  }

  // the furniture as a camera at (x, y) sees it: grown by the sight margin, or by as much of it as
  // the camera has
  function viewFrom(x, y, heading) {
    return {
      x,
      y,
      heading,
      faceX: Math.cos(heading),
      faceY: Math.sin(heading),
      blockers: boxes.map(box => {
        const margin = Math.min(
          SIGHT_MARGIN_M,
          Math.max(box.left - x, x - box.right, box.top - y, y - box.bottom),
        );
        return {
          left: box.left - margin,
          top: box.top - margin,
          right: box.right + margin,
          bottom: box.bottom + margin,
        };
      }),
    };
  }

  function occluded(view, x, y) {
    return view.blockers.some(box => entry(box, view.x, view.y, x, y) < 1);
  }

  function sees(view, x, y) {
    const dx = x - view.x;
    const dy = y - view.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    return (
      d <= RANGE_M && dx * view.faceX + dy * view.faceY >= d * COS_HALF_FOV && !occluded(view, x, y)
    );
  }

  // breadth-first over walkable cells: the nearest that passes `wanted`, the way back in cameFrom
  const cameFrom = new Int16Array(CELLS);
  const queue = new Int16Array(CELLS);
  const NEIGHBOURS = [1, -1, COLS, -COLS, COLS + 1, COLS - 1, 1 - COLS, -1 - COLS];
  function nearest(from, wanted) {
    cameFrom.fill(-1);
    cameFrom[from] = from;
    queue[0] = from;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const cell = queue[head++];
      if (wanted(cell)) return cell;
      for (const offset of NEIGHBOURS) {
        const next = cell + offset;
        if (walkable[next] && cameFrom[next] < 0) {
          cameFrom[next] = cell;
          queue[tail++] = next;
        }
      }
    }
    return -1;
  }

  function clearWalk(x0, y0, x1, y1) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (CELL_M / 2));
    for (let i = 1; i <= n; i++) {
      if (!walkable[cellAt(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)]) return false;
    }
    return true;
  }

  // the command held for one step: turn toward (x, y), and walk once within `slack` of facing it
  function steer(robot, x, y, speed, slack) {
    const error = wrapAngle(Math.atan2(y - robot.y, x - robot.x) - robot.heading);
    robot.turn = clamp(error / NAV_STEP_S, -MAX_TURN_RADPS, MAX_TURN_RADPS);
    robot.speed = Math.abs(error) < slack ? speed : 0;
  }

  // round the furniture: aim at the farthest cell along the way that is a straight walk from here
  function walkTo(robot, goal) {
    const from = cellAt(robot.x, robot.y);
    nearest(from, cell => cell === goal);
    let aim = goal;
    while (
      aim !== from &&
      cameFrom[aim] !== from &&
      !clearWalk(robot.x, robot.y, cellX(aim), cellY(aim))
    ) {
      aim = cameFrom[aim];
    }
    steer(robot, cellX(aim), cellY(aim), MAX_SPEED_MPS, ALIGNED_RAD);
  }

  const robots = [NO_MEMORY, NEVER_REVISED, REVISED].map(memory => ({
    memory,
    seen: new Uint8Array(CELLS),
    faced: new Uint8Array(HEADING_BINS),
  }));
  let chair = FIRST_CHAIR;
  let random = rng(SEED);
  // true once a step has left every robot still: no one searching, no one walking
  let settled = false;

  function resetSim() {
    chair = FIRST_CHAIR;
    random = rng(SEED);
    settled = false;
    for (const robot of robots) {
      Object.assign(robot, {
        x: START_X_M,
        y: START_Y_M,
        heading: START_HEADING,
        fromX: START_X_M,
        fromY: START_Y_M,
        fromHeading: START_HEADING,
        speed: 0,
        turn: 0,
        found: true,
        spent: false,
        steps: 0,
        staleRevisits: 0,
        lastSeen: -1,
        held: -1,
        struck: -1,
        returning: false,
        away: false,
        region: -1,
        sweep: 0,
        hop: 0,
        bearing: 0,
        trail: [START_X_M, START_Y_M],
      });
      robot.seen.fill(0);
      robot.faced.fill(0);
    }
  }

  function remember(robot, view) {
    const reach = Math.ceil(RANGE_M / CELL_M);
    const col = Math.floor(robot.x / CELL_M);
    const row = Math.floor(robot.y / CELL_M);
    for (let r = Math.max(0, row - reach); r <= Math.min(ROWS - 1, row + reach); r++) {
      for (let c = Math.max(0, col - reach); c <= Math.min(COLS - 1, col + reach); c++) {
        const cell = cellOf(c, r);
        if (!robot.seen[cell] && !solid[cell] && sees(view, cellX(cell), cellY(cell))) {
          robot.seen[cell] = 1;
        }
      }
    }
    const here = cellOf(col, row);
    for (let dr = -COLS; dr <= COLS; dr += COLS) {
      for (let dc = -1; dc <= 1; dc++) robot.seen[here + dr + dc] = 1;
    }
    for (let bin = 0; bin < HEADING_BINS; bin++) {
      if (Math.cos(robot.heading - (bin * TAU) / HEADING_BINS) >= COS_HALF_FOV)
        robot.faced[bin] = 1;
    }
  }

  function approach(robot) {
    const x = cellX(chair);
    const y = cellY(chair);
    const gap = Math.hypot(x - robot.x, y - robot.y) - STANDOFF_M;
    steer(robot, x, y, gap > 0.01 ? Math.min(MAX_SPEED_MPS, gap / NAV_STEP_S) : 0, 1e-6);
    if (Math.abs(robot.turn) < 1e-6) robot.turn = 0;
  }

  function beginSearch(robot) {
    robot.held = robot.lastSeen;
    robot.region = -1;
    robot.returning = robot.lastSeen >= 0;
    robot.away = false;
    robot.sweep = TAU;
    robot.hop = 0;
  }

  // no memory: turn a full circle, walk about 2 m in a random free direction, and again
  function sweepBlind(robot, view) {
    if (robot.sweep > 0) {
      robot.speed = 0;
      robot.turn = MAX_TURN_RADPS;
      robot.sweep -= MAX_TURN_RADPS * NAV_STEP_S;
      if (robot.sweep > 0) return;
      for (robot.hop = HOP_M; ; robot.hop *= 0.9) {
        robot.bearing = random() * TAU;
        const x = robot.x + Math.cos(robot.bearing) * robot.hop;
        const y = robot.y + Math.sin(robot.bearing) * robot.hop;
        const free =
          x > WALL_M &&
          x < ROOM_W_M - WALL_M &&
          y > WALL_M &&
          y < ROOM_H_M - WALL_M &&
          !occluded(view, x, y);
        if (free) return;
      }
    }
    steer(
      robot,
      robot.x + Math.cos(robot.bearing) * RANGE_M,
      robot.y + Math.sin(robot.bearing) * RANGE_M,
      Math.min(MAX_SPEED_MPS, robot.hop / NAV_STEP_S),
      1e-6,
    );
    robot.hop -= robot.speed * NAV_STEP_S;
    if (robot.hop < 1e-6) robot.sweep = TAU;
  }

  // with memory: first to where the chair was last seen, then the nearest region not yet looked at;
  // a never-revised belief pulls it back after every region, a revised one is dropped on sight
  function searchFromMemory(robot, view) {
    if (robot.lastSeen >= 0) {
      const x = cellX(robot.lastSeen);
      const y = cellY(robot.lastSeen);
      const gap = Math.hypot(x - robot.x, y - robot.y);
      if (gap > AWAY_M) robot.away = true;
      if (robot.returning) {
        const inView = sees(view, x, y);
        if (robot.memory === REVISED && inView) {
          robot.struck = robot.lastSeen;
          robot.lastSeen = -1;
        } else if (inView && gap <= STANDOFF_M + 0.01) {
          if (robot.away) robot.staleRevisits++;
          robot.away = false;
          robot.returning = false;
        } else {
          walkTo(robot, robot.lastSeen);
          return;
        }
      }
    }
    if (robot.faced.includes(0)) {
      robot.speed = 0;
      robot.turn = MAX_TURN_RADPS;
      return;
    }
    const from = cellAt(robot.x, robot.y);
    let target = nearest(
      from,
      cell => walkable[cell] && !robot.seen[cell] && regionOf(cell) === robot.region,
    );
    if (target < 0) {
      if (robot.region >= 0 && robot.lastSeen >= 0) {
        robot.region = -1;
        robot.returning = true;
        walkTo(robot, robot.lastSeen);
        return;
      }
      target = nearest(from, cell => walkable[cell] && !robot.seen[cell]);
      if (target < 0) {
        // every cell looked at and still no chair: start the room over
        robot.seen.fill(0);
        robot.speed = 0;
        robot.turn = 0;
        return;
      }
      robot.region = regionOf(target);
    }
    walkTo(robot, target);
  }

  function navigate(robot) {
    if (robot.spent) return;
    const view = viewFrom(robot.x, robot.y, robot.heading);
    if (sees(view, cellX(chair), cellY(chair))) {
      robot.found = true;
      if (robot.memory !== NO_MEMORY) robot.lastSeen = chair;
      approach(robot);
      return;
    }
    if (robot.found) {
      robot.found = false;
      beginSearch(robot);
    }
    robot.steps++;
    if (robot.steps >= SEARCH_CAP_STEPS) {
      robot.spent = true;
      robot.speed = 0;
      robot.turn = 0;
      return;
    }
    if (robot.memory === NO_MEMORY) {
      sweepBlind(robot, view);
    } else {
      remember(robot, view);
      searchFromMemory(robot, view);
    }
  }

  function advance(robot) {
    const dt = NAV_STEP_S / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      robot.x += robot.speed * Math.cos(robot.heading) * dt;
      robot.y += robot.speed * Math.sin(robot.heading) * dt;
      robot.heading += robot.turn * dt;
    }
    if (robot.speed > 0) robot.trail.push(robot.x, robot.y);
  }

  function step() {
    for (const robot of robots) {
      robot.fromX = robot.x;
      robot.fromY = robot.y;
      robot.fromHeading = robot.heading;
      navigate(robot);
      advance(robot);
    }
    settled = robots.every(
      robot => (robot.found || robot.spent) && robot.speed === 0 && robot.turn === 0,
    );
  }

  function settle() {
    while (!settled) step();
  }

  // a robot still searching keeps its count and its memory; the others start a new search, unless
  // none of them loses sight of the chair: then the last search stays in the counters and on the
  // drawing. The blind walk is seeded by the spot, so a move always plays out the same way
  function moveChair(cell) {
    const resting = robots.filter(robot => robot.found || robot.spent);
    const inSight = robot =>
      sees(viewFrom(robot.x, robot.y, robot.heading), cellX(cell), cellY(cell));
    chair = cell;
    random = rng(SEED + cell);
    settled = false;
    if (resting.every(robot => robot.found && inSight(robot))) return false;
    for (const robot of resting) {
      robot.spent = false;
      robot.steps = 0;
      robot.staleRevisits = 0;
      robot.held = -1;
      robot.struck = -1;
      robot.seen.fill(0);
      robot.faced.fill(0);
      robot.trail = [robot.x, robot.y];
      robot.found = inSight(robot);
      if (!robot.found) beginSearch(robot);
    }
    return true;
  }

  // out of range or behind furniture for every robot, whichever way it turns
  const hidden = cell =>
    robots.every(
      robot =>
        Math.hypot(cellX(cell) - robot.x, cellY(cell) - robot.y) > RANGE_M ||
        occluded(viewFrom(robot.x, robot.y, robot.heading), cellX(cell), cellY(cell)),
    );

  let nextPreset = 0;
  function pickSpot() {
    for (let i = 0; i < PRESETS.length; i++) {
      const cell = PRESETS[(nextPreset + i) % PRESETS.length];
      if (cell !== chair && hidden(cell)) {
        nextPreset = (nextPreset + i + 1) % PRESETS.length;
        return cell;
      }
    }
    // none of the presets is hidden from where the robots stand now: the farthest cell that is
    let best = chair;
    let bestScore = -1;
    for (let cell = 0; cell < CELLS; cell++) {
      if (!walkable[cell]) continue;
      const score =
        Math.hypot(cellX(cell) - cellX(chair), cellY(cell) - cellY(chair)) +
        (hidden(cell) ? ROOM_W_M : 0);
      if (score > bestScore) {
        best = cell;
        bestScore = score;
      }
    }
    return best;
  }

  // the chair can stand on any walkable cell: a click goes to the one nearest it
  function cellNear(x, y) {
    let best = chair;
    let bestDistance = Infinity;
    for (let cell = 0; cell < CELLS; cell++) {
      if (!walkable[cell]) continue;
      const distance = (cellX(cell) - x) ** 2 + (cellY(cell) - y) ** 2;
      if (distance < bestDistance) {
        best = cell;
        bestDistance = distance;
      }
    }
    return best;
  }

  const roomsEl = root.querySelector('.search-rooms');
  const hint = root.querySelector('.search-hint');
  const result = root.querySelector('.search-result');
  const lit = document.createElement('canvas');
  const rooms = [...root.querySelectorAll('.search-room')].map((el, i) => {
    const canvas = el.querySelector('canvas');
    const floor = document.createElement('canvas');
    const [steps, stale] = el.querySelectorAll('dd');
    return {
      el,
      robot: robots[i],
      canvas,
      ctx: canvas.getContext('2d'),
      floor,
      floorCtx: floor.getContext('2d'),
      painted: new Uint8Array(CELLS),
      steps,
      stale,
      // whether the robot has given up its belief (struck it out, or found the chair elsewhere),
      // and how many seconds ago
      gaveUp: false,
      age: MARK_S,
    };
  });

  let width = 0;
  let height = 0;
  let pitch = 0;
  let scale = 0;
  let ink = PAPER;
  const xPx = x => x * scale;
  const yPx = y => (y * height) / ROOM_H_M;
  // a dot on a device pixel's centre stays round at any size
  const snap = v => (Math.floor(v * DPR) + 0.5) / DPR;

  function dot(path, cell, r) {
    const x = snap(xPx(cellX(cell)));
    const y = snap(yPx(cellY(cell)));
    path.moveTo(x + r, y);
    path.arc(x, y, r, 0, TAU);
  }

  function sizeCanvas(canvas) {
    canvas.width = Math.round(width * DPR);
    canvas.height = Math.round(height * DPR);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    return ctx;
  }

  function hatch(ctx, box) {
    const left = Math.round(xPx(box.left));
    const top = Math.round(yPx(box.top));
    const w = Math.round(xPx(box.right)) - left;
    const h = Math.round(yPx(box.bottom)) - top;
    const lines = new Path2D();
    for (let d = HATCH_PX - h; d < w; d += HATCH_PX) {
      lines.moveTo(left + d, top + h);
      lines.lineTo(left + d + h, top);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, w, h);
    ctx.clip();
    ctx.globalAlpha = 0.32;
    ctx.stroke(lines);
    ctx.restore();
    ctx.globalAlpha = 0.6;
    ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
  }

  function paintFloor(room) {
    const ctx = room.floorCtx;
    const { seen } = room.robot;
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    for (const box of boxes) hatch(ctx, box);
    const unseenDots = new Path2D();
    const seenDots = new Path2D();
    for (let cell = 0; cell < CELLS; cell++) {
      if (!dotted[cell]) continue;
      if (seen[cell]) dot(seenDots, cell, SEEN_R * pitch);
      else dot(unseenDots, cell, UNSEEN_R * pitch);
    }
    ctx.globalAlpha = 1;
    ctx.fill(unseenDots);
    ctx.fill(seenDots);
    room.painted.set(seen);
  }

  // only the cells looked at since the last paint; a cleared memory paints the floor again
  function paintSeen(room) {
    const { seen } = room.robot;
    const fresh = new Path2D();
    let any = false;
    for (let cell = 0; cell < CELLS; cell++) {
      if (seen[cell] === room.painted[cell] || !dotted[cell]) continue;
      if (!seen[cell]) {
        paintFloor(room);
        return;
      }
      dot(fresh, cell, SEEN_R * pitch);
      room.painted[cell] = 1;
      any = true;
    }
    if (!any) return;
    room.floorCtx.globalAlpha = 1;
    room.floorCtx.fill(fresh);
  }

  function paintLit() {
    const ctx = sizeCanvas(lit);
    const dots = new Path2D();
    for (let cell = 0; cell < CELLS; cell++) {
      if (dotted[cell]) dot(dots, cell, LIT_R * pitch);
    }
    ctx.fill(dots);
  }

  // what the camera sees: a fan of rays, and a ray either side of every corner for exact shadows
  function viewPath(view) {
    const { x, y, heading } = view;
    const angles = [];
    for (let i = 0; i <= FAN_RAYS; i++)
      angles.push(-HALF_FOV_RAD + (2 * HALF_FOV_RAD * i) / FAN_RAYS);
    for (const box of view.blockers) {
      for (const [cx, cy] of [
        [box.left, box.top],
        [box.right, box.top],
        [box.left, box.bottom],
        [box.right, box.bottom],
      ]) {
        const a = wrapAngle(Math.atan2(cy - y, cx - x) - heading);
        if (Math.abs(a) < HALF_FOV_RAD) angles.push(a - 1e-4, a + 1e-4);
      }
    }
    angles.sort((a, b) => a - b);
    const path = new Path2D();
    path.moveTo(xPx(x), yPx(y));
    for (const a of angles) {
      const dx = Math.cos(heading + a) * RANGE_M;
      const dy = Math.sin(heading + a) * RANGE_M;
      let reach = 1;
      for (const box of view.blockers) reach = Math.min(reach, entry(box, x, y, x + dx, y + dy));
      path.lineTo(xPx(x + dx * reach), yPx(y + dy * reach));
    }
    path.closePath();
    return path;
  }

  let slide = null;
  let drag = null;
  let hintRoom = rooms[0];
  let hintBox = null;

  function chairAt() {
    if (drag) return [cellX(drag.cell), cellY(drag.cell)];
    if (!slide) return [cellX(chair), cellY(chair)];
    const e = smooth(slide.t);
    return [
      slide.fromX + (cellX(slide.to) - slide.fromX) * e,
      slide.fromY + (cellY(slide.to) - slide.fromY) * e,
    ];
  }

  // the belief: a hollow square where the chair was last seen, a dashed line to it from the robot's
  // ring, and once revised a stroke through it, drawn corner to corner
  function drawBelief(ctx, cell, x, y, alpha, lineAlpha, strike) {
    const cx = xPx(cellX(cell));
    const cy = yPx(cellY(cell));
    const half = (BELIEF_M * scale) / 2;
    const dx = cx - xPx(x);
    const dy = cy - yPx(y);
    const from = (RING_M * scale) / Math.hypot(dx, dy);
    const to = 1 - half / Math.max(Math.abs(dx), Math.abs(dy), half);
    if (lineAlpha > 0 && from < to) {
      ctx.setLineDash([3, 3]);
      ctx.globalAlpha = lineAlpha;
      ctx.beginPath();
      ctx.moveTo(xPx(x) + dx * from, yPx(y) + dy * from);
      ctx.lineTo(xPx(x) + dx * to, yPx(y) + dy * to);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = alpha;
    ctx.strokeRect(
      Math.round(cx - half) + 0.5,
      Math.round(cy - half) + 0.5,
      2 * half - 1,
      2 * half - 1,
    );
    if (strike === 0) return;
    const reach = (2 * half + 6) * strike;
    ctx.beginPath();
    ctx.moveTo(cx - half - 3, cy + half + 3);
    ctx.lineTo(cx - half - 3 + reach, cy + half + 3 - reach);
    ctx.stroke();
  }

  // live while it searches; once given up, room 3 keeps its belief struck out and room 2 keeps the
  // belief it never dropped, both dimmer, until a move takes the chair out of some robot's sight
  function drawMemory(room, x, y) {
    const { ctx, robot, age } = room;
    if (robot.struck >= 0) {
      const strike = smooth(clamp(age / STRIKE_S, 0, 1));
      const fade = smooth(clamp((age - STRIKE_S - STRUCK_HOLD_S) / FADE_S, 0, 1));
      const alpha = BELIEF_ALPHA - (BELIEF_ALPHA - STRUCK_ALPHA) * fade;
      drawBelief(ctx, robot.struck, x, y, alpha, BELIEF_LINE_ALPHA * (1 - strike), strike);
    } else if (!robot.found && robot.lastSeen >= 0) {
      drawBelief(ctx, robot.lastSeen, x, y, BELIEF_ALPHA, BELIEF_LINE_ALPHA, 0);
    } else if (robot.memory === NEVER_REVISED && robot.held >= 0) {
      const fade = smooth(clamp(age / FADE_S, 0, 1));
      const alpha = BELIEF_ALPHA - (BELIEF_ALPHA - STALE_ALPHA) * fade;
      drawBelief(ctx, robot.held, x, y, alpha, BELIEF_LINE_ALPHA * (1 - fade), 0);
    }
  }

  function drawRoom(room, f) {
    const { ctx, robot } = room;
    const x = robot.fromX + (robot.x - robot.fromX) * f;
    const y = robot.fromY + (robot.y - robot.fromY) * f;
    const heading = robot.fromHeading + (robot.heading - robot.fromHeading) * f;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.drawImage(room.floor, 0, 0, width, height);

    // a little brighter while the chair is in view
    const view = viewFrom(x, y, heading);
    const [chairX, chairY] = chairAt();
    ctx.save();
    ctx.clip(viewPath(view));
    ctx.globalAlpha = sees(view, chairX, chairY) ? 1 : LIT_ALPHA;
    ctx.drawImage(lit, 0, 0, width, height);
    ctx.restore();

    const { trail } = robot;
    const path = new Path2D();
    path.moveTo(xPx(trail[0]), yPx(trail[1]));
    for (let i = 2; i < trail.length - 2; i += 2) path.lineTo(xPx(trail[i]), yPx(trail[i + 1]));
    path.lineTo(xPx(x), yPx(y));
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    ctx.setLineDash([0, 4]);
    ctx.globalAlpha = 0.9;
    ctx.stroke(path);
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
    ctx.lineWidth = 1;

    // the floor is cleared under the hint, and inside the robot's ring so its mark stands clear
    const inner = RING_M * scale;
    if (hintBox && room === hintRoom) ctx.clearRect(...hintBox);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(xPx(x), yPx(y), inner - 1, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    drawMemory(room, x, y);

    const side = CHAIR_M * scale;
    ctx.globalAlpha = 1;
    ctx.fillRect(xPx(chairX) - side / 2, yPx(chairY) - side / 2, side, side);

    // the headings it has faced, as a ring of 24 ticks fixed to the room
    const outer = inner + Math.max(2, 0.12 * scale);
    const faced = new Path2D();
    const unfaced = new Path2D();
    for (let bin = 0; bin < HEADING_BINS; bin++) {
      const a = (bin * TAU) / HEADING_BINS;
      const tick = robot.faced[bin] ? faced : unfaced;
      tick.moveTo(xPx(x) + Math.cos(a) * inner, yPx(y) + Math.sin(a) * inner);
      tick.lineTo(xPx(x) + Math.cos(a) * outer, yPx(y) + Math.sin(a) * outer);
    }
    ctx.globalAlpha = 0.3;
    ctx.stroke(unfaced);
    ctx.globalAlpha = 1;
    ctx.stroke(faced);

    // the robot: a trunk and four feet, and its heading as a long tick on the ring
    const half = Math.max(TRUNK_M * scale, TRUNK_MIN_PX);
    ctx.save();
    ctx.translate(xPx(x), yPx(y));
    ctx.rotate(heading);
    ctx.fillRect(-half, -TRUNK_HALF_W_PX, 2 * half, 2 * TRUNK_HALF_W_PX);
    ctx.beginPath();
    for (const u of [-0.72 * half, 0.72 * half]) {
      for (const v of [-FOOT_OUT_PX, FOOT_OUT_PX]) {
        ctx.moveTo(u + FOOT_PX, v);
        ctx.arc(u, v, FOOT_PX, 0, TAU);
      }
    }
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(inner - 3, 0);
    ctx.lineTo(outer + 3, 0);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  let simClock = 0;
  function paint() {
    for (const room of rooms) drawRoom(room, simClock / NAV_STEP_S);
  }

  const setText = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
  };
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function outcome(robot) {
    if (robot.spent) return 'not found';
    if (robot.steps === 0) return 'in view';
    return plural(robot.steps, 'step');
  }

  function sentence(text) {
    const span = document.createElement('span');
    span.className = 'cl';
    span.textContent = text;
    return span;
  }

  function report() {
    const [blind, kept, revised] = robots;
    let returns = outcome(kept);
    if (kept.staleRevisits) returns += `, ${plural(kept.staleRevisits, 'stale revisit')}`;
    result.replaceChildren(
      sentence(`No memory: ${outcome(blind)}.`),
      ' ',
      sentence(`Never revised: ${returns}.`),
      ' ',
      sentence(`Revised: ${outcome(revised)}.`),
    );
  }

  // the hint goes in the first room, or in the last when they are stacked (where the eye is as the
  // story ends): at the free spot nearest the chair, clear of the furniture, the robot, its belief
  // and its trail; failing that straight above or below the chair, over the trail. The floor is
  // cleared under it, as a map clears the grid under a label
  function placeHint() {
    const { robot } = hintRoom;
    const w = hint.offsetWidth;
    const h = hint.offsetHeight;
    const x = xPx(cellX(chair));
    const y = yPx(cellY(chair));
    const ring = (RING_M + 0.15) * scale;
    const away = (CHAIR_M * scale) / 2 + 6;
    const half = (BELIEF_M * scale) / 2;
    const blocks = boxes.map(box => [xPx(box.left), yPx(box.top), xPx(box.right), yPx(box.bottom)]);
    for (const cell of [robot.struck, robot.held]) {
      if (cell < 0) continue;
      const cx = xPx(cellX(cell));
      const cy = yPx(cellY(cell));
      blocks.push([cx - half, cy - half, cx + half, cy + half]);
    }
    const gap = (left, top, px, py) =>
      Math.hypot(Math.max(left - px, 0, px - left - w), Math.max(top - py, 0, py - top - h));
    const clear = (left, top) =>
      gap(left, top, x, y) >= away &&
      gap(left, top, xPx(robot.x), yPx(robot.y)) > ring &&
      blocks.every(
        ([l, t, r, b]) => left + w + 4 < l || left - 4 > r || top + h + 4 < t || top - 4 > b,
      );
    const clearOfTrail = (left, top) => {
      const { trail } = robot;
      for (let i = 0; i < trail.length; i += 2) {
        if (gap(left, top, xPx(trail[i]), yPx(trail[i + 1])) < 6) return false;
      }
      return true;
    };
    const closest = (spots, test) => {
      let best = null;
      let bestDistance = Infinity;
      for (const [left, top] of spots) {
        const distance = gap(left, top, x, y);
        if (distance >= bestDistance || !test(left, top)) continue;
        best = [left, top];
        bestDistance = distance;
      }
      return best;
    };
    const around = [];
    const column = [];
    for (let top = 8; top + h <= height - 8; top += 4) {
      column.push([clamp(x - w / 2, 8, width - 8 - w), top]);
      for (let left = 8; left + w <= width - 8; left += 4) {
        if (gap(left, top, x, y) <= width / 4) around.push([left, top]);
      }
    }
    const [left, top] = closest(around, (l, t) => clear(l, t) && clearOfTrail(l, t)) ||
      closest(column, clear) || [8, 8];
    hintBox = [left - 4, top - 3, w + 8, h + 6];
    hint.style.left = left + 'px';
    hint.style.top = top + 'px';
  }

  let scripted = true;
  let handedOver = false;
  let reported = true;
  let pause = PAUSE_S;
  let hold = 0;

  // after every step: the counters, the floor, a belief given up, and the result once all rest
  function sync() {
    for (const room of rooms) {
      const { robot } = room;
      paintSeen(room);
      setText(room.steps, robot.spent ? '–' : String(robot.steps));
      setText(room.stale, robot.memory === NO_MEMORY ? '–' : String(robot.staleRevisits));
      const gaveUp = robot.struck >= 0 || (robot.found && robot.held >= 0);
      if (gaveUp !== room.gaveUp) {
        room.gaveUp = gaveUp;
        room.age = S.REDUCED ? MARK_S : 0;
      }
    }
    if (reported || !settled) return;
    reported = true;
    report();
    if (handedOver) return;
    hint.classList.add('on');
    placeHint();
  }

  let onScreen = false;
  let began = false;
  let running = false;

  function wake() {
    if (running || !onScreen || !began || S.REDUCED) return;
    running = true;
    S.add(frame);
  }

  function sleep() {
    if (!running) return;
    running = false;
    S.remove(frame);
  }

  function startSlide(cell) {
    const [fromX, fromY] = chairAt();
    slide = { fromX, fromY, to: cell, t: 0 };
    wake();
  }

  // the world holds while the chair is carried, and for a beat after it lands
  function frame(dt) {
    let moved = Boolean(slide || drag);
    if (slide) {
      slide.t = Math.min(1, slide.t + dt / SLIDE_S);
      if (slide.t === 1) {
        const { to } = slide;
        slide = null;
        place(to);
      }
    } else if (!drag) {
      if (hold > 0) {
        hold -= dt;
      } else if (!settled) {
        moved = true;
        simClock += dt * SIM_SPEED;
        while (simClock >= NAV_STEP_S) {
          simClock -= NAV_STEP_S;
          step();
          sync();
          if (settled) simClock = 0;
        }
      } else if (scripted) {
        pause -= dt;
        if (pause <= 0) {
          scripted = false;
          startSlide(SCRIPTED_CHAIR);
        }
      }
    }
    for (const room of rooms) {
      if (room.age >= MARK_S) continue;
      room.age += dt;
      moved = true;
    }
    if (moved) paint();
    if (!slide && !drag && !scripted && settled && rooms.every(room => room.age >= MARK_S)) {
      sleep();
    }
  }

  function handOver() {
    handedOver = true;
    scripted = false;
    began = true;
    hint.classList.remove('on');
    hintBox = null;
  }

  function place(cell) {
    if (moveChair(cell)) {
      reported = false;
      result.replaceChildren();
    }
    if (!S.REDUCED) {
      hold = HOLD_S;
      sync();
      wake();
      return;
    }
    settle();
    sync();
    paint();
  }

  // a click or a press slides the chair to its cell; under reduced motion it is simply there
  function moveTo(cell) {
    if (S.REDUCED) place(cell);
    else startSlide(cell);
  }

  function restart() {
    resetSim();
    slide = null;
    drag = null;
    simClock = 0;
    hold = 0;
    pause = PAUSE_S;
    scripted = true;
    nextPreset = 0;
    reported = true;
    result.replaceChildren();
    for (const room of rooms) paintFloor(room);
    if (S.REDUCED) {
      settle();
      moveChair(SCRIPTED_CHAIR);
      settle();
      scripted = false;
      reported = false;
    }
    sync();
    paint();
    wake();
  }

  function size() {
    // forced colours repaint the page but not a canvas: the drawing takes the system's text colour
    ink = forcedColors.matches ? getComputedStyle(root).color : PAPER;
    width = rooms[0].canvas.clientWidth;
    height = rooms[0].canvas.clientHeight;
    scale = width / ROOM_W_M;
    pitch = CELL_M * scale;
    paintLit();
    for (const room of rooms) {
      sizeCanvas(room.canvas);
      sizeCanvas(room.floor);
    }
    hintRoom = rooms[rooms[2].el.offsetTop > rooms[0].el.offsetTop ? 2 : 0];
    hintRoom.el.append(hint);
  }

  function layout() {
    size();
    for (const room of rooms) paintFloor(room);
    if (hint.classList.contains('on')) placeHint();
    paint();
  }

  function pointIn(room, e) {
    const rect = room.canvas.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * ROOM_W_M,
      ((e.clientY - rect.top) / rect.height) * ROOM_H_M,
    ];
  }

  function onChair(x, y) {
    const [cx, cy] = chairAt();
    return Math.hypot(x - cx, y - cy) * scale <= GRAB_PX;
  }

  // a press on the chair becomes a drag once the pointer has moved; a press that ends on the
  // chair moves nothing, and one that ends on the floor sends the chair there
  let press = null;
  for (const room of rooms) {
    const { canvas } = room;
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const grab = e.pointerType !== 'touch' && onChair(...pointIn(room, e));
      press = { room, x: e.clientX, y: e.clientY, grab };
      if (grab) canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener(
      'pointermove',
      e => {
        if (drag) {
          drag.cell = cellNear(...pointIn(room, e));
          if (S.REDUCED) paint();
        } else if (
          press &&
          press.grab &&
          Math.hypot(e.clientX - press.x, e.clientY - press.y) >= DRAG_PX
        ) {
          handOver();
          slide = null;
          drag = { cell: cellNear(...pointIn(room, e)) };
          canvas.style.cursor = 'grabbing';
          if (S.REDUCED) paint();
          wake();
        } else if (FINE) {
          canvas.style.cursor = onChair(...pointIn(room, e)) ? 'grab' : '';
        }
      },
      { passive: true },
    );
    const release = e => {
      if (drag) {
        const { cell } = drag;
        drag = null;
        canvas.style.cursor = 'grab';
        if (cell !== chair) place(cell);
        else paint();
      } else if (
        press &&
        press.room === room &&
        e.type === 'pointerup' &&
        !onChair(...pointIn(room, e))
      ) {
        handOver();
        moveTo(cellNear(...pointIn(room, e)));
      }
      press = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    // like a button: a press that leaves the room places nothing
    canvas.addEventListener('pointerleave', () => {
      if (!drag) press = null;
    });
  }

  root.querySelector('.search-move').addEventListener('click', () => {
    handOver();
    moveTo(pickSpot());
  });
  root.querySelector('.search-reset').addEventListener('click', () => {
    handOver();
    restart();
  });

  hint.textContent = FINE ? 'drag the chair' : 'tap a spot';
  root.classList.add('ready');
  size();

  // the story starts once the last room is whole on screen (on an upright phone the two rooms that
  // carry the claim are then both in view), or fills a screen too short to hold it; it runs while
  // any of the rooms is on screen
  const watcher = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.target === roomsEl) {
          onScreen = entry.isIntersecting;
        } else if (
          entry.intersectionRatio >= 0.99 ||
          entry.intersectionRect.height >= 0.9 * entry.rootBounds.height
        ) {
          began = true;
        }
      }
      if (onScreen) wake();
      else sleep();
    },
    // 0.99, not 1: a canvas's height is fractional, so flush with the screen's edge it is a
    // fraction of a pixel short of whole
    { threshold: [0, 0.9, 0.99] },
  );

  // the reduced still is a whole search, so it gets a task of its own after the script's arrival
  setTimeout(() => {
    restart();
    // a live region only from here, so the still's first sentence is not read out on arrival
    result.setAttribute('role', 'status');
    watcher.observe(roomsEl);
    watcher.observe(rooms[2].canvas);
  });

  forcedColors.addEventListener('change', layout);
  // the hint is measured in the mono face, which can arrive after this script
  document.fonts.ready.then(() => {
    if (!hintBox || hintBox[2] === hint.offsetWidth + 8) return;
    placeHint();
    paint();
  });

  let resizeTimer = 0;
  addEventListener(
    'resize',
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(layout, 150);
    },
    { passive: true },
  );
})();

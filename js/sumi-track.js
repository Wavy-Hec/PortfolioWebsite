// The FlowCount plate, live: FlowCount's tracker (flowcount/tracker.py) and line counter
// (flowcount/analytics/line_counter.py), ported, following synthetic traffic under an overpass.
// The still plate shows until the first frame is drawn; under reduced motion that frame holds.
(() => {
  'use strict';

  const S = window.SUMI;
  const root = document.querySelector('.track');
  const canvas = root && root.querySelector('canvas');
  if (!canvas) return;

  const img = root.querySelector('img');
  const pause = root.querySelector('.pause');
  const toggle = root.querySelector('.raw');
  const summary = root.querySelector('.sr-only');
  const totals = summary.querySelector('.totals');
  const ctx = canvas.getContext('2d');

  const PAPER = '#e9e7e2';
  const INK = '#141416';
  const DPR = Math.min(2, devicePixelRatio || 1);
  const MONO = '"Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';

  // the scene is laid out in the still plate's pixels; speeds are per video frame
  const PLATE_W = 640;
  const PLATE_H = 360;
  const FRAME_S = 1 / 15;
  const PREROLL_FRAMES = 120;

  const ROAD_TOP = 86;
  const ROAD_BOTTOM = 274;
  const LANE_LINES = [130, 230];
  const MEDIAN_Y = 180;
  const DECK = [176, 240];
  const SHADOW = [240, 262];
  const COUNT_X = 472;
  // brush widths, and how far the count line runs past the road's edges
  const DECK_EDGE = 4.6;
  const COUNT_LINE = 4.6;
  const COUNT_REACH = 16;
  const LANES = [
    { y: 108, heading: -1, speed: 4.6, trucks: 0.35 },
    { y: 152, heading: -1, speed: 5.8, trucks: 0 },
    { y: 208, heading: 1, speed: 6, trucks: 0 },
    { y: 252, heading: 1, speed: 4.8, trucks: 0.35 },
  ];
  const SIZE = { car: [42, 21], truck: [74, 25] };
  const FOLLOWING_GAP = 100;
  const SPAWN_MIN_FRAMES = 70;
  const SPAWN_SPREAD_FRAMES = 80;

  // now and then a car comes west down the inside eastbound lane, which is kept clear for it
  const WRONG_WAY_LANE = 2;
  const WRONG_WAY_FIRST = PREROLL_FRAMES + 40;
  const WRONG_WAY_EVERY = 900;
  const WRONG_WAY_SPEED = 5.6;
  const LANE_CLEAR_FRAMES = 125;
  const LANE_PASS_FRAMES = 130;

  // much more jitter and the tracker starts to lose vehicles as they enter
  const BOX_PAD = 6;
  const JITTER = 2.5;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const traffic = mulberry32(7);
  const noise = mulberry32(11);
  const gaussian = () => Math.sqrt(-2 * Math.log(1 - noise())) * Math.cos(2 * Math.PI * noise());

  // the diagonals of filterpy's identity matrices, scaled as tracker.py scales them
  const P0 = [10, 10, 10, 10, 10000, 10000, 10000];
  const Q = [1, 1, 1, 1, 0.01, 0.01, 0.0001];
  const R = [1, 1, 10, 10];

  function toZ([x1, y1, x2, y2], z) {
    const w = x2 - x1;
    const h = y2 - y1;
    z[0] = x1 + w / 2;
    z[1] = y1 + h / 2;
    z[2] = w * h;
    z[3] = h > 0 ? w / h : 1;
  }

  function toBox([x, y, s, r]) {
    const w = Math.sqrt(s * r);
    const h = w > 0 ? s / w : 0;
    return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
  }

  // the update's working space, shared by every track: [S | I], K, z - Hx and (I - KH) P
  const augmented = new Float64Array(4 * 8);
  const gain = new Float64Array(7 * 4);
  const residual = new Float64Array(4);
  const corrected = new Float64Array(7 * 7);

  let nextTrackId = 0;

  // SORT's KalmanBoxTracker over [x, y, s, r, vx, vy, vs]; products with F and H written out
  class KalmanBoxTracker {
    constructor(detection) {
      this.x = new Float64Array(7);
      this.P = new Float64Array(7 * 7);
      toZ(detection.bbox, this.x);
      for (let i = 0; i < 7; i++) this.P[i * 8] = P0[i];
      this.timeSinceUpdate = 0;
      this.id = nextTrackId++;
      // the spawning detection counts, so min_hits is the number of detections needed
      this.hits = 1;
      this.confirmed = false;
      this.classLabel = detection.classLabel;
    }

    predict() {
      const { x, P } = this;
      if (x[6] + x[2] <= 0) x[6] = 0;
      for (let i = 0; i < 3; i++) x[i] += x[i + 4];
      // F P F' + Q: the rates added into the rows, then into the columns
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 7; j++) P[i * 7 + j] += P[(i + 4) * 7 + j];
      }
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 3; j++) P[i * 7 + j] += P[i * 7 + j + 4];
        P[i * 8] += Q[i];
      }
      this.timeSinceUpdate++;
    }

    update(detection) {
      const { x, P } = this;
      this.timeSinceUpdate = 0;
      this.hits++;
      toZ(detection.bbox, residual);
      for (let i = 0; i < 4; i++) residual[i] -= x[i];

      // S = HPH' + R, by Gauss-Jordan beside I; S is symmetric positive definite, so no pivoting
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          augmented[i * 8 + j] = P[i * 7 + j] + (i === j ? R[i] : 0);
          augmented[i * 8 + 4 + j] = i === j ? 1 : 0;
        }
      }
      for (let col = 0; col < 4; col++) {
        const pivot = augmented[col * 8 + col];
        for (let j = 0; j < 8; j++) augmented[col * 8 + j] /= pivot;
        for (let r = 0; r < 4; r++) {
          if (r === col) continue;
          const factor = augmented[r * 8 + col];
          for (let j = 0; j < 8; j++) augmented[r * 8 + j] -= factor * augmented[col * 8 + j];
        }
      }

      // K = PH' S^-1, and x + K (z - Hx)
      for (let i = 0; i < 7; i++) {
        let correction = 0;
        for (let j = 0; j < 4; j++) {
          let sum = 0;
          for (let k = 0; k < 4; k++) sum += P[i * 7 + k] * augmented[k * 8 + 4 + j];
          gain[i * 4 + j] = sum;
          correction += sum * residual[j];
        }
        x[i] += correction;
      }

      // Joseph form, as filterpy writes it
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          let sum = 0;
          for (let k = 0; k < 4; k++) sum += ((i === k ? 1 : 0) - gain[i * 4 + k]) * P[k * 7 + j];
          corrected[i * 7 + j] = i < 4 ? sum : sum + P[i * 7 + j];
        }
      }
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          let sum = 0;
          for (let k = 0; k < 4; k++) {
            sum += corrected[i * 7 + k] * ((j === k ? 1 : 0) - gain[j * 4 + k]);
          }
          if (j >= 4) sum += corrected[i * 7 + j];
          let krk = 0;
          for (let k = 0; k < 4; k++) krk += gain[i * 4 + k] * R[k] * gain[j * 4 + k];
          P[i * 7 + j] = sum + krk;
        }
      }
      this.classLabel = detection.classLabel;
    }

    getState() {
      return toBox(this.x);
    }
  }

  function iou(a, b) {
    const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
    const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    const intersection = w * h;
    const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - intersection;
    return union > 0 ? intersection / union : 0;
  }

  const transpose = m => m[0].map((_, j) => m.map(row => row[j]));

  // scipy's linear_sum_assignment: the Hungarian method with potentials
  function linearSumAssignment(cost) {
    if (cost.length > cost[0].length) {
      return linearSumAssignment(transpose(cost)).map(([j, i]) => [i, j]);
    }
    const n = cost.length;
    const m = cost[0].length;
    const u = Array(n + 1).fill(0);
    const v = Array(m + 1).fill(0);
    // the row (from 1) holding each column; column 0 is the row being placed
    const rowOf = Array(m + 1).fill(0);
    const way = Array(m + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      rowOf[0] = i;
      let j0 = 0;
      const minv = Array(m + 1).fill(Infinity);
      const used = Array(m + 1).fill(false);
      do {
        used[j0] = true;
        const i0 = rowOf[j0];
        let delta = Infinity;
        let j1 = 0;
        for (let j = 1; j <= m; j++) {
          if (used[j]) continue;
          const reduced = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (reduced < minv[j]) {
            minv[j] = reduced;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
        for (let j = 0; j <= m; j++) {
          if (used[j]) {
            u[rowOf[j]] += delta;
            v[j] -= delta;
          } else {
            minv[j] -= delta;
          }
        }
        j0 = j1;
      } while (rowOf[j0] !== 0);
      do {
        const j1 = way[j0];
        rowOf[j0] = rowOf[j1];
        j0 = j1;
      } while (j0);
    }
    const pairs = [];
    for (let j = 1; j <= m; j++) {
      if (rowOf[j]) pairs.push([rowOf[j] - 1, j - 1]);
    }
    return pairs;
  }

  // config.yaml's settings, except an output_coast long enough to cover the overpass
  const MAX_AGE = 30;
  const MIN_HITS = 3;
  const IOU_THRESHOLD = 0.3;
  const TRACK_HIGH_THRESH = 0.5;
  const TRACK_LOW_THRESH = 0.1;
  const OUTPUT_COAST = 20;

  class Tracker {
    constructor() {
      this.trackers = [];
      this.frameCount = 0;
    }

    update(detections) {
      this.frameCount++;
      this.predictAndPrune();
      const high = detections.filter(d => d.confidence >= TRACK_HIGH_THRESH);
      const low = detections.filter(
        d => d.confidence >= TRACK_LOW_THRESH && d.confidence < TRACK_HIGH_THRESH,
      );

      const first = this.match(
        high,
        this.trackers.map((_, i) => i),
      );
      for (const [d, t] of first.matches) this.trackers[t].update(high[d]);

      const second = this.match(low, first.unmatchedTracks);
      for (const [d, t] of second.matches) this.trackers[t].update(low[d]);

      for (const d of first.unmatchedDetections) {
        this.trackers.push(new KalmanBoxTracker(high[d]));
      }
      return this.collectOutputs();
    }

    predictAndPrune() {
      for (const trk of this.trackers) trk.predict();
      this.trackers = this.trackers.filter(trk => !trk.getState().some(Number.isNaN));
    }

    match(detections, trackIndices) {
      if (!detections.length || !trackIndices.length) {
        return {
          matches: [],
          unmatchedDetections: detections.map((_, d) => d),
          unmatchedTracks: trackIndices,
        };
      }
      // across classes the IoU stays 0, so a truck never takes a car's id
      const states = trackIndices.map(t => this.trackers[t].getState());
      const ious = detections.map(det =>
        trackIndices.map((t, j) =>
          det.classLabel === this.trackers[t].classLabel ? iou(det.bbox, states[j]) : 0,
        ),
      );
      const matches = [];
      const matchedDetections = new Set();
      const matchedColumns = new Set();
      for (const [d, j] of linearSumAssignment(ious.map(row => row.map(value => -value)))) {
        if (ious[d][j] < IOU_THRESHOLD) continue;
        matches.push([d, trackIndices[j]]);
        matchedDetections.add(d);
        matchedColumns.add(j);
      }
      return {
        matches,
        unmatchedDetections: detections.map((_, d) => d).filter(d => !matchedDetections.has(d)),
        unmatchedTracks: trackIndices.filter((_, j) => !matchedColumns.has(j)),
      };
    }

    collectOutputs() {
      const out = [];
      for (let i = this.trackers.length - 1; i >= 0; i--) {
        const trk = this.trackers[i];
        if (trk.timeSinceUpdate > MAX_AGE) {
          this.trackers.splice(i, 1);
          continue;
        }
        if (!trk.confirmed && trk.hits >= MIN_HITS) trk.confirmed = true;
        // the first frames show tentative tracks too, without confirming them
        const emit = trk.confirmed || this.frameCount <= MIN_HITS;
        if (emit && trk.timeSinceUpdate <= OUTPUT_COAST) {
          out.push({
            id: trk.id,
            bbox: trk.getState(),
            classLabel: trk.classLabel,
            timeSinceUpdate: trk.timeSinceUpdate,
          });
        }
      }
      return out;
    }
  }

  // the line counter (with base.py's orient and segments_intersect)
  const PRUNE_GRACE_FRAMES = 5;
  const ALERT_FLASH_FRAMES = 30;

  const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

  function segmentsIntersect(p1, p2, p3, p4) {
    const d1 = orient(p3, p4, p1);
    const d2 = orient(p3, p4, p2);
    const d3 = orient(p1, p2, p3);
    const d4 = orient(p1, p2, p4);
    return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
  }

  class LineCrossingCounter {
    constructor(p1, p2, expectedDirection) {
      this.p1 = p1;
      this.p2 = p2;
      this.expectedDirection = expectedDirection;
      this.counts = { in: 0, out: 0 };
      this.prevCenter = new Map();
      this.lastSeen = new Map();
      this.alertUntilFrame = -1;
    }

    update(tracks, frameIndex) {
      const wrongWay = [];
      for (const track of tracks) {
        const [x1, y1, x2, y2] = track.bbox;
        const cur = [(x1 + x2) / 2, (y1 + y2) / 2];
        const prev = this.prevCenter.get(track.id);
        this.prevCenter.set(track.id, cur);
        this.lastSeen.set(track.id, frameIndex);
        if (!prev || !segmentsIntersect(prev, cur, this.p1, this.p2)) continue;
        const direction = orient(this.p1, this.p2, cur) >= 0 ? 'in' : 'out';
        this.counts[direction]++;
        if (direction !== this.expectedDirection) {
          this.alertUntilFrame = frameIndex + ALERT_FLASH_FRAMES;
          wrongWay.push(track.id);
        }
      }
      // a short dropout keeps its last centre, so a crossing made during it still counts
      for (const [id, seen] of this.lastSeen) {
        if (frameIndex - seen > PRUNE_GRACE_FRAMES) {
          this.prevCenter.delete(id);
          this.lastSeen.delete(id);
        }
      }
      return wrongWay;
    }
  }

  // each line's ends are ordered so that legal traffic crosses it "in" (--expect-direction in)
  const westbound = new LineCrossingCounter([COUNT_X, ROAD_TOP], [COUNT_X, MEDIAN_Y], 'in');
  const eastbound = new LineCrossingCounter([COUNT_X, ROAD_BOTTOM], [COUNT_X, MEDIAN_Y], 'in');

  const VARIANTS = 2;
  const vehicles = [];
  const nextSpawn = LANES.map(() => 0);
  let spawned = 0;
  let frame = 0;

  function spawn(lane, heading, kind, speed) {
    const [length, width] = SIZE[kind];
    const x = heading > 0 ? -length / 2 - 8 : PLATE_W + length / 2 + 8;
    const variant = spawned++ % VARIANTS;
    vehicles.push({ kind, lane, heading, length, width, speed, x, prevX: x, variant, missed: 0 });
  }

  function laneHeldForWrongWay(lane) {
    if (lane !== WRONG_WAY_LANE) return false;
    const passes = Math.ceil((frame - WRONG_WAY_FIRST - LANE_PASS_FRAMES) / WRONG_WAY_EVERY);
    const next = WRONG_WAY_FIRST + Math.max(0, passes) * WRONG_WAY_EVERY;
    return frame >= next - LANE_CLEAR_FRAMES;
  }

  function entryClear(lane, heading) {
    return vehicles.every(v => {
      if (v.lane !== lane || v.heading !== heading) return true;
      const entered = heading > 0 ? v.x - v.length / 2 : PLATE_W - (v.x + v.length / 2);
      return entered > FOLLOWING_GAP;
    });
  }

  function moveTraffic() {
    LANES.forEach((lane, i) => {
      if (frame < nextSpawn[i] || laneHeldForWrongWay(i) || !entryClear(i, lane.heading)) return;
      const kind = traffic() < lane.trucks ? 'truck' : 'car';
      const speed = lane.speed * (kind === 'truck' ? 0.95 : 1) * (0.97 + traffic() * 0.06);
      spawn(i, lane.heading, kind, speed);
      nextSpawn[i] = frame + SPAWN_MIN_FRAMES + Math.floor(traffic() * SPAWN_SPREAD_FRAMES);
    });
    if (frame >= WRONG_WAY_FIRST && (frame - WRONG_WAY_FIRST) % WRONG_WAY_EVERY === 0) {
      spawn(WRONG_WAY_LANE, -1, 'car', WRONG_WAY_SPEED);
    }

    // vehicles are in spawn order, so each one's leader in its lane has already moved
    const leaders = new Map();
    for (const v of vehicles) {
      const key = v.lane * 2 + (v.heading > 0 ? 1 : 0);
      const leader = leaders.get(key);
      let move = v.speed;
      if (leader) {
        const room = Math.abs(leader.x - v.x) - (leader.length + v.length) / 2 - FOLLOWING_GAP;
        move = Math.max(0, Math.min(move, room));
      }
      v.prevX = v.x;
      v.x += v.heading * move;
      leaders.set(key, v);
    }

    for (let i = vehicles.length - 1; i >= 0; i--) {
      const v = vehicles[i];
      const gone = v.heading > 0 ? v.x - v.length / 2 > PLATE_W + 8 : v.x + v.length / 2 < -8;
      if (gone) vehicles.splice(i, 1);
    }
  }

  const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

  function detect() {
    const detections = [];
    for (const v of vehicles) {
      if (v.missed > 0) {
        v.missed--;
        continue;
      }
      if (noise() < 0.005) {
        v.missed = Math.floor(noise() * 3);
        continue;
      }
      const left = v.x - v.length / 2;
      const right = v.x + v.length / 2;
      const inFrame = overlap(left, right, 0, PLATE_W) / v.length;
      const hidden = overlap(left, right, DECK[0], DECK[1]) / v.length;
      const shaded = overlap(left, right, SHADOW[0], SHADOW[1]) / v.length;
      if (inFrame < 0.5 || hidden >= 0.5) continue;
      const unsure = hidden > 0.1 || shaded > 0.3 || noise() < 0.06;
      const y = LANES[v.lane].y;
      detections.push({
        bbox: [
          Math.max(0, left - BOX_PAD) + gaussian() * JITTER,
          y - v.width / 2 - BOX_PAD + gaussian() * JITTER,
          Math.min(PLATE_W, right + BOX_PAD) + gaussian() * JITTER,
          y + v.width / 2 + BOX_PAD + gaussian() * JITTER,
        ],
        classLabel: v.kind,
        confidence: unsure ? 0.15 + noise() * 0.3 : 0.55 + noise() * 0.4,
        vehicle: v,
      });
    }
    return detections;
  }

  const tracker = new Tracker();
  const flagged = new Set();
  let detections = [];
  let tracks = [];
  let previousBoxes = new Map();
  let west = 0;
  let east = 0;

  // early velocities are unreliable while a box is still cut by the plate's edge
  const HEADING_DISTANCE = 12;
  const firstSeenX = new Map();
  const headings = new Map();

  function updateHeadings() {
    const alive = new Set(tracker.trackers.map(trk => trk.id));
    for (const id of firstSeenX.keys()) {
      if (alive.has(id)) continue;
      firstSeenX.delete(id);
      headings.delete(id);
    }
    for (const track of tracks) {
      const x = (track.bbox[0] + track.bbox[2]) / 2;
      if (!firstSeenX.has(track.id)) firstSeenX.set(track.id, x);
      const moved = x - firstSeenX.get(track.id);
      if (!headings.has(track.id) && Math.abs(moved) >= HEADING_DISTANCE) {
        headings.set(track.id, Math.sign(moved));
      }
    }
  }

  function step() {
    frame++;
    moveTraffic();
    detections = detect();
    previousBoxes = new Map(tracks.map(t => [t.id, t.bbox]));
    tracks = tracker.update(detections);
    for (const id of westbound.update(tracks, frame)) flagged.add(id);
    for (const id of eastbound.update(tracks, frame)) flagged.add(id);
    updateHeadings();

    const nowWest = westbound.counts.in + eastbound.counts.out;
    const nowEast = eastbound.counts.in + westbound.counts.out;
    if (nowWest !== west || nowEast !== east) {
      west = nowWest;
      east = nowEast;
      totals.textContent = `Counted so far: ${west} westbound, ${east} eastbound.`;
    }
  }

  // every edge on a whole device pixel, so the plate stays ink and paper
  let scale = 1;
  let bareIds = false;
  let labelPx = 11;
  let tagType = null;
  let totalType = null;
  let background = null;
  let strips = [];
  let alertStrip = null;
  let dabs = null;
  let laidOutWidth = 0;
  let showRaw = false;

  const at = value => Math.round(value * scale);
  const lerp = (a, b, f) => a + (b - a) * f;

  // a dry-brush stroke, in plate units, stamped in whole-pixel squares
  function brush(g, random, x1, y1, x2, y2, width, dry) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / length;
    const uy = (y2 - y1) / length;
    const flat = Math.abs(ux) >= Math.abs(uy);
    const bristles = Math.max(2, Math.round(width / 1.4));
    const nib = Math.max(1, Math.round((width / bristles) * 1.7 * scale));
    const half = Math.floor(nib / 2);
    const stamps = Math.max(1, Math.round(length));
    const fill = row =>
      g.fillRect(
        Math.min(row[0], row[2]) - half,
        Math.min(row[1], row[3]) - half,
        Math.abs(row[2] - row[0]) + nib,
        Math.abs(row[3] - row[1]) + nib,
      );
    for (let b = 0; b < bristles; b++) {
      const across = ((b + 0.5) / bristles - 0.5) * width;
      let drift = 0;
      let row = null;
      for (let k = 0; k <= stamps; k++) {
        const along = (k / stamps) * length;
        drift = drift * 0.95 + (random() - 0.5) * 0.18;
        const end = along / length - (1 - dry);
        const gap = end > 0 && random() < (end / dry) * 0.55;
        const x = at(x1 + ux * along - uy * (across + drift));
        const y = at(y1 + uy * along + ux * (across + drift));
        if (row && !gap && (flat ? y === row[1] : x === row[0])) {
          row[2] = x;
          row[3] = y;
        } else {
          if (row) fill(row);
          row = gap ? null : [x, y, x, y];
        }
      }
      if (row) fill(row);
    }
  }

  function offscreen(width, height) {
    const g = document.createElement('canvas').getContext('2d');
    g.canvas.width = width;
    g.canvas.height = height;
    g.fillStyle = INK;
    return g;
  }

  // a stroke in a strip of its own, drawn with the road and again over the tags so no tag cuts it
  function paintStrip(x, width, seed, runs) {
    const half = at(width / 2 + 3);
    const g = offscreen(2 * half, canvas.height);
    const random = mulberry32(seed);
    g.translate(half - at(x), 0);
    for (const [from, to, dry] of runs) brush(g, random, x, from, x, to, width, dry);
    const left = at(x) - half;
    const pixels = g.getImageData(0, 0, 2 * half, canvas.height).data;
    const ink = [];
    for (let y = 0; y < canvas.height; y++) {
      const spans = [];
      for (let i = 0; i < 2 * half; i++) {
        if (!pixels[(y * 2 * half + i) * 4 + 3]) continue;
        if (spans[spans.length - 1] === left + i) spans[spans.length - 1]++;
        else spans.push(left + i, left + i + 1);
      }
      ink.push(spans);
    }
    return { image: g.canvas, left, ink };
  }

  function addInk(path, strip, x, top, width, height) {
    for (let row = top; row < top + height; row++) {
      const spans = strip.ink[row];
      for (let i = 0; i < spans.length; i += 2) {
        const from = Math.max(spans[i], x);
        const to = Math.min(spans[i + 1], x + width);
        if (from < to) path.rect(from, row, to - from, 1);
      }
    }
  }

  function paintStrips() {
    // the count line is brushed out from the median, so both its ends are dry
    const count = [
      [MEDIAN_Y, ROAD_TOP - COUNT_REACH, 0.15],
      [MEDIAN_Y, ROAD_BOTTOM + COUNT_REACH, 0.15],
    ];
    strips = [
      paintStrip(DECK[0], DECK_EDGE, 5, [[-6, PLATE_H + 6, 0.35]]),
      paintStrip(DECK[1], DECK_EDGE, 6, [[PLATE_H + 6, -6, 0.35]]),
      paintStrip(COUNT_X, COUNT_LINE, 8, count),
    ];
    alertStrip = paintStrip(COUNT_X, 2 * COUNT_LINE, 9, count);
  }

  function paintRoad() {
    const g = offscreen(canvas.width, canvas.height);
    const random = mulberry32(3);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = INK;
    brush(g, random, -6, ROAD_TOP - 4, PLATE_W + 6, ROAD_TOP - 4, 7.5, 0.45);
    brush(g, random, PLATE_W + 6, ROAD_BOTTOM + 4, -6, ROAD_BOTTOM + 4, 7.5, 0.45);
    for (const y of LANE_LINES) {
      for (let x = 4; x < PLATE_W; x += 36) brush(g, random, x, y, x + 15, y, 2, 0.3);
    }
    for (const y of [MEDIAN_Y - 5, MEDIAN_Y + 5]) brush(g, random, -6, y, PLATE_W + 6, y, 1.6, 0.3);

    g.save();
    g.beginPath();
    g.rect(
      at(SHADOW[0]),
      at(ROAD_TOP),
      at(SHADOW[1]) - at(SHADOW[0]),
      at(ROAD_BOTTOM) - at(ROAD_TOP),
    );
    g.clip();
    const rise = ROAD_BOTTOM - ROAD_TOP;
    for (let foot = SHADOW[0] - rise; foot < SHADOW[1]; foot += 6.5) {
      const from = Math.max(0, SHADOW[0] - 1 - foot);
      const to = Math.min(rise, SHADOW[1] + 1 - foot);
      brush(g, random, foot + from, ROAD_BOTTOM - from, foot + to, ROAD_BOTTOM - to, 1, 0.3);
    }
    g.restore();

    g.fillStyle = PAPER;
    g.fillRect(at(DECK[0]), 0, at(DECK[1]) - at(DECK[0]), canvas.height);
    g.fillStyle = INK;
    const centre = (DECK[0] + DECK[1]) / 2;
    for (let y = 6; y < PLATE_H; y += 36) brush(g, random, centre, y, centre, y + 15, 1.8, 0.3);
    for (const strip of strips) g.drawImage(strip.image, strip.left, 0);
    background = g.canvas;
  }

  // one dab from the vehicle's front, so the dry end trails; a truck is two
  function paintVehicle(kind, heading, seed) {
    const [length, width] = SIZE[kind];
    const margin = Math.ceil(2 * scale);
    const g = offscreen(at(length) + 2 * margin, at(width) + 2 * margin);
    const random = mulberry32(seed);
    g.translate(margin, margin);
    const front = heading > 0 ? length : 0;
    const back = length - front;
    if (kind === 'truck') {
      const cab = front - heading * 14;
      brush(g, random, front, width / 2, cab, width / 2, width - 4, 0.05);
      brush(g, random, cab - heading * 3, width / 2, back, width / 2, width, 0.07);
    } else {
      brush(g, random, front, width / 2, back, width / 2, width, 0.07);
    }
    return { image: g.canvas, margin };
  }

  // glyph coverage cut at 40 %: a cut at half loses the thin bars of a T or a 7
  const GLYPHS = '·0123456789ACGKNORTUWY';
  const COVERAGE_CUT = 0.4 * 255;

  function cutType(size) {
    ctx.font = `${size}px ${MONO}`;
    const digit = ctx.measureText('0');
    const step = Math.round(digit.width + size * 0.08);
    const baseline = size;
    const width = GLYPHS.length * step;
    const height = size + Math.ceil(size / 4);
    const g = offscreen(width, height);
    g.font = ctx.font;
    for (let i = 0; i < GLYPHS.length; i++) g.fillText(GLYPHS[i], i * step, baseline);
    const mask = g.getImageData(0, 0, width, height);
    for (let p = 3; p < mask.data.length; p += 4) {
      mask.data[p] = mask.data[p] < COVERAGE_CUT ? 0 : 255;
    }
    const sheet = colour => {
      const s = offscreen(width, height);
      s.putImageData(mask, 0, 0);
      s.globalCompositeOperation = 'source-in';
      s.fillStyle = colour;
      s.fillRect(0, 0, width, height);
      return s.canvas;
    };
    // the row that digits and capitals centre on
    const middle = baseline - Math.round(digit.actualBoundingBoxAscent / 2);
    return { size, step, baseline, height, middle, ink: sheet(INK), paper: sheet(PAPER) };
  }

  function print(type, sheet, text, x, top) {
    const { step, height } = type;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ') continue;
      const from = GLYPHS.indexOf(text[i]) * step;
      ctx.drawImage(sheet, from, 0, step, height, x + i * step, top, step, height);
    }
  }

  function arrow(path, x, y, direction, length, head, thickness) {
    for (let i = 0; i < head; i++) {
      path.rect(direction < 0 ? x + i : x - 1 - i, y - i, 1, 2 * i + 1);
    }
    const shaftTop = y - Math.floor(thickness / 2);
    path.rect(direction < 0 ? x : x - length, shaftTop, length, thickness);
  }

  // the backing store takes the box's fractional size, which the stylesheet maps pixel for pixel
  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    if (width === laidOutWidth) return false;
    laidOutWidth = width;
    canvas.width = Math.round(width * DPR);
    canvas.height = Math.round(height * DPR);
    scale = canvas.width / PLATE_W;
    bareIds = width < 400;
    // labels at the site's 11 css px, growing to 12 on the largest plates
    labelPx = Math.round(Math.min(12, Math.max(11, width / 48)) * DPR);
    return true;
  }

  function cutTypes() {
    tagType = cutType(labelPx);
    totalType = cutType(Math.round(labelPx * 1.2));
  }

  function paintVehicles() {
    dabs = {};
    for (const kind of Object.keys(SIZE)) {
      dabs[kind] = [-1, 1].map(heading =>
        Array.from({ length: VARIANTS }, (_, i) =>
          paintVehicle(kind, heading, 40 * i + heading + 2),
        ),
      );
    }
  }

  function dashes(path, x, y, w, h, on, off) {
    const horizontal = w >= h;
    const length = horizontal ? w : h;
    for (let s = 0; s < length; s += on + off) {
      const run = Math.min(on, length - s);
      if (horizontal) path.rect(x + s, y, run, h);
      else path.rect(x, y + s, w, run);
    }
  }

  function outline(path, [x1, y1, x2, y2], thickness, on, off) {
    const side = y2 - y1 - 2 * thickness;
    dashes(path, x1, y1, x2 - x1, thickness, on, off);
    dashes(path, x1, y2 - thickness, x2 - x1, thickness, on, off);
    dashes(path, x1, y1 + thickness, thickness, side, on, off);
    dashes(path, x2 - thickness, y1 + thickness, thickness, side, on, off);
  }

  function draw(alpha) {
    const hairline = Math.max(1, Math.round(DPR));
    ctx.drawImage(background, 0, 0);

    if (showRaw) {
      const dot = 2 * hairline;
      const raw = new Path2D();
      for (const det of detections) {
        const v = det.vehicle;
        const shift = lerp(v.prevX, v.x, alpha) - v.x;
        const [x1, y1, x2, y2] = det.bbox;
        const box = [x1 + shift, y1, x2 + shift, y2].map(at);
        outline(raw, box, dot, dot, det.confidence < TRACK_HIGH_THRESH ? 3 * dot : dot);
      }
      ctx.fillStyle = INK;
      ctx.fill(raw);
    }

    // tag paper goes down before the vehicles, so it never covers one, and its ink after the boxes
    const pad = 2 * hairline;
    const half = Math.round(labelPx * 0.4);
    const solid = new Path2D();
    const coasting = new Path2D();
    const tags = [];

    const place = (text, box, heading) => {
      const width = text.length * tagType.step;
      const x = heading < 0 ? box[2] + 2 * pad : box[0] - 2 * pad - width;
      const fits = x - pad >= 0 && x + width + pad <= canvas.width;
      return fits ? { text, x, y: Math.round((box[1] + box[3]) / 2), width } : null;
    };

    for (const track of tracks) {
      // the detector has lost a vehicle half off the plate, so a coasting box there follows nothing
      const centre = (track.bbox[0] + track.bbox[2]) / 2;
      if (track.timeSinceUpdate > 0 && (centre < 0 || centre > PLATE_W)) continue;
      const before = previousBoxes.get(track.id);
      const box = track.bbox.map((value, i) => at(before ? lerp(before[i], value, alpha) : value));
      const weight = flagged.has(track.id) ? 2 * hairline : hairline;
      if (track.timeSinceUpdate === 0) outline(solid, box, weight, Infinity, 0);
      else outline(coasting, box, weight, 4 * hairline, 3 * hairline);

      const heading = headings.get(track.id);
      if (!heading) continue;
      const name = bareIds ? String(track.id) : `${track.classLabel} ${track.id}`.toUpperCase();
      const flag = flagged.has(track.id) && place(`${name} · WRONG WAY`, box, heading);
      const tag = flag || place(name, box, heading);
      if (tag) tags.push(tag);
    }
    ctx.fillStyle = PAPER;
    for (const tag of tags) {
      ctx.fillRect(tag.x - pad, tag.y - half - pad, tag.width + 2 * pad, 2 * (half + pad));
    }
    const alerting = Math.max(westbound.alertUntilFrame, eastbound.alertUntilFrame) >= frame;
    const structure = alerting ? [...strips, alertStrip] : strips;
    for (const strip of structure) ctx.drawImage(strip.image, strip.left, 0);

    const deckLeft = at(DECK[0] - 2);
    const deckRight = at(DECK[1] + 2);
    for (const v of vehicles) {
      const { image, margin } = dabs[v.kind][v.heading > 0 ? 1 : 0][v.variant];
      const x = at(lerp(v.prevX, v.x, alpha) - v.length / 2) - margin;
      const y = at(LANES[v.lane].y - v.width / 2) - margin;
      const { width, height } = image;
      const leftColumns = Math.min(width, deckLeft - x);
      const rightFrom = Math.max(0, deckRight - x);
      if (leftColumns > 0) {
        ctx.drawImage(image, 0, 0, leftColumns, height, x, y, leftColumns, height);
      }
      if (rightFrom < width) {
        const columns = width - rightFrom;
        ctx.drawImage(image, rightFrom, 0, columns, height, x + rightFrom, y, columns, height);
      }
    }

    ctx.fillStyle = INK;
    ctx.fill(solid);
    ctx.fill(coasting);
    for (const { text, x, y } of tags) print(tagType, tagType.ink, text, x, y - tagType.middle);

    // where a tag crosses a stroke, its letters print in paper through a clip of the stroke's ink
    const crossing = [];
    const onInk = new Path2D();
    for (const tag of tags) {
      const { x, width } = tag;
      const top = tag.y - tagType.middle;
      const under = structure.filter(s => s.left < x + width && s.left + s.image.width > x);
      for (const strip of under) addInk(onInk, strip, x, top, width, tagType.height);
      if (under.length) crossing.push(tag);
    }
    if (crossing.length) {
      ctx.save();
      ctx.clip(onInk);
      for (const { text, x, y } of crossing) {
        print(tagType, tagType.paper, text, x, y - tagType.middle);
      }
      ctx.restore();
    }

    const { size } = totalType;
    const arrows = new Path2D();
    const shaft = Math.round(size * 0.7);
    const gap = Math.round(size * 0.4);
    const lineTop = at(ROAD_TOP - COUNT_REACH);
    const lineBottom = at(ROAD_BOTTOM + COUNT_REACH);
    const ends = [
      [west, -1, lineTop - Math.round(size * 0.55)],
      [east, 1, lineBottom + Math.round(size * 1.3)],
    ];
    for (const [count, direction, baseline] of ends) {
      const text = String(count);
      const left = at(COUNT_X) - Math.round((shaft + gap + text.length * totalType.step) / 2);
      const tip = direction < 0 ? left : left + shaft;
      const middle = baseline - Math.round(size * 0.34);
      arrow(arrows, tip, middle, direction, shaft, Math.round(size * 0.3), hairline);
      print(totalType, totalType.ink, text, left + shaft + gap, baseline - totalType.baseline);
    }
    ctx.fill(arrows);
  }

  let acc = 0;

  // the page's loop caps dt at 50 ms, under one frame, so a tick takes at most one step
  function tick(dt) {
    acc += dt;
    if (acc >= FRAME_S) {
      step();
      acc -= FRAME_S;
    }
    draw(acc / FRAME_S);
  }

  const nextTask = () => new Promise(resolve => setTimeout(resolve));

  const repaint = [cutTypes, paintStrips, paintRoad, paintVehicles];

  // the size, each part and the first frame in a task of their own, so none is long
  async function start() {
    for (const part of [resize, ...repaint]) {
      await nextTask();
      part();
    }
    await nextTask();
    draw(0);
    root.classList.add('live');
    img.setAttribute('aria-hidden', 'true');
    summary.hidden = false;

    toggle.addEventListener('click', () => {
      showRaw = !showRaw;
      toggle.setAttribute('aria-pressed', String(showRaw));
      draw(acc / FRAME_S);
    });

    let onScreen = false;
    let held = false;
    let running = false;
    const run = () => {
      const wanted = onScreen && !held;
      if (wanted && !running) S.add(tick);
      if (!wanted && running) S.remove(tick);
      running = wanted;
    };
    pause.addEventListener('click', () => {
      held = !held;
      pause.firstElementChild.textContent = held ? 'Play' : 'Pause';
      run();
    });
    if (!S.REDUCED) {
      new IntersectionObserver(entries => {
        onScreen = entries[entries.length - 1].isIntersecting;
        run();
      }).observe(canvas);
    }

    let resizeTimer = 0;
    addEventListener(
      'resize',
      () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (resize()) {
            for (const part of repaint) part();
          }
          draw(acc / FRAME_S);
        }, 150);
      },
      { passive: true },
    );
  }

  // the plate opens on traffic already under way, run ahead in short slices so no task is long
  function preroll(frames) {
    const slice = Math.min(10, frames);
    for (let i = 0; i < slice; i++) step();
    if (frames > slice) setTimeout(preroll, 0, frames - slice);
    else document.fonts.load(`10px ${MONO}`).then(start, start);
  }
  setTimeout(preroll, 0, PREROLL_FRAMES);
})();

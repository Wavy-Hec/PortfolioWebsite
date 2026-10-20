/* go2-trot: a Unitree Go2 quadruped, side view, trotting in place as a halftone silhouette. Proportions from the Go2 (body 0.37 m, hips
 * 0.19 m fore and aft, thigh and calf 0.213 m, knees folding back), the legs from forward kinematics at a diagonal-pair trot of 1.6 Hz,
 * the near legs brighter and the far pair set rearward, the head a nose block with the lidar under its chin, a soft ground shadow that breathes with the gait. Monochrome: eight paper tones on sumi.
 * Written for this site in the ascii-magic piece format (ascii-magic.com): export meta + default create() returning (t) => frame,
 * square cells, meant for look="dots" (also reads in look="ascii"). */
import { noise2, clamp, KEYS } from "../lib/kit.js";

const W = 160, H = 72;
const TONES = ["#1d1d1f", "#353537", "#4e4e50", "#696967", "#838381", "#9d9c99", "#b8b6b1", "#e9e7e2"];
const LUM = TONES.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0));
const LV = "▁▂▃▄▅▆▇█", LVV = [0.135, 0.257, 0.378, 0.51, 0.635, 0.757, 0.878, 1];
const TAB = [];
for (let i = 0; i < 256; i++) {
  const B = (i / 255) * LUM[7];
  let k = 0; while (k < 7 && LUM[k] < B) k++;
  const lv = B / LUM[k]; let g = 0, bd = 9; LVV.forEach((v, j) => { const d = Math.abs(v - lv); if (d < bd) { bd = d; g = j; } });
  TAB.push([LV[g], KEYS[k]]);
}
export const meta = {
  slug: "go2-trot", name: "Go2, Trotting", category: "machines",
  note: "A Unitree Go2 quadruped in side view trots in place: legs from forward kinematics at a diagonal-pair gait, the near pair brighter, a soft shadow under it.",
  tags: ["robot", "quadruped", "gait", "halftone", "mono"],
  cols: W, rows: H, fps: 24, cell: "square", look: "dots",
  dots: { tone: { lo: 0, hi: 1 } },
  palette: Object.fromEntries(TONES.map((c, i) => [KEYS[i], c])),
};

// metres -> cells: s cells per metre, the body's centre at (CX, CY); x runs to the rear, y down; the robot faces left
const S = 112, CX = 80, CY = 20, BODY_L = 0.37, BODY_H = 0.095, HIP_X = 0.1934, THIGH = 0.213, CALF = 0.213, HIP_DROP = 0.03, GROUND = HIP_DROP + 0.342;
const TH1 = 0.8, PSI = -1.5, HZ = 1.6;
const LEGS = [{ x: -HIP_X, ph: Math.PI, near: false }, { x: HIP_X, ph: 0, near: false }, { x: -HIP_X, ph: 0, near: true }, { x: HIP_X, ph: Math.PI, near: true }];   // FR, RR (far), FL, RL (near)
function legPose(leg, ph) {
  const sw = Math.max(0, Math.sin(ph)), st = Math.min(0, Math.sin(ph));
  const th1 = TH1 - 0.26 * Math.sin(ph), psi = PSI - 0.42 * sw + 0.1 * st;
  const tx = leg.x + (leg.near ? 0 : 0.026), ty = HIP_DROP;   // the far pair sits ~3 cells rearward, so four legs read
  const kx = tx + THIGH * Math.sin(th1), ky = ty + THIGH * Math.cos(th1);
  return { thigh: [tx, ty], knee: [kx, ky], foot: [kx + CALF * Math.sin(th1 + psi), ky + CALF * Math.cos(th1 + psi)] };
}

export default function create() {
  const out = new Float32Array(W * H), rows = new Array(H);
  const P = (p, bob) => [CX + p[0] * S, CY + (p[1] + bob) * S];
  // a capsule from a to b (cells) with radius r (cells): every cell within r of the segment, lit v, a lighter rim along its upper edge
  const capsule = (a, b, r, v, rim) => {
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - r - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0]) + r + 1));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - r - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1]) + r + 1));
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const u = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / l2), px = a[0] + dx * u, py = a[1] + dy * u, d = Math.hypot(x - px, y - py);
      if (d > r) continue;
      const i = y * W + x, edge = d > r - 1.2;
      out[i] = Math.max(out[i], (edge ? v * 0.8 : v) * (0.88 + 0.12 * noise2(x / 2.5, y / 2.5, 5)) + (rim && y < py && edge ? 0.18 : 0));
    }
  };
  const disc = (c, r, v) => capsule(c, c, r, v, false);
  return (t) => {
    out.fill(0);
    const ph = t * HZ * Math.PI * 2, bob = 0.006 * Math.sin(ph * 2);
    const poses = LEGS.map((L) => legPose(L, ph + L.ph));
    // the ground: a faint line; the shadow: an ellipse under the body that tightens as the body rises
    const gy = Math.round(CY + GROUND * S);
    for (let x = 12; x < W - 12; x++) out[gy * W + x] = 0.12;
    for (let y = gy - 1; y <= gy + 3; y++) for (let x = 0; x < W; x++) {
      const u = (x - CX) / (0.42 * S), w = (y - gy - 1) / 2.6, q = u * u + w * w;
      if (q < 1) out[y * W + x] = Math.max(out[y * W + x], 0.26 * (1 - q) * (1 - bob * 30));
    }
    for (let k = 0; k < 4; k++) {
      const L = LEGS[k], p = poses[k];
      if (k === 2) {                                                     // the body between the far and the near legs: rounded blocks, their top edges lit
        const bx0 = CX - (BODY_L / 2) * S, bx1 = CX + (BODY_L / 2) * S, by0 = CY + (-BODY_H / 2 + bob) * S, by1 = CY + (BODY_H / 2 + bob) * S;
        const block = (x0, y0, x1, y1, r, top, v) => {
          for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
            const ex = Math.min(x - x0, x1 - x), ey = Math.min(y - y0, y1 - y); if (ex < 0 || ey < 0 || (ex < r && ey < r && Math.hypot(r - ex, r - ey) > r)) continue;
            const i = y * W + x; out[i] = Math.max(out[i], (ey < 1.2 && y < y0 + 2 ? top : ey < 1.2 ? v * 0.75 : v) * (0.9 + 0.1 * noise2(x / 3, y / 3, 8)));
          }
        };
        block(bx0, by0, bx1, by1, 3, 0.8, 0.5);                                                      // the body
        block(bx1 - 0.12 * S, by0 - 0.024 * S, bx1 - 0.012 * S, by0 + 0.03 * S, 2, 0.74, 0.44);       // the battery hump on the rear
        for (let y = Math.floor(by0) + 2; y <= Math.ceil(by1) - 2; y++) for (let x = Math.round(bx0 + 0.24 * S); x <= Math.round(bx0 + 0.33 * S); x++) out[y * W + x] = 0.6;   // the rear housing
        // the head: a rounded nose block in front of the body that drops below its line, the camera strip dark across its face, the lidar one bright cell under its chin
        const hx0 = bx0 - 0.13 * S, hy0 = CY + (-0.03 + bob) * S, hy1 = CY + (0.064 + bob) * S;
        block(hx0, hy0, bx0 + 0.03 * S, hy1, 3, 0.84, 0.58);
        for (let y = Math.round(hy0 + 0.028 * S); y <= Math.round(hy0 + 0.046 * S); y++) for (let x = Math.round(hx0) + 1; x <= Math.round(hx0 + 0.075 * S); x++) out[y * W + x] = 0.2;
        disc(P([-BODY_L / 2 - 0.112, 0.078], bob), 1.5, 1);                                            // the lidar
        disc(P([0.02, -0.01], bob), 2.2, 0.72);                                                        // the imu
      }
      const v = L.near ? 0.64 : 0.28;
      capsule(P(p.thigh, bob), P(p.knee, bob), 0.027 * S, v, L.near); capsule(P(p.knee, bob), P(p.foot, bob), 0.015 * S, v, L.near);   // the calf thinner than the thigh
      disc(P(p.foot, bob), 0.019 * S, L.near ? 0.6 : 0.28); disc(P(p.knee, bob), 0.017 * S, L.near ? 0.72 : 0.32); disc(P(p.thigh, bob), 0.03 * S, L.near ? 0.66 : 0.32);
    }
    for (let y = 0; y < H; y++) { let s = ""; for (let x = 0; x < W; x++) { const v = out[y * W + x]; s += v < 0.012 ? "  " : TAB[Math.min(255, Math.round(v * 255))].join(""); } rows[y] = s; }
    return { text: rows.map((r) => r.replace(/(.)./g, "$1")).join("\n"), color: rows.map((r) => r.replace(/.(.)/g, "$1")).join("\n") };
  };
}

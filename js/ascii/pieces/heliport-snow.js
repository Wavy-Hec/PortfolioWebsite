/* heliport-snow: the Shadow Moses heliport (MGS1) at night in falling snow. The H pad in perspective, the hangar behind it, two
 * floodlights with their cones, a searchlight on the roof sweeping the sky slowly, snow drifting down and lighting up in the beams.
 * Monochrome: eight paper tones on sumi.
 * Written for this site in the ascii-magic piece format (ascii-magic.com): export meta + default create() returning (t) => frame,
 * square cells, meant for look="dots" (also reads in look="ascii"). */
import { fbm, noise2, clamp, rng, KEYS } from "../lib/kit.js";

const W = 192, H = 108;
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
  slug: "heliport-snow", name: "Heliport, Snow", category: "landscapes",
  note: "A heliport at night in falling snow: the H pad, two floodlights and their cones, a searchlight sweeping the sky, snow drifting through the beams.",
  tags: ["snow", "night", "heliport", "searchlight", "halftone", "mono"],
  cols: W, rows: H, fps: 15, cell: "square", look: "dots",
  dots: { tone: { lo: 0, hi: 1 } },
  palette: Object.fromEntries(TONES.map((c, i) => [KEYS[i], c])),
};

const PAD = [96, 70], PRX = 60, PRY = 14, GY = 54;   // the scene sits high in the frame: the bottom rows are plain ground for the page's mist to take                  // the pad's centre and radii (an ellipse: the circle seen low), the ground's horizon row
const LAMPS = [[26, 17], [166, 17]];                                 // the floodlights' heads; their poles run to the ground
export default function create() {
  const base = new Float32Array(W * H);
  const put = (x, y, v) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; base[y * W + x] = v; };
  const rect = (x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, v); };
  // the ridge behind, the hangar: a long low block with a lit roof edge, a door, a row of windows
  for (let x = 0; x < W; x++) { const r = 24 - fbm(x / 30, 1, 3, 2) * 14; for (let y = Math.round(r); y < GY; y++) put(x, y, 0.08 + 0.04 * noise2(x / 5, y / 3, 6)); }
  rect(22, 30, 170, GY, 0.14); rect(22, 30, 170, 30, 0.34); rect(22, 31, 170, 31, 0.2);
  for (let i = 0; i < 7; i++) rect(40 + i * 18, 38, 44 + i * 18, 40, 0.5);
  rect(90, 42, 102, GY, 0.1); rect(90, 42, 102, 42, 0.3); rect(96, 42, 96, GY, 0.22);
  rect(130, 24, 134, 30, 0.2); put(132, 23, 0.34);                      // a vent stack
  // the ground: dark, dusted with snow; the pad ring and the H
  for (let y = GY; y < H; y++) for (let x = 0; x < W; x++) { const k = (y - GY) / (H - GY); put(x, y, 0.1 + 0.07 * k + 0.08 * noise2(x / 4, y / 2, 21)); }
  for (let y = GY; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x - PAD[0]) / PRX, v = (y - PAD[1]) / PRY, q = u * u + v * v;
    if (q < 1) put(x, y, 0.16 + 0.05 * noise2(x / 3, y / 2, 22));
    if (q > 0.84 && q < 1.02) put(x, y, 0.62);
    if (q > 0.62 && q < 0.72) put(x, y, 0.3);
  }
  rect(PAD[0] - 16, PAD[1] - 10, PAD[0] - 13, PAD[1] + 10, 0.72); rect(PAD[0] + 13, PAD[1] - 10, PAD[0] + 16, PAD[1] + 10, 0.72); rect(PAD[0] - 13, PAD[1] - 1, PAD[0] + 13, PAD[1] + 1, 0.72);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; put(PAD[0] + Math.cos(a) * PRX * 1.06, PAD[1] + Math.sin(a) * PRY * 1.06, 0.95); }   // the perimeter lights
  // the floodlights: poles, heads
  for (const [lx, ly] of LAMPS) { for (let y = ly + 1; y <= GY + 3; y++) put(lx, y, 0.4 - ((y - ly) / 45) * 0.2); rect(lx - 2, ly - 1, lx + 2, ly, 0.5); rect(lx - 1, ly + 1, lx + 1, ly + 1, 1); }

  const out = new Float32Array(W * H), rows = new Array(H), R = rng(7);
  const flakes = Array.from({ length: 170 }, () => ({ x: R() * W, y: R() * H, s: 3.5 + R() * 5, sw: 1 + R() * 3, ph: R() * 6.3, near: R() }));
  const cone = (x, y, lx, ly) => {                                      // a floodlight's cone: aimed at the pad, half-angle ~15 deg, soft edges, fading with distance
    const dx = x - lx, dy = y - ly, d = Math.hypot(dx, dy); if (dy < 1 || d > 95) return 0;
    const ax = PAD[0] - lx, ay = PAD[1] - ly, al = Math.hypot(ax, ay), cosA = (dx * ax + dy * ay) / (d * al), ang = Math.acos(clamp(cosA, -1, 1));
    const e = clamp(1 - ang / 0.27); return e * e * (1 - d / 95) * 0.42;
  };
  const cones = new Float32Array(W * H);                                 // the floodlights do not move: their cones are painted once
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cones[y * W + x] = cone(x, y, LAMPS[0][0], LAMPS[0][1]) + cone(x, y, LAMPS[1][0], LAMPS[1][1]);
  const HZ = 64, haze = new Float32Array(HZ * HZ);                        // the haze in the light: a periodic noise tile the frames scroll through
  for (let y = 0; y < HZ; y++) for (let x = 0; x < HZ; x++) { const wx = x / HZ, wy = y / HZ; haze[y * HZ + x] = (1 - wx) * (1 - wy) * fbm(x * 0.08, y * 0.08, 2, 3) + wx * (1 - wy) * fbm((x - HZ) * 0.08, y * 0.08, 2, 3) + (1 - wx) * wy * fbm(x * 0.08, (y - HZ) * 0.08, 2, 3) + wx * wy * fbm((x - HZ) * 0.08, (y - HZ) * 0.08, 2, 3); }
  return (t) => {
    out.set(base);
    const th = -Math.PI / 2 + 0.6 * Math.sin(t * 0.21), cs = Math.cos(th), sn = Math.sin(th), SX = 96, SY = 29;   // the searchlight on the roof, sweeping
    const hx = Math.round(t * 4) % HZ, hy = ((Math.round(-t * 6) % HZ) + HZ) % HZ;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let a = cones[i];
      if (y < SY) {                                                       // the beam: distance along and across it
        const dx = x - SX, dy = y - SY, along = dx * cs + dy * sn, across = -dx * sn + dy * cs;
        if (along > 0 && along < 70) { const hw = 1.5 + along * 0.075, e = clamp(1 - Math.abs(across) / hw); a += e * e * (1 - along / 70) * 0.4; }
      }
      if (a > 0) out[i] = Math.min(1, out[i] + a * (0.6 + 0.4 * haze[((y + hy) % HZ) * HZ + ((x + hx) % HZ)]));
    }
    for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) { const d = Math.hypot(dx, dy); if (d < 3) out[(SY + dy) * W + SX + dx] = Math.max(out[(SY + dy) * W + SX + dx], 0.9 * (1 - d / 3.2)); }
    for (const f of flakes) {                                            // snow: drifting down and a little right, swaying, the near flakes brighter and bigger
      const y = (f.y + t * f.s) % (H + 2) - 1, x = (((f.x + t * 1.6 + Math.sin(t * 0.9 + f.ph) * f.sw) % W) + W) % W, xi = Math.round(x), yi = Math.round(y);
      if (yi < 0 || yi >= H) continue;
      const i = yi * W + xi, lit = clamp((out[i] - base[i]) * 2.5), v = 0.35 + 0.35 * f.near + 0.3 * lit;
      out[i] = Math.max(out[i], v); if (f.near > 0.85 && xi + 1 < W) out[i + 1] = Math.max(out[i + 1], v * 0.6);
    }
    for (let y = 0; y < H; y++) { let s = ""; for (let x = 0; x < W; x++) { const v = out[y * W + x]; s += v < 0.012 ? "  " : TAB[Math.min(255, Math.round(v * 255))].join(""); } rows[y] = s; }
    return { text: rows.map((r) => r.replace(/(.)./g, "$1")).join("\n"), color: rows.map((r) => r.replace(/.(.)/g, "$1")).join("\n") };
  };
}

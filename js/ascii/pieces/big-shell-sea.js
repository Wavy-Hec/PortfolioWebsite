/* big-shell-sea: the Big Shell (MGS2) at night, seen low from the water: hex plant modules on a deck, on struts in the sea, a lattice
 * mast with a slow-blinking light; fog through the horizon band, waves as moving crest lines, the light shimmering on the water. Mono:
 * eight paper tones on sumi. In the ascii-magic piece format (ascii-magic.com): meta + create() returning (t) => frame; square cells,
 * for look="dots" (reads in look="ascii" too). */
import { fbm, noise2, clamp, KEYS } from "../lib/kit.js";

const W = 192, H = 108, HOR = 60, MX = 96, MY = 14;
// eight paper tones, their luminance ~linear .12 -> .82 (paper); a cell's brightness = glyph level x tone, so 64 steps
const TONES = ["#1d1d1f", "#353537", "#4e4e50", "#696967", "#838381", "#9d9c99", "#b8b6b1", "#e9e7e2"];
const LUM = TONES.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0));
const LV = "▁▂▃▄▅▆▇█", LVV = [0.135, 0.257, 0.378, 0.51, 0.635, 0.757, 0.878, 1];
const TAB = [];                                            // brightness 0..1 (256 steps) -> [glyph, tone key]
for (let i = 0; i < 256; i++) {
  const B = (i / 255) * LUM[7];
  let k = 0; while (k < 7 && LUM[k] < B) k++;
  const lv = B / LUM[k]; let g = 0, bd = 9; LVV.forEach((v, j) => { const d = Math.abs(v - lv); if (d < bd) { bd = d; g = j; } });
  TAB.push([LV[g], KEYS[k]]);
}
export const meta = {
  slug: "big-shell-sea", name: "Big Shell, Night Sea", category: "landscapes",
  note: "The Big Shell's hexagonal platforms stand on struts in a night sea, seen low from the water: fog in the horizon band, waves rolling in, the mast light blinking slowly.",
  tags: ["sea", "night", "fog", "platform", "halftone", "mono"],
  cols: W, rows: H, fps: 15, cell: "square", look: "dots",
  dots: { tone: { lo: 0, hi: 1 } },
  palette: Object.fromEntries(TONES.map((c, i) => [KEYS[i], c])),
};

export default function create() {
  const base = new Float32Array(W * H), kind = new Uint8Array(W * H);   // kind: 0 sky, 1 structure, 2 sea
  const put = (x, y, v, k) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; base[i] = v; if (k !== undefined) kind[i] = k; };
  const line = (x0, y0, x1, y1, v) => { const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); for (let i = 0; i <= n; i++) put(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, v, 1); };
  const rect = (x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, v, 1); };
  // stars
  for (let i = 0; i < 26; i++) { const x = (i * 37 + 11) % W, y = 2 + ((i * 53) % 34); put(x, y, 0.22 + 0.2 * noise2(i, 3, 9), 0); }
  // a hex module: a flat hexagon seen from low (squashed), a floor line through it, a few lit windows
  const hexes = [[30, 40], [55, 40], [80, 40], [112, 40], [137, 40], [162, 40]];
  for (const [hx, hy] of hexes) {
    const rx = 11, ry = 6.5;
    for (let y = hy - ry; y <= hy + ry; y++) for (let x = hx - rx; x <= hx + rx; x++) {
      const u = Math.abs(x - hx) / rx, w = Math.abs(y - hy) / ry;
      if (u + w * 0.5 <= 1 && w <= 1) put(x, y, 0.14 + 0.08 * noise2(x / 3, y / 2, 4), 1);
    }
    const V = []; for (let a = 0; a < 6; a++) V.push([hx + rx * Math.cos((a * Math.PI) / 3), hy + ry * Math.sin((a * Math.PI) / 3)]);
    for (let a = 0; a < 6; a++) line(V[a][0], V[a][1], V[(a + 1) % 6][0], V[(a + 1) % 6][1], a < 3 ? 0.82 : 0.6);
    line(hx - rx + 1, hy, hx + rx - 1, hy, 0.5);
    for (let i = 0; i < 4; i++) put(hx - 6 + i * 4 + (hx % 3), hy + 3, 0.9, 1);
  }
  // the deck (two slabs and the bridge between them), the struts into the water, the walkway rail
  for (const [x0, x1] of [[17, 93], [99, 175]]) {
    rect(x0, 47, x1, 47, 0.6); rect(x0, 48, x1, 49, 0.36); rect(x0, 50, x1, 50, 0.2);
    for (let x = x0; x <= x1; x += 3) put(x, 46, 0.3, 1);
    for (const sx of [x0 + 8, x0 + 30, x1 - 30, x1 - 8]) for (let y = 51; y < HOR + 1; y++) { const f = 0.42 - ((y - 51) / 10) * 0.2; rect(sx - 1, y, sx + 1, y, f); put(sx - 2, y, f * 0.6, 1); put(sx + 2, y, f * 0.6, 1); }
  }
  rect(93, 48, 99, 48, 0.45); rect(93, 49, 99, 49, 0.25);
  // the mast: a lattice between the clusters, wider at the foot, the light at the top
  for (let y = MY + 1; y <= 47; y++) { const w = y > 38 ? 2 + (y - 38) * 0.3 : 1.2; rect(Math.round(MX - w), y, Math.round(MX + w), y, 0.5); if (y % 4 === 0) { put(MX - w - 1, y, 0.35, 1); put(MX + w + 1, y, 0.35, 1); } if (y % 4 === 2) { put(MX - w, y, 0.72, 1); put(MX + w, y, 0.72, 1); } }
  rect(MX - 4, 26, MX + 4, 27, 0.55); put(MX - 5, 26, 0.3, 1); put(MX + 5, 26, 0.3, 1);                 // the platform under the dish
  for (let a = -3; a <= 3; a++) put(MX + 6 + a, 24 - Math.abs(a) * 0.7, 0.6, 1);                              // the dish
  // the sea: dark, a little texture, the horizon lighter
  for (let y = HOR; y < H; y++) for (let x = 0; x < W; x++) { const k = (y - HOR) / (H - HOR); put(x, y, 0.07 + 0.08 * (1 - k) + 0.05 * noise2(x / 6, y / 2.5, 12), 2); }
  for (let x = 0; x < W; x++) put(x, HOR, 0.26, 2);

  const out = new Float32Array(W * H);
  const waves = Array.from({ length: 9 }, (_, i) => ({ ph: i / 9, s: i * 2.9 }));
  const rows = new Array(H);
  const FW = 512, FY0 = 18, FH = HOR + 10 - FY0, fog = new Float32Array(FW * FH);   // the fog: a periodic noise strip, painted once, that the frames drift through
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const w = x / FW; fog[y * FW + x] = (1 - w) * fbm(x * 0.02, (y + FY0) * 0.05, 3, 5) + w * fbm((x - FW) * 0.02, (y + FY0) * 0.05, 3, 5); }
  return (t) => {
    out.set(base);
    const blink = Math.exp(-Math.pow(((t % 2.6) - 0.5) / 0.22, 2));                         // the mast light: on for a beat every 2.6 s
    // fog: a drifting band through the horizon, a veil over the sky's low rows, the struts' feet lost in it
    const fx = Math.round(t * 3) % FW;
    for (let y = FY0; y < HOR + 10; y++) {
      const band = clamp(1 - Math.abs(y - (HOR - 4)) / 20), row = (y - FY0) * FW;
      for (let x = 0; x < W; x++) {
        const i = y * W + x, F = fog[row + ((x + fx) % FW)], a = band * clamp((F - 0.3) * 1.6);
        out[i] = Math.max(out[i] * (1 - a * 0.75), a * 0.2);
      }
    }
    // the mast light and its halo
    for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.hypot(dx, dy * 1.3), i = (MY + dy) * W + MX + dx; if (d < 0.9) out[i] = 0.4 + 0.6 * blink; else if (d < 4) out[i] = Math.max(out[i], blink * 0.45 * (1 - d / 4)); }
    // waves: crest lines rolling toward the viewer, spreading as they near; the mast light's path shimmering down the water
    for (const wv of waves) {
      const p = (wv.ph + t * 0.035) % 1, yb = HOR + 1 + (H - HOR) * Math.pow(p, 1.7), amp = 0.3 + p * 2, thick = p > 0.6 ? 2 : 1;
      for (let x = 0; x < W; x++) {
        if (noise2(x / (4 + p * 10), wv.s, 7) < 0.34) continue;
        const y = Math.round(yb + Math.sin(x * (0.15 - p * 0.09) + wv.s + t * 0.5) * amp);
        for (let k = 0; k < thick; k++) if (y - k >= HOR && y - k < H) out[(y - k) * W + x] = 0.3 + p * 0.3;
        if (y + 1 < H) out[(y + 1) * W + x] = 0.05;
      }
    }
    for (let y = HOR + 1; y < H; y++) {
      const k = (y - HOR) / (H - HOR), w = 1.5 + k * 9;
      for (let x = MX - 12; x <= MX + 12; x++) {
        const d = (x - MX) / w, s = noise2(x / 2.5, y * 0.8 - t * 2.2, 3) > 0.55 ? 1 : 0.25, i = y * W + x;
        out[i] = Math.max(out[i], (0.25 + 0.45 * blink) * Math.exp(-d * d) * s * (1 - k * 0.5));
      }
    }
    for (let y = 0; y < H; y++) { let s = ""; for (let x = 0; x < W; x++) { const v = out[y * W + x]; s += v < 0.012 ? "  " : TAB[Math.min(255, Math.round(v * 255))].join(""); } rows[y] = s; }
    return { text: rows.map((r) => r.replace(/(.)./g, "$1")).join("\n"), color: rows.map((r) => r.replace(/.(.)/g, "$1")).join("\n") };
  };
}

/* wind-grass-paper: ascii-magic's wind-grass (pieces/wind-grass.js, ascii-magic.com, MIT) redrawn for paper on sumi. The same gusts (fbm
 * rolling left to right) bend the same blades, but the piece is 192 x 72 SQUARE cells and every cell carries a brightness (a level glyph x
 * a paper tone, as this site's other pieces do), so the dots look halftones the blades themselves: a blade is a slanting run of small
 * dots, its tip the brightest, the ground under it a carpet of specks, the sky empty (the low moon is a piece of its own). In look="dots"
 * at one dot per cell (density 100) it matches the hero field's pitch at 1440. Derived work: written for this site in the ascii-magic
 * piece format, the blade and gust model from wind-grass. */
import { fbm, rng, clamp, KEYS } from "../lib/kit.js";

const W = 192, H = 72, FIELD = 30;
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
  slug: "wind-grass-paper", name: "Wind Through Grass, Paper", category: "weather",
  note: "Tall grass bends as gusts roll across it left to right, drawn as paper on sumi: every blade a run of brightness cells, so a halftone draws it as dotted strokes.",
  tags: ["grass", "wind", "field", "night", "halftone", "mono"],
  cols: W, rows: H, fps: 20, cell: "square", look: "dots",
  dots: { tone: { lo: 0, hi: 1 } },
  palette: Object.fromEntries(TONES.map((c, i) => [KEYS[i], c])),
};

export default function create() {
  const out = new Float32Array(W * H), rows = new Array(H), R = rng(31);
  const jit = new Float32Array(W * H); for (let i = 0; i < jit.length; i++) jit[i] = R();
  const gust = (x, y, t) => fbm(x * 0.0175 - t * 0.55, y * 0.027 + t * 0.05, 3, 2);   // wind-grass's gust field at this piece's scale
  const gy = new Float32Array(W + 16);                                                  // the gust along one row, sampled every 4 columns
  const rowGust = (y, t) => { for (let x = 0; x < W + 16; x += 4) gy[x] = gust(x - 8, y, t); for (let x = 0; x < W + 16; x++) if (x & 3) { const a = x & ~3, b = Math.min(W + 12, a + 4), f = (x - a) / 4; gy[x] = gy[a] * (1 - f) + gy[b] * f; } };
  const tuft = new Float32Array(W + 16); for (let x = 0; x < W + 16; x++) tuft[x] = fbm((x - 8) * 0.07, 0.5, 2, 9);   // where the sheaves stand: a slow noise along x, air in its troughs
  return (t) => {
    out.fill(0);
    for (let y = FIELD; y < H; y++) {                                                   // the ground: sparse specks, a little lighter where the gust lays the grass flat
      const d = (y - FIELD) / (H - FIELD); rowGust(y, t);
      for (let x = 0; x < W; x++) { const j = jit[y * W + x]; out[y * W + x] = j > 0.55 ? clamp(0.03 + 0.04 * d + (gy[x + 8] - 0.4) * 0.1 + j * 0.03) : 0; }
    }
    for (let y = FIELD; y < H; y++) {                                                   // the blades: rooted every third row, in sheaves (the tuft noise sets how many stand), taller and brighter as they near
      if (y % 3) continue;
      const d = (y - FIELD) / (H - FIELD), Hh = 4 + d * 16;
      rowGust(y, t);
      for (let x = -8; x < W; x++) {
        const j = jit[((x + 8) % W) + y * W], p = clamp((tuft[x + 8] - 0.3) * 1.4) * (0.3 + 0.4 * d);
        if (j > p) continue;                                                              // air between the sheaves and inside them
        const bx = x + j * 1.4, G = gy[Math.max(0, Math.min(W + 15, Math.round(bx + 8)))];
        const bend = 0.5 + (G - 0.3) * 3.4 + Math.sin(t * 2.3 + x * 0.2 + y) * 0.12, h = Hh * (0.6 + j * 0.8);
        const lum0 = (G - 0.4) * 0.9 + d * 0.3, plume = j < 0.05 && d > 0.5;
        for (let k = 1; k <= h; k++) {
          const u = k / h, off = bend * u * u * h * 0.9;
          const cx = Math.round(bx + off), cy = y - k + 1;
          if (cx < 0 || cx >= W || cy < 0) continue;
          const lum = clamp(u * 0.5 + lum0), v = k >= h - 0.5 ? (plume ? 0.95 : 0.4 + lum * 0.35) : 0.2 + lum * 0.45;
          const i = cy * W + cx; if (v > out[i]) out[i] = v;
        }
      }
    }
    for (let y = 0; y < H; y++) { let s = ""; for (let x = 0; x < W; x++) { const v = out[y * W + x]; s += v < 0.012 ? "  " : TAB[Math.min(255, Math.round(v * 255))].join(""); } rows[y] = s; }
    return { text: rows.map((r) => r.replace(/(.)./g, "$1")).join("\n"), color: rows.map((r) => r.replace(/.(.)/g, "$1")).join("\n") };
  };
}

/* low-moon: a paper moon low in a haze, nothing else (every other cell blank, so it layers over another piece). Breathes very slowly.
 * Written for this site in the ascii-magic piece format (ascii-magic.com): square cells, meant for look="dots". */
import { noise2, clamp, KEYS } from "../lib/kit.js";

const W = 48, H = 36;
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
  slug: "low-moon", name: "Low Moon", category: "sky",
  note: "A paper moon low in a haze, for layering over a field.",
  tags: ["moon", "night", "halftone", "mono"],
  cols: W, rows: H, fps: 4, cell: "square", look: "dots",
  dots: { tone: { lo: 0, hi: 1 } },
  palette: Object.fromEntries(TONES.map((c, i) => [KEYS[i], c])),
};
export default function create() {
  const rows = new Array(H), MX = 24, MY = 17, R = 11;
  return (t) => {
    const br = 0.9 + 0.1 * Math.sin(t * 0.3);
    for (let y = 0; y < H; y++) {
      let s = "";
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - MX, y - MY) / R;
        let v = 0;
        if (d < 1) v = br * (0.78 + 0.22 * clamp(1 - d * d)) * (0.9 + 0.1 * noise2(x / 3, y / 3, 2));
        else if (d < 1.9) v = 0.22 * clamp(1 - (d - 1) / 0.9) * clamp(0.3 + noise2(x / 4 + t * 0.05, y / 4, 4));
        s += v < 0.03 ? "  " : TAB[Math.min(255, Math.round(v * 255))].join("");
      }
      rows[y] = s;
    }
    return { text: rows.map((r) => r.replace(/(.)./g, "$1")).join("\n"), color: rows.map((r) => r.replace(/.(.)/g, "$1")).join("\n") };
  };
}

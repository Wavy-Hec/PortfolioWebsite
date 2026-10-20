"""The ink-wash edge for sumi.html — img/wash-edge.png.

A 1800x220 1-bit tile: sumi (#141416) dissolving upward into nothing, Bayer-4x4 dithered at 2 px cells
(the same matrix and cell as tools/make-grass.py, so the wash and the grass share one grain). The dissolve
edge wanders along x (a sum of sines, not noise, so the tile repeats cleanly at 1800 px) and a few dry-brush
streaks reach higher than the wash. The bottom 24 px are solid so the tile meets a sumi band with no seam.
css/sumi.css paints it on a pseudo-element straddling every paper -> sumi edge (repeat-x), and flipped
(scaleY(-1)) on the sumi -> paper edge under the About band.

  python tools/make-wash.py        -> img/wash-edge.png (palette PNG, index 0 transparent; run oxipng after)
"""
import math, pathlib
from PIL import Image

OUT = pathlib.Path(__file__).resolve().parent.parent / "img" / "wash-edge.png"
W, H = 1800, 220
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
SUMI = (20, 20, 22)
TAU = math.pi * 2


def edge(x):
    """Where the wash is half-covered, in px from the top, and how wide the dissolve is. Periodic in W."""
    u = x / W
    e = 96 + 22 * math.sin(TAU * (3 * u + .13)) + 12 * math.sin(TAU * (7 * u + .61)) + 6 * math.sin(TAU * (17 * u + .27))
    w = 92 + 18 * math.sin(TAU * (5 * u + .42)) + 8 * math.sin(TAU * (11 * u + .9))
    return e, w



def coverage(x, y):
    e, w = edge(x)
    t = (y - (e - w / 2)) / w                            # 0 at the top of the dissolve, 1 at the bottom
    t = 0.0 if t < 0 else 1.0 if t > 1 else t
    c = t * t * (3 - 2 * t)                             # smoothstep: a wash, not a wedge
    # dry hairs above the wash: thin, broken, never solid
    u = x / W
    for f, ph, top, k in ((23, .11, .40, .20), (41, .57, .48, .16), (67, .83, .36, .14), (101, .31, .52, .12)):
        v = math.sin(TAU * (f * u + ph))
        if v > .88:
            hair = (v - .88) / .12
            reach = e - w * top                          # how high this hair climbs above the half line
            if y > reach:
                c = max(c, k * hair * min(1.0, (y - reach) / (w * .8)))
    if y >= H - 24:
        c = 1.0
    return c


def main():
    img = Image.new("P", (W, H), 0)
    img.putpalette([0, 0, 0, *SUMI] + [0] * (256 * 3 - 6))
    px = img.load()
    for y in range(H):
        for x in range(W):
            thr = (BAYER[(y // 2) % 4][(x // 2) % 4] + 0.5) / 16.0
            if coverage(x, y) > thr:
                px[x, y] = 1
    img.save(OUT, optimize=True, transparency=0, bits=1)
    print(OUT, OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    main()

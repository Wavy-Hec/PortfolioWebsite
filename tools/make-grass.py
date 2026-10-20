"""Sumi-e grass field footer plate (copy of the ascii-grass-wind lens grass.py, retuned once for the sumi footer: count 80+200*depth^1.3, a few tufts breaking the horizon; writes into img/).

Original docstring:
, procedural, Python + Pillow only (no numpy).

Draws thousands of tapered brush-stroke blades leaning into one wind, denser
and taller at the bottom (perspective), low horizon, a few seed heads, faint
hill contours, at 2x supersample in grayscale; then downsamples and Bayer-4x4
dithers (2 px cells, same matrix as tools/make-og-card.py) to a 2-tone PNG:
ink (17,17,20,225) on transparent, like img/bigshell-dither.png.

  python grass.py            -> grass-wind.png     (uniform lean)
  python grass.py --sweep    -> grass-sweep.png    (tips bend harder, gust bands)
  python grass.py --tones 4  -> 4-tone variant (ink alpha 225/150/80 + clear)
  python grass.py --seed 3   -> different field
"""
import math, random, sys, pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent.parent / "img"
W, H = 1800, 600
SS = 2                      # supersample
w, h = W * SS, H * SS
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
INK = (17, 17, 20)

args = sys.argv[1:]
SWEEP = "--sweep" in args
TONES = 4 if "--tones" in args and args[args.index("--tones") + 1] == "4" else 2
SEED = int(args[args.index("--seed") + 1]) if "--seed" in args else 7
NOHILLS = "--nohills" in args
OUTNAME = args[args.index("--out") + 1] if "--out" in args else None
random.seed(SEED)

HORIZON = 0.56              # fraction of height where the field starts


def gust(x):
    """Wind strength along x in [0.55, 1.45]: slow waves so bands of grass lay flatter."""
    u = x / w
    g = 0.5 + 0.28 * math.sin(u * 6.3 + 0.8) + 0.16 * math.sin(u * 15.1 + 2.1) + 0.06 * math.sin(u * 41 + 1)
    return 0.55 + 0.9 * max(0.0, min(1.0, g))


def clump(x, y):
    """Density modulation 0..1: clumps of grass with paper showing between them."""
    u, v = x / w, y / h
    c = 0.5 + 0.3 * math.sin(u * 23 + v * 9 + 1.3) + 0.2 * math.sin(u * 57 - v * 17 + 0.4) + 0.12 * math.sin(u * 131 + 2.2)
    return max(0.0, min(1.0, c))


def blade(d, x0, y0, length, width, bend, ink, curl=1.0, root=0.12):
    """One tapered stroke: base (x0,y0), grows up and leans `bend` px to the right at the tip.
    curl > 1 concentrates the bend near the tip (the 'sweep' look). root = lean already at the root."""
    n = 7
    pts = []
    for i in range(n + 1):
        t = i / n
        tt = t ** curl
        x = x0 + bend * tt * tt + bend * root * t
        y = y0 - length * t * (1 - 0.18 * tt * tt)
        pts.append((x, y))
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        t = i / n
        hw = width * (1 - t) ** 0.7 * 0.5
        if i < n:
            dx, dy = pts[i + 1][0] - x, pts[i + 1][1] - y
        else:
            dx, dy = x - pts[i - 1][0], y - pts[i - 1][1]
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln, dx / ln
        left.append((x + nx * hw, y + ny * hw))
        right.append((x - nx * hw, y - ny * hw))
    d.polygon(left + right[::-1], fill=ink)
    return pts[-1]


def seed_head(d, tip, bend, ink, scale=1.0):
    """Three short drooping strokes continuing the blade's tip (a susuki plume), attached, not a fan."""
    x, y = tip
    sgn = 1 if bend >= 0 else -1
    for k in range(3):
        a = (-0.55 + k * 0.28) * sgn            # mostly along the wind, drooping
        ln = (9 + random.random() * 7) * SS * scale
        d.line([(x, y), (x + math.cos(a) * ln * sgn, y + math.sin(a) * ln * 0.5 + 3 * SS)], fill=ink, width=max(1, int(1.6 * SS * scale)))


def render():
    im = Image.new("L", (w, h), 255)
    d = ImageDraw.Draw(im)
    hy = int(h * HORIZON)

    # faint hill contours behind the horizon: a thin brush line, not a filled blob
    if not NOHILLS:
        for ridge, (base, amp, x0, x1) in enumerate([(hy - 44 * SS, 58 * SS, 0.0, 0.62), (hy - 16 * SS, 30 * SS, 0.42, 0.98)]):
            pts = []
            for x in range(int(w * x0), int(w * x1) + 1, 6 * SS):
                u = x / w
                yy = base - amp * (0.6 * math.sin(u * 5.1 + ridge) + 0.3 * math.sin(u * 11.7 + 2 * ridge) + 0.1 * math.sin(u * 29 + ridge))
                pts.append((x, yy))
            # the line fades out at both ends (tone -> paper), like a dry-brush stroke
            n = len(pts)
            for i in range(n - 1):
                t = i / (n - 1)
                fade = min(1.0, t / 0.18, (1 - t) / 0.18)
                tone = int(255 - 95 * fade)
                d.line([pts[i], pts[i + 1]], fill=tone, width=int(1.6 * SS))

    # the field: far rows first (lighter, shorter) so near blades overlap them
    rows = 22
    total = 0
    for r in range(rows):
        depth = r / (rows - 1)                       # 0 = horizon, 1 = bottom edge
        y_band = hy + (h - hy) * (depth ** 1.3)      # bands crowd toward the horizon
        band_h = (h - hy) / rows * 1.3
        count = int(80 + 200 * depth ** 1.3)
        length = (6 + 175 * depth ** 1.5) * SS
        width = (0.9 + 2.1 * depth) * SS
        ink = max(0, int(175 - 160 * depth ** 0.7))  # far = light gray ticks, near = near-black
        lean = (6 + 80 * depth) * SS
        for _ in range(count):
            x = random.uniform(-40 * SS, w + 40 * SS)
            y = y_band + random.uniform(-band_h, band_h * 0.6)
            # clumps: skip blades where the clump field is low (more so near the camera)
            if random.random() > 0.35 + 0.65 * clump(x, y) ** (0.6 + depth):
                continue
            g = gust(x) if SWEEP else 1.0
            b = lean * random.uniform(0.6, 1.4) * g
            L = length * random.uniform(0.6, 1.35)
            curl = 1.55 if SWEEP else 1.0
            if SWEEP:
                b *= 1.35
            tip = blade(d, x, y, L, width * random.uniform(0.7, 1.3), b, ink + random.randint(-12, 12), curl, root=0.25)
            total += 1
            if depth > 0.72 and random.random() < 0.02:
                seed_head(d, tip, b, ink, 0.8)
    print("blades:", total)

    # 3-4 clumps of tall susuki breaking the horizon line (silhouettes against the sky)
    for cx in [w * u for u in sorted(random.uniform(0.08, 0.92) for _ in range(random.randint(3, 4)))]:
        for _ in range(random.randint(9, 16)):
            x = cx + random.gauss(0, 14 * SS)
            y = hy + random.uniform(2, 14) * SS
            g = gust(x) if SWEEP else 1.0
            b = random.uniform(22, 48) * SS * g
            L = random.uniform(48, 92) * SS
            tip = blade(d, x, y, L, random.uniform(1.2, 2.0) * SS, b, random.randint(20, 60), 1.5 if SWEEP else 1.1, root=0.25)
            if random.random() < 0.5:
                seed_head(d, tip, b, 40, 0.7)

    # a few tall near strokes in the foreground, fully black: the sumi-e accent
    for _ in range(22):
        x = random.uniform(0, w)
        y = random.uniform(h - 10 * SS, h + 40 * SS)
        g = gust(x) if SWEEP else 1.0
        b = random.uniform(100, 190) * SS * g
        L = random.uniform(200, 320) * SS
        tip = blade(d, x, y, L, random.uniform(3.0, 5.5) * SS, b, 0, 1.5 if SWEEP else 1.1, root=0.3)
        if random.random() < 0.45:
            seed_head(d, tip, b, 0, 1.2)

    return im.resize((W, H), Image.LANCZOS)


def dither(gray, tones):
    """Bayer 4x4 at 2px cells -> RGBA: ink at alpha levels, else transparent."""
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    src = gray.load()
    dst = out.load()
    alphas = [80, 150, 225]
    for y in range(H):
        for x in range(W):
            cover = (255 - src[x, y]) / 255.0          # ink coverage 0..1
            thr = (BAYER[(y // 2) % 4][(x // 2) % 4] + 0.5) / 16.0
            if tones == 2:
                if cover > thr:
                    dst[x, y] = (*INK, 225)
            else:
                lvl = cover * 3.0
                base = int(lvl)
                q = base + (1 if lvl - base > thr else 0)
                if q >= 1:
                    dst[x, y] = (*INK, alphas[min(q, 3) - 1])
    return out


def save_small(rgba, path):
    """Palette PNG (ink alpha levels + transparent) is much smaller than RGBA."""
    a = rgba.getchannel("A")
    data = list(a.get_flattened_data()) if hasattr(a, "get_flattened_data") else list(a.getdata())
    levels = sorted(set(data))
    lut = {v: i for i, v in enumerate(levels)}
    p = Image.new("P", rgba.size)
    p.putdata([lut[v] for v in data])
    p.putpalette(list(INK) * len(levels) + [0, 0, 0] * (256 - len(levels)))
    p.save(path, optimize=True, transparency=bytes(levels), bits=1 if len(levels) <= 2 else 2)
    return path.stat().st_size


if __name__ == "__main__":
    gray = render()
    name = "grass-sweep" if SWEEP else "grass-wind"
    if TONES == 4:
        name += "-4tone"
    if SEED != 7:
        name += f"-s{SEED}"
    rgba = dither(gray, TONES)
    name = OUTNAME or name
    size = save_small(rgba, OUT / f"{name}.png")
    print(f"{name}.png  {W}x{H}  {size // 1024} KB")

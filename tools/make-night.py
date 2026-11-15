"""The hidden game's codec portrait, img/raiden-night.png: Yoji Shinkawa's Raiden cut out of
his paper as a two-colour plate, paper #e9e7e2 on transparent. Python and Pillow.

    git show 1d2e5eb:img/ink-raiden.png > img/ink-raiden.png
    python3 tools/make-night.py && oxipng -o4 --strip safe img/raiden-night.png

The source, the portrait as he drew it, is kept in the history, not in the tree.
"""
import pathlib
import random
from PIL import Image, ImageDraw, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
IMG = HERE.parent / "img"
PAPER = (233, 231, 226)
# stray specks of the painting's dither that the other clean-ups leave
SPECKS = [(130, 248), (145, 252), (146, 252), (357, 273)]


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def save(img, name):
    p = IMG / name
    img.save(p, optimize=True, transparency=0)
    print(name, p.stat().st_size, "bytes", img.size)


def _noise(w, h, seed, sigma, sx, sy):
    rnd = random.Random(seed)
    nw, nh = w // sx + 2, h // sy + 2
    data = bytes(min(255, max(0, int(128 + rnd.gauss(0, sigma)))) for _ in range(nw * nh))
    grain = Image.frombytes("L", (nw, nh), data)
    return grain.resize((nw * sx, nh * sy), Image.BILINEAR).crop((0, 0, w, h))


def raiden():
    src = Image.open(IMG / "ink-raiden.png").convert("RGBA")
    w, h = src.size
    p = src.load()
    # the source's paper runs to its edges: close the ink into a wall, flood the outside from the
    # corners, and erode back, which keeps his own paper inside the silhouette
    ink = Image.new("L", (w, h), 0)
    inkp = ink.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = p[x, y]
            if a > 8 and (r < 60 or (r > 150 and g < 90)):  # the red petals count as ink
                inkp[x, y] = 255
    despeckled = ink.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    closed = despeckled.filter(ImageFilter.MaxFilter(23))
    # his head opens to the sky between the strands of hair: it is inside
    ImageDraw.Draw(closed).ellipse([200, 150, 430, 380], fill=255)
    region = closed.copy()
    corners = ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))
    middles = ((w // 2, 0), (0, h // 2), (w // 2, h - 1), (w - 1, h // 2))
    for seed in corners + middles:
        if region.getpixel(seed) == 0:
            ImageDraw.floodfill(region, seed, 128)
    inside = region.point(lambda v: 0 if v == 128 else 255)
    inside = inside.filter(ImageFilter.MinFilter(23)).filter(ImageFilter.GaussianBlur(7))
    insp = inside.load()
    # on sumi the ink is the ground, so only his paper is printed, where it is dense enough not to
    # fray into a dotted rim
    paper = Image.new("L", (w, h), 0)
    pp = paper.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = p[x, y]
            if a >= 8 and r >= 60 and not (r > 150 and g < 90):
                pp[x, y] = 255
    dens = paper.filter(ImageFilter.BoxBlur(12)).load()
    asis = Image.new("P", (w, h), 0)
    asis.putpalette([0, 0, 0, *PAPER] + [0] * (768 - 6))
    s_ = asis.load()
    # below 60 % of the height his paper drops out in ragged patches, gone by 72 %
    D0, D1 = 0.60, 0.72
    blot = _noise(w, h, 31, 64, 9, 9).filter(ImageFilter.GaussianBlur(3)).load()
    for y in range(h):
        v = y / h
        t = 0.0 if v <= D0 else min(1.0, (v - D0) / (D1 - D0))
        keep = 1.0 - smooth(t)
        for x in range(w):
            r, g, b, a = p[x, y]
            if a < 8 or not (pp[x, y] and dens[x, y] >= 77 and insp[x, y] >= 128):
                continue
            if keep >= 1.0 or (keep > 0.0 and blot[x, y] / 255 < keep):
                s_[x, y] = 1
    y_lo = int(D0 * h) - 4
    seen = set()
    for y0 in range(y_lo, h):
        for x0 in range(w):
            if s_[x0, y0] != 1 or (x0, y0) in seen:
                continue
            comp, stack = [], [(x0, y0)]
            seen.add((x0, y0))
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and y_lo <= ny < h and s_[nx, ny] == 1 and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            if len(comp) < 14:
                for x, y in comp:
                    s_[x, y] = 0
    # specks of the painting's dither above his hair and beside the sword
    for y in range(66):
        for x in range(w):
            if s_[x, y] and (y <= 30 or x <= 46 or x >= 578):
                s_[x, y] = 0
    # the flecks of the ink block right of his hair, and one wash beside his brow
    for y in range(560):
        for x in range(w):
            flecks = (y < 380 and x >= 505) or (150 <= y < 380 and x >= 468) or x >= 548
            wash = 406 <= x < 436 and 186 <= y < 234
            if s_[x, y] and (flecks or wash):
                s_[x, y] = 0
    # stray hairs off the right of his head
    blob = asis.point(lambda v: 255 if v == 1 else 0, "L").filter(ImageFilter.MaxFilter(5)).load()
    seen = set()
    for y0 in range(40, 340):
        for x0 in range(400, 548):
            if not blob[x0, y0] or (x0, y0) in seen:
                continue
            comp, stack = [], [(x0, y0)]
            seen.add((x0, y0))
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and blob[nx, ny] and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            if len(comp) < 450:
                for x, y in comp:
                    s_[x, y] = 0
    # the painting's ink box left of his raised hand, cut along a ragged line so the sleeve does not
    # end on a ruled edge
    jr = random.Random(72)
    jag = {}
    j = 0.0
    for y in range(520, 643):
        j = max(-6.0, min(12.0, j * .82 + jr.gauss(0, 3.2)))
        jag[y] = 72 + int(round(j))
    for y in range(520, 643):
        for x in range(106):
            if s_[x, y] and (x < jag[y] or y >= 626):
                s_[x, y] = 0
    # a fine wisp of hair down his left
    wisp = Image.new("L", (w, h), 0)
    outline = [(0, 129), (97, 129), (104, 140), (128, 236), (128, 253), (0, 253)]
    ImageDraw.Draw(wisp).polygon(outline, fill=255)
    wp = wisp.load()
    for y in range(120, 260):
        for x in range(140):
            if wp[x, y]:
                s_[x, y] = 0
    for x, y in SPECKS:
        s_[x, y] = 0
    save(asis, "raiden-night.png")


if __name__ == "__main__":
    raiden()

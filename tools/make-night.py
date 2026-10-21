"""The hero figure — img/raiden-night.png: Yoji Shinkawa's Raiden cut out of his paper as a 2-colour plate (paper #e9e7e2 on transparent) for
the fold of index.html (css .hero .figure) and the link-preview card (tools/og-card.html). Python + Pillow, no numpy.

  python tools/make-night.py          -> img/raiden-night.png + img/raiden-shade.png (v8: his hard-edged shadow, under the plate, so the
                                         moon behind him does not show through his ink); run oxipng -o4 --strip safe on both after

The source, img/ink-raiden.png (the portrait as he drew it, ink on paper), left the shipped tree with the old site: read it from history first,
  git show 1d2e5eb:img/ink-raiden.png > img/ink-raiden.png
The red petals in the painting are dropped (the page is monochrome); the ink is the sumi ground itself, so only his paper is kept: face, hand,
hair, the washes. The feet dissolve into the fog from 74 % down through a Bayer 4x4 at 2 px cells.
"""
import pathlib
from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
IMG = HERE.parent / "img"
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
PAPER = (233, 231, 226)
SUMI_L = 20                                                                  # the shadow is grey 20 (#141414): within 2 of sumi #141416


def thr(x, y, cell=2):
    return (BAYER[(y // cell) % 4][(x // cell) % 4] + 0.5) / 16.0


def smooth(t):
    t = 0.0 if t < 0 else 1.0 if t > 1 else t
    return t * t * (3 - 2 * t)


def save(img, name):
    p = IMG / name
    img.save(p, optimize=True, transparency=0)
    print(name, p.stat().st_size, "bytes", img.size)


def raiden():
    src = Image.open(IMG / "ink-raiden.png").convert("RGBA")
    w, h = src.size
    p = src.load()
    # the cutout: the source's paper runs to the image edge, so the figure is cut out of it. The ink is closed (dilated 9 px) into a wall,
    # the exterior paper is flood-filled from the corners, and the interior is eroded back by the same 9 px: a tight silhouette with the
    # figure's own paper kept inside it (face, hand, the highlights) and the ink block behind him kept too (it melts into the night).
    ink = Image.new("L", (w, h), 0)                                        # the plate is opaque paper + ink: the ink is the dark colour, not the alpha
    inkp = ink.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = p[x, y]
            if a > 8 and (r < 60 or (r > 150 and g < 90)):                   # ink, and the red petals count as ink too
                inkp[x, y] = 255
    despeckled = ink.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))   # the dither speckle in the paper is not a wall
    closed = despeckled.filter(ImageFilter.MaxFilter(23))
    ImageDraw.Draw(closed).ellipse([200, 150, 430, 380], fill=255)         # the head: its paper opens to the sky between the hair strands; it is inside
    region = closed.copy()
    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (0, h // 2), (w // 2, h - 1), (w - 1, h // 2)):
        if region.getpixel(seed) == 0:
            ImageDraw.floodfill(region, seed, 128)
    inside = region.point(lambda v: 0 if v == 128 else 255).filter(ImageFilter.MinFilter(23)).filter(ImageFilter.GaussianBlur(7))   # a soft edge, dithered below: no box-steps from the square kernels
    insp = inside.load()
    # (i) the night cutout: on sumi the ink IS the ground, so every ink pixel is transparent and the figure reads from its paper alone
    # (face, hand, hair, the washes); the ink block behind him vanishes with the rest. Against the "peeled sticker": the paper's local
    # density (a 25 px box) must be >= 0.3, which drops the dither fringe along the block's rim but keeps the masses; the silhouette's
    # mid-cut stays hard (a 24 px dithered feather was tried and read as a dotted halo round the whole figure); the feet dissolve.
    paper = Image.new("L", (w, h), 0)
    pp = paper.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = p[x, y]
            if a >= 8 and r >= 60 and not (r > 150 and g < 90):
                pp[x, y] = 255
    dens = paper.filter(ImageFilter.BoxBlur(12)).load()
    asis = Image.new("P", (w, h), 0)                                       # two colours: 0 clear, 1 paper (the petals are not drawn: no red on the page)
    asis.putpalette([0, 0, 0, *PAPER] + [0] * (768 - 6))
    s_ = asis.load()
    for y in range(h):
        v = y / h
        keep = 1.0 - smooth((v - 0.74) / 0.24)                              # the feet dissolve into the grass from 74 % down
        for x in range(w):
            r, g, b, a = p[x, y]
            if a < 8:
                continue
            t = thr(x, y)
            if keep <= t:
                continue
            if pp[x, y] and dens[x, y] >= 77 and insp[x, y] >= 128:
                s_[x, y] = 1
    # the cutout leaves specks of the painting's dither above the hair and beside the sword: clear the top 30 rows and the margins above row 66
    for y in range(66):
        for x in range(w):
            if s_[x, y] and (y <= 30 or x <= 46 or x >= 578):
                s_[x, y] = 0
    # v8: the moon rises behind him, upper right, in the painted ink block beside his head. The block's own flecks (the dry brush down its
    # right edge, the paper round the dropped petals) would float on the moon as specks, so they go: right of his hair above the shoulder,
    # and the edge strip down to the block's foot, and one wash beside his brow (406-436, 186-234). His hair ends at x 504.
    for y in range(560):
        for x in range(w):
            if s_[x, y] and ((y < 380 and x >= 505) or (150 <= y < 380 and x >= 468) or x >= 548 or (406 <= x < 436 and 186 <= y < 234)):
                s_[x, y] = 0
    # and the stray specks of hair off his head's right side (a blob under 450 px once the dither is closed by 5 px) would hang on the moon too
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
    # the painting's ink box left of his raised hand (its dither rim read as a dotted rectangle in the dark): cleared, the sleeve kept
    for y in range(520, 643):
        for x in range(106):
            if s_[x, y] and (x < 72 or y >= 626):
                s_[x, y] = 0
    save(asis, "raiden-night.png")
    shade(asis)


# the shadow under the plate (img/raiden-shade.png, v8): the plate is paper on transparent (the ink is the ground), so the moon rising behind
# him would show through his ink. This is his dark mass as a hard silhouette at the plate's full size (no blur, no feather: a soft one read as
# an outer glow round the ink, and a blurred shoulder as an airbrushed blob): (a) the plate's paper closed by a round 9 px (dilated, then
# eroded by the same disc), so the ink between the strokes of his face and hair fills and nothing grows past his outermost stroke; (b) his
# fist, neck, shoulder, back and body, the painting's own ink inside BODY. The painting draws his back in the same ink as the block behind
# him, so BODY's top is a hand-set contour (his neck to his shoulder point); every other edge of the mass is where Shinkawa's ink stops
# (the block's dry-brush right edge, the paper between his fist and his ribs). Sumi, alpha 0 or 255 only; css fades it with his legs.
BODY_TOP = [(56, 318), (100, 308), (150, 302), (200, 300), (250, 297), (300, 297), (330, 300), (352, 307), (376, 318), (404, 334), (436, 353),
            (470, 369), (508, 377), (544, 390), (572, 410), (614, 432)]
BODY = BODY_TOP + [(614, 880), (72, 880), (72, 520), (56, 520)]


def chamfer(mask, w, h):
    """distance (3-4 chamfer, in px x 3) from every pixel to the nearest set pixel of mask (a flat list of 0/1)"""
    INF = 1 << 28
    d = [0 if v else INF for v in mask]
    for y in range(h):
        row = y * w
        for x in range(w):
            i = row + x
            v = d[i]
            if v == 0:
                continue
            if x > 0 and d[i - 1] + 3 < v: v = d[i - 1] + 3
            if y > 0:
                j = i - w
                if d[j] + 3 < v: v = d[j] + 3
                if x > 0 and d[j - 1] + 4 < v: v = d[j - 1] + 4
                if x < w - 1 and d[j + 1] + 4 < v: v = d[j + 1] + 4
            d[i] = v
    for y in range(h - 1, -1, -1):
        row = y * w
        for x in range(w - 1, -1, -1):
            i = row + x
            v = d[i]
            if v == 0:
                continue
            if x < w - 1 and d[i + 1] + 3 < v: v = d[i + 1] + 3
            if y < h - 1:
                j = i + w
                if d[j] + 3 < v: v = d[j] + 3
                if x < w - 1 and d[j + 1] + 4 < v: v = d[j + 1] + 4
                if x > 0 and d[j - 1] + 4 < v: v = d[j - 1] + 4
            d[i] = v
    return d


def fill_holes(m, w, h, most):
    """set every enclosed clear pocket of the flat 0/1 mask m smaller than most px (a pocket touching the border is open sky)"""
    seen = bytearray(w * h)
    for s0 in range(w * h):
        if m[s0] or seen[s0]:
            continue
        comp, stack, edge = [], [s0], False
        seen[s0] = 1
        while stack:
            i = stack.pop()
            comp.append(i)
            x, y = i % w, i // w
            if x == 0 or y == 0 or x == w - 1 or y == h - 1:
                edge = True
            for j in ((i - 1) if x else -1, (i + 1) if x < w - 1 else -1, i - w, i + w):
                if 0 <= j < w * h and not m[j] and not seen[j]:
                    seen[j] = 1
                    stack.append(j)
        if not edge and len(comp) < most:
            for i in comp:
                m[i] = 1


def shade(plate):
    w, h = plate.size
    pl = plate.load()
    paper = [1 if pl[x, y] else 0 for y in range(h) for x in range(w)]
    R = 9 * 3
    d1 = chamfer(paper, w, h)
    dil = [1 if v <= R else 0 for v in d1]
    d2 = chamfer([1 - v for v in dil], w, h)
    hull = [1 if v > R else 0 for v in d2]                                  # the round closing
    fill_holes(hull, w, h, 1600)                                            # the small sky pockets it leaves in his hair (round: punched by the disc)
    src = Image.open(IMG / "ink-raiden.png").convert("RGBA")
    sp = src.load()
    ink = Image.new("L", (w, h), 0)
    ip = ink.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = sp[x, y]
            if a > 8 and (r < 60 or (r > 150 and g < 90)):
                ip[x, y] = 255
    ink = ink.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))           # open: the painting's dither (its grey paper) is not his ink
    ink = ink.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))           # close: the hairline cracks fill; the brush edge stays
    region = Image.new("L", (w * 4, h * 4), 0)
    ImageDraw.Draw(region).polygon([(x * 4, y * 4) for x, y in BODY], fill=255)
    region = region.resize((w, h), Image.BOX).point(lambda v: 255 if v >= 128 else 0)
    body = ImageChops.multiply(region, ink).load()
    cut = int(h * 0.90)                                                     # below the css mask's foot: nothing
    m = [1 if y < cut and (hull[y * w + x] or body[x, y]) else 0 for y in range(h) for x in range(w)]
    fill_holes(m, w, h, 900)                                                # the painting's small paper flecks the plate dropped: ink, not moon
    a = Image.new("L", (w, h), 0)
    a.putdata([v * 255 for v in m])
    out = Image.new("LA", (w, h), SUMI_L)
    out.putalpha(a)
    p = IMG / "raiden-shade.png"
    out.save(p, optimize=True)
    print("raiden-shade.png", p.stat().st_size, "bytes", out.size)


if __name__ == "__main__":
    raiden()

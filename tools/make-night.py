"""Raiden in the fold, from Yoji Shinkawa's portrait: img/raiden-night.png, his paper cut out as a
two-colour plate (paper #e9e7e2 on transparent; also the hidden game's codec portrait), and
img/raiden-shade.png, his ink as a hard sumi silhouette laid under it. Python and Pillow.

    git show 1d2e5eb:img/ink-raiden.png > img/ink-raiden.png
    python3 tools/make-night.py
    oxipng -o4 --strip safe img/raiden-night.png img/raiden-shade.png

The source, the portrait as he drew it, is kept in the history, not in the tree.
"""
import pathlib
import random
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

HERE = pathlib.Path(__file__).resolve().parent
IMG = HERE.parent / "img"
PAPER = (233, 231, 226)
# grey 20, within 2 of the page's sumi (#141416)
SUMI = (20, 20, 20)
# the moon in css/sumi.css (--mx, --my, --md) as fractions of the plate: his shade keeps off it
MOON_X, MOON_Y, MOON_D = 0.345, 0.19, 0.315
# the painting draws his back in the ink of the block behind him: the top is set by hand
BODY_TOP = [(56, 318), (100, 308), (150, 302), (200, 300), (250, 297), (300, 297), (330, 300),
            (352, 307), (376, 318), (404, 334), (436, 353), (470, 369), (508, 377), (544, 390),
            (572, 410), (614, 432)]
BODY = BODY_TOP + [(614, 880), (72, 880), (72, 520), (56, 520)]
# the slot between his sleeve and his ribs, where the fog would show through him
NOTCH = [(118, 520), (205, 520), (205, 648), (194, 652), (183, 661), (170, 668), (157, 664),
         (143, 670), (131, 663), (122, 640)]
# how far the edges of the block behind his back run dry, in plate pixels
TEAR = 80


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def two_colour(colour, w, h):
    img = Image.new("P", (w, h), 0)
    img.putpalette([0, 0, 0, *colour] + [0] * (768 - 6))
    return img


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


def outline_mask(outline, w, h):
    """a polygon in plate pixels, drawn at 4x and brought down, so its edge is not stepped"""
    big = Image.new("L", (w * 4, h * 4), 0)
    ImageDraw.Draw(big).polygon([(x * 4, y * 4) for x, y in outline], fill=255)
    return big.resize((w, h), Image.BOX).point(lambda v: 255 if v >= 128 else 0)


def ink_of(src):
    w, h = src.size
    p = src.load()
    ink = Image.new("L", (w, h), 0)
    inkp = ink.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = p[x, y]
            if a > 8 and (r < 60 or (r > 150 and g < 90)):  # the red petals count as ink
                inkp[x, y] = 255
    # opened, so the dither in his paper is not ink
    return ink.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))


def raiden(src):
    w, h = src.size
    p = src.load()
    # the source's paper runs to its edges: close the ink into a wall, flood the outside from the
    # corners, and erode back, which keeps his own paper inside the silhouette
    closed = ink_of(src).filter(ImageFilter.MaxFilter(23))
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
    asis = two_colour(PAPER, w, h)
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
    return asis


def neighbours4(i, w, h):
    x = i % w
    if x > 0:
        yield i - 1
    if x < w - 1:
        yield i + 1
    if i >= w:
        yield i - w
    if i < w * (h - 1):
        yield i + w


def neighbours8(i, w, h):
    x = i % w
    y = i // w
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if (dx or dy) and 0 <= x + dx < w and 0 <= y + dy < h:
                yield i + dy * w + dx


def chamfer(mask, w, h):
    """3-4 chamfer distance (pixels x 3) from each pixel to the nearest set one of a 0/1 list"""
    d = [0 if v else 1 << 28 for v in mask]
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if d[i] == 0:
                continue
            v = d[i]
            if x > 0:
                v = min(v, d[i - 1] + 3)
            if y > 0:
                v = min(v, d[i - w] + 3)
                if x > 0:
                    v = min(v, d[i - w - 1] + 4)
                if x < w - 1:
                    v = min(v, d[i - w + 1] + 4)
            d[i] = v
    for y in range(h - 1, -1, -1):
        for x in range(w - 1, -1, -1):
            i = y * w + x
            if d[i] == 0:
                continue
            v = d[i]
            if x < w - 1:
                v = min(v, d[i + 1] + 3)
            if y < h - 1:
                v = min(v, d[i + w] + 3)
                if x < w - 1:
                    v = min(v, d[i + w + 1] + 4)
                if x > 0:
                    v = min(v, d[i + w - 1] + 4)
            d[i] = v
    return d


def fill_holes(m, w, h, most):
    """set every pocket of clear pixels in the 0/1 list m smaller than most px; one that reaches
    the border is open sky"""
    seen = bytearray(w * h)
    for s0 in range(w * h):
        if m[s0] or seen[s0]:
            continue
        comp = []
        stack = [s0]
        seen[s0] = 1
        edge = False
        while stack:
            i = stack.pop()
            comp.append(i)
            x = i % w
            y = i // w
            if x == 0 or y == 0 or x == w - 1 or y == h - 1:
                edge = True
            for j in neighbours4(i, w, h):
                if not m[j] and not seen[j]:
                    seen[j] = 1
                    stack.append(j)
        if not edge and len(comp) < most:
            for i in comp:
                m[i] = 1


def shade(plate, src):
    """his dark mass under the plate, so the moon behind him never shows through his ink"""
    w, h = plate.size
    pl = plate.load()
    # his paper closed by a round 9 px: the ink between the strokes of his face and hair fills
    paper = [1 if pl[x, y] else 0 for y in range(h) for x in range(w)]
    R = 9 * 3
    grown = [1 if v <= R else 0 for v in chamfer(paper, w, h)]
    hull = [1 if v > R else 0 for v in chamfer([1 - v for v in grown], w, h)]
    fill_holes(hull, w, h, 1600)
    # and his fist, neck, back and body: the painting's own ink, closed so hairline cracks fill
    ink = ink_of(src).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    body = ImageChops.multiply(outline_mask(BODY, w, h), ink).load()
    # below 90 % the stylesheet's mask has faded it out
    cut = int(h * 0.90)
    m = [0] * (w * h)
    for y in range(cut):
        for x in range(w):
            if hull[y * w + x] or body[x, y]:
                m[y * w + x] = 1
    fill_holes(m, w, h, 900)
    m = tear(m, plate, w, h)
    m = close_notch(m, plate, w, h)
    m = off_moon(m, plate, w, h)
    out = two_colour(SUMI, w, h)
    out.putdata(m)
    return out


def tear(m, plate, w, h):
    """the edges of the block right of his neck and below his hair break into dry-brush strokes,
    combed down and to the right with the wind"""
    din = chamfer([1 - v for v in m], w, h)
    coarse = _noise(w, h, 21, 70, 26, 2)
    fine = _noise(w, h, 22, 30, 5, 1)
    fib = ImageOps.autocontrast(ImageChops.add(coarse, fine, scale=2.0, offset=-64), cutoff=1)
    D = int((w * w + h * h) ** 0.5) + 8
    big = Image.new("L", (D, D))
    for oy in range(0, D, h):
        for ox in range(0, D, w):
            big.paste(fib, (ox, oy))
    left = (D - w) // 2
    top = (D - h) // 2
    fib = big.rotate(-14, resample=Image.BILINEAR).crop((left, top, left + w, top + h))
    low = _noise(w, h, 15, 60, 40, 40).filter(ImageFilter.GaussianBlur(9))
    low = ImageOps.autocontrast(low, cutoff=1)
    paper = plate.point(lambda v: 255 if v else 0, "L")
    paper = paper.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(10))
    fp = fib.load()
    lp = low.load()
    dp = paper.load()
    out = list(m)
    for y in range(270, h):
        for x in range(w):
            i = y * w + x
            if not m[i] or din[i] > TEAR * 4.5:
                continue
            # his back, and narrower, the cut edge of the sleeve; thinner beside his own strokes
            k = smooth((x - 300) / 170.0)
            if 500 <= y < 700:
                k = max(k, 0.4 * smooth((110 - x) / 36.0))
            k *= 1.0 - 0.75 * smooth(dp[x, y] / 255.0 / .35)
            band = TEAR * k * (0.5 + lp[x, y] / 255.0)
            if band >= 1.5 and din[i] / 3.0 <= band * (0.12 + 0.88 * fp[x, y] / 255.0):
                out[i] = 0
    return out


def close_notch(m, plate, w, h):
    notch = outline_mask(NOTCH, w, h).load()
    pl = plate.load()
    out = list(m)
    for y in range(500, 700):
        for x in range(100, 220):
            i = y * w + x
            if notch[x, y] and not out[i] and not pl[x, y]:
                out[i] = 1
    return out


def off_moon(m, plate, w, h):
    """over the moon only his drawing: the block behind his back stops 3 px short of the disc, and
    any piece of either plate floating within 24 px of it goes from both"""
    cx = MOON_X * w
    cy = MOON_Y * h
    R = MOON_D * h / 2

    def near(x, y, pad):
        return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= (R + pad) ** 2

    body = outline_mask(BODY, w, h).load()
    x0 = max(0, int(cx - R - 30))
    x1 = min(w, int(cx + R + 30))
    y0 = max(0, int(cy - R - 30))
    y1 = min(h, int(cy + R + 30))
    out = list(m)
    for y in range(y0, y1):
        for x in range(x0, x1):
            if out[y * w + x] and x >= 330 and body[x, y] and near(x, y, 3):
                out[y * w + x] = 0
    pl = plate.load()
    ink = [1 if (out[i] or pl[i % w, i // w]) else 0 for i in range(w * h)]
    seen = bytearray(w * h)
    for y in range(y0, y1):
        for x in range(x0, x1):
            i = y * w + x
            if not ink[i] or seen[i] or not near(x, y, 24):
                continue
            comp = []
            stack = [i]
            seen[i] = 1
            while stack:
                j = stack.pop()
                comp.append(j)
                for k in neighbours8(j, w, h):
                    if ink[k] and not seen[k]:
                        seen[k] = 1
                        stack.append(k)
            if len(comp) <= 4000:
                for j in comp:
                    out[j] = 0
                    pl[j % w, j // w] = 0
    return out


if __name__ == "__main__":
    source = Image.open(IMG / "ink-raiden.png").convert("RGBA")
    plate = raiden(source)
    under = shade(plate, source)
    save(plate, "raiden-night.png")
    save(under, "raiden-shade.png")

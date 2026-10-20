"""The night assets for sumi.html v4 — every paper-on-sumi plate the page needs, through one Bayer-4x4 pipeline (2 px cells,
the matrix of tools/make-wash.py and tools/make-grass.py, so everything shares one grain). Python + Pillow, no numpy.

  python tools/make-night.py [name ...]      (no names = everything; run oxipng -o4 on img/*.png after)

  bigshell-paper.png      the hero's monument: the Big Shell as a side elevation drawn here (pads, pylons, bridges, a mast), sinking into the mist
  bigshell-work-paper.png the Work chapter's monument: the same elevation closer, the core and the right pad, cut by the top edge
  tower-paper.png         the Research chapter's monument: a procedural lattice mast with a dish (the radar's twin), drawn here
  moon.png                a low paper moon, soft Bayer limb
  raiden-paper.png        the Shinkawa portrait inverted: paper strokes on transparent, the red kept, the feet dissolving
  raiden-night.png        the same portrait as-is (ink + opaque paper interior) with the same foot dissolve — the other candidate
  splash-paper.png        the ink splatter cropped from the slash painting, as paper, for the project-row hover
  proj-*-paper.png        the ten Work plates inverted: paper lines on transparent (the greys become sparser paper)
  wash-edge-deep.png      the v3 wash tile recoloured for the deep bands (About, footer) dissolving into the page ground
"""
import math, pathlib, random, sys
from PIL import Image, ImageDraw, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
IMG = HERE.parent / "img"
MGS = pathlib.Path(r"C:/Users/hlugo/Downloads/MGS/image-1788677438300.png")
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
PAPER = (233, 231, 226)
SUMI = (20, 20, 22)
RED = (201, 51, 58)
DEEP = (11, 11, 13)


def thr(x, y, cell=2):
    return (BAYER[(y // cell) % 4][(x // cell) % 4] + 0.5) / 16.0


def smooth(t):
    t = 0.0 if t < 0 else 1.0 if t > 1 else t
    return t * t * (3 - 2 * t)


def coverage_of(img):
    """An ink-on-transparent RGBA plate -> an 'L' coverage image (alpha, with the 225-alpha ink counted as full)."""
    a = img.convert("RGBA").getchannel("A")
    return a.point(lambda v: 255 if v >= 200 else int(v * 255 / 200))


def dither(cov, gain=None, colour=PAPER, cell=2, extra=None):
    """cov: 'L' image, 0..255 coverage. gain(x, y, w, h) -> multiplier. Returns a palette PNG: index 0 clear, 1 colour (+ extra colours)."""
    w, h = cov.size
    out = Image.new("P", (w, h), 0)
    pal = [0, 0, 0, *colour]
    if extra:
        for c in extra:
            pal += list(c)
    out.putpalette(pal + [0] * (768 - len(pal)))
    src = cov.load()
    dst = out.load()
    for y in range(h):
        for x in range(w):
            c = src[x, y] / 255.0
            if gain is not None:
                c *= gain(x, y, w, h)
            if c > thr(x, y, cell):
                dst[x, y] = 1
    return out


def save(img, name):
    p = IMG / name
    img.save(p, optimize=True, transparency=0)
    print(name, p.stat().st_size, "bytes", img.size)


# ---------- the monuments share one pass: the same line weight (~1.5 px at the size they are shown), the same fog (the bottom 45 %
# sinks into the mist), the same top gain; css shows all three at opacity .45 ----------
def monument(cov, name, top=0.78, fog_from=0.5, fog_len=0.46):
    def gain(x, y, w, h):
        v = y / h
        return top * (1.0 - smooth((v - fog_from) / fog_len))
    save(dither(cov, gain), name)


# ---------- the Big Shell, seen from the water: a side elevation drawn here (the aerial plan in img/bigshell-dither.png read as a CAD
# smudge on the horizon). Four flat hexagonal pads edge-on, each on pylons that go down into the fog, strut bridges between them, low
# decks and antennae on top, a slender mast on the core pad and a shorter one behind the far-left pad. Drawn in 640 x 280 units at a
# scale k; the hero shows it whole (640 wide, its base on the field's horizon), Work shows a closer crop of the right half cut by the top edge. ----------
def bigshell_draw(k, size=(640, 280)):
    w, h = int(size[0] * k), int(size[1] * k)
    im = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(im)
    L = max(1.0, 1.5 * k)                                                  # the deck line; the bracing is thinner
    th = max(1, round(L)); tn = max(1, round(L * 0.65)); tb = max(1, round(L * 1.25))
    P = lambda x, y: (x * k, y * k)
    def line(a, b, wd=th, f=255): d.line([P(*a), P(*b)], fill=f, width=wd)
    def rect(x0, y0, x1, y1, wd=th): d.rectangle([P(x0, y0), P(x1, y1)], outline=255, width=wd)
    def pad(x0, x1, y, t, py):
        """a long thin hexagon edge-on, its underside line, two or three pylons (pairs of lines, x-braced) down into the fog"""
        e = 9
        poly = [P(x0 + e, y), P(x1 - e, y), P(x1, y + t * 0.5), P(x1 - e, y + t), P(x0 + e, y + t), P(x0, y + t * 0.5)]
        d.polygon(poly, outline=255, fill=0, width=tb)
        line((x0 + 14, y + t + 4), (x1 - 14, y + t + 4), tn)
        for q in py:
            px = x0 + (x1 - x0) * q
            splay = (q - 0.5) * 0.12                                       # the outer pylons lean out a little
            yy = y + t + 4
            x_l, x_r = px - 4, px + 4
            bottom = h / k + 6
            line((x_l, yy), (x_l + splay * (bottom - yy), bottom), th)
            line((x_r, yy), (x_r + splay * (bottom - yy), bottom), th)
            s = yy
            while s + 26 < bottom:
                s2 = s + 26
                line((x_l + splay * (s - yy), s), (x_r + splay * (s2 - yy), s2), tn)
                line((x_r + splay * (s - yy), s), (x_l + splay * (s2 - yy), s2), tn)
                line((x_l + splay * (s2 - yy), s2), (x_r + splay * (s2 - yy), s2), tn)
                s = s2
    def deck(x, y, wd, ht): rect(x, y - ht, x + wd, y, th)
    def dome(x, y, r): d.pieslice([P(x - r, y - r), P(x + r, y + r)], 180, 360, outline=255, width=th)
    def antenna(x, y, ht, bars=1):
        line((x, y), (x, y - ht), tn)
        for i in range(bars): line((x - 3, y - ht + 4 + i * 6), (x + 3, y - ht + 4 + i * 6), tn)
    def rail(x0, x1, y):
        line((x0, y - 5), (x1, y - 5), tn)
        x = x0
        while x <= x1: line((x, y), (x, y - 5), tn); x += 10
    def bridge(x0, x1, y0, y1):
        line((x0, y0 + 2), (x1, y1 + 2), th); line((x0, y0 - 6), (x1, y1 - 6), tn)
        n = max(2, int((x1 - x0) / 9))
        for i in range(n + 1):
            u = i / n; x = x0 + (x1 - x0) * u; y = y0 + (y1 - y0) * u
            line((x, y + 2), (x, y - 6), tn)
    def mast(x, base, top, hw0, hw1, dish=True):
        line((x - hw0, base), (x - hw1, top), th); line((x + hw0, base), (x + hw1, top), th)
        y = base
        while y - 14 > top:
            y2 = y - 14; u = (y - top) / (base - top); u2 = (y2 - top) / (base - top)
            hw, hw2 = hw1 + (hw0 - hw1) * u, hw1 + (hw0 - hw1) * u2
            line((x - hw, y), (x + hw2, y2), tn); line((x + hw, y), (x - hw2, y2), tn); line((x - hw2, y2), (x + hw2, y2), tn)
            y = y2
        line((x, top), (x, top - 16), th)
        line((x - 6, top - 6), (x + 6, top - 6), tn)
        d.ellipse([P(x - 1.6, top - 19), P(x + 1.6, top - 15.5)], fill=255)
        if dish:
            dy = top + (base - top) * 0.38
            line((x + hw1 + 2, dy), (x + 12, dy - 3), tn)
            d.ellipse([P(x + 10, dy - 11), P(x + 16, dy + 5)], outline=255, width=th)
            line((x + 13, dy - 3), (x + 22, dy - 5), tn)
    # the four pads (far left is a little higher: further off), their pylons, what stands on them
    A = (14, 150, 112, 7); B = (196, 300, 121, 7); C = (346, 466, 115, 9); D = (512, 626, 123, 7)
    pad(*A, py=(0.2, 0.78)); pad(*B, py=(0.24, 0.76)); pad(*C, py=(0.14, 0.5, 0.86)); pad(*D, py=(0.22, 0.78))
    # A: two low decks, a dome, the second mast (shorter, behind)
    deck(28, 112, 34, 9); deck(70, 112, 22, 14); dome(118, 112, 7); rail(94, 146, 112)
    mast(60, 112, 56, 5, 2, dish=False); antenna(135, 112, 18, 2)
    # B: a long low deck and a tank
    deck(208, 121, 48, 8); deck(262, 121, 18, 12); antenna(238, 113, 14, 1); rail(206, 296, 121); dome(290, 121, 5)
    # C, the core: a two-tier block and the mast with its dish
    deck(372, 115, 64, 24); deck(386, 91, 36, 13); deck(438, 115, 20, 9); dome(360, 115, 6)
    mast(404, 78, 14, 7, 2.2); antenna(448, 106, 16, 2)
    # D: decks, a dome, antennae
    deck(524, 123, 30, 10); deck(560, 123, 44, 15); dome(614, 123, 6); antenna(540, 113, 12, 1); antenna(596, 108, 20, 2); rail(606, 622, 123)
    # the strut bridges between the pads, at deck level
    bridge(150, 196, 112, 121); bridge(300, 346, 121, 115); bridge(466, 512, 115, 123)
    # two guy wires from the core mast to the pad ends, hairlines
    line((404, 20), (352, 113), 1); line((404, 20), (460, 113), 1)
    return im


def bigshell_hero():
    SS = 3
    im = bigshell_draw(SS)
    cov = im.resize((640, 280), Image.LANCZOS).crop((0, 0, 640, 250))     # the pylons stand in the mist: the fog takes them from the pads down
    monument(cov, "bigshell-paper.png", top=0.78, fog_from=0.5, fog_len=0.48)


def bigshell_work():
    SS = 3
    im = bigshell_draw(SS * 1.9)                                          # closer: the core and the right pad, cut by the top edge
    cov = im.resize((int(640 * 1.9), int(280 * 1.9)), Image.LANCZOS).crop((456, 70, 1216, 350))   # the decks level with the chapter heading; the pylons go into the fog fast (the rows below stay clear)
    monument(cov, "bigshell-work-paper.png", top=0.78, fog_from=0.56, fog_len=0.42)


# ---------- the comms tower: a lattice mast with a dish, drawn here (the radar's twin) ----------
def tower():
    W, H, SS = 260, 760, 3
    w, h = W * SS, H * SS
    im = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(im)
    cx = w * 0.5
    base_y, top_y = h * 0.96, h * 0.16
    half_base, half_top = w * 0.30, w * 0.045
    ln = max(2, SS)
    # the two legs, a gentle taper
    def half(y):
        t = (y - top_y) / (base_y - top_y)
        return half_top + (half_base - half_top) * (t ** 1.35)
    steps = 60
    pts_l, pts_r = [], []
    for i in range(steps + 1):
        y = top_y + (base_y - top_y) * i / steps
        pts_l.append((cx - half(y), y)); pts_r.append((cx + half(y), y))
    d.line(pts_l, fill=255, width=ln + 1); d.line(pts_r, fill=255, width=ln + 1)
    # cross bracing: X panels, closer together near the top
    y = base_y
    k = 0
    while y > top_y + 8 * SS:
        panel = (34 - 20 * ((y - top_y) / (base_y - top_y)) ** 0.5) * SS * 1.9
        y2 = max(top_y, y - panel)
        d.line([(cx - half(y), y), (cx + half(y2), y2)], fill=255, width=ln)
        d.line([(cx + half(y), y), (cx - half(y2), y2)], fill=255, width=ln)
        d.line([(cx - half(y2), y2), (cx + half(y2), y2)], fill=255, width=ln)
        if k in (3, 9):                                                   # two platforms
            d.line([(cx - half(y2) - 14 * SS, y2), (cx + half(y2) + 14 * SS, y2)], fill=255, width=ln + 2)
            d.line([(cx - half(y2) - 14 * SS, y2), (cx - half(y2), y2 - 10 * SS)], fill=255, width=ln)
            d.line([(cx + half(y2) + 14 * SS, y2), (cx + half(y2), y2 - 10 * SS)], fill=255, width=ln)
        y = y2; k += 1
    # the dish: an ellipse on an arm to the right at the upper platform, its feed horn
    dy = top_y + (base_y - top_y) * 0.30
    d.line([(cx + half(dy), dy), (cx + half(dy) + 22 * SS, dy - 6 * SS)], fill=255, width=ln + 1)
    ex, ey, rw, rh = cx + half(dy) + 30 * SS, dy - 10 * SS, 9 * SS, 26 * SS
    d.ellipse([ex - rw, ey - rh, ex + rw, ey + rh], outline=255, width=ln + 1)
    d.ellipse([ex - rw * 0.45, ey - rh * 0.9, ex + rw * 0.45, ey + rh * 0.9], outline=255, width=ln)
    d.line([(ex, ey), (ex + 24 * SS, ey - 4 * SS)], fill=255, width=ln)
    d.line([(ex + 24 * SS, ey - 8 * SS), (ex + 24 * SS, ey)], fill=255, width=ln + 1)
    # the mast on top, a small drum, a lamp
    d.line([(cx, top_y), (cx, top_y - 60 * SS)], fill=255, width=ln + 1)
    d.rectangle([cx - 5 * SS, top_y - 34 * SS, cx + 5 * SS, top_y - 22 * SS], outline=255, width=ln)
    d.line([(cx - 12 * SS, top_y - 48 * SS), (cx + 12 * SS, top_y - 48 * SS)], fill=255, width=ln)
    d.ellipse([cx - 3 * SS, top_y - 66 * SS, cx + 3 * SS, top_y - 60 * SS], fill=255)
    # guy lines, thin, falling off the page
    for sx in (-1, 1):
        d.line([(cx + sx * half(top_y + 40 * SS), top_y + 40 * SS), (cx + sx * w * 0.62, h * 0.98)], fill=255, width=max(1, SS - 1))
    # a second, shorter mast behind it to the right (fainter: it stands further off), so the tower reads as a place, not a glyph
    bx, bt, bb = cx + w * 0.30, top_y + (base_y - top_y) * 0.42, base_y
    hb0, hb1 = w * 0.09, w * 0.02
    d.line([(bx - hb0, bb), (bx - hb1, bt)], fill=150, width=ln); d.line([(bx + hb0, bb), (bx + hb1, bt)], fill=150, width=ln)
    yy = bb
    while yy - 26 * SS > bt:
        y2 = yy - 26 * SS; u, u2 = (yy - bt) / (bb - bt), (y2 - bt) / (bb - bt)
        hw, hw2 = hb1 + (hb0 - hb1) * u, hb1 + (hb0 - hb1) * u2
        d.line([(bx - hw, yy), (bx + hw2, y2)], fill=150, width=max(1, SS - 1)); d.line([(bx + hw, yy), (bx - hw2, y2)], fill=150, width=max(1, SS - 1))
        d.line([(bx - hw2, y2), (bx + hw2, y2)], fill=150, width=max(1, SS - 1))
        yy = y2
    d.line([(bx, bt), (bx, bt - 30 * SS)], fill=150, width=ln)
    im = im.rotate(-1.6, resample=Image.BICUBIC, expand=False)             # a slight off-axis lean: it stands, it is not a map icon
    cov = im.resize((W, H), Image.LANCZOS)
    monument(cov, "tower-paper.png", top=0.78, fog_from=0.52, fog_len=0.46)


# ---------- the moon ----------
def moon():
    S = 200
    cov = Image.new("L", (S, S), 0)
    px = cov.load()
    r = S * 0.46
    for y in range(S):
        for x in range(S):
            dd = math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2)
            edge = 1.0 - smooth((dd - (r - 7)) / 7)                       # a flat paper disc (fill 255) with only a 7 px Bayer rim: no shading, no sphere
            px[x, y] = int(255 * edge)
    save(dither(cov, cell=1), "moon.png")


# ---------- Raiden, two ways ----------
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
    # (ii) inverted: the ink strokes become paper, the paper interior goes, the red stays
    inv = Image.new("P", (w, h), 0)
    inv.putpalette([0, 0, 0, *PAPER, *RED] + [0] * (768 - 9))
    q = inv.load()
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
    asis = Image.new("P", (w, h), 0)
    asis.putpalette([0, 0, 0, *SUMI, *PAPER, *RED] + [0] * (768 - 12))
    s_ = asis.load()
    for y in range(h):
        v = y / h
        keep = 1.0 - smooth((v - 0.74) / 0.24)                              # the feet dissolve into the grass from 74 % down
        for x in range(w):
            r, g, b, a = p[x, y]
            if a < 8:
                continue
            red = r > 150 and g < 90
            if red:
                q[x, y] = 2
            elif r < 60:
                q[x, y] = 1
            t = thr(x, y)
            if keep <= t:
                continue
            ins = insp[x, y] / 255
            if red and ins > t:
                s_[x, y] = 3
            elif pp[x, y] and dens[x, y] >= 77 and ins >= 0.5:
                s_[x, y] = 2
    save(inv, "raiden-paper.png")
    save(asis, "raiden-night.png")


# ---------- the splash: the splatter below the slash, cropped from the painting ----------
def splash():
    src = Image.open(MGS).convert("L")
    crop = src.crop((186, 690, 376, 812))                                  # the dots and the blob under the hilt; the brush mass sits at the right edge
    crop = crop.point(lambda v: 255 - v)                                   # ink -> coverage
    crop = crop.resize((400, int(140 * 400 / 190)), Image.LANCZOS)
    w, h = crop.size
    cx, cy = w * 0.36, h * 0.46

    def gain(x, y, w_, h_):
        dd = math.hypot((x - cx) / (w_ * 0.46), (y - cy) / (h_ * 0.5))      # a soft radial window: the brush mass at the right and top edges is cut
        return 1.15 * (1.0 - smooth((dd - 0.6) / 0.4)) * smooth((y - 4) / 26)
    cov = crop.point(lambda v: 255 if v > 150 else int(v * 1.6) if v > 60 else 0)
    save(dither(cov, gain, cell=1), "splash-paper.png")


# ---------- the plates ----------
def plates():
    for f in sorted(IMG.glob("proj-*-ink.png")):
        src = Image.open(f).convert("RGBA")
        w, h = src.size
        cov = Image.new("L", (w, h), 0)
        p, c = src.load(), cov.load()
        for y in range(h):
            for x in range(w):
                r, g, b, a = p[x, y]
                lum = (r + g + b) / 3
                if lum < 60: c[x, y] = 255
                elif lum < 150: c[x, y] = 150
                elif lum < 215: c[x, y] = 80
        save(dither(cov, cell=1), f.name.replace("-ink", "-paper"))


# ---------- the deep wash ----------
def wash_deep():
    src = Image.open(IMG / "wash-edge.png")
    out = src.transpose(Image.FLIP_TOP_BOTTOM)                             # the committed tile is solid at its top; the css hangs it 200 px above a band, so the solid edge must be at the bottom
    out.putpalette([0, 0, 0, *DEEP] + [0] * (768 - 6))
    save(out, "wash-edge-deep.png")


JOBS = {"bigshell": bigshell_hero, "bigshell-work": bigshell_work, "tower": tower, "moon": moon, "raiden": raiden,
        "splash": splash, "plates": plates, "wash": wash_deep}

if __name__ == "__main__":
    names = sys.argv[1:] or list(JOBS)
    for n in names:
        JOBS[n]()

"""The hero figure — img/raiden-night.png: Yoji Shinkawa's Raiden cut out of his paper as a 2-colour plate (paper #e9e7e2 on transparent) for
the fold of index.html (css .hero .figure) and the link-preview card (tools/og-card.html). Python + Pillow, no numpy.

  python tools/make-night.py          -> img/raiden-night.png (run oxipng -o4 --strip safe on it after)

The source, img/ink-raiden.png (the portrait as he drew it, ink on paper), left the shipped tree with the old site: read it from history first,
  git show 1d2e5eb:img/ink-raiden.png > img/ink-raiden.png
The red petals in the painting are dropped (the page is monochrome); the ink is the sumi ground itself, so only his paper is kept: face, hand,
hair, the washes. The feet dissolve into the fog from 74 % down through a Bayer 4x4 at 2 px cells.
"""
import pathlib
from PIL import Image, ImageDraw, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
IMG = HERE.parent / "img"
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
PAPER = (233, 231, 226)


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
    save(asis, "raiden-night.png")


if __name__ == "__main__":
    raiden()

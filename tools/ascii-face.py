"""ASCII face for the About chapter — Pillow port of the sumi-ascii-grass-wind lens sampler.

Positive portrait, paper glyphs on sumi: skin highlights carry '@', shadows thin out to '.',
and the backdrop (flood-filled from the frame's top corners) is clamped to the space glyph so
the face floats in the courtyard instead of sitting between two walls. The frame is cropped
tight to the head (head ≈ 75 % of the frame height), the ramp is spread over the 2–98 %
luminance percentiles of the subject only, and the image is pre-blurred to undo the Bayer
dither of the 200 px stand-in headshot.

  python tools/ascii-face.py                      -> img/ascii-face.txt (84 cols) + img/ascii-face-60.txt
  python tools/ascii-face.py --src photo.jpg      -> same from the real photo (>= 1200 px short side)
  python tools/ascii-face.py --crop 26,0,172,160  -> crop box (left,top,right,bottom) in source px; default fits headshot-ink.png
  python tools/ascii-face.py --cols 84 --out x.txt
  python tools/ascii-face.py --inline             -> also rewrites the two <pre class="face"> blocks in sumi.html

When the real photo lands: run with --src and a --crop that keeps head + shoulders at ~60–70 % of
the frame; --bg 0 turns the backdrop clamp off if the photo already has a dark backdrop.
"""
import re, sys, pathlib
from PIL import Image, ImageFilter, ImageDraw, ImageChops

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAMP = "@#%*+=-:. "        # ramp[0] densest (brightest on sumi), ramp[-1] = space
CHAR_ASPECT = 0.54         # Share Tech Mono advance / line-height 1 (measured in Chrome: 84 cols at 11.9px = 540px)
GAMMA = 0.85               # < 1 lifts the mid-tones of the face into the dense half of the ramp
BG_EDGE = 3.0              # backdrop flood: gain on the edge map (the fill stops at the hair / jaw contour)
BG_DARK = 125              # ...and at anything darker than this (hair, suit, face shadows)
BG_DARK_SIDE = 90          # a second, looser pass confined to the outer SIDE columns of the upper frame absorbs a vignetted corner
SIDE = 0.24                # ...without ever reaching the head, which sits in the central band
BG_TOL = 60                # flood-fill tolerance on that synthetic map
LO_PCT, HI_PCT = 0.10, 0.90   # the ramp spans these luminance percentiles of the subject: the shirt saturates, the face gets the range
SUBJECT_FLOOR = 0.12       # subject pixels under this (post-normalise) also drop to space: the suit vanishes, the collar stays

args = sys.argv[1:]
def opt(name, default):
    return args[args.index(name) + 1] if name in args else default
SRC = ROOT / opt("--src", "img/headshot-ink.png")
CROP = tuple(int(v) for v in opt("--crop", "26,0,172,160").split(","))
BG = int(opt("--bg", "1"))
ONLY = opt("--cols", None)
GAMMA = float(opt("--gamma", GAMMA)); LO_PCT = float(opt("--lo", LO_PCT)); HI_PCT = float(opt("--hi", HI_PCT))
OUT = opt("--out", None)


def prepare(img):
    """composite on paper, grey, crop, blur (radius scales with the source so the dither averages out)"""
    im = img.convert("RGBA")
    paper = Image.new("RGBA", im.size, (233, 231, 226, 255))
    im = Image.alpha_composite(paper, im).convert("L")
    if CROP and CROP != (0, 0, 0, 0):
        im = im.crop(CROP)
    return im


def backdrop_mask(im, cols):
    """255 where the backdrop is. Flood-fill from the frame's top corners over a synthetic map that is
    high (a wall) wherever the blurred image has a strong edge or is darker than BG_DARK, and low
    elsewhere, so the hair / jaw contour stops the fill. A second, looser pass (BG_DARK_SIDE) runs only
    in the outer SIDE columns and the top strip, where a vignetted corner can be darker than the face
    but the head never is; the two are unioned and dilated by the blur radius so the mask meets the contour."""
    blur = im.filter(ImageFilter.GaussianBlur(max(2.0, im.width / cols * 0.9)))
    edges = blur.filter(ImageFilter.FIND_EDGES).point(lambda p: min(250, int(p * BG_EDGE)))
    w, h = edges.size
    d = ImageDraw.Draw(edges)                     # FIND_EDGES fires along the frame border; open the top and sides (not the bottom: the collar sits there)
    d.rectangle([0, 0, w - 1, 6], fill=0); d.rectangle([0, 0, 2, h - 1], fill=0); d.rectangle([w - 3, 0, w - 1, h - 1], fill=0)

    def fill(dark_level, strips_only):
        dark = blur.point(lambda p: 255 if p < dark_level else 0)
        m = Image.composite(dark, edges, dark)    # dark pixels -> 255 (wall); others -> scaled edge magnitude
        if strips_only:                           # wall off the head's band (below the top strip) and the lower frame
            d2 = ImageDraw.Draw(m)
            d2.rectangle([int(w * SIDE), int(h * 0.05), int(w * (1 - SIDE)), h - 1], fill=255)
            d2.rectangle([0, int(h * 0.6), w - 1, h - 1], fill=255)
        for seed in ((1, 1), (w - 2, 1), (1, h // 3), (w - 2, h // 3)):
            if m.getpixel(seed) < 200:
                ImageDraw.floodfill(m, seed, 254, thresh=BG_TOL)
        return m.point(lambda p: 255 if p == 254 else 0)

    m = ImageChops.lighter(fill(BG_DARK, False), fill(BG_DARK_SIDE, True))
    return m.filter(ImageFilter.MaxFilter(7))


def sample(img, cols):
    im = prepare(img)
    rows = round(cols * (im.height / im.width) * CHAR_ASPECT)
    mask = backdrop_mask(im, cols) if BG else Image.new("L", im.size, 0)
    soft = im.filter(ImageFilter.GaussianBlur(max(1.2, im.width / cols * 0.6)))
    # two-step downsample as the lens did (3x, then exact)
    soft = soft.resize((cols * 3, rows * 3), Image.LANCZOS).resize((cols, rows), Image.BOX)
    mask = mask.resize((cols * 3, rows * 3), Image.LANCZOS).resize((cols, rows), Image.BOX)
    px, mk = list(soft.get_flattened_data()) if hasattr(soft, "get_flattened_data") else list(soft.getdata()), list(mask.get_flattened_data()) if hasattr(mask, "get_flattened_data") else list(mask.getdata())
    subject = sorted(p for p, m in zip(px, mk) if m < 128)
    if not subject:
        subject = sorted(px)
    lo, hi = subject[int(len(subject) * LO_PCT)] / 255, subject[int(len(subject) * HI_PCT) - 1] / 255
    span = max(1e-3, hi - lo)
    lum = []
    for p, m in zip(px, mk):
        v = min(1.0, max(0.0, (p / 255 - lo) / span))
        if m >= 128 or v < SUBJECT_FLOOR:
            v = -1.0                       # backdrop / deep shadow -> space
        lum.append(v)
    return cols, rows, lum


def glyph(v):
    if v < 0:
        return " "
    t = v ** GAMMA                         # bright -> dense
    i = min(len(RAMP) - 1, max(0, round((1 - t) * (len(RAMP) - 1))))
    return RAMP[i]


def render(img, cols):
    cols, rows, lum = sample(img, cols)
    lines = ["".join(glyph(lum[y * cols + x]) for x in range(cols)) for y in range(rows)]
    return "\n".join(lines)


if __name__ == "__main__":
    img = Image.open(SRC)
    jobs = [(int(ONLY), OUT or f"img/ascii-face-{ONLY}.txt")] if ONLY else [(84, "img/ascii-face.txt"), (60, "img/ascii-face-60.txt")]
    for cols, out in jobs:
        txt = render(img, cols)
        p = ROOT / out
        p.write_text(txt, encoding="utf-8", newline="\n")
        print(f"{out}: {cols}x{txt.count(chr(10)) + 1}, {len(txt)} chars, src {SRC.name} {img.size} crop {CROP}")
        if "--inline" in args:
            page = ROOT / "sumi.html"
            html = page.read_text(encoding="utf-8")
            pat = re.compile(r'(<pre class="face" aria-hidden="true" data-cols="%d">)(.*?)(</pre>)' % cols, re.S)
            assert pat.search(html), f"no <pre data-cols={cols}> in sumi.html"
            html = pat.sub(lambda m: m.group(1) + txt + m.group(3), html)
            page.write_text(html, encoding="utf-8", newline="\n")
            print(f"  inlined into sumi.html")

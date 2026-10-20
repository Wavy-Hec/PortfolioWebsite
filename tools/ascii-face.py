"""ASCII Raiden for the About band — a Shinkawa piece as a glyph grid.

Subject (default): Yoji Shinkawa's Raiden sword-slash piece (image-1788677438300.png, black ink
on white, 700x1000, the whole figure: head, the sword, the kick). Mode "ink": glyph density =
ink density (255 - brightness), paper -> space, so the figure floats on the sumi band exactly
as it floats on the page. A cell blends its mean and its max ink (MAXMIX) so a thin stroke
still lands a glyph. 96 columns -> 74 rows; 60 -> 46.

The portrait (9c5dedbaee3c1bd03f70ab37db93a21e.jpg, head + hair + fist) was tried first and
is still available: --src <portrait> --crop 220,70,980,830 --mode tex --lo .2 --hi .8
--maxmix .5 --blur .35 --gamma .7. It reads worse at 96 columns: the pale face is brushwork at
mean ~0.4 while the scan's flat grey wash sits at 0.55-0.65, so tone alone cannot separate
the two; "tex" draws a cell only where there is brushwork (TEX: local high-pass energy over
TEXR px) and shades it by brightness, which gives the hair mass, the face and the fist but
not a face you would name. The slash piece has a silhouette; the portrait has a texture.
Other modes, kept for experiments: pos (plain brightness), local (brightness relative to the
local mean), edge (|local contrast|), texlocal (local, masked by brushwork).

  python tools/ascii-face.py                         -> img/ascii-raiden-96.txt + img/ascii-raiden-60.txt
  python tools/ascii-face.py --src other.jpg --crop l,t,r,b --mode tex
  python tools/ascii-face.py --cols 96 --out x.txt
  python tools/ascii-face.py --lo .2 --hi .9 --maxmix .4 --blur .3 --gamma .8
  python tools/ascii-face.py --inline                -> also rewrites the two <script type="text/plain" data-cols> blocks in sumi.html
  python tools/ascii-face.py --preview out.png       -> renders the first grid to a PNG for a look (paper on sumi)

js/sumi.js reads the inlined grids (one char per cell, rows joined by 
) and draws them on a
<canvas> in Share Tech Mono; the ramp order here must match RAMP there ('@#%*+=-:. ').
"""
import re, sys, pathlib
from PIL import Image, ImageFilter, ImageDraw, ImageFont, ImageChops

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAMP = "@#%*+=-:. "        # ramp[0] densest (brightest on sumi), ramp[-1] = space
CHAR_ASPECT = 0.54         # Share Tech Mono advance / line-height 1 (measured in Chrome: 84 cols at 11.9px = 540px)

args = sys.argv[1:]
def opt(name, default):
    return args[args.index(name) + 1] if name in args else default
SRC = pathlib.Path(opt("--src", r"C:/Users/hlugo/Downloads/MGS/image-1788677438300.png"))
CROP = tuple(int(v) for v in opt("--crop", "0,0,700,1000").split(","))   # the whole slash piece (it is 700x1000); the portrait: --src .../9c5dedbaee3c1bd03f70ab37db93a21e.jpg --crop 220,70,980,830 --mode tex
ONLY = opt("--cols", None)
GAMMA = float(opt("--gamma", 0.8))     # < 1 pushes a highlight's mid-greys toward the dense end
LO = float(opt("--lo", 0.2))           # brightness (0 black .. 1 white) under this -> space; the wash is 0.55-0.65, a strand >= 0.75
HI = float(opt("--hi", 0.9))           # ...and from LO to HI the ramp runs sparse -> dense
MAXMIX = float(opt("--maxmix", 0.4))    # 0 = cell mean, 1 = cell max
MODE = opt("--mode", "ink")           # local: brightness relative to the local mean (RADIUS px) | edge: |local contrast| | pos: plain brightness
RADIUS = float(opt("--radius", 28))
TEX = float(opt("--tex", 14))           # tex mode: cells whose brushwork (local |high-pass|, 0..255) stays under this are flat -> space
TEXR = float(opt("--texr", 10))
BLUR = float(opt("--blur", 0.3))       # pre-sample blur, in cells         # ...measured over this radius
OUT = opt("--out", None)
PREVIEW = opt("--preview", None)


def prepare(img):
    """composite on paper, grey, crop; the red petals go grey with everything else (they are ink here)"""
    im = img.convert("RGBA")
    paper = Image.new("RGBA", im.size, (233, 231, 226, 255))
    im = Image.alpha_composite(paper, im).convert("L")
    if CROP and CROP != (0, 0, 0, 0):
        im = im.crop(CROP)
    return im


def pixels(im):
    return list(im.get_flattened_data()) if hasattr(im, "get_flattened_data") else list(im.getdata())


def signal_local(im):
    base = im.filter(ImageFilter.GaussianBlur(RADIUS))
    out = Image.new("L", im.size)
    out.putdata([max(0, min(255, 128 + (x - y))) for x, y in zip(pixels(im), pixels(base))])
    return out


def signal(im):
    """the map the glyphs sample: 0..255"""
    if MODE in ("pos", "tex"):
        return im
    if MODE == "ink":                                   # black ink on white paper: density = ink
        return im.point(lambda v: 255 - v)
    if MODE == "texlocal":
        return signal_local(im)
    base = im.filter(ImageFilter.GaussianBlur(RADIUS))
    a, b = pixels(im), pixels(base)
    out = Image.new("L", im.size)
    if MODE == "edge":
        out.putdata([min(255, abs(x - y) * 2) for x, y in zip(a, b)])
    else:
        out.putdata([max(0, min(255, 128 + (x - y))) for x, y in zip(a, b)])
    return out


def texture(im):
    """how much brushwork a neighbourhood holds: |im - blur 3| blurred over TEXR (flat slab / flat wash ~ 3, a stroke ~ 40)"""
    return ImageChops.difference(im, im.filter(ImageFilter.GaussianBlur(3))).filter(ImageFilter.GaussianBlur(TEXR))


def sample(img, cols):
    src = prepare(img)
    im = signal(src)
    rows = round(cols * (im.height / im.width) * CHAR_ASPECT)
    cell = im.width / cols
    flat = None
    if MODE in ("tex", "texlocal"):
        t = texture(src).resize((cols, rows), Image.BOX)
        flat = [v < TEX for v in pixels(t)]
    soft = im.filter(ImageFilter.GaussianBlur(max(0.6, cell * BLUR)))
    mean = soft.resize((cols * 3, rows * 3), Image.LANCZOS).resize((cols, rows), Image.BOX)
    k = max(3, int(cell * 0.8) | 1)
    peak = soft.filter(ImageFilter.MaxFilter(k)).resize((cols, rows), Image.BOX)
    lum = []
    for i, (m, p) in enumerate(zip(pixels(mean), pixels(peak))):
        b = ((1 - MAXMIX) * m + MAXMIX * p) / 255
        if b < LO or (flat and flat[i]):
            lum.append(-1.0)
            continue
        lum.append(min(1.0, (b - LO) / (HI - LO)))
    return cols, rows, lum


def glyph(v):
    if v < 0:
        return " "
    t = v ** GAMMA
    i = min(len(RAMP) - 1, max(0, round((1 - t) * (len(RAMP) - 1))))
    return RAMP[i]


def render(img, cols):
    cols, rows, lum = sample(img, cols)
    lines = ["".join(glyph(lum[y * cols + x]) for x in range(cols)) for y in range(rows)]
    return "\n".join(lines)


def preview(txt, path, cell=(7, 13)):
    lines = txt.split("\n")
    w, h = len(lines[0]) * cell[0], len(lines) * cell[1]
    im = Image.new("RGB", (w, h), (20, 20, 22))
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("consola.ttf", 12)
    except OSError:
        font = ImageFont.load_default()
    for y, line in enumerate(lines):
        for x, ch in enumerate(line):
            if ch != " ":
                d.text((x * cell[0], y * cell[1]), ch, fill=(233, 231, 226), font=font)
    im.save(path)


if __name__ == "__main__":
    img = Image.open(SRC)
    jobs = [(int(ONLY), OUT or f"img/ascii-raiden-{ONLY}.txt")] if ONLY else [(96, "img/ascii-raiden-96.txt"), (60, "img/ascii-raiden-60.txt")]
    for cols, out in jobs:
        txt = render(img, cols)
        p = ROOT / out
        p.write_text(txt, encoding="utf-8", newline="\n")
        print(f"{out}: {cols}x{txt.count(chr(10)) + 1}, {len(txt)} chars, src {SRC.name} {img.size} crop {CROP} lo {LO} hi {HI} maxmix {MAXMIX}")
        if PREVIEW and cols == jobs[0][0]:
            preview(txt, PREVIEW)
        if "--inline" in args:
            page = ROOT / "sumi.html"
            html = page.read_text(encoding="utf-8")
            pat = re.compile(r'(<script type="text/plain" class="ascii-grid" data-cols="%d">\n)(.*?)(</script>)' % cols, re.S)
            assert pat.search(html), f"no ascii-grid block for {cols} cols in sumi.html"
            html = pat.sub(lambda m: m.group(1) + txt + "\n" + m.group(3), html)
            page.write_text(html, encoding="utf-8", newline="\n")
            print(f"  inlined into sumi.html")

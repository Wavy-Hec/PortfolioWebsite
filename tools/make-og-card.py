# Renders the link-preview card (img/og-card-ink.png, 1200x630) and the favicon
# set (favicon.svg, favicon-32.png, apple-touch-icon.png) in the Ink design:
# paper, the black headline band, Raiden (img/ink-raiden.png) crossing the band
# exactly like the hero, red only where the painting carries it.
#
#   python tools/make-og-card.py          (run from the repo root; needs Pillow)
#
# Fonts: Georgia Bold + Consolas from C:\Windows\Fonts (system stand-ins for the
# site's Spectral / Share Tech Mono — the card is a static image, no webfonts).
# tools/og-card.html is the human-readable HTML mock of the same composition.
import pathlib
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
FONTS = pathlib.Path(r"C:\Windows\Fonts")
PAPER, PAPER_DOT, INK, BAND, RED = (233, 231, 226), (214, 211, 204), (20, 20, 22), (13, 13, 16), (224, 74, 82)
TEXT_DIM, TEXT_MUTED, ON_BAND = (85, 88, 93), (140, 137, 130), (243, 241, 234)
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def paper(w, h):
    im = Image.new("RGB", (w, h), PAPER)
    px = im.load()
    for y in range(0, h, 2):            # the site's faint ordered-dither grain
        for x in range(0, w, 2):
            if BAYER[(y // 2) % 4][(x // 2) % 4] < 2:
                px[x, y] = PAPER_DOT
    return im


def og_card():
    W, H = 1200, 630
    im = paper(W, H)
    d = ImageDraw.Draw(im)
    d.text((80, 150), "// AI RESEARCHER · ROBOTICS ENGINEER", font=font("consola.ttf", 22), fill=TEXT_DIM)
    d.rectangle([0, 200, W, 436], fill=BAND)
    name = font("georgiab.ttf", 100)
    d.text((78, 206), "HECTOR", font=name, fill=ON_BAND)
    d.text((78, 318), "LUGO", font=name, fill=RED)
    d.text((80, 466), "wavy-hec.github.io/PortfolioWebsite", font=font("consola.ttf", 22), fill=TEXT_DIM)
    d.text((80, 502), "illustrations: Yoji Shinkawa", font=font("consola.ttf", 16), fill=TEXT_MUTED)
    raiden = Image.open(ROOT / "img" / "ink-raiden.png").convert("RGBA")
    h = 566
    raiden = raiden.resize((int(raiden.width * h / raiden.height), h), Image.LANCZOS)
    x, y = W - 100 - raiden.width, 14
    im.paste(raiden, (x, y), raiden)     # opaque paper inside the silhouette holds over the band
    d.text((x + raiden.width // 2, y + h + 10), "RAIDEN · MGS2 · 140.85", font=font("consola.ttf", 15), fill=TEXT_DIM, anchor="ma")
    out = ROOT / "img" / "og-card-ink.png"
    im.quantize(colors=64, method=Image.FASTOCTREE).save(out, optimize=True)
    print(out.name, im.size, out.stat().st_size // 1024, "KB")


def favicon_png(size):
    # ink square, paper "HL", the red seal in the corner — same geometry as favicon.svg
    s = size / 64
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(10 * s), fill=INK)
    d.text((size / 2, size * 0.52), "HL", font=font("georgiab.ttf", int(34 * s)), fill=ON_BAND, anchor="mm")
    d.rectangle([int(46 * s), int(46 * s), int(55 * s), int(55 * s)], fill=(201, 51, 58))
    return im


def favicons():
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
           '<rect width="64" height="64" rx="10" fill="#141416"/>'
           '<text x="32" y="45" font-family="Georgia,\'Times New Roman\',serif" font-size="34" font-weight="700" '
           'fill="#f3f1ea" text-anchor="middle">HL</text>'
           '<rect x="46" y="46" width="10" height="10" fill="#c9333a"/></svg>')
    (ROOT / "favicon.svg").write_text(svg, encoding="utf-8")
    favicon_png(32).save(ROOT / "favicon-32.png", optimize=True)
    touch = Image.new("RGB", (180, 180), INK)      # iOS composites its own corners; keep the ink ground solid
    icon = favicon_png(180)
    touch.paste(icon, (0, 0), icon)
    touch.save(ROOT / "apple-touch-icon.png", optimize=True)
    for f in ("favicon.svg", "favicon-32.png", "apple-touch-icon.png"):
        print(f, (ROOT / f).stat().st_size, "bytes")


if __name__ == "__main__":
    og_card()
    favicons()

#!/usr/bin/env python3
"""Regenerate the résumé viewer (resume-page1.png + the link overlay in resume.html).

Run this whenever the résumé PDF (see PDF below) changes, or the on-screen
résumé and its clickable links will drift out of sync with the PDF.

    pip install pymupdf pillow
    python tools/build-resume-view.py

Why an image instead of an embedded PDF: a browser configured to download PDFs
(common on macOS) cannot be forced to render one inline via <object>/<iframe>.
An <img> always displays. The PDF's own link annotations are re-created as
percentage-positioned <a> hotspots so hover and clicking still work.
"""
import html
import pathlib
import re
import shutil
import subprocess
import sys

import fitz  # pymupdf
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
PDF = ROOT / "Hector_Lugo_Fall_Resume.pdf"
IMG = ROOT / "resume-page1.png"
VIEW = ROOT / "resume.html"
ZOOM = 2.0        # 2x = 144dpi, crisp on hidpi screens
PALETTE = 128     # quantize: text stays sharp, file size roughly halves


def friendly(uri: str) -> str:
    """Human label for the hotspot's tooltip / screen-reader name."""
    if uri.startswith("mailto:"):
        return "Email " + uri[7:]
    if uri.startswith("tel:"):
        return "Call " + uri[4:]
    for needle, name in [
        ("linkedin", "LinkedIn profile"),
        ("github.com/Wavy-Hec/MultiCam", "MultiCam repo on GitHub"),
        ("github.com/Wavy-Hec/ObjectDetection", "Object detection repo on GitHub"),
        ("github.com/Wavy-Hec", "GitHub profile"),
        ("springer", "Read the paper (Springer)"),
        ("nsf.gov", "Read the paper (NSF PAR)"),
        ("asme", "Read the paper (ASME)"),
    ]:
        if needle in uri:
            return name
    return uri


def main() -> int:
    if not PDF.exists():
        print(f"missing {PDF.name}", file=sys.stderr)
        return 1

    doc = fitz.open(PDF)
    if doc.page_count != 1:
        print(f"note: {doc.page_count} pages — this builder handles page 1 only", file=sys.stderr)
    page = doc[0]

    # 1. render the page to a PNG, then quantize to keep it small
    page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM)).save(IMG)
    im = Image.open(IMG).convert("RGB")
    im.quantize(colors=PALETTE, method=Image.MEDIANCUT, dither=Image.NONE).save(IMG, optimize=True)
    # lossless squeeze (~7% on top of Pillow's optimize) — skipped if oxipng
    # isn't installed (winget install Shssoichiro.Oxipng)
    if oxipng := shutil.which("oxipng"):
        subprocess.run([oxipng, "-o", "4", "--strip", "safe", str(IMG)], check=False)
    print(f"{IMG.name}: {im.width}x{im.height}, {IMG.stat().st_size:,} bytes")

    # 2. rebuild the hotspots from the PDF's link annotations, in % of the page
    pw, ph = page.rect.width, page.rect.height
    rows = []
    for link in page.get_links():
        uri = link.get("uri")
        if not uri:
            continue
        r = link["from"]
        label = friendly(uri)
        target = ' target="_blank" rel="noopener"' if uri.startswith("http") else ""
        rows.append(
            f'      <a class="lk" href="{html.escape(uri, quote=True)}"{target} '
            f'title="{html.escape(label, quote=True)}" aria-label="{html.escape(label, quote=True)}" '
            f'style="left:{r.x0 / pw * 100:.3f}%;top:{r.y0 / ph * 100:.3f}%;'
            f'width:{(r.x1 - r.x0) / pw * 100:.3f}%;height:{(r.y1 - r.y0) / ph * 100:.3f}%"></a>'
        )

    # 3. swap the overlay inside resume.html, leaving the rest of the page alone
    markup = VIEW.read_text(encoding="utf-8")
    new_markup, count = re.subn(
        r'(width="\d+" height="\d+" decoding="async"[^>]*>\n).*?(\n    </div>)',
        lambda m: m.group(1) + "\n".join(rows) + m.group(2),
        markup,
        flags=re.S,
    )
    if count != 1:
        print("could not locate the overlay block in resume.html", file=sys.stderr)
        return 1

    # keep the <img> dimensions honest so the browser reserves the right box
    # ([^>]* preserves attributes after decoding, e.g. fetchpriority="high")
    new_markup = re.sub(r'width="\d+" height="\d+" (decoding="async"[^>]*)',
                        lambda m: f'width="{im.width}" height="{im.height}" {m.group(1)}', new_markup)
    VIEW.write_text(new_markup, encoding="utf-8")
    print(f"{VIEW.name}: {len(rows)} link hotspots")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

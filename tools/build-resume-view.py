#!/usr/bin/env python3
"""Rebuild the résumé page from the PDF: its 1x and 2x images and the link hotspots in resume.html.

Run it whenever the PDF changes:

    pip install pymupdf pillow
    python tools/build-resume-view.py
"""
import html
import pathlib
import re
import shutil
import subprocess
import sys

import pymupdf
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
PDF = ROOT / "Hector_Lugo_III_Resume.pdf"
IMG = ROOT / "img/resume-page1.png"
IMG_2X = ROOT / "img/resume-page1-2x.png"
VIEW = ROOT / "resume.html"
ZOOM = 2.0
PALETTE = 128
NEAR_PT = 10

LABELS = [
    ("linkedin", "LinkedIn profile"),
    ("github.com/Wavy-Hec/MultiCam", "AFRL multi-camera harness on GitHub"),
    ("github.com/Wavy-Hec/VLM", "VLM navigation and memory repo on GitHub"),
    ("github.com/Wavy-Hec/poker-rl", "Poker RL repo on GitHub"),
    ("github.com/Wavy-Hec/drone-search-rescue", "Drone search and rescue repo on GitHub"),
    ("github.com/Wavy-Hec/railway-accident-clustering", "Railway Crossing Accidents code on GitHub"),
    ("github.com/Wavy-Hec", "GitHub profile"),
    ("springer", "Personalized Chemotherapy Dosing paper (Springer)"),
    ("nsf.gov", "Smart Grid Control paper (NSF PAR)"),
    ("scholarworks", "Railway Crossing Accidents paper (UTRGV ScholarWorks)"),
]


def label_for(uri):
    if uri.startswith("mailto:"):
        return "Email " + uri[7:]
    if uri.startswith("tel:"):
        number = uri[4:]
        us = re.fullmatch(r"\+1(\d{3})(\d{3})(\d{4})", number)
        return "Call " + (f"+1 ({us[1]}) {us[2]}-{us[3]}" if us else number)
    for needle, label in LABELS:
        if needle in uri:
            return label
    return uri


def render(page, zoom, path):
    page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom)).save(path)
    image = Image.open(path).convert("RGB")
    image.quantize(colors=PALETTE, method=Image.MEDIANCUT, dither=Image.NONE).save(path, optimize=True)
    if oxipng := shutil.which("oxipng"):
        subprocess.run([oxipng, "-o", "4", "--strip", "safe", str(path)], check=False)
    print(f"{path.name}: {image.width}x{image.height}, {path.stat().st_size:,} bytes")
    return image.size


def neighbours(rects):
    """Mark links that sit right above, below or beside another, so their touch areas do not overlap."""
    marks = [set() for _ in rects]
    for i, a in enumerate(rects):
        for j, b in enumerate(rects):
            if i == j:
                continue
            if a.x0 < b.x1 and b.x0 < a.x1 and 0 <= b.y0 - a.y1 < NEAR_PT:
                marks[i].add("up")
                marks[j].add("down")
            if a.y0 < b.y1 and b.y0 < a.y1 and 0 <= b.x0 - a.x1 < NEAR_PT:
                marks[i].add("lft")
                marks[j].add("rgt")
    return marks


def hotspot(uri, rect, marks, page):
    width, height = page.rect.width, page.rect.height
    left = rect.x0 / width * 100
    top = rect.y0 / height * 100
    w = (rect.x1 - rect.x0) / width * 100
    h = (rect.y1 - rect.y0) / height * 100
    # the upper link of a stacked pair hangs from its bottom edge, so its taller target grows upward
    vertical = f"bottom:{100 - top - h:.3f}%" if "up" in marks else f"top:{top:.3f}%"
    label = html.escape(label_for(uri), quote=True)
    target = ' target="_blank" rel="noopener"' if uri.startswith("http") else ""
    classes = " ".join(["lk", *sorted(marks)])
    return (
        f'        <a class="{classes}" href="{html.escape(uri, quote=True)}"{target} '
        f'title="{label}" aria-label="{label}" '
        f'style="left:{left:.3f}%;{vertical};width:{w:.3f}%;height:{h:.3f}%"></a>'
    )


def main():
    if not PDF.exists():
        print(f"missing {PDF.name}", file=sys.stderr)
        return 1

    page = pymupdf.open(PDF)[0]
    width, height = render(page, ZOOM, IMG)
    render(page, ZOOM * 2, IMG_2X)

    links = [(link["uri"], link["from"]) for link in page.get_links() if link.get("uri")]
    marks = neighbours([rect for _, rect in links])
    rows = [hotspot(uri, rect, marks[i], page) for i, (uri, rect) in enumerate(links)]

    markup = VIEW.read_text(encoding="utf-8")
    markup, count = re.subn(
        r'(<img src="img/resume-page1\.png[^>]*>\n).*?(\n      </div>)',
        lambda m: m.group(1) + "\n".join(rows) + m.group(2),
        markup,
        flags=re.S,
    )
    if count != 1:
        print("could not find the hotspots in resume.html", file=sys.stderr)
        return 1
    markup = re.sub(
        r'(<img src="img/resume-page1\.png[^>]*?) width="\d+" height="\d+"',
        rf'\1 width="{width}" height="{height}"',
        markup,
    )
    VIEW.write_text(markup, encoding="utf-8")
    print(f"{VIEW.name}: {len(rows)} hotspots (bump both images' ?v= if the PNGs changed)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

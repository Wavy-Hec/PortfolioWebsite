#!/usr/bin/env python3
"""Prepare img/about-hike.jpg, the About photograph, in grayscale at the original's full height.

    pip install pillow
    python tools/make-about-photo.py path/to/photo.jpg
"""
import pathlib
import sys

from PIL import Image, ImageEnhance, ImageOps

OUT = pathlib.Path(__file__).resolve().parent.parent / "img/about-hike.jpg"
ASPECT = 528 / 746
LEFT = 0.02


def main():
    photo = ImageOps.exif_transpose(Image.open(sys.argv[1])).convert("L")
    width, height = photo.size
    crop_width = round(height * ASPECT)
    left = round(width * LEFT)
    photo = photo.crop((left, 0, left + crop_width, height))
    photo = ImageOps.autocontrast(photo, cutoff=0.5)
    photo = ImageEnhance.Contrast(photo).enhance(1.08)
    photo.save(OUT, quality=84, optimize=True, progressive=True)
    print(f"{OUT.name}: {photo.width}x{photo.height}, {OUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()

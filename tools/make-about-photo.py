#!/usr/bin/env python3
"""Prepare img/about-hike.jpg, the greyscale photograph that js/sumi-print.js prints as ink.

    pip install pillow
    python tools/make-about-photo.py path/to/photo.jpg
"""
import pathlib
import sys

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

OUT = pathlib.Path(__file__).resolve().parent.parent / "img/about-hike.jpg"
SIZE = (528, 746)
LEFT = 0.02
BLACK, WHITE, GAMMA = 28, 232, 0.9


def levels(value):
    t = min(1.0, max(0.0, (value - BLACK) / (WHITE - BLACK)))
    return round(255 * t**GAMMA)


def main():
    photo = ImageOps.exif_transpose(Image.open(sys.argv[1])).convert("L")
    width, height = photo.size
    crop_width = round(height * SIZE[0] / SIZE[1])
    left = round(width * LEFT)
    photo = photo.crop((left, 0, left + crop_width, height)).resize(SIZE, Image.LANCZOS)
    photo = ImageEnhance.Contrast(photo).enhance(1.25)
    photo = photo.filter(ImageFilter.UnsharpMask(radius=2, percent=110, threshold=2))
    photo.point(levels).save(OUT, quality=72, optimize=True, progressive=True)
    print(f"{OUT.name}: {OUT.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()

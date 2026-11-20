"""Regenerate the image fixtures (implementation plan, test strategy).

Run from the repo root:  python3 -I tests/fixtures/generate.py
Requires Pillow.
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent


def gradient(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = (40 + 120 * x // w, 60 + 120 * y // h, 160)
    return img


# Stored as a 2400×1600 landscape with EXIF Orientation = 6 (rotate 90° CW to display),
# like a phone photo taken in portrait. Displayed size: 1600×2400.
# A red square marks the stored top-left, which must end up at the displayed top-right.
img = gradient(2400, 1600)
ImageDraw.Draw(img).rectangle([0, 0, 299, 299], fill=(255, 0, 0))
exif = Image.Exif()
exif[0x0112] = 6
img.save(OUT / "landscape-exif6.jpg", quality=80, exif=exif.tobytes())

# Portrait PNG, 900×1600: valid and below the downscale limit.
gradient(900, 1600).save(OUT / "portrait.png", optimize=True)

# 300×300: shorter than the 400 px minimum (FR-1.5).
gradient(300, 300).save(OUT / "too-small.png", optimize=True)

# A JPEG signature followed by garbage: must fail to decode.
(OUT / "corrupt.jpg").write_bytes(b"\xff\xd8\xff\xe0" + bytes(range(256)) * 8)

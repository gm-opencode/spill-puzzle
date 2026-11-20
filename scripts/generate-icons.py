"""Generate the PWA icons (FR-5.1). Run from the repo root:

    python3 -I scripts/generate-icons.py

Requires Pillow. Writes public/icons/*.png and public/favicon.svg.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

BG = (30, 31, 36, 255)  # --bg
ACCENT = (124, 156, 255, 255)  # --accent
SS = 4  # supersampling for smooth edges


def piece(draw: ImageDraw.ImageDraw, x: float, y: float, s: float, fill, cut) -> None:
    """A jigsaw piece in the square (x, y, s): tabs up and right, blanks left and down."""
    r = s * 0.16
    draw.rounded_rectangle([x, y, x + s, y + s], radius=s * 0.08, fill=fill)
    draw.ellipse([x + s / 2 - r, y - r * 1.4, x + s / 2 + r, y + r * 0.6], fill=fill)  # top tab
    draw.ellipse([x + s - r * 0.6, y + s / 2 - r, x + s + r * 1.4, y + s / 2 + r], fill=fill)  # right tab
    draw.ellipse([x - r * 0.6, y + s / 2 - r, x + r * 1.4, y + s / 2 + r], fill=cut)  # left blank
    draw.ellipse([x + s / 2 - r, y + s - r * 1.4, x + s / 2 + r, y + s + r * 0.6], fill=cut)  # bottom blank


def icon(size: int, piece_frac: float, rounded: bool) -> Image.Image:
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 0.22, fill=BG)
    else:
        d.rectangle([0, 0, big, big], fill=BG)
    s = big * piece_frac
    # Centre the piece including its tabs (they stick out up and right).
    x = (big - s) / 2 - s * 0.06
    y = (big - s) / 2 + s * 0.06
    piece(d, x, y, s, ACCENT, BG)
    return img.resize((size, size), Image.LANCZOS)


icon(192, 0.52, rounded=True).save(OUT / "icon-192.png", optimize=True)
icon(512, 0.52, rounded=True).save(OUT / "icon-512.png", optimize=True)
# Maskable: full-bleed background, content inside the central 80% safe zone.
icon(512, 0.42, rounded=False).save(OUT / "maskable-512.png", optimize=True)
# iOS ignores transparency and rounds corners itself.
icon(180, 0.5, rounded=False).save(OUT / "apple-touch-icon.png", optimize=True)

(ROOT / "public" / "favicon.svg").write_text(
    """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#1e1f24"/>
  <path fill="#7c9cff" d="M17 21h10a5 5 0 1 1 10 0h10v10a5 5 0 1 1 0 10v10H37a5 5 0 1 0-10 0H17V41a5 5 0 1 0 0-10z"/>
</svg>
"""
)

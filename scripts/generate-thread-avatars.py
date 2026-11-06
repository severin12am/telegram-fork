#!/usr/bin/env python3
"""Paint small portrait JPEGs so the thread fixture uses real photos, not letters."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[1] / "src/lib/forkFeatures/layoutTest/media"
SIZE = 160

PORTRAITS = [
    ("avatar-ilia.jpg", (36, 99, 142), (232, 186, 150), (48, 62, 78)),
    ("avatar-you.jpg", (201, 118, 46), (240, 205, 168), (92, 58, 38)),
    ("avatar-patimat.jpg", (176, 78, 118), (245, 208, 186), (90, 40, 58)),
    ("avatar-maya.jpg", (46, 110, 168), (255, 224, 196), (40, 52, 70)),
    ("avatar-jules.jpg", (62, 122, 86), (210, 168, 128), (40, 48, 42)),
]


def paint(path: Path, bg, skin, shirt) -> None:
    img = Image.new("RGB", (SIZE, SIZE), bg)
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE // 2, SIZE // 2
    draw.ellipse((18, 18, SIZE - 18, SIZE - 18), fill=tuple(min(255, c + 18) for c in bg))
    # shoulders
    draw.ellipse((8, 118, SIZE - 8, SIZE + 70), fill=shirt)
    # head
    draw.ellipse((cx - 42, 28, cx + 42, 112), fill=skin)
    # hair
    hair = tuple(max(0, c - 70) for c in bg)
    draw.pieslice((cx - 44, 22, cx + 44, 90), 180, 360, fill=hair)
    img = img.filter(ImageFilter.SMOOTH)
    img.save(path, "JPEG", quality=88)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, bg, skin, shirt in PORTRAITS:
        paint(OUT / name, bg, skin, shirt)
        print("wrote", name)


if __name__ == "__main__":
    main()

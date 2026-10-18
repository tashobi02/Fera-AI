#!/usr/bin/env python3
"""Build a contact sheet of all 9 storyboard shots for visual QA."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FRAMES = Path(__file__).resolve().parent.parent / "frames"
OUT = Path(__file__).resolve().parent.parent / "build" / "storyboard-contact-sheet.png"

shots = sorted(FRAMES.glob("shot-*.png"))
assert len(shots) == 9, f"expected 9 shot samples, got {len(shots)}"

# 3x3 grid, each cell 640x360 (downscaled from 1280x720)
cell_w, cell_h = 640, 360
cols = 3
rows = 3
gap = 8
label_h = 22
sheet_w = cols * cell_w + (cols + 1) * gap
sheet_h = rows * (cell_h + label_h) + (rows + 1) * gap

img = Image.new("RGB", (sheet_w, sheet_h), (7, 8, 10))
draw = ImageDraw.Draw(img)

font = ImageFont.truetype(
    "/usr/share/fonts/liberation/LiberationSans-Bold.ttf", 14)

for i, shot_path in enumerate(shots):
    row = i // cols
    col = i % cols
    x = gap + col * (cell_w + gap)
    y = gap + row * (cell_h + label_h + gap)
    shot = Image.open(shot_path).convert("RGB")
    shot_small = shot.resize((cell_w, cell_h), Image.LANCZOS)
    img.paste(shot_small, (x, y + label_h))
    draw.text((x + 4, y + 2), shot_path.name, font=font, fill=(244, 244, 246))
    draw.rectangle([(x, y), (x + cell_w, y + cell_h + label_h)],
                   outline=(36, 39, 40), width=1)

img.save(OUT, "PNG", optimize=True)
print("wrote", OUT)
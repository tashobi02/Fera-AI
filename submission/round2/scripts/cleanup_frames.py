#!/usr/bin/env python3
"""Drop intermediate frame_*.png files; keep only the named shot samples."""
from pathlib import Path

FRAME_DIR = Path(__file__).resolve().parent.parent / "frames"
KEEP = {f"shot-0{i}.png" for i in range(1, 10)}

removed = 0
for f in FRAME_DIR.glob("frame_*.png"):
    f.unlink()
    removed += 1
print(f"removed {removed} intermediate frames")
for f in sorted(FRAME_DIR.glob("*.png")):
    print("kept", f.name, f.stat().st_size, "bytes")
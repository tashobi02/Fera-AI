#!/usr/bin/env python3
"""Master build script for the Round 2 submission pack.

Rebuilds the deck, the PDF, the storyboard MP4, the contact sheet and
the slide images, then runs the claims check. Stops on the first
failure with a non-zero exit code so the coordinator can spot it.

Usage:
  python3 scripts/build.py
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"

# Run from the round2 directory so relative paths in helpers work.
WORKDIR = ROOT


def run(label: str, cmd: list[str]) -> None:
    print(f"\n=== {label} ===")
    print(" ".join(cmd))
    res = subprocess.run(cmd, cwd=WORKDIR, check=False)
    if res.returncode != 0:
        sys.exit(f"FAIL: {label} exited {res.returncode}")


def need(name: str) -> str:
    path = shutil.which(name)
    if not path:
        sys.exit(f"missing required tool: {name}")
    return path


def main() -> None:
    need("python3")
    need("libreoffice")
    need("ffmpeg")
    need("ffprobe")

    run("build_pptx", ["python3", str(SCRIPTS / "build_pptx.py")])
    run("libreoffice -> pdf",
        ["libreoffice", "--headless", "--convert-to", "pdf",
         "fera-round2-deck.pptx", "--outdir", "."])
    run("build_video", ["python3", str(SCRIPTS / "build_video.py")])
    run("cleanup_frames", ["python3", str(SCRIPTS / "cleanup_frames.py")])
    run("build_contact_sheet",
        ["python3", str(SCRIPTS / "build_contact_sheet.py")])
    # PDF page images for visual QA (no live viewer assumed).
    slide_imgs = ROOT / "build" / "slide-imgs"
    slide_imgs.mkdir(parents=True, exist_ok=True)
    for old in slide_imgs.glob("slide-*.png"):
        old.unlink()
    run("pdftoppm -> slide images",
        ["pdftoppm", "-png", "-r", "80",
         "fera-round2-deck.pdf",
         str(slide_imgs / "slide")])
    run("claims_check", ["python3", str(SCRIPTS / "claims_check.py")])

    # Final inventory
    print("\n=== final inventory ===")
    for f in sorted(ROOT.iterdir()):
        if f.is_file():
            print(f"  {f.name:48s} {f.stat().st_size:>10d} bytes")
    for d in ("frames", "build", "scripts"):
        sub = ROOT / d
        if sub.exists():
            print(f"\n  -- {d}/ --")
            for f in sorted(sub.iterdir()):
                if f.is_file():
                    print(f"  {d}/{f.name:42s} {f.stat().st_size:>10d} bytes")
    print("\nbuild.py OK")


if __name__ == "__main__":
    main()
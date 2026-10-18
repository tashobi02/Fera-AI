#!/usr/bin/env python3
"""Replace em dashes and middle-dot bullets with safe ASCII in build_video.py."""
from pathlib import Path

P = Path(__file__).resolve().parent / "build_video.py"
s = P.read_text(encoding="utf-8")
n_em = s.count("—")
n_mid = s.count("·")
n_ar = s.count("→")
n_en = s.count("–")
s = s.replace("—", " - ")
s = s.replace("·", " * ")
s = s.replace("→", "->")
s = s.replace("–", "-")
P.write_text(s, encoding="utf-8")
print(f"em dashes replaced: {n_em}")
print(f"middle dots replaced: {n_mid}")
print(f"arrows replaced: {n_ar}")
print(f"en dashes replaced: {n_en}")
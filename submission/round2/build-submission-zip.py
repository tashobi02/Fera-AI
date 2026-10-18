#!/usr/bin/env python3
"""Build a deterministic, explicitly allowlisted local draft archive. No upload."""
from pathlib import Path
import hashlib
import zipfile

PACK = Path(__file__).resolve().parent
DEMO = PACK.parent / "demo"
OUTPUT = PACK / "fera-round2-draft.zip"
FILES = [
    ("fera-round2-deck.pptx", PACK / "fera-round2-deck.pptx"),
    ("fera-round2-deck.pdf", PACK / "fera-round2-deck.pdf"),
    ("final.mp4", DEMO / "final.mp4"),
    ("captions.srt", DEMO / "captions.srt"),
    ("links.txt", PACK / "links.txt"),
    ("selection-email-draft.md", PACK / "selection-email-draft.md"),
    ("README.md", PACK / "README.md"),
    ("metrics.md", PACK / "metrics.md"),
]
NOTE = b"""Round 2 DRAFT PREPARATION; not uploaded or submitted.
Deck, PDF and actual local synthetic demo are at the archive root.
Repository README links/build commands refer to the full source checkout;
the separate storyboard and capture/build sources are available there.
The demo is typed, captioned, [MOCK] officer verification, timing edited.
Referral recorded (simulation). Release quality is not measured.
Drive, organiser instructions, private repository access, production and
human acceptance remain unresolved. selection-email-draft.md is not sent.
"""

def entry(name, data):
    info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = 0o644 << 16
    return info, data

def main():
    # Read every input before opening output; no globs or recursive inclusion.
    items = [entry("ARCHIVE_README.txt", NOTE)]
    items += [entry(name, source.read_bytes()) for name, source in FILES]
    with zipfile.ZipFile(OUTPUT, "w") as archive:
        for info, data in items:
            archive.writestr(info, data)
    with zipfile.ZipFile(OUTPUT) as archive:
        bad = archive.testzip()
        if bad is not None:
            raise RuntimeError("Corrupt ZIP entry: " + bad)
    print(f"{OUTPUT.name}: {len(items)} entries, {OUTPUT.stat().st_size} bytes; self-test PASS")
    print("SHA256 " + hashlib.sha256(OUTPUT.read_bytes()).hexdigest())

if __name__ == "__main__":
    main()

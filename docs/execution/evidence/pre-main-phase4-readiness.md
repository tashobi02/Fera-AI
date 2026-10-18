# Round 2 release readiness — Obidit offline release-check

Generated: 2026-10-18T13:54:05.372Z
Repo root: /home/obidit/secondBrain/coding/Fera-AI/.worktrees/pre-main-phase4-release
Exit code from runChecks: 2

Honest-readiness policy:
- A check is PASS only when a real local artefact or loopback fixture satisfied it.
- External http(s) URLs are UNVERIFIED, never silently PASS, because the script never opens a TCP connection.
- A missing local file is FAIL, not a soft warning.
- EXCLUDED labels are not a check; they describe user-excluded media and the lead records organiser evidence separately.

## Manifest

| File | Status | Detail |
|---|---|---|
| `fera-round2-deck.pptx` | PASS | 53607 bytes, sha256=72c7f31eec1b… |
| `fera-round2-deck.pdf` | PASS | 233366 bytes, sha256=9cb381a6872a… |
| `final.mp4` | PASS | 864854 bytes, sha256=1403d679c454… |
| `captions.srt` | PASS | 1399 bytes, sha256=bd70f03e6d3b… |
| `links.txt` | PASS | 6931 bytes, sha256=d0e9fc06792b… |
| `selection-email-draft.md` | PASS | 1375 bytes, sha256=b9296111c5b6… |
| `README.md` | PASS | 9133 bytes, sha256=36c873bba534… |
| `metrics.md` | PASS | 5592 bytes, sha256=866c0b2dff32… |
| `allowlist-size` | PASS | 8/8 entries prepared |

## Link check

| Reference | Status | Detail |
|---|---|---|
| `url:https://github.com/tashobi02/Fera-AI` | UNVERIFIED | external URL not contacted; offline check only |
| `path:../demo/final.mp4` | PASS | exists |
| `path:../demo/captions.srt` | PASS | exists |
| `path:../demo/provenance.json` | PASS | exists |
| `path:../demo/proof/` | PASS | exists |
| `path:../demo/README.md` | PASS | exists |
| `path:build/storyboard-contact-sheet.png` | PASS | exists |
| `path:scripts/build_pptx.py` | PASS | exists |
| `path:scripts/build_video.py` | PASS | exists |
| `path:scripts/cleanup_frames.py` | PASS | exists |
| `path:scripts/build_contact_sheet.py` | PASS | exists |
| `path:scripts/claims_check.py` | PASS | exists |
| `path:scripts/replace_dashes.py` | PASS | exists |
| `path:../demo/run.sh` | PASS | exists |
| `path:frames/shot-01.png` | PASS | exists |
| `path:build/slide-imgs/slide-1.png` | PASS | exists |

## Excluded media (label only, no check)

- **submission PPTX/PDF (Round 2 deck)** — EXCLUDED: User excluded video/PPT submission artifacts from this cycle; deck files in submission/round2/ are local preparation only.
- **submission MP4 (Round 2 video)** — EXCLUDED: User excluded video/PPT submission artifacts from this cycle; local recording at submission/demo/final.mp4 is preserved but not dispatched.

## Open human / external blockers (UNCHANGED from PHASE_4_SUBMISSION.md)

- H-9: organiser cutoff, channel, formats, recipient, subject (UNKNOWN).
- Drive folder: UNKNOWN; no signed-in or logged-out readback available in this offline worker.
- Repository visibility: PRIVATE; logged-out public readback is owner-decision territory, not an agent's.
- Production / deployment / managed DB access: UNKNOWN (READY-12).
- Frozen held-out manifest, WER, latency, spend, dedupe precision: not measured.
- Round 2 submission status: NOT submitted (user-confirmed 18 Oct 2026).

This file is the offline worker's readiness artefact. The lead (Mahim) records the formal G5 decision in `docs/gates/G5-*.md`; the script never marks G5 PASS.

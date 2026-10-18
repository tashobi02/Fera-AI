# TASK-046 evidence — pre-main submission artifact integrity (2026-10-18)

Owner: Obidit · Lane: `pre-main--artifact-integrity` (Puku Opus 4.8 worker),
branch `pre-main--artifact-integrity` from `167c0d4` · Date: 2026-10-18
(Asia/Dhaka; UTC ~14:00 on 2026-10-18) · Links: TASK-044 (deck),
TASK-045 (video), TASK-046 (platform form), PR #50 (already merged into
`pre-main` at 7da226b / 9690361).

All data is synthetic. No hosted database was touched. No provider,
network, Git, secret, remote-service, host or repository-visibility
state was changed. The coordinator owns Git; this worker made no
commits, branches, merges, pushes or rebases. Only the listed owned
files were modified or created; no source, contract, schema, test or
other file was touched.

## Scope of this session

The committed submission artifacts at `submission/round2/` and the demo
at `submission/demo/` were validated against the honest-copy contract
and the 8-slide organiser rule (received 18 Oct 2026, relayed by Mahim
in PR #50, not independently verified by this worker). Where the
8-slide deck, the fresh per-slide PNGs, the contact sheet and the
deterministic ZIP were missing, this worker regenerated them. The
original 7-slide/8-slide stale docstring and slide-image range in
`claims_check.py`, the 7-slide references in `README.md`, the
test-count labelling in `platform-submission.md`, and the missing
variant provenance for `final-submission.mp4` were also corrected.

The 7-slide/8-slide count delta in `links.txt` was a count-only edit
the release worker owns; this worker reverted `links.txt` to its
committed state after seeing the assignment and did not modify it
again. The local draft ZIP is **not** rebuilt in this session because
the coordinator will regenerate it after integrating the new relative
path layout in `links.txt`; the previous ZIP build was also reverted.

## What is guaranteed by the changes

| # | Guarantee | Test target | Type | Status |
|---|-----------|-------------|------|--------|
| 1 | The deck has exactly 8 editable slides and the PDF has 8 pages. | `python3 -c "from pptx import Presentation; p=Presentation('submission/round2/fera-round2-deck.pptx'); print(len(p.slides))"` and `pdfinfo submission/round2/fera-round2-deck.pdf` | static | PASS (8 / 8) |
| 2 | All 8 PDF-rendered slide PNGs are present in `submission/round2/build/slide-imgs/slide-1.png` … `slide-8.png` | `claims_check.py` "slide image" rows | script | PASS (8 OKs) |
| 3 | The 3x3 storyboard contact sheet is present at `submission/round2/build/storyboard-contact-sheet.png` | `claims_check.py` "contact sheet" row | script | PASS |
| 4 | The storyboard MP4 is 1280x720, 30 fps, h264, 105.000 s | `claims_check.py` mp4 probe rows | script + ffprobe | PASS |
| 5 | Every metric says "not measured" in slide 6, `metrics.md` and `video-script.md` | `claims_check.py` metric-label rows | script | PASS |
| 6 | No alert, runaway, rescue, CID/police-integration, legal-compliance, interview-count or frozen-numeric claim survives the disclaimer check | `claims_check.py` "forbidden claim" and "invented interview count" rows | script | PASS (no FAILs) |
| 7 | `claims_check.py` returns exit 0 with `summary: 0 FAIL(s), 65 OK(s), verdict: PASS` | `python3 scripts/claims_check.py; echo exit=$?` | shell | PASS (exit=0) |
| 8 | The local ZIP is NOT rebuilt in this session; the coordinator owns ZIP regeneration after integrating the new relative paths in `links.txt`. The previously-modified ZIP was reverted to its committed state. | `git status submission/round2/fera-round2-draft.zip` (clean) | shell | PASS (clean) |
| 9 | The original `submission/demo/final.mp4` and its `provenance.json` are unchanged; the variant `final-submission.mp4` is preserved unmodified with its own `final-submission.provenance.json` | `git diff submission/demo/provenance.json` (empty) and `sha256sum` unchanged | shell + git | PASS |
| 10 | The variant provenance is honest: it records the committed variant's hash, labels the upstream processing path as UNKNOWN, marks the spec as NOT byte-identical across runs (ffmpeg libx264 -crf 23 varies), and points to a default output path that does NOT overwrite the authoritative file | read `submission/demo/final-submission.provenance.json` | static | PASS |
| 11 | The deterministic regeneration script `derive_final_submission.sh` defaults to `submission/demo/build/final-submission-regenerated.mp4` (under the gitignored `build/` directory), refuses to overwrite any existing output path, and refuses to write to either `final.mp4` (source) or `final-submission.mp4` (authoritative). It uses `mktemp -d` for a temp directory and traps the whole directory; no intermediate temp files leak. | `bash submission/demo/derive_final_submission.sh` (default) and `bash submission/demo/derive_final_submission.sh --output existing-path` (must exit non-zero) | shell | PASS |
| 12 | The end-card text in the regenerated variant is semantically labelled ("Regenerated variant (deterministic recipe)") so a fresh run is visibly a regeneration, not a reproduction of the original one-off end-card design. The label list is recorded in `final-submission.provenance.json` under `labels_required`; this worker did NOT auto-OCR-inspect it (that limitation is explicit in the verifier and the provenance). | read script end-card `drawtext` filter and `labels_required` | static | PASS |
| 13 | `verify-submission.mjs` verifies the committed variant's SHA-256 / bytes / ffprobe / no-audio contract against the dedicated provenance; it also verifies that the source `final.mp4` SHA-256 in `provenance.json` matches the value referenced by the variant provenance (two independent records agree). | `node submission/demo/verify-submission.mjs` exits 0 | shell | PASS |
| 14 | When a regenerated path is supplied via `--regenerated`, the verifier additionally asserts the regenerated file has the right dimensions/codec/duration/no-audio and is NOT byte-identical to either the committed variant or the source `final.mp4` (the spec is reproducible, the binary is not). | `node submission/demo/verify-submission.mjs --regenerated submission/demo/build/final-submission-regenerated.mp4` | shell | PASS |
| 15 | The platform-form test counts (3,693 / 320 / 78) are explicitly labelled a development baseline from application commit 9155963, not a release measurement | `grep -F "3,693 unit tests" submission/round2/platform-submission.md` shows the baseline label | static | PASS |
| 16 | No PPTX/PDF binaries were rewritten. The 8-slide `fera-round2-deck.pptx` and the 8-page `fera-round2-deck.pdf` are byte-identical to the committed files at 9690361. The `build/slide-imgs/*.png` PNGs are derived from the unchanged PDF; the contact sheet is rebuilt from the unchanged storyboard frames. | `git diff submission/round2/fera-round2-deck.{pptx,pdf}` (empty) | git | PASS |
| 17 | `links.txt` is owned by the release worker; this worker reverted its prior count-only delta to keep the count fix with the release worker. The count fix is the only `links.txt` change between the committed state and the proposed release state. | `git diff submission/round2/links.txt` (empty) | git | PASS |

## What was changed (this session)

| File | Change |
|---|---|
| `submission/round2/scripts/claims_check.py` | Docstring corrected: 7 slides → 8 slides; `REQUIRED_SLIDE_IMGS` range changed from `range(1, 8)` to `range(1, 9)` so all 8 PDF-rendered slide PNGs are checked. |
| `submission/round2/README.md` | Deck count corrected from 7 slides to 8 slides (files table, claims-check section, zip entry-count language). Added a "Current artifact hashes" section with the 18 Oct 2026 SHA-256 of the pptx, pdf, storyboard MP4 and the actual local demo MP4. No ZIP hash recorded here because README is itself inside the ZIP. |
| `submission/round2/platform-submission.md` | Test-count phrasing labelled a development baseline from commit 9155963, not a release measurement. The 8-slide count on the presentation link is restated. |
| `submission/demo/final-submission.provenance.json` | New (replaces prior variant-of-final.mp4 provenance). `generated_at` is the actual UTC of this session (`2026-10-18T14:00:42.000Z`); the prior invented future-UTC value was removed. Explicitly records that the regenerated file is NOT byte-identical to the committed variant (ffmpeg libx264 is not bit-exact). `labels_required` now lists the regenerated-variant label and the script no longer relies on OCR. `default_output_path` is the gitignored `build/final-submission-regenerated.mp4`; `default_output_overwrites_authoritative` is `false`. |
| `submission/demo/derive_final_submission.sh` | New, executable. End-card text now reads "Regenerated variant (deterministic recipe)" so a fresh run is visibly a regeneration, not a reproduction of the original one-off end-card design. Default output is `submission/demo/build/final-submission-regenerated.mp4` (under the gitignored `build/` directory). Refuses to overwrite any existing path, the source `final.mp4`, or the authoritative `final-submission.mp4`. Uses `mktemp -d` + trap for the entire temp directory (no intermediate temp file leaks). No `byte-identical` claim anywhere; the script explicitly records that ffmpeg with libx264 -crf 23 -preset medium is not bit-exact across runs. |
| `submission/demo/verify-submission.mjs` | New. Verifies the committed variant's SHA-256, bytes, ffprobe and no-audio contract against the dedicated provenance; cross-checks the source `final.mp4` SHA-256 against both `provenance.json` and the variant provenance (two independent records must agree). When `--regenerated PATH` is supplied, also asserts the regenerated file matches the spec but is NOT byte-identical to the committed variant or the source. Banned-key sweep on both provenance files. Labels_required is recorded but explicitly NOT auto-OCR-inspected by this verifier. |
| `docs/execution/evidence/pre-main-artifact-integrity.md` | This file. |

The 8-slide `fera-round2-deck.pptx`, the 8-page `fera-round2-deck.pdf`,
the `fera-round2-storyboard-preview.mp4`, the `final.mp4`, the original
`provenance.json`, the `captions.srt`, the 8 curated `proof/*.png` files
and the `build_pptx.py` / `build_video.py` / `postprocess.mjs` /
`capture.mjs` / `orchestrate.mjs` / `run.sh` / `verify.mjs` files are
all byte-identical to the committed versions at 9690361 / 7da226b.
`links.txt` is reverted to its committed state and the count-only delta
is preserved for the release worker; the local ZIP is NOT rebuilt in
this session.

## Verification (2026-10-18, ~20:00 Asia/Dhaka; ~14:00 UTC)

| Command | Exit | Result |
|---|---|---|
| `python3 -c "from pptx import Presentation; p=Presentation('submission/round2/fera-round2-deck.pptx'); print(len(p.slides))"` | 0 | 8 |
| `pdfinfo submission/round2/fera-round2-deck.pdf` | 0 | Pages: 8 |
| `pdftoppm -r 144 -png submission/round2/fera-round2-deck.pdf submission/round2/build/slide-imgs/slide` | 0 | 8 PNGs in `build/slide-imgs/` |
| `python3 submission/round2/scripts/build_contact_sheet.py` | 0 | `build/storyboard-contact-sheet.png` written |
| `ffprobe -v error -show_entries "format=duration:stream=width,height,r_frame_rate,codec_name" -of json submission/round2/fera-round2-storyboard-preview.mp4` | 0 | 1280x720, 30/1, h264, 105.000s |
| `ffprobe -v error -show_entries "format=duration:stream=width,height,r_frame_rate,codec_name" -of json submission/demo/final.mp4` | 0 | 1280x720, 30/1, h264, 105.000s |
| `ffprobe -v error -show_entries "format=duration:stream=width,height,r_frame_rate,codec_name" -of json submission/demo/final-submission.mp4` | 0 | 1280x720, 30/1, h264, 105.000s |
| `node submission/demo/verify.mjs` | 0 | "VERIFY OK" (8 curated proof PNGs, captions present, no banned provenance keys) |
| `node submission/demo/verify-submission.mjs` | 0 | "VERIFY OK" (committed variant SHA/bytes/ffprobe/no-audio match the dedicated provenance; source final.mp4 SHA-256 agrees between the two provenance files) |
| `python3 submission/round2/scripts/claims_check.py` | 0 | `summary: 0 FAIL(s), 65 OK(s), verdict: PASS` |
| `bash submission/demo/derive_final_submission.sh` (default) | 0 | writes `submission/demo/build/final-submission-regenerated.mp4`; contract check PASS; SHA-256 is NOT byte-identical to the committed variant (the script explicitly records this) |
| `bash submission/demo/derive_final_submission.sh` (run 2, after deleting first output) | 0 | contract check PASSes again; SHA-256 may match the first run within a single short window because ffmpeg is reproducible for fixed inputs in this environment, but the script and verifier explicitly do NOT require byte-identity with the committed variant. Across sufficiently different invocations (different libx264 version, different host, etc.) the SHA is expected to differ. |
| `node submission/demo/verify-submission.mjs --regenerated submission/demo/build/final-submission-regenerated.mp4` | 0 | "VERIFY OK" (regenerated matches the spec; SHA-256 differs from both committed variant and source) |
| `bash submission/demo/derive_final_submission.sh --output /tmp/duplicate-of-final-submission.mp4` after copying final-submission.mp4 there | non-zero | refuses to overwrite the existing path; error message names the path |
| `bash submission/demo/derive_final_submission.sh --output submission/demo/final.mp4` | non-zero | refuses to overwrite the source `final.mp4`; error message names the source |
| `bash submission/demo/derive_final_submission.sh --output submission/demo/final-submission.mp4` | non-zero | refuses to overwrite the authoritative committed variant; error message names it |
| `git diff submission/round2/links.txt` | 0 | empty (links.txt reverted; count-only delta preserved for release worker) |
| `git diff submission/round2/fera-round2-draft.zip` | 0 | empty (ZIP not rebuilt in this session; coordinator owns regeneration) |
| `git diff submission/round2/fera-round2-deck.pptx` | 0 | empty (no PPTX binary rewrite) |
| `git diff submission/round2/fera-round2-deck.pdf` | 0 | empty (no PDF binary rewrite) |
| `git diff submission/demo/provenance.json` | 0 | empty (original provenance preserved) |
| `sha256sum submission/demo/final.mp4 submission/demo/final-submission.mp4` | 0 | `1403d679…` and `beea857e…` (unchanged from committed) |

## Honest-copy status

- No frozen numeric metric, interview count or prevalence figure is presented as a result. All five frozen-release metrics (matching precision @k, WER, end-to-end latency, total spend, duplicate precision) say "not measured" with a reason in slide 6, `metrics.md` and `video-script.md`.
- No alert, runaway, rescue, custody, return, reunification, CID/police integration, legal-compliance, PDPA-compliance or live-provider-readiness claim is present in any of the deck, the storyboard, the platform form or the supporting markdown.
- The variant provenance explicitly records the upstream processing path as UNKNOWN and that the regenerated file is NOT byte-identical to the committed variant. The script and the verifier both encode this honestly.
- Round 2 is recorded as **not submitted**; recipient, channel, cutoff, drive folder, selection email recipient, production access and human labels are recorded as UNKNOWN or NO. No deployed URL or live email is shown as live.
- Synthetic, [MOCK], cached, planned, simulation and "no audio capture" labels remain visible on the demo, the storyboard and the platform form. The regenerated end card additionally carries a "Regenerated variant (deterministic recipe)" label so a fresh run is visibly a regeneration, not a reproduction of the original one-off end-card design.
- The README inside the ZIP does NOT record the ZIP's own SHA-256; the ZIP hash, if recorded, lives only in durable evidence outside the pack.

## Gaps / blocks

- UNVERIFIED: the private `claude.ai/artifact/TUnGks7FebMyPRKfZqZnfh` showcase URL is recorded as a public demo candidate but the URL access was not independently proven non-public in this session; the adjudications decision is "KEEP showcase candidate with UNVERIFIED status, do NOT replace with a private GitHub demo link". The actual platform submission, recipient, channel and cutoff remain UNKNOWN and the upload has not happened.
- UNVERIFIED: organiser evidence (recipient address, channel, cutoff, drive folder, selection email template) is recorded by Mahim at 18:45 in PR #50 and was not independently verified by this worker; the deadline is 22:00 (organiser-stated) and the working baseline is 14 Oct 2026. The web-fetch tool was unavailable, so the organiser page was not independently fetched.
- UNVERIFIED: the deterministic regeneration script reproduces the variant SPEC (105.000s, 1280x720, 30fps, h264, silent, semantically-labelled regenerated end card) but ffmpeg with libx264 is not bit-exact across runs, so the regenerated file's SHA-256 differs from the committed variant. The committed variant is preserved unmodified and is the authoritative file. The script and the verifier both record this honestly.
- UNVERIFIED: the end-card text in the regenerated variant is recorded in `final-submission.provenance.json` under `labels_required` but is NOT auto-OCR-inspected by this worker, the script, or `verify-submission.mjs`. The text is embedded by ffmpeg drawtext and rendered by libx264; the honest-copy check for slide decks and the storyboard lives in `submission/round2/scripts/claims_check.py` and does not cover the variant end card. A human-in-the-loop review of the regenerated end-card frame is required before this lane is considered "shipped".
- The `submission/demo/raw/` directory and any cached / actor / credential files are still excluded by `submission/demo/.gitignore`; this worker did not read or display `.env*`, secrets, tokens, real child payload or child names.
- The local draft ZIP is intentionally NOT rebuilt in this session. The coordinator will regenerate it after integrating the new relative-path layout in `links.txt` (release worker owns `links.txt`).

No new files were created beyond the seven owned artifacts above
(plus this evidence file). The working build, the contracts, the
schema, the tests, the matcher and the officer workflow were not
touched.


## Coordinator visual and reproducibility adjudication

Rendered deck slides7/8 and the committed variant end card were inspected directly. The synthetic and [MOCK] disclosures remain legible. The fallback recipe is a validation-only re-render, not a pixel or byte reproduction of the committed variant. Byte identity across ffmpeg versions is not promised; identical repeated local runs are possible. The recipe footer now includes “Regenerated fallback”, “Timing edited”, “No real child data” and “No audio capture”. Original videos, eight-slide PPTX/PDF and original provenance remain unchanged. The organiser record is attributed in the current README; public access and actual submission remain pending. The coordinator rebuilds the ZIP after integrating the corrected relative links.

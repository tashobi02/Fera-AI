# Round 2 submission pack — DRAFT PREPARATION (with TASK-045 local-app demo)

This directory is a draft submission pack for Round 2. It contains
the deck, the video storyboard, the supporting markdown, the build
scripts and a claims check. **It is DRAFT PREPARATION only.** The
Pptx, PDF and storyboard MP4 are drafts.

The **actual** TASK-045 local-app demo footage is now prepared and
verified separately under `../demo/`:

- `submission/demo/final.mp4` — 105.000 s, 1280x720, H.264, silent,
  on-screen-captioned Playwright/Chromium recording of the real Next
  app on `127.0.0.1`.
- `submission/demo/captions.srt` — beat-level caption manifest
  generated from the actual capture timings.
- `submission/demo/provenance.json` — git SHA, beat names,
  SHA-256 hashes.
- `submission/demo/proof/` — 8 curated per-beat PNGs.

The storyboard MP4 in this directory (`fera-round2-storyboard-preview.mp4`)
is **not** app footage; it is a synthetic on-screen-caption storyboard
illustrating the intended journey. Both are honest copy and neither
hides the distinction.

Round 2 production, gate clearance, upload and submission remain
blocked until the working build is signed off and organiser evidence
is recorded.

Every artifact in this pack is honest copy. No alert, runaway,
rescue, CID/police-integration or legal-compliance claim is made
anywhere. No frozen numeric metric is presented as a result.
Synthetic, `[MOCK]`, cached and simulation labels are never hidden.

## Files

| File | Purpose | Status |
|---|---|---|
| `fera-round2-deck.pptx` | 8-slide editable deck (Cockpit & Paper) | draft |
| `fera-round2-deck.pdf`  | LibreOffice render of the deck | draft |
| `fera-round2-storyboard-preview.mp4` | 1280x720, 30 fps, 105 s synthetic storyboard; **not** a recording of the running app | draft |
| `frames/shot-01.png` ... `shot-09.png` | one sample frame per storyboard shot | QA |
| `build/storyboard-contact-sheet.png` | 3x3 visual QA contact sheet | QA |
| `build/slide-imgs/slide-1.png` ... `slide-8.png` | PDF-rendered slide images | QA |
| `video-script.md` | shot list, source citations, capture plan for the real TASK-045 build | source |
| `metrics.md` | frozen-release metric table; every metric says "not measured" with reason | source |
| `links.txt` | UNKNOWN placeholders for org/email/drive, plus this pack's manifest | source |
| `selection-email-draft.md` | editable selection-email reply DRAFT (placeholders only; not yet dispatched) | source |
| `scripts/build_pptx.py` | rebuild the deck | script |
| `scripts/build_video.py` | rebuild the storyboard and MP4 | script |
| `scripts/build_contact_sheet.py` | rebuild the visual QA sheet | script |
| `scripts/cleanup_frames.py` | drop intermediate frame_*.png | script |
| `scripts/claims_check.py` | assert honest-copy rules | gate |
| `scripts/replace_dashes.py` | one-time ASCII helper used during dev | helper |
| `claims-check-report.txt` | output of `scripts/claims_check.py` | gate |

The TASK-045 actual app-footage demo lives one level up at
`../demo/` (commit `9155963`, CI run `39114757484`):

| File | Purpose |
|---|---|
| `submission/demo/final.mp4` | 105.000 s, 1280x720, H.264, silent, captioned; Playwright/Chromium recording of the real Next app on `127.0.0.1` |
| `submission/demo/captions.srt` | beat-level SRT, scaled from the raw capture timings |
| `submission/demo/provenance.json` | git SHA, beat names, SHA-256 hashes |
| `submission/demo/proof/` | 8 curated per-beat PNGs |

The demo is the real local-app capture; the storyboard MP4 in this
folder is a synthetic on-screen-caption storyboard. The two are kept
separate so reviewers can tell which is which.

The reviewed slide PNGs and storyboard contact sheet are retained in Git under `build/` so the local claims and release checks also work in a fresh checkout. Regenerate them after changing the deck PDF.

## Reproducible build

The pack builds with `python-pptx`, `Pillow`, `ffmpeg`, `ffprobe` and
LibreOffice and Poppler (`pdftoppm`). No new package dependencies are added to the repo.

```bash
# from this directory (submission/round2/)
python3 scripts/build_pptx.py
libreoffice --headless --convert-to pdf fera-round2-deck.pptx --outdir .
python3 scripts/build_video.py
python3 scripts/cleanup_frames.py
python3 scripts/build_contact_sheet.py
mkdir -p build/slide-imgs
pdftoppm -png -r 90 fera-round2-deck.pdf build/slide-imgs/slide

# verify honest copy before any human review
python3 scripts/claims_check.py
```

`ffprobe` is used to print width, height, frame rate, codec and
duration after the MP4 is encoded. Expected output:

```
codec_name=h264
width=1280
height=720
r_frame_rate=30/1
duration=105.000000
```

## What the deck says (slide by slide)

1. **Title slide.** Honest labels in pills: "Synthetic only", "[MOCK]
   officer verification", "Referral recorded (simulation)", "Draft
   outputs only". Working baseline 14 Oct 2026; organiser cutoff
   UNKNOWN.
2. **What Fera is.** Two-column: "Coordinates" / "Does not". No alert,
   no auto-confirm, no custody transfer.
3. **Intake.** Five-step flow: Start, Speak or type, Follow-up,
   Review, Confirm and submit. PCM WAV only, WebM not supported,
   cached extraction `[MOCK]`, server-side draft metadata only.
4. **Outputs.** Three cards: GD draft text, Poster preview, 13219
   summary. Every card labelled a draft. Fera does not file, post or
   place a call.
5. **Officer review.** Side-by-side flow. Score labelled
   "similarity, not identity". One-transaction confirm; void
   competitors; append-only audit.
6. **Evaluation.** All five frozen-release metrics say "pending" with
   a reason. Closing strip: "Every metric will show its denominator
   and failures, or say 'not measured' (BR-026, Principle VI)".
7. **Limitations and next steps.** Synthetic-only restriction, no
   real records or coordinates, no live voice codec beyond PCM WAV,
   no deployed URL. Open items: TASK-043 frozen held-out run, OQ-011
   PDPA, OQ-018 referral agency, organiser evidence.

## What the storyboard says (shot by shot)

| Shot | Length | Subject | Source |
|---|---|---|---|
| 01 | 12 s | S-001 / S-002 intake (consent + cached extraction) | D3 SCREEN-001/002 |
| 02 |  8 s | S-003 review cards with source spans | D3 SCREEN-003 |
| 03 | 10 s | S-004 draft outputs | D3 SCREEN-004 |
| 04 | 12 s | S-007 found-child log | D3 SCREEN-007 |
| 05 | 18 s | S-009 / S-010 side-by-side review | D3 SCREEN-009/010 |
| 06 | 15 s | Closure, three counters, append-only audit | D3 SCREEN-011/012 |
| 07 | 13 s | Evaluation (pending metrics) | Principle VI; BR-026 |
| 08 | 12 s | Limitations and next steps | D7 §4; AMD-4-1 |
| 09 |  5 s | Submission status: DRAFT PREPARATION | PHASE_4_SUBMISSION.md |

Every frame carries the banner
`SYNTHETIC STORYBOARD PREVIEW  -  NOT APP FOOTAGE`.

## Honest-copy rules enforced by `claims_check.py`

- No frozen numeric metric is presented as a result. Every metric in
  the deck and the storyboard is a "pending" status with a reason.
- No alert, runaway, rescue, CID/police integration or
  legal-compliance claim anywhere in the pack.
- No prevalence figure copied from D7 (no January-July totals, no
  interview counts, no "X children" sentence).
- No deployed URL or live email shown as live. Drive folder and
  selection-email cutoff are explicitly `UNKNOWN`.
- Synthetic, `[MOCK]`, cached, planned and simulation labels are
  present in the deck, the storyboard and the script.
- The storyboard MP4 file is present, 1280x720, 30 fps, 105 s.
- The deck has 8 slides (organiser rule: at most 8).
- The storyboard has 9 sampled frames.

The claims check verifies presence/absence of the patterns above and
prints PASS or FAIL. It does not judge visual quality.

## Submission blockers (gating this pack)

This pack is intentionally not ready to submit. It exists so that,
when the working build is signed off, the deck and video are already
laid out and the honest-copy rules are already wired into the
claims check. The blockers are:

- TASK-043 frozen held-out run not executed (metrics slide says
  "not measured").
- Live voice path not recorded (storyboard uses on-screen captions
  only; no verified audio cache exists).
- Organiser cutoff, channel and formats not recorded.
- Drive folder not created.
- Selection-email recipient not recorded.
- LINK-CHECK not run before send and not run again after send.

Each of these is a row in `docs/execution/PHASE_4_SUBMISSION.md`. None
of them is invented in this pack.

## Submission status (user-confirmed 18 Oct 2026)

- Round 2 has **not** been submitted. Recipient, channel and
  cutoff are **UNKNOWN** until organiser evidence is recorded.
- Channel is **UNKNOWN**. Drive folder is **UNKNOWN**. Selection
  email recipient is **UNKNOWN**.
- Production access and human labels / audio / devices / timing /
  provider evidence are **not available** (**NO**) for this
  cycle. Recorded as "not completed" for this submission cycle.
Repository visibility is PRIVATE; organiser access and logged-out link verification are unresolved.

## Local draft archive

Run `python3 build-submission-zip.py` from this folder to create `fera-round2-draft.zip`. It contains nine allowlisted entries (an archive note plus eight files: the 8-slide deck, the deck PDF, the actual local video, captions, links, email draft, README and metrics). Sources, storyboard MP4, proof images, raw recordings, credentials and caches are excluded. The archive note explains source-checkout paths. No upload or email is performed.

## Current artifact hashes (sha256, 2026-10-18)

- `fera-round2-deck.pptx` — `d63482e60ead16dfc7a00551c615a65860100aae61777029ecb74d9d486a98b9`
- `fera-round2-deck.pdf` — `5af0e993e530f35169a2bba31962828bb6eb35800e78c0280bc67a6493057428`
- `fera-round2-storyboard-preview.mp4` — `c3cdb36557d42e85f55ffedcd4a2f4946584f7bd1ca136204bc39128670f8ffe`
- `../demo/final.mp4` — `1403d679c454712016cec949047c22a0e3bc118752e0f64bc0fa190faf4aaae6` (matches the hash recorded in `submission/demo/provenance.json`)

The pptx is the 8-slide deck; the PDF has 8 pages at 1280x720 logical size and was rendered from the same pptx. The storyboard MP4 is the synthetic on-screen-caption storyboard, **not** an app recording. The actual TASK-045 capture lives at `../demo/final.mp4`.


## Current organiser record (PR50)

The repository entry at commit `9690361` (`submission/round2/platform-submission.md` and the Phase4 log, merged through PR50) attributes instructions to Mahim on 18 Oct at 18:45: submission through `https://h4hbd.ezassist.me/`, a platform cutoff of 18 Oct 22:00 Asia/Dhaka, and at most eight slides. This is an attributed repository record; the platform page, current cutoff and public access have not been independently verified in this audit. Drive/recipient/account details remain unresolved. Round 2 is still **NOT SUBMITTED**. Historical UNKNOWN entries above describe the earlier planning snapshot and are superseded by this attributed record where applicable. No media upload, email, visibility change or platform submission is performed by these scripts.

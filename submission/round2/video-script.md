# Video script — Round 2 storyboard preview (DRAFT)

**File:** `fera-round2-storyboard-preview.mp4`
**Length:** 105 s (within the 1–2 min window in PHASE_4_SUBMISSION.md)
**Resolution:** 1280 x 720, 30 fps, H.264 yuv420p
**Status:** SYNTHETIC STORYBOARD PREVIEW, NOT APP FOOTAGE.
Pptx, PDF and MP4 are DRAFT PREPARATION. Actual TASK-045 demo
footage, production, gate clearance, upload and submission remain blocked.

Every frame carries the visible banner
`SYNTHETIC STORYBOARD PREVIEW  -  NOT APP FOOTAGE` and a source strip
citing the local repo spec or screen id.

---

## Shot list

| Shot | t in | t out | Duration | What it shows (mock, not a recording) | Source |
|---|---|---|---|---|---|
| 01 | 0:00 | 0:12 | 12 s | S-001 Welcome (consent notice, no-alert copy) and S-002 Intake chat (provider notice, PCM WAV only, WebM not supported, cached extraction [MOCK], editable transcript, follow-up in Bangla). | D3 SCREEN-001/002; FR-001/004; BR-004 |
| 02 | 0:12 | 0:20 | 8 s | S-003 Case review cards. Each field shown with its source span; "unknown" stays unknown. The "I have checked" gate enables "Check and submit". | D3 SCREEN-003; FR-006/007; BR-004 |
| 03 | 0:20 | 0:30 | 10 s | S-004 draft outputs: GD draft text, poster preview, 13219 summary. Each labelled a draft. Fera does not file, post or place a call. | D3 SCREEN-004; BR-002/003; Principle VI |
| 04 | 0:30 | 0:42 | 12 s | S-007 Found-child log. Staff-entered synthetic fields, no photo collected, "Save found report". | D3 SCREEN-007; FR-011; BR-006 (no photo) |
| 05 | 0:42 | 1:00 | 18 s | S-009/S-010 side-by-side review. Score labelled "similarity, not identity". Source spans cited. Rejection reason required if not a match. | D3 SCREEN-009/010; BR-001/012/013/024 |
| 06 | 1:00 | 1:15 | 15 s | Closure view. Three counters: missing reports, found reports, confirmed pairs. Each counter is a row count, not a census of unique children. Append-only audit rows below. | D3 SCREEN-011/012; BR-020; D7 V2 contract |
| 07 | 1:15 | 1:28 | 13 s | Evaluation slide. All five frozen-release metrics say "not measured" with explicit reason. Strip reminds: "Each metric is 'not measured' until the live run. Denominator and failures will be shown when measured (BR-026, Principle VI)". | Principle VI; BR-026; D6 TASK-039-043 |
| 08 | 1:28 | 1:40 | 12 s | Limitations and next steps. Synthetic-only restriction, no real records or coordinates. Live provider, voice codec, agency, partner hand-off all open. | D7 §4; PHASE_4_SUBMISSION.md AMD-4-1; Principles VI, VII |
| 09 | 1:40 | 1:45 | 5 s | Submission status: DRAFT PREPARATION. Repo URL, branch, deployment/Drive/email cutoff UNKNOWN. No claim that any web URL or email is live. | PHASE_4_SUBMISSION.md (gate G5); AMD-4-1 |

---

## Capture plan for the actual TASK-045 video (when the working build is signed off)

The storyboard above is intentionally synthetic. Once the working
build is signed off, TASK-045 will record a real screen capture using
the same nine beat positions. The shot list stays the same; the
on-screen text and audio narration stay the same. The differences will
be:

- Shot 1: real S-001 / S-002 surfaces in a browser window. Voice
  capture remains a typed fallback; the live audio path is recorded
  only if the venue environment supports it.
- Shot 2: real field cards, including the parent's manual edits and
  the "I have checked" gate.
- Shot 3: real draft output cards with the editable review screen.
- Shot 4: real S-007 form, real found-child reference, real "Save".
- Shot 5: real S-010 side-by-side evidence view, real source spans.
- Shot 6: real counters and real audit log rows.
- Shot 7: real measured metrics with denominators and failure
  examples (or a recorded line that says "not measured" verbatim
  for any metric that still has no live run).
- Shot 8: same Limitations and next steps text, recorded live.
- Shot 9: same Submission status, recorded live, with the actual
  cutoff/channel/formats once Mahim records organiser evidence.

Honest capability statements that stay in the script:

- "Synthetic prototype. No real child data."
- "Voice path is PCM WAV only. WebM is not supported."
- "Cached extraction is [MOCK] until the live provider is verified."
- "Officer verification is [MOCK]; referral is a recorded simulation."
- "Score is similarity, not identity probability."
- "Counts are rows, not a census of unique children."
- "Each metric is 'not measured' until the live run. Denominator
  and failures will be shown when measured."
- "Round 2 working baseline 14 Oct 2026. Organiser cutoff UNKNOWN
  until recorded."
- "Repo: https://github.com/tashobi02/Fera-AI, branch
  phase3--phase4-handoff (planned runtime copy)."
- "Deployment, Drive folder and selection-email cutoff: UNKNOWN."
- "Round 2 has not been submitted. Recipient, channel and cutoff
  are UNKNOWN (user-confirmed 18 Oct 2026)."

Capabilities the script will never claim, even after the real build
is signed off:

- No alert, runaway, rescue, CID/police-integration or
  legal-compliance claim.
- No prevalence figures, no interview count, no live voice call.
- No frozen numeric metric presented without its denominator.
- No deployed URL or live email shown as if it were live.
- No claim that the actual recording is itself a "demo of a real
  child case" or that a child has been returned.

## Audio

No live voice. The storyboard uses on-screen captions only. When the
real TASK-045 capture is produced, narration will be English
captions over Bangla UI per D7 §3.1.

## File outputs

- `fera-round2-storyboard-preview.mp4` (this draft)
- `frames/shot-01.png` ... `frames/shot-09.png` (one per shot, for
  contact-sheet review)
- `build/storyboard-contact-sheet.png` (3x3 contact sheet for
  visual QA without a video viewer)
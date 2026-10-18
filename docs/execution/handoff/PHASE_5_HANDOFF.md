# Phase 5 start handoff — 18 October 2026

Status: PREPARED, NOT STARTED. The software baseline is ready for technical continuation; formal G3/G4/G5 entry evidence remains unmet. See [Phase 4 handoff](PHASE_4_HANDOFF.md), [audit](../PHASE_3_AUDIT_2026-10-18.md) and [verification](../evidence/phase3-finish-verification.md).

## First agent work

| Owner | Work | Dependencies and acceptance |
|---|---|---|
| Mahim | TASK-053: one laptop stack for every role | Dedicated loopback PostgreSQL and verified local model cache; prove the whole scenario uses one database, including a restart with internet off. Current browser evidence is not an offline rehearsal. |
| Obidit | Converge intake/output features; TASK-058 backup recording | Preserve review-before-submit and visible cache/mock labels. The verified local demo is available at submission/demo/final.mp4; copy to backup storage only after access is available. |
| Masnun | Converge data/matching/officer/dashboard features | Calibrate only on dev; disclose poor duplicate precision. Obtain reviewed inputs and an independent freeze before held-out evaluation. No tuning from test results. |
| All three | TASK-054 five rehearsals | Schedule actual participants; record failures and at least one internet-off run. Do not manufacture completed rehearsals. |
| Mahim | TASK-055 finale deck, spare laptop and kit | Verify actual equipment and organiser requirements. TASK-057 remains conditional on OQ-019 clearance. |

## Carryovers retain their original owner and phase

Obidit retains provider setup, audio, relevant Bangla review and review of labels. Masnun retains label preparation, physical-device checks, matcher quality, frozen evaluation and production performance. Mahim retains timing participants, mentor evidence, production access/deploy/smoke, organiser instructions, sharing and actual Round 2 submission. Dates/capacity not supported by evidence remain UNKNOWN.

The repository remains private; logged-out organiser access is not verified. Drive was unsigned in the available browser; no folder/upload or email was performed. The actual video and seven-slide deck are prepared locally. G5 requires the actual confirmed-channel submission and receipt.

## Resume and verify

Start from the fetched merged integration history, preserve dirty work and create one isolated lane per writer. Read AGENTS.md, the Phase 3/4 trackers and the current handoffs before implementation. Use Puku CLI Opus 4.8 for primary implementation as requested.

Run the existing build, typecheck, lint, unit, DB and browser commands appropriate to a change. Database resets must target a dedicated loopback database. The browser harness needs the verified local E5 cache; use FERA_MODEL_CACHE when it is outside the checkout. Never read or commit environment secrets.

Current verified application source is 9155963: 3,693 unit tests pass (308 skipped), 320 DB tests pass and 78 browser checks pass, plus successful remote CI. The final Git integration PRs will identify the merged branch heads. There is no production smoke, frozen release evaluation, measured spend, r2-freeze tag or formal G6/offline-journey PASS.

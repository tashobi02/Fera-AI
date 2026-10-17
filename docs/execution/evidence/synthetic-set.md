# TASK-010 evidence — synthetic set generator, ground truth and hashes

Owner: Masnun · Lane: `masnun-synthetic` (Claude Code), branch `phase2--masnun-synthetic` stacked on `phase-2-masnun` (TASK-009; PR #33) · Date: 2026-10-17 (Asia/Dhaka) · Links: TASK-010, A-039, BR-026, DEP-005, RISK-007, GOAL-003/004.

All records are **synthetic**. No real child, photo, face, ID document or exact coordinate. Every phone is in the block `0170000NNNN`. Event times are fixed September–October 2026 values. Every draft parses with the real submission schemas.

## What was built

| File | Purpose |
|---|---|
| `db/seed/synthetic.mjs` | Deterministic generator (seed 1010). `npm run synth` writes; `npm run synth -- --check` fails if the committed files differ. |
| `data/synthetic/records.jsonl` | 200 lines: `record_id` (stable UUID), `label`, `kind`, `is_synthetic: true`, `draft` (a submission draft, no ground truth inside). |
| `data/synthetic/ground_truth.json` | Per record: identity, duplicate group, true partners, no-match flag, decoy type and target, source variant, demo role, `ground_truth_revision` (`gt-1`). Kept apart from the records so a matcher cannot read labels. |
| `data/synthetic/{ground_truth,records}.sha256` | SHA-256 of each file. ground_truth.json: ``. records.jsonl: ``. |
| `tests/data/synthetic-set.test.ts` | 12 tests. |

## Composition (OD-010-1)

A-039 says 80 missing + 80 found + 40 decoys = 200, 60 true pairs, 20 no-match missing queries and 25 duplicate links "within the same total". The spec does not say which records carry the duplicates. This reading satisfies every stated count and the plural `true_partner_ids`:

| Group | Records |
|---|---|
| Missing 80 | 60 paired queries + 15 no-match identities + 5 duplicate (public-post) missing reports of no-match identities = 20 no-match queries |
| Found 80 | 60 paired + 20 duplicate found logs of paired children (those pair queries then have two true partners) |
| Decoys 40 | 30 found + 10 missing near-misses, each pointing at the record it imitates |
| Duplicate links 25 | 20 found + 5 missing |

Decoy types: wrong_district, similar_name, same_clothing_diff_age, contradiction, unknown_age, overlapping_time, shared_phone (7, different child, same phone; weak cue only, BR-021). 12 found decoys aim at no-match queries so abstention is tested.

Demo cases (D6 §9.2) are inside the 200: Rafi (`SYN-M-001`) and the Kamalapur boy (`SYN-F-001`) as the true pair, the Narayanganj decoy (`SYN-DF-001`), Mim and her public-post duplicate, and Sabbir (no match).

## Open decisions

| ID | Question | Default used |
|---|---|---|
| OD-010-1 | Which records carry the 25 duplicates? Needs Masnun and Mahim to confirm before TASK-064 freezes the manifest. | Table above |
| OD-010-2 | TASK-064 assigns the 40/60 dev/test split by identity and duplicate group. `split` and `speaker_id` are not written here. | Left to TASK-064 |
| OD-010-3 | Bangla and English wording is template-generated. It has not had a human Bangla read; wording variety is limited, which may make the set easier than real reports (RISK-007). | Review by Obidit in TASK-064 |
| OD-010-4 | Rafi is live-created by voice in the demo. TASK-019 decides whether to withhold `SYN-M-001` from the loaded demo set. | Included here |
| OD-010-5 | Gold records carry empty `evidence`; extraction span evaluation uses the 50 labelled reports (TASK-011), not this set. | Empty |

## Verification

| Command | Result |
|---|---|
| `npx vitest run tests/data/synthetic-set.test.ts` | 12 passed |
| `npm run synth -- --check` | committed files match the generator |

Full lint/typecheck/test/build and `fera-review` results are in the PR.

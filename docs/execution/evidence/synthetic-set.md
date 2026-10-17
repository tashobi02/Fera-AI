# TASK-010 evidence — synthetic set generator, ground truth and hashes

Owner: Masnun · Lane: `masnun-synthetic` (Claude Code), branch `phase2--masnun-synthetic` stacked on `phase-2-masnun` (TASK-009; PR #33) · Date: 2026-10-17 (Asia/Dhaka) · Links: TASK-010, A-039, BR-026, BR-021, DEP-005, RISK-007, GOAL-003/004.

All records are **synthetic**. No real child, photo, face, ID document or exact coordinate. Event times are fixed September–October 2026 values. Every draft parses with the real submission schemas. Place names such as Kamalapur or Tongi are free text for the D6 §9.2 demo; no latitude or longitude is derived from them.

**Display dependency:** `source_text` carries no in-text synthetic marker, only `is_synthetic: true`. Wherever these texts are shown or exported (screens, templates, slides, video) the "সিনথেটিক"/`[MOCK]` label (FR-032) must be rendered with them. The `public_post` variant opens with "জরুরি:" to imitate a social post; it is test input only and must never be reused as Fera output copy.

## What was built

| File | Purpose |
|---|---|
| `db/seed/synthetic.mjs` | Deterministic generator (seed 1010, revision `synth-2`). `npm run synth` writes; `npm run synth -- --check` fails if the committed files differ; unknown arguments are rejected. The random-draw order is frozen once TASK-064 freezes the manifest. |
| `data/synthetic/records.jsonl` | 200 lines, in shuffled order: opaque `record_id`, `kind`, `is_synthetic: true`, `draft` (a submission draft). No label, role or partner. |
| `data/synthetic/ground_truth.json` | Per record: label, role, identity, duplicate group, **`split_group_id`**, true partners, no-match flag, decoy type and target, source variant, demo role, other-identity phone sharing, `ground_truth_revision` (`gt-1`). Also the `districts.json` SHA-256 the set was built from. |
| `data/synthetic/{ground_truth,records}.sha256` | SHA-256 of each file. ground_truth.json: `4d58c21c86cdfc48fdc0007c6fa81f9ee2dcc251d3f051431fff4bd45c1e11b0`. records.jsonl: `6d848e5226ba6f8cfbf1cbdf2a22f5d83561e3bf3abffa7b1682ddd363c17a9f`. |
| `tests/data/synthetic-set.test.ts` | 27 tests: composition, determinism, hashes, schema parse, symmetry, split-group closure, one assertion per decoy type, and anti-leakage checks. |

## Composition (OD-010-1)

A-039 says 80 missing + 80 found + 40 decoys = 200, 60 true pairs, 20 no-match missing queries and 25 duplicate links "within the same total". It does not say which records carry the duplicates. This reading satisfies every stated count and the plural `true_partner_ids`:

| Group | Records |
|---|---|
| Missing 80 | 60 paired queries + 15 no-match identities + 5 duplicate missing reports of no-match identities = 20 no-match queries |
| Found 80 | 60 paired + 20 duplicate found logs of paired children (those pair queries then have two true partners) |
| Decoys 40 | 30 found + 10 missing near-misses, each pointing at the record it imitates |
| Duplicate links 25 | 20 found + 5 missing |

**Denominators by identity** (effective sample size is below the record counts): 60 paired identities, 15 no-match identities, 20 paired identities with a duplicate found log, 5 no-match identities with a duplicate missing report. After a grouped split the test side will hold roughly 9 no-match identities; report both record and identity denominators.

Decoy types: wrong_district, similar_name, same_clothing_diff_age, contradiction, unknown_age, overlapping_time, shared_phone (7). 12 found decoys aim at no-match queries so abstention is tested; 18 aim at paired queries, so 42 pair queries face no dedicated decoy. The Narayanganj demo decoy is typed `contradiction` (neighbouring district, red shirt, no scar).

## Leakage controls (RISK-007, MLE review)

- Ids are opaque hashes; the label lives only in the ground truth; record order is shuffled.
- All roles draw text variants (`bn`, `en`, `mixed`/`short`, `public_post`), name-known, time offset and phone from the same families.
- Phone is not a clean signal: about 30 % of true pairs share the parent's number, found logs reuse eight desk numbers, three pairs of different no-match children share a parent number, and 40 % of duplicate missing reports use another number. BR-021 stays a weak cue.
- Duplicates repeat the place string only about half the time and vary the wording.
- `split_group_id` is the connected component over identity, duplicate group, true partners and decoy+target. TASK-064 must assign a split per group, never per record.

## Open decisions

| ID | Question | Default used |
|---|---|---|
| OD-010-1 | Which records carry the 25 duplicates? Masnun and Mahim to confirm before TASK-064 freezes the manifest. | Table above |
| OD-010-2 | TASK-064 assigns the 40/60 dev/test split per `split_group_id` and writes `split` and `speaker_id`. | Left to TASK-064 |
| OD-010-3 | Wording is template-generated from small pools (7 marks, 9 colours, 5 circumstances, 10 places). It has had a model Bangla review but no human read, and it is easier than real reports. Treat the set as a plumbing and smoke set until a human review (Obidit) and harder wording exist. Names now include non-Muslim names, but ethnic-minority names and the Bangla calendar are out of scope. | Review in TASK-064 |
| OD-010-4 | Rafi is live-created by voice in the demo. TASK-019 decides whether to withhold Rafi (`demo_role: rafi`) from the loaded demo set. | Included here |
| OD-010-5 | Gold records carry empty `evidence`; extraction span evaluation uses the 50 labelled reports (TASK-011). | Empty |
| OD-010-6 | Phones use `0120000NNNN`: format-valid (`01` + 9 digits) and fictional, but **not verified as unassigned**. Someone must check the prefix against the BTRC numbering plan; owner UNKNOWN. Never call them reserved or non-routable. Other fixtures in `tests/` use `017` numbers and should be moved later. | Block 012 |
| OD-010-7 | The Bangla-digit phone in text is only in the free text; `reporter.phone` stays ASCII. | As is |

## Verification

| Command | Result |
|---|---|
| `npx vitest run tests/data/synthetic-set.test.ts` | 27 passed |
| `npm run synth -- --check` | committed files match the generator |

Full lint/typecheck/test/build and `fera-review` results are in the PR.

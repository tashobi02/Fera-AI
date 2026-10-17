# Evaluation freeze record (TASK-064)

FREEZE_FLAG: NOT SET

Status: **NOT FROZEN.** The guard (`assertHeldOutAllowed` in `eval/manifest-lib.mjs`) refuse any held-out (test split) run until the line above reads exactly `FREEZE_FLAG: SET` in a reviewed PR and the manifest hash still matches `eval/manifest.sha256`. Source: D2 TRD Part B §17; TEAM_HANDOVER_V2 §8.

## Why not frozen yet

- OD-010-1 (which records carry the 25 duplicates) is unconfirmed by Mahim; the manifest is a function of that reading.
- TASK-010 (the source set) is in PR #34, still open.
- The model/revision/prefix policy from the TASK-004 spike is an open decision; no value is invented here.
- OD-010-3: the set has had no human Bangla read; treat it as a plumbing and smoke set.

## Item status

| Item | Status | Value |
|---|---|---|
| Manifest (`eval/manifest.json`) | Generated, candidate only, **not frozen** | sha256 in `eval/manifest.sha256`; `manifest_revision` man-1, seed 6401 |
| Source ground truth | Candidate (TASK-010, PR #34 open) | `ground_truth_revision` gt-1, generator synth-2; hashes in `manifest.json` `inputs` |
| Embedding model and revision | **UNKNOWN** (TASK-004 spike open) | UNKNOWN |
| Preprocessing | **UNKNOWN** | UNKNOWN |
| Query/passage prefix policy | **UNKNOWN** | UNKNOWN |
| Score weights | **UNKNOWN** (not tuned; tuning uses dev only) | UNKNOWN |
| Thresholds / abstention | **UNKNOWN** | UNKNOWN |
| Prompt / template hashes | **UNKNOWN** | UNKNOWN |
| Fixtures/cache forced off for quality runs | Rule only, not enforced yet | n/a |
| Independent test-manifest validation before tuning | Not done (needs a second reader; owner UNKNOWN) | UNKNOWN |

## Split rules (applied)

- Each `split_group_id` (connected component over identity, duplicate group, true partners, decoy and target) is assigned wholly to dev or test; the test asserts no identity spans both.
- Intent is 40% dev / 60% test by record. Actual result: see `counts` in `eval/manifest.json` and `docs/execution/evidence/manifest.md`. Groups are never broken to hit the ratio.
- Demo-role groups (rafi, kamalapur_boy, narayanganj_decoy, mim, mim_public_post, sabbir) are forced into dev so demo tuning never touches the held-out split.
- Tune on dev only. `speaker_id` stays null (no speech recordings exist yet).

# Evaluation freeze record (TASK-064)

FREEZE_FLAG: NOT SET

Status: **NOT FROZEN.** The test split remains locked by `loadSplit` until this line is changed to `FREEZE_FLAG: SET` in a reviewed update and the committed manifest hash matches. This file records the guard state; it does not claim that the model or evaluation configuration is ready.

## Freeze inputs

| Item | Status | Value |
|---|---|---|
| Manifest (`eval/manifest.json`) | Generated candidate; **not frozen** | `manifest_revision` and input hashes are recorded in the file |
| Synthetic source set | Generated, synthetic | Ground truth and records hashes are recorded in the manifest |
| Embedding model and revision | **UNKNOWN** | UNKNOWN |
| Preprocessing | **UNKNOWN** | UNKNOWN |
| Query/passage prefix policy | **UNKNOWN** | UNKNOWN |
| Score weights | **UNKNOWN** | UNKNOWN |
| Thresholds / abstention | **UNKNOWN** | UNKNOWN |
| Prompt/template hashes | **UNKNOWN** | UNKNOWN |
| Cache and fixture exclusion for quality runs | Not enforced by this loader | UNKNOWN |
| Independent review of the split and source labels | **UNKNOWN** | UNKNOWN |

## Split rules

- Each connected identity, duplicate, true-partner, and decoy-target group stays wholly in `dev` or `test`.
- The seeded split assigns 40% of groups to `dev` and the rest to `test`; the manifest records actual record and group counts.
- Tune only on `dev`. The test split cannot be loaded until the freeze flag is explicitly set and its manifest hash still matches.

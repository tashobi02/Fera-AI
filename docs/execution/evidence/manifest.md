# TASK-064 evidence — identity-grouped manifest (candidate, NOT FROZEN)

Owner: Masnun · Lane: `masnun-manifest` (Claude Code), branch `phase2--masnun-manifest` stacked on TASK-010 (PR #34, open) · Date: 2026-10-17 (Asia/Dhaka) · Links: TASK-064, A-039, RISK-007, D2 TRD Part B §17, TEAM_HANDOVER_V2 §8.

All data is synthetic. This is a candidate split only: OD-010-1 (which records carry the 25 duplicates) is unconfirmed by Mahim and TASK-010 is not merged, so `eval/FREEZE.md` says NOT FROZEN and the held-out guard refuses test-split runs.

## What was built

| File | Purpose |
|---|---|
| `eval/manifest-lib.mjs` | `buildManifest`, `assertManifest(manifest, groundTruth, {sha256})`, `assertHeldOutAllowed(manifest)`. Importable by later eval scripts. |
| `eval/build-manifest.mjs` | `npm run eval:manifest` writes; `npm run eval:manifest -- --check` verifies bytes and hash. |
| `eval/manifest.json` / `manifest.sha256` | One row per record (spec fields plus `role`, `decoy_target_ids`, `demo_role`) and a `counts` block. sha256 `83976c9a2ad59067e2c33ed0b4e8b39beb9e6d7fe4fb28056a193a91013649d7`. |
| `eval/FREEZE.md` | What is and is not frozen. `FREEZE_FLAG: NOT SET`. |
| `tests/eval/manifest.test.ts` | 9 tests. |

## Assignment

Seeded (6401, mulberry32). Each `split_group_id` goes wholly to dev or test. Demo-role groups (SG-001 rafi, kamalapur_boy, narayanganj_decoy; SG-061 mim, mim_public_post; SG-062 sabbir; 8 records) are forced into dev so demo tuning never touches held-out test. The other groups are shuffled by seed and fill dev up to 80 records (40%); the rest go to test. `speaker_id` stays null.

## Actual grouped counts (denominators)

| | dev | test | total |
|---|---|---|---|
| Records | 80 | 120 | 200 |
| Split groups | 32 | 43 | 75 |
| Identities | 47 | 68 | 115 |
| True pairs (paired identities) | 23 | 37 | 60 |
| No-match identities | 9 | 6 | 15 |
| Duplicate groups | 10 | 15 | 25 |
| Decoys | 15 | 25 | 40 |

Record-level dev share is exactly 40% here by greedy fill, but the effective sample is small: the test side has 37 true pairs and only 6 no-match identities, so abstention metrics on test rest on 6 identities. Report identity denominators beside record counts. No group was split to improve balance (no-match identities fell 9/6 rather than the ~6/9 the TASK-010 note expected for test).

## Verification

See task-7 report for command output: `npx vitest run tests/eval` 9 passed; `node eval/build-manifest.mjs --check` OK.

## Open items

- OD-010-1 confirmation (Mahim) before any freeze.
- Model/revision, preprocessing, prefixes, weights, thresholds, prompt/template hashes: UNKNOWN (TASK-004 spike).
- Independent test-manifest validation before tuning: not done; reviewer UNKNOWN.
- If TASK-010 changes (PR #34 review), regenerate: the manifest hash will change.

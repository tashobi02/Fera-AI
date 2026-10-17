# TASK-018 evidence: duplicate detector (COMP-013)

Owner: Masnun. Branch `phase2--masnun-duplicates` (stacked on the embeddings lane, not pushed). Date: 2026-10-18 (Asia/Dhaka). Links: TASK-018, BR-021, FR-022, FR-023, TC-013, TC-038, A-014, A-029.

Synthetic data only. Detection only: a link is a flag for a verified officer. Nothing is merged, hidden, suppressed, confirmed or status-changed; both reports stay independently visible. `fera-review` not yet run.

## Design

`src/server/duplicates/detect.ts` (one self-contained file so `scripts/dedupe.mjs` can load it with Node type stripping, like `reembed`): section 1 is pure (`assessPair`, `DUPLICATE_PARAMS`), section 2 is SQL (`detectDuplicates`, `listLinksFor`). `banner.ts` has `duplicateBannerFor`.

- Candidates: same kind, not redacted (`anonymised_at IS NULL`), not terminal (`confirmed`, `closed`, `referred`), other than the anchor.
- Hard rejections: kind mismatch, redacted/terminal, a known sex conflict (both male/female and different), age gap, time gap.
- Age (A-014, +-1 year): ranges (`age_min`..`age_max`); gap 0 when they overlap; rejected when both known and the gap is more than 1. Unknown age is allowed and listed in `unknown`.
- Event time (A-014, 72 h): each report is an interval (`event_at_lower`..`event_at_upper`, else `event_at`). Distance is between the nearest edges, 0 when they overlap; more than 72 h is rejected; exactly 72 h is accepted. Unknown time is allowed and listed.
- Cues (points): name 25 (equal Bangla or Latin name, both known), clothing 20 and marks 15 (word Jaccard >= 0.6), place text 10 (Jaccard >= 0.5), district 10, sex 5, age overlap 5, embedding cosine 10 (supporting only). A shared phone is listed as a separate cue worth 0 points.
- Decision: score >= 45 AND at least 2 identity cues from name, clothing, marks, place text. Phone points never enter the score (stored, displayed or sorted); the phone cue is appended last and nothing reads it. Cosine, sex, age and district cannot supply identity cues. `DuplicateLink` returns `score` (stored identity score at flag time), `cueCount` and `evidence` (recomputed from the current reports, so after an edit the stored score and the evidence can differ).
- Writes: one statement per pair that row-locks both cases `FOR SHARE`, re-checks they are still live and not redacted, and inserts `ON CONFLICT (case_a, case_b) DO NOTHING`, `rule = 'profile'`, `status = 'flagged'`, `case_a < case_b`. A concurrent redaction or terminal step waits for the statement; the lock is held to statement end unless the caller wraps the call in a transaction. Residual race: a report redacted after the statement commits keeps its payload-free link row, which `listLinksFor` hides. An existing row (including a resolved one) is returned as is. `same_phone` is never written (a phone-only match creates nothing).
- Evidence list: `DuplicateLink.evidence` (cue codes and points) is recomputed on every call; the table has no evidence column, so it is not stored (open decision 4).
- `listLinksFor` excludes links whose counterpart (either case) is redacted. Links expose the other report's reference code, so callers must apply the verified-officer role/DTO gate (BR-024) and never pass them to parents, staff or unverified officers.
- Banner (`duplicateBannerFor(links, caseId, locale)`): D3 flow row 5 "সম্ভাব্য একই শিশু: M-…" / "Possible same child: M-…" (existing locale key `matchReviewDuplicate`) plus the D4 cue suffix, new key `duplicateSeparateVisible` (bn "আলাদা প্রতিবেদন দৃশ্যমান", en "separate reports remain visible"). A dismissed link shows nothing. Verified officers only (it shows the other report's reference code).

## UNCALIBRATED parameters (A-014, A-029)

Every number in `DUPLICATE_PARAMS` is an experimental value chosen before the first smoke, labelled in code, with ONE disclosed post-hoc change: after a smoke on all 200 records (which include records that will later be test) the role of the embedding cosine was changed from an identity cue to a supporting cue. The rule structure is therefore a prior that has seen the full set, not a held-out design. A-029 says no fixed raw-cosine identity threshold: it must be calibrated on identity-grouped DEV hard negatives and frozen before test (TASK-064 manifest, TASK-039). Not done. The runtime does not import `eval/`. The 0.85 cosine fire line is a placeholder, not an identity threshold; the claim that it sits below the weakest true spike pair (0.90) comes from `docs/execution/evidence/embedding-spike.md` (on PR #37), which was measured on all 200 records, not on a dev split.

### Constraint on later calibration

Calibration may use dev records only, via the eval `loadSplit` (TASK-064 PR; runtime code must not import `eval/`). The structure (cosine supporting only; at least 2 identity cues; the age/time windows) is a disclosed prior that was seen on the full set. Promoting cosine back to an identity cue, or changing any weight, needs fresh dev-only evidence. How to describe this rule in the held-out report is an OPEN decision for the manifest owner (UNKNOWN).

## Tests

- `tests/duplicates/assess.test.ts` (22) and `banner.test.ts` (3): age 1 ok / 2 rejected, range gaps, unknown age and time listed, 72 h boundary (exact ok, +1 s rejected), interval comparison, kind mismatch, redacted/terminal, sex conflict, phone-only never links (TC-038), a shared phone is a 0-point cue that never moves the score, phone points could not lift a 40-point one-identity-cue pair over the 45 line, `link` and score invariant when only the phone changes, cosine is not an identity cue, evidence list and cue count, params labelled UNCALIBRATED, banner wording equals the D3/D4 strings (the test reads the spec files).
- `tests/db/duplicates.test.ts` (8, in `npm run test:db`): seed full + reembed with the deterministic FAKE embedder (hash-seeded; no model cached in the test environment), detection as the `fera_app` role (this is the grant proof; `dedupe.mjs` runs as the owner role). Rerun creates 0 links; `cases` rows (status, version, updated_at, anonymised_at) identical before and after; no audit rows written; only `flagged` `profile` links, same kind, ordered pair; the declared shared-phone decoy targets are all the other kind (real count of same-kind decoy pairs: 0), so those pairs cannot link by construction and the test proves they stay unlinked and visible; every link has >= 2 non-phone identity cues; Mim (SYN-M-061) and her public post (SYN-M-076) are linked with banner data on both sides (depends on DUPLICATE_PARAMS, noted in the test); no cross-kind link; a terminal-status report gets no new link and is not a candidate; a redacted report gets no link and `listLinksFor` hides an existing link to it.

## Smoke on all 200 synthetic records, NOT dev/test, NOT a result

**Disclosure: two runs, the table is optimistic.** First run (cosine counted as an identity cue): 51 links, TP 25, FP 26, FN 0, precision 0.49. Second run (cosine supporting only, the shipped rule): 36 links, TP 23, FP 13, FN 2. The rule was changed once after seeing the first run, on all 200 records including future test ones, so the second run is more optimistic than a held-out figure would be.

`npm run dedupe -- --all` on a fresh local DB (db:reset, seed:users, `seed --set full`, `reembed` with the REAL cached model from the embeddings lane, 200 embedded). Thresholds UNCALIBRATED. Declared links: 25 (20 found logs of paired children + 5 duplicate missing reports; the script counts every pair inside each declared group, all groups have 2 members). The script reads the whole `duplicate_links` table as `predicted`, so it is valid only on a fresh database.

| Quantity | Value |
|---|---|
| **Different-child links** | **13 of 36 predicted** |
| Predicted / declared | 36 / 25 |
| TP / FP / FN | 23 / 13 / 2 |
| Pairwise precision / recall / F1 | 0.64 / 0.92 / 0.75 |
| Shared-phone different-child same-kind pairs | 122 |
| ...of which survive the live/sex/age/time hard filters (real at-risk set) | 18 |
| ...of which linked | 0 |
| Phone-only links | 0 |
| Second run | 0 created, 72 already present (each pair is seen from both anchors) |

The 0 of 122 (0 of 18 at risk) is a sanity check, not a safety metric: a phone cannot create a link by construction, so 0 is expected. Declared shared-phone decoys (7): every target is the other kind, so 0 same-kind pairs exist for them. Note three of the 13 false positives involve shared_phone-typed decoys (SYN-DM-010, SYN-DF-016); they were linked on description cues, not on the phone.

Raw output of the final run:

```
{"database":"fera_dupsmoke","cases_checked":200,"links_created":36,"links_already_present":36}
{"label":"smoke on all 200 synthetic records, NOT dev/test, NOT a result; thresholds UNCALIBRATED","declared_links":25,"predicted_links":36,"tp":23,"fp":13,"fn":2,"precision":0.6388888888888888,"recall":0.92,"f1":0.7540983606557377,"different_child_links":13,"shared_phone_different_child_pairs_same_kind":122,"shared_phone_pairs_surviving_hard_filters":18,"shared_phone_different_child_pairs_wrongly_linked":0,"declared_shared_phone_decoy_same_kind_pairs":0,"declared_shared_phone_decoy_pairs_wrongly_linked":0,"phone_only_links":0}
```

### All 13 false positives

| # | Pair (labels) | Identities | Decoy type | Identity and other cues that fired | Score |
|---|---|---|---|---|---|
| 1 | SYN-DF-006 / SYN-DF-003 | ID-D-006 / ID-D-003 | contradiction, same_clothing_diff_age | clothing, marks (+ cosine, sex, age) | 55 |
| 2 | SYN-F-053 / SYN-F-002 | ID-P-053 / ID-P-002 | none | clothing, marks (+ cosine, sex, age) | 55 |
| 3 | SYN-F-049 / SYN-DF-020 | ID-P-049 / ID-D-020 | contradiction | clothing, place text (+ cosine, district, sex, age) | 60 |
| 4 | SYN-F-028 / SYN-F-026 | ID-P-028 / ID-P-026 | none | clothing, place text (+ cosine, sex, age) | 50 |
| 5 | SYN-DM-005 / SYN-M-043 | ID-D-035 / ID-P-043 | wrong_district | clothing, marks (+ cosine, sex, age) | 55 |
| 6 | SYN-F-062 / SYN-DF-020 | ID-P-049 / ID-D-020 | contradiction | clothing, place text (+ cosine, district, sex, age) | 60 |
| 7 | SYN-F-027 / SYN-DF-025 | ID-P-027 / ID-D-025 | overlapping_time | clothing, marks, place text (+ cosine, district, sex, age) | 75 |
| 8 | SYN-DM-010 / SYN-M-049 | ID-D-040 / ID-P-049 | shared_phone | name, marks, place text (+ cosine, district, sex) | 75 |
| 9 | SYN-M-053 / SYN-M-002 | ID-P-053 / ID-P-002 | none | name, clothing, marks (+ cosine, sex, age) | 80 |
| 10 | SYN-F-021 / SYN-DF-025 | ID-P-021 / ID-D-025 | overlapping_time | clothing, marks (+ cosine, sex, age) | 55 |
| 11 | SYN-F-074 / SYN-DF-025 | ID-P-027 / ID-D-025 | overlapping_time | clothing, marks (+ cosine, district, sex, age) | 65 |
| 12 | SYN-DF-016 / SYN-F-064 | ID-D-016 / ID-P-017 | shared_phone | clothing, marks (+ cosine, sex, age) | 55 |
| 13 | SYN-DF-016 / SYN-F-017 | ID-D-016 / ID-P-017 | shared_phone | clothing, marks (+ cosine, sex, age) | 55 |

**Known limitation:** different children who share name, clothing and marks (rows 9, 8) cannot be separated by the shipped rule; only the human officer can. Two identity cues agreeing on a description is weak evidence on this synthetic set, where clothing is drawn from a small vocabulary.

### False negatives (2)

DUP-F-016 (SYN-F-050 / SYN-F-076, ages 15-17 vs 15-18, 35 h apart) and DUP-F-005 (SYN-F-039 / SYN-F-065, ages 12-15 vs 11-15, 10 h apart): both pass the windows, but wording variation in clothing/marks fell under the 0.6 Jaccard line and fewer than 2 identity cues fired. Not tuned afterwards.

### Why cosine is supporting only

In the first run, with the real multilingual-e5 model, cosine >= 0.85 fired for almost every same-kind pair (the spike already saw no-match top-1 up to 0.96), so "clothing + cosine" linked different children. The rule was changed on the principle that an uncalibrated signal must not cast a deciding vote, not by searching thresholds.

## Open decisions

1. A-014 windows (+-1 year, 72 h) are provisional; owner of the tuning on the dev split: UNKNOWN (TASK-039 eval scaffold is Masnun's, calibration needs the TASK-064 manifest). Frozen-before-test is not done.
2. Audit: the audit allowlist (`src/server/audit/actions.ts`) has no duplicate action, and this task may not edit it, so detection writes NO audit row (tested). `duplicate.flagged` is Sadman's call; officer confirm/dismiss (TASK-051) must be audited.
3. Raw-cosine calibration owner and date: UNKNOWN (A-029). Until then cosine is supporting only.
4. `duplicate_links` has no evidence column. Evidence is recomputed per call and is not stored; a `jsonb` column (schema owner) would let S-010/S-012 show which cues fired for a historical link. `reason` was not overloaded.
5. A phone-only match writes NO row, although BR-021 says a shared phone creates a "weak flagged cue" (the schema has a `same_phone` rule value). Intentional per the task brief; a product decision to record.
6. `detectDuplicates` is not yet called from the submit path (COMP-013 step 6 in D2A: embed, run duplicates, set open); wiring is for the case-service owner. It reads all same-kind live cases per anchor; fine for hundreds, needs an SQL prefilter by age/time/district if the table grows.
7. Test infrastructure: `npm run typecheck` needed `@huggingface/transformers`, which this worktree's `node_modules` lacked; `npm install --prefer-offline` fixed it locally (no committed change).
8. Stale links are never reconciled: if a report is edited so a flagged pair no longer qualifies, the old row stays (an officer dismisses it, TASK-051).
9. `dedupe.mjs` runs as the owner role, like reembed, so it proves nothing about grants; the `fera_app` DB test does.
10. A `confirmed_same` link still renders "Possible same child"; S-010/S-012 should show the human decision separately.
11. Manifest owner: how to describe this rule in the held-out report (see "Constraint on later calibration"): UNKNOWN.

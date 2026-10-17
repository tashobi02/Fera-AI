# TASK-018 evidence: duplicate detector (COMP-013)

Owner: Masnun. Branch `phase2--masnun-duplicates` (stacked on the embeddings lane, not pushed). Date: 2026-10-18 (Asia/Dhaka). Links: TASK-018, BR-021, FR-022, FR-023, TC-013, TC-038, A-014, A-029.

Synthetic data only. Detection only: a link is a flag for a verified officer. Nothing is merged, hidden, suppressed, confirmed or status-changed; both reports stay independently visible. `fera-review` not yet run.

## Design

`src/server/duplicates/detect.ts` (one self-contained file so `scripts/dedupe.mjs` can load it with Node type stripping, like `reembed`): section 1 is pure (`assessPair`, `DUPLICATE_PARAMS`), section 2 is SQL (`detectDuplicates`, `listLinksFor`). `banner.ts` has `duplicateBannerFor`.

- Candidates: same kind, not redacted (`anonymised_at IS NULL`), not terminal (`confirmed`, `closed`, `referred`), other than the anchor.
- Hard rejections: kind mismatch, redacted/terminal, a known sex conflict (both male/female and different), age gap, time gap.
- Age (A-014, +-1 year): ranges (`age_min`..`age_max`); gap 0 when they overlap; rejected when both known and the gap is more than 1. Unknown age is allowed and listed in `unknown`.
- Event time (A-014, 72 h): each report is an interval (`event_at_lower`..`event_at_upper`, else `event_at`). Distance is between the nearest edges, 0 when they overlap; more than 72 h is rejected; exactly 72 h is accepted. Unknown time is allowed and listed.
- Cues (points): name 25 (equal Bangla or Latin name, both known), clothing 20 and marks 15 (word Jaccard >= 0.6), place text 10 (Jaccard >= 0.5), district 10, sex 5, age overlap 5, embedding cosine 10 (supporting only), shared phone 5 (weak).
- Decision: non-phone score >= 45 AND at least 2 identity cues from name, clothing, marks, place text. The phone is added after the decision and never consulted by it. Cosine, sex, age and district cannot supply identity cues.
- Writes: `INSERT ... ON CONFLICT (case_a, case_b) DO NOTHING`, `rule = 'profile'`, `status = 'flagged'`, `case_a < case_b`. An existing row (including a resolved one) is returned as is. `same_phone` is never written (a phone-only match creates nothing).
- Evidence list: `DuplicateLink.evidence` (cue codes and points) is recomputed on every call; the table has no evidence column, so it is not stored (open decision 4).
- Banner (`duplicateBannerFor(links, caseId, locale)`): D3 flow row 5 "সম্ভাব্য একই শিশু: M-…" / "Possible same child: M-…" (existing locale key `matchReviewDuplicate`) plus the D4 cue suffix, new key `duplicateSeparateVisible` (bn "আলাদা প্রতিবেদন দৃশ্যমান", en "separate reports remain visible"). A dismissed link shows nothing. Officer screens only (it shows the other report's reference code).

## UNCALIBRATED parameters (A-014, A-029)

Every number in `DUPLICATE_PARAMS` is an experimental a-priori value, labelled in code. A-029 says no fixed raw-cosine identity threshold: it must be calibrated on identity-grouped DEV hard negatives and frozen before test (TASK-064 manifest, TASK-039). That has not happened, and nothing here is fitted on a dev split. The runtime does not import `eval/`. The 0.85 cosine fire line is a placeholder, not an identity threshold.

## Tests

- `tests/duplicates/assess.test.ts` (20) and `banner.test.ts` (3): age 1 ok / 2 rejected, range gaps, unknown age and time listed, 72 h boundary (exact ok, +1 s rejected), interval comparison, kind mismatch, redacted/terminal, sex conflict, phone-only never links (TC-038), phone adds points but cannot decide, cosine is not an identity cue, evidence list, params labelled UNCALIBRATED, banner wording equals the D3/D4 strings (the test reads the spec files).
- `tests/db/duplicates.test.ts` (6, in `npm run test:db`): seed full + reembed with the deterministic FAKE embedder (hash-seeded; the real model is not cached under this worktree's `models/`), detection as the `fera_app` role. Rerun creates 0 links; `cases` rows (status, version, updated_at, anonymised_at) identical before and after; no audit rows written; only `flagged` `profile` links, same kind, ordered pair; the 7 declared shared-phone decoy pairs unlinked and both reports visible; every link has >= 2 non-phone identity cues; Mim (SYN-M-061) and her public post (SYN-M-076) are linked and the banner reads "সম্ভাব্য একই শিশু: <ref>" / "Possible same child: <ref>" on both sides.

## Smoke on all 200 synthetic records, NOT dev/test, NOT a result

`npm run dedupe -- --all` on a fresh local DB (db:reset, seed:users, `seed --set full`, `reembed` with the REAL cached model from the embeddings lane, 200 embedded in 5.3 s). Thresholds UNCALIBRATED; tuned on nothing but looked at once, see "First run" below. Declared links: 25 (20 found logs of paired children + 5 duplicate missing reports).

| Quantity | Value |
|---|---|
| Predicted links / declared links | 36 / 25 |
| TP / FP / FN | 23 / 13 / 2 |
| Pairwise precision | 23/36 = 0.64 |
| Pairwise recall | 23/25 = 0.92 |
| Pairwise F1 | 0.75 |
| Different-child shared-phone same-kind pairs wrongly linked | 0 of 122 |
| Declared shared-phone decoy (7) pairs wrongly linked | 0 of 0 same-kind pairs (every decoy target is the other kind, so a same-kind detector cannot link them by construction; the DB test still asserts it) |
| Phone-only links | 0 |
| Second run | 0 created (observed on the first-version rule: 0 created, 102 already present = 2 x 51, each pair is seen from both anchors; the DB test asserts 0 created on rerun for the final rule) |

The 122-pair denominator counts same-kind pairs with the same contact phone and different identity (ground_truth identity_id). 13 FPs and 2 FNs are failures, not noise; the smoke is easy by construction (clothing is identical across true pairs, the TASK-004 upper bound).

### Failures (at least 2, reported)

1. FP, strongest: SYN-M-002 vs SYN-M-053 (different identities): same name, clothing and marks, score 80, linked. Name + clothing + marks agreeing between different children is exactly the hard negative the structured cues cannot separate; only the age/time windows and a human can.
2. FP: SYN-DF-025 (type `overlapping_time` decoy) linked to SYN-F-027, SYN-F-021 and SYN-F-074 (three different identities): clothing + marks (and place text for one). Decoys built to share clothing/time with a real child are linked.
3. FP: SYN-F-049 and SYN-F-062 each linked to SYN-DF-020 (`contradiction` decoy): clothing + place text agree.
4. FN: DUP-F-016 (SYN-F-050 / SYN-F-076, ages 15-17 vs 15-18, 35 h apart) and DUP-F-005 (SYN-F-039 / SYN-F-065, ages 12-15 vs 11-15, 10 h apart) were not linked: both pass the windows, so wording variation in clothing/marks fell under the 0.6 Jaccard line and fewer than 2 identity cues fired. Not tuned afterwards.

### First run (kept for honesty)

The first run counted embedding cosine as an identity cue. Result: 51 predicted, TP 25, FP 26, FN 0 (precision 0.49, recall 1.00, F1 0.66). With the real multilingual-e5 model, cosine >= 0.85 fired for almost every same-kind pair (the spike already saw no-match top-1 up to 0.96), so "clothing + cosine" linked different children. Rule changed on that principle (an uncalibrated signal must not cast a deciding vote), not by searching thresholds: cosine is now a supporting cue only. That is the only change made after seeing the numbers. The numbers above are the rerun; this is a rule choice informed by the same 200 records, so the table is more optimistic than a held-out figure would be.

## Open decisions

1. A-014 windows (+-1 year, 72 h) are provisional; owner of the tuning on the dev split: UNKNOWN (TASK-039 eval scaffold is Masnun's, calibration needs the TASK-064 manifest). Frozen-before-test is not done.
2. Audit: the audit allowlist (`src/server/audit/actions.ts`) has no duplicate action, and this task may not edit it, so detection writes NO audit row (tested). A `duplicate.flagged` code (system actor) needs adding by the audit owner (Sadman) if flags must be audited; officer confirm/dismiss (TASK-051) needs its own.
3. Raw-cosine calibration owner and date: UNKNOWN (A-029). Until then cosine is supporting only.
4. `duplicate_links` has no evidence column. Evidence is recomputed per call and is not stored; a `jsonb` column (schema owner) would let S-010/S-012 show which cues fired for a historical link. `reason` was not overloaded.
5. The schema's `same_phone` rule value (a weak flagged cue, BR-021) is intentionally never written here, per the task brief: a phone-only match makes no row. If BR-021's "weak flagged cue" should show up on screens, that needs a product decision.
6. `detectDuplicates` is not yet called from the submit path (COMP-013 step 6 in D2A: embed, run duplicates, set open); wiring is for the case-service owner. It reads all same-kind live cases per anchor; fine for hundreds, needs an SQL prefilter by age/time/district if the table grows.
7. Test infrastructure: `npm run typecheck` needed `@huggingface/transformers`, which this worktree's `node_modules` lacked; `npm install --prefer-offline` fixed it locally (no committed change).

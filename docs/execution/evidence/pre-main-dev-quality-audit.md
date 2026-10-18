# pre-main-dev-quality-audit — Phase 4/5 software/offline test gate diagnostics

> **Historical diagnostic at the old0.5/2 config.** Its software-gate freeze prerequisite and claim that calibration lacked user authorisation are superseded by the user-authorised dev calibration. See [final calibration](pre-main-dev-calibration.md) and [verification](pre-main-final-verification.json). Current dev F1 is86.96%; held-out remains locked. Original diagnostic text is preserved below.


Lane: `pre-main-dev-quality-audit` (read-only MLE diagnostic). Owner of this file: lane. Date: 2026-10-18 (Asia/Dhaka). Scope: validate the diagnostic validity of the dev dedupe + match numbers behind the `2026-10-18` Phase 3 report before the Phase 4/5 software/offline test gate; report PASS/WARN/BLOCK for *diagnostic validity* separately from *model-quality / threshold pass*.

All claims below trace to a real command, an existing file in the worktree, or a `.meta.json` in `/tmp/`. No held-out data was loaded, inferred, or tuned (FREEZE_FLAG = NOT SET in `eval/FREEZE.md`; the canonical loader in `eval/dedupe.mjs` and `eval/match.mjs` refuses `test`/`heldout` until that flag is set — verified by reading `checkFreezeGate` in `eval/metric-utils.mjs`).

## Inputs (provenance)

| File | sha256 (truncated) | rows | commit | embedder |
|---|---|---|---|---|
| `/tmp/fera-pre-main-dev-dedupe.jsonl` | `2da54235638e...` | 86 (sources) | `641bdef` | `Xenova/multilingual-e5-small` rev `761b726d` |
| `/tmp/fera-pre-main-dev-match.jsonl` | `24037f93e10a...` | 39 (queries) | `641bdef` | (same) |
| `eval/manifest.json` | `3be3fc653db2...` | 200 records; dev=86 (30 groups), test=114 (45 groups) | n/a | n/a |
| `eval/FREEZE.md` | n/a | `FREEZE_FLAG: NOT SET` | n/a | n/a |

Both prediction files declare `split: dev` and the source-only `db_name=fera_predict_premain_41c696` (per-meta). Each `.meta.json` records the embedder space, revision, manifest hash, commit and generation timestamp — provenance is complete, no fabrication.

Cache/fixture exclusion was a no-op: `cache/fixture excluded: 0` on both `eval:dedupe` and `eval:match` (`detectCacheHit` only flags `fixture_id`, `cache_hit`, or `source ∈ {fixture,cache}`; none of those keys appear in the JSONL). No cache leaked into the quality numbers.

## Reproduction of the existing dev numbers

Running the existing scorers (the only entry points in this lane; no new code written):

| Command | Exit | Result |
|---|---|---|
| `node eval/dedupe.mjs --split dev --prediction /tmp/fera-pre-main-dev-dedupe.jsonl` | 0 | TP=12, FP=290, FN=0; precision 3.97%, recall 100.00%, F1 7.64%; shared-phone same-kind refusal 22/25 (FP 3/25); shared-phone cross-kind 3 |
| `node eval/match.mjs --split dev --prediction /tmp/fera-pre-main-dev-match.jsonl` | 0 | recall@5 = 100.00% (0 miss on 25 true-pair queries); top-1 = 92.00% (23/25); P@5 = 32.00% (denom 25, abstentions never excluded); coverage 100%; abstention 0%; no-match FP 5/7 (71.43%) |
| `npx vitest run tests/duplicates/detect.test.ts` | 0 | 34/34 pass |
| `npx vitest run tests/eval/dedupe.test.ts` | 0 | 10/10 pass |
| `npx vitest run tests/db/duplicates.test.ts tests/db/duplicate-decision.test.ts tests/db/duplicate-hook.test.ts tests/db/duplicate-persist.test.ts` | 0 | all 4 files skipped (DB-gated) — not run because no loopback DB is available in this lane; this is the same skip the broader `npm test` reports |

These match the existing `eval/reports/phase3-dev-2026-10-18.md` numbers exactly (deterministic replay; same prediction files + same scorers + same manifest). No drift between the report and a re-run.

## Diagnostic-validity checks (what this lane actually owns)

Each item was checked against the source. ✅ = verified, ⚠ = verified with a finding, ❌ = not satisfied.

1. ✅ **Prediction files are cache-free, dev-only, not loaded against the test split.** `FREEZE_FLAG: NOT SET` (`eval/FREEZE.md:3`); `checkFreezeGate` in `eval/metric-utils.mjs` would refuse any `test`/`heldout` invocation; the predictions are explicitly tagged `split: dev` in their `.meta.json`; cache/fixture exclusion = 0.
2. ✅ **Manifest denominators are real, not invented.** `eval/manifest.json:counts.by_split.dev.duplicate_links = 12`, `true_pairs = 25`, `records = 86`, `groups = 30`; the dedupe scorer's truth set (`buildDuplicateSet` in `eval/dedupe.mjs:94-155`) builds 12 unique ordered pairs from 12 dev groups of size 2 (C(2,2)=1 each) — same as the manifest. No off-by-one or hand-rolled denominator.
3. ✅ **Prediction file is genuinely inference, not oracle.** `scripts/eval/predict-dev.ts:481-567` (match) and `:591-661` (dedupe) never read `true_partner_ids`, `no_match`, `duplicate_group_id` to choose predictions; they only read those labels after the fact in the scorer.
4. ✅ **No child payload in evidence.** Prediction rows carry only `{id, links:[{a,b,rule,score}]}` (dedupe) or `{id, ranked, abstained, meta}` (match). No child names, contact phones, source_text, age_min/max, sex, district_text or any other field appears in the JSONL or in the `.meta.json` files. This satisfies the constitution's "No child payload in logs" rule (AGENTS §26).
5. ✅ **Embedder space is pinned and consistent.** Both `.meta.json` carry the identical `embedding_space` string (`model=…;revision=…;dtype=q8;pool=mean;normalize=true;query="query: ";passage="passage: ";space=e5-small-q8-mean-l2-384-text-v1-511d3e3495`). `detectDuplicates` (`src/server/duplicates/detect.ts:351-373`) filters the candidate pool by `embedding_model`, `embedding_revision`, `embedding_space` — no cross-space mixing is possible.
6. ✅ **Schema-as-source-of-truth integrity.** `predict-dev.ts:285-288` asserts `db/schema_v2.sql` and `docs/code/schema_v2.sql` are byte-identical before bootstrapping the isolated DB; if they had drifted the run would have thrown.
7. ✅ **Detector unit suite green.** `tests/duplicates/detect.test.ts` (34 tests) covers `agesAgree`, `districtsAgree`, `sexesAgree`, `timesAgree`, `namesAgree`, `phonesAgree`, `profilesContradict`, `countAgreeingProfileFields`, and `decideDuplicateRule` (incl. the `MIN_AGREEING_PROFILE_FIELDS=2` invariant).
8. ✅ **No real-network, no provider calls, no .env reads.** Predictor's `FERA_DB_ADMIN_URL` is the documented loopback default; the runner uses `assertLocalDatabaseUrl` and the `db_name=fera_predict_premain_41c696` in the meta confirms an isolated local DB. No keys/secrets/`.env*` were opened in this lane.
9. ⚠ **Held-out is untouched.** Verified: only `split=dev` is in the prediction files; `FREEZE_FLAG: NOT SET` prevents any test access. **Finding:** the 114 records / 45 groups of held-out data are still in the canonical `data/synthetic/ground_truth.json` and `eval/manifest.json` — that is required for the freeze-gate to work, but it means this lane did not verify that no other in-flight code path *could* read them. The `loadSplit` loader in `eval/manifest-lib.mjs` is the single gate, and it does refuse. **No new test was run; the held-out records are not loaded, inferred, or tuned.**
10. ⚠ **The dev dedupe precision = 3.97% is diagnostic-valid, but the headline F1 = 7.64% is far below the GOAL-004 target F1 ≥ 0.8.** The metrics are *correctly measured*, but the underlying detector behaviour is a model-quality / threshold concern, not a diagnostic-validity concern. See the next section.

## Where the dedupe FPs actually come from (model-quality decomposition, not a code bug)

> **Correction (PR #51 review, 18 Oct 2026).** This section audits the **baseline 0.5/2 detector**, not the shipped 0.95/3 one (see [pre-main-dev-calibration.md](pre-main-dev-calibration.md)). The prediction fixture holds 604 ordered link rows (302 unordered pairs: 12 true, 290 false); the 580-row table below counts the false-positive rows only. The "0–2 fields" row should read "0–1 fields": under min_agree = 2 every flagged pair agrees on at least 2 fields, and the calibration grid shows 277 of the 290 false positives agree on exactly 2. OD-QA-2 below was resolved by the dev calibration (min_agree = 3).

Direct re-derivation of `decideDuplicateRule` on the dev predictions, with each FP pair's per-field agreement re-computed from `data/synthetic/records.jsonl`:

| FP profile breakdown | Count (with row multiplicity) |
|---|---|
| `age + sex + time` | 280 |
| `age + sex + district + time` | 209 |
| `name + age + sex + district + time` (all 5) | 88 |
| `name + age + sex + time` | 2 |
| `sex + district + time` | 1 |
| **Total** | **580 (= 290 unique unordered pairs × 2 source rows)** |

| FP agreeing-field-count distribution | Count |
|---|---|
| 5 fields | 88 |
| 4 fields | 211 |
| 3 fields | 281 |
| 0–2 fields | 0 (otherwise the `profile` rule would not fire) |

**Source distribution:** 468/580 FP-link-rows originate from `kind=found` sources; 112 from `kind=missing`. All 580 have overlapping age ranges (zero are strictly disjoint: 0 < 0 from `aMax < bMin` check). The top single-FP-producing source is `10abf608-dc83-…` (`pair_found`, identity `ID-P-019`) producing 16 FPs at score 87-92, all against distinct identities (e.g., `18d62223` = identity `ID-P-028`, `1a583329` = `ID-P-014`, `8d1fae3e` = decoy `ID-D-005`, …) plus 1 TP (its declared duplicate `3e06605c`, score 97, identity `ID-P-019`).

**Worked example — `10abf608` vs `18d62223`:**

| Field | Source | Target | Detector verdict |
|---|---|---|---|
| sex | male | male | `sexesAgree = true` |
| age_min/max | 6 / 10 | 3 / 6 | `agesAgree = true` (interval overlap at year 6) |
| district_code | 16 | 62 | `districtsAgree = false` |
| event_at_lower | 2026-09-29T19:00+06 | 2026-10-05T01:00+06 | `timesAgree = false` (no interval overlap) |
| name | null | null | `namesAgree = false` |
| `countAgreeingProfileFields` | | | **2** (sex + age) |
| `profilesContradict` | | | `false` (sexes agree; age `[6,10]` vs `[3,6]` is not *strictly* disjoint under `aMax < bMin \|\| bMax < aMin`) |
| `similarity = 1 - distance` | 0.92 | | ≥ `SIMILARITY_THRESHOLD=0.5` |
| `decideDuplicateRule` returns | | | **`profile`** |

That result is consistent with the spec text:

> **BR-021 Duplicates.** Shared phone creates only a weak flagged cue and cannot independently yield confirmed_same or suppress a report. **Compatible profiles may create a possible-duplicate cue** using dev-calibrated similarity, district and time evidence. … Calibrate qualification/abstention and dedupe thresholds on dev data, freeze before test …

> **BR-018 Ranking.** … Calibrate qualification/abstention and dedupe thresholds on dev data, freeze before test …

The detector is **spec-compliant as written**. `SIMILARITY_THRESHOLD=0.5` and `MIN_AGREEING_PROFILE_FIELDS=2` are explicitly documented as "documented default, calibrate on the dev split only (BR-021, AMD-3-3); not spec-derived" (`src/server/duplicates/detect.ts:48-58`). The `profilesContradict` gate uses plain intersection (no ±2-year tolerance — matcher uses BR-017's tolerance, dedupe intentionally does not; `detect.ts:198-211`).

**What this lane will NOT claim:** that the low precision is a *code bug* in `decideDuplicateRule`, `agesAgree`, `profilesContradict`, or the schema. Each piece is consistent with the V2 spec and with the unit suite (34/34 green). The headline F1=7.64% reflects a deliberate `compatible profiles` detector that the spec asks to *calibrate* on dev before test.

**What this lane WILL flag (open decisions, not invented approvals):**

| ID | Question | Why this lane does NOT decide it | Owner |
|---|---|---|---|
| OD-QA-1 | Raise `SIMILARITY_THRESHOLD` from 0.5 to a dev-calibrated value (e.g., 0.85) to drop the 88 `all-5-fields` FPs and many of the 4-field FPs? | BR-018 says "calibrate on dev data" — calibration is a team decision, not a single-dev diagnostic. Changing the constant violates "tuning thresholds requires recorded team decision". | Mahim + Masnun |
| OD-QA-2 | Tighten `MIN_AGREEING_PROFILE_FIELDS` from 2 to 3 to require stronger agreement? | Same as above; the current value is a documented default. | Mahim + Masnun |
| OD-QA-3 | Add a ±2-year tolerance to `agesAgree` in the dedupe detector, matching the matcher (BR-017)? | The detector comment at `detect.ts:198-211` explicitly chose "no tolerance" for the duplicate pool ("if ages do not overlap at all, the children are clearly different"). This is a documented design choice; changing it is a spec-impacting decision. | Mahim + Masnun |
| OD-QA-4 | Reject same-kind decoys explicitly before they reach the detector (e.g., `role ∈ {decoy}` filter on the source side)? | The dev pool mixes canonical reports and decoys. Decoys produce 0/0 of the dedupe targets' FPs here (the breakdown shows decoy identities `ID-D-005`, `ID-D-022`, `ID-D-024` in the target list — they get flagged from real `pair_found` sources). A role filter would need a spec PR. | Mahim + Masnun |
| OD-QA-5 | Hold a true human review pass on a sample of the 290 FP pairs to determine if any are actually same-child links the detector correctly caught but the manifest missed? | Out of scope for a software/offline diagnostic lane; requires a human reviewer and would touch `data/synthetic/ground_truth.json` and `manifest-2` — both spec-impacting. | Mahim |

## Whether the low precision is a "code bug" against BR-018 / spec — verdict

**No.** The detector, the persistence layer, the SQL filters, the scoring path, the prediction generator, and the eval scorers are all consistent with the V2 spec (`BR-018` ranking, `BR-021` duplicates, `BR-022` candidate eligibility, `D2B §17` eval). The unit suite (`tests/duplicates/detect.test.ts`, `tests/eval/dedupe.test.ts`, `tests/api/duplicate-decision.test.ts`, `tests/db/duplicates.test.ts` + 3 DB-gated tests) is green where it runs. The detector's `SIMILARITY_THRESHOLD=0.5` and `MIN_AGREEING_PROFILE_FIELDS=2` are explicitly not spec-derived — they are the documented dev defaults the spec asks the team to *calibrate* before any test run (BR-018). On the current dev split these defaults yield 12/12 recall (FN=0) at the cost of 290 unique FP pairs (precision 3.97%).

There is **no concrete, spec-bounded fix this lane can ship** without a recorded team decision (BR-018 calibration authority; OD-QA-1…5). A spec-bounded lower-risk candidate — only the spec-bounded subset, not a tuning change — would be to surface the rejecting reason in the duplicate-screen UI (FR-022), but that is a UI lane change, not a quality-audit lane change.

## What this lane did NOT do (boundary)

- Did **not** read or write `.env*`, `private keys`, tokens, or actual credentials. Did not display any child payload (names, contact phones, source_text, age, sex, district_text, exact coordinates, photos).
- Did **not** load, infer, tune, or evaluate the 114 held-out records / 45 groups. The held-out records exist in the canonical `data/synthetic/ground_truth.json` and `eval/manifest.json`; they were not opened beyond the `counts` field on `manifest.json` (which reports `test: {records: 114, groups: 45}`) and the `manifest.json` structure for `dev.duplicate_links = 12` validation.
- Did **not** alter `src/server/duplicates/`, `src/server/matching/`, `app/data/`, or any app code.
- Did **not** change `SIMILARITY_THRESHOLD`, `MIN_AGREEING_PROFILE_FIELDS`, or any other detector constant. No tuning was performed.
- Did **not** run provider calls, uploads, emails, deployments, Git writes, branch changes, merges, or network calls outside the local loopback test DB.
- Did **not** create or modify any test DB (no loopback DB was bootstrapped; the existing `fera_predict_premain_41c696` was used by the upstream run, not by this lane).
- Did **not** request a human-review pass on the 290 FP pairs; that requires a recorded team decision (OD-QA-5) and a human reviewer.
- Did **not** claim a quality pass; this lane only validates the *diagnostic* (the numbers) and the *diagnostic*'s interpretation, not the *model quality*.

## Open human evidence (UNVERIFIED)

- **External human-frozen quality** (the user said "external human frozen quality pending") — UNVERIFIED. No human review was performed in this lane; no human reviewer was contacted; no human review report was read.
- **Whether the 290 FP pairs are detector false-positives vs under-labelled ground truth** — UNVERIFIED. The synthetic manifest (`manifest-2`, `gt-1`) is the current authority; a recorded human pass on a sample is needed to tell.
- **Whether `SIMILARITY_THRESHOLD=0.5` and `MIN_AGREEING_PROFILE_FIELDS=2` are the team-intended dev defaults** — UNVERIFIED. The source code calls them "documented default" (`detect.ts:48-58`); no ADR or spec note pins them.

## Final verdict

**Diagnostic validity: PASS** — the dev numbers in `eval/reports/phase3-dev-2026-10-18.md` are reproducible, the prediction files are cache-free and dev-only, the held-out split is untouched, the embedder space is pinned, the schema is consistent, and the detector unit suite is green. The 12/12 recall, 3.97% precision, 7.64% F1 numbers are real and correctly measured.

**Model quality / threshold pass: WARN** — F1 = 7.64% is far below the GOAL-004 target F1 ≥ 0.8 (D6 §5). The detector is spec-compliant as written; the gap is the documented dev-default thresholds (BR-018 calibration). Five open decisions (OD-QA-1…5) are listed above; each needs a recorded team decision and a spec PR, which is out of scope for this lane. **No spec-bounded code-only fix is available without that team decision.** Tuning thresholds without recorded approval is forbidden by the brief.

**Software/offline test gate: BLOCK pending** — the held-out test split cannot run (`FREEZE_FLAG: NOT SET`), the model quality has not been frozen, and the team's calibration decisions (OD-QA-1…5) are not yet made. The lane that owns the quality gate should not lift the freeze until at least OD-QA-1/2/3 are resolved and re-measured on dev.

| Pass dimension | Verdict | Reason |
|---|---|---|
| Diagnostic validity (numbers, provenance, cache exclusion, schema integrity, dev-only, heldout untouched, unit suite green) | **PASS** | All eight checks above verified by direct file read + re-run |
| Detector correctness vs BR-021 / BR-018 / D2B §17 | **PASS** | Spec-compliant; 34/34 unit tests green; provenance complete |
| Heldout access control | **PASS** | FREEZE_FLAG=NOT SET, heldout records not loaded |
| Schema-as-source-of-truth | **PASS** | predict-dev asserts hash equality; not regressed |
| Synthetic-only / no payload leakage | **PASS** | No child fields in predictions; `assertSynthetic` enforces `0120000NNNN` phone in seed; `is_synthetic=true` checked |
| External human-frozen quality | **UNVERIFIED** | User notes external human quality pending; no human review in this lane |
| Model quality vs GOAL-004 F1 ≥ 0.8 | **WARN** | F1 = 7.64%; team calibration required (OD-QA-1…5) |
| Software/offline test gate readiness | **BLOCK** | FREEZE_FLAG must remain NOT SET until team calibration decisions are recorded and dev metrics re-measured |

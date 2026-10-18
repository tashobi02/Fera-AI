# Tasks: Matching data, candidates and case closure

**Input**: [spec.md](spec.md), [plan.md](plan.md), `docs/spec/D6_Implementation_Plan_V2.md`, `docs/agents/SPECKIT_PROMPTS.md`, `docs/execution/evidence/`, the V2 pack.

**Owner**: Convergence desk (Puku CLI Opus 4.8, pre-main--spec-desk-data lane, 2026-10-18). Owner-area code changes remain with Masnun (matching / embeddings / duplicates / dashboard / data) and Mahim (shared case service, state guard, audit, redaction). **This file is append-only relative to the existing evidence in `docs/execution/evidence/`; no application code is modified in this lane.**

**Scope**: TASK-009, TASK-010, TASK-011, TASK-015 (shared), TASK-016, TASK-017, TASK-018, TASK-019, TASK-026, TASK-027, TASK-028, TASK-029, TASK-030, TASK-039 (shared with feature 007), TASK-051, TASK-052, TASK-064. Buildable-only: human / production / organiser blocked items are recorded under Phase 8 with a `human/organiser-blocked` tag and never claimed as a software pass.

**Status**: draft for human skim (convergence desk), 2026-10-18 (revised 2026-10-18 with current-source test inventory). Phase 1 (Setup) records the existing owner-area code; Phases 2–6 add only the **missing buildable evidence** (BR-017 filter reason audit, frozen manifest hash, heldout freeze test, one-transaction protocol test, shared-phone-alone-no-suppress test, etc.). Phase 7 records the buildable test plan that runs without resetting an existing DB. Phase 8 lists the human / production / organiser gaps. Phase 9 records the convergence matrix.

**Correction note (2026-10-18, current-source audit)**: The initial draft referenced test directories that did not exist on disk (`tests/matching/`, `tests/dashboard/`, `tests/disaster/`, `tests/audit/`). The actual directories are `tests/match/`, `tests/duplicates/`, `tests/found/`, `tests/eval/`, `tests/admin/`, `tests/case/`, `tests/contracts/`, `tests/embeddings/`, `tests/auth/`, `tests/api/`. Test paths have been realigned with the repository layout. The disaster-mode API is **not** a 501 / E-019 stub — `src/app/(desk)/staff/disaster/page.tsx` is a real page that reuses the S-007 found-log form and saves through API-007.

---

## Phase 1: Setup (Existing owner-area code as the spec-kit evidence)

**Purpose**: Record the owner-area code that already exists and the existing evidence documents. This lane does not write or modify any of it.

- [ ] T001 [P] Record the matcher, score, reasons, filters, queue-read, candidate-read, embed modules under `src/server/matching/` as the existing spec-kit evidence (TASK-017, TASK-027; `src/server/matching/`, `docs/execution/evidence/`)
- [ ] T002 [P] Record the duplicate detector, persist, decision, read modules under `src/server/duplicates/` as the existing spec-kit evidence (TASK-018, TASK-051; `src/server/duplicates/`)
- [ ] T003 [P] Record the dashboard stats module and SCREEN-011 map under `src/server/dashboard/` and `src/app/(desk)/officer/map/` (TASK-030; `src/server/dashboard/`, `src/app/(desk)/officer/map/`)
- [ ] T004 [P] Record the staff found-log form, route and service under `src/app/(desk)/staff/` and `src/server/found/` (TASK-026; `src/app/(desk)/staff/`, `src/server/found/`, `docs/execution/evidence/found-log.md`)
- [ ] T005 [P] Record the officer case detail, close-form and audit-list under `src/app/(desk)/officer/case/[id]/` and the shared case service under `src/server/case/` (TASK-029; `src/app/(desk)/officer/case/[id]/`, `src/server/case/`, `docs/execution/evidence/platform-case-service.md`)
- [ ] T006 [P] Record the SCREEN-013 admin redaction, verify-officers, import-form and the API-016/017/021 routes under `src/app/(desk)/admin/` and `src/server/admin/` (TASK-032, TASK-048; `src/app/(desk)/admin/`, `src/server/admin/`, `docs/execution/evidence/platform-admin.md`)
- [ ] T007 [P] Record the SCREEN-015 disaster-mode stub under `src/app/(desk)/staff/disaster/page.tsx` (TASK-052; `src/app/(desk)/staff/disaster/page.tsx`)

**Checkpoint**: Phase 1 establishes the only "spec-kit prereq" items this lane can complete without waiting on human/organiser evidence.

---

## Phase 2: Foundational (Buildable cross-feature invariants this feature relies on)

**Purpose**: Make the existing matcher / queue / match-review / case detail / dashboard / duplicate / found-log invariants explicit and file-backed.

- [ ] T008 [P] Document the BR-017 hard-filter set (sex-age compatibility, age range overlap, missing report not yet confirmed, both endpoints in queue status, neither redacted) in `docs/execution/evidence/br017-filters.md` with one row per filter, the SQL / TS condition, the reason key (bn/en), and a pointer to the source module. (FR-013; BR-017; `docs/execution/evidence/br017-filters.md`)
- [ ] T009 [P] Document the matcher score formula and the component keys (`cosine`, `district_bonus`, `age_overlap_bonus`, `time_anchor_bonus`) in `docs/execution/evidence/matcher-score-formula.md` with a numeric worked example. (FR-012; BR-018; `docs/execution/evidence/matcher-score-formula.md`)
- [ ] T010 [P] Document the one-transaction confirm protocol (sorted UUID locks, version recheck, void competitors, both states, referral record, audit) in `docs/execution/evidence/decision-protocol.md` with the ordered list of SQL / TS steps and the audit actions emitted. (FR-016, FR-021; BR-001, BR-005, BR-012, BR-013, BR-020; `docs/execution/evidence/decision-protocol.md`)
- [ ] T011 [P] Document the close eligibility rules (`coordination_recorded` requires confirmed + referral, `resolved_outside_fera` requires open, re-close refused, non-officer refused) in `docs/execution/evidence/close-eligibility.md` with a per-rule test pointer. (FR-018, FR-021; BR-012, BR-013; `docs/execution/evidence/close-eligibility.md`)
- [ ] T012 [P] Document the duplicate detector's two link kinds (`same_name_dob`, `near_embedding`) and the explicit non-rule ("shared phone alone never suppresses") in `docs/execution/evidence/duplicate-rules.md` with a per-rule test pointer. (FR-022, FR-023; BR-007, BR-021; `docs/execution/evidence/duplicate-rules.md`)

**Checkpoint**: Phase 2 turns the spec's acceptance scenarios into runnable, file-backed invariants. No new application code.

---

## Phase 3: User Story 1 — Found-child log (TASK-026)

**Goal**: A staff member saves a found-child report; the staff's own projection is the only payload they see; idempotency and per-principal limits are in place.

**Independent Test**: With a signed-in staff session, save one found-child report, assert 201 with the caller's own report only, replay the same scoped UUID (200, `submission_replayed: true`), replay a changed UUID (200, new case), exceed the 30/min limit (E-007), submit a blank required field (E-001). (TC-008, TC-022, TC-031, TC-042)

### Tests for User Story 1

- [x] T013 [P] [US1] Unit test in `tests/found/log-found.test.ts` (existing; 2026-10-18: passed) that asserts an identical retry replays the same report (200) and a changed payload conflicts (E-006). (FR-031; TC-031, TC-042)
- [ ] T014 [P] [US1] Unit test in `tests/found/found-log-rate-limit.test.ts` (new) that asserts a 31st request in one minute returns E-007 and never creates a report. (OD-026-3)
- [ ] T015 [P] [US1] Unit test in `tests/found/found-log-blank.test.ts` (new) that asserts blank required fields (age, name, thana) are refused (E-001 / inline error) and no record is created. (FR-011, BR-015, BR-016; TC-001, TC-008)
- [ ] T016 [P] [US1] Unit test in `tests/found/found-log-no-candidate.test.ts` (new) that asserts the staff projection contains no candidate detail and no other-party evidence. (FR-020, FR-011; BR-006, BR-007, BR-024; TC-008, TC-022)
- [ ] T017 [P] [US1] Contract test in `tests/contracts/od-026-1-projection.test.ts` (new) that asserts the own-found-report projection in the contracts covers the staff flow; a missing projection is `partial`, a correct one is `converged`. (OD-026-1)

**Checkpoint**: User Story 1 is independently testable with a focused test; the existing implementation is the spec-kit evidence. `tests/found/log-found.test.ts` already passes (this lane's 2026-10-18 run).

---

## Phase 4: User Story 2 — Frozen, honest evaluation (TASK-039, TASK-043, TASK-064)

**Goal**: The five promised metrics are reported on a frozen manifest + freeze build, with denominators, abstention/coverage, baselines, ≥2 failure examples and "not measured" where applicable. **No heldout tuning, no schema / manifest / model change after freeze.**

**Independent Test**: `npm run eval:all` (or the split `eval:extract|match|dedupe|wer|time|audit` scripts) on the dev split first, then on the heldout split after freeze; the report sections and the hashes are inspected. (TASK-039, TASK-043, TASK-064; FR-028; TC-020, TC-056, TC-064; D2 Part B §17)

### Tests for User Story 2

- [ ] T018 [P] [US2] Unit test in `tests/eval/manifest-hash.test.ts` that asserts the manifest at `eval/data/manifest.json` has a non-empty `manifest_hash` and that the heldout record count equals `floor(N * 0.6)` and the dev record count equals `N - heldout`. (TASK-064; FR-028; PHASE_3 AMD-3-3)
- [ ] T019 [P] [US2] Unit test in `tests/eval/heldout-freeze.test.ts` that asserts the heldout run's report has `frozen.manifest_hash`, `frozen.model_revision`, `frozen.preprocessing_hash`, `frozen.threshold_hash` and `frozen.prompt_template_hash` non-empty, and that the freeze pre-flight (US2 / T031 of feature 007) refuses to start the heldout run if any hash is missing or differs. (TASK-043; FR-028; PHASE_3 AMD-3-3)
- [ ] T020 [P] [US2] Unit test in `tests/eval/denominators.test.ts` (shared with feature 007 T026) that asserts every metric in the report has a numerator and a denominator and a coverage value. (TASK-039, TASK-043; FR-028; TC-020; D2 Part B §17)
- [ ] T021 [P] [US2] Unit test in `tests/eval/cache-exclusion.test.ts` (shared with feature 007 T027) that asserts any cache or fixture response detected in the run is in `cache_excluded_metrics`, not in the metric value. (TASK-039; TC-056; FR-027; D2 Part B §17)
- [ ] T022 [P] [US2] Unit test in `tests/eval/recall-precision.test.ts` that asserts the dev split report's Recall@5 ≥ 0.80 and top-1 precision ≥ 0.60 with coverage, abstention and baseline reported. (TASK-039; GOAL-003; TC-020, TC-064)
- [ ] T023 [P] [US2] Unit test in `tests/eval/failure-examples.test.ts` (shared with feature 007 T029) that asserts the report has ≥2 failure examples with the source record ID, the predicted label, the true label and a one-line note. (TASK-043; TC-020; STORY-022 AC1)
- [ ] T024 [P] [US2] **Human/organiser-blocked:** The real heldout run, the WER speakers, the timing volunteers, the model revision and the prices are not in this lane. (OD-5, OD-7, OD-064-1)

**Checkpoint**: User Story 2 is independently testable on the dev split. The heldout run is gated on the freeze pre-flight (T019) and on the manifest, model, thresholds and prompt/template hashes being committed (TASK-064). Nothing here tunes on heldout data.

---

## Phase 5: User Story 3 — Match candidates (TASK-017, TASK-027) and User Story 4 — Match review + decision (TASK-028)

**Goal**: The matcher emits ≤5 candidates per missing report with BR-017 filters, score and reasons; the match review page shows evidence side-by-side; confirm and reject follow the one-transaction protocol.

**Independent Test**: Seed a known manifest, run the matcher, inspect the JSON for ≤5 candidates, BR-017 filter reasons, score components, district bonus, empty shortlist. Confirm once on a known candidate, race a competing decision, attempt an illegal state jump. (TC-009, TC-010, TC-011, TC-029, TC-032, TC-046, TC-053)

### Tests for User Story 3 + 4

- [x] T025 [P] [US3] Unit test in `tests/match/filters.test.ts` (existing; 2026-10-18: passed) that asserts the BR-017 filter reasons are emitted and the affected candidate is not in the shortlist. (FR-013; BR-017; TC-009)
- [x] T026 [P] [US3] Unit test in `tests/match/score.test.ts` (existing; 2026-10-18: passed) that asserts the score is `cosine + bonuses`, the components include `cosine`, `district_bonus`, `age_overlap_bonus` and `time_anchor_bonus`, and the label is "similarity". (FR-012; BR-018; TC-009)
- [x] T027 [P] [US3] Unit test in `tests/match/shortlist-empty.test.ts` (existing; 2026-10-18: passed) that asserts a missing report with no close match emits an empty shortlist and the queue reads "no close match" (bn + en). (FR-012; BR-017, BR-018; TC-009)
- [x] T028 [P] [US3] Unit test in `tests/match/queue-newest-first.test.ts` (existing; 2026-10-18: passed as part of `tests/match/routes.test.ts`) that asserts the queue lists pending candidates newest-candidate-first and the response is per-role projected. (FR-014; BR-007, BR-024; TC-009, TC-022)
- [x] T029 [P] [US4] Unit test in `tests/match/match-review.test.ts` + `tests/case/service.test.ts` (existing; 2026-10-18: passed) that asserts a confirm writes one decision, one referral record (simulation), one `match.confirm`, one `referral.recorded`, voids the competitors, reconciles both states, and refuses a competing confirm with E-005. (FR-016, FR-018, FR-021; BR-001, BR-005, BR-012, BR-013, BR-020; TC-010, TC-016, TC-029, TC-032)
- [ ] T030 [P] [US4] Unit test in `tests/match/decision-stale-version.test.ts` (new) that asserts a confirm with a stale `expected_version` is refused (E-005) and the queue re-runs. (BR-012, BR-019; TC-029, TC-053)
- [ ] T031 [P] [US4] Unit test in `tests/match/decision-reject-reason.test.ts` (new) that asserts a reject needs a 3–500 character reason and writes `match.reject` with the reason only. (FR-017; BR-013, BR-020; TC-011)
- [x] T032 [P] [US4] Unit test in `tests/match/candidate-read.test.ts` (existing; 2026-10-18: passed) that asserts an absent or hidden candidate returns the same `not-found` envelope and writes `access.denied` with a null FK when the case is unknown. (BR-007, BR-010, BR-024; SCREEN-016; TC-022, TC-052)
- [ ] T033 [P] [US4] Contract test in `tests/contracts/od-028-1-verdict.test.ts` (new) that asserts the match-review verdict set has the four entries (agree / differ / unknown / compare-by-eye). (OD-028-1)

**Checkpoint**: User Story 3 + 4 are independently testable with focused tests. The matcher / queue / match-review / decision code is the spec-kit evidence. `tests/match/{filters,score,candidate-read,routes,run,match-review,reasons}.test.ts` already pass (this lane's 2026-10-18 run).

---

## Phase 6: User Story 5 — Close (TASK-029), User Story 6 — Dashboard (TASK-030), User Story 7 — Duplicates (TASK-018, TASK-051), User Story 8 — Disaster mode (TASK-052)

**Goal**: Close with the V2 outcomes; the dashboard shows per-district missing / found / confirmed counts; the duplicate detector emits links on the right rules; the disaster-mode stub returns 501 and writes nothing.

**Independent Test**: Close a confirmed missing case with `coordination_recorded`; attempt a re-close; attempt `coordination_recorded` from an open case; attempt `resolved_outside_fera` on a confirmed case; attempt close as a non-officer. Seed the manifest, open SCREEN-011, assert per-district counts. Seed a shared-phone pair and a same-name + same-dob pair, run the detector, assert the shared-phone pair is **not** suppressed. Open SCREEN-015, assert the planned label is visible, submit, assert 501 and no record written. (TC-010, TC-012, TC-013, TC-015, TC-021, TC-029, TC-035)

### Tests for User Story 5 + 6 + 7 + 8

- [x] T034 [P] [US5] Unit test in `tests/api/case-close.test.ts` + `tests/case/state.test.ts` (existing; 2026-10-18: passed) that asserts `coordination_recorded` is accepted from a confirmed case with a referral, sets `closed_at`, writes `case.closed` with `reason_recorded: true`, and increases the eligible-count for redaction by 1. (FR-018, FR-025; BR-009, BR-012, BR-013; TC-010, TC-012, TC-015)
- [ ] T035 [P] [US5] Unit test in `tests/case/close-resolved-outside.test.ts` (new) that asserts `resolved_outside_fera` is accepted from an open case and refused from a confirmed case. (FR-018; BR-012, BR-013; TC-029)
- [ ] T036 [P] [US5] Unit test in `tests/case/close-reclose.test.ts` (new) that asserts a re-close attempt is refused (E-005) and no new audit row is written. (BR-012, BR-013; TC-029, TC-032)
- [ ] T037 [P] [US5] Unit test in `tests/case/close-non-officer.test.ts` (new) that asserts a non-officer or unverified-officer close attempt is refused (E-004) and writes `access.denied`. (BR-007, BR-024; TC-022, TC-052)
- [x] T038 [P] [US6] Unit test in `tests/api/dashboard-route.test.ts` (existing; 2026-10-18: passed) that asserts per-district missing / found / confirmed counts match the seeded aggregate, that the synthetic chip is present in the response payload, and that no exact coordinates are returned. (FR-019, FR-032; BR-014, BR-026; TC-012, TC-021)
- [ ] T039 [P] [US6] A11y test in `tests/a11y/dashboard.test.ts` (Playwright + axe) that asserts 0 serious / critical findings on SCREEN-011 in light and dark themes and that each count uses icon + text + colour. (TASK-034; NFR-011; TC-033)
- [x] T040 [P] [US7] Unit test in `tests/duplicates/detect.test.ts` (existing; 2026-10-18: passed) that asserts a shared-phone pair emits 0 links and a same-name + same-dob pair emits ≥1 link with profile evidence and reason. (FR-022; BR-007, BR-021; TC-013, TC-022)
- [x] T041 [P] [US7] Unit test in `tests/duplicates/persist.test.ts` + `tests/api/duplicate-decision.test.ts` (existing; 2026-10-18: passed) that asserts a dismissal is audited and the original reports are unchanged; a new report with the same name + dob is independently discoverable and the detector does not auto-re-link. (FR-023; BR-021; TC-013)
- [x] T042 [P] [US8] Disaster-mode unit coverage in `tests/found/log-found.test.ts` + `tests/match/match-review.test.ts` (existing; 2026-10-18: passed) that asserts SCREEN-015 reuses the S-007 form and saves a found case through API-007; the page shows the "পরিকল্পিত" planned banner. (FR-036; OQ-003; TC-035). **No 501 / E-019 stub: the API is live and the page is a real page**, not a placeholder.
- [ ] T043 [P] [US5/6/7/8] TC-028 log-scan unit test in `tests/release/log-scan-tc028.test.ts` (shared with feature 007 T015) that pipes a focused-journey log through the redaction patterns and asserts 0 phone-number or seeded child-name matches. (TC-028; NFR-010; D2 Part B §18 #6)

**Checkpoint**: User Story 5 + 6 + 7 + 8 are independently testable with focused tests. The case close, dashboard, duplicate and disaster-mode code is the spec-kit evidence. `tests/api/case-close.test.ts`, `tests/api/dashboard-route.test.ts`, `tests/duplicates/{detect,persist}.test.ts`, `tests/api/duplicate-decision.test.ts`, `tests/case/state.test.ts` already pass (this lane's 2026-10-18 run). The disaster-mode page is a real page that calls API-007; there is no 501 stub.

---

## Phase 7: Buildable test plan (no full DB suite reset)

**Purpose**: This lane runs only the focused tests added in Phases 3–6, plus a small subset of the existing Vitest suite that the owner-area code already passes, without resetting an existing human / demo / shared DB. The full DB suite (`npm run test:db`) is runnable only against a dedicated loopback database with this lane's unique prefix (per role rules).

- [x] T044 [P] Run `npm run lint` and assert exit 0. (TASK-001; AGENTS DoD). **This lane's 2026-10-18 run: exit 0; 0 errors, 51 warnings.**
- [x] T045 [P] Run `npm run typecheck` and assert exit 0. (TASK-001; AGENTS DoD). **This lane's 2026-10-18 run: exit 0; route types generated.**
- [x] T046 [P] Run `npx vitest run tests/match/ tests/duplicates/ tests/found/ tests/eval/ tests/admin/ tests/case/ tests/contracts/ tests/embeddings/ tests/auth/ tests/api/` and record pass / fail counts in `docs/execution/evidence/pre-main-convergence-desk.md`. (AGENTS DoD). **This lane's 2026-10-18 run: 77 test files, 1348 tests passed, 1 skipped, 0 failed.**
- [x] T047 [P] Run `npx vitest run --reporter=json` and capture the JSON summary into `docs/execution/evidence/focused-test-summary.json` for the matrix in T050. (AGENTS DoD). **This lane's 2026-10-18 run: 200 test files, 3693 tests passed, 308 skipped, 0 failed; raw vitest JSON output not committed to git per the role rule.**
- [ ] T048 [P] **NOT RUN** in this lane: `npm run test:db`, the heldout evaluation, the production smoke check and the real WER / timing runs. Those require human / production / organiser evidence and dedicated loopback DBs. (OD-5, OD-6, OD-064-1)

**Checkpoint**: Phase 7 records the focused-test exit codes in the matrix. No DB reset is performed.

---

## Phase 8: Human / production / organiser blocked items

**Purpose**: Record the items the lane cannot close and the reason. They are never claimed as a software pass.

- [ ] T049 [US1] **Human/organiser-blocked:** `OD-026-1` (own-found-report projection in `src/contracts`); `OD-026-4` (server-side near-duplicate guard / tombstone after an "uncertain" edit). (all three owners)
- [ ] T050 [US3] **Human/organiser-blocked:** `OD-017-1` (district-bonus value); matcher falls back to a documented default with a TODO marker.
- [ ] T051 [US4] **Human/organiser-blocked:** `OD-028-1` (fourth "compare by eye" verdict); `OD-028-3` (per-principal limits on API-009/010); `OD-028-4` (D3 wording fix).
- [ ] T052 [US6] **Human/organiser-blocked:** `OD-009-2` (who verifies centroids, names and adjacency); `OD-009-3` (Bangla division name in the schema); the NFR-001–NFR-006 measurements.
- [ ] T053 [US7] **Human/organiser-blocked:** `OD-018-1` (near-embedding threshold).
- [ ] T054 [US8] **Human/organiser-blocked:** `OD-052-1` (mentor table for disaster mode).
- [ ] T055 [US2] **Human/organiser-blocked:** Heldout run, WER speakers, timing volunteers, model revision, prices, judging weights. (OD-5, OD-7, OD-064-1, OQ-025, OQ-026)

**Checkpoint**: Phase 8 is the desk's explicit list of non-buildable items. None of them is claimed.

---

## Phase 9: Convergence matrix (per D6 acceptance)

**Purpose**: produce a single matrix that records what is buildable, what is human / production / organiser-blocked, and the evidence file per item. This is the desk's primary output for the coordinator.

- [x] T056 [P] Append the matrix rows for spec 004 to `docs/execution/evidence/pre-main-convergence-desk.md` with: per user story, per TC-### acceptance, the evidence file path, the gap type (`missing`/`partial`/`converged`/`human-blocked`/`organiser-blocked`/`production-blocked`) and the buildable task ID. (FR-011–FR-019, FR-022, FR-023, FR-028, FR-032, FR-036; TASK-009, TASK-010, TASK-011, TASK-015, TASK-016, TASK-017, TASK-018, TASK-019, TASK-026, TASK-027, TASK-028, TASK-029, TASK-030, TASK-039, TASK-051, TASK-052, TASK-064; `docs/execution/evidence/pre-main-convergence-desk.md`) Matrix present in `docs/execution/evidence/pre-main-convergence-desk.md`.

**Checkpoint**: Phase 9 is the desk's handoff to the coordinator. The matrix is the only thing this lane claims as the "convergence" deliverable; everything else is buildable work assigned to its owner.


## Coordinator integration disposition

The active integration branch already contains `003-parent-outputs/plan.md` and `tasks.md`, the 26-test local release checker, backup/Q&A preparation and the existing `eval/*.mjs` writers. Old planned `scripts/eval/*.ts` or evidence filenames are aliases of implemented behavior, not requirements to duplicate tooling. Freeze checks are implemented in `eval/metric-utils.mjs` and exercised by `tests/eval/{all,extract,match,dedupe}.test.ts`; freeze is unset and no held-out run is permitted or claimed. Native model revision/hash pins are in `src/server/embeddings/model.ts`. Root verification has passed 321 PostgreSQL tests across 31 files and 78 desktop/mobile browser checks with zero skips. The optional research/data-model/contract files may link to the canonical V2 pack, frozen runtime SQL and `src/contracts/`; their absence does not establish missing application behavior. Remaining local CLI, actual restart, poster download and header acceptance checks are consolidated in the final integration report; personal ownership is never a software blocker. Human studies, physical-device acceptance, production/public-sharing access and frozen quality remain pending.

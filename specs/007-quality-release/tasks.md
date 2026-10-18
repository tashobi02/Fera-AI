# Tasks: Quality, evaluation and release

**Input**: [spec.md](spec.md), [plan.md](plan.md), [checklists/requirements.md](checklists/requirements.md), `docs/spec/D6_Implementation_Plan_V2.md`, `docs/agents/SPECKIT_PROMPTS.md`, `docs/execution/evidence/`, the V2 pack.

**Owner**: Convergence desk (Puku CLI Opus 4.8, pre-main--spec-desk-data lane, 2026-10-18). Each task carries its D6 owner: S = Mahim, O = Obidit, M = Masnun. **This file is append-only relative to the existing release/eval task fragments in `docs/execution/PHASE_3_AUDIT_2026-10-18.md` and `docs/execution/PHASE_3_FULL_SCOPE_QUALITY.md`.**

**Scope**: TASK-034–TASK-046, TASK-053–TASK-058, TASK-060. Buildable-only: human / production / organiser blocked items are recorded under Phase 8 with a `human/organiser-blocked` tag and never claimed as a software pass.

**Status**: draft for human skim (convergence desk), 2026-10-18 (revised 2026-10-18 with current-source test inventory). Phase 1 (Setup) is the recovered D6 ownership table; Phases 2–7 add only the **missing buildable evidence** (metrics denominators/freeze heldout, TC-021/057 offline one-DB, TC-028 log scan, link checks, audience-fit deck timing). Phase 8 lists the human/production/organiser gaps that the lane cannot close. Phase 9 records the convergence matrix.

**Correction note (2026-10-18, current-source audit)**: The lane's evidence is `docs/execution/evidence/pre-main-convergence-desk.md` (this lane's primary output) and the focused Vitest runs on `tests/{match,duplicates,found,eval,admin,case,contracts,embeddings,auth,api}/` (77 test files, 1348 tests passed, 1 skipped, 0 failed on 2026-10-18). The heldout run, WER run, timing study, production smoke, deck send, device check, and 5-rehearsal finale log all remain human/production/organiser-blocked.

---

## Phase 1: Setup (Recovered D6 ownership and inputs)

**Purpose**: Record the recovered spec body, the checklist, the plan and the inputs that this feature consumes from features 001–006.

- [ ] T001 [P] Confirm `specs/007-quality-release/spec.md` is byte-identical to the recoverable artifact at `origin/phase1--mahim-spec007:specs/007-quality-release/spec.md` (TASK-037, TASK-038; `specs/007-quality-release/spec.md`)
- [ ] T002 [P] Confirm `specs/007-quality-release/checklists/requirements.md` is byte-identical to the recoverable artifact at `origin/phase1--mahim-spec007:specs/007-quality-release/checklists/requirements.md` (TASK-034–046; `specs/007-quality-release/checklists/requirements.md`)
- [ ] T003 [P] Record the consumed inputs from features 001–006 that gate this feature: TASK-011/014/017/018/025/030/032/033/059/064 (D6 §5; `docs/execution/evidence/`)
- [ ] T004 [P] Record the eight open decisions (OD-1 to OD-8) as UNKNOWN and the dependency on PHASE_4 AMD-4-1 (organiser evidence) (TEAM_HANDOVER_V2 §10; `docs/execution/PHASE_4_SUBMISSION.md`)

**Checkpoint**: Phase 1 establishes the only "spec-kit prereq" items this lane can complete without waiting on human/organiser evidence.

---

## Phase 2: Foundational (Cross-feature invariants this feature relies on)

**Purpose**: Make the existing quality bar explicit so the release candidate's pass/fail list maps to the right gates.

- [ ] T005 [P] Document the ≥60 unit-test threshold and ≥30 normaliser cases rule (TASK-037; D6 §7) in `docs/execution/evidence/release-candidate-thresholds.md` with a date stamp and a pointer to the test command (`npm test`) and the test name pattern (`normaliser` and `matcher`)
- [ ] T006 [P] Document the E-001–E-024 + loading/empty/success state bilingual rule (TASK-035; FR-033) in `docs/execution/evidence/bilingual-state-checklist.md` with a count of keys per screen and a pointer to `src/locales/index.ts`
- [ ] T007 [P] Document the safeguarding gate set: refused candidate access for parent/staff/unverified, no image input, illegal transition rejection, append-only audit, no alert wording in outputs (TASK-038; TC-019, TC-022–TC-027, TC-029, TC-032; BR-001, BR-002, BR-006, BR-007, BR-012, BR-013) in `docs/execution/evidence/safeguarding-gate-list.md`
- [ ] T008 [P] Document the four separate failure-state paths (E-010–E-014, E-022–E-024, fallback form, demo cache) and which journey covers each (TASK-038; D2 Part B §18 #1) in `docs/execution/evidence/failure-state-journey-map.md`

**Checkpoint**: Phase 2 turns the spec's acceptance scenarios into runnable, file-backed gates. No new application code.

---

## Phase 3: User Story 1 — Release-candidate checks (TASK-037, TASK-038)

**Goal**: On the release candidate, the unit suite and the Playwright essential-journey + safeguarding journeys run and the result list records per-TC pass/fail/not-run with companion-only results kept separate.

**Independent Test**: `npm test` records the unit count; `npx playwright test` records the journey count; the result file maps every TC-001–TC-066 to PASS, FAIL or NOT RUN with a reason. (TASK-037, TASK-038; TC-001–TC-066; D2 Part B §18 #1, #6)

### Tests for User Story 1

> Write these tests FIRST; ensure they FAIL before implementation.

- [ ] T009 [P] [US1] Unit test in `tests/release/unit-threshold.test.ts` that asserts the spec-kit count of unit-test files and total cases is at least 60 with at least 30 normaliser cases (TASK-037; D6 §7)
- [ ] T010 [P] [US1] Integration test in `tests/release/tc-coverage.test.ts` that loads the `docs/execution/evidence/tc-coverage.md` (created below) and asserts every TC-001–TC-066 is mapped to PASS, FAIL or NOT RUN (TASK-038; D2 Part B §18 #1)
- [ ] T011 [P] [US1] Unit test in `tests/release/companion-only.test.ts` that asserts the TC-062 (companion-only) row is listed in a separate section and never counted as an app/service pass (TASK-038; TC-062; TEAM_HANDOVER_V2 §9)

### Implementation for User Story 1

- [ ] T012 [US1] Create `docs/execution/evidence/tc-coverage.md` with a 66-row table: `TC ID`, `Description`, `Source (D6/D2/D3/D4)`, `Owner`, `Gate (G2/G4)`, `Result (PASS|FAIL|NOT RUN)`, `Reason`, `Evidence (command/URL/file)`, `Date (Asia/Dhaka)`; one row per TC-001–TC-066, TC-062 in a separate section. (TASK-038; D2 Part B §18 #1, #6; `docs/execution/evidence/tc-coverage.md`)
- [ ] T013 [P] [US1] Record the unit-test totals (file count, case count, normaliser case count) into `docs/execution/evidence/release-candidate-thresholds.md` after `npm test` on the release candidate (TASK-037; D6 §7)
- [ ] T014 [P] [US1] Record the Playwright essential-journey + safeguarding-journey totals (pass / fail / not-run counts) into `docs/execution/evidence/release-candidate-thresholds.md` after `npx playwright test` (TASK-038; D6 §7)
- [ ] T015 [P] [US1] Record the TC-028 log-scan result: 0 phone-number or seeded child-name matches in the Playwright run log, by piping the run log through the existing redaction patterns (TC-028; NFR-010; D2 Part B §18 #6) in `docs/execution/evidence/log-scan-tc028.md`
- [ ] T016 [US1] Run the safeguarding gate list from T007 as a checklist: refused candidate access for parent/staff/unverified, no image input, illegal transition rejection, append-only audit, no alert wording. Mark FAIL in `tc-coverage.md` if any item is unmet (TASK-038; TC-019, TC-022–TC-027, TC-029, TC-032; BR-001, BR-002, BR-006, BR-007, BR-012, BR-013)

**Checkpoint**: User Story 1 is independently testable: on a release candidate, the team can run the two commands and produce the result file. The result file is the only thing this story claims.

---

## Phase 4: User Story 2 — Bangla, keyboard, 2-phone (TASK-034, TASK-035, TASK-036)

**Goal**: Every Must screen is usable in Bangla and English, by keyboard, at small widths and enlarged text; the two-phone checklist is recorded when the phones are available; otherwise the gap is recorded.

**Independent Test**: axe-core scan in light and dark themes; 320 CSS px reflow; 200 % text zoom; 400 % viewport zoom; a bilingual-state checklist; the device checklist file when phones are available. (TASK-034, TASK-035, TASK-036; NFR-011, NFR-013; FR-033; D3; D4; TC-033, TC-058, TC-061)

### Tests for User Story 2

- [ ] T017 [P] [US2] Unit test in `tests/release/bilingual-keys.test.ts` that asserts every state key in `src/locales/index.ts` has both `bn` and `en` (TASK-035; FR-033)
- [ ] T018 [P] [US2] Unit test in `tests/release/d3-string-exactness.test.ts` that loads the bilingual-state checklist and asserts each E-001–E-024 entry's text matches the D3 string (TASK-035; D3 §§ states, E-001–E-024)
- [ ] T019 [P] [US2] Unit test in `tests/release/a11y-targets.test.ts` that scans the parent-screen components for ≥44 px touch targets (TASK-034; FR-033; D4)
- [ ] T020 [P] [US2] Unit test in `tests/release/d4-no-red-on-parent.test.ts` that scans the parent-screen components for the colour `red` / `danger` literals and asserts 0 matches (TASK-034; D4 behaviour rules; FR-033)

### Implementation for User Story 2

- [ ] T021 [US2] Generate `docs/execution/evidence/bilingual-state-checklist.md` from `src/locales/index.ts` and the D3 string table with: key, screen, bn, en, D3 source string, mismatch flag (TASK-035; FR-033; `docs/execution/evidence/bilingual-state-checklist.md`)
- [ ] T022 [P] [US2] Run `npx playwright test --grep @a11y` and record the axe result (0 serious/critical in light + dark) into `docs/execution/evidence/axe-result.md` (TASK-034; TC-033; NFR-011)
- [ ] T023 [P] [US2] Run the 320 CSS px / 200 % text / 400 % zoom Playwright checks and record the reflow outcome into `docs/execution/evidence/reflow-check.md` (TASK-034; TC-058; D2 Part B §18 #9)
- [ ] T024 [P] [US2] Create `docs/device-test.md` with: device identifier (model, Android version, build), Bangla glyph render pass/fail, microphone record pass/fail, 360 px layout pass/fail, signed-by, date (Asia/Dhaka). One row per phone. (TASK-036; NFR-013; TC-061; `docs/device-test.md`)
- [ ] T025 [P] [US2] **Human/organiser-blocked:** If only 0 or 1 of the required Android phones is available, the row is recorded as `MISSED: device gap` and the gate stays open. This lane does not accept an emulator as a substitute. (NFR-013; DEP-009; OD-4)

**Checkpoint**: User Story 2 is independently testable when the device and the build are present. The checklist, the axe result and the reflow check are software; the device sign-off is human.

---

## Phase 5: User Story 3 — Frozen, honest evaluation (TASK-039, TASK-040, TASK-041, TASK-043)

**Goal**: The five promised metrics are reported on a frozen manifest + freeze build, with denominators, abstention/coverage, baselines, ≥2 failure examples and "not measured" where applicable. **No heldout tuning, no schema/model/manifest change after freeze.**

**Independent Test**: `npm run eval:all` (or the split `eval:extract|match|dedupe|wer|time|audit` scripts) on the dev split first, then on the held-out split after freeze; the report sections and the hashes are inspected. (TASK-039, TASK-040, TASK-041, TASK-043; FR-028; TC-020, TC-056, TC-064; D2 Part B §17; GOAL-001–GOAL-005, GOAL-008, GOAL-009)

### Tests for User Story 3

- [ ] T026 [P] [US3] Unit test in `tests/eval/denominators.test.ts` that loads the frozen report (`eval/reports/freeze.json` after T030) and asserts every metric has a numerator and a denominator (TASK-039, TASK-043; FR-028; TC-020; D2 Part B §17)
- [ ] T027 [P] [US3] Unit test in `tests/eval/cache-exclusion.test.ts` that asserts the report's `cache_hits` array is empty, and that any cache or fixture response detected in the run is in `cache_excluded_metrics`, not in the metric value (TASK-039; TC-056; FR-027; D2 Part B §17)
- [ ] T028 [P] [US3] Unit test in `tests/eval/heldout-freeze.test.ts` that asserts the report's `frozen.manifest_hash`, `frozen.model_revision`, `frozen.prompt_template_hash`, `frozen.preprocessing_hash` and `frozen.threshold_hash` are all non-empty and that the manifest hash matches the manifest at `eval/data/manifest.json` (TASK-043; FR-028; PHASE_3 AMD-3-3)
- [ ] T029 [P] [US3] Unit test in `tests/eval/failure-examples.test.ts` that asserts the report has at least 2 failure examples with the source record ID, the predicted label, the true label and a one-line note (TASK-043; TC-020; STORY-022 AC1)

### Implementation for User Story 3

- [ ] T030 [US3] Add an `eval/reports/` writer that emits `eval/reports/freeze.json` with: per-metric `{name, value, numerator, denominator, coverage, abstention, baseline, fail_examples[], cache_excluded, measured_at, commit, model_revision, manifest_hash, prompt_template_hash, preprocessing_hash, threshold_hash}`; the five metrics are Recall@5, top-1 precision with coverage, query-level P@5 + named aggregate shortlist precision, no-match false suggestions + abstention, duplicate precision/recall/F1. (TASK-039, TASK-043; FR-028; TC-020, TC-064; D2 Part B §17; `eval/reports/`)
- [ ] T031 [P] [US3] Add a small "freeze" pre-flight that fails the dev run if the manifest, model, preprocessing, threshold and prompt/template hashes are not recorded, and fails the held-out run if any hash differs from the dev run. (TASK-039, TASK-043; FR-028; PHASE_3 AMD-3-3; `scripts/eval/freeze-preflight.ts`)
- [ ] T032 [P] [US3] Add a cache-exclusion writer that scans the run trace for any cache key, fixture ID or `cached: true` response, and rejects those rows from the metric value (TC-056; FR-027; D2 Part B §17; `scripts/eval/cache-exclude.ts`)
- [ ] T033 [P] [US3] Add a WER writer that emits WER = (S+D+I)/N and critical-field error count; repeats are flagged with `repeat: true` and never counted as new samples. (TASK-040; GOAL-005; A-012; `scripts/eval/wer.ts`)
- [ ] T034 [P] [US3] Add a timing-study writer that emits `eval/data/timing.csv` with `volunteer_id, scenario_id, condition, started_at_utc, completed_at_utc, completion, help_used`; the report shows median, range, completion numerator/denominator and is labelled `exploratory`. (TASK-041; GOAL-001; A-010, A-011; NFR-012; `eval/data/timing.csv`, `scripts/eval/timing.ts`)
- [ ] T035 [P] [US3] Add a 50-report labelled extraction evaluator that reports present-field accuracy, false additions and omissions separately from null agreement, and never uses null agreement as headline accuracy. (TASK-011, TASK-039; GOAL-002; `scripts/eval/extract.ts`)
- [ ] T036 [P] [US3] **Human/organiser-blocked:** WER speakers and ≥5 timing volunteers are not implemented in this lane. TASK-040 and TASK-041 are recorded as `MISSED: volunteers UNKNOWN` until OD-5 is closed. (OD-5; A-010, A-011, A-012; OQ-019 default no)

**Checkpoint**: User Story 3 is independently testable on the dev split. The held-out run is gated on the freeze pre-flight (T031) and on the manifest, model, thresholds and prompt/template hashes being committed (TASK-064). Nothing here tunes on heldout data.

---

## Phase 6: User Story 4 — One identified production build (TASK-042, TASK-060)

**Goal**: The release owner deploys the freeze build with seeded synthetic data, runs `npm run smoke`, identifies the build and records the D2 Part B §12.1 measurements.

**Independent Test**: `npm run smoke` on production passes; build is identified by commit and the `r2-freeze` tag; D2 Part B §12.1 measurements are recorded. (TASK-042; D2 Part B §15.3–15.5; TASK-060; NFR-001–NFR-006; TC-034)

### Tests for User Story 4

- [ ] T037 [P] [US4] Integration test in `tests/release/smoke-script.test.ts` that asserts the `smoke` script runs the health check, the sign-in, one extraction, and the map stats endpoints in order and writes a JSON result with `commit`, `tag`, `seed_set` and `result` fields. (TASK-042; D2 Part B §15.3; `scripts/smoke.*`, `tests/release/smoke-script.test.ts`)
- [ ] T038 [P] [US4] Unit test in `tests/release/perf-record.test.ts` that loads the perf record file and asserts each D2 Part B §12.1 target has a value, a sample size and a met/missed flag. (TASK-060; NFR-001–NFR-006; TC-034; `docs/execution/evidence/perf-record.md`)

### Implementation for User Story 4

- [ ] T039 [US4] Add a `scripts/smoke.*` script that calls `/api/health`, `/api/auth/sign-in`, one `/api/intake/extract` against a fixture, and `/api/dashboard/stats`, and writes the result to `docs/execution/evidence/smoke-result.json` with `commit`, `tag`, `seed_set`, `result` and `run_at_utc` fields. (TASK-042; D2 Part B §15.3; `scripts/smoke.*`)
- [ ] T040 [P] [US4] Add `docs/execution/evidence/perf-record.md` with one row per D2 Part B §12.1 target: `target`, `value`, `sample_size`, `met|missed|not measured`, `evidence_url`, `measured_at_utc`. (TASK-060; NFR-001–NFR-006; TC-034; `docs/execution/evidence/perf-record.md`)
- [ ] T041 [P] [US4] Add a rollback step to the smoke script: on a failed check, the script records the failure and notes the previous green commit; the release owner redeploys. The previous green commit is never silently replaced. (D2 Part B §15.4; `scripts/smoke.*`)
- [ ] T042 [P] [US4] **Human/organiser-blocked:** The actual managed DB host (OQ-021 / OD-6) and the real `npm run smoke` against production are not runnable in this lane. The script is delivered; the run is human/organiser. (OD-6; D2 Part B §15.5)
- [ ] T043 [P] [US4] **Human/organiser-blocked:** The actual NFR-001–NFR-006 measurements require a production-like environment and sample size; the record file is delivered with a `not measured` row per target until the run is human-evidenced. (NFR-001–NFR-006; TC-034)

**Checkpoint**: User Story 4 is independently testable on a local DB with the `npm run smoke` script. The production run is human/organiser.

---

## Phase 7: User Story 5 — Round 2 package (TASK-044, TASK-045, TASK-046)

**Goal**: The deck (5–8 slides), the video (1–2 min), the README and the Drive folder are built, every number traces to the frozen report or reads "not measured", the wording guard + `fera-safeguarding-reviewer` pass, the link check passes logged-out, and the package is sent through the organiser-confirmed channel with receipt evidence.

**Independent Test**: deck slide count, wording-guard scan, link-check script, receipt evidence. (TASK-044, TASK-045, TASK-046; D6 §10; D7 §3.1; PHASE_4 AMD-4-1; TC-025, TC-037, TC-066)

### Tests for User Story 5

- [ ] T044 [P] [US5] Unit test in `tests/release/deck-slides.test.ts` that asserts the deck has between 5 and 8 slides and the metrics slide names all five metrics (TASK-044; GOAL-009; BR-026)
- [ ] T045 [P] [US5] Unit test in `tests/release/wording-guard.test.ts` that scans the deck text, video script and README for banned tokens (`alert`, `broadcast`, `runaway`, `rescue`, `উদ্ধার`, `ফেরত`, `পালিয়ে`, `delivered`, `returned`, `CID`, `police integration`, `legal compliance`, `interviews`) and asserts 0 matches outside quotation marks (TC-025, TC-037, TC-066; BR-002, BR-003, BR-005, BR-011)
- [ ] T046 [P] [US5] Unit test in `tests/release/link-check.test.ts` that opens every URL in the links file with a logged-out context (no cookies, no localStorage) and asserts 200 OK (TASK-046; TC-066; LINK-CHECK)

### Implementation for User Story 5

- [ ] T047 [US5] Add `docs/execution/evidence/deck-wording-scan.md` produced by `tests/release/wording-guard.test.ts` with the banned-token list, the scanned files, the matches (none expected) and the run date (TC-025, TC-037, TC-066; BR-002, BR-003, BR-005, BR-011)
- [ ] T048 [P] [US5] Add `docs/execution/evidence/link-check.md` with the per-URL result, the logged-out context, the HTTP code and the run date. (TASK-046; TC-066; LINK-CHECK; `docs/execution/evidence/link-check.md`)
- [ ] T049 [P] [US5] Add `docs/execution/evidence/figures-trace.md` with one row per numeric claim in the deck / video / README: `figure`, `deck_slide`, `source_in_freeze_json`, `measured_at_utc`, `label_synthetic_mock_cached_simulation_time_compressed (yes/no)`. (TASK-044, TASK-045; GOAL-009; `docs/execution/evidence/figures-trace.md`)
- [ ] T050 [P] [US5] **Human/organiser-blocked:** The deck, video and README are drafted by the owners; this lane only adds the wording-guard, link-check and figures-trace evidence. Submission through the organiser-confirmed channel is the lead's task and requires OD-1 to close. (OD-1; PHASE_4 AMD-4-1; TEAM_HANDOVER_V2 §10)

**Checkpoint**: User Story 5 is independently testable on the draft materials. The organiser send and the receipt are human/organiser.

---

## Phase 8: User Story 6 — Finale offline (TASK-053, TASK-054, TASK-055, TASK-058)

**Goal**: The finale demo runs on a laptop-local stack with `DEMO_MODE=1` and the network off; all roles share one database; 5/5 rehearsals pass with at least one internet-off; a labelled backup recording is stored in two locations; the finale deck fits in 10 minutes.

**Independent Test**: with `DEMO_MODE=1` and the network disabled, run the scripted journey with all roles in separate browser profiles on one database; log 5 rehearsals; time the deck. (STORY-023; FR-027, FR-032; TASK-053, TASK-054, TASK-055, TASK-058; GOAL-007; NFR-007; D6 §9; D7 §3.2; TC-021, TC-057)

### Tests for User Story 6

- [ ] T051 [P] [US6] Integration test in `tests/finale/offline-one-db.test.ts` that boots the local stack (`npm run db:up && npm run db:reset && npm run seed -- --set demo && npm run build && DEMO_MODE=1 npm start`), then with the network blocked at the OS level, runs the scripted journey from three browser profiles (parent, staff, officer) against the same DB and asserts the `cached` and `synthetic` labels are visible at every step. (TASK-053; FR-027, FR-032; TC-021, TC-057; STORY-023 AC1–AC2; `tests/finale/offline-one-db.test.ts`)
- [ ] T052 [P] [US6] Unit test in `tests/finale/role-same-db.test.ts` that asserts the offline harness rejects any second-DB connection and refuses to merge a new cloud report with local officer state. (D6 §9.4; D7 §3.2; TEAM_HANDOVER_V2 §8)
- [ ] T053 [P] [US6] Unit test in `tests/finale/deck-timing.test.ts` that loads the finale deck markdown, simulates the presenter's slide timing at rehearsal cadence and asserts the run is ≤ 10 minutes. (TASK-055; D7 §3.2)

### Implementation for User Story 6

- [ ] T054 [US6] Add `scripts/finale/rehearsal.sh` that: (1) blocks the network at the OS firewall, (2) starts the local stack with `DEMO_MODE=1`, (3) runs the scripted journey with three browser profiles against one DB, (4) writes a one-line JSON row to `docs/execution/evidence/rehearsal-log.jsonl` with `run_id, run_at_utc, network_state, profiles, db, result, notes`. (TASK-054; GOAL-007; NFR-007; `scripts/finale/rehearsal.sh`, `docs/execution/evidence/rehearsal-log.jsonl`)
- [ ] T055 [P] [US6] Add `docs/execution/evidence/rehearsal-log.md` summarising the JSONL log: 5/5 pass, ≥1 internet-off, each run uses one backend only, cloud failure → fresh local synthetic scenario + spoken disclosure, no mixing of cloud + local officer state. (D6 §9.4; D7 §3.2; `docs/execution/evidence/rehearsal-log.md`)
- [ ] T056 [P] [US6] Add `docs/execution/evidence/backup-recording.md` with the file path on the laptop and the Drive path; the recording is labelled `finale-backup-2026-10-24.mp4` and carries the `synthetic`, `cached` and `time-compressed` labels on screen. (TASK-058; D7 §3.2; `docs/execution/evidence/backup-recording.md`)
- [ ] T057 [P] [US6] **Human/organiser-blocked:** The laptop, spare laptop and hotspot (OD-4) are not in this lane. If the venue internet is up, the internet-off run is still required (the rehearsal must include at least one with the network off). (D6 §9.4; OD-4)

**Checkpoint**: User Story 6 is independently testable on a laptop with the local stack. The 5-rehearsal log and the backup recording depend on the devices and the venue.

---

## Phase 9: User Story 7 — Mentor fixes (TASK-056) and User Story 8 — User conversations (TASK-057) (HUMAN/ORGANISER-BLOCKED)

- [ ] T058 [US7] **Human/organiser-blocked:** The mentor session 2 fix list is empty (OD-3). No TASK-056 row can be claimed by this lane. (DEP-010; OD-3; PHASE_2 mentor table)
- [ ] T059 [US7] **Human/organiser-blocked:** If a mentor-fix row is added later, it is applied by the D6 owner and verified before the gate that needs it, or recorded as missed with a reschedule by the lead. A fix that would weaken review-before-submit, officer confirmation, referral, audit or redaction is refused. (Constitution I–V; D6 §11)
- [ ] T060 [US8] **Human/organiser-blocked:** OQ-019 default is no. TASK-057 stays blocked until mentors/faculty clear OQ-019. The interview count stays UNKNOWN. No interview finding appears in any deliverable. (OQ-019; PHASE_5 TASK-057; AMD-AGENTS-6)
- [ ] T061 [US8] **Human/organiser-blocked:** If OQ-019 is cleared later, the conversations must be consented, no child payload may be collected, every note must have a consent record, and the findings slide must draw only on those notes. (TASK-057; BR-026)

---

## Phase 10: Convergence matrix (per D6 acceptance)

**Purpose**: produce a single matrix that records what is buildable, what is human/organiser-blocked, and the evidence file per item. This is the desk's primary output for the coordinator.

- [ ] T062 [P] Create `docs/execution/evidence/pre-main-convergence-desk.md` with the matrix: per spec 001–007, per user story, per TC-### acceptance, list the evidence file path, the gap type (`missing`/`partial`/`converged`/`human-blocked`/`organiser-blocked`/`production-blocked`) and the buildable task ID. (FR-027, FR-028, FR-032; TASK-037–060; `docs/execution/evidence/pre-main-convergence-desk.md`)

**Checkpoint**: Phase 10 is the desk's handoff to the coordinator. The matrix is the only thing this lane claims as the "convergence" deliverable; everything else is buildable work assigned to its owner.


## Coordinator integration disposition

The active integration branch already contains `003-parent-outputs/plan.md` and `tasks.md`, the 26-test local release checker, backup/Q&A preparation and the existing `eval/*.mjs` writers. Old planned `scripts/eval/*.ts` or evidence filenames are aliases of implemented behavior, not requirements to duplicate tooling. Freeze checks are implemented in `eval/metric-utils.mjs` and exercised by `tests/eval/{all,extract,match,dedupe}.test.ts`; freeze is unset and no held-out run is permitted or claimed. Native model revision/hash pins are in `src/server/embeddings/model.ts`. Root verification has passed 321 PostgreSQL tests across 31 files and 78 desktop/mobile browser checks with zero skips. The optional research/data-model/contract files may link to the canonical V2 pack, frozen runtime SQL and `src/contracts/`; their absence does not establish missing application behavior. Remaining local CLI, actual restart, poster download and header acceptance checks are consolidated in the final integration report; personal ownership is never a software blocker. Human studies, physical-device acceptance, production/public-sharing access and frozen quality remain pending.

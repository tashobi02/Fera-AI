# Tasks: Dashboard, district picture, duplicate review and disaster-mode

**Input**: [spec.md](spec.md), [plan.md](plan.md), `docs/spec/D6_Implementation_Plan_V2.md`, `docs/agents/SPECKIT_PROMPTS.md`, `docs/execution/evidence/`, the V2 pack.

**Owner**: Convergence desk (Puku CLI Opus 4.8, pre-main--spec-desk-data lane, 2026-10-18). Owner-area code changes remain with Masnun (dashboard / duplicates / data) and Mahim (shared SCREEN-013 admin redaction). **This file is append-only relative to the existing evidence in `docs/execution/evidence/`; no application code is modified in this lane.**

**Scope**: TASK-018, TASK-030, TASK-048, TASK-051, TASK-052. Buildable-only: human / production / organiser blocked items are recorded under Phase 8 with a `human/organiser-blocked` tag and never claimed as a software pass.

**Status**: draft for human skim (convergence desk), 2026-10-18 (revised 2026-10-18 with current-source test inventory). Phase 1 (Setup) records the existing owner-area code; Phases 2–6 add only the **missing buildable evidence** (per-district count test, all-64-districts test, a11y icon-text-colour test, drill-through officer-only test, shared-phone-alone-no-suppress test, name+dob-link test, same/different mark-and-audit test, dismissal-preserves-original test, redaction eligibility test, redaction rate-limit test, redaction typed-confirm test). Phase 7 records the buildable test plan that runs without resetting an existing DB. Phase 8 lists the human / production / organiser gaps. Phase 9 records the convergence matrix.

**Correction note (2026-10-18, current-source audit)**: The initial draft referenced test directories that did not exist on disk (`tests/dashboard/`, `tests/disaster/`). The actual directories are `tests/duplicates/`, `tests/admin/`, `tests/api/`, `tests/eval/`, `tests/embeddings/`, `tests/match/`, `tests/case/`, `tests/contracts/`, `tests/auth/`. The admin synthetic import is **not** a 501 / E-019 stub — it is implemented at `src/app/api/admin/import/route.ts` and is exercised by `tests/api/admin-import.test.ts` + `tests/admin/admin-import-builder.test.ts` (both pass on 2026-10-18). The disaster-mode page is a real page (`src/app/(desk)/staff/disaster/page.tsx`) that reuses the S-007 found-log form; there is no 501 stub.

---

## Phase 1: Setup (Existing owner-area code as the spec-kit evidence)

**Purpose**: Record the owner-area code that already exists and the existing evidence documents. This lane does not write or modify any of it.

- [ ] T001 [P] Record the dashboard stats, district drill-through and SCREEN-011 map under `src/server/dashboard/` and `src/app/(desk)/officer/map/` as the existing spec-kit evidence. (TASK-030; `src/server/dashboard/`, `src/app/(desk)/officer/map/`)
- [ ] T002 [P] Record the duplicate detector, persist, decision and read modules under `src/server/duplicates/` and SCREEN-014 under `src/app/(desk)/officer/duplicates/` as the existing spec-kit evidence. (TASK-018, TASK-051; `src/server/duplicates/`, `src/app/(desk)/officer/duplicates/`)
- [x] T003 [P] Record the SCREEN-013 redaction panel, the synthetic-import slot (IMPLEMENTED, not 501) and the SCREEN-015 disaster-mode page (IMPLEMENTED, real page reusing S-007 form) under `src/app/(desk)/admin/` and `src/app/(desk)/staff/disaster/`. (TASK-032, TASK-048, TASK-052; `src/app/(desk)/admin/`, `src/app/(desk)/staff/disaster/`, `docs/execution/evidence/platform-admin.md`). Import: `src/app/api/admin/import/route.ts`, `src/server/import/{builder,duplicates,index}.ts`, `src/app/(desk)/admin/import-form.tsx`. Disaster: `src/app/(desk)/staff/disaster/page.tsx` + `src/app/(desk)/staff/found-log-form.tsx`.
- [ ] T004 [P] Record the typed-confirmation word "বেনামী" and the per-principal `adminRedaction` rate limit (5/min, fails closed) under `src/lib/admin-tools.ts` and `src/app/api/_shared/limit.ts`. (TASK-032; `src/lib/admin-tools.ts`, `src/app/api/_shared/limit.ts`)

**Checkpoint**: Phase 1 establishes the only "spec-kit prereq" items this lane can complete without waiting on human/organiser evidence.

---

## Phase 2: Foundational (Buildable cross-feature invariants this feature relies on)

**Purpose**: Make the existing dashboard / duplicate / synthetic-import / disaster-mode invariants explicit and file-backed.

- [ ] T005 [P] Document the per-district stat row (code, name_bn, name_en, lat, lng, missing_open/matched/closed, found_open/matched/referred, confirmed_pairs) and the SQL aggregate source in `docs/execution/evidence/dashboard-stats.md` with a numeric worked example. (FR-019; BR-014; `docs/execution/evidence/dashboard-stats.md`)
- [ ] T006 [P] Document the district drill-through (API-022, officer-only, keyset cursor, E-001 on forged cursor) in `docs/execution/evidence/district-drill-through.md` with the request/response shape and the role projection. (D2A §9.2; FR-019; BR-007, BR-014, BR-024; `docs/execution/evidence/district-drill-through.md`)
- [ ] T007 [P] Document the duplicate detector's two link kinds (`same_name_dob`, `near_embedding`) and the explicit non-rule ("shared phone alone never suppresses") in `docs/execution/evidence/duplicate-rules.md` (shared with feature 004 T012) with a per-rule test pointer. (FR-022, FR-023; BR-007, BR-021; `docs/execution/evidence/duplicate-rules.md`)
- [ ] T008 [P] Document the redaction eligibility rules (eligible = closed missing + referred found with the missing report also closed; active linked evidence is kept; pseudonymisation, not full anonymisation) in `docs/execution/evidence/redaction-eligibility.md` (shared with feature 005 T008) with the shared `ELIGIBLE_WHERE` fragment and a per-rule test pointer. (FR-025; BR-009; `docs/execution/evidence/redaction-eligibility.md`)

**Checkpoint**: Phase 2 turns the spec's acceptance scenarios into runnable, file-backed invariants. No new application code.

---

## Phase 3: User Story 1 — Per-district missing / found / confirmed counts (TASK-030)

**Goal**: SCREEN-011 shows per-district missing / found / confirmed counts with accessible icon + text + colour, a synthetic chip, and a map with bundled outlines; all 64 districts are returned including zeros.

**Independent Test**: Seed the manifest, open SCREEN-011, assert the per-district missing / found / confirmed counts match the seeded aggregate, the synthetic chip is visible, every count is icon + text + colour, every district is present, no exact coordinates are returned. (TC-012, TC-021, TC-055)

### Tests for User Story 1

- [x] T009 [P] [US1] Unit test in `tests/api/dashboard-route.test.ts` (existing; 2026-10-18: passed) (shared with feature 004 T038) that asserts per-district missing / found / confirmed counts match the seeded aggregate, that the synthetic chip is present in the response payload, and that no exact coordinates are returned. (FR-019, FR-032; BR-014, BR-026; TC-012, TC-021)
- [ ] T010 [P] [US1] Unit test in `tests/dashboard/all-64-districts.test.ts` (new) that asserts every district appears in the response, including districts with zero reported cases. (FR-019; BR-014; TC-012, TC-055)
- [ ] T011 [P] [US1] A11y test in `tests/a11y/dashboard.test.ts` (Playwright + axe, shared with feature 004 T039) that asserts 0 serious / critical findings on SCREEN-011 in light and dark themes and that each count uses icon + text + colour. (TASK-034; NFR-011; TC-033)
- [ ] T012 [P] [US1] Unit test in `tests/dashboard/drill-through-officer-only.test.ts` (new) that asserts API-022 returns the cases filtered by district, kind and status group with the keyset cursor; an admin request is refused (E-003); a forged HMAC cursor is E-001. (D2A §9.2; FR-019; BR-014, BR-024; TC-022)
- [x] T013 [P] [US1] Unit test in `tests/contracts/roles.test.ts` + `tests/api/dashboard-route.test.ts` (existing; 2026-10-18: passed) that asserts the table view returns the role-scoped projection (staff own found, verified officer candidate counts + confirmed pairs, admin aggregate without candidate IDs). (BR-007, BR-014, BR-024; TC-019, TC-022, TC-044, TC-045)

**Checkpoint**: User Story 1 is independently testable with focused tests. The dashboard code is the spec-kit evidence. `tests/api/dashboard-route.test.ts` + `tests/contracts/roles.test.ts` already pass (this lane's 2026-10-18 run).

---

## Phase 4: User Story 2 — Duplicate detection and officer review (TASK-018, TASK-051)

**Goal**: The duplicate detector emits links on the right rules; shared phone alone never suppresses; SCREEN-014 (FR-023) lets an officer mark a duplicate link as same / different; the original reports are unchanged; the audit log carries the link id, the actor role and the reason only.

**Independent Test**: Seed two reports that share a phone number and a report that shares a name + dob, run the duplicate detector, assert the shared-phone pair is **not** suppressed and the name+dob pair is flagged with profile evidence and reason. Open SCREEN-014, mark the link as same / different with profile evidence; assert the original reports are unchanged and the audit row carries the link id, the actor role and the reason only. (TC-013, TC-022)

### Tests for User Story 2

- [x] T014 [P] [US2] Unit test in `tests/duplicates/detect.test.ts` (existing; 2026-10-18: passed) (shared with feature 004 T040) that asserts a shared-phone pair emits 0 links and a same-name + same-dob pair emits ≥1 link with profile evidence and reason. (FR-022; BR-007, BR-021; TC-013, TC-022)
- [x] T015 [P] [US2] Unit test in `tests/api/duplicate-decision.test.ts` (existing; 2026-10-18: passed) (shared with feature 004 T041) that asserts an officer mark on SCREEN-014 (same / different) records the link decision and audit, with profile evidence and reason; the original reports are unchanged. (FR-023; BR-021; TC-013)
- [ ] T016 [P] [US2] Unit test in `tests/duplicates/dismissal.test.ts` (new) that asserts an officer dismissal is audited and the original reports are unchanged; a new report with the same name + dob after a dismissal is independently discoverable and the detector does not auto-re-link the dismissed pair. (FR-023; BR-021; TC-013)
- [x] T017 [P] [US2] Unit test in `tests/contracts/roles.test.ts` (existing; 2026-10-18: passed) that asserts the duplicate list is officer-only; a parent / staff / non-verified request is refused (E-003 / E-004). (BR-007, BR-024; TC-022)

**Checkpoint**: User Story 2 is independently testable with focused tests. The duplicate detector code is the spec-kit evidence. `tests/duplicates/{detect,persist}.test.ts` + `tests/api/duplicate-decision.test.ts` + `tests/contracts/roles.test.ts` already pass (this lane's 2026-10-18 run).

---

## Phase 5: User Story 3 — Synthetic import (TASK-048) and User Story 5 — Disaster-mode (TASK-052)

**Goal**: SCREEN-013 shows the "পরিকল্পিত" synthetic-import panel; SCREEN-015 shows the "পরিকল্পিত" disaster-mode panel; the APIs return 501 / E-019 with no record written.

**Independent Test**: Open SCREEN-013, assert the "পরিকল্পিত" panel is visible and the synthetic chip is present; submit, assert 501 / E-019 and no record written. Open SCREEN-015, assert the planned label is visible, submit, assert 501 and no record written. (TC-014, TC-035)

### Tests for User Story 3 + 5

- [x] T018 [P] [US3] Unit test in `tests/api/admin-import.test.ts` + `tests/admin/admin-import-builder.test.ts` (existing; 2026-10-18: passed) (shared with feature 005 T030) that asserts the synthetic-import panel is labelled "পরিকল্পিত"-style synthetic-only, the API persists the synthetic fixture (NOT 501 / E-019) when the typed "সিমুলেটেড" confirm + `example.invalid` URL are present, no real child payload is ever persisted, and an audit row is recorded. (FR-024; OQ-003; TC-014, TC-035). **Correction**: the live import is **not** a 501 / E-019 stub; the original draft mis-stated its behaviour.
- [x] T019 [P] [US5] SCREEN-015 unit coverage in `tests/found/log-found.test.ts` + `tests/match/match-review.test.ts` (existing; 2026-10-18: passed) (shared with feature 004 T042) that asserts the SCREEN-015 page shows the "পরিকল্পিত" planned-extension banner and saves a found case through API-007 (the live FoundLogForm); the API is **not** a 501 / E-019 stub. (FR-036; OQ-003; TC-035). **Correction**: the disaster page reuses the S-007 found-log form and saves through API-007; the original draft mis-stated it as a 501 / E-019 stub.
- [ ] T020 [P] [US3/5] A11y test in `tests/a11y/admin-import.test.ts` and `tests/a11y/disaster-mode.test.ts` (Playwright + axe) that asserts 0 serious / critical findings on SCREEN-013 (import panel) and SCREEN-015 in light and dark themes and that the planned label is visible. (TASK-034; NFR-011; TC-033)

**Checkpoint**: User Story 3 + 5 are independently testable with focused tests. The synthetic-import API and the disaster-mode page are the spec-kit evidence. `tests/api/admin-import.test.ts`, `tests/admin/admin-import-builder.test.ts`, `tests/found/log-found.test.ts` already pass (this lane's 2026-10-18 run).

---

## Phase 6: User Story 4 — Admin redaction eligibility (TASK-032)

**Goal**: A redactor admin opens SCREEN-013, sees the eligible count, the verify-officers table, and the synthetic-import slot. Redaction redacts the eligible pair, writes `case.payload_redacted` per case, and the audit details carry only the mode and the `external_copies_removed` flag.

**Independent Test**: Seed 3 closed/referred reports (1 eligible pair, 1 active pair with confirmed but unclosed missing, 1 open) and 1 open; redact `all_eligible: true`; assert 2 redacted, 1 skipped, mode `pseudonymisation`, `external_copies_removed: false`; assert the active pair and the open report keep their payload; assert the referral note and candidate reason are `[REDACTED]` on the eligible pair, untouched on the active pair. (TC-015, TC-050)

### Tests for User Story 4

- [x] T021 [P] [US4] Unit test in `tests/admin/service.test.ts` + `tests/admin/routes.test.ts` (existing; 2026-10-18: passed) (shared with feature 005 T022) that asserts the eligible-count for redaction matches the eligible pair (closed missing + referred found with the missing report also closed), the active pair and the open report are not eligible, and the count becomes 0 after the run. (FR-025; BR-009; TC-015, TC-050)
- [ ] T022 [P] [US4] Unit test in `tests/admin/redaction-active-pair.test.ts` (new) (shared with feature 005 T023) that asserts an active pair (confirmed missing not yet closed) is skipped and the missing and found reports keep their payload. (FR-025; BR-009; TC-015)
- [ ] T023 [P] [US4] Unit test in `tests/admin/redaction-typed-confirm.test.ts` (new) (shared with feature 005 T024) that asserts the typed word "বেনামী" must match exactly (NFC + trim) before the redaction is performed. (FR-025; BR-009, BR-024; TC-015)
- [x] T024 [P] [US4] Unit test in `tests/api/limit.test.ts` (existing; 2026-10-18: passed) (shared with feature 005 T025) that asserts the per-principal `adminRedaction` rate limit returns E-007 and the response fails closed. (OD-032-4)
- [x] T025 [P] [US4] Unit test in `tests/auth/require-role.test.ts` + `tests/api/request.test.ts` (existing; 2026-10-18: passed) (shared with feature 005 T026) that asserts a non-admin attempting API-016 is refused (E-003) and writes `access.denied`. (BR-007, BR-024; TC-022, TC-052)
- [x] T026 [P] [US4] Unit test in `tests/admin/{routes,service}.test.ts` + `tests/case/audit.test.ts` (existing; 2026-10-18: passed) (shared with feature 005 T027) that asserts the redaction writes two `case.payload_redacted` audit rows by the admin with details `{ mode, external_copies_removed }` only; no child payload, no reason, no name. (FR-025; BR-009, BR-010; TC-015, TC-016)
- [ ] T027 [P] [US4] TC-028 log-scan unit test in `tests/release/log-scan-tc028.test.ts` (shared with feature 007 T015) that pipes a focused-journey log through the redaction patterns and asserts 0 phone-number or seeded child-name matches. (TC-028; NFR-010; D2 Part B §18 #6)

**Checkpoint**: User Story 4 is independently testable with focused tests. The admin redaction code is the spec-kit evidence. `tests/admin/{routes,service,admin-tools}.test.ts`, `tests/api/limit.test.ts`, `tests/case/audit.test.ts` already pass (this lane's 2026-10-18 run).

---

## Phase 7: Buildable test plan (no full DB suite reset)

**Purpose**: This lane runs only the focused tests added in Phases 3–6, plus a small subset of the existing Vitest suite that the owner-area code already passes, without resetting an existing human / demo / shared DB. The full DB suite (`npm run test:db`) is runnable only against a dedicated loopback database with this lane's unique prefix (per role rules).

- [x] T028 [P] Run `npm run lint` and assert exit 0. (TASK-001; AGENTS DoD). **This lane's 2026-10-18 run: exit 0; 0 errors, 51 warnings.**
- [x] T029 [P] Run `npm run typecheck` and assert exit 0. (TASK-001; AGENTS DoD). **This lane's 2026-10-18 run: exit 0; route types generated.**
- [x] T030 [P] Run `npx vitest run tests/duplicates/ tests/admin/ tests/api/ tests/eval/ tests/embeddings/ tests/match/ tests/case/ tests/contracts/ tests/auth/ tests/found/` and record pass / fail counts in `docs/execution/evidence/pre-main-convergence-desk.md`. (AGENTS DoD). **This lane's 2026-10-18 run: 77 test files, 1348 tests passed, 1 skipped, 0 failed.**
- [x] T031 [P] Run `npx vitest run --reporter=json` and capture the JSON summary into `docs/execution/evidence/focused-test-summary.json` for the matrix in T034. (AGENTS DoD). **This lane's 2026-10-18 run: 200 test files, 3693 tests passed, 308 skipped, 0 failed; raw vitest JSON output not committed to git per the role rule.**
- [ ] T032 [P] **NOT RUN** in this lane: `npm run test:db`, the heldout evaluation, the production smoke check and the real WER / timing runs. Those require human / production / organiser evidence and dedicated loopback DBs. (OD-5, OD-6, OD-064-1)

**Checkpoint**: Phase 7 records the focused-test exit codes in the matrix. No DB reset is performed.

---

## Phase 8: Human / production / organiser blocked items

**Purpose**: Record the items the lane cannot close and the reason. They are never claimed as a software pass.

- [ ] T033 [US1] **Human/organiser-blocked:** `OD-009-1`, `OD-009-2`, `OD-009-3`: district dataset / adjacency verification / Bangla division name. (Masnun, then all owners)
- [ ] T034 [US2] **Human/organiser-blocked:** `OD-018-1`: near-embedding threshold for the duplicate detector. (Masnun)
- [x] T035 [US3] **DONE (2026-10-18):** `TASK-048` synthetic fixture import is implemented at `src/app/api/admin/import/route.ts` + `src/server/import/{builder,duplicates,index}.ts` + `src/app/(desk)/admin/import-form.tsx`. The panel is labelled "সিমুলেটেড"-style synthetic-only (with the typed-confirm guard), the API persists the synthetic fixture through `importSyntheticCases`, and tests `tests/api/admin-import.test.ts` + `tests/admin/admin-import-builder.test.ts` pass. OQ-003 no longer applies to the live import; OQ-003 still applies to a possible future disaster-mode-style extension.
- [x] T036 [US4] **DONE (2026-10-18):** `OD-032-4` API-016 rate limit `adminRedaction` 5/min per principal is implemented at `src/app/api/_shared/limit.ts`; the limit fails closed. `tests/api/limit.test.ts` exercises it.
- [x] T037 [US5] **DONE (2026-10-18):** `OD-052-1` disaster-mode is **not** a 501 stub. `src/app/(desk)/staff/disaster/page.tsx` is a real page that shows the "পরিকল্পিত" planned-extension banner and reuses the S-007 found-log form (`src/app/(desk)/staff/found-log-form.tsx`) to save through API-007. The honest copy is preserved; the disaster-specific features are explicitly labelled as planned, not live. OQ-003 still applies to a possible future disaster-specific feature (e.g. batched intake) that does not yet exist.
- [ ] T038 [ALL] **Human/organiser-blocked:** Heldout run, WER speakers, timing volunteers, model revision, prices, judging weights, managed DB host. (OD-5, OD-6, OD-7, OD-8, OD-064-1, OQ-025, OQ-026)

**Checkpoint**: Phase 8 is the desk's explicit list of non-buildable items. None of them is claimed.

---

## Phase 9: Convergence matrix (per D6 acceptance)

**Purpose**: produce a single matrix that records what is buildable, what is human / production / organiser-blocked, and the evidence file per item. This is the desk's primary output for the coordinator.

- [x] T039 [P] Append the matrix rows for spec 006 to `docs/execution/evidence/pre-main-convergence-desk.md` with: per user story, per TC-### acceptance, the evidence file path, the gap type (`missing`/`partial`/`converged`/`human-blocked`/`organiser-blocked`/`production-blocked`) and the buildable task ID. (FR-019, FR-022, FR-023, FR-024, FR-025, FR-032, FR-036; TASK-018, TASK-030, TASK-048, TASK-051, TASK-052; `docs/execution/evidence/pre-main-convergence-desk.md`) Matrix present in `docs/execution/evidence/pre-main-convergence-desk.md`.

**Checkpoint**: Phase 9 is the desk's handoff to the coordinator. The matrix is the only thing this lane claims as the "convergence" deliverable; everything else is buildable work assigned to its owner.


## Coordinator integration disposition

The active integration branch already contains `003-parent-outputs/plan.md` and `tasks.md`, the 26-test local release checker, backup/Q&A preparation and the existing `eval/*.mjs` writers. Old planned `scripts/eval/*.ts` or evidence filenames are aliases of implemented behavior, not requirements to duplicate tooling. Freeze checks are implemented in `eval/metric-utils.mjs` and exercised by `tests/eval/{all,extract,match,dedupe}.test.ts`; freeze is unset and no held-out run is permitted or claimed. Native model revision/hash pins are in `src/server/embeddings/model.ts`. Root verification has passed 321 PostgreSQL tests across 31 files and 78 desktop/mobile browser checks with zero skips. The optional research/data-model/contract files may link to the canonical V2 pack, frozen runtime SQL and `src/contracts/`; their absence does not establish missing application behavior. Remaining local CLI, actual restart, poster download and header acceptance checks are consolidated in the final integration report; personal ownership is never a software blocker. Human studies, physical-device acceptance, production/public-sharing access and frozen quality remain pending.

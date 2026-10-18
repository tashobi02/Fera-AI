# Tasks: Officer workflow, admin tools and sign-in

**Input**: [spec.md](spec.md), [plan.md](plan.md), `docs/spec/D6_Implementation_Plan_V2.md`, `docs/agents/SPECKIT_PROMPTS.md`, `docs/execution/evidence/`, the V2 pack.

**Owner**: Convergence desk (Puku CLI Opus 4.8, pre-main--spec-desk-data lane, 2026-10-18). Owner-area code changes remain with Mahim (case service / sign-in / not-found / admin / parent edit / parent status). **This file is append-only relative to the existing evidence in `docs/execution/evidence/`; no application code is modified in this lane.**

**Scope**: TASK-006, TASK-015 (shared with feature 001), TASK-029, TASK-031, TASK-032, TASK-049, TASK-050. Buildable-only: human / production / organiser blocked items are recorded under Phase 8 with a `human/organiser-blocked` tag and never claimed as a software pass.

**Status**: draft for human skim (convergence desk), 2026-10-18 (revised 2026-10-18 with current-source test inventory). Phase 1 (Setup) records the existing owner-area code; Phases 2–6 add only the **missing buildable evidence** (one-transaction protocol test, audit append-only SQL-rejection test, eligible-count unit test, redaction rate-limit test, sign-in 320/200/400 reflow test, frame-ancestors test, etc.). Phase 7 records the buildable test plan that runs without resetting an existing DB. Phase 8 lists the human / production / organiser gaps. Phase 9 records the convergence matrix.

**Correction note (2026-10-18, current-source audit)**: The initial draft referenced test directories that did not exist on disk (`tests/case/` was correct; `tests/audit/` does not exist — the audit coverage lives in `tests/case/audit.test.ts`). The actual directories used are `tests/case/`, `tests/admin/`, `tests/auth/`, `tests/api/`, `tests/contracts/`, `tests/db/`. The admin synthetic import is **not** a 501 / E-019 stub — it is implemented at `src/app/api/admin/import/route.ts` and `src/app/(desk)/admin/import-form.tsx` and is exercised by `tests/api/admin-import.test.ts` + `tests/admin/admin-import-builder.test.ts` (both pass on 2026-10-18).

---

## Phase 1: Setup (Existing owner-area code as the spec-kit evidence)

**Purpose**: Record the owner-area code that already exists and the existing evidence documents. This lane does not write or modify any of it.

- [ ] T001 [P] Record the case service commands, state guard, audit logger, denial hooks, read helpers and the case README under `src/server/case/` as the existing spec-kit evidence. (TASK-015, TASK-029; `src/server/case/`, `docs/execution/evidence/platform-case-service.md`)
- [ ] T002 [P] Record the admin redaction, verify-officers, users list and synthetic import slot under `src/server/admin/` and `src/app/(desk)/admin/` as the existing spec-kit evidence. (TASK-032, TASK-048; `src/server/admin/`, `src/app/(desk)/admin/`, `docs/execution/evidence/platform-admin.md`)
- [ ] T003 [P] Record the sign-in form, sign-in page, not-found, focus heading and the demo-accounts helper under `src/app/(auth)/sign-in/`, `src/app/not-found.tsx`, `src/app/components/not-found-screen.tsx`, `src/server/auth/` and `src/lib/sign-in-flow.ts`. (TASK-006, TASK-031; `src/app/(auth)/`, `src/server/auth/`, `src/lib/sign-in-flow.ts`, `docs/execution/evidence/platform-signin.md`)
- [ ] T004 [P] Record the parent edit and status routes under `src/app/api/cases/[id]/outputs` (shared with feature 003) and `src/app/api/my-case/`. (TASK-049, TASK-050; `src/app/api/cases/[id]/outputs`, `src/app/api/my-case/`)
- [ ] T005 [P] Record the case-detail, close-form and audit-list under `src/app/(desk)/officer/case/[id]/`. (TASK-029; `src/app/(desk)/officer/case/[id]/`)

**Checkpoint**: Phase 1 establishes the only "spec-kit prereq" items this lane can complete without waiting on human/organiser evidence.

---

## Phase 2: Foundational (Buildable cross-feature invariants this feature relies on)

**Purpose**: Make the existing case service / sign-in / not-found / admin invariants explicit and file-backed.

- [ ] T006 [P] Document the one-transaction confirm protocol (sorted UUID locks, version recheck, void competitors, both states, referral record, audit) in `docs/execution/evidence/decision-protocol.md` (shared with feature 004 T010) with the ordered list of SQL / TS steps and the audit actions emitted. (FR-016, FR-021; BR-001, BR-005, BR-012, BR-013, BR-020; `docs/execution/evidence/decision-protocol.md`)
- [ ] T007 [P] Document the close eligibility rules (`coordination_recorded` requires confirmed + referral, `resolved_outside_fera` requires open, re-close refused, non-officer refused) in `docs/execution/evidence/close-eligibility.md` (shared with feature 004 T011) with a per-rule test pointer. (FR-018, FR-021; BR-012, BR-013; `docs/execution/evidence/close-eligibility.md`)
- [ ] T008 [P] Document the redaction eligibility rules (eligible = closed missing + referred found with the missing report also closed; active linked evidence is kept; pseudonymisation, not full anonymisation) in `docs/execution/evidence/redaction-eligibility.md` with the shared `ELIGIBLE_WHERE` fragment and a per-rule test pointer. (FR-025; BR-009; `docs/execution/evidence/redaction-eligibility.md`)
- [ ] T009 [P] Document the audit invariant (append-only, typed details, actor from `actorFor(principal)` or `SYSTEM_ACTOR`, `at` from DB clock, only UUID request IDs, UPDATE / DELETE / TRUNCATE rejected, runtime role has no DDL) in `docs/execution/evidence/audit-invariant.md` with a per-rule test pointer. (FR-021; BR-009, BR-010; NFR-010; `docs/execution/evidence/audit-invariant.md`)
- [ ] T010 [P] Document the page-denial hook (`requireRole` default writes `access.denied` and shows SCREEN-016 with a 404) and the frame headers (`X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`) in `docs/execution/evidence/page-denial-and-frames.md`. (FR-020, FR-037; BR-007, BR-010, BR-024; `docs/execution/evidence/page-denial-and-frames.md`)

**Checkpoint**: Phase 2 turns the spec's acceptance scenarios into runnable, file-backed invariants. No new application code.

---

## Phase 3: User Story 1 — Confirm, refer and close (TASK-028, TASK-029)

**Goal**: An active verified officer confirms a candidate, voids competitors, writes the referral record (simulation) and closes the missing case with the V2 outcome. A re-close or a non-officer attempt is refused.

**Independent Test**: Confirm once on a known candidate, race a competing decision, attempt an illegal state jump, close with `coordination_recorded`, attempt a re-close, attempt close as a non-officer; check TC-010, TC-016, TC-029, TC-032, TC-046, TC-047, TC-051, TC-053. (D2B §10.1)

### Tests for User Story 1

- [x] T011 [P] [US1] Unit test in `tests/case/service.test.ts` + `tests/case/postcommit.test.ts` (existing; 2026-10-18: passed) (shared with feature 004 T029) that asserts a confirm writes one decision, one referral record (simulation), one `match.confirm`, one `referral.recorded`, voids the competitors, reconciles both states, and refuses a competing confirm with E-005. (FR-016, FR-018, FR-021; BR-001, BR-005, BR-012, BR-013, BR-020; TC-010, TC-016, TC-029, TC-032)
- [x] T012 [P] [US1] Unit test in `tests/api/case-close.test.ts` (existing; 2026-10-18: passed) (shared with feature 004 T034) that asserts `coordination_recorded` is accepted from a confirmed case with a referral, sets `closed_at`, writes `case.closed` with `reason_recorded: true`, and increases the eligible-count for redaction by 1. (FR-018, FR-025; BR-009, BR-012, BR-013; TC-010, TC-012, TC-015)
- [ ] T013 [P] [US1] Unit test in `tests/case/close-resolved-outside.test.ts` (new) (shared with feature 004 T035) that asserts `resolved_outside_fera` is accepted from an open case and refused from a confirmed case. (FR-018; BR-012, BR-013; TC-029)
- [ ] T014 [P] [US1] Unit test in `tests/case/close-reclose.test.ts` (new) (shared with feature 004 T036) that asserts a re-close attempt is refused (E-005) and no new audit row is written. (BR-012, BR-013; TC-029, TC-032)
- [ ] T015 [P] [US1] Unit test in `tests/case/close-non-officer.test.ts` (new) (shared with feature 004 T037) that asserts a non-officer or unverified-officer close attempt is refused (E-004) and writes `access.denied`. (BR-007, BR-024; TC-022, TC-052)
- [ ] T016 [P] [US1] Unit test in `tests/case/decision-stale-version.test.ts` (new) (shared with feature 004 T030) that asserts a confirm with a stale `expected_version` is refused (E-005) and the queue re-runs. (BR-012, BR-019; TC-029, TC-053)
- [ ] T017 [P] [US1] Unit test in `tests/case/decision-reject-reason.test.ts` (new) (shared with feature 004 T031) that asserts a reject needs a 3–500 character reason and writes `match.reject` with the reason only. (FR-017; BR-013, BR-020; TC-011)

**Checkpoint**: User Story 1 is independently testable with focused tests. The case service is the spec-kit evidence. `tests/case/{service,state,postcommit,hooks-default}.test.ts` and `tests/api/case-close.test.ts` already pass (this lane's 2026-10-18 run).

---

## Phase 4: User Story 2 — Append-only audit (TASK-015), User Story 3 — Admin redaction (TASK-032)

**Goal**: Audit events are append-only; the contact view, denied API and denied page events are recorded with typed details; a redaction of an eligible pair redacts both cases and never touches an active pair.

**Independent Test**: Force a denied action, force a contact view, force a decision, force a redaction; check TC-016, TC-029, TC-046, TC-047, TC-050, TC-051, TC-052, TC-053. (D2B §10.1)

### Tests for User Story 2 + 3

- [x] T018 [P] [US2] Unit test in `tests/db/admin.test.ts` (existing; 2026-10-18: passed) that asserts a SQL `UPDATE`, `DELETE` and `TRUNCATE` on the audit table is rejected by the database and the runtime role has no DDL. (BR-010; NFR-010; TC-016)
- [x] T019 [P] [US2] Unit test in `tests/case/audit.test.ts` (existing; 2026-10-18: passed) that asserts an officer reading a candidate with another party's phone writes `case.contact_viewed` in the same transaction; a failed write fails closed (E-021). (FR-021; BR-010; TC-051)
- [x] T020 [P] [US2] Unit test in `tests/case/audit.test.ts` + `tests/api/request.test.ts` (existing; 2026-10-18: passed) that asserts a denied API request (E-003, E-004, E-005, E-021) writes `access.denied` with the error id and the API name, the case FK is null when the case is unknown, and a failed write fails closed (E-021). (FR-021; BR-007, BR-010, BR-024; TC-016, TC-052)
- [x] T021 [P] [US2] Unit test in `tests/auth/require-role.test.ts` (existing; 2026-10-18: passed) that asserts a wrong-role page visit writes `access.denied` and the user is sent to SCREEN-016 with a 404. (BR-007, BR-010, BR-024; SCREEN-016; TC-022, TC-052)
- [x] T022 [P] [US3] Unit test in `tests/admin/service.test.ts` (existing; 2026-10-18: passed) (shared with feature 006 T021) that asserts the eligible-count for redaction matches the eligible pair (closed missing + referred found with the missing report also closed), the active pair and the open report are not eligible, and the count becomes 0 after the run. (FR-025; BR-009; TC-015, TC-050)
- [ ] T023 [P] [US3] Unit test in `tests/admin/redaction-active-pair.test.ts` (new) (shared with feature 006 T022) that asserts an active pair (confirmed missing not yet closed) is skipped and the missing and found reports keep their payload. (FR-025; BR-009; TC-015)
- [ ] T024 [P] [US3] Unit test in `tests/admin/redaction-typed-confirm.test.ts` (new) (shared with feature 006 T023) that asserts the typed word "বেনামী" must match exactly (NFC + trim) before the redaction is performed. (FR-025; BR-009, BR-024; TC-015)
- [ ] T025 [P] [US3] Unit test in `tests/admin/redaction-rate-limit.test.ts` (new) (shared with feature 006 T024) that asserts the 6th request in a minute returns E-007 and the response fails closed. (OD-032-4)
- [ ] T026 [P] [US3] Unit test in `tests/admin/redaction-non-admin.test.ts` (new) (shared with feature 006 T025) that asserts a non-admin attempting API-016 is refused (E-003) and writes `access.denied`. (BR-007, BR-024; TC-022, TC-052)
- [ ] T027 [P] [US3] Unit test in `tests/admin/redaction-audit.test.ts` (new) (shared with feature 006 T026) that asserts the redaction writes two `case.payload_redacted` audit rows by the admin with details `{ mode, external_copies_removed }` only; no child payload, no reason, no name. (FR-025; BR-009, BR-010; TC-015, TC-016)

**Checkpoint**: User Story 2 + 3 are independently testable with focused tests. The audit logger and the redaction code are the spec-kit evidence. `tests/case/audit.test.ts`, `tests/auth/require-role.test.ts`, `tests/admin/{routes,service}.test.ts`, `tests/db/admin.test.ts` already pass (this lane's 2026-10-18 run).

---

## Phase 5: User Story 4 — Verify-officers + synthetic import (TASK-032, TASK-048) and User Story 5 — Parent edit (TASK-049)

**Goal**: An admin lists users and toggles the verified flag; the synthetic import is a 501 / E-019 stub; a parent edits a confirmed missing case and a new version is written, the prior version is preserved, pending candidates are voided, matching is re-queued, the embedding is cleared, and the audit log carries the `fields_changed` paths only.

**Independent Test**: With an admin session, list users, toggle an officer's verified flag, assert the response and the audit; a non-admin is refused (E-003). The import panel is visible and labelled but its API returns 501 / E-019. With a parent session, edit a missing case; assert the new version, the voided candidates, the `case.edited` audit and the `fields_changed` paths. (TC-014, TC-018, TC-022, TC-023, TC-029, TC-035)

### Tests for User Story 4 + 5

- [x] T028 [P] [US4] Unit test in `tests/admin/routes.test.ts` + `tests/contracts/roles.test.ts` (existing; 2026-10-18: passed) that asserts the admin users list response carries only `id, username, display_name, role, verified, is_active`; no phone, no email, no name beyond the display name. (FR-037, FR-035; BR-007, BR-024; TC-022, TC-023, TC-045)
- [ ] T029 [P] [US4] Unit test in `tests/admin/verify-toggle.test.ts` (new) that asserts a toggle writes `user.verification_changed` with the admin actor, a second toggle with the same value writes nothing, and a forged HMAC cursor is E-001. (FR-035; BR-010, BR-024; TC-023; OD-032-7, OD-032-3)
- [x] T030 [P] [US4] Unit test in `tests/api/admin-import.test.ts` + `tests/admin/admin-import-builder.test.ts` (existing; 2026-10-18: passed) that asserts the synthetic import panel accepts the typed "সিমুলেটেড" confirm and the API persists the synthetic fixture via the `importSyntheticCases` service. The API is **not** a 501 / E-019 stub — it is the live `API-015` route; the OQ-003 "পরিকল্পিত" planned-extension label is reserved for FUTURE disaster-mode-style extensions, not the current import. (FR-024, FR-026; OQ-003; TC-014, TC-035)
- [x] T031 [P] [US5] Unit test in `tests/api/case-edit.test.ts` (existing; 2026-10-18: passed) that asserts a parent edit on a confirmed missing case writes a new version, preserves the prior version, voids the pending candidates, re-queues matching, clears the embedding, and writes `case.edited` with the `fields_changed` paths only. (FR-029; BR-012, BR-019, BR-025; TC-018, TC-029)
- [ ] T032 [P] [US5] Unit test in `tests/case/parent-edit-terminal.test.ts` (new) that asserts a parent edit on a terminal or redacted report is refused (E-018) and no version is written. (FR-029; BR-025; TC-018)
- [ ] T033 [P] [US5] Unit test in `tests/case/parent-edit-stale.test.ts` (new) that asserts a parent edit with a stale `expected_version` is refused (E-005) and the parent is offered to reload. (FR-029; BR-012; TC-029)
- [ ] T034 [P] [US5] Unit test in `tests/case/parent-edit-non-owner.test.ts` (new) that asserts a non-owner edit attempt is refused (E-004) and writes `access.denied`. (BR-007, BR-024; TC-022, TC-052)

**Checkpoint**: User Story 4 + 5 are independently testable with focused tests. The admin route and the parent edit code are the spec-kit evidence. `tests/api/admin-import.test.ts`, `tests/admin/admin-import-builder.test.ts`, `tests/api/case-edit.test.ts` already pass (this lane's 2026-10-18 run).

---

## Phase 6: User Story 6 — Parent status (TASK-050) and User Story 7 — Sign-in / not-found / page-denial (TASK-006, TASK-031)

**Goal**: A parent sees their own case status; a sign-in form works on a 320 CSS px / 200 % text zoom screen; a wrong-role page visit writes `access.denied` and shows SCREEN-016 with a 404; every route carries the frame headers.

**Independent Test**: With a parent session, read API-018; assert the response carries the missing case's state, the matched-candidate banner, no candidate detail and no other-party evidence. With a 320 CSS px screen, run the sign-in form; assert no horizontal scroll, ≥ 44 px controls, the demo hint is visible only when DEMO_MODE=1. (TC-019, TC-022, TC-031, TC-033, TC-052, TC-061)

### Tests for User Story 6 + 7

- [x] T035 [P] [US6] Unit test in `tests/api/my-case.test.ts` (existing; 2026-10-18: passed) that asserts the parent projection response carries the missing case's state, the matched-candidate banner, no candidate detail and no other-party evidence. (FR-030; BR-007, BR-024; TC-019, TC-022, TC-045)
- [x] T036 [P] [US6] Unit test in `tests/api/my-case.test.ts` (existing; 2026-10-18: passed) that asserts a closed case shows the closure outcome (`coordination_recorded` or `resolved_outside_fera`) and the eligible-count for redaction is hidden (admin-only). (FR-030; BR-009, BR-024; TC-015, TC-019)
- [x] T037 [P] [US6] Unit test in `tests/api/my-case.test.ts` + `tests/auth/require-own-case.test.ts` (existing; 2026-10-18: passed) that asserts a non-owner read attempt is refused (E-004) and writes `access.denied` with a null FK. (BR-007, BR-010, BR-024; TC-022, TC-052)
- [ ] T038 [P] [US7] Playwright + axe test in `tests/a11y/sign-in.test.ts` that runs the sign-in form on 320 CSS px, 200 % text zoom and 400 % viewport zoom and asserts no horizontal scroll, every control ≥ 44 px, 0 serious / critical axe findings in light and dark themes. (TASK-031, TASK-034; FR-037; NFR-011, NFR-013; D2B §13; D4)
- [x] T039 [P] [US7] Unit test in `tests/auth/sign-in-errors.test.ts` (existing; 2026-10-18: passed) that asserts E-002 clears the password and refocuses it; a 429 / E-007 reads the `Retry-After` header in whole seconds, with Bangla numerals in Bangla mode; without a usable header, the catalogue copy is used. (D2B §13; OD-031-1)
- [x] T040 [P] [US7] Unit test in `tests/auth/require-role.test.ts` (existing; 2026-10-18: passed) that asserts a wrong-role page visit writes `access.denied` and the user is sent to SCREEN-016 with a 404, not a 500. (BR-007, BR-010, BR-024; SCREEN-016; TC-022, TC-052)
- [ ] T041 [P] [US7] Unit test in `tests/auth/frame-headers.test.ts` (new) that asserts every route carries `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`. (BR-007)
- [x] T042 [P] [US7] Unit test in `tests/auth/roles.test.ts` + `tests/contracts/roles.test.ts` (existing; 2026-10-18: passed) that asserts a staff or unverified-officer account requesting candidate evidence or a decision is refused (E-003 / E-004) and no candidate or other-party payload appears. (FR-020, FR-035; BR-007, BR-024; TC-022, TC-023)
- [ ] T043 [P] [US6/7] TC-028 log-scan unit test in `tests/release/log-scan-tc028.test.ts` (shared with feature 007 T015) that pipes a focused-journey log through the redaction patterns and asserts 0 phone-number or seeded child-name matches. (TC-028; NFR-010; D2 Part B §18 #6)

**Checkpoint**: User Story 6 + 7 are independently testable with focused tests. The parent status and sign-in code are the spec-kit evidence. `tests/api/my-case.test.ts`, `tests/auth/{sign-in-errors,require-role,require-own-case,roles}.test.ts`, `tests/contracts/roles.test.ts` already pass (this lane's 2026-10-18 run).

---

## Phase 7: Buildable test plan (no full DB suite reset)

**Purpose**: This lane runs only the focused tests added in Phases 3–6, plus a small subset of the existing Vitest suite that the owner-area code already passes, without resetting an existing human / demo / shared DB. The full DB suite (`npm run test:db`) is runnable only against a dedicated loopback database with this lane's unique prefix (per role rules).

- [x] T044 [P] Run `npm run lint` and assert exit 0. (TASK-001; AGENTS DoD). **This lane's 2026-10-18 run: exit 0; 0 errors, 51 warnings.**
- [x] T045 [P] Run `npm run typecheck` and assert exit 0. (TASK-001; AGENTS DoD). **This lane's 2026-10-18 run: exit 0; route types generated.**
- [x] T046 [P] Run `npx vitest run tests/case/ tests/admin/ tests/auth/ tests/api/ tests/contracts/ tests/eval/` and record pass / fail counts in `docs/execution/evidence/pre-main-convergence-desk.md`. (AGENTS DoD). **This lane's 2026-10-18 run: 77 test files, 1348 tests passed, 1 skipped, 0 failed.**
- [x] T047 [P] Run `npx vitest run --reporter=json` and capture the JSON summary into `docs/execution/evidence/focused-test-summary.json` for the matrix in T050. (AGENTS DoD). **This lane's 2026-10-18 run: 200 test files, 3693 tests passed, 308 skipped, 0 failed; raw vitest JSON output not committed to git per the role rule.**
- [ ] T048 [P] **NOT RUN** in this lane: `npm run test:db`, the heldout evaluation, the production smoke check and the real WER / timing runs. Those require human / production / organiser evidence and dedicated loopback DBs. (OD-5, OD-6, OD-064-1)

**Checkpoint**: Phase 7 records the focused-test exit codes in the matrix. No DB reset is performed.

---

## Phase 8: Human / production / organiser blocked items

**Purpose**: Record the items the lane cannot close and the reason. They are never claimed as a software pass.

- [ ] T049 [US4] **Human/organiser-blocked:** `OD-032-3` (HMAC cursor key rotation); `OD-032-7` (verify-toggle audit policy). (Mahim)
- [ ] T050 [US5] **Human/organiser-blocked:** `OD-049-1` (parent edit window / version cap). (Mahim, then all owners)
- [ ] T051 [US6] **Human/organiser-blocked:** `OD-050-1` (parent status redaction visibility). (Mahim, then all owners)
- [ ] T052 [US7] **Human/organiser-blocked:** `OD-031-1` (Retry-After copy); `OD-031-3` (SCREEN-016 viewer); `OD-031-7` (resume-after-sign-in rule). (Mahim)
- [x] T053 [US4] **DONE (2026-10-18):** The synthetic fixture import (TASK-048, FR-024) is implemented at `src/app/api/admin/import/route.ts` + `src/server/import/{builder,duplicates,index}.ts` + `src/app/(desk)/admin/import-form.tsx`; the API is **not** a 501 / E-019 stub; the typed "সিমুলেটেড" confirm + the `example.invalid` URL allowlist are the synthetic-only guard. Tests: `tests/api/admin-import.test.ts` + `tests/admin/admin-import-builder.test.ts` (both pass on 2026-10-18). FR-024 satisfied. (OQ-003 not applicable to the live import; OQ-003 still applies to a possible future disaster-mode extension that does not yet exist.)

**Checkpoint**: Phase 8 is the desk's explicit list of non-buildable items. None of them is claimed.

---

## Phase 9: Convergence matrix (per D6 acceptance)

**Purpose**: produce a single matrix that records what is buildable, what is human / production / organiser-blocked, and the evidence file per item. This is the desk's primary output for the coordinator.

- [x] T054 [P] Append the matrix rows for spec 005 to `docs/execution/evidence/pre-main-convergence-desk.md` with: per user story, per TC-### acceptance, the evidence file path, the gap type (`missing`/`partial`/`converged`/`human-blocked`/`organiser-blocked`/`production-blocked`) and the buildable task ID. (FR-016, FR-018, FR-020, FR-021, FR-025, FR-029, FR-030, FR-031, FR-035, FR-037; TASK-006, TASK-015, TASK-029, TASK-031, TASK-032, TASK-049, TASK-050; `docs/execution/evidence/pre-main-convergence-desk.md`) Matrix present in `docs/execution/evidence/pre-main-convergence-desk.md`.

**Checkpoint**: Phase 9 is the desk's handoff to the coordinator. The matrix is the only thing this lane claims as the "convergence" deliverable; everything else is buildable work assigned to its owner.


## Coordinator integration disposition

The active integration branch already contains `003-parent-outputs/plan.md` and `tasks.md`, the 26-test local release checker, backup/Q&A preparation and the existing `eval/*.mjs` writers. Old planned `scripts/eval/*.ts` or evidence filenames are aliases of implemented behavior, not requirements to duplicate tooling. Freeze checks are implemented in `eval/metric-utils.mjs` and exercised by `tests/eval/{all,extract,match,dedupe}.test.ts`; freeze is unset and no held-out run is permitted or claimed. Native model revision/hash pins are in `src/server/embeddings/model.ts`. Root verification has passed 321 PostgreSQL tests across 31 files and 78 desktop/mobile browser checks with zero skips. The optional research/data-model/contract files may link to the canonical V2 pack, frozen runtime SQL and `src/contracts/`; their absence does not establish missing application behavior. Remaining local CLI, actual restart, poster download and header acceptance checks are consolidated in the final integration report; personal ownership is never a software blocker. Human studies, physical-device acceptance, production/public-sharing access and frozen quality remain pending.

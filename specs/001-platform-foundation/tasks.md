# Tasks: Platform foundation

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [platform-contract.md](contracts/platform-contract.md), [quickstart.md](quickstart.md), D6 §5 and the 001 brief in `docs/agents/SPECKIT_PROMPTS.md`.

**Status**: Specification task board only. Every checklist item is unchecked. Planned runtime paths do not exist in this specs-only lane. `blocked-by` records D6 dependencies that have no completion evidence; it is not a claim that the referenced task has been attempted. Do not start implementation in this lane. (AMD-1-1; D6 §5)

**Owner and lane**: Mahim (Sadman in D6) · lane-a for all feature 001 rows. A D6 TASK ID in parentheses maps the checklist step to the original task; no extra D6 task is inferred.

## Phase 1: Setup

**Purpose**: Establish the app and CI that every runtime task needs. This remains Phase 0 work, outside the present specs-only run.

- [ ] T001 [Mahim·lane-a] Create the Next.js App Router, strict TypeScript, Tailwind, ESLint and implemented `lint`/`typecheck`/`test` scripts in `package.json`, `tsconfig.json`, `src/app/layout.tsx` and `.github/workflows/ci.yml`; prove CI green on main and record a preview URL. Current scripts are fail-fast stubs, so no scaffold or CI evidence is claimed. (TASK-001; D6 §5; NFR-014; SC-007)

**Checkpoint**: TASK-001 evidence is required before T002–T008. No setup task is complete in this specs lane.

---

## Phase 2: Foundational contracts and storage

**Purpose**: Create the shared typed boundary and exact schema, then enforce runtime grants and invariants. These are planned implementation steps, not Phase 1 specs work.

- [ ] T002 [P] [Mahim·lane-a] Define DTOs, Zod request/response schemas, report and candidate state enums, per-role allowlists, E-001–E-024 error envelope, scoped UUID/hash, simulated referral and separate missing/found/pair count semantics in `src/contracts/index.ts` and `src/contracts/schemas.ts`, derived from `docs/code/fera_types_v2.ts`; E-022/E-024 stay client-only and no unrestricted CaseView is exported. **blocked-by TASK-001**. (TASK-061; BR-004/005/007/014/024; TC-022/042/044/045/055/060)
- [ ] T003 [Mahim·lane-a] Add one valid typed example per API DTO and contract checks for BR-004/015/016/020/023/024, TC-030/042–046/060 and FV-01–FV-05/FV-10 in `src/contracts/examples.ts` and `tests/contracts/platform.test.ts`; record any schema disagreement before freeze and prepare a reviewed PR. A human merges it before the `contracts-v1` tag is placed on that merge commit. **blocked-by TASK-001 and T002**. (TASK-061; TEAM_HANDOVER_V2 §3)
- [ ] T004 [P] [Mahim·lane-a] Select the OQ-021 host with evidence, copy `docs/code/schema_v2.sql` byte-for-byte to `db/schema_v2.sql`, apply it to fresh synthetic local and host PostgreSQL 16/pgvector environments and record SHA-256 plus HNSW index evidence without credentials in `docs/execution/evidence/platform-schema.md`. **blocked-by TASK-001; OQ-021 host UNKNOWN**. (TASK-002; D2 Part A §7.1; TC-062; SC-007)
- [ ] T005 [P] [Mahim·lane-a] Implement shared request ID, Zod input helper, bilingual error envelope, route guard integration point and rate limiter in `src/app/api/_shared/request.ts`, `src/app/api/_shared/error.ts` and `src/app/api/_shared/limit.ts`, with unit checks in `tests/api/platform.test.ts`; role-specific routes later bind server auth and DTO allowlists, every case response is `no-store`, and logs omit child payload. **blocked-by TASK-001**. (TASK-007; COMP-021; BR-007/010/024; TC-022/052)
- [ ] T006 [Mahim·lane-a] Configure separate least-privilege runtime roles through the host/operator procedure and exercise the **unchanged** `db/schema_v2.sql` on PostgreSQL 16 for state, endpoint and one-confirmed-pair constraints in `tests/db/platform.test.ts`; record grant/negative-test results in `docs/execution/evidence/platform-db-invariants.md`. Any needed schema change first requires all-owner approval and companion synchronization. **blocked-by TASK-002 and TASK-061**. (TASK-062; BR-012/013/020; TC-029/032/051/062)
- [ ] T007 [Mahim·lane-a] Exercise eligible terminal redaction of direct and related identifying payload, preserving active linked evidence, pseudonymous IDs/date/district and safe append-only audit in `tests/db/redaction.test.ts` and `src/server/admin/redact.ts`; do not call retained metadata anonymous. **blocked-by TASK-002 and TASK-061**. (TASK-062; BR-009/010/025; TC-015/050/051/052)
- [ ] T008 [P] [Mahim·lane-a] Build the shared shell with DESIGN.md tokens and Fera overrides, self-hosted Inter, JetBrains Mono and Noto Sans Bengali with licence files under `src/app/fonts/`, and COMP-022 language toggle in `src/app/layout.tsx`, `src/app/globals.css` and `src/app/components/language-toggle.tsx`; parent default is Bangla with Bangla numerals. **blocked-by TASK-001**. (TASK-008; FR-033; COMP-022; NFR-011; SC-006)

**Checkpoint**: TASK-002 is not done until both environments and HNSW are evidenced; TASK-061 is not done until examples/projections validate and the reviewed merge/tag exists. T006–T007 retain their D6 dependency on both. (AMD-1-1; D6 §5)

---

## Phase 3: User Story 1 — Enter the appropriate workspace (P1)

**Goal**: Authenticated staff, verified officers and admins reach only authorised views; parent own-case access uses an anonymous scoped cookie. (STORY-008/009; FR-020/035/037; BR-007/024)

**Independent test**: With invented accounts and cases, run TC-022/023/044/052: staff and unverified officers receive no candidate/other-party fields; admin gets metadata only; hidden and absent reads match. (SC-001)

### Tests

- [ ] T009 [P] [Mahim·lane-a] [US1] Write role and verification checks for active verified officer, unverified officer as staff, admin metadata, parent ownership and absent/hidden E-004 in `tests/auth/roles.test.ts`; include safe denied-access audit and TC-022/023/044/052 cases before implementation. **blocked-by TASK-002**. (TASK-006; BR-007/010/024; SC-001)

### Implementation

- [ ] T010 [Mahim·lane-a] [US1] Implement Auth.js credentials, server-derived active/verified role checks, 8-hour staff/officer/admin sessions and revocable scoped anonymous parent cookie in `src/server/auth/session.ts`, `src/server/auth/require-role.ts` and `src/app/api/auth/[...nextauth]/route.ts`; a browser-provided role, owner or verification flag has no authority. **blocked-by TASK-002; follow T009**. (TASK-006; FR-035/037; BR-024; TC-023)
- [ ] T011 [Mahim·lane-a] [US1] Expose server-guarded API-004 role projections from the case service through `src/server/case/read.ts` and `src/app/api/cases/[id]/route.ts`; return `OwnerCaseView`, `StaffOwnCaseView`, `OfficerCaseView` or `AdminCaseView` only, use identical E-004 for hidden/absent and audit denial safely. **blocked-by TASK-007, TASK-061 and TASK-062; route integration also blocked-by TASK-006**. (TASK-015; API-004; BR-007/010/024; TC-022/044/045/052)
- [ ] T012 [P] [Mahim·lane-a] [US1] Build SCREEN-008 sign-in loading/error/recovery states using D3 bilingual copy in `src/app/(auth)/sign-in/page.tsx`, including generic credential failure and intended-URL resume. **blocked-by TASK-006**. (TASK-031; SCREEN-008; E-002/007; TC-022)
- [ ] T013 [P] [Mahim·lane-a] [US1] Build SCREEN-016 absent/hidden recovery with heading focus and home action in `src/app/not-found.tsx`, using the same visible state for both cases. **blocked-by TASK-006**. (TASK-031; SCREEN-016; E-004; COMP-045; TC-022/052)

**Checkpoint**: US1 is independently testable only after T009–T013 pass against synthetic roles and server-owned verification.

---

## Phase 4: User Story 2 — Preserve only a reviewed report (P1)

**Goal**: A confirmed reviewed missing/found payload becomes one validated report; a scoped UUID retry returns the same reference. (STORY-004/008; FR-006/007/011/031; BR-004/015/016)

**Independent test**: TC-004/030/031/042/060 show server metadata only before confirmation, four field paths for TC-030, one case for concurrent identical retries and a conflict for changed payload. (SC-002/005)

### Tests

- [ ] T014 [P] [Mahim·lane-a] [US2] Write synthetic service checks for pre-submit metadata only, missing age/range 0–17, found age unknown or estimated bounds up to 25, phone after digit normalization as 11 digits beginning 01, district code 1–64, non-empty place, event interval and scoped UUID/hash replay in `tests/case/create.test.ts`; assert unknowns remain unknown and four TC-030 field errors. **blocked-by TASK-007, TASK-061 and TASK-062**. (TASK-015; BR-004/008/015/016/023; TC-004/030/031/042/060; SC-002, SC-005)

### Implementation

- [ ] T015 [Mahim·lane-a] [US2] Implement `createMissing`, `createFound` and `open` in `src/server/case/commands.ts` with Zod-reviewed `confirmed: true`, server-derived owner/synthetic flag, canonical payload hash and unique `(principal, client_submission_id)`; identical replay returns one stable ref, changed payload conflicts and a new UUID remains a separate report. **blocked-by TASK-007, TASK-061 and TASK-062; follow T014**. (TASK-015; API-003/007; BR-004/015/016/024; TC-031/042)
- [ ] T016 [Mahim·lane-a] [US2] Persist accepted reports and safe audit together in `src/server/case/commands.ts` and `src/server/audit/write.ts`; leave matching `queued` or `failed` explicitly if it cannot complete and expose a reliable retry boundary, without an unawaited serverless promise or candidate disclosure to staff/parents. **blocked-by TASK-007, TASK-061 and TASK-062; follow T015**. (TASK-015; BR-007/010; TC-004/054)

**Checkpoint**: Feature 002 owns the provider notice and parent API-003 screen integration; feature 005 owns the staff API-007 form. This feature supplies the shared case boundary. (TASK-021/022/026; BR-004; D6 §5)

---

## Phase 5: User Story 3 — Record an officer decision and coordination outcome (P1)

**Goal**: A verified officer's current decision, both report states, referral recorded (simulation), competitor invalidation and safe audit commit atomically; closure records a coordination outcome. (STORY-010/012/017; FR-016/018/021; BR-001/005/010/020)

**Independent test**: TC-010/016/029/032/046/047/051/053 reject stale, illegal and competing transitions without a partial decision, referral or audit mutation. (SC-003/004)

### Tests

- [ ] T017 [P] [Mahim·lane-a] [US3] Write synthetic state/transaction checks in `tests/case/decision.test.ts` for missing `submitted → open → matched_pending_review → confirmed → closed`, found `open ↔ matched_pending_review → referred`, illegal jumps, stale versions, wrong referral endpoints, second confirmations and last-competitor reconciliation. **blocked-by TASK-007, TASK-061 and TASK-062**. (TASK-015; BR-012/013/020; TC-010/029/032/046/047/053)
- [ ] T018 [P] [Mahim·lane-a] [US3] Write append-only audit checks in `tests/audit/platform.test.ts` for confirm, referral, close, edit, redaction and denied access with no child names, phone or free text; mutation and truncation must fail under the restricted runtime role. **blocked-by TASK-007, TASK-061 and TASK-062**. (TASK-015; FR-021; BR-010; TC-016/051/052; SC-004)

### Implementation

- [ ] T019 [Mahim·lane-a] [US3] Implement legal `transition` and `editWithVersion` guards in `src/server/case/state.ts` with expected-version checks, prior reviewed snapshot, stale pending candidate voiding and affected report queue-state reconciliation; ordinary terminal edits fail. **blocked-by TASK-007, TASK-061 and TASK-062; follow T017**. (TASK-015; BR-012/013/025; TC-032/049/053)
- [ ] T020 [Mahim·lane-a] [US3] Implement `confirmPair` in `src/server/case/decision.ts`: lock endpoint UUIDs in sorted order; recheck active verified officer, candidate eligibility and both live versions; atomically write one decision, candidate/report states, competitor invalidation, referral recorded (simulation) and safe audit. **blocked-by TASK-007, TASK-061 and TASK-062; follow T017–T019**. (TASK-015; API-010; BR-001/005/020/024; TC-010/029/046/047/053; SC-003)
- [ ] T021 [Mahim·lane-a] [US3] Implement `close` in `src/server/case/close.ts`: `coordination_recorded` requires a confirmed pair plus simulated referral; `resolved_outside_fera` requires open missing; require expected version and reviewed 3–500 character note, then record closed status/timestamp and safe audit without a return claim. **blocked-by TASK-007, TASK-061 and TASK-062; follow T018–T020**. (TASK-015; API-011; BR-010/012/013; TC-010/032)

**Checkpoint**: Runtime success still requires PostgreSQL 16 transaction and role evidence; spec or portable DB checks alone cannot complete TASK-015/062. (TC-046/062)

---

## Phase 6: User Story 4 — Navigate and recover in the chosen language (P1)

**Goal**: The shell and SCREEN-008/016 states are bilingual, parent mode starts in Bangla, and recovery remains accessible. (FR-033; COMP-022/045/047)

**Independent test**: Inspect Bangla glyphs and toggle on one Android phone, plus 320 CSS px reflow, 200% text zoom, keyboard focus and synthetic/[MOCK] labels. (SC-006; TC-002/033/058)

- [ ] T022 [Mahim·lane-a] [US4] Capture a headless screenshot with its command in `docs/execution/evidence/platform-language.md`, then verify Bangla rendering and COMP-022 toggle on one Android phone, bilingual SCREEN-008/016 states, ≥44 px parent targets, 320 CSS px reflow and 200% text zoom with `tests/e2e/platform-language.spec.ts`; human phone evidence is required before TASK-008 is done. **blocked-by TASK-001; follow T008 and T012–T013**. (TASK-008; FR-033; NFR-011; TC-002/033/058)

**Checkpoint**: A headless screenshot alone leaves TASK-008 in review until the Android phone check is evidenced.

---

## Phase 7: Polish and cross-cutting validation

- [ ] T023 [Mahim·lane-a] Run the implemented `typecheck`/`lint`/`test` commands, real main CI and the synthetic [quickstart validation journey](quickstart.md) from a clean checkout; time the documented setup against SC-007's 15-minute working target and review source/contract consistency. Record command, exit code, elapsed time, commit and safe results in `docs/execution/evidence/platform-validation.md`, with no paid API calls or real personal data. **blocked-by TASK-001, TASK-002, TASK-006, TASK-007, TASK-008, TASK-015, TASK-031, TASK-061 and TASK-062**. (spec-only; SC-001–SC-007; TC-016/022/023/030/032/042–046/060/062)

---

## Dependencies and execution order

| D6 task | Original predecessor(s) | This board | Current evidence status |
|---|---|---|---|
| TASK-001 | none | T001 | Phase 0 `todo`; CI/main and preview unverified |
| TASK-002 | TASK-001 | T004 | blocked-by TASK-001; OQ-021 UNKNOWN |
| TASK-007 | TASK-001 | T005 | blocked-by TASK-001 |
| TASK-008 | TASK-001 | T008, T022 | blocked-by TASK-001; Android check pending |
| TASK-061 | TASK-001 | T002–T003 | blocked-by TASK-001; no runtime contracts or tag |
| TASK-006 | TASK-002 | T009–T010 | blocked-by TASK-002 |
| TASK-062 | TASK-002, TASK-061 | T006–T007 | blocked-by TASK-002/TASK-061 |
| TASK-015 | TASK-007, TASK-061, TASK-062 | T011, T014–T021 | blocked-by TASK-007/TASK-061/TASK-062 |
| TASK-031 | TASK-006 | T012–T013 | blocked-by TASK-006 |

Story 1 can validate role access after TASK-006/015; Story 2 can validate reviewed creation after TASK-015; Story 3 can validate decisions after TASK-015; Story 4 can validate shell and screens after TASK-008/031. D6 dependencies take precedence over the visual phase order. `src/contracts/` and the exact schema copy require reviewed merge/tag and all-owner review for later changes. (D6 §5; AMD-1-1)

## Parallel opportunities

- After TASK-001, T002 (`src/contracts/`), T004 (`db/schema_v2.sql`), T005 (`src/app/api/_shared/`) and T008 (shell) target separate surfaces; [P] means file independence only, not permission to ignore dependencies or one-writer ownership.
- After TASK-002, T009's auth tests and other independent tests may be prepared while contract validation proceeds. T012 and T013 target separate SCREEN-008/016 files after TASK-006.
- After TASK-007/061/062, T017 and T018 target separate decision and audit tests before their implementation steps. Every step stays Mahim·lane-a; do not run two writers in one worktree.

## Implementation strategy and handoffs

Complete TASK-001, then TASK-002/007/008/061 in their permitted order; TASK-006/062 follow their D6 predecessors, and TASK-015/031 follow theirs. Independently validate US1 role boundaries first, US2 reviewed persistence second, US3 state/decision integrity third and US4 bilingual navigation when shell and screens exist. This is a work plan, not evidence of an implemented MVP. (D6 §5; BR-001/004/007/010/020/024)

Obidit's parent and Masnun's staff/officer lanes consume the reviewed `src/contracts/` examples and typed case service. Matching implementation belongs to feature 004 and waits for TASK-064's frozen manifest; no matcher, embedding, scoring or threshold work is part of this board. Screens and APIs owned by other features keep their D6 owners. (TASK-017/022/026/028/061/064; AGENTS.md)

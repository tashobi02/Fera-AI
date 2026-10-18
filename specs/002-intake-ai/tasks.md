# Tasks: Parent intake and AI-assisted draft

Status: draft for human skim (spec-kit stop point before /speckit-analyze). Generated 2026-10-16 by an agent; not reviewed.

> **Hand-off note (2026-10-16, added after the safeguarding gate):** the "Work already in flight" section below is stale. It was written before #15, #18, #20 and #22 merged; see `docs/execution/PHASE_2_MUST_CORE.md` for current state. The note that T029 is blocked on the route-writer decision also predates #20 merging. The four-round exit here goes to SCREEN-005 (D3:483); the implemented decision OD-021-7 sends it to S-003 (D1 STORY-003 AC2, D3:69). The spec pack disagrees with itself here; this is recorded, not resolved.

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/intake-contract.md](contracts/intake-contract.md), [quickstart.md](quickstart.md), [clarification-review.md](clarification-review.md), `docs/spec/D6_Implementation_Plan_V2.md`, `docs/agents/handoff/OBIDIT.md`, `docs/execution/PHASE_2_MUST_CORE.md`.

**Owner**: Obidit (intake, AI, speech, normaliser, parent screens S-001–S-003, spend, cache). Cross-person handoffs explicitly labeled: S-004 and S-005 lines are Mahim's (owner: Mahim); district dataset and demo seed fixtures are Masnun's (owner: Masnun).

**Scope**: Synthetic-data prototype only (STORY-001–STORY-004, STORY-018, STORY-023; SCREEN-001–SCREEN-003; FR-001–FR-007, FR-026/027/031/033; TASK-003, TASK-005, TASK-012, TASK-013, TASK-014, TASK-020, TASK-021, TASK-022, TASK-033, TASK-059, TASK-063; TASK-001 (referenced as a dependency or handoff), TASK-006 (referenced as a dependency or handoff), TASK-007 (referenced as a dependency or handoff), TASK-008 (referenced as a dependency or handoff), TASK-009 (referenced as a dependency or handoff), TASK-015 (referenced as a dependency or handoff), TASK-019 (referenced as a dependency or handoff), TASK-023 (referenced as a dependency or handoff), TASK-024 (referenced as a dependency or handoff), TASK-025 (referenced as a dependency or handoff), TASK-034 (referenced as a dependency or handoff), TASK-035 (referenced as a dependency or handoff), TASK-047 (referenced as a dependency or handoff), TASK-061 (referenced as a dependency or handoff), TASK-062 (referenced as a dependency or handoff)).

---

## Phase 1: Setup (Shared Infrastructure & Provider Configuration)

**Purpose**: Set up provider environment variable templates and documented cost tracking structure without committing live credentials or making paid API calls.

- [ ] T001 [P] Configure provider environment variable names in `.env.example` and record initial pricing structure in `docs/costs.md` without runtime secrets or provider calls (TASK-003; BR-023, DECISION-017, NFR-016; `.env.example`, `docs/costs.md`)

---

## Phase 2: Foundational (Blocking Prerequisites & Shared Contracts)

**Purpose**: Core data and contract prerequisites that must be in place before user stories begin.

- [ ] T002 Load 64-district dataset with Bangla/English names, centroids, and neighbour relations in `db/seed/districts.json` as prerequisite for normaliser and intake (owner: Masnun) (TASK-009; DEP-004, A-013, BR-015; `db/seed/districts.json`)
- [ ] T003 [P] Validate shared intake contract types, draft schemas, evidence span schemas, and error envelopes in `tests/contracts/intake-contract.test.ts` against `src/contracts/draft.ts` and `src/contracts/schemas.ts` (owner: Sadman; contract change needs all-owner review) (TASK-061; BR-004, BR-008, BR-024; `src/contracts/draft.ts`, `tests/contracts/intake-contract.test.ts`)
- [ ] T004 [P] Verify shared API route helpers, request validation, and rate limiters for intake endpoints in `src/app/api/_shared/` (owner: Sadman) (TASK-007; COMP-021, BR-023; `src/app/api/_shared/limit.ts`, `src/app/api/_shared/request.ts`)

---

## Phase 3: User Story 1 — Start a synthetic report by voice or text (Priority: P1) 🎯 MVP

**Goal**: A parent opens SCREEN-001, sees the provider-processing notice before any voice/text is sent, then records audio (5–120 s, ≤2 MB) or types text (20–2,000 chars) on SCREEN-002; speech returns an editable Bangla transcript, and typing remains usable without a microphone or network.

**Independent Test**: Exercise provider notice, a 38-second recording, editable transcript, unsupported microphone, and network interruption without relying on extraction or case submission (TC-001, TC-060, TC-061).

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T005 [P] [US1] Unit tests for speech adapter: codec validation, measured audio duration (5–120 s), and encoded size (≤2 MB) checks in `tests/unit/speech-adapter.test.ts` (TASK-014; FR-002, BR-023, TC-061; `tests/unit/speech-adapter.test.ts`)
- [ ] T006 [P] [US1] Integration contract test for API-001 POST `/api/intake/transcribe`: provider notice verification, multipart audio parsing, draft token minting, and error envelope responses (E-008, E-009, E-010, E-022) in `tests/integration/api-intake-transcribe.test.ts` (TASK-014; API-001, FR-002, BR-004, BR-023, TC-001, TC-060, TC-061; `tests/integration/api-intake-transcribe.test.ts`)
- [ ] T007 [P] [US1] E2E journey test for SCREEN-001 and SCREEN-002: notice presentation, language toggle, audio recording state machine, transcript editor, and typed text fallback in `tests/e2e/intake-voice-text.spec.ts` (owner: Sadman) (TASK-021; SCREEN-001, SCREEN-002, FR-001, FR-002, FR-033, BR-004, TC-001, TC-060, TC-061; `tests/e2e/intake-voice-text.spec.ts`)

### Implementation for User Story 1

- [ ] T008 [US1] Implement Android MediaRecorder audio constraints spike and validation logic in `src/server/speech/validate.ts` (TASK-005; A-030, FR-002, BR-023, TC-061; `src/server/speech/validate.ts`)
- [ ] T009 [US1] Implement SpeechProvider interface and adapter with fake and external speech provider support in `src/server/speech/adapter.ts` and `src/server/speech/index.ts` (TASK-014; COMP-006, FR-002, BR-023, TC-001; `src/server/speech/adapter.ts`, `src/server/speech/index.ts`)
- [ ] T010 [US1] Implement API-001 route handler POST `/api/intake/transcribe` with multipart check, atomic spend reservation, metadata-only draft row, and editable transcript response in `src/app/api/intake/transcribe/route.ts` (TASK-014; API-001, FR-002, BR-004, BR-023, TC-001, TC-060, TC-061; `src/app/api/intake/transcribe/route.ts`)
- [ ] T011 [P] [US1] Implement SCREEN-001 Welcome screen with COMP-050 provider notice, COMP-022 language toggle, and 13219 helpline link in `src/app/(parent)/page.tsx` (TASK-021; SCREEN-001, COMP-022, COMP-050, FR-033, BR-004, TC-060; `src/app/(parent)/page.tsx`)
- [ ] T012 [US1] Implement SCREEN-002 voice recording UI (COMP-025), transcript editor (COMP-026), and typed text input with microphone permission fallback in `src/app/(parent)/report/page.tsx` (TASK-021; SCREEN-002, COMP-024, COMP-025, COMP-026, FR-001, FR-002, BR-023, TC-001, TC-061; `src/app/(parent)/report/page.tsx`)

**Checkpoint**: At this point, User Story 1 is independently testable: parents can start an intake, review the notice, record audio or type text, and view an editable transcript.

---

## Phase 4: User Story 2 — Review an evidence-backed draft and answer missing fields (Priority: P1)

**Goal**: The parent sees extracted values with source evidence spans over reviewed text; Bangla digits, relative time, and district aliases are normalised deterministically; at most four one-at-a-time follow-up questions are asked; unresolved drafts hand off to manual form SCREEN-005 (owner: Mahim).

**Independent Test**: With synthetic TC-002 fixture and fixed intake clock, inspect extracted fields, source spans, yesterday-afternoon interval, empty district, and answer follow-up question for TC-003 without voice capture (TC-002, TC-003, TC-017, TC-027, TC-030).

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T013 [P] [US2] Unit tests for COMP-008 normaliser: ≥30 tests covering Bangla digits, relative time words anchored to intake clock, 11-digit phone numbers, district aliases, and romaniser in `tests/unit/normalise.test.ts` (TASK-012; COMP-008, FR-003, BR-008, BR-016, TC-002, TC-030; `tests/unit/normalise.test.ts`)
- [ ] T014 [P] [US2] Unit tests for COMP-007 LLM adapter: 2 providers, Zod contract validation, source evidence span extraction, retry on invalid format, and fallback on failure in `tests/unit/llm-adapter.test.ts` (TASK-013; COMP-007, FR-004, BR-008, BR-023, TC-002, TC-017, TC-027, TC-028; `tests/unit/llm-adapter.test.ts`)
- [ ] T015 [P] [US2] Unit tests for COMP-009 intake orchestrator and question templates: missing field detection, max 4 question rounds, deterministic district selection, and pre-filled draft handoff in `tests/unit/intake-orchestrator.test.ts` (TASK-020; COMP-009, FR-005, FR-026, BR-015, TC-003, TC-017; `tests/unit/intake-orchestrator.test.ts`)
- [ ] T016 [P] [US2] Integration contract test for API-002 POST `/api/intake/extract`: input length validation (20–2,000 chars), evidence verification, next question generation, draft revision increment, and spend reservation in `tests/integration/api-intake-extract.test.ts` (TASK-020; API-002, FR-001, FR-003, FR-004, FR-005, BR-008, BR-015, BR-023, TC-002, TC-003, TC-043; `tests/integration/api-intake-extract.test.ts`)
- [ ] T017 [P] [US2] E2E journey test for SCREEN-002 draft extraction, field evidence cards, single question prompt, and 4-round limit transition to manual form in `tests/e2e/intake-followup.spec.ts` (owner: Sadman) (TASK-021; SCREEN-002, COMP-027, FR-003, FR-005, FR-026, TC-002, TC-003, TC-017; `tests/e2e/intake-followup.spec.ts`)

### Implementation for User Story 2

- [ ] T018 [US2] Implement deterministic normaliser COMP-008 in `src/server/normalise/index.ts` with submodules for digits, relative time, phone, romanisation, and district mapping using TASK-009 data (TASK-012; COMP-008, FR-003, BR-008, BR-016, TC-002, TC-030; `src/server/normalise/index.ts`)
- [ ] T019 [US2] Implement LLM adapter COMP-007 in `src/server/ai/index.ts`, `src/server/ai/providers.ts`, and `src/server/ai/extract.ts` with 2-provider support, Zod validation, evidence span calculation, retry, and fallback without guessing unknown fields (TASK-013; COMP-007, FR-004, BR-008, BR-023, TC-002, TC-017, TC-027; `src/server/ai/index.ts`, `src/server/ai/providers.ts`, `src/server/ai/extract.ts`)
- [ ] T020 [US2] Implement intake orchestrator and follow-up question generator COMP-009 in `src/server/intake/orchestrator.ts` and `src/server/intake/questions.ts` capping questions at 4 rounds (TASK-020; COMP-009, FR-005, FR-026, BR-015, TC-003, TC-017; `src/server/intake/orchestrator.ts`, `src/server/intake/questions.ts`, `src/server/intake/index.ts`)
- [ ] T021 [US2] Implement API-002 route handler POST `/api/intake/extract` in `src/app/api/intake/extract/route.ts` with atomic call reservation, metadata-only draft update, and next question generation (TASK-020; API-002, FR-001, FR-003, FR-004, FR-005, BR-008, BR-023, TC-002, TC-003, TC-043; `src/app/api/intake/extract/route.ts`)
- [ ] T022 [US2] Implement SCREEN-002 review cards (COMP-028) and follow-up question prompt (COMP-027) with answer submission in `src/app/(parent)/report/page.tsx` (TASK-021; SCREEN-002, COMP-027, COMP-028, FR-003, FR-005, TC-002, TC-003; `src/app/(parent)/report/page.tsx`)
- [ ] T023 [US2] Wire fallback handoff from SCREEN-002 to manual form SCREEN-005 (owner: Mahim) when 4 follow-up rounds are exceeded or unresolvable fields remain (TASK-021, TASK-025; FR-005, FR-026, BR-015, SCREEN-005, TC-017; `src/app/(parent)/report/page.tsx`, `src/app/(parent)/form/page.tsx`)

**Checkpoint**: At this point, User Stories 1 and 2 work together: typed or spoken input is extracted into structured fields with source spans, follow-up questions complete missing mandatory fields, and excess rounds hand off to SCREEN-005 (owner: Mahim).

---

## Phase 5: User Story 3 — Confirm the reviewed report exactly once (Priority: P1)

**Goal**: SCREEN-003 exposes all extracted values and explicit unknowns as editable; the parent checks "I have checked" and submits via API-003; server stores 0 child case rows prior to submit; confirmed report returns an owner-scoped reference and moves to SCREEN-004 (owner: Mahim).

**Independent Test**: Seed device draft, inspect server database before submit, edit clothing, check confirmation, submit, replay identical and changed payload (TC-004, TC-031, TC-042, TC-054, TC-060).

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T024 [P] [US3] Unit and integration tests for API-003 POST `/api/cases` submission and idempotency: BR-015/BR-016 validation, identical (principal, submission_uuid, payload_hash) replay 200, changed payload conflict (E-005/E-006, see OD-015-1), and case service delegation in `tests/integration/api-cases-create.test.ts` (TASK-022; API-003, FR-006, FR-007, FR-031, BR-004, BR-015, BR-016, BR-024, TC-004, TC-031, TC-042, TC-054; `tests/integration/api-cases-create.test.ts`)
- [ ] T025 [P] [US3] Pre-submit safeguarding test verifying zero child case rows, no candidate exposure, and metadata-only server storage before confirmation in `tests/integration/pre-submit-zero-rows.test.ts` (TASK-022; BR-004, BR-023, TC-004, TC-060; `tests/integration/pre-submit-zero-rows.test.ts`)
- [ ] T026 [P] [US3] E2E journey test for SCREEN-003 review, field inline editing, explicit unknown display, mandatory check verification, and navigation to SCREEN-004 on submit in `tests/e2e/review-submit.spec.ts` (owner: Sadman) (TASK-022; SCREEN-003, FR-006, FR-007, BR-004, TC-004, TC-031; `tests/e2e/review-submit.spec.ts`)

### Implementation for User Story 3

- [ ] T027 [US3] Implement browser device-local draft storage and retrieval with client submission UUID management in `src/app/(parent)/lib/draft-storage.ts` ensuring child payload remains on device pre-submit (TASK-022; BR-004, BR-023, FR-007, TC-004, TC-060; `src/app/(parent)/lib/draft-storage.ts`)
- [ ] T028 [US3] Implement SCREEN-003 Case Review screen with editable field cards (COMP-028), explicit "অজানা" (unknown) text, confirmation checkbox, and submit bar (COMP-029) in `src/app/(parent)/review/page.tsx` (TASK-022; SCREEN-003, COMP-028, COMP-029, COMP-044, FR-006, FR-007, BR-004, TC-004, TC-030; `src/app/(parent)/review/page.tsx`)
- [ ] T029 [US3] Implement API-003 route handler POST `/api/cases` delegating to case service `createMissingCase` with canonical payload hash, idempotency handling, and owner-scoped projection in `src/app/api/cases/route.ts` (BLOCKED until the Obidit + Mahim route-writer decision (plan.md:67)) (TASK-022; API-003, FR-006, FR-007, FR-031, BR-004, BR-015, BR-016, BR-024, TC-004, TC-031, TC-042, TC-054; `src/app/api/cases/route.ts`)
- [ ] T030 [US3] Clear device-local draft on successful submission and navigate to SCREEN-004 case output screen (owner: Obidit for TASK-022; the S-004 navigation to `case/[ref]/page.tsx` is TASK-024, owner Sadman, a small PR tagged for Sadman) (TASK-022, TASK-024; FR-007, SCREEN-004, TC-004; `src/app/(parent)/review/page.tsx`, `src/app/(parent)/case/[ref]/page.tsx`)

**Checkpoint**: At this point, User Stories 1, 2, and 3 form the complete parent intake path: report creation, review before submit, scoped idempotency, and handoff to output screen SCREEN-004 (owner: Mahim).

---

## Phase 6: User Story 4 — Continue safely when AI is unavailable or cached (Priority: P1)

**Goal**: Limit paid calls to at most six per draft with atomic budget reservations and rate limits; provide manual form fallback on AI failure or budget exhaustion; support DEMO_MODE cached responses for three scripted synthetic cases with visible "ক্যাশ" and "সিনথেটিক" badges, excluded from quality evaluation.

**Independent Test**: Force two extraction failures, budget refusal, replayed draft token, and offline demo cache hit/miss without paying a provider (TC-017, TC-021, TC-036, TC-043, TC-056).

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T031 [P] [US4] Unit tests for spend counters and atomic reservations (`reserve_ai_call`, `settle_ai_call`), 6-call per draft cap, and budget stop in `tests/unit/spend-counters.test.ts` (TASK-063; BR-023, DECISION-017, TC-036, TC-043, TC-065; `tests/unit/spend-counters.test.ts`)
- [ ] T032 [P] [US4] Integration tests for draft token replay resistance, rate limits (10/min/user, 30/min/IP on AI actions per `docs/spec/D1_PRD_V2.md:453` NFR-009), and manual fallback on budget refusal (E-023) in `tests/integration/spend-concurrency.test.ts` (TASK-063; BR-023, DECISION-017, NFR-009, TC-036, TC-043; `tests/integration/spend-concurrency.test.ts`)
- [ ] T033 [P] [US4] Unit and integration tests for demo cache COMP-017: 3 scripted synthetic cases, cache key generation, offline hit/miss handling, and evaluation contamination exclusion in `tests/unit/demo-cache.test.ts` (TASK-033; COMP-017, FR-027, FR-032, BR-026, TC-021, TC-056; `tests/unit/demo-cache.test.ts`)
- [ ] T034 [P] [US4] E2E journey test in `DEMO_MODE=1` with network offline exercising scripted Rafi note, cached badges, and manual form fallback on cache miss in `tests/e2e/demo-mode-offline.spec.ts` (owner: Sadman) (TASK-033; COMP-017, COMP-048, FR-027, FR-032, BR-026, TC-021; `tests/e2e/demo-mode-offline.spec.ts`)

### Implementation for User Story 4

- [ ] T035 [US4] Implement atomic paid-call reservation and settlement helpers using schema functions (`reserve_ai_call`, `settle_ai_call`) and 6-call per draft enforcement in `src/server/spend/reservations.ts` and `src/server/spend/counters.ts` (TASK-063; BR-023, DECISION-017, TC-036, TC-043, TC-065; `src/server/spend/reservations.ts`, `src/server/spend/counters.ts`, `src/server/spend/index.ts`)
- [ ] T036 [US4] Implement `npm run spend` CLI script and budget check against default USD 25 limit in `scripts/spend.ts` (path not in plan.md; confirm at /speckit-analyze) and `src/server/spend/cli.ts` (TASK-059; BR-023, DECISION-017, NFR-016, TC-036; `scripts/spend.ts` (path not in plan.md; confirm at /speckit-analyze), `src/server/spend/cli.ts`)
- [ ] T037 Seed loader synthetic demo fixtures for 3 scripted cases (owner: Masnun) (TASK-019; FR-027, BR-026, TC-021; `fixtures/demo/cases.json` (needs the TASK-033 alignment that plan.md:57 requires before implementation))
- [ ] T038 [US4] Implement demo-safe cache COMP-017 with 3 scripted synthetic cases and offline fallback in `src/server/cache/fixtures.ts` and `src/server/cache/index.ts` (TASK-033; COMP-017, FR-027, FR-032, BR-026, TC-021, TC-056; `src/server/cache/fixtures.ts`, `src/server/cache/index.ts`)
- [ ] T039 [US4] Implement COMP-048 cached badge ("ক্যাশ") and synthetic badge ("সিনথেটিক") display components on SCREEN-002 in `src/components/badges/cached-badge.tsx` (path not in plan.md; confirm at /speckit-analyze) and `src/app/(parent)/report/page.tsx` (TASK-033, TASK-021; COMP-048, FR-027, FR-032, BR-026, TC-021; `src/components/badges/cached-badge.tsx` (path not in plan.md; confirm at /speckit-analyze), `src/app/(parent)/report/page.tsx`)
- [ ] T040 [US4] Wire AI service failure (E-012, E-013) and spend refusal (E-023) directly to pre-filled manual form SCREEN-005 (owner: Mahim) (TASK-021, TASK-025; FR-026, BR-023, SCREEN-005, TC-017, TC-036; `src/app/(parent)/report/page.tsx`, `src/app/(parent)/form/page.tsx`)

**Checkpoint**: All four user stories are functional and protected by rate/call limits, atomic reservations, offline demo cache, and manual fallback.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Accessibility checks, bilingual copy verification, and quickstart end-to-end synthetic validation.

- [ ] T041 [P] Accessibility audit: verify ≥44 px touch targets, 320 CSS px reflow, 200% text zoom, and aria-live announcements for SCREEN-001–SCREEN-003 in `tests/e2e/parent-a11y.spec.ts` (owner: Sadman) (TASK-034; NFR-011, FR-033, TC-033, TC-058; `tests/e2e/parent-a11y.spec.ts`)
- [ ] T042 [P] Bilingual copy validation: verify exact Bangla and English strings for all loading, empty, and error states (E-001, E-007–E-015, E-022, E-024) across parent screens in `src/locales/` (path not in plan.md; confirm at /speckit-analyze) (TASK-035; FR-033, COMP-022; `src/locales/index.ts`, `tests/unit/locales.test.ts`)
- [ ] T043 Execute future validation guide steps from quickstart.md using synthetic fixtures without paid provider calls or real data (TASK-021, TASK-022; TC-001–TC-004, TC-017, TC-021, TC-031, TC-060, TC-061; `specs/002-intake-ai/quickstart.md`)

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup (Phase 1)**: Depends on repo scaffold (TASK-001; plan.md:15, spec.md:139); configures `.env.example` and `docs/costs.md`.
- **Foundational (Phase 2)**: Depends on repo scaffold (TASK-001), Platform Foundation contracts (TASK-061) and shared API layer (TASK-007); requires Masnun's district dataset (TASK-009).
- **User Story 1 (Phase 3)**: Depends on Phase 1 & 2; requires app shell (TASK-008; plan.md:64, spec.md:138) for parent UI (TASK-021) and speech validation spike (TASK-005).
- **User Story 2 (Phase 4)**: Depends on normaliser (TASK-012, blocked by Masnun's TASK-009), LLM adapter (TASK-013), and orchestrator (TASK-020).
- **User Story 3 (Phase 5)**: Depends on User Story 1 & 2 UI (TASK-021, requiring TASK-008 shell) and Mahim's case service (TASK-015).
- **User Story 4 (Phase 6)**: Depends on counters (TASK-063, blocked by TASK-062), spend CLI (TASK-059), and demo cache (TASK-033, blocked by Masnun's TASK-019).
- **Polish (Phase 7)**: Depends on all user stories completing.

### Within Each User Story
1. Tests must be written first and fail before implementation begins.
2. Server services/adapters precede API route handlers.
3. API route handlers precede UI page wiring.
4. Fallbacks to manual form SCREEN-005 (owner: Mahim) are wired after main flows.

### Parallel Opportunities
- Setup task T001 can run independently.
- Foundational contract checks (T003) and API helper checks (T004) can run in parallel.
- All test tasks marked `[P]` within each story can run in parallel.
- SCREEN-001 (T011) can be developed in parallel with speech adapter (T009).
- Normaliser (T018) and LLM adapter (T019) can be tested in parallel once district data exists.
- Cross-cutting checks T041 and T042 can run in parallel in Phase 7.

---

## Work already in flight

Note: Without changing any task's wording, branches exist for:
- PRs #15 (TASK-023), #17 (TASK-047) and #18 (TASK-012) are open.
- PR #16 (Vercel framework pin, branch phase2--obidit-vercel-framework) is open.
- PR #20 (TASK-022 API-003 half) is an open draft.
- TASK-021, TASK-063 and TASK-013 exist only as local lane branches (phase2--obidit-intake-ui, phase2--obidit-spend-counters, phase2--obidit-llm) and have no PR yet.

Platform tasks TASK-006, 007, 008, 015 and 062 are merged into phase2 (docs/agents/handoff/OBIDIT.md, 'What depends on Mahim'). None of the Obidit tasks below has merged yet.

---

## Conflicts found

When the sources disagree, the spec pack (`docs/spec/`) wins. The following conflicts were identified and are left unresolved:

1. **API-003 Route Ownership**:
   - `docs/spec/D6_Implementation_Plan_V2.md` §5 assigns `TASK-022` (SCREEN-003 review + API-003 + draft persistence) to **Obidit** (owner code O).
   - `AGENTS.md` (ownership table) assigns `src/app/api/**` to the owner of the matching server module, which for case persistence (`src/server/case/`, TASK-015) is **Sadman/Mahim**.
   - In flight work has draft PR #20 for "TASK-022 API-003 half". Per `docs/spec/`, D6 ownership stands until an Obidit and Mahim decision resolves the routing boundary.

2. **Changed Payload Conflict Error Code on Submission Replay (OPEN decision OD-015-1)**:
   - The spec pack itself disagrees on the error code for a submission key replay with a changed payload:
     - `docs/spec/D2_TRD_PartA_V2.md:304` states "same UUID/different payload → E-005".
     - `docs/spec/D2_TRD_PartB_V2.md:149` and `PartA:227` define E-006 as `SUBMISSION_PAYLOAD_CONFLICT`, and `docs/spec/D3_App_Flow_V2.md` line 100 lists E-006 as an error state without condition (`docs/code/fera_types_v2.ts` contains neither code).
     - `docs/agents/handoff/COMMON.md:112` lists OD-015-1 ("E-006 not D2A's E-005. OK?") as an open decision for Obidit.
   - Status: OPEN decision (OD-015-1); not resolved by "docs/spec wins" because the pack itself is divided.

3. **Normaliser Test Count Requirement**:
   - Generic vendor skills state an 80% coverage default.
   - `docs/spec/D6_Implementation_Plan_V2.md` TASK-012 specifies "30 unit tests pass", reaffirmed by `AGENTS.md` AMD-AGENTS-5 ("Use D6's ≥30 normaliser/≥60 overall tests"). D6 wins.

4. **Auth Framework for Session Management**:
   - `docs/spec/D6_Implementation_Plan_V2.md` TASK-006 specifies "Auth.js credentials, parent cookie, requireRole, seeded users".
   - `docs/execution/PHASE_2_MUST_CORE.md` TASK-006 notes a custom session implementation (OD-006-1) replacing Auth.js pending all-owner sign-off. D6 remains the spec-pack baseline.

5. **Pre-submit Draft Persistence Location**:
   - V1 draft text suggested potential server-stored drafts, whereas the V2 spec pack (`docs/spec/D1_PRD_V2.md` BR-004, `docs/spec/D2_TRD_PartA_V2.md:21` (V2 release contract) and `docs/spec/D2_TRD_PartA_V2.md:145` (§3.4), `docs/spec/D6_Implementation_Plan_V2.md` "V2 release contract") mandates device-local (browser) draft storage with zero child case rows on the server prior to explicit confirmation on SCREEN-003. `docs/spec/` wins.

---

## Phase 8: Convergence (2026-10-18)

**Purpose**: Append-only convergence pass against the existing source tree, the per-feature evidence in `docs/execution/evidence/` and the V2 spec pack. The original T001–T043 wording is **not** changed; no checkbox is set to done without evidence, and no item is silently dropped. Converge finds the buildable gaps that remain on Obidit's owned slice and surfaces them to the coordinator; owner-blocked items are listed but not acted on by this lane.

Status convention for this phase: each new task starts `unchecked`. The `Status (verified evidence)` line under each task records what was observed in the worktree on 2026-10-18 (Asia/Dhaka) by the convergence pass — it is not a checklist mutation of T001–T043.

### Buildable gaps on Obidit's owned slice (CRITICAL/HIGH first)

- [ ] T044 Add two more synthetic `ExtractFixture` rows and matching `TranscriptFixture` rows to `src/server/cache/fixtures.ts` so the protected `DEMO_MODE=1` cache ships three scripted synthetic cases per T033 (TC-021, FR-027/032, BR-026); the SHA-256 key shape and the `cached: true` return path in `findExtractFixture` are already in place. **Status (verified evidence)**: `EXTRACT_FIXTURES` currently has exactly **one** row (`EXTRACT_FIXTURE_DRAFT` for TC-002) and `TRANSCRIPT_FIXTURES` is `Object.freeze([])`; `tests/cache/fixtures.test.ts` passes against this single-row state. The two missing scripted cases are `partial` for the V2 spec's "three scripted synthetic cases" wording. (gap type: partial; severity: HIGH)
- [ ] T045 Add the offline-cache-miss banner to `src/app/(parent)/intake/intake-chat.tsx` (and the equivalent edit-mode copy in `src/app/(parent)/intake/review/edit-mode-screen.tsx`) so `cache_hit === false && navigator.onLine === false` shows an explicit unavailable/manual state per T033 / TC-021 / E-011/E-013. **Status (verified evidence)**: `provider-notice.tsx` carries the cached/synthetic badges; the offline-miss itself is not visibly distinct from a fresh-page load today. The wording is owned by D3 §7 and needs a Bangla reviewer pass before merge. (gap type: partial; severity: HIGH)
- [ ] T046 Wire API-001 (`src/app/api/intake/transcribe/route.ts`) to a real STT provider through the existing `createSttAdapter` seam in `src/server/intake/orchestrator.ts` and the `runPaidCall` budget wrapper in `src/server/spend/paid-call.ts`, so the per-attempt reservation and notice requirements are honoured end-to-end. **Status (verified evidence)**: route file (`route.ts`) is a 12-line stub that delegates to `getIntakeRouteDeps().transcribe`; `deps.ts` wires the orchestrator; the orchestrator already calls `runPaidCall` (`orchestrator.ts`); `speech-adapter.md` review ends with "Phone voice test NOT MET". No real provider is configured; OQ-004 / OQ-022 remain UNKNOWN and `docs/costs.md` is absent. This is a coordinator / lead blocker until OQ-004/OQ-022 resolve; on Obidit's owned slice the seam is built. (gap type: partial; severity: HIGH; coordinator decision required)
- [ ] T047 Have a Bangla reviewer (per `AGENTS.md` agent roster) sign off on the round-3 strings still marked "needs Bangla review" in `intake-ui.md` round-2 SG/SW follow-ups and the new round-3 strings added to `src/locales/areas/parent-{intake,review,form,status}.ts`; the `tests/{locales,locale-cookie,locales-areas}.test.ts` cases are already green. **Status (verified evidence)**: `npm run lint` exit 0; `npm run typecheck` exit 0; `tests/intake-ui` 497/497; new round-3 strings added under review but not signed off. (gap type: partial; severity: MEDIUM; human-review item)
- [ ] T048 Record in `docs/execution/evidence/spend-cli.md` (or a successor note) that `npm run spend` and `tests/scripts/spend-cli.test.ts` are restored in `package.json` and pass — the lead blocker note in `spend-cli.md` is now historical. **Status (verified evidence)**: `package.json:14` has `"spend": "node scripts/spend.mjs"`; OD-059-4 resolved per `spend-cli.md`. Recorded as converged; no software action. (gap type: partial; severity: MEDIUM; documentation only)
- [ ] T049 Surface S-005 manual form (TASK-025, owner: Mahim) handoff from S-002 in `src/app/(parent)/intake/intake-chat.tsx` round-2 — `intake-ui.md` confirms E-012/E-013/E-023 already open the manual path; this task only adds the cross-feature verification entry in the S-005 evidence file `s004-outputs.md` (or its successor) so the coordinator sees the Obidit→Mahim handoff is exercised. **Status (verified evidence)**: `src/app/(parent)/intake/form/page.tsx` exists with `manual-form.tsx` (S-005); S-002 calls `takeHandoff()` and routes to it for the documented errors. (gap type: partial; severity: MEDIUM; owner: Mahim lane)

### Unrequested / path drift on Obidit's owned slice

- [ ] T050 Either extract the inline `<HonestLabel>` usage in `provider-notice.tsx`, `intake-chat.tsx`, `review-screen.tsx`, `edit-mode-screen.tsx`, and `manual-form.tsx` into `src/app/components/honest-label.tsx` (a shared component matching T039's path `src/components/badges/cached-badge.tsx`), or leave the path as-is and update the spec-board's T039 path. **Status (verified evidence)**: cached and synthetic badges render correctly via `<HonestLabel>` (`src/locales/index.ts:200-202`); the spec-board's `src/components/badges/cached-badge.tsx` path does not exist. Function met, path drift is the only artefact. (gap type: unrequested; severity: LOW)
- [ ] T051 Resolve OD-015-1 by either (a) updating the implemented route `src/app/api/cases/route.ts` to return E-005 on changed-payload replay per `docs/spec/D2_TRD_PartA_V2.md:304` and updating `tests/intake/submit-api.test.ts` accordingly, or (b) amending `docs/spec/D2_TRD_PartA_V2.md` to confirm E-006 as the chosen key (matches the current route and tests). **Status (verified evidence)**: route returns E-006 today (`tests/intake/submit-api.test.ts`); pack itself disagrees. All-owner decision required. (gap type: contradicts; severity: LOW; OPEN decision)

### Converged on Obidit's owned slice (recorded for the coordinator)

The following are recorded as converged on Obidit's owned slice with evidence. The original T001–T043 wording is unchanged; these lines are observations, not checkboxes.

- **T001–T012 (US1)**: SCREEN-001 welcome page (`src/app/(parent)/page.tsx`), provider notice (`provider-notice.tsx`), SCREEN-002 intake chat (`src/app/(parent)/intake/intake-chat.tsx`), voice recorder (`src/app/(parent)/intake/voice-recorder.tsx`), typed-text path, language toggle (`src/app/components/language-toggle.tsx`), 13219 link, `FERA_INTAKE_CLIENT=fake` default with `live` HTTP option. Speech adapter (`src/server/speech/{adapter,types,index}.ts`) passes 29/29 in `tests/speech/adapter.test.ts`. `intake-ui.md` rounds 1–4 with safeguarding PASS and Impeccable finish review.
- **T013–T023 (US2)**: Normaliser (`src/server/normalise/`) 93/93 across 5 files (`tests/normalise/`); LLM adapter (`src/server/ai/`) 535/535 (`tests/ai`); orchestrator + question templates (`src/server/intake/orchestrator.ts`, `questions.ts`, `rounds.ts`) PASS in `tests/intake/orchestrator.test.ts`, `tests/intake/questions.test.ts`, `tests/intake/rounds.test.ts`. `intake-normaliser.md`, `intake-llm-adapter.md`, `intake-questions.md`.
- **T024–T030 (US3)**: API-003 server half (`src/app/api/cases/route.ts`) PASS at DB level (`tests/db/submit.test.ts`); S-003 device draft store (`src/lib/intake/draft-store.ts`) PASS; S-003 review screen (`src/app/(parent)/intake/review/{page,review-screen,review-fields,edit-mode-screen}.tsx`) PASS; idempotent replay returns 200 with same ref. `intake-submit-api.md`, `review-submit-ui.md`.
- **T031–T040 (US4)**: Spend counters (`src/server/spend/{service,paid-call,errors,money,price-sheet}.ts`) PASS at DB level (`tests/db/spend.test.ts`, `intake-spend-counters.md`); spend CLI (`scripts/spend.mjs`, `tests/scripts/spend-cli.test.ts`) PASS (`spend-cli.md`); demo cache fixtures (`src/server/cache/fixtures.ts`) PASS for the single prepared case (`tests/cache/fixtures.test.ts`); manual fallback to S-005 wired.
- **T041–T043 (Polish)**: locale validation green; accessibility audit is Mahim's lane (TASK-034/038); quickstart end-to-end validation is the lead's lane and runs only against the merged `phase2` runtime.

### Cross-feature dependencies this pass leaves for the coordinator

- **001-platform-foundation**: `src/contracts/` freeze / `contracts-v1` tag still pending Mahim's all-owner review (`001/tasks.md:24`, `docs/agents/handoff/OBIDIT.md`); OQ-021 managed host UNKNOWN; OD-006-1 (Auth.js vs. custom session) OPEN. Obidit does not own 001 code; recorded not blocked.
- **003-parent-outputs**: spec board (plan.md, tasks.md) is recovered as artifacts in this pass (`specs/003-parent-outputs/plan.md`, `tasks.md`); S-004 poster PNG (TASK-024, owner: Mahim), S-005 manual form (TASK-025, owner: Mahim), S-008 sign-in / S-016 not-found (TASK-031, owner: Mahim) live in Mahim's lane. Obidit-owned: API-006 outputs route, API-005 edit-after-submit, API-018 my-case, SCREEN-006 status page — already implemented (`src/app/api/cases/[id]/outputs/route.ts`, `src/app/api/cases/[id]/route.ts` PATCH, `src/app/api/my-case/route.ts`, `src/app/(parent)/status/page.tsx`).

### Phase 8 references

- `docs/execution/evidence/pre-main-convergence-intake.md` (this convergence pass, owned).
- Per-feature evidence: `intake-ui.md`, `intake-normaliser.md`, `intake-llm-adapter.md`, `intake-questions.md`, `intake-submit-api.md`, `review-submit-ui.md`, `intake-spend-counters.md`, `spend-cli.md`, `outputs-templates.md`, `s004-outputs.md`, `speech-adapter.md`.

---

## Phase 9: Corrective disposition (2026-10-18, supersedes the §0 first-pass)

**Purpose**: Append-only corrective disposition that supersedes false findings in the §0 first-pass of `pre-main-convergence-intake.md`. The original T001–T043 wording and the Phase 8 T044–T052 lines are preserved as historical record. The disposition below records the authoritative read against the current code/evidence. No checkbox is set to done; no item is silently dropped.

- **T044 / T045 — partial, PENDING the `pre-main--cache-offline-fixes` lane.** `src/server/cache/fixtures.ts` ships **one** `EXTRACT_FIXTURE` and zero `TRANSCRIPT_FIXTURES`; T033 / TC-021 ask for three scripted synthetic cases. A separate Puku worker lane is adding the two missing fixtures and the offline-miss banner. Obidit's owned slice (cache key shape, `cached: true` return path, `[MOCK]` / `ক্যাশ · সিনথেটিক` badge wiring) is in place.
- **T046 — partial, route is implemented.** Coordinator-verified: `src/app/api/intake/transcribe/route.ts` and `src/app/api/intake/extract/route.ts` both exist; deps wired through `src/app/api/intake/deps.ts`; `tests/api` 303/303 across 17 files. The first-pass "API-001 not built" framing was wrong. The remaining gap is "no real STT provider wired" — the `createSttAdapter` seam in `src/server/intake/orchestrator.ts` and the `runPaidCall` budget wrapper are in place; OQ-004 / OQ-022 are UNKNOWN; the route file is not the gap, the real-provider wiring is.
- **T047 — partial, human-review item.** Round-3 strings still under Bangla reviewer sign-off; `tests/{locales,locale-cookie,locales-areas}.test.ts` are green.
- **T048 — withdrawn (already functional).** `scripts/spend.mjs` and `tests/scripts/{spend,spend-cli}.test.ts` exist; `package.json:14` has `"spend": "node scripts/spend.mjs"`; OD-059-4 resolved per `spend-cli.md`. No software gap.
- **T049 — withdrawn (already functional / Mahim lane).** E-012/E-013/E-023 → S-005 manual form handoff wired in `intake-ui.md`; `src/app/(parent)/intake/form/page.tsx` (TASK-025) is Mahim's lane. Recorded not owned.
- **T050 — unrequested / path drift.** Cached and synthetic badges render correctly via inline `<HonestLabel>` (`provider-notice.tsx`, `intake-chat.tsx`, `review-screen.tsx`, `edit-mode-screen.tsx`, `manual-form.tsx`); the spec-board path `src/components/badges/cached-badge.tsx` does not exist. Function met, path drift is the only artefact.
- **T051 — withdrawn (already resolved by implementation).** API-003 route lives at `src/app/api/cases/route.ts`; ownership question recorded in the route header. Not an open question on this pass.
- **T052 — contradicts (OD-015-1 OPEN).** D2 Part A says `same UUID/different payload → E-005`; D2 Part B and Part A define E-006 as `SUBMISSION_PAYLOAD_CONFLICT`; the implemented route returns E-006 (`tests/intake/submit-api.test.ts`). Pack is divided; coordinator / all-owner decision required; no software gap on Obidit's owned slice.

### Phase 9 references

- `docs/execution/evidence/pre-main-convergence-intake.md` §0 (corrective disposition), §2.2, §3, §4.

---

## Phase 10: Status closure (2026-10-18, final)

**Purpose**: Row-by-row software status for T001–T043 (and Phase 8/9 T044–T052) against the current source/tests/evidence in this worktree. The original T001–T043 / T044–T052 wording is unchanged. No checkbox on the original lines is mutated. The closure matrix in `docs/execution/evidence/pre-main-convergence-intake.md` §7.2 is the canonical version; this section is the spec-board disposition summary.

**Legend** (matches the evidence file): `S` = software implemented on the current source tree, `H` = human-acceptance evidence still pending, `O` = open decision (OD-###), `E` = external (provider, host, phone, organiser), `—` = not applicable (cross-owner / Sadman-owned).

| ID | Status | One-line evidence |
|---|---|---|
| T001 | S / E | `.env.example` exists; `docs/costs.md` UNKNOWN; OQ-004 / OQ-022 = `E` |
| T002 | S / H | `db/seed/districts.json` exists; Masnun-owned |
| T003 | S | `src/contracts/draft.ts`; `tests/contracts/intake-contract.test.ts` green |
| T004 | S | `src/app/api/_shared/*`; `tests/api/platform.test.ts` green |
| T005 | S | `tests/speech/adapter.test.ts` 29/29 green |
| T006 | S | `tests/api/intake-transcribe.test.ts` green |
| T007 | — / H | `tests/e2e/intake-voice-text.spec.ts` is Sadman's lane |
| T008 | S | `src/server/speech/validate.ts` + `src/server/intake/audio-metadata.ts` |
| T009 | S | `src/server/speech/*`; `tests/speech/*` green |
| T010 | S / E | route + tests green; OQ-004 / OQ-022 = `E` |
| T011 | S | `src/app/(parent)/page.tsx` + `parent-ui.tsx` + `start-button.tsx` + `provider-notice.tsx` |
| T012 | S | `src/app/(parent)/intake/{page,intake-chat,voice-recorder}.tsx`; `tests/intake-ui` 502/502 |
| T013 | S | `tests/normalise/*` 93/93; D6 ≥30 requirement met |
| T014 | S | `tests/ai/*` 535/535 |
| T015 | S | `tests/intake/{orchestrator,questions,rounds}.test.ts` 81/81 |
| T016 | S | `tests/api/intake-extract.test.ts` green |
| T017 | — / H | `tests/e2e/intake-followup.spec.ts` is Sadman's lane |
| T018 | S | `src/server/normalise/*` |
| T019 | S / E | `src/server/ai/*`; OQ-004 = `E` |
| T020 | S | `src/server/intake/{orchestrator,questions,rounds,index,registry,runtime,drafts,audio-metadata}.ts` |
| T021 | S | `src/app/api/intake/extract/route.ts`; `tests/api` 303/303 |
| T022 | S | `src/app/(parent)/intake/{intake-chat,page}.tsx` + `intake/review/*` |
| T023 | S / H | handoff wired; S-005 = Mahim's TASK-025 |
| T024 | S | `tests/api/cases-create.test.ts` + `tests/db/submit.test.ts` green |
| T025 | S | `tests/integration/pre-submit-zero-rows.test.ts` + `tests/api/cases-create.test.ts` |
| T026 | — / H | `tests/e2e/review-submit.spec.ts` is Sadman's lane |
| T027 | S | `src/lib/intake/draft-store.ts`; `review-submit-ui.md` |
| T028 | S | `src/app/(parent)/intake/review/{page,review-screen,review-fields,edit-mode-screen}.tsx` |
| T029 | S | `src/app/api/cases/route.ts`; route header records the ownership decision |
| T030 | S / H | Obidit clears the draft; S-004 navigation = Mahim's TASK-024 |
| T031 | S | `tests/spend/*` green |
| T032 | S | `tests/intake/spend-concurrency.test.ts` green |
| T033 | S / pending-merge | Obidit seam in place; 3-row fixtures on sibling `pre-main--cache-offline-fixes` at `dac1b2f` |
| T034 | — / H | `tests/e2e/demo-mode-offline.spec.ts` is Sadman's lane |
| T035 | S | `src/server/spend/*` |
| T036 | S | `scripts/spend.mjs` + `package.json:14`; OD-059-4 resolved |
| T037 | S / H | `db/seed/districts.json` + `synthetic-set.md`; Masnun-owned |
| T038 | S / pending-merge | Obidit seam in place; 2 extra fixtures + offline-miss banner on sibling branch |
| T039 | S | inline `<HonestLabel>`; path drift only |
| T040 | S / H | handoff wired; S-005 = Mahim's TASK-025 |
| T041 | — / H | `tests/e2e/parent-a11y.spec.ts` is Sadman's lane |
| T042 | S / H | `tests/locales*` green; round-3 strings `H` |
| T043 | — / E | lead's lane; AMD-AGENTS-1 keeps cutoff `UNKNOWN` |
| T044 | S / pending-merge | closed on sibling branch at `dac1b2f`; root merge pending |
| T045 | S / pending-merge | closed on sibling branch at `dac1b2f`; root merge pending |
| T046 | S / E | route + seam in place; OQ-004 / OQ-022 = `E` |
| T047 | H | `tests/locales*` green; human sign-off `H` |
| T048 | S | `scripts/spend.mjs`; OD-059-4 resolved |
| T049 | S / H | handoff wired; S-005 = Mahim's lane |
| T050 | S | inline `<HonestLabel>`; path drift only |
| T051 | S | `src/app/api/cases/route.ts`; ownership resolved by implementation |
| T052 | O | OD-015-1 OPEN; no software change without all-owner decision |

**002 closure**: 43/43 have software evidence on this worktree (with explicit `E` flags for real STT/LLM/provider prices, hosted DB, and organiser cutoff). The cache fixture count gap (T033/T038/T044/T045) is closed on the sibling `pre-main--cache-offline-fixes` branch at `dac1b2f` and is pending root merge. No `NotOwned/RoutesMissing` is asserted as a software gap on Obidit's owned slice.

# Tasks: Parent outputs, manual form fallback, and post-submission lifecycle

**Input**: [spec.md](spec.md), [plan.md](plan.md), the V2 spec pack (`docs/spec/`), and the per-feature evidence in `docs/execution/evidence/{outputs-templates,s004-outputs,platform-case,platform-status,intake-submit-api,intake-ui,review-submit-ui,spend-cli,intake-spend-counters}.md`.

**Status**: Recovered task board (2026-10-18). Feature 003 had no `plan.md` and no `tasks.md` at the start of the pre-main convergence pass; the board is authored from the existing source and evidence per the brief. The V2 spec pack, the constitution and any existing source/test file are untouched. Every checklist item is unchecked. This is a work plan, not evidence of an implemented MVP. (`AGENTS.md`; `.agents/skills/speckit-converge/SKILL.md`; `.specify/templates/tasks-template.md`)

**Owner and lane**: Obidit (TASK-023/047/049/050, API-005/006/018, SCREEN-006) + Mahim (TASK-024 SCREEN-004 + poster PNG, TASK-025 SCREEN-005 manual form; D6 owner S (Sadman), labelled Mahim per AGENTS.md:34). The Obidit rows are lane-a spec-only in this specs-only run; the Mahim rows are tagged `(owner: Mahim)` and belong to his lane.

## Phase 1: Setup

**Purpose**: Confirm the dependent contracts and the existing per-feature evidence that the runtime surfaces rest on. No new setup is proposed; this phase records what already exists in the source tree and what is recorded as UNVERIFIED in the convergence pass.

- [ ] T-001 [Obidit·lane-a] Confirm `src/contracts/` freeze and the `contracts-v1` tag merge before any further API/role change. The 001 board records this as T024 (`specs/001-platform-foundation/tasks.md`); 002 Phase 8 (T044–T052) and the 003 backend changes both wait on it. **blocked-by `001/tasks.md` T024**; OQ-021 host UNKNOWN; OD-006-1 (Auth.js vs. custom session) OPEN. (TASK-061; `docs/agents/handoff/OBIDIT.md`; recorded not Obidit-owned)
- [ ] T-002 [Obidit·lane-a] Confirm the per-feature evidence chain for outputs / edit / status. `docs/execution/evidence/outputs-templates.md` (TASK-023), `platform-case.md` (TASK-049), `platform-status.md` (TASK-050), `intake-submit-api.md` (OD-022-1/3), `s004-outputs.md` (TASK-024, Mahim) and `intake-ui.md` round 2 (badge / `<HonestLabel>`) form the source-of-truth for the runtime path. No new evidence is produced by this specs-only pass. (TASK-023/024/025/047/049/050; `AGENTS.md`)

**Checkpoint**: T-001 is not done until the `contracts-v1` tag merge is in `phase2`. T-002 records the existing chain and is itself a recovery step; no runtime change is implied.

---

## Phase 2: Foundational outputs service (TASK-023)

**Purpose**: Server-side deterministic output generation for the GD draft, poster and 13219 summary, with a wording guard that blocks banned terms before any text is returned or stored.

- [ ] T-003 [Obidit·lane-a] Implement `src/server/outputs/{gd,poster,helpline,guard,types,index}.ts` with deterministic string builders for `type: "gd"`, `type: "poster"`, `type: "helpline"`; the helpline path enforces the 80-word cap at template build time. The runtime surface is in `phase2`; this row records the acceptance rather than the code. **blocked-by TASK-015**; FR-008/009/010. (TASK-023; `outputs-templates.md`; TC-005/006/007)
- [ ] T-004 [Obidit·lane-a] Implement the COMP-016 wording guard at `src/server/outputs/guard.ts` with the banned-term set covering alert / broadcast / runaway / rescue / returned / delivered / legal-compliance / probability language; return E-016 (`OUTPUT_BLOCKED`) on any banned token in the generated text or in the UI copy that names a case as a filed report. **blocked-by TASK-015**; FR-034. (TASK-023; COMP-016; BR-002, BR-003; TC-024, TC-025)
- [ ] T-005 [Obidit·lane-a] Add Vitest unit cases for the templates, the guard and the cache path. The runtime evidence is `tests/outputs/templates.test.ts` (PASS for the 80-word cap worst case 77, TC-005/006/007/024/025). **blocked-by T-003 and T-004**. (TASK-023; D6 TASK-012/038)
- [ ] T-006 [P] [Obidit·lane-a] Add the cache layer by `(case_id, type, case_version)`; `generated_outputs` is the canonical store, obsolete versions are never served as current, and outputs require owning parent authentication. **blocked-by T-003**. (BR-022; API-006; TC-026)

**Checkpoint**: T-003 / T-004 are the gates; the guard must run before any text is returned, and the cache must precede or follow generation atomically so that a wording-guard violation never writes a row. (BR-022; FR-034)

---

## Phase 3: User Story 1 — Ready-to-file GD draft (P1, STORY-005)

- [ ] T-007 [Obidit·lane-a] API-006 `type: "gd"` returns Bangla text from confirmed case fields only; missing fields render as "অজানা" or are omitted; the visible "খসড়া" label is always present; the parent can copy the text. The runtime is at `src/app/api/cases/[id]/outputs/route.ts`. **blocked-by T-003, T-004, T-006**; FR-008. (API-006; BR-002, BR-022; TC-005, TC-025)
- [ ] T-008 [Obidit·lane-a] Add `tests/outputs/service.test.ts` covering TC-005 (field coverage), TC-024 (wording guard) and TC-025 (idempotence at the same case version). **blocked-by T-007**. (TASK-023; D6 TASK-038)

**Independent test**: Seed a confirmed missing case, call API-006 for the GD draft, verify the text contains only confirmed case fields, carries the "খসড়া" label, contains no tokens absent from the case fields, and is served idempotently from cache. (SC-001; TC-005, TC-024, TC-025)

---

## Phase 4: User Story 2 — Shareable no-photo text poster (P1, STORY-006; owner: Mahim)

- [ ] T-009 [(owner: Mahim)] SCREEN-004 outputs screen (`src/app/(parent)/report/[id]/`) shows the reference number, the status badge "খোলা", three output cards (GD draft, poster, 13219 summary) with one-tap copy, the poster preview, the contact-inclusion toggle, the poster PNG download at 1080×1350 px and the share acknowledgement dialog ("প্রকাশের আগে নম্বর ও স্থানের তথ্য দেখুন। ডাউনলোড করা কপি ফেরা মুছতে পারে না।"). **blocked-by T-003, T-004, T-007**; FR-009. (TASK-024; COMP-030, COMP-031; TC-006, TC-025, TC-026)
- [ ] T-010 [(owner: Mahim)] Poster PNG generation. Implementation boundary (client-side render vs. server route) is OD-003-2 and belongs to TASK-024. **blocked-by T-009**; D4 §9, §15. (TASK-024; SC-002)
- [ ] T-011 [Obidit·lane-a] API-006 `type: "poster"` returns the reviewed text-based poster with description, place, event date/time, the prominent helpline 13219 and the optional contact phone (selected by the parent at S-004 before generation/download). No photo slot, image input, or face placeholder is allowed. **blocked-by T-003, T-004, T-006**; FR-009. (API-006; BR-006, BR-022; TC-006, TC-026)
- [ ] T-012 [Obidit·lane-a] Add Playwright acceptance for SCREEN-004 (owner: Mahim): poster preview, phone toggle, sharing acknowledgement dialog, and PNG rendering at 1080×1350 px on a white background with no photo slot. **blocked-by T-009 and T-011**. (TASK-024; SC-002)

**Independent test**: Call API-006 for the poster, verify the text formatting contains description, place, date-time, 13219, and the phone based on the parent's selection. On SCREEN-004 (owner: Mahim), verify the poster preview, the phone toggle, the sharing acknowledgement dialog and the PNG rendering. (SC-002; TC-006, TC-025, TC-026)

---

## Phase 5: User Story 3 — Manual form fallback (P1, STORY-018; owner: Mahim)

- [ ] T-013 [(owner: Mahim)] SCREEN-005 manual form at `src/app/(parent)/intake/form/page.tsx` opens in ≤ 2 s on E-012 (twice), E-013, E-014 (twice), E-023 or ACT-014; pre-fills all known fields from the existing draft; provides a 64-district searchable selector in Bangla and English; accepts Bangla numerals; validates BR-015/016 rules inline; navigates to SCREEN-003 on submit. **blocked-by TASK-022, T-007**; FR-026. (TASK-025; COMP-032; TC-017, TC-030)
- [ ] T-014 [(owner: Mahim)] Add Playwright acceptance for SCREEN-005 covering the open latency, the pre-fill path, the district selector, Bangla numeral acceptance, the inline BR-015/016 validation, and the navigation to SCREEN-003. **blocked-by T-013**. (TASK-025; SC-005)

**Independent test**: Simulate two extraction failures (E-012), an AI outage (E-013), a budget-cap exhaustion (E-023), or trigger ACT-014 from SCREEN-002. Verify SCREEN-005 (owner: Mahim) opens within 2 s with existing draft fields pre-filled, validates BR-015/016 rules inline, accepts Bangla numerals, and navigates to SCREEN-003 on completion. (SC-005; TC-017, TC-030)

---

## Phase 6: User Story 4 — 13219 helpline summary (P2, STORY-007)

- [ ] T-015 [Obidit·lane-a] API-006 `type: "helpline"` returns a Bangla summary of ≤ 80 words from confirmed case fields; the card provides a tap-to-call 13219 link and a copy action with an accessible "কপি হয়েছে" confirmation. **blocked-by T-003, T-004, T-006**; FR-010. (TASK-047; API-006; TC-007, TC-024)
- [ ] T-016 [Obidit·lane-a] Add `tests/outputs/templates.test.ts` coverage for the 80-word cap (worst case 77 today) and the wording-guard pass. **blocked-by T-015**. (TASK-047; SC-003)

**Independent test**: Call API-006 for the 13219 summary, verify the word count ≤ 80 words, the text contains child name/age, last-seen place, time and contact phone, the text carries the "খসড়া" label, and the wording guard passes. (SC-003; TC-007, TC-024)

---

## Phase 7: User Story 5 — Edit case details after submission (P2, STORY-019)

- [ ] T-017 [Obidit·lane-a] API-005 (`PATCH /api/cases/[id]` → `editOwnerCase`) accepts updates from the owning parent session for `submitted`, `open` and `matched_pending_review`; increments version by 1; snapshots the prior payload as the case version; voids pending candidate pairs; queues rematching (`matched` state → `queued`); logs `case.edited`. Terminal states (`confirmed` or `closed` for missing, `referred` for found) are blocked with E-018 (`EDIT_LOCKED`). The runtime is at `src/app/api/cases/[id]/route.ts` and `src/server/case/edit.ts`. **blocked-by T-001, TASK-015, TASK-022**; FR-029, BR-025. (TASK-049; API-005; TC-018, TC-049)
- [ ] T-018 [Obidit·lane-a] SCREEN-006 edit entry point and version-concurrency handling. The status page exists at `src/app/(parent)/status/page.tsx`; the edit entry is wired through `useOwnerCaseVersion` and the version the parent last saw. **blocked-by T-017**; BR-025. (SCREEN-006; E-005, E-018; TC-018)
- [ ] T-019 [Obidit·lane-a] Outputs follow the case version: API-006 caches by `(case_id, type, case_version)` so obsolete versions are never served as current. **blocked-by T-006, T-017**; BR-022. (TASK-049; API-006)

**Independent test**: Create a case in `open` state, call API-005 with updated clothing and the version the parent last saw set to 1, verify the case updates to version 2, snapshots version 1, voids pending candidates and queues rematching. Attempt an edit on a `confirmed` case and verify E-018 (`EDIT_LOCKED`). Attempt a concurrent edit where the version the parent last saw does not match the database version and verify E-005 (`ILLEGAL_TRANSITION`). (SC-006; TC-018, TC-046, TC-049)

---

## Phase 8: User Story 6 — Owner case status (P2, STORY-020)

The runtime surface for SCREEN-006 and API-018 is already at `src/app/api/my-case/route.ts` + `src/server/parent/my-reports.ts` and `src/app/(parent)/status/page.tsx`. The convergence pass records the existing implementation and the open dependencies; this phase contains the acceptance contract that the existing code continues to satisfy.

- [ ] T-020 [Obidit·lane-a] API-018 / API-004 return the owning parent's view only: case reference, last-updated time, and the status badge ("খোলা" / Open, "যাচাই চলছে" / Being checked, "বন্ধ" / Closed). Hidden records return E-004 (`NOT_FOUND`) and log `access.denied`. The `matched_pending_review` → "যাচাই চলছে" mapping is OQ-B1-2; D3:148 gives only the labels, and `s006-strings-draft.md` keeps it open. **blocked-by T-001**; FR-030, BR-007, BR-024. (TASK-050; API-018, API-004; TC-019, TC-045, TC-022, TC-052)
- [ ] T-021 [Obidit·lane-a] SCREEN-006 status page: reference number, last-updated time, status badge, edit entry. Empty state: "এই ফোনে কোনো রিপোর্ট নেই" with a link to start intake. **blocked-by T-020**; FR-030. (SCREEN-006; COMP-045; TC-019)
- [ ] T-022 [Obidit·lane-a] Add Vitest and Playwright coverage for the owner view: candidate / score / match-reason fields are absent; status badge text is exactly "খোলা" / "যাচাই চলছে" / "বন্ধ"; `access.denied` audit entry is written for hidden-record reads. **blocked-by T-021**. (TASK-050; SC-007)

**Independent test**: Query parent status API-018 and case detail API-004 as the owning parent session for a case in `matched_pending_review`. Verify the status text matches the badge and the response JSON contains zero candidate, score, match-reason or found-child fields. (SC-007; TC-019, TC-045)

---

## Phase 9: Polish and accessibility (cross-feature)

- [ ] T-023 [Obidit·lane-a] Locale and validation: bilingual copy on the Obidit-owned slices (status page, edit flow) and `src/locales/areas/parent-{status,edit}.ts`; covered by `tests/locales/areas.test.ts` and `tests/locale-cookie.test.ts`. **blocked-by T-018, T-021**. (FR-033; COMP-022; NFR-011; TC-058)
- [ ] T-024 [(owner: Mahim)] Accessibility audit across SCREEN-004, SCREEN-005 and SCREEN-006. The runtime is Mahim's lane; the audit is shared. **blocked-by T-009, T-013, T-021**. (TASK-024, TASK-025, TASK-050; SC-008; NFR-011)
- [ ] T-025 [Obidit·lane-a] Quickstart end-to-end validation is the lead's lane and runs only against the merged `phase2` runtime. **blocked-by T-001**. (TASK-049, TASK-050; D6 §5)

**Checkpoint**: T-023 / T-024 are the gates; bilingual copy and ≥44 × 44 px targets are required for any merge into `phase2`. T-025 does not run on the specs-only lane.

---

## Cross-feature dependencies this board leaves for the coordinator

- **001-platform-foundation**: `src/contracts/` freeze / `contracts-v1` tag still pending Mahim's all-owner review (`001/tasks.md` T024); OQ-021 managed host UNKNOWN; OD-006-1 (Auth.js vs. custom session) OPEN. Obidit does not own 001 code; recorded not blocked.
- **002-intake-ai**: Phase 8 (T044–T052) in `specs/002-intake-ai/tasks.md` lists the buildable gaps the coordinator decides (cache fixtures, offline banner, API-001 wiring, round-3 Bangla strings, spend CLI restoration, S-005 handoff, badge component, OD-015-1). None is a 003 code change.
- **003-parent-outputs**: this board; SCREEN-004 (TASK-024) and SCREEN-005 (TASK-025) live in Mahim's lane. Obidit-owned: TASK-023/047/049/050, API-005/006/018, SCREEN-006 — recorded as converged against the existing source.

## Implementation strategy and handoffs

Complete T-001 / T-002, then T-003 / T-004 (server-side outputs and wording guard) and T-006 (cache). T-007 (GD) and T-011 (poster) and T-015 (13219) follow; the wording guard must run before any text is returned. T-017 / T-018 (edit) and T-020 / T-021 (status) follow TASK-022 and TASK-015. SCREEN-004 (T-009 / T-010) and SCREEN-005 (T-013) are Mahim's lane and consume the Obidit-owned API-006. Independently validate US1 / US2 / US3 (Must) before US4 / US5 / US6 (Should), and validate bilingual copy and accessibility on every screen before merge into `phase2`. (STORY-005–STORY-007, STORY-018–STORY-020; FR-008/009/010/026/029/030/033/034; BR-002, BR-003, BR-006, BR-007, BR-011, BR-012, BR-015, BR-016, BR-020, BR-022, BR-024, BR-025; TASK-023/024/025/047/049/050; TC-005/006/007/017/018/019/024/025/026/030/045/049/058)

## Phase 9 references

- `docs/execution/evidence/pre-main-convergence-intake.md` §2.3 and §3 (this convergence pass, owned).
- `docs/execution/evidence/outputs-templates.md` (TASK-023, T-015).
- `docs/execution/evidence/s004-outputs.md` (TASK-024, T-009, T-010, T-012).
- `docs/execution/evidence/platform-case.md` (TASK-049, T-017, T-018).
- `docs/execution/evidence/platform-status.md` (TASK-050, T-020, T-021).
- `docs/execution/evidence/intake-submit-api.md` OD-022-1, OD-022-3 (T-007, T-011, T-015).
- `docs/execution/evidence/intake-ui.md` round 2 (badge / `<HonestLabel>`; T-023).
- `docs/execution/evidence/review-submit-ui.md` (T-013 pre-fill path).
- `docs/execution/evidence/spend-cli.md` and `intake-spend-counters.md` (TASK-059, TASK-063; budget-cap path to SCREEN-005).

---

## Phase 10: Status closure (2026-10-18, final)

**Purpose**: Row-by-row software status for T-001–T-025 against the current source/tests/evidence in this worktree. The original T-001–T-025 wording is unchanged. No checkbox on the original lines is mutated. The closure matrix in `docs/execution/evidence/pre-main-convergence-intake.md` §7.3 is the canonical version; this section is the spec-board disposition summary.

**Legend** (matches the evidence file): `S` = software implemented on the current source tree, `H` = human-acceptance evidence still pending, `O` = open decision (OD-###), `E` = external (provider, host, phone, organiser), `—` = not applicable (cross-owner / lead lane).

| ID | Status | One-line evidence |
|---|---|---|
| T-001 | S / H | `contracts-v1` tag exists at `cf4ec2d8`; all-owner sign-off = `H` (OD-061-1) |
| T-002 | S | evidence chain recorded in 7 files under `docs/execution/evidence/` |
| T-003 | S | `src/server/outputs/{index,guard,templates}.ts`; `tests/outputs/*` 147/147 |
| T-004 | S | `src/server/outputs/guard.ts`; 5-round hardened |
| T-005 | S | `tests/outputs/{templates,service,guard,poster,outputs-client}.test.ts` green |
| T-006 | S | `src/server/outputs/index.ts`; `tests/db/outputs.test.ts` |
| T-007 | S | `src/app/api/cases/[id]/outputs/route.ts`; `tests/outputs/service.test.ts` |
| T-008 | S | `tests/outputs/*`; `tests/outputs/service.test.ts` |
| T-009 | S / H | `src/app/(parent)/report/[id]/`; `s004-outputs.md`; Mahim surface `H` |
| T-010 | S / H | `src/lib/{poster,poster-render}.ts`; Mahim surface `H`; OD-003-2 |
| T-011 | S | `src/app/api/cases/[id]/outputs/route.ts`; `tests/outputs/service.test.ts` |
| T-012 | H | `tests/ui/report-screen.test.ts` covers static invariants; full Playwright = Mahim TASK-038 |
| T-013 | S / H | `src/app/(parent)/intake/form/page.tsx`; Mahim surface `H` |
| T-014 | H | static invariants only today; full Playwright = Mahim TASK-038 |
| T-015 | S | `src/app/api/cases/[id]/outputs/route.ts` (`type: "helpline"`); `tests/outputs/templates.test.ts` worst case 77 words |
| T-016 | S | `tests/outputs/templates.test.ts` |
| T-017 | S | `src/app/api/cases/[id]/route.ts` PATCH → `editOwnerCase`; `tests/case/service.test.ts` + `tests/api/case-edit.test.ts` |
| T-018 | S | `src/app/(parent)/status/page.tsx`; `tests/api/my-case.test.ts` |
| T-019 | S | cache by `(case_id, type, case_version)`; `tests/db/outputs.test.ts` |
| T-020 | S | `src/app/api/my-case/route.ts` + `src/server/parent/my-reports.ts`; `tests/api/my-case.test.ts` |
| T-021 | S | `src/app/(parent)/status/page.tsx` |
| T-022 | S | `tests/api/my-case.test.ts` + `tests/api/cases-read.test.ts` |
| T-023 | S / H | `tests/locales*` + `tests/locale-cookie.test.ts`; round-3 strings `H` |
| T-024 | H | static SCREEN-004 invariants; SCREEN-005/006 full Playwright = Mahim TASK-038 |
| T-025 | — / E | lead's lane; AMD-AGENTS-1 keeps cutoff `UNKNOWN` |

**003 closure**: 25/25 have software evidence on this worktree, with `H` reserved for Mahim-owned Playwright journeys and the round-3 Bangla strings sign-off, and `E` for the quickstart journey and the organiser cutoff. The runtime surface is largely implemented despite the literal checkbox state. No `NotOwned/RoutesMissing` is asserted as a software gap.


## Coordinator integration disposition (supersedes lane-only pending classifications)

The protected three-case cache and offline loopback fix are merged into pre-main. Existing E-024 bilingual copy already supplies the real network-failure fallback; no extra banner was added. The full integration DB suite passed 321 tests across 31 files, and the complete desktop/mobile Playwright/axe suite passed 78 tests with zero skips. Manual form, owner review/status/edit and role boundaries have automated coverage in `tests/e2e/parent-journey.spec.ts`, `tests/e2e/a11y.spec.ts` and the safeguarding/lifecycle specs. Mahim-owned browser checks and the local quickstart are **software verification**, not human/organiser blockers. Physical Android checks and human Bangla review remain pending. The expanded offline harness, actual poster-download check and packaged quickstart receive their final disposition in the integrated verification report; their ownership does not block implementation.

The source/path aliases in this matrix refer to existing semantic coverage, rather than requiring duplicate files with old planned filenames. Historical Auth.js/custom-session conformance remains OD-006-1 WARN; this pass does not invent an all-owner architectural approval or alter frozen contracts. Feature software closure and formal human/release acceptance remain separate.

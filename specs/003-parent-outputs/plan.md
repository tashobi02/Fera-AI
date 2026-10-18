# Implementation Plan: Parent outputs, manual form fallback, and post-submission lifecycle

**Branch**: `phase2--obidit-spec003` | **Date**: 2026-10-18 (Asia/Dhaka) | **Spec**: [spec.md](spec.md) | **Owner**: Obidit (intake/outputs backend, templates, wording guard, APIs, post-submit edit/status) + Mahim (S-004 outputs UI + poster PNG, S-005 manual form UI; D6 owner S (Sadman))

**Input**: Feature 003 brief in `docs/agents/SPECKIT_PROMPTS.md` and the V2 spec pack (`docs/spec/`). This plan is a **recovered** design artifact: feature 003 had no `plan.md` and no `tasks.md` at the start of the 2026-10-18 pre-main convergence pass, so the board is authored from the existing source (`src/server/outputs/`, `src/app/api/cases/[id]/route.ts` PATCH, `src/app/api/my-case/route.ts`, `src/app/(parent)/status/page.tsx`, `src/app/(parent)/report/[id]/`, `src/app/(parent)/intake/form/page.tsx`) and from the per-feature evidence already in `docs/execution/evidence/{outputs-templates,s004-outputs,spend-cli,intake-spend-counters,intake-submit-api,intake-ui,review-submit-ui}.md`. The V2 spec pack, the constitution and any existing source/test file are untouched. (`AGENTS.md` ownership; `.specify/templates/plan-template.md`; `.agents/skills/speckit-converge/SKILL.md`)

> **Lane guard (2026-10-18)**: The recovery is artifact-only. The 003 spec board is created, not implemented. `check-prerequisites.sh` halts on `plan.md not found`; converge explicitly records that it could not run for 003 against the spec board and proceeds to author the missing boards per the brief.

## Summary

Cover post-submission parent outputs and lifecycle actions for synthetic missing-child cases: deterministic Bangla GD draft generation, shareable no-photo text poster with privacy controls and 1080×1350 px PNG download, concise 13219 helpline summary (≤ 80 words), wording guard enforcement against alert/runaway/rescue/legal claims, SCREEN-004 outputs interface (owner: Mahim), SCREEN-005 accessible manual form fallback (owner: Mahim) when AI fails or budget caps are reached, SCREEN-006 post-submission versioned case edits (API-005), and owner-scoped case status tracking (API-018). Output generation is server-side, deterministic, and zero-provider: API-006 reads confirmed case fields, runs them through the fixed templates, applies COMP-016, and stores a deterministic text per `(case_id, type, case_version)`. The poster PNG and the manual form are Mahim's surfaces; the backend API, the wording guard and the versioned edit/status APIs are Obidit's. (STORY-005–STORY-007, STORY-018–STORY-020; SCREEN-004–SCREEN-006; FR-008–FR-010, FR-026, FR-029–FR-031, FR-034; BR-002, BR-003, BR-006, BR-007, BR-011, BR-012, BR-015, BR-016, BR-020, BR-022, BR-024, BR-025; TASK-023, TASK-024, TASK-025, TASK-047, TASK-049, TASK-050; TC-005–TC-007, TC-017–TC-019, TC-024–TC-026, TC-030, TC-045, TC-049)

## Technical Context

| Item | Current implementation |
|---|---|
| Output templates | `src/server/outputs/{index,gd,poster,helpline,guard,types}.ts` plus the wording-guard (COMP-016) module; deterministic string build from confirmed case fields. (TASK-023; `docs/execution/evidence/outputs-templates.md`) |
| Wording guard | `src/server/outputs/guard.ts` and the banned-term set in `src/server/outputs/guard-banned.ts`; `OUTPUT_BLOCKED` returned as E-016 on any banned token. (COMP-016; PR #15 on branch `phase2--obidit-templates`) |
| API-006 route | `src/app/api/cases/[id]/outputs/route.ts` POST accepts `type: "gd" | "poster" | "helpline"`; idempotent cache by `(case_id, type, case_version)`; outputs_available is `[]` on POST API-003 (`intake-submit-api.md` OD-022-3), S-004 fetches on tap. |
| Helpline summary | API-006 `type: "helpline"`; worst-case 77 words at the 80-word limit; covered by `tests/outputs/templates.test.ts`. (TASK-047; `outputs-templates.md`) |
| Edit-after-submit | `src/app/api/cases/[id]/route.ts` PATCH → `editOwnerCase` (API-005); terminal states (`confirmed`, `closed` for missing; `referred` for found) rejected with E-018 (`EDIT_LOCKED`); `tests/api/cases-edit.test.ts` plus `tests/case/edit.test.ts` cover the path. (TASK-049; `docs/execution/evidence/platform-case.md`) |
| Parent status | `src/app/api/my-case/route.ts` + `src/server/parent/my-reports.ts`; SCREEN-006 status page at `src/app/(parent)/status/page.tsx`; covered by `tests/api/my-case.test.ts`. (TASK-050; `docs/execution/evidence/platform-status.md`) |
| SCREEN-004 outputs | Owner: Mahim. Live at `src/app/(parent)/report/[id]/`; poster PNG at 1080×1350 px on white background; share acknowledgement dialog ("প্রকাশের আগে নম্বর ও স্থানের তথ্য দেখুন…"); covered by `docs/execution/evidence/s004-outputs.md`. (TASK-024; COMP-030, COMP-031) |
| SCREEN-005 manual form | Owner: Mahim. Live at `src/app/(parent)/intake/form/page.tsx`; opens in ≤ 2 s on E-012/E-013/E-014/E-023 or ACT-014; pre-fills existing draft fields; 64-district searchable selector; Bangla numerals; navigate to SCREEN-003 on submit. (TASK-025; COMP-032) |
| Storage boundary | PostgreSQL 16 + pgvector from feature 001; the `cases` table owns versions, the `case_versions` table snapshots prior payloads, the `generated_outputs` table caches deterministic texts. (D2 Part A §6.1, §6.2) |
| Auth and contracts | The anonymous parent principal from `src/server/auth/session.ts` (the divergence from D6 baseline Auth.js is OD-006-1, recorded); `src/contracts/` must be frozen as `contracts-v1` (T024) before further contract changes. (BR-007, BR-024) |
| Test framework | Vitest unit for templates/guard/edit/status; Playwright acceptance for SCREEN-004 (Mahim) and SCREEN-006. Existing `tests/outputs/`, `tests/case/`, `tests/api/`, `tests/intake-ui/`, `tests/audit/` cover the slice. |
| Performance targets | No pack target for output generation (TASK-023, `outputs-templates.md`); 80-word helpline cap is enforced at template build time; the poster PNG is Mahim's lane and its render budget is OD-003-2. |
| Limits | Outputs are deterministic and idempotent; cache key is `(case_id, type, case_version)`; obsolete versions are never served as current; wording guard returns E-016 on any banned term. (BR-022; FR-034) |
| Visual and accessibility rules | D3 SCREEN-004/005/006 and D4 interaction rules; Bangla default, English toggle, Bangla numerals, ≥44 × 44 px targets, 320 CSS px reflow, focus management. (FR-033; COMP-022; NFR-011) |
| Scale | Synthetic missing-child records only. No real data, photos, facial search, alert broadcasts, police-system integration or legal compliance. (FR-024/026/027; BR-026) |

## Constitution Check

The constitution is a read-only draft. The V2 pack resolves wording differences. These checks assess this plan only; runtime compliance still needs evidence. (AGENTS.md; `.specify/memory/constitution.md`)

| Principle | Design check before research | Post-design check |
|---|---|---|
| I. Review before submit | Outputs are generated from confirmed case fields only; the visible "খসড়া" label prevents readers from treating drafts as filed. Circumstances text is never copied into outputs. (BR-002, BR-022; FR-034) | Server half of TASK-023 merged in `phase2`; cache by `(case_id, type, case_version)`; wording guard returns E-016 on any banned token. (`outputs-templates.md`) |
| II. AI assists, unknown remains unknown | Output generation is pure template; no AI call is made for outputs. (FR-008/009/010; BR-008) | `src/server/outputs/{gd,poster,helpline}.ts` are pure string builders; `tests/outputs/templates.test.ts` covers the deterministic text path. |
| III. Role visibility | API-006 and API-005 use the parent session; SCREEN-006 / API-018 return the owner view; hidden records return E-004 (`NOT_FOUND`) and log `access.denied`. (BR-007, BR-024) | `src/server/case/edit.ts` enforces owner check; `src/server/parent/my-reports.ts` filters by session; covered by `tests/case/edit.test.ts` and `tests/api/my-case.test.ts`. |
| IV. Lifecycle | Edit after submit is allowed only in `submitted`/`open`/`matched_pending_review`; terminal states are blocked with E-018; prior version is snapshotted; pending candidates are voided. (BR-012, BR-020, BR-025; FR-029) | `editOwnerCase` in `src/server/case/edit.ts`; pending candidate void + `queued` rematch on edit; covered by `tests/case/edit.test.ts`. |
| V. Audit and logs | Per-output generation, wording-guard violation and edit event are logged without child payload. (BR-009; NFR-010) | `src/server/audit/log.ts` and `src/server/outputs/index.ts` log only `case_id`, `type`, `case_version`, `guard_id` and timestamps. |
| VI. Honest labels | Outputs carry the "খসড়া" label; the share acknowledgement dialog names the unrecallable-download cost; cached/synthetic/MOCK badges are explicit. (BR-022, BR-026; FR-032) | SCREEN-004 share dialog and "খসড়া" footer are in the template strings; badges via `<HonestLabel>` (`intake-ui.md` round 2). |
| VII. Synthetic only | Synthetic missing-child records only; no real personal data, photo, exact coordinate, or scraped page. (FR-024/026/027; BR-026) | All existing tests use synthetic fixtures; `docs/execution/evidence/spend-cli.md` and the cache fixtures (`src/server/cache/fixtures.ts`) are synthetic and labelled. |

**Gate result**: No design-level violation identified. This does not pass G1 or establish implementation compliance; the constitution remains unratified. (AMD-1-1; G1)

## Project Structure

Documentation: `spec.md` and this `plan.md` in `specs/003-parent-outputs/`. `tasks.md` is generated in this pass to recover the board; the V2 spec pack, the constitution and any existing source/test file are untouched.

Existing runtime paths (none created by this plan; recorded for traceability):

| Path | Purpose / D6 owner |
|---|---|
| `src/server/outputs/` | TASK-023 templates + COMP-016 wording guard, Obidit |
| `src/app/api/cases/[id]/outputs/route.ts` | API-006 GD/poster/helpline, Obidit |
| `src/app/api/cases/[id]/route.ts` (PATCH) | API-005 edit after submit, Obidit |
| `src/app/api/my-case/route.ts` + `src/server/parent/my-reports.ts` | API-018 parent status, Obidit |
| `src/app/(parent)/status/page.tsx` | SCREEN-006 status page, Obidit |
| `src/app/(parent)/report/[id]/` | SCREEN-004 outputs UI + poster PNG, Mahim (TASK-024) |
| `src/app/(parent)/intake/form/page.tsx` | SCREEN-005 manual form fallback, Mahim (TASK-025) |
| `tests/outputs/`, `tests/case/`, `tests/api/`, `tests/intake-ui/`, `tests/audit/` | Existing Vitest/Playwright coverage for the slice |

Feature 001 supplies the typed contract boundary (`src/contracts/`) and the case service (`src/server/case/`). Feature 002 supplies the parent session and the manual-fallback signal path (E-012/E-013/E-014/E-023 → SCREEN-005). The matching implementation belongs to feature 004 and waits for TASK-064's frozen manifest; no matcher, embedding, scoring or threshold work is part of this board.

## Build order and handoffs

1. `src/contracts/` freeze and `contracts-v1` tag (TASK-061) precede any further API/role change. T024 in `001/tasks.md` records the open dependency; 002 and 003 both block on it. (`AGENTS.md`; `docs/agents/handoff/OBIDIT.md`; OD-006-1 still OPEN)
2. TASK-023 (`src/server/outputs/`) unblocks Mahim's TASK-024 (SCREEN-004 UI + poster PNG) and feeds the cache key path; the wording guard runs server-side before any text is returned. (TASK-023 → TASK-024; BR-022)
3. Review/submit TASK-022 (feature 002) feeds the editable-state list into TASK-049 (`src/server/case/edit.ts`); the same path produces the manual-fallback signal to TASK-025 (SCREEN-005). (TASK-022 → TASK-049, TASK-025)
4. TASK-047 (13219 summary) follows TASK-023 and shares the same template-cache path. (TASK-023 → TASK-047)
5. TASK-050 (parent status API-018) follows TASK-049; SCREEN-006 consumes the same owner view. (TASK-049 → TASK-050; SC-007)
6. Test-first work targets templates/guard/edit/status unit cases first, then API route tests, then the Playwright acceptance for SCREEN-004 (Mahim) and SCREEN-006; no UI in this specs-only phase. (TASK-023/024/025/047/049/050; TC-005/006/007/017/018/019/024/025/026/030/045/049)

**Lane decision (recovered)**: D6 §5 assigns TASK-023/047/049/050 to Obidit and TASK-024/025 to Mahim (D6 owner S (Sadman), labelled Mahim per AGENTS.md:34). Obidit writes the 003 backend, wording guard, edit/status APIs and SCREEN-006; Mahim writes SCREEN-004 and SCREEN-005. The plan records that split. (AGENTS.md; D6 §5)

## Complexity Tracking

No justified constitution exception is proposed. Operational unknowns (OQ-016 online GD field list, OD-003-2 poster PNG render boundary, OD-003-3 multi-report UI, OD-003-4 retention, OD-003-5 E-019 mapping, OD-006-1 session, OD-022-1 draft_token signer, OD-022-3 outputs_available on POST API-003, OD-023-1 poster contact default, OD-023-2 locked-report outputs) are dependencies, not design exemptions. (AMD-1-1; OQ-016; OD-003-1..5; OD-006-1; OD-015-1; OD-022-1; OD-022-3; OD-023-1; OD-023-2; OQ-021)

## Phase N: Convergence note (2026-10-18)

The `tasks.md` for this feature is recovered in the same pass; the convergence append is empty for 003 because every owned item is already covered by the existing source, the per-feature evidence, and the recovered `tasks.md`. The cross-feature dependencies on `001/tasks.md` T024–T027 and the open decisions in `002/tasks.md` Phase 8 (T044–T052) are recorded in the evidence file `docs/execution/evidence/pre-main-convergence-intake.md` and are the coordinator's queue, not Obidit code changes.

## Phase 8 references

- `docs/execution/evidence/pre-main-convergence-intake.md` §2.3 and §3 (this convergence pass, owned).
- `docs/execution/evidence/outputs-templates.md` (TASK-023).
- `docs/execution/evidence/s004-outputs.md` (TASK-024, owner: Mahim).
- `docs/execution/evidence/platform-case.md` (TASK-049, edit).
- `docs/execution/evidence/platform-status.md` (TASK-050, status).
- `docs/execution/evidence/intake-submit-api.md` OD-022-1, OD-022-3.
- `docs/execution/evidence/intake-ui.md` round 2 (badge / `<HonestLabel>`).

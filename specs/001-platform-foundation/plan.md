# Implementation Plan: Platform foundation

**Branch**: `phase1-specs--lane-a` | **Date**: 2026-10-13 (Asia/Dhaka) | **Spec**: [spec.md](spec.md)

**Input**: Feature 001 specify and clarify artifacts, the exact 001 plan brief in `docs/agents/SPECKIT_PROMPTS.md`, and the V2 pack. This is a design plan; no runtime code, database, CI run or device check is claimed.

## Summary

Build the shared Fera platform so a reporter can confirm a synthetic report, role-scoped users can read only their allowed fields, and an active verified officer can record a decision, simulated referral and coordination closure atomically. The shell supplies Bangla/English navigation and D3 sign-in/not-found states. The fixed stack is Next.js App Router, strict TypeScript, Zod, PostgreSQL 16 plus pgvector through `pg` and hand-written SQL, Auth.js credentials, Vitest and Playwright. Runtime contracts derive from D2 Part A/D5 and the supplied type companion; they freeze only after a reviewed, merged implementation. (TASK-001/002/006/007/008/015/031/061/062; BR-004/007/010/012/013/020/024)

## Technical Context

| Concern | V2 plan and source |
|---|---|
| Language / version | TypeScript strict under Next.js App Router; exact package versions are UNKNOWN until TASK-001 locks them. (AGENTS.md; D2 Part A §2; TASK-001) |
| Primary dependencies | Tailwind, Zod, `pg`, Auth.js credentials, Vitest, Playwright with axe, pino redaction. No ORM. These are planned dependencies, not installed in this worktree. (AGENTS.md; D2 Part A §2; D2 Part B §10) |
| Storage | Fresh synthetic PostgreSQL 16 with pgvector >=0.8.1; planned `db/schema_v2.sql` must be byte-identical to `docs/code/schema_v2.sql`. Local and managed host application is blocked by TASK-001; host choice OQ-021 is UNKNOWN. (D2 Part A §7/7.1; TASK-002; TC-062) |
| Tests | Vitest contract/state/role checks and Playwright role/flow checks. Planned commands are currently fail-fast stubs; no application result is claimed. (D6 §8; TASK-001/037/038) |
| Target platform | Responsive web: mid-range Android for parents/staff and desktop officer/admin; Vercel for Round 2 and one laptop backend for finale are planned. Exact managed DB host is UNKNOWN. (D2 Part B §15; NFR-013; OQ-021) |
| Performance | Non-AI API p95 <=500 ms, parent first load LCP <=3 s and route JS <=170 KB gzip, measured only once runtime exists. (D2 Part B §12.1; NFR-001) |
| Scale | All 64 districts; roughly 200 synthetic records for demo and a data model supporting 30,000 cases/year without change. These are source targets, not observed capacity. (BR-014; NFR-015; D6 TASK-009/010) |
| Constraints | Synthetic only; no photos, faces, documents, exact coordinates, alerts, rescue or police integration; pre-submit metadata only; role DTO allowlists; append-only safe audit; atomic officer confirm; bilingual errors; no secrets in files, logs or committed artifacts. (Constitution I–VII; BR-004/006/007/010/020/026) |

## Constitution Check

The design has no identified conflict with the draft constitution. This is a **design check**, not a G1 pass or application verification. The constitution remains unratified at G0, but its principles govern this plan.

| Principle | Planned control | Implementation evidence |
|---|---|---|
| I Review before submit | API-003 accepts reviewed confirmation and scoped UUID; device draft remains local; server draft is metadata only. (BR-004/023; TC-004/060) | Pending TASK-015/022/061/062 |
| II AI ranks; people decide | Only active verified officer may decide. Unknowns remain unknown; matching never confirms. (BR-001/008/017/018; TC-023/046) | Pending TASK-006/015/017/028 |
| III Least visibility | Zod input, role guard, explicit per-role DTO, error envelope; hidden equals absent and denied access is audited. (BR-007/024; TC-022/044/052) | Pending TASK-007/061/015 |
| IV Lifecycle integrity | State guard plus one confirmation transaction with sorted UUID locks, live version checks, competitor invalidation, both states, referral and audit. (BR-012/013/020; TC-029/032/046/053) | Pending TASK-002/015/062 |
| V Append-only safe audit | Same-transaction audit for successful actions; denied access after rollback recorded separately; no child payload in logs. (BR-010; TC-016/028/051/052) | Pending TASK-015/062 |
| VI Honest labels | UI/DTOs say similarity and referral recorded (simulation); synthetic, [MOCK] and cached labels remain visible. (BR-002/003/005/011/026) | Pending TASK-008/028/035 |
| VII Synthetic only | Runtime and seed paths reject real records and image/exact-coordinate fields; evaluation fixtures excluded from quality metrics. (BR-006/026; TC-026/056) | Pending TASK-002/019/038/039 |

## Project Structure

### Documentation created in this specs-only lane

```text
specs/001-platform-foundation/
├── spec.md
├── checklists/requirements.md
├── clarification-review.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/platform-contract.md
└── quickstart.md
```

`tasks.md` belongs to the next stage, after Pause B. No runtime source tree is created by this plan.

### Planned runtime paths, absent until dependencies permit implementation

```text
db/schema_v2.sql                         # exact copy of docs/code/schema_v2.sql
src/contracts/                           # Mahim, shared DTOs/Zod/state/error projections
src/server/db/                            # Mahim, parameterised pg and runtime role
src/server/auth/                          # Mahim, Auth.js and parent session guard
src/server/case/                          # Mahim, typed case commands and transaction
src/server/audit/                         # Mahim, append-only safe events
src/app/(auth)/                            # Mahim, SCREEN-008 and SCREEN-016
src/app/                                   # Mahim, common shell and COMP-022
src/app/api/                               # matching server-module owner by route
tests/                                    # contract/unit and later end-to-end checks
.github/                                  # Mahim, CI on main
```

**Structure Decision**: Use the ownership map in AGENTS.md and D6 §5. `src/contracts/` is the sole shared runtime contract surface; feature lanes consume its role-scoped examples without returning raw case rows. The planned schema copy is exact, not an in-place migration. (TASK-002/061/062; D2 Part A §5.4/7.1)

## Phase 0: Research decisions

[research.md](research.md) records the fixed source-backed choices and the unresolved OQ-021 host decision. It does not infer actual accounts, credentials, provider prices, deployment state or acceptance results. No external service research or paid call is needed to write this plan.

## Phase 1: Domain and interfaces

- [data-model.md](data-model.md) maps ENTITY-001–007/009/010/014/015–017 to role, ownership, state, idempotency, audit and count rules. The exact SQL companion remains authoritative for column/check details. (BR-004/007/010/012–016/020/023–025)
- [contracts/platform-contract.md](contracts/platform-contract.md) defines planned service commands `createMissing`, `createFound`, `open`, `transition`, `editWithVersion`, `confirmPair` and `close`, plus role DTO boundaries and error behaviour. It does not create or freeze `src/contracts/`. (COMP-014/015; TASK-061; D2 Part A §5)
- [quickstart.md](quickstart.md) is a validation guide with dependency gates, future commands and expected outcomes. Every unimplemented command is labelled pending, and no database reset or paid provider call is authorised by it.

## Build order and dependency gates

| Order | D6 dependency | Required evidence before completion |
|---|---|---|
| 1 | TASK-001 | App scaffold, strict build/check scripts, green CI on main and preview URL. Currently `todo` in Phase 0. |
| 2 | TASK-002 after TASK-001 | Host decision OQ-021; fresh local and host schema application; HNSW evidence. Currently blocked. |
| 3 | TASK-007, TASK-008 and TASK-061 after TASK-001 | Shared API envelope, shell, runtime contracts/examples; TASK-008 needs Android Bangla rendering. TASK-061 freeze waits for reviewed merge/tag. |
| 4 | TASK-006 after TASK-002; TASK-062 after TASK-002 and TASK-061 | Role checks, restricted runtime grants, state/redaction checks on PostgreSQL 16. |
| 5 | TASK-015 after TASK-007/061/062; TASK-031 after TASK-006 | Case commands, transaction/audit acceptance, then sign-in and hidden-record screens. |

No row becomes done from a spec, mock response, portable database check or planned command. UI lanes may prepare against typed fakes, but integrated dependency evidence remains required. (D6 §5; AMD-1-1/1-2)

## Visual and copy rules for TASK-008/031

Use `DESIGN.md` for visual tokens, its Fera overrides for Paper parent/Cockpit desk themes, and D4 for behaviour. The common header has COMP-022 Bangla/English toggle; parent default is Bangla with Bangla numerals. Self-host Inter, JetBrains Mono and Noto Sans Bengali with licences. SCREEN-008/016 use D3 copy and focus behaviour. Status is icon + text + colour; labels for synthetic, [MOCK], cached and simulation are visible. The final Android glyph check is human-only and remains pending. (FR-033; COMP-022/045/047; NFR-011; TASK-008/031)

## Post-design Constitution Check

The proposed data model, interfaces and validation guide preserve all seven principles above. No design exception or constitution amendment is requested. Runtime verification, G0 dependencies, human phone check, contract merge/tag and G1 report remain pending; no principle is marked implemented by this design document.

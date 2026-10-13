# Phase 1 — Specs and frozen contracts · Gate G1

**Window:** Mon 12 Oct 2026, 18:00 → 23:00 (Asia/Dhaka) · **Gate:** G1 · **Plan:** [EXECUTION_PLAN.md](EXECUTION_PLAN.md#phase-1--specs-and-frozen-contracts-mon-12-oct-1800--2300--gate-g1) · **Prev:** [Phase 0](PHASE_0_BOOTSTRAP.md) · **Next:** [Phase 2](PHASE_2_MUST_CORE.md)
**Phase status:** `todo`
**Last updated:** 2026-10-13 · tasks distributed among Obidit, Masnun and Mahim; lead = Obidit
**Team:** **Obidit** — lead; intake, AI, outputs · **Masnun** — data, matching, officer workflow, dashboard, evaluation · **Mahim** — platform, integration, release (named "Sadman" in AGENTS.md and the spec pack; D6 owner code S). Tasks follow [EXECUTION_PLAN.md](EXECUTION_PLAN.md). The lead approves cuts and reschedules, records organiser and mentor decisions, and runs `fera-gate`.

---

## How to work this file (Claude Code · Codex · Antigravity)

This is a living tracker. Every agent working on a task in this phase updates it **in the same branch as the work**.

1. Read [AGENTS.md](../../AGENTS.md), then this file, then the spec-pack sections named in your row. All times are Asia/Dhaka.
2. Pick a `todo` row in your owner's lane whose dependencies are `done`. Set it to `doing` and fill in the lane and tool.
3. Work in a lane worktree (`scripts/agents/new-lane.sh <feature> <lane>`) and stay inside the owner's paths ([ownership map](../../AGENTS.md#repo-layout-and-ownership)).
4. When you open the PR, set the row to `review` with the PR link. After the merge, set it to `done` and fill in **Evidence**: the command and its result, a URL or a file path. A task without evidence is not done.
5. If you are stuck, set the row to `blocked`, say what blocks it in Evidence, and add a log line.
6. Edit only the rows in **your own person table** and **your log section**, so parallel lanes don't conflict. Never tick a gate box yourself. Gate boxes are ticked from the `fera-gate` report in [docs/gates/](../gates/).

**Status values:** `todo` · `doing` · `review` · `done` · `blocked` · `cut`. Use `cut` only with approval from the lead (Obidit) and in the [D6 §11](../spec/D6_Implementation_Plan_V2.md#11-recommendation) cut order. Never cut review-before-submit, officer confirm, referral, audit or redaction.

| Action | Claude Code | Codex | Antigravity / any other agent |
|---|---|---|---|
| Spec-kit stage | `/speckit-<stage>` | `$speckit-<stage>` | Open `.agents/skills/speckit-<stage>/SKILL.md` and follow it step by step |
| Skill (`fera-review`, `fera-gate`, `verification-loop`, `impeccable`, …) | `/<skill>` | `$<skill>` | Read `.agents/skills/<skill>/SKILL.md` and follow it |
| Reviewer (`fera-safeguarding-reviewer`, `database-reviewer`, …) | Subagent from `.claude/agents/<name>.md` | Role from `.codex/agents/<name>.toml` | Start a separate read-only agent and give it `.claude/agents/<name>.md` as its brief |

---

## Spec-kit boards
Exact briefs: [docs/agents/SPECKIT_PROMPTS.md](../agents/SPECKIT_PROMPTS.md). Pin the directory with `SPECIFY_FEATURE_DIRECTORY=specs/NNN-…`. Do **not** re-run `constitution`. Stop for a 5-minute human skim between `specify` → `plan` → `tasks`. Max 3 `[NEEDS CLARIFICATION]`; cite FR/BR/TC/TASK/SCREEN IDs, don't invent requirements.

Mark each stage cell `todo` / `done` / `blocked`. After `tasks`, every task line carries owner and lane, e.g. `- [ ] T012 [P] [Obidit·lane-A] … (TASK-012)`. Use the person's name; D6's S/O/M codes map to Mahim/Obidit/Masnun.

| Feature | Owner | specify | clarify | plan | tasks (owner+lane on every line) | analyze | Notes |
|---|---|---|---|---|---|---|---|
| `001-platform-foundation` | Mahim | `done` | `done` | `done` | `todo` | `todo` | [spec](../../specs/001-platform-foundation/spec.md), [clarify evidence](../../specs/001-platform-foundation/clarification-review.md), [plan](../../specs/001-platform-foundation/plan.md), [research](../../specs/001-platform-foundation/research.md), [data model](../../specs/001-platform-foundation/data-model.md), [interface contract](../../specs/001-platform-foundation/contracts/platform-contract.md), [validation guide](../../specs/001-platform-foundation/quickstart.md); 0 clarification markers, checklist 15/16 (outcomes unverified); Pause B |
| `002-intake-ai` | Obidit | `todo` | `todo` | `todo` | `todo` | `todo` | |
| `003-parent-outputs` | Obidit (S-004/S-005 tasks: Mahim) | `todo` | `todo` | `todo` | `todo` | `todo` | |
| `004-matching-data` | Masnun | `todo` | `todo` | `todo` | `todo` | `todo` | |
| `005-officer-workflow` | Masnun (S-012 tasks: Mahim) | `todo` | `todo` | `todo` | `todo` | `todo` | |
| `006-dashboard-admin` | Masnun (S-013 tasks: Mahim) | `todo` | `todo` | `todo` | `todo` | `todo` | |
| `007-quality-release` | Mahim (shared; each task keeps its D6 owner) | `todo` | `todo` | `todo` | `todo` | `todo` | |
| Cross-feature `/speckit-analyze` at **22:30** | Mahim (findings go to Obidit as lead) | — | — | — | — | `todo` | No critical issues allowed |

## Who does what

| Person | Specs (boards above) | Build tasks this phase | D6 hours |
|---|---|---|---|
| **Obidit** (lead) | 002 intake-ai, 003 parent-outputs | TASK-012 normaliser tests first (counted in Phase 2's 5 h) · lead duties below | 0 (+ spec writing, not in D6) |
| **Masnun** | 004 matching-data, 005 officer-workflow, 006 dashboard-admin | TASK-010 generator → TASK-064 manifest, frozen and hashed **before any matcher code** | 9 |
| **Mahim** | 001 platform-foundation, 007 quality-release, cross-feature analyze at 22:30 | TASK-061 contracts → tag `contracts-v1` · TASK-008 shell | 6 |

### Lead duties — Obidit
- Skim each owner's spec between `specify` → `plan` → `tasks` (5 minutes, not 30) and check that every task line names its owner and lane.
- Decide on any finding from Mahim's 22:30 cross-feature analyze that needs a scope or ownership call.
- Approve any change to frozen contracts or schema after G1, together with the other two owners.
- Run `fera-gate G1` and link the report.

## Tasks — Obidit (lead)
| ID | Task | Lane · tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-012 (start) | Normaliser tests first: Bangla digits, time words, phone, district aliases, romaniser | A · Codex + `tdd_guide` | TASK-009 (Masnun) | — | Failing test suite committed (≥30 cases planned); implementation in Phase 2 | `blocked` | | Phase 0 TASK-009 is `todo`; 64 district aliases are not loaded. No tests started. |

## Tasks — Masnun
| ID | Task | Lane · tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-010 | Synthetic set generator: ~200 records, ground truth, duplicates, decoys, no-match | A · Codex | TASK-009 | 6 | Ground-truth file hashed and committed | `blocked` | | Phase 0 TASK-009 is `todo`; `npm run seed` is a fail-fast stub. No ground-truth file started. |
| TASK-064 | Identity-grouped manifest, frozen split, hashes — **before any matcher code** | A · Codex + `mle-reviewer` | TASK-010 | 3 | Manifest counts/split/hash asserted; hash committed | `blocked` | | TASK-010 is blocked by TASK-009; no frozen source set or manifest exists. |

## Tasks — Mahim
| ID | Task | Lane · tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-061 | Contracts in `src/contracts/`: DTOs, Zod, state enums, error envelope E-001–E-024, role projections, idempotency tokens, referral/count semantics | A · Codex + `code_architect`, `typescript_reviewer` | TASK-001 | 3 | Runtime schemas/examples and role projections agree; FV-01–05/10 closed; tag `contracts-v1`. Include one valid example per API DTO, usable as typed fakes by the Phase 2 UI lanes (see Phase 2 "Schedule reality") | `blocked` | | Phase 0 TASK-001 is `todo`; CI green on main is unverified. No contracts created or frozen. |
| TASK-008 | Layout shell, tokens from `DESIGN.md` incl. its "Fera overrides" (they win over `tokens_v2.css`, see AGENTS.md), self-hosted Inter + JetBrains Mono + Noto Sans Bengali, language toggle (COMP-022, FR-033) | B · Codex + `impeccable` | TASK-001 | 3 | Bangla renders on 1 Android phone | `blocked` | | Phase 0 TASK-001 is `todo`; no app shell exists. Android phone check remains pending. |

Cross-person handoffs: Obidit's and Masnun's Phase 2 UI lanes depend on Mahim's TASK-061 DTO examples; Obidit's TASK-012 tests depend on Masnun's district aliases (TASK-009).

**Freeze at G1:** `src/contracts/` and `db/schema_v2.sql`. Changing either one after G1 needs a small PR reviewed by all three owners (Obidit, Masnun, Mahim). Record any such PR in the log below.

## G1 exit checklist
Tick only from the gate report (`fera-gate`), with evidence linked.
- [ ] Seven `specs/NNN-*/tasks.md` exist, with owner and lane on every task
- [ ] `/speckit-analyze` (per feature + cross-feature) clean of critical issues
- [ ] `src/contracts/` merged and tagged `contracts-v1`
- [ ] Ground-truth file and manifest hash committed
- [ ] Shell with Bangla rendering merged

**Gate report:** _(link `docs/gates/G1-*.md`)_ · **Result:** _pending_

## Log
Format: `- YYYY-MM-DD HH:MM · <tool> · <lane> · <ID> <status change or note>`

### Obidit (lead)
- 2026-10-13 11:51 · Codex · Obidit · TASK-012 (start) `todo` → `blocked`; TASK-009 district load has no completion evidence.
### Masnun
- 2026-10-13 11:51 · Codex · Masnun · TASK-010 `todo` → `blocked`; TASK-009 is not done.
- 2026-10-13 11:51 · Codex · Masnun · TASK-064 `todo` → `blocked`; TASK-010 cannot start.
### Mahim
- 2026-10-13 11:51 · Codex · Mahim · TASK-061 `todo` → `blocked`; TASK-001 CI on main is unverified.
- 2026-10-13 11:51 · Codex · Mahim · TASK-008 `todo` → `blocked`; TASK-001 app scaffold is absent.
- 2026-10-13 11:51 · Codex · Mahim · 001 specify `todo` → `done`; spec and 15/16 quality checklist written for human skim.
- 2026-10-13 11:51 · Codex · Mahim · 001 clarify `todo` → `done`; 0 formal questions, OQ-021 deferred, Pause A reached.
- 2026-10-13 11:58 · Codex · Mahim · 001 plan `todo` → `done`; source-backed plan and design artifacts written, OQ-021 remains UNKNOWN, Pause B reached.

## Audit amendments (2026-10-12)

### AMD-1-1 — Entry, freeze and exit evidence
**Gap:** no explicit entry gate or complete acceptance links; schema freeze precedes TASK-062.
**Change:** entry requires G0 evidence, particularly district data for TASK-010/012 and local/host PG16 for the schema. Preparatory writing may run earlier but cannot be marked complete without its dependencies. G1 exits require seven task boards with traceable TASK/FR/BR/TC IDs and zero critical analysis findings; contract examples/projections validated against BR-004/015/016/020/023/024 and TC-030/042–046/060; synthetic manifest evidence for TC-064 (DEP-005); Bangla shell checks for FR-033/NFR-011. This is a contract gate, not a claim that service acceptance tests have run.
Freeze the exact supplied schema; P2 TASK-062 applies/tests runtime privileges, lifecycle and redaction. Schema changes still require the existing all-owner review and companion update process; never alter protected companions in this audit.
**Source:** D6 TASK-008/010/061/062/064; handover §§4,8–9; AGENTS ownership.

### AMD-1-2 — Estimate and handoff accounting
**Gap:** the TASK-012 “start” row could double-count hours or imply completion from failing tests.
**Change:** it is part of P2 TASK-012's single 5 h estimate. Transfer test artifacts and DTO examples by path/commit and record outstanding work; G1's API fakes are preparatory evidence only. Actual remaining hours and owner availability are UNKNOWN until reported. The G1 target is internal and does not establish schedule feasibility.
**Source:** D6 §5; TEAM_HANDOVER_V2 §6.

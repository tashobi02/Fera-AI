# Phases 5–6 — Buffer, finale baseline and finale prep · Gate G6

**Window:** Phase 5 Thu 15 Oct 2026 (G6 at 20:00) · Phase 6 Fri 16 → Sat 24 Oct (finale at AIUB, 5–10 min + live demo) · Asia/Dhaka
**Plan:** [Phase 5](EXECUTION_PLAN.md#phase-5--buffer-and-finale-baseline-thu-15-oct--gate-g6) · [Phase 6](EXECUTION_PLAN.md#phase-6--finale-prep-16--24-oct) · **Prev:** [Phase 4](PHASE_4_SUBMISSION.md)
**Phase status:** `todo`
**Last updated:** 2026-10-12 19:15 · by Claude Code (file created)

The plan's Phases 5 and 6 share this file because both run after the Round 2 submission. Nothing here changes the submitted Round 2 build.

---

## How to work this file (Claude Code · Codex · Antigravity)

This is a living tracker. Every agent working on a task in this phase updates it **in the same branch as the work**.

1. Read [AGENTS.md](../../AGENTS.md), then this file, then the spec-pack sections named in your row. All times are Asia/Dhaka.
2. Pick a `todo` row in your owner's lane whose dependencies are `done`. Set it to `doing` and fill in the lane and tool.
3. Work in a lane worktree (`scripts/agents/new-lane.sh <feature> <lane>`) and stay inside the owner's paths ([ownership map](../../AGENTS.md#repo-layout-and-ownership)).
4. When you open the PR, set the row to `review` with the PR link. After the merge, set it to `done` and fill in **Evidence**: the command and its result, a URL or a file path. A task without evidence is not done.
5. If you are stuck, set the row to `blocked`, say what blocks it in Evidence, and add a log line.
6. Edit only **your own rows** and **your owner's log section**, so parallel lanes don't conflict. Never tick a gate box yourself. Gate boxes are ticked from the `fera-gate` report in [docs/gates/](../gates/).

**Status values:** `todo` · `doing` · `review` · `done` · `blocked` · `cut`. Use `cut` only with the lead's approval and in the [D6 §11](../spec/D6_Implementation_Plan_V2.md#11-recommendation) cut order. Never cut review-before-submit, officer confirm, referral, audit or redaction.

| Action | Claude Code | Codex | Antigravity / any other agent |
|---|---|---|---|
| Spec-kit stage | `/speckit-<stage>` | `$speckit-<stage>` | Open `.agents/skills/speckit-<stage>/SKILL.md` and follow it step by step |
| Skill (`fera-review`, `fera-gate`, `verification-loop`, `impeccable`, …) | `/<skill>` | `$<skill>` | Read `.agents/skills/<skill>/SKILL.md` and follow it |
| Reviewer (`fera-safeguarding-reviewer`, `database-reviewer`, …) | Subagent from `.claude/agents/<name>.md` | Role from `.codex/agents/<name>.toml` | Start a separate read-only agent and give it `.claude/agents/<name>.md` as its brief |

---

## Phase 5 — Thu 15 Oct

### Carried over from Phases 2–3
Copy every row that wasn't `done` in Phases 0–4 here. Leave the original row `blocked` with "→ Phase 5".
| ID | Task | From phase | Owner | Due | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

### Spec-kit convergence
Run `/speckit-converge` (Codex `$speckit-converge`) until each feature reports Converged, then close stale tasks in `specs/*/tasks.md`.
| Feature | Owner | Converged | Stale tasks closed | Notes |
|---|---|---|---|---|
| `001-platform-foundation` | S | `todo` | `todo` | |
| `002-intake-ai` | O | `todo` | `todo` | |
| `003-parent-outputs` | O | `todo` | `todo` | |
| `004-matching-data` | M | `todo` | `todo` | |
| `005-officer-workflow` | M | `todo` | `todo` | |
| `006-dashboard-admin` | M | `todo` | `todo` | |
| `007-quality-release` | S | `todo` | `todo` | |

### Tasks
| ID | Task | Owner · tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-053 | Finale local stack: Docker DB, model cache, fixtures, `DEMO_MODE=1` | S · Claude Code + `database-reviewer` | TASK-033 | 4 | Laptop runs the journey offline (TC-021, TC-057) | `todo` | | |
| TASK-054 #1 | Rehearsal #1, internet off | S, O, M · human | TASK-053 | — | Logged below | `todo` | | |
| TASK-058 (start) | Backup recording plan | O · human | TASK-054 | — | Plan written: shots, devices, labels | `todo` | | |

### G6 exit checklist (15 Oct 20:00)
Tick only from the gate report (`fera-gate`), with evidence linked.
- [ ] The laptop runs the full journey offline (`DEMO_MODE=1`, all roles on one local DB)
- [ ] The backlog is empty, or every item has an owner and a date before 20 Oct

**Gate report:** _(link `docs/gates/G6-*.md`)_ · **Result:** _pending_

---

## Phase 6 — 16 → 24 Oct

| ID | Task | Owner · tool | Deps | h | Done when (D6) | Status | PR / link | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-054 | 5 rehearsals, ≥1 internet-off (log below) | S, O, M · human | TASK-053 | 5 | Rehearsal log 5/5 | `todo` | | |
| TASK-055 | Finale deck, timed ≤ 10 min, per [D7 §3.2](../spec/D7_Closing_Pack_V2.md#32-finale-8-minutes-plus-2-minute-qa-buffer) | S · any + `fera-safeguarding-reviewer` | TASK-043 | 4 | Timed run ≤ 10 min | `todo` | | |
| TASK-058 | Backup recording of the finale demo, labelled | O · human | TASK-054 | 2 | MP4 on laptop **and** Drive | `todo` | | |
| TASK-057 | 5–10 user conversations — **only if mentors/faculty clear OQ-019** | S · human | OQ-019 | 4 | Notes with consent; findings slide | `blocked` | | Waiting on OQ-019 |
| QA-PREP | Mentor and judge Q&A prep from D7 §3.2 | S, O, M · any | — | — | Q&A sheet in `docs/` | `todo` | | |
| SPARE | Spare laptop with the same local setup ([D6 §9.4](../spec/D6_Implementation_Plan_V2.md#94-backup-paths)) | S · human | TASK-053 | — | Spare runs the offline journey | `todo` | | |

### Rehearsal log (TASK-054)
Reset before each run: `npm run seed -- --reset --set demo`; check `/api/health` and `npm run spend` < cap.
| # | Date | Internet off? | Duration | Steps 1–10 passed | Issues → fix owner |
|---|---|---|---|---|---|
| 1 | 15 Oct | yes | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

## Log
Format: `- YYYY-MM-DD HH:MM · <tool> · <lane> · <ID> <status change or note>`

### Sadman
### Obidit
### Masnun

## Audit amendments (2026-10-12)

### AMD-5-1 — Entry and no scope absorption
**Gap:** the carryover instruction copies unfinished Phase 0–4 work here and moves original rows to “→ Phase 5”.
**Change:** this amendment supersedes that instruction. Keep every unfinished task in its original phase with its original owner, acceptance criteria, gate blocker and remaining estimate. The carryover table contains links to those rows only, with no duplicate hours or ownership transfer. P5 entry is the recorded G5 submission state and the P2/P3 single-DB offline baseline; preparation may proceed while a gate is blocked but cannot imply the submission passed. TASK-053 packages/hardens the existing baseline; it does not inherit missing FR-027/STORY-023 implementation.
**Source:** D1 §8/FR-027/STORY-023; D6 TASK-033/038/053; handover §§6,8; user audit scope.

### AMD-5-2 — G6 evidence and finale readiness by 23 Oct
**Gap:** the plan ends on 24 Oct without an explicit DEP-009 kit checkpoint.
**Change:** G6 requires TC-021/057 internet-off proof with all roles on the same local DB, model/fonts/fixtures/district assets preloaded, and an honest linked-blocker register. A cloud failure restarts a fresh labelled local scenario; it never transfers cloud state silently. If local fails, use the labelled backup recording.
By **23 Oct** (DEP-009), Sadman records laptop, Android phone and hotspot availability, spare/local setup status, TASK-054 five successful rehearsals including one internet-off (GOAL-007), TASK-055 timed ≤10-minute deck and TASK-058 backup on laptop and Drive. Actual devices, access and dates are UNKNOWN until evidenced. Offline microphone baseline is laptop; phone LAN mic needs tested secure context/HTTPS. Finale remains 24 Oct.
**Source:** D1 DEP-009; D6 §§2,9.1,9.4; handover §8.

### AMD-5-3 — Conditional research and hours
**Gap:** convergence and conversations could imply automatic completion.
**Change:** convergence closes only demonstrably implemented tasks; no stale task is deleted merely to clear the backlog. TASK-057 remains blocked on OQ-019; interview count/consent/approval are UNKNOWN without evidence. TASK-054 #1 and TASK-058 start are partial rows within their D6 5 h/2 h totals; shared-task hours are not multiplied by three. Exact owner split is UNKNOWN.
**Source:** D6 TASK-054/057/058; handover §§6–7.

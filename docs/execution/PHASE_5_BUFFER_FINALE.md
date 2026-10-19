# Phases 5–6 — Buffer, finale baseline and finale prep · Gate G6

> **19 Oct final integration update:** Source `2ce4cae` includes the newly fetched PR52 review fixes. Another account merged PR51 into main; the coordinator did not merge main. Local verification:3,981 unit tests,321 database tests,5×13 stricter offline checks and real demo lifecycle PASS. Full remote CI passes all three jobs. Team-reported submission is recorded in `submission/round2/platform-submission.md`; receipt remains unverified. Current [durable verification](evidence/pre-main-final-verification.json) supersedes the older snapshots below.


> **Current integration status — 18 Oct 2026.** Phase 4–5 software and local preparation are implemented on `pre-main` and pass local verification. Full remote CI passes at a8e9590 (same source tree as 2ce4cae). The user will verify and explicitly approve before any merge into `main`. No Round 2 submission, production deployment or human acceptance is claimed. Formal G5/G6 remain UNVERIFIED for the original external/human requirements. Current evidence: [final verification](evidence/pre-main-final-verification.json), [closure](pre-main-phase4-phase5-closure.md), [TC matrix](evidence/pre-main-tc-coverage.md).

> The older dated entries below are historical snapshots; the current integration status and linked final verification supersede their software counts and branch pointers.


> **Current status (18 Oct 2026, late).** Latest user steering: **complete Phase 4 and Phase 5 across all three owners except the media-file submission itself** (no Round 2 deck / video / Drive upload / selection-email send by an agent); verify the staged `pre-main--closure-docs` worktree; then the user approves the merge to `main`. **Phase 5 software work is `IN PROGRESS / REVIEW` until final software evidence is in place** — the earlier "be ready to start, not actually start" / "Phase 5 prepared, not started" framing is superseded. **Human formal G5 / G6 stay unpassed** because the pending external / human / production requirements remain on the original owners' queues (organiser instructions, 50 human labels, 60 audio clips, 2 Android devices, 5 person timing study, Bangla human review, provider accounts / prices, production DB, Drive / public sharing, five human rehearsals, spare laptop / mentor clearance, freeze tag). See [pre-main-phase4-phase5-closure.md](pre-main-phase4-phase5-closure.md), the [66-row TC matrix](evidence/pre-main-tc-coverage.md) and the staged [G6-2026-10-18-pre-main.md](../gates/G6-2026-10-18-pre-main.md).
>
> Historical snapshot — 18 Oct 2026, pre-main head `9c18e45`: application source `9155963` carried forward; production build / full DB (321 / 31) / full browser (78 / 0 skip in 56.2 s) PASS in `/tmp/fera-pre-main-final-verification.json`; the seven-slide deck (`ed3bfe6`) and actual 105-second local video (`27bb3c6`) are prepared and reviewed; an 8-slide deck variant is also reviewed (PR50 mahim-organiser 18:45, source-attributed). Round 2 is not submitted. Human evidence, production acceptance, frozen quality, organiser instructions, Drive and private-repository sharing remain unresolved. Backup finale plan and Q&A sheet are committed at root `docs/demo/backup-plan.md` and `docs/demo/qa-prep.md` (`173202f`).

**Window:** Phase 5 Thu 15 Oct 2026 (G6 at 20:00) · Phase 6 Fri 16 → Sat 24 Oct (finale at AIUB, 5–10 min + live demo) · Asia/Dhaka
**Plan:** [Phase 5](EXECUTION_PLAN.md#phase-5--buffer-and-finale-baseline-thu-15-oct--gate-g6) · [Phase 6](EXECUTION_PLAN.md#phase-6--finale-prep-16--24-oct) · **Prev:** [Phase 4](PHASE_4_SUBMISSION.md)
**Phase status:** `IN PROGRESS / REVIEW` (latest user steering; the earlier `todo / prepared` framing is superseded). The software-side items (READY-1 … READY-11, the 66-row TC matrix rows with automated evidence, the 3-scripted cache fixtures, the release checker, the spec-kit 003 plans / tasks, intake / platform all-owner status) are closed on this worktree; the human / external items (READY-12 … READY-21) stay open on the original owners. The rebaseline finale is 24 Oct, the kit is due 23 Oct, the organiser cutoff is UNKNOWN.
**Last updated:** 2026-10-18 · tasks distributed among Obidit, Masnun and Mahim; lead = Mahim · audit: [PHASE_3_AUDIT_2026-10-18.md](PHASE_3_AUDIT_2026-10-18.md); final review disposition: [phase3-finish-review.md](evidence/phase3-finish-review.md); handoff: [PHASE_5_HANDOFF.md](handoff/PHASE_5_HANDOFF.md); pre-main closure: [pre-main-phase4-phase5-closure.md](pre-main-phase4-phase5-closure.md); TC matrix: [evidence/pre-main-tc-coverage.md](evidence/pre-main-tc-coverage.md); gate: [G6-2026-10-18-pre-main.md](../gates/G6-2026-10-18-pre-main.md)
**Team:** **Obidit** — intake, AI, outputs · **Masnun** — data, matching, officer workflow, dashboard, evaluation · **Mahim** — lead; platform, integration, release (named "Sadman" in AGENTS.md and the spec pack; D6 owner code S). Tasks follow [EXECUTION_PLAN.md](EXECUTION_PLAN.md). The lead approves cuts and reschedules, records organiser and mentor decisions, and runs `fera-gate`.

> **Reading the headline.** Phase 5 software work is `IN PROGRESS / REVIEW`. The user said "complete Phase 4 and Phase 5 except media file submission" on 18 Oct (late). The lead is Mahim. The software-side readiness queue is closed; the human / external readiness queue remains on the original owners. Dates in the rebaseline: kit 23 Oct; AIUB finale 24 Oct; organiser cutoff **UNKNOWN**. The legacy 14 Oct 22:00 baseline is stale and is not treated as current.

The plan's Phases 5 and 6 share this file because both run after the Round 2 submission. Nothing here changes the submitted Round 2 build.

---

## How to work this file (Claude Code · Codex · Antigravity)

This is a living tracker. Every agent working on a task in this phase updates it **in the same branch as the work**.

1. Read [AGENTS.md](../../AGENTS.md), then this file, then the spec-pack sections named in your row. All times are Asia/Dhaka.
2. Pick a `todo` row in your owner's lane whose dependencies are `done`. Set it to `doing` and fill in the lane and tool.
3. Work in a lane worktree (`scripts/agents/new-lane.sh <feature> <lane>`) and stay inside the owner's paths ([ownership map](../../AGENTS.md#repo-layout-and-ownership)).
4. When you open the PR, set the row to `review` with the PR link. After the merge, set it to `done` and fill in **Evidence**: the command and its result, a URL or a file path. A task without evidence is not done.
5. If you are stuck, set the row to `blocked`, say what blocks it in Evidence, and add a log line.
6. Edit only the rows in **your own person table** and **your log section**, so parallel lanes don't conflict. Never tick a gate box yourself. Gate boxes are ticked from the `fera-gate` report in [docs/gates/](../gates/).

**Status values:** `todo` · `doing` · `review` · `done` · `blocked` · `cut`. Use `cut` only with approval from the lead (Mahim) and in the [D6 §11](../spec/D6_Implementation_Plan_V2.md#11-recommendation) cut order. Never cut review-before-submit, officer confirm, referral, audit or redaction.

| Action | Claude Code | Codex | Antigravity / any other agent |
|---|---|---|---|
| Spec-kit stage | `/speckit-<stage>` | `$speckit-<stage>` | Open `.agents/skills/speckit-<stage>/SKILL.md` and follow it step by step |
| Skill (`fera-review`, `fera-gate`, `verification-loop`, `impeccable`, …) | `/<skill>` | `$<skill>` | Read `.agents/skills/<skill>/SKILL.md` and follow it |
| Reviewer (`fera-safeguarding-reviewer`, `database-reviewer`, …) | Subagent from `.claude/agents/<name>.md` | Role from `.codex/agents/<name>.toml` | Start a separate read-only agent and give it `.claude/agents/<name>.md` as its brief |

---

## Phase 5 — Thu 15 Oct

## Who does what (15–24 Oct)

| Person | Phase 5 (15 Oct) | Phase 6 (16–24 Oct) | D6 hours |
|---|---|---|---|
| **Obidit** | Converge 002 + 003 · TASK-058 backup-recording plan | TASK-058 backup recording on laptop and Drive | 2 |
| **Masnun** | Converge 004, 005, 006 | Rehearsal fixes in their areas | 0 |
| **Mahim** (lead) | Converge 001 + 007 · TASK-053 local finale stack | TASK-055 finale deck · SPARE laptop · TASK-057 only if OQ-019 is cleared · DEP-009 kit record by **23 Oct** | 12 (incl. 4 conditional) |
| All three | TASK-054 rehearsal #1, internet off | TASK-054 rehearsals 2–5 · QA-PREP | 5 shared |

### Lead duties — Mahim
- Triage the carried-over list at the start of 15 Oct: every open item gets its original owner and a date before 20 Oct (AMD-5-1: links only, no ownership transfer).
- Schedule the five rehearsals and run `fera-gate G6` at 20:00.
- Ask mentors/faculty about OQ-019 and record the answer before TASK-057 can start.

### Phase 5 readiness queue (18 Oct 2026)

User on 18 Oct: "be ready to start, not actually start it." Phase 5 is `todo / prepared`. The status of every software-side readiness item is now **CLOSED** with durable review / evidence references — the temporary raw-review JSONs are not committed; durable evidence is the audit, the gate reports, and the durable evidence JSON. Items still in the queue (READY-12 … READY-21) are the original-owner human blocks (HUMAN artefacts, organiser evidence, deployment access, etc.) and are not under any agent's power. **Human artefacts are not a prerequisite to START every Phase 5 task**: the original-owner blocks live in this prepared queue; authorised local offline preparation may start when the user asks, with the human blocks remaining on the queue under their original owner. Deployment is **blocked by missing access**, not by a new permission ritual.

| ID | Status | Durable review / evidence reference |
|---|---|---|
| READY-1 | **CLOSED** | `docs/execution/PHASE_3_AUDIT_2026-10-18.md` §3.5a (REV-SAFE withdrawal); `docs/execution/evidence/phase3-finish-review.md` §1 (REV-SAFE PASS, false-finding withdrawn per D2A mandates own / staff field); narrow 5-scope code-only re-review at `/tmp/fera-disposition-final-code.json` returns PASS. |
| READY-2 | **CLOSED** | `docs/execution/PHASE_3_AUDIT_2026-10-18.md` §3.5a (REV-IMP PASS — parent-5 native confirms replace localized dialogs at `b352cda`); `docs/execution/evidence/phase3-finish-review.md` §1 (REV-IMP PASS). |
| READY-3 | **CLOSED** | `docs/execution/PHASE_3_AUDIT_2026-10-18.md` §3.5a (REV-TS PASS — batch + price-cause fix verified); `docs/execution/evidence/phase3-finish-review.md` §1 (REV-TS PASS); matcher N+1 closed by `readFoundRowsForScoring` batch; orchestrator `spend.no_price` log path; current unit run 3,693 / 308 skipped at `9155963` (preserved in current `27bb3c6`). |
| READY-4 | **CLOSED** | `docs/execution/PHASE_3_AUDIT_2026-10-18.md` §3.5a (REV-DB PASS — SQLSTATE + typed tests fix verified); `docs/execution/evidence/phase3-finish-review.md` §1 (REV-DB PASS); current DB suite 320 tests / 30 files at `9155963` (preserved in `27bb3c6`). |
| READY-5 | **CLOSED** | `docs/execution/PHASE_3_AUDIT_2026-10-18.md` §3.5a (REV-IMP focus / outline-none — `e9708fc` root fix; officer focus / descriptions `9468201`); `docs/execution/evidence/phase3-finish-review.md` §1. |
| READY-6 | **CLOSED** | `docs/execution/PHASE_3_AUDIT_2026-10-18.md` §3.5a (REV-SFH narrow notice-log fix verified at `2d8c921`/`9155963` — `safeLogNoticeRejection` wraps `log.error` in try/catch with empty body; allowlisted fields only); `docs/execution/evidence/phase3-finish-review.md` §1 (REV-SFH PASS, narrow); narrow 5-scope code-only re-review scope 4 PASS. **Not "in progress"** — closed at the final-review rerun. |
| READY-7 | **CLOSED** | `docs/execution/PHASE_3_AUDIT_2026-10-18.md` §3.5a (REV-A11Y PASS — W3C / MDN false findings withdrawn per <https://www.w3.org/WAI/tutorials/tables/two-headers/> and <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow>); `docs/execution/evidence/phase3-finish-review.md` §1.1 (withdrawn false findings). |
| READY-8 | **CLOSED** | `docs/execution/PHASE_3_AUDIT_2026-10-18.md` §3.5a (REV-MLE PASS — rerun replaced EMPTY_RUN); `docs/execution/evidence/phase3-finish-review.md` §1. |
| READY-9 | **CLOSED** | `docs/execution/PHASE_3_AUDIT_2026-10-18.md` §3.5a (focus `outline-none` `e9708fc`; officer focus / descriptions `9468201`; localized dialogs `b352cda`); `docs/execution/evidence/phase3-finish-review.md` §1. **Not "in progress"** — closed at the final-review rerun. |
| READY-10 | **CLOSED (merged)** | `docs/execution/PHASE_3_AUDIT_2026-10-18.md` §3 (final integration e2e total = 78 passed browser checks, no skips on a fresh local synthetic DB; journey specs integrated into the root tree at `9155963` lineage; current `27bb3c6` carries the same root tree). |
| READY-11 | **CLOSED (merged)** | The 50 DEV-only blank `{}` rows in `eval/data/labelled.canonical.draft.jsonl` are integrated; 37 tests on the canonical blank inputs run; **no human labels** are supplied; held-out inference and tuning remain forbidden; `eval/extract.mjs` still prints "not measured" until a canonical mapping is supplied (H-15). |
| READY-12 | **OPEN (HUMAN)** | H-8 — Obidit's explicit production-deploy go-ahead + managed DB access + freeze tag name. Deployment is blocked by missing access, not by a new permission ritual. |
| READY-13 | **OPEN (HUMAN)** | H-9 — organiser cutoff / channel / formats / extension / prior submission status. Earlier not-submitted snapshot superseded: Mahim/team-chat submission report is recorded in `submission/round2/platform-submission.md`; platform receipt and exact time remain UNKNOWN. |
| READY-14 | **OPEN (HUMAN)** | H-1 — TASK-003 provider setup (account, terms, prices, keys out of Git, spend controls). Spend cap default USD 25; team may raise to at most USD 30. |
| READY-15 | **OPEN (HUMAN)** | H-2 — TASK-011 50 labelled reports. The 50 DEV-only blank rows carry **no human labels**. |
| READY-16 | **OPEN (HUMAN)** | H-3 — TASK-036 two Android phones. Browser emulation is not a physical-device pass. |
| READY-17 | **OPEN (HUMAN)** | H-4 — TASK-040 60 consented clips. WER is not measured. |
| READY-18 | **OPEN (HUMAN)** | H-5 — TASK-041 ≥5 tester timing. Workflow speed is not measured. |
| READY-19 | **OPEN (HUMAN)** | H-6 — human Bangla review of strings marked "needs human Bangla review". |
| READY-20 | **OPEN (HUMAN)** | H-7 — TASK-056 mentor fixes. Mentor list empty. |
| READY-21 | **LOCAL CAPTURE CLOSED; DRIVE PENDING** | H-10 — TASK-045 final demo capture. The **local** actual recorded demo is committed at `submission/demo/final.mp4` (105.000 s, 1280×720, H.264, eight proof PNGs, captions/provenance validated in `/tmp/fera-demo-verified.log`; commit `27bb3c6`; typed flow + explicit seeded officer scenario, **no real voice**). **Drive copy pending** until Drive access / folder is granted; logged-out check on a private window is also pending (H-9 + ACCESS). |

Historical baseline: Phase 5 was `prepared`. Current software state is verified on `pre-main`, awaiting user review. The software-side items (READY-1 … READY-11) are CLOSED; the human-side items (READY-12 … READY-21) carry the original owners. **Authorised local offline preparation may start when the user asks**; the prepared queue is the gate for the human-side items, not a blanket block on every Phase 5 task. No Phase 5 lane work that depends solely on a CLOSED software item may be claimed blocked by that item.


### Carried over from Phases 2–3
Link every row that wasn't `done` in Phases 0–4 here (AMD-5-1): the task stays in its original phase with its original owner.
| ID | Task | From phase | Owner | Due | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

### Spec-kit convergence
Run `/speckit-converge` (Codex `$speckit-converge`) until each feature reports Converged, then close stale tasks in `specs/*/tasks.md`.
| Feature | Owner | Converged | Stale tasks closed | Notes |
|---|---|---|---|---|
| `001-platform-foundation` | Mahim | software verified; external items pending | reconciled with evidence | See pre-main convergence and final verification; no human/freeze completion inferred. |
| `002-intake-ai` | Obidit | software verified; external items pending | reconciled with evidence | See pre-main convergence and final verification; no human/freeze completion inferred. |
| `003-parent-outputs` | Obidit | software verified; external items pending | reconciled with evidence | See pre-main convergence and final verification; no human/freeze completion inferred. |
| `004-matching-data` | Masnun | software verified; external items pending | reconciled with evidence | See pre-main convergence and final verification; no human/freeze completion inferred. |
| `005-officer-workflow` | Masnun | software verified; external items pending | reconciled with evidence | See pre-main convergence and final verification; no human/freeze completion inferred. |
| `006-dashboard-admin` | Masnun | software verified; external items pending | reconciled with evidence | See pre-main convergence and final verification; no human/freeze completion inferred. |
| `007-quality-release` | Mahim | software verified; external items pending | reconciled with evidence | See pre-main convergence and final verification; no human/freeze completion inferred. |

### Tasks — Obidit
| ID | Task | Tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-058 (start) | Backup recording plan | human | TASK-054 | — | Plan written: shots, devices, labels | `review` | `pre-main` | [Backup plan](../demo/backup-plan.md); equipment and Drive copy pending. |

### Tasks — Mahim (lead)
| ID | Task | Tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-053 | Finale local stack: Docker DB, model cache, fixtures, `DEMO_MODE=1` | Claude Code + `database-reviewer` | TASK-033 | 4 | Laptop runs the journey offline (TC-021, TC-057) | `review` | `pre-main` | [CLI](../demo/CLI.md), [actual lifecycle](evidence/pre-main-demo-lifecycle.json), 5×13 automated offline checks; physical kit acceptance remains pending. |

### Shared
| ID | Task | Tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-054 #1 | Rehearsal #1, internet off | human | TASK-053 | — | Logged below | `todo` | | |

### G6 exit checklist (15 Oct 20:00)
Tick only from the gate report (`fera-gate`), with evidence linked.
- [ ] The laptop runs the full journey offline (`DEMO_MODE=1`, all roles on one local DB)
- [ ] The backlog is empty, or every item has an owner and a date before 20 Oct

**Gate report:** _(link `docs/gates/G6-*.md`)_ · **Result:** _pending_

---

## Phase 6 — 16 → 24 Oct

### Tasks — Obidit
| ID | Task | Tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-058 | Backup recording of the finale demo, labelled | human | TASK-054 | 2 | MP4 on laptop **and** Drive | `todo` | | |

### Tasks — Mahim (lead)
| ID | Task | Tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-055 | Finale deck, timed ≤ 10 min, per [D7 §3.2](../spec/D7_Closing_Pack_V2.md#32-finale-8-minutes-plus-2-minute-qa-buffer) | any + `fera-safeguarding-reviewer` | TASK-043 | 4 | Timed run ≤ 10 min | `review` | `pre-main` | Current 8-slide deck + [8-minute runbook](../demo/finale-runbook.md); actual human timed run pending. |
| SPARE | Spare laptop with the same local setup ([D6 §9.4](../spec/D6_Implementation_Plan_V2.md#94-backup-paths)) | human | TASK-053 | — | Spare runs the offline journey | `todo` | | |
| TASK-057 | 5–10 user conversations — **only if mentors/faculty clear OQ-019** | human | OQ-019 | 4 | Notes with consent; findings slide | `blocked` | | Waiting on OQ-019 |

### Shared
| ID | Task | Tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-054 | 5 rehearsals, ≥1 internet-off (log below) | human | TASK-053 | 5 | Rehearsal log 5/5 | `todo` | | |
| QA-PREP | Mentor and judge Q&A prep from D7 §3.2 | any | — | — | Q&A sheet in `docs/` | `review` | `pre-main` | [Q&A sheet](../demo/qa-prep.md), source safeguarding PASS; user review pending. |

Masnun has no Phase 6 D6 tasks; they take rehearsal fixes in their areas and their share of TASK-054 and QA-PREP.

### Rehearsal log (TASK-054)
Reset before each run: `npm run seed -- --reset --set demo`; check `/api/health` and `npm run spend` < cap.
| # | Date | Internet off? | Duration | Steps 1–10 passed | Issues → fix owner (Obidit / Masnun / Mahim) |
|---|---|---|---|---|---|
| 1 | 15 Oct | yes | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

## Log
Format: `- YYYY-MM-DD HH:MM · <tool> · <lane> · <ID> <status change or note>`

### Obidit
### Masnun
### Mahim (lead)
- 2026-10-18 · doc-updater · lane `pre-main--closure-docs` · pre-main Phase 4–5 closure docs staged. User quote at the top of [PHASE_4_SUBMISSION.md](PHASE_4_SUBMISSION.md) and the [pre-main-phase4-phase5-closure.md](pre-main-phase4-phase5-closure.md) closure record replaces the earlier "Phase 5 prepared, not started" framing with the latest user steering (complete P4+P5 except media file submission, software `IN PROGRESS / REVIEW`, formal G5 / G6 unpassed until pending requirements close). New evidence: [pre-main-tc-coverage.md](evidence/pre-main-tc-coverage.md) (66-row D6 TC matrix with real existing test paths or typed `UNVERIFIED`; no fake files; the typed-path tests are fixtures + synthetic recorders, not live-voice acceptances); new gate [G6-2026-10-18-pre-main.md](../gates/G6-2026-10-18-pre-main.md) (pre-main software pass; human / external blocks pending). The 26-test release checker is at `tests/release/check.test.ts` (27 assertions on this worktree, relative paths only, no external URLs); backup finale plan and Q&A sheet at root `docs/demo/backup-plan.md` and `docs/demo/qa-prep.md` (commit `173202f`) are complete. Root verification `/tmp/fera-pre-main-final-verification.json`: build PASS exit 0, DB 321 / 31 PASS, browser 78 / 0 skip PASS in 56.2 s, runtime audit 0 known vulnerabilities, full dep audit WARN (5 HIGH entries tracing to one unpatched `braces` advisory in the lint chain; no automatic downgrade). PR50 mahim-organiser 18:45 8-slide PPT + Bangla video end card integrated on pre-main — **source-attributed, not independently verified**; platform / share / recipient access pending. Round 2 NOT submitted; no media-file submission was sent. No application / schema / Git / secret / external-service writes this round. Future offline CLI / journey workers finish; do not assume their result counts from this file — verify against the sibling evidence files and `/tmp` reports. Frame header / poster PNG / new-restart actual checks stay in the coordinator queue.

## Audit amendments (2026-10-12)

### AMD-5-1 — Entry and no scope absorption
**Gap:** the carryover instruction copies unfinished Phase 0–4 work here and moves original rows to “→ Phase 5”.
**Change:** this amendment supersedes that instruction. Keep every unfinished task in its original phase with its original owner, acceptance criteria, gate blocker and remaining estimate. The carryover table contains links to those rows only, with no duplicate hours or ownership transfer. P5 entry is the recorded G5 submission state and the P2/P3 single-DB offline baseline; preparation may proceed while a gate is blocked but cannot imply the submission passed. TASK-053 packages/hardens the existing baseline; it does not inherit missing FR-027/STORY-023 implementation.
**Source:** D1 §8/FR-027/STORY-023; D6 TASK-033/038/053; handover §§6,8; user audit scope.

### AMD-5-2 — G6 evidence and finale readiness by 23 Oct
**Gap:** the plan ends on 24 Oct without an explicit DEP-009 kit checkpoint.
**Change:** G6 requires TC-021/057 internet-off proof with all roles on the same local DB, model/fonts/fixtures/district assets preloaded, and an honest linked-blocker register. A cloud failure restarts a fresh labelled local scenario; it never transfers cloud state silently. If local fails, use the labelled backup recording.
By **23 Oct** (DEP-009), Mahim records laptop, Android phone and hotspot availability, spare/local setup status, TASK-054 five successful rehearsals including one internet-off (GOAL-007), TASK-055 timed ≤10-minute deck and TASK-058 backup on laptop and Drive. Actual devices, access and dates are UNKNOWN until evidenced. Offline microphone baseline is laptop; phone LAN mic needs tested secure context/HTTPS. Finale remains 24 Oct.
**Source:** D1 DEP-009; D6 §§2,9.1,9.4; handover §8.

### AMD-5-3 — Conditional research and hours
**Gap:** convergence and conversations could imply automatic completion.
**Change:** convergence closes only demonstrably implemented tasks; no stale task is deleted merely to clear the backlog. TASK-057 remains blocked on OQ-019; interview count/consent/approval are UNKNOWN without evidence. TASK-054 #1 and TASK-058 start are partial rows within their D6 5 h/2 h totals; shared-task hours are not multiplied by three. Exact owner split is UNKNOWN.
**Source:** D6 TASK-054/057/058; handover §§6–7.

## Final automated integration evidence — 18 October

The coordinator integrated all necessary worker output, completed quota-interrupted repairs, and ran 3,981 unit tests, 321 DB tests, 78 browser checks, six native embedding tests and five repetitions of 13 offline checks. Automated rehearsals do not close TASK-054’s human log. See [final verification](evidence/pre-main-final-verification.json). All three owners retain their external items; no owner approval is invented.

Full remote CI: [39157185543](https://github.com/tashobi02/Fera-AI/actions/runs/39157185543) — check, DB and e2e PASS; includes 78 browser checks, 13 stricter offline checks and 6 native embedding checks.

## System integration regression run — 19 October

At source `8499361`, the plan-driven local run passed 3,981 unit tests (309 skipped), 321 DB tests, 78 standard browser checks, six native embedding checks, 13 direct offline checks and five automated offline repetitions. Exploratory checks exposed **S1 audit-subject omissions** in officer verification (Sadman) and duplicate decisions (Masnun), plus an **S2 manual-form handoff failure** (Obidit). Safeguarding/release verdict is **BLOCK** until fixes and regressions pass. Default lint also fails by scanning nested worktrees; the active-tree diagnostic has zero errors / 73 warnings. No application fix, production acceptance, human rehearsal, submission or formal G6 approval is claimed. Full commands, counts, screenshots, limitations and the two S3 tooling defects are in [the execution report](evidence/system-test-2026-10-19-8499361.md).


## System integration fixes and pre-main inspection — 19 October

At baseline `8499361`, [the system plan execution](evidence/system-test-2026-10-19-8499361.md) found five defects. The [fix and verification report](evidence/system-fixes-2026-10-19.md) resolves all five: manual fallback (Obidit), account audit subject (Sadman), duplicate audit subject (Masnun), absolute rehearsal config and nested-worktree linting (Sadman). Final application source `77cdfee` passes build, typecheck, lint (73 warnings), 3,992 unit checks, 323 DB checks, 84 browser checks, six native checks and five automated 13-check offline repetitions. Scoped safeguarding review PASS; specialist quota limitations are disclosed in the report. TASK-025/054/062; BR-004/010/019/023; TC-017/036. Human/external gate requirements remain pending.

Inspection of pre-main `2c7d1bf` separately reproduces three manual-form failures and a version-scoped rejection regression against D1 BR-019. These changes are excluded from the verified main push; details and reproduction evidence are in the same report. No all-owner approval, production acceptance or formal G6 approval is asserted.

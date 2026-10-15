# Phase 3 — Full scope and quality · Gates G3, G4

**Window:** Wed 14 Oct 2026, 07:00 → 16:00 (Asia/Dhaka) · **Gates:** G3 (13:00), G4 (16:00) · **Plan:** [EXECUTION_PLAN.md](EXECUTION_PLAN.md#phase-3--full-scope-and-quality-wed-14-oct-0700--1600--gates-g3-g4) · **Prev:** [Phase 2](PHASE_2_MUST_CORE.md) · **Next:** [Phase 4](PHASE_4_SUBMISSION.md)
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

## Timeline (hard times)
| Time | Event | Status |
|---|---|---|
| 09:00 | Stand-up + merge window | `todo` |
| 10:00–12:00 | TASK-041 timing study, ≥5 testers | `todo` |
| **12:30** | **Feature freeze.** After this, only fixes for failing TCs | `todo` |
| 13:00 | Stand-up · **G3** check | `todo` |
| **15:00** | TASK-042 production deploy + smoke | `todo` |
| **15:45** | TASK-043 final frozen evaluation on the prod build | `todo` |
| 16:00 | **G4** check | `todo` |

Cut order if short ([D6 §11](../spec/D6_Implementation_Plan_V2.md#11-recommendation)): FR-036 disaster screen → FR-010 13219 summary → FR-024 import → FR-029 edit after submit → live voice (keep labelled cached note) → poster PNG (keep poster text).

## Who does what

| Person | Features (Should/Could) | Quality and release | Hard times | D6 hours |
|---|---|---|---|---|
| **Obidit** | TASK-047 13219 summary · TASK-049 edit after submit + S-006 → TASK-050 status API | TASK-035 Bangla copy for every state · TASK-040 WER run · video shots | Freeze **12:30**, G3 **13:00**, G4 **16:00** (lead calls) | 12 |
| **Masnun** | TASK-048 fixture import · TASK-051 S-014 duplicate review · TASK-052 S-015 disaster mode | TASK-036 two Android phones · TASK-039 eval dev → held-out · TASK-060 perf · TASK-043 final frozen evaluation | TASK-043 **by 15:45** | 19 |
| **Mahim** (lead) | — | TASK-034 a11y · TASK-037 ≥60 unit tests · TASK-038 Playwright · TASK-041 timing study · TASK-042 prod deploy + smoke | TASK-041 **10:00–12:00**, TASK-042 **by 15:00** | 17 |
| All three | TASK-056 mentor fixes, each in their own areas | — | merged and verified before G3 | 5 shared |

### Lead duties — Mahim
- Announce the **12:30** feature freeze; after it, approve only fixes for failing TCs.
- Run `fera-gate G3` at 13:00 and `fera-gate G4` at 16:00, and link both reports.
- Apply the cut order below if a Should/Could item can't pass by 12:30, and record each cut as an omission against its FR/TC.
- Own the evidence-backed reschedule in AMD-3-2 once remaining effort and the organiser extension are known.

## Tasks — Obidit
| ID | Task | Tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-047 | 13219 summary ≤ 80 words (FR-010) | Codex | TASK-023 | 1 | TC-007 passes | `todo` | | |
| TASK-049 | Edit after submit + API-005 + S-006 (FR-029, BR-025) | Claude Code + `impeccable` | TASK-022 | 4 | TC-018 passes | `todo` | | |
| TASK-050 | Parent status API-018 (FR-030) | Codex | TASK-049 | 1 | TC-019 passes | `todo` | | |
| TASK-035 | Bangla copy review; every empty/error/loading state | Claude Code + `bengali-reviewer` | TASK-030 | 3 | Every E-xxx shows bn + en text | `todo` | | |
| TASK-040 | WER run on the 60 clips | Codex | TASK-014 | 3 | WER in report | `todo` | | |
| VIDEO-PREP | Capture video shots for TASK-045 (D7 §3.1) | human | TASK-042 | — | Raw shots stored | `todo` | | |

## Tasks — Masnun
| ID | Task | Tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-048 | Synthetic fixture import + API-015 (FR-024) | Codex + `security-reviewer` | TASK-020 | 3 | TC-014 passes (injection yields schema fields only; no URL fetch) | `todo` | | |
| TASK-051 | S-014 duplicate review (FR-023) | Claude Code + `impeccable` | TASK-018 | 3 | Mark same/different works | `todo` | | |
| TASK-052 | S-015 disaster mode, labelled as planned (FR-036) | Claude Code | TASK-026 | 2 | TC-035 passes | `todo` | | |
| TASK-036 | Test on 2 Android phones: Bangla, mic, 360 px | human | TASK-030 | 2 | Checklist signed in `docs/device-test.md` | `todo` | | |
| TASK-039 | Eval harness: dev run → held-out run after manifest/model freeze | Codex + `mle-reviewer` | TASK-011, 017, 018, 064 | 5 | TC-020 passes; report committed | `todo` | | |
| TASK-060 | Performance check vs D2 Part B §12.1 | Codex | TASK-042 | 2 | TC-034 results in report (met or reported as missed) | `todo` | | |
| TASK-043 | Final frozen evaluation on the prod build — **by 15:45** | Codex + `mle-reviewer` | TASK-042, 039, 040, 041, 060 | 2 | Cache-disabled report: all metrics, denominators, failures, commit/model/manifest hashes | `todo` | | |

## Tasks — Mahim (lead)
| ID | Task | Tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-034 | A11y: axe + keyboard + 320 px reflow, 200 % text, 400 % zoom | Claude Code + `a11y-architect` | TASK-030 | 3 | TC-033: 0 serious/critical, light and dark | `todo` | | |
| TASK-037 | Unit tests: normaliser, matcher, state guard, wording guard | Codex + `tdd-guide` | TASK-017 | 4 | ≥ 60 tests, CI green | `todo` | | |
| TASK-038 | Playwright essential journey + safeguarding TCs (tag `@gate-G2` / `@gate-G4`) | Claude Code + `e2e-runner` | TASK-030, 032, 059 | 5 | TC-001–066 app/service checks where applicable; companion-only results kept separate | `todo` | | |
| TASK-041 | Timing study, ≥5 testers, assistant vs manual form | human | TASK-025 | 3 | `eval/data/timing.csv`; median in report | `todo` | | |
| TASK-042 | Production deploy + managed DB seed + smoke — **by 15:00** | Claude Code | TASK-038 | 2 | `npm run smoke` passes on prod; tag `r2-freeze` | `todo` | | |

## Shared
| ID | Task | Tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-056 | Mentor session 2 fixes (list in [Phase 2](PHASE_2_MUST_CORE.md#mentor-session-2-fixes-feed-task-056-executed-in-phase-3)), each owner their own areas | any | — | 5 | Agreed fixes merged by 14 Oct 18:00 | `todo` | | |

Split TASK-056 by area: add one line per fix to the Phase 2 mentor table with its owner, and record each owner's merged fixes in their log section. The 5 h estimate is shared, not 5 h each.

Cross-person handoffs: Mahim's TASK-042 prod deploy unblocks Masnun's TASK-060 and TASK-043 and Obidit's video shots; Mahim's TASK-041 and Obidit's TASK-040 feed Masnun's TASK-043.

Evaluation rules: thresholds are calibrated on the dev split only; no threshold PR after the held-out run without `mle-reviewer`; caches and fixtures are off; every number has a denominator, or says "not measured".

## Stand-ups (15 min, then merge window)
| Time | Gate status | Merged since last | Blockers | Remaining h Obidit / Masnun / Mahim |
|---|---|---|---|---|
| 09:00 | | | | |
| 13:00 | | | | |

## G3 exit checklist (13:00)
Tick only from the gate report (`fera-gate`), with evidence linked.
- [ ] TC-007, TC-014, TC-018, TC-019, TC-035 pass
- [ ] S-014 mark same/different works
- [ ] A11y (TC-033) and Bangla copy checks pass
- [ ] Mentor fixes merged
- [ ] Feature freeze held since 12:30

**Gate report:** _(link `docs/gates/G3-*.md`)_ · **Result:** _pending_

## G4 exit checklist (16:00)
- [ ] `npm run smoke` passes on production
- [ ] Playwright green
- [ ] Final evaluation report committed: denominators, failures, cache disabled, commit/model/manifest hashes
- [ ] Measured spend recorded (`npm run spend`)

**Gate report:** _(link `docs/gates/G4-*.md`)_ · **Result:** _pending_

## Log
Format: `- YYYY-MM-DD HH:MM · <tool> · <lane> · <ID> <status change or note>`

### Obidit
### Masnun
### Mahim (lead)

## Audit amendments (2026-10-12)

### AMD-3-1 — Entry and release completeness
**Gap:** optional scope and happy-path checks could hide incomplete Must evidence.
**Change:** entry requires G2 evidence as amended, plus labelled reports/clips and frozen grouped manifest for quality work. G3 can pass only when every listed optional item actually passes; a cut is disclosed as omitted, not PASS. G4 requires all 17 Must rows in AMD-PLAN-2, applicable TC-001–066 evidence separated from companion-only checks, TC-021/057 offline whole-journey proof, TC-033/058 accessibility, TC-034 measured performance, TC-020/056/064 frozen evaluation, TC-036/065 spend and TC-037/066 honest claims. Missing evidence blocks the relevant gate.
**Source:** D1 §8; D6 §§7–8,10; handover §§5,8.

### AMD-3-2 — Timing and ownership constraints
**Gap:** TASK-056 allows 18:00 although G3 is 13:00; deploy at 15:00 leaves only 45 minutes for sequential TASK-060 (2 h) and TASK-043 (2 h).
**Change:** existing times remain internal targets, not a feasible computed schedule. Mentor fixes needed by G3 must be merged and verified before G3; otherwise record failure/rebaseline. D6's deploy→performance→final-evaluation dependencies cannot be bypassed to meet 15:45. Mahim (lead) coordinates an evidence-backed reschedule once remaining effort/availability and organiser extension are known (**UNKNOWN** now). P2/P3 owners retain late scope; P5 receives links only.
**Source:** D6 TASK-042/043/056/060; handover §6; AMD-PLAN-1/4.

### AMD-3-3 — Held-out integrity and fallback
**Gap:** “no threshold PR after the held-out run without mle-reviewer” could imply review permits test-set tuning.
**Change:** never tune thresholds/models/prompts from held-out results. Any later configuration change invalidates the prior frozen report for the new build; calibrate on dev, record a new freeze and use a fresh independent held-out set if the old set has influenced choices. Reviewer approval does not restore independence. Mark unavailable measurements “not measured”, never use cached fixtures as metrics. Apply AMD-PLAN-4 cut order; preserve typed/manual and complete single-DB offline paths and all safeguards.
**Source:** D2B §17; handover §8; D1 BR-026/FR-027; D6 §11.

### AMD-3-4 — Protected-source acceptance cross-references
**Gap:** handover FV-11 cites TC-057/063 as evaluation checks and FV-16 cites TC-061/062 as accessibility checks, but D6 defines those IDs as offline topology/pilot correction and audio limits/PG16 respectively. **Change:** use the actual D6 §8.1 test definitions: evaluation TC-056/064, accessibility TC-058 plus TC-033; keep the other tests under their actual scope. Proposed handover corrections are recorded in the audit log; neither protected copy is edited. **Source:** TEAM_HANDOVER_V2 §3 rows FV-11/FV-16; D6 §8.1.

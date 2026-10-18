# Phase 3 resume board

**As of:** 2026-10-18 (Asia/Dhaka)
**Purpose:** coordinate the delegated finish across owner lanes

This is a work queue, not a test report or gate result. Worktree names below identify assigned lanes; poll the actual worker and branch state before merging. Do not infer implementation completion from an existing branch or worktree. Use [phase3-resume-decisions.md](phase3-resume-decisions.md) for the technical decisions and required review boundaries.

## Current batch

Puku Opus 4.8 is the main implementer. Poll each lane to completion, record its actual branch/commit and evidence, then run an independent read-only Luna 6 Max review and the card's Accept command.

| Workstream | Lane | Scope to reconcile | Executor |
|---|---|---|---|
| Officer queue | `phase3-finish--queue` | Queue UI/API and the candidate visibility contract | Puku Opus 4.8 |
| Officer case UI | `phase3-finish--case-ui` | Case detail, close and safe audit presentation | Puku Opus 4.8 |
| Parent form | `phase3-finish--parent-form` | Manual intake S-005 and review/submit path | Puku Opus 4.8 |
| Map/list | `phase3-finish--map-list` | District map and accessible case list; centroid-only SVG | Puku Opus 4.8 |
| Matcher run | `phase3-finish--matcher-run` | Matching execution, rematch and visible failure/retry state | Puku Opus 4.8 |
| Duplicate review | `phase3-finish--duplicates-review` | Verified-officer duplicate decision UI/API and audit | Puku Opus 4.8 |
| Evaluation | `phase3-finish--evaluation` | Evaluation tooling, dev metrics and freeze evidence | Puku Opus 4.8 |
| Synthetic manifest | `phase3-finish--manifest` | Identity-grouped split manifest and hashes | Luna 6 Max small worker |
| Test stability | `phase3-finish--test-stability` | Reproduce and repair current test failures without relaxing thresholds or safeguarding | Luna 6 Max small worker |

Current task IDs are in §6/§9 of `PHASE_3_PLAN.md`; update §9 only after reconciling the worker's commit, review, acceptance output, and any required DB/e2e evidence.

## Planned after the current batch

| Workstream | Relevant cards | Start condition |
|---|---|---|
| Intake and demo cache | P3-017, P3-020, P3-043 | Use the recorded header/session/draft decisions. The schema change must pass DB, security, and safeguarding reviews before integration. Use `[MOCK]`; provider keys and prices remain human evidence. |
| Parent edit and status | P3-102, P3-103, P3-104 | Use the status labels and ACT-017 flow in the decision record; API-005 remains versioned and owner-scoped. |
| Import | P3-105, P3-106 | New `src/server/import/` ownership is assigned to Masnun; intake dependency and synthetic-only safeguards apply. |
| E2E and accessibility | P3-201 onward, relevant screen cards | Add evidence for the safeguarding journeys and WCAG checks; current infrastructure or a welcome-screen scan alone does not establish these results. |

## Batch control

1. Poll Puku and Luna workers after each batch. Record completed, still-running, failed, and blocked tasks from their actual outputs.
2. Fetch `origin` after every completed batch. Inspect remote movement and reconcile commits before integrating; do not merge unreviewed or dirty worker state.
3. Run the task review and Accept command in a separate read-only Luna session. Any schema addition also needs database, security, and Fera safeguarding reviews before integration.
4. Run the integration checks and wave gate that apply to the batch. Save exact exit codes, counts, commit IDs and review outcomes in the evidence/gate artifact.
5. Update the Phase 3 status rows only when that evidence exists. No gate is marked passed in this board.

## Human and external evidence queue

On **18 Oct 2026 (Asia/Dhaka)** the user confirmed that the extraction-label review, audio clips/transcripts, Android checks, timing study, and provider account/price/spend setup **are not completed yet**. These remain gate blockers; delegated technical approval cannot replace their evidence. Continue software work and prepare the Phase 4 handoff without asserting G2′/G3/G4 PASS.

| Evidence | Current value | Needed before |
|---|---|---|
| Provider keys, terms and current prices | **NOT COMPLETED**, user confirmed 18 Oct | Any paid provider call or live provider acceptance |
| Human labels for 50 synthetic evaluation texts | **NOT COMPLETED**, user confirmed 18 Oct | Labelled evaluation run |
| 60 consented audio clips and transcripts | **NOT COMPLETED**, user confirmed 18 Oct | WER measurement |
| Two Android phones | **NOT COMPLETED**, user confirmed 18 Oct | Device compatibility check |
| At least five timing participants | **NOT COMPLETED**, user confirmed 18 Oct | Timing study |
| Mentor session 2 findings/fix list | **UNKNOWN** | TASK-056 |
| Round 2 submission status and organiser cutoff/channel/formats | **UNKNOWN** | Any claim that Round 2 was submitted or TASK-044–046 are complete/not needed |
| Production DB/Vercel access and deployment go-ahead | **UNKNOWN** | P3-301 |

No human evidence, release milestone, or gate is marked complete by this board.

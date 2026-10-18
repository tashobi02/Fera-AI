# Implementation Plan: Matching data, candidates and case closure

**Branch**: `pre-main--spec-desk-data` | **Date**: 2026-10-18 (Asia/Dhaka) | **Spec**: [spec.md](spec.md) | **Owner**: Convergence desk (Puku CLI Opus 4.8, pre-main--spec-desk-data lane, 2026-10-18). Owner-area changes remain with Masnun (matching / embeddings / duplicates / dashboard / data) and Mahim (shared case service, state guard, audit, redaction).

**Input**: V2 spec pack `docs/spec/`, existing code under `src/server/matching/`, `src/server/duplicates/`, `src/server/dashboard/`, `src/server/case/`, `src/app/(desk)/staff/`, `src/app/(desk)/officer/{queue,match,map,duplicates}/`, `src/app/(desk)/officer/case/` and the evidence files in `docs/execution/evidence/`. This is a design and convergence artifact for the pre-main convergence lane; the lane does not write the matching code.

> **Convergence note (2026-10-18):** This feature's buildable task board is **append-only** against the existing evidence and the lane does not modify matcher / queue / match-review / case detail / dashboard / duplicate / found-log code. The plan records what already exists, what is missing and what is human/production/organiser-blocked, and adds only the **buildable evidence** (frozen manifest hashes, BR-017 filter reason audit, dev/heldout split, metrics denominators/abstention, TC-028 log scan, redaction eligibility summary, honest label scan). No heldout tuning, no schema / manifest / model / threshold change after freeze. (AMD-AGENTS-3, AMD-AGENTS-5; PHASE_3 AMD-3-3)

## Summary

Plan the desk-side data path: 64 districts, the synthetic 200-record manifest with identity grouping and frozen hashes, the embedding service and reembed script, the matcher (filters, cosine, bonuses, template reasons), the duplicate detector, the staff found-child log, the officer queue, the match-review page, the case detail/close, the dashboard map and counts, the SCREEN-013 admin redaction, the SCREEN-014 duplicate review, the SCREEN-015 disaster-mode stub, and the evaluation harness that consumes the manifest on the dev split first and on the heldout split after freeze. The plan is buildable-only: the matcher / queue / match-review / case detail / dashboard / duplicate / found-log / redaction code already exists and is the spec-kit evidence; this lane adds only the missing evidence and the explicit human / production / organiser-blocked list. (FR-011–FR-019, FR-022, FR-023, FR-028, FR-032, FR-036; BR-001, BR-005, BR-012, BR-013, BR-014, BR-017, BR-018, BR-019, BR-020, BR-021, BR-026; TASK-009, TASK-010, TASK-011, TASK-015, TASK-016, TASK-017, TASK-018, TASK-019, TASK-026, TASK-027, TASK-028, TASK-029, TASK-030, TASK-039, TASK-051, TASK-052, TASK-064; TC-008, TC-009, TC-010, TC-011, TC-012, TC-013, TC-020, TC-028, TC-035, TC-052, TC-064)

## Technical Context

| Item | Planned choice and source |
|---|---|
| Language and framework | Next.js App Router, strict TypeScript, Tailwind, Vitest, Playwright + axe; no new framework. (AGENTS.md; TASK-001, TASK-061) |
| Browser and server | Round 2 Vercel deploy + laptop DEMO_MODE=1 finale. The exact organiser cutoff/channel/formats remain UNKNOWN. (D2 Part B §12.1, §15; D6 §5; PHASE_4 AMD-4-1) |
| Storage boundary | Read-only consumption of the manifest from feature 004, the case service from feature 001, the auth envelope from feature 001. No schema / role DTO / audit invariant change. (BR-009/010/012/013/021/024; TASK-015) |
| Interfaces | API-007 (found log), API-008 (queue), API-009 (candidate read), API-010 (decision), API-011 (close), API-012 (dashboard), API-013 (audit), API-014 (duplicate). All D2A §5.5. The matcher and the duplicate detector expose their typed result schemas from `src/contracts/`. |
| AI and normalisation | The matcher uses the embedding service + a deterministic score; it must not call LLMs. The duplicate detector uses the embedding service + a name/dob match. (BR-018, BR-021, BR-026; AMD-AGENTS-5) |
| Test framework | Vitest for matcher filters / score / reasons, duplicate detector, queue API, decision / close lifecycle, dashboard stats; Playwright + axe for SCREEN-007 / 009 / 010 / 011 / 012 / 014. D6 sets the targets; the existing evidence file (e.g. `docs/execution/evidence/found-log.md`, `match-review.md`) records per-lane pass / fail. (TASK-037, TASK-038; TC-008–TC-013, TC-016, TC-029, TC-032) |
| Performance targets | Matching p95, queue p95, dashboard p95 from D2 Part B §12.1. No measurement yet. (TASK-060; NFR-001–NFR-006) |
| Limits | 64 districts, 200 records (40/60 dev/test), 60 true pairs, 20 no-match, 25 duplicate links, ≤5 candidates per missing report, USD 25 atomic default spend cap. (FR-019, FR-022, FR-028; BR-014; DECISION-017) |
| Visual and accessibility rules | D3 screen behaviour, D4 interaction rules, DESIGN.md Paper theme and Fera overrides; **WCAG 2.2 AA, Bangla default, English toggle, Bangla numerals, ≥44 px targets, 320 CSS px reflow, 200 % text zoom, 400 % viewport zoom, icon + text + colour.** (FR-033; NFR-011, NFR-013; D4) |
| Scale | D2's ten realistic concurrent demo users; three labelled demo cases in `--set demo`; ten scripted synthetic cache cases; an offline local stack at the finale. (FR-024, FR-027; BR-026) |

## Constitution Check

The constitution is a read-only draft. The V2 pack resolves wording differences. These checks assess this plan only; runtime compliance still needs evidence. (AGENTS.md; `.specify/memory/constitution.md`)

| Principle | Design check before research | Post-design check |
|---|---|---|
| I. Review before submit | No change; the desk consumes reviewed cases only. (BR-004/023) | Verified by reading the existing API-007/010/011 evidence; no new code path proposed here. |
| II. AI assists, unknown remains unknown | Matcher uses the embedding service and a deterministic score; no LLM call. The duplicate detector is deterministic on name + dob and embedding. (BR-018, BR-021) | Plan forbids any LLM call from the matcher / duplicates / dashboard / decision code path. |
| III. Role visibility | Officer-only candidate projection, admin aggregate, parent own-case, staff own-found. (BR-007/024) | `access.denied` rows are append-only and use null FK when the case is unknown. |
| IV. Lifecycle | Case service is shared; matcher locks in sorted UUID order, rechecks versions, voids competitors, reconciles both states. (BR-012, BR-019, BR-020) | No new lifecycle state is proposed; the heldout freeze forbids post-freeze threshold / model / manifest change. |
| V. Audit and logs | `match.confirm`, `match.reject`, `match.voided`, `referral.recorded`, `case.closed`, `case.edited`, `access.denied` are append-only; no child payload in logs. (BR-009/010; NFR-010) | TC-028 log scan is added as a buildable task. |
| VI. Honest labels | SCREEN-011, SCREEN-013, SCREEN-014 and SCREEN-015 all carry visible synthetic / [MOCK] / পরিকল্পিত labels. (BR-022/026; FR-027/032) | `fera-safeguarding-reviewer` is the gate. |
| VII. Synthetic only | The manifest is invented and frozen; redaction is pseudonymisation, not legal anonymisation. (BR-026; FR-024, FR-025) | No new fixture beyond the existing manifest + demo seed. |

**Gate result**: No design-level violation identified. This does not pass G2 or establish implementation compliance. The draft constitution remains unratified. (AMD-1-1; G2)

## Convergence Map (per D6 acceptance)

The plan below maps each of the eight user stories to its existing evidence and to the buildable / human / production / organiser gaps. Nothing in this plan claims a fact, date, hour, owner, account, figure, contact, interview, approval or completion that has no recorded evidence.

| Story | Existing evidence (this lane does not write the code) | Buildable gap in this lane | Human / production / organiser gap (out of scope) |
|---|---|---|---|
| US1 — found-child log (TASK-026) | `docs/execution/evidence/found-log.md`, `db/schema_v2.sql`, `src/server/found/log-found.ts`, `src/app/(desk)/staff/` | a `per-principal 30/min` unit test, an `OD-026-1` projection contract test, an `OD-026-4` near-duplicate guard test. | none. |
| US2 — frozen evaluation (TASK-039, TASK-043) | `docs/execution/evidence/seed-cases.md`, `eval/`, `src/server/matching/embed.ts` | the metrics-denominator / abstention / cache-exclusion writer (T030–T032 of feature 007 tasks), the freeze pre-flight (T031), the heldout-freeze unit test (T028). | real heldout run; OD-009-2; OD-064-1. |
| US3 — match candidates (TASK-017, TASK-027) | `src/server/matching/{filters,score,reasons,queue-read}.ts`, `src/app/(desk)/officer/queue/` | BR-017 filter reason audit row, district-bonus value table (`OD-017-1`), ≤5-candidate count unit test, empty-shortlist unit test. | none. |
| US4 — match review + decision (TASK-028, TASK-029) | `docs/execution/evidence/match-review.md`, `src/server/case/decision.ts`, `src/app/(desk)/officer/match/[id]/` | one-transaction protocol unit test (sorted-UUID lock, version recheck, void competitors, audit), `OD-028-4` wording fix. | `OD-028-1` (fourth verdict). |
| US5 — close + audit (TASK-029) | `docs/execution/evidence/platform-case-service.md`, `src/server/case/close.ts`, `src/app/(desk)/officer/case/[id]/` | `coordination_recorded` / `resolved_outside_fera` unit test, re-close refusal test, non-officer refusal test. | none. |
| US6 — dashboard + map (TASK-030) | `src/server/dashboard/stats.ts`, `src/app/(desk)/officer/map/` | per-district missing / found / confirmed count test, icon + text + colour a11y test, synthetic chip visibility test. | none. |
| US7 — duplicate detector (TASK-018, TASK-051) | `src/server/duplicates/{detect,persist,decision,read}.ts`, `src/app/(desk)/officer/duplicates/` | shared-phone-alone-no-suppress test, name+dob-link test, dismissal-preserves-original test. | `OD-018-1` (near-embedding threshold). |
| US8 — disaster mode (TASK-052) | `src/app/(desk)/staff/disaster/page.tsx` (labelled "পরিকল্পিত") | 501 / E-019 unit test, no-record-written test. | `OD-052-1` (mentor table). |

## Project Structure

### Documentation (this feature)

```text
specs/004-matching-data/
├── plan.md              # This file (Puku CLI 2026-10-18)
├── spec.md              # Generated 2026-10-18 by Puku CLI convergence desk
├── tasks.md             # Buildable task board (this plan)
└── checklists/
    └── requirements.md  # (no checklist produced; the recovery 007 checklist is the closest peer and is reused)
```

### Source Code (no new application code in this feature)

```text
src/server/matching/        # existing; this plan adds no code
src/server/duplicates/      # existing; this plan adds no code
src/server/dashboard/       # existing; this plan adds no code
src/server/case/            # existing (shared with feature 001); this plan adds no code
src/app/(desk)/staff/       # existing; this plan adds no code
src/app/(desk)/officer/     # existing; this plan adds no code
src/app/(desk)/admin/       # existing (SCREEN-013); this plan adds no code
docs/execution/evidence/    # existing; this plan adds pre-main-convergence-desk.md
eval/                       # existing; this plan adds the report-format writer only
```

## Open Decisions (carried over from spec.md)

- OD-009-1, OD-009-2, OD-009-3, OD-017-1, OD-026-1, OD-026-3, OD-026-4, OD-028-1, OD-028-3, OD-028-4, OD-052-1, OD-064-1 are all UNKNOWN. This plan records them and does not invent values.

## Risks

- **RISK-A (high):** The matcher / queue / match-review / case detail / dashboard / duplicate / found-log code is owned by Masnun and Mahim; this lane does not modify it. The plan handles this by separating "evidence" from "code" and appending only the missing buildable evidence.
- **RISK-B (medium):** Real heldout evaluation requires OD-009-2, OD-064-1 and the freeze pre-flight (T031 of feature 007) to be in place. The plan refuses to tune on heldout.
- **RISK-C (low):** `OD-018-1` (near-embedding threshold) and `OD-017-1` (district-bonus value) are unowned. The plan records them and the matcher falls back to a documented default with a TODO marker.

## Notes

- This plan **does not** mark any existing unchecked task as done. It appends new convergence tasks for the missing parts (BR-017 filter reason audit, heldout freeze unit test, one-transaction protocol test, shared-phone-alone-no-suppress test, etc.) and explicitly marks the human / production / organiser gaps as `human/organiser-blocked`.
- "Buildable" means "can be implemented, tested and merged by a lane without waiting on organiser or human evidence."
- All command and status claims below are real or marked UNVERIFIED; no inferred successes.

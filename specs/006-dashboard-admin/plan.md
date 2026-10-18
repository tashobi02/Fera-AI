# Implementation Plan: Dashboard, district picture, duplicate review and disaster-mode

**Branch**: `pre-main--spec-desk-data` | **Date**: 2026-10-18 (Asia/Dhaka) | **Spec**: [spec.md](spec.md) | **Owner**: Convergence desk (Puku CLI Opus 4.8, pre-main--spec-desk-data lane, 2026-10-18). Owner-area changes remain with Masnun (dashboard / duplicates / data) and Mahim (shared SCREEN-013 admin redaction).

**Input**: V2 spec pack `docs/spec/`, existing code under `src/server/dashboard/`, `src/server/duplicates/`, `src/app/(desk)/officer/map/`, `src/app/(desk)/officer/duplicates/`, `src/app/(desk)/staff/disaster/`, the synthetic-import slot in `src/app/(desk)/admin/import-form.tsx` (planned) and the evidence files in `docs/execution/evidence/`. This is a design and convergence artifact for the pre-main convergence lane; the lane does not write the dashboard / duplicates / disaster-mode code.

> **Convergence note (2026-10-18):** This feature's buildable task board is **append-only** against the existing evidence and the lane does not modify the dashboard, duplicate detector, synthetic-import slot or disaster-mode code. The plan records what already exists, what is missing and what is human / production / organiser-blocked, and adds only the **buildable evidence** (per-district count test, all-64-districts test, a11y icon-text-colour test, shared-phone-alone-no-suppress test, duplicate-link test, synthetic-import 501 / E-019 test, disaster-mode 501 / E-019 test, drill-through officer-only test, redaction rate-limit test, redaction typed-confirm test). No heldout tuning, no schema / manifest / model / threshold change after freeze. (AMD-AGENTS-3, AMD-AGENTS-5; PHASE_3 AMD-3-3)

## Summary

Plan the desk-side aggregates, duplicate review, synthetic-import stub and disaster-mode stub for the synthetic Fera prototype so the team can prove the dashboard, the duplicate detection and the planned-extension stubs on a release candidate. The plan is **append-only** against the existing evidence and the lane does not modify the dashboard, duplicate, synthetic-import or disaster-mode code. (FR-019, FR-022, FR-023, FR-024, FR-025, FR-032, FR-036; BR-007, BR-009, BR-014, BR-021, BR-024, BR-026; TASK-018, TASK-030, TASK-048, TASK-051, TASK-052; TC-012, TC-013, TC-014, TC-015, TC-021, TC-022, TC-035, TC-044, TC-045, TC-050, TC-052, TC-055)

## Technical Context

| Item | Planned choice and source |
|---|---|
| Language and framework | Next.js App Router, strict TypeScript, Tailwind, Vitest, Playwright + axe; no new framework. (AGENTS.md; TASK-001, TASK-061) |
| Browser and server | Round 2 Vercel deploy + laptop DEMO_MODE=1 finale. The exact organiser cutoff/channel/formats remain UNKNOWN. (D2 Part B §12.1, §15; D6 §5; PHASE_4 AMD-4-1) |
| Storage boundary | Read-only consumption of the manifest from feature 004, the case service from feature 001, the contracts from feature 001. No schema / role DTO / audit invariant change. (BR-009/010/014/021/024; TASK-015, TASK-061) |
| Interfaces | API-012 (dashboard stats, all 64 districts), API-014 (duplicate review), API-015 (synthetic fixture import, planned stub), API-016 (redaction, shared with feature 005), API-022 (district drill-through, officer-only). All D2A §5.5. |
| AI and normalisation | The duplicate detector uses the embedding service + a name/dob match; the dashboard uses plain SQL aggregates. (BR-021, BR-014) |
| Test framework | Vitest for district stats, district drill-through, duplicate detector, synthetic-import stub, disaster-mode stub, redaction eligibility; Playwright + axe for SCREEN-011 and SCREEN-014. D6 sets the targets; the existing evidence file (e.g. `docs/execution/evidence/seed-cases.md`, `match-review.md`, `platform-admin.md`) records per-lane pass / fail. (TASK-037, TASK-038; TC-012, TC-013, TC-014, TC-015, TC-021, TC-035) |
| Performance targets | Dashboard p95, map p95, district drill-through p95 from D2 Part B §12.1. No measurement yet. (TASK-060; NFR-001–NFR-006) |
| Limits | 64 districts, 200 records (40/60 dev/test), 60 true pairs, 20 no-match, 25 duplicate links, 5/min redaction rate limit, USD 25 atomic default spend cap. (FR-019, FR-022, FR-028; BR-014; DECISION-017) |
| Visual and accessibility rules | D3 screen behaviour, D4 interaction rules, DESIGN.md Paper theme and Fera overrides; **WCAG 2.2 AA, Bangla default, English toggle, Bangla numerals, ≥44 px targets, 320 CSS px reflow, 200 % text zoom, 400 % viewport zoom, icon + text + colour.** (FR-033; NFR-011, NFR-013; D4) |
| Scale | Three labelled demo cases in `--set demo`; D2's ten realistic concurrent demo users; an offline local stack at the finale. (FR-024, FR-027; BR-026) |

## Constitution Check

The constitution is a read-only draft. The V2 pack resolves wording differences. These checks assess this plan only; runtime compliance still needs evidence. (AGENTS.md; `.specify/memory/constitution.md`)

| Principle | Design check before research | Post-design check |
|---|---|---|
| I. Review before submit | No change; the desk consumes reviewed cases only. (BR-004/023) | Verified by reading the existing API-012/014 evidence; no new code path proposed here. |
| II. AI assists, unknown remains unknown | The duplicate detector is deterministic on name + dob and embedding. (BR-021) | Plan forbids any LLM call from the dashboard / duplicates / disaster-mode code path. |
| III. Role visibility | Officer-only district drill-through, admin aggregate, parent own-case, staff own-found. (BR-007/024) | API-022 is officer-only; admin has no access. |
| IV. Lifecycle | No new lifecycle state is proposed. (BR-012, BR-013, BR-020) | The heldout freeze forbids post-freeze threshold / model / manifest change. |
| V. Audit and logs | `case.payload_redacted`, `case.closed`, `access.denied` are append-only; no child payload in logs. (BR-009/010; NFR-010) | TC-028 log scan is added as a buildable task. |
| VI. Honest labels | SCREEN-011, SCREEN-013, SCREEN-014 and SCREEN-015 all carry visible synthetic / [MOCK] / পরিকল্পিত labels. (BR-022/026; FR-027/032) | `fera-safeguarding-reviewer` is the gate. |
| VII. Synthetic only | The manifest is invented and frozen; redaction is pseudonymisation, not legal anonymisation. (BR-026; FR-024, FR-025) | No new fixture beyond the existing manifest + demo seed. |

**Gate result**: No design-level violation identified. This does not pass G2 or establish implementation compliance. The draft constitution remains unratified. (AMD-1-1; G2)

## Convergence Map (per D6 acceptance)

The plan below maps each of the five user stories to its existing evidence and to the buildable / human / production / organiser gaps. Nothing in this plan claims a fact, date, hour, owner, account, figure, contact, interview, approval or completion that has no recorded evidence.

| Story | Existing evidence (this lane does not write the code) | Buildable gap in this lane | Human / production / organiser gap (out of scope) |
|---|---|---|---|
| US1 — dashboard + counts + map (TASK-030) | `src/server/dashboard/stats.ts`, `src/app/(desk)/officer/map/` | per-district missing / found / confirmed count test, all-64-districts test, a11y icon-text-colour test, drill-through officer-only test. | none. |
| US2 — duplicate detector + review (TASK-018, TASK-051) | `src/server/duplicates/{detect,persist,decision,read}.ts`, `src/app/(desk)/officer/duplicates/` | shared-phone-alone-no-suppress test, name+dob-link test, same/different mark-and-audit test, dismissal-preserves-original test. | `OD-018-1` (near-embedding threshold). |
| US3 — synthetic import (TASK-048) | `src/app/(desk)/admin/import-form.tsx` (planned) | planned-panel test, 501 / E-019 test, no-record-written test. | `TASK-048` is a planned extension; the lane only records it as 501 / E-019. |
| US4 — admin redaction eligibility (TASK-032) | `docs/execution/evidence/platform-admin.md`, `src/server/admin/redact.ts`, `src/app/(desk)/admin/redaction-form.tsx`, `src/app/api/admin/anonymise/route.ts` | eligible-count unit test, active-pair-skip unit test, redaction rate-limit unit test (5/min), non-admin refused unit test, typed-confirmation word unit test. | none. |
| US5 — disaster mode (TASK-052) | `src/app/(desk)/staff/disaster/page.tsx` (labelled "পরিকল্পিত") | 501 / E-019 unit test, no-record-written test. | `OD-052-1` (mentor table). |

## Project Structure

### Documentation (this feature)

```text
specs/006-dashboard-admin/
├── plan.md              # This file (Puku CLI 2026-10-18)
├── spec.md              # Generated 2026-10-18 by Puku CLI convergence desk
└── tasks.md             # Buildable task board (this plan)
```

### Source Code (no new application code in this feature)

```text
src/server/dashboard/        # existing; this plan adds no code
src/server/duplicates/       # existing; this plan adds no code
src/app/(desk)/officer/map/  # existing; this plan adds no code
src/app/(desk)/officer/duplicates/  # existing; this plan adds no code
src/app/(desk)/staff/disaster/      # existing; this plan adds no code
src/app/(desk)/admin/import-form.tsx # existing (planned); this plan adds no code
docs/execution/evidence/    # existing; this plan adds pre-main-convergence-desk.md
```

## Open Decisions (carried over from spec.md)

- OD-009-1, OD-009-2, OD-009-3, OD-018-1, OD-032-4, OD-052-1, OD-064-1 are all UNKNOWN. This plan records them and does not invent values.

## Risks

- **RISK-A (high):** The dashboard / duplicates / synthetic-import / disaster-mode code is owned by Masnun and Mahim; this lane does not modify it. The plan handles this by separating "evidence" from "code" and appending only the missing buildable evidence.
- **RISK-B (medium):** The synthetic fixture import (TASK-048) is a planned extension; the lane records it as 501 / E-019 only. The mentor table is the gate.
- **RISK-C (low):** The drill-through API (API-022) is officer-only (D2A §9.2); the admin has no access. A forged HMAC cursor is E-001.

## Notes

- This plan **does not** mark any existing unchecked task as done. It appends new convergence tasks for the missing parts (per-district count test, all-64-districts test, shared-phone-alone-no-suppress test, synthetic-import 501 / E-019 test, etc.) and explicitly marks the human / production / organiser gaps as `human/organiser-blocked`.
- "Buildable" means "can be implemented, tested and merged by a lane without waiting on organiser or human evidence."
- All command and status claims below are real or marked UNVERIFIED; no inferred successes.

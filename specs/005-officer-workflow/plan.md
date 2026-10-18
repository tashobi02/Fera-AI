# Implementation Plan: Officer workflow, admin tools and sign-in

**Branch**: `pre-main--spec-desk-data` | **Date**: 2026-10-18 (Asia/Dhaka) | **Spec**: [spec.md](spec.md) | **Owner**: Convergence desk (Puku CLI Opus 4.8, pre-main--spec-desk-data lane, 2026-10-18). Owner-area changes remain with Mahim (case service / sign-in / not-found / admin / parent edit / parent status).

**Input**: V2 spec pack `docs/spec/`, existing code under `src/server/case/`, `src/server/admin/`, `src/server/auth/`, `src/app/(desk)/officer/case/`, `src/app/(desk)/admin/`, `src/app/(auth)/`, `src/app/not-found.tsx` and the evidence files in `docs/execution/evidence/`. This is a design and convergence artifact for the pre-main convergence lane; the lane does not write the officer / admin / sign-in code.

> **Convergence note (2026-10-18):** This feature's buildable task board is **append-only** against the existing evidence and the lane does not modify the case service, sign-in, not-found, admin or parent edit code. The plan records what already exists, what is missing and what is human / production / organiser-blocked, and adds only the **buildable evidence** (one-transaction protocol test, audit appendix test, eligible-count unit test, redaction rate-limit test, sign-in 320/200/400 reflow test, frame-ancestors test, etc.). No heldout tuning, no schema / role DTO / audit invariant change after freeze. (AMD-AGENTS-3, AMD-AGENTS-5; PHASE_3 AMD-3-3)

## Summary

Plan the officer workflow, admin tools and sign-in for the synthetic Fera prototype so the team can prove the officer's role on a release candidate and produce the audit, redaction and sign-in evidence. The plan is **append-only** against the existing evidence and the lane does not modify the case service, sign-in, not-found, admin or parent edit code. (FR-016, FR-018, FR-020, FR-021, FR-025, FR-029, FR-030, FR-031, FR-035, FR-037; BR-001, BR-005, BR-007, BR-009, BR-010, BR-012, BR-013, BR-020, BR-024, BR-025, BR-026; TASK-006, TASK-015, TASK-029, TASK-031, TASK-032, TASK-049, TASK-050; TC-010, TC-015, TC-016, TC-018, TC-019, TC-022, TC-023, TC-029, TC-031, TC-032, TC-044, TC-045, TC-046, TC-047, TC-050, TC-051, TC-052, TC-053)

## Technical Context

| Item | Planned choice and source |
|---|---|
| Language and framework | Next.js App Router, strict TypeScript, Tailwind, Vitest, Playwright + axe; no new framework. (AGENTS.md; TASK-001, TASK-061) |
| Browser and server | Round 2 Vercel deploy + laptop DEMO_MODE=1 finale. The exact organiser cutoff/channel/formats remain UNKNOWN. (D2 Part B §12.1, §15; D6 §5; PHASE_4 AMD-4-1) |
| Storage boundary | Read-only consumption of the audit log and the contracts from features 001/002; no schema / role DTO / audit invariant change. (BR-009/010/012/013/020/024; TASK-015, TASK-061) |
| Interfaces | API-005 (parent edit), API-010 (decision, shared with feature 004), API-011 (close), API-013 (audit), API-016 (redaction), API-017 (verify officer), API-018 (parent status), API-020 (sign-in), API-021 (admin users). All D2A §5.5. (D2A §5.5) |
| AI and normalisation | None. This feature consumes upstream outputs. Provider accounts, models, prices, judges and devices remain UNKNOWN. (OQ-004, OQ-019, OQ-021, OQ-022, OQ-024, OQ-025, OQ-026) |
| Test framework | Vitest for case service commands (atomic confirm, close, redaction, verify), audit writer, denial hooks, sign-in form, not-found; Playwright + axe for sign-in journey and SCREEN-016. D6 sets the targets; the existing evidence files record per-lane pass / fail. (TASK-037, TASK-038; TC-010, TC-015, TC-016, TC-022, TC-052) |
| Performance targets | Re-close p95, audit read p95, sign-in p95, redaction p95 from D2 Part B §12.1. No measurement yet. (TASK-060; NFR-001–NFR-006) |
| Limits | Per-principal write limits (API-016 5/min, API-017 30/min, API-005 30/min, API-018 60/min) not from the spec pack (OD-032-4, OD-031-x); USD 25 atomic default spend cap; documented raise ≤ USD 30. (DECISION-017; PHASE_3 AMD-3-3) |
| Visual and accessibility rules | D3 screen behaviour, D4 interaction rules, DESIGN.md Paper theme and Fera overrides; **WCAG 2.2 AA, Bangla default, English toggle, Bangla numerals, ≥44 px targets, 320 CSS px reflow, 200 % text zoom, 400 % viewport zoom, icon + text + colour.** (FR-033; NFR-011, NFR-013; D4) |
| Scale | Three labelled demo cases in `--set demo`; D2's ten realistic concurrent demo users; an offline local stack at the finale. (FR-024, FR-027; BR-026) |

## Constitution Check

The constitution is a read-only draft. The V2 pack resolves wording differences. These checks assess this plan only; runtime compliance still needs evidence. (AGENTS.md; `.specify/memory/constitution.md`)

| Principle | Design check before research | Post-design check |
|---|---|---|
| I. Review before submit | No change; the desk consumes reviewed cases only. (BR-004/023) | Verified by reading the existing API-011 evidence; no new code path proposed here. |
| II. AI assists, unknown remains unknown | No new AI path; redaction is pseudonymisation, not legal anonymisation. (BR-008) | Verified by reading the existing redaction evidence. |
| III. Role visibility | Officer-only candidate projection, admin aggregate, parent own-case, staff own-found. (BR-007/024) | Verified by reading the existing API-005/011/016/017/018 evidence. |
| IV. Lifecycle | Case service one-transaction protocol is shared with feature 001 and is unchanged. (BR-012, BR-013, BR-020) | No new lifecycle state is proposed; the heldout freeze forbids post-freeze threshold / model / manifest change. |
| V. Audit and logs | `case.closed`, `case.edited`, `user.verification_changed`, `case.payload_redacted`, `access.denied` are append-only; no child payload in logs. (BR-009/010; NFR-010) | TC-028 log scan is added as a buildable task. |
| VI. Honest labels | SCREEN-013 redaction, verify and import panels carry visible synthetic / [MOCK] / পরিকল্পিত labels; SCREEN-008 sign-in shows the demo hint only when DEMO_MODE=1. (BR-022/026; FR-027/032) | `fera-safeguarding-reviewer` is the gate. |
| VII. Synthetic only | The audit log and the eligible-count for redaction are pseudonymised, not legally anonymised; the UI says so. (BR-026; FR-025) | No new fixture beyond the existing manifest + demo seed. |

**Gate result**: No design-level violation identified. This does not pass G2 or establish implementation compliance. The draft constitution remains unratified. (AMD-1-1; G2)

## Convergence Map (per D6 acceptance)

The plan below maps each of the seven user stories to its existing evidence and to the buildable / human / production / organiser gaps. Nothing in this plan claims a fact, date, hour, owner, account, figure, contact, interview, approval or completion that has no recorded evidence.

| Story | Existing evidence (this lane does not write the code) | Buildable gap in this lane | Human / production / organiser gap (out of scope) |
|---|---|---|---|
| US1 — confirm / refer / close (TASK-028, TASK-029) | `docs/execution/evidence/platform-case-service.md`, `src/server/case/decision.ts`, `src/server/case/close.ts`, `src/app/(desk)/officer/case/[id]/` | one-transaction protocol unit test, `coordination_recorded` / `resolved_outside_fera` unit test, re-close refusal test, non-officer refusal test. | none. |
| US2 — append-only audit (TASK-015) | `src/server/audit/write.ts`, `src/server/audit/denied.ts`, `src/app/api/_shared/` | audit append-only SQL-rejection unit test, contact-view unit test, denial unit test, audit-log page test (no free text, no child payload). | none. |
| US3 — admin redaction (TASK-032) | `docs/execution/evidence/platform-admin.md`, `src/server/admin/redact.ts`, `src/app/(desk)/admin/redaction-form.tsx`, `src/app/api/admin/anonymise/route.ts` | typed-confirmation word unit test, active-pair-skip unit test, redaction rate-limit unit test (5/min), non-admin refused unit test. | none. |
| US4 — verify-officers + synthetic import (TASK-032, TASK-048) | `src/app/(desk)/admin/verify-officers-form.tsx`, `src/app/api/admin/users/[id]/verify/route.ts`, `src/app/api/admin/users/route.ts` | admin users projection test (no phone / no email), verify-toggle idempotent test, forged-HMAC-cursor test, synthetic import 501 / E-019 test. | `TASK-048` (synthetic import, FR-024) is a planned extension; the lane only records it as 501 / E-019. |
| US5 — parent edit (TASK-049) | `src/server/case/commands.ts` (edit), `src/app/api/cases/[id]/outputs` (route, shared with feature 003), `src/app/(parent)/intake/review/` | parent edit version-snapshot unit test, void-pending-candidates unit test, terminal / redacted refused test (`E-018`), non-owner refused test. | `OD-049-1` (edit window / version cap). |
| US6 — parent status (TASK-050) | `src/app/api/my-case/` | parent projection unit test (no candidate detail, no other-party evidence), closed-case outcome projection unit test, non-owner refused test. | `OD-050-1` (redaction visibility for parents). |
| US7 — sign-in / not-found / page-denial (TASK-006, TASK-031) | `docs/execution/evidence/platform-signin.md`, `src/app/(auth)/sign-in/`, `src/app/not-found.tsx`, `src/app/components/not-found-screen.tsx`, `next.config.ts` | sign-in 320 / 200 % / 400 % reflow test, frame-ancestors header test, wrong-role page-denial test, denied-API request unit test. | `OD-031-1`, `OD-031-3`, `OD-031-7`. |

## Project Structure

### Documentation (this feature)

```text
specs/005-officer-workflow/
├── plan.md              # This file (Puku CLI 2026-10-18)
├── spec.md              # Generated 2026-10-18 by Puku CLI convergence desk
└── tasks.md             # Buildable task board (this plan)
```

### Source Code (no new application code in this feature)

```text
src/server/case/            # existing (shared case service); this plan adds no code
src/server/admin/           # existing; this plan adds no code
src/server/auth/            # existing; this plan adds no code
src/server/audit/           # existing; this plan adds no code
src/app/(auth)/sign-in/     # existing; this plan adds no code
src/app/(desk)/officer/case/# existing; this plan adds no code
src/app/(desk)/admin/       # existing; this plan adds no code
src/app/not-found.tsx       # existing; this plan adds no code
docs/execution/evidence/    # existing; this plan adds pre-main-convergence-desk.md
```

## Open Decisions (carried over from spec.md)

- OD-031-1, OD-031-3, OD-031-7, OD-032-3, OD-032-4, OD-032-7, OD-049-1, OD-050-1 are all UNKNOWN. This plan records them and does not invent values.

## Risks

- **RISK-A (high):** The case service / admin / sign-in / not-found code is owned by Mahim; this lane does not modify it. The plan handles this by separating "evidence" from "code" and appending only the missing buildable evidence.
- **RISK-B (medium):** A parent edit / status requires the routes API-005 and API-018 to be re-read end-to-end; the lane records the routes but does not run them. Owner runs the integration test.
- **RISK-C (low):** `OD-049-1` (parent edit window / version cap) and `OD-050-1` (parent status redaction visibility) are unowned. The plan records them; the parent edit / status fall back to a documented default with a TODO marker.

## Notes

- This plan **does not** mark any existing unchecked task as done. It appends new convergence tasks for the missing parts (one-transaction protocol test, audit append-only SQL-rejection test, eligible-count unit test, redaction rate-limit unit test, sign-in 320/200/400 reflow test, frame-ancestors test, etc.) and explicitly marks the human / production / organiser gaps as `human/organiser-blocked`.
- "Buildable" means "can be implemented, tested and merged by a lane without waiting on organiser or human evidence."
- All command and status claims below are real or marked UNVERIFIED; no inferred successes.

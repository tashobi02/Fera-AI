# Feature 001 research and decision record

**Date**: 2026-10-13 (Asia/Dhaka)

This is source consolidation for the plan, not evidence of a running application or a new technology evaluation. The V2 pack and AGENTS.md fix the choices below; no provider call, account check or external benchmark was performed.

## Decision 1: Fixed application and storage stack

**Decision**: Plan Next.js App Router, strict TypeScript, Tailwind, Zod, PostgreSQL 16 with pgvector via `pg`, and hand-written SQL. Auth.js credentials serve signed-in roles; parents use a scoped anonymous cookie. (AGENTS.md; D2 Part A §2/9; TASK-001/002/006)

**Rationale**: D2 Part A defines the V2 architecture and supplied schema, while AGENTS.md expressly rules out an ORM. One database supports case-state transactions, audit and candidate records. (D2 Part A §3/6/7)

**Alternatives considered**: An ORM or separate vector database is outside the fixed stack; no comparative implementation was run here. (AGENTS.md; D2 Part B DECISION-002)

## Decision 2: Exact schema on a fresh synthetic database

**Decision**: `db/schema_v2.sql`, when created by TASK-002, is an exact copy of `docs/code/schema_v2.sql` and is applied to fresh local and host PostgreSQL 16 environments. TASK-062 later verifies restricted runtime grants, lifecycle invariants and related-payload redaction. (D2 Part A §7.1; TC-062; AMD-1-1)

**Rationale**: The companion is the V2 schema contract; an unreviewed edit would split specification from runtime. The supplied script is not an idempotent live migration. (D2 Part A §7.1)

**Alternatives considered**: Applying it in place to an existing database or silently modifying a constraint is excluded by D2 Part A §7.1 and the all-owner frozen-schema rule. No database was touched in this lane.

## Decision 3: Server authority and role projections

**Decision**: A handler validates input, checks server-held principal and role, projects a per-role allowlist DTO and wraps errors. Staff and unverified officers receive found-only permissions; only active verified officers see candidate/other-party evidence or decide; admins receive metadata/aggregates. (BR-007/024; D2 Part A §5.3/5.4/9; TC-022/023/044)

**Rationale**: Browser-supplied role, owner, verification and synthetic claims are untrusted. Hidden and absent case reads share E-004 with a safe denied-access audit event. (D2 Part A §9.3; TC-052)

**Alternatives considered**: One unrestricted CaseView or client-side role filtering conflicts with BR-007/024 and the D2 Part A DTO contract; neither is part of this plan.

## Decision 4: Transactional case lifecycle

**Decision**: Case state changes use a typed case service and database guards. Confirm locks endpoints in sorted UUID order, rechecks authorisation and versions, updates the candidate and both reports, voids competitors, writes a simulated referral and safe audit in one transaction. (BR-012/013/020; D2 Part A §5.5/8; TC-010/029/032/046/053)

**Rationale**: One-to-one confirmation and stale-decision handling cannot tolerate partial state. Referral recorded (simulation) is an internal record, not receipt, custody or physical return. (BR-005/020)

**Alternatives considered**: Detached background promises for case matching and auto-confirmation are excluded by D2 Part A §5.5/8 and BR-001. No transaction was executed in this specs-only phase.

## Decision 5: UI authority and validation

**Decision**: `DESIGN.md` sets visual tokens; its Fera overrides set theme and Bangla type details, while D4 behaviour and D3 screen states remain authoritative. Use self-hosted Inter, JetBrains Mono and Noto Sans Bengali for the planned shell; keep font licences. (AGENTS.md token exception; DESIGN.md Fera overrides; D3 SCREEN-008/016; TASK-008/031)

**Rationale**: Parent screens require Bangla default, Bangla numerals, ≥44 px touch targets and neutral errors; desk screens use the Cockpit default. (FR-033; NFR-011; D4 §6–9)

**Alternatives considered**: D4 §6 visual tokens and `docs/code/tokens_v2.css` do not override the later explicit DESIGN.md token decision. Behaviour remains from D4. No UI was built or visually verified here.

## Decision 6: Evidence boundary and open hosting decision

**Decision**: OQ-021 managed database host remains **UNKNOWN**; TASK-002 is blocked by TASK-001. The project scripts are fail-fast stubs and cannot establish CI, schema, contract or screen completion. (Phase 0 tracker; D6 §5; AMD-1-1)

**Rationale**: The source documents name required evidence but do not supply a host choice, host schema run, main CI success or Android rendering result. (D2 Part B §15; TEAM_HANDOVER_V2 §3)

**Alternatives considered**: No host alternatives were evaluated in this specs-only lane. Selection requires owner and account evidence rather than an inferred provider.

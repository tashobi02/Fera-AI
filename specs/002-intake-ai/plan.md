# Implementation Plan: Parent intake and AI-assisted draft

**Branch**: phase1-specs--lane-a | **Date**: 2026-10-13 (Asia/Dhaka) | **Spec**: [spec.md](spec.md) | **Owner**: Obidit

**Input**: Feature 002 brief in docs/agents/SPECKIT_PROMPTS.md, the V2 pack and the human-approved Pause A. This is a design artifact; no runtime, provider or phone result is claimed.

## Summary

Plan SCREEN-001–003 parent intake: show notice, accept synthetic voice or text, return an editable evidence-backed draft, ask at most four single-field questions, preserve a device-held draft for review, and submit a confirmed payload once through the case service. A server-owned paid-call ledger, budget reservation and visibly labelled demo cache support the journey. The normaliser and extraction contract are test-first implementation work after their D6 prerequisites. (FR-001–007/026/027/031/033; BR-004/008/023; TASK-003/005/012–014/020–022/033/059/063)

## Technical Context

| Item | Planned choice and source |
|---|---|
| Language and framework | Next.js App Router, strict TypeScript, Tailwind and Zod; no app scaffold exists yet. (AGENTS.md; TASK-001/061) |
| Browser and server | Parent browser on a mid-range Android phone; Next.js route handlers on the Round 2 host and laptop DEMO_MODE=1 at finale. Exact organiser deployment cutoff is UNKNOWN. (D2 Part B §12.1; D6 TASK-005/053; TEAM_HANDOVER §10) |
| Storage boundary | Browser holds child draft and transcript before confirmation. PostgreSQL 16 stores pre-submit expiry/counter/hash/cost metadata, then the reviewed case via feature 001's case service. Hand-written SQL stays inside its owner module; no ORM or direct SQL in intake. (BR-004/023; D2 Part A §5.5; TASK-015/061) |
| Interfaces | docs/code/fera_types_v2.ts is the read-only companion; future src/contracts/ provides validated DTOs. API-001/002 belong to intake; API-003 delegates persistence to the case service. Auth uses the server-derived anonymous parent principal. (BR-007/024; D2 Part A §5.5; TASK-014/020/022/061) |
| AI and normalisation | MediaRecorder to speech adapter; provider-independent extraction adapter with Zod/evidence check, retry and fallback; deterministic COMP-008 normaliser; COMP-009 orchestrator. Provider accounts, actual models and prices are UNKNOWN pending TASK-003/OQ-004/OQ-022. (D2 Part A §2/§5.4; D6 §5) |
| Test framework | Vitest for normaliser, extraction contract, counter/concurrency and cache; Playwright with axe for notice/review/manual/phone journeys. These are planned, not run. D6 requires at least 30 normaliser cases. (D6 TASK-012/038; TC-001–004/017/021/031/036/042/043/060/061) |
| Performance targets | TC-001 transcript within 20 s after stop; TC-002 draft within 15 s; D2 Part B §12.1 also sets 120 s speech p95 ≤20 s and extraction p95 ≤15 s. No measurements yet. |
| Limits | Typed 20–2,000 characters; encoded audio ≤2 MB and verified 5–120 s; at most four questions and six dispatched paid calls per draft; 10/min principal and 30/min HMAC-network rate limits; default USD 25 atomic spend stop, documented increase ≤USD 30. (FR-001/002/005; BR-023; DECISION-017) |
| Visual and accessibility rules | D3 screen behavior and D4 interaction rules; DESIGN.md Paper theme and Fera overrides supply visual tokens. Bangla default, English toggle, Bangla numerals, ≥44 px targets. Future impeccable harden on SCREEN-002/003 follows UI implementation. (FR-033; COMP-022; NFR-011; AGENTS.md) |
| Scale | Three scripted synthetic cache cases and D2's ten realistic concurrent demo users are planning targets. No real personal data, scraped page, photo or exact coordinate is permitted. (FR-024/027; BR-026; D2 Part B §12.1; DEP-007) |

## Constitution Check

The constitution is a read-only draft. The V2 pack resolves wording differences. These checks assess this plan only; runtime compliance still needs evidence. (AGENTS.md; .specify/memory/constitution.md)

| Principle | Design check before research | Post-design check |
|---|---|---|
| I. Review before submit | Device-held child payload; notice before provider dispatch; only metadata server-side before API-003. (BR-004/023; TC-060) | Preserved in [data model](data-model.md) and [API boundary](contracts/intake-contract.md); TC-004/060 still unrun. |
| II. AI assists, unknown remains unknown | COMP-007/008 evidence spans and manual completion; no intake match decision. (BR-008; TC-027) | Source-bound transformation and four-round cap documented; tests pending. |
| III. Role visibility | Parent principal and owner DTO; API input validation, role guard, allowlist, error envelope. (BR-007/024) | Contract records order; runtime contracts TASK-061 blocked. |
| IV. Lifecycle | API-003 calls case service and scoped UUID idempotency. (FR-031; BR-012/015/016) | No direct SQL or separate case writer planned; route writer needs owner decision below. |
| V. Audit and logs | Per-call model/prompt version/latency/cost metadata, no child text or audio in logs. (BR-009; NFR-010; TASK-063) | Contract marks sensitive fields excluded; implementation pending. |
| VI. Honest labels | Explicit synthetic, [MOCK] and cached labels; measured metrics only. (BR-022/026; FR-027/032) | Quickstart checks labels and manual recovery; none measured yet. |
| VII. Synthetic only | Invented cases/fixtures; no images or real records. (FR-024; BR-026; DEP-007) | Cache and validation scenarios use synthetic fixtures; runtime pending. |

**Gate result**: No design-level violation identified. This does not pass G1 or establish implementation compliance. The draft constitution remains unratified. (AMD-1-1; G1)

## Project Structure

Documentation: spec.md, clarification-review.md, plan.md, research.md, data-model.md, contracts/intake-contract.md and quickstart.md in specs/002-intake-ai/. tasks.md is generated only after Pause B. (SPECKIT_PROMPTS feature 002)

Planned runtime paths, none created by this plan:

| Path | Purpose / D6 owner |
|---|---|
| src/contracts/ | Future TASK-061 boundary, Mahim |
| src/server/normalise/, ai/, speech/, intake/, spend/, cache/ | COMP-006–009/017 and TASK-012–014/020/033/059/063, Obidit |
| src/app/(parent)/ | SCREEN-001–003, TASK-021/022, Obidit |
| src/app/api/intake/ | API-001/002, TASK-014/020, Obidit |
| src/app/api/cases/ | API-003, TASK-022; route writer decision below |
| tests/ | Future Vitest and Playwright checks; no tests in this specs-only phase |

Feature 001 supplies contracts and case service; feature 003 supplies SCREEN-004 outputs and SCREEN-005 manual form. The demo fixture path requires alignment with D6 TASK-033 before implementation. (TASK-015/019/022/025/033/061; D6 §5/§6)

## Build order and handoffs

1. Provider account and verified prices TASK-003 precede Android STT spike TASK-005; district load TASK-009 precedes test-first normaliser TASK-012. TASK-003/TASK-009 have no completion evidence. (D6 §5; OQ-004/022)
2. TASK-013 follows TASK-003/012; TASK-014 follows TASK-005/007; TASK-020 follows TASK-013. Providers share one interface; every dispatched retry/fallback is counted before the call. (COMP-006–009; BR-023; D6 §5)
3. TASK-063 follows TASK-003/062; TASK-059 follows TASK-013/063. Atomic reservations precede paid dispatch and leave manual completion available on refusal. (DECISION-017; TC-036/043; D6 §5)
4. TASK-021 follows TASK-008/014/020; TASK-022 follows TASK-015/021. TASK-033 follows TASK-020/019. SCREEN-005 remains Mahim's TASK-025. (D6 §5)
5. Test-first work targets ≥30 normaliser cases and extraction/evidence contract checks; then phone and browser acceptance, followed by impeccable harden for SCREEN-002/003. No tests or UI are created in this phase. (TASK-012/013/021/022; TC-001–004/017/061)

**Owner decision at Pause B**: D6 §5 assigns TASK-022, which includes API-003, to Obidit. AGENTS.md assigns src/app/api/** to the owner of the matching server module, which for case persistence is Mahim. The route writer/review handoff is **UNKNOWN** until Obidit and Mahim settle it; the D6 task owner stays Obidit and no route is built now. (TASK-015/022; AGENTS.md ownership table)

## Complexity Tracking

No justified constitution exception is proposed. Operational unknowns and missing Phase 0 evidence are dependencies, not design exemptions. (AMD-1-1; TASK-001/003/009/061)

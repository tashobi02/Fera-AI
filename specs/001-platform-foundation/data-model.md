# Feature 001 data model

**Status**: Planned domain model only. The exact SQL definition remains `docs/code/schema_v2.sql` through D2 Part A §7; this file neither creates nor changes a database.

## Entities and relationships

| V2 entity | Fields and relationships relevant to feature 001 | Rule source |
|---|---|---|
| ENTITY-001 User | Staff, officer or admin role; active and officer-verified flags; authors found reports, decisions and safe audit. Seeded verification is [MOCK]. | FR-035/037; BR-001/024; D2 Part A §6/9 |
| ENTITY-002 ParentSession | Opaque anonymous parent principal with expiry/revocation; owns missing reports and intake metadata. Parent needs no account. | FR-037; BR-024; D2 Part A §9.4 |
| ENTITY-015 IntakeDraft | Principal, expiry, revision/hash and authoritative paid-call count only. No transcript, reviewed fields, child payload or audio. Parent device holds the draft until confirmation. | BR-004/023; TC-004/060 |
| ENTITY-003 Case | Stable UUID/reference, immutable missing/found kind, status/version, synthetic flag, owner, scoped submission UUID/hash, reviewed report fields, event interval, district and matching state. It is a report row, not a verified child identity. | BR-012–016/024/026; D2 Part A §6.2 |
| ENTITY-004 CaseVersion | Snapshot of a prior reviewed payload for an authorised versioned edit; related identifying history is cleared by eligible redaction. | BR-009/025; TC-049/050 |
| ENTITY-005 MatchCandidate | Missing/found report endpoints and their versions, pending/confirmed/rejected/voided/superseded status; at most one confirmed candidate per endpoint. Candidate data is officer-only. | BR-007/019/020; TC-029/044 |
| ENTITY-006 ReviewDecision | Active verified officer's confirm/reject action; reject reason 3–500 characters; confirm review checklist and expected endpoint versions. | BR-001/020/024; D2 Part A API-010; TC-046/048 |
| ENTITY-007 Referral | Internal simulated referral for the confirmed candidate and same missing/found endpoints. It records no delivery, receipt, custody or return. | BR-005/020; TC-010/047 |
| ENTITY-009 AuditEntry | Append-only safe actor/resource/action/version/time metadata, with nullable case reference for unknown-resource denial. No child names, phones, free text or provider payload. | BR-010; NFR-010/017; TC-016/051/052 |
| ENTITY-010 District | Internal code 1–64 with Bangla/English names. All rows, including zero-count districts, appear in aggregates after TASK-009. | BR-014/016; TASK-009; TC-012 |
| ENTITY-014 RateLimitBucket | Short-lived authoritative principal/network counters. Network key is HMAC-hashed; paid calls fail closed if limit state is unavailable. | BR-023; D2 Part B §10 |
| ENTITY-016/017 AiBudget and AiReservation | Global committed/reserved spend cap and per-dispatch upper-bound reservation/settlement; no child payload. Obidit's TASK-063 owns runtime paid-call logic. | BR-023; TASK-063; TC-043 |

Relationships: one parent session owns many missing cases and intake metadata rows; one user authors many found cases or decisions; each candidate joins one missing and one found case at recorded versions; at most one referral belongs to a confirmed candidate; case histories and safe audit remain linked after ordinary edits. Districts group report rows, while confirmed-pair counts come from confirmed candidates. (D2 Part A §6.3; BR-014/020)

## Submission validation and uniqueness

| Input | Constraint | Source |
|---|---|---|
| Missing report | Age or complete range 0–17; sex selection with explicit unknown allowed; district; non-empty last-seen place; event interval; reporter phone. Name optional. | BR-015/016; TC-030 |
| Found report | Description, district, place, event interval and staff contact; age may be unknown, or estimated bounds may extend to 25 to represent uncertainty. | BR-015/016; TC-039 |
| Event time | Store an instant with explicit Asia/Dhaka serialization. Exact time cannot be future; approximate bounds must agree with intake time. Ambiguous/future periods need review. | BR-016; FR-003; TC-030/040 |
| Phone | After digit normalization, 11 digits beginning 01; this is format checking, not ownership verification. | BR-016; TC-030 |
| District | Internal code 1–64; accessible manual selection when extraction cannot resolve it; not an official geocode. | BR-015/016; TASK-009 |
| Submission identifier | Unique within principal plus canonical reviewed-payload hash. Identical UUID/hash replay returns one stable case; changed payload conflicts; a new UUID is a separate report. | FR-031; D2 Part A API-003/007; TC-031/042 |
| Synthetic release | All accepted reports and seeds are invented and labelled synthetic; real public child import is disabled. No image, face, document or exact-coordinate input. | BR-006/026; FR-024; TC-026 |

Pre-submit metadata is not a persisted Case. The server may dispatch synthetic provider processing after notice, but stores no report payload until review and explicit confirmation. (BR-004/023; TC-004/060)

## State transitions

| Report kind | Allowed progression | Guard |
|---|---|---|
| Missing | Initial persisted `submitted` → `open`; `open` → `matched_pending_review` only with a qualified candidate; `matched_pending_review` → `open` when none remain; `matched_pending_review` → `confirmed` only in an authorised confirm transaction; `confirmed` → `closed` for `coordination_recorded`; `open` → `closed` for `resolved_outside_fera`. | BR-012; TC-032 |
| Found | Initial `open`; `open` ↔ `matched_pending_review`; `matched_pending_review` → `referred` only in the confirm transaction. `referred` is a coordination terminal timestamp and is labelled referral recorded (simulation). | BR-013; TC-032 |

Initial confirmed/closed insertion, backward transitions, terminal edits and two confirmed candidates sharing an endpoint are prohibited. Edit with expected version increments the report version, snapshots the old reviewed payload, voids pending candidates, reconciles affected queue states and schedules bounded reliable rematching. (BR-012/013/020/025; TC-029/032/049/053)

## Transaction, visibility, counts and redaction

Confirmation locks the two report UUIDs in sorted order, rechecks role, verification, versions and candidate eligibility, records a single decision, both states, competitor invalidation, simulated referral and safe audit atomically. Rejected or stale requests leave no partial decision/referral. (BR-001/020; D2 Part A API-010; TC-010/046/047/053)

The role views are explicit allowlists: parent own missing; staff own found; verified officer operational case/candidate; admin status/district/redaction metadata and aggregate only. Raw Case rows never leave the server. Hidden and absent reads return the same E-004 envelope and a safe denied-access audit event. (BR-007/024; D2 Part A §5.4/9; TC-022/044/045/052)

Counts use separate missing Open/Matched/Closed, found Open/Matched/Referral recorded and confirmed-pair categories. Each report remains a row even when duplicate-flagged; confirmed pairs count once, and totals are never called unique children. (BR-014; FV-10; TC-055)

Restricted redaction clears direct and related identifying payload only from eligible terminal reports; it retains active linked evidence and safe pseudonymous IDs/date/district. Retained metadata is not irreversibly anonymous. (BR-009/025; TC-015/050)

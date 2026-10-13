# Feature 001 interface contract

**Status**: Planned interface documentation for Pause B. This is not `src/contracts/`, an implemented API, a schema freeze or contract-validation evidence. The V2 pack and `docs/code/fera_types_v2.ts` govern field-level shapes; a disagreement must be recorded before runtime contracts are written. (TASK-061; D2 Part A §5.4; FV-01–FV-05)

## Shared HTTP boundary

All routes use `/api`, JSON/UTF-8 unless the V2 endpoint specifies otherwise, ISO 8601 times with `+06:00`, `x-request-id` on every response and `Cache-Control: no-store` on case data. Handlers validate input with Zod, derive the principal and role on the server, enforce ownership or verification, select an explicit role DTO allowlist and return the bilingual V2 error envelope on failure. Raw `Case` or database rows are never responses. (D2 Part A §5.1–5.4/9; BR-007/024; TASK-007/061)

`ErrorEnvelope` has `error.id`, `key`, `message_bn`, `message_en`, `retryable` and optional `fallback`. E-001–E-023 retain D2 Part A §5.2's keys and HTTP codes; E-022 is a client-only microphone state. E-024 is the client-only offline state in D3/Part B, so neither is assigned an invented HTTP status. Missing and hidden records use the same E-004 envelope, with a safe denial audit event; no raw stack, child payload or existence hint appears. (E-001–E-024; BR-007/010; TC-022/052)

## Required endpoints and views

| Interface | Request / authority | Allowed response and decisive rule | Source |
|---|---|---|---|
| API-003 `POST /api/cases` | `CreateMissingRequest`: reviewed missing `CaseDraft`, `confirmed: true`, `client_submission_id` UUID, optional `draft_token`; server-owned parent session | New 201 `OwnerCaseView`; identical scoped UUID/hash retry returns 200 with stable reference and `replayed: true`; different payload conflicts, with no second report. No server-held child payload before confirmation. | D2 Part A §5.5; FR-006/007/031; BR-004; TC-004/031/042/060 |
| API-004 `GET /api/cases/:id` | Server-authorised owner or operational role | Parent gets own `OwnerCaseView`; staff or unverified officer gets own `StaffOwnCaseView`; active verified officer gets `OfficerCaseView`; admin gets `AdminCaseView` metadata. Absent and hidden return E-004. | D2 Part A §5.5/9; BR-007/024; TC-022/044/045/052 |
| API-005 `PATCH /api/cases/:id` | Owning parent, reviewed confirmed draft and `expected_version` | `OwnerCaseView` at next version if still editable; terminal lock and stale version fail; old pending candidates are voided and rematching is queued/retried. This endpoint is Should priority. | D2 Part A §5.5; BR-025; TC-049 |
| API-007 `POST /api/found-cases` | Staff or officer, reviewed found draft, `confirmed: true`, scoped UUID; owner from session | `StaffOwnCaseView` and explicit matching state, without candidates. Same UUID/hash is idempotent; different payload conflicts. | D2 Part A §5.5; FR-011; TC-008/042 |
| API-010 `POST /api/candidates/:id/decision` | Active verified officer; `DecisionRequest` discriminates confirm and reject | `DecisionResponse` reports candidate/report states. Confirm requires two expected versions and the four true checklist fields in `fera_types_v2.ts`; reject needs a 3–500 character reason. Confirmation atomically records both states, competing-pair invalidation, simulated referral and audit. | D2 Part A §5.5; BR-001/005/020; TC-010/029/046/047/053 |
| API-011 `POST /api/cases/:id/close` | Active verified officer; outcome, reviewed 3–500 character note, expected version | Ref, closed status and coordination timestamp only. `coordination_recorded` requires confirmed pair and simulated referral; `resolved_outside_fera` requires an open missing report. Neither asserts return. | D2 Part A §5.5; BR-012/013; TC-010/032 |
| API-019 `GET /api/health` | Public | App version and readiness plus synthetic/demo mode only; no secrets or raw provider error. A future health response does not by itself prove G1. | D2 Part A §5.5; TASK-001 |
| API-020 `/api/auth/*` | Credentials for staff/officer/admin | 8-hour credential session; generic invalid-credential E-002 and rate-limited E-007. Active verified status is re-read for operational requests and decision transactions. | D2 Part A §5.5/9; BR-024; TC-023 |

The four role projections are separate allowlists from `fera_types_v2.ts`. Parent and staff views contain only their own editable draft where allowed and no candidate or other-party fields. Admin view contains case reference/status, district and redaction metadata, without child, contact, candidate or score fields. Verified officer view may contain operational evidence and contact under authorisation, but it is never put into logs. `CandidateDecisionView` is officer-only. Unverified officer has staff permissions. (BR-007/024; D2 Part A §5.4/9; TC-022/044/045)

## Case service called by other features

The following are planned typed service functions, with final signatures and Zod schemas to be derived in TASK-061 from D2 Part A/D5. They are not callable from this documentation branch. UI and feature modules must pass reviewed values through this boundary and may not write case SQL directly. (COMP-014/015; TASK-015/061)

| Function | Command boundary and result | Source |
|---|---|---|
| `createMissing` | Confirmed, validated missing draft, server principal and scoped UUID/hash → owner projection, stable replay behaviour, matching state. | API-003; BR-004/015/016; TC-031/042 |
| `createFound` | Confirmed, validated found draft, server user and scoped UUID/hash → staff-own projection, matching state. | API-007; BR-015/016; TC-008/042 |
| `open` | Persisted submitted missing report → open state with version and safe audit; initial found report is open. | BR-012/013; TC-032 |
| `transition` | Explicit legal state transition with current version and audit; qualified-candidate queue reconciliation only, never an automatic identity decision. | BR-001/012/013; TC-029/032 |
| `editWithVersion` | Owning parent's reviewed edit and expected version → next owner version, old snapshot, stale-candidate voiding, reconciliation and reliable rematch scheduling. | API-005; BR-025; TC-049/054 |
| `confirmPair` | Officer decision plus candidate and both expected versions → one atomic confirmation, report states, competitor invalidation, referral recorded (simulation) and safe audit. | API-010; BR-001/005/020; TC-010/046/047/053 |
| `close` | Verified officer, allowed outcome, reviewed note and expected version → missing report closed with coordination timestamp and safe audit. | API-011; BR-012/013; TC-032 |

All mutating functions use one transaction for their report mutation and successful-action audit. `confirmPair` locks both endpoint UUIDs in sorted order and rechecks live role, verification, versions and eligibility. Denied access is audited safely after any rollback, including unknown-resource denials with a nullable case FK. No child payload enters audit or application logs. (BR-010/020/024; TC-016/046/051/052/053)

## Shared semantics and pending checks

- The scoped submission UUID and canonical reviewed-payload hash provide race-safe idempotency. A new UUID is a new report; the same UUID with a changed payload is a conflict. Draft tokens bind a draft/principal/expiry, while paid-call counters remain server-owned. (FR-031; BR-023; API-003/007; TC-031/042/043)
- `referral_state: recorded` with `referral_is_simulated: true` means an internal referral record exists. The visible wording is **referral recorded (simulation)**. No delivery, receipt, custody or physical return is inferred. (BR-005/020; API-010; TC-047)
- Dashboard totals count separate missing-report rows, found-report rows and confirmed pairs. Zero-count districts remain present after TASK-009. A duplicate flag does not remove a report row, and no number is called unique children. (BR-014; FV-10; TC-012/055)
- Runtime TASK-061 must validate DTO examples and projections against BR-004/015/016/020/023/024 and TC-030/042–046/060. FV-01–FV-05 and FV-10 remain **open** until runtime contracts and integration evidence address them; this document is a design map only. (TEAM_HANDOVER_V2 §3; TASK-061)

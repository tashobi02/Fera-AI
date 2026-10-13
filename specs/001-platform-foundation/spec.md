# Feature Specification: Platform foundation

**Feature Branch**: `phase1-specs--lane-a`

**Created**: 2026-10-13 (Asia/Dhaka)

**Status**: Draft for human skim; specification only

**Input**: Feature 001 brief in `docs/agents/SPECKIT_PROMPTS.md`
**Owner**: Mahim (called Sadman in the V2 pack)

This feature defines the shared account, case, permission, lifecycle, audit, error and navigation behaviour consumed by the other Fera features. IDs below retain their V2 meanings. This specification is a target, not evidence that the app, database, contracts or checks exist.

## User Scenarios & Testing *(mandatory)*

All four stories support V2 Must behaviour. P1 reflects that source classification, not a new ordering among them.

### User Story 1 - Enter the appropriate workspace (Priority: P1)

A staff member, verified officer or admin signs in and reaches the workspace permitted by their role. A parent starts without an account and can access only their own report. An officer whose verification flag is false has staff permissions only. (STORY-008, STORY-009; FR-020, FR-035, FR-037; BR-007, BR-024; SCREEN-008, SCREEN-016)

**Why this priority**: Candidate evidence and decisions must remain available only to active verified officers. (BR-001, BR-007)

**Independent Test**: Use synthetic role accounts and a parent session to exercise sign-in, permitted own-case reads, candidate requests and decision requests; check TC-022, TC-023, TC-044 and TC-052 without relying on matching quality.

**Acceptance Scenarios**:

1. **Given** a staff or unverified-officer account, **when** it requests candidate evidence or a decision, **then** access is refused and no candidate or other-party payload appears. (FR-020, FR-035; BR-007, BR-024; TC-022, TC-023)
2. **Given** an active verified officer, **when** that officer opens an authorised operational case, **then** the officer-only view is available; an admin receives metadata and aggregates without candidate IDs, scores or child payload. (BR-007, BR-024; TC-044)
3. **Given** an absent or hidden case, **when** a signed-in user requests it, **then** the same not-found response appears and a safe denied-access audit event is recorded without disclosing whether the case exists. (BR-007, BR-010; SCREEN-016; TC-022, TC-052)
4. **Given** an expired credential session, **when** the user requests a protected screen, **then** sign-in is requested and the intended URL can be resumed after authentication. (SCREEN-008; E-002)

---

### User Story 2 - Preserve only a reviewed report (Priority: P1)

A parent reviews and confirms a synthetic missing report before a case is persisted. The shared case boundary applies the V2 required-field rules and returns the same case for an identical submission retry. Staff use the corresponding reviewed found-report path. (STORY-004, STORY-008; FR-006, FR-007, FR-011, FR-031; BR-004, BR-015, BR-016)

**Why this priority**: Review, ownership and idempotency protect the case record used by later workflows. (BR-004, BR-024)

**Independent Test**: With synthetic inputs, inspect pre-submit storage, submit once, replay the same scoped UUID concurrently and attempt a changed-payload replay; check TC-004, TC-030, TC-031, TC-042 and TC-060.

**Acceptance Scenarios**:

1. **Given** a device-held missing-report draft after provider notice, **when** the parent has not confirmed it, **then** the server stores metadata only and no case payload is matched, exported or shown to another party. (BR-004, BR-023; TC-004, TC-060)
2. **Given** reviewed fields meeting BR-015/016, **when** the parent confirms, **then** the persisted case reflects those reviewed values; missing or ambiguous required fields cannot be guessed to unblock submission. (FR-006, FR-007; BR-008, BR-015, BR-016; TC-004, TC-030)
3. **Given** the same principal and submission UUID, **when** the identical reviewed payload is retried concurrently, **then** one case and a stable reference result; a changed payload conflicts without creating a second case. (FR-031; TC-031, TC-042)
4. **Given** a case read, **when** a parent, staff member, verified officer or admin requests it, **then** the result contains only that role's allowed fields. (BR-007, BR-024; TC-022, TC-044, TC-045)

---

### User Story 3 - Record an officer decision and coordination outcome (Priority: P1)

An active verified officer records a decision on current candidate evidence, with both report states, a simulated referral record and safe audit committed together. An authorised officer can then close a missing report with a V2 coordination outcome. (STORY-010, STORY-012, STORY-017; FR-016, FR-018, FR-021; BR-001, BR-005, BR-012, BR-013, BR-020)

**Why this priority**: The officer's decision is the sole authority for confirmation; partial or stale decisions would make both case histories misleading. (BR-001, BR-020)

**Independent Test**: Use synthetic cases to confirm once, race a competing decision, attempt an illegal state jump, then inspect referral, states and append-only audit; check TC-010, TC-016, TC-029, TC-032, TC-046, TC-047, TC-051 and TC-053.

**Acceptance Scenarios**:

1. **Given** a current candidate and active verified officer, **when** the officer confirms after review, **then** one confirmed pair, the missing confirmed state, the found referred state, a referral recorded (simulation) and safe audit are committed together; competitors are voided and affected states reconciled. (FR-016; BR-005, BR-020; TC-010, TC-029, TC-053)
2. **Given** stale endpoint versions or revoked verification, **when** confirmation is attempted, **then** it conflicts without a new decision, referral or partial state change. (BR-001, BR-020, BR-024; TC-023, TC-046)
3. **Given** a confirmed pair and simulated referral, **when** an authorised officer closes the missing report as coordination_recorded, **then** closure and audit are recorded; resolved_outside_fera is allowed only from open. Neither outcome claims a physical return. (FR-018; BR-012, BR-013; TC-010, TC-032)
4. **Given** a decision, edit, state change, redaction or denied access, **when** its audit record is written, **then** safe event metadata remains append-only without child payload. (FR-021; BR-010; TC-016, TC-051, TC-052)

---

### User Story 4 - Navigate and recover in the chosen language (Priority: P1)

A parent sees Bangla by default and can switch to English on every screen. Desk users have the same language control. Sign-in and hidden-record screens show the V2 loading, error and recovery states. (FR-033; SCREEN-008, SCREEN-016; COMP-022, COMP-045, COMP-047)

**Why this priority**: The common shell and error screens must remain understandable before the feature screens are added. (D4 §2, §8; NFR-011)

**Independent Test**: Inspect both languages on the shared header and SCREEN-008/016, including Bangla glyphs on one Android phone, 320 CSS px reflow, 200% text zoom and keyboard focus; check TASK-008, TC-002, TC-033 and TC-058.

**Acceptance Scenarios**:

1. **Given** a parent screen in its initial state, **when** it opens, **then** Bangla is selected and the English toggle is available; Bangla numerals render in Bangla mode. (FR-033; COMP-022; TC-002)
2. **Given** SCREEN-008, **when** credentials are submitted, **then** a loading state appears and an invalid sign-in returns the specified bilingual recovery text without exposing which credential failed. (SCREEN-008; E-002, E-007)
3. **Given** SCREEN-016, **when** an absent or hidden record is encountered, **then** the not-found heading receives focus and a home action is available. (SCREEN-016; E-004; COMP-045)
4. **Given** a synthetic or mock item, **when** it appears, **then** its synthetic, [MOCK], cached or simulation status remains visible as applicable. (BR-026; COMP-023; DESIGN.md Fera overrides)

### Edge Cases

- A client-supplied owner ID or verification claim grants no authority. (BR-024; D2 Part A §9)
- Unknown fields stay unknown; a missing district, invalid phone, inconsistent age or future event interval yields a field error or manual review. (BR-008, BR-015, BR-016; TC-030)
- Matching failure after accepted submission leaves a saved report with explicit queued or failed matching state and a reliable retry path. (TC-054; D2 Part A §8)
- Routine terminal edits are rejected. Eligible payload redaction is separate and preserves active linked evidence. (BR-009, BR-025; TC-049, TC-050)
- Invalid transitions, stale decisions and second confirmations fail without partial results. (BR-012, BR-013, BR-020; TC-029, TC-032, TC-046)
- Refused paid processing or unavailable limit state leaves manual intake available. (BR-023; TC-036, TC-043)

## Requirements *(mandatory)*

### Scope and boundaries

Feature 001 owns the shared foundation mapped to TASK-001, TASK-002, TASK-006, TASK-007, TASK-008, TASK-015, TASK-031, TASK-061 and TASK-062 in D6 §5. Parent intake, matching, staff entry, dashboard and admin screens consume this foundation in features 002–006. This release accepts invented synthetic records only. It has no photo, face, ID-document, exact-coordinate, alert, rescue, physical-return or police-system integration path. (BR-002, BR-006, BR-026; FR-024)

### Functional Requirements

- **FR-037, FR-035, BR-024**: Staff, officers and admins must sign in with server-checked roles; parents need no account; only active verified officers can perform officer actions. Seeded verification is labelled [MOCK]. (STORY-008, STORY-009; SCREEN-008; TC-023)
- **FR-020, BR-007**: Every case and candidate read must use an explicit role and ownership projection. Parents see their own missing payload/status, staff their own found payload/status, active verified officers operational evidence, and admins aggregate/redacted metadata only. Hidden and absent records have the same response. (TC-022, TC-044, TC-045, TC-052)
- **FR-006, FR-007, FR-031, BR-004**: The shared case boundary must accept only explicitly confirmed, validated reviewed reports; keep pre-submit child payload off the server; and enforce scoped UUID plus payload-hash idempotency. (STORY-004; TC-004, TC-031, TC-042, TC-060)
- **FR-011, BR-015, BR-016**: Missing and found submissions must enforce their distinct required fields, ranges, phone and event-time rules. Name and found age can remain unknown where V2 permits. (STORY-008; TC-008, TC-030)
- **FR-016, FR-018, BR-012, BR-013, BR-020**: Only the case service may advance report states. Confirmation is atomic across both reports, the candidate, simulated referral, competitor invalidation and audit; closure records only a coordination outcome. (TC-010, TC-029, TC-032, TC-046, TC-047, TC-053)
- **FR-021, BR-010**: Decisions, state changes, edits, redactions and denied access create safe append-only audit events. Neither logs nor audit include child names, phone numbers or free text. (NFR-010, NFR-017; TC-016, TC-028, TC-051, TC-052)
- **FR-025, BR-009, BR-025**: Terminal payload redaction clears direct and related identifiers while retaining active linked evidence; ordinary terminal edits are rejected. (TC-015, TC-049, TC-050)
- **FR-019, BR-014**: Shared count semantics distinguish missing-report rows, found-report rows and confirmed pairs; no count is labelled as unique children. (FV-10; TC-012, TC-055)
- **FR-033, COMP-022**: The shell provides a Bangla/English toggle on every screen, with Bangla as the parent default and bilingual status/recovery states. (SCREEN-008, SCREEN-016; TC-002, TC-033, TC-058)
- **BR-023**: Shared limits and draft metadata are authoritative and scoped without child payload; paid-call refusal preserves manual completion. (TC-043, TC-060)
- **BR-026**: Only synthetic records enter this prototype; synthetic, [MOCK], cached, planned and simulation labels remain visible where applicable. (FR-032; TC-021)
- **D2 Part A §5.1–5.2**: Server errors expose the specified bilingual envelope and request ID without raw rows or stack traces. E-022 and E-024 are client-only states, not invented HTTP errors. (TASK-007; E-001–E-024)

### Key Entities

- **User and ParentSession**: Staff/officer/admin account with server-held role and verification, or revocable anonymous parent identity bound to own cases. (ENTITY-001, ENTITY-002; BR-024)
- **IntakeDraft**: Pre-submit principal, expiry, hash and usage metadata without child payload. (ENTITY-015; BR-004, BR-023)
- **Case and CaseVersion**: Reviewed synthetic missing or found report, current status/version and edit history. (ENTITY-003, ENTITY-004; BR-012, BR-013, BR-025)
- **MatchCandidate, ReviewDecision and Referral**: Versioned candidate pair, officer decision and simulated referral record; referral does not indicate delivery. (ENTITY-005–ENTITY-007; BR-001, BR-005, BR-020)
- **AuditEntry**: Safe append-only action record retained through redaction. (ENTITY-009; BR-010)
- **District and district counts**: Internal district code and separate report-row/pair aggregates; 64 rows including zeros are a later data dependency. (ENTITY-010; BR-014; TASK-009)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: TC-022/023/044/052 refuse every unauthorised candidate/other-party access or decision without restricted-field disclosure, while permitted role views remain usable. (FR-020, FR-035, FR-037)
- **SC-002**: Concurrent identical retries using one scoped submission UUID create exactly one report and return one stable reference; a changed payload conflicts. (FR-031; TC-031, TC-042)
- **SC-003**: TC-010/029/032/046/047/053 show one valid confirmed pair and simulated referral, no partial result on stale or illegal requests, and prescribed states for affected reports. (FR-016, FR-018; BR-020)
- **SC-004**: TC-016/051/052 show required audit events, rejected audit-history mutation and safe audit after denied unknown-resource access. (FR-021; BR-010; NFR-017)
- **SC-005**: TC-030 rejects its four invalid field examples with field paths; no unknown is filled by a guess. (BR-015, BR-016)
- **SC-006**: SCREEN-008/016 and the language toggle display Bangla and English, with Bangla glyphs verified on one Android phone; Must screens reflow at 320 CSS px and support 200% text zoom. (FR-033; TASK-008; NFR-011; TC-033, TC-058)
- **SC-007**: A maintainer can recreate a working synthetic setup from the documented instructions within the 15-minute working target. This is an acceptance target, not an achieved result. (TASK-001, TASK-002; NFR-014; D2 Part B §15.2)

## Assumptions, dependencies and open decisions

- Only invented fixtures are authorised: no real child/parent data, scraped public page or public-child import. (FR-024; BR-026; DEP-007 as corrected in AUDIT F11)
- The exact supplied V2 schema is the planned runtime copy. Schema and contracts freeze only after evidence-backed review and merge; TASK-062 retains later runtime-privilege and invariant checks. (TASK-002, TASK-061, TASK-062; AMD-1-1)
- TASK-001 is not done. TASK-002, TASK-007, TASK-008 and TASK-061 depend on it; TASK-006 depends on TASK-002. TASK-062 depends on TASK-002 and TASK-061; TASK-015 on TASK-007, TASK-061 and TASK-062; TASK-031 on TASK-006. These are D6 planning dependencies, not completion claims. (D6 §5)
- Managed database host choice OQ-021 is UNKNOWN. CI, local/host schema application, contract merge/tag and Android phone rendering have no evidence in this specs-only lane. (TASK-001, TASK-002, TASK-008, TASK-061)
- FV-01–FV-05 and FV-10 list V2 corrections but still require the runtime evidence in TEAM_HANDOVER_V2 §3; this specification does not close them.
- The constitution remains a draft awaiting all-owner ratification; its safeguards still govern this specification. (`.specify/memory/constitution.md`)

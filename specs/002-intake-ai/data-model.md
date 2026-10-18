# Feature 002 data model and state boundaries

**Source**: D2 Part A §2/§5.4–5.5, docs/code/fera_types_v2.ts, D1 BR-004/008/015/016/023/024 and D6 §5. This documents planned boundaries, not a migration or database implementation.

| Object | Fields and relationships | Validation / visibility |
|---|---|---|
| ParentSession, ENTITY-002 | Opaque ID, timestamps and revocation; owns intake metadata and, after submission, missing reports. | Server derives principal from anonymous cookie; no account required. Parent views only own reports. (BR-007/024; API-001–003) |
| Device-held CaseDraft | Kind, reviewed source text, child/event/reporter fields, district code, source evidence and explicit unknowns; coupled to local transcript and submission UUID. | Never persists child payload server-side before confirmation. Corrected values win over extraction. Required fields follow BR-015/016. (FR-004/006/007/031; TC-004/060) |
| EvidenceSpan | Quote, UTF-16 start/end in reviewed raw text, derivation type: direct, digits, time_interval, district_mapping or romanisation. | Each extracted/derived value points to a valid source span. Unsupported or ambiguous values remain unknown. (BR-008; COMP-007/008; TC-027) |
| IntakeDraft, ENTITY-015 | Draft UUID, principal, kind, creation/expiry, payload hash, server-owned call count and revision. | Metadata only; opaque token binds owner/revision/expiry but does not authoritatively count calls. Reject foreign/expired/replayed updates. 24 h metadata expiry. (BR-004/023; FV-05; TC-043/060) |
| AiBudget, ENTITY-016 | Global cap, committed and reserved USD. | Default stop USD 25; reviewed increase ≤USD 30. No paid dispatch without atomic upper-bound reservation. (DECISION-017; BR-023; TC-036) |
| AiReservation, ENTITY-017 | UUID, draft, reserved/actual USD, reserved/settled state and timestamps. | One reservation per paid dispatch, including retries/fallback. Unknown settlement is not silently refunded. Logs hold metadata, not child text. (BR-023; TASK-063) |
| Demo cache fixture, COMP-017 | One of three scripted synthetic cases; key from SHA-256 of normalised text or protected audio fixture ID; transcript/extraction output and cached=true. | Protected DEMO_MODE only; every hit visibly labelled synthetic/cached; offline miss returns explicit unavailable/manual state; excluded from quality metrics. (FR-027/032; TC-021/056) |
| Case, ENTITY-003 | Reviewed missing report and owner-scoped reference after API-003. | Created only after confirmed=true; identical principal+UUID+payload hash returns stable result, changed payload conflicts. Case service owns persistence and lifecycle; parent never receives a raw row. (FR-031; BR-004/024; TC-004/031/042) |

## State transitions

1. **Notice to capture**: prior to notice, no synthetic audio/text provider dispatch. SCREEN-002 accepts typed text or bounded audio; transcript remains editable. (BR-004; FR-001/002; TC-001/060/061)
2. **Capture to device draft**: COMP-008 normalises supported tokens; COMP-007 validates extraction and spans; COMP-009 merges answers without guessing. Server holds only IntakeDraft and spend metadata. (BR-004/008/023; TC-002/027/060)
3. **Draft to question or manual**: ask one question per unresolved mandatory field for at most four rounds. After limit, errors or paid refusal, preserve known values and open SCREEN-005. (FR-005/026; BR-015; TC-003/017/036)
4. **Draft to reviewed to submitted**: SCREEN-003 exposes edits/unknowns; explicit checkbox and scoped UUID are required. API-003 invokes the case service once and returns OwnerCaseView with reference/matching state. SCREEN-004 is a separate feature handoff. (FR-006/007/031; BR-004/024; TC-004/031/042/054)

No table, schema or runtime contract is created here. src/contracts/ and db/schema_v2.sql remain blocked Phase 1 build items; the D2/types companion is read-only. (TASK-001/002/061; AMD-1-1)

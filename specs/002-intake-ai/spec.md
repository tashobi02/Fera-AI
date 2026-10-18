# Feature Specification: Parent intake and AI-assisted draft

**Feature Branch**: `phase1-specs--lane-a`

**Created**: 2026-10-13 (Asia/Dhaka)

**Status**: Draft for human skim; specification only

**Input**: Feature 002 brief in `docs/agents/SPECKIT_PROMPTS.md` and the V2 spec pack
**Owner**: Obidit

This feature covers synthetic parent intake from welcome notice through voice/text capture, extracted draft, one-at-a-time follow-up, device-local review and confirmed submission. It also defines the paid-call limit and visibly labelled demo-cache behavior. It is a target, not evidence that a provider, Android recorder, case route, cache, budget or app exists. (STORY-001–STORY-004, STORY-018, STORY-023; SCREEN-001–SCREEN-003; FR-001–FR-007, FR-026/027/031/033; TASK-003/005/012/013/014/020/021/022/033/059/063)

## User Scenarios & Testing *(mandatory)*

All four stories serve V2 Must behavior. P1 follows source priority; it does not add a new priority ordering among them.

### User Story 1 - Start a synthetic report by voice or text (Priority: P1)

A parent opens SCREEN-001, sees the provider-processing notice before any voice/text is sent, then records a short note or types a report on SCREEN-002. Speech returns an editable Bangla transcript; typing stays available when the microphone, network or speech service fails. The parent has no account. (STORY-001/002; FR-001/002/033; BR-004/023/024; SCREEN-001/002; COMP-025/026/050)

**Why this priority**: Intake must stay accessible on a mid-range Android phone while the parent controls what the system understood. (GOAL-001; NFR-011; TC-001/002)

**Independent Test**: With invented synthetic audio and text, exercise the notice, a 38-second recording, editable transcript, unsupported microphone and network interruption without relying on extraction or case submission. Check TC-001, TC-060 and TC-061.

**Acceptance Scenarios**:

1. **Given** a first visit, **when** the parent opens SCREEN-001, **then** the notice states that a provider may process synthetic audio/text before report confirmation and the language toggle is available; no child payload has been sent. (BR-004; SCREEN-001; COMP-022/050; TC-060)
2. **Given** microphone permission and a 5–120-second note within the 2 MB encoded limit, **when** the parent records and stops, **then** an editable Bangla transcript appears with a visible recording state and timer. (FR-002; BR-023; SCREEN-002; COMP-025/026; TC-001/061)
3. **Given** no microphone permission, unsupported recording or offline upload, **when** the parent continues, **then** the text path remains usable and the device retains the draft for retry without claiming a server save. (SCREEN-002; E-022/024; ACT-031)
4. **Given** 20–2,000 characters of Bangla, English or mixed text, **when** the parent submits it for extraction after the notice, **then** the text is accepted for a draft; invalid length receives a field error. (FR-001; BR-023; API-002; E-001)

---

### User Story 2 - Review an evidence-backed draft and answer missing fields (Priority: P1)

The parent sees extracted values with their source evidence, corrects them, and answers at most four one-at-a-time questions. Bangla digits and supported time words are normalised against the recorded intake clock. District aliases come from the 64-district source; unresolved or ambiguous values remain visibly unknown and are completed manually. (STORY-002/003; FR-003/004/005; BR-008/015/016; COMP-007/008/009; SCREEN-002)

**Why this priority**: The assistant may organise supplied words but cannot fill missing identity, time or location fields by guessing. (BR-008; TC-002/003/027)

**Independent Test**: With the synthetic TC-002 mixed-script fixture and a fixed intake clock, inspect each value and source span, the explicit approximate time interval, empty district and the next district question; answer it and verify TC-003 without needing voice capture.

**Acceptance Scenarios**:

1. **Given** the supported TC-002 text and fixed intake clock, **when** it is extracted, **then** the draft has the specified age, sex, phone and approximate yesterday-afternoon Asia/Dhaka interval, while district stays unknown until supplied. No unsupported time or romanisation format is inferred. (FR-003/004; BR-008/016; TC-002)
2. **Given** an extracted or deterministically derived value, **when** the parent opens review, **then** its source span refers to the reviewed text; values without supported evidence are unknown. (BR-008; COMP-007/008; TC-027/060)
3. **Given** one missing mandatory district, **when** the assistant asks the D3 district question and the parent answers with the TC-003 place, **then** exactly one question is asked and the district is selected from the internal district list. (FR-005; BR-015; COMP-009; TC-003)
4. **Given** four follow-up rounds or unresolved mandatory fields, **when** questions cannot finish the draft, **then** an accessible manual completion path opens with existing answers preserved. (FR-005/026; BR-015/023; SCREEN-005; TC-017)

---

### User Story 3 - Confirm the reviewed report exactly once (Priority: P1)

SCREEN-003 shows every field as editable, including explicit unknowns. The parent changes any extracted value, checks “I have checked,” and submits one synthetic missing report. Before that explicit confirmation, the server holds metadata only: no child case payload is persisted, matched, exported or shown to another party. (STORY-004; FR-006/007/031; BR-004; SCREEN-003; COMP-028/029)

**Why this priority**: Review before submit and scoped idempotency keep the persisted report aligned with the parent's corrected account. (BR-004; TC-004/031/042/060)

**Independent Test**: Seed a device-held synthetic draft, inspect server case rows and officer queue before submit, edit clothing, check confirmation, submit, then concurrently replay the same UUID and a changed payload. Check TC-004, TC-031, TC-042 and TC-060.

**Acceptance Scenarios**:

1. **Given** an unconfirmed browser draft, **when** the parent reviews or edits it, **then** the server may hold expiry/counter/hash/cost metadata but has zero child case rows and no matching or other-party exposure. Provider processing occurs only after the notice. (BR-004/023; TC-004/060)
2. **Given** all BR-015/016 mandatory fields are reviewed, **when** the parent checks the explicit confirmation and submits, **then** the saved report reflects the parent's edited values, returns an owner-scoped reference and explicit matching state, and moves to SCREEN-004. (FR-006/007; BR-015/016; API-003; TC-004/030/054)
3. **Given** one principal and submission UUID, **when** the identical reviewed payload is retried concurrently, **then** one report and stable reference result; the same UUID with changed payload conflicts and a new UUID remains a separate report. (FR-031; API-003; TC-031/042)
4. **Given** an unknown, inconsistent or missing required value, **when** submission is attempted, **then** a field-level error identifies it; the assistant does not guess a field to enable submit. (BR-008/015/016; E-001; TC-030)

---

### User Story 4 - Continue safely when AI is unavailable or cached (Priority: P1)

If extraction fails twice, a provider is unavailable, a paid-call limit is reached or the budget is exhausted, the parent can continue through the pre-filled manual form. In a separately labelled demo mode, three scripted synthetic inputs may use cached transcripts/extractions while offline; every cached result displays its badge and is excluded from quality metrics. (STORY-018/023; FR-026/027; BR-023/026; SCREEN-002/005; COMP-017/048)

**Why this priority**: A failed paid service must not strand the reporter or make a cached demo look live. (TC-017/021/036/043)

**Independent Test**: With invented fixture input, force two extraction failures, budget refusal, replayed draft token and offline cache hit/miss; inspect manual access, authoritative call count and visible cached/synthetic labels without paying a provider.

**Acceptance Scenarios**:

1. **Given** two invalid extraction attempts or an unavailable AI service, **when** the parent continues, **then** the manual form opens with existing text/draft values and no repeated entry. (FR-026; SCREEN-005; E-012/013; TC-017)
2. **Given** six dispatched paid calls for one draft or an unavailable limit/budget store, **when** another paid call is requested, **then** it is refused, the authoritative count cannot be reset by draft replay, and manual completion remains available. (BR-023; E-023; TC-036/043)
3. **Given** an offline scripted demo input with a stored synthetic result, **when** the cache returns it, **then** the UI displays “ক্যাশ” / cached and “সিনথেটিক” / synthetic, and no quality metric treats it as a live model result. (FR-027/032; BR-026; COMP-048; TC-021/056)
4. **Given** a cache miss while offline, **when** no provider can answer, **then** a visible unavailable state and manual path appear; no fabricated transcript or extraction is shown. (COMP-017; E-011/013; FR-026)

### Edge Cases

- Audio duration and encoded size are checked together on the server. A too-large or out-of-range note receives E-008/E-009, and an unintelligible transcript receives E-010 without silently creating a draft. (BR-023; API-001; TC-061)
- An unsupported microphone or denied permission produces client-only E-022 and focuses the text path; E-024 offline keeps browser-held draft/audio for retry. (SCREEN-002; D3 §7)
- A foreign, expired or replayed draft revision does not reset authoritative paid-call count; draft metadata expires after 24 hours and parent session after 30 days. Device expiry is checked on access, not promised as physical deletion. (BR-023; API-002; E-019; TC-043)
- An ambiguous or future time, unsupported district alias, invalid phone or age outside the missing-report range remains for review/manual correction. A district code is an internal 1–64 identifier, not an official geocode. (FR-003; BR-008/015/016; TC-030)
- The demo cache is limited to the scripted synthetic cases and must be visibly labelled; cache misses do not silently become live results, and caches/fixtures do not enter evaluation metrics. (FR-027; BR-026; TC-021/056)

## Requirements *(mandatory)*

### Scope and boundaries

D6 §5 maps feature 002 to TASK-003, TASK-005, TASK-012, TASK-013, TASK-014, TASK-020, TASK-021, TASK-022, TASK-033, TASK-059 and TASK-063, all owned by Obidit. TASK-012 depends on Masnun's TASK-009 district data and is **blocked** until those aliases exist. This specs-only lane creates no provider configuration, normaliser, server code, seed, tests or paid calls. SCREEN-005 manual form is feature 003/TASK-025 and owned by Mahim; the feature 002 handoff preserves the draft and opens that form. (D6 §5; AMD-1-1)

Only invented synthetic records and recordings are allowed. No real child or parent data, scraped public page, photo, face, identity document, exact coordinate, alert, rescue, physical return or police-system integration path is in scope. A score elsewhere in Fera is similarity, never identity probability; this intake feature does not decide a match. (FR-024; BR-001/002/003/006/026; DEP-007 as corrected in AUDIT)

### Functional Requirements

- **FR-001, FR-002, BR-023**: Accept 20–2,000-character Bangla/English/mixed typed input and 5–120-second voice notes up to 2 MB encoded, with server duration/codec checks and an editable Bangla transcript. Text remains available without a microphone. (SCREEN-002; API-001/002; TC-001/002/061)
- **BR-004, TC-060**: Show provider-processing notice before synthetic audio/text dispatch; keep the unconfirmed child payload on the device and server pre-submit state to expiry/counter/hash/cost metadata only. No case row, matching, other-party view or export occurs until review and confirmation. (SCREEN-001/003; COMP-050; FR-006/007)
- **FR-003, COMP-008**: Normalise supported Bangla digits, time words, phones, district aliases and romanisation deterministically; anchor relative time to the recorded intake clock and retain explicit Asia/Dhaka bounds/source spans. Unknown or unsupported tokens stay unknown. District aliases come from TASK-009; no new format is assumed. (BR-008/016; TC-002/030)
- **FR-004, BR-008**: Extract only specified case fields from source text through a provider-independent, validated contract with evidence spans, retry/fallback and no guessed values. Two invalid outputs or unavailable providers lead to manual completion; logs exclude child text. (COMP-007; API-002; TC-002/017/027/028)
- **FR-005, FR-026, BR-015**: Ask one D3 template question per missing mandatory field, at most four rounds, then use the pre-filled accessible manual path. Name and found age may remain unknown where V2 allows; missing district and other BR-015 fields cannot. (COMP-009; SCREEN-002/005; TC-003/017/030)
- **FR-006, FR-007, FR-031**: Make every SCREEN-003 field editable, show unknown explicitly, require the review checkbox and scoped client submission UUID, and submit only the confirmed reviewed payload through API-003. Identical UUID/hash retry returns a stable reference; changed payload conflicts; a new UUID is separate. (BR-004/015/016; TC-004/031/042)
- **BR-023, DECISION-017**: Count every dispatched paid transcribe/extract call, including retries/fallbacks, with server-owned per-draft maximum six, 10/min principal and 30/min HMAC-network limits and atomic upper-bound budget reservations. Default spend stop is USD 25; any documented increase remains at most USD 30. Refusal keeps the manual path usable. (TASK-059/063; TC-036/043)
- **FR-027, FR-032**: In DEMO_MODE, permit stored results only for three scripted synthetic cases, label synthetic records on every screen, show a separate cached badge on every hit and exclude fixture/cache hits from quality evaluation. An offline miss has an explicit unavailable/manual state. (TASK-033; COMP-017/048; TC-021/056)
- **FR-033, COMP-022**: Parent intake begins in Bangla with Bangla numerals and an English toggle. SCREEN-001/002/003 have D3 loading, empty, error and recovery states, D4 accessible labels and ≥44 px targets; DESIGN.md supplies visual tokens and its Fera overrides. (TASK-008/021/022; NFR-011; TC-002/033/058)
- **BR-007, BR-024**: Parent intake uses the server-derived anonymous principal and owner-scoped DTOs from feature 001. No candidate, other-party or raw case row appears in parent responses. (API-001/002/003; TC-019/022)

### Key Entities

- **ParentSession (ENTITY-002)**: Opaque anonymous principal with expiry/revocation, bound to own draft metadata and later missing reports. (BR-024; D2 Part A §9)
- **IntakeDraft (ENTITY-015)**: Pre-submit draft ID/principal/revision/expiry/hash and authoritative usage metadata only. Reviewed child text and audio remain device-held until explicit confirmation; an opaque draft token is not the authoritative counter. (BR-004/023; FV-05; TC-043/060)
- **CaseDraft and EvidenceSpan**: Editable extracted values, explicit unknowns and source-span/derivation evidence over reviewed text. It is not a persisted Case. (BR-008; D2 Part A §5.4; TC-027)
- **AiBudget and AiReservation (ENTITY-016/017)**: Global committed/reserved spend and per-dispatch upper-bound reservation/settlement without child payload. (BR-023; TASK-063; TC-036/043)
- **Case (ENTITY-003)**: One reviewed synthetic missing-report row exists only after API-003 confirmation; its owner projection is returned through feature 001 contracts/case service. (BR-004/024; FR-031; TC-004/031)
- **Demo cache fixture (COMP-017)**: Stored synthetic transcript/extraction for one of three scripted cases; a hit is labelled cached and excluded from model-quality evaluation. (FR-027/032; TC-021/056)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The synthetic 38-second TC-001 note yields an editable Bangla transcript within 20 seconds after stop; its known fixture words are present, without claiming a broader speech accuracy rate. (FR-002; TC-001)
- **SC-002**: The TC-002 text yields the source-backed specified fields within 15 seconds, with the district still unknown and the approximate event interval anchored to the fixed fixture clock. (FR-001/003/004; BR-008; TC-002)
- **SC-003**: TC-003 asks exactly one question for its one missing district; no draft exceeds four follow-up rounds before manual completion. (FR-005; TC-003/017)
- **SC-004**: TC-004/060 show zero child case rows, matching exposure or other-party visibility before review and confirmation; after confirmation the persisted value equals the parent's edited value. (FR-006/007; BR-004; TC-004/060)
- **SC-005**: Concurrent identical retries with one scoped UUID create exactly one report and return a stable reference; changed-payload retry conflicts. (FR-031; TC-031/042)
- **SC-006**: TC-036/043 show at most six dispatched paid calls per draft, replay-safe authoritative usage and budget refusal with a usable manual form. Provider spend is not claimed measured until runtime evidence exists. (BR-023; TASK-059/063)
- **SC-007**: In TC-021's network-off scripted synthetic journey, all cache hits visibly say cached and synthetic; no cache/fixture hit appears in a quality result. (FR-027/032; TC-021/056)
- **SC-008**: TC-061 verifies a phone recording satisfies both the 5–120-second and 2 MB encoded limits or is refused with a usable text fallback. This is an acceptance target, not a completed phone test. (FR-002; BR-023; TC-061)

## Assumptions, dependencies and open decisions

- TASK-003 provider accounts/keys and real price sheet remain **UNKNOWN** (OQ-004/OQ-022); no keys, DB URLs or prices are inferred or written here. No paid provider call is authorised by this specs-only run. The default app budget stop is USD 25, with a documented team decision required to raise it no higher than USD 30. (D2 Part B §12.2; AGENTS.md AMD-AGENTS-5)
- TASK-005 depends on TASK-003; TASK-012 on TASK-009; TASK-013 on TASK-003/TASK-012; TASK-014 on TASK-005/TASK-007; TASK-020 on TASK-013; TASK-021 on TASK-008/TASK-014/TASK-020; TASK-022 on TASK-015/TASK-021; TASK-063 on TASK-003/TASK-062; TASK-059 on TASK-013/TASK-063; TASK-033 on TASK-020/TASK-019. These are D6 dependencies, not completion claims. (D6 §5)
- TASK-001/002/009 remain incomplete in Phase 0, so the TASK-012 normaliser, integration and later runtime evidence cannot be called done. TASK-033 also needs Masnun's TASK-019 synthetic fixtures. (AMD-1-1; D6 §5)
- The feature consumes feature 001 `src/contracts/` DTOs and case service without direct SQL. Those runtime contracts are blocked by TASK-001 and have not been merged/tagged. SCREEN-005's form and SCREEN-004 outputs are feature 003 handoffs, not silently reassigned. (TASK-015/022/025/061; AGENTS.md)
- The constitution is read-only and still a draft awaiting three-owner ratification. Its safeguards and the V2 pack govern this specification; no gate, provider, device or quality result is claimed. (`.specify/memory/constitution.md`; AGENTS.md)

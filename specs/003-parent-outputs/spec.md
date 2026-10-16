# Feature Specification: Parent outputs, manual form fallback, and post-submission lifecycle

**Feature Branch**: `phase2--obidit-spec003`

**Created**: 2026-10-16 (Asia/Dhaka)

**Status**: draft for human skim (spec-kit stop point before /speckit-clarify). Generated 2026-10-16 by an agent; not reviewed.

**Input**: Feature 003 brief in `docs/agents/SPECKIT_PROMPTS.md` and the V2 spec pack (`docs/spec/`)
**Owners**: Obidit (intake/outputs backend, templates, wording guard, APIs, post-submit edit/status), Mahim (S-004 outputs UI + poster PNG, S-005 manual form UI — D6 owner S (Sadman); labelled Mahim per AGENTS.md:34 ("Names"))

This feature covers post-submission parent outputs and lifecycle actions for synthetic missing-child cases: deterministic Bangla GD draft generation, shareable no-photo text poster with privacy controls and 1080×1350 px PNG download, concise 13219 helpline summary (≤ 80 words), wording guard enforcement against alert/runaway/rescue/legal claims, SCREEN-004 outputs interface, SCREEN-005 accessible manual form fallback when AI fails or budget caps are reached, SCREEN-006 post-submission versioned case edits (API-005), and owner-scoped case status tracking (API-018). It operates exclusively on synthetic records; no real child data, photos, facial search, alert broadcasts, police-system integration, or legal compliance certifications are in scope. (STORY-005–STORY-007, STORY-018–STORY-020; SCREEN-004–SCREEN-006; FR-008–FR-010, FR-026, FR-029–FR-031, FR-034; BR-002, BR-003, BR-006, BR-007, BR-011, BR-012, BR-015, BR-016, BR-020, BR-022, BR-024, BR-025; TASK-023, TASK-024, TASK-025, TASK-047, TASK-049, TASK-050; TC-005–TC-007, TC-017–TC-019, TC-024–TC-026, TC-030, TC-045, TC-049)

## User Scenarios & Testing *(mandatory)*

Stories 1, 2, and 3 address V2 Must capabilities (P1); Stories 4, 5, and 6 address V2 Should capabilities (P2). P1 and P2 reflect source priorities from D1/D6; they do not introduce artificial ranking within each priority tier. User stories and requirements owned by Mahim (S-004 TASK-024, S-005 TASK-025) are explicitly labeled "(owner: Mahim)".

### User Story 1 - Get a ready-to-file GD draft from confirmed fields (Priority: P1)

A parent who has submitted a synthetic missing-child report views their case on SCREEN-004 and requests a General Diary (GD) draft. The system generates a deterministic Bangla text from fixed templates containing only reviewed case fields (child name or "অজানা", age/age range, last-seen location, event interval, reporter phone), labeled clearly as a draft ("খসড়া — নিজে জমা দিন"). The parent copies the text to file at the local thana. Fera never submits or integrates with police systems. (STORY-005; FR-008, FR-034; BR-002, BR-022; COMP-010, COMP-016; API-006; SCREEN-004)

**Why this priority**: Must requirement (GOAL-001, A-008). Empowers distressed parents to act quickly with accurate, reviewed information while preserving the constitutional safeguard that Fera does not file police reports itself.

**Independent Test**: Seed a confirmed missing case, call API-006 for the GD draft, verify returned text contains only confirmed case fields, carries the "খসড়া" draft label, contains no tokens absent from the case fields, and is served idempotently from cache. Check TC-005, TC-024, and TC-025.

**Acceptance Scenarios**:

1. **Given** a submitted missing case, **when** the parent requests the GD draft ("জিডি খসড়া"), **then** Bangla text containing child name (or "অজানা" if unknown), age/age range, last-seen place, event time/interval in Asia/Dhaka, and reporter phone appears with the visible label "খসড়া" and copy button. (FR-008; BR-002, BR-022; SCREEN-004; TC-005)
2. **Given** a case with unstated optional fields (clothing, marks, circumstances), **when** the GD draft is generated, **then** no unstated facts are guessed or added; absent fields remain omitted or noted as "অজানা" (unknown). (BR-008, BR-022; TC-005)
3. **Given** any template text or injected circumstance containing banned wording ("alert", "broadcast", "পালিয়ে", "runaway", "rescue", "উদ্ধার", "ফেরত", "delivered"), **when** processed by the wording guard (COMP-016), **then** generation is blocked with E-016 (`OUTPUT_BLOCKED`), logged safely, and never shown. (FR-034; BR-002, BR-003; TC-024)
4. **Given** repeated requests for the GD draft on the same case version, **when** API-006 is called, **then** cached deterministic text is returned from the stored output rather than regenerated. (BR-022; API-006)

---

### User Story 2 - Get a shareable no-photo text poster with privacy controls and download PNG (owner: Mahim for S-004 UI & PNG) (Priority: P1)

A parent views their case on SCREEN-004 and requests a shareable missing-child poster. The poster displays confirmed text details (name, age, clothing, marks, last-seen place, event time) and the national child helpline 13219, with zero photo fields. The parent chooses whether to include or omit their contact phone number. Before copying text or downloading the PNG (1080 × 1350 px), an explicit share acknowledgement dialog warns the parent that downloaded copies cannot be remotely recalled by Fera. (STORY-006; FR-009, FR-034; BR-002, BR-006, BR-022; API-006; COMP-010, COMP-016, COMP-030, COMP-031; SCREEN-004; TASK-024 [owner: Mahim])

**Why this priority**: Must requirement (STORY-006, A-001). Enables community awareness while strictly enforcing safeguarding principles: no photos (BR-006), no alert broadcasts (BR-002), and informed consent regarding unrecallable downloads (BR-022, D4 §15.1).

**Independent Test**: Call API-006 for the poster, verify text formatting contains description, place, date-time, 13219, and phone based on selection. On SCREEN-004 (owner: Mahim), verify poster preview, phone toggle, sharing acknowledgement dialog, and PNG rendering at 1080×1350 px on white background with no photo slot. Check TC-006, TC-025, and TC-026.

**Acceptance Scenarios**:

1. **Given** a submitted case, **when** the parent requests the poster on SCREEN-004 (owner: Mahim), **then** the poster displays confirmed child details, helpline "১৩২১৯", and the "খসড়া" label, with zero photo fields or image placeholders. (FR-009; BR-006, BR-022; COMP-031; TC-006, TC-026)
2. **Given** the poster preview on SCREEN-004 (owner: Mahim), **when** the parent toggles phone inclusion, **then** the poster text dynamically includes or omits the reporter's contact phone number before generation or download. (FR-009; BR-022; COMP-031)
3. **Given** a request to download the poster PNG on SCREEN-004 (owner: Mahim), **when** the parent taps download, **then** an explicit acknowledgement dialog appears ("প্রকাশের আগে নম্বর ও স্থানের তথ্য দেখুন। ডাউনলোড করা কপি ফেরা মুছতে পারে না।") requiring confirmation before file export. (BR-022; D4 §15.1; TC-006)
4. **Given** acknowledgement confirmation on SCREEN-004 (owner: Mahim), **when** the PNG is generated, **then** a 1080 × 1350 px image on a white background with clear Bangla typography, 13219, selected contact details, and "খসড়া" footer is downloaded. (D4 §9, §15; COMP-031; TC-006)

---

### User Story 3 - Continue via accessible manual case form when AI is unavailable or fails (owner: Mahim) (Priority: P1)

If speech transcription or language-model extraction fails twice (E-012), an AI provider is unreachable (E-013), an AI timeout occurs (E-014 twice), the paid AI budget cap is reached (E-023), or the parent chooses manual entry directly (ACT-014), the parent is routed to SCREEN-005. The form opens in ≤ 2 seconds, pre-filled with all previously entered or extracted fields so the parent never retypes information. The form provides accessible controls, searchable district selection across all 64 districts in Bangla and English, and accepts Bangla numerals. Upon completion, the parent proceeds to review SCREEN-003. (STORY-018; FR-026; BR-015, BR-016, BR-023; COMP-032; SCREEN-005; TASK-025 [owner: Mahim])

**Why this priority**: Must requirement (FR-026, NFR-008). Guarantees that AI outages, model errors, or cost limits never prevent a parent from completing and submitting a missing-child report.

**Independent Test**: Simulate two extraction failures (E-012), AI outage (E-013), or budget cap exhaustion (E-023), or trigger ACT-014 from SCREEN-002. Verify SCREEN-005 (owner: Mahim) opens within 2 seconds with existing draft fields pre-filled, validates BR-015/016 rules inline, accepts Bangla numerals, and navigates to SCREEN-003 upon completion. Check TC-017 and TC-030.

*(Note on session vs draft expiry: In D2A §5.2, E-019 is `SESSION_EXPIRED`, which D3:309 uses for 24 h draft expiry on S-002; using E-019 for 30-day parent session expiry on S-006 is a loose mapping; see OD-003-5.)*

**Acceptance Scenarios**:

1. **Given** two failed extraction attempts (E-012), unavailable AI (E-013), AI timeout (E-014 twice), AI budget cap reached (E-023), or user tap on ACT-014, **when** continuing, **then** SCREEN-005 (owner: Mahim) opens in ≤ 2 seconds with a plain banner explaining the assistant is unavailable. (FR-026; D2B §13; COMP-032; TC-017)
2. **Given** existing draft text or partially extracted fields from SCREEN-002, **when** SCREEN-005 (owner: Mahim) opens, **then** all known fields (age, sex, place, time, phone) are pre-filled, eliminating redundant data entry (WCAG 3.3.7). (NFR-008; D4 §13; COMP-032)
3. **Given** the district field on SCREEN-005 (owner: Mahim), **when** the parent selects a district, **then** an accessible searchable selector lists all 64 districts in Bangla and English with common aliases (e.g., Chattogram / Chittagong). (BR-015; D4 §11; COMP-032)
4. **Given** numeric input fields (age, phone), **when** typed with Bangla digits (০–৯) or ASCII digits (0–9), **then** digits are normalised without error. (FR-003; D4 §11; COMP-032)
5. **Given** incomplete or invalid required fields (e.g., missing district, future event time, invalid phone format), **when** validated on blur or submit, **then** inline error messages announced to screen readers guide correction without clearing valid input. (BR-015, BR-016; E-001; TC-030)
6. **Given** a fully completed valid form on SCREEN-005 (owner: Mahim), **when** the parent taps "পরের ধাপ" / Next (ACT-005), **then** the app navigates to case review SCREEN-003 with all values ready for explicit confirmation. (FR-006; SCREEN-003, SCREEN-005)

---

### User Story 4 - Get a concise 13219 helpline summary for phone calls (Priority: P2)

A parent views their case on SCREEN-004 and requests a 13219 helpline summary. The system generates a concise, scripted summary of at most 80 words in plain Bangla from confirmed case fields. The parent can read this script aloud when calling the national child helpline 13219. The card provides a tap-to-call 13219 link and copy button. Fera does not place calls or interface directly with helpline operators. (STORY-007; FR-010, FR-034; BR-022; API-006; COMP-010, COMP-016, COMP-030; SCREEN-004; TASK-047)

**Why this priority**: Should requirement (FR-010, A-009). Assists parents in high-stress phone interactions by condensing case facts into an easily spoken verbal script.

**Independent Test**: Call API-006 for the 13219 summary. Verify word count ≤ 80 words, text contains child name/age, last-seen place, time, and contact phone, carries the draft label, and contains no banned terms. Check TC-007 and TC-024.

**Acceptance Scenarios**:

1. **Given** a submitted case, **when** the parent requests the 13219 summary ("১৩২১৯ সারাংশ"), **then** a concise Bangla summary script of ≤ 80 words is generated and displayed on SCREEN-004. (FR-010; API-006; TC-007)
2. **Given** the helpline summary card on SCREEN-004, **when** viewed, **then** a prominent tap-to-call 13219 link and copy action (copy label: UNKNOWN (no pack string; needs Bangla review)) are visible with accessible copy confirmation ("কপি হয়েছে"). (D3 SCREEN-004; COMP-030; TC-007)
3. **Given** the summary text, **when** inspected, **then** it contains no unconfirmed facts, no alert/runaway wording, and clearly identifies as a parent-read draft (A-009). (BR-002, BR-022; TC-007, TC-024)

---

### User Story 5 - Edit case details after submission while allowed (Priority: P2)

A parent returns to SCREEN-006 and realizes an error in their submitted case (e.g., wrong clothing or age). As long as the case remains in an editable state (`submitted`, `open`, or `matched_pending_review`), the parent taps "তথ্য সংশোধন" / Correct details (ACT-017), updates the fields, and submits via API-005 with the version the parent last saw. The system increments the version, snapshots the prior payload in the case version, voids pending candidate pairs, updates matching state to `queued`, and logs `case.edited`. If the case has reached a terminal state (`confirmed` or `closed` for missing reports, or `referred` for found reports; per D5:244–245, D2A:437 (§5.5), plus D3:338 and D2B:161, which say edits lock "after a match is confirmed" (state list unverified)), editing is blocked in the UI and rejected with E-018 (`EDIT_LOCKED`). (STORY-019; FR-029, FR-031; BR-012, BR-020, BR-025; API-005; COMP-014; SCREEN-006; TASK-049)

**Why this priority**: Should requirement (FR-029, BR-025). Allows correction of factual errors while enforcing lifecycle integrity, invalidating obsolete match candidates, and preventing edits to confirmed or closed records.

**Independent Test**: Create a case in `open` state, call case edit API-005 with updated clothing and the version the parent last saw set to 1. Verify case updates to version 2, snapshots version 1, voids pending candidates, and queues rematching. Then attempt edit on a `confirmed` case; verify rejection with E-018 (`EDIT_LOCKED`). Check TC-018 and TC-049.

**Acceptance Scenarios**:

1. **Given** a case in `submitted`, `open`, or `matched_pending_review` owned by the active parent session, **when** the parent edits fields and submits via API-005 with the version the parent last saw, **then** version increments by 1, the prior payload is snapshotted into the case version, and the new values are saved. (FR-029; BR-025; API-005; TC-018)
2. **Given** an edit to a case with pending match candidates, **when** API-005 succeeds, **then** all pending candidate pairs for that case are voided (BR-020), competitor reports are reconciled, and matching state is reset to `queued` (API-014). (BR-025; TC-018, TC-053)
3. **Given** a case in a terminal status (`confirmed` or `closed` for missing reports, or `referred` for found reports; per D5:244–245, D2A:437 (§5.5), plus D3:338 and D2B:161, which say edits lock "after a match is confirmed" (state list unverified); BR-012, BR-025), **when** viewed on SCREEN-006 or submitted to API-005, **then** the edit button is absent from the UI, and API-005 rejects the edit with E-018 (`EDIT_LOCKED`). (BR-025; E-018; TC-018, TC-049)
4. **Given** a concurrent edit where the version the parent last saw does not match the database version, **when** API-005 executes, **then** the update is rejected with E-005 (`ILLEGAL_TRANSITION`), preventing lost updates. (BR-025; E-005)
5. **Given** a successful edit to version N, **when** outputs are subsequently requested via API-006, **then** outputs are generated and cached for version N; obsolete versions are never served as current. (BR-022; API-006)

---

### User Story 6 - View own case status without other-party disclosure (Priority: P2)

A parent returning to Fera on the same device opens SCREEN-006 to check their report. The screen displays the case reference number (e.g., "M-7K3Q2A"), last updated date, and status badge using icon + text + color: "খোলা" / Open, "যাচাই চলছে" / Being checked (when in `matched_pending_review`), or "বন্ধ" / Closed. The parent receives strictly the owner's case view. The system never exposes candidate scores, candidate counts, match reasons, found-child descriptions, or staff details to the parent. (STORY-020; FR-030; BR-007, BR-024; API-018, API-004; COMP-033; SCREEN-006; TASK-050)

**Why this priority**: Should requirement (FR-030, BR-007). Provides necessary status visibility to parents while strictly maintaining safeguarding boundaries and child confidentiality.

**Independent Test**: Query parent status API-018 and case detail API-004 as the owning parent session for a case in `matched_pending_review`. Inspect response JSON: verify status displays "যাচাই চলছে" / Being checked and response contains zero candidate or found-case fields. Check TC-019 and TC-045.

**Acceptance Scenarios**:

1. **Given** an owning parent session on SCREEN-006, **when** case status is retrieved via API-018 / API-004, **then** the parent sees their case reference, updated time, and status badge: "খোলা" (Open), "যাচাই চলছে" (Being checked), or "বন্ধ" (Closed). (FR-030; COMP-033; SCREEN-006; TC-019)
2. **Given** a case in `matched_pending_review` or `confirmed`, **when** the parent views status, **then** the response and UI contain strictly own missing-case fields; zero candidate rows, scores, reasons, or found-child details are exposed. (BR-007, BR-024; TC-019, TC-045)
3. **Given** a parent device with no active session or an expired session (> 30 days), **when** SCREEN-006 is opened, **then** an accessible empty state appears ("এই ফোনে কোনো রিপোর্ট নেই" / No reports on this phone) with a link to start intake. (D3 SCREEN-006; COMP-045; E-019 — note: E-019 is `SESSION_EXPIRED` in D2A §5.2, which D3:309 uses for 24 h draft expiry on S-002; using it for 30-day parent session expiry on S-006 is a loose mapping; see OD-003-5)
4. **Given** an unauthenticated or non-owning session requesting API-004 for another case ID, **then** the API returns indistinguishable E-004 (`NOT_FOUND`) and logs an `access.denied` audit entry. (BR-007, BR-024; E-004; TC-022, TC-052)

---

### Edge Cases

- **Parent input contains banned terms in circumstances**: A parent's own words in `circumstances` are stored as given on the case record, but COMP-010 output templates strictly never copy `circumstances` into generated outputs (COMP-016 scope rule; D2A §4). If any generated text or template contains a banned term, COMP-016 blocks generation with E-016 (`OUTPUT_BLOCKED`).
- **Poster PNG generation fails or is unsupported**: On SCREEN-004 (owner: Mahim), an accessible text version of the poster is rendered beside the PNG download control; if image generation fails, the selectable text block and copy button remain fully usable.
- **Concurrent edit during officer candidate confirmation**: Database row locking in ascending UUID order ensures serial execution. If the parent's edit commits first, the officer's stale decision fails version checks on the version last seen (TC-046); if the officer confirms first, the parent's edit fails with E-018 (`EDIT_LOCKED`).
- **Multiple cases on a single parent device**: API-018 returns an array of reports owned by the parent session. SCREEN-006 displays all owned reports by reference code and status.
- **Network offline on SCREEN-004 or SCREEN-005**: Client-side error E-024 (`NETWORK_OFFLINE`) informs the user in plain Bangla, preserving local inputs in the browser until network connectivity returns.

## Requirements *(mandatory)*

### Scope and boundaries

D6 §5 maps this feature to:
- TASK-023: Output templates GD/poster + wording guard + API-006 (COMP-010, COMP-016) [Must, Owner: Obidit, Depends: TASK-015]
- TASK-024: SCREEN-004 outputs + poster PNG (COMP-030, COMP-031) [Must, D6 owner S (Sadman); labelled Mahim per AGENTS.md:34 ("Names"), Depends: TASK-023]
- TASK-025: SCREEN-005 manual form fallback (COMP-032) [Must, D6 owner S (Sadman); labelled Mahim per AGENTS.md:34 ("Names"), Depends: TASK-022]
- TASK-047: 13219 summary (FR-010) [Should, Owner: Obidit, Depends: TASK-023]
- TASK-049: Edit after submit + API-005 + SCREEN-006 (FR-029) [Should, Owner: Obidit, Depends: TASK-022]
- TASK-050: Parent status API-018 (FR-030) [Should, Owner: Obidit, Depends: TASK-049]

Requirements and user stories owned by Mahim (S-004 TASK-024, S-005 TASK-025) are labeled "(owner: Mahim)".

Only synthetic missing-child records are in scope. Fera generates draft texts from reporter-reviewed fields; it never files reports with police or CID, broadcasts alerts, searches photos or faces, predicts runaways, or executes physical child recoveries. Banned terms in the wording guard are examples, from D4 (উদ্ধার, runaway) and the implemented guard (branch phase2--obidit-templates, PR #15), including alert/broadcast, runaway, rescue, reunified/returned, delivered, legal-compliance claims, and probability language (the full bn + en term list for COMP-016 is not enumerated in the pack, D2_TRD_PartA_V2.md:192). (FR-034; BR-002, BR-003, BR-006, BR-011, BR-022)

### Functional Requirements

- **FR-008, COMP-010**: Generate a Bangla GD draft from fixed template using confirmed case fields only (child name or "অজানা", age/age range, last-seen place, event interval, reporter phone). Missing fields are noted as "অজানা" or omitted; no facts are guessed. Text carries the visible draft label "খসড়া". (BR-002, BR-022; API-006; TC-005, TC-025)
  - [NEEDS CLARIFICATION: Official online GD field list and layout are UNKNOWN (OQ-016); generic Bangla template applies per A-008 - clarify if specific thana-level header or format is required]
- **FR-009, COMP-010**: Generate a reviewed text-based poster with description, place, event date/time, prominent helpline 13219, and optional contact phone inclusion. No photo slot, image input, or face placeholder exists. (BR-002, BR-006, BR-022; API-006; TC-006, TC-026)
- **FR-010, COMP-010**: Generate a concise 13219-ready helpline summary of ≤ 80 words in plain Bangla from confirmed case fields, ensuring word count is strictly enforced by the 80-word helpline limit (D1/D6). (BR-022; API-006; TC-007)
- **FR-034, COMP-016**: Wording guard: block generated or displayed text containing alert wording, runaway terms ("পালিয়ে"), rescue/delivery claims, or probability language, returning E-016 (`OUTPUT_BLOCKED`) upon violation. Circumstances text from parents is stored but never copied into outputs. (BR-002, BR-003, BR-022; TC-024)
- **BR-022, API-006**: Cache deterministic output texts by unique `(case_id, type, case_version)` as the stored output; obsolete versions are never served as current. Outputs require owning parent authentication. (API-006)
- **SCREEN-004 (owner: Mahim), TASK-024**: Case submitted and outputs screen displaying reference number (large mono digits), status badge "খোলা", three output cards (GD draft, poster, 13219 summary) with one-tap copy, poster preview, contact inclusion toggle, poster PNG download at 1080×1350 px, and explicit share acknowledgement dialog ("প্রকাশের আগে নম্বর ও স্থানের তথ্য দেখুন। ডাউনলোড করা কপি ফেরা মুছতে পারে না।"). (D3 SCREEN-004; D4 §9, §15; COMP-030, COMP-031; TC-006, TC-025)
  - [NEEDS CLARIFICATION: Whether poster PNG generation at 1080x1350 px is rendered client-side in the browser or via a server route - clarify implementation boundary between TASK-023 and TASK-024 (owner: Mahim)]
- **FR-026, SCREEN-005 (owner: Mahim), TASK-025**: Accessible manual case form fallback opening in ≤ 2 seconds upon AI errors (E-012, E-013, E-014 twice, E-023) or user action (ACT-014), pre-filling existing draft fields without redundant entry, accepting Bangla numerals, providing 64-district searchable selector, validating BR-015/016 rules inline, and navigating to SCREEN-003 upon completion. (COMP-032; TC-017, TC-030)
- **FR-029, BR-025, API-005**: Versioned case edit after submit for owning parent in `submitted`, `open`, or `matched_pending_review` with the version the parent last saw, snapshotting prior version as the case version, voiding pending candidates, queuing rematch (API-014), and rejecting terminal edits (`confirmed` or `closed` for missing reports, or `referred` for found reports; per D5:244–245, D2A:437 (§5.5), plus D3:338 and D2B:161, which say edits lock "after a match is confirmed" (state list unverified)) with E-018 (`EDIT_LOCKED`). (COMP-014; TC-018, TC-049)
- **FR-030, BR-007, BR-024, API-018, API-004**: Parent case status and reports query returning the owner's case view with reference, status badge ("খোলা", "যাচাই চলছে", "বন্ধ"), updated timestamp, and editability; strictly excluding candidates, scores, match reasons, and other-party data. Hidden records return E-004 (`NOT_FOUND`) and log an `access.denied` audit entry. (COMP-033, SCREEN-006; TC-019, TC-045)
  - [NEEDS CLARIFICATION: When parent visits S-006, API-018 returns array of own reports; clarify UI behavior when parent has multiple active reports on the same device]
- **FR-033, COMP-022**: Bilingual support with Bangla default, Bangla numerals on parent screens, English toggle, accessible focus management, and touch targets ≥ 44 × 44 px. (NFR-011; TC-033, TC-058)

### Key Entities

- **Case (ENTITY-003)**: Submitted missing report row containing confirmed fields, version, kind (`missing`), status (`submitted`, `open`, `matched_pending_review`, `confirmed`, `closed`), and reporter session ID. (BR-004, BR-012; D2A §6.2)
- **CaseVersion (ENTITY-004)**: Snapshot record of the case version storing prior reviewed payloads upon parent edit, indexed by `(case_id, version)`. (BR-025; D2A §6.1)
- **GeneratedOutput (ENTITY-012)**: The stored output caching deterministic output text (GD draft / poster / 13219 summary), indexed uniquely by `(case_id, type, case_version)`. (BR-022; D2A §6.1, §7)
- **ParentSession (ENTITY-002)**: Anonymous session principal stored in the parent's anonymous session, owning draft metadata and submitted reports. (BR-024; D2A §6.1)
- **WordingGuardViolation (COMP-016)**: Rejection event triggered when generated text or UI label contains banned terms, resulting in error E-016 (`OUTPUT_BLOCKED`). (FR-034; BR-002, BR-003)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any confirmed missing case, API-006 generates the GD draft (latency: not measured (no pack target)), containing all confirmed fields and the "খসড়া" label, with 0 unconfirmed or guessed facts added. (FR-008; TC-005)
- **SC-002**: For any confirmed missing case, API-006 generates the poster text and SCREEN-004 (owner: Mahim) renders the poster preview and downloadable PNG (1080 × 1350 px) with 0 photo fields, 13219 helpline present, and contact phone toggle functioning. (FR-009; TC-006, TC-026)
- **SC-003**: In 100% of helpline requests, API-006 returns a concise Bangla summary (latency: not measured (no pack target)) with word count ≤ 80 words. (FR-010; TC-007)
- **SC-004**: In 100% of test cases with banned terms injected into templates or UI copy, COMP-016 blocks output with E-016 and 0 banned tokens reach the user. (FR-034; TC-024, TC-025)
- **SC-005**: Upon AI extraction failure (2 attempts), timeout, or budget cap exhaustion, SCREEN-005 (owner: Mahim) opens in ≤ 2 seconds, preserving 100% of previously extracted or entered fields. (FR-026; TC-017)
- **SC-006**: Editing a case via API-005 in an editable status increments version, snapshots the prior payload, voids 100% of pending candidates, and queues rematch; terminal reports return E-018 in 100% of attempts. (FR-029; TC-018, TC-049)
- **SC-007**: In 100% of parent status requests via API-018 / API-004, the response returns valid status ("খোলা", "যাচাই চলছে", "বন্ধ") and 0 candidate IDs, scores, match reasons, or other-party found-child details. (FR-030; TC-019, TC-045)
- **SC-008**: Accessibility audit across SCREEN-004, SCREEN-005, and SCREEN-006 yields 0 WCAG 2.2 AA violations, all interactive targets ≥ 44 × 44 px, and clean 320 CSS px reflow. (NFR-011; TC-033, TC-058)

## Assumptions, dependencies and open decisions

### Assumptions

- **A-001**: Voice and poster are Must; 13219 summary is Should; parent edit after submit and status tracking are Should. (D1 §14 A-001)
- **A-008**: GD draft uses a generic Bangla template; official online GD field list from Bangladesh Police is UNKNOWN (OQ-016).
- **A-009**: The parent reads the 13219 summary on their own phone call; Fera never contacts 13219 directly.
- **A-016**: Drafts expire after 24 hours; parent sessions expire after 30 days.
- **A-018**: AI spend cap is USD 25 at freeze, with a documented team decision required to raise to at most USD 30; output generation (COMP-010) uses pure template functions with 0 external AI calls. (DECISION-007)
- **A-021**: A structured GD draft shortens the time required for a parent to file a GD at a thana.
- **A-022**: Parents accept AI-drafted text when they can review, edit, and confirm it beforehand.

### Dependencies

- Depends on TASK-015 (`src/server/case`, state guard, audit, versions; merged in `phase2`).
- Depends on TASK-022 (`SCREEN-003` review and submit; handoff to S-004 and S-005).
- Output generator TASK-023 unblocks Mahim's TASK-024 (SCREEN-004 UI + poster PNG).
- Review/submit TASK-022 unblocks Mahim's TASK-025 (SCREEN-005 manual form).
- Edit after submit TASK-049 and status TASK-050 depend on TASK-022 and TASK-023.
- Consumes contracts from `src/contracts/` (`contracts-v1`, frozen).

### Open Decisions

- **OD-003-1**: Official Bangladesh Police online GD field format remains **UNKNOWN** (OQ-016). Default is a generic Bangla template per A-008.
- **OD-003-2**: Exact implementation technique for poster PNG generation (client-side rendering vs server-side export) is **UNKNOWN** and left to TASK-024 implementation (owner: Mahim).
- **OD-003-3**: UI layout when a parent session holds multiple missing reports on SCREEN-006 is **UNKNOWN**; API-018 returns array of reports, UI will show report cards list or primary report with selector.
- **OD-003-4**: Retention and cleanup schedule for the stored output before terminal case redaction is **UNKNOWN** (OQ-012); rows are cleared when admin payload redaction (`redact_case()`) executes.
- **OD-003-5**: E-019 (`SESSION_EXPIRED`) mapping: D2A §5.2 defines E-019 as `SESSION_EXPIRED` (HTTP 401), and D3:309 associates it with 24 h draft expiry on SCREEN-002. Using E-019 for 30-day parent session expiry on SCREEN-006 / API-018 is a loose mapping; clarify whether an expired 30-day session returns E-019, HTTP 401, or empty reports list.

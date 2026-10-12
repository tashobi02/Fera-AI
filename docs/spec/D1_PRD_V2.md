# D1 — Product Requirements Document — Fera

| Field | Value |
|---|---|
| Version | 2.0 |
| Date | 11 Oct 2026 (Asia/Dhaka, UTC+6) |
| Owner | Sadman Shaharier (team lead) |
| Authors | Sadman Shaharier; Obidit Islam |
| Status | V2 team handover; implementation status UNVERIFIED |
| Sources | Validation report; original D1 source; V2 registry and handover. Original pitch deck/PRD rev 18 were not supplied independently; inherited claims require source checks. |

## V2 release contract

**Authors:** Sadman Shaharier and Obidit Islam. **Version:** 2.0. **Issued:** 11 October 2026, Asia/Dhaka (UTC+6).

This is the revised team specification, not evidence that the application has been built. Actual repository progress, account configuration, interviews, evaluations, and spend remain **UNVERIFIED** until evidence is attached. V1 defaults are superseded by the V2 rules below; existing requirement IDs are retained.

- This release is a **synthetic-data prototype**. Officer verification and referral delivery are simulated and labelled. The schema rejects records marked non-synthetic; the application must also prevent real reports from entering this release.
- A candidate score is similarity, not identity probability. A reviewer decision does not establish guardian authority or safe reunification. A referral row means **referral recorded**, not delivered or acknowledged.
- Draft payload stays on the device before report confirmation, but providers process audio/text beforehand with a notice. Only expiry/counter/hash metadata and cost reservations are stored server-side before submission.
- Possible duplicates remain visible. Shared phone alone never establishes one child. No physical child-return action is performed by Fera.
- Counts distinguish missing-report rows, found-report rows, and confirmed pairs. They are not a census of unique children or proof of rescue.
- Sources, diagrams, tables, code blocks, and acceptance criteria are part of the handover. The companion code must match the embedded code exactly. [Team handover](TEAM_HANDOVER_V2.md) records change closure, evidence gaps, and release gates.

## Changes to earlier documents

V2 revises required fields, duplicate handling, candidate eligibility, draft/submit controls, referral/count semantics, privacy and release assumptions. Original IDs remain stable; the V2 release contract supersedes Turn 0 defaults. See the handover change map for FV-01–FV-16.

---

## 1 Document control

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 9 Oct 2026 | Sadman Shaharier | First issue. Remaps PRD v2 (G1–G5, US1–US9, FR1–FR11) into the suite ID registry. |
| 1.1 | 9 Oct 2026 | Sadman Shaharier | SCREEN-006 priority Could → Should, so the Should story STORY-019 has a screen of equal priority (raised in D3). |
| 2.0 | 11 Oct 2026 | Sadman Shaharier; Obidit Islam | Validation-led contract, safety, evaluation and handover revision |

Legacy map: v2 US1 → STORY-002; US2 → STORY-004; US3 → STORY-005; US4 → STORY-008; US5 → STORY-009/010/011; US6 → STORY-013; US7 → STORY-001; US8 → STORY-006/007; US9 → STORY-015. v2 FR1–FR11 → see §11 notes.

---


## 2 Executive summary

| Item | Summary |
|---|---|
| What | A Bangla-first web service that turns a parent's voice or text report into a structured missing-child case, matches it against found-child notices and tracks it to a known status. |
| For whom | Parents and guardians (PERSONA-001), verifying police officers (PERSONA-002), shelter and station staff (PERSONA-003). |
| Problem | Reports sit in separate GDs, social posts, news, shelters and hospitals. Fera explores whether reviewed intake and linked missing/found reports improve coordination; the unmet operational gap requires partner validation. |
| Why it matters | 15,717 children were reported missing Jan–Jul 2026; 2,038 (13 %) were still untraced in that cohort as reported 3 Sep 2026; 13,679 were reported returned/rescued. See the handover source index. |
| Differentiator | Coordination and closure between report and rescue. Fera could support a future authorised coordination workflow; it currently has no CID/MUN integration. It never issues alerts. |

---

## 3 Problem statement

### 3.1 Current situation

A family notices a child missing. They search, call relatives, visit the thana and post on social media. Found children are held by shelters, stations or hospitals, whose notices stay local. CID controls verified MUN alerts. Fera has no integration with it. Claims about MUN's internal linkage or closure capability remain unverified until a partner process review.

### 3.2 Pain points

| # | Pain point | Who feels it |
|---|---|---|
| 1 | The first hours go to searching and paperwork, not a complete report. | PERSONA-001 |
| 2 | Low-literacy parents struggle to write a formal complaint. | PERSONA-001 |
| 3 | Missing and found notices sit in different places with no link. | PERSONA-002, PERSONA-003 |
| 4 | The same child is reported several times in different formats. | PERSONA-002 |
| 5 | Case-level linkage and follow-up across participating sources are an unvalidated coordination need; aggregate rescued/returned outcomes are already reported. | PERSONA-002, authorities |

### 3.3 Consequences

Children stay untraced longer. Officers re-key and cross-check by phone. Fera must validate whether participating officers need better case-level linkage and follow-up; aggregate outcomes are already reported.

### 3.4 Evidence and source limits

- 15,717 children reported missing, Jan–Jul 2026 (Police HQ via The Daily Star, 3 Sep 2026).
- 2,038 still untraced (13 %).
- 97 % aged 10–17.
- About 74 reports per day.
- The absence of a linked operational registry is a hypothesis requiring an authoritative source or partner confirmation.
- MUN Alert: live since 13 Jan 2026; helpline 13219; joined Meta's alert network in May 2026.

### 3.5 Assumptions about the problem (unverified)

- Assumption A-021: A structured draft shortens the time to file a GD.
- Assumption A-022: Parents will accept AI-drafted text if they can review and edit it.
- Assumption A-023: Low-literacy parents prefer speaking to typing.
- Assumption A-024: Found-child notices exist in public text in enough volume to be worth matching.
- Assumption A-025: Officers will use a ranked review queue if each candidate shows evidence side by side.

Interview status is UNVERIFIED (OQ-006); record the actual count and evidence at the next meeting. Independent user-research evidence was not supplied; these hypotheses remain unvalidated in this handover.

### 3.6 Boundaries — Fera will not touch

| Area | Owner |
|---|---|
| Issuing, withdrawing or broadcasting alerts | CID via MUN Alert (OQ-010) |
| Rescue operations, searches, arrests | Police |
| Placement or return decisions for a found child | Child-protection services |
| Filing the GD itself | The family at the thana or official online channel |

---

## 4 Personas

Names are fictional, built from published reporting, not interviews (Assumption A-003).

| Field | PERSONA-001 Parent ("Shirin") | PERSONA-002 Verifying officer ("SI Karim") | PERSONA-003 Station staff ("Rumana") |
|---|---|---|---|
| Role | Mother reporting a missing son | Thana duty officer | NGO volunteer, railway-station children's desk |
| Context | Dhaka, 30s. Son, 13, did not come home from madrasa. Frightened, first hours. | Handles several missing-child GDs a week at a desk. | Meets lone children daily; works from a phone between tasks. |
| Goals | A complete report and GD draft within the first hour; know the case is being checked. | See ranked candidates with evidence; record a decision in minutes. | Log a found child in under 2 minutes; know it will be matched. |
| Pains | GD may not be filed; unsure what to do first; posts get lost; no updates. | Incomplete reports; duplicates; cannot search found children elsewhere. | Notices stay local; families never see them. |
| Technical ability | Uses a mid-range Android phone for calls and social apps. Weak formal writing. | Comfortable with desktop web forms. | Comfortable with phone apps and forms. |
| Accessibility / language | Bangla-first; may use Bangla numerals; may mix English words; voice preferred. | Bangla and English; keyboard use. | Bangla-first; one-handed phone use. |
| Expected outcome | Reviewed case, GD draft and poster in ≤ 5 min. | Confirms or rejects a candidate in ≤ 2 min with an audit record. | Found-child entry saved and matched in ≤ 2 min. |

Secondary personas (no full profile, no UI in MVP):

- PERSONA-004 Child-protection caseworker: intended future recipient; V2 records a simulated referral only, with no actual delivery or recipient interface. Should (record only).
- PERSONA-005 Disaster-mode shelter volunteer: logs separated children after floods or cyclones. Could. No measured need exists.

---

## 5 Vision

**Every missing-child report in Bangladesh ends with the child's status known.**

Today a report starts many separate searches that never meet. Fera joins them into one case, one match queue and one outcome. Humans decide every match; AI only does the reading, structuring and ranking.

---

## 6 Goals and success metrics

Targets come from PRD v2, which marks them provisional (Assumption A-002). Timeframe "R2" = by the organiser-confirmed 14 Oct cutoff; "F" = by 24 Oct 2026.

| ID | Goal | Metric | Target | Measurement method | Timeframe |
|---|---|---|---|---|---|
| GOAL-001 | A parent produces a reviewed Bangla report in the first hour | Median time to complete report, assistant vs manual form | ≤ 5 min and lower than manual form | Timed tests, ≥ 5 testers (A-010, A-011) | R2 measured; F re-measured |
| GOAL-002 | AI extracts case fields correctly | Field-level extraction accuracy on required fields | ≥ 85 % | 50 hand-labelled reports | R2 |
| GOAL-003 | The right found record appears in the officer's shortlist | Recall@5; precision@1; precision@5 | ≥ 80 %; ≥ 60 %; reported as measured | Synthetic set, ~200 records, known pairs | R2 |
| GOAL-004 | Duplicate reports are detected | Duplicate-detection pairwise F1 | ≥ 0.8 | Synthetic set with seeded duplicates | R2 |
| GOAL-005 | Bangla voice is usable | Word error rate | ≤ 30 % | 20 scripted prompts, ≥ 3 speakers (A-012) | R2 |
| GOAL-006 | Every case shows a known status by district | Seeded cases shown with correct status | 100 % | Count comparison: register vs map | R2 |
| GOAL-007 | The live demo does not fail | Full scripted journey passes | 5 of 5 rehearsals; ≥ 1 with internet off (A-017) | Rehearsal log | F |
| GOAL-008 | Humans make every match decision | Match-driven status changes with a logged officer action | 100 % | Audit-log check | R2 |
| GOAL-009 | Results are reported honestly | Metrics slide | 1 slide, all 5 metrics, ≥ 2 failure examples | Deck review | R2 |

---

## 7 Non-goals

- Issuing, withdrawing or broadcasting alerts of any kind.
- Calling 13219, police or families on anyone's behalf.
- Face recognition or any photo-based search.
- Predicting which children will go missing, or why a child left.
- Deciding where a found child goes.
- Real police, CID or MUN Alert data before a partner agreement.
- Native mobile app, SMS or voice-call intake.
- Legal compliance certification under the Personal Data Protection Act (2026).

---

## 8 Scope

| MoSCoW | Item | One-line reason |
|---|---|---|
| Must | Bangla text intake with follow-up questions | Guaranteed path for the core demo journey. |
| Must | Bangla voice intake | Demo hero moment; low-literacy parents (A-001). |
| Must | Parent review and edit before submit | Safeguarding BR-004. |
| Must | GD draft | Demo: "act fast" output. |
| Must | Text poster without photo | Demo: shareable output (A-001); no photos per BR-006. |
| Must | Found-child logging by staff | Demo: the "found" side of the match. |
| Must | Matching: top 5 with reasons | Demo: match surfaced. |
| Must | Officer review queue, side-by-side evidence, confirm/reject | Safeguarding BR-001. |
| Must | Referral record and case closure | Safeguarding BR-005; demo: case closes. |
| Must | District map of statuses | Demo: closure visible. |
| Must | Role-based access; matched records officer-only | Safeguarding BR-007. |
| Must | Audit log | Safeguarding BR-010. |
| Must | Redact identifying payloads from eligible terminal cases | Safeguarding BR-009. |
| Must | Duplicate detection and its metric | Deck promises the metric in Round 2. |
| Must | Evaluation report for 5 metrics | Deck promises measured results. |
| Must | Manual form fallback and demo-safe mode | Venue internet unreliable; AI can fail. |
| Must | Synthetic seed data, labelled as synthetic | No real data (A-004). |
| Should | 13219-ready summary | Useful, not needed for the core journey. |
| Should | Public-text import | Adds sources; not needed for the scripted demo. |
| Should | Parent edits after submission | Edge case; text fix before submit covers the demo. |
| Could | Duplicate grouping screen | Detection already meets the metric. |
| Should | Parent case-status view | Nice to show "being checked". |
| Could | Disaster-mode screen | Theme link pending OQ-003. |
| Won't | Alerts, face matching, telecom location targeting, live police data | Out of mandate or no data. Shown only as [MOCK] on slides. |
| Won't | Dashboard filters, native app, SMS/IVR | Post-hackathon. |

---

## 9 User journeys

### 9.1 Primary happy path (core demo)

1. Parent opens Fera; Bangla is default (SCREEN-001).
2. Parent records a 40-second Bangla voice note (SCREEN-002).
3. Transcript appears; parent fixes one word.
4. Fera shows a case draft and asks one missing field: district (SCREEN-002).
5. Parent reviews all fields and confirms (SCREEN-003).
6. Parent copies the GD draft and poster text (SCREEN-004).
7. Staff at a station log a found boy (SCREEN-007).
8. Matching ranks the parent's case first among ≤ 5 candidates.
9. Officer opens the queue, compares evidence and confirms (SCREEN-009, SCREEN-010).
10. A simulated referral is recorded; officer records coordination closure for the missing case (SCREEN-012).
11. The missing-report category changes to Closed; the found report stays Referral recorded, and the pair is counted once (SCREEN-011).

### 9.2 First-time user

Parent arrives from a shared link. One screen explains in 2 Bangla lines what Fera does and does not do. It states that Fera does not alert police or CID. Parent taps "শুরু করুন" (Start) and lands in intake.

### 9.3 Returning user

- Parent returns on the same device; their own case and status appear (Should, SCREEN-006). Cross-device return is Won't (OQ-020).
- Officer signs in and lands on the review queue with new candidates first (SCREEN-008, SCREEN-009).

### 9.4 Error and recovery

| Situation | Behaviour |
|---|---|
| Voice note unintelligible | Ask to retry or type; draft kept. |
| Extraction fails twice | Manual form opens, pre-filled with any extracted fields (SCREEN-005). |
| Network drops mid-upload | Text and audio kept on device; retry button. |
| Officer opens a record they cannot see | "Not found" screen; attempt logged (SCREEN-016). |
| Officer rejects a match | Candidate removed; case returns to open if no other candidates. |

### 9.5 Empty state

- Review queue with no candidates: "No likely matches yet. New reports are checked automatically."
- Map with no cases in a district: district shown with 0 counts, not hidden.

### 9.6 Offline or speech/AI service unavailable

- Typed text and the manual form always work.
- Demo-safe mode returns stored outputs for scripted demo inputs (FR-027).
- Live parents see: voice unavailable, please type, with the reason in plain Bangla.

---

## 10 User stories

Screens are reserved here and fully specified in D3.

**STORY-001 · Must · Report by voice**
As a parent who cannot write well, I want to speak my report in Bangla so that I get a case without typing.
- Preconditions: microphone permission granted; voice note 5–120 s.
- AC1: Given a 5–120 s Bangla voice note, when uploaded, then an editable transcript appears within 20 s (p95).
- AC2: Given an unintelligible note, when processed, then the user is asked to retry or type, and no draft is created from it.
- AC3: Given no microphone permission, when the parent taps record, then the text box is focused and a Bangla notice explains why.
- Dependencies: DEP-001. Screens: SCREEN-002.

**STORY-002 · Must · Report by typed text**
As a parent, I want to describe my child in Bangla, English or a mix, so that I get a structured case without a form.
- Preconditions: none.
- AC1: Given 20–2,000 characters including Bangla numerals, when submitted, then a draft with extracted fields appears within 15 s (p95).
- AC2: Given "বয়স ১৩", when extracted, then age = 13.
- AC3: Given a field not stated in the text, then it is empty, never guessed.
- Dependencies: DEP-002. Screens: SCREEN-002.

**STORY-003 · Must · Answer follow-up questions**
As a parent, I want to be asked only for what is missing, one question at a time, so that I finish without a long form.
- AC1: Given a draft missing a required field (BR-015), when shown, then exactly one Bangla question asks for one missing field.
- AC2: Given 4 rounds without an answer, then the review screen opens with the field marked "unknown".
- Screens: SCREEN-002.

**STORY-004 · Must · Review before anything is shared**
As a parent, I want to check and correct the draft so that wrong details are never shared.
- AC1: Given a draft, when the parent edits a field and confirms, then the submitted case equals the edited values in 100 % of test runs.
- AC2: Given no confirmation, then nothing is visible to staff or officers, matched or exported.
- AC3: Given the same principal and submission UUID retried with identical reviewed values, then exactly one case exists and the reporter receives it. Reusing that UUID for a changed payload conflicts; a different UUID is a separate report, optionally flagged for review.
- Screens: SCREEN-003.

**STORY-005 · Must · Get a GD draft**
As a parent, I want ready-to-file GD text so that the thana can register the case quickly.
- AC1: Given a submitted case, when the parent taps "জিডি খসড়া" (GD draft), then Bangla text with child name or "অজানা" (unknown), age, last-seen place, date-time and reporter phone appears and can be copied.
- AC2: The text contains no fact absent from the confirmed fields.
- Screens: SCREEN-004.

**STORY-006 · Must · Get a shareable poster**
As a parent, I want a poster so that neighbours and groups can help look.
- AC1: Given a submitted case, the parent reviews description/place/date, chooses whether to include contact phone, sees 13219 and acknowledges sharing before copy/download. Export cannot be remotely recalled.
- AC2: The poster has no photo field and no alert wording (BR-002, BR-006).
- Screens: SCREEN-004.

**STORY-007 · Should · Get a 13219-ready summary**
As a parent, I want a short summary to read on a 13219 call.
- AC1: Given a submitted case, then a Bangla summary of ≤ 80 words appears.
- Screens: SCREEN-004.

**STORY-008 · Must · Log a found child**
As station staff, I want to log a found child quickly so that families elsewhere can be matched.
- AC1: Given the found-child screen, when staff enter a description, place and time and confirm, then a found case is opened within 15 s and matching runs.
- AC2: Median entry time ≤ 2 min in timed tests.
- Screens: SCREEN-007.

**STORY-009 · Must · See ranked candidates**
As a verifying officer, I want ranked candidates with reasons so that I check the likeliest first.
- AC1: Given eligible reports, when matching runs, then zero to five qualified current candidates appear with similarity, available evidence and unknowns. Eligibility alone never forces a suggestion; district is a soft feature.
- AC2: Candidates that fail BR-017 never appear.
- Screens: SCREEN-009.

**STORY-010 · Must · Compare and confirm a match**
As an officer, I want both records side by side so that I decide on evidence.
- AC1: Given a candidate, when opened, then missing and found fields appear in two aligned columns with agree/differ/unknown markers per field.
- AC2: Given the officer confirms, then the missing case becomes confirmed, the found case becomes referred, and a referral and an audit entry exist.
- Screens: SCREEN-010.

**STORY-011 · Must · Reject a candidate**
As an officer, I want to reject a wrong candidate so that it stops wasting time.
- AC1: Given a reject with a reason, then the candidate leaves the queue and the case returns to open if no other candidate is pending.
- AC2: The same pair is not suggested again unless either record is edited.
- Screens: SCREEN-010.

**STORY-012 · Must · Refer and close**
As an officer, I want a confirmed match to create a referral and let me close the case so that the outcome is recorded.
- AC1: Given a confirmed missing case with a referral, when the officer selects an outcome and closes, then the case is closed and the map count changes within 5 s of reload.
- AC2: Closing is impossible without a referral record.
- Screens: SCREEN-012.

**STORY-013 · Must · See the district picture**
As an officer, I want a district map of statuses so that I see where cases are open.
- AC1: Given seeded report rows, the map/table separately shows missing Open/Matched/Closed, found Open/Matched/Referral recorded and confirmed-pair counts. Each equals the corresponding register query and the counting basis is visible.
- AC2: Each status shows an icon, a text label and a colour.
- Screens: SCREEN-011.

**STORY-014 · Must · Detect duplicate reports**
As an officer, I want duplicate reports of one child flagged so that I do not review the same child twice.
- AC1: Given two records meeting BR-021, then both show "সম্ভাব্য একই শিশু" (possible same child) and are linked.
- AC2: Flagged links remain separate searchable reports. Only an explicit reviewed consolidation may change grouping, while preserving access to every report.
- Screens: SCREEN-012.

**STORY-015 · Should · Import synthetic public-format fixtures**
As an admin, I want to import invented news/alert-format fixtures so that the synthetic prototype can test intake from varied sources.
- AC1: Given invented fixture texts and example.invalid source URLs, each reviewed record is tagged synthetic and follows required-field/state rules. Real public-child material is rejected in V2.
- Screens: SCREEN-013.

**STORY-016 · Must · Redact identifying payloads from eligible terminal cases**
As an admin, I want to redact identifying payloads closed cases so that personal details are not kept longer than needed.
- AC1: Given closed missing cases and eligible referral-recorded found cases whose linked missing report is closed, when payload redaction runs, then name, phone, free text and sub-district place are removed and identifying payloads and related notes are redacted; IDs and aggregate fields remain under restricted access as pseudonymous records.
- Screens: SCREEN-013.

**STORY-017 · Must · Audit decisions**
As an admin or officer, I want every decision logged so that any outcome can be traced.
- AC1: Given any confirm, reject, close, edit, redact identifying payloads or denied access, then an entry with actor, role, action, record, time and reason exists.
- AC2: Entries cannot be edited or deleted through the product.
- Screens: SCREEN-012.

**STORY-018 · Must · Continue when AI fails**
As a parent, I want a plain form if the assistant fails so that I can still report.
- AC1: Given two failed extraction attempts or an AI service error, then the manual form opens within 2 s, pre-filled with any extracted fields.
- Screens: SCREEN-005.

**STORY-019 · Should · Edit after submission**
As a parent, I want to correct my case after submitting so that the match uses right details.
- AC1: Given a case in submitted, open or matched-pending-review, when edited and confirmed, then a new version is stored, pending candidates are voided and matching re-runs.
- AC2: Given a confirmed or closed case, then edit is not offered.
- Screens: SCREEN-006.

**STORY-020 · Should · See my case status**
As a parent, I want to see my case status without match details.
- AC1: Status shows one of Open / Being checked / Closed with date; no found-child data appears.
- Screens: SCREEN-006.

**STORY-021 · Could · Disaster-mode logging**
As a shelter volunteer after a flood, I want to log a separated child so that families can be matched.
- AC1: The screen reuses found-child logging and is labelled "পরিকল্পিত সম্প্রসারণ" (planned extension).
- Screens: SCREEN-015.

**STORY-022 · Must · Measure and report results**
As the team, we want one command to compute all 5 metrics so that the deck reports measured results.
- AC1: Given the labelled sets, when run, then a report lists all 5 metrics, the set sizes, the run date and ≥ 2 failure examples.
- Screens: none (report file).

**STORY-023 · Must · Run the demo without internet**
As the demo operator, I want the scripted journey to work offline so that venue Wi-Fi cannot break it.
- AC1: Given demo-safe mode and network disabled, when the scripted inputs are used, then the full §9.1 journey completes.
- AC2: Seeded records show a "synthetic" label.
- Screens: all Must screens.

---

## 11 Functional requirements

| ID | The system shall… | Pri | Story | Acceptance test | Notes |
|---|---|---|---|---|---|
| FR-001 | accept typed reports of 20–2,000 characters in Bangla, English or mixed script. | Must | STORY-002 | TC-002 | v2 FR1 |
| FR-002 | accept voice notes of 5–120 s and return an editable Bangla transcript. | Must | STORY-001 | TC-001 | v2 FR7; Must per A-001 |
| FR-003 | normalise Bangla digits and derive explicit Asia/Dhaka event intervals anchored to the recorded intake clock; ambiguous time requires review. | Must | STORY-002 | TC-002 | "গতকাল বিকেলে" → yesterday 16:00 ±2 h, flagged approximate |
| FR-004 | extract case fields from text, leaving unstated fields empty and never guessing. | Must | STORY-002 | TC-002 | v2 FR1; BR-008, BR-015 |
| FR-005 | ask at most four one-at-a-time follow-ups, then require accessible manual completion of unresolved mandatory fields. | Must | STORY-003 | TC-003 |  |
| FR-006 | show every extracted field as editable and require an explicit confirm. | Must | STORY-004 | TC-004 | v2 FR2 |
| FR-007 | keep drafts out of matching, staff/officer views and exports until confirmed. | Must | STORY-004 | TC-004 | BR-004 |
| FR-008 | generate a Bangla GD draft from a fixed template using confirmed fields only. | Must | STORY-005 | TC-005 | v2 FR3; A-008 |
| FR-009 | generate a reviewed no-photo poster with 13219, a separate sharing acknowledgement and optional contact inclusion. | Must | STORY-006 | TC-006 | v2 FR8; A-001 |
| FR-010 | generate a 13219-ready summary of ≤ 80 words. | Should | STORY-007 | TC-007 | v2 FR8 |
| FR-011 | let staff log a found child by form or free text and review before saving. | Must | STORY-008 | TC-008 | v2 FR4 |
| FR-012 | rank up to five qualified candidates nationally with evidence reasons and similarity scores; allow an empty shortlist. | Must | STORY-009 | TC-009 | v2 FR4; BR-018 |
| FR-013 | exclude candidate pairs that fail the hard filters in BR-017. | Must | STORY-009 | TC-009 | |
| FR-014 | list cases with pending candidates for verified officers, newest candidate first. | Must | STORY-009 | TC-009 | v2 FR5 |
| FR-015 | show missing and found records side by side with agree/differ/unknown per field. | Must | STORY-010 | TC-010 | |
| FR-016 | atomically record a verified candidate decision, current endpoint states, simulated referral recorded and safe audit; no receipt or custody claim. | Must | STORY-010, STORY-012 | TC-010 | BR-001, BR-005 |
| FR-017 | on reject with a reason, remove the candidate and apply BR-012 and BR-019. | Must | STORY-011 | TC-011 | |
| FR-018 | record coordination_recorded closure after confirmed/referral-recorded state, or resolved_outside_fera from open; neither proves safe reunification. | Must | STORY-012 | TC-010 |  |
| FR-019 | show separate missing-report, found-report and confirmed-pair district counts with accessible icon, text and colour. | Must | STORY-013 | TC-012 | v2 FR6; BR-014 |
| FR-020 | restrict candidates and matched records to verified officers per BR-024. | Must | STORY-009 | TC-022, TC-023 | BR-007 |
| FR-021 | write an append-only audit entry for every action listed in STORY-017. | Must | STORY-017 | TC-016 | BR-010 |
| FR-022 | flag possible duplicates while keeping every unreviewed report independently discoverable; shared phone alone never suppresses a report. | Must | STORY-014 | TC-013 | Detection only |
| FR-023 | provide optional reviewed reversible duplicate grouping/dismissal with profile evidence, reason and preserved original reports. | Could | STORY-014 | TC-013 | v2 FR10 |
| FR-024 | import invented fixture texts in public-report format with a synthetic label and source metadata; real public-child import is disabled in V2. | Should | STORY-015 | TC-014 | v2 FR9 |
| FR-025 | redact direct and related identifying payloads only from eligible terminal reports; retain active linked evidence. | Must | STORY-016 | TC-015 | BR-009 |
| FR-026 | open a pre-filled manual form after 2 failed extractions or an AI service error. | Must | STORY-018 | TC-017 | |
| FR-027 | in demo-safe mode, return stored outputs for scripted demo inputs with no network. | Must | STORY-023 | TC-021 | A-017 |
| FR-028 | report frozen held-out metrics with explicit denominators, abstention/coverage, cache exclusion and failure examples. | Must | STORY-022 | TC-020 |  |
| FR-029 | let parents edit a case after submission per BR-025, keeping all versions. | Should | STORY-019 | TC-018 | |
| FR-030 | show parents their own case status and authorised edit/output availability without candidate or other-party evidence. | Should | STORY-020 | TC-019 | BR-007 |
| FR-031 | idempotently return one case per principal and submission UUID; identical retry returns it, a changed payload conflicts, a new UUID remains a distinct report. | Must | STORY-004 | TC-031 |  |
| FR-032 | load synthetic seed records and label them "সিনথেটিক" (synthetic) on every screen. | Must | STORY-023 | TC-021 | BR-026 |
| FR-033 | default parent screens to Bangla with an English toggle on every screen. | Must | STORY-002 | TC-002 | |
| FR-034 | block generated or displayed text containing alert wording or "runaway" terms. | Must | STORY-005, STORY-006 | TC-024, TC-025 | BR-002, BR-003 |
| FR-035 | treat officer accounts as verified only when an admin marks them so. [MOCK: seeded accounts] | Must | STORY-009 | TC-023 | A-006 |
| FR-036 | provide a disaster-mode logging screen labelled as a planned extension. | Could | STORY-021 | TC-035 | OQ-003 |
| FR-037 | sign in staff, officers and admins with a role; parents need no account. | Must | STORY-008, STORY-009 | TC-023 | A-001 |

Mocked capabilities (not built; slide or placeholder only):

| Capability | Status | Where shown |
|---|---|---|
| Live police data | [MOCK] synthetic seed labelled "synthetic" | Seed data, all screens |
| Officer verification | [MOCK] seeded `verified` flag | FR-035 |
| Telecom location targeting | [MOCK] slide only | Deck roadmap |
| Face matching (CID-held records, human review) | [MOCK] slide only | Deck roadmap |

---

## 12 Non-functional requirements

| ID | Category | Requirement | Measure |
|---|---|---|---|
| NFR-001 | Performance | Parent intake screen usable on a mid-range Android over 4G | Interactive ≤ 3 s |
| NFR-002 | Performance | Text → draft | ≤ 15 s p95 |
| NFR-003 | Performance | 120 s voice note → transcript | ≤ 20 s p95 |
| NFR-004 | Performance | Matching for one case vs 500 records | ≤ 5 s |
| NFR-005 | Performance | District map with 1,000 cases | ≤ 2 s |
| NFR-006 | Performance | Concurrent users (A-020) | 50 users, error rate < 1 % |
| NFR-007 | Reliability | Scripted demo journey with network off | 5 of 5 rehearsals |
| NFR-008 | Reliability | Draft survives network loss; fallback form after AI failure | 0 lost drafts in tests; form ≤ 2 s |
| NFR-009 | Security | Encrypted transport; no secrets reach the browser; rate limits 10/min/user, 30/min/IP on AI actions | Inspection + test |
| NFR-010 | Privacy | No payload in logs/analytics; synthetic audio/text reaches declared providers before submit with notice; endpoint/account review remains pending | Log review: 0 phone numbers or names |
| NFR-011 | Accessibility | WCAG 2.2 AA; tap targets ≥ 44 × 44 px; text contrast ≥ 4.5:1 | Automated + manual audit, 0 AA failures on Must screens |
| NFR-012 | Usability | Parent stories completed unaided; any field corrected in 1 tap | ≥ 90 % completion, ≥ 5 testers |
| NFR-013 | Compatibility | Android browser at 360 px width; current desktop browsers; Bangla renders with no missing glyphs | Manual check on 2 phones, 2 desktop browsers |
| NFR-014 | Maintainability | AI provider switched by configuration only; setup from README | 0 code changes; setup ≤ 15 min |
| NFR-015 | Scalability | Register supports all 64 districts and 30,000 cases/year (74/day × 365 ≈ 27,000) without data-model change | Load test with 30,000 synthetic rows |
| NFR-016 | Cost | Total external AI spend from 9 Oct to 24 Oct | ≤ USD 30; ≤ 6 AI calls per case |
| NFR-017 | Auditability | Audit entries immutable through the product | 100 % of decisions logged; edit/delete attempts fail |

---

## 13 Business rules

### 13.1 Safeguarding rules (non-negotiable)

| ID | Rule | FRs | TCs |
|---|---|---|---|
| BR-001 | AI retrieves/ranks only. Active verified officers record candidate decisions; identity and guardian verification are external pilot gates. | FR-016, FR-017, FR-020 | TC-010, TC-023, TC-046 |
| BR-002 | No issuing, withdrawing or broadcasting alerts. Outputs are reviewed drafts; no CID integration is claimed. | FR-008, FR-009, FR-010, FR-034 | TC-024, TC-025 |
| BR-003 | No runaway labels, inferred absence reasons, or rescue promises. | FR-004, FR-034 | TC-024 |
| BR-004 | No submitted child payload, matching, other-party visibility, or export before reporter review/confirmation. Providers process intake after notice; pre-submit DB holds metadata only. | FR-006, FR-007 | TC-004, TC-060 |
| BR-005 | Confirm creates a simulated internal referral record. referred means referral recorded; no receipt, custody, return, or safe reunification is inferred. | FR-016, FR-018 | TC-010, TC-047 |
| BR-006 | No face search, photos, identity documents, exact coordinates, or physical return action in this release. | FR-009, FR-011, FR-020 | TC-026 |
| BR-007 | Candidates and other-party matched evidence are officer-only. Parent gets own scoped editable payload/status; staff gets own found payload/status. Admin gets aggregate/redacted metadata only. | FR-020, FR-030, FR-035 | TC-019, TC-022, TC-044, TC-045 |
| BR-008 | Only specified report fields are collected. Evidence quotes refer to reviewed source text; deterministic derivations retain source spans; unknowns remain unknown. | FR-004, FR-011 | TC-027, TC-060 |
| BR-009 | Admin redacts identifying payloads only after closure; found evidence is retained while linked missing case is unclosed. Retained IDs/date/district are pseudonymous, not irreversible anonymity. | FR-025 | TC-015, TC-050 |
| BR-010 | Decisions, state changes, edits, payload redaction and denied access have safe append-only audit events. Denials after rollback are logged separately; unknown case FK is null. | FR-021 | TC-016, TC-051, TC-052 |
| BR-011 | No unsupported legal compliance claim. Accurate primary-law references are permitted. Real-data processing requires qualified partner/legal/provider review. | FR-025, NFR-010 | TC-037, TC-066 |

### 13.2 Case state transitions

**BR-012 Missing report.** Browser draft is not a persisted case. Initial persisted state is submitted; submitted → open; open → matched_pending_review when at least one qualified candidate exists; matched_pending_review → open when none remain; matched_pending_review → confirmed only with an authorised decision and simulated referral; confirmed → closed for coordination_recorded; open → closed for resolved_outside_fera. Initial confirmed/closed insertion is prohibited. Unknown mandatory fields move to manual completion, not silent guessing.

**BR-013 Found report.** Initial state open; open ↔ matched_pending_review; matched_pending_review → referred only in the confirmation transaction. The UI says “রেফারেল নথিভুক্ত (সিমুলেশন)” / “Referral recorded (simulation)”. closed_at on referred is the coordination terminal timestamp, not a rescue timestamp.

Ordinary terminal edits and backward transitions are blocked. Before a pilot, a correction/reopen procedure must require two distinct verified reviewers, evidence, a reason, superseded decision linkage, and a preserved audit. This workflow is a pilot gate, not implemented by the V2 demo. Resetting an isolated synthetic dataset is permitted and labelled; it is not a real-case correction mechanism.

**BR-014 Counts.** Missing Open = submitted/open; Missing Matched = matched_pending_review/confirmed; Missing Closed = closed. Found Open = open; Found Matched = matched_pending_review; Found Referral recorded = referred. Confirmed pairs are counted once from confirmed candidate rows. Never sum missing+found rows and call the result unique children. All 64 district rows, including zeros, are shown. Flagged duplicates remain report rows; label the counting basis.

### 13.3 Validation

**BR-015 Required submission fields.** Missing: age or complete age range, sex selection (unknown allowed), district, non-empty last-seen place, event interval, and reporter phone. Found: description, district, place, event interval, staff contact; age may be unknown. Name is optional. District is mandatory for V2 and is confirmed through an accessible manual selector if extraction cannot resolve it. No field is guessed to unblock submit.

**BR-016 Field rules.** Missing ages 0–17. Exact age yields age_min = age_max = age_years; a range has both endpoints and no conflicting exact age. Found estimated ranges may extend to 25 to represent uncertainty; wholly adult profiles are not automatically treated as children. Store event instants with timestamptz and serialise explicitly in Asia/Dhaka. Exact events cannot be future; approximate bounds must be consistent with the intake time, and ambiguous/future periods are clarified. Phone format is 11 digits starting 01 after digit normalisation; this does not verify ownership. District codes 1–64 are internal identifiers, not official geocodes.

### 13.4 Match logic

**BR-017 Eligibility.** Opposite kinds; sex equal or unknown; age ranges overlap within ±2 years when both known, otherwise unknown is allowed with less evidence; found upper time ≥ missing lower time; live open/matched versions; neither record payload-redacted/confirmed/closed/referred. Evaluate uncertainty before pruning. Eligibility is necessary but not sufficient to suggest a candidate.

**BR-018 Ranking.** Retrieve eligible records nationally using exact filtered search for the ~200-record baseline. District/adjacency is a soft bonus, never a gate after five weak local results. L2-normalised embeddings share a pinned space/revision/prefix policy. Use clamped cosine and available-feature weight normalisation; missing feature values are null, not fabricated agreement. Calibrate qualification/abstention and dedupe thresholds on dev data, freeze before test, display at most five qualified candidates, and allow zero. Until calibrated, label ranking experimental and require explicit uncertain evidence. Score “মিলের মাত্রা” is not identity probability.

**BR-019 Rejections.** A rejected pair is not re-suggested at the same report versions. Editing creates new versions and invalidates old pending candidates. Display prior rejection history to the officer.

**BR-020 One-to-one by report.** At most one confirmed candidate per endpoint. The transaction locks endpoints in sorted UUID order, rechecks versions/authorisation, confirms one pair, voids other pending pairs, and reconciles each affected report's queue state. Duplicate report rows do not establish unique child identity.

**BR-021 Duplicates.** Shared phone creates only a weak flagged cue and cannot independently yield confirmed_same or suppress a report. Compatible profiles may create a possible-duplicate cue using dev-calibrated similarity, district and time evidence. Human review may confirm a link with profile evidence and a reason; preserve every original report and make consolidation reversible. V2 detection and pairwise F1 are Must; merge/group UI is Could. Flagged reports are always independently discoverable.

### 13.5 Generation, limits, permissions, edits

**BR-022 Outputs.** Fixed templates use only reporter-reviewed fields plus fixed instructions and 13219. Poster export has a separate preview/share acknowledgement and contact inclusion choice. Downloads cannot be remotely recalled; no photo does not mean no sensitive information. Cache deterministic output by case/type/version rather than generating five identical copies.

**BR-023 Limits.** Audio 5–120 s and ≤2 MB; codec/bitrate must satisfy both, and duration is verified server-side. Text 20–2,000 characters; at most four conversational follow-ups, then manual completion. At most six dispatched paid transcribe/extract calls per draft, including retries/fallbacks; authoritative metadata and atomic reservation enforce this across replay/concurrency. Retain the 10/min principal and 30/min network limits with HMAC-hashed network keys and short expiry. Fail closed for new paid calls if limit/budget state is unavailable; manual intake remains usable. Draft metadata expires after 24 h; parent sessions after 30 days with revocation. Device draft expiry is checked on access, not a claim of guaranteed physical deletion.

**BR-024 Permissions.** Parent: own missing creation/read/edit/output only. Staff/unverified officer: own found creation/read and found-only intake. Verified officer: candidate review/decision/closure, operational case list, aggregate dashboard and safe audit. Admin: redacted metadata, aggregate dashboard, safe audit, seeded verification [MOCK], redaction, synthetic import and rematch status; no candidate detail or decisions. Public health/auth responses expose no child payload. Every route checks ownership/role server-side; the client never supplies trusted authority.

**BR-025 Edits.** Owner edits only submitted/open/matched_pending_review with expected_version. Increment version, snapshot the old reviewed payload, void pending pairs, update affected states, and queue bounded reliable rematching. Terminal edits are rejected; payload redaction is a separate restricted action. Pilot correction procedure is required before accepting real cases.

**BR-026 Synthetic release.** Every demo/seed/import record is synthetic, with a visible label; real public child reports are not imported in V2. Model-quality evaluation disables fixtures and caches. Mock authority, cached outputs, compressed video time, and lack of integration are disclosed. No measured result is invented.

---

## 14 Assumptions

| ID | Assumption |
|---|---|
| A-001 | OQ-001 – OQ-007 unanswered; Turn 0 defaults apply: voice and poster Must, 13219 Should; separate missing/found state machine; disaster mode Could; one free LLM key plus paid speech key; deployed app for Round 2 and a laptop-local setup for the finale; nothing built and 0 interviews on 9 Oct; seeded staff/officer/admin logins, no "helper" role. |
| A-002 | Numeric targets are provisional and revised after the first evaluation run on 11 Oct. |
| A-003 | Personas are fictional, built from published reporting. |
| A-004 | No real police, CID or MUN Alert data is available before the finale. |
| A-005 | Parents use a smartphone browser with a microphone; feature phones are out of scope. |
| A-006 | Officer verification is a flag set by an admin on seeded accounts [MOCK]. |
| A-007 | A referral is a recorded entry with an agency name; no external integration. |
| A-008 | The GD draft uses a generic Bangla template; the official online GD field list is UNKNOWN (OQ-016). |
| A-009 | The parent reads the 13219 summary on their own call; Fera never contacts 13219. |
| A-010 | Usability testers are adult volunteers role-playing a parent, not real affected parents (OQ-019). |
| A-011 | The manual-form baseline is the same testers filling a plain form with the same fields. |
| A-012 | The speech test set is 20 scripted Bangla prompts recorded by ≥ 3 speakers. |
| A-013 | The team compiles a neighbouring-district list; if absent, search goes same district, then national (OQ-017). |
| A-014 | Duplicate thresholds (±1 year, 72 h) are provisional and tuned on the synthetic set. |
| A-015 | A 0–100 similarity score is understandable to officers if labelled as similarity. |
| A-016 | Drafts expire after 24 h. |
| A-017 | Demo-safe mode covers only scripted inputs for ≥ 3 named synthetic cases. |
| A-018 | Hosting and database run on free tiers; the USD 30 budget covers AI services only. |
| A-019 | Public reference data gives names and centroids for all 64 districts (DEP-004). |
| A-020 | 50 concurrent users is a PRD v2 target; realistic demo load is ≤ 10. |
| A-021 | A structured draft shortens the time to file a GD. |
| A-022 | Parents accept AI-drafted text if they can review and edit it. |
| A-023 | Low-literacy parents prefer speaking to typing. |
| A-024 | Public found-child notices exist in enough volume to be worth matching. |
| A-025 | Officers use a ranked queue if each candidate shows evidence side by side. |

---

## 15 Dependencies

| ID | Dependency | Owner | Needed by |
|---|---|---|---|
| DEP-001 | Speech-to-text service with Bangla support | Obidit | 11 Oct |
| DEP-002 | At least two interchangeable language-model services | Obidit | 10 Oct |
| DEP-003 | Text-similarity capability that also works offline for scripted inputs | Masnun | 11 Oct |
| DEP-004 | District reference data: 64 districts, Bangla/English names, centroids | Masnun | 11 Oct |
| DEP-005 | Synthetic set, ~200 records, known pairs, duplicates, decoys | Masnun | 11 Oct |
| DEP-006 | 50 hand-labelled reports | Masnun, Obidit | 11 Oct |
| DEP-007 | Public news and alert texts (public pages only) | Masnun | 12 Oct |
| DEP-008 | Free-tier hosting and database | Sadman | 10 Oct |
| DEP-009 | Finale kit: laptop, Android phone, mobile hotspot | Sadman | 23 Oct |
| DEP-010 | Mentor or organiser answers to OQ-003 and OQ-010 | Sadman | 13 Oct |
| DEP-011 | Base map display; offline fallback without map tiles | Masnun | 12 Oct |

---

## 16 Risks and mitigations

L = likelihood, I = impact (Low / Medium / High / Severe).

| ID | Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|---|
| RISK-001 | Core journey unfinished by 14 Oct official cutoff (time pending) | M | H | Cut order: disaster mode → 13219 → import → voice (typed path stays) | Sadman |
| RISK-002 | Bangla speech recognition too poor | H | M | Typed path is guaranteed; transcript editable; WER reported honestly | Obidit |
| RISK-003 | AI invents or misreads fields | M | H | Empty-not-guess rule; parent review; officer review | Obidit |
| RISK-004 | AI service outage, quota or spend over USD 30 | M | H | Second provider; manual form; spend tracked daily | Obidit |
| RISK-005 | Venue internet fails at the finale | M | H | Demo-safe mode; local setup; recorded video backup | Sadman |
| RISK-006 | Matching below targets | M | M | Tune rules on synthetic set; report as measured | Masnun |
| RISK-007 | Synthetic set too easy, inflating metrics | M | M | Include decoys and near-duplicates; label results "synthetic" | Masnun |
| RISK-008 | Stalker or trafficker misuse | L | Severe | BR-007, rate limits, audit of denied access | Sadman |
| RISK-009 | False match sends a child into danger | L | Severe | BR-001 human confirm; BR-005 referral before any return | Sadman |
| RISK-010 | Judges favour environment-themed projects | M | H | Disaster-mode slide; ask mentors (OQ-003) | Sadman |
| RISK-011 | "Why not just MUN Alert?" | H | M | Position Fera as the intake, matching and closure layer that feeds it | Sadman |
| RISK-012 | Overclaiming on metrics, interviews or law | M | H | Show only measured results; 0 interviews stated as 0; no legal claims | Sadman |
| RISK-013 | Bangla text renders badly on low-end phones | L | M | Test on 2 phones; embed a Bangla-capable font | Masnun |
| RISK-014 | Instructions hidden in imported public text steer the AI | M | M | Treat imported text as data only; parent/officer review; import is Should | Obidit |

---

## 17 Open questions

| ID | Question | Status / default |
|---|---|---|
| OQ-001 | Voice and poster Must for Round 2? | Default applied: both Must (A-001) |
| OQ-002 | Adopt the separate missing/found state machine? | Default applied: BR-012, BR-013 |
| OQ-003 | Mentor view on environment theme / disaster mode? | Default: Could (FR-036) |
| OQ-004 | Which accounts and keys exist? | Default: A-001; costs UNKNOWN until D2 |
| OQ-005 | Finale demo topology? | Default: local-capable finale (FR-027) |
| OQ-006 | What exists today; interviews held? | Default: nothing; 0 interviews |
| OQ-007 | Demo login and roles? | Default: FR-037, no helper role |
| OQ-008 | Use figures beyond the 5 in PROJECT CONTEXT? | Default: no (§3.4) |
| OQ-009 | WCAG 2.1 vs 2.2? | Default: 2.2 AA (NFR-011) |
| OQ-010 | Correct name of the CID unit that issues alerts? | Default: "CID via MUN Alert" |
| OQ-011 | Personal Data Protection Act (2026) specifics? | No clauses used; legal review before pilot |
| OQ-012 | Retention period for closed cases? | UNKNOWN; manual redact identifying payloads |
| OQ-013 | AI providers' training and retention terms? | Synthetic data only until checked |
| OQ-014 | Persona count? | 3 primary + PERSONA-004, PERSONA-005 |
| OQ-015 | Dedupe priority? | Detection Must, merge screen Could |
| OQ-016 | Official online GD field list and format? | UNKNOWN; generic template (A-008) |
| OQ-017 | Source for neighbouring-district adjacency? | Team-compiled (A-013) |
| OQ-018 | Which child-protection agency name should a referral show? | UNKNOWN; demo shows "শিশু সুরক্ষা সেবা" (child-protection services) |
| OQ-019 | Can usability tests ethically include real affected parents? | Default: no (A-010) |
| OQ-020 | Should parents return to a case from another device? | Default: Won't this release |

---

## 18 Definition of done

A requirement is done when all hold:

1. Its acceptance test (TC) passes on the deployed Round 2 build.
2. Bangla is the default text; English toggle works; Bangla numerals accepted.
3. Loading, empty, error and success states exist for its screen.
4. Any [MOCK] is labelled on screen and in the deck.
5. No personal data appears in logs.
6. Linked BRs pass their TCs.
7. No open AA accessibility failure on its screen.

Round 2 readiness requires demonstrated Must behaviour, an honest evaluation report and organiser-confirmed deliverables submitted through the confirmed channel before the official cutoff. A 5–8-slide deck and 1–2-minute video are internal working defaults pending the selection email. If scope is reduced, label omissions and update the release checklist; do not claim full Must completion.

---

## 19 Traceability matrix

TC IDs are reserved here; steps are written in D6.

| GOAL | STORY | FR | SCREEN | TC |
|---|---|---|---|---|
| GOAL-001 | STORY-001 – STORY-006 | FR-001 – FR-009, FR-031, FR-033 | SCREEN-001 – SCREEN-004 | TC-001 – TC-006, TC-031 |
| GOAL-002 | STORY-002, STORY-022 | FR-004, FR-028 | SCREEN-003 | TC-002, TC-020 |
| GOAL-003 | STORY-008, STORY-009, STORY-010 | FR-011 – FR-015, FR-028 | SCREEN-007, SCREEN-009, SCREEN-010 | TC-008, TC-009, TC-020 |
| GOAL-004 | STORY-014, STORY-022 | FR-022, FR-028 | SCREEN-012 | TC-013, TC-020 |
| GOAL-005 | STORY-001, STORY-022 | FR-002, FR-028 | SCREEN-002 | TC-001, TC-020 |
| GOAL-006 | STORY-012, STORY-013 | FR-016, FR-018, FR-019 | SCREEN-011, SCREEN-012 | TC-010, TC-012 |
| GOAL-007 | STORY-018, STORY-023 | FR-026, FR-027, FR-032 | SCREEN-005 + all Must screens | TC-017, TC-021 |
| GOAL-008 | STORY-010, STORY-011, STORY-017 | FR-016, FR-017, FR-020, FR-021, FR-035, FR-037 | SCREEN-008, SCREEN-010, SCREEN-012 | TC-010, TC-011, TC-016, TC-022, TC-023 |
| GOAL-009 | STORY-022 | FR-028 | — (deck) | TC-020 |
| Safeguarding | STORY-016 | FR-025 | SCREEN-013 | TC-015, TC-037 |
| Safeguarding | STORY-004, STORY-005, STORY-006 | FR-034 | SCREEN-004 | TC-024, TC-025, TC-026, TC-027 |
| Support | STORY-007 | FR-010 | SCREEN-004 | TC-007 |
| Support | STORY-015 | FR-024 | SCREEN-013 | TC-014 |
| Support | STORY-019, STORY-020 | FR-029, FR-030 | SCREEN-006 | TC-018, TC-019 |
| Support | STORY-021 | FR-036 | SCREEN-015 | TC-035 |
| Support | STORY-014 | FR-023 | SCREEN-014 | TC-013 |
| Rules | — | BR-012 – BR-021 | SCREEN-016 | TC-029, TC-030, TC-032 |
| NFRs | — | NFR-001 – NFR-017 | all | TC-028, TC-033, TC-034, TC-036 |

### Reserved screens (specified in D3)

| ID | Screen | Pri |
|---|---|---|
| SCREEN-001 | Welcome and language | Must |
| SCREEN-002 | Intake chat (voice/text) | Must |
| SCREEN-003 | Case review | Must |
| SCREEN-004 | Case submitted and outputs | Must |
| SCREEN-005 | Manual case form | Must |
| SCREEN-006 | Parent case status and edit | Should |
| SCREEN-007 | Found-child log | Must |
| SCREEN-008 | Sign-in | Must |
| SCREEN-009 | Review queue | Must |
| SCREEN-010 | Match review (side by side) | Must |
| SCREEN-011 | District dashboard | Must |
| SCREEN-012 | Case detail and audit trail | Must |
| SCREEN-013 | Admin data tools | Must |
| SCREEN-014 | Duplicate review | Could |
| SCREEN-015 | Disaster mode | Could |
| SCREEN-016 | Not found / not allowed | Must |

### Reserved test cases (written in D6)

| ID | Covers | ID | Covers |
|---|---|---|---|
| TC-001 | Voice intake | TC-020 | Evaluation report |
| TC-002 | Text intake, mixed script, Bangla numerals | TC-021 | Offline scripted demo |
| TC-003 | Follow-up questions | TC-022 | Unauthorised access to matched record |
| TC-004 | Review before share | TC-023 | Non-officer cannot confirm |
| TC-005 | GD draft fields, no invented facts | TC-024 | No alert or "runaway" wording |
| TC-006 | Poster, no photo | TC-025 | Outputs labelled as drafts |
| TC-007 | 13219 summary ≤ 80 words | TC-026 | No photo upload or face search |
| TC-008 | Found-child log | TC-027 | Data minimisation |
| TC-009 | Top-5 candidates, hard filters | TC-028 | No personal data in logs |
| TC-010 | Confirm → referral → close | TC-029 | One-to-one confirm lock |
| TC-011 | Reject → open, not re-suggested | TC-030 | Field validation |
| TC-012 | Map counts equal register | TC-031 | Duplicate submission guard |
| TC-013 | Duplicate flag and link | TC-032 | Illegal state transitions rejected |
| TC-014 | Public import with source URL | TC-033 | Accessibility audit |
| TC-015 | Payload redaction | TC-034 | Performance targets |
| TC-016 | Audit completeness | TC-035 | Disaster-mode screen |
| TC-017 | Manual form fallback | TC-036 | AI spend tracking |
| TC-018 | Edit after submission | TC-037 | No legal compliance claims |
| TC-019 | Parent status view hides match data | | |

---

## IDs introduced

- STORY-001 Report by voice
- STORY-002 Report by typed text
- STORY-003 Answer follow-up questions
- STORY-004 Review before sharing
- STORY-005 GD draft
- STORY-006 Shareable poster
- STORY-007 13219 summary
- STORY-008 Log a found child
- STORY-009 See ranked candidates
- STORY-010 Compare and confirm
- STORY-011 Reject a candidate
- STORY-012 Refer and close
- STORY-013 District picture
- STORY-014 Detect duplicates
- STORY-015 Import synthetic public-format fixtures
- STORY-016 Redact identifying payloads from eligible terminal cases
- STORY-017 Audit decisions
- STORY-018 Continue when AI fails
- STORY-019 Edit after submission
- STORY-020 See my case status
- STORY-021 Disaster-mode logging
- STORY-022 Measure and report results
- STORY-023 Run demo without internet
- FR-001 Typed intake
- FR-002 Voice intake
- FR-003 Numeral and date normalisation
- FR-004 Field extraction, no guessing
- FR-005 Follow-up questions
- FR-006 Editable review and confirm
- FR-007 Drafts isolated
- FR-008 GD draft
- FR-009 Poster
- FR-010 13219 summary
- FR-011 Found-child logging
- FR-012 Top-5 ranking with reasons
- FR-013 Hard filters
- FR-014 Review queue
- FR-015 Side-by-side evidence
- FR-016 Confirm action
- FR-017 Reject action
- FR-018 Close with outcome
- FR-019 District map
- FR-020 Officer-only matched records
- FR-021 Append-only audit
- FR-022 Duplicate detection
- FR-023 Duplicate grouping screen
- FR-024 Public-text import
- FR-025 Payload redaction
- FR-026 Manual form fallback
- FR-027 Demo-safe mode
- FR-028 Evaluation report
- FR-029 Edit after submission
- FR-030 Parent status view
- FR-031 Duplicate submission guard
- FR-032 Synthetic seed and label
- FR-033 Bangla default UI
- FR-034 Banned-wording filter
- FR-035 Officer verification [MOCK]
- FR-036 Disaster-mode screen
- FR-037 Role sign-in
- NFR-001 Intake load time
- NFR-002 Extraction time
- NFR-003 Transcription time
- NFR-004 Matching time
- NFR-005 Map load time
- NFR-006 Concurrency
- NFR-007 Offline demo reliability
- NFR-008 Draft survival and fallback time
- NFR-009 Security basics and rate limits
- NFR-010 Privacy in logs and AI sharing
- NFR-011 WCAG 2.2 AA
- NFR-012 Usability completion
- NFR-013 Compatibility
- NFR-014 Maintainability
- NFR-015 Scalability
- NFR-016 AI cost cap
- NFR-017 Audit immutability
- BR-001 Human confirms every match
- BR-002 No alerts
- BR-003 No "runaway" label
- BR-004 Review before share
- BR-005 Referral, not return
- BR-006 No face search or photos
- BR-007 Officer-only matched records
- BR-008 Data minimisation
- BR-009 Redact identifying payloads from eligible terminal cases
- BR-010 Append-only logging
- BR-011 PDPA in mind, no claims
- BR-012 Missing-case state machine
- BR-013 Found-case state machine
- BR-014 Map status grouping
- BR-015 Required fields
- BR-016 Field validation
- BR-017 Match hard filters
- BR-018 Ranking rules
- BR-019 Rejected pairs not re-suggested
- BR-020 One-to-one confirm
- BR-021 Duplicate rule
- BR-022 Generated text facts only
- BR-023 Limits
- BR-024 Permissions
- BR-025 Edits after submission
- BR-026 Synthetic/public labels
- A-001 – A-025 (one line each in §14)
- DEP-001 Speech service
- DEP-002 Two language-model services
- DEP-003 Text similarity, offline-capable
- DEP-004 District reference data
- DEP-005 Synthetic set
- DEP-006 Labelled set
- DEP-007 Public texts
- DEP-008 Hosting and database
- DEP-009 Finale kit
- DEP-010 Mentor answers
- DEP-011 Base map
- RISK-001 – RISK-014 (one line each in §16)
- OQ-016 GD format
- OQ-017 District adjacency source
- OQ-018 Referral agency name
- OQ-019 Ethics of testing with real parents
- OQ-020 Cross-device return
- SCREEN-001 – SCREEN-016 (reserved, one line each in §19)
- TC-001 – TC-037 (reserved, one line each in §19)

## IDs referenced

- GOAL-001 – GOAL-009 (00_Gap_Check_and_Registry)
- PERSONA-001 – PERSONA-005 (00_Gap_Check_and_Registry)
- OQ-001 – OQ-015 (00_Gap_Check_and_Registry)

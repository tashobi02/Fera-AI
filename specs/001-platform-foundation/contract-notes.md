# Feature 001 contract notes (TASK-061)

**Status**: Written with the runtime contracts in `src/contracts/` on lane `phase1--mahim-contracts`, 2026-10-14. The disagreements and derived shapes below must be reviewed before the `contracts-v1` freeze. Nothing here edits the protected spec pack or companions. (T002/T003; TEAM_HANDOVER_V2 §3)

## Disagreements found

| # | Where | Disagreement | Contract choice | Needs |
|---|---|---|---|---|
| CN-01 | D2A API-003 Validation vs D2A §5.2, API-003 Errors, D3 SCREEN-003 | API-003 says "same UUID/different payload → E-005", but E-006 `SUBMISSION_PAYLOAD_CONFLICT` (409) exists for exactly this case and is listed in API-003's own errors and in D3. | `classifySubmission` returns `conflict`, which routes map to **E-006**. | Spec-pack fix PR (D2A wording) |
| CN-02 | D2B §13 E-020 | E-020 has no Bangla/English user message ("reserved"), but D3 SCREEN-004 lists E-020 as an error state and the envelope needs both messages. | Placeholder bn/en message, flagged `placeholder: true`; the test asserts it is the only one. | Obidit (outputs) + `bengali-reviewer` |
| CN-03 | D3 SCREEN-010 success copy vs D1 BR-013, constitution VI | D3 says "Referral to child-protection services created" / "শিশু সুরক্ষা সেবায় রেফারেল তৈরি হয়েছে"; BR-013 requires "Referral recorded (simulation)" / "রেফারেল নথিভুক্ত (সিমুলেশন)". | `REFERRAL_RECORDED_LABEL` uses the BR-013 wording. | Spec-pack fix PR (D3) |
| CN-04 | D3 error rows vs D2B §13 | Wording drift: E-012 bn "ফর্মটি" (D3) vs "নিচের ফর্মটি" (D2B); E-024 en shorter in D3. | Messages are copied exactly from D2B §13, the error catalogue; a test compares them. | Spec-pack fix PR (D3) |
| CN-05 | Companion `OfficerCaseView` vs BR-015 found description, API-009 "raw supported field comparison", `descriptions_reviewed` checklist | The companion officer view has no `circumstances` (part of the required found description), `child.name_latin` or `reporter_relation` (both reviewed `cases` columns, D2A §5.4). | **Resolved toward the spec pack** (fera-review WARN 3): the officer view adds `event.circumstances`, `child.name_latin` and top-level `reporter_relation`. It is still assignable to the companion type (compile-time check is now one-directional). | Masnun acknowledgement (owns S-010) |
| CN-06 | Companion `CaseDraft.event.district_text` vs schema | No `cases` column stores `district_text`. | Owner/staff projections return `district_text: null`; `district_code` is authoritative. | None (recorded) |
| CN-07 | Companion `ErrorEnvelope.id: string`; `CreateMissingRequest.draft: CaseDraft` | The companion is wider than BR-015/016 and the error table. | Narrower runtime types: ids E-001–E-024 with key matching id; submission drafts enforce required fields. They remain assignable to the companion (compile-time test). | None (spec pack wins) |
| CN-08 | Companion `OfficerCaseView.is_synthetic: boolean` vs BR-026 | V2 is synthetic-only; every other view already uses `true`. | `officerCaseViewSchema.is_synthetic` is `z.literal(true)` (fera-review WARN 5). Widen only with a spec-pack change that admits non-synthetic data. | None (recorded) |
| CN-09 | Companion `OutputResponse.label_bn: string`, `CandidateDecisionView`/queue `qualified: boolean` | API-006 requires the draft label; API-008 returns only qualified candidates. | `label_bn` is the literal "খসড়া" (D4 honest labels) and `text_bn` must contain it; queue candidates have `qualified: true` (fera-review WARN 2, 4). API-009 keeps `qualified: boolean` because one candidate can be opened after it stops qualifying. | Obidit acknowledgement (outputs) |
| CN-10 | One audit DTO vs D2A §9.2 (officer "Operational", admin "Metadata only"), API-013 privacy | The first draft had one audit view with open string `details` (fera-safeguarding-reviewer BLOCK 1). | Split into `officerAuditEntryViewSchema` and `adminAuditEntryViewSchema`. `details` is a strict object: every key has a typed schema (status/outcome/output enums, ref codes, UUIDs, versions, counts, booleans, error IDs, API IDs), and no key accepts free text. Admin entries have no actor ID/display, candidate ID, score, rank, pair refs or decision. `projectAuditFor` keeps only allowlisted keys and throws on an unsafe stored value. | Review of the key list by the case-service owner (TASK-015) |

## Shapes derived from D2A text (not in `fera_types_v2.ts`)

These shapes were derived from D2A §5.5 prose. The owning lane should confirm or amend them before the freeze. Transcribe multipart fields (API-001), `ExtractRequest` (API-002), `CreateMissingResponse` with `replayed` and `outputs_available: OutputType[]` (API-003), `CreateFoundRequest/Response` (API-007), `UpdateCaseRequest` (API-005), `OutputRequest` (API-006), review queue query/response with a queue-candidate shape carrying the counterpart `OfficerCaseView` (API-008, Masnun), close request/response (API-011), safe audit entry (API-013), import request/response (API-015), redaction request with D3's typed confirmation "বেনামী" and response (API-016), verify user (API-017), my reports (API-018), health (API-019), sign-in and session summary (API-020), page/user list (API-021), case list (API-022), duplicate decision response (API-023) and `IntakeDraftMetadata` (ENTITY-015 columns only).

## Audit detail keys (API-013)

- **Both views**: `ref_code` (the audited case only), `version`, `from_status`, `to_status`, `outcome`, `output_type`, `error_id`, `api`, `mode` (`pseudonymisation`), `external_copies_removed` (`false`), `referral_simulated` (`true`), `reason_recorded`, `replayed`, `verified`, `target_role`, `fields_changed` (field-path enum), and the counts `imported`, `skipped`, `duplicates_flagged`, `redacted`.
- **Officer only**: `candidate_id`, `missing_ref`, `found_ref`, `missing_version`, `found_version`, `candidate_status`, `decision`, `score` (similarity 0–100), `rank`, `duplicate_status`, `duplicate_rule`, `contact_viewed`.
- **Never**: reason/note text, names, phones, place text, provider payloads, URLs, network addresses. STORY-017 AC1 requires that a reason exists; the view only exposes `reason_recorded`.
- `action` keeps the `audit_log` CHECK `^[a-z_.]{3,60}$`. The pack names only `match.confirm`, `match.reject`, `case.payload_redacted` and `access.denied`, so other action codes are left to TASK-015.
- Officer `actor_display` is the staff/officer/admin display name (2–80 characters, no phone and no run of 5+ digits). It is always `null` for parent actors.

## Route obligations (not enforceable in the contracts)

- **Extract source spans (API-002)**: `caseDraftSchema` checks that every span matches `source_text`. It cannot require a span for each non-null extracted field, because a reviewed manual edit legitimately has none. The intake lane must enforce that in its tests: every non-null extracted or derived value has a supported span, otherwise it becomes unknown (D2A §2.1). Owner: Obidit, TASK-012/013.
- **`fixture_id` (API-001)**: the route must reject it with E-001 unless protected `DEMO_MODE` is on. A fixture result must come back with `cached: true` and the visible cached label. Owner: Obidit.
- **Denied access audit**: when `projectCaseFor`, `projectCandidateFor` or `projectAuditFor` returns null, the route answers E-004 and writes an `access.denied` audit entry for a signed-in caller. The case FK is null when the record is absent (BR-010, D2B E-004). Owner: TASK-015.
- **Unsafe audit value**: if `projectAuditFor` throws, the route answers E-021 and logs the event without the value.

## Rule interpretations to review

- **Unknown keys**: request bodies strip them, so client authority (owner, author, role, synthetic flag) is ignored (D2A §9.3, API-010 "author ID ignored"). Response DTOs, drafts and nested evidence are strict and reject extra keys, so a leaked field fails parsing.
- **Event interval**: `at`, `at_lower` and `at_upper` are required. The check is lower ≤ at ≤ upper, and an exact event has equal bounds (SQL CHECK). `at` and `at_upper` may not be later than the server clock at parse time, with zero skew, matching the SQL trigger on `event_at_lower`.
- **Phone**: the contract maps Bangla digits to ASCII and strips spaces, hyphens, dots and parentheses, then requires `^01[0-9]{9}$`. It does not strip a `+88` prefix; COMP-008 may normalise that first.
- **Ages**: a missing exact age fills `age_min = age_max = age_years` on submission. For found reports, `age_years` stays 0–17 (SQL column), and older single estimates use `age_min = age_max` up to 25.
- **Found description**: circumstances, clothing and marks must together give at least 3 trimmed characters (SQL CHECK). The issue path is `event.circumstances`.
- **Evidence**: keys come from the `EVIDENCE_FIELDS` dotted-path allowlist. Each span's length must equal its quote, and the quote must equal the `source_text` slice (D2A §2.1). Field-value support is still the intake lane's check.
- **Errors**: `retryable` is true only where D2B recovery repeats the same action (E-007, E-014, E-016, E-021, E-024). `fallback: "manual_form"` applies to E-012, E-013, E-014 and E-023 (D2B → SCREEN-005). E-022 and E-024 have `http: null` and are typed out of `httpStatusFor`.
- **Status group**: a referred found report groups as `closed`, because `StatusGroup` has no referral value. Dashboard counts keep the BR-014 `referral_recorded` category.
- **Dashboard**: requires exactly 64 unique district rows, and totals must equal the district sums. Examples use `[MOCK]` district names because TASK-009 district data is not loaded.
- **Masked phone**: first 3 and last 2 digits are shown, with 6 bullets between. The format is not specified in the pack.
- **Limits**: "≤2 MB" audio is read as 2 MiB; this is an open decision for Obidit. Page `limit` is 1–50 with no default, because the pack gives no default.

## Still open after this PR

- FV-01–FV-05 and FV-10 are **not closed** by contracts alone. The handover still requires transaction/HTTP/DB, concurrency, provider-dispatch and count-lifecycle evidence from TASK-015, TASK-062 and the owning lanes.
- `contracts-v1` is tagged only after human review and merge (T003).
- The SHA-256 hashing of `canonicalJson(parsed draft)` and the token signing/verification are server work (T015, TASK-063). They are not part of the contracts.

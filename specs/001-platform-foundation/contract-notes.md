# Feature 001 contract notes (TASK-061)

**Status**: Written with the runtime contracts in `src/contracts/` on lane `phase1--mahim-contracts`, 2026-10-14. The disagreements and derived shapes below must be reviewed before the `contracts-v1` freeze. Nothing here edits the protected spec pack or companions. (T002/T003; TEAM_HANDOVER_V2 §3)

## Disagreements found

| # | Where | Disagreement | Contract choice | Needs |
|---|---|---|---|---|
| CN-01 | D2A API-003 Validation vs D2A §5.2, API-003 Errors, D3 SCREEN-003 | API-003 says "same UUID/different payload → E-005", but E-006 `SUBMISSION_PAYLOAD_CONFLICT` (409) exists for exactly this case and is listed in API-003's own errors and in D3. | `classifySubmission` returns `conflict`, which routes map to **E-006**. | Spec-pack fix PR (D2A wording) |
| CN-02 | D2B §13 E-020 | E-020 has no Bangla/English user message ("reserved"), but D3 SCREEN-004 lists E-020 as an error state and the envelope needs both messages. | Placeholder bn/en message, flagged `placeholder: true`; the test asserts it is the only one. | Obidit (outputs) + `bengali-reviewer` |
| CN-03 | D3 SCREEN-010 success copy vs D1 BR-013, constitution VI | D3 says "Referral to child-protection services created" / "শিশু সুরক্ষা সেবায় রেফারেল তৈরি হয়েছে"; BR-013 requires "Referral recorded (simulation)" / "রেফারেল নথিভুক্ত (সিমুলেশন)". | `REFERRAL_RECORDED_LABEL` uses the BR-013 wording. | Spec-pack fix PR (D3) |
| CN-04 | D3 error rows vs D2B §13 | Wording drift: E-012 bn "ফর্মটি" (D3) vs "নিচের ফর্মটি" (D2B); E-024 en shorter in D3. | Messages are copied exactly from D2B §13, the error catalogue; a test compares them. | Spec-pack fix PR (D3) |
| CN-05 | Companion `OfficerCaseView` vs BR-015 found description, API-009 "raw supported field comparison" | The officer view has no `circumstances` (part of the required found description), `name_latin` or reporter relation, though the confirm checklist asks the officer to review descriptions. | Follows the companion exactly (types are checked for equality). | Masnun + Mahim decision before freeze |
| CN-06 | Companion `CaseDraft.event.district_text` vs schema | No `cases` column stores `district_text`. | Owner/staff projections return `district_text: null`; `district_code` is authoritative. | None (recorded) |
| CN-07 | Companion `ErrorEnvelope.id: string`; `CreateMissingRequest.draft: CaseDraft` | The companion is wider than BR-015/016 and the error table. | Narrower runtime types: ids E-001–E-024 with key matching id; submission drafts enforce required fields. They remain assignable to the companion (compile-time test). | None (spec pack wins) |

## Shapes derived from D2A text (not in `fera_types_v2.ts`)

These shapes were derived from D2A §5.5 prose. The owning lane should confirm or amend them before the freeze. Transcribe multipart fields (API-001), `ExtractRequest` (API-002), `CreateMissingResponse` with `replayed` and `outputs_available: OutputType[]` (API-003), `CreateFoundRequest/Response` (API-007), `UpdateCaseRequest` (API-005), `OutputRequest` (API-006), review queue query/response with a queue-candidate shape carrying the counterpart `OfficerCaseView` (API-008, Masnun), close request/response (API-011), safe audit entry (API-013), import request/response (API-015), redaction request with D3's typed confirmation "বেনামী" and response (API-016), verify user (API-017), my reports (API-018), health (API-019), sign-in and session summary (API-020), page/user list (API-021), case list (API-022), duplicate decision response (API-023) and `IntakeDraftMetadata` (ENTITY-015 columns only).

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

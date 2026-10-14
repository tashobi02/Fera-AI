# Feature 001 contract notes (TASK-061)

**Status**: Written with the runtime contracts in `src/contracts/` on lane `phase1--mahim-contracts`, 2026-10-14. Updated after fera-review round 1 (safeguarding BLOCK and WARNs) and round 2 (TypeScript, security and database WARNs). The disagreements, derived shapes and open decisions below must be reviewed before the `contracts-v1` freeze. Nothing here edits the protected spec pack or companions. (T002/T003; TEAM_HANDOVER_V2 §3)

## Module layout

- `@/contracts` (`src/contracts/index.ts`) is client-safe: schemas, types, enums, error envelope, labels and limits.
- `@/contracts/server` (`src/contracts/server/`) is server-only. It holds the DB row types, principals and the D2A §9.2 matrix (`canCall`, `canIntake`), the principal-gated projections (`projectCaseFor`, `projectCaseListFor`, `projectQueueFor`, `projectCandidateFor`, `projectAuditFor`), submission scope, classification and hashing, intake metadata and `parseSignInRequest`. The detail mappers (`toOfficerCaseView` and the others) are not exported. The module imports `node:crypto`.
- `src/contracts/examples.ts` holds typed fakes and is in neither barrel. ESLint `no-restricted-imports` forbids it outside `tests/` and `fakes/`. It also forbids `docs/code/**` (the spec companion) in `src/`, and `@/contracts/server` in `src/components/**` and `src/app/**/*.tsx`. Route handlers (`route.ts`) and `src/server/**` may import the server barrel.
- Runtime code never imports `docs/code/fera_types_v2.ts`. The server row types are hand-written, and `tests/contracts/companion-types.test.ts` checks them against the companion at compile time.
- **Naming**: `XRequest` / `XQuery` is the parsed (`z.output`) type a service receives. `XRequestInput` / `XQueryInput` is what a client sends (`z.input`).

## Disagreements found

| # | Where | Disagreement | Contract choice | Needs |
|---|---|---|---|---|
| CN-01 | D2A API-003 Validation vs D2A §5.2, API-003 Errors, D3 SCREEN-003 | API-003 says "same UUID/different payload → E-005", but E-006 `SUBMISSION_PAYLOAD_CONFLICT` (409) exists for exactly this case. It is listed in API-003's own errors and in D3. | `classifySubmission` returns `conflict`, which routes map to **E-006**. | Spec-pack fix PR (D2A wording) |
| CN-02 | D2B §13 E-020 | E-020 has no Bangla/English user message ("reserved"), but D3 SCREEN-004 lists E-020 as an error state and the envelope needs both messages. | Placeholder bn/en message, flagged `placeholder: true`; the test asserts it is the only one. | **Open**: Obidit (outputs) + `bengali-reviewer` |
| CN-03 | D3 SCREEN-010 success copy vs D1 BR-013, constitution VI | D3 says "Referral to child-protection services created" / "শিশু সুরক্ষা সেবায় রেফারেল তৈরি হয়েছে"; BR-013 requires "Referral recorded (simulation)" / "রেফারেল নথিভুক্ত (সিমুলেশন)". | `REFERRAL_RECORDED_LABEL` uses the BR-013 wording. | Spec-pack fix PR (D3) |
| CN-04 | D3 error rows vs D2B §13 | Wording drift: E-012 bn "ফর্মটি" (D3) vs "নিচের ফর্মটি" (D2B); E-024 en shorter in D3. | Messages are copied exactly from D2B §13, the error catalogue; a test compares them. | Spec-pack fix PR (D3) |
| CN-05 | Companion `OfficerCaseView` vs BR-015 found description, API-009 "raw supported field comparison", `descriptions_reviewed` checklist | The companion officer view has no `circumstances` (part of the required found description), `child.name_latin` or `reporter_relation`. Both of the last two are reviewed `cases` columns (D2A §5.4). | **Resolved toward the spec pack**: the officer view adds `event.circumstances`, `child.name_latin` and top-level `reporter_relation`. It is still assignable to the companion type. | **Open**: Masnun acknowledgement (owns S-010) |
| CN-06 | Companion `CaseDraft.event.district_text` vs schema | No `cases` column stores `district_text`. | Projections return `district_text: null`. Submission drafts force it to null, and `submissionPayloadHash` leaves it out. `district_code` is authoritative. | None (recorded) |
| CN-07 | Companion `ErrorEnvelope.id: string`; `CreateMissingRequest.draft: CaseDraft` | The companion is wider than BR-015/016 and the error table. | Narrower runtime types: IDs E-001–E-024 with the key matching the ID; submission drafts enforce the required fields. They remain assignable to the companion. | None (spec pack wins) |
| CN-08 | Companion `OfficerCaseView.is_synthetic: boolean` vs BR-026 | V2 is synthetic-only; every other view already uses `true`. | `officerCaseViewSchema.is_synthetic` is `z.literal(true)`. Widen it only with a spec-pack change that admits non-synthetic data. | None (recorded) |
| CN-09 | Companion `OutputResponse.label_bn: string`, `CandidateDecisionView`/queue `qualified: boolean` | API-006 requires the draft label; API-008 returns only qualified candidates. | `label_bn` is the literal "খসড়া" (D4 honest labels), and `text_bn` must contain it. Queue candidates have `qualified: true`, and `projectQueueFor` filters out the rest. API-009 keeps `qualified: boolean` because a candidate can be opened after it stops qualifying. | **Open**: Obidit acknowledgement (outputs) |
| CN-10 | One audit DTO vs D2A §9.2 (officer "Operational", admin "Metadata only"), API-013 privacy | The first draft had one audit view with open string `details`. | Separate officer and admin entry schemas. `details` is a strict object of typed safe keys with no free text. Admin entries have no actor identity, candidate ID, score, rank, pair refs or decision. See "Audit" below. | Key list review by the case-service owner (TASK-015) |
| CN-11 | Companion `DecisionResponse` vs D2A §5.4 "explicit endpoint state/version" | The companion has no endpoint versions and types both statuses as `CaseStatus`. | `missing`/`found` each carry `ref_code`, a kind-correct status (`MissingStatus` / `FoundStatus`) and `version`. Only a confirmation may set `confirmed`/`referred`. Still assignable to the companion. | None (spec pack wins) |
| CN-12 | SQL future check vs BR-016 | The SQL trigger only rejects a future `event_at_lower`. | The contract also rejects a future `at` or `at_upper`, as a deliberate tightening, with a `CLOCK_SKEW_MS` (2 min) allowance. | None (recorded) |
| CN-13 | Companion `ExtractResponse.missing_fields: string[]`, `NextQuestion.field: string` | The companion uses open strings. | Both are the `DRAFT_FIELD_PATHS` enum (the dotted paths also used for evidence keys and audit `fields_changed`). | Obidit acknowledgement (intake) |
| CN-14 | `users.display_name` CHECK (2–80) | SQL allows any characters. | `displayNameSchema` also rejects a phone-like value or a run of 5+ digits, so a display name cannot carry a number into session, admin-user or audit views. Seed accounts must comply. | Masnun (seed) |

## Shapes derived from D2A text (not in `fera_types_v2.ts`)

These shapes were derived from D2A §5.5 prose. The owning lane should confirm or amend them before the freeze:

- API-001 transcribe multipart fields
- API-002 `ExtractRequest`
- API-003 `CreateMissingResponse`, with `replayed` and `outputs_available: OutputType[]`
- API-005 `UpdateCaseRequest`
- API-006 `OutputRequest`
- API-007 `CreateFoundRequest/Response`
- API-008 review queue query/response (Masnun): queue rows and counterparts are `OfficerCaseRow` with a masked phone
- API-011 close request/response
- API-013 audit entries and the `withheld` count
- API-015 import request/response
- API-016 redaction request, with D3's typed confirmation "বেনামী", and response
- API-017 verify user
- API-018 my reports (now carries `kind: "missing"`)
- API-019 health
- API-020 sign-in and session summary
- API-021 page and user list
- API-022 case list (`OfficerCaseRow`)
- API-023 duplicate decision response
- `IntakeDraftMetadata` (ENTITY-015 columns only, server-only)

## Audit (API-013)

- **Both views**:
  - case-level keys: `ref_code` (the audited case only), `version`, `from_status`, `to_status`, `outcome`, `output_type`, `error_id`, `api`
  - fixed-value keys: `mode` (`pseudonymisation`), `external_copies_removed` (`false`), `referral_simulated` (`true`)
  - flags: `reason_recorded`, `replayed`, `verified`, `target_role`, `fields_changed` (field-path enum)
  - counts: `imported`, `skipped`, `duplicates_flagged`, `redacted`
- **Officer only**:
  - pair: `candidate_id`, `missing_ref`, `found_ref`, `missing_version`, `found_version`
  - decision and score: `candidate_status`, `decision`, `score` (similarity 0–100), `rank`
  - other: `duplicate_status`, `duplicate_rule`, `contact_viewed`
- **Never**: reason/note text, names, phones, place text, provider payloads, URLs, network addresses. STORY-017 AC1 requires that a reason exists; the view exposes only `reason_recorded`.
- `projectAuditFor(principal, auditedCase, rows, onWithheld?)`:
  - It keeps a row only if its `case_id` is the audited case and any `ref_code` is that case's own ref.
  - It drops unknown keys, then parses each row strictly.
  - A row that fails is **withheld and counted** (`withheld`), so one bad row does not take the endpoint down.
  - The hook receives only `{ index, errorId: "E-021" }`, never the row, its values or Zod issues. Zod issues are never logged, and parsing never enables `reportInput`.
- Trigger-required actions are exported as `AUDIT_ACTIONS`: `match.confirm`, `match.reject`, `case.payload_redacted` and `access.denied` (from D2B E-004). `action` keeps the SQL CHECK `^[a-z_.]{3,60}$`. Other action codes are named by TASK-015.

## Validation policies

- **Unknown keys**: request bodies strip them, so client authority (owner, author, role, synthetic flag) is ignored (D2A §9.3, API-010 "author ID ignored"). Response DTOs, drafts and nested evidence are strict and reject extra keys.
- **Text**:
  - Optional reviewed text is trimmed, and blank becomes `null` ("unknown stays unknown").
  - Required text is trimmed, then length-checked.
  - Raw input is capped at 2× the post-trim maximum before trimming.
  - `source_text` is not trimmed, because evidence offsets point into it.
  - Column caps are `FIELD_MAX_CHARS`, taken from the SQL CHECKs. `.max()` counts UTF-16 units, so it is never looser than SQL `length()` (code points).
  - Evidence quotes are capped at 500.
  - `LIMITS.jsonBodyBytes` (64 KiB) is the route's body cap.
- **UUIDs**: `z.guid()` accepts any 8-4-4-4-12 hex value, which Postgres accepts too, including fixed seed IDs such as `00000000-0000-0000-0000-000000000001`. It is then lowercased, so the sorted-UUID lock order and `duplicate_links.case_a < case_b` compare like text. **Masnun's seed** may use fixed IDs but should store them lowercase.
- **Times** (D2A §5.1 "+06:00"):
  - Client-entered times (draft event times, import `fixture_intake_at`) accept any explicit offset, with at most millisecond precision. They are canonicalised to `YYYY-MM-DDTHH:mm:ss[.sss]+06:00` before validation and hashing.
  - Server and response times must already be `+06:00`, with up to microsecond digits (timestamptz).
  - Comparisons are at millisecond precision, which is exact for client times because finer digits are rejected.
- **Event interval**: `at`, `at_lower` and `at_upper` are required. The rule is lower ≤ at ≤ upper, and an exact event has equal bounds (SQL CHECKs). A future `at` or `at_upper` is rejected beyond `CLOCK_SKEW_MS` (CN-12).
- **Phone**: Bangla digits map to ASCII, and spaces, hyphens, dots and parentheses are stripped, then `^01[0-9]{9}$` is required. A `+88` prefix is not stripped; COMP-008 may normalise it first.
- **Ages**: a missing exact age fills `age_min = age_max = age_years` on submission. For found reports, `age_years` stays 0–17 (SQL column), and older single estimates use `age_min = age_max` up to 25.
- **Found description**: `foundDescriptionLength` mirrors `length(trim(concat_ws(' ', circumstances, clothing, marks))) >= 3`. NULLs are skipped, parts are joined with spaces, and only spaces are trimmed. Code points are counted, so two emoji (4 UTF-16 units) do not pass.
- **Extract request**:
  - A request sends exactly one of `text` or `answer`.
  - `text` cannot carry `draft` or `draft_revision`.
  - `answer` requires `draft`, `draft_token` and `draft_revision`.
  - `draft_revision` requires `draft_token`.
  - `draft.kind` must equal `kind`.
  - `canIntake(principal, kind)` enforces parent → missing, staff/officer → found.
- **Outputs**: `word_count` must equal `countWords(text_bn)`, and the helpline ≤80-word limit is checked on the counted words.
- **Errors**: `errorEnvelope("E-007", { seconds })` requires a positive whole number of seconds (an overload). Other IDs take no parameters. The envelope schema rejects a leftover `{s}`. `retryable` is true only for E-007, E-014, E-016, E-021 and E-024. `fallback: "manual_form"` applies to E-012, E-013, E-014 and E-023. E-022 and E-024 are client-only, with `http: null`.
- **URLs, cursors, query integers**:
  - `source_url` must be `https:`, with no userinfo, on host `example.invalid` or a subdomain of it, at most 500 characters. This applies to import requests and the officer view.
  - Cursors are opaque base64url tokens with an optional signature segment; the server verifies the signature.
  - Query integers must be plain decimal strings ("0x1A", "1e1", " 5 ", "5.0", "05" fail).
- **Sign-in**: the username is trimmed and lowercased. `parseSignInRequest` maps every failure to the generic E-002 (API-020), never E-001.
- **Status helpers**:
  - `statusGroup` takes a narrowed `{kind, status}`. `kindStatus` throws on a pair the SQL forbids, and every view refines kind↔status, the M-/F- prefix and `status_group`.
  - A referred found report groups as `closed`; dashboard counts keep `referral_recorded`.
  - `EDIT_LOCKED_STATUSES` are confirmed, closed and referred; `REDACTABLE_STATUSES` are closed and referred. Both are checked against the triggers and CHECKs.
  - `allowedCloseOutcome`: confirmed → `coordination_recorded`, open → `resolved_outside_fera`. SQL enforces only the first direction.
- **Dashboard**:
  - It requires exactly 64 unique district rows.
  - Totals must equal the district sums.
  - `confirmed_pairs` must equal `found_reports.referral_recorded`.
  - lat/lng must be within the SQL bounds (20–27, 88–93).
- **Verified flag**: it can be true only for officers, in session and admin-user views (users CHECK). `userPrincipal` drops it for non-officers.
- **Masked phone**: the first 3 and last 2 digits are shown, with 6 bullets between. The pack does not specify the format.
- **Limits**: "≤2 MB" audio is read as 2 MiB, an open decision for Obidit. Page `limit` is 1–50 with no default, because the pack gives no default.

## Route obligations (not enforceable in the contracts)

- **Principals (B6)**:
  - Build them per request with `parentPrincipal(sessionRow)` / `userPrincipal(userRow)` from database rows.
  - `verified` and `is_active` are read from `users` on every request, never trusted from JWT claims alone.
  - A parent session must be unexpired and unrevoked.
  - Owner checks use `sameId`, so missing IDs never match.
  - Owner: TASK-015 / TASK-063.
- **Contact access (B4)**: a raw `contact_phone` appears only in single-case detail (API-004 officer view, `contactServed: true`) and candidate detail (API-009, both endpoints). The route writes a `contact_viewed` audit entry each time it serves one (D2A §5.4). List and queue rows (`OfficerCaseRow`) carry the masked phone only. Owner: TASK-015, Masnun for API-008.
- **Denied access audit**: when any projection returns null, the route answers E-004 and writes an `access.denied` audit entry for a signed-in caller. The case FK is null when the record is absent (BR-010, D2B E-004). Owner: TASK-015.
- **Audit ref (B7)**: the route passes the audited case's own `{ id, ref_code }` to `projectAuditFor`, and the case service writes `details.ref_code` only for that case.
- **Extract source spans (API-002)**: `caseDraftSchema` checks that every span matches `source_text`. It cannot require a span for each non-null extracted field, because a reviewed manual edit legitimately has none. The intake lane must enforce that every non-null extracted or derived value has a supported span, or else becomes unknown (D2A §2.1). Owner: Obidit, TASK-012/013.
- **`fixture_id` (API-001)**: reject it with E-001 unless protected `DEMO_MODE` is on. A fixture result is returned with `cached: true` and the visible cached label. Owner: Obidit.
- **Submission idempotency**:
  - Hash the **parsed** draft with `submissionPayloadHash`.
  - Classify with `classifySubmission(submissionScopeFor(principal) + client UUID, existing, hash)`.
  - Re-read and re-classify after a 23505 unique-violation race.
  - Owner: TASK-015.
- **Body size**: reject JSON bodies over `LIMITS.jsonBodyBytes` before parsing.

## Open decisions (recorded, not implemented)

- **OD-1 E-001 field paths**: TC-030 expects four field paths, but the strict envelope cannot carry them. Proposal: an optional `fields: string[]` of dotted draft paths only (no values) in the envelope. This needs a D2A §5.1 spec PR first.
- **OD-2 E-020 copy**: see CN-02.
- **OD-3 hash after edits and redaction (TASK-015)**: there are two questions. Does API-005 recompute `submission_payload_hash` after an owner edit, or keep the original submission hash so a late replay of the first submit still replays? Redaction nulls the hash, and a replay after redaction then classifies as `create`. Should it instead be refused?
- **OD-4 `server-only` package**: `import "server-only"` would make a client import of `@/contracts/server` a build error. The package is not installed, and adding it is a new dependency; the ESLint rule covers UI paths meanwhile.
- **OD-5 acknowledgements**: Masnun for CN-05, CN-09 (queue), CN-14 and lowercase seed IDs; Obidit for CN-09 (outputs), CN-13 and the intake route obligations.

## Still open after this PR

- FV-01–FV-05 and FV-10 are **not closed** by contracts alone. The handover still requires transaction, HTTP, DB, concurrency, provider-dispatch and count-lifecycle evidence from TASK-015, TASK-062 and the owning lanes.
- `contracts-v1` is tagged only after human review and merge (T003).
- Token signing and verification are server work (TASK-063).

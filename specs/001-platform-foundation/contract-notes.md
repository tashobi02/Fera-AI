# Feature 001 contract notes (TASK-061)

**Status**: Written with the runtime contracts in `src/contracts/` on lane `phase1--mahim-contracts`, 2026-10-14. Updated after fera-review round 1 (safeguarding BLOCK and WARNs), round 2 (TypeScript, security and database WARNs) and round 3 (pre-freeze signature and hardening items). The disagreements, derived shapes and open decisions below must be reviewed before the `contracts-v1` freeze. Nothing here edits the protected spec pack or companions. (T002/T003; TEAM_HANDOVER_V2 §3)

## Module layout

- `@/contracts` (`src/contracts/index.ts`) is client-safe: schemas, types, enums, error envelope, labels and limits.
- `@/contracts/server` (`src/contracts/server/`) is server-only. It holds the DB row types, principals and the D2A §9.2 matrix (`canCall`, `canIntake`), the principal-gated projections (`projectCaseFor`, `projectCaseListFor`, `projectQueueFor`, `projectCandidateFor`, `projectAuditFor`), submission scope, classification and hashing, intake metadata and `parseSignInRequest`. The detail mappers (`toOfficerCaseView` and the others) are not exported. The module imports `node:crypto`.
- `@/contracts/access` is client-safe: the pure permission helpers (`canCall`, `canIntake`, `effectiveRole`, `API_ACCESS`) for server components and UI that hide controls. Routes still run their own checks.
- **Branded `Principal`**: only `parentPrincipal()` and `userPrincipal()` can mint one, from database rows; an object literal does not type-check. Tests use `tests/support/principals.ts`, which calls the same constructors.
- **Fakes**:
  - `src/contracts/examples.ts` holds typed fakes for route-handler and service tests. It is in neither barrel and imports only `server/intake`, `server/principal`, `server/projections` and `server/rows`, never the barrel with `node:crypto`.
  - UI lanes use `@/contracts/client-examples` (`clientExamples`). These are the same DTO values stored as `client-examples.json`, validated with client-safe schemas only, with no server code. A test keeps the JSON in sync (`UPDATE_CLIENT_EXAMPLES=1` regenerates it).
- **ESLint `no-restricted-imports`**:
  - Both fakes modules are allowed only in `tests/` and `src/**/fakes/**`.
  - `docs/code/**` (the spec companion) is banned in `src/`.
  - `@/contracts/server` and relative `**/contracts/server/**` are banned in `src/components/**`, `src/app/**/*.tsx`, `src/hooks/**` and `src/lib/**/*.client.ts(x)`.
  - Route handlers (`route.ts`) and `src/server/**` may import the server barrel.
  - Files marked `"use client"` elsewhere cannot be matched by path, so OD-4 (`server-only`) remains the real fix.
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
| CN-11 | Companion `DecisionResponse` vs D2A §5.4 "explicit endpoint state/version" | The companion has no endpoint versions, types both statuses as `CaseStatus` and allows every candidate status. | `candidate_status` is `confirmed` or `rejected`. `missing`/`found` each carry `ref_code`, a kind-correct status (`MissingStatus` / `FoundStatus`) and `version`. Only a confirmation may set `confirmed`/`referred`. Still assignable to the companion. | None (spec pack wins) |
| CN-12 | SQL future check vs BR-016 | The SQL trigger (`enforce_case_transition()`) rejects only a future `event_at_lower`, against `clock_timestamp()` with zero skew. | The submission parser mirrors that exactly: `at_lower` must not exceed now, with zero skew, and the issue path is `event.at_lower`. As a deliberate tightening, it also rejects a future `at` or `at_upper`, with a `CLOCK_SKEW_MS` (2 min) allowance for device clocks. A remaining app-vs-DB clock difference is a route obligation (SQLSTATE 23514 → E-001). | None (recorded) |
| CN-13 | Companion `ExtractResponse.missing_fields: string[]`, `NextQuestion.field: string` | The companion uses open strings. | Both are the `DRAFT_FIELD_PATHS` enum (the dotted paths also used for evidence keys and audit `fields_changed`). | Obidit acknowledgement (intake) |
| CN-15 | D2A §5.1 envelope example vs D6 TC-030 "E-001 with 4 paths", D2B E-001 "Zod issue paths; highlight fields" | The §5.1 example envelope has no field list, but the test plan and the error table require the paths. | **Resolved per D6/D2B**: E-001 may carry optional `fields`, which is up to 32 unique dotted draft paths from `DRAFT_FIELD_PATHS`, with no messages and no values. `fieldsFromZodIssues(issues)` maps issue paths (dropping a leading `draft`) and drops anything unknown. Any other ID with `fields` is rejected. | D2A §5.1 wording note for a later spec PR |
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
  - A row whose jsonb `details` is not a plain object (null, array, scalar) is withheld; it is never dereferenced.
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
  - Column caps are `FIELD_MAX_CHARS`, taken from the SQL CHECKs. With Zod 4.6.7, pinned exactly, `.max()` counts code points, like SQL `length()`, so the caps agree character for character. A Zod upgrade must recheck this.
  - Every SQL-capped text column must be a `FIELD_MAX_CHARS` key, except the explicitly unmapped `referrals.note`, which no API carries.
  - U+0000 is rejected in every text builder, `source_text`, evidence quotes, reasons and display names (Postgres text/jsonb reject it).
  - Evidence quotes are capped at 500.
  - Body caps: `LIMITS.jsonBodyBytes` (64 KiB) by default, and `LIMITS.importBodyBytes` (512 KiB) for API-015.
- **UUIDs**: `z.guid()` accepts any 8-4-4-4-12 hex value, which Postgres accepts too, including fixed seed IDs such as `00000000-0000-0000-0000-000000000001`. It is then lowercased, so the sorted-UUID lock order and `duplicate_links.case_a < case_b` compare like text. **Masnun's seed** may use fixed IDs but should store them lowercase.
- **Times** (D2A §5.1 "+06:00"):
  - Client-entered times (draft event times, import `fixture_intake_at`) accept any explicit offset, with at most millisecond precision. They are canonicalised to `YYYY-MM-DDTHH:mm:ss[.sss]+06:00` before validation and hashing.
  - Server and response times must already be `+06:00`, with up to microsecond digits (timestamptz).
  - Comparisons are at millisecond precision, which is exact for client times because finer digits are rejected.
  - Years must be four digits, 1000–9999, as a format rule. The canonical output is re-validated, so a shift past 9999 is rejected rather than emitted as a six-digit ISO year. A domain lower bound is OD-6.
  - **Row-mapping rule**: DB timestamps arrive as `+06:00` strings, possibly with microseconds. Views accept them as-is, and draft event times are truncated to milliseconds (`toMillisecondIso`) because drafts are client-editable input.
- **Event interval**: `at`, `at_lower` and `at_upper` are required. The rule is lower ≤ at ≤ upper, and an exact event has equal bounds (SQL CHECKs). `at_lower` may not exceed now (zero skew, as in SQL), and `at`/`at_upper` may not exceed now + `CLOCK_SKEW_MS` (CN-12).
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
  - Intake metadata ties `kind` to its scope: missing ↔ `session_id`, found ↔ `user_id`.
  - Submission drafts drop the `event.district_text` evidence key along with the field (CN-06).
- **Outputs**: `word_count` must equal `countWords(text_bn)`, and the helpline ≤80-word limit is checked on the counted words.
- **Errors**:
  - Overloads: `errorEnvelope("E-007", { seconds })`, `errorEnvelope("E-001", { fields? })`, and a general `(id: ErrorId, params?)` so error mappers need no cast.
  - At runtime, E-007 without positive whole seconds throws, and `fields` on any ID but E-001 throws. The envelope schema rejects a leftover `{s}`. `retryable` is true only for E-007, E-014, E-016, E-021 and E-024. `fallback: "manual_form"` applies to E-012, E-013, E-014 and E-023. E-022 and E-024 are client-only, with `http: null`.
- **URLs, cursors, query integers**:
  - `source_url` must be `https:`, with no userinfo, on host `example.invalid` or a subdomain of it, at most 500 characters. Control characters, whitespace and backslashes are rejected. The value is canonicalised to its WHATWG `href` before storage and serving. This applies to import requests and the officer view.
  - Cursors must be `payload.signature` (base64url); unsigned cursors fail parsing, and the server verifies the signature.
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
- **Officer views**:
  - When a raw `contact_phone` is present, `contact_phone_masked` must equal its mask.
  - `age_years` (0–17), `age_min`/`age_max` (0–25) and `height_cm` (40–220) are bounded like SQL.
  - A queue candidate's `counterpart.kind` is the opposite of the queued case's kind.
- **Decisions**: a blank confirm `reason` becomes `undefined`. Reject still needs 3–500 characters.
- **Masked phone**: the first 3 and last 2 digits are shown, with 6 bullets between. The pack does not specify the format.
- **Limits**: "≤2 MB" audio is read as 2 MiB, an open decision for Obidit. Page `limit` is 1–50 with no default, because the pack gives no default.

## Route obligations (not enforceable in the contracts)

- **Principals (B6)**:
  - Build them per request with `parentPrincipal(sessionRow)` / `userPrincipal(userRow)` from database rows.
  - `verified` and `is_active` are read from `users` on every request, never trusted from JWT claims alone.
  - A parent session must be unexpired and unrevoked.
  - Owner checks use `sameId`, so missing IDs never match.
  - Owner: TASK-015 / TASK-063.
- **Contact access (B4)**: a raw `contact_phone` appears only in single-case detail (API-004 officer view, `contactServed`) and candidate detail (API-009, `contactServed: { missing, found }`). The route writes a `contact_viewed` audit entry each time it serves one (D2A §5.4). List and queue rows (`OfficerCaseRow`) carry the masked phone only. Owner: TASK-015, Masnun for API-008.
- **Denied access audit**: when any projection returns null, the route answers E-004 and writes an `access.denied` audit entry for a signed-in caller. The case FK is null when the record is absent (BR-010, D2B E-004). Owner: TASK-015.
- **Audit ref (B7)**: the route passes the audited case's own `{ id, ref_code }` to `projectAuditFor`, and the case service writes `details.ref_code` only for that case.
- **Extract source spans (API-002)**: `caseDraftSchema` checks that every span matches `source_text`. It cannot require a span for each non-null extracted field, because a reviewed manual edit legitimately has none. The intake lane must enforce that every non-null extracted or derived value has a supported span, or else becomes unknown (D2A §2.1). Owner: Obidit, TASK-012/013.
- **`fixture_id` (API-001)**: reject it with E-001 unless protected `DEMO_MODE` is on. A fixture result is returned with `cached: true` and the visible cached label. Owner: Obidit.
- **Submission idempotency**:
  - Hash the **parsed** draft with `submissionPayloadHash`.
  - Classify with `classifySubmission(submissionScopeFor(principal) + client UUID, existing, hash)`.
  - Re-read and re-classify after a 23505 unique-violation race.
  - Owner: TASK-015.
- **Body size**: reject a body over the route's cap before parsing: `LIMITS.jsonBodyBytes`, or `LIMITS.importBodyBytes` for API-015.
- **Draft token (D2A §9.4)**: on API-002 and API-003/007, the verified token's draft row must match the principal (session or user), the request `kind` and `draft_revision`. Any mismatch fails as E-019/E-001; the token's embedded counters are never trusted.
- **Cursors**: the schema requires the signature segment; the server verifies it, and an unsigned or forged cursor is E-001.
- **Close outcome (API-011)**: if `outcome` differs from `allowedCloseOutcome(current status)`, the route answers E-005. A confirmed report closed without a referral answers E-017.
- **Event lower bound race**: if the insert fails with SQLSTATE 23514 from "event interval starts in future" (app and DB clocks differ), map it to E-001 with `fields: ["event.at_lower"]`.
- **Withheld audit rows**: log only the row index and E-021, never the row, its values or Zod issues.

## Open decisions (recorded, not implemented)

- **OD-1 E-001 field paths**: resolved as CN-15.
- **OD-2 E-020 copy**: see CN-02.
- **OD-3 hash after edits and redaction (TASK-015)**: does API-005 recompute `submission_payload_hash` after an owner edit, or keep the original hash so a late replay of the first submit still replays? Separately, `redact_case()` nulls `client_submission_id`, `submission_payload_hash` **and** `reporter_session_id` (or `created_by_user_id`), so after redaction the idempotency lookup key no longer exists. A stale replay of the original submission would classify as `create` and insert a second report. TASK-015 must refuse it, which needs a tombstone decision: for example, a non-identifying `(scope hash, client_submission_id)` record kept after redaction. **UNKNOWN**: needs a decision.
- **OD-4 `server-only` package**: `import "server-only"` would make a client import of `@/contracts/server` a build error. The package is not installed, and adding it is a new dependency; the ESLint rule covers UI paths meanwhile.
- **OD-6 time lower bound**: the contract applies only the format range (years 1000–9999). The earliest acceptable event or intake time is a spec decision; it is **UNKNOWN** and none is invented.
- **OD-5 acknowledgements**: Masnun for CN-05, CN-09 (queue), CN-14 and lowercase seed IDs; Obidit for CN-09 (outputs), CN-13 and the intake route obligations.

## Still open after this PR

- FV-01–FV-05 and FV-10 are **not closed** by contracts alone. The handover still requires transaction, HTTP, DB, concurrency, provider-dispatch and count-lifecycle evidence from TASK-015, TASK-062 and the owning lanes.
- `contracts-v1` is tagged only after human review and merge (T003).
- Token signing and verification are server work (TASK-063).

## API layer open decisions (TASK-007)

These come from the shared route layer in `src/app/api/_shared/`, after fera-review on 2026-10-14. None of them changes the contracts.

- **API-OD-1 Shared limiter store**: only `MemoryRateLimitStore` exists. Each instance counts on its own, so limits do not hold across Vercel instances. COMP-021 plans Postgres `rate_limits` (`INSERT … ON CONFLICT … RETURNING count`) together with a configured HMAC key secret. The in-memory keyer uses a random secret per process. Owner: Mahim, TASK-062/015. **Gate**: no paid route (API-001/002) ships on the memory store. In production the layer logs `ratelimit.memory_store` at error level.
- **API-OD-2 Laptop finale addresses**: `x-forwarded-for` is trusted only when `TRUST_PROXY=1` or on Vercel. Without a proxy every client shares one network bucket, so all demo devices share the 30/min AI network limit and the 300/min pre-auth limit. That is acceptable for a few devices; set `TRUST_PROXY=1` only behind a proxy that overwrites the header.
- **API-OD-3 Unknown request keys**: request bodies strip unknown keys (D2A §9.3, "client authority ignored"), while D2B §10.1 says "reject unknown keys". A spec decision is needed before strict request schemas.
- **API-OD-4 AGENTS chain wording**: the layer runs the coarse role guard before Zod (unauthenticated callers never see validation behaviour), then Zod, then `authorize`. AGENTS.md says "Zod input → role guard". This needs a docs PR.
- **API-OD-5 Next-generated responses**: Next's own 404 (unknown path) and 405 (unexported method) are not enveloped and carry no `x-request-id`.
- **API-OD-6 Paid limiter fallback**: when the limiter is down, a paid route answers E-013 (manual form, BR-023), and other fail-closed rules answer E-021. COMP-021's fail-open applies only to the sign-in and pre-auth rules.
- **API-OD-7 Denial audit**: the layer writes `access.denied` through the injected `auditDenied` for every signed-in E-003/E-004 denial. Handlers throw `ApiError("E-004", { caseId })` and must not write the row themselves. Until TASK-015 provides the hook, a signed-in denial is E-021.

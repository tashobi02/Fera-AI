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
- **API-OD-7 Denial audit**: the layer writes `access.denied` through the injected `auditDenied` for every signed-in E-003/E-004 denial. Handlers throw `ApiError("E-004", { caseId })` and must not write the row themselves. Until TASK-015 provides the hook, a signed-in denial is E-021. TASK-015 now installs it (`auditAccessDenied`, `src/server/audit/denied.ts`); a failed denial write still answers E-021.

## Case service open decisions (TASK-015)

These come from the case service and audit logger in `src/server/case/` and `src/server/audit/` (evidence: `docs/execution/evidence/platform-case-service.md`). None of them changes the contracts or the schema.

- **OD-015-1 E-005 vs E-006 for a changed submission payload**: D2A API-003 says "same UUID/different payload → E-005", but the contracts have `E-006 SUBMISSION_PAYLOAD_CONFLICT` (D2B §13), and API-007 lists E-006. The service answers **E-006** for both kinds. The D2A wording needs a docs PR.
- **OD-015-2 `voided` vs `superseded`**: D1 BR-020, STORY-019 and D3 row 12 say competitors and edited-away candidates are *voided*; D6 TC-029 says the other candidate is *superseded*. The service uses `voided` for both. `superseded` is not written by the case service; the matcher (TASK-017) may use it when a rematch replaces pending rows at the same versions. Needs Masnun and an all-owner decision.
- **OD-015-3 TASK-015 audit action codes live in `src/server/audit/actions.ts`**, not in the frozen contracts: `case.created`, `case.submission_replayed`, `case.state_changed`, `case.edited`, `case.closed`, `case.contact_viewed`, `match.voided`, `referral.recorded` (plus the contract's `match.confirm`, `match.reject`, `access.denied`). Adding them to `AUDIT_ACTIONS` in contracts is a later all-owner PR. The audited `actor_type` is the **effective** role: an unverified officer acting with staff permissions is recorded as `staff` (BR-024).
- **OD-015-4 Idempotency after edit and redaction (follow-up of OD-3)**: `fera_app` cannot update `submission_payload_hash`, so an owner edit keeps the original hash. A late retry of the *original* submission then replays (200, same ref, now the edited report). After `redact_case()` the lookup key (`client_submission_id`, owner) is NULL, so a stale replay of the original submission would create a **second** report. Refusing it needs a non-identifying tombstone, which is a schema decision. **UNKNOWN**; not implemented. **Proposed mitigation (15 Oct, not yet agreed):** TASK-022 clears the device draft and `client_submission_id` after a 2xx, so a stale replay cannot resend the child's details; owners to agree in the TASK-022 PR.
- **OD-015-5 No "defer" decision**: `decision_t` is confirm | reject and no screen or API names a deferral. A candidate left pending is deferred; nothing is written.
- **OD-015-6 Matcher lock protocol (needs Masnun's acknowledgement)**: lock every endpoint case FOR UPDATE in ascending UUID order in one pass (`lockCases`) before inserting or updating `match_candidates`, then call `reconcileQueueState` in the same transaction. An unlocked candidate insert takes KEY SHARE on both endpoints through its foreign keys and can deadlock with a decision. The deadlock would be retried (`withTransaction`, 3 attempts), but it should not happen. The test helper `addCandidate` in `tests/db/support/db.ts` does not lock, because it never runs concurrently.
- **OD-015-7 Refused-transaction audit (done in fera-review round 1)**: D2B §10.1 says "rejected transaction audit is written after rollback", and BR-010 says "denials after rollback are logged separately".
  - **E-003/E-004:** written as `access.denied` by the API-layer hook, for guard and handler denials alike.
  - **E-005/E-017/E-018 from an officer decision, a closure or an owner edit:** one row after the rollback (`match.refused`, `case.close.refused`, `case.edit.refused`), with `{ error_id, api }` only and FKs only when those rows exist. A failed refusal write fails the call closed with E-021.
  - **Not audited:** E-006 submission conflicts and E-001 validation failures. They appear only in the request log line.

  Owners to confirm the scope.
- **OD-015-8 Page-denial details**: the page hook stores `{ error_id: "E-004" }` only. The pathname is not an API-013 details key, so it is not stored. Adding a safe `path_kind` key would be a contract change.
- **OD-015-9 `case_versions` semantics**: one row per *replaced* version, holding the old version number, the old reviewed payload as `snapshot` and the editor's actor type as `edited_by`. No row exists for the current version, and none is written at creation. Owners to confirm.
- **OD-015-10 `submitted → open` is audited as `system`**: `openCase` requires the owning parent, but records the step with the `system` actor, because it is an automatic pipeline step (D2A §3.4 step 6).
- **OD-015-11 Closing with leftover pending candidates**: `resolved_outside_fera` requires `open` (contract `allowedCloseOutcome`). If an `open` report still has a pending candidate (a matcher inconsistency), the deferred pair check refuses the closure and the service answers E-005. Whether closure should void pending candidates instead is not specified.
- **OD-015-12 Edit side effects**: an owner edit sets `matching_state = 'queued'` and clears the embedding and model metadata so the matcher re-embeds. `input_hash` is left unchanged. A CHECK failure on the edit UPDATE maps to E-005, not E-001; the contract parse should prevent it.
- **OD-015-13 Lock timeout**: `fera_app` has `lock_timeout = 5s`. Since round 1, a 55P03 is retried once, after a short jittered backoff. A second timeout reaches the API layer as E-021, which is retryable. The value is not tuned for load.
- **OD-015-14 Audit growth from probes (new)**: every signed-in denial writes `access.denied`, every identical resubmission writes `case.submission_replayed`, and every refused decision, closure or owner edit writes `match.refused`, `case.close.refused` or `case.edit.refused`. A parent session or a signed-in client can therefore grow `audit_log` at the route's rate limit (per instance, API-OD-1). Throttling or coalescing repeated identical rows (same actor, action, case and error within a window) is an open decision. Rows must stay append-only, so any throttle has to drop at write time with a counted summary, never delete. When API-005/010/011 land, they need a per-principal limit, not only the network pre-auth limit.
- **OD-015-15 `server-only` (new)**: the `server-only` package is not installed (OD-4), so `src/server/case` and `src/server/audit` carry no `import "server-only"`. The ESLint client-path rule and the server-only contracts barrel remain the guard.
- **OD-015-16 FOR UPDATE kept on purpose (new)**: decisions, edits and closures lock cases with `FOR UPDATE`, not `FOR NO KEY UPDATE`, so concurrent foreign-key inserts that reference those cases wait until the decision ends. That covers candidate inserts and audit rows. Unlocked candidate inserts cannot interleave, at the cost of short waits for audit inserts on the same cases.
- **OD-015-17 Unindexed lookups (schema follow-ups, new)**: `referrals (missing_case_id)` used by `closeCase`, `duplicate_links (case_b)` used by the officer duplicate cues, `audit_log (candidate_id)` and `audit_log (request_id)` have no index in the frozen schema. They are acceptable at demo size (about 200 reports); add indexes in a schema PR before any larger dataset.

## Output open decisions (TASK-023)

These come from the output generator and wording guard in `src/server/outputs/` and API-006 (evidence: `docs/execution/evidence/outputs-templates.md`). None of them changes the contracts or the schema.

- **CN-09 (outputs), proposed acknowledgement, pending Obidit's confirmation in the PR:** the implementation follows CN-09. `label_bn` is the literal "খসড়া" and every `text_bn` contains it. The templates open with D3's card label "খসড়া — নিজে জমা দিন".
- **OD-023-1 Poster contact choice (FR-009, STORY-006 AC1, BR-022)**: `outputRequestSchema` is `{ type }` only, and `generated_outputs` keeps one row per (case, type, version), so the server cannot store a poster with and one without the phone. The poster text always includes the reporter phone, which TC-006 expects. **Proposed, not yet agreed:** S-004 (TASK-024) shows the share preview, the acknowledgement and the contact choice, and drops the fixed line `তথ্য থাকলে যোগাযোগ করুন: …` client-side when the parent declines. The alternative is an `include_contact` contract field plus a schema change (all-owner PR). Owners: Obidit and Mahim.
- **OD-023-2 Reports with no visible draft**: an edit-locked (confirmed, referred, closed) or redacted report has `draft: null` in the owner view. API-006 then answers E-016 without reading the cache, so the parent never receives payload text the owner view hides (BR-025). The E-016 copy ("try again") does not fit this case. **Proposed:** S-004/S-006 hide the output actions when `editable` is false. Owners: Obidit and Mahim. Separately, the output transaction re-checks the case `FOR SHARE` (same version, not redacted, editable status) before it reads or writes outputs. This serialises with `redact_case` and owner edits, so no output is written after redaction. A two-session PostgreSQL test holds a version bump on the case, checks that `getOutput` waits on the lock, and asserts E-016 with no row written (`tests/db/outputs.test.ts`).
- **OD-023-3 Template wording**: the GD and poster wording is not from the spec pack (D7 OQ-016: the official GD field list is open). Only the draft label, "ফেরা পুলিশে জিডি জমা দেয় না।" and "জরুরি হলে ১৩২১৯-এ কল করুন।" reuse D3/D4 copy. The `bengali-reviewer` agent's fixes are applied ("শেষবার দেখা গিয়েছিল" from D4 §10, "বিনীত নিবেদন এই যে", the "নিখোঁজ শিশু" heading, an inline thana, a line asking the parent to add name, signature and date). Still needs a human Bangla review (for example "বিকেল ৩:০০" against "দুপুর ৩টা"), and a mentor or police check before any claim that a thana accepts the format.
- **OD-023-4 No per-principal limit on API-006**: D2A lists E-007, but no output limit is specified, and none is invented. Only the pre-auth network limit applies. Repeats are cheap (cached), but a parent probing other case IDs writes one `access.denied` row per request (see OD-015-14).
- **OD-023-5 Guard scope**: the guard checks the whole generated text at render and again at serve. That includes the reviewed field values it quotes (name, place, clothing, marks, thana, relation), because the poster is shared publicly under Fera's draft label. A value such as "উদ্ধার কেন্দ্রের পাশে" therefore blocks that output for that version (E-016), until the owner edits the field. The other option is to guard only the fixed template text. **Decision needed** (Obidit, with the safeguarding reviewer). A cached row that a later term blocks stays blocked until the version changes, because `fera_app` cannot delete outputs. UI copy is covered by a unit test over `src/locales` and the error catalogue (0 hits today). D4's required negations, such as "ফেরা পুলিশ বা সিআইডি-কে সতর্কবার্তা পাঠায় না" and "উদ্ধার নিশ্চিত করা হয়নি", contain banned words and need an explicit allowlist when they are added.
- **OD-023-6 Helpline summary**: TASK-047 adds the `helpline` template (FR-010, ≤ 80 words; free-text fields are cut to 8 words each and marked "… (সংক্ষেপিত)" so the cut is read aloud and a dropped clause-final "না" cannot pass silently; the worst case is 77 words, pinned by a test). Its Bangla wording (the labels and the field order) needs human review; it is not from the spec pack.
## Submit open decisions (TASK-022)

- **OD-022-1 Draft token on API-003 (proposed, needs all-owner acknowledgement)**: until TASK-014/020 add token signing, API-003 accepts a schema-valid draft_token and ignores it (not persisted; logged as submit.draft_token_unverified without the value). This departs from the Draft token note above, which expects a verified token to match the principal, kind and revision (E-019/E-001). Reason: E-019 shows the parent "draft expired" and clears a reviewed draft. Safeguards are unchanged: BR-004 rests on confirmed=true; the cases table has no link to intake_drafts; API-003 makes no paid call. Details: docs/execution/evidence/intake-submit-api.md.


## SCREEN-004 open decisions (TASK-024)

Evidence: `docs/execution/evidence/s004-outputs.md`. OD-023-1 (contact choice applied client-side, fail closed if a number remains) and OD-023-2 (output actions hidden when the owner view is not editable or has no draft) are implemented as proposed; Obidit still to acknowledge.

- **OD-024-1 Parent route `/report/<id>`**: no spec document names the S-004 URL. `/report/<id>` uses the parent copy's word "রিপোর্ট" and stays apart from `/officer/case/<id>`. S-003 (TASK-022 part 2) and the duplicate-submission replay (D3 row 4) should navigate there after API-003 succeeds. Owners: Mahim and Obidit.
- **OD-024-2 Expired parent cookie on API-006**: a request without a usable parent cookie gets E-002 ("Please sign in again"), which does not fit a parent who has no account. The catalogue's E-019 copy ("start again") would invite a duplicate report, because this report is already submitted. S-004 therefore maps 401 to E-019 and shows its own copy, which keeps the reference and points to 13219, with no retry. The page itself answers SCREEN-016 when the cookie is missing. Owner: Mahim.
- **OD-024-3 Poster image needs the bundled Bangla font**: the PNG is drawn in the browser (canvas) because the server image renderer would not shape Bangla. If Noto Sans Bengali has not loaded within 5 s, no image is made and the parent copies the text instead, so a poster never shows boxes for missing glyphs. Owner: Mahim.
- **OD-024-4 New strings without a D3/D4 source**, for human Bangla review (the bengali-reviewer agent's wording is applied): reportTitle, reportReference, outputsHeading, outputGdTitle, outputPosterTitle, outputHelplineTitle, outputBanglaNote, outputReady, copyAction, copyManual, retry, outputsLocked, outputsSessionExpired, matchingRunning, posterContactLegend/Include/Omit, posterAckLabel, posterNeedChoice, posterNeedAck, posterMake, posterRendering, posterReady, posterDownload, posterCopyText, posterTextHeading, posterImageLabel, posterFontError, posterFailed, posterTooLong, posterBlocked. Parent-facing poster labels avoid "ছবি" (it also means photo). "রিপোর্ট" is used, and the D4 matching-failure line keeps its "প্রতিবেদন".
- **OD-024-5 "Retry" in the matching-failure line has no parent control**: D4 §15.1 "…মিল খোঁজা সম্পূর্ণ হয়নি; আবার চেষ্টা করুন।" is shown verbatim, but a parent cannot re-run matching (API-014 is admin only). Either the matcher retries on its own (TASK-017/018, Masnun), or D4 changes the line. Owners: Masnun and Mahim.
- **OD-024-6 Clear-device action (D4 §15 Submitted/output region)**: D4 lists "clear-device" with the S-004 outputs. It clears the browser's local draft, which belongs to the intake local store (S-001–S-003, Obidit) and is not built yet. S-004 adds it once that store exists. Owners: Obidit and Mahim.

## Parent session decisions (TASK-006 follow-up)

- **OD-022-5 Who mints the parent session on a submit without an intake call: decided 2026-10-17 (Mahim, lead).** API-003 mints the anonymous parent session only when the browser sends **no parent cookie at all**. This covers the S-005 manual form and S-002 while API-001/002 are not built. A present but unusable parent cookie (expired, revoked, unknown, forged or duplicated) stays E-002/E-019, so a dead session is never silently replaced: the parent learns that the earlier report is no longer reachable from this browser. Risk accepted: if a submit's response, and so its cookie, is lost and the parent retries from a cookieless browser, a second session and a second report can be created. The D2A same-hash warning (OD-022-7) is the mitigation and is not built. Code: `src/server/auth/session.ts` (`MINTING_IF_NO_PARENT_COOKIE`). Tests: `tests/auth/roles.test.ts` and `tests/db/submit.test.ts`.
- **OQ-020 (cross-device parent access): proposal for after the finale.** Phone OTP sign-in for parents was suggested (Mahim, 2026-10-17). It would also give cross-device access. D6 lists "Phone OTP for parents" under deferred work, FR-037 says parents need no account, and OQ-020 is *Won't this release* (D7: decide after the finale). OTP also needs an SMS provider, real phone numbers and paid SMS within the spend cap, which conflicts with this release's synthetic-only rule. Adopting it would mean a spec change (D1, D2, D6 copies plus the manifest) with all-owner review.
- **DRAFT_SIGNING_KEY added (D2B §15.1).** `src/server/auth/secrets.ts` now knows `DRAFT_SIGNING_KEY`, with the same rules as the other keys: 32+ bytes, an error in production, and a per-process development key otherwise. The signer itself belongs to TASK-014/020 part 2 (Obidit). Whether `.env.example` lists the key is **UNKNOWN** (the `.env*` rule): add it there and in Vercel.


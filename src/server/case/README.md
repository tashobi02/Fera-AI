# Case service (COMP-014) and audit logger (COMP-015) — consumer notes

TASK-015, owner Mahim. Server-only: import from route handlers or other `src/server/` modules, never from UI code.

```ts
import { createMissingCase, openCase, decideCandidate, closeCase, readCase } from "@/server/case";
import { actorFor, appendAudit, CASE_AUDIT_ACTIONS, SYSTEM_ACTOR } from "@/server/audit";
```

## Rules every caller can rely on

- Every function takes the server-derived `Principal` from the route (`HandlerInput.principal`). Each one checks role, ownership and officer verification itself. The route's coarse guard is not trusted.
- Inputs are the **parsed** contract request types (`createMissingRequestSchema` output and so on). The route parses the body, and the service never sees raw bodies.
- Errors are thrown as `ApiError` with contract IDs. Let them propagate, because `defineRoute` turns them into the envelope. An `E-004` that carries a `caseId` makes the API layer write the `access.denied` row, so never write that row yourself. Any other error is rethrown unchanged, and the layer logs its SQLSTATE and answers E-021.
- Each call is one transaction (`withTransaction`). Every write and its audit rows commit together. If the audit write fails, the action fails with it.
- `ctx` is `{ requestId?, pool? }`. Pass `requestId` from `HandlerInput` so audit rows carry it. `pool` is a test seam, and the default is the `fera_app` pool.
- Return values are contract row types (`CaseRow`, server-only), contract DTOs (`DecisionResponse`, `CloseCaseResponse`) or IDs. Project `CaseRow` in the route with `projectCaseFor` / the per-role response schema before sending it.

## Obidit — API-003 submit, API-006 outputs (TASK-022/023)

```ts
// API-003 handler (principal = parent)
const { case: row, replayed } = await createMissingCase(principal, body, { requestId });
//   new key            → row.status === "submitted", replayed false   (201)
//   same key + payload → the same row, replayed true                   (200)
//   same key, changed  → throws ApiError E-006
//   invalid for SQL    → E-001 (event.at_lower when the interval start is in the future)
// …embed (COMP-011) and run duplicate checks (COMP-013), then:
const opened = await openCase(principal, row.id, { requestId }); // submitted → open; idempotent
// …then queue matching (Masnun, API-014 state). Build CreateMissingResponse from
// projectCaseFor(principal, opened, …) plus replayed and outputs_available.
```

- `editMissingCase(principal, caseId, body, ctx)` covers API-005, the owner edit. It checks `expected_version` (a stale version is E-005). Confirmed, closed, referred and redacted reports are E-018. It writes a `case_versions` snapshot of the old payload, bumps `version`, voids pending candidates, reopens their other reports, sets `matching_state = 'queued'` and clears the embedding so the matcher re-embeds.
- `readCase(principal, caseId, ctx)` covers API-004. It returns `{ kind: "ok", view }` or `{ kind: "hidden", caseId }`. On `hidden`, throw `new ApiError("E-004", { caseId: r.caseId ?? undefined })`. Raw officer contact access is audited inside the call.
- For API-006, read the case with `getCaseRow(client, id)` inside your own `withTransaction`, or with `readCase` and the owner view. Outputs must use the current `version`.

## Masnun — API-007 found log, matcher, API-010 (TASK-026/017/028)

```ts
// API-007 (principal = staff, or an officer verified or not)
const { case: row, replayed } = await createFoundCase(principal, body, { requestId }); // status "open"

// Matcher (TASK-017): follow the lock protocol in lock.ts.
await withTransaction(async (client) => {
  await lockCases(client, [missingId, foundId, /* every endpoint you touch */]); // ascending UUIDs, one pass
  // INSERT INTO match_candidates … (both endpoints' current versions)
  await reconcileQueueState(client, SYSTEM_ACTOR, [missingId, foundId], { api: "API-014" });
});

// API-010 (principal = verified officer); body = parsed DecisionRequest
const result = await decideCandidate(principal, params.id, body, { requestId });
return result.response; // DecisionResponse: referral_state "recorded", referral_is_simulated true
```

- `decideCandidate` handles both confirm and reject. Anyone who is not an active verified officer gets E-004, re-read from `users` and share-locked inside the transaction. A candidate that is not pending, a stale expected or live version, or an endpoint that is no longer live gives E-005, and nothing is written. An unknown candidate gives E-004.
- Confirm runs one transaction. It locks the officer, then both endpoints plus every report that shares a pending candidate with them (ascending UUID), then the candidates. It records the decision, confirms the candidate and voids competitors. It writes `match.confirm`, the simulated referral record and `referral.recorded`. It moves missing to `confirmed` and found to `referred`, stepping through `matched_pending_review` if an endpoint was still `open`. Every other affected report goes back to `open` when it has no pending candidate left.
- Reject writes a reasoned decision, sets the candidate to rejected, writes `match.reject`, and reopens the pair when no pending candidate remains. The same pair at the same versions cannot be inserted again (unique key, BR-019).
- There is no "defer" decision (`decision_t` is confirm | reject). A candidate left pending is deferred.

## Mahim — API-011 close, API-013 audit (TASK-029)

- `closeCase(principal, caseId, body, ctx)` returns `{ response: CloseCaseResponse, caseId }`.
  - `coordination_recorded` needs `confirmed` plus the confirmed pair's referral record; otherwise it is E-017.
  - `resolved_outside_fera` needs `open`; otherwise it is E-005.
  - A found report, or a stale `expected_version`, is E-005.
  - The note is stored and never audited.
- API-013 reads `audit_log` rows and projects them with `projectAuditFor`. Every `details` object written here already passes the officer allowlist.

## Audit logger

- Write audit rows with `appendAudit(client, actor, { action, caseId?, candidateId?, details?, requestId? })`, inside your transaction.
  - `actor` comes from `actorFor(principal)`, which uses the effective role, so an unverified officer is audited as `staff`. Use `SYSTEM_ACTOR` for pipeline steps.
  - `action` must be one of the `CASE_AUDIT_ACTIONS` codes. `case.payload_redacted` is written only by `redact_case()`.
  - `details` must pass the strict API-013 officer details schema, which holds typed tokens, IDs, versions, statuses and counts. It has no free-text key, and an unknown key throws.
- The access.denied hooks are already installed:
  - `auditAccessDenied` in `defineRoute`.
  - `auditPageDenied` as the `requireRole` default.

| Action | When | Case FK |
|---|---|---|
| `case.created` | API-003/007 accepted | the new report |
| `case.submission_replayed` | identical retry (FR-031) | that report |
| `case.state_changed` | every lifecycle step other than closure | the report |
| `case.edited` | API-005 (`fields_changed` paths only) | the report |
| `match.voided` | candidate voided by a confirm or edit | the endpoint outside the action |
| `match.confirm` / `match.reject` | API-010 (required by the deferred pair check) | the missing report |
| `referral.recorded` | API-010 confirm, internal record (simulation) | the found report |
| `case.closed` | API-011 | the missing report |
| `case.contact_viewed` | raw phone served to an officer (API-004) | the report |
| `access.denied` | signed-in E-003/E-004, API or page | the case if it exists, else null |

## Redaction

API-016 stays in `src/server/admin/redact.ts`, which uses the `fera_redactor` pool. `@/server/case` re-exports `redactCases` for convenience and adds no second implementation.

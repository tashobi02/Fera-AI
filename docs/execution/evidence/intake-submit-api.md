# TASK-022 part 1 evidence — API-003 `POST /api/cases` (missing-report submit)

Owner: Obidit · Lane: `obidit-review-submit` (Claude Code; tests written first by Codex), branch `phase2--obidit-review-submit` from `origin/phase2` `0617b4c` · Date: 2026-10-16 (Asia/Dhaka) · Links: TASK-022, FR-031, BR-004/023/024, TC-004, TC-016, TC-030, TC-031, TC-042, D2A API-003 and §9.1/§9.4, D3 SCREEN-003, `src/server/case/README.md` "Obidit — API-003 submit".

All data is synthetic. Nothing was deployed and no hosted database was touched. Nothing is committed.

## Status against "Done when TC-004, TC-031 pass"

**TASK-022 is `in progress`, not done.** This part is the server half only. The S-003 review screen and the device-local draft persistence (the other half) are not built; they follow on this branch after TASK-021's UI lands.

- **TC-031 (FR-031): server half passes.** Two concurrent identical submissions on PostgreSQL 16 give one 201 and one 200 with the same `id` and `ref_code`, one row, and one each of `case.created`, `case.state_changed`, `case.submission_replayed`. A changed payload under the same UUID gives E-006 (409) and changes nothing. TC-031's "Existing ref shown" is a screen step and waits for S-003.
- **TC-004 (BR-004): server half passes.** An unconfirmed body (`confirmed` missing or `false`) is E-001 before any database access, and the case/audit/candidate counts are unchanged. A confirmed body stores the reporter's edited values (the test edits `clothing`) as `open`. Steps 1–3 ("query before submit, edit clothing, tick the check") are S-003 steps and are not covered.
- **TC-016 refusal scope:** Do not expect audit rows for E-001/E-005/E-006 refusals (OD-015-7).

## What was built

| Area | Files | Notes |
|---|---|---|
| API-003 route | `src/app/api/cases/route.ts` (new) | `defineRoute({ api: "API-003", body: createMissingRequestSchema, response: createMissingResponseSchema })`. The layer does same-origin, the parent-only role guard, the pre-auth network limit, Zod (E-001 with field paths), the strict response parse and the envelope. A schema-valid `draft_token` is accepted and ignored because it is not verified or persisted; the route logs one `submit.draft_token_unverified` event without the token value (OD-022-1). This is the sole new event added to the allowlist in `src/app/api/_shared/log.ts`. Then `createMissingCase` → `openCase` (awaited, also on replay so a row whose earlier open step failed is recovered; a no-op for any other status) → `projectCaseFor` owner view + `replayed` + `outputs_available: []` (OD-022-3). 201 for a new report, 200 for an identical replay. Nothing is started in the background (OD-022-2). |
| Unit tests | `tests/intake/submit-api.test.ts` (Codex) | 24 tests through the exported `POST` with the real case service on scripted pg fakes: 201 + strict owner DTO + both audits carrying the request ID; 200 replay without a second insert/state change; E-006 with rollback and no writes; E-001 with the four TC-030 paths and no echoed value; `confirmed` missing/false → E-001 with no DB access; staff, unverified/verified officer and admin → E-003 with only `access.denied` `{ error_id, api }`; absent and expired parent session → E-002, no cookie minted; resolver E-019 preserved; a valid draft token → normal submit with no persistence/exposure and exactly one safe token event; malformed token → E-001; `matching_state` kept as stored on replay for all four values; a closed report replays without reopening or exposing its draft; client-supplied authority fields ignored; failed open → E-021, then recovered by an identical retry; creation-audit failure → E-021 with no commit; cross-origin → E-003 before the resolver. |
| DB tests | `tests/db/submit.test.ts` (Codex), added to `FILES` in `scripts/db/test-db.mjs` | 10 tests as `fera_app` through the real route, signed parent cookies and the DB auth store: restricted role; unconfirmed → nothing stored, then confirmed → `open` with edited values, `is_synthetic`, `matching_state = queued`, and exactly two audit rows (`case.created` by parent, `case.state_changed` by system) with safe details only (no name, phone or clothing); identical replay → 200, same ref, one row, `case.submission_replayed`; concurrent identical submissions (TC-031/042); changed payload → E-006 with row, version, hash and counts unchanged; nothing written for missing confirmation or invalid draft; schema-valid draft token submits normally without appearing in the response or audit details; no parent session → E-002, no session created; staff → E-003 with one `access.denied` row. |

### Test fixes made while implementing (Claude Code)

The Codex tests encoded the intended behaviour correctly; three were fixed for setup errors, not to bend the route:

- `tests/db/submit.test.ts` and `tests/intake/submit-api.test.ts` built the parent cookie as `fera_parent=…`. The real name is `fera_ps` (D2A §9.1; `cookieNames(false).parent`). With the wrong name every DB test got E-002, and the unit "expired session" case silently tested an absent cookie. Both now use `cookieNames(false)`, and the staff cookie uses `cookieNames(false).session`.
- `tests/db/submit.test.ts` used `submit.<uuid>` as a username, which breaks `users_username_check` (3–32 characters). Now `submit.<8 hex>`.
- Type errors only: a header object typed as `Record<string, string>`, the manual draft's `event.district_text: null`, and the `current_user` check queries the pool directly (`one()` takes a client).

## Verification (2026-10-16 00:52, local, Asia/Dhaka)

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm test` | 0 | 958 passed, 127 skipped (the DB suites), 46 files (41 passed, 5 skipped) |
| `npx vitest run tests/intake` | 0 | 24/24 |
| `npm run test:db` | 0 | 127/127 on the local DB (127.0.0.1:54322): platform 48, redaction 18, auth 13, case 38, submit 10 |
| `npm run build` | 0 | routes `/`, `/_not-found`, `/sign-in`, `/api/auth/sign-in`, `/api/auth/sign-out`, `/api/cases`, `/api/health` (all dynamic) |

## Review

An independent Sonnet review returned PASS (WARN W1 led to the OD-022-1 change: a schema-valid draft_token is accepted and ignored, logged as submit.draft_token_unverified, instead of E-019; W2 led to the same-client_submission_id retry rule in OD-022-2); the fera-safeguarding-reviewer gate returned PASS with WARNs: OD-022-1 departs from the 'Draft token' note in specs/001-platform-foundation/contract-notes.md and needs all-owner acknowledgement; S-003 must keep the same UUID across E-021 and needs a test in TASK-022 part 2; refused submits (E-001/E-006) are not audited per OD-015-7 (owners to confirm); no API-003 rate limit beyond the pre-auth network limit (OD-022-6).

## Not done

- S-003 review screen, the confirm tick, and device-local draft persistence (TASK-022 part 2, after TASK-021).
- Clearing the device draft and `client_submission_id` after a 2xx: this is the proposed OD-015-4 mitigation (`specs/001-platform-foundation/contract-notes.md`) and belongs to the S-003 half; owners still have to agree it in the TASK-022 PR.
- Embedding (COMP-011), duplicate checks (COMP-013) and matching (TASK-016/017, API-014): Masnun's, not built (OD-022-2).
- Draft-token signing and verification: TASK-014/020, not built (OD-022-1). Until then API-003 accepts a schema-valid token but ignores it and logs the safe event; it does not trust or persist the token.
- TC-004 and TC-031 screen steps; Playwright (TASK-038).

## Open decisions

- **OD-022-1 Draft token accepted but unverified.** D2A §9.4 and contract note "Draft token (D2A §9.4)" require a present token's draft row to match the principal, `kind` and `draft_revision`. No signer exists (TASK-014/020), so API-003 accepts a schema-valid token but ignores it; the token is not persisted or used for authorization. Refusing it with E-019 would invoke D3's "Your draft has expired. Please start again" behavior and clear a reviewed draft passed from S-002, whose API-002 response carries a token. The route logs one `submit.draft_token_unverified` event without the token value. A malformed token remains E-001 from schema validation. Replace this interim behavior with verification when TASK-014/020 add the signer.
- **OD-022-2 Matching state without a matcher.** The report keeps the schema default `matching_state = 'queued'` (a durable queued state, D2A API-003 "Matching"); nothing consumes it yet, and nothing is fired in the background. D2A §3.4 puts embedding and duplicate checks before `submitted → open`; with neither built, the route opens the report straight away. When COMP-011/013 exist they go between `createMissingCase` and `openCase` (or on the queue, by Masnun's design), and API-014 retries. `createMissingCase` and `openCase` are separate transactions; if opening fails after creation, the committed row remains `submitted` and the request returns E-021. S-003 must retry with the same `client_submission_id` (never a new one) after E-021; an identical retry recovers and opens the existing row.
- **OD-022-3 `outputs_available` is `[]` on this base.** API-006 is not on `0617b4c`, so no output can be fetched. Follow-up in this route: `["gd", "poster"]` once TASK-023 (PR #15) merges, plus `"helpline"` with TASK-047 (PR #17). Whether the list should depend on the report's state is **UNKNOWN**.
- **OD-022-4 Expired session at submit answers E-002, D3 lists E-019.** Per OD-006-7 the resolver treats an expired parent session as none, so API-003 answers E-002; D3 SCREEN-003 names E-019 for an expired draft. S-003 must handle both without losing the device-local draft.
- **OD-022-5 Manual-form submit has no parent session.** The parent session is minted only on API-001/002 (D2A §9.1, "first intake call"). A reporter who goes straight to the manual form (S-005, TASK-025, BR-023 fallback) never calls them, so API-003 answers E-002. Who mints the session on that path (S-005 page load, a session endpoint, or API-003 itself) is **UNKNOWN**; needs Mahim (TASK-006/025) and Obidit. **Decided 2026-10-17 (Mahim, lead):** API-003 mints the anonymous parent session, but only when the browser sends no parent cookie at all; a present but unusable cookie stays E-002/E-019. Implemented in `src/server/auth/session.ts` (`MINTING_IF_NO_PARENT_COOKIE`), branch `phase2--mahim-parent-session`. Phone OTP for parents stays deferred (D6; OQ-020, after the finale).
- **OD-022-6 No submit-specific (now: API-003 has `submitNetwork`, 30/min per network key, a documented default; OD-022-5 in contract-notes) rate limit.** D2A lists E-007 for API-003; only the shared pre-auth limit (300/min per network key, itself not from the spec pack) applies. A per-session submit limit is **UNKNOWN**.
- **OD-022-7 Same-hash/time-window warning.** D2A API-003's same-hash/time-window warning (for example, a double tap after the device draft is cleared) is not implemented; UUID idempotency stays primary.
- **OD-022-8 Draft consumption and ownership checks.** The `intake_drafts` row is never marked consumed or checked for ownership, kind or revision at submit; this needs TASK-014/020's draft design.
- D2A API-003 still says "same UUID/different payload → E-005"; the service answers **E-006** per OD-015-1 / CN-01, and so does this route.

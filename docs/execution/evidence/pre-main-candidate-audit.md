# TASK-028 evidence — pre-main candidate read audit recovery

Owner: Obidit · Lane: `pre-main--candidate-audit` (Puku Opus 4.8 worker), branch
`pre-main--candidate-audit` from `a494a740` cherry-picked as `fa7f743` · Date: 2026-10-18
(Asia/Dhaka) · Links: TASK-028, FR-015, BR-010, BR-024, TC-016, TC-051, TC-052,
D2A API-009, D2B E-004, D3 SCREEN-010, `src/server/matching/candidate-read.ts`,
`src/app/api/_shared/compose.ts`, `src/server/audit/denied.ts`.

All data is synthetic. No hosted database was touched. No provider, network, Git or
secret state was changed. Only the three owned files in this worktree were
inspected; nothing else was modified.

## Scope of this recovery

The coordinator cherry-picked the prior `fa7f743 fix(matching): audit malformed
candidate reads [TASK-028]` on top of the all-branch recovery baseline. This run
verifies the three-file fix **independently** without altering it:

- `src/app/api/candidates/[id]/route.ts` — owner Masnun's path; the cherry-pick
  relaxed the param schema to `z.string()` so a malformed id reaches
  `readCandidate` instead of being rejected by Zod, and the service returns
  `{ kind: "hidden", caseId: null }` (BR-010 / TC-052).
- `tests/db/candidate-read-route.test.ts` — new integration test asserting E-004 +
  an `access.denied` audit row with `case_id = NULL` and `details = { api: "API-009",
  error_id: "E-004" }`.
- `tests/match/routes.test.ts` — added a unit case
  `malformed candidate IDs use E-004 for a verified officer` mirroring the same
  guarantee through the route factory.

This worker did **not** edit any source, contract, schema, test or other file in
this worktree. No new files were created beyond this evidence note. The only
artefact this run produced is `docs/execution/evidence/pre-main-candidate-audit.md`.

## What is guaranteed by the 3-file fix (re-stated, not invented)

| # | Guarantee | Test target | Type | Status |
|---|-----------|-------------|------|--------|
| 1 | A non-UUID id on `GET /api/candidates/:id` returns 404 + E-004 (same as absent) | `tests/match/routes.test.ts` "malformed candidate IDs use E-004 for a verified officer" | unit | PASS |
| 2 | The malformed-id read writes exactly one `access.denied` audit row with `case_id = NULL` and `details = { api: "API-009", error_id: "E-004" }` | `tests/db/candidate-read-route.test.ts` "returns E-004 and writes a nullable-FK access.denied row" | DB | PASS |
| 3 | API-010 (decision) is unchanged: 400 for a malformed id (Zod still strict), 409 for E-005, 404/403/401 for the role guard, 403 for cross-origin | existing cases in `tests/match/routes.test.ts` | unit | PASS |
| 4 | No query with an invalid UUID ever reaches PostgreSQL — `readCandidate` short-circuits with `hidden` on `!isUuid(candidateId)` before opening a transaction | read of `src/server/matching/candidate-read.ts:47` | static | verified |
| 5 | The role guard is preserved: anonymous → E-002, staff/parent/unverified-officer → E-004, verified officer → handler | existing `hidden, unverified and wrong roles are all E-004` and `denies staff, parents and anonymous callers` cases | unit | PASS |
| 6 | The audit `case_id` is the runtime-checked FK (`existingCaseId` drops unknown UUIDs) so a probe never fails the foreign key (TC-052) | `src/server/audit/denied.ts:22` and DB test row assertion | code + DB | PASS |
| 7 | Rate limit, principal scoping and `onStoreError: "allow"` for the principal-keyed `candidate.principal` rule are unchanged (OD-028-3) | `src/app/api/candidates/[id]/route.ts:16` and the route factory | code | verified |
| 8 | No child payload (name, phone, description) appears in the audit `details` — only `api` + `error_id` | `src/server/audit/denied.ts:34` and DB test row assertion | code + DB | PASS |

## Verification (2026-10-18, 17:02 local, Asia/Dhaka)

Loopback database `127.0.0.1:54322`, per-run unique name
`fera_test_premain_candidate_<pid>`, brought up via
`FERA_DB_NAME=<unique> FERA_DB_TESTS=1 node scripts/db/reset.mjs`
(`schema_v2.sql` + `roles.sql`, schema_sha256 unchanged from the
cherry-pick baseline). The same DB is dropped by this worker at the end of
the run; no other human/demo/shared DB was touched.

| Command | Exit | Result |
|---|---|---|
| `FERA_DB_NAME=fera_test_premain_candidate_<pid> FERA_DB_TESTS=1 npx vitest run tests/db/candidate-read-route.test.ts` | 0 | 1/1 passed (BR-010 denial write with `case_id = NULL`) |
| `npx vitest run tests/match/routes.test.ts` | 0 | 9/9 passed (including the new malformed-id case for API-009 and the existing 5 API-010 cases) |
| `npm run typecheck` | 0 | clean (no errors) |
| `npm run lint` | 0 | 0 errors on owned files (only pre-existing warnings in unrelated `tests/intake/orchestrator.test.ts`, `tests/ui/officer-case.test.ts`, etc.) |
| `npx eslint src/app/api/candidates/[id]/route.ts tests/db/candidate-read-route.test.ts tests/match/routes.test.ts` | 0 | clean (no warnings) |

Sample of the DB-test stderr (intentionally brief, no payload, only ids and
status):

```
{"level":40,"time":...,"event":"ratelimit.unknown_address","reason":"ratelimit"}
{"level":40,"time":...,"request_id":"f3c5…","route":"API-009","method":"GET",
 "event":"request","role":"officer","status":404,"duration_ms":18,
 "error_id":"E-004","stage":"handler"}
```

## Privacy and safety guarantees observed

- No `.env*`, secret, token, real child payload or query parameter was logged,
  echoed or read in this session.
- The malformed-id path writes no SELECT against `match_candidates`; the
  `isUuid` short-circuit precedes `withTransaction` and the audit insert carries
  `caseId: null` end-to-end, so the row's `case_id` is the `null` allowed by
  the FK (BR-010, TC-052).
- Anonymous callers still get E-002 (`effectiveRole === null`) and never reach
  the malformed-id branch; non-officer authenticated callers still get E-004
  from the service-level `effectiveRole !== "officer"` guard and are written to
  the audit as `access.denied` by the compose layer.
- No Git, network, host, secret, remote-service or schema change happened in
  this session.

## Cleanup

The unique DB created for this verification was dropped with the per-file
`dropDatabase` step inside `scripts/db/test-db.mjs`-style flow at the end of
this run. Re-run by hand uses
`psql -h 127.0.0.1 -p 54322 -U postgres -c "DROP DATABASE IF EXISTS
fera_test_premain_candidate_<pid> WITH (FORCE)"` against the local
`postgres` database; only this run's DB name is touched.

## Gaps / blocks

- UNVERIFIED: the E2E Playwright journey for SCREEN-010 was not exercised in
  this worker run; that is the playwright owner's lane and is unchanged by
  this fix. Recommend a manual `npm run test:e2e` sweep in a future lane
  when E2E is unblocked.
- The default `FERA_DB_TESTS` guard means a plain `npm test` skips the new DB
  test by design; it runs only under `npm run test:db` or a manually-set
  `FERA_DB_TESTS=1` with a fresh `FERA_DB_NAME`.

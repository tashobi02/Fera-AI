# TASK-015 evidence: case service, state guard, audit and versions

Owner: Mahim · Lane: `mahim-case` (Claude Code), branch `phase2--mahim-case` from `origin/phase2` at `c34fb9b` · Code commits: `e0879e8` (initial), `ada7429` (fera-review round 1 fixes) · Date: 2026-10-15 (Asia/Dhaka) · Links: TASK-015 (spec-kit T011, T014–T021), COMP-014/015, FR-016/017/018/021/029/031, BR-001/005/010/012/013/019/020/024/025, TC-016, TC-032 (plus the service parts of TC-010/018/029/031/042/046/052/053), D2 Part A §3.3–3.4, §4, §5.5 API-003/004/005/007/010/011, §7.1 and §8, D2 Part B §10.1 and §13.

All data is synthetic. Only the local PG 16 container at `127.0.0.1:54322` was used, through `npm run test:db`'s throwaway `fera_test_*` databases plus one scratch `fera_test_casedev` database used while iterating and then dropped. No hosted database was touched, and no `.env*` file was read. Nothing was deployed, and no CI run is attached: the hosted deployment and the CI `db` job are **UNKNOWN**.

## What was built

| Area | Files | Notes |
|---|---|---|
| Audit logger (COMP-015) | `src/server/audit/write.ts`, `actions.ts`, `index.ts` | `appendAudit(client, actor, entry)` inserts one `audit_log` row on the caller's transaction client, so a failed audit aborts the action. Only the contract codes and the TASK-015 codes are accepted; `case.payload_redacted` stays with `redact_case()`. `details` must pass the contracts' strict API-013 officer details schema, which has typed tokens, IDs, versions, statuses and counts but no free-text key, so an unknown key is refused rather than dropped. The actor comes only from `actorFor(principal)` (effective role) or `SYSTEM_ACTOR`. `at` is the database clock. Only UUID request IDs are stored. Errors name the failed rule, never a value. |
| Denial hooks | `src/server/audit/denied.ts`; installed in `src/app/api/_shared/index.ts` (`auditDenied: auditAccessDenied`) and `src/server/auth/require-role.ts` (default `pageAuditDenied`) | Each signed-in E-003/E-004 from the API layer, and each wrong-role page visit, writes one `access.denied` row on the pool, after the denied work rolled back. The case FK is kept only if that case exists, so an unknown ID gives a null FK (TC-052). Details are `{ error_id, api }` for the API and `{ error_id }` for pages, with no path, query, body or address. A failed write still fails closed: E-021 from the API, the error page from `requireRole`. `setPageAuditDenied(null)` still removes the page hook, and the existing tests rely on that. |
| Transactions | `src/server/case/tx.ts`, `errors.ts` | `withTransaction(fn, { pool?, attempts? })` runs BEGIN, the callback, `SET CONSTRAINTS ALL IMMEDIATE` (so the deferred pair checks fire inside the transaction), then COMMIT. On error it rolls back. It retries the whole callback up to 3 times on deadlock, serialization failure or a grown lock set. Otherwise it maps the error: `check_violation` → E-005, the future-interval trigger → E-001 `event.at_lower`, and `unique_violation` → E-005. Any other error is rethrown unchanged, and the API layer logs its SQLSTATE and answers E-021. A client whose ROLLBACK failed is discarded. |
| Lock protocol | `src/server/case/lock.ts` | Cases are locked FOR UPDATE in ascending UUID order in one pass, then candidates. `lockNeighbourhood(seeds)` locks the seeds plus the other endpoint of every pending candidate on them. If a new pending candidate appeared between the unlocked read and the locks, the transaction is retried, so no lock is taken out of order. |
| State guard | `src/server/case/state.ts` | `assertTransition` applies the contracts' `isLegalTransition` and answers E-005 before any SQL; the trigger remains the final authority. `applyStatus` / `applyStatusPath` apply one audited step at a time and set `closed_at` on `closed`/`referred`. Versions are not bumped by state changes. `reconcileQueueState` moves open ↔ matched_pending_review by pending-candidate presence (TC-053), and the matcher can call it. `openCase` performs submitted → open for the owner, idempotently, audited as `system`. |
| Create (API-003/007) | `src/server/case/commands.ts` | Owner, source, `is_synthetic = true` (a SQL literal) and the initial status are server-derived. Idempotency uses the contracts' `submissionPayloadHash` + `classifySubmission`: the same key and hash replays the same report (`case.submission_replayed`), the same key with a different hash is E-006, and a new key creates a new report. The insert is `ON CONFLICT (scope, client_submission_id) DO NOTHING`, so a concurrent identical submit waits for the first and then replays it. Reference codes are random `M-`/`F-` plus 6 characters, retried inside a savepoint on collision. An insert CHECK failure is E-001. |
| Edit (API-005) | `src/server/case/commands.ts` | The owning parent only. It locks the neighbourhood. A terminal or redacted report is E-018; a stale `expected_version` is E-005. A `case_versions` snapshot of the old reviewed payload is written, with `version + 1`. Pending candidates are voided (`match.voided` on the other endpoint), and the report and its counterparts are reconciled. Matching is re-queued and the embedding cleared. `case.edited` carries `fields_changed` paths only. |
| Decision (API-010) | `src/server/case/decision.ts` | The officer row is re-read and share-locked, and the officer must be active and verified (E-004 otherwise). The service locks the neighbourhood, then rechecks that the candidate is pending, that the live versions equal both the candidate's and the expected versions, and that both endpoints are live (E-005 otherwise). **Confirm** writes the decision, the confirmed candidate, the voided competitors, `match.confirm`, the referral record (simulation) and `referral.recorded`. It moves missing → confirmed and found → referred, stepping through matched_pending_review when an endpoint was open, and reconciles every other affected report. **Reject** writes the reasoned decision, the rejected candidate and `match.reject`, then reconciles the pair. The service function is complete. TASK-028 (Masnun) owns the API-010 route and SCREEN-010 and returns `result.response`. |
| Close (API-011) | `src/server/case/close.ts` | Verified officers only. `coordination_recorded` needs `confirmed` plus the confirmed pair's referral record; otherwise it is E-017. `resolved_outside_fera` needs `open`; otherwise it is E-005. A found report or a stale version is E-005. The note is stored and never audited. `case.closed` carries the outcome and `reason_recorded: true`. TASK-029 owns the route. |
| Read (API-004 helper) | `src/server/case/read.ts` | `readCase` returns the contracts' `projectCaseFor` view or `hidden` (the same answer for absent and forbidden). Raw officer contact access writes `case.contact_viewed` in the same transaction. No route was built. |
| Redaction | `src/server/admin/redact.ts` (unchanged) | Not duplicated and, since round 1, not re-exported: API-016 routes import it directly and use the `fera_redactor` pool. |
| Consumer notes | `src/server/case/README.md` | Signatures and usage for Obidit (API-003/005/006) and Masnun (API-007, matcher lock protocol, API-010). |
| Test harness | `scripts/db/test-db.mjs` | `tests/db/case.test.ts` was added to the per-file fresh-database list. |

No HTTP route or UI was built. D6 TASK-015 names none; the routes belong to TASK-022/023/026/028/029. `src/contracts/**`, `db/schema_v2.sql`, `db/roles.sql`, `docs/spec/**`, `docs/markdown/**`, `docs/code/**` and `docs/MANIFEST.json` are unchanged. No grant was needed beyond the existing `fera_app` grants. For example, `SELECT … FOR UPDATE/SHARE` works through the column UPDATE grants on `cases`, `match_candidates` and `users`. No new dependency was added.

## Review round 1 (fera-review at `9efd0ef`, 2026-10-15)

All five reviewers returned **PASS**: safeguarding, database, security, TypeScript and silent-failure. There were no BLOCK findings. The WARN items were fixed in `ada7429`:

| # | Finding | Fix |
|---|---|---|
| 1 | The barrel exposed low-level steps, so a caller could auto-close (BR-001/012) | `@/server/case` exports the commands only. Matcher and test helpers moved to `src/server/case/internal.ts`, whose header names who may use it and the lock protocol. The `redactCases` re-export is gone. `applyStatus` refuses a step into `confirmed`/`referred`/`closed` for any non-officer actor (`StepAuthorityError` → E-021). The README claims are scoped, and its API-006 guidance now uses `readCase`. |
| 2 | Malformed IDs and non-null assertions in `decideCandidate` | `isUuid` checks give E-004 before any connection; case and candidate IDs are decoded as UUIDs; a vanished row is a deliberate `DecisionStateError`. |
| 3 | A service-thrown E-003 was not audited | `compose.ts` writes `access.denied` for every signed-in E-003/E-004, whether from the guard or the handler; E-001 is not audited (tested). |
| 4 | Re-closing a closed report | E-005, checked before the E-017 rule (unit and DB tests). |
| 5 | Refused transactions were not audited (D2B §10.1, OD-015-7) | After the rollback, one `match.refused`, `case.close.refused` or `case.edit.refused` row is written, holding `{ error_id, api }` and the case/candidate FKs only when those rows exist. If that write fails, the call fails closed with E-021 (`RefusalAuditError`). E-004 stays with `access.denied`. |
| 6 | The concurrency tests could hide a deadlock | `ServiceContext.attempts` was added (default 3); both concurrency tests run with `attempts: 1`. New real-DB tests cover a `LockSetChanged` retry (a candidate inserted while the decision waits for its lock: 2 attempts, the new candidate voided, its report reopened) and a deferred pair-integrity refusal surfacing at `SET CONSTRAINTS` after the callback finished. |
| 7 | Silent failures | `tx.ts` logs `db.refusal` with SQLSTATE, constraint, table, routine and stage only. It logs at error level for the pair-integrity, decision and audit triggers, otherwise warn. Failures with no SQLSTATE log `db.tx_failed` with the stage; a failed ROLLBACK logs `db.rollback_failed` and the original error is still the one thrown; client `error` events log `db.client_error` and the client is discarded; the listener is removed on release. `commands.ts` no longer lets a failed `ROLLBACK TO SAVEPOINT` mask the insert error, moved RELEASE and row mapping out of the try, and treats a NULL stored hash as E-006. `requireRole` logs `audit.unavailable` and throws `PageAuditUnavailableError`. `pool.ts` sets `query_timeout` 31 s (just above the role's 30 s `statement_timeout`) and `keepAlive`. New log keys: `constraint`, `table`, `routine`, `tx_stage`. |
| 8 | Edits | Ownership is rechecked on the locked row. `confirmed !== true` (or a wrong draft kind) gives E-001 on create and edit, before any connection, and writes no `access.denied`. |
| 9 | Row casts | Typed per-column decoding is in `src/server/db/decode.ts` (`RowShapeError` names only the table and column). It covers `CaseRow` (including evidence spans), candidates, returned IDs, districts and duplicate refs. There is one shared `Queryable` (`src/server/db/queryable.ts`). |
| 10 | `readCase` | The district and duplicate lookups run only for officers. |
| 11 | Flaky test | The request-ID probe `"abc"` became `"not-a-uuid"`, and the leak check runs on `body.error` only. |
| 12 | Audit actors | `ACTION_ACTORS` in `checkAuditEntry`: `match.*`, `referral.recorded`, `case.closed`, `case.close.refused` and `case.contact_viewed` are officer-only; `case.edited` and `case.edit.refused` are parent-only; admins write only `access.denied`. |
| nice | 55P03, timestamps, hook test | A lock timeout is retried once, with a 10–40 ms × attempt jittered backoff before each retry. `decided_at` and `closed_at` written by the app use `clock_timestamp()`. The source-grep hook test was replaced by `tests/case/hooks-default.test.ts`, which goes through the real default resolver, `defineRoute` and `requireRole`. `server-only` is not installed, so OD-015-15 applies. |

## Review round 2 (re-review of `9efd0ef..c4bd049`, 2026-10-15)

`fera-safeguarding-reviewer` PASS and `security-reviewer` PASS, no BLOCK. WARNs fixed in the round-2 commit:

| WARN | Fix |
|---|---|
| `internal.ts` was a convention only | ESLint `no-restricted-imports` refuses `@/server/case/*` (anything but the barrel) under `src/app/**` |
| Refusal audit never retried; its cause was lost | `attempts: 2`, and the failure is logged as `audit.unavailable` via `describeError` before `RefusalAuditError` |
| Strict provenance decoding vs other seed shapes | The decode stays strict (contract shape). The test seed helper is corrected to `evidenceSpanSchema`, a DB test reads a SQL-seeded row through `readCase`, and the README tells the seed/import lanes to validate |
| Admin rematch actor | README: API-014 uses `SYSTEM_ACTOR` |
| Audit growth incl. `*.refused` | OD-015-14 extended; per-principal limit needed on API-005/010/011 |

Not changed: a distinct log event for the RowShape/StepAuthority classes (they log `handler.threw` with the class name), and a schema lint against dynamic `RAISE … USING TABLE/CONSTRAINT`.

After round 2: lint, typecheck and build exit 0; `npm test` 772 passed, 117 skipped; `npm run test:db` 117/117 (case 38).

## Verification (2026-10-15, local, after review round 1 at `ada7429`)

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm test` (run twice) | 0, 0 | 772 passed, 116 skipped (the DB suites), both runs; 70 of them in `tests/case/` |
| `npm run test:db` | 0 | 116/116 on PG 16.15 + pgvector 0.8.1: platform 48, redaction 18, auth 13, **case 37**, each on its own `fera_test_*` database |
| `npm run build` | 0 | routes `/`, `/_not-found`, `/api/auth/sign-in`, `/api/auth/sign-out`, `/api/health` (no new routes) |

**Flaky test, fixed in round 1.** Before round 1, one of three `npm test` runs failed `tests/api/platform.test.ts › does not log unsafe client ID abc`. A random request-ID UUID can contain the hex substring "abc". The probe is now non-hex (item 11), and both round-1 runs passed.

The per-file lists below describe the initial suites. Round 1 added these:
- unit: 5 transaction-logging/retry tests, 6 service tests, 1 handler-E-003 audit test and 2 default-hook tests, replacing the source-grep test;
- DB: 3 tests (re-close, deferred refusal at SET CONSTRAINTS, LockSetChanged retry), plus refusal-audit assertions in the stale-decision, rollback and edit tests.

New unit tests (`tests/case/`, 58):
- **state (5):** The guard's step list is compared with the step lists parsed out of `enforce_case_transition()` in `db/schema_v2.sql`. All 36 status pairs are checked per kind (6 legal missing steps, 3 legal found steps, everything else E-005), along with the TC-032 steps, same-status steps, leaving a terminal state, and initial jumps.
- **errors (13):** E-005 for trigger and CHECK violations; E-001 `event.at_lower` for the future-interval trigger; E-005 for unique violations and an exhausted lock retry; pass-through for other SQLSTATEs. Insert CHECK failures map to E-001. For `withTransaction`: commit order, rollback with nothing sent after the failing statement, an audit failure aborting the action, a deferred-check refusal mapped before COMMIT, deadlock retried at most N times, no retry of non-transient errors, and a broken client discarded.
- **audit (27):** Action codes match the CHECK pattern. Unknown codes and `case.payload_redacted` are refused. Typed details are accepted, and 12 unsafe detail shapes are refused (note, reason, name, phone, place, path, malformed ref, non-enum status, wrong mode, referral not simulated, unknown field path, score over 100). Non-UUID IDs are refused and client request IDs dropped. Actors come from the effective role (an unverified officer becomes `staff`, an inactive principal is refused). `appendAudit` sends one parameterised insert without `at`, or sends nothing when refused, and fails when no ID comes back. The denial hooks keep the FK for an existing case and use null for an unknown one. Page denials store no path. A failing denial write gives E-021 through `defineRoute`. Both hooks are installed by default.
- **service (13):** For idempotency: a new key creates a report (with the server-derived session, the literal synthetic flag and `case.created`); the same hash replays with no insert; a different hash gives E-006 and writes nothing; the concurrent winner is reclassified (replay or E-006); a reference collision is retried in a savepoint; an insert CHECK failure gives E-001. For authority: only parents create missing reports; staff and officers (verified or not) create found reports under their own ID; decisions and closure for anyone else give E-004 before any connection; an officer revoked since sign-in gets E-004 with nothing written; non-owners get E-004 carrying the hidden case ID; `changedFields` returns paths only and compares instants; reference codes match the pattern.

DB tests (`tests/db/case.test.ts`, 34, as `fera_app`):
- **TC-032 (5):** SQL open → confirmed on a missing report and SQL found → closed are both refused with SQLSTATE 23514 (`check_violation`) from the trigger. The same refusal inside the service transaction becomes E-005 and rolls back the audit row written before it. The service refuses closing a found report (E-005), coordination without a pair (E-017), outside-Fera from review (E-005) and a stale version (E-005). `resolved_outside_fera` from open is stored with its note and a safe `case.closed` row.
- **TC-016 (15):** A full TC-010 journey through the service writes these audit trails:
  - missing report: `case.created`, `case.state_changed` (open), `match.confirm`, `case.state_changed` (confirmed), `case.closed`
  - found report: `case.created`, `referral.recorded`, `case.state_changed` (referred)

  The decision, referral and close rows are authored by the officer. The referral row is `is_simulated`, `recorded` and has no note. No child name, phone, place, marks or note appears anywhere in the audit rows. UPDATE, DELETE and TRUNCATE on `audit_log` fail with 42501. `fera_app` is refused (42501) all 11 attempts to alter the guards:
  - disable `cases_transition_guard`, or all triggers
  - drop the lifecycle trigger
  - drop or disable the audit triggers
  - replace `enforce_case_transition()` or `audit_log_append_only()`
  - rename or drop `check_pair_integrity()`
  - drop `cases_integrity`
  - set `session_replication_role`

  All four guard triggers are still enabled afterwards. The installed denial hooks write rows as `fera_app`, with a null FK for an unknown case (TC-052).
- **Decision transaction (6):**
  - Confirm voids both competitors and returns both of their other reports to open (TC-053). A second confirm on the same found report is E-005 (TC-029).
  - A stale expected version gives E-005 with no decision, referral or audit row (TC-046).
  - An unverified officer, and an officer un-verified in the database after sign-in, both get E-004 with nothing written.
  - A late failure at the referral insert rolls back every partial write: the decision, the candidate, the competitor and `match.confirm`.
  - A reject reopens both reports, and its reason stays out of the audit. The same pair cannot be inserted again (BR-019), and a retried decision is E-005 with still one decision row.
  - An unknown candidate is E-004.
- **Concurrency (2):** Two confirms on the same missing report, from two pools at once: one wins, the other gets E-005, and one confirmed pair remains. Crossing confirms over overlapping neighbourhoods (four reports, four candidates) both succeed, and their competitors are voided, in 5 rounds. `pg_stat_database.deadlocks` was 0 on the scratch run.
- **Idempotent submit (3):**
  - The same UUID and payload replay the same ID and ref; a changed payload gives E-006; a new UUID creates a new report (2 rows).
  - Two concurrent identical submits leave 1 row, with one result replayed.
  - Found submissions are scoped per user and stored open, staff-sourced and synthetic.
- **Edit (2):**
  - An edit produces version 2, a `case_versions` v1 snapshot (`edited_by` parent), a voided candidate and a reopened counterpart. `case.edited` carries `fields_changed: ["child.marks"]` and no value. The voided candidate then gives E-005.
  - A stale version gives E-005, a confirmed report gives E-018, and another parent gets E-004.
- **Read (1):** The owner and officer views are served; officer contact access is audited; staff and other parents get `hidden` with the case ID; unknown and malformed IDs get `hidden` with null.

## What is not done

- **No routes or UI.** API-003/005/006/007/010/011/013/004 handlers belong to the consuming tasks. The service is tested directly, not through HTTP. The HTTP-level parts of TC-010/022/052 wait for those routes.
- **Matching is not triggered.** Create and edit leave `matching_state = 'queued'`. Embedding, duplicate checks and the matcher are TASK-016/017/018. Candidate rows in the tests come from the test helper `addCandidate`, which does no locking and writes no audit.
- **Redaction-time idempotency gap** (OD-015-4) is open.
- **Review.** fera-review round 1: PASS (WARNs fixed in `ada7429`); round 2 safeguarding + security re-review of the fixes: PASS (WARNs fixed in the round-2 commit). Typescript, database and silent-failure reviewers did not re-run on the fixes.
- **Hosted environment.** Hosted Supabase and Vercel behaviour, CI and the multi-instance lock timeout under load are **UNKNOWN**.

## Open decisions

OD-015-1 to OD-015-17 are recorded in `specs/001-platform-foundation/contract-notes.md` ("Case service open decisions"):
- E-006 vs D2A's E-005 wording
- `voided` vs `superseded`
- audit codes outside the frozen contracts, and the effective-role actor
- idempotency after edit and redaction
- no defer decision
- the matcher lock protocol
- audit of non-denial refusals
- page-denial details without a path
- `case_versions` semantics
- `system` actor for submitted → open
- closure with leftover pending candidates
- edit side effects
- the lock timeout (now retried once)
- audit growth from repeated denials and replays (OD-015-14)
- `server-only` (OD-015-15)
- `FOR UPDATE` kept on purpose (OD-015-16)
- unindexed lookups (OD-015-17)

Notes for consumers:
- A retry after a **successful** decision or closure returns E-005, because the candidate is no longer pending or the report is already closed. The UI must reload rather than show a failure.
- TASK-017 duties come from the lock protocol in `src/server/case/internal.ts`:
  - lock both endpoints ascending before inserting candidates;
  - reconcile the queue state in the same transaction;
  - never step a report into `confirmed`, `referred` or `closed`.
- `voided` vs `superseded` is still OD-015-2.

## Contract changes wanted (not made; `src/contracts/` is frozen)

- Add the TASK-015 audit codes to `AUDIT_ACTIONS`, so API-013 consumers and the trigger-required codes share one list.
- D2A API-003 says E-005 where the contracts and API-007 say E-006 (docs PR, OD-015-1).

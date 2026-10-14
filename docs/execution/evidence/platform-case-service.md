# TASK-015 evidence: case service, state guard, audit and versions

Owner: Mahim · Lane: `mahim-case` (Claude Code), branch `phase2--mahim-case` from `origin/phase2` at `c34fb9b` · Code commit: `e0879e8` · Date: 2026-10-15 (Asia/Dhaka) · Links: TASK-015 (spec-kit T011, T014–T021), COMP-014/015, FR-016/017/018/021/029/031, BR-001/005/010/012/013/019/020/024/025, TC-016, TC-032 (plus the service parts of TC-010/018/029/031/042/046/052/053), D2 Part A §3.3–3.4, §4, §5.5 API-003/004/005/007/010/011, §7.1 and §8, D2 Part B §10.1 and §13.

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
| Redaction | re-exported from `src/server/admin/redact.ts` | Not duplicated. API-016 still uses the `fera_redactor` pool. |
| Consumer notes | `src/server/case/README.md` | Signatures and usage for Obidit (API-003/005/006) and Masnun (API-007, matcher lock protocol, API-010). |
| Test harness | `scripts/db/test-db.mjs` | `tests/db/case.test.ts` was added to the per-file fresh-database list. |

No HTTP route or UI was built. D6 TASK-015 names none; the routes belong to TASK-022/023/026/028/029. `src/contracts/**`, `db/schema_v2.sql`, `db/roles.sql`, `docs/spec/**`, `docs/markdown/**`, `docs/code/**` and `docs/MANIFEST.json` are unchanged. No grant was needed beyond the existing `fera_app` grants. For example, `SELECT … FOR UPDATE/SHARE` works through the column UPDATE grants on `cases`, `match_candidates` and `users`. No new dependency was added.

## Verification (2026-10-15, local)

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm test` | 0 | 760 passed, 113 skipped (the DB suites); 58 of them in `tests/case/` |
| `npm run test:db` | 0 | 113/113 on PG 16.15 + pgvector 0.8.1: platform 48, redaction 18, auth 13, **case 34**, each on its own `fera_test_*` database |
| `npm run build` | 0 | routes `/`, `/_not-found`, `/api/auth/sign-in`, `/api/auth/sign-out`, `/api/health` (no new routes) |

**Flaky test, not part of this change.** One of three `npm test` runs failed `tests/api/platform.test.ts › does not log unsafe client ID abc`. That test asserts that no log line contains "abc", and a random request-ID UUID can contain that hex substring. The file passed when run alone, and the next two full runs passed. The test is in TASK-007's area and was left unchanged.

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
- **No review yet.** `fera-review` and the safeguarding and database reviewers have not been run on this lane.
- **Hosted environment.** Hosted Supabase and Vercel behaviour, CI and the multi-instance lock timeout under load are **UNKNOWN**.

## Open decisions

OD-015-1 to OD-015-13 are recorded in `specs/001-platform-foundation/contract-notes.md` ("Case service open decisions"):
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
- the unmapped lock timeout

## Contract changes wanted (not made; `src/contracts/` is frozen)

- Add the TASK-015 audit codes to `AUDIT_ACTIONS`, so API-013 consumers and the trigger-required codes share one list.
- D2A API-003 says E-005 where the contracts and API-007 say E-006 (docs PR, OD-015-1).

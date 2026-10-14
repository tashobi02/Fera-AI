# TASK-062 evidence — schema invariants, restricted roles, related-payload redaction

Owner: Mahim · Lane: `mahim-invariants` (Claude Code) · Date: 2026-10-14 (Asia/Dhaka) · Links: TASK-062 (T006/T007), BR-009/010/012/013/020/025/026, TC-015/016/029/032/046/050/051/052/053/062, D2 Part A §7/7.1/§9 and API-016.

`db/schema_v2.sql` is unchanged (SHA-256 `3fe345b1…bf67`, byte-identical to `docs/code/schema_v2.sql`). Roles and grants live outside it in `db/roles.sql`, applied by `db:reset` straight after the schema. Every gap below is reported, not patched.

## Roles (T006)

D2A asks for "restricted credentials, never the schema owner", "separate restricted runtime roles" and, for API-016, an "admin route plus restricted redaction DB role". It names no roles, so these are this lane's choice (**OD-062-1**, for review):

| Role | Login | Purpose |
|---|---|---|
| `fera_owner` | no | Owns every table, sequence, enum and non-extension function in `public` (ownership is transferred after the superuser applies the schema; `vector` stays with the extension owner). Migrations use `SET ROLE fera_owner`. |
| `fera_app` | yes, `CONNECTION LIMIT 40` | Application runtime for every route except payload redaction. |
| `fera_redactor` | yes, `CONNECTION LIMIT 5` | API-016 only; used by `src/server/admin/redact.ts`. |

All three: `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`; the two login roles are `NOINHERIT`, members of nothing, `search_path = public`. Roles are cluster-global, so `db/roles.sql` creates them only if absent and re-applies attributes, passwords and grants on each run. Passwords come from `FERA_APP_DB_PASSWORD` / `FERA_REDACTOR_DB_PASSWORD` via psql `\getenv` (never argv). The local defaults in `scripts/db/roles.mjs` (`fera_app_local_dev`, `fera_redactor_local_dev`) only work on the loopback-only synthetic container and are not secrets.

### Grant list

Database: `REVOKE ALL ON DATABASE <db> FROM PUBLIC` (no CONNECT, no TEMP), `GRANT CONNECT` to the two login roles. Schema: `REVOKE CREATE ON SCHEMA public FROM PUBLIC`, `GRANT USAGE` to both. Start state: `REVOKE ALL` on all tables, sequences and the three service functions from PUBLIC and both roles. No role gets TRUNCATE, TRIGGER or REFERENCES anywhere. Identity columns need no sequence grant.

`fera_app`:

| Object | Privileges |
|---|---|
| `districts`, `district_neighbours` | SELECT |
| `users` | SELECT, INSERT; UPDATE (display_name, password_hash, verified, is_active, district_code) |
| `parent_sessions` | SELECT, INSERT; UPDATE (last_seen_at, revoked_at) |
| `intake_drafts` | SELECT, INSERT, DELETE (D2A §8 cleanup); UPDATE (payload_hash, revision, ai_calls_used) |
| `cases` | SELECT; INSERT on every column except anonymised_at, closed_at, outcome, outcome_note, created_at, updated_at; UPDATE on payload, lifecycle and matching columns. Not updatable: id, ref_code, kind, source, source_url, is_synthetic, reporter_session_id, created_by_user_id, client_submission_id, submission_payload_hash, anonymised_at, created_at |
| `case_versions`, `review_decisions`, `referrals`, `generated_outputs` | SELECT, INSERT |
| `match_candidates` | SELECT, INSERT; UPDATE (status, decided_at) |
| `duplicate_links` | SELECT, INSERT; UPDATE (status, resolved_by, resolved_at, reason) |
| `audit_log` | SELECT; INSERT (actor_type, actor_user_id, actor_session_id, action, case_id, candidate_id, details, request_id). `at` is not insertable, so the database clock is always used |
| `ai_budget` | SELECT; UPDATE (reserved_usd, committed_usd). `cap_usd` stays with the owner |
| `ai_reservations` | SELECT, INSERT; UPDATE (state, actual_usd, settled_at) |
| `ai_calls` | SELECT, INSERT |
| `rate_limits` | SELECT, INSERT, DELETE; UPDATE (count) |
| functions | EXECUTE `reserve_ai_call(uuid,numeric)`, `settle_ai_call(uuid,numeric)` |

`fera_redactor` gets exactly what `redact_case()` and the triggers it fires read and write:

| Object | Privileges |
|---|---|
| function | EXECUTE `redact_case(uuid,uuid)` |
| `users` | SELECT (id, role, verified, is_active). No password_hash |
| `cases`, `match_candidates`, `review_decisions`, `referrals` | SELECT (whole-row reads in `check_pair_integrity` / `check_duplicate_integrity`) |
| `cases` | UPDATE on the 27 identifying columns `redact_case` clears, plus anonymised_at |
| `case_versions` | SELECT (case_id), UPDATE (snapshot) |
| `generated_outputs` | SELECT (case_id), DELETE |
| `match_candidates` | UPDATE (reason_bn, reason_en, components) |
| `review_decisions` | UPDATE (reason) |
| `referrals` | UPDATE (note) |
| `duplicate_links` | SELECT (case_a, case_b), UPDATE (reason) |
| `audit_log` | SELECT (candidate_id, actor_type, actor_user_id, action); INSERT (actor_type, actor_user_id, action, case_id, details) |

Choosing between OD-3 options for `submission_payload_hash` (recompute it after an owner edit) would need that column added to `fera_app`'s UPDATE list.

## Test results

Commands: `npm run test:db` (each file gets a fresh `fera_test_<pid>_<n>` database from `db:reset`, then the database is dropped), and `npm run lint && npm run typecheck && npm test && npm run build` (DB suites skip without `FERA_DB_TESTS=1`). Local server: PostgreSQL 16.15, pgvector 0.8.1, container `fera-db` on 127.0.0.1:54322.

| Group | File | Tests | Result |
|---|---|---|---|
| Restricted roles: attributes, ownership, no TRUNCATE/TRIGGER/REFERENCES, function EXECUTE, PUBLIC CONNECT, 11 DDL/bypass refusals for both login roles (CREATE in public, TEMP, CREATE FUNCTION, ALTER/DROP TABLE, DISABLE TRIGGER, DROP TRIGGER, `session_replication_role`, `SET ROLE fera_owner`, CREATE SCHEMA), app cannot redact, narrow redactor, BR-026 synthetic-only, invoker spend functions (TC-051, TC-062) | `tests/db/platform.test.ts` | 20 | pass |
| Append-only audit: DB clock, null-FK denial (TC-052 at DB level), privilege refusal for the runtime, trigger refusal even for the superuser (TC-016, TC-051) | `tests/db/platform.test.ts` | 4 | pass |
| Lifecycle guard: initial states, full legal paths, open→confirmed, submitted→matched_pending_review, found→closed, open→referred, terminal exits, pending-review needs a candidate, closed needs outcome + closed_at, coordination closure needs a pair, field/outcome locks, stale pending candidate, future interval (TC-032) | `tests/db/platform.test.ts` | 11 | pass (includes an "unversioned edit accepted" app-obligation test) |
| Candidates and pairs: one confirm of two with competitor voided and other report reopened, second confirm blocked by unique index, stale version, swapped kinds, missing audit/referral, unverified officer, reject reason + audit, immutable history (TC-029, TC-046, TC-053) | `tests/db/platform.test.ts` | 7 | pass (includes the TC-053 gap test) |
| Duplicate links: case_a < case_b, same kind, shared phone never confirmed_same, verified resolver | `tests/db/platform.test.ts` | 3 | pass |
| Redaction (T007): TC-015 all-eligible run (2 redacted, 1 found report skipped while its missing report is unclosed, status/district counts unchanged); direct fields cleared, age coarsened to a 2-year band, ID/ref/date/district/lifecycle kept; OD-3 keys nulled; related snapshot, output, candidate, decision, referral and duplicate payload cleared (TC-050); no identifying string left in any table; prior audit unchanged plus one `case.payload_redacted` event with `mode: pseudonymisation, external_copies_removed: false`; immutable after; repeat is a no-op; found report redacted once its missing report closes; non-terminal and unknown IDs skipped; non-admin principal refused before any query; inactive admin refused by the DB and propagated | `tests/db/redaction.test.ts` | 14 | pass (includes 2 gap tests) |

Observed 2026-10-14 23:53 (Asia/Dhaka): `npm run test:db` exit 0 — `platform.test.ts` 45/45 passed on `fera_test_72142_0`, `redaction.test.ts` 14/14 passed on `fera_test_72142_1`, both databases dropped afterwards; roles were already present from the previous run, so the script's idempotent path was exercised. `db/roles.sql` without the password variables stops at its first statement (psql exit 3). Plain `npm test`: 321 passed, 59 skipped (the DB suites). Earlier in the session the Docker Desktop daemon stopped responding and was restarted; the `fera-db-data` volume and the default `fera` database survived.

## What the frozen schema enforces vs what the app must

Schema, verified above: initial states; the legal transition graph for each kind; kind immutability; closed ⇒ outcome; closed_at ⇔ terminal; terminal field and outcome locks; pending-review ⇒ a pending candidate (on the row being updated); no stale pending candidate on an updated case; one confirmed candidate per endpoint; a confirmed pair needs decision + simulated referral + `match.confirm` audit + both final states; rejection needs a reason and `match.reject` audit; verified active decision author; immutable decision/referral/confirmed-candidate history except prescribed redaction; duplicate ordering, kind and shared-phone rules; append-only audit by trigger (even for the superuser); synthetic-only rows; redaction eligibility, its field set and the safe audit event.

App obligations (TASK-015 and the route owners):
- Version bump and `case_versions` snapshot on every owner edit (the DB accepts an unversioned edit; test documents it).
- Reconciling the other report when its last pending candidate is voided (TC-053). The schema only checks the rows a transaction updates, so voiding a competitor can leave that report in `matched_pending_review` with no pending candidate (gap test).
- `resolved_outside_fera` only from open (`allowedCloseOutcome`); the SQL only constrains the other direction.
- Sorted-UUID lock order, expected-version rechecks, competitor voiding and audit rows other than the three trigger-required actions.
- Admin authority for redaction. `redact_case(p_case, p_admin)` takes the admin UUID as an argument, so the route must pass the session principal's ID; `redact.ts` checks `canCall("API-016")` first.
- No child payload in `audit_log.details` (redaction cannot clear append-only rows; the full-table scan above shows the test fixtures leave none).
- OD-3 replay tombstone: after redaction the idempotency key is gone (test confirms it is nulled).

## Schema gaps found (reported, not edited)

1. **Service functions are SECURITY INVOKER** (`redact_case`, `reserve_ai_call`, `settle_ai_call`). EXECUTE alone is not enough, so the caller also holds the underlying column privileges: `fera_redactor` can null identifying columns outside `redact_case` (gap test), and `fera_app` can move `ai_budget.reserved_usd/committed_usd` directly. A spec-pack change to `SECURITY DEFINER` + `SET search_path = public, pg_temp`, owned by `fera_owner`, would let both roles hold EXECUTE only (**OD-062-2**, spec PR with all-owner review).
2. **Competitor reconciliation is not enforced** (see above; TC-053 stays an app test).
3. **A later officer deactivation blocks redaction**: `redact_case` rewrites `duplicate_links.reason`, and `check_duplicate_integrity` re-checks the original resolver on every update, so a link resolved by a since-deactivated officer makes redaction fail with 42501 (gap test). Needs a spec decision (**OD-062-3**).
4. `redact_case` raises eligibility errors with the generic SQLSTATE P0001, so `redact.ts` checks eligibility with the same predicate under `FOR UPDATE` first instead of matching message text.
5. `redact_case` sets `duplicate_links.reason = '[REDACTED]'` on flagged links that had no reason. Harmless, noted for accuracy.

## Hosted database — operator procedure (not run)

The hosted Supabase project's state is **UNKNOWN**: whether the schema is applied, its server/pgvector versions, roles, pooler mode and Data API settings were not inspected (agents do not read `.env*`). Applying anything there needs Mahim's and Obidit's go-ahead. Procedure:

1. Confirm PostgreSQL 16 and pgvector ≥ 0.8.1 on the host; record which schema holds `vector` (`SELECT extnamespace::regnamespace FROM pg_extension WHERE extname = 'vector'`), because `CREATE EXTENSION IF NOT EXISTS vector` installs into the first `search_path` schema. If it is not `public`, the runtime roles' `search_path` must include it so `vector`, `<=>` and `vector_cosine_ops` resolve. **UNKNOWN**.
2. Apply `db/schema_v2.sql` to a fresh database only (D2A §7.1), then `db/roles.sql` with real passwords from the operator's secret store: `FERA_APP_DB_PASSWORD=… FERA_REDACTOR_DB_PASSWORD=… psql "$OWNER_URL" -f db/roles.sql`. On Supabase, `postgres` is not a true superuser. Whether it may create these roles and transfer ownership to `fera_owner` is **UNKNOWN**; verify before relying on it.
3. **Supabase default privileges.** `REVOKE … FROM PUBLIC` does not remove Supabase's default-privilege grants to `anon`, `authenticated` and `service_role`. If the Data API exposes `public`, those roles may reach every table and call `redact_case` over RPC. Check with `has_table_privilege` / `has_function_privilege` for each, `REVOKE ALL ON ALL TABLES, SEQUENCES, FUNCTIONS IN SCHEMA public FROM anon, authenticated, service_role`, `ALTER DEFAULT PRIVILEGES … REVOKE` for future objects, and remove `public` from the exposed schemas or disable the Data API. Defensive RLS (enable with no permissive policies for those roles) is optional extra protection; this lane did not add it. Current host state: **UNKNOWN**.
4. Connection strings: `DATABASE_URL` uses `fera_app`, a separate redaction URL uses `fera_redactor` (variable name is TASK-015's choice), and the owner/admin URL is used only for migrations. All go over TLS and are held as hosting secrets, never committed or logged.
5. Pooler mode (transaction vs session) is **UNKNOWN**. The case service's multi-statement transactions and deferred constraint triggers need one connection per transaction; prepared statements under a transaction pooler need checking.
6. Re-run the negative checks from `tests/db/platform.test.ts` against the host as `fera_app`/`fera_redactor` (TC-062), plus the `has_table_privilege` checks for the Supabase roles. Not done; the hosted result is **UNKNOWN**.

## CI

`.github/workflows/ci.yml` gains a `db` job: it builds `db/docker/Dockerfile`, starts the container on 127.0.0.1:54322 and runs `npm run test:db`. It has not run yet because nothing was pushed from this lane; its first result is **pending**.

## Open decisions

- **OD-062-1** role design (three roles above): needs review by all owners.
- **OD-062-2** SECURITY DEFINER service functions: a spec-pack PR, or keep the invoker grants.
- **OD-062-3** redaction vs deactivated duplicate resolver.
- **OD-3** (existing): the hash after an edit and the replay tombstone after redaction. If the hash is recomputed, `fera_app` needs UPDATE on `submission_payload_hash`.
- Seeding identity: whether `npm run seed` runs as `fera_app` (the grants allow users/cases/audit inserts but not reference data) or as the owner is TASK-010/Masnun's decision. Districts need the owner.
- Retained metadata after redaction (ref code, district, dates, status, a coarse age band, version, audit IDs) is pseudonymous restricted data, not anonymous.

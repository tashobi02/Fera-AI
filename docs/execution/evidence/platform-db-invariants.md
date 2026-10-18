# TASK-062 evidence — schema invariants, restricted roles, related-payload redaction

Owner: Mahim · Lane: `mahim-invariants` (Claude Code) · Date: 2026-10-14/15 (Asia/Dhaka) · Links: TASK-062 (T006/T007), BR-009/010/012/013/020/025/026, TC-015/016/029/032/046/050/051/052/053/062, D2 Part A §7/7.1/§9 and API-016.

`db/schema_v2.sql` is unchanged (SHA-256 `3fe345b1…bf67`, byte-identical to `docs/code/schema_v2.sql`). Roles, grants and the function security attributes live outside it in `db/roles.sql`, which `db:reset` applies straight after the schema. Schema gaps are reported here, not patched.

**Scope of this evidence.** Everything below is the database-level part, run on the local container. The app and API parts of TC-016, TC-046, TC-052, TC-053 and TC-062 are still pending in TASK-015 and the route owners. The hosted database is **UNKNOWN**.

## Roles (T006)

D2A asks for "restricted credentials, never the schema owner", "separate restricted runtime roles" and, for API-016, an "admin route plus restricted redaction DB role". It does not name the roles, so the three below are this lane's choice. That choice is **OD-062-1**, open for review.

| Role | Login | Purpose |
|---|---|---|
| `fera_owner` | no | Owns every table, enum and non-extension function in `public`. The superuser applies the schema, then ownership is transferred; `vector` stays with the extension owner. Migrations use `SET ROLE fera_owner`. |
| `fera_app` | yes, `CONNECTION LIMIT 40` | Application runtime for every route except payload redaction. |
| `fera_redactor` | yes, `CONNECTION LIMIT 5` | API-016 only; used by `src/server/admin/redact.ts`. |

All three are `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`. Both login roles are also `NOINHERIT`.

Role settings: `ALTER ROLE … RESET ALL` runs first, then:

| Setting | `fera_app` | `fera_redactor` | Why |
|---|---|---|---|
| `search_path` | `public` | `public` | |
| `statement_timeout` | 30s | 60s | Requests are short; one redaction batch item can take longer. |
| `lock_timeout` | 5s | 5s | A stuck lock must not stall case rows. |
| `idle_in_transaction_session_timeout` | 60s | 60s | An abandoned transaction must not hold case rows. |

`db/roles.sql` behaviour:
- **Idempotent.** It tolerates a concurrent `CREATE ROLE`. Already-owned objects are skipped, so a re-run takes no `ACCESS EXCLUSIVE` locks. Re-running it twice in a row was observed to work.
- **Drift repair.** Memberships *of* the three roles are revoked, and so is anyone else's membership *in* `fera_app`/`fera_redactor`, except the running operator's. Grants of `fera_owner` to operators are kept.
- **Transactional.** Ownership, function attributes and object grants run in one transaction. Cluster-global role statements (creation, drift-repair membership REVOKEs, ALTER ROLE settings) run before it and are idempotent; a failure there leaves object privileges unchanged.
- **Single runner.** Role statements write shared catalogs, so two concurrent runs can fail with "tuple concurrently updated". Run one `db:reset`/`test:db` per cluster at a time. `test:db` itself runs its files one after another.
- **Passwords.** They come from `FERA_APP_DB_PASSWORD`/`FERA_REDACTOR_DB_PASSWORD` through psql `\getenv`, never argv. An unset, empty or shorter-than-16-character value stops the script before any statement runs (observed). `scripts/db/rolePasswordEnv` treats an empty value as unset, with a warning. It returns the local defaults `fera_app_local_dev` and `fera_redactor_local_dev` only after checking that the admin URL is local. These defaults are not secrets.
- **Cleartext in the statement.** `ALTER ROLE … PASSWORD` carries the cleartext, so server statement logging could record it. That is acceptable only on the local container. On a hosted database, use psql `\password` or a precomputed SCRAM-SHA-256 verifier.

### OD-062-2: service functions run as their owner (provisional)

The frozen schema defines `redact_case`, `reserve_ai_call` and `settle_ai_call` as SECURITY INVOKER. `db/roles.sql` now runs `ALTER FUNCTION … SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp` on all three. They are owned by `fera_owner`, and the function bodies are unchanged. It also runs `ALTER DEFAULT PRIVILEGES FOR ROLE fera_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`.

Callers now hold EXECUTE in place of the table privileges the functions write. The tests show the bypass is closed:
- `fera_redactor` cannot null identifying fields, set `anonymised_at`, rewrite candidate reasons, delete outputs or insert audit rows.
- `fera_app` cannot move `ai_budget`, write `ai_reservations` or change `intake_drafts.ai_calls_used`/`revision`.

This change alters the security attributes of spec-pack functions, so the PR **needs review by all three owners**. It is resolved here only provisionally, in the grants layer.

**Finding while applying it.** Deferred constraint triggers fire at COMMIT, where they run as the session role (`fera_redactor`) rather than inside the definer function. `check_pair_integrity` reads whole rows that the redactor cannot read. So `redact.ts` sets `SET CONSTRAINTS ALL IMMEDIATE` inside its transaction, and the deferred checks then fire inside `redact_case()` as the owner. A direct `SELECT redact_case(…)` without it fails closed: 42501 at COMMIT, nothing changed (tested). Nothing had to be forced, and no trigger path broke.

### Grant list (golden-tested)

Database: `REVOKE ALL ON DATABASE <db> FROM PUBLIC` (no CONNECT, no TEMP), then `GRANT CONNECT` to the two login roles. Schema: `REVOKE CREATE ON SCHEMA public FROM PUBLIC`, then `GRANT USAGE` to both. Starting point: `REVOKE ALL` on all tables, sequences and the three functions, from PUBLIC and both roles. No role gets TRUNCATE, TRIGGER or REFERENCES anywhere.

`tests/db/platform.test.ts` compares the effective table- and column-level privileges for every role × table against this list. Any widening or narrowing of a grant fails the test.

`fera_app`:

| Object | Privileges |
|---|---|
| `districts`, `district_neighbours` | SELECT |
| `users` | SELECT; UPDATE (verified), for API-017 [MOCK]. Accounts, roles and activity are owner-seeded; no INSERT |
| `parent_sessions` | SELECT, INSERT; UPDATE (last_seen_at, revoked_at) |
| `intake_drafts` | SELECT, INSERT, DELETE (D2A §8 cleanup); UPDATE (payload_hash). The counter and revision move only through `reserve_ai_call` |
| `cases` | SELECT. INSERT on 42 columns: everything except anonymised_at, closed_at, outcome, outcome_note, created_at and updated_at. UPDATE on 35 payload, lifecycle and matching columns. Not updatable: id, ref_code, kind, source, source_url, is_synthetic, reporter_session_id, created_by_user_id, client_submission_id, submission_payload_hash, anonymised_at, created_at |
| `case_versions`, `review_decisions`, `referrals`, `generated_outputs` | SELECT, INSERT |
| `match_candidates` | SELECT, INSERT; UPDATE (status, decided_at) |
| `duplicate_links` | SELECT, INSERT; UPDATE (status, resolved_by, resolved_at, reason) |
| `audit_log` | SELECT. INSERT on 8 columns, not `at` (the database clock sets it) |
| `ai_budget`, `ai_reservations` | SELECT |
| `ai_calls` | SELECT, INSERT |
| `rate_limits` | SELECT, INSERT, DELETE; UPDATE (count) |
| functions | EXECUTE `reserve_ai_call`, `settle_ai_call` |

`fera_redactor`: EXECUTE `redact_case`; SELECT `cases`(id, kind, status, anonymised_at) and `match_candidates`(missing_case_id, found_case_id, status). Those are the columns `redact.ts` reads to list cases and pre-check eligibility. Nothing else.

Resolving OD-3 by recomputing the hash after owner edits would need `submission_payload_hash` added to `fera_app`'s UPDATE grant.

## Test results

Commands:
- `npm run test:db` gives each file a fresh `fera_test_<pid>_<n>` database through `db:reset` and drops it afterwards.
- `npm run lint && npm run typecheck && npm test && npm run build`. The DB suites skip without `FERA_DB_TESTS=1`.

Local server: PostgreSQL 16.15 with pgvector 0.8.1, container `fera-db` on 127.0.0.1:54322. The image is built from `db/docker/Dockerfile`, whose base is now pinned to the `postgres:16-alpine` multi-arch index digest `sha256:cf78e766…0685`; the rebuild was verified.

Latest run, 2026-10-15 00:12 (Asia/Dhaka): `npm run test:db` exited 0. `platform.test.ts` passed 48/48 on `fera_test_79212_0` and `redaction.test.ts` passed 18/18 on `fera_test_79212_1`; both databases were dropped afterwards. Plain `npm test` passed 325 and skipped 66 (the DB suites); that count includes 4 new `rolePasswordEnv` unit tests. In the first session the Docker Desktop daemon stopped responding and was restarted. The `fera-db-data` volume and the default `fera` database survived.

| Group | File | Tests | Result |
|---|---|---|---|
| Restricted roles: attributes, settings, no memberships; ownership; golden privilege matrix; no TRUNCATE/TRIGGER/REFERENCES; function EXECUTE, SECURITY DEFINER with pinned search_path, default ACL; no PUBLIC CONNECT; 11 DDL or bypass refusals for both login roles; app cannot redact; narrow redactor; app account limits; BR-026 synthetic-only; spend only via the functions (TC-051; TC-062 DB part) | `platform.test.ts` | 23 | pass |
| Append-only audit: database clock, null-FK denial insert, runtime refused by privilege, superuser refused by trigger (TC-016/TC-052 DB part) | `platform.test.ts` | 4 | pass |
| Lifecycle guard (TC-032), including an "unversioned edit accepted" app-obligation test | `platform.test.ts` | 11 | pass |
| Candidates and pairs (TC-029; TC-046/TC-053 DB part), including the TC-053 app-obligation test | `platform.test.ts` | 7 | pass |
| Duplicate links | `platform.test.ts` | 3 | pass |
| Redaction (T007): see the list below | `redaction.test.ts` | 18 | pass |

The 18 redaction tests cover:
- the TC-015 all-eligible run, and the TC-050 related-payload clearing;
- the OD-3 keys being nulled, and no identifying string left in any table;
- the safe audit event; immutability afterwards; repeat as a no-op; the found report redacted once its missing report closes;
- non-terminal and unknown IDs skipped;
- refusals before any query: a non-admin principal, and an invalid request (schema parse);
- failing closed: a pool that is not `fera_redactor`, an inactive admin (SQLSTATE only), and a direct call without immediate constraints;
- batch abort behaviour, the bypass-closed checks, and the deactivated-resolver gap.

## What the frozen schema enforces vs what the app must

**Enforced by the schema (verified above):**
- Lifecycle: initial states; the legal transition graph for each kind; kind immutability.
- Closure: closed ⇒ outcome; closed_at ⇔ terminal.
- Locks: terminal field and outcome locks.
- Pending candidates, on the rows a transaction updates: pending-review ⇒ a pending candidate; an updated case keeps no stale pending candidate.
- Pairs: one confirmed candidate per endpoint. A confirmed pair needs a decision, a simulated referral, a `match.confirm` audit row and both final states. A rejection needs a reason and a `match.reject` audit row. The decision author must be a verified, active officer.
- History: decision, referral and confirmed-candidate history is immutable, except the prescribed redaction.
- Duplicates: ordering, same kind, shared-phone rules.
- Audit is append-only by trigger, even for the superuser.
- Synthetic-only rows.
- Redaction: eligibility, the field set it clears, and the safe audit event.

**App and route obligations (TASK-015 and the route owners):**
- Bump the version and write a `case_versions` snapshot on every owner edit. The DB accepts an unversioned edit; a test documents this.
- Reconcile the other report when its last pending candidate is voided (TC-053). D2A §7.1 assigns "UI state reconciliation" to application tests. The schema only checks rows a transaction updates, so voiding a competitor can leave that report in `matched_pending_review` with no pending candidate (app-obligation test).
- Allow `resolved_outside_fera` only from open (`allowedCloseOutcome`). SQL constrains only the other direction.
- Sorted-UUID lock order, expected-version rechecks, competitor voiding, and audit rows other than the three trigger-required actions.
- Admin authority for redaction. `redact_case(p_case, p_admin)` takes the admin UUID as an argument, so the route must pass the session principal's ID. `redact.ts` checks `canCall("API-016")` and asserts `current_user = fera_redactor`.
- The API-016 route writes `access.denied` (through `fera_app`) when it catches `RedactionForbiddenError`.
- Never log or return pg `err.detail`, `err.where` or `err.message`. They can quote row values. `RedactionDbError` carries only the SQLSTATE and the committed count.
- No writes to `case_versions` or `generated_outputs` for a redacted case. `redact_case` clears them, and only the `cases` row is locked against later writes.
- No child payload in `audit_log.details`. Redaction cannot clear append-only rows; the full-table scan finds none from the test fixtures.
- OD-3 replay tombstone: after redaction the idempotency key is gone (tested).

## Schema gaps (reported, not edited)

Real schema gaps:
1. **The service functions are SECURITY INVOKER.** Under that, the callers must hold the table privileges the functions write, which opens direct-write bypasses. Mitigated provisionally in the operator layer (OD-062-2, above); a spec-pack PR would make it permanent.
2. **A later officer deactivation blocks redaction.** `redact_case` rewrites `duplicate_links.reason`, and `check_duplicate_integrity` re-checks the original resolver on every update. So a link resolved by an officer who has since been deactivated makes redaction fail with 42501 (gap test). **OD-062-3.**

App obligation, not a schema gap: competitor reconciliation (TC-053, D2A §7.1 line 1246).

Observations:
- `redact_case` raises eligibility errors with the generic SQLSTATE P0001. So `redact.ts` re-checks eligibility with the same predicate, cross-referenced in a code comment, instead of matching message text.
- It sets `duplicate_links.reason = '[REDACTED]'` even on flagged links that had no reason.

## Hosted database — operator procedure (not run)

The hosted Supabase project's state is **UNKNOWN**. Not inspected: whether the schema is applied, server/pgvector versions, roles, pooler mode, Data API settings (agents do not read `.env*`). Changing it needs Mahim's and Obidit's go-ahead.

1. **Client.** Use psql ≥ 15; `\getenv` needs it.
2. **Versions and the `vector` schema.** Confirm PostgreSQL 16 and pgvector ≥ 0.8.1. Find which schema holds `vector`: `SELECT extnamespace::regnamespace FROM pg_extension WHERE extname = 'vector'`. Supabase often uses `extensions`. If it is not `public`, add it to the runtime roles' path, for example `ALTER ROLE fera_app SET search_path = public, extensions` (same for `fera_redactor`). Then check that `vector`, `<=>` and `vector_cosine_ops` resolve. The functions' pinned path is `pg_catalog, public, pg_temp`; they do not use vector operators. **UNKNOWN.**
3. **Fresh database.** On Supabase, "fresh" means an empty `public` schema, with no earlier Fera objects. Apply `db/schema_v2.sql` (D2A §7.1).
4. **Operator rights.** The operator must be able to `SET ROLE fera_owner`, so run `GRANT fera_owner TO <operator>`. To run `REVOKE CREATE ON SCHEMA public FROM PUBLIC` it must own `public` or be granted that right. On Supabase, `postgres` is not a true superuser; whether it can create these roles and transfer ownership is **UNKNOWN**.
5. **Roles.** Run `db/roles.sql`, with passwords from the operator's secret store or set afterwards with `\password`.
6. **Database ACL side effects.** The impact of `REVOKE ALL ON DATABASE … FROM PUBLIC` on Supabase's internal roles (`authenticator`, `supabase_admin`, storage/auth services) is **UNKNOWN**. Check that those services still connect, or grant them CONNECT explicitly.
7. **Supabase default privileges.** `REVOKE … FROM PUBLIC` does not remove Supabase's default-privilege grants to `anon`, `authenticated` and `service_role`. If the Data API exposes `public`, those roles may reach tables and call `redact_case` over RPC. To close this:
   - Check each with `has_table_privilege` / `has_function_privilege`.
   - Run `REVOKE ALL ON ALL TABLES, SEQUENCES, FUNCTIONS IN SCHEMA public FROM anon, authenticated, service_role`, plus the matching `ALTER DEFAULT PRIVILEGES … REVOKE`.
   - Remove `public` from the exposed schemas, or disable the Data API.
   - About RLS: enabling RLS with no policies would block `fera_app` and `fera_redactor` too, and would not stop `service_role`, which has BYPASSRLS. Defensive RLS therefore needs explicit permissive policies for the two Fera roles. This lane did not add RLS.
   - Current host state: **UNKNOWN**.
8. **Connection strings.** `DATABASE_URL` uses `fera_app`. A separate redaction URL uses `fera_redactor`; the variable name is TASK-015's choice. The owner/admin URL is for migrations only. All go over TLS, are kept as hosting secrets, and are never committed or logged.
9. **Pooler mode** (transaction vs session) is **UNKNOWN**. Multi-statement transactions, `SET CONSTRAINTS` and deferred triggers need one connection per transaction; prepared statements under a transaction pooler need checking.
10. **Re-run the checks on the host.** Run the negative checks from `tests/db/platform.test.ts` as `fera_app`/`fera_redactor` (TC-062), plus the Supabase-role privilege checks. Not done; **UNKNOWN**.

## CI

`.github/workflows/ci.yml` gains a `db` job. It builds the digest-pinned `db/docker/Dockerfile`, starts it on 127.0.0.1:54322 and runs `npm run test:db`. It has not run yet because nothing was pushed from this lane; the first result is **pending**.

## Dependencies (for the PR description)

- `pg@8.23.1` (runtime) and `@types/pg@8.23.1` (dev), both pinned exactly. AGENTS.md names `pg` with hand-written SQL, no ORM, as the planned driver; these are the first users. Both versions were published at least two weeks before 2026-10-14.
- When they were added, npm 11 dropped other platforms' optional bindings from the lockfile. The lockfile was rebuilt as the original plus only the 15 new `pg` packages.

## Open decisions

- **OD-062-1:** the role design (three roles, above). Needs all-owner review.
- **OD-062-2:** SECURITY DEFINER on the three service functions in the operator layer. Provisional. Needs all three owners, and later a spec-pack PR to move it into the schema.
- **OD-062-3:** redaction vs a deactivated duplicate resolver.
- **OD-062-4:** batch failure. The current behaviour aborts at the first failing case: earlier cases stay redacted, later ones are not attempted, and the error carries the committed count (tested). The alternative is to continue and count failures.
- **OD-3** (existing): the hash after an edit, and the replay tombstone after redaction.
- **Seeding identity.** Accounts and reference data now need the owner, because `fera_app` cannot insert users. TASK-010/Masnun decide how `npm run seed` connects.
- Retained metadata after redaction is pseudonymous restricted data, not anonymous: ref code, district, dates, status, a coarse 2-year age band, version, audit IDs.

-- Fera runtime roles and grants (TASK-062, T006). Applied after db/schema_v2.sql, which
-- stays frozen; its closing comment asks the operator to grant restricted runtime roles.
-- Roles are cluster-global and survive DROP DATABASE, so creation is idempotent; the
-- grants are per database and are re-applied after every fresh schema load.
--
-- Run with psql >= 15 as a superuser (or an operator who is a member of fera_owner);
-- passwords come from the environment, never argv:
--   FERA_APP_DB_PASSWORD=… FERA_REDACTOR_DB_PASSWORD=… psql "$URL" -f db/roles.sql
-- db:reset applies it with the local defaults in scripts/db/roles.mjs (synthetic dev only).
-- ALTER ROLE … PASSWORD sends the cleartext in the statement, where server statement
-- logging could record it. That is acceptable for the local container only; on a hosted
-- database set passwords with psql \password or a precomputed SCRAM-SHA-256 verifier.
--
-- Single runner: role statements touch shared catalogs, and two concurrent runs can fail
-- with "tuple concurrently updated". Role creation tolerates a concurrent creator, but do
-- not run two db:reset / test:db processes against the same cluster at once.
\set ON_ERROR_STOP 1
\getenv app_password FERA_APP_DB_PASSWORD
\getenv redactor_password FERA_REDACTOR_DB_PASSWORD
\if :{?app_password}
\else
  DO $$ BEGIN RAISE EXCEPTION 'FERA_APP_DB_PASSWORD is not set'; END $$;
\endif
\if :{?redactor_password}
\else
  DO $$ BEGIN RAISE EXCEPTION 'FERA_REDACTOR_DB_PASSWORD is not set'; END $$;
\endif
-- Empty or short values fail instead of clearing or weakening a password.
SELECT length(:'app_password') >= 16 AND length(:'redactor_password') >= 16 AS passwords_ok \gset
\if :passwords_ok
\else
  DO $$ BEGIN RAISE EXCEPTION 'runtime role passwords must be at least 16 characters'; END $$;
\endif

-- Roles --------------------------------------------------------------------
-- fera_owner:    owns the schema objects; NOLOGIN, used by migrations via SET ROLE.
-- fera_app:      application runtime (all routes except payload redaction).
-- fera_redactor: API-016 only ("admin route plus restricted redaction DB role", D2A).
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['fera_owner', 'fera_app', 'fera_redactor'] LOOP
    BEGIN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
    END;
  END LOOP;
END $$;

-- Drift repair: the roles are members of nothing, and nobody but the running operator
-- holds the runtime roles. Grants of fera_owner to operators are kept.
SELECT format('REVOKE %I FROM %I', m.roleid::regrole::text, m.member::regrole::text)
FROM pg_auth_members m
WHERE m.member IN ('fera_owner'::regrole, 'fera_app'::regrole, 'fera_redactor'::regrole)
   OR (m.roleid IN ('fera_app'::regrole, 'fera_redactor'::regrole) AND m.member <> current_user::regrole) \gexec

ALTER ROLE fera_owner    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE fera_app      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT
  CONNECTION LIMIT 40 PASSWORD :'app_password';
ALTER ROLE fera_redactor LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT
  CONNECTION LIMIT 5 PASSWORD :'redactor_password';
ALTER ROLE fera_owner RESET ALL;
ALTER ROLE fera_app RESET ALL;
ALTER ROLE fera_redactor RESET ALL;
-- Timeouts: requests are short, and a stuck lock or an abandoned transaction must not
-- hold case rows. The redactor gets longer statements for one batch item.
ALTER ROLE fera_app SET search_path = public;
ALTER ROLE fera_app SET statement_timeout = '30s';
ALTER ROLE fera_app SET lock_timeout = '5s';
ALTER ROLE fera_app SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE fera_redactor SET search_path = public;
ALTER ROLE fera_redactor SET statement_timeout = '60s';
ALTER ROLE fera_redactor SET lock_timeout = '5s';
ALTER ROLE fera_redactor SET idle_in_transaction_session_timeout = '60s';

BEGIN;

-- Ownership: the schema was applied by the superuser; hand every non-extension object
-- to fera_owner so no login role (and not the runtime) owns tables or functions. Already
-- owned objects are skipped, so a re-run takes no ACCESS EXCLUSIVE locks.
SELECT format('ALTER TABLE public.%I OWNER TO fera_owner', c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relowner <> 'fera_owner'::regrole
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e') \gexec
SELECT format('ALTER FUNCTION %s OWNER TO fera_owner', p.oid::regprocedure)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proowner <> 'fera_owner'::regrole
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') \gexec
SELECT format('ALTER TYPE public.%I OWNER TO fera_owner', t.typname)
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype = 'e' AND t.typowner <> 'fera_owner'::regrole
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e') \gexec

-- OD-062-2 (provisional, needs all-owner review): the three service functions run as
-- their owner with a pinned search_path, so callers hold EXECUTE instead of the table
-- privileges the functions write. The function bodies are unchanged.
ALTER FUNCTION redact_case(uuid, uuid) SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION reserve_ai_call(uuid, numeric) SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION settle_ai_call(uuid, numeric) SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION issue_intake_question(uuid, int) SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION set_intake_payload_hash(uuid, int, text) SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
ALTER DEFAULT PRIVILEGES FOR ROLE fera_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Database and schema: nobody connects, creates or uses temp tables by default.
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO fera_app, fera_redactor', current_database()) \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO fera_app, fera_redactor;

-- Start from nothing on every table, sequence and service function.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, fera_app, fera_redactor;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, fera_app, fera_redactor;
REVOKE ALL ON FUNCTION redact_case(uuid, uuid), reserve_ai_call(uuid, numeric), settle_ai_call(uuid, numeric),
  issue_intake_question(uuid, int), set_intake_payload_hash(uuid, int, text)
  FROM PUBLIC, fera_app, fera_redactor;

-- fera_app ------------------------------------------------------------------
-- Reference data, accounts and seeds are loaded by the owner. API-017 verify [MOCK] is the
-- only account write a route makes; sign-in reads the hash.
GRANT SELECT ON districts, district_neighbours TO fera_app;
GRANT SELECT ON users TO fera_app;
GRANT UPDATE (verified) ON users TO fera_app;

GRANT SELECT, INSERT ON parent_sessions TO fera_app;
GRANT UPDATE (last_seen_at, revoked_at) ON parent_sessions TO fera_app;

-- Draft metadata; DELETE is the D2A section 8 expired-metadata cleanup. The call counter
-- and revision move only through reserve_ai_call().
GRANT SELECT, INSERT, DELETE ON intake_drafts TO fera_app;
GRANT UPDATE (payload_hash) ON intake_drafts TO fera_app;

-- Cases: anonymised_at is neither insertable nor updatable, so redaction only happens
-- through redact_case(). Identity, ownership and idempotency keys are not updatable
-- (OD-3: a hash recompute after owner edits would need submission_payload_hash here).
GRANT SELECT ON cases TO fera_app;
GRANT INSERT (id, ref_code, kind, status, source, source_url, is_synthetic, reporter_session_id,
  created_by_user_id, raw_text, child_name, child_name_latin, age_years, age_min, age_max, sex,
  height_cm, clothing, marks, circumstances, event_at, event_at_approx, event_at_lower,
  event_at_upper, provenance, embedding_model, embedding_revision, embedding_space,
  matching_state, matched_at, match_error_id, place_text, district_code, thana,
  reporter_relation, contact_phone, gd_number, embedding, client_submission_id,
  submission_payload_hash, input_hash, version) ON cases TO fera_app;
GRANT UPDATE (status, raw_text, child_name, child_name_latin, age_years, age_min, age_max, sex,
  height_cm, clothing, marks, circumstances, event_at, event_at_approx, event_at_lower,
  event_at_upper, provenance, embedding_model, embedding_revision, embedding_space,
  matching_state, matched_at, match_error_id, place_text, district_code, thana,
  reporter_relation, contact_phone, gd_number, embedding, input_hash, version, outcome,
  outcome_note, closed_at) ON cases TO fera_app;

-- Versions, decisions, referrals and outputs are insert-only for the runtime.
GRANT SELECT, INSERT ON case_versions, review_decisions, referrals, generated_outputs TO fera_app;

GRANT SELECT, INSERT ON match_candidates TO fera_app;
GRANT UPDATE (status, decided_at) ON match_candidates TO fera_app;

GRANT SELECT, INSERT ON duplicate_links TO fera_app;
GRANT UPDATE (status, resolved_by, resolved_at, reason) ON duplicate_links TO fera_app;

-- Audit: append-only, and the database clock sets `at` (no backdating).
GRANT SELECT ON audit_log TO fera_app;
GRANT INSERT (actor_type, actor_user_id, actor_session_id, action, case_id, candidate_id, details, request_id)
  ON audit_log TO fera_app;

-- Spend: reservations and settlement only through the functions; cap_usd stays with the
-- owner (USD 25 default, at most 30). ai_calls is the per-call log the app writes.
GRANT SELECT ON ai_budget, ai_reservations TO fera_app;
GRANT SELECT, INSERT ON ai_calls TO fera_app;
GRANT EXECUTE ON FUNCTION reserve_ai_call(uuid, numeric), settle_ai_call(uuid, numeric) TO fera_app;
-- Draft metadata counters and payload hash are owned by the owner and exposed
-- only through these two functions; the app holds no UPDATE on follow_up_round
-- or revision.
GRANT EXECUTE ON FUNCTION issue_intake_question(uuid, int), set_intake_payload_hash(uuid, int, text) TO fera_app;

GRANT SELECT, INSERT, DELETE ON rate_limits TO fera_app;
GRANT UPDATE (count) ON rate_limits TO fera_app;

-- fera_redactor -------------------------------------------------------------
-- EXECUTE redact_case() plus the columns src/server/admin/redact.ts reads to list and
-- pre-check eligible cases. No writes of its own: redact_case() writes as fera_owner.
-- The caller must SET CONSTRAINTS ALL IMMEDIATE so the deferred pair checks fire inside
-- the function (as the owner) rather than at COMMIT as this role, which cannot read the
-- whole rows they need and therefore fails closed.
GRANT EXECUTE ON FUNCTION redact_case(uuid, uuid) TO fera_redactor;
GRANT SELECT (id, kind, status, anonymised_at) ON cases TO fera_redactor;
GRANT SELECT (missing_case_id, found_case_id, status) ON match_candidates TO fera_redactor;

COMMIT;

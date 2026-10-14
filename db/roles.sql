-- Fera runtime roles and grants (TASK-062, T006). Applied after db/schema_v2.sql, which
-- stays frozen; its closing comment asks the operator to grant restricted runtime roles.
-- Roles are cluster-global and survive DROP DATABASE, so creation is idempotent; the
-- grants are per database and are re-applied after every fresh schema load.
-- Run with psql (>= 15) as a superuser; passwords come from the environment, never argv:
--   FERA_APP_DB_PASSWORD=… FERA_REDACTOR_DB_PASSWORD=… psql "$URL" -f db/roles.sql
-- db:reset applies it with the local defaults in scripts/db/roles.mjs (synthetic dev only).
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

-- Roles --------------------------------------------------------------------
-- fera_owner:    owns the schema objects; NOLOGIN, used by migrations via SET ROLE.
-- fera_app:      application runtime (all routes except payload redaction).
-- fera_redactor: API-016 only ("admin route plus restricted redaction DB role", D2A).
SELECT format('CREATE ROLE %I NOLOGIN', r)
FROM unnest(ARRAY['fera_owner', 'fera_app', 'fera_redactor']) AS r
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) \gexec

ALTER ROLE fera_owner    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE fera_app      LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT
  CONNECTION LIMIT 40 PASSWORD :'app_password';
ALTER ROLE fera_redactor LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT
  CONNECTION LIMIT 5 PASSWORD :'redactor_password';
ALTER ROLE fera_app      SET search_path = public;
ALTER ROLE fera_redactor SET search_path = public;

-- Ownership: the schema was applied by the superuser; hand every non-extension object
-- to fera_owner so no login role (and not the runtime) owns tables or functions.
SELECT format('ALTER TABLE public.%I OWNER TO fera_owner', c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e') \gexec
SELECT format('ALTER FUNCTION %s OWNER TO fera_owner', p.oid::regprocedure)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') \gexec
SELECT format('ALTER TYPE public.%I OWNER TO fera_owner', t.typname)
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype = 'e'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e') \gexec

-- Database and schema: nobody connects, creates or uses temp tables by default.
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO fera_app, fera_redactor', current_database()) \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO fera_app, fera_redactor;

-- Start from nothing on every table, sequence and service function.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, fera_app, fera_redactor;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, fera_app, fera_redactor;
REVOKE ALL ON FUNCTION redact_case(uuid, uuid), reserve_ai_call(uuid, numeric), settle_ai_call(uuid, numeric)
  FROM PUBLIC, fera_app, fera_redactor;

-- fera_app ------------------------------------------------------------------
-- Reference data is loaded by the owner.
GRANT SELECT ON districts, district_neighbours TO fera_app;

-- Accounts: sign-in reads the hash; admin tools create users, verify [MOCK] and deactivate.
-- username and role are not updatable.
GRANT SELECT, INSERT ON users TO fera_app;
GRANT UPDATE (display_name, password_hash, verified, is_active, district_code) ON users TO fera_app;

GRANT SELECT, INSERT ON parent_sessions TO fera_app;
GRANT UPDATE (last_seen_at, revoked_at) ON parent_sessions TO fera_app;

-- Draft metadata; DELETE is the D2A section 8 expired-metadata cleanup.
-- ai_calls_used/revision are written by reserve_ai_call (SECURITY INVOKER).
GRANT SELECT, INSERT, DELETE ON intake_drafts TO fera_app;
GRANT UPDATE (payload_hash, revision, ai_calls_used) ON intake_drafts TO fera_app;

-- Cases: anonymised_at is neither insertable nor updatable, so redaction only happens
-- through fera_redactor. Identity, ownership and idempotency keys are not updatable
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

-- Spend: reserve_ai_call/settle_ai_call run as the caller, so the caller needs these
-- columns; cap_usd stays an owner/team decision (USD 25 default, at most 30).
GRANT SELECT ON ai_budget TO fera_app;
GRANT UPDATE (reserved_usd, committed_usd) ON ai_budget TO fera_app;
GRANT SELECT, INSERT ON ai_reservations TO fera_app;
GRANT UPDATE (state, actual_usd, settled_at) ON ai_reservations TO fera_app;
GRANT SELECT, INSERT ON ai_calls TO fera_app;
GRANT EXECUTE ON FUNCTION reserve_ai_call(uuid, numeric), settle_ai_call(uuid, numeric) TO fera_app;

GRANT SELECT, INSERT, DELETE ON rate_limits TO fera_app;
GRANT UPDATE (count) ON rate_limits TO fera_app;

-- fera_redactor -------------------------------------------------------------
-- redact_case() and the triggers it fires run as the caller, so this role holds exactly
-- the reads they perform (whole-row reads in check_pair_integrity/check_duplicate_integrity)
-- and the column updates redact_case() writes. No password hashes, no inserts other than
-- its audit event.
GRANT EXECUTE ON FUNCTION redact_case(uuid, uuid) TO fera_redactor;
GRANT SELECT (id, role, verified, is_active) ON users TO fera_redactor;
GRANT SELECT ON cases, match_candidates, review_decisions, referrals TO fera_redactor;
GRANT UPDATE (child_name, child_name_latin, age_years, age_min, age_max, height_cm, clothing, marks,
  circumstances, contact_phone, raw_text, place_text, thana, reporter_relation, gd_number,
  source_url, outcome_note, reporter_session_id, created_by_user_id, input_hash,
  submission_payload_hash, client_submission_id, embedding, embedding_model,
  embedding_revision, embedding_space, provenance, anonymised_at) ON cases TO fera_redactor;
GRANT SELECT (case_id), UPDATE (snapshot) ON case_versions TO fera_redactor;
GRANT SELECT (case_id), DELETE ON generated_outputs TO fera_redactor;
GRANT UPDATE (reason_bn, reason_en, components) ON match_candidates TO fera_redactor;
GRANT UPDATE (reason) ON review_decisions TO fera_redactor;
GRANT UPDATE (note) ON referrals TO fera_redactor;
GRANT SELECT (case_a, case_b), UPDATE (reason) ON duplicate_links TO fera_redactor;
GRANT SELECT (candidate_id, actor_type, actor_user_id, action) ON audit_log TO fera_redactor;
GRANT INSERT (actor_type, actor_user_id, action, case_id, details) ON audit_log TO fera_redactor;

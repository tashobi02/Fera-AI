// TASK-062 / T006: the unchanged db/schema_v2.sql plus db/roles.sql on PostgreSQL 16,
// exercised as the restricted runtime role (BR-010/012/013/020/026; TC-016/029/032/046/051/053/062).
// Synthetic data only. Runs under `npm run test:db`; skipped in plain `npm test`.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addCandidate, closeMissing, closedPair, confirmPair, connect, createActors, dbTestsEnabled, expectPgError,
  fakePhone, insertFound, insertMissing, one, openMissing, PRIVILEGE_MATRIX_SQL, seedReference, tx, type Actors,
} from "./support/db";

// Golden: widening or narrowing any grant in db/roles.sql must update this list.
const EXPECTED_PRIVILEGES = [
  "fera_app ai_budget SELECT",
  "fera_app ai_calls INSERT,SELECT",
  "fera_app ai_reservations SELECT",
  "fera_app audit_log INSERT(action,actor_session_id,actor_type,actor_user_id,candidate_id,case_id,details,request_id)",
  "fera_app audit_log SELECT",
  "fera_app case_versions INSERT,SELECT",
  "fera_app cases INSERT(age_max,age_min,age_years,child_name,child_name_latin,circumstances,client_submission_id,clothing,contact_phone,created_by_user_id,district_code,embedding,embedding_model,embedding_revision,embedding_space,event_at,event_at_approx,event_at_lower,event_at_upper,gd_number,height_cm,id,input_hash,is_synthetic,kind,marks,match_error_id,matched_at,matching_state,place_text,provenance,raw_text,ref_code,reporter_relation,reporter_session_id,sex,source,source_url,status,submission_payload_hash,thana,version)",
  "fera_app cases SELECT",
  "fera_app cases UPDATE(age_max,age_min,age_years,child_name,child_name_latin,circumstances,closed_at,clothing,contact_phone,district_code,embedding,embedding_model,embedding_revision,embedding_space,event_at,event_at_approx,event_at_lower,event_at_upper,gd_number,height_cm,input_hash,marks,match_error_id,matched_at,matching_state,outcome,outcome_note,place_text,provenance,raw_text,reporter_relation,sex,status,thana,version)",
  "fera_app district_neighbours SELECT",
  "fera_app districts SELECT",
  "fera_app duplicate_links INSERT,SELECT",
  "fera_app duplicate_links UPDATE(reason,resolved_at,resolved_by,status)",
  "fera_app generated_outputs INSERT,SELECT",
  "fera_app intake_drafts DELETE,INSERT,SELECT",
  "fera_app intake_drafts UPDATE(payload_hash)",
  "fera_app match_candidates INSERT,SELECT",
  "fera_app match_candidates UPDATE(decided_at,status)",
  "fera_app parent_sessions INSERT,SELECT",
  "fera_app parent_sessions UPDATE(last_seen_at,revoked_at)",
  "fera_app rate_limits DELETE,INSERT,SELECT",
  "fera_app rate_limits UPDATE(count)",
  "fera_app referrals INSERT,SELECT",
  "fera_app review_decisions INSERT,SELECT",
  "fera_app users SELECT",
  "fera_app users UPDATE(verified)",
  "fera_redactor cases SELECT(anonymised_at,id,kind,status)",
  "fera_redactor match_candidates SELECT(found_case_id,missing_case_id,status)",
];

const RUNTIME_ROLES = ["fera_app", "fera_redactor"] as const;

describe.skipIf(!dbTestsEnabled)("PostgreSQL 16 platform invariants (TASK-062)", () => {
  let admin: Client;
  let app: Client;
  let redactor: Client;
  let actors: Actors;

  beforeAll(async () => {
    admin = await connect("admin");
    app = await connect("app");
    redactor = await connect("redactor");
    await seedReference(admin);
    actors = await createActors(admin);
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), app?.end(), redactor?.end()]);
  });

  describe("restricted roles (TC-051, TC-062)", () => {
    it("connects the app as fera_app on PostgreSQL 16, not as the schema owner", async () => {
      const row = await one<{ who: string; version: string }>(app, "SELECT current_user AS who, current_setting('server_version') AS version");
      expect(row.who).toBe("fera_app");
      expect(row.version).toMatch(/^16\./);
    });

    it("gives every fera role no superuser, createdb, createrole, replication or RLS bypass", async () => {
      const { rows } = await admin.query(
        `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolcanlogin
         FROM pg_roles WHERE rolname IN ('fera_owner', 'fera_app', 'fera_redactor') ORDER BY rolname`,
      );
      expect(rows.map((r) => [r.rolname, r.rolcanlogin])).toEqual([["fera_app", true], ["fera_owner", false], ["fera_redactor", true]]);
      for (const r of rows) {
        expect([r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls]).toEqual([false, false, false, false, false]);
      }
      const member = await one<{ n: number }>(
        admin,
        "SELECT count(*)::int AS n FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname IN ('fera_app', 'fera_redactor')",
      );
      expect(member.n).toBe(0);
      const config = await admin.query(
        "SELECT rolname, rolconfig FROM pg_roles WHERE rolname IN ('fera_owner', 'fera_app', 'fera_redactor') ORDER BY rolname",
      );
      expect(Object.fromEntries(config.rows.map((r) => [r.rolname, r.rolconfig]))).toEqual({
        fera_app: ["search_path=public", "statement_timeout=30s", "lock_timeout=5s", "idle_in_transaction_session_timeout=60s"],
        fera_owner: null,
        fera_redactor: ["search_path=public", "statement_timeout=60s", "lock_timeout=5s", "idle_in_transaction_session_timeout=60s"],
      });
    });

    it("has fera_owner own every schema table and function, never a login role", async () => {
      const owners = await admin.query(
        `SELECT DISTINCT pg_get_userbyid(c.relowner) AS owner FROM pg_class c
         WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'S', 'i')
         UNION SELECT DISTINCT pg_get_userbyid(p.proowner) FROM pg_proc p
         WHERE p.pronamespace = 'public'::regnamespace
           AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')`,
      );
      expect(owners.rows.map((r) => r.owner)).toEqual(["fera_owner"]);
    });

    it("grants no TRUNCATE, TRIGGER or REFERENCES on any table, and no audit UPDATE/DELETE", async () => {
      const { rows } = await admin.query(
        `SELECT r.role, c.relname, p.priv FROM pg_class c
         CROSS JOIN unnest($1::text[]) AS r(role)
         CROSS JOIN unnest(ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES']) AS p(priv)
         WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND has_table_privilege(r.role, c.oid, p.priv)
         UNION ALL
         SELECT r.role, 'audit_log', p.priv FROM unnest($1::text[]) AS r(role)
         CROSS JOIN unnest(ARRAY['UPDATE', 'DELETE']) AS p(priv)
         WHERE has_table_privilege(r.role, 'audit_log', p.priv)
            OR has_any_column_privilege(r.role, 'audit_log', 'UPDATE')`,
        [RUNTIME_ROLES],
      );
      expect(rows).toEqual([]);
    });

    it("limits EXECUTE on the service functions to their intended role", async () => {
      const { rows } = await admin.query(
        `SELECT f.fn, r.role, has_function_privilege(r.role, f.fn, 'EXECUTE') AS can
         FROM unnest(ARRAY['redact_case(uuid,uuid)', 'reserve_ai_call(uuid,numeric)', 'settle_ai_call(uuid,numeric)', 'sweep_expired_metadata()']) AS f(fn)
         CROSS JOIN unnest($1::text[]) AS r(role) ORDER BY 1, 2`,
        [RUNTIME_ROLES],
      );
      expect(rows.map((r) => `${r.fn}:${r.role}:${r.can}`)).toEqual([
        "redact_case(uuid,uuid):fera_app:false",
        "redact_case(uuid,uuid):fera_redactor:true",
        "reserve_ai_call(uuid,numeric):fera_app:true",
        "reserve_ai_call(uuid,numeric):fera_redactor:false",
        "settle_ai_call(uuid,numeric):fera_app:true",
        "settle_ai_call(uuid,numeric):fera_redactor:false",
        "sweep_expired_metadata():fera_app:true",
        "sweep_expired_metadata():fera_redactor:false",
      ]);
      const publicAcl = await admin.query(
        `SELECT p.proname FROM pg_proc p, aclexplode(p.proacl) a
         WHERE p.proname IN ('redact_case', 'reserve_ai_call', 'settle_ai_call') AND a.grantee = 0`,
      );
      expect(publicAcl.rows).toEqual([]);
      const dbAcl = await one<{ can: boolean }>(admin, "SELECT has_database_privilege('public', current_database(), 'CONNECT') AS can");
      expect(dbAcl.can).toBe(false);
    });

    it.each([
      ["CREATE TABLE public.x (id int)", /permission denied for schema public/],
      ["CREATE TEMP TABLE x (id int)", /permission denied to create temporary tables/],
      ["CREATE FUNCTION public.f() RETURNS int LANGUAGE sql AS 'SELECT 1'", /permission denied for schema public/],
      ["ALTER TABLE cases ADD COLUMN x int", /must be owner of table cases/],
      ["ALTER TABLE audit_log DISABLE TRIGGER ALL", /must be owner of table audit_log/],
      ["ALTER TABLE cases DISABLE TRIGGER cases_transition_guard", /must be owner of table cases/],
      ["DROP TABLE audit_log", /must be owner of table audit_log/],
      ["DROP TRIGGER audit_log_no_update_delete ON audit_log", /must be owner of relation audit_log/],
      ["SET session_replication_role = replica", /permission denied to set parameter/],
      ["SET ROLE fera_owner", /permission denied to set role/],
      ["CREATE SCHEMA x", /permission denied for database/],
    ])("refuses DDL or guard bypass for fera_app: %s", async (sql, message) => {
      await expectPgError(app.query(sql), "42501", message);
      await expectPgError(redactor.query(sql), "42501", message);
    });

    it("keeps the app away from redaction: no redact_case and no direct anonymised_at write", async () => {
      const missing = await insertMissing(app);
      await expectPgError(app.query("SELECT redact_case($1, $2)", [missing.id, actors.admin]), "42501", /permission denied for function redact_case/);
      await expectPgError(app.query("UPDATE cases SET anonymised_at = now() WHERE id = $1", [missing.id]), "42501");
    });

    it("rejects a direct owner write of anonymised_at outside redact_case", async () => {
      const missing = await insertMissing(app);
      await openMissing(app, missing.id);
      await expectPgError(
        admin.query("UPDATE cases SET anonymised_at = now() WHERE id = $1", [missing.id]),
        "42501",
        /only be set by redact_case/,
      );
    });

    it("matches the golden privilege matrix for every role, table and column", async () => {
      const { rows } = await admin.query<{ line: string }>(PRIVILEGE_MATRIX_SQL);
      expect(rows.map((r) => r.line)).toEqual(EXPECTED_PRIVILEGES);
    });

    it("runs the four service functions as fera_owner with a pinned search_path (OD-062-2)", async () => {
      const { rows } = await admin.query(
        `SELECT proname, prosecdef, pg_get_userbyid(proowner) AS owner, proconfig FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace AND proname IN ('redact_case', 'reserve_ai_call', 'settle_ai_call', 'sweep_expired_metadata') ORDER BY 1`,
      );
      for (const r of rows) {
        expect(r).toMatchObject({ prosecdef: true, owner: "fera_owner", proconfig: ["search_path=pg_catalog, public, pg_temp"] });
      }
      expect(rows).toHaveLength(4);
      const defaults = await one<{ n: number }>(
        admin,
        `SELECT count(*)::int AS n FROM pg_default_acl d WHERE d.defaclrole = 'fera_owner'::regrole AND d.defaclobjtype = 'f'
           AND NOT EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 0)`,
      );
      expect(defaults.n).toBe(1);
    });

    it("keeps the redactor narrow: no password hashes, no payload reads, no writes, no spend functions", async () => {
      await expectPgError(redactor.query("SELECT password_hash FROM users LIMIT 1"), "42501");
      await expectPgError(redactor.query("SELECT id FROM users LIMIT 1"), "42501");
      await expectPgError(redactor.query("SELECT child_name FROM cases LIMIT 1"), "42501");
      await expectPgError(redactor.query("INSERT INTO parent_sessions DEFAULT VALUES"), "42501");
      await expectPgError(redactor.query("UPDATE cases SET gd_number = NULL WHERE false"), "42501");
      await expectPgError(redactor.query("UPDATE cases SET anonymised_at = now() WHERE false"), "42501");
      await expectPgError(redactor.query("INSERT INTO audit_log (actor_type, action) VALUES ('admin', 'case.payload_redacted')"), "42501");
      await expectPgError(redactor.query("SELECT reserve_ai_call(NULL, 0.01)"), "42501");
    });

    it("keeps the app away from accounts it does not manage: no user inserts, no role or activity changes", async () => {
      await expectPgError(app.query("INSERT INTO users (username, display_name, password_hash, role) VALUES ('x.y.z', '[MOCK] X', 'h', 'admin')"), "42501");
      await expectPgError(app.query("UPDATE users SET role = 'admin' WHERE false"), "42501");
      await expectPgError(app.query("UPDATE users SET is_active = true WHERE false"), "42501");
      await app.query("UPDATE users SET verified = true WHERE id = $1", [actors.officer]);
    });

    it("rejects a non-synthetic case row (BR-026, cases_synthetic_release_only)", async () => {
      await expectPgError(
        app.query("UPDATE cases SET is_synthetic = false WHERE false"),
        "42501",
      );
      const session = await one<{ id: string }>(app, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id");
      await expectPgError(
        app.query(
          `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, reporter_session_id, client_submission_id,
             submission_payload_hash, age_min, age_max, event_at, event_at_lower, event_at_upper, place_text,
             district_code, contact_phone)
           VALUES ('M-NONSYN', 'missing', 'submitted', 'parent', false, $1, gen_random_uuid(), repeat('a', 64),
             5, 5, now() - interval '1 day', now() - interval '1 day', now() - interval '1 day', '[MOCK] place', 1, $2)`,
          [session.id, fakePhone()],
        ),
        "23514",
        /cases_synthetic_release_only/,
      );
    });

    it("reserves and settles paid-call budget through the invoker functions as fera_app", async () => {
      const session = await one<{ id: string }>(app, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id");
      const draft = await one<{ id: string }>(app, "INSERT INTO intake_drafts (session_id, kind) VALUES ($1, 'missing') RETURNING id", [session.id]);
      const res = await one<{ id: string }>(app, "SELECT reserve_ai_call($1, 0.010000) AS id", [draft.id]);
      await app.query("SELECT settle_ai_call($1, 0.004000)", [res.id]);
      const row = await one<{ state: string; used: number }>(
        app,
        "SELECT r.state, d.ai_calls_used AS used FROM ai_reservations r JOIN intake_drafts d ON d.id = r.draft_id WHERE r.id = $1",
        [res.id],
      );
      expect(row).toEqual({ state: "settled", used: 1 });
      await expectPgError(app.query("UPDATE ai_budget SET cap_usd = 30"), "42501");
      await expectPgError(app.query("UPDATE ai_budget SET reserved_usd = 0, committed_usd = 0"), "42501");
      await expectPgError(app.query("UPDATE ai_reservations SET state = 'settled' WHERE false"), "42501");
      await expectPgError(app.query("INSERT INTO ai_reservations (reserved_usd) VALUES (0)"), "42501");
      await expectPgError(app.query("UPDATE intake_drafts SET ai_calls_used = 0, revision = 1 WHERE id = $1", [draft.id]), "42501");
    });
  });

  describe("append-only audit (TC-016, TC-051, BR-010)", () => {
    it("lets fera_app append with the database clock and no backdating", async () => {
      const row = await one<{ id: string; recent: boolean }>(
        app,
        `INSERT INTO audit_log (actor_type, action, details) VALUES ('system', 'access.denied', '{"api":"API-004"}')
         RETURNING id, at > now() - interval '1 minute' AS recent`,
      );
      expect(row.recent).toBe(true);
      await expectPgError(app.query("INSERT INTO audit_log (at, actor_type, action) VALUES (now() - interval '1 year', 'system', 'case.closed')"), "42501");
    });

    it("rejects an unknown audit action and enforces the synthetic-only marker", async () => {
      await expectPgError(
        app.query("INSERT INTO audit_log (actor_type, action) VALUES ('system', 'match.ConfirM')"),
        "22P02",
        /invalid input value for enum audit_action_t/,
      );
      await expectPgError(
        admin.query("INSERT INTO audit_log (actor_type, action, is_synthetic) VALUES ('system', 'access.denied', false)"),
        "23514",
        /audit_log_is_synthetic_true_check/,
      );
    });

    it("exposes the audit operator indexes without partitioning the append-only log", async () => {
      const { rows } = await admin.query<{ indexname: string }>(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'audit_log' ORDER BY indexname",
      );
      expect(rows.map((r) => r.indexname)).toEqual([
        "audit_log_action_at_idx",
        "audit_log_actor_user_at_idx",
        "audit_log_at_idx",
        "audit_log_case_idx",
        "audit_log_pkey",
        "audit_log_request_id_idx",
      ]);
    });

    it("records an unknown-resource denial with a null case FK (TC-052 at DB level)", async () => {
      const row = await one<{ case_id: string | null }>(
        app,
        `INSERT INTO audit_log (actor_type, actor_user_id, action, case_id, details)
         VALUES ('officer', $1, 'access.denied', NULL, '{"api":"API-004","error_id":"E-004"}') RETURNING case_id`,
        [actors.officer],
      );
      expect(row.case_id).toBeNull();
    });

    it("refuses UPDATE, DELETE and TRUNCATE to the runtime role by privilege", async () => {
      await expectPgError(app.query("UPDATE audit_log SET action = 'case.closed'"), "42501", /permission denied for table audit_log/);
      await expectPgError(app.query("DELETE FROM audit_log"), "42501", /permission denied for table audit_log/);
      await expectPgError(app.query("TRUNCATE audit_log"), "42501", /permission denied for table audit_log/);
      await expectPgError(redactor.query("DELETE FROM audit_log"), "42501", /permission denied for table audit_log/);
    });

    it("refuses them even to the superuser by trigger", async () => {
      await app.query("INSERT INTO audit_log (actor_type, action) VALUES ('system', 'case.closed')");
      await expectPgError(admin.query("UPDATE audit_log SET action = 'case.edited'"), "42501", /append-only/);
      await expectPgError(admin.query("DELETE FROM audit_log"), "42501", /append-only/);
      await expectPgError(admin.query("TRUNCATE audit_log"), "42501", /append-only/);
    });
  });

  describe("lifecycle guard (TC-032, BR-012/013)", () => {
    it("accepts only submitted for new missing and open for new found reports", async () => {
      await expectPgError(insertMissing(app, { status: "open" }), "23514", /invalid initial case status/);
      const found = await insertFound(app, actors.staff);
      expect((await one<{ status: string }>(app, "SELECT status FROM cases WHERE id = $1", [found.id])).status).toBe("open");
    });

    it("walks missing submitted → open → matched_pending_review → confirmed → closed and found open → matched_pending_review → referred", async () => {
      const { missing, found } = await closedPair(app, actors);
      const { rows } = await app.query("SELECT kind, status, outcome, closed_at IS NOT NULL AS has_closed_at FROM cases WHERE id = ANY($1) ORDER BY kind", [[missing.id, found.id]]);
      expect(rows).toEqual([
        { kind: "missing", status: "closed", outcome: "coordination_recorded", has_closed_at: true },
        { kind: "found", status: "referred", outcome: null, has_closed_at: true },
      ]);
    });

    it("rejects open → confirmed and submitted → matched_pending_review (TC-032)", async () => {
      const missing = await insertMissing(app);
      await expectPgError(app.query("UPDATE cases SET status = 'matched_pending_review' WHERE id = $1", [missing.id]), "23514", /illegal transition submitted>matched_pending_review/);
      await openMissing(app, missing.id);
      await expectPgError(app.query("UPDATE cases SET status = 'confirmed' WHERE id = $1", [missing.id]), "23514", /illegal transition open>confirmed/);
    });

    it("rejects found → closed and found open → referred (TC-032)", async () => {
      const found = await insertFound(app, actors.staff);
      await expectPgError(app.query("UPDATE cases SET status = 'closed', outcome = 'resolved_outside_fera', closed_at = now() WHERE id = $1", [found.id]), "23514");
      await expectPgError(app.query("UPDATE cases SET status = 'referred', closed_at = now() WHERE id = $1", [found.id]), "23514", /illegal transition open>referred/);
    });

    it("rejects leaving a terminal state", async () => {
      const { missing, found } = await closedPair(app, actors);
      await expectPgError(app.query("UPDATE cases SET status = 'open', closed_at = NULL, outcome = NULL WHERE id = $1", [missing.id]), "23514");
      await expectPgError(app.query("UPDATE cases SET status = 'open', closed_at = NULL WHERE id = $1", [found.id]), "23514");
    });

    it("requires a pending candidate for matched_pending_review and allows the return to open", async () => {
      const missing = await insertMissing(app);
      await openMissing(app, missing.id);
      await expectPgError(app.query("UPDATE cases SET status = 'matched_pending_review' WHERE id = $1", [missing.id]), "23514", /pending-review case requires a pending candidate/);
      const found = await insertFound(app, actors.staff);
      const candidate = await addCandidate(app, missing.id, found.id);
      await tx(app, async () => {
        await app.query("UPDATE match_candidates SET status = 'voided', decided_at = now() WHERE id = $1", [candidate]);
        await app.query("UPDATE cases SET status = 'open' WHERE id = ANY($1)", [[missing.id, found.id]]);
      });
      const { rows } = await app.query("SELECT status FROM cases WHERE id = ANY($1)", [[missing.id, found.id]]);
      expect(rows.map((r) => r.status)).toEqual(["open", "open"]);
    });

    it("requires an outcome and closed_at for closed, and closed_at only on terminal rows", async () => {
      const missing = await insertMissing(app);
      await openMissing(app, missing.id);
      await expectPgError(app.query("UPDATE cases SET status = 'closed', closed_at = now() WHERE id = $1", [missing.id]), "23514");
      await expectPgError(app.query("UPDATE cases SET status = 'closed', outcome = 'resolved_outside_fera' WHERE id = $1", [missing.id]), "23514");
      await expectPgError(app.query("UPDATE cases SET closed_at = now() WHERE id = $1", [missing.id]), "23514");
      await expectPgError(app.query("UPDATE cases SET outcome = 'resolved_outside_fera' WHERE id = $1", [missing.id]).then(() => closeMissing(app, missing.id, "coordination_recorded")), "23514", /coordination closure requires confirmed pair/);
      await app.query("UPDATE cases SET outcome = NULL WHERE id = $1", [missing.id]);
      await closeMissing(app, missing.id, "resolved_outside_fera");
      expect((await one<{ status: string }>(app, "SELECT status FROM cases WHERE id = $1", [missing.id])).status).toBe("closed");
    });

    it("locks report fields from confirmation and the outcome from closure (BR-025 edit lock)", async () => {
      const missing = await insertMissing(app);
      await openMissing(app, missing.id);
      const found = await insertFound(app, actors.staff);
      const candidateId = await addCandidate(app, missing.id, found.id);
      await confirmPair(app, { candidateId, missingId: missing.id, foundId: found.id, officerId: actors.officer });
      await expectPgError(app.query("UPDATE cases SET child_name = 'Edited Synthetic' WHERE id = $1", [missing.id]), "23514", /terminal report fields are locked/);
      await closeMissing(app, missing.id);
      await expectPgError(app.query("UPDATE cases SET outcome_note = '[MOCK] rewritten' WHERE id = $1", [missing.id]), "23514", /terminal outcome is locked/);
      await expectPgError(app.query("UPDATE cases SET clothing = '[MOCK] edited' WHERE id = $1", [found.id]), "23514", /terminal report fields are locked/);
    });

    it("refuses a version edit that leaves a stale pending candidate, and accepts it when the candidate is voided", async () => {
      const missing = await insertMissing(app);
      await openMissing(app, missing.id);
      const found = await insertFound(app, actors.staff);
      const candidate = await addCandidate(app, missing.id, found.id);
      await expectPgError(app.query("UPDATE cases SET clothing = '[MOCK] edited', version = version + 1 WHERE id = $1", [missing.id]), "23514", /stale pending candidate/);
      await tx(app, async () => {
        await app.query("INSERT INTO case_versions (case_id, version, snapshot, edited_by) VALUES ($1, 1, '{\"clothing\":\"[MOCK] before\"}', 'parent')", [missing.id]);
        await app.query("UPDATE cases SET clothing = '[MOCK] edited', version = version + 1 WHERE id = $1", [missing.id]);
        await app.query("UPDATE match_candidates SET status = 'voided', decided_at = now() WHERE id = $1", [candidate]);
        await app.query("UPDATE cases SET status = 'open' WHERE id = ANY($1)", [[missing.id, found.id]]);
      });
      expect((await one<{ version: number }>(app, "SELECT version FROM cases WHERE id = $1", [missing.id])).version).toBe(2);
    });

    it("leaves the version bump to the app: an unversioned edit of an open report is accepted (TASK-015 obligation)", async () => {
      const missing = await insertMissing(app);
      await app.query("UPDATE cases SET clothing = '[MOCK] unversioned' WHERE id = $1", [missing.id]);
      expect((await one<{ version: number }>(app, "SELECT version FROM cases WHERE id = $1", [missing.id])).version).toBe(1);
    });

    it("refuses a future event interval", async () => {
      const missing = await insertMissing(app);
      await expectPgError(
        app.query("UPDATE cases SET event_at = NULL, event_at_approx = true, event_at_lower = now() + interval '1 day', event_at_upper = now() + interval '2 days' WHERE id = $1", [missing.id]),
        "23514",
      );
    });
  });

  describe("candidates, decisions and pairs (TC-029, TC-046, TC-053, BR-020)", () => {
    it("confirms one of two pending candidates, voids the competitor, reopens the other report, and blocks a second confirm (TC-029/053)", async () => {
      const m1 = await insertMissing(app);
      const m2 = await insertMissing(app);
      await openMissing(app, m1.id);
      await openMissing(app, m2.id);
      const found = await insertFound(app, actors.staff);
      const c1 = await addCandidate(app, m1.id, found.id, 1);
      const c2 = await addCandidate(app, m2.id, found.id, 2);

      await expectPgError(
        confirmPair(app, { candidateId: c1, missingId: m1.id, foundId: found.id, officerId: actors.officer }),
        "23514",
        /stale pending candidate/,
      );
      await confirmPair(app, { candidateId: c1, missingId: m1.id, foundId: found.id, officerId: actors.officer, voidCandidates: [c2], reopenCases: [m2.id] });

      const { rows } = await app.query("SELECT id, status FROM match_candidates WHERE id = ANY($1)", [[c1, c2]]);
      expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({ [c1]: "confirmed", [c2]: "voided" });
      expect((await one<{ status: string }>(app, "SELECT status FROM cases WHERE id = $1", [m2.id])).status).toBe("open");
      await expectPgError(
        app.query("UPDATE match_candidates SET status = 'confirmed', decided_at = now() WHERE id = $1", [c2]),
        "23505",
        /match_candidates_one_confirmed_found/,
      );
    });

    it("records a gap: voiding the last competitor does not force its other report back to open (TC-053 is app-enforced)", async () => {
      const m1 = await insertMissing(app);
      const m2 = await insertMissing(app);
      await openMissing(app, m1.id);
      await openMissing(app, m2.id);
      const found = await insertFound(app, actors.staff);
      const c1 = await addCandidate(app, m1.id, found.id, 1);
      const c2 = await addCandidate(app, m2.id, found.id, 2);
      await confirmPair(app, { candidateId: c1, missingId: m1.id, foundId: found.id, officerId: actors.officer, voidCandidates: [c2] });
      const left = await one<{ status: string; pending: number }>(
        app,
        "SELECT c.status, (SELECT count(*)::int FROM match_candidates WHERE missing_case_id = c.id AND status = 'pending') AS pending FROM cases c WHERE c.id = $1",
        [m2.id],
      );
      expect(left).toEqual({ status: "matched_pending_review", pending: 0 });
    });

    it("rejects a candidate on a stale version (TC-046 at DB level)", async () => {
      const missing = await insertMissing(app);
      await openMissing(app, missing.id);
      const found = await insertFound(app, actors.staff);
      await expectPgError(
        app.query(
          `INSERT INTO match_candidates (missing_case_id, found_case_id, missing_version, found_version, score, rank, reason_bn, reason_en, components)
           VALUES ($1, $2, 2, 1, 50, 1, '[MOCK]', '[MOCK]', '{}')`,
          [missing.id, found.id],
        ),
        "23514",
        /eligible current versions/,
      );
    });

    it("rejects terminal candidate rows without decided_at and keeps confirmed indexes NULLS NOT DISTINCT", async () => {
      const missing = await insertMissing(app);
      await openMissing(app, missing.id);
      const found = await insertFound(app, actors.staff);
      const candidate = await addCandidate(app, missing.id, found.id);
      await expectPgError(
        app.query("UPDATE match_candidates SET status = 'voided', decided_at = NULL WHERE id = $1", [candidate]),
        "23514",
      );
      const { rows } = await admin.query<{ indexname: string; indnullsnotdistinct: boolean }>(
        `SELECT ci.relname AS indexname, i.indnullsnotdistinct
           FROM pg_index i JOIN pg_class ci ON ci.oid = i.indexrelid
          WHERE ci.relname IN ('match_candidates_one_confirmed_missing', 'match_candidates_one_confirmed_found')
          ORDER BY ci.relname`,
      );
      expect(rows).toEqual([
        { indexname: "match_candidates_one_confirmed_found", indnullsnotdistinct: true },
        { indexname: "match_candidates_one_confirmed_missing", indnullsnotdistinct: true },
      ]);
    });

    it("rejects swapped endpoint kinds", async () => {
      const found = await insertFound(app, actors.staff);
      const other = await insertFound(app, actors.staff);
      await expectPgError(
        app.query(
          `INSERT INTO match_candidates (missing_case_id, found_case_id, missing_version, found_version, score, rank, reason_bn, reason_en, components)
           VALUES ($1, $2, 1, 1, 50, 1, '[MOCK]', '[MOCK]', '{}')`,
          [found.id, other.id],
        ),
        "23514",
        /endpoint kinds are invalid/,
      );
    });

    it("requires the decision audit event, the simulated referral and a verified active officer", async () => {
      const setup = async () => {
        const missing = await insertMissing(app);
        await openMissing(app, missing.id);
        const found = await insertFound(app, actors.staff);
        return { missing, found, candidateId: await addCandidate(app, missing.id, found.id) };
      };
      const a = await setup();
      await expectPgError(
        confirmPair(app, { candidateId: a.candidateId, missingId: a.missing.id, foundId: a.found.id, officerId: actors.officer, withAudit: false }),
        "23514",
        /officer audit event/,
      );
      await expectPgError(
        confirmPair(app, { candidateId: a.candidateId, missingId: a.missing.id, foundId: a.found.id, officerId: actors.officer, withReferral: false }),
        "23514",
        /referral record/,
      );
      await expectPgError(
        confirmPair(app, { candidateId: a.candidateId, missingId: a.missing.id, foundId: a.found.id, officerId: actors.unverifiedOfficer }),
        "42501",
        /active verified officer/,
      );
      const left = await app.query("SELECT 1 FROM review_decisions WHERE candidate_id = $1 UNION ALL SELECT 1 FROM referrals WHERE candidate_id = $1", [a.candidateId]);
      expect(left.rowCount).toBe(0);
    });

    it("requires a 3–500 character reason and the match.reject audit for a rejection", async () => {
      const missing = await insertMissing(app);
      await openMissing(app, missing.id);
      const found = await insertFound(app, actors.staff);
      const c = await addCandidate(app, missing.id, found.id);
      const reject = (reason: string | null, audit: boolean) =>
        tx(app, async () => {
          await app.query("UPDATE match_candidates SET status = 'rejected', decided_at = now() WHERE id = $1", [c]);
          await app.query("INSERT INTO review_decisions (candidate_id, officer_id, decision, reason) VALUES ($1, $2, 'reject', $3)", [c, actors.officer, reason]);
          if (audit) {
            await app.query("INSERT INTO audit_log (actor_type, actor_user_id, action, case_id, candidate_id) VALUES ('officer', $1, 'match.reject', $2, $3)", [actors.officer, missing.id, c]);
          }
          await app.query("UPDATE cases SET status = 'open' WHERE id = ANY($1)", [[missing.id, found.id]]);
        });
      await expectPgError(reject(null, true), "23514");
      await expectPgError(reject("[MOCK] different clothing", false), "23514", /officer audit event/);
      await reject("[MOCK] different clothing", true);
    });

    it("keeps confirmed pair, decision and referral history immutable", async () => {
      const { candidateId } = await closedPair(app, actors);
      await expectPgError(app.query("UPDATE match_candidates SET status = 'voided' WHERE id = $1", [candidateId]), "23514", /confirmed pair history is locked/);
      await expectPgError(app.query("UPDATE review_decisions SET reason = 'x' WHERE candidate_id = $1", [candidateId]), "42501");
      await expectPgError(app.query("DELETE FROM match_candidates WHERE id = $1", [candidateId]), "42501");
      await expectPgError(admin.query("UPDATE review_decisions SET reason = '[MOCK] rewritten' WHERE candidate_id = $1", [candidateId]), "42501", /decision history is immutable/);
      await expectPgError(admin.query("DELETE FROM referrals WHERE candidate_id = $1", [candidateId]), "42501", /referral history is immutable/);
    });
  });

  describe("duplicate links", () => {
    async function pairOfMissing(): Promise<[string, string]> {
      const a = await insertMissing(app);
      const b = await insertMissing(app);
      return a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    }

    it("requires case_a < case_b and the same kind", async () => {
      const [lo, hi] = await pairOfMissing();
      await expectPgError(app.query("INSERT INTO duplicate_links (case_a, case_b, score, rule) VALUES ($1, $2, 90, 'profile')", [hi, lo]), "23514");
      const found = await insertFound(app, actors.staff);
      const [x, y] = lo < found.id ? [lo, found.id] : [found.id, lo];
      await expectPgError(app.query("INSERT INTO duplicate_links (case_a, case_b, score, rule) VALUES ($1, $2, 90, 'profile')", [x, y]), "23514", /same kind/);
    });

    it("never confirms a shared-phone link as the same report", async () => {
      const [lo, hi] = await pairOfMissing();
      const link = await one<{ id: string }>(app, "INSERT INTO duplicate_links (case_a, case_b, score, rule) VALUES ($1, $2, 100, 'same_phone') RETURNING id", [lo, hi]);
      await expectPgError(
        app.query("UPDATE duplicate_links SET status = 'confirmed_same', resolved_by = $2, resolved_at = now(), reason = '[MOCK] same family' WHERE id = $1", [link.id, actors.officer]),
        "23514",
      );
      await app.query("UPDATE duplicate_links SET status = 'dismissed', resolved_by = $2, resolved_at = now(), reason = '[MOCK] siblings' WHERE id = $1", [link.id, actors.officer]);
    });

    it("requires a verified active officer to resolve", async () => {
      const [lo, hi] = await pairOfMissing();
      const link = await one<{ id: string }>(app, "INSERT INTO duplicate_links (case_a, case_b, score, rule) VALUES ($1, $2, 91, 'profile') RETURNING id", [lo, hi]);
      await expectPgError(
        app.query("UPDATE duplicate_links SET status = 'dismissed', resolved_by = $2, resolved_at = now(), reason = '[MOCK] different' WHERE id = $1", [link.id, actors.unverifiedOfficer]),
        "42501",
        /verified officer/,
      );
    });
  });
});

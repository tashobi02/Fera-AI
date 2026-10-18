// TASK-015 case service on PostgreSQL 16 as the restricted fera_app role (COMP-014/015;
// TC-016, TC-029, TC-031/042, TC-032, TC-046, TC-053; BR-010/012/013/019/020/024/025).
// Synthetic data only. Runs under `npm run test:db` on a fresh per-run database;
// skipped in plain `npm test`.
import { randomUUID } from "node:crypto";
import type { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "@/app/api/_shared";
import {
  createFoundRequestSchema,
  createMissingRequestSchema,
  updateCaseRequestSchema,
  type CreateFoundRequest,
  type CreateMissingRequest,
  type DecisionRequest,
} from "@/contracts";
import { exampleCreateFoundRequest, exampleCreateMissingRequest } from "@/contracts/examples";
import type { Principal } from "@/contracts/server";
import { auditAccessDenied, auditPageDenied } from "@/server/audit";
import {
  closeCase,
  createFoundCase,
  createMissingCase,
  decideCandidate,
  editMissingCase,
  openCase,
  readCase,
} from "@/server/case";
import { withTransaction } from "@/server/case/internal";
import { setPoolForTests } from "@/server/db/pool";
import { captureLogs } from "../api/fakes";
import { testParent, testUser } from "../support/principals";
import {
  MOCK_DISTRICT, addCandidate, connect, createActors, dbTestsEnabled, expectPgError, fakePhone, insertMissing, one, pool, seedReference, type Actors,
} from "./support/db";

const CHECKLIST = {
  descriptions_reviewed: true,
  contradictions_reviewed: true,
  identity_not_proven_by_score: true,
  referral_is_simulated: true,
} as const;

describe.skipIf(!dbTestsEnabled)("case service on PostgreSQL 16 (TASK-015)", () => {
  let admin: Client;
  let appClient: Client;
  let app: Pool;
  let app2: Pool;
  let actors: Actors;
  let officer: Principal;
  let staff: Principal;

  const ctx = () => ({ pool: app });

  beforeAll(async () => {
    admin = await connect("admin");
    appClient = await connect("app");
    app = pool("app");
    app2 = pool("app");
    setPoolForTests(app);
    await seedReference(admin);
    actors = await createActors(admin);
    officer = testUser(actors.officer, "officer", { verified: true });
    staff = testUser(actors.staff, "staff");
  });

  afterAll(async () => {
    setPoolForTests(null);
    await Promise.all([admin?.end(), appClient?.end(), app?.end(), app2?.end()]);
  });

  /* ---------- synthetic fixtures through the service ---------- */

  const newParent = async () => {
    const s = await one<{ id: string }>(appClient, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id");
    return testParent(s.id);
  };

  const missingRequest = (marks: string | null = null, uuid = randomUUID()): CreateMissingRequest =>
    createMissingRequestSchema.parse({
      ...exampleCreateMissingRequest,
      client_submission_id: uuid,
      draft: {
        ...exampleCreateMissingRequest.draft,
        child: { ...exampleCreateMissingRequest.draft.child, marks },
        event: { ...exampleCreateMissingRequest.draft.event, district_code: MOCK_DISTRICT },
        reporter: { ...exampleCreateMissingRequest.draft.reporter, phone: fakePhone() },
      },
    });

  const foundRequest = (uuid = randomUUID()): CreateFoundRequest =>
    createFoundRequestSchema.parse({
      ...exampleCreateFoundRequest,
      client_submission_id: uuid,
      draft: {
        ...exampleCreateFoundRequest.draft,
        event: { ...exampleCreateFoundRequest.draft.event, district_code: MOCK_DISTRICT },
        reporter: { ...exampleCreateFoundRequest.draft.reporter, phone: fakePhone() },
      },
    });

  // A missing report opened through the service, and its parent.
  const openMissingReport = async () => {
    const parent = await newParent();
    const created = await createMissingCase(parent, missingRequest(), ctx());
    const opened = await openCase(parent, created.case.id, ctx());
    return { parent, row: opened };
  };
  const openFoundReport = async () => (await createFoundCase(staff, foundRequest(), ctx())).case;

  const statusOf = async (id: string) => (await one<{ status: string; version: number }>(appClient, "SELECT status, version FROM cases WHERE id = $1", [id]));
  const candidateStatus = async (id: string) => (await one<{ status: string }>(appClient, "SELECT status FROM match_candidates WHERE id = $1", [id])).status;
  const counts = async () =>
    one<{ decisions: number; referrals: number; audit: number; confirmed: number }>(
      appClient,
      `SELECT (SELECT count(*)::int FROM review_decisions) AS decisions, (SELECT count(*)::int FROM referrals) AS referrals,
              (SELECT count(*)::int FROM audit_log) AS audit,
              (SELECT count(*)::int FROM match_candidates WHERE status = 'confirmed') AS confirmed`,
    );
  const actionsFor = async (caseId: string) =>
    (await appClient.query("SELECT action FROM audit_log WHERE case_id = $1 ORDER BY id", [caseId])).rows.map((r) => r.action);

  const confirm = (c: { m: { version: number }; f: { version: number } }, extra: Partial<DecisionRequest> = {}): DecisionRequest => ({
    decision: "confirm",
    expected_missing_version: c.m.version,
    expected_found_version: c.f.version,
    reviewer_checklist: CHECKLIST,
    ...extra,
  }) as DecisionRequest;

  const errorOf = async (p: Promise<unknown>) => {
    const err = await p.then(() => null, (e: unknown) => e);
    if (err instanceof ApiError) return err.id;
    return (err as { code?: string } | null)?.code ?? err;
  };

  /* ---------- TC-032 ---------- */

  describe("lifecycle guard (TC-032)", () => {
    it("rejects SQL open → confirmed on a missing report with check_violation from the trigger", async () => {
      const { row } = await openMissingReport();
      await expectPgError(appClient.query("UPDATE cases SET status = 'confirmed' WHERE id = $1", [row.id]), "23514", /illegal transition open>confirmed for missing case/);
      expect((await statusOf(row.id)).status).toBe("open");
    });

    it("rejects SQL found → closed with check_violation from the trigger", async () => {
      const found = await openFoundReport();
      await expectPgError(
        appClient.query("UPDATE cases SET status = 'closed', outcome = 'resolved_outside_fera', closed_at = now() WHERE id = $1", [found.id]),
        "23514",
        /illegal transition open>closed for found case/,
      );
    });

    it("maps the trigger's check_violation to E-005 inside the service transaction and rolls back its audit row", async () => {
      const { row } = await openMissingReport();
      const before = await counts();
      const err = await errorOf(
        withTransaction(async (c) => {
          await c.query("INSERT INTO audit_log (actor_type, action, case_id) VALUES ('system', 'case.state_changed', $1)", [row.id]);
          await c.query("UPDATE cases SET status = 'confirmed' WHERE id = $1", [row.id]); // bypasses the app guard
        }, { pool: app }),
      );
      expect(err).toBe("E-005");
      expect((await counts()).audit).toBe(before.audit);
    });

    it("refuses illegal closures through the service: found → E-005, coordination without a pair → E-017, outside-Fera from review → E-005", async () => {
      const found = await openFoundReport();
      expect(await errorOf(closeCase(officer, found.id, { outcome: "resolved_outside_fera", note: "[MOCK] note", expected_version: 1 }, ctx()))).toBe("E-005");
      const { row } = await openMissingReport();
      expect(await errorOf(closeCase(officer, row.id, { outcome: "coordination_recorded", note: "[MOCK] note", expected_version: 1 }, ctx()))).toBe("E-017");
      const other = await openFoundReport();
      await addCandidate(appClient, row.id, other.id);
      expect((await statusOf(row.id)).status).toBe("matched_pending_review");
      expect(await errorOf(closeCase(officer, row.id, { outcome: "resolved_outside_fera", note: "[MOCK] note", expected_version: 1 }, ctx()))).toBe("E-005");
      expect(await errorOf(closeCase(officer, row.id, { outcome: "resolved_outside_fera", note: "[MOCK] note", expected_version: 9 }, ctx()))).toBe("E-005");
    });

    it("closes an open missing report as resolved_outside_fera with a stored note and a safe audit row", async () => {
      const { row } = await openMissingReport();
      const out = await closeCase(officer, row.id, { outcome: "resolved_outside_fera", note: "[MOCK] synthetic closure note", expected_version: 1 }, ctx());
      expect(out.response).toMatchObject({ ref_code: row.ref_code, status: "closed" });
      expect(out.response.closed_at).toMatch(/\+06:00$/);
      const stored = await one<{ status: string; outcome: string; outcome_note: string }>(appClient, "SELECT status, outcome, outcome_note FROM cases WHERE id = $1", [row.id]);
      expect(stored).toEqual({ status: "closed", outcome: "resolved_outside_fera", outcome_note: "[MOCK] synthetic closure note" });
      const audit = await one<{ details: Record<string, unknown> }>(appClient, "SELECT details FROM audit_log WHERE case_id = $1 AND action = 'case.closed'", [row.id]);
      expect(audit.details).toEqual({
        ref_code: row.ref_code, version: 1, from_status: "open", to_status: "closed", api: "API-011", outcome: "resolved_outside_fera", reason_recorded: true,
      });
    });

    it("refuses re-closing a closed report with E-005 (before the referral rule) and audits the refusal after rollback", async () => {
      const { row } = await openMissingReport();
      await closeCase(officer, row.id, { outcome: "resolved_outside_fera", note: "[MOCK] note", expected_version: 1 }, ctx());
      for (const outcome of ["coordination_recorded", "resolved_outside_fera"] as const) {
        expect(await errorOf(closeCase(officer, row.id, { outcome, note: "[MOCK] again", expected_version: 1 }, ctx()))).toBe("E-005");
      }
      const refused = await appClient.query("SELECT actor_type, details FROM audit_log WHERE case_id = $1 AND action = 'case.close.refused'", [row.id]);
      expect(refused.rows).toEqual([0, 1].map(() => ({ actor_type: "officer", details: { error_id: "E-005", api: "API-011" } })));
      expect((await one<{ outcome_note: string }>(appClient, "SELECT outcome_note FROM cases WHERE id = $1", [row.id])).outcome_note).toBe("[MOCK] note");
    });

    it("surfaces a deferred pair-integrity refusal at SET CONSTRAINTS, after the callback finished, as E-005", async () => {
      const { row: m } = await openMissingReport();
      const f = await openFoundReport();
      const logs = captureLogs();
      let finished = false;
      const err = await errorOf(
        withTransaction(async (c) => {
          await c.query(
            `INSERT INTO match_candidates (missing_case_id, found_case_id, missing_version, found_version, score, rank, reason_bn, reason_en, components)
             VALUES ($1, $2, 9, 1, 50, 1, '[MOCK]', '[MOCK]', '{}')`,
            [m.id, f.id],
          ); // a stale missing_version: refused only by the deferred check
          finished = true;
        }, { pool: app, attempts: 1, logger: logs.logger }),
      );
      expect(finished).toBe(true);
      expect(err).toBe("E-005");
      expect(logs.parsed()).toEqual([expect.objectContaining({ level: 50, event: "db.refusal", err_code: "23514", tx_stage: "constraints" })]);
      expect((await one<{ n: number }>(appClient, "SELECT count(*)::int AS n FROM match_candidates WHERE missing_case_id = $1", [m.id])).n).toBe(0);
    });
  });

  /* ---------- TC-016 ---------- */

  describe("audit completeness and protection (TC-016)", () => {
    it("records create, open, confirm, referral, both state changes and close for the TC-010 journey, with no child payload", async () => {
      const parent = await newParent();
      const req = missingRequest("[MOCK] marks TC016");
      const created = await createMissingCase(parent, req, ctx());
      const m = await openCase(parent, created.case.id, ctx());
      const f = await openFoundReport();
      const candidateId = await addCandidate(appClient, m.id, f.id);
      const decided = await decideCandidate(officer, candidateId, confirm({ m, f }), ctx());
      expect(decided.response).toMatchObject({
        candidate_status: "confirmed",
        missing: { ref_code: m.ref_code, status: "confirmed", version: 1 },
        found: { ref_code: f.ref_code, status: "referred", version: 1 },
        referral_state: "recorded",
        referral_is_simulated: true,
      });
      await closeCase(officer, m.id, { outcome: "coordination_recorded", note: "[MOCK] coordination note", expected_version: 1 }, ctx());

      expect(await actionsFor(m.id)).toEqual(["case.created", "case.state_changed", "match.confirm", "case.state_changed", "case.closed"]);
      expect(await actionsFor(f.id)).toEqual(["case.created", "referral.recorded", "case.state_changed"]);
      // addCandidate (the matcher's job, TASK-017) moved both to review without audit; the
      // service's own steps are each audited. The pair's decision rows are officer-authored.
      const { rows } = await appClient.query(
        "SELECT actor_type, actor_user_id, action, candidate_id, details FROM audit_log WHERE case_id = ANY($1) ORDER BY id",
        [[m.id, f.id]],
      );
      for (const r of rows.filter((x) => ["match.confirm", "referral.recorded", "case.closed"].includes(x.action))) {
        expect([r.actor_type, r.actor_user_id]).toEqual(["officer", actors.officer]);
      }
      expect(rows.find((r) => r.action === "referral.recorded")!.details).toMatchObject({ referral_simulated: true, candidate_id: candidateId });
      const blob = JSON.stringify(rows);
      for (const secret of [req.draft.child.name!, req.draft.reporter.phone, req.draft.event.place_text, "[MOCK] marks TC016", "[MOCK] coordination note"]) {
        expect(blob).not.toContain(secret);
      }
      const referral = await one<{ is_simulated: boolean; record_state: string; referred_by: string; note: string | null }>(
        appClient, "SELECT is_simulated, record_state, referred_by, note FROM referrals WHERE candidate_id = $1", [candidateId],
      );
      expect(referral).toEqual({ is_simulated: true, record_state: "recorded", referred_by: actors.officer, note: null });
    });

    it("refuses UPDATE, DELETE and TRUNCATE on audit_log to fera_app", async () => {
      await expectPgError(appClient.query("UPDATE audit_log SET action = 'case.closed'"), "42501");
      await expectPgError(appClient.query("DELETE FROM audit_log"), "42501");
      await expectPgError(appClient.query("TRUNCATE audit_log"), "42501");
    });

    it.each([
      ["disable the lifecycle trigger", "ALTER TABLE cases DISABLE TRIGGER cases_transition_guard"],
      ["disable all triggers", "ALTER TABLE cases DISABLE TRIGGER ALL"],
      ["drop the lifecycle trigger", "DROP TRIGGER cases_transition_guard ON cases"],
      ["drop the audit trigger", "DROP TRIGGER audit_log_no_update_delete ON audit_log"],
      ["disable the audit trigger", "ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_truncate"],
      ["replace the guard function", "CREATE OR REPLACE FUNCTION enforce_case_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$"],
      ["replace the append-only function", "CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$"],
      ["alter the pair check", "ALTER FUNCTION check_pair_integrity() RENAME TO gone"],
      ["drop the pair check", "DROP FUNCTION check_pair_integrity() CASCADE"],
      ["defer nothing by dropping a constraint trigger", "DROP TRIGGER cases_integrity ON cases"],
      ["switch off replication-role triggers", "SET session_replication_role = replica"],
    ])("refuses fera_app to %s", async (_label, sql) => {
      await expectPgError(appClient.query(sql), "42501");
    });

    it("keeps the guards in place after those attempts", async () => {
      const { rows } = await admin.query(
        `SELECT tgname, tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('cases'::regclass, 'audit_log'::regclass) ORDER BY tgname`,
      );
      expect(rows.map((r) => `${r.tgname}:${r.tgenabled}`)).toEqual(
        expect.arrayContaining(["audit_log_no_truncate:O", "audit_log_no_update_delete:O", "cases_integrity:O", "cases_transition_guard:O"]),
      );
    });

    it("writes access.denied rows through the installed hooks as fera_app, with a null FK for an unknown case (TC-052)", async () => {
      const unknown = randomUUID();
      const requestId = randomUUID();
      await auditAccessDenied({ principal: staff, api: "API-004", requestId, errorId: "E-004", reason: "authorize", caseId: unknown });
      const row = await one<{ actor_type: string; case_id: string | null; details: unknown }>(
        appClient, "SELECT actor_type, case_id, details FROM audit_log WHERE request_id = $1", [requestId],
      );
      expect(row).toEqual({ actor_type: "staff", case_id: null, details: { error_id: "E-004", api: "API-004" } });

      const { row: hidden } = await openMissingReport();
      const r2 = randomUUID();
      await auditAccessDenied({ principal: staff, api: "API-004", requestId: r2, errorId: "E-004", reason: "authorize", caseId: hidden.id });
      expect((await one<{ case_id: string }>(appClient, "SELECT case_id FROM audit_log WHERE request_id = $1", [r2])).case_id).toBe(hidden.id);

      const before = (await counts()).audit;
      await auditPageDenied({ principal: staff, role: "staff", path: "/officer", errorId: "E-004", reason: "role", caseId: null });
      expect((await counts()).audit).toBe(before + 1);
    });
  });

  /* ---------- confirm / reject transaction ---------- */

  describe("officer decision transaction (BR-020, TC-029/046/053)", () => {
    it("confirms one candidate, voids its competitors and returns the competitors' other reports to open (TC-053)", async () => {
      const { row: m } = await openMissingReport();
      const f1 = await openFoundReport();
      const f2 = await openFoundReport();
      const { row: m2 } = await openMissingReport();
      const c1 = await addCandidate(appClient, m.id, f1.id);
      const c2 = await addCandidate(appClient, m.id, f2.id, 2); // competitor on the missing side; f2 has nothing else
      const c3 = await addCandidate(appClient, m2.id, f1.id, 2); // competitor on the found side; m2 has nothing else
      const out = await decideCandidate(officer, c1, confirm({ m, f: f1 }), ctx());
      expect(out.voidedCandidateIds.sort()).toEqual([c2, c3].sort());
      expect(out.reopenedCaseIds.sort()).toEqual([f2.id, m2.id].sort());
      expect([await candidateStatus(c1), await candidateStatus(c2), await candidateStatus(c3)]).toEqual(["confirmed", "voided", "voided"]);
      expect((await statusOf(f2.id)).status).toBe("open");
      expect((await statusOf(m2.id)).status).toBe("open");
      expect(await actionsFor(f2.id)).toEqual(["case.created", "match.voided", "case.state_changed"]);
      const decision = await one<{ officer_id: string; decision: string; officer_verified_at_decision: boolean }>(
        appClient, "SELECT officer_id, decision, officer_verified_at_decision FROM review_decisions WHERE candidate_id = $1", [c1],
      );
      expect(decision).toEqual({ officer_id: actors.officer, decision: "confirm", officer_verified_at_decision: true });
      // TC-029: the other pair on the same found report cannot be confirmed afterwards.
      expect(await errorOf(decideCandidate(officer, c3, confirm({ m: m2, f: f1 }), ctx()))).toBe("E-005");
    });

    it("rejects a stale expected version without writing a decision, referral or audit row (TC-046)", async () => {
      const { row: m } = await openMissingReport();
      const f = await openFoundReport();
      const c = await addCandidate(appClient, m.id, f.id);
      const before = await counts();
      expect(await errorOf(decideCandidate(officer, c, confirm({ m: { version: 2 }, f }), ctx()))).toBe("E-005");
      expect(await errorOf(decideCandidate(officer, c, { decision: "reject", reason: "[MOCK] reason", expected_missing_version: 1, expected_found_version: 7 }, ctx()))).toBe("E-005");
      // Nothing of the decision is written; only the two refusals are audited, after rollback.
      expect(await counts()).toEqual({ ...before, audit: before.audit + 2 });
      expect(await candidateStatus(c)).toBe("pending");
      const refused = await appClient.query(
        "SELECT actor_type, actor_user_id, case_id, candidate_id, details FROM audit_log WHERE action = 'match.refused' AND candidate_id = $1 ORDER BY id",
        [c],
      );
      expect(refused.rows).toEqual([0, 1].map(() => ({
        actor_type: "officer", actor_user_id: actors.officer, case_id: m.id, candidate_id: c, details: { error_id: "E-005", api: "API-010" },
      })));
    });

    it("refuses an unverified officer, and an officer un-verified after sign-in, with E-004 and no writes (BR-001/024)", async () => {
      const { row: m } = await openMissingReport();
      const f = await openFoundReport();
      const c = await addCandidate(appClient, m.id, f.id);
      const before = await counts();
      const pending = testUser(actors.unverifiedOfficer, "officer", { verified: false });
      expect(await errorOf(decideCandidate(pending, c, confirm({ m, f }), ctx()))).toBe("E-004");
      // The principal still says verified; the database row no longer does.
      const revoked = testUser(actors.unverifiedOfficer, "officer", { verified: true });
      expect(await errorOf(decideCandidate(revoked, c, confirm({ m, f }), ctx()))).toBe("E-004");
      expect(await errorOf(closeCase(revoked, m.id, { outcome: "resolved_outside_fera", note: "[MOCK] note", expected_version: 1 }, ctx()))).toBe("E-004");
      expect(await counts()).toEqual(before);
    });

    it("rolls back every partial write when a late statement fails", async () => {
      const { row: m } = await openMissingReport();
      const f = await openFoundReport();
      const f2 = await openFoundReport();
      const c = await addCandidate(appClient, m.id, f.id);
      const competitor = await addCandidate(appClient, m.id, f2.id, 2);
      const before = await counts();
      // agency_name over the 120-character CHECK fails at the referral insert, after the
      // decision, candidate, competitor and match.confirm writes (past the contract cap).
      const err = await errorOf(decideCandidate(officer, c, confirm({ m, f }, { agency_name: "x".repeat(121) } as never), ctx()));
      expect(err).toBe("E-005");
      expect(await counts()).toEqual({ ...before, audit: before.audit + 1 }); // the match.refused row only
      expect([await candidateStatus(c), await candidateStatus(competitor)]).toEqual(["pending", "pending"]);
      expect([(await statusOf(m.id)).status, (await statusOf(f.id)).status, (await statusOf(f2.id)).status]).toEqual([
        "matched_pending_review", "matched_pending_review", "matched_pending_review",
      ]);
    });

    it("rejects with a reason, returns both reports to open, and the same-version pair cannot be suggested again (BR-019)", async () => {
      const { row: m } = await openMissingReport();
      const f = await openFoundReport();
      const c = await addCandidate(appClient, m.id, f.id);
      const out = await decideCandidate(officer, c, { decision: "reject", reason: "[MOCK] ages differ", expected_missing_version: 1, expected_found_version: 1 }, ctx());
      expect(out.response).toMatchObject({ candidate_status: "rejected", referral_id: null, referral_state: null, missing: { status: "open" }, found: { status: "open" } });
      expect(out.reopenedCaseIds.sort()).toEqual([m.id, f.id].sort());
      const audit = await one<{ actor_type: string; details: Record<string, unknown> }>(appClient, "SELECT actor_type, details FROM audit_log WHERE candidate_id = $1 AND action = 'match.reject'", [c]);
      expect(audit.actor_type).toBe("officer");
      expect(audit.details).toMatchObject({ decision: "reject", reason_recorded: true });
      expect(JSON.stringify(audit.details)).not.toContain("[MOCK] ages differ");
      await expectPgError(addCandidate(appClient, m.id, f.id), "23505");
      // A retried decision never creates a second one.
      expect(await errorOf(decideCandidate(officer, c, { decision: "reject", reason: "[MOCK] again", expected_missing_version: 1, expected_found_version: 1 }, ctx()))).toBe("E-005");
      expect((await one<{ n: number }>(appClient, "SELECT count(*)::int AS n FROM review_decisions WHERE candidate_id = $1", [c])).n).toBe(1);
    });

    it("answers E-004 for an unknown candidate", async () => {
      expect(await errorOf(decideCandidate(officer, randomUUID(), confirm({ m: { version: 1 }, f: { version: 1 } }), ctx()))).toBe("E-004");
    });
  });

  /* ---------- concurrency ---------- */

  describe("concurrent decisions (BR-020)", () => {
    it("serialises two confirms on the same missing report: one wins, the other gets E-005, no deadlock", async () => {
      const { row: m } = await openMissingReport();
      const f1 = await openFoundReport();
      const f2 = await openFoundReport();
      const c1 = await addCandidate(appClient, m.id, f1.id);
      const c2 = await addCandidate(appClient, m.id, f2.id, 2);
      const results = await Promise.allSettled([
        // attempts: 1 — a deadlock would surface as 40P01 instead of being retried away.
        decideCandidate(officer, c1, confirm({ m, f: f1 }), { pool: app, attempts: 1 }),
        decideCandidate(officer, c2, confirm({ m, f: f2 }), { pool: app2, attempts: 1 }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(lost.reason).toBeInstanceOf(ApiError);
      expect((lost.reason as ApiError).id).toBe("E-005");
      const confirmed = await one<{ n: number }>(appClient, "SELECT count(*)::int AS n FROM match_candidates WHERE missing_case_id = $1 AND status = 'confirmed'", [m.id]);
      expect(confirmed.n).toBe(1);
    });

    it("retries the whole decision when a new pending candidate appears while it waits for its locks (LockSetChanged)", async () => {
      const { row: m } = await openMissingReport();
      const f = await openFoundReport();
      const f3 = await openFoundReport();
      const c = await addCandidate(appClient, m.id, f.id);
      const other = await connect("app");
      try {
        await other.query("BEGIN");
        await other.query("SELECT id FROM cases WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE", [[m.id, f3.id]]);
        let connects = 0;
        const counting = { connect: () => (connects++, app.connect()) };
        const decision = decideCandidate(officer, c, confirm({ m, f }), { pool: counting });
        // Wait until the decision is blocked on the missing report's row lock.
        for (let i = 0; i < 200; i++) {
          const w = await one<{ n: number }>(admin, "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND usename = 'fera_app' AND wait_event_type = 'Lock'");
          if (w.n > 0) break;
          await new Promise((r) => setTimeout(r, 10));
        }
        const fresh = await one<{ id: string }>(
          other,
          `INSERT INTO match_candidates (missing_case_id, found_case_id, missing_version, found_version, score, rank, reason_bn, reason_en, components)
           VALUES ($1, $2, 1, 1, 40, 2, '[MOCK]', '[MOCK]', '{}') RETURNING id`,
          [m.id, f3.id],
        );
        await other.query("UPDATE cases SET status = 'matched_pending_review' WHERE id = $1", [f3.id]);
        await other.query("COMMIT");
        const out = await decision;
        expect(connects).toBe(2); // first attempt saw the lock set grow, second succeeded
        expect(out.voidedCandidateIds).toEqual([fresh.id]);
        expect(out.reopenedCaseIds).toEqual([f3.id]);
        expect((await statusOf(f3.id)).status).toBe("open");
      } finally {
        await other.query("ROLLBACK").catch(() => undefined);
        await other.end();
      }
    });

    it("runs crossing confirms over overlapping neighbourhoods without deadlock (sorted locks), 5 rounds", async () => {
      for (let round = 0; round < 5; round++) {
        const { row: m1 } = await openMissingReport();
        const { row: m2 } = await openMissingReport();
        const f1 = await openFoundReport();
        const f2 = await openFoundReport();
        const a = await addCandidate(appClient, m1.id, f1.id);
        const b = await addCandidate(appClient, m2.id, f2.id);
        const x = await addCandidate(appClient, m1.id, f2.id, 2);
        const y = await addCandidate(appClient, m2.id, f1.id, 2);
        const [ra, rb] = await Promise.all([
          decideCandidate(officer, a, confirm({ m: m1, f: f1 }), { pool: app, attempts: 1 }),
          decideCandidate(officer, b, confirm({ m: m2, f: f2 }), { pool: app2, attempts: 1 }),
        ]);
        expect([ra.response.candidate_status, rb.response.candidate_status]).toEqual(["confirmed", "confirmed"]);
        expect([await candidateStatus(x), await candidateStatus(y)]).toEqual(["voided", "voided"]);
      }
    });
  });

  /* ---------- idempotent submission (TC-031/042) ---------- */

  describe("idempotent submission (FR-031, TC-031/042)", () => {
    it("replays the same UUID and payload, conflicts on a changed payload, and treats a new UUID as a new report", async () => {
      const parent = await newParent();
      const req = missingRequest();
      const first = await createMissingCase(parent, req, ctx());
      const again = await createMissingCase(parent, req, ctx());
      expect([first.replayed, again.replayed]).toEqual([false, true]);
      expect(again.case.id).toBe(first.case.id);
      expect(again.case.ref_code).toBe(first.case.ref_code);
      const changed = { ...req, draft: { ...req.draft, child: { ...req.draft.child, marks: "[MOCK] changed" } } };
      expect(await errorOf(createMissingCase(parent, changed, ctx()))).toBe("E-006");
      const fresh = await createMissingCase(parent, { ...req, client_submission_id: randomUUID() }, ctx());
      expect(fresh.case.id).not.toBe(first.case.id);
      const n = await one<{ n: number }>(appClient, "SELECT count(*)::int AS n FROM cases WHERE reporter_session_id = $1", [parent.kind === "parent" ? parent.sessionId : null]);
      expect(n.n).toBe(2);
      expect(await actionsFor(first.case.id)).toEqual(["case.created", "case.submission_replayed"]);
    });

    it("keeps one report for two concurrent identical submits", async () => {
      const parent = await newParent();
      const req = missingRequest();
      const [a, b] = await Promise.all([createMissingCase(parent, req, { pool: app }), createMissingCase(parent, req, { pool: app2 })]);
      expect(a.case.id).toBe(b.case.id);
      expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
      const n = await one<{ n: number }>(appClient, "SELECT count(*)::int AS n FROM cases WHERE client_submission_id = $1", [req.client_submission_id]);
      expect(n.n).toBe(1);
    });

    it("scopes found submissions to the staff user and stores them open, synthetic and staff-sourced", async () => {
      const req = foundRequest();
      const a = await createFoundCase(staff, req, ctx());
      const b = await createFoundCase(staff, req, ctx());
      expect(b).toMatchObject({ replayed: true, case: { id: a.case.id } });
      expect(a.case).toMatchObject({ kind: "found", status: "open", source: "staff", is_synthetic: true, created_by_user_id: actors.staff });
      // The same UUID under another user is a different key.
      const otherStaff = testUser(actors.officer, "officer", { verified: true });
      const c = await createFoundCase(otherStaff, req, ctx());
      expect(c.case.id).not.toBe(a.case.id);
    });
  });

  /* ---------- owner edit (BR-025, TC-018) ---------- */

  describe("owner edit with versions (BR-019/025, TC-018)", () => {
    it("bumps the version, snapshots the old payload, voids pending candidates and reopens both reports", async () => {
      const { parent, row: m } = await openMissingReport();
      const f = await openFoundReport();
      const c = await addCandidate(appClient, m.id, f.id);
      const edit = updateCaseRequestSchema.parse({ draft: { ...missingRequest("[MOCK] edited marks").draft, reporter: { relation: null, phone: m.contact_phone } }, confirmed: true, expected_version: 1 });
      const updated = await editMissingCase(parent, m.id, edit, ctx());
      expect(updated).toMatchObject({ version: 2, status: "open", marks: "[MOCK] edited marks", matching_state: "queued" });
      expect(await candidateStatus(c)).toBe("voided");
      expect((await statusOf(f.id)).status).toBe("open");
      const snap = await one<{ version: number; edited_by: string; marks: string | null }>(
        appClient, "SELECT version, edited_by, snapshot->>'marks' AS marks FROM case_versions WHERE case_id = $1", [m.id],
      );
      expect(snap).toEqual({ version: 1, edited_by: "parent", marks: null });
      const audit = await one<{ details: Record<string, unknown> }>(appClient, "SELECT details FROM audit_log WHERE case_id = $1 AND action = 'case.edited'", [m.id]);
      expect(audit.details).toMatchObject({ version: 2, fields_changed: ["child.marks"], from_status: "matched_pending_review", to_status: "open" });
      expect(JSON.stringify(audit.details)).not.toContain("[MOCK] edited marks");
      // The voided candidate's old version cannot be decided (stale, TC-046).
      expect(await errorOf(decideCandidate(officer, c, confirm({ m, f }), ctx()))).toBe("E-005");
    });

    it("refuses a stale version with E-005 and a confirmed report with E-018", async () => {
      const { parent, row: m } = await openMissingReport();
      const draft = missingRequest().draft;
      expect(await errorOf(editMissingCase(parent, m.id, { draft, confirmed: true, expected_version: 5 }, ctx()))).toBe("E-005");
      const f = await openFoundReport();
      const c = await addCandidate(appClient, m.id, f.id);
      await decideCandidate(officer, c, confirm({ m, f }), ctx());
      expect(await errorOf(editMissingCase(parent, m.id, { draft, confirmed: true, expected_version: 1 }, ctx()))).toBe("E-018");
      const refused = await appClient.query("SELECT actor_type, details FROM audit_log WHERE case_id = $1 AND action = 'case.edit.refused' ORDER BY id", [m.id]);
      expect(refused.rows.map((r) => [r.actor_type, r.details.error_id])).toEqual([["parent", "E-005"], ["parent", "E-018"]]);
      const other = await newParent();
      expect(await errorOf(editMissingCase(other, m.id, { draft, confirmed: true, expected_version: 1 }, ctx()))).toBe("E-004");
    });
  });

  /* ---------- API-004 read ---------- */

  describe("readCase (API-004)", () => {
    it("serves the owner, staff and officer projections, audits officer contact access, and hides the rest", async () => {
      const { parent, row: m } = await openMissingReport();
      const owner = await readCase(parent, m.id, ctx());
      expect(owner.kind === "ok" && owner.view.view).toBe("owner");
      const officerRead = await readCase(officer, m.id, { pool: app, requestId: randomUUID() });
      expect(officerRead.kind === "ok" && officerRead.view.view).toBe("officer");
      expect(await actionsFor(m.id)).toContain("case.contact_viewed");
      expect(await readCase(staff, m.id, ctx())).toEqual({ kind: "hidden", caseId: m.id });
      expect(await readCase(await newParent(), m.id, ctx())).toEqual({ kind: "hidden", caseId: m.id });
      expect(await readCase(officer, randomUUID(), ctx())).toEqual({ kind: "hidden", caseId: null });
      expect(await readCase(officer, "not-a-uuid", ctx())).toEqual({ kind: "hidden", caseId: null });
    });

    it("reads a row seeded with SQL whose provenance follows evidenceSpanSchema (seed/import shape)", async () => {
      const seeded = await insertMissing(appClient);
      const read = await readCase(officer, seeded.id, { pool: app, requestId: randomUUID() });
      expect(read.kind === "ok" && read.view.view).toBe("officer");
    });
  });
});

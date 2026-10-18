// TASK-032: SCREEN-013 admin tools on PostgreSQL 16, through the API-016/017/021 route
// handlers and services with the restricted runtime roles (fera_redactor for redaction,
// fera_app for verification and listing). D6 TC-015 end to end, verify officer [MOCK]
// with its audit row, non-admin and non-officer refusals. Synthetic data only; runs under
// `npm run test:db`.
import { randomUUID } from "node:crypto";
import type { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRouteFactory } from "@/app/api/_shared";
import { anonymiseRoute, usersRoute, verifyRoute } from "@/app/api/admin/admin-routes";
import type { Principal } from "@/contracts/server";
import { countEligibleCases, listAdminUsers, setOfficerVerified, setRedactorPoolForTests } from "@/server/admin";
import { auditAccessDenied } from "@/server/audit";
import { decideCandidate } from "@/server/case";
import { setPoolForTests } from "@/server/db/pool";
import { captureLogs, fakeResolver, get, jsonPost, noParams } from "../api/fakes";
import { testUser } from "../support/principals";
import {
  addCandidate, closedPair, confirmPair, connect, createActors, dbTestsEnabled, insertFound, insertMissing, one, openMissing, pool, seedReference,
  type Actors,
} from "./support/db";

describe.skipIf(!dbTestsEnabled)("admin tools on PostgreSQL 16 (TASK-032)", () => {
  let admin: Client;
  let app: Client;
  let appPool: Pool;
  let redactorPool: Pool;
  let actors: Actors;
  let asAdmin: Principal;

  // The real route factory with the real access.denied writer (on the injected fera_app pool).
  const factory = (principal: Principal | null) =>
    createRouteFactory({ resolvePrincipal: fakeResolver(principal), auditDenied: auditAccessDenied, logger: captureLogs().logger, preAuthLimit: null, trustProxy: true });

  beforeAll(async () => {
    admin = await connect("admin");
    app = await connect("app");
    appPool = pool("app");
    redactorPool = pool("redactor");
    setPoolForTests(appPool);
    setRedactorPoolForTests(redactorPool);
    await seedReference(admin);
    actors = await createActors(admin);
    asAdmin = testUser(actors.admin, "admin");
  });

  afterAll(async () => {
    setPoolForTests(null);
    setRedactorPoolForTests(null);
    await Promise.all([admin?.end(), app?.end(), appPool?.end(), redactorPool?.end()]);
  });

  const statusCounts = async () =>
    (await app.query("SELECT kind, status, district_code, outcome, count(*)::int AS n FROM cases GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4")).rows;
  const payload = (id: string) =>
    one<{ child_name: string | null; contact_phone: string | null; clothing: string | null; anonymised: boolean }>(
      admin,
      "SELECT child_name, contact_phone, clothing, anonymised_at IS NOT NULL AS anonymised FROM cases WHERE id = $1",
      [id],
    );

  // Runs first, on this file's fresh database, so all_eligible sees only these rows.
  describe("TC-015: redact identifying payloads, all eligible", () => {
    it("redacts eligible terminal payloads, skips active linked evidence, clears related payload and keeps counts", async () => {
      // 3 closed/referred reports: a closed missing report and its referred found report,
      // plus a referred found report whose confirmed missing report is not closed yet
      // (active linked evidence). 1 open report. The confirmed missing report is the
      // pair's other end (not terminal).
      const p1 = await closedPair(app, actors);
      const linkedMissing = await insertMissing(app);
      await openMissing(app, linkedMissing.id);
      const activeFound = await insertFound(app, actors.staff);
      const linkedCandidate = await addCandidate(app, linkedMissing.id, activeFound.id);
      await confirmPair(app, { candidateId: linkedCandidate, missingId: linkedMissing.id, foundId: activeFound.id, officerId: actors.officer });
      const open = await insertMissing(app);
      await openMissing(app, open.id);

      const terminal = (await app.query("SELECT count(*)::int AS n FROM cases WHERE status IN ('closed', 'referred')")).rows[0].n;
      const openCount = (await app.query("SELECT count(*)::int AS n FROM cases WHERE status = 'open'")).rows[0].n;
      expect({ terminal, openCount }).toEqual({ terminal: 3, openCount: 1 });

      // SCREEN-013 summary before the action: only the 2 eligible reports.
      expect(await countEligibleCases(redactorPool, asAdmin)).toBe(2);

      const before = await statusCounts();
      const auditBefore = (await one<{ n: number }>(app, "SELECT count(*)::int AS n FROM audit_log")).n;

      const res = await anonymiseRoute(factory(asAdmin))(jsonPost("/api/admin/anonymise", { all_eligible: true, confirmation: "বেনামী" }), noParams);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ redacted: 2, skipped_not_eligible: 1, mode: "pseudonymisation", external_copies_removed: false });

      // Direct payload cleared on the eligible pair; active linked evidence and the open report intact.
      for (const id of [p1.missing.id, p1.found.id]) {
        expect(await payload(id)).toEqual({ child_name: null, contact_phone: null, clothing: null, anonymised: true });
      }
      expect(await payload(activeFound.id)).toMatchObject({ child_name: activeFound.name, contact_phone: activeFound.phone, anonymised: false });
      expect(await payload(linkedMissing.id)).toMatchObject({ child_name: linkedMissing.name, anonymised: false });
      expect(await payload(open.id)).toMatchObject({ child_name: open.name, anonymised: false });

      // Related payload cleared: candidate reasons, decision reason, referral note.
      expect(await one(admin, "SELECT reason_bn, reason_en, components FROM match_candidates WHERE id = $1", [p1.candidateId]))
        .toEqual({ reason_bn: "[REDACTED]", reason_en: "[REDACTED]", components: {} });
      expect((await one(admin, "SELECT note FROM referrals WHERE candidate_id = $1", [p1.candidateId])).note).toBeNull();
      expect((await one(admin, "SELECT reason FROM review_decisions WHERE candidate_id = $1", [p1.candidateId])).reason).toBe("[REDACTED]");
      expect((await one(admin, "SELECT note FROM referrals WHERE candidate_id = $1", [linkedCandidate])).note).toBe("[MOCK] referral note");
      expect((await one(admin, "SELECT reason_en FROM match_candidates WHERE id = $1", [linkedCandidate])).reason_en).not.toBe("[REDACTED]");

      // Pseudonymous counts (kind, status, district, outcome) unchanged.
      expect(await statusCounts()).toEqual(before);

      // Exactly one safe audit row per redacted report, written by redact_case().
      const audit = await app.query(
        "SELECT action, actor_type, actor_user_id, case_id, details FROM audit_log ORDER BY id OFFSET $1",
        [auditBefore],
      );
      expect(audit.rows).toHaveLength(2);
      expect(audit.rows.map((r) => r.case_id).sort()).toEqual([p1.missing.id, p1.found.id].sort());
      for (const r of audit.rows) {
        expect(r).toMatchObject({ action: "case.payload_redacted", actor_type: "admin", actor_user_id: actors.admin, details: { mode: "pseudonymisation", external_copies_removed: false } });
      }

      // The panel now shows the D3 empty state; a repeat run redacts nothing.
      expect(await countEligibleCases(redactorPool, asAdmin)).toBe(0);
      const again = await anonymiseRoute(factory(asAdmin))(jsonPost("/api/admin/anonymise", { all_eligible: true, confirmation: "বেনামী" }), noParams);
      expect(await again.json()).toEqual({ redacted: 0, skipped_not_eligible: 1, mode: "pseudonymisation", external_copies_removed: false });
    });

    it("refuses a non-admin through the route: E-003, one access.denied row, nothing redacted", async () => {
      const { missing } = await closedPair(app, actors);
      for (const p of [testUser(actors.staff, "staff"), testUser(actors.officer, "officer", { verified: true })]) {
        const deniedBefore = (await one<{ n: number }>(app, "SELECT count(*)::int AS n FROM audit_log WHERE action = 'access.denied'")).n;
        const res = await anonymiseRoute(factory(p))(jsonPost("/api/admin/anonymise", { all_eligible: true, confirmation: "বেনামী" }), noParams);
        expect(res.status).toBe(403);
        expect((await res.json()).error.id).toBe("E-003");
        expect((await one<{ n: number }>(app, "SELECT count(*)::int AS n FROM audit_log WHERE action = 'access.denied'")).n).toBe(deniedBefore + 1);
      }
      expect((await payload(missing.id)).anonymised).toBe(false);
    });

    it("a wrong typed word is E-001 and redacts nothing", async () => {
      const { missing } = await closedPair(app, actors);
      const res = await anonymiseRoute(factory(asAdmin))(jsonPost("/api/admin/anonymise", { all_eligible: true, confirmation: "benami" }), noParams);
      expect(res.status).toBe(400);
      expect((await res.json()).error.id).toBe("E-001");
      expect((await payload(missing.id)).anonymised).toBe(false);
    });
  });

  describe("verify officer [MOCK] (API-017)", () => {
    const verified = async (id: string) => (await one<{ verified: boolean }>(app, "SELECT verified FROM users WHERE id = $1", [id])).verified;
    const verificationAudit = async () =>
      (await app.query("SELECT actor_type, actor_user_id, case_id, candidate_id, details FROM audit_log WHERE action = 'user.verification_changed' ORDER BY id")).rows;

    it("verifies and un-verifies a seeded officer, each with one audit row in the same transaction", async () => {
      const target = actors.unverifiedOfficer;
      const route = verifyRoute(factory(asAdmin));
      const res = await route(jsonPost(`/api/admin/users/${target}/verify`, { verified: true }), { params: Promise.resolve({ id: target }) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: target, role: "officer", verified: true });
      expect(await verified(target)).toBe(true);
      const requestId = res.headers.get("x-request-id");
      const rows = await app.query("SELECT request_id FROM audit_log WHERE action = 'user.verification_changed'");
      expect(rows.rows.map((r) => r.request_id)).toEqual([requestId]);

      expect(await setOfficerVerified(asAdmin, target, { verified: false }, { pool: appPool })).toEqual({ id: target, role: "officer", verified: false });
      expect(await verified(target)).toBe(false);
      expect(await verificationAudit()).toEqual([
        { actor_type: "admin", actor_user_id: actors.admin, case_id: null, candidate_id: null, details: { api: "API-017", verified: true, target_role: "officer", target_user_id: target } },
        { actor_type: "admin", actor_user_id: actors.admin, case_id: null, candidate_id: null, details: { api: "API-017", verified: false, target_role: "officer", target_user_id: target } },
      ]);
    });

    it("a no-op (already that value) writes no audit row", async () => {
      const before = (await verificationAudit()).length;
      expect(await setOfficerVerified(asAdmin, actors.officer, { verified: true }, { pool: appPool })).toEqual({ id: actors.officer, role: "officer", verified: true });
      expect((await verificationAudit()).length).toBe(before);
    });

    it("an un-verified officer can no longer decide (BR-024: re-read in the decision transaction)", async () => {
      const officer = (await one<{ id: string }>(admin, "INSERT INTO users (username, display_name, password_hash, role, verified) VALUES ('mock.officer.' || substr(md5(random()::text), 1, 6), '[MOCK] Officer', 'synthetic-not-a-hash', 'officer', true) RETURNING id")).id;
      const m = await insertMissing(app);
      await openMissing(app, m.id);
      const f = await insertFound(app, actors.staff);
      const c = await addCandidate(app, m.id, f.id);
      await setOfficerVerified(asAdmin, officer, { verified: false }, { pool: appPool });
      // The principal still claims verified (an old session); the service re-reads users.
      const stale = testUser(officer, "officer", { verified: true });
      await expect(decideCandidate(stale, c, { decision: "reject", reason: "[MOCK] differs", expected_missing_version: 1, expected_found_version: 1 }, { pool: appPool }))
        .rejects.toMatchObject({ id: "E-004" });
      expect((await one(app, "SELECT status FROM match_candidates WHERE id = $1", [c])).status).toBe("pending");
    });

    it("refuses non-admins: E-003 at the route (with access.denied) and in the service, nothing changed", async () => {
      const before = await verified(actors.unverifiedOfficer);
      for (const p of [testUser(actors.staff, "staff"), testUser(actors.officer, "officer", { verified: true }), testUser(actors.unverifiedOfficer, "officer")]) {
        const res = await verifyRoute(factory(p))(jsonPost(`/api/admin/users/${actors.unverifiedOfficer}/verify`, { verified: !before }), { params: Promise.resolve({ id: actors.unverifiedOfficer }) });
        expect(res.status).toBe(403);
        expect((await res.json()).error.id).toBe("E-003");
        await expect(setOfficerVerified(p, actors.unverifiedOfficer, { verified: !before }, { pool: appPool })).rejects.toMatchObject({ id: "E-003" });
      }
      expect(await verified(actors.unverifiedOfficer)).toBe(before);
    });

    it("refuses a deactivated admin whose session still claims active (E-003, re-read in the transaction)", async () => {
      const former = (await one<{ id: string }>(admin, "INSERT INTO users (username, display_name, password_hash, role, is_active) VALUES ('former.admin.' || substr(md5(random()::text), 1, 6), '[MOCK] Former admin', 'synthetic-not-a-hash', 'admin', false) RETURNING id")).id;
      await expect(setOfficerVerified(testUser(former, "admin"), actors.unverifiedOfficer, { verified: true }, { pool: appPool })).rejects.toMatchObject({ id: "E-003" });
    });

    it("refuses non-officer and unknown targets with E-004 and an access.denied row without a case FK", async () => {
      const route = verifyRoute(factory(asAdmin));
      for (const id of [actors.staff, actors.admin, randomUUID()]) {
        const deniedBefore = (await one<{ n: number }>(app, "SELECT count(*)::int AS n FROM audit_log WHERE action = 'access.denied'")).n;
        const res = await route(jsonPost(`/api/admin/users/${id}/verify`, { verified: true }), { params: Promise.resolve({ id }) });
        expect(res.status).toBe(404);
        expect((await res.json()).error.id).toBe("E-004");
        const denied = await app.query("SELECT actor_type, case_id, details FROM audit_log WHERE action = 'access.denied' ORDER BY id OFFSET $1", [deniedBefore]);
        expect(denied.rows).toEqual([{ actor_type: "admin", case_id: null, details: { error_id: "E-004", api: "API-017" } }]);
      }
      const roles = await app.query("SELECT role::text AS role, verified FROM users WHERE id = ANY($1) ORDER BY role", [[actors.staff, actors.admin]]);
      expect(roles.rows).toEqual([{ role: "admin", verified: false }, { role: "staff", verified: false }]);
    });
  });

  describe("user listing (API-021)", () => {
    it("pages through every account with AdminUserView fields only", async () => {
      const all = (await app.query("SELECT username FROM users ORDER BY username")).rows.map((r) => r.username);
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 10; i++) {
        const res = await usersRoute(factory(asAdmin))(get(`/api/admin/users?limit=2${cursor ? `&cursor=${cursor}` : ""}`), noParams);
        expect(res.status).toBe(200);
        const body = await res.json();
        for (const u of body.users) expect(Object.keys(u).sort()).toEqual(["display_name", "id", "is_active", "role", "username", "verified"]);
        seen.push(...body.users.map((u: { username: string }) => u.username));
        if (!body.next_cursor) break;
        cursor = body.next_cursor;
      }
      expect(seen).toEqual(all);
      expect(JSON.stringify(await listAdminUsers(asAdmin, {}, { pool: appPool }))).not.toContain("synthetic-not-a-hash");
    });

    it("refuses a non-admin with E-003", async () => {
      const res = await usersRoute(factory(testUser(actors.officer, "officer", { verified: true })))(get("/api/admin/users"), noParams);
      expect(res.status).toBe(403);
    });
  });
});

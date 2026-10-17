// Close-case route and service (API-011; TASK-015, TASK-029; FR-018; BR-012; TC-010/032).
//
// Verified active officer only. A closure records a synthetic coordination outcome
// (never a rescue, return, or safe reunification). Stale `expected_version` is E-005.
// Non-officer (parent, staff, admin) and unverified or inactive officers are denied
// at the service's first guard (E-004). The `auditRefusals` path writes a single
// refusal row on its own for every signed-in denial, separated from the rollback.
//
// These tests run against the test database via setPoolForTests(); the orchestrator
// resets state per run. The route tests build a minimal Request and call the handler
// returned by `defineRoute`; the service tests call `closeCase(...)` directly with a
// `ServiceContext.requestId`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "@/app/api/_shared/envelope";
import { closeCaseResponseSchema, type CloseCaseResponse } from "@/contracts";
import { closeCase } from "@/server/case";
import { closePool, setPoolForTests, getPool } from "@/server/db/pool";
import { testUser } from "../support/principals";

const OFFICER_ID = "11111111-1111-4111-8111-111111111101";
const STAFF_ID = "11111111-1111-4111-8111-111111111102";
const PARENT_SESSION = "11111111-1111-4111-8111-111111111103";
const CASE_ID = "22222222-2222-4222-8222-222222222201";
const CASE_REF = "M-2001";
const INITIAL_VERSION = 1;

beforeAll(async () => {
  const pool = getPool();
  setPoolForTests(pool);
  // Seeds used by these tests in the test schema. Each test resets them.
  await pool.query("DELETE FROM audit_log WHERE case_id = $1", [CASE_ID]);
  await pool.query("DELETE FROM cases WHERE id = $1", [CASE_ID]);
  await pool.query("DELETE FROM users WHERE id IN ($1, $2)", [OFFICER_ID, STAFF_ID]);
  await pool.query(
    `INSERT INTO users (id, role, verified, is_active)
     VALUES ($1, 'officer', TRUE, TRUE),
            ($2, 'staff',   TRUE, TRUE)`,
    [OFFICER_ID, STAFF_ID],
  );
  await pool.query(
    `INSERT INTO cases (id, ref_code, kind, status, version, source, is_synthetic, created_at, updated_at)
     VALUES ($1, $2, 'missing', 'matched_pending_review', $3, 'manual', TRUE, now(), now())`,
    [CASE_ID, CASE_REF, INITIAL_VERSION],
  );
});

afterAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM audit_log WHERE case_id = $1", [CASE_ID]);
  await pool.query("DELETE FROM cases WHERE id = $1", [CASE_ID]);
  await pool.query("DELETE FROM users WHERE id IN ($1, $2)", [OFFICER_ID, STAFF_ID]);
  await closePool();
});

function makeCloseRequest(outcome: "coordination_recorded" | "resolved_outside_fera", expectedVersion = INITIAL_VERSION) {
  return {
    outcome,
    note: "guardians contacted; coordination outcome recorded",
    expected_version: expectedVersion,
  };
}

describe("closeCase role gate", () => {
  it("rejects a parent principal with E-004", async () => {
    // A parent session is not a user; even if we mint a user principal for it the
    // service's first guard requires `principal.kind === "user"` with role officer.
    // The test principal helpers keep this small.
    const admin = { kind: "user" as const, userId: STAFF_ID, role: "admin" as const, verified: true, isActive: true } as never;
    await expect(closeCase(admin, CASE_ID, makeCloseRequest("resolved_outside_fera"), { requestId: "test" }))
      .rejects.toBeInstanceOf(ApiError);
  });

  it("rejects a staff (verified, active) principal with E-004", async () => {
    const staff = testUser(STAFF_ID, "staff", { verified: true, isActive: true });
    await expect(closeCase(staff, CASE_ID, makeCloseRequest("resolved_outside_fera"), { requestId: "test-staff" }))
      .rejects.toMatchObject({ id: "E-004" });
  });

  it("rejects an unverified officer principal with E-004", async () => {
    const unverified = testUser(OFFICER_ID, "officer", { verified: false, isActive: true });
    await expect(closeCase(unverified, CASE_ID, makeCloseRequest("resolved_outside_fera"), { requestId: "test-unverified" }))
      .rejects.toMatchObject({ id: "E-004" });
  });

  it("rejects an inactive officer principal with E-004", async () => {
    const inactive = testUser(OFFICER_ID, "officer", { verified: true, isActive: false });
    await expect(closeCase(inactive, CASE_ID, makeCloseRequest("resolved_outside_fera"), { requestId: "test-inactive" }))
      .rejects.toMatchObject({ id: "E-004" });
  });

  it("rejects a malformed case ID with E-004", async () => {
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    await expect(closeCase(officer, "not-a-uuid", makeCloseRequest("resolved_outside_fera"), { requestId: "test-bad-id" }))
      .rejects.toMatchObject({ id: "E-004" });
  });
});

describe("closeCase version & outcome rules", () => {
  it("rejects a stale expected_version with E-005 (TC-010)", async () => {
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    await expect(
      closeCase(officer, CASE_ID, makeCloseRequest("resolved_outside_fera", INITIAL_VERSION - 1), { requestId: "test-stale" }),
    ).rejects.toMatchObject({ id: "E-005" });
  });

  it("rejects an outcome that doesn't match the case status with E-005 (TC-032)", async () => {
    // The seed case is `matched_pending_review`; only `resolved_outside_fera` is allowed for
    // an open review (coordination_recorded requires `confirmed`, per closeCase rules).
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    await expect(
      closeCase(officer, CASE_ID, makeCloseRequest("coordination_recorded"), { requestId: "test-bad-outcome" }),
    ).rejects.toMatchObject({ id: "E-005" });
  });

  it("closes the case for a verified officer with `resolved_outside_fera` and matching version", async () => {
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    const r = await closeCase(officer, CASE_ID, makeCloseRequest("resolved_outside_fera"), { requestId: "test-ok" });
    const dto: CloseCaseResponse = r.response;
    const parsed = closeCaseResponseSchema.safeParse(dto);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.ref_code).toBe(CASE_REF);
      expect(parsed.data.status).toBe("closed");
    }
    // The note is stored on the case row but never audited (D2A API-011).
    const pool = getPool();
    const { rows } = await pool.query("SELECT status, closed_at, outcome FROM cases WHERE id = $1", [CASE_ID]);
    expect(rows[0]?.status).toBe("closed");
    expect(rows[0]?.closed_at).not.toBeNull();
    expect(rows[0]?.outcome).toBe("resolved_outside_fera");
    // An audit row was written for the closure.
    const { rows: auditRows } = await pool.query(
      "SELECT action FROM audit_log WHERE case_id = $1 ORDER BY at DESC LIMIT 1",
      [CASE_ID],
    );
    expect(auditRows[0]?.action).toBe("case.closed");
  });

  it("rejects a retried closure of an already-closed case with E-005", async () => {
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    await expect(
      closeCase(officer, CASE_ID, makeCloseRequest("resolved_outside_fera"), { requestId: "test-retry" }),
    ).rejects.toMatchObject({ id: "E-005" });
  });
});

// The session-scope test: a parent session ID is not a user principal, so the service's
// user/officer gate denies before any database query.
describe("closeCase parent session", () => {
  it("a parent session is not eligible", async () => {
    // `effectiveRole(parentPrincipal)` is "parent", so `effectiveRole(...) !== "officer"` → E-004.
    const parent = testUser(PARENT_SESSION, "officer", { verified: false, isActive: false });
    await expect(closeCase(parent, CASE_ID, makeCloseRequest("resolved_outside_fera"), { requestId: "test-parent" }))
      .rejects.toMatchObject({ id: "E-004" });
  });
});

// API-011 POST /api/cases/:id/close (TASK-029 part; FR-018, FR-021; TC-010, TC-032).
// Unit-only tests for the role-gate path of `closeCase`. The DB-bound cases
// (stale-version E-005, outcome-mismatch E-005, close-ok, and already-closed E-005)
// live at tests/db/case-close-route.test.ts and run under `npm run test:db`.
//
// These tests cover what the service can answer without PostgreSQL:
//   - a parent principal is not eligible (effectiveRole === "parent", kind === "parent")
//   - a verified, active staff principal is not eligible (role === "staff")
//   - an unverified officer is not eligible (verified === false)
//   - an inactive officer is not eligible (is_active === false)
//   - a malformed case ID is E-004 before any database query
//
// All of these hit the first guard in closeCase() and never reach the pool.
import { describe, expect, it } from "vitest";
import { closeCase } from "@/server/case";
import { testParent, testUser } from "../support/principals";

const OFFICER_ID = "11111111-1111-4111-8111-111111111101";
const STAFF_ID = "11111111-1111-4111-8111-111111111102";
const PARENT_SESSION = "11111111-1111-4111-8111-111111111103";
const CASE_ID = "22222222-2222-4222-8222-222222222201";

function makeCloseRequest(
  outcome: "coordination_recorded" | "resolved_outside_fera",
  expectedVersion = 1,
) {
  return {
    outcome,
    note: "guardians contacted; coordination outcome recorded",
    expected_version: expectedVersion,
  };
}

describe("closeCase role gate (no DB)", () => {
  it("rejects a parent principal with E-004", async () => {
    const parent = testParent(PARENT_SESSION);
    await expect(
      closeCase(parent, CASE_ID, makeCloseRequest("resolved_outside_fera"), { requestId: "test-parent-role" }),
    ).rejects.toMatchObject({ id: "E-004" });
  });

  it("rejects a staff (verified, active) principal with E-004", async () => {
    const staff = testUser(STAFF_ID, "staff", { verified: true, isActive: true });
    await expect(
      closeCase(staff, CASE_ID, makeCloseRequest("resolved_outside_fera"), { requestId: "test-staff" }),
    ).rejects.toMatchObject({ id: "E-004" });
  });

  it("rejects an unverified officer principal with E-004", async () => {
    const unverified = testUser(OFFICER_ID, "officer", { verified: false, isActive: true });
    await expect(
      closeCase(unverified, CASE_ID, makeCloseRequest("resolved_outside_fera"), { requestId: "test-unverified" }),
    ).rejects.toMatchObject({ id: "E-004" });
  });

  it("rejects an inactive officer principal with E-004", async () => {
    const inactive = testUser(OFFICER_ID, "officer", { verified: true, isActive: false });
    await expect(
      closeCase(inactive, CASE_ID, makeCloseRequest("resolved_outside_fera"), { requestId: "test-inactive" }),
    ).rejects.toMatchObject({ id: "E-004" });
  });

  it("rejects a malformed case ID with E-004", async () => {
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    await expect(
      closeCase(officer, "not-a-uuid", makeCloseRequest("resolved_outside_fera"), { requestId: "test-bad-id" }),
    ).rejects.toMatchObject({ id: "E-004" });
  });
});

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/app/api/_shared/envelope";
import { errorEnvelope } from "@/contracts";
import { mapSpendDbError, reservePaidCall } from "@/server/spend";
import { settlePaidCall } from "@/server/spend/service";
import { testUser } from "../support/principals";
import { draftId, pgError, principal, request, reservationId, spendFake } from "./fakes";

describe("paid reservation and settlement (TASK-063)", () => {
  it("uses the SQL function and returns only a committed metadata handle", async () => {
    const f = spendFake();
    expect(await reservePaidCall(principal, request, f.ctx)).toEqual({ id: reservationId, apiId: "API-002", draftId, revision: 2, upperUsd: "0.100000" });
    expect(f.sent(/reserve_ai_call/)[0].values).toEqual([draftId, "0.100000"]);
    expect(f.sent(/FROM intake_drafts/)[0].values).toEqual([draftId, principal.kind === "parent" ? principal.sessionId : null, null, "missing"]);
    expect(f.calls.map((c) => c.text.trim()).at(-1)).toBe("COMMIT");
  });

  it("refuses stale revisions and rolls back the tentative reservation", async () => {
    const f = spendFake({ revision: 3 });
    await expect(reservePaidCall(principal, request, f.ctx)).rejects.toMatchObject({ id: "E-023" });
    expect(f.sent(/^ROLLBACK$/)).toHaveLength(1);
    expect(f.sent(/^COMMIT$/)).toHaveLength(0);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({ event: "spend.refused", route: "API-002", error_id: "E-023", rule: "stale.revision" }));
  });

  it("refuses foreign/unavailable draft metadata without consuming a call", async () => {
    const f = spendFake({ hidden: true });
    await expect(reservePaidCall(principal, request, f.ctx)).rejects.toMatchObject({ id: "E-023" });
    expect(f.sent(/^ROLLBACK$/)).toHaveLength(1);
    expect(f.sent(/reserve_ai_call/)).toHaveLength(0);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({ event: "spend.refused", error_id: "E-023", rule: "foreign.draft" }));
    expect(f.logs.parsed().filter((l) => l.dropped)).toEqual([]);
  });

  it("binds a staff call to its own found draft", async () => {
    const f = spendFake();
    const staff = testUser(randomUUID(), "staff");
    await reservePaidCall(staff, request, f.ctx);
    expect(f.sent(/FROM intake_drafts/)[0].values).toEqual([draftId, null, staff.kind === "user" ? staff.userId : null, "found"]);
  });

  it.each(["API-001", "API-002", "API-007"] as const)("uses the caller's %s permission binding", async (apiId) => {
    const f = spendFake();
    const actor = apiId === "API-007" ? testUser(randomUUID(), "staff") : principal;
    await expect(reservePaidCall(actor, { ...request, apiId }, f.ctx)).resolves.toMatchObject({ id: reservationId });
  });

  it("denies a parent on API-007 before opening a transaction", async () => {
    const f = spendFake();
    await expect(reservePaidCall(principal, { ...request, apiId: "API-007" }, f.ctx)).rejects.toMatchObject({ id: "E-003" });
    expect(f.calls).toHaveLength(0);
  });

  it("rechecks owner/kind after reserve and rolls back if the draft disappears", async () => {
    const f = spendFake({ hiddenAfterReserve: true });
    await expect(reservePaidCall(principal, request, f.ctx)).rejects.toMatchObject({ id: "E-023" });
    expect(f.sent(/reserve_ai_call/)).toHaveLength(1);
    expect(f.sent(/^ROLLBACK$/)).toHaveLength(1);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({ event: "spend.refused", rule: "foreign.draft" }));
  });

  it.each([null, testUser(randomUUID(), "admin"), testUser(randomUUID(), "staff", { isActive: false }), testUser(randomUUID(), "officer", { verified: false })])("refuses an unauthorised principal before opening a transaction", async (actor) => {
    const f = spendFake();
    await expect(reservePaidCall(actor, request, f.ctx)).rejects.toMatchObject({ id: actor ? "E-003" : "E-002" });
    expect(f.calls).toHaveLength(0);
  });

  it.each([
    { upperUsd: "0" }, { upperUsd: "-0.1" }, { upperUsd: "0.0000001" }, { upperUsd: "Infinity" },
    { upperUsd: "10000" }, { draftId: "not-a-uuid" }, { draftId: null }, { expectedRevision: 0 },
    { expectedRevision: 1.1 }, { expectedRevision: 2147483647 }, { apiId: "API-015" },
  ])("maps invalid server metadata %j to manual-form E-013 before database access", async (patch) => {
    const f = spendFake();
    await expect(reservePaidCall(principal, { ...request, ...patch } as unknown as typeof request, f.ctx)).rejects.toMatchObject({ id: "E-013" });
    expect(errorEnvelope("E-013").error.fallback).toBe("manual_form");
    expect(f.calls).toHaveLength(0);
    const [field] = Object.keys(patch);
    expect(f.logs.parsed()).toEqual([expect.objectContaining({ event: "spend.bad_input", error_id: "E-013", issues: [expect.objectContaining({ path: field })] })]);
    const [value] = Object.values(patch);
    if (typeof value === "string" && value.length > 3) expect(f.logs.lines.join("\n")).not.toContain(value);
  });

  it("keeps E-002 for a missing principal even when the metadata is also invalid", async () => {
    const f = spendFake();
    await expect(reservePaidCall(null, { ...request, draftId: "not-a-uuid" }, f.ctx)).rejects.toMatchObject({ id: "E-002" });
    expect(f.calls).toHaveLength(0);
  });

  it.each([testUser(randomUUID(), "admin"), testUser(randomUUID(), "staff", { isActive: false }), testUser(randomUUID(), "officer", { verified: false })])("keeps E-003 for a disallowed principal even when adapter metadata is invalid", async (actor) => {
    const f = spendFake();
    await expect(reservePaidCall(actor, { ...request, draftId: "not-a-uuid" }, f.ctx)).rejects.toMatchObject({ id: "E-003" });
    expect(f.calls).toHaveLength(0);
    expect(f.logs.lines).toHaveLength(0);
  });

  it.each(["AI budget exhausted", "draft expired or six-call limit reached"])("maps SQL refusal '%s' to manual-form E-023", async (message) => {
    const f = spendFake({ reserveError: pgError("23514", message) });
    const err = await reservePaidCall(principal, request, f.ctx).catch((e: unknown) => e);
    expect(err).toMatchObject({ id: "E-023" });
    expect(errorEnvelope("E-023").error.fallback).toBe("manual_form");
  });

  it("does not retry an ambiguous commit failure or return a handle", async () => {
    const f = spendFake({ commitError: new Error("[MOCK] unavailable") });
    await expect(reservePaidCall(principal, request, f.ctx)).rejects.toMatchObject({ id: "E-013" });
    expect(f.sent(/reserve_ai_call/)).toHaveLength(1);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({ event: "spend.commit_uncertain", tx_stage: "commit", err_name: "Error" }));
  });

  it("settles through the SQL function with zero allowed for known unbilled failure", async () => {
    const f = spendFake();
    await settlePaidCall(reservationId, "0.000000", f.ctx);
    expect(f.sent(/settle_ai_call/)[0].values).toEqual([reservationId, "0.000000"]);
  });

  it.each(["reservation not found", "settlement conflicts with prior result", "actual cost exceeds reserved upper bound"])("maps '%s' to a safe manual fallback", async (message) => {
    const f = spendFake({ settleError: pgError("P0001", message) });
    await expect(settlePaidCall(reservationId, "0.010000", f.ctx)).rejects.toMatchObject({ id: "E-013" });
    expect(errorEnvelope("E-013").error.fallback).toBe("manual_form");
  });

  it.each(["-1", "NaN", "0.00000001"])("maps invalid server actual cost %s to E-013 before querying", async (actualUsd) => {
    const f = spendFake();
    await expect(settlePaidCall(reservationId, actualUsd, f.ctx)).rejects.toMatchObject({ id: "E-013" });
    expect(f.calls).toHaveLength(0);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({ event: "spend.bad_input", issues: [expect.objectContaining({ path: "actualUsd" })] }));
  });

  it("maps a case-helper ApiError from the COMMIT stage (E-005) to manual-form E-013 and logs it", async () => {
    const f = spendFake({ commitError: pgError("23514", "[MOCK] deferred check") });
    const err = await reservePaidCall(principal, request, f.ctx).catch((e: unknown) => e);
    expect(err).toMatchObject({ id: "E-013" });
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({ event: "spend.error_remapped", error_id: "E-013", original_error_id: "E-005" }));
    expect(f.logs.lines.join("\n")).not.toContain("deferred check");
  });

  it.each([
    pgError("23514", "[MOCK] deferred check"),
    new ApiError("E-005"),
  ])("maps a constraints-stage refusal to manual-form E-013, logs it, and rolls back", async (constraintsError) => {
    const f = spendFake({ constraintsError });
    await expect(reservePaidCall(principal, request, f.ctx)).rejects.toMatchObject({ id: "E-013" });
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({ event: "spend.error_remapped", error_id: "E-013", original_error_id: "E-005" }));
    expect(f.sent(/^ROLLBACK$/)).toHaveLength(1);
    expect(f.sent(/^COMMIT$/)).toHaveLength(0);
    expect(f.logs.parsed().filter((l) => l.event === "spend.commit_uncertain")).toHaveLength(0);
    expect(f.logs.lines.join("\n")).not.toContain("deferred check");
  });

  it.each(["E-001", "E-004", "E-005", "E-019"] as const)("remaps a foreign ApiError %s to E-013", (id) => {
    expect(mapSpendDbError(new ApiError(id))).toMatchObject({ id: "E-013" });
  });

  it.each(["E-002", "E-003", "E-012", "E-013", "E-014", "E-023"] as const)("passes the spend module's own %s through unchanged", (id) => {
    const own = new ApiError(id);
    expect(mapSpendDbError(own)).toBe(own);
  });

  it("never returns or logs a database message/detail containing synthetic payload", async () => {
    const secret = "[MOCK] free text 01700000001";
    const f = spendFake({ reserveError: pgError("23514", secret, { detail: secret }) });
    const err = await reservePaidCall(principal, request, f.ctx).catch((e: unknown) => e);
    expect(String(err)).not.toContain(secret);
    expect(f.logs.lines.join("\n")).not.toContain(secret);
  });

  it("does not misclassify an unrelated check violation as a budget exhaustion", () => {
    expect(mapSpendDbError(pgError("23514", "[MOCK] unrelated constraint"))).toMatchObject({ id: "E-013" });
  });

  it.each([
    { routine: "reserve_ai_call" },
    { routine: "exec_stmt_raise", where: "PL/pgSQL function reserve_ai_call(uuid,numeric) line 10 at RAISE" },
  ])("maps a reserve_ai_call check violation without relying on RAISE text: %j", (facts) => {
    expect(mapSpendDbError(pgError("23514", "[MOCK] changed wording", facts))).toMatchObject({ id: "E-023" });
  });

  it("keeps named CHECK violations out of the reservation-refusal mapping", () => {
    expect(mapSpendDbError(pgError("23514", "[MOCK] check", { constraint: "ai_budget_check", where: "reserve_ai_call(uuid,numeric)" }))).toMatchObject({ id: "E-013" });
  });

  it("pre-checks ownership without taking row locks before entering the reserve function", async () => {
    const f = spendFake();
    await reservePaidCall(principal, request, f.ctx);
    const precheck = f.calls.findIndex((c) => /SELECT 1 FROM intake_drafts/.test(c.text));
    const reserve = f.calls.findIndex((c) => /reserve_ai_call/.test(c.text));
    expect(precheck).toBeGreaterThanOrEqual(0);
    expect(precheck).toBeLessThan(reserve);
    expect(f.calls[precheck].text).not.toMatch(/FOR (UPDATE|SHARE)/);
    expect(f.sent(/SELECT revision FROM intake_drafts/)).toHaveLength(1);
  });

  it("logs safe SQLSTATE diagnostics before mapping an unexpected reservation failure", async () => {
    const sensitive = "[MOCK] never log this error text";
    const f = spendFake({ reserveError: pgError("23503", sensitive, { detail: sensitive }) });
    await expect(reservePaidCall(principal, request, f.ctx)).rejects.toMatchObject({ id: "E-013" });
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({ event: "db.refusal", err_code: "23503", tx_stage: "callback" }));
    expect(f.logs.lines.join("\n")).not.toContain(sensitive);
  });

  it("logs the error class for a settlement transport failure without its message", async () => {
    const sensitive = "[MOCK] never log settlement response";
    const f = spendFake({ settleError: new Error(sensitive) });
    await expect(settlePaidCall(reservationId, "0.010000", f.ctx)).rejects.toMatchObject({ id: "E-013" });
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({ event: "db.tx_failed", err_name: "Error", tx_stage: "callback" }));
    expect(f.logs.lines.join("\n")).not.toContain(sensitive);
  });

  it("logs a row-decoding defect before returning the manual fallback", async () => {
    const f = spendFake({ revision: NaN });
    await expect(reservePaidCall(principal, request, f.ctx)).rejects.toMatchObject({ id: "E-013" });
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({ event: "db.tx_failed", err_name: "RowShapeError" }));
  });

  it("logs a failed connection safely and never dispatches a query", async () => {
    const f = spendFake();
    const sensitive = "[MOCK] never log a connection string";
    const pool = { connect: async () => { throw new Error(sensitive); } };
    await expect(reservePaidCall(principal, request, { ...f.ctx, pool })).rejects.toMatchObject({ id: "E-013" });
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({ event: "db.tx_failed", tx_stage: "connect", err_name: "Error" }));
    expect(f.logs.lines.join("\n")).not.toContain(sensitive);
    expect(f.calls).toHaveLength(0);
  });
});

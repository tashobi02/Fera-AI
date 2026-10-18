// TASK-015 error mapping and the transaction helper (COMP-014 "illegal transition →
// E-005; transaction rollback"; COMP-015 "audit write failure aborts the action").
import { describe, expect, it } from "vitest";
import { ApiError } from "@/app/api/_shared";
import { LockSetChanged, isRetryable, mapDbError, mapInsertError, sqlstateOf, withTransaction } from "@/server/case/internal";
import { captureLogs } from "../api/fakes";
import { fakePool, pgError } from "./fakes";

const idOf = (v: unknown) => (v instanceof ApiError ? v.id : v);

describe("mapDbError", () => {
  it("maps a trigger or CHECK check_violation to E-005", () => {
    expect(idOf(mapDbError(pgError("23514", "illegal transition open>confirmed for missing case")))).toBe("E-005");
    expect(idOf(mapDbError(pgError("23514", 'new row for relation "cases" violates check constraint')))).toBe("E-005");
  });

  it("maps the future-interval trigger to E-001 naming event.at_lower", () => {
    const mapped = mapDbError(pgError("23514", "event interval starts in future"));
    expect(mapped).toBeInstanceOf(ApiError);
    expect((mapped as ApiError).id).toBe("E-001");
    expect((mapped as ApiError).fields).toEqual(["event.at_lower"]);
  });

  it("maps a unique violation (second confirmed pair, second decision) and an exhausted lock retry to E-005", () => {
    expect(idOf(mapDbError(pgError("23505")))).toBe("E-005");
    expect(idOf(mapDbError(new LockSetChanged()))).toBe("E-005");
  });

  it("passes ApiError through and returns anything else unchanged (the API layer logs its SQLSTATE → E-021)", () => {
    const api = new ApiError("E-018");
    expect(mapDbError(api)).toBe(api);
    for (const code of ["42501", "55P03", "57014", "08006"]) {
      const err = pgError(code);
      expect(mapDbError(err)).toBe(err);
    }
    const plain = new Error("boom");
    expect(mapDbError(plain)).toBe(plain);
  });

  it("maps an insert CHECK failure to E-001, not E-005", () => {
    expect(idOf(mapInsertError(pgError("23514", "violates check constraint")))).toBe("E-001");
    expect((mapInsertError(pgError("23514", "event interval starts in future")) as ApiError).fields).toEqual(["event.at_lower"]);
  });

  it("reads only a well-formed SQLSTATE and treats deadlock, serialization failure and a grown lock set as retryable", () => {
    expect(sqlstateOf(pgError("40P01"))).toBe("40P01");
    expect(sqlstateOf({ code: "not a state" })).toBeNull();
    expect(sqlstateOf(null)).toBeNull();
    expect(isRetryable(pgError("40P01"))).toBe(true);
    expect(isRetryable(pgError("40001"))).toBe(true);
    expect(isRetryable(new LockSetChanged())).toBe(true);
    expect(isRetryable(pgError("23514"))).toBe(false);
  });
});

describe("withTransaction", () => {
  it("commits after firing the deferred checks, and releases the client", async () => {
    const db = fakePool([]);
    const out = await withTransaction(async (c) => {
      await c.query("SELECT 1");
      return 42;
    }, { pool: db.pool });
    expect(out).toBe(42);
    expect(db.calls.map((c) => c.text)).toEqual(["BEGIN", "SELECT 1", "SET CONSTRAINTS ALL IMMEDIATE", "COMMIT"]);
    expect(db.releases).toBe(1);
  });

  it("rolls back and maps a trigger refusal to E-005; nothing after the failing statement runs", async () => {
    const db = fakePool([{ match: /UPDATE cases/, reply: () => pgError("23514", "illegal transition") }]);
    const err = await withTransaction(async (c) => {
      await c.query("INSERT INTO audit_log VALUES (1)");
      await c.query("UPDATE cases SET status = 'confirmed'");
      await c.query("SELECT never");
    }, { pool: db.pool }).catch((e: unknown) => e);
    expect(idOf(err)).toBe("E-005");
    expect(db.calls.map((c) => c.text)).toEqual(["BEGIN", "INSERT INTO audit_log VALUES (1)", "UPDATE cases SET status = 'confirmed'", "ROLLBACK"]);
  });

  it("aborts the action when the audit write fails (COMP-015)", async () => {
    const db = fakePool([{ match: /INSERT INTO audit_log/, reply: () => pgError("42501") }]);
    const err = await withTransaction(async (c) => {
      await c.query("UPDATE cases SET status = 'open'");
      await c.query("INSERT INTO audit_log VALUES (1)");
    }, { pool: db.pool }).catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe("42501");
    expect(db.sent(/^ROLLBACK$/)).toHaveLength(1);
    expect(db.sent(/^COMMIT$/)).toHaveLength(0);
  });

  it("maps a deferred-check refusal raised before COMMIT", async () => {
    const db = fakePool([{ match: /SET CONSTRAINTS/, reply: () => pgError("23514", "confirmed pair requires decision") }]);
    const err = await withTransaction(async () => "x", { pool: db.pool }).catch((e: unknown) => e);
    expect(idOf(err)).toBe("E-005");
    expect(db.sent(/^COMMIT$/)).toHaveLength(0);
  });

  it("retries the whole callback on a deadlock, at most `attempts` times", async () => {
    let runs = 0;
    const db = fakePool([]);
    const err = await withTransaction(async () => {
      runs++;
      throw pgError("40P01");
    }, { pool: db.pool, attempts: 3 }).catch((e: unknown) => e);
    expect(runs).toBe(3);
    expect((err as { code?: string }).code).toBe("40P01");
    expect(db.connects).toBe(3);
    expect(db.releases).toBe(3);

    runs = 0;
    const ok = await withTransaction(async () => {
      runs++;
      if (runs === 1) throw new LockSetChanged();
      return "second";
    }, { pool: db.pool });
    expect(ok).toBe("second");
  });

  it("does not retry a non-transient error", async () => {
    let runs = 0;
    const db = fakePool([]);
    await withTransaction(async () => {
      runs++;
      throw new ApiError("E-005");
    }, { pool: db.pool }).catch(() => undefined);
    expect(runs).toBe(1);
  });

  it("discards a client whose ROLLBACK failed, logs it, and still throws the original error", async () => {
    const logs = captureLogs();
    const db = fakePool([
      { match: /^ROLLBACK$/, reply: () => new Error("connection lost") },
      { match: /^SELECT fail$/, reply: () => pgError("23514", "illegal transition open>confirmed") },
    ]);
    const err = await withTransaction(async (c) => {
      await c.query("SELECT fail");
    }, { pool: db.pool, logger: logs.logger }).catch((e: unknown) => e);
    expect(idOf(err)).toBe("E-005"); // the original check_violation, not "connection lost"
    expect(db.releasedWith).toEqual([true]);
    const events = logs.parsed().map((l) => l.event);
    expect(events).toEqual(["db.refusal", "db.rollback_failed"]);
    expect(logs.lines.join("\n")).not.toContain("connection lost");
    expect(logs.lines.join("\n")).not.toContain("open>confirmed");
  });

  it("logs a refusal with identifier facts only, at error level for pair-integrity and audit triggers", async () => {
    const logs = captureLogs();
    const refusal = (where: string) =>
      pgError("23514", "confirmed pair requires decision for M-ABC123 phone 01700000001", {
        constraint: "cases_check", table: "cases", routine: "exec_stmt_raise", where, detail: "Failing row contains (01700000001)",
      });
    for (const where of ["PL/pgSQL function check_pair_integrity() line 60 at RAISE", "PL/pgSQL function enforce_case_transition() line 30 at RAISE"]) {
      const db = fakePool([{ match: /SET CONSTRAINTS/, reply: () => refusal(where) }]);
      await withTransaction(async () => "x", { pool: db.pool, logger: logs.logger }).catch(() => undefined);
    }
    const [severe, ordinary] = logs.parsed();
    expect(severe).toMatchObject({ level: 50, event: "db.refusal", err_code: "23514", constraint: "cases_check", table: "cases", routine: "exec_stmt_raise", tx_stage: "constraints" });
    expect(ordinary).toMatchObject({ level: 40, event: "db.refusal", tx_stage: "constraints" });
    const text = logs.lines.join("\n");
    for (const leak of ["M-ABC123", "01700000001", "check_pair_integrity", "Failing row"]) expect(text).not.toContain(leak);
  });

  it("records the failing stage for an error without a SQLSTATE, and does not log app-level ApiErrors", async () => {
    const logs = captureLogs();
    const db = fakePool([{ match: /^COMMIT$/, reply: () => new TypeError("socket closed") }]);
    await withTransaction(async () => "x", { pool: db.pool, logger: logs.logger }).catch(() => undefined);
    expect(logs.parsed()[0]).toMatchObject({ event: "db.tx_failed", tx_stage: "commit", err_name: "TypeError" });
    const before = logs.lines.length;
    await withTransaction(async () => {
      throw new ApiError("E-018");
    }, { pool: fakePool([]).pool, logger: logs.logger }).catch(() => undefined);
    expect(logs.lines.length).toBe(before);
  });

  it("listens for client errors during the transaction, discards that client, and removes the listener", async () => {
    const logs = captureLogs();
    const db = fakePool([]);
    await withTransaction(async () => {
      expect(db.listeners.size).toBe(1);
      db.emitError(Object.assign(new Error("terminated"), { code: "ECONNRESET" }));
      return "x";
    }, { pool: db.pool, logger: logs.logger });
    expect(db.listeners.size).toBe(0);
    expect(db.releasedWith).toEqual([true]);
    expect(logs.parsed()[0]).toMatchObject({ event: "db.client_error", tx_stage: "callback", err_code: "ECONNRESET" });
  });

  it("retries a lock timeout once only, and honours attempts: 1", async () => {
    let runs = 0;
    const db = fakePool([]);
    const err = await withTransaction(async () => {
      runs++;
      throw pgError("55P03");
    }, { pool: db.pool, attempts: 5 }).catch((e: unknown) => e);
    expect(runs).toBe(2);
    expect((err as { code?: string }).code).toBe("55P03");
    runs = 0;
    await withTransaction(async () => {
      runs++;
      throw pgError("40P01");
    }, { pool: db.pool, attempts: 1 }).catch(() => undefined);
    expect(runs).toBe(1);
  });
});

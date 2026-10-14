// TASK-015 error mapping and the transaction helper (COMP-014 "illegal transition →
// E-005; transaction rollback"; COMP-015 "audit write failure aborts the action").
import { describe, expect, it } from "vitest";
import { ApiError } from "@/app/api/_shared";
import { LockSetChanged, isRetryable, mapDbError, mapInsertError, sqlstateOf, withTransaction } from "@/server/case";
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

  it("discards a client whose ROLLBACK failed", async () => {
    const released: unknown[] = [];
    const client = {
      async query(text: string) {
        if (text === "ROLLBACK") throw new Error("connection lost");
        if (text === "SELECT fail") throw pgError("23514");
        return { rows: [] };
      },
      release(arg?: unknown) {
        released.push(arg);
      },
    };
    const pool = { connect: async () => client as never };
    await withTransaction(async (c) => {
      await c.query("SELECT fail");
    }, { pool }).catch(() => undefined);
    expect(released).toEqual([true]);
  });
});

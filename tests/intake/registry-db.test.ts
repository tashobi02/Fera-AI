// Tests for the DB-backed draft registry's error observability (BLOCK B5').
//
// Scope: the `create()` catch in `createDbDraftRegistry` previously collapsed
// every DB error to a single `E-021` with only `err_name` in the log entry,
// which made a `23505` unique-id collision indistinguishable from a `55P03`
// advisory-lock timeout or a connection outage. The fix enriches the
// `db.tx_failed` log with the 5-char SQLSTATE via `sqlstateOf` from
// `@/server/case/errors` so operators can split the classes after the fact.
// The public error stays `E-021`: re-using E-019 would falsely claim
// "draft expired", and no new envelope field is introduced (B5' is
// observability only).
//
// We assert on the in-memory log sink (the same `createLogger` the route
// uses) so the captured entry is exactly what the pino-shaped JSON line
// would be in production, minus process.stdout. The child-payload message
// of the fake pg error is checked to never appear in the captured line.
//
// We do NOT assert a retry: the brief notes that a bounded retry on a
// known id-collision is unnecessary and speculative. The DB has the
// canonical UNIQUE (intake_drafts.id), and the orchestrator surfaces the
// single failure to the route.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import {
  createDbDraftRegistry,
  type DbRegistryOptions,
  type DraftRegistry,
} from "@/server/intake/registry";
import { createLogger, type LogEntry } from "@/app/api/_shared/log";
import { sqlstateOf } from "@/server/case/errors";
import { testParent } from "../support/principals";
import { createDraftSigner, verifyDraftToken } from "@/server/intake/registry";

const SECRET = Buffer.from("0123456789abcdef0123456789abcdef");

// A fake pg-style error. `code` is the SQLSTATE; the rest is payload that
// MUST never reach the log line. The child payload message includes
// "phone 01712345678" and a token-shaped string so a leak would show up
// in the captured sink.
function fakePgError(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.name = "PgError";
  err.code = code;
  return err;
}

// Minimal PoolLike: `connect` is exercised by `create()`, `query` is exercised
// by `get()` / `reload()`. The fake `client.query` is routed through a small
// dispatch so the test can decide which step throws and with what code. The
// inner client is typed as the real `PoolClient` so the connect() return
// satisfies the registry's seam without any escape hatches.
type ClientDispatch = (sql: string) => Promise<unknown>;

function makeFakePool(dispatch: ClientDispatch): {
  pool: Pick<Pool, "query" | "connect">;
  releases: { count: number };
} {
  const releases = { count: 0 };
  // pg's Pool.query is heavily overloaded (string, QueryConfig, Submittable);
  // the registry only ever passes a string, so the fake exposes the
  // string-only overload and is typed against pg's `Pool` to keep the seam
  // honest. The dispatch result is what the test scripted for that step.
  const query = async (sql: string): Promise<unknown> => dispatch(sql);
  const pool: Pick<Pool, "query" | "connect"> = {
    query: query as Pool["query"],
    async connect() {
      const client = {
        query: query as PoolClient["query"],
        release() {
          releases.count += 1;
        },
      };
      return client as PoolClient;
    },
  };
  return { pool, releases };
}

function makeRegistry(opts: {
  pool: DbRegistryOptions["pool"];
  sink: (line: string) => void;
}): { registry: DraftRegistry } {
  const logger = createLogger(opts.sink);
  // The registry's logger seam takes a contravariant `object` entry. The
  // runtime `createLogger` accepts the wider `LogEntry` shape, so the only
  // honest port is to forward each method with an entry-typed parameter and
  // rely on the registry's own call site to pass a `LogEntry`-shaped object.
  const registryLogger: NonNullable<DbRegistryOptions["logger"]> = {
    info: (entry) => logger.info(entry as Parameters<typeof logger.info>[0]),
    warn: (entry) => logger.warn(entry as Parameters<typeof logger.warn>[0]),
    error: (entry) => logger.error(entry as Parameters<typeof logger.error>[0]),
  };
  const registry = createDbDraftRegistry({
    signer: createDraftSigner(SECRET),
    verify: (token, kind, principal) => verifyDraftToken(SECRET, token, kind, principal),
    pool: opts.pool,
    logger: registryLogger,
  });
  return { registry };
}

function readEntry(sink: string): LogEntry {
  // The sink writes a single JSON line per `logger.error` call. Strip
  // pino's level/time keys; the test asserts on the payload.
  const parsed = JSON.parse(sink) as LogEntry & { level: number; time: number };
  return parsed;
}

describe("createDbDraftRegistry — create() error observability (BLOCK B5')", () => {
  it("logs the SQLSTATE for a 23505 unique-id collision and still returns E-021", async () => {
    const childPayload = "duplicate key value violates unique constraint \"intake_drafts_pkey\" for child 01712345678 token=ABCDEFGHIJ";
    const calls: string[] = [];
    const captured: string[] = [];
    const { pool, releases } = makeFakePool(async (sql) => {
      calls.push(sql);
      if (sql.startsWith("BEGIN")) return { rows: [] };
      if (sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [] };
      if (sql.startsWith("SELECT count(*)")) return { rows: [{ count: "0" }] };
      if (sql.startsWith("INSERT INTO intake_drafts")) {
        throw fakePgError("23505", childPayload);
      }
      if (sql === "ROLLBACK") return { rows: [] };
      throw new Error(`unexpected SQL in test: ${sql}`);
    });
    const { registry } = makeRegistry({ pool, sink: (line) => captured.push(line) });

    const result = await registry.create({ kind: "missing", principal: testParent(randomUUID()), payloadHash: null });

    // Public envelope is unchanged: E-021 only. E-019 would falsely claim
    // expiry; the brief says do not introduce that.
    expect(result).toEqual({ ok: false, errorId: "E-021" });
    expect(captured).toHaveLength(1);

    const entry = readEntry(captured[0]);
    expect(entry.event).toBe("db.tx_failed");
    expect(entry.tx_stage).toBe("callback");
    expect(entry.err_code).toBe("23505");
    expect(entry.err_name).toBe("PgError");

    // The child-payload message — and the child phone + token string that
    // ride along in it — must never reach the log line, even though the
    // raw `err.message` would have leaked them.
    const line = captured[0];
    expect(line).not.toContain("01712345678");
    expect(line).not.toContain("ABCDEFGHIJ");
    expect(line).not.toContain("intake_drafts_pkey");
    expect(line).not.toContain("duplicate key value");

    // ROLLBACK was attempted and the client was released.
    expect(calls).toContain("ROLLBACK");
    expect(releases.count).toBe(1);
  });

  it("logs the SQLSTATE for a 55P03 lock-not-available and still returns E-021", async () => {
    const childPayload = "could not obtain lock on row in relation \"intake_drafts\" for child 01987654321";
    const captured: string[] = [];
    const { pool, releases } = makeFakePool(async (sql) => {
      if (sql === "BEGIN") return { rows: [] };
      if (sql.startsWith("SELECT pg_advisory_xact_lock")) {
        throw fakePgError("55P03", childPayload);
      }
      if (sql === "ROLLBACK") return { rows: [] };
      throw new Error(`unexpected SQL: ${sql}`);
    });
    const { registry } = makeRegistry({ pool, sink: (line) => captured.push(line) });

    const result = await registry.create({ kind: "missing", principal: testParent(randomUUID()), payloadHash: null });

    expect(result).toEqual({ ok: false, errorId: "E-021" });
    expect(captured).toHaveLength(1);
    const entry = readEntry(captured[0]);
    expect(entry.event).toBe("db.tx_failed");
    expect(entry.tx_stage).toBe("callback");
    expect(entry.err_code).toBe("55P03");
    expect(entry.err_name).toBe("PgError");
    expect(captured[0]).not.toContain("01987654321");
    expect(releases.count).toBe(1);
  });

  it("logs a 23514 check-violation SQLSTATE (per B3 reconciliation) and still returns E-021", async () => {
    // spend/errors.ts already maps 23514 from reserve_ai_call to E-023, but
    // B3 reconciliation confirmed the registry's own `create()` did not
    // classify check_violation. The fix here only adds observability:
    // the public error stays E-021 so the route can keep its fail-closed
    // posture. This test pins the operator-visible SQLSTATE.
    const captured: string[] = [];
    const { pool } = makeFakePool(async (sql) => {
      if (sql === "BEGIN") return { rows: [] };
      if (sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [] };
      if (sql.startsWith("SELECT count(*)")) return { rows: [{ count: "0" }] };
      if (sql.startsWith("INSERT INTO intake_drafts")) {
        throw fakePgError("23514", "new row for relation \"intake_drafts\" violates check constraint \"intake_drafts_check_kind\"");
      }
      if (sql === "ROLLBACK") return { rows: [] };
      throw new Error(`unexpected SQL: ${sql}`);
    });
    const { registry } = makeRegistry({ pool, sink: (line) => captured.push(line) });

    const result = await registry.create({ kind: "missing", principal: testParent(randomUUID()), payloadHash: null });
    expect(result).toEqual({ ok: false, errorId: "E-021" });
    expect(captured).toHaveLength(1);
    const entry = readEntry(captured[0]);
    expect(entry.err_code).toBe("23514");
    // The check-constraint name in the child message must not leak.
    expect(captured[0]).not.toContain("intake_drafts_check_kind");
  });

  it("falls back to a child-payload-free entry when the error has no SQLSTATE", async () => {
    // pg pool exhaustion surfaces as EAI_AGAIN or a NodeJS error without a
    // `code` of the 5-char SQLSTATE form. The fix must still log the
    // event, but without inventing a SQLSTATE.
    const captured: string[] = [];
    const { pool } = makeFakePool(async (sql) => {
      if (sql === "BEGIN") return { rows: [] };
      if (sql.startsWith("SELECT pg_advisory_xact_lock")) {
        const err = new Error("connect ECONNREFUSED 127.0.0.1:5432 for child 01555555555") as Error & { code?: string };
        err.name = "Error";
        err.code = "ECONNREFUSED";
        throw err;
      }
      if (sql === "ROLLBACK") return { rows: [] };
      throw new Error(`unexpected SQL: ${sql}`);
    });
    const { registry } = makeRegistry({ pool, sink: (line) => captured.push(line) });

    const result = await registry.create({ kind: "missing", principal: testParent(randomUUID()), payloadHash: null });
    expect(result).toEqual({ ok: false, errorId: "E-021" });
    expect(captured).toHaveLength(1);
    const entry = readEntry(captured[0]);
    expect(entry.event).toBe("db.tx_failed");
    // sqlstateOf returns null for ECONNREFUSED (3 letters, not 5 chars
    // matching the SQLSTATE pattern). The fix must not log a fake
    // SQLSTATE; the absence of err_code is the honest signal.
    expect(entry.err_code).toBeUndefined();
    expect(captured[0]).not.toContain("01555555555");
    expect(captured[0]).not.toContain("ECONNREFUSED");
  });

  it("sqlstateOf accepts only strict 5-char SQLSTATEs (helper-level invariant)", () => {
    // Regression guard for the allowlist: a 3-letter code or a 6-letter
    // string must not be promoted into a SQLSTATE.
    expect(sqlstateOf(fakePgError("23505", "x"))).toBe("23505");
    expect(sqlstateOf(fakePgError("55P03", "x"))).toBe("55P03");
    expect(sqlstateOf({ code: "ECONNREFUSED" })).toBeNull();
    expect(sqlstateOf({ code: "235050" })).toBeNull();
    expect(sqlstateOf({ code: "abc" })).toBeNull();
    expect(sqlstateOf(new Error("no code"))).toBeNull();
    expect(sqlstateOf(null)).toBeNull();
  });

  it("get() and reload() surface a database outage as a thrown error, not as a misleading null/E-019", async () => {
    // Per the brief: do not silently map a connection outage to "draft
    // expired" (E-019). The current behaviour is to let the query throw;
    // the route catches and answers with its own E-021 envelope. This
    // test pins that contract so a future regression does not collapse
    // outages into a "null → E-019" path.
    const outageChildPayload = "connection terminated for child 01111111111";
    const seen: string[] = [];
    const fakePool: DbRegistryOptions["pool"] = {
      // pg's Pool.query is heavily overloaded; only the string overload is
      // exercised by get()/reload(). Typed against pg's `Pool` so the seam
      // is honest.
      query: (async (sql: string): Promise<never> => {
        seen.push(sql);
        const err = new Error(outageChildPayload) as Error & { code?: string };
        err.name = "PgError";
        err.code = "08006"; // connection_failure — a real SQLSTATE
        throw err;
      }) as Pool["query"],
      // The outage path here only exercises get()/reload() (which use
      // pool.query), but the registry's PoolLike seam requires both methods.
      // A minimal connect stub is the honest port — a throw here would
      // accidentally flip the test onto a different code path.
      async connect(): Promise<PoolClient> {
        throw new Error("outage fake pool never connects");
      },
    };
    const { registry } = makeRegistry({ pool: fakePool, sink: () => undefined });

    await expect(registry.get("00000000-0000-4000-8000-000000000000")).rejects.toThrow();
    expect(seen.length).toBe(1);
    await expect(registry.reload("00000000-0000-4000-8000-000000000000")).rejects.toThrow();
    // reload delegates to get — a single SELECT either way.
    expect(seen.length).toBe(2);
  });
});

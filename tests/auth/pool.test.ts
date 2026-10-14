// TASK-006: lazy fera_app pool (src/server/db/pool.ts). No connection is opened here.
import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseConfigError, closePool, getPool, setPoolForTests } from "@/server/db/pool";

afterEach(async () => {
  setPoolForTests(null);
  await closePool();
});

describe("database pool", () => {
  it("reads DATABASE_URL at call time and refuses to start without it", () => {
    expect(() => getPool({})).toThrow(DatabaseConfigError);
    expect(() => getPool({})).toThrow("DATABASE_URL is not set");
  });

  it("creates one lazy pool with a connect timeout and no statement_timeout override", async () => {
    const pool = getPool({ DATABASE_URL: "postgresql://fera_app:synthetic@127.0.0.1:1/fera_unused" });
    expect(getPool({})).toBe(pool);
    const options = (pool as unknown as { options: Record<string, unknown> }).options;
    expect(options.connectionTimeoutMillis).toBe(5000);
    expect(options.max).toBe(5);
    expect(options.statement_timeout).toBeUndefined();
    expect(pool.totalCount).toBe(0);
    await closePool();
    expect(() => getPool({})).toThrow(DatabaseConfigError);
  });

  it("lets tests inject a pool, which closePool leaves to its owner", async () => {
    const injected = new Pool({ connectionString: "postgresql://fera_app:synthetic@127.0.0.1:1/fera_unused" });
    setPoolForTests(injected);
    expect(getPool({})).toBe(injected);
    await closePool();
    expect(injected.ended).toBe(false);
    await injected.end();
  });
});

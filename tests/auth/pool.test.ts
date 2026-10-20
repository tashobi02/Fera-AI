// TASK-006: lazy fera_app pool (src/server/db/pool.ts). No connection is opened here.
import { Pool } from "pg";
import { rootCertificates } from "node:tls";
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
    expect(options.query_timeout).toBe(31000);
    expect(options.keepAlive).toBe(true);
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

  it("uses a supplied CA with full verification even when the URL specifies sslmode", () => {
    const certificate = rootCertificates[0];
    const pool = getPool({
      DATABASE_URL: "postgresql://fera_app:synthetic@example.invalid:6543/postgres?sslmode=require&application_name=fera",
      DATABASE_SSL_CA: certificate,
    });
    const options = pool.options;
    expect(options.ssl).toEqual({ ca: certificate, rejectUnauthorized: true });
    const url = new URL(options.connectionString!);
    expect(url.searchParams.has("sslmode")).toBe(false);
    expect(url.searchParams.get("application_name")).toBe("fera");
  });

  it("accepts escaped PEM newlines from an environment variable", () => {
    const certificate = rootCertificates[0];
    const pool = getPool({
      DATABASE_URL: "postgresql://fera_app:synthetic@example.invalid:6543/postgres",
      DATABASE_SSL_CA: certificate.replace(/\n/g, "\\n"),
    });
    expect(pool.options.ssl).toEqual({ ca: certificate, rejectUnauthorized: true });
  });

  it("rejects a malformed CA before creating a pool without echoing it", () => {
    expect(() => getPool({
      DATABASE_URL: "postgresql://fera_app:synthetic@example.invalid:6543/postgres?sslmode=require",
      DATABASE_SSL_CA: "synthetic-invalid-certificate",
    })).toThrow("DATABASE_SSL_CA must contain a valid CA certificate");
  });

  it("refuses conflicting SSL options instead of allowing the URL to override the CA", () => {
    expect(() => getPool({
      DATABASE_URL: "postgresql://fera_app:synthetic@example.invalid:6543/postgres?sslmode=disable",
      DATABASE_SSL_CA: rootCertificates[0],
    })).toThrow("DATABASE_SSL_CA conflicts with DATABASE_URL SSL options");
  });
});

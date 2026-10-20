// Application database pool (TASK-006, used by TASK-015 onwards). Owner: Mahim.
//
// - Created lazily on first use from DATABASE_URL, read at call time, so `next build`
//   never needs a database and the URL is never logged. The app connects as the
//   restricted `fera_app` role (db/roles.sql), never the owner or a superuser.
// - No statement_timeout / lock_timeout here: the role settings (30 s / 5 s / 60 s idle in
//   transaction) apply. Passing them as pool options would override the role.
// - Payload redaction (API-016) uses a separate pool from FERA_REDACTOR_DATABASE_URL as
//   `fera_redactor` (src/server/admin/redact.ts takes its client); it is not wired here.
// - Tests inject their own pool with setPoolForTests().
import { X509Certificate } from "node:crypto";
import { Pool, type PoolConfig } from "pg";
import { createLogger, describeError } from "@/app/api/_shared/log";

const CONNECT_TIMEOUT_MS = 5_000;
// Client-side backstop just above the fera_app statement_timeout (30 s), so the server
// cancels first and a dead connection never hangs a request (no client-side value is
// sent to the server, so the role setting stays authoritative).
const QUERY_TIMEOUT_MS = 31_000;
const IDLE_TIMEOUT_MS = 30_000;
// Per server instance. fera_app has CONNECTION LIMIT 40 across all instances.
const MAX_CLIENTS = 5;

type PoolSlot = { pool: Pool | null; injected: boolean };
// globalThis survives dev hot reloads, so a reload does not leak a pool per edit.
const slot: PoolSlot = ((globalThis as { __feraAppPool?: PoolSlot }).__feraAppPool ??= { pool: null, injected: false });

export class DatabaseConfigError extends Error {
  constructor() {
    super("DATABASE_URL is not set");
    this.name = "DatabaseConfigError";
  }
}

function connectionOptions(connectionString: string, rawCa: string | undefined): PoolConfig {
  if (!rawCa) return { connectionString };
  const ca = rawCa.replace(/\\n/g, "\n");
  try {
    if (!new X509Certificate(ca).ca) throw new Error("not a CA");
  } catch {
    throw new Error("DATABASE_SSL_CA must contain a valid CA certificate");
  }
  const url = new URL(connectionString);
  const mode = url.searchParams.get("sslmode");
  const conflictingOption = [...url.searchParams.keys()].some(
    (key) => (key.startsWith("ssl") && key !== "sslmode") || key === "uselibpqcompat",
  );
  if (conflictingOption || (mode !== null && !["require", "verify-ca", "verify-full"].includes(mode))) {
    throw new Error("DATABASE_SSL_CA conflicts with DATABASE_URL SSL options");
  }
  url.searchParams.delete("sslmode");
  return { connectionString: url.href, ssl: { ca, rejectUnauthorized: true } };
}

export function getPool(env: Record<string, string | undefined> = process.env): Pool {
  if (slot.pool) return slot.pool;
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new DatabaseConfigError();
  const pool = new Pool({
    ...connectionOptions(connectionString, env.DATABASE_SSL_CA),
    max: MAX_CLIENTS,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    keepAlive: true,
    application_name: "fera-app",
  });
  // An idle client error (server restart, network drop) must not crash the process.
  const logger = createLogger();
  pool.on("error", (err) => logger.error({ event: "db.pool_error", ...describeError(err) }));
  slot.pool = pool;
  slot.injected = false;
  return pool;
}

// Test-only seam: use `pool` (or none) instead of the DATABASE_URL pool. The caller
// owns an injected pool and ends it itself.
export function setPoolForTests(pool: Pool | null): void {
  slot.pool = pool;
  slot.injected = pool !== null;
}

// Ends the lazily created pool (scripts, graceful shutdown). An injected pool is left alone.
export async function closePool(): Promise<void> {
  const { pool, injected } = slot;
  slot.pool = null;
  slot.injected = false;
  if (pool && !injected) await pool.end();
}

// Payload-redaction database pool (TASK-032; API-016, D2A "admin route plus restricted
// redaction DB role"). Owner: Mahim.
//
// - Created lazily on first use from FERA_REDACTOR_DATABASE_URL, read at call time, so
//   `next build` never needs a database and the URL is never logged. It must connect as
//   the restricted `fera_redactor` role (db/roles.sql); redactCases() checks
//   current_user and fails closed otherwise.
// - Separate from the fera_app pool (src/server/db/pool.ts), which cannot execute
//   redact_case(). Two clients per instance: redaction runs one case per transaction.
// - Tests inject their own pool with setRedactorPoolForTests().
import { Pool } from "pg";
import { createLogger, describeError } from "@/app/api/_shared/log";

const CONNECT_TIMEOUT_MS = 5_000;
// Client-side backstop just above the fera_redactor statement_timeout (60 s).
const QUERY_TIMEOUT_MS = 61_000;
const IDLE_TIMEOUT_MS = 30_000;
const MAX_CLIENTS = 2;

type PoolSlot = { pool: Pool | null; injected: boolean };
const slot: PoolSlot = ((globalThis as { __feraRedactorPool?: PoolSlot }).__feraRedactorPool ??= { pool: null, injected: false });

export class RedactorConfigError extends Error {
  constructor() {
    super("FERA_REDACTOR_DATABASE_URL is not set");
    this.name = "RedactorConfigError";
  }
}

export function getRedactorPool(env: Record<string, string | undefined> = process.env): Pool {
  if (slot.pool) return slot.pool;
  const connectionString = env.FERA_REDACTOR_DATABASE_URL;
  if (!connectionString) throw new RedactorConfigError();
  const pool = new Pool({
    connectionString,
    max: MAX_CLIENTS,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    keepAlive: true,
    application_name: "fera-redactor",
  });
  const logger = createLogger();
  pool.on("error", (err) => logger.error({ event: "db.pool_error", ...describeError(err) }));
  slot.pool = pool;
  slot.injected = false;
  return pool;
}

// Test-only seam. The caller owns an injected pool and ends it itself.
export function setRedactorPoolForTests(pool: Pool | null): void {
  slot.pool = pool;
  slot.injected = pool !== null;
}

export async function closeRedactorPool(): Promise<void> {
  const { pool, injected } = slot;
  slot.pool = null;
  slot.injected = false;
  if (pool && !injected) await pool.end();
}

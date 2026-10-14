// Transaction helper for the case service (TASK-015, COMP-014).
//
//   const row = await withTransaction(async (client) => { …; return row; });
//
// - One pooled client, BEGIN … COMMIT, READ COMMITTED (the server default). Row locks
//   are taken explicitly (lock.ts), in ascending UUID order.
// - Before COMMIT, SET CONSTRAINTS ALL IMMEDIATE fires the deferred pair-integrity
//   triggers inside the transaction, so their refusal is mapped like any other error.
// - On any error: ROLLBACK, then retry the whole callback for a transient conflict
//   (deadlock, serialization failure, a lock set that grew) up to `attempts` times;
//   otherwise throw mapDbError(err) (check_violation → E-005 and so on, errors.ts).
//   The callback must therefore be safe to run again from the start: no side effects
//   outside the database.
// - A client whose ROLLBACK failed is discarded, not returned to the pool.
import type { PoolClient } from "pg";
import { getPool } from "@/server/db/pool";
import { isRetryable, mapDbError } from "./errors";

export type Connectable = { connect(): Promise<PoolClient> };

export type TxOptions = { pool?: Connectable; attempts?: number };

export const DEFAULT_TX_ATTEMPTS = 3;

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>, opts: TxOptions = {}): Promise<T> {
  const pool = opts.pool ?? getPool();
  const attempts = Math.max(1, opts.attempts ?? DEFAULT_TX_ATTEMPTS);
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    let broken = false;
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {
        broken = true;
      });
      if (attempt < attempts && isRetryable(err)) continue;
      throw mapDbError(err);
    } finally {
      client.release(broken);
    }
  }
}

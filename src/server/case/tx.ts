// Transaction helper for the case service (TASK-015, COMP-014).
//
//   const row = await withTransaction(async (client) => { …; return row; });
//
// - One pooled client, BEGIN … COMMIT, READ COMMITTED (the server default). Row locks
//   are taken explicitly (lock.ts), in ascending UUID order.
// - Before COMMIT, SET CONSTRAINTS ALL IMMEDIATE fires the deferred pair-integrity
//   triggers inside the transaction, so their refusal is mapped like any other error.
// - On any error: ROLLBACK, then retry the whole callback for a transient conflict
//   (deadlock, serialization failure, a lock set that grew; a lock timeout once) up to
//   `attempts` times with a short jittered backoff; otherwise throw mapDbError(err)
//   (check_violation → E-005 and so on, errors.ts). The callback must therefore be safe
//   to run again from the start: no side effects outside the database.
// - Every database error is logged once with safe facts only: `db.refusal` (SQLSTATE,
//   constraint, table, routine, stage) for errors with a SQLSTATE, `db.tx_failed`
//   (error class, frame, stage) for the rest. Never the message, detail or values.
// - A client error event (connection lost mid-transaction) is logged and the client is
//   discarded; a client whose ROLLBACK failed is discarded too, and the caller still
//   sees the original error.
import type { PoolClient } from "pg";
import { ApiError } from "@/app/api/_shared/envelope";
import { createLogger, describeError, type Logger, type TxStage } from "@/app/api/_shared/log";
import { getPool } from "@/server/db/pool";
import { LockSetChanged, isRetryable, isSevereRefusal, mapDbError, refusalFacts, sqlstateOf } from "./errors";

export type Connectable = { connect(): Promise<PoolClient> };

export type TxOptions = { pool?: Connectable; attempts?: number; logger?: Logger };

export const DEFAULT_TX_ATTEMPTS = 3;

let defaultLogger: Logger | null = null;
const loggerOf = (opts: TxOptions) => opts.logger ?? (defaultLogger ??= createLogger());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// 10–40 ms × attempt: enough for the competing transaction to finish.
const backoffMs = (attempt: number) => attempt * (10 + Math.floor(Math.random() * 30));

function logFailure(logger: Logger, err: unknown, stage: TxStage): void {
  if (err instanceof ApiError || err instanceof LockSetChanged) return; // app-level outcome, not a DB failure
  const code = sqlstateOf(err);
  if (code) {
    logger[isSevereRefusal(err) ? "error" : "warn"]({ event: "db.refusal", err_code: code, ...refusalFacts(err), tx_stage: stage });
  } else {
    logger.error({ event: "db.tx_failed", tx_stage: stage, ...describeError(err) });
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>, opts: TxOptions = {}): Promise<T> {
  const pool = opts.pool ?? getPool();
  const attempts = Math.max(1, opts.attempts ?? DEFAULT_TX_ATTEMPTS);
  const logger = loggerOf(opts);
  for (let attempt = 1; ; attempt++) {
    let stage: TxStage = "connect";
    const client = await pool.connect();
    let broken = false;
    let released = false;
    const onError = (err: unknown) => {
      broken = true;
      logger.error({ event: "db.client_error", tx_stage: stage, ...describeError(err) });
    };
    const release = () => {
      if (released) return;
      released = true;
      client.removeListener("error", onError);
      client.release(broken);
    };
    client.on("error", onError);
    try {
      stage = "begin";
      await client.query("BEGIN");
      stage = "callback";
      const result = await fn(client);
      stage = "constraints";
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      stage = "commit";
      await client.query("COMMIT");
      return result;
    } catch (err) {
      logFailure(logger, err, stage);
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        broken = true;
        logger.error({ event: "db.rollback_failed", tx_stage: "rollback", ...describeError(rollbackErr) });
      }
      if (attempt < attempts && isRetryable(err, attempt)) {
        release();
        await sleep(backoffMs(attempt));
        continue;
      }
      throw mapDbError(err);
    } finally {
      release();
    }
  }
}

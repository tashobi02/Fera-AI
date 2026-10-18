// TASK-063 / BR-023 / TC-043/065. The SQL functions own all counters and cap checks.
import type { PoolClient } from "pg";
import { z } from "zod";
import { ApiError } from "@/app/api/_shared/envelope";
import { createLogger, describeError, issueTokens, type Logger, type LogEntry } from "@/app/api/_shared/log";
import { uuidSchema } from "@/contracts";
import { canCall, canIntake, type ApiId, type Principal } from "@/contracts/server";
import { withTransaction, type TxOptions } from "@/server/case/tx";
import { col, firstRow, RowShapeError } from "@/server/db/decode";
import { getPool } from "@/server/db/pool";
import { mapSpendDbError } from "./errors";
import { safeLogger } from "./safe-log";
import { formatUsd, usdMicros, usdSchema } from "./money";
import type { UpperUsdEstimate } from "./price-sheet";

export type SpendContext = Pick<TxOptions, "pool" | "logger">;
export type PaidApiId = Extract<ApiId, "API-001" | "API-002" | "API-007">;
export type ReservationRequest = { apiId: PaidApiId; draftId: string; expectedRevision: number; upperUsd: UpperUsdEstimate; kind: "missing" | "found" };
export type PaidReservation = Readonly<{ id: string; apiId: PaidApiId; draftId: string; revision: number; upperUsd: string }>;

const reservationSchema = z.strictObject({
  apiId: z.enum(["API-001", "API-002", "API-007"]),
  draftId: uuidSchema,
  expectedRevision: z.number().int().min(1).max(2_147_483_646),
  upperUsd: usdSchema.pipe(z.string().refine((value) => usdMicros(value) > 0n).transform((value) => formatUsd(usdMicros(value)))),
  kind: z.enum(["missing", "found"]),
});
const settlementSchema = z.strictObject({ id: uuidSchema, actualUsd: usdSchema.transform((value) => formatUsd(usdMicros(value))) });

// Reconciliation facts for a lost COMMIT acknowledgement; fn may add reservation_id once known.
type SpendFacts = { route?: string; draft_id?: string; reservation_id?: string };

async function spendTransaction<T>(fn: (client: PoolClient, facts: SpendFacts) => Promise<T>, ctx: SpendContext, facts: SpendFacts = {}): Promise<T> {
  const logger = safeLogger(ctx.logger ?? createLogger());
  let connected = false;
  let callbackFailed = false;
  let callbackError: unknown;
  // Observe the shared helper's safe commit-stage diagnostic rather than changing
  // its retry/logging policy. A lost COMMIT ack is not proof of a rollback.
  const logCommitUncertain = (entry: LogEntry) => {
    if (entry.tx_stage === "commit" && (entry.event === "db.tx_failed" || entry.event === "db.refusal")) {
      logger.error({ ...entry, ...facts, event: "spend.commit_uncertain" });
    }
  };
  const txLogger: Logger = {
    info: logger.info,
    warn: (entry) => { logCommitUncertain(entry); logger.warn(entry); },
    error: (entry) => { logCommitUncertain(entry); logger.error(entry); },
  };
  try {
    const pool = ctx.pool ?? getPool();
    return await withTransaction(async (client) => {
      try {
        return await fn(client, facts);
      } catch (err) {
        // Let the shared helper log safe diagnostics and roll back first. Preserve
        // the original error so its case-specific E-005 mapping does not replace ours.
        callbackFailed = true;
        callbackError = err;
        throw err;
      }
    }, { logger: txLogger, attempts: 1, pool: {
      async connect() {
        const client = await pool.connect();
        connected = true;
        return client;
      },
    } });
  } catch (err) {
    // Pool acquisition is outside the shared helper's logging/rollback block.
    if (!connected) logger.error({ event: "db.tx_failed", tx_stage: "connect", ...describeError(err) });
    // An uncertain COMMIT must never trigger a second reservation or a dispatch.
    throw mapSpendDbError(callbackFailed ? callbackError : err, logger);
  }
}

// Adapter/server input faults are not the parent's fields: E-013 keeps the manual
// form (BR-023) where E-001 would ask them to fix marked fields. Paths only, no values.
function badInput(logger: Logger, issues: Parameters<typeof issueTokens>[0]): never {
  logger.error({ event: "spend.bad_input", error_id: "E-013", issues: issueTokens(issues) });
  throw new ApiError("E-013");
}

// Shared by the two server entry points so adapter faults never mask E-002/E-003.
// Internal helper; the public barrel exposes neither this guard nor settlement.
export function requirePaidPrincipal(principal: Principal | null): asserts principal is Principal {
  if (!principal) throw new ApiError("E-002");
  if ((principal.kind === "user" && principal.role === "officer" && !principal.verified)
    || (!canIntake(principal, "missing") && !canIntake(principal, "found"))) throw new ApiError("E-003");
}

export async function reservePaidCall(
  principal: Principal | null,
  input: ReservationRequest,
  ctx: SpendContext = {},
): Promise<PaidReservation> {
  requirePaidPrincipal(principal);
  const logger = safeLogger(ctx.logger ?? createLogger());
  const parsed = reservationSchema.safeParse(input);
  if (!parsed.success) return badInput(logger, parsed.error.issues);
  const request = parsed.data;
  if (!canCall(request.apiId, principal)) throw new ApiError("E-003");
  // Use the actual draft kind from the request, not the first principal
  // matching kind; a verified officer's "found" draft and a parent's
  // "missing" draft have a single authoritative kind. canIntake keeps the
  // role-check on the principal.
  const kind = request.kind;
  if (!canIntake(principal, kind)) throw new ApiError("E-003");
  const owner = [request.draftId, principal.kind === "parent" ? principal.sessionId : null,
    principal.kind === "user" ? principal.userId : null, kind];
  const scope = `id=$1 AND session_id IS NOT DISTINCT FROM $2::uuid
    AND user_id IS NOT DISTINCT FROM $3::uuid AND kind=$4::case_kind`;
  const refuse = (rule: "foreign.draft" | "stale.revision"): never => {
    logger.warn({ event: "spend.refused", route: request.apiId, error_id: "E-023", rule });
    throw new ApiError("E-023");
  };

  return spendTransaction(async (client, facts) => {
    // Unlocked, indexed owner/kind pre-check: foreign/random UUIDs never enter the
    // global budget lock. Recheck after reserve; this read is not an authority lock.
    if (!(await client.query(`SELECT 1 FROM intake_drafts WHERE ${scope}`, owner)).rows.length) refuse("foreign.draft");
    // SQL still takes locks budget first, then draft. Hold both through the scoped
    // revision recheck and COMMIT; any stale/changed owner rolls the reservation back.
    const reserved = firstRow("ai_reservations", (await client.query(
      "SELECT reserve_ai_call($1::uuid, $2::numeric) AS id", [request.draftId, request.upperUsd],
    )).rows);
    if (!reserved) throw new RowShapeError("ai_reservations", "id");
    const row = firstRow("intake_drafts", (await client.query(
      `SELECT revision FROM intake_drafts WHERE ${scope}`, owner,
    )).rows);
    facts.reservation_id = col.uuid("ai_reservations", reserved, "id");
    if (!row) return refuse("foreign.draft");
    if (col.int("intake_drafts", row, "revision") !== request.expectedRevision + 1) refuse("stale.revision");
    return Object.freeze({
      id: col.uuid("ai_reservations", reserved, "id"), apiId: request.apiId, draftId: request.draftId,
      revision: request.expectedRevision + 1, upperUsd: request.upperUsd,
    });
  }, { ...ctx, logger }, { route: request.apiId, draft_id: request.draftId });
}

export async function settlePaidCall(id: string, actualUsd: string, ctx: SpendContext = {}, known: Omit<SpendFacts, "reservation_id"> = {}): Promise<void> {
  const parsed = settlementSchema.safeParse({ id, actualUsd });
  if (!parsed.success) return badInput(safeLogger(ctx.logger ?? createLogger()), parsed.error.issues);
  await spendTransaction(async (client) => {
    await client.query("SELECT settle_ai_call($1::uuid, $2::numeric)", [parsed.data.id, parsed.data.actualUsd]);
  }, ctx, { ...known, reservation_id: parsed.data.id });
}

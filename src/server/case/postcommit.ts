// Awaited matcher trigger after the case create/edit transaction has committed.
// Dynamic imports keep the case command -> matcher -> case internals graph acyclic.
import { createLogger, describeError } from "@/app/api/_shared/log";
import type { ServiceContext } from "./state";
import type { MatcherRunResult } from "@/server/matching/run";

export type MatcherPostcommitApi = "API-003" | "API-005" | "API-007";
export type MatcherPostcommit = (
  caseId: string,
  ctx: ServiceContext,
  api: MatcherPostcommitApi,
) => Promise<MatcherRunResult>;

async function markPostcommitFailure(
  caseId: string,
  ctx: ServiceContext,
  api: MatcherPostcommitApi,
  failure: unknown,
): Promise<boolean> {
  // This fallback covers an import/run error that escaped the matcher’s own
  // durable failure path. Keep it lazy too to avoid a case/matcher import cycle.
  //
  // Concurrency rule (BR-020 / D2A §5.7): a matcher that ran on a sibling
  // request may have stamped `matching_state = 'complete'` between the
  // failure we observed and the moment we take the case lock here. Refusing
  // to overwrite a `complete` row preserves the "concurrent success wins"
  // invariant: a later API-014 rematch, an officer decision, or a sibling
  // postcommit that genuinely produced candidates must never be clobbered by
  // our retry. The owner DTO still shows `failed` honestly when the row was
  // in queued/running/failed at lock time.
  //
  // The original case has already committed by the time we run, so this
  // durability step must never bubble an error to the API caller. A failure
  // here leaves the case row in queued/running — it stays eligible for a
  // later API-014 rematch, and the caller still receives a soft `failed`
  // response with E-021.
  const logger = ctx.logger ?? createLogger();
  logger.warn({
    event: "matcher.postcommit_failed",
    route: api,
    ...describeError(failure),
  });
  let durable = true;
  try {
    const { withTransaction, lockCases } = await import("@/server/case/internal");
    await withTransaction(async (client) => {
      const rows = await lockCases(client, [caseId]);
      const row = rows.get(caseId);
      const kind = api === "API-007" ? "found" : "missing";
      if (!row || row.kind !== kind || row.anonymised_at !== null) return;
      await client.query(
        `UPDATE cases SET matching_state = 'failed', matched_at = NULL, match_error_id = 'E-021'
         WHERE id = $1 AND kind = $2 AND anonymised_at IS NULL
           AND status IN ('open', 'matched_pending_review')
           AND matching_state IN ('queued', 'running', 'failed')`,
        [caseId, kind],
      );
    }, { pool: ctx.pool, attempts: ctx.attempts });
  } catch (markErr) {
    durable = false;
    logger.warn({
      event: "matcher.failure_state_unavailable",
      route: api,
      ...describeError(markErr),
    });
  }
  return durable;
}

async function runDefault(caseId: string, ctx: ServiceContext, api: MatcherPostcommitApi): Promise<MatcherRunResult> {
  try {
    const matcher = await import("@/server/matching/run");
    const shared = { requestId: ctx.requestId ?? null, pool: ctx.pool } as const;
    if (api === "API-007") {
      return await matcher.runMatcherForFoundCase(caseId, { ...shared, api });
    }
    return await matcher.runMatcherForCase(caseId, { ...shared, api });
  } catch (err) {
    // Escaped failures are represented by a durable safe code. Never expose an
    // exception message that could include model paths or child content. The
    // case row has already committed, so we swallow any mark-time DB error
    // and still return a soft `failed` result; if the mark itself failed the
    // case stays queued and a later API-014 rematch can drive it forward.
    await markPostcommitFailure(caseId, ctx, api, err);
    return {
      caseId,
      state: "failed",
      candidates: [],
      considered: 0,
      abstained: false,
      errorId: "E-021",
    };
  }
}

let matcherPostcommit: MatcherPostcommit = runDefault;

/** Test seam. Production uses the real local matcher by default. */
export function setMatcherPostcommit(fn: MatcherPostcommit): void {
  matcherPostcommit = fn;
}

/**
 * Run matching synchronously after the create/open/edit transaction has committed.
 * The run uses the runtime's bounded PostgreSQL statement timeout and the
 * found-report fan-out is capped with deferred missing rows left `queued` for
 * API-014. A rejection is never detached from the serverless request.
 */
export async function fireMatcherPostcommit(
  caseId: string,
  ctx: ServiceContext,
  api: MatcherPostcommitApi,
): Promise<MatcherRunResult> {
  return matcherPostcommit(caseId, ctx, api);
}

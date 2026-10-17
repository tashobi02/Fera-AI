// Awaited matcher trigger after the case/status transaction has committed.
// Dynamic imports keep the case command -> matcher -> case internals graph acyclic.
import type { ServiceContext } from "./state";
import type { MatcherRunResult } from "@/server/matching/run";

export type MatcherPostcommitApi = "API-003" | "API-007";
export type MatcherPostcommit = (
  caseId: string,
  ctx: ServiceContext,
  api: MatcherPostcommitApi,
) => Promise<MatcherRunResult>;

async function markPostcommitFailure(caseId: string, ctx: ServiceContext, api: MatcherPostcommitApi): Promise<void> {
  // This fallback covers an import/run error that escaped the matcher’s own
  // durable failure path. Keep it lazy too to avoid a case/matcher import cycle.
  const { withTransaction, lockCases } = await import("@/server/case/internal");
  await withTransaction(async (client) => {
    const rows = await lockCases(client, [caseId]);
    const row = rows.get(caseId);
    const kind = api === "API-003" ? "missing" : "found";
    if (!row || row.kind !== kind || row.anonymised_at !== null) return;
    await client.query(
      `UPDATE cases SET matching_state = 'failed', matched_at = NULL, match_error_id = 'E-021'
       WHERE id = $1 AND kind = $2 AND anonymised_at IS NULL
         AND status IN ('open', 'matched_pending_review')`,
      [caseId, kind],
    );
  }, { pool: ctx.pool, attempts: ctx.attempts });
}

async function runDefault(caseId: string, ctx: ServiceContext, api: MatcherPostcommitApi): Promise<MatcherRunResult> {
  try {
    const matcher = await import("@/server/matching/run");
    const shared = { requestId: ctx.requestId ?? null, pool: ctx.pool } as const;
    if (api === "API-007") {
      return await matcher.runMatcherForFoundCase(caseId, { ...shared, api });
    }
    return await matcher.runMatcherForCase(caseId, { ...shared, api });
  } catch {
    // Escaped failures are represented by a durable safe code. Never expose an
    // exception message that could include model paths or child content.
    await markPostcommitFailure(caseId, ctx, api);
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
 * Run matching synchronously after the create/open transaction has committed.
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

// API-014 handler factory and test seams; kept out of the route module because
// Next App Router route files may export HTTP handlers and recognized config only.
import { isUuid, type RematchResponse } from "@/contracts";
import { effectiveRole, toRematchResponse, type Principal } from "@/contracts/server";
import type { Embedder } from "@/server/embeddings/model";
import { runMatcherForCase, type MatcherRunOptions, type MatcherRunResult } from "@/server/matching/run";
import { ApiError } from "../../_shared";

/**
 * Test seam: inject a deterministic embedder and runner. Production leaves this
 * unset; the matcher lazily loads the real local E5 model and records a durable
 * failed state if the cache or pipeline is unavailable.
 */
export type RematchRouteDeps = {
  embedder?: Embedder | (() => Embedder | Promise<Embedder>);
  runMatcherForCase?: (caseId: string, opts: MatcherRunOptions) => Promise<MatcherRunResult>;
};

const defaultDeps: RematchRouteDeps = {};

export type RematchHandlerInput = { principal: Principal; params: { caseId: string }; requestId: string };

export function createRematchHandler(deps: RematchRouteDeps = defaultDeps) {
  return async ({ principal, params: p, requestId }: RematchHandlerInput): Promise<RematchResponse> => {
    // Defence in depth: API-014 is officer/admin in API_ACCESS, but the route
    // re-checks the effective role so an unverified officer (effective "staff")
    // or a parent with a somehow-promoted role never reaches the matcher. A
    // malformed caseId is a record-route E-004 (the compose layer writes the
    // access.denied row).
    if (!isAllowedRematchActor(principal)) {
      throw new ApiError("E-004", { caseId: p.caseId });
    }
    if (!isUuid(p.caseId)) throw new ApiError("E-004");

    // The matcher is a pipeline step; it uses SYSTEM_ACTOR inside.
    // Admins / officers only TRIGGER the run; they do not act on the audit
    // trail. The result exposes only matching_state; candidates go through
    // API-008/009.
    const runner = deps.runMatcherForCase ?? runMatcherForCase;
    const result = await runner(p.caseId, {
      ...(deps.embedder ? { embedder: await resolveEmbedder(deps) } : {}),
      api: "API-014",
      requestId,
    });
    if (result.errorId === "E-004" || result.errorId === "E-005" || result.errorId === "E-018") {
      throw new ApiError(result.errorId, { caseId: p.caseId });
    }
    // toRematchResponse parses against the contract schema; the result already
    // matches the contract shape (case_id + matching_state) so this never
    // throws in practice. The schema parse keeps the contract the single
    // source of truth.
    return toRematchResponse({ id: result.caseId, matching_state: result.state });
  };
}

function isAllowedRematchActor(principal: Principal): boolean {
  const role = effectiveRole(principal);
  return role === "officer" || role === "admin";
}

async function resolveEmbedder(deps: RematchRouteDeps): Promise<Embedder> {
  if (deps.embedder) {
    return typeof deps.embedder === "function" ? await deps.embedder() : deps.embedder;
  }
  throw new Error("production embedder resolution is owned by the matcher");
}

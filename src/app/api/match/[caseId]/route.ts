// API-014 POST /api/match/:caseId (D2A §5.7; BR-017/018/019/020; TC-044). Owner: Masnun.
//
// Re-runs the matcher for one missing case. The response is `RematchResponse` only
// (case_id + matching_state); candidates are served through API-008/009 to officers.
// The route is the only call site that uses the system actor for the matcher; the
// API-003/API-007 after-commit hooks use the same module with their own `api` tag.
//
// Role gate: verified officer OR admin. A parent or staff principal is denied. An
// unverified officer has effective role "staff", which is not in
// API_ACCESS["API-014"] = ["officer", "admin"].
//
// Record route: an absent, redacted, terminal or unknown case id is E-004 with a
// null caseId in the access.denied audit row (BR-010, TC-052). The compose layer
// writes the deny row; the handler never audits the denial itself.
//
// Rate limit: an admin or officer cannot flood rematch — 30/min per principal.
// The cost of a rematch is the embedder + a handful of SQL statements; the limit
// is here to bound the embedding spend under a misbehaving client, not to
// protect the database.
import { z } from "zod";
import { isUuid, rematchResponseSchema, uuidSchema, type RematchResponse } from "@/contracts";
import { effectiveRole, toRematchResponse, type Principal } from "@/contracts/server";
import type { Embedder } from "@/server/embeddings/model";
import { runMatcherForCase, type MatcherRunOptions, type MatcherRunResult } from "@/server/matching/run";
import { ApiError, defineRoute, type RateLimitRule } from "../../_shared";

export const runtime = "nodejs"; // pg + (optional) local embedder

const params = z.strictObject({ caseId: uuidSchema });

// Documented default (OD-028-3). In-memory per instance until the shared store lands.
// Fails open like the other read-side limits; the matcher is idempotent and bounded.
const REMATCH_WRITES: RateLimitRule = { id: "match.principal", limit: 30, windowMs: 60_000, scope: "principal", onStoreError: "allow" };

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

export const POST = defineRoute({
  api: "API-014",
  params,
  response: rematchResponseSchema,
  rateLimit: [REMATCH_WRITES],
  handler: createRematchHandler(),
});

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

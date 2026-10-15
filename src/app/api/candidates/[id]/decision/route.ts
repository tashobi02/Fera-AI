// API-010 POST /api/candidates/:id/decision: a verified officer confirms or rejects one
// candidate (FR-016/017, SCREEN-010). Everything that matters — the verified-officer check,
// sorted locks, version rechecks, competitor voiding, both states, the simulated referral and
// the audit — is the case service's single transaction. This route only parses, calls it and
// returns its response. A retry after a successful decision is E-005 by design.
import { z } from "zod";
import { decisionRequestSchema, decisionResponseSchema, uuidSchema, type DecisionResponse } from "@/contracts";
import { decideCandidate } from "@/server/case";
import { defineRoute } from "../../../_shared";

export const runtime = "nodejs"; // pg

const params = z.strictObject({ id: uuidSchema });

export const POST = defineRoute({
  api: "API-010",
  params,
  body: decisionRequestSchema,
  response: decisionResponseSchema,
  handler: async ({ principal, params: p, body, requestId }): Promise<DecisionResponse> => {
    const result = await decideCandidate(principal, p.id, body, { requestId });
    return result.response;
  },
});

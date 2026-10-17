// API-009 GET /api/candidates/:id: one candidate for an active verified officer (FR-015,
// SCREEN-010). Absent, malformed and forbidden are the same E-004. Read only: the decision
// is API-010. Raw contact access is audited inside the read.
import { candidateDecisionViewSchema, type CandidateDecisionView } from "@/contracts";
import { z } from "zod";
import { readCandidate } from "@/server/matching/candidate-read";
import { ApiError, defineRoute, type RateLimitRule } from "../../_shared";

export const runtime = "nodejs"; // pg

// Let malformed IDs reach readCandidate's hidden branch so an authenticated
// probe gets the same E-004 and nullable-FK denial audit as an absent UUID.
const params = z.strictObject({ id: z.string() });

// Not from the spec pack: a documented default (OD-028-3). Every read that serves a phone is audited.
const CANDIDATE_READS: RateLimitRule = { id: "candidate.principal", limit: 120, windowMs: 60_000, scope: "principal", onStoreError: "allow" };

export const GET = defineRoute({
  api: "API-009",
  params,
  response: candidateDecisionViewSchema,
  rateLimit: [CANDIDATE_READS],
  handler: async ({ principal, params: p, requestId }): Promise<CandidateDecisionView> => {
    const r = await readCandidate(principal, p.id, { requestId });
    if (r.kind === "hidden") throw new ApiError("E-004", { caseId: r.caseId ?? undefined });
    return r.view;
  },
});

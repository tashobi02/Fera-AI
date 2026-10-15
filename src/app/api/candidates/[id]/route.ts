// API-009 GET /api/candidates/:id: one candidate for an active verified officer (FR-015,
// SCREEN-010). Absent, malformed and forbidden are the same E-004. Read only: the decision
// is API-010. Raw contact access is audited inside the read.
import { candidateDecisionViewSchema, uuidSchema, type CandidateDecisionView } from "@/contracts";
import { z } from "zod";
import { readCandidate } from "@/server/matching/candidate-read";
import { ApiError, defineRoute } from "../../_shared";

export const runtime = "nodejs"; // pg

const params = z.strictObject({ id: uuidSchema });

export const GET = defineRoute({
  api: "API-009",
  params,
  response: candidateDecisionViewSchema,
  handler: async ({ principal, params: p, requestId }): Promise<CandidateDecisionView> => {
    const r = await readCandidate(principal, p.id, { requestId });
    if (r.kind === "hidden") throw new ApiError("E-004", { caseId: r.caseId ?? undefined });
    return r.view;
  },
});

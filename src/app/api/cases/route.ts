// API-003 POST /api/cases: the parent's reviewed missing report (TASK-022, FR-031,
// BR-004/023). A browser with no parent cookie gets a new anonymous parent session on
// this call (OD-022-5: the S-005 manual form never calls API-001/002); a present but
// unusable one is the layer's E-002 and is cleared. The session row (metadata only) is
// written by the resolver before the body is read; no case, payload or audit row is
// stored until `confirmed: true` parses. Network limit: submitNetwork (30/min).
// Sequence per src/server/case/README.md: createMissingCase → openCase → awaited
// postcommit match → owner DTO. Matching runs after the case and open-state commits;
// failures persist as matching_state=failed and never roll back the report.
import { createMissingRequestSchema, createMissingResponseSchema, type CreateMissingResponse } from "@/contracts";
import { createMissingCase, openCase, readCase } from "@/server/case";
import { fireMatcherPostcommit } from "@/server/case/postcommit";
import { ApiError, RATE_LIMITS, Reply, defineRoute } from "../_shared";

export const runtime = "nodejs"; // pg

export const POST = defineRoute({
  api: "API-003",
  rateLimit: [RATE_LIMITS.submitNetwork],
  body: createMissingRequestSchema,
  response: createMissingResponseSchema,
  handler: async ({ principal, body, requestId, logger }): Promise<Reply<CreateMissingResponse>> => {
    // API-002 returns this token, but TASK-014/020 have not added its signer yet.
    // Accept the schema-valid token without persisting or trusting it (OD-022-1).
    if (body.draft_token !== undefined) {
      logger.info({ event: "submit.draft_token_unverified", request_id: requestId, route: "API-003", method: "POST", role: "parent" });
    }
    const { case: created, replayed } = await createMissingCase(principal, body, { requestId });
    await openCase(principal, created.id, { requestId });
    if (!replayed) await fireMatcherPostcommit(created.id, { requestId }, "API-003");
    // Read the committed state after matching so a synchronous success/failure
    // is reflected in matching_state. readCase applies the owner DTO allowlist.
    const current = await readCase(principal, created.id, { requestId });
    if (current.kind !== "ok" || current.view.view !== "owner") throw new ApiError("E-021", { reason: "response" });
    // API-006 is not on this base, so no output can be fetched yet (OD-022-3).
    return new Reply({ ...current.view.data, replayed, outputs_available: [] }, replayed ? 200 : 201);
  },
});

// API-003 POST /api/cases: the parent's reviewed missing report (TASK-022, FR-031,
// BR-004/023). A browser with no parent cookie gets a new anonymous parent session on
// this call (OD-022-5: the S-005 manual form never calls API-001/002); a present but
// unusable one is the layer's E-002/E-019. Nothing is stored until `confirmed: true`
// parses.
// Sequence per src/server/case/README.md: createMissingCase → openCase → owner DTO.
// Embedding, duplicate checks and matching (Masnun) are not built: the case keeps the
// service's durable `matching_state` and nothing runs in the background (OD-022-2).
import { createMissingRequestSchema, createMissingResponseSchema, type CreateMissingResponse } from "@/contracts";
import { projectCaseFor } from "@/contracts/server";
import { createMissingCase, openCase } from "@/server/case";
import { ApiError, Reply, defineRoute } from "../_shared";

export const runtime = "nodejs"; // pg

export const POST = defineRoute({
  api: "API-003",
  body: createMissingRequestSchema,
  response: createMissingResponseSchema,
  handler: async ({ principal, body, requestId, logger }): Promise<Reply<CreateMissingResponse>> => {
    // API-002 returns this token, but TASK-014/020 have not added its signer yet.
    // Accept the schema-valid token without persisting or trusting it (OD-022-1).
    if (body.draft_token !== undefined) {
      logger.info({ event: "submit.draft_token_unverified", request_id: requestId, route: "API-003", method: "POST", role: "parent" });
    }
    const { case: created, replayed } = await createMissingCase(principal, body, { requestId });
    // Also run on replay: it recovers a row whose earlier open step failed, and is a
    // no-op for any status other than submitted.
    const opened = await openCase(principal, created.id, { requestId });
    const projected = projectCaseFor(principal, opened, { districtNameBn: null, duplicateOf: [] });
    if (projected?.view !== "owner") throw new ApiError("E-021", { reason: "response" });
    // API-006 is not on this base, so no output can be fetched yet (OD-022-3).
    return new Reply({ ...projected.data, replayed, outputs_available: [] }, replayed ? 200 : 201);
  },
});

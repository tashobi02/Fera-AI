// API-003 POST /api/cases: the parent's reviewed missing report (TASK-022, FR-031,
// BR-004/023). A browser with no parent cookie gets a new anonymous parent session on
// this call (OD-022-5: the S-005 manual form never calls API-001/002); a present but
// unusable one is the layer's E-002 and is cleared. The session row (metadata only) is
// written by the resolver before the body is read; no case, payload or audit row is
// stored until `confirmed: true` parses. Network limit: submitNetwork (30/min).
// Sequence per src/server/case/README.md: createMissingCase → openCase → owner DTO.
// Embedding, duplicate checks and matching (Masnun) are not built: the case keeps the
// service's durable `matching_state` and nothing runs in the background (OD-022-2).
//
// API-022 GET /api/cases: the verified-officer drill-through (P3-041, TASK-030a, FR-019,
// BR-007/024; TC-012, TC-015, TC-055). Verified officer only (D2A §9.2 "officer"). The
// service does the role check and the per-role DTO projection; the strict
// `caseListResponseSchema` is the allowlist — admin/staff/parent callers cannot
// reach the body. A signed-in non-officer gets E-003 and the compose layer writes
// `access.denied` (BR-010, TC-052). The route does not touch child payload, contact,
// candidate IDs, scores or district text: those never leave the service layer.
import { caseListQuerySchema, caseListResponseSchema, createMissingRequestSchema, createMissingResponseSchema, type CaseListResponse, type CreateMissingResponse } from "@/contracts";
import { projectCaseFor } from "@/contracts/server";
import { createMissingCase, listOfficerCases, openCase } from "@/server/case";
import { getPool } from "@/server/db/pool";
import { ApiError, RATE_LIMITS, Reply, defineRoute, type RateLimitRule } from "../_shared";

export const runtime = "nodejs"; // pg

// Per-principal read cap (API-022 is filter-driven, one principal at a time). One
// request per officer load is well within 60/min; raise the cap when paging makes a
// higher value safer.
const CASE_LIST: RateLimitRule = { id: "case.list", limit: 60, windowMs: 60_000, scope: "principal", onStoreError: "allow" };

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
    // Also run on replay: it recovers a row whose earlier open step failed, and is a
    // no-op for any status other than submitted.
    const opened = await openCase(principal, created.id, { requestId });
    const projected = projectCaseFor(principal, opened, { districtNameBn: null, duplicateOf: [] });
    if (projected?.view !== "owner") throw new ApiError("E-021", { reason: "response" });
    // API-006 is not on this base, so no output can be fetched yet (OD-022-3).
    return new Reply({ ...projected.data, replayed, outputs_available: [] }, replayed ? 200 : 201);
  },
});

export const GET = defineRoute({
  api: "API-022",
  query: caseListQuerySchema,
  response: caseListResponseSchema,
  rateLimit: [CASE_LIST],
  handler: async ({ principal, query, requestId }): Promise<CaseListResponse> => {
    return listOfficerCases(principal, query, getPool(), { requestId });
  },
});

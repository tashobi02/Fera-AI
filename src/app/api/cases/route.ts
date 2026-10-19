// API-003 POST /api/cases: the parent's reviewed missing report (TASK-022, FR-031,
// BR-004/023). A browser with no parent cookie gets a new anonymous parent session on
// this call (OD-022-5: the S-005 manual form never calls API-001/002); a present but
// unusable one is the layer's E-002 and is cleared. The session row (metadata only) is
// written by the resolver before the body is read; no case, payload or audit row is
// stored until `confirmed: true` parses. Network limit: submitNetwork (30/min).
// Sequence: createMissingCase → openCase → awaited postcommit match → owner DTO.
// Matching failures persist separately and never roll back the saved report.
//
// API-022 GET /api/cases: the verified-officer drill-through (P3-041, TASK-030a, FR-019,
// BR-007/024; TC-012, TC-015, TC-055). Verified officer only (D2A §9.2 "officer"). The
// service does the role check and the per-role DTO projection; the strict
// `caseListResponseSchema` is the allowlist — admin/staff/parent callers cannot
// reach the body. A signed-in non-officer gets E-003 and the compose layer writes
// `access.denied` (BR-010, TC-052). The route does not touch child payload, contact,
// candidate IDs, scores or district text: those never leave the service layer.
import { caseListQuerySchema, caseListResponseSchema, createMissingRequestSchema, createMissingResponseSchema, outputTypeSchema, type CaseListResponse, type CreateMissingResponse } from "@/contracts";
import { createMissingCase, listOfficerCases, openCase, readCase, fireMatcherPostcommit } from "@/server/case";
import { getPool } from "@/server/db/pool";
import { ApiError, RATE_LIMITS, Reply, defineRoute, describeError, type RateLimitRule } from "../_shared";

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
    await openCase(principal, created.id, { requestId });
    if (!replayed) {
      // fireMatcherPostcommit's internal runDefault already catches and marks
      // failures durably, but a test seam or an unhandled rejection (e.g. a
      // matcher module that throws before the catch) could still escape. The
      // case row is already committed at this point, so we must not bubble:
      // log it, mark the row failed so it doesn't sit in queued/running, and
      // let readCase below surface matching_state to the parent.
      try {
        await fireMatcherPostcommit(created.id, { requestId }, "API-003");
      } catch (err) {
        logger.error({ event: "matcher.postcommit_failed", request_id: requestId, route: "API-003", ...describeError(err) });
        try {
          await getPool().query(
            `UPDATE cases SET matching_state = 'failed', matched_at = NULL, match_error_id = 'E-021'
             WHERE id = $1 AND kind = 'missing' AND anonymised_at IS NULL
               AND status IN ('open', 'matched_pending_review')
               AND matching_state IN ('queued', 'running', 'failed')`,
            [created.id],
          );
        } catch (markErr) {
          logger.error({ event: "matcher.failure_state_unavailable", request_id: requestId, route: "API-003", ...describeError(markErr) });
        }
      }
    }
    // Read the committed state after matching so a synchronous success/failure
    // is reflected in matching_state. readCase applies the owner DTO allowlist.
    const current = await readCase(principal, created.id, { requestId });
    if (current.kind !== "ok" || current.view.view !== "owner") throw new ApiError("E-021", { reason: "response" });
    // Read outputs after matching so an identical replay reflects outputs created
    // since the original submission.
    const outputRows = await getPool().query<{ type: string }>(
      "SELECT type FROM generated_outputs WHERE case_id = $1 ORDER BY type",
      [created.id],
    );
    const outputsAvailable = outputRows.rows.map((row) => outputTypeSchema.parse(row.type));
    return new Reply({ ...current.view.data, replayed, outputs_available: outputsAvailable }, replayed ? 200 : 201);
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

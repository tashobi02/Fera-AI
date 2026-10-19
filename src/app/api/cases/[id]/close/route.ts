// API-011 POST /api/cases/:id/close (TASK-029 part; FR-018, BR-012; TC-010/032). Active
// verified officer only. Records a synthetic coordination outcome — never a rescue,
// return or reunification. The closeCase service does the version recheck and audit;
// this layer only owns HTTP, the per-role response schema and the officer-only gate
// (the service re-checks verified+active inside the transaction).
import { closeCaseRequestSchema, closeCaseResponseSchema, type CloseCaseRequest, type CloseCaseResponse } from "@/contracts";
import { z } from "zod";
import { closeCase } from "@/server/case";
import { defineRoute, type RateLimitRule } from "../../../_shared";

export const runtime = "nodejs"; // pg

// Keep malformed path IDs inside the authenticated E-004 path (as API-004): the service guards isUuid.
const params = z.strictObject({ id: z.string().max(64) });

// Not from the spec pack: a documented default. Closing is rare, so the window is tighter than a read.
const CASE_CLOSE: RateLimitRule = { id: "case.close.principal", limit: 60, windowMs: 60_000, scope: "principal", onStoreError: "allow" };

export const POST = defineRoute({
  api: "API-011",
  rateLimit: [CASE_CLOSE],
  params,
  body: closeCaseRequestSchema,
  response: closeCaseResponseSchema,
  handler: async ({ principal, params: p, body, requestId }): Promise<CloseCaseResponse> => {
    const r = await closeCase(principal, p.id, body as CloseCaseRequest, { requestId });
    return r.response;
  },
});

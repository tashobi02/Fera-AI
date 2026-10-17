// API-023 POST /api/duplicates/:id/decision (TASK-051; FR-023/TC-038; SCREEN-014; BR-021).
// Verified officer marks a flagged duplicate link same child or different. The
// route only owns HTTP, the per-role response schema and the active verified
// officer gate; the one-transaction work, the sorted-UUID lock, the live
// re-read, the audit row and the schema CHECK backstop all live in the
// duplicates service. The shared phone-only path is refused at the service
// (E-005), not at the route.
import { z } from "zod";
import { duplicateDecisionRequestSchema, duplicateDecisionResponseSchema, type DuplicateDecisionResponse } from "@/contracts";
import { decideDuplicate } from "@/server/duplicates/decision";
import { defineRoute, type RateLimitRule } from "../../../_shared";

export const runtime = "nodejs"; // pg

// Keep malformed record IDs on the authenticated E-004 path; decideDuplicate
// performs the UUID check before opening a transaction, like API-011.
const params = z.strictObject({ id: z.string() });

// Not from the spec pack: a documented default (OD-028-3 pattern). A duplicate
// review is rarer than a queue decision; the rate limit window is the same as
// API-010 to keep memory behaviour consistent.
const DECISION_WRITES: RateLimitRule = { id: "duplicate.decision.principal", limit: 30, windowMs: 60_000, scope: "principal", onStoreError: "allow" };

export const POST = defineRoute({
  api: "API-023",
  params,
  body: duplicateDecisionRequestSchema,
  response: duplicateDecisionResponseSchema,
  rateLimit: [DECISION_WRITES],
  handler: async ({ principal, params: p, body, requestId }): Promise<DuplicateDecisionResponse> => {
    const r = await decideDuplicate(principal, p.id, body, { requestId: requestId ?? null });
    return r.response;
  },
});

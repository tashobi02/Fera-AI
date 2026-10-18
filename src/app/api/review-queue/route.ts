// API-008 GET /api/review-queue (TASK-027; FR-012; SCREEN-009; D2A §5.4). The verified
// officer's queue of missing reports with pending candidates, grouped by case, ordered
// by similarity descending, at most LIMITS.candidatesPerQueueItem per case.
//
// - The coarse role guard (defineRoute) refuses non-officer callers; the service
//   re-checks effectiveRole() and returns `hidden` for admin / parent / staff /
//   unverified officer (D2A §9.2 admin = None for API-008/009/010/011/022).
// - `hidden` is a denial: the route throws E-004 and the compose layer writes
//   access.denied with no case FK (BR-010, TC-052). API-008 is not a record route
//   in the spec table (it never names a single case), but P3-034 applies the same
//   E-004 + null-FK audit pattern as API-004/009 so the denial rows are
//   indistinguishable for non-officer callers.
import { reviewQueueQuerySchema, reviewQueueResponseSchema, type ReviewQueueResponse } from "@/contracts";
import { readReviewQueue } from "@/server/matching/queue-read";
import { ApiError, defineRoute, type RateLimitRule } from "../_shared";

export const runtime = "nodejs"; // pg

// Same per-principal default as API-004 / API-009: the queue is a read.
const QUEUE_READ: RateLimitRule = { id: "queue.principal", limit: 120, windowMs: 60_000, scope: "principal", onStoreError: "allow" };

export const GET = defineRoute({
  api: "API-008",
  query: reviewQueueQuerySchema,
  response: reviewQueueResponseSchema,
  rateLimit: [QUEUE_READ],
  // P3-034: non-officer callers see the same E-004 / null-FK denial as the
  // record routes. Staff / unverified officer / parent / admin never receive
  // queue data (D2A §9.2 — admin = None for API-008).
  deny: "E-004",
  handler: async ({ principal, query }): Promise<ReviewQueueResponse> => {
    const r = await readReviewQueue(principal, {
      district: query?.district,
      limit: query?.limit,
      cursor: query?.cursor,
    });
    if (r.kind === "hidden") throw new ApiError("E-004");
    return r.view;
  },
});
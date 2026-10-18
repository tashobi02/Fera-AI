// API-007 POST /api/found-cases: staff or an officer logs a reviewed found-child report
// (FR-011, SCREEN-007). The owner is the server-derived user; `confirmed: true` and a
// client submission UUID are required. 201 for a new report, 200 for an identical replay.
// The response is the caller's own report plus the matching state, never candidates.
import { createFoundRequestSchema, createFoundResponseSchema, type CreateFoundResponse } from "@/contracts";
import { logFoundCase } from "@/server/found/log-found";
import { Reply, defineRoute, type RateLimitRule } from "../_shared";

export const runtime = "nodejs"; // pg

// Not from the spec pack: a documented default so one account cannot flood the queue (the
// network-level 300/min flood guard is the only other limit). In-memory per instance until
// a shared store exists; the layer logs that. Open decision OD-026-3.
const FOUND_WRITES: RateLimitRule = { id: "found.principal", limit: 30, windowMs: 60_000, scope: "principal", onStoreError: "allow" };

export const POST = defineRoute({
  api: "API-007",
  body: createFoundRequestSchema,
  response: createFoundResponseSchema,
  rateLimit: [FOUND_WRITES],
  handler: async ({ principal, body, requestId }): Promise<Reply<CreateFoundResponse>> => {
    const out = await logFoundCase(principal, body, { requestId });
    return new Reply(out, out.replayed ? 200 : 201);
  },
});

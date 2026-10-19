// API-014 POST /api/match/:caseId (D2A §5.7; BR-017/018/019/020; TC-044). Owner: Masnun.
//
// Re-runs the matcher for one missing case. The response is `RematchResponse` only
// (case_id + matching_state); candidates are served through API-008/009 to officers.
import { z } from "zod";
import { rematchResponseSchema, uuidSchema } from "@/contracts";
import { createRematchHandler } from "./handler";
import { defineRoute, type RateLimitRule } from "../../_shared";

export const runtime = "nodejs"; // pg + (optional) local embedder

const params = z.strictObject({ caseId: uuidSchema });

// Documented default (OD-028-3). In-memory per instance until the shared store lands.
// Fails open like the other read-side limits; the matcher is idempotent and bounded.
const REMATCH_WRITES: RateLimitRule = { id: "match.principal", limit: 30, windowMs: 60_000, scope: "principal", onStoreError: "allow" };

export const POST = defineRoute({
  api: "API-014",
  params,
  response: rematchResponseSchema,
  rateLimit: [REMATCH_WRITES],
  handler: createRematchHandler(),
});

// API-019 GET /api/health: public readiness, no data (D2A §5.5, D2B §14).
// TODO(TASK-062/015/016): when DB and embedding pings are added, each must catch its
// own failure and report "unavailable" (still 200), never a provider or driver error.
import { healthResponseSchema, type HealthResponse } from "@/contracts";
import pkg from "../../../../package.json";
import { defineRoute } from "../_shared";

export const GET = defineRoute({
  api: "API-019",
  response: healthResponseSchema,
  handler: async (): Promise<HealthResponse> => ({
    version: pkg.version,
    db: "unavailable", // no database module yet (TASK-062/015 add the ping)
    embeddings: "unavailable", // embedding service is TASK-016
    synthetic_only: true,
    demo_mode: process.env.DEMO_MODE === "1",
  }),
});

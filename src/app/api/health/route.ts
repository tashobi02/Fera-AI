// API-019 GET /api/health: public readiness, no data (D2A §5.5, D2B §14).
// P3-FINISH-HEALTH: the previous version hard-coded `db: "unavailable"` and
// `embeddings: "unavailable"` with a stale TODO. The actual readiness probes
// live in `src/server/health/readiness.ts`. They run in parallel and each is
// independent: a DB outage cannot mask the embedding probe, and vice versa.
// Any probe failure is caught and reduced to `"unavailable"`; the route still
// returns 200 (the contract is `200` even when the service is degraded).
//
// The response schema (API-019) is `{ version, db, embeddings, synthetic_only,
// demo_mode }` and is strict. We do NOT echo the raw error, the connection
// string, the cache path, the model id, the child payload, or the pool's last
// error. The presence of a missing DB MUST NOT pretend the service is ready:
// a partial readiness is `"unavailable"`, not `"ready"`.
import { healthResponseSchema, type HealthResponse } from "@/contracts";
import pkg from "../../../../package.json";
import { defineRoute } from "../_shared";
import { createHealthReadiness } from "@/server/health/readiness";

export const runtime = "nodejs";
// The route composes two best-effort probes (DB ping + local embedder warm).
// Neither blocks on a real network call: the pool has a bounded query_timeout
// (31 s) and the embedder loader is configured `allowRemote: false` so a
// missing local cache cannot fall through to huggingface.co from this path.

export const GET = defineRoute({
  api: "API-019",
  response: healthResponseSchema,
  handler: async (): Promise<HealthResponse> => {
    const readiness = createHealthReadiness();
    const { db, embeddings } = await readiness();
    return {
      version: pkg.version,
      db,
      embeddings,
      synthetic_only: true,
      demo_mode: process.env.DEMO_MODE === "1",
    };
  },
});

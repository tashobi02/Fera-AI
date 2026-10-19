// API-018 GET /api/my-case (TASK-050, P3-103; D2A §5.3/API-018; FR-030, BR-007/010/024;
// TC-019). Parent session → list of the parent's own missing reports. The list view
// is the per-case summary (id, ref_code, kind, status, status_group, updated_at,
// editable), not a child payload, not candidate data, not a found row. Full case
// details come through API-004 only.
//
// - Only a parent principal can call (API_ACCESS["API-018"] = ["parent"]; the
//   composer denies anyone else with E-003).
// - Empty list is a real answer (D3 SCREEN-006 empty state), not an error.
// - listMyCases writes no audit row of its own: this is a list of self-owned
//   reports, equivalent to reading one's own index; the per-case read (API-004)
//   audits contact views in the same transaction. The route returns the same body
//   no matter which device or session the parent returns from on the same phone.
import { myCaseResponseSchema, type MyCaseResponse } from "@/contracts";
import { listMyCases } from "@/server/parent/my-reports";
import { getPool } from "@/server/db/pool";
import { defineRoute, type RateLimitRule } from "../_shared";

export const runtime = "nodejs"; // pg

// Not from the spec pack: a documented default. Same shape as API-004 but only for
// the parent's own reports; tighter to keep a parent from polling.
const MY_CASE: RateLimitRule = { id: "my-case.principal", limit: 120, windowMs: 60_000, scope: "principal", onStoreError: "allow" };

export const GET = defineRoute({
  api: "API-018",
  rateLimit: [MY_CASE],
  response: myCaseResponseSchema,
  handler: async ({ principal }): Promise<MyCaseResponse> => {
    return listMyCases(principal, getPool());
  },
});

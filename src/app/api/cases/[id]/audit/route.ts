// API-013 GET /api/cases/:id/audit (TASK-015; D2A §5.4, §9.2; BR-010/024; FR-021;
// TC-016/052). Verified officer or admin only — anyone else answers E-003/E-004.
//
// This route is the HTTP layer for the safe audit projection (D2A §9.2 row 1288):
//
//   const r = await readCaseAudit(principal, params.id, { requestId });
//   if (r.kind === "hidden") throw new ApiError("E-004", { caseId: r.caseId ?? undefined });
//   return r.view; // officerAuditResponseSchema | adminAuditResponseSchema (discriminated union)
//
// The service owns:
//   - the case metadata lookup (id, ref_code only; no child payload, no contact, no draft);
//   - the audit rows for this case, joined with the actor's display name;
//   - the per-role projection: officer sees the operational allowlist, admin sees metadata
//     only, parent/staff/unverified officer answers E-004 (after the access.denied audit
//     row is written by the API layer).
//
// Audit is append-only: this endpoint is read-only, and no row is mutated here. The
// per-row ref_code check inside the projection is what guarantees no row from another
// case is exposed under this URL.
import { z } from "zod";
import { auditResponseSchema, type AuditResponse } from "@/contracts";
import { ApiError, defineRoute } from "../../../_shared";
import { readCaseAudit } from "@/server/audit/safe-read";

export const runtime = "nodejs"; // pg

// Keep malformed path IDs inside the authenticated E-004 path (as API-004): the service guards isUuid.
const params = z.strictObject({ id: z.string() });

export const GET = defineRoute({
  api: "API-013",
  params,
  response: auditResponseSchema,
  handler: async ({ principal, params: p, requestId }): Promise<AuditResponse> => {
    const r = await readCaseAudit(principal, p.id, { requestId });
    if (r.kind === "hidden") throw new ApiError("E-004", { caseId: r.caseId ?? undefined });
    return r.view;
  },
});

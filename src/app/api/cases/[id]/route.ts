// API-004 GET /api/cases/:id (TASK-029; BR-007/010/024; TC-022/045/052). One case for the
// calling principal through the per-role DTO projections: parent → OwnerCaseView, staff →
// StaffOwnCaseView, verified officer → OfficerCaseView, admin → AdminCaseView metadata.
//
// - Ownership/role is checked inside the service (projectCaseFor): an E-004 from the
//   service means "absent or other party" — the API layer writes the access.denied row
//   with a null FK for an unknown case and the real FK for an existing-but-other-party
//   case (BR-010, TC-052).
// - The per-role response schema is the strict allowlist; a raw row or an extra key
//   would fail E-021. Parent/staff never see candidate or other-party fields; admin
//   never sees child payload, contact, candidate IDs/scores or free-text notes (D2A §9.3).
// - When an officer is served a raw contact phone, the service writes the
//   case.contact_viewed audit row in the same transaction (D2A §5.4). The route only
//   adds the missing FK when the case exists (D2A §9.3 "safe identifier details only").
import { type AdminCaseView, type OfficerCaseView, type OwnerCaseView, type StaffOwnCaseView } from "@/contracts";
import { readCase } from "@/server/case";
import { ApiError, defineRoute, type RateLimitRule } from "../../_shared";
import { adminCaseViewSchema, officerCaseViewSchema, ownerCaseViewSchema, staffOwnCaseViewSchema } from "@/contracts/schemas";
import { z } from "zod";

export const runtime = "nodejs"; // pg

// Keep malformed path IDs inside the authenticated E-004 path. readCase returns
// hidden without querying PostgreSQL for non-UUIDs; the route then audits the
// denial with a null case FK, indistinguishable from an unknown valid UUID.
const params = z.strictObject({ id: z.string() });

// Not from the spec pack: a documented default. Per-role, per-principal reads; no extra
// keys, so the default is a single per-principal window.
const CASE_READ: RateLimitRule = { id: "case.principal", limit: 240, windowMs: 60_000, scope: "principal", onStoreError: "allow" };

const response = {
  parent: ownerCaseViewSchema,
  staff: staffOwnCaseViewSchema,
  officer: officerCaseViewSchema,
  admin: adminCaseViewSchema,
} as const;

export const GET = defineRoute({
  api: "API-004",
  params,
  response,
  rateLimit: [CASE_READ],
  handler: async ({ principal, params: p, requestId }): Promise<OwnerCaseView | StaffOwnCaseView | OfficerCaseView | AdminCaseView> => {
    const r = await readCase(principal, p.id, { requestId });
    if (r.kind === "hidden") throw new ApiError("E-004", { caseId: r.caseId ?? undefined });
    return r.view.data;
  },
});

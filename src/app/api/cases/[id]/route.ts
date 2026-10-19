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
//
// API-005 PATCH /api/cases/:id (TASK-049, P3-102; FR-029, BR-025; TC-018). Owning
// parent only. Reviewed draft + confirmed=true + expected_version; the service
// editMissingCase (commands.ts) does the lock, version recheck, snapshot, status
// guard, void of pending candidates, queue reconcile, and the case.edited audit row.
// edit-view.ts re-projects the resulting row through projectCaseFor so the route
// returns an OwnerCaseView (the per-role DTO allowlist). E-018 keeps terminal and
// redacted reports locked, E-005 surfaces a stale expected_version, E-004 covers
// hidden or other-party rows. No optimistic false success: the response is built
// only from the row the service returned inside the same transaction.
import { type AdminCaseView, type OfficerCaseView, type OwnerCaseView, type StaffOwnCaseView, type UpdateCaseRequest } from "@/contracts";
import { readCase } from "@/server/case";
import { editOwnerCase } from "@/server/parent/edit-view";
import { ApiError, defineRoute, type RateLimitRule } from "../../_shared";
import { adminCaseViewSchema, officerCaseViewSchema, ownerCaseViewSchema, staffOwnCaseViewSchema, updateCaseRequestSchema } from "@/contracts/schemas";
import { z } from "zod";

export const runtime = "nodejs"; // pg

// Keep malformed path IDs inside the authenticated E-004 path. readCase returns
// hidden without querying PostgreSQL for non-UUIDs; the route then audits the
// denial with a null case FK, indistinguishable from an unknown valid UUID.
const params = z.strictObject({ id: z.string().max(64) });

// Not from the spec pack: a documented default. Per-role, per-principal reads; no extra
// keys, so the default is a single per-principal window.
const CASE_READ: RateLimitRule = { id: "case.principal", limit: 240, windowMs: 60_000, scope: "principal", onStoreError: "allow" };

// Edits are rare and authoritative. Tighter window than read so a parent can't hammer
// the same case in a loop; the service's E-005 stays the source of truth.
const CASE_EDIT: RateLimitRule = { id: "case.edit.principal", limit: 60, windowMs: 60_000, scope: "principal", onStoreError: "allow" };

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

export const PATCH = defineRoute({
  api: "API-005",
  params,
  body: updateCaseRequestSchema,
  response: ownerCaseViewSchema,
  rateLimit: [CASE_EDIT],
  handler: async ({ principal, params: p, body, requestId }): Promise<OwnerCaseView> => {
    return editOwnerCase(principal, p.id, body as UpdateCaseRequest, { requestId });
  },
});
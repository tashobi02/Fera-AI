// API-007 service (TASK-026, COMP-034): a staff member's or officer's reviewed found-child
// report. Owner: Masnun. Server-only.
//
// The case service (`createFoundCase`) enforces role, ownership, idempotency, audit and the
// one-transaction write. This function only turns its row into the contract response:
// the caller's own report plus `matching_state`, never candidate details (D2A API-007).
import { createFoundResponseSchema, type CreateFoundRequest, type CreateFoundResponse } from "@/contracts";
import { projectCaseFor, userPrincipal, type Principal } from "@/contracts/server";
import { ApiError } from "@/app/api/_shared/envelope";
import { createFoundCase, type ServiceContext } from "@/server/case";

export type LogFoundDeps = { createFoundCase: typeof createFoundCase };
const defaultDeps: LogFoundDeps = { createFoundCase };

export async function logFoundCase(
  principal: Principal,
  request: CreateFoundRequest,
  ctx: ServiceContext = {},
  deps: LogFoundDeps = defaultDeps,
): Promise<CreateFoundResponse> {
  // Parents have no found-report access (D2A §9.2); refuse before touching the case service.
  if (principal.kind !== "user") throw new ApiError("E-003");
  const { case: row, replayed } = await deps.createFoundCase(principal, request, ctx);
  // The response is the caller's own staff view even for a verified officer: the contracts
  // have no "own found report" view for officers, and API-007 promises StaffOwnCaseView.
  // The case service already checked ownership, so projecting as the same user with the
  // staff role cannot reveal anything the creator did not just submit.
  // Follow-up (OD-026-1): add an own-found-report projection to src/contracts (frozen; needs
  // an all-owner PR) and delete this re-projection.
  const asStaff = userPrincipal({ id: principal.userId, role: "staff", verified: false, is_active: principal.isActive });
  const view = projectCaseFor(asStaff, row, { districtNameBn: null, duplicateOf: [] });
  if (view?.view !== "staff_own") throw new Error("found report is not the caller's own");
  return createFoundResponseSchema.parse({ ...view.data, replayed });
}

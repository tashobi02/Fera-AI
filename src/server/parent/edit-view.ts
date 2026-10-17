// API-005 / SCREEN-006 owner edit view (TASK-049, P3-102; D2A §5.3/API-005; FR-029,
// BR-025; TC-018). Wraps the existing editMissingCase (commands.ts) and re-projects
// the updated CaseRow through projectCaseFor so the route returns an OwnerCaseView
// (the per-role DTO allowlist). The lifecycle, version, status, audit, candidates
// and matching state are all owned by editMissingCase; this file never re-implements
// them.
//
// - E-001 invalid input, E-004 hidden/other-party, E-005 stale version, E-018
//   terminal/redacted, E-019 not a parent — all come from the service and the route
//   envelope. No optimistic success: the response is only built from the row the
//   service returned inside the same transaction.
// - editable: false in the response does not mean the route failed; it just means
//   the parent must not keep editing. The page renders the locked copy.
import { ApiError } from "@/app/api/_shared/envelope";
import type { OwnerCaseView, UpdateCaseRequest } from "@/contracts";
import { isUuid } from "@/contracts";
import { projectCaseFor, type Principal } from "@/contracts/server";
import type { ServiceContext } from "../case/state";
import { editMissingCase } from "../case/commands";

const NO_OFFICER_CONTEXT = { districtNameBn: null, duplicateOf: [] };

// Thin wrapper that re-uses editMissingCase and then projects the result. The
// service throws the same errors the route already handles (E-001/004/005/018); we
// let them propagate and only own the final shape. The principal must be a parent;
// editMissingCase re-checks the role inside its transaction, so this thin wrapper
// never duplicates the policy.
export async function editOwnerCase(
  principal: Principal,
  caseId: string,
  request: UpdateCaseRequest,
  ctx: ServiceContext = {},
): Promise<OwnerCaseView> {
  if (!isUuid(caseId)) throw new ApiError("E-004");
  const updated = await editMissingCase(principal, caseId, request, ctx);
  const view = projectCaseFor(principal, updated, NO_OFFICER_CONTEXT);
  if (!view || view.view !== "owner") throw new ApiError("E-021", { reason: "authorize" });
  return view.data;
}

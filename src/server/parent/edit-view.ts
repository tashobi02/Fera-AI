// API-005 / SCREEN-006 owner edit view (TASK-049, P3-102; D2A §5.3/API-005; FR-029,
// BR-025; TC-018). Wraps editMissingCase, awaits rematching after its transaction
// commits, and rereads the per-role owner view so matching_state is current. The
// lifecycle, version, status, audit, candidates and matching state are owned by the
// case/matcher services; this file never re-implements them.
//
// - E-001 invalid input, E-004 hidden/other-party, E-005 stale version, E-018
//   terminal/redacted, E-019 not a parent — all come from the service and the route
//   envelope. The owner response is reread after awaited matching, so it includes the
//   persisted success or failure state.
// - editable: false in the response does not mean the route failed; it just means
//   the parent must not keep editing. The page renders the locked copy.
import { ApiError } from "@/app/api/_shared/envelope";
import type { OwnerCaseView, UpdateCaseRequest } from "@/contracts";
import { isUuid } from "@/contracts";
import type { Principal } from "@/contracts/server";
import { fireMatcherPostcommit } from "../case/postcommit";
import type { ServiceContext } from "../case/state";
import { editMissingCase } from "../case/commands";
import { readCase } from "../case";

export type EditOwnerCaseDeps = {
  runMatcherPostcommit: typeof fireMatcherPostcommit;
};

const defaultDeps: EditOwnerCaseDeps = { runMatcherPostcommit: fireMatcherPostcommit };

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
  deps: EditOwnerCaseDeps = defaultDeps,
): Promise<OwnerCaseView> {
  if (!isUuid(caseId)) throw new ApiError("E-004");
  const updated = await editMissingCase(principal, caseId, request, ctx);
  await deps.runMatcherPostcommit(updated.id, ctx, "API-005");
  const current = await readCase(principal, updated.id, ctx);
  if (current.kind !== "ok" || current.view.view !== "owner") {
    throw new ApiError("E-021", { reason: "response" });
  }
  return current.view.data;
}

// API-007 service (TASK-026, COMP-034): a staff member's or officer's reviewed found-child
// report. Owner: Masnun. Server-only.
//
// The case service (`createFoundCase`) enforces role, ownership, idempotency, audit and the
// one-transaction write. This function only turns its row into the contract response:
// the caller's own report plus `matching_state`, never candidate details (D2A API-007).
//
// After-commit hook (TASK-017d / P3-040): a fresh, non-replayed found report
// changes the candidate space for open missing cases. Production awaits the
// bounded matcher batch after the found row commits; a replay never re-fires.
import { createFoundResponseSchema, type CreateFoundRequest, type CreateFoundResponse } from "@/contracts";
import { projectCaseFor, userPrincipal, type Principal } from "@/contracts/server";
import { ApiError } from "@/app/api/_shared/envelope";
import { createFoundCase, readCase, type ServiceContext } from "@/server/case";
import { fireMatcherPostcommit } from "@/server/case/postcommit";

export type LogFoundDeps = {
  createFoundCase: typeof createFoundCase;
  /** Tests that replace case persistence also inject or omit the postcommit seam. */
  runMatcherPostcommit?: typeof fireMatcherPostcommit;
};
const defaultDeps: LogFoundDeps = { createFoundCase, runMatcherPostcommit: fireMatcherPostcommit };

export async function logFoundCase(
  principal: Principal,
  request: CreateFoundRequest,
  ctx: ServiceContext = {},
  deps: LogFoundDeps = defaultDeps,
): Promise<CreateFoundResponse> {
  // Parents have no found-report access (D2A §9.2); refuse before touching the case service.
  if (principal.kind !== "user") throw new ApiError("E-003");
  const { case: row, replayed } = await deps.createFoundCase(principal, request, ctx);
  // The found row is already `open` in its create transaction. Await the real
  // fan-out after that commit so matcher failure cannot undo the saved report.
  const matcherResult = !replayed && deps.runMatcherPostcommit
    ? await deps.runMatcherPostcommit(row.id, ctx, "API-007")
    : null;
  // The response is the caller's own staff view even for a verified officer: the contracts
  // have no "own found report" view for officers, and API-007 promises StaffOwnCaseView.
  // The case service already checked ownership, so projecting as the same user with the
  // staff role cannot reveal anything the creator did not just submit.
  // Follow-up (OD-026-1): add an own-found-report projection to src/contracts (frozen; needs
  // an all-owner PR) and delete this re-projection.
  const asStaff = userPrincipal({ id: principal.userId, role: "staff", verified: false, is_active: principal.isActive });
  if (!asStaff) throw new ApiError("E-021", { reason: "response" });
  const view = projectCaseFor(asStaff, row, { districtNameBn: null, duplicateOf: [] });
  if (view?.view !== "staff_own") throw new Error("found report is not the caller's own");
  let persistedData = view.data;
  if (matcherResult) {
    const persisted = await readCase(asStaff, row.id, ctx);
    if (persisted.kind !== "ok" || persisted.view.view !== "staff_own") {
      throw new ApiError("E-021", { reason: "response" });
    }
    persistedData = persisted.view.data;
  }
  return createFoundResponseSchema.parse({
    ...persistedData,
    replayed,
  });
}

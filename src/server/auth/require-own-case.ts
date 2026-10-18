// Page guard for a parent's own report (TASK-024, SCREEN-004; BR-007, BR-010, TC-022).
//
//   const { view } = await requireOwnCase(id, `/report/${id}`);
//
// - requireRole(["parent"]) first: no parent cookie (or a desk role) ends in SCREEN-016,
//   with the desk-role denial audited by the page hook.
// - Then readCase through the owner projection (API-004 rules). A case that is absent,
//   malformed or owned by someone else is the same `hidden` result: one access.denied
//   row (FK kept only when the case exists), then notFound(). The page never confirms
//   that another parent's report exists.
// - When that audit write fails the guard throws (fail closed), like requireRole.
// - Only the owner view is ever returned; callers pass the client a subset of it.
import { notFound } from "next/navigation";
import type { OwnerCaseView } from "@/contracts";
import type { Principal } from "@/contracts/server";
import type { AuditDenied } from "@/app/api/_shared/compose";
import { createLogger, describeError } from "@/app/api/_shared/log";
import { newRequestId } from "@/app/api/_shared/request";
import { auditAccessDenied } from "@/server/audit";
import { readCase } from "@/server/case";
import { PageAuditUnavailableError, requireRole } from "./require-role";

export type OwnCaseDeps = {
  read?: typeof readCase;
  auditDenied?: AuditDenied;
  role?: typeof requireRole;
};

const logger = createLogger();

export async function requireOwnCase(
  caseId: string,
  returnTo: string,
  deps: OwnCaseDeps = {},
): Promise<{ principal: Principal; view: OwnerCaseView }> {
  const { principal } = await (deps.role ?? requireRole)(["parent"], returnTo);
  const requestId = newRequestId();
  const result = await (deps.read ?? readCase)(principal, caseId, {
    requestId,
  });
  if (result.kind === "ok" && result.view.view === "owner")
    return { principal, view: result.view.data };

  try {
    await (deps.auditDenied ?? auditAccessDenied)({
      principal,
      api: "API-004",
      requestId,
      errorId: "E-004",
      reason: "authorize",
      caseId: result.kind === "hidden" ? result.caseId : caseId,
    });
  } catch (err) {
    logger.error({
      event: "audit.unavailable",
      stage: "audit",
      error_id: "E-021",
      original_error_id: "E-004",
      ...describeError(err),
    });
    throw new PageAuditUnavailableError();
  }
  notFound();
}

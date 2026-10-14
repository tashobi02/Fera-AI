// Closure (TASK-015, COMP-014; API-011; FR-018; BR-012; TC-010/032). TASK-029 owns the
// API-011 route and SCREEN-012; it calls closeCase() and returns its result.
//
// A closure records a synthetic coordination outcome, never a rescue, return or safe
// reunification. Rules (contracts allowedCloseOutcome, D2A API-011, D2B E-017):
//   - coordination_recorded: the missing report is confirmed and its confirmed pair has
//     a referral record (simulation); otherwise E-017 "a referral is needed".
//   - resolved_outside_fera: the missing report is open; otherwise E-005.
//   - found reports never close (they end as referred): E-005 (TC-032).
//   - stale expected_version → E-005; the note is stored, never audited.
import { ApiError } from "@/app/api/_shared/envelope";
import { allowedCloseOutcome, closeCaseResponseSchema, isMissingStatus, type CloseCaseRequest, type CloseCaseResponse } from "@/contracts";
import { effectiveRole, type Principal } from "@/contracts/server";
import { CASE_AUDIT_ACTIONS, actorFor } from "@/server/audit";
import type { PoolClient } from "pg";
import { lockCases } from "./lock";
import { applyStatus, type ServiceContext } from "./state";
import { withTransaction } from "./tx";

type Queryable = Pick<PoolClient, "query">;

async function hasConfirmedReferral(db: Queryable, missingCaseId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM referrals r JOIN match_candidates c ON c.id = r.candidate_id
     WHERE r.missing_case_id = $1 AND c.missing_case_id = $1 AND c.status = 'confirmed'`,
    [missingCaseId],
  );
  return rows.length > 0;
}

export type CloseResult = { response: CloseCaseResponse; caseId: string };

export async function closeCase(
  principal: Principal,
  caseId: string,
  request: CloseCaseRequest,
  ctx: ServiceContext = {},
): Promise<CloseResult> {
  // Record route (API-011): anything but an active verified officer is E-004.
  if (effectiveRole(principal) !== "officer" || principal.kind !== "user") throw new ApiError("E-004");
  const actor = actorFor(principal);
  return withTransaction(async (client) => {
    const { rows: officer } = await client.query(
      "SELECT id FROM users WHERE id = $1 AND role = 'officer' AND verified AND is_active FOR SHARE",
      [principal.userId],
    );
    if (officer.length !== 1) throw new ApiError("E-004");
    const row = (await lockCases(client, [caseId])).get(caseId.toLowerCase());
    if (!row) throw new ApiError("E-004");
    if (row.kind !== "missing" || row.anonymised_at !== null || !isMissingStatus(row.status)) throw new ApiError("E-005");
    if (row.version !== request.expected_version) throw new ApiError("E-005");

    if (request.outcome === "coordination_recorded") {
      if (row.status !== "confirmed" || !(await hasConfirmedReferral(client, row.id))) throw new ApiError("E-017");
    } else if (allowedCloseOutcome(row.status) !== request.outcome) {
      throw new ApiError("E-005");
    }

    const closed = await applyStatus(client, actor, row, {
      to: "closed",
      outcome: request.outcome,
      outcomeNote: request.note,
      api: "API-011",
      requestId: ctx.requestId,
      audit: { action: CASE_AUDIT_ACTIONS.caseClosed, details: { outcome: request.outcome, reason_recorded: true } },
    });
    if (!closed.closed_at) throw new ApiError("E-005");
    return {
      caseId: closed.id,
      response: closeCaseResponseSchema.parse({ ref_code: closed.ref_code, status: "closed", closed_at: closed.closed_at }),
    };
  }, { pool: ctx.pool });
}

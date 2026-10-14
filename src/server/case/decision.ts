// Officer decisions on a match candidate (TASK-015, COMP-014; API-010; FR-016/017;
// BR-001/005/019/020/024; TC-010/011/029/046/047/053). D2A §3.4 step 7: "Officer
// decisions go through COMP-014". TASK-028 (Masnun) owns the API-010 route and SCREEN-010;
// it calls decideCandidate() and returns `result.response`.
//
// AI never decides: these functions run only for an explicit, active, verified officer
// principal, re-read and share-locked from `users` inside the transaction, so a
// concurrent un-verify (API-017) waits for the decision or the decision sees it.
//
// Confirm, one transaction (BR-020):
//   1. lock the officer row (FOR SHARE) and require role officer, verified, active
//   2. lock both endpoints and every report sharing a pending candidate with them, in
//      ascending UUID order (lock.ts), then the candidates
//   3. recheck: candidate pending, live versions equal the candidate's and the expected
//      versions, both endpoints live (open/matched_pending_review, not redacted)
//   4. insert review_decisions (confirm), set the candidate confirmed
//   5. void every competing pending candidate on either endpoint
//   6. audit match.confirm; insert the referral record (simulation) and audit it
//   7. missing → confirmed, found → referred (closed_at), each audited
//   8. return every other affected report to the right queue state (TC-053)
//   9. deferred pair checks fire before COMMIT (tx.ts)
// Reject: steps 1–3 on the pair only, a reasoned decision, candidate rejected, audit
// match.reject, then the pair's queue state is reconciled. A rejected pair is not
// re-suggested at the same versions (unique candidate key, BR-019).
//
// There is no "defer" decision in the pack (decision_t is confirm | reject): leaving a
// candidate pending is the deferral, and nothing is written for it.
import { ApiError } from "@/app/api/_shared/envelope";
import { decisionResponseSchema, type CaseStatus, type DecisionRequest, type DecisionResponse } from "@/contracts";
import { effectiveRole, type CaseRow, type Principal } from "@/contracts/server";
import { CASE_AUDIT_ACTIONS, actorFor, appendAudit } from "@/server/audit";
import type { PoolClient } from "pg";
import { voidPendingCandidates } from "./candidates";
import { lockCandidates, lockCases, lockNeighbourhood } from "./lock";
import { isQueueStatus } from "./rows";
import { applyStatusPath, reconcileQueueState, type ServiceContext } from "./state";
import { withTransaction } from "./tx";

type Queryable = Pick<PoolClient, "query">;

export type DecisionResult = {
  response: DecisionResponse; // the API-010 DTO (officer only)
  candidateId: string;
  missingCaseId: string;
  foundCaseId: string;
  decisionId: string;
  referralId: string | null;
  voidedCandidateIds: string[];
  reopenedCaseIds: string[];
};

type CandidateRow = {
  id: string;
  missing_case_id: string;
  found_case_id: string;
  missing_version: number;
  found_version: number;
  score: string; // numeric(5,2) arrives as text
  rank: number;
  status: string;
};

// Officer authority, rechecked in the transaction (BR-024). FOR SHARE needs the
// fera_app UPDATE (verified) grant on users, which it has for API-017.
async function lockVerifiedOfficer(db: Queryable, userId: string): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT id FROM users WHERE id = $1 AND role = 'officer' AND verified AND is_active FOR SHARE",
    [userId],
  );
  return rows.length === 1;
}

async function readCandidate(db: Queryable, id: string): Promise<CandidateRow | null> {
  const { rows } = await db.query(
    `SELECT id, missing_case_id, found_case_id, missing_version, found_version, score::text AS score, rank, status
     FROM match_candidates WHERE id = $1`,
    [id],
  );
  return (rows[0] as CandidateRow | undefined) ?? null;
}

const live = (row: CaseRow | undefined): row is CaseRow => !!row && row.anonymised_at === null && isQueueStatus(row.status);

// Steps to the decision state from open or matched_pending_review (each audited).
const pathTo = (row: CaseRow, target: CaseStatus): CaseStatus[] =>
  row.status === "open" ? ["matched_pending_review", target] : [target];

function respond(c: CandidateRow, decided: "confirmed" | "rejected", m: CaseRow, f: CaseRow, referralId: string | null): DecisionResponse {
  return decisionResponseSchema.parse({
    candidate_status: decided,
    missing: { ref_code: m.ref_code, status: m.status, version: m.version },
    found: { ref_code: f.ref_code, status: f.status, version: f.version },
    referral_id: referralId,
    referral_state: referralId ? "recorded" : null,
    referral_is_simulated: true,
  });
}

export async function decideCandidate(
  principal: Principal,
  candidateId: string,
  request: DecisionRequest,
  ctx: ServiceContext = {},
): Promise<DecisionResult> {
  // Record route (API-010): anything but an active verified officer is E-004.
  if (effectiveRole(principal) !== "officer" || principal.kind !== "user") throw new ApiError("E-004");
  const actor = actorFor(principal);
  const officerId = principal.userId;
  const api = "API-010" as const;
  const requestId = ctx.requestId;

  return withTransaction(async (client) => {
    if (!(await lockVerifiedOfficer(client, officerId))) throw new ApiError("E-004");
    const peek = await readCandidate(client, candidateId);
    if (!peek) throw new ApiError("E-004");
    const pair = [peek.missing_case_id, peek.found_case_id];

    const confirm = request.decision === "confirm";
    const { cases, pending } = confirm
      ? await lockNeighbourhood(client, pair)
      : { cases: await lockCases(client, pair), pending: [] };
    if (!confirm) await lockCandidates(client, [peek.id]);

    // Recheck everything under the locks.
    const c = await readCandidate(client, peek.id);
    const m = cases.get(peek.missing_case_id);
    const f = cases.get(peek.found_case_id);
    if (!c || c.status !== "pending" || !live(m) || !live(f) || m.kind !== "missing" || f.kind !== "found") {
      throw new ApiError("E-005");
    }
    if (
      c.missing_version !== m.version || c.found_version !== f.version ||
      request.expected_missing_version !== m.version || request.expected_found_version !== f.version
    ) {
      throw new ApiError("E-005"); // TC-046: stale decision, nothing written
    }

    const refs = {
      candidate_id: c.id,
      missing_ref: m.ref_code,
      found_ref: f.ref_code,
      missing_version: m.version,
      found_version: f.version,
      score: Number(c.score),
      rank: c.rank,
    };
    const reason = request.reason ?? null;
    const { rows: decisionRows } = await client.query(
      "INSERT INTO review_decisions (candidate_id, officer_id, decision, reason) VALUES ($1, $2, $3::decision_t, $4) RETURNING id",
      [c.id, officerId, request.decision, reason],
    );
    const decisionId = (decisionRows[0] as { id: string }).id;

    if (request.decision === "reject") {
      await client.query("UPDATE match_candidates SET status = 'rejected', decided_at = now() WHERE id = $1", [c.id]);
      await appendAudit(client, actor, {
        action: CASE_AUDIT_ACTIONS.matchReject,
        caseId: m.id,
        candidateId: c.id,
        requestId,
        details: { ...refs, api, decision: "reject", candidate_status: "rejected", reason_recorded: true },
      });
      const reopened = await reconcileQueueState(client, actor, pair, { api, requestId });
      const after = await lockCases(client, pair);
      return {
        response: respond(c, "rejected", after.get(m.id)!, after.get(f.id)!, null),
        candidateId: c.id,
        missingCaseId: m.id,
        foundCaseId: f.id,
        decisionId,
        referralId: null,
        voidedCandidateIds: [],
        reopenedCaseIds: reopened,
      };
    }

    await client.query("UPDATE match_candidates SET status = 'confirmed', decided_at = now() WHERE id = $1", [c.id]);
    const competitors = pending.filter((p) => p.id !== c.id);
    const voided = await voidPendingCandidates(client, actor, competitors, new Set(pair), api, requestId);
    await appendAudit(client, actor, {
      action: CASE_AUDIT_ACTIONS.matchConfirm,
      caseId: m.id,
      candidateId: c.id,
      requestId,
      details: { ...refs, api, decision: "confirm", candidate_status: "confirmed", reason_recorded: reason !== null },
    });

    // Internal record only (BR-005): no delivery, receipt, custody or return is implied.
    const agency = request.agency_name ?? null;
    const { rows: referralRows } = await client.query(
      `INSERT INTO referrals (candidate_id, found_case_id, missing_case_id, referred_by, agency_name)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'শিশু সুরক্ষা সেবা')) RETURNING id`,
      [c.id, f.id, m.id, officerId, agency],
    );
    const referralId = (referralRows[0] as { id: string }).id;
    await appendAudit(client, actor, {
      action: CASE_AUDIT_ACTIONS.referralRecorded,
      caseId: f.id,
      candidateId: c.id,
      requestId,
      details: { ...refs, ref_code: f.ref_code, api, referral_simulated: true },
    });

    const confirmedM = await applyStatusPath(client, actor, m, pathTo(m, "confirmed"), { api, requestId });
    const referredF = await applyStatusPath(client, actor, f, pathTo(f, "referred"), { api, requestId });

    const affected = competitors.flatMap((p) => [p.missing_case_id, p.found_case_id]).filter((id) => id !== m.id && id !== f.id);
    const reopened = await reconcileQueueState(client, actor, affected, { api, requestId });
    return {
      response: respond(c, "confirmed", confirmedM, referredF, referralId),
      candidateId: c.id,
      missingCaseId: m.id,
      foundCaseId: f.id,
      decisionId,
      referralId,
      voidedCandidateIds: voided,
      reopenedCaseIds: reopened,
    };
  }, { pool: ctx.pool });
}

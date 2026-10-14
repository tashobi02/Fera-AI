// Candidate invalidation shared by the confirm transaction (competitors, BR-020) and
// owner edits (stale versions, BR-019/025). Callers hold the locks on both endpoints of
// every listed candidate (lock.ts). Status `voided` follows D1 STORY-019/BR-020 and D3
// row 12; `superseded` is left to the matcher for its own replacement of pending rows
// (OD-015-2).
import type { ApiId } from "@/contracts/server";
import { CASE_AUDIT_ACTIONS, appendAudit, type AuditActor } from "@/server/audit";
import type { Queryable } from "@/server/db/queryable";
import { col, asRow } from "@/server/db/decode";
import type { PendingCandidate } from "./rows";

// Voids the pending candidates and writes one match.voided row each. The row is filed
// on the endpoint outside `subject` (the reports the action is about), so that report's
// trail shows why its candidate disappeared; the subject records its own action.
export async function voidPendingCandidates(
  db: Queryable,
  actor: AuditActor,
  pending: readonly PendingCandidate[],
  subject: ReadonlySet<string>,
  api: ApiId,
  requestId?: string | null,
): Promise<string[]> {
  if (pending.length === 0) return [];
  const { rows } = await db.query(
    "UPDATE match_candidates SET status = 'voided', decided_at = clock_timestamp() WHERE id = ANY($1::uuid[]) AND status = 'pending' RETURNING id",
    [pending.map((c) => c.id)],
  );
  const voided = new Set(rows.map((r) => col.uuid("match_candidates", asRow("match_candidates", r), "id")));
  for (const c of pending) {
    if (!voided.has(c.id)) continue;
    const other = subject.has(c.missing_case_id) ? c.found_case_id : c.missing_case_id;
    await appendAudit(db, actor, {
      action: CASE_AUDIT_ACTIONS.matchVoided,
      caseId: other,
      candidateId: c.id,
      requestId,
      details: { candidate_status: "voided", api },
    });
  }
  return pending.filter((c) => voided.has(c.id)).map((c) => c.id);
}

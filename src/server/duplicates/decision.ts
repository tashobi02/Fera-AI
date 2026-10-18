// API-023 duplicate decision (TASK-051; FR-023/TC-038; BR-021; SCREEN-014). Owner: Masnun.
//
// Verified active officer marks a flagged duplicate link "same child" or "different".
// A "same child" decision never hides, merges or closes the two reports (FR-022,
// BR-021, SCREEN-014 "Possible duplicate flags do not hide reports"): the original
// case rows are left unchanged and only the link is updated. Both reports stay
// independently visible in every queue and search.
//
// One transaction (BR-020, D2A §8 Concurrency, D2A §5.5):
//   1. lock the officer row (FOR SHARE) and require role officer, verified, active
//   2. lock both endpoints in ascending UUID order with lockCases() (the case
//      service's lock protocol is reused so two concurrent decisions on disjoint
//      links cannot deadlock with the matcher or with a match decision)
//   3. lock the link row (FOR UPDATE) once the cases are held
//   4. re-read the link under the locks; refuse a second review on a settled link
//   5. refuse if the link's rule is 'same_phone' and the new status is 'confirmed_same'
//      (BR-021, FV-02, TC-038 — shared phone alone never confirms the same child).
//      The schema CHECK is the backstop; we mirror it here so the caller sees a
//      clean E-005 instead of an opaque check_violation.
//   6. UPDATE duplicate_links: status, resolved_by (officer id), resolved_at
//      (clock_timestamp), reason (3..500 chars, enforced by the request schema and
//      the duplicate_links CHECK). The deferred check_duplicate_integrity trigger
//      and the duplicate_links CHECKs fire on COMMIT.
//   7. append one audit_log row using duplicate.reviewed with
//      duplicate_status + duplicate_rule detail keys (the audit-action contracts
//      are registered in the app-level action allowlist; case_id is the lower endpoint case_a, the
//      audit_log.candidate_id FK points at match_candidates and stays null).
//   8. commit.
//
// Honest-conflict rule (TASK-051 spec; "allow honest conflicts after
// changed/redacted/terminal endpoints per spec"). The flag carries no version
// metadata of its own; the detector just stored (case_a, case_b, score, rule).
// The spec is silent on endpoint drift between flagging and reviewing. The
// case service's close decision refuses on stale version; this service does
// NOT refuse on endpoint drift. The reason text is required (3..500 chars) and
// recorded; the audit details show the live ref code of the lower endpoint so the
// trail is honest when an officer resolves a link whose endpoints have since
// moved on. A payload-redacted endpoint (anonymised_at != null) is allowed
// (the case row is still there, just pseudonymised, and the link is purely
// metadata). A terminal endpoint (closed/referred) is allowed too: resolving a
// link does not alter the case row, and confirmed-pair history is not
// retroactively changed.
//
// Stale-link refusals are limited to: link missing (E-004), link already
// resolved (E-005), phone-only confirming same child (E-005), or cross-kind
// pair (E-005). Endpoints that are redacted or terminal are NOT stale — they
// stay reviewable, and the case rows remain the source of truth for current
// state.
import { ApiError } from "@/app/api/_shared/envelope";
import {
  DUPLICATE_RULES,
  DUPLICATE_STATUSES,
  duplicateDecisionAllowed,
  duplicateDecisionResponseSchema,
  isUuid,
  type DuplicateDecisionRequest,
  type DuplicateDecisionResponse,
  type DuplicateRule,
  type DuplicateStatus,
} from "@/contracts";
import { effectiveRole, type Principal } from "@/contracts/server";
import { CASE_AUDIT_ACTIONS, actorFor, appendAudit, type AuditDetails } from "@/server/audit";
import { lockCases, sortedIds, withTransaction } from "@/server/case/internal";
import type { Connectable } from "@/server/case/tx";
import { asRow, col, firstRow } from "@/server/db/decode";
import type { Queryable } from "@/server/db/queryable";

export type DecisionResult = {
  response: DuplicateDecisionResponse;
  linkId: string;
  caseA: string;
  caseB: string;
  auditId: number;
};

const api = "API-023" as const;
const auditAction = CASE_AUDIT_ACTIONS.duplicateReviewed;

type LinkRow = {
  id: string;
  case_a: string;
  case_b: string;
  status: DuplicateStatus;
  rule: DuplicateRule;
  score: number;
};

const TABLE = "duplicate_links";
function mapLink(value: unknown): LinkRow {
  const r = asRow(TABLE, value);
  return {
    id: col.uuid(TABLE, r, "id"),
    case_a: col.uuid(TABLE, r, "case_a"),
    case_b: col.uuid(TABLE, r, "case_b"),
    status: col.oneOf(TABLE, r, "status", DUPLICATE_STATUSES),
    rule: col.oneOf(TABLE, r, "rule", DUPLICATE_RULES),
    score: col.numeric(TABLE, r, "score"),
  };
}

async function readLinkRow(db: Queryable, id: string): Promise<LinkRow | null> {
  const { rows } = await db.query(
    `SELECT id, case_a, case_b, status, rule, score::text AS score
     FROM duplicate_links WHERE id = $1`,
    [id],
  );
  const row = firstRow(TABLE, rows);
  return row ? mapLink(row) : null;
}

// Officer authority, rechecked in the transaction (BR-024). FOR SHARE needs the
// fera_app UPDATE (verified) grant on users, which it has for API-017.
async function lockVerifiedOfficer(db: Queryable, userId: string): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT id FROM users WHERE id = $1 AND role = 'officer' AND verified AND is_active FOR SHARE",
    [userId],
  );
  return rows.length === 1;
}

export type DecideContext = { requestId?: string | null; pool?: Connectable };

export async function decideDuplicate(
  principal: Principal,
  linkId: string,
  request: DuplicateDecisionRequest,
  ctx: DecideContext = {},
): Promise<DecisionResult> {
  // Record route (API-023): anything but an active verified officer, or a malformed
  // link ID, is E-004 before any statement runs. The same response covers absent
  // and forbidden records (BR-010, TC-052).
  if (effectiveRole(principal) !== "officer" || principal.kind !== "user") throw new ApiError("E-004");
  if (!isUuid(linkId)) throw new ApiError("E-004");
  const officerId = principal.userId;
  const requestId = ctx.requestId ?? null;

  return withTransaction(async (client) => {
    if (!(await lockVerifiedOfficer(client, officerId))) throw new ApiError("E-004");

    // First read without locks: a missing link is E-004; a malformed one already
    // threw above. We need the two endpoint UUIDs to compute the sorted lock order.
    const peek = await readLinkRow(client, linkId);
    if (!peek) throw new ApiError("E-004");

    // Sorted UUID lock (BR-020, D2A §8): the schema requires case_a < case_b; we
    // additionally feed both through sortedIds() so a defensive ordering holds if
    // a future trigger ever loosens the check.
    const sorted = sortedIds([peek.case_a, peek.case_b]);
    const cases = await lockCases(client, sorted);
    const aId = sorted[0]!;
    const bId = sorted[1]!;
    const aRow = cases.get(aId);
    const bRow = cases.get(bId);
    if (!aRow || !bRow) throw new ApiError("E-004");

    // Lock the link row (FOR UPDATE) after the cases; concurrent decisions on
    // disjoint links cannot deadlock because the case lock is taken in the same
    // sorted order.
    const linkLockRes = await client.query(
      "SELECT id FROM duplicate_links WHERE id = $1 FOR UPDATE",
      [peek.id],
    );
    if (linkLockRes.rows.length !== 1) throw new ApiError("E-004");

    // Recheck the link under the lock. A second review on a settled link is E-005
    // (the database's resolved_at CHECKs would catch it too, but a clean error
    // before any UPDATE is friendlier and matches the match-decision pattern).
    const link = await readLinkRow(client, peek.id);
    if (!link) throw new ApiError("E-004");
    if (link.status !== "flagged") throw new ApiError("E-005");
    if (aRow.kind !== bRow.kind) throw new ApiError("E-005");

    const nextStatus: Exclude<DuplicateStatus, "flagged"> = request.status;
    // Shared phone alone never confirms the same child (BR-021, FV-02, TC-038).
    // The schema CHECK is the backstop; mirror it here so the route returns E-005
    // and not an opaque check_violation.
    if (!duplicateDecisionAllowed(link.rule, nextStatus)) throw new ApiError("E-005");

    const updateRes = await client.query(
      `UPDATE duplicate_links
         SET status = $2::duplicate_status,
             resolved_by = $3,
             resolved_at = clock_timestamp(),
             reason = $4
       WHERE id = $1 AND status = 'flagged'
       RETURNING id, status, rule`,
      [link.id, nextStatus, officerId, request.reason],
    );
    if (updateRes.rows.length !== 1) throw new ApiError("E-005");

    const details: AuditDetails = {
      api,
      duplicate_status: nextStatus,
      duplicate_rule: link.rule,
      duplicate_link_id: link.id,
      reason_recorded: true,
      ...(aRow.kind === "missing" ? { missing_ref: aRow.ref_code } : { found_ref: aRow.ref_code }),
    };
    // candidate_id is a match-candidate FK, so it stays null. The server-only
    // duplicate_link_id identifies this decision even when links share case_a.
    const auditId = await appendAudit(client, actorFor(principal), {
      action: auditAction,
      caseId: link.case_a,
      requestId,
      details,
    });

    return {
      response: duplicateDecisionResponseSchema.parse({
        link_id: link.id,
        status: nextStatus,
        audit_id: auditId,
      }),
      linkId: link.id,
      caseA: aId,
      caseB: bId,
      auditId,
    };
  }, { pool: ctx.pool, attempts: 1 });
}

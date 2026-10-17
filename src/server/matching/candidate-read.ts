// API-009 candidate read (TASK-028, COMP-037 data). Owner: Masnun. Server-only.
//
// An active verified officer opens one candidate: both reports through the officer
// projection (candidate detail may carry the raw contact phone, D2A §5.4), the similarity
// score and its stored components. Absent, malformed and forbidden are the same `hidden`
// result: the route throws E-004 and the API layer writes the access.denied row (BR-010).
//
// - Read only. Nothing here decides, confirms or changes a state.
// - When a raw contact phone is served, `case.contact_viewed` is written for that report in
//   the same transaction, so the read fails if the audit fails.
// - `qualified` is true only while the candidate is pending, both reports are still at the
//   versions it was made for, both are still in a queue status and neither is redacted. An opened but no longer
//   qualified candidate is shown as such (CN-09); deciding it is E-005.
import { isUuid, type CandidateDecisionView } from "@/contracts";
import { effectiveRole, projectCandidateFor, type Principal } from "@/contracts/server";
import { CASE_AUDIT_ACTIONS, actorFor, appendAudit } from "@/server/audit";
import { getCaseRow, officerContext, withTransaction, type TxOptions } from "@/server/case/internal";
import { RowShapeError, asRow, col, firstRow } from "@/server/db/decode";
import { QUEUE_STATUSES } from "@/server/case/rows";

// No column stores an explanation version yet (the matcher, TASK-017, owns it). A constant
// keeps the contract field honest until then (OD-028-2).
export const EXPLANATION_VERSION = "v1";

export type CandidateReadResult = { kind: "ok"; view: CandidateDecisionView } | { kind: "hidden"; caseId: string | null };

export type CandidateReadDeps = { withTransaction: typeof withTransaction };
const defaultDeps: CandidateReadDeps = { withTransaction };

function decodeComponents(value: unknown): Record<string, number | null> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new RowShapeError("match_candidates", "components");
  const out: Record<string, number | null> = {};
  for (const [key, v] of Object.entries(value)) {
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v))) throw new RowShapeError("match_candidates", "components");
    out[key] = v;
  }
  return out;
}

export async function readCandidate(
  principal: Principal,
  candidateId: string,
  ctx: { requestId?: string } & TxOptions = {},
  deps: CandidateReadDeps = defaultDeps,
): Promise<CandidateReadResult> {
  if (effectiveRole(principal) !== "officer" || principal.kind !== "user") return { kind: "hidden", caseId: null };
  if (!isUuid(candidateId)) return { kind: "hidden", caseId: null };
  const { requestId, ...txOpts } = ctx;

  return deps.withTransaction(async (client) => {
    // One snapshot for the candidate and both reports (no locks, nothing here decides): without
    // it an edit between the SELECTs could pair a candidate with a report it was not made for.
    // Must be the first statement of the transaction; the audit inserts below still write.
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const found = await client.query(
      `SELECT id, missing_case_id, found_case_id, missing_version, found_version, score, components, status
       FROM match_candidates WHERE id = $1`,
      [candidateId],
    );
    const c = firstRow("match_candidates", found.rows);
    if (!c) return { kind: "hidden", caseId: null } as const;
    const missingRow = await getCaseRow(client, col.uuid("match_candidates", c, "missing_case_id"));
    const foundRow = await getCaseRow(client, col.uuid("match_candidates", c, "found_case_id"));
    if (!missingRow || !foundRow) return { kind: "hidden", caseId: null } as const;

    const qualified =
      col.text("match_candidates", c, "status") === "pending" &&
      missingRow.version === col.int("match_candidates", c, "missing_version") &&
      foundRow.version === col.int("match_candidates", c, "found_version") &&
      QUEUE_STATUSES.includes(missingRow.status) &&
      QUEUE_STATUSES.includes(foundRow.status) &&
      missingRow.anonymised_at === null &&
      foundRow.anonymised_at === null;

    const read = projectCandidateFor(principal, {
      candidateId,
      missing: { row: missingRow, ctx: await officerContext(client, missingRow.id, missingRow.district_code) },
      found: { row: foundRow, ctx: await officerContext(client, foundRow.id, foundRow.district_code) },
      score: col.numeric("match_candidates", asRow("match_candidates", c), "score"),
      components: decodeComponents(c.components),
      explanationVersion: EXPLANATION_VERSION,
      qualified,
    });
    if (!read) return { kind: "hidden", caseId: missingRow.id } as const;

    for (const [served, row] of [
      [read.contactServed.missing, missingRow],
      [read.contactServed.found, foundRow],
    ] as const) {
      if (!served) continue;
      await appendAudit(client, actorFor(principal), {
        action: CASE_AUDIT_ACTIONS.caseContactViewed,
        caseId: row.id,
        requestId,
        details: { ref_code: row.ref_code, api: "API-009", contact_viewed: true },
      });
    }
    return { kind: "ok", view: read.data } as const;
  }, txOpts);
}

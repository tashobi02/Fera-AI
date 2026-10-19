// API-004 read through the per-role projections (TASK-015 / spec-kit T011; BR-007/010/024;
// TC-022/044/052). The route owns the HTTP layer:
//
//   const r = await readCase(principal, params.id, { requestId });
//   if (r.kind === "hidden") throw new ApiError("E-004", { caseId: r.caseId ?? undefined });
//   return r.view.data; // with the per-role response schema
//
// - Absent and forbidden are the same `hidden` result; the API layer writes the
//   access.denied row (null FK when the case does not exist).
// - When an officer is served a raw contact phone, the case.contact_viewed audit row is
//   written in the same transaction (D2A §5.4), so the read fails if the audit fails.
import { isUuid } from "@/contracts";
import { effectiveRole, projectCaseFor, type CaseReadView, type OfficerContext, type Principal } from "@/contracts/server";
import { CASE_AUDIT_ACTIONS, actorFor, appendAudit } from "@/server/audit";
import { getCaseRow } from "./rows";
import { asRow, col, firstRow } from "@/server/db/decode";
import type { Queryable } from "@/server/db/queryable";
import { txOptions, type ServiceContext } from "./state";
import { withTransaction } from "./tx";

// Only the officer projection uses district names and duplicate cues.
const NO_OFFICER_CONTEXT: OfficerContext = { districtNameBn: null, duplicateOf: [] };

export type ReadResult = { kind: "ok"; view: CaseReadView } | { kind: "hidden"; caseId: string | null };

export async function officerContext(db: Queryable, caseId: string, districtCode: number | null): Promise<OfficerContext> {
  const district = districtCode === null
    ? { rows: [] }
    : await db.query("SELECT name_bn FROM districts WHERE code = $1", [districtCode]);
  const dupes = await db.query(
    `SELECT c.id, c.ref_code, c.status FROM duplicate_links d
     JOIN cases c ON c.id = CASE WHEN d.case_a = $1 THEN d.case_b ELSE d.case_a END
     WHERE (d.case_a = $1 OR d.case_b = $1)
       AND c.anonymised_at IS NULL AND d.status <> 'dismissed' ORDER BY c.ref_code`,
    [caseId],
  );
  const d = firstRow("districts", district.rows);
  return {
    districtNameBn: d ? col.text("districts", d, "name_bn") : null,
    duplicateOf: dupes.rows.map((r) => {
      const row = asRow("cases", r);
      return {
        id: col.uuid("cases", row, "id"),
        ref: col.text("cases", row, "ref_code"),
        status: col.oneOf("cases", row, "status", ["submitted", "open", "matched_pending_review", "confirmed", "closed", "referred"] as const),
      };
    }),
  };
}

export async function readCase(principal: Principal, caseId: string, ctx: ServiceContext = {}): Promise<ReadResult> {
  if (!isUuid(caseId)) return { kind: "hidden", caseId: null };
  return withTransaction(async (client) => {
    const row = await getCaseRow(client, caseId);
    if (!row) return { kind: "hidden", caseId: null };
    const octx = effectiveRole(principal) === "officer" ? await officerContext(client, row.id, row.district_code) : NO_OFFICER_CONTEXT;
    const view = projectCaseFor(principal, row, octx);
    if (!view) return { kind: "hidden", caseId: row.id };
    if (view.view === "officer" && view.contactServed) {
      await appendAudit(client, actorFor(principal), {
        action: CASE_AUDIT_ACTIONS.caseContactViewed,
        caseId: row.id,
        requestId: ctx.requestId,
        details: { ref_code: row.ref_code, api: "API-004", contact_viewed: true },
      });
    }
    return { kind: "ok", view };
  }, txOptions(ctx));
}

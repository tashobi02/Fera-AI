// Safe audit projection reader (TASK-015, API-013; D2A §5.4, §9.2 row 1288; BR-010/024;
// FR-021; TC-016/052). The route owns the HTTP layer; it calls readCaseAudit() and
// returns the safe projection:
//
//   const r = await readCaseAudit(principal, caseId);
//   if (r.kind === "hidden") throw new ApiError("E-004", { caseId: r.caseId ?? undefined });
//   return r.view; // officerAuditResponseSchema | adminAuditResponseSchema (discriminated union)
//
// - The case row's `ref_code` is needed for the projection's per-row ref_code check
//   (D2A "details.ref_code is the audited case's own reference only"). The case lookup
//   returns the metadata only, not the child payload.
// - The audit rows are filtered to this case_id and joined with the actor's display
//   name. Each detail is then projected by the contract projection
//   (projections.ts projectAuditFor), which:
//     * officer: keeps every allowlisted operational detail (candidate ids, pair refs,
//       versions, scores, decisions, contact_viewed);
//     * admin: keeps only the metadata allowlist (no candidate ids, pair refs, scores,
//       decision detail, contact_viewed, or actor identity);
//     * anything else (parent, staff, unverified officer) → null and the route answers
//       E-003/E-004.
// - A row whose stored details fail the per-role schema (a stored value outside the
//   allowlist, another case's ref_code, or a free-text key) is withheld and counted
//   instead of failing the response (D2A "withheld counts stored rows that failed the
//   allowlist and were left out").
// - No child payload, contact, score, reason, note, free text, URL or raw network
//   address is read here. The raw query selects only the audit_log columns the
//   projection needs.
import { isUuid, toDhakaIso } from "@/contracts";
import { projectAuditFor, type AuditedCase, type AuditRow, type Principal } from "@/contracts/server";
import type { Queryable } from "@/server/db/queryable";
import { RowShapeError, asRow, col, firstRow } from "@/server/db/decode";
import { getPool } from "@/server/db/pool";

const T = "audit_log";

type AuditDetail = Record<string, unknown>;

// pg returns jsonb as parsed objects; safe-typed as unknown here.
function detailOf(r: unknown): AuditDetail {
  const v = (asRow(T, r) as Record<string, unknown>).details;
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  return v as AuditDetail;
}

function mapAuditRow(value: unknown): AuditRow {
  const r = asRow(T, value);
  const at = col.dateOrNull(T, r, "at");
  if (at === null) throw new RowShapeError(T, "at");
  return {
    at: toDhakaIso(at.getTime()),
    actor_type: col.oneOf(T, r, "actor_type", ["parent", "staff", "officer", "admin", "system"] as const),
    actor_user_id: col.uuidOrNull(T, r, "actor_user_id"),
    actor_session_id: col.uuidOrNull(T, r, "actor_session_id"),
    actor_display: col.textOrNull(T, r, "actor_display"),
    action: col.text(T, r, "action"),
    case_id: col.uuidOrNull(T, r, "case_id"),
    candidate_id: col.uuidOrNull(T, r, "candidate_id"),
    details: detailOf(r),
  };
}

export type AuditReadResult =
  | { kind: "ok"; view: import("@/contracts").AuditResponse }
  | { kind: "hidden"; caseId: string | null };

// Reads the safe audit projection for `caseId`. Absent and forbidden are the same
// `hidden` result; the API layer writes the access.denied row (null FK for an unknown
// case, per TC-052). A non-officer/non-admin principal answers E-003/E-004.
//
// `ctx.requestId` is accepted for parity with the other read services (e.g. readCase),
// even though this read does not write an audit row of its own; the projection is
// strictly read-only and append-only audit invariants are preserved.
export async function readCaseAudit(
  principal: Principal,
  caseId: string,
  ctx: { db?: Queryable; requestId?: string | null } = {},
): Promise<AuditReadResult> {
  if (!isUuid(caseId)) return { kind: "hidden", caseId: null };
  const db: Queryable = ctx.db ?? getPool();

  // Step 1: case metadata only — no child payload, no contact, no draft.
  const metaRows = await db.query("SELECT id, ref_code FROM cases WHERE id = $1", [caseId.toLowerCase()]);
  const metaRow = firstRow("cases", metaRows.rows);
  if (!metaRow) return { kind: "hidden", caseId: null };
  const meta: AuditedCase = { id: col.uuid("cases", metaRow, "id"), ref_code: col.text("cases", metaRow, "ref_code") };

  // Step 2: audit rows for this case, joined with the actor's display name.
  const { rows } = await db.query(
    `SELECT a.at, a.actor_type, a.actor_user_id, a.actor_session_id, u.display_name AS actor_display,
            a.action, a.case_id, a.candidate_id, a.details
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.case_id = $1
      ORDER BY a.at, a.id`,
    [meta.id],
  );
  const auditRows: AuditRow[] = rows.map(mapAuditRow);

  // Step 3: per-role projection. Anything but officer/admin is null → the route
  // answers E-003/E-004.
  const projected = projectAuditFor(principal, meta, auditRows);
  if (!projected) return { kind: "hidden", caseId: meta.id };
  return { kind: "ok", view: projected };
}

// API-018 / SCREEN-006 owner read of a parent session's own reports (TASK-050, P3-103;
// D2A §5.3/API-018; FR-030, BR-007/010/024; TC-019).
//
// The data is the per-parent, per-case list, not a child payload, not candidate data,
// not a found row. The route hands each row to projectCaseFor so the OwnerCaseView
// allowlist is enforced; the list returned here is the read view's per-case summary
// (id, ref_code, kind, status, status_group, updated_at, editable), built from the
// projected DTOs, never the raw row.
//
// - Only a parent principal can call (effectiveRole === "parent"); anyone else is
//   E-019. This file does not write an audit row — the API layer's audit hook
//   handles the signed-in denial (D2A §5.5), and readCase already audits per-case
//   contact views in the same transaction.
// - An empty list is a real answer, not an error (the empty-state copy says "এই ফোনে
//   কোনো রিপোর্ট নেই" / "No reports on this phone"; D3 SCREEN-006).
// - Sorted by created_at DESC: the newest report is the active edit / status target.
import type { Queryable } from "@/server/db/queryable";
import { ApiError } from "@/app/api/_shared/envelope";
import { isUuid, type MyCaseResponse } from "@/contracts";
import {
  effectiveRole,
  projectCaseFor,
  type CaseReadView,
  type CaseRow,
  type Principal,
} from "@/contracts/server";
import { CASE_COLUMNS, mapCaseRow } from "../case/rows";

type Entry = MyCaseResponse["reports"][number];
const NO_OFFICER_CONTEXT = { districtNameBn: null, duplicateOf: [] };

function isParent(p: Principal | null): p is Principal & { kind: "parent"; sessionId: string } {
  return p?.kind === "parent" && effectiveRole(p) === "parent" && isUuid(p.sessionId);
}

async function listForSession(db: Queryable, sessionId: string): Promise<CaseRow[]> {
  const { rows } = await db.query(
    `SELECT ${CASE_COLUMNS} FROM cases
     WHERE kind = 'missing' AND reporter_session_id = $1
     ORDER BY created_at DESC`,
    [sessionId],
  );
  return rows.map((r) => mapCaseRow(r));
}

function entryFromView(view: CaseReadView, row: CaseRow): Entry {
  if (view.view !== "owner") {
    // Defensive: the projection only returns "owner" for a parent's missing case.
    throw new ApiError("E-021", { reason: "response" });
  }
  return {
    id: row.id,
    ref_code: row.ref_code,
    kind: view.data.kind,
    status: view.data.status,
    status_group: view.data.status_group,
    updated_at: view.data.updated_at,
    editable: view.data.editable,
  };
}

// Owner-list read. Server-only; the API route wraps the response schema.
export async function listMyCases(principal: Principal | null, db: Queryable): Promise<MyCaseResponse> {
  if (!isParent(principal)) throw new ApiError("E-019");
  const rows = await listForSession(db, principal.sessionId);
  const reports: Entry[] = [];
  for (const row of rows) {
    const view = projectCaseFor(principal, row, NO_OFFICER_CONTEXT);
    if (!view) continue; // another parent's row, even with the same id; never exposed
    reports.push(entryFromView(view, row));
  }
  return { reports };
}

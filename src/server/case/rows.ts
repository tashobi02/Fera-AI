// Case row reads and mapping (TASK-015). Server-only: CaseRow never leaves src/server
// or a route handler; routes project it with the contracts' per-role projections.
// The embedding vector is never selected here.
import type { PoolClient } from "pg";
import { isUuid, toDhakaIso, type CaseStatus } from "@/contracts";
import type { CaseRow } from "@/contracts/server";

type Queryable = Pick<PoolClient, "query">;

const COLUMNS = [
  "id", "ref_code", "kind", "status", "source", "source_url", "is_synthetic", "reporter_session_id",
  "created_by_user_id", "raw_text", "child_name", "child_name_latin", "age_years", "age_min", "age_max", "sex",
  "height_cm", "clothing", "marks", "circumstances", "event_at", "event_at_approx", "event_at_lower",
  "event_at_upper", "provenance", "embedding_model", "embedding_revision", "embedding_space", "matching_state",
  "matched_at", "match_error_id", "place_text", "district_code", "thana", "reporter_relation", "contact_phone",
  "gd_number", "client_submission_id", "submission_payload_hash", "input_hash", "version", "outcome",
  "outcome_note", "closed_at", "anonymised_at", "created_at", "updated_at",
] as const satisfies readonly (keyof CaseRow)[];

// Compile-time: every CaseRow field is selected.
type Unselected = Exclude<keyof CaseRow, (typeof COLUMNS)[number]>;
const allSelected: [Unselected] extends [never] ? true : never = true;
void allSelected;

export const CASE_COLUMNS = COLUMNS.join(", ");

const TIMESTAMPS = new Set<string>([
  "event_at", "event_at_lower", "event_at_upper", "matched_at", "closed_at", "anonymised_at", "created_at", "updated_at",
]);

// timestamptz arrives as a Date (millisecond precision); responses use +06:00 strings.
export function mapCaseRow(raw: Record<string, unknown>): CaseRow {
  const out: Record<string, unknown> = {};
  for (const col of COLUMNS) {
    const v = raw[col];
    if (TIMESTAMPS.has(col)) out[col] = v === null || v === undefined ? null : toDhakaIso(new Date(v as string | Date).getTime());
    else out[col] = v === undefined ? null : v;
  }
  out.provenance = raw.provenance ?? {};
  return out as unknown as CaseRow;
}

export async function getCaseRow(db: Queryable, caseId: string): Promise<CaseRow | null> {
  if (!isUuid(caseId)) return null;
  const { rows } = await db.query(`SELECT ${CASE_COLUMNS} FROM cases WHERE id = $1`, [caseId]);
  return rows[0] ? mapCaseRow(rows[0]) : null;
}

export const QUEUE_STATUSES: readonly CaseStatus[] = ["open", "matched_pending_review"];

export function isQueueStatus(status: CaseStatus): boolean {
  return QUEUE_STATUSES.includes(status);
}

export type PendingCandidate = {
  id: string;
  missing_case_id: string;
  found_case_id: string;
  missing_version: number;
  found_version: number;
};

export async function pendingCandidatesFor(db: Queryable, caseIds: readonly string[]): Promise<PendingCandidate[]> {
  if (caseIds.length === 0) return [];
  const { rows } = await db.query(
    `SELECT id, missing_case_id, found_case_id, missing_version, found_version FROM match_candidates
     WHERE status = 'pending' AND (missing_case_id = ANY($1::uuid[]) OR found_case_id = ANY($1::uuid[]))
     ORDER BY id`,
    [caseIds],
  );
  return rows as PendingCandidate[];
}

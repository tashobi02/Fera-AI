// Case row reads and mapping (TASK-015). Server-only: CaseRow never leaves src/server
// or a route handler; routes project it with the contracts' per-role projections.
// The embedding vector is never selected here. Every column is decoded with a typed
// check (decode.ts); a mismatch is a deliberate RowShapeError, never a silent cast.
import {
  CASE_KINDS,
  CASE_SOURCES,
  CASE_STATUSES,
  MATCHING_STATES,
  OUTCOMES,
  SEXES,
  evidenceSpanSchema,
  isUuid,
  toDhakaIso,
  type CaseStatus,
  type EvidenceSpan,
} from "@/contracts";
import type { CaseRow } from "@/contracts/server";
import type { Queryable } from "@/server/db/queryable";
import { RowShapeError, asRow, col, firstRow, type Raw } from "@/server/db/decode";

const T = "cases";

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

// timestamptz arrives as a Date (millisecond precision); responses use +06:00 strings.
const ts = (r: Raw, c: string) => {
  const d = col.dateOrNull(T, r, c);
  return d === null ? null : toDhakaIso(d.getTime());
};
const tsRequired = (r: Raw, c: string) => {
  const v = ts(r, c);
  if (v === null) throw new RowShapeError(T, c);
  return v;
};

function provenanceOf(r: Raw): Record<string, EvidenceSpan> {
  const out: Record<string, EvidenceSpan> = {};
  for (const [key, span] of Object.entries(col.object(T, r, "provenance"))) {
    const parsed = evidenceSpanSchema.safeParse(span);
    if (!parsed.success) throw new RowShapeError(T, "provenance");
    out[key] = parsed.data;
  }
  return out;
}

export function mapCaseRow(value: unknown): CaseRow {
  const r = asRow(T, value);
  const text = (c: string) => col.textOrNull(T, r, c);
  const int = (c: string) => col.intOrNull(T, r, c);
  return {
    id: col.uuid(T, r, "id"),
    ref_code: col.text(T, r, "ref_code"),
    kind: col.oneOf(T, r, "kind", CASE_KINDS),
    status: col.oneOf(T, r, "status", CASE_STATUSES),
    source: col.oneOf(T, r, "source", CASE_SOURCES),
    source_url: text("source_url"),
    is_synthetic: col.bool(T, r, "is_synthetic"),
    reporter_session_id: col.uuidOrNull(T, r, "reporter_session_id"),
    created_by_user_id: col.uuidOrNull(T, r, "created_by_user_id"),
    raw_text: text("raw_text"),
    child_name: text("child_name"),
    child_name_latin: text("child_name_latin"),
    age_years: int("age_years"),
    age_min: int("age_min"),
    age_max: int("age_max"),
    sex: col.oneOf(T, r, "sex", SEXES),
    height_cm: int("height_cm"),
    clothing: text("clothing"),
    marks: text("marks"),
    circumstances: text("circumstances"),
    event_at: ts(r, "event_at"),
    event_at_approx: col.bool(T, r, "event_at_approx"),
    event_at_lower: ts(r, "event_at_lower"),
    event_at_upper: ts(r, "event_at_upper"),
    provenance: provenanceOf(r),
    embedding_model: text("embedding_model"),
    embedding_revision: text("embedding_revision"),
    embedding_space: text("embedding_space"),
    matching_state: col.oneOf(T, r, "matching_state", MATCHING_STATES),
    matched_at: ts(r, "matched_at"),
    match_error_id: text("match_error_id"),
    place_text: text("place_text"),
    district_code: int("district_code"),
    thana: text("thana"),
    reporter_relation: text("reporter_relation"),
    contact_phone: text("contact_phone"),
    gd_number: text("gd_number"),
    client_submission_id: col.uuidOrNull(T, r, "client_submission_id"),
    submission_payload_hash: text("submission_payload_hash"),
    input_hash: text("input_hash"),
    version: col.int(T, r, "version"),
    outcome: col.oneOfOrNull(T, r, "outcome", OUTCOMES),
    outcome_note: text("outcome_note"),
    closed_at: ts(r, "closed_at"),
    anonymised_at: ts(r, "anonymised_at"),
    created_at: tsRequired(r, "created_at"),
    updated_at: tsRequired(r, "updated_at"),
  };
}

export async function getCaseRow(db: Queryable, caseId: string): Promise<CaseRow | null> {
  if (!isUuid(caseId)) return null;
  const { rows } = await db.query(`SELECT ${CASE_COLUMNS} FROM cases WHERE id = $1`, [caseId]);
  return rows.length === 0 ? null : mapCaseRow(rows[0]);
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

const MC = "match_candidates";

export function mapPendingCandidate(value: unknown): PendingCandidate {
  const r = asRow(MC, value);
  return {
    id: col.uuid(MC, r, "id"),
    missing_case_id: col.uuid(MC, r, "missing_case_id"),
    found_case_id: col.uuid(MC, r, "found_case_id"),
    missing_version: col.int(MC, r, "missing_version"),
    found_version: col.int(MC, r, "found_version"),
  };
}

export async function pendingCandidatesFor(db: Queryable, caseIds: readonly string[]): Promise<PendingCandidate[]> {
  if (caseIds.length === 0) return [];
  const { rows } = await db.query(
    `SELECT id, missing_case_id, found_case_id, missing_version, found_version FROM match_candidates
     WHERE status = 'pending' AND (missing_case_id = ANY($1::uuid[]) OR found_case_id = ANY($1::uuid[]))
     ORDER BY id`,
    [caseIds],
  );
  return rows.map(mapPendingCandidate);
}

// A single `id` column (RETURNING id).
export function returnedId(table: string, rows: readonly unknown[]): string {
  const r = firstRow(table, rows);
  if (!r) throw new RowShapeError(table, "id");
  return col.uuid(table, r, "id");
}

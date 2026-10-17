// TASK-017a: hard filters for matcher eligibility (D5 BR-017). Owner: Masnun. Server-only.
//
// BR-017 narrows every missing case to a set of found cases that satisfy ALL of:
//   (1) opposite kinds (missing ↔ found)              — implicit; the entry point is a missing id
//   (2) sex equal or unknown (unknown never excludes) — D5 BR-017
//   (3) age interval overlap within ±2 years when both known;
//       an unknown found age (BR-016) is allowed but a missing age is never unknown
//       (the schema CHECK on cases requires age_min for missing when not redacted)
//   (4) found upper time >= missing lower time (D1 line 501: "found upper time ≥
//       missing lower time"). The most common true case is a child missing on
//       day 1, found on day 5, so the found interval is entirely AFTER the
//       missing interval — a symmetric two-bound overlap rule would wrongly
//       drop that pair. TC-040 keeps interval bounds in play through the
//       "found upper time" half of the rule.
//   (5) both endpoints in a live queue status (open or matched_pending_review)
//   (6) neither endpoint redacted, confirmed or closed
//   (7) never a pair already rejected at the same report versions     — BR-019
//   (8) no duplicate candidate row at the same endpoint pair & versions
//       (pending/confirmed/voided/superseded are kept in the eligible set
//       so a rerun can re-rank them; the matcher glue upserts with
//       ON CONFLICT and never produces a true duplicate)
//
// Implementation notes:
//   - Pure parameterised SQL; no string interpolation of caller values.
//   - Accepts any `pg` Queryable (Pool or PoolClient) like the other services.
//   - Each rule has a comment citing the BR line it implements so reviewers can
//     trace every clause back to the spec.
//   - `assertNoIneligible(...)` and `INELIGIBLE_PAIR_CHECK_SQL` are exported for
//     the TC-009 fixture / eval pipeline to verify the eligibility SQL is
//     self-consistent (no pending candidate row whose endpoints violate BR-017).
import type { Queryable } from "@/server/db/queryable";

export interface EligibleFoundRow {
  missing_case_id: string;
  missing_version: number;
  found_case_id: string;
  found_version: number;
  status: "open" | "matched_pending_review";
  sex: "male" | "female" | "other" | "unknown";
  age_min: number | null;
  age_max: number | null;
  event_at: Date | null;
  event_at_approx: boolean;
  event_at_lower: Date | null;
  event_at_upper: Date | null;
  anonymised_at: Date | null;
  ref_code: string;
}

export type EligibleFoundCandidate = EligibleFoundRow;

// D5 BR-017: both endpoints must be in a live queue status to be eligible.
const QUEUE_STATUS_VALUES = ["open", "matched_pending_review"] as const;

// Single-statement eligibility query. Takes two parameters:
//   $1 = missing case UUID
//   $2 = the queue-status enum array ('open', 'matched_pending_review')
// Resolves the missing-side row inline so the caller has one input and the
// eligibility check is always consistent with the row as stored.
const ELIGIBLE_FOUND_SQL = `
  WITH missing AS (
    SELECT id, version, kind, status, sex, age_min, age_max,
           event_at_lower, event_at_upper, anonymised_at
    FROM cases WHERE id = $1
  )
  SELECT
    m.id              AS missing_case_id,
    m.version         AS missing_version,
    f.id              AS found_case_id,
    f.version         AS found_version,
    f.status          AS status,
    f.sex             AS sex,
    f.age_min         AS age_min,
    f.age_max         AS age_max,
    f.event_at        AS event_at,
    f.event_at_approx AS event_at_approx,
    f.event_at_lower  AS event_at_lower,
    f.event_at_upper  AS event_at_upper,
    f.anonymised_at   AS anonymised_at,
    f.ref_code        AS ref_code
  FROM cases f, missing m
  WHERE f.kind = 'found'
    -- (1) BR-017: opposite kinds. The caller already pinned missing.
    AND m.kind = 'missing'
    -- (5)/(6) BR-017: live queue status on both sides; neither endpoint redacted.
    AND m.status = ANY ($2::case_status[])
    AND f.status = ANY ($2::case_status[])
    AND m.anonymised_at IS NULL
    AND f.anonymised_at IS NULL
    -- (2) BR-017: sex equal or unknown; unknown never excludes a candidate.
    AND (f.sex = m.sex OR f.sex = 'unknown' OR m.sex = 'unknown')
    -- (3) BR-017 + BR-016: age interval overlap within ±2 years when both
    -- known; a found record with unknown age is allowed (BR-016). Missing
    -- age is never unknown thanks to the schema CHECK.
    AND (
      f.age_min IS NULL
      OR f.age_max IS NULL
      OR m.age_min IS NULL
      OR m.age_max IS NULL
      OR (f.age_min <= m.age_max + 2 AND m.age_min <= f.age_max + 2)
    )
    -- (4) BR-017 + TC-040 (D1 line 501): the only event-time rule is
    -- "found upper time >= missing lower time". The common true case is a
    -- child missing on day 1, found on day 5 — the found interval is
    -- entirely AFTER the missing interval and the symmetric "found lower
    -- time <= missing upper time" half would wrongly drop it.
    AND f.event_at_upper >= m.event_at_lower
    -- (7) BR-017 + BR-019: a rejected pair at the same versions is never
    -- re-suggested. (8) Pending/confirmed/voided/superseded rows at the
    -- same versions are NOT excluded: confirmed/voided pairs are already
    -- ineligible through case status, and pending pairs must stay in the
    -- eligible set so a rerun can re-rank them. The matcher glue upserts
    -- with ON CONFLICT and never produces a true duplicate.
    AND NOT EXISTS (
      SELECT 1 FROM match_candidates mc
      WHERE mc.missing_case_id = m.id
        AND mc.found_case_id   = f.id
        AND mc.missing_version = m.version
        AND mc.found_version   = f.version
        AND mc.status = 'rejected'
    )
  ORDER BY f.id`;

// Documented SQL string (parameterised). Returns the (missing, found) pairs
// that already have a pending candidate row but whose endpoints do NOT pass
// the BR-017 hard filters. Empty result = no eligibility violation;
// non-empty = a bug. Used by the TC-009 fixture and the eval pipeline.
export const INELIGIBLE_PAIR_CHECK_SQL = `
  SELECT
    mc.missing_case_id,
    mc.found_case_id,
    CASE
      WHEN m.anonymised_at IS NOT NULL THEN 'missing_redacted'
      WHEN f.anonymised_at IS NOT NULL THEN 'found_redacted'
      WHEN m.kind <> 'missing'          THEN 'wrong_missing_kind'
      WHEN f.kind <> 'found'            THEN 'wrong_found_kind'
      WHEN m.status NOT IN ('open','matched_pending_review') THEN 'wrong_missing_state'
      WHEN f.status NOT IN ('open','matched_pending_review') THEN 'wrong_found_state'
      WHEN NOT (f.sex = m.sex OR f.sex = 'unknown' OR m.sex = 'unknown')
           THEN 'sex_mismatch'
      WHEN NOT (f.age_min IS NULL OR f.age_max IS NULL OR m.age_min IS NULL OR m.age_max IS NULL
                OR (f.age_min <= m.age_max + 2 AND m.age_min <= f.age_max + 2))
           THEN 'age_no_overlap'
      WHEN NOT (f.event_at_upper >= m.event_at_lower)
           THEN 'found_before_missing'
      ELSE 'unknown'
    END AS reason
  FROM match_candidates mc
  JOIN cases m ON m.id = mc.missing_case_id
  JOIN cases f ON f.id = mc.found_case_id
  WHERE mc.status = 'pending'
    AND (
      m.anonymised_at IS NOT NULL
      OR f.anonymised_at IS NOT NULL
      OR m.kind <> 'missing'
      OR f.kind <> 'found'
      OR m.status NOT IN ('open','matched_pending_review')
      OR f.status NOT IN ('open','matched_pending_review')
      OR NOT (f.sex = m.sex OR f.sex = 'unknown' OR m.sex = 'unknown')
      OR NOT (f.age_min IS NULL OR f.age_max IS NULL OR m.age_min IS NULL OR m.age_max IS NULL
              OR (f.age_min <= m.age_max + 2 AND m.age_min <= f.age_max + 2))
      OR NOT (f.event_at_upper >= m.event_at_lower)
    )`;

// Export the runnable SQL so the matcher run (TASK-017d) and the eval
// pipeline can embed exactly the same statement in their own queries (e.g.
// eval:match recall@5 baseline). The statement is parameterised on
//   $1 = missing case id
//   $2 = the queue-status enum array
export const ELIGIBLE_FOUND_SQL_RUNNABLE = ELIGIBLE_FOUND_SQL;

function normaliseEligibleRow(value: unknown): EligibleFoundRow {
  const r = value as Record<string, unknown>;
  const str = (k: string): string => {
    const v = r[k];
    if (typeof v !== "string") throw new Error(`filters: expected ${k} to be a string`);
    return v;
  };
  const intOrNull = (k: string): number | null => {
    const v = r[k];
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const dateOrNull = (k: string): Date | null => {
    const v = r[k];
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v;
    if (typeof v === "string") {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  };
  const bool = (k: string): boolean => {
    const v = r[k];
    return v === true || v === "t" || v === "true";
  };
  const status = str("status") as EligibleFoundRow["status"];
  if (status !== "open" && status !== "matched_pending_review") {
    throw new Error(`filters: unexpected found status ${status}`);
  }
  const foundVersionRaw = r["found_version"];
  if (foundVersionRaw === null || foundVersionRaw === undefined) {
    throw new Error("filters: found_version is required (column is NOT NULL)");
  }
  const foundVersion =
    typeof foundVersionRaw === "number"
      ? foundVersionRaw
      : Number(foundVersionRaw);
  if (!Number.isFinite(foundVersion)) {
    throw new Error("filters: found_version must be a finite number");
  }
  const missingVersionRaw = r["missing_version"];
  if (missingVersionRaw === null || missingVersionRaw === undefined) {
    throw new Error("filters: missing_version is required (column is NOT NULL)");
  }
  const missingVersion =
    typeof missingVersionRaw === "number"
      ? missingVersionRaw
      : Number(missingVersionRaw);
  if (!Number.isFinite(missingVersion)) {
    throw new Error("filters: missing_version must be a finite number");
  }
  return {
    missing_case_id: str("missing_case_id"),
    missing_version: missingVersion,
    found_case_id: str("found_case_id"),
    found_version: foundVersion,
    status,
    sex: str("sex") as EligibleFoundRow["sex"],
    age_min: intOrNull("age_min"),
    age_max: intOrNull("age_max"),
    event_at: dateOrNull("event_at"),
    event_at_approx: bool("event_at_approx"),
    event_at_lower: dateOrNull("event_at_lower"),
    event_at_upper: dateOrNull("event_at_upper"),
    anonymised_at: dateOrNull("anonymised_at"),
    ref_code: str("ref_code"),
  };
}

/**
 * Return the found cases that are eligible to be matched against the given
 * missing case under D5 BR-017. Returns an empty array for a missing case
 * that is unknown, redacted or no longer in a queue state. Pure parameterised
 * SQL; the caller passes only the missing case UUID.
 *
 * Rules enforced (every clause is annotated in `ELIGIBLE_FOUND_SQL`):
 *   - opposite kinds                                 (BR-017)
 *   - sex equal or unknown                           (BR-017)
 *   - age intervals overlap ±2y                      (BR-017; BR-016 allows unknown found age)
 *   - found upper time >= missing lower time         (BR-017; the most common
 *     case is a child missing on day 1 and found on day 5, so the found
 *     interval is entirely AFTER the missing interval; the symmetric
 *     "found lower time <= missing upper time" half is intentionally NOT
 *     checked so that case stays eligible. TC-040 keeps interval bounds
 *     in play through the "found upper time" half of the rule.)
 *   - both endpoints in queue status                 (BR-017)
 *   - neither endpoint redacted                      (BR-017)
 *   - not previously rejected at the same versions   (BR-017; BR-019)
 *   - pending/confirmed/voided/superseded candidate rows are kept; the
 *     matcher glue upserts with ON CONFLICT and never produces a true
 *     duplicate.
 */
export async function eligibleFoundCandidates(
  db: Queryable,
  missingCaseId: string,
): Promise<EligibleFoundRow[]> {
  return findEligibleFound(db, missingCaseId);
}

export async function findEligibleFound(
  db: Queryable,
  missingCaseId: string,
): Promise<EligibleFoundRow[]> {
  const { rows } = await db.query(ELIGIBLE_FOUND_SQL, [
    missingCaseId,
    QUEUE_STATUS_VALUES,
  ]);
  return rows.map((r) => normaliseEligibleRow(r));
}

/**
 * Returns every (missing, found) pair currently represented by a pending
 * candidate row whose endpoints do NOT pass the BR-017 hard filters. Empty
 * result = the matcher ran cleanly under BR-017; non-empty = a bug in the
 * eligibility SQL or a violation written by another path.
 *
 * Used by the TC-009 fixture and by `eval:match` as a self-consistency
 * check (no candidate row should ever have been inserted for an ineligible
 * pair).
 */
export async function assertNoIneligible(
  db: Queryable,
): Promise<{ missing_case_id: string; found_case_id: string; reason: string }[]> {
  const { rows } = await db.query(INELIGIBLE_PAIR_CHECK_SQL, []);
  return rows as { missing_case_id: string; found_case_id: string; reason: string }[];
}
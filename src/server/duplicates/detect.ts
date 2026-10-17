// TASK-018 duplicate detector (COMP-013, FR-022/FR-023, BR-021). Owner: Masnun.
// Server-only.
//
// Flag possible duplicate reports of the same kind via pgvector cosine distance
// on stored embeddings + per-field agreement (name/age/sex/district/time). The
// detector only ever returns the documented `profile` rule from the schema's
// duplicate rule enum (see db/schema_v2.sql: duplicate_links.rule).
//
// BR-021: a shared phone number ALONE never links two reports and can never
// support a "same child" confirmation. Phone is therefore not a profile field
// here; the detector returns `profile` only when the embedding is close AND at
// least one of {name, age, sex, district, time} agrees. Two siblings sharing a
// phone (TC-038) stay independently visible.
//
// Flagging never hides a report. The detector writes the link but does not
// alter case status; both reports stay searchable. Reports without an embedding
// are skipped from the candidate pool, never an error.
//
// Pure helper `decideDuplicateRule` is exported separately so it is unit-
// testable without a database; `detectDuplicates` is the DB-bound wrapper.
import { isUuid, type DuplicateRule } from "@/contracts";
import type { Queryable } from "@/server/db/queryable";

/** Cosine distance threshold (`<=>` returns 1 - cosine_similarity in [0, 2]). */
export const SIMILARITY_THRESHOLD = 0.5;

/** Max candidates to consider from the embedding pool. */
export const CANDIDATE_LIMIT = 50;

export interface FieldAgreement {
  name: boolean;
  age: boolean;
  sex: boolean;
  district: boolean;
  time: boolean;
  phone: boolean;
}

/** A candidate in the embedding-similarity pool (other reports of the same kind). */
export interface SimilarCase {
  id: string;
  distance: number;
  child_name: string | null;
  age_years: number | null;
  age_min: number | null;
  age_max: number | null;
  sex: string;
  district_code: number | null;
  event_at: string | null;
  event_at_lower: string | null;
  event_at_upper: string | null;
  contact_phone: string | null;
}

export interface SourceCase {
  id: string;
  kind: "missing" | "found";
  child_name: string | null;
  age_years: number | null;
  age_min: number | null;
  age_max: number | null;
  sex: string;
  district_code: number | null;
  event_at: string | null;
  event_at_lower: string | null;
  event_at_upper: string | null;
  contact_phone: string | null;
}

export interface DuplicateFlag {
  source_id: string;
  candidate_id: string;
  rule: DuplicateRule;
  score: number;
}

/** Names match when both are non-empty and equal after trim+lowercase. */
export function namesAgree(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Age agreement: at least one of age_years, or the [age_min, age_max] interval,
 * overlaps with the other side. Unknown on either side (all nulls) is treated
 * as "unknown" and never agrees.
 */
export function agesAgree(
  aYears: number | null, aMin: number | null, aMax: number | null,
  bYears: number | null, bMin: number | null, bMax: number | null,
): boolean {
  if (aYears !== null && bYears !== null && aYears === bYears) return true;
  if (aMin !== null && aMax !== null && bMin !== null && bMax !== null) {
    return aMin <= bMax && bMin <= aMax;
  }
  return false;
}

/** Sex agreement: at least one of the two sides is known and equal. */
export function sexesAgree(a: string, b: string): boolean {
  if (a === "unknown" || b === "unknown") return false;
  return a === b;
}

/** District agreement: both known and equal. */
export function districtsAgree(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return false;
  return a === b;
}

/**
 * Time agreement: the [event_at_lower, event_at_upper] intervals overlap on the
 * calendar. Both sides must have an interval; `event_at` alone with no interval
 * is treated as unknown. Either side missing a lower or upper bound is unknown.
 */
export function timesAgree(
  aLo: string | null, aUp: string | null,
  bLo: string | null, bUp: string | null,
): boolean {
  if (!aLo || !aUp || !bLo || !bUp) return false;
  const aL = Date.parse(aLo); const aU = Date.parse(aUp);
  const bL = Date.parse(bLo); const bU = Date.parse(bUp);
  if (!Number.isFinite(aL) || !Number.isFinite(aU) || !Number.isFinite(bL) || !Number.isFinite(bU)) return false;
  return aL <= bU && bL <= aU;
}

/** Phone agreement: both known and exactly equal. */
export function phonesAgree(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a === b;
}

/** Compute the field-by-field agreement between source and candidate. */
export function computeAgreement(source: SourceCase, candidate: SimilarCase): FieldAgreement {
  return {
    name: namesAgree(source.child_name, candidate.child_name),
    age: agesAgree(
      source.age_years, source.age_min, source.age_max,
      candidate.age_years, candidate.age_min, candidate.age_max,
    ),
    sex: sexesAgree(source.sex, candidate.sex),
    district: districtsAgree(source.district_code, candidate.district_code),
    // BR-021: time agreement requires the [event_at_lower, event_at_upper] interval
    // on both sides; the event_at midpoint alone is not a profile field.
    time: timesAgree(
      source.event_at_lower, source.event_at_upper,
      candidate.event_at_lower, candidate.event_at_upper,
    ),
    phone: phonesAgree(source.contact_phone, candidate.contact_phone),
  };
}

/**
 * Pure decision helper: embedding similarity (1 - cosine distance) + field
 * agreement -> rule label or null.
 *
 * BR-021: a shared phone ALONE never links two reports. Phone is recorded in
 * `agreement.phone` for completeness but is not a profile field here. The
 * detector returns `profile` only when embedding is close AND at least one
 * of {name, age, sex, district, time} agrees. Returns `same_phone` only if
 * the caller passes `phoneOnly` true and similarity is close — i.e., the
 * caller is the "phone-only weak cue" path; in this detector that path is a
 * no-op and is not produced by `detectDuplicates`.
 */
export function decideDuplicateRule(
  similarity: number,
  agreement: FieldAgreement,
  options: { phoneOnly?: boolean } = {},
): DuplicateRule | null {
  if (similarity < SIMILARITY_THRESHOLD) return null;
  const profileFieldMatches =
    agreement.name || agreement.age || agreement.sex ||
    agreement.district || agreement.time;
  if (profileFieldMatches) return "profile";
  // Phone-only weak cue: the schema's `same_phone` rule. BR-021 forbids this
  // from ever being the only path (status check: same_phone cannot be
  // confirmed_same); we mirror that here by requiring the caller to opt in.
  if (options.phoneOnly && agreement.phone) return "same_phone";
  return null;
}

interface DetectResult {
  flags: DuplicateFlag[];
  skipped: boolean;
}

/**
 * Detect possible duplicates of `caseId` among OTHER reports of the same kind.
 * - Returns an empty list if the source case has no embedding (skipped=true).
 * - Throws on a malformed or unknown case id (no such case).
 * - Never hides a report: the detector only writes `duplicate_links` rows;
 *   both endpoints remain independently visible (FR-022, BR-021).
 */
export async function detectDuplicates(
  db: Queryable,
  caseId: string,
): Promise<DetectResult> {
  if (!isUuid(caseId)) throw new Error("invalid case id");

  const sourceRes = await db.query(
    `SELECT id, kind, child_name, age_years, age_min, age_max, sex,
            district_code, event_at, event_at_lower, event_at_upper, contact_phone,
            embedding IS NOT NULL AS has_embedding
     FROM cases WHERE id = $1`,
    [caseId],
  );
  const src = (sourceRes.rows[0] as Record<string, unknown> | undefined) as
    | (SourceCase & { has_embedding: boolean })
    | undefined;
  if (!src) throw new Error("case not found");
  if (!src.has_embedding) return { flags: [], skipped: true };

  const poolRes = await db.query(
    `SELECT id, (embedding <=> (SELECT embedding FROM cases WHERE id = $1)) AS distance,
            child_name, age_years, age_min, age_max, sex, district_code,
            event_at, event_at_lower, event_at_upper, contact_phone
     FROM cases
     WHERE id <> $1
       AND kind = $2
       AND embedding IS NOT NULL
     ORDER BY embedding <=> (SELECT embedding FROM cases WHERE id = $1) ASC
     LIMIT $3`,
    [caseId, src.kind, CANDIDATE_LIMIT],
  );

  const source: SourceCase = {
    id: src.id,
    kind: src.kind,
    child_name: src.child_name,
    age_years: src.age_years,
    age_min: src.age_min,
    age_max: src.age_max,
    sex: src.sex,
    district_code: src.district_code,
    event_at: src.event_at,
    event_at_lower: src.event_at_lower,
    event_at_upper: src.event_at_upper,
    contact_phone: src.contact_phone,
  };

  const flags: DuplicateFlag[] = [];
  for (const row of poolRes.rows as Array<Record<string, unknown>>) {
    const distance = Number(row.distance);
    const candidate: SimilarCase = {
      id: String(row.id),
      distance,
      child_name: (row.child_name as string | null) ?? null,
      age_years: (row.age_years as number | null) ?? null,
      age_min: (row.age_min as number | null) ?? null,
      age_max: (row.age_max as number | null) ?? null,
      sex: String(row.sex),
      district_code: (row.district_code as number | null) ?? null,
      event_at: (row.event_at as string | null) ?? null,
      event_at_lower: (row.event_at_lower as string | null) ?? null,
      event_at_upper: (row.event_at_upper as string | null) ?? null,
      contact_phone: (row.contact_phone as string | null) ?? null,
    };
    const similarity = 1 - distance;
    const agreement = computeAgreement(source, candidate);
    const rule = decideDuplicateRule(similarity, agreement);
    if (rule) {
      flags.push({
        source_id: source.id,
        candidate_id: candidate.id,
        rule,
        score: Math.round(similarity * 100),
      });
    }
  }
  return { flags, skipped: false };
}
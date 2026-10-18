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
// least TWO of {name, age, sex, district, time} agree AND no contradicting
// profile field is known. Two siblings sharing a phone (TC-038) stay
// independently visible.
//
// Safeguarding (round 2): the rule for `profile` is intentionally stricter than
// BR-021 alone. BR-021's "possible-duplicate cue" is allowed only for
// *compatible* profiles, i.e. no known sex disagreement and no known
// disjoint-age mismatch. This guard prevents flagging two siblings of the same
// family (different sex, disjoint age) as a possible duplicate just because
// they share district and time. The matcher has the same kind of guard but uses
// BR-017's +-2 year tolerance; this detector uses plain disjoint ranges (no
// tolerance) because the duplicate pool does not need the same leniency — if
// ages do not overlap at all, the children are clearly different. The
// contradiction gate is therefore:
//   - both sexes are known and differ, OR
//   - both age ranges are known and disjoint
// and any of those returns null. A pair that disagrees on a single profile
// field but agrees on at least one other is still flagged (BR-021 allows the
// cue on compatible profiles).
//
// Flagging never hides a report. The detector only RETURNS flags; it does not
// alter case status and does not write duplicate_links itself. Both reports
// stay searchable. Reports without an embedding are skipped from the candidate
// pool, never an error.
//
// UNKNOWN: whether closed/referred reports stay in the duplicate pool (spec
// silent — BR-021 only rules out shared-phone-alone links). We keep the same
// pool regardless of status and let the future persister decide.
//
// Pure helper `decideDuplicateRule` is exported separately so it is unit-
// testable without a database; `detectDuplicates` is the DB-bound wrapper.
import { isUuid, type DuplicateRule } from "@/contracts";
import type { Queryable } from "@/server/db/queryable";

/** Documented defaults for the duplicate detector. */
export const DUPLICATE_CONFIG = {
  // Cosine similarity threshold: pairs with similarity below this are never
  // flagged regardless of field agreement. Documented default, calibrate on the
  // dev split only (BR-021, AMD-3-3); not spec-derived.
  SIMILARITY_THRESHOLD: 0.5,
  // Minimum number of agreeing profile fields required for a `profile` flag.
  // A single profile field is not enough: a shared district alone or a shared
  // time alone can describe an entire neighbourhood and a single day. Two
  // agreeing fields (e.g. name + sex, age + district) are a much stronger cue
  // and still consistent with BR-021's "possible-duplicate cue on compatible
  // profiles" wording.
  MIN_AGREEING_PROFILE_FIELDS: 2,
  // Max candidates to consider from the embedding pool.
  CANDIDATE_LIMIT: 50,
} as const;

/** Re-exported for back-compat (older tests and the index module). */
export const SIMILARITY_THRESHOLD = DUPLICATE_CONFIG.SIMILARITY_THRESHOLD;
export const CANDIDATE_LIMIT = DUPLICATE_CONFIG.CANDIDATE_LIMIT;

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
  event_at_lower: string | Date | null;
  event_at_upper: string | Date | null;
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
  event_at_lower: string | Date | null;
  event_at_upper: string | Date | null;
  contact_phone: string | null;
}

export interface DuplicateFlag {
  source_id: string;
  candidate_id: string;
  rule: DuplicateRule;
  score: number;
  /** Internal detector snapshot used to reject flags made stale before persistence. */
  source_snapshot: DuplicateSnapshot;
  candidate_snapshot: DuplicateSnapshot;
}

/** Version and embedding-space identity captured by the detector's SELECTs. */
export interface DuplicateSnapshot {
  version: number;
  embedding_model: string;
  embedding_revision: string;
  embedding_space: string;
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
 *
 * Accepts ISO 8601 strings (the contract type) or `Date` objects (what `pg`
 * returns for `timestamptz` columns); Date.parse on a Date string from pg drops
 * sub-second precision, so we use `getTime()` for Date instances.
 */
export function timesAgree(
  aLo: string | Date | null, aUp: string | Date | null,
  bLo: string | Date | null, bUp: string | Date | null,
): boolean {
  if (!aLo || !aUp || !bLo || !bUp) return false;
  const toMs = (v: string | Date): number =>
    v instanceof Date ? v.getTime() : Date.parse(v);
  const aL = toMs(aLo); const aU = toMs(aUp);
  const bL = toMs(bLo); const bU = toMs(bUp);
  if (!Number.isFinite(aL) || !Number.isFinite(aU) || !Number.isFinite(bL) || !Number.isFinite(bU)) return false;
  return aL <= bU && bL <= aU;
}

/** Phone agreement: both known and exactly equal. */
export function phonesAgree(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a === b;
}

/**
 * Contradiction gate: returns `true` when the two reports are clearly NOT the
 * same child, based on a known profile mismatch. A contradiction is:
 *   - both sexes are known (non-`unknown`) and differ, OR
 *   - both age ranges are known and disjoint (plain intersection: aMax < bMin
 *     or bMax < aMin). We do NOT use BR-017's +-2 year tolerance here; the
 *     duplicate pool is a single household or two children in the same area,
 *     so any non-overlapping age range is a hard contradiction. (BR-017 is a
 *     matcher concern and lives in src/server/matching/.)
 * Anything unknown on at least one side is not a contradiction.
 */
export function profilesContradict(source: SourceCase, candidate: SimilarCase): boolean {
  if (source.sex !== "unknown" && candidate.sex !== "unknown" &&
      source.sex !== candidate.sex) {
    return true;
  }
  const aMin = source.age_min;
  const aMax = source.age_max;
  const bMin = candidate.age_min;
  const bMax = candidate.age_max;
  if (aMin !== null && aMax !== null && bMin !== null && bMax !== null) {
    if (aMax < bMin || bMax < aMin) return true;
  }
  return false;
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

/** Count how many of the five profile fields agree (phone excluded). */
export function countAgreeingProfileFields(agreement: FieldAgreement): number {
  return (agreement.name ? 1 : 0) +
         (agreement.age ? 1 : 0) +
         (agreement.sex ? 1 : 0) +
         (agreement.district ? 1 : 0) +
         (agreement.time ? 1 : 0);
}

/**
 * Pure decision helper: embedding similarity (1 - cosine distance) + field
 * agreement -> rule label or null.
 *
 * BR-021 + safeguarding (round 2): a shared phone ALONE never links two
 * reports. Phone is recorded in `agreement.phone` for completeness but is not
 * a profile field here. The detector returns `profile` only when:
 *   - similarity is finite and at or above the threshold, AND
 *   - no known profile field contradicts the pair (sex known and different, or
 *     age ranges known and disjoint), AND
 *   - at least MIN_AGREEING_PROFILE_FIELDS (2) of {name, age, sex, district,
 *     time} agree on the source and the candidate.
 * The `same_phone` rule is an opt-in weak cue: only the caller that sets
 * `phoneOnly: true` may produce it, and only when no profile rule would fire
 * (otherwise profile wins because it is the strong rule). BR-021 forbids the
 * phone-only path from being the only support for a confirmed_same; the
 * status check in the schema enforces that. The detector does not produce the
 * same_phone path; only an external caller can.
 */
export function decideDuplicateRule(
  similarity: number,
  agreement: FieldAgreement,
  options: { phoneOnly?: boolean; contradicts?: boolean } = {},
): DuplicateRule | null {
  // NaN/Infinity-safety: pgvector cosine distance is NaN for a zero vector,
  // so similarity (1 - distance) is NaN there. Anything non-finite is refused
  // outright, and a NaN cannot satisfy a >= comparison either.
  if (!Number.isFinite(similarity)) return null;
  if (similarity < DUPLICATE_CONFIG.SIMILARITY_THRESHOLD) return null;
  // Contradiction gate: a known sex mismatch or a known disjoint age range
  // makes a "possible duplicate" cue unsafe. Two siblings in the same
  // household share district and time; without this guard they would be
  // flagged on that alone, which is exactly what BR-021's "compatible
  // profiles" wording rules out. The same_phone weak cue also refuses to
  // fire under a contradiction, because a same-phone sibling pair is still
  // not the same child.
  if (options.contradicts) return null;
  if (countAgreeingProfileFields(agreement) >= DUPLICATE_CONFIG.MIN_AGREEING_PROFILE_FIELDS) {
    return "profile";
  }
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
 * - Never hides a report: this function only RETURNS flags; a future persister
 *   must order the pair so case_a < case_b (schema CHECK) and set the status.
 *   Both endpoints remain independently visible (FR-022, BR-021).
 *
 * The candidate pool requires the same embedding_space, embedding_model and
 * embedding_revision as the source. Cross-space distances are meaningless even
 * though both vectors are 384-d, so we never mix them.
 */
export async function detectDuplicates(
  db: Queryable,
  caseId: string,
): Promise<DetectResult> {
  if (!isUuid(caseId)) throw new Error("invalid case id");

  const sourceRes = await db.query(
    `SELECT id, kind, child_name, age_years, age_min, age_max, sex, version,
            district_code, event_at, event_at_lower, event_at_upper, contact_phone,
            embedding IS NOT NULL AS has_embedding,
            embedding_model, embedding_revision, embedding_space
     FROM cases WHERE id = $1`,
    [caseId],
  );
  const src = (sourceRes.rows[0] as Record<string, unknown> | undefined) as
    | (SourceCase & {
        version: number;
        has_embedding: boolean;
        embedding_model: string | null;
        embedding_revision: string | null;
        embedding_space: string | null;
      })
    | undefined;
  if (!src) throw new Error("case not found");
  if (!src.has_embedding) return { flags: [], skipped: true };
  if (!src.embedding_model || !src.embedding_revision || !src.embedding_space) {
    // Schema CHECK guarantees all three are set whenever embedding IS NOT NULL,
    // but be explicit so a future drift does not silently mix spaces.
    return { flags: [], skipped: true };
  }
  const sourceVersion = safeVersion(src.version);
  if (sourceVersion === null) return { flags: [], skipped: true };
  const sourceSnapshot: DuplicateSnapshot = {
    version: sourceVersion,
    embedding_model: src.embedding_model,
    embedding_revision: src.embedding_revision,
    embedding_space: src.embedding_space,
  };

  // contact_phone is intentionally NOT selected: the detection path never uses
  // it (BR-021 forbids phone from being a profile field). Fetching less data
  // keeps the candidate row tight and avoids any temptation to compare on
  // phone in the future. Source contact_phone is still fetched above because
  // the same_phone path (opt-in, never produced by this detector) compares
  // source vs candidate.
  const poolRes = await db.query(
    `SELECT id, version, embedding_model, embedding_revision, embedding_space,
            (embedding <=> (SELECT embedding FROM cases WHERE id = $1)) AS distance,
            child_name, age_years, age_min, age_max, sex, district_code,
            event_at, event_at_lower, event_at_upper
     FROM cases
     WHERE id <> $1
       AND kind = $2
       AND embedding IS NOT NULL
       AND embedding_model = $4
       AND embedding_revision = $5
       AND embedding_space = $6
     ORDER BY embedding <=> (SELECT embedding FROM cases WHERE id = $1) ASC
     LIMIT $3`,
    [
      caseId,
      src.kind,
      DUPLICATE_CONFIG.CANDIDATE_LIMIT,
      src.embedding_model,
      src.embedding_revision,
      src.embedding_space,
    ],
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
    const candidateVersion = safeVersion(row.version);
    if (candidateVersion === null ||
        typeof row.embedding_model !== "string" ||
        typeof row.embedding_revision !== "string" ||
        typeof row.embedding_space !== "string") continue;
    const distance = Number(row.distance);
    // pgvector cosine distance is NaN for a zero vector; NaN < threshold is
    // false so without this guard the pair would be flagged with score NaN.
    // We skip the candidate entirely (no flag, no score).
    if (!Number.isFinite(distance)) continue;
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
      // contact_phone is not selected from the pool; the duplicate-detection
      // path never compares on phone (BR-021).
      contact_phone: null,
    };
    const similarity = 1 - distance;
    const agreement = computeAgreement(source, candidate);
    const rule = decideDuplicateRule(similarity, agreement, {
      contradicts: profilesContradict(source, candidate),
    });
    if (rule) {
      flags.push({
        source_id: source.id,
        candidate_id: candidate.id,
        rule,
        score: Math.round(similarity * 100),
        source_snapshot: sourceSnapshot,
        candidate_snapshot: {
          version: candidateVersion,
          embedding_model: row.embedding_model,
          embedding_revision: row.embedding_revision,
          embedding_space: row.embedding_space,
        },
      });
    }
  }
  return { flags, skipped: false };
}

function safeVersion(value: unknown): number | null {
  const version = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isSafeInteger(version) && version > 0 ? version : null;
}

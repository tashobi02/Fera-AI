// TASK-017b / P3-031: pair scoring, bonuses and qualify-or-abstain.
//
// Pure functions (no DB, no I/O). A candidate's score is a similarity in 0–100
// (BR-018: "Score 'মিলের মাত্রা' is not identity probability"; A-015: "0–100
// similarity score is understandable to officers if labelled as similarity").
// BR-018 also says: missing feature values are null, not fabricated agreement;
// "available-feature weight normalisation" is applied; district/adjacency is a
// soft bonus, never a gate. TC-041: an EMPTY shortlist is a valid result.
//
// AMD-3-3 (PHASE_3_FULL_SCOPE_QUALITY.md): thresholds/weights are calibrated on
// the dev split only; never tune from held-out results.
//
// Returned `similarity` is a similarity in the inclusive range [0, 100]. It is
// not a probability and not a confidence; the wording in `officer-match.ts`
// repeats this. We do not name anything `probability` or `confidence` here.

import { LIMITS } from "@/contracts/primitives";
import type { Sex } from "@/contracts/states";

/* ---------- Inputs ---------- */

export interface ScoreInput {
  // Two L2-normalised, same-space embedding vectors. The cosine of the
  // embedding pair is the dominant signal (D1 BR-018; A-028 in D5 §7.7).
  missingEmbedding: readonly number[];
  foundEmbedding: readonly number[];

  // Soft bonuses. `null` means "unknown" (BR-018: missing feature values are
  // null, not fabricated agreement). The bonus is omitted and no weight is
  // claimed for an unknown field.
  districtSame: boolean | null;
  districtNeighbour: boolean | null;
  // Hours between the two reports' event references. A finite non-negative
  // number is a known gap; `null` is unknown (the case was unbounded or
  // approximate). Closer in time scores higher; `null` contributes nothing.
  timeGapHours: number | null;

  // Sex agreement. "unknown" is not fabricated agreement; a bonus only
  // applies when both sides give the same explicit sex value.
  missingSex: Sex;
  foundSex: Sex;

  // Age agreement. `null` on either side is unknown (BR-018: missing values
  // are null, not fabricated). Overlap is computed in whole years; the
  // ±2-year tolerance in BR-017 eligibility is separate from this soft
  // agreement bonus.
  missingAgeMin: number | null;
  missingAgeMax: number | null;
  foundAgeMin: number | null;
  foundAgeMax: number | null;
}

/* ---------- Single match output ---------- */

export interface ScoredCandidate {
  /** 0–100 similarity (not a probability, not a confidence). */
  similarity: number;
  /** 0–100 component contributions, `null` where the feature is unknown. */
  components: Record<string, number | null>;
  /**
   * `true` only when the similarity meets the qualify threshold AND the
   * cosine itself is at least the minimum cosine floor (otherwise a perfect
   * bonus run on an unrelated pair would qualify). Always `false` for an
   * abstain (TC-041).
   */
  qualified: boolean;
}

/* ---------- Ranked output ---------- */

export interface RankedCandidate {
  /** Stable identifier used to break similarity ties (e.g. found case UUID). */
  id: string;
  similarity: number;
  components: Record<string, number | null>;
}

/* ---------- Single config constant (BR-018) ---------- */

/**
 * All weights, thresholds and the candidate cap live here. Per BR-018 and
 * AMD-3-3, these are "documented default, calibrate on dev split only" — never
 * tuned from held-out results. The matcher engine reads them through
 * `MATCH_CONFIG` so a single change point governs ranking.
 */
export const MATCH_CONFIG = {
  // BR-018: "L2-normalised embeddings share a pinned space/revision/prefix
  // policy. Use clamped cosine…" — the cosine of two unit vectors is in
  // [-1, 1]; we clamp to [0, 1] before scaling because similarity is unsigned
  // and we never want a negative cosine to lower the score.
  cosineWeight: 0.55, // D5 A-028: 0.55 cosine, documented default

  // Soft bonuses, summed into the remaining weight (BR-018: "available-feature
  // weight normalisation"). We re-normalise the present (non-null) bonuses to
  // (1 - cosineWeight) so an unknown field never under-claims the cosine and
  // a present field never inflates beyond its share.
  bonusShare: 0.45, // D5 A-028: 0.15 + 0.15 + 0.10 + 0.05 = 0.45

  // Each bonus tops out at 1.0 inside its share. `null` is excluded entirely.
  districtSameBonus: 1.0, // full bonus when the two reports share a district
  districtNeighbourBonus: 0.5, // half bonus when only an adjacency is known
  // Time proximity peaks at 0 hours apart and decays to 0 at one week. Linear
  // decay is documented default; calibrate on dev split only.
  timeProximityMaxHours: 24 * 7,
  sexAgreeBonus: 1.0, // same explicit sex
  // Age overlap is 1.0 when the two intervals fully overlap, 0 when they do
  // not overlap at all (after the ±2-year tolerance below). Unknown bounds
  // contribute `null` and NO bonus (BR-018: missing values are null, not
  // fabricated agreement).
  ageOverlapToleranceYears: 2, // BR-017 ±2-year window

  // D1 BR-018 / A-028: minimum cosine to qualify. Without it, two unrelated
  // vectors with a high soft-bonus run (e.g. a same-district coincidence)
  // could falsely qualify.
  minCosineToQualify: 0.30,
  // Minimum similarity to qualify (0–100 scale). A pair whose weighted score
  // is below this abstains (TC-041). Documented default; calibrate on dev.
  qualifySimilarity: 60,

  // BR-018 / FR-012: "display at most five qualified candidates, and allow
  // zero." We read it from the frozen LIMITS so the contract stays the
  // single source.
  candidatesPerQueueItem: LIMITS.candidatesPerQueueItem,
} as const;

/* ---------- Cosine ---------- */

function l2norm(v: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!;
  return Math.sqrt(s);
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  if (a.length !== b.length) return 0; // different space — refuse
  const na = l2norm(a);
  const nb = l2norm(b);
  if (na === 0 || nb === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot / (na * nb);
}

/* ---------- Bonuses ---------- */

function districtBonus(same: boolean | null, neighbour: boolean | null): number | null {
  // BR-018: missing feature values are null, not fabricated agreement.
  if (same === null && neighbour === null) return null;
  // Same district wins outright; an adjacency yields half. We treat the
  // boolean of each axis as authoritative for that axis; the other axis is
  // ignored if it is unknown.
  const sameScore = same === true ? MATCH_CONFIG.districtSameBonus : same === false ? 0 : null;
  const neighbourScore =
    neighbour === true ? MATCH_CONFIG.districtNeighbourBonus : neighbour === false ? 0 : null;
  // If both axes are known, the same-district score wins (it's the stronger
  // signal of place). Otherwise return whichever axis is known.
  if (sameScore !== null && neighbourScore !== null) {
    return Math.max(sameScore, neighbourScore);
  }
  return sameScore ?? neighbourScore ?? 0;
}

function timeProximityBonus(gapHours: number | null): number | null {
  if (gapHours === null) return null;
  if (gapHours <= 0) return 1;
  const max = MATCH_CONFIG.timeProximityMaxHours;
  if (gapHours >= max) return 0;
  return 1 - gapHours / max;
}

function sexBonus(a: Sex, b: Sex): number | null {
  if (a === "unknown" || b === "unknown") return null;
  return a === b ? MATCH_CONFIG.sexAgreeBonus : 0;
}

function ageOverlapBonus(
  aMin: number | null,
  aMax: number | null,
  bMin: number | null,
  bMax: number | null,
): number | null {
  // BR-018: "missing feature values are null, not fabricated agreement".
  // An unknown interval (any bound null) contributes NO bonus and is exposed
  // as a `null` component. The "unknown is allowed with less evidence"
  // rule in BR-017 governs eligibility, not the soft-bonus signal here.
  if (aMin === null || aMax === null || bMin === null || bMax === null) {
    return null;
  }
  // ±2-year tolerance widens both sides before intersection (BR-017).
  const tol = MATCH_CONFIG.ageOverlapToleranceYears;
  const lo = Math.max(aMin - tol, bMin - tol);
  const hi = Math.min(aMax + tol, bMax + tol);
  if (hi < lo) return 0;
  // Length of the smaller side as the "available overlap" denominator gives
  // a 0–1 ratio that prefers fully-overlapping intervals without penalising
  // one-sided uncertainty.
  const spanA = aMax - aMin + 1;
  const spanB = bMax - bMin + 1;
  const denom = Math.max(1, Math.min(spanA, spanB));
  return Math.min(1, (hi - lo + 1) / denom);
}

/* ---------- scorePair ---------- */

export function scorePair(input: ScoreInput): ScoredCandidate {
  const rawCosine = cosineSimilarity(input.missingEmbedding, input.foundEmbedding);
  // Clamp to [0, 1]; negative cosine is a non-match for similarity, not a
  // penalty. (BR-018: "Use clamped cosine".)
  const cosine = rawCosine < 0 ? 0 : rawCosine > 1 ? 1 : rawCosine;
  const cosineComponent = cosine * MATCH_CONFIG.cosineWeight * 100;

  const dBonus = districtBonus(input.districtSame, input.districtNeighbour);
  const tBonus = timeProximityBonus(input.timeGapHours);
  const sBonus = sexBonus(input.missingSex, input.foundSex);
  const aBonus = ageOverlapBonus(
    input.missingAgeMin,
    input.missingAgeMax,
    input.foundAgeMin,
    input.foundAgeMax,
  );

  // Re-normalise the present bonuses to the (1 - cosineWeight) share so the
  // total always sits in [0, 100] regardless of which fields are known. An
  // unknown field contributes null and NO bonus (BR-018).
  const presentCount = [dBonus, tBonus, sBonus, aBonus].filter((v) => v !== null).length;
  const bonusShare = MATCH_CONFIG.bonusShare * 100;
  const slice = (v: number | null): number | null =>
    v === null ? null : round2((v / Math.max(1, presentCount)) * bonusShare);
  const bonusComponent =
    [slice(dBonus), slice(tBonus), slice(sBonus), slice(aBonus)]
      .reduce<number>((acc, v) => acc + (v ?? 0), 0);

  const similarityRaw = cosineComponent + bonusComponent;
  const similarity = similarityRaw < 0 ? 0 : similarityRaw > 100 ? 100 : similarityRaw;

  const components: Record<string, number | null> = {
    cosine: round2(cosineComponent),
    district: slice(dBonus),
    time_proximity: slice(tBonus),
    sex: slice(sBonus),
    age_overlap: slice(aBonus),
  };

  const qualified =
    cosine >= MATCH_CONFIG.minCosineToQualify &&
    similarity >= MATCH_CONFIG.qualifySimilarity;

  return { similarity: round2(similarity), components, qualified };
}

function round2(n: number): number {
  // Deterministic two-decimal rounding keeps stored similarity values
  // byte-identical across reruns.
  return Math.round(n * 100) / 100;
}

/* ---------- rankCandidates ---------- */

/**
 * Order scored candidates by similarity (highest first), then by a stable
 * `id` tiebreak (lexicographic), keep only `qualified` rows, and return at
 * most `MATCH_CONFIG.candidatesPerQueueItem` of them. The default `limit`
 * reads from the contract (BR-018 / FR-012: at most five). An empty input or
 * an all-abstain input returns `[]` — TC-041: the empty shortlist is valid.
 */
export function rankCandidates(
  scored: ReadonlyArray<{ id: string; scored: ScoredCandidate }>,
  limit: number = MATCH_CONFIG.candidatesPerQueueItem,
): RankedCandidate[] {
  if (limit < 0) limit = 0;
  const qualified = scored.filter((s) => s.scored.qualified);
  qualified.sort((a, b) => {
    if (a.scored.similarity !== b.scored.similarity) {
      return b.scored.similarity - a.scored.similarity;
    }
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
  return qualified.slice(0, limit).map((s) => ({
    id: s.id,
    similarity: s.scored.similarity,
    components: s.scored.components,
  }));
}

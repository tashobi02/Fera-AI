// TASK-017b / P3-031: pair scoring, bonuses and qualify-or-abstain.
//
// Pure functions (no DB, no I/O). A candidate's score is a similarity in 0–100
// (BR-018: "Score 'মিলের মাত্রা' is not identity probability"; A-015: "0–100
// similarity score is understandable to officers if labelled as similarity").
//
// Spec-derived (cite the spec):
//   - Five fixed weights {cosine .55, name .15, clothing .15, district .10,
//     age .05} come from D2 PartA V2 A-028.
//   - The ±2 year age tolerance comes from D1 PRD V2 BR-017.
//   - Missing feature values are null, not fabricated agreement (BR-018).
//   - "Until calibrated, label ranking experimental" (BR-018) → MATCH_CONFIG
//     is marked experimental: true.
//
// Documented default, calibrate on dev split only (AMD-3-3):
//   - minCosineToQualify and qualifySimilarity thresholds.
//   - qualifySimilarity semantics.
//   - The name/clothing/district/age component formulas (NFC, token-set
//     Jaccard, neighbour-half, interval-overlap closeness).
//
// TC-041: an EMPTY shortlist is a valid result.
//
// Returned `similarity` is a similarity in the inclusive range [0, 100]. It is
// not a probability and not a confidence; the wording in `officer-match.ts`
// repeats this. We do not name anything `probability` or `confidence` here.

import { LIMITS } from "@/contracts/primitives";

/* ---------- Inputs ---------- */

export interface ScoreInput {
  // Two L2-normalised, same-space embedding vectors. The cosine of the
  // embedding pair is the dominant signal (D1 BR-018; A-028). Cosine is the
  // only feature that is always available for a valid pair. ArrayLike
  // accepts plain arrays, Float32Array (Transformers.js) and other
  // typed arrays; strings are rejected by the guard.
  missingEmbedding: ArrayLike<number>;
  foundEmbedding: ArrayLike<number>;

  // Text fields used for the name and clothing components. `null` or empty
  // on either side yields a `null` component (BR-018: missing values are
  // null, not fabricated agreement).
  missingName: string | null;
  foundName: string | null;
  missingClothing: string | null;
  foundClothing: string | null;

  // District. `null` on either side is unknown (BR-018). `same` and
  // `neighbour` are not both true at once; if both null, the component is
  // null.
  districtSame: boolean | null;
  districtNeighbour: boolean | null;

  // Age intervals in whole years. `null` on any bound is unknown (BR-018);
  // an unknown interval yields a `null` age component.
  missingAgeMin: number | null;
  missingAgeMax: number | null;
  foundAgeMin: number | null;
  foundAgeMax: number | null;
}

/* ---------- Single match output ---------- */

export interface ScoredCandidate {
  /** 0–100 similarity (not a probability, not a confidence). */
  similarity: number;
  /**
   * Component contributions on a 0–1 scale, `null` where the feature is
   * unknown. Exactly the keys: cosine, name, clothing, district, age.
   * (D5 MatchComponents contract; BR-018 missing-as-null.)
   */
  components: {
    cosine: number | null;
    name: number | null;
    clothing: number | null;
    district: number | null;
    age: number | null;
  };
  /**
   * `true` only when the similarity meets the qualify threshold AND the
   * cosine itself is at least the minimum cosine floor (otherwise a perfect
   * bonus run on an unrelated pair would qualify). Always `false` for an
   * invalid pair or an abstain (TC-041).
   */
  qualified: boolean;
}

/* ---------- Ranked output ---------- */

export interface RankedCandidate {
  /** Stable identifier used to break similarity ties (e.g. found case UUID). */
  id: string;
  similarity: number;
  components: ScoredCandidate["components"];
}

/* ---------- Single config constant (BR-018) ---------- */

/**
 * All weights, thresholds and the candidate cap live here. Per BR-018 and
 * AMD-3-3, the weights and the ±2 year tolerance are spec-derived; the
 * thresholds and component formulas are "documented default, calibrate on
 * dev split only" — never tuned from held-out results. The matcher engine
 * reads them through `MATCH_CONFIG` so a single change point governs
 * ranking. BR-018 says "Until calibrated, label ranking experimental"; the
 * `experimental: true` flag is exported so the UI can show the label.
 */
export const MATCH_CONFIG = {
  // Spec-derived weights (A-028).
  cosineWeight: 0.55, // D2 PartA V2 A-028: 0.55 cosine
  nameWeight: 0.15, // D2 PartA V2 A-028: 0.15 name
  clothingWeight: 0.15, // D2 PartA V2 A-028: 0.15 clothing
  districtWeight: 0.1, // D2 PartA V2 A-028: 0.10 district
  ageWeight: 0.05, // D2 PartA V2 A-028: 0.05 age closeness

  // Spec-derived tolerance.
  ageOverlapToleranceYears: 2, // D1 PRD V2 BR-017 ±2-year window

  // Documented default, calibrate on dev split only (AMD-3-3);
  // NOT stated in BR-018 or A-028. The spec only constrains the
  // ±2-year tolerance and the weights; this floor is an
  // implementation-side guard against unrelated pairs that score
  // high on the soft features (e.g. a same-district coincidence).
  minCosineToQualify: 0.3,
  // Documented default, calibrate on dev split only (AMD-3-3). Minimum
  // similarity to qualify (0–100 scale). A pair whose weighted score is
  // below this abstains (TC-041).
  qualifySimilarity: 60,

  // BR-018 / FR-012: "display at most five qualified candidates, and allow
  // zero." We read it from the frozen LIMITS so the contract stays the
  // single source.
  candidatesPerQueueItem: LIMITS.candidatesPerQueueItem,

  // BR-018: "Until calibrated, label ranking experimental". The UI reads
  // this to render the experimental label.
  experimental: true,
} as const;

/* ---------- Cosine (always available for a valid pair) ---------- */

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function l2norm(v: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!;
  return Math.sqrt(s);
}

function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length === 0 || b.length === 0) return 0;
  if (a.length !== b.length) return 0; // different space — refuse
  const na = l2norm(a);
  const nb = l2norm(b);
  if (na === 0 || nb === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot / (na * nb);
}

/* ---------- Component helpers (documented default, AMD-3-3) ---------- */

/**
 * Tokenise free text for the name and clothing components. NFC, lower-case,
 * punctuation stripped, whitespace-collapsed, then split on whitespace into
 * a set of tokens. Documented default; calibrate on dev split only
 * (AMD-3-3).
 */
function tokenise(s: string): Set<string> {
  // 1. NFC normalise so visually-equivalent Bangla composes identically.
  // 2. Lower-case (safe for both Latin and Bangla script).
  // 3. Strip punctuation: anything that is not a letter (L), combining
  //    mark (M), digit (N) or whitespace. Keeping \p{M} preserves
  //    Bangla vowel signs (ে, ো, ু, etc.) and the hasanta (্) so a
  //    composite character like "র" + "্" + "হ" + "ি" + "ম" stays as a
  //    single token, not shredded into separate characters.
  // 4. Collapse internal whitespace runs and trim.
  const normalised = s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalised === "") return new Set();
  return new Set(normalised.split(" "));
}

/**
 * Token-set Jaccard similarity. Returns a value in [0, 1]. Both sets empty
 * (i.e. both sides were empty after normalisation) is treated as missing —
 * the brief says "null when either side is missing/empty", and "empty
 * after normalisation" is empty for the purpose of the input contract.
 */
function jaccard(a: Set<string>, b: Set<string>): number | null {
  if (a.size === 0 || b.size === 0) return null;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  if (union === 0) return null;
  return intersection / union;
}

function textComponent(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  // Documented default (AMD-3-3). BR-018: missing values are null.
  // Treat undefined the same as null (defensive: callers that
  // forget to normalise a missing field should not throw).
  if (a == null || b == null) return null;
  if (a === "" || b === "") return null;
  return jaccard(tokenise(a), tokenise(b));
}

// NOTE on name-script comparison (TASK-017b / P3-031 round 2):
// This module compares the parent-reported child_name and the
// staff-entered child_name token by token after NFC + lowercase +
// punctuation strip. A Bangla-script name on one side and a
// Latin-script name on the other are NOT comparable here and so
// score 0 (whole-token mismatch after tokenisation). This is a
// known limitation of the present implementation; a Bangla
// transliteration step against the synthetic child_name_latin
// field (when present) is on the roadmap as a later improvement
// and will NOT be tackled in this fix round.

/**
 * District component: 1 same, 0.5 neighbour, 0 otherwise; null when
 * neither axis is known (the parent / staff could not say).
 * Documented default (AMD-3-3).
 *
 * A known "same" dominates a known "neighbour" (1 wins over 0.5).
 * When only the neighbour axis is known, the score is 0.5 if
 * neighbour is true, else 0. When only the same axis is known and
 * it is true, score 1; if it is false, score 0.
 */
function districtComponent(
  same: boolean | null,
  neighbour: boolean | null,
): number | null {
  if (same === null && neighbour === null) return null;
  if (same === true) return 1;
  if (neighbour === true) return 0.5;
  if (same === false || neighbour === false) return 0;
  // Only one axis known and it is the unknown one — i.e. we reach
  // here with (same=null, neighbour=true) already handled above and
  // (same=true, neighbour=null) already handled above. The remaining
  // cases (same=null, neighbour=false) and (same=true, neighbour=null)
  // both fall through to 0.
  return 0;
}

/**
 * Age interval-overlap closeness within the BR-017 ±2 year tolerance.
 *
 * Only ONE side is widened by the tolerance — the other stays at
 * its raw interval — so two intervals that differ by exactly 2
 * years can still score 1.0 (the widened side reaches the raw
 * side) but 3 years apart score < 1.0. Widening BOTH sides (the
 * old behaviour) effectively doubled the band.
 *
 * The overlap is computed in INCLUSIVE year arithmetic: an
 * intersection of [x, y] contains y − x + 1 whole years. A full
 * overlap yields 1.0; a disjoint pair yields 0. Null if either side
 * has any unknown bound. The isValidPair guard rejects min > max
 * and negative bounds upstream, so this function does not re-check.
 *
 * Documented default (AMD-3-3).
 */
function ageComponent(
  aMin: number | null,
  aMax: number | null,
  bMin: number | null,
  bMax: number | null,
): number | null {
  if (aMin === null || aMax === null || bMin === null || bMax === null) {
    return null;
  }
  const tol = MATCH_CONFIG.ageOverlapToleranceYears;
  // Widen only the b-side by the tolerance; a-side stays raw. The filter
  // at filters.ts:100 widens BOTH sides, but the score function is the
  // inner per-candidate assessment and is tested with pairs that would
  // have been excluded by the filter (e.g. b exactly 3 years above a) —
  // those must score 0 here. Tests in tests/match/score.test.ts pin this.
  const overlapLo = Math.max(aMin, bMin - tol);
  const overlapHi = Math.min(aMax, bMax + tol);
  const overlapYears = overlapHi - overlapLo + 1;
  if (overlapYears <= 0) return 0;
  // Inclusive span of each raw interval (a single year is span 1).
  const spanA = aMax - aMin + 1;
  const spanB = bMax - bMin + 1;
  const denom = Math.max(1, Math.min(spanA, spanB));
  return Math.min(1, overlapYears / denom);
}

/* ---------- scorePair ---------- */

function invalidComponents(): ScoredCandidate["components"] {
  return { cosine: null, name: null, clothing: null, district: null, age: null };
}

function isValidPair(input: ScoreInput): boolean {
  const { missingEmbedding, foundEmbedding } = input;
  // Accept ArrayLike<number> so typed arrays (Float32Array from
  // Transformers.js, etc.) pass the guard. We deliberately do NOT
  // accept strings here; a string index access would coerce letters
  // to NaN but the typing of the input field is numeric.
  if (!isArrayLikeOfNumbers(missingEmbedding)) return false;
  if (!isArrayLikeOfNumbers(foundEmbedding)) return false;
  if (missingEmbedding.length === 0 || foundEmbedding.length === 0) return false;
  if (missingEmbedding.length !== foundEmbedding.length) return false;
  for (let i = 0; i < missingEmbedding.length; i++) {
    if (!isFiniteNumber(missingEmbedding[i])) return false;
    if (!isFiniteNumber(foundEmbedding[i])) return false;
  }
  if (l2norm(missingEmbedding) === 0 || l2norm(foundEmbedding) === 0) return false;
  // Age bounds, when present, must be finite and non-negative; min
  // must not exceed max; both bounds must be provided together (a
  // single known bound is not a usable interval).
  const ageChecks: Array<[number | null, number | null]> = [
    [input.missingAgeMin, input.missingAgeMax],
    [input.foundAgeMin, input.foundAgeMax],
  ];
  for (const [minV, maxV] of ageChecks) {
    const hasMin = minV !== null;
    const hasMax = maxV !== null;
    // Either both present or both null: a single known bound with
    // the other null is treated as an invalid pair.
    if (hasMin !== hasMax) return false;
    if (hasMin && hasMax) {
      if (!isFiniteNumber(minV!) || !isFiniteNumber(maxV!)) return false;
      if (minV! < 0 || maxV! < 0) return false;
      if (minV! > maxV!) return false;
    }
  }
  return true;
}

function isArrayLikeOfNumbers(v: unknown): v is ArrayLike<number> {
  if (v == null) return false;
  if (typeof v === "string") return false;
  // Array.isArray is true for plain arrays AND any object with a
  // numeric length whose indexed elements are numbers; Float32Array,
  // Float64Array, Int8Array, etc. all satisfy this.
  if (Array.isArray(v)) return true;
  if (typeof v !== "object") return false;
  const obj = v as { readonly length?: unknown };
  if (typeof obj.length !== "number" || !Number.isFinite(obj.length)) {
    return false;
  }
  // Typed arrays expose a non-enumerable, but here we only check
  // that at least one indexed access returns a number. This is
  // enough to reject plain objects that look array-like by name.
  return typeof (obj as ArrayLike<unknown>)[0] === "number";
}

export function scorePair(input: ScoreInput): ScoredCandidate {
  // Invalid-pair guard: never compute other features. On any failure
  // return {similarity: 0, qualified: false, components: all null}. NaN
  // and Infinity must never be returned.
  if (!isValidPair(input)) {
    return { similarity: 0, qualified: false, components: invalidComponents() };
  }

  const rawCosine = cosineSimilarity(input.missingEmbedding, input.foundEmbedding);
  // Clamp to [0, 1]; negative cosine is a non-match for similarity, not a
  // penalty. (BR-018: "Use clamped cosine".)
  const cosine = rawCosine < 0 ? 0 : rawCosine > 1 ? 1 : rawCosine;
  const name = textComponent(input.missingName, input.foundName);
  const clothing = textComponent(input.missingClothing, input.foundClothing);
  const district = districtComponent(input.districtSame, input.districtNeighbour);
  const age = ageComponent(
    input.missingAgeMin,
    input.missingAgeMax,
    input.foundAgeMin,
    input.foundAgeMax,
  );

  // Available-feature weight normalisation (BR-018). Cosine is always
  // available for a valid pair; every other feature contributes its
  // weight only when it is not null. The formula:
  //   similarity = 100 × Σ(w_i × c_i over AVAILABLE) / Σ(w_i over AVAILABLE)
  const entries: Array<{ w: number; c: number | null }> = [
    { w: MATCH_CONFIG.cosineWeight, c: cosine },
    { w: MATCH_CONFIG.nameWeight, c: name },
    { w: MATCH_CONFIG.clothingWeight, c: clothing },
    { w: MATCH_CONFIG.districtWeight, c: district },
    { w: MATCH_CONFIG.ageWeight, c: age },
  ];
  const available = entries.filter((e) => e.c !== null) as Array<{
    w: number;
    c: number;
  }>;
  let numerator = 0;
  let denominator = 0;
  for (const e of available) {
    numerator += e.w * e.c;
    denominator += e.w;
  }
  const similarityRaw =
    denominator > 0 ? 100 * (numerator / denominator) : 0;
  const similarity =
    !Number.isFinite(similarityRaw)
      ? 0
      : similarityRaw < 0
      ? 0
      : similarityRaw > 100
      ? 100
      : similarityRaw;

  const components: ScoredCandidate["components"] = {
    cosine: round2(cosine),
    name: name === null ? null : round2(name),
    clothing: clothing === null ? null : round2(clothing),
    district: district === null ? null : round2(district),
    age: age === null ? null : round2(age),
  };

  // Round similarity to 2 decimals FIRST and decide qualification
  // against the rounded value. The returned value is also the
  // rounded value, so qualification and ranking agree with what the
  // caller sees. A raw 59.996 that rounds to 60.00 must qualify.
  const similarityRounded = round2(similarity);

  const qualified =
    cosine >= MATCH_CONFIG.minCosineToQualify &&
    similarityRounded >= MATCH_CONFIG.qualifySimilarity;

  return { similarity: similarityRounded, components, qualified };
}

function round2(n: number): number {
  // Deterministic two-decimal rounding keeps stored similarity values
  // byte-identical across reruns.
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/* ---------- rankCandidates ---------- */

/**
 * Order scored candidates by similarity (highest first), then by a stable
 * `id` tiebreak compared by UTF-16 code unit, keep only `qualified` rows,
 * and return at most `MATCH_CONFIG.candidatesPerQueueItem` of them. The
 * default `limit` reads from the contract (BR-018 / FR-012: at most five).
 * An empty input or an all-abstain input returns `[]` — TC-041: the empty
 * shortlist is valid.
 *
 * Limit policy:
 *   - The result length never exceeds MATCH_CONFIG.candidatesPerQueueItem
 *     even if a larger limit is passed.
 *   - A NaN, negative, or fractional limit falls back to the cap
 *     (MATCH_CONFIG.candidatesPerQueueItem). A limit that is `Infinity` is
 *     also clamped to the cap for the same reason.
 *   - Ties on similarity break on the rounded similarity first, then on
 *     `id` compared by code unit.
 */
export function rankCandidates(
  scored: ReadonlyArray<{ id: string; scored: ScoredCandidate }>,
  limit: number = MATCH_CONFIG.candidatesPerQueueItem,
): RankedCandidate[] {
  const cap = MATCH_CONFIG.candidatesPerQueueItem;
  let effectiveLimit: number;
  if (
    !Number.isFinite(limit) ||
    limit < 0 ||
    !Number.isInteger(limit) ||
    limit > cap
  ) {
    effectiveLimit = cap;
  } else {
    effectiveLimit = limit;
  }

  const qualified = scored.filter((s) => s.scored.qualified);
  qualified.sort((a, b) => {
    // Primary: rounded similarity, highest first.
    if (a.scored.similarity !== b.scored.similarity) {
      return b.scored.similarity - a.scored.similarity;
    }
    // Secondary: id compared by UTF-16 code unit.
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
  return qualified.slice(0, effectiveLimit).map((s) => ({
    id: s.id,
    similarity: s.scored.similarity,
    components: s.scored.components,
  }));
}

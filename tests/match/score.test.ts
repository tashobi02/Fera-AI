// TASK-017b / P3-031: pure-function tests for pair scoring, bonuses and
// qualify-or-abstain. BR-018, TC-041. AMD-3-3: thresholds/weights are
// documented defaults calibrated on the dev split only.
//
// Spec references: D2 PartA V2 A-028 (weights), D1 PRD V2 BR-018 (BR-018
// missing-as-null; "until calibrated, label ranking experimental"), D1 PRD
// V2 BR-017 (±2 year age tolerance), D5 MatchComponents contract.
//
// Synthetic inputs only. No DB, no I/O, no real child data.
import { describe, expect, it } from "vitest";
import {
  MATCH_CONFIG,
  rankCandidates,
  scorePair,
  type ScoreInput,
  type ScoredCandidate,
} from "@/server/matching/score";

// 4-d L2-normalised unit vectors. Reusing small vectors keeps the cosine
// arithmetic easy to follow in test failures.
const a: readonly number[] = [1, 0, 0, 0];
const b: readonly number[] = [0, 1, 0, 0];
const c: readonly number[] = [Math.SQRT1_2, Math.SQRT1_2, 0, 0];

function base(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    missingEmbedding: a,
    foundEmbedding: a,
    missingName: null,
    foundName: null,
    missingClothing: null,
    foundClothing: null,
    districtSame: null,
    districtNeighbour: null,
    missingAgeMin: null,
    missingAgeMax: null,
    foundAgeMin: null,
    foundAgeMax: null,
    ...over,
  };
}

describe("MATCH_CONFIG", () => {
  it("uses the spec-derived A-028 weights summing to 1.0", () => {
    expect(MATCH_CONFIG.cosineWeight).toBe(0.55);
    expect(MATCH_CONFIG.nameWeight).toBe(0.15);
    expect(MATCH_CONFIG.clothingWeight).toBe(0.15);
    expect(MATCH_CONFIG.districtWeight).toBe(0.1);
    expect(MATCH_CONFIG.ageWeight).toBe(0.05);
    const sum =
      MATCH_CONFIG.cosineWeight +
      MATCH_CONFIG.nameWeight +
      MATCH_CONFIG.clothingWeight +
      MATCH_CONFIG.districtWeight +
      MATCH_CONFIG.ageWeight;
    expect(sum).toBeCloseTo(1.0, 10);
  });
  it("uses the spec-derived BR-017 age tolerance", () => {
    expect(MATCH_CONFIG.ageOverlapToleranceYears).toBe(2);
  });
  it("reads the candidate cap from the frozen LIMITS (BR-018, FR-012)", () => {
    expect(MATCH_CONFIG.candidatesPerQueueItem).toBe(5);
  });
  it("flags the ranking as experimental (BR-018: 'Until calibrated, label ranking experimental')", () => {
    expect(MATCH_CONFIG.experimental).toBe(true);
  });
  it("never exposes probability or confidence names", () => {
    const serialized = JSON.stringify(MATCH_CONFIG).toLowerCase();
    expect(serialized).not.toMatch(/probability|confidence/);
  });
});

describe("scorePair — cosine (always available for a valid pair)", () => {
  it("cosine of identical vectors is 1.0", () => {
    const r = scorePair(base());
    expect(r.components.cosine).toBeCloseTo(1, 5);
  });
  it("cosine of orthogonal vectors is 0", () => {
    const r = scorePair(base({ foundEmbedding: b }));
    expect(r.components.cosine).toBe(0);
  });
  it("cosine is clamped: an anti-parallel pair yields 0, not negative", () => {
    const r = scorePair(base({ foundEmbedding: [-1, 0, 0, 0] }));
    expect(r.components.cosine).toBe(0);
    expect(r.similarity).toBeGreaterThanOrEqual(0);
  });
  it("empty or mismatched-length vectors return 0 similarity, not NaN", () => {
    const empty = scorePair(base({ missingEmbedding: [], foundEmbedding: [] }));
    expect(empty.similarity).toBe(0);
    expect(empty.qualified).toBe(false);
    expect(empty.components.cosine).toBeNull();
    const mismatch = scorePair(
      base({ missingEmbedding: [1, 0], foundEmbedding: [1, 0, 0] }),
    );
    expect(mismatch.similarity).toBe(0);
    expect(mismatch.qualified).toBe(false);
    expect(mismatch.components.cosine).toBeNull();
  });
  it("cosine is on a 0-1 scale (the components are 0-1; similarity is 0-100)", () => {
    const r = scorePair(base({ foundEmbedding: c }));
    expect(r.components.cosine).toBeGreaterThanOrEqual(0);
    expect(r.components.cosine!).toBeLessThanOrEqual(1);
  });
});

describe("scorePair — invalid-pair guard", () => {
  it("zero vector pair → similarity 0, qualified false, all-null components", () => {
    const r = scorePair(
      base({ missingEmbedding: [0, 0, 0, 0], foundEmbedding: [0, 0, 0, 0] }),
    );
    expect(r.similarity).toBe(0);
    expect(r.qualified).toBe(false);
    expect(r.components).toEqual({
      cosine: null,
      name: null,
      clothing: null,
      district: null,
      age: null,
    });
  });
  it("NaN in either embedding → similarity 0, qualified false, all-null components", () => {
    const r = scorePair(
      base({ missingEmbedding: [Number.NaN, 0, 0, 0], foundEmbedding: a }),
    );
    expect(r.similarity).toBe(0);
    expect(r.qualified).toBe(false);
    expect(r.components.cosine).toBeNull();
    expect(r.components.name).toBeNull();
  });
  it("Infinity in either embedding → similarity 0, qualified false, all-null components", () => {
    const r = scorePair(
      base({ missingEmbedding: a, foundEmbedding: [Number.POSITIVE_INFINITY, 0, 0, 0] }),
    );
    expect(r.similarity).toBe(0);
    expect(r.qualified).toBe(false);
    expect(r.components.cosine).toBeNull();
  });
  it("NaN in age bounds → similarity 0, qualified false, all-null components", () => {
    const r = scorePair(
      base({ missingAgeMin: 5, missingAgeMax: 10, foundAgeMin: Number.NaN, foundAgeMax: 10 }),
    );
    expect(r.similarity).toBe(0);
    expect(r.qualified).toBe(false);
    expect(r.components.age).toBeNull();
  });
  it("min > max on any age interval → invalid pair (all-null components)", () => {
    const r = scorePair(
      base({ missingAgeMin: 12, missingAgeMax: 10, foundAgeMin: 10, foundAgeMax: 10 }),
    );
    expect(r.similarity).toBe(0);
    expect(r.qualified).toBe(false);
    expect(r.components.age).toBeNull();
  });
  it("negative age bound → invalid pair (all-null components)", () => {
    const r = scorePair(
      base({ missingAgeMin: -3, missingAgeMax: 5, foundAgeMin: 5, foundAgeMax: 5 }),
    );
    expect(r.similarity).toBe(0);
    expect(r.qualified).toBe(false);
    expect(r.components.age).toBeNull();
  });
  it("a single known age bound (min known, max null) → invalid pair", () => {
    // The age contract requires both bounds to be present or both
    // null. A single known bound is treated as invalid upstream so
    // downstream code does not invent a value for the missing one.
    const r = scorePair(
      base({ missingAgeMin: 10, missingAgeMax: null, foundAgeMin: 10, foundAgeMax: 10 }),
    );
    expect(r.similarity).toBe(0);
    expect(r.qualified).toBe(false);
    expect(r.components.age).toBeNull();
  });
  it("a Float32Array of finite numbers is a valid embedding pair", () => {
    // Transformers.js returns Float32Array. Array.isArray would
    // return false on a Float32Array, so the guard must accept
    // typed arrays via ArrayLike<number>.
    const m = new Float32Array([0.6, 0.8, 0, 0]);
    const f = new Float32Array([0.6, 0.8, 0, 0]);
    const r = scorePair(
      base({ missingEmbedding: m, foundEmbedding: f }),
    );
    expect(r.similarity).toBeGreaterThan(0);
    expect(r.components.cosine).toBeCloseTo(1, 5);
  });
  it("a Float32Array with NaN → invalid pair (all-null components)", () => {
    const m = new Float32Array([Number.NaN, 0.8, 0, 0]);
    const f = new Float32Array([0.6, 0.8, 0, 0]);
    const r = scorePair(
      base({ missingEmbedding: m, foundEmbedding: f }),
    );
    expect(r.similarity).toBe(0);
    expect(r.qualified).toBe(false);
    expect(r.components.cosine).toBeNull();
  });
  it("a string is rejected as an embedding (not a numeric array-like)", () => {
    const r = scorePair(
      base({ missingEmbedding: "1,0,0,0" as unknown as readonly number[], foundEmbedding: a }),
    );
    expect(r.similarity).toBe(0);
    expect(r.qualified).toBe(false);
    expect(r.components.cosine).toBeNull();
  });
  it("never returns NaN or Infinity for any field across bad inputs", () => {
    const cases: ScoreInput[] = [
      base({ missingEmbedding: [0, 0, 0, 0], foundEmbedding: [0, 0, 0, 0] }),
      base({ missingEmbedding: [Number.NaN, 0, 0, 0], foundEmbedding: a }),
      base({ missingEmbedding: a, foundEmbedding: [Number.POSITIVE_INFINITY, 0, 0, 0] }),
      base({ missingEmbedding: [], foundEmbedding: [] }),
      base({ missingEmbedding: [1, 0], foundEmbedding: [1, 0, 0] }),
      base({ missingAgeMin: Number.NaN, missingAgeMax: 5, foundAgeMin: 5, foundAgeMax: 5 }),
      base({ missingAgeMin: 12, missingAgeMax: 10, foundAgeMin: 10, foundAgeMax: 10 }),
      base({ missingAgeMin: -3, missingAgeMax: 5, foundAgeMin: 5, foundAgeMax: 5 }),
      base({ missingAgeMin: 10, missingAgeMax: null, foundAgeMin: 10, foundAgeMax: 10 }),
      base({ missingEmbedding: "1,0,0,0" as unknown as readonly number[], foundEmbedding: a }),
    ];
    for (const c of cases) {
      const r = scorePair(c);
      expect(Number.isFinite(r.similarity)).toBe(true);
      for (const v of Object.values(r.components)) {
        expect(v === null || Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe("scorePair — A-028 components: name/clothing", () => {
  it("name component is null when either side is null", () => {
    const r = scorePair(base({ missingName: "Rahim", foundName: null }));
    expect(r.components.name).toBeNull();
  });
  it("name component is null when either side is empty after normalisation", () => {
    const r = scorePair(base({ missingName: "Rahim", foundName: "   " }));
    expect(r.components.name).toBeNull();
  });
  it("textComponent treats undefined the same as null (P3-031 fix #6)", () => {
    // The ScoreInput type is `string | null`, but a defensive
    // textComponent also accepts `undefined` and returns null
    // instead of throwing. Pass undefined through `as never` (the
    // public type forbids it; this test pins the runtime safety).
    const r = scorePair(
      base({
        missingName: undefined as unknown as null,
        foundName: "Rahim",
      }),
    );
    expect(r.components.name).toBeNull();
  });
  it("textComponent treats clothing undefined the same as null", () => {
    const r = scorePair(
      base({
        missingClothing: "blue shirt",
        foundClothing: undefined as unknown as null,
      }),
    );
    expect(r.components.clothing).toBeNull();
  });
  it("name component = token-set Jaccard on NFC / lower-case / punctuation-stripped text", () => {
    const r = scorePair(
      base({
        missingName: "Md. Rahim Uddin!",
        foundName: "rahim uddin",
      }),
    );
    // After NFC + lowercase + punct strip + whitespace collapse both sides
    // are {md, rahim, uddin} and {rahim, uddin}. Jaccard = 2/3, rounded to
    // 2dp (the component scale is 0-1 rounded).
    expect(r.components.name).toBeCloseTo(2 / 3, 2);
  });
  it("clothing component is null when either side is missing", () => {
    const r = scorePair(base({ missingClothing: "blue shirt", foundClothing: null }));
    expect(r.components.clothing).toBeNull();
  });
  it("clothing component is null when both sides are empty after normalisation", () => {
    const r = scorePair(
      base({ missingClothing: "!!!", foundClothing: "..." }),
    );
    expect(r.components.clothing).toBeNull();
  });
  it("clothing component is on a 0-1 scale", () => {
    const r = scorePair(
      base({
        missingClothing: "blue shirt, jeans",
        foundClothing: "shirt blue",
      }),
    );
    expect(r.components.clothing!).toBeGreaterThanOrEqual(0);
    expect(r.components.clothing!).toBeLessThanOrEqual(1);
  });
  it("Bangla name 'রহিম' vs 'রহিম' = 1 (tokenise keeps the whole composite token)", () => {
    // P3-031 fix #1: the old /[^\p{L}\p{N}\s]+/gu regex shredded
    // combining marks, splitting "রহিম" into ["রহ","ম"]. The fix
    // keeps \p{M} so the whole name is one token. Identical names
    // therefore Jaccard 1.
    const r = scorePair(
      base({ missingName: "রহিম", foundName: "রহিম" }),
    );
    expect(r.components.name).toBe(1);
  });
  it("Bangla name 'রহিম' vs 'করিম' = 0 (whole-token mismatch, not partial)", () => {
    // Two different Bangla names that differ only in the first
    // consonant: with the fix they are different tokens and Jaccard
    // is 0 (not a partial credit from a "rahim"/"karim" syllable
    // overlap — the old regex would have shredded both into similar
    // fragments and produced a misleading partial score).
    const r = scorePair(
      base({ missingName: "রহিম", foundName: "করিম" }),
    );
    expect(r.components.name).toBe(0);
  });
  it("multi-token Bangla clothing: 'লাল শার্ট, নীল জিন্স' vs 'নীল জিন্স' Jaccard = 2/3", () => {
    // Both sides NFC-normalise then tokenise. With the fix the
    // composite tokens {লাল, শার্ট, নীল, জিন্স} and {নীল, জিন্স}
    // intersect on 2 tokens, union on 4. Jaccard = 2/4 = 0.5.
    // The old regex would have shredded each composite into
    // 2-3 fragments, changing the Jaccard.
    const r = scorePair(
      base({
        missingClothing: "লাল শার্ট, নীল জিন্স",
        foundClothing: "নীল জিন্স",
      }),
    );
    expect(r.components.clothing).toBeCloseTo(0.5, 2);
  });
  it("two-token Bangla name 'রহিম উদ্দিন' keeps each token whole (no combining-mark shredding)", () => {
    // "রহিম উদ্দিন" splits on the ASCII space into 2 tokens, and
    // each token keeps its combining marks intact (the hasanta ্
    // and the vowel sign ি). Compared to itself, the two token
    // sets are equal and Jaccard = 1. The old regex would have
    // turned "রহিম" into {রহ, ম} and "উদ্দিন" into {উদ, দ, ন},
    // dropping the intra-token Jaccard for any close-but-not-equal
    // pair.
    const r = scorePair(
      base({ missingName: "রহিম উদ্দিন", foundName: "রহিম উদ্দিন" }),
    );
    expect(r.components.name).toBe(1);
  });
  it("'রহিম উদ্দিন' vs 'রহিম' (Bangla) = 1/2 (one of two tokens shared)", () => {
    // With the fix, {রহিম, উদ্দিন} ∩ {রহিম} = {রহিম}; union = 2.
    // Jaccard = 1/2 = 0.5. The old regex would have produced
    // {রহ, ম} ∩ {রহ} = {রহ} with union 3 → 1/3, a different
    // value.
    const r = scorePair(
      base({ missingName: "রহিম উদ্দিন", foundName: "রহিম" }),
    );
    expect(r.components.name).toBeCloseTo(0.5, 2);
  });
});

describe("scorePair — A-028 components: district", () => {
  it("district component is null when both axes are unknown", () => {
    const r = scorePair(
      base({ districtSame: null, districtNeighbour: null }),
    );
    expect(r.components.district).toBeNull();
  });
  it("district component is 1 when same is true", () => {
    const r = scorePair(
      base({ districtSame: true, districtNeighbour: null }),
    );
    expect(r.components.district).toBe(1);
  });
  it("district component is 0.5 when only neighbour is true", () => {
    const r = scorePair(
      base({ districtSame: false, districtNeighbour: true }),
    );
    expect(r.components.district).toBe(0.5);
  });
  it("district component is 0 when both axes are known and both disagree", () => {
    const r = scorePair(
      base({ districtSame: false, districtNeighbour: false }),
    );
    expect(r.components.district).toBe(0);
  });
  it("district component is null when only 'same' is unknown and no neighbour info (P3-031 fix #6)", () => {
    // "Unknown same with no neighbour info" = (same=null,
    // neighbour=null) → null (no evidence either way). The same
    // null/unknown is preserved when only one axis is unknown and
    // the other is unknown too; the dead branches that used to
    // fall through to 0 have been removed.
    const r = scorePair(
      base({ districtSame: null, districtNeighbour: null }),
    );
    expect(r.components.district).toBeNull();
  });
  it("district component is 0 when same is unknown and neighbour is false (no match)", () => {
    // A known 'neighbour = false' on the only known axis is
    // disagreement, not unknown — so the score is 0, not null.
    const r = scorePair(
      base({ districtSame: null, districtNeighbour: false }),
    );
    expect(r.components.district).toBe(0);
  });
});

describe("scorePair — A-028 components: age", () => {
  it("age component is null when any bound is null (BR-018)", () => {
    const r = scorePair(
      base({ missingAgeMin: 10, missingAgeMax: 12, foundAgeMin: null, foundAgeMax: 12 }),
    );
    expect(r.components.age).toBeNull();
  });
  it("age component is 0 when the intervals do not intersect even with ±2y tolerance", () => {
    // Hand-computed (P3-031 fix #3): widen only the b-side by ±2.
    // a=[5,6] raw, b=[15,17] widened to [13,19]. Overlap = empty.
    // 0.
    const r = scorePair(
      base({ missingAgeMin: 5, missingAgeMax: 6, foundAgeMin: 15, foundAgeMax: 17 }),
    );
    expect(r.components.age).toBe(0);
  });
  it("age component is 1 when the intervals fully overlap (single-year, equal)", () => {
    // Hand-computed: a=[10,10] raw, b=[10,10] widened to [8,12].
    // Overlap [10,10] = 1 year. spanA = 1, spanB = 1.
    // min(1, 1/1) = 1.
    const r = scorePair(
      base({ missingAgeMin: 10, missingAgeMax: 10, foundAgeMin: 10, foundAgeMax: 10 }),
    );
    expect(r.components.age).toBe(1);
  });
  it("age component is 1 when b is exactly 2 years above a single-year a (inside tolerance)", () => {
    // Hand-computed (P3-031 fix #3): a=[10,10] raw, b=[12,12]
    // widened to [10,14]. Overlap = [10,10] = 1 year. spanA = 1,
    // spanB = 1. min(1, 1/1) = 1.
    const r = scorePair(
      base({ missingAgeMin: 10, missingAgeMax: 10, foundAgeMin: 12, foundAgeMax: 12 }),
    );
    expect(r.components.age).toBe(1);
  });
  it("age component is 0 when b is exactly 3 years above a single-year a (outside ±2 tolerance)", () => {
    // Hand-computed (P3-031 fix #3): a=[10,10] raw, b=[13,13]
    // widened to [11,15]. Overlap = empty (lo=11, hi=10).
    // 0.
    const r = scorePair(
      base({ missingAgeMin: 10, missingAgeMax: 10, foundAgeMin: 13, foundAgeMax: 13 }),
    );
    expect(r.components.age).toBe(0);
  });
  it("age component on a touching-but-not-overlapping pair is 1 with the new tolerance (the b-side widening reaches a)", () => {
    // Hand-computed (P3-031 fix #3): a=[8,10] raw, b=[10,12]
    // widened to [8,14]. Overlap = [8,10] = 3 years. spanA = 3,
    // spanB = 3. min(1, 3/3) = 1. The old behaviour that widened
    // BOTH sides would also give 1 here; the change is the
    // doubled band, not this case.
    const r = scorePair(
      base({ missingAgeMin: 8, missingAgeMax: 10, foundAgeMin: 10, foundAgeMax: 12 }),
    );
    expect(r.components.age).toBe(1);
  });
  it("age component on a partial overlap [8,12] vs [13,15] is 2/3 (raw intersection 11-12)", () => {
    // Hand-computed (P3-031 fix #3): a=[8,12] raw, b=[13,15]
    // widened to [11,17]. Overlap = [11,12] = 2 years. spanA = 5,
    // spanB = 3. min(5, 3) = 3. min(1, 2/3) ≈ 0.67.
    const r = scorePair(
      base({ missingAgeMin: 8, missingAgeMax: 12, foundAgeMin: 13, foundAgeMax: 15 }),
    );
    expect(r.components.age).toBeCloseTo(2 / 3, 2);
  });
  it("age component is on a 0-1 scale", () => {
    const r = scorePair(
      base({ missingAgeMin: 10, missingAgeMax: 12, foundAgeMin: 11, foundAgeMax: 13 }),
    );
    expect(r.components.age!).toBeGreaterThanOrEqual(0);
    expect(r.components.age!).toBeLessThanOrEqual(1);
  });
});

describe("scorePair — components shape", () => {
  it("components have exactly the five keys cosine, name, clothing, district, age", () => {
    const r = scorePair(base());
    expect(Object.keys(r.components).sort()).toEqual(
      ["age", "clothing", "cosine", "district", "name"].sort(),
    );
  });
  it("components have exactly the five keys even with all features known", () => {
    const r = scorePair(
      base({
        missingName: "Rahim",
        foundName: "Rahim",
        missingClothing: "blue shirt",
        foundClothing: "blue shirt",
        districtSame: true,
        districtNeighbour: null,
        missingAgeMin: 10,
        missingAgeMax: 10,
        foundAgeMin: 10,
        foundAgeMax: 10,
      }),
    );
    expect(Object.keys(r.components).sort()).toEqual(
      ["age", "clothing", "cosine", "district", "name"].sort(),
    );
  });
});

describe("scorePair — single present field cannot inflate the score", () => {
  it("identical embeddings + only district known (district agrees) → 100 × (.55 + .10) / (.55 + .10) = 100", () => {
    // Only cosine and district are available. cosine=1, district=1.
    // similarity = 100 × (0.55*1 + 0.10*1) / (0.55 + 0.10) = 100.
    const r = scorePair(
      base({ districtSame: true, districtNeighbour: null }),
    );
    expect(r.similarity).toBe(100);
  });
  it("identical embeddings + only district known (district is 0.5 neighbour) → 100 × (.55 + .10*.5) / .65", () => {
    // numerator = 0.55*1 + 0.10*0.5 = 0.55 + 0.05 = 0.60
    // denominator = 0.55 + 0.10 = 0.65
    // similarity = 100 × 0.60 / 0.65 = 92.3076923... rounded to 2dp = 92.31
    const r = scorePair(
      base({ districtSame: false, districtNeighbour: true }),
    );
    expect(r.similarity).toBeCloseTo(92.31, 2);
  });
  it("identical embeddings + only district known (district disagrees) → 100 × .55 / .65", () => {
    // numerator = 0.55*1 + 0.10*0 = 0.55
    // denominator = 0.55 + 0.10 = 0.65
    // similarity = 100 × 0.55 / 0.65 = 84.6153846... = 84.62
    const r = scorePair(
      base({ districtSame: false, districtNeighbour: false }),
    );
    expect(r.similarity).toBeCloseTo(84.62, 2);
  });
  it("a lone name agreement (cosine=1, name=1) → 100 × (.55 + .15) / (.55 + .15) = 100", () => {
    const r = scorePair(
      base({ missingName: "Rahim", foundName: "Rahim" }),
    );
    expect(r.similarity).toBe(100);
  });
  it("a lone clothing agreement (cosine=1, clothing=1) → 100 × (.55 + .15) / (.55 + .15) = 100", () => {
    const r = scorePair(
      base({ missingClothing: "blue shirt", foundClothing: "blue shirt" }),
    );
    expect(r.similarity).toBe(100);
  });
});

describe("scorePair — all-unknown pair uses cosine only and can qualify only by cosine", () => {
  it("cosine=1 with no other features known → similarity = 100 (100 × .55 / .55), qualified when cosine meets the floor", () => {
    // With only cosine available, A-028 available-feature weight
    // normalisation makes the lone available feature carry 100% of the
    // weight. cosine=1 → similarity = 100 × (0.55 × 1) / 0.55 = 100.
    // The cosine floor (0.30) is met, so the pair qualifies.
    const r = scorePair(base());
    expect(r.similarity).toBe(100);
    expect(r.qualified).toBe(true);
    expect(r.components.name).toBeNull();
    expect(r.components.clothing).toBeNull();
    expect(r.components.district).toBeNull();
    expect(r.components.age).toBeNull();
  });
  it("cosine=0 (orthogonal) with no other features known → similarity = 0, not qualified (cosine floor fails)", () => {
    const r = scorePair(base({ foundEmbedding: b }));
    expect(r.similarity).toBe(0);
    expect(r.qualified).toBe(false);
  });
  it("lone cosine pair: the score is 100 × cosine, and qualifies only when cosine meets the floor (worked by hand)", () => {
    // c = [√0.5, √0.5, 0, 0] is unit-length and shares the first two
    // axes equally with a, so dot(a, c) = √0.5 ≈ 0.707. With only
    // cosine available, A-028 normalisation makes the lone feature
    // carry 100% of the weight. similarity = 100 × 0.707 = 70.71
    // (rounded to 2dp). The cosine floor (0.30) is met (0.707 > 0.30),
    // so the pair qualifies. This pins the math: a lone-cosine pair
    // scores exactly 100 × cosine.
    const r = scorePair(base({ foundEmbedding: c })); // cosine ≈ 0.707
    expect(r.components.cosine!).toBeGreaterThan(MATCH_CONFIG.minCosineToQualify);
    expect(r.similarity).toBeCloseTo(70.71, 2);
    expect(r.qualified).toBe(true);
  });
  it("cosine ≈ 0.29 with ALL soft features at 1 abstains because of the cosine floor (P3-031 fix #4)", () => {
    // Construct a unit vector d = [0.29, sqrt(1 - 0.29²), 0, 0] so
    // dot(a, d) = 0.29 → cosine = 0.29. cosine = 0.29 < floor 0.30
    // so the cosine-floor guard must make the pair abstain EVEN
    // THOUGH the weighted score with all four soft features at 1
    // is 100 × (0.55*0.29 + 0.15 + 0.15 + 0.10 + 0.05) = 100 ×
    // 0.6095 = 60.95 — which would otherwise qualify (>= 60).
    const d: readonly number[] = [0.29, Math.sqrt(1 - 0.29 * 0.29), 0, 0];
    const r = scorePair(
      base({
        foundEmbedding: d,
        missingName: "Rahim",
        foundName: "Rahim",
        missingClothing: "blue shirt",
        foundClothing: "blue shirt",
        districtSame: true,
        districtNeighbour: null,
        missingAgeMin: 10,
        missingAgeMax: 10,
        foundAgeMin: 10,
        foundAgeMax: 10,
      }),
    );
    // Sanity: weighted similarity is above the threshold.
    expect(r.similarity).toBeGreaterThanOrEqual(MATCH_CONFIG.qualifySimilarity);
    // The cosine floor must still force the pair to abstain.
    expect(r.components.cosine!).toBeLessThan(MATCH_CONFIG.minCosineToQualify);
    expect(r.qualified).toBe(false);
  });
  it("cosine at exactly the floor (0.30) qualifies when similarity meets the threshold", () => {
    // Construct a unit vector e = [0.30, sqrt(1 - 0.30²), 0, 0] so
    // dot(a, e) = 0.30 → cosine = 0.30 (boundary). All other
    // features unknown → similarity = 100 × 0.30 = 30.0. This is
    // below the 60 threshold so it should still abstain. The point
    // of this test is the cosine floor check: 0.30 >= 0.30 is
    // true, so the cosine-floor guard does not block.
    const e: readonly number[] = [0.3, Math.sqrt(1 - 0.09), 0, 0];
    const r = scorePair(base({ foundEmbedding: e }));
    expect(r.components.cosine).toBeCloseTo(0.3, 5);
    expect(r.components.cosine!).toBeGreaterThanOrEqual(MATCH_CONFIG.minCosineToQualify);
    // similarity is below the threshold because only cosine is known.
    expect(r.similarity).toBeLessThan(MATCH_CONFIG.qualifySimilarity);
    expect(r.qualified).toBe(false);
  });
});

describe("scorePair — monotonicity through normalisation", () => {
  it("adding a second known field that is a weaker agreement lowers the score only through normalisation", () => {
    // Worked example #1 (worked by hand):
    //   Case A: cosine=1, district=1 (full). All others unknown.
    //     similarity = 100 × (.55 + .10) / .65 = 100.00
    //   Case B: cosine=1, district=0.5 (neighbour). All others unknown.
    //     numerator = .55*1 + .10*.5 = 0.60; denominator = .65
    //     similarity = 100 × .60 / .65 = 92.31
    //   The score drops only because the second available feature
    //   contributes a smaller share to the same denominator.
    const a_full = scorePair(
      base({ districtSame: true, districtNeighbour: null }),
    );
    const a_half = scorePair(
      base({ districtSame: false, districtNeighbour: true }),
    );
    expect(a_full.similarity).toBeCloseTo(100, 2);
    expect(a_half.similarity).toBeCloseTo(92.31, 2);
    expect(a_half.similarity).toBeLessThan(a_full.similarity);
  });
  it("worked example #2: adding a weaker second feature when both are full gives the same 100", () => {
    //   Case A: cosine=1, district=1. → 100 × (.55+.10)/.65 = 100.
    //   Case B: cosine=1, district=1, name=1. → 100 × (.55+.10+.15)/.80 = 100.
    const a1 = scorePair(
      base({ districtSame: true, districtNeighbour: null }),
    );
    const a2 = scorePair(
      base({
        districtSame: true,
        districtNeighbour: null,
        missingName: "Rahim",
        foundName: "Rahim",
      }),
    );
    expect(a1.similarity).toBeCloseTo(100, 2);
    expect(a2.similarity).toBeCloseTo(100, 2);
  });
  it("a known weak second feature drags the score down proportionally (worked by hand)", () => {
    //   cosine=1, name=0. → similarity = 100 × (.55*1 + .15*0) / .70 = 78.57.
    const r = scorePair(
      base({ missingName: "Rahim", foundName: "CompletelyDifferentName" }),
    );
    // Jaccard: {rahim} ∩ {} = 0; union = 2; jaccard = 0.
    expect(r.components.name).toBe(0);
    // numerator = 0.55*1 + 0.15*0 = 0.55
    // denominator = 0.55 + 0.15 = 0.70
    // similarity = 100 × 0.55 / 0.70 = 78.571428... = 78.57
    expect(r.similarity).toBeCloseTo(78.57, 2);
  });
});

describe("scorePair — similarity bounds and qualification boundary", () => {
  it("similarity is clamped to [0, 100]", () => {
    const low = scorePair(base({ foundEmbedding: [-1, 0, 0, 0] }));
    expect(low.similarity).toBeGreaterThanOrEqual(0);
    const high = scorePair(
      base({
        missingName: "Rahim",
        foundName: "Rahim",
        missingClothing: "blue shirt",
        foundClothing: "blue shirt",
        districtSame: true,
        districtNeighbour: null,
        missingAgeMin: 10,
        missingAgeMax: 10,
        foundAgeMin: 10,
        foundAgeMax: 10,
      }),
    );
    expect(high.similarity).toBeLessThanOrEqual(100);
  });
  it("rounded-similarity boundary: a pair whose raw similarity is above 60 qualifies (P3-031 fix #5)", () => {
    // Hand-computed: cosine=0.5, district=1, age=1.
    // numerator = 0.55*0.5 + 0.10*1 + 0.05*1 = 0.275 + 0.15 = 0.425.
    // denominator = 0.55 + 0.10 + 0.05 = 0.70.
    // raw similarity = 100 × 0.425 / 0.70 = 60.7142...
    // rounds to 60.71. With cosine (0.5) above the floor (0.30)
    // AND similarity (60.71) ≥ the threshold (60), the pair must
    // qualify. The point of this test is that rounding to 2
    // decimals happens BEFORE the threshold check and that the
    // returned `similarity` field is the same rounded value the
    // caller sees — i.e. qualification and ranking both read the
    // same rounded number.
    const v: readonly number[] = [0.5, Math.sqrt(0.75), 0, 0];
    const r = scorePair(
      base({
        missingEmbedding: a,
        foundEmbedding: v, // cosine = 0.5 with a
        districtSame: true,
        districtNeighbour: null,
        missingAgeMin: 10,
        missingAgeMax: 10,
        foundAgeMin: 10,
        foundAgeMax: 10,
      }),
    );
    expect(r.similarity).toBeCloseTo(60.71, 2);
    expect(r.similarity).toBeGreaterThanOrEqual(MATCH_CONFIG.qualifySimilarity);
    expect(r.qualified).toBe(true);
  });
  it("a similarity just below 60 abstains (P3-031 fix #5)", () => {
    // Hand-computed: cosine=0.5, district=0 (different) + age=1.
    // numerator = 0.55*0.5 + 0.10*0 + 0.05*1 = 0.275 + 0.05 = 0.325.
    // denominator = 0.55 + 0.10 + 0.05 = 0.70.
    // raw similarity = 100 × 0.325 / 0.70 = 46.4285... rounds to
    // 46.43. This is comfortably below 60 and abstains.
    const v: readonly number[] = [0.5, Math.sqrt(0.75), 0, 0];
    const r = scorePair(
      base({
        missingEmbedding: a,
        foundEmbedding: v,
        districtSame: false,
        districtNeighbour: false,
        missingAgeMin: 10,
        missingAgeMax: 10,
        foundAgeMin: 10,
        foundAgeMax: 10,
      }),
    );
    expect(r.similarity).toBeLessThan(MATCH_CONFIG.qualifySimilarity);
    expect(r.qualified).toBe(false);
  });
  it("qualifies at and above the threshold; abstains below (TC-041)", () => {
    // A high-evidence pair is above the threshold.
    const good = scorePair(
      base({
        missingName: "Rahim",
        foundName: "Rahim",
        missingClothing: "blue shirt",
        foundClothing: "blue shirt",
        districtSame: true,
        districtNeighbour: null,
        missingAgeMin: 12,
        missingAgeMax: 14,
        foundAgeMin: 12,
        foundAgeMax: 14,
      }),
    );
    expect(good.similarity).toBeGreaterThanOrEqual(MATCH_CONFIG.qualifySimilarity);
    expect(good.qualified).toBe(true);

    // A low-evidence pair is below the threshold and abstains.
    const bad = scorePair(base({ foundEmbedding: b }));
    expect(bad.similarity).toBeLessThan(MATCH_CONFIG.qualifySimilarity);
    expect(bad.qualified).toBe(false);
  });
  it("a high soft-feature run with low cosine does not qualify (cosine floor)", () => {
    // Orthogonal vectors (cosine 0) cannot qualify even with a perfect
    // soft-feature run.
    const orthogonalButSameEverything = scorePair(
      base({
        foundEmbedding: b,
        missingName: "Rahim",
        foundName: "Rahim",
        missingClothing: "blue shirt",
        foundClothing: "blue shirt",
        districtSame: true,
        districtNeighbour: null,
        missingAgeMin: 10,
        missingAgeMax: 10,
        foundAgeMin: 10,
        foundAgeMax: 10,
      }),
    );
    expect(orthogonalButSameEverything.qualified).toBe(false);
  });
});

describe("rankCandidates — ordering, ties, limit, abstain (TC-041)", () => {
  function withId(id: string, s: ScoredCandidate): { id: string; scored: ScoredCandidate } {
    return { id, scored: s };
  }
  it("returns an empty shortlist when no candidate qualifies (TC-041)", () => {
    const none = withId("u1", scorePair(base({ foundEmbedding: b })));
    expect(rankCandidates([none])).toEqual([]);
  });
  it("returns an empty shortlist for an empty input (TC-041)", () => {
    expect(rankCandidates([])).toEqual([]);
  });
  it("orders qualified candidates by similarity (highest first)", () => {
    const a1 = withId(
      "a1",
      scorePair(
        base({
          missingName: "Rahim",
          foundName: "Rahim",
          missingClothing: "blue shirt",
          foundClothing: "blue shirt",
          districtSame: true,
          districtNeighbour: null,
          missingAgeMin: 12,
          missingAgeMax: 14,
          foundAgeMin: 12,
          foundAgeMax: 14,
        }),
      ),
    );
    const a2 = withId(
      "a2",
      scorePair(
        base({
          missingName: "Karim",
          foundName: "Karim",
          missingClothing: "red shirt",
          foundClothing: "red shirt",
          districtSame: false,
          districtNeighbour: true,
          missingAgeMin: 12,
          missingAgeMax: 14,
          foundAgeMin: 13,
          foundAgeMax: 15,
        }),
      ),
    );
    const ranked = rankCandidates([a1, a2]);
    expect(ranked[0]!.id).toBe("a1");
    expect(ranked[0]!.similarity).toBeGreaterThanOrEqual(ranked[1]!.similarity);
  });
  it("ties on similarity break by id (lexicographic, stable)", () => {
    // Identical inputs force the same similarity.
    const seed = scorePair(
      base({
        missingName: "Rahim",
        foundName: "Rahim",
        missingClothing: "blue shirt",
        foundClothing: "blue shirt",
        districtSame: true,
        districtNeighbour: null,
        missingAgeMin: 12,
        missingAgeMax: 14,
        foundAgeMin: 12,
        foundAgeMax: 14,
      }),
    );
    const c1 = withId("c", seed);
    const c2 = withId("a", seed);
    const c3 = withId("b", seed);
    const ranked = rankCandidates([c1, c2, c3]);
    expect(ranked.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
  it("respects the cap (≤ MATCH_CONFIG.candidatesPerQueueItem qualified) by default", () => {
    const seed = scorePair(
      base({
        missingName: "Rahim",
        foundName: "Rahim",
        missingClothing: "blue shirt",
        foundClothing: "blue shirt",
        districtSame: true,
        districtNeighbour: null,
        missingAgeMin: 12,
        missingAgeMax: 14,
        foundAgeMin: 12,
        foundAgeMax: 14,
      }),
    );
    const all = ["id-3", "id-1", "id-5", "id-2", "id-4", "id-6", "id-0"].map((id) =>
      withId(id, seed),
    );
    const ranked = rankCandidates(all);
    expect(ranked.length).toBe(MATCH_CONFIG.candidatesPerQueueItem);
    expect(ranked.length).toBe(5);
  });
  it("limit larger than the cap returns at most the cap", () => {
    const seed = scorePair(
      base({
        missingName: "Rahim",
        foundName: "Rahim",
        missingClothing: "blue shirt",
        foundClothing: "blue shirt",
        districtSame: true,
        districtNeighbour: null,
        missingAgeMin: 12,
        missingAgeMax: 14,
        foundAgeMin: 12,
        foundAgeMax: 14,
      }),
    );
    const all = Array.from({ length: 10 }, (_, i) =>
      withId(`id-${i}`, seed),
    );
    const ranked = rankCandidates(all, 100);
    expect(ranked.length).toBe(MATCH_CONFIG.candidatesPerQueueItem);
  });
  it("a NaN / negative / fractional limit falls back to the cap", () => {
    const seed = scorePair(
      base({
        missingName: "Rahim",
        foundName: "Rahim",
        missingClothing: "blue shirt",
        foundClothing: "blue shirt",
        districtSame: true,
        districtNeighbour: null,
        missingAgeMin: 12,
        missingAgeMax: 14,
        foundAgeMin: 12,
        foundAgeMax: 14,
      }),
    );
    const all = Array.from({ length: 10 }, (_, i) =>
      withId(`id-${i}`, seed),
    );
    expect(rankCandidates(all, Number.NaN).length).toBe(
      MATCH_CONFIG.candidatesPerQueueItem,
    );
    expect(rankCandidates(all, -1).length).toBe(
      MATCH_CONFIG.candidatesPerQueueItem,
    );
    expect(rankCandidates(all, 2.5).length).toBe(
      MATCH_CONFIG.candidatesPerQueueItem,
    );
    expect(rankCandidates(all, Number.POSITIVE_INFINITY).length).toBe(
      MATCH_CONFIG.candidatesPerQueueItem,
    );
  });
  it("an integer limit below the cap is honoured", () => {
    const seed = scorePair(
      base({
        missingName: "Rahim",
        foundName: "Rahim",
        missingClothing: "blue shirt",
        foundClothing: "blue shirt",
        districtSame: true,
        districtNeighbour: null,
        missingAgeMin: 12,
        missingAgeMax: 14,
        foundAgeMin: 12,
        foundAgeMax: 14,
      }),
    );
    const all = Array.from({ length: 7 }, (_, i) =>
      withId(`id-${i}`, seed),
    );
    expect(rankCandidates(all, 3).length).toBe(3);
  });
  it("excludes non-qualified candidates even when they are otherwise higher in input order", () => {
    // Orthogonal vectors (cosine 0) with a full soft-feature run → fails
    // the cosine floor and abstains. This is the "high" input-position
    // row that must be excluded.
    const high = withId(
      "high",
      scorePair(
        base({
          foundEmbedding: b,
          missingName: "Rahim",
          foundName: "Rahim",
          missingClothing: "blue shirt",
          foundClothing: "blue shirt",
          districtSame: true,
          districtNeighbour: null,
          missingAgeMin: 10,
          missingAgeMax: 10,
          foundAgeMin: 10,
          foundAgeMax: 10,
        }),
      ),
    );
    // Identical embeddings AND a full feature run → qualified.
    const winner = withId(
      "winner",
      scorePair(
        base({
          missingName: "Rahim",
          foundName: "Rahim",
          missingClothing: "blue shirt",
          foundClothing: "blue shirt",
          districtSame: true,
          districtNeighbour: null,
          missingAgeMin: 10,
          missingAgeMax: 10,
          foundAgeMin: 10,
          foundAgeMax: 10,
        }),
      ),
    );
    const ranked = rankCandidates([high, winner]);
    expect(ranked.map((r) => r.id)).toEqual(["winner"]);
  });
  it("is pure and stable: re-running yields identical order on equal input", () => {
    const seed = scorePair(
      base({ missingName: "Rahim", foundName: "Rahim" }),
    );
    const items = ["z", "y", "x", "w", "v"].map((id) => withId(id, seed));
    const a = rankCandidates(items);
    const b2 = rankCandidates(items);
    expect(a.map((r) => r.id)).toEqual(b2.map((r) => r.id));
  });
});

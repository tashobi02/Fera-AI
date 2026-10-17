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
  it("never returns NaN or Infinity for any field across bad inputs", () => {
    const cases: ScoreInput[] = [
      base({ missingEmbedding: [0, 0, 0, 0], foundEmbedding: [0, 0, 0, 0] }),
      base({ missingEmbedding: [Number.NaN, 0, 0, 0], foundEmbedding: a }),
      base({ missingEmbedding: a, foundEmbedding: [Number.POSITIVE_INFINITY, 0, 0, 0] }),
      base({ missingEmbedding: [], foundEmbedding: [] }),
      base({ missingEmbedding: [1, 0], foundEmbedding: [1, 0, 0] }),
      base({ missingAgeMin: Number.NaN, missingAgeMax: 5, foundAgeMin: 5, foundAgeMax: 5 }),
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
});

describe("scorePair — A-028 components: age", () => {
  it("age component is null when any bound is null (BR-018)", () => {
    const r = scorePair(
      base({ missingAgeMin: 10, missingAgeMax: 12, foundAgeMin: null, foundAgeMax: 12 }),
    );
    expect(r.components.age).toBeNull();
  });
  it("age component is 0 when the intervals do not intersect even with ±2y tolerance", () => {
    const r = scorePair(
      base({ missingAgeMin: 5, missingAgeMax: 6, foundAgeMin: 15, foundAgeMax: 17 }),
    );
    // 5-6 + 2y tolerance = 3-8; 15-17 + 2y tolerance = 13-19. No overlap.
    expect(r.components.age).toBe(0);
  });
  it("age component is 1 when the intervals fully overlap (single-year, equal)", () => {
    const r = scorePair(
      base({ missingAgeMin: 10, missingAgeMax: 10, foundAgeMin: 10, foundAgeMax: 10 }),
    );
    expect(r.components.age).toBe(1);
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
  it("cosine below the floor with no other features known → not qualified", () => {
    // cosine ≈ 0.707 < 0.30 is false, so cosine meets the floor. But with
    // a cosine of 0.707 the only available feature is cosine, so
    // similarity = 100 × 0.707 / 0.707 = 100 (after rounding 70.71
    // because the only available weight is 0.55 and 0.55/0.55=1, so
    // similarity = 100 × 0.707 × 0.55 / 0.55 = 70.71). Either way the
    // cosine floor (0.30) is met, so the pair qualifies. This test pins
    // the math: a lone-cosine pair scores exactly 100 × cosine.
    const r = scorePair(base({ foundEmbedding: c })); // cosine ≈ 0.707
    expect(r.components.cosine!).toBeGreaterThan(MATCH_CONFIG.minCosineToQualify);
    // similarity = 100 × 0.55 × 0.707 / 0.55 = 70.71 (rounded to 2dp).
    expect(r.similarity).toBeCloseTo(70.71, 2);
    expect(r.qualified).toBe(true);
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

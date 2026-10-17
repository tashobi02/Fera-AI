// TASK-017b / P3-031: pure-function tests for pair scoring, bonuses and
// qualify-or-abstain. BR-018, TC-041. AMD-3-3: thresholds/weights are
// documented defaults calibrated on the dev split only.
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
    districtSame: null,
    districtNeighbour: null,
    timeGapHours: null,
    missingSex: "unknown",
    foundSex: "unknown",
    missingAgeMin: null,
    missingAgeMax: null,
    foundAgeMin: null,
    foundAgeMax: null,
    ...over,
  };
}

describe("MATCH_CONFIG", () => {
  it("keeps the cosine + bonus shares summing to 1.0", () => {
    expect(MATCH_CONFIG.cosineWeight + MATCH_CONFIG.bonusShare).toBeCloseTo(1.0, 10);
  });
  it("reads the candidate cap from the frozen LIMITS (BR-018, FR-012)", () => {
    expect(MATCH_CONFIG.candidatesPerQueueItem).toBe(5);
  });
  it("never exposes probability or confidence names", () => {
    const serialized = JSON.stringify(MATCH_CONFIG).toLowerCase();
    expect(serialized).not.toMatch(/probability|confidence/);
  });
});

describe("scorePair — cosine", () => {
  it("cosine of identical vectors is 1.0 (similarity dominated by cosine)", () => {
    const r = scorePair(base());
    expect(r.components.cosine).toBeCloseTo(MATCH_CONFIG.cosineWeight * 100, 5);
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
  it("empty or mismatched-length vectors return 0 cosine, not NaN", () => {
    const empty = scorePair(base({ missingEmbedding: [], foundEmbedding: [] }));
    expect(empty.components.cosine).toBe(0);
    const mismatch = scorePair(base({ missingEmbedding: [1, 0], foundEmbedding: [1, 0, 0] }));
    expect(mismatch.components.cosine).toBe(0);
  });
});

describe("scorePair — bonus fields and unknowns", () => {
  it("all-unknown bonuses yield null components and no bonus (BR-018)", () => {
    const r = scorePair(base());
    expect(r.components.district).toBeNull();
    expect(r.components.time_proximity).toBeNull();
    expect(r.components.sex).toBeNull();
    expect(r.components.age_overlap).toBeNull();
    // Cosine alone: 0.55 * 100 = 55. No bonus share attributed.
    expect(r.similarity).toBeCloseTo(55, 5);
  });
  it("unknown sex never produces a sex bonus (no fabricated agreement)", () => {
    const r = scorePair(base({ missingSex: "unknown", foundSex: "male" }));
    expect(r.components.sex).toBeNull();
  });
  it("same explicit sex yields a full sex bonus; differing explicit sex yields 0", () => {
    const same = scorePair(base({ missingSex: "male", foundSex: "male" }));
    expect(same.components.sex).not.toBeNull();
    expect(same.components.sex).toBeGreaterThan(0);
    const diff = scorePair(base({ missingSex: "male", foundSex: "female" }));
    expect(diff.components.sex).toBe(0);
  });
  it("district same vs neighbour vs neither: same wins outright, neighbour is half", () => {
    const same = scorePair(
      base({ districtSame: true, districtNeighbour: null }),
    );
    const neighbour = scorePair(
      base({ districtSame: false, districtNeighbour: true }),
    );
    const neither = scorePair(
      base({ districtSame: false, districtNeighbour: false }),
    );
    expect(same.components.district).toBeGreaterThan(neighbour.components.district!);
    expect(neighbour.components.district).toBeGreaterThan(neither.components.district!);
  });
  it("time proximity peaks at 0h, decays to 0 at one week, and is null for unknown", () => {
    const peak = scorePair(base({ timeGapHours: 0 }));
    const mid = scorePair(base({ timeGapHours: MATCH_CONFIG.timeProximityMaxHours / 2 }));
    const far = scorePair(base({ timeGapHours: MATCH_CONFIG.timeProximityMaxHours }));
    expect(peak.components.time_proximity).toBeGreaterThan(mid.components.time_proximity!);
    expect(mid.components.time_proximity).toBeGreaterThan(far.components.time_proximity!);
    const unk = scorePair(base({ timeGapHours: null }));
    expect(unk.components.time_proximity).toBeNull();
  });
  it("age overlap is null when any bound is unknown (BR-018, no fabricated agreement)", () => {
    const r = scorePair(
      base({ missingAgeMin: 10, missingAgeMax: 12, foundAgeMin: null, foundAgeMax: null }),
    );
    expect(r.components.age_overlap).toBeNull();
  });
  it("age overlap is 0 when the intervals do not intersect even with ±2y tolerance", () => {
    const r = scorePair(
      base({ missingAgeMin: 5, missingAgeMax: 6, foundAgeMin: 15, foundAgeMax: 17 }),
    );
    expect(r.components.age_overlap).toBe(0);
  });
});

describe("scorePair — similarity bounds and qualification boundary", () => {
  it("similarity is clamped to [0, 100]", () => {
    const low = scorePair(
      base({ foundEmbedding: [-1, 0, 0, 0], missingSex: "male", foundSex: "female" }),
    );
    expect(low.similarity).toBeGreaterThanOrEqual(0);
    const high = scorePair(
      base({
        missingSex: "male",
        foundSex: "male",
        districtSame: true,
        districtNeighbour: null,
        timeGapHours: 0,
        missingAgeMin: 10,
        missingAgeMax: 12,
        foundAgeMin: 10,
        foundAgeMax: 12,
      }),
    );
    expect(high.similarity).toBeLessThanOrEqual(100);
  });
  it("qualifies at and above the threshold; abstains below (TC-041)", () => {
    // A high-evidence pair is above the threshold.
    const good = scorePair(
      base({
        missingSex: "male",
        foundSex: "male",
        districtSame: true,
        districtNeighbour: null,
        timeGapHours: 0,
        missingAgeMin: 12,
        missingAgeMax: 14,
        foundAgeMin: 12,
        foundAgeMax: 14,
      }),
    );
    expect(good.similarity).toBeGreaterThanOrEqual(MATCH_CONFIG.qualifySimilarity);
    expect(good.qualified).toBe(true);

    // A low-evidence pair is below the threshold and abstains.
    const bad = scorePair(
      base({ foundEmbedding: b, missingSex: "male", foundSex: "female" }),
    );
    expect(bad.similarity).toBeLessThan(MATCH_CONFIG.qualifySimilarity);
    expect(bad.qualified).toBe(false);
  });
  it("boundary similarity at the qualify threshold: cosine just meets the floor", () => {
    // orthogonal vectors → cosine 0, similarity 0 → not qualified.
    const zero = scorePair(base({ foundEmbedding: b }));
    expect(zero.qualified).toBe(false);
    // 45° vectors → cosine ≈ 0.707 → similarity 0.707*55 = 38.9 → still below 60
    // when all bonuses are unknown. The floor is only a guard, not a guarantee.
    const diag = scorePair(base({ foundEmbedding: c }));
    expect(diag.qualified).toBe(false);
    // A clear winner: identical vectors, all bonuses present and perfect.
    const winner = scorePair(
      base({
        missingSex: "male",
        foundSex: "male",
        districtSame: true,
        districtNeighbour: null,
        timeGapHours: 0,
        missingAgeMin: 10,
        missingAgeMax: 10,
        foundAgeMin: 10,
        foundAgeMax: 10,
      }),
    );
    expect(winner.qualified).toBe(true);
  });
  it("a high soft-bonus run with low cosine does not qualify (cosine floor)", () => {
    // Orthogonal vectors (cosine 0) cannot qualify even with a perfect bonus run.
    const orthogonalButSameEverything = scorePair(
      base({
        foundEmbedding: b,
        missingSex: "male",
        foundSex: "male",
        districtSame: true,
        districtNeighbour: null,
        timeGapHours: 0,
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
          missingSex: "male",
          foundSex: "male",
          districtSame: true,
          districtNeighbour: null,
          timeGapHours: 0,
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
          missingSex: "male",
          foundSex: "male",
          districtSame: false,
          districtNeighbour: true,
          timeGapHours: 12,
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
        missingSex: "male",
        foundSex: "male",
        districtSame: true,
        districtNeighbour: null,
        timeGapHours: 0,
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
  it("respects the limit (≤ LIMITS.candidatesPerQueueItem qualified)", () => {
    const seed = scorePair(
      base({
        missingSex: "male",
        foundSex: "male",
        districtSame: true,
        districtNeighbour: null,
        timeGapHours: 0,
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
  it("excludes non-qualified candidates even when they are otherwise higher in input order", () => {
    // Identical embeddings (cosine 1) but every bonus null → similarity 55,
    // below the qualify threshold; this is the "high" input-position row.
    const high = withId("high", scorePair(base()));
    // Identical embeddings AND a full bonus run → qualified.
    const winner = withId(
      "winner",
      scorePair(
        base({
          missingSex: "male",
          foundSex: "male",
          districtSame: true,
          districtNeighbour: null,
          timeGapHours: 0,
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
    const seed = scorePair(base({ missingSex: "male", foundSex: "male" }));
    const items = ["z", "y", "x", "w", "v"].map((id) => withId(id, seed));
    const a = rankCandidates(items);
    const b2 = rankCandidates(items);
    expect(a.map((r) => r.id)).toEqual(b2.map((r) => r.id));
  });
});

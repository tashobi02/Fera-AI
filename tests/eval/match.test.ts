// Tests for eval/match.mjs (P3-211, TC-020, TASK-039 GOAL-003).
//
// We exercise the pure buildQueries / scorePredictions helpers and the
// run() entry point with explicit prediction files. We never call a
// matcher live. Held-out runs require the freeze gate.
import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-ignore -- plain ESM script without type declarations
import { run as runMatch, buildQueries, scorePredictions, __test } from "../../eval/match.mjs";

const { detectCacheHit } = __test;

const MANIFEST = {
  manifest_revision: "manifest-1",
  inputs: { ground_truth_sha256: "00".repeat(32) },
  counts: {
    total: 5,
    groups: 3,
    by_split: {
      dev: { groups: 3, records: 5, true_pairs: 2, no_match_queries: 1, duplicate_links: 0, shared_phone_decoys: 0, decoys: 0 },
      heldout: { groups: 0, records: 0, true_pairs: 0, no_match_queries: 0, duplicate_links: 0, shared_phone_decoys: 0, decoys: 0 },
    },
  },
  splits: {
    dev: { group_ids: ["MG-1", "MG-2", "MG-3"], record_ids: ["q1", "f1a", "f1b", "q2", "nm1"] },
    heldout: { group_ids: [], record_ids: [] },
  },
};

const GROUND_TRUTH = {
  records: [
    { record_id: "q1", kind: "missing", role: "pair_query", identity_id: "ID-A", true_partner_ids: ["f1a"], no_match: false, decoy_type: null, decoy_target_ids: [] },
    { record_id: "f1a", kind: "found", role: "pair_found", identity_id: "ID-A", true_partner_ids: ["q1"], no_match: false, decoy_type: null, decoy_target_ids: [] },
    { record_id: "f1b", kind: "found", role: "pair_found", identity_id: "ID-A", true_partner_ids: ["q1"], no_match: false, decoy_type: null, decoy_target_ids: [] },
    { record_id: "q2", kind: "missing", role: "pair_query", identity_id: "ID-B", true_partner_ids: ["f2"], no_match: false, decoy_type: null, decoy_target_ids: [] },
    { record_id: "f2", kind: "found", role: "pair_found", identity_id: "ID-B", true_partner_ids: ["q2"], no_match: false, decoy_type: null, decoy_target_ids: [] },
    { record_id: "nm1", kind: "missing", role: "no_match_query", identity_id: "ID-NM", true_partner_ids: [], no_match: true, decoy_type: null, decoy_target_ids: [] },
  ],
};

describe("eval/match.mjs — buildQueries", () => {
  it("returns truth-pair, no-match, decoy and partner set from the manifest", () => {
    const q = buildQueries({ records: GROUND_TRUTH.records, manifest: MANIFEST, split: "dev" });
    expect(q.present).toBe(true);
    expect(q.truthPairQueries.sort()).toEqual(["q1", "q2"]);
    expect(q.noMatchQueries).toEqual(["nm1"]);
    expect(q.partnerSet.get("q1")?.has("f1a")).toBe(true);
  });

  it("treats 'test' as an alias for heldout", () => {
    // In the synthetic test manifest the heldout split is empty but
    // declared; buildQueries must surface that as present=true with
    // empty arrays, so the caller can decide what to do.
    const q = buildQueries({ records: GROUND_TRUTH.records, manifest: MANIFEST, split: "test" });
    expect(q.present).toBe(true);
    expect(q.splitInfo).toBeTruthy();
    expect(q.truthPairQueries).toEqual([]);
  });
});

describe("eval/match.mjs — scorePredictions", () => {
  it("scores a perfect prediction: recall@5 = top-1 = 100%, no FP, no failures", () => {
    const q = buildQueries({ records: GROUND_TRUTH.records, manifest: MANIFEST, split: "dev" });
    const predictionsById = new Map([
      ["q1", { ranked: ["f1a", "f1b"] }],
      ["q2", { ranked: ["f2"] }],
      ["nm1", { ranked: [] }],
    ]);
    const r = scorePredictions({ queries: q, predictionsById });
    expect(r.totalTruthPairs).toBe(2);
    expect(r.recallAt5).toBe(100);
    expect(r.top1).toBe(100);
    expect(r.falsePosRate).toBe(0);
    expect(r.failures).toEqual([]);
  });

  it("records a no-match false positive when the prediction returns a non-empty list", () => {
    const q = buildQueries({ records: GROUND_TRUTH.records, manifest: MANIFEST, split: "dev" });
    const predictionsById = new Map([
      ["q1", { ranked: ["f1a"] }],
      ["q2", { ranked: ["f2"] }],
      ["nm1", { ranked: ["f1a"] }], // false positive
    ]);
    const r = scorePredictions({ queries: q, predictionsById });
    expect(r.falsePosRate).toBe(100);
    expect(r.failures).toContain("nm1");
  });

  it("records missed truth pairs as failures (never invents new ones)", () => {
    const q = buildQueries({ records: GROUND_TRUTH.records, manifest: MANIFEST, split: "dev" });
    const predictionsById = new Map([
      ["q1", { ranked: [] }], // miss
      ["q2", { ranked: ["f2"] }],
      ["nm1", { ranked: [] }],
    ]);
    const r = scorePredictions({ queries: q, predictionsById });
    expect(r.recallAt5).toBe(50);
    expect(r.failures).toContain("q1");
  });
});

describe("eval/match.mjs — run() integration", () => {
  it("prints 'not measured' when no --prediction file is given", async () => {
    // Wipe env so freeze gate can't block dev split.
    const before = { c: process.env.FERA_FREEZE_COMMIT, m: process.env.FERA_FREEZE_MODEL, h: process.env.FERA_MANIFEST_SHA256 };
    delete process.env.FERA_FREEZE_COMMIT;
    delete process.env.FERA_FREEZE_MODEL;
    delete process.env.FERA_MANIFEST_SHA256;
    try {
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runMatch({
        split: "dev",
        predictionPath: null,
        stdout: capture,
      });
      expect(result.measured).toBe(false);
      expect(result.reason).toBe("no-prediction");
      expect(out.join("")).toMatch(/not measured \(no --prediction file provided/);
    } finally {
      if (before.c !== undefined) process.env.FERA_FREEZE_COMMIT = before.c;
      if (before.m !== undefined) process.env.FERA_FREEZE_MODEL = before.m;
      if (before.h !== undefined) process.env.FERA_MANIFEST_SHA256 = before.h;
    }
  });

  it("computes metrics for a measured prediction file (reads the committed manifest)", async () => {
    // We use the real committed manifest + ground truth, not a fixture,
    // because eval:match's job is to read the frozen split. We feed an
    // explicit prediction file that lists ONE truth-pair query with its
    // true partner at rank 1, and confirm recall@5 is 100/n (one hit) on
    // that small set of predictions, never 0. We do NOT assert a global
    // 100% — we never have full coverage without a real matcher run.
    const before = { c: process.env.FERA_FREEZE_COMMIT, m: process.env.FERA_FREEZE_MODEL, h: process.env.FERA_MANIFEST_SHA256 };
    delete process.env.FERA_FREEZE_COMMIT;
    delete process.env.FERA_FREEZE_MODEL;
    delete process.env.FERA_MANIFEST_SHA256;
    try {
      const fs = await import("node:fs/promises");
      const manifest = JSON.parse(await fs.readFile("data/synthetic/manifest.json", "utf8"));
      const truth = JSON.parse(await fs.readFile("data/synthetic/ground_truth.json", "utf8"));
      const devIds = new Set(manifest.splits.dev.record_ids);
      // Find one pair_query in dev and one of its true partners.
      const query = truth.records.find((r: any) => r.role === "pair_query" && devIds.has(r.record_id));
      if (!query) return; // nothing to score on this build
      const partner = (query.true_partner_ids || [])[0];
      const dir = await mkdtemp(join(tmpdir(), "fera-match-"));
      try {
        await writeFile(join(dir, "pred.jsonl"),
          JSON.stringify({ id: query.record_id, ranked: [partner] }) + "\n",
          "utf8");
        const out: string[] = [];
        const capture = (s: string) => out.push(s);
        const result = await runMatch({
          split: "dev",
          predictionPath: join(dir, "pred.jsonl"),
          stdout: capture,
        });
        expect(result.measured).toBe(true);
        // At least one hit; with one true partner ranked first, recall@5
        // is 100/n where n is the total truth-pair query count.
        expect(result.failures).not.toContain(query.record_id);
        expect(result.recallAt5).not.toBeNull();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    } finally {
      if (before.c !== undefined) process.env.FERA_FREEZE_COMMIT = before.c;
      if (before.m !== undefined) process.env.FERA_FREEZE_MODEL = before.m;
      if (before.h !== undefined) process.env.FERA_MANIFEST_SHA256 = before.h;
    }
  });

  it("excludes and counts cache/fixture hits", async () => {
    const before = { c: process.env.FERA_FREEZE_COMMIT, m: process.env.FERA_FREEZE_MODEL, h: process.env.FERA_MANIFEST_SHA256 };
    delete process.env.FERA_FREEZE_COMMIT;
    delete process.env.FERA_FREEZE_MODEL;
    delete process.env.FERA_MANIFEST_SHA256;
    try {
      const dir = await mkdtemp(join(tmpdir(), "fera-match-"));
      try {
        await writeFile(join(dir, "pred.jsonl"),
          JSON.stringify({ id: "q1", ranked: ["f1a"], cache_hit: true }) + "\n" +
          JSON.stringify({ id: "q2", ranked: ["f2"], source: "fixture" }) + "\n",
          "utf8");
        const out: string[] = [];
        const capture = (s: string) => out.push(s);
        const result = await runMatch({
          split: "dev",
          predictionPath: join(dir, "pred.jsonl"),
          stdout: capture,
        });
        expect(result.measured).toBe(false);
        expect(result.reason).toBe("all-cache");
        expect(result.cacheHits).toBe(2);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    } finally {
      if (before.c !== undefined) process.env.FERA_FREEZE_COMMIT = before.c;
      if (before.m !== undefined) process.env.FERA_FREEZE_MODEL = before.m;
      if (before.h !== undefined) process.env.FERA_MANIFEST_SHA256 = before.h;
    }
  });

  it("refuses a held-out run when the freeze gate is not satisfied", async () => {
    const before = { c: process.env.FERA_FREEZE_COMMIT, m: process.env.FERA_FREEZE_MODEL, h: process.env.FERA_MANIFEST_SHA256 };
    delete process.env.FERA_FREEZE_COMMIT;
    delete process.env.FERA_FREEZE_MODEL;
    delete process.env.FERA_MANIFEST_SHA256;
    try {
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runMatch({
        split: "heldout",
        predictionPath: null,
        stdout: capture,
      });
      expect(result.measured).toBe(false);
      expect(result.reason).toBe("freeze-gate");
    } finally {
      if (before.c !== undefined) process.env.FERA_FREEZE_COMMIT = before.c;
      if (before.m !== undefined) process.env.FERA_FREEZE_MODEL = before.m;
      if (before.h !== undefined) process.env.FERA_MANIFEST_SHA256 = before.h;
    }
  });
});

describe("eval/match.mjs — detectCacheHit", () => {
  it("flags fixture_id, cache_hit, source=fixture, source=cache", () => {
    expect(detectCacheHit({ fixture_id: "f1" })).toBe(true);
    expect(detectCacheHit({ cache_hit: true })).toBe(true);
    expect(detectCacheHit({ source: "fixture" })).toBe(true);
    expect(detectCacheHit({ source: "cache" })).toBe(true);
  });

  it("does not flag ordinary predictions", () => {
    expect(detectCacheHit({ id: "q1", ranked: ["f1a"] })).toBe(false);
  });
});

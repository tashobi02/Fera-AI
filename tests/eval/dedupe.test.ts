// Tests for eval/dedupe.mjs (P3-211, TC-020, TASK-039 GOAL-004).
import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-ignore -- plain ESM script without type declarations
import { run as runDedupe, buildPredictedPositives, scoreDedupe, __test } from "../../eval/dedupe.mjs";

const { detectCacheHit } = __test;

const MANIFEST = {
  manifest_revision: "manifest-1",
  inputs: { ground_truth_sha256: "00".repeat(32) },
  counts: {
    total: 4,
    groups: 2,
    by_split: {
      dev: { groups: 2, records: 4, true_pairs: 0, no_match_queries: 0, duplicate_links: 2, shared_phone_decoys: 0, decoys: 0 },
      heldout: { groups: 0, records: 0, true_pairs: 0, no_match_queries: 0, duplicate_links: 0, shared_phone_decoys: 0, decoys: 0 },
    },
  },
  splits: {
    dev: { group_ids: ["MG-1", "MG-2"], record_ids: ["a1", "a2", "b1", "b2"] },
    heldout: { group_ids: [], record_ids: [] },
  },
};

const GROUND_TRUTH = {
  records: [
    { record_id: "a1", kind: "missing", role: "dup_missing", identity_id: "ID-A", duplicate_group_id: "DUP-1", true_partner_ids: [], no_match: false, decoy_type: null, decoy_target_ids: [] },
    { record_id: "a2", kind: "found", role: "dup_found", identity_id: "ID-A", duplicate_group_id: "DUP-1", true_partner_ids: [], no_match: false, decoy_type: null, decoy_target_ids: [] },
    { record_id: "b1", kind: "missing", role: "dup_missing", identity_id: "ID-B", duplicate_group_id: "DUP-2", true_partner_ids: [], no_match: false, decoy_type: null, decoy_target_ids: [] },
    { record_id: "b2", kind: "found", role: "dup_found", identity_id: "ID-B", duplicate_group_id: "DUP-2", true_partner_ids: [], no_match: false, decoy_type: null, decoy_target_ids: [] },
  ],
};

describe("eval/dedupe.mjs — buildPredictedPositives + scoreDedupe", () => {
  it("counts TP/FP/FN correctly for an honest prediction", () => {
    const truePairs = [["a1", "a2"], ["b1", "b2"]];
    const predictions = [
      { id: "a1", links: [{ a: "a1", b: "a2", rule: "profile" }] }, // TP
      { id: "b1", links: [{ a: "b1", b: "b2", rule: "profile" }] }, // TP
      { id: "x", links: [{ a: "x", b: "y", rule: "profile" }] }, // FP (no label)
    ];
    const predicted = buildPredictedPositives(predictions);
    const r = scoreDedupe({ truePairs, predicted });
    expect(r.tp).toBe(2);
    expect(r.fp).toBe(1);
    expect(r.fn).toBe(0);
    expect(r.precision).toBe((2 / 3) * 100);
    expect(r.recall).toBe(100);
  });

  it("counts FN (misses) for pairs the prediction did not flag", () => {
    const truePairs = [["a1", "a2"], ["b1", "b2"]];
    const predictions = [
      { id: "a1", links: [{ a: "a1", b: "a2", rule: "profile" }] }, // only 1 TP
    ];
    const predicted = buildPredictedPositives(predictions);
    const r = scoreDedupe({ truePairs, predicted });
    expect(r.tp).toBe(1);
    expect(r.fn).toBe(1);
    expect(r.fp).toBe(0);
  });

  it("normalises pair order: {b,a} and {a,b} match", () => {
    const truePairs = [["a1", "a2"]];
    const predictions = [{ id: "x", links: [{ a: "a2", b: "a1", rule: "profile" }] }];
    const predicted = buildPredictedPositives(predictions);
    const r = scoreDedupe({ truePairs, predicted });
    expect(r.tp).toBe(1);
  });
});

describe("eval/dedupe.mjs — run() integration", () => {
  it("prints 'not measured' when no --prediction file is given", async () => {
    const before = { c: process.env.FERA_FREEZE_COMMIT, m: process.env.FERA_FREEZE_MODEL, h: process.env.FERA_MANIFEST_SHA256 };
    delete process.env.FERA_FREEZE_COMMIT;
    delete process.env.FERA_FREEZE_MODEL;
    delete process.env.FERA_MANIFEST_SHA256;
    try {
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runDedupe({
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
    const before = { c: process.env.FERA_FREEZE_COMMIT, m: process.env.FERA_FREEZE_MODEL, h: process.env.FERA_MANIFEST_SHA256 };
    delete process.env.FERA_FREEZE_COMMIT;
    delete process.env.FERA_FREEZE_MODEL;
    delete process.env.FERA_MANIFEST_SHA256;
    try {
      const fs = await import("node:fs/promises");
      const truth = JSON.parse(await fs.readFile("data/synthetic/ground_truth.json", "utf8"));
      const manifest = JSON.parse(await fs.readFile("data/synthetic/manifest.json", "utf8"));
      const devIds = new Set(manifest.splits.dev.record_ids);
      // Find one duplicate_group_id with at least 2 members in dev, and feed
      // a prediction that flags that pair. We do not assert a global
      // success — we never have a full detector run here.
      const byGroup = new Map<string, string[]>();
      for (const r of truth.records) {
        if (r.duplicate_group_id && devIds.has(r.record_id)) {
          if (!byGroup.has(r.duplicate_group_id)) byGroup.set(r.duplicate_group_id, []);
          byGroup.get(r.duplicate_group_id)!.push(r.record_id);
        }
      }
      const pair = [...byGroup.values()].find((v) => v.length >= 2);
      if (!pair) return; // nothing to score on this build
      const dir = await mkdtemp(join(tmpdir(), "fera-dedupe-"));
      try {
        await writeFile(join(dir, "pred.jsonl"),
          JSON.stringify({ id: pair[0], links: [{ a: pair[0], b: pair[1], rule: "profile" }] }) + "\n",
          "utf8");
        const out: string[] = [];
        const capture = (s: string) => out.push(s);
        const result = await runDedupe({
          split: "dev",
          predictionPath: join(dir, "pred.jsonl"),
          stdout: capture,
        });
        expect(result.measured).toBe(true);
        expect(result.truthSize).toBeGreaterThanOrEqual(1);
        expect(result.tp).toBeGreaterThanOrEqual(1);
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
      const dir = await mkdtemp(join(tmpdir(), "fera-dedupe-"));
      try {
        await writeFile(join(dir, "pred.jsonl"),
          JSON.stringify({ id: "a1", links: [{ a: "a1", b: "a2", rule: "profile" }], cache_hit: true }) + "\n",
          "utf8");
        const out: string[] = [];
        const capture = (s: string) => out.push(s);
        const result = await runDedupe({
          split: "dev",
          predictionPath: join(dir, "pred.jsonl"),
          stdout: capture,
        });
        expect(result.measured).toBe(false);
        expect(result.reason).toBe("all-cache");
        expect(result.cacheHits).toBe(1);
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
      const result = await runDedupe({
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

describe("eval/dedupe.mjs — detectCacheHit", () => {
  it("flags fixture_id, cache_hit, source=fixture, source=cache", () => {
    expect(detectCacheHit({ fixture_id: "f1" })).toBe(true);
    expect(detectCacheHit({ cache_hit: true })).toBe(true);
    expect(detectCacheHit({ source: "fixture" })).toBe(true);
    expect(detectCacheHit({ source: "cache" })).toBe(true);
  });
});

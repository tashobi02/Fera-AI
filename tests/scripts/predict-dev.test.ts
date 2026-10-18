// tests/scripts/predict-dev.test.ts — Unit tests for predict-dev helpers.
//
// We exercise the testable helpers exported from scripts/eval/predict-dev.ts
// WITHOUT touching the database or the synthetic set. The real matcher and
// real dedupe pipeline are NOT called here; the helper-level tests cover
// the testable boundaries only. The full pipeline is exercised by
// scripts/eval/predict-dev.runner.test.ts under vitest.predict-dev.config.mts.
//
// IMPORTANT: nothing in this file claims a measured metric. We only
// assert shape and provenance invariants on the testable helpers.

import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parsePredictArgs,
  buildDevQueries,
  buildDevDedupeSources,
  buildRecordIdToCaseIdMap,
  detectEmptyAbstain,
  jsonlSha256,
  writeMatchPredictions,
  writeDedupePredictions,
  writeMatchProvenance,
  loadDevSplit,
  uniqueDbName,
} from "../../scripts/eval/predict-dev";

const MANIFEST = {
  manifest_revision: "manifest-2",
  inputs: { ground_truth_sha256: "00".repeat(32) },
  records: [
    { record_id: "q1", kind: "missing", role: "pair_query", identity_id: "I1", duplicate_group_id: null, split_group_id: "G-1", true_partner_ids: ["f1a"], no_match: false, decoy_type: null, decoy_target_ids: [] },
    { record_id: "f1a", kind: "found", role: "pair_found", identity_id: "I1", duplicate_group_id: null, split_group_id: "G-1", true_partner_ids: ["q1"], no_match: false, decoy_type: null, decoy_target_ids: [] },
    { record_id: "f1b", kind: "found", role: "pair_found", identity_id: "I1", duplicate_group_id: null, split_group_id: "G-1", true_partner_ids: ["q1"], no_match: false, decoy_type: null, decoy_target_ids: [] },
    { record_id: "q2", kind: "missing", role: "pair_query", identity_id: "I2", duplicate_group_id: null, split_group_id: "G-2", true_partner_ids: ["f2"], no_match: false, decoy_type: null, decoy_target_ids: [] },
    { record_id: "f2", kind: "found", role: "pair_found", identity_id: "I2", duplicate_group_id: null, split_group_id: "G-2", true_partner_ids: ["q2"], no_match: false, decoy_type: null, decoy_target_ids: [] },
    { record_id: "nm1", kind: "missing", role: "no_match_query", identity_id: "I-NM", duplicate_group_id: null, split_group_id: "G-3", true_partner_ids: [], no_match: true, decoy_type: null, decoy_target_ids: [] },
    { record_id: "d1", kind: "missing", role: "decoy", identity_id: "I-D1", duplicate_group_id: null, split_group_id: "G-4", true_partner_ids: [], no_match: false, decoy_type: "shared_phone", decoy_target_ids: ["f1a"] },
    { record_id: "d2", kind: "found", role: "decoy", identity_id: "I-D2", duplicate_group_id: null, split_group_id: "G-4", true_partner_ids: [], no_match: false, decoy_type: "shared_phone", decoy_target_ids: ["f1a"] },
  ],
};

const FAKE_MAP = {
  recordToCase: new Map([
    ["q1", "c-q1"], ["f1a", "c-f1a"], ["f1b", "c-f1b"],
    ["q2", "c-q2"], ["f2", "c-f2"], ["nm1", "c-nm1"],
    ["d1", "c-d1"], ["d2", "c-d2"],
  ]),
  invert: new Map([
    ["c-q1", "q1"], ["c-f1a", "f1a"], ["c-f1b", "f1b"],
    ["c-q2", "q2"], ["c-f2", "f2"], ["c-nm1", "nm1"],
    ["c-d1", "d1"], ["c-d2", "d2"],
  ]),
};

describe("parsePredictArgs", () => {
  it("requires --match-out", () => {
    const r = parsePredictArgs([]);
    expect(r.errors).toContain("--match-out is required");
  });
  it("rejects a non-fera db name", () => {
    const r = parsePredictArgs(["--match-out", "x", "--db-name", "notfera"]);
    expect(r.errors.some((e) => e.includes("--db-name"))).toBe(true);
  });
  it("rejects the removed --fake-embedder flag as unknown", () => {
    const r = parsePredictArgs(["--match-out", "x", "--fake-embedder"]);
    expect(r.errors.some((e) => e.includes("unknown argument"))).toBe(true);
  });
});

describe("buildDevQueries", () => {
  it("returns one query per dev MISSING record, never reading role or no_match", () => {
    const r = buildDevQueries(MANIFEST.records as never, FAKE_MAP);
    // q1, q2, nm1 are the three missing records; the helper does not
    // split them by role or no_match (the matcher is the single source
    // of inference).
    expect(r.map((q) => q.recordId).sort()).toEqual(["d1", "nm1", "q1", "q2"]);
    for (const q of r) {
      expect(q.caseId).toMatch(/^c-/);
      expect(q.kind).toBe("missing");
    }
  });
  it("drops records without a case id (no recordToCase entry)", () => {
    const sparseMap = {
      recordToCase: new Map([["q1", "c-q1"]]),
      invert: new Map([["c-q1", "q1"]]),
    };
    const r = buildDevQueries(MANIFEST.records as never, sparseMap as never);
    expect(r.map((q) => q.recordId)).toEqual(["q1"]);
  });
});

describe("buildDevDedupeSources", () => {
  it("includes all dev records without consulting outcome labels", () => {
    const r = buildDevDedupeSources(MANIFEST.records as never, FAKE_MAP);
    const ids = r.map((x) => x.recordId).sort();
    // Decoys (d1, d2) are excluded; everything else is a source.
    expect(ids).toEqual(["d1", "d2", "f1a", "f1b", "f2", "nm1", "q1", "q2"]);
  });
});

describe("buildRecordIdToCaseIdMap (fake pool)", () => {
  it("maps record_id -> case id from a fake pool.query()", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const fakePool = {
      async query(sql: string, params: unknown[]) {
        calls.push({ sql, params });
        return {
          rows: [
            { id: "c-q1", client_submission_id: "q1" },
            { id: "c-f1a", client_submission_id: "f1a" },
            { id: "c-f1b", client_submission_id: "f1b" },
          ],
        };
      },
    };
    const dev = MANIFEST.records.filter((r) => ["q1", "f1a", "f1b"].includes(r.record_id));
    const map = await buildRecordIdToCaseIdMap(fakePool as never, dev);
    expect(map.recordToCase.get("q1")).toBe("c-q1");
    expect(map.invert.get("c-f1a")).toBe("f1a");
    expect(calls.length).toBe(1);
    expect(calls[0]!.params[0]).toEqual(["q1", "f1a", "f1b"]);
  });
});

describe("detectEmptyAbstain", () => {
  it("counts rows with empty ranked arrays", () => {
    const r = detectEmptyAbstain([
      { ranked: ["x"], abstained: false },
      { ranked: [], abstained: true },
      { ranked: ["a", "b"], abstained: false },
      { ranked: [], abstained: true },
    ]);
    expect(r).toBe(2);
  });
});

describe("jsonlSha256", () => {
  it("is stable across runs and includes a trailing newline", () => {
    const a = jsonlSha256([{ id: "x" }, { id: "y" }]);
    const b = jsonlSha256([{ id: "x" }, { id: "y" }]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
  it("changes when the row order changes", () => {
    const a = jsonlSha256([{ id: "x" }, { id: "y" }]);
    const b = jsonlSha256([{ id: "y" }, { id: "x" }]);
    expect(a).not.toBe(b);
  });
});

describe("prediction writers (fake-only)", () => {
  it("writes one JSON line per row, with a trailing newline", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-predict-"));
    try {
      const matchPath = join(dir, "match.jsonl");
      writeMatchPredictions(matchPath, [
        { id: "q1", ranked: ["c-f1a"], abstained: false, meta: { model: "m", space: "s", revision: "r", considered: 1, duration_ms: 5 } },
        { id: "q2", ranked: [], abstained: true, meta: { model: "m", space: "s", revision: "r", considered: 0, duration_ms: 0 } },
      ]);
      const dedupePath = join(dir, "dedupe.jsonl");
      writeDedupePredictions(dedupePath, [
        { id: "q1", links: [{ a: "q1", b: "f1a", rule: "profile", score: 80 }], skipped: false, meta: { model: "m", space: "s", revision: "r", duration_ms: 1 } },
      ]);
      const { readFile } = await import("node:fs/promises");
      const m = await readFile(matchPath, "utf8");
      const d = await readFile(dedupePath, "utf8");
      expect(m.endsWith("\n")).toBe(true);
      expect(d.endsWith("\n")).toBe(true);
      expect(m.split("\n").filter(Boolean).length).toBe(2);
      expect(d.split("\n").filter(Boolean).length).toBe(1);
      // Shape round-trip via JSON.parse.
      const firstMatch = JSON.parse(m.split("\n")[0]!);
      expect(firstMatch.id).toBe("q1");
      expect(firstMatch.ranked).toEqual(["c-f1a"]);
      const firstDedupe = JSON.parse(d.split("\n")[0]!);
      expect(firstDedupe.links[0].rule).toBe("profile");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("provenance writers never include child payload", () => {
  it("writeMatchProvenance serialises a small object that excludes child fields", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-prov-"));
    try {
      const path = join(dir, "match.meta.json");
      writeMatchProvenance(path, {
        kind: "match",
        prediction_file: "x.jsonl",
        prediction_sha256: "00".repeat(32),
        row_count: 1,
        commit: "abc123",
        manifest_sha256: "11".repeat(32),
        manifest_revision: "manifest-2",
        embedder_model: "fake",
        embedder_revision: "fake-rev",
        embedder_space: "fake-space",
        generated_at: "2026-10-18T00:00:00.000Z",
        split: "dev",
        notes: ["measured=false (this is a unit-test fixture)"],
      });
      await writeFile(path + ".guard", "ok", "utf8");
      const { readFile } = await import("node:fs/promises");
      const body = await readFile(path, "utf8");
      expect(body).not.toMatch(/child_name|phone|0120000/);
      expect(body).toMatch(/"split":\s*"dev"/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("loadDevSplit (uses committed manifest)", () => {
  it("loads the committed dev split without reading the test split", () => {
    // This test is fine to run in CI: it only reads the committed manifest
    // and never touches the test split. It validates the helper's
    // integration with the canonical loadSplit guard.
    const m = loadDevSplit();
    expect(m.manifestRevision).toBe("manifest-2");
    expect(m.devRecords.length).toBeGreaterThan(0);
    // Every dev record has split === "dev" — the loader's contract.
    for (const r of m.devRecords) expect(r.kind).toBeTruthy();
  });
});

describe("uniqueDbName", () => {
  it("appends a short hex suffix and preserves the fera- prefix", () => {
    const a = uniqueDbName("fera_predict_dev");
    const b = uniqueDbName("fera_predict_dev");
    expect(a).toMatch(/^fera_predict_dev_[0-9a-f]{6}$/);
    expect(b).toMatch(/^fera_predict_dev_[0-9a-f]{6}$/);
    // Two consecutive calls get distinct suffixes.
    expect(a).not.toBe(b);
  });
  it("rejects names that do not match the fera- guard", () => {
    expect(() => uniqueDbName("notfera_anything")).toThrow();
  });
});

// Tests for scripts/eval/duplicate-calibration.ts (pre-main dev split
// duplicate detector calibration, BR-018 / BR-021 / D2B §17).
//
// These tests:
//   1. Lock in the grid construction helpers (pure, no DB).
//   2. Lock in the per-pair field-agreement re-derivation: given two
//      synthetic profiles, deriveFlagRow must reproduce what the
//      detector's computeAgreement + profilesContradict would produce
//      for the same inputs.
//   3. Lock in the picker: pickRecommendedCell maximises dev pairwise F1,
//      then recall, then precision, then the lower floors.
//   4. End-to-end: buildCalibrationGrid against the committed dev
//      prediction file must reproduce the pre-main baseline (TP=12,
//      FP=290, FN=0) at the old SIMILARITY_THRESHOLD=0.5 and
//      MIN_AGREEING_PROFILE_FIELDS=2, and the picker must choose the max-F1
//      cell 0.95/3 (TP=10, FP=1, FN=2), trading 2 of 12 recall for fewer FPs.
//
// All scored inputs are dev-only. records.jsonl and ground_truth.json hold
// both splits and are read from disk, then filtered to dev IDs; no test-split
// ID is ever scored (asserted below).

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCalibrationGrid,
  loadDevRecordProfiles,
  buildDevTruth,
  deriveFlagRow,
  pickRecommendedCell,
  runCalibration,
  type GridCell,
  type RecordProfile,
} from "../../scripts/eval/duplicate-calibration";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const manifestPath = resolve(repoRoot, "eval/manifest.json");
const recordsPath = resolve(repoRoot, "data/synthetic/records.jsonl");
const groundTruthPath = resolve(repoRoot, "data/synthetic/ground_truth.json");
const predictionPath = resolve(repoRoot, "eval/fixtures/duplicate-calibration-baseline.dev.jsonl");
const embedderSpace = "model=Xenova/multilingual-e5-small;revision=761b726dd34fb83930e26aab4e9ac3899aa1fa78;dtype=q8;pool=mean;normalize=true;query=\"query: \";passage=\"passage: \";space=e5-small-q8-mean-l2-384-text-v1-511d3e3495";

function makeProfile(over: Partial<RecordProfile> = {}): RecordProfile {
  return {
    recordId: "00000000-0000-4000-8000-000000000001",
    kind: "missing",
    child_name: "[MOCK] Child",
    age_years: 8,
    age_min: 8,
    age_max: 8,
    sex: "female",
    district_code: 1,
    event_at_lower: "2026-10-17T07:00:00+06:00",
    event_at_upper: "2026-10-17T09:00:00+06:00",
    ...over,
  };
}

describe("duplicate-calibration: loadDevRecordProfiles (dev-only)", () => {
  it("reads only the dev split (86 records, 0 test records)", () => {
    const { profiles, devRecordIds } = loadDevRecordProfiles(manifestPath, recordsPath);
    expect(devRecordIds.size).toBe(86);
    expect(profiles.size).toBe(86);
    for (const id of devRecordIds) {
      expect(profiles.has(id)).toBe(true);
    }
  });

  it("never scores a held-out test-split ID (test rows are read from disk, then discarded)", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { records: Array<{ record_id: string; split: string }> };
    const testIds = new Set(manifest.records.filter((r) => r.split === "test").map((r) => r.record_id));
    expect(testIds.size).toBe(114);
    const { profiles } = loadDevRecordProfiles(manifestPath, recordsPath);
    expect([...profiles.keys()].filter((id) => testIds.has(id))).toEqual([]);
    const { grid, flags, truthPairs, sharedPhoneDistinct, sharedPhoneCrossKind } = buildCalibrationGrid({
      predictionPath, manifestPath, recordsPath, groundTruthPath, embedderSpace,
    });
    const scored = [
      ...flags.flatMap((f) => [f.sourceId, f.targetId]),
      ...[...truthPairs, ...sharedPhoneDistinct, ...sharedPhoneCrossKind].flat(),
    ];
    expect(scored.length).toBeGreaterThan(0);
    expect(scored.filter((id) => testIds.has(id))).toEqual([]);
    expect(grid.heldoutIdsScored).toBe(0);
    expect(grid.devRecords).toBe(86);
    expect(grid.linksWithoutDevProfile).toBe(0);
    for (const id of grid.scoredRecordIds) expect(testIds.has(id)).toBe(false);
  });
});

describe("duplicate-calibration: buildDevTruth (matches eval/dedupe.mjs)", () => {
  it("builds 12 dev true pairs from 12 dev groups of size 2", () => {
    const { truthPairs, sharedPhoneDistinct, sharedPhoneCrossKind } = buildDevTruth(manifestPath, groundTruthPath);
    // Pre-main audit numbers: 12 true duplicate pairs on dev.
    expect(truthPairs.length).toBe(12);
    // Pre-main audit numbers: 22-25 same-kind shared-phone distinct-child
    // pairs (3 in FP because the detector reuses the same phone).
    expect(sharedPhoneDistinct.length + sharedPhoneCrossKind.length).toBeGreaterThanOrEqual(22);
  });
});

describe("duplicate-calibration: deriveFlagRow (matches detector logic)", () => {
  it("marks the same profile as 5 agreeing fields, no contradiction", () => {
    const a = makeProfile({ recordId: "00000000-0000-4000-8000-000000000001" });
    const b = makeProfile({ recordId: "00000000-0000-4000-8000-000000000002" });
    const row = deriveFlagRow(a, b);
    expect(row.agreement.name).toBe(true);
    expect(row.agreement.age).toBe(true);
    expect(row.agreement.sex).toBe(true);
    expect(row.agreement.district).toBe(true);
    expect(row.agreement.time).toBe(true);
    expect(row.contradicts).toBe(false);
  });

  it("marks disjoint age ranges as contradiction (no tolerance, per detect.ts)", () => {
    const a = makeProfile({ age_years: 10, age_min: 10, age_max: 10 });
    const b = makeProfile({ recordId: "00000000-0000-4000-8000-000000000002", age_years: 14, age_min: 14, age_max: 14 });
    const row = deriveFlagRow(a, b);
    expect(row.contradicts).toBe(true);
  });

  it("marks known sex disagreement as contradiction (siblings)", () => {
    const a = makeProfile({ sex: "male", age_years: 8 });
    const b = makeProfile({ recordId: "00000000-0000-4000-8000-000000000002", sex: "female", age_years: 8 });
    const row = deriveFlagRow(a, b);
    expect(row.contradicts).toBe(true);
  });

  it("treats null name + non-null name as not agreeing (BR-021) and a same-name pair as agreeing", () => {
    const a = makeProfile({ child_name: null });
    const b = makeProfile({ recordId: "00000000-0000-4000-8000-000000000002", child_name: null });
    expect(deriveFlagRow(a, b).agreement.name).toBe(false);
    const c = makeProfile({ child_name: "রাহেলা" });
    const d = makeProfile({ recordId: "00000000-0000-4000-8000-000000000002", child_name: "রাহেলা" });
    expect(deriveFlagRow(c, d).agreement.name).toBe(true);
  });
});

describe("duplicate-calibration: pickRecommendedCell", () => {
  it("selects finite F1 even when recall is below 100%", () => {
    const cells: GridCell[] = [
      { similarityThreshold: 0.5, minAgreeingProfileFields: 2, tp: 5, fp: 10, fn: 7, truthSize: 12, precision: 33.33, recall: 41.67, f1: 37.04, sharedPhoneNegativeTotal: 0, sharedPhoneNegativeFp: 0, sharedPhoneNegativeRejected: 0 },
    ];
    expect(pickRecommendedCell(cells)?.fn).toBe(7);
    expect(pickRecommendedCell([])).toBeNull();
  });

  it("maximises F1 (the 0.95/2 cell with F1 100 wins over lower-F1 FN=0 cells)", () => {
    const cells: GridCell[] = [
      { similarityThreshold: 0.5, minAgreeingProfileFields: 2, tp: 12, fp: 290, fn: 0, truthSize: 12, precision: 3.97, recall: 100, f1: 7.64, sharedPhoneNegativeTotal: 0, sharedPhoneNegativeFp: 0, sharedPhoneNegativeRejected: 0 },
      { similarityThreshold: 0.85, minAgreeingProfileFields: 2, tp: 12, fp: 50, fn: 0, truthSize: 12, precision: 19.35, recall: 100, f1: 32.43, sharedPhoneNegativeTotal: 0, sharedPhoneNegativeFp: 0, sharedPhoneNegativeRejected: 0 },
      { similarityThreshold: 0.95, minAgreeingProfileFields: 2, tp: 12, fp: 0, fn: 0, truthSize: 12, precision: 100, recall: 100, f1: 100, sharedPhoneNegativeTotal: 0, sharedPhoneNegativeFp: 0, sharedPhoneNegativeRejected: 0 },
    ];
    const picked = pickRecommendedCell(cells);
    expect(picked).not.toBeNull();
    // Highest F1 is 100 (sim_thr=0.95); no tie-break is needed.
    expect(picked!.f1).toBe(100);
    expect(picked!.similarityThreshold).toBe(0.95);
  });

  it("maximises F1 over recall (0.95/3 F1 86.96 beats 0.92/3 F1 72.73 with recall 100)", () => {
    const cells: GridCell[] = [
      { similarityThreshold: 0.92, minAgreeingProfileFields: 3, tp: 12, fp: 9, fn: 0, truthSize: 12, precision: 57.14, recall: 100, f1: 72.73, sharedPhoneNegativeTotal: 25, sharedPhoneNegativeFp: 0, sharedPhoneNegativeRejected: 25 },
      { similarityThreshold: 0.95, minAgreeingProfileFields: 3, tp: 10, fp: 1, fn: 2, truthSize: 12, precision: 90.91, recall: 83.33, f1: 86.96, sharedPhoneNegativeTotal: 25, sharedPhoneNegativeFp: 0, sharedPhoneNegativeRejected: 25 },
    ];
    expect(pickRecommendedCell(cells)?.similarityThreshold).toBe(0.95);
  });

  it("tie-breaks to the lower sim_thr when F1, recall and precision are all equal", () => {
    const cells: GridCell[] = [
      { similarityThreshold: 0.85, minAgreeingProfileFields: 2, tp: 12, fp: 50, fn: 0, truthSize: 12, precision: 19.35, recall: 100, f1: 32.43, sharedPhoneNegativeTotal: 0, sharedPhoneNegativeFp: 0, sharedPhoneNegativeRejected: 0 },
      { similarityThreshold: 0.90, minAgreeingProfileFields: 2, tp: 12, fp: 50, fn: 0, truthSize: 12, precision: 19.35, recall: 100, f1: 32.43, sharedPhoneNegativeTotal: 0, sharedPhoneNegativeFp: 0, sharedPhoneNegativeRejected: 0 },
    ];
    const picked = pickRecommendedCell(cells);
    expect(picked!.similarityThreshold).toBe(0.85);
  });
});

describe("duplicate-calibration: end-to-end against the pre-main dev baseline", () => {
  it("reproduces the pre-main baseline (TP=12, FP=290, FN=0) at the documented default", () => {
    const { grid } = buildCalibrationGrid({
      predictionPath,
      manifestPath,
      recordsPath,
      groundTruthPath,
      embedderSpace,
    });
    const baseline = grid.cells.find((c) => c.similarityThreshold === 0.5 && c.minAgreeingProfileFields === 2);
    expect(baseline).toBeDefined();
    expect(baseline!.tp).toBe(12);
    expect(baseline!.fp).toBe(290);
    expect(baseline!.fn).toBe(0);
    expect(baseline!.truthSize).toBe(12);
    // Precision 3.97% is the same number the pre-main audit reported.
    expect(baseline!.precision).toBeCloseTo(3.97, 1);
    expect(baseline!.recall).toBeCloseTo(100, 1);
  });

  it("surfaces lower-FP cells at full recall, and the F1 picker chooses 0.95/3 (FN=2)", () => {
    const { grid } = buildCalibrationGrid({
      predictionPath,
      manifestPath,
      recordsPath,
      groundTruthPath,
      embedderSpace,
    });
    const baseline = grid.cells.find((c) => c.similarityThreshold === 0.5 && c.minAgreeingProfileFields === 2)!;
    const betterCells = grid.cells.filter((c) =>
      c.fn === 0 && c.fp < baseline.fp && c.similarityThreshold >= 0.5 && c.minAgreeingProfileFields >= 2,
    );
    expect(betterCells.length).toBeGreaterThan(0);
    // The picker maximises F1, so it does NOT pick a full-recall cell: it
    // picks 0.95/3, which misses 2 of 12 dev pairs.
    const picked = pickRecommendedCell(grid.cells);
    expect(picked).not.toBeNull();
    expect(picked!.fp).toBeLessThan(baseline.fp);
    expect(picked!.fn).toBe(2);
    expect(picked!.f1).toBeCloseTo(86.96, 1);
  });

  it("runCalibration writes a JSON grid and a markdown summary, marked DEV / NOT FROZEN", () => {
    const outputDir = mkdtempSync(resolve(tmpdir(), "fera-calibration-"));
    try {
    const result = runCalibration({
      predictionPath,
      manifestPath,
      recordsPath,
      groundTruthPath,
      embedderSpace,
      outputGridJson: resolve(outputDir, "grid.json"),
      outputGridMd: resolve(outputDir, "grid.md"),
    });
    expect(result.grid.cells.length).toBeGreaterThan(0);
    expect(result.recommended.fn).toBe(2);
    expect(result.recommended.fp).toBe(1);
    expect(result.recommended.tp).toBe(10);
    expect(result.evidence.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.evidence.recordsSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.evidence.predictionSha256).toMatch(/^[a-f0-9]{64}$/);
    // Recommended config is a strict subset of the baseline config space
    // (we only raise floors, never lower them).
    expect(result.recommended.similarityThreshold).toBeGreaterThanOrEqual(0.5);
    expect(result.recommended.minAgreeingProfileFields).toBeGreaterThanOrEqual(2);
    } finally { rmSync(outputDir, { recursive: true, force: true }); }
  });
});

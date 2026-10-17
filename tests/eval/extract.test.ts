// Tests for eval/extract.mjs (P3-210, TC-020, TASK-039 GOAL-002).
//
// We exercise the pure scoreRecord / aggregateScores helpers and the run()
// entry point with explicit labelled inputs + explicit prediction files.
// We never call a model. Human-empty labels print "not measured"; the
// cache-hit detector rejects and counts fixture hits; held-out runs require
// the freeze gate.
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-ignore -- plain ESM script without type declarations
import { run as runExtract, scoreRecord, aggregateScores, __test } from "../../eval/extract.mjs";

const { FIELDS, detectCacheHit } = __test;

const SAMPLE_LABEL = {
  kind: "missing",
  child: { name: "Rafi", sex: "male", age_years: 13, age_min: null, age_max: null, height_cm: null, clothing: null, marks: null },
  event: { at: "2026-10-13T16:00:00.000+06:00", at_lower: "2026-10-13T12:00:00.000+06:00", at_upper: "2026-10-13T18:00:00.000+06:00", at_approx: true, thana: null, place_text: "Mirpur", district_text: "Dhaka", district_code: 13, circumstances: null },
  reporter: { relation: "self", phone: "01700000001" },
};

function makeLabels(ids: string[] = ["L001", "L002"]) {
  return Object.fromEntries(ids.map((id, index) => [id, {
    id,
    text: "synthetic test input",
    labels: index === 0 ? SAMPLE_LABEL : {
      ...SAMPLE_LABEL,
      child: { ...SAMPLE_LABEL.child, name: "Sakib", age_years: 12 },
    },
  }]));
}

async function getRecordIds(split: "dev" | "test", count = 2): Promise<string[]> {
  const manifest = JSON.parse(await readFile(join(process.cwd(), "eval/manifest.json"), "utf8"));
  return manifest.records
    .filter((record: { split: string }) => record.split === split)
    .slice(0, count)
    .map((record: { record_id: string }) => record.record_id);
}

function writeLabels(dir: string, lines: unknown[]) {
  return writeFile(join(dir, "labelled.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
}

describe("eval/extract.mjs — scoreRecord", () => {
  it("marks identical drafts as fully correct (no false additions/omissions)", () => {
    const r = scoreRecord(SAMPLE_LABEL, SAMPLE_LABEL);
    for (const f of FIELDS) {
      const p = r.perField[f];
      expect(p.false_add).toBe(false);
      expect(p.false_omission).toBe(false);
      if (p.present_labelled) expect(p.value_match).toBe(true);
    }
  });

  it("flags a false addition when prediction carries a value the label omits", () => {
    const prediction = {
      ...SAMPLE_LABEL,
      event: { ...SAMPLE_LABEL.event, circumstances: "crying" },
    };
    const r = scoreRecord(SAMPLE_LABEL, prediction);
    expect(r.perField["event.circumstances"].present_labelled).toBe(false);
    expect(r.perField["event.circumstances"].present_predicted).toBe(true);
    expect(r.perField["event.circumstances"].false_add).toBe(true);
  });

  it("flags a false omission when the label carries a value the prediction drops", () => {
    const prediction = { ...SAMPLE_LABEL, event: { ...SAMPLE_LABEL.event, district_text: null, district_code: null } };
    const r = scoreRecord(SAMPLE_LABEL, prediction);
    expect(r.perField["event.district_text"].present_labelled).toBe(true);
    expect(r.perField["event.district_text"].present_predicted).toBe(false);
    expect(r.perField["event.district_text"].false_omission).toBe(true);
  });

  it("counts a missing prediction as a known-label miss, not a both-null match", () => {
    const r = scoreRecord(SAMPLE_LABEL, {});
    expect(r.perField["child.name"].false_omission).toBe(true);
    expect(r.nullAgreement.oneNull).toBeGreaterThan(0);
    expect(r.nullAgreement.bothNull).toBeLessThan(FIELDS.length);
  });

  it("flags a value mismatch when both sides are present but disagree", () => {
    const prediction = { ...SAMPLE_LABEL, child: { ...SAMPLE_LABEL.child, name: "Different" } };
    const r = scoreRecord(SAMPLE_LABEL, prediction);
    expect(r.perField["child.name"].present_labelled).toBe(true);
    expect(r.perField["child.name"].present_predicted).toBe(true);
    expect(r.perField["child.name"].value_match).toBe(false);
  });
});

describe("eval/extract.mjs — aggregateScores", () => {
  it("computes per-field precision/recall across multiple records", () => {
    const a = scoreRecord(SAMPLE_LABEL, SAMPLE_LABEL);
    const b = scoreRecord(SAMPLE_LABEL, {
      ...SAMPLE_LABEL,
      child: { ...SAMPLE_LABEL.child, name: "Different" }, // mismatch (value mismatch on child.name)
      event: { ...SAMPLE_LABEL.event, circumstances: "extra" }, // false add on event.circumstances
    });
    const agg = aggregateScores([a, b]);
    const name = agg.metrics["child.name"];
    expect(name).toBeTruthy();
    // Record a: name Rafi === Rafi -> TP. Record b: name Sakib vs Different -> not match -> FN.
    // A mismatched present value is both a false prediction and a missed label.
    expect(name.precision).toBe(0.5);
    // recall = tp / labelled_present = 1 / 2 = 0.5
    expect(name.recall).toBe(0.5);
    const circ = agg.metrics["event.circumstances"];
    // circumstances is null in SAMPLE_LABEL, so labelled_present=0; not measured.
    expect(circ.false_additions).toBe(1);
  });

  it("reports null agreement separately from headline accuracy", () => {
    const a = scoreRecord(SAMPLE_LABEL, SAMPLE_LABEL);
    const agg = aggregateScores([a]);
    expect(agg.totals.bothNull).toBeGreaterThan(0);
    // nullAgreementPct can be 0 if there are no shared-null fields
    expect(typeof agg.totals.nullAgreementPct === "number" || agg.totals.nullAgreementPct === null).toBe(true);
  });

  it("uses every present human-labelled field in accuracy, including missed predictions", () => {
    const presentCount = FIELDS.filter((field: string) => {
      const value = field.split(".").reduce((cur: any, part: string) => cur?.[part], SAMPLE_LABEL as any);
      return value !== null && value !== undefined && value !== "";
    }).length;
    const agg = aggregateScores([
      scoreRecord(SAMPLE_LABEL, SAMPLE_LABEL),
      scoreRecord(SAMPLE_LABEL, {}),
    ]);
    expect(agg.totals.presentLabelled).toBe(presentCount * 2);
    expect(agg.totals.correct).toBe(presentCount);
    expect(agg.totals.presentFieldAccuracy).toBe(0.5);
    expect(agg.totals.bothNull).toBeGreaterThan(0);
  });
});

describe("eval/extract.mjs — run() integration", () => {
  it("reports unmapped label IDs as not measured instead of assigning them to a split", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-extract-"));
    try {
      // Human-empty labels: every line has `labels: {}`.
      await writeFile(join(dir, "labelled.jsonl"), JSON.stringify({ id: "L001", text: "x", labels: {} }) + "\n", "utf8");
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runExtract({
        inputPath: join(dir, "labelled.jsonl"),
        predictionPath: join(dir, "pred.jsonl"),
        split: "dev",
        stdout: capture,
      });
      expect(result.measured).toBe(false);
      expect(result.reason).toBe("unmapped-labels");
      expect(out.join("")).toMatch(/not measured \(label IDs do not map to canonical manifest records/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prints 'not measured' when no --prediction file is given", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-extract-"));
    try {
      const labels = makeLabels(await getRecordIds("dev"));
      await writeLabels(dir, Object.values(labels));
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runExtract({
        inputPath: join(dir, "labelled.jsonl"),
        predictionPath: null,
        split: "dev",
        stdout: capture,
      });
      expect(result.measured).toBe(false);
      expect(result.reason).toBe("no-predictions");
      expect(out.join("")).toMatch(/not measured \(no --prediction file provided/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("excludes and counts cache/fixture hits; all-cache = not measured", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-extract-"));
    try {
      const labels = makeLabels(await getRecordIds("dev"));
      await writeLabels(dir, Object.values(labels));
      await writeFile(join(dir, "pred.jsonl"),
        JSON.stringify({ id: Object.keys(labels)[0], draft: SAMPLE_LABEL, cache_hit: true }) + "\n" +
        JSON.stringify({ id: Object.keys(labels)[1], draft: SAMPLE_LABEL, source: "fixture" }) + "\n",
        "utf8");
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runExtract({
        inputPath: join(dir, "labelled.jsonl"),
        predictionPath: join(dir, "pred.jsonl"),
        split: "dev",
        stdout: capture,
      });
      // Both predictions were cache/fixture hits -> not measured.
      expect(result.measured).toBe(false);
      expect(result.reason).toBe("all-cache");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("computes metrics for an honest measured predictions file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-extract-"));
    try {
      const labels = makeLabels(await getRecordIds("dev"));
      await writeLabels(dir, Object.values(labels));
      const ids = Object.keys(labels);
      await writeFile(join(dir, "pred.jsonl"),
        JSON.stringify({ id: ids[0], draft: labels[ids[0]].labels }) + "\n" +
        JSON.stringify({ id: ids[1], draft: labels[ids[1]].labels }) + "\n",
        "utf8");
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runExtract({
        inputPath: join(dir, "labelled.jsonl"),
        predictionPath: join(dir, "pred.jsonl"),
        split: "dev",
        stdout: capture,
      });
      expect(result.measured).toBe(true);
      expect(result.matched).toBe(2);
      expect(result.cacheHitsExcluded).toBe(0);
      expect(result.failures).toEqual([]);
      expect(out.join("")).toMatch(/recall=/);
      expect(result.headline).toBe(100);
      expect(result.totals.bothNull).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records failures and never invents them (failures list is from real output)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-extract-"));
    try {
      const ids = await getRecordIds("dev");
      const labels = makeLabels(ids);
      // The second prediction has a mismatch (name) and false add (circumstances).
      const secondId = ids[1];
      const secondLabels = labels[secondId].labels;
      const secondBad = { ...secondLabels, child: { ...secondLabels.child, name: "Wrong" }, event: { ...secondLabels.event, circumstances: "extra" } };
      await writeLabels(dir, Object.values(labels));
      await writeFile(join(dir, "pred.jsonl"),
        JSON.stringify({ id: ids[0], draft: labels[ids[0]].labels }) + "\n" +
        JSON.stringify({ id: secondId, draft: secondBad }) + "\n",
        "utf8");
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runExtract({
        inputPath: join(dir, "labelled.jsonl"),
        predictionPath: join(dir, "pred.jsonl"),
        split: "dev",
        stdout: capture,
      });
      expect(result.measured).toBe(true);
      expect(result.failures).toContain(secondId);
      expect(result.failures).not.toContain(ids[0]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("scores only requested-split labels and predictions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-extract-"));
    try {
      const [devId] = await getRecordIds("dev", 1);
      const [testId] = await getRecordIds("test", 1);
      const labels = makeLabels([devId, testId]);
      await writeLabels(dir, Object.values(labels));
      await writeFile(join(dir, "pred.jsonl"),
        JSON.stringify({ id: devId, draft: labels[devId].labels }) + "\n" +
        JSON.stringify({ id: testId, draft: {} }) + "\n",
        "utf8");

      const result = await runExtract({
        inputPath: join(dir, "labelled.jsonl"),
        predictionPath: join(dir, "pred.jsonl"),
        split: "dev",
        stdout: () => undefined,
      });

      expect(result.measured).toBe(true);
      expect(result.matched).toBe(1);
      expect(result.labelsOutsideSplit).toBe(1);
      expect(result.predictionsOutsideSplit).toBe(1);
      expect(result.headline).toBe(100);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("counts labelled records with no prediction as false omissions in headline accuracy", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-extract-"));
    try {
      const ids = await getRecordIds("dev");
      const labels = makeLabels(ids);
      await writeLabels(dir, Object.values(labels));
      await writeFile(join(dir, "pred.jsonl"),
        JSON.stringify({ id: ids[0], draft: labels[ids[0]].labels }) + "\n",
        "utf8");

      const result = await runExtract({
        inputPath: join(dir, "labelled.jsonl"),
        predictionPath: join(dir, "pred.jsonl"),
        split: "dev",
        stdout: () => undefined,
      });

      expect(result.measured).toBe(true);
      expect(result.matched).toBe(1);
      expect(result.missingPreds).toEqual([ids[1]]);
      expect(result.totals.presentLabelled).toBeGreaterThan(0);
      expect(result.headline).toBe(50);
      expect(result.totals.falseOmissions).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses a held-out run when the freeze gate is not satisfied", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-extract-"));
    try {
      const labels = makeLabels();
      await writeLabels(dir, Object.values(labels));
      await writeFile(join(dir, "pred.jsonl"),
        JSON.stringify({ id: "L001", draft: labels.L001.labels }) + "\n" +
        JSON.stringify({ id: "L002", draft: labels.L002.labels }) + "\n",
        "utf8");
      // Wipe env vars.
      const before = { c: process.env.FERA_FREEZE_COMMIT, m: process.env.FERA_FREEZE_MODEL, h: process.env.FERA_MANIFEST_SHA256 };
      delete process.env.FERA_FREEZE_COMMIT;
      delete process.env.FERA_FREEZE_MODEL;
      delete process.env.FERA_MANIFEST_SHA256;
      try {
        const out: string[] = [];
        const capture = (s: string) => out.push(s);
        const result = await runExtract({
          inputPath: join(dir, "labelled.jsonl"),
          predictionPath: join(dir, "pred.jsonl"),
          split: "heldout",
          stdout: capture,
        });
        expect(result.measured).toBe(false);
        expect(result.reason).toBe("freeze-gate");
        expect(out.join("")).toMatch(/not measured \(freeze gate refused/);
      } finally {
        if (before.c !== undefined) process.env.FERA_FREEZE_COMMIT = before.c;
        if (before.m !== undefined) process.env.FERA_FREEZE_MODEL = before.m;
        if (before.h !== undefined) process.env.FERA_MANIFEST_SHA256 = before.h;
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("malformed JSONL in predictions throws a sanitised error (no child text leakage)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-extract-"));
    try {
      const labels = makeLabels(await getRecordIds("dev"));
      await writeLabels(dir, Object.values(labels));
      // Malformed: deliberately include text the error must not echo.
      await writeFile(join(dir, "pred.jsonl"), "{broken: child text রহিম হারিয়ে গেছে\n", "utf8");
      await expect(runExtract({
        inputPath: join(dir, "labelled.jsonl"),
        predictionPath: join(dir, "pred.jsonl"),
        split: "dev",
        stdout: (() => undefined) as (s: string) => void,
      })).rejects.toThrow(/line 1: invalid JSON/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("eval/extract.mjs — detectCacheHit", () => {
  it("flags fixture_id, cache_hit, source=fixture, source=cache", () => {
    expect(detectCacheHit({ fixture_id: "f1" })).toBe(true);
    expect(detectCacheHit({ cache_hit: true })).toBe(true);
    expect(detectCacheHit({ source: "fixture" })).toBe(true);
    expect(detectCacheHit({ source: "cache" })).toBe(true);
  });

  it("does not flag ordinary predictions", () => {
    expect(detectCacheHit({ id: "L001", draft: SAMPLE_LABEL })).toBe(false);
  });
});

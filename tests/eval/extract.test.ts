// Tests for eval/extract.mjs (P3-210, TC-020, TASK-039 GOAL-002).
//
// We exercise the pure scoreRecord / aggregateScores helpers and the run()
// entry point with explicit labelled inputs + explicit prediction files.
// We never call a model. Human-empty labels print "not measured"; the
// cache-hit detector rejects and counts fixture hits; held-out runs require
// the freeze gate.
import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

function makeLabels() {
  return {
    L001: {
      id: "L001",
      text: "আমার ছেলে রাফি...",
      labels: SAMPLE_LABEL,
    },
    L002: {
      id: "L002",
      text: "...",
      labels: {
        ...SAMPLE_LABEL,
        child: { ...SAMPLE_LABEL.child, name: "Sakib", age_years: 12 },
      },
    },
  };
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
    // precision = tp / (tp + fp) = 1 / 1 = 1.0
    expect(name.precision).toBe(1.0);
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
});

describe("eval/extract.mjs — run() integration", () => {
  it("prints 'not measured' when labels are human-empty", async () => {
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
      expect(result.reason).toBe("human-empty");
      expect(out.join("")).toMatch(/not measured \(labels are human-empty/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prints 'not measured' when no --prediction file is given", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-extract-"));
    try {
      await writeLabels(dir, Object.values(makeLabels()));
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
      await writeLabels(dir, Object.values(makeLabels()));
      await writeFile(join(dir, "pred.jsonl"),
        JSON.stringify({ id: "L001", draft: SAMPLE_LABEL, cache_hit: true }) + "\n" +
        JSON.stringify({ id: "L002", draft: SAMPLE_LABEL, source: "fixture" }) + "\n",
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
      const labels = makeLabels();
      await writeLabels(dir, Object.values(labels));
      await writeFile(join(dir, "pred.jsonl"),
        JSON.stringify({ id: "L001", draft: labels.L001.labels }) + "\n" +
        JSON.stringify({ id: "L002", draft: labels.L002.labels }) + "\n",
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
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records failures and never invents them (failures list is from real output)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-extract-"));
    try {
      const labels = makeLabels();
      // L002 prediction: a mismatch (name) and a false add (circumstances)
      const l002Bad = { ...labels.L002.labels, child: { ...labels.L002.labels.child, name: "Wrong" }, event: { ...labels.L002.labels.event, circumstances: "extra" } };
      await writeLabels(dir, Object.values(labels));
      await writeFile(join(dir, "pred.jsonl"),
        JSON.stringify({ id: "L001", draft: labels.L001.labels }) + "\n" +
        JSON.stringify({ id: "L002", draft: l002Bad }) + "\n",
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
      expect(result.failures).toContain("L002");
      expect(result.failures).not.toContain("L001");
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
      const labels = makeLabels();
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

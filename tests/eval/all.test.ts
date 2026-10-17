// Tests for eval/all.mjs (P3-214, TC-020, TASK-039).
//
// eval:all runs eval:extract / eval:match / eval:dedupe and writes a Markdown
// report + JSON result. We never call a model. We test that the report is
// written, the JSON is written, manifest hashes are reported, the freeze
// gate refuses held-out, and the missing-evidence section is honest.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-ignore -- plain ESM script without type declarations
import { run as runAll, __test } from "../../eval/all.mjs";

const { parseArgs, notMeasuredMessage } = __test;

describe("eval/all.mjs — parseArgs", () => {
  it("defaults to dev split, no prediction files, default paths", () => {
    const out = parseArgs(["node", "eval/all.mjs"]);
    expect(out.split).toBe("dev");
    expect(out.extractPrediction).toBeNull();
    expect(out.matchPrediction).toBeNull();
    expect(out.dedupePrediction).toBeNull();
    expect(out.errors).toEqual([]);
  });

  it("parses --split, --*-prediction and --report/--json", () => {
    const out = parseArgs([
      "node", "eval/all.mjs",
      "--split", "heldout",
      "--extract-prediction", "x.jsonl",
      "--match-prediction", "y.jsonl",
      "--dedupe-prediction", "z.jsonl",
      "--report", "r.md",
      "--json", "r.json",
    ]);
    expect(out.split).toBe("heldout");
    expect(out.extractPrediction).toBe("x.jsonl");
    expect(out.matchPrediction).toBe("y.jsonl");
    expect(out.dedupePrediction).toBe("z.jsonl");
    expect(out.report).toBe("r.md");
    expect(out.json).toBe("r.json");
    expect(out.errors).toEqual([]);
  });
});

describe("eval/all.mjs — run() integration", () => {
  let envSnapshot: Record<string, string | undefined> = {};
  beforeEach(() => {
    envSnapshot = {
      FERA_FREEZE_COMMIT: process.env.FERA_FREEZE_COMMIT,
      FERA_FREEZE_MODEL: process.env.FERA_FREEZE_MODEL,
      FERA_MANIFEST_SHA256: process.env.FERA_MANIFEST_SHA256,
    };
    delete process.env.FERA_FREEZE_COMMIT;
    delete process.env.FERA_FREEZE_MODEL;
    delete process.env.FERA_MANIFEST_SHA256;
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(envSnapshot)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("refuses a held-out run when the freeze gate is not satisfied", async () => {
    const out: string[] = [];
    const capture = (s: string) => out.push(s);
    const result = await runAll({
      split: "heldout",
      extractPrediction: null,
      matchPrediction: null,
      dedupePrediction: null,
      reportPath: "/tmp/eval-all-should-not-exist.md",
      jsonPath: "/tmp/eval-all-should-not-exist.json",
      stdout: capture,
    });
    expect(result.measured).toBe(false);
    expect(result.reason).toBe("freeze-gate");
    expect(out.join("")).toMatch(/not measured \(freeze gate refused/);
  });

  it("writes a markdown report and JSON result for a dev run with no predictions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-all-"));
    try {
      const reportPath = join(dir, "eval.md");
      const jsonPath = join(dir, "eval.json");
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runAll({
        split: "dev",
        extractPrediction: null,
        matchPrediction: null,
        dedupePrediction: null,
        reportPath,
        jsonPath,
        stdout: capture,
      });
      // Without prediction files, the modules return measured=false and
      // reason="no-prediction" / "human-empty" / etc. eval:all still writes
      // a report and a JSON result, listing the missing evidence honestly.
      const md = await readFile(reportPath, "utf8");
      const json = JSON.parse(await readFile(jsonPath, "utf8"));
      expect(md).toMatch(/# Fera eval:all/);
      expect(md).toMatch(/commit: `/);
      expect(md).toMatch(/manifest hash \(sha256\): `/);
      expect(md).toMatch(/Missing evidence/);
      expect(json.split).toBe("dev");
      expect(json.modules.extract.measured).toBe(false);
      expect(json.modules.match.measured).toBe(false);
      expect(json.modules.dedupe.measured).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("includes the manifest-lib presence flag in the JSON result", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-all-"));
    try {
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runAll({
        split: "dev",
        extractPrediction: null,
        matchPrediction: null,
        dedupePrediction: null,
        reportPath: join(dir, "eval.md"),
        jsonPath: join(dir, "eval.json"),
        stdout: capture,
      });
      expect(typeof result.manifestLibPresent).toBe("boolean");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// Tests for eval/time.mjs — D2B §17 GOAL-001 (TASK-039c part / TC-020 part).
// Header is `participant,method,seconds,completed`; method is `assistant` or
// `manual`; completed is `yes` or `no`. `seconds` is required when completed=yes
// and must be empty when completed=no. Fewer than 5 distinct participants with
// both methods, or an empty file -> "not measured (need >=5 testers, have N)"
// and exit 0. Per method, attempts N, completed n and completion "n/N" are
// printed; median, Q1, Q3, IQR, min and max are over COMPLETED rows only. The
// median difference uses completed rows only and prints "n/a" if either method
// has no completed rows.
import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error -- plain ESM script without type declarations
import { run as runTime, __test } from "../../eval/time.mjs";

const { median, iqr, parseCsv } = __test;

describe("eval/time.mjs — median and IQR", () => {
  it("median of an odd-length list is the middle value", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("median of an even-length list is the mean of the two middle values", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("median of an empty list is null", () => {
    expect(median([])).toBeNull();
  });

  it("IQR is Q3 - Q1 with linear interpolation", () => {
    // [1,2,3,4] -> Q1=1.75, Q3=3.25 with linear interpolation.
    const result = iqr([1, 2, 3, 4]);
    expect(result).not.toBeNull();
    expect(result!.q1).toBeCloseTo(1.75, 6);
    expect(result!.q3).toBeCloseTo(3.25, 6);
    expect(result!.iqr).toBeCloseTo(1.5, 6);
  });

  it("IQR of an empty list is null", () => {
    expect(iqr([])).toBeNull();
  });
});

describe("eval/time.mjs — parseCsv (4-column contract)", () => {
  it("parses the documented header and rows", () => {
    const csv = [
      "participant,method,seconds,completed",
      "p1,assistant,12.5,yes",
      "p1,manual,30.0,yes",
    ].join("\n");
    const { rows } = parseCsv(csv);
    expect(rows).toEqual([
      { participant: "p1", method: "assistant", seconds: 12.5, completed: true },
      { participant: "p1", method: "manual", seconds: 30.0, completed: true },
    ]);
  });

  it("rejects the old 3-column header with a clear one-line error", () => {
    const csv = ["participant,method,seconds", "p1,assistant,12.5"].join("\n");
    expect(() => parseCsv(csv)).toThrow(
      /header must be 'participant,method,seconds,completed' \(4 columns\)/,
    );
  });

  it("rejects a header that does not match the contract", () => {
    const csv = ["participant,mode,seconds,completed", "p1,assistant,12.5,yes"].join("\n");
    expect(() => parseCsv(csv)).toThrow(
      /header must be 'participant,method,seconds,completed'/,
    );
  });

  it("rejects an unknown method", () => {
    const csv = [
      "participant,method,seconds,completed",
      "p1,voice,12.5,yes",
    ].join("\n");
    expect(() => parseCsv(csv)).toThrow(/method must be 'assistant' or 'manual'/);
  });

  it("rejects a completed value that is not yes/no", () => {
    const csv = [
      "participant,method,seconds,completed",
      "p1,assistant,12.5,maybe",
    ].join("\n");
    expect(() => parseCsv(csv)).toThrow(/completed must be 'yes' or 'no'/);
  });

  it("rejects a non-numeric seconds value when completed=yes", () => {
    const csv = [
      "participant,method,seconds,completed",
      "p1,assistant,abc,yes",
    ].join("\n");
    expect(() => parseCsv(csv)).toThrow(
      /seconds must be a non-negative finite number/,
    );
  });

  it("rejects completed=no with a non-empty seconds value", () => {
    const csv = [
      "participant,method,seconds,completed",
      "p1,assistant,12.5,no",
    ].join("\n");
    expect(() => parseCsv(csv)).toThrow(
      /seconds must be empty when completed=no/,
    );
  });

  it("rejects completed=yes with an empty seconds value", () => {
    const csv = [
      "participant,method,seconds,completed",
      "p1,assistant,,yes",
    ].join("\n");
    expect(() => parseCsv(csv)).toThrow(
      /seconds is required when completed=yes, got empty/,
    );
  });

  it("accepts a row with completed=no and empty seconds", () => {
    const csv = [
      "participant,method,seconds,completed",
      "p1,assistant,,no",
    ].join("\n");
    const { rows } = parseCsv(csv);
    expect(rows).toEqual([
      { participant: "p1", method: "assistant", seconds: null, completed: false },
    ]);
  });

  it("rejects a row with the wrong column count", () => {
    const csv = [
      "participant,method,seconds,completed",
      "p1,assistant,12.5",
    ].join("\n");
    expect(() => parseCsv(csv)).toThrow(/expected 4 columns, got 3/);
  });
});

describe("eval/time.mjs — run() integration", () => {
  it("prints 'not measured' for an empty file (header only)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-time-"));
    try {
      const path = join(dir, "timing.csv");
      await writeFile(path, "participant,method,seconds,completed\n", "utf8");
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runTime({
        csvPath: path,
        stdout: capture as (s: string) => void,
      });
      expect(result.measured).toBe(false);
      expect(out.join("")).toMatch(/eval:time: not measured \(empty timing file, have 0\)/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prints 'not measured (need >=5 testers, have N)' when fewer than 5 participants", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-time-"));
    try {
      const path = join(dir, "timing.csv");
      const lines = ["participant,method,seconds,completed"];
      for (let i = 1; i <= 3; i++) {
        lines.push(`p${i},assistant,${10 + i},yes`);
        lines.push(`p${i},manual,${20 + i},yes`);
      }
      await writeFile(path, lines.join("\n") + "\n", "utf8");
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runTime({
        csvPath: path,
        stdout: capture as (s: string) => void,
      });
      expect(result.measured).toBe(false);
      expect(out.join("")).toMatch(/eval:time: not measured \(need >=5 testers with both methods, have 3\)/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not count assistant-only participants toward the 5-tester gate", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-time-"));
    try {
      const path = join(dir, "timing.csv");
      const lines = ["participant,method,seconds,completed"];
      for (let i = 1; i <= 5; i++) lines.push(`p${i},assistant,${10 + i},yes`);
      await writeFile(path, lines.join("\n") + "\n", "utf8");
      const out: string[] = [];
      const result = await runTime({ csvPath: path, stdout: ((s: string) => out.push(s)) as (s: string) => void });
      expect(result.measured).toBe(false);
      expect(out.join("")).toMatch(/with both methods, have 0\)/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("summarises 5+ participants and prints attempts, completed, completion, median, IQR, min, max per method", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-time-"));
    try {
      const path = join(dir, "timing.csv");
      const lines = ["participant,method,seconds,completed"];
      // 5 participants, assistant: 10, 12, 14, 16, 18 (median 14, Q1=12, Q3=16, min=10, max=18)
      // 5 participants, manual:    20, 25, 30, 35, 40 (median 30, Q1=25, Q3=35, min=20, max=40)
      const aVals = [10, 12, 14, 16, 18];
      const mVals = [20, 25, 30, 35, 40];
      for (let i = 0; i < 5; i++) {
        lines.push(`p${i + 1},assistant,${aVals[i]},yes`);
        lines.push(`p${i + 1},manual,${mVals[i]},yes`);
      }
      await writeFile(path, lines.join("\n") + "\n", "utf8");
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runTime({
        csvPath: path,
        stdout: capture as (s: string) => void,
      });
      expect(result.measured).toBe(true);
      const printed = out.join("");
      expect(printed).toMatch(/participants with both methods: 5/);
      expect(printed).toMatch(
        /method=assistant: attempts=5 completed=5 completion=5\/5 median=14\.00s Q1=12\.00s Q3=16\.00s IQR=4\.00s min=10\.00s max=18\.00s/,
      );
      expect(printed).toMatch(
        /method=manual: attempts=5 completed=5 completion=5\/5 median=30\.00s Q1=25\.00s Q3=35\.00s IQR=10\.00s min=20\.00s max=40\.00s/,
      );
      expect(printed).toMatch(/median difference \(assistant - manual\): -16\.00s/);
      // median(14) - median(30) = -16
      expect(result.medians.assistant).toBe(14);
      expect(result.medians.manual).toBe(30);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records non-completers and counts them in the denominator but not in stats", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-time-"));
    try {
      const path = join(dir, "timing.csv");
      const lines = ["participant,method,seconds,completed"];
      // 5 distinct participants with BOTH methods; one assistant non-completer.
      const mVals = [20, 25, 30, 35, 40];
      // assistant: 4 completed + 1 non-completer
      lines.push("p1,assistant,10,yes");
      lines.push("p2,assistant,12,yes");
      lines.push("p3,assistant,14,yes");
      lines.push("p4,assistant,,no"); // non-completer: counted in attempts, NOT in completed
      lines.push("p5,assistant,18,yes");
      // manual: all 5 completed
      for (let i = 0; i < 5; i++) {
        lines.push(`p${i + 1},manual,${mVals[i]},yes`);
      }
      await writeFile(path, lines.join("\n") + "\n", "utf8");
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runTime({
        csvPath: path,
        stdout: capture as (s: string) => void,
      });
      expect(result.measured).toBe(true);
      const printed = out.join("");
      expect(printed).toMatch(/participants with both methods: 5/);
      // attempts=5, completed=4, completion=4/5 for assistant
      expect(printed).toMatch(
        /method=assistant: attempts=5 completed=4 completion=4\/5 median=13\.00s Q1=11\.50s Q3=15\.00s IQR=3\.50s min=10\.00s max=18\.00s/,
      );
      // stats use [10,12,14,18] only -> sorted mean of middle = (12+14)/2 = 13
      expect(printed).toMatch(/median difference \(assistant - manual\): -17\.00s/);
      // 13 - 30 = -17
      expect(result.completed.assistant).toEqual([10, 12, 14, 18]);
      expect(result.completed.manual).toEqual([20, 25, 30, 35, 40]);
      expect(result.attempts.assistant).toBe(5);
      expect(result.attempts.manual).toBe(5);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prints min and max correctly when values are mixed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-time-"));
    try {
      const path = join(dir, "timing.csv");
      const lines = ["participant,method,seconds,completed"];
      // mix of completed + non-completer rows; min/max apply to completed only
      lines.push("p1,assistant,5,yes");
      lines.push("p2,assistant,,no");
      lines.push("p3,assistant,9,yes");
      lines.push("p4,assistant,7,yes");
      lines.push("p5,assistant,11,yes");
      // mirror for manual so the paired gate passes
      lines.push("p1,manual,21,yes");
      lines.push("p2,manual,22,yes");
      lines.push("p3,manual,23,yes");
      lines.push("p4,manual,24,yes");
      lines.push("p5,manual,25,yes");
      await writeFile(path, lines.join("\n") + "\n", "utf8");
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runTime({
        csvPath: path,
        stdout: capture as (s: string) => void,
      });
      expect(result.measured).toBe(true);
      const printed = out.join("");
      // completed assistant rows = [5,7,9,11], min=5 max=11
      expect(printed).toMatch(
        /method=assistant: attempts=5 completed=4 completion=4\/5[\s\S]*min=5\.00s max=11\.00s/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prints 'n/a' for the median difference if either method has no completed rows", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-time-"));
    try {
      const path = join(dir, "timing.csv");
      const lines = ["participant,method,seconds,completed"];
      // 5 participants; assistant all completed, manual all non-completers
      for (let i = 1; i <= 5; i++) {
        lines.push(`p${i},assistant,${10 + i},yes`);
        lines.push(`p${i},manual,,no`);
      }
      await writeFile(path, lines.join("\n") + "\n", "utf8");
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runTime({
        csvPath: path,
        stdout: capture as (s: string) => void,
      });
      expect(result.measured).toBe(true);
      const printed = out.join("");
      expect(printed).toMatch(/method=assistant: attempts=5 completed=5 completion=5\/5/);
      expect(printed).toMatch(/method=manual: attempts=5 completed=0 completion=0\/5/);
      expect(printed).toMatch(/median difference: n\/a/);
      expect(printed).toMatch(/0 completed rows/);
      expect(result.medians.assistant).toBe(13);
      expect(result.medians.manual).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

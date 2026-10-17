// Tests for eval/time.mjs — D2B §17 GOAL-001 (TASK-039c part / TC-020 part).
// Header is `participant,method,seconds`; method is `assistant` or `manual`.
// Fewer than 5 distinct participants or an empty file -> "not measured
// (need >=5 testers, have N)" and exit 0. Median and IQR printed per method,
// median difference printed at the end.
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

describe("eval/time.mjs — parseCsv", () => {
  it("parses the documented header and rows", () => {
    const csv = ["participant,method,seconds", "p1,assistant,12.5", "p1,manual,30.0"].join("\n");
    const { rows } = parseCsv(csv);
    expect(rows).toEqual([
      { participant: "p1", method: "assistant", seconds: 12.5 },
      { participant: "p1", method: "manual", seconds: 30.0 },
    ]);
  });

  it("rejects an unknown method", () => {
    const csv = ["participant,method,seconds", "p1,voice,12.5"].join("\n");
    expect(() => parseCsv(csv)).toThrow(/method must be 'assistant' or 'manual'/);
  });

  it("rejects a header that does not match the contract", () => {
    const csv = ["participant,mode,seconds", "p1,assistant,12.5"].join("\n");
    expect(() => parseCsv(csv)).toThrow(/header must be 'participant,method,seconds'/);
  });

  it("rejects a non-numeric seconds value", () => {
    const csv = ["participant,method,seconds", "p1,assistant,abc"].join("\n");
    expect(() => parseCsv(csv)).toThrow(/seconds must be a non-negative finite number/);
  });
});

describe("eval/time.mjs — run() integration", () => {
  it("prints 'not measured' for an empty file (header only)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-time-"));
    try {
      const path = join(dir, "timing.csv");
      await writeFile(path, "participant,method,seconds\n", "utf8");
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
      const lines = ["participant,method,seconds"];
      for (let i = 1; i <= 3; i++) {
        lines.push(`p${i},assistant,${10 + i}`);
        lines.push(`p${i},manual,${20 + i}`);
      }
      await writeFile(path, lines.join("\n") + "\n", "utf8");
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runTime({
        csvPath: path,
        stdout: capture as (s: string) => void,
      });
      expect(result.measured).toBe(false);
      expect(out.join("")).toMatch(/eval:time: not measured \(need >=5 testers, have 3\)/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("summarises 5+ participants and prints n, median, IQR per method plus the median difference", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-time-"));
    try {
      const path = join(dir, "timing.csv");
      const lines = ["participant,method,seconds"];
      // 5 participants, assistant: 10, 12, 14, 16, 18 (median 14, Q1=12, Q3=16)
      // 5 participants, manual:    20, 25, 30, 35, 40 (median 30, Q1=25, Q3=35)
      const aVals = [10, 12, 14, 16, 18];
      const mVals = [20, 25, 30, 35, 40];
      for (let i = 0; i < 5; i++) {
        lines.push(`p${i + 1},assistant,${aVals[i]}`);
        lines.push(`p${i + 1},manual,${mVals[i]}`);
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
      expect(printed).toMatch(/distinct participants: 5/);
      expect(printed).toMatch(/method=assistant: n=5 median=14\.00s Q1=12\.00s Q3=16\.00s IQR=4\.00s/);
      expect(printed).toMatch(/method=manual: n=5 median=30\.00s Q1=25\.00s Q3=35\.00s IQR=10\.00s/);
      expect(printed).toMatch(/median difference \(assistant - manual\): -16\.00s/);
      // median(14) - median(30) = -16
      expect(result.medians.assistant).toBe(14);
      expect(result.medians.manual).toBe(30);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

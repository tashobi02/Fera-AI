// Tests for eval/wer.mjs — D2B §17 GOAL-005 (TASK-039c part / TC-020 part).
// Pure WER = word-level Levenshtein over NFC-normalised text, punctuation
// (including the danda U+0964) stripped, whitespace-split. The script does
// not call any STT provider; we exercise the helpers directly and the
// `run()` entry point on tiny Bangla + English fixtures written to a temp dir.
import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error -- plain ESM script without type declarations
import { run as runWer, normalise, scorePair, __test } from "../../eval/wer.mjs";

const { parseJsonl } = __test;

describe("eval/wer.mjs — normalise and score", () => {
  it("identical Bangla text produces 0 edits and matches reference-word count", () => {
    const text = "আমার সন্তান হারিয়ে গেছে কামালাপুর";
    expect(scorePair(text, text).edits).toBe(0);
  });

  it("identical English text produces 0 edits", () => {
    const text = "my child went missing in kamalapur";
    expect(scorePair(text, text).edits).toBe(0);
  });

  it("one substitution adds exactly one edit", () => {
    const ref = "the child wore a red shirt";
    const hyp = "the child wore a blue shirt";
    expect(scorePair(ref, hyp).edits).toBe(1);
  });

  it("one deletion adds exactly one edit", () => {
    const ref = "the child wore a red shirt";
    const hyp = "the child wore a shirt";
    expect(scorePair(ref, hyp).edits).toBe(1);
  });

  it("one insertion adds exactly one edit", () => {
    const ref = "the child wore a red shirt";
    const hyp = "the child wore a bright red shirt";
    expect(scorePair(ref, hyp).edits).toBe(1);
  });

  it("empty hypothesis against a multi-word reference counts every reference word as a deletion", () => {
    const ref = "the child is missing";
    const result = scorePair(ref, "");
    expect(result.refWords).toBe(4);
    expect(result.edits).toBe(4);
  });

  it("empty reference and empty hypothesis: 0 edits, 0 ref words", () => {
    const result = scorePair("", "");
    expect(result.edits).toBe(0);
    expect(result.refWords).toBe(0);
  });

  it("punctuation and the danda are stripped before comparison", () => {
    // The danda U+0964 is a Bangla full stop; the spec lists it explicitly.
    const ref = "আমার ছেলে হারিয়ে গেছে, কামালাপুর।";
    const hyp = "আমার ছেলে হারিয়ে গেছে কামালাপুর";
    expect(scorePair(ref, hyp).edits).toBe(0);
  });

  it("NFC normalisation: combining marks fold to a single token", () => {
    // 'é' as e + combining acute (NFD) should match a single 'é' (NFC) per Unicode rules.
    const ref = "café".normalize("NFC");
    const hyp = "cafe\u0301".normalize("NFC");
    expect(scorePair(ref, hyp).edits).toBe(0);
  });

  it("normalise strips the danda and collapses whitespace", () => {
    const tokens = normalise("আমার, ছেলে।  হারিয়ে\u0964গেছে");
    expect(tokens).toEqual(["আমার", "ছেলে", "হারিয়ে", "গেছে"]);
  });
});

describe("eval/wer.mjs — JSONL parsing", () => {
  it("parses one JSON object per line and ignores blank lines", () => {
    const lines = parseJsonl('{"id":"a","text":"hello world"}\n\n{"id":"b","text":"bangla টেক্সট"}\n');
    expect(lines).toEqual([
      { id: "a", text: "hello world" },
      { id: "b", text: "bangla টেক্সট" },
    ]);
  });

  it("rejects a line that is not {id,text}", () => {
    expect(() => parseJsonl('{"id":"a","text":1}\n')).toThrow(/expected \{id:string, text:string\}/);
  });
});

describe("eval/wer.mjs — run() integration", () => {
  it("prints 'not measured' when both files are missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-wer-"));
    try {
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runWer({
        refPath: join(dir, "missing.ref.jsonl"),
        hypPath: join(dir, "missing.hyp.jsonl"),
        stdout: capture as (s: string) => void,
      });
      expect(result.measured).toBe(false);
      expect(out.join("")).toMatch(/eval:wer: not measured \(reference and hypothesis files both missing\)/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prints 'not measured' when zero ids match", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-wer-"));
    try {
      await writeFile(
        join(dir, "ref.jsonl"),
        '{"id":"a","text":"hello world"}\n{"id":"b","text":"two"}\n',
        "utf8",
      );
      await writeFile(
        join(dir, "hyp.jsonl"),
        '{"id":"c","text":"three"}\n',
        "utf8",
      );
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runWer({
        refPath: join(dir, "ref.jsonl"),
        hypPath: join(dir, "hyp.jsonl"),
        stdout: capture as (s: string) => void,
      });
      expect(result.measured).toBe(false);
      expect(out.join("")).toMatch(/eval:wer: not measured \(0 matched ids\)/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("skips references without a hypothesis and counts them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-wer-"));
    try {
      await writeFile(
        join(dir, "ref.jsonl"),
        '{"id":"a","text":"hello world"}\n{"id":"b","text":"one two three"}\n',
        "utf8",
      );
      await writeFile(join(dir, "hyp.jsonl"), '{"id":"a","text":"hello earth"}\n', "utf8");
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runWer({
        refPath: join(dir, "ref.jsonl"),
        hypPath: join(dir, "hyp.jsonl"),
        stdout: capture as (s: string) => void,
      });
      expect(result.measured).toBe(true);
      expect(result.matched).toBe(1);
      expect(result.skipped).toBe(1);
      // "hello world" -> "hello earth" is 1 edit, denominator 2 reference words.
      expect(result.totalEdits).toBe(1);
      expect(result.totalRefWords).toBe(2);
      expect(out.join("")).toMatch(/skipped \(no hypothesis\): 1/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("aggregates edits across multiple clips (denominator = sum of reference words)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fera-wer-"));
    try {
      await writeFile(
        join(dir, "ref.jsonl"),
        '{"id":"a","text":"one two three"}\n{"id":"b","text":"alpha beta gamma delta"}\n',
        "utf8",
      );
      await writeFile(
        join(dir, "hyp.jsonl"),
        '{"id":"a","text":"one two three"}\n{"id":"b","text":"alpha beta gamma delta"}\n',
        "utf8",
      );
      const out: string[] = [];
      const capture = (s: string) => out.push(s);
      const result = await runWer({
        refPath: join(dir, "ref.jsonl"),
        hypPath: join(dir, "hyp.jsonl"),
        stdout: capture as (s: string) => void,
      });
      expect(result.measured).toBe(true);
      expect(result.totalRefWords).toBe(7);
      expect(result.totalEdits).toBe(0);
      expect(out.join("")).toMatch(/aggregate WER: 0\.00%/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

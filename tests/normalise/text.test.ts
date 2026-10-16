import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { evidenceSpanSchema } from "@/contracts";
import { evidenceForRange, normaliseText, type NormalisedText, type Utf16Range } from "@/server/normalise";

describe("normaliseText", () => {
  // FR-003, COMP-008: every Bangla numeral has an ASCII equivalent.
  it("converts all ten Bangla digits and retains their raw quotes", () => {
    const result = normaliseText("[MOCK] ০১২৩৪৫৬৭৮৯");
    expect(result.status).toBe("known");
    if (result.status !== "known") return;
    expect(result.value.normalisedText).toBe("[MOCK] 0123456789");
    expect(result.value.tokens.at(-1)?.evidence).toEqual({
      quote: "০১২৩৪৫৬৭৮৯", start_utf16: 7, end_utf16: 17, derivation: "digits",
    });
  });

  // FR-003, BR-008: existing Latin digits and mixed scripts retain their meaning.
  it("normalises mixed digits without changing Latin text or punctuation", () => {
    const result = normaliseText("[MOCK] age 1৩, নম্বর ০1৭।");
    expect(result.status === "known" && result.value.normalisedText).toBe("[MOCK] age 13, নম্বর 017।");
  });

  // BR-008, D2A §2.1: source text and spacing are immutable evidence.
  it("preserves whitespace and the original source text", () => {
    const source = "  [MOCK]\t১৩\n";
    const result = normaliseText(source);
    expect(result.status === "known" && result.value.sourceText).toBe(source);
    expect(result.status === "known" && result.value.normalisedText).toBe("  [MOCK]\t13\n");
  });

  // D2B §10 input controls: canonically equivalent Bangla vowel signs use NFC.
  it("maps an NFC composition back to both raw combining code units", () => {
    const source = "[MOCK] ক\u09c7\u09be ১৩";
    const result = normaliseText(source);
    expect(result.status).toBe("known");
    if (result.status !== "known") return;
    expect(result.value.normalisedText).toBe("[MOCK] কো 13");
    expect(result.value.offsetMap[8]).toEqual({ start_utf16: 7, end_utf16: 10 });
    const token = result.value.tokens.find((t) => t.text === "কো");
    expect(token?.evidence.quote).toBe("ক\u09c7\u09be");
    expect(token?.evidence.derivation).toBe("direct");
  });

  // D2B §10 NFC; BR-008: nukta forms must not shift later source evidence.
  it.each([
    ["U+09DF", "\u09df", "য\u09bc", 8],
    ["U+09AF U+09BC", "য\u09bc", "য\u09bc", 9],
    ["U+09DC", "\u09dc", "ড\u09bc", 8],
    ["U+09A1 U+09BC", "ড\u09bc", "ড\u09bc", 9],
  ] as const)("maps %s to explicit decomposed nukta code units and raw offsets", (_label, word, normalised, rawEnd) => {
    const source = `[MOCK] ${word} ১৩`;
    const result = normaliseText(source);
    expect(result.status).toBe("known");
    if (result.status !== "known") return;
    expect(result.value.normalisedText).toBe(`[MOCK] ${normalised} 13`);
    expect(result.value.normalisedText.slice(7, 9)).toHaveLength(2);
    expect(result.value.offsetMap[7]).toEqual({ start_utf16: 7, end_utf16: rawEnd });
    expect(result.value.offsetMap[8]).toEqual({ start_utf16: 7, end_utf16: rawEnd });
    expect(result.value.tokens[1]?.evidence).toEqual({ quote: word, start_utf16: 7, end_utf16: rawEnd, derivation: "direct" });
    expect(result.value.tokens.at(-1)?.evidence.start_utf16).toBe(rawEnd + 1);
  });

  // BR-008, D2A §2.1: join controls are part of source text, not removable noise.
  it("preserves zero-width joiners and non-joiners in conjuncts", () => {
    const source = "[MOCK] ক্\u200dষ ক্\u200cষ ১৩";
    const result = normaliseText(source);
    expect(result.status === "known" && result.value.normalisedText).toBe(source.replace("১৩", "13"));
    if (result.status === "known") {
      expect(result.value.tokens.some((t) => t.evidence.quote === "ক্\u200dষ")).toBe(true);
      expect(result.value.tokens.some((t) => t.evidence.quote === "ক্\u200cষ")).toBe(true);
    }
  });

  // D2A §2.1, EvidenceSpan: offsets are UTF-16, including surrogate pairs.
  it("maps tokens after a supplementary character to their UTF-16 positions", () => {
    const source = "[MOCK] 🧪 ১৩ ১৩";
    const result = normaliseText(source);
    expect(result.status).toBe("known");
    if (result.status !== "known") return;
    expect(result.value.tokens.filter((t) => t.text === "13").map((t) => t.evidence.start_utf16)).toEqual([10, 13]);
    expect(result.value.offsetMap[7]).toEqual({ start_utf16: 7, end_utf16: 9 });
    expect(result.value.offsetMap[8]).toEqual({ start_utf16: 7, end_utf16: 9 });
  });

  // BR-008: every token, including punctuation, has contract-valid original evidence.
  it("provides a complete code-unit map and valid evidence for every token", () => {
    const source = "[MOCK] 🧪 কো, বয়স ১৩।";
    const result = normaliseText(source);
    expect(result.status).toBe("known");
    if (result.status !== "known") return;
    expect(result.value.offsetMap).toHaveLength(result.value.normalisedText.length);
    expect(result.value.tokens.length).toBeGreaterThan(0);
    for (const token of result.value.tokens) {
      expect(evidenceSpanSchema.safeParse(token.evidence).success).toBe(true);
      expect(source.slice(token.evidence.start_utf16, token.evidence.end_utf16)).toBe(token.evidence.quote);
      expect(result.value.normalisedText.slice(token.start_utf16, token.end_utf16)).toBe(token.text);
    }
  });

  // FR-003, COMP-008: unsupported numeral scripts remain text, never guessed digits.
  it("leaves other numeral scripts unchanged", () => {
    const result = normaliseText("[MOCK] ٣ ² １３");
    expect(result.status === "known" && result.value.normalisedText).toBe("[MOCK] ٣ ² １３");
  });

  // COMP-008: deterministic normalisation has no cumulative changes.
  it("is idempotent", () => {
    const first = normaliseText("[MOCK] ক\u09c7\u09be ১৩");
    expect(first.status).toBe("known");
    if (first.status !== "known") return;
    const second = normaliseText(first.value.normalisedText);
    expect(second.status === "known" && second.value.normalisedText).toBe(first.value.normalisedText);
  });

  // BR-008: blank input has no asserted facts or evidence.
  it("returns explicit unknown for empty or whitespace-only input", () => {
    for (const source of ["", " \t\n"]) expect(normaliseText(source)).toMatchObject({ status: "unknown", value: null, evidence: [] });
  });

  // Frozen EvidenceSpan and noNulString: invalid source cannot produce evidence.
  it("rejects NUL, unpaired surrogates and source beyond the frozen offset limit", () => {
    for (const source of ["[MOCK]\0", "[MOCK] \ud800", "[MOCK] \udc00", "x".repeat(4001)]) {
      expect(normaliseText(source)).toMatchObject({ status: "unknown", reason: "invalid_source" });
    }
  });

  // EvidenceSpan.quote has a 500-character cap; no overlong evidence is emitted.
  it("returns unknown if a single token cannot fit an evidence quote", () => {
    expect(normaliseText("ক".repeat(501))).toMatchObject({ status: "unknown" });
  });

  // NFR-002, D2B §10, security review P2: maximum-size intake must not amplify Unicode work per token.
  it("bounds segmentation work for a maximum-length source with many short tokens", () => {
    const source = `[MOCK] ${"ক ".repeat(1996)}ক`;
    const original = Intl.Segmenter.prototype.segment;
    let segmentedUnits = 0;
    const segment = vi.spyOn(Intl.Segmenter.prototype, "segment").mockImplementation(function (this: Intl.Segmenter, input: string) {
      segmentedUnits += input.length;
      return original.call(this, input);
    });
    try {
      const result = normaliseText(source);
      expect(source).toHaveLength(4000);
      expect(result.status).toBe("known");
      if (result.status !== "known") return;
      expect(result.value.tokens).toHaveLength(1998);
      expect(result.value.tokens.at(-1)?.evidence).toMatchObject({ quote: "ক", start_utf16: 3999, end_utf16: 4000 });
      expect(segmentedUnits).toBeLessThanOrEqual(source.length * 2);
    } finally {
      segment.mockRestore();
    }
  });
});

describe("evidenceForRange", () => {
  // BR-008, Bengali conjuncts: the runtime must retain the base conjunct as one grapheme.
  it("segments ক্ষ as one Bangla grapheme", () => {
    const segmenter = new Intl.Segmenter("bn", { granularity: "grapheme" });
    expect(Array.from(segmenter.segment("ক্ষ"), ({ segment, index }) => ({ segment, index }))).toEqual([{ segment: "ক্ষ", index: 0 }]);
  });

  // BR-008, D2A §2.1: normalised ranges resolve to raw spelling after NFC length changes.
  it("maps a selected numeric range after NFC back to the raw digits", () => {
    const result = normaliseText("[MOCK] ক\u09c7\u09be ১৩");
    expect(result.status).toBe("known");
    if (result.status !== "known") return;
    expect(evidenceForRange(result.value, { start_utf16: 10, end_utf16: 12 })).toEqual({
      status: "known", value: "13", evidence: [{ quote: "১৩", start_utf16: 11, end_utf16: 13, derivation: "digits" }],
    });
  });

  // BR-008: evidence spanning several tokens includes their original whitespace.
  it("can map a whole multi-token phrase", () => {
    const result = normaliseText("[MOCK] গতকাল বিকেলে");
    expect(result.status).toBe("known");
    if (result.status !== "known") return;
    expect(evidenceForRange(result.value, { start_utf16: 7, end_utf16: result.value.normalisedText.length }))
      .toMatchObject({ status: "known", evidence: [{ quote: "গতকাল বিকেলে", start_utf16: 7, derivation: "direct" }] });
  });

  // BR-008, OD-012-1: neither TypeScript nor an extra JavaScript argument may supply false provenance.
  it.each([
    ["১৩", "direct", "13", "digits"],
    ["নাম", "romanisation", "নাম", "direct"],
  ] as const)("derives provenance from %s despite an attempted %s label", (quote, attempted, value, derivation) => {
    expectTypeOf(evidenceForRange).parameters.toEqualTypeOf<[NormalisedText, Utf16Range]>();
    const result = normaliseText(`[MOCK] ${quote}`);
    expect(result.status).toBe("known");
    if (result.status !== "known") return;
    const range = { start_utf16: 7, end_utf16: result.value.normalisedText.length };
    expect(Reflect.apply(evidenceForRange, undefined, [result.value, range, attempted])).toEqual({
      status: "known", value, evidence: [{ quote, start_utf16: 7, end_utf16: 7 + quote.length, derivation }],
    });
  });

  // BR-008: source evidence must retain complete conjuncts, join controls and decomposed nukta.
  it.each(["ক্ষ", "ক্\u200dষ", "ক্\u200cষ", "ড\u09bc"])("rejects every internal start/end boundary in %s", (cluster) => {
    const result = normaliseText(`[MOCK] ${cluster}`);
    expect(result.status).toBe("known");
    if (result.status !== "known") return;
    const end_utf16 = result.value.normalisedText.length;
    for (let split = 8; split < end_utf16; split++) {
      expect(evidenceForRange(result.value, { start_utf16: 7, end_utf16: split })).toEqual({ status: "unknown", value: null, evidence: [], reason: "invalid_range" });
      expect(evidenceForRange(result.value, { start_utf16: split, end_utf16 })).toEqual({ status: "unknown", value: null, evidence: [], reason: "invalid_range" });
    }
    expect(evidenceForRange(result.value, { start_utf16: 7, end_utf16 })).toMatchObject({ status: "known", value: cluster, evidence: [{ quote: cluster }] });
  });

  // BR-008, EvidenceSpan: invalid or partial-grapheme ranges cannot support a value.
  it("rejects reversed, empty, fractional, out-of-range and split-grapheme ranges", () => {
    const result = normaliseText("[MOCK] 🧪 কো");
    expect(result.status).toBe("known");
    if (result.status !== "known") return;
    for (const [start_utf16, end_utf16] of [[9, 7], [7, 7], [-1, 2], [0.5, 2], [0, 99], [7, 8], [11, 12]]) {
      expect(evidenceForRange(result.value, { start_utf16, end_utf16 })).toMatchObject({ status: "unknown" });
    }
  });
});

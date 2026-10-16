import { describe, expect, it } from "vitest";
import { evidenceSpanSchema, phoneSchema } from "@/contracts";
import { normalisePhone } from "@/server/normalise";

const fromFixture = (phone: string) => {
  const source = `[MOCK] নম্বর ${phone}`;
  return normalisePhone(source, { start_utf16: source.length - phone.length, end_utf16: source.length });
};

describe("normalisePhone", () => {
  // TC-002, BR-016: the pack's synthetic phone normalises Bangla digits.
  it("normalises the TC-002 fixture with original evidence", () => {
    const result = fromFixture("০১৭১১২২৩৩৪৪");
    expect(result).toMatchObject({ status: "known", value: "01711223344", evidence: [{ quote: "০১৭১১২২৩৩৪৪", derivation: "digits" }] });
    if (result.status === "known") {
      expect(phoneSchema.parse(result.value)).toBe(result.value);
      expect(evidenceSpanSchema.safeParse(result.evidence[0]).success).toBe(true);
    }
  });

  // BR-016: Latin input already in the canonical phone format is direct evidence.
  it("accepts Latin digits without claiming digit conversion", () => {
    expect(fromFixture("01711223344")).toMatchObject({ status: "known", value: "01711223344", evidence: [{ derivation: "direct" }] });
  });

  // FR-003: mixed Bangla and Latin digits normalise deterministically.
  it("accepts mixed digits", () => {
    expect(fromFixture("০1৭1১২২33৪4")).toMatchObject({ status: "known", value: "01711223344" });
  });

  // Frozen phoneSchema: whitespace, parentheses, dots and hyphens are permitted separators.
  it("uses the contract's separator rules and preserves the complete quote", () => {
    expect(fromFixture("(০১৭১১) ২২-৩৩.৪৪")).toMatchObject({
      status: "known", value: "01711223344", evidence: [{ quote: "(০১৭১১) ২২-৩৩.৪৪", derivation: "digits" }],
    });
  });

  // TC-030: the short phone example must stay unknown.
  it("leaves a short phone unknown", () => {
    expect(fromFixture("0171")).toMatchObject({ status: "unknown", value: null, evidence: [] });
  });

  // BR-016: canonical phone length is exactly eleven digits.
  it("rejects a longer phone rather than extracting a valid-looking substring", () => {
    expect(fromFixture("017112233440")).toMatchObject({ status: "unknown" });
  });

  // BR-016: phones start 01; contract does not impose an operator allowlist.
  it("enforces the stated prefix without adding operator assumptions", () => {
    expect(fromFixture("02711223344")).toMatchObject({ status: "unknown" });
    expect(fromFixture("01111223344")).toMatchObject({ status: "known", value: "01111223344" });
  });

  // BR-008/016: the pack and frozen phoneSchema do not define country-prefix conversion.
  it("does not invent international-prefix formats", () => {
    for (const phone of ["+8801711223344", "8801711223344", "008801711223344"]) {
      expect(fromFixture(phone)).toMatchObject({ status: "unknown", evidence: [] });
    }
  });

  // COMP-008, BR-008: unsupported glyphs are never silently removed.
  it("rejects letters, other digit scripts and invisible insertions", () => {
    for (const phone of ["01711x23344", "01711\u200d223344", "01711\u200c223344", "01711\u200b223344", "٠1711223344"]) {
      expect(fromFixture(phone)).toMatchObject({ status: "unknown", evidence: [] });
    }
  });

  // Frozen phoneSchema: inputs longer than 32 characters fail before separator removal.
  it("respects the contract input cap", () => {
    expect(fromFixture(`01711${" ".repeat(30)}223344`)).toMatchObject({ status: "unknown" });
  });

  // BR-008, EvidenceSpan: field evidence selects the caller's occurrence in UTF-16.
  it("uses an explicit range after a supplementary character", () => {
    const source = "[MOCK] 🧪 নম্বর ০১৭১১২২৩৩৪৪";
    const start_utf16 = source.indexOf("০১৭");
    expect(normalisePhone(source, { start_utf16, end_utf16: source.length })).toMatchObject({
      status: "known", evidence: [{ start_utf16, end_utf16: source.length, quote: "০১৭১১২২৩৩৪৪" }],
    });
  });

  // BR-008: invalid source ranges cannot produce a derived phone.
  it("rejects an invalid field range", () => {
    expect(normalisePhone("[MOCK]", { start_utf16: -1, end_utf16: 4 })).toMatchObject({ status: "unknown", reason: "invalid_range" });
  });
});

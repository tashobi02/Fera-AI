import { describe, expect, it } from "vitest";
import { dualNumerals, localizeDigits, toBanglaDigits, toLatinDigits } from "@/lib/numerals";

describe("toBanglaDigits", () => {
  it("maps every Latin digit", () => {
    expect(toBanglaDigits("0123456789")).toBe("০১২৩৪৫৬৭৮৯");
  });

  it("accepts numbers and keeps signs, separators and text", () => {
    expect(toBanglaDigits(13219)).toBe("১৩২১৯");
    expect(toBanglaDigits(-4.5)).toBe("-৪.৫");
    expect(toBanglaDigits("F-2026-07")).toBe("F-২০২৬-০৭");
    expect(toBanglaDigits("নম্বর 12")).toBe("নম্বর ১২");
  });

  it("is idempotent", () => {
    expect(toBanglaDigits(toBanglaDigits("42"))).toBe("৪২");
  });
});

describe("toLatinDigits", () => {
  it("maps every Bangla digit", () => {
    expect(toLatinDigits("০১২৩৪৫৬৭৮৯")).toBe("0123456789");
  });

  it("round-trips with toBanglaDigits", () => {
    expect(toLatinDigits(toBanglaDigits("16:00–16:45"))).toBe("16:00–16:45");
  });
});

describe("localizeDigits", () => {
  it("uses Bangla numerals in Bangla mode", () => {
    expect(localizeDigits(13, "bn")).toBe("১৩");
  });

  it("uses Latin numerals in English mode, even for Bangla input", () => {
    expect(localizeDigits(13, "en")).toBe("13");
    expect(localizeDigits("১৩", "en")).toBe("13");
  });
});

describe("dualNumerals", () => {
  it("shows both scripts for officer screens", () => {
    expect(dualNumerals(13)).toBe("১৩ / 13");
    expect(dualNumerals("১৩")).toBe("১৩ / 13");
  });

  it("does not duplicate text without digits", () => {
    expect(dualNumerals("—")).toBe("—");
  });
});

describe("edge cases", () => {
  it("handles zero and the empty string", () => {
    expect(toBanglaDigits(0)).toBe("০");
    expect(localizeDigits("", "bn")).toBe("");
    expect(dualNumerals(0)).toBe("০ / 0");
  });

  it("refuses non-finite numbers instead of printing them", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => toBanglaDigits(value)).toThrow(RangeError);
      expect(() => localizeDigits(value, "en")).toThrow(RangeError);
      expect(() => dualNumerals(value)).toThrow(RangeError);
    }
  });

  it("converts only digits in mixed Bangla and Latin text", () => {
    expect(localizeDigits("মামলা M-12, বয়স ৭", "bn")).toBe("মামলা M-১২, বয়স ৭");
    expect(localizeDigits("মামলা M-12, বয়স ৭", "en")).toBe("মামলা M-12, বয়স 7");
  });

  it("leaves Bengali letters outside the digit block untouched (U+09F0)", () => {
    expect(toLatinDigits("ৰৱ")).toBe("ৰৱ");
    expect(toBanglaDigits("ৰ")).toBe("ৰ");
  });
});

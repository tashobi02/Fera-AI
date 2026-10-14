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

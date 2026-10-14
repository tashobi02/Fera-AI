import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, resolveLocale } from "@/lib/locale";

describe("resolveLocale", () => {
  it("defaults to Bangla (FR-033)", () => {
    expect(DEFAULT_LOCALE).toBe("bn");
    expect(resolveLocale(undefined)).toBe("bn");
    expect(resolveLocale(null)).toBe("bn");
    expect(resolveLocale("")).toBe("bn");
  });

  it("accepts exactly the supported codes", () => {
    expect(resolveLocale("bn")).toBe("bn");
    expect(resolveLocale("en")).toBe("en");
  });

  it("falls back to Bangla for anything else", () => {
    for (const value of ["EN", "en-US", " en", "fr", "bn-BD", 1, {}, ["en"]]) {
      expect(resolveLocale(value)).toBe("bn");
    }
  });
});

describe("isLocale", () => {
  it("narrows only bn and en", () => {
    expect(isLocale("bn")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
  });
});

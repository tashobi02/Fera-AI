import { describe, expect, it } from "vitest";
import { languageNames, locales } from "@/locales";

describe("locales", () => {
  it("defines every key in both Bangla and English", () => {
    expect(Object.keys(locales.en).sort()).toEqual(Object.keys(locales.bn).sort());
  });

  it("has no empty strings", () => {
    for (const lang of [locales.bn, locales.en]) {
      for (const value of Object.values(lang)) expect(value.trim()).not.toBe("");
    }
  });

  it("keeps the D4 §15.1 demo banner copy exact", () => {
    expect(locales.bn.demoBanner).toBe("সিনথেটিক তথ্য · কর্মকর্তা যাচাই সিমুলেশন");
    expect(locales.en.demoBanner).toBe("Synthetic data · officer verification simulated");
  });

  it("names the COMP-022 toggle options exactly as D3 shows them", () => {
    expect(`${languageNames.bn} | ${languageNames.en}`).toBe("বাংলা | English");
  });

  it("uses Bangla numerals, never Latin digits, in Bangla strings", () => {
    for (const value of Object.values(locales.bn)) expect(value).not.toMatch(/[0-9]/);
  });
});

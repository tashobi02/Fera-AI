import { describe, expect, it } from "vitest";
import { locales } from "@/locales";

describe("locales", () => {
  it("defines every key in both Bangla and English", () => {
    expect(Object.keys(locales.en).sort()).toEqual(Object.keys(locales.bn).sort());
  });

  it("has no empty strings", () => {
    for (const lang of [locales.bn, locales.en]) {
      for (const value of Object.values(lang)) expect(value.trim()).not.toBe("");
    }
  });
});

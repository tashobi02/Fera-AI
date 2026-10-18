import { describe, expect, it } from "vitest";
import { visibleLength } from "@/lib/visible-text";

describe("visibleLength", () => {
  it("does not count whitespace or invisible format characters", () => {
    expect(visibleLength("  a b  ")).toBe(2);
    expect(visibleLength("​​​")).toBe(0);
    expect(visibleLength("﻿­⁠")).toBe(0);
  });
  it("counts Bangla letters by code point and ignores ZWNJ/ZWJ", () => {
    expect(visibleLength("কি")).toBe(2);
    expect(visibleLength("র‌শ")).toBe(2);
  });
});

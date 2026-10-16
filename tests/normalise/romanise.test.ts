import { describe, expect, it } from "vitest";
import { romaniseName } from "@/server/normalise";

describe("romaniseName", () => {
  // D2A A-033, BR-008: no transliteration table is supplied, so no name_latin is invented.
  it("returns explicit unknown for the pack's synthetic Bangla name", () => {
    const source = "[MOCK] রাফি";
    expect(romaniseName(source, { start_utf16: 7, end_utf16: source.length })).toEqual({
      status: "unknown", value: null, evidence: [], reason: "romanisation_unspecified",
    });
  });

  // D2A A-033, BR-008: Unicode variants do not authorise a speculative romanisation scheme.
  it("keeps nukta and joiner names unknown", () => {
    for (const name of ["\u09df", "য\u09bc", "\u09dc", "ড\u09bc", "ক্\u200dষ"]) {
      expect(romaniseName(`[MOCK] ${name}`, { start_utf16: 7, end_utf16: 7 + name.length })).toMatchObject({ status: "unknown", reason: "romanisation_unspecified" });
    }
  });

  // BR-008, task instruction: this API does not claim a scheme even for mixed-script input.
  it("does not infer a Latin name from mixed or Latin-only text", () => {
    for (const name of ["[MOCK] Rafi", "[MOCK] রাফি Rafi"]) expect(romaniseName(name, { start_utf16: 0, end_utf16: name.length })).toMatchObject({ status: "unknown", evidence: [] });
  });

  // BR-008: a field without a valid source range cannot be used for name evidence.
  it("rejects invalid evidence ranges", () => {
    expect(romaniseName("[MOCK]", { start_utf16: 3, end_utf16: 99 })).toMatchObject({ status: "unknown", reason: "invalid_range" });
  });
});

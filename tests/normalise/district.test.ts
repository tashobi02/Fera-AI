import { describe, expect, it, vi } from "vitest";
import { normaliseDistrict, type DistrictLookup } from "@/server/normalise";
import { districtLookup } from "./fixtures";

const fromFixture = (phrase: string, lookup = districtLookup) => normaliseDistrict(phrase, { start_utf16: 0, end_utf16: phrase.length }, lookup);

describe("normaliseDistrict", () => {
  // COMP-008, BR-008: a supplied Bangla district name maps to its internal fixture code.
  it("resolves a Bangla name with source evidence", () => {
    expect(fromFixture("[MOCK] জেলা ১")).toEqual({ status: "known", value: 1, evidence: [{ quote: "[MOCK] জেলা ১", start_utf16: 0, end_utf16: 13, derivation: "district_mapping" }] });
  });

  // COMP-008: English names use the same injectable lookup.
  it("resolves an English name case-insensitively", () => {
    expect(fromFixture("  [MOCK] DISTRICT 4  ")).toMatchObject({ status: "known", value: 4 });
  });

  // COMP-008, TASK-009 handoff: only explicitly supplied fixture aliases can resolve.
  it("resolves a supplied alias", () => {
    expect(fromFixture("[MOCK] alias one")).toMatchObject({ status: "known", value: 1 });
  });

  // D2B §10 NFC, BR-008: canonically equivalent nukta spellings share lookup keys.
  it("looks up decomposed and precomposed ড় and য় aliases", () => {
    expect(fromFixture("[MOCK] ব\u09dc জেলা")).toMatchObject({ status: "known", value: 2 });
    expect(fromFixture("[MOCK] \u09df জেলা")).toMatchObject({ status: "known", value: 3 });
  });

  // TASK-009 handoff: index keys must match the NFC, trimmed, lower-case lookup argument.
  it("passes a canonical key to the supplied lookup", () => {
    const lookup = vi.fn(() => [{ code: 3 }]);
    expect(fromFixture("  [MOCK] \u09df DISTRICT  ", { lookup })).toMatchObject({ status: "known", value: 3 });
    expect(lookup).toHaveBeenCalledExactlyOnceWith("[mock] য\u09bc district");
  });

  // BR-008/015: a place mention cannot supply an unlisted district or alias.
  it("leaves unknown and partial place text unresolved", () => {
    for (const phrase of ["XYZ", "মিরপুর", "near [MOCK] District 1", "[MOCK] জেলা ১ অথবা [MOCK] জেলা ২"]) {
      expect(fromFixture(phrase)).toMatchObject({ status: "unknown", reason: "unresolved", value: null, evidence: [] });
    }
  });

  // COMP-008, BR-008: an alias shared by two district codes is ambiguous.
  it("leaves a shared alias unknown", () => {
    expect(fromFixture("[MOCK] shared")).toMatchObject({ status: "unknown", reason: "ambiguous", evidence: [] });
  });

  // BR-008: repeated lookup rows for one internal code do not create a second district.
  it("deduplicates the same code returned through multiple aliases", () => {
    expect(fromFixture("[MOCK] alias one", { lookup: () => [{ code: 1 }, { code: 1 }] })).toMatchObject({ status: "known", value: 1 });
  });

  // BR-016, districtCodeSchema: internal codes must be integers from 1 to 64.
  it("rejects invalid lookup codes rather than filtering them into a false unique match", () => {
    for (const code of [0, 65, 1.5, Number.NaN]) {
      const lookup: DistrictLookup = { lookup: () => [{ code: 1 }, { code }] };
      expect(fromFixture("[MOCK] alias one", lookup)).toMatchObject({ status: "unknown", reason: "invalid_district" });
    }
  });

  // TASK-009 handoff, BR-008: no production district list or fallback is embedded.
  it("works with an empty replacement lookup without guessing", () => {
    expect(fromFixture("[MOCK] District 1", { lookup: () => [] })).toMatchObject({ status: "unknown", reason: "unresolved" });
  });

  // BR-008: zero-width join controls are not silently removed to force a district match.
  it("keeps a zero-width alteration unresolved", () => {
    expect(fromFixture("[MOCK] Di\u200dstrict 1")).toMatchObject({ status: "unknown", reason: "unresolved" });
  });

  // BR-008, EvidenceSpan: a selected district mention keeps its own raw source offsets.
  it("resolves an explicitly selected range after an emoji", () => {
    const source = "[MOCK] 🧪 [MOCK] District 3";
    expect(normaliseDistrict(source, { start_utf16: 10, end_utf16: source.length }, districtLookup)).toMatchObject({
      status: "known", value: 3, evidence: [{ start_utf16: 10, quote: "[MOCK] District 3" }],
    });
  });

  // BR-008: reject partial Bangla units before a permissive lookup can turn them into a district.
  it.each(["ক্ষ", "ক্\u200dষ", "ক্\u200cষ", "ড\u09bc"])("rejects every internal start/end boundary in %s before lookup", (cluster) => {
    const source = `[MOCK] ${cluster}`;
    const lookup = vi.fn(() => [{ code: 1 }]);
    for (let split = 8; split < source.length; split++) {
      expect(normaliseDistrict(source, { start_utf16: 7, end_utf16: split }, { lookup })).toEqual({ status: "unknown", value: null, evidence: [], reason: "invalid_range" });
      expect(normaliseDistrict(source, { start_utf16: split, end_utf16: source.length }, { lookup })).toEqual({ status: "unknown", value: null, evidence: [], reason: "invalid_range" });
    }
    expect(lookup).not.toHaveBeenCalled();
    expect(normaliseDistrict(source, { start_utf16: 7, end_utf16: source.length }, { lookup })).toMatchObject({ status: "known", value: 1, evidence: [{ quote: cluster }] });
  });
});

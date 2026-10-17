// TASK-018 duplicate detector: pure decision-helper unit tests (BR-021, TC-013, TC-038).
// No database; only the rule logic, the field-agreement helpers and the similarity gate.
// Synthetic data only.
import { describe, expect, it } from "vitest";
import {
  SIMILARITY_THRESHOLD,
  agesAgree,
  computeAgreement,
  decideDuplicateRule,
  districtsAgree,
  namesAgree,
  phonesAgree,
  sexesAgree,
  timesAgree,
  type FieldAgreement,
  type SimilarCase,
  type SourceCase,
} from "@/server/duplicates";

const allFalse: FieldAgreement = {
  name: false, age: false, sex: false, district: false, time: false, phone: false,
};

function makeSource(over: Partial<SourceCase> = {}): SourceCase {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "missing",
    child_name: "[MOCK] Source",
    age_years: 8,
    age_min: 8,
    age_max: 8,
    sex: "female",
    district_code: 1,
    event_at: "2026-10-17T08:00:00+06:00",
    event_at_lower: "2026-10-17T07:00:00+06:00",
    event_at_upper: "2026-10-17T09:00:00+06:00",
    contact_phone: "01700000001",
    ...over,
  };
}

function makeCandidate(over: Partial<SimilarCase> = {}): SimilarCase {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    distance: 0.1,
    child_name: "[MOCK] Source",
    age_years: 8,
    age_min: 8,
    age_max: 8,
    sex: "female",
    district_code: 1,
    event_at: "2026-10-17T08:00:00+06:00",
    event_at_lower: "2026-10-17T07:00:00+06:00",
    event_at_upper: "2026-10-17T09:00:00+06:00",
    contact_phone: "01700000002",
    ...over,
  };
}

describe("TASK-018 decideDuplicateRule (pure)", () => {
  it("returns null when similarity is below the threshold", () => {
    expect(decideDuplicateRule(SIMILARITY_THRESHOLD - 0.01, { ...allFalse, name: true })).toBeNull();
  });

  it("returns null at the threshold boundary when no field agrees", () => {
    // similarity exactly equal to threshold passes the gate, but no profile field matches.
    expect(decideDuplicateRule(SIMILARITY_THRESHOLD, allFalse)).toBeNull();
  });

  it("returns 'profile' when similarity is high and the name agrees", () => {
    expect(decideDuplicateRule(0.9, { ...allFalse, name: true })).toBe("profile");
  });

  it("returns 'profile' when similarity is high and the age interval overlaps", () => {
    expect(decideDuplicateRule(0.9, { ...allFalse, age: true })).toBe("profile");
  });

  it("returns 'profile' when similarity is high and the sex agrees", () => {
    expect(decideDuplicateRule(0.9, { ...allFalse, sex: true })).toBe("profile");
  });

  it("returns 'profile' when similarity is high and the district agrees", () => {
    expect(decideDuplicateRule(0.9, { ...allFalse, district: true })).toBe("profile");
  });

  it("returns 'profile' when similarity is high and the event time overlaps", () => {
    expect(decideDuplicateRule(0.9, { ...allFalse, time: true })).toBe("profile");
  });

  // BR-021 / TC-038: a shared phone number ALONE never links two reports.
  it("never returns a rule when only the phone agrees (BR-021, TC-038)", () => {
    expect(decideDuplicateRule(0.99, { ...allFalse, phone: true })).toBeNull();
    // even with phoneOnly opt-in, the schema's same_phone rule still cannot be
    // confirmed_same — but it may exist as a weak flagged cue. That path is not
    // produced by detectDuplicates; only the caller may invoke it.
    expect(decideDuplicateRule(0.99, { ...allFalse, phone: true }, { phoneOnly: true })).toBe("same_phone");
  });

  it("returns 'profile' when phone and one profile field agree (phone alone is not the trigger)", () => {
    expect(decideDuplicateRule(0.9, { ...allFalse, phone: true, district: true })).toBe("profile");
  });

  it("unknown fields never agree (null name, null district, null time interval, null age, unknown sex)", () => {
    const source = makeSource({
      child_name: null, district_code: null,
      event_at_lower: null, event_at_upper: null,
      age_years: null, age_min: null, age_max: null,
      sex: "unknown",
    });
    const candidate = makeCandidate({
      child_name: null, district_code: null,
      event_at_lower: null, event_at_upper: null,
      age_years: null, age_min: null, age_max: null,
      sex: "unknown",
    });
    const agreement = computeAgreement(source, candidate);
    expect(agreement.name).toBe(false);
    expect(agreement.district).toBe(false);
    expect(agreement.time).toBe(false);
    expect(agreement.sex).toBe(false);
    expect(agreement.age).toBe(false);
  });
});

describe("TASK-018 field agreement helpers", () => {
  it("namesAgree: trims and lowercases; null never agrees", () => {
    expect(namesAgree("Rafi", "  rafi  ")).toBe(true);
    expect(namesAgree("Rafi", "Rimon")).toBe(false);
    expect(namesAgree(null, "Rafi")).toBe(false);
    expect(namesAgree("", "Rafi")).toBe(false);
  });

  it("agesAgree: exact year match, interval overlap, and unknown handling", () => {
    // exact year
    expect(agesAgree(8, 8, 8, 8, 8, 8)).toBe(true);
    // interval overlap
    expect(agesAgree(null, 7, 9, null, 8, 10)).toBe(true);
    expect(agesAgree(null, 7, 8, null, 9, 10)).toBe(false);
    // all nulls = unknown = no agreement
    expect(agesAgree(null, null, null, null, null, null)).toBe(false);
    // one side unknown = no agreement
    expect(agesAgree(8, 8, 8, null, null, null)).toBe(false);
  });

  it("sexesAgree: 'unknown' on either side never agrees; equal non-unknown does", () => {
    expect(sexesAgree("female", "female")).toBe(true);
    expect(sexesAgree("female", "male")).toBe(false);
    expect(sexesAgree("unknown", "female")).toBe(false);
    expect(sexesAgree("female", "unknown")).toBe(false);
  });

  it("districtsAgree: equal non-null codes agree; null never agrees", () => {
    expect(districtsAgree(1, 1)).toBe(true);
    expect(districtsAgree(1, 2)).toBe(false);
    expect(districtsAgree(null, 1)).toBe(false);
    expect(districtsAgree(null, null)).toBe(false);
  });

  it("timesAgree: overlapping intervals agree; disjoint do not; nulls never agree", () => {
    const a = "2026-10-17T07:00:00+06:00";
    const b = "2026-10-17T08:00:00+06:00";
    const c = "2026-10-17T09:00:00+06:00";
    const d = "2026-10-17T10:00:00+06:00";
    expect(timesAgree(a, c, b, d)).toBe(true); // overlap
    expect(timesAgree(a, b, c, d)).toBe(false); // disjoint
    expect(timesAgree(null, c, b, d)).toBe(false);
    expect(timesAgree(a, null, b, d)).toBe(false);
  });

  it("phonesAgree: equal non-null phones agree; null never agrees", () => {
    expect(phonesAgree("01700000001", "01700000001")).toBe(true);
    expect(phonesAgree("01700000001", "01700000002")).toBe(false);
    expect(phonesAgree(null, "01700000001")).toBe(false);
    expect(phonesAgree(null, null)).toBe(false);
  });

  it("computeAgreement composes all five profile-field checks", () => {
    const source = makeSource();
    const candidate = makeCandidate();
    const a = computeAgreement(source, candidate);
    expect(a).toEqual({
      name: true, age: true, sex: true, district: true, time: true, phone: false,
    });
  });
});

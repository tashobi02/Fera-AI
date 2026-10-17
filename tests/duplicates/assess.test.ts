// TASK-018 / COMP-013 pure rules (BR-021, TC-013, TC-038). No database. The thresholds under
// test are UNCALIBRATED A-014/A-029 placeholders; these tests pin the RULES (windows, phone is
// a weak cue only), not any accuracy.
import { describe, expect, it } from "vitest";
import { DUPLICATE_PARAMS, assessPair, type CaseProfile } from "../../src/server/duplicates";

const base: CaseProfile = {
  id: "00000000-0000-4000-8000-000000000001",
  refCode: "M-AAAAAA",
  kind: "missing",
  status: "open",
  anonymised: false,
  sex: "female",
  ageMin: 11,
  ageMax: 11,
  nameBn: "মীম",
  nameLatin: "Mim",
  clothing: "নীল জামা ও লাল জিন্স",
  marks: "চোখের নিচে কালো দাগ",
  placeText: "গাজীপুর টঙ্গী বাজার",
  districtCode: 19,
  eventLower: new Date("2026-10-06T13:00:00+06:00"),
  eventUpper: new Date("2026-10-06T17:00:00+06:00"),
  phone: "01200000100",
};
const other = (over: Partial<CaseProfile> = {}): CaseProfile => ({ ...base, id: "00000000-0000-4000-8000-000000000002", refCode: "M-BBBBBB", ...over });
const cues = (r: ReturnType<typeof assessPair>) => r.evidence.map((e) => e.cue);

describe("age window (A-014 provisional: +-1 year)", () => {
  it("accepts a 1 year gap and rejects 2 when both ages are known", () => {
    const one = assessPair(base, other({ ageMin: 12, ageMax: 12 }), null);
    expect(one.rejected).toBeNull();
    const two = assessPair(base, other({ ageMin: 13, ageMax: 13 }), null);
    expect(two.rejected).toBe("age_window");
    expect(two.link).toBe(false);
  });
  it("compares ranges: overlapping ranges are fine, a 2 year gap between ranges is not", () => {
    expect(assessPair({ ...base, ageMin: 7, ageMax: 10 }, other({ ageMin: 7, ageMax: 9 }), null).rejected).toBeNull();
    expect(assessPair({ ...base, ageMin: 7, ageMax: 9 }, other({ ageMin: 11, ageMax: 14 }), null).rejected).toBe("age_window");
  });
  it("allows an unknown age and lists it as unknown", () => {
    const r = assessPair(base, other({ ageMin: null, ageMax: null }), null);
    expect(r.rejected).toBeNull();
    expect(r.unknown).toContain("age");
  });
});

describe("event time window (A-014 provisional: 72 h between intervals)", () => {
  const at = (iso: string) => ({ eventLower: new Date(iso), eventUpper: new Date(iso) });
  it("accepts exactly 72 h and rejects 72 h + 1 s", () => {
    const a = { ...base, ...at("2026-10-01T00:00:00Z") };
    expect(assessPair(a, other(at("2026-10-04T00:00:00Z")), null).rejected).toBeNull();
    expect(assessPair(a, other(at("2026-10-04T00:00:01Z")), null).rejected).toBe("time_window");
  });
  it("compares intervals by their nearest edges, and overlapping intervals are distance 0", () => {
    const a = { ...base, eventLower: new Date("2026-10-01T00:00:00Z"), eventUpper: new Date("2026-10-02T00:00:00Z") };
    // gap = 72 h from a's upper edge
    expect(assessPair(a, other(at("2026-10-05T00:00:00Z")), null).rejected).toBeNull();
    expect(assessPair(a, other(at("2026-10-05T00:00:01Z")), null).rejected).toBe("time_window");
    expect(assessPair(a, other(at("2026-10-01T12:00:00Z")), null).rejected).toBeNull();
  });
  it("allows an unknown time and lists it as unknown", () => {
    const r = assessPair(base, other({ eventLower: null, eventUpper: null }), null);
    expect(r.rejected).toBeNull();
    expect(r.unknown).toContain("time");
  });
});

describe("hard exclusions", () => {
  it("rejects a kind mismatch", () => {
    const r = assessPair(base, other({ kind: "found" }), null);
    expect(r.rejected).toBe("kind");
    expect(r.link).toBe(false);
  });
  it("rejects a redacted or terminal report on either side", () => {
    expect(assessPair(base, other({ anonymised: true }), null).rejected).toBe("not_live");
    expect(assessPair({ ...base, anonymised: true }, other(), null).rejected).toBe("not_live");
    for (const status of ["confirmed", "closed", "referred"] as const) {
      expect(assessPair(base, other({ status }), null).rejected).toBe("not_live");
    }
  });
  it("rejects a known sex conflict but not unknown sex", () => {
    expect(assessPair(base, other({ sex: "male" }), null).rejected).toBe("sex_conflict");
    expect(assessPair(base, other({ sex: "unknown" }), null).rejected).toBeNull();
  });
  it("never links a case to itself", () => {
    expect(assessPair(base, base, null).rejected).toBe("same_case");
  });
});

describe("phone is a weak cue only (TC-038)", () => {
  const stranger: Partial<CaseProfile> = {
    sex: "male", ageMin: 11, ageMax: 11, nameBn: "রহিম", nameLatin: "Rahim", clothing: "সবুজ শার্ট", marks: null, placeText: "খুলনা সদর", districtCode: 32,
    eventLower: new Date("2026-10-06T14:00:00+06:00"), eventUpper: new Date("2026-10-06T14:00:00+06:00"),
  };
  it("a shared phone with nothing else never links", () => {
    const r = assessPair({ ...base, sex: "unknown", nameBn: null, nameLatin: null, clothing: null, marks: null, placeText: null, districtCode: null },
      other({ ...stranger, sex: "unknown", nameBn: null, nameLatin: null, clothing: null, marks: null, placeText: null, districtCode: null }), null);
    expect(cues(r)).toContain("phone_shared_weak");
    expect(r.link).toBe(false);
    expect(r.rejected).toBeNull();
  });
  it("different children with a shared phone stay unlinked (siblings/shelter)", () => {
    const r = assessPair(base, other({ ...stranger, sex: "female" }), 0.5);
    expect(cues(r)).toContain("phone_shared_weak");
    expect(r.link).toBe(false);
  });
  it("a shared phone is listed as a zero-point cue and never moves the stored score", () => {
    const a = { ...base, nameBn: null, nameLatin: null, clothing: null, marks: null };
    const sharedPhone = assessPair(a, other({ nameBn: null, nameLatin: null, clothing: null, marks: null }), null);
    const differentPhone = assessPair(a, other({ nameBn: null, nameLatin: null, clothing: null, marks: null, phone: "01200000999" }), null);
    expect(sharedPhone.evidence.find((e) => e.cue === "phone_shared_weak")).toEqual({ cue: "phone_shared_weak", points: 0 });
    expect(differentPhone.evidence.some((e) => e.cue === "phone_shared_weak")).toBe(false);
    expect(sharedPhone.score).toBe(differentPhone.score);
    expect(sharedPhone.link).toBe(false);
  });
  it("phone points could not push a one-identity-cue pair over the line (nonphone 40, line 45)", () => {
    // clothing 20 + district 10 + sex 5 + age 5 = 40, one identity cue; a counted phone (+5) would reach 45
    const a = { ...base, nameBn: null, nameLatin: null, marks: null, placeText: null };
    const b = other({ nameBn: null, nameLatin: null, marks: null, placeText: null });
    const r = assessPair(a, b, null);
    expect(r.score).toBe(40);
    expect(r.score + 5).toBe(DUPLICATE_PARAMS.linkMinNonPhone);
    expect(r.cueCount).toBe(1);
    expect(r.evidence.map((e) => e.cue)).toContain("phone_shared_weak");
    expect(r.link).toBe(false);
  });
  it("link and score are invariant when only the phone changes from equal to unequal", () => {
    for (const over of [{}, { clothing: "অন্য", marks: "অন্য" }]) {
      const equal = assessPair(base, other(over), 0.9);
      const unequal = assessPair(base, other({ ...over, phone: "01200000999" }), 0.9);
      expect(equal.link).toBe(unequal.link);
      expect(equal.score).toBe(unequal.score);
      expect(equal.cueCount).toBe(unequal.cueCount);
    }
  });
  it("a profile that links without the phone links identically with a different phone", () => {
    const samePhone = assessPair(base, other(), null);
    const otherPhone = assessPair(base, other({ phone: "01200000999" }), null);
    expect(samePhone.link).toBe(true);
    expect(otherPhone.link).toBe(true);
  });
});

describe("evidence list and score", () => {
  it("lists which cues fired for an identical profile", () => {
    const r = assessPair(base, other(), 0.97);
    expect(r.link).toBe(true);
    expect(cues(r)).toEqual(expect.arrayContaining(["name", "clothing", "marks", "place_text", "district", "sex", "age_overlap", "embedding_cosine", "phone_shared_weak"]));
    expect(r.cueCount).toBe(4);
    expect(r.score).toBeLessThanOrEqual(100);
  });
  it("needs two identity cues beyond sex/age/district: sex+age+district alone is not a link", () => {
    const r = assessPair(base, other({ nameBn: null, nameLatin: null, clothing: "অন্য", marks: null, placeText: "অন্য জায়গা" }), null);
    expect(r.link).toBe(false);
  });
  it("embedding cosine is a supporting cue: it adds points but never counts as an identity cue", () => {
    const a = { ...base, nameBn: null, nameLatin: null, marks: null, placeText: null };
    const b = other({ nameBn: null, nameLatin: null, marks: null, placeText: null });
    // clothing is the only identity cue; a perfect cosine must not make it two
    expect(assessPair(a, b, 1).link).toBe(false);
    expect(assessPair(a, b, 1).score).toBeGreaterThan(assessPair(a, b, null).score);
  });
  it("embedding cosine is only a cue below the fire line and never decides alone", () => {
    const low = assessPair(base, other({ nameBn: "অন্য", nameLatin: "Other", clothing: "অন্য", marks: "অন্য", placeText: "অন্য", districtCode: 1, sex: "unknown", ageMin: null, ageMax: null }), 0.99);
    expect(cues(low)).toContain("embedding_cosine");
    expect(low.link).toBe(false);
    expect(cues(assessPair(base, other(), DUPLICATE_PARAMS.cosineCue - 0.01))).not.toContain("embedding_cosine");
  });
  it("a missing embedding is a null cosine, not an error", () => {
    expect(assessPair(base, other(), null).link).toBe(true);
  });
  it("the parameter object is explicitly labelled uncalibrated", () => {
    expect(DUPLICATE_PARAMS.calibration).toMatch(/UNCALIBRATED/);
  });
});

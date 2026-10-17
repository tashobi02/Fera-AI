// TASK-018 duplicate detector: pure decision-helper unit tests (BR-021, TC-013, TC-038).
// No database; only the rule logic, the field-agreement helpers and the similarity gate.
// Synthetic data only. Fixture person names carry the [MOCK] prefix; fixture phones come
// from the test-DB helper so a future schema CHECK change in the phone column does not
// silently relax fixtures (the SQL shape is ^01[0-9]{9}$).
import { describe, expect, it } from "vitest";
import {
  DUPLICATE_CONFIG,
  SIMILARITY_THRESHOLD,
  agesAgree,
  computeAgreement,
  countAgreeingProfileFields,
  decideDuplicateRule,
  districtsAgree,
  namesAgree,
  phonesAgree,
  profilesContradict,
  sexesAgree,
  timesAgree,
  type FieldAgreement,
  type SimilarCase,
  type SourceCase,
} from "@/server/duplicates";
import { fakePhone } from "../db/support/db";

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
    contact_phone: fakePhone(),
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
    contact_phone: fakePhone(),
    ...over,
  };
}

describe("TASK-018 decideDuplicateRule (pure)", () => {
  it("returns null when similarity is below the threshold", () => {
    expect(decideDuplicateRule(SIMILARITY_THRESHOLD - 0.01, { ...allFalse, name: true })).toBeNull();
  });

  it("returns null at the threshold boundary when no profile field agrees (need >=2)", () => {
    // similarity exactly equal to threshold passes the gate, but MIN_AGREEING_PROFILE_FIELDS=2
    // requires at least two agreeing profile fields even when none of them contradicts.
    expect(decideDuplicateRule(SIMILARITY_THRESHOLD, allFalse)).toBeNull();
    // Even with a single field that agrees, a single field is not enough any more.
    expect(decideDuplicateRule(SIMILARITY_THRESHOLD, { ...allFalse, name: true })).toBeNull();
  });

  it("returns 'profile' when similarity is high and the name + sex agree (two fields)", () => {
    expect(decideDuplicateRule(0.9, { ...allFalse, name: true, sex: true })).toBe("profile");
  });

  it("returns 'profile' when similarity is high and the name + age agree (two fields)", () => {
    expect(decideDuplicateRule(0.9, { ...allFalse, name: true, age: true })).toBe("profile");
  });

  it("returns 'profile' when similarity is high and the age + sex agree (two fields)", () => {
    expect(decideDuplicateRule(0.9, { ...allFalse, age: true, sex: true })).toBe("profile");
  });

  it("returns 'profile' when similarity is high and the age + district agree (two fields)", () => {
    expect(decideDuplicateRule(0.9, { ...allFalse, age: true, district: true })).toBe("profile");
  });

  it("returns 'profile' when similarity is high and the age + time agree (two fields)", () => {
    expect(decideDuplicateRule(0.9, { ...allFalse, age: true, time: true })).toBe("profile");
  });

  it("returns 'profile' when similarity is high and the district + time agree (two fields)", () => {
    expect(decideDuplicateRule(0.9, { ...allFalse, district: true, time: true })).toBe("profile");
  });

  it("returns null with only one profile field agreeing (sex alone)", () => {
    // BR-021 + safeguarding: a single profile field is not enough. Sex alone
    // describes ~50% of children in any district and would over-flag.
    expect(decideDuplicateRule(0.9, { ...allFalse, sex: true })).toBeNull();
  });

  it("returns null with only one profile field agreeing (district alone)", () => {
    // District alone describes an entire neighbourhood.
    expect(decideDuplicateRule(0.9, { ...allFalse, district: true })).toBeNull();
  });

  it("returns null with only one profile field agreeing (time alone)", () => {
    // A shared time window alone describes a single day in a district.
    expect(decideDuplicateRule(0.9, { ...allFalse, time: true })).toBeNull();
  });

  it("returns null with only one profile field agreeing (name alone)", () => {
    // A shared name alone is a strong cue, but two children in a family may
    // share a name through transcription. We require a second cue.
    expect(decideDuplicateRule(0.9, { ...allFalse, name: true })).toBeNull();
  });

  // BR-021 / TC-038: a shared phone number ALONE never links two reports.
  it("never returns a rule when only the phone agrees (BR-021, TC-038)", () => {
    expect(decideDuplicateRule(0.99, { ...allFalse, phone: true })).toBeNull();
    // With phoneOnly opt-in AND no profile field agreeing, the schema's
    // same_phone rule may exist as a weak flagged cue. That path is not
    // produced by detectDuplicates; only the caller may invoke it. The
    // agreement set must NOT also satisfy the profile rule (>=2 fields), so
    // we leave the profile fields all false here.
    expect(
      decideDuplicateRule(
        0.99,
        { ...allFalse, phone: true },
        { phoneOnly: true },
      ),
    ).toBe("same_phone");
  });

  it("returns 'profile' when phone plus two profile fields agree (phone alone is never the trigger)", () => {
    expect(
      decideDuplicateRule(0.9, { ...allFalse, phone: true, name: true, district: true }),
    ).toBe("profile");
  });

  it("returns null when a known sex disagreement contradicts the pair (safeguarding)", () => {
    // sex disagrees even though name + district + time agree.
    expect(
      decideDuplicateRule(
        0.9,
        { ...allFalse, name: true, district: true, time: true, sex: false },
        { contradicts: true },
      ),
    ).toBeNull();
  });

  it("returns null when known disjoint age ranges contradict the pair (safeguarding)", () => {
    expect(
      decideDuplicateRule(
        0.9,
        { ...allFalse, name: true, district: true, time: true, age: false },
        { contradicts: true },
      ),
    ).toBeNull();
  });

  it("does not apply the contradiction gate when nothing contradicts (compat=false by default)", () => {
    expect(decideDuplicateRule(0.9, { ...allFalse, name: true, district: true })).toBe("profile");
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

  it("DUPLICATE_CONFIG carries the documented SIMILARITY_THRESHOLD and MIN_AGREEING_PROFILE_FIELDS=2", () => {
    expect(DUPLICATE_CONFIG.SIMILARITY_THRESHOLD).toBe(0.5);
    expect(DUPLICATE_CONFIG.MIN_AGREEING_PROFILE_FIELDS).toBe(2);
    expect(SIMILARITY_THRESHOLD).toBe(DUPLICATE_CONFIG.SIMILARITY_THRESHOLD);
  });

  it("countAgreeingProfileFields counts name/age/sex/district/time but not phone", () => {
    expect(countAgreeingProfileFields({ ...allFalse })).toBe(0);
    expect(countAgreeingProfileFields({ ...allFalse, name: true })).toBe(1);
    expect(countAgreeingProfileFields({ ...allFalse, phone: true })).toBe(0);
    expect(countAgreeingProfileFields({
      ...allFalse, name: true, age: true, sex: true, district: true, time: true, phone: true,
    })).toBe(5);
  });
});

describe("TASK-018 profilesContradict (safeguarding)", () => {
  it("different known sexes contradict, even if everything else agrees (two siblings)", () => {
    const source = makeSource({ sex: "male", age_years: 10, age_min: 10, age_max: 10 });
    const candidate = makeCandidate({ sex: "female", age_years: 4, age_min: 4, age_max: 4 });
    expect(profilesContradict(source, candidate)).toBe(true);
  });

  it("disjoint known age ranges contradict (plain intersection, no tolerance)", () => {
    const source = makeSource({ sex: "female", age_years: 10, age_min: 10, age_max: 10 });
    const candidate = makeCandidate({ sex: "female", age_years: 14, age_min: 14, age_max: 14 });
    expect(profilesContradict(source, candidate)).toBe(true);
  });

  it("overlapping known age ranges do not contradict (sex is also equal)", () => {
    const source = makeSource({ sex: "female", age_years: 8, age_min: 7, age_max: 9 });
    const candidate = makeCandidate({ sex: "female", age_years: 9, age_min: 8, age_max: 10 });
    expect(profilesContradict(source, candidate)).toBe(false);
  });

  it("unknown on either side is not a contradiction", () => {
    // sex unknown on one side, age unknown on both → no contradiction.
    const source = makeSource({
      sex: "unknown", age_years: null, age_min: null, age_max: null,
    });
    const candidate = makeCandidate({
      sex: "female", age_years: null, age_min: null, age_max: null,
    });
    expect(profilesContradict(source, candidate)).toBe(false);
  });

  it("age only one side known is not a contradiction (we cannot say it is disjoint)", () => {
    const source = makeSource({ sex: "female", age_years: null, age_min: null, age_max: null });
    const candidate = makeCandidate({ sex: "female", age_years: 12, age_min: 12, age_max: 12 });
    expect(profilesContradict(source, candidate)).toBe(false);
  });
});

describe("TASK-018 field agreement helpers", () => {
  it("namesAgree: trims and lowercases; null never agrees; fixtures prefixed [MOCK]", () => {
    expect(namesAgree("[MOCK] Rafi", "  [MOCK] rafi  ")).toBe(true);
    expect(namesAgree("[MOCK] Rafi", "[MOCK] Rimon")).toBe(false);
    expect(namesAgree(null, "[MOCK] Rafi")).toBe(false);
    expect(namesAgree("", "[MOCK] Rafi")).toBe(false);
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

  it("NaN and Infinity similarity never flag (pgvector NaN zero-vector guard)", () => {
    // pgvector cosine distance is NaN for a zero vector; 1 - NaN = NaN.
    // The detector skips non-finite distances and the rule helper must also
    // refuse to flag a NaN or Infinity similarity even if profile fields agree.
    expect(decideDuplicateRule(Number.NaN, { ...allFalse, name: true, sex: true })).toBeNull();
    expect(decideDuplicateRule(Number.POSITIVE_INFINITY, { ...allFalse, name: true, sex: true })).toBeNull();
    expect(decideDuplicateRule(Number.NEGATIVE_INFINITY, { ...allFalse, name: true, sex: true })).toBeNull();
  });

  it("timesAgree: a Date input at a sub-second boundary is handled (pg returns Date objects)", () => {
    // Date.parse on the string form of a pg Date drops milliseconds; the
    // function must therefore use getTime() for Date instances so sub-second
    // boundaries do not flip the answer. Here an interval of width 1 ms is
    // detectable only with full precision.
    const aLo = new Date("2026-10-17T07:00:00.500+06:00");
    const aUp = new Date("2026-10-17T08:00:00.500+06:00");
    const bLo = new Date("2026-10-17T08:00:00.250+06:00");
    const bUp = new Date("2026-10-17T09:00:00.250+06:00");
    // 08:00:00.250 < 08:00:00.500 — intervals overlap at the sub-second level.
    expect(timesAgree(aLo, aUp, bLo, bUp)).toBe(true);
    // The same pair with strings via .toISOString() must give the same answer.
    expect(timesAgree(aLo.toISOString(), aUp.toISOString(), bLo.toISOString(), bUp.toISOString())).toBe(true);
    // And: an interval that is disjoint at the sub-second level is not agreed.
    const cLo = new Date("2026-10-17T08:00:00.750+06:00");
    const cUp = new Date("2026-10-17T09:00:00.000+06:00");
    expect(timesAgree(aLo, aUp, cLo, cUp)).toBe(false);
  });
});

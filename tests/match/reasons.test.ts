// TASK-017c template reasons (P3-032, FR-014, FR-015).
// Synthetic data only; no database, no browser, no providers.
import { describe, expect, it } from "vitest";
import type { OfficerCaseView } from "@/contracts";
import { exampleOfficerFoundView, exampleOfficerMissingView } from "@/contracts/examples";
import { locales } from "@/locales";
import { FIELD_ORDER, reasonsFor, type MatchReason, type ReasonField, type ReasonVerdict, type ReasonsPair } from "@/server/matching/reasons";
import { findBannedGroup } from "@/server/outputs";

const pair = (): ReasonsPair => ({ missing: exampleOfficerMissingView, found: exampleOfficerFoundView });

const withChild = (c: OfficerCaseView, child: Partial<OfficerCaseView["child"]>, event: Partial<OfficerCaseView["event"]> = {}): OfficerCaseView => ({
  ...c,
  child: { ...c.child, ...child },
  event: { ...c.event, ...event },
});

const find = (rows: MatchReason[], field: ReasonField): MatchReason => {
  const r = rows.find((x) => x.field === field);
  if (!r) throw new Error(`no reason for ${field}`);
  return r;
};

describe("reasonsFor", () => {
  it("returns one row per field, in the locked FIELD_ORDER, with one of the three verdicts", () => {
    const rows = reasonsFor(pair());
    expect(rows.map((r) => r.field)).toEqual([...FIELD_ORDER]);
    expect(rows).toHaveLength(FIELD_ORDER.length);
    for (const r of rows) {
      expect(["agree", "differ", "unknown"]).toContain(r.verdict);
    }
  });

  it("is deterministic: the same pair yields byte-identical output across two calls", () => {
    expect(reasonsFor(pair())).toEqual(reasonsFor(pair()));
  });

  it("ordering is stable across two different pairs", () => {
    const a = reasonsFor(pair());
    const b = reasonsFor({ missing: withChild(exampleOfficerMissingView, { sex: "male" }), found: withChild(exampleOfficerFoundView, { sex: "male" }) });
    expect(a.map((r) => r.field)).toEqual(b.map((r) => r.field));
  });
});

describe("sex field", () => {
  it("agrees when both sides are the same sex", () => {
    const m = withChild(exampleOfficerMissingView, { sex: "female" });
    const f = withChild(exampleOfficerFoundView, { sex: "female" });
    expect(find(reasonsFor({ missing: m, found: f }), "sex").verdict).toBe("agree");
  });

  it("differs when the two sides are different sexes", () => {
    const m = withChild(exampleOfficerMissingView, { sex: "male" });
    const f = withChild(exampleOfficerFoundView, { sex: "female" });
    expect(find(reasonsFor({ missing: m, found: f }), "sex").verdict).toBe("differ");
  });

  it("is unknown when either side is 'unknown' (never agrees)", () => {
    const m = withChild(exampleOfficerMissingView, { sex: "female" });
    const fUnknown = withChild(exampleOfficerFoundView, { sex: "unknown" });
    const mUnknown = withChild(exampleOfficerMissingView, { sex: "unknown" });
    const f = withChild(exampleOfficerFoundView, { sex: "female" });
    expect(find(reasonsFor({ missing: m, found: fUnknown }), "sex").verdict).toBe("unknown");
    expect(find(reasonsFor({ missing: mUnknown, found: f }), "sex").verdict).toBe("unknown");
    // The brief's "unknown on either side is 'unknown', never 'agree'" rule
    expect(find(reasonsFor({ missing: m, found: fUnknown }), "sex").verdict).not.toBe("agree");
  });
});

describe("age field", () => {
  it("agrees when the two ranges overlap", () => {
    const m = withChild(exampleOfficerMissingView, { age_years: null, age_min: 6, age_max: 9 });
    const f = withChild(exampleOfficerFoundView, { age_years: null, age_min: 8, age_max: 12 });
    expect(find(reasonsFor({ missing: m, found: f }), "age").verdict).toBe("agree");
  });

  it("differs when the two ranges are disjoint", () => {
    const m = withChild(exampleOfficerMissingView, { age_years: null, age_min: 6, age_max: 9 });
    const f = withChild(exampleOfficerFoundView, { age_years: null, age_min: 10, age_max: 12 });
    expect(find(reasonsFor({ missing: m, found: f }), "age").verdict).toBe("differ");
  });

  it("is unknown when either side has no age recorded (never agrees)", () => {
    const m = withChild(exampleOfficerMissingView, { age_years: null, age_min: 6, age_max: 9 });
    const fNone = withChild(exampleOfficerFoundView, { age_years: null, age_min: null, age_max: null });
    expect(find(reasonsFor({ missing: m, found: fNone }), "age").verdict).toBe("unknown");
    expect(find(reasonsFor({ missing: m, found: fNone }), "age").verdict).not.toBe("agree");
  });
});

describe("height field (numeric)", () => {
  it("agrees when both heights are equal", () => {
    const m = withChild(exampleOfficerMissingView, { height_cm: 120 });
    const f = withChild(exampleOfficerFoundView, { height_cm: 120 });
    expect(find(reasonsFor({ missing: m, found: f }), "height").verdict).toBe("agree");
  });

  it("differs when the two heights are unequal", () => {
    const m = withChild(exampleOfficerMissingView, { height_cm: 120 });
    const f = withChild(exampleOfficerFoundView, { height_cm: 125 });
    expect(find(reasonsFor({ missing: m, found: f }), "height").verdict).toBe("differ");
  });

  it("is unknown when either height is null (never agrees)", () => {
    const m = withChild(exampleOfficerMissingView, { height_cm: 120 });
    const fNull = withChild(exampleOfficerFoundView, { height_cm: null });
    expect(find(reasonsFor({ missing: m, found: fNull }), "height").verdict).toBe("unknown");
    expect(find(reasonsFor({ missing: m, found: fNull }), "height").verdict).not.toBe("agree");
  });
});

describe("district field", () => {
  it("agrees when the two districts are the same code", () => {
    const m = withChild(exampleOfficerMissingView, {}, { district_code: 14, district_name_bn: "ঢাকা" });
    const f = withChild(exampleOfficerFoundView, {}, { district_code: 14, district_name_bn: "ঢাকা" });
    expect(find(reasonsFor({ missing: m, found: f }), "district").verdict).toBe("agree");
  });

  it("differs (not 'unknown', not 'review') when the districts are different", () => {
    const m = withChild(exampleOfficerMissingView, {}, { district_code: 14, district_name_bn: "ঢাকা" });
    const f = withChild(exampleOfficerFoundView, {}, { district_code: 5, district_name_bn: "ভোলা" });
    expect(find(reasonsFor({ missing: m, found: f }), "district").verdict).toBe("differ");
  });

  it("is unknown when either side has no district code (never agrees)", () => {
    const m = withChild(exampleOfficerMissingView, {}, { district_code: null, district_name_bn: null });
    const f = withChild(exampleOfficerFoundView, {}, { district_code: 14, district_name_bn: "ঢাকা" });
    expect(find(reasonsFor({ missing: m, found: f }), "district").verdict).toBe("unknown");
    expect(find(reasonsFor({ missing: m, found: f }), "district").verdict).not.toBe("agree");
  });
});

describe("free-text fields (place, time, clothing, marks, circumstances)", () => {
  it("is 'differ' when both sides have a non-empty value (the matcher does not compare the strings)", () => {
    const m = withChild(exampleOfficerMissingView, { clothing: "লাল জামা" });
    const f = withChild(exampleOfficerFoundView, { clothing: "নীল ফ্রক" });
    expect(find(reasonsFor({ missing: m, found: f }), "clothing").verdict).toBe("differ");
  });

  it.each(["place", "time", "clothing", "marks", "circumstances"] as const)("%s is 'unknown' when either side is null or empty", (field) => {
    const m = exampleOfficerMissingView;
    const fMissing = withChild(
      exampleOfficerFoundView,
      { clothing: null, marks: null },
      { place_text: "", circumstances: null, at: null, at_lower: null },
    );
    expect(find(reasonsFor({ missing: m, found: fMissing }), field).verdict).toBe("unknown");
    expect(find(reasonsFor({ missing: m, found: fMissing }), field).verdict).not.toBe("agree");
  });

  it("'unknown' on either side never returns 'agree' (the brief's safety rule, all free-text fields)", () => {
    // The missing side carries an empty value for every free-text field; the
    // found side has a real value. Each verdict must be "unknown" — never
    // "agree" and never "differ" (a single side means we have no comparison).
    const emptyMissing: OfficerCaseView = withChild(
      exampleOfficerMissingView,
      { clothing: "", marks: "" },
      { place_text: "", circumstances: "", at: null, at_lower: null },
    );
    for (const field of ["place", "time", "clothing", "marks", "circumstances"] as const) {
      const v: MatchReason = find(reasonsFor({ missing: emptyMissing, found: exampleOfficerFoundView }), field);
      expect(v.verdict).toBe("unknown");
      expect(v.verdict).not.toBe("agree");
    }
  });
});

describe("message keys", () => {
  it("returns one of the existing officer-match keys for every row", () => {
    const rows = reasonsFor(pair());
    const allowed = new Set([
      "matchFieldSex",
      "matchFieldAge",
      "matchFieldHeight",
      "matchFieldDistrict",
      "matchFieldPlace",
      "matchFieldTime",
      "matchFieldClothing",
      "matchFieldMarks",
      "matchFieldCircumstances",
    ]);
    for (const r of rows) {
      expect(allowed.has(r.messageKey), `unexpected key ${r.messageKey}`).toBe(true);
    }
  });

  it("every returned key exists in both bn and en locale objects", () => {
    const rows = reasonsFor(pair());
    const seen = new Set(rows.map((r) => r.messageKey));
    expect(seen.size).toBe(FIELD_ORDER.length);
    for (const k of seen) {
      expect(typeof locales.bn[k as keyof typeof locales.bn]).toBe("string");
      expect(typeof locales.en[k as keyof typeof locales.en]).toBe("string");
    }
  });

  it("the bn and en copy of every returned key passes the wording guard", () => {
    const rows = reasonsFor(pair());
    for (const r of rows) {
      const k = r.messageKey as keyof typeof locales.bn;
      const bn = locales.bn[k] as string;
      const en = locales.en[k] as string;
      expect(findBannedGroup(bn), `bn ${r.messageKey}: ${bn}`).toBeNull();
      expect(findBannedGroup(en), `en ${r.messageKey}: ${en}`).toBeNull();
    }
  });

  it("the verdict set is exactly the brief's three: agree, differ, unknown (never 'review')", () => {
    const rows = reasonsFor(pair());
    for (const r of rows) {
      const v: ReasonVerdict = r.verdict;
      expect(v === "agree" || v === "differ" || v === "unknown").toBe(true);
    }
  });
});

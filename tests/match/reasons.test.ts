// TASK-017c template reasons (P3-032, FR-014, FR-015).
// Synthetic data only; no database, no browser, no providers.
import { describe, expect, it } from "vitest";
import type { OfficerCaseView } from "@/contracts";
import { exampleOfficerFoundView, exampleOfficerMissingView } from "@/contracts/examples";
import { locales } from "@/locales";
import { compareCases, type CompareField, type Verdict } from "@/lib/match-review";
import { FIELD_ORDER, reasonsFor, type MatchReason, type ReasonField, type ReasonsPair } from "@/server/matching/reasons";
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

const findVerdict = (rows: MatchReason[], field: ReasonField): Verdict => find(rows, field).verdict;

const approvedVerdict = (m: OfficerCaseView, f: OfficerCaseView, field: CompareField): Verdict => {
  const row = compareCases(m, f, "bn").find((r) => r.field === field);
  if (!row) throw new Error(`compareCases returned no row for ${field}`);
  return row.verdict;
};

describe("reasonsFor", () => {
  it("returns one row per field, in the locked FIELD_ORDER, with one of the four verdicts", () => {
    const rows = reasonsFor(pair());
    expect(rows.map((r) => r.field)).toEqual([...FIELD_ORDER]);
    expect(rows).toHaveLength(FIELD_ORDER.length);
    for (const r of rows) {
      expect(["agree", "differ", "unknown", "review"]).toContain(r.verdict);
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

  it("never computes a verdict: the adapter's verdict equals compareCases's verdict for every field", () => {
    // Drift guard: the two modules must always agree, field by field, for the
    // same pair. If reasons.ts ever reinvents a comparison helper, this test
    // catches it immediately.
    const rows = reasonsFor(pair());
    for (const row of rows) {
      const approved = compareCases(exampleOfficerMissingView, exampleOfficerFoundView, "bn").find((r) => r.field === row.field);
      expect(approved, `compareCases returned no row for ${row.field}`).toBeDefined();
      expect(row.verdict, `drift on ${row.field}`).toBe(approved!.verdict);
    }
  });
});

describe("sex field", () => {
  it("agrees when both sides are the same sex", () => {
    const m = withChild(exampleOfficerMissingView, { sex: "female" });
    const f = withChild(exampleOfficerFoundView, { sex: "female" });
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "sex")).toBe("agree");
    expect(approvedVerdict(m, f, "sex")).toBe("agree");
  });

  it("differs when the two sides are different sexes", () => {
    const m = withChild(exampleOfficerMissingView, { sex: "male" });
    const f = withChild(exampleOfficerFoundView, { sex: "female" });
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "sex")).toBe("differ");
    expect(approvedVerdict(m, f, "sex")).toBe("differ");
  });

  it("is unknown when either side is 'unknown' (never agrees)", () => {
    const m = withChild(exampleOfficerMissingView, { sex: "female" });
    const fUnknown = withChild(exampleOfficerFoundView, { sex: "unknown" });
    const mUnknown = withChild(exampleOfficerMissingView, { sex: "unknown" });
    const f = withChild(exampleOfficerFoundView, { sex: "female" });
    expect(findVerdict(reasonsFor({ missing: m, found: fUnknown }), "sex")).toBe("unknown");
    expect(findVerdict(reasonsFor({ missing: mUnknown, found: f }), "sex")).toBe("unknown");
    expect(findVerdict(reasonsFor({ missing: m, found: fUnknown }), "sex")).not.toBe("agree");
  });
});

describe("age field", () => {
  it("agrees when the two ranges overlap", () => {
    const m = withChild(exampleOfficerMissingView, { age_years: null, age_min: 6, age_max: 9 });
    const f = withChild(exampleOfficerFoundView, { age_years: null, age_min: 8, age_max: 12 });
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "age")).toBe("agree");
    expect(approvedVerdict(m, f, "age")).toBe("agree");
  });

  it("differs when the two ranges are disjoint", () => {
    const m = withChild(exampleOfficerMissingView, { age_years: null, age_min: 6, age_max: 9 });
    const f = withChild(exampleOfficerFoundView, { age_years: null, age_min: 10, age_max: 12 });
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "age")).toBe("differ");
    expect(approvedVerdict(m, f, "age")).toBe("differ");
  });

  it("is unknown when either side has no age recorded (never agrees)", () => {
    const m = withChild(exampleOfficerMissingView, { age_years: null, age_min: 6, age_max: 9 });
    const fNone = withChild(exampleOfficerFoundView, { age_years: null, age_min: null, age_max: null });
    expect(findVerdict(reasonsFor({ missing: m, found: fNone }), "age")).toBe("unknown");
    expect(findVerdict(reasonsFor({ missing: m, found: fNone }), "age")).not.toBe("agree");
  });
});

describe("height field (measurement)", () => {
  // The brief + the approved logic: compareCases never says "agree" on a
  // measurement — height is not a structured enum, it has no tolerance, and
  // equality could be a coincidence. The honest verdict is "review" (the
  // officer looks at both values). The adapter must forward that verdict.
  it("is 'review' even when both heights are equal — no invented tolerance", () => {
    const m = withChild(exampleOfficerMissingView, { height_cm: 120 });
    const f = withChild(exampleOfficerFoundView, { height_cm: 120 });
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "height")).toBe("review");
    expect(approvedVerdict(m, f, "height")).toBe("review");
  });

  // The brief: heights 120 vs 121 are 'review', not 'differ' — there is no
  // invented tolerance. This locks the approved rule and prevents reasons.ts
  // from ever reverting to a strict-equality numeric check.
  it("is 'review' (not 'differ') when the two heights are 120 vs 121 — no invented tolerance", () => {
    const m = withChild(exampleOfficerMissingView, { height_cm: 120 });
    const f = withChild(exampleOfficerFoundView, { height_cm: 121 });
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "height")).toBe("review");
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "height")).not.toBe("differ");
    expect(approvedVerdict(m, f, "height")).toBe("review");
  });

  it("is 'review' (not 'differ') for any two non-equal heights", () => {
    const m = withChild(exampleOfficerMissingView, { height_cm: 100 });
    const f = withChild(exampleOfficerFoundView, { height_cm: 140 });
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "height")).toBe("review");
    expect(approvedVerdict(m, f, "height")).toBe("review");
  });

  it("is unknown when either height is null (never agrees, never differs)", () => {
    const m = withChild(exampleOfficerMissingView, { height_cm: 120 });
    const fNull = withChild(exampleOfficerFoundView, { height_cm: null });
    expect(findVerdict(reasonsFor({ missing: m, found: fNull }), "height")).toBe("unknown");
    expect(findVerdict(reasonsFor({ missing: m, found: fNull }), "height")).not.toBe("agree");
    expect(findVerdict(reasonsFor({ missing: m, found: fNull }), "height")).not.toBe("differ");
  });
});

describe("district field", () => {
  it("agrees when the two districts are the same code", () => {
    const m = withChild(exampleOfficerMissingView, {}, { district_code: 14, district_name_bn: "ঢাকা" });
    const f = withChild(exampleOfficerFoundView, {}, { district_code: 14, district_name_bn: "ঢাকা" });
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "district")).toBe("agree");
    expect(approvedVerdict(m, f, "district")).toBe("agree");
  });

  // The brief: a different district is 'review' (BR-017 — district is a bonus,
  // not a contradiction), never 'differ'. This locks the approved rule.
  it("is 'review' (not 'differ', not 'unknown') when the districts are different", () => {
    const m = withChild(exampleOfficerMissingView, {}, { district_code: 14, district_name_bn: "ঢাকা" });
    const f = withChild(exampleOfficerFoundView, {}, { district_code: 5, district_name_bn: "ভোলা" });
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "district")).toBe("review");
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "district")).not.toBe("differ");
    expect(approvedVerdict(m, f, "district")).toBe("review");
  });

  it("is unknown when either side has no district code (never agrees)", () => {
    const m = withChild(exampleOfficerMissingView, {}, { district_code: null, district_name_bn: null });
    const f = withChild(exampleOfficerFoundView, {}, { district_code: 14, district_name_bn: "ঢাকা" });
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "district")).toBe("unknown");
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "district")).not.toBe("agree");
  });
});

describe("free-text fields (place, time, clothing, marks, circumstances)", () => {
  // The brief: identical free text on both sides is NOT 'differ'. compareCases
  // already returns 'review' for any two non-null free-text values (it does
  // not compare the strings). This locks that rule.
  it("is 'review' (not 'differ') when both sides have the same non-empty free text", () => {
    const m = withChild(exampleOfficerMissingView, { clothing: "লাল জামা" });
    const f = withChild(exampleOfficerFoundView, { clothing: "লাল জামা" });
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "clothing")).toBe("review");
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "clothing")).not.toBe("differ");
    expect(approvedVerdict(m, f, "clothing")).toBe("review");
  });

  it("is 'review' (not 'differ') when both sides have different non-empty free text", () => {
    const m = withChild(exampleOfficerMissingView, { clothing: "লাল জামা" });
    const f = withChild(exampleOfficerFoundView, { clothing: "নীল ফ্রক" });
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "clothing")).toBe("review");
    expect(findVerdict(reasonsFor({ missing: m, found: f }), "clothing")).not.toBe("differ");
  });

  it.each(["place", "time", "clothing", "marks", "circumstances"] as const)("%s is 'unknown' when either side is null or empty", (field) => {
    const m = exampleOfficerMissingView;
    const fMissing = withChild(
      exampleOfficerFoundView,
      { clothing: null, marks: null },
      { place_text: "", circumstances: null, at: null, at_lower: null },
    );
    expect(findVerdict(reasonsFor({ missing: m, found: fMissing }), field)).toBe("unknown");
    expect(findVerdict(reasonsFor({ missing: m, found: fMissing }), field)).not.toBe("agree");
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
  it("every row's fieldKey and verdictKey are existing officer-match keys", () => {
    const rows = reasonsFor(pair());
    const allowedField = new Set([
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
    const allowedVerdict = new Set([
      "matchVerdictAgree",
      "matchVerdictDiffer",
      "matchVerdictUnknown",
      "matchVerdictReview",
    ]);
    for (const r of rows) {
      expect(allowedField.has(r.fieldKey), `unexpected fieldKey ${r.fieldKey}`).toBe(true);
      expect(allowedVerdict.has(r.verdictKey), `unexpected verdictKey ${r.verdictKey} for ${r.field}`).toBe(true);
    }
  });

  it("every returned fieldKey and verdictKey exists in both bn and en locale objects", () => {
    const rows = reasonsFor(pair());
    for (const r of rows) {
      for (const k of [r.fieldKey, r.verdictKey]) {
        expect(typeof locales.bn[k as keyof typeof locales.bn], `bn missing ${k}`).toBe("string");
        expect(typeof locales.en[k as keyof typeof locales.en], `en missing ${k}`).toBe("string");
      }
    }
  });

  it("the bn and en copy of every returned key passes the wording guard", () => {
    const rows = reasonsFor(pair());
    for (const r of rows) {
      for (const k of [r.fieldKey, r.verdictKey]) {
        const bn = locales.bn[k as keyof typeof locales.bn] as string;
        const en = locales.en[k as keyof typeof locales.en] as string;
        expect(findBannedGroup(bn), `bn ${k}: ${bn}`).toBeNull();
        expect(findBannedGroup(en), `en ${k}: ${en}`).toBeNull();
      }
    }
  });

  it("the rendered strings (for the test pair) are non-empty in both languages", () => {
    // Catches a key that exists in the type but is mapped to an empty string
    // by accident — the wording guard accepts "" today, so this is an extra.
    const rows = reasonsFor(pair());
    for (const r of rows) {
      for (const k of [r.fieldKey, r.verdictKey]) {
        const bn = locales.bn[k as keyof typeof locales.bn] as string;
        const en = locales.en[k as keyof typeof locales.en] as string;
        expect(bn.length, `bn ${k} is empty`).toBeGreaterThan(0);
        expect(en.length, `en ${k} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it("the verdict set is exactly the approved four: agree, differ, unknown, review", () => {
    const rows = reasonsFor(pair());
    for (const r of rows) {
      const v: Verdict = r.verdict;
      expect(v === "agree" || v === "differ" || v === "unknown" || v === "review").toBe(true);
    }
  });
});

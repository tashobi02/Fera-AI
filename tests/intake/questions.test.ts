// Tests for follow-up question templates and next-question selector (COMP-009, TASK-020 part 1).
import { describe, expect, it } from "vitest";
import {
  LIMITS,
  DRAFT_FIELD_PATHS,
  nextQuestionSchema,
  type DraftFieldPath,
} from "@/contracts";
import {
  QUESTION_ORDER,
  QUESTION_TEMPLATES,
  isManualFallback,
  isNextQuestion,
  nextQuestion,
  toTaggedQuestion,
} from "@/server/intake/questions";

describe("QUESTION_TEMPLATES (D3 lines 79-88, COMP-009)", () => {
  it("age template equals D3 string character-for-character", () => {
    // docs/spec/D3_App_Flow_V2.md:83
    const expectedBn = "{নাম}-এর বয়স কত?";
    // docs/spec/D3_App_Flow_V2.md:83
    const expectedEn = "How old is {name}?";

    const tpl = QUESTION_TEMPLATES["child.age_years"];
    expect(tpl).toBeDefined();
    expect(tpl?.bn).toBe(expectedBn);
    expect(tpl?.en).toBe(expectedEn);
  });

  it("sex template equals D3 string character-for-character", () => {
    // docs/spec/D3_App_Flow_V2.md:84
    const expectedBn = "শিশুটি ছেলে না মেয়ে?";
    // docs/spec/D3_App_Flow_V2.md:84
    const expectedEn = "Is the child a boy or a girl?";

    const tpl = QUESTION_TEMPLATES["child.sex"];
    expect(tpl).toBeDefined();
    expect(tpl?.bn).toBe(expectedBn);
    expect(tpl?.en).toBe(expectedEn);
  });

  it("district template equals D3 string character-for-character", () => {
    // docs/spec/D3_App_Flow_V2.md:85
    const expectedBn = "{নাম}-কে শেষবার কোন জেলায় দেখা গিয়েছিল?";
    // docs/spec/D3_App_Flow_V2.md:85
    const expectedEn = "In which district was {name} last seen?";

    const tpl = QUESTION_TEMPLATES["event.district_code"];
    expect(tpl).toBeDefined();
    expect(tpl?.bn).toBe(expectedBn);
    expect(tpl?.en).toBe(expectedEn);
  });

  it("event time template equals D3 string character-for-character", () => {
    // docs/spec/D3_App_Flow_V2.md:86
    const expectedBn = "শেষবার কবে, কখন দেখা গিয়েছিল?";
    // docs/spec/D3_App_Flow_V2.md:86
    const expectedEn = "When was {name} last seen?";

    const tpl = QUESTION_TEMPLATES["event.at"];
    expect(tpl).toBeDefined();
    expect(tpl?.bn).toBe(expectedBn);
    expect(tpl?.en).toBe(expectedEn);
  });

  it("phone template equals D3 string character-for-character", () => {
    // docs/spec/D3_App_Flow_V2.md:87
    const expectedBn = "আপনার মোবাইল নম্বর দিন, যাতে খবর পেলে যোগাযোগ করা যায়।";
    // docs/spec/D3_App_Flow_V2.md:87
    const expectedEn = "Your mobile number, so you can be contacted.";

    const tpl = QUESTION_TEMPLATES["reporter.phone"];
    expect(tpl).toBeDefined();
    expect(tpl?.bn).toBe(expectedBn);
    expect(tpl?.en).toBe(expectedEn);
  });

  it("fields without a template in the pack have NO entry in QUESTION_TEMPLATES", () => {
    // Spec pack provides no templates for these draft field paths (documented as UNKNOWN)
    const unTemplatedFields: DraftFieldPath[] = [
      "child.name",
      "child.name_latin",
      "child.age_min",
      "child.age_max",
      "child.height_cm",
      "child.clothing",
      "child.marks",
      "event.at_lower",
      "event.at_upper",
      "event.place_text",
      "event.district_text",
      "event.thana",
      "event.circumstances",
      "reporter.relation",
    ];

    for (const field of unTemplatedFields) {
      expect(QUESTION_TEMPLATES[field]).toBeUndefined();
    }
  });
});

describe("nextQuestion selector (BR-023, D1 STORY-003, COMP-009)", () => {
  it("round 0..3 asks a question", () => {
    for (let round = 0; round < LIMITS.followUpRounds; round++) {
      const result = nextQuestion({ missing: ["child.sex"], round });
      expect(result).not.toBeNull();
      expect(isNextQuestion(result)).toBe(true);
      if (isNextQuestion(result)) {
        expect(result.field).toBe("child.sex");
        expect(result.bn).toBe("শিশুটি ছেলে না মেয়ে?");
        expect(result.en).toBe("Is the child a boy or a girl?");
      }
    }
  });

  it("round 4 returns manual with reason rounds_exhausted", () => {
    // LIMITS.followUpRounds is 4; round 4 must exhaust follow-up questions
    expect(LIMITS.followUpRounds).toBe(4);

    const result = nextQuestion({ missing: ["child.sex"], round: 4 });
    expect(result).toEqual({ kind: "manual", reason: "rounds_exhausted" });
    expect(isManualFallback(result)).toBe(true);

    // Any round >= 4 also returns manual
    const beyondResult = nextQuestion({ missing: ["child.sex"], round: 5 });
    expect(beyondResult).toEqual({ kind: "manual", reason: "rounds_exhausted" });
  });

  it("invalid round (NaN, -1, 1.5, Infinity) returns manual with reason rounds_exhausted", () => {
    for (const invalidRound of [NaN, -1, 1.5, Infinity]) {
      const result = nextQuestion({ missing: ["child.sex"], round: invalidRound });
      expect(result).toEqual({ kind: "manual", reason: "rounds_exhausted" });
      expect(isManualFallback(result)).toBe(true);
    }
  });

  it("fields without a template are skipped and next templated field is asked", () => {
    // event.place_text has no template; child.sex has a template
    const result = nextQuestion({
      missing: ["event.place_text", "child.sex"],
      round: 0,
    });

    expect(result).not.toBeNull();
    expect(isNextQuestion(result)).toBe(true);
    if (isNextQuestion(result)) {
      expect(result.field).toBe("child.sex");
    }
  });

  it("returns manual with reason no_template when all missing fields lack templates", () => {
    // None of these fields has a question template in D3
    const result = nextQuestion({
      missing: ["event.place_text", "child.clothing", "child.marks"],
      round: 0,
    });

    expect(result).toEqual({ kind: "manual", reason: "no_template" });
    expect(isManualFallback(result)).toBe(true);
  });

  it("empty missing returns null", () => {
    // When no fields are missing, draft is complete; nothing to ask or direct
    const resultRound0 = nextQuestion({ missing: [], round: 0 });
    expect(resultRound0).toBeNull();

    const resultRound2 = nextQuestion({ missing: [], round: 2 });
    expect(resultRound2).toBeNull();

    // Even if round is exhausted, empty missing means complete, so null
    const resultRound4 = nextQuestion({ missing: [], round: 4 });
    expect(resultRound4).toBeNull();
  });

  it("asks exactly one question per call", () => {
    // Pass all possible fields; only one question must be selected
    const allMissing: DraftFieldPath[] = [
      "child.age_years",
      "child.sex",
      "event.district_code",
      "event.at",
      "reporter.phone",
    ];

    const result = nextQuestion({ missing: allMissing, round: 0 });
    expect(result).not.toBeNull();
    expect(isNextQuestion(result)).toBe(true);

    if (isNextQuestion(result)) {
      // First in D3 table order is child.age_years
      expect(result.field).toBe("child.age_years");
      // Result is a single NextQuestion object, not an array
      expect(Array.isArray(result)).toBe(false);
    }
  });

  it("respects D3 table order when multiple fields are missing", () => {
    expect(QUESTION_ORDER).toEqual([
      "child.age_years",
      "child.sex",
      "event.district_code",
      "event.at",
      "reporter.phone",
    ]);

    // When phone and sex are missing, sex comes before phone in D3 order
    const result = nextQuestion({
      missing: ["reporter.phone", "child.sex"],
      round: 0,
    });
    expect(isNextQuestion(result)).toBe(true);
    if (isNextQuestion(result)) {
      expect(result.field).toBe("child.sex");
    }
  });

  it("output parses with the contract NextQuestion schema", () => {
    for (const field of QUESTION_ORDER) {
      const result = nextQuestion({ missing: [field], round: 0 });
      expect(result).not.toBeNull();

      // Output must pass strict contract schema validation
      const parsed = nextQuestionSchema.parse(result);
      expect(parsed.field).toBe(field);
      expect(typeof parsed.bn).toBe("string");
      expect(parsed.bn.length).toBeGreaterThan(0);
      expect(parsed.bn.length).toBeLessThanOrEqual(300);
      expect(typeof parsed.en).toBe("string");
      expect(parsed.en.length).toBeGreaterThan(0);
      expect(parsed.en.length).toBeLessThanOrEqual(300);
    }
  });

  it("toTaggedQuestion helper converts to tagged question shape { kind, field, text }", () => {
    const qResult = nextQuestion({ missing: ["child.sex"], round: 0 });
    const tagged = toTaggedQuestion(qResult);

    expect(tagged).toEqual({
      kind: "question",
      field: "child.sex",
      text: {
        bn: "শিশুটি ছেলে না মেয়ে?",
        en: "Is the child a boy or a girl?",
      },
    });

    // Tagged manual passthrough
    const manualResult = nextQuestion({ missing: ["child.sex"], round: 4 });
    expect(toTaggedQuestion(manualResult)).toEqual({
      kind: "manual",
      reason: "rounds_exhausted",
    });

    // Tagged null passthrough
    expect(toTaggedQuestion(null)).toBeNull();
  });

  // Independent expected priority from docs/spec/D3_App_Flow_V2.md:83-87.
  // Exercise every nonempty subset in reversed request order, including duplicates
  // and untemplated fields. The strict schema also rules out extra questions/keys.
  const d3Fields: DraftFieldPath[] = [
    "child.age_years", "child.sex", "event.district_code", "event.at", "reporter.phone",
  ];
  it.each(Array.from({ length: 31 }, (_, index) => index + 1))(
    "returns exactly the first D3 question for missing subset %i",
    (mask) => {
      const selected = d3Fields.filter((_, index) => mask & (1 << index));
      const missing = Object.freeze([
        "child.name" as const, ...selected.toReversed(), ...selected, "event.place_text" as const,
      ]);
      const before = [...missing];
      const result = nextQuestion({ missing, round: 0 });
      const parsed = nextQuestionSchema.parse(result);
      expect(parsed.field).toBe(selected[0]);
      expect(Object.keys(result!)).toEqual(["field", "bn", "en"]);
      expect(missing).toEqual(before);
      expect(nextQuestion({ missing, round: 0 })).toEqual(result);
    },
  );

  it.each(d3Fields.flatMap((field) => [0, 1, 2, 3].map((round) => ({ field, round }))))(
    "asks $field at allowed round $round",
    ({ field, round }) => {
      expect(nextQuestionSchema.parse(nextQuestion({ missing: [field], round })).field).toBe(field);
    },
  );

  const untemplated = DRAFT_FIELD_PATHS.filter((field) => !d3Fields.includes(field));
  it.each(untemplated)("falls back to manual for untemplated field %s", (field) => {
    expect(nextQuestion({ missing: [field], round: 0 })).toEqual({ kind: "manual", reason: "no_template" });
    expect(nextQuestion({ missing: [field], round: 4 })).toEqual({ kind: "manual", reason: "rounds_exhausted" });
  });

  it("classifies every result variant and keeps question results independent between calls", () => {
    const question = nextQuestion({ missing: ["child.sex"], round: 0 });
    const noTemplate = nextQuestion({ missing: ["child.name"], round: 0 });
    const exhausted = nextQuestion({ missing: ["child.sex"], round: 4 });
    expect(isNextQuestion(null)).toBe(false);
    expect(isManualFallback(null)).toBe(false);
    expect(isManualFallback(question)).toBe(false);
    for (const manual of [noTemplate, exhausted]) {
      expect(isNextQuestion(manual)).toBe(false);
      expect(isManualFallback(manual)).toBe(true);
      expect(toTaggedQuestion(manual)).toEqual(manual);
    }
    expect(isNextQuestion(question)).toBe(true);
    if (isNextQuestion(question)) question.bn = "[MOCK] changed caller copy";
    expect(nextQuestion({ missing: ["child.sex"], round: 0 })).toEqual({
      field: "child.sex", bn: "শিশুটি ছেলে না মেয়ে?", en: "Is the child a boy or a girl?",
    });
  });
});

// TASK-013 safeguarding fix round 4 (lead decision 2026-10-16):
// Next-sentence retraction openers (BLOCK B1), abbreviated hedge tokens / dot delimiters (BLOCK B2),
// and relationship noun guards, "হবে" hedge, integer age schema (WARN fixes).
import { assert, describe, expect, it } from "vitest";
import { brandProviderDispatch, createLlmAdapter } from "@/server/ai";
import { outputStructureSchema } from "@/server/ai/contract";
import { normaliseTime } from "@/server/normalise";
import { emptyOutput, fakeProvider, inputFor, NOW, put } from "./fixtures";

const dispatch = brandProviderDispatch((provider, request, options) => provider.extract(request, options));

async function extractField(source: string, field: string, value: string | number, quote: string, derivation = "direct") {
  const out = put(emptyOutput(), source, field, value, quote, derivation as never);
  const result = await createLlmAdapter({
    primary: fakeProvider("primary", [out]),
    fallback: fakeProvider("fallback", []),
    dispatch,
    log: () => {},
  }).extract(inputFor(source));
  assert(result.ok);
  const [group, key] = field.split(".") as ["child" | "event" | "reporter", string];
  const got = Reflect.get(result.draft[group], key);
  return got === "unknown" ? null : got;
}

function timeValueFor(source: string, quote: string) {
  const start_utf16 = source.indexOf(quote);
  const res = normaliseTime(source, { quote, start_utf16, end_utf16: start_utf16 + quote.length, derivation: "time_interval" } as never, NOW);
  if (res.status !== "known") throw new Error(`Invalid time fixture for quote: ${quote}`);
  return res.value;
}

describe("BLOCK B1: Next-sentence retraction openers and whole-text qualifiers", () => {
  const B1_UNCERTAIN_CASES: [tag: string, source: string, field: string, value: string | number, quote: string][] = [
    ["next-na-11", "[MOCK] বয়স ১০। না, ১১।", "child.age_years", 10, "১০"],
    ["next-newline-nana-11", "[MOCK] বয়স ১০\nনা না ১১", "child.age_years", 10, "১০"],
    ["next-sorry-11", "[MOCK] age 10. Sorry, 11.", "child.age_years", 10, "10"],
    ["next-actually-11", "[MOCK] age 10. Actually 11.", "child.age_years", 10, "10"],
    ["next-name-nana", "[MOCK] নাম: রাফি। না না, রাহি।", "child.name", "রাফি", "রাফি"],
    ["next-phone-na", "[MOCK] নম্বর ০১৭১১২২৩৩৪৪। না, ০১৮১১২২৩৩৪৪", "reporter.phone", "01711223344", "০১৭১১২২৩৩৪৪"],
    ["whole-text-shob-tothyo-bn", "[MOCK] বয়স ১০। উপরের সব তথ্য আমি নিশ্চিত না", "child.age_years", 10, "১০"],
    ["whole-text-any-above-en", "[MOCK] age 10. Not sure about any of the above.", "child.age_years", 10, "10"],
  ];

  it.each(B1_UNCERTAIN_CASES)("drops %s to unknown", async (_tag, source, field, value, quote) => {
    expect(await extractField(source, field, value, quote)).toBeNull();
  });

  it.each([
    ["dari", "[MOCK] গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি। না, সকালে।"],
    ["dot", "[MOCK] গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি. না, সকালে."],
    ["newline", "[MOCK] গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি\nনা, সকালে."],
  ])("drops event time when next sentence opens with retraction (%s)", async (_sep, src) => {
    const tv = timeValueFor(src, "গতকাল বিকেলে");
    expect(await extractField(src, "event.at", tv.at, "গতকাল বিকেলে", "time_interval")).toBeNull();
  });

  it("keeps both facts when next sentence is another fact: বয়স ১০। নম্বর ০১৭১১২২৩৩৪৪", async () => {
    const src = "[MOCK] বয়স ১০। নম্বর ০১৭১১২২৩৩৪৪";
    const out = emptyOutput();
    put(out, src, "child.age_years", 10, "১০", "digits");
    put(out, src, "reporter.phone", "01711223344", "০১৭১১২২৩৩৪৪", "digits");
    const r = await createLlmAdapter({
      primary: fakeProvider("primary", [out]),
      fallback: fakeProvider("fallback", []),
      dispatch,
      log: () => {},
    }).extract(inputFor(src));
    assert(r.ok);
    expect(r.draft.child.age_years).toBe(10);
    expect(r.draft.reporter.phone).toBe("01711223344");
  });

  it("extracts verbatim D6 TC-002 text with sex male, age 13, time window and phone number", async () => {
    const src = "[MOCK] আমার ছেলে রাফি, বয়স ১৩, গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি। নম্বর ০১৭১১২২৩৩৪৪";
    const tv = timeValueFor(src, "গতকাল বিকেলে");
    const out = emptyOutput();
    put(out, src, "child.age_years", 13, "১৩", "digits");
    put(out, src, "child.sex", "male", "ছেলে");
    put(out, src, "reporter.phone", "01711223344", "০১৭১১২২৩৩৪৪", "digits");
    put(out, src, "event.at", tv.at, "গতকাল বিকেলে", "time_interval");
    put(out, src, "event.at_lower", tv.at_lower, "গতকাল বিকেলে", "time_interval");
    put(out, src, "event.at_upper", tv.at_upper, "গতকাল বিকেলে", "time_interval");
    out.event.at_approx = true;

    const r = await createLlmAdapter({
      primary: fakeProvider("primary", [out]),
      fallback: fakeProvider("fallback", []),
      dispatch,
      log: () => {},
    }).extract(inputFor(src));

    assert(r.ok);
    expect(r.draft.child.sex).toBe("male");
    expect(r.draft.child.age_years).toBe(13);
    expect(r.draft.child.name).toBeNull();
    expect(r.draft.event.at).toBe(tv.at);
    expect(r.draft.event.at_lower).toBe(tv.at_lower);
    expect(r.draft.event.at_upper).toBe(tv.at_upper);
    expect(r.draft.event.at_approx).toBe(true);
    expect(r.draft.reporter.phone).toBe("01711223344");
    expect(r.draft.event.district_code).toBeNull();
  });
});

describe("BLOCK B2: Abbreviated hedges and dot boundaries", () => {
  const B2_UNCERTAIN_CASES: [tag: string, source: string, field: string, value: string | number, quote: string][] = [
    ["approx-dot-age", "[MOCK] approx. 10 years", "child.age_years", 10, "10"],
    ["age-approx-dot", "[MOCK] age approx. 10 years", "child.age_years", 10, "10"],
    ["ca-dot-age", "[MOCK] ca. 10 years", "child.age_years", 10, "10"],
    ["prob-dot-age", "[MOCK] prob. 10 years old", "child.age_years", 10, "10"],
    ["est-dot-age", "[MOCK] est. 10 yrs", "child.age_years", 10, "10"],
    ["not-dot-age", "[MOCK] not. 10 years", "child.age_years", 10, "10"],
    ["bn-aano-dot-age", "[MOCK] বয়স আনু. ১০ বছর", "child.age_years", 10, "১০"],
    ["bn-bare-aano-dot", "[MOCK] আনু. ১০ বছর", "child.age_years", 10, "১০"],
    ["approx-dot-height", "[MOCK] approx. 120 cm", "child.height_cm", 120, "120 cm"],
    ["dot-no-whitespace-hoyto", "[MOCK] বয়স ১০.হয়তো", "child.age_years", 10, "১০"],
  ];

  it.each(B2_UNCERTAIN_CASES)("drops %s to unknown", async (_tag, source, field, value, quote) => {
    expect(await extractField(source, field, value, quote)).toBeNull();
  });

  it("keeps controls: বয়স ১০। উচ্চতা ১২০ cm", async () => {
    const src = "[MOCK] বয়স ১০। উচ্চতা ১২০ cm";
    const out = emptyOutput();
    put(out, src, "child.age_years", 10, "১০", "digits");
    put(out, src, "child.height_cm", 120, "১২০ cm", "direct");
    const r = await createLlmAdapter({
      primary: fakeProvider("primary", [out]),
      fallback: fakeProvider("fallback", []),
      dispatch,
      log: () => {},
    }).extract(inputFor(src));
    assert(r.ok);
    expect(r.draft.child.age_years).toBe(10);
    expect(r.draft.child.height_cm).toBe(120);
  });
});

describe("WARN fixes: relationship nouns, হবে hedge, and integer age schema", () => {
  it.each([
    ["bn-meye-jamai", "[MOCK] আমার মেয়ে জামাই", "child.sex", "female", "মেয়ে"],
    ["bn-chele-bou", "[MOCK] আমার ছেলে বউ", "child.sex", "male", "ছেলে"],
    ["en-girl-friend", "[MOCK] my girl friend", "child.sex", "female", "girl"],
  ])("rejects relationship noun after kin word: %s", async (_tag, source, field, value, quote) => {
    expect(await extractField(source, field, value, quote)).toBeNull();
  });

  it("keeps valid possessive kin words followed by name", async () => {
    expect(await extractField("[MOCK] আমার ছেলে রাফি", "child.sex", "male", "ছেলে")).toBe("male");
    expect(await extractField("[MOCK] আমার মেয়ে মিম", "child.sex", "female", "মেয়ে")).toBe("female");
  });

  it("drops name when 'হবে' hedge is present: নাম: রাফি হবে", async () => {
    expect(await extractField("[MOCK] নাম: রাফি হবে", "child.name", "রাফি হবে", "রাফি হবে")).toBeNull();
  });

  it("allows float/string age in outputStructureSchema: 10.5 dropped as type_mismatch without retry", async () => {
    const base = emptyOutput();
    const withFloat = {
      ...base,
      child: { ...base.child, age_years: 10.5 },
    };
    expect(outputStructureSchema.safeParse(withFloat).success).toBe(true);

    const withInt = {
      ...base,
      child: { ...base.child, age_years: 10 },
    };
    expect(outputStructureSchema.safeParse(withInt).success).toBe(true);

    const src = "[MOCK] বয়স ১০ বছর";
    const out = put(emptyOutput(), src, "child.age_years", 10.5 as never, "১০", "digits");
    const primary = fakeProvider("primary", [out]);
    const fallback = fakeProvider("fallback", []);
    const result = await createLlmAdapter({
      primary,
      fallback,
      dispatch,
      log: () => {},
    }).extract(inputFor(src));
    assert(result.ok);
    expect(result.draft.child.age_years).toBeNull();
    expect(result.dropped).toContainEqual({ field: "child.age_years", reason: "type_mismatch" });
    expect(primary.extract.mock.calls.length).toBe(1);
    expect(fallback.extract.mock.calls.length).toBe(0);
  });

  it("allows float in height_cm in outputStructureSchema", () => {
    const base = emptyOutput();
    const withFloatHeight = {
      ...base,
      child: { ...base.child, height_cm: 120.5 },
    };
    expect(outputStructureSchema.safeParse(withFloatHeight).success).toBe(true);
  });
});

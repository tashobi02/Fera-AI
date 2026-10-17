// TASK-013 fix round 3 tests (lead decision 2026-10-16):
// Sentence-scope qualifiers (BLOCK 1), height unit required (BLOCK 2), TC-002 shapes (BLOCK 4).
import { assert, describe, expect, it } from "vitest";
import { brandProviderDispatch, createLlmAdapter } from "@/server/ai";
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

describe("BLOCK 1: Sentence-scope qualifiers and corrections", () => {
  const UNCERTAIN_CASES: [tag: string, source: string, field: string, value: string | number, quote: string][] = [
    ["hoyto-after", "[MOCK] বয়স ১০, হয়তো", "child.age_years", 10, "১০"],
    ["hoyto-before", "[MOCK] হয়তো, বয়স ১০", "child.age_years", 10, "১০"],
    ["bodh-hoy-space", "[MOCK] বয়স ১০, বোধ হয়", "child.age_years", 10, "১০"],
    ["possibly-en", "[MOCK] age 10, possibly", "child.age_years", 10, "10"],
    ["not-certain-en", "[MOCK] age 10, not certain", "child.age_years", 10, "10"],
    ["believe-en", "[MOCK] I believe, age 10", "child.age_years", 10, "10"],
    ["sure-na-bn", "[MOCK] বয়স ১০, শিওর না", "child.age_years", 10, "১০"],
    ["sure-na-mixed", "[MOCK] বয়স ১০, sure না", "child.age_years", 10, "১০"],
    ["thik-jani-na", "[MOCK] বয়স ১০, ঠিক জানি না", "child.age_years", 10, "১০"],
    ["dharona", "[MOCK] বয়স ১০, ধারণা করছি", "child.age_years", 10, "১০"],
    ["hoyto-sex", "[MOCK] আমার ছেলে, হয়তো", "child.sex", "male", "ছেলে"],
    ["hoyto-phone", "[MOCK] নম্বর ০১৭১১২২৩৩৪৪, হয়তো", "reporter.phone", "01711223344", "০১৭১১২২৩৩৪৪"],
    ["two-away-andaj", "[MOCK] বয়স ১০, পোশাক: নীল জামা, সবই আন্দাজ", "child.age_years", 10, "১০"],
    ["corr-na-11", "[MOCK] বয়স ১০, না ১১", "child.age_years", 10, "১০"],
    ["corr-mane-11", "[MOCK] বয়স ১০, মানে ১১", "child.age_years", 10, "১০"],
    ["corr-actually", "[MOCK] age 10, actually 11", "child.age_years", 10, "10"],
    ["corr-name-nana", "[MOCK] নাম: রাফি, না না রাহি", "child.name", "রাফি", "রাফি"],
    ["corr-phone-na", "[MOCK] নম্বর ০১৭১১২২৩৩৪৪, না ০১৮১১২২৩৩৪৪", "reporter.phone", "01711223344", "০১৭১১২২৩৩৪৪"],
    ["corr-sex-sorry", "[MOCK] আমার ছেলে, sorry, daughter", "child.sex", "male", "ছেলে"],
    ["neg-adj-sex", "[MOCK] আমার ছেলে, না", "child.sex", "male", "ছেলে"],
    ["neg-adj-age", "[MOCK] বয়স ১০, না", "child.age_years", 10, "১০"],
    ["neg-sex-not", "[MOCK] my boy is not missing", "child.sex", "male", "boy"],
    ["corr-sorry", "[MOCK] age 10, sorry, 11", "child.age_years", 10, "10"],
    ["hoyto-in-name", "[MOCK] নাম: হয়তো রাফি", "child.name", "হয়তো রাফি", "হয়তো রাফি"],
    ["possibly-in-cloth", "[MOCK] clothing: possibly blue shirt", "child.clothing", "possibly blue shirt", "possibly blue shirt"],
  ];

  it.each(UNCERTAIN_CASES)("drops %s to unknown", async (_tag, source, field, value, quote) => {
    expect(await extractField(source, field, value, quote)).toBeNull();
  });

  it("drops event time when followed by qualifier in sentence: গতকাল বিকেলে, হয়তো", async () => {
    const src = "[MOCK] গতকাল বিকেলে, হয়তো";
    const tv = timeValueFor(src, "গতকাল বিকেলে");
    expect(await extractField(src, "event.at", tv.at, "গতকাল বিকেলে", "time_interval")).toBeNull();
  });

  it("drops event time when followed by correction in sentence: গতকাল বিকেলে, না সকালে", async () => {
    const src = "[MOCK] গতকাল বিকেলে, না সকালে";
    const tv = timeValueFor(src, "গতকাল বিকেলে");
    expect(await extractField(src, "event.at", tv.at, "গতকাল বিকেলে", "time_interval")).toBeNull();
  });

  // Superseded by user decision (Obidit, 2026-10-16: "forward scope + full text"):
  // A fact becomes unknown when ANY LATER sentence contains a qualifier.
  it("drops facts when a later sentence contains a qualifier: বয়স ১০। পোশাক নিয়ে নিশ্চিত না।", async () => {
    const src = "[MOCK] বয়স ১০। পোশাক নিয়ে নিশ্চিত না।";
    expect(await extractField(src, "child.age_years", 10, "১০")).toBeNull();
  });

  it("keeps controls without qualifiers", async () => {
    expect(await extractField("[MOCK] বয়স ১০ বছর", "child.age_years", 10, "১০")).toBe(10);
    expect(await extractField("[MOCK] নাম: রাফি", "child.name", "রাফি", "রাফি")).toBe("রাফি");
    expect(await extractField("[MOCK] নম্বর ০১৭১১২২৩৩৪৪", "reporter.phone", "01711223344", "০১৭১১২২৩৩৪৪", "digits")).toBe("01711223344");
  });
});

describe("BLOCK 2: Height must have an explicit unit", () => {
  it.each([
    ["উচ্চতা ৪৮", "child.height_cm", 48, "৪৮"],
    ["height 50", "child.height_cm", 50, "50"],
    ["উচ্চতা ৪ ফুট", "child.height_cm", 4, "৪"],
  ])("rejects unitless or unsupported height %j", async (source, field, value, quote) => {
    expect(await extractField(`[MOCK] ${source}`, field, value, quote)).toBeNull();
  });

  it.each([
    ["উচ্চতা ১২০ cm", "child.height_cm", 120, "১২০ cm"],
    ["উচ্চতা: ১২০ সেমি", "child.height_cm", 120, "১২০ সেমি"],
    ["উচ্চতা ১২০ সেন্টিমিটার", "child.height_cm", 120, "১২০ সেন্টিমিটার"],
  ])("accepts height with valid unit %j", async (source, field, value, quote) => {
    expect(await extractField(`[MOCK] ${source}`, field, value, quote)).toBe(120);
  });
});

describe("BLOCK 4: TC-002 shapes under sentence-scope rule", () => {
  it("extracts child.sex from possessive kin word followed by name: আমার ছেলে রাফি", async () => {
    expect(await extractField("[MOCK] আমার ছেলে রাফি", "child.sex", "male", "ছেলে")).toBe("male");
  });

  it("extracts child.sex from possessive kin word followed by name: আমার মেয়ে মিম", async () => {
    expect(await extractField("[MOCK] আমার মেয়ে মিম", "child.sex", "female", "মেয়ে")).toBe("female");
  });

  it("extracts event time from normaliser time-word grammar in narrative clause: গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি", async () => {
    const src = "[MOCK] গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি";
    const tv = timeValueFor(src, "গতকাল বিকেলে");
    expect(await extractField(src, "event.at", tv.at, "গতকাল বিকেলে", "time_interval")).toBe(tv.at);
  });

  it("extracts verbatim D6 TC-002 text with explicit unknowns and correct fields", async () => {
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
    expect(r.draft.child.name).toBeNull(); // Name stays unknown per OD-013-11 policy
    expect(r.draft.event.at).toBe(tv.at);
    expect(r.draft.event.at_lower).toBe(tv.at_lower);
    expect(r.draft.event.at_upper).toBe(tv.at_upper);
    expect(r.draft.event.at_approx).toBe(true);
    expect(r.draft.reporter.phone).toBe("01711223344");
    expect(r.draft.event.district_code).toBeNull();
    expect(r.dropped).toEqual([]);
  });

  describe("qualifiers in same sentence still drop new shapes", () => {
    it.each([
      ["আমার ছেলে রাফি, হয়তো", "child.sex", "male", "ছেলে"],
      ["আমার ছেলে রাফি, না", "child.sex", "male", "ছেলে"],
      ["আমার মেয়ে মিম, বোধহয়", "child.sex", "female", "মেয়ে"],
    ])("drops kin-name sex with qualifier: %s", async (src, field, val, quote) => {
      expect(await extractField(`[MOCK] ${src}`, field, val, quote)).toBeNull();
    });

    it("drops narrative event time when qualifier is in sentence: গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি, হয়তো", async () => {
      const src = "[MOCK] গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি, হয়তো";
      const tv = timeValueFor(src, "গতকাল বিকেলে");
      expect(await extractField(src, "event.at", tv.at, "গতকাল বিকেলে", "time_interval")).toBeNull();
    });

    it("drops narrative event time when correction is in sentence: গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি, না সকালে", async () => {
      const src = "[MOCK] গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি, না সকালে";
      const tv = timeValueFor(src, "গতকাল বিকেলে");
      expect(await extractField(src, "event.at", tv.at, "গতকাল বিকেলে", "time_interval")).toBeNull();
    });

    it("drops first-sentence facts in TC-002 if qualified, but keeps phone in second sentence", async () => {
      const src = "[MOCK] আমার ছেলে রাফি, হয়তো, বয়স ১৩, গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি। নম্বর ০১৭১১২২৩৩৪৪";
      const tv = timeValueFor(src, "গতকাল বিকেলে");
      const out = emptyOutput();
      put(out, src, "child.age_years", 13, "১৩", "digits");
      put(out, src, "child.sex", "male", "ছেলে");
      put(out, src, "reporter.phone", "01711223344", "০১৭১১২২৩৩৪৪", "digits");
      put(out, src, "event.at", tv.at, "গতকাল বিকেলে", "time_interval");
      put(out, src, "event.at_lower", tv.at_lower, "গতকাল বিকেলে", "time_interval");
      put(out, src, "event.at_upper", tv.at_upper, "গতকাল বিকেলে", "time_interval");

      const r = await createLlmAdapter({
        primary: fakeProvider("primary", [out]),
        fallback: fakeProvider("fallback", []),
        dispatch,
        log: () => {},
      }).extract(inputFor(src));

      assert(r.ok);
      expect(r.draft.child.sex).toBe("unknown");
      expect(r.draft.child.age_years).toBeNull();
      expect(r.draft.event.at).toBeNull();
      expect(r.draft.reporter.phone).toBe("01711223344");
    });
  });
});

// TASK-013 fix round 5 tests (user decision 2026-10-16: "forward scope + full text"):
// Forward scope uncertainty across sentences, expanded correction words, kin relationship nouns,
// trailing question delimiter, fractional/string age per-field type_mismatch, and keep controls.
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

describe("TASK-013 fix round 5: Forward scope and expanded correction words", () => {
  describe("Multi-field forward scope retractions", () => {
    it("drops both age and phone: বয়স ১০। নম্বর ০১৭১১২২৩৩৪৪। না, ১১।", async () => {
      const src = "[MOCK] বয়স ১০। নম্বর ০১৭১১২২৩৩৪৪। না, ১১।";
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
      expect(r.draft.child.age_years).toBeNull();
      expect(r.draft.reporter.phone).toBeNull();
      expect(r.dropped.map((d) => d.reason)).toEqual(["uncertain", "uncertain"]);
    });

    it("drops both age and phone: age 10. phone 01711223344. No, 11.", async () => {
      const src = "[MOCK] age 10. phone 01711223344. No, 11.";
      const out = emptyOutput();
      put(out, src, "child.age_years", 10, "10", "direct");
      put(out, src, "reporter.phone", "01711223344", "01711223344", "digits");
      const r = await createLlmAdapter({
        primary: fakeProvider("primary", [out]),
        fallback: fakeProvider("fallback", []),
        dispatch,
        log: () => {},
      }).extract(inputFor(src));
      assert(r.ok);
      expect(r.draft.child.age_years).toBeNull();
      expect(r.draft.reporter.phone).toBeNull();
      expect(r.dropped.map((d) => d.reason)).toEqual(["uncertain", "uncertain"]);
    });

    it("drops both name and age: নাম: রাফি। বয়স ১০। না না, রাহি।", async () => {
      const src = "[MOCK] নাম: রাফি। বয়স ১০। না না, রাহি।";
      const out = emptyOutput();
      put(out, src, "child.name", "রাফি", "রাফি", "direct");
      put(out, src, "child.age_years", 10, "১০", "digits");
      const r = await createLlmAdapter({
        primary: fakeProvider("primary", [out]),
        fallback: fakeProvider("fallback", []),
        dispatch,
        log: () => {},
      }).extract(inputFor(src));
      assert(r.ok);
      expect(r.draft.child.name).toBeNull();
      expect(r.draft.child.age_years).toBeNull();
      expect(r.dropped.map((d) => d.reason)).toEqual(["uncertain", "uncertain"]);
    });
  });

  describe("Single-field forward scope and hedge/correction words", () => {
    const UNCERTAIN_CASES: [tag: string, source: string, field: string, value: string | number, quote: string][] = [
      ["hoyto-later", "[MOCK] বয়স ১০। হয়তো।", "child.age_years", 10, "১০"],
      ["maybe-later", "[MOCK] age 10. Maybe.", "child.age_years", 10, "10"],
      ["approx-later", "[MOCK] age 10. approx.", "child.age_years", 10, "10"],
      ["aano-later", "[MOCK] বয়স ১০। আনু.", "child.age_years", 10, "১০"],
      ["hobe-later", "[MOCK] বয়স ১০। ১১ হবে।", "child.age_years", 10, "১০"],
      ["nischit-na-later", "[MOCK] বয়স ১০। এটা নিশ্চিত না।", "child.age_years", 10, "১০"],
      ["not-sure-later", "[MOCK] age 10. I'm not sure about that.", "child.age_years", 10, "10"],
      ["thik-jani-na-later", "[MOCK] বয়স ১০। বয়সটা ঠিক জানি না।", "child.age_years", 10, "১০"],
      ["andaj-later", "[MOCK] বয়স ১০। সবটাই আন্দাজ।", "child.age_years", 10, "১০"],
      ["trailing-question-later", "[MOCK] বয়স ১০। ১১?", "child.age_years", 10, "১০"],
      ["actually-later", "[MOCK] age 10. 11 actually.", "child.age_years", 10, "10"],
      ["ashole-before-11-later", "[MOCK] বয়স ১০। আসলে ১১।", "child.age_years", 10, "১০"],
      ["ashole-after-11-later", "[MOCK] বয়স ১০। ১১ আসলে।", "child.age_years", 10, "১০"],
      ["dukkhito-later", "[MOCK] বয়স ১০। দুঃখিত, ১১।", "child.age_years", 10, "১০"],
      ["bhul-bollam-later", "[MOCK] বয়স ১০। ভুল বললাম, ১১।", "child.age_years", 10, "১০"],
      ["naah-later", "[MOCK] বয়স ১০। নাহ, ১১।", "child.age_years", 10, "১০"],
      ["wait-later", "[MOCK] age 10. Wait, 11.", "child.age_years", 10, "10"],
      ["oops-later", "[MOCK] age 10. Oops, 11.", "child.age_years", 10, "10"],
      ["correction-later", "[MOCK] age 10. Correction: 11.", "child.age_years", 10, "10"],
      ["i-meant-later", "[MOCK] age 10. I meant 11.", "child.age_years", 10, "10"],
    ];

    it.each(UNCERTAIN_CASES)("drops %s to unknown", async (_tag, source, field, value, quote) => {
      expect(await extractField(source, field, value, quote)).toBeNull();
    });
  });

  describe("Kept controls", () => {
    it("keeps facts when qualifier appears only in an earlier sentence: পোশাক নিয়ে নিশ্চিত না। বয়স ১০।", async () => {
      expect(await extractField("[MOCK] পোশাক নিয়ে নিশ্চিত না। বয়স ১০।", "child.age_years", 10, "১০")).toBe(10);
    });

    it("keeps multiple facts in separate sentences without qualifiers: বয়স ১০। নাম: রাফি", async () => {
      const src = "[MOCK] বয়স ১০। নাম: রাফি";
      const out = emptyOutput();
      put(out, src, "child.age_years", 10, "১০", "digits");
      put(out, src, "child.name", "রাফি", "রাফি", "direct");
      const r = await createLlmAdapter({
        primary: fakeProvider("primary", [out]),
        fallback: fakeProvider("fallback", []),
        dispatch,
        log: () => {},
      }).extract(inputFor(src));
      assert(r.ok);
      expect(r.draft.child.age_years).toBe(10);
      expect(r.draft.child.name).toBe("রাফি");
      expect(r.dropped).toEqual([]);
    });

    it("keeps facts with non-negation phrase 'Nothing else.': age 10. Nothing else.", async () => {
      expect(await extractField("[MOCK] age 10. Nothing else.", "child.age_years", 10, "10")).toBe(10);
    });

    it("keeps facts alongside 'সব ঠিক আছে': বয়স ১০। সব ঠিক আছে", async () => {
      expect(await extractField("[MOCK] বয়স ১০। সব ঠিক আছে", "child.age_years", 10, "১০")).toBe(10);
    });

    it("keeps facts alongside 'Everything is correct.': age 10. Everything is correct.", async () => {
      expect(await extractField("[MOCK] age 10. Everything is correct.", "child.age_years", 10, "10")).toBe(10);
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
      expect(r.dropped).toEqual([]);
    });
  });

  describe("WARN fixes: kin relationship nouns and fractional/string age per-field drop", () => {
    it.each([
      ["bn-meye-shashuri", "[MOCK] আমার মেয়ে শাশুড়ি", "child.sex", "female", "মেয়ে"],
      ["bn-chele-shwoshur", "[MOCK] আমার ছেলে শ্বশুর", "child.sex", "male", "ছেলে"],
      ["bn-meye-nonod", "[MOCK] আমার মেয়ে ননদ", "child.sex", "female", "মেয়ে"],
      ["bn-chele-debor", "[MOCK] আমার ছেলে দেবর", "child.sex", "male", "ছেলে"],
      ["bn-chele-bhabi", "[MOCK] আমার ছেলে ভাবি", "child.sex", "male", "ছেলে"],
    ])("rejects relationship noun after kin word: %s", async (_tag, source, field, value, quote) => {
      expect(await extractField(source, field, value, quote)).toBeNull();
    });

    // Round-5 review: the span/clause check alone accepts "আমার ছেলে <word>" (the trailing word reads as a name),
    // so only the kin guard can make these unknown. The name control proves the span check passes.
    it("kin guard, not the span check, drops sex after a relationship noun", async () => {
      expect(await extractField("[MOCK] আমার ছেলে রাফি", "child.sex", "male", "ছেলে")).toBe("male");
      expect(await extractField("[MOCK] আমার মেয়ে রাহি", "child.sex", "female", "মেয়ে")).toBe("female");
      expect(await extractField("[MOCK] আমার ছেলে বন্ধু", "child.sex", "male", "ছেলে")).toBeNull();
      expect(await extractField("[MOCK] my son husband", "child.sex", "male", "son")).toBeNull();
    });

    it("allows float in outputStructureSchema and drops it as type_mismatch without retry", async () => {
      const base = emptyOutput();
      expect(outputStructureSchema.safeParse({ ...base, child: { ...base.child, age_years: 10.5 } }).success).toBe(true);
      expect(outputStructureSchema.safeParse({ ...base, child: { ...base.child, age_years: "10" } }).success).toBe(true);
      expect(outputStructureSchema.safeParse({ ...base, child: { ...base.child, age_years: { bad: true } } }).success).toBe(false);

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

    it("allows string age in outputStructureSchema and drops it as type_mismatch without retry", async () => {
      const src = "[MOCK] বয়স ১০ বছর";
      const out = put(emptyOutput(), src, "child.age_years", "10" as never, "১০", "digits");
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
  });
});

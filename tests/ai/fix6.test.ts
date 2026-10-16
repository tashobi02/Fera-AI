// TASK-013 fix round 6 tests (Task A7, 2026-10-16):
// 1. Qualifier just BEFORE an unlabelled fact drops fact to unknown;
// 2. Kept controls (own sentence has label, verbatim TC-002, etc.);
// 3. Forward-pointing whole-text references (নিচের, পরের, below, following, what follows);
// 4. Prefix ভুল (ভুলে, ভুলভাবে, ভুলই) vs name ভুলু, and new corrections (শুধরে, scratch that, my mistake, rather);
// 5. Fullwidth "？", "…", and number slash alternatives ("১০/১১");
// 6. Kin guard expansion (নাতি, নাতনি, চাচা, মামা, খালা, ফুপু, bf, gf) and possessive inflections (-এর, -য়ের, -র).
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

describe("TASK-013 fix round 6: Qualifier before unlabelled facts, whole-text refs, prefix bhul, fullwidth delimiters, kin guard", () => {
  describe("BLOCK: qualifier just BEFORE an unlabelled fact", () => {
    it("drops age when unit-only age is preceded by qualifier: বয়স সম্ভবত\\n১০ বছর", async () => {
      expect(await extractField("[MOCK] বয়স সম্ভবত\n১০ বছর", "child.age_years", 10, "১০", "digits")).toBeNull();
    });

    it("drops age when unit-only age is preceded by qualifier: বয়স প্রায়। ১০ বছর।", async () => {
      expect(await extractField("[MOCK] বয়স প্রায়। ১০ বছর।", "child.age_years", 10, "১০", "digits")).toBeNull();
    });

    it("drops age when unit-only age is preceded by qualifier: age maybe\\n10 years", async () => {
      expect(await extractField("[MOCK] age maybe\n10 years", "child.age_years", 10, "10", "direct")).toBeNull();
    });

    it("drops height when unit-only height is preceded by qualifier: উচ্চতা প্রায়\\n১২০ সেমি", async () => {
      expect(await extractField("[MOCK] উচ্চতা প্রায়\n১২০ সেমি", "child.height_cm", 120, "১২০", "digits")).toBeNull();
    });

    it("drops event time when bare time phrase is preceded by qualifier: সম্ভবত\\nগতকাল বিকেলে", async () => {
      const src = "[MOCK] সম্ভবত\nগতকাল বিকেলে";
      const tv = timeValueFor(src, "গতকাল বিকেলে");
      const out = emptyOutput();
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
      expect(r.draft.event.at).toBeNull();
      expect(r.dropped).toContainEqual({ field: "event.at", reason: "uncertain" });
    });

    it("drops sex when kin-only clause is preceded by qualifier: ঠিক জানি না\\nআমার ছেলে", async () => {
      expect(await extractField("[MOCK] ঠিক জানি না\nআমার ছেলে", "child.sex", "male", "ছেলে")).toBeNull();
    });

    it("drops age when unit-only age is preceded by qualifier: ঠিক জানি না। ১০ বছর।", async () => {
      expect(await extractField("[MOCK] ঠিক জানি না। ১০ বছর।", "child.age_years", 10, "১০", "digits")).toBeNull();
    });

    it("drops age when unit-only age is preceded by qualifier: I'm not sure. 10 years old.", async () => {
      expect(await extractField("[MOCK] I'm not sure. 10 years old.", "child.age_years", 10, "10", "direct")).toBeNull();
    });
  });

  describe("Kept controls", () => {
    it("keeps fact when its OWN sentence contains the field label: পোশাক নিয়ে নিশ্চিত না। বয়স ১০।", async () => {
      expect(await extractField("[MOCK] পোশাক নিয়ে নিশ্চিত না। বয়স ১০।", "child.age_years", 10, "১০", "digits")).toBe(10);
    });

    it("keeps name when its OWN sentence contains the field label: পোশাক নিয়ে নিশ্চিত না। নাম: রাফি।", async () => {
      expect(await extractField("[MOCK] পোশাক নিয়ে নিশ্চিত না। নাম: রাফি।", "child.name", "রাফি", "রাফি")).toBe("রাফি");
    });

    it("keeps age when previous sentence is neutral: সব ঠিক আছে। বয়স ১০।", async () => {
      expect(await extractField("[MOCK] সব ঠিক আছে। বয়স ১০।", "child.age_years", 10, "১০", "digits")).toBe(10);
    });

    it("keeps age when previous sentence is neutral in English: Everything is correct. age 10.", async () => {
      expect(await extractField("[MOCK] Everything is correct. age 10.", "child.age_years", 10, "10")).toBe(10);
    });

    it("keeps verbatim D6 TC-002 text intact", async () => {
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

  describe("WARN 1: Forward-pointing whole-text references", () => {
    it("drops age with নিচের তথ্য নিশ্চিত না: নিচের তথ্য নিশ্চিত না। বয়স ১০।", async () => {
      expect(await extractField("[MOCK] নিচের তথ্য নিশ্চিত না। বয়স ১০।", "child.age_years", 10, "১০", "digits")).toBeNull();
    });

    it("drops age with what follows: Not sure about what follows. age 10.", async () => {
      expect(await extractField("[MOCK] Not sure about what follows. age 10.", "child.age_years", 10, "10", "direct")).toBeNull();
    });

    it("drops age with following: The following may be wrong. age 10.", async () => {
      expect(await extractField("[MOCK] The following may be wrong. age 10.", "child.age_years", 10, "10", "direct")).toBeNull();
    });

    it("drops age with পরের: পরের সব তথ্য ভুল। বয়স ১০।", async () => {
      expect(await extractField("[MOCK] পরের সব তথ্য ভুল। বয়স ১০।", "child.age_years", 10, "১০", "digits")).toBeNull();
    });

    it("drops age with below: Everything below is uncertain. age 10.", async () => {
      expect(await extractField("[MOCK] Everything below is uncertain. age 10.", "child.age_years", 10, "10", "direct")).toBeNull();
    });
  });

  describe("WARN 2: Prefix ভুল and correction words vs name ভুলু", () => {
    it("drops age when followed by ভুলে: বয়স ১০। ভুলে ১১ বললাম।", async () => {
      expect(await extractField("[MOCK] বয়স ১০। ভুলে ১১ বললাম।", "child.age_years", 10, "১০", "digits")).toBeNull();
    });

    it("drops age when followed by ভুলভাবে: বয়স ১০। ভুলভাবে ১১ বলেছি।", async () => {
      expect(await extractField("[MOCK] বয়স ১০। ভুলভাবে ১১ বলেছি।", "child.age_years", 10, "১০", "digits")).toBeNull();
    });

    it("drops age when followed by ভুলই: বয়স ১০। ভুলই বলেছি, ১১।", async () => {
      expect(await extractField("[MOCK] বয়স ১০। ভুলই বলেছি, ১১।", "child.age_years", 10, "১০", "digits")).toBeNull();
    });

    it("drops age when followed by শুধরে: বয়স ১০। শুধরে ১১।", async () => {
      expect(await extractField("[MOCK] বয়স ১০। শুধরে ১১।", "child.age_years", 10, "১০", "digits")).toBeNull();
    });

    it("drops age when followed by scratch that: age 10. Scratch that, 11.", async () => {
      expect(await extractField("[MOCK] age 10. Scratch that, 11.", "child.age_years", 10, "10", "direct")).toBeNull();
    });

    it("drops age when followed by my mistake: age 10. My mistake, 11.", async () => {
      expect(await extractField("[MOCK] age 10. My mistake, 11.", "child.age_years", 10, "10", "direct")).toBeNull();
    });

    it("drops age when followed by rather: age 10. Rather, 11.", async () => {
      expect(await extractField("[MOCK] age 10. Rather, 11.", "child.age_years", 10, "10", "direct")).toBeNull();
    });

    it("keeps name ভুলু (direction test: prefix bhul must NOT match name bhulu)", async () => {
      expect(await extractField("[MOCK] নাম: ভুলু", "child.name", "ভুলু", "ভুলু")).toBe("ভুলু");
    });

    it("keeps name ভুলু and age 10: নাম: ভুলু। বয়স ১০।", async () => {
      const src = "[MOCK] নাম: ভুলু। বয়স ১০।";
      const out = emptyOutput();
      put(out, src, "child.name", "ভুলু", "ভুলু", "direct");
      put(out, src, "child.age_years", 10, "১০", "digits");
      const r = await createLlmAdapter({
        primary: fakeProvider("primary", [out]),
        fallback: fakeProvider("fallback", []),
        dispatch,
        log: () => {},
      }).extract(inputFor(src));
      assert(r.ok);
      expect(r.draft.child.name).toBe("ভুলু");
      expect(r.draft.child.age_years).toBe(10);
      expect(r.dropped).toEqual([]);
    });
  });

  describe("WARN 3: Fullwidth ？, …, and number slash alternatives (১০/১১)", () => {
    it("drops age with fullwidth ？: বয়স ১০？", async () => {
      expect(await extractField("[MOCK] বয়স ১০？", "child.age_years", 10, "১০", "digits")).toBeNull();
    });

    it("drops age with fullwidth ？ in English: age 10？", async () => {
      expect(await extractField("[MOCK] age 10？", "child.age_years", 10, "10", "direct")).toBeNull();
    });

    it("drops age with horizontal ellipsis …: বয়স ১০…", async () => {
      expect(await extractField("[MOCK] বয়স ১০…", "child.age_years", 10, "১০", "digits")).toBeNull();
    });

    it("drops age with horizontal ellipsis … in English: age 10…", async () => {
      expect(await extractField("[MOCK] age 10…", "child.age_years", 10, "10", "direct")).toBeNull();
    });

    it("drops age with slash alternative: বয়স ১০/১১", async () => {
      expect(await extractField("[MOCK] বয়স ১০/১১", "child.age_years", 10, "১০", "digits")).toBeNull();
    });

    it("drops age with slash alternative and unit: বয়স ১০/১১ বছর", async () => {
      expect(await extractField("[MOCK] বয়স ১০/১১ বছর", "child.age_years", 10, "১০", "digits")).toBeNull();
    });

    it("drops age with slash alternative in English: age 10/11", async () => {
      expect(await extractField("[MOCK] age 10/11", "child.age_years", 10, "10", "direct")).toBeNull();
    });

    it("drops height with slash alternative: উচ্চতা ১২০/১২৫ সেমি", async () => {
      expect(await extractField("[MOCK] উচ্চতা ১২০/১২৫ সেমি", "child.height_cm", 120, "১২০", "digits")).toBeNull();
    });
  });

  describe("WARN 4: Kin guard expansion and possessive inflections", () => {
    it("drops sex with নাতি: আমার মেয়ে নাতি", async () => {
      expect(await extractField("[MOCK] আমার মেয়ে নাতি", "child.sex", "female", "মেয়ে")).toBeNull();
    });

    it("drops sex with চাচা: আমার ছেলে চাচা", async () => {
      expect(await extractField("[MOCK] আমার ছেলে চাচা", "child.sex", "male", "ছেলে")).toBeNull();
    });

    it("drops sex with জামাইয়ের (possessive inflection): আমার মেয়ে জামাইয়ের", async () => {
      expect(await extractField("[MOCK] আমার মেয়ে জামাইয়ের", "child.sex", "female", "মেয়ে")).toBeNull();
    });

    it("drops sex with বন্ধুর (possessive inflection): আমার ছেলে বন্ধুর", async () => {
      expect(await extractField("[MOCK] আমার ছেলে বন্ধুর", "child.sex", "male", "ছেলে")).toBeNull();
    });

    it("drops sex with মামা: আমার ছেলে মামা", async () => {
      expect(await extractField("[MOCK] আমার ছেলে মামা", "child.sex", "male", "ছেলে")).toBeNull();
    });

    it("drops sex with খালা: আমার মেয়ে খালা", async () => {
      expect(await extractField("[MOCK] আমার মেয়ে খালা", "child.sex", "female", "মেয়ে")).toBeNull();
    });

    it("drops sex with ফুপু: আমার ছেলে ফুপু", async () => {
      expect(await extractField("[MOCK] আমার ছেলে ফুপু", "child.sex", "male", "ছেলে")).toBeNull();
    });

    it("drops sex with bf: my boy bf", async () => {
      expect(await extractField("[MOCK] my boy bf", "child.sex", "male", "boy")).toBeNull();
    });

    it("drops sex with gf: my girl gf", async () => {
      expect(await extractField("[MOCK] my girl gf", "child.sex", "female", "girl")).toBeNull();
    });

    it("keeps sex male for kin followed by name: আমার ছেলে রাফি", async () => {
      expect(await extractField("[MOCK] আমার ছেলে রাফি", "child.sex", "male", "ছেলে")).toBe("male");
    });

    it("keeps sex female for kin followed by name: আমার মেয়ে মিম", async () => {
      expect(await extractField("[MOCK] আমার মেয়ে মিম", "child.sex", "female", "মেয়ে")).toBe("female");
    });
  });
});


describe("A7 Sol regression checks", () => {
  it.each([
    "[MOCK] Following information is uncertain. age 10.",
    "[MOCK] age 10. This is uncertain.",
  ])("drops explicitly uncertain age: %s", async (source) => {
    expect(await extractField(source, "child.age_years", 10, "10")).toBeNull();
  });

  it("keeps token boundaries for the synthetic name Uncertainly", async () => {
    expect(await extractField("[MOCK] name: Uncertainly", "child.name", "Uncertainly", "Uncertainly")).toBe("Uncertainly");
  });

  it.each(["?", "？", "…"])("preserves spaced previous-sentence marker %s for kin sex", async (marker) => {
    const source = `[MOCK] 10 years ${marker}\nআমার ছেলে`;
    const out = put(emptyOutput(), source, "child.sex", "male", "ছেলে");
    const result = await createLlmAdapter({ primary: fakeProvider("primary", [out]), fallback: fakeProvider("fallback", []), dispatch, log: () => {} }).extract(inputFor(source));
    assert(result.ok);
    expect(result.draft.child.sex).toBe("unknown");
    expect(result.dropped).toContainEqual({ field: "child.sex", reason: "uncertain" });
    expect(result.draft.evidence["child.sex"]).toBeUndefined();
  });

  it("recognises NFC and NFD own clothing labels after an unrelated qualifier", async () => {
    for (const label of ["পোশাক", "পোশাক".normalize("NFD")]) {
      const source = `[MOCK] ঠিক জানি না। ${label}: নীল জামা।`;
      expect(await extractField(source, "child.clothing", "নীল জামা", "নীল জামা")).toBe("নীল জামা");
    }
  });

  it.each(["নাতনি", "নাতনির", "চাচার", "মামার", "খালার", "ফুপুর", "বন্ধুএর", "bfএর", "gfএর"])("drops sex with relationship noun/possessive %s", async (noun) => {
    expect(await extractField(`[MOCK] আমার ছেলে ${noun}`, "child.sex", "male", "ছেলে")).toBeNull();
  });

  it.each(["?", "？", "…"])("preserves standalone later uncertainty marker %s", async (marker) => {
    expect(await extractField(`[MOCK] age 10. ${marker}`, "child.age_years", 10, "10")).toBeNull();
  });
});

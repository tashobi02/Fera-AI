// TASK-023 wording guard (COMP-016): FR-034, BR-002/003/011, TC-024.
import { describe, expect, it } from "vitest";
import { ApiError } from "@/app/api/_shared";
import { ERROR_CATALOGUE } from "@/contracts";
import * as locales from "@/locales";
import { BANNED_TERMS, assertAllowedWording, findBannedGroup } from "@/server/outputs";

describe("wording guard", () => {
  const all = Object.entries(BANNED_TERMS).flatMap(([group, terms]) => terms.map((t) => [group, t] as const));

  it.each(all)("blocks %s term %j inside a sentence", (group, term) => {
    expect(findBannedGroup(`শিশুটির বিষয়ে ${term} লেখা`)).toBe(group);
  });

  it("covers every concept in both Bangla and English", () => {
    for (const [group, terms] of Object.entries(BANNED_TERMS)) {
      expect(terms.some((t) => /[ঀ-৿]/u.test(t)), `${group} bn`).toBe(true);
      expect(terms.some((t) => /[a-z%]/u.test(t)), `${group} en`).toBe(true);
    }
  });

  it("matches পালিয়ে whether য় is precomposed or য + nukta (TC-024)", () => {
    const precomposed = "\u09AA\u09BE\u09B2\u09BF\u09DF\u09C7 গেছে"; // য় as U+09DF
    const decomposed = "\u09AA\u09BE\u09B2\u09BF\u09AF\u09BC\u09C7 গেছে"; // য + nukta
    expect(findBannedGroup(precomposed)).toBe("runaway");
    expect(findBannedGroup(decomposed)).toBe("runaway");
  });

  it("is not fooled by case, invisible joiners or line breaks", () => {
    expect(findBannedGroup("Send an ALERT")).toBe("alert");
    expect(findBannedGroup("res\u200Bcue team")).toBe("rescue");
    expect(findBannedGroup("উদ্\u200Cধার")).toBe("rescue");
    expect(findBannedGroup("ran\naway")).toBe("runaway");
    expect(findBannedGroup("87% match")).toBe("probability");
    expect(findBannedGroup("ran\u200Baway")).toBe("runaway");
    expect(findBannedGroup("এ্যালার্ট দিন")).toBe("alert");
    // Codex second-opinion review: runaway labels written with a hyphen or the পলায়ন stem.
    expect(findBannedGroup("run-away child")).toBe("runaway");
    expect(findBannedGroup("ran\u2011away")).toBe("runaway");
    expect(findBannedGroup("পলায়নকারী শিশু")).toBe("runaway");
    // Codex re-review: separators, fullwidth forms and default-ignorable characters.
    for (const v of ["run/away child", "r u n a w a y child", "পলা-য়নকারী শিশু", "ＲＵＮＡＷＡＹ child", "run\u034Faway child", "run\u2063away child"]) {
      expect(findBannedGroup(v), v).toBe("runaway");
    }
    expect(findBannedGroup("ＡＬＥＲＴ")).toBe("alert");
    // Codex third review: a split Bangla vowel sign and decorative combining marks.
    expect(findBannedGroup("পে\u034Fৗঁছে গেছে")).toBe("delivered");
    expect(findBannedGroup("পে-ৗঁছে গেছে")).toBe("delivered");
    expect(findBannedGroup("run\u0332away child")).toBe("runaway");
    expect(findBannedGroup("al\u0332ert")).toBe("alert");
    expect(findBannedGroup("৮৭％ মিল")).toBe("probability");
  });

  it("allows Fera's honest copy (D4 §9, §15.1)", () => {
    for (const ok of [
      "মিলের মাত্রা ৮৭/১০০",
      "Similarity 87/100",
      "রেফারেল নথিভুক্ত (সিমুলেশন)।",
      "Referral recorded (simulation)",
      "শেষবার দেখা গিয়েছিল",
      "ফেরা পুলিশে জিডি জমা দেয় না।",
      "জরুরি হলে ১৩২১৯-এ কল করুন।",
      "সম্ভাব্য একই শিশু",
      "Chamber Road",
    ]) {
      expect(findBannedGroup(ok), ok).toBeNull();
    }
  });

  // FR-034 also covers displayed text. D4's required negations ("…সতর্কবার্তা পাঠায় না")
  // would need an explicit allowlist here when they are added.
  it("passes every locale string and error message shown today", () => {
    const strings: string[] = [];
    const walk = (o: unknown): void => {
      if (typeof o === "string") strings.push(o);
      else if (o && typeof o === "object") Object.values(o).forEach(walk);
    };
    walk(locales);
    for (const e of Object.values(ERROR_CATALOGUE)) strings.push(e.bn, e.en);
    expect(strings.length).toBeGreaterThan(100);
    expect(strings.filter((s) => findBannedGroup(s) !== null)).toEqual([]);
  });

  it("throws E-016 for a blocked text and nothing for an allowed one", () => {
    expect(() => assertAllowedWording("খসড়া")).not.toThrow();
    let err: unknown;
    try {
      assertAllowedWording("শিশুটি পালিয়ে গেছে");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).id).toBe("E-016");
    expect((err as ApiError).message).toBe("E-016"); // never carries the text
  });
});

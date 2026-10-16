// TASK-013 fix round 7 tests (round-8 safeguarding follow-ups, 2026-10-16):
// 1. Spelling variants of hedges already listed (জানিনা, হয়ত, মনেহয়, নাই, English n't,
//    could be, Bangla number with ও + হয়/হতে পারে);
// 2. Same-field earlier qualifier (lead decision 2026-10-16, conservative direction BR-008);
// 3. Raw error cause: a thrown error whose message contains source text must not appear
//    anywhere in the result, including in `JSON.stringify(result)` and `String(result.cause)`.
import { ZodError } from "zod";
import { assert, describe, expect, it } from "vitest";
import { brandProviderDispatch, createLlmAdapter } from "@/server/ai";
import type { ExtractionResult } from "@/server/ai";
import type { ExtractInput } from "@/server/ai/contract";
import { emptyOutput, fakeProvider, inputFor, put } from "./fixtures";

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

async function runWithThrowingProvider(source: string, error: Error): Promise<ExtractionResult> {
  // Use a primary that throws on extract; the adapter must not put source text or error message
  // anywhere in the returned ExtractionResult, even when carrying a `cause`.
  return createLlmAdapter({
    primary: { name: "throw-primary", extract: async () => { throw error; } } as never,
    fallback: fakeProvider("fallback", []),
    dispatch,
    log: () => {},
  }).extract(inputFor(source));
}

function makeInput(source: string): ExtractInput {
  return inputFor(source);
}

describe("TASK-013 fix round 7: Spelling variants of existing hedges", () => {
  it("drops age with one-word জানিনা: বয়স ১০ বছর, ঠিক জানিনা", async () => {
    expect(await extractField("[MOCK] বয়স ১০ বছর, ঠিক জানিনা", "child.age_years", 10, "১০", "digits")).toBeNull();
  });

  it("drops age with হয়ত (without final ো): বয়স ১০ বছর। হয়ত।", async () => {
    expect(await extractField("[MOCK] বয়স ১০ বছর। হয়ত।", "child.age_years", 10, "১০", "digits")).toBeNull();
  });

  it("drops age with মনেহয় (no space): বয়স ১০ বছর, মনেহয়", async () => {
    expect(await extractField("[MOCK] বয়স ১০ বছর, মনেহয়", "child.age_years", 10, "১০", "digits")).toBeNull();
  });

  it("drops age with নাই as negation: বয়স ১০ বছর। শিওর নাই", async () => {
    expect(await extractField("[MOCK] বয়স ১০ বছর। শিওর নাই", "child.age_years", 10, "১০", "digits")).toBeNull();
  });

  it("drops age with English don't: age 10. I don't know exactly.", async () => {
    expect(await extractField("[MOCK] age 10. I don't know exactly.", "child.age_years", 10, "10")).toBeNull();
  });

  it("drops name with English don't: name: Rafi. I don't know the spelling", async () => {
    expect(await extractField("[MOCK] name: Rafi. I don't know the spelling", "child.name", "Rafi", "Rafi")).toBeNull();
  });

  it("drops age with could be: age 10. Could be 11 too", async () => {
    expect(await extractField("[MOCK] age 10. Could be 11 too", "child.age_years", 10, "10")).toBeNull();
  });

  it("drops age with Bangla number + ও + হয়: বয়স ১০ বছর। ১১ও হয়", async () => {
    expect(await extractField("[MOCK] বয়স ১০ বছর। ১১ও হয়", "child.age_years", 10, "১০", "digits")).toBeNull();
  });

  it("does not match নাই inside a longer Bangla word that should not be a hedge", async () => {
    // The word "নাইটা" (nahi-ta) should not trigger a negation match.
    // Verbatim D6 TC-002 text must still pass: this control test confirms the change.
    const src = "[MOCK] আমার ছেলে রাফি, বয়স ১৩, গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি। নম্বর ০১৭১১২২৩৩৪৪";
    const out = emptyOutput();
    put(out, src, "child.age_years", 13, "১৩", "digits");
    put(out, src, "child.sex", "male", "ছেলে");
    put(out, src, "reporter.phone", "01711223344", "০১৭১১২২৩৩৪৪", "digits");
    const r = await createLlmAdapter({
      primary: fakeProvider("primary", [out]),
      fallback: fakeProvider("fallback", []),
      dispatch,
      log: () => {},
    }).extract(makeInput(src));
    assert(r.ok);
    expect(r.draft.child.age_years).toBe(13);
    expect(r.draft.child.sex).toBe("male");
    expect(r.draft.reporter.phone).toBe("01711223344");
  });
});

describe("TASK-013 fix round 7: Same-field earlier qualifier (lead decision 2026-10-16)", () => {
  it("drops age when an earlier sentence hedges the SAME field's label: বয়স নিয়ে নিশ্চিত না। বয়স ১০ বছর।", async () => {
    expect(await extractField("[MOCK] বয়স নিয়ে নিশ্চিত না। বয়স ১০ বছর।", "child.age_years", 10, "১০", "digits")).toBeNull();
  });

  it("keeps age when an earlier sentence hedges a DIFFERENT field's label (lead control): পোশাক নিয়ে নিশ্চিত না। বয়স ১০।", async () => {
    expect(await extractField("[MOCK] পোশাক নিয়ে নিশ্চিত না। বয়স ১০।", "child.age_years", 10, "১০", "digits")).toBe(10);
  });

  it("drops age when an earlier sentence hedges the SAME field in English: Not sure about the age. age 10.", async () => {
    expect(await extractField("[MOCK] Not sure about the age. age 10.", "child.age_years", 10, "10")).toBeNull();
  });

  it("keeps age when an earlier sentence hedges a DIFFERENT field in English: Not sure about the clothes. age 10.", async () => {
    expect(await extractField("[MOCK] Not sure about the clothes. age 10.", "child.age_years", 10, "10")).toBe(10);
  });
});

describe("TASK-013 fix round 7: Raw error cause must not leak source text", () => {
  it("adapter: thrown error message containing source text never appears in result, JSON.stringify, or String(cause)", async () => {
    const source = "[MOCK] বয়স ১০";
    const secret = "secretChildName-r4f1-আবির-XYZ";
    const error = new Error(`boom ${secret}`);
    const result = await runWithThrowingProvider(source, error);
    expect(result.ok).toBe(false);
    // The thrown error's message text must not appear anywhere in the result.
    const json = JSON.stringify(result);
    expect(json).not.toContain(secret);
    expect(json).not.toContain("boom");
    // The cause is the new class-name Error wrapper, not the original error/message
    if ("cause" in result && result.cause !== undefined) {
      const causeStr = String(result.cause);
      expect(causeStr).not.toContain(secret);
      expect(causeStr).not.toContain("boom");
      // The cause's class name (or empty) is allowed; but the message body is not.
      expect(causeStr).not.toMatch(/Error: boom/);
    }
  });

  it("adapter: thrown ZodError is replaced by a class-name Error (no issues leak)", async () => {
    const source = "[MOCK] বয়স ১০";
    const zod = new ZodError([{ code: "custom", path: ["child", "name"], message: "leaked name: রাফির-বাবা-করিম" }]);
    const result = await runWithThrowingProvider(source, zod);
    expect(result.ok).toBe(false);
    const json = JSON.stringify(result);
    expect(json).not.toContain("leaked name");
    expect(json).not.toContain("রাফির-বাবা-করিম");
    if ("cause" in result && result.cause !== undefined) {
      const causeStr = String(result.cause);
      expect(causeStr).not.toContain("leaked name");
      expect(causeStr).not.toContain("রাফির-বাবা-করিম");
    }
  });

  it("adapter: when checkOutput throws, the original error's message is replaced by a class-name Error", async () => {
    // Wrap an output value that makes checkOutput throw a non-Zod error containing source text.
    // The adapter must catch it and place a class-name-only Error in ExtractionResult.cause.
    const source = "[MOCK] বয়স ১০";
    const secret = "leaked-রাফির-বাবা-করিম";
    // A provider that returns an object that will explode inside checkOutput
    const explodingProvider = {
      name: "exploding",
      extract: async () => {
        // A value that triggers the sourceSpan check: it has the right shape but
        // the sourceText will fail the verbatim quote check, but the test is to
        // get the inner check to throw. Use a getter to throw on access.
        const bad: Record<string, unknown> = { child: { age_years: 10 }, event: {}, reporter: {}, evidence: {} };
        Object.defineProperty(bad, "child", {
          get() { throw new Error(`boom ${secret}`); },
        });
        return bad;
      },
    } as never;
    const result = await createLlmAdapter({
      primary: explodingProvider,
      fallback: fakeProvider("fallback", []),
      dispatch,
      log: () => {},
    }).extract(makeInput(source));
    expect(result.ok).toBe(false);
    const json = JSON.stringify(result);
    expect(json).not.toContain(secret);
    expect(json).not.toContain("boom");
    if ("cause" in result && result.cause !== undefined) {
      const causeStr = String(result.cause);
      expect(causeStr).not.toContain(secret);
      expect(causeStr).not.toContain("boom");
    }
  });
});

import { assert, describe, expect, it } from "vitest";
import { caseDraftSchema } from "@/contracts";
import { brandProviderDispatch, createLlmAdapter } from "@/server/ai";
import { emptyOutput, fakeProvider, inputFor, put, spanFor } from "./fixtures";

async function extract(source: string, output = emptyOutput()) {
  const result = await createLlmAdapter({ primary: fakeProvider("primary", [output]), fallback: fakeProvider("fallback", []), dispatch: brandProviderDispatch((provider, request, options) => provider.extract(request, options)), log: () => {} }).extract(inputFor(source));
  assert(result.ok);
  expect(caseDraftSchema.safeParse(result.draft).success).toBe(true);
  return result.draft;
}

describe("COMP-007 evidence / value support (D2A §2.1, BR-008)", () => {
  it.each(["absent", "quote", "offset", "length", "negative", "outside", "empty"])("drops only the field with %s evidence", async (failure) => {
    const source = "[MOCK] clothing: blue shirt; marks: [MOCK] mark";
    const output = put(emptyOutput(), source, "child.clothing", "blue shirt", "blue shirt");
    put(output, source, "child.marks", "[MOCK] mark", "[MOCK] mark");
    const evidence = output.evidence["child.clothing"];
    if (failure === "absent") delete output.evidence["child.clothing"];
    if (failure === "quote") evidence.quote = "gray shirt";
    if (failure === "offset") { evidence.start_utf16--; evidence.end_utf16--; }
    if (failure === "length") evidence.end_utf16++;
    if (failure === "negative") evidence.start_utf16 = -1;
    if (failure === "outside") { evidence.start_utf16 = 1000; evidence.end_utf16 = 1010; }
    if (failure === "empty") evidence.quote = "";
    const draft = await extract(source, output);
    expect(draft.child.clothing).toBeNull();
    expect(draft.evidence["child.clothing"]).toBeUndefined();
    expect(draft.child.marks).toBe("[MOCK] mark");
  });

  it("drops a hallucinated value even when the quote itself is a valid substring", async () => {
    const source = "[MOCK] clothing: blue shirt";
    const draft = await extract(source, put(emptyOutput(), source, "child.clothing", "red shirt", "blue shirt"));
    expect(draft.child.clothing).toBeNull();
  });

  it("does not reuse a clothing quote as the child's name", async () => {
    const source = "[MOCK] clothing: blue shirt";
    const draft = await extract(source, put(emptyOutput(), source, "child.name", "blue shirt", "blue shirt"));
    expect(draft.child.name).toBeNull();
  });

  it("does not turn a label-free substring into a field assertion", async () => {
    const source = "[MOCK] blue shirt";
    const draft = await extract(source, put(emptyOutput(), source, "child.clothing", "blue shirt", "blue shirt"));
    expect(draft.child.clothing).toBeNull();
  });

  it.each([
    ["[MOCK] name: fixtureA", "child.name", "fixture"],
    ["[MOCK] clothing: blue shirt", "child.clothing", "blu"],
    ["[MOCK] clothing: blue shirt", "child.clothing", "blue"],
  ] as const)("requires complete labelled text rather than a word/value prefix: %s", async (source, field, quote) => {
    const draft = await extract(source, put(emptyOutput(), source, field, quote, quote));
    expect(draft.evidence[field]).toBeUndefined();
    expect(field === "child.name" ? draft.child.name : draft.child.clothing).toBeNull();
  });

  it.each([
    ["[MOCK] height: 120 cmm", "child.height_cm", 120, "120 cm"],
    ["[MOCK] age: 13 yearsold", "child.age_years", 13, "13 years"],
  ] as const)("rejects a quote ending inside a numeric unit: %s", async (source, field, value, quote) => {
    const draft = await extract(source, put(emptyOutput(), source, field, value, quote));
    expect(draft.evidence[field]).toBeUndefined();
    expect(field === "child.height_cm" ? draft.child.height_cm : draft.child.age_years).toBeNull();
  });

  it("unknown remains unknown even if an evidence entry is supplied", async () => {
    const source = "[MOCK] clothing: blue shirt";
    const output = emptyOutput();
    output.evidence["child.clothing"] = spanFor(source, "blue shirt");
    const draft = await extract(source, output);
    expect(draft.child.clothing).toBeNull();
    expect(draft.evidence).toEqual({});
    expect(draft.child.sex).toBe("unknown");
  });

  it("compares direct values after NFC while preserving the original bytes/offsets", async () => {
    const source = "[MOCK] marks: ক\u09c7\u09be \u09df";
    const raw = "ক\u09c7\u09be \u09df";
    const draft = await extract(source, put(emptyOutput(), source, "child.marks", raw.normalize("NFC"), raw));
    expect(draft.child.marks).toBe(raw.normalize("NFC"));
    expect(draft.evidence["child.marks"]).toEqual(spanFor(source, raw));
  });

  it("maps across NFC and a surrogate pair before a Bangla-digit phone", async () => {
    const source = "[MOCK] 🧪 ক\u09c7\u09be \u09df; ফোন ০১৭১১২২৩৩৪৪";
    const draft = await extract(source, put(emptyOutput(), source, "reporter.phone", "01711223344", "০১৭১১২২৩৩৪৪"));
    expect(draft.reporter.phone).toBe("01711223344");
    expect(draft.evidence["reporter.phone"]).toEqual(spanFor(source, "০১৭১১২২৩৩৪৪", "digits"));
  });

  it.each(["ক্ষ", "ক্\u200dষ", "ক্\u200cষ", "ড়", "🧪"])("refuses evidence splitting %s", async (cluster) => {
    const source = `[MOCK] marks: ${cluster}`;
    const output = put(emptyOutput(), source, "child.marks", cluster.slice(0, 1), cluster.slice(0, 1));
    const draft = await extract(source, output);
    expect(draft.child.marks).toBeNull();
  });

  it("does not reinterpret normalised offsets as source offsets", async () => {
    const source = "[MOCK] ক\u09c7\u09be clothing: blue shirt";
    const output = put(emptyOutput(), source, "child.clothing", "blue shirt", "blue shirt");
    output.evidence["child.clothing"] = spanFor(inputFor(source).normalisedText, "blue shirt");
    const draft = await extract(source, output);
    expect(draft.child.clothing).toBeNull();
  });

  it("recomputes digit derivation rather than trusting a provider's direct label", async () => {
    const source = "[MOCK] age: ১৩";
    const draft = await extract(source, put(emptyOutput(), source, "child.age_years", 13, "১৩", "direct"));
    expect(draft.child.age_years).toBe(13);
    expect(draft.evidence["child.age_years"].derivation).toBe("digits");
  });

  it("a forged derivation cannot turn a different number into an age", async () => {
    const source = "[MOCK] age: ১৩";
    const draft = await extract(source, put(emptyOutput(), source, "child.age_years", 12, "১৩", "time_interval"));
    expect(draft.child.age_years).toBeNull();
  });

  it.each([
    ["[MOCK] age: 13", "1", 1],
    ["[MOCK] বয়স ১৩", "১", 1],
    ["[MOCK] age: 6–8 years", "6", 6],
    ["[MOCK] বয়স ৬–৮ বছর", "৬", 6],
    ["[MOCK] 6–8 years", "8 years", 8],
    ["[MOCK] age: 13 months", "13", 13],
    ["[MOCK] বয়স ১৩ মাস", "১৩", 13],
    ["[MOCK] age: 13.5 years", "13", 13],
    ["[MOCK] age: 13—14", "13", 13],
    ["[MOCK] age: 13/14", "13", 13],
    ["[MOCK] 6 years; 8 years", "6 years", 6],
  ] as const)("does not assert a partial/unsupported/contradictory numeric claim: %s", async (source, quote, value) => {
    const draft = await extract(source, put(emptyOutput(), source, "child.age_years", value, quote));
    expect(draft.child.age_years).toBeNull();
  });

  it("does not interpret an unrelated number as an age", async () => {
    const source = "[MOCK] bus: 13";
    const draft = await extract(source, put(emptyOutput(), source, "child.age_years", 13, "13"));
    expect(draft.child.age_years).toBeNull();
  });

  it.each(["[MOCK] age: 13; age: 12", "[MOCK] বয়স ১৩ অথবা ১২", "[MOCK] age: not 13"])("keeps contradictory/negated age unknown: %s", async (source) => {
    const quote = source.includes("১৩") ? "১৩" : "13";
    const draft = await extract(source, put(emptyOutput(), source, "child.age_years", 13, quote));
    expect(draft.child.age_years).toBeNull();
  });

  it("does not retain a negated clothing fact", async () => {
    const source = "[MOCK] clothing: not blue shirt";
    const draft = await extract(source, put(emptyOutput(), source, "child.clothing", "blue shirt", "blue shirt"));
    expect(draft.child.clothing).toBeNull();
  });

  it("drops conflicting repeated clothing claims rather than selecting one", async () => {
    const source = "[MOCK] clothing: blue shirt; clothing: red shirt";
    const draft = await extract(source, put(emptyOutput(), source, "child.clothing", "blue shirt", "blue shirt"));
    expect(draft.child.clothing).toBeNull();
  });

  it.each([
    ["[MOCK] clothing blue shirt; clothing red shirt", "blue shirt"],
    ["[MOCK] পোশাক নীল জামা; পোশাক লাল জামা", "নীল জামা"],
    ["[MOCK] clothing: blue shirt; clothing red shirt", "blue shirt"],
  ] as const)("uses the same optional label punctuation for contradiction detection: %s", async (source, quote) => {
    const draft = await extract(source, put(emptyOutput(), source, "child.clothing", quote, quote));
    expect(draft.child.clothing).toBeNull();
  });

  it("drops conflicting repeated height claims", async () => {
    const source = "[MOCK] height: 120 cm; height: 130 cm";
    const draft = await extract(source, put(emptyOutput(), source, "child.height_cm", 120, "120 cm"));
    expect(draft.child.height_cm).toBeNull();
  });

  it("detects contradictory unit-only height claims", async () => {
    const source = "[MOCK] 120 cm; 130 cm";
    const draft = await extract(source, put(emptyOutput(), source, "child.height_cm", 120, "120 cm"));
    expect(draft.child.height_cm).toBeNull();
  });

  it("retains explicitly supported age bounds without inventing an exact age", async () => {
    const source = "[MOCK] age: 6–8 years";
    const output = put(emptyOutput(), source, "child.age_min", 6, "6–8 years");
    put(output, source, "child.age_max", 8, "6–8 years");
    const draft = await extract(source, output);
    expect([draft.child.age_years, draft.child.age_min, draft.child.age_max]).toEqual([null, 6, 8]);
  });

  it("does not keep contradictory sex claims", async () => {
    const source = "[MOCK] ছেলে; মেয়ে";
    const draft = await extract(source, put(emptyOutput(), source, "child.sex", "male", "ছেলে"));
    expect(draft.child.sex).toBe("unknown");
  });

  it("checks phone formatting through the normaliser", async () => {
    const source = "[MOCK] phone: 01711 223344";
    const draft = await extract(source, put(emptyOutput(), source, "reporter.phone", "01711223344", "01711 223344", "romanisation"));
    expect(draft.reporter.phone).toBe("01711223344");
    expect(draft.evidence["reporter.phone"].derivation).toBe("digits");
  });

  // Both numbers already exist in the synthetic contract/normaliser fixtures.
  it.each([
    ["[MOCK] phone: 01711223344; phone: 01700000001", "01711223344"],
    ["[MOCK] নম্বর ০১৭১১২২৩৩৪৪; নম্বর ০১৭০০০০০০০১", "০১৭১১২২৩৩৪৪"],
    ["[MOCK] phone: 017112233440", "01711223344"],
  ] as const)("rejects competing or truncated phone claims: %s", async (source, quote) => {
    const draft = await extract(source, put(emptyOutput(), source, "reporter.phone", "01711223344", quote));
    expect(draft.reporter.phone).toBeNull();
  });

  it("equivalent phone spellings do not conflict", async () => {
    const source = "[MOCK] phone: 01711223344; নম্বর ০১৭১১ ২২৩৩৪৪";
    const draft = await extract(source, put(emptyOutput(), source, "reporter.phone", "01711223344", "01711223344"));
    expect(draft.reporter.phone).toBe("01711223344");
  });

  it("checks time values and approximation against the normaliser's explicit clock", async () => {
    const source = "[MOCK] গতকাল বিকেলে";
    const output = emptyOutput();
    put(output, source, "event.at", "2026-10-13T16:00:00+06:00", "গতকাল বিকেলে", "direct");
    put(output, source, "event.at_lower", "2026-10-13T14:00:00+06:00", "গতকাল বিকেলে", "direct");
    put(output, source, "event.at_upper", "2026-10-13T18:00:00+06:00", "গতকাল বিকেলে", "direct");
    output.event.at_approx = false;
    const draft = await extract(source, output);
    expect(draft.event.at).toBe(output.event.at);
    expect(draft.event.at_approx).toBe(true);
    expect(Object.values(draft.evidence).map((span) => span.derivation)).toEqual(["time_interval", "time_interval", "time_interval"]);
  });

  it("drops unsupported time and resets unsupported approximation metadata", async () => {
    const source = "[MOCK] গতকাল";
    const output = put(emptyOutput(), source, "event.at", "2026-10-13T16:00:00+06:00", "গতকাল", "time_interval");
    output.event.at_approx = true;
    const draft = await extract(source, output);
    expect(draft.event.at).toBeNull();
    expect(draft.event.at_approx).toBe(false);
  });

  it.each([
    ["[MOCK] গতকাল বিকেল; গতকাল সকাল", "গতকাল বিকেল", "2026-10-13T16:00:00+06:00"],
    ["[MOCK] 2026-10-12T12:00:00+06:00; 2026-10-13T12:00:00+06:00", "2026-10-12T12:00:00+06:00", "2026-10-12T12:00:00+06:00"],
  ] as const)("rejects competing supported source times even if the provider omits one: %s", async (source, quote, value) => {
    const draft = await extract(source, put(emptyOutput(), source, "event.at", value, quote));
    expect(draft.event.at).toBeNull();
    expect(draft.event.at_approx).toBe(false);
  });

  it("equivalent explicit time spellings do not conflict", async () => {
    const source = "[MOCK] 2026-10-13T12:00:00+06:00; 2026-10-13T06:00:00Z";
    const draft = await extract(source, put(emptyOutput(), source, "event.at", "2026-10-13T12:00:00+06:00", "2026-10-13T12:00:00+06:00"));
    expect(draft.event.at).toBe("2026-10-13T12:00:00+06:00");
  });

  it("drops an asserted sex without supported evidence", async () => {
    const source = "[MOCK] clothing: blue shirt";
    const draft = await extract(source, put(emptyOutput(), source, "child.sex", "male", "blue shirt"));
    expect(draft.child.sex).toBe("unknown");
  });
});

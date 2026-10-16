import type { EvidenceSpan } from "@/contracts";
import { normaliseText } from "@/server/normalise";
import type { ExtractInput, ExtractOutput } from "@/server/ai";

export { fakeProvider } from "./fakes/scripted";

export const NOW = "2026-10-14T12:00:00+06:00";

export function inputFor(sourceText: string, kind: ExtractInput["kind"] = "missing"): ExtractInput {
  const text = normaliseText(sourceText);
  if (text.status !== "known") throw new Error("Invalid synthetic fixture");
  return { kind, sourceText, normalisedText: text.value.normalisedText, nowIso: NOW };
}

export function emptyOutput(): ExtractOutput {
  return {
    child: { name: null, age_years: null, age_min: null, age_max: null, sex: "unknown", height_cm: null, clothing: null, marks: null },
    event: { at: null, at_lower: null, at_upper: null, at_approx: false, place_text: null, district_text: null, thana: null, circumstances: null },
    reporter: { relation: null, phone: null }, evidence: {},
  };
}

export function spanFor(source: string, quote: string, derivation: EvidenceSpan["derivation"] = "direct"): EvidenceSpan {
  const start_utf16 = source.indexOf(quote);
  if (start_utf16 < 0) throw new Error("Quote absent from synthetic fixture");
  return { quote, start_utf16, end_utf16: start_utf16 + quote.length, derivation };
}

export function put(output: ExtractOutput, source: string, field: string, value: string | number, quote: string, derivation: EvidenceSpan["derivation"] = "direct") {
  const [group, key] = field.split(".") as ["child" | "event" | "reporter", string];
  Object.assign(output[group], { [key]: value });
  output.evidence[field] = spanFor(source, quote, derivation);
  return output;
}

// TC-002 is the verbatim D6 text; TC-002-adapted includes an explicit name label (OD-013-11).
// All other cases are synthetic test inputs, not additional district aliases, personal records or eval samples.
export const SAMPLES = [
  {
    id: "TC-002", kind: "missing", source: "[MOCK] আমার ছেলে রাফি, বয়স ১৩, গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি। নম্বর ০১৭১১২২৩৩৪৪",
    facts: [["child.age_years", 13, "১৩"], ["child.sex", "male", "ছেলে"], ["reporter.phone", "01711223344", "০১৭১১২২৩৩৪৪"]],
  },
  {
    id: "TC-002-adapted", kind: "missing", source: "[MOCK] আমার ছেলে, নাম রাফি, বয়স ১৩, গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি। নম্বর ০১৭১১২২৩৩৪৪",
    facts: [["child.name", "রাফি", "রাফি"], ["child.age_years", 13, "১৩"], ["child.sex", "male", "ছেলে"], ["reporter.phone", "01711223344", "০১৭১১২২৩৩৪৪"]],
  },
  { id: "bn-clothing", kind: "found", source: "[MOCK] পোশাক: নীল জামা", facts: [["child.clothing", "নীল জামা", "নীল জামা"]] },
  { id: "en-clothing", kind: "missing", source: "[MOCK] clothing: blue shirt", facts: [["child.clothing", "blue shirt", "blue shirt"]] },
  { id: "mixed-age", kind: "missing", source: "[MOCK] age: ৭ years", facts: [["child.age_years", 7, "৭"]] },
  { id: "bn-district", kind: "found", source: "[MOCK] জেলা: [MOCK] জেলা ১", facts: [["event.district_text", "[MOCK] জেলা ১", "[MOCK] জেলা ১"]] },
  { id: "en-place", kind: "found", source: "[MOCK] place: [MOCK] place A", facts: [["event.place_text", "[MOCK] place A", "[MOCK] place A"]] },
  { id: "mixed-height", kind: "found", source: "[MOCK] উচ্চতা: ১২০ cm", facts: [["child.height_cm", 120, "১২০ cm"]] },
  { id: "bn-relation", kind: "missing", source: "[MOCK] সম্পর্ক: অভিভাবক", facts: [["reporter.relation", "অভিভাবক", "অভিভাবক"]] },
  { id: "en-marks", kind: "found", source: "[MOCK] marks: [MOCK] mark A", facts: [["child.marks", "[MOCK] mark A", "[MOCK] mark A"]] },
  { id: "mixed-description", kind: "found", source: "[MOCK] বিবরণ: [MOCK] synthetic description", facts: [["event.circumstances", "[MOCK] synthetic description", "[MOCK] synthetic description"]] },
] as const;

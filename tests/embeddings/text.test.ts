// TASK-016 / COMP-011 / P3-024: canonical text builder for the embedder.
//
// The function `canonicalCaseText` builds the text to embed from the
// structured contract fields only (clothing, marks, circumstances,
// place_text), with the e5 model prefix on top (`query: ` for missing,
// `passage: ` for found). It must be deterministic: same row in → same
// text out, every time. Free-text fields are scrubbed of phone-like
// numbers (see text.ts, FREE-TEXT SAFETY).

import { describe, expect, it } from "vitest";
import { exampleFoundRow, exampleMissingRow } from "@/contracts/examples";
import type { CaseRow } from "@/contracts/server/rows";
import {
  PASSAGE_PREFIX,
  QUERY_PREFIX,
  canonicalCaseText,
  canonicalPrefix,
  caseEmbeddingText,
  prefixForKind,
  scrubPhones,
  structuredCaseText,
} from "@/server/embeddings/text";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function rowWith(over: Partial<CaseRow>): CaseRow {
  return { ...clone(exampleMissingRow), ...over } as CaseRow;
}

describe("canonicalCaseText", () => {
  it("uses the query: prefix for missing reports and passage: for found", () => {
    const missing = canonicalCaseText(exampleMissingRow);
    const found = canonicalCaseText(exampleFoundRow);
    expect(missing.startsWith(QUERY_PREFIX)).toBe(true);
    expect(found.startsWith(PASSAGE_PREFIX)).toBe(true);
    expect(canonicalPrefix("missing")).toBe(QUERY_PREFIX);
    expect(canonicalPrefix("found")).toBe(PASSAGE_PREFIX);
    expect(prefixForKind("missing")).toBe(QUERY_PREFIX);
    expect(prefixForKind("found")).toBe(PASSAGE_PREFIX);
  });

  it("embeds only the structured fields, joined with '। '", () => {
    const r = rowWith({ clothing: "নীল ফ্রক", marks: "বাঁ হাতে কাটা দাগ", circumstances: null, place_text: "রেলস্টেশন" });
    expect(canonicalCaseText(r)).toBe("query: নীল ফ্রক। বাঁ হাতে কাটা দাগ। রেলস্টেশন");
  });

  it("ignores raw_text, name, age, district and contact", () => {
    // These fields exist on CaseRow but must NOT be in the embed input.
    const r = rowWith({
      raw_text: "আমার মেয়ে হারিয়ে গেছে, নাম মীম, বয়স ১১",
      child_name: "মীম",
      child_name_latin: "Mim",
      age_years: 11,
      age_min: 11,
      age_max: 11,
      district_code: 26,
      contact_phone: "01700000001",
      clothing: "নীল ফ্রক",
      marks: null,
      circumstances: null,
      place_text: null,
    });
    expect(canonicalCaseText(r)).toBe("query: নীল ফ্রক");
  });

  it("is deterministic — same row yields the same text every call", () => {
    const r = rowWith({ clothing: "সাদা শার্ট", marks: "কিছু নেই", circumstances: "রাস্তায় পাওয়া গেছে", place_text: "স্কুলের সামনে" });
    const a = canonicalCaseText(r);
    const b = canonicalCaseText(r);
    const c = canonicalCaseText(clone(r));
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("orders fields consistently (clothing, marks, circumstances, place_text)", () => {
    const a = rowWith({ clothing: "A", marks: "B", circumstances: "C", place_text: "D" });
    const b = rowWith({ place_text: "D", circumstances: "C", marks: "B", clothing: "A" });
    expect(canonicalCaseText(a)).toBe(canonicalCaseText(b));
  });

  it("drops empty and whitespace-only fields", () => {
    const r = rowWith({ clothing: "  ", marks: null, circumstances: "X", place_text: "" });
    expect(canonicalCaseText(r)).toBe("query: X");
  });

  it("returns just the prefix when no structured fields are present", () => {
    const r = rowWith({ clothing: null, marks: null, circumstances: null, place_text: null });
    expect(canonicalCaseText(r)).toBe(QUERY_PREFIX);
    expect(structuredCaseText(r)).toBe("");
  });
});

describe("scrubPhones: phone-like numbers are removed from free text", () => {
  // scrubPhones replaces each match with a single space and collapses
  // adjacent whitespace so the removed phone leaves one clean boundary.
  it.each([
    ["ফোন 01200000042 এ জানান", "ফোন এ জানান"],
    ["ফোন ০১২০০০০০০৪২ এ জানান", "ফোন এ জানান"],
    ["call 0120-000-0042 now", "call now"],
    ["call 01200 000 042 now", "call now"],
    ["call 01200.000.042 now", "call now"],
    ["call +8801200000042 now", "call now"],
    ["call 880 1200 000 042 now", "call now"],
    ["নম্বর +৮৮০১৭০০০০০০৪২", "নম্বর "],
  ])("scrubs %s", (input, expected) => {
    expect(scrubPhones(input)).toBe(expected);
  });

  it("keeps ages, heights and short numbers (not 11 digits)", () => {
    expect(scrubPhones("বয়স ৭, উচ্চতা ১১০ সেমি, ২০২৬ সাল")).toBe("বয়স ৭, উচ্চতা ১১০ সেমি, ২০২৬ সাল");
    expect(scrubPhones("room 12, level 3, 2026")).toBe("room 12, level 3, 2026");
  });

  it("leaves names alone (names typed into free text are NOT detected)", () => {
    expect(scrubPhones("নাম: মীম, বয়স ৭")).toBe("নাম: মীম, বয়স ৭");
  });

  it("propagates through structuredCaseText and exposes prefix-free reembed text", () => {
    for (const field of ["clothing", "marks", "circumstances", "place_text"] as const) {
      const row = rowWith({
        clothing: null,
        marks: null,
        circumstances: null,
        place_text: null,
        [field]: "ফোন 01700000042 এ যোগাযোগ",
      });
      expect(caseEmbeddingText(row)).toBe("ফোন এ যোগাযোগ");
      expect(canonicalCaseText(row)).toBe("query: ফোন এ যোগাযোগ");
    }
  });
});

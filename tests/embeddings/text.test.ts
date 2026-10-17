// TASK-016 / COMP-011 / P3-024: canonical text builder for the embedder.
//
// The function `canonicalCaseText` builds the text to embed from the structured
// contract fields only (clothing, marks, circumstances, place_text), with the
// e5 model prefix on top (`query: ` for missing, `passage: ` for found). It
// must be deterministic: same row in → same text out, every time.
import { describe, expect, it } from "vitest";
import { exampleFoundRow, exampleMissingRow } from "@/contracts/examples";
import type { CaseRow } from "@/contracts/server/rows";
import {
  PASSAGE_PREFIX,
  QUERY_PREFIX,
  canonicalCaseText,
  canonicalPrefix,
  prefixForKind,
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

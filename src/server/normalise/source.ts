import { FIELD_MAX_CHARS, evidenceSpanSchema, type EvidenceDerivation } from "@/contracts";
import { known, unknown, type Normalisation, type Utf16Range } from "./types";

export const graphemes = new Intl.Segmenter("bn", { granularity: "grapheme" });

export function validSource(source: string): boolean {
  // EvidenceSpan offsets are capped in UTF-16, even though text limits count code points.
  return source.length <= FIELD_MAX_CHARS.raw_text && source.isWellFormed() && !source.includes("\0");
}

export function validRange(range: Utf16Range, length: number): boolean {
  return Number.isInteger(range.start_utf16) && Number.isInteger(range.end_utf16)
    && range.start_utf16 >= 0 && range.start_utf16 < range.end_utf16 && range.end_utf16 <= length;
}

export function sourceValue(source: string, range: Utf16Range, derivation: EvidenceDerivation = "direct"): Normalisation<string> {
  if (!validSource(source)) return unknown("invalid_source");
  if (!validRange(range, source.length)) return unknown("invalid_range");
  const boundaries = new Set([source.length, ...Array.from(graphemes.segment(source), (s) => s.index)]);
  // ICU splits before the consonant after ZWNJ; evidence keeps the complete virama/join-control unit.
  for (const match of source.matchAll(/\u09cd[\u200c\u200d]+(?=[\u0995-\u09b9\u09dc\u09dd\u09df\u09f0\u09f1])/gu)) {
    boundaries.delete(match.index + match[0].length);
  }
  // A quote may not split a surrogate pair, vowel sign, nukta or conjunct.
  if (!boundaries.has(range.start_utf16) || !boundaries.has(range.end_utf16)) return unknown("invalid_range");
  const quote = source.slice(range.start_utf16, range.end_utf16);
  if (!quote.trim()) return unknown("empty");
  const span = evidenceSpanSchema.safeParse({ ...range, quote, derivation });
  return span.success ? known(quote, [span.data]) : unknown("invalid_range");
}

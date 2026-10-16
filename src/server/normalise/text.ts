import { evidenceSpanSchema, toAsciiDigits, type EvidenceSpan } from "@/contracts";
import { graphemes, sourceValue, validRange, validSource } from "./source";
import { known, unknown, type Normalisation, type NormalisedText, type NormalisedToken, type Utf16Range } from "./types";

export function normaliseText(sourceText: string): Normalisation<NormalisedText> {
  if (!validSource(sourceText)) return unknown("invalid_source");
  if (!sourceText.trim()) return unknown("empty");

  let normalisedText = "";
  const offsetMap: Utf16Range[] = [];
  const ranges: Utf16Range[] = [];
  let tokenStart: number | null = null;

  for (const { segment, index } of graphemes.segment(sourceText)) {
    // NFC may change length; mapping the complete grapheme preserves its raw evidence.
    const normalised = toAsciiDigits(segment.normalize("NFC"));
    const range = { start_utf16: index, end_utf16: index + segment.length };
    if (/^\s+$/u.test(normalised)) {
      if (tokenStart !== null) ranges.push({ start_utf16: tokenStart, end_utf16: normalisedText.length });
      tokenStart = null;
    } else if (tokenStart === null) tokenStart = normalisedText.length;
    for (let i = 0; i < normalised.length; i++) offsetMap.push(range);
    normalisedText += normalised;
  }
  if (tokenStart !== null) ranges.push({ start_utf16: tokenStart, end_utf16: normalisedText.length });

  const tokens: NormalisedToken[] = [];
  const evidence: EvidenceSpan[] = [];
  for (const range of ranges) {
    const value = normalisedText.slice(range.start_utf16, range.end_utf16);
    const rawStart = offsetMap[range.start_utf16].start_utf16;
    const rawEnd = offsetMap[range.end_utf16 - 1].end_utf16;
    const quote = sourceText.slice(rawStart, rawEnd);
    const derivation = toAsciiDigits(quote) === quote ? "direct" : "digits";
    // These boundaries were built from whole raw graphemes above; do not resegment per token.
    const span = evidenceSpanSchema.safeParse({ quote, start_utf16: rawStart, end_utf16: rawEnd, derivation });
    if (!span.success) return unknown("invalid_range");
    tokens.push({ ...range, text: value, evidence: span.data });
    evidence.push(span.data);
  }
  return known({ sourceText, normalisedText, offsetMap, tokens }, evidence);
}

// Ranges here are normalised offsets; field functions instead accept original offsets.
export function evidenceForRange(text: NormalisedText, range: Utf16Range): Normalisation<string> {
  if (!validRange(range, text.normalisedText.length) || text.offsetMap.length !== text.normalisedText.length) return unknown("invalid_range");
  const start = text.offsetMap[range.start_utf16];
  const end = text.offsetMap[range.end_utf16 - 1];
  const previous = text.offsetMap[range.start_utf16 - 1];
  const next = text.offsetMap[range.end_utf16];
  if (!start || !end || previous?.start_utf16 === start.start_utf16 || next?.end_utf16 === end.end_utf16) return unknown("invalid_range");
  const raw = sourceValue(text.sourceText, { start_utf16: start.start_utf16, end_utf16: end.end_utf16 });
  if (raw.status === "unknown") return raw;
  const value = text.normalisedText.slice(range.start_utf16, range.end_utf16);
  if (toAsciiDigits(raw.value.normalize("NFC")) !== value) return unknown("invalid_range");
  const derivation = toAsciiDigits(raw.value) === raw.value ? "direct" : "digits";
  return known(value, raw.evidence.map((span) => ({ ...span, derivation })));
}

// TASK-017c template reasons (P3-032, FR-014, FR-015). Server-only.
//
// Each candidate a matcher records carries a small set of human-readable
// "reasons" — a per-field verdict the officer can scan before reading the
// side-by-side table. The matcher (P3-031, P3-040) calls this when it stores
// the candidate row, so the reason list is fully template-driven: no model
// free text, no probability claim, no inferred field (D4 §3 "evidence before
// decision", D4 §9 "similarity, not identity", BR-018 "evidence reasons").
//
// This module is a THIN ADAPTER over the approved comparison logic in
// `@/lib/match-review` (compareCases, used by SCREEN-010). The verdict on every
// field comes from that approved logic; reasons.ts does not compute a verdict
// of its own. The drift that previously lived here is gone — the same field on
// the same pair always yields the same verdict in both modules, by construction.
//
// Honesty rules carried over from match-review (D4, BR-001/005):
//   - "agree"   : a structured comparison of the two reports matches.
//   - "differ"  : a structured comparison says the two values contradict.
//   - "unknown" : one or both sides have no value, or the value is the literal
//                 "unknown" (sexSchema, D5). Never "agree" on partial data.
//   - "review"  : a value is present on both sides but the matcher cannot
//                 judge it (free text, a measurement like 120 vs 121 cm, or a
//                 different district — district is a bonus per BR-017, not a
//                 contradiction). The officer still reads both side by side.
//
// fieldKey / verdictKey: the consumer does `locales[locale][fieldKey]` and
// `locales[locale][verdictKey]` to render the label. Every key is asserted in
// the unit test against both `bn` and `en` copy from the locale objects; the
// wording guard is also run on those copies so a future rephrasing is caught
// (E-016, FR-034, BR-002/003).
//
// Pure: no DB, no I/O, no clock. Deterministic for a given pair (the order is
// fixed by compareCases), so two workers running the matcher on the same pair
// record byte-identical reason lists.
import type { OfficerCaseView } from "@/contracts";
import type { MessageKey } from "@/locales";
import { compareCases, type CompareField, type Verdict } from "@/lib/match-review";

// Same nine fields compareCases already walks, in the same order it returns
// them. Keeping the order stable makes the stored JSON diffable and the table
// scan predictable for the officer.
export const FIELD_ORDER: readonly CompareField[] = [
  "sex",
  "age",
  "height",
  "district",
  "place",
  "time",
  "clothing",
  "marks",
  "circumstances",
];
export type ReasonField = CompareField;

// The approved verdict set. Forwarded straight from compareCases — never
// computed here. "review" is a valid verdict (a different district, 120 vs 121
// cm, two non-empty free-text values) and is NOT collapsed: the matcher is
// honest about not having a structured comparison.
export type ReasonVerdict = Verdict;

export type MatchReason = {
  field: ReasonField;
  verdict: ReasonVerdict;
  fieldKey: MessageKey;
  verdictKey: MessageKey;
};

// Input shape matches `compareCases` exactly so the adapter cannot drift in
// how it destructures the pair. Callers pass the two views positionally.
export type ReasonsForInput = { missing: OfficerCaseView; found: OfficerCaseView };
// Backwards-compatible alias for the existing object-style call sites.
export type ReasonsPair = ReasonsForInput;

// Map a reason field to the existing matchField* locale key. The officer-match
// screen (SCREEN-010) already uses these same keys; the table renders the
// field name from fieldKey, the verdict text from verdictKey.
const FIELD_MESSAGE_KEY: Record<ReasonField, MessageKey> = {
  sex: "matchFieldSex",
  age: "matchFieldAge",
  height: "matchFieldHeight",
  district: "matchFieldDistrict",
  place: "matchFieldPlace",
  time: "matchFieldTime",
  clothing: "matchFieldClothing",
  marks: "matchFieldMarks",
  circumstances: "matchFieldCircumstances",
};

// Map an approved verdict to the existing matchVerdict* locale key. "review"
// is a real verdict (free text, near-equal height, different district), and it
// maps to the existing matchVerdictReview ("compare by eye") key — never to
// "differ".
const VERDICT_MESSAGE_KEY: Record<ReasonVerdict, MessageKey> = {
  agree: "matchVerdictAgree",
  differ: "matchVerdictDiffer",
  unknown: "matchVerdictUnknown",
  review: "matchVerdictReview",
};

// Adapt reasonsFor to the object-shape callers use, then forward the two
// views to compareCases. Keeping the wrapper means the test/caller contract
// (`reasonsFor({ missing, found })`) is unchanged.
export function reasonsFor(input: ReasonsForInput): MatchReason[] {
  return compareCases(input.missing, input.found, "bn").map((row) => ({
    field: row.field,
    verdict: row.verdict,
    fieldKey: FIELD_MESSAGE_KEY[row.field],
    verdictKey: VERDICT_MESSAGE_KEY[row.verdict],
  }));
}

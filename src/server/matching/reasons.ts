// TASK-017c template reasons (P3-032, FR-014, FR-015). Server-only.
//
// Each candidate a matcher records carries a small set of human-readable
// "reasons" — a per-field agree/differ/unknown verdict the officer can scan
// before reading the side-by-side table. The matcher (P3-031, P3-040) calls
// this when it stores the candidate row, so the reason list is fully
// template-driven: no model free text, no probability claim, no inferred field
// (D4 §3 "evidence before decision", D4 §9 "similarity, not identity",
// BR-018 "evidence reasons").
//
// Verdict rules (the brief):
//   - "agree"   : a structured comparison of the two reports matches.
//   - "differ"  : a structured comparison says the two values contradict, or a
//                 free-text field has a value on each side (we cannot confirm
//                 they agree, so we honestly mark the field as not agreeing).
//   - "unknown" : one or both sides have no value, or the value is the literal
//                 "unknown" (sexSchema, D5). Never "agree" on partial data.
//
// `messageKey` is one of the existing officer-match keys already used by SCREEN-010
// (matchField*, matchVerdict*). The consumer does `locales[locale][messageKey]` to
// render the label. Every key it returns is asserted in the unit test against both
// `bn` and `en` copy from the locale objects; the wording guard is also run on
// those copies so a future rephrasing is caught (E-016, FR-034, BR-002/003).
//
// Pure: no DB, no I/O, no clock. Deterministic for a given pair (the order is
// fixed, see FIELD_ORDER), so two workers running the matcher on the same pair
// record byte-identical reason lists.
import type { OfficerCaseView } from "@/contracts";
import type { MessageKey } from "@/locales";

// The nine fields a candidate is reasoned on, in the same order SCREEN-010 lists
// them on the comparison table (lib/match-review.compareCases). Keeping the order
// stable makes the stored JSON diffable and the table scan predictable.
export const FIELD_ORDER = [
  "sex",
  "age",
  "height",
  "district",
  "place",
  "time",
  "clothing",
  "marks",
  "circumstances",
] as const;
export type ReasonField = (typeof FIELD_ORDER)[number];

// The brief's verdict set. "review" from compareCases is collapsed to "differ"
// for the reasons list: with a value on each side we cannot say "agree", so the
// honest reason is that the field is not agreed (the officer still reads both
// side-by-side to decide).
export type ReasonVerdict = "agree" | "differ" | "unknown";

export type MatchReason = {
  field: ReasonField;
  verdict: ReasonVerdict;
  messageKey: MessageKey;
};

export type ReasonsPair = { missing: OfficerCaseView; found: OfficerCaseView };

// Map a reason field to the existing matchField* locale key. The consumer renders
// the field name from this key; the verdict text is the row's "agree/differ/
// unknown" label and is looked up separately by the UI (the brief keeps them in
// one place: a row is field + verdict, the same shape compareCases already uses).
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

type ChildLike = OfficerCaseView["child"];
type EventLike = OfficerCaseView["event"];

// Free-text on a field. `null` (missing) and empty/whitespace are both "not known".
const text = (v: string | null | undefined): string | null => {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === "" ? null : t;
};

// Age interval (D5 BR-015/016): prefer the [min, max] range; fall back to the
// exact year as a degenerate range. Null when no value is recorded.
function ageRange(c: ChildLike): [number, number] | null {
  if (c.age_min !== null && c.age_max !== null) return [c.age_min, c.age_max];
  if (c.age_years !== null) return [c.age_years, c.age_years];
  return null;
}

function sexValue(c: ChildLike): "male" | "female" | "other" | null {
  return c.sex === "unknown" ? null : c.sex;
}

function districtValue(c: EventLike): number | null {
  return c.district_code;
}

function heightValue(c: ChildLike): number | null {
  return c.height_cm;
}

function timeValue(c: EventLike): string | null {
  // A time interval: prefer the exact at, fall back to the lower bound so a
  // recorded interval still answers the question "do we know when?".
  return c.at ?? c.at_lower;
}

function placeValue(c: EventLike): string | null {
  return text(c.place_text);
}

function clothingValue(c: ChildLike): string | null {
  return text(c.clothing);
}

function marksValue(c: ChildLike): string | null {
  return text(c.marks);
}

function circumstancesValue(c: EventLike): string | null {
  return text(c.circumstances);
}

// Either side null/unknown → "unknown". Both sides a value → "differ" for the
// reasons list. We never say "agree" on free text (the matcher does not compare
// the strings), per the brief: "never infer a field".
function freeTextOrUnknown(a: string | null, b: string | null): ReasonVerdict {
  if (a === null || b === null) return "unknown";
  return "differ";
}

function textRow(field: ReasonField, missing: string | null, found: string | null): MatchReason {
  return { field, verdict: freeTextOrUnknown(missing, found), messageKey: FIELD_MESSAGE_KEY[field] };
}

function numericRow(field: ReasonField, a: number | null, b: number | null): MatchReason {
  if (a === null || b === null) return { field, verdict: "unknown", messageKey: FIELD_MESSAGE_KEY[field] };
  return { field, verdict: a === b ? "agree" : "differ", messageKey: FIELD_MESSAGE_KEY[field] };
}

function ageRow(m: ChildLike, f: ChildLike): MatchReason {
  const rm = ageRange(m);
  const rf = ageRange(f);
  if (rm === null || rf === null) return { field: "age", verdict: "unknown", messageKey: FIELD_MESSAGE_KEY.age };
  // Intervals overlap when neither range starts after the other ends.
  const overlap = rm[0] <= rf[1] && rf[0] <= rm[1];
  return { field: "age", verdict: overlap ? "agree" : "differ", messageKey: FIELD_MESSAGE_KEY.age };
}

function sexRow(m: ChildLike, f: ChildLike): MatchReason {
  const sm = sexValue(m);
  const sf = sexValue(f);
  if (sm === null || sf === null) return { field: "sex", verdict: "unknown", messageKey: FIELD_MESSAGE_KEY.sex };
  return { field: "sex", verdict: sm === sf ? "agree" : "differ", messageKey: FIELD_MESSAGE_KEY.sex };
}

function districtRow(m: EventLike, f: EventLike): MatchReason {
  const dm = districtValue(m);
  const df = districtValue(f);
  if (dm === null || df === null) return { field: "district", verdict: "unknown", messageKey: FIELD_MESSAGE_KEY.district };
  // SCREEN-010 shows a different district as "compare by eye" because a found
  // child often turns up in another district. For the reasons list we collapse
  // that case to "differ": we cannot say the two reports agree, so the honest
  // reason is they do not agree. (BR-018 "evidence reasons" + D4 "honest copy".)
  return { field: "district", verdict: dm === df ? "agree" : "differ", messageKey: FIELD_MESSAGE_KEY.district };
}

export function reasonsFor(pair: ReasonsPair): MatchReason[] {
  const { missing, found } = pair;
  return [
    sexRow(missing.child, found.child),
    ageRow(missing.child, found.child),
    numericRow("height", heightValue(missing.child), heightValue(found.child)),
    districtRow(missing.event, found.event),
    textRow("place", placeValue(missing.event), placeValue(found.event)),
    textRow("time", timeValue(missing.event), timeValue(found.event)),
    textRow("clothing", clothingValue(missing.child), clothingValue(found.child)),
    textRow("marks", marksValue(missing.child), marksValue(found.child)),
    textRow("circumstances", circumstancesValue(missing.event), circumstancesValue(found.event)),
  ];
}

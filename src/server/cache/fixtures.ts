// Protected DEMO_MODE fixture path (TASK-014/020/033, FR-027/032, BR-026, TC-021/056).
//
// API-002 matches one exact synthetic source string by SHA-256. It returns the
// prepared draft only in DEMO_MODE=1 and always labels the response cached=true.
// It does not reserve a paid call or create transcript audio that is not present.
//
// TASK-033: 3 scripted cases per D6 §9.2 / TC-021 —
//   1) মিতু (Mitu) · girl, 7, red dress (MituExample; existing backwards compatible)
//   2) রাফি (Rafi) · boy, 13, blue shirt (TC-002 exact scripted note)
//   3) মীম (Mim)  · girl, 11, Tongi/Gazipur (TC-013 public-post duplicate)
//
// Every actual field has a valid source-span provenance, unknowns stay null,
// and existing fixed cached time remains labelled. No audio fixtures are
// fabricated (no real clips are available).
import { createHash } from "node:crypto";
import type { CaseDraft } from "@/contracts";

export type TranscriptFixture = Readonly<{
  id: string;
  audioHash: string;
  transcript: string;
  language: "bn" | "mixed";
  duration_s: number;
}>;

export type ExtractFixture = Readonly<{
  /** SHA-256 of the exact UTF-8 source text accepted by API-002. */
  sourceHash: string;
  draft: CaseDraft;
}>;

// This is the exact source string from contracts/examples.ts:exampleMissingDraft.
export const EXTRACT_FIXTURE_SOURCE =
  "আমার মেয়ে মিতু, বয়স ৭ বছর। গতকাল বিকেলে বাস টার্মিনালের কাছে হারিয়ে গেছে। লাল জামা পরা ছিল। আমার নম্বর ০১৭০০০০০০০১।";

// TC-002 scripted note: "আমার ছেলে রাফি, বয়স ১৩, গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি। নম্বর ০১৭১১২২৩৩৪৪"
// Demo data row per D6 §9.2: missing boy, 13, blue shirt, last seen 8 Oct afternoon
// interval with 16:00 display reference; fixture intake clock explicitly 9 Oct near
// madrasa, Mirpur, Dhaka. District stays unknown here (the parent types it later
// in the question loop per TC-003), so the cached draft mirrors that.
export const EXTRACT_FIXTURE_RAFI_SOURCE =
  "আমার ছেলে রাফি, বয়স ১৩, গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি। নম্বর ০১৭১১২২৩৩৪৪";

// Agent-authored synthetic note (source text is not in the spec pack; TC-013
// names the Mim scenario only). Phone uses the synthetic 017000000NN range: "আমার মেয়ে মীম, বয়স ১১, আজ সকালে টঙ্গী বাজারে হারিয়ে গেছে। নম্বর ০১৭০০০০০০৭৬"
// Demo data row per D6 §9.2: missing girl, 11, Tongi, Gazipur (public-post
// duplicate shown by the duplicate banner; district stays unknown until typed).
export const EXTRACT_FIXTURE_MIM_SOURCE =
  "আমার মেয়ে মীম, বয়স ১১, আজ সকালে টঙ্গী বাজারে হারিয়ে গেছে। নম্বর ০১৭০০০০০০৭৬";

// Build a span only when the quote is present in `source`. Unknown fields stay
// out of `evidence` rather than carry a fabricated span.
function spanFrom(
  source: string,
  quote: string,
  derivation: CaseDraft["evidence"][string]["derivation"],
) {
  const start_utf16 = source.indexOf(quote);
  if (start_utf16 < 0) throw new Error("cache evidence quote is not present in its source");
  return { quote, start_utf16, end_utf16: start_utf16 + quote.length, derivation };
}

// Synthetic-only copy of the validated example, keeping only source-supported
// values. District is deliberately null because the example's district was chosen
// in a manual selector and is not present in the source text.
export const EXTRACT_FIXTURE_DRAFT = {
  kind: "missing",
  source_text: EXTRACT_FIXTURE_SOURCE,
  child: {
    name: "মিতু",
    name_latin: null,
    age_years: 7,
    age_min: 7,
    age_max: 7,
    sex: "female",
    height_cm: null,
    clothing: "লাল জামা",
    marks: null,
  },
  event: {
    at: "2026-10-12T16:00:00+06:00",
    at_approx: true,
    at_lower: "2026-10-12T15:00:00+06:00",
    at_upper: "2026-10-12T18:00:00+06:00",
    place_text: "বাস টার্মিনালের কাছে",
    district_text: null,
    district_code: null,
    thana: null,
    circumstances: null,
  },
  reporter: { relation: null, phone: "01700000001" },
  evidence: {
    "child.name": spanFrom(EXTRACT_FIXTURE_SOURCE, "মিতু", "direct"),
    "child.age_years": spanFrom(EXTRACT_FIXTURE_SOURCE, "৭", "digits"),
    "child.sex": spanFrom(EXTRACT_FIXTURE_SOURCE, "মেয়ে", "direct"),
    "child.clothing": spanFrom(EXTRACT_FIXTURE_SOURCE, "লাল জামা", "direct"),
    "event.at": spanFrom(EXTRACT_FIXTURE_SOURCE, "গতকাল বিকেলে", "time_interval"),
    "event.place_text": spanFrom(EXTRACT_FIXTURE_SOURCE, "বাস টার্মিনালের কাছে", "direct"),
    "reporter.phone": spanFrom(EXTRACT_FIXTURE_SOURCE, "০১৭০০০০০০০১", "digits"),
  },
} satisfies CaseDraft;

// Rafi fixture (TC-002 / D6 §9.2). "গতকাল বিকেলে" resolves to the 15:00–18:00
// window; the demo's display reference is 16:00. District and clothing stay
// unknown (BR-008 — every value needs a source span, and the exact TC-002 text
// names the child, age, place and phone but not clothing; the blue shirt is
// the matching found-child row, not the parent report).
export const EXTRACT_FIXTURE_RAFI_DRAFT = {
  kind: "missing",
  source_text: EXTRACT_FIXTURE_RAFI_SOURCE,
  child: {
    name: "রাফি",
    name_latin: null,
    age_years: 13,
    age_min: 13,
    age_max: 13,
    sex: "male",
    height_cm: null,
    clothing: null,
    marks: null,
  },
  event: {
    at: "2026-10-08T16:00:00+06:00",
    at_approx: true,
    at_lower: "2026-10-08T15:00:00+06:00",
    at_upper: "2026-10-08T18:00:00+06:00",
    place_text: "মাদ্রাসা থেকে",
    district_text: null,
    district_code: null,
    thana: null,
    circumstances: null,
  },
  reporter: { relation: null, phone: "01711223344" },
  evidence: {
    "child.name": spanFrom(EXTRACT_FIXTURE_RAFI_SOURCE, "রাফি", "direct"),
    "child.age_years": spanFrom(EXTRACT_FIXTURE_RAFI_SOURCE, "১৩", "digits"),
    "child.sex": spanFrom(EXTRACT_FIXTURE_RAFI_SOURCE, "ছেলে", "direct"),
    "event.at": spanFrom(EXTRACT_FIXTURE_RAFI_SOURCE, "গতকাল বিকেলে", "time_interval"),
    "event.place_text": spanFrom(EXTRACT_FIXTURE_RAFI_SOURCE, "মাদ্রাসা থেকে", "direct"),
    "reporter.phone": spanFrom(EXTRACT_FIXTURE_RAFI_SOURCE, "০১৭১১২২৩৩৪৪", "digits"),
  },
} satisfies CaseDraft;

// Mim fixture (TC-013 / D6 §9.2). "আজ সকালে" → fixture intake clock 2026-10-12
// morning window 06:00–10:00 with display reference 08:00. District stays unknown.
export const EXTRACT_FIXTURE_MIM_DRAFT = {
  kind: "missing",
  source_text: EXTRACT_FIXTURE_MIM_SOURCE,
  child: {
    name: "মীম",
    name_latin: null,
    age_years: 11,
    age_min: 11,
    age_max: 11,
    sex: "female",
    height_cm: null,
    clothing: null,
    marks: null,
  },
  event: {
    at: "2026-10-12T08:00:00+06:00",
    at_approx: true,
    at_lower: "2026-10-12T06:00:00+06:00",
    at_upper: "2026-10-12T10:00:00+06:00",
    place_text: "টঙ্গী বাজারে",
    district_text: null,
    district_code: null,
    thana: null,
    circumstances: null,
  },
  reporter: { relation: null, phone: "01700000076" },
  evidence: {
    "child.name": spanFrom(EXTRACT_FIXTURE_MIM_SOURCE, "মীম", "direct"),
    "child.age_years": spanFrom(EXTRACT_FIXTURE_MIM_SOURCE, "১১", "digits"),
    "child.sex": spanFrom(EXTRACT_FIXTURE_MIM_SOURCE, "মেয়ে", "direct"),
    "event.at": spanFrom(EXTRACT_FIXTURE_MIM_SOURCE, "আজ সকালে", "time_interval"),
    "event.place_text": spanFrom(EXTRACT_FIXTURE_MIM_SOURCE, "টঙ্গী বাজারে", "direct"),
    "reporter.phone": spanFrom(EXTRACT_FIXTURE_MIM_SOURCE, "০১৭০০০০০০৭৬", "digits"),
  },
} satisfies CaseDraft;

export const TRANSCRIPT_FIXTURES: readonly TranscriptFixture[] = Object.freeze([]);

export const EXTRACT_FIXTURES: readonly ExtractFixture[] = Object.freeze([
  Object.freeze({
    sourceHash: createHash("sha256").update(EXTRACT_FIXTURE_SOURCE).digest("hex"),
    draft: EXTRACT_FIXTURE_DRAFT,
  }),
  Object.freeze({
    sourceHash: createHash("sha256").update(EXTRACT_FIXTURE_RAFI_SOURCE).digest("hex"),
    draft: EXTRACT_FIXTURE_RAFI_DRAFT,
  }),
  Object.freeze({
    sourceHash: createHash("sha256").update(EXTRACT_FIXTURE_MIM_SOURCE).digest("hex"),
    draft: EXTRACT_FIXTURE_MIM_DRAFT,
  }),
]);

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function findTranscriptFixture(_id: string, _audioHash: string): TranscriptFixture | null {
  return null;
}

export function findExtractFixture(sourceText: string): ExtractFixture | null {
  if (process.env.DEMO_MODE !== "1") return null;
  const sourceHash = createHash("sha256").update(sourceText).digest("hex");
  return EXTRACT_FIXTURES.find((entry) => entry.sourceHash === sourceHash) ?? null;
}

// Protected DEMO_MODE fixture path (TASK-014/020/033, FR-027/032, BR-026, TC-021/056).
//
// API-002 matches one exact synthetic source string by SHA-256. It returns the
// prepared draft only in DEMO_MODE=1 and always labels the response cached=true.
// It does not reserve a paid call or create transcript audio that is not present.
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

function evidence(quote: string, derivation: CaseDraft["evidence"][string]["derivation"]) {
  const start_utf16 = EXTRACT_FIXTURE_SOURCE.indexOf(quote);
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
    "child.name": evidence("মিতু", "direct"),
    "child.age_years": evidence("৭", "digits"),
    "child.sex": evidence("মেয়ে", "direct"),
    "child.clothing": evidence("লাল জামা", "direct"),
    "event.at": evidence("গতকাল বিকেলে", "time_interval"),
    "event.place_text": evidence("বাস টার্মিনালের কাছে", "direct"),
    "reporter.phone": evidence("০১৭০০০০০০০১", "digits"),
  },
} satisfies CaseDraft;

export const TRANSCRIPT_FIXTURES: readonly TranscriptFixture[] = Object.freeze([]);

export const EXTRACT_FIXTURES: readonly ExtractFixture[] = Object.freeze([
  Object.freeze({
    sourceHash: createHash("sha256").update(EXTRACT_FIXTURE_SOURCE).digest("hex"),
    draft: EXTRACT_FIXTURE_DRAFT,
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

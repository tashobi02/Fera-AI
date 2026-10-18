// Tests that every cache fixture's draft values are aligned with their source
// evidence, going beyond the Zod span-index check. The existing
// fixtures.test.ts only verifies that the byte range [start_utf16, end_utf16)
// of each evidence span matches the span.quote string in the source. That
// Zod check is necessary but NOT sufficient — the draft's *value* for that
// field could disagree with its evidence.quote (e.g. the Rafi fixture had
// place_text="মাদ্রাসার কাছে" with evidence.quote="মাদ্রাসা থেকে"; both passed
// Zod's span check, but the value silently re-framed the missing child's
// distance/direction).
//
// Field-by-field invariant proven by this test (one row per field in a
// fixture's evidence map):
//   - Text fields (name, clothing, marks, place_text, district_text,
//     thana, circumstances, relation): the value MUST equal evidence.quote
//     (or be the result of a documented derivation: Bangla digit ↔ number,
//     romanisation, district code mapping).
//   - Enumerated fields (sex): the value MUST be the enum mapping of the
//     quote (e.g. "ছেলে" → "male", "মেয়ে" → "female"). The quote in source
//     is the Bangla word; the value is the canonical enum.
//   - Numeric fields (age_years, age_min, age_max, height_cm): the value
//     MUST be the digit form of evidence.quote (ASCII or Bangla digits).
//   - Time fields (event.at, event.at_lower, event.at_upper): the value is
//     an ISO datetime the normaliser computes from the quote; a static
//     fixture therefore hard-codes a fixture-clock that the contract
//     recognises (see also the "cached time" test below).
//
// In addition this test:
//   1. calls the production evidence function (checkOutput) on every
//      fixture, each under its OWN labelled intake clock, and pins the exact
//      outcome (valid + the exact dropped set). Cached fixtures bypass
//      checkOutput in production (orchestrator.ts returns `fixture.draft`
//      directly), so the dropped set documents which cached values the live
//      AI path would NOT accept for the same source text;
//   2. asserts the cached time is a fixed, labelled clock — not `new Date()`.
import { describe, expect, it, vi } from "vitest";
import { checkOutput } from "@/server/ai/evidence";
import { extractInputSchema } from "@/server/ai/contract";
import type { AiDropped } from "@/server/ai/types";
import { toAsciiDigits, type CaseDraft, type EvidenceSpan, SEXES } from "@/contracts";
import { normaliseText } from "@/server/normalise";
import {
  EXTRACT_FIXTURE_DRAFT,
  EXTRACT_FIXTURE_RAFI_DRAFT,
  EXTRACT_FIXTURE_RAFI_SOURCE,
  EXTRACT_FIXTURE_MIM_DRAFT,
  EXTRACT_FIXTURE_MIM_SOURCE,
} from "@/server/cache";

// Cached event.at values (the fixture's own labels, see fixtures.ts):
// Mitu 12 Oct 16:00, Rafi 8 Oct 16:00, Mim 12 Oct 08:00. The cached at,
// at_lower, at_upper are static — never `new Date()`.
const FIXTURE_CLOCK = {
  mitu: "2026-10-12T16:00:00+06:00",
  rafi: "2026-10-08T16:00:00+06:00",
  mim:  "2026-10-12T08:00:00+06:00",
} as const;

// Intake clock each fixture is labelled with. The DATES come from the fixture
// labels: Mitu "গতকাল বিকেলে" on 13 Oct; Rafi "fixture intake clock 9 Oct";
// Mim "আজ সকালে" on 12 Oct. The labels give no time of day, so 10:00 is a
// test choice; normaliseTime uses only the Dhaka date of the clock for the
// relative "গতকাল <part of day>" grammar, so the hour does not change any
// outcome below.
const INTAKE_CLOCK = {
  mitu: "2026-10-13T10:00:00+06:00",
  rafi: "2026-10-09T10:00:00+06:00",
  mim:  "2026-10-12T10:00:00+06:00",
} as const;

const SEX_QUOTE_TO_ENUM: Record<string, typeof SEXES[number]> = {
  male: "male", boy: "male", ছেলে: "male", female: "female", girl: "female", মেয়ে: "female", other: "other",
};

function fixtureAsOutput(draft: CaseDraft) {
  const output: Record<string, Record<string, unknown>> = {
    child: { name: null, age_years: null, age_min: null, age_max: null, sex: "unknown", height_cm: null, clothing: null, marks: null },
    event: { at: null, at_lower: null, at_upper: null, at_approx: false, place_text: null, district_text: null, thana: null, circumstances: null },
    reporter: { relation: null, phone: null },
    evidence: {},
  };
  for (const [field, span] of Object.entries(draft.evidence)) {
    const [group, key] = field.split(".") as ["child" | "event" | "reporter", string];
    const value = (draft[group] as Record<string, unknown>)[key];
    output[group][key] = value;
    (output.evidence as Record<string, unknown>)[field] = span;
  }
  return output;
}

function checkDraft(draft: CaseDraft, source: string, nowIso: string) {
  const norm = normaliseText(source);
  if (norm.status !== "known") throw new Error("normalise failed for " + source);
  const input = extractInputSchema.parse({
    kind: "missing",
    sourceText: source,
    normalisedText: norm.value.normalisedText,
    nowIso,
  });
  return checkOutput(JSON.stringify(fixtureAsOutput(draft)), input, norm.value);
}

// Per-field invariant: a fixture's value MUST be derivable from its
// evidence.quote. The documented derivations are direct, digits, sex-lookup,
// and time_interval (a relative time phrase → ISO datetime the normaliser
// computes). Every provenanced field falls in one of them.
function assertValueMatchesQuote(draft: CaseDraft, source: string) {
  for (const [field, span] of Object.entries(draft.evidence)) {
    const [group, key] = field.split(".") as ["child" | "event" | "reporter", string];
    const value = (draft[group] as Record<string, unknown>)[key];
    const q = (span as EvidenceSpan).quote;
    const derivation = (span as EvidenceSpan).derivation;
    if (field === "child.sex") {
      // Enum mapping: Bangla word → canonical sex.
      expect(SEX_QUOTE_TO_ENUM[q.toLowerCase()], `${field} mapping in ${source}`).toBe(value);
    } else if (typeof value === "number") {
      // Numeric field: the value is the digit form (ASCII or Bangla) of q.
      const ascii = toAsciiDigits(q);
      expect(Number(ascii), `${field} numeric in ${source}`).toBe(value);
    } else if (derivation === "digits") {
      // String field with digit-derivation (e.g. reporter.phone): the value
      // is the ASCII-digit form of the Bangla-digit quote.
      expect(toAsciiDigits(q), `${field} digits in ${source}`).toBe(value);
    } else if (derivation === "time_interval") {
      // The quote is a relative phrase ("গতকাল বিকেলে", "আজ সকালে") and the
      // value is the ISO datetime the normaliser computes from it for the
      // fixture's known clock. The invariant is that the value falls inside
      // the [at_lower, at_upper] window the fixture also defines, and that
      // the source actually contains the quote.
      expect(q.length, `${field} quote in ${source}`).toBeGreaterThan(0);
      expect(source.includes(q), `${field} quote present in ${source}`).toBe(true);
      const lo = Date.parse(draft.event.at_lower!);
      const hi = Date.parse(draft.event.at_upper!);
      const t = Date.parse(value as string);
      expect(t, `${field} value parseable in ${source}`).not.toBeNaN();
      expect(t).toBeGreaterThanOrEqual(lo);
      expect(t).toBeLessThanOrEqual(hi);
    } else {
      // Direct: value must equal the source phrase exactly.
      expect(value, `${field} direct value in ${source}`).toBe(q);
    }
  }
}

describe("cache fixtures survive the production evidence function", () => {
  it("Mitu fixture: every provenanced value matches its source quote (text/digits/sex)", () => {
    vi.stubEnv("DEMO_MODE", "1");
    assertValueMatchesQuote(EXTRACT_FIXTURE_DRAFT, EXTRACT_FIXTURE_DRAFT.source_text);
  });

  it("Rafi fixture: every provenanced value matches its source quote (was: place_text 'মাদ্রাসার কাছে' vs quote 'মাদ্রাসা থেকে')", () => {
    vi.stubEnv("DEMO_MODE", "1");
    assertValueMatchesQuote(EXTRACT_FIXTURE_RAFI_DRAFT, EXTRACT_FIXTURE_RAFI_SOURCE);
    // Belt-and-braces: re-state the bug we just fixed.
    const place = EXTRACT_FIXTURE_RAFI_DRAFT.evidence["event.place_text"];
    expect(EXTRACT_FIXTURE_RAFI_DRAFT.event.place_text).toBe(place.quote);
  });

  it("Mim fixture: every provenanced value matches its source quote", () => {
    vi.stubEnv("DEMO_MODE", "1");
    assertValueMatchesQuote(EXTRACT_FIXTURE_MIM_DRAFT, EXTRACT_FIXTURE_MIM_SOURCE);
  });

  // The exact dropped sets below were observed by running checkOutput and
  // traced to the rule in src/server/ai/evidence.ts that fires:
  //   - LABEL rule (checkedSpan → hasLabelContext): child.name, child.clothing
  //     and event.place_text are accepted only when their clause is exactly
  //     "<label>[:=] value" (name|নাম, clothing|পোশাক|পরনে, place|স্থান). The
  //     scripted sources state these in narrative ("আমার মেয়ে মিতু", "লাল জামা
  //     পরা ছিল", "বাস টার্মিনালের কাছে হারিয়ে গেছে") with no label, so the
  //     spans match the source but fail the label-context rule.
  //   - PHONE LABEL rule: the same anchor for reporter.phone. Rafi/Mim say
  //     "। নম্বর ০১…" (clause prefix is exactly the label → kept); Mitu says
  //     "আমার নম্বর ০১…", whose clause prefix "আমার নম্বর" is not exactly a
  //     label → dropped.
  //   - TIME GRAMMAR: normaliseTime (COMP-008) supports only ISO datetimes and
  //     "গতকাল <part of day>". Mim's "আজ সকালে" is "unsupported", so its event.at
  //     drops under any clock.
  // Fields not listed survive with exactly the fixture's value.
  function expectExactOutcome(draft: CaseDraft, nowIso: string, expectedDropped: AiDropped[]) {
    const result = checkDraft(draft, draft.source_text, nowIso);
    expect(result.valid).toBe(true);
    expect(result.invalidReason).toBeUndefined();
    const byField = (a: AiDropped, b: AiDropped) => a.field.localeCompare(b.field);
    expect([...result.dropped].sort(byField)).toEqual([...expectedDropped].sort(byField));
    const droppedFields = new Set(expectedDropped.map((d) => d.field));
    for (const field of Object.keys(draft.evidence)) {
      if (droppedFields.has(field as AiDropped["field"])) continue;
      const [group, key] = field.split(".") as ["child" | "event" | "reporter", string];
      expect((result.draft[group] as Record<string, unknown>)[key], `${field} kept`).toBe((draft[group] as Record<string, unknown>)[key]);
    }
  }

  it("production checkOutput: Mitu fixture under its 13 Oct clock drops exactly name, clothing, place (label rule) and phone ('আমার নম্বর')", () => {
    vi.stubEnv("DEMO_MODE", "1");
    expectExactOutcome(EXTRACT_FIXTURE_DRAFT, INTAKE_CLOCK.mitu, [
      { field: "child.name", reason: "span_mismatch" },
      { field: "child.clothing", reason: "span_mismatch" },
      { field: "event.place_text", reason: "span_mismatch" },
      { field: "reporter.phone", reason: "span_mismatch" },
    ]);
    const source = EXTRACT_FIXTURE_DRAFT.source_text;
    const placeSpan = EXTRACT_FIXTURE_DRAFT.evidence["event.place_text"];
    expect(source.slice(placeSpan.start_utf16, placeSpan.end_utf16)).toBe(placeSpan.quote);
  });

  it("production checkOutput: Rafi fixture under its 9 Oct clock keeps event.at and phone, drops exactly name and place (label rule)", () => {
    vi.stubEnv("DEMO_MODE", "1");
    expectExactOutcome(EXTRACT_FIXTURE_RAFI_DRAFT, INTAKE_CLOCK.rafi, [
      { field: "child.name", reason: "span_mismatch" },
      { field: "event.place_text", reason: "span_mismatch" },
    ]);
    const span = EXTRACT_FIXTURE_RAFI_DRAFT.evidence["event.place_text"];
    expect(EXTRACT_FIXTURE_RAFI_SOURCE.slice(span.start_utf16, span.end_utf16)).toBe(span.quote);
    expect(EXTRACT_FIXTURE_RAFI_DRAFT.event.place_text).toBe(span.quote);
  });

  it("production checkOutput: Mim fixture under its 12 Oct clock drops exactly name, place (label rule) and event.at ('আজ সকালে' unsupported)", () => {
    vi.stubEnv("DEMO_MODE", "1");
    expectExactOutcome(EXTRACT_FIXTURE_MIM_DRAFT, INTAKE_CLOCK.mim, [
      { field: "child.name", reason: "span_mismatch" },
      { field: "event.at", reason: "span_mismatch" },
      { field: "event.place_text", reason: "span_mismatch" },
    ]);
  });

  it("cached event.at times are static, labelled clocks (no `new Date()`)", () => {
    vi.stubEnv("DEMO_MODE", "1");
    const cases: Array<[string, CaseDraft, string]> = [
      ["Mitu", EXTRACT_FIXTURE_DRAFT, FIXTURE_CLOCK.mitu],
      ["Rafi", EXTRACT_FIXTURE_RAFI_DRAFT, FIXTURE_CLOCK.rafi],
      ["Mim",  EXTRACT_FIXTURE_MIM_DRAFT,  FIXTURE_CLOCK.mim],
    ];
    for (const [name, draft, expectedAt] of cases) {
      // The exact scripted time window is hard-coded — no expression that
      // would resolve to a runtime current time. A future change to "new
      // Date()" or "Date.now()" must be flagged by this assertion.
      expect(draft.event.at, `${name} at`).toBe(expectedAt);
      expect(draft.event.at_lower, `${name} at_lower`).not.toBeNull();
      expect(draft.event.at_upper, `${name} at_upper`).not.toBeNull();
      // The at and its interval are in Asia/Dhaka (UTC+06:00), and the
      // interval contains the at.
      const at = Date.parse(draft.event.at!);
      const lo = Date.parse(draft.event.at_lower!);
      const hi = Date.parse(draft.event.at_upper!);
      expect(at).toBeGreaterThanOrEqual(lo);
      expect(at).toBeLessThanOrEqual(hi);
      // The interval does not span more than one calendar day.
      expect((hi - lo) / 86_400_000).toBeLessThan(1);
    }
  });
});

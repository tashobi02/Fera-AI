// Deterministic sample builder for the synthetic public-import path (TASK-048;
// API-015; TC-014; FR-024).
//
// The production default DEMO_MODE importer is restricted to the exact
// protected [MOCK] fixture texts in src/lib/admin-import-fixtures.ts:
// unknown, altered or arbitrary text is rejected with `invalid_draft` and
// never persisted. This is the safeguard against prompt injection
// ("synthetic: true + example.invalid = accept anything") — the URL is
// reserved and the contract requires it, but only the literal protected
// fixture text is ever turned into a draft.
//
// For every non-null derived field the builder extracts a source span
// (UTF-16 offsets into source_text, the literal quote, and a derivation
// enum) and passes it through the contracts evidence schema. There is no
// "evidence: {}" fall-back: an extracted value without a span fails the
// draft, and the row is not stored.
//
// "No guessed fields" (BR-001/008/021): the literal synthetic phone
// 01200-XXX-NNN (01200001234 / 01200001235), the literal event timestamp
// (2026-10-17T10:00 / 11:00 +06:00), the literal place and district are
// read directly from the protected fixture text. The clock is never used
// to invent a date; the sex is read from the literal word "boy" / "girl";
// the description for found reports is read from the literal "Description:
// ..." clause when present, otherwise the draft is rejected.
//
// Evidence is sourced from a single declared `ADMIN_IMPORT_SAMPLE_FIXTURES`
// table in src/lib/admin-import-fixtures.ts so the UI and the server share
// one allowlist.
import {
  AGE,
  caseDraftSchema,
  createFoundRequestSchema,
  createMissingRequestSchema,
  inputDateTimeSchema,
  type CaseDraft,
  type CaseKind,
  type FoundSubmissionDraft,
  type MissingSubmissionDraft,
  type EvidenceSpan,
} from "@/contracts";
import { ADMIN_IMPORT_SAMPLE_FIXTURES } from "@/lib/admin-import-fixtures";

const FIXTURE_TEXTS = {
  missing: ADMIN_IMPORT_SAMPLE_FIXTURES.missing,
  found: ADMIN_IMPORT_SAMPLE_FIXTURES.found,
} as const;

const DISTRICT_FIXTURE_NAMES: ReadonlyMap<string, number> = new Map([
  ["ঢাকা", 13],
  ["চট্টগ্রাম", 9],
  ["সিলেট", 38],
  ["খুলনা", 47],
  ["রাজশাহী", 50],
  ["বরিশাল", 4],
  ["রংপুর", 55],
  ["ময়মনসিংহ", 39],
  ["কুমিল্লা", 8],
  ["গাজীপুর", 17],
]);

function findDistrictMention(text: string): { code: number; placeText: string } | null {
  for (const [name, code] of DISTRICT_FIXTURE_NAMES) {
    if (text.includes(name)) return { code, placeText: name };
  }
  return null;
}

// `direct` evidence: a literal substring of `source` that exactly matches
// `quote` and lives at `start_utf16`..`end_utf16`. The call site has to
// compute the offsets; this helper just stamps the derivation.
function directSpan(source: string, quote: string, derivation: "direct" | "district_mapping" = "direct"): EvidenceSpan {
  const start = source.indexOf(quote);
  if (start < 0) throw new Error(`evidence quote not found: ${quote}`);
  if (source.slice(start, start + quote.length) !== quote) {
    throw new Error(`evidence quote mismatch at ${start}: ${quote}`);
  }
  return {
    quote,
    start_utf16: start,
    end_utf16: start + quote.length,
    derivation,
  };
}

// Extract the literal `Description: ...` clause from the protected
// fixture text. The clause ends at the next `.` or end-of-text.
function extractDescription(source: string): string | null {
  const marker = "Description:";
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const after = source.slice(start + marker.length).trimStart();
  const end = after.indexOf(".");
  const value = (end >= 0 ? after.slice(0, end) : after).trim();
  return value.length >= 3 ? value : null;
}

// Extract the literal `Event at: <iso>` clause from the protected fixture
// text. The ISO must be valid per the inputDateTimeSchema and is returned
// alongside its source span.
function extractEventAt(source: string): { value: string; span: EvidenceSpan } | null {
  const marker = "Event at: ";
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const after = source.slice(start + marker.length);
  const end = after.indexOf(".");
  if (end < 0) return null;
  const candidate = after.slice(0, end).trim();
  const parsed = inputDateTimeSchema.safeParse(candidate);
  if (!parsed.success) return null;
  return {
    value: parsed.data,
    span: {
      quote: candidate,
      start_utf16: start + marker.length,
      end_utf16: start + marker.length + candidate.length,
      derivation: "direct",
    },
  };
}

// Extract the literal `Reporter phone: 0120000NNNN` clause from the
// protected fixture text. The phone must be exactly 11 digits starting
// with 01; an altered or unknown value fails the draft.
function extractReporterPhone(source: string): { value: string; span: EvidenceSpan } | null {
  const marker = "Reporter phone: ";
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const after = source.slice(start + marker.length);
  const end = after.search(/[^\d]/);
  const candidate = (end < 0 ? after : after.slice(0, end)).trim();
  if (!/^01\d{9}$/.test(candidate)) return null;
  return {
    value: candidate,
    span: {
      quote: candidate,
      start_utf16: start + marker.length,
      end_utf16: start + marker.length + candidate.length,
      derivation: "direct",
    },
  };
}

// Extract the literal `Place: <text>` clause (up to a `.`). The clause
// starts after "Place: " and runs to the next `.` or end-of-text.
function extractPlace(source: string): { value: string; span: EvidenceSpan } | null {
  const marker = "Place: ";
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const after = source.slice(start + marker.length);
  const end = after.indexOf(".");
  const value = (end >= 0 ? after.slice(0, end) : after).trim();
  if (value.length < 1) return null;
  return {
    value,
    span: {
      quote: value,
      start_utf16: start + marker.length,
      end_utf16: start + marker.length + value.length,
      derivation: "direct",
    },
  };
}

// Extract the literal `District: <text>` clause and map it to a code
// from the closed dictionary above. The clause's quote is the Bangla
// district name; the derivation is "district_mapping" so reviewers can
// see the mapping was applied.
function extractDistrict(source: string): { value: string; code: number; span: EvidenceSpan } | null {
  const marker = "District: ";
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const after = source.slice(start + marker.length);
  const end = after.indexOf(".");
  const value = (end >= 0 ? after.slice(0, end) : after).trim();
  if (value.length < 1) return null;
  const code = findDistrictMention(value);
  if (code === null) return null;
  return {
    value: code.placeText,
    code: code.code,
    span: {
      quote: value,
      start_utf16: start + marker.length,
      end_utf16: start + marker.length + value.length,
      derivation: "district_mapping",
    },
  };
}

// Extract the literal `Age: <n>` and `Sex: <word>` clauses.
function extractAgeSex(source: string): { age: number; sex: "male" | "female"; ageSpan: EvidenceSpan; sexSpan: EvidenceSpan } | null {
  const ageMarker = "Age: ";
  const sexMarker = "Sex: ";
  const ageIdx = source.indexOf(ageMarker);
  const sexIdx = source.indexOf(sexMarker);
  if (ageIdx < 0 || sexIdx < 0) return null;
  const ageAfter = source.slice(ageIdx + ageMarker.length);
  const ageEnd = ageAfter.search(/[^\d]/);
  const ageStr = (ageEnd < 0 ? ageAfter : ageAfter.slice(0, ageEnd)).trim();
  const age = Number(ageStr);
  if (!Number.isInteger(age) || age < 0 || age > 17) return null;
  const sexAfter = source.slice(sexIdx + sexMarker.length);
  const sexEnd = sexAfter.search(/[^a-zA-Z]/);
  const sexWord = (sexEnd < 0 ? sexAfter : sexAfter.slice(0, sexEnd)).trim().toLowerCase();
  if (sexWord !== "boy" && sexWord !== "girl") return null;
  const sex: "male" | "female" = sexWord === "boy" ? "male" : "female";
  return {
    age,
    sex,
    ageSpan: {
      quote: ageStr,
      start_utf16: ageIdx + ageMarker.length,
      end_utf16: ageIdx + ageMarker.length + ageStr.length,
      derivation: "direct",
    },
    sexSpan: {
      quote: sexWord,
      start_utf16: sexIdx + sexMarker.length,
      end_utf16: sexIdx + sexMarker.length + sexWord.length,
      derivation: "direct",
    },
  };
}

export type SampleBuilderResult =
  | { ok: true; draft: MissingSubmissionDraft | FoundSubmissionDraft; kind: CaseKind; deterministic: true }
  | { ok: false; reason: "invalid_text" | "invalid_draft" };

export type SampleBuilder = (text: string, kind: CaseKind, nowIso: string) => SampleBuilderResult;

export function buildSampleDraft(demoMode: boolean): SampleBuilder {
  return (text, kind, nowIso) => {
    if (text.length < 20 || text.length > 2000) {
      return { ok: false, reason: "invalid_text" };
    }
    if (!demoMode) {
      // Without DEMO_MODE this deterministic sample builder is disabled. No
      // live provider is wired here, so the import service marks the item skipped.
      return { ok: false, reason: "invalid_draft" };
    }
    // The production default DEMO_MODE importer only accepts the exact
    // protected [MOCK] fixture texts. Unknown, altered or arbitrary text
    // is rejected so prompt-injected text can never be persisted as a
    // synthetic case.
    const fixtureText = FIXTURE_TEXTS[kind];
    if (text !== fixtureText) {
      return { ok: false, reason: "invalid_draft" };
    }
    void nowIso; // deterministic fixture time; never derived from the clock

    // Extract every derived field and its source span. Any failure here
    // is a malformed fixture (the fixtures are checked into source) and
    // fails the draft — there is no fall-back to "evidence: {}".
    const eventAt = extractEventAt(text);
    if (!eventAt) return { ok: false, reason: "invalid_draft" };
    const reporterPhone = extractReporterPhone(text);
    if (!reporterPhone) return { ok: false, reason: "invalid_draft" };
    const place = extractPlace(text);
    if (!place) return { ok: false, reason: "invalid_draft" };
    const district = extractDistrict(text);
    if (!district) return { ok: false, reason: "invalid_draft" };
    const ageSex = extractAgeSex(text);
    if (!ageSex) return { ok: false, reason: "invalid_draft" };

    const evidence: Record<string, EvidenceSpan> = {
      "child.age_years": ageSex.ageSpan,
      "child.age_min": ageSex.ageSpan,
      "child.age_max": ageSex.ageSpan,
      "child.sex": ageSex.sexSpan,
      "event.at": eventAt.span,
      "event.at_lower": eventAt.span,
      "event.at_upper": eventAt.span,
      "event.place_text": place.span,
      "event.district_code": district.span,
      "reporter.phone": reporterPhone.span,
    };

    let circumstances: string | null = null;
    const clothing: string | null = null;
    const marks: string | null = null;
    if (kind === "found") {
      const desc = extractDescription(text);
      if (!desc) return { ok: false, reason: "invalid_draft" };
      circumstances = desc;
      const descSpan: EvidenceSpan = directSpan(text, desc);
      evidence["event.circumstances"] = descSpan;
    }

    const draft: CaseDraft = {
      kind,
      source_text: text,
      child: {
        name: null,
        name_latin: null,
        age_years: ageSex.age,
        age_min: ageSex.age,
        age_max: ageSex.age,
        sex: ageSex.sex,
        height_cm: null,
        clothing,
        marks,
      },
      event: {
        at: eventAt.value,
        at_approx: false,
        at_lower: eventAt.value,
        at_upper: eventAt.value,
        place_text: place.value,
        district_text: null,
        district_code: district.code,
        thana: null,
        circumstances,
      },
      reporter: { relation: null, phone: reporterPhone.value },
      evidence,
    };

    let parsed: MissingSubmissionDraft | FoundSubmissionDraft;
    try {
      if (kind === "missing") {
        parsed = createMissingRequestSchema.shape.draft.parse(draft);
      } else {
        parsed = createFoundRequestSchema.shape.draft.parse(draft);
      }
    } catch {
      return { ok: false, reason: "invalid_draft" };
    }
    const structural = caseDraftSchema.safeParse({ ...parsed, kind });
    if (!structural.success) {
      return { ok: false, reason: "invalid_draft" };
    }
    if (parsed.child.age_years !== null && (parsed.child.age_years < 0 || parsed.child.age_years > AGE.exactMax)) {
      return { ok: false, reason: "invalid_draft" };
    }
    return { ok: true, draft: parsed, kind, deterministic: true };
  };
}

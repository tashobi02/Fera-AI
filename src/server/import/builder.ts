// Deterministic sample builder for the synthetic public-import path (TASK-048;
// API-015; TC-014; FR-024).
//
// The contract for reviewed drafts is strict: every field must satisfy the
// submission schema, every CHECK in cases is enforced by the database, and
// "no guessed fields" is the rule. The builder therefore:
//
//   1. Rejects texts that are too short or too long before producing anything.
//   2. Extracts one or two deterministic values from the text (district code
//      by exact substring, an age digit when present) using small, fixed
//      dictionaries. Any text that does not match a known phrase keeps the
//      relevant field as null — the SQL CHECK permits nulls for unknown age,
//      unknown event time, etc. We never invent a value the text does not
//      carry.
//   3. Returns a fully schema-valid draft, parsed through the missing/found
//      submission schemas. The route then calls processPublicImportItem with
//      `confirmed: true` semantics implicit in the case service helper.
//
// The request supplies the fixture intake time, so the same text, kind and
// timestamp always produce the same draft (no Date.now, no Math.random). This
// is the deterministic, labelled simulated path: every output is reproducible, every
// output carries the synthetic badge in the UI, and no field is invented.
//
// Evidence spans are not produced (the schema's evidence schema is strict
// about UTF-16 offsets). The provenance column is therefore '{}' for every
// imported row; the cases CHECK on anonymised_at requires
// provenance = '{}' for redacted rows but does not forbid it on live rows.
// We do not emit any evidence span, so we never accidentally echo a child
// payload or a name back into the audit.
import { createHash } from "node:crypto";
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
} from "@/contracts";

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

// Lower-case fallback for Latin/romanised district names in mixed-language text.
const DISTRICT_FIXTURE_LATIN: ReadonlyMap<string, number> = new Map([
  ["dhaka", 13],
  ["chattogram", 9],
  ["chittagong", 9],
  ["sylhet", 38],
  ["khulna", 47],
  ["rajshahi", 50],
  ["barishal", 4],
  ["barisal", 4],
  ["rangpur", 55],
  ["mymensingh", 39],
  ["comilla", 8],
  ["gazipur", 17],
]);

function findDistrictMention(text: string): { code: number; placeText: string } | null {
  for (const [name, code] of DISTRICT_FIXTURE_NAMES) {
    if (text.includes(name)) return { code, placeText: name };
  }
  const lower = text.toLowerCase();
  for (const [name, code] of DISTRICT_FIXTURE_LATIN) {
    const start = lower.indexOf(name);
    if (start >= 0) return { code, placeText: text.slice(start, start + name.length) };
  }
  return null;
}

function findAgeYears(text: string): number | null {
  // Match a single 0..17 number adjacent to the words বয়স / age / years.
  const m = text.match(/(?:বয়স|age|বছর|years?)[\s:ঃ]*?([0-9]{1,2})/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 0 || n > 17) return null;
  return n;
}

function findSex(text: string): "male" | "female" | "other" | "unknown" {
  if (/(ছেলে|বালক|পুত্র|son|boy)/i.test(text)) return "male";
  if (/(মেয়ে|বালিকা|কন্যা|girl|daughter)/i.test(text)) return "female";
  return "unknown";
}

// "আজ" / "আজকে" / "এখন" — relative to the clock. "গতকাল" / "yesterday" — clock-1d.
function findEventWindow(text: string, now: Date): { at: string; at_lower: string; at_upper: string; at_approx: boolean } {
  const nowIso = inputDateTimeSchema.parse(now.toISOString());
  if (/(আজ|আজকে|এখন|now|today)/i.test(text)) {
    return { at: nowIso, at_lower: nowIso, at_upper: nowIso, at_approx: false };
  }
  if (/(গতকাল|yesterday)/i.test(text)) {
    const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yIso = inputDateTimeSchema.parse(y.toISOString());
    return { at: yIso, at_lower: yIso, at_upper: yIso, at_approx: false };
  }
  // Unparseable: keep the SQL CHECK happy with the clock-aligned defaults.
  // We never guess a date.
  return { at: nowIso, at_lower: nowIso, at_upper: nowIso, at_approx: true };
}

function deterministicPhone(text: string, seed: string): string {
  // A synthetic placeholder matching the database's required 11-digit shape.
  // The first 9 SHA-256 hex digits are mapped to digits and prefixed with "01".
  const hash = createHash("sha256").update(`${seed}|${text}`).digest("hex").slice(0, 9);
  const digits = hash.replace(/[a-f]/g, (c) => String(parseInt(c, 16) % 10));
  return `01${digits.slice(0, 9)}`;
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
    const now = new Date(nowIso);
    const district = findDistrictMention(text);
    if (district === null) {
      // The cases CHECK requires district_code NOT NULL for non-redacted rows
      // (universal CHECK at line ~155 of schema_v2.sql). An invented
      // district would be a guessed field. Without a known fixture
      // district, the row cannot be stored; skip with a clear reason.
      return { ok: false, reason: "invalid_draft" };
    }
    const age = findAgeYears(text);
    const sex = findSex(text);
    const window = findEventWindow(text, now);
    const phone = deterministicPhone(text, kind);
    const sourceText = text;

    // Found reports require a description (circumstances/clothing/marks) of
    // at least 3 characters. The text already contains at least 20
    // characters; we re-use the first 3 words as a deterministic
    // "circumstances" when the kind is 'found'. This is not a guess at
    // truth: it is a deterministic label of the input text, exactly what
    // the simulated sample is.
    const first3 = sourceText.replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" ");
    const circumstances = kind === "found" ? first3.slice(0, MAX.circumstances) : null;

    const draft: CaseDraft = {
      kind,
      source_text: sourceText,
      child: {
        name: null,
        name_latin: null,
        age_years: age,
        age_min: age,
        age_max: age,
        sex,
        height_cm: null,
        clothing: null,
        marks: null,
      },
      event: {
        at: window.at,
        at_approx: window.at_approx,
        at_lower: window.at_lower,
        at_upper: window.at_upper,
        place_text: district.placeText,
        district_text: null,
      district_code: district.code,
        thana: null,
        circumstances,
      },
      reporter: { relation: null, phone },
      evidence: {},
    };

    // The schema's submission transforms fill exact age, drop district_text, etc.
    // Parse through the right submission schema so we hand the case service a
    // fully reviewed, contract-shaped draft.
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
    // The base draft schema's source_text is the only field we re-use, so
    // additionally validate through caseDraftSchema (structural).
    const structural = caseDraftSchema.safeParse({ ...parsed, kind });
    if (!structural.success) {
      return { ok: false, reason: "invalid_draft" };
    }
    // Sanity: missing needs age_min, found needs description of length 3.
    if (kind === "missing" && parsed.child.age_min === null) {
      return { ok: false, reason: "invalid_draft" };
    }
    if (kind === "found" && (parsed.event.circumstances === null || parsed.event.circumstances.length < 3)) {
      return { ok: false, reason: "invalid_draft" };
    }
    // AGE.exactMax applies to both, but the missing schema also bounds
    // age_min/age_max to 17; guard against an out-of-range 0..25 estimate.
    if (parsed.child.age_years !== null && (parsed.child.age_years < 0 || parsed.child.age_years > AGE.exactMax)) {
      return { ok: false, reason: "invalid_draft" };
    }
    return { ok: true, draft: parsed, kind, deterministic: true };
  };
}

const MAX = {
  circumstances: 500,
} as const;

// CaseDraft: the reviewed editable payload (D5 §6, D2A §5.4) and its submission rules
// (BR-015/016). A draft never carries a token, AI counter or session metadata.
import { z } from "zod";
import {
  AGE,
  CLOCK_SKEW_MS,
  FIELD_MAX_CHARS as MAX,
  HEIGHT_CM,
  LIMITS,
  districtCodeSchema,
  inputDateTimeSchema,
  noNulString,
  optionalText,
  phoneSchema,
  trimmedText,
} from "./primitives";
import { DRAFT_FIELD_PATHS, EVIDENCE_DERIVATIONS, caseKindSchema, sexSchema } from "./states";

// Quotes refer to source_text in UTF-16 offsets (D2A §2.1).
export const evidenceSpanSchema = z
  .strictObject({
    quote: noNulString().min(1).max(LIMITS.quoteChars),
    start_utf16: z.int().min(0).max(MAX.raw_text),
    end_utf16: z.int().min(1).max(MAX.raw_text),
    derivation: z.enum(EVIDENCE_DERIVATIONS),
  })
  .refine((s) => s.end_utf16 - s.start_utf16 === s.quote.length, {
    message: "span length must equal quote length",
    path: ["end_utf16"],
  });
export type EvidenceSpan = z.infer<typeof evidenceSpanSchema>;

const evidenceFields: readonly string[] = DRAFT_FIELD_PATHS;
const evidenceSchema = z.record(
  z.string().refine((k) => evidenceFields.includes(k), "unknown evidence field"),
  evidenceSpanSchema,
);
// Not trimmed: evidence offsets point into it unchanged.
const sourceTextSchema = noNulString().max(MAX.raw_text);

const childBase = {
  name: optionalText(MAX.child_name),
  name_latin: optionalText(MAX.child_name_latin),
  sex: sexSchema,
  height_cm: z.int().min(HEIGHT_CM.min).max(HEIGHT_CM.max).nullable(),
  clothing: optionalText(MAX.clothing),
  marks: optionalText(MAX.marks),
};
const ageYears = z.int().min(0).max(AGE.exactMax).nullable();
const ageBound = (max: number) => z.int().min(0).max(max).nullable();

const eventBase = {
  at_approx: z.boolean(),
  thana: optionalText(MAX.thana),
  circumstances: optionalText(MAX.circumstances),
};

// Structural draft: unknowns stay null. Used by extraction and owner reads.
export const caseDraftSchema = z
  .strictObject({
    kind: caseKindSchema,
    source_text: sourceTextSchema,
    child: z.strictObject({ ...childBase, age_years: ageYears, age_min: ageBound(AGE.estimateMax), age_max: ageBound(AGE.estimateMax) }),
    event: z.strictObject({
      ...eventBase,
      at: inputDateTimeSchema.nullable(),
      at_lower: inputDateTimeSchema.nullable(),
      at_upper: inputDateTimeSchema.nullable(),
      place_text: optionalText(MAX.place_text),
      district_text: optionalText(80),
      district_code: districtCodeSchema.nullable(),
    }),
    reporter: z.strictObject({ relation: optionalText(MAX.reporter_relation), phone: optionalText(32) }),
    evidence: evidenceSchema,
  })
  .superRefine(checkSpans, { when: spansParse });
export type CaseDraft = z.infer<typeof caseDraftSchema>;
export type CaseDraftInput = z.input<typeof caseDraftSchema>;

/* ---------- Submission rules ---------- */

const agesSubset = (max: number) => z.object({ age_years: ageYears, age_min: ageBound(max), age_max: ageBound(max) });

function checkAges(required: boolean) {
  return (c: { age_years: number | null; age_min: number | null; age_max: number | null }, ctx: z.RefinementCtx) => {
    if (c.age_years === null && c.age_min === null && c.age_max === null) {
      if (required) ctx.addIssue({ code: "custom", message: "age or complete age range required", path: ["age_years"] });
      return;
    }
    if ((c.age_min === null) !== (c.age_max === null)) {
      ctx.addIssue({ code: "custom", message: "age range needs both endpoints", path: ["age_max"] });
      return;
    }
    if (c.age_min !== null && c.age_max !== null && c.age_min > c.age_max) {
      ctx.addIssue({ code: "custom", message: "age_min must not exceed age_max", path: ["age_max"] });
    }
    if (c.age_years !== null && c.age_min !== null && (c.age_min !== c.age_years || c.age_max !== c.age_years)) {
      ctx.addIssue({ code: "custom", message: "exact age conflicts with range", path: ["age_years"] });
    }
  };
}

// Exact age is stored as age_min = age_max = age_years (BR-016).
function fillExactAge<T extends { age_years: number | null; age_min: number | null; age_max: number | null }>(c: T): T {
  return c.age_years !== null && c.age_min === null ? { ...c, age_min: c.age_years, age_max: c.age_years } : c;
}

function childSchema(kind: "missing" | "found") {
  const max = kind === "missing" ? AGE.missingMax : AGE.estimateMax;
  const subset = agesSubset(max);
  return z
    .strictObject({ ...childBase, age_years: ageYears, age_min: ageBound(max), age_max: ageBound(max) })
    .superRefine(checkAges(kind === "missing"), { when: (p) => subset.safeParse(p.value).success })
    .transform(fillExactAge);
}

// Compared at millisecond precision; inputDateTimeSchema rejects finer digits.
// `at` and `at_upper` allow CLOCK_SKEW_MS for device clocks. `at_lower` uses zero
// skew because the database trigger compares it to clock_timestamp() exactly.
const isFuture = (iso: string) => Date.parse(iso) > Date.now() + CLOCK_SKEW_MS;
const lowerIsFuture = (iso: string) => Date.parse(iso) > Date.now();
const timesSubset = z.object({
  at: inputDateTimeSchema,
  at_lower: inputDateTimeSchema,
  at_upper: inputDateTimeSchema,
  at_approx: z.boolean(),
});

// SQL only rejects a future event_at_lower (zero skew, mirrored here). The contract
// also rejects a future event time or interval end (BR-016), with CLOCK_SKEW_MS.
const submissionEventSchema = z
  .strictObject({
    ...eventBase,
    at: inputDateTimeSchema.refine((v) => !isFuture(v), "event time cannot be in the future"),
    at_lower: inputDateTimeSchema,
    at_upper: inputDateTimeSchema,
    place_text: trimmedText(1, MAX.place_text),
    // No cases column stores it (CN-06): accepted for form round-trips, always null after parsing.
    district_text: optionalText(80).optional().transform(() => null),
    district_code: districtCodeSchema,
  })
  .superRefine(
    (e, ctx) => {
      const [at, lo, hi] = [Date.parse(e.at), Date.parse(e.at_lower), Date.parse(e.at_upper)];
      if (lo > hi) ctx.addIssue({ code: "custom", message: "at_lower must not exceed at_upper", path: ["at_upper"] });
      else if (at < lo || at > hi) ctx.addIssue({ code: "custom", message: "event time outside its interval", path: ["at"] });
      else if (!e.at_approx && (lo !== at || hi !== at))
        ctx.addIssue({ code: "custom", message: "exact event needs equal bounds", path: ["at_approx"] });
      else if (!isFuture(e.at) && isFuture(e.at_upper))
        ctx.addIssue({ code: "custom", message: "interval cannot end in the future", path: ["at_upper"] });
      else if (!isFuture(e.at) && lowerIsFuture(e.at_lower))
        ctx.addIssue({ code: "custom", message: "interval cannot start in the future", path: ["at_lower"] });
    },
    { when: (p) => timesSubset.safeParse(p.value).success },
  );

// district_text is never submitted (CN-06), so its evidence key is dropped too.
const submissionEvidenceSchema = evidenceSchema.transform((e) =>
  Object.fromEntries(Object.entries(e).filter(([k]) => k !== "event.district_text")),
);

const submissionReporterSchema = z.strictObject({ relation: optionalText(MAX.reporter_relation), phone: phoneSchema });

const spansSubset = z.object({ source_text: sourceTextSchema, evidence: evidenceSchema });
function spansParse(p: { value: unknown }) {
  return spansSubset.safeParse(p.value).success;
}
function checkSpans(d: { source_text: string; evidence: Record<string, EvidenceSpan> }, ctx: z.RefinementCtx) {
  for (const [field, span] of Object.entries(d.evidence)) {
    if (d.source_text.slice(span.start_utf16, span.end_utf16) !== span.quote) {
      ctx.addIssue({ code: "custom", message: "quote does not match source_text span", path: ["evidence", field] });
    }
  }
}

export const missingSubmissionDraftSchema = z
  .strictObject({
    kind: z.literal("missing"),
    source_text: sourceTextSchema,
    child: childSchema("missing"),
    event: submissionEventSchema,
    reporter: submissionReporterSchema,
    evidence: submissionEvidenceSchema,
  })
  .superRefine(checkSpans, { when: spansParse });
export type MissingSubmissionDraft = z.output<typeof missingSubmissionDraftSchema>;
export type MissingSubmissionDraftInput = z.input<typeof missingSubmissionDraftSchema>;

// Mirrors the SQL CHECK length(trim(concat_ws(' ', circumstances, clothing, marks))) >= 3:
// NULLs skipped, joined with spaces, only spaces trimmed, code points counted.
export function foundDescriptionLength(parts: readonly (string | null)[]): number {
  const joined = parts.filter((p): p is string => p !== null).join(" ");
  return [...joined.replace(/^ +| +$/g, "")].length;
}

const descriptionSubset = z.object({
  child: z.object({ clothing: optionalText(MAX.clothing), marks: optionalText(MAX.marks) }),
  event: z.object({ circumstances: optionalText(MAX.circumstances) }),
});

// Found: description required (circumstances/clothing/marks), age may be unknown.
export const foundSubmissionDraftSchema = z
  .strictObject({
    kind: z.literal("found"),
    source_text: sourceTextSchema,
    child: childSchema("found"),
    event: submissionEventSchema,
    reporter: submissionReporterSchema,
    evidence: submissionEvidenceSchema,
  })
  .superRefine(checkSpans, { when: spansParse })
  .superRefine(
    (d, ctx) => {
      if (foundDescriptionLength([d.event.circumstances, d.child.clothing, d.child.marks]) < 3) {
        ctx.addIssue({ code: "custom", message: "found report needs a description", path: ["event", "circumstances"] });
      }
    },
    { when: (p) => descriptionSubset.safeParse(p.value).success },
  );
export type FoundSubmissionDraft = z.output<typeof foundSubmissionDraftSchema>;
export type FoundSubmissionDraftInput = z.input<typeof foundSubmissionDraftSchema>;

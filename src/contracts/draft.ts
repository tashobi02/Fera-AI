// CaseDraft: the reviewed editable payload (D5 §6, D2A §5.4) and its submission rules
// (BR-015/016). A draft never carries a token, AI counter or session metadata.
import { z } from "zod";
import { districtCodeSchema, isoDateTimeSchema, phoneSchema } from "./primitives";
import { EVIDENCE_DERIVATIONS, caseKindSchema, sexSchema } from "./states";

const text = (max: number) => z.string().max(max).nullable();

export const EVIDENCE_FIELDS = [
  "child.name", "child.name_latin", "child.age_years", "child.age_min", "child.age_max", "child.sex",
  "child.height_cm", "child.clothing", "child.marks",
  "event.at", "event.at_lower", "event.at_upper", "event.place_text", "event.district_text",
  "event.district_code", "event.thana", "event.circumstances",
  "reporter.relation", "reporter.phone",
] as const;

// Quotes refer to source_text in UTF-16 offsets (D2A §2.1).
export const evidenceSpanSchema = z
  .strictObject({
    quote: z.string().min(1),
    start_utf16: z.int().min(0),
    end_utf16: z.int().min(1),
    derivation: z.enum(EVIDENCE_DERIVATIONS),
  })
  .refine((s) => s.end_utf16 - s.start_utf16 === s.quote.length, {
    message: "span length must equal quote length",
    path: ["end_utf16"],
  });
export type EvidenceSpan = z.infer<typeof evidenceSpanSchema>;

const evidenceFields: readonly string[] = EVIDENCE_FIELDS;
const evidenceSchema = z.record(
  z.string().refine((k) => evidenceFields.includes(k), "unknown evidence field"),
  evidenceSpanSchema,
);
const sourceTextSchema = z.string().max(4000);

const childBase = {
  name: text(80),
  name_latin: text(80),
  sex: sexSchema,
  height_cm: z.int().min(40).max(220).nullable(),
  clothing: text(300),
  marks: text(300),
};
const ageYears = z.int().min(0).max(17).nullable();
const ageBound = (max: number) => z.int().min(0).max(max).nullable();

const eventBase = {
  at_approx: z.boolean(),
  district_text: text(80),
  thana: text(80),
  circumstances: text(500),
};

// Structural draft: unknowns stay null. Used by extraction and owner reads.
export const caseDraftSchema = z
  .strictObject({
    kind: caseKindSchema,
    source_text: sourceTextSchema,
    child: z.strictObject({ ...childBase, age_years: ageYears, age_min: ageBound(25), age_max: ageBound(25) }),
    event: z.strictObject({
      ...eventBase,
      at: isoDateTimeSchema.nullable(),
      at_lower: isoDateTimeSchema.nullable(),
      at_upper: isoDateTimeSchema.nullable(),
      place_text: text(200),
      district_code: districtCodeSchema.nullable(),
    }),
    reporter: z.strictObject({ relation: text(40), phone: z.string().max(32).nullable() }),
    evidence: evidenceSchema,
  })
  .superRefine(checkSpans, { when: spansParse });
export type CaseDraft = z.infer<typeof caseDraftSchema>;

/* ---------- Submission rules ---------- */

const agesSubset = (max: number) =>
  z.object({ age_years: ageYears, age_min: ageBound(max), age_max: ageBound(max) });

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
  const max = kind === "missing" ? 17 : 25;
  const subset = agesSubset(max);
  return z
    .strictObject({ ...childBase, age_years: ageYears, age_min: ageBound(max), age_max: ageBound(max) })
    .superRefine(checkAges(kind === "missing"), { when: (p) => subset.safeParse(p.value).success })
    .transform(fillExactAge);
}

const notFuture = (iso: string) => Date.parse(iso) <= Date.now();
const timesSubset = z.object({
  at: isoDateTimeSchema,
  at_lower: isoDateTimeSchema,
  at_upper: isoDateTimeSchema,
  at_approx: z.boolean(),
});

// Exact events cannot be future; approximate bounds must be consistent with intake time.
const submissionEventSchema = z
  .strictObject({
    ...eventBase,
    at: isoDateTimeSchema.refine(notFuture, "event time cannot be in the future"),
    at_lower: isoDateTimeSchema,
    at_upper: isoDateTimeSchema,
    place_text: z.string().trim().min(1).max(200),
    district_code: districtCodeSchema,
  })
  .superRefine(
    (e, ctx) => {
      const [at, lo, hi] = [Date.parse(e.at), Date.parse(e.at_lower), Date.parse(e.at_upper)];
      if (lo > hi) ctx.addIssue({ code: "custom", message: "at_lower must not exceed at_upper", path: ["at_upper"] });
      else if (at < lo || at > hi) ctx.addIssue({ code: "custom", message: "event time outside its interval", path: ["at"] });
      else if (!e.at_approx && (lo !== at || hi !== at))
        ctx.addIssue({ code: "custom", message: "exact event needs equal bounds", path: ["at_approx"] });
      else if (at <= Date.now() && hi > Date.now())
        ctx.addIssue({ code: "custom", message: "interval cannot end in the future", path: ["at_upper"] });
    },
    { when: (p) => timesSubset.safeParse(p.value).success },
  );

const submissionReporterSchema = z.strictObject({ relation: text(40), phone: phoneSchema });

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
    evidence: evidenceSchema,
  })
  .superRefine(checkSpans, { when: spansParse });
export type MissingSubmissionDraft = z.output<typeof missingSubmissionDraftSchema>;

const descriptionSubset = z.object({
  child: z.object({ clothing: text(300), marks: text(300) }),
  event: z.object({ circumstances: text(500) }),
});

// Found: description required (circumstances/clothing/marks), age may be unknown.
export const foundSubmissionDraftSchema = z
  .strictObject({
    kind: z.literal("found"),
    source_text: sourceTextSchema,
    child: childSchema("found"),
    event: submissionEventSchema,
    reporter: submissionReporterSchema,
    evidence: evidenceSchema,
  })
  .superRefine(checkSpans, { when: spansParse })
  .superRefine(
    (d, ctx) => {
      const description = [d.event.circumstances, d.child.clothing, d.child.marks].filter(Boolean).join(" ").trim();
      if (description.length < 3) {
        ctx.addIssue({ code: "custom", message: "found report needs a description", path: ["event", "circumstances"] });
      }
    },
    { when: (p) => descriptionSubset.safeParse(p.value).success },
  );
export type FoundSubmissionDraft = z.output<typeof foundSubmissionDraftSchema>;

// Canonical reviewed-payload JSON for the submission hash: sorted keys, no device
// timestamps. The server hashes it with SHA-256 (D2A §5.6).
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

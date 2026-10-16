import { z } from "zod";
import { caseDraftSchema, caseKindSchema, DRAFT_FIELD_PATHS, evidenceSpanSchema, inputDateTimeSchema } from "@/contracts";

// D5 §6 ExtractOutput excludes the deterministic draft additions name_latin and district_code.
export const EXTRACT_FIELDS = DRAFT_FIELD_PATHS.filter((field) => field !== "child.name_latin" && field !== "event.district_code");
export type ExtractField = (typeof EXTRACT_FIELDS)[number];
const evidenceKey = z.string().refine((field) => (EXTRACT_FIELDS as readonly string[]).includes(field), "unknown extraction evidence field");

export const extractInputSchema = z.strictObject({
  kind: caseKindSchema,
  sourceText: caseDraftSchema.shape.source_text,
  normalisedText: caseDraftSchema.shape.source_text,
  nowIso: inputDateTimeSchema,
});
export type ExtractInput = z.output<typeof extractInputSchema>;

export const extractOutputSchema = z.strictObject({
  child: caseDraftSchema.shape.child.omit({ name_latin: true }),
  event: caseDraftSchema.shape.event.omit({ district_code: true }),
  reporter: caseDraftSchema.shape.reporter,
  evidence: z.record(evidenceKey, evidenceSpanSchema),
});
export type ExtractOutput = z.output<typeof extractOutputSchema>;

// Malformed evidence drops its field rather than invalidating otherwise usable output.
// An out-of-range number, fractional age, or string age/height is a per-field type_mismatch drop, not a malformed response.
export const outputStructureSchema = extractOutputSchema.extend({
  child: extractOutputSchema.shape.child.extend({
    height_cm: z.union([z.number(), z.string()]).nullable(),
    age_years: z.union([z.number(), z.string()]).nullable(),
    age_min: z.union([z.number(), z.string()]).nullable(),
    age_max: z.union([z.number(), z.string()]).nullable(),
  }),
  evidence: z.record(evidenceKey, z.unknown()),
});

export function emptyDraft(input: ExtractInput) {
  return caseDraftSchema.parse({
    kind: input.kind, source_text: input.sourceText,
    child: { name: null, name_latin: null, age_years: null, age_min: null, age_max: null, sex: "unknown", height_cm: null, clothing: null, marks: null },
    event: { at: null, at_lower: null, at_upper: null, at_approx: false, place_text: null, district_text: null, district_code: null, thana: null, circumstances: null },
    reporter: { relation: null, phone: null }, evidence: {},
  });
}

// API request/response schemas, API-001–API-023 (D2A §5.5, D5 §6).
// Requests strip unknown keys, so client-sent authority (owner, role, author,
// synthetic flag) never reaches a service. Responses are strict allowlists.
//
// Naming: `XRequest` / `XQuery` is the parsed (z.output) type a service receives;
// `XRequestInput` / `XQueryInput` is what a client sends (z.input).
import { z } from "zod";
import { ERROR_CATALOGUE, type ErrorId } from "./errors";
import { caseDraftSchema, foundSubmissionDraftSchema, missingSubmissionDraftSchema } from "./draft";
import {
  FIELD_MAX_CHARS as MAX,
  LIMITS,
  AUDIT_ACTION_PATTERN,
  MASKED_PHONE_PATTERN,
  PHONE_PATTERN,
  USERNAME_PATTERN,
  cursorSchema,
  displayNameSchema,
  districtCodeSchema,
  districtQuerySchema,
  draftTokenSchema,
  inputDateTimeSchema,
  isoDateTimeSchema,
  pageLimitSchema,
  reasonSchema,
  refCodeSchema,
  syntheticSourceUrlSchema,
  trimmedText,
  uuidSchema,
  versionSchema,
} from "./primitives";
import {
  COUNTING_BASIS,
  REF_PREFIX,
  actorTypeSchema,
  candidateStatusSchema,
  caseKindSchema,
  caseSourceSchema,
  caseStatusSchema,
  draftFieldPathSchema,
  duplicateRuleSchema,
  duplicateStatusSchema,
  foundStatusSchema,
  isFoundStatus,
  isMissingStatus,
  kindStatus,
  matchingStateSchema,
  missingStatusSchema,
  outcomeSchema,
  outputTypeSchema,
  sexSchema,
  statusGroup,
  statusGroupSchema,
  userRoleSchema,
  type CaseKind,
  type CaseStatus,
  type StatusGroup,
  type UserRole,
} from "./states";

const aiCallsUsed = z.int().min(0).max(LIMITS.aiCallsPerDraft);
const count = z.int().min(0);
const similarity = z.number().min(0).max(100); // similarity 0–100, never a probability
const bounded = (max: number) => z.string().max(max).nullable();

/* ---------- Shared view checks (cases CHECKs: kind↔status, M-/F- prefix) ---------- */

type Identity = { kind: CaseKind; status: CaseStatus; ref_code: string; status_group?: StatusGroup };

function checkIdentity(v: Identity, ctx: z.RefinementCtx) {
  if (!v.ref_code.startsWith(REF_PREFIX[v.kind])) {
    ctx.addIssue({ code: "custom", message: "ref_code prefix must match kind", path: ["ref_code"] });
  }
  const valid = v.kind === "missing" ? isMissingStatus(v.status) : isFoundStatus(v.status);
  if (!valid) {
    ctx.addIssue({ code: "custom", message: "status not allowed for this kind", path: ["status"] });
    return;
  }
  if (v.status_group !== undefined && v.status_group !== statusGroup(kindStatus(v.kind, v.status))) {
    ctx.addIssue({ code: "custom", message: "status_group does not match status", path: ["status_group"] });
  }
}

// Only officers carry a verified flag (users CHECK role = 'officer' OR verified = false).
function checkVerified(v: { role: UserRole; verified: boolean }, ctx: z.RefinementCtx) {
  if (v.role !== "officer" && v.verified) {
    ctx.addIssue({ code: "custom", message: "only officers can be verified", path: ["verified"] });
  }
}

/* ---------- Role-scoped case views (D2A §5.4, §9.2) ---------- */

const ownerCaseShape = {
  id: uuidSchema,
  ref_code: refCodeSchema,
  kind: z.literal("missing"),
  status: missingStatusSchema,
  status_group: statusGroupSchema,
  is_synthetic: z.literal(true),
  version: versionSchema,
  editable: z.boolean(),
  matching_state: matchingStateSchema,
  draft: caseDraftSchema.nullable(), // own report only; null after edit lock or redaction
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
};
export const ownerCaseViewSchema = z.strictObject(ownerCaseShape).superRefine(checkIdentity);
export type OwnerCaseView = z.infer<typeof ownerCaseViewSchema>;

const staffOwnCaseShape = {
  id: uuidSchema,
  ref_code: refCodeSchema,
  kind: z.literal("found"),
  status: foundStatusSchema,
  is_synthetic: z.literal(true),
  version: versionSchema,
  matching_state: matchingStateSchema,
  draft: caseDraftSchema.nullable(),
  created_at: isoDateTimeSchema,
};
export const staffOwnCaseViewSchema = z.strictObject(staffOwnCaseShape).superRefine(checkIdentity);
export type StaffOwnCaseView = z.infer<typeof staffOwnCaseViewSchema>;

const officerCaseShape = {
  id: uuidSchema,
  ref_code: refCodeSchema,
  kind: caseKindSchema,
  status: caseStatusSchema,
  status_group: statusGroupSchema,
  is_synthetic: z.literal(true), // synthetic-only release (BR-026, CN-08)
  source: caseSourceSchema,
  source_url: syntheticSourceUrlSchema.nullable(),
  child: z.strictObject({
    name: bounded(MAX.child_name),
    name_latin: bounded(MAX.child_name_latin),
    age_years: z.int().nullable(),
    age_min: z.int().nullable(),
    age_max: z.int().nullable(),
    sex: sexSchema,
    height_cm: z.int().nullable(),
    clothing: bounded(MAX.clothing),
    marks: bounded(MAX.marks),
  }),
  event: z.strictObject({
    at: isoDateTimeSchema.nullable(),
    at_approx: z.boolean(),
    at_lower: isoDateTimeSchema.nullable(),
    at_upper: isoDateTimeSchema.nullable(),
    place_text: bounded(MAX.place_text),
    district_code: districtCodeSchema.nullable(),
    district_name_bn: z.string().max(80).nullable(),
    thana: bounded(MAX.thana),
    circumstances: bounded(MAX.circumstances), // part of the found description (BR-015, CN-05)
  }),
  reporter_relation: bounded(MAX.reporter_relation),
  contact_phone: z.string().regex(PHONE_PATTERN).nullable(), // single-case and candidate detail only
  contact_phone_masked: z.string().regex(MASKED_PHONE_PATTERN).nullable(),
  version: versionSchema,
  duplicate_of: z.array(refCodeSchema), // review cues; never hides a distinct report
  matching_state: matchingStateSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
};

// Single-case (API-004) and candidate (API-009) detail for a verified active officer.
// Serving contact_phone is audited (route obligation, D2A §5.4).
export const officerCaseViewSchema = z.strictObject(officerCaseShape).superRefine(checkIdentity);
export type OfficerCaseView = z.infer<typeof officerCaseViewSchema>;

// List and queue rows (API-008, API-022): masked phone only.
export const officerCaseRowSchema = z
  .strictObject({ ...officerCaseShape, contact_phone: z.null() })
  .superRefine(checkIdentity);
export type OfficerCaseRow = z.infer<typeof officerCaseRowSchema>;

// No child payload, contact, candidate IDs/scores or free-text notes.
export const adminCaseViewSchema = z
  .strictObject({
    id: uuidSchema,
    ref_code: refCodeSchema,
    kind: caseKindSchema,
    status: caseStatusSchema,
    district_code: districtCodeSchema.nullable(),
    is_synthetic: z.literal(true),
    anonymised_at: isoDateTimeSchema.nullable(),
  })
  .superRefine(checkIdentity);
export type AdminCaseView = z.infer<typeof adminCaseViewSchema>;

/* ---------- API-001 transcribe (multipart fields; audio checked separately) ---------- */

export const transcribeFieldsSchema = z.object({
  kind: caseKindSchema,
  draft_token: draftTokenSchema.optional(),
  duration_s: z
    .string()
    .regex(/^[0-9]{1,3}(\.[0-9]{1,3})?$/, "expected seconds")
    .transform(Number)
    .pipe(z.number().min(LIMITS.audioSeconds.min).max(LIMITS.audioSeconds.max)),
  // Rejected unless protected DEMO_MODE; result must be cached-labelled (route obligation).
  fixture_id: z.string().regex(/^[a-z0-9_-]{1,64}$/).optional(),
});
export type TranscribeFields = z.output<typeof transcribeFieldsSchema>;
export type TranscribeFieldsInput = z.input<typeof transcribeFieldsSchema>;

export const transcribeResponseSchema = z.strictObject({
  draft_token: draftTokenSchema,
  draft_id: uuidSchema,
  ai_calls_used: aiCallsUsed,
  transcript: z.string().max(MAX.raw_text),
  language: z.enum(["bn", "mixed"]),
  duration_s: z.number().min(LIMITS.audioSeconds.min).max(LIMITS.audioSeconds.max),
  cached: z.boolean(),
});
export type TranscribeResponse = z.infer<typeof transcribeResponseSchema>;

/* ---------- API-002 extract ---------- */

// New intake sends text (optionally with the transcribe token). A follow-up sends
// answer + the device-held draft + token + revision. Nothing else combines.
export const extractRequestSchema = z
  .object({
    kind: caseKindSchema,
    text: trimmedText(LIMITS.textChars.min, LIMITS.textChars.max).optional(),
    answer: trimmedText(1, LIMITS.textChars.max).optional(),
    draft: caseDraftSchema.optional(),
    draft_token: draftTokenSchema.optional(),
    draft_revision: versionSchema.optional(),
  })
  .superRefine((r, ctx) => {
    if ((r.text === undefined) === (r.answer === undefined)) {
      ctx.addIssue({ code: "custom", message: "send exactly one of text or answer", path: ["text"] });
    }
    if (r.text !== undefined) {
      for (const key of ["draft", "draft_revision"] as const) {
        if (r[key] !== undefined) ctx.addIssue({ code: "custom", message: "not allowed with text", path: [key] });
      }
    }
    if (r.answer !== undefined) {
      for (const key of ["draft", "draft_token", "draft_revision"] as const) {
        if (r[key] === undefined) ctx.addIssue({ code: "custom", message: "required when continuing", path: [key] });
      }
    }
    if (r.draft_revision !== undefined && r.draft_token === undefined) {
      ctx.addIssue({ code: "custom", message: "draft_revision needs draft_token", path: ["draft_token"] });
    }
    if (r.draft !== undefined && r.draft.kind !== r.kind) {
      ctx.addIssue({ code: "custom", message: "draft kind must match request kind", path: ["draft", "kind"] });
    }
  });
export type ExtractRequest = z.output<typeof extractRequestSchema>;
export type ExtractRequestInput = z.input<typeof extractRequestSchema>;

export const nextQuestionSchema = z.strictObject({
  field: draftFieldPathSchema,
  bn: z.string().min(1).max(300),
  en: z.string().min(1).max(300),
});
export type NextQuestion = z.infer<typeof nextQuestionSchema>;

export const extractResponseSchema = z.strictObject({
  draft_token: draftTokenSchema,
  draft_id: uuidSchema,
  draft_revision: versionSchema,
  expires_at: isoDateTimeSchema,
  draft: caseDraftSchema,
  missing_fields: z.array(draftFieldPathSchema),
  next_question: nextQuestionSchema.nullable(),
  ai_calls_used: aiCallsUsed,
  cached: z.boolean(),
});
export type ExtractResponse = z.infer<typeof extractResponseSchema>;

/* ---------- API-003 / API-007 create (BR-004: confirmed: true required) ---------- */

export const createMissingRequestSchema = z.object({
  draft: missingSubmissionDraftSchema,
  confirmed: z.literal(true),
  client_submission_id: uuidSchema,
  draft_token: draftTokenSchema.optional(), // absent for the manual form
});
export type CreateMissingRequest = z.output<typeof createMissingRequestSchema>;
export type CreateMissingRequestInput = z.input<typeof createMissingRequestSchema>;

export const createMissingResponseSchema = z
  .strictObject({
    ...ownerCaseShape,
    replayed: z.boolean(), // 201 new → false; 200 identical replay → true
    outputs_available: z.array(outputTypeSchema),
  })
  .superRefine(checkIdentity);
export type CreateMissingResponse = z.infer<typeof createMissingResponseSchema>;

export const createFoundRequestSchema = z.object({
  draft: foundSubmissionDraftSchema,
  confirmed: z.literal(true),
  client_submission_id: uuidSchema,
  draft_token: draftTokenSchema.optional(),
});
export type CreateFoundRequest = z.output<typeof createFoundRequestSchema>;
export type CreateFoundRequestInput = z.input<typeof createFoundRequestSchema>;

export const createFoundResponseSchema = z
  .strictObject({ ...staffOwnCaseShape, replayed: z.boolean() })
  .superRefine(checkIdentity);
export type CreateFoundResponse = z.infer<typeof createFoundResponseSchema>;

/* ---------- API-005 owner edit ---------- */

export const updateCaseRequestSchema = z.object({
  draft: missingSubmissionDraftSchema,
  confirmed: z.literal(true),
  expected_version: versionSchema,
});
export type UpdateCaseRequest = z.output<typeof updateCaseRequestSchema>;
export type UpdateCaseRequestInput = z.input<typeof updateCaseRequestSchema>;

/* ---------- API-006 outputs ---------- */

export const outputRequestSchema = z.object({ type: outputTypeSchema });
export type OutputRequest = z.output<typeof outputRequestSchema>;
export type OutputRequestInput = z.input<typeof outputRequestSchema>;

// Every generated output is a draft and carries the visible draft label (API-006, D4 honest labels).
export const OUTPUT_DRAFT_LABEL_BN = "খসড়া" as const;

export function countWords(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

export const outputResponseSchema = z
  .strictObject({
    type: outputTypeSchema,
    text_bn: z
      .string()
      .min(1)
      .max(MAX.text_bn)
      .refine((t) => t.includes(OUTPUT_DRAFT_LABEL_BN), "output text must carry the draft label"),
    label_bn: z.literal(OUTPUT_DRAFT_LABEL_BN),
    word_count: count,
    generated_at: isoDateTimeSchema,
  })
  .superRefine((o, ctx) => {
    const words = countWords(o.text_bn); // counted from the text, never trusted from word_count
    if (o.word_count !== words) ctx.addIssue({ code: "custom", message: "word_count must equal the text", path: ["word_count"] });
    if (o.type === "helpline" && words > LIMITS.helplineWords) {
      ctx.addIssue({ code: "custom", message: "helpline summary is at most 80 words", path: ["text_bn"] });
    }
  });
export type OutputResponse = z.infer<typeof outputResponseSchema>;

/* ---------- API-008 queue, API-009 candidate (verified officer only) ---------- */

export const reviewQueueQuerySchema = z.object({
  district: districtQuerySchema.optional(),
  limit: pageLimitSchema.optional(),
  cursor: cursorSchema.optional(),
});
export type ReviewQueueQuery = z.output<typeof reviewQueueQuerySchema>;
export type ReviewQueueQueryInput = z.input<typeof reviewQueueQuerySchema>;

const componentsSchema = z.record(z.string().regex(/^[a-z_]{1,40}$/), z.number().nullable()); // null = unknown cue

export const queueCandidateSchema = z.strictObject({
  candidate_id: uuidSchema,
  rank: z.int().min(1).max(LIMITS.candidatesPerQueueItem),
  score: similarity,
  reason_bn: z.string().max(MAX.reason_bn),
  reason_en: z.string().max(MAX.reason_en),
  components: componentsSchema,
  counterpart: officerCaseRowSchema,
  qualified: z.literal(true), // API-008 returns qualified candidates only
  identity_probability: z.literal(false),
});
export type QueueCandidate = z.infer<typeof queueCandidateSchema>;

export const reviewQueueResponseSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      case: officerCaseRowSchema,
      candidates: z.array(queueCandidateSchema).max(LIMITS.candidatesPerQueueItem),
    }),
  ),
  next_cursor: cursorSchema.nullable(),
});
export type ReviewQueueResponse = z.infer<typeof reviewQueueResponseSchema>;

export const candidateDecisionViewSchema = z
  .strictObject({
    candidate_id: uuidSchema,
    missing: officerCaseViewSchema,
    found: officerCaseViewSchema,
    score: similarity,
    components: componentsSchema,
    explanation_version: z.string().min(1).max(40),
    qualified: z.boolean(), // may be opened after it stops qualifying (CN-09)
    identity_probability: z.literal(false),
  })
  .refine((v) => v.missing.kind === "missing" && v.found.kind === "found", {
    message: "candidate endpoints must be one missing and one found report",
  });
export type CandidateDecisionView = z.infer<typeof candidateDecisionViewSchema>;

/* ---------- API-010 decision (BR-001/005/020) ---------- */

const expectedVersions = { expected_missing_version: versionSchema, expected_found_version: versionSchema };

export const decisionRequestSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("reject"), reason: reasonSchema, ...expectedVersions }),
  z.object({
    decision: z.literal("confirm"),
    reason: z.string().max(MAX.reason * 2).trim().max(MAX.reason).optional(),
    agency_name: trimmedText(1, MAX.agency_name).optional(),
    ...expectedVersions,
    reviewer_checklist: z.object({
      descriptions_reviewed: z.literal(true),
      contradictions_reviewed: z.literal(true),
      identity_not_proven_by_score: z.literal(true),
      referral_is_simulated: z.literal(true),
    }),
  }),
]);
export type DecisionRequest = z.output<typeof decisionRequestSchema>;
export type DecisionRequestInput = z.input<typeof decisionRequestSchema>;

// "Referral recorded (simulation)": an internal record, no receipt or custody claim.
// Explicit endpoint state and version per D2A §5.4 (CN-11).
export const decisionResponseSchema = z
  .strictObject({
    candidate_status: candidateStatusSchema,
    missing: z.strictObject({ ref_code: refCodeSchema.startsWith("M-"), status: missingStatusSchema, version: versionSchema }),
    found: z.strictObject({ ref_code: refCodeSchema.startsWith("F-"), status: foundStatusSchema, version: versionSchema }),
    referral_id: uuidSchema.nullable(),
    referral_state: z.literal("recorded").nullable(),
    referral_is_simulated: z.literal(true),
  })
  .superRefine((r, ctx) => {
    const confirmed = r.candidate_status === "confirmed";
    if (confirmed !== (r.referral_id !== null) || confirmed !== (r.referral_state === "recorded")) {
      ctx.addIssue({ code: "custom", message: "a referral record exists exactly when the pair is confirmed", path: ["referral_state"] });
    }
    if (confirmed && (r.missing.status !== "confirmed" || r.found.status !== "referred")) {
      ctx.addIssue({ code: "custom", message: "confirmation sets missing confirmed and found referred", path: ["found", "status"] });
    }
    if (!confirmed && (r.missing.status === "confirmed" || r.found.status === "referred")) {
      ctx.addIssue({ code: "custom", message: "only a confirmation sets the confirmed/referred states", path: ["missing", "status"] });
    }
  });
export type DecisionResponse = z.infer<typeof decisionResponseSchema>;

/* ---------- API-011 close ---------- */

export const closeCaseRequestSchema = z.object({
  outcome: outcomeSchema, // must equal allowedCloseOutcome(current status); the service checks
  note: reasonSchema,
  expected_version: versionSchema,
});
export type CloseCaseRequest = z.output<typeof closeCaseRequestSchema>;
export type CloseCaseRequestInput = z.input<typeof closeCaseRequestSchema>;

export const closeCaseResponseSchema = z.strictObject({
  ref_code: refCodeSchema.startsWith("M-"),
  status: z.literal("closed"),
  closed_at: isoDateTimeSchema, // coordination timestamp, not a return or rescue time
});
export type CloseCaseResponse = z.infer<typeof closeCaseResponseSchema>;

/* ---------- API-012 dashboard (BR-014, FV-10) ---------- */

const missingCounts = z.strictObject({ open: count, matched: count, closed: count });
const foundCounts = z.strictObject({ open: count, matched: count, referral_recorded: count });

export const districtStatsSchema = z.strictObject({
  code: districtCodeSchema,
  name_bn: z.string().min(1).max(80),
  name_en: z.string().min(1).max(80),
  lat: z.number().min(20).max(27), // districts CHECK
  lng: z.number().min(88).max(93),
  missing_reports: missingCounts,
  found_reports: foundCounts,
  confirmed_pairs: count,
});
export type DistrictStats = z.infer<typeof districtStatsSchema>;

export const dashboardStatsResponseSchema = z
  .strictObject({
    generated_at: isoDateTimeSchema,
    counting_basis: z.literal(COUNTING_BASIS),
    totals: z.strictObject({ missing_reports: missingCounts, found_reports: foundCounts, confirmed_pairs: count }),
    districts: z.array(districtStatsSchema).length(64),
  })
  .superRefine((s, ctx) => {
    if (new Set(s.districts.map((d) => d.code)).size !== s.districts.length) {
      ctx.addIssue({ code: "custom", message: "all 64 districts appear once, including zeros", path: ["districts"] });
    }
    const sum = (pick: (d: (typeof s.districts)[number]) => number) => s.districts.reduce((n, d) => n + pick(d), 0);
    const checks: [string[], number, number][] = [
      [["missing_reports", "open"], s.totals.missing_reports.open, sum((d) => d.missing_reports.open)],
      [["missing_reports", "matched"], s.totals.missing_reports.matched, sum((d) => d.missing_reports.matched)],
      [["missing_reports", "closed"], s.totals.missing_reports.closed, sum((d) => d.missing_reports.closed)],
      [["found_reports", "open"], s.totals.found_reports.open, sum((d) => d.found_reports.open)],
      [["found_reports", "matched"], s.totals.found_reports.matched, sum((d) => d.found_reports.matched)],
      [["found_reports", "referral_recorded"], s.totals.found_reports.referral_recorded, sum((d) => d.found_reports.referral_recorded)],
      [["confirmed_pairs"], s.totals.confirmed_pairs, sum((d) => d.confirmed_pairs)],
    ];
    for (const [path, total, districts] of checks) {
      if (total !== districts) ctx.addIssue({ code: "custom", message: "total must equal district sum", path: ["totals", ...path] });
    }
    // Every confirmed pair has exactly one referral-recorded found report (BR-013/020).
    if (s.totals.confirmed_pairs !== s.totals.found_reports.referral_recorded) {
      ctx.addIssue({ code: "custom", message: "confirmed pairs must equal referral-recorded found reports", path: ["totals", "confirmed_pairs"] });
    }
  });
export type DashboardStatsResponse = z.infer<typeof dashboardStatsResponseSchema>;

/* ---------- API-013 safe audit (D2A §9.2: officer operational, admin metadata only) ---------- */

// Every details key has a typed schema; there is no free-text string anywhere, so
// names, notes, reasons, phones, provider payloads and URLs cannot be represented.
// Keys derive from the STORY-017/BR-010 events: create, edit, state change,
// match.confirm/reject, close, payload redaction, duplicate decision, officer
// verification, import, output, contact access and access.denied.
const adminAuditDetailsShape = {
  ref_code: refCodeSchema.optional(), // the audited case's own reference only (projection checks)
  version: versionSchema.optional(),
  from_status: caseStatusSchema.optional(),
  to_status: caseStatusSchema.optional(),
  outcome: outcomeSchema.optional(),
  output_type: outputTypeSchema.optional(),
  error_id: z.enum(Object.keys(ERROR_CATALOGUE) as [ErrorId, ...ErrorId[]]).optional(),
  api: z.string().regex(/^API-0(0[1-9]|1[0-9]|2[0-3])$/).optional(),
  mode: z.literal("pseudonymisation").optional(),
  external_copies_removed: z.literal(false).optional(),
  referral_simulated: z.literal(true).optional(),
  reason_recorded: z.boolean().optional(), // the reason text itself is never in the audit view
  replayed: z.boolean().optional(),
  verified: z.boolean().optional(),
  target_role: userRoleSchema.optional(),
  fields_changed: z.array(draftFieldPathSchema).max(draftFieldPathSchema.options.length).optional(),
  imported: count.optional(),
  skipped: count.optional(),
  duplicates_flagged: count.optional(),
  redacted: count.optional(),
};

// Officer-only additions: pair references, candidate link, similarity and decision detail.
const officerAuditDetailsShape = {
  ...adminAuditDetailsShape,
  candidate_id: uuidSchema.optional(),
  missing_ref: refCodeSchema.startsWith("M-").optional(),
  found_ref: refCodeSchema.startsWith("F-").optional(),
  missing_version: versionSchema.optional(),
  found_version: versionSchema.optional(),
  candidate_status: candidateStatusSchema.optional(),
  decision: z.enum(["confirm", "reject"]).optional(),
  score: similarity.optional(),
  rank: z.int().min(1).max(LIMITS.candidatesPerQueueItem).optional(),
  duplicate_status: duplicateStatusSchema.optional(),
  duplicate_rule: duplicateRuleSchema.optional(),
  contact_viewed: z.boolean().optional(),
};

export const ADMIN_AUDIT_DETAIL_KEYS = Object.keys(adminAuditDetailsShape) as (keyof typeof adminAuditDetailsShape)[];
export const OFFICER_AUDIT_DETAIL_KEYS = Object.keys(officerAuditDetailsShape) as (keyof typeof officerAuditDetailsShape)[];

const auditActionSchema = z.string().regex(AUDIT_ACTION_PATTERN); // audit_log.action CHECK

export const officerAuditEntryViewSchema = z.strictObject({
  at: isoDateTimeSchema,
  actor_role: actorTypeSchema,
  actor_id: uuidSchema.nullable(), // internal user ID; null for parent sessions and system
  actor_display: displayNameSchema.nullable(), // staff/officer/admin display name only, never a parent
  action: auditActionSchema,
  details: z.strictObject(officerAuditDetailsShape),
});
export type OfficerAuditEntryView = z.infer<typeof officerAuditEntryViewSchema>;

// Metadata only: no actor identity, candidate IDs, scores, pair references or decision detail.
export const adminAuditEntryViewSchema = z.strictObject({
  at: isoDateTimeSchema,
  actor_role: actorTypeSchema,
  action: auditActionSchema,
  details: z.strictObject(adminAuditDetailsShape),
});
export type AdminAuditEntryView = z.infer<typeof adminAuditEntryViewSchema>;

// `withheld` counts stored rows that failed the allowlist and were left out.
export const officerAuditResponseSchema = z.strictObject({
  view: z.literal("officer"),
  entries: z.array(officerAuditEntryViewSchema),
  withheld: count,
});
export const adminAuditResponseSchema = z.strictObject({
  view: z.literal("admin"),
  entries: z.array(adminAuditEntryViewSchema),
  withheld: count,
});
export const auditResponseSchema = z.discriminatedUnion("view", [officerAuditResponseSchema, adminAuditResponseSchema]);
export type OfficerAuditResponse = z.infer<typeof officerAuditResponseSchema>;
export type AdminAuditResponse = z.infer<typeof adminAuditResponseSchema>;
export type AuditResponse = z.infer<typeof auditResponseSchema>;

/* ---------- API-014 rematch: status only for every role (TC-044) ---------- */

export const rematchResponseSchema = z.strictObject({ case_id: uuidSchema, matching_state: matchingStateSchema });
export type RematchResponse = z.infer<typeof rematchResponseSchema>;

/* ---------- API-015 synthetic import ---------- */

export const importRequestSchema = z.object({
  kind: caseKindSchema,
  fixture_intake_at: inputDateTimeSchema,
  items: z
    .array(
      z.object({
        text: trimmedText(LIMITS.textChars.min, LIMITS.textChars.max),
        source_url: syntheticSourceUrlSchema,
        synthetic: z.literal(true),
      }),
    )
    .min(LIMITS.importBatch.min)
    .max(LIMITS.importBatch.max),
});
export type ImportRequest = z.output<typeof importRequestSchema>;
export type ImportRequestInput = z.input<typeof importRequestSchema>;

export const importResponseSchema = z.strictObject({ imported: count, skipped: count, duplicates_flagged: count });
export type ImportResponse = z.infer<typeof importResponseSchema>;

/* ---------- API-016 payload redaction (legacy route name "anonymise") ---------- */

export const anonymiseRequestSchema = z
  .object({
    case_ids: z.array(uuidSchema).min(1).max(LIMITS.pageSize.max).optional(),
    all_eligible: z.literal(true).optional(),
    confirmation: z.literal("বেনামী"), // D3 SCREEN-013 typed confirmation
  })
  .refine((r) => (r.case_ids === undefined) !== (r.all_eligible === undefined), {
    message: "send exactly one of case_ids or all_eligible",
    path: ["case_ids"],
  });
export type AnonymiseRequest = z.output<typeof anonymiseRequestSchema>;
export type AnonymiseRequestInput = z.input<typeof anonymiseRequestSchema>;

export const anonymiseResponseSchema = z.strictObject({
  redacted: count,
  skipped_not_eligible: count,
  mode: z.literal("pseudonymisation"),
  external_copies_removed: z.literal(false),
});
export type AnonymiseResponse = z.infer<typeof anonymiseResponseSchema>;

/* ---------- API-017 verify officer [MOCK] ---------- */

export const verifyUserRequestSchema = z.object({ verified: z.boolean() });
export type VerifyUserRequest = z.output<typeof verifyUserRequestSchema>;
export type VerifyUserRequestInput = z.input<typeof verifyUserRequestSchema>;
export const verifyUserResponseSchema = z.strictObject({ id: uuidSchema, role: z.literal("officer"), verified: z.boolean() });
export type VerifyUserResponse = z.infer<typeof verifyUserResponseSchema>;

/* ---------- API-018 my reports ---------- */

export const myCaseResponseSchema = z.strictObject({
  reports: z.array(
    z
      .strictObject({
        id: uuidSchema,
        ref_code: refCodeSchema,
        kind: z.literal("missing"),
        status: missingStatusSchema,
        status_group: statusGroupSchema,
        updated_at: isoDateTimeSchema,
        editable: z.boolean(),
      })
      .superRefine(checkIdentity),
  ),
});
export type MyCaseResponse = z.infer<typeof myCaseResponseSchema>;

/* ---------- API-019 health ---------- */

export const healthResponseSchema = z.strictObject({
  version: z.string().min(1).max(40),
  db: z.enum(["ready", "unavailable"]),
  embeddings: z.enum(["ready", "unavailable"]),
  synthetic_only: z.literal(true),
  demo_mode: z.boolean(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/* ---------- API-020 credentials sign-in ---------- */

// Any parse failure maps to the generic E-002, never E-001 (parseSignInRequest, server barrel).
export const signInRequestSchema = z.object({
  username: z.string().max(64).trim().toLowerCase().regex(USERNAME_PATTERN),
  password: z.string().min(1).max(200),
});
export type SignInRequest = z.output<typeof signInRequestSchema>;
export type SignInRequestInput = z.input<typeof signInRequestSchema>;

// Server-derived session summary; the client never supplies role or verification.
export const sessionViewSchema = z
  .strictObject({
    user_id: uuidSchema,
    display_name: displayNameSchema,
    role: userRoleSchema,
    verified: z.boolean(),
    expires_at: isoDateTimeSchema,
  })
  .superRefine(checkVerified);
export type SessionView = z.infer<typeof sessionViewSchema>;

/* ---------- API-021 admin users, API-022 case list, API-023 duplicates ---------- */

export const pageQuerySchema = z.object({ limit: pageLimitSchema.optional(), cursor: cursorSchema.optional() });
export type PageQuery = z.output<typeof pageQuerySchema>;
export type PageQueryInput = z.input<typeof pageQuerySchema>;

export const adminUserViewSchema = z
  .strictObject({
    id: uuidSchema,
    username: z.string().regex(USERNAME_PATTERN),
    display_name: displayNameSchema,
    role: userRoleSchema,
    verified: z.boolean(),
    is_active: z.boolean(),
  })
  .superRefine(checkVerified);

export const adminUsersResponseSchema = z.strictObject({
  users: z.array(adminUserViewSchema),
  next_cursor: cursorSchema.nullable(),
});
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;

export const caseListQuerySchema = z.object({
  limit: pageLimitSchema.optional(),
  cursor: cursorSchema.optional(),
  district: districtQuerySchema.optional(),
  kind: caseKindSchema.optional(),
  status_group: statusGroupSchema.optional(),
});
export type CaseListQuery = z.output<typeof caseListQuerySchema>;
export type CaseListQueryInput = z.input<typeof caseListQuerySchema>;

export const caseListResponseSchema = z.strictObject({ cases: z.array(officerCaseRowSchema), next_cursor: cursorSchema.nullable() });
export type CaseListResponse = z.infer<typeof caseListResponseSchema>;

export const duplicateDecisionRequestSchema = z.object({
  status: z.enum(["confirmed_same", "dismissed"]),
  reason: reasonSchema,
  profile_evidence_reviewed: z.literal(true),
});
export type DuplicateDecisionRequest = z.output<typeof duplicateDecisionRequestSchema>;
export type DuplicateDecisionRequestInput = z.input<typeof duplicateDecisionRequestSchema>;

export const duplicateDecisionResponseSchema = z.strictObject({
  link_id: uuidSchema,
  status: duplicateStatusSchema.exclude(["flagged"]),
  audit_id: z.int().min(1),
});
export type DuplicateDecisionResponse = z.infer<typeof duplicateDecisionResponseSchema>;

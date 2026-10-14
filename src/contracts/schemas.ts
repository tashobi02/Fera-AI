// API request/response schemas, API-001–API-023 (D2A §5.5, D5 §6).
// Requests strip unknown keys, so client-sent authority (owner, role, author,
// synthetic flag) never reaches a service. Responses are strict allowlists.
import { z } from "zod";
import { caseDraftSchema, foundSubmissionDraftSchema, missingSubmissionDraftSchema } from "./draft";
import {
  LIMITS,
  cursorSchema,
  districtCodeSchema,
  draftTokenSchema,
  isoDateTimeSchema,
  pageLimitSchema,
  reasonSchema,
  refCodeSchema,
  sha256HexSchema,
  uuidSchema,
  versionSchema,
} from "./primitives";
import {
  COUNTING_BASIS,
  actorTypeSchema,
  candidateStatusSchema,
  caseKindSchema,
  caseSourceSchema,
  caseStatusSchema,
  duplicateStatusSchema,
  foundStatusSchema,
  matchingStateSchema,
  missingStatusSchema,
  outcomeSchema,
  outputTypeSchema,
  sexSchema,
  statusGroupSchema,
  userRoleSchema,
} from "./states";

const aiCallsUsed = z.int().min(0).max(LIMITS.aiCallsPerDraft);
const count = z.int().min(0);
const similarity = z.number().min(0).max(100); // similarity 0–100, never a probability

/* ---------- Role-scoped case views (D2A §5.4, §9.2) ---------- */

export const ownerCaseViewSchema = z.strictObject({
  id: uuidSchema,
  ref_code: refCodeSchema.startsWith("M-"),
  kind: z.literal("missing"),
  status: missingStatusSchema,
  status_group: statusGroupSchema,
  is_synthetic: z.literal(true),
  version: versionSchema,
  editable: z.boolean(),
  matching_state: matchingStateSchema,
  draft: caseDraftSchema.nullable(), // own report only; null after terminal lock/redaction
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});
export type OwnerCaseView = z.infer<typeof ownerCaseViewSchema>;

export const staffOwnCaseViewSchema = z.strictObject({
  id: uuidSchema,
  ref_code: refCodeSchema.startsWith("F-"),
  kind: z.literal("found"),
  status: foundStatusSchema,
  is_synthetic: z.literal(true),
  version: versionSchema,
  matching_state: matchingStateSchema,
  draft: caseDraftSchema.nullable(),
  created_at: isoDateTimeSchema,
});
export type StaffOwnCaseView = z.infer<typeof staffOwnCaseViewSchema>;

// Verified active officer only. contact_phone is never logged.
export const officerCaseViewSchema = z.strictObject({
  id: uuidSchema,
  ref_code: refCodeSchema,
  kind: caseKindSchema,
  status: caseStatusSchema,
  status_group: statusGroupSchema,
  is_synthetic: z.boolean(),
  source: caseSourceSchema,
  source_url: z.string().nullable(),
  child: z.strictObject({
    name: z.string().nullable(),
    age_years: z.int().nullable(),
    age_min: z.int().nullable(),
    age_max: z.int().nullable(),
    sex: sexSchema,
    height_cm: z.int().nullable(),
    clothing: z.string().nullable(),
    marks: z.string().nullable(),
  }),
  event: z.strictObject({
    at: isoDateTimeSchema.nullable(),
    at_approx: z.boolean(),
    at_lower: isoDateTimeSchema.nullable(),
    at_upper: isoDateTimeSchema.nullable(),
    place_text: z.string().nullable(),
    district_code: districtCodeSchema.nullable(),
    district_name_bn: z.string().nullable(),
    thana: z.string().nullable(),
  }),
  contact_phone: z.string().nullable(),
  contact_phone_masked: z.string().nullable(),
  version: versionSchema,
  duplicate_of: z.array(refCodeSchema), // review cues; never hides a distinct report
  matching_state: matchingStateSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});
export type OfficerCaseView = z.infer<typeof officerCaseViewSchema>;

// No child payload, contact, candidate IDs/scores or free-text notes.
export const adminCaseViewSchema = z.strictObject({
  id: uuidSchema,
  ref_code: refCodeSchema,
  kind: caseKindSchema,
  status: caseStatusSchema,
  district_code: districtCodeSchema.nullable(),
  is_synthetic: z.literal(true),
  anonymised_at: isoDateTimeSchema.nullable(),
});
export type AdminCaseView = z.infer<typeof adminCaseViewSchema>;

/* ---------- API-001 transcribe (multipart fields; audio checked separately) ---------- */

export const transcribeFieldsSchema = z.object({
  kind: caseKindSchema,
  draft_token: draftTokenSchema.optional(),
  duration_s: z.coerce.number().min(LIMITS.audioSeconds.min).max(LIMITS.audioSeconds.max),
  fixture_id: z.string().min(1).max(64).optional(), // protected DEMO_MODE only
});
export type TranscribeFields = z.infer<typeof transcribeFieldsSchema>;

export const transcribeResponseSchema = z.strictObject({
  draft_token: draftTokenSchema,
  draft_id: uuidSchema,
  ai_calls_used: aiCallsUsed,
  transcript: z.string().max(4000),
  language: z.enum(["bn", "mixed"]),
  duration_s: z.number().min(LIMITS.audioSeconds.min).max(LIMITS.audioSeconds.max),
  cached: z.boolean(),
});
export type TranscribeResponse = z.infer<typeof transcribeResponseSchema>;

/* ---------- API-002 extract ---------- */

// Exactly one of text (new intake) or answer (follow-up, continuing a device-held draft).
export const extractRequestSchema = z
  .object({
    kind: caseKindSchema,
    text: z.string().trim().min(LIMITS.textChars.min).max(LIMITS.textChars.max).optional(),
    answer: z.string().trim().min(1).max(LIMITS.textChars.max).optional(),
    draft: caseDraftSchema.optional(),
    draft_token: draftTokenSchema.optional(),
    draft_revision: versionSchema.optional(),
  })
  .superRefine((r, ctx) => {
    if ((r.text === undefined) === (r.answer === undefined)) {
      ctx.addIssue({ code: "custom", message: "send exactly one of text or answer", path: ["text"] });
    }
    if (r.answer !== undefined) {
      for (const key of ["draft", "draft_token", "draft_revision"] as const) {
        if (r[key] === undefined) ctx.addIssue({ code: "custom", message: "required when continuing", path: [key] });
      }
    }
  });
export type ExtractRequest = z.infer<typeof extractRequestSchema>;

export const nextQuestionSchema = z.strictObject({ field: z.string().min(1), bn: z.string().min(1), en: z.string().min(1) });

export const extractResponseSchema = z.strictObject({
  draft_token: draftTokenSchema,
  draft_id: uuidSchema,
  draft_revision: versionSchema,
  expires_at: isoDateTimeSchema,
  draft: caseDraftSchema,
  missing_fields: z.array(z.string().min(1)),
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
export type CreateMissingRequest = z.input<typeof createMissingRequestSchema>;

export const createMissingResponseSchema = ownerCaseViewSchema.extend({
  replayed: z.boolean(), // 201 new → false; 200 identical replay → true
  outputs_available: z.array(outputTypeSchema),
});
export type CreateMissingResponse = z.infer<typeof createMissingResponseSchema>;

export const createFoundRequestSchema = z.object({
  draft: foundSubmissionDraftSchema,
  confirmed: z.literal(true),
  client_submission_id: uuidSchema,
  draft_token: draftTokenSchema.optional(),
});
export type CreateFoundRequest = z.input<typeof createFoundRequestSchema>;

export const createFoundResponseSchema = staffOwnCaseViewSchema.extend({ replayed: z.boolean() });
export type CreateFoundResponse = z.infer<typeof createFoundResponseSchema>;

/* ---------- API-005 owner edit ---------- */

export const updateCaseRequestSchema = z.object({
  draft: missingSubmissionDraftSchema,
  confirmed: z.literal(true),
  expected_version: versionSchema,
});
export type UpdateCaseRequest = z.input<typeof updateCaseRequestSchema>;

/* ---------- API-006 outputs ---------- */

export const outputRequestSchema = z.object({ type: outputTypeSchema });
export type OutputRequest = z.infer<typeof outputRequestSchema>;

export const outputResponseSchema = z
  .strictObject({
    type: outputTypeSchema,
    text_bn: z.string().min(1).max(3000),
    label_bn: z.string().min(1),
    word_count: count,
    generated_at: isoDateTimeSchema,
  })
  .refine((o) => o.type !== "helpline" || o.word_count <= LIMITS.helplineWords, {
    message: "helpline summary is at most 80 words",
    path: ["word_count"],
  });
export type OutputResponse = z.infer<typeof outputResponseSchema>;

/* ---------- API-008 queue, API-009 candidate (verified officer only) ---------- */

export const reviewQueueQuerySchema = z.object({
  district: z.coerce.number().pipe(districtCodeSchema).optional(),
  limit: pageLimitSchema.optional(),
  cursor: cursorSchema.optional(),
});
export type ReviewQueueQuery = z.infer<typeof reviewQueueQuerySchema>;

const componentsSchema = z.record(z.string(), z.number().nullable()); // null = unknown cue

export const queueCandidateSchema = z.strictObject({
  candidate_id: uuidSchema,
  rank: z.int().min(1).max(5),
  score: similarity,
  reason_bn: z.string().max(200),
  reason_en: z.string().max(200),
  components: componentsSchema,
  counterpart: officerCaseViewSchema,
  qualified: z.boolean(),
  identity_probability: z.literal(false),
});

export const reviewQueueResponseSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      case: officerCaseViewSchema,
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
    explanation_version: z.string().min(1),
    qualified: z.boolean(),
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
    reason: z.string().trim().max(LIMITS.reasonChars.max).optional(),
    agency_name: z.string().trim().min(1).max(120).optional(),
    ...expectedVersions,
    reviewer_checklist: z.object({
      descriptions_reviewed: z.literal(true),
      contradictions_reviewed: z.literal(true),
      identity_not_proven_by_score: z.literal(true),
      referral_is_simulated: z.literal(true),
    }),
  }),
]);
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;

// "Referral recorded (simulation)": an internal record, no receipt or custody claim.
export const decisionResponseSchema = z
  .strictObject({
    candidate_status: candidateStatusSchema,
    missing: z.strictObject({ ref_code: refCodeSchema.startsWith("M-"), status: caseStatusSchema }),
    found: z.strictObject({ ref_code: refCodeSchema.startsWith("F-"), status: caseStatusSchema }),
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
  });
export type DecisionResponse = z.infer<typeof decisionResponseSchema>;

/* ---------- API-011 close ---------- */

export const closeCaseRequestSchema = z.object({
  outcome: outcomeSchema,
  note: reasonSchema,
  expected_version: versionSchema,
});
export type CloseCaseRequest = z.infer<typeof closeCaseRequestSchema>;

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
  name_bn: z.string().min(1),
  name_en: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  missing_reports: missingCounts,
  found_reports: foundCounts,
  confirmed_pairs: count,
});

export const dashboardStatsResponseSchema = z
  .strictObject({
    generated_at: isoDateTimeSchema,
    counting_basis: z.literal(COUNTING_BASIS),
    totals: z.strictObject({ missing_reports: missingCounts, found_reports: foundCounts, confirmed_pairs: count }),
    districts: z.array(districtStatsSchema).length(64),
  })
  .superRefine((s, ctx) => {
    if (new Set(s.districts.map((d) => d.code)).size !== 64) {
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
  });
export type DashboardStatsResponse = z.infer<typeof dashboardStatsResponseSchema>;

/* ---------- API-013 safe audit ---------- */

export const auditEntryViewSchema = z.strictObject({
  at: isoDateTimeSchema,
  actor_role: actorTypeSchema,
  actor_id: uuidSchema.nullable(), // only when the reader is authorised to see it
  actor_display: z.string().nullable(),
  action: z.string().regex(/^[a-z_.]{3,60}$/),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])), // allowlisted safe keys
});
export const auditResponseSchema = z.strictObject({ entries: z.array(auditEntryViewSchema) });
export type AuditResponse = z.infer<typeof auditResponseSchema>;

/* ---------- API-014 rematch: status only for every role (TC-044) ---------- */

export const rematchResponseSchema = z.strictObject({ case_id: uuidSchema, matching_state: matchingStateSchema });
export type RematchResponse = z.infer<typeof rematchResponseSchema>;

/* ---------- API-015 synthetic import ---------- */

export const importRequestSchema = z.object({
  kind: caseKindSchema,
  fixture_intake_at: isoDateTimeSchema,
  items: z
    .array(
      z.object({
        text: z.string().trim().min(LIMITS.textChars.min).max(LIMITS.textChars.max),
        source_url: z
          .url()
          .refine((u) => URL.canParse(u) && new URL(u).hostname.endsWith("example.invalid"), "source_url must use example.invalid"),
        synthetic: z.literal(true),
      }),
    )
    .min(LIMITS.importBatch.min)
    .max(LIMITS.importBatch.max),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;

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
export type AnonymiseRequest = z.infer<typeof anonymiseRequestSchema>;

export const anonymiseResponseSchema = z.strictObject({
  redacted: count,
  skipped_not_eligible: count,
  mode: z.literal("pseudonymisation"),
  external_copies_removed: z.literal(false),
});
export type AnonymiseResponse = z.infer<typeof anonymiseResponseSchema>;

/* ---------- API-017 verify officer [MOCK] ---------- */

export const verifyUserRequestSchema = z.object({ verified: z.boolean() });
export type VerifyUserRequest = z.infer<typeof verifyUserRequestSchema>;
export const verifyUserResponseSchema = z.strictObject({ id: uuidSchema, role: z.literal("officer"), verified: z.boolean() });
export type VerifyUserResponse = z.infer<typeof verifyUserResponseSchema>;

/* ---------- API-018 my reports ---------- */

export const myCaseResponseSchema = z.strictObject({
  reports: z.array(
    z.strictObject({
      id: uuidSchema,
      ref_code: refCodeSchema.startsWith("M-"),
      status: missingStatusSchema,
      status_group: statusGroupSchema,
      updated_at: isoDateTimeSchema,
      editable: z.boolean(),
    }),
  ),
});
export type MyCaseResponse = z.infer<typeof myCaseResponseSchema>;

/* ---------- API-019 health ---------- */

export const healthResponseSchema = z.strictObject({
  version: z.string().min(1),
  db: z.enum(["ready", "unavailable"]),
  embeddings: z.enum(["ready", "unavailable"]),
  synthetic_only: z.literal(true),
  demo_mode: z.boolean(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/* ---------- API-020 credentials sign-in ---------- */

export const signInRequestSchema = z.object({
  username: z.string().regex(/^[a-z0-9._-]{3,32}$/),
  password: z.string().min(1).max(200),
});
export type SignInRequest = z.infer<typeof signInRequestSchema>;

// Server-derived session summary; the client never supplies role or verification.
export const sessionViewSchema = z.strictObject({
  user_id: uuidSchema,
  display_name: z.string().min(2).max(80),
  role: userRoleSchema,
  verified: z.boolean(),
  expires_at: isoDateTimeSchema,
});
export type SessionView = z.infer<typeof sessionViewSchema>;

/* ---------- API-021 admin users, API-022 case list, API-023 duplicates ---------- */

export const pageQuerySchema = z.object({ limit: pageLimitSchema.optional(), cursor: cursorSchema.optional() });
export type PageQuery = z.infer<typeof pageQuerySchema>;

export const adminUsersResponseSchema = z.strictObject({
  users: z.array(
    z.strictObject({
      id: uuidSchema,
      username: z.string().regex(/^[a-z0-9._-]{3,32}$/),
      display_name: z.string().min(2).max(80),
      role: userRoleSchema,
      verified: z.boolean(),
      is_active: z.boolean(),
    }),
  ),
  next_cursor: cursorSchema.nullable(),
});
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;

export const caseListQuerySchema = pageQuerySchema.extend({
  district: z.coerce.number().pipe(districtCodeSchema).optional(),
  kind: caseKindSchema.optional(),
  status_group: statusGroupSchema.optional(),
});
export type CaseListQuery = z.infer<typeof caseListQuerySchema>;

export const caseListResponseSchema = z.strictObject({ cases: z.array(officerCaseViewSchema), next_cursor: cursorSchema.nullable() });
export type CaseListResponse = z.infer<typeof caseListResponseSchema>;

export const duplicateDecisionRequestSchema = z.object({
  status: z.enum(["confirmed_same", "dismissed"]),
  reason: reasonSchema,
  profile_evidence_reviewed: z.literal(true),
});
export type DuplicateDecisionRequest = z.infer<typeof duplicateDecisionRequestSchema>;

export const duplicateDecisionResponseSchema = z.strictObject({
  link_id: uuidSchema,
  status: duplicateStatusSchema.exclude(["flagged"]),
  audit_id: z.int().min(1),
});
export type DuplicateDecisionResponse = z.infer<typeof duplicateDecisionResponseSchema>;

/* ---------- Pre-submit server metadata (BR-004/023, TC-060): no payload ---------- */

export const intakeDraftMetadataSchema = z.strictObject({
  id: uuidSchema,
  session_id: uuidSchema.nullable(),
  user_id: uuidSchema.nullable(),
  kind: caseKindSchema,
  created_at: isoDateTimeSchema,
  expires_at: isoDateTimeSchema,
  payload_hash: sha256HexSchema.nullable(),
  ai_calls_used: aiCallsUsed,
  revision: versionSchema,
});
export type IntakeDraftMetadata = z.infer<typeof intakeDraftMetadataSchema>;

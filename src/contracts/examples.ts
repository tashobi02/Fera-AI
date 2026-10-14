// One valid typed example per API DTO, for tests and UI lanes as typed fakes.
// Synthetic only: invented names, fake 01X00000000 numbers, [MOCK] district labels.
import type { z } from "zod";
import type { CaseDraft, EvidenceSpan } from "./draft";
import { errorEnvelope, errorEnvelopeSchema } from "./errors";
import { toBanglaDigits } from "./primitives";
import { projectAuditFor, toAdminCaseView, toOfficerCaseView, toRematchResponse, type AuditRow, type CaseRow } from "./roles";
import * as s from "./schemas";
import { COUNTING_BASIS } from "./states";

export const IDS = {
  missingCase: "6b1f3c2a-4d5e-4f60-8a71-0000000000a1",
  foundCase: "6b1f3c2a-4d5e-4f60-8a71-0000000000f1",
  otherMissingCase: "6b1f3c2a-4d5e-4f60-8a71-0000000000a2",
  candidate: "6b1f3c2a-4d5e-4f60-8a71-0000000000c1",
  referral: "6b1f3c2a-4d5e-4f60-8a71-000000000041",
  duplicateLink: "6b1f3c2a-4d5e-4f60-8a71-000000000051",
  draft: "6b1f3c2a-4d5e-4f60-8a71-0000000000d1",
  parentSession: "6b1f3c2a-4d5e-4f60-8a71-0000000000e1",
  otherParentSession: "6b1f3c2a-4d5e-4f60-8a71-0000000000e2",
  staffUser: "6b1f3c2a-4d5e-4f60-8a71-000000000011",
  officerUser: "6b1f3c2a-4d5e-4f60-8a71-000000000021",
  adminUser: "6b1f3c2a-4d5e-4f60-8a71-000000000031",
  missingSubmission: "6b1f3c2a-4d5e-4f60-8a71-000000000061",
  foundSubmission: "6b1f3c2a-4d5e-4f60-8a71-000000000062",
} as const;

export const REFS = { missing: "M-7K2Q9A", found: "F-3D8W1Z", otherMissing: "M-5R0T4C" } as const;

const DISTRICT = 26;
const MOCK_DISTRICT_BN = `[MOCK] জেলা ${toBanglaDigits(DISTRICT)}`;
const DRAFT_TOKEN = "syn.draft.v1.c3ludGhldGljLWRyYWZ0LXRva2Vu";

function span(source: string, quote: string, derivation: EvidenceSpan["derivation"]): EvidenceSpan {
  const start = source.indexOf(quote);
  if (start < 0) throw new Error(`example quote not in source: ${quote}`);
  return { quote, start_utf16: start, end_utf16: start + quote.length, derivation };
}

/* ---------- Reviewed drafts ---------- */

const missingSource =
  "আমার মেয়ে মিতু, বয়স ৭ বছর। গতকাল বিকেলে বাস টার্মিনালের কাছে হারিয়ে গেছে। লাল জামা পরা ছিল। আমার নম্বর ০১৭০০০০০০০১।";

export const exampleMissingDraft = {
  kind: "missing",
  source_text: missingSource,
  child: {
    name: "মিতু",
    name_latin: "Mitu",
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
    district_code: DISTRICT, // chosen in the manual district selector
    thana: null,
    circumstances: null,
  },
  reporter: { relation: null, phone: "01700000001" },
  evidence: {
    "child.name": span(missingSource, "মিতু", "direct"),
    "child.age_years": span(missingSource, "৭", "digits"),
    "child.sex": span(missingSource, "মেয়ে", "direct"),
    "child.clothing": span(missingSource, "লাল জামা", "direct"),
    "event.at": span(missingSource, "গতকাল বিকেলে", "time_interval"),
    "event.place_text": span(missingSource, "বাস টার্মিনালের কাছে", "direct"),
    "reporter.phone": span(missingSource, "০১৭০০০০০০০১", "digits"),
  },
} satisfies CaseDraft & z.input<typeof s.createMissingRequestSchema>["draft"];

const foundSource = "বাস টার্মিনালের কাছে একটি মেয়েকে একা পাওয়া গেছে। বয়স আনুমানিক ৬ থেকে ৮ বছর, লাল জামা পরা।";

export const exampleFoundDraft = {
  kind: "found",
  source_text: foundSource,
  child: {
    name: null,
    name_latin: null,
    age_years: null,
    age_min: 6,
    age_max: 8,
    sex: "female",
    height_cm: null,
    clothing: "লাল জামা",
    marks: null,
  },
  event: {
    at: "2026-10-12T19:30:00+06:00",
    at_approx: false,
    at_lower: "2026-10-12T19:30:00+06:00",
    at_upper: "2026-10-12T19:30:00+06:00",
    place_text: "বাস টার্মিনালের কাছে",
    district_text: null,
    district_code: DISTRICT,
    thana: null,
    circumstances: "একা পাওয়া গেছে",
  },
  reporter: { relation: null, phone: "01800000002" }, // staff contact
  evidence: {
    "child.age_min": span(foundSource, "৬", "digits"),
    "child.age_max": span(foundSource, "৮", "digits"),
    "child.sex": span(foundSource, "মেয়ে", "direct"),
    "child.clothing": span(foundSource, "লাল জামা", "direct"),
    "event.place_text": span(foundSource, "বাস টার্মিনালের কাছে", "direct"),
    "event.circumstances": span(foundSource, "একা পাওয়া গেছে", "direct"),
  },
} satisfies CaseDraft & z.input<typeof s.createFoundRequestSchema>["draft"];

/* ---------- Server rows (typed fakes for case-service tests; never responses) ---------- */

function rowFrom(draft: CaseDraft, extra: Partial<CaseRow> & Pick<CaseRow, "id" | "ref_code" | "status" | "source">): CaseRow {
  return {
    source_url: null,
    is_synthetic: true,
    reporter_session_id: null,
    created_by_user_id: null,
    raw_text: draft.source_text,
    child_name: draft.child.name,
    child_name_latin: draft.child.name_latin,
    age_years: draft.child.age_years,
    age_min: draft.child.age_min,
    age_max: draft.child.age_max,
    sex: draft.child.sex,
    height_cm: draft.child.height_cm,
    clothing: draft.child.clothing,
    marks: draft.child.marks,
    circumstances: draft.event.circumstances,
    event_at: draft.event.at,
    event_at_approx: draft.event.at_approx,
    event_at_lower: draft.event.at_lower,
    event_at_upper: draft.event.at_upper,
    provenance: draft.evidence,
    embedding_model: null,
    embedding_revision: null,
    embedding_space: null,
    matching_state: "complete",
    matched_at: "2026-10-12T20:05:00+06:00",
    match_error_id: null,
    place_text: draft.event.place_text,
    district_code: draft.event.district_code,
    thana: draft.event.thana,
    reporter_relation: draft.reporter.relation,
    contact_phone: draft.reporter.phone,
    gd_number: null,
    client_submission_id: null,
    submission_payload_hash: null,
    input_hash: null,
    version: 1,
    outcome: null,
    outcome_note: null,
    closed_at: null,
    anonymised_at: null,
    created_at: "2026-10-12T20:00:00+06:00",
    updated_at: "2026-10-12T20:05:00+06:00",
    kind: draft.kind,
    ...extra,
  };
}

export const exampleMissingRow: CaseRow = rowFrom(exampleMissingDraft, {
  id: IDS.missingCase,
  ref_code: REFS.missing,
  status: "matched_pending_review",
  source: "parent",
  reporter_session_id: IDS.parentSession,
  client_submission_id: IDS.missingSubmission,
  submission_payload_hash: "a".repeat(64),
});

export const exampleFoundRow: CaseRow = rowFrom(exampleFoundDraft, {
  id: IDS.foundCase,
  ref_code: REFS.found,
  status: "matched_pending_review",
  source: "staff",
  created_by_user_id: IDS.staffUser,
  client_submission_id: IDS.foundSubmission,
  submission_payload_hash: "b".repeat(64),
});

const officerCtx = { districtNameBn: MOCK_DISTRICT_BN, duplicateOf: [] };

/* ---------- API-001 / API-002 ---------- */

export const exampleTranscribeFields: z.input<typeof s.transcribeFieldsSchema> = { kind: "missing", duration_s: 42 };

export const exampleTranscribeResponse: s.TranscribeResponse = {
  draft_token: DRAFT_TOKEN,
  draft_id: IDS.draft,
  ai_calls_used: 1,
  transcript: missingSource,
  language: "bn",
  duration_s: 42,
  cached: false,
};

export const exampleExtractRequest: z.input<typeof s.extractRequestSchema> = {
  kind: "missing",
  text: missingSource,
  draft_token: DRAFT_TOKEN,
};

export const exampleExtractFollowUpRequest: z.input<typeof s.extractRequestSchema> = {
  kind: "missing",
  answer: "জেলা ২৬", // synthetic answer to the district question
  draft: { ...exampleMissingDraft, event: { ...exampleMissingDraft.event, district_code: null } },
  draft_token: DRAFT_TOKEN,
  draft_revision: 2,
};

export const exampleExtractResponse: s.ExtractResponse = {
  draft_token: DRAFT_TOKEN,
  draft_id: IDS.draft,
  draft_revision: 2,
  expires_at: "2026-10-13T20:00:00+06:00",
  draft: { ...exampleMissingDraft, event: { ...exampleMissingDraft.event, district_code: null } },
  missing_fields: ["event.district_code"],
  next_question: {
    field: "event.district_code",
    bn: "শিশুটিকে শেষ কোন জেলায় দেখা গেছে?",
    en: "In which district was the child last seen?",
  },
  ai_calls_used: 2,
  cached: false,
};

/* ---------- API-003 / API-004 / API-005 / API-007 ---------- */

export const exampleCreateMissingRequest: s.CreateMissingRequest = {
  draft: exampleMissingDraft,
  confirmed: true,
  client_submission_id: IDS.missingSubmission,
  draft_token: DRAFT_TOKEN,
};

export const exampleOwnerCaseView: s.OwnerCaseView = {
  id: IDS.missingCase,
  ref_code: REFS.missing,
  kind: "missing",
  status: "open",
  status_group: "open",
  is_synthetic: true,
  version: 1,
  editable: true,
  matching_state: "complete",
  draft: exampleMissingDraft,
  created_at: "2026-10-12T20:00:00+06:00",
  updated_at: "2026-10-12T20:05:00+06:00",
};

export const exampleCreateMissingResponse: s.CreateMissingResponse = {
  ...exampleOwnerCaseView,
  replayed: false,
  outputs_available: ["gd", "poster", "helpline"],
};

export const exampleUpdateCaseRequest: s.UpdateCaseRequest = {
  draft: { ...exampleMissingDraft, child: { ...exampleMissingDraft.child, marks: "বাঁ হাতে ছোট দাগ" } },
  confirmed: true,
  expected_version: 1,
};

export const exampleCreateFoundRequest: s.CreateFoundRequest = {
  draft: exampleFoundDraft,
  confirmed: true,
  client_submission_id: IDS.foundSubmission,
};

export const exampleStaffOwnCaseView: s.StaffOwnCaseView = {
  id: IDS.foundCase,
  ref_code: REFS.found,
  kind: "found",
  status: "open",
  is_synthetic: true,
  version: 1,
  matching_state: "queued",
  draft: exampleFoundDraft,
  created_at: "2026-10-12T20:00:00+06:00",
};

export const exampleCreateFoundResponse: s.CreateFoundResponse = { ...exampleStaffOwnCaseView, replayed: false };

export const exampleOfficerMissingView: s.OfficerCaseView = toOfficerCaseView(exampleMissingRow, officerCtx);
export const exampleOfficerFoundView: s.OfficerCaseView = toOfficerCaseView(exampleFoundRow, officerCtx);
export const exampleAdminCaseView: s.AdminCaseView = toAdminCaseView(exampleMissingRow);

/* ---------- API-006 ---------- */

export const exampleOutputRequest: s.OutputRequest = { type: "gd" };

const gdText = "খসড়া · সিনথেটিক উদাহরণ। শিশুর নাম মিতু, বয়স ৭ বছর, শেষ দেখা গেছে বাস টার্মিনালের কাছে।";
export const exampleOutputResponse: s.OutputResponse = {
  type: "gd",
  text_bn: gdText,
  label_bn: s.OUTPUT_DRAFT_LABEL_BN,
  word_count: gdText.split(/\s+/).length,
  generated_at: "2026-10-12T20:10:00+06:00",
};

/* ---------- API-008 / API-009 / API-010 / API-011 ---------- */

export const exampleReviewQueueQuery: z.input<typeof s.reviewQueueQuerySchema> = { district: "26", limit: "20" };

const components = { cosine: 0.82, name: null, clothing: 1, district: 1, age: 1 };

export const exampleReviewQueueResponse: s.ReviewQueueResponse = {
  items: [
    {
      case: exampleOfficerMissingView,
      candidates: [
        {
          candidate_id: IDS.candidate,
          rank: 1,
          score: 87,
          reason_bn: "একই জায়গা, কাছাকাছি সময়, লাল জামা",
          reason_en: "Same place, nearby time, red dress",
          components,
          counterpart: exampleOfficerFoundView,
          qualified: true,
          identity_probability: false,
        },
      ],
    },
  ],
  next_cursor: null,
};

export const exampleCandidateDecisionView: s.CandidateDecisionView = {
  candidate_id: IDS.candidate,
  missing: exampleOfficerMissingView,
  found: exampleOfficerFoundView,
  score: 87,
  components,
  explanation_version: "v1",
  qualified: true,
  identity_probability: false,
};

export const exampleConfirmDecisionRequest: s.DecisionRequest = {
  decision: "confirm",
  expected_missing_version: 1,
  expected_found_version: 1,
  reviewer_checklist: {
    descriptions_reviewed: true,
    contradictions_reviewed: true,
    identity_not_proven_by_score: true,
    referral_is_simulated: true,
  },
};

export const exampleRejectDecisionRequest: s.DecisionRequest = {
  decision: "reject",
  reason: "বয়সের পার্থক্য অনেক বেশি",
  expected_missing_version: 1,
  expected_found_version: 1,
};

export const exampleConfirmDecisionResponse: s.DecisionResponse = {
  candidate_status: "confirmed",
  missing: { ref_code: REFS.missing, status: "confirmed" },
  found: { ref_code: REFS.found, status: "referred" },
  referral_id: IDS.referral,
  referral_state: "recorded",
  referral_is_simulated: true,
};

export const exampleRejectDecisionResponse: s.DecisionResponse = {
  candidate_status: "rejected",
  missing: { ref_code: REFS.missing, status: "open" },
  found: { ref_code: REFS.found, status: "open" },
  referral_id: null,
  referral_state: null,
  referral_is_simulated: true,
};

export const exampleCloseCaseRequest: s.CloseCaseRequest = {
  outcome: "coordination_recorded",
  note: "সিনথেটিক সমন্বয় নথিভুক্ত",
  expected_version: 2,
};

export const exampleCloseCaseResponse: s.CloseCaseResponse = {
  ref_code: REFS.missing,
  status: "closed",
  closed_at: "2026-10-12T21:00:00+06:00",
};

/* ---------- API-012 dashboard: one confirmed pair, one open missing report ---------- */

const zeroDistrict = (code: number): s.DashboardStatsResponse["districts"][number] => ({
  code,
  name_bn: `[MOCK] জেলা ${toBanglaDigits(code)}`,
  name_en: `[MOCK] District ${code}`,
  lat: 23.7,
  lng: 90.4,
  missing_reports: { open: 0, matched: 0, closed: 0 },
  found_reports: { open: 0, matched: 0, referral_recorded: 0 },
  confirmed_pairs: 0,
});

const districts = Array.from({ length: 64 }, (_, i) => zeroDistrict(i + 1)).map((d) =>
  d.code === DISTRICT
    ? {
        ...d,
        missing_reports: { open: 1, matched: 0, closed: 1 },
        found_reports: { open: 0, matched: 0, referral_recorded: 1 },
        confirmed_pairs: 1,
      }
    : d,
);

export const exampleDashboardStatsResponse: s.DashboardStatsResponse = {
  generated_at: "2026-10-12T21:05:00+06:00",
  counting_basis: COUNTING_BASIS,
  totals: {
    missing_reports: { open: 1, matched: 0, closed: 1 },
    found_reports: { open: 0, matched: 0, referral_recorded: 1 },
    confirmed_pairs: 1,
  },
  districts,
};

/* ---------- API-013 / API-014 ---------- */

// Raw audit rows as the case service stores them (server-only). Details include
// keys that the admin projection must drop.
export const exampleAuditRows: AuditRow[] = [
  {
    at: "2026-10-12T20:30:00+06:00",
    actor_type: "officer",
    actor_user_id: IDS.officerUser,
    actor_session_id: null,
    actor_display: "[MOCK] কর্মকর্তা",
    action: "match.confirm",
    case_id: IDS.missingCase,
    candidate_id: IDS.candidate,
    details: {
      ref_code: REFS.missing,
      missing_ref: REFS.missing,
      found_ref: REFS.found,
      missing_version: 1,
      found_version: 1,
      decision: "confirm",
      score: 87,
      referral_simulated: true,
      reason_recorded: false,
    },
  },
  {
    at: "2026-10-12T21:00:00+06:00",
    actor_type: "officer",
    actor_user_id: IDS.officerUser,
    actor_session_id: null,
    actor_display: "[MOCK] কর্মকর্তা",
    action: "case.close",
    case_id: IDS.missingCase,
    candidate_id: null,
    details: { ref_code: REFS.missing, from_status: "confirmed", to_status: "closed", outcome: "coordination_recorded", reason_recorded: true },
  },
];

const officerPrincipal = { kind: "user", userId: IDS.officerUser, role: "officer", verified: true, isActive: true } as const;
const adminPrincipal = { kind: "user", userId: IDS.adminUser, role: "admin", verified: false, isActive: true } as const;

export const exampleOfficerAuditResponse = projectAuditFor(officerPrincipal, exampleAuditRows) as s.OfficerAuditResponse;
export const exampleAdminAuditResponse = projectAuditFor(adminPrincipal, exampleAuditRows) as s.AdminAuditResponse;

export const exampleRematchResponse: s.RematchResponse = toRematchResponse(exampleMissingRow);

/* ---------- API-015 – API-020 ---------- */

export const exampleImportRequest: s.ImportRequest = {
  kind: "found",
  fixture_intake_at: "2026-10-12T12:00:00+06:00",
  items: [
    {
      text: "সিনথেটিক নমুনা: স্টেশনের কাছে একটি ছেলেকে একা পাওয়া গেছে, বয়স আনুমানিক দশ।",
      source_url: "https://fixture.example.invalid/post/1",
      synthetic: true,
    },
  ],
};

export const exampleImportResponse: s.ImportResponse = { imported: 1, skipped: 0, duplicates_flagged: 0 };

export const exampleAnonymiseRequest: s.AnonymiseRequest = { case_ids: [IDS.missingCase], confirmation: "বেনামী" };

export const exampleAnonymiseResponse: s.AnonymiseResponse = {
  redacted: 1,
  skipped_not_eligible: 0,
  mode: "pseudonymisation",
  external_copies_removed: false,
};

export const exampleVerifyUserRequest: s.VerifyUserRequest = { verified: true };
export const exampleVerifyUserResponse: s.VerifyUserResponse = { id: IDS.officerUser, role: "officer", verified: true };

export const exampleMyCaseResponse: s.MyCaseResponse = {
  reports: [
    {
      id: IDS.missingCase,
      ref_code: REFS.missing,
      status: "open",
      status_group: "open",
      updated_at: "2026-10-12T20:05:00+06:00",
      editable: true,
    },
  ],
};

export const exampleHealthResponse: s.HealthResponse = {
  version: "0.1.0",
  db: "ready",
  embeddings: "ready",
  synthetic_only: true,
  demo_mode: false,
};

export const exampleSignInRequest: s.SignInRequest = { username: "officer.demo", password: "not-a-real-password" };

export const exampleSessionView: s.SessionView = {
  user_id: IDS.officerUser,
  display_name: "[MOCK] কর্মকর্তা",
  role: "officer",
  verified: true,
  expires_at: "2026-10-13T04:00:00+06:00",
};

/* ---------- API-021 – API-023 ---------- */

export const examplePageQuery: z.input<typeof s.pageQuerySchema> = { limit: "20" };

export const exampleAdminUsersResponse: s.AdminUsersResponse = {
  users: [
    { id: IDS.staffUser, username: "staff.demo", display_name: "[MOCK] স্টাফ", role: "staff", verified: false, is_active: true },
    { id: IDS.officerUser, username: "officer.demo", display_name: "[MOCK] কর্মকর্তা", role: "officer", verified: true, is_active: true },
  ],
  next_cursor: null,
};

export const exampleCaseListQuery: z.input<typeof s.caseListQuerySchema> = { district: "26", kind: "missing", status_group: "matched" };

export const exampleCaseListResponse: s.CaseListResponse = { cases: [exampleOfficerMissingView], next_cursor: null };

export const exampleDuplicateDecisionRequest: s.DuplicateDecisionRequest = {
  status: "dismissed",
  reason: "একই ফোন নম্বর, কিন্তু আলাদা শিশুর বিবরণ",
  profile_evidence_reviewed: true,
};

export const exampleDuplicateDecisionResponse: s.DuplicateDecisionResponse = {
  link_id: IDS.duplicateLink,
  status: "dismissed",
  audit_id: 101,
};

/* ---------- Errors and pre-submit metadata ---------- */

export const exampleErrorEnvelope = errorEnvelope("E-001");

export const exampleIntakeDraftMetadata: s.IntakeDraftMetadata = {
  id: IDS.draft,
  session_id: IDS.parentSession,
  user_id: null,
  kind: "missing",
  created_at: "2026-10-12T19:50:00+06:00",
  expires_at: "2026-10-13T19:50:00+06:00",
  payload_hash: null,
  ai_calls_used: 2,
  revision: 3,
};

/* ---------- Registry: every example with the schema it must satisfy ---------- */

export const EXAMPLES: readonly { api: string; name: string; schema: z.ZodType; value: unknown }[] = [
  { api: "API-001", name: "TranscribeFields", schema: s.transcribeFieldsSchema, value: exampleTranscribeFields },
  { api: "API-001", name: "TranscribeResponse", schema: s.transcribeResponseSchema, value: exampleTranscribeResponse },
  { api: "API-002", name: "ExtractRequest", schema: s.extractRequestSchema, value: exampleExtractRequest },
  { api: "API-002", name: "ExtractRequest (follow-up)", schema: s.extractRequestSchema, value: exampleExtractFollowUpRequest },
  { api: "API-002", name: "ExtractResponse", schema: s.extractResponseSchema, value: exampleExtractResponse },
  { api: "API-003", name: "CreateMissingRequest", schema: s.createMissingRequestSchema, value: exampleCreateMissingRequest },
  { api: "API-003", name: "CreateMissingResponse", schema: s.createMissingResponseSchema, value: exampleCreateMissingResponse },
  { api: "API-004", name: "OwnerCaseView", schema: s.ownerCaseViewSchema, value: exampleOwnerCaseView },
  { api: "API-004", name: "StaffOwnCaseView", schema: s.staffOwnCaseViewSchema, value: exampleStaffOwnCaseView },
  { api: "API-004", name: "OfficerCaseView (missing)", schema: s.officerCaseViewSchema, value: exampleOfficerMissingView },
  { api: "API-004", name: "OfficerCaseView (found)", schema: s.officerCaseViewSchema, value: exampleOfficerFoundView },
  { api: "API-004", name: "AdminCaseView", schema: s.adminCaseViewSchema, value: exampleAdminCaseView },
  { api: "API-005", name: "UpdateCaseRequest", schema: s.updateCaseRequestSchema, value: exampleUpdateCaseRequest },
  { api: "API-005", name: "OwnerCaseView", schema: s.ownerCaseViewSchema, value: exampleOwnerCaseView },
  { api: "API-006", name: "OutputRequest", schema: s.outputRequestSchema, value: exampleOutputRequest },
  { api: "API-006", name: "OutputResponse", schema: s.outputResponseSchema, value: exampleOutputResponse },
  { api: "API-007", name: "CreateFoundRequest", schema: s.createFoundRequestSchema, value: exampleCreateFoundRequest },
  { api: "API-007", name: "CreateFoundResponse", schema: s.createFoundResponseSchema, value: exampleCreateFoundResponse },
  { api: "API-008", name: "ReviewQueueQuery", schema: s.reviewQueueQuerySchema, value: exampleReviewQueueQuery },
  { api: "API-008", name: "ReviewQueueResponse", schema: s.reviewQueueResponseSchema, value: exampleReviewQueueResponse },
  { api: "API-009", name: "CandidateDecisionView", schema: s.candidateDecisionViewSchema, value: exampleCandidateDecisionView },
  { api: "API-010", name: "DecisionRequest (confirm)", schema: s.decisionRequestSchema, value: exampleConfirmDecisionRequest },
  { api: "API-010", name: "DecisionRequest (reject)", schema: s.decisionRequestSchema, value: exampleRejectDecisionRequest },
  { api: "API-010", name: "DecisionResponse (confirm)", schema: s.decisionResponseSchema, value: exampleConfirmDecisionResponse },
  { api: "API-010", name: "DecisionResponse (reject)", schema: s.decisionResponseSchema, value: exampleRejectDecisionResponse },
  { api: "API-011", name: "CloseCaseRequest", schema: s.closeCaseRequestSchema, value: exampleCloseCaseRequest },
  { api: "API-011", name: "CloseCaseResponse", schema: s.closeCaseResponseSchema, value: exampleCloseCaseResponse },
  { api: "API-012", name: "DashboardStatsResponse", schema: s.dashboardStatsResponseSchema, value: exampleDashboardStatsResponse },
  { api: "API-013", name: "OfficerAuditResponse", schema: s.officerAuditResponseSchema, value: exampleOfficerAuditResponse },
  { api: "API-013", name: "AdminAuditResponse", schema: s.adminAuditResponseSchema, value: exampleAdminAuditResponse },
  { api: "API-014", name: "RematchResponse", schema: s.rematchResponseSchema, value: exampleRematchResponse },
  { api: "API-015", name: "ImportRequest", schema: s.importRequestSchema, value: exampleImportRequest },
  { api: "API-015", name: "ImportResponse", schema: s.importResponseSchema, value: exampleImportResponse },
  { api: "API-016", name: "AnonymiseRequest", schema: s.anonymiseRequestSchema, value: exampleAnonymiseRequest },
  { api: "API-016", name: "AnonymiseResponse", schema: s.anonymiseResponseSchema, value: exampleAnonymiseResponse },
  { api: "API-017", name: "VerifyUserRequest", schema: s.verifyUserRequestSchema, value: exampleVerifyUserRequest },
  { api: "API-017", name: "VerifyUserResponse", schema: s.verifyUserResponseSchema, value: exampleVerifyUserResponse },
  { api: "API-018", name: "MyCaseResponse", schema: s.myCaseResponseSchema, value: exampleMyCaseResponse },
  { api: "API-019", name: "HealthResponse", schema: s.healthResponseSchema, value: exampleHealthResponse },
  { api: "API-020", name: "SignInRequest", schema: s.signInRequestSchema, value: exampleSignInRequest },
  { api: "API-020", name: "SessionView", schema: s.sessionViewSchema, value: exampleSessionView },
  { api: "API-021", name: "PageQuery", schema: s.pageQuerySchema, value: examplePageQuery },
  { api: "API-021", name: "AdminUsersResponse", schema: s.adminUsersResponseSchema, value: exampleAdminUsersResponse },
  { api: "API-022", name: "CaseListQuery", schema: s.caseListQuerySchema, value: exampleCaseListQuery },
  { api: "API-022", name: "CaseListResponse", schema: s.caseListResponseSchema, value: exampleCaseListResponse },
  { api: "API-023", name: "DuplicateDecisionRequest", schema: s.duplicateDecisionRequestSchema, value: exampleDuplicateDecisionRequest },
  { api: "API-023", name: "DuplicateDecisionResponse", schema: s.duplicateDecisionResponseSchema, value: exampleDuplicateDecisionResponse },
  { api: "*", name: "ErrorEnvelope", schema: errorEnvelopeSchema, value: exampleErrorEnvelope },
  { api: "-", name: "IntakeDraftMetadata", schema: s.intakeDraftMetadataSchema, value: exampleIntakeDraftMetadata },
];

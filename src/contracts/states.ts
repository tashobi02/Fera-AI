// Enums mirror docs/code/schema_v2.sql exactly (checked in tests/contracts).
import { z } from "zod";

export const CASE_KINDS = ["missing", "found"] as const;
export const CASE_STATUSES = ["submitted", "open", "matched_pending_review", "confirmed", "closed", "referred"] as const;
export const MISSING_STATUSES = ["submitted", "open", "matched_pending_review", "confirmed", "closed"] as const;
export const FOUND_STATUSES = ["open", "matched_pending_review", "referred"] as const;
export const SEXES = ["male", "female", "other", "unknown"] as const;
export const CASE_SOURCES = ["parent", "staff", "public_import", "synthetic"] as const;
export const USER_ROLES = ["staff", "officer", "admin"] as const;
export const CANDIDATE_STATUSES = ["pending", "confirmed", "rejected", "voided", "superseded"] as const;
export const DECISION_TYPES = ["confirm", "reject"] as const;
export const OUTCOMES = ["coordination_recorded", "resolved_outside_fera"] as const;
export const DUPLICATE_STATUSES = ["flagged", "confirmed_same", "dismissed"] as const;
export const DUPLICATE_RULES = ["profile", "same_phone"] as const;
export const MATCHING_STATES = ["queued", "running", "complete", "failed"] as const;
export const OUTPUT_TYPES = ["gd", "poster", "helpline"] as const;
export const ACTOR_TYPES = ["parent", "staff", "officer", "admin", "system"] as const;
export const STATUS_GROUPS = ["open", "matched", "closed"] as const;
export const EVIDENCE_DERIVATIONS = ["direct", "digits", "time_interval", "district_mapping", "romanisation"] as const;

export const caseKindSchema = z.enum(CASE_KINDS);
export const caseStatusSchema = z.enum(CASE_STATUSES);
export const missingStatusSchema = z.enum(MISSING_STATUSES);
export const foundStatusSchema = z.enum(FOUND_STATUSES);
export const sexSchema = z.enum(SEXES);
export const caseSourceSchema = z.enum(CASE_SOURCES);
export const userRoleSchema = z.enum(USER_ROLES);
export const candidateStatusSchema = z.enum(CANDIDATE_STATUSES);
export const decisionTypeSchema = z.enum(DECISION_TYPES);
export const outcomeSchema = z.enum(OUTCOMES);
export const duplicateStatusSchema = z.enum(DUPLICATE_STATUSES);
export const duplicateRuleSchema = z.enum(DUPLICATE_RULES);
export const matchingStateSchema = z.enum(MATCHING_STATES);
export const outputTypeSchema = z.enum(OUTPUT_TYPES);
export const actorTypeSchema = z.enum(ACTOR_TYPES);
export const statusGroupSchema = z.enum(STATUS_GROUPS);

export type CaseKind = (typeof CASE_KINDS)[number];
export type CaseStatus = (typeof CASE_STATUSES)[number];
export type MissingStatus = (typeof MISSING_STATUSES)[number];
export type FoundStatus = (typeof FOUND_STATUSES)[number];
export type Sex = (typeof SEXES)[number];
export type CaseSource = (typeof CASE_SOURCES)[number];
export type UserRole = (typeof USER_ROLES)[number];
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];
export type DecisionType = (typeof DECISION_TYPES)[number];
export type ActorType = (typeof ACTOR_TYPES)[number];
export type EvidenceDerivation = (typeof EVIDENCE_DERIVATIONS)[number];
export type Outcome = (typeof OUTCOMES)[number];
export type DuplicateStatus = (typeof DUPLICATE_STATUSES)[number];
export type DuplicateRule = (typeof DUPLICATE_RULES)[number];
export type MatchingState = (typeof MATCHING_STATES)[number];
export type OutputType = (typeof OUTPUT_TYPES)[number];
export type StatusGroup = (typeof STATUS_GROUPS)[number];

// Legal lifecycle steps (BR-012/013), as in enforce_case_transition().
export const MISSING_TRANSITIONS: readonly (readonly [MissingStatus, MissingStatus])[] = [
  ["submitted", "open"],
  ["open", "matched_pending_review"],
  ["matched_pending_review", "open"],
  ["matched_pending_review", "confirmed"],
  ["confirmed", "closed"],
  ["open", "closed"],
];
export const FOUND_TRANSITIONS: readonly (readonly [FoundStatus, FoundStatus])[] = [
  ["open", "matched_pending_review"],
  ["matched_pending_review", "open"],
  ["matched_pending_review", "referred"],
];
export const INITIAL_STATUS = { missing: "submitted", found: "open" } as const;
// Report fields are locked from these statuses on (enforce_case_transition "terminal report fields are locked").
export const EDIT_LOCKED_STATUSES: readonly CaseStatus[] = ["confirmed", "closed", "referred"];
export const EDITABLE_STATUSES: readonly CaseStatus[] = ["submitted", "open", "matched_pending_review"];
// Payload redaction is allowed only here (cases CHECK on anonymised_at; redact_case_payload()).
export const REDACTABLE_STATUSES: readonly CaseStatus[] = ["closed", "referred"];

// Closure outcome by the missing report's current status (BR-012). SQL enforces only
// that coordination_recorded has a confirmed pair; the contract also forbids
// resolved_outside_fera after confirmation.
export function allowedCloseOutcome(status: MissingStatus): Outcome | null {
  if (status === "confirmed") return "coordination_recorded";
  if (status === "open") return "resolved_outside_fera";
  return null;
}

export function isMissingStatus(status: string): status is MissingStatus {
  return (MISSING_STATUSES as readonly string[]).includes(status);
}
export function isFoundStatus(status: string): status is FoundStatus {
  return (FOUND_STATUSES as readonly string[]).includes(status);
}

export type KindStatus = { kind: "missing"; status: MissingStatus } | { kind: "found"; status: FoundStatus };

// Narrow a stored (kind, status) pair; throws on a pair the cases CHECKs forbid.
export function kindStatus(kind: CaseKind, status: CaseStatus): KindStatus {
  if (kind === "missing" && isMissingStatus(status)) return { kind, status };
  if (kind === "found" && isFoundStatus(status)) return { kind, status };
  throw new Error(`invalid status ${status} for ${kind} report`);
}

export function isLegalTransition(kind: CaseKind, from: CaseStatus, to: CaseStatus): boolean {
  const steps: readonly (readonly [CaseStatus, CaseStatus])[] =
    kind === "missing" ? MISSING_TRANSITIONS : FOUND_TRANSITIONS;
  return steps.some(([a, b]) => a === from && b === to);
}

// Dashboard categories (BR-014). Missing, found and confirmed pairs are never summed.
export const MISSING_COUNT_CATEGORY = {
  submitted: "open",
  open: "open",
  matched_pending_review: "matched",
  confirmed: "matched",
  closed: "closed",
} as const satisfies Record<MissingStatus, "open" | "matched" | "closed">;

export const FOUND_COUNT_CATEGORY = {
  open: "open",
  matched_pending_review: "matched",
  referred: "referral_recorded",
} as const satisfies Record<FoundStatus, "open" | "matched" | "referral_recorded">;

// View grouping; a referred found report is terminal, so it groups as closed.
const FOUND_STATUS_GROUP = {
  open: "open",
  matched_pending_review: "matched",
  referred: "closed",
} as const satisfies Record<FoundStatus, StatusGroup>;

export function statusGroup(c: KindStatus): StatusGroup {
  return c.kind === "missing" ? MISSING_COUNT_CATEGORY[c.status] : FOUND_STATUS_GROUP[c.status];
}

export const REF_PREFIX = { missing: "M-", found: "F-" } as const;

// Shared phone alone never confirms the same child (BR-021, FV-02).
export function duplicateDecisionAllowed(rule: DuplicateRule, status: Exclude<DuplicateStatus, "flagged">): boolean {
  return !(rule === "same_phone" && status === "confirmed_same");
}

export const COUNTING_BASIS = "report_rows_separated_by_kind" as const;

// BR-013 wording; a referral row is an internal record, never delivery or custody.
export const REFERRAL_RECORDED_LABEL = { bn: "রেফারেল নথিভুক্ত (সিমুলেশন)", en: "Referral recorded (simulation)" } as const;
// D4 §score: similarity, never probability or identity.
export const SIMILARITY_LABEL = { bn: "মিলের মাত্রা", en: "Similarity" } as const;

// Audit actions the database triggers require (candidates_integrity, redact_case_payload)
// plus the D2B E-004 denial event. Other action codes are named by TASK-015.
export const AUDIT_ACTIONS = {
  matchConfirm: "match.confirm",
  matchReject: "match.reject",
  payloadRedacted: "case.payload_redacted",
  accessDenied: "access.denied",
} as const;

// Dotted draft field paths, shared by evidence keys, missing_fields, follow-up
// questions and audit fields_changed.
export const DRAFT_FIELD_PATHS = [
  "child.name", "child.name_latin", "child.age_years", "child.age_min", "child.age_max", "child.sex",
  "child.height_cm", "child.clothing", "child.marks",
  "event.at", "event.at_lower", "event.at_upper", "event.place_text", "event.district_text",
  "event.district_code", "event.thana", "event.circumstances",
  "reporter.relation", "reporter.phone",
] as const;
export type DraftFieldPath = (typeof DRAFT_FIELD_PATHS)[number];
export const draftFieldPathSchema = z.enum(DRAFT_FIELD_PATHS);

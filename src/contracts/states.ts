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
export const TERMINAL_STATUSES: readonly CaseStatus[] = ["confirmed", "closed", "referred"];
export const EDITABLE_STATUSES: readonly CaseStatus[] = ["submitted", "open", "matched_pending_review"];

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

export function statusGroup(kind: CaseKind, status: CaseStatus): StatusGroup {
  return kind === "missing"
    ? MISSING_COUNT_CATEGORY[status as MissingStatus]
    : FOUND_STATUS_GROUP[status as FoundStatus];
}

// Shared phone alone never confirms the same child (BR-021, FV-02).
export function duplicateDecisionAllowed(rule: DuplicateRule, status: Exclude<DuplicateStatus, "flagged">): boolean {
  return !(rule === "same_phone" && status === "confirmed_same");
}

export const COUNTING_BASIS = "report_rows_separated_by_kind" as const;

// BR-013 wording; a referral row is an internal record, never delivery or custody.
export const REFERRAL_RECORDED_LABEL = { bn: "রেফারেল নথিভুক্ত (সিমুলেশন)", en: "Referral recorded (simulation)" } as const;
// D4 §score: similarity, never probability or identity.
export const SIMILARITY_LABEL = { bn: "মিলের মাত্রা", en: "Similarity" } as const;

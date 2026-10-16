// Audit action codes (TASK-015, COMP-015; BR-010, STORY-017). The contracts name the
// four codes the database itself requires (AUDIT_ACTIONS: match.confirm/match.reject
// for check_pair_integrity(), case.payload_redacted for redact_case(), and the D2B
// E-004 access.denied event); TASK-015 names the rest here. Every code matches the
// audit_log.action CHECK ^[a-z_.]{3,60}$.
import { AUDIT_ACTION_PATTERN, AUDIT_ACTIONS, type ActorType } from "@/contracts";

export const CASE_AUDIT_ACTIONS = {
  // Contract codes the app writes.
  matchConfirm: AUDIT_ACTIONS.matchConfirm, // API-010 confirm; required by the deferred pair check
  matchReject: AUDIT_ACTIONS.matchReject, // API-010 reject; required by the deferred pair check
  accessDenied: AUDIT_ACTIONS.accessDenied, // signed-in E-003/E-004 denial (API layer and page guards)
  // TASK-015 codes.
  caseCreated: "case.created", // API-003/007 accepted report (initial status)
  caseSubmissionReplayed: "case.submission_replayed", // identical retry of a submission UUID (FR-031)
  caseStateChanged: "case.state_changed", // any lifecycle step outside decisions and closure
  caseEdited: "case.edited", // API-005 owner edit: new version, fields_changed paths only
  caseClosed: "case.closed", // API-011 coordination outcome
  caseContactViewed: "case.contact_viewed", // raw contact served to an officer (D2A §5.4)
  matchVoided: "match.voided", // pending candidate invalidated by a confirm or an edit
  referralRecorded: "referral.recorded", // internal referral record (simulation), never delivery
  // Refused transactions, written after the rollback (D2B §10.1, BR-010): { error_id, api } only.
  matchRefused: "match.refused", // API-010 decision refused (E-005)
  caseCloseRefused: "case.close.refused", // API-011 closure refused (E-005/E-017)
  caseEditRefused: "case.edit.refused", // API-005 owner edit refused (E-005/E-018)
  // TASK-032 admin code. Payload redaction needs none: redact_case() writes its own
  // case.payload_redacted row per case, inside the same transaction.
  userVerificationChanged: "user.verification_changed", // API-017 verify officer [MOCK] (seeded authority, BR-024)
} as const;

export type CaseAuditAction = (typeof CASE_AUDIT_ACTIONS)[keyof typeof CASE_AUDIT_ACTIONS];

// case.payload_redacted is written only by redact_case() inside the database.
export const WRITABLE_AUDIT_ACTIONS: readonly CaseAuditAction[] = Object.values(CASE_AUDIT_ACTIONS);

// Which actor types may author each action (checkAuditEntry). Decisions, referrals,
// closures and contact views are verified-officer acts (BR-001/024); owner edits are the
// parent's; pipeline steps may be `system`. Admins write access.denied and the API-017
// verification change only.
export const ACTION_ACTORS: Record<CaseAuditAction, readonly ActorType[]> = {
  "match.confirm": ["officer"],
  "match.reject": ["officer"],
  "match.refused": ["officer"],
  "referral.recorded": ["officer"],
  "case.closed": ["officer"],
  "case.close.refused": ["officer"],
  "case.contact_viewed": ["officer"],
  "match.voided": ["officer", "parent", "system"],
  "case.created": ["parent", "staff", "officer"],
  "case.submission_replayed": ["parent", "staff", "officer"],
  "case.edited": ["parent"],
  "case.edit.refused": ["parent"],
  "case.state_changed": ["parent", "staff", "officer", "system"],
  "access.denied": ["parent", "staff", "officer", "admin"],
  "user.verification_changed": ["admin"],
};

export function isWritableAuditAction(action: unknown): action is CaseAuditAction {
  return typeof action === "string" && AUDIT_ACTION_PATTERN.test(action) && (WRITABLE_AUDIT_ACTIONS as readonly string[]).includes(action);
}

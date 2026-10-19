// Per-role DTO projections (BR-007/024). There is no unrestricted CaseView: every
// read is principal-gated, picks one explicit allowlist and parses it with a strict
// schema before returning. A null result means the route answers E-004 (identical
// for hidden and absent records) and writes the access.denied audit entry.
import type { CaseDraftInput } from "../draft";
import { LIMITS, maskPhone, sameId, toMillisecondIso } from "../primitives";
import {
  ADMIN_AUDIT_DETAIL_KEYS,
  OFFICER_AUDIT_DETAIL_KEYS,
  adminAuditEntryViewSchema,
  adminCaseViewSchema,
  candidateDecisionViewSchema,
  caseListResponseSchema,
  officerAuditEntryViewSchema,
  officerCaseRowSchema,
  officerCaseViewSchema,
  type OfficerDuplicate,
  ownerCaseViewSchema,
  rematchResponseSchema,
  reviewQueueResponseSchema,
  staffOwnCaseViewSchema,
  type AdminAuditResponse,
  type AdminCaseView,
  type CandidateDecisionView,
  type CaseListResponse,
  type OfficerAuditResponse,
  type OfficerCaseRow,
  type OfficerCaseView,
  type OwnerCaseView,
  type RematchResponse,
  type ReviewQueueResponse,
  type StaffOwnCaseView,
} from "../schemas";
import { EDITABLE_STATUSES, kindStatus, statusGroup } from "../states";
import { effectiveRole, type Principal } from "./principal";
import type { AuditRow, CaseRow } from "./rows";

// Row-mapping rule: DB timestamps arrive as +06:00 strings, possibly with microseconds
// (timestamptz). Views accept them as-is; draft event times are truncated to
// milliseconds because drafts are client-editable input.
const ms = (iso: string | null) => (iso === null ? null : toMillisecondIso(iso));

function draftFromRow(row: CaseRow): CaseDraftInput {
  return {
    kind: row.kind,
    source_text: row.raw_text ?? "",
    child: {
      name: row.child_name,
      name_latin: row.child_name_latin,
      age_years: row.age_years,
      age_min: row.age_min,
      age_max: row.age_max,
      sex: row.sex,
      height_cm: row.height_cm,
      clothing: row.clothing,
      marks: row.marks,
    },
    event: {
      at: ms(row.event_at),
      at_approx: row.event_at_approx,
      at_lower: ms(row.event_at_lower),
      at_upper: ms(row.event_at_upper),
      place_text: row.place_text,
      district_text: null, // not persisted; district_code is authoritative (CN-06)
      district_code: row.district_code,
      thana: row.thana,
      circumstances: row.circumstances,
    },
    reporter: { relation: row.reporter_relation, phone: row.contact_phone },
    evidence: row.provenance,
  };
}

// Own payload only before the edit lock and never after redaction (BR-025).
const ownPayloadVisible = (row: CaseRow) => row.anonymised_at === null && EDITABLE_STATUSES.includes(row.status);

function toOwnerCaseView(row: CaseRow): OwnerCaseView {
  return ownerCaseViewSchema.parse({
    id: row.id,
    ref_code: row.ref_code,
    kind: row.kind,
    status: row.status,
    status_group: statusGroup(kindStatus(row.kind, row.status)),
    is_synthetic: row.is_synthetic,
    version: row.version,
    editable: ownPayloadVisible(row),
    matching_state: row.matching_state,
    draft: ownPayloadVisible(row) ? draftFromRow(row) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

function toStaffOwnCaseView(row: CaseRow): StaffOwnCaseView {
  return staffOwnCaseViewSchema.parse({
    id: row.id,
    ref_code: row.ref_code,
    kind: row.kind,
    status: row.status,
    is_synthetic: row.is_synthetic,
    version: row.version,
    matching_state: row.matching_state,
    draft: ownPayloadVisible(row) ? draftFromRow(row) : null,
    created_at: row.created_at,
  });
}

export type OfficerContext = { districtNameBn: string | null; duplicateOf: OfficerDuplicate[] };

function officerFields(row: CaseRow, ctx: OfficerContext) {
  return {
    id: row.id,
    ref_code: row.ref_code,
    kind: row.kind,
    status: row.status,
    status_group: statusGroup(kindStatus(row.kind, row.status)),
    is_synthetic: row.is_synthetic,
    source: row.source,
    source_url: row.source_url,
    child: {
      name: row.child_name,
      name_latin: row.child_name_latin,
      age_years: row.age_years,
      age_min: row.age_min,
      age_max: row.age_max,
      sex: row.sex,
      height_cm: row.height_cm,
      clothing: row.clothing,
      marks: row.marks,
    },
    event: {
      at: row.event_at,
      at_approx: row.event_at_approx,
      at_lower: row.event_at_lower,
      at_upper: row.event_at_upper,
      place_text: row.place_text,
      district_code: row.district_code,
      district_name_bn: ctx.districtNameBn,
      thana: row.thana,
      circumstances: row.circumstances,
    },
    reporter_relation: row.reporter_relation,
    contact_phone_masked: row.contact_phone ? maskPhone(row.contact_phone) : null,
    version: row.version,
    duplicate_of: ctx.duplicateOf,
    matching_state: row.matching_state,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Detail view with the raw phone. Callers must write the contact_viewed audit entry.
function toOfficerCaseView(row: CaseRow, ctx: OfficerContext): OfficerCaseView {
  return officerCaseViewSchema.parse({ ...officerFields(row, ctx), contact_phone: row.contact_phone });
}

// List/queue row: masked phone only.
function toOfficerCaseRow(row: CaseRow, ctx: OfficerContext): OfficerCaseRow {
  return officerCaseRowSchema.parse({ ...officerFields(row, ctx), contact_phone: null });
}

function toAdminCaseView(row: CaseRow): AdminCaseView {
  return adminCaseViewSchema.parse({
    id: row.id,
    ref_code: row.ref_code,
    kind: row.kind,
    status: row.status,
    district_code: row.district_code,
    is_synthetic: row.is_synthetic,
    anonymised_at: row.anonymised_at,
  });
}

export function toRematchResponse(row: Pick<CaseRow, "id" | "matching_state">): RematchResponse {
  return rematchResponseSchema.parse({ case_id: row.id, matching_state: row.matching_state });
}

export type CaseReadView =
  | { view: "owner"; data: OwnerCaseView }
  | { view: "staff_own"; data: StaffOwnCaseView }
  | { view: "officer"; data: OfficerCaseView; contactServed: boolean }
  | { view: "admin"; data: AdminCaseView };

// API-004. `contactServed` tells the route to write the contact_viewed audit entry.
export function projectCaseFor(p: Principal | null, row: CaseRow, ctx: OfficerContext): CaseReadView | null {
  const role = effectiveRole(p);
  if (role === "parent" && p?.kind === "parent") {
    return row.kind === "missing" && sameId(row.reporter_session_id, p.sessionId)
      ? { view: "owner", data: toOwnerCaseView(row) }
      : null;
  }
  if (role === "staff" && p?.kind === "user") {
    return row.kind === "found" && sameId(row.created_by_user_id, p.userId)
      ? { view: "staff_own", data: toStaffOwnCaseView(row) }
      : null;
  }
  if (role === "officer") {
    const data = toOfficerCaseView(row, ctx);
    return { view: "officer", data, contactServed: data.contact_phone !== null };
  }
  if (role === "admin") return { view: "admin", data: toAdminCaseView(row) };
  return null;
}

/* ---------- API-022 case list, API-008 queue, API-009 candidate ---------- */

export function projectCaseListFor(
  p: Principal | null,
  rows: readonly { row: CaseRow; ctx: OfficerContext }[],
  nextCursor: string | null,
): CaseListResponse | null {
  if (effectiveRole(p) !== "officer") return null;
  return caseListResponseSchema.parse({ cases: rows.map((r) => toOfficerCaseRow(r.row, r.ctx)), next_cursor: nextCursor });
}

export type QueueCandidateInput = {
  candidateId: string;
  rank: number;
  score: number;
  reasonBn: string;
  reasonEn: string;
  components: Record<string, number | null>;
  qualified: boolean;
  counterpart: CaseRow;
  counterpartCtx: OfficerContext;
};

export type QueueItemInput = { row: CaseRow; ctx: OfficerContext; candidates: readonly QueueCandidateInput[] };

// Only qualified candidates, best rank first, at most five per report (API-008).
export function projectQueueFor(
  p: Principal | null,
  items: readonly QueueItemInput[],
  nextCursor: string | null,
): ReviewQueueResponse | null {
  if (effectiveRole(p) !== "officer") return null;
  return reviewQueueResponseSchema.parse({
    items: items.map((item) => ({
      case: toOfficerCaseRow(item.row, item.ctx),
      candidates: item.candidates
        .filter((c) => c.qualified)
        .toSorted((a, b) => a.rank - b.rank)
        .slice(0, LIMITS.candidatesPerQueueItem)
        .map((c) => ({
          candidate_id: c.candidateId,
          rank: c.rank,
          score: c.score,
          reason_bn: c.reasonBn,
          reason_en: c.reasonEn,
          components: c.components,
          counterpart: toOfficerCaseRow(c.counterpart, c.counterpartCtx),
          qualified: true,
          identity_probability: false,
        })),
    })),
    next_cursor: nextCursor,
  });
}

export type CandidateInput = {
  candidateId: string;
  missing: { row: CaseRow; ctx: OfficerContext };
  found: { row: CaseRow; ctx: OfficerContext };
  score: number;
  components: Record<string, number | null>;
  explanationVersion: string;
  qualified: boolean;
};

export type CandidateReadView = { data: CandidateDecisionView; contactServed: { missing: boolean; found: boolean } };

// API-009: candidates exist only for active verified officers (BR-007). Serves both
// raw phones; the route writes contact_viewed for each endpoint flagged in contactServed.
export function projectCandidateFor(p: Principal | null, c: CandidateInput): CandidateReadView | null {
  if (effectiveRole(p) !== "officer") return null;
  const data = candidateDecisionViewSchema.parse({
    candidate_id: c.candidateId,
    missing: toOfficerCaseView(c.missing.row, c.missing.ctx),
    found: toOfficerCaseView(c.found.row, c.found.ctx),
    score: c.score,
    components: c.components,
    explanation_version: c.explanationVersion,
    qualified: c.qualified,
    identity_probability: false,
  });
  return { data, contactServed: { missing: data.missing.contact_phone !== null, found: data.found.contact_phone !== null } };
}

/* ---------- API-013 audit ---------- */

function pick(details: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(details).filter(([k]) => keys.includes(k)));
}

export type AuditedCase = { id: string; ref_code: string };
// Receives only the row index and an error ID: never the row, its values or Zod issues.
// Zod issues are never logged, and parsing never enables reportInput.
export type AuditWithheldHook = (info: { index: number; errorId: "E-021" }) => void;

// Keeps only the role's allowlisted keys. A row that still fails (unsafe stored value,
// another case's ID or ref) is withheld and counted instead of failing the response.
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

// details is jsonb: a stored null, array or scalar is withheld, never dereferenced.
function belongsTo(r: AuditRow, auditedCase: AuditedCase): boolean {
  if (!isPlainObject(r.details)) return false;
  const ref = r.details.ref_code;
  return sameId(r.case_id, auditedCase.id) && (ref === undefined || ref === auditedCase.ref_code);
}

export function projectAuditFor(
  p: Principal | null,
  auditedCase: AuditedCase,
  rows: readonly AuditRow[],
  onWithheld?: AuditWithheldHook,
): OfficerAuditResponse | AdminAuditResponse | null {
  const role = effectiveRole(p);
  let withheld = 0;
  const withhold = (index: number) => {
    withheld += 1;
    onWithheld?.({ index, errorId: "E-021" });
  };

  if (role === "officer") {
    const entries: OfficerAuditResponse["entries"] = [];
    rows.forEach((r, index) => {
      const parsed = belongsTo(r, auditedCase)
        ? officerAuditEntryViewSchema.safeParse({
            at: r.at,
            is_synthetic: r.is_synthetic,
            actor_role: r.actor_type,
            actor_id: r.actor_user_id,
            actor_display: r.actor_type === "parent" ? null : r.actor_display,
            action: r.action,
            details: { ...pick(r.details, OFFICER_AUDIT_DETAIL_KEYS), ...(r.candidate_id ? { candidate_id: r.candidate_id } : {}) },
          })
        : null;
      if (parsed?.success) entries.push(parsed.data);
      else withhold(index);
    });
    return { view: "officer", entries, withheld };
  }

  if (role === "admin") {
    const entries: AdminAuditResponse["entries"] = [];
    rows.forEach((r, index) => {
      const parsed = belongsTo(r, auditedCase)
        ? adminAuditEntryViewSchema.safeParse({
            at: r.at,
            actor_role: r.actor_type,
            action: r.action,
            details: pick(r.details, ADMIN_AUDIT_DETAIL_KEYS),
          })
        : null;
      if (parsed?.success) entries.push(parsed.data);
      else withhold(index);
    });
    return { view: "admin", entries, withheld };
  }

  return null;
}

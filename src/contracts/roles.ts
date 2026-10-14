// Server-derived principals, the D2A §9.2 permission matrix and per-role DTO
// projections (BR-007/024). There is no unrestricted CaseView: every read picks
// one explicit allowlist and parses it with a strict schema before returning.
import type { AuditEntry, Case } from "../../docs/code/fera_types_v2";
import { maskPhone } from "./primitives";
import {
  ADMIN_AUDIT_DETAIL_KEYS,
  OFFICER_AUDIT_DETAIL_KEYS,
  adminAuditResponseSchema,
  adminCaseViewSchema,
  officerAuditResponseSchema,
  candidateDecisionViewSchema,
  officerCaseViewSchema,
  ownerCaseViewSchema,
  rematchResponseSchema,
  staffOwnCaseViewSchema,
  type AdminCaseView,
  type AuditResponse,
  type CandidateDecisionView,
  type OfficerCaseView,
  type OwnerCaseView,
  type RematchResponse,
  type StaffOwnCaseView,
} from "./schemas";
import type { CaseDraft } from "./draft";
import { EDITABLE_STATUSES, statusGroup, type UserRole } from "./states";

// Mapped database row (timestamps as ISO strings). Server-only, never a response.
export type CaseRow = Omit<Case, "embedding">;

export type Principal =
  | { kind: "parent"; sessionId: string }
  | { kind: "user"; userId: string; role: UserRole; verified: boolean; isActive: boolean };

export type EffectiveRole = "parent" | "staff" | "officer" | "admin";

// Unverified officers have staff permissions; inactive accounts have none (§5.3, BR-024).
export function effectiveRole(p: Principal | null): EffectiveRole | null {
  if (!p) return null;
  if (p.kind === "parent") return "parent";
  if (!p.isActive) return null;
  if (p.role === "officer") return p.verified ? "officer" : "staff";
  return p.role;
}

export type ApiId = `API-0${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20" | "21" | "22" | "23"}`;

// D2A §9.2. "public" routes need no session. Ownership is checked separately.
export const API_ACCESS: Record<ApiId, readonly (EffectiveRole | "public")[]> = {
  "API-001": ["parent", "staff", "officer"],
  "API-002": ["parent", "staff", "officer"],
  "API-003": ["parent"],
  "API-004": ["parent", "staff", "officer", "admin"],
  "API-005": ["parent"],
  "API-006": ["parent"],
  "API-007": ["staff", "officer"],
  "API-008": ["officer"],
  "API-009": ["officer"],
  "API-010": ["officer"],
  "API-011": ["officer"],
  "API-012": ["officer", "admin"],
  "API-013": ["officer", "admin"],
  "API-014": ["officer", "admin"],
  "API-015": ["admin"],
  "API-016": ["admin"],
  "API-017": ["admin"],
  "API-018": ["parent"],
  "API-019": ["public"],
  "API-020": ["public"],
  "API-021": ["admin"],
  "API-022": ["officer"],
  "API-023": ["officer"],
};

export function canCall(api: ApiId, p: Principal | null): boolean {
  const allowed = API_ACCESS[api];
  if (allowed.includes("public")) return true;
  const role = effectiveRole(p);
  return role !== null && allowed.includes(role);
}

function draftFromRow(row: CaseRow): CaseDraft {
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
      at: row.event_at,
      at_approx: row.event_at_approx,
      at_lower: row.event_at_lower,
      at_upper: row.event_at_upper,
      place_text: row.place_text,
      district_text: null, // not persisted; district_code is authoritative
      district_code: row.district_code,
      thana: row.thana,
      circumstances: row.circumstances,
    },
    reporter: { relation: row.reporter_relation, phone: row.contact_phone },
    evidence: row.provenance,
  };
}

const ownPayloadVisible = (row: CaseRow) => row.anonymised_at === null && EDITABLE_STATUSES.includes(row.status);

export function toOwnerCaseView(row: CaseRow): OwnerCaseView {
  return ownerCaseViewSchema.parse({
    id: row.id,
    ref_code: row.ref_code,
    kind: row.kind,
    status: row.status,
    status_group: statusGroup(row.kind, row.status),
    is_synthetic: row.is_synthetic,
    version: row.version,
    editable: ownPayloadVisible(row),
    matching_state: row.matching_state,
    draft: ownPayloadVisible(row) ? draftFromRow(row) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

export function toStaffOwnCaseView(row: CaseRow): StaffOwnCaseView {
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

export type OfficerContext = { districtNameBn: string | null; duplicateOf: string[] };

export function toOfficerCaseView(row: CaseRow, ctx: OfficerContext): OfficerCaseView {
  return officerCaseViewSchema.parse({
    id: row.id,
    ref_code: row.ref_code,
    kind: row.kind,
    status: row.status,
    status_group: statusGroup(row.kind, row.status),
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
    contact_phone: row.contact_phone,
    contact_phone_masked: row.contact_phone ? maskPhone(row.contact_phone) : null,
    version: row.version,
    duplicate_of: ctx.duplicateOf,
    matching_state: row.matching_state,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

export function toAdminCaseView(row: CaseRow): AdminCaseView {
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
  | { view: "officer"; data: OfficerCaseView }
  | { view: "admin"; data: AdminCaseView };

// API-004. null means respond with E-004, identical for hidden and absent records.
export function projectCaseFor(p: Principal | null, row: CaseRow, ctx: OfficerContext): CaseReadView | null {
  const role = effectiveRole(p);
  if (role === "parent" && p?.kind === "parent") {
    return row.kind === "missing" && row.reporter_session_id === p.sessionId
      ? { view: "owner", data: toOwnerCaseView(row) }
      : null;
  }
  if (role === "staff" && p?.kind === "user") {
    return row.kind === "found" && row.created_by_user_id === p.userId
      ? { view: "staff_own", data: toStaffOwnCaseView(row) }
      : null;
  }
  if (role === "officer") return { view: "officer", data: toOfficerCaseView(row, ctx) };
  if (role === "admin") return { view: "admin", data: toAdminCaseView(row) };
  return null;
}

export type CandidateInput = {
  candidateId: string;
  missing: OfficerCaseView;
  found: OfficerCaseView;
  score: number;
  components: Record<string, number | null>;
  explanationVersion: string;
  qualified: boolean;
};

// API-009: candidates exist only for active verified officers (BR-007).
export function projectCandidateFor(p: Principal | null, c: CandidateInput): CandidateDecisionView | null {
  if (effectiveRole(p) !== "officer") return null;
  return candidateDecisionViewSchema.parse({
    candidate_id: c.candidateId,
    missing: c.missing,
    found: c.found,
    score: c.score,
    components: c.components,
    explanation_version: c.explanationVersion,
    qualified: c.qualified,
    identity_probability: false,
  });
}

export type AuditRow = Omit<AuditEntry, "id" | "request_id"> & { actor_display: string | null };

function pick(details: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(details).filter(([k]) => keys.includes(k)));
}

// API-013. Details are reduced to the role's allowlisted keys, then parsed strictly:
// a value that is not a safe token (free text, phone, name) throws, so the route
// answers E-021 rather than leak it. null means respond with E-004.
export function projectAuditFor(p: Principal | null, rows: readonly AuditRow[]): AuditResponse | null {
  const role = effectiveRole(p);
  if (role === "officer") {
    return officerAuditResponseSchema.parse({
      view: "officer",
      entries: rows.map((r) => ({
        at: r.at,
        actor_role: r.actor_type,
        actor_id: r.actor_user_id,
        actor_display: r.actor_type === "parent" ? null : r.actor_display,
        action: r.action,
        details: { ...pick(r.details, OFFICER_AUDIT_DETAIL_KEYS), ...(r.candidate_id ? { candidate_id: r.candidate_id } : {}) },
      })),
    });
  }
  if (role === "admin") {
    return adminAuditResponseSchema.parse({
      view: "admin",
      entries: rows.map((r) => ({
        at: r.at,
        actor_role: r.actor_type,
        action: r.action,
        details: pick(r.details, ADMIN_AUDIT_DETAIL_KEYS),
      })),
    });
  }
  return null;
}

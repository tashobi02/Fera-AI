// Mapped database rows (timestamps as ISO strings). Server-only, never responses.
// Hand-written from schema_v2.sql; a compile-time test keeps them equal to the
// fera_types_v2.ts companion. Runtime code never imports the companion.
import type { EvidenceSpan } from "../draft";
import type { IsoDateTime, Uuid } from "../primitives";
import type { ActorType, CaseKind, CaseSource, CaseStatus, MatchingState, Outcome, Sex, UserRole } from "../states";

export interface CaseRow {
  id: Uuid;
  ref_code: string;
  kind: CaseKind;
  status: CaseStatus;
  source: CaseSource;
  source_url: string | null;
  is_synthetic: boolean;
  reporter_session_id: Uuid | null;
  created_by_user_id: Uuid | null;
  raw_text: string | null;
  child_name: string | null;
  child_name_latin: string | null;
  age_years: number | null;
  age_min: number | null;
  age_max: number | null;
  sex: Sex;
  height_cm: number | null;
  clothing: string | null;
  marks: string | null;
  circumstances: string | null;
  event_at: IsoDateTime | null;
  event_at_approx: boolean;
  event_at_lower: IsoDateTime | null;
  event_at_upper: IsoDateTime | null;
  provenance: Record<string, EvidenceSpan>;
  embedding_model: string | null;
  embedding_revision: string | null;
  embedding_space: string | null;
  matching_state: MatchingState;
  matched_at: IsoDateTime | null;
  match_error_id: string | null;
  place_text: string | null;
  district_code: number | null;
  thana: string | null;
  reporter_relation: string | null;
  contact_phone: string | null;
  gd_number: string | null;
  client_submission_id: Uuid | null;
  submission_payload_hash: string | null;
  input_hash: string | null;
  version: number;
  outcome: Outcome | null;
  outcome_note: string | null;
  closed_at: IsoDateTime | null;
  anonymised_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface UserRow {
  id: Uuid;
  role: UserRole;
  verified: boolean;
  is_active: boolean;
}

export interface ParentSessionRow {
  id: Uuid;
  expires_at: IsoDateTime;
  revoked_at: IsoDateTime | null;
}

// audit_log row joined with the actor's users.display_name.
export interface AuditRow {
  at: IsoDateTime;
  is_synthetic: boolean;
  actor_type: ActorType;
  actor_user_id: Uuid | null;
  actor_session_id: Uuid | null;
  actor_display: string | null;
  action: string;
  case_id: Uuid | null;
  candidate_id: Uuid | null;
  details: Record<string, unknown>;
}

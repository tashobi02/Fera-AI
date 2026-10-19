// Fera shared types V2.0 - D5 section 6. Exact companion of the V2 embedded block.
// Authors: Sadman Shaharier; Obidit Islam. 11 October 2026, Asia/Dhaka.
// Registry records (suite IDs) + domain records (D2 schema) + AI/API contracts (D2 §2, §5).

/* ---------- Shared primitives ---------- */
export type Uuid = string;
export type IsoDateTime = string; // ISO 8601 with +06:00
export type MoSCoW = "Must" | "Should" | "Could" | "Won't";
export type DocId = "00" | "D1" | "D2A" | "D2B" | "D3" | "D4" | "D6" | "D7";
export type Level = "L" | "M" | "H" | "Severe";
export type Role = "parent" | "staff" | "officer" | "admin";
export type AuthLabel = Role | "public";
export type Owner = "S" | "O" | "M";

/* ---------- Registry records ---------- */
export interface RegistryRecord {
  id: string;
  label: string;
  definedIn: DocId;
}
export interface Goal extends RegistryRecord {
  id: `GOAL-${string}`;
  metric: string;
  target: string;
  method: string;
  timeframe: string;
}
export interface Persona extends RegistryRecord {
  id: `PERSONA-${string}`;
  priority: MoSCoW;
}
export interface Story extends RegistryRecord {
  id: `STORY-${string}`;
  priority: MoSCoW;
  acceptance: string[];
  dependencyIds: string[];
  screenIds: string[];
}
export interface FunctionalRequirement extends RegistryRecord {
  id: `FR-${string}`;
  priority: MoSCoW;
  storyIds: string[];
  testIds: string[];
  mock: boolean;
}
export interface NonFunctionalRequirement extends RegistryRecord {
  id: `NFR-${string}`;
  category: string;
  measure: string;
}
export interface BusinessRule extends RegistryRecord {
  id: `BR-${string}`;
  safeguarding: boolean;
  frIds: string[];
  testIds: string[];
}
export interface Assumption extends RegistryRecord {
  id: `A-${string}`;
}
export interface Dependency extends RegistryRecord {
  id: `DEP-${string}`;
  owner: string;
  neededBy: string;
}
export interface Risk extends RegistryRecord {
  id: `RISK-${string}`;
  likelihood: Level;
  impact: Level;
  mitigation: string;
  owner: string;
}
export interface OpenQuestion extends RegistryRecord {
  id: `OQ-${string}`;
  defaultApplied: string | null;
  answeredBy: string;
  dueBy: string;
}
export interface Screen extends RegistryRecord {
  id: `SCREEN-${string}`;
  priority: MoSCoW;
  roles: Role[];
}
export interface Component extends RegistryRecord {
  id: `COMP-${string}`;
  layer: "server" | "client" | "ui";
}
export interface ApiEndpoint extends RegistryRecord {
  id: `API-${string}`;
  method: "GET" | "POST" | "PATCH" | "*";
  path: string;
  auth: AuthLabel[];
  priority: MoSCoW;
}
export interface EntityRecord extends RegistryRecord {
  id: `ENTITY-${string}`;
  table: string;
}
export interface Decision extends RegistryRecord {
  id: `DECISION-${string}`;
}
export interface TestCase extends RegistryRecord {
  id: `TC-${string}`;
  covers: string[];
  steps: string[];
  passIf: string;
}
export interface Task extends RegistryRecord {
  id: `TASK-${string}`;
  priority: MoSCoW;
  owners: Owner[];
  dependsOn: string[];
  hours: number;
  criticalPath: boolean;
}
export interface ErrorCode extends RegistryRecord {
  id: `E-${string}`;
  key: string;
  http: number | null;
  messageBn: string;
  messageEn: string;
}
export interface FlowAction extends RegistryRecord {
  id: `ACT-${string}`;
  roles: Role[];
}
export interface FlowDecision extends RegistryRecord {
  id: `D-${string}`;
}
export interface TraceLink {
  from: string;
  to: string;
  kind: "goal-story" | "story-fr" | "fr-screen" | "fr-test" | "br-fr" | "br-test" | "fr-task";
}

/* ---------- Domain enums (D2 §7) ---------- */
export type MatchingState = "queued" | "running" | "complete" | "failed";
export type MissingStatus = "submitted" | "open" | "matched_pending_review" | "confirmed" | "closed";
export type FoundStatus = "open" | "matched_pending_review" | "referred";
export type CaseKind = "missing" | "found";
export type CaseStatus = "submitted" | "open" | "matched_pending_review" | "confirmed" | "closed" | "referred";
export type StatusGroup = "open" | "matched" | "closed";
export type Sex = "male" | "female" | "other" | "unknown";
export type CaseSource = "parent" | "staff" | "public_import" | "synthetic";
export type UserRole = "staff" | "officer" | "admin";
export type CandidateStatus = "pending" | "confirmed" | "rejected" | "voided" | "superseded";
export type DecisionType = "confirm" | "reject";
export type Outcome = "coordination_recorded" | "resolved_outside_fera";
export type DuplicateStatus = "flagged" | "confirmed_same" | "dismissed";
export type OutputType = "gd" | "poster" | "helpline";
export type ActorType = "parent" | "staff" | "officer" | "admin" | "system";

/* ---------- Domain records (one per table) ---------- */
export interface User { // ENTITY-001
  id: Uuid;
  username: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  verified: boolean;
  district_code: number | null;
  is_active: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}
export interface ParentSession { // ENTITY-002
  id: Uuid;
  created_at: IsoDateTime;
  last_seen_at: IsoDateTime;
  expires_at: IsoDateTime;
  revoked_at: IsoDateTime | null;
}
export interface Case { // ENTITY-003
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
  embedding: number[] | null;
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
export interface CaseVersion { // ENTITY-004
  id: Uuid;
  case_id: Uuid;
  version: number;
  snapshot: Record<string, unknown> | null;
  edited_by: ActorType;
  edited_at: IsoDateTime;
}
export interface MatchCandidate { // ENTITY-005
  id: Uuid;
  missing_case_id: Uuid;
  found_case_id: Uuid;
  missing_version: number;
  found_version: number;
  score: number;
  rank: number;
  reason_bn: string;
  reason_en: string;
  components: MatchComponents;
  status: CandidateStatus;
  created_at: IsoDateTime;
  decided_at: IsoDateTime | null;
}
export interface MatchComponents {
  cosine: number;
  name: number;
  clothing: number;
  district: number;
  age: number;
}
export interface ReviewDecision { // ENTITY-006
  id: Uuid;
  candidate_id: Uuid;
  officer_id: Uuid;
  decision: DecisionType;
  officer_verified_at_decision: true;
  reason: string | null;
  decided_at: IsoDateTime;
}
export interface Referral { // ENTITY-007
  id: Uuid;
  candidate_id: Uuid;
  found_case_id: Uuid;
  missing_case_id: Uuid;
  agency_name: string;
  referred_by: Uuid;
  referred_at: IsoDateTime;
  record_state: "recorded";
  is_simulated: true;
  note: string | null;
}
export interface DuplicateLink { // ENTITY-008
  id: Uuid;
  case_a: Uuid;
  case_b: Uuid;
  score: number;
  rule: "profile" | "same_phone";
  status: DuplicateStatus;
  created_at: IsoDateTime;
  resolved_by: Uuid | null;
  resolved_at: IsoDateTime | null;
  reason: string | null;
}
export interface AuditEntry { // ENTITY-009
  id: number;
  at: IsoDateTime;
  is_synthetic: boolean;
  actor_type: ActorType;
  actor_user_id: Uuid | null;
  actor_session_id: Uuid | null;
  action: string;
  case_id: Uuid | null;
  candidate_id: Uuid | null;
  details: Record<string, unknown>;
  request_id: string | null;
}
export interface District { // ENTITY-010
  code: number;
  name_en: string;
  name_bn: string;
  division_en: string;
  lat: number;
  lng: number;
}
export interface DistrictNeighbour { // ENTITY-011
  district_code: number;
  neighbour_code: number;
}
export interface GeneratedOutput { // ENTITY-012
  id: Uuid;
  case_id: Uuid;
  type: OutputType;
  text_bn: string | null;
  case_version: number;
  created_at: IsoDateTime;
}
export interface AiCall { // ENTITY-013
  id: number;
  at: IsoDateTime;
  draft_id: Uuid | null;
  case_id: Uuid | null;
  reservation_id: Uuid | null;
  request_id: string | null;
  operation: "transcribe" | "extract" | "embed";
  provider: string;
  model: string;
  duration_ms: number;
  input_units: number | null;
  output_units: number | null;
  est_cost_usd: number;
  cache_hit: boolean;
  ok: boolean;
  error_id: string | null;
}
export interface RateLimitBucket { // ENTITY-014
  key: string;
  window_start: IsoDateTime;
  count: number;
}

// New V2 metadata entities; these store no child text or audio before submission.
export interface IntakeDraft { // ENTITY-015
  id: Uuid;
  session_id: Uuid | null;
  user_id: Uuid | null;
  kind: CaseKind;
  created_at: IsoDateTime;
  expires_at: IsoDateTime;
  payload_hash: string | null;
  ai_calls_used: number;
  revision: number;
}
export interface AiBudget { // ENTITY-016
  id: true;
  cap_usd: number;
  committed_usd: number;
  reserved_usd: number;
}
export interface AiReservation { // ENTITY-017
  id: Uuid;
  draft_id: Uuid | null;
  reserved_usd: number;
  actual_usd: number | null;
  state: "reserved" | "settled";
  created_at: IsoDateTime;
  settled_at: IsoDateTime | null;
}
export interface EvidenceSpan {
  quote: string;
  start_utf16: number;
  end_utf16: number;
  derivation: "direct" | "digits" | "time_interval" | "district_mapping" | "romanisation";
}

/* ---------- AI adapter contracts (D2 §2.1–§2.3) ---------- */
export interface ExtractInput {
  kind: CaseKind;
  sourceText: string; // reviewed raw transcript/text; evidence quotes refer to this
  normalisedText: string; // deterministic normalisation; preserve span mapping
  nowIso: IsoDateTime;
}
export interface ExtractOutput {
  child: {
    name: string | null;
    age_years: number | null;
    age_min: number | null;
    age_max: number | null;
    sex: Sex;
    height_cm: number | null;
    clothing: string | null;
    marks: string | null;
  };
  event: {
    at: IsoDateTime | null;
    at_approx: boolean;
    at_lower: IsoDateTime | null;
    at_upper: IsoDateTime | null;
    place_text: string | null;
    district_text: string | null;
    thana: string | null;
    circumstances: string | null;
  };
  reporter: { relation: string | null; phone: string | null };
  evidence: Record<string, EvidenceSpan>;
}
export interface LLMProvider {
  readonly id: "gemini" | "openai" | "claude";
  extractCase(input: ExtractInput): Promise<ExtractOutput>;
}
export interface SpeechProvider {
  readonly id: "whisper" | "cache";
  transcribe(audio: Uint8Array, mime: string, langHint: "bn"): Promise<{ text: string; durationS: number }>;
}
export interface EmbeddingProvider {
  readonly id: "local" | "api";
  readonly dim: 384;
  embed(texts: string[]): Promise<number[][]>;
}

/* ---------- API shapes (D2 §5) ---------- */
export interface CaseDraft extends ExtractOutput {
  kind: CaseKind;
  source_text: string; // browser payload; persist only after explicit report confirmation
  child: ExtractOutput["child"] & { name_latin: string | null };
  event: ExtractOutput["event"] & { district_code: number | null };
}
// Narrow DTOs, not ORM rows. Server projections are explicit allowlists.
export interface OwnerCaseView {
  id: Uuid; ref_code: string; kind: "missing"; status: MissingStatus;
  status_group: StatusGroup; is_synthetic: true; version: number;
  editable: boolean; matching_state: MatchingState;
  draft: CaseDraft | null; // own editable report only; null after terminal lock/redaction
  created_at: IsoDateTime; updated_at: IsoDateTime;
}
export interface StaffOwnCaseView {
  id: Uuid; ref_code: string; kind: "found"; status: FoundStatus;
  is_synthetic: true; version: number; matching_state: MatchingState;
  draft: CaseDraft | null; created_at: IsoDateTime;
}
export interface AdminCaseView {
  id: Uuid; ref_code: string; kind: CaseKind; status: CaseStatus;
  district_code: number | null; is_synthetic: true;
  anonymised_at: IsoDateTime | null;
  // No child payload, contact, candidate IDs/scores, or free-text notes.
}
export interface OfficerCaseView {
  id: Uuid;
  ref_code: string;
  kind: CaseKind;
  status: CaseStatus;
  status_group: StatusGroup;
  is_synthetic: boolean;
  source: CaseSource;
  source_url: string | null;
  child: {
    name: string | null;
    age_years: number | null;
    age_min: number | null;
    age_max: number | null;
    sex: Sex;
    height_cm: number | null;
    clothing: string | null;
    marks: string | null;
  };
  event: {
    at: IsoDateTime | null;
    at_approx: boolean;
    at_lower: IsoDateTime | null;
    at_upper: IsoDateTime | null;
    place_text: string | null;
    district_code: number | null;
    district_name_bn: string | null;
    thana: string | null;
  };
  contact_phone: string | null; // verified officer projection only; never logged
  contact_phone_masked: string | null;
  version: number;
  duplicate_of: { id: Uuid; ref: string; status: CaseStatus }[]; // officer-only drill-through cues
  matching_state: MatchingState;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}
export interface NextQuestion {
  field: string;
  bn: string;
  en: string;
}
export interface ExtractResponse {
  draft_token: string; // opaque signed draft/principal/expiry binding; usage is server-owned
  draft_id: Uuid;
  draft_revision: number;
  expires_at: IsoDateTime;
  draft: CaseDraft;
  missing_fields: string[];
  next_question: NextQuestion | null;
  ai_calls_used: number;
  cached: boolean;
}
export interface TranscribeResponse {
  draft_token: string;
  draft_id: Uuid;
  ai_calls_used: number;
  transcript: string;
  language: "bn" | "mixed";
  duration_s: number;
  cached: boolean;
}
export interface OutputResponse {
  type: OutputType;
  text_bn: string;
  label_bn: string;
  word_count: number;
  generated_at: IsoDateTime;
}
export type DecisionRequest =
  | { decision: "reject"; reason: string; expected_missing_version: number; expected_found_version: number }
  | { decision: "confirm"; reason?: string; agency_name?: string;
      expected_missing_version: number; expected_found_version: number;
      reviewer_checklist: { descriptions_reviewed: true; contradictions_reviewed: true;
        identity_not_proven_by_score: true; referral_is_simulated: true } };
export interface DecisionResponse {
  candidate_status: CandidateStatus;
  missing: { ref_code: string; status: CaseStatus };
  found: { ref_code: string; status: CaseStatus };
  referral_id: Uuid | null;
  referral_state: "recorded" | null;
  referral_is_simulated: true;
}
export interface ReportCounts { open: number; matched: number; closed: number; }
export interface DistrictStats {
  code: number; name_bn: string; name_en: string; lat: number; lng: number;
  missing_reports: ReportCounts;
  found_reports: { open: number; matched: number; referral_recorded: number };
  confirmed_pairs: number;
}
export interface DashboardStatsResponse {
  generated_at: IsoDateTime;
  counting_basis: "report_rows_separated_by_kind";
  totals: { missing_reports: ReportCounts;
    found_reports: { open: number; matched: number; referral_recorded: number };
    confirmed_pairs: number };
  districts: DistrictStats[];
}
export interface CreateMissingRequest {
  draft: CaseDraft & { kind: "missing" };
  confirmed: true;
  client_submission_id: Uuid;
  draft_token?: string; // absent for manual form; paid extraction requires its own token
}
export interface CandidateDecisionView {
  candidate_id: Uuid; missing: OfficerCaseView; found: OfficerCaseView;
  score: number; components: Record<string, number | null>; explanation_version: string;
  qualified: boolean; identity_probability: false;
}
export interface DuplicateDecisionRequest {
  status: "confirmed_same" | "dismissed";
  reason: string;
  profile_evidence_reviewed: true;
}
export interface RematchResponse {
  case_id: Uuid; matching_state: MatchingState;
  // Admin gets this status-only shape. Officer reads candidates via API-008/009.
}

export interface ErrorEnvelope {
  error: {
    id: string;
    key: string;
    message_bn: string;
    message_en: string;
    retryable: boolean;
    fallback?: "manual_form";
  };
}

export type TypedCaseRecord =
  | (Case & { kind: "missing"; status: MissingStatus })
  | (Case & { kind: "found"; status: FoundStatus });
// Uuid/IsoDateTime and number ranges need runtime validation. pg numeric/bigint/Date
// values must be explicitly mapped before returning these DTOs.

// Report creation and owner edits (TASK-015, COMP-014; API-003/005/007; FR-029/031;
// BR-004/015/016/019/024/025; TC-018/031/042).
//
// - Inputs are the *parsed* contract requests (createMissingRequestSchema etc.); the
//   route parses, the service never sees raw bodies. Owner, source, synthetic flag and
//   initial status are server-derived; nothing in the body can set them.
// - Idempotency (FR-031): key = principal scope + client_submission_id, decided by the
//   contracts' classifySubmission() on the canonical submissionPayloadHash() of the
//   parsed draft. Same key + same hash → the same report (replayed: true); same key +
//   different hash → E-006; a new key → a new report. The insert is ON CONFLICT DO
//   NOTHING on the scoped unique key, so a concurrent identical submit waits for the
//   first, then replays it (TC-042).
// - Every accepted write and its audit row commit together.
import { randomInt } from "node:crypto";
import { ApiError } from "@/app/api/_shared/envelope";
import {
  DRAFT_FIELD_PATHS,
  EDIT_LOCKED_STATUSES,
  REF_PREFIX,
  isUuid,
  sameId,
  type CaseKind,
  type CreateFoundRequest,
  type CreateMissingRequest,
  type DraftFieldPath,
  type FoundSubmissionDraft,
  type MissingSubmissionDraft,
  type UpdateCaseRequest,
} from "@/contracts";
import {
  classifySubmission,
  effectiveRole,
  submissionPayloadHash,
  submissionScopeFor,
  type ApiId,
  type CaseRow,
  type Principal,
  type SubmissionKey,
} from "@/contracts/server";
import { CASE_AUDIT_ACTIONS, actorFor, appendAudit, type AuditActor } from "@/server/audit";
import type { Queryable } from "@/server/db/queryable";
import { SQLSTATE, mapInsertError, refusalFacts, sqlstateOf } from "./errors";
import { lockNeighbourhood } from "./lock";
import { CASE_COLUMNS, getCaseRow, mapCaseRow } from "./rows";
import { voidPendingCandidates } from "./candidates";
import { auditRefusals } from "./refused";
import { assertTransition, reconcileQueueState, txOptions, type ServiceContext } from "./state";
import { withTransaction } from "./tx";

export type CreateResult = { case: CaseRow; replayed: boolean };

/* ---------- column mapping ---------- */

type SubmissionDraft = MissingSubmissionDraft | FoundSubmissionDraft;

// Reviewed draft → cases columns. district_text has no column (CN-06); an empty
// source text (manual form) is stored as NULL.
export function draftColumns(d: SubmissionDraft) {
  return {
    raw_text: d.source_text === "" ? null : d.source_text,
    child_name: d.child.name,
    child_name_latin: d.child.name_latin,
    age_years: d.child.age_years,
    age_min: d.child.age_min,
    age_max: d.child.age_max,
    sex: d.child.sex,
    height_cm: d.child.height_cm,
    clothing: d.child.clothing,
    marks: d.child.marks,
    circumstances: d.event.circumstances,
    event_at: d.event.at,
    event_at_approx: d.event.at_approx,
    event_at_lower: d.event.at_lower,
    event_at_upper: d.event.at_upper,
    place_text: d.event.place_text,
    district_code: d.event.district_code,
    thana: d.event.thana,
    reporter_relation: d.reporter.relation,
    contact_phone: d.reporter.phone,
    provenance: JSON.stringify(d.evidence),
  };
}
type DraftColumns = { [K in keyof ReturnType<typeof draftColumns>]: ReturnType<typeof draftColumns>[K] | null };

// Stored row → the comparable reviewed values (provenance as a JSON string).
function rowColumns(row: CaseRow): DraftColumns {
  return {
    raw_text: row.raw_text,
    child_name: row.child_name,
    child_name_latin: row.child_name_latin,
    age_years: row.age_years,
    age_min: row.age_min,
    age_max: row.age_max,
    sex: row.sex,
    height_cm: row.height_cm,
    clothing: row.clothing,
    marks: row.marks,
    circumstances: row.circumstances,
    event_at: row.event_at,
    event_at_approx: row.event_at_approx,
    event_at_lower: row.event_at_lower,
    event_at_upper: row.event_at_upper,
    place_text: row.place_text,
    district_code: row.district_code,
    thana: row.thana,
    reporter_relation: row.reporter_relation,
    contact_phone: row.contact_phone,
    provenance: JSON.stringify(row.provenance),
  };
}

// Column → draft field path for the audit's fields_changed (paths only, never values).
const FIELD_PATH: Partial<Record<keyof DraftColumns, DraftFieldPath>> = {
  child_name: "child.name",
  child_name_latin: "child.name_latin",
  age_years: "child.age_years",
  age_min: "child.age_min",
  age_max: "child.age_max",
  sex: "child.sex",
  height_cm: "child.height_cm",
  clothing: "child.clothing",
  marks: "child.marks",
  circumstances: "event.circumstances",
  event_at: "event.at",
  event_at_lower: "event.at_lower",
  event_at_upper: "event.at_upper",
  place_text: "event.place_text",
  district_code: "event.district_code",
  thana: "event.thana",
  reporter_relation: "reporter.relation",
  contact_phone: "reporter.phone",
};

const sameInstant = (a: unknown, b: unknown) =>
  typeof a === "string" && typeof b === "string" ? Date.parse(a) === Date.parse(b) : a === b;

// Draft field paths whose reviewed value changed, in DRAFT_FIELD_PATHS order.
export function changedFields(row: CaseRow, draft: SubmissionDraft): DraftFieldPath[] {
  const before = rowColumns(row);
  const after = draftColumns(draft);
  const changed = new Set<DraftFieldPath>();
  for (const [col, path] of Object.entries(FIELD_PATH) as [keyof DraftColumns, DraftFieldPath][]) {
    const isTime = col === "event_at" || col === "event_at_lower" || col === "event_at_upper";
    if (isTime ? !sameInstant(before[col], after[col]) : before[col] !== after[col]) changed.add(path);
  }
  return DRAFT_FIELD_PATHS.filter((p) => changed.has(p));
}

/* ---------- reference codes ---------- */

const REF_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// M-/F- plus six characters from [0-9A-Z] (cases CHECK). Random, not derived from the child.
export function newRefCode(kind: CaseKind): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `${REF_PREFIX[kind]}${suffix}`;
}

const REF_ATTEMPTS = 5;

/* ---------- create ---------- */

type CreateSpec = {
  kind: CaseKind;
  api: ApiId;
  principal: Principal;
  scopeColumn: "reporter_session_id" | "created_by_user_id";
  ownerId: string;
  source: "parent" | "staff";
  status: "submitted" | "open";
  clientSubmissionId: string;
  draft: SubmissionDraft;
  key: SubmissionKey;
  ctx: ServiceContext;
};

async function existingSubmission(db: Queryable, spec: CreateSpec): Promise<CaseRow | null> {
  const { rows } = await db.query(
    `SELECT ${CASE_COLUMNS} FROM cases WHERE ${spec.scopeColumn} = $1 AND client_submission_id = $2`,
    [spec.ownerId, spec.clientSubmissionId],
  );
  return rows.length === 0 ? null : mapCaseRow(rows[0]);
}

async function replayOrConflict(db: Queryable, actor: AuditActor, spec: CreateSpec, existing: CaseRow, hash: string): Promise<CreateResult> {
  // No stored hash (only after redaction, which also clears the key): the payload cannot
  // be proven identical, so it is a conflict, never a second report (OD-015-4).
  if (existing.submission_payload_hash === null) throw new ApiError("E-006");
  const outcome = classifySubmission(
    spec.key,
    { ...spec.key, caseId: existing.id, payloadHash: existing.submission_payload_hash },
    hash,
  );
  if (outcome.kind !== "replay") throw new ApiError("E-006");
  await appendAudit(db, actor, {
    action: CASE_AUDIT_ACTIONS.caseSubmissionReplayed,
    caseId: existing.id,
    requestId: spec.ctx.requestId,
    details: { ref_code: existing.ref_code, version: existing.version, api: spec.api, replayed: true },
  });
  return { case: existing, replayed: true };
}

async function insertReport(db: Queryable, spec: CreateSpec, hash: string): Promise<CaseRow | null> {
  const cols = draftColumns(spec.draft);
  for (let attempt = 1; attempt <= REF_ATTEMPTS; attempt++) {
    const ref = newRefCode(spec.kind);
    await db.query("SAVEPOINT case_insert");
    let rows: unknown[];
    try {
      ({ rows } = await db.query(
        `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, ${spec.scopeColumn}, client_submission_id,
           submission_payload_hash, raw_text, child_name, child_name_latin, age_years, age_min, age_max, sex,
           height_cm, clothing, marks, circumstances, event_at, event_at_approx, event_at_lower, event_at_upper,
           place_text, district_code, thana, reporter_relation, contact_phone, provenance)
         VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
           $19, $20, $21, $22, $23, $24, $25, $26, $27, $28::jsonb)
         ON CONFLICT (${spec.scopeColumn}, client_submission_id) DO NOTHING
         RETURNING ${CASE_COLUMNS}`,
        [
          ref, spec.kind, spec.status, spec.source, spec.ownerId, spec.clientSubmissionId, hash,
          cols.raw_text, cols.child_name, cols.child_name_latin, cols.age_years, cols.age_min, cols.age_max, cols.sex,
          cols.height_cm, cols.clothing, cols.marks, cols.circumstances, cols.event_at, cols.event_at_approx,
          cols.event_at_lower, cols.event_at_upper, cols.place_text, cols.district_code, cols.thana,
          cols.reporter_relation, cols.contact_phone, cols.provenance,
        ],
      ));
    } catch (err) {
      // A failed ROLLBACK TO SAVEPOINT must not hide the insert error: the whole
      // transaction is rolled back by withTransaction anyway.
      const recovered = await db.query("ROLLBACK TO SAVEPOINT case_insert").then(() => true, () => false);
      const refCollision = sqlstateOf(err) === SQLSTATE.uniqueViolation && refusalFacts(err).constraint === "cases_ref_code_key";
      if (recovered && refCollision && attempt < REF_ATTEMPTS) continue;
      throw mapInsertError(err);
    }
    await db.query("RELEASE SAVEPOINT case_insert");
    return rows.length === 0 ? null : mapCaseRow(rows[0]);
  }
  throw new Error("reference code attempts exhausted");
}

async function createReport(spec: CreateSpec): Promise<CreateResult> {
  const hash = submissionPayloadHash(spec.draft);
  const actor = actorFor(spec.principal);
  return withTransaction(async (client) => {
    const existing = await existingSubmission(client, spec);
    if (existing) return replayOrConflict(client, actor, spec, existing, hash);
    classifySubmission(spec.key, null, hash); // validates the hash shape
    const inserted = await insertReport(client, spec, hash);
    if (!inserted) {
      // A concurrent submit with the same key committed first: classify against it.
      const winner = await existingSubmission(client, spec);
      if (!winner) throw new ApiError("E-005");
      return replayOrConflict(client, actor, spec, winner, hash);
    }
    await appendAudit(client, actor, {
      action: CASE_AUDIT_ACTIONS.caseCreated,
      caseId: inserted.id,
      requestId: spec.ctx.requestId,
      details: { ref_code: inserted.ref_code, version: inserted.version, to_status: inserted.status, api: spec.api, replayed: false },
    });
    return { case: inserted, replayed: false };
  }, txOptions(spec.ctx));
}

// API-003: a parent's reviewed missing report, stored as `submitted` (BR-012). The route
// then embeds and runs duplicate checks, calls openCase(), and queues matching.
export async function createMissingCase(
  principal: Principal,
  request: CreateMissingRequest,
  ctx: ServiceContext = {},
): Promise<CreateResult> {
  // An unconfirmed or wrong-kind body is invalid input (E-001), not a denial.
  if (request.confirmed !== true || request.draft.kind !== "missing") throw new ApiError("E-001");
  const scope = submissionScopeFor(principal);
  if (scope?.principal !== "parent_session") throw new ApiError("E-003");
  return createReport({
    kind: "missing",
    api: "API-003",
    principal,
    scopeColumn: "reporter_session_id",
    ownerId: scope.sessionId,
    source: "parent",
    status: "submitted",
    clientSubmissionId: request.client_submission_id,
    draft: request.draft,
    key: { scope, clientSubmissionId: request.client_submission_id },
    ctx,
  });
}

// API-007: a staff member's or officer's (verified or not) reviewed found report,
// stored as `open` (BR-013). Owner = the server-derived user ID.
export async function createFoundCase(
  principal: Principal,
  request: CreateFoundRequest,
  ctx: ServiceContext = {},
): Promise<CreateResult> {
  if (request.confirmed !== true || request.draft.kind !== "found") throw new ApiError("E-001");
  const scope = submissionScopeFor(principal);
  if (scope?.principal !== "user") throw new ApiError("E-003");
  return createReport({
    kind: "found",
    api: "API-007",
    principal,
    scopeColumn: "created_by_user_id",
    ownerId: scope.userId,
    source: "staff",
    status: "open",
    clientSubmissionId: request.client_submission_id,
    draft: request.draft,
    key: { scope, clientSubmissionId: request.client_submission_id },
    ctx,
  });
}

/* ---------- owner edit (API-005, BR-025) ---------- */

// The reviewed payload of the version being replaced (case_versions.snapshot). Cleared
// by redact_case(); never served to anyone but through an owner-scoped projection.
function snapshotOf(row: CaseRow) {
  const cols = rowColumns(row);
  return { ...cols, provenance: row.provenance };
}


// Owner edit: lock, verify editable state and version, snapshot the old reviewed
// payload, write the new one with version + 1, void the report's pending candidates,
// return it and its counterparts to the right queue state, and queue rematching
// (matching_state = queued, embedding cleared: the matcher re-embeds). Terminal and
// redacted reports → E-018; a stale expected_version → E-005.
// OD-3: submission_payload_hash keeps the original submission's hash (fera_app cannot
// update it), so a late replay of the first submit still replays the same report.
export async function editMissingCase(
  principal: Principal,
  caseId: string,
  request: UpdateCaseRequest,
  ctx: ServiceContext = {},
): Promise<CaseRow> {
  if (request.confirmed !== true) throw new ApiError("E-001"); // invalid input, not a denial
  if (effectiveRole(principal) !== "parent" || principal.kind !== "parent" || !isUuid(caseId)) throw new ApiError("E-004");
  const actor = actorFor(principal);
  const sessionId = principal.sessionId;
  const target = { action: CASE_AUDIT_ACTIONS.caseEditRefused, api: "API-005" as const, caseId };
  return auditRefusals(principal, ctx, target, () => withTransaction(async (client) => {
    const peek = await getCaseRow(client, caseId);
    if (!peek) throw new ApiError("E-004");
    if (peek.kind !== "missing" || !sameId(peek.reporter_session_id, principal.sessionId)) {
      throw new ApiError("E-004", { caseId: peek.id });
    }
    const { cases, pending } = await lockNeighbourhood(client, [peek.id]);
    const row = cases.get(peek.id);
    // Ownership rechecked on the locked row.
    if (!row || row.kind !== "missing" || !sameId(row.reporter_session_id, sessionId)) throw new ApiError("E-004", { caseId: peek.id });
    if (row.anonymised_at !== null || EDIT_LOCKED_STATUSES.includes(row.status)) throw new ApiError("E-018");
    if (row.version !== request.expected_version) throw new ApiError("E-005");

    const fields = changedFields(row, request.draft);
    await client.query(
      "INSERT INTO case_versions (case_id, version, snapshot, edited_by) VALUES ($1, $2, $3::jsonb, $4)",
      [row.id, row.version, JSON.stringify(snapshotOf(row)), actor.type],
    );
    await voidPendingCandidates(client, actor, pending, new Set([row.id]), "API-005", ctx.requestId);

    const nextStatus = row.status === "matched_pending_review" ? "open" : row.status;
    if (nextStatus !== row.status) assertTransition(row.kind, row.status, nextStatus);
    const cols = draftColumns(request.draft);
    const { rows } = await client.query(
      `UPDATE cases SET raw_text = $2, child_name = $3, child_name_latin = $4, age_years = $5, age_min = $6,
         age_max = $7, sex = $8, height_cm = $9, clothing = $10, marks = $11, circumstances = $12, event_at = $13,
         event_at_approx = $14, event_at_lower = $15, event_at_upper = $16, place_text = $17, district_code = $18,
         thana = $19, reporter_relation = $20, contact_phone = $21, provenance = $22::jsonb,
         version = version + 1, status = $23::case_status,
         matching_state = 'queued', matched_at = NULL, match_error_id = NULL,
         embedding = NULL, embedding_model = NULL, embedding_revision = NULL, embedding_space = NULL
       WHERE id = $1 AND version = $24 RETURNING ${CASE_COLUMNS}`,
      [
        row.id, cols.raw_text, cols.child_name, cols.child_name_latin, cols.age_years, cols.age_min, cols.age_max,
        cols.sex, cols.height_cm, cols.clothing, cols.marks, cols.circumstances, cols.event_at, cols.event_at_approx,
        cols.event_at_lower, cols.event_at_upper, cols.place_text, cols.district_code, cols.thana,
        cols.reporter_relation, cols.contact_phone, cols.provenance, nextStatus, row.version,
      ],
    );
    if (rows.length === 0) throw new ApiError("E-005");
    const updated = mapCaseRow(rows[0]);
    await appendAudit(client, actor, {
      action: CASE_AUDIT_ACTIONS.caseEdited,
      caseId: row.id,
      requestId: ctx.requestId,
      details: {
        ref_code: row.ref_code,
        version: updated.version,
        api: "API-005",
        ...(fields.length > 0 ? { fields_changed: fields } : {}),
        ...(nextStatus !== row.status ? { from_status: row.status, to_status: nextStatus } : {}),
      },
    });
    const others = pending.map((c) => (c.missing_case_id === row.id ? c.found_case_id : c.missing_case_id));
    await reconcileQueueState(client, actor, others, { api: "API-005", requestId: ctx.requestId });
    return updated;
  }, txOptions(ctx)));
}

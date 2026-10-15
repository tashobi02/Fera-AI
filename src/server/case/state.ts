// State guard (TASK-015, COMP-014; BR-012/013). The app-level guard mirrors
// enforce_case_transition() through the contracts' isLegalTransition(); the trigger
// stays the final authority, and its check_violation becomes E-005 with a rollback
// (errors.ts, tx.ts). Every status change writes an audit row in the same transaction.
import { ApiError } from "@/app/api/_shared/envelope";
import { isLegalTransition, sameId, type CaseKind, type CaseStatus, type Outcome } from "@/contracts";
import { effectiveRole, type ApiId, type CaseRow, type Principal } from "@/contracts/server";
import { CASE_AUDIT_ACTIONS, SYSTEM_ACTOR, appendAudit, type AuditActor, type AuditDetails, type CaseAuditAction } from "@/server/audit";
import { lockCases } from "./lock";
import { CASE_COLUMNS, getCaseRow, isQueueStatus, mapCaseRow, pendingCandidatesFor } from "./rows";
import type { Queryable } from "@/server/db/queryable";
import { withTransaction, type Connectable, type TxOptions } from "./tx";

// Per-call options. `requestId` is stored on the audit rows; `pool` is a test seam
// (default: the fera_app pool); `attempts` bounds transient-conflict retries (default 3,
// tests use 1 so a deadlock fails instead of being retried away).
export type ServiceContext = { requestId?: string | null; pool?: Connectable; attempts?: number };

export const txOptions = (ctx: ServiceContext): TxOptions => ({ pool: ctx.pool, attempts: ctx.attempts });

// A step into confirmed, referred or closed is an officer's decision or closure (BR-001):
// no system, matcher, parent or staff actor may take it, whatever the caller.
export const OFFICER_ONLY_TARGETS: readonly CaseStatus[] = ["confirmed", "referred", "closed"];

export class StepAuthorityError extends Error {
  constructor() {
    super("only a verified officer's decision or closure may take this step");
    this.name = "StepAuthorityError";
  }
}

// App-level guard: an illegal step is E-005 before any statement runs.
export function assertTransition(kind: CaseKind, from: CaseStatus, to: CaseStatus): void {
  if (!isLegalTransition(kind, from, to)) throw new ApiError("E-005");
}

export type StatusChange = {
  to: CaseStatus;
  outcome?: Outcome; // closure only
  outcomeNote?: string; // closure only: the reviewed note (never audited)
  api?: ApiId;
  requestId?: string | null;
  audit?: { action: CaseAuditAction; details?: AuditDetails };
};

const TERMINAL: readonly CaseStatus[] = ["closed", "referred"];

// Applies one lifecycle step to a row this transaction has locked. closed_at is set on
// the terminal steps (closed, referred); outcome and note only on closure. The version
// is not bumped: versions count reviewed-payload edits, and candidates pin them.
export async function applyStatus(db: Queryable, actor: AuditActor, row: CaseRow, change: StatusChange): Promise<CaseRow> {
  if (OFFICER_ONLY_TARGETS.includes(change.to) && actor.type !== "officer") throw new StepAuthorityError();
  assertTransition(row.kind, row.status, change.to);
  const { rows } = await db.query(
    `UPDATE cases SET status = $2::case_status,
       closed_at = CASE WHEN $3::boolean THEN clock_timestamp() ELSE closed_at END,
       outcome = COALESCE($4::outcome_t, outcome),
       outcome_note = COALESCE($5::text, outcome_note)
     WHERE id = $1 RETURNING ${CASE_COLUMNS}`,
    [row.id, change.to, TERMINAL.includes(change.to), change.outcome ?? null, change.outcomeNote ?? null],
  );
  if (rows.length === 0) throw new ApiError("E-005");
  const next = mapCaseRow(rows[0]);
  await appendAudit(db, actor, {
    action: change.audit?.action ?? CASE_AUDIT_ACTIONS.caseStateChanged,
    caseId: row.id,
    requestId: change.requestId,
    details: {
      ref_code: row.ref_code,
      version: row.version,
      from_status: row.status,
      to_status: change.to,
      ...(change.api ? { api: change.api } : {}),
      ...change.audit?.details,
    },
  });
  return next;
}

// Walks legal steps one by one (each audited), e.g. open → matched_pending_review →
// confirmed when a decision lands on an endpoint the matcher left open.
export async function applyStatusPath(
  db: Queryable,
  actor: AuditActor,
  row: CaseRow,
  path: readonly CaseStatus[],
  change: Omit<StatusChange, "to">,
): Promise<CaseRow> {
  let current = row;
  for (const [i, to] of path.entries()) {
    const last = i === path.length - 1;
    current = await applyStatus(db, actor, current, last ? { ...change, to } : { api: change.api, requestId: change.requestId, to });
  }
  return current;
}

// Queue-state reconciliation (BR-012/013, BR-020, TC-053): each listed report in open or
// matched_pending_review moves to matched_pending_review when it has a pending candidate
// and back to open when none remain. Locks the reports itself (ascending UUID; a no-op
// for rows the caller already holds). Returns the IDs whose status changed.
//
// For the matcher (TASK-017): call inside the same withTransaction as the candidate
// inserts, after lockCases() on both endpoints, with SYSTEM_ACTOR or the requesting
// principal's actorFor(). Terminal, submitted and redacted reports are left alone.
export async function reconcileQueueState(
  db: Queryable,
  actor: AuditActor,
  caseIds: Iterable<string>,
  opts: { api?: ApiId; requestId?: string | null } = {},
): Promise<string[]> {
  const cases = await lockCases(db, caseIds);
  const pending = await pendingCandidatesFor(db, [...cases.keys()]);
  const changed: string[] = [];
  for (const [id, row] of cases) {
    if (row.anonymised_at !== null || !isQueueStatus(row.status)) continue;
    const hasPending = pending.some((c) => c.missing_case_id === id || c.found_case_id === id);
    const desired: CaseStatus = hasPending ? "matched_pending_review" : "open";
    if (desired === row.status) continue;
    await applyStatus(db, actor, row, { to: desired, api: opts.api, requestId: opts.requestId });
    changed.push(id);
  }
  return changed;
}

// submitted → open for the owner's new missing report (D2A §3.4 step 6: after embedding
// and duplicate checks). Idempotent: any other status is returned unchanged, so a
// replayed submission can call it again. The step is audited as `system`.
export async function openCase(principal: Principal, caseId: string, ctx: ServiceContext = {}): Promise<CaseRow> {
  if (effectiveRole(principal) !== "parent" || principal.kind !== "parent") throw new ApiError("E-003");
  return withTransaction(async (client) => {
    const peek = await getCaseRow(client, caseId);
    if (!peek) throw new ApiError("E-004");
    if (peek.kind !== "missing" || !sameId(peek.reporter_session_id, principal.sessionId)) throw new ApiError("E-004", { caseId: peek.id });
    const row = (await lockCases(client, [peek.id])).get(peek.id);
    if (!row || !sameId(row.reporter_session_id, principal.sessionId)) throw new ApiError("E-004", { caseId: peek.id });
    if (row.status !== "submitted") return row;
    return applyStatus(client, SYSTEM_ACTOR, row, { to: "open", api: "API-003", requestId: ctx.requestId });
  }, txOptions(ctx));
}
